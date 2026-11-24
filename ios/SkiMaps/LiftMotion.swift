import Foundation
import CoreLocation
import MapboxMaps

/// Moving cabins: a Swift port of pipeline/lift3d.mjs liftTracks/carsAt, so the iPhone shows the
/// same miniature lifts as the web map. Tracks come from the bundled lift_spans.geojson (cable
/// stops with clearance above ground); each frame places cabins along them, uphill on the right
/// cable and downhill on the left.
struct LiftTrack {
    struct Stop { let c: CLLocationCoordinate2D; let d: Double; let z: Double; var bearing: Double = 0 }
    let type: String
    let total: Double
    let stops: [Stop]
    let bbox: (w: Double, s: Double, e: Double, n: Double)
}

enum LiftMotion {
    private struct Cabin { let every: Double?; let along: Double; let across: Double; let drop: Double; let tall: Double }
    // Same specs as lift3d.mjs CABIN / SPEED / LANE.
    private static let cabin: [String: Cabin] = [
        "gondola": Cabin(every: 70, along: 2.6, across: 2.2, drop: 1.4, tall: 2.4),
        "mixed_lift": Cabin(every: 70, along: 2.6, across: 2.2, drop: 1.4, tall: 2.4),
        "chair_lift": Cabin(every: 28, along: 1.2, across: 3.2, drop: 1.6, tall: 0.6),
        "cable_car": Cabin(every: nil, along: 7, across: 4, drop: 3, tall: 3.2),
    ]
    private static let speed: [String: Double] = ["gondola": 9, "mixed_lift": 9, "cable_car": 7, "chair_lift": 6]
    private static let lane: [String: Double] = ["gondola": 2.4, "mixed_lift": 2.4, "cable_car": 3.2, "chair_lift": 2.6]
    static let metresPerDegree = 111_320.0

    /// Build tracks once per resort from lift_spans.geojson.
    static func tracks(from spans: FeatureCollection) -> [LiftTrack] {
        var byLift: [String: [Feature]] = [:]
        var order: [String] = []
        for f in spans.features {
            guard let type = f.properties?.string("aerialway"), cabin[type] != nil,
                  let id = f.properties?.string("lift_id") else { continue }
            if byLift[id] == nil { order.append(id) }
            byLift[id, default: []].append(f)
        }
        return order.compactMap { id in
            let chunks = byLift[id]!
            guard let type = chunks.first?.properties?.string("aerialway") else { return nil }
            var stops: [LiftTrack.Stop] = []
            var dist = 0.0
            var prev: CLLocationCoordinate2D?
            for f in chunks {
                guard case let .lineString(line)? = f.geometry else { continue }
                for (k, c) in line.coordinates.enumerated() {
                    if let p = prev, p.latitude == c.latitude, p.longitude == c.longitude { continue }
                    if let p = prev { dist += distance(p, c) }
                    stops.append(.init(c: c, d: dist, z: f.properties?.number("z\(k)") ?? 6))
                    prev = c
                }
            }
            guard dist >= 20, stops.count > 1 else { return nil }
            for i in stops.indices {
                stops[i].bearing = bearing(stops[max(0, i - 1)].c, stops[min(stops.count - 1, i + 1)].c)
            }
            let lons = stops.map(\.c.longitude), lats = stops.map(\.c.latitude)
            return LiftTrack(type: type, total: dist, stops: stops,
                             bbox: (lons.min()!, lats.min()!, lons.max()!, lats.max()!))
        }
    }

    /// Cabin boxes at time `seconds` (base/height in metres above ground). `scale` enlarges them when
    /// zoomed out so they still read as cabins in the miniature; `view` culls lifts off screen.
    static func cars(_ tracks: [LiftTrack], seconds: Double, view: CoordinateBounds?, limit: Int, scale: Double) -> [Feature] {
        var out: [Feature] = []
        for tr in tracks {
            if let v = view, tr.bbox.e < v.southwest.longitude || tr.bbox.w > v.northeast.longitude
                || tr.bbox.n < v.southwest.latitude || tr.bbox.s > v.northeast.latitude { continue }
            guard let c = cabin[tr.type] else { continue }
            let every = c.every ?? tr.total / 2
            let shift = (seconds * (speed[tr.type] ?? 6)).truncatingRemainder(dividingBy: every)
            let laneM = (lane[tr.type] ?? 2.5) * scale
            let along = c.along * scale, across = c.across * scale, tall = c.tall * scale, drop = c.drop * min(scale, 1.5)
            for dir in [1.0, -1.0] {
                var d0 = shift < 0 ? shift + every : shift
                while d0 < tr.total {
                    let at = point(tr, dir == 1 ? d0 : tr.total - d0)
                    d0 += every
                    if scale == 1 && at.z - drop - tall < 0.5 { continue }
                    let top = max(at.z - drop, tall + 0.5)
                    let side = (at.bearing + 90) * .pi / 180
                    let mLon = metresPerDegree * cos(at.c.latitude * .pi / 180)
                    let p = CLLocationCoordinate2D(latitude: at.c.latitude + cos(side) * laneM * dir / metresPerDegree,
                                                   longitude: at.c.longitude + sin(side) * laneM * dir / mLon)
                    var f = Feature(geometry: .polygon(rect(p, bearing: at.bearing, along: along, across: across)))
                    f.properties = ["lift": .string(tr.type), "base": .number(top - tall), "height": .number(top)]
                    out.append(f)
                    if out.count >= limit { return out }
                }
            }
        }
        return out
    }

    private static func point(_ tr: LiftTrack, _ d: Double) -> (c: CLLocationCoordinate2D, z: Double, bearing: Double) {
        var lo = 0, hi = tr.stops.count - 1
        while hi - lo > 1 { let mid = (lo + hi) / 2; if tr.stops[mid].d <= d { lo = mid } else { hi = mid } }
        let a = tr.stops[lo], b = tr.stops[hi]
        let t = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0
        return (CLLocationCoordinate2D(latitude: a.c.latitude + (b.c.latitude - a.c.latitude) * t,
                                       longitude: a.c.longitude + (b.c.longitude - a.c.longitude) * t),
                a.z + (b.z - a.z) * t, a.bearing)
    }

    /// Rectangle `along` × `across` metres centred on c, long side along `bearing` (degrees).
    static func rect(_ c: CLLocationCoordinate2D, bearing: Double, along: Double, across: Double) -> Polygon {
        let b = bearing * .pi / 180, ux = sin(b), uy = cos(b), vx = cos(b), vy = -sin(b)
        let mLon = metresPerDegree * cos(c.latitude * .pi / 180)
        let pt = { (a: Double, x: Double) in
            CLLocationCoordinate2D(latitude: c.latitude + (uy * a + vy * x) / metresPerDegree,
                                   longitude: c.longitude + (ux * a + vx * x) / mLon) }
        let ha = along / 2, hx = across / 2
        let ring = [pt(-ha, -hx), pt(ha, -hx), pt(ha, hx), pt(-ha, hx), pt(-ha, -hx)]
        return Polygon([ring])
    }

    static func distance(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        hypot((b.longitude - a.longitude) * metresPerDegree * cos(b.latitude * .pi / 180),
              (b.latitude - a.latitude) * metresPerDegree)
    }

    static func bearing(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        let la1 = a.latitude * .pi / 180, la2 = b.latitude * .pi / 180, dl = (b.longitude - a.longitude) * .pi / 180
        let y = sin(dl) * cos(la2), x = cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dl)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    /// Miniature level of detail, same steps as the web: larger cabins when zoomed out.
    static func scale(forZoom z: Double) -> Double { z >= 14 ? 1 : z >= 13 ? 1.6 : z >= 12 ? 2.3 : 3 }
}

extension JSONObject {
    func string(_ key: String) -> String? { if case let .string(s)?? = self[key] { return s }; return nil }
    func number(_ key: String) -> Double? { if case let .number(n)?? = self[key] { return n }; return nil }
}
