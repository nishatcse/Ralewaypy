#!/bin/bash
set -e

# Go to app-ui
cd "$(dirname "$0")"

echo "Building Python Sidecar..."
cd backend
./build.sh
cd ..

echo "Building Electron App..."
npm run dist:linux

echo "Build complete! Check release/ directory."
