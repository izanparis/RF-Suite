"""RF marker auto-detection engine.

Given frequency and S-parameter / impedance arrays, detects:
  - Resonance / SRF
  - Return loss minimum & VSWR
  - -3 dB and -10 dB bandwidths
  - Q factor, ESR, DCR
  - Pass/Fail against an optional mask

All frequencies are in Hz.  S-params in dB.  Impedances in Ohms (complex).
"""
from __future__ import annotations

import numpy as np
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_markers(
    freq:           np.ndarray,
    s11_db:         Optional[np.ndarray] = None,
    s21_db:         Optional[np.ndarray] = None,
    z_complex:      Optional[np.ndarray] = None,   # complex impedance array
    component_type: Optional[str]        = None,   # "capacitor" | "inductor" | None
    mask:           Optional[Dict]       = None,   # pass/fail rules dict
) -> Dict[str, Any]:
    """
    Returns:
        {
            "markers":   {name: value, ...},
            "pass_fail": {rule_name: {"value", "limit", "pass"}, ...},
            "summary":   "PASS" | "FAIL" | "N/A"
        }
    """
    freq = np.asarray(freq, dtype=float)
    markers: Dict[str, Any] = {}

    # -----------------------------------------------------------------------
    # S11 markers
    # -----------------------------------------------------------------------
    if s11_db is not None:
        s11 = np.asarray(s11_db, dtype=float)
        idx_min = int(np.argmin(s11))

        markers["s11_min_db"]       = float(s11[idx_min])
        markers["s11_min_freq_hz"]  = float(freq[idx_min])
        markers["return_loss_db"]   = float(-s11[idx_min])

        # VSWR from S11 linear magnitude
        s11_lin = 10.0 ** (s11 / 20.0)
        s11_lin = np.clip(s11_lin, 0.0, 0.9999)
        vswr = (1.0 + s11_lin) / (1.0 - s11_lin)
        idx_vswr = int(np.argmin(vswr))
        markers["vswr_min"]         = float(vswr[idx_vswr])
        markers["vswr_min_freq_hz"] = float(freq[idx_vswr])

        # -10 dB bandwidth (antenna / resonator)
        _bw = _bandwidth(freq, s11, threshold=-10.0)
        if _bw:
            markers["bw_10dB_low_hz"]  = _bw["f_low"]
            markers["bw_10dB_high_hz"] = _bw["f_high"]
            markers["bw_10dB_hz"]      = _bw["bw"]
            markers["center_freq_s11_hz"] = _bw["center"]

        # -3 dB return-loss bandwidth
        _bw3 = _bandwidth(freq, s11, threshold=s11[idx_min] + 3.0)
        if _bw3:
            markers["bw_3dB_rl_low_hz"]  = _bw3["f_low"]
            markers["bw_3dB_rl_high_hz"] = _bw3["f_high"]
            markers["bw_3dB_rl_hz"]      = _bw3["bw"]

    # -----------------------------------------------------------------------
    # S21 markers
    # -----------------------------------------------------------------------
    if s21_db is not None:
        s21 = np.asarray(s21_db, dtype=float)

        # Passband peak
        idx_peak = int(np.argmax(s21))
        markers["s21_peak_db"]       = float(s21[idx_peak])
        markers["s21_peak_freq_hz"]  = float(freq[idx_peak])
        markers["insertion_loss_db"] = float(s21[0])

        # -3 dB bandwidth from peak
        _bw3s21 = _bandwidth(freq, s21, threshold=s21[idx_peak] - 3.0, above=True)
        if _bw3s21:
            markers["bw_3dB_low_hz"]   = _bw3s21["f_low"]
            markers["bw_3dB_high_hz"]  = _bw3s21["f_high"]
            markers["bw_3dB_hz"]       = _bw3s21["bw"]
            markers["center_freq_hz"]  = _bw3s21["center"]

        # Max rejection
        idx_min_s21 = int(np.argmin(s21))
        markers["s21_rejection_db"]      = float(s21[idx_min_s21])
        markers["s21_rejection_freq_hz"] = float(freq[idx_min_s21])

    # -----------------------------------------------------------------------
    # Impedance markers (from complex Z)
    # -----------------------------------------------------------------------
    if z_complex is not None:
        z = np.asarray(z_complex, dtype=complex)
        z_mag  = np.abs(z)
        z_real = np.real(z)
        z_imag = np.imag(z)

        # SRF = frequency of minimum |Z| (for cap shunt-through, or 1-port cap)
        idx_srf = int(np.argmin(z_mag))
        markers["srf_hz"]    = float(freq[idx_srf])
        markers["z_at_srf"]  = float(z_mag[idx_srf])
        markers["esr"]       = float(z_real[idx_srf])

        # DCR = Re(Z) at lowest frequency
        markers["dcr_ohm"] = float(z_real[0])

        # Zero-crossing of Im(Z) = resonance frequency
        sign_changes = np.where(np.diff(np.sign(z_imag)))[0]
        if len(sign_changes) > 0:
            ic = sign_changes[0]
            # Linear interpolation for sub-point accuracy
            f_res = _interp_zero(freq[ic], freq[ic + 1], z_imag[ic], z_imag[ic + 1])
            markers["resonance_hz"] = float(f_res)

        # Q factor — use pre-resonant window (first half before SRF)
        pre_n = max(2, idx_srf)
        f_pre = freq[:pre_n]
        zi_pre = z_imag[:pre_n]
        zr_pre = z_real[:pre_n]
        # For capacitor: Im(Z) < 0;  |Im(Z)| / Re(Z)
        q_vals = np.abs(zi_pre) / (np.abs(zr_pre) + 1e-30)
        # Ignore unreliable points where Re(Z) ≈ 0
        valid = zr_pre > 1e-6
        if np.any(valid):
            markers["q_factor"] = float(np.median(q_vals[valid]))

        # Nominal value from reactance slope
        if component_type == "capacitor":
            # Im(Z) ≈ -1/(ωC)  →  C = -1/(ω·Im(Z))  for Im(Z)<0
            cap_pts = z_imag[:pre_n] < 0
            if np.any(cap_pts):
                c_vals = -1.0 / (2.0 * np.pi * f_pre[cap_pts] * z_imag[:pre_n][cap_pts])
                c_vals = c_vals[c_vals > 0]
                if len(c_vals):
                    markers["nominal_capacitance_f"] = float(np.median(c_vals))

        elif component_type == "inductor":
            # Im(Z) ≈ ωL  for Im(Z)>0
            ind_pts = z_imag[:pre_n] > 0
            if np.any(ind_pts):
                l_vals = z_imag[:pre_n][ind_pts] / (2.0 * np.pi * f_pre[ind_pts])
                l_vals = l_vals[l_vals > 0]
                if len(l_vals):
                    markers["nominal_inductance_h"] = float(np.median(l_vals))

    # -----------------------------------------------------------------------
    # Pass/Fail evaluation
    # -----------------------------------------------------------------------
    pass_fail: Dict[str, Any] = {}
    if mask:
        for rule_name, rule in mask.items():
            param     = rule.get("param")      # marker key or "s11@f", "s21@f"
            limit     = rule.get("limit")
            direction = rule.get("direction", "max")   # "max" → value ≤ limit
            freq_hz   = rule.get("freq_hz")

            value = _eval_rule_value(param, freq_hz, freq, s11_db, s21_db, markers)
            if value is not None and limit is not None:
                passed = (value <= limit) if direction == "max" else (value >= limit)
                pass_fail[rule_name] = {"value": round(value, 6), "limit": limit, "pass": passed}

    overall = "N/A"
    if pass_fail:
        overall = "PASS" if all(r["pass"] for r in pass_fail.values()) else "FAIL"

    return {"markers": markers, "pass_fail": pass_fail, "summary": overall}


# ---------------------------------------------------------------------------
# Convenience: detect from skrf Network object
# ---------------------------------------------------------------------------

def detect_from_network(
    ntwk,
    component_type: Optional[str] = None,
    topology:       str           = "shunt",
    mask:           Optional[Dict] = None,
    z0:             float          = 50.0,
) -> Dict[str, Any]:
    """
    ntwk: skrf.Network object
    topology: "shunt" | "series" | "oneport"
    """
    freq = ntwk.f
    s11_db = ntwk.s_db[:, 0, 0]

    s21_db = None
    if ntwk.nports >= 2:
        s21_db = ntwk.s_db[:, 1, 0]

    # Compute impedance
    z_complex = None
    try:
        if ntwk.nports >= 2:
            s21 = ntwk.s[:, 1, 0]
            if topology == "series":
                z_complex = z0 * 2.0 * (1.0 - s21) / (s21 + 1e-30)
            else:  # shunt (default)
                z_complex = z0 * s21 / (2.0 * (1.0 - s21) + 1e-30)
        else:
            s11 = ntwk.s[:, 0, 0]
            z_complex = z0 * (1.0 + s11) / (1.0 - s11 + 1e-30)
    except Exception:
        pass

    return detect_markers(
        freq=freq,
        s11_db=s11_db,
        s21_db=s21_db,
        z_complex=z_complex,
        component_type=component_type,
        mask=mask,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bandwidth(
    freq: np.ndarray,
    values: np.ndarray,
    threshold: float,
    above: bool = False,
) -> Optional[Dict[str, float]]:
    """Return bandwidth dict where values cross `threshold`.
    above=True: find region where values >= threshold (passband).
    above=False: find region where values <= threshold (e.g. S11 < -10 dB).
    """
    if above:
        mask = values >= threshold
    else:
        mask = values <= threshold

    if not np.any(mask):
        return None

    crossings = np.where(np.diff(mask.astype(int)))[0]
    if len(crossings) < 2:
        # Check if entire range satisfies
        if np.all(mask):
            return {"f_low": float(freq[0]), "f_high": float(freq[-1]),
                    "bw": float(freq[-1] - freq[0]), "center": float((freq[-1] + freq[0]) / 2)}
        return None

    f_low  = float(freq[crossings[0]])
    f_high = float(freq[crossings[-1]])
    bw     = f_high - f_low
    return {"f_low": f_low, "f_high": f_high, "bw": bw, "center": (f_low + f_high) / 2.0}


def _interp_zero(x0: float, x1: float, y0: float, y1: float) -> float:
    """Linear interpolation to find x where y=0."""
    if abs(y1 - y0) < 1e-30:
        return (x0 + x1) / 2.0
    return x0 - y0 * (x1 - x0) / (y1 - y0)


def _eval_rule_value(
    param:   Optional[str],
    freq_hz: Optional[float],
    freq:    np.ndarray,
    s11_db:  Optional[np.ndarray],
    s21_db:  Optional[np.ndarray],
    markers: Dict,
) -> Optional[float]:
    """Resolve a mask rule to a numeric value."""
    if param is None:
        return None

    # Direct S-param at a specific frequency
    if param == "s11_db" and s11_db is not None and freq_hz is not None:
        idx = int(np.argmin(np.abs(freq - freq_hz)))
        return float(s11_db[idx])
    if param == "s21_db" and s21_db is not None and freq_hz is not None:
        idx = int(np.argmin(np.abs(freq - freq_hz)))
        return float(s21_db[idx])

    # Marker lookup
    return markers.get(param)


# ---------------------------------------------------------------------------
# Formatting helpers (for API responses)
# ---------------------------------------------------------------------------

def format_markers_for_display(markers: Dict) -> List[Dict[str, str]]:
    """Convert raw markers dict to a list of {label, value} for the UI."""
    rows = []
    label_map = {
        "s11_min_db":           ("S11 mínimo",           "dB"),
        "s11_min_freq_hz":      ("Frecuencia S11 mín",   "Hz"),
        "return_loss_db":       ("Return Loss",           "dB"),
        "vswr_min":             ("VSWR mínimo",           ""),
        "vswr_min_freq_hz":     ("Frecuencia VSWR mín",  "Hz"),
        "bw_10dB_hz":           ("BW −10 dB",            "Hz"),
        "center_freq_s11_hz":   ("Frecuencia central",   "Hz"),
        "bw_3dB_hz":            ("BW −3 dB",             "Hz"),
        "center_freq_hz":       ("Frecuencia central",   "Hz"),
        "s21_peak_db":          ("S21 máximo",           "dB"),
        "insertion_loss_db":    ("Pérdidas inserción",   "dB"),
        "s21_rejection_db":     ("Rechazo máximo",       "dB"),
        "srf_hz":               ("SRF",                  "Hz"),
        "resonance_hz":         ("Resonancia",           "Hz"),
        "q_factor":             ("Factor Q",             ""),
        "esr":                  ("ESR",                  "Ω"),
        "dcr_ohm":              ("DCR",                  "Ω"),
        "nominal_capacitance_f":("Capacidad nominal",    "F"),
        "nominal_inductance_h": ("Inductancia nominal",  "H"),
    }

    for key, (label, unit) in label_map.items():
        if key not in markers:
            continue
        val = markers[key]
        rows.append({"key": key, "label": label, "value": _fmt_value(val, unit), "raw": val, "unit": unit})

    return rows


def _fmt_value(val: Any, unit: str) -> str:
    if not isinstance(val, (int, float)):
        return str(val)
    if unit == "Hz":
        if val >= 1e9:   return f"{val/1e9:.4g} GHz"
        if val >= 1e6:   return f"{val/1e6:.4g} MHz"
        if val >= 1e3:   return f"{val/1e3:.4g} kHz"
        return f"{val:.4g} Hz"
    if unit == "F":
        if val >= 1e-3:  return f"{val*1e3:.4g} mF"
        if val >= 1e-6:  return f"{val*1e6:.4g} µF"
        if val >= 1e-9:  return f"{val*1e9:.4g} nF"
        return f"{val*1e12:.4g} pF"
    if unit == "H":
        if val >= 1e-3:  return f"{val*1e3:.4g} mH"
        if val >= 1e-6:  return f"{val*1e6:.4g} µH"
        if val >= 1e-9:  return f"{val*1e9:.4g} nH"
        return f"{val*1e12:.4g} pH"
    if unit == "dB":
        return f"{val:.2f} dB"
    if unit == "Ω":
        if abs(val) >= 1e6: return f"{val/1e6:.3g} MΩ"
        if abs(val) >= 1e3: return f"{val/1e3:.3g} kΩ"
        return f"{val:.4g} Ω"
    return f"{val:.4g}" + (f" {unit}" if unit else "")
