import SwiftUI
import MapboxMaps

/// 3D resort map: Mapbox Outdoors + terrain, with OSM pistes and lifts drawn on top.
/// One MapView for every resort; switching resort swaps data and flies the camera.
struct ResortMapView: UIViewRepresentable {
    let resort: Resort?
    @Binding var selectedFeature: [String: Any]?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MapView {
        let opts = MapInitOptions(styleURI: OfflineResortStore.styleURI)
        let mapView = MapView(frame: .zero, mapInitOptions: opts)
        mapView.ornaments.options.scaleBar.visibility = .hidden
        mapView.location.options.puckType = .puck2D(.makeDefault(showBearing: true))
        mapView.location.options.puckBearingEnabled = true
        // Two-finger drag tilts, rotate is on by default: the "3D" feel on iPhone.
        mapView.gestures.options.pitchEnabled = true
        context.coordinator.attach(mapView)
        return mapView
    }

    func updateUIView(_ mapView: MapView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.show(resort)
    }

    final class Coordinator {
        var parent: ResortMapView
        private weak var mapView: MapView?
        private var styleLoaded = false
        private var currentId: String?
        private var tokens = Set<AnyCancelable>()

        init(_ parent: ResortMapView) { self.parent = parent }

        func attach(_ mapView: MapView) {
            self.mapView = mapView
            mapView.mapboxMap.onStyleLoaded.observeNext { [weak self] _ in
                self?.styleLoaded = true
                self?.addTerrain()
                let pending = self?.parent.resort
                self?.currentId = nil
                self?.show(pending)
            }.store(in: &tokens)

            // Tap a run or lift to see its name/difficulty.
            for layer in ["pistes-line", "lifts-line"] {
                mapView.gestures.onLayerTap(layer) { [weak self] feature, _ in
                    self?.parent.selectedFeature = feature.feature.properties?.mapValues { $0?.rawValue ?? "" }
                    return true
                }.store(in: &tokens)
            }
        }

        private func addTerrain() {
            guard let map = mapView?.mapboxMap else { return }
            var dem = RasterDemSource(id: "mapbox-dem")
            dem.url = OfflineResortStore.demTileset
            dem.tileSize = 512
            dem.maxzoom = 14
            try? map.addSource(dem)
            var terrain = Terrain(sourceId: "mapbox-dem")
            terrain.exaggeration = .constant(1.4)
            try? map.setTerrain(terrain)

            var sky = SkyLayer(id: "sky")
            sky.skyType = .constant(.atmosphere)
            sky.skyAtmosphereSun = .constant([0, 0])
            try? map.addLayer(sky)
        }

        func show(_ resort: Resort?) {
            guard styleLoaded, let map = mapView?.mapboxMap, let r = resort, r.id != currentId else { return }
            currentId = r.id
            for id in ["pistes-label", "lifts-label", "lifts-line", "pistes-line", "piste-areas-fill", "stations-circle"] {
                if map.layerExists(withId: id) { try? map.removeLayer(withId: id) }
            }
            for id in ["pistes", "piste_areas", "lifts", "stations"] where map.sourceExists(withId: id) {
                try? map.removeSource(withId: id)
            }
            for layer in ["pistes", "piste_areas", "lifts", "stations"] {
                guard let url = r.layerURL(layer) else { continue }
                var src = GeoJSONSource(id: layer)
                src.data = .url(url)
                try? map.addSource(src)
            }
            addLayers(map)
            mapView?.camera.fly(to: CameraOptions(center: r.center, zoom: r.camera.zoom,
                                                  bearing: r.camera.bearing, pitch: r.camera.pitch),
                                duration: 2.0)
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

        private func addLayers(_ map: MapboxMap) {
            var areas = FillLayer(id: "piste-areas-fill", source: "piste_areas")
            areas.fillColor = .expression(difficultyColor)
            areas.fillOpacity = .constant(0.18)
            try? map.addLayer(areas)

            var pistes = LineLayer(id: "pistes-line", source: "pistes")
            pistes.filter = Exp(.eq) { Exp(.get) { "piste:type" }; "downhill" }
            pistes.lineColor = .expression(difficultyColor)
            pistes.lineWidth = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11; 1.5; 16; 5 })
            pistes.lineCap = .constant(.round)
            pistes.lineJoin = .constant(.round)
            try? map.addLayer(pistes)

            var lifts = LineLayer(id: "lifts-line", source: "lifts")
            lifts.lineColor = .constant(StyleColor(UIColor(white: 0.15, alpha: 1)))
            lifts.lineWidth = .expression(Exp(.interpolate) { Exp(.linear); Exp(.zoom); 11; 1; 16; 3 })
            lifts.lineDasharray = .constant([2, 1])
            try? map.addLayer(lifts)

            var stations = CircleLayer(id: "stations-circle", source: "stations")
            stations.circleRadius = .constant(4)
            stations.circleColor = .constant(StyleColor(.white))
            stations.circleStrokeColor = .constant(StyleColor(.black))
            stations.circleStrokeWidth = .constant(1.5)
            stations.minZoom = 12.5
            try? map.addLayer(stations)

            for (id, src, field) in [("pistes-label", "pistes", "name"), ("lifts-label", "lifts", "name")] {
                var label = SymbolLayer(id: id, source: src)
                label.textField = .expression(Exp(.coalesce) { Exp(.get) { "ref" }; Exp(.get) { field } })
                label.symbolPlacement = .constant(.line)
                label.textSize = .constant(12)
                label.textHaloColor = .constant(StyleColor(.white))
                label.textHaloWidth = .constant(1.5)
                label.minZoom = 13
                try? map.addLayer(label)
            }
        }
    }
}
