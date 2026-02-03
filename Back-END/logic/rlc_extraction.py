import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import least_squares
import skrf as rf
import io
import base64
import matplotlib
matplotlib.use('Agg')

# Reuse logic from original file
def s_to_abcd(s: np.ndarray, z0: float) -> np.ndarray:
    s11, s12, s21, s22 = s[:, 0, 0], s[:, 0, 1], s[:, 1, 0], s[:, 1, 1]
    eps = 1e-30
    s21_safe = np.where(np.abs(s21) < eps, eps + 0j, s21)
    A = ((1 + s11) * (1 - s22) + s12 * s21) / (2 * s21_safe)
    B = z0 * (((1 + s11) * (1 + s22) - s12 * s21) / (2 * s21_safe))
    C = (1 / z0) * (((1 - s11) * (1 - s22) - s12 * s21) / (2 * s21_safe))
    D = ((1 - s11) * (1 + s22) + s12 * s21) / (2 * s21_safe)
    abcd = np.zeros((s.shape[0], 2, 2), dtype=complex)
    abcd[:, 0, 0], abcd[:, 0, 1], abcd[:, 1, 0], abcd[:, 1, 1] = A, B, C, D
    return abcd

def abcd_to_s(abcd: np.ndarray, z0: float) -> np.ndarray:
    A, B, C, D = abcd[:, 0, 0], abcd[:, 0, 1], abcd[:, 1, 0], abcd[:, 1, 1]
    den = (A + B / z0 + C * z0 + D)
    s = np.zeros((abcd.shape[0], 2, 2), dtype=complex)
    s[:, 0, 0] = (A + B / z0 - C * z0 - D) / den
    s[:, 1, 0] = 2.0 / den
    s[:, 0, 1] = 2.0 * (A * D - B * C) / den
    s[:, 1, 1] = (-A + B / z0 - C * z0 + D) / den
    return s

def Z_rlc(w: np.ndarray, R: float, L: float, C: float) -> np.ndarray:
    return R + 1j * w * L + 1.0 / (1j * w * C)

def Y_rlc(w: np.ndarray, R: float, L: float, C: float) -> np.ndarray:
    return 1.0 / Z_rlc(w, R, L, C)

def fit_basic_rlc(f, Z_elem):
    w = 2*np.pi*f
    mask = (f > 0) & np.isfinite(Z_elem)
    f2, w2, Z2 = f[mask], w[mask], Z_elem[mask]
    z_floor = float(max(np.percentile(np.abs(Z2), 1) * 0.2, 1e-6))
    scale = np.abs(Z2) + z_floor
    
    # Simple guess
    R0 = float(max(np.real(Z2)[int(np.argmin(np.abs(Z2)))], 1e-6))
    L0, C0 = 1e-9, 1e-12
    
    def resid(p):
        R, L, C = p
        d = (Z_rlc(w2, R, L, C) - Z2) / scale
        return np.concatenate([np.real(d), np.imag(d)])

    res = least_squares(resid, x0=[R0, L0, C0], bounds=([0, 0, 1e-18], [np.inf, np.inf, np.inf]), loss='soft_l1')
    return res.x, res.cost

def run_rlc_extraction(file_content, filename, z0=50.0, mode="auto"):
    # Load touchstone file from memory
    # skrf.Network can take a file object or path. We use a temp file or similar if needed,
    # but skrf.Network(io.BytesIO(file_content)) might work if it's touchstone.
    # Actually, skrf usually expects a filename to determine type.
    
    with open("temp.s2p", "wb") as f_tmp:
        f_tmp.write(file_content)
    
    ntw = rf.Network("temp.s2p")
    f = ntw.f
    s_meas = ntw.s
    abcd_meas = s_to_abcd(s_meas, z0)
    Z_series = abcd_meas[:, 0, 1]
    Y_shunt = abcd_meas[:, 1, 0]
    Z_shunt = 1.0 / Y_shunt
    
    params_s, cost_s = fit_basic_rlc(f, Z_series)
    params_h, cost_h = fit_basic_rlc(f, Z_shunt)
    
    if mode == "auto":
        chosen = "SHUNT" if cost_h <= cost_s else "SERIE"
    else:
        chosen = mode.upper()
    
    final_params = params_h if chosen == "SHUNT" else params_s
    R, L, C = final_params
    
    # Calculate model S-parameters for comparison
    w = 2*np.pi*f
    if chosen == "SHUNT":
        Ydut = Y_rlc(w, R, L, C)
        abcd_mod = np.zeros((len(f), 2, 2), dtype=complex)
        abcd_mod[:, 0, 0] = 1.0
        abcd_mod[:, 0, 1] = 0.0
        abcd_mod[:, 1, 0] = Ydut
        abcd_mod[:, 1, 1] = 1.0
    else:
        Zdut = Z_rlc(w, R, L, C)
        abcd_mod = np.zeros((len(f), 2, 2), dtype=complex)
        abcd_mod[:, 0, 0] = 1.0
        abcd_mod[:, 0, 1] = Zdut
        abcd_mod[:, 1, 0] = 0.0
        abcd_mod[:, 1, 1] = 1.0
    
    s_mod = abcd_to_s(abcd_mod, z0)
    s11_mod_db = 20 * np.log10(np.abs(s_mod[:, 0, 0]))
    s21_mod_db = 20 * np.log10(np.abs(s_mod[:, 1, 0]))
    
    s11_meas_db = 20 * np.log10(np.abs(s_meas[:, 0, 0]))
    s21_meas_db = 20 * np.log10(np.abs(s_meas[:, 1, 0]))

    def get_base64_plot(fig):
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=150)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode('utf-8')

    plots = []

    # Plot 1: Impedance Comparison
    fig1 = plt.figure(figsize=(10, 6))
    plt.loglog(f, np.abs(Z_shunt if chosen == "SHUNT" else Z_series), label="Medido", linewidth=2)
    plt.loglog(f, np.abs(Z_rlc(w, R, L, C)), label="Modelo RLC", linestyle="--", linewidth=2)
    plt.title(f"Ajuste de Impedancia |Z| - ({chosen})")
    plt.xlabel("Frecuencia (Hz)")
    plt.ylabel("Impedancia (Ohm)")
    plt.grid(True, which="both", alpha=0.3)
    plt.legend()
    plots.append({"id": "z_fit", "title": "Comparativa de Impedancia", "image": get_base64_plot(fig1)})
    plt.close(fig1)

    # Plot 2: S11 Comparison
    fig2 = plt.figure(figsize=(10, 6))
    plt.plot(f/1e6, s11_meas_db, label="S11 Medido", linewidth=1.5)
    plt.plot(f/1e6, s11_mod_db, label="S11 Modelo", linestyle="--", linewidth=1.5)
    plt.title(f"Comparativa S11 (Magnitud)")
    plt.xlabel("Frecuencia (MHz)")
    plt.ylabel("S11 (dB)")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plots.append({"id": "s11_fit", "title": "Comparativa S11 (dB)", "image": get_base64_plot(fig2)})
    plt.close(fig2)

    # Plot 3: S21 Comparison
    fig3 = plt.figure(figsize=(10, 6))
    plt.plot(f/1e6, s21_meas_db, label="S21 Medido", linewidth=1.5)
    plt.plot(f/1e6, s21_mod_db, label="S21 Modelo", linestyle="--", linewidth=1.5)
    plt.title(f"Comparativa S21 (Magnitud)")
    plt.xlabel("Frecuencia (MHz)")
    plt.ylabel("S21 (dB)")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plots.append({"id": "s21_fit", "title": "Comparativa S21 (dB)", "image": get_base64_plot(fig3)})
    plt.close(fig3)
    
    import os
    if os.path.exists("temp.s2p"):
        os.remove("temp.s2p")
    
    # Generate Model JSON content
    import json
    model_data = {
        "mode": chosen,
        "parameters": {
            "R_ohm": float(R),
            "L_henry": float(L),
            "C_farad": float(C)
        },
        "source_file": filename,
        "z0": z0
    }
    json_content = json.dumps(model_data, indent=2)

    # --- ZIP Generation (Plots only) ---
    import zipfile
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for p in plots:
            zip_file.writestr(f"{p['id']}_{filename.replace('.s2p', '')}.png", base64.b64decode(p['image']))
    
    zip_buffer.seek(0)
    zip_base64 = base64.b64encode(zip_buffer.read()).decode('utf-8')

    return {
        "mode": chosen,
        "R": float(R),
        "L": float(L),
        "C": float(C),
        "plots": plots,
        "json_content": json_content,
        "zip_content": zip_base64
    }
