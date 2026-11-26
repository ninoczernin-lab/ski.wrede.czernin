#!/bin/sh
# Copies the web map into ios/SkiMaps/Web, which the app bundles as a folder reference named "Web".
# Run it from anywhere (or as an Xcode "Run Script" build phase before "Copy Bundle Resources").
# It also puts MapLibre and osmtogeojson next to the page, so the app needs no CDN and works offline.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/ios/SkiMaps/Web"
MAPLIBRE=5.24.1            # keep in step with preview/index.html
OSMTOGEOJSON=3.0.0-beta.5

rm -rf "$OUT"
mkdir -p "$OUT/preview" "$OUT/pipeline" "$OUT/vendor"
cp "$ROOT"/preview/*.js "$ROOT/preview/index.html" "$OUT/preview/"
cp -R "$ROOT/preview/fonts" "$OUT/preview/"
for f in query convert clean cables lift3d; do cp "$ROOT/pipeline/$f.mjs" "$OUT/pipeline/"; done
cp "$ROOT/pipeline/resorts.json" "$OUT/pipeline/"
# Resorts fetched with `npm run fetch` open instantly and offline from the bundle.
if [ -d "$ROOT/data" ]; then cp -R "$ROOT/data" "$OUT/data"; fi

cd "$ROOT/pipeline"
npm install --no-save --silent "maplibre-gl@$MAPLIBRE" "osmtogeojson@$OSMTOGEOJSON" esbuild@0.24.2 >/dev/null
cp node_modules/maplibre-gl/dist/maplibre-gl.js node_modules/maplibre-gl/dist/maplibre-gl.css "$OUT/vendor/"
node_modules/.bin/esbuild node_modules/osmtogeojson/index.js --bundle --format=esm --log-level=error \
  --outfile="$OUT/vendor/osmtogeojson.mjs"
echo "Web map bundled into $OUT"
