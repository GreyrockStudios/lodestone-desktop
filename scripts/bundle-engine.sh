#!/bin/bash
# Bundle the Lodestone engine into the desktop app's resources
# Usage: ./scripts/bundle-engine.sh [path-to-lodestone]
set -e

LODESTONE_ROOT="${1:-/Users/flint/.openclaw/workspace/projects/lodestone}"
DESKTOP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_DIR="$DESKTOP_ROOT/engine"

echo "🔨 Building Lodestone engine from: $LODESTONE_ROOT"

# Step 1: Build core package
echo "  Building @lodestone/core..."
cd "$LODESTONE_ROOT"
npm install --legacy-peer-deps 2>&1 | tail -3
rm -f packages/core/tsconfig.tsbuildinfo
rm -rf packages/core/dist
npx tsc -b packages/core/tsconfig.json

# Step 2: Build CLI package
echo "  Building lodestone CLI..."
rm -f packages/cli/tsconfig.tsbuildinfo
rm -rf packages/cli/dist
cd packages/cli && npx tsc && cd "$LODESTONE_ROOT"

# Step 3: Copy built engine into desktop app's engine directory
echo "📦 Copying engine to desktop app..."
rm -rf "$ENGINE_DIR"
mkdir -p "$ENGINE_DIR"

# Copy the monorepo structure (only what's needed to run)
mkdir -p "$ENGINE_DIR/packages/core/dist"
mkdir -p "$ENGINE_DIR/packages/cli/dist"

# Core package - dist + package.json
cp -r "$LODESTONE_ROOT/packages/core/dist/"* "$ENGINE_DIR/packages/core/dist/"
cp "$LODESTONE_ROOT/packages/core/package.json" "$ENGINE_DIR/packages/core/"

# CLI package - dist + package.json + templates
cp -r "$LODESTONE_ROOT/packages/cli/dist/"* "$ENGINE_DIR/packages/cli/dist/"
cp "$LODESTONE_ROOT/packages/cli/package.json" "$ENGINE_DIR/packages/cli/"
if [ -d "$LODESTONE_ROOT/packages/cli/templates" ]; then
  cp -r "$LODESTONE_ROOT/packages/cli/templates" "$ENGINE_DIR/packages/cli/"
fi

# Root package.json + lockfile
cp "$LODESTONE_ROOT/package.json" "$ENGINE_DIR/"
cp "$LODESTONE_ROOT/package-lock.json" "$ENGINE_DIR/" 2>/dev/null || true

# Install production dependencies
echo "📥 Installing production dependencies..."
cd "$ENGINE_DIR"
npm install --omit=dev --legacy-peer-deps --ignore-scripts 2>&1 | tail -5

echo "✅ Engine bundled to: $ENGINE_DIR"
echo "   Run 'npm run build:mac' to create the .dmg with the engine included."