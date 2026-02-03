# Project Context: RF & Signal Integrity Suite

## Overview
The **RF & Signal Integrity Suite** is a comprehensive software platform designed for Radio Frequency (RF) and Signal Integrity (SI) engineering tasks. It provides a modern web-based interface for analyzing S-parameters, extracting RLC equivalent models, managing NanoVNA hardware, and more.

The project is structured as a full-stack application with a React frontend and a FastAPI (Python) backend. It can be run as a standard web application or as a standalone desktop application using `pywebview`.

## Tech Stack

### Frontend (`Front-END/`)
*   **Framework:** React 18
*   **Build Tool:** Vite 6
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS 4
*   **UI Components:** Radix UI, Shadcn-like patterns
*   **Visualizations:** Recharts (dynamic plots), Matplotlib (backend-generated plots)
*   **Icons:** Lucide React
*   **Animations:** Framer Motion (`motion/react`)

### Backend (`Back-END/`)
*   **Framework:** FastAPI
*   **Server:** Uvicorn
*   **Language:** Python 3
*   **RF/Numeric Libraries:**
    *   **NumPy / Pandas:** Data manipulation
    *   **SciPy:** Optimization and fitting (least squares)
    *   **Scikit-RF (`skrf`):** S-parameter processing and Touchstone file management
    *   **PyNanoVNA / PySerial:** Hardware communication with NanoVNA devices
*   **Plotting:** Matplotlib (returned as Base64 images to frontend)
*   **Desktop Wrapper:** PyWebView

## Project Structure

### Frontend (`Front-END/src`)
*   **`app/App.tsx`**: Main entry point and navigation manager.
*   **`app/components/tools/`**: Core logic for each tool (e.g., `SParamAnalysisTool`, `RlcModelTool`, `SammTool`).
*   **`app/components/ui/`**: Reusable UI primitives (Buttons, Cards, Inputs, etc.).
*   **`app/lib/`**: Frontend utilities like unit conversion (`units.ts`) and file system access (`fsAccess.ts`).

### Backend (`Back-END/`)
*   **`main.py`**: The API entry point. It handles routing, serves the static frontend build, and initializes the desktop window.
*   **`logic/`**: Modularized business logic:
    *   `samm.py`: Selection Automatic of Measurement Model logic.
    *   `s_params.py`: S-parameter analysis from S2P/Touchstone files.
    *   `rlc_extraction.py`: RLC model fitting and comparison.
    *   `vna.py`: NanoVNA hardware communication and calibration steps.
*   **`legacy_scripts/`**: Original standalone Python scripts used during initial development.

## Building and Running

### Frontend
From the `Front-END` directory:
1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Start development server:**
    ```bash
    npm run dev
    ```
3.  **Build for production:**
    ```bash
    npm run build
    ```
    (Outputs will be in `Front-END/dist`)

### Backend
From the `Back-END` directory:
1.  **Set up environment (recommended):**
    ```bash
    python -m venv .venv
    .\.venv\Scripts\activate
    ```
2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the application:**
    ```bash
    python main.py
    ```
    *Note: The backend serves the frontend from `Back-END/dist`. Ensure you copy the frontend build to the backend folder or adjust paths accordingly.*

## Key Features & Workflows

*   **Calibration:** Sequential SOLT (Short, Open, Load, Through) calibration wizard for NanoVNA.
*   **Measurement:** Real-time capture of S-parameters (S11, S21) from the device.
*   **S-Parameter Analysis:** Drag-and-drop `.s2p` files to view Magnitude, Phase, VSWR, and Smith Charts with interactive markers.
*   **RLC Modeling:** Automatic extraction of R, L, and C parameters from S-parameters using curve-fitting.
*   **ZIP Export:** Package all analysis results (CSV data + plot PNGs) into a single archive.

## Development Conventions

*   **Imports:** Use the `@` alias for `src` in the frontend.
*   **Modularity:** Keep RF logic inside `Back-END/logic/` and expose via FastAPI endpoints.
*   **Plots:** Backend should return plots as Base64 encoded strings for seamless integration with the React UI.
*   **Theme:** Supports Light and Dark modes via `next-themes`.
