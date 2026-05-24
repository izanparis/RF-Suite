# RF & Signal Integrity Suite - Activation Script
# Script para iniciar el servidor backend, el cliente frontend y abrir la aplicación.

$ErrorActionPreference = "Continue"

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "      RF & Signal Integrity Suite       " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Obtener la ruta del script para que funcione desde cualquier lugar (Raycast, etc.)
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrEmpty($PSScriptRoot)) { $PSScriptRoot = Get-Location }
Set-Location $PSScriptRoot

Write-Host "Directorio de trabajo: $PSScriptRoot" -ForegroundColor Gray

# 1. Verificar Backend
Write-Host "`n[1/2] Iniciando Servidor Backend (FastAPI)..." -ForegroundColor Cyan
$BackendPath = Join-Path $PSScriptRoot "Back-END"
$PythonExe = Join-Path $BackendPath ".venv\Scripts\python.exe"

if (Test-Path $PythonExe) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendPath'; & '$PythonExe' main.py"
} else {
    Write-Host "❌ Error: No se encontró el entorno virtual en Back-END/.venv" -ForegroundColor Red
    Write-Host "Ruta intentada: $PythonExe" -ForegroundColor Yellow
    Pause
    exit
}

# 2. Iniciar Frontend
Write-Host "[2/2] Iniciando Frontend y App (Vite + Electron)..." -ForegroundColor Cyan
$FrontendPath = Join-Path $PSScriptRoot "Front-END"
Set-Location $FrontendPath

if (Test-Path "node_modules") {
    npm run dev:desktop
} else {
    Write-Host "❌ Error: No se encontró node_modules en Front-END" -ForegroundColor Red
    Write-Host "Ejecutando 'npm install' primero..." -ForegroundColor Yellow
    npm install
    npm run dev:desktop
}
