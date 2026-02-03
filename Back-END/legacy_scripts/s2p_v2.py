# -*- coding: utf-8 -*-
# -------------------------------------------------------------
#  Medición única de parámetros S usando vna.stream()
#  Carga calibración desde explorador + export CSV + gráficas
#  Guarda los archivos en ./exports/
#  Autor: Izan París Marcos - TFG 2025
# -------------------------------------------------------------

import pynanovna
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import skrf as rf
import os
from tkinter import Tk, filedialog

# ==============================================================
# Funciones auxiliares
# ==============================================================

def parse_complex_array(arr):
    """Convierte un array de números complejos en texto (real, imag)."""
    return [f"({v.real:.6f},{v.imag:.6f})" for v in arr]

# ==============================================================
# Flujo principal
# ==============================================================

def main():
    print("=" * 60)
    print("   MEDICIÓN DIRECTA CON NANOVNA (stream → CSV + plots)")
    print("=" * 60)

    # 1️⃣ Conectar con el NanoVNA
    print("📡 Conectando con NanoVNA...")
    vna = pynanovna.VNA()
    if not vna.is_connected():
        print("❌ No se detectó el NanoVNA. Conéctalo por USB y vuelve a intentar.")
        return
    print("✅ Conexión establecida correctamente.")

    # 2️⃣ Seleccionar archivo de calibración desde explorador
    print("\n📁 Selecciona el archivo de calibración (.cal)")
    root = Tk()
    root.withdraw()  # Oculta la ventana principal
    root.attributes("-topmost", True)  # Asegura que el diálogo aparezca arriba
    cal_path = filedialog.askopenfilename(
        title="Seleccionar archivo de calibración",
        filetypes=[("Archivos de calibración", "*.cal"), ("Todos los archivos", "*.*")]
    )

    if cal_path:
        try:
            vna.load_calibration(cal_path)
            print(f"✅ Calibración cargada: {os.path.basename(cal_path)}")
        except Exception as e:
            print(f"⚠️ No se pudo cargar la calibración: {e}")
    else:
        print("⚠️ No se seleccionó ningún archivo de calibración.")

    # 3️⃣ Configurar barrido
    try:
        start_mhz = float(input("\nFrecuencia inicial [MHz]: "))
        stop_mhz = float(input("Frecuencia final [MHz]: "))
        points = int(input("Número de puntos: "))
    except ValueError:
        print("❌ Error: introduce valores numéricos válidos.")
        return

    vna.set_sweep(start_mhz * 1e6, stop_mhz * 1e6, points)
    print(f"✅ Barrido configurado de {start_mhz:.1f} a {stop_mhz:.1f} MHz con {points} puntos.")

    # 4️⃣ Medir usando stream()
    input("\n🔌 Conecta el DUT y pulsa ENTER para comenzar la medición...")
    print("📊 Adquiriendo datos...")
    stream = vna.stream()
    s11, s21, freqs = next(stream)  # ← una sola adquisición

    print(f"✅ Datos recibidos ({len(freqs)} puntos).")
    print(f"📡 Rango de frecuencia: {freqs[0]/1e6:.2f} - {freqs[-1]/1e6:.2f} MHz")

    # 5️⃣ Crear carpeta de exportación
    export_dir = os.path.join(os.getcwd(), "exports")
    os.makedirs(export_dir, exist_ok=True)

    # 6️⃣ Exportar a CSV
    out_name = input("\n💾 Nombre del archivo de salida (sin extensión): ").strip() or "medicion"
    csv_file = os.path.join(export_dir, f"{out_name}.csv")

    df = pd.DataFrame({
        "Freq_Hz": freqs,
        "S11": parse_complex_array(s11),
        "S21": parse_complex_array(s21)
    })
    df.to_csv(csv_file, index=False)

    print(f"✅ Datos exportados correctamente a: {csv_file}")

    # 7️⃣ Graficar resultados
    print("\n📈 Generando gráficas...")

    s11_db = 20 * np.log10(np.maximum(np.abs(s11), 1e-12))
    s21_db = 20 * np.log10(np.maximum(np.abs(s21), 1e-12))
    s11_phase = np.angle(s11, deg=True)
    s21_phase = np.angle(s21, deg=True)
    freq_mhz = freqs / 1e6

    # --- Magnitud (dB)
    plt.figure(figsize=(10, 5))
    plt.plot(freq_mhz, s11_db, label='S11 (dB)', linewidth=1.8)
    plt.plot(freq_mhz, s21_db, label='S21 (dB)', linewidth=1.8)
    plt.title('Parámetros S - Magnitud (dB)')
    plt.xlabel('Frecuencia (MHz)')
    plt.ylabel('Magnitud (dB)')
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.show()

    # --- Fase (grados)
    plt.figure(figsize=(10, 5))
    plt.plot(freq_mhz, s11_phase, label='S11 (°)', linewidth=1.8)
    plt.plot(freq_mhz, s21_phase, label='S21 (°)', linewidth=1.8)
    plt.title('Parámetros S - Fase (grados)')
    plt.xlabel('Frecuencia (MHz)')
    plt.ylabel('Fase (°)')
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.show()

    # --- Diagrama de Smith (S11)
    freq_obj = rf.Frequency.from_f(freqs, unit='Hz')
    s_matrix = np.zeros((len(freqs), 2, 2), dtype=complex)
    s_matrix[:, 0, 0] = s11
    s_matrix[:, 1, 1] = s11
    ntw = rf.Network(frequency=freq_obj, s=s_matrix)

    plt.figure(figsize=(7, 7))
    ntw.plot_s_smith(m=0, n=0, label='S11')
    plt.title('Diagrama de Smith (S11)')
    plt.legend()
    plt.tight_layout()
    plt.show()

    print("✅ Gráficas generadas correctamente.")
    print(f"\n🎯 Proceso completado. Archivo guardado en:\n   {csv_file}")


if __name__ == "__main__":
    main()
