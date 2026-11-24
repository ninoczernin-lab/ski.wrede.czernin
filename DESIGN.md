---
name: Ski Map
description: Each resort as a living miniature mountain at a chosen hour of the day.
colors:
  run-green: "#14a85a"
  run-blue: "#1f6fe5"
  run-red: "#e2203a"
  run-black: "#141820"
  run-orange: "#f08a12"
  run-unclassified: "#6b7386"
  sat-run-green: "#009e4a"
  sat-run-blue: "#0066e6"
  sat-run-red: "#e31221"
  sat-run-black: "#0d0d0d"
  sat-run-orange: "#fa8c00"
  sat-run-unclassified: "#737380"
  lift-charcoal: "#232a33"
  lift-shadow: "#4a5361"
  lift-select-core: "#141a22"
  lift-chair: "#2a313b"
  lift-mast: "#6f7a88"
  lift-arm: "#353d49"
  station-wall: "#f1ece2"
  station-roof: "#b0362e"
  cabin-red: "#d8352f"
  snow-white: "#ffffff"
  snow-land: "#f4f7fb"
  snow-greenspace: "#e3ebe6"
  lake-blue: "#79aed6"
  pine-low: "#244c3d"
  pine-mid: "#2f5f4b"
  pine-trunk: "#4a3a30"
  pine-snow: "#eef4f8"
  contour-ink: "#33445c"
  label-ink: "#16202c"
  peak-ink: "#2c3b52"
  sky-zenith-noon: "#5aa6e8"
  sky-horizon-noon: "#f2f7fc"
  ink: "#121b27"
  ink-soft: "#3f4d60"
  ink-faint: "#6a778a"
  night-ink: "#eef2fb"
  night-ink-soft: "#c3cbe0"
  night-ink-faint: "#97a2bf"
  glass: "rgba(250, 252, 255, 0.58)"
  glass-strong: "rgba(250, 252, 255, 0.82)"
  glass-edge: "rgba(255, 255, 255, 0.55)"
  hair: "rgba(18, 27, 39, 0.1)"
  night-glass: "rgba(18, 22, 44, 0.5)"
  night-glass-strong: "rgba(18, 22, 44, 0.78)"
  night-glass-edge: "rgba(190, 200, 240, 0.18)"
  night-hair: "rgba(238, 242, 251, 0.14)"
  sun: "#ffb23e"
  focus: "#1f6fe5"
  night-focus: "#8fb6ff"
  tier-1: "#ff3d5f"
  tier-2: "#2b8bff"
  tier-3: "#7a7fa8"
  track-night: "#3a4478"
  track-dawn: "#f4b39b"
  track-morning: "#9cc8f0"
  track-noon: "#e9f2fb"
  track-golden: "#ffd28f"
  track-dusk: "#7d72b8"
  track-late-night: "#1c2446"
  sun-core: "#fff7e2"
  moon-shadow: "rgba(4, 8, 24, 0.45)"
typography:
  display:
    fontFamily: "Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 7.4vw, 46px)"
    fontWeight: 300
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 300
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  title-small:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  body:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  compass:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.08em"
  map-label:
    fontFamily: "DIN Pro Bold, Arial Unicode MS Bold"
    fontSize: "13.5px"
    fontWeight: 700
  map-label-medium:
    fontFamily: "DIN Pro Medium, Arial Unicode MS Regular"
    fontSize: "11px"
    fontWeight: 500
rounded:
  hairline: "1px"
  thread: "2px"
  swatch: "3px"
  focus-track: "12px"
  field: "14px"
  play: "16px"
  row: "18px"
  dial: "19px"
  card: "22px"
  list: "24px"
  panel: "26px"
  search: "28px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "12px"
  lg: "14px"
  gutter: "16px"
  title-top: "18px"
components:
  glass-panel:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 12px 10px"
  glass-round-button:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "48px"
  rail-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    size: "44px"
  rail-button-hover:
    backgroundColor: "{colors.hair}"
  search-field:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.search}"
    height: "56px"
    padding: "0 8px 0 20px"
  result-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title-small}"
    rounded: "{rounded.row}"
    padding: "11px 14px"
  details-card:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    padding: "14px 10px 14px 18px"
  orbit-play:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sky-horizon-noon}"
    rounded: "{rounded.play}"
    size: "32px"
  run-badge:
    backgroundColor: "{colors.run-blue}"
    textColor: "{colors.snow-white}"
    typography: "{typography.map-label}"
    rounded: "{rounded.full}"
    padding: "2px 6px"
  primary-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sky-horizon-noon}"
    typography: "{typography.title-small}"
    rounded: "{rounded.field}"
    height: "48px"
---

# Design System: Ski Map

## Overview

**Creative North Star: "The Living Diorama"**

Every resort is a miniature mountain on a table, lit by a chosen hour. The map is the work; the interface is a few panes of thin frosted glass floating over it, tinted by the same sky that lights the snow. One value, the hour (5.5 to 21), drives the sun, the sky gradient, the relief shading, the 3D lights and the HUD at once, so the whole screen is always one coherent moment of the day.

The world is snow-white terrain with cool slate-blue shading on the shadowed faces, white sunlit ridges, deep pine greens below the tree line, and an Alto-style sky that moves from pre-dawn indigo through peach, noon cyan and golden-hour amber to night. On that snow, colour belongs to the runs: crisp, high-contrast ribbons in the region's own convention, each hugged by a white edge. Lifts are the counterpoint, hueless charcoal threads with a white hairline, carrying small red cabins that move.

Density is low on the chrome and high on the map. The HUD stays near-invisible: light Sora type, thin glass, hairline edges, no fills that compete with terrain. The camera is the storyteller: one authored drone fly-in per resort, then calm.

**Key Characteristics:**
- One hour value tints sky, light, relief and glass together; nothing is lit independently.
- Run colour is the only saturated colour on the snow; lifts and selection carry no hue.
- Every line on the terrain wears a white edge so it reads on snow, rock and shadow alike.
- Thin frosted glass HUD in Sora; the resort name set large and light over the sky.
- Miniature level of detail: cabins and pines grow when zoomed out so the model still reads.
- Effects step down before they stutter, and stand still under reduced motion.

## Colors

A white-snow world where the run palette owns all the saturation, lifts and chrome stay hueless, and the sky changes with the hour.

### Primary: the run palette
Runs map OSM difficulty to a colour name through the resort's regional scheme, then the colour name to the look's palette. The Diorama look (default, and the iOS app) uses the brightened set:
- **Groomed Green** (run-green): beginner runs in France/Spain and Asia; "Easiest" and the green circle in North America and Oceania.
- **Piste Blue** (run-blue): easy runs in Europe; "More difficult" in North America.
- **Alpine Red** (run-red): intermediate runs in Europe and in Japan, Korea and China.
- **Diamond Black** (run-black): difficult and expert runs everywhere.
- **Off-piste Orange** (run-orange): freeride routes.
- **Unmarked Slate** (run-unclassified): runs without a difficulty; drawn dashed (1.5, 1) on the map in the same colour as its dashed "Not classified" legend entry, which appears only when the resort has any.

The Satellite look keeps the deeper base set (sat-run-green through sat-run-unclassified) so ribbons hold against real imagery.

Regional schemes: **Europe** blue / red / black plus orange freeride (France and Spain add green); **North America and Oceania** (US, CA, AU, NZ) green / blue / black / double black; **Japan, Korea, China** green / red / black.

### Secondary: the lift palette
- **Cable Charcoal** (lift-charcoal): every unselected lift, ground line and hanging cable; cabin far-view dots; lift labels.
- **Cable Shadow** (lift-shadow): the faint ground shadow under a hanging cable in 3D.
- **Selected Core** (lift-select-core): the heavier core of a selected lift, over a wide white halo.
- **Chair Charcoal** (lift-chair), **Mast Steel** (lift-mast), **Crossarm** (lift-arm), **Station Plaster** (station-wall), **Station Roof** (station-roof): the 3D lift furniture.
- **Cabin Red** (cabin-red): 3D gondola and cable-car cabin bodies only.

### Tertiary: sky and sun
- **Noon Zenith** (sky-zenith-noon) and **Noon Horizon** (sky-horizon-noon) are the 12:30 keyframe and the HUD defaults for `--sky-top` / `--sky-bottom`. The full hour keyframes (horizon, zenith, space, sun colour, ambient, hillshade shadow/highlight/accent, stars) live in the sidecar and are identical on web (`daylight.js`) and iOS (`Daylight.swift`).
- **Day-cycle strip** (track-night, track-dawn, track-morning, track-noon, track-golden, track-dusk, track-late-night): the hour track's gradient stops at 0, 14, 30, 50, 80, 90 and 100%, a compressed mirror of the hour keyframes so the scrubber shows the day it controls.
- **Sun Core** (sun-core): the warm inner light of the sun glyph, a radial gradient into Low Sun at 62%.
- **Moon Shadow** (moon-shadow): the deeper night drop shadow under the sun glyph once it has set and turned to a pale moon.
- **Low Sun** (sun): the sun disc, the orbit needle, the text caret, selection highlight and the hovered search row (mixed at 16%).

### Neutral
- **Snow Land** (snow-land), **Forest Snow** (snow-greenspace), **Lake Blue** (lake-blue): the Standard style repainted as a snow model, theme "faded". Greenspace sits close to the snow so forests draw no hard edge; the valley tint and pines carry the green.
- **Pine Low / Pine Mid / Pine Trunk / Pine Snow**: stacked octagonal pine tiers with a snow cap, only below the regional treeline (Europe 2050 m, North America 3450 m, Asia 2500 m).
- **Valley tint**: an elevation ramp from rgba(40, 84, 64, 0.42) at 500 m to clear at 2100 m, Diorama only.
- **Ink / Ink Soft / Ink Faint**: HUD text by day; **Night Ink** set after dusk.
- **Glass / Glass Strong / Glass Edge / Hair** and their night variants: the HUD material.
- **Contour Ink**, **Label Ink**, **Peak Ink**: map type with white halos in Diorama; Satellite flips to white type on rgba(14, 22, 34, 0.85-0.9) halos.
- **Tier 1 / 2 / 3**: world-overview dots and search-result dots by skier visits (white 2px ring).

### Named Rules
**The Runs Own Colour Rule.** Saturated hue on the snow belongs to runs. Lifts, selection, cabin dots and chrome are charcoal, white or glass. A selected lift is a white halo under a charcoal core, never a hue.

**The White Edge Rule.** Every line drawn on the terrain sits on a white casing: runs on a casing about 2.6px wider than the ribbon, lifts and cables on a white hairline, cabin dots on a 1px white stroke, legend swatches on a 1.5px white ring. Colours never touch each other or the rock directly.

**The Cabin Red Rule.** Cabin Red appears only on 3D cabin bodies (and the related station roof). Far-view cabin dots are charcoal with a white edge.

**The One Hour Rule.** The sky, sun, lights, hillshade and HUD tint are all read from one interpolated keyframe table. Never set a sky colour, glass tint or light by hand outside it.

## Typography

**Display Font:** Sora (variable 100-800, self-hosted woff2, `font-display: swap`), falling back to ui-sans-serif, system-ui, -apple-system, Segoe UI.
**Body Font:** Sora.
**Map Font:** DIN Pro Bold / DIN Pro Medium (Mapbox glyphs), falling back to Arial Unicode MS.

**Character:** A light, open geometric face that reads as air over the mountain, paired on the map with a compact signage grotesk that reads like piste markers.

### Hierarchy
- **Display** (300, clamp(28px, 7.4vw, 46px), 1.02, -0.03em, balanced wrap): the resort name over the sky, with a soft sky-coloured text shadow.
- **Headline** (300, 30px, -0.03em): the token screen title.
- **Title** (500, 17px, -0.01em): details-card name; the search field input at 400.
- **Title Small** (500, 15px): search result names and the token screen button.
- **Body** (400, 14px/1.4): base UI.
- **Label** (500, 12-13px, 0.01em, tabular figures): country and tier line, run and lift counts, legend, hour label, status.
- **Compass** (600, 10px, 0.08em): cardinal letters on the orbit dial.
- **Map labels**: run numbers in DIN Pro Bold, white on a run-coloured pill, 11-13.5px by zoom; lift names in DIN Pro Medium with the lift type below at 0.78 scale, charcoal on a white bubble; run names in DIN Pro Bold 12.5px in the run colour with a 2.4px white halo; contour heights in DIN Pro Medium 10.5px.

### Named Rules
**The Light Title Rule.** The resort name is the one display moment: weight 300, tight tracking, set directly over the sky wash with no panel behind it.

**The Signage Rule.** Map text is DIN Pro, haloed or bubbled in white; HUD text is Sora. The two never swap.

On iOS the same roles map to Dynamic Type: largeTitle light for the resort name, subheadline medium for meta, caption medium for the legend, headline for card names.

## Layout

Full-bleed map with fixed overlays. The camera sits at a 62° tilted-diorama pitch with terrain at 1.5x exaggeration; 2D drops pitch to 0.

- **Gutters:** max(16px, safe-area inset) on both sides; overlays respect the top and bottom safe areas.
- **Title block:** top left, 18px below the safe area, stopping 64px short of the right edge; a 220px sky wash fades from the zenith colour at 55% behind it.
- **Search:** 48px round button top right; it opens into a 56px field up to 620px wide, centred, with results below at max min(62vh, 480px).
- **Rail:** vertical glass stack centred on the right edge (2D/3D, look, all resorts).
- **Dock:** bottom, 30px above the safe area, max 560px: the hour track (40px, sun on a dashed arc) over the 38px orbit dial.
- **Details card:** bottom, 150px above the safe area, max 560px.
- **At 900px and up:** the dock moves to the right (460px wide, clear of the rail) and the card to the bottom left (380px).
- **Far view:** zoomed out to the world, the title and hour row fade and lift 6px out of the way.
- **Rhythm:** small steps (2, 4, 6, 12, 14px) inside panels; 16px gutters outside.

## Elevation & Depth

Depth lives in the terrain: real relief, hour-driven directional light with cast shadows (intensity 0.75 when the sun is up), hillshade whose relief strengthens as the sun lowers (0.75 at noon to 0.95 at the horizon), ambient occlusion on the 3D lift furniture (0.35) and pines (0.45, radius 6), and fog that blends horizon into zenith and space. The HUD floats above it as one layer of frosted glass with a single soft shadow.

### Shadow Vocabulary
- **Glass float** (`box-shadow: 0 10px 30px -8px rgba(18, 30, 52, 0.28), 0 2px 6px rgba(18, 30, 52, 0.1)`): every glass panel and button.
- **Glass material** (`backdrop-filter: blur(22px) saturate(1.5)` with a 1px glass-edge border): the frosted surface itself.
- **Sun disc** (`0 0 0 1.5px rgba(255,255,255,0.95), 0 3px 8px rgba(18,30,52,0.28)`): the sun marker. Below the horizon the moon variant uses a softer ring and Moon Shadow (`0 0 0 1.5px rgba(255,255,255,0.7), 0 3px 8px rgba(4,8,24,0.45)`).
- **Badge lift** (canvas shadow rgba(30, 34, 80, 0.28), blur 4, offset 1.5): run-number pills on the map.

### Named Rules
**The One Pane Rule.** The HUD has a single elevation: glass with the float shadow. No stacked cards, no second shadow tier.

**The Night Glass Rule.** When the horizon luminance drops below 0.22 the page switches to `data-sky="dark"`: night glass, moonlight ink, a lighter focus ring. iOS switches system materials to their dark appearance at the same point.

## Shapes

Soft, continuous, pill-leaning geometry. Round buttons and pills are full circles or capsules; panels use large radii scaled to their size: field 14px, result row 18px, card and rail button 22px, results list 24px, rail, dock and token form 26px, search field 28px. Pill halves are named where they recur: the orbit dial 19px (half its 38px height), the orbit play button 16px (half of 32px). Small marks round to their own half-height: the hour track and orbit needle 1px, the lift thread on the card 2px, legend swatches 3px. The hour slider's focus outline follows a 12px radius. Legend and card swatches are capsules (run 20 x 6px, lift 22 x 4px thread, unclassified a 4px dashed rule in run-unclassified). On the map, lines use round caps and joins; run-number badges are stretchable rounded pills (radius 12). The one sharp-edged geometry is the 3D furniture: boxy masts, stations and cabins, and octagonal pine tiers. iOS uses continuous-corner rounded rectangles at 22pt and circles.

## Components

### Glass Panel
Thin frosted glass over the living map. Glass fill, 1px glass-edge border, glass-float shadow, blur 22px saturate 1.5. Used by the rail, dock, search, results and details card; the strong variant (82% / 78% at night) is for surfaces that carry reading text.

### Buttons
- **Round glass button:** 48px circle (search), 20px stroked icon at 1.75, presses to scale 0.92.
- **Rail button:** 44px, transparent on glass, hair fill on hover, 600 13px for the 2D/3D text toggle.
- **Orbit play:** 32px ink circle with sky-coloured glyph inside the orbit dial.
- **Primary (token screen):** 48px full-width ink button with sky-bottom text (`--sky-bottom`, so it inverts with night glass), 14px radius, 500 15px.
- **Focus:** 2px focus outline, 3px offset, everywhere.

### Search
A field that grows out of the round button: 56px, 28px radius, strong glass, 17px input with a sun-coloured caret. Results are rows with a tier dot (10px, white ring), 500 15px name and a faint 12px meta line; the active row is tinted with the sun at 16%.

### Hour Scrubber (signature)
A 2px track painted with the day itself (night indigo, dawn peach, morning blue, noon white, golden amber, dusk violet, night), a faint dashed arc above it, and the sun disc riding the arc to the current hour; below the horizon it turns into a pale moon. Scrubbing relights the whole scene continuously. The hour label reads "HH:MM · Part of day" in tabular figures.

### Orbit Dial
A 38px horizontal compass strip of 1px ticks (5, 8, 11px) and cardinal letters, faded into the glass at both ends, with a 2px sun-coloured needle at centre. Drag to turn the view; play flies around the mountain.

### Details Card
Strong glass, 22px radius, a 14px run-colour dot with a 3px white ring (a 22 x 4px charcoal thread for lifts), title and soft detail line, 40px close button. Rises 12px into place.

### Map Layers
- **Run ribbon:** white casing (3.6 to 10.8px by zoom), colour line (1.8 to 7.5px, exponential 1.4), a white sheen down the middle from zoom 12 (up to 38%), and a faint run-coloured fill on piste areas (6 to 14%).
- **Lift thread:** charcoal line on a white hairline casing on the ground; in 3D a hanging cable at real clearance with its own white halo. Selected: wide white glow (7 to 12px, blurred) under a heavier charcoal core; others dim to 40%.
- **Lift furniture:** masts, crossarms, stations and cabins as fill-extrusions; terminals as white dots with a charcoal ring.
- **Cabin dots:** charcoal with a 1px white edge from zoom 10.5, handing over to 3D cabins by 13.6.
- **Pines:** stylized tiered pines in real forest areas below the treeline, larger when zoomed out.
- **Snow:** light canvas snow drift in 3D at resort zoom, softer at night.

### Motion
One ease for everything: cubic-bezier(0.16, 1, 0.3, 1). UI transitions run 150-600ms (rail 150ms, presses 200ms, search open 220/320ms, card 200/360ms, title 400ms, sky wash 600ms). The fly-in is the authored moment: a high drone pass (flyTo at zoom -1.4, bearing -55°, pitch 44, curve 1.6, speed 1.1) then a 3200ms cubic ease-out arc onto the resort's angle; any drag or wheel interrupts it. 2D/3D tilt eases over 800ms; the world view flies out over 2600ms. Under prefers-reduced-motion, transitions collapse to 1ms, camera moves jump, cabins park, snow stops and the orbit turns at 3°/s instead of 8°/s. A frame-budget guard steps effects from full to lighter (no snow, fewer pines) to static when over 30% of frames exceed 40ms. On iOS, the fly-in finishes with a 3.2s ease-out and overlays animate with `.snappy`.

## Do's and Don'ts

### Do:
- **Do** read every sky, sun, light, hillshade and HUD tint from the hour keyframes, on web and iOS alike.
- **Do** give every run, lift, cable and cabin dot a white edge so it reads on snow, rock and shadow.
- **Do** colour runs through the resort's regional scheme, and show the legend in that region's words and order.
- **Do** keep lifts and lift selection hueless: charcoal threads, a white halo and a heavier charcoal core.
- **Do** set the resort name in Sora 300 over the sky wash, and HUD text in Sora; map text in DIN Pro.
- **Do** use the one ease cubic-bezier(0.16, 1, 0.3, 1) and keep the fly-in the only long camera move.
- **Do** step effects down (snow, then pines and cabins) before frames slip, and park them under reduced motion.
- **Do** on iOS, adapt rather than copy: system materials, SF Symbols, Dynamic Type, 44pt targets.

### Don't:
- **Don't** give a selected lift, cabin dot or lift line a run colour or any hue.
- **Don't** use Cabin Red outside 3D cabin bodies.
- **Don't** stack panels or add a second shadow tier; the HUD is one pane of glass.
- **Don't** put a filled bar or toolbar across the map; controls float as glass at the edges.
- **Don't** tint the HUD independently of the hour, or keep day glass after the horizon goes dark.
- **Don't** let decoration (sheen, pines, snow, tint) lower the contrast of a run colour, run number or lift.
