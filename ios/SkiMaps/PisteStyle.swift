import UIKit
import SwiftUI
import MapboxMaps

/// Single source of truth for how runs look, used by the map layers and the legend,
/// so colours never drift apart. Values match the normalised set from pipeline/clean.mjs.
enum PisteDifficulty: String, CaseIterable, Identifiable {
    case novice, easy, intermediate, advanced, expert, freeride, unknown
    var id: String { rawValue }

    var color: UIColor {
        switch self {
        case .novice:       UIColor(red: 0.00, green: 0.62, blue: 0.29, alpha: 1)   // green
        case .easy:         UIColor(red: 0.00, green: 0.40, blue: 0.90, alpha: 1)   // blue
        case .intermediate: UIColor(red: 0.89, green: 0.07, blue: 0.13, alpha: 1)   // red
        case .advanced:     UIColor(red: 0.05, green: 0.05, blue: 0.05, alpha: 1)   // black
        case .expert:       UIColor(red: 0.05, green: 0.05, blue: 0.05, alpha: 1)   // black (double)
        case .freeride:     UIColor(red: 0.98, green: 0.55, blue: 0.00, alpha: 1)   // orange
        case .unknown:      UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)   // grey, dashed
        }
    }

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

    /// Which difficulties each country's resorts use (France has green runs, Austria doesn't).
    static func legend(for country: String) -> [PisteDifficulty] {
        country == "FR" ? [.novice, .easy, .intermediate, .advanced] : [.easy, .intermediate, .advanced, .freeride]
    }

    /// Mapbox expression mapping the "piste:difficulty" property to the colours above.
    static var colorExpression: Exp {
        Exp(.match) {
            Exp(.get) { "piste:difficulty" }
            PisteDifficulty.novice.rawValue; PisteDifficulty.novice.color
            PisteDifficulty.easy.rawValue; PisteDifficulty.easy.color
            PisteDifficulty.intermediate.rawValue; PisteDifficulty.intermediate.color
            PisteDifficulty.advanced.rawValue; PisteDifficulty.advanced.color
            PisteDifficulty.expert.rawValue; PisteDifficulty.expert.color
            PisteDifficulty.freeride.rawValue; PisteDifficulty.freeride.color
            PisteDifficulty.unknown.color
        }
    }
}

/// Line widths in screen points by zoom: thick enough to read at the resort overview (z11),
/// without drowning the terrain when zoomed in on a single run (z16).
enum PisteWidth {
    static let line: [(zoom: Double, width: Double)] = [(10, 2.2), (12, 3.5), (14, 5.5), (16, 8)]
    static let casing: [(zoom: Double, width: Double)] = [(10, 4), (12, 6), (14, 9), (16, 13)]

    static func expression(_ stops: [(zoom: Double, width: Double)]) -> Exp {
        Exp(.interpolate) {
            Exp(.exponential) { 1.4 }
            Exp(.zoom)
            stops.reduce(into: [Double: Double]()) { $0[$1.zoom] = $1.width }
        }
    }
}
