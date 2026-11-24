import Foundation
import CoreLocation
import MapboxMaps

/// Stylized pines for the iPhone, matching preview/pines.js: each tree is stacked octagonal tiers
/// with a snow cap, drawn as fill-extrusions. Positions come from the bundled pines.geojson that the
/// data step places in OSM forests, off runs and lifts, below the tree line, so they work offline.
enum Pines {
    struct Tree { let c: CLLocationCoordinate2D; let k: Double; let hash: Double }

    static func load(_ fc: FeatureCollection) -> [Tree] {
        fc.features.compactMap { f in
            guard case let .point(p)? = f.geometry else { return nil }
            let m = f.properties?.string("m") ?? "pine-m"
            let rot = f.properties?.number("rot") ?? 0
            return Tree(c: p.coordinates, k: m == "pine-s" ? 0.78 : m == "pine-l" ? 1.22 : 1, hash: rot / 360)
        }
    }

    /// Spacing and tree height by zoom: fewer, bigger trees zoomed out; true-scale forest up close.
    static func lod(forZoom z: Double) -> (spacing: Double, height: Double) {
        z < 12.5 ? (95, 54) : z < 13.5 ? (60, 36) : z < 14.5 ? (36, 26) : (26, 19)
    }

    /// Extrusion parts for the trees inside `view`, thinned to one per `spacing`-metre cell.
    static func shapes(_ trees: [Tree], view: CoordinateBounds, zoom: Double, limit: Int) -> [Feature] {
        let (spacing, size) = lod(forZoom: zoom)
        let cellLat = spacing / LiftMotion.metresPerDegree
        var taken = Set<Int64>()
        var out: [Feature] = []
        for t in trees {
            let c = t.c
            guard c.latitude >= view.southwest.latitude, c.latitude <= view.northeast.latitude,
                  c.longitude >= view.southwest.longitude, c.longitude <= view.northeast.longitude else { continue }
            let cellLon = cellLat / cos(c.latitude * .pi / 180)
            let key = Int64(floor(c.latitude / cellLat)) &* 1_000_003 &+ Int64(floor(c.longitude / cellLon))
            guard taken.insert(key).inserted else { continue }
            let h = size * t.k, r = h * 0.3
            out.append(part(c, r * 0.18, "trunk", 0, h * 0.2))
            out.append(part(c, r, "low", h * 0.16, h * 0.5))
            out.append(part(c, r * 0.68, "mid", h * 0.5, h * 0.78))
            out.append(part(c, r * 0.36, "snow", h * 0.78, h))
            if out.count >= limit * 4 { break }
        }
        return out
    }

    private static func part(_ c: CLLocationCoordinate2D, _ r: Double, _ name: String, _ base: Double, _ height: Double) -> Feature {
        let mLon = LiftMotion.metresPerDegree * cos(c.latitude * .pi / 180)
        var ring = (0..<8).map { i -> CLLocationCoordinate2D in
            let a = (Double(i) + 0.5) / 8 * 2 * .pi
            return CLLocationCoordinate2D(latitude: c.latitude + sin(a) * r / LiftMotion.metresPerDegree,
                                          longitude: c.longitude + cos(a) * r / mLon)
        }
        ring.append(ring[0])
        var f = Feature(geometry: .polygon(Polygon([ring])))
        f.properties = ["part": .string(name), "base": .number(base), "height": .number(height)]
        return f
    }
}
