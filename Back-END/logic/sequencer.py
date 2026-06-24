"""RF Test Sequencer — automated RF test recipe execution.

A recipe is a list of steps, each with a type and parameters.
The sequencer executes steps in order, emitting SSE events for each.

Step types
----------
load_file       : load a Touchstone file from the library
quick_extract   : run nominal value extraction (extract_nominal)
compact_model   : run compact model extraction (extract_compact_model)
detect_markers  : run RF marker detection
evaluate_mask   : evaluate marker pass/fail against a spec mask
save_to_db      : register measurement in SQLite DB
generate_report : generate HTML report
wait            : pause for N seconds
note            : emit an informational message (no action)
"""
from __future__ import annotations

import json
import os
import time
import traceback
from typing import Any, Dict, Generator, List, Optional

# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------

STEP_TYPES = {
    "load_file":       "Cargar archivo de medida",
    "quick_extract":   "Extracción rápida C/L",
    "compact_model":   "Modelo compacto",
    "detect_markers":  "Detectar marcadores RF",
    "evaluate_mask":   "Evaluar Pass/Fail",
    "save_to_db":      "Guardar en base de datos",
    "generate_report": "Generar informe",
    "wait":            "Esperar",
    "note":            "Nota / comentario",
}


def _event(kind: str, data: Dict[str, Any]) -> str:
    """Format an SSE event string."""
    payload = json.dumps({"event": kind, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"


# ---------------------------------------------------------------------------
# Sequencer engine
# ---------------------------------------------------------------------------

def run_sequence(
    steps:      List[Dict[str, Any]],
    biblioteca_dir: str,
    db_path:    Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Execute a recipe and yield SSE events.

    Each step dict:
      {type, label?, params: {…}}

    Yields SSE 'data: …\\n\\n' strings.
    """
    ctx: Dict[str, Any] = {
        "file_path":        None,   # absolute path of loaded file
        "relative_path":    None,   # relative to biblioteca_dir
        "network":          None,   # skrf.Network
        "quick_result":     None,
        "compact_result":   None,
        "markers":          None,
        "pass_fail":        None,
        "db_id":            None,
        "report_html":      None,
        "biblioteca_dir":   biblioteca_dir,
        "db_path":          db_path,
    }

    n_steps = len(steps)
    yield _event("start", {"total": n_steps, "ts": time.time()})

    for step_idx, step in enumerate(steps):
        stype  = step.get("type", "note")
        label  = step.get("label") or STEP_TYPES.get(stype, stype)
        params = step.get("params", {})

        yield _event("step_start", {
            "idx":   step_idx,
            "total": n_steps,
            "type":  stype,
            "label": label,
        })

        try:
            result = _execute_step(stype, params, ctx)
            yield _event("step_done", {
                "idx":    step_idx,
                "type":   stype,
                "label":  label,
                "result": result,
            })
        except Exception as exc:
            tb = traceback.format_exc()
            yield _event("step_error", {
                "idx":   step_idx,
                "type":  stype,
                "label": label,
                "error": str(exc),
                "trace": tb,
            })
            # Abort sequence on error
            yield _event("abort", {"idx": step_idx, "error": str(exc)})
            return

    # Final summary
    summary = {
        "quick_result":   ctx.get("quick_result"),
        "markers":        ctx.get("markers"),
        "pass_fail":      ctx.get("pass_fail"),
        "db_id":          ctx.get("db_id"),
        "has_report":     ctx.get("report_html") is not None,
        "file_path":      ctx.get("relative_path"),
    }
    yield _event("done", {"summary": summary, "ts": time.time()})


def _execute_step(stype: str, params: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Execute one step and return a result dict. Updates ctx in place."""

    # ── load_file ────────────────────────────────────────────────────────────
    if stype == "load_file":
        rel_path  = params.get("path", "")
        bib_dir   = ctx["biblioteca_dir"]
        full_path = os.path.normpath(os.path.join(bib_dir, rel_path.replace("/", os.sep)))
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Archivo no encontrado: {full_path}")
        import skrf as rf
        ctx["file_path"]     = full_path
        ctx["relative_path"] = rel_path
        ctx["network"]       = rf.Network(full_path)
        n = ctx["network"]
        return {
            "path":     rel_path,
            "n_ports":  n.nports,
            "n_points": len(n.f),
            "fmin_ghz": round(n.f[0]  / 1e9, 4),
            "fmax_ghz": round(n.f[-1] / 1e9, 4),
        }

    # ── quick_extract ────────────────────────────────────────────────────────
    elif stype == "quick_extract":
        if not ctx["file_path"]:
            raise RuntimeError("Ningún archivo cargado. Añade un paso load_file primero.")
        from logic.nominal_extraction import extract_nominal
        with open(ctx["file_path"], "rb") as fh:
            content_bytes = fh.read()
        content = content_bytes.decode("utf-8", errors="replace")
        filename = os.path.basename(ctx["file_path"])
        component_type = params.get("component_type", "")
        result = extract_nominal(content, filename, component_type=component_type)
        ctx["quick_result"] = result
        return {
            "nominal_value": result.get("nominal_value"),
            "unit":          result.get("unit"),
            "srf_hz":        result.get("srf_hz"),
            "q_factor":      result.get("q_factor"),
            "quality":       result.get("quality"),
        }

    # ── compact_model ────────────────────────────────────────────────────────
    elif stype == "compact_model":
        if not ctx["file_path"]:
            raise RuntimeError("Ningún archivo cargado.")
        from logic.compact_models import extract_compact_model
        with open(ctx["file_path"], "rb") as fh:
            content = fh.read().decode("utf-8", errors="replace")
        filename       = os.path.basename(ctx["file_path"])
        method         = params.get("method", "vf")
        z0             = float(params.get("z0", 50.0))
        component_type = params.get("component_type", "capacitor")
        topology       = params.get("topology", "shunt")
        result = extract_compact_model(content, filename, method, z0, component_type, topology)
        ctx["compact_result"] = result
        summary = result.get("summary", {})
        return {
            "nrms":   summary.get("nrms"),
            "c_eff":  summary.get("c_eff"),
            "l_eff":  summary.get("l_eff"),
            "method": method,
        }

    # ── detect_markers ───────────────────────────────────────────────────────
    elif stype == "detect_markers":
        if not ctx["network"]:
            raise RuntimeError("Ningún archivo cargado.")
        from logic.markers import detect_from_network, format_markers_for_display
        component_type = params.get("component_type", "")
        topology       = params.get("topology", "shunt")
        mask           = params.get("mask", {})
        result = detect_from_network(
            ctx["network"],
            component_type=component_type,
            topology=topology,
            mask=mask,
            z0=float(params.get("z0", 50.0)),
        )
        markers_raw = result.get("markers", {})
        display     = format_markers_for_display(markers_raw)
        ctx["markers"]   = markers_raw
        ctx["pass_fail"] = result.get("pass_fail", {})
        return {
            "markers_count": len(display),
            "display":       display[:8],  # first 8 for the event payload
            "summary":       result.get("summary", ""),
        }

    # ── evaluate_mask ────────────────────────────────────────────────────────
    elif stype == "evaluate_mask":
        if ctx["pass_fail"] is None:
            raise RuntimeError("Ejecuta detect_markers antes de evaluate_mask.")
        pf = ctx["pass_fail"]
        failed = [k for k, v in pf.items() if v is False]
        passed = [k for k, v in pf.items() if v is True]
        overall = len(failed) == 0
        return {
            "result":  "PASS" if overall else "FAIL",
            "passed":  passed,
            "failed":  failed,
            "n_total": len(pf),
        }

    # ── save_to_db ───────────────────────────────────────────────────────────
    elif stype == "save_to_db":
        if not ctx["file_path"] or not ctx["db_path"]:
            raise RuntimeError("Archivo o base de datos no disponibles.")
        from logic import database as db_mod
        db_mod.init_db(ctx["db_path"])
        filename       = os.path.basename(ctx["file_path"])
        component_type = params.get("component_type", "")
        device         = params.get("device", "")
        quality        = None
        if ctx["quick_result"]:
            quality = ctx["quick_result"].get("quality")
        row_id = db_mod.register_measurement(
            filename=filename,
            filepath=ctx["file_path"],
            component_type=component_type,
            device_name=device,
            quality=quality,
        )
        ctx["db_id"] = row_id
        return {"db_id": row_id, "filename": filename}

    # ── generate_report ──────────────────────────────────────────────────────
    elif stype == "generate_report":
        if not ctx["relative_path"]:
            raise RuntimeError("Ningún archivo cargado.")
        # Build a minimal entry dict so the HTML template can render
        from logic.report_template import generate_report_html
        entry = {
            "name":           os.path.basename(ctx["relative_path"]),
            "device":         params.get("device", "RF Tool Suite Sequencer"),
            "component_type": params.get("component_type", ""),
            "n_ports":        ctx["network"].nports if ctx["network"] else 2,
            "points":         len(ctx["network"].f) if ctx["network"] else 0,
            "fmin_hz":        float(ctx["network"].f[0])  if ctx["network"] else 0,
            "fmax_hz":        float(ctx["network"].f[-1]) if ctx["network"] else 0,
            "component_metadata": {},
            "analysis_history": {
                "quick_extract":   ctx["quick_result"] or {},
                "compact_model":   ctx["compact_result"] or {},
            },
            "datasheet": {},
        }
        html = generate_report_html(entry, ctx["file_path"])
        ctx["report_html"] = html
        # Optionally save to disk
        if params.get("save", True):
            reports_dir = os.path.join(ctx["biblioteca_dir"], "Informes", "Sequencer")
            os.makedirs(reports_dir, exist_ok=True)
            stem = os.path.splitext(os.path.basename(ctx["relative_path"]))[0]
            ts   = time.strftime("%Y%m%d_%H%M%S")
            out_path = os.path.join(reports_dir, f"report_{stem}_{ts}.html")
            with open(out_path, "w", encoding="utf-8") as fh:
                fh.write(html)
            rel_out = os.path.relpath(out_path, ctx["biblioteca_dir"]).replace(os.sep, "/")
            return {"saved": True, "path": rel_out, "size_kb": round(len(html) / 1024, 1)}
        return {"saved": False, "size_kb": round(len(html) / 1024, 1)}

    # ── wait ─────────────────────────────────────────────────────────────────
    elif stype == "wait":
        seconds = float(params.get("seconds", 1.0))
        time.sleep(min(seconds, 10.0))  # cap at 10 s
        return {"waited_s": seconds}

    # ── note ─────────────────────────────────────────────────────────────────
    elif stype == "note":
        return {"message": params.get("message", "")}

    else:
        raise ValueError(f"Tipo de paso desconocido: '{stype}'")
