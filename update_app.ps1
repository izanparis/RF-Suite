# Script de actualización para RF & Signal Integrity Suite
# Este script compila el frontend y copia los archivos al backend para su distribución.

$ErrorActionPreference = "Stop"

Write-Host "`n[1/3] Compilando el Frontend (React)..." -ForegroundColor Cyan
Set-Location "Front-END"
npm run build

Write-Host "`n[2/3] Limpiando la carpeta distributiva del Backend..." -ForegroundColor Cyan
Set-Location ".."
$distPath = "Back-END/dist"

if (Test-Path $distPath) {
    Remove-Item -Path "$distPath/*" -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $distPath
}

Write-Host "`n[3/3] Copiando nuevos archivos de compilación..." -ForegroundColor Cyan
Copy-Item -Path "Front-END/dist/*" -Destination $distPath -Recurse

Write-Host "`n✅ ¡Actualización completada con éxito!" -ForegroundColor Green
Write-Host "Ahora puedes ejecutar el backend con: cd Back-END; python main.py`n" -ForegroundColor Yellow
