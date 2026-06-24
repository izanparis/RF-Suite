"""EDA Export — Generate circuit schematics from extracted RLC models.

Supported formats:
  - KiCad symbol (.kicad_sym)   — for KiCad EDA schematic import
  - Qucs-S schematic (.sch)     — for Qucs-S / QucsStudio
  - SPICE subcircuit (.cir)     — generic SPICE / LTSpice
  - ADS MDL snippet (.mdl)      — Keysight ADS component data
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _si_str(value: float, unit: str) -> str:
    """Format a value with SI prefix."""
    prefixes = [
        (1e12, "T"), (1e9, "G"), (1e6, "M"), (1e3, "k"),
        (1, ""), (1e-3, "m"), (1e-6, "u"), (1e-9, "n"), (1e-12, "p"), (1e-15, "f"),
    ]
    for scale, prefix in prefixes:
        if abs(value) >= scale * 0.9999:
            return f"{value / scale:.4g}{prefix}{unit}"
    return f"{value:.4g}{unit}"


def _spice_val(value: float) -> str:
    """Format a value for SPICE (no spaces, using SPICE suffixes)."""
    if value == 0:
        return "0"
    prefixes = [
        (1e12, "T"), (1e9, "G"), (1e6, "MEG"), (1e3, "K"),
        (1, ""), (1e-3, "M"), (1e-6, "U"), (1e-9, "N"), (1e-12, "P"), (1e-15, "F"),
    ]
    for scale, prefix in prefixes:
        if abs(value) >= scale * 0.9999:
            mantissa = value / scale
            if abs(mantissa - round(mantissa)) < 1e-9:
                return f"{int(round(mantissa))}{prefix}"
            return f"{mantissa:.5g}{prefix}"
    return f"{value:.5g}"


# ---------------------------------------------------------------------------
# SPICE subcircuit
# ---------------------------------------------------------------------------

def export_spice(
    components: List[Dict[str, Any]],
    name: str = "RF_MODEL",
    topology: str = "shunt",
    notes: str = "",
) -> str:
    """
    Generate a SPICE subcircuit (.cir / .lib) from a list of RLC components.

    components: list of dicts with keys: type ('R'|'L'|'C'), value (float), node_a, node_b
    topology  : informational label only
    """
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"* RF Tool Suite — SPICE subcircuit export",
        f"* Topology : {topology}",
        f"* Generated: {ts}",
    ]
    if notes:
        lines.append(f"* Notes    : {notes}")
    lines += [
        f".SUBCKT {name} PORT GND",
        "",
    ]

    for i, comp in enumerate(components):
        kind  = comp.get("type", "R").upper()
        val   = comp.get("value", 0.0)
        na    = comp.get("node_a", "PORT")
        nb    = comp.get("node_b", "GND")
        label = comp.get("label", f"{kind}{i+1}")
        lines.append(f"{label}  {na}  {nb}  {_spice_val(val)}  ; {_si_str(val, kind)}")

    lines += ["", ".ENDS", ""]
    return "\n".join(lines)


def export_spice_from_netlist(spice_netlist: str) -> str:
    """Pass-through: return the raw SPICE netlist from compact model extraction."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    header = f"* RF Tool Suite — Compact Model Export\n* Generated: {ts}\n\n"
    return header + spice_netlist


# ---------------------------------------------------------------------------
# KiCad Symbol
# ---------------------------------------------------------------------------

def export_kicad_symbol(
    components: List[Dict[str, Any]],
    name: str = "RF_MODEL",
    description: str = "",
) -> str:
    """
    Generate a KiCad 7/8 symbol library (.kicad_sym) for a multi-element RF model.

    Each component becomes a body element in the symbol.
    The result can be imported via KiCad Symbol Editor → File → Add Library.
    """
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prop_x = 0

    # Build property blocks
    props = [
        f'    (property "Reference" "U" (at {prop_x} 0 0) (effects (font (size 1.27 1.27))))',
        f'    (property "Value" "{name}" (at {prop_x} -2.54 0) (effects (font (size 1.27 1.27))))',
        f'    (property "Description" "{description}" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))',
    ]

    # Build graphical body — simple pin list representation
    pins = []
    pin_y = 0
    for i, comp in enumerate(components):
        kind  = comp.get("type", "?").upper()
        val   = comp.get("value", 0.0)
        label = comp.get("label", f"{kind}{i+1}")
        si    = _si_str(val, kind)
        py    = pin_y - i * 2.54
        pins.append(
            f'    (pin passive line (at -7.62 {py:.2f} 0) (length 2.54)\n'
            f'      (name "{label}" (effects (font (size 1.27 1.27))))\n'
            f'      (number "{i+1}" (effects (font (size 1.27 1.27))))\n'
            f'    )'
        )

    body = "\n".join(pins)
    pin_count = len(components)

    output = f"""(kicad_symbol_lib
  (version 20231120)
  (generator "rf_tool_suite")
  (symbol "{name}"
    (pin_names (offset 1.016))
    (in_bom yes) (on_board yes)
{chr(10).join(props)}
    (symbol "{name}_0_1"
      (rectangle (start -5.08 {0.5*pin_count*2.54:.2f}) (end 5.08 {-0.5*pin_count*2.54:.2f})
        (stroke (width 0) (type default))
        (fill (type none))
      )
    )
    (symbol "{name}_1_1"
{body}
    )
  )
)
"""
    return output


# ---------------------------------------------------------------------------
# Qucs-S schematic
# ---------------------------------------------------------------------------

def export_qucs_schematic(
    components: List[Dict[str, Any]],
    name: str = "RF_MODEL",
    freq_hz: float = 1e9,
) -> str:
    """
    Generate a minimal Qucs-S schematic (.sch) file.

    Places components in a series/shunt topology for simulation.
    Includes a .AC simulation from fmin to fmax.
    """
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "<Qucs Schematic 24.1.0>",
        "<Properties>",
        f"  <View=0,0,800,600,1,0,0>",
        f"  <Grid=10,10,1>",
        f"  <DataSet={name}.dat>",
        f"  <DataDisplay={name}.dpl>",
        f"  <OpenDisplay=1>",
        f"  <Script=>",
        f"  <RunScript=0>",
        f"  <showFrame=0>",
        f"  <FrameText0={name} — RF Tool Suite export {ts}>",
        "</Properties>",
        "<Components>",
    ]

    x, y = 100, 100
    for i, comp in enumerate(components):
        kind  = comp.get("type", "R").upper()
        val   = comp.get("value", 0.0)
        label = comp.get("label", f"{kind}{i+1}")
        si    = _si_str(val, kind)

        if kind == "R":
            qtype = "Resistor"
            qprop = f"R={_qucs_val(val, kind)}"
        elif kind == "L":
            qtype = "Inductor"
            qprop = f"L={_qucs_val(val, kind)}"
        elif kind == "C":
            qtype = "Capacitor"
            qprop = f"C={_qucs_val(val, kind)}"
        else:
            qtype = "Resistor"
            qprop = "R=1 Ohm"

        lines.append(
            f'  <{qtype} {label} 1 {x} {y} -26 10 0 0 "{qprop}" "26" "{si}">'
        )
        x += 100

    # Port 1 and Ground
    lines += [
        f'  <Port P1 1 50 100 -23 -44 0 0 "1" "1">',
        f'  <GND * 1 {x} 100 0 0 0 0>',
        f'  <.AC AC1 1 200 100 0 30 0 0 "log" "1 MHz" "10 GHz" "200" "no" "V">',
        "</Components>",
        "<Wires>",
        "</Wires>",
        "<Paintings>",
        "</Paintings>",
        "<Diagrams>",
        "</Diagrams>",
    ]
    return "\n".join(lines)


def _qucs_val(value: float, kind: str) -> str:
    unit_map = {"R": "Ohm", "L": "H", "C": "F"}
    unit = unit_map.get(kind.upper(), "")
    return _si_str(value, unit).replace("u", "u").replace("n", "n")


# ---------------------------------------------------------------------------
# ADS data item (MDL snippet)
# ---------------------------------------------------------------------------

def export_ads_mdl(
    components: List[Dict[str, Any]],
    name: str = "RF_MODEL",
) -> str:
    """Generate an ADS Netlist (.mdl) snippet for use as a Data Item."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"// RF Tool Suite — ADS Component Export",
        f"// Model name: {name}",
        f"// Generated : {ts}",
        f"",
        f"element {name} (",
        f"  port[1]=net1",
        f"  port[2]=net2",
        f"  model={name}_model",
        f")",
        f"",
        f"model {name}_model spice (",
    ]
    for comp in components:
        kind  = comp.get("type", "R").upper()
        val   = comp.get("value", 0.0)
        label = comp.get("label", f"{kind}1")
        si    = _si_str(val, kind)
        lines.append(f"  {kind}={si}  // {label}")
    lines += [f")", ""]
    return "\n".join(lines)
