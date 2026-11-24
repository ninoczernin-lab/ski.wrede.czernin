---
version: 1
slug: "preview-index-html"
primary_target: "preview/index.html"
related_targets: ["preview/app.js","ios/SkiMaps/ResortBrowserView.swift"]
---

# Surface: resort map (preview/ web map + ios/SkiMaps map screen)

Mode: Experience. The skier is inside the mountain; the map is the work. Users plan at home and check runs on the mountain equally. Must keep: 271 resorts, regional run colours, search, 2D view, offline (iOS). Feels wrong if runs get harder to read or if effects stutter on a phone.

## Direction contract

THESIS: Each resort is a living miniature mountain at a chosen hour of the day, not a GIS layer stack. Refuses the category default: a flat top-down map with a toolbar and a layers drawer.

OWN-WORLD: Snow-white terrain with cool slate-blue north faces, white sunlit ridges, deep pine greens below the tree line, and an Alto-style sky gradient that shifts with the hour: dawn peach, noon cyan, golden-hour amber and rose, night indigo. Runs are crisp, high-contrast ribbons with a white edge hugging the terrain. Lifts are charcoal threads with small red cabins that move. The HUD is near-invisible: thin frosted glass in a light geometric face, tinted by the hour.

STORY: The skier picks or finds a resort, watches the camera fly in like a drone, reads every run and lift at a glance, and scrubs the hour to see the light change across the mountain.

FIRST VIEWPORT: Full-bleed tilted diorama of the resort. Top left, the resort name set large and light over the sky, with country and tier below. Top right, a search button. Right edge, a thin control rail. Bottom, the hour scrubber with a sun on an arc above the compass dial. Primary action: search, then tap a run or lift.

FORM: pinned brief: "Grand Mountain Adventure: High-craft isometric/tilted 3D diorama camera, crisp snow shading, soft ambient occlusion, stylized pine trees, miniature moving lift chairs, and subtle particle effects"; "Alto's Adventure: Atmospheric lighting, smooth dynamic time-of-day/golden-hour sky gradients, clean minimalist UI overlays, and fluid, tactile camera transitions"; "Steep / Shredders: Dramatic terrain relief, crisp ridge highlights, clean high-contrast trail ribbons that hug the 3D terrain naturally, and smooth fly-in drone/cinema camera angles"; "floating glassmorphism/minimalist HUD controls". seed: none (pinned)

Signature interaction: the hour scrubber relights sun, sky, shadows and HUD continuously. Motion grammar: a cinematic fly-in on resort select (one authored moment), slow cabins, light snow drift; all reduced under prefers-reduced-motion and when the frame budget slips.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
