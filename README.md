# Ski resort maps: prototype

3D, offline-capable resort maps for **Ski Arlberg**, **KitzSki** and **Les 3 Vallées**.
Piste and lift data comes from OpenStreetMap. Base map, terrain and offline tiles come from the Mapbox Maps SDK for iOS (v11).

```
preview/    Browser preview of the map (same style, layers and data code as the app)
pipeline/   Node script: OSM (Overpass) → slim GeoJSON per resort
data/       output of the pipeline (bundle this into the app as "ResortData")
ios/SkiMaps SwiftUI + Mapbox code: map view, resort search, offline downloads
```

## Preview in the browser (no Xcode needed)

`preview/` is a web version of the iOS map: the same Mapbox Standard style, terrain, run colours, hanging
cables and 2D/3D toggle, built with Mapbox GL JS. It runs the same `pipeline/` code in the browser.
If you haven't run `npm run fetch`, it loads each resort live from OpenStreetMap, which takes 20–60 s per resort.

On your Mac, from the repo root:

```bash
npx serve .
```

Then open http://localhost:3000/preview/ and paste your Mapbox public token (`pk.…`) once. To skip that step, put the token in `preview/config.js` in your local copy.
To test on your iPhone, join the same Wi-Fi and open `http://<your-Mac's-IP>:3000/preview/` in Safari.
You can find your Mac's IP under System Settings → Wi-Fi → Details.

**Hosted alternative:** in the GitHub repo, go to Settings → Pages and set Source to "Deploy from a branch", `main`, `/ (root)`.
The map is then at `https://ninoczernin-lab.github.io/ski.wrede.czernin/`, which forwards to `preview/`.
GitHub Pages on a private repo needs a paid GitHub plan.
Visitors paste a token once, or you share a link ending in `?token=pk.…`. GitHub's secret scanning blocks committing a Mapbox token to this repo. If you share a token, restrict it to the site's URL in your Mapbox account.

Controls: pick a resort at the top, use **2D/3D** and the lighting button on the right, and tap a run or lift for details.
On a computer, right-drag or Ctrl-drag to tilt and rotate. On a phone, drag with two fingers.

## 1. Get the resort data (run on your Mac)

```bash
cd pipeline && npm install && npm test && npm run fetch
```

This writes `data/<resort-id>/{pistes,piste_areas,lifts,stations,boundary}.geojson` and `data/manifest.json`.
Resort areas are bounding boxes in `pipeline/resorts.json`. Expect a few runs or lifts from neighbouring
areas near the edges. To fix that, tighten the box or clip to `boundary.geojson`.

## 2. iOS app

1. In Xcode, use File → Add Package Dependencies → `https://github.com/mapbox/mapbox-maps-ios` (v11.x).
2. Put your public token (`pk.…`) in Info.plist as `MBXAccessToken`.
3. Drag the `data/` folder into the project as a **folder reference** named `ResortData`.
4. Add `NSLocationWhenInUseUsageDescription` to Info.plist.
5. Add the Swift files in `ios/SkiMaps/` and use `ResortBrowserView()` as the root view.

## 3D

- **Mapbox Standard style**: 3D buildings, trees and landmarks, with dynamic lighting (dawn, day, dusk, night menu).
- **Real terrain**: Mapbox DEM at 1.5× exaggeration, camera tilted to 65° (up to 85° by hand).
- **Relief shading**: slope steepness stays readable, even in 2D.
- **3D lift infrastructure**: OSM lift pylons and stations extruded as blocks standing on the terrain (`structures.geojson`).
- **2D/3D button** on the right edge. Two fingers tilt, twist to rotate.

## How runs are drawn

The pipeline cleans the OSM data (`pipeline/clean.mjs`) so each run is drawn once, in one colour:
- Route relations hand their difficulty, name and number down to their segments, so no run is drawn twice.
- Difficulty values are normalised: `Easy` becomes easy, `easy;intermediate` becomes intermediate, and missing values become unknown.
- Abandoned runs are removed.
- Segments of the same run are joined into one line, so there are no gaps and one label per run.

The app (`PisteStyle.swift`) keeps colours and widths in one place, shared by the map and the legend:
- Runs are drawn above the 3D trees.
- Each run has a white outline, and harder runs are drawn on top where runs overlap.
- Unclassified runs are dashed grey.
- Run numbers show as coloured badges.



## How offline works

| Piece | Where it lives | Offline? |
|---|---|---|
| Pistes, lifts, stations, 3D pylons (OSM GeoJSON) | app bundle | always |
| Style, fonts, icons | Mapbox style pack (`OfflineManager`) | after download |
| Base map + terrain DEM tiles z10–16 | Mapbox tile region per resort (`TileStore`) | after download |

Users tap ⬇ next to a resort to download it. Check the tile-count and offline limits in your Mapbox plan
and terms before raising `zoomRange`.

## Attribution (required)

Show "© OpenStreetMap contributors" in the app. OSM data is under the ODbL licence.
Mapbox shows its own attribution automatically.
