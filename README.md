# Ski resort maps: prototype

3D, offline-capable resort maps for **Ski Arlberg**, **KitzSki** and **Les 3 Vallées**.
Piste and lift data comes from OpenStreetMap. Base map, terrain and offline tiles come from the Mapbox Maps SDK for iOS (v11).

```
pipeline/   Node script: OSM (Overpass) → slim GeoJSON per resort
data/       output of the pipeline (bundle this into the app as "ResortData")
ios/SkiMaps SwiftUI + Mapbox code: map view, resort search, offline downloads
```

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
5. Add the 4 Swift files and use `ResortBrowserView()` as the root view.

## How offline works

| Piece | Where it lives | Offline? |
|---|---|---|
| Pistes, lifts, stations (OSM GeoJSON) | app bundle | always |
| Style, fonts, icons | Mapbox style pack (`OfflineManager`) | after download |
| Base map + terrain DEM tiles z10–16 | Mapbox tile region per resort (`TileStore`) | after download |

Users tap ⬇ next to a resort to download it. Check the tile-count and offline limits in your Mapbox plan
and terms before raising `zoomRange`.

## Attribution (required)

Show "© OpenStreetMap contributors" in the app. OSM data is under the ODbL licence.
Mapbox shows its own attribution automatically.
