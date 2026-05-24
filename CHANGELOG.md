# Changelog - RF & Signal Integrity Suite

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.7.0] - 2026-05-22

### Añadido
- **Biblioteca Avanzada para NanoVNA por Tipo de Componente**:
    - Selector de componente en la herramienta de medición NanoVNA: **Condensador**, **Bobina** y **Resistencia**.
    - Creación automática de subcarpetas por componente bajo cada equipo NanoVNA:
        - `Biblioteca/Mediciones/NanoVNA-*/Capacitores/`
        - `Biblioteca/Mediciones/NanoVNA-*/Inductores/`
        - `Biblioteca/Mediciones/NanoVNA-*/Resistencias/`
    - Generación automática de nombres normalizados para mediciones NanoVNA:
        - `cap_IDMEDICION_Dispositivo_Fmax.s1p/.s2p`
        - `ind_IDMEDICION_Dispositivo_Fmax.s1p/.s2p`
        - `res_IDMEDICION_Dispositivo_Fmax.s1p/.s2p`
- **Índice de Metadatos de Biblioteca**:
    - Nuevo archivo `Biblioteca/library_index.json` como índice portable de mediciones.
    - Indexado de metadatos: dispositivo, componente, ID de medición, ruta relativa, extensión, número de puertos, tamaño, fecha, puntos, `fmin`, `fmax`, origen, averaging y smoothing.
    - Reindexado completo desde la interfaz de Biblioteca mediante el botón **Reindexar**.
    - Nuevo endpoint backend `POST /api/library/index/rebuild` para reconstruir el índice desde el sistema de archivos.
- **Averaging y Smoothing en NanoVNA**:
    - Nuevos controles de usuario para configurar averaging y smoothing antes de capturar la medida.
    - El averaging promedia capturas complejas RI completas.
    - El smoothing aplica media móvil centrada sobre las partes real e imaginaria antes de generar Touchstone.
- **Documentación Técnica**:
    - Nuevo documento en inglés `Documentación/NANOVNA_LIBRARY_INDEX.md` con arquitectura, estructura de carpetas, endpoints, ejemplos JSON/código, flujo de datos y checklist de mantenimiento.
- **Buscador y Gestor de Datasheets**:
    - Nueva herramienta **Datasheets** para buscar hojas de datos por referencia de componente.
    - Integración inicial con Mouser mediante `MOUSER_API_KEY` o clave guardada localmente desde la propia herramienta.
    - Nuevos endpoints de configuración `GET /api/datasheets/providers` y `POST /api/datasheets/providers/mouser`.
    - La clave local se almacena en `Biblioteca/config/datasheet_providers.json`, excluida de Git mediante `.gitignore`.
    - La búsqueda Mouser ahora prueba primero el endpoint específico de número de pieza (`partnumber`) y después hace fallback a búsqueda por palabra clave (`keyword`).
    - Descarga de PDFs a `Biblioteca/Datasheets/{proveedor}/` mediante `POST /api/datasheets/download`.
    - Modo manual por URL para descargar y fijar datasheets sin depender de una API externa.
    - Asociación del datasheet descargado a una medición del índice mediante metadatos persistentes.
    - Nuevo flujo **Completar datos desde Mouser** para rellenar fabricante, referencia, valor nominal, tolerancia, encapsulado, disponibilidad y estado de ciclo de vida directamente desde resultados de la API, incluso cuando no hay PDF descargable.
    - Extracción heurística mejorada de datos del componente desde el PDF (`POST /api/datasheets/extract-metadata`) usando `pypdf`, combinando texto del PDF, descripción del distribuidor y referencia de fabricante.
    - Edición manual de metadatos del componente: fabricante, referencia, valor nominal, tolerancia, tensión, corriente, potencia, temperatura, encapsulado, material/dieléctrico, rango de funcionamiento y notas.
    - Nuevas acciones de Biblioteca para desanclar el datasheet de una medición y borrar los valores de componente extraídos.

### Cambiado
- **Herramienta Biblioteca**:
    - Nuevo filtro por componente para mediciones NanoVNA.
    - Nueva columna de metadatos con rango de frecuencia, número de puntos, averaging y smoothing.
    - La búsqueda ahora contempla tanto el nombre de archivo como el `measurement_id` indexado.
    - Nuevo icono de datasheet en las acciones de cada medición para abrir directamente el PDF asociado.
    - La columna de metadatos muestra ahora valores extraídos desde datasheets/Mouser como fabricante, referencia, valor nominal, tolerancia, encapsulado, material, disponibilidad y ciclo de vida.
    - Los resultados de Mouser ya no se ocultan cuando no incluyen URL de datasheet; la interfaz diferencia entre componente encontrado sin PDF y resultado descargable.
    - La herramienta Datasheets se compactó integrando URL manual y búsqueda en un mismo panel, añadiendo una guía rápida y plegando la configuración de API key cuando ya está configurada.
- **Análisis de Parámetros S**:
    - El selector de mediciones del servidor ahora soporta filtrado por componente.
    - La apertura de una medición desde Biblioteca conserva el componente seleccionado para resolver correctamente archivos guardados en subcarpetas.
- **Compatibilidad con Mediciones Históricas**:
    - El indexador infiere componentes desde nombres antiguos con prefijos `cap_`, `ind_` y `res_`, incluso si aún no están movidos a las nuevas carpetas.
- **Índice de Biblioteca**:
    - El reindexado preserva metadatos enriquecidos como datasheets fijados, calibración, averaging y smoothing cuando el archivo de medición sigue existiendo.
    - El reindexado preserva también `component_metadata`, permitiendo que los datos editados o extraídos desde datasheets sobrevivan a reconstrucciones del índice.

### Fijo
- **Trazabilidad de Guardado NanoVNA**:
    - El guardado automático y el guardado manual actualizan el índice de biblioteca inmediatamente.
    - Al eliminar mediciones desde la Biblioteca, la entrada correspondiente también se elimina de `library_index.json`.
- **Aislamiento Multi-VNA**:
    - Las nuevas opciones de componente, averaging y smoothing se aplican solo a NanoVNA; el flujo HP8752A mantiene su comportamiento previo.
- **Apertura de Datasheets**:
    - El endpoint de PDF sirve los datasheets guardados en modo `inline`, evitando que el botón de Biblioteca dispare una descarga en vez de abrir el archivo.

## [1.6.1] - 2026-05-18

### Añadido
- **Documentación Técnica en Inglés**:
    - `HP8752A_1PORT_CALIBRATION.md`: Guía detallada sobre el procedimiento de calibración de 1 puerto (S11).
    - `HP8752A_RESPONSE_ISOLATION_CALIBRATION.md`: Guía sobre el procedimiento de calibración Response & Isolation (RAI).
- **Consistencia de Archivos**: Los archivos JSON ahora guardan metadatos explícitos (`CALIS111` o `CALIRAI`) para garantizar restauraciones sin errores.

### Cambiado
- **Refactorización de Herramientas**:
    - `calibracion_2Ports_HP8752A.ipynb`: Actualizado para el flujo **Response & Isolation** (CALIRAI) con secuencias de comandos blindadas y exportación de 2 arrays.
- **Limpieza Profunda de `vna.py`**:
    - Eliminación de mnemónicos redundantes y modos no utilizados (`CALIRESP` legacy, `CALIFUL2`).
    - Eliminación de bloques de código comentados y esperas manuales innecesarias.
    - Especialización del driver HP 8752A exclusivamente para modos S11 (3 arrays) y RAI (2 arrays).

## [1.6.0] - 2026-05-18

### Añadido
- **Nueva Calibración "2-Ports" para HP 8752A**:
    - Implementación del procedimiento **One-Path 2-Port** (OPEN, SHORT, LOAD, THRU).
    - **Interfaz No Secuencial**: Nueva cuadrícula de botones que permite medir los estándares en cualquier orden, mejorando la flexibilidad en el laboratorio.
    - **Validación por Hardware**: El sistema ahora consulta directamente al VNA el estado de los estándares medidos antes de permitir el cálculo final.
    - **Botón "COMPUTING"**: Automatización de la fase final de cálculo de coeficientes (`DONE`) y activación de corrección (`SAVC`).
- **Herramientas Standalone (Notebooks)**:
    - `calibracion_S11_HP8752A.ipynb`: Herramienta profesional para calibración manual paso a paso con instrucciones detalladas y función de Reset.
    - `medicion_completa_S11_standalone.ipynb`: Workflow independiente para restauración de calibraciones, captura sincronizada de datos y exportación a Touchstone (.s1p).

### Fijo (Fixed)
- **Sincronización Crítica (VI_ERROR_TMO)**: 
    - Implementación de sincronización con prefijo **`OPC?;`** para todos los comandos de barrido y cálculo, eliminando los bloqueos del bus GPIB y errores de timeout.
    - Uso del modo **`HOLD`** durante transferencias masivas de datos para estabilizar el procesador del VNA.
- **Errores de Sintaxis y Bloques**:
    - Corrección del mnemónico de calibración a **`CALIS111`** (Port 1) según el manual de programación (p. 189).
    - Resolución del **`BLOCK INPUT ERROR`** (error 34) mediante el uso estricto de comas como separadores ASCII y eliminación de espacios en comandos `INPUCALC`.
    - Limpieza automática de saltos de línea (`\n`) en arrays de datos para evitar terminaciones prematuras de comandos.
- **Precisión de Frecuencia**:
    - Uso de unidades explícitas **`HZ`** y notación científica en comandos `STAR` y `STOP`, garantizando que configuraciones como 300 kHz se apliquen correctamente sin redondeos a 1 MHz.
    - Sincronización de exportación: El sistema ahora lee las frecuencias reales del hardware antes de generar el archivo JSON de calibración.

### Cambiado
- **Protocolo de Comunicación**: Eliminación de terminadores software (`\n`) en favor de la línea física **EOI** del bus GPIB, alineando el driver con el estándar IEEE-488 de los equipos HP Legacy.
- **Estabilidad de UI**: Optimización de la carga de librerías en Notebooks para evitar congelamientos del Kernel durante la inicialización de PyVISA y Matplotlib.

## [1.5.2] - 2026-05-11

### Añadido
- **Exportación Robusta de Calibración HP 8752A**:
    - **Captura Multi-Array**: Implementación de la descarga secuencial de los 3 arrays de coeficientes de error (`OUTPCALC01`, `02`, `03`) necesarios para una calibración S11 de 1 puerto.
    - **Gestión de ASCII (FORM4)**: Optimización de la transferencia de datos en formato de texto con retardos de seguridad de 4s por array, garantizando la integridad de los datos en el buffer de salida del VNA.
    - **Persistencia Completa**: Los coeficientes ahora se guardan íntegramente en el estado JSON, permitiendo su restauración posterior mediante `INPUCALC` sin pérdida de precisión.
- **Optimización de Calibración HP 8752A**:
    - **Paso "Compute" Explícito**: Separación del proceso de medición de estándares del cálculo final de coeficientes para evitar saturación del procesador del instrumento.
    - **Limpieza Automática de Pantalla**: Envío del comando `TITL ""` antes de cualquier operación de guardado, resolviendo el error de sintaxis ("Syntax Error") causado por el modo de etiquetado del VNA.
    - **Sondeo por Status Byte (`read_stb`)**: Sustitución de consultas `OPC?` por lecturas de hardware de bajo nivel, garantizando una sincronización "ciega" y robusta incluso si el equipo no responde a consultas de texto.
    - **Reset de Emergencia Blindado**: Mejora del botón **RESET VNA** para ejecutar un `Device Clear` de GPIB seguido de un `Preset`, permitiendo recuperar el control del equipo sin necesidad de reinicio físico.
    - **Secuencia LOAD-STANB**: Automatización del sub-menú "BROADBAND" en el paso de carga, permitiendo que el flujo de calibración sea 100% desatendido desde la PC.

### Cambiado
- **Robustez de Comunicación**: Incremento de delays estratégicos (hasta 2s) y timeouts adaptativos para comandos críticos como `DONE` y `SAV1`, adaptándose a la velocidad de escritura en memoria de los equipos HP Legacy.
- **Flujo de UI**: Actualización de la herramienta de calibración para guiar al usuario a través de los nuevos pasos de "Cálculo" y "Guardado" con instrucciones contextuales.

## [1.5.1] - 2026-05-11

### Añadido
- **Integración Verificada HP-8752A + Agilent 82357**:
    - Validación completa de la cadena de comunicación utilizando el adaptador **Agilent 82357 USB-GPIB**.
    - Implementación de carga forzada de la librería **Keysight VISA** (`ktvisa/ktbin/visa32.dll`) para resolver conflictos con NI-VISA.
    - Optimización de protocolos de lectura: Uso del comando legacy `ID?` y desactivación de terminadores de software en favor del flag de hardware **EOI** (End or Identify).
    - Ajuste de **timeouts adaptativos** (hasta 30s) y delays de sincronización explícitos para garantizar la integridad de los datos en barridos de alta resolución.
    - Soporte para el modo **Talker/Listener** del instrumento, evitando conflictos de bus en configuraciones de PC-Controller.

### Cambiado
- **Motor de Conexión VISA**: Refactorización de `Back-END/logic/vna.py` para priorizar el backend de Keysight cuando se detecta el hardware de Agilent.
- **Robustez en la Captura de Datos**: Mejora del método `get_data` para el HP-8752A, incluyendo resets de estado (`PRES`) y esperas de barrido controladas para evitar errores de timeout durante la transferencia de grandes volúmenes de puntos complejos.

### Eliminado
- Scripts temporales de diagnóstico y herramientas de depuración de bajo nivel utilizados durante la fase de puesta en marcha.

---

## [1.5.0] - 2026-05-08


## [1.4.0] - 2026-05-07

### Añadido
- **Nueva Herramienta "Biblioteca"**:
    - Interfaz profesional estilo explorador de archivos para gestionar mediciones, calibraciones y extracciones.
    - **Modo Directorio**: Tabla detallada con nombres, dispositivos asociados, tamaños y fechas de modificación.
    - **Filtro de Dispositivo (VNA)**: Selector integrado para filtrar archivos por equipo de medida (ej: NanoVNA-Izan, LAB1, LAB2).
    - **Acciones Rápidas**:
        - **Abrir Ubicación**: Apertura nativa de la carpeta contenedora en el explorador de archivos del sistema operativo (Windows Explorer/macOS Finder).
        - **Análisis Instantáneo**: Acceso directo a la herramienta de Análisis S2P precargando el archivo seleccionado.
        - **Gestión de Archivos**: Eliminación física de archivos con diálogo de confirmación desde la propia web.
- **API de Gestión de Archivos**: Nuevos endpoints en el backend para listado consolidado, apertura de carpetas y borrado seguro de archivos.
- **Pre-carga de Análisis**: Capacidad de la herramienta de Análisis S-Params para recibir archivos iniciales desde otras herramientas, automatizando el flujo de trabajo.

### Cambiado
- **Refactorización de Rutas**: Normalización de la estructura de la biblioteca bajo una jerarquía coherente `Biblioteca/{Tipo}/{Dispositivo}` en el servidor.
- **UI de Análisis S2P**: Mejora en el selector de mediciones del servidor para ser más consistente con el nuevo sistema de biblioteca.

---

## [1.3.0] - 2026-05-07

### Añadido
- **Internacionalización (i18n)**: Implementación de soporte multi-idioma completo (Español e Inglés) a través de un `LanguageProvider` y hook `useLanguage`.
- **Calculadora de Líneas de Transmisión**: Nueva herramienta para el cálculo de impedancia característica y parámetros físicos de líneas Microstrip y Coaxiales.
- **Herramienta de Impedancia de Cable**: Cálculo de $Z_0$, Factor de Velocidad ($V_f$) y parámetros RLC distribuidos basados en dimensiones y materiales del dieléctrico.
- **Análisis de Frecuencia de Corte**: Nueva funcionalidad en el backend y frontend para detectar automáticamente puntos de mínima/máxima transmisión en componentes.
- **Modo Oscuro/Claro**: Soporte nativo para temas visuales con persistencia y switch manual.
- **Sistema de Marcadores Interactivos**: En la herramienta de Análisis S2P, ahora se pueden colocar hasta 5 marcadores en los gráficos dinámicos, con un panel de datos flotante y arrastrable.
- **Scripts de Automatización**: Adición de `update_app.ps1` para facilitar el despliegue y actualización de la suite.

### Cambiado
- **Refactorización de UI/UX**:
    - Navegación renovada mediante un **Sidebar colapsable** y un **Dashboard principal** con tarjetas descriptivas.
    - Uso de `framer-motion` para animaciones y transiciones suaves entre herramientas.
    - Mejora de la legibilidad en pantallas de alta resolución y dispositivos móviles.
- **Gráficos Dinámicos**: Migración de plots estáticos (Matplotlib) a gráficos interactivos con **Recharts** para Magnitud, Fase, VSWR e Impedancia.
- **Gestión de Archivos**: Organización jerárquica de calibraciones y mediciones por dispositivo (NanoVNA-Izan, LAB1, LAB2) con selectores integrados en las herramientas.
- **Robustez del Backend**: Mejora en el manejo de conexiones serie con el NanoVNA, incluyendo limpieza de buffers y timeouts adaptativos para evitar bloqueos.

### Fijo (Fixed)
- **Sincronización de Calibración**: Corregido el error de "arrastre" de puntos de frecuencia al cargar calibraciones guardadas con diferentes resoluciones.
- **Visualización de Unidades**: Ajuste de las escalas de frecuencia para mostrar siempre MHz/GHz de forma coherente según el rango.

---

## [1.2.0] - 2026-04-28

### Añadido
- **Ajuste de 2 Polos (Vector Fitting)**: Implementación de ajuste avanzado por polos complejos en la herramienta RLC, permitiendo modelar componentes con resonancias múltiples o comportamiento de banda ancha.
- **Documentación Técnica Detallada**: Creación de `DOCUMENTACION_COMPLETA.md` que explica la arquitectura, modelos matemáticos (RLC, Vector Fitting, Shunt) y flujos de trabajo del sistema.

### Cambiado
- **Refactorización de Modelo RLC**: 
    - Interfaz simplificada centrada exclusivamente en el modo de medición **Shunt (Paralelo)**.
    - Restricción de topologías a **RLC Serie** y **Ajuste 2 Polos** para un flujo de trabajo más quirúrgico.
    - Eliminación del parámetro **Z0** manual; el sistema ahora utiliza la impedancia de referencia intrínseca del archivo Touchstone.
    - **Precisión Quirúrgica**: Mejora drástica del ajuste RLC Serie mediante interpolación parabólica para "clavar" el pico de resonancia (f0 y ESR) y un sistema de pesos de 50x en el valle de resonancia.
- **Mejoras en Frecuencia de Corte**: 
    - Soporte dual para **Condensadores** (búsqueda de mínimo S21) e **Inductores** (búsqueda de máximo S21) con selector de tipo de componente.
    - Actualización de los endpoints del backend para soportar parámetros de búsqueda dinámica (`min`/`max`).

### Eliminado
- **Módulo de De-embedding**: Retirado del flujo principal para su rediseño futuro.
- **Entrada manual de Z0**: Simplificación del proceso de análisis RLC eliminando redundancias de configuración.

---

## [1.1.0] - 2026-04-27

### Añadido
- **Nueva Herramienta de Impedancia de Cable**: Calculadora para cables coaxiales que permite obtener Z0, Factor de Velocidad, Capacitancia e Inductancia distribuida y frecuencia de corte (f_c) basada en dimensiones físicas.
- **Gestión Multi-Dispositivo**: Estructura de carpetas jerárquica para `Calibraciones/` y `Mediciones/` organizada por dispositivos (NanoVNA-Izan, LAB1, LAB2).
- **Carga Automática de Parámetros**: El sistema ahora extrae automáticamente $f_{min}$, $f_{max}$ y el número de puntos al cargar un archivo de calibración (.cal), tanto desde la biblioteca como mediante Drag & Drop local.
- **Documentación de Versiones**: Creación de este archivo `CHANGELOG.md` para el seguimiento del desarrollo.

### Cambiado
- **Interfaz de Medición**: Los campos de frecuencia y puntos ahora son de "solo lectura" para garantizar la coherencia absoluta con la calibración cargada. Se ha optimizado el diseño visual de estos campos para asegurar que las unidades de frecuencia sean legibles en todo momento.
- **Mejoras en Calibración**: Adición de un panel lateral con las especificaciones técnicas del hardware (rango 50kHz-3GHz, 1024 pts) y un recordatorio de los pasos SOLT.
- **Mejoras en Frecuencia de Corte**: Integración de un gráfico dinámico (Recharts) que muestra la curva de Magnitud S21 y marca visualmente el punto de frecuencia de corte detectado.
- **Selectores de Dispositivo**: Integración de selectores de VNA en las herramientas de Calibración, Medición, Análisis y Frecuencia de Corte para filtrar archivos por equipo.

### Fixed (Errores Corregidos)
- **Acumulación de Puntos en Calibración**: Corregido el bug donde el buffer serie no se limpiaba, causando que las calibraciones tuvieran más de 1000 puntos (concatenación de datos).
- **Límite de Hardware**: Implementada restricción de seguridad a 1024 puntos para evitar bloqueos en modelos NanoVNA V2/SAA-2.
- **Sincronización de Puerto Serie**: Añadidos delays de seguridad y reseteo de buffers de entrada/salida para mejorar la estabilidad en conexiones USB-Serie con chips Cypress.

---

## [1.0.0] - 2026-02-02
### Añadido
- Versión inicial de la suite con soporte para S-Parameters, RLC Fitting y calibración SOLT básica.
