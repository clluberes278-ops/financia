$ErrorActionPreference = 'Stop'

# Ejecuta con privilegios temporales de bypass de política de ejecución
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force | Out-Null

# 1. Instalar Node.js mediante winget (si no está ya instalado)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando Node.js vía winget..."
    winget install --id OpenJS.NodeJS -e --source winget
} else {
    Write-Host "Node.js ya está instalado: $(node -v)"
}

# 2. Verificar que npm está disponible (viene con Node)
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm no está disponible después de la instalación de Node. Abortando."
    exit 1
}

# 3. Instalar expo-cli y eas-cli globalmente mediante npm
Write-Host "Instalando expo-cli y eas-cli globalmente..."
npm i -g expo-cli
npm i -g eas-cli

# 4. Mostrar versiones instaladas
Write-Host "Versión de expo-cli: $(expo --version)"
Write-Host "Versión de eas-cli: $(eas --version)"
