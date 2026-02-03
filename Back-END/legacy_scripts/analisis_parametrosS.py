# -*- coding: utf-8 -*-
# -------------------------------------------------------------
#  Graficar parámetros S desde un CSV con datos complejos
#  Columnas esperadas: Freq_Hz, S11, S21
#  Selección de archivo mediante explorador de archivos
#  Autor: Izan París Marcos - TFG 2025
# -------------------------------------------------------------

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os
from tkinter import Tk, filedialog

# =============================================================
# 1. Seleccionar archivo CSV mediante explorador
# =============================================================
print("=" * 60)
print("      ANÁLISIS DE PARÁMETROS S DESDE ARCHIVO CSV")
print("=" * 60)

root = Tk()
root.withdraw()  # Ocultar ventana principal
root.attributes("-topmost", True)  # Mostrar el diálogo al frente
filename = filedialog.askopenfilename(
    title="Seleccionar archivo CSV de medición",
    filetypes=[("Archivos CSV", "*.csv"), ("Todos los archivos", "*.*")]
)

if not filename:
    print("❌ No se seleccionó ningún archivo. Saliendo...")
    exit()

print(f"✅ Archivo seleccionado: {os.path.basename(filename)}")

# =============================================================
# 2. Leer archivo CSV
# =============================================================
try:
    df = pd.read_csv(filename)
except Exception as e:
    print(f"❌ Error leyendo el archivo: {e}")
    exit()

print(f"📏 Puntos: {len(df)}")
print(f"📋 Columnas: {df.columns.tolist()}")

# =============================================================
# 3. Verificar columnas necesarias
# =============================================================
expected_cols = ['s11', 's21', 'freq_hz']
cols = [c.lower().strip() for c in df.columns]

if not all(col in cols for col in expected_cols):
    print("❌ El archivo no contiene las columnas esperadas: 'S11', 'S21', 'Freq_Hz'")
    exit()

df.columns = cols  # normaliza nombres

# =============================================================
# 4. Convertir valores complejos desde texto "(real, imag)"
# =============================================================
def parse_complex(val):
    try:
        if isinstance(val, complex):
            return val
        if isinstance(val, str):
            s = val.strip().replace(' ', '')
            if s.startswith('(') and s.endswith(')'):
                s = s[1:-1]
            parts = s.split(',')
            if len(parts) == 2:
                return complex(float(parts[0]), float(parts[1]))
        return complex(val)
    except:
        return complex(0, 0)

df['S11'] = [parse_complex(v) for v in df['s11']]
df['S21'] = [parse_complex(v) for v in df['s21']]
freq_hz = df['freq_hz'].to_numpy()
freq_mhz = freq_hz / 1e6

# =============================================================
# 5. Calcular magnitud, fase y dB
# =============================================================
eps = 1e-12
S11_mag = np.abs(df['S11'])
S21_mag = np.abs(df['S21'])
S11_dB = 20 * np.log10(np.maximum(S11_mag, eps))
S21_dB = 20 * np.log10(np.maximum(S21_mag, eps))
S11_phase = np.angle(df['S11'], deg=True)
S21_phase = np.angle(df['S21'], deg=True)

# =============================================================
# 6. Graficar
# =============================================================
plt.figure(figsize=(10, 5))
plt.plot(freq_mhz, S11_dB, label='S11 (dB)')
plt.plot(freq_mhz, S21_dB, label='S21 (dB)')
plt.title('Parámetros S - Magnitud en dB')
plt.xlabel('Frecuencia (MHz)')
plt.ylabel('Magnitud (dB)')
plt.grid(True, alpha=0.3)
plt.legend()
plt.tight_layout()
plt.show()

plt.figure(figsize=(10, 5))
plt.plot(freq_mhz, S11_phase, label='S11 (°)')
plt.plot(freq_mhz, S21_phase, label='S21 (°)')
plt.title('Parámetros S - Fase (grados)')
plt.xlabel('Frecuencia (MHz)')
plt.ylabel('Fase (°)')
plt.grid(True, alpha=0.3)
plt.legend()
plt.tight_layout()
plt.show()

print("✅ Gráficas mostradas correctamente.")
