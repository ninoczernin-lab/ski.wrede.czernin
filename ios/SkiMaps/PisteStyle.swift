import UIKit
import SwiftUI
import MapboxMaps

/// Single source of truth for how runs look, used by the map layers and the legend, so colours
/// never drift apart. Matches preview/app.js: the same diorama palette and the same regional
/// conventions. Values match the normalised set from pipeline/clean.mjs.
enum PisteDifficulty: String, CaseIterable, Identifiable {
    case novice, easy, intermediate, advanced, expert, freeride, unknown
    var id: String { rawValue }

    /// Colour in the resort's own convention (a Vail blue run is "intermediate"; an Austrian one is "easy").
    func color(in region: RunRegion) -> UIColor {
        let name: RunColor
        switch self {
        case .novice: name = .green
        case .easy: name = region == .eu ? .blue : .green
        case .intermediate: name = region == .na ? .blue : .red
        case .advanced, .expert: name = .black
        case .freeride: name = .orange
        case .unknown: name = .grey
        }
        return name.uiColor
    }

    /// Fallback wording when a region's legend doesn't name this difficulty.
    var label: String {
        switch self {
        case .novice: "Beginner"
        case .easy: "Easy"
        case .intermediate: "Intermediate"
        case .advanced: "Difficult"
        case .expert: "Expert"
        case .freeride: "Freeride"
        case .unknown: "Not classified"
        }
    }

    func label(for country: String) -> String {
        PisteDifficulty.legend(for: country).first { $0.difficulty == self }?.label ?? label
    }

    struct LegendEntry: Identifiable {
        let difficulty: PisteDifficulty
        let label: String
        var id: String { difficulty.rawValue }
    }

    /// The legend in the order and words skiers in that region know.
    static func legend(for country: String) -> [LegendEntry] {
        let e = { (d: PisteDifficulty, l: String) in LegendEntry(difficulty: d, label: l) }
        switch RunRegion.of(country) {
        case .na: return [e(.easy, "Easiest"), e(.intermediate, "More difficult"), e(.advanced, "Most difficult"), e(.expert, "Experts only")]
        case .asia: return [e(.easy, "Beginner"), e(.intermediate, "Intermediate"), e(.advanced, "Advanced")]
        case .eu:
            return ["FR", "ES"].contains(country)
                ? [e(.novice, "Beginner"), e(.easy, "Easy"), e(.intermediate, "Intermediate"), e(.advanced, "Difficult")]
                : [e(.easy, "Easy"), e(.intermediate, "Intermediate"), e(.advanced, "Difficult"), e(.freeride, "Freeride")]
        }
    }

    /// Mapbox expression mapping "piste:difficulty" to this region's colours.
    static func colorExpression(for country: String) -> Exp {
        let r = RunRegion.of(country)
        return Exp(.match) {
            Exp(.get) { "piste:difficulty" }
            PisteDifficulty.novice.rawValue; PisteDifficulty.novice.color(in: r)
            PisteDifficulty.easy.rawValue; PisteDifficulty.easy.color(in: r)
            PisteDifficulty.intermediate.rawValue; PisteDifficulty.intermediate.color(in: r)
            PisteDifficulty.advanced.rawValue; PisteDifficulty.advanced.color(in: r)
            PisteDifficulty.expert.rawValue; PisteDifficulty.expert.color(in: r)
            PisteDifficulty.freeride.rawValue; PisteDifficulty.freeride.color(in: r)
            PisteDifficulty.unknown.color(in: r)
        }
    }
}

/// Europe: blue / red / black. North America and Oceania: green / blue / black / double black.
/// Japan, Korea, China: green / red / black.
enum RunRegion {
    case eu, na, asia
    static func of(_ country: String) -> RunRegion {
        if ["US", "CA", "AU", "NZ"].contains(country) { return .na }
        if ["JP", "KR", "CN"].contains(country) { return .asia }
        return .eu
    }
}

/// The diorama run palette: crisp, high-contrast ribbons on snow (same values as the web map).
enum RunColor {
    case green, blue, red, black, orange, grey
    var uiColor: UIColor {
        switch self {
        case .green: UIColor(hex: 0x14A85A)
        case .blue: UIColor(hex: 0x1F6FE5)
        case .red: UIColor(hex: 0xE2203A)
        case .black: UIColor(hex: 0x141820)
        case .orange: UIColor(hex: 0xF08A12)
        case .grey: UIColor(hex: 0x6B7386)
        }
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
                  blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
    }
}

/// Line widths in screen points by zoom: slim, crisp ribbons with a white edge that separates
/// parallel runs (same stops as the web map).
enum PisteWidth {
    static let line: [(zoom: Double, width: Double)] = [(10, 1.8), (12, 3), (14, 5), (16, 7.5)]
    static let casing: [(zoom: Double, width: Double)] = [(10, 3.6), (12, 5.4), (14, 7.8), (16, 10.8)]
    static let sheen: [(zoom: Double, width: Double)] = [(12, 0.4), (14, 1.2), (16, 2)]

    static func expression(_ stops: [(zoom: Double, width: Double)]) -> Exp {
        Exp(.interpolate) {
            Exp(.exponential) { 1.4 }
            Exp(.zoom)
            stops.reduce(into: [Double: Double]()) { $0[$1.zoom] = $1.width }
        }
    }
}
