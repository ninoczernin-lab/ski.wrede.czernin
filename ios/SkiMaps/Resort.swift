import Foundation
import CoreLocation

/// One entry from data/manifest.json (bundled in the app).
struct Resort: Codable, Identifiable, Hashable {
    struct BBox: Codable, Hashable { let south, west, north, east: Double }
    struct Camera: Codable, Hashable { let lat, lon, zoom, bearing, pitch: Double }

    let id: String
    let name: String
    let country: String
    /// 1 = over 2 M skier visits, 2 = 1–2 M, 3 = 0.5–1 M (pipeline/catalog.mjs), 4 = the rest of the 2026 list.
    let tier: Int?
    let villages: [String]
    let bbox: BBox
    let camera: Camera

    var center: CLLocationCoordinate2D { .init(latitude: camera.lat, longitude: camera.lon) }

    func contains(_ c: CLLocationCoordinate2D) -> Bool {
        (bbox.south...bbox.north).contains(c.latitude) && (bbox.west...bbox.east).contains(c.longitude)
    }

    func matches(_ query: String) -> Bool {
        let q = query.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        guard !q.isEmpty else { return true }
        return ([name] + villages).contains {
            $0.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).contains(q)
        }
    }

    /// Bundled GeoJSON layer, e.g. "pistes", "lifts" (copied from data/<id>/ into the app bundle).
    func layerURL(_ layer: String) -> URL? {
        Bundle.main.url(forResource: layer, withExtension: "geojson", subdirectory: "ResortData/\(id)")
    }
}

enum ResortCatalog {
    static let all: [Resort] = {
        guard let url = Bundle.main.url(forResource: "manifest", withExtension: "json", subdirectory: "ResortData"),
              let data = try? Data(contentsOf: url),
              let resorts = try? JSONDecoder().decode([Resort].self, from: data) else { return [] }
        return resorts
    }()

    /// Resort the user is standing in, or the nearest one within `maxKm`.
    static func nearest(to c: CLLocationCoordinate2D, maxKm: Double = 40) -> Resort? {
        if let inside = all.first(where: { $0.contains(c) }) { return inside }
        let here = CLLocation(latitude: c.latitude, longitude: c.longitude)
        return all
            .map { ($0, here.distance(from: CLLocation(latitude: $0.camera.lat, longitude: $0.camera.lon)) / 1000) }
            .filter { $0.1 <= maxKm }
            .min { $0.1 < $1.1 }?.0
    }
}
