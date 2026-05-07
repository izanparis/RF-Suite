"""
vector_fit_only_with_cir_export.py

Vector Fitting puro sobre impedancia extraída desde una medida
2-port shunt-through.

Extracción:
    Zdut = Z0*S21 / (2*(1-S21))

Exporta:
    vector_fit_results.npz
    vector_fit_ads.cir

Requisitos:
    pip install numpy matplotlib scipy scikit-rf
"""

import warnings
import numpy as np
import matplotlib.pyplot as plt
import skrf as rf
from skrf.vectorFitting import VectorFitting


# ============================================================
# CONFIGURACIÓN
# ============================================================

S2P_FILE = "10nF_100-1000MHz_1000pts.s2p"

Z0 = 50.0
F_MAX = 3e9

VF_ORDERS = [
    (1, 2),
    (1, 3),
    (1, 4),
    (2, 3),
    (2, 4),
    (2, 5),
    (3, 4),
]

PRINT_POLES = True


# ============================================================
# FUNCIONES
# ============================================================

def shunt_through_z_from_s21(s21, z0=50.0):
    eps = 1e-30
    return z0 * s21 / (2.0 * (1.0 - s21 + eps))


def z_to_s_oneport(z, z0=50.0):
    return (z - z0) / (z + z0)


def s_to_z_oneport(gamma, z0=50.0):
    eps = 1e-30
    return z0 * (1 + gamma) / (1 - gamma + eps)


def rms(a, b):
    return np.sqrt(np.mean(np.abs(a - b)**2))


def nrms(a, b):
    den = np.sqrt(np.mean(np.abs(a)**2))
    return rms(a, b) / den if den > 0 else np.inf


def run_vector_fit(freq, frequency_obj, zdut, order):

    gamma = z_to_s_oneport(zdut, Z0)

    ntwk = rf.Network(
        frequency=frequency_obj,
        s=gamma.reshape(-1, 1, 1),
        z0=Z0
    )

    vf = VectorFitting(ntwk)

    n_real, n_complex = order

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")

        vf.vector_fit(
            n_poles_real=n_real,
            n_poles_cmplx=n_complex,
            fit_constant=True,
            fit_proportional=False
        )

    warn_text = "\n".join(str(w.message) for w in caught)

    gamma_fit = vf.get_model_response(0, 0, freq)

    z_fit = s_to_z_oneport(gamma_fit, Z0)

    return {
        "order": order,
        "vf": vf,
        "z_fit": z_fit,
        "rms_z": rms(zdut, z_fit),
        "nrms_z": nrms(zdut, z_fit),
        "warnings": warn_text,
    }


def export_vector_fit_laplace_cir(freq, z_fit, filename="vector_fit_ads.cir"):
    """
    Exporta un subcircuito tipo Laplace para ADS/SPICE.

    Modelo:
        I(P->G) = Y(s) * V(P,G)

    Se conecta como elemento shunt:
        node_shunt --- XVF --- GND

    Nota:
    Es un modelo racional, no una red RLC.
    """

    subckt_name = "CAP_VECTOR_FIT_SHUNT"

    y_fit = 1.0 / z_fit

    s = 1j * 2 * np.pi * freq

    ws = 2 * np.pi * np.sqrt(freq[0] * freq[-1])
    x = s / ws

    order_num = 6
    order_den = 6

    A = []
    rhs = []

    for xi, yi in zip(x, y_fit):

        row = []

        for k in range(order_num + 1):
            row.append(xi**k)

        for k in range(1, order_den + 1):
            row.append(-yi * xi**k)

        A.append(row)
        rhs.append(yi)

    A = np.array(A, dtype=complex)
    rhs = np.array(rhs, dtype=complex)

    coeffs, *_ = np.linalg.lstsq(A, rhs, rcond=None)

    b = coeffs[:order_num + 1]
    a_rest = coeffs[order_num + 1:]
    a = np.concatenate(([1.0 + 0j], a_rest))

    def poly_to_ads(coeffs):
        terms = []

        for k, c in enumerate(coeffs):
            c_use = np.real(c)

            if abs(c_use) < 1e-30:
                continue

            if k == 0:
                terms.append(f"({c_use:.16e})")
            elif k == 1:
                terms.append(f"({c_use:.16e})*(s/{ws:.16e})")
            else:
                terms.append(f"({c_use:.16e})*(s/{ws:.16e})**{k}")

        return " + ".join(terms) if terms else "0"

    num_expr = poly_to_ads(b)
    den_expr = poly_to_ads(a)

    lines = []
    lines.append("* ============================================================")
    lines.append("* Vector Fitting rational shunt model")
    lines.append("* I(P,G) = Y(s)*V(P,G)")
    lines.append("* Generated automatically from 2-port shunt-through S2P")
    lines.append("* Terminals: P = shunt node, G = ground")
    lines.append("* ============================================================")
    lines.append("")
    lines.append(f".SUBCKT {subckt_name} P G")
    lines.append("")
    lines.append("* Laplace current source implementing fitted admittance")
    lines.append(f"G_YFIT P G LAPLACE {{V(P,G)}} = {{ ({num_expr}) / ({den_expr}) }}")
    lines.append("")
    lines.append(f".ENDS {subckt_name}")
    lines.append("")
    lines.append("* Example ADS/SPICE instance:")
    lines.append(f"* XVF node_shunt 0 {subckt_name}")
    lines.append("* ============================================================")

    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Exportado: {filename}")


# ============================================================
# MAIN
# ============================================================

def main():

    ntwk_full = rf.Network(S2P_FILE)

    freq_full = ntwk_full.f
    s21_full = ntwk_full.s[:, 1, 0]

    mask = freq_full <= F_MAX

    freq = freq_full[mask]
    s21 = s21_full[mask]

    zdut = shunt_through_z_from_s21(s21, Z0)

    ntwk = ntwk_full.copy()
    ntwk = ntwk[mask]

    print("\n==============================")
    print("VECTOR FITTING SOBRE Z")
    print("==============================")

    results = []

    for order in VF_ORDERS:

        try:

            r = run_vector_fit(
                freq,
                ntwk.frequency,
                zdut,
                order
            )

            results.append(r)

            flag = "WARNING" if r["warnings"] else "OK"

            print(
                f"Orden {order}: "
                f"NRMS_Z={r['nrms_z']:.6e}, "
                f"RMS_Z={r['rms_z']:.6e}, "
                f"{flag}"
            )

        except Exception as e:
            print(f"Orden {order} fallo: {e}")

    if not results:
        raise RuntimeError("No hubo ningún Vector Fitting válido.")

    clean = [r for r in results if not r["warnings"]]
    pool = clean if clean else results

    best = min(pool, key=lambda x: x["nrms_z"])

    vf = best["vf"]
    z_fit = best["z_fit"]

    print("\n==============================")
    print("MEJOR VECTOR FITTING")
    print("==============================")

    print(f"Orden = {best['order']}")
    print(f"RMS_Z  = {best['rms_z']:.6e}")
    print(f"NRMS_Z = {best['nrms_z']:.6e}")

    if best["warnings"]:
        print("\nWarnings:")
        print(best["warnings"])

    if PRINT_POLES:

        print("\nPolos:")
        print(vf.poles)

        print("\nResiduos:")
        print(vf.residues)

    np.savez(
        "vector_fit_results.npz",
        freq=freq,
        zdut=zdut,
        z_fit=z_fit,
        poles=vf.poles,
        residues=vf.residues,
        order=np.array(best["order"]),
        rms_z=best["rms_z"],
        nrms_z=best["nrms_z"],
    )

    print("\nExportado: vector_fit_results.npz")

    export_vector_fit_laplace_cir(
        freq=freq,
        z_fit=z_fit,
        filename="vector_fit_ads.cir"
    )

    plt.figure(figsize=(10, 6))
    plt.loglog(freq, np.abs(zdut), label="|Z| medida")
    plt.loglog(freq, np.abs(z_fit), "--", label="|Z| Vector Fitting")
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("|Z| [Ohm]")
    plt.title("Magnitud de impedancia")
    plt.legend()

    plt.figure(figsize=(10, 6))
    plt.semilogx(freq, np.angle(zdut, deg=True), label="Fase medida")
    plt.semilogx(freq, np.angle(z_fit, deg=True), "--", label="Fase VF")
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("Fase [deg]")
    plt.title("Fase de impedancia")
    plt.legend()

    plt.figure(figsize=(10, 6))
    plt.loglog(freq, np.abs(zdut - z_fit))
    plt.grid(True, which="both")
    plt.xlabel("Frecuencia [Hz]")
    plt.ylabel("|Z - Zfit| [Ohm]")
    plt.title("Error absoluto")

    plt.show()


if __name__ == "__main__":
    main()