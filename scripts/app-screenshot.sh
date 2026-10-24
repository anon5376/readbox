#!/bin/sh
# A screenshot of the real Mac app window, run against an empty test library (never your own).
# Needs a debug build first: npm run tauri build -- --debug --bundles app
# Usage: scripts/app-screenshot.sh <output.png>
set -e
OUT="${1:-app.png}"
APP="src-tauri/target/debug/bundle/macos/Readbox.app/Contents/MacOS/readbox"
LIB="$(mktemp -d)"
READBOX_LIBRARY="$LIB" "$APP" >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$LIB"' EXIT
sleep 7
WIN="$(swift scripts/window-id.swift $PID | head -1)"
[ -n "$WIN" ] || { echo "No Readbox window found"; exit 1; }
screencapture -x -o -l "$WIN" "$OUT"
echo "Saved $OUT"
