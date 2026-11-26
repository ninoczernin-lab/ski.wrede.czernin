---
name: Ski Map
description: Each resort as a toy cartoon mountain at a chosen hour of the day.
colors:
  run-green: "#16c45e"
  run-blue: "#1e7bff"
  run-red: "#ff2e4d"
  run-black: "#1b1d2b"
  run-orange: "#ff9a1a"
  run-unclassified: "#8a90a6"
  sat-run-green: "#009e4a"
  sat-run-blue: "#0066e6"
  sat-run-red: "#e31221"
  sat-run-black: "#0d0d0d"
  sat-run-orange: "#fa8c00"
  sat-run-unclassified: "#737380"
  ink-line: "#1b2440"
  lift-violet: "#6a3df0"
  lift-yellow: "#ffc81e"
  lift-shadow: "#8d7fd6"
  lift-select-halo: "#ffe680"
  lift-mast: "#5b6688"
  hut-wood: "#b8743f"
  hut-roof: "#e8413a"
  window-glow: "#ffd86b"
  jacket-yellow: "#ffd21f"
  jacket-pink: "#ff4fb8"
  jacket-teal: "#12c2c2"
  sticker-shadow: "rgba(20, 28, 60, 0.28)"
  snow-white: "#ffffff"
  snow-land: "#f7fafd"
  snow-greenspace: "#edf2ee"
  lake-blue: "#79aed6"
  pine-low: "#244c3d"
  pine-mid: "#2f5f4b"
  pine-trunk: "#4a3a30"
  pine-snow: "#eef4f8"
  contour-line: "rgba(64, 86, 120, 0.22)"
  contour-text: "#5a6a82"
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
  sticker-plate: "rgba(255, 255, 255, 0.95)"
  sun: "#ffb23e"
  focus: "#1f6fe5"
  night-focus: "#8fb6ff"
  tier-1: "#ff3d5f"
  tier-2: "#2b8bff"
  tier-3: "#7a7fa8"
  tier-4: "#a3a9bd"
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
  legend:
    fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
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
  mark: "3px"
  swatch: "4px"
  focus-track: "12px"
  field: "14px"
  plate: "14px"
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
  plate-y: "8px"
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
  legend-plate:
    backgroundColor: "{colors.sticker-plate}"
    textColor: "{colors.ink-line}"
    typography: "{typography.legend}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  legend-swatch:
    backgroundColor: "{colors.run-blue}"
    rounded: "{rounded.swatch}"
    width: "20px"
    height: "8px"
  run-badge:
    backgroundColor: "{colors.run-blue}"
    textColor: "{colors.snow-white}"
    typography: "{typography.map-label}"
    rounded: "{rounded.full}"
    padding: "2px 6px"
  station-badge:
    backgroundColor: "{colors.lift-yellow}"
    textColor: "{colors.ink-line}"
    rounded: "{rounded.full}"
    size: "30px"
  hut-badge:
    backgroundColor: "{colors.snow-white}"
    textColor: "{colors.ink-line}"
    rounded: "{rounded.full}"
    size: "30px"
  primary-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sky-horizon-noon}"
    typography: "{typography.title-small}"
    rounded: "{rounded.field}"
    height: "48px"
---

# Design System: Ski Map

## Overview

**Creative North Star: "The Toy Mountain"**

Every resort is a toy mountain you could pick up: a playful cartoon trail map lit by a chosen hour, bold enough to read at a glance with gloves on. The map is the work; the interface is a few panes of thin frosted glass floating over it, tinted by the same sky that lights the snow. One value, the hour (5.5 to 21), drives the sun, the sky gradient, the relief shading, the 3D lights and the HUD at once, so the whole screen is always one coherent moment of the day.

The ground is snow-white terrain under the hour's sky, softly shaded (relief at half strength), with no valley tint and only faint 200 m contours. On that snow the runs are fat candy-bright ribbons in the region's own colour convention, each cut out like a sticker: colour, white rim, ink outline. Lifts are one family in two colours no region uses for runs: violet cables carrying sunny-yellow cabins, roofs and station badges. Every marker speaks one language (a round badge, a 2px ink outline, a white rim, a drawn glyph), and the legend is a sticker plate in that same language. Small snowmen stand by huts and stations; tiny skiers in bright jackets slide down the runs. Rank is strict: runs, then lifts and huts, then decorations.

Density is low on the chrome and high on the map. The HUD stays quiet: light Sora type, thin glass, hairline edges. The camera is the storyteller: one authored drone fly-in per resort, then calm.

**Key Characteristics:**
- One hour value tints sky, light, relief and glass together; nothing is lit independently.
- Runs are stickers: colour ribbon, white rim, ink outline, a glossy sheen stripe up close.
- Lifts are violet and yellow, two hues no region gives a run; a selected lift gains a yellow halo.
- Every marker is a round badge with a 2px ink outline, white rim and drawn glyph.
- Decorations (snowmen, skiers) are a light sprinkle, smaller than and drawn under every primary marker.
- Thin frosted glass HUD in Sora; the resort name set large and light over the sky.
- Effects step down before they stutter, and stand still under reduced motion.

## Colors

Snow white and sky carry the ground; runs own the candy colours, lifts own violet and yellow, and one navy ink outlines everything drawn on the map.

### Primary: the run palette
Runs map OSM difficulty to a colour name through the resort's regional scheme, then the colour name to the look's palette. The Cartoon look (default, and the iOS app) pushes the set vivid:
- **Candy Green** (run-green): beginner runs in France/Spain and Asia; "Easiest" in North America and Oceania.
- **Sticker Blue** (run-blue): easy runs in Europe; "More difficult" in North America.
- **Cherry Red** (run-red): intermediate runs in Europe and in Japan, Korea and China.
- **Night Black** (run-black): difficult and expert runs everywhere, a blue-black so it never reads as the ink outline's twin.
- **Tangerine** (run-orange): freeride routes.
- **Unmarked Slate** (run-unclassified): runs without a difficulty, drawn dashed (1.4, 0.9) and listed as a dashed "Not classified" legend entry only when the resort has any.

The Satellite look keeps the deeper base set (sat-run-green through sat-run-unclassified) so ribbons hold against real imagery; everything else (stickers, lifts, badges, figures) is shared.

Regional schemes: **Europe** blue / red / black plus orange freeride (France and Spain add green); **North America and Oceania** (US, CA, AU, NZ) green / blue / black / double black; **Japan, Korea, China** green / red / black.

### Secondary: the lift family
- **Lift Violet** (lift-violet): every cable, ground line and lift label, the ring on far-view cabin beads, the cable in the station glyph and the legend's lift mark.
- **Lift Yellow** (lift-yellow): 3D gondola and cable-car cabins, station roofs, far-view cabin beads, station badge fill.
- **Cable Shadow** (lift-shadow): the ground line under a hanging cable in 3D, at 22% opacity.
- **Selection Halo** (lift-select-halo): the wide, blurred sunny glow under a selected lift.
- **Mast Steel** (lift-mast): 3D masts. Crossarms and chairlift chairs are Ink Line; station walls are Snow White.

### Tertiary: the cartoon furniture
- **Ink Line** (ink-line): the outline of the whole cartoon layer: run sticker edges (at 92%), the 2px badge ring, figure outlines, hut-label text, legend plate border and text, the ring around card marks.
- **Hut Wood**, **Hut Roof**, **Window Glow**: the chalet glyph inside the white hut badge (also the snowman's scarf red).
- **Jacket Yellow / Pink / Teal**: skier jackets, chosen so no jacket is a run colour or lift violet.
- **Sticker Shadow** (sticker-shadow): the soft drop under every badge and run-number pill; figures cast lighter ground ellipses (20-22%).

### Sky and sun
- **Noon Zenith** and **Noon Horizon** are the 12:30 keyframe and the HUD defaults for `--sky-top` / `--sky-bottom`. The full hour keyframes (horizon, zenith, space, sun colour, ambient, hillshade shadow/highlight/accent, stars) live in the sidecar and are identical on web (`daylight.js`) and iOS (`Daylight.swift`).
- **Day-cycle strip** (track-night through track-late-night): the hour track's gradient stops at 0, 14, 30, 50, 80, 90 and 100%.
- **Sun Core** into **Low Sun** (sun) at 62%: the sun disc; Low Sun also tints the orbit needle, text caret, selection highlight and the hovered search row (16%). **Moon Shadow** sits under the pale moon after sunset.

### Neutral
- **Snow Land**, **Forest Snow**, **Lake Blue**: the Standard style repainted as toy snow. Greenspace sits close to the snow so forests draw no hard edge; landcover and pines carry the green.
- **Pine Low / Pine Mid / Pine Trunk / Pine Snow**: stacked octagonal pine tiers with a snow cap, only below the regional treeline (Europe 2050 m, North America 3450 m, Asia 2500 m). Cartoon look only.
- **Contour Line** and **Contour Text**: 200 m lines only, labels from zoom 14.5.
- **Label Ink** and **Peak Ink**: place and peak names with white halos; Satellite flips to white type on rgba(14, 22, 34, 0.85-0.9) halos.
- **Ink / Ink Soft / Ink Faint**: HUD text by day; **Night Ink** after dusk.
- **Glass / Glass Strong / Glass Edge / Hair** and their night variants: the HUD material. **Sticker Plate**: the near-opaque white legend plate.
- **Tier 1 / 2 / 3 / 4**: world-overview and search-result dots by skier visits (over 2 M, 1-2 M, 0.5-1 M, the rest), each on a white ring. Tier 4 dots appear only from zoom 4.5.

### Named Rules
**The Sticker Rule.** Everything drawn on the snow is cut out like a sticker. Runs: colour ribbon inside a white rim inside an ink outline. Badges: drawn glyph on a fill, a 3px white rim, a 2px ink ring. Run-number pills: a 2.5px white rim and a 1.4px ink line. Lifts and cables wear the white rim without ink, so they stay a lighter weight than runs. Colours never touch each other or the rock directly.

**The Lift Family Rule.** Violet and yellow belong to lifts and only lifts; no run, jacket or decoration uses them. A selected lift keeps its own violet, thickens, and gains the yellow halo; the other lifts dim to 40%. Selection never darkens the cable or borrows a run colour.

**The Jacket Rule.** Decoration colours are bright but never a run colour (green, blue, red, black, orange) and never lift violet.

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
- **Label** (500, 12-13px, 0.01em, tabular figures): country line and counts (with a sky-coloured halo), hour label, status.
- **Legend** (600, 12px): legend entries in Ink Line on the sticker plate.
- **Compass** (600, 10px, 0.08em): cardinal letters on the orbit dial.
- **Map labels**: run numbers in DIN Pro Bold, white on a run-coloured sticker pill, 11-13.5px by zoom; run names in DIN Pro Bold 12.5px in the run colour with a 2.4px white halo; lift names in DIN Pro Medium in Lift Violet with the lift type below at 0.78 scale, white halo; hut names in DIN Pro Bold 12px Ink Line from zoom 14; contour heights in DIN Pro Medium 10.5px.

### Named Rules
**The Light Title Rule.** The resort name is the one display moment: weight 300, tight tracking, set directly over the sky wash with no panel behind it.

**The Signage Rule.** Map text is DIN Pro, haloed in white; HUD text is Sora. The two never swap.

On iOS the same roles map to Dynamic Type: largeTitle light for the resort name, subheadline medium for meta, caption medium for the legend, headline for card names.

## Layout

Full-bleed map with fixed overlays. The camera sits at a 62° tilted pitch with terrain at 1.5x exaggeration; 2D drops pitch to 0.

- **Gutters:** max(16px, safe-area inset) on both sides; overlays respect the top and bottom safe areas.
- **Title block:** top left, 18px below the safe area, stopping 64px short of the right edge; a 220px sky wash fades from the zenith colour at 55% behind it. The legend plate sits 12px under the counts.
- **Search:** 48px round button top right; it opens into a 56px field up to 620px wide, centred, with results below at max min(62vh, 480px).
- **Rail:** vertical glass stack centred on the right edge (2D/3D, look, all resorts).
- **Dock:** bottom, 30px above the safe area, max 560px: the hour track (40px, sun on a dashed arc) over the 38px orbit dial.
- **Details card:** bottom, 150px above the safe area, max 560px.
- **At 900px and up:** the dock moves to the right (460px wide, clear of the rail) and the card to the bottom left (380px).
- **Far view:** zoomed out to the world, the title and hour row fade and lift 6px out of the way.
- **Map rank by zoom:** resort dots to 10.5; cabin beads 10.5-13.6; stations and 3D lift furniture from 11.5; huts from 12; run numbers, snowmen and skiers from 12.5; lift names from 13; hut names from 14; run names from 14.5.
- **Rhythm:** small steps (2, 4, 6, 8, 12, 14px) inside panels and the plate; 16px gutters outside.

## Elevation & Depth

Depth lives in the terrain: real relief, hour-driven directional light with cast shadows, hillshade plus a highlight-only ridge-light pass from the sun's side (both at half strength in the Cartoon look so the snow stays bright), ambient occlusion on the 3D lift furniture (0.35) and pines (0.45, radius 6), and fog that blends horizon into zenith and space. The HUD floats above it as one layer of frosted glass with a single soft shadow. The cartoon layer has its own small, soft drop: stickers sit on the snow, they do not float.

### Shadow Vocabulary
- **Glass float** (`box-shadow: 0 10px 30px -8px rgba(18, 30, 52, 0.28), 0 2px 6px rgba(18, 30, 52, 0.1)`): every glass panel and button.
- **Glass material** (`backdrop-filter: blur(22px) saturate(1.5)` with a 1px glass-edge border): the frosted surface itself.
- **Sticker drop** (Sticker Shadow, blur 1.5-4, offset 1.5 down): map badges and run-number pills.
- **Legend plate** (`box-shadow: 0 4px 12px -4px rgba(18, 30, 52, 0.3)`): the sticker plate's lift off the map.
- **Sun disc** (`0 0 0 1.5px rgba(255,255,255,0.95), 0 3px 8px rgba(18,30,52,0.28)`); the moon variant uses a softer ring and Moon Shadow.

### Named Rules
**The One Pane Rule.** The HUD has a single elevation: glass with the float shadow. No stacked cards, no second glass shadow tier. The legend is a map sticker, not a pane.

**The Night Glass Rule.** When the horizon luminance drops below 0.22 the page switches to `data-sky="dark"`: night glass, moonlight ink, a lighter focus ring. iOS switches system materials to their dark appearance at the same point. The sticker plate and map stickers stay white at night.

## Shapes

Soft, round, sticker-cut geometry. On the map everything is round: runs and lifts use round caps and joins, badges are circles (30px canvas, 3px white rim, 2px ink ring), run-number pills are stretchable capsules (radius 12). In the HUD, round buttons and pills are full circles or capsules; panels use large radii scaled to their size: field 14px, result row 18px, card and rail button 22px, results list 24px, rail, dock and token form 26px, search field 28px. Pill halves are named where they recur: the orbit dial 19px, the orbit play button 16px. The legend plate is a 14px-radius rectangle with a 1.5px Ink Line border. Small marks round to half their height: legend swatches 4px (20 x 8px, white 1.5px rim, ink ring at 2.7px), the card's lift mark 3px (24 x 5px violet cable), the hour track and orbit needle 1px. Lift marks in the legend and card carry a round yellow cabin bead with a violet ring. The one boxy geometry is the 3D furniture: masts, stations and cabins, and octagonal pine tiers. iOS uses continuous-corner rounded rectangles at 22pt and circles.

## Components

### Glass Panel
Thin frosted glass over the living map. Glass fill, 1px glass-edge border, glass-float shadow, blur 22px saturate 1.5. Used by the rail, dock, search, results and details card; the strong variant (82% / 78% at night) is for surfaces that carry reading text.

### Buttons
- **Round glass button:** 48px circle (search), 20px stroked icon at 1.75, presses to scale 0.92.
- **Rail button:** 44px, transparent on glass, hair fill on hover, 600 13px for the 2D/3D text toggle.
- **Orbit play:** 32px ink circle with sky-coloured glyph inside the orbit dial.
- **Primary (token screen):** 48px full-width ink button with sky-bottom text, 14px radius, 500 15px.
- **Focus:** 2px focus outline, 3px offset, everywhere.

### Search
A field that grows out of the round button: 56px, 28px radius, strong glass, 17px input with a sun-coloured caret. Results are rows with a tier dot (10px, white 2px ring), 500 15px name and a faint 12px meta line; the active row is tinted with the sun at 16%.

### Legend Plate (signature)
A sticker plate in the marker language: near-opaque white, 1.5px Ink Line border, 14px radius, 8 x 12px padding, 600 12px Ink Line text, entries in the region's own words and order. Run swatches are mini stickers (colour, white rim, ink ring); "Not classified" is a 4px dashed rule in Unmarked Slate; the lift mark is a violet cable with a yellow cabin bead; the hut mark is the hut badge itself. Opaque so runs passing under it never cut through its words.

### Map Markers
- **Station badge:** Lift Yellow badge with an ink cable car hanging from a violet cable, at both ends of every lift from zoom 11.5, always upright (0.85-1.2x).
- **Hut badge:** white badge with a chalet (wood walls, red roof with snow, lit window), from zoom 12, larger than any figure (1.1-1.5x). Never filled with a run colour.
- **Run-number pill:** white DIN Pro Bold number on the run colour, white rim, ink line, sticker drop.
- **Cabin bead:** far-view Lift Yellow dot with a 1.4px violet ring, handing over to 3D cabins by 13.6.

### Run Ribbon
Four stacked lines with round caps, widths by zoom (exponential 1.4) and identical on iOS: ink outline (6.6 to 19.6px, 92%), white rim (5 to 16px), colour line (3 to 12px), and from zoom 12 a white sheen stripe offset to one side (0.8 to 2.8px, fading in to 42%), like the glossy edge of a sticker. Piste areas carry a faint run-coloured fill (6 to 14%).

### Lift Line
On the ground a violet line (3.2 to 5px) on a white casing (6 to 9px); in 3D a violet cable at real clearance (3.8 to 6px) on a white halo (7.6 to 11px), with the ground line demoted to the 22% Cable Shadow. Selected (web): yellow halo (10 to 16px, blurred) under the same violet, thickened to 4.6-7px ground and 5.2-8px cable; other lifts dim to 40%, their stations to 60% and labels to 55%.

### Figures
Decorations drawn in the sticker language with a 1.3-1.7px ink outline and a soft ground ellipse. Snowmen (two snowballs, coal eyes, carrot, red scarf) stand by most huts and some stations; tiny skiers in Jacket colours slide down runs over 120 m, one per ~700 m and at most three per run. Both appear from zoom 12.5 and are drawn under station badges so a decoration never covers a primary marker.

### Details Card
Strong glass, 22px radius, a leading mark (a 14px run-colour dot with a 3px white rim and an Ink Line ring; the violet-and-yellow lift mark; or the 26px hut badge), title and soft detail line, 40px close button. Rises 12px into place.

### Hour Scrubber
A 2px track painted with the day itself, a faint dashed arc above it, and the sun disc riding the arc to the current hour; below the horizon it turns into a pale moon. Scrubbing relights the whole scene continuously. The hour label reads "HH:MM · Part of day" in tabular figures.

### Orbit Dial
A 38px horizontal compass strip of 1px ticks (5, 8, 11px) and cardinal letters, faded into the glass at both ends, with a 2px sun-coloured needle at centre. Drag to turn the view; play flies around the mountain.

### Motion
One ease for everything: cubic-bezier(0.16, 1, 0.3, 1). UI transitions run 150-600ms (rail 150ms, presses 200ms, search open 220/320ms, card 200/360ms, title 400ms, glass day/night 500ms, sky wash 600ms). The fly-in is the authored moment: a high drone pass then a 3200ms cubic ease-out arc onto the resort's angle; any drag or wheel interrupts it. 2D/3D tilt eases over 800ms; the world view flies out over 2600ms. Skiers flow down the runs and cabins ride the cables while the hour relights the mountain. Under prefers-reduced-motion, transitions collapse to 1ms, camera moves jump, cabins and skiers park, snow stops and the orbit turns at 3°/s instead of 8°/s. A frame-budget guard steps effects from full to lighter to static when over 30% of frames exceed 40ms. On iOS, the fly-in finishes with a 3.2s ease-out and overlays animate with `.snappy`.

## Do's and Don'ts

### Do:
- **Do** read every sky, sun, light, hillshade and HUD tint from the hour keyframes, on web and iOS alike.
- **Do** draw every run as a sticker: colour, white rim, ink outline, with the shared width stops on both platforms.
- **Do** keep lifts violet with yellow cabins, roofs and station badges, and mark a selected lift with the yellow halo around its own violet.
- **Do** draw every new map marker as a round badge with a 2px Ink Line ring, a white rim and a drawn glyph.
- **Do** keep huts larger than any figure and draw figures under station badges.
- **Do** colour runs through the resort's regional scheme, and show the legend in that region's words and order.
- **Do** set the resort name in Sora 300 over the sky wash, and HUD text in Sora; map text in DIN Pro.
- **Do** use the one ease cubic-bezier(0.16, 1, 0.3, 1) and keep the fly-in the only long camera move.
- **Do** step effects down (snow, then pines, figures and cabins) before frames slip, and park them under reduced motion.
- **Do** on iOS, adapt rather than copy: system materials, SF Symbols, Dynamic Type, 44pt targets.

### Don't:
- **Don't** use violet or yellow for a run, a jacket or any decoration, or a run colour for any part of a lift.
- **Don't** draw lifts in navy or charcoal; dark lift lines read as black runs.
- **Don't** fill a hut badge with a run colour; it vanishes on that run.
- **Don't** tint the valleys or add 50 m contours in the Cartoon look; they grey the snow.
- **Don't** let a decoration grow larger than a hut or cover a station badge, run number or run.
- **Don't** stack panels or add a second glass shadow tier; the HUD is one pane of glass.
- **Don't** put a filled bar or toolbar across the map; controls float as glass at the edges.
- **Don't** tint the HUD independently of the hour, or keep day glass after the horizon goes dark.
