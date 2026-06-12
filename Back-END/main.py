from __future__ import annotations

import os
import sys
import threading
import time
import subprocess
import socket
import urllib.request
import uvicorn
import logging
import tempfile
import numpy as np
import skrf as rf
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Body
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

SERVER_HOST = os.environ.get("RF_BACKEND_HOST", "127.0.0.1")
SERVER_PORT = int(os.environ.get("RF_BACKEND_PORT", "8080"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    from logic.vna import run_sweep, get_vna_connection, calibrate_step, finalize_calibration, process_sweep, start_calibration
    from logic.compact_models import extract_compact_model
    from logic.nominal_extraction import extract_nominal_value, extract_nominal_typical
    from logic.correction import apply_hp_correction
    from logic.report_template import generate_report_html
except Exception as e:
    logging.error(f"Error loading logic modules: {e}")

# Definir rutas base del proyecto. En Electron/PyInstaller, el ejecutable se
# empaqueta en resources/backend y Biblioteca vive en resources/Biblioteca.
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
    PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BIBLIOTECA_DIR = os.path.join(PROJECT_ROOT, "Biblioteca")
BASE_CAL_DIR = os.path.join(BIBLIOTECA_DIR, "Calibraciones")
BASE_MEAS_DIR = os.path.join(BIBLIOTECA_DIR, "Mediciones")
COMPACT_MODELS_DIR = os.path.join(BIBLIOTECA_DIR, "extracciones")
LIBRARY_INDEX_PATH = os.path.join(BIBLIOTECA_DIR, "library_index.json")
DATASHEETS_DIR = os.path.join(BIBLIOTECA_DIR, "Datasheets")
CONFIG_DIR = os.path.join(BIBLIOTECA_DIR, "config")
DATASHEET_PROVIDERS_CONFIG = os.path.join(CONFIG_DIR, "datasheet_providers.json")
NANOVNA_COMPONENT_FOLDERS = {
    "capacitor": "Capacitores",
    "inductor": "Inductores",
    "resistor": "Resistencias",
}
NANOVNA_COMPONENT_PREFIXES = {
    "capacitor": "cap",
    "inductor": "ind",
    "resistor": "res",
}

# Asegurar que existan los directorios base
os.makedirs(BIBLIOTECA_DIR, exist_ok=True)
os.makedirs(BASE_CAL_DIR, exist_ok=True)
os.makedirs(BASE_MEAS_DIR, exist_ok=True)
os.makedirs(COMPACT_MODELS_DIR, exist_ok=True)
os.makedirs(DATASHEETS_DIR, exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)
for default_nanovna in ("NanoVNA-Izan", "NanoVNA-LAB1", "NanoVNA-LAB2"):
    for component_folder in NANOVNA_COMPONENT_FOLDERS.values():
        os.makedirs(os.path.join(BASE_MEAS_DIR, default_nanovna, component_folder), exist_ok=True)
# Directorios para E5071C
os.makedirs(os.path.join(BASE_CAL_DIR, "VNA-E5071C"), exist_ok=True)
os.makedirs(os.path.join(BASE_MEAS_DIR, "VNA-E5071C"), exist_ok=True)

def get_device_dir(base_dir, device_name):
    # Validar nombre del dispositivo para evitar escape de directorios
    safe_name = "".join([c for c in device_name if c.isalnum() or c in ('-', '_')]).strip()
    if not safe_name:
        safe_name = "Unknown-Device"
    path = os.path.join(base_dir, safe_name)
    os.makedirs(path, exist_ok=True)
    return path

def sanitize_filename_part(value, fallback="medicion"):
    safe = "".join([c if c.isalnum() or c in ('-', '_') else "_" for c in str(value or "")]).strip("_")
    return safe or fallback

def normalize_component_type(component_type):
    if not component_type:
        return None
    key = str(component_type).strip().lower()
    aliases = {
        "cap": "capacitor",
        "capacitor": "capacitor",
        "condensador": "capacitor",
        "capacitores": "capacitor",
        "ind": "inductor",
        "inductor": "inductor",
        "bobina": "inductor",
        "inductores": "inductor",
        "res": "resistor",
        "resistor": "resistor",
        "resistencia": "resistor",
        "resistencias": "resistor",
    }
    return aliases.get(key)

def get_measurement_dir(device_name, component_type=None):
    device_dir = get_device_dir(BASE_MEAS_DIR, device_name)
    component_key = normalize_component_type(component_type)
    if component_key and "NanoVNA" in str(device_name):
        path = os.path.join(device_dir, NANOVNA_COMPONENT_FOLDERS[component_key])
        os.makedirs(path, exist_ok=True)
        return path
    return device_dir

def build_nanovna_measurement_name(measurement_id, device, stop_mhz, component_type, ext):
    component_key = normalize_component_type(component_type)
    if not component_key:
        return None
    prefix = NANOVNA_COMPONENT_PREFIXES[component_key]
    clean_id = sanitize_filename_part(measurement_id, "medicion")
    clean_device = sanitize_filename_part(device, "NanoVNA")
    fmax = f"{float(stop_mhz):g}MHz".replace(".", "p")
    return f"{prefix}_{clean_id}_{clean_device}_{fmax}{ext}"

def infer_component_from_filename(filename):
    prefix = os.path.splitext(filename)[0].split("_", 1)[0].lower()
    for component, component_prefix in NANOVNA_COMPONENT_PREFIXES.items():
        if prefix == component_prefix:
            return component
    return None

def measurement_metadata_from_path(root, filename):
    rel_dir = os.path.relpath(root, BASE_MEAS_DIR)
    parts = [] if rel_dir == "." else rel_dir.split(os.sep)
    device_folder = parts[0] if parts else "General"
    component = None
    if len(parts) > 1:
        folder = parts[1]
        for key, value in NANOVNA_COMPONENT_FOLDERS.items():
            if value == folder:
                component = key
                break
    if not component:
        component = infer_component_from_filename(filename)
    return device_folder, component

def library_relative_path(path):
    return os.path.relpath(path, BIBLIOTECA_DIR).replace(os.sep, "/")

def load_library_index():
    if not os.path.exists(LIBRARY_INDEX_PATH):
        return {"version": 1, "measurements": {}}
    try:
        import json
        with open(LIBRARY_INDEX_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"version": 1, "measurements": {}}
        data.setdefault("version", 1)
        data.setdefault("measurements", {})
        return data
    except Exception as e:
        logging.error(f"Error loading library index: {e}")
        return {"version": 1, "measurements": {}}

def save_library_index(index):
    import json
    tmp_path = LIBRARY_INDEX_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False, sort_keys=True)
    os.replace(tmp_path, LIBRARY_INDEX_PATH)

def load_datasheet_provider_config():
    if not os.path.exists(DATASHEET_PROVIDERS_CONFIG):
        return {"mouser": {}}
    try:
        import json
        with open(DATASHEET_PROVIDERS_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"mouser": {}}
        data.setdefault("mouser", {})
        return data
    except Exception as e:
        logging.error(f"Error loading datasheet provider config: {e}")
        return {"mouser": {}}

def save_datasheet_provider_config(config):
    import json
    tmp_path = DATASHEET_PROVIDERS_CONFIG + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False, sort_keys=True)
    os.replace(tmp_path, DATASHEET_PROVIDERS_CONFIG)

def get_mouser_api_key():
    env_key = os.environ.get("MOUSER_API_KEY")
    if env_key:
        return env_key
    config = load_datasheet_provider_config()
    return config.get("mouser", {}).get("api_key")

def mask_secret(value):
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"

def parse_touchstone_summary(path):
    freqs = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith(("#", "!")):
                    continue
                parts = stripped.split()
                if parts:
                    try:
                        freqs.append(float(parts[0]))
                    except ValueError:
                        continue
    except Exception as e:
        logging.error(f"Error reading touchstone summary for {path}: {e}")

    if not freqs:
        return {"points": None, "fmin_hz": None, "fmax_hz": None}
    return {
        "points": len(freqs),
        "fmin_hz": min(freqs),
        "fmax_hz": max(freqs),
    }

def infer_measurement_id(filename):
    stem = os.path.splitext(filename)[0]
    parts = stem.split("_")
    if len(parts) >= 4 and parts[0] in NANOVNA_COMPONENT_PREFIXES.values():
        return "_".join(parts[1:-2]) or stem
    return stem

def build_measurement_index_entry(path, device, component_type=None, extra=None):
    filename = os.path.basename(path)
    stats = os.stat(path)
    summary = parse_touchstone_summary(path)
    ext = os.path.splitext(filename)[1].lower()
    entry = {
        "name": filename,
        "relative_path": library_relative_path(path),
        "device": device,
        "component_type": normalize_component_type(component_type),
        "measurement_id": infer_measurement_id(filename),
        "extension": ext,
        "n_ports": 1 if ext == ".s1p" else 2,
        "size": stats.st_size,
        "mtime": stats.st_mtime,
        "fmin_hz": summary["fmin_hz"],
        "fmax_hz": summary["fmax_hz"],
        "points": summary["points"],
        "indexed_at": time.time(),
    }
    if extra:
        preserved_keys = {
            "datasheet",
            "component_metadata",
            "source",
            "saved_at",
            "calibration_name",
            "averaging_count",
            "smoothing_window",
            "start_mhz",
            "stop_mhz",
            "is_one_port",
            "analysis_history",
        }
        entry.update({k: v for k, v in extra.items() if k in preserved_keys and v is not None})
    return entry

def ensure_measurement_index_entry(index, path, device, component_type=None):
    rel_path = library_relative_path(path)
    existing = index["measurements"].get(rel_path)
    stats = os.stat(path)
    if existing and existing.get("size") == stats.st_size and existing.get("mtime") == stats.st_mtime:
        return existing, False

    extra = dict(existing or {})
    extra.setdefault("source", "scan")
    entry = build_measurement_index_entry(path, device, component_type, extra=extra)
    index["measurements"][rel_path] = entry
    return entry, True

def upsert_measurement_index(path, device, component_type=None, extra=None):
    index = load_library_index()
    rel_path = library_relative_path(path)
    entry = build_measurement_index_entry(path, device, component_type, extra=extra)
    index["measurements"][rel_path] = entry
    save_library_index(index)
    return entry

def remove_measurement_from_index(path):
    index = load_library_index()
    rel_path = library_relative_path(path)
    if rel_path in index.get("measurements", {}):
        del index["measurements"][rel_path]
        save_library_index(index)

def rebuild_measurement_index():
    previous_index = load_library_index()
    index = {"version": 1, "measurements": {}, "rebuilt_at": time.time()}
    for root, dirs, files in os.walk(BASE_MEAS_DIR):
        for filename in files:
            if filename.endswith(".s1p") or filename.endswith(".s2p"):
                path = os.path.join(root, filename)
                device_folder, component = measurement_metadata_from_path(root, filename)
                rel_path = library_relative_path(path)
                previous_entry = previous_index.get("measurements", {}).get(rel_path, {})
                entry = build_measurement_index_entry(path, device_folder, component, extra=previous_entry)
                index["measurements"][rel_path] = entry
    save_library_index(index)
    return index

def safe_library_path(relative_path):
    normalized = os.path.normpath(str(relative_path).replace("/", os.sep))
    full_path = os.path.abspath(os.path.join(BIBLIOTECA_DIR, normalized))
    library_root = os.path.abspath(BIBLIOTECA_DIR)
    
    # On Windows, perform case-insensitive directory comparison to prevent drive letter casing issues
    import sys
    if sys.platform.startswith("win"):
        is_inside = full_path.lower().startswith(library_root.lower())
    else:
        is_inside = full_path.startswith(library_root)
        
    if not is_inside:
        raise HTTPException(status_code=400, detail="Ruta fuera de la biblioteca")
    return full_path

def attach_datasheet_to_measurement(req: DatasheetAttachRequest):
    index = load_library_index()
    measurement_key = str(req.measurement_relative_path).replace(os.sep, "/")
    entry = index.get("measurements", {}).get(measurement_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")

    datasheet_path = safe_library_path(req.datasheet_relative_path)
    if not os.path.exists(datasheet_path):
        raise HTTPException(status_code=404, detail="Datasheet no encontrado")

    entry["datasheet"] = {
        "relative_path": req.datasheet_relative_path.replace(os.sep, "/"),
        "url": req.datasheet_url,
        "supplier": req.supplier,
        "manufacturer": req.manufacturer,
        "manufacturer_part_number": req.manufacturer_part_number,
        "supplier_part_number": req.supplier_part_number,
        "title": req.title,
        "image_url": normalize_external_url(req.image_url),
        "attached_at": time.time(),
    }
    seed = {
        "manufacturer": req.manufacturer,
        "manufacturer_part_number": req.manufacturer_part_number,
        "supplier": req.supplier,
        "supplier_part_number": req.supplier_part_number,
        "title": req.title,
    }
    inferred = infer_component_metadata_from_text(req.title or "", seed=seed)
    current_metadata = entry.get("component_metadata", {})
    merged_metadata = {**inferred, **current_metadata}
    merged_metadata.update({k: v for k, v in seed.items() if k != "title" and v})
    if req.title:
        merged_metadata["product_description"] = req.title
        merged_metadata["notes"] = req.title
    if req.image_url:
        merged_metadata["mouser_image_url"] = normalize_external_url(req.image_url)
    merged_metadata["updated_at"] = time.time()
    merged_metadata["metadata_source"] = current_metadata.get("metadata_source", "datasheet_attach")
    entry["component_metadata"] = merged_metadata
    save_library_index(index)
    return entry

def get_first_present(mapping, keys):
    for key in keys:
        value = mapping.get(key)
        if value:
            return value
    return None

def mouser_datasheet_url(part):
    return get_first_present(part, [
        "DataSheetUrl",
        "DatasheetUrl",
        "DataSheetURL",
        "DatasheetURL",
        "Data Sheet URL",
    ])

def normalize_external_url(url):
    if not url:
        return None
    value = str(url).strip()
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("/"):
        return "https://www.mouser.com" + value
    return value

def mouser_attribute_map(part):
    attributes = part.get("ProductAttributes") or part.get("Product Attribute") or []
    if isinstance(attributes, dict):
        attributes = attributes.get("Attribute") or attributes.get("Attributes") or [attributes]
    result = {}
    if not isinstance(attributes, list):
        return result
    for attr in attributes:
        if not isinstance(attr, dict):
            continue
        name = get_first_present(attr, ["AttributeName", "Name", "Attribute", "Parameter"])
        value = get_first_present(attr, ["AttributeValue", "Value", "Text"])
        if name and value:
            result[str(name).strip()] = str(value).strip()
    return result

def normalize_datasheet_result(part, supplier):
    attributes = mouser_attribute_map(part)
    return {
        "supplier": supplier,
        "manufacturer_part_number": get_first_present(part, ["ManufacturerPartNumber", "Manufacturer Part Number"]),
        "supplier_part_number": get_first_present(part, ["MouserPartNumber", "Mouser Part Number", "DigiKeyPartNumber"]),
        "manufacturer": get_first_present(part, ["Manufacturer", "ManufacturerName", "Manufacturer Name"]),
        "description": get_first_present(part, ["Description", "PartDescription", "Part Description", "ProductDescription", "Product Description"]),
        "category": get_first_present(part, ["Category", "ProductCategory", "Product Category", "ProductCategoryName"]),
        "datasheet_url": mouser_datasheet_url(part),
        "product_url": normalize_external_url(get_first_present(part, ["ProductDetailUrl", "ProductDetailURL", "ProductUrl", "Product URL"])),
        "image_url": normalize_external_url(get_first_present(part, ["ImagePath", "ImageUrl", "ImageURL", "PhotoUrl"])),
        "availability": get_first_present(part, ["Availability", "AvailabilityInStock", "LeadTime"]),
        "lifecycle_status": get_first_present(part, ["LifecycleStatus", "LifeCycleStatus", "Lifecycle"]),
        "attributes": attributes,
    }

def mouser_post(endpoint, payload):
    api_key = get_mouser_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Falta MOUSER_API_KEY en el entorno del backend")

    import json
    import urllib.request
    import urllib.parse

    url = f"https://api.mouser.com/api/v1/search/{endpoint}?apiKey={urllib.parse.quote(api_key)}"
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw)
    except Exception as e:
        logging.error(f"Mouser datasheet search failed: {e}")
        raise HTTPException(status_code=502, detail=f"Error consultando Mouser: {e}")

def mouser_parts_from_response(parsed):
    search_results = parsed.get("SearchResults") or {}
    parts = search_results.get("Parts") or []
    if isinstance(parts, dict):
        parts = [parts]
    return parts, parsed.get("Errors") or search_results.get("Errors") or []

def search_mouser_datasheets(query, limit=10):
    records = min(max(int(limit or 10), 1), 50)
    attempts = [
        (
            "partnumber",
            {
                "SearchByPartnumberRequest": {
                    "mouserPartNumber": query,
                    "partSearchOptions": "None",
                }
            },
        ),
        (
            "partnumber",
            {
                "SearchByPartnumberRequest": {
                    "MouserPartNumber": query,
                    "partSearchOptions": "None",
                }
            },
        ),
        (
            "keyword",
            {
                "SearchByKeywordRequest": {
                    "keyword": query,
                    "records": records,
                    "startingRecord": 0,
                    "searchOptions": "",
                    "searchWithYourSignUpLanguage": "false",
                }
            },
        ),
    ]

    all_parts = []
    errors = []
    for endpoint, payload in attempts:
        parsed = mouser_post(endpoint, payload)
        parts, response_errors = mouser_parts_from_response(parsed)
        errors.extend(response_errors)
        if parts:
            all_parts.extend(parts)
            if endpoint == "partnumber":
                break

    seen = set()
    results = []
    for part in all_parts:
        normalized = normalize_datasheet_result(part, "mouser")
        key = normalized.get("supplier_part_number") or normalized.get("manufacturer_part_number") or str(part)
        if key in seen:
            continue
        seen.add(key)
        results.append(normalized)

    return {
        "results": results,
        "errors": errors,
        "datasheet_count": len([item for item in results if item.get("datasheet_url")]),
    }

def download_datasheet_file(req: DatasheetDownloadRequest):
    import urllib.request
    import urllib.parse

    supplier = sanitize_filename_part(req.supplier or "manual", "manual")
    supplier_dir = os.path.join(DATASHEETS_DIR, supplier)
    os.makedirs(supplier_dir, exist_ok=True)

    base_name = req.manufacturer_part_number or req.supplier_part_number or req.title or "datasheet"
    filename = sanitize_filename_part(base_name, "datasheet")
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    target_path = os.path.join(supplier_dir, filename)

    counter = 2
    original_target = target_path
    while os.path.exists(target_path):
        stem, ext = os.path.splitext(original_target)
        target_path = f"{stem}_{counter}{ext}"
        counter += 1

    try:
        url_parts = urllib.parse.urlparse(req.datasheet_url)
        host = url_parts.netloc
        referer = f"{url_parts.scheme}://{host}/"
        
        request = urllib.request.Request(
            req.datasheet_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,application/pdf,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,en-US;q=0.7,en;q=0.6",
                "Connection": "keep-alive",
                "Host": host,
                "Referer": referer,
                "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1"
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
    except Exception as e:
        logging.error(f"Datasheet download failed: {e}")
        raise HTTPException(status_code=502, detail=f"No se pudo descargar el datasheet: {e}")

    if not content.startswith(b"%PDF"):
        logging.warning("Downloaded datasheet does not start with PDF signature")
        if b"<!DOCTYPE html" in content or b"<html" in content or b"Access Denied" in content:
            raise HTTPException(
                status_code=403,
                detail="Mouser ha bloqueado la descarga automática (Access Denied). Por favor, descarga el PDF manualmente desde el enlace e impórtalo en la app."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="El archivo descargado no es un PDF válido. Intenta descargarlo manualmente."
            )

    with open(target_path, "wb") as f:
        f.write(content)

    relative_path = library_relative_path(target_path)
    result = {
        "status": "success",
        "name": os.path.basename(target_path),
        "relative_path": relative_path,
        "size": os.path.getsize(target_path),
    }

    if req.measurement_relative_path:
        attach_req = DatasheetAttachRequest(
            measurement_relative_path=req.measurement_relative_path,
            datasheet_relative_path=relative_path,
            datasheet_url=req.datasheet_url,
            supplier=req.supplier,
            manufacturer=req.manufacturer,
            manufacturer_part_number=req.manufacturer_part_number,
            supplier_part_number=req.supplier_part_number,
            title=req.title,
            image_url=req.image_url,
        )
        result["measurement"] = attach_datasheet_to_measurement(attach_req)

    return result

def compact_spaces(value):
    return " ".join(str(value or "").replace("\n", " ").split()).strip()

def first_regex(text, patterns, flags=0):
    import re
    for pattern in patterns:
        match = re.search(pattern, text, flags | re.IGNORECASE)
        if match:
            return compact_spaces(match.group(1) if match.groups() else match.group(0))
    return None

def normalize_engineering_value(value):
    if not value:
        return None
    return compact_spaces(value).replace("µ", "u")

def decode_eia_capacitance_from_mpn(mpn):
    # Common MLCC references encode capacitance as three digits in pF, e.g. 104 -> 100 nF.
    import re
    if not mpn:
        return None
    for code in re.findall(r"(?<!\d)(\d{3})(?!\d)", mpn):
        sig = int(code[:2])
        multiplier = int(code[2])
        if sig == 0 or multiplier > 8:
            continue
        pf = sig * (10 ** multiplier)
        if pf >= 1_000_000:
            return f"{pf / 1_000_000:g} uF"
        if pf >= 1000:
            return f"{pf / 1000:g} nF"
        return f"{pf:g} pF"
    return None

def decode_value_from_mpn(mpn, component_type=None):
    import re
    if not mpn:
        return None
    key = normalize_component_type(component_type)
    if key == "capacitor" or key is None:
        cap = decode_eia_capacitance_from_mpn(mpn)
        if cap:
            return cap
    if key == "resistor" or key is None:
        match = re.search(r"(\d+[Rr]\d+|\d+[Kk]\d*|\d+[Mm]\d*)", mpn)
        if match:
            return match.group(1).upper().replace("R", ".") + " Ohm"
    if key == "inductor" or key is None:
        match = re.search(r"(\d+(?:N|R|M)\d*)", mpn, re.IGNORECASE)
        if match:
            raw = match.group(1).upper()
            if "N" in raw:
                return raw.replace("N", ".") + " nH"
            if "R" in raw:
                return raw.replace("R", ".") + " uH"
            if "M" in raw:
                return raw.replace("M", ".") + " mH"
    return None

def extract_pdf_text(path, max_pages=8):
    try:
        from pypdf import PdfReader
        reader = PdfReader(path)
        chunks = []
        for page in reader.pages[:max_pages]:
            chunks.append(page.extract_text() or "")
        return "\n".join(chunks)
    except Exception as e:
        logging.error(f"PDF text extraction failed for {path}: {e}")
        raise HTTPException(status_code=500, detail=f"No se pudo extraer texto del PDF: {e}")

def infer_component_metadata_from_text(text, seed=None):
    seed = seed or {}
    normalized = compact_spaces(text)
    metadata = {
        "manufacturer": seed.get("manufacturer"),
        "manufacturer_part_number": seed.get("manufacturer_part_number"),
        "supplier": seed.get("supplier"),
        "supplier_part_number": seed.get("supplier_part_number"),
        "nominal_value": None,
        "tolerance": None,
        "voltage_rating": None,
        "current_rating": None,
        "power_rating": None,
        "temperature_range": None,
        "package": None,
        "dielectric_or_material": None,
        "operating_frequency_range": None,
        "product_description": seed.get("title") or seed.get("description") or seed.get("product_description"),
        "notes": None,
    }

    description = seed.get("title") or ""
    combined = f"{description} {seed.get('manufacturer_part_number') or ''} {normalized[:14000]}"

    metadata["nominal_value"] = normalize_engineering_value(first_regex(combined, [
        r"(?:capacitance|capacity|inductance|resistance|nominal value|value)\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*(?:pF|nF|uF|µF|mF|F|nH|uH|µH|mH|H|mOhm|mΩ|Ohm|Ω|R|kOhm|kΩ|MOhm|MΩ)\b)",
        r"(\d+(?:[.,]\d+)?\s*(?:pF|nF|uF|µF|mF|F)\b)",
        r"(\d+(?:[.,]\d+)?\s*(?:nH|uH|µH|mH|H)\b)",
        r"(\d+(?:[.,]\d+)?\s*(?:mOhm|mΩ|Ohm|Ω|R|kOhm|kΩ|MOhm|MΩ)\b)",
    ]))
    if not metadata["nominal_value"]:
        metadata["nominal_value"] = decode_value_from_mpn(seed.get("manufacturer_part_number"))
    metadata["tolerance"] = first_regex(combined, [
        r"(?:tolerance|tol\.?)\s*[:=]?\s*([±+-]?\s*\d+(?:[.,]\d+)?\s*%)",
        r"([±+-]\s*\d+(?:[.,]\d+)?\s*%)",
        r"\b(\d+(?:[.,]\d+)?\s*%)",
    ])
    metadata["voltage_rating"] = first_regex(combined, [
        r"(?:rated voltage|voltage rating|working voltage|rated volt\.)\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*(?:VDC|VAC|WVDC|V))",
        r"(\d+(?:[.,]\d+)?\s*(?:VDC|VAC)\b)",
        r"\b(\d+(?:[.,]\d+)?\s*V)\b",
    ])
    metadata["current_rating"] = first_regex(combined, [
        r"(?:rated current|current rating|allowable current|dc current)\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*(?:mA|A))",
    ])
    metadata["power_rating"] = first_regex(combined, [
        r"(?:rated power|power rating|power dissipation)\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*(?:mW|W))",
        r"(\d+(?:[.,]\d+)?\s*W)\s+(?:rated|rating)",
    ])
    metadata["temperature_range"] = first_regex(combined, [
        r"(?:operating temperature|temperature range|category temperature)\s*[:=]?\s*(-?\d+\s*°?\s*C\s*(?:to|~|-)\s*\+?\d+\s*°?\s*C)",
        r"(-?\d+\s*°?\s*C\s*(?:to|~|-)\s*\+?\d+\s*°?\s*C)",
        r"(-?\d+\s*℃\s*(?:to|~|-)\s*\+?\d+\s*℃)",
    ])
    metadata["package"] = first_regex(combined, [
        r"(?:package|case size|chip size|size code|size)\s*[:=]?\s*(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)",
        r"\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b",
    ])
    metadata["dielectric_or_material"] = first_regex(combined, [
        r"\b(C0G|NP0|X5R|X6S|X7R|X7S|Y5V|N750)\b",
        r"\b(ferrite|ceramic|thin film|thick film|metal film|wirewound)\b",
    ])
    metadata["operating_frequency_range"] = first_regex(combined, [
        r"(?:frequency range|operating frequency)\s*[:=]?\s*([0-9.,]+\s*(?:kHz|MHz|GHz)\s*(?:to|~|-)\s*[0-9.,]+\s*(?:kHz|MHz|GHz))",
        r"([0-9.,]+\s*(?:kHz|MHz|GHz)\s*(?:to|~|-)\s*[0-9.,]+\s*(?:kHz|MHz|GHz))",
    ])
    description = seed.get("title") or seed.get("description") or seed.get("product_description")
    metadata["notes"] = (
        f"Product description: {description}. Automatically extracted from datasheet text. Review before relying on these values."
        if description
        else "Automatically extracted from datasheet text. Review before relying on these values."
    )
    metadata["extraction_confidence"] = "heuristic"
    metadata["extracted_at"] = time.time()
    return {k: v for k, v in metadata.items() if v is not None}

def update_component_metadata(req: ComponentMetadataRequest, source="manual"):
    index = load_library_index()
    measurement_key = str(req.measurement_relative_path).replace(os.sep, "/")
    entry = index.get("measurements", {}).get(measurement_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")

    incoming = req.dict(exclude={"measurement_relative_path"}, exclude_none=True)
    current = entry.get("component_metadata", {})
    current.update(incoming)
    current["updated_at"] = time.time()
    current["metadata_source"] = source
    entry["component_metadata"] = current
    
    # Synchronize datasheet web link with main datasheet record
    if "datasheet_url" in incoming and incoming["datasheet_url"]:
        datasheet = entry.setdefault("datasheet", {})
        datasheet["url"] = incoming["datasheet_url"]
        
    save_library_index(index)
    return entry

def clear_measurement_datasheet(req: MeasurementMetadataActionRequest):
    index = load_library_index()
    measurement_key = str(req.measurement_relative_path).replace(os.sep, "/")
    entry = index.get("measurements", {}).get(measurement_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")
    entry.pop("datasheet", None)
    entry["datasheet_detached_at"] = time.time()
    save_library_index(index)
    return entry

def clear_component_metadata(req: MeasurementMetadataActionRequest):
    index = load_library_index()
    measurement_key = str(req.measurement_relative_path).replace(os.sep, "/")
    entry = index.get("measurements", {}).get(measurement_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")
    entry.pop("component_metadata", None)
    entry["component_metadata_cleared_at"] = time.time()
    save_library_index(index)
    return entry

def extract_and_optionally_update_component_metadata(req: DatasheetExtractRequest):
    datasheet_path = safe_library_path(req.datasheet_relative_path)
    if not os.path.exists(datasheet_path):
        raise HTTPException(status_code=404, detail="Datasheet no encontrado")

    seed = {}
    if req.measurement_relative_path:
        index = load_library_index()
        entry = index.get("measurements", {}).get(req.measurement_relative_path.replace(os.sep, "/"), {})
        seed = entry.get("datasheet", {})

    text = extract_pdf_text(datasheet_path)
    metadata = infer_component_metadata_from_text(text, seed=seed)

    if req.measurement_relative_path:
        allowed_keys = set(ComponentMetadataRequest.__fields__.keys()) - {"measurement_relative_path"}
        update_req = ComponentMetadataRequest(measurement_relative_path=req.measurement_relative_path, **{
            k: v for k, v in metadata.items()
            if k in allowed_keys
        })
        updated = update_component_metadata(update_req, source="datasheet_auto")
        return {"status": "success", "metadata": metadata, "measurement": updated}

    return {"status": "success", "metadata": metadata}

def metadata_from_mouser_result(result, component_type=None):
    seed = {
        "manufacturer": result.get("manufacturer"),
        "manufacturer_part_number": result.get("manufacturer_part_number"),
        "supplier": result.get("supplier", "mouser"),
        "supplier_part_number": result.get("supplier_part_number"),
        "title": result.get("description"),
    }
    text = " ".join([
        result.get("description") or "",
        result.get("category") or "",
        result.get("manufacturer_part_number") or "",
        result.get("supplier_part_number") or "",
    ])
    metadata = infer_component_metadata_from_text(text, seed=seed)
    attrs = result.get("attributes") or {}
    attr_aliases = {
        "nominal_value": ["Capacitance", "Resistance", "Inductance", "Impedance", "Value"],
        "tolerance": ["Tolerance"],
        "voltage_rating": ["Voltage Rating", "Voltage", "Rated Voltage", "DC Voltage Rating"],
        "current_rating": ["Current Rating", "Current", "Rated Current", "Maximum DC Current"],
        "power_rating": ["Power Rating", "Power", "Wattage"],
        "temperature_range": ["Operating Temperature Range", "Minimum Operating Temperature", "Maximum Operating Temperature"],
        "package": ["Package / Case", "Package", "Case Code - in", "Case Code - mm"],
        "dielectric_or_material": ["Dielectric", "Dielectric Material", "Core Material", "Material", "Temperature Coefficient"],
        "operating_frequency_range": ["Frequency", "Frequency Range", "Operating Frequency"],
    }
    for target, aliases in attr_aliases.items():
        if metadata.get(target):
            continue
        values = [attrs.get(alias) for alias in aliases if attrs.get(alias)]
        if values:
            metadata[target] = " / ".join(dict.fromkeys(values))
    decoded = decode_value_from_mpn(result.get("manufacturer_part_number"), component_type)
    if decoded and not metadata.get("nominal_value"):
        metadata["nominal_value"] = decoded
    description = result.get("description")
    metadata["product_description"] = description
    metadata["product_category"] = result.get("category")
    metadata["mouser_product_url"] = normalize_external_url(result.get("product_url"))
    metadata["mouser_image_url"] = normalize_external_url(result.get("image_url"))
    metadata["mouser_availability"] = result.get("availability")
    metadata["lifecycle_status"] = result.get("lifecycle_status")
    if attrs:
        metadata["mouser_attributes"] = attrs
    if description:
        metadata["notes"] = description
    metadata["metadata_source"] = "mouser"
    return {k: v for k, v in metadata.items() if v is not None}

def enrich_component_from_mouser(req: MouserEnrichRequest):
    measurement_key = req.measurement_relative_path.replace(os.sep, "/")
    index = load_library_index()
    entry = index.get("measurements", {}).get(measurement_key)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")

    result = req.result
    if not result:
        query = req.query or entry.get("measurement_id") or entry.get("name")
        payload = search_mouser_datasheets(query, limit=10)
        result = next((item for item in payload.get("results", []) if item.get("datasheet_url")), None)
        if not result and payload.get("results"):
            result = payload["results"][0]
    if not result:
        raise HTTPException(status_code=404, detail="Mouser no devolvió resultados para completar el componente")

    metadata = metadata_from_mouser_result(result, entry.get("component_type"))
    current = entry.get("component_metadata", {})
    merged = {**{k: v for k, v in current.items() if v}, **metadata}
    merged.update({
        "manufacturer": result.get("manufacturer") or merged.get("manufacturer"),
        "manufacturer_part_number": result.get("manufacturer_part_number") or merged.get("manufacturer_part_number"),
        "supplier": result.get("supplier") or "mouser",
        "supplier_part_number": result.get("supplier_part_number") or merged.get("supplier_part_number"),
        "updated_at": time.time(),
        "metadata_source": "mouser",
    })
    entry["component_metadata"] = {k: v for k, v in merged.items() if v is not None}
    if result.get("datasheet_url"):
        datasheet = entry.get("datasheet", {})
        datasheet.update({
            "url": result.get("datasheet_url"),
            "supplier": result.get("supplier"),
            "manufacturer": result.get("manufacturer"),
            "manufacturer_part_number": result.get("manufacturer_part_number"),
            "supplier_part_number": result.get("supplier_part_number"),
            "title": result.get("description"),
            "image_url": normalize_external_url(result.get("image_url")),
        })
        entry["datasheet"] = datasheet
    save_library_index(index)
    return {"status": "success", "metadata": entry["component_metadata"], "measurement": entry, "source_result": result}

# --- Global VNA State ---
vna_instance = None
vna_current_type = None
e5071c_ip = "192.168.1.12"

def get_vna(device_type="NanoVNA"):
    global vna_instance, vna_current_type
    
    is_ok = False
    if vna_instance is not None and vna_current_type == device_type:
        try:
            # Re-conectar si la dirección IP del E5071C ha cambiado
            if "E5071C" in device_type and hasattr(vna_instance, 'ip_address'):
                if vna_instance.ip_address != e5071c_ip:
                    logging.info(f"Reconectando VNA E5071C: IP cambió de {vna_instance.ip_address} a {e5071c_ip}")
                    is_ok = False
                else:
                    is_ok = vna_instance.connected
            elif hasattr(vna_instance, 'is_connected'):
                is_ok = vna_instance.is_connected()
            elif hasattr(vna_instance, 'connected'):
                is_ok = vna_instance.connected
            else:
                is_ok = True # Assume ok if it exists but can't check
        except Exception as e:
            logging.error(f"VNA connectivity check failed: {e}")
            is_ok = False
            
    if not is_ok:
        logging.info(f"Connecting to VNA: {device_type}")
        # If we are switching device types, close previous one if possible
        if vna_instance is not None:
            try:
                if hasattr(vna_instance, 'close'):
                    vna_instance.close()
                elif hasattr(vna_instance, 'inst') and hasattr(vna_instance.inst, 'close'):
                    vna_instance.inst.close()
            except:
                pass
        
        # Detect architecture
        arch = "NanoVNA"
        if "HP" in device_type and "8752" in device_type:
            arch = "HP8752A"
        elif "E5071C" in device_type:
            arch = "E5071C"
        
        try:
            resource = e5071c_ip if arch == "E5071C" else None
            vna_instance = get_vna_connection(device_type=arch, resource_name=resource)
            vna_current_type = device_type
            logging.info(f"Connected to {arch}")
        except Exception as e:
            logging.error(f"Failed to connect to VNA ({arch}): {e}")
            raise e
        
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
    component_type: Optional[str] = None

class HPCalStepRequest(BaseModel):
    cal_type: str
    step_cmd: str
    device: str = "VNA-HP-8752A"

class HPCalImportRequest(BaseModel):
    filename: str
    device: str = "VNA-HP-8752A"

class HPMeasStepRequest(BaseModel):
    step_name: str
    params: Optional[dict] = None
    device: str = "VNA-HP-8752A"

class E5071CCalStartRequest(BaseModel):
    cal_type: str = "solt"  # "sol" | "solt"
    port1: int = 1
    port2: int = 2
    start_mhz: float
    stop_mhz: float
    points: int
    device: str = "VNA-E5071C"
    ip_address: Optional[str] = None
    calkit: Optional[str] = "calboard-izan"

class E5071CCalMeasureRequest(BaseModel):
    standard: str  # "open" | "short" | "load" | "thru"
    port: int = 1
    port2: int = 2
    device: str = "VNA-E5071C"

class E5071CSetupRequest(BaseModel):
    averaging_enabled: bool = False
    averaging_count: int = 16
    smoothing_enabled: bool = False
    smoothing_aperture: float = 5.0
    sweep_type: str = "LIN"
    device: str = "VNA-E5071C"
    ip_address: Optional[str] = None

class DatasheetDownloadRequest(BaseModel):
    datasheet_url: str
    supplier: Optional[str] = "manual"
    manufacturer: Optional[str] = None
    manufacturer_part_number: Optional[str] = None
    supplier_part_number: Optional[str] = None
    measurement_relative_path: Optional[str] = None
    title: Optional[str] = None
    image_url: Optional[str] = None

class DatasheetAttachRequest(BaseModel):
    measurement_relative_path: str
    datasheet_relative_path: str
    datasheet_url: Optional[str] = None
    supplier: Optional[str] = None
    manufacturer: Optional[str] = None
    manufacturer_part_number: Optional[str] = None
    supplier_part_number: Optional[str] = None
    title: Optional[str] = None
    image_url: Optional[str] = None

class ComponentMetadataRequest(BaseModel):
    measurement_relative_path: str
    manufacturer: Optional[str] = None
    manufacturer_part_number: Optional[str] = None
    supplier: Optional[str] = None
    supplier_part_number: Optional[str] = None
    nominal_value: Optional[str] = None
    tolerance: Optional[str] = None
    voltage_rating: Optional[str] = None
    current_rating: Optional[str] = None
    power_rating: Optional[str] = None
    temperature_range: Optional[str] = None
    package: Optional[str] = None
    dielectric_or_material: Optional[str] = None
    operating_frequency_range: Optional[str] = None
    product_description: Optional[str] = None
    product_category: Optional[str] = None
    mouser_product_url: Optional[str] = None
    mouser_image_url: Optional[str] = None
    mouser_availability: Optional[str] = None
    lifecycle_status: Optional[str] = None
    metadata_source: Optional[str] = None
    notes: Optional[str] = None
    datasheet_url: Optional[str] = None
    supplier_url: Optional[str] = None

class DatasheetExtractRequest(BaseModel):
    datasheet_relative_path: str
    measurement_relative_path: Optional[str] = None

class MouserEnrichRequest(BaseModel):
    measurement_relative_path: str
    query: Optional[str] = None
    result: Optional[dict] = None

class MeasurementMetadataActionRequest(BaseModel):
    measurement_relative_path: str

def measurement_action_request(req=None, measurement_relative_path=None):
    if req and getattr(req, "measurement_relative_path", None):
        return req
    if measurement_relative_path:
        return MeasurementMetadataActionRequest(measurement_relative_path=measurement_relative_path)
    raise HTTPException(status_code=422, detail="Falta measurement_relative_path")

class MouserApiKeyRequest(BaseModel):
    api_key: str

class AnalysisResultRequest(BaseModel):
    measurement_relative_path: str
    tool_name: str
    results: dict

class ReportGenerateRequest(BaseModel):
    measurement_relative_path: str

class ReportSaveRequest(BaseModel):
    measurement_relative_path: str
    html_content: str

import numpy as np

# --- API Endpoints ---
@app.get("/api/status")
async def api_status():
    return {"status": "online"}

@app.post("/api/vna/hp/measurement/step")
async def vna_hp_measurement_step(req: HPMeasStepRequest):
    try:
        vna = get_vna(device_type=req.device)
        if not hasattr(vna, 'hp_measurement_step'):
             raise HTTPException(status_code=400, detail="Device does not support HP measurement steps")
        res = vna.hp_measurement_step(req.step_name, req.params)
        return {"status": "success", "result": res}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/hp/calibrate/step")
async def vna_hp_calibrate_step(req: HPCalStepRequest):
    try:
        vna = get_vna(device_type=req.device)
        if not hasattr(vna, 'hp_calibration_step'):
             raise HTTPException(status_code=400, detail="Device does not support HP calibration steps")
        res = vna.hp_calibration_step(req.cal_type, req.step_cmd)
        return {"status": "success", "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vna/hp/export")
async def vna_hp_export(filename: str, device: str = "VNA-HP-8752A", save_to_server: bool = True):
    try:
        vna = get_vna(device_type=device)
        if not hasattr(vna, 'export_cal_json'):
             raise HTTPException(status_code=400, detail="Device does not support HP calibration export")
        
        state = vna.export_cal_json()
        
        import json
        import base64
        json_str = json.dumps(state, indent=4)
        file_content_b64 = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

        # Save to Biblioteca (Server) if requested
        if save_to_server:
            if not filename.endswith('.json'): filename += '.json'
            device_dir = get_device_dir(BASE_CAL_DIR, device)
            target_path = os.path.join(device_dir, filename)
            
            with open(target_path, 'w') as f:
                f.write(json_str)
            
        return {
            "status": "success", 
            "message": f"Calibración exportada correctamente",
            "file_content": file_content_b64,
            "filename": filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/hp/import")
async def vna_hp_import(req: HPCalImportRequest):
    try:
        if not req.filename.endswith('.json'): req.filename += '.json'
        
        # Look for file
        device_dir = get_device_dir(BASE_CAL_DIR, req.device)
        target_path = os.path.join(device_dir, req.filename)
        
        if not os.path.exists(target_path):
            raise HTTPException(status_code=404, detail="Archivo de calibración no encontrado")
            
        import json
        with open(target_path, 'r') as f:
            state = json.load(f)
            
        vna = get_vna(device_type=req.device)
        if not hasattr(vna, 'import_cal_json'):
             raise HTTPException(status_code=400, detail="Device does not support HP calibration import")
             
        vna.import_cal_json(state)
        return {"status": "success", "message": "Calibración restaurada en el VNA"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/hp/import_file")
async def vna_hp_import_file(device: str = Form(...), file: UploadFile = File(...)):
    try:
        content = await file.read()
        import json
        try:
            state = json.loads(content)
        except json.JSONDecodeError as je:
            raise HTTPException(status_code=400, detail=f"El archivo no es un JSON válido: {je}")
        
        vna = get_vna(device_type=device)
        if not hasattr(vna, 'import_cal_json'):
             raise HTTPException(status_code=400, detail="El equipo seleccionado no soporta importación de calibración HP")
             
        vna.import_cal_json(state)
        return {"status": "success", "message": "Calibración cargada desde archivo y restaurada en el VNA"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.error(f"HP Import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    # Caminar recursivamente para encontrar archivos .cal y .json si no se especifica dispositivo
    for root, dirs, files in os.walk(search_dir):
        for filename in files:
            if filename.endswith(".cal") or filename.endswith(".json"):
                path = os.path.join(root, filename)
                device_folder = os.path.basename(root) if root != BASE_CAL_DIR else "General"
                stats = os.stat(path)
                try:
                    if filename.endswith(".json"):
                        import json
                        with open(path, "r", encoding='utf-8') as f:
                            data = json.load(f)
                            # Verificar si tiene formato de calibración HP
                            if all(k in data for k in ["start_hz", "stop_hz", "points"]):
                                calibrations.append({
                                    "name": filename,
                                    "device": device_folder,
                                    "fmin": data["start_hz"] / 1e6,
                                    "fmax": data["stop_hz"] / 1e6,
                                    "points": data["points"],
                                    "type": "HP-VNA",
                                    "size": stats.st_size,
                                    "mtime": stats.st_mtime
                                })
                        continue

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
async def list_measurements(device: Optional[str] = None, component_type: Optional[str] = None):
    search_dir = BASE_MEAS_DIR
    if device:
        search_dir = get_measurement_dir(device, component_type)
        
    if not os.path.exists(search_dir):
        return []
    
    measurements = []
    index = load_library_index()
    index_changed = False
    for root, dirs, files in os.walk(search_dir):
        for filename in files:
            if filename.endswith(".s1p") or filename.endswith(".s2p"):
                path = os.path.join(root, filename)
                device_folder, component = measurement_metadata_from_path(root, filename)
                entry, changed = ensure_measurement_index_entry(index, path, device_folder, component)
                index_changed = index_changed or changed
                measurements.append(entry)
    if index_changed:
        save_library_index(index)
    # Ordenar por fecha de modificación (más nuevos primero)
    measurements.sort(key=lambda x: x["mtime"], reverse=True)
    return measurements

@app.get("/api/vna/measurements/analyze/{filename}")
async def analyze_server_measurement(filename: str, device: Optional[str] = None, component_type: Optional[str] = None):
    if device and component_type:
        target_path = os.path.join(get_measurement_dir(device, component_type), filename)
    elif device:
        target_path = os.path.join(get_device_dir(BASE_MEAS_DIR, device), filename)
        if not os.path.exists(target_path):
            target_path = None
            device_dir = get_device_dir(BASE_MEAS_DIR, device)
            for root, dirs, files in os.walk(device_dir):
                if filename in files:
                    target_path = os.path.join(root, filename)
                    break
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

@app.post("/api/library/index/rebuild")
async def rebuild_library_index():
    try:
        index = rebuild_measurement_index()
        return {
            "status": "success",
            "measurements": len(index.get("measurements", {})),
            "path": LIBRARY_INDEX_PATH,
        }
    except Exception as e:
        logging.error(f"Library index rebuild failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/datasheets/search")
async def search_datasheets(query: str, supplier: str = "mouser", limit: int = 10):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Introduce una referencia para buscar")
    supplier_key = supplier.strip().lower()
    if supplier_key == "mouser":
        payload = search_mouser_datasheets(query, limit)
        return {"supplier": supplier_key, **payload}
    raise HTTPException(status_code=400, detail=f"Proveedor no soportado todavía: {supplier}")

@app.get("/api/datasheets/providers")
async def get_datasheet_providers():
    key = get_mouser_api_key()
    source = "env" if os.environ.get("MOUSER_API_KEY") else ("config" if key else None)
    return {
        "mouser": {
            "configured": bool(key),
            "source": source,
            "masked_key": mask_secret(key),
        }
    }

@app.post("/api/datasheets/providers/mouser")
async def set_mouser_api_key(req: MouserApiKeyRequest):
    api_key = req.api_key.strip()
    if len(api_key) < 8:
        raise HTTPException(status_code=400, detail="La API key de Mouser parece demasiado corta")
    config = load_datasheet_provider_config()
    config.setdefault("mouser", {})
    config["mouser"]["api_key"] = api_key
    config["mouser"]["updated_at"] = time.time()
    save_datasheet_provider_config(config)
    return {
        "status": "success",
        "mouser": {
            "configured": True,
            "source": "config",
            "masked_key": mask_secret(api_key),
        }
    }

@app.post("/api/datasheets/download")
async def download_datasheet(req: DatasheetDownloadRequest):
    return download_datasheet_file(req)

@app.post("/api/datasheets/attach")
async def attach_datasheet(req: DatasheetAttachRequest):
    entry = attach_datasheet_to_measurement(req)
    return {"status": "success", "measurement": entry}

@app.get("/api/datasheets/file")
async def get_datasheet_file(path: str):
    target_path = safe_library_path(path)
    if not target_path.lower().endswith(".pdf") or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Datasheet no encontrado")
    filename = os.path.basename(target_path)
    return FileResponse(
        target_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )

@app.get("/api/datasheets/open")
async def open_datasheet_file(path: str):
    target_path = safe_library_path(path)
    if not target_path.lower().endswith(".pdf") or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Datasheet no encontrado")
    try:
        if sys.platform.startswith("win"):
            os.startfile(target_path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target_path])
        else:
            subprocess.Popen(["xdg-open", target_path])
        return {"status": "success", "path": library_relative_path(target_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo abrir el datasheet: {e}")

@app.post("/api/datasheets/extract-metadata")
async def extract_datasheet_metadata(req: DatasheetExtractRequest):
    return extract_and_optionally_update_component_metadata(req)

@app.post("/api/datasheets/enrich-from-mouser")
async def enrich_from_mouser(req: MouserEnrichRequest):
    return enrich_component_from_mouser(req)

@app.post("/api/library/measurement/component-metadata")
async def save_component_metadata(req: ComponentMetadataRequest):
    entry = update_component_metadata(req, source="manual")
    return {"status": "success", "measurement": entry}

@app.delete("/api/library/measurement/datasheet")
async def detach_measurement_datasheet(req: Optional[MeasurementMetadataActionRequest] = Body(None), measurement_relative_path: Optional[str] = None):
    entry = clear_measurement_datasheet(measurement_action_request(req, measurement_relative_path))
    return {"status": "success", "measurement": entry}

@app.post("/api/library/measurement/datasheet/detach")
async def detach_measurement_datasheet_post(req: Optional[MeasurementMetadataActionRequest] = Body(None), measurement_relative_path: Optional[str] = None):
    entry = clear_measurement_datasheet(measurement_action_request(req, measurement_relative_path))
    return {"status": "success", "measurement": entry}

@app.delete("/api/library/measurement/component-metadata")
async def delete_component_metadata(req: Optional[MeasurementMetadataActionRequest] = Body(None), measurement_relative_path: Optional[str] = None):
    entry = clear_component_metadata(measurement_action_request(req, measurement_relative_path))
    return {"status": "success", "measurement": entry}

@app.post("/api/library/measurement/component-metadata/clear")
async def clear_component_metadata_post(req: Optional[MeasurementMetadataActionRequest] = Body(None), measurement_relative_path: Optional[str] = None):
    entry = clear_component_metadata(measurement_action_request(req, measurement_relative_path))
    return {"status": "success", "measurement": entry}

def _resolve_measurement_entry(index, path_or_name):
    if not path_or_name:
        return None, None
    key = str(path_or_name).replace(os.sep, "/")
    if key in index.get("measurements", {}):
        return key, index["measurements"][key]
    
    # Try searching by exact filename
    for k, entry in index.get("measurements", {}).items():
        if entry.get("name") == path_or_name or entry.get("relative_path") == path_or_name:
            return k, entry
            
    # Try searching by filename without extension
    stem = os.path.splitext(os.path.basename(path_or_name))[0]
    for k, entry in index.get("measurements", {}).items():
        entry_stem = os.path.splitext(entry.get("name", ""))[0]
        if entry_stem == stem:
            return k, entry
            
    return None, None

@app.post("/api/library/measurement/analysis")
async def api_library_measurement_analysis(req: AnalysisResultRequest):
    index = load_library_index()
    measurement_key, entry = _resolve_measurement_entry(index, req.measurement_relative_path)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Medición '{req.measurement_relative_path}' no encontrada en el índice")
    
    history = entry.setdefault("analysis_history", {})
    tool_data = req.results.copy()
    tool_data["analyzed_at"] = time.time()
    history[req.tool_name] = tool_data
    
    save_library_index(index)
    return {"status": "success", "measurement": entry}

@app.post("/api/reports/generate")
async def api_reports_generate(req: ReportGenerateRequest):
    import datetime
    index = load_library_index()
    measurement_key, entry = _resolve_measurement_entry(index, req.measurement_relative_path)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")
        
    touchstone_path = None
    try:
        touchstone_path = safe_library_path(measurement_key)
        if not os.path.exists(touchstone_path):
            touchstone_path = None
    except Exception:
        pass
        
    try:
        html_content = generate_report_html(entry, touchstone_path)
        stem = os.path.splitext(os.path.basename(measurement_key))[0]
        date_suffix = datetime.datetime.now().strftime("%Y%m%d")
        suggested_filename = f"report_{stem}_{date_suffix}.html"
        return {
            "status": "success",
            "html_content": html_content,
            "suggested_filename": suggested_filename
        }
    except Exception as e:
        logging.error(f"Error generating report HTML: {e}")
        import traceback
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating report: {e}")

@app.post("/api/reports/save")
async def api_reports_save(req: ReportSaveRequest):
    index = load_library_index()
    measurement_key, entry = _resolve_measurement_entry(index, req.measurement_relative_path)
    if not entry:
        raise HTTPException(status_code=404, detail="Medición no encontrada en el índice")
        
    device = entry.get("device", "Unknown-Device")
    reports_dir = os.path.join(BIBLIOTECA_DIR, "Informes", device)
    os.makedirs(reports_dir, exist_ok=True)
    
    stem = os.path.splitext(os.path.basename(measurement_key))[0]
    import datetime
    date_suffix = datetime.datetime.now().strftime("%Y%m%d")
    filename = f"report_{stem}_{date_suffix}.html"
    target_path = os.path.join(reports_dir, filename)
    
    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(req.html_content)
        rel_path = os.path.relpath(target_path, BIBLIOTECA_DIR).replace(os.sep, "/")
        return {
            "status": "success",
            "absolute_path": target_path,
            "relative_path": rel_path
        }
    except Exception as e:
        logging.error(f"Error saving report: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving report to server: {e}")

@app.post("/api/reports/open")
async def api_reports_open(req: MeasurementMetadataActionRequest):
    # Try direct safe path first
    target_path = None
    try:
        target_path = safe_library_path(req.measurement_relative_path)
        if not os.path.exists(target_path):
            target_path = None
    except Exception:
        pass
        
    if not target_path:
        # Search in index
        index = load_library_index()
        measurement_key, entry = _resolve_measurement_entry(index, req.measurement_relative_path)
        if entry:
            target_path = safe_library_path(measurement_key)
            
    if not target_path or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="El archivo de informe no existe")
    
    try:
        import sys
        import subprocess
        if sys.platform == "win32":
            os.startfile(target_path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target_path])
        else:
            subprocess.Popen(["xdg-open", target_path])
        return {"status": "success", "path": library_relative_path(target_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo abrir el informe: {e}")

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
            if not os.path.exists(target_path):
                target_path = None
                device_dir = get_device_dir(BASE_MEAS_DIR, device)
                for root, dirs, files in os.walk(device_dir):
                    if filename in files:
                        target_path = os.path.join(root, filename)
                        break
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
        if not os.path.exists(target_path):
            target_path = None
            device_dir = get_device_dir(BASE_MEAS_DIR, device)
            for root, dirs, files in os.walk(device_dir):
                if filename in files:
                    target_path = os.path.join(root, filename)
                    break
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
@app.post("/api/vna/hp/correct-offline")
async def vna_hp_correct_offline(
    raw_file: UploadFile = File(...),
    cal_file: UploadFile = File(...)
):
    try:
        raw_content = await raw_file.read()
        cal_content = await cal_file.read()
        return apply_hp_correction(raw_content, cal_content, filename=raw_file.filename)
    except Exception as e:
        logging.error(f"Offline correction failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vna/connect")
async def vna_connect(device: str = "NanoVNA-Izan", ip: Optional[str] = None):
    global e5071c_ip
    try:
        if ip and "E5071C" in device:
            e5071c_ip = ip
        get_vna(device_type=device)
        return {"connected": True}
    except Exception as e:
        return {"connected": False, "error": str(e)}

@app.get("/api/vna/sweep")
async def vna_sweep(start_mhz: float, stop_mhz: float, points: int, one_port: bool = False, device: str = "NanoVNA-Izan"):
    try:
        vna = get_vna(device_type=device)
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
            
        device_dir = get_measurement_dir(device, req.component_type)
        target_path = os.path.join(device_dir, filename)
        with open(target_path, "w", encoding='utf-8') as f:
            f.write(req.content)
        upsert_measurement_index(target_path, device, req.component_type, extra={
            "source": "manual_save",
            "saved_at": time.time(),
        })
        return {"status": "success", "message": f"Medición guardada en {device}/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/hp/reset")
async def vna_hp_reset(device: str = "VNA-HP-8752A"):
    try:
        vna = get_vna(device_type=device)
        if hasattr(vna, 'reset_instrument'):
            vna.reset_instrument()
            return {"status": "success", "message": "VNA reiniciado correctamente"}
        else:
            raise HTTPException(status_code=400, detail="El equipo seleccionado no soporta reset")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- E5071C Endpoints ---

@app.post("/api/vna/e5071c/setup")
async def vna_e5071c_setup(req: E5071CSetupRequest):
    global e5071c_ip
    try:
        if req.ip_address:
            e5071c_ip = req.ip_address
        vna = get_vna(device_type=req.device)
        vna.set_averaging(req.averaging_enabled, req.averaging_count)
        vna.set_smoothing(req.smoothing_enabled, req.smoothing_aperture)
        vna.set_sweep_type(req.sweep_type)
        return {"status": "success", "message": "Setup aplicado correctamente"}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/calibrate/start")
async def vna_e5071c_cal_start(req: E5071CCalStartRequest):
    global e5071c_ip
    try:
        if req.ip_address:
            e5071c_ip = req.ip_address
        vna = get_vna(device_type=req.device)
        vna.set_sweep(req.start_mhz * 1e6, req.stop_mhz * 1e6, req.points)
        calkit_name = req.calkit or "calboard-izan"
        if req.cal_type == "sol":
            vna.cal_sol_start(req.port1, calkit_name=calkit_name)
        else:
            vna.cal_solt_start(req.port1, req.port2, calkit_name=calkit_name)
        return {"status": "success", "message": f"Calibración {req.cal_type.upper()} iniciada"}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/calibrate/measure")
async def vna_e5071c_cal_measure(req: E5071CCalMeasureRequest):
    try:
        vna = get_vna(device_type=req.device)
        if req.standard == "thru":
            vna.cal_measure_thru(req.port, req.port2)
        else:
            vna.cal_measure_standard(req.standard, req.port)
        return {"status": "success", "message": f"Estándar {req.standard.upper()} medido en puerto {req.port}"}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/calibrate/compute")
async def vna_e5071c_cal_compute(device: str = "VNA-E5071C"):
    try:
        vna = get_vna(device_type=device)
        vna.cal_compute()
        return {"status": "success", "message": "Coeficientes calculados y aplicados"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vna/e5071c/export")
async def vna_e5071c_export(filename: str, device: str = "VNA-E5071C", save_to_server: bool = True):
    try:
        vna = get_vna(device_type=device)
        state = vna.export_cal_json()
        if state is None:
            raise HTTPException(status_code=400, detail="No se pudo exportar la calibración")

        import json
        import base64
        json_str = json.dumps(state, indent=4)
        file_content_b64 = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')

        if save_to_server:
            if not filename.endswith('.json'): filename += '.json'
            device_dir = get_device_dir(BASE_CAL_DIR, device)
            target_path = os.path.join(device_dir, filename)
            with open(target_path, 'w') as f:
                f.write(json_str)

        return {
            "status": "success",
            "message": "Calibración exportada correctamente",
            "file_content": file_content_b64,
            "filename": filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/import")
async def vna_e5071c_import(req: HPCalImportRequest):
    try:
        device = req.device if "E5071C" in req.device else "VNA-E5071C"
        if not req.filename.endswith('.json'): req.filename += '.json'
        device_dir = get_device_dir(BASE_CAL_DIR, device)
        target_path = os.path.join(device_dir, req.filename)
        if not os.path.exists(target_path):
            raise HTTPException(status_code=404, detail="Archivo de calibración no encontrado")
        import json
        with open(target_path, 'r') as f:
            state = json.load(f)
        vna = get_vna(device_type=device)
        vna.import_cal_json(state)
        return {"status": "success", "message": "Calibración restaurada en el VNA"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/import_file")
async def vna_e5071c_import_file(device: str = Form("VNA-E5071C"), file: UploadFile = File(...)):
    try:
        content = await file.read()
        import json
        try:
            state = json.loads(content)
        except json.JSONDecodeError as je:
            raise HTTPException(status_code=400, detail=f"El archivo no es un JSON válido: {je}")
        vna = get_vna(device_type=device)
        vna.import_cal_json(state)
        return {"status": "success", "message": "Calibración cargada desde archivo y restaurada en el VNA"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.error(f"E5071C Import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/e5071c/reset")
async def vna_e5071c_reset(device: str = "VNA-E5071C"):
    try:
        vna = get_vna(device_type=device)
        vna.reset_instrument()
        return {"status": "success", "message": "E5071C reiniciado correctamente"}
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
    device: str = Form("NanoVNA-Izan"),
    save_to_library: bool = Form(False),
    component_type: Optional[str] = Form(None),
    averaging_count: int = Form(1),
    smoothing_window: int = Form(1),
    port1: int = Form(1),
    port2: int = Form(2)
):
    temp_cal_path = None
    should_cleanup = False
    try:
        if cal_file:
            import tempfile
            import shutil
            with tempfile.NamedTemporaryFile(delete=False, suffix=".json" if "HP" in device else ".cal") as tmp:
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

        # Determine architecture
        arch = "NanoVNA"
        if "HP" in device and "8752" in device:
            arch = "HP8752A"
        elif "E5071C" in device:
            arch = "E5071C"

        vna = get_vna(device_type=device)

        # Si hay un archivo de calibración, lo importamos antes de medir
        if temp_cal_path and arch == "HP8752A":
            import json
            with open(temp_cal_path, 'r') as f:
                state = json.load(f)
            vna.import_cal_json(state)
        elif temp_cal_path and arch == "E5071C":
            import json
            with open(temp_cal_path, 'r') as f:
                state = json.load(f)
            vna.import_cal_json(state)
            # Bloquear parámetros al archivo si se solicitó (aquí ya vienen del frontend)

        if arch == "E5071C":
            # E5071C: realizar la medición directamente usando sus métodos nativos de 1 y 2 puertos
            vna.set_sweep(start_mhz * 1e6, stop_mhz * 1e6, points)
            
            if is_one_port:
                # Medición de 1 puerto en port1
                freqs, s11 = vna.get_data(parameter=f"S{port1}{port1}")
                
                # Generar contenido Touchstone .s1p
                lines = [
                    "! Generated by RF Tool Suite (Agilent E5071C)",
                    f"! Port Mapping: Port 1 = Physical Port {port1}",
                    f"# Hz S RI R 50",
                    f"!Freq.(Hz) S11(Real) S11(Imag)"
                ]
                for i in range(len(freqs)):
                    lines.append(f"{freqs[i]:.10e} {np.real(s11[i]):.16e} {np.imag(s11[i]):.16e}")
                touchstone_content = "\n".join(lines) + "\n"
                
                # Generar plot S11
                s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                import io
                import base64
                plt.figure(figsize=(10, 5))
                plt.plot(freqs/1e6, s11_db, label=f"S{port1}{port1} (dB)", color='blue', linewidth=1.5)
                plt.title(f"E5071C 1-Port Measurement (Port {port1})")
                plt.xlabel("Frequency (MHz)")
                plt.ylabel("Magnitude (dB)")
                plt.grid(True, alpha=0.3)
                plt.legend()
                buf = io.BytesIO()
                plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                buf.seek(0)
                plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
                plt.close()
                
                result = {
                    "status": "success",
                    "freqs": freqs.tolist(),
                    "s11_real": np.real(s11).tolist(),
                    "s11_imag": np.imag(s11).tolist(),
                    "plot": plot_base64,
                    "touchstone_content": touchstone_content,
                    "port1": port1,
                    "port2": port1
                }
            else:
                # Medición completa de 2 puertos reales usando port1 y port2
                freqs, s11, s21, s12, s22 = vna.measure_full_2port(port1=port1, port2=port2)
                
                # Generar contenido Touchstone .s2p con los 4 parámetros reales medidos
                lines = [
                    "! Generated by RF Tool Suite (Agilent E5071C)",
                    f"! Port Mapping: Port 1 = Physical Port {port1}, Port 2 = Physical Port {port2}",
                    f"# Hz S RI R 50",
                    f"!Freq.(Hz) S11(Real) S11(Imag) S21(Real) S21(Imag) S12(Real) S12(Imag) S22(Real) S22(Imag)"
                ]
                for i in range(len(freqs)):
                    # Formato standard s2p: Freq ReS11 ImS11 ReS21 ImS21 ReS12 ImS12 ReS22 ImS22
                    lines.append(f"{freqs[i]:.10e} {np.real(s11[i]):.16e} {np.imag(s11[i]):.16e} {np.real(s21[i]):.16e} {np.imag(s21[i]):.16e} {np.real(s12[i]):.16e} {np.imag(s12[i]):.16e} {np.real(s22[i]):.16e} {np.imag(s22[i]):.16e}")
                touchstone_content = "\n".join(lines) + "\n"
                
                # Generar plot con S11 y S21
                s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))
                s21_db = 20 * np.log10(np.maximum(np.abs(s21), 1e-12))
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                import io
                import base64
                plt.figure(figsize=(10, 5))
                plt.plot(freqs/1e6, s11_db, label=f"S{port1}{port1} (dB)", color='blue', linewidth=1.5)
                plt.plot(freqs/1e6, s21_db, label=f"S{port2}{port1} (dB)", color='red', linewidth=1.5)
                plt.title(f"E5071C 2-Port Measurement (Ports {port1}-{port2})")
                plt.xlabel("Frequency (MHz)")
                plt.ylabel("Magnitude (dB)")
                plt.grid(True, alpha=0.3)
                plt.legend()
                buf = io.BytesIO()
                plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                buf.seek(0)
                plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
                plt.close()
                
                result = {
                    "status": "success",
                    "freqs": freqs.tolist(),
                    "s11_real": np.real(s11).tolist(),
                    "s11_imag": np.imag(s11).tolist(),
                    "s21_real": np.real(s21).tolist(),
                    "s21_imag": np.imag(s21).tolist(),
                    "plot": plot_base64,
                    "touchstone_content": touchstone_content,
                    "port1": port1,
                    "port2": port2
                }
        else:
            # Flujo clásico para NanoVNA o HP8752A
            if arch == "HP8752A":
                component_type = None
                averaging_count = 1
                smoothing_window = 1
            
            result = run_sweep(
                start_mhz * 1e6,
                stop_mhz * 1e6,
                points,
                calibration_path=temp_cal_path if arch == "NanoVNA" else None,
                vna=vna,
                one_port=is_one_port,
                device_type=arch,
                averaging_count=averaging_count,
                smoothing_window=smoothing_window,
            )
        
        if save_to_library and save_filename:
            ext = ".s1p" if is_one_port else ".s2p"
            filename = build_nanovna_measurement_name(save_filename, device, stop_mhz, component_type, ext) if arch == "NanoVNA" else None
            if not filename:
                filename = save_filename
            if not filename.endswith(ext):
                filename += ext
            
            device_meas_dir = get_measurement_dir(device, component_type)
            target_path = os.path.join(device_meas_dir, filename)
            with open(target_path, "w", encoding='utf-8') as f:
                f.write(result["touchstone_content"])
            index_entry = upsert_measurement_index(target_path, device, component_type, extra={
                "source": "nanovna_measurement" if arch == "NanoVNA" else "vna_measurement",
                "measurement_id": sanitize_filename_part(save_filename, "medicion"),
                "start_mhz": start_mhz,
                "stop_mhz": stop_mhz,
                "points": points,
                "is_one_port": is_one_port,
                "calibration_name": server_cal_name,
                "averaging_count": averaging_count,
                "smoothing_window": smoothing_window,
                "saved_at": time.time(),
            })
            result["saved_to_server"] = True
            result["saved_filename"] = filename
            result["component_type"] = normalize_component_type(component_type)
            result["library_metadata"] = index_entry
            
        return result
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        logging.error(f"Measurement failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if should_cleanup and temp_cal_path and os.path.exists(temp_cal_path):
            try:
                os.remove(temp_cal_path)
            except Exception as cleanup_error:
                logging.error(f"Failed to remove temp cal file: {cleanup_error}")

@app.post("/api/vna/calibrate/start")
async def vna_calibrate_start(req: CalibrateStartRequest, device: str = "NanoVNA-Izan"):
    try:
        vna = get_vna(device_type=device)
        return start_calibration(vna, req.start_mhz * 1e6, req.stop_mhz * 1e6, req.points, device_type="HP8752A" if "HP" in device else "NanoVNA")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/calibrate/step")
async def vna_calibrate_step(step: str, device: str = "NanoVNA-Izan"):
    try:
        vna = get_vna(device_type=device)
        return calibrate_step(vna, step)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vna/calibrate/finish")
async def vna_calibrate_finish(filename: Optional[str] = None, cal_type: str = "twoport", save_to_server: bool = False, device: str = "NanoVNA-Izan"):
    try:
        vna = get_vna(device_type=device)
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
    if not (file.filename.endswith(".cal") or file.filename.endswith(".json")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .cal o .json")
    
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
async def delete_library_file(filename: str, type: str, device: Optional[str] = None, component_type: Optional[str] = None):
    base_dir = None
    if type == "measurements":
        base_dir = BASE_MEAS_DIR
    elif type == "calibrations":
        base_dir = BASE_CAL_DIR
    elif type == "extractions":
        base_dir = COMPACT_MODELS_DIR
    
    if not base_dir:
        raise HTTPException(status_code=400, detail="Tipo de archivo inválido")
    
    if device and device != "General" and type == "measurements":
        target_dir = get_measurement_dir(device, component_type)
    elif device and device != "General" and type != "extractions":
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
        if type == "measurements":
            remove_measurement_from_index(file_path)
        return {"status": "success", "message": f"Archivo {filename} eliminado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/utils/quick-extract")
async def quick_extract_component(
    file: Optional[UploadFile] = File(None),
    filename: Optional[str] = Form(None),
    device: Optional[str] = Form(None),
    component_type: str = Form("capacitor"),
    method: str = Form("shunt"),
    z0: float = Form(50.0)
):
    try:
        tmp_path = None
        is_temp = False
        if file:
            content = await file.read()
            with tempfile.NamedTemporaryFile(suffix=".s2p", delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
                is_temp = True
        else:
            if not filename:
                raise HTTPException(status_code=400, detail="Debe proporcionar un archivo o un nombre de archivo")
            
            # Resolve server file
            index = load_library_index()
            measurement_key, entry = _resolve_measurement_entry(index, filename)
            if entry:
                tmp_path = safe_library_path(measurement_key)
            else:
                if device:
                    # Try fallback folders
                    base_dev_dir = get_device_dir(BASE_MEAS_DIR, device)
                    test_path = os.path.join(base_dev_dir, filename)
                    if os.path.exists(test_path):
                        tmp_path = test_path
                    else:
                        for comp_folder in NANOVNA_COMPONENT_FOLDERS.values():
                            test_path = os.path.join(base_dev_dir, comp_folder, filename)
                            if os.path.exists(test_path):
                                tmp_path = test_path
                                break
                if not tmp_path or not os.path.exists(tmp_path):
                    raise HTTPException(status_code=404, detail="Archivo de medición no encontrado en el servidor")
        
        try:
            ntwk = rf.Network(tmp_path)
            freqs = ntwk.f
            s_params = ntwk.s
            
            # Extract Z based on method
            if ntwk.nports == 1 or method == "oneport":
                zdut = ntwk.z[:, 0, 0]
            else:
                s21 = s_params[:, 1, 0]
                if method == "shunt":
                    zdut = (z0 / 2.0) * s21 / (1.0 - s21 + 1e-30)
                else: # series
                    zdut = (2.0 * z0) * (1.0 - s21) / (s21 + 1e-30)

            magz = np.abs(zdut)
            extraction = extract_nominal_typical(freqs, zdut, component_type)
            results = {
                "freq_hz": freqs.tolist(),
                "mag_z": magz.tolist(),
                **extraction,
            }

            return results

        finally:
            if is_temp and tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        import traceback
        traceback.print_exc()
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
def is_port_open(port, host=SERVER_HOST):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def is_backend_ready(host=SERVER_HOST, port=SERVER_PORT):
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/api/status", timeout=1.0) as response:
            return response.status == 200
    except Exception:
        return False

def wait_before_close():
    try:
        input("\nPresiona Enter para cerrar...")
    except EOFError:
        pass

def run_server():
    try:
        uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_config=None)
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
    server_url = f"http://{SERVER_HOST}:{SERVER_PORT}"
    print("\n" + "="*50)
    print("RF & Signal Integrity Suite - Servidor API")
    print(f"Accede a la web en: {server_url}")
    print("="*50 + "\n")

    if is_port_open(SERVER_PORT):
        if is_backend_ready():
            print(f"El backend ya esta ejecutandose en {server_url}.")
            print("Puedes usar el frontend directamente; no hace falta abrir otro servidor.")
        else:
            print(f"No se puede iniciar el backend: el puerto {SERVER_PORT} ya esta ocupado.")
            print("Cierra el proceso que use ese puerto o arranca con otro puerto:")
            print("  $env:RF_BACKEND_PORT=8081; py main.py")
        wait_before_close()
        sys.exit(0)
    
    try:
        import uvicorn
        uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_config=None)
    except Exception as e:
        import traceback
        traceback.print_exc()
        logging.error(f"Uvicorn server failed: {e}")
        print(f"\n❌ Error fatal al iniciar el servidor: {e}")
        wait_before_close()
