---
version: 1
slug: "preview-index-html"
primary_target: "preview/index.html"
related_targets: ["preview/app.js","ios/SkiMaps/ResortBrowserView.swift","ios/SkiMaps/ResortMapView.swift"]
---

# Surface: resort map (preview/ web map + ios/SkiMaps map screen)

Mode: Experience. The skier is inside the mountain; the map is the work. Users plan at home and check runs on the mountain equally. Must keep: 1324 resorts, regional run colours, search, 2D view, satellite look, offline (iOS), the hour scrubber. Feels wrong if runs get harder to read or if effects stutter on a phone. Decorations are a light sprinkle, never louder than the runs.

## Direction contract

THESIS: Each resort is a toy mountain you could pick up: a playful cartoon trail map at a chosen hour, bold enough to read at a glance with gloves on. Refuses the category default: thin GIS lines on a muted basemap with a legend drawer.

OWN-WORLD: Snow-white terrain under the hour's sky. Runs are fat candy-bright ribbons (regional colours, pushed vivid) with a dark ink outline and a white inner rim, like a sticker cut from a trail map. Lifts are thick ink-navy cables with sunny-yellow station badges; huts are round tomato-red badges with a drawn chalet. Cartoon markers share one language: round badge, 2px ink outline, white rim, drawn glyph. Small snowmen stand near huts and stations; tiny skiers in bright jackets slide down the runs.

STORY: The skier finds a resort, watches the fly-in, reads every run, lift and hut instantly, smiles at the little skiers, and scrubs the hour.

FIRST VIEWPORT: Full-bleed tilted mountain. Top left, the resort name large and light over the sky. Top right, round search button. Right edge, thin control rail. Bottom, the hour scrubber and compass dial. Primary action: search, then tap a run, lift or hut.

FORM: pinned brief: "playful, cartoon-inspired style; ski lifts, slopes and mountain huts much bolder and easier to see, thicker lines, vibrant colors, clear cartoon-style icons or markers; miniature snowmen and tiny skiers moving down the runs". Code-led (no image generation). seed: none (pinned)

Signature interaction: tiny skiers flow down the runs while the hour scrubber relights the mountain. Motion: fly-in, skiers, slow cabins, light snow; all reduced under prefers-reduced-motion and when the frame budget slips.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
