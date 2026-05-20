# Stream Lights Agent — Windows Quick Installer
# Run this script from PowerShell in the artifacts/desktop-agent folder:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#   .\install-windows.ps1

Write-Host "Stream Lights Agent — Windows Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Download it from https://nodejs.org (LTS version)" -ForegroundColor Red
    Start-Process "https://nodejs.org"
    Read-Host "Press Enter after installing Node.js, then re-run this script"
    exit 1
}

$nodeVersion = (node --version)
Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed" -ForegroundColor Red; exit 1 }

# Build TypeScript
Write-Host "`nBuilding agent..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

# Package for Windows
Write-Host "`nPackaging Windows installer..." -ForegroundColor Yellow
npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Packaging failed. Trying to run directly instead..." -ForegroundColor Yellow
    Write-Host "`nStarting agent directly (no installer)..." -ForegroundColor Cyan
    npx electron .
    exit 0
}

# Find installer
$installer = Get-ChildItem "dist\*.exe" | Select-Object -First 1
if ($installer) {
    Write-Host "`nInstaller ready: $($installer.FullName)" -ForegroundColor Green
    Write-Host "Running installer..." -ForegroundColor Cyan
    Start-Process $installer.FullName
} else {
    Write-Host "`nInstaller not found. Running agent directly..." -ForegroundColor Yellow
    npx electron .
}
