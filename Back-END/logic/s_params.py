import numpy as np
import matplotlib.pyplot as plt
import io
import base64
import matplotlib
import skrf as rf
import os
matplotlib.use('Agg')

def process_s_params_s2p(file_content, filename):
    # Save to a temporary file for skrf to read
    temp_path = f"temp_analysis_{filename}"
    with open(temp_path, "wb") as f:
        f.write(file_content)
    
    try:
        ntw = rf.Network(temp_path)
        freqs = ntw.f
        freq_mhz = freqs / 1e6
        
        # S-parameters metrics
        s11_db = ntw.s_db[:, 0, 0]
        s21_db = ntw.s_db[:, 1, 0]
        s11_deg = ntw.s_deg[:, 0, 0]
        s21_deg = ntw.s_deg[:, 1, 0]
        
        # New Metrics: VSWR and Return Loss
        vswr = ntw.s_vswr[:, 0, 0]
        return_loss = -s11_db 

        def get_base64_plot(fig):
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=150)
            buf.seek(0)
            return base64.b64encode(buf.read()).decode('utf-8')

        # --- Plot 1: Magnitude (dB) ---
        fig1 = plt.figure(figsize=(10, 6))
        plt.plot(freq_mhz, s11_db, label='S11 (dB)', linewidth=1.5)
        plt.plot(freq_mhz, s21_db, label='S21 (dB)', linewidth=1.5)
        plt.title(f'Magnitud Parámetros S - {filename}')
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel('Magnitud (dB)')
        plt.grid(True, alpha=0.3)
        plt.legend()
        plot_mag = get_base64_plot(fig1)
        plt.close(fig1)

        # --- Plot 2: VSWR ---
        fig2 = plt.figure(figsize=(10, 6))
        plt.plot(freq_mhz, vswr, color='orange', label='VSWR Port 1', linewidth=1.5)
        plt.title(f'VSWR - {filename}')
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel('VSWR')
        plt.ylim(1, max(min(np.max(vswr), 10), 2))
        plt.grid(True, alpha=0.3)
        plt.legend()
        plot_vswr = get_base64_plot(fig2)
        plt.close(fig2)

        # --- Plot 3: Phase ---
        fig3 = plt.figure(figsize=(10, 6))
        plt.plot(freq_mhz, s11_deg, label='S11 Phase (°)', linewidth=1.5)
        plt.plot(freq_mhz, s21_deg, label='S21 Phase (°)', linewidth=1.5)
        plt.title(f'Fase de Parámetros S - {filename}')
        plt.xlabel('Frecuencia (MHz)')
        plt.ylabel('Fase (grados)')
        plt.grid(True, alpha=0.3)
        plt.legend()
        plot_phase = get_base64_plot(fig3)
        plt.close(fig3)

        # --- Plot 4: Smith Chart S11 ---
        fig4 = plt.figure(figsize=(8, 8))
        ntw.plot_s_smith(m=0, n=0, label='S11')
        plt.title(f'Diagrama de Smith S11 - {filename}')
        plot_smith_s11 = get_base64_plot(fig4)
        plt.close(fig4)

        # --- Plot 5: Smith Chart S21 ---
        fig5 = plt.figure(figsize=(8, 8))
        ntw.plot_s_smith(m=1, n=0, label='S21')
        plt.title(f'Diagrama de Smith S21 - {filename}')
        plot_smith_s21 = get_base64_plot(fig5)
        plt.close(fig5)

        # --- ZIP Generation ---
        import zipfile
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Add Plots
            zip_file.writestr(f"magnitud_{filename}.png", base64.b64decode(plot_mag))
            zip_file.writestr(f"fase_{filename}.png", base64.b64decode(plot_phase))
            zip_file.writestr(f"vswr_{filename}.png", base64.b64decode(plot_vswr))
            zip_file.writestr(f"smith_s11_{filename}.png", base64.b64decode(plot_smith_s11))
            zip_file.writestr(f"smith_s21_{filename}.png", base64.b64decode(plot_smith_s21))
            
            # 2. Add CSV data
            csv_content = "Freq_Hz,S11_dB,S21_dB,S11_Phase,S21_Phase,VSWR,Return_Loss_dB\n"
            for i in range(len(freqs)):
                csv_content += f"{freqs[i]},{s11_db[i]},{s21_db[i]},{s11_deg[i]},{s21_deg[i]},{vswr[i]},{return_loss[i]}\n"
            zip_file.writestr(f"reporte_{filename}.csv", csv_content)

        zip_buffer.seek(0)
        zip_base64 = base64.b64encode(zip_buffer.read()).decode('utf-8')

        return {
            "data": {
                "freq_hz": freqs.tolist(),
                "s11_db": s11_db.tolist(),
                "s21_db": s21_db.tolist(),
                "s11_phase": s11_deg.tolist(),
                "s21_phase": s21_deg.tolist(),
                "vswr": vswr.tolist(),
                "return_loss": return_loss.tolist()
            },
            "plots": [
                {"id": "mag", "title": "Magnitud (dB)", "image": plot_mag},
                {"id": "phase", "title": "Fase (grados)", "image": plot_phase},
                {"id": "vswr", "title": "VSWR", "image": plot_vswr},
                {"id": "smith11", "title": "Smith S11", "image": plot_smith_s11},
                {"id": "smith21", "title": "Smith S21", "image": plot_smith_s21},
            ],
            "summary": {
                "min_s11": float(np.min(s11_db)),
                "max_s21": float(np.max(s21_db)),
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