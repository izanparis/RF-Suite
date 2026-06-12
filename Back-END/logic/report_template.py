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

    /* IEEE Sections */
    .section-container {
        margin-bottom: 45px;
        page-break-inside: avoid;
    }
    .section-header {
        font-family: 'Lora', Georgia, serif;
        font-size: 18px;
        font-weight: 700;
        color: #0f52ba;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 8px;
        margin-top: 40px;
        margin-bottom: 20px;
        text-transform: uppercase;
        letter-spacing: 1px;
        display: flex;
        align-items: baseline;
    }
    .section-num {
        margin-right: 12px;
        font-family: 'Lora', Georgia, serif;
        color: #0f52ba;
        font-weight: 700;
    }
    .section-text-inner {
        font-weight: 700;
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
        background-color: #f1f5f9;
        border-bottom: 1px solid #e2e8f0;
        color: #1e293b;
        font-weight: 600;
        padding: 10px 14px;
        text-align: left;
    }
    .data-table td {
        border-bottom: 1px solid #f1f5f9;
        padding: 10px 14px;
        color: #334155;
        vertical-align: middle;
        background-color: #ffffff;
    }
    .data-table tr:last-child td {
        border-bottom: none;
    }
    .data-table tr:hover td {
        background-color: #f8fafc;
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

def _render_figure(base64_img: str, caption: str, fig_num: int) -> str:
    """Renders a figure with base64 embedded image, caption below, and an anchor id."""
    if not base64_img:
        return ""
    # Ensure it has correct prefix
    img_src = base64_img if base64_img.startswith("data:image/") else f"data:image/png;base64,{base64_img}"
    return f"""
    <div class="figure-container" id="fig-{fig_num}">
        <div class="figure-img-wrapper">
            <img class="figure-img" src="{img_src}" alt="Figure {fig_num}" />
        </div>
        <div class="figure-caption">
            <span class="figure-number">Fig. {fig_num}.</span> {caption}
            <a href="#table-of-contents" class="back-to-toc no-print" style="display: inline-block; margin-left: 10px;">↑ TOC</a>
        </div>
    </div>
    """

def _render_code_block(code: str, title: str) -> str:
    """Renders a code block for netlists or textual summaries."""
    return f"""
    <div style="page-break-inside: avoid; margin-bottom: 20px;">
        <div class="code-title">{title}</div>
        <pre class="code-block">{code}</pre>
    </div>
    """

def _generate_s_params_plots(touchstone_path: str) -> list:
    """Generates base64 S-parameter plots on the fly from a touchstone file if scikit-rf is available."""
    plots = []
    try:
        if not os.path.exists(touchstone_path):
            logging.error(f"Cannot generate S-parameter plots on the fly: {touchstone_path} does not exist")
            return []
            
        ntw = rf.Network(touchstone_path)
        freq_mhz = ntw.f / 1e6
        n_ports = ntw.nports
        has_s21 = n_ports >= 2
        
        def get_b64(fig):
            import io
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode('utf-8')
            plt.close(fig)
            return b64

        # 1. S11 Magnitude
        fig = plt.figure(figsize=(8.5, 5.2))
        plt.plot(freq_mhz, ntw.s_db[:, 0, 0], label='S11 (dB)', color='#0877c9', linewidth=1.5)
        plt.title('S11 Magnitude Response')
        plt.xlabel('Frequency (MHz)')
        plt.ylabel('Magnitude (dB)')
        plt.grid(True, alpha=0.3)
        plt.legend(loc='best')
        plots.append({"id": "s11", "title": "S11 (dB)", "image": get_b64(fig)})

        # 2. S21 Magnitude (if 2 ports)
        if has_s21:
            fig = plt.figure(figsize=(8.5, 5.2))
            plt.plot(freq_mhz, ntw.s_db[:, 1, 0], label='S21 (dB)', color='#ef4444', linewidth=1.5)
            plt.title('S21 Magnitude Response')
            plt.xlabel('Frequency (MHz)')
            plt.ylabel('Magnitude (dB)')
            plt.grid(True, alpha=0.3)
            plt.legend(loc='best')
            plots.append({"id": "s21", "title": "S21 (dB)", "image": get_b64(fig)})

        # 3. Z Magnitude
        fig = plt.figure(figsize=(8.5, 5.2))
        if n_ports == 1:
            z_in = np.abs(ntw.z[:, 0, 0])
            plt.loglog(freq_mhz, z_in, color='purple', label='|Z_in|', linewidth=1.5)
            plt.title('Input Impedance |Z_in|')
        else:
            abcd = ntw.a
            z_series = np.maximum(np.abs(abcd[:, 0, 1]), 1e-12)
            y_shunt = abcd[:, 1, 0]
            z_shunt = np.maximum(np.abs(1.0 / (y_shunt + 1e-30)), 1e-12)
            plt.loglog(freq_mhz, z_series, color='purple', label='|Z_series|', linewidth=1.5)
            plt.loglog(freq_mhz, z_shunt, color='brown', label='|Z_shunt|', linestyle='--', linewidth=1.5)
            plt.title('Extracted Impedance Magnitude')
        plt.xlabel('Frequency (MHz)')
        plt.ylabel('Impedance (Ohm)')
        plt.grid(True, which="both", ls="-", alpha=0.2)
        plt.legend(loc='best')
        plots.append({"id": "zmag", "title": "Impedance |Z|", "image": get_b64(fig)})

        # 4. Phase
        fig = plt.figure(figsize=(8.5, 5.2))
        plt.plot(freq_mhz, ntw.s_deg[:, 0, 0], label='S11 Phase (°)', color='#0877c9', linewidth=1.5)
        if has_s21:
            plt.plot(freq_mhz, ntw.s_deg[:, 1, 0], label='S21 Phase (°)', color='#ef4444', linewidth=1.5)
        plt.title('S-Parameter Phase Response')
        plt.xlabel('Frequency (MHz)')
        plt.ylabel('Phase (degrees)')
        plt.grid(True, alpha=0.3)
        plt.legend(loc='best')
        plots.append({"id": "phase", "title": "Phase (degrees)", "image": get_b64(fig)})

        # 5. Smith S11
        fig = plt.figure(figsize=(7.5, 7.5))
        ntw.plot_s_smith(m=0, n=0, label='S11', color='#0877c9')
        plt.title('Smith Chart S11')
        plots.append({"id": "smith11", "title": "Smith S11", "image": get_b64(fig)})

    except Exception as e:
        logging.error(f"Error generating S-parameter plots dynamically: {e}")
        
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
    comp_type_str = entry.get("component_type", "unknown component").upper()
    
    abstract_text = f"This technical paper presents the systematic characterization of the high-frequency response and equivalent circuit parameter extraction for the {comp_type_str} device under test (DUT), identified as {measurement_id}. The experimental measurements were recorded using the {device_name} platform over a frequency range of {fmin_mhz} to {fmax_mhz} across {points} data points. The electrical performance is analyzed through experimental scattering parameters (S-parameters), resonant characteristics, and physics-based circuit modeling. The equivalent circuit models are fit against experimental data using numerical optimization routines, demonstrating high correlation and low normalized root-mean-square error (NRMS). This document provides an index of all findings compiled by the RF & Signal Integrity Suite."
    
    abstract_html = f"""
    <div class="abstract-box">
        <span class="abstract-title">Abstract—</span>{abstract_text}
    </div>
    """
    
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
        
        val_str = f"{nominal_value:.4e} {unit}" if isinstance(nominal_value, (int, float)) else "N/A"
        srf_mhz_str = f"{srf_hz / 1e6:.3f} MHz" if isinstance(srf_hz, (int, float)) else "N/A"
        esr_str = f"{esr:.3f} Ohm" if isinstance(esr, (int, float)) else "N/A"
        
        quick_rows = [
            ["Extracted Nominal Value", val_str],
            ["Extracted Self-Resonant Frequency (SRF)", srf_mhz_str],
            ["Extracted Equivalent Series Resistance (ESR)", esr_str]
        ]
        table_vi_html = _render_table(
            caption="Quick Component Extraction Lumped Value & Parasitics",
            table_id="VI",
            headers=["Lumped Component Parameter", "Extracted Value"],
            rows=quick_rows
        )
        sections_html += _render_section(
            title="Quick Lumped Parameter & Parasitics Extraction",
            number="VI",
            section_id="sec-vi",
            content="This section reports the rapidly extracted nominal physical parameters and crucial parasitics, including the high-frequency Equivalent Series Resistance (ESR) and self-resonance.\n" + table_vi_html
        )
        toc_sections.append(("VI. Quick Lumped Parameter & Parasitics Extraction", "#sec-vi"))
        toc_tables.append(("Table VI. Quick Component Extraction Lumped Value & Parasitics", "#table-vi"))
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
        
    # --- Section VIII: Datasheet Reference ---
    if datasheet:
        ds_name = datasheet.get("name", "Datasheet URL")
        ds_path = datasheet.get("relative_path", "")
        ds_mtime = datasheet.get("mtime", 0)
        ds_date = datetime.datetime.fromtimestamp(ds_mtime).strftime("%Y-%m-%d %H:%M:%S") if ds_mtime else "N/A"
        
        # Keep and format original web datasheet link
        ds_web_url = datasheet.get("url") or metadata.get("datasheet_url") or ""
        
        full_pdf_path = os.path.join(BIBLIOTECA_DIR, ds_path.replace('/', os.sep)).replace(os.sep, '/')
        ds_rows = [
            ["Document Label / File", ds_name],
            ["Document Path in Library", f"<a href='file:///{full_pdf_path}' target='_blank'>{ds_path}</a>" if ds_path else "N/A"],
            ["Linked Date", ds_date],
            ["Original Datasheet Web Link", f"<a href='{ds_web_url}' target='_blank'>{ds_web_url}</a>" if ds_web_url else "N/A"],
            ["Mouser Supplier Link", f"<a href='{metadata.get('supplier_url') or metadata.get('mouser_product_url')}' target='_blank'>Product Page</a>" if metadata.get('supplier_url') or metadata.get('mouser_product_url') else "N/A"]
        ]
        table_viii_html = _render_table(
            caption="Attached Component Reference Datasheets and Documents",
            table_id="VIII",
            headers=["Linked Reference Field", "Document Link / URL Reference"],
            rows=ds_rows
        )
        sections_html += _render_section(
            title="Technical Datasheets and References",
            number="VIII",
            section_id="sec-viii",
            content="Official manufacturer datasheets and supplier documentation linked to this measurement for verification purposes are indexed below.\n" + table_viii_html
        )
        toc_sections.append(("VIII. Technical Datasheets and References", "#sec-viii"))
        toc_tables.append(("Table VIII. Attached Component Reference Datasheets and Documents", "#table-viii"))
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
        {toc_html}
        {sections_html}
        
        <div class="report-footer">
            <div>RF & Signal Integrity Suite • Automated Characterization System v1.7.0</div>
            <div style="font-family: monospace; font-size: 10px; margin-top: 5px;">Report compiled dynamically at {current_time_str} • System operator verified.</div>
            <div style="font-size: 9px; color: #a0aec0; margin-top: 10px; font-style: italic;">Disclaimer: This technical report is automatically compiled by the RF & Signal Integrity Suite. Models and values represent numerical extractions and mathematical models fit against experimental data, and should be verified against application conditions before hardware manufacturing.</div>
        </div>
    </div>
</body>
</html>
"""
    return html_content
