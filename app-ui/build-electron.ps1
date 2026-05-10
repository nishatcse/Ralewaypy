# Raleway Electron Frontend Build Script for Windows
# Usage: .\build-electron.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

Write-Host "=== Building Raleway Electron App (Windows) ===" -ForegroundColor Cyan

# Step 1: Check for Python sidecar
$SidecarPath = "$ScriptDir\backend\dist\app.exe"
if (!(Test-Path $SidecarPath)) {
    Write-Host "Warning: Python sidecar (app.exe) not found at $SidecarPath" -ForegroundColor Yellow
    Write-Host "The sidecar is required for the final bundle." -ForegroundColor Yellow
    $choice = Read-Host "Would you like to build the sidecar now? (Y/N)"
    if ($choice -eq "Y" -or $choice -eq "y") {
        & "$ScriptDir\backend\build.ps1"
    } else {
        Write-Host "Proceeding without sidecar (Build may be incomplete)..." -ForegroundColor Gray
    }
}

# Step 2: Build Electron
Write-Host "Step 2: Building Electron installer..." -ForegroundColor Yellow
npm run dist:win

Write-Host ""
Write-Host "=== Electron Build Complete! ===" -ForegroundColor Green
Write-Host "Installer created at: $ScriptDir\release\"
Get-ChildItem -Path "$ScriptDir\release\*.exe" -ErrorAction SilentlyContinue
