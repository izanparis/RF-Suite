from __future__ import annotations

import numpy as np


def _finite_sorted(freq_hz, z_ohm):
    freq = np.asarray(freq_hz, dtype=float)
    z = np.asarray(z_ohm, dtype=complex)
    mask = np.isfinite(freq) & (freq > 0) & np.isfinite(np.real(z)) & np.isfinite(np.imag(z))
    freq = freq[mask]
    z = z[mask]
    if freq.size == 0:
        return freq, z
    order = np.argsort(freq)
    return freq[order], z[order]


def _smooth_log_mag(mag, n):
    n = int(max(3, n))
    if n % 2 == 0:
        n += 1
    if mag.size < n:
        return np.log10(np.maximum(mag, 1e-300))
    pad = n // 2
    log_mag = np.log10(np.maximum(mag, 1e-300))
    padded = np.pad(log_mag, pad_width=pad, mode="edge")
    kernel = np.ones(n, dtype=float) / n
    return np.convolve(padded, kernel, mode="valid")


def _local_log_slope(freq, mag):
    if freq.size < 3:
        return np.zeros_like(freq, dtype=float)
    lf = np.log10(freq)
    span = np.nanmax(lf) - np.nanmin(lf)
    n = max(5, min(31, int(freq.size // 25) * 2 + 1))
    if span < 0.5:
        n = max(5, min(15, n))
    if n >= freq.size:
        n = max(3, freq.size - (1 - freq.size % 2))
    smooth = _smooth_log_mag(mag, n)
    return np.gradient(smooth, lf)


def _robust_log_stats(values):
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values) & (values > 0)]
    if values.size == 0:
        return None
    logv = np.log(values)
    median_log = float(np.median(logv))
    mad_log = float(np.median(np.abs(logv - median_log)) * 1.4826)
    return float(np.exp(median_log)), mad_log


def _weighted_median(values, weights):
    values = np.asarray(values, dtype=float)
    weights = np.asarray(weights, dtype=float)
    mask = np.isfinite(values) & (values > 0) & np.isfinite(weights) & (weights > 0)
    values = values[mask]
    weights = weights[mask]
    if values.size == 0:
        return 0.0
    order = np.argsort(values)
    values = values[order]
    weights = weights[order]
    cutoff = 0.5 * np.sum(weights)
    return float(values[np.searchsorted(np.cumsum(weights), cutoff)])


def _longest_true_run(mask):
    best_start = 0
    best_len = 0
    start = None
    for i, ok in enumerate(mask):
        if ok and start is None:
            start = i
        if (not ok or i == len(mask) - 1) and start is not None:
            end = i if not ok else i + 1
            run_len = end - start
            if run_len > best_len:
                best_start = start
                best_len = run_len
            start = None
    return best_start, best_start + best_len


def _window_candidates(mask, min_points):
    starts = []
    start = None
    for i, ok in enumerate(mask):
        if ok and start is None:
            start = i
        if (not ok or i == len(mask) - 1) and start is not None:
            end = i if not ok else i + 1
            if end - start >= min_points:
                starts.append((start, end))
            start = None
    return starts


def _srf_estimate(freq, z, component_type):
    mag = np.abs(z)
    if freq.size == 0:
        return None, None
    phase = np.unwrap(np.angle(z))
    target_sign = -1 if component_type == "capacitor" else 1
    sign = np.sign(phase)
    crossings = np.where((sign[:-1] == target_sign) & (sign[1:] != target_sign))[0]
    if crossings.size:
        idx = int(crossings[0] + 1)
        return float(freq[idx]), idx
    idx = int(np.argmin(mag) if component_type == "capacitor" else np.argmax(mag))
    return float(freq[idx]), idx


def extract_nominal_value(freq_hz, z_ohm, component_type):
    """Extract the low-frequency nominal C or L from measured complex impedance.

    The estimator intentionally favors a physically consistent, pre-resonant
    window where the per-point C/L estimates are stable. This makes partial
    sweeps less sensitive to the exact start/stop frequency than a global slope
    threshold or a plain average.
    """
    freq, z = _finite_sorted(freq_hz, z_ohm)
    if freq.size < 3:
        unit = "F" if component_type == "capacitor" else "H"
        return {
            "nominal_value": 0.0,
            "unit": unit,
            "srf_hz": None,
            "esr": None,
            "slope": np.zeros_like(freq).tolist(),
            "selected_mask": np.zeros_like(freq, dtype=bool).tolist(),
            "quality": "bad",
            "quality_score": 0.0,
        }

    component_type = "inductor" if component_type == "inductor" else "capacitor"
    unit = "F" if component_type == "capacitor" else "H"
    mag = np.abs(z)
    x = np.imag(z)
    phase_deg = np.angle(z, deg=True)
    slope = _local_log_slope(freq, mag)
    w = 2.0 * np.pi * freq

    if component_type == "capacitor":
        target_slope = -1.0
        sign_ok = x < 0
        phase_ok = phase_deg < -25.0
        point_values = -1.0 / (w * x)
        plausible = (point_values > 1e-16) & (point_values < 1.0)
    else:
        target_slope = 1.0
        sign_ok = x > 0
        phase_ok = phase_deg > 25.0
        point_values = x / w
        plausible = (point_values > 1e-12) & (point_values < 10.0)

    point_values = np.where(np.isfinite(point_values), point_values, np.nan)
    base = sign_ok & plausible & np.isfinite(point_values) & np.isfinite(slope)
    if np.any(base):
        first_valid = int(np.where(base)[0][0])
        initial_limit = max(3, int(freq.size * 0.05))
        if first_valid > initial_limit and np.any(~sign_ok[:first_valid]):
            base[:] = False
        bad_after_valid = np.where((np.arange(freq.size) > first_valid) & ~sign_ok)[0]
        if np.any(base) and bad_after_valid.size:
            pre_resonant = np.arange(freq.size) < int(bad_after_valid[0])
            if np.count_nonzero(base & pre_resonant) >= min(5, freq.size):
                base = base & pre_resonant
    strict = base & phase_ok & (np.abs(slope - target_slope) < 0.45)
    loose = base & ((phase_ok & (np.abs(slope - target_slope) < 0.75)) | (np.abs(slope - target_slope) < 0.35))

    min_points = max(5, min(21, int(np.ceil(freq.size * 0.035))))
    selected = None
    best = None
    for candidate_mask, strict_bonus in ((strict, 0.0), (loose, 0.2), (base, 0.65)):
        for start, end in _window_candidates(candidate_mask, min_points):
            idx = np.arange(start, end)
            stats = _robust_log_stats(point_values[idx])
            if stats is None:
                continue
            _, spread = stats
            slope_err = float(np.median(np.abs(slope[idx] - target_slope)))
            phase_margin = -phase_deg[idx] if component_type == "capacitor" else phase_deg[idx]
            phase_penalty = float(np.median(np.maximum(0.0, 45.0 - phase_margin)) / 45.0)
            coverage_bonus = min(0.25, (end - start) / max(freq.size, 1))
            edge_penalty = 0.08 if start == 0 or end == freq.size else 0.0
            score = spread + 0.55 * slope_err + 0.35 * phase_penalty + strict_bonus + edge_penalty - coverage_bonus
            if best is None or score < best[0]:
                best = (score, start, end, spread, slope_err)
                selected = np.zeros(freq.size, dtype=bool)
                selected[start:end] = True
        if selected is not None:
            break

    if selected is None:
        selected = np.zeros(freq.size, dtype=bool)
        start, end = _longest_true_run(base)
        if end > start:
            selected[start:end] = True
        else:
            selected[:] = base

    if not np.any(selected):
        value = 0.0
        quality = "bad"
        score = 0.0
    else:
        idx = np.where(selected)[0]
        slope_weight = np.exp(-2.2 * np.abs(slope[idx] - target_slope))
        phase_margin = -phase_deg[idx] if component_type == "capacitor" else phase_deg[idx]
        phase_weight = np.clip((phase_margin + 10.0) / 90.0, 0.05, 1.0)
        _, spread = _robust_log_stats(point_values[idx])
        value = _weighted_median(point_values[idx], slope_weight * phase_weight)
        score = float(max(0.0, min(1.0, 1.0 - (spread or 0.0) / 0.45)))
        if score > 0.75 and idx.size >= min_points:
            quality = "good"
        elif score > 0.45:
            quality = "fair"
        else:
            quality = "poor"

    srf_hz, srf_idx = _srf_estimate(freq, z, component_type)
    if srf_idx is None:
        esr = None
    else:
        lo = max(0, srf_idx - 4)
        hi = min(freq.size, srf_idx + 5)
        r = np.real(z[lo:hi])
        r = r[np.isfinite(r)]
        esr = float(np.median(np.abs(r))) if r.size else None

    selected_idx = np.where(selected)[0]
    if selected_idx.size:
        selected_band = [float(freq[selected_idx[0]]), float(freq[selected_idx[-1]])]
        selected_points = int(selected_idx.size)
    else:
        selected_band = None
        selected_points = 0

    return {
        "nominal_value": float(value),
        "unit": unit,
        "srf_hz": srf_hz,
        "esr": esr,
        "slope": slope.tolist(),
        "selected_mask": selected.tolist(),
        "selected_band_hz": selected_band,
        "selected_points": selected_points,
        "quality": quality,
        "quality_score": score,
    }
