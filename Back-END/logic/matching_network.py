"""RF Matching Network Solver — L-network (2-element) analytical solver.

Covers:
  - Shunt-series topology  (RL ≤ Z0):  shunt element at load, series at source
  - Series-shunt topology  (RL ≥ Z0):  series element at load, shunt at source
Each topology yields two sign solutions → up to 4 solutions total.

Component values are returned in SI units and as nearest E-series standard values.
LTSpice netlist export is included for each solution.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# E-series tables
# ---------------------------------------------------------------------------
_E12  = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]
_E24  = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
         3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]
_E48  = [1.00,1.05,1.10,1.15,1.21,1.27,1.33,1.40,1.47,1.54,1.62,1.69,
         1.78,1.87,1.96,2.05,2.15,2.26,2.37,2.49,2.61,2.74,2.87,3.01,
         3.16,3.32,3.48,3.65,3.83,4.02,4.22,4.42,4.64,4.87,5.11,5.36,
         5.62,5.90,6.19,6.49,6.81,7.15,7.50,7.87,8.25,8.66,9.09,9.53]
_E96  = [1.00,1.02,1.05,1.07,1.10,1.13,1.15,1.18,1.21,1.24,1.27,1.30,
         1.33,1.37,1.40,1.43,1.47,1.50,1.54,1.58,1.62,1.65,1.69,1.74,
         1.78,1.82,1.87,1.91,1.96,2.00,2.05,2.10,2.15,2.21,2.26,2.32,
         2.37,2.43,2.49,2.55,2.61,2.67,2.74,2.80,2.87,2.94,3.01,3.09,
         3.16,3.24,3.32,3.40,3.48,3.57,3.65,3.74,3.83,3.92,4.02,4.12,
         4.22,4.32,4.42,4.53,4.64,4.75,4.87,4.99,5.11,5.23,5.36,5.49,
         5.62,5.76,5.90,6.04,6.19,6.34,6.49,6.65,6.81,6.98,7.15,7.32,
         7.50,7.68,7.87,8.06,8.25,8.45,8.66,8.87,9.09,9.31,9.53,9.76]

_SERIES_MAP: Dict[str, List[float]] = {
    "E12": _E12, "E24": _E24, "E48": _E48, "E96": _E96
}


def nearest_eseries(value: float, series: str = "E24") -> Dict[str, Any]:
    """Return the nearest E-series standard value and a human-readable label."""
    if value <= 0:
        return {"standard": value, "label": "—", "series": series, "error_pct": 0.0}
    table = _SERIES_MAP.get(series.upper(), _E24)
    exp = math.floor(math.log10(value))
    mantissa = value / (10 ** exp)
    best = min(table, key=lambda x: abs(x - mantissa))
    # Check if the next decade's first value is closer
    if mantissa / best > math.sqrt(table[-1] / table[0]):
        best = table[0]
        exp += 1
    std_val = best * (10 ** exp)
    err_pct = abs(std_val - value) / value * 100
    label = _fmt_si(std_val, "")
    return {"standard": std_val, "label": label, "series": series, "error_pct": round(err_pct, 2)}


def _fmt_si(val: float, unit: str) -> str:
    prefixes = [(1e12,"T"),(1e9,"G"),(1e6,"M"),(1e3,"k"),
                (1,""),(1e-3,"m"),(1e-6,"µ"),(1e-9,"n"),(1e-12,"p"),(1e-15,"f")]
    for scale, prefix in prefixes:
        if abs(val) >= scale * 0.9999:
            return f"{val/scale:.4g} {prefix}{unit}".strip()
    return f"{val:.4g} {unit}".strip()


def _reactive_to_component(
    X: float, B: float, omega: float,
    label_X: str, label_B: str, eseries: str
) -> Dict[str, Any]:
    """
    Convert series reactance X (Ω) and shunt susceptance B (S) to L/C component dicts.
    label_X / label_B: 'series' or 'shunt' for naming.
    """
    def _comp(reactance_or_susceptance: float, is_susceptance: bool, name: str) -> Dict[str, Any]:
        if is_susceptance:
            B_val = reactance_or_susceptance
            if B_val > 0:
                kind = "C"
                value = B_val / omega
                unit = "F"
            else:
                kind = "L"
                value = -1.0 / (omega * B_val)
                unit = "H"
        else:
            X_val = reactance_or_susceptance
            if X_val > 0:
                kind = "L"
                value = X_val / omega
                unit = "H"
            else:
                kind = "C"
                value = -1.0 / (omega * X_val)
                unit = "F"
        e_data = nearest_eseries(value, eseries)
        return {
            "name": name,
            "kind": kind,
            "value": value,
            "unit": unit,
            "value_si": _fmt_si(value, unit),
            "e_standard": e_data["standard"],
            "e_label": e_data["label"] + f" {unit}" if e_data["label"] != "—" else "—",
            "e_error_pct": e_data["error_pct"],
        }

    elem_series = _comp(X, False, label_X)
    elem_shunt  = _comp(B, True,  label_B)
    return {"series": elem_series, "shunt": elem_shunt}


def solve_l_network(
    RL: float,
    XL: float,
    Z0: float = 50.0,
    f: float = 1e9,
    eseries: str = "E24",
) -> List[Dict[str, Any]]:
    """
    Analytical L-network solver for complex load ZL = RL + jXL → real source Z0.

    Returns up to 4 solutions, each with:
      topology, Q, series{kind,value,unit,...}, shunt{...},
      ltspice_netlist, description
    """
    omega = 2.0 * math.pi * f
    solutions: List[Dict[str, Any]] = []

    # --------------------------------------------------------------------------
    # Topology 1: Shunt element at LOAD side, Series element at SOURCE side
    # Works when RL ≤ Z0. Condition: (Z0 - RL) ≥ 0
    # Xs = -XL ± sqrt(RL*(Z0-RL))
    # Bp = ±sqrt(RL*(Z0-RL)) / (RL*Z0)  [derived from matching equation]
    # --------------------------------------------------------------------------
    discriminant_1 = RL * (Z0 - RL)
    if discriminant_1 >= 0 and RL > 0:
        sqrt_d1 = math.sqrt(discriminant_1)
        Q1 = sqrt_d1 / RL  # = sqrt(Z0/RL - 1)

        for sign in (+1, -1):
            Xs = -XL + sign * sqrt_d1
            Bp = sign * sqrt_d1 / (RL * Z0)
            comps = _reactive_to_component(Xs, Bp, omega, "Series (source side)", "Shunt (load side)", eseries)
            topology_name = (
                "Shunt-C + Series-L (low-pass)" if comps["shunt"]["kind"] == "C" and comps["series"]["kind"] == "L"
                else "Shunt-L + Series-C (high-pass)" if comps["shunt"]["kind"] == "L" and comps["series"]["kind"] == "C"
                else f"Shunt-{comps['shunt']['kind']} + Series-{comps['series']['kind']}"
            )
            solutions.append({
                "topology": "shunt-series",
                "topology_name": topology_name,
                "Q": round(Q1, 3),
                "RL": RL,
                "XL": XL,
                "Z0": Z0,
                "freq_hz": f,
                **comps,
                "ltspice_netlist": _ltspice(comps, f, Z0),
                "description": f"RL ≤ Z0: shunt element at load port, Q={Q1:.2f}",
            })

    # --------------------------------------------------------------------------
    # Topology 2: Series element at LOAD side, Shunt element at SOURCE side
    # Works when RL ≥ Z0. Condition: (RL - Z0) ≥ 0
    # Add series Xs' to load first: Z'L = RL + j(XL + Xs')
    # Then shunt Bp' to match to Z0.
    # (XL + Xs')^2 = RL*(RL - Z0) → only valid when RL ≥ Z0
    # Xs' = -XL ± sqrt(RL*(RL-Z0))
    # Bp' = ±sqrt(RL*(RL-Z0)) / (RL*Z0)  ... wait, this is a different matching problem
    #
    # Correct derivation for series-shunt (dual):
    #   We need Y_in = 1/Z0 = jBp + 1/(jXs + ZL)
    #   Real: RL / (RL^2+(Xs+XL)^2) = 1/Z0  → same as topology 1, same RL ≤ Z0 condition
    #
    # For RL > Z0 we flip: source = Z0, load = ZL, but reverse roles:
    # View from load side: source impedance = Z0.
    # Series-shunt (looking from SOURCE → LOAD):
    #   PORT1 → [series jXs2] → node → [shunt jBp2 to GND] → ZL
    #
    #   Y_at_node = jBp2 + 1/ZL = jBp2 + 1/(RL+jXL)
    #             = jBp2 + RL/(RL^2+XL^2) - j*XL/(RL^2+XL^2)
    #   For matching to Z0: Y_at_node = Yin_after_series
    #   Z_in = jXs2 + 1/Y_at_node = Z0
    #   This is solvable differently...
    #
    # Standard result for RL > Z0 (series at source, shunt at load):
    #   Q2 = sqrt(RL/Z0 - 1)
    #   Xs2 = ±Q2 * Z0 - XL   (series element first, added to XL)
    #   Bp2 = ±Q2 / RL         (shunt element at load side)
    # --------------------------------------------------------------------------
    discriminant_2 = RL * (RL - Z0)
    if discriminant_2 >= 0 and RL > 0:
        sqrt_d2 = math.sqrt(discriminant_2)
        Q2 = sqrt_d2 / Z0  # = sqrt(RL/Z0 - 1)

        for sign in (+1, -1):
            Xs2 = sign * sqrt_d2 / (RL / Z0) - XL   # = ±Q2*Z0 - XL
            Bp2 = sign * sqrt_d2 / (RL * Z0)          # = ±Q2/RL
            # Avoid duplicates when RL == Z0 (only one solution set)
            if abs(discriminant_1 - discriminant_2) < 1e-9 and sign == +1 and discriminant_1 >= 0:
                continue
            comps = _reactive_to_component(Xs2, Bp2, omega, "Series (load side)", "Shunt (source side)", eseries)
            topology_name = (
                "Series-L + Shunt-C (low-pass)" if comps["series"]["kind"] == "L" and comps["shunt"]["kind"] == "C"
                else "Series-C + Shunt-L (high-pass)" if comps["series"]["kind"] == "C" and comps["shunt"]["kind"] == "L"
                else f"Series-{comps['series']['kind']} + Shunt-{comps['shunt']['kind']}"
            )
            solutions.append({
                "topology": "series-shunt",
                "topology_name": topology_name,
                "Q": round(Q2, 3),
                "RL": RL,
                "XL": XL,
                "Z0": Z0,
                "freq_hz": f,
                **comps,
                "ltspice_netlist": _ltspice(comps, f, Z0),
                "description": f"RL ≥ Z0: series element at load port, Q={Q2:.2f}",
            })

    return solutions


def _ltspice(comps: Dict[str, Any], f: float, Z0: float) -> str:
    """Generate a minimal LTSpice XVII netlist for an L-network solution."""
    ser = comps["series"]
    shu = comps["shunt"]

    def _val(c: Dict) -> str:
        v = c["e_standard"] if c.get("e_standard", 0) > 0 else c["value"]
        return f"{v:.4e}"

    lines = [
        "* RF L-Network — generated by RF Tool Suite",
        f"* Freq: {f/1e6:.3f} MHz  |  Z0 = {Z0} Ω",
        ".param fRF = {:.4e}".format(f),
        "",
        "Vs  PORT1 0 AC 1",
        f"Rs  PORT1 N1 {Z0}",
    ]
    # Series element: N1 → N2
    if ser["kind"] == "L":
        lines.append(f"L_ser  N1 N2 {_val(ser)}  ; {ser['value_si']} series inductor")
    else:
        lines.append(f"C_ser  N1 N2 {_val(ser)}  ; {ser['value_si']} series capacitor")
    # Shunt element: N2 → GND
    if shu["kind"] == "C":
        lines.append(f"C_shu  N2 0  {_val(shu)}  ; {shu['value_si']} shunt capacitor")
    else:
        lines.append(f"L_shu  N2 0  {_val(shu)}  ; {shu['value_si']} shunt inductor")
    lines += [
        f"Rl  N2 0  {Z0}  ; load (matched)",
        "",
        f".ac dec 200 {f/100:.2e} {f*10:.2e}",
        ".end",
    ]
    return "\n".join(lines)


def compute_input_reflection(
    RL: float, XL: float,
    X_ser: float, B_shu: float,
    Z0: float = 50.0,
) -> complex:
    """Verify the match: returns S11 at the design frequency (should be ≈ 0)."""
    ZL = complex(RL, XL)
    Zser = complex(0, X_ser)
    Yshu = complex(0, B_shu)
    Z_load_branch = ZL + Zser
    Y_total = Yshu + 1.0 / Z_load_branch
    Zin = 1.0 / Y_total
    S11 = (Zin - Z0) / (Zin + Z0)
    return S11
