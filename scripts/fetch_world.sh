#!/usr/bin/env bash
# ينزّل حدود الدول (Natural Earth) ويحوّلها إلى ملف world.js داخل assets
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=app/src/main/assets/data/world.js
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
mkdir -p app/src/main/assets/data
TMP="$(mktemp)"
curl -fsSL "$BASE/ne_50m_admin_0_countries.geojson" -o "$TMP" \
  || curl -fsSL "$BASE/ne_110m_admin_0_countries.geojson" -o "$TMP"
{ printf 'window.WORLD='; cat "$TMP"; printf ';\n'; } > "$OUT"
rm -f "$TMP"
echo "OK: $OUT ($(wc -c < "$OUT") bytes)"
