#!/bin/bash
set -e

echo "=== Lodestone Desktop Builder (Electron) ==="

# Step 1: Pull the latest web frontend from the server
echo "📦 Pulling latest web frontend..."
mkdir -p ui
rsync -avz --delete root@159.89.239.126:/var/www/lodestone/ ui/ --exclude 'updates' --exclude 'lodestone'

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 3: Build
echo "🔨 Building Electron app..."
case "${1:-current}" in
  mac|macos|apple)
    echo "Building for macOS (Universal)..."
    npx electron-builder --mac --universal
    ;;
  win|windows)
    echo "Building for Windows..."
    npx electron-builder --win
    ;;
  linux)
    echo "Building for Linux..."
    npx electron-builder --linux
    ;;
  current|*)
    echo "Building for current platform..."
    npx electron-builder
    ;;
esac

echo ""
echo "✅ Build complete!"
echo ""
echo "Output:"
find dist -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" 2>/dev/null | while read f; do
  echo "  $(du -sh "$f" 2>/dev/null | cut -f1 || echo "?") $f"
done