# Raleway Python Sidecar Build Script for Windows
# Usage: .\build.ps1

$ErrorActionPreference = "Stop"

# Get the directory of this script
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

# Detect Python command
$PythonCmd = "python"
if (!(Get-Command "python" -ErrorAction SilentlyContinue)) {
    if (Get-Command "python3" -ErrorAction SilentlyContinue) {
        $PythonCmd = "python3"
    } elseif (Get-Command "py" -ErrorAction SilentlyContinue) {
        $PythonCmd = "py"
    } else {
        Write-Host "Error: Python not found! Please install Python." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using Python command: $PythonCmd" -ForegroundColor Gray

# Step 1: Install dependencies
Write-Host "Step 1/2: Installing dependencies..." -ForegroundColor Yellow
& $PythonCmd -m pip install pyinstaller websocket-client python-dotenv colorama PyJWT requests

# Step 2: Build the executable
Write-Host "Step 2/2: Running PyInstaller..." -ForegroundColor Yellow
# --noconsole is often preferred for background sidecars to avoid popping up a cmd window
& $PythonCmd -m PyInstaller --onefile --noconsole --name app app.py

Write-Host ""
Write-Host "=== Build Complete! ===" -ForegroundColor Green
Write-Host "Binary created at: $ScriptDir\dist\app.exe"
