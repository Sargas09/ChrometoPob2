#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
EXT_DIR="$ROOT_DIR"

# Try to find manifest.json within repo
if [[ -f "$ROOT_DIR/manifest.json" ]]; then
  EXT_DIR="$ROOT_DIR"
else
  # common subfolders
  for d in extension src app web; do
    if [[ -f "$ROOT_DIR/$d/manifest.json" ]]; then
      EXT_DIR="$ROOT_DIR/$d"
      break
    fi
  done
fi

mkdir -p "$DIST_DIR"
ZIP_NAME="extension-$(date +%Y%m%d-%H%M%S).zip"
(
  cd "$EXT_DIR"
  zip -r "$DIST_DIR/$ZIP_NAME" . -x "*.DS_Store" -x "*.bak" -x "node_modules/*" >/dev/null
)
echo "Wrote $DIST_DIR/$ZIP_NAME"
