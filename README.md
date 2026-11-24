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

Resorts: **271**, from `pipeline/catalog.mjs`:
- **Tier 1:** 12 resorts with over 2 M skier visits.
- **Tier 2:** 51 resorts with 1–2 M visits.
- **Tier 3:** 208 resorts with 0.5–1 M visits.

Each entry has the ski area's centre, a radius covering its lifts, and search words (villages, alternative names). After editing the catalogue, run `npm run catalog` in `pipeline/` to rebuild `resorts.json`. Runs and lifts load from OpenStreetMap the first time a resort is opened.

Controls:
- Search at the top by resort, village or country. With the field empty, it lists the tier 1 resorts. The globe button zooms out to every resort as a dot coloured by tier: coral = tier 1, blue = tier 2, grey = tier 3. Tap a dot to open that resort.
- Run colours follow each region's convention:
  - **Europe:** blue / red / black.
  - **North America, Australia and New Zealand:** green / blue / black / double black.
  - **Japan, Korea and China:** green / red / black.
- The round buttons on the right switch **2D/3D**, the **map style** (Playful, Winter map or Satellite) and the **lighting**.
- In 3D, drag the **compass dial** at the bottom left or right to turn the view around the mountain. Sideways scrolling on a trackpad does the same, and ▶ flies around automatically.
- Tap a run, lift, cabin or station for details. Tapping a lift highlights it and dims the others; × on its card clears the highlight.

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
- **3D lifts** (`pipeline/lift3d.mjs`):
  - Towers are a mast with a crossarm turned across the lift line.
  - Stations have walls and a roof.
  - Cabins and chairs hang under the cable: gondola cabins about every 70 m, chairs every 28 m.
- **Hanging cables** (`pipeline/cables.mjs`): heights come from real ground elevation (AWS Terrain Tiles). The cable sags between towers, capped at half the tower height.

### Map looks (web map)

| Look | What it's like |
|---|---|
| **Playful** (default) | Bright and cartoon-like: vivid blue sky, soft periwinkle shading, bright valley greens. Chunky runs with thick white outlines. Run numbers in coloured pill badges; peaks, villages and lifts in white bubbles. |
| **Winter map** | Crisp alpine look: snowy land, slate-blue shadows on north faces, white sunlit ridges, horizon haze, contour lines. |
| **Satellite** | Real imagery on the same 3D terrain. |

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
