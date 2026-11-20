import SwiftUI
// Elevated lines (line-z-offset) are an experimental Mapbox v11 API.
@_spi(Experimental) import MapboxMaps

/// 3D resort map on Mapbox Standard (3D buildings, trees, lighting) with real terrain,
/// relief shading, OSM pistes/lifts draped on the slopes and extruded lift pylons/stations.
/// One MapView for every resort; switching resort swaps data and flies the camera.
struct ResortMapView: UIViewRepresentable {
    let resort: Resort?
    var is3D: Bool = true
    var lightPreset: String = "day"          // "dawn" | "day" | "dusk" | "night"
    @Binding var selectedFeature: [String: Any]?

    static let terrainExaggeration = 1.5
    static let pitch3D = 65.0

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MapView {
        let opts = MapInitOptions(styleURI: OfflineResortStore.styleURI)
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
        if old.lightPreset != lightPreset { c.applyLight() }
    }

    final class Coordinator {
        var parent: ResortMapView
        private weak var mapView: MapView?
        private var styleLoaded = false
        private var currentId: String?
        private var tokens = Set<AnyCancelable>()

        static let liftShadowOpacity = 0.25
        static let groundLifts = ["rope_tow", "magic_carpet", "zip_line"]
        /// Ground lifts always opaque; aerial lifts faint in 3D (the cable above is the real lift).
        static func liftOpacityJSON(is3D: Bool) -> [Any] {
            ["match", ["get", "aerialway"], groundLifts, 1.0, is3D ? liftShadowOpacity : 1.0]
        }
        private let sources = ["pistes", "piste_areas", "lifts", "lift_spans", "stations", "structures"]
        private let layers = ["piste-areas-fill", "pistes-casing", "pistes-line", "pistes-unknown", "lifts-line", "lifts-cable",
                              "structures-3d", "pistes-label", "lifts-label"]

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

            for layer in ["pistes-line", "pistes-unknown", "lifts-line", "lifts-cable", "structures-3d"] {
                mapView.gestures.onLayerTap(layer) { [weak self] feature, _ in
                    self?.parent.selectedFeature = feature.feature.properties?.mapValues { $0?.rawValue ?? "" }
                    return true
                }.store(in: &tokens)
            }
        }

        // MARK: Standard style config (3D buildings, trees, lighting)

        private func configureStandard() {
            guard let map = mapView?.mapboxMap else { return }
            try? map.setStyleImportConfigProperty(for: "basemap", config: "show3dObjects", value: true)
            try? map.setStyleImportConfigProperty(for: "basemap", config: "showPointOfInterestLabels", value: true)
            try? map.setStyleImportConfigProperty(for: "basemap", config: "showTransitLabels", value: false)
            applyLight()
        }

        func applyLight() {
            try? mapView?.mapboxMap.setStyleImportConfigProperty(for: "basemap", config: "lightPreset",
                                                                  value: parent.lightPreset)
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
            relief.hillshadeExaggeration = .constant(0.45)
            relief.hillshadeShadowColor = .constant(StyleColor(UIColor(red: 0.20, green: 0.25, blue: 0.35, alpha: 1)))
            relief.hillshadeHighlightColor = .constant(StyleColor(.white))
            relief.hillshadeIlluminationAnchor = .constant(.map)
            try? map.addLayer(relief)
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
            if map.layerExists(withId: "structures-3d") {
                try? map.setLayerProperty(for: "structures-3d", property: "visibility", value: on ? "visible" : "none")
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
        }

        // MARK: Resort data

        func show(_ resort: Resort?) {
            guard styleLoaded, let map = mapView?.mapboxMap, let r = resort, r.id != currentId else { return }
            currentId = r.id
            for id in layers.reversed() where map.layerExists(withId: id) { try? map.removeLayer(withId: id) }
            for id in sources where map.sourceExists(withId: id) { try? map.removeSource(withId: id) }
            for layer in sources {
                guard let url = r.layerURL(layer) else { continue }
                var src = GeoJSONSource(id: layer)
                src.data = .url(url)
                if layer == "lift_spans" { src.lineMetrics = true }   // needed for line-progress
                try? map.addSource(src)
            }
            addLayers(map)
            mapView?.camera.fly(to: CameraOptions(center: r.center, zoom: r.camera.zoom, bearing: r.camera.bearing,
                                                  pitch: parent.is3D ? max(r.camera.pitch, ResortMapView.pitch3D) : 0),
                                duration: 2.5)
        }

        private func widthByZoom(_ z11: Double, _ z16: Double) -> Value<Double> {
            .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11; z11; 16; z16 })
        }

        private var isDownhill: Exp { Exp(.eq) { Exp(.get) { "piste:type" }; "downhill" } }
        private var isUnknown: Exp { Exp(.eq) { Exp(.get) { "piste:difficulty" }; "unknown" } }

        private func addLayers(_ map: MapboxMap) {
            // Piste areas (wide open slopes) as a faint tint under the run lines.
            var areas = FillLayer(id: "piste-areas-fill", source: "piste_areas")
            areas.slot = .middle
            areas.fillColor = .expression(PisteDifficulty.colorExpression)
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
            pistes.lineColor = .expression(PisteDifficulty.colorExpression)
            pistes.lineWidth = .expression(PisteWidth.expression(PisteWidth.line))
            pistes.lineCap = .constant(.round)
            pistes.lineJoin = .constant(.round)
            pistes.lineSortKey = .expression(Exp(.get) { "rank" })
            pistes.lineEmissiveStrength = .constant(1)   // same colour at dawn, day, dusk and night
            try? map.addLayer(pistes)

            // Runs OSM doesn't classify: dashed grey, so they never look like a real blue/red/black.
            var unknown = LineLayer(id: "pistes-unknown", source: "pistes")
            unknown.slot = .top
            unknown.filter = Exp(.all) { isDownhill; isUnknown }
            unknown.lineColor = .constant(StyleColor(PisteDifficulty.unknown.color))
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

            // Lift pylons and stations as 3D blocks standing on the terrain.
            var structures = FillExtrusionLayer(id: "structures-3d", source: "structures")
            structures.slot = .top
            structures.minZoom = 13
            // Same exaggeration as the cables, so cables sit on the pylon tops.
            structures.fillExtrusionHeight = .expression(Exp(.multiply) {
                ResortMapView.terrainExaggeration; Exp(.get) { "height" }
            })
            structures.fillExtrusionBase = .constant(0)
            structures.fillExtrusionColor = .expression(Exp(.match) {
                Exp(.get) { "kind" }
                "station"; UIColor(red: 0.85, green: 0.30, blue: 0.20, alpha: 1)
                UIColor(white: 0.35, alpha: 1)
            })
            structures.fillExtrusionOpacity = .constant(0.95)
            structures.fillExtrusionAmbientOcclusionIntensity = .constant(0.3)
            try? map.addLayer(structures)

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
            runLabel.textHaloColor = .expression(PisteDifficulty.colorExpression)
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
