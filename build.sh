#!/bin/bash
set -e

# ─── Configuration ───
DEPLOY_SERVER="${DEPLOY_SERVER:-root@159.89.239.126}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/lodestone}"
VERSION="${1:-current}"

echo "=== Lodestone Desktop Builder (Electron) ==="

# ─── Notarization check ───
if [[ -n "$APPLE_ID" && -n "$APPLE_APP_SPECIFIC_PASSWORD" ]]; then
  echo "🍎 macOS notarization credentials found — builds will be notarized."
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-T2YATNHTKN}"
else
  echo "⚠️  APPLE_ID and/or APPLE_APP_SPECIFIC_PASSWORD not set — skipping notarization."
  echo "   Set these env vars to enable notarized builds:"
  echo "   export APPLE_ID=<your Apple ID email>"
  echo "   export APPLE_APP_SPECIFIC_PASSWORD=<app-specific password from appleid.apple.com>"
  echo "   export APPLE_TEAM_ID=T2YATNHTKN"
fi

# Step 1: Pull the latest web frontend from the server
echo "📦 Pulling latest web frontend..."
mkdir -p ui
rsync -avz --delete "${DEPLOY_SERVER}:${DEPLOY_PATH}/" ui/ \
  --exclude updates --exclude lodestone --exclude downloads \
  --exclude '*.dmg' --exclude '*.exe' --exclude '*.blockmap' \
  --exclude dist.bak --exclude 'assets.bak.*' --exclude .DS_Store \
  --exclude '*.pkg' --exclude '*.zip'

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 3: Bump version if specified
if [[ "$VERSION" != "current" ]]; then
  echo "📝 Bumping version to $VERSION..."
  npm version "$VERSION" --no-git-tag-version || true
fi

# Step 4: Build data layer
 echo "🔨 Building community-data-layer.js from lib/ modules..."
 bash build-data-layer.sh

# Step 5: Build
echo "🔨 Building Electron app..."
case "${2:-current}" in
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

echo ""
echo "📤 To deploy updates:"
echo "  rsync -avz dist/latest-mac.yml ${DEPLOY_SERVER}:${DEPLOY_PATH}/updates/"
echo "  rsync -avz dist/Lodestone-*.dmg ${DEPLOY_SERVER}:${DEPLOY_PATH}/downloads/"
echo "  rsync -avz dist/Lodestone-*.blockmap ${DEPLOY_SERVER}:${DEPLOY_PATH}/updates/"