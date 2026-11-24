import SwiftUI
// Elevated lines (line-z-offset) are an experimental Mapbox v11 API.
@_spi(Experimental) import MapboxMaps

/// Each resort as a living miniature mountain at a chosen hour: Mapbox Standard repainted as a crisp
/// snow diorama, real terrain, relief and ridge light from the sun's side, OSM runs as high-contrast
/// ribbons and hanging lift cables. One MapView for every resort; switching resort flies the camera in.
struct ResortMapView: UIViewRepresentable {
    let resort: Resort?
    var is3D: Bool = true
    var satellite = false                     // Diorama (Standard) or Standard Satellite imagery
    var hour: Double = 15.5                   // time of day; drives sun, sky and shading (Daylight.swift)
    var isScrubbing = false                   // while the hour slider is held, skip Standard's heavy preset switch
    @Binding var selectedFeature: [String: Any]?

    static let terrainExaggeration = 1.5
    static let pitch3D = 62.0                 // tilted-diorama angle

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MapView {
        let opts = MapInitOptions(styleURI: satellite ? .standardSatellite : OfflineResortStore.styleURI)
        let mapView = MapView(frame: .zero, mapInitOptions: opts)
        mapView.ornaments.options.scaleBar.visibility = .hidden
        mapView.ornaments.options.compass.visibility = .visible
        mapView.location.options.puckType = .puck2D(.makeDefault(showBearing: true))
        mapView.location.options.puckBearingEnabled = true
        // Two-finger vertical drag tilts, twist rotates.
        mapView.gestures.options.pitchEnabled = true
        mapView.gestures.options.rotateEnabled = true
        try? mapView.mapboxMap.setCameraBounds(with: CameraBoundsOptions(maxPitch: 85))
        context.coordinator.attach(mapView)
        return mapView
    }

    func updateUIView(_ mapView: MapView, context: Context) {
        let c = context.coordinator
        let old = c.parent
        c.parent = self
        c.show(resort)
        if old.is3D != is3D { c.apply3D(is3D, animated: true) }
        if old.satellite != satellite { c.switchStyle(satellite: satellite) }
        if old.hour != hour || old.isScrubbing != isScrubbing { c.applyLight() }
    }

    final class Coordinator {
        var parent: ResortMapView
        private weak var mapView: MapView?
        private var styleLoaded = false
        private var currentId: String?
        private var tokens = Set<AnyCancelable>()
        private var tracks: [LiftTrack] = []          // moving cabins (LiftMotion.swift)
        private var trees: [Pines.Tree] = []           // offline pines (Pines.swift)
        private var ticker: Ticker?
        private let sceneStart = Date()
        private var observers: [NSObjectProtocol] = []

        static let liftShadowOpacity = 0.25
        static let groundLifts = ["rope_tow", "magic_carpet", "zip_line"]
        /// Ground lifts always opaque; aerial lifts faint in 3D (the cable above is the real lift).
        static func liftOpacityJSON(is3D: Bool) -> [Any] {
            ["match", ["get", "aerialway"], groundLifts, 1.0, is3D ? liftShadowOpacity : 1.0]
        }
        private let sources = ["pistes", "piste_areas", "lifts", "lift_spans", "stations", "structures", "cabins"]
        private let liveSources = ["pines", "cabin-dots"]      // filled in code, not from bundle URLs
        private let layers = ["piste-areas-fill", "pistes-casing", "pistes-line", "pistes-sheen", "pistes-unknown", "lifts-line", "lifts-cable",
                              "pines-3d", "structures-3d", "cabins-3d", "cabin-dots", "pistes-label", "lifts-label"]

        init(_ parent: ResortMapView) { self.parent = parent }

        func attach(_ mapView: MapView) {
            self.mapView = mapView
            mapView.mapboxMap.onStyleLoaded.observeNext { [weak self] _ in
                guard let self else { return }
                self.styleLoaded = true
                self.configureStandard()
                self.addTerrain()
                self.currentId = nil
                self.show(self.parent.resort)
                self.apply3D(self.parent.is3D, animated: false)
            }.store(in: &tokens)

            // Pines follow the camera; the cabin loop starts and stops with zoom, 2D/3D, power and motion settings.
            mapView.mapboxMap.onMapIdle.observe { [weak self] _ in
                self?.refreshPines()
                self?.updateMotion()
            }.store(in: &tokens)
            let nc = NotificationCenter.default
            for name in [UIApplication.didEnterBackgroundNotification, UIApplication.willEnterForegroundNotification,
                         Notification.Name.NSProcessInfoPowerStateDidChange, UIAccessibility.reduceMotionStatusDidChangeNotification] {
                observers.append(nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.updateMotion() })
            }

            for layer in ["pistes-line", "pistes-unknown", "lifts-line", "lifts-cable", "structures-3d", "cabins-3d"] {
                mapView.gestures.onLayerTap(layer) { [weak self] feature, _ in
                    self?.parent.selectedFeature = feature.feature.properties?.mapValues { $0?.rawValue ?? "" }
                    return true
                }.store(in: &tokens)
            }
        }

        // MARK: Standard style config (3D buildings, trees, lighting)

        /// Satellite imagery or the snow diorama. The style reload re-adds terrain, runs and lifts via onStyleLoaded.
        /// Offline tile regions hold the diorama style only, so satellite needs a connection.
        func switchStyle(satellite: Bool) {
            guard let mapView else { return }
            styleLoaded = false
            lastPreset = nil
            mapView.mapboxMap.styleURI = satellite ? .standardSatellite : OfflineResortStore.styleURI
        }

        private func configureStandard() {
            guard let map = mapView?.mapboxMap else { return }
            if parent.satellite {
                for key in ["showPointOfInterestLabels", "showTransitLabels", "showRoadLabels"] {
                    try? map.setStyleImportConfigProperty(for: "basemap", config: key, value: false)
                }
                applyLight()
                return
            }
            // Snow diorama: faded theme, snow-toned land, greenspace close to the snow so forests draw no hard edge.
            let config: [String: Any] = [
                "theme": "faded", "colorLand": "#f4f7fb", "colorGreenspace": "#e3ebe6", "colorWater": "#79aed6",
                "show3dObjects": true, "showPointOfInterestLabels": false, "showTransitLabels": false, "showRoadLabels": false,
            ]
            for (key, value) in config { try? map.setStyleImportConfigProperty(for: "basemap", config: key, value: value) }
            applyLight()
        }

        private var lastPreset: String?
        /// The hour: Standard's preset, an Alto-style sky gradient in the atmosphere, and relief lit from the sun's side.
        func applyLight() {
            guard let map = mapView?.mapboxMap else { return }
            let d = Daylight(hour: parent.hour, southern: (parent.resort?.camera.lat ?? 47) < 0)
            if !parent.isScrubbing && d.preset != lastPreset {
                try? map.setStyleImportConfigProperty(for: "basemap", config: "lightPreset", value: d.preset)
                lastPreset = d.preset
            }
            var atmosphere = Atmosphere()
            atmosphere.color = .constant(StyleColor(d.horizon))
            atmosphere.highColor = .constant(StyleColor(d.zenith))
            atmosphere.spaceColor = .constant(StyleColor(d.space))
            atmosphere.horizonBlend = .constant(0.12)
            atmosphere.range = .constant([0.6, 9])
            atmosphere.starIntensity = .constant(d.stars)
            try? map.setAtmosphere(atmosphere)
            guard map.layerExists(withId: "relief") else { return }
            try? map.setLayerProperties(for: "relief", properties: [
                "hillshade-shadow-color": d.shadow.hexString, "hillshade-highlight-color": d.highlight.hexString,
                "hillshade-accent-color": d.accent.hexString, "hillshade-illumination-direction": d.azimuth,
                "hillshade-exaggeration": d.relief,
            ])
            try? map.setLayerProperties(for: "ridge-light", properties: [
                // Fades with the sun's height (−1° → 6°) instead of snapping at sunset.
                "hillshade-illumination-direction": d.azimuth, "hillshade-exaggeration": 0.15 + 0.4 * min(1, max(0, (d.altitude + 1) / 7)),
            ])
        }

        // MARK: Terrain + relief

        private func addTerrain() {
            guard let map = mapView?.mapboxMap else { return }
            var dem = RasterDemSource(id: "mapbox-dem")
            dem.url = OfflineResortStore.demTileset
            dem.tileSize = 512
            dem.maxzoom = 14
            try? map.addSource(dem)

            var terrain = Terrain(sourceId: "mapbox-dem")
            terrain.exaggeration = .constant(ResortMapView.terrainExaggeration)
            try? map.setTerrain(terrain)

            // Hillshade makes slope steepness readable, especially when looking straight down.
            // Own DEM source: sharing the terrain source halves the shading resolution.
            var shadeDem = RasterDemSource(id: "mapbox-dem-shade")
            shadeDem.url = OfflineResortStore.demTileset
            shadeDem.tileSize = 512
            shadeDem.maxzoom = 14
            try? map.addSource(shadeDem)
            var relief = HillshadeLayer(id: "relief", source: "mapbox-dem-shade")
            relief.slot = .bottom
            relief.hillshadeIlluminationAnchor = .constant(.map)
            try? map.addLayer(relief)
            // Ridge light: a highlight-only pass from the sun's side so crests catch a crisp white edge.
            var ridge = HillshadeLayer(id: "ridge-light", source: "mapbox-dem-shade")
            ridge.slot = .bottom
            ridge.hillshadeIlluminationAnchor = .constant(.map)
            ridge.hillshadeShadowColor = .constant(StyleColor(.clear))
            ridge.hillshadeAccentColor = .constant(StyleColor(.clear))
            ridge.hillshadeHighlightColor = .constant(StyleColor(UIColor(white: 1, alpha: 0.9)))
            try? map.addLayer(ridge)
            applyLight()
        }

        /// 3D: tilted camera + terrain. 2D: flat top-down map (relief shading stays for orientation).
        func apply3D(_ on: Bool, animated: Bool) {
            guard styleLoaded, let mapView else { return }
            let map = mapView.mapboxMap
            if on {
                var terrain = Terrain(sourceId: "mapbox-dem")
                terrain.exaggeration = .constant(ResortMapView.terrainExaggeration)
                try? map.setTerrain(terrain)
            } else {
                map.removeTerrain()
            }
            for id in ["structures-3d", "cabins-3d", "pines-3d", "cabin-dots"] where map.layerExists(withId: id) {
                try? map.setLayerProperty(for: id, property: "visibility", value: on ? "visible" : "none")
            }
            // 3D: cables hang in the air and the line on the ground becomes their faint shadow.
            // 2D: no cables; the ground line is the lift.
            if map.layerExists(withId: "lifts-cable") {
                try? map.setLayerProperty(for: "lifts-cable", property: "visibility", value: on ? "visible" : "none")
                try? map.setLayerProperty(for: "lifts-line", property: "line-opacity",
                                          value: Coordinator.liftOpacityJSON(is3D: on))
            }
            try? map.setStyleImportConfigProperty(for: "basemap", config: "show3dObjects", value: on)
            let cam = CameraOptions(pitch: on ? ResortMapView.pitch3D : 0)
            if animated { mapView.camera.ease(to: cam, duration: 0.8) } else { map.setCamera(to: cam) }
            updateMotion()
        }

        // MARK: Resort data

        func show(_ resort: Resort?) {
            guard styleLoaded, let map = mapView?.mapboxMap, let r = resort, r.id != currentId else { return }
            currentId = r.id
            for id in layers.reversed() where map.layerExists(withId: id) { try? map.removeLayer(withId: id) }
            for id in sources + liveSources where map.sourceExists(withId: id) { try? map.removeSource(withId: id) }
            ticker?.stop(); ticker = nil
            tracks = []; trees = []
            for layer in sources {
                guard let url = r.layerURL(layer) else { continue }
                var src = GeoJSONSource(id: layer)
                src.data = .url(url)
                if layer == "lift_spans" { src.lineMetrics = true }   // needed for line-progress
                try? map.addSource(src)
            }
            for id in liveSources {
                var src = GeoJSONSource(id: id)
                src.data = .featureCollection(FeatureCollection(features: []))
                try? map.addSource(src)
            }
            addLayers(map, country: r.country)
            applyLight()
            flyIn(r)
            loadLiving(r)
        }

        // MARK: Living scene: moving cabins and pines

        /// Parse the bundled cable spans and pine points off the main thread, then start the scene.
        private func loadLiving(_ r: Resort) {
            let spansURL = r.layerURL("lift_spans"), pinesURL = r.layerURL("pines"), id = r.id
            Task.detached(priority: .utility) {
                let decode = { (url: URL?) -> FeatureCollection? in
                    guard let url, let data = try? Data(contentsOf: url) else { return nil }
                    return try? JSONDecoder().decode(FeatureCollection.self, from: data)
                }
                let t = decode(spansURL).map(LiftMotion.tracks(from:)) ?? []
                let p = decode(pinesURL).map(Pines.load) ?? []
                await MainActor.run { [weak self] in
                    guard let self, self.currentId == id else { return }
                    self.tracks = t; self.trees = p
                    self.refreshPines()
                    self.updateMotion()
                }
            }
        }

        private var zoom: Double { mapView?.mapboxMap.cameraState.zoom ?? 0 }
        private var visibleBounds: CoordinateBounds? {
            guard let map = mapView?.mapboxMap else { return nil }
            return map.coordinateBounds(for: CameraOptions(cameraState: map.cameraState))
        }
        private var lowPower: Bool { ProcessInfo.processInfo.isLowPowerModeEnabled }

        private func refreshPines() {
            guard let map = mapView?.mapboxMap, map.sourceExists(withId: "pines") else { return }
            let show = parent.is3D && !lowPower && zoom >= 11.5 && !trees.isEmpty
            let features = show ? visibleBounds.map { Pines.shapes(trees, view: $0, zoom: zoom, limit: 1500) } ?? [] : []
            map.updateGeoJSONSource(withId: "pines", geoJSON: .featureCollection(FeatureCollection(features: features)))
        }

        /// Cabins move only when it's worth the battery: 3D, close enough, app in front, and no Reduce
        /// Motion or Low Power Mode. Otherwise they're parked at the same miniature scale.
        func updateMotion() {
            let moving = parent.is3D && !UIAccessibility.isReduceMotionEnabled && !lowPower && zoom >= 10.5
                && !tracks.isEmpty && UIApplication.shared.applicationState != .background
            if moving {
                if ticker == nil { ticker = Ticker(fps: 10) { [weak self] in self?.tick() } }
            } else {
                ticker?.stop(); ticker = nil
                setCabins(LiftMotion.cars(tracks, seconds: 0, view: nil, limit: 1500, scale: LiftMotion.scale(forZoom: zoom)))
            }
        }

        private func tick() {
            let t = Date().timeIntervalSince(sceneStart)
            setCabins(LiftMotion.cars(tracks, seconds: t, view: visibleBounds, limit: 400, scale: LiftMotion.scale(forZoom: zoom)))
        }

        /// 3D cabin boxes, plus dark beads for the far view kept 14 pt apart on screen so a lift never
        /// reads as a dotted line (that's the "Not classified" run style).
        private func setCabins(_ cars: [Feature]) {
            guard let map = mapView?.mapboxMap, map.sourceExists(withId: "cabins") else { return }
            map.updateGeoJSONSource(withId: "cabins", geoJSON: .featureCollection(FeatureCollection(features: cars)))
            var kept: [CGPoint] = [], dots: [Feature] = []
            for f in cars {
                guard case let .polygon(poly)? = f.geometry, let ring = poly.coordinates.first, ring.count >= 4 else { continue }
                let c = CLLocationCoordinate2D(latitude: ring.prefix(4).map(\.latitude).reduce(0, +) / 4,
                                               longitude: ring.prefix(4).map(\.longitude).reduce(0, +) / 4)
                let pt = map.point(for: c)
                if kept.contains(where: { hypot($0.x - pt.x, $0.y - pt.y) < 14 }) { continue }
                kept.append(pt)
                dots.append(Feature(geometry: .point(Point(c))))
            }
            map.updateGeoJSONSource(withId: "cabin-dots", geoJSON: .featureCollection(FeatureCollection(features: dots)))
        }

        /// Cinematic fly-in: a high drone pass, then a slow descending arc onto the resort's own angle.
        /// Reduce Motion gets a direct cut instead.
        private func flyIn(_ r: Resort) {
            guard let mapView else { return }
            let target = CameraOptions(center: r.center, zoom: r.camera.zoom, bearing: r.camera.bearing,
                                       pitch: parent.is3D ? ResortMapView.pitch3D : 0)
            if UIAccessibility.isReduceMotionEnabled { mapView.mapboxMap.setCamera(to: target); return }
            let pass = CameraOptions(center: r.center, zoom: r.camera.zoom - 1.4, bearing: r.camera.bearing - 55,
                                     pitch: parent.is3D ? 44 : 0)
            let id = r.id
            mapView.camera.fly(to: pass, duration: 2.4) { [weak self] position in
                guard position == .end, self?.currentId == id else { return }   // interrupted: leave the camera
                self?.mapView?.camera.ease(to: target, duration: 3.2, curve: .easeOut)
            }
        }

        private func widthByZoom(_ z11: Double, _ z16: Double) -> Value<Double> {
            .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11; z11; 16; z16 })
        }

        private var isDownhill: Exp { Exp(.eq) { Exp(.get) { "piste:type" }; "downhill" } }
        private var isUnknown: Exp { Exp(.eq) { Exp(.get) { "piste:difficulty" }; "unknown" } }

        private func addLayers(_ map: MapboxMap, country: String) {
            let runColors = PisteDifficulty.colorExpression(for: country)
            // Piste areas (wide open slopes) as a faint tint under the run lines.
            var areas = FillLayer(id: "piste-areas-fill", source: "piste_areas")
            areas.slot = .middle
            areas.fillColor = .expression(runColors)
            areas.fillOpacity = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 12; 0.06; 15; 0.14 })
            try? map.addLayer(areas)

            // Runs go in the top slot: drawn above 3D trees and buildings, so forest sections
            // no longer disappear. Harder runs sort on top where runs overlap.
            var casing = LineLayer(id: "pistes-casing", source: "pistes")
            casing.slot = .top
            casing.filter = isDownhill
            casing.lineColor = .constant(StyleColor(.white))
            casing.lineOpacity = .constant(0.95)
            casing.lineWidth = .expression(PisteWidth.expression(PisteWidth.casing))
            casing.lineCap = .constant(.round)
            casing.lineJoin = .constant(.round)
            casing.lineSortKey = .expression(Exp(.get) { "rank" })
            casing.lineEmissiveStrength = .constant(1)
            try? map.addLayer(casing)

            var pistes = LineLayer(id: "pistes-line", source: "pistes")
            pistes.slot = .top
            pistes.filter = Exp(.all) { isDownhill; Exp(.not) { isUnknown } }
            pistes.lineColor = .expression(runColors)
            pistes.lineWidth = .expression(PisteWidth.expression(PisteWidth.line))
            pistes.lineCap = .constant(.round)
            pistes.lineJoin = .constant(.round)
            pistes.lineSortKey = .expression(Exp(.get) { "rank" })
            pistes.lineEmissiveStrength = .constant(1)   // same colour at dawn, day, dusk and night
            try? map.addLayer(pistes)

            // Runs OSM doesn't classify: dashed grey, so they never look like a real blue/red/black.
            // Snow sheen: a thin light line down each run, like groomed corduroy catching the sun.
            var sheen = LineLayer(id: "pistes-sheen", source: "pistes")
            sheen.slot = .top
            sheen.minZoom = 12
            sheen.filter = isDownhill
            sheen.lineColor = .constant(StyleColor(.white))
            sheen.lineOpacity = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 12; 0; 13.5; 0.38 })
            sheen.lineWidth = .expression(PisteWidth.expression(PisteWidth.sheen))
            sheen.lineCap = .constant(.round)
            sheen.lineEmissiveStrength = .constant(1)
            try? map.addLayer(sheen)

            var unknown = LineLayer(id: "pistes-unknown", source: "pistes")
            unknown.slot = .top
            unknown.filter = Exp(.all) { isDownhill; isUnknown }
            unknown.lineColor = .constant(StyleColor(PisteDifficulty.unknown.color(in: .eu)))
            unknown.lineWidth = .expression(PisteWidth.expression(PisteWidth.line))
            unknown.lineDasharray = .constant([1.5, 1])
            unknown.lineEmissiveStrength = .constant(1)
            try? map.addLayer(unknown)

            // Lift on the ground: full line in 2D, faint shadow under the cable in 3D.
            // Ground lifts (rope tows, magic carpets) have no cable, so they always stay fully visible.
            var lifts = LineLayer(id: "lifts-line", source: "lifts")
            lifts.slot = .top
            lifts.lineColor = .constant(StyleColor(UIColor(white: 0.12, alpha: 1)))
            lifts.lineWidth = widthByZoom(1.5, 3.5)
            lifts.lineDasharray = .constant([2, 1])
            lifts.lineEmissiveStrength = .constant(1)
            try? map.addLayer(lifts)
            try? map.setLayerProperty(for: "lifts-line", property: "line-opacity",
                                      value: Coordinator.liftOpacityJSON(is3D: parent.is3D))

            // Hanging cables. Each chunk carries its clearance above ground at 9 evenly spaced
            // points (z0…z8, real metres, from the pipeline). They are scaled by the terrain
            // exaggeration so cables keep the same proportion as the exaggerated mountains.
            let exaggeration = ResortMapView.terrainExaggeration
            var cable = LineLayer(id: "lifts-cable", source: "lift_spans")
            cable.slot = .top
            cable.lineColor = .expression(Exp(.match) {
                Exp(.get) { "aerialway" }
                ["cable_car", "gondola", "mixed_lift"]; UIColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
                UIColor(red: 0.22, green: 0.22, blue: 0.25, alpha: 1)
            })
            cable.lineWidth = widthByZoom(1.2, 3)
            cable.lineCap = .constant(.round)
            cable.lineEmissiveStrength = .constant(1)
            cable.visibility = .constant(parent.is3D ? .visible : .none)
            try? map.addLayer(cable)
            // ["interpolate", ["linear"], ["line-progress"], 0, exag*z0, 0.125, exag*z1, … 1, exag*z8]
            var zOffset: [Any] = ["interpolate", ["linear"], ["line-progress"]]
            for k in 0..<9 { zOffset += [Double(k) / 8, ["*", exaggeration, ["get", "z\(k)"]]] }
            do {
                try map.setLayerProperties(for: "lifts-cable", properties: [
                    "line-elevation-reference": "ground",
                    "line-z-offset": zOffset,
                ])
            } catch {
                // Older SDK without elevated lines: fall back to lifts drawn on the ground.
                print("Elevated lift cables unavailable: \(error)")
                try? map.removeLayer(withId: "lifts-cable")
                try? map.setLayerProperty(for: "lifts-line", property: "line-opacity", value: 1.0)
            }

            // Lift towers (mast + crossarm), stations (walls + roof) and hanging cabins as 3D boxes.
            // base/height are metres above ground from the pipeline (lift3d.mjs), scaled like the cables.
            let ex = ResortMapView.terrainExaggeration
            func scaled(_ prop: String) -> Value<Double> { .expression(Exp(.multiply) { ex; Exp(.get) { prop } }) }
            func hex(_ v: UInt32) -> UIColor {
                UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
            }
            var structures = FillExtrusionLayer(id: "structures-3d", source: "structures")
            structures.slot = .top
            structures.minZoom = 12.5
            structures.fillExtrusionBase = scaled("base")
            structures.fillExtrusionHeight = scaled("height")
            structures.fillExtrusionColor = .expression(Exp(.match) {
                Exp(.get) { "part" }
                "mast"; hex(0x727d8c)
                "arm"; hex(0x3c4552)
                "roof"; hex(0x8e2f29)
                hex(0xefe9dd)                                  // station walls
            })
            structures.fillExtrusionVerticalGradient = .constant(true)
            structures.fillExtrusionAmbientOcclusionIntensity = .constant(0.35)
            try? map.addLayer(structures)

            // Pines: stacked octagonal tiers with a snow cap, fading in as you approach.
            var pines = FillExtrusionLayer(id: "pines-3d", source: "pines")
            pines.slot = .middle
            pines.minZoom = 11.5
            pines.fillExtrusionBase = scaled("base")
            pines.fillExtrusionHeight = scaled("height")
            pines.fillExtrusionColor = .expression(Exp(.match) {
                Exp(.get) { "part" }
                "trunk"; hex(0x4a3a30)
                "low"; hex(0x244c3d)
                "mid"; hex(0x2f5f4b)
                hex(0xeef4f8)                                  // snow cap
            })
            pines.fillExtrusionVerticalGradient = .constant(true)
            pines.fillExtrusionAmbientOcclusionIntensity = .constant(0.45)
            pines.fillExtrusionOpacity = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11.5; 0; 12; 1 })
            try? map.addLayer(pines)

            // Far view: a cabin is smaller than a pixel, so it shows as a dark bead on the cable.
            var dots = CircleLayer(id: "cabin-dots", source: "cabin-dots")
            dots.slot = .top
            dots.minZoom = 10.5
            dots.maxZoom = 14
            dots.circleColor = .constant(StyleColor(hex(0x0b0f14)))
            dots.circleRadius = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 10.5; 1.9; 13; 2.6 })
            dots.circleOpacity = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 12.8; 1; 13.6; 0 })
            dots.circlePitchAlignment = .constant(.viewport)
            try? map.addLayer(dots)

            var cabins = FillExtrusionLayer(id: "cabins-3d", source: "cabins")
            cabins.slot = .top
            cabins.minZoom = 11.5
            cabins.fillExtrusionBase = scaled("base")
            cabins.fillExtrusionHeight = scaled("height")
            cabins.fillExtrusionColor = .expression(Exp(.match) {
                Exp(.get) { "lift" }
                "chair_lift"; hex(0x2b323c)
                hex(0xd42a2f)                                  // gondola / cable-car cabins
            })
            try? map.addLayer(cabins)

            // Run number as a coloured badge (white text, halo in the run's colour), name when zoomed in.
            var runLabel = SymbolLayer(id: "pistes-label", source: "pistes")
            runLabel.slot = .top
            runLabel.filter = isDownhill
            runLabel.textField = .expression(Exp(.step) {
                Exp(.zoom)
                Exp(.coalesce) { Exp(.get) { "ref" }; "" }
                14.5
                Exp(.coalesce) { Exp(.get) { "name" }; Exp(.get) { "ref" }; "" }
            })
            runLabel.symbolPlacement = .constant(.line)
            runLabel.symbolSpacing = .constant(350)
            runLabel.textSize = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 12; 11; 16; 14 })
            runLabel.textColor = .constant(StyleColor(.white))
            runLabel.textHaloColor = .expression(runColors)
            runLabel.textHaloWidth = .constant(2.5)
            runLabel.textPitchAlignment = .constant(.viewport)
            runLabel.textKeepUpright = .constant(true)
            runLabel.textEmissiveStrength = .constant(1)
            runLabel.minZoom = 12.5
            try? map.addLayer(runLabel)

            var liftLabel = SymbolLayer(id: "lifts-label", source: "lifts")
            liftLabel.slot = .top
            liftLabel.textField = .expression(Exp(.coalesce) { Exp(.get) { "name" }; Exp(.get) { "ref" }; "" })
            liftLabel.symbolPlacement = .constant(.line)
            liftLabel.textSize = .constant(12)
            liftLabel.textColor = .constant(StyleColor(UIColor(white: 0.1, alpha: 1)))
            liftLabel.textHaloColor = .constant(StyleColor(.white))
            liftLabel.textHaloWidth = .constant(1.5)
            liftLabel.textPitchAlignment = .constant(.viewport)
            liftLabel.textEmissiveStrength = .constant(1)
            liftLabel.minZoom = 13.5
            try? map.addLayer(liftLabel)
        }
    }
}


/// A small display-link wrapper: calls `tick` about `fps` times a second until stopped.
final class Ticker: NSObject {
    private var link: CADisplayLink?
    private let tick: () -> Void
    init(fps: Int, tick: @escaping () -> Void) {
        self.tick = tick
        super.init()
        let link = CADisplayLink(target: self, selector: #selector(step))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: Float(fps), maximum: Float(fps), preferred: Float(fps))
        link.add(to: .main, forMode: .common)
        self.link = link
    }
    @objc private func step() { tick() }
    func stop() { link?.invalidate(); link = nil }
}
