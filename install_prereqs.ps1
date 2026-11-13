# Comprobación de requisitos; no instala herramientas globales.
$ErrorActionPreference = 'Continue'
foreach ($tool in @('node', 'npm.cmd', 'java', 'dotnet', 'adb')) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Write-Host "Disponible: $tool" }
    else { Write-Warning "Falta en PATH: $tool" }
}
Write-Host 'Android requiere JDK 17 y Android Studio/SDK. iOS requiere macOS/Xcode.'
Write-Host 'Backend: SDK .NET 10. npm run api:start también detecta artifacts/dotnet.'
Write-Host 'Consulta README.md; no se necesita ninguna CLI global.'
