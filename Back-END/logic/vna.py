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
from typing import List

matplotlib.use('Agg')
import matplotlib.pyplot as plt

def list_serial_ports() -> List[str]:
    """Lists serial port names on Windows"""
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
        except (OSError, serial.SerialException) as e:
            if "Access is denied" in str(e) or "PermissionError" in str(e):
                print(f"Port {port} exists but access was denied (likely in use).")
            pass
    return result

def get_vna_connection():
    print("Searching for NanoVNA devices...")
    
    last_error = ""
    try:
        # pynanovna handles discovery automatically. VNA(0) connects to the first one found.
        vna = pynanovna.VNA(0)
        
        if vna.connected:
            # Successfully connected
            try:
                port_name = getattr(vna.iface, 'port', "unknown port")
                print(f"Successfully connected to NanoVNA on {port_name}")
            except:
                print("Successfully connected to NanoVNA")
            return vna
        else:
            last_error = "NanoVNA not found (library reported not connected)."
    except Exception as e:
        import traceback
        traceback.print_exc()
        last_error = str(e)

    msg = "NanoVNA not detected."
    if last_error:
        msg += f" Details: {last_error}"
    
    # Check if any serial ports exist at all to provide better feedback
    try:
        all_ports = list_serial_ports()
        if not all_ports:
            msg += " No serial ports were found on the system. Check USB connection and drivers."
        else:
            msg += f" Found ports {all_ports}, but none seem to be a NanoVNA."
    except:
        pass

    raise ConnectionError(msg)

def calibrate_step(vna, step: str):
    # step: 'short', 'open', 'load', 'isolation', 'through'
    try:
        # Limpiar cualquier dato residual en el buffer de entrada antes de medir el paso
        if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
            vna.iface.reset_input_buffer()
            
        vna.calibration_step(step)
        return {"status": f"Step {step} completed"}
    except Exception as e:
        raise RuntimeError(f"Error during calibration step '{step}': {str(e)}")

def finalize_calibration(vna, save_path=None, cal_type="twoport"):
    try:
        print(f"--- Finalizing {cal_type} calibration in hardware ---")
        
        # Limpiar buffer antes de la medición final/procesamiento
        if hasattr(vna, 'iface') and hasattr(vna.iface, 'reset_input_buffer'):
            vna.iface.reset_input_buffer()
            
        # Procesar los pasos de calibración acumulados
        vna.calibrate()
        
        # Forzar un pequeño delay para que el hardware procese el motor de calibración interno
        time.sleep(1)

        fd, temp_filename = tempfile.mkstemp(suffix=".cal")
        os.close(fd) 
        
        try:
            # Guardar la calibración
            vna.save_calibration(temp_filename)
            
            if os.path.exists(temp_filename):
                # Verificación de consistencia de puntos antes de enviar al frontend
                with open(temp_filename, "r", encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
                    data_lines = [l for l in lines if l.strip() and not l.startswith(('#', '!'))]
                    actual_points = len(data_lines)
                    print(f"Calibración finalizada con {actual_points} puntos detectados en el archivo.")

                with open(temp_filename, "rb") as f:
                    content = f.read()
                
                content_base64 = base64.b64encode(content).decode('utf-8')
                
                return {
                    "status": "success",
                    "message": f"Calibración generada con {actual_points} puntos.",
                    "file_content": content_base64,
                    "suggested_name": "calibracion_nanovna.cal",
                    "actual_points": actual_points
                }
            else:
                return {"status": "error", "message": "No se pudo generar el archivo de calibración en el servidor (archivo no encontrado)."}
        finally:
            # Clean up temp file
            if os.path.exists(temp_filename):
                try:
                    os.remove(temp_filename)
                except:
                    pass
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Error finalizando calibración: {str(e)}"}

def process_sweep(vna, one_port=False):
    stream = vna.stream()
    try:
        s11, s21, freqs = next(stream)
    except StopIteration:
        raise RuntimeError("Failed to get data from VNA stream")
    except Exception as e:
        raise RuntimeError(f"Error reading from VNA: {str(e)}")
    
    # Process and return data
    # Avoid log(0)
    s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))
    
    plt.figure(figsize=(10, 5))
    plt.plot(freqs/1e6, s11_db, label="S11 (dB)")
    
    if not one_port:
        s21_db = 20 * np.log10(np.maximum(np.abs(s21), 1e-12))
        plt.plot(freqs/1e6, s21_db, label="S21 (dB)")
    
    plt.title("VNA Live Measurement")
    plt.xlabel("Frequency (MHz)")
    plt.ylabel("Magnitude (dB)")
    plt.grid(True, alpha=0.3)
    plt.legend()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    # Generate Touchstone content
    if one_port:
        # S1P
        lines = ["! Touchstone file generated by RF Tool Suite", "# Hz S RI R 50"]
        for i, f in enumerate(freqs):
            re11, im11 = np.real(s11[i]), np.imag(s11[i])
            # Frequency ReS11 ImS11
            lines.append(f"{f:.10e} {re11:.10e} {im11:.10e}")
        touchstone_content = "\n".join(lines) + "\n"
    else:
        # S2P
        lines = ["! Touchstone file generated by RF Tool Suite", "# Hz S RI R 50"]
        for i, f in enumerate(freqs):
            re11, im11 = np.real(s11[i]), np.imag(s11[i])
            re21, im21 = np.real(s21[i]), np.imag(s21[i])
            # Frequency ReS11 ImS11 ReS21 ImS21 ReS12 ImS12 ReS22 ImS22
            # Assuming reciprocity (S12=S21) and symmetry (S22=S11) for NanoVNA simplified data
            lines.append(f"{f:.10e} {re11:.10e} {im11:.10e} {re21:.10e} {im21:.10e} {re21:.10e} {im21:.10e} {re11:.10e} {im11:.10e}")
        touchstone_content = "\n".join(lines) + "\n"

    res = {
        "freqs": freqs.tolist(),
        "s11_real": np.real(s11).tolist(),
        "s11_imag": np.imag(s11).tolist(),
        "plot": plot_base64,
        "touchstone_content": touchstone_content,
        "is_one_port": one_port
    }
    
    if not one_port:
        res["s21_real"] = np.real(s21).tolist()
        res["s21_imag"] = np.imag(s21).tolist()
        
    return res

def run_sweep(start_hz, stop_hz, points, calibration_path=None, vna=None, one_port=False):
    # Validation
    if start_hz >= stop_hz:
        raise ValueError(f"Start frequency ({start_hz} Hz) must be less than stop frequency ({stop_hz} Hz)")
    if points <= 0:
        raise ValueError("Points must be greater than 0")
    if points > 1024:
        # Algunos dispositivos fallan silenciosamente o se bloquean con más de 1024 puntos
        points = 1024
        print(f"Warning: Points capped at 1024 for device stability.")

    if start_hz < 0 or stop_hz < 0:
        raise ValueError("Frequencies must be positive")

    if vna is None:
        vna = get_vna_connection()

    if calibration_path:
        print(f"Loading calibration from {calibration_path}")
        vna.load_calibration(calibration_path)
    else:
        # Reset calibration to ensure no previous calibration is applied
        print("No calibration file provided. Resetting to uncalibrated state.")
        vna.calibration = pynanovna.calibration.Calibration()

    vna.set_sweep(start_hz, stop_hz, points)
    # Dar un pequeño margen para que el hardware asimile el cambio de configuración
    time.sleep(0.5)
    return process_sweep(vna, one_port=one_port)