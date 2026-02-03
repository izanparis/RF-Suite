import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import LogLocator, LogFormatterMathtext
import io
import base64
import matplotlib
matplotlib.use('Agg')

def parse_valor_con_prefijo(texto: str) -> float:
    prefijos = {
        'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3,
        'K': 1e3, 'M': 1e6, 'G': 1e9
    }
    texto = str(texto).strip()
    if not texto:
        raise ValueError("Entrada vacía")
    if texto[-1].isalpha():
        pref = texto[-1]
        if pref not in prefijos:
            raise ValueError("Prefijo no reconocido")
        return float(texto[:-1]) * prefijos[pref]
    return float(texto)

def formatear_si(valor: float, magnitud: str) -> str:
    escalas = {
        'Hz':  [(1e9,'GHz'), (1e6,'MHz'), (1e3,'kHz'), (1,'Hz')],
        'ohm': [(1e6,'MΩ'), (1e3,'kΩ'), (1,'Ω')],
        'F':   [(1e-6,'µF'), (1e-9,'nF'), (1e-12,'pF')],
        'H':   [(1e-3,'mH'), (1e-6,'µH'), (1e-9,'nH')],
    }
    for factor, unidad in escalas[magnitud]:
        if abs(valor) >= factor:
            return f"{valor/factor:.3g} {unidad}"
    return f"{valor:.3g} {escalas[magnitud][-1][1]}"

def s_db_to_lin(s_db: float) -> float:
    return 10 ** (s_db / 20)

def z_bounds_series(s21_min_db: float, s21_max_db: float, Z0: float):
    Smin = s_db_to_lin(s21_min_db)  
    Smax = s_db_to_lin(s21_max_db)  
    Zmin = 2 * Z0 * (1 / Smax - 1)
    Zmax = 2 * Z0 * (1 / Smin - 1)
    return Zmin, Zmax

def z_bounds_shunt(s21_min_db: float, s21_max_db: float, Z0: float, Rs: float = 0.0):
    Smin = s_db_to_lin(s21_min_db)  
    Smax = s_db_to_lin(s21_max_db)  
    Zmin = (Z0 + Rs) / 2 * (Smin / (1 - Smin))
    Zmax = (Z0 + Rs) / 2 * (Smax / (1 - Smax))
    return Zmin, Zmax

def calcular_rango_impedancia(tipo: str, valor: float, fmin: float, fmax: float, f0: float):
    f_eff = min(f0, fmax)
    if tipo == "C":
        Zmax = 1 / (2 * math.pi * fmin * valor)
        Zmin = 1 / (2 * math.pi * f_eff * valor)
    else:  # L
        Zmin = 2 * math.pi * fmin * valor
        Zmax = 2 * math.pi * f_eff * valor
    return Zmin, Zmax

def Z_mag_real_C(freqs: np.ndarray, C: float, f0: float) -> np.ndarray:
    w = 2 * np.pi * freqs
    ESL = 1.0 / ((2 * np.pi * f0) ** 2 * C)
    Z = 1j * w * ESL + 1.0 / (1j * w * C)
    return np.abs(Z)

def Z_mag_real_L(freqs: np.ndarray, L: float, f0: float) -> np.ndarray:
    w = 2 * np.pi * freqs
    Cp = 1.0 / ((2 * np.pi * f0) ** 2 * L)
    ZL = 1j * w * L
    ZC = 1.0 / (1j * w * Cp)
    Zpar = 1.0 / (1.0 / ZL + 1.0 / ZC)
    return np.abs(Zpar)

def seleccionar_modelo_con_rs(Zc_min: float, Zc_max: float, s21_min_db: float, s21_max_db: float, Z0: float):
    Zs_min, Zs_max = z_bounds_series(s21_min_db, s21_max_db, Z0)
    Zh0_min, Zh0_max = z_bounds_shunt(s21_min_db, s21_max_db, Z0, Rs=0.0)
    series_ok = (Zc_min >= Zs_min) and (Zc_max <= Zs_max)
    shunt_ok  = (Zc_min >= Zh0_min) and (Zc_max <= Zh0_max)
    if series_ok and not shunt_ok:
        return "Use 2-port-series", None
    if shunt_ok and not series_ok:
        return "Use 2-port-shunt", None
    if series_ok and shunt_ok:
        return ("Use 2-port-shunt", None) if Zc_max < Z0 else ("Use 2-port-series", None)
    Smin = s_db_to_lin(s21_min_db)
    Smax = s_db_to_lin(s21_max_db)
    kmin = 0.5 * (Smin / (1 - Smin))
    kmax = 0.5 * (Smax / (1 - Smax))
    Rs_low  = (Zc_max / kmax) - Z0
    Rs_high = (Zc_min / kmin) - Z0
    Rs_low = max(Rs_low, 0.0)
    if Rs_low <= Rs_high:
        return f"Use 2-port-shunt con Rs = {Rs_low:.3g} Ω", Rs_low
    return "Split measurement", None

def run_samm(fmin, fmax, f0, s21_min_db, s21_max_db, components, Z0=50.0):
    resultados = []
    for comp in components:
        tipo = comp['tipo']
        valor = comp['valor']
        unidad = "F" if tipo == "C" else "H"
        Zmin, Zmax = calcular_rango_impedancia(tipo, valor, fmin, fmax, f0)
        modelo, Rs_star = seleccionar_modelo_con_rs(Zmin, Zmax, s21_min_db, s21_max_db, Z0)
        resultados.append({
            "tipo": "Condensador" if tipo == "C" else "Bobina",
            "tipo_code": tipo,
            "valor_SI": valor,
            "valor_str": formatear_si(valor, unidad),
            "Zmin_str": formatear_si(Zmin, "ohm"),
            "Zmax_str": formatear_si(Zmax, "ohm"),
            "modelo": modelo,
            "Rs": Rs_star
        })
    
    # Plotting
    freqs = np.logspace(np.log10(fmin), np.log10(fmax), 1000)
    Zs_min, Zs_max = z_bounds_series(s21_min_db, s21_max_db, Z0)
    Zh0_min, Zh0_max = z_bounds_shunt(s21_min_db, s21_max_db, Z0, Rs=0.0)
    Rs_vals = [r["Rs"] for r in resultados if r["Rs"] is not None]
    Rs_plot = max(Rs_vals) if Rs_vals else None

    plt.figure(figsize=(10, 6))
    ax = plt.gca()
    ax.fill_between(freqs, Zs_min, Zs_max, color="#2ca02c", alpha=0.3, label="2-port Series")
    ax.fill_between(freqs, Zh0_min, Zh0_max, color="#17becf", alpha=0.3, label="2-port Shunt (Rs=0)")
    if Rs_plot is not None:
        ZhR_min, ZhR_max = z_bounds_shunt(s21_min_db, s21_max_db, Z0, Rs=Rs_plot)
        ax.fill_between(freqs, ZhR_min, ZhR_max, color="#d62728", alpha=0.2, label=f"2-port Shunt (Rs={Rs_plot:.3g}Ω)")

    for r in resultados:
        Z = Z_mag_real_C(freqs, r["valor_SI"], f0) if r["tipo_code"] == "C" else Z_mag_real_L(freqs, r["valor_SI"], f0)
        ax.plot(freqs, Z, linewidth=2, label=f"|Z(f)| {r['valor_str']}")

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.grid(True, which="both", alpha=0.3)
    ax.set_xlabel("Frequency (Hz)", fontsize=13, fontweight='bold')
    ax.set_ylabel("Impedance (Ohm)", fontsize=13, fontweight='bold')
    ax.tick_params(axis='both', which='major', labelsize=11)
    ax.legend()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    plot_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    # Generate Report CSV
    csv_lines = ["Componente,Tipo,Valor,Zmin,Zmax,Modelo Recomendado,Rs (Shunt)"]
    for r in resultados:
        line = f"{r['valor_str']},{r['tipo']},{r['valor_SI']},{r['Zmin_str']},{r['Zmax_str']},{r['modelo']},{r['Rs'] if r['Rs'] else ''}"
        csv_lines.append(line)
    
    report_content = "\n".join(csv_lines)

    return {
        "resultados": resultados,
        "plot": plot_base64,
        "report_content": report_content
    }
