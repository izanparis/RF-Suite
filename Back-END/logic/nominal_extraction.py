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
    """Estima la SRF de forma robusta.

    Para condensadores:
      - Primer cruce de Im(Z) de negativo a positivo (= mínimo de |Z|)
      - Fallback: argmin(|Z|)

    Para inductores:
      - Primer cruce de Im(Z) de positivo a negativo (= máximo de |Z|)
      - Fallback: argmax(|Z|)

    Se usa Im(Z) directamente en lugar de la fase envuelta porque el
    unwrap puede engañarse cuando hay ruido o la señal da la vuelta cerca
    de la SRF, devolviendo un índice post-resonante.
    """
    mag = np.abs(z)
    imz = np.imag(z)
    if freq.size == 0:
        return None, None
    if component_type == "capacitor":
        # Cruce Im(Z) < 0 → Im(Z) ≥ 0
        crossings = np.where((imz[:-1] < 0) & (imz[1:] >= 0))[0]
        if crossings.size:
            idx = int(crossings[0])
            return float(freq[idx]), idx
        idx = int(np.argmin(mag))
    else:
        # Cruce Im(Z) > 0 → Im(Z) ≤ 0
        crossings = np.where((imz[:-1] > 0) & (imz[1:] <= 0))[0]
        if crossings.size:
            idx = int(crossings[0])
            return float(freq[idx]), idx
        idx = int(np.argmax(mag))
    return float(freq[idx]), idx


def extract_nominal_value(freq_hz, z_ohm, component_type):
    # DEPRECATED - use extract_nominal() instead
    """Extract the low-frequency nominal C or L from measured complex impedance.

    The estimator intentionally favors a physically consistent, pre-resonant
    window where the per-point C/L estimates are stable. This makes partial
    sweeps less sensitive to the exact start/stop frequency than a global slope
    threshold or a plain average.
    
    The SOTA implementation models frequency-dependent losses (skin effect as sqrt(f))
    and material dispersion (Cole-Cole like f^-alpha power law) to decouple parastics
    and extract true low-frequency nominal values with high precision.
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
    real_z = np.real(z)
    imag_z = np.imag(z)
    phase_deg = np.angle(z, deg=True)
    slope = _local_log_slope(freq, mag)
    w = 2.0 * np.pi * freq

    # Strictly enforce passive physical bounds:
    # 1. Real part of impedance must be positive (passive device)
    # 2. For capacitor, imaginary part must be negative. Phase must be between -90 and 0.
    # 3. For inductor, imaginary part must be positive. Phase must be between 0 and 90.
    passive_ok = real_z > 1e-5

    if component_type == "capacitor":
        target_slope = -1.0
        sign_ok = passive_ok & (imag_z < 0)
        phase_ok = (phase_deg > -89.9) & (phase_deg < -5.0)
        point_values = -1.0 / (w * imag_z)
        plausible = (point_values > 1e-16) & (point_values < 1.0)
    else:
        target_slope = 1.0
        sign_ok = passive_ok & (imag_z > 0)
        phase_ok = (phase_deg > 5.0) & (phase_deg < 89.9)
        point_values = imag_z / w
        plausible = (point_values > 1e-12) & (point_values < 10.0)

    point_values = np.where(np.isfinite(point_values), point_values, np.nan)
    base = sign_ok & plausible & np.isfinite(point_values) & np.isfinite(slope)
    
    # Dynamic pre-resonant windowing
    crossings = []
    if np.any(base):
        first_valid = int(np.where(base)[0][0])
        initial_limit = max(3, int(freq.size * 0.05))
        if first_valid > initial_limit and np.any(~sign_ok[:first_valid]):
            base[:] = False
            
        # Detect first self-resonance crossing index
        if component_type == "capacitor":
            for i in range(first_valid, freq.size - 1):
                if imag_z[i] < 0 and imag_z[i+1] >= 0:
                    crossings.append(i)
                    break
        else:
            for i in range(first_valid, freq.size - 1):
                if imag_z[i] > 0 and imag_z[i+1] <= 0:
                    crossings.append(i)
                    break
                    
        end_idx = crossings[0] if crossings else freq.size
        
        # Limit search space to pre-resonant region
        pre_resonant = np.arange(freq.size) < end_idx
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
        esr = None
        srf_hz = None
    else:
        # Calculate baseline weighted median
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
            
        # Get baseline SRF and ESR
        srf_hz, srf_idx = _srf_estimate(freq, z, component_type)
        if srf_idx is None:
            esr = float(np.median(real_z[idx]))
        else:
            lo = max(0, srf_idx - 4)
            hi = min(freq.size, srf_idx + 5)
            r = np.real(z[lo:hi])
            r = r[np.isfinite(r)]
            esr = float(np.median(np.abs(r))) if r.size else float(np.median(real_z[idx]))

        # State-of-the-Art Physical Parameter Extraction Model
        # Fits frequency-dependent conduction losses (skin effect: Rs = Rdc + Rskin * sqrt(f))
        # and frequency-dependent material dispersion (Cole-Cole-like: C = C0 * (f/1MHz)^-alpha)
        try:
            from scipy.optimize import least_squares
            
            f_fit = freq[idx]
            z_fit = z[idx]
            w_fit = 2.0 * np.pi * f_fit
            sqrt_f = np.sqrt(f_fit)
            
            c_l_init = float(value)
            esr_init = max(1e-4, min(100.0, float(esr) if esr else float(np.median(real_z[idx]))))
            srf_calc_hz = float(freq[crossings[0]]) if crossings else (float(srf_hz) if srf_hz else float(freq[-1]))
            
            f_ref = 1e6  # 1 MHz reference frequency
            
            if component_type == "capacitor":
                # Model: Z = Rs(f) + 1j * (w * Ls - 1 / (w * Cs(f)))
                # where Cs(f) = C0 * (f/f_ref)^(-alpha), Rs(f) = Rdc + Rskin * sqrt(f)
                # Parameters: p = [log10(Rdc), log10(Rskin), log10(Ls), log10(C0), alpha]
                if srf_calc_hz > 0:
                    ls_init = 1.0 / ((2.0 * np.pi * srf_calc_hz) ** 2 * c_l_init)
                else:
                    ls_init = 1e-9
                ls_init = max(1e-13, min(1e-6, ls_init))
                
                rdc_init = esr_init * 0.8
                rskin_init = esr_init * 0.2 / np.sqrt(f_fit[0])
                alpha_init = 0.005
                
                p0 = [np.log10(rdc_init), np.log10(rskin_init), np.log10(ls_init), np.log10(c_l_init), alpha_init]
                bounds_min = [np.log10(1e-5), np.log10(1e-12), np.log10(1e-15), np.log10(c_l_init / 10.0), 0.0]
                bounds_max = [np.log10(100.0), np.log10(1.0), np.log10(1e-5), np.log10(c_l_init * 10.0), 0.1]
                
                def residual_cap(p):
                    Rdc_val = 10**p[0]
                    Rskin_val = 10**p[1]
                    Ls_val = 10**p[2]
                    C0_val = 10**p[3]
                    alpha_val = p[4]
                    
                    Cs_f = C0_val * (f_fit / f_ref) ** (-alpha_val)
                    Rs_f = Rdc_val + Rskin_val * sqrt_f
                    z_model = Rs_f + 1j * (w_fit * Ls_val - 1.0 / (w_fit * Cs_f))
                    err = (z_model - z_fit) / (np.abs(z_fit) + 1e-12)
                    return np.concatenate([np.real(err), np.imag(err)])
                
                p0_clipped = np.clip(p0, [b + 1e-5 for b in bounds_min], [b - 1e-5 for b in bounds_max])
                fit_res = least_squares(residual_cap, p0_clipped, bounds=(bounds_min, bounds_max), xtol=1e-8, ftol=1e-8)
                
                Rdc_fit = 10**fit_res.x[0]
                Rskin_fit = 10**fit_res.x[1]
                Ls_fit = 10**fit_res.x[2]
                C0_fit = 10**fit_res.x[3]
                alpha_fit = fit_res.x[4]
                
                fit_err_std = np.std(residual_cap(fit_res.x))
                
                if 0.02 * c_l_init < C0_fit < 50.0 * c_l_init:
                    value = float(C0_fit)
                    # Report ESR at the beginning of the fit range
                    esr = float(Rdc_fit + Rskin_fit * np.sqrt(f_fit[0]))
                    srf_hz = float(1.0 / (2.0 * np.pi * np.sqrt(Ls_fit * C0_fit)))
                    score = float(max(0.0, min(1.0, 1.0 - fit_err_std)))
                    quality = "good" if score > 0.75 else ("fair" if score > 0.45 else "poor")
                    
            else: # inductor
                # Model: Z = (Rs(f) + 1j * w * Ls(f)) / (1 - w^2 * Ls(f) * Cp + 1j * w * Rs(f) * Cp)
                # where Ls(f) = L0 * (f/f_ref)^(-beta), Rs(f) = Rdc + Rskin * sqrt(f)
                # Parameters: p = [log10(Rdc), log10(Rskin), log10(Cp), log10(L0), beta]
                if srf_calc_hz > 0:
                    cp_init = 1.0 / ((2.0 * np.pi * srf_calc_hz) ** 2 * c_l_init)
                else:
                    cp_init = 1e-12
                cp_init = max(1e-15, min(1e-8, cp_init))
                
                rdc_init = esr_init * 0.8
                rskin_init = esr_init * 0.2 / np.sqrt(f_fit[0])
                beta_init = 0.005
                
                p0 = [np.log10(rdc_init), np.log10(rskin_init), np.log10(cp_init), np.log10(c_l_init), beta_init]
                bounds_min = [np.log10(1e-5), np.log10(1e-12), np.log10(1e-16), np.log10(c_l_init / 10.0), 0.0]
                bounds_max = [np.log10(100.0), np.log10(1.0), np.log10(1e-7), np.log10(c_l_init * 10.0), 0.1]
                
                def residual_ind(p):
                    Rdc_val = 10**p[0]
                    Rskin_val = 10**p[1]
                    Cp_val = 10**p[2]
                    L0_val = 10**p[3]
                    beta_val = p[4]
                    
                    Ls_f = L0_val * (f_fit / f_ref) ** (-beta_val)
                    Rs_f = Rdc_val + Rskin_val * sqrt_f
                    
                    num = Rs_f + 1j * w_fit * Ls_f
                    den = 1.0 - (w_fit**2) * Ls_f * Cp_val + 1j * w_fit * Rs_f * Cp_val
                    z_model = num / den
                    err = (z_model - z_fit) / (np.abs(z_fit) + 1e-12)
                    return np.concatenate([np.real(err), np.imag(err)])
                
                p0_clipped = np.clip(p0, [b + 1e-5 for b in bounds_min], [b - 1e-5 for b in bounds_max])
                fit_res = least_squares(residual_ind, p0_clipped, bounds=(bounds_min, bounds_max), xtol=1e-8, ftol=1e-8)
                
                Rdc_fit = 10**fit_res.x[0]
                Rskin_fit = 10**fit_res.x[1]
                Cp_fit = 10**fit_res.x[2]
                L0_fit = 10**fit_res.x[3]
                beta_fit = fit_res.x[4]
                
                fit_err_std = np.std(residual_ind(fit_res.x))
                
                if 0.02 * c_l_init < L0_fit < 50.0 * c_l_init:
                    value = float(L0_fit)
                    esr = float(Rdc_fit + Rskin_fit * np.sqrt(f_fit[0]))
                    srf_hz = float(1.0 / (2.0 * np.pi * np.sqrt(L0_fit * Cp_fit)))
                    score = float(max(0.0, min(1.0, 1.0 - fit_err_std)))
                    quality = "good" if score > 0.75 else ("fair" if score > 0.45 else "poor")
                    
        except Exception:
            # Fallback occurs silently, keeping the robust baseline weighted median
            pass

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
        "srf_hz": float(srf_hz) if srf_hz else None,
        "esr": float(esr) if esr else None,
        "slope": slope.tolist(),
        "selected_mask": selected.tolist(),
        "selected_band_hz": selected_band,
        "selected_points": selected_points,
        "quality": quality,
        "quality_score": float(score),
    }


def extract_nominal_typical(freq_hz, z_ohm, component_type):
    # DEPRECATED - use extract_nominal() instead
    """Extract nominal C or L from measured complex impedance using typical formula.
    
    This function analyzes ONLY the capacitive part (Im(Z) < 0) for capacitors
    or the inductive part (Im(Z) > 0) for inductors.
    It isolates the pre-resonant region by finding the minimum of |Z| (for capacitor)
    or the maximum of |Z| (for inductor), computes the log-log derivative (slope),
    selects points where it approximates a straight line with the correct slope trend,
    and returns the mean of these points.
    """
    freq_orig = np.asarray(freq_hz, dtype=float)
    z_orig = np.asarray(z_ohm, dtype=complex)
    orig_mask = np.isfinite(freq_orig) & (freq_orig > 0) & np.isfinite(np.real(z_orig)) & np.isfinite(np.imag(z_orig))
    
    component_type = "inductor" if component_type == "inductor" else "capacitor"
    unit = "F" if component_type == "capacitor" else "H"
    
    orig_indices = np.where(orig_mask)[0]
    freq = freq_orig[orig_mask]
    z = z_orig[orig_mask]
    
    if freq.size < 3:
        return {
            "nominal_value": 0.0,
            "unit": unit,
            "srf_hz": None,
            "esr": None,
            "slope": np.zeros_like(freq_orig).tolist(),
            "selected_mask": np.zeros_like(freq_orig, dtype=bool).tolist(),
            "selected_band_hz": None,
            "selected_points": 0,
            "quality": "bad",
            "quality_score": 0.0,
        }
        
    order = np.argsort(freq)
    freq_sorted = freq[order]
    z_sorted = z[order]
    sorted_orig_indices = orig_indices[order]
    
    imag_z = np.imag(z_sorted)
    real_z = np.real(z_sorted)
    mag = np.abs(z_sorted)
    
    # 1. Find the self-resonance crossing index (SRF)
    # For capacitor: minimum of |Z|
    # For inductor: maximum of |Z|
    if component_type == "capacitor":
        srf_idx = int(np.argmin(mag))
    else:
        srf_idx = int(np.argmax(mag))
        
    # Limit search space to pre-resonant region (from index 0 up to srf_idx)
    # 2. Compute local log-log slope: d(log10(|Z|)) / d(log10(f))
    log_f = np.log10(freq_sorted)
    log_mag = np.log10(mag)
    slope = np.gradient(log_mag, log_f)
    
    # 3. Define mask of points that behave as a straight line with correct sign/slope trend
    # We select points from index 0 to srf_idx.
    # For capacitor: slope must be negative (slope < -0.1) and imag_z < 0.
    # For inductor: slope must be positive (slope > 0.1) and imag_z > 0.
    pre_resonant = np.arange(freq_sorted.size) <= srf_idx
    
    if component_type == "capacitor":
        correct_behavior = pre_resonant & (slope < -0.1) & (imag_z < 0)
    else:
        correct_behavior = pre_resonant & (slope > 0.1) & (imag_z > 0)
        
    selected_idx = np.where(correct_behavior)[0]
    if selected_idx.size == 0:
        # Fallback to just the pre-resonant region with correct sign if no points match the slope threshold
        if component_type == "capacitor":
            correct_behavior = pre_resonant & (imag_z < 0)
        else:
            correct_behavior = pre_resonant & (imag_z > 0)
        selected_idx = np.where(correct_behavior)[0]
        
    if selected_idx.size == 0:
        return {
            "nominal_value": 0.0,
            "unit": unit,
            "srf_hz": float(freq_sorted[srf_idx]),
            "esr": float(np.median(real_z)) if real_z.size else None,
            "slope": np.zeros_like(freq_orig).tolist(),
            "selected_mask": np.zeros_like(freq_orig, dtype=bool).tolist(),
            "selected_band_hz": None,
            "selected_points": 0,
            "quality": "bad",
            "quality_score": 0.0,
        }
        
    # 4. Calculate nominal C / L point-by-point
    w = 2.0 * np.pi * freq_sorted[selected_idx]
    if component_type == "capacitor":
        point_values = -1.0 / (w * imag_z[selected_idx])
    else:
        point_values = imag_z[selected_idx] / w
        
    # Take the AVERAGE (media) of these point-by-point values
    nominal_val = float(np.mean(point_values))
    esr_val = float(np.median(real_z[selected_idx]))
    srf_hz = float(freq_sorted[srf_idx])
    
    selected_band = [float(freq_sorted[selected_idx[0]]), float(freq_sorted[selected_idx[-1]])]
    selected_points = int(selected_idx.size)
    
    # Quality score based on relative standard deviation
    std_rel = np.std(point_values) / nominal_val if nominal_val > 0 else 1.0
    quality_score = float(max(0.0, min(1.0, 1.0 - std_rel)))
    if quality_score > 0.8:
        quality = "good"
    elif quality_score > 0.5:
        quality = "fair"
    else:
        quality = "poor"
        
    # Map back to original arrays shape
    full_mask = np.zeros(freq_orig.shape, dtype=bool)
    full_mask[sorted_orig_indices[selected_idx]] = True
    
    full_slope = np.zeros(freq_orig.shape, dtype=float)
    full_slope[sorted_orig_indices] = slope
    
    return {
        "nominal_value": nominal_val,
        "unit": unit,
        "srf_hz": srf_hz,
        "esr": esr_val,
        "slope": full_slope.tolist(),
        "selected_mask": full_mask.tolist(),
        "selected_band_hz": selected_band,
        "selected_points": selected_points,
        "quality": quality,
        "quality_score": quality_score,
    }

def extract_nominal(freq_hz, z_ohm, component_type):
    """Unified nominal C/L extractor with SOTA dispersive model and enriched metrics.
    
    Combines robust pre-resonant windowing with frequency-dependent loss modeling
    (skin effect + Cole-Cole dispersion) and returns enriched output including
    Q-factor and physical model parameters.
    """
    freq, z = _finite_sorted(freq_hz, z_ohm)
    if freq.size < 3:
        unit = "F" if component_type == "capacitor" else "H"
        return {
            "nominal_value": 0.0, "unit": unit, "srf_hz": None, "esr": None,
            "q_factor": None, "model_params": None,
            "slope": np.zeros_like(freq).tolist(),
            "selected_mask": np.zeros_like(freq, dtype=bool).tolist(),
            "selected_band_hz": None, "selected_points": 0,
            "quality": "bad", "quality_score": 0.0,
        }

    component_type = "inductor" if component_type == "inductor" else "capacitor"
    unit = "F" if component_type == "capacitor" else "H"
    mag = np.abs(z)
    real_z = np.real(z)
    imag_z = np.imag(z)
    phase_deg = np.angle(z, deg=True)
    slope = _local_log_slope(freq, mag)
    w = 2.0 * np.pi * freq

    # Passivity filters
    passive_ok = real_z > 1e-5
    if component_type == "capacitor":
        target_slope = -1.0
        sign_ok = passive_ok & (imag_z < 0)
        phase_ok = (phase_deg > -89.9) & (phase_deg < -5.0)
        point_values = -1.0 / (w * imag_z)
        plausible = (point_values > 1e-16) & (point_values < 1.0)
    else:
        target_slope = 1.0
        sign_ok = passive_ok & (imag_z > 0)
        phase_ok = (phase_deg > 5.0) & (phase_deg < 89.9)
        point_values = imag_z / w
        plausible = (point_values > 1e-12) & (point_values < 10.0)

    point_values = np.where(np.isfinite(point_values), point_values, np.nan)
    base = sign_ok & plausible & np.isfinite(point_values) & np.isfinite(slope)
    
    # Pre-resonant windowing
    # Límite duro: primer cruce de Im(Z) a través de cero (más fiable que argmin/max(|Z|)
    # con ruido), con argmin/max como respaldo.
    if component_type == "capacitor":
        imz_cross = np.where((imag_z[:-1] < 0) & (imag_z[1:] >= 0))[0]
        hard_srf_idx = int(imz_cross[0]) if imz_cross.size > 0 else int(np.argmin(mag))
    else:
        imz_cross = np.where((imag_z[:-1] > 0) & (imag_z[1:] <= 0))[0]
        hard_srf_idx = int(imz_cross[0]) if imz_cross.size > 0 else int(np.argmax(mag))

    crossings = []
    if np.any(base):
        first_valid = int(np.where(base)[0][0])
        if component_type == "capacitor":
            for i in range(first_valid, freq.size - 1):
                if imag_z[i] < 0 and imag_z[i+1] >= 0:
                    crossings.append(i); break
        else:
            for i in range(first_valid, freq.size - 1):
                if imag_z[i] > 0 and imag_z[i+1] <= 0:
                    crossings.append(i); break
        # end_idx = mínimo entre cruce Im(Z) del base y límite duro
        end_idx_imz = crossings[0] if crossings else freq.size
        end_idx = min(end_idx_imz, hard_srf_idx)
        if end_idx < 3:
            end_idx = hard_srf_idx  # fallback: usar sólo el cruce global
        base = base & (np.arange(freq.size) < end_idx)

    strict = base & phase_ok & (np.abs(slope - target_slope) < 0.45)
    loose = base & ((phase_ok & (np.abs(slope - target_slope) < 0.75)) | (np.abs(slope - target_slope) < 0.35))

    min_points = max(5, min(21, int(np.ceil(freq.size * 0.035))))
    selected = None
    best = None
    for candidate_mask, strict_bonus in ((strict, 0.0), (loose, 0.2), (base, 0.65)):
        for start, end in _window_candidates(candidate_mask, min_points):
            idx = np.arange(start, end)
            stats = _robust_log_stats(point_values[idx])
            if stats is None: continue
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
        if selected is not None: break

    # Secondary pass with min 3 points — handles zoom sweeps with few pre-SRF samples
    if selected is None:
        for candidate_mask, strict_bonus in ((strict, 0.0), (loose, 0.2), (base, 0.65)):
            for start, end in _window_candidates(candidate_mask, 3):
                idx = np.arange(start, end)
                if _robust_log_stats(point_values[idx]) is None: continue
                selected = np.zeros(freq.size, dtype=bool)
                selected[start:end] = True
                break
            if selected is not None: break

    if selected is None:
        selected = np.zeros(freq.size, dtype=bool)
        start, end = _longest_true_run(base)
        if end > start: selected[start:end] = True
        else: selected[:] = base

    # Sanity check: eliminar puntos post-SRF que se hayan colado en la ventana.
    # Para condensadores Im(Z) debe ser < 0 en toda la ventana; para inductores > 0.
    if np.any(selected):
        if component_type == "capacitor":
            bad = selected & (imag_z >= 0)
        else:
            bad = selected & (imag_z <= 0)
        if np.any(bad):
            first_bad = int(np.where(bad)[0][0])
            selected[first_bad:] = False

    model_params = None
    q_factor = None

    if not np.any(selected):
        value = 0.0; quality = "bad"; score = 0.0; esr = None; srf_hz = None
    else:
        idx = np.where(selected)[0]
        slope_weight = np.exp(-2.2 * np.abs(slope[idx] - target_slope))
        phase_margin = -phase_deg[idx] if component_type == "capacitor" else phase_deg[idx]
        phase_weight = np.clip((phase_margin + 10.0) / 90.0, 0.05, 1.0)
        _, spread = _robust_log_stats(point_values[idx])
        value = _weighted_median(point_values[idx], slope_weight * phase_weight)
        score = float(max(0.0, min(1.0, 1.0 - (spread or 0.0) / 0.45)))
        quality = "good" if score > 0.75 and idx.size >= min_points else ("fair" if score > 0.45 else "poor")
        
        srf_hz, srf_idx = _srf_estimate(freq, z, component_type)
        if srf_idx is None:
            esr = float(np.median(real_z[idx]))
        else:
            lo = max(0, srf_idx - 4); hi = min(freq.size, srf_idx + 5)
            r = np.real(z[lo:hi]); r = r[np.isfinite(r)]
            esr = float(np.median(np.abs(r))) if r.size else float(np.median(real_z[idx]))

        # Q-factor at lowest selected frequency
        low_idx = idx[0]
        q_factor = float(abs(imag_z[low_idx]) / max(abs(real_z[low_idx]), 1e-12))

        # SOTA dispersive model optimization
        try:
            from scipy.optimize import least_squares as _ls
            f_fit = freq[idx]; z_fit = z[idx]; w_fit = 2.0 * np.pi * f_fit; sqrt_f = np.sqrt(f_fit)
            c_l_init = float(value)
            esr_init = max(1e-4, min(100.0, float(esr) if esr else float(np.median(real_z[idx]))))
            srf_calc_hz = float(freq[crossings[0]]) if crossings else (float(srf_hz) if srf_hz else float(freq[-1]))
            f_ref = 1e6

            if component_type == "capacitor":
                ls_init = 1.0 / ((2.0 * np.pi * srf_calc_hz)**2 * c_l_init) if srf_calc_hz > 0 else 1e-9
                ls_init = max(1e-13, min(1e-6, ls_init))
                rdc_init = esr_init * 0.8; rskin_init = esr_init * 0.2 / np.sqrt(f_fit[0])
                p0 = [np.log10(rdc_init), np.log10(rskin_init), np.log10(ls_init), np.log10(c_l_init), 0.005]
                bmin = [np.log10(1e-5), np.log10(1e-12), np.log10(1e-15), np.log10(c_l_init/10.0), 0.0]
                bmax = [np.log10(100.0), np.log10(1.0), np.log10(1e-5), np.log10(c_l_init*10.0), 0.1]
                def _res(p):
                    Cs_f = 10**p[3] * (f_fit/f_ref)**(-p[4])
                    Rs_f = 10**p[0] + 10**p[1] * sqrt_f
                    zm = Rs_f + 1j*(w_fit*10**p[2] - 1.0/(w_fit*Cs_f))
                    e = (zm - z_fit) / (np.abs(z_fit) + 1e-12)
                    return np.concatenate([np.real(e), np.imag(e)])
                p0c = np.clip(p0, [b+1e-5 for b in bmin], [b-1e-5 for b in bmax])
                fr = _ls(_res, p0c, bounds=(bmin, bmax), xtol=1e-8, ftol=1e-8)
                C0_fit = 10**fr.x[3]; fit_err = np.std(_res(fr.x))
                if 0.02 * c_l_init < C0_fit < 50.0 * c_l_init:
                    value = float(C0_fit)
                    esr = float(10**fr.x[0] + 10**fr.x[1] * np.sqrt(f_fit[0]))
                    srf_hz = float(1.0 / (2*np.pi*np.sqrt(10**fr.x[2]*C0_fit)))
                    score = float(max(0.0, min(1.0, 1.0 - fit_err)))
                    quality = "good" if score > 0.75 else ("fair" if score > 0.45 else "poor")
                    model_params = {"rdc": float(10**fr.x[0]), "rskin": float(10**fr.x[1]),
                                    "ls": float(10**fr.x[2]), "c0": float(C0_fit),
                                    "dispersion_alpha": float(fr.x[4]), "srf_model_hz": srf_hz}
            else:
                cp_init = 1.0 / ((2.0*np.pi*srf_calc_hz)**2 * c_l_init) if srf_calc_hz > 0 else 1e-12
                cp_init = max(1e-15, min(1e-8, cp_init))
                rdc_init = esr_init * 0.8; rskin_init = esr_init * 0.2 / np.sqrt(f_fit[0])
                p0 = [np.log10(rdc_init), np.log10(rskin_init), np.log10(cp_init), np.log10(c_l_init), 0.005]
                bmin = [np.log10(1e-5), np.log10(1e-12), np.log10(1e-16), np.log10(c_l_init/10.0), 0.0]
                bmax = [np.log10(100.0), np.log10(1.0), np.log10(1e-7), np.log10(c_l_init*10.0), 0.1]
                def _res(p):
                    Ls_f = 10**p[3] * (f_fit/f_ref)**(-p[4])
                    Rs_f = 10**p[0] + 10**p[1] * sqrt_f
                    num = Rs_f + 1j*w_fit*Ls_f
                    den = 1.0 - (w_fit**2)*Ls_f*10**p[2] + 1j*w_fit*Rs_f*10**p[2]
                    zm = num / den
                    e = (zm - z_fit) / (np.abs(z_fit) + 1e-12)
                    return np.concatenate([np.real(e), np.imag(e)])
                p0c = np.clip(p0, [b+1e-5 for b in bmin], [b-1e-5 for b in bmax])
                fr = _ls(_res, p0c, bounds=(bmin, bmax), xtol=1e-8, ftol=1e-8)
                L0_fit = 10**fr.x[3]; fit_err = np.std(_res(fr.x))
                if 0.02 * c_l_init < L0_fit < 50.0 * c_l_init:
                    value = float(L0_fit)
                    esr = float(10**fr.x[0] + 10**fr.x[1] * np.sqrt(f_fit[0]))
                    srf_hz = float(1.0 / (2*np.pi*np.sqrt(L0_fit*10**fr.x[2])))
                    score = float(max(0.0, min(1.0, 1.0 - fit_err)))
                    quality = "good" if score > 0.75 else ("fair" if score > 0.45 else "poor")
                    model_params = {"rdc": float(10**fr.x[0]), "rskin": float(10**fr.x[1]),
                                    "cp": float(10**fr.x[2]), "l0": float(L0_fit),
                                    "dispersion_beta": float(fr.x[4]), "srf_model_hz": srf_hz}
        except Exception:
            pass  # Fallback silently to baseline weighted median

    selected_idx = np.where(selected)[0]
    if selected_idx.size:
        selected_band = [float(freq[selected_idx[0]]), float(freq[selected_idx[-1]])]
        selected_points = int(selected_idx.size)
    else:
        selected_band = None; selected_points = 0

    return {
        "nominal_value": float(value), "unit": unit,
        "srf_hz": float(srf_hz) if srf_hz else None,
        "esr": float(esr) if esr else None,
        "q_factor": q_factor,
        "model_params": model_params,
        "slope": slope.tolist(),
        "selected_mask": selected.tolist(),
        "selected_band_hz": selected_band,
        "selected_points": selected_points,
        "quality": quality,
        "quality_score": float(score),
    }
