#=================================================================2
# Selección Automática del Modelo de Medición - Izan París Marcos
#=================================================================

import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import LogLocator, LogFormatterMathtext


# PREFIJOS SI


def parse_valor_con_prefijo(texto: str) -> float:
    prefijos = {
        'p': 1e-12,
        'n': 1e-9,
        'u': 1e-6,
        'm': 1e-3,
        'K': 1e3,
        'M': 1e6,
        'G': 1e9
    }
    texto = texto.strip()

    if not texto:
        raise ValueError("Entrada vacía")

    if texto[-1].isalpha():
        pref = texto[-1]
        if pref not in prefijos:
            raise ValueError("Prefijo no reconocido (usa p,n,u,m,K,M,G)")
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


# UTILIDADES 


def s_db_to_lin(s_db: float) -> float:
    return 10 ** (s_db / 20)

def z_bounds_series(s21_min_db: float, s21_max_db: float, Z0: float):
    """
    2-port series-through:
      S21 = 2*Z0 / (2*Z0 + Z)
      -> Z = 2*Z0*(1/S21 - 1)
    """
    Smin = s_db_to_lin(s21_min_db)  
    Smax = s_db_to_lin(s21_max_db)  

    Zmin = 2 * Z0 * (1 / Smax - 1)
    Zmax = 2 * Z0 * (1 / Smin - 1)
    return Zmin, Zmax

def z_bounds_shunt(s21_min_db: float, s21_max_db: float, Z0: float, Rs: float = 0.0):
    """
    2-port shunt-through con Rs:
      Z = (Z0+Rs)/2 * S21/(1-S21)
    """
    Smin = s_db_to_lin(s21_min_db)  
    Smax = s_db_to_lin(s21_max_db)  

    Zmin = (Z0 + Rs) / 2 * (Smin / (1 - Smin))
    Zmax = (Z0 + Rs) / 2 * (Smax / (1 - Smax))
    return Zmin, Zmax


# RANGO DE IMPEDANCIA DEL COMPONENTE (PARA SELECCIÓN)


def calcular_rango_impedancia(tipo: str, valor: float, fmin: float, fmax: float, f0: float):
    f_eff = min(f0, fmax)

    if tipo == "C":
        Zmax = 1 / (2 * math.pi * fmin * valor)
        Zmin = 1 / (2 * math.pi * f_eff * valor)
    else:  # L
        Zmin = 2 * math.pi * fmin * valor
        Zmax = 2 * math.pi * f_eff * valor

    return Zmin, Zmax


# MODELOS REALES PARA PLOT 


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


# SELECCIÓN DE MODELO 
# - prueba series
# - prueba shunt (Rs=0)
# - prueba shunt con Rs: SOLO si existe Rs que haga encajar



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
        # desempate simple (mantenemos criterio)
        return ("Use 2-port-shunt", None) if Zc_max < Z0 else ("Use 2-port-series", None)

    # Intentar Rs SOLO PARA SHUNT: hallar Rs que cumpla
    # Para shunt: Zmin(Rs)=kmin*(Z0+Rs), Zmax(Rs)=kmax*(Z0+Rs), con kmin,kmax > 0
    Smin = s_db_to_lin(s21_min_db)
    Smax = s_db_to_lin(s21_max_db)
    kmin = 0.5 * (Smin / (1 - Smin))
    kmax = 0.5 * (Smax / (1 - Smax))

    # Necesitamos: Zc_min >= kmin*(Z0+Rs)  => Rs <= Zc_min/kmin - Z0
    #              Zc_max <= kmax*(Z0+Rs)  => Rs >= Zc_max/kmax - Z0
    Rs_low  = (Zc_max / kmax) - Z0
    Rs_high = (Zc_min / kmin) - Z0

    Rs_low = max(Rs_low, 0.0)  # Rs no negativo

    if Rs_low <= Rs_high:
        Rs_star = Rs_low
        return f"Use 2-port-shunt con Rs = {Rs_star:.3g} Ω", Rs_star

    return "Split measurement", None


# COLORES: DUT 


def color_por_modelo(modelo: str) -> str:
    if "2-port-series" in modelo:
        return "#145214"  # verde oscuro
    if "2-port-shunt con Rs" in modelo:
        return "#7f1d1d"  # rojo oscuro
    if "2-port-shunt" in modelo:
        return "#0b5f68"  # cian oscuro
    return "black"        # split


# TABLA EN CONSOLA 


def imprimir_tabla(resultados, fmin, fmax, f0, s21_min_db, s21_max_db):
    print("\n" + "=" * 115)
    print(" SELECCIÓN DEL MODELO DE MEDICIÓN RF")
    print("=" * 115)
    print(f"Banda de frecuencias     : [{formatear_si(fmin,'Hz')}, {formatear_si(fmax,'Hz')}]")
    print(f"Frecuencia de resonancia : {formatear_si(f0,'Hz')}")
    print(f"Rango de S21             : [{s21_min_db} dB, {s21_max_db} dB]")
    print("-" * 115)
    print(f"{'Componente':<15}{'Valor':<18}{'Zmin':<18}{'Zmax':<18}{'Modelo recomendado':<40}")
    print("-" * 115)

    for r in resultados:
        print(f"{r['tipo']:<15}{r['valor_str']:<18}{r['Zmin_str']:<18}{r['Zmax_str']:<18}{r['modelo']:<40}")

    print("=" * 115)


# PLOT FINAL (áreas + DUTs)


def plot_mapa_y_duts(resultados, fmin, fmax, f0, s21_min_db, s21_max_db, Z0):
    freqs = np.logspace(np.log10(fmin), np.log10(fmax), 1600)

    # Áreas (constantes vs frecuencia) en la banda del usuario
    Zs_min, Zs_max = z_bounds_series(s21_min_db, s21_max_db, Z0)
    Zh0_min, Zh0_max = z_bounds_shunt(s21_min_db, s21_max_db, Z0, Rs=0.0)

    # Si hay Rs en algún DUT, pintamos un área shunt con Rs = max(Rs) 
    Rs_vals = [r["Rs"] for r in resultados if r["Rs"] is not None]
    Rs_plot = max(Rs_vals) if Rs_vals else None

    Zs_min_arr  = np.full_like(freqs, Zs_min)
    Zs_max_arr  = np.full_like(freqs, Zs_max)
    Zh0_min_arr = np.full_like(freqs, Zh0_min)
    Zh0_max_arr = np.full_like(freqs, Zh0_max)

    if Rs_plot is not None:
        ZhR_min, ZhR_max = z_bounds_shunt(s21_min_db, s21_max_db, Z0, Rs=Rs_plot)
        ZhR_min_arr = np.full_like(freqs, ZhR_min)
        ZhR_max_arr = np.full_like(freqs, ZhR_max)

    plt.figure(figsize=(11, 7.5))
    ax = plt.gca()
    ax.set_facecolor("#f7f7f7")

    # --- Área Series
    ax.fill_between(freqs, Zs_min_arr, Zs_max_arr, color="#2ca02c", alpha=0.30, label="2-port Series")
    ax.plot(freqs, Zs_min_arr, color="#145214", linewidth=2.8)
    ax.plot(freqs, Zs_max_arr, color="#145214", linewidth=2.8)

    # --- Área Shunt Rs=0
    ax.fill_between(freqs, Zh0_min_arr, Zh0_max_arr, color="#17becf", alpha=0.30, label="2-port Shunt (Rs=0)")
    ax.plot(freqs, Zh0_min_arr, color="#0b5f68", linewidth=2.8)
    ax.plot(freqs, Zh0_max_arr, color="#0b5f68", linewidth=2.8)

    # --- Área Shunt con Rs 
    if Rs_plot is not None:
        ax.fill_between(freqs, ZhR_min_arr, ZhR_max_arr, color="#d62728", alpha=0.22,
                        label=f"2-port Shunt (Rs={Rs_plot:.3g}Ω)")
        ax.plot(freqs, ZhR_min_arr, color="#7f1d1d", linewidth=2.8)
        ax.plot(freqs, ZhR_max_arr, color="#7f1d1d", linewidth=2.8)

    # --- DUTs coloreados por método
    for r in resultados:
        if r["tipo_code"] == "C":
            Z = Z_mag_real_C(freqs, r["valor_SI"], f0)
        else:
            Z = Z_mag_real_L(freqs, r["valor_SI"], f0)

        ax.plot(freqs, Z, color=color_por_modelo(r["modelo"]), linewidth=2.6,
                label=f"|Z(f)| {r['valor_str']}")

    # Estilo del gráfico
    ax.set_xscale("log")
    ax.set_yscale("log")

    # ticks: solo décadas etiquetadas 
    ax.xaxis.set_major_locator(LogLocator(base=10.0))
    ax.yaxis.set_major_locator(LogLocator(base=10.0))
    ax.xaxis.set_minor_locator(LogLocator(base=10.0, subs=np.arange(2, 10) * 0.1))
    ax.yaxis.set_minor_locator(LogLocator(base=10.0, subs=np.arange(2, 10) * 0.1))
    ax.xaxis.set_major_formatter(LogFormatterMathtext())
    ax.yaxis.set_major_formatter(LogFormatterMathtext())

    ax.grid(which="major", linestyle="-", linewidth=1.0, alpha=0.9)
    ax.grid(which="minor", linestyle=":", linewidth=0.7, alpha=0.8)

    for spine in ax.spines.values():
        spine.set_linewidth(2.4)

    ax.set_xlabel("Frequency (Hz)", fontsize=13, fontweight="bold")
    ax.set_ylabel("Impedance (Ohm)", fontsize=13, fontweight="bold")
    ax.set_title("SELECCIÓN DEL MODELO DE MEDICIÓN RF – Mapa + DUT",
                 fontsize=15, fontweight="bold", pad=12)

    ax.tick_params(axis='both', which='major', labelsize=11, width=2)
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_fontweight("bold")

    leg = ax.legend(loc="upper left", frameon=True, framealpha=0.95, fontsize=9)
    leg.get_frame().set_linewidth(1.6)

    plt.tight_layout()
    plt.show()


import io
import base64

def run_samm_analysis(fmin, fmax, f0, s21_min_db, s21_max_db, components, Z0=50.0):
    resultados = []
    for comp in components:
        tipo = comp['tipo'] # 'C' or 'L'
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
    
    # Generate plot and return as base64
    plot_base64 = generate_samm_plot_base64(resultados, fmin, fmax, f0, s21_min_db, s21_max_db, Z0)
    
    return {
        "resultados": resultados,
        "plot": plot_base64
    }

def generate_samm_plot_base64(resultados, fmin, fmax, f0, s21_min_db, s21_max_db, Z0):
    # Use non-interactive backend for matplotlib
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    
    # ... (existing plot logic, but saving to buffer instead of plt.show())
    # I'll need to adapt the existing plot_mapa_y_duts function
    pass

# MENÚ PRINCIPAL

if __name__ == "__main__":
    # Keeping the original main for local testing if needed, or just remove it
    pass
