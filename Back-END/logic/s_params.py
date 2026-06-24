import numpy as np
import matplotlib.pyplot as plt
import io
import base64
import matplotlib
import skrf as rf
import os
matplotlib.use('Agg')

def process_s_params_touchstone(file_content, filename):
    # Check for port mapping comments
    p1 = 1
    p2 = 2
    try:
        lines = file_content.decode('utf-8', errors='ignore').split('\n')
        for line in lines:
            line_str = line.strip()
            if line_str.startswith('!'):
                if "Port Mapping:" in line_str:
                    import re
                    m1 = re.search(r'Port 1\s*=\s*Physical Port\s*(\d+)', line_str)
                    m2 = re.search(r'Port 2\s*=\s*Physical Port\s*(\d+)', line_str)
                    if m1:
                        p1 = int(m1.group(1))
                    if m2:
                        p2 = int(m2.group(1))
                    break
    except Exception as e:
        print(f"Error parsing port mapping from touchstone file: {e}")

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
            s11_complex = ntw.s[:, 0, 0]
            z_data = 50.0 * (1.0 + s11_complex) / (1.0 - s11_complex + 1e-30)
            z_mag = np.maximum(np.abs(z_data), 1e-12)
            z_mag_shunt = None
        else:
            s21_complex = ntw.s[:, 1, 0]
            z_series = 100.0 * (1.0 - s21_complex) / (s21_complex + 1e-30)
            z_mag = np.maximum(np.abs(z_series), 1e-12)
            z_shunt = 25.0 * s21_complex / (1.0 - s21_complex + 1e-30)
            z_mag_shunt = np.maximum(np.abs(z_shunt), 1e-12)

        # ── IEEE Transactions style constants ────────────────────────────────
        _IEEE_BLACK  = '#000000'
        _IEEE_BLUE   = '#0072BD'
        _IEEE_RED    = '#D62728'
        _IEEE_ORANGE = '#E87722'
        _IEEE_GREEN  = '#228B22'
        _IEEE_PURPLE = '#7E2F8E'
        _FIG_W, _FIG_H = 5.0, 3.75   # single-column equivalent for web display

        def _ieee_rcparams():
            plt.rcParams.update({
                'font.family':        'serif',
                'font.serif':         ['Times New Roman', 'DejaVu Serif', 'Liberation Serif', 'serif'],
                'font.size':          9,
                'axes.labelsize':     9,
                'xtick.labelsize':    8,
                'ytick.labelsize':    8,
                'legend.fontsize':    8,
                'axes.linewidth':     0.8,
                'xtick.major.width':  0.8,
                'ytick.major.width':  0.8,
                'xtick.minor.width':  0.6,
                'ytick.minor.width':  0.6,
                'xtick.major.size':   4,
                'ytick.major.size':   4,
                'xtick.minor.size':   2,
                'ytick.minor.size':   2,
                'xtick.direction':    'in',
                'ytick.direction':    'in',
                'legend.framealpha':  1.0,
                'legend.edgecolor':   _IEEE_BLACK,
                'legend.fancybox':    False,
            })

        def _apply_ieee_axes(ax, xlabel, ylabel, xlim=None, ylim=None, log_xy=False):
            """Remove top/right spines and apply grid/tick IEEE style."""
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
            ax.tick_params(which='both', direction='in', top=False, right=False)
            ax.grid(True, which='both' if log_xy else 'major',
                    linestyle=':', linewidth=0.4, color='#CCCCCC', zorder=0)
            ax.set_xlabel(xlabel)
            ax.set_ylabel(ylabel)
            if xlim is not None:
                ax.set_xlim(xlim)
            if ylim is not None:
                ax.set_ylim(ylim)
            ax.legend(loc='best', frameon=True)

        def get_base64_plot(fig):
            buf = io.BytesIO()
            fig.savefig(buf, format='svg', bbox_inches='tight', pad_inches=0.02)
            buf.seek(0)
            return base64.b64encode(buf.read()).decode('utf-8')

        plots = []
        _ieee_rcparams()

        # --- Plot 1: S11 (dB) ---
        fig1, ax1 = plt.subplots(figsize=(_FIG_W, _FIG_H))
        ax1.plot(freq_mhz, s11_db,
                 label=f'$S_{{{p1}{p1}}}$ (dB)',
                 color=_IEEE_BLACK, linestyle='-', linewidth=1.2)
        _apply_ieee_axes(ax1, 'Frequency (MHz)', 'Magnitude (dB)',
                         xlim=(np.min(freq_mhz), np.max(freq_mhz)))
        fig1.tight_layout()
        plot_s11 = get_base64_plot(fig1)
        plots.append({"id": "s11", "title": f"S{p1}{p1} Magnitude", "image": plot_s11})
        plt.close(fig1)

        # --- Plot 2: S21 (dB) ---
        if has_s21:
            fig2, ax2 = plt.subplots(figsize=(_FIG_W, _FIG_H))
            ax2.plot(freq_mhz, s21_db,
                     label=f'$S_{{{p2}{p1}}}$ (dB)',
                     color=_IEEE_BLUE, linestyle='-', linewidth=1.2)
            _apply_ieee_axes(ax2, 'Frequency (MHz)', 'Magnitude (dB)',
                             xlim=(np.min(freq_mhz), np.max(freq_mhz)))
            fig2.tight_layout()
            plot_s21 = get_base64_plot(fig2)
            plots.append({"id": "s21", "title": f"S{p2}{p1} Magnitude", "image": plot_s21})
            plt.close(fig2)

        # --- Plot 3a: Series Impedance Magnitude (log–log) ---
        fig_zs, ax_zs = plt.subplots(figsize=(_FIG_W, _FIG_H))
        srf_ser_idx = int(np.argmin(z_mag))
        srf_ser_hz  = float(freq_mhz[srf_ser_idx])
        srf_ser_str = (f'{srf_ser_hz*1e3:.2f} kHz' if srf_ser_hz < 1
                       else f'{srf_ser_hz:.3f} MHz' if srf_ser_hz < 1e3
                       else f'{srf_ser_hz/1e3:.3f} GHz')
        z_base_label = '|Z|' if n_ports == 1 else '|Z_series|'
        z_label = f'{z_base_label} (Ω)  —  $f_{{\\rm res}}$ = {srf_ser_str}'
        ax_zs.loglog(freq_mhz, z_mag,
                     color=_IEEE_BLUE, linestyle='-', linewidth=1.2,
                     label=z_label)
        ax_zs.axvline(x=srf_ser_hz,
                      color=_IEEE_BLACK, linestyle=':', linewidth=0.8)
        min_val_ser = float(np.min(z_mag))
        ax_zs.axhline(y=min_val_ser,
                      color=_IEEE_BLACK, linestyle='--', linewidth=0.8,
                      label=f'ESR = {min_val_ser:.3f} Ω')
        _apply_ieee_axes(ax_zs, 'Frequency (MHz)', 'Impedance (Ω)',
                         xlim=(np.min(freq_mhz), np.max(freq_mhz)), log_xy=True)
        fig_zs.tight_layout()
        plot_z_series = get_base64_plot(fig_zs)
        plots.append({"id": "zmag_series",
                      "title": "|Z| Series" if n_ports > 1 else "|Z|",
                      "image": plot_z_series})
        plt.close(fig_zs)

        # --- Plot 3b: Shunt Impedance Magnitude (log–log) ---
        if n_ports > 1:
            fig_zsh, ax_zsh = plt.subplots(figsize=(_FIG_W, _FIG_H))
            srf_sh_idx = int(np.argmin(z_mag_shunt))
            srf_sh_hz  = float(freq_mhz[srf_sh_idx])
            srf_sh_str = (f'{srf_sh_hz*1e3:.2f} kHz' if srf_sh_hz < 1
                          else f'{srf_sh_hz:.3f} MHz' if srf_sh_hz < 1e3
                          else f'{srf_sh_hz/1e3:.3f} GHz')
            ax_zsh.loglog(freq_mhz, z_mag_shunt,
                          color=_IEEE_RED, linestyle='-', linewidth=1.2,
                          label=f'|Z_shunt| (Ω)  —  $f_{{\\rm res}}$ = {srf_sh_str}')
            ax_zsh.axvline(x=srf_sh_hz,
                           color=_IEEE_BLACK, linestyle=':', linewidth=0.8)
            min_val_sh = float(np.min(z_mag_shunt))
            ax_zsh.axhline(y=min_val_sh,
                           color=_IEEE_BLACK, linestyle='--', linewidth=0.8,
                           label=f'ESR = {min_val_sh:.3f} Ω')
            _apply_ieee_axes(ax_zsh, 'Frequency (MHz)', 'Impedance (Ω)',
                             xlim=(np.min(freq_mhz), np.max(freq_mhz)), log_xy=True)
            fig_zsh.tight_layout()
            plot_z_shunt = get_base64_plot(fig_zsh)
            plots.append({"id": "zmag_shunt", "title": "|Z| Shunt", "image": plot_z_shunt})
            plt.close(fig_zsh)

        # --- Plot 4: Phase ---
        fig3, ax3 = plt.subplots(figsize=(_FIG_W, _FIG_H))
        ax3.plot(freq_mhz, s11_deg,
                 label=f'$S_{{{p1}{p1}}}$ (deg)',
                 color=_IEEE_BLACK, linestyle='-', linewidth=1.2)
        if has_s21:
            ax3.plot(freq_mhz, s21_deg,
                     label=f'$S_{{{p2}{p1}}}$ (deg)',
                     color=_IEEE_BLUE, linestyle='--', linewidth=1.2)
        _apply_ieee_axes(ax3, 'Frequency (MHz)', 'Phase (°)',
                         xlim=(np.min(freq_mhz), np.max(freq_mhz)))
        fig3.tight_layout()
        plot_phase = get_base64_plot(fig3)
        plots.append({"id": "phase", "title": "Phase (degrees)", "image": plot_phase})
        plt.close(fig3)

        # --- Plot 5: Smith Chart S11 ---
        fig4, ax4 = plt.subplots(figsize=(4.5, 4.5))
        ntw.plot_s_smith(m=0, n=0, label=f'$S_{{{p1}{p1}}}$', ax=ax4, color=_IEEE_BLACK, linewidth=1.2)
        ax4.legend(loc='lower right', frameon=True, fontsize=8)
        fig4.tight_layout()
        plot_smith_s11 = get_base64_plot(fig4)
        plots.append({"id": "smith11", "title": f"Smith Chart S{p1}{p1}", "image": plot_smith_s11})
        plt.close(fig4)

        # --- Plot 6: Smith Chart S21 (only if 2 ports) ---
        if has_s21:
            fig5, ax5 = plt.subplots(figsize=(4.5, 4.5))
            ntw.plot_s_smith(m=1, n=0, label=f'$S_{{{p2}{p1}}}$', ax=ax5, color=_IEEE_BLUE, linewidth=1.2)
            ax5.legend(loc='lower right', frameon=True, fontsize=8)
            fig5.tight_layout()
            plot_smith_s21 = get_base64_plot(fig5)
            plots.append({"id": "smith21", "title": f"Smith Chart S{p2}{p1}", "image": plot_smith_s21})
            plt.close(fig5)

        # --- ZIP Generation ---
        import zipfile
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for p in plots:
                zip_file.writestr(f"{p['id']}_{filename}.svg", base64.b64decode(p['image']))
            
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
            "n_ports": n_ports,
            "port1": p1,
            "port2": p2
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
