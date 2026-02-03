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
logging.basicConfig(
    filename="app_debug.log", 
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
    from logic.s_params import process_s_params_csv, process_s_params_s2p
    from logic.rlc_extraction import run_rlc_extraction
    from logic.vna import run_sweep, get_vna_connection, calibrate_step, finalize_calibration, process_sweep
except Exception as e:
    logging.error(f"Error loading logic modules: {e}")

# --- Global VNA State ---
vna_instance = None
def get_vna():
    global vna_instance
    if vna_instance is None or not vna_instance.is_connected():
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
        return process_s_params_s2p(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/rlc-extraction")
async def rlc_extraction(file: UploadFile = File(...), z0: float = Form(50.0), mode: str = Form("auto")):
    try:
        content = await file.read()
        return run_rlc_extraction(content, file.filename, z0, mode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- VNA Hardware Endpoints ---
@app.get("/api/vna/connect")
async def vna_connect():
    try:
        get_vna()
        return {"connected": True}
    except Exception as e:
        return {"connected": False, "error": str(e)}

@app.get("/api/vna/sweep")
async def vna_sweep(start_mhz: float, stop_mhz: float, points: int):
    try:
        vna = get_vna()
        vna.set_sweep(start_mhz * 1e6, stop_mhz * 1e6, points)
        return process_sweep(vna)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
async def vna_calibrate_finish(filename: Optional[str] = None):
    try:
        vna = get_vna()
        return finalize_calibration(vna, filename)
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
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    max_wait = 30
    while not is_port_open(8080) and max_wait > 0:
        time.sleep(0.5)
        max_wait -= 1
    
    if not is_port_open(8080):
        sys.exit(1)

    url = "http://127.0.0.1:8080"
    browser = get_browser_command()
    if browser:
        subprocess.Popen([browser, f"--app={url}", "--window-size=1280,800"])
    else:
        import webbrowser
        webbrowser.open(url)

    server_thread.join()
