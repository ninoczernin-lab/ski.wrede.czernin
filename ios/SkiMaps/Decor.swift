import UIKit
import CoreLocation
import MapboxMaps

/// Cartoon furniture for the iPhone map, matching preview/decor.js: the drawn badges (lift station,
/// hut), snowmen beside huts and stations, and tiny skiers sliding down the runs.
enum Cartoon {
    static let ink = UIColor(hex: 0x1B2440)          // outline around runs, badges and figures
    static let liftViolet = UIColor(hex: 0x6A3DF0)   // lift cables: a hue no region uses for runs
    static let liftYellow = UIColor(hex: 0xFFC81E)   // cabins, station roofs and station badges
    /// Jackets: bright, and none of them a run colour or lift violet.
    static let jackets: [UIColor] = [UIColor(hex: 0xFFD21F), UIColor(hex: 0xFF4FB8), UIColor(hex: 0x12C2C2)]

    // MARK: Icons (registered once per style load)

    static func register(on map: MapboxMap) {
        try? map.addImage(badge(fill: liftYellow, glyph: drawCableCar), id: "station")
        try? map.addImage(badge(fill: .white, glyph: drawChalet), id: "hut")
        try? map.addImage(snowman(), id: "snowman")
        for (i, c) in jackets.enumerated() {
            try? map.addImage(skier(c, flip: false), id: "skier-\(i)-r")
            try? map.addImage(skier(c, flip: true), id: "skier-\(i)-l")
        }
    }

    /// Round badge: soft shadow, white rim, 2 pt ink outline, coloured face, drawn glyph.
    private static func badge(fill: UIColor, glyph: @escaping (CGContext, CGPoint) -> Void, size: CGFloat = 30) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: size, height: size + 3)).image { r in
            let g = r.cgContext, c = CGPoint(x: size / 2, y: size / 2), rad = size / 2 - 3
            g.setShadow(offset: CGSize(width: 0, height: 1.5), blur: 3, color: UIColor(red: 0.08, green: 0.11, blue: 0.24, alpha: 0.28).cgColor)
            g.setFillColor(UIColor.white.cgColor)
            g.fillEllipse(in: CGRect(x: c.x - rad, y: c.y - rad, width: rad * 2, height: rad * 2))
            g.setShadow(offset: .zero, blur: 0)
            g.setStrokeColor(ink.cgColor); g.setLineWidth(2)
            g.strokeEllipse(in: CGRect(x: c.x - rad, y: c.y - rad, width: rad * 2, height: rad * 2))
            g.setFillColor(fill.cgColor)
            g.fillEllipse(in: CGRect(x: c.x - rad + 3, y: c.y - rad + 3, width: (rad - 3) * 2, height: (rad - 3) * 2))
            g.setLineCap(.round); g.setLineJoin(.round)
            glyph(g, c)
        }
    }

    private static func drawCableCar(_ g: CGContext, _ c: CGPoint) {
        g.setStrokeColor(liftViolet.cgColor); g.setLineWidth(2)
        g.move(to: CGPoint(x: c.x - 9, y: c.y - 7)); g.addLine(to: CGPoint(x: c.x + 9, y: c.y - 3.5)); g.strokePath()
        g.setStrokeColor(ink.cgColor); g.setLineWidth(1.8)
        g.move(to: CGPoint(x: c.x, y: c.y - 5.3)); g.addLine(to: CGPoint(x: c.x, y: c.y - 2)); g.strokePath()
        g.setFillColor(ink.cgColor)
        g.addPath(UIBezierPath(roundedRect: CGRect(x: c.x - 5.5, y: c.y - 2, width: 11, height: 9), cornerRadius: 2.5).cgPath); g.fillPath()
        g.setFillColor(UIColor.white.cgColor)
        g.fill(CGRect(x: c.x - 3.8, y: c.y - 0.4, width: 3.2, height: 3.2))
        g.fill(CGRect(x: c.x + 0.6, y: c.y - 0.4, width: 3.2, height: 3.2))
    }

    private static func drawChalet(_ g: CGContext, _ c: CGPoint) {
        g.setStrokeColor(ink.cgColor); g.setLineWidth(1.4)
        g.setFillColor(UIColor(hex: 0xB8743F).cgColor)
        g.addRect(CGRect(x: c.x - 6, y: c.y - 1, width: 12, height: 8)); g.drawPath(using: .fillStroke)
        g.setFillColor(UIColor(hex: 0xE8413A).cgColor)
        g.move(to: CGPoint(x: c.x - 9, y: c.y)); g.addLine(to: CGPoint(x: c.x, y: c.y - 8)); g.addLine(to: CGPoint(x: c.x + 9, y: c.y)); g.closePath()
        g.drawPath(using: .fillStroke)
        g.setFillColor(UIColor.white.cgColor)
        g.move(to: CGPoint(x: c.x - 4.5, y: c.y - 4)); g.addLine(to: CGPoint(x: c.x, y: c.y - 8)); g.addLine(to: CGPoint(x: c.x + 4.5, y: c.y - 4))
        g.addLine(to: CGPoint(x: c.x, y: c.y - 5.6)); g.closePath(); g.fillPath()
        g.setFillColor(UIColor(hex: 0xFFD86B).cgColor)
        g.addRect(CGRect(x: c.x - 2, y: c.y + 1.5, width: 4, height: 3.5)); g.drawPath(using: .fillStroke)
    }

    private static func snowman() -> UIImage {
        let w: CGFloat = 22, h: CGFloat = 30
        return UIGraphicsImageRenderer(size: CGSize(width: w, height: h)).image { r in
            let g = r.cgContext
            g.setFillColor(UIColor(red: 0.08, green: 0.11, blue: 0.24, alpha: 0.22).cgColor)
            g.fillEllipse(in: CGRect(x: w / 2 - 8, y: h - 4.5, width: 16, height: 4))
            for (y, rad) in [(h - 9, 7.2), (h - 19.5, 5.2)] as [(CGFloat, CGFloat)] {
                let rect = CGRect(x: w / 2 - rad, y: y - rad, width: rad * 2, height: rad * 2)
                g.setFillColor(UIColor.white.cgColor); g.fillEllipse(in: rect)
                g.setStrokeColor(ink.cgColor); g.setLineWidth(1.6); g.strokeEllipse(in: rect)
            }
            g.setFillColor(ink.cgColor)
            g.fill(CGRect(x: w / 2 - 4.5, y: h - 25.2, width: 9, height: 1.8))
            g.fill(CGRect(x: w / 2 - 3, y: h - 29.5, width: 6, height: 4.6))
            g.fillEllipse(in: CGRect(x: w / 2 - 2.8, y: h - 21.5, width: 1.8, height: 1.8))
            g.fillEllipse(in: CGRect(x: w / 2 + 1, y: h - 21.5, width: 1.8, height: 1.8))
            g.fillEllipse(in: CGRect(x: w / 2 - 0.9, y: h - 11.9, width: 1.8, height: 1.8))
            g.fillEllipse(in: CGRect(x: w / 2 - 0.9, y: h - 8.4, width: 1.8, height: 1.8))
            g.setFillColor(UIColor(hex: 0xFF8A1F).cgColor)
            g.move(to: CGPoint(x: w / 2, y: h - 19.4)); g.addLine(to: CGPoint(x: w / 2 + 4.6, y: h - 18.4)); g.addLine(to: CGPoint(x: w / 2, y: h - 18)); g.closePath(); g.fillPath()
            g.setStrokeColor(UIColor(hex: 0xE8413A).cgColor); g.setLineWidth(2.2); g.setLineCap(.round)
            g.move(to: CGPoint(x: w / 2 - 4.4, y: h - 15)); g.addLine(to: CGPoint(x: w / 2 + 4.4, y: h - 15))
            g.move(to: CGPoint(x: w / 2 + 2.6, y: h - 15)); g.addLine(to: CGPoint(x: w / 2 + 3.6, y: h - 11.5)); g.strokePath()
        }
    }

    /// Side-on tucked skier facing right (`flip` faces left).
    private static func skier(_ jacket: UIColor, flip: Bool) -> UIImage {
        let w: CGFloat = 22, h: CGFloat = 22
        return UIGraphicsImageRenderer(size: CGSize(width: w, height: h)).image { r in
            let g = r.cgContext
            if flip { g.translateBy(x: w, y: 0); g.scaleBy(x: -1, y: 1) }
            g.setLineCap(.round); g.setLineJoin(.round)
            g.setFillColor(UIColor(red: 0.08, green: 0.11, blue: 0.24, alpha: 0.2).cgColor)
            g.fillEllipse(in: CGRect(x: 3, y: 18, width: 16, height: 3.2))
            g.setStrokeColor(ink.cgColor); g.setLineWidth(1.7)
            g.move(to: CGPoint(x: 2.5, y: 17.2)); g.addLine(to: CGPoint(x: 19, y: 17.2))
            g.addQuadCurve(to: CGPoint(x: 20.8, y: 15.6), control: CGPoint(x: 20.8, y: 17.2)); g.strokePath()
            g.setStrokeColor(UIColor(hex: 0x2A3354).cgColor); g.setLineWidth(2.4)
            g.move(to: CGPoint(x: 8.6, y: 16.6)); g.addLine(to: CGPoint(x: 10.4, y: 12.4)); g.addLine(to: CGPoint(x: 9.2, y: 9.6))
            g.move(to: CGPoint(x: 12.8, y: 16.6)); g.addLine(to: CGPoint(x: 13.2, y: 12.6)); g.addLine(to: CGPoint(x: 10.6, y: 9.6)); g.strokePath()
            g.setFillColor(jacket.cgColor); g.setStrokeColor(ink.cgColor); g.setLineWidth(1.3)
            g.saveGState(); g.translateBy(x: 11.4, y: 7.6); g.rotate(by: -0.5)
            g.addEllipse(in: CGRect(x: -3.6, y: -3.1, width: 7.2, height: 6.2)); g.drawPath(using: .fillStroke); g.restoreGState()
            g.setLineWidth(1.2)
            g.move(to: CGPoint(x: 13.6, y: 8.4)); g.addLine(to: CGPoint(x: 17.6, y: 15.4)); g.strokePath()
            g.setFillColor(UIColor(hex: 0xFFD9B8).cgColor)
            g.addEllipse(in: CGRect(x: 12, y: 1.2, width: 4.8, height: 4.8)); g.drawPath(using: .fillStroke)
            g.setFillColor(jacket.cgColor)
            g.addArc(center: CGPoint(x: 14.2, y: 2.9), radius: 2.5, startAngle: .pi * 1.05, endAngle: .pi * 1.95, clockwise: false)
            g.closePath(); g.drawPath(using: .fillStroke)
        }
    }
}

// MARK: - Geometry (port of preview/decor.js)

struct SkierTrack {
    let id: Int
    let line: [CLLocationCoordinate2D]
    let cum: [Double]
    let length: Double
    let riders: Int
    let bbox: (w: Double, s: Double, e: Double, n: Double)
}

enum Decor {
    private static let mLat = 111_320.0
    private static func mLon(_ lat: Double) -> Double { mLat * cos(lat * .pi / 180) }
    private static func hash(_ n: Double) -> Double { let x = sin(n * 127.1 + 311.7) * 43758.5453; return x - floor(x) }

    /// Downhill runs a skier can follow (OSM draws pistes in the direction you ski them).
    /// One skier per ~700 m of run, never more than three; runs under 120 m get nobody.
    static func tracks(from pistes: FeatureCollection) -> [SkierTrack] {
        var out: [SkierTrack] = []
        for f in pistes.features where f.properties?.string("piste:type") == "downhill" {
            let lines: [[CLLocationCoordinate2D]]
            switch f.geometry {
            case let .lineString(l)?: lines = [l.coordinates]
            case let .multiLineString(m)?: lines = m.coordinates
            default: continue
            }
            for line in lines where line.count >= 2 {
                var cum = [0.0]
                for i in 1..<line.count {
                    let a = line[i - 1], b = line[i]
                    cum.append(cum[i - 1] + hypot((b.longitude - a.longitude) * mLon(a.latitude), (b.latitude - a.latitude) * mLat))
                }
                let length = cum.last!
                guard length >= 120 else { continue }
                let lons = line.map(\.longitude), lats = line.map(\.latitude)
                out.append(SkierTrack(id: out.count, line: line, cum: cum, length: length,
                                      riders: min(3, max(1, Int((length / 700).rounded()))),
                                      bbox: (lons.min()!, lats.min()!, lons.max()!, lats.max()!)))
            }
        }
        return out
    }

    /// Skiers at a moment: each rides its run top to bottom and starts again, carving S-turns.
    /// `scale` is the miniature level of detail; `bearing` (degrees) picks the left/right-facing icon.
    static func skiers(_ tracks: [SkierTrack], seconds: Double, view: CoordinateBounds?, limit: Int, scale: Double, bearing: Double) -> [Feature] {
        var out: [Feature] = []
        let b = bearing * .pi / 180
        for t in tracks {
            if let v = view, t.bbox.e < v.west || t.bbox.w > v.east || t.bbox.n < v.south || t.bbox.s > v.north { continue }
            for r in 0..<t.riders {
                if out.count >= limit { return out }
                let seed = Double(t.id) * 7.13 + Double(r) * 3.7
                let speed = (9 + 5 * hash(seed)) * scale
                let d = (seconds * speed + hash(seed + 1) * t.length).truncatingRemainder(dividingBy: t.length)
                var i = 1
                while i < t.cum.count - 1 && t.cum[i] < d { i += 1 }
                let a = t.line[i - 1], c = t.line[i]
                let k = max(0, min(1, (d - t.cum[i - 1]) / max(1, t.cum[i] - t.cum[i - 1])))
                let dx = (c.longitude - a.longitude) * mLon(a.latitude), dy = (c.latitude - a.latitude) * mLat
                let len = max(1e-6, hypot(dx, dy)), ux = dx / len, uy = dy / len
                let lat0 = a.latitude + (c.latitude - a.latitude) * k, lon0 = a.longitude + (c.longitude - a.longitude) * k
                let swing = sin(d / (70 * scale) * 2 * .pi + hash(seed + 2) * 6) * 5 * scale
                var f = Feature(geometry: .point(Point(CLLocationCoordinate2D(latitude: lat0 + ux * swing / mLat,
                                                                                longitude: lon0 - uy * swing / mLon(lat0)))))
                let right = ux * cos(b) - uy * sin(b)
                f.properties = ["jacket": .number(Double(Int(hash(seed + 3) * Double(Cartoon.jackets.count)))),
                                "face": .string(right >= 0 ? "r" : "l")]
                out.append(f)
            }
        }
        return out
    }

    /// Skier miniature level of detail: faster, wider turns when zoomed out so they read as skiers.
    static func scale(forZoom z: Double) -> Double { z >= 15 ? 1 : z >= 14 ? 1.4 : 2 }

    /// Both ends of every lift line (the stations), for the yellow station badges.
    static func terminals(from lifts: FeatureCollection) -> [Feature] {
        lifts.features.flatMap { f -> [Feature] in
            guard case let .lineString(l)? = f.geometry, let a = l.coordinates.first, let b = l.coordinates.last else { return [] }
            return [a, b].map { c in var p = Feature(geometry: .point(Point(c))); p.properties = f.properties; return p }
        }
    }

    /// A light sprinkle of snowmen: beside most huts and about every third station. Each stands at its
    /// hut or station; the layer's icon offset puts it beside the badge at any zoom or tilt.
    static func snowmen(huts: [CLLocationCoordinate2D], stations: [CLLocationCoordinate2D], limit: Int = 40) -> [Feature] {
        var out: [Feature] = []
        let anchors = huts.map { ($0, 0.8) } + stations.map { ($0, 0.3) }
        for (i, (p, chance)) in anchors.enumerated() where out.count < limit {
            let seed = (p.longitude * 1e4).rounded() * 0.37 + (p.latitude * 1e4).rounded() * 0.71 + Double(i) * 0.01
            guard hash(seed) <= chance else { continue }
            out.append(Feature(geometry: .point(Point(p))))
        }
        return out
    }

    static func lines(_ fc: FeatureCollection) -> [[CLLocationCoordinate2D]] {
        fc.features.flatMap { f -> [[CLLocationCoordinate2D]] in
            switch f.geometry {
            case let .lineString(l)?: return [l.coordinates]
            case let .multiLineString(m)?: return m.coordinates
            default: return []
            }
        }
    }
}
