#!/bin/bash
# Build script for Raleway Booking App
# Builds the Python sidecar binary and then packages the Electron app
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Raleway Build Pipeline ==="
echo ""

# Step 1: Build Python sidecar
echo "Step 1/2: Building Python sidecar..."
cd "$SCRIPT_DIR/backend"
bash build.sh
cd "$SCRIPT_DIR"

# Step 2: Build Electron app
echo ""
echo "Step 2/2: Building Electron app..."

TARGET="${1:-linux}"

case "$TARGET" in
    linux)
        echo "Building for Linux (AppImage)..."
        npm run dist:linux
        ;;
    win|windows)
        echo "Building for Windows (NSIS installer + portable)..."
        npm run dist:win
        ;;
    all)
        echo "Building for all platforms..."
        npm run dist
        ;;
    *)
        echo "Unknown target: $TARGET"
        echo "Usage: ./build.sh [linux|win|all]"
        exit 1
        ;;
esac

echo ""
echo "=== Build complete! ==="
echo "Release artifacts are in: $SCRIPT_DIR/release/"
ls -lh "$SCRIPT_DIR/release/"*.AppImage "$SCRIPT_DIR/release/"*.exe "$SCRIPT_DIR/release/"*.deb 2>/dev/null || true
