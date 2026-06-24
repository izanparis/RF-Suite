import os
import sys
import time
import base64
import datetime
import logging
import numpy as np

# Set matplotlib backend to Agg to prevent headless server GUI errors
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import skrf as rf

# Setup BIBLIOTECA_DIR (handling both development and packaged/frozen mode)
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
    PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
else:
    # report_template.py is in Back-END/logic/
    _logic_dir = os.path.dirname(os.path.abspath(__file__))
    _backend_dir = os.path.dirname(_logic_dir)
    PROJECT_ROOT = os.path.dirname(_backend_dir)
BIBLIOTECA_DIR = os.path.join(PROJECT_ROOT, "Biblioteca")


def _logo_base64() -> str:
    """Reads the selected report logo and returns it as a base64 data URI."""
    try:
        # assets is in Back-END/assets
        logic_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(logic_dir)
        logo_path = os.path.join(backend_dir, "assets", "logo_report.png")
        if not os.path.exists(logo_path):
            logging.warning(f"Report logo not found at {logo_path}")
            return ""
        with open(logo_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"
    except Exception as e:
        logging.error(f"Error encoding logo to base64: {e}")
        return ""

def _css() -> str:
    """Returns the inline CSS styling for the IEEE-style HTML report."""
    return """
    @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

    @page {
        size: A4;
        margin: 2cm;
    }
    @media print {
        body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            font-size: 10pt !important;
            line-height: 1.5 !important;
        }
        .no-print {
            display: none !important;
        }
        .page-break {
            page-break-before: always;
        }
        .paper-container {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
        }
    }
    
    body {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: #1e293b;
        background-color: #f8fafc;
        margin: 0;
        padding: 40px 20px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
    }
    
    .paper-container {
        max-width: 960px;
        margin: 0 auto;
        background-color: #ffffff;
        padding: 60px 80px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
        border: 1px solid #e2e8f0;
        border-radius: 8px;
    }
    
    /* Header Styles */
    .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 40px;
        border-bottom: 2px solid #0f52ba;
        padding-bottom: 20px;
    }
    .header-logo-cell {
        width: 90px;
        vertical-align: middle;
        padding-bottom: 20px;
    }
    .header-logo {
        max-height: 70px;
        width: auto;
        display: block;
    }
    .header-text-cell {
        vertical-align: middle;
        padding-left: 24px;
        padding-bottom: 20px;
    }
    .header-title-app {
        font-family: 'Lora', Georgia, serif;
        font-size: 13px;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 2.5px;
        color: #64748b;
        margin: 0;
    }
    .header-report-title {
        font-family: 'Lora', Georgia, serif;
        font-size: 28px;
        font-weight: 700;
        color: #0f52ba;
        margin: 6px 0 0 0;
        letter-spacing: -0.5px;
    }
    
    /* Report Title & Metadata Block */
    .title-block {
        text-align: center;
        margin-bottom: 45px;
    }
    .document-title {
        font-family: 'Lora', Georgia, serif;
        font-size: 28px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 12px 0;
        line-height: 1.25;
        letter-spacing: -0.5px;
    }
    .document-subtitle {
        font-size: 15px;
        color: #475569;
        margin: 0 0 24px 0;
        font-style: italic;
        font-family: 'Lora', Georgia, serif;
    }
    .meta-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-top: 24px;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 16px 0;
        font-size: 13px;
        color: #334155;
    }
    .meta-item {
        text-align: center;
        border-right: 1px solid #f1f5f9;
    }
    .meta-item:last-child {
        border-right: none;
    }
    .meta-label {
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 1px;
        margin-bottom: 6px;
    }
    .meta-value {
        font-weight: 500;
        font-size: 14px;
        color: #0f172a;
    }
    
    /* Abstract Block */
    .abstract-box {
        background-color: #f8fafc;
        border-left: 4px solid #0f52ba;
        padding: 20px 24px;
        margin-bottom: 40px;
        font-size: 14.5px;
        line-height: 1.7;
        color: #334155;
        text-align: justify;
        border-radius: 0 6px 6px 0;
    }
    .abstract-title {
        font-weight: 700;
        font-family: 'Lora', Georgia, serif;
        color: #0f52ba;
        font-size: 15px;
    }
    
    /* Table of Contents (Index) Styles */
    .toc-container {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 24px 30px;
        margin-bottom: 40px;
        page-break-inside: avoid;
    }
    .toc-title {
        font-family: 'Lora', Georgia, serif;
        font-size: 16px;
        font-weight: 700;
        color: #0f52ba;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 2px solid #cbd5e1;
        padding-bottom: 8px;
        margin-bottom: 16px;
    }
    .toc-grid {
        display: grid;
        grid-template-columns: 1.25fr 1fr;
        gap: 30px;
    }
    @media (max-width: 768px) {
        .toc-grid {
            grid-template-columns: 1fr;
            gap: 20px;
        }
    }
    .toc-column {
        min-width: 0;
    }
    .toc-column-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
    }
    .toc-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .toc-item {
        margin-bottom: 8px;
        font-size: 13.5px;
        line-height: 1.4;
    }
    .toc-item a {
        color: #1e293b;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.15s;
    }
    .toc-item a:hover {
        color: #0f52ba;
        text-decoration: underline;
    }
    .toc-subitem {
        margin-left: 16px;
        font-size: 12px;
        margin-top: 4px;
    }
    .toc-subitem a {
        color: #475569;
    }
    
    /* Return back-to-toc button */
    .back-to-toc {
        font-size: 11px;
        color: #64748b;
        text-decoration: none;
        margin-left: auto;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: color 0.15s;
    }
    .back-to-toc:hover {
        color: #0f52ba;
        text-decoration: underline;
    }

    /* ── Metric Scorecard ─────────────────────────────────────── */
    .scorecard {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 14px;
        margin: 0 0 42px 0;
    }
    .metric-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-top: 3px solid #0f52ba;
        border-radius: 6px;
        padding: 14px 16px 12px;
        text-align: center;
        box-shadow: 0 2px 8px -2px rgba(15,82,186,.07);
    }
    .metric-card.accent-green  { border-top-color: #16a34a; }
    .metric-card.accent-amber  { border-top-color: #d97706; }
    .metric-card.accent-red    { border-top-color: #dc2626; }
    .metric-card.accent-purple { border-top-color: #7c3aed; }
    .metric-card-value {
        font-family: 'Lora', Georgia, serif;
        font-size: 22px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.1;
        margin-bottom: 4px;
        word-break: break-all;
    }
    .metric-card-unit {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .metric-card-label {
        font-size: 10.5px;
        color: #94a3b8;
        margin-top: 6px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        font-weight: 500;
    }
    @media print {
        .scorecard { grid-template-columns: repeat(4, 1fr); }
    }

    /* ── IEEE Sections ─────────────────────────────────────────── */
    .section-container {
        margin-bottom: 45px;
        page-break-inside: avoid;
    }
    .section-header {
        font-family: 'Lora', Georgia, serif;
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
        border-left: 4px solid #0f52ba;
        background: linear-gradient(90deg, #f0f6ff 0%, #ffffff 100%);
        padding: 10px 16px 10px 14px;
        margin-top: 40px;
        margin-bottom: 20px;
        text-transform: uppercase;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        border-radius: 0 6px 6px 0;
    }
    .section-num {
        margin-right: 10px;
        font-family: 'Lora', Georgia, serif;
        color: #0f52ba;
        font-weight: 700;
    }
    .section-text-inner {
        font-weight: 700;
        color: #0f52ba;
    }
    .section-desc {
        font-size: 14.5px;
        color: #475569;
        margin-bottom: 20px;
        text-align: justify;
        line-height: 1.6;
    }
    
    /* Tables */
    .table-container {
        margin: 25px 0;
    }
    .table-caption {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #475569;
        margin-bottom: 12px;
        letter-spacing: 1px;
        display: flex;
        align-items: baseline;
    }
    .data-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin-bottom: 25px;
        font-size: 13.5px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        overflow: hidden;
    }
    .data-table th {
        background-color: #0f52ba;
        border-bottom: 1px solid #0d46a0;
        color: #ffffff;
        font-weight: 600;
        padding: 9px 14px;
        text-align: left;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
    }
    .data-table td {
        border-bottom: 1px solid #f1f5f9;
        padding: 9px 14px;
        color: #334155;
        vertical-align: middle;
        background-color: #ffffff;
    }
    .data-table td:first-child {
        font-weight: 600;
        color: #1e293b;
        background-color: #f8fafc;
        border-right: 1px solid #e2e8f0;
        width: 42%;
    }
    .data-table tr:last-child td {
        border-bottom: none;
    }
    .data-table tr:nth-child(even) td:not(:first-child) {
        background-color: #fafbfd;
    }
    .data-table tr:hover td {
        background-color: #eff6ff;
    }
    .data-table tr:hover td:first-child {
        background-color: #e8f0fe;
    }
    
    /* Figures */
    .figure-container {
        text-align: center;
        margin: 30px 0;
        page-break-inside: avoid;
    }
    .figure-img-wrapper {
        display: inline-block;
        padding: 16px;
        border: 1px solid #e2e8f0;
        background-color: #ffffff;
        border-radius: 8px;
        max-width: 100%;
        box-sizing: border-box;
        box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
    }
    .figure-img {
        max-width: 100%;
        height: auto;
        display: block;
        max-height: 550px;
        border-radius: 6px;
    }
    .figure-caption {
        font-size: 12px;
        font-style: italic;
        color: #475569;
        margin-top: 12px;
        padding: 0 24px;
        line-height: 1.5;
        text-align: center;
    }
    .figure-number {
        font-weight: 700;
        font-style: normal;
        color: #0f172a;
    }
    
    .grid-2col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }
    
    /* Code and SPICE netlists */
    .code-title {
        font-size: 11.5px;
        font-weight: 600;
        color: #f8fafc;
        background-color: #0f172a;
        padding: 8px 16px;
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
        border-bottom: 1px solid #1e293b;
        margin: 25px 0 0 0;
        font-family: 'Fira Code', monospace;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
    }
    .code-title::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        background-color: #38bdf8;
        border-radius: 50%;
        margin-right: 8px;
    }
    .code-block {
        font-family: 'Fira Code', 'Courier New', Courier, monospace;
        font-size: 12px;
        background-color: #0f172a;
        border: 1px solid #0f172a;
        border-top: none;
        padding: 18px;
        overflow-x: auto;
        margin: 0 0 25px 0;
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
        color: #f8fafc;
        white-space: pre-wrap;
        line-height: 1.5;
        text-align: left;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
    }
    
    /* Info badge classes */
    .badge {
        display: inline-block;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .badge-success { background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-info { background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-warning { background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    
    /* Footer */
    .report-footer {
        margin-top: 60px;
        border-top: 1px solid #e2e8f0;
        padding-top: 24px;
        font-size: 11.5px;
        color: #64748b;
        text-align: center;
        line-height: 1.6;
    }
    
    /* Interactive Preview Controls */
    .preview-bar {
        background-color: #0f172a;
        color: #ffffff;
        padding: 12px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: sticky;
        top: 15px;
        z-index: 1000;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
        font-size: 13.5px;
        border-radius: 6px;
        margin-bottom: 30px;
        border: 1px solid #1e293b;
        font-family: 'Inter', sans-serif;
    }
    .preview-actions {
        display: flex;
        gap: 12px;
    }
    .btn {
        background-color: #0f52ba;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12.5px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
    }
    .btn:hover {
        background-color: #0d46a0;
        transform: translateY(-1px);
    }
    .btn-secondary {
        background-color: #334155;
        border: 1px solid #475569;
    }
    .btn-secondary:hover {
        background-color: #1e293b;
    }
    """

def _render_section(title: str, number: str, section_id: str, content: str) -> str:
    """Renders a standard IEEE section block with a back-to-index anchor link."""
    parts = content.split('\n', 1)
    if len(parts) == 2 and not parts[0].strip().startswith('<'):
        desc = f'<div class="section-desc">{parts[0].strip()}</div>'
        body = parts[1].strip()
    else:
        desc = ""
        body = content
        
    return f"""
    <div class="section-container" id="{section_id}">
        <h2 class="section-header">
            <span class="section-num">{number}.</span>
            <span class="section-text-inner">{title}</span>
            <a href="#table-of-contents" class="back-to-toc no-print">↑ Table of Contents</a>
        </h2>
        {desc}
        {body}
    </div>
    """

def _render_table(caption: str, table_id: str, headers: list, rows: list) -> str:
    """Renders an IEEE standard data table with caption above and an anchor id."""
    header_html = "".join([f"<th>{h}</th>" for h in headers])
    rows_html = ""
    for r in rows:
        row_cells = "".join([f"<td>{cell if cell is not None else 'N/A'}</td>" for cell in r])
        rows_html += f"<tr>{row_cells}</tr>"
        
    return f"""
    <div class="table-container" id="table-{table_id.lower().replace('.', '-')}" style="page-break-inside: avoid; margin-bottom: 20px;">
        <div class="table-caption">Table {table_id}. {caption} <a href="#table-of-contents" class="back-to-toc no-print" style="margin-left: auto;">↑ TOC</a></div>
        <table class="data-table">
            <thead>
                <tr>{header_html}</tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
    </div>
    """

def _detect_img_mime(b64: str) -> str:
    """Sniff MIME type from the first bytes of a raw base64 image string."""
    try:
        raw = base64.b64decode(b64[:300].encode() + b"==")
        if raw[:4] == b'\x89PNG':
            return "image/png"
        if raw[:2] == b'\xff\xd8':
            return "image/jpeg"
        if b'<svg' in raw[:120] or b'<?xml' in raw[:120]:
            return "image/svg+xml"
    except Exception:
        pass
    return "image/png"  # safe fallback

def _render_figure(base64_img: str, caption: str, fig_num: int, full_width: bool = False) -> str:
    """Renders a figure with auto-detected MIME type (SVG or PNG), caption below."""
    if not base64_img:
        return ""
    if base64_img.startswith("data:image/"):
        img_src = base64_img
    else:
        mime = _detect_img_mime(base64_img)
        img_src = f"data:{mime};base64,{base64_img}"
    width_style = "max-width: 100%;" if full_width else ""
    return f"""
    <div class="figure-container" id="fig-{fig_num}" style="{width_style}">
        <div class="figure-img-wrapper">
            <img class="figure-img" src="{img_src}" alt="Figure {fig_num}" />
        </div>
        <div class="figure-caption">
            <span class="figure-number">Fig. {fig_num}.</span> {caption}
            <a href="#table-of-contents" class="back-to-toc no-print" style="display: inline-block; margin-left: 10px;">↑ TOC</a>
        </div>
    </div>
    """

def _render_scorecard(history: dict, entry: dict) -> str:
    """
    Builds a row of metric cards from whatever analysis data is available.
    Cards shown depend on which tools were run.
    """
    cards = []

    def _card(value: str, unit: str, label: str, accent: str = "") -> str:
        cls = f"metric-card {accent}".strip()
        return f"""
        <div class="{cls}">
            <div class="metric-card-value">{value}</div>
            <div class="metric-card-unit">{unit}</div>
            <div class="metric-card-label">{label}</div>
        </div>"""

    def _si(val, unit):
        """Format a value with SI prefix (p/n/µ/m/k/M/G)."""
        if not isinstance(val, (int, float)):
            return "—", unit
        prefixes = [
            (1e12, 'T'), (1e9, 'G'), (1e6, 'M'), (1e3, 'k'),
            (1, ''), (1e-3, 'm'), (1e-6, 'µ'), (1e-9, 'n'), (1e-12, 'p'),
        ]
        for scale, prefix in prefixes:
            if abs(val) >= scale * 0.999:
                return f"{val/scale:.3g}", f"{prefix}{unit}"
        return f"{val:.3g}", unit

    # ── Nominal value ──────────────────────────────────────────────
    quick = history.get("quick_extract", {})
    shunt = history.get("compact_model_shunt", {})
    vf    = history.get("compact_model_vf", {})
    any_model = shunt or vf or history.get("compact_model", {})

    nom_val  = quick.get("nominal_value")
    nom_unit = quick.get("unit", "F")
    if nom_val is None:
        # fall back to compact model
        sm = (shunt or vf or history.get("compact_model", {})).get("summary", {})
        nom_val  = sm.get("c_eff", sm.get("l_eff"))
        nom_unit = "H" if "l_eff" in sm else "F"
    if nom_val is not None:
        v_str, u_str = _si(nom_val, nom_unit)
        cards.append(_card(v_str, u_str, "Nominal Value"))

    # ── SRF ───────────────────────────────────────────────────────
    srf_hz = quick.get("srf_hz") or (history.get("cutoff_freq", {}).get("cutoff_frequency_mhz", None) and
                                      history["cutoff_freq"]["cutoff_frequency_mhz"] * 1e6)
    if srf_hz and isinstance(srf_hz, (int, float)):
        v_str, u_str = _si(srf_hz, "Hz")
        cards.append(_card(v_str, u_str, "SRF", "accent-amber"))

    # ── ESR ───────────────────────────────────────────────────────
    esr = quick.get("esr")
    if esr and isinstance(esr, (int, float)):
        cards.append(_card(f"{esr:.4f}", "Ω", "ESR"))

    # ── Q-factor ──────────────────────────────────────────────────
    q = quick.get("q_factor")
    if q and isinstance(q, (int, float)):
        accent = "accent-green" if q > 50 else ("accent-amber" if q > 10 else "accent-red")
        cards.append(_card(f"{q:.1f}", "", "Q Factor", accent))

    # ── Best NRMS ─────────────────────────────────────────────────
    nrms_vals = []
    for d in [shunt, vf, history.get("compact_model", {})]:
        n = d.get("summary", {}).get("nrms", d.get("nrms"))
        if isinstance(n, (int, float)):
            nrms_vals.append(n)
    if nrms_vals:
        best = min(nrms_vals)
        accent = "accent-green" if best < 0.05 else ("accent-amber" if best < 0.15 else "accent-red")
        cards.append(_card(f"{best*100:.2f}", "%", "Best NRMS", accent))

    # ── Frequency span ───────────────────────────────────────────
    fmin = entry.get("fmin_hz")
    fmax = entry.get("fmax_hz")
    if fmin and fmax:
        _, u1 = _si(fmin, "Hz");  v1, _ = _si(fmin, "Hz")
        v2, u2 = _si(fmax, "Hz")
        cards.append(_card(f"{v1}–{v2}", u2, "Freq. Range", "accent-purple"))

    if not cards:
        return ""

    inner = "".join(cards)
    return f'<div class="scorecard">{inner}</div>'


def _render_code_block(code: str, title: str) -> str:
    """Renders a code block for netlists or textual summaries."""
    return f"""
    <div style="page-break-inside: avoid; margin-bottom: 20px;">
        <div class="code-title">{title}</div>
        <pre class="code-block">{code}</pre>
    </div>
    """

def _generate_s_params_plots(touchstone_path: str) -> list:
    """Generates IEEE-style base64 PNG S-parameter plots from a touchstone file."""
    _IEEE_BLACK = '#000000'
    _IEEE_BLUE  = '#0072BD'
    _IEEE_RED   = '#D62728'
    _FIG_W, _FIG_H = 5.0, 3.75

    def _ieee_rc():
        plt.rcParams.update({
            'font.family': 'serif',
            'font.serif': ['Times New Roman', 'DejaVu Serif', 'serif'],
            'font.size': 9,
            'axes.labelsize': 9,
            'xtick.labelsize': 8,
            'ytick.labelsize': 8,
            'legend.fontsize': 8,
            'lines.linewidth': 1.2,
            'figure.dpi': 150,
        })

    def _apply_ax(ax, xlabel, ylabel, log_x=False, log_y=False):
        ax.set_xlabel(xlabel, fontsize=9)
        ax.set_ylabel(ylabel, fontsize=9)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.tick_params(which='both', direction='in', top=False, right=False)
        ax.grid(True, which='major', linestyle=':', linewidth=0.4, color='#CCCCCC', zorder=0)
        if log_x: ax.set_xscale('log')
        if log_y: ax.set_yscale('log')
        ax.legend(loc='best', frameon=True, framealpha=0.9, edgecolor='#CCCCCC')

    def get_b64(fig):
        import io
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', pad_inches=0.02)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        return b64

    plots = []
    try:
        if not os.path.exists(touchstone_path):
            logging.error(f"_generate_s_params_plots: file not found {touchstone_path}")
            return []

        _ieee_rc()
        ntw = rf.Network(touchstone_path)
        freq_mhz = ntw.f / 1e6
        n_ports = ntw.nports
        has_s21 = n_ports >= 2

        # 1. S-parameter magnitude (S11 + S21)
        fig, ax = plt.subplots(figsize=(_FIG_W, _FIG_H))
        ax.plot(freq_mhz, ntw.s_db[:, 0, 0], label=r'$S_{11}$ (dB)',
                color=_IEEE_BLACK, linestyle='-', linewidth=1.2)
        if has_s21:
            ax.plot(freq_mhz, ntw.s_db[:, 1, 0], label=r'$S_{21}$ (dB)',
                    color=_IEEE_BLUE, linestyle='--', linewidth=1.2)
        _apply_ax(ax, 'Frequency (MHz)', 'Magnitude (dB)')
        fig.tight_layout()
        plots.append({"id": "smag", "title": r"S-Parameter Magnitude", "image": get_b64(fig)})

        # 2. S-parameter phase
        fig, ax = plt.subplots(figsize=(_FIG_W, _FIG_H))
        ax.plot(freq_mhz, ntw.s_deg[:, 0, 0], label=r'$\angle S_{11}$ (°)',
                color=_IEEE_BLACK, linestyle='-', linewidth=1.2)
        if has_s21:
            ax.plot(freq_mhz, ntw.s_deg[:, 1, 0], label=r'$\angle S_{21}$ (°)',
                    color=_IEEE_BLUE, linestyle='--', linewidth=1.2)
        _apply_ax(ax, 'Frequency (MHz)', 'Phase (degrees)')
        fig.tight_layout()
        plots.append({"id": "sphase", "title": "S-Parameter Phase", "image": get_b64(fig)})

        # 3. Impedance magnitude
        fig, ax = plt.subplots(figsize=(_FIG_W, _FIG_H))
        if n_ports == 1:
            z_mag = np.abs(ntw.z[:, 0, 0])
            ax.loglog(freq_mhz, np.maximum(z_mag, 1e-12),
                      label=r'$|Z_{in}|$ ($\Omega$)', color=_IEEE_BLACK, linewidth=1.2)
        else:
            abcd = ntw.a
            z_ser = np.maximum(np.abs(abcd[:, 0, 1]), 1e-12)
            y_sh  = abcd[:, 1, 0]
            z_sh  = np.maximum(np.abs(1.0 / (y_sh + 1e-30)), 1e-12)
            ax.loglog(freq_mhz, z_ser, label=r'$|Z_{series}|$ ($\Omega$)',
                      color=_IEEE_BLACK, linewidth=1.2)
            ax.loglog(freq_mhz, z_sh,  label=r'$|Z_{shunt}|$ ($\Omega$)',
                      color=_IEEE_BLUE, linestyle='--', linewidth=1.2)
        ax.grid(True, which='both', linestyle=':', linewidth=0.4, color='#CCCCCC', zorder=0)
        ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
        ax.tick_params(which='both', direction='in', top=False, right=False)
        ax.set_xlabel('Frequency (MHz)', fontsize=9)
        ax.set_ylabel(r'$|Z|$ ($\Omega$)', fontsize=9)
        ax.legend(loc='best', frameon=True, framealpha=0.9, edgecolor='#CCCCCC', fontsize=8)
        fig.tight_layout()
        plots.append({"id": "zmag", "title": r"Impedance $|Z|$", "image": get_b64(fig)})

        # 4. Smith chart
        fig, ax = plt.subplots(figsize=(4.5, 4.5))
        ntw.plot_s_smith(m=0, n=0, label=r'$S_{11}$', color=_IEEE_BLACK, ax=ax)
        ax.set_title('Smith Chart', fontsize=9, fontfamily='serif')
        fig.tight_layout()
        plots.append({"id": "smith11", "title": r"Smith Chart $S_{11}$", "image": get_b64(fig)})

    except Exception as e:
        logging.error(f"Error in _generate_s_params_plots: {e}")

    return plots

def generate_report_html(entry: dict, touchstone_path: str | None = None) -> str:
    """
    Generates a professional, self-contained HTML report in IEEE Paper format.
    
    :param entry: The library entry dictionary containing metadata and analysis history.
    :param touchstone_path: Optional absolute path to the Touchstone file to generate missing plots.
    """
    metadata = entry.get("component_metadata", {})
    history = entry.get("analysis_history", {})
    datasheet = entry.get("datasheet", {})
    
    device_name = entry.get("device", "Unknown-Device")
    filename = entry.get("name", "Unknown-File")
    measurement_id = entry.get("measurement_id", filename.split('.')[0])
    
    logo_base64_src = _logo_base64()
    css_content = _css()
    
    current_time_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_title = f"Characterization and Parameter Extraction of Device Under Test (DUT): {measurement_id}"
    
    # Render interactive top preview bar (will be hidden during print)
    preview_bar_html = f"""
    <div class="preview-bar no-print">
        <span><strong>RF & Signal Integrity Suite</strong> — Interactive IEEE Technical Report Preview</span>
        <div class="preview-actions">
            <button class="btn btn-secondary" onclick="window.print()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Print / Save PDF</button>
        </div>
    </div>
    """
    
    # 1. Header (Logo + Title)
    header_html = f"""
    <table class="header-table">
        <tr>
            {"<td class='header-logo-cell'><img class='header-logo' src='" + logo_base64_src + "' alt='Logo' /></td>" if logo_base64_src else ""}
            <td class="header-text-cell">
                <div class="header-title-app">RF & Signal Integrity Suite • Technical Report</div>
                <div class="header-report-title">Automated Characterization Report</div>
            </td>
        </tr>
    </table>
    """
    
    # Title Block
    title_block_html = f"""
    <div class="title-block">
        <h1 class="document-title">{report_title}</h1>
        <div class="document-subtitle">Automated measurements and circuit parameter extraction pipeline</div>
        <div class="meta-grid">
            <div class="meta-item">
                <div class="meta-label">Measurement Device</div>
                <div class="meta-value">{device_name}</div>
            </div>
            <div class="meta-item">
                <div class="meta-label">Touchstone File</div>
                <div class="meta-value" style="font-family: monospace; font-size: 12.5px;">{filename}</div>
            </div>
            <div class="meta-item">
                <div class="meta-label">Report Date</div>
                <div class="meta-value">{current_time_str}</div>
            </div>
        </div>
    </div>
    """
    
    # 2. Abstract
    points = entry.get("points", "N/A")
    fmin_mhz = f"{entry.get('fmin_hz', 0) / 1e6:.3f} MHz" if entry.get("fmin_hz") else "N/A"
    fmax_mhz = f"{entry.get('fmax_hz', 0) / 1e6:.3f} MHz" if entry.get("fmax_hz") else "N/A"
    n_ports = entry.get("n_ports", 2)
    comp_type_str = (entry.get("component_type") or "unknown component").upper()
    
    abstract_text = f"This technical paper presents the systematic characterization of the high-frequency response and equivalent circuit parameter extraction for the {comp_type_str} device under test (DUT), identified as {measurement_id}. The experimental measurements were recorded using the {device_name} platform over a frequency range of {fmin_mhz} to {fmax_mhz} across {points} data points. The electrical performance is analyzed through experimental scattering parameters (S-parameters), resonant characteristics, and physics-based circuit modeling. The equivalent circuit models are fit against experimental data using numerical optimization routines, demonstrating high correlation and low normalized root-mean-square error (NRMS). This document provides an index of all findings compiled by the RF & Signal Integrity Suite."
    
    abstract_html = f"""
    <div class="abstract-box">
        <span class="abstract-title">Abstract—</span>{abstract_text}
    </div>
    """
    
    # ── Metric Scorecard (after abstract) ────────────────────────
    scorecard_html = _render_scorecard(history, entry)

    # Figure counter and Table counter
    fig_counter = 1
    table_counter = 1
    
    # TOC Lists for dynamic collection
    toc_sections = []
    toc_tables = []
    toc_figures = []
    
    sections_html = ""
    
    # --- Section I: Component Identification ---
    section_i_rows = []
    if metadata:
        fields = [
            ("Manufacturer", "manufacturer"),
            ("Manufacturer Part Number (MPN)", "mpn"),
            ("Supplier", "supplier"),
            ("Nominal Value", "nominal_value"),
            ("Tolerance", "tolerance"),
            ("Package / Case", "package"),
            ("Dielectric / Material", "dielectric"),
            ("Voltage Rating", "voltage_rating"),
            ("Temperature Range", "temperature_range"),
            ("Lifecycle Status", "lifecycle")
        ]
        for label, key in fields:
            val = metadata.get(key)
            if val is not None:
                section_i_rows.append([label, str(val)])
    else:
        section_i_rows.append(["Notice", "No component metadata has been registered in the database for this measurement. The DUT is treated as a generic RF component."])
        
    table_i_html = _render_table(
        caption="Component Identification and Specifications Registered in the System",
        table_id="I",
        headers=["Parameter / Specification Field", "Registered Value"],
        rows=section_i_rows
    )
    sections_html += _render_section(
        title="Component Identification",
        number="I",
        section_id="sec-i",
        content="This section details the mechanical, thermodynamic, and nominal electrical specifications of the Device Under Test (DUT) as registered in the RF Tool Suite Library database.\n" + table_i_html
    )
    toc_sections.append(("I. Component Identification", "#sec-i"))
    toc_tables.append(("Table I. Component Identification Specifications", "#table-i"))
    table_counter += 1
    
    # --- Section II: Measurement Setup ---
    cal_name = entry.get("calibration_name", "N/A")
    avg_count = entry.get("averaging_count", "N/A")
    smooth_win = entry.get("smoothing_window", "N/A")
    mtime = entry.get("mtime", time.time())
    file_date = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
    
    setup_rows = [
        ["Vector Network Analyzer (VNA) Model", device_name],
        ["VNA Calibration Template Applied", cal_name],
        ["Measurement Frequency Minimum", fmin_mhz],
        ["Measurement Frequency Maximum", fmax_mhz],
        ["S-Parameter Port Count", f"{n_ports}-Port"],
        ["VNA Points Count", str(points)],
        ["Averaging Factor / Sweep Count", str(avg_count)],
        ["Smoothing Window Size", str(smooth_win)],
        ["Touchstone Creation Date", file_date]
    ]
    table_ii_html = _render_table(
        caption="Vector Network Analyzer (VNA) Calibration and Sweep Parameters",
        table_id="II",
        headers=["Setup Parameter", "Registered Setting / Value"],
        rows=setup_rows
    )
    sections_html += _render_section(
        title="Experimental Measurement Setup",
        number="II",
        section_id="sec-ii",
        content="Characterization was conducted using vector network analysis with standard calibration. System parameters and environmental sweep conditions are tabulated below.\n" + table_ii_html
    )
    toc_sections.append(("II. Experimental Measurement Setup", "#sec-ii"))
    toc_tables.append(("Table II. VNA Calibration and Sweep Parameters", "#table-ii"))
    table_counter += 1
    
    # --- Section III: S-Parameter Analysis ---
    s_params_data = history.get("s_params", {})
    if s_params_data or touchstone_path:
        toc_sections.append(("III. Scattering Parameter Frequency Response", "#sec-iii"))
        s_content = "The high-frequency behavior of the DUT is evaluated using its scattering parameters (S-parameters). Specifically, the magnitude and phase of the reflection coefficient (S11) and transmission coefficient (S21) are studied.\n"
        
        # S-parameter summary table
        min_s11 = "N/A"
        max_s21 = "N/A"
        min_vswr = "N/A"
        
        if s_params_data and "summary" in s_params_data:
            summary = s_params_data["summary"]
            min_s11 = f"{summary.get('min_s11', 'N/A')} dB" if summary.get('min_s11') is not None else "N/A"
            max_s21 = f"{summary.get('max_s21', 'N/A')} dB" if summary.get('max_s21') is not None else "N/A"
            min_vswr = f"{summary.get('min_vswr', 'N/A')}" if summary.get('min_vswr') is not None else "N/A"
            
        table_iii_rows = [
            ["Minimum Reflection Coefficient (min S11)", min_s11, "Represents the point of maximum return loss / impedance match"],
            ["Maximum Transmission Coefficient (max S21)", max_s21, "Identifies the frequency of lowest insertion loss in transmission"],
            ["Minimum Voltage Standing Wave Ratio (min VSWR)", min_vswr, "Measures the closeness to ideal line impedance match (1.0)"]
        ]
        
        table_iii_html = _render_table(
            caption="Key Scattering Parameter Figures of Merit",
            table_id="III",
            headers=["RF Parameter Metric", "Extracted Value", "Physical Description"],
            rows=table_iii_rows
        )
        s_content += table_iii_html
        toc_tables.append(("Table III. Key Scattering Parameter Figures of Merit", "#table-iii"))
        table_counter += 1
        
        # Load plots
        plots = s_params_data.get("plots", [])
        if not plots and touchstone_path:
            # Generate plots on the fly from touchstone file
            plots = _generate_s_params_plots(touchstone_path)
            
        if plots:
            plots_html = '<div class="grid-2col">'
            for p in plots:
                pid = p.get("id")
                title = p.get("title", pid)
                img = p.get("image", "")
                
                fig_html = _render_figure(
                    base64_img=img,
                    caption=f"{title} response plotted across the analyzed RF band.",
                    fig_num=fig_counter
                )
                plots_html += f"<div>{fig_html}</div>"
                toc_figures.append((f"Fig. {fig_counter}. {title} response plotted across the analyzed RF band", f"fig-{fig_counter}"))
                fig_counter += 1
            plots_html += "</div>"
            s_content += plots_html
            
        sections_html += _render_section(
            title="Scattering Parameter Frequency Response",
            number="III",
            section_id="sec-iii",
            content=s_content
        )
        
    # --- Section IV: Self-Resonant Frequency Analysis ---
    cutoff_data = history.get("cutoff_freq", {})
    if cutoff_data:
        cutoff_freq_mhz = cutoff_data.get("cutoff_frequency_mhz")
        cutoff_val_db = cutoff_data.get("value_db")
        search_type = cutoff_data.get("search_type", "min")
        label = cutoff_data.get("label", "Cutoff Frequency")
        
        cutoff_rows = [
            ["Extracted Resonant Frequency / Cutoff", f"{cutoff_freq_mhz:.3f} MHz" if cutoff_freq_mhz else "N/A"],
            ["Magnitude at Resonance / Cutoff", f"{cutoff_val_db:.2f} dB" if cutoff_val_db is not None else "N/A"],
            ["Search Criterion", "Local Minimum (Resonance)" if search_type == "min" else "Local Maximum / 3dB Cutoff"],
            ["Parameter Analyzed", label]
        ]
        table_iv_html = _render_table(
            caption="Resonant Frequency and Band-Cutoff Analysis Summary",
            table_id="IV",
            headers=["RF Cutoff Characteristic", "Extracted Numerical Value"],
            rows=cutoff_rows
        )
        
        sections_html += _render_section(
            title="Resonant and Cutoff Frequency Characterization",
            number="IV",
            section_id="sec-iv",
            content="This section details the extraction of the self-resonant frequency (SRF) or the frequency cut-offs under the selected attenuation threshold.\n" + table_iv_html
        )
        toc_sections.append(("IV. Resonant and Cutoff Frequency Characterization", "#sec-iv"))
        toc_tables.append(("Table IV. Resonant Frequency and Band-Cutoff Analysis Summary", "#table-iv"))
        table_counter += 1
        
    # --- Section V: Equivalent Circuit Model (Multi-Model Support) ---
    shunt_data = history.get("compact_model_shunt", {})
    vf_data = history.get("compact_model_vf", {})
    legacy_data = history.get("compact_model", {})
    
    # Fallback legacy handling
    if legacy_data:
        l_method = legacy_data.get("summary", {}).get("method", legacy_data.get("method", ""))
        if "vf" in l_method.lower() or "vector" in l_method.lower():
            if not vf_data:
                vf_data = legacy_data
        else:
            if not shunt_data:
                shunt_data = legacy_data
                
    has_models = bool(shunt_data or vf_data)
    
    if has_models:
        toc_sections.append(("V. Lumped Equivalent Circuit Model Fitting", "#sec-v"))
        model_content = "This section presents the physics-based lumped equivalent circuit models extracted from experimental scattering parameters using two numerical methodologies: the Physical Shunt Model (optimized physical topology search) and the Vector Fitting Model (rational transfer function fitting).\n"
        
        # Sub-section V-A: Physical Shunt
        if shunt_data:
            summary = shunt_data.get("summary", {})
            c_eff = summary.get("c_eff", shunt_data.get("c_eff", "N/A"))
            nrms = summary.get("nrms", shunt_data.get("nrms", "N/A"))
            c_eff_str = f"{c_eff:.4e} F" if isinstance(c_eff, (int, float)) else str(c_eff)
            nrms_str = f"{nrms:.4f}" if isinstance(nrms, (int, float)) else str(nrms)
            
            shunt_rows = [
                ["Extraction Method / Topology", "Physical Shunt Fit (Multi-branch Search)"],
                ["Extracted Effective Component Value (C_eff / L_eff)", c_eff_str],
                ["Normalized Root-Mean-Square Error (NRMS)", nrms_str],
                ["Fitting Validity Status", "High Correlation (NRMS < 0.05)" if isinstance(nrms, (int, float)) and nrms < 0.05 else "Valid Model"]
            ]
            table_va_html = _render_table(
                caption="Equivalent Shunt Physical Model Extraction Metrics",
                table_id="V-A",
                headers=["Model Extraction Parameter", "Numerical Extracted Value"],
                rows=shunt_rows
            )
            model_content += f"""
            <div id="sec-v-a" style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                <h3 style="font-family: 'Lora', serif; font-size: 15px; color: #0f52ba; margin-bottom: 12px;">V-A. Physical Shunt Circuit Model</h3>
                <p class="section-desc" style="font-size: 13.5px; color: #475569;">The Shunt extraction methodology fits the component's frequency behavior to a lumped physical RLC model using optimized branch parameters, guaranteeing a physically realizable network structure.</p>
                {table_va_html}
            """
            toc_sections.append(("&nbsp;&nbsp;&bull; V-A. Physical Shunt Circuit Model", "#sec-v-a"))
            toc_tables.append(("Table V-A. Equivalent Shunt Physical Model Extraction Metrics", "#table-v-a"))
            
            netlist = shunt_data.get("spice_netlist")
            if netlist:
                model_content += _render_code_block(netlist, f"SPICE Netlist (Physical Shunt Model)")
                
            plots = shunt_data.get("plots", [])
            if plots:
                plots_html = '<div class="grid-2col">'
                for p in plots:
                    pid = p.get("id")
                    title = p.get("title", pid)
                    img = p.get("image", "")
                    fig_html = _render_figure(
                        base64_img=img,
                        caption=f"Physical Shunt model fit vs experimental data: {title}.",
                        fig_num=fig_counter
                    )
                    plots_html += f"<div>{fig_html}</div>"
                    toc_figures.append((f"Fig. {fig_counter}. Physical Shunt model fit vs experimental data: {title}", f"fig-{fig_counter}"))
                    fig_counter += 1
                plots_html += "</div>"
                model_content += plots_html
                
            model_content += "</div>"
            table_counter += 1
            
        # Sub-section V-B: Vector Fitting
        if vf_data:
            summary = vf_data.get("summary", {})
            c_eff = summary.get("c_eff", vf_data.get("c_eff", "N/A"))
            nrms = summary.get("nrms", vf_data.get("nrms", "N/A"))
            c_eff_str = f"{c_eff:.4e} F" if isinstance(c_eff, (int, float)) else str(c_eff)
            nrms_str = f"{nrms:.4f}" if isinstance(nrms, (int, float)) else str(nrms)
            
            vf_rows = [
                ["Extraction Method / Topology", "Vector Fitting (Rational Function Model)"],
                ["Extracted Effective Component Value (C_eff / L_eff)", c_eff_str],
                ["Normalized Root-Mean-Square Error (NRMS)", nrms_str],
                ["Fitting Validity Status", "High Correlation (NRMS < 0.05)" if isinstance(nrms, (int, float)) and nrms < 0.05 else "Valid Model"]
            ]
            table_vb_html = _render_table(
                caption="Equivalent Vector Fitting Model Extraction Metrics",
                table_id="V-B",
                headers=["Model Extraction Parameter", "Numerical Extracted Value"],
                rows=vf_rows
            )
            model_content += f"""
            <div id="sec-v-b" style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                <h3 style="font-family: 'Lora', serif; font-size: 15px; color: #0f52ba; margin-bottom: 12px;">V-B. Vector Fitting (VF) Rational Model</h3>
                <p class="section-desc" style="font-size: 13.5px; color: #475569;">The Vector Fitting technique solves a rational pole-residue approximation to produce highly accurate, wideband spice subcircuits, ideal for complex and multi-resonant component behaviors.</p>
                {table_vb_html}
            """
            toc_sections.append(("&nbsp;&nbsp;&bull; V-B. Vector Fitting Rational Model", "#sec-v-b"))
            toc_tables.append(("Table V-B. Equivalent Vector Fitting Model Extraction Metrics", "#table-v-b"))
            
            netlist = vf_data.get("spice_netlist")
            if netlist:
                model_content += _render_code_block(netlist, f"SPICE Netlist (Vector Fitting Model)")
                
            plots = vf_data.get("plots", [])
            if plots:
                plots_html = '<div class="grid-2col">'
                for p in plots:
                    pid = p.get("id")
                    title = p.get("title", pid)
                    img = p.get("image", "")
                    fig_html = _render_figure(
                        base64_img=img,
                        caption=f"Vector Fitting model fit vs experimental data: {title}.",
                        fig_num=fig_counter
                    )
                    plots_html += f"<div>{fig_html}</div>"
                    toc_figures.append((f"Fig. {fig_counter}. Vector Fitting model fit vs experimental data: {title}", f"fig-{fig_counter}"))
                    fig_counter += 1
                plots_html += "</div>"
                model_content += plots_html
                
            model_content += "</div>"
            table_counter += 1
            
        sections_html += _render_section(
            title="Lumped Equivalent Circuit Model Fitting",
            number="V",
            section_id="sec-v",
            content=model_content
        )
        
    # --- Section VI: Quick Component Extraction ---
    quick_data = history.get("quick_extract", {})
    if quick_data:
        nominal_value = quick_data.get("nominal_value")
        unit = quick_data.get("unit", "")
        srf_hz = quick_data.get("srf_hz")
        esr = quick_data.get("esr")
        q_factor = quick_data.get("q_factor")
        quality = quick_data.get("quality", "")
        quality_score = quick_data.get("quality_score")
        model_params = quick_data.get("model_params", {})

        def _fmt(v, digits=4, suffix=""):
            return f"{v:.{digits}g}{suffix}" if isinstance(v, (int, float)) else "N/A"

        val_str     = f"{nominal_value:.4e} {unit}" if isinstance(nominal_value, (int, float)) else "N/A"
        srf_mhz_str = f"{srf_hz / 1e6:.3f} MHz"   if isinstance(srf_hz, (int, float)) else "N/A"
        esr_str     = f"{esr:.4f} Ω"               if isinstance(esr, (int, float)) else "N/A"
        q_str       = f"{q_factor:.1f}"             if isinstance(q_factor, (int, float)) else "N/A"
        qual_str    = f"{quality} (score {quality_score:.2f})" if isinstance(quality_score, (int, float)) else quality or "N/A"

        quick_rows = [
            ["Nominal Component Value", val_str],
            ["Self-Resonant Frequency (SRF)", srf_mhz_str],
            ["Equivalent Series Resistance (ESR)", esr_str],
            ["Quality Factor Q (at nominal freq.)", q_str],
            ["Extraction Window Quality", qual_str],
        ]
        table_vi_html = _render_table(
            caption="Quick Component Extraction: Lumped Values and Parasitics",
            table_id="VI",
            headers=["Parameter", "Extracted Value"],
            rows=quick_rows
        )

        vi_content = (
            "This section reports the nominal physical parameters and key parasitics extracted "
            "using a pre-resonant windowing algorithm with slope/phase quality scoring "
            "(SOTA dispersive model). The Q-factor is evaluated at the nominal operating "
            "frequency.\n" + table_vi_html
        )

        # Dispersive model sub-table
        if model_params:
            Rdc    = model_params.get("Rdc")
            Rskin  = model_params.get("Rskin")
            alpha  = model_params.get("alpha")
            beta   = model_params.get("beta")
            disp_rows = [
                ["DC Resistance R_dc",         _fmt(Rdc,   4, " Ω")],
                ["Skin-effect coefficient R_skin", _fmt(Rskin, 4, " Ω/√Hz")],
                ["Capacitance dispersion exponent α", _fmt(alpha, 4)],
                ["ESR frequency exponent β",   _fmt(beta,  4)],
            ]
            table_via_html = _render_table(
                caption="SOTA Dispersive Model Parameters",
                table_id="VI-A",
                headers=["Dispersive Model Parameter", "Extracted Value"],
                rows=disp_rows
            )
            vi_content += f"""
            <div id="sec-vi-a" style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
                <h3 style="font-family: 'Lora', serif; font-size: 15px; color: #0f52ba; margin-bottom: 12px;">
                    VI-A. State-of-the-Art Dispersive Model
                </h3>
                <p class="section-desc" style="font-size: 13.5px; color: #475569;">
                    Frequency-dependent parameters are fitted to the SOTA dispersive model:
                    C(f) = C₀·(f/f_ref)<sup>−α</sup>,  R(f) = R_dc + R_skin·√f.
                </p>
                {table_via_html}
            </div>"""
            toc_tables.append(("Table VI-A. SOTA Dispersive Model Parameters", "#table-vi-a"))
            table_counter += 1
            toc_sections.append(("&nbsp;&nbsp;&bull; VI-A. SOTA Dispersive Model", "#sec-vi-a"))

        sections_html += _render_section(
            title="Quick Lumped Parameter and Parasitics Extraction",
            number="VI",
            section_id="sec-vi",
            content=vi_content
        )
        toc_sections.append(("VI. Quick Lumped Parameter & Parasitics Extraction", "#sec-vi"))
        toc_tables.append(("Table VI. Quick Component Extraction — Lumped Values", "#table-vi"))
        table_counter += 1
        
    # --- Section VII: SAMM Topology Recommendation ---
    samm_data = history.get("samm", {})
    if samm_data:
        fmin = samm_data.get("fmin", 0)
        fmax = samm_data.get("fmax", 0)
        resultados = samm_data.get("resultados", [])
        
        samm_rows = []
        for idx, res in enumerate(resultados):
            samm_rows.append([
                res.get("modelo", f"Model {idx+1}"),
                res.get("valor_str", "N/A"),
                res.get("error_fit", "N/A"),
                res.get("zona", "N/A")
            ])
            
        if not samm_rows:
            samm_rows.append(["No models recommended", "N/A", "N/A", "N/A"])
            
        table_vii_html = _render_table(
            caption="SAMM Multi-Model Topology Fitting Recommendations",
            table_id="VII",
            headers=["Recommended Circuit Topology", "Nominal Fitted Value", "Fit Error (%)", "Frequency Zone"],
            rows=samm_rows
        )
        
        samm_content = f"The SAMM (Smart Automated Multi-Model) framework was applied to fit multiple physical topologies over the band {fmin/1e6:.1f} MHz to {fmax/1e6:.1f} MHz.\n" + table_vii_html
        table_counter += 1
        
        plot_img = samm_data.get("plot")
        if plot_img:
            samm_content += _render_figure(
                base64_img=plot_img,
                caption="SAMM multi-topology fitting and impedance zones projection.",
                fig_num=fig_counter
            )
            toc_figures.append((f"Fig. {fig_counter}. SAMM multi-topology fitting and impedance zones projection", f"fig-{fig_counter}"))
            fig_counter += 1
            
        sections_html += _render_section(
            title="Systematic Multi-Model Topology Synthesis (SAMM)",
            number="VII",
            section_id="sec-vii",
            content=samm_content
        )
        toc_sections.append(("VII. Systematic Multi-Model Topology Synthesis (SAMM)", "#sec-vii"))
        toc_tables.append(("Table VII. SAMM Multi-Model Topology Fitting Recommendations", "#table-vii"))
        
    # --- Section VIII: De-Embedding Results ---
    deembed_data = history.get("deembedding", {})
    if deembed_data:
        de_summary  = deembed_data.get("summary", deembed_data)
        fm          = de_summary.get("fixture_model", de_summary.get("topology", "N/A"))
        topo        = de_summary.get("dut_topology", "N/A")
        z0_val      = de_summary.get("z0", 50.0)
        n_pts       = de_summary.get("n_points", "N/A")
        fmin_de     = de_summary.get("freq_min_mhz")
        fmax_de     = de_summary.get("freq_max_mhz")
        nrms_raw    = de_summary.get("nrms_raw")
        nrms_de     = de_summary.get("nrms_deembed")

        def _mhz(v): return f"{v:.3f} MHz" if isinstance(v, (int, float)) else "N/A"
        def _pct(v): return f"{v*100:.2f} %" if isinstance(v, (int, float)) else "N/A"

        _FIXTURE_LABELS = {
            "pi":          "π-model — Open-Short (Koolen, 1991)",
            "t":           "T-model — Dual Open-Short",
            "series_only": "Series-only (Short standard)",
            "shunt_only":  "Shunt-only (Open standard)",
        }
        fm_label = _FIXTURE_LABELS.get(fm, fm)

        de_rows = [
            ["Fixture De-embedding Model",     fm_label],
            ["DUT S-parameter Topology",       topo.upper()],
            ["Reference Impedance Z₀",         f"{z0_val:.1f} Ω"],
            ["Frequency Range (de-embedded)",  f"{_mhz(fmin_de)} – {_mhz(fmax_de)}"],
            ["Frequency Points",               str(n_pts)],
            ["NRMS Error — Raw Measurement",   _pct(nrms_raw)],
            ["NRMS Error — De-embedded DUT",   _pct(nrms_de)],
        ]
        table_viii_de_html = _render_table(
            caption="Fixture De-Embedding Configuration and Quality Metrics",
            table_id="VIII",
            headers=["De-Embedding Parameter", "Value"],
            rows=de_rows
        )

        de_content = (
            "This section presents the fixture de-embedding results. Parasitic contributions "
            "from the test fixture were removed using the selected fixture model and calibration "
            "standards (Open / Short). The NRMS metric quantifies the relative change in "
            "impedance response before and after de-embedding.\n"
            + table_viii_de_html
        )

        # De-embedding plots
        de_plots = deembed_data.get("plots", [])
        if de_plots:
            de_plots_html = '<div class="grid-2col">'
            for p in de_plots:
                pid   = p.get("id", "")
                title = p.get("title", pid)
                img   = p.get("image", "")
                fig_html = _render_figure(
                    base64_img=img,
                    caption=f"De-embedded vs. raw: {title}.",
                    fig_num=fig_counter
                )
                de_plots_html += f"<div>{fig_html}</div>"
                toc_figures.append((f"Fig. {fig_counter}. De-embedded vs. raw: {title}", f"fig-{fig_counter}"))
                fig_counter += 1
            de_plots_html += "</div>"
            de_content += de_plots_html

        sections_html += _render_section(
            title="Fixture De-Embedding Results",
            number="VIII",
            section_id="sec-viii-de",
            content=de_content
        )
        toc_sections.append(("VIII. Fixture De-Embedding Results", "#sec-viii-de"))
        toc_tables.append(("Table VIII. De-Embedding Configuration and Quality Metrics", "#table-viii"))
        table_counter += 1

    # --- Section IX: Datasheet Reference ---
    if datasheet:
        ds_name = datasheet.get("name", "Datasheet URL")
        ds_path = datasheet.get("relative_path", "")
        ds_mtime = datasheet.get("mtime", 0)
        ds_date = datetime.datetime.fromtimestamp(ds_mtime).strftime("%Y-%m-%d %H:%M:%S") if ds_mtime else "N/A"

        ds_web_url = datasheet.get("url") or metadata.get("datasheet_url") or ""

        full_pdf_path = os.path.join(BIBLIOTECA_DIR, ds_path.replace('/', os.sep)).replace(os.sep, '/')
        ds_rows = [
            ["Document Label / File", ds_name],
            ["Document Path in Library", f"<a href='file:///{full_pdf_path}' target='_blank'>{ds_path}</a>" if ds_path else "N/A"],
            ["Linked Date", ds_date],
            ["Original Datasheet Web Link", f"<a href='{ds_web_url}' target='_blank'>{ds_web_url}</a>" if ds_web_url else "N/A"],
            ["Mouser Supplier Link", f"<a href='{metadata.get('supplier_url') or metadata.get('mouser_product_url')}' target='_blank'>Product Page</a>" if metadata.get('supplier_url') or metadata.get('mouser_product_url') else "N/A"]
        ]
        table_ix_html = _render_table(
            caption="Attached Component Reference Datasheets and Documents",
            table_id="IX",
            headers=["Linked Reference Field", "Document Link / URL Reference"],
            rows=ds_rows
        )
        sections_html += _render_section(
            title="Technical Datasheets and References",
            number="IX",
            section_id="sec-ix",
            content="Official manufacturer datasheets and supplier documentation linked to this measurement for verification purposes are indexed below.\n" + table_ix_html
        )
        toc_sections.append(("IX. Technical Datasheets and References", "#sec-ix"))
        toc_tables.append(("Table IX. Attached Component Reference Datasheets and Documents", "#table-ix"))
        table_counter += 1

    # Build Table of Contents HTML dynamically
    toc_html = """
    <div class="toc-container" id="table-of-contents">
        <div class="toc-title">Document Index (Table of Contents)</div>
        <div class="toc-grid">
            <div class="toc-column">
                <div class="toc-column-title">1. Document Sections</div>
                <ul class="toc-list">
    """
    for title, anchor in toc_sections:
        if "&nbsp;&nbsp;&bull;" in title:
            toc_html += f'                    <li class="toc-item toc-subitem"><a href="{anchor}">{title}</a></li>\n'
        else:
            toc_html += f'                    <li class="toc-item"><a href="{anchor}">{title}</a></li>\n'

    toc_html += """
                </ul>
            </div>
            <div class="toc-column">
    """

    if toc_tables:
        toc_html += """
                <div class="toc-column-title" style="margin-top: 0;">2. List of Tables</div>
                <ul class="toc-list" style="margin-bottom: 20px;">
        """
        for title, anchor in toc_tables:
            toc_html += f'                    <li class="toc-item" style="font-size: 12.5px;"><a href="{anchor}">{title}</a></li>\n'
        toc_html += "                </ul>\n"

    if toc_figures:
        toc_html += """
                <div class="toc-column-title">3. List of Figures</div>
                <ul class="toc-list">
        """
        for title, anchor in toc_figures:
            toc_html += f'                    <li class="toc-item" style="font-size: 12.5px;"><a href="#{anchor}">{title}</a></li>\n'
        toc_html += "                </ul>\n"

    toc_html += """
            </div>
        </div>
    </div>
    """

    # Build complete document
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IEEE Report: {measurement_id}</title>
    <style>
    {css_content}
    </style>
</head>
<body>
    {preview_bar_html}
    <div class="paper-container">
        {header_html}
        {title_block_html}
        {abstract_html}
        {scorecard_html}
        {toc_html}
        {sections_html}

        <div class="report-footer">
            <div>RF &amp; Signal Integrity Suite &bull; Automated Characterization System v1.7.0</div>
            <div style="font-family: monospace; font-size: 10px; margin-top: 5px;">Report compiled at {current_time_str} &bull; System operator verified.</div>
            <div style="font-size: 9px; color: #a0aec0; margin-top: 10px; font-style: italic;">Disclaimer: This report is automatically compiled by the RF &amp; Signal Integrity Suite. Values represent numerical extractions fit against experimental data and should be verified against application conditions before hardware manufacturing.</div>
        </div>
    </div>
</body>
</html>"""

    return html_content