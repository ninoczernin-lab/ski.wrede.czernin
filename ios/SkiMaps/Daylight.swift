import Foundation
import UIKit

/// Time of day → light, the same keyframes as preview/daylight.js. One hour value (5.5–21) drives
/// Standard's light preset, the sky atmosphere (an Alto-style gradient) and the relief shading.
struct Daylight {
    static let range: ClosedRange<Double> = 5.5...21

    let hour: Double
    let preset: String            // "dawn" | "day" | "dusk" | "night"
    let part: String              // "Golden hour", …
    let azimuth: Double           // sun direction, degrees clockwise from north
    let altitude: Double          // degrees above the horizon
    let horizon: UIColor, zenith: UIColor, space: UIColor
    let shadow: UIColor, highlight: UIColor, accent: UIColor
    let stars: Double
    let relief: Double
    var isDark: Bool { horizon.luminance < 0.22 }

    // hour, horizon, zenith, space, sun altitude, shade shadow, shade highlight, shade accent, stars
    private static let keys: [(Double, UInt32, UInt32, UInt32, Double, UInt32, UInt32, UInt32, Double)] = [
        (5.5, 0x2B3559, 0x141B3A, 0x0B1028, -6, 0x26335C, 0x8D9BD0, 0x18213F, 0.35),
        (7.0, 0xF7CFBF, 0x9A8FD2, 0xC9B6E6, 8, 0x58568F, 0xFFE7D8, 0x3A3A6C, 0),
        (9.0, 0xE9F1FA, 0x7EB2E6, 0xB9D5F2, 30, 0x3C5679, 0xFFFFFF, 0x24344F, 0),
        (12.5, 0xF2F7FC, 0x5AA6E8, 0xA8CEF2, 46, 0x41618D, 0xFFFFFF, 0x253752, 0),
        (16.0, 0xEEF2F6, 0x77A8DC, 0xB4CFEE, 28, 0x455A85, 0xFFFAF0, 0x2A3753, 0),
        (17.7, 0xFFCF9E, 0xE7887B, 0xF2B28C, 9, 0x594885, 0xFFE0B0, 0x35295A, 0),
        (19.1, 0x8D86C3, 0x484D91, 0x2C336E, -2, 0x2F3367, 0xC2B7E6, 0x1D2147, 0.1),
        (21.0, 0x1C2446, 0x0C1230, 0x060A1D, -10, 0x1C2447, 0x7C8BC3, 0x121A36, 0.4),
    ]

    /// Southern-hemisphere resorts see the sun swing through the north.
    init(hour raw: Double, southern: Bool = false) {
        let h = min(Daylight.range.upperBound, max(Daylight.range.lowerBound, raw))
        let k = Daylight.keys
        let i = max(0, min(k.count - 2, (k.firstIndex { $0.0 > h } ?? k.count) - 1))
        let a = k[i], b = k[i + 1], t = (h - a.0) / (b.0 - a.0)
        let mix = { (x: UInt32, y: UInt32) in UIColor(hex: x).mixed(with: UIColor(hex: y), t) }
        hour = h
        preset = h < 6.4 ? "night" : h < 8.2 ? "dawn" : h < 17.2 ? "day" : h < 20.2 ? "dusk" : "night"
        part = h < 6.4 ? "Before dawn" : h < 8.2 ? "Sunrise" : h < 11 ? "Morning" : h < 14 ? "Midday"
            : h < 17 ? "Afternoon" : h < 18.6 ? "Golden hour" : h < 20.2 ? "Blue hour" : "Night"
        let north = 90 + (h - 6) * 15
        azimuth = ((southern ? 180 - north : north) + 360).truncatingRemainder(dividingBy: 360)
        altitude = a.4 + (b.4 - a.4) * t
        horizon = mix(a.1, b.1); zenith = mix(a.2, b.2); space = mix(a.3, b.3)
        shadow = mix(a.5, b.5); highlight = mix(a.6, b.6); accent = mix(a.7, b.7)
        stars = a.8 + (b.8 - a.8) * t
        relief = 0.95 - 0.2 * min(1, max(0, altitude) / 45)
    }

    var clock: String { clock(twelveHour: false) }

    /// "18:05", or "6:05 PM" in 12-hour mode.
    func clock(twelveHour: Bool) -> String {
        let m = Int((hour * 60).rounded()), h = (m / 60) % 24, mm = m % 60
        if !twelveHour { return String(format: "%02d:%02d", h, mm) }
        return String(format: "%d:%02d %@", h % 12 == 0 ? 12 : h % 12, mm, h < 12 ? "AM" : "PM")
    }
}

extension UIColor {
    func mixed(with other: UIColor, _ t: Double) -> UIColor {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let f = CGFloat(t)
        return UIColor(red: r1 + (r2 - r1) * f, green: g1 + (g2 - g1) * f, blue: b1 + (b2 - b1) * f, alpha: 1)
    }
    var luminance: Double {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        let lin = { (c: CGFloat) -> Double in let v = Double(c); return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    /// "#rrggbb" for Mapbox style properties set as JSON.
    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02x%02x%02x", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}
