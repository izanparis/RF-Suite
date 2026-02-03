# RF & Signal Integrity Suite

Una plataforma integral diseñada para ingenieros de Telecomunicaciones. Proporciona una interfaz web moderna para el análisis de parámetros S, extracción de modelos RLC, gestión de hardware NanoVNA y más.

## 🚀 Características Principales

- **Calibración VNA:** Asistente paso a paso para calibración SOLT (Short, Open, Load, Through).
- **Medición en Tiempo Real:** Captura de parámetros S11 y S21 directamente desde dispositivos NanoVNA.
- **Análisis de Parámetros S:** Visualización interactiva de archivos `.s2p` (Magnitud, Fase, VSWR y Carta de Smith).
- **Modelado RLC:** Extracción automática de parámetros R, L y C mediante ajuste de curvas.
- **Herramientas de RF:** Calculadoras de presupuesto de enlace, pérdida de trayectoria, zona de Fresnel y conversión de potencia.

## 🛠️ Stack Tecnológico

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React.
- **Backend:** FastAPI (Python 3), Scikit-RF, NumPy, SciPy, PySerial.

---

## 💻 Guía de Arranque

### 1. Requisitos Previos
- Python 3.10 o superior.
- Node.js (v18+) y npm.
- Git.

### 2. Configuración del Backend (Python)
Ve al directorio del backend y configura el entorno virtual:

```bash
cd Back-END
python -m venv .venv

# Activar en Windows:
.\.venv\Scripts\activate

# Instalar dependencias:
pip install -r requirements.txt
```

Para ejecutar el servidor:
```bash
python main.py
```

### 3. Configuración del Frontend (React)
Abre una nueva terminal en el directorio del frontend e instala las dependencias:

```bash
cd Front-END
npm install
```

Para ejecutar en modo desarrollo:
```bash
npm run dev
```

---

## 📦 Estructura del Proyecto

- `Back-END/`: Servidor FastAPI y lógica de procesamiento de RF (`logic/`).
- `Front-END/`: Aplicación React y componentes de UI (`src/`).
- `Back-END/legacy_scripts/`: Scripts originales de Python usados durante el desarrollo inicial.

## 📄 Licencia
Este proyecto es para uso educativo y profesional en el ámbito de la ingeniería electrónica.
