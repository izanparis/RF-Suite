import pynanovna
import pynanovna.calibration
import numpy as np
import io
import base64
import matplotlib
import time
import sys
import glob
import serial
import os
import tempfile
from typing import List, Optional

try:
    import pyvisa
except ImportError:
    pyvisa = None

matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Configuración verificada para el entorno del usuario
KEYSIGHT_VISA_PATH = r'C:\Program Files\IVI Foundation\VISA\Win64\ktvisa\ktbin\visa32.dll'

class HP8752A:
    def __init__(self, resource_name="GPIB0::16::INSTR"):
        if pyvisa is None:
            raise ImportError("pyvisa not installed. Please install it to use HP8752A.")
        
        self.inst = None
        self.connected = False
        self.device_type = "HP8752A"
        self.last_cal_mode = "none"

        try:
            self.rm = pyvisa.ResourceManager(KEYSIGHT_VISA_PATH)
        except Exception as e:
            print(f"Error cargando libreria Keysight: {e}. Usando default.")
            self.rm = pyvisa.ResourceManager()
            
        try:
            self.inst = self.rm.open_resource(resource_name)
            self.inst.timeout = 15000 
            self.inst.send_end = True 
            self.inst.read_termination = None
            self.inst.write_termination = None
            self.inst.chunk_size = 102400
            
            try:
                if hasattr(self.inst, 'clear'):
                    self.inst.clear()
                    time.sleep(0.5)
            except: pass
            
            self.connected = True
            print(f"HP8752A conectado en {resource_name}")
            self.get_errors()
        except Exception as e:
            print(f"Error connecting to HP8752A: {e}")
            self.connected = False

    def set_sweep(self, start_hz, stop_hz, points):
        if not self.connected or not self.inst: return
        
        print(f"Configurando barrido: {start_hz}Hz - {stop_hz}Hz ({points} pts)")
        self.inst.write(f"STAR {start_hz:.1e} HZ;")
        self.inst.write(f"STOP {stop_hz:.1e} HZ;")
        self.inst.write(f"POIN {int(points)};")
        time.sleep(1.0)
        self.get_errors()
        self.inst.write("CORRON;")

    def get_data(self, parameter="S11"):
        if not self.connected or not self.inst: raise ConnectionError("VNA desconectado")

        orig_timeout = self.inst.timeout
        try:
            self.inst.timeout = 45000
            print(f"Capturando {parameter}...")
            self.inst.write(f"{parameter}; OPC?; SING;")
            
            res = self.inst.read().strip()
            if res != "1": print(f"OPC? sync warning: {res}")

            self.inst.write("STAR?;")
            start = float(self.inst.read().strip())
            self.inst.write("STOP?;")
            stop = float(self.inst.read().strip())
            self.inst.write("POIN?;")
            points = int(float(self.inst.read().strip()))
            freqs = np.linspace(start, stop, points)

            self.inst.write("FORM4; OUTPDATA;")
            data_raw = self.inst.read().strip()
            
            import re
            clean_str = re.sub(r'[^0-9.eE+,-]', ' ', data_raw)
            data_vals = [float(v) for v in clean_str.replace(',', ' ').split() if v.strip()]
            complex_data = np.array(data_vals[0::2]) + 1j * np.array(data_vals[1::2])

            if len(complex_data) > len(freqs): complex_data = complex_data[:len(freqs)]
            elif len(complex_data) < len(freqs):
                padded = np.zeros(len(freqs), dtype=complex)
                padded[:len(complex_data)] = complex_data
                complex_data = padded

            self.inst.write("CONT;") 
            return freqs, complex_data
        except Exception as e:
            print(f"Error en get_data: {e}")
            try: self.inst.clear()
            except: pass
            raise e
        finally:
            self.inst.timeout = orig_timeout

    def hp_measurement_step(self, step_name, params=None):
        if not self.connected or not self.inst: return "Disconnected"
        if step_name == "setup":
            self.set_sweep(params.get('start_hz'), params.get('stop_hz'), params.get('points'))
            self.inst.write(f"{params.get('parameter', 'S11')}; LOGM;")
            return "OK"
        elif step_name == "measure":
            self.inst.write("OPC?; SING;")
            self.inst.read()
            return "OK"
        elif step_name == "download":
            freqs, data = self.get_data(params.get('parameter', 'S11'))
            return {"freqs": freqs.tolist(), "real": np.real(data).tolist(), "imag": np.imag(data).tolist()}
        return "Unknown"

    def stream(self, parameter="S11"):
        freqs, data = self.get_data(parameter)
        if parameter == "S11": yield data, np.zeros_like(data), freqs
        else: yield np.zeros_like(data), data, freqs

    def get_errors(self):
        if not self.inst: return
        try:
            self.inst.write("OUTPERRO;")
            err = self.inst.read().strip()
            if err and not err.startswith("0"):
                print(f"VNA Error: {err}")
                return err
        except: pass
        return None

    def hp_calibration_step(self, cal_type, step_cmd):
        if not self.connected or not self.inst: raise ConnectionError("VNA desconectado")
        
        cmd_upper = step_cmd.upper()
        if "PRES" in cmd_upper:
            self.inst.write("PRES;")
            time.sleep(2); self.inst.write("CONT;")
            return "OK"

        # Comandos que requieren sincronización (Medidas y Cálculos)
        wait_cmds = ["DONE", "RAID", "SAV", "CLASS", "STAN", "THRU", "SING", "RAIRESP", "RAIISOL"]
        requires_wait = any(c in cmd_upper for c in wait_cmds)

        orig_timeout = self.inst.timeout
        try:
            if requires_wait:
                self.inst.timeout = 60000
                print(f"Sincronizando: {step_cmd}")
                self.inst.write(f"OPC?; {step_cmd}")
                self.inst.read()
            else:
                self.inst.write(step_cmd)
                time.sleep(0.2)
            return "OK"
        except Exception as e:
            print(f"Error en paso {step_cmd}: {e}")
            try: self.inst.clear()
            except: pass
            raise e
        finally:
            self.inst.timeout = orig_timeout

    def export_cal_json(self):
        if not self.connected or not self.inst: return None
        
        # Detectar tipo de calibración (S11 o RAI)
        active_cal = "NONE"; num_arrays = 0
        
        # Intentar detectar cual está activa
        try:
            self.inst.write("CALIS111?")
            if self.inst.read().strip() == "1":
                active_cal = "CALIS111"
                num_arrays = 3
        except: pass

        if active_cal == "NONE":
            try:
                self.inst.write("CALIRAI?")
                if self.inst.read().strip() == "1":
                    active_cal = "CALIRAI"
                    num_arrays = 2 # RAI tiene 2 arrays: Response e Isolation
            except: pass

        if active_cal == "NONE":
            print("No se detectó calibración activa de 1-Port o RAI.")
            return None

        print(f"Exportando calibración activa: {active_cal} ({num_arrays} arrays)")

        state = {
            "vna_model": "HP8752A",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "cal_type": active_cal,
            "arrays": {}
        }

        orig_timeout = self.inst.timeout
        try:
            self.inst.timeout = 60000; self.inst.write("FORM4;") 
            for i in range(1, num_arrays + 1):
                self.inst.write(f"OUTPCALC{i:02d};")
                state["arrays"][f"array_{i}"] = self.inst.read().strip()
            
            self.inst.write("STAR?;"); state["start_hz"] = float(self.inst.read().strip())
            self.inst.write("STOP?;"); state["stop_hz"] = float(self.inst.read().strip())
            self.inst.write("POIN?;"); state["points"] = int(float(self.inst.read().strip()))
            
            self.inst.write("CONT;")
            return state
        finally:
            self.inst.timeout = orig_timeout

    def import_cal_json(self, state):
        if not self.connected or not self.inst: return False
            
        print(f"Restaurando {state.get('cal_type')}...")
        try: self.inst.clear(); time.sleep(0.2)
        except: pass
        
        self.inst.write("HOLD;")
        self.inst.write(f"STAR {state['start_hz']:.1e} HZ;")
        self.inst.write(f"STOP {state['stop_hz']:.1e} HZ;")
        self.inst.write(f"POIN {state['points']};")
        time.sleep(1.0)
        
        cal_type = state.get("cal_type", "CALIS111")
        if cal_type == "CALIS11": cal_type = "CALIS111"
            
        self.inst.write("CALKN50;") 
        param = "S11" if "S11" in cal_type else "S21"
        self.inst.write(f"{param}; {cal_type};")
        time.sleep(0.5)

        orig_timeout = self.inst.timeout
        try:
            self.inst.timeout = 60000 
            sorted_keys = sorted(state["arrays"].keys(), key=lambda x: int(x.split('_')[1]))
            for arr_key in sorted_keys:
                data = state["arrays"][arr_key]
                num = int(arr_key.split('_')[1])
                clean_data = data.replace('\r', '').replace('\n', ',').replace(' ', '')
                while ',,' in clean_data: clean_data = clean_data.replace(',,', ',')
                clean_data = clean_data.strip(',')
                
                self.inst.write(f"FORM4; INPUCALC{num:02d}{clean_data};")
                time.sleep(0.5 + (int(state['points']) / 400.0))

            print("Finalizando restauración...")
            done_cmd = "RAID" if "RAI" in cal_type else "DONE"
            self.inst.write(f"OPC?; {done_cmd}"); self.inst.read()
            self.inst.write("OPC?; SAVC"); self.inst.read()
            self.inst.write("CORRON; CONT;")
            return True
        finally:
            self.inst.timeout = orig_timeout
            time.sleep(0.5)

# --- FUNCIONES NANOVNA (INALTERADAS) ---

def list_serial_ports() -> List[str]:
    if sys.platform.startswith('win'):
        ports = ['COM%s' % (i + 1) for i in range(256)]
    elif sys.platform.startswith('linux') or sys.platform.startswith('cygwin'):
        ports = glob.glob('/dev/tty[A-Za-z]*')
    elif sys.platform.startswith('darwin'):
        ports = glob.glob('/dev/tty.*')
    else:
        raise EnvironmentError('Unsupported platform')

    result = []
    for port in ports:
        try:
            s = serial.Serial(port)
            s.close()
            result.append(port)
        except (OSError, serial.SerialException):
            pass
    return result

def get_vna_connection(device_type="NanoVNA", resource_name=None):
    if device_type == "HP8752A":
        if pyvisa is None: raise ImportError("pyvisa no instalado.")
        if resource_name is None: resource_name = "GPIB0::16::INSTR"
        return HP8752A(resource_name)

    print(f"Searching for {device_type}...")
    try:
        vna = pynanovna.VNA(0)
        if vna.connected: return vna
    except: pass
    raise ConnectionError("VNA no detectado.")

def start_calibration(vna, start_hz, stop_hz, points, device_type="NanoVNA"):
    print(f"Starting new calibration session for {device_type}...")
    
    if device_type == "HP8752A":
        # Para HP, el reset se maneja via comandos GPIB (PRESET ya se envía si se solicita)
        vna.set_sweep(start_hz, stop_hz, points)
        return {"status": "HP Sweep configured"}
    
    # Para NanoVNA, es CRÍTICO resetear el objeto de calibración
    # para evitar que se acumulen puntos de sesiones anteriores (el error de los 1300 puntos)
    try:
        if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
            vna.iface.reset_input_buffer()
        
        # Resetear el dataset de calibración
        vna.calibration = pynanovna.calibration.Calibration()
        print("NanoVNA calibration object reset successfully.")
        
        # Configurar el barrido
        vna.set_sweep(start_hz, stop_hz, points)
        vna.sweep_frequencies = np.linspace(start_hz, stop_hz, points)
        print(f"Sweep set to {start_hz} - {stop_hz} Hz with {points} points.")
        
        return {"status": "Calibration started and dataset reset"}
    except Exception as e:
        print(f"Error starting NanoVNA calibration: {e}")
        raise RuntimeError(f"Could not start calibration: {str(e)}")

def calibrate_step(vna, step: str):
    try:
        print(f"Executing calibration step: {step}")
        if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
            vna.iface.reset_input_buffer()
        
        # Adquirir trazas del sweep
        s11, s21, frequencies = vna.sweep()
        
        # Alinear frecuencias para evitar descuadres por jitter serial o redondeo
        if hasattr(vna, 'sweep_frequencies') and len(frequencies) == len(vna.sweep_frequencies):
            frequencies = vna.sweep_frequencies
            
        frequencies_int = np.round(frequencies).astype(int)
        
        # Guardar en el objeto de calibración
        vna.calibration.calibration_step(step, s11, s21, frequencies_int)
        if step == "through":
            vna.calibration.calibration_step("thrurefl", s11, s21, frequencies_int)
        
        # Loggear info del dataset actual
        if hasattr(vna, 'calibration') and hasattr(vna.calibration, 'dataset'):
            ds = vna.calibration.dataset
            points = len(ds.frequencies())
            print(f"Step {step} recorded. Total frequency points in dataset: {points}")
            
            # Verificar integridad para el paso actual
            count = 0
            for freq in ds.frequencies():
                val = ds.data.get(freq)
                if val and getattr(val, step) is not None:
                    count += 1
            print(f"Valid points for {step}: {count}/{points}")
            
        # Calcular magnitudes en dB para graficar
        s11_arr = np.asarray(s11)
        s21_arr = np.asarray(s21) if s21 is not None else None
        
        if step == "through" and s21_arr is not None:
            trace_db = 20 * np.log10(np.maximum(np.abs(s21_arr), 1e-12))
            label = "S21 (dB)"
            color = "red"
        else:
            trace_db = 20 * np.log10(np.maximum(np.abs(s11_arr), 1e-12))
            label = "S11 (dB)"
            color = "blue"
            
        # Generar gráfico simple
        plt.figure(figsize=(6, 3))
        plt.plot(frequencies_int/1e6, trace_db, label=label, color=color, linewidth=1.5)
        plt.title(f"Medición Estándar: {step.upper()}")
        plt.xlabel("Frecuencia (MHz)")
        plt.ylabel("Magnitud (dB)")
        plt.grid(True, alpha=0.3)
        plt.legend()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()
        
        return {
            "status": f"Step {step} completed",
            "freqs": (frequencies_int / 1e6).tolist(),
            "db_data": trace_db.tolist(),
            "plot": plot_base64
        }
    except Exception as e:
        print(f"Error during calibration step '{step}': {str(e)}")
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Error during calibration step '{step}': {str(e)}")

def finalize_calibration(vna, save_path=None, cal_type="twoport"):
    print(f"Finalizing calibration (type={cal_type})...")
    try:
        # Limpiar buffers
        if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
            vna.iface.reset_input_buffer()
        
        # Verificar integridad antes de calcular
        if hasattr(vna, 'calibration') and hasattr(vna.calibration, 'dataset'):
            ds = vna.calibration.dataset
            freqs = ds.frequencies()
            print(f"Integrity check: {len(freqs)} frequency points found.")
            
            missing_short = [f for f in freqs if ds.data[f].short is None]
            missing_open = [f for f in freqs if ds.data[f].open is None]
            missing_load = [f for f in freqs if ds.data[f].load is None]
            
            if missing_short or missing_open or missing_load:
                print(f"CRITICAL: Missing points! Short: {len(missing_short)}, Open: {len(missing_open)}, Load: {len(missing_load)}")
                # Intentar "limpiar" el dataset si hay puntos huérfanos por jitter de frecuencia
                # Si un punto tiene Open y Short pero no Load, y hay otro punto muy cercano que tiene solo Load,
                # podríamos intentar unirlos. Pero pynanovna es estricto con los tipos de datos.
        
        # Enviar comando de calibración al VNA
        print("Sending calibrate command to NanoVNA (calc_corrections)...")
        vna.calibrate()
        
        # Esperar a que el VNA procese y calcule los coeficientes
        print("Waiting for VNA to compute coefficients...")
        time.sleep(2.0)
        
        # Crear un archivo temporal para guardar la calibración
        fd, temp_filename = tempfile.mkstemp(suffix=".cal")
        os.close(fd) 
        
        try:
            print(f"Saving calibration to temporary file: {temp_filename}")
            # Intentar guardar con reintentos
            max_save_retries = 2
            for i in range(max_save_retries):
                try:
                    vna.save_calibration(temp_filename)
                    if os.path.exists(temp_filename) and os.path.getsize(temp_filename) > 0:
                        break
                except Exception as save_err:
                    print(f"Save attempt {i+1} failed: {save_err}")
                    if i == max_save_retries - 1:
                        raise save_err
                    time.sleep(1.0)

            if os.path.exists(temp_filename) and os.path.getsize(temp_filename) > 0:
                with open(temp_filename, "rb") as f:
                    content = f.read()
                content_base64 = base64.b64encode(content).decode('utf-8')
                print("Calibration finalized and encoded successfully.")
                return {
                    "status": "success",
                    "file_content": content_base64,
                    "suggested_name": f"cal_{time.strftime('%Y%m%d_%H%M%S')}.cal"
                }
            else:
                return {"status": "error", "message": "Failed to generate calibration file or file is empty."}
        finally:
            if os.path.exists(temp_filename):
                try: 
                    os.remove(temp_filename)
                    print("Temporary calibration file cleaned up.")
                except: pass
    except Exception as e:
        print(f"Error during calibration finalization: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Error finalizing calibration: {str(e)}"}

def _smooth_complex_trace(trace, window):
    """Smooth real/imag traces with a centered moving average."""
    window = int(window or 1)
    if window <= 1 or trace is None or len(trace) < 3:
        return trace
    if window % 2 == 0:
        window += 1
    window = min(window, len(trace) if len(trace) % 2 == 1 else len(trace) - 1)
    if window <= 1:
        return trace

    kernel = np.ones(window, dtype=float) / window
    pad = window // 2
    real = np.convolve(np.pad(np.real(trace), pad, mode="edge"), kernel, mode="valid")
    imag = np.convolve(np.pad(np.imag(trace), pad, mode="edge"), kernel, mode="valid")
    return real + 1j * imag

def generate_ieee_measurement_plot(freqs, s11, s21=None, port1=1, port2=2, is_one_port=True):
    """Generate an IEEE Transactions-style S-parameter SVG plot."""
    import io
    import base64
    import numpy as np
    import matplotlib.pyplot as plt

    _BLACK  = '#000000'
    _BLUE   = '#0072BD'

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
        'xtick.major.size':   4,
        'ytick.major.size':   4,
        'xtick.minor.size':   2,
        'ytick.minor.size':   2,
        'xtick.direction':    'in',
        'ytick.direction':    'in',
        'legend.framealpha':  1.0,
        'legend.edgecolor':   _BLACK,
        'legend.fancybox':    False,
    })

    fig, ax = plt.subplots(figsize=(5.0, 3.75))

    freq_mhz = np.asarray(freqs) / 1e6
    s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))

    ax.plot(freq_mhz, s11_db,
            label=f'$S_{{{port1}{port1}}}$ (dB)',
            color=_BLACK, linestyle='-', linewidth=1.2)

    if not is_one_port and s21 is not None and len(s21) > 0:
        s21_db = 20 * np.log10(np.maximum(np.abs(s21), 1e-12))
        ax.plot(freq_mhz, s21_db,
                label=f'$S_{{{port2}{port1}}}$ (dB)',
                color=_BLUE, linestyle='--', linewidth=1.2)

    ax.set_xlabel('Frequency (MHz)')
    ax.set_ylabel('Magnitude (dB)')
    ax.set_xlim(np.min(freq_mhz), np.max(freq_mhz))

    # IEEE spines and grid
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.tick_params(which='both', direction='in', top=False, right=False)
    ax.grid(True, which='major', linestyle=':', linewidth=0.4, color='#CCCCCC', zorder=0)

    ax.legend(loc='best', frameon=True)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='svg', bbox_inches='tight', pad_inches=0.02)
    buf.seek(0)
    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)

    return plot_base64

def process_sweep(vna, one_port=False, averaging_count=1, smoothing_window=1):
    averaging_count = max(1, int(averaging_count or 1))
    smoothing_window = max(1, int(smoothing_window or 1))
    print(f"Starting sweep process (one_port={one_port}, averaging={averaging_count}, smoothing={smoothing_window})...")
    
    # Intentar capturar el stream con reintentos si falla la primera vez
    max_retries = 3
    s11, s21, freqs = None, None, None
    
    for attempt in range(max_retries):
        try:
            # Algunas versiones de pynanovna pueden requerir limpiar el buffer antes
            if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
                vna.iface.reset_input_buffer()
            
            s11_samples = []
            s21_samples = []
            freq_samples = []
            for avg_idx in range(averaging_count):
                stream = vna.stream()
                sample_s11, sample_s21, sample_freqs = next(stream)
                sample_s11 = np.asarray(sample_s11)
                sample_s21 = np.asarray(sample_s21) if sample_s21 is not None else None
                sample_freqs = np.asarray(sample_freqs)

                if sample_s11.size == 0 or sample_freqs.size == 0:
                    raise RuntimeError("VNA returned empty data during averaging")

                s11_samples.append(sample_s11)
                if sample_s21 is not None and sample_s21.size > 0:
                    s21_samples.append(sample_s21)
                freq_samples.append(sample_freqs)
                if avg_idx < averaging_count - 1:
                    time.sleep(0.1)

            min_len = min(len(arr) for arr in s11_samples + freq_samples)
            if s21_samples:
                min_len = min(min_len, min(len(arr) for arr in s21_samples))

            freqs = freq_samples[-1][:min_len]
            s11 = np.mean([arr[:min_len] for arr in s11_samples], axis=0)
            s21 = np.mean([arr[:min_len] for arr in s21_samples], axis=0) if s21_samples else None
            
            if s11 is not None and len(s11) > 0:
                print(f"Data captured successfully on attempt {attempt + 1}. Points: {len(freqs)}")
                break
        except Exception as e:
            print(f"Attempt {attempt + 1} failed: {e}")
            if attempt == max_retries - 1:
                raise RuntimeError(f"Error reading from VNA after {max_retries} attempts: {str(e)}")
            time.sleep(1.0) # Esperar un poco más entre reintentos
    
    # Asegurar que son arrays de numpy para operaciones vectoriales
    s11 = np.asarray(s11)
    s21 = np.asarray(s21) if s21 is not None else None
    freqs = np.asarray(freqs)
    
    # Validar que los datos no estén vacíos
    if s11.size == 0 or freqs.size == 0:
        raise RuntimeError("VNA returned empty data")

    s11 = _smooth_complex_trace(s11, smoothing_window)
    if s21 is not None:
        s21 = _smooth_complex_trace(s21, smoothing_window)
    
    # Calcular magnitud en dB
    s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))
    
    plt.figure(figsize=(10, 5))
    plt.plot(freqs/1e6, s11_db, label="S11 (dB)", color='blue', linewidth=1.5)
    
    if not one_port and s21 is not None and s21.size > 0:
        s21_db = 20 * np.log10(np.maximum(np.abs(s21), 1e-12))
        plt.plot(freqs/1e6, s21_db, label="S21 (dB)", color='red', linewidth=1.5)
    
    plt.title("VNA Measurement")
    plt.xlabel("Frequency (MHz)")
    plt.ylabel("Magnitude (dB)")
    plt.grid(True, alpha=0.3)
    plt.legend()
    
    # Generar imagen base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    # Generar contenido Touchstone
    lines = ["! Generated by RF Tool Suite", "# Hz S RI R 50"]
    for i, f in enumerate(freqs):
        re11, im11 = np.real(s11[i]), np.imag(s11[i])
        if one_port:
            lines.append(f"{f:.10e} {re11:.10e} {im11:.10e}")
        else:
            # S2P completo (S11, S21, S12, S22)
            # El NanoVNA básico solo mide S11 y S21. Rellenamos el resto.
            re21 = np.real(s21[i]) if s21 is not None and i < len(s21) else 0.0
            im21 = np.imag(s21[i]) if s21 is not None and i < len(s21) else 0.0
            # Formato: Freq ReS11 ImS11 ReS21 ImS21 ReS12 ImS12 ReS22 ImS22
            lines.append(f"{f:.10e} {re11:.10e} {im11:.10e} {re21:.10e} {im21:.10e} 0.0 0.0 0.0 0.0")
            
    touchstone_content = "\n".join(lines) + "\n"

    plot_svg_base64 = generate_ieee_measurement_plot(freqs, s11, s21=s21, port1=1, port2=2, is_one_port=one_port)
    res = {
        "status": "success",
        "freqs": freqs.tolist(),
        "s11_real": np.real(s11).tolist(),
        "s11_imag": np.imag(s11).tolist(),
        "plot": plot_base64,
        "plot_svg": plot_svg_base64,
        "touchstone_content": touchstone_content,
        "is_one_port": one_port
    }
    if not one_port and s21 is not None:
        res["s21_real"] = np.real(s21).tolist()
        res["s21_imag"] = np.imag(s21).tolist()
        
    return res

def run_sweep(start_hz, stop_hz, points, calibration_path=None, vna=None, one_port=False, device_type="NanoVNA", averaging_count=1, smoothing_window=1):
    if vna is None:
        vna = get_vna_connection(device_type=device_type)

    if device_type == "NanoVNA":
        if calibration_path:
            vna.load_calibration(calibration_path)
        else:
            vna.calibration = pynanovna.calibration.Calibration()

    vna.set_sweep(start_hz, stop_hz, points)
    time.sleep(0.5)
    if device_type != "NanoVNA":
        averaging_count = 1
        smoothing_window = 1
    return process_sweep(vna, one_port=one_port, averaging_count=averaging_count, smoothing_window=smoothing_window)
