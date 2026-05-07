# Changelog - RF & Signal Integrity Suite

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
