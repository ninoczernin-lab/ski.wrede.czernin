# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Skiers and snowboarders, equally in two situations: planning a trip at home on a phone or laptop (exploring resorts, comparing, getting excited), and checking runs and lifts on the mountain (cold, bright snow glare, gloves, limited battery and signal).

## Product Purpose
A ski app with Google-Maps-like navigation. Its core is an interactive 3D map of ski resorts. Each resort's runs, lifts and stations sit on real terrain, can be searched and tapped, and are available offline in the iPhone app. Success means a skier finds a resort, understands its runs and lifts at a glance, and enjoys exploring it.

## Positioning
One map for 271 of the world's biggest ski resorts, from Ski Arlberg to Niseko. Runs and lifts are built from OpenStreetMap: lift cables hang at real heights over the terrain, cabins are spaced along them, and run colours follow each region's own convention.

## Operating Context
- **Web map** (`preview/`): MapLibre GL JS 5, live on GitHub Pages at https://ninoczernin-lab.github.io/ski.wrede.czernin/.
  - No account or token: OpenFreeMap vector tiles, AWS Terrain Tiles, Esri World Imagery (Satellite).
  - Data loads live from OpenStreetMap (Overpass) per resort.
- **iPhone app** (`ios/SkiMaps`): SwiftUI showing the same web map in a WKWebView (bundled, not hosted).
  - Native resort search; every map request goes through an on-disk cache; ⬇ saves a resort for offline use.
  - Moved off Mapbox in November 2026 when the Mapbox token stopped working; MapLibre Native had no 3D terrain yet.
  - Not yet compiled; the owner builds it in Xcode.
- **Shared data code** (`pipeline/`): OSM cleaning, cable geometry, 3D lift furniture, and the resort catalogue.

## Capabilities and Constraints
- **Resorts:** 1,324: 271 in three tiers by skier visits (tier 1 over 2 M, tier 2 1–2 M, tier 3 0.5–1 M) plus 1,053 more from the 2026 list. Search by resort, village or country. A world overview shows every resort as a dot.
- **Run colours follow the region:**
  - Europe: blue / red / black (plus green in France and Spain).
  - North America and Oceania: green / blue / black / double black.
  - Japan, Korea and China: green / red / black.
- **3D:** terrain at 1.5× exaggeration; hanging lift cables; towers, stations and cabins as 3D blocks; a 2D/3D switch; a compass dial to orbit the view; map looks Cartoon and Satellite; light from an hour slider; tap a run or lift for details, and a tapped lift is highlighted.
- **Must stay:** all 1,324 resorts, regional run colours, search, offline support in the iPhone app, and the 2D map view.
- **Performance:** effects must stay smooth on a phone; janky or battery-draining effects are a failure.
- **Readability:** run colours, run numbers and lifts must stay at least as readable as now under any styling.
- No paid map service or token: everything must keep working on free, keyless sources.

## Brand Commitments
No name, logo or brand assets yet.

## Evidence on Hand
- Resort catalogue: `pipeline/catalog.mjs`. Positions are from general knowledge plus terrain checks; a few Chinese resorts are unverified.
- Run and lift data comes live from OpenStreetMap.
- There are no user numbers, reviews or partnerships; none may be invented.

## Product Principles
- **Readable first, delightful always:** decoration never costs the skier the run colour, number or lift they need.
- **Real terrain, real lifts:** everything drawn stands on measured ground and real OSM geometry.
- **One map for every resort:** the same quality at the smallest tier 3 resort as at Ski Arlberg.
- **Smooth on a phone in the cold:** effects scale down before they stutter.
