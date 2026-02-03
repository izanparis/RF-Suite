#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Extracción de modelo equivalente desde un .s2p (2-puertos) para construir un esquemático
que reproduzca el comportamiento medido.

Requisitos:
  pip install numpy matplotlib scipy scikit-rf
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import EngFormatter
from scipy.optimize import least_squares

import skrf as rf


# -----------------------------
# SI formatting
# -----------------------------
_SI_PREFIX = {
    -24: "y", -21: "z", -18: "a", -15: "f", -12: "p", -9: "n",
    -6: "µ", -3: "m", 0: "", 3: "k", 6: "M", 9: "G", 12: "T",
    15: "P", 18: "E", 21: "Z", 24: "Y",
}

def si_str(x: float, unit: str = "", sig: int = 4) -> str:
    if not np.isfinite(x):
        return f"NaN {unit}".strip()
    if x == 0:
        return f"0 {unit}".strip()
    ax = abs(x)
    exp3 = int(np.floor(np.log10(ax) / 3) * 3)
    exp3 = max(min(exp3, 24), -24)
    scaled = x / (10 ** exp3)
    prefix = _SI_PREFIX.get(exp3, "")
    if abs(scaled) >= 1000 and exp3 < 24:
        exp3 += 3
        scaled = x / (10 ** exp3)
        prefix = _SI_PREFIX.get(exp3, "")
    return f"{scaled:.{sig}g} {prefix}{unit}".strip()


# -----------------------------
# File picker + prompts
# -----------------------------
def pick_s2p_file() -> str:
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askopenfilename(
            title="Selecciona un archivo .s2p",
            filetypes=[("Touchstone S2P", "*.s2p"), ("Todos", "*.*")]
        )
        root.destroy()
        if not path:
            raise SystemExit("No se seleccionó ningún archivo.")
        return path
    except Exception:
        path = input("Ruta al .s2p: ").strip()
        if not path:
            raise SystemExit("Ruta vacía.")
        return path

def ask_z0(default: float = 50.0) -> float:
    txt = input(f"Z0 de referencia (ohm) [Enter = {default}]: ").strip()
    if not txt:
        return float(default)
    try:
        val = float(txt)
        if val <= 0:
            raise ValueError
        return val
    except ValueError:
        print("Z0 inválida. Uso 50 ohm.")
        return float(default)

def ask_mode() -> str:
    print("\n¿Cómo se midió el DUT?")
    print("  [A] AUTO  (el script decide)")
    print("  [S] SERIE (DUT en serie entre puertos)")
    print("  [H] SHUNT (DUT en derivación a masa dentro de un thru)")
    while True:
        m = input("Elige A/S/H [Enter=A]: ").strip().lower()
        if m == "":
            return "auto"
        if m in ("a", "auto"):
            return "auto"
        if m in ("s", "serie", "series"):
            return "series"
        if m in ("h", "shunt"):
            return "shunt"
        print("Entrada no válida.")


# -----------------------------
# S <-> ABCD helpers (robusto a versiones)
# -----------------------------
def s_to_abcd(s: np.ndarray, z0: float) -> np.ndarray:
    """S (N,2,2) -> ABCD (N,2,2) con Z0 real (igual en ambos puertos)."""
    s11 = s[:, 0, 0]
    s12 = s[:, 0, 1]
    s21 = s[:, 1, 0]
    s22 = s[:, 1, 1]
    eps = 1e-30
    s21_safe = np.where(np.abs(s21) < eps, eps + 0j, s21)

    A = ((1 + s11) * (1 - s22) + s12 * s21) / (2 * s21_safe)
    B = z0 * (((1 + s11) * (1 + s22) - s12 * s21) / (2 * s21_safe))
    C = (1 / z0) * (((1 - s11) * (1 - s22) - s12 * s21) / (2 * s21_safe))
    D = ((1 - s11) * (1 + s22) + s12 * s21) / (2 * s21_safe)

    abcd = np.zeros((s.shape[0], 2, 2), dtype=complex)
    abcd[:, 0, 0] = A
    abcd[:, 0, 1] = B
    abcd[:, 1, 0] = C
    abcd[:, 1, 1] = D
    return abcd

def abcd_to_s(abcd: np.ndarray, z0: float) -> np.ndarray:
    A = abcd[:, 0, 0]
    B = abcd[:, 0, 1]
    C = abcd[:, 1, 0]
    D = abcd[:, 1, 1]
    den = (A + B / z0 + C * z0 + D)

    s11 = (A + B / z0 - C * z0 - D) / den
    s21 = 2.0 / den
    s12 = 2.0 * (A * D - B * C) / den
    s22 = (-A + B / z0 - C * z0 + D) / den

    s = np.zeros((abcd.shape[0], 2, 2), dtype=complex)
    s[:, 0, 0] = s11
    s[:, 1, 0] = s21
    s[:, 0, 1] = s12
    s[:, 1, 1] = s22
    return s

def abcd_series(Z: np.ndarray) -> np.ndarray:
    """ABCD de un elemento en serie: [[1, Z],[0,1]]."""
    out = np.zeros((Z.size, 2, 2), dtype=complex)
    out[:, 0, 0] = 1.0
    out[:, 0, 1] = Z
    out[:, 1, 0] = 0.0
    out[:, 1, 1] = 1.0
    return out

def abcd_shunt(Y: np.ndarray) -> np.ndarray:
    """ABCD de un elemento en shunt: [[1,0],[Y,1]]."""
    out = np.zeros((Y.size, 2, 2), dtype=complex)
    out[:, 0, 0] = 1.0
    out[:, 0, 1] = 0.0
    out[:, 1, 0] = Y
    out[:, 1, 1] = 1.0
    return out

def abcd_cascade(ab1: np.ndarray, ab2: np.ndarray) -> np.ndarray:
    """Cascada: ABCD_total = ab1 @ ab2 por frecuencia."""
    return np.einsum("nij,njk->nik", ab1, ab2)


# -----------------------------
# RLC model (serie)
# -----------------------------
def Z_rlc(w: np.ndarray, R: float, L: float, C: float) -> np.ndarray:
    return R + 1j * w * L + 1.0 / (1j * w * C)

def Y_rlc(w: np.ndarray, R: float, L: float, C: float) -> np.ndarray:
    return 1.0 / Z_rlc(w, R, L, C)


# -----------------------------
# Initial guess helpers
# -----------------------------
def initial_guess_from_Z(f: np.ndarray, Z: np.ndarray) -> tuple[float, float, float]:
    w = 2 * np.pi * f
    mask = (f > 0) & np.isfinite(Z)
    f = f[mask]; w = w[mask]; Z = Z[mask]

    Rv = np.real(Z)
    Xv = np.imag(Z)

    idx0 = int(np.argmin(np.abs(Z)))
    R0 = float(max(Rv[idx0], 1e-6))

    cap = (Xv < 0) & (np.abs(Xv) > 5 * np.abs(Rv)) & np.isfinite(Xv)
    ind = (Xv > 0) & (np.abs(Xv) > 5 * np.abs(Rv)) & np.isfinite(Xv)

    C0 = 1e-12
    if np.any(cap):
        Ccand = -1.0 / (w[cap] * Xv[cap])
        Ccand = Ccand[np.isfinite(Ccand) & (Ccand > 0)]
        if Ccand.size:
            C0 = float(np.median(Ccand))

    L0 = 1e-9
    if np.any(ind):
        Lcand = Xv[ind] / w[ind]
        Lcand = Lcand[np.isfinite(Lcand) & (Lcand > 0)]
        if Lcand.size:
            L0 = float(np.median(Lcand))

    return R0, L0, C0


# -----------------------------
# Element extraction from ABCD
# -----------------------------
def extract_series_shunt_element(f: np.ndarray, abcd_meas: np.ndarray):
    """Devuelve Z_series=B, Y_shunt=C."""
    Z_series = abcd_meas[:, 0, 1]  # B
    Y_shunt  = abcd_meas[:, 1, 0]  # C
    return Z_series, Y_shunt


# -----------------------------
# Fitting
# -----------------------------
def fit_basic_rlc_on_element(f, Z_elem, _Y_elem_unused, mode: str):
    """Ajuste RLC (sin añadir parásitos) con residual relativo y multi-start.

    Nota: para evitar que el ajuste "ignore" la zona del mínimo (|Z| muy pequeño),
    ajustamos en el dominio de Z usando un residual *relativo*:

        d = (Z_model - Z_meas) / (|Z_meas| + z_floor)

    y empleamos una pérdida robusta (soft_l1) + varios arranques.

    mode:
      - "series": Z_elem es el elemento en serie (B_ABCD)
      - "shunt" : Z_elem es el elemento en shunt (1/C_ABCD)
    """

    w = 2*np.pi*f
    mask = (f > 0) & np.isfinite(Z_elem)
    f2 = f[mask]
    w2 = w[mask]
    Z2 = Z_elem[mask]

    # z_floor evita explosiones numéricas cerca del mínimo ideal.
    # (pequeño, pero no cero)
    z_floor = np.percentile(np.abs(Z2), 1) * 0.2
    z_floor = float(max(z_floor, 1e-6))
    scale = np.abs(Z2) + z_floor

    R0, L0, C0 = initial_guess_from_Z(f2, Z2)

    def resid(p):
        R, L, C = p
        d = (Z_rlc(w2, R, L, C) - Z2) / scale
        return np.concatenate([np.real(d), np.imag(d)])

    lb = np.array([0.0, 0.0, 1e-18])
    ub = np.array([np.inf, np.inf, np.inf])

    # Multi-start: variamos ligeramente L y C para escapar de mínimos locales.
    r_factors = [0.7, 1.0, 1.4]
    lc_factors = [0.8, 1.0, 1.25]

    best = None
    for rf in r_factors:
        for lf in lc_factors:
            for cf in lc_factors:
                x0 = np.array([
                    max(R0 * rf, 1e-9),
                    max(L0 * lf, 1e-15),
                    max(C0 * cf, 1e-18),
                ])
                res = least_squares(
                    resid,
                    x0=x0,
                    bounds=(lb, ub),
                    method="trf",
                    loss="soft_l1",
                    f_scale=1.0,
                    max_nfev=2000,
                )
                r = resid(res.x)
                rmse = float(np.sqrt(np.mean(r**2)))
                if (best is None) or (rmse < best[3]):
                    best = (float(res.x[0]), float(res.x[1]), float(res.x[2]), rmse)

    R, L, C, rmse = best
    return R, L, C, rmse


def fit_shunt_with_thru_parasitics(f, s_meas, z0, R0, L0, C0):
    """
    Modelo mejorado para SHUNT:
      Port1 -- Zth/2 -- node -- Zth/2 -- Port2
                      |
                      +-- RLC (serie) a masa

    Parámetros: [R, L, C, Rth, Lth]
    Ajuste sobre S11 y S21 (complejo), normalizado.
    """
    w = 2*np.pi*f
    mask = f > 0
    f2 = f[mask]; w2 = w[mask]
    s = s_meas[mask]

    # Medida
    s11m = s[:, 0, 0]
    s21m = s[:, 1, 0]

    # Normalización (evita que el stopband mande)
    scale11 = np.maximum(np.abs(s11m), np.median(np.abs(s11m)))
    scale21 = np.maximum(np.abs(s21m), np.median(np.abs(s21m)))

    def model_s(params):
        R, L, C, Rth, Lth = params
        Zth_half = (Rth + 1j*w2*Lth) / 2.0
        Ydut = Y_rlc(w2, R, L, C)

        ab = abcd_series(Zth_half)
        ab = abcd_cascade(ab, abcd_shunt(Ydut))
        ab = abcd_cascade(ab, abcd_series(Zth_half))
        sm = abcd_to_s(ab, z0)
        return sm

    def resid(params):
        sm = model_s(params)
        d11 = (sm[:, 0, 0] - s11m) / scale11
        d21 = (sm[:, 1, 0] - s21m) / scale21
        # Peso extra a S21 (suele ser la métrica principal en un shunt-thru)
        w21 = 2.0
        return np.concatenate([
            np.real(d11), np.imag(d11),
            w21*np.real(d21), w21*np.imag(d21)
        ])

    x0 = np.array([R0, L0, C0, 1e-3, 1e-9])  # Rth, Lth pequeños
    lb = np.array([0.0, 0.0, 1e-18, 0.0, 0.0])
    ub = np.array([np.inf, np.inf, np.inf, np.inf, np.inf])

    res = least_squares(resid, x0=x0, bounds=(lb, ub), method="trf")
    p = res.x

    r = resid(p)
    rmse = float(np.sqrt(np.mean(r**2)))
    return map(float, p), rmse


# -----------------------------
# Plots (ADS-style)
# -----------------------------
def plot_s21_ads(f, s21, title):
    fig = plt.figure()
    ax = fig.add_subplot(111)
    ax.plot(f/1e9, 20*np.log10(np.maximum(np.abs(s21), 1e-300)))
    ax.set_title(title)
    ax.set_xlabel("freq (GHz)")
    ax.set_ylabel("dB(S21)")
    ax.grid(True, linestyle="--", linewidth=0.5)
    plt.tight_layout()

def plot_impedance_ads(f, Z, title, show_mag_re: bool = True):
    fig = plt.figure()
    ax = fig.add_subplot(111)
    # ADS: mag(Z_real) suele ser |Re{Z}| (opcional)
    if show_mag_re:
        mag_z_real = np.abs(np.real(Z))
        ax.plot(f, mag_z_real, label="mag(Re{Z})")
    ax.plot(f, np.abs(Z), alpha=0.6, label="|Z|")
    ax.set_title(title)
    ax.set_xlabel("freq (Hz)")
    ax.set_ylabel("Ω")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.xaxis.set_major_formatter(EngFormatter(unit="Hz"))
    ax.yaxis.set_major_formatter(EngFormatter(unit="Ω"))
    ax.grid(True, which="both", linestyle="--", linewidth=0.5)
    ax.legend()
    plt.tight_layout()

def plot_impedance_meas_vs_model(f, Z_meas, Z_model, title="Impedancia: medida vs modelo"):
    """Compara |Z| medida (extraída) vs |Z| del modelo en escala log-log (estilo ADS)."""
    fig = plt.figure()
    ax = fig.add_subplot(111)
    ax.plot(f, np.abs(Z_meas), label="|Z| medida")
    ax.plot(f, np.abs(Z_model), label="|Z| modelo", alpha=0.8)
    ax.set_title(title)
    ax.set_xlabel("freq (Hz)")
    ax.set_ylabel("|Z| (Ω)")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.xaxis.set_major_formatter(EngFormatter(unit="Hz"))
    ax.yaxis.set_major_formatter(EngFormatter(unit="Ω"))
    ax.grid(True, which="both", linestyle="--", linewidth=0.5)
    ax.legend()
    plt.tight_layout()

def plot_s21_compare(f, s21m, s21mod, subtitle):
    fig = plt.figure()
    ax = fig.add_subplot(111)
    ax.plot(f/1e9, 20*np.log10(np.maximum(np.abs(s21m), 1e-300)), label="S21 medido")
    ax.plot(f/1e9, 20*np.log10(np.maximum(np.abs(s21mod), 1e-300)), label="S21 modelo")
    ax.set_title(f"S21: medida vs modelo — {subtitle}")
    ax.set_xlabel("freq (GHz)")
    ax.set_ylabel("dB(S21)")
    ax.grid(True, linestyle="--", linewidth=0.5)
    ax.legend()
    plt.tight_layout()


# -----------------------------
# Main
# -----------------------------
def main():
    path = pick_s2p_file()
    z0 = ask_z0(50.0)
    mode_in = ask_mode()

    ntw = rf.Network(path)
    # Renormaliza si se puede (no siempre hace falta)
    try:
        ntw.renormalize(z0)
    except Exception:
        pass

    f = ntw.f
    s_meas = ntw.s

    # ABCD medido y extracción de hipótesis
    abcd_meas = s_to_abcd(s_meas, z0)
    Z_series, Y_shunt = extract_series_shunt_element(f, abcd_meas)
    Y_series = 1.0 / Z_series
    Z_shunt = 1.0 / Y_shunt

    # Gráfica S21 medido (ADS-like)
    s21m = s_meas[:, 1, 0]
    plot_s21_ads(f, s21m, "S21 del archivo .s2p (medido)")

    # 1) Ajuste básico en ambas hipótesis
    R_s, L_s, C_s, rmse_s = fit_basic_rlc_on_element(f, Z_series, Y_series, mode="series")
    R_h, L_h, C_h, rmse_h = fit_basic_rlc_on_element(f, Z_shunt, Y_shunt, mode="shunt")

    # Decide modo
    if mode_in == "series":
        chosen = "SERIE"
    elif mode_in == "shunt":
        chosen = "SHUNT"
    else:
        chosen = "SHUNT" if rmse_h <= rmse_s else "SERIE"

    # 2) Si es SHUNT, intenta modelo mejorado con parásitos de thru
    if chosen == "SHUNT":
        (R, L, C, Rth, Lth), rmse2 = fit_shunt_with_thru_parasitics(
            f=f, s_meas=s_meas, z0=z0, R0=R_h, L0=L_h, C0=C_h
        )
        used = "SHUNT + parásitos thru (Rth, Lth)" if rmse2 < rmse_h else "SHUNT básico (solo RLC)"
        if rmse2 < rmse_h:
            # Construye modelo mejorado
            w = 2*np.pi*f
            Zth_half = (Rth + 1j*w*Lth) / 2.0
            Ydut = Y_rlc(w, R, L, C)
            ab = abcd_series(Zth_half)
            ab = abcd_cascade(ab, abcd_shunt(Ydut))
            ab = abcd_cascade(ab, abcd_series(Zth_half))
            s_mod = abcd_to_s(ab, z0)
            Z_elem_for_plot = 1.0 / Ydut  # impedancia del DUT (RLC) como tal
            rmse_used = rmse2
        else:
            R, L, C = R_h, L_h, C_h
            Rth, Lth = 0.0, 0.0
            used = "SHUNT básico (solo RLC)"
            w = 2*np.pi*f
            Ydut = Y_rlc(w, R, L, C)
            ab = abcd_shunt(Ydut)
            s_mod = abcd_to_s(ab, z0)
            Z_elem_for_plot = 1.0 / Ydut
            rmse_used = rmse_h

        # Plots
        plot_impedance_ads(f, Z_shunt, "Impedancia extraída (SHUNT): Z = 1 / C_ABCD", show_mag_re=False)
        # En el modelo no hace falta mostrar mag(Re{Z}) (queda plano y distrae)
        plot_impedance_ads(f, Z_elem_for_plot, "Impedancia del DUT (modelo)", show_mag_re=False)
        plot_impedance_meas_vs_model(f, Z_shunt, Z_elem_for_plot, title="Impedancia (SHUNT): medida vs modelo")
        plot_s21_compare(f, s21m, s_mod[:, 1, 0], subtitle=f"{used} | RMSE={rmse_used:.3g}")

        # Prints
        f0_txt = "N/A"
        if L > 0 and C > 0:
            f0 = 1.0/(2*np.pi*np.sqrt(L*C))
            f0_txt = si_str(f0, "Hz")

        print("\n==============================")
        print("Archivo:", path)
        print("Z0:", z0, "Ω")
        print("Modo elegido:", chosen)
        print("Ajuste usado:", used)
        print("\n=== Parámetros del DUT (RLC serie a masa) ===")
        print("R  =", si_str(R, "Ω"))
        print("L  =", si_str(L, "H"))
        print("C  =", si_str(C, "F"))
        print("SRF≈", f0_txt)

        if Rth > 0 or Lth > 0:
            print("\n=== Parásitos de la vía thru (mejoran el encaje) ===")
            print("Rth =", si_str(Rth, "Ω"), "  (repartido Rth/2 en cada lado)")
            print("Lth =", si_str(Lth, "H"), "  (repartido Lth/2 en cada lado)")

        print("\n=== Esquemático equivalente (SHUNT) ===")
        if Rth > 0 or Lth > 0:
            print("Port1 -- (Rth/2 + jωLth/2) -- nodo -- (Rth/2 + jωLth/2) -- Port2")
            print("                                |")
            print("                               R - L - C (en serie) a GND")
        else:
            print("Port1 ---- nodo ---- Port2")
            print("           |")
            print("          R - L - C (en serie) a GND")

    else:
        # SERIE: mantenemos modelo básico (normalmente suficiente)
        R, L, C = R_s, L_s, C_s
        w = 2*np.pi*f
        Zdut = Z_rlc(w, R, L, C)
        ab = abcd_series(Zdut)
        s_mod = abcd_to_s(ab, z0)

        plot_impedance_ads(f, Z_series, "Impedancia extraída (SERIE): Z = B_ABCD")
        # En el modelo no hace falta mostrar mag(Re{Z}) (queda plano y distrae)
        plot_impedance_ads(f, Zdut, "Impedancia del DUT (modelo)", show_mag_re=False)
        plot_impedance_meas_vs_model(f, Z_series, Zdut, title="Impedancia (SERIE): medida vs modelo")
        plot_s21_compare(f, s21m, s_mod[:, 1, 0], subtitle=f"SERIE básico | RMSE={rmse_s:.3g}")

        f0_txt = "N/A"
        if L > 0 and C > 0:
            f0 = 1.0/(2*np.pi*np.sqrt(L*C))
            f0_txt = si_str(f0, "Hz")

        print("\n==============================")
        print("Archivo:", path)
        print("Z0:", z0, "Ω")
        print("Modo elegido:", chosen)
        print("\n=== Parámetros del DUT (RLC serie entre puertos) ===")
        print("R  =", si_str(R, "Ω"))
        print("L  =", si_str(L, "H"))
        print("C  =", si_str(C, "F"))
        print("SRF≈", f0_txt)

        print("\n=== Esquemático equivalente (SERIE) ===")
        print("Port1 -- R -- L -- C -- Port2")

    plt.show()


if __name__ == "__main__":
    main()
