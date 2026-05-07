import os
import sys
import threading
import time
import subprocess
import socket
import uvicorn
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

# Logging setup for debugging
try:
    logging.basicConfig(
        filename="app_debug.log", 
        level=logging.INFO, 
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
except Exception:
    logging.basicConfig(
        level=logging.INFO, 
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

app = FastAPI(title="RF & Signal Integrity Suite Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Logic Imports ---
try:
    from logic.samm import run_samm
    from logic.s_params import process_s_params_csv, process_s_params_touchstone
    from logic.vna import run_sweep, get_vna_connection, calibrate_step, finalize_calibration, process_sweep
    from logic.compact_models import extract_compact_model
except Exception as e:
    logging.error(f"Error loading logic modules: {e}")

# Definir rutas base del proyecto
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BIBLIOTECA_DIR = os.path.join(PROJECT_ROOT, "Biblioteca")
BASE_CAL_DIR = os.path.join(BIBLIOTECA_DIR, "Calibraciones")
BASE_MEAS_DIR = os.path.join(BIBLIOTECA_DIR, "Mediciones")
COMPACT_MODELS_DIR = os.path.join(BIBLIOTECA_DIR, "extracciones")

# Asegurar que existan los directorios base
os.makedirs(BIBLIOTECA_DIR, exist_ok=True)
os.makedirs(BASE_CAL_DIR, exist_ok=True)
os.makedirs(BASE_MEAS_DIR, exist_ok=True)
os.makedirs(COMPACT_MODELS_DIR, exist_ok=True)

def get_device_dir(base_dir, device_name):
    # Validar nombre del dispositivo para evitar escape de directorios
    safe_name = "".join([c for c in device_name if c.isalnum() or c in ('-', '_')]).strip()
    if not safe_name:
        safe_name = "Unknown-Device"
    path = os.path.join(base_dir, safe_name)
    os.makedirs(path, exist_ok=True)
    return path

# --- Global VNA State ---
vna_instance = None
def get_vna():
    global vna_instance
    
    is_ok = False
    if vna_instance is not None:
        try:
            # Try multiple ways to check if it's still alive
            if hasattr(vna_instance, 'is_connected'):
                is_ok = vna_instance.is_connected()
            elif hasattr(vna_instance, 'connected'):
                is_ok = vna_instance.connected
            else:
                is_ok = True # Assume ok if it exists but can't check
        except Exception:
            is_ok = False
            
    if not is_ok:
        vna_instance = get_vna_connection()
        
    return vna_instance

# --- API Models ---
class Component(BaseModel):
    tipo: str
    valor: float
class SammRequest(BaseModel):
    fmin: float
    fmax: float
    f0: float
    s21_min_db: float
    s21_max_db: float
    components: List[Component]
    Z0: Optional[float] = 50.0
class CalibrateStartRequest(BaseModel):
    start_mhz: float
    stop_mhz: float
    points: int

class SaveMeasurementRequest(BaseModel):
    filename: str
    content: str

import numpy as np

# --- API Endpoints ---
@app.get("/api/status")
async def api_status():
    return {"status": "online"}

@app.post("/api/samm")
async def samm_analysis(req: SammRequest):
    try:
        components_list = [{"tipo": c.tipo, "valor": c.valor} for c in req.components]
        return run_samm(req.fmin, req.fmax, req.f0, req.s21_min_db, req.s21_max_db, components_list, req.Z0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/s-params/s2p")
async def s_params_s2p(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return process_s_params_touchstone(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/vna/calibrations")
async def list_calibrations(device: Optional[str] = None):
    search_dir = BASE_CAL_DIR
    if device:
        search_dir = get_device_dir(BASE_CAL_DIR, device)
    
    if not os.path.exists(search_dir):
        return []
    
    calibrations = []
    # Caminar recursivamente para encontrar archivos .cal si no se especifica dispositivo
    for root, dirs, files in os.walk(search_dir):
        for filename in files:
            if filename.endswith(".cal"):
                path = os.path.join(root, filename)
                device_folder = os.path.basename(root) if root != BASE_CAL_DIR else "General"
                try:
                    with open(path, "r", encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                        all_freqs = []
                        for l in lines:
                            parts = l.strip().split()
                            if parts and not l.startswith(('#', '!')):
                                try:
                                    all_freqs.append(float(parts[0]))
                                except ValueError:
                                    continue
                        
                        if all_freqs:
                            # Si el archivo tiene más puntos de los esperados o bloques repetidos,
                            # buscamos el último bloque monótono creciente.
                            start_idx = 0
                            for i in range(1, len(all_freqs)):
                                # Si la frecuencia baja de repente, es un nuevo bloque (posible error de concatenación)
                                if all_freqs[i] < all_freqs[i-1]:
                                    start_idx = i
                            
                            current_block = all_freqs[start_idx:]
                            fmin = current_block[0] / 1e6
                            fmax = current_block[-1] / 1e6
                            points = len(current_block)
                            
                            # Si hay una discrepancia enorme (ej: 1148 pts), lo marcamos o informamos
                            calibrations.append({
                                "name": filename,
                                "device": device_folder,
                                "fmin": fmin,
                                "fmax": fmax,
                                "points": points,
                                "total_raw_points": len(all_freqs) # Informativo
                            })
                except Exception as e:
                    logging.error(f"Error parsing cal file {filename}: {e}")
    
    return calibrations

@app.get("/api/vna/measurements")
async def list_measurements(device: Optional[str] = None):
    search_dir = BASE_MEAS_DIR
    if device:
        search_dir = get_device_dir(BASE_MEAS_DIR, device)
        
    if not os.path.exists(search_dir):
        return []
    
    measurements = []
    for root, dirs, files in os.walk(search_dir):
        for filename in files:
            if filename.endswith(".s1p") or filename.endswith(".s2p"):
                path = os.path.join(root, filename)
                device_folder = os.path.basename(root) if root != BASE_MEAS_DIR else "General"
                stats = os.stat(path)
                measurements.append({
                    "name": filename,
                    "device": device_folder,
                    "size": stats.st_size,
                    "mtime": stats.st_mtime
                })
    # Ordenar por fecha de modificación (más nuevos primero)
    measurements.sort(key=lambda x: x["mtime"], reverse=True)
    return measurements

@app.get("/api/vna/measurements/analyze/{filename}")
async def analyze_server_measurement(filename: str, device: Optional[str] = None):
    if device:
        target_path = os.path.join(get_device_dir(BASE_MEAS_DIR, device), filename)
    else:
        # Búsqueda fallback
        target_path = None
        for root, dirs, files in os.walk(BASE_MEAS_DIR):
            if filename in files:
                target_path = os.path.join(root, filename)
                break
    
    if not target_path or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Medición no encontrada")

    try:
        with open(target_path, "rb") as f:
            content = f.read()
        return process_s_params_touchstone(content, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/library/extractions")
async def list_extractions():
    if not os.path.exists(COMPACT_MODELS_DIR):
        return []
    
    extractions = []
    for filename in os.listdir(COMPACT_MODELS_DIR):
        if filename.endswith(".cir"):
            path = os.path.join(COMPACT_MODELS_DIR, filename)
            stats = os.stat(path)
            extractions.append({
                "name": filename,
                "size": stats.st_size,
                "mtime": stats.st_mtime
            })
    extractions.sort(key=lambda x: x["mtime"], reverse=True)
    return extractions

@app.get("/api/library/extraction/{filename}")
async def get_extraction_content(filename: str):
    path = os.path.join(COMPACT_MODELS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Extracción no encontrada")
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"filename": filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/library/all")
async def get_all_library():
    calibrations = await list_calibrations()
    measurements = await list_measurements()
    extractions = await list_extractions()
    
    return {
        "calibrations": calibrations,
        "measurements": measurements,
        "extractions": extractions
    }

@app.post("/api/compact-models/extract")
async def api_extract_compact_model(
    filename: Optional[str] = Form(None),
    method: str = Form("shunt"),
    z0: float = Form(50.0),
    device: Optional[str] = Form(None),
    custom_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    content = None
    actual_filename = filename

    # 1. Prioridad al archivo subido manualmente
    if file:
        content = await file.read()
        actual_filename = file.filename
    # 2. Si no, buscar en la biblioteca
    elif filename:
        if device:
            target_path = os.path.join(get_device_dir(BASE_MEAS_DIR, device), filename)
        else:
            target_path = None
            for root, dirs, files in os.walk(BASE_MEAS_DIR):
                if filename in files:
                    target_path = os.path.join(root, filename)
                    break
        
        if target_path and os.path.exists(target_path):
            with open(target_path, "rb") as f:
                content = f.read()
    
    if not content:
        raise HTTPException(status_code=400, detail="No se ha proporcionado ninguna medición válida")

    try:
        result = extract_compact_model(content, actual_filename, method, z0)
        
        # Guardar en la carpeta del servidor
        save_name = custom_name if custom_name else (actual_filename.split('.')[0] if actual_filename else "modelo_extraido")
        if not save_name.endswith(".cir"):
            save_name += ".cir"
            
        save_path = os.path.join(COMPACT_MODELS_DIR, save_name)
        with open(save_path, "w", encoding="utf-8") as f:
            f.write(result["spice_netlist"])
            
        result["saved_path"] = save_path
        return result
    except Exception as e:
        logging.error(f"Compact model extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/measurements/cutoff-freq")
async def calculate_cutoff_freq(file: UploadFile = File(...), search_type: str = Form("min")):
    try:
        content = await file.read()
        result = process_s_params_touchstone(content, file.filename)
        data = result["data"]
        
        if data["n_ports"] < 2:
            raise HTTPException(status_code=400, detail="La medición debe ser de 2 puertos (S2P) para analizar S21")
            
        freqs = np.array(data["freq_hz"])
        s21_db = np.array(data["s21_db"])
        
        # Encontrar el índice según el tipo de búsqueda
        if search_type == "max":
            idx = np.argmax(s21_db)
            label = "Máximo S21"
        else:
            idx = np.argmin(s21_db)
            label = "Mínimo S21"

        cutoff_f = freqs[idx]
        val_db = s21_db[idx]
        
        return {
            "cutoff_frequency_hz": float(cutoff_f),
            "cutoff_frequency_mhz": float(cutoff_f / 1e6),
            "value_db": float(val_db),
            "search_type": search_type,
            "label": label,
            "parameter": "S21",
            "filename": file.filename,
            "raw_data": {
                "freq_hz": freqs.tolist(),
                "s21_db": s21_db.tolist()
            }
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/vna/measurements/cutoff-freq-server/{filename}")
async def calculate_cutoff_freq_server(filename: str, device: Optional[str] = None, search_type: str = "min"):
    if device:
        target_path = os.path.join(get_device_dir(BASE_MEAS_DIR, device), filename)
    else:
        target_path = None
        for root, dirs, files in os.walk(BASE_MEAS_DIR):
            if filename in files:
                target_path = os.path.join(root, filename)
                break

    if not target_path or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        with open(target_path, "rb") as f:
            content = f.read()
        result = process_s_params_touchstone(content, filename)
        data = result["data"]
        
        if data["n_ports"] < 2:
            raise HTTPException(status_code=400, detail="La medición debe ser de 2 puertos (S2P) para analizar S21")
            
        freqs = np.array(data["freq_hz"])
        s21_db = np.array(data["s21_db"])
        
        if search_type == "max":
            idx = np.argmax(s21_db)
            label = "Máximo S21"
        else:
            idx = np.argmin(s21_db)
            label = "Mínimo S21"

        cutoff_f = freqs[idx]
        val_db = s21_db[idx]
        
        return {
            "cutoff_frequency_hz": float(cutoff_f),
            "cutoff_frequency_mhz": float(cutoff_f / 1e6),
            "value_db": float(val_db),
            "search_type": search_type,
            "label": label,
            "parameter": "S21",
            "filename": filename,
            "raw_data": {
                "freq_hz": freqs.tolist(),
                "s21_db": s21_db.tolist()
            }
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/vna/connect")
async def vna_connect():
    try:
        get_vna()
        return {"connected": True}
    except Exception as e:
        return {"connected": False, "error": str(e)}

@app.get("/api/vna/sweep")
async def vna_sweep(start_mhz: float, stop_mhz: float, points: int, one_port: bool = False):
    try:
        vna = get_vna()
        vna.set_sweep(start_mhz * 1e6, stop_mhz * 1e6, points)
        return process_sweep(vna, one_port=one_port)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/measurement/save")
async def save_measurement(req: SaveMeasurementRequest, device: Optional[str] = "NanoVNA-Izan"):
    try:
        filename = req.filename
        if not (filename.endswith(".s1p") or filename.endswith(".s2p")):
            filename += ".s2p"
            
        device_dir = get_device_dir(BASE_MEAS_DIR, device)
        target_path = os.path.join(device_dir, filename)
        with open(target_path, "w", encoding='utf-8') as f:
            f.write(req.content)
        return {"status": "success", "message": f"Medición guardada en {device}/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/measurement")
async def vna_measurement(
    start_mhz: float = Form(...),
    stop_mhz: float = Form(...),
    points: int = Form(...),
    is_one_port: bool = Form(False),
    cal_file: Optional[UploadFile] = File(None),
    server_cal_name: Optional[str] = Form(None),
    save_filename: Optional[str] = Form(None),
    device: str = Form("NanoVNA-Izan")
):
    temp_cal_path = None
    should_cleanup = False
    try:
        if cal_file:
            import tempfile
            import shutil
            with tempfile.NamedTemporaryFile(delete=False, suffix=".cal") as tmp:
                shutil.copyfileobj(cal_file.file, tmp)
                temp_cal_path = tmp.name
                should_cleanup = True
        elif server_cal_name:
            # Buscar en la carpeta del dispositivo primero
            device_cal_dir = get_device_dir(BASE_CAL_DIR, device)
            target_path = os.path.join(device_cal_dir, server_cal_name)
            
            if not os.path.exists(target_path):
                # Fallback: buscar en todo BASE_CAL_DIR
                for root, dirs, files in os.walk(BASE_CAL_DIR):
                    if server_cal_name in files:
                        target_path = os.path.join(root, server_cal_name)
                        break
            
            if os.path.exists(target_path):
                temp_cal_path = target_path
                should_cleanup = False
            else:
                raise HTTPException(status_code=404, detail="Archivo de calibración no encontrado en el servidor")
        
        vna = get_vna()
        result = run_sweep(start_mhz * 1e6, stop_mhz * 1e6, points, calibration_path=temp_cal_path, vna=vna, one_port=is_one_port)
        
        if save_filename:
            filename = save_filename
            ext = ".s1p" if is_one_port else ".s2p"
            if not filename.endswith(ext):
                filename += ext
            
            device_meas_dir = get_device_dir(BASE_MEAS_DIR, device)
            target_path = os.path.join(device_meas_dir, filename)
            with open(target_path, "w", encoding='utf-8') as f:
                f.write(result["touchstone_content"])
            result["saved_to_server"] = True
            
        return result
            
    except Exception as e:
        logging.error(f"Measurement failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if should_cleanup and temp_cal_path and os.path.exists(temp_cal_path):
            try:
                os.remove(temp_cal_path)
            except Exception as cleanup_error:
                logging.error(f"Failed to remove temp cal file: {cleanup_error}")

@app.post("/api/vna/calibrate/start")
async def vna_calibrate_start(req: CalibrateStartRequest):
    try:
        vna = get_vna()
        vna.set_sweep(req.start_mhz * 1e6, req.stop_mhz * 1e6, req.points)
        return {"status": "Sweep configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/calibrate/step")
async def vna_calibrate_step(step: str):
    try:
        vna = get_vna()
        return calibrate_step(vna, step)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/calibrate/finish")
async def vna_calibrate_finish(filename: Optional[str] = None, cal_type: str = "twoport", save_to_server: bool = False, device: str = "NanoVNA-Izan"):
    try:
        vna = get_vna()
        result = finalize_calibration(vna, filename, cal_type)
        
        if save_to_server and result.get("status") == "success" and result.get("file_content"):
            import base64
            content = base64.b64decode(result["file_content"])
            
            device_dir = get_device_dir(BASE_CAL_DIR, device)
            
            target_name = filename if filename else result.get("suggested_name", "cal.cal")
            if not target_name.endswith(".cal"):
                target_name += ".cal"
            
            target_path = os.path.join(device_dir, target_name)
            with open(target_path, "wb") as f:
                f.write(content)
            result["saved_to_server"] = True
            result["server_path"] = target_path
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/calibrations/upload")
async def upload_calibration(file: UploadFile = File(...), device: str = Form("NanoVNA-Izan")):
    if not file.filename.endswith(".cal"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .cal")
    
    device_dir = get_device_dir(BASE_CAL_DIR, device)
    target_path = os.path.join(device_dir, file.filename)
    try:
        with open(target_path, "wb") as f:
            f.write(await file.read())
        return {"status": "success", "message": f"Archivo {file.filename} subido correctamente en {device}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/utils/open-folder")
async def open_folder(path: str):
    import subprocess
    import platform
    
    # Si la ruta es relativa, hacerla relativa al PROJECT_ROOT
    target_path = path
    if not os.path.isabs(path):
        target_path = os.path.join(PROJECT_ROOT, path)
    
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"Ruta no encontrada: {target_path}")
        
    try:
        if platform.system() == "Windows":
            os.startfile(target_path)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", target_path])
        else:
            subprocess.Popen(["xdg-open", target_path])
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/library/delete")
async def delete_library_file(filename: str, type: str, device: Optional[str] = None):
    base_dir = None
    if type == "measurements":
        base_dir = BASE_MEAS_DIR
    elif type == "calibrations":
        base_dir = BASE_CAL_DIR
    elif type == "extractions":
        base_dir = COMPACT_MODELS_DIR
    
    if not base_dir:
        raise HTTPException(status_code=400, detail="Tipo de archivo inválido")
    
    if device and device != "General" and type != "extractions":
        target_dir = get_device_dir(base_dir, device)
    else:
        target_dir = base_dir
        
    file_path = os.path.join(target_dir, filename)
    
    if not os.path.exists(file_path):
        # Búsqueda fallback si no se especificó bien el dispositivo
        found = False
        for root, dirs, files in os.walk(base_dir):
            if filename in files:
                file_path = os.path.join(root, filename)
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")

    try:
        os.remove(file_path)
        return {"status": "success", "message": f"Archivo {filename} eliminado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/utils/open-url")
async def open_external_url(url: str):
    import webbrowser
    try:
        webbrowser.open(url)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Serving Frontend ---
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.dirname(os.path.abspath(__file__))

dist_path = os.path.join(base_path, "dist")

if os.path.exists(dist_path):
    assets_path = os.path.join(dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            return FileResponse(os.path.join(dist_path, "404.html")) # Or handle better
        file_p = os.path.join(dist_path, full_path)
        if os.path.isfile(file_p):
            return FileResponse(file_p)
        return FileResponse(os.path.join(dist_path, "index.html"))

# --- Launch Logic ---
def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def run_server():
    try:
        uvicorn.run(app, host="127.0.0.1", port=8080, log_config=None)
    except Exception as e:
        logging.error(f"Uvicorn server failed: {e}")

def get_browser_command():
    paths = [
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None

if __name__ == "__main__":
    print("\n" + "="*50)
    print("RF & Signal Integrity Suite - Servidor API")
    print("Accede a la web en: http://127.0.0.1:8080")
    print("="*50 + "\n")
    
    try:
        uvicorn.run(app, host="127.0.0.1", port=8080, log_config=None)
    except Exception as e:
        logging.error(f"Uvicorn server failed: {e}")
        print(f"Error al iniciar el servidor: {e}")
