import numpy as np
import skrf as rf
import json
import io
import base64
import matplotlib.pyplot as plt
import os
import tempfile
import matplotlib
import re
matplotlib.use('Agg')

def parse_hp_array(array_str):
    """
    Parses HP8752A complex array strings like 'Re, Im\nRe, Im...'
    """
    if not array_str:
        return np.array([])
    lines = array_str.strip().split('\n')
    data = []
    for l in lines:
        parts = l.replace(',', ' ').split()
        if len(parts) >= 2:
            try:
                re_val = float(parts[0])
                im_val = float(parts[1])
                data.append(re_val + 1j*im_val)
            except ValueError:
                continue
    return np.array(data)

def get_base64_plot(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

def manual_touchstone_parse(content):
    """
    Manual fallback parser for S1P/S2P files that might be slightly truncated.
    Returns: freqs (numpy array), s (numpy array with shape (N, nports, nports))
    """
    lines = content.split('\n')
    data_lines = []
    option_line = ""
    
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.startswith('!'): continue
        if line.startswith('#'):
            option_line = line
            continue
        # Extract all numbers from line
        nums = [float(v) for v in re.sub(r'[^0-9.eE+-]', ' ', line).split() if v.strip()]
        if nums:
            data_lines.append(nums)
            
    if not data_lines:
        raise ValueError("No se encontraron datos numéricos en el archivo Touchstone.")

    # Determine ports from first data line
    # S1P: Freq, Re, Im (3 values)
    # S2P: Freq, Re11, Im11, Re21, Im21, Re12, Im12, Re22, Im22 (9 values)
    first_line_len = len(data_lines[0])
    nports = 1 if first_line_len <= 3 else 2
    n_expected_per_freq = 3 if nports == 1 else 9
    
    # Flatten all data to handle multi-line points or slightly truncated files
    all_values = [v for line in data_lines for v in line]
    
    # Number of points is determined by the floor of values/n_expected
    n_points = len(all_values) // n_expected_per_freq
    if n_points == 0:
         raise ValueError(f"Datos insuficientes para {nports} puerto(s).")
         
    actual_data = all_values[:n_points * n_expected_per_freq]
    reshaped = np.array(actual_data).reshape(n_points, n_expected_per_freq)
    
    freqs = reshaped[:, 0]
    s_params = np.zeros((n_points, nports, nports), dtype=complex)
    
    if nports == 1:
        s_params[:, 0, 0] = reshaped[:, 1] + 1j * reshaped[:, 2]
    else:
        # S2P: Freq, S11, S21, S12, S22
        s_params[:, 0, 0] = reshaped[:, 1] + 1j * reshaped[:, 2] # S11
        s_params[:, 1, 0] = reshaped[:, 3] + 1j * reshaped[:, 4] # S21
        s_params[:, 0, 1] = reshaped[:, 5] + 1j * reshaped[:, 6] # S12
        s_params[:, 1, 1] = reshaped[:, 7] + 1j * reshaped[:, 8] # S22
        
    return freqs, s_params

def apply_hp_correction(raw_content, cal_json_content, filename="measurement.s1p"):
    print(f"\n--- INICIO CORRECCIÓN OFFLINE (ROBUSTA): {filename} ---")
    
    raw_str = raw_content.decode('ascii', errors='ignore')
    
    # 1. Load Raw Network (Try skrf first, then manual)
    try:
        # Save to temp file for skrf
        with tempfile.NamedTemporaryFile(suffix=".s2p", delete=False) as tmp:
            tmp.write(raw_content)
            temp_raw_path = tmp.name
        
        try:
            raw_ntw = rf.Network(temp_raw_path)
            n_meas = len(raw_ntw.f)
            raw_freqs = raw_ntw.f
            raw_s = raw_ntw.s
            raw_nports = raw_ntw.nports
            raw_z0 = raw_ntw.z0
        finally:
            if os.path.exists(temp_raw_path): os.remove(temp_raw_path)
            
    except Exception as e:
        print(f"DEBUG: Falló rf.Network ({e}). Intentando parseo manual.")
        try:
            raw_freqs, raw_s = manual_touchstone_parse(raw_str)
            n_meas = len(raw_freqs)
            raw_nports = raw_s.shape[1]
            raw_z0 = 50.0 # Default
            # Create a network object for consistency later
            raw_ntw = rf.Network(f=raw_freqs, s=raw_s, z0=raw_z0)
        except Exception as e2:
            return {"status": "error", "detail": f"Error crítico al cargar Touchstone: {e2}"}

    print(f"DEBUG: Medida RAW cargada. Puntos: {n_meas}, Puertos: {raw_nports}")

    # 2. Load Calibration JSON
    try:
        cal_data = json.loads(cal_json_content)
    except Exception as e:
        return {"status": "error", "detail": f"Error al decodificar JSON de calibración: {e}"}
    
    # 3. Extract Arrays and Metadata
    arrays = cal_data.get("arrays", {})
    ed = parse_hp_array(arrays.get("array_1", ""))
    es = parse_hp_array(arrays.get("array_2", ""))
    er = parse_hp_array(arrays.get("array_3", ""))
    et = parse_hp_array(arrays.get("array_response", ""))
    if len(et) == 0: et = parse_hp_array(arrays.get("array_4", ""))

    print(f"DEBUG: Arrays cal extraídos. ed:{len(ed)}, es:{len(es)}, er:{len(er)}, et:{len(et)}")

    # 4. Frequency Grid for Calibration
    cal_start = cal_data.get("start_hz", 0)
    cal_stop = cal_data.get("stop_hz", 0)
    n_cal_points = len(ed)
    if n_cal_points == 0:
        return {"status": "error", "detail": "El archivo de calibración no contiene el array maestro (array_1)"}
    
    cal_freqs = np.linspace(cal_start, cal_stop, n_cal_points)

    # 5. Interpolation to Measurement Grid
    def interpolate_complex(f_old, data_old, f_new):
        if len(data_old) == 0: 
            return np.zeros(len(f_new), dtype=complex)
        if len(f_old) != len(data_old):
            f_old = np.linspace(f_old[0], f_old[-1], len(data_old))
        
        re_vals = np.interp(f_new, f_old, np.real(data_old))
        im_vals = np.interp(f_new, f_old, np.imag(data_old))
        return re_vals + 1j*im_vals

    ed_i = interpolate_complex(cal_freqs, ed, raw_freqs)
    es_i = interpolate_complex(cal_freqs, es, raw_freqs)
    er_i = interpolate_complex(cal_freqs, er, raw_freqs)
    et_i = interpolate_complex(cal_freqs, et, raw_freqs)
    
    # 6. Apply Correction Formula (Vectorial 1-Port)
    s11_m = raw_s[:, 0, 0].flatten()
    num = s11_m - ed_i
    den = er_i + es_i * num
    den[np.abs(den) < 1e-18] = 1e-18 
    s11_corr = num / den

    # 7. Apply S21 Correction (Transmission Tracking)
    has_s21 = raw_nports >= 2 and len(et) > 0
    s21_corr = None
    if has_s21:
        s21_m = raw_s[:, 1, 0].flatten()
        et_i_safe = et_i.copy()
        et_i_safe[np.abs(et_i_safe) < 1e-18] = 1e-18
        s21_corr = s21_m / et_i_safe

    # 8. Construct Corrected Network
    corrected_s = np.zeros_like(raw_s)
    corrected_s[:, 0, 0] = s11_corr
    if has_s21:
        corrected_s[:, 1, 0] = s21_corr
        if corrected_s.shape[1] > 1:
            corrected_s[:, 0, 1] = 0
            corrected_s[:, 1, 1] = 0

    corr_ntw = rf.Network(f=raw_freqs, s=corrected_s, z0=raw_z0)
    print(f"DEBUG: Network corregido creado exitosamente.")

    # 9. Generate Visualization Plots
    plots = []
    try:
        # S11 Magnitude
        fig1 = plt.figure(figsize=(10, 6))
        plt.plot(raw_freqs/1e6, 20*np.log10(np.abs(s11_m) + 1e-12), label='S11 RAW', alpha=0.4, linestyle='--')
        plt.plot(raw_freqs/1e6, 20*np.log10(np.abs(s11_corr) + 1e-12), label='S11 CORREGIDO', color='red', linewidth=2)
        plt.title(f"S11 Corregido (Magnitud) - {filename}")
        plt.xlabel("Frecuencia (MHz)")
        plt.ylabel("Magnitud (dB)")
        plt.grid(True, alpha=0.2)
        plt.legend()
        plots.append({"id": "s11", "title": "S11 dB", "image": get_base64_plot(fig1)})
        plt.close(fig1)

        # Smith Chart
        fig2 = plt.figure(figsize=(8, 8))
        ax = fig2.add_subplot(111)
        corr_ntw.plot_s_smith(m=0, n=0, ax=ax, label='Corregido', color='blue', linewidth=2)
        plt.title("S11 Smith Chart (Corregido)")
        plots.append({"id": "smith", "title": "S11 Smith", "image": get_base64_plot(fig2)})
        plt.close(fig2)

        if has_s21:
            fig3 = plt.figure(figsize=(10, 6))
            plt.plot(raw_freqs/1e6, 20*np.log10(np.abs(s21_m) + 1e-12), label='S21 RAW', alpha=0.4, linestyle='--')
            plt.plot(raw_freqs/1e6, 20*np.log10(np.abs(s21_corr) + 1e-12), label='S21 CORREGIDO', color='green', linewidth=2)
            plt.title(f"S21 Corregido (Magnitud) - {filename}")
            plt.xlabel("Frecuencia (MHz)")
            plt.ylabel("Magnitud (dB)")
            plt.grid(True, alpha=0.2)
            plt.legend()
            plots.append({"id": "s21", "title": "S21 dB", "image": get_base64_plot(fig3)})
            plt.close(fig3)
    except Exception as plot_err:
        print(f"WARNING: Plotting error: {plot_err}")

    # 10. Export to Touchstone
    ts_content = ""
    ext_out = f".s{corr_ntw.nports}p"
    with tempfile.NamedTemporaryFile(suffix=ext_out, delete=False) as tmp_out:
        temp_out_path = tmp_out.name
    
    try:
        corr_ntw.write_touchstone(filename=temp_out_path)
        with open(temp_out_path, "r") as f:
            ts_content = f.read()
    except Exception as ts_err:
        print(f"ERROR al exportar Touchstone: {ts_err}")
    finally:
        if os.path.exists(temp_out_path):
            os.remove(temp_out_path)

    return {
        "status": "success",
        "plots": plots,
        "touchstone_content": ts_content,
        "data": {
            "freq_hz": corr_ntw.f.tolist(),
            "s11_db": (20*np.log10(np.abs(s11_corr) + 1e-12)).tolist(),
            "s11_deg": (np.angle(s11_corr, deg=True)).tolist(),
            "has_s21": has_s21,
            "s21_db": (20*np.log10(np.abs(s21_corr) + 1e-12)).tolist() if has_s21 else []
        }
    }
