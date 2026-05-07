"""
auto_universal_shunt_capacitor_model_v2.py

Versión mejorada del modelo automático para capacitores en medida 2-port shunt-through.

Mejora principal:
- Detecta automáticamente la banda útil de ajuste.
- Ignora zonas donde la impedancia extraída no se comporta físicamente como capacitor,
  por ejemplo mesetas de alta impedancia a baja frecuencia debidas a límite de sensibilidad
  de la técnica shunt-through.
- Ajusta el modelo solo en la banda válida, pero grafica banda completa.

Válido para:
- Capacitores shunt medidos con S2P.
- Rango hasta 3 GHz.
- Capacitores pF/nF/uF, siempre que la medida tenga una zona útil clara.

Requisitos:
    pip install numpy scipy matplotlib scikit-rf
"""

import numpy as np
import matplotlib.pyplot as plt
import skrf as rf
from scipy.optimize import least_squares
from scipy.signal import find_peaks
from pathlib import Path


# ============================================================
# USUARIO
# ============================================================

S2P_FILE = "1uF_100-1000MHz_1000pts.s2p"
Z0 = 50.0

F_MAX_VALID = 3e9

SUBCKT_NAME = "CAP_AUTO_PHYSICAL_SHUNT"
TXT_FILENAME = "auto_cap_model_values.txt"
SPICE_FILENAME = "auto_cap_model_ads.cir"
NPZ_FILENAME = "auto_cap_model_results.npz"

# Si conoces la capacitancia nominal, ponla aquí.
# Si lo dejas en None, se estima automáticamente.
C_NOMINAL_OVERRIDE = None
# Ejemplo:
# C_NOMINAL_OVERRIDE = 100e-12

# Ajuste automático de banda válida
AUTO_FIT_BAND = True

# Si AUTO_FIT_BAND=False, puedes forzar banda manual:
FIT_FMIN_MANUAL = None
FIT_FMAX_MANUAL = None

# Pesos de error
W_Z = 1.0
W_Y = 0.15

# Penalización suave para favorecer Cmain cercana a la estimación
USE_C_PRIOR = True
W_C_PRIOR = 0.25


# ============================================================
# FUNCIONES BÁSICAS
# ============================================================

def shunt_through_z_from_s21(s21, z0=50.0):
    eps = 1e-30
    return z0 * s21 / (2.0 * (1.0 - s21 + eps))


def rms(a, b):
    return np.sqrt(np.mean(np.abs(a-b)**2))


def nrms(a, b):
    den = np.sqrt(np.mean(np.abs(a)**2))
    return rms(a, b) / den if den > 0 else np.inf


def moving_average(x, n=9):
    if n <= 1:
        return x
    return np.convolve(x, np.ones(n)/n, mode="same")


def local_log_slope(freq, y):
    """
    Pendiente local d(log10(y))/d(log10(f)).
    """
    lf = np.log10(freq)
    ly = np.log10(np.maximum(y, 1e-300))
    return np.gradient(ly, lf)


# ============================================================
# DETECCIÓN DE BANDA ÚTIL
# ============================================================

def detect_valid_fit_band(freq, zdut):
    """
    Detecta banda útil para ajuste de capacitor shunt.

    Busca la primera zona donde:
    - |Z| empieza a caer con pendiente capacitiva cercana a -1 en log-log
    - o la fase de Z es claramente capacitiva
    - evita mesetas de baja frecuencia por límite de medida
    """
    magz = np.abs(zdut)
    phase = np.angle(zdut, deg=True)
    slope = local_log_slope(freq, moving_average(magz, 11))

    idx_srf = int(np.argmin(magz))
    f_srf = freq[idx_srf]

    # Zona candidata antes de SRF
    pre = np.arange(len(freq)) < max(idx_srf, 5)

    # Condición de comportamiento capacitivo útil
    capacitive_slope = slope < -0.55
    capacitive_phase = phase < -35

    good = pre & (capacitive_slope | capacitive_phase)

    if np.any(good):
        first = np.where(good)[0][0]
        # Dar un poco de margen hacia abajo si no vuelve a ser meseta
        idx_min = max(0, first - 2)
    else:
        # Si no se detecta, usar desde 1% de la banda hasta final
        idx_min = max(0, len(freq)//50)

    # fmax de ajuste: incluir hasta la banda completa,
    # pero si hay mucho ruido al final, se mantiene hasta F_MAX_VALID.
    idx_max = len(freq) - 1

    # Evitar ajustar puntos por debajo de 100 Hz o frecuencias degeneradas
    return idx_min, idx_max, f_srf, slope


# ============================================================
# ESTIMACIONES
# ============================================================

def estimate_c_effective(freq, zdut, fit_mask):
    """
    Estima C usando solo la banda válida capacitiva.
    """
    w = 2*np.pi*freq
    imz = np.imag(zdut)

    mask = fit_mask & (imz < 0)

    if np.count_nonzero(mask) < 5:
        mask = imz < 0

    c = -1/(w[mask]*imz[mask])
    c = c[np.isfinite(c)]
    c = c[(c > 1e-16) & (c < 1e-1)]

    if len(c) == 0:
        return 1e-12

    return float(np.median(c))


def estimate_srf(freq, zdut):
    idx = int(np.argmin(np.abs(zdut)))
    return float(freq[idx]), idx


def estimate_esr(freq, zdut, idx):
    i0 = max(0, idx-5)
    i1 = min(len(freq), idx+6)
    r = np.real(zdut[i0:i1])
    r = r[np.isfinite(r)]
    if len(r) == 0:
        return 0.1
    return float(max(np.median(np.abs(r)), 1e-5))


def estimate_esl(c_eff, f_srf):
    w0 = 2*np.pi*f_srf
    if c_eff <= 0 or f_srf <= 0:
        return 1e-9
    return float(1/(w0*w0*c_eff))


def classify_cap(c_eff):
    if c_eff < 10e-12:
        return "small_pF"
    elif c_eff < 1e-9:
        return "pF"
    elif c_eff < 100e-9:
        return "nF"
    return "uF"


def auto_limits_and_strategy(cap_class, c_eff, fmax):
    cfg = {}

    if cap_class == "small_pF":
        cfg["CMAIN_MIN"] = max(c_eff/6, 0.02e-12)
        cfg["CMAIN_MAX"] = min(c_eff*6, 80e-12)
        cfg["LS_MIN"] = 0.01e-9
        cfg["LS_MAX"] = 30e-9
        cfg["RS_MIN"] = 1e-3
        cfg["RS_MAX"] = 100.0
        cfg["CP_MIN"] = 1e-17
        cfg["CP_MAX"] = 3e-12
        cfg["N_EXTRA"] = 0 if fmax < 1e9 else 1

    elif cap_class == "pF":
        cfg["CMAIN_MIN"] = max(c_eff/5, 0.5e-12)
        cfg["CMAIN_MAX"] = min(c_eff*5, 3e-9)
        cfg["LS_MIN"] = 0.02e-9
        cfg["LS_MAX"] = 80e-9
        cfg["RS_MIN"] = 1e-3
        cfg["RS_MAX"] = 100.0
        cfg["CP_MIN"] = 1e-17
        cfg["CP_MAX"] = 20e-12
        cfg["N_EXTRA"] = 1 if fmax <= 1e9 else 2

    elif cap_class == "nF":
        cfg["CMAIN_MIN"] = max(c_eff/8, 0.02e-9)
        cfg["CMAIN_MAX"] = min(c_eff*8, 1e-6)
        cfg["LS_MIN"] = 0.03e-9
        cfg["LS_MAX"] = 300e-9
        cfg["RS_MIN"] = 1e-4
        cfg["RS_MAX"] = 50.0
        cfg["CP_MIN"] = 1e-16
        cfg["CP_MAX"] = 300e-12
        cfg["N_EXTRA"] = 2 if fmax <= 1e9 else 3

    else:
        cfg["CMAIN_MIN"] = max(c_eff/10, 1e-9)
        cfg["CMAIN_MAX"] = min(c_eff*10, 50e-3)
        cfg["LS_MIN"] = 0.03e-9
        cfg["LS_MAX"] = 1e-6
        cfg["RS_MIN"] = 1e-5
        cfg["RS_MAX"] = 20.0
        cfg["CP_MIN"] = 1e-16
        cfg["CP_MAX"] = 1e-9
        cfg["N_EXTRA"] = 3 if fmax <= 1e9 else 4

    cfg["RP_MIN"] = 1e2
    cfg["RP_MAX"] = 1e14

    cfg["R_EXTRA_MIN"] = 1e-4
    cfg["R_EXTRA_MAX"] = 1e6
    cfg["L_EXTRA_MIN"] = 1e-13
    cfg["L_EXTRA_MAX"] = 20e-6
    cfg["C_EXTRA_MIN"] = 1e-17
    cfg["C_EXTRA_MAX"] = 20e-6

    return cfg


def detect_extra_resonances(freq, zdut, f_srf, n_extra):
    if n_extra == 0:
        return []

    magz = np.abs(zdut)
    logmag = np.log10(np.maximum(magz, 1e-30))
    smooth = moving_average(logmag, 11)

    peaks, _ = find_peaks(
        -smooth,
        prominence=0.02,
        distance=max(5, len(freq)//100)
    )

    candidates = []
    for idx in peaks:
        f = freq[idx]
        if f > 1.25*f_srf and f <= freq[-1]:
            candidates.append((f, magz[idx]))

    candidates = sorted(candidates, key=lambda x: x[1])
    freqs = [f for f, _ in candidates[:n_extra]]

    if len(freqs) < n_extra:
        f_start = max(1.5*f_srf, freq[0]*2)
        f_stop = freq[-1]
        if f_stop > f_start:
            extra = np.geomspace(f_start, f_stop, n_extra+2)[1:-1]
            for f in extra:
                if all(abs(f-fc)/max(f, fc) > 0.2 for fc in freqs):
                    freqs.append(float(f))
                if len(freqs) >= n_extra:
                    break

    return freqs[:n_extra]


# ============================================================
# MODELO
# ============================================================

def unpack(p, n_extra):
    Rp, Cp, Rs, Ls, Cmain = p[:5]
    extras = []
    off = 5
    for k in range(n_extra):
        extras.append((p[off+3*k], p[off+3*k+1], p[off+3*k+2]))
    return Rp, Cp, Rs, Ls, Cmain, extras


def y_model(freq, p, n_extra):
    w = 2*np.pi*freq
    s = 1j*w

    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)

    y = 1/Rp + s*Cp

    zmain = Rs + s*Ls + 1/(s*Cmain)
    y += 1/zmain

    for R, L, C in extras:
        z = R + s*L + 1/(s*C)
        y += 1/z

    return y


def residual(xlog, freq, zt, yt, n_extra, c_prior):
    p = 10**xlog
    yh = y_model(freq, p, n_extra)
    zh = 1/yh

    rz = (zh-zt)/np.maximum(np.abs(zt), 1e-12)
    ry = (yh-yt)/np.maximum(np.abs(yt), 1e-12)

    res = [W_Z*np.real(rz), W_Z*np.imag(rz), W_Y*np.real(ry), W_Y*np.imag(ry)]

    if USE_C_PRIOR and c_prior is not None and c_prior > 0:
        cmain = p[4]
        res.append(np.array([W_C_PRIOR*np.log10(cmain/c_prior)]))

    return np.concatenate(res)


# ============================================================
# INICIALIZACIÓN
# ============================================================

def initial_and_bounds(freq, zdut, ydut, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra):
    cmain = C_NOMINAL_OVERRIDE if C_NOMINAL_OVERRIDE is not None else c_eff
    cmain = np.clip(cmain, cfg["CMAIN_MIN"], cfg["CMAIN_MAX"])

    rs = np.clip(esr, cfg["RS_MIN"], cfg["RS_MAX"])
    ls = np.clip(esl, cfg["LS_MIN"], cfg["LS_MAX"])

    w = 2*np.pi*freq
    cest = np.imag(ydut)/w
    cpos = cest[(cest > cfg["CP_MIN"]) & (cest < cfg["CP_MAX"])]
    cp = np.percentile(cpos, 10) if len(cpos) else cfg["CP_MIN"]*10
    cp = np.clip(cp, cfg["CP_MIN"], cfg["CP_MAX"])

    g = np.real(ydut)
    gpos = g[(g > 0) & np.isfinite(g)]
    rp = 1/np.percentile(gpos, 10) if len(gpos) else 1e9
    rp = np.clip(rp, cfg["RP_MIN"], cfg["RP_MAX"])

    p0 = [rp, cp, rs, ls, cmain]

    n_extra = cfg["N_EXTRA"]

    for k in range(n_extra):
        f0 = f_extra[k] if k < len(f_extra) else np.geomspace(max(2*f_srf, freq[0]), freq[-1], n_extra+2)[k+1]
        w0 = 2*np.pi*f0

        if f0 > 2e9:
            ck = 0.05e-12
        elif f0 > 1e9:
            ck = 0.1e-12
        elif f0 > 300e6:
            ck = 0.5e-12
        else:
            ck = 1e-12

        lk = 1/(w0*w0*ck)
        rk = max(esr*10, 0.1)

        p0 += [
            np.clip(rk, cfg["R_EXTRA_MIN"], cfg["R_EXTRA_MAX"]),
            np.clip(lk, cfg["L_EXTRA_MIN"], cfg["L_EXTRA_MAX"]),
            np.clip(ck, cfg["C_EXTRA_MIN"], cfg["C_EXTRA_MAX"])
        ]

    lo = [cfg["RP_MIN"], cfg["CP_MIN"], cfg["RS_MIN"], cfg["LS_MIN"], cfg["CMAIN_MIN"]]
    hi = [cfg["RP_MAX"], cfg["CP_MAX"], cfg["RS_MAX"], cfg["LS_MAX"], cfg["CMAIN_MAX"]]

    for _ in range(n_extra):
        lo += [cfg["R_EXTRA_MIN"], cfg["L_EXTRA_MIN"], cfg["C_EXTRA_MIN"]]
        hi += [cfg["R_EXTRA_MAX"], cfg["L_EXTRA_MAX"], cfg["C_EXTRA_MAX"]]

    return np.array(p0), np.array(lo), np.array(hi)


# ============================================================
# EXPORT
# ============================================================

def export_txt(p, n_extra, meta):
    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)
    f0_main = 1/(2*np.pi*np.sqrt(Ls*Cmain))
    q_main = (1/Rs)*np.sqrt(Ls/Cmain)

    lines = ["Modelo automatico pasivo fisico shunt para capacitor", ""]
    for k, v in meta.items():
        lines.append(f"{k} = {v}")
    lines += [
        "",
        f"Numero_ramas_extra = {n_extra}",
        "",
        f"Rp_Ohm = {Rp:.12e}",
        f"Cp_F = {Cp:.12e}",
        f"Rs_main_Ohm = {Rs:.12e}",
        f"Ls_main_H = {Ls:.12e}",
        f"Cmain_F = {Cmain:.12e}",
        f"f0_main_Hz = {f0_main:.12e}",
        f"Q_main = {q_main:.12e}",
        "",
        "Ramas extra:",
        "k,R_Ohm,L_H,C_F,f0_Hz,Q"
    ]

    print("\n==============================")
    print("MODELO AUTOMÁTICO PASIVO V2")
    print("==============================")
    print(f"N ramas extra = {n_extra}")
    print(f"Rp       = {Rp:.6e} Ohm")
    print(f"Cp       = {Cp:.6e} F")
    print(f"Rs_main  = {Rs:.6e} Ohm")
    print(f"Ls_main  = {Ls:.6e} H")
    print(f"Cmain    = {Cmain:.6e} F")
    print(f"f0_main  = {f0_main:.6e} Hz")
    print(f"Q_main   = {q_main:.6e}")

    for i, (R, L, C) in enumerate(extras, 1):
        f0 = 1/(2*np.pi*np.sqrt(L*C))
        q = (1/R)*np.sqrt(L/C)
        print(f"{i}, {R:.6e}, {L:.6e}, {C:.6e}, {f0:.6e}, {q:.6e}")
        lines.append(f"{i},{R:.12e},{L:.12e},{C:.12e},{f0:.12e},{q:.12e}")

    Path(TXT_FILENAME).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nExportado: {TXT_FILENAME}")


def export_spice(p, n_extra):
    Rp, Cp, Rs, Ls, Cmain, extras = unpack(p, n_extra)

    lines = [
        "* Auto universal passive shunt capacitor model V2",
        "* Generated from 2-port shunt-through S2P",
        "* Terminals: P = shunt node, G = ground",
        f".SUBCKT {SUBCKT_NAME} P G",
        "",
        f"RPAR P G {Rp:.12e}",
        f"CPAR P G {Cp:.12e}",
        "",
        f"RMAIN P N_MAIN_R {Rs:.12e}",
        f"LMAIN N_MAIN_R N_MAIN_L {Ls:.12e}",
        f"CMAIN N_MAIN_L G {Cmain:.12e}",
    ]

    for i, (R, L, C) in enumerate(extras, 1):
        lines += [
            "",
            f"REX{i} P N_EX{i}_R {R:.12e}",
            f"LEX{i} N_EX{i}_R N_EX{i}_L {L:.12e}",
            f"CEX{i} N_EX{i}_L G {C:.12e}",
        ]

    lines += ["", f".ENDS {SUBCKT_NAME}", "", f"* Example: XCAP node_shunt 0 {SUBCKT_NAME}"]

    Path(SPICE_FILENAME).write_text("\n".join(lines), encoding="utf-8")
    print(f"Exportado: {SPICE_FILENAME}")


# ============================================================
# MAIN
# ============================================================

def main():
    ntwk = rf.Network(S2P_FILE)
    freq_all = ntwk.f
    s21_all = ntwk.s[:, 1, 0]

    mask_all = freq_all <= F_MAX_VALID
    freq_all = freq_all[mask_all]
    s21_all = s21_all[mask_all]

    zdut_all = shunt_through_z_from_s21(s21_all, Z0)
    ydut_all = 1/zdut_all

    if AUTO_FIT_BAND:
        idx_min, idx_max, f_srf_full, slope = detect_valid_fit_band(freq_all, zdut_all)
    else:
        idx_min = 0 if FIT_FMIN_MANUAL is None else int(np.searchsorted(freq_all, FIT_FMIN_MANUAL))
        idx_max = len(freq_all)-1 if FIT_FMAX_MANUAL is None else int(np.searchsorted(freq_all, FIT_FMAX_MANUAL))

    fit_slice = slice(idx_min, idx_max+1)
    freq = freq_all[fit_slice]
    zdut = zdut_all[fit_slice]
    ydut = ydut_all[fit_slice]

    f_srf, idx_srf = estimate_srf(freq, zdut)

    c_eff = C_NOMINAL_OVERRIDE if C_NOMINAL_OVERRIDE is not None else estimate_c_effective(freq, zdut, np.ones_like(freq, dtype=bool))
    esr = estimate_esr(freq, zdut, idx_srf)
    esl = estimate_esl(c_eff, f_srf)
    cap_class = classify_cap(c_eff)
    cfg = auto_limits_and_strategy(cap_class, c_eff, freq[-1])
    f_extra = detect_extra_resonances(freq, zdut, f_srf, cfg["N_EXTRA"])

    print("\n==============================")
    print("AUTO-IDENTIFICACIÓN V2")
    print("==============================")
    print(f"Archivo: {S2P_FILE}")
    print(f"Banda completa: {freq_all[0]:.6e} Hz a {freq_all[-1]:.6e} Hz")
    print(f"Banda de ajuste: {freq[0]:.6e} Hz a {freq[-1]:.6e} Hz")
    print(f"Puntos ajuste: {len(freq)}")
    print(f"C_eff estimada = {c_eff:.6e} F")
    print(f"Clase = {cap_class}")
    print(f"SRF estimada = {f_srf:.6e} Hz")
    print(f"ESR inicial = {esr:.6e} Ohm")
    print(f"ESL inicial = {esl:.6e} H")
    print(f"N ramas extra auto = {cfg['N_EXTRA']}")
    print("f_extra iniciales:")
    for f in f_extra:
        print(f"  {f:.6e} Hz")

    p0, lo, hi = initial_and_bounds(freq, zdut, ydut, cfg, c_eff, f_srf, idx_srf, esr, esl, f_extra)
    p0 = np.clip(p0, lo*1.001, hi/1.001)

    result = least_squares(
        residual,
        np.log10(p0),
        bounds=(np.log10(lo), np.log10(hi)),
        args=(freq, zdut, ydut, cfg["N_EXTRA"], c_eff),
        max_nfev=150000,
        xtol=1e-13,
        ftol=1e-13,
        gtol=1e-13,
        verbose=0
    )

    p = 10**result.x

    yfit = y_model(freq, p, cfg["N_EXTRA"])
    zfit = 1/yfit

    yfit_all = y_model(freq_all, p, cfg["N_EXTRA"])
    zfit_all = 1/yfit_all

    print("\n==============================")
    print("ERROR EN BANDA DE AJUSTE")
    print("==============================")
    print(f"RMS Z [Ohm] = {rms(zdut, zfit):.6e}")
    print(f"NRMS Z      = {nrms(zdut, zfit):.6e}")
    print(f"RMS Y [S]   = {rms(ydut, yfit):.6e}")
    print(f"NRMS Y      = {nrms(ydut, yfit):.6e}")
    print(f"Success: {result.success}")
    print(f"Mensaje: {result.message}")

    meta = {
        "C_eff_estimada_F": f"{c_eff:.12e}",
        "Clase": cap_class,
        "Banda_ajuste_Hz": f"{freq[0]:.12e} to {freq[-1]:.12e}",
        "SRF_estimada_Hz": f"{f_srf:.12e}",
        "ESR_inicial_Ohm": f"{esr:.12e}",
        "ESL_inicial_H": f"{esl:.12e}",
        "NRMS_Z_fitband": f"{nrms(zdut, zfit):.12e}",
        "NRMS_Y_fitband": f"{nrms(ydut, yfit):.12e}",
    }

    export_txt(p, cfg["N_EXTRA"], meta)
    export_spice(p, cfg["N_EXTRA"])

    np.savez(
        NPZ_FILENAME,
        freq_all=freq_all,
        zdut_all=zdut_all,
        ydut_all=ydut_all,
        zfit_all=zfit_all,
        yfit_all=yfit_all,
        freq_fit=freq,
        zdut_fit=zdut,
        ydut_fit=ydut,
        zfit=zfit,
        yfit=yfit,
        params=p,
        n_extra=cfg["N_EXTRA"],
        z0=Z0,
        c_eff=c_eff,
        cap_class=cap_class,
        f_srf=f_srf,
        fit_fmin=freq[0],
        fit_fmax=freq[-1],
    )
    print(f"Exportado: {NPZ_FILENAME}")

    # Gráficas
    plt.figure(figsize=(10,6))
    plt.loglog(freq_all, np.abs(zdut_all), label="|Zdut| medida completa")
    plt.loglog(freq_all, np.abs(zfit_all), "--", label="|Z| modelo")
    plt.axvspan(freq_all[0], freq[0], alpha=0.15, label="zona ignorada")
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("|Z| [Ohm]")
    plt.title("Impedancia")
    plt.legend()

    plt.figure(figsize=(10,6))
    plt.semilogx(freq_all, np.angle(zdut_all, deg=True), label="Fase Z medida")
    plt.semilogx(freq_all, np.angle(zfit_all, deg=True), "--", label="Fase Z modelo")
    plt.axvspan(freq_all[0], freq[0], alpha=0.15, label="zona ignorada")
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("Fase [deg]")
    plt.title("Fase de impedancia")
    plt.legend()

    plt.figure(figsize=(10,6))
    plt.loglog(freq, np.abs(zdut-zfit))
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("Error |Z-Zfit| [Ohm]")
    plt.title("Error absoluto en banda de ajuste")

    plt.show()


if __name__ == "__main__":
    main()
