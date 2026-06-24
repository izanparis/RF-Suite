import os
import tempfile
import numpy as np
import skrf as rf
from scipy.optimize import least_squares, differential_evolution
from scipy.signal import find_peaks
import warnings
from skrf.vectorFitting import VectorFitting
import base64
import io
import matplotlib.pyplot as plt

# ============================================================
# PARÁMETROS DE AJUSTE
# ============================================================
W_Z = 1.0
W_Y = 0.15
USE_C_PRIOR = True
W_C_PRIOR = 0.25

# ============================================================
# EXTRACCIÓN DE Z SEGÚN TOPOLOGÍA DE MEDIDA
# ============================================================

def z_from_s_shunt(s21, z0=50.0):
    """Z_DUT from shunt-through (2-port): DUT in shunt between ports."""
    eps = 1e-30
    return z0 * s21 / (2.0 * (1.0 - s21 + eps))

def z_from_s_series(s21, z0=50.0):
    """Z_DUT from series-through (2-port): DUT in series between ports."""
    eps = 1e-30
    return 2.0 * z0 * (1.0 - s21) / (s21 + eps)

def z_from_s_oneport(s11, z0=50.0):
    """Z_DUT from 1-port reflection measurement."""
    eps = 1e-30
    return z0 * (1.0 + s11) / (1.0 - s11 + eps)

def extract_z_from_network(ntwk, topology="shunt", z0=50.0):
    """Extract DUT impedance from network based on measurement topology."""
    if ntwk.nports == 1 or topology == "oneport":
        s11 = ntwk.s[:, 0, 0]
        return z_from_s_oneport(s11, z0), ntwk.f
    else:
        s21 = ntwk.s[:, 1, 0]
        if topology == "series":
            return z_from_s_series(s21, z0), ntwk.f
        else:  # shunt (default for 2-port)
            return z_from_s_shunt(s21, z0), ntwk.f

# ============================================================
# FUNCIONES COMUNES
# ============================================================

def moving_average(x, n=9):
    if n <= 1: return x
    return np.convolve(x, np.ones(n)/n, mode="same")

def local_log_slope(freq, y):
    lf = np.log10(freq)
    ly = np.log10(np.maximum(y, 1e-300))
    return np.gradient(ly, lf)

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

# ============================================================
# MODELO FÍSICO — CONDENSADOR
# ============================================================

def detect_valid_fit_band(freq, zdut):
    magz = np.abs(zdut)
    phase = np.angle(zdut, deg=True)
    slope = local_log_slope(freq, moving_average(magz, 11))
    idx_srf = int(np.argmin(magz))
    f_srf = freq[idx_srf]
    
    idx_min = 0
    for i in range(idx_srf, -1, -1):
        if phase[i] > 0 and i < idx_srf - 5:
            idx_min = i + 1
            break
            
    idx_max = len(freq) - 1
    for i in range(idx_srf, len(freq)):
        if phase[i] < -10 and i > idx_srf + 5:
            idx_max = i
            break

    if idx_max <= idx_min + 5:
        idx_min = max(0, idx_srf - int(len(freq)*0.20))
        idx_max = min(len(freq) - 1, idx_srf + int(len(freq)*0.20))

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
    # Log-magnitude + phase residual: balanced across the full frequency range
    # This avoids the explosion near SRF where |Z| → 0
    mag_data = np.abs(zt); mag_model = np.abs(zh)
    eps_mag = np.maximum(mag_data, 1e-15)
    r_logmag = np.log10(mag_model / eps_mag)  # log10(|Z_model|/|Z_data|)
    r_phase = (np.angle(zh) - np.angle(zt)) / np.pi  # normalized to [-1, 1]
    res = [W_Z * r_logmag, W_Z * r_phase]
    # Add Y-space error for balance (also log-based)
    mag_y_data = np.abs(yt); mag_y_model = np.abs(yh)
    eps_y = np.maximum(mag_y_data, 1e-15)
    r_logmag_y = np.log10(mag_y_model / eps_y)
    res.append(W_Y * r_logmag_y)
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

def generate_cap_spice(p, n_extra, subckt_name="CAP_AUTO_PHYSICAL"):
    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)
    lines = [
        "* Auto universal passive capacitor model",
        "* Generated from S-parameter measurement",
        "* Terminals: P = signal node, G = ground",
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
    lines += ["", f".ENDS {subckt_name}", "", f"* Example: XCAP node_signal 0 {subckt_name}"]
    return "\n".join(lines)

# ============================================================
# MODELO FÍSICO — INDUCTOR (Foster equivalent)
# ============================================================

def detect_valid_fit_band_inductor(freq, zdut):
    """For inductors, SRF is at max |Z| (anti-resonance). Valid band is below SRF where phase > 0."""
    magz = np.abs(zdut)
    phase = np.angle(zdut, deg=True)
    idx_srf = int(np.argmax(magz))
    f_srf = freq[idx_srf]
    
    idx_min = 0
    for i in range(idx_srf, -1, -1):
        if phase[i] < 0 and i < idx_srf - 5:
            idx_min = i + 1
            break
    
    idx_max = len(freq) - 1
    for i in range(idx_srf, len(freq)):
        if phase[i] > 10 and i > idx_srf + 5:
            idx_max = i
            break
    
    if idx_max <= idx_min + 5:
        idx_min = max(0, idx_srf - int(len(freq)*0.20))
        idx_max = min(len(freq) - 1, idx_srf + int(len(freq)*0.20))

    return idx_min, idx_max, f_srf

def estimate_l_effective(freq, zdut, fit_mask):
    w = 2*np.pi*freq
    imz = np.imag(zdut)
    mask = fit_mask & (imz > 0)
    if np.count_nonzero(mask) < 5: mask = imz > 0
    l = imz[mask] / w[mask]
    l = l[np.isfinite(l)]
    l = l[(l > 1e-15) & (l < 10.0)]
    if len(l) == 0: return 1e-9
    return float(np.median(l))

def estimate_srf_inductor(freq, zdut):
    idx = int(np.argmax(np.abs(zdut)))
    return float(freq[idx]), idx

def estimate_dcr(freq, zdut):
    """Estimate DC resistance from lowest frequencies."""
    n_low = max(3, min(20, len(freq) // 10))
    r = np.real(zdut[:n_low])
    r = r[np.isfinite(r) & (r > 0)]
    if len(r) == 0: return 0.1
    return float(np.median(r))

def estimate_cp(l_eff, f_srf):
    w0 = 2*np.pi*f_srf
    if l_eff <= 0 or f_srf <= 0: return 1e-12
    return float(1/(w0*w0*l_eff))

def classify_ind(l_eff):
    if l_eff < 10e-9: return "small_nH"
    elif l_eff < 1e-6: return "nH"
    elif l_eff < 100e-6: return "uH"
    return "mH"

def auto_limits_and_strategy_ind(ind_class, l_eff, fmax):
    cfg = {}
    if ind_class == "small_nH":
        cfg.update({"LMAIN_MIN": max(l_eff/6, 0.1e-9), "LMAIN_MAX": min(l_eff*6, 100e-9), "RS_MIN": 1e-4, "RS_MAX": 10.0, "CP_MIN": 1e-17, "CP_MAX": 10e-12, "N_EXTRA": 0 if fmax < 1e9 else 1})
    elif ind_class == "nH":
        cfg.update({"LMAIN_MIN": max(l_eff/5, 1e-9), "LMAIN_MAX": min(l_eff*5, 10e-6), "RS_MIN": 1e-3, "RS_MAX": 50.0, "CP_MIN": 1e-16, "CP_MAX": 50e-12, "N_EXTRA": 1 if fmax <= 1e9 else 2})
    elif ind_class == "uH":
        cfg.update({"LMAIN_MIN": max(l_eff/8, 10e-9), "LMAIN_MAX": min(l_eff*8, 10e-3), "RS_MIN": 1e-3, "RS_MAX": 100.0, "CP_MIN": 1e-15, "CP_MAX": 1e-9, "N_EXTRA": 2 if fmax <= 1e9 else 3})
    else:
        cfg.update({"LMAIN_MIN": max(l_eff/10, 1e-6), "LMAIN_MAX": min(l_eff*10, 1.0), "RS_MIN": 1e-3, "RS_MAX": 200.0, "CP_MIN": 1e-14, "CP_MAX": 100e-9, "N_EXTRA": 3})
    cfg.update({"RP_MIN": 1e2, "RP_MAX": 1e14, "R_EXTRA_MIN": 1e-4, "R_EXTRA_MAX": 1e6, "L_EXTRA_MIN": 1e-13, "L_EXTRA_MAX": 20e-6, "C_EXTRA_MIN": 1e-17, "C_EXTRA_MAX": 20e-6})
    return cfg

def unpack_ind(p, n_extra):
    Rp, Cp, Rs, Lmain = p[:4]
    extras = []
    off = 4
    for k in range(n_extra): extras.append((p[off+3*k], p[off+3*k+1], p[off+3*k+2]))
    return Rp, Cp, Rs, Lmain, extras

def y_model_inductor(freq, p, n_extra):
    w = 2*np.pi*freq; s = 1j*w
    Rp, Cp, Rs, Lmain, extras = unpack_ind(p, n_extra)
    y = 1/Rp + s*Cp
    zmain = Rs + s*Lmain; y += 1/zmain
    for R, L, C in extras:
        z = R + s*L + 1/(s*C); y += 1/z
    return y

def residual_ind(xlog, freq, zt, yt, n_extra, l_prior):
    p = 10**xlog
    yh = y_model_inductor(freq, p, n_extra); zh = 1/yh
    rz = (zh-zt)/np.maximum(np.abs(zt), 1e-12); ry = (yh-yt)/np.maximum(np.abs(yt), 1e-12)
    res = [W_Z*np.real(rz), W_Z*np.imag(rz), W_Y*np.real(ry), W_Y*np.imag(ry)]
    if USE_C_PRIOR and l_prior is not None and l_prior > 0:
        lmain = p[3]; res.append(np.array([W_C_PRIOR*np.log10(lmain/l_prior)]))
    return np.concatenate(res)

def initial_and_bounds_ind(freq, zdut, ydut, cfg, l_eff, f_srf, idx_srf, dcr_val, cp_est, f_extra):
    lmain = np.clip(l_eff, cfg["LMAIN_MIN"], cfg["LMAIN_MAX"])
    rs = np.clip(dcr_val, cfg["RS_MIN"], cfg["RS_MAX"])
    cp = np.clip(cp_est, cfg["CP_MIN"], cfg["CP_MAX"])
    g = np.real(ydut); gpos = g[(g > 0) & np.isfinite(g)]
    rp = 1/np.percentile(gpos, 10) if len(gpos) else 1e9
    rp = np.clip(rp, cfg["RP_MIN"], cfg["RP_MAX"])
    p0 = [rp, cp, rs, lmain]
    n_extra = cfg["N_EXTRA"]
    for k in range(n_extra):
        f0 = f_extra[k] if k < len(f_extra) else np.geomspace(max(2*f_srf, freq[0]), freq[-1], n_extra+2)[k+1]
        w0 = 2*np.pi*f0
        ck = 0.1e-12; lk = 1/(w0*w0*ck); rk = max(dcr_val*10, 0.1)
        p0 += [np.clip(rk, cfg["R_EXTRA_MIN"], cfg["R_EXTRA_MAX"]), np.clip(lk, cfg["L_EXTRA_MIN"], cfg["L_EXTRA_MAX"]), np.clip(ck, cfg["C_EXTRA_MIN"], cfg["C_EXTRA_MAX"])]
    lo = [cfg["RP_MIN"], cfg["CP_MIN"], cfg["RS_MIN"], cfg["LMAIN_MIN"]]
    hi = [cfg["RP_MAX"], cfg["CP_MAX"], cfg["RS_MAX"], cfg["LMAIN_MAX"]]
    for _ in range(n_extra):
        lo += [cfg["R_EXTRA_MIN"], cfg["L_EXTRA_MIN"], cfg["C_EXTRA_MIN"]]
        hi += [cfg["R_EXTRA_MAX"], cfg["L_EXTRA_MAX"], cfg["C_EXTRA_MAX"]]
    return np.array(p0), np.array(lo), np.array(hi)

def generate_ind_spice(p, n_extra, subckt_name="IND_AUTO_PHYSICAL"):
    Rp, Cp, Rs, Lmain, extras = unpack_ind(p, n_extra)
    lines = [
        "* Auto universal passive inductor model (Foster)",
        "* Generated from S-parameter measurement",
        "* Terminals: P = signal node, G = ground",
        f".SUBCKT {subckt_name} P G",
        "",
        f"RPAR P G {Rp:.12e}",
        f"CPAR P G {Cp:.12e}",
        "",
        f"RMAIN P N_MAIN_R {Rs:.12e}",
        f"LMAIN N_MAIN_R G {Lmain:.12e}",
    ]
    for i, (R, L, C) in enumerate(extras, 1):
        lines += ["", f"REX{i} P N_EX{i}_R {R:.12e}", f"LEX{i} N_EX{i}_R N_EX{i}_L {L:.12e}", f"CEX{i} N_EX{i}_L G {C:.12e}"]
    lines += ["", f".ENDS {subckt_name}", "", f"* Example: XIND node_signal 0 {subckt_name}"]
    return "\n".join(lines)

# ============================================================
# VECTOR FITTING — State-of-the-Art (auto_fit + log spacing)
# ============================================================

def run_vf_analysis(freq, frequency_obj, zdut, z0=50.0):
    """Run Vector Fitting on the S-parameter (Gamma) representation.
    
    Primary: auto_fit with pole adding/skimming up to order 30.
    Fallback: manual sweep with higher orders and logarithmic pole spacing.
    """
    gamma = (zdut - z0) / (zdut + z0)
    ntwk = rf.Network(frequency=frequency_obj, s=gamma.reshape(-1, 1, 1), z0=z0)
    
    # Primary: auto_fit (iterative pole adding/skimming)
    try:
        vf = VectorFitting(ntwk)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            vf.auto_fit(model_order_max=30, target_error=0.02)
        gf = vf.get_model_response(0, 0, freq)
        zf = z0 * (1 + gf) / (1 - gf + 1e-30)
        err = float(np.sqrt(np.mean(np.abs(zdut - zf)**2)) / np.sqrt(np.mean(np.abs(zdut)**2)))
        return {"vf": vf, "z_fit": zf, "nrms_z": err}
    except Exception:
        pass
    
    # Fallback: manual sweep with log spacing and larger orders
    orders = [(2, 5), (2, 8), (4, 10), (6, 12), (4, 15)]
    best = None
    for order in orders:
        try:
            vf = VectorFitting(ntwk)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                vf.vector_fit(n_poles_real=order[0], n_poles_cmplx=order[1],
                             init_pole_spacing='log', fit_constant=True, fit_proportional=False)
            gf = vf.get_model_response(0, 0, freq)
            zf = z0 * (1 + gf) / (1 - gf + 1e-30)
            err = float(np.sqrt(np.mean(np.abs(zdut - zf)**2)) / np.sqrt(np.mean(np.abs(zdut)**2)))
            if best is None or err < best["nrms_z"]:
                best = {"vf": vf, "z_fit": zf, "nrms_z": err}
        except Exception:
            continue
    return best

def generate_vf_spice(vf, z0=50.0, subckt_name="VF_MODEL"):
    """Generate SPICE netlist from VF poles/residues.
    
    Constructs S11(s) as partial fraction expansion, then:
        Y(s) = (1/Z0) * (1 - S11(s)) / (1 + S11(s))
    
    Complex conjugate pole pairs are combined into real-coefficient 
    second-order sections to ensure all SPICE coefficients are real.
    """
    poles = vf.poles
    residues = vf.residues[0]  # (n_poles,) for 1-port
    d_coeff = float(np.real(vf.constant_coeff[0]))
    e_coeff = float(np.real(vf.proportional_coeff[0]))
    
    terms = []
    if abs(d_coeff) > 1e-30:
        terms.append(f"({d_coeff:.12e})")
    if abs(e_coeff) > 1e-30:
        terms.append(f"({e_coeff:.12e})*s")
    
    processed = set()
    for k in range(len(poles)):
        if k in processed:
            continue
        p_k = poles[k]
        r_k = residues[k]
        
        if np.abs(np.imag(p_k)) < 1e-6:
            # Real pole: r_k / (s - p_k)
            pr = float(np.real(p_k))
            rr = float(np.real(r_k))
            terms.append(f"({rr:.12e})/(s-({pr:.12e}))")
            processed.add(k)
        else:
            # Complex conjugate pair → real 2nd-order section:
            #   r/(s-p) + r*/(s-p*) = (2c·s - 2(cα+dβ)) / (s² - 2αs + α²+β²)
            alpha = float(np.real(p_k))
            beta = float(np.imag(p_k))
            c = float(np.real(r_k))
            d_c = float(np.imag(r_k))
            num_s = 2.0 * c
            num_const = -2.0 * (c * alpha + d_c * beta)
            den_s = -2.0 * alpha
            den_const = alpha**2 + beta**2
            terms.append(
                f"(({num_s:.12e})*s+({num_const:.12e}))"
                f"/(s*s+({den_s:.12e})*s+({den_const:.12e}))"
            )
            # Mark conjugate as processed
            for j in range(k+1, len(poles)):
                if j not in processed and np.abs(poles[j] - np.conj(p_k)) < 1e-6:
                    processed.add(j)
                    break
            processed.add(k)
    
    s11_expr = "+".join(terms) if terms else "0"
    y_expr = f"(1.0/{z0:.1f})*(1.0-({s11_expr}))/(1.0+({s11_expr}))"
    
    n_poles = len(poles)
    lines = [
        "* ============================================================",
        f"* Vector Fitting rational model ({n_poles} poles)",
        "* Y(s) = (1/Z0) * (1 - S11(s)) / (1 + S11(s))",
        "* Generated from scikit-rf VectorFitting auto_fit",
        "* Terminals: P = signal, G = ground",
        "* ============================================================",
        "",
        f".SUBCKT {subckt_name} P G",
        "",
        "* Laplace current source implementing fitted admittance",
        f"G_YFIT P G LAPLACE {{V(P,G)}} = {{ {y_expr} }}",
        "",
        f".ENDS {subckt_name}",
        "",
        f"* Example: X1 node_signal 0 {subckt_name}",
        "* ============================================================",
    ]
    return "\n".join(lines)

# ============================================================
# ENTRY POINT
# ============================================================

def extract_compact_model(touchstone_content, filename, method="physical", z0=50.0,
                          component_type="capacitor", topology="shunt"):
    """Extract a compact circuit model from a Touchstone S-parameter measurement.
    
    Parameters
    ----------
    touchstone_content : bytes
        Raw bytes of the .s1p/.s2p file.
    filename : str
        Original filename for naming the subcircuit.
    method : str
        'physical' for RLC fitting, 'vf' for Vector Fitting.
        Legacy alias: 'shunt' is treated as 'physical' with topology='shunt'.
    z0 : float
        Reference impedance (default 50 Ω).
    component_type : str
        'capacitor' or 'inductor'. Only used for method='physical'.
    topology : str
        'shunt', 'series', or 'oneport'. How the DUT was measured.
    
    Returns
    -------
    dict with keys: summary, plots, spice_netlist, data
    """
    # Legacy alias handling
    if method == "shunt":
        method = "physical"
        topology = "shunt"
    
    # Infer file suffix from filename or topology
    if filename and os.path.splitext(filename)[1].lower() in (".s1p", ".s2p", ".s3p", ".s4p"):
        tmp_suffix = os.path.splitext(filename)[1].lower()
    else:
        tmp_suffix = ".s1p" if topology == "oneport" else ".s2p"
    with tempfile.NamedTemporaryFile(suffix=tmp_suffix, delete=False) as tmp:
        tmp.write(touchstone_content); tmp_path = tmp.name
    try:
        ntwk = rf.Network(tmp_path)
    except Exception as e:
        # Retry with alternative suffix in case user mislabelled topology
        alt_suffix = ".s2p" if tmp_suffix == ".s1p" else ".s1p"
        try:
            with tempfile.NamedTemporaryFile(suffix=alt_suffix, delete=False) as tmp2:
                tmp2.write(touchstone_content); tmp_path2 = tmp2.name
            ntwk = rf.Network(tmp_path2)
            if os.path.exists(tmp_path2): os.remove(tmp_path2)
            # Adjust topology if nports doesn't match
        except Exception:
            if os.path.exists(tmp_path): os.remove(tmp_path)
            raise ValueError(f"El archivo Touchstone no es válido o está corrupto: {e}")
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)

    # Validate port count vs topology
    if ntwk.nports < 2 and topology in ("shunt", "series"):
        topology = "oneport"
    
    # Extract Z based on topology
    zdut_all, freq_all = extract_z_from_network(ntwk, topology, z0)
    ydut_all = 1.0 / zdut_all
    
    plots, spice_netlist, summary = [], "", {}
    subckt_name = sanitize_subckt_name(filename)
    
    if method == "physical":
        if component_type == "inductor":
            # ---- INDUCTOR PHYSICAL FIT ----
            idx_min, idx_max, f_srf_full = detect_valid_fit_band_inductor(freq_all, zdut_all)
            fit_slice = slice(idx_min, idx_max + 1)
            freq = freq_all[fit_slice]; zdut = zdut_all[fit_slice]; ydut = ydut_all[fit_slice]
            
            f_srf, idx_srf = estimate_srf_inductor(freq, zdut)
            l_eff = estimate_l_effective(freq, zdut, np.ones_like(freq, dtype=bool))
            dcr_val = estimate_dcr(freq, zdut)
            cp_est = estimate_cp(l_eff, f_srf)
            ind_class = classify_ind(l_eff)
            cfg = auto_limits_and_strategy_ind(ind_class, l_eff, freq_all[-1])
            
            # Adaptive frequency limit for inductor: fit up to 10x SRF
            f_max_fit = min(freq_all[-1], 10.0 * f_srf_full)
            fit_mask_all = freq_all <= f_max_fit
            freq_fit = freq_all[fit_mask_all]; zdut_fit = zdut_all[fit_mask_all]; ydut_fit = ydut_all[fit_mask_all]
            
            best_p = None; best_nrms = float('inf'); best_n_extra = 0
            for n_ext in range(0, 6):
                cfg["N_EXTRA"] = n_ext
                f_extra = detect_extra_resonances(freq_fit, zdut_fit, f_srf, n_ext)
                p0, lo, hi = initial_and_bounds_ind(freq, zdut, ydut, cfg, l_eff, f_srf, idx_srf, dcr_val, cp_est, f_extra)
                p0_clipped = np.clip(p0, lo*1.001, hi/1.001)
                try:
                    res = least_squares(residual_ind, np.log10(p0_clipped), bounds=(np.log10(lo), np.log10(hi)),
                                       args=(freq_fit, zdut_fit, ydut_fit, n_ext, l_eff), max_nfev=10000, xtol=1e-8, ftol=1e-8, gtol=1e-8)
                    p = 10**res.x; zfit_current = 1/y_model_inductor(freq_fit, p, n_ext)
                    nrms = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_current)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                    if best_p is None or nrms < best_nrms * 0.95:
                        best_nrms = nrms; best_p = p; best_n_extra = n_ext
                    if best_nrms < 0.02:
                        break
                except Exception:
                    continue

            # Random restarts when optimizer may be stuck in a local minimum
            if best_p is not None and best_nrms > 0.15:
                rng = np.random.default_rng(42)
                cfg["N_EXTRA"] = best_n_extra
                f_extra_r = detect_extra_resonances(freq_fit, zdut_fit, f_srf, best_n_extra)
                _, lo_r, hi_r = initial_and_bounds_ind(freq, zdut, ydut, cfg, l_eff, f_srf, idx_srf, dcr_val, cp_est, f_extra_r)
                lo_log_r = np.log10(lo_r); hi_log_r = np.log10(hi_r)
                for _ in range(12):
                    p0_r = rng.uniform(lo_log_r + 0.01, hi_log_r - 0.01)
                    try:
                        res_r = least_squares(residual_ind, p0_r, bounds=(lo_log_r, hi_log_r),
                                             args=(freq_fit, zdut_fit, ydut_fit, best_n_extra, l_eff),
                                             max_nfev=6000, xtol=1e-7, ftol=1e-7, gtol=1e-7)
                        p_r = 10**res_r.x; zfit_r = 1/y_model_inductor(freq_fit, p_r, best_n_extra)
                        nrms_r = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_r)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                        if nrms_r < best_nrms:
                            best_nrms = nrms_r; best_p = p_r
                        if best_nrms < 0.05:
                            break
                    except Exception:
                        continue

            # DE global para inductor cuando NRMS > 10 %
            if best_nrms > 0.10:
                try:
                    cfg["N_EXTRA"] = best_n_extra
                    f_extra_de_i = detect_extra_resonances(freq_fit, zdut_fit, f_srf, best_n_extra)
                    _, lo_de_i, hi_de_i = initial_and_bounds_ind(freq, zdut, ydut, cfg, l_eff, f_srf, idx_srf, dcr_val, cp_est, f_extra_de_i)
                    lo_log_de_i = np.log10(lo_de_i); hi_log_de_i = np.log10(hi_de_i)
                    bounds_de_i = [(lo_log_de_i[i], hi_log_de_i[i]) for i in range(len(lo_log_de_i))]

                    def _obj_de_i(xlog):
                        return float(np.sum(residual_ind(xlog, freq_fit, zdut_fit, ydut_fit, best_n_extra, l_eff)**2))

                    de_res_i = differential_evolution(
                        _obj_de_i, bounds_de_i, seed=0,
                        maxiter=300, popsize=12, tol=1e-4,
                        mutation=(0.5, 1.5), recombination=0.7,
                        workers=1, polish=False,
                    )
                    res_pol_i = least_squares(residual_ind, de_res_i.x, bounds=(lo_log_de_i, hi_log_de_i),
                                              args=(freq_fit, zdut_fit, ydut_fit, best_n_extra, l_eff),
                                              max_nfev=8000, xtol=1e-10, ftol=1e-10, gtol=1e-10)
                    p_de_i = 10**res_pol_i.x
                    zfit_de_i = 1/y_model_inductor(freq_fit, p_de_i, best_n_extra)
                    nrms_de_i = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_de_i)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                    if nrms_de_i < best_nrms:
                        best_nrms = nrms_de_i; best_p = p_de_i
                except Exception:
                    pass

            if best_p is None:
                raise ValueError("No se pudo ajustar el modelo de inductor. Revise los datos de entrada.")
            
            p = best_p; zfit_all = 1/y_model_inductor(freq_all, p, best_n_extra)
            spice_netlist = generate_ind_spice(p, best_n_extra, subckt_name=subckt_name)
            summary = {"method": "Physical Inductor", "l_eff": l_eff, "component_type": "inductor", "nrms": best_nrms}
        
        else:
            # ---- CAPACITOR PHYSICAL FIT ----
            idx_min, idx_max, f_srf_full, _ = detect_valid_fit_band(freq_all, zdut_all)
            fit_slice = slice(idx_min, idx_max + 1)
            freq = freq_all[fit_slice]; zdut = zdut_all[fit_slice]; ydut = ydut_all[fit_slice]
            f_srf, idx_srf = estimate_srf(freq, zdut)
            # Use all pre-SRF data for a more robust c_eff estimate
            pre_srf_mask = freq_all < f_srf_full
            if np.count_nonzero(pre_srf_mask) >= 5:
                c_eff = estimate_c_effective(freq_all[pre_srf_mask], zdut_all[pre_srf_mask], np.ones(pre_srf_mask.sum(), dtype=bool))
            else:
                c_eff = estimate_c_effective(freq, zdut, np.ones_like(freq, dtype=bool))
            esr = estimate_esr(freq, zdut, idx_srf)
            esl = estimate_esl(c_eff, f_srf)
            cap_class = classify_cap(c_eff)

            # Adaptive frequency limit: fit up to 10x SRF
            f_max_fit = min(freq_all[-1], 10.0 * f_srf_full)
            fit_mask_all = freq_all <= f_max_fit
            freq_fit = freq_all[fit_mask_all]; zdut_fit = zdut_all[fit_mask_all]; ydut_fit = ydut_all[fit_mask_all]
            cfg = auto_limits_and_strategy(cap_class, c_eff, f_max_fit)

            best_p = None; best_nrms = float('inf'); best_n_extra = 0
            for n_ext in range(0, 6):
                cfg["N_EXTRA"] = n_ext
                f_extra = detect_extra_resonances(freq_fit, zdut_fit, f_srf_full, n_ext)
                p0, lo, hi = initial_and_bounds(freq_fit, zdut_fit, ydut_fit, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra)
                p0_clipped = np.clip(p0, lo*1.001, hi/1.001)
                try:
                    res = least_squares(residual, np.log10(p0_clipped), bounds=(np.log10(lo), np.log10(hi)),
                                       args=(freq_fit, zdut_fit, ydut_fit, n_ext, c_eff), max_nfev=10000, xtol=1e-8, ftol=1e-8, gtol=1e-8)
                    p = 10**res.x; zfit_current = 1/y_model(freq_fit, p, n_ext)
                    nrms = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_current)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                    if best_p is None or nrms < best_nrms * 0.95:
                        best_nrms = nrms; best_p = p; best_n_extra = n_ext
                    if best_nrms < 0.02:
                        break
                except Exception:
                    continue

            # Random restarts when optimizer may be stuck in a local minimum
            if best_p is not None and best_nrms > 0.15:
                rng = np.random.default_rng(42)
                cfg["N_EXTRA"] = best_n_extra
                f_extra_r = detect_extra_resonances(freq_fit, zdut_fit, f_srf_full, best_n_extra)
                _, lo_r, hi_r = initial_and_bounds(freq_fit, zdut_fit, ydut_fit, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra_r)
                lo_log_r = np.log10(lo_r); hi_log_r = np.log10(hi_r)
                for _ in range(12):
                    p0_r = rng.uniform(lo_log_r + 0.01, hi_log_r - 0.01)
                    try:
                        res_r = least_squares(residual, p0_r, bounds=(lo_log_r, hi_log_r),
                                             args=(freq_fit, zdut_fit, ydut_fit, best_n_extra, c_eff),
                                             max_nfev=6000, xtol=1e-7, ftol=1e-7, gtol=1e-7)
                        p_r = 10**res_r.x; zfit_r = 1/y_model(freq_fit, p_r, best_n_extra)
                        nrms_r = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_r)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                        if nrms_r < best_nrms:
                            best_nrms = nrms_r; best_p = p_r
                        if best_nrms < 0.05:
                            break
                    except Exception:
                        continue

            # Búsqueda global con differential_evolution cuando NRMS > 10 %
            # DE explora el espacio completo de parámetros antes de pulir con LS.
            if best_nrms > 0.10:
                try:
                    cfg["N_EXTRA"] = best_n_extra
                    f_extra_de = detect_extra_resonances(freq_fit, zdut_fit, f_srf_full, best_n_extra)
                    _, lo_de, hi_de = initial_and_bounds(freq_fit, zdut_fit, ydut_fit, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra_de)
                    lo_log_de = np.log10(lo_de); hi_log_de = np.log10(hi_de)
                    bounds_de = [(lo_log_de[i], hi_log_de[i]) for i in range(len(lo_log_de))]

                    def _obj_de(xlog):
                        return float(np.sum(residual(xlog, freq_fit, zdut_fit, ydut_fit, best_n_extra, c_eff)**2))

                    de_res = differential_evolution(
                        _obj_de, bounds_de, seed=0,
                        maxiter=300, popsize=12, tol=1e-4,
                        mutation=(0.5, 1.5), recombination=0.7,
                        workers=1, polish=False,
                    )
                    # Pulir el mejor resultado DE con least_squares
                    res_pol = least_squares(residual, de_res.x, bounds=(lo_log_de, hi_log_de),
                                            args=(freq_fit, zdut_fit, ydut_fit, best_n_extra, c_eff),
                                            max_nfev=8000, xtol=1e-10, ftol=1e-10, gtol=1e-10)
                    p_de = 10**res_pol.x
                    zfit_de = 1/y_model(freq_fit, p_de, best_n_extra)
                    nrms_de = float(np.sqrt(np.mean(np.abs(zdut_fit - zfit_de)**2)) / np.sqrt(np.mean(np.abs(zdut_fit)**2)))
                    if nrms_de < best_nrms:
                        best_nrms = nrms_de; best_p = p_de
                except Exception:
                    pass

            if best_p is None:
                raise ValueError("No se pudo ajustar el modelo de condensador. Revise los datos de entrada.")
            
            p = best_p; zfit_all = 1/y_model(freq_all, p, best_n_extra)
            nrms_full = float(np.sqrt(np.mean(np.abs(zdut_all - zfit_all)**2)) /
                              np.sqrt(np.mean(np.abs(zdut_all)**2)))
            spice_netlist = generate_cap_spice(p, best_n_extra, subckt_name=subckt_name)
            summary = {"method": "Physical Capacitor", "c_eff": c_eff, "component_type": "capacitor", "nrms": nrms_full}
    
    elif method == "vf":
        # ---- VECTOR FITTING (works for both capacitors and inductors) ----
        best = run_vf_analysis(freq_all, ntwk.frequency, zdut_all, z0)
        if best is None:
            raise ValueError("Vector Fitting no convergió. Revise los datos de entrada.")
        zfit_all = best["z_fit"]
        spice_netlist = generate_vf_spice(best["vf"], z0=z0, subckt_name=subckt_name)
        summary = {"method": "Vector Fitting", "component_type": component_type, "nrms": best["nrms_z"]}
    
    else:
        raise ValueError(f"Método desconocido: {method}. Use 'physical' o 'vf'.")
    
    # ---- PLOTS ----
    s21_data = None
    if ntwk.nports >= 2:
        s21_data = ntwk.s[:, 1, 0]
    
    for fid, title, is_log in [("zmag", "Magnitud de Impedancia", True), ("zphase", "Fase de Impedancia", False)]:
        plt.figure(figsize=(8, 5))
        if is_log:
            plt.loglog(freq_all/1e6, np.abs(zdut_all), 'b', label="Medida")
            plt.loglog(freq_all/1e6, np.abs(zfit_all), 'r--', label="Modelo")
        else:
            plt.semilogx(freq_all/1e6, np.angle(zdut_all, deg=True), 'b', label="Medida")
            plt.semilogx(freq_all/1e6, np.angle(zfit_all, deg=True), 'r--', label="Modelo")
        plt.grid(True, which="both", alpha=0.3)
        plt.xlabel("Frecuencia [MHz]")
        plt.ylabel("Ohm" if is_log else "deg")
        plt.legend()
        plots.append({"id": fid, "title": title, "image": plot_to_base64_v2()})
    
    if s21_data is not None:
        plt.figure(figsize=(8, 5))
        plt.plot(freq_all/1e6, 20*np.log10(np.abs(s21_data[:len(freq_all)])), label="S21 Medida")
        plt.grid(True, alpha=0.3); plt.xlabel("Frecuencia [MHz]"); plt.ylabel("dB"); plt.legend()
        plots.append({"id": "s21", "title": "Parámetro S21", "image": plot_to_base64_v2()})
    elif ntwk.nports == 1:
        s11_data = ntwk.s[:, 0, 0]
        plt.figure(figsize=(8, 5))
        plt.plot(freq_all/1e6, 20*np.log10(np.abs(s11_data[:len(freq_all)])), label="S11 Medida")
        plt.grid(True, alpha=0.3); plt.xlabel("Frecuencia [MHz]"); plt.ylabel("dB"); plt.legend()
        plots.append({"id": "s11", "title": "Parámetro S11", "image": plot_to_base64_v2()})
    
    return {
        "summary": summary,
        "plots": plots,
        "spice_netlist": spice_netlist,
        "data": {
            "freq_hz": freq_all.tolist(),
            "z_mag_meas": np.abs(zdut_all).tolist(),
            "z_mag_fit": np.abs(zfit_all).tolist(),
        }
    }
