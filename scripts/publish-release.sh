#!/bin/bash
# Publish a GitHub release for Lodestone Desktop
# Usage: ./scripts/publish-release.sh [version]
#
# Prerequisites: gh auth login (GitHub CLI authenticated)
set -e

VERSION="${1:-0.1.0}"
TAG="v${VERSION}"
REPO="GreyrockStudios/lodestone-desktop"
RELEASE_DIR="release"

echo "📦 Publishing Lodestone Desktop ${TAG} to GitHub..."

# Check auth
if ! gh auth status &>/dev/null; then
  echo "❌ GitHub CLI not authenticated. Run: gh auth login"
  echo "   Then re-run this script."
  exit 1
fi

# Check release assets exist
if [ ! -f "${RELEASE_DIR}/Lodestone-${VERSION}-arm64.dmg" ]; then
  echo "❌ Release assets not found. Run 'npm run build:mac' first."
  exit 1
fi

# Create the release
echo "🚀 Creating GitHub release ${TAG}..."
gh release create "${TAG}" \
  "${RELEASE_DIR}/Lodestone-${VERSION}-arm64.dmg" \
  "${RELEASE_DIR}/Lodestone-${VERSION}-arm64-mac.zip" \
  "${RELEASE_DIR}/Lodestone-${VERSION}-arm64.dmg.blockmap" \
  "${RELEASE_DIR}/Lodestone-${VERSION}-arm64-mac.zip.blockmap" \
  "${RELEASE_DIR}/latest-mac.yml" \
  --repo "${REPO}" \
  --title "Lodestone Desktop ${TAG}" \
  --notes "Lodestone Desktop ${TAG}

- Bundled Lodestone engine (no separate install needed)
- Auto-updater checks GitHub releases every 4 hours
- Dark/light theme
- 17 views, 49 components

macOS arm64 only. Right-click → Open on first launch (code signing not yet configured)."

echo "✅ Release published: https://github.com/${REPO}/releases/${TAG}"
echo ""
echo "The app will now auto-update from this release."
echo "Download link: https://github.com/${REPO}/releases/${TAG}"