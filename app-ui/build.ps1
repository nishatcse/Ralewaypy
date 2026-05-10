# Raleway Full App Build Script for Windows
# Usage: .\build.ps1 [linux|win|all]

$ErrorActionPreference = "Continue"
$target = if ($args.Count -gt 0) { $args[0] } else { "win" }

# Get the directory of this script
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

Write-Host "=== Raleway Windows Build Pipeline ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build Python sidecar
Write-Host "Step 1/2: Building Python sidecar..." -ForegroundColor Yellow
& "$ScriptDir\backend\build.ps1"

# Step 2: Build Electron app
Write-Host ""
Write-Host "Step 2/2: Building Electron app..." -ForegroundColor Yellow

switch ($target) {
    "win" {
        Write-Host "Building for Windows (NSIS + Portable)..." -ForegroundColor Cyan
        npm run dist:win
    }
    "linux" {
        Write-Host "Building for Linux (AppImage)..." -ForegroundColor Cyan
        npm run dist:linux
    }
    "all" {
        Write-Host "Building for all platforms..." -ForegroundColor Cyan
        npm run dist
    }
    Default {
        Write-Host "Unknown target: $target" -ForegroundColor Red
        Write-Host "Usage: .\build.ps1 [win|linux|all]"
        exit 1
    }
}

Write-Host ""
Write-Host "=== All Builds Complete! ===" -ForegroundColor Green
Write-Host "Release artifacts are in: $ScriptDir\release\"
Get-ChildItem -Path "$ScriptDir\release\*.exe", "$ScriptDir\release\*.AppImage" -ErrorAction SilentlyContinue
