"""TDR — Time Domain Reflectometry from S-parameter data.

Converts S11(f) to the time domain via IFFT with windowing,
then maps the time axis to distance using the propagation velocity.

Detects impedance discontinuities and classifies them (open, short,
capacitive, inductive) based on the TDR waveform shape.
"""
from __future__ import annotations

import io
import math
import numpy as np
import skrf as rf
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Window functions
# ---------------------------------------------------------------------------
_WINDOW_MAP = {
    "rectangular": lambda n: np.ones(n),
    "hanning":     np.hanning,
    "hamming":     np.hamming,
    "blackman":    np.blackman,
    "kaiser6":     lambda n: np.kaiser(n, 6.0),
    "kaiser8":     lambda n: np.kaiser(n, 8.0),
    "kaiser14":    lambda n: np.kaiser(n, 14.0),
}

C0 = 2.99792458e8  # speed of light in vacuum (m/s)


def compute_tdr(
    content: bytes,
    filename: str,
    window: str = "kaiser6",
    vf: float = 0.66,
    z0: float = 50.0,
    zero_pad_factor: int = 4,
) -> Dict[str, Any]:
    """
    Compute TDR from an S-parameter file (s1p or s2p).

    Parameters
    ----------
    content         : raw file bytes
    filename        : original filename (used to determine format)
    window          : windowing function name (see _WINDOW_MAP)
    vf              : velocity factor (0–1) for distance axis
    z0              : reference impedance in Ω
    zero_pad_factor : IFFT zero-padding multiplier for time resolution

    Returns
    -------
    dict with keys:
      time_ns, distance_m, impedance_ohm, reflection, freq_ghz,
      s11_db, meta {fmin_ghz, fmax_ghz, n_points, vf, window, z0},
      discontinuities [{time_ns, distance_m, impedance_ohm, type, amplitude}]
    """
    # Load network
    ntw = rf.Network(io.StringIO(content.decode("utf-8", errors="replace")), f_unit="hz")
    if ntw.nports >= 2:
        s11 = ntw.s[:, 0, 0]
    else:
        s11 = ntw.s[:, 0, 0]

    freq = ntw.f  # Hz array
    n_orig = len(freq)
    fmin = freq[0]
    fmax = freq[-1]
    df = (fmax - fmin) / (n_orig - 1) if n_orig > 1 else 1.0

    # Apply window
    win_fn = _WINDOW_MAP.get(window, _WINDOW_MAP["kaiser6"])
    win = win_fn(n_orig)
    s11_windowed = s11 * win

    # Zero-pad for better time resolution
    n_pad = n_orig * zero_pad_factor
    s11_padded = np.zeros(n_pad, dtype=complex)
    s11_padded[:n_orig] = s11_windowed

    # IFFT: S11(f) → s11(t)
    # We mirror the spectrum for a real-valued IFFT (single-sided → double-sided)
    # DC component at index 0, then positive freqs, then conjugate-mirrored negative freqs
    n_full = 2 * n_pad
    s11_full = np.zeros(n_full, dtype=complex)
    s11_full[0]            = 0.0  # DC: assume Γ(0) = 0 (matched at DC)
    s11_full[1:n_pad + 1]  = s11_padded
    s11_full[n_pad + 1:]   = np.conj(s11_padded[-1:0:-1])

    tdr_complex = np.fft.ifft(s11_full) * n_full

    # Time axis: dt = 1 / (n_full * df)
    dt = 1.0 / (n_full * df)
    n_pos = n_full // 2
    time_s = np.arange(n_pos) * dt  # only positive half (causal)

    # Convert reflection coefficient to impedance
    gamma = tdr_complex[:n_pos].real
    # Clamp gamma to avoid division issues
    gamma_clamped = np.clip(gamma, -0.9999, 0.9999)
    impedance = z0 * (1.0 + gamma_clamped) / (1.0 - gamma_clamped)

    # Distance axis: d = vf * c0 * t / 2  (round-trip)
    vp = vf * C0
    distance_m = vp * time_s / 2.0

    # Limit output to reasonable window: 2× the electrical length of the measurement
    t_max = 2.0 / fmin if fmin > 0 else 100e-9  # ~2 periods at fmin
    mask = time_s <= t_max
    time_ns    = (time_s[mask] * 1e9).tolist()
    dist_m     = distance_m[mask].tolist()
    impedance_ = impedance[mask].tolist()
    gamma_     = gamma[mask].tolist()

    # Original S11 dB for reference
    s11_db = (20.0 * np.log10(np.abs(s11) + 1e-30)).tolist()
    freq_ghz = (freq / 1e9).tolist()

    # Detect discontinuities (local extrema of impedance with amplitude > threshold)
    disc = _detect_discontinuities(
        np.array(time_ns),
        np.array(dist_m),
        np.array(impedance_),
        np.array(gamma_),
        z0,
    )

    return {
        "time_ns":       time_ns,
        "distance_m":    dist_m,
        "impedance_ohm": impedance_,
        "reflection":    gamma_,
        "freq_ghz":      freq_ghz,
        "s11_db":        s11_db,
        "meta": {
            "fmin_ghz":   float(fmin / 1e9),
            "fmax_ghz":   float(fmax / 1e9),
            "n_points":   int(n_orig),
            "vf":         float(vf),
            "window":     window,
            "z0":         float(z0),
            "dt_ps":      float(dt * 1e12),
            "z_range_m":  float(dist_m[-1]) if dist_m else 0.0,
        },
        "discontinuities": disc,
    }


def _detect_discontinuities(
    time_ns: np.ndarray,
    dist_m: np.ndarray,
    impedance: np.ndarray,
    gamma: np.ndarray,
    z0: float,
    threshold: float = 0.05,
    min_gap_ns: float = 0.5,
) -> List[Dict[str, Any]]:
    """Detect significant impedance steps (|Δgamma| > threshold) in the TDR trace."""
    if len(gamma) < 5:
        return []

    # Smooth gamma with a small moving average for peak detection
    kernel = np.ones(5) / 5
    gamma_smooth = np.convolve(gamma, kernel, mode="same")

    # Gradient of smoothed gamma
    dg = np.gradient(gamma_smooth)

    discontinuities = []
    last_t = -min_gap_ns

    # Find local peaks in |dg| above threshold
    for i in range(2, len(dg) - 2):
        amp = abs(dg[i])
        if amp < threshold * 0.5:
            continue
        if amp < abs(dg[i - 1]) or amp < abs(dg[i + 1]):
            continue
        t_ns = float(time_ns[i])
        if t_ns - last_t < min_gap_ns:
            continue

        z = float(impedance[i])
        g = float(gamma[i])

        # Classify based on impedance value and step direction
        if abs(z - z0) < z0 * 0.05:
            kind = "matched"
        elif g > threshold:
            kind = "open" if g > 0.8 else "inductive"
        elif g < -threshold:
            kind = "short" if g < -0.8 else "capacitive"
        else:
            kind = "mismatch"

        discontinuities.append({
            "time_ns":      t_ns,
            "distance_m":   float(dist_m[i]),
            "impedance_ohm": z,
            "gamma":        g,
            "type":         kind,
            "delta_gamma":  float(dg[i]),
        })
        last_t = t_ns

    return discontinuities[:10]  # cap at 10 results
