import numpy as np
import matplotlib.pyplot as plt
import io
import base64
import matplotlib
import skrf as rf
import os
matplotlib.use('Agg')

def process_s_params_touchstone(file_content, filename):
    # Save to a temporary file for skrf to read
    temp_path = f"temp_analysis_{filename}"
    with open(temp_path, "wb") as f:
        f.write(file_content)
    
    try:
        ntw = rf.Network(temp_path)
        freqs = ntw.f
        freq_mhz = freqs / 1e6
        n_ports = ntw.nports
        
        # 1. Define base S-parameters metrics
        s11_db = ntw.s_db[:, 0, 0]
        s11_deg = ntw.s_deg[:, 0, 0]
        
        has_s21 = n_ports >= 2
        if has_s21:
            s21_db = ntw.s_db[:, 1, 0]
            s21_deg = ntw.s_deg[:, 1, 0]
        else:
            s21_db = None
            s21_deg = None

        # 2. VSWR and Return Loss
        vswr = ntw.s_vswr[:, 0, 0]
        return_loss = -s11_db
        
        # 3. Calculate Impedance based on port count
        if n_ports == 1:
            # For 1-port, Z is the input impedance Zin
            z_data = ntw.z[:, 0, 0]
            z_mag = np.maximum(np.abs(z_data), 1e-12)
            z_mag_shunt = None
        else:
            # For 2-port, extract Series Z and Shunt Z from ABCD parameters
            abcd = ntw.a
            # Z_series = B
            z_series = abcd[:, 0, 1]
            z_mag = np.maximum(np.abs(z_series), 1e-12)
            # Y_shunt = C => Z_shunt = 1/C
            y_shunt = abcd[:, 1, 0]
            z_mag_shunt = np.maximum(np.abs(1.0 / (y_shunt + 1e-30)), 1e-12)

        def get_base64_plot(fig):
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=150)
            buf.seek(0)
            return base64.b64encode(buf.read()).decode('utf-8')

        plots = []

        # --- Plot 1: S11 (dB) ---
        fig1 = plt.figure(figsize=(10, 6))
        plt.plot(freq_mhz, s11_db, label='S11 (dB)', color='#3b82f6', linewidth=1.5)
        plt.title(f'Magnitud S11 - {filename}')
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel('Magnitud (dB)')
        plt.grid(True, alpha=0.3)
        plt.legend()
        plot_s11 = get_base64_plot(fig1)
        plots.append({"id": "s11", "title": "S11 (dB)", "image": plot_s11})
        plt.close(fig1)

        # --- Plot 2: S21 (dB) ---
        if has_s21:
            fig2 = plt.figure(figsize=(10, 6))
            plt.plot(freq_mhz, s21_db, label='S21 (dB)', color='#ef4444', linewidth=1.5)
            plt.title(f'Magnitud S21 - {filename}')
            plt.xlabel('Frecuencia (MHz)')
            plt.ylabel('Magnitud (dB)')
            plt.grid(True, alpha=0.3)
            plt.legend()
            plot_s21 = get_base64_plot(fig2)
            plots.append({"id": "s21", "title": "S21 (dB)", "image": plot_s21})
            plt.close(fig2)

        # --- Plot 3: Impedance Magnitude (LOG-LOG) ---
        fig_z = plt.figure(figsize=(10, 6))
        if n_ports == 1:
            plt.loglog(freq_mhz, z_mag, color='purple', label='|Z_in| (Ohm)', linewidth=1.5)
            plt.title(f'Magnitud Impedancia de Entrada |Z_in| - {filename}')
        else:
            plt.loglog(freq_mhz, z_mag, color='purple', label='|Z_serie| (Ohm)', linewidth=1.5)
            plt.loglog(freq_mhz, z_mag_shunt, color='brown', label='|Z_paralelo| (Ohm)', linestyle='--', linewidth=1.5)
            plt.title(f'Magnitud de Impedancia Extraída |Z| - {filename}')
        
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel(r'Impedancia ($\Omega$)')
        plt.grid(True, which="both", ls="-", alpha=0.2)
        plt.legend()
        plot_zmag = get_base64_plot(fig_z)
        plots.append({"id": "zmag", "title": "Impedancia |Z|", "image": plot_zmag})
        plt.close(fig_z)

        # --- Plot 4: Phase ---
        fig3 = plt.figure(figsize=(10, 6))
        plt.plot(freq_mhz, s11_deg, label='S11 Phase (°)', linewidth=1.5)
        if has_s21:
            plt.plot(freq_mhz, s21_deg, label='S21 Phase (°)', linewidth=1.5)
        plt.title(f'Fase de Parámetros S - {filename}')
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel('Fase (grados)')
        plt.grid(True, alpha=0.3)
        plt.legend()
        plot_phase = get_base64_plot(fig3)
        plots.append({"id": "phase", "title": "Fase (grados)", "image": plot_phase})
        plt.close(fig3)

        # --- Plot 5: Smith Chart S11 ---
        fig4 = plt.figure(figsize=(8, 8))
        ntw.plot_s_smith(m=0, n=0, label='S11')
        plt.title(f'Diagrama de Smith S11 - {filename}')
        plot_smith_s11 = get_base64_plot(fig4)
        plots.append({"id": "smith11", "title": "Smith S11", "image": plot_smith_s11})
        plt.close(fig4)

        # --- Plot 6: Smith Chart S21 (only if 2 ports) ---
        if has_s21:
            fig5 = plt.figure(figsize=(8, 8))
            ntw.plot_s_smith(m=1, n=0, label='S21')
            plt.title(f'Diagrama de Smith S21 - {filename}')
            plot_smith_s21 = get_base64_plot(fig5)
            plots.append({"id": "smith21", "title": "Smith S21", "image": plot_smith_s21})
            plt.close(fig5)

        # --- ZIP Generation ---
        import zipfile
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for p in plots:
                zip_file.writestr(f"{p['id']}_{filename}.png", base64.b64decode(p['image']))
            
            # Add CSV data
            header = "Freq_Hz,S11_dB,S11_Phase,VSWR,Return_Loss_dB"
            if n_ports == 1:
                header += ",Z_In_Mag_Ohm"
            else:
                header += ",Z_Series_Mag_Ohm,Z_Shunt_Mag_Ohm"
            if has_s21:
                header += ",S21_dB,S21_Phase"
            header += "\n"
            
            csv_content = header
            for i in range(len(freqs)):
                line = f"{freqs[i]},{s11_db[i]},{s11_deg[i]},{vswr[i]},{return_loss[i]}"
                if n_ports == 1:
                    line += f",{z_mag[i]}"
                else:
                    line += f",{z_mag[i]},{z_mag_shunt[i]}"
                if has_s21:
                    line += f",{s21_db[i]},{s21_deg[i]}"
                csv_content += line + "\n"
            zip_file.writestr(f"reporte_{filename}.csv", csv_content)

        zip_buffer.seek(0)
        zip_base64 = base64.b64encode(zip_buffer.read()).decode('utf-8')

        result_data = {
            "freq_hz": freqs.tolist(),
            "s11_db": s11_db.tolist(),
            "s11_phase": s11_deg.tolist(),
            "vswr": vswr.tolist(),
            "return_loss": return_loss.tolist(),
            "z_mag": z_mag.tolist(),
            "n_ports": n_ports
        }
        if n_ports > 1:
            result_data["z_mag_shunt"] = z_mag_shunt.tolist()
        if has_s21:
            result_data["s21_db"] = s21_db.tolist()
            result_data["s21_phase"] = s21_deg.tolist()

        return {
            "data": result_data,
            "plots": plots,
            "summary": {
                "min_s11": float(np.min(s11_db)),
                "max_s21": float(np.max(s21_db)) if has_s21 else None,
                "min_vswr": float(np.min(vswr))
            },
            "zip_content": zip_base64
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

def parse_complex(val):
    try:
        if isinstance(val, complex):
            return val
        if isinstance(val, str):
            s = val.strip().replace(' ', '')
            if s.startswith('(') and s.endswith(')'):
                s = s[1:-1]
            parts = s.split(',')
            if len(parts) == 2:
                return complex(float(parts[0]), float(parts[1]))
        return complex(val)
    except:
        return complex(0, 0)

def process_s_params_csv(file_content):
    try:
        import pandas as pd
        df = pd.read_csv(io.BytesIO(file_content))
    except Exception as e:
        raise ValueError(f"Error reading CSV: {e}")

    expected_cols = ['s11', 's21', 'freq_hz']
    cols = [c.lower().strip() for c in df.columns]
    
    col_map = {c: c.lower().strip() for c in df.columns}
    df = df.rename(columns=col_map)

    if not all(col in df.columns for col in expected_cols):
        raise ValueError(f"CSV missing columns. Found: {df.columns.tolist()}")

    df['S11_complex'] = df['s11'].apply(parse_complex)
    df['S21_complex'] = df['s21'].apply(parse_complex)
    
    freq_hz = df['freq_hz'].to_numpy()
    freq_mhz = freq_hz / 1e6
    
    eps = 1e-12
    S11_mag = np.abs(df['S11_complex'])
    S21_mag = np.abs(df['S21_complex'])
    S11_dB = 20 * np.log10(np.maximum(S11_mag, eps))
    S21_dB = 20 * np.log10(np.maximum(S21_mag, eps))
    S11_phase = np.angle(df['S11_complex'], deg=True)
    S21_phase = np.angle(df['S21_complex'], deg=True)

    # Plot Magnitude
    plt.figure(figsize=(10, 5))
    plt.plot(freq_mhz, S11_dB, label='S11 (dB)')
    plt.plot(freq_mhz, S21_dB, label='S21 (dB)')
    plt.title('Parámetros S - Magnitud en dB')
    plt.xlabel('Frecuencia (MHz)')
    plt.ylabel('Magnitud (dB)')
    plt.grid(True, alpha=0.3)
    plt.legend()
    
    buf_mag = io.BytesIO()
    plt.savefig(buf_mag, format='png')
    buf_mag.seek(0)
    plot_mag_base64 = base64.b64encode(buf_mag.read()).decode('utf-8')
    plt.close()

    # Plot Phase
    plt.figure(figsize=(10, 5))
    plt.plot(freq_mhz, S11_phase, label='S11 (°)')
    plt.plot(freq_mhz, S21_phase, label='S21 (°)')
    plt.title('Parámetros S - Fase (grados)')
    plt.xlabel('Frecuencia (MHz)')
    plt.ylabel('Fase (°)')
    plt.grid(True, alpha=0.3)
    plt.legend()
    
    buf_phase = io.BytesIO()
    plt.savefig(buf_phase, format='png')
    buf_phase.seek(0)
    plot_phase_base64 = base64.b64encode(buf_phase.read()).decode('utf-8')
    plt.close()

    return {
        "data": {
            "freq_hz": freq_hz.tolist(),
            "s11_db": S11_dB.tolist(),
            "s21_db": S21_dB.tolist(),
            "s11_phase": S11_phase.tolist(),
            "s21_phase": S21_phase.tolist()
        },
        "plots": {
            "magnitude": plot_mag_base64,
            "phase": plot_phase_base64
        }
    }
