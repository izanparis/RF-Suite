# RF & Signal Integrity Suite - Documentación Técnica Completa

## 1. Introducción
La **RF & Signal Integrity Suite** es una plataforma de software integrada diseñada para ingenieros de radiofrecuencia (RF) y especialistas en integridad de señal (SI). El ecosistema permite realizar desde la captura directa de datos de hardware (NanoVNA) hasta el modelado avanzado de componentes mediante circuitos equivalentes SPICE.

Esta suite resuelve el problema de la caracterización precisa de componentes pasivos (condensadores, inductores) y líneas de transmisión, eliminando la necesidad de herramientas de post-procesado manuales y propensas a errores.

---

## 2. Arquitectura del Sistema

La aplicación adopta un modelo de **Microservicio Local Híbrido**, permitiendo su uso como aplicación web estándar o como ejecutable de escritorio.

### A. Estructura de Capas
1.  **Capa de Presentación (Front-END):** React 18 + TS, Hooks (`useTools`), Recharts y Matplotlib (Base64).
2.  **Capa de Lógica y API (Back-END):** FastAPI (Python 3.10+), `scikit-rf`, `SciPy`, `NumPy`.
3.  **Capa de Hardware:** Protocolos NanoVNA-H/F via PySerial.

---

## 3. Implementación y Código Core

### 3.1. Calibración y Medición (SOLT)
La suite utiliza la librería `pynanovna` para interactuar con el hardware. El proceso de calibración sigue el estándar de 12 términos.

```python
# Ejemplo de flujo de calibración en Back-END/logic/vna.py
def calibrate_step(vna, step: str):
    # step puede ser: 'short', 'open', 'load', 'through'
    vna.calibration_step(step)
    return {"status": f"Step {step} completed"}

def finalize_calibration(vna):
    vna.calibrate() # Procesa los pasos acumulados
    vna.save_calibration("session.cal")
```

### 3.2. Extracción de Parámetros RLC
El motor de extracción utiliza optimización no lineal para ajustar un modelo circuital a la medida de impedancia real.

```python
# Lógica de ajuste en Back-END/logic/rlc_extraction.py
from scipy.optimize import least_squares

def Z_rlc_model(w, R, L, C):
    """Modelo circuital de impedancia serie."""
    return R + 1j * w * L + 1.0 / (1j * w * C)

def residuo(p, w, Z_meas, weights):
    R, L, C = p
    Z_sim = Z_rlc_model(w, R, L, C)
    # Error normalizado y pesado por importancia (frecuencia de resonancia)
    diff = (Z_sim - Z_meas) / np.abs(Z_meas)
    return np.concatenate([np.real(diff), np.imag(diff)]) * weights

# Ejecución del optimizador
res = least_squares(residuo, x0=[R0, L0, C0], bounds=(lb, ub), method='trf')
R_final, L_final, C_final = res.x
```

### 3.3. TDR Sintético (Time Domain Reflectometry)
Para localizar fallos en cables, se aplica una IFFT sobre el coeficiente de reflexión $S_{11}$.

```python
# Lógica de TDR en Back-END/logic/tdr.py
def run_tdr(freqs, s11, window_type='hann'):
    # 1. Ventaneo para reducir ringing (Gibbs)
    window = np.hanning(len(s11))
    s11_windowed = s11 * window
    
    # 2. Transformada Inversa de Fourier
    impulse_response = np.fft.irfft(s11_windowed)
    
    # 3. Integración para obtener Step Response (Escalón)
    step_response = np.cumsum(impulse_response)
    
    # 4. Conversión a Impedancia
    rho = step_response
    z_profile = Z0 * (1 + rho) / (1 - rho)
    return z_profile
```

### 3.4. SAMM (Planificación de Medida)
SAMM calcula automáticamente el mejor modelo de medida basándose en la impedancia esperada del componente.

```python
# Lógica SAMM en Back-END/logic/samm.py
def seleccionar_modelo(Z_min, Z_max, Z0=50):
    # Si la impedancia es muy baja, Shunt es mejor.
    # Si es muy alta, Series es mejor.
    if Z_max < Z0:
        return "2-port Shunt"
    elif Z_min > Z0:
        return "2-port Series"
    else:
        return "Medida dividida o Shunt con Rs"
```

---

## 4. Modelos Matemáticos Avanzados

### Ajuste de N-Polos (Vector Fitting)
Para componentes que presentan múltiples resonancias (ej. ferritas o condensadores de desacoplo de banda ancha), se utiliza Vector Fitting para aproximar la función de transferencia:
$$ H(s) = d + s \cdot e + \sum_{n=1}^{N} \frac{c_n}{s - a_n} $$

### Conversión de Matrices (ABCD)
Para extraer la impedancia de un componente en derivación (Shunt) sin incluir los efectos de la línea de transmisión, se utilizan matrices ABCD:
$$ \begin{bmatrix} A & B \\ C & D \end{bmatrix}_{total} = \begin{bmatrix} 1 & 0 \\ Y & 1 \end{bmatrix} \implies Y = C_{total} $$

---

## 5. Flujo de Trabajo Profesional Recomendado

1.  **Fase de Planificación:** Usar **SAMM** para determinar la topología de medida (Serie vs Shunt).
2.  **Preparación:** Calibrar el NanoVNA usando el asistente **SOLT**.
3.  **Captura:** Realizar la medición del DUT y guardarla como `.s2p`.
4.  **Modelado:** Ejecutar **RLC Extraction** para obtener el modelo equivalente y el archivo `.lib` para SPICE.
5.  **Documentación:** Exportar el paquete ZIP con reportes y gráficos.

---

## 6. Guía para Desarrolladores

### Cómo añadir una nueva herramienta
1.  **Backend:** Crear un nuevo módulo en `Back-END/logic/` y registrar el endpoint en `main.py`.
2.  **Frontend:** Crear el componente visual en `Front-END/src/app/components/tools/`.
3.  **Integración:** Añadir el ID de la herramienta en `Front-END/src/app/hooks/useTools.ts`.

---

