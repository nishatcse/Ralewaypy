#!/bin/bash
cd "$(dirname "$0")"

echo "Building Python sidecar..."
pip install pyinstaller websocket-client python-dotenv colorama PyJWT

# Build the executable
pyinstaller --onefile --name app app.py

echo "Build complete. Binary is in dist/app"
