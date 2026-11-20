import SwiftUI
import MapboxMaps

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

        private let sources = ["pistes", "piste_areas", "lifts", "stations", "structures"]
        private let layers = ["piste-areas-fill", "pistes-casing", "pistes-line", "lifts-line",
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

            for layer in ["pistes-line", "lifts-line", "structures-3d"] {
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
            var relief = HillshadeLayer(id: "relief", source: "mapbox-dem")
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
                try? map.addSource(src)
            }
            addLayers(map)
            mapView?.camera.fly(to: CameraOptions(center: r.center, zoom: r.camera.zoom, bearing: r.camera.bearing,
                                                  pitch: parent.is3D ? max(r.camera.pitch, ResortMapView.pitch3D) : 0),
                                duration: 2.5)
        }

        /// European colour code; France also uses green for "novice".
        private var difficultyColor: Exp {
            Exp(.match) {
                Exp(.get) { "piste:difficulty" }
                "novice"; UIColor(red: 0.13, green: 0.65, blue: 0.27, alpha: 1)
                "easy"; UIColor(red: 0.10, green: 0.42, blue: 0.86, alpha: 1)
                "intermediate"; UIColor(red: 0.86, green: 0.15, blue: 0.15, alpha: 1)
                "advanced"; UIColor.black
                "expert"; UIColor.black
                "freeride"; UIColor(red: 0.95, green: 0.55, blue: 0.10, alpha: 1)
                UIColor.darkGray
            }
        }

        private func widthByZoom(_ z11: Double, _ z16: Double) -> Value<Double> {
            .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11; z11; 16; z16 })
        }

        private func addLayers(_ map: MapboxMap) {
            var areas = FillLayer(id: "piste-areas-fill", source: "piste_areas")
            areas.slot = .middle
            areas.fillColor = .expression(difficultyColor)
            areas.fillOpacity = .constant(0.18)
            try? map.addLayer(areas)

            // White casing under each run keeps colours readable on snow, rock and forest.
            var casing = LineLayer(id: "pistes-casing", source: "pistes")
            casing.slot = .middle
            casing.filter = Exp(.eq) { Exp(.get) { "piste:type" }; "downhill" }
            casing.lineColor = .constant(StyleColor(UIColor(white: 1, alpha: 0.9)))
            casing.lineWidth = widthByZoom(3, 9)
            casing.lineCap = .constant(.round)
            casing.lineJoin = .constant(.round)
            try? map.addLayer(casing)

            var pistes = LineLayer(id: "pistes-line", source: "pistes")
            pistes.slot = .middle
            pistes.filter = Exp(.eq) { Exp(.get) { "piste:type" }; "downhill" }
            pistes.lineColor = .expression(difficultyColor)
            pistes.lineWidth = widthByZoom(1.5, 5)
            pistes.lineCap = .constant(.round)
            pistes.lineJoin = .constant(.round)
            pistes.lineEmissiveStrength = .constant(1)   // stays bright under dusk/night lighting
            try? map.addLayer(pistes)

            var lifts = LineLayer(id: "lifts-line", source: "lifts")
            lifts.slot = .top
            lifts.lineColor = .constant(StyleColor(UIColor(white: 0.12, alpha: 1)))
            lifts.lineWidth = widthByZoom(1, 3)
            lifts.lineDasharray = .constant([2, 1])
            lifts.lineEmissiveStrength = .constant(1)
            try? map.addLayer(lifts)

            // Lift pylons and stations as 3D blocks standing on the terrain.
            var structures = FillExtrusionLayer(id: "structures-3d", source: "structures")
            structures.slot = .top
            structures.minZoom = 13
            structures.fillExtrusionHeight = .expression(Exp(.get) { "height" })
            structures.fillExtrusionBase = .constant(0)
            structures.fillExtrusionColor = .expression(Exp(.match) {
                Exp(.get) { "kind" }
                "station"; UIColor(red: 0.85, green: 0.30, blue: 0.20, alpha: 1)
                UIColor(white: 0.35, alpha: 1)
            })
            structures.fillExtrusionOpacity = .constant(0.95)
            structures.fillExtrusionAmbientOcclusionIntensity = .constant(0.3)
            try? map.addLayer(structures)

            for (id, src) in [("pistes-label", "pistes"), ("lifts-label", "lifts")] {
                var label = SymbolLayer(id: id, source: src)
                label.slot = .top
                label.textField = .expression(Exp(.coalesce) { Exp(.get) { "ref" }; Exp(.get) { "name" } })
                label.symbolPlacement = .constant(.line)
                label.textSize = .constant(12)
                label.textHaloColor = .constant(StyleColor(.white))
                label.textHaloWidth = .constant(1.5)
                label.textPitchAlignment = .constant(.viewport)
                label.minZoom = 13
                try? map.addLayer(label)
            }
        }
    }
}
