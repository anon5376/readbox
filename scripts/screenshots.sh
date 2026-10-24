#!/bin/sh
# Screenshots of the design preview (needs `npm run design` running and Google Chrome).
# Usage: scripts/screenshots.sh <output folder>
set -e
OUT="${1:-screenshots}"
mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="http://localhost:1430/design-preview.html"
shot() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="${3:-1100,760}" --virtual-time-budget=2500 --screenshot="$OUT/$1.png" "$BASE?$2" >/dev/null 2>&1
}
shot library ""
shot library-dark "theme=dark"
shot reader "view=reader"
shot reader-dark "view=reader&theme=dark"
shot settings "panel=settings"
shot text-settings "panel=text"
shot empty "empty"
shot narrow "" "700,760"
echo "Saved to $OUT"
