"""Multi-S2P comparison engine.

Loads multiple Touchstone files, interpolates them to a common frequency
grid, and computes per-frequency statistics (mean, std, min, max).
Also returns per-file summary metrics for tabular display.
"""
from __future__ import annotations

import io
import os
import numpy as np
import skrf as rf
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compare_measurements(
    paths: List[str],
    param: str = "S11",
    metric: str = "db",
    n_grid: int = 1000,
    z0: float = 50.0,
) -> Dict[str, Any]:
    """
    Compare multiple Touchstone files.

    Parameters
    ----------
    paths   : list of absolute filesystem paths to .s1p/.s2p files
    param   : 'S11', 'S21', 'S12', 'S22'
    metric  : 'db' (magnitude in dB), 'mag' (linear |S|), 'phase' (degrees)
    n_grid  : number of interpolation points on the common frequency grid
    z0      : reference impedance

    Returns
    -------
    dict with:
      freq_ghz       : common frequency array (n_grid points)
      traces         : list of {label, path, values}
      stats          : {mean, std, min_env, max_env}
      summary        : list of per-file metrics
      param, metric, n_loaded
    """
    # Parse port/index from param string (e.g. S21 → port_out=1, port_in=0)
    p = param.upper().replace("S", "")
    port_out = int(p[0]) - 1  # 0-indexed
    port_in  = int(p[1]) - 1

    loaded: List[Tuple[str, rf.Network]] = []
    skipped: List[str] = []

    for fpath in paths:
        try:
            ntw = rf.Network(fpath)
            # Check if the requested port combination exists
            if ntw.nports <= max(port_out, port_in):
                # Fallback to S11 if S21 requested but file is 1-port
                port_out_use = 0
                port_in_use  = 0
            else:
                port_out_use = port_out
                port_in_use  = port_in
            loaded.append((fpath, ntw, port_out_use, port_in_use))
        except Exception:
            skipped.append(fpath)

    if not loaded:
        return {"error": "No se pudo cargar ningún archivo", "n_loaded": 0}

    # ── Common frequency grid ────────────────────────────────────────────────
    # Use the intersection range of all files
    f_min = max(ntw.f[0]  for _, ntw, *_ in loaded)
    f_max = min(ntw.f[-1] for _, ntw, *_ in loaded)

    if f_min >= f_max:
        # No overlap — use union and extrapolate won't work, use widest range
        f_min = min(ntw.f[0]  for _, ntw, *_ in loaded)
        f_max = max(ntw.f[-1] for _, ntw, *_ in loaded)

    freq_common = np.linspace(f_min, f_max, n_grid)

    # ── Extract and interpolate each trace ──────────────────────────────────
    traces = []
    matrix = np.zeros((len(loaded), n_grid))

    for i, (fpath, ntw, po, pi) in enumerate(loaded):
        label = os.path.basename(fpath)
        raw_values = _extract_metric(ntw, po, pi, metric)
        # Interpolate to common grid
        interpolated = np.interp(freq_common, ntw.f, raw_values)
        matrix[i, :] = interpolated
        traces.append({
            "label":  label,
            "path":   fpath,
            "values": interpolated.tolist(),
        })

    # ── Statistics ───────────────────────────────────────────────────────────
    mean_v   = np.mean(matrix, axis=0)
    std_v    = np.std(matrix, axis=0, ddof=0)
    min_env  = np.min(matrix, axis=0)
    max_env  = np.max(matrix, axis=0)

    # ── Per-file summary metrics ─────────────────────────────────────────────
    summary = []
    for i, (fpath, ntw, po, pi) in enumerate(loaded):
        raw_db  = _extract_metric(ntw, po, pi, "db")
        raw_mag = _extract_metric(ntw, po, pi, "mag")

        srf_hz = _find_srf(ntw, po, pi)
        bw_3db_hz = _bandwidth(raw_db, ntw.f, -3.0)
        peak_db = float(np.max(raw_db)) if metric == "db" else None
        valley_db = float(np.min(raw_db)) if metric == "db" else None

        summary.append({
            "label":       os.path.basename(fpath),
            "path":        fpath,
            "n_points":    int(ntw.nports),
            "fmin_ghz":    float(ntw.f[0] / 1e9),
            "fmax_ghz":    float(ntw.f[-1] / 1e9),
            "peak_db":     round(float(np.max(raw_db)), 2),
            "valley_db":   round(float(np.min(raw_db)), 2),
            "mean_db":     round(float(np.mean(raw_db)), 2),
            "srf_ghz":     round(srf_hz / 1e9, 4) if srf_hz else None,
            "bw_3db_mhz":  round(bw_3db_hz / 1e6, 2) if bw_3db_hz else None,
        })

    return {
        "freq_ghz":   (freq_common / 1e9).tolist(),
        "traces":     traces,
        "stats": {
            "mean":    mean_v.tolist(),
            "std":     std_v.tolist(),
            "min_env": min_env.tolist(),
            "max_env": max_env.tolist(),
        },
        "summary":    summary,
        "param":      param,
        "metric":     metric,
        "n_loaded":   len(loaded),
        "n_skipped":  len(skipped),
        "skipped":    skipped,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_metric(ntw: rf.Network, port_out: int, port_in: int, metric: str) -> np.ndarray:
    """Extract the requested metric array from a Network."""
    s = ntw.s[:, port_out, port_in]
    if metric == "db":
        return 20.0 * np.log10(np.abs(s) + 1e-30)
    elif metric == "mag":
        return np.abs(s)
    elif metric == "phase":
        return np.angle(s, deg=True)
    elif metric == "re":
        return s.real
    elif metric == "im":
        return s.imag
    return 20.0 * np.log10(np.abs(s) + 1e-30)


def _find_srf(ntw: rf.Network, port_out: int, port_in: int) -> Optional[float]:
    """Find self-resonant frequency (minimum |S11| or minimum |Z|)."""
    try:
        if ntw.nports >= 2:
            s11 = ntw.s[:, 0, 0]
        else:
            s11 = ntw.s[:, 0, 0]
        s11_db = 20.0 * np.log10(np.abs(s11) + 1e-30)
        idx = int(np.argmin(s11_db))
        return float(ntw.f[idx])
    except Exception:
        return None


def _bandwidth(s_db: np.ndarray, freq: np.ndarray, threshold_db: float) -> Optional[float]:
    """Estimate -3 dB bandwidth around the peak."""
    try:
        peak_idx = int(np.argmax(s_db))
        peak_val = s_db[peak_idx]
        level = peak_val + threshold_db  # e.g. peak - 3 dB

        # Find lower edge
        f_low = freq[0]
        for i in range(peak_idx, 0, -1):
            if s_db[i] < level:
                f_low = np.interp(level, [s_db[i], s_db[i+1]], [freq[i], freq[i+1]])
                break

        # Find upper edge
        f_high = freq[-1]
        for i in range(peak_idx, len(s_db) - 1):
            if s_db[i] < level:
                f_high = np.interp(level, [s_db[i-1], s_db[i]], [freq[i-1], freq[i]])
                break

        bw = f_high - f_low
        return float(bw) if bw > 0 else None
    except Exception:
        return None
