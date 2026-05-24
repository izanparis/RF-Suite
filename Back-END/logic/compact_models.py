import os
import tempfile
import numpy as np
import skrf as rf
from scipy.optimize import least_squares
from scipy.signal import find_peaks
import warnings
from skrf.vectorFitting import VectorFitting
import base64
import io
import matplotlib.pyplot as plt

# ============================================================
# PARÁMETROS DE AJUSTE (Sincronizados con script v2)
# ============================================================
F_MAX_VALID = 3e9
W_Z = 1.0
W_Y = 0.15
USE_C_PRIOR = True
W_C_PRIOR = 0.25

# ============================================================
# FUNCIONES DE EXTRACCIÓN (Copia exacta de v2)
# ============================================================

def shunt_through_z_from_s21(s21, z0=50.0):
    eps = 1e-30
    return z0 * s21 / (2.0 * (1.0 - s21 + eps))

def moving_average(x, n=9):
    if n <= 1: return x
    return np.convolve(x, np.ones(n)/n, mode="same")

def local_log_slope(freq, y):
    lf = np.log10(freq)
    ly = np.log10(np.maximum(y, 1e-300))
    return np.gradient(ly, lf)

def detect_valid_fit_band(freq, zdut):
    magz = np.abs(zdut)
    phase = np.angle(zdut, deg=True)
    slope = local_log_slope(freq, moving_average(magz, 11))
    idx_srf = int(np.argmin(magz))
    f_srf = freq[idx_srf]
    
    # Búsqueda hacia atrás: queremos INCLUIR las frecuencias bajas. 
    # Solo paramos si la fase se vuelve inductiva (ej. > 0) a bajas frecuencias por ruido.
    idx_min = 0
    for i in range(idx_srf, -1, -1):
        if phase[i] > 0 and i < idx_srf - 5:
            idx_min = i + 1
            break
            
    # Búsqueda hacia adelante: avanzamos hasta que encontremos otra resonancia
    # (fase vuelve a caer a negativo después de haber sido inductiva)
    idx_max = len(freq) - 1
    for i in range(idx_srf, len(freq)):
        if phase[i] < -10 and i > idx_srf + 5: # Siguiente resonancia
            idx_max = i
            break
                
    # Medida de seguridad
    if idx_max <= idx_min + 5:
        idx_min = max(0, idx_srf - int(len(freq)*0.05))
        idx_max = min(len(freq) - 1, idx_srf + int(len(freq)*0.05))
        
    return idx_min, idx_max, f_srf, slope

def estimate_c_effective(freq, zdut, fit_mask):
    w = 2*np.pi*freq
    imz = np.imag(zdut)
    mask = fit_mask & (imz < 0)
    if np.count_nonzero(mask) < 5: mask = imz < 0
    c = -1/(w[mask]*imz[mask])
    c = c[np.isfinite(c)]
    c = c[(c > 1e-16) & (c < 1e-1)]
    if len(c) == 0: return 1e-12
    return float(np.median(c))

def estimate_srf(freq, zdut):
    idx = int(np.argmin(np.abs(zdut)))
    return float(freq[idx]), idx

def estimate_esr(freq, zdut, idx):
    i0 = max(0, idx-5); i1 = min(len(freq), idx+6)
    r = np.real(zdut[i0:i1])
    r = r[np.isfinite(r)]
    if len(r) == 0: return 0.1
    return float(max(np.median(np.abs(r)), 1e-5))

def estimate_esl(c_eff, f_srf):
    w0 = 2*np.pi*f_srf
    if c_eff <= 0 or f_srf <= 0: return 1e-9
    return float(1/(w0*w0*c_eff))

def classify_cap(c_eff):
    if c_eff < 10e-12: return "small_pF"
    elif c_eff < 1e-9: return "pF"
    elif c_eff < 100e-9: return "nF"
    return "uF"

def auto_limits_and_strategy(cap_class, c_eff, fmax):
    cfg = {}
    if cap_class == "small_pF":
        cfg.update({"CMAIN_MIN": max(c_eff/6, 0.02e-12), "CMAIN_MAX": min(c_eff*6, 80e-12), "LS_MIN": 0.01e-9, "LS_MAX": 30e-9, "RS_MIN": 1e-3, "RS_MAX": 100.0, "CP_MIN": 1e-17, "CP_MAX": 3e-12, "N_EXTRA": 0 if fmax < 1e9 else 1})
    elif cap_class == "pF":
        cfg.update({"CMAIN_MIN": max(c_eff/5, 0.5e-12), "CMAIN_MAX": min(c_eff*5, 3e-9), "LS_MIN": 0.02e-9, "LS_MAX": 80e-9, "RS_MIN": 1e-3, "RS_MAX": 100.0, "CP_MIN": 1e-17, "CP_MAX": 20e-12, "N_EXTRA": 1 if fmax <= 1e9 else 2})
    elif cap_class == "nF":
        cfg.update({"CMAIN_MIN": max(c_eff/8, 0.02e-9), "CMAIN_MAX": min(c_eff*8, 1e-6), "LS_MIN": 0.03e-9, "LS_MAX": 300e-9, "RS_MIN": 1e-4, "RS_MAX": 50.0, "CP_MIN": 1e-16, "CP_MAX": 300e-12, "N_EXTRA": 2 if fmax <= 1e9 else 3})
    else:
        cfg.update({"CMAIN_MIN": max(c_eff/10, 1e-9), "CMAIN_MAX": min(c_eff*10, 50e-3), "LS_MIN": 0.03e-9, "LS_MAX": 1e-6, "RS_MIN": 1e-5, "RS_MAX": 20.0, "CP_MIN": 1e-16, "CP_MAX": 1e-9, "N_EXTRA": 3 if fmax <= 1e9 else 4})
    cfg.update({"RP_MIN": 1e2, "RP_MAX": 1e14, "R_EXTRA_MIN": 1e-4, "R_EXTRA_MAX": 1e6, "L_EXTRA_MIN": 1e-13, "L_EXTRA_MAX": 20e-6, "C_EXTRA_MIN": 1e-17, "C_EXTRA_MAX": 20e-6})
    return cfg

def detect_extra_resonances(freq, zdut, f_srf, n_extra):
    if n_extra == 0: return []
    magz = np.abs(zdut); logmag = np.log10(np.maximum(magz, 1e-30)); smooth = moving_average(logmag, 11)
    peaks, _ = find_peaks(-smooth, prominence=0.02, distance=max(5, len(freq)//100))
    candidates = []
    for idx in peaks:
        f = freq[idx]
        if f > 1.25*f_srf and f <= freq[-1]: candidates.append((f, magz[idx]))
    candidates = sorted(candidates, key=lambda x: x[1])
    freqs = [f for f, _ in candidates[:n_extra]]
    if len(freqs) < n_extra:
        f_start = max(1.5*f_srf, freq[0]*2); f_stop = freq[-1]
        if f_stop > f_start:
            extra = np.geomspace(f_start, f_stop, n_extra+2)[1:-1]
            for f in extra:
                if all(abs(f-fc)/max(f, fc) > 0.2 for fc in freqs): freqs.append(float(f))
                if len(freqs) >= n_extra: break
    return freqs[:n_extra]

def unpack(p, n_extra):
    Rp, Cp, Rs, Ls, Cmain = p[:5]
    extras = []
    off = 5
    for k in range(n_extra): extras.append((p[off+3*k], p[off+3*k+1], p[off+3*k+2]))
    return Rp, Cp, Rs, Ls, Cmain, extras

def y_model(freq, p, n_extra):
    w = 2*np.pi*freq; s = 1j*w
    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)
    y = 1/Rp + s*Cp
    zmain = Rs + s*Ls + 1/(s*Cmain); y += 1/zmain
    for R, L, C in extras:
        z = R + s*L + 1/(s*C); y += 1/z
    return y

def residual(xlog, freq, zt, yt, n_extra, c_prior):
    p = 10**xlog
    yh = y_model(freq, p, n_extra); zh = 1/yh
    rz = (zh-zt)/np.maximum(np.abs(zt), 1e-12); ry = (yh-yt)/np.maximum(np.abs(yt), 1e-12)
    res = [W_Z*np.real(rz), W_Z*np.imag(rz), W_Y*np.real(ry), W_Y*np.imag(ry)]
    if USE_C_PRIOR and c_prior is not None and c_prior > 0:
        cmain = p[4]; res.append(np.array([W_C_PRIOR*np.log10(cmain/c_prior)]))
    return np.concatenate(res)

def initial_and_bounds(freq, zdut, ydut, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra):
    cmain = np.clip(c_eff, cfg["CMAIN_MIN"], cfg["CMAIN_MAX"])
    rs = np.clip(esr, cfg["RS_MIN"], cfg["RS_MAX"]); ls = np.clip(esl, cfg["LS_MIN"], cfg["LS_MAX"])
    w = 2*np.pi*freq; cest = np.imag(ydut)/w
    cpos = cest[(cest > cfg["CP_MIN"]) & (cest < cfg["CP_MAX"])]
    cp = np.percentile(cpos, 10) if len(cpos) else cfg["CP_MIN"]*10
    cp = np.clip(cp, cfg["CP_MIN"], cfg["CP_MAX"])
    g = np.real(ydut); gpos = g[(g > 0) & np.isfinite(g)]
    rp = 1/np.percentile(gpos, 10) if len(gpos) else 1e9
    rp = np.clip(rp, cfg["RP_MIN"], cfg["RP_MAX"])
    p0 = [rp, cp, rs, ls, cmain]
    n_extra = cfg["N_EXTRA"]
    for k in range(n_extra):
        f0 = f_extra[k] if k < len(f_extra) else np.geomspace(max(2*f_srf, freq[0]), freq[-1], n_extra+2)[k+1]
        w0 = 2*np.pi*f0
        if f0 > 2e9: ck = 0.05e-12
        elif f0 > 1e9: ck = 0.1e-12
        elif f0 > 300e6: ck = 0.5e-12
        else: ck = 1e-12
        lk = 1/(w0*w0*ck); rk = max(esr*10, 0.1)
        p0 += [np.clip(rk, cfg["R_EXTRA_MIN"], cfg["R_EXTRA_MAX"]), np.clip(lk, cfg["L_EXTRA_MIN"], cfg["L_EXTRA_MAX"]), np.clip(ck, cfg["C_EXTRA_MIN"], cfg["C_EXTRA_MAX"])]
    lo = [cfg["RP_MIN"], cfg["CP_MIN"], cfg["RS_MIN"], cfg["LS_MIN"], cfg["CMAIN_MIN"]]
    hi = [cfg["RP_MAX"], cfg["CP_MAX"], cfg["RS_MAX"], cfg["LS_MAX"], cfg["CMAIN_MAX"]]
    for _ in range(n_extra):
        lo += [cfg["R_EXTRA_MIN"], cfg["L_EXTRA_MIN"], cfg["C_EXTRA_MIN"]]
        hi += [cfg["R_EXTRA_MAX"], cfg["L_EXTRA_MAX"], cfg["C_EXTRA_MAX"]]
    return np.array(p0), np.array(lo), np.array(hi)

# ============================================================
# EXPORTACIÓN (Sincronizada con v2)
# ============================================================

def generate_shunt_spice(p, n_extra, subckt_name="CAP_AUTO_PHYSICAL_SHUNT"):
    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)
    lines = [
        "* Auto universal passive shunt capacitor model V2",
        "* Generated from 2-port shunt-through S2P",
        "* Terminals: P = shunt node, G = ground",
        f".SUBCKT {subckt_name} P G",
        "",
        f"RPAR P G {Rp:.12e}",
        f"CPAR P G {Cp:.12e}",
        "",
        f"RMAIN P N_MAIN_R {Rs:.12e}",
        f"LMAIN N_MAIN_R N_MAIN_L {Ls:.12e}",
        f"CMAIN N_MAIN_L G {Cmain:.12e}",
    ]
    for i, (R, L, C) in enumerate(extras, 1):
        lines += ["", f"REX{i} P N_EX{i}_R {R:.12e}", f"LEX{i} N_EX{i}_R N_EX{i}_L {L:.12e}", f"CEX{i} N_EX{i}_L G {C:.12e}"]
    lines += ["", f".ENDS {subckt_name}", "", f"* Example: XCAP node_shunt 0 {subckt_name}"]
    return "\n".join(lines)

# ============================================================
# VECTOR FITTING (Fiel a v4)
# ============================================================

def run_vf_analysis(freq, frequency_obj, zdut, z0=50.0):
    def z_to_s(z, z0): return (z - z0) / (z + z0)
    def s_to_z(gamma, z0): return z0 * (1 + gamma) / (1 - gamma + 1e-30)
    gamma = z_to_s(zdut, z0); ntwk = rf.Network(frequency=frequency_obj, s=gamma.reshape(-1, 1, 1), z0=z0)
    orders = [(1, 2), (1, 3), (1, 4), (2, 3), (2, 4), (2, 5), (3, 4)]; best = None
    for order in orders:
        try:
            vf = VectorFitting(ntwk)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                vf.vector_fit(n_poles_real=order[0], n_poles_cmplx=order[1], fit_constant=True, fit_proportional=False)
            zf = s_to_z(vf.get_model_response(0, 0, freq), z0)
            err = np.sqrt(np.mean(np.abs(zdut-zf)**2)) / np.sqrt(np.mean(np.abs(zdut)**2))
            if best is None or err < best["nrms_z"]: best = {"order": order, "vf": vf, "z_fit": zf, "nrms_z": err}
        except: continue
    return best

def generate_vf_spice(freq, z_fit, subckt_name="CAP_VECTOR_FIT_SHUNT"):
    y_fit = 1.0 / z_fit; s = 1j * 2 * np.pi * freq; ws = 2 * np.pi * np.sqrt(freq[0] * freq[-1]); x = s / ws
    order_num = 6; order_den = 6; A = []; rhs = []
    for xi, yi in zip(x, y_fit):
        row = [xi**k for k in range(order_num + 1)] + [-yi * xi**k for k in range(1, order_den + 1)]
        A.append(row); rhs.append(yi)
    coeffs, *_ = np.linalg.lstsq(np.array(A), np.array(rhs), rcond=None)
    b, a = coeffs[:order_num + 1], np.concatenate(([1.0 + 0j], coeffs[order_num + 1:]))
    def poly(coeffs):
        terms = []
        for k, c in enumerate(coeffs):
            c_use = np.real(c)
            if abs(c_use) < 1e-30: continue
            if k == 0: terms.append(f"({c_use:.16e})")
            elif k == 1: terms.append(f"({c_use:.16e})*(s/{ws:.16e})")
            else: terms.append(f"({c_use:.16e})*(s/{ws:.16e})**{k}")
        return " + ".join(terms) if terms else "0"
    num_expr = poly(b); den_expr = poly(a)
    lines = ["* ============================================================", "* Vector Fitting rational shunt model", "* I(P,G) = Y(s)*V(P,G)", "* Generated automatically from 2-port shunt-through S2P", "* Terminals: P = shunt node, G = ground", "* ============================================================", "", f".SUBCKT {subckt_name} P G", "", "* Laplace current source implementing fitted admittance", f"G_YFIT P G LAPLACE {{V(P,G)}} = {{ ({num_expr}) / ({den_expr}) }}", "", f".ENDS {subckt_name}", "", "* Example ADS/SPICE instance:", f"* XVF node_shunt 0 {subckt_name}", "* ============================================================"]
    return "\n".join(lines)

# ============================================================
# ENTRY POINT
# ============================================================

def sanitize_subckt_name(name):
    if not name: return "MODEL"
    base = os.path.splitext(name)[0]
    safe = "".join([c if c.isalnum() or c == '_' else '_' for c in base])
    if safe and safe[0].isdigit(): safe = "C_" + safe
    return safe.upper()

def plot_to_base64_v2():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close()
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def extract_compact_model(touchstone_content, filename, method="shunt", z0=50.0):
    with tempfile.NamedTemporaryFile(suffix=".s2p", delete=False) as tmp:
        tmp.write(touchstone_content); tmp_path = tmp.name
    try:
        ntwk = rf.Network(tmp_path)
    except Exception as e:
        raise ValueError(f"El archivo Touchstone no es válido o está corrupto: {e}")
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)
        
    if ntwk.nports < 2:
        raise ValueError("La extracción de modelos compactos requiere una medición de 2 puertos (.S2P) para modelar la transferencia (S21).")
    
    freq_full = ntwk.f; s21_full = ntwk.s[:, 1, 0]; mask = freq_full <= F_MAX_VALID
    freq_all = freq_full[mask]; s21_all = s21_full[mask]; zdut_all = shunt_through_z_from_s21(s21_all, z0); ydut_all = 1/zdut_all
    plots, spice_netlist, summary = [], "", {}; subckt_name = sanitize_subckt_name(filename)

    if method == "shunt":
        idx_min, idx_max, f_srf_full, _ = detect_valid_fit_band(freq_all, zdut_all); fit_slice = slice(idx_min, idx_max+1)
        freq = freq_all[fit_slice]; zdut = zdut_all[fit_slice]; ydut = ydut_all[fit_slice]
        f_srf, idx_srf = estimate_srf(freq, zdut); c_eff = estimate_c_effective(freq, zdut, np.ones_like(freq, dtype=bool))
        esr = estimate_esr(freq, zdut, idx_srf); esl = estimate_esl(c_eff, f_srf); cap_class = classify_cap(c_eff); cfg = auto_limits_and_strategy(cap_class, c_eff, freq[-1])
        
        best_p = None; best_nrms = float('inf'); best_n_extra = 0
        for n_ext in range(0, 6): # Bucle hasta 5 ramas
            cfg["N_EXTRA"] = n_ext
            f_extra = detect_extra_resonances(freq, zdut, f_srf, n_ext)
            p0, lo, hi = initial_and_bounds(freq, zdut, ydut, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra)
            p0_clipped = np.clip(p0, lo*1.001, hi/1.001)
            res = least_squares(residual, np.log10(p0_clipped), bounds=(np.log10(lo), np.log10(hi)), args=(freq, zdut, ydut, n_ext, c_eff), max_nfev=10000, xtol=1e-8, ftol=1e-8, gtol=1e-8)
            p = 10**res.x; zfit_current = 1/y_model(freq_all, p, n_ext)
            nrms = float(np.sqrt(np.mean(np.abs(zdut_all-zfit_current)**2)) / np.sqrt(np.mean(np.abs(zdut_all)**2)))
            
            if best_p is None or nrms < best_nrms * 0.95: # Requiere al menos 5% de mejora para justificar añadir rama
                best_nrms = nrms; best_p = p; best_n_extra = n_ext
                
            if best_nrms < 0.02: # Si el error es menor al 2%, el valor es aceptable
                break
                
        p = best_p; zfit_all = 1/y_model(freq_all, p, best_n_extra); spice_netlist = generate_shunt_spice(p, best_n_extra, subckt_name=subckt_name)
        summary = {"method": "Physical Shunt", "c_eff": c_eff, "nrms": best_nrms}
    elif method == "vf":
        best = run_vf_analysis(freq_all, ntwk[mask].frequency, zdut_all, z0); zfit_all = best["z_fit"]; spice_netlist = generate_vf_spice(freq_all, zfit_all, subckt_name=subckt_name)
        summary = {"method": "Vector Fitting", "c_eff": 1.0, "nrms": best["nrms_z"]}

    for fid, title, is_log in [("zmag", "Magnitud de Impedancia", True), ("zphase", "Fase de Impedancia", False)]:
        plt.figure(figsize=(8,5))
        if is_log: plt.loglog(freq_all/1e6, np.abs(zdut_all), 'b', label="Medida"); plt.loglog(freq_all/1e6, np.abs(zfit_all), 'r--', label="Modelo")
        else: plt.semilogx(freq_all/1e6, np.angle(zdut_all, deg=True), 'b', label="Medida"); plt.semilogx(freq_all/1e6, np.angle(zfit_all, deg=True), 'r--', label="Modelo")
        plt.grid(True, which="both", alpha=0.3); plt.xlabel("Frecuencia [MHz]"); plt.ylabel("Ohm" if is_log else "deg"); plt.legend(); plots.append({"id": fid, "title": title, "image": plot_to_base64_v2()})
    plt.figure(figsize=(8,5)); plt.plot(freq_all/1e6, 20*np.log10(np.abs(s21_all)), label="S21 Medida"); plt.grid(True, alpha=0.3); plt.xlabel("Frecuencia [MHz]"); plt.ylabel("dB"); plt.legend(); plots.append({"id": "s21", "title": "Parámetro S21", "image": plot_to_base64_v2()})
    return {"summary": summary, "plots": plots, "spice_netlist": spice_netlist, "data": {"freq_hz": freq_all.tolist(), "z_mag_meas": np.abs(zdut_all).tolist(), "z_mag_fit": np.abs(zfit_all).tolist()}}
