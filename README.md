# RF Tool Suite

Plataforma web para ingeniería RF: calibración VNA, análisis de parámetros S, extracción de modelos compactos RLC, gestión de biblioteca de medidas y automatización de flujos de prueba.

**Stack:** Next.js 15 + FastAPI + scikit-rf + SQLite

---

## Herramientas incluidas

### Medida y captura
| Herramienta | Descripción |
|---|---|
| Calibración VNA | Asistente SOLT paso a paso para NanoVNA y VNA Agilent E5071C |
| Medición en Tiempo Real | Captura S11/S21 por USB/GPIB; exporta `.s2p` automáticamente |

### Análisis
| Herramienta | Descripción |
|---|---|
| Análisis S-param | Visualización interactiva de `.s1p`/`.s2p`: magnitud, fase, VSWR, carta de Smith; detecta marcadores RF automáticos (SRF, BW, Q, ESR) |
| Carta de Smith | Multi-traza interactiva con cursor, VSWR, RL, zoom y exportación PNG; asistente de matching network L-network integrado |
| TDR — Dominio Temporal | IFFT de S11(f) con ventana Kaiser; detecta discontinuidades de impedancia (open/short/inductivo/capacitivo) en líneas y cables |
| Comparación de Prototipos | Superpone múltiples `.s2p`, calcula media, σ y envolventes; tabla de estadísticas; exporta CSV |

### Modelado
| Herramienta | Descripción |
|---|---|
| Extractor Rápido C/L | Extracción inmediata de valor nominal C/L y SRF; modelo dispersivo (Rdc, Rskin, α, β); Q-factor |
| Modelo Compacto | Ajuste Foster RLC (modelo físico) o Vector Fitting racional; genera netlist SPICE/Laplace; exporta a KiCad, Qucs-S y ADS |
| De-embedding Open-Short | Elimina parásitos del fixture midiendo OPEN y SHORT; genera `.s2p` limpio del DUT |
| Frecuencia de Corte | Calcula Fc por mínima impedancia desde medidas S-param |
| Corrección Offline | Aplica corrección S-parameter con coeficientes de error externos (HP/Keysight) |

### Calculadoras RF
| Herramienta | Descripción |
|---|---|
| Línea de Transmisión | Longitud eléctrica, fase, impedancia, pérdidas |
| Impedancia de Cable | Estima Z0 y factor de velocidad (Vf) de cables coaxiales |
| SAMM | Calculadoras de presupuesto de enlace, pérdida de trayectoria, zona de Fresnel y conversión de potencia |

### Gestión y automatización
| Herramienta | Descripción |
|---|---|
| Biblioteca | Explorador de medidas con SQLite; historial de análisis por archivo; filtros por dispositivo/componente |
| Datasheets | Búsqueda y vinculación de hojas de datos a componentes medidos |
| Procesamiento en Lote | Extracción masiva de valores nominales o modelos compactos desde la biblioteca |
| Gestor de Proyectos | Empaqueta medidas, modelos e informes en un archivo `.rfproject` portátil |
| Informes IEEE | Genera informes HTML profesionales con gráficas, tablas y métricas automáticas; impresión a PDF desde el navegador |
| Secuenciador de Pruebas | Automatiza flujos con recetas de pasos configurables (load → extract → model → markers → BD → informe); streaming SSE en tiempo real |
| Dashboard | Estadísticas reales desde SQLite: medidas recientes, distribución por componente, calidad de medidas |

---

## Instalación

### Requisitos
- Python 3.10+
- Node.js 18+ y npm

### Backend (FastAPI)

```bash
cd Back-END
python -m venv .venv

# Windows
.\.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

El servidor arranca en `http://localhost:8080`.

### Frontend (Next.js)

```bash
cd Front-END
npm install
npm run dev
```

La app se sirve en `http://localhost:3000`.

---

## Estructura del proyecto

```
RF_Tool_Suite/
├── Back-END/
│   ├── main.py                 # FastAPI — todos los endpoints
│   ├── requirements.txt
│   └── logic/
│       ├── compact_models.py   # Foster RLC + Vector Fitting
│       ├── nominal_extraction.py
│       ├── markers.py          # Auto-detección de marcadores RF
│       ├── database.py         # SQLAlchemy + SQLite
│       ├── comparison.py       # Comparación multi-S2P
│       ├── eda_export.py       # Export KiCad / Qucs-S / ADS
│       ├── sequencer.py        # Motor de secuencias SSE
│       ├── matching_network.py # Solver L-network + E-series
│       ├── tdr.py              # Time Domain Reflectometry
│       ├── rfproject.py        # Proyectos .rfproject
│       ├── deembedding.py      # Open-Short de-embedding
│       ├── markers.py
│       ├── report_template.py  # Plantilla HTML IEEE
│       ├── s_params.py
│       └── vna.py              # Drivers NanoVNA + Agilent E5071C
│
├── Front-END/
│   └── src/app/
│       ├── App.tsx
│       ├── components/
│       │   ├── Dashboard.tsx
│       │   ├── SmithChartTool.tsx
│       │   └── tools/          # Una carpeta por herramienta
│       └── hooks/
│           └── useTools.ts
│
└── Biblioteca/                 # Datos locales (excluidos del repo)
    ├── Mediciones/
    ├── Calibraciones/
    ├── Informes/
    └── rf_suite.db
```

---

## Dispositivos soportados

- **NanoVNA** (v1, v2, SAA-2) — USB serial
- **Agilent / Keysight E5071C ENA** — GPIB/USB-GPIB (pyvisa)

---

## Licencia

Uso educativo y profesional en ingeniería de telecomunicaciones.
