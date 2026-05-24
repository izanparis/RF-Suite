# RF Tool Suite Desktop

La aplicacion desktop usa Electron como shell, React/Vite como interfaz y el backend FastAPI local en `127.0.0.1:8080`.

## Desarrollo

```bash
npm install
npm run dev:desktop
```

`dev:desktop` arranca Vite, abre Electron y deja que el proceso principal lance `Back-END/main.py`.

## Build

```bash
npm run build
```

Genera el frontend en `dist`.

## Paquete desktop

```bash
npm run package:desktop:dir
```

Genera una carpeta ejecutable en `release/win-unpacked`. Antes compila el backend FastAPI como ejecutable standalone con PyInstaller.

```bash
npm run package:desktop
```

Genera los artefactos configurados por `electron-builder`.

Para regenerar solo la interfaz usando un backend ya compilado:

```bash
npm run package:desktop:ui-only
```

## Notas actuales

- En desarrollo, Electron usa el Python disponible en el sistema (`python` en Windows, `python3` en otros sistemas).
- En paquete, Electron usa `Back-END/dist/rf-tool-suite-backend.exe`.
- `Biblioteca` se empaqueta como recurso para conservar calibraciones, mediciones y extracciones.
