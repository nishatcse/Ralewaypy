# Raleway Python Sidecar Build Script for Windows
# Usage: .\build.ps1

$ErrorActionPreference = "Stop"

# Get the directory of this script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "=== Building Python sidecar for Windows ===" -ForegroundColor Cyan

# Step 1: Install dependencies
Write-Host "Step 1/2: Installing dependencies..." -ForegroundColor Yellow
python -m pip install pyinstaller websocket-client python-dotenv colorama PyJWT requests

# Step 2: Build the executable
Write-Host "Step 2/2: Running PyInstaller..." -ForegroundColor Yellow
# --noconsole is often preferred for background sidecars to avoid popping up a cmd window
python -m PyInstaller --onefile --noconsole --name app app.py

Write-Host ""
Write-Host "=== Build Complete! ===" -ForegroundColor Green
Write-Host "Binary created at: $ScriptDir\dist\app.exe"
