#!/bin/bash
# ─── Build script for community-data-layer.js ─────────────────────────────
# Concatenates lib/ modules into a single browser-runnable IIFE.
# Each module exports a factory function via module.exports.
# This script transforms them into global-scoped functions for the browser.
#
# Usage: ./build-data-layer.sh
# Output: community-data-layer.js

set -euo pipefail
cd "$(dirname "$0")"

OUTPUT="community-data-layer.js"
LIB_DIR="lib"

# Module order (dependencies must come first)
# Format: filename:GlobalName (empty GlobalName = entry point, included as-is)
MODULES="
config:LodestoneConfig
storage:LodestoneStorage
events:LodestoneEvents
auth:LodestoneAuth
sync:LodestoneSync
conversations:LodestoneConversations
messages:LodestoneMessages
memories:LodestoneMemories
brain:LodestoneBrain
dl-tools:LodestoneTools
fetch-override:LodestoneFetchOverride
index:
"

echo "Building $OUTPUT..."

cat > "$OUTPUT" << 'HEADER'
// ─── Lodestone Local Data Layer ──────────────────────────────────────────
// AUTO-GENERATED — do not edit directly. Edit files in lib/ and run ./build-data-layer.sh
// Injected into the SPA via the protocol handler.
// ALL tiers are local-first — data lives in ~/.lodestone/local.db.
// Pro/Studio users can optionally sync to the cloud.
// Community users are local-only.
//
// Also routes LLM calls to local Ollama (Community) or passes through to server.

HEADER

echo "$MODULES" | while IFS=: read -r module_name global_name; do
  # Skip empty lines
  [ -z "$module_name" ] && continue
  
  module_file="$LIB_DIR/$module_name.js"
  
  if [ -z "$global_name" ]; then
    # index.js — entry point, just strip require lines
    echo "  Processing $module_file (entry point)"
    echo "" >> "$OUTPUT"
    echo "// ─── Entry point ────────────────────────────────────────────────────────" >> "$OUTPUT"
    sed '/^const .* = require(/d' "$module_file" >> "$OUTPUT"
  else
    echo "  Processing $module_file → $global_name"
    echo "" >> "$OUTPUT"
    echo "// ─── Module: $module_name ────────────────────────────────────────────────" >> "$OUTPUT"
    sed \
      -e '/^const .* = require(/d' \
      -e "s/^module\.exports = function init[A-Za-z]*/function $global_name/" \
      -e "s/^module\.exports = {/const $global_name = {/" \
      "$module_file" >> "$OUTPUT"
  fi
done

echo ""
echo "Built $OUTPUT successfully."
echo "Size: $(wc -c < "$OUTPUT" | tr -d ' ') bytes ($(wc -l < "$OUTPUT" | tr -d ' ') lines)"