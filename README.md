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

`preview/` is a web version of the iOS map: the same cartoon look, terrain, run colours, hanging cables and
2D/3D toggle, built with [MapLibre GL JS](https://maplibre.org) on free sources that need no account or
token: [OpenFreeMap](https://openfreemap.org) vector tiles (OpenStreetMap data), [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
for the 3D ground, and Esri World Imagery for the Satellite look. It runs the same `pipeline/` code in the browser.
If you haven't run `npm run fetch`, it loads each resort live from OpenStreetMap, which takes 20–60 s per resort.

On your Mac, from the repo root:

```bash
npx serve .
```

Then open http://localhost:3000/preview/. No token or account is needed.
To test on your iPhone, join the same Wi-Fi and open `http://<your-Mac's-IP>:3000/preview/` in Safari.
You can find your Mac's IP under System Settings → Wi-Fi → Details.

**Hosted alternative:** in the GitHub repo, go to Settings → Pages and set Source to "Deploy from a branch", `main`, `/ (root)`.
The map is then at `https://ninoczernin-lab.github.io/ski.wrede.czernin/`, which forwards to `preview/`.
GitHub Pages on a private repo needs a paid GitHub plan.
Anyone with the link can open it; nothing to paste. Esri World Imagery is free to view with attribution; check Esri's terms before a commercial release.

Resorts: **271**, from `pipeline/catalog.mjs`:
- **Tier 1:** 12 resorts with over 2 M skier visits.
- **Tier 2:** 51 resorts with 1–2 M visits.
- **Tier 3:** 208 resorts with 0.5–1 M visits.
- **More resorts:** 1053 further resorts from the 2026 resort list (`pipeline/resort-list-2026.txt`), 1324 in total.

The 2026 list was placed once with `pipeline/geocode-list.mjs` (`MAPBOX_TOKEN=pk.… node geocode-list.mjs`; the only part of the project that ever needs Mapbox, and only to re-run that lookup). It matches each entry to a Mapbox ski-area point, or falls back to its village when a ski area with real vertical drop lies within 8 km and the country agrees. Entries already on the map become extra search words. The script writes `catalog-extra.json`; `catalog-manual.json` holds hand-placed positions and corrections. Entries that couldn't be placed reliably are listed in `pipeline/resorts-not-placed.md`.

Each entry has the ski area's centre, a radius covering its lifts, and search words (villages, alternative names). After editing the catalogue, run `npm run catalog` in `pipeline/` to rebuild `resorts.json`. Runs and lifts load from OpenStreetMap the first time a resort is opened.

Controls:
- Search at the top by resort, village or country. With the field empty, it lists the tier 1 resorts. The globe button zooms out to every resort as a dot coloured by tier: coral = tier 1, blue = tier 2, grey = tier 3, small pale dots = more resorts (from zoom 4.5). Tap a dot to open that resort.
- Run colours follow each region's convention:
  - **Europe:** blue / red / black.
  - **North America, Australia and New Zealand:** green / blue / black / double black.
  - **Japan, Korea and China:** green / red / black.
- The round buttons on the right switch **2D/3D** and the **map style** (Cartoon or Satellite). The hour slider at the bottom sets the light.
- In 3D, drag the **compass dial** at the bottom left or right to turn the view around the mountain. Sideways scrolling on a trackpad does the same, and ▶ flies around automatically.
- Tap a run, lift, station badge, cabin or hut for details. Tapping a lift highlights it and dims the others; × on its card clears the highlight.

On a computer, right-drag or Ctrl-drag to tilt and rotate. On a phone, drag with two fingers.

## 1. Get the resort data (run on your Mac)

```bash
cd pipeline && npm install && npm test && npm run fetch
```

This writes `data/<resort-id>/{pistes,piste_areas,lifts,stations,boundary,structures,lift_spans,cabins,huts,pines}.geojson` and `data/manifest.json`.

`pines.geojson` holds tree positions for the iPhone app, which works offline:
- Trees are placed in OpenStreetMap forests (`landuse=forest` / `natural=wood` ways), below the tree line and away from runs and lifts.
- Forest multipolygon relations are not fetched, so a few large forests may be missing.
- The web map places its pines live from the OpenFreeMap landcover instead.
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
- **3D lifts** (`pipeline/lift3d.mjs`):
  - Towers are a mast with a crossarm turned across the lift line.
  - Stations have walls and a roof.
  - Cabins and chairs hang under the cable: gondola cabins about every 70 m, chairs every 28 m.
- **Hanging cables** (`pipeline/cables.mjs`): heights come from real ground elevation (AWS Terrain Tiles). The cable sags between towers, capped at half the tower height.

### Map looks (web map)

| Look | What it's like |
|---|---|
| **Cartoon** (default) | A toy trail map on bright snow. Runs are fat, candy-bright ribbons with a white rim and an ink outline, like stickers. Lifts are violet cables with yellow cabins and yellow cable-car station badges. Huts and mountain restaurants get a chalet badge. A few snowmen stand by the huts and stations, and tiny skiers in bright jackets slide down the runs. |
| **Satellite** | Real imagery on the same 3D terrain, with the same runs, lifts, huts and figures. |

Huts are every OSM `tourism=alpine_hut`/`wilderness_hut`, plus restaurants, cafés and bars that sit on a run (within 60 m) and away from a lift's valley station, so village restaurants stay off the map. Skiers and cabins stop moving with Reduce Motion, in Low Power Mode, in a background tab, or when the frame rate drops.

In every look:
- A valley tint blends the green valleys into the snow line, except on Satellite.
- Run-number badges keep extra spacing at medium zoom so they don't overlap.
- The selected lift glows and the other lifts dim.
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
