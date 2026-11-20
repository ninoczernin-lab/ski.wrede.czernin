import Foundation
import MapboxMaps

/// Downloads everything one resort needs to work with no signal:
/// the style pack (style JSON, fonts, sprites) plus vector + terrain-DEM tiles for the resort area.
/// Piste/lift GeoJSON is bundled in the app, so it is always offline.
@MainActor
final class OfflineResortStore: ObservableObject {
    enum State: Equatable { case notDownloaded, downloading(Double), ready, failed(String) }

    static let styleURI = StyleURI.outdoors
    static let demTileset = "mapbox://mapbox.mapbox-terrain-dem-v1"
    /// z10–16 covers overview to individual runs. Raise the max only if your tile budget allows.
    static let zoomRange: ClosedRange<UInt8> = 10...16

    @Published private(set) var states: [String: State] = [:]

    private let offlineManager = OfflineManager()
    private let tileStore = TileStore.default
    private var cancelables: [String: [Cancelable]] = [:]

    init() { Task { await refresh() } }

    func state(for r: Resort) -> State { states[r.id] ?? .notDownloaded }

    /// Marks resorts whose tile region already exists on disk as ready.
    func refresh() async {
        tileStore.allTileRegions { [weak self] result in
            guard case let .success(regions) = result else { return }
            let ids = Set(regions.map(\.id))
            Task { @MainActor in
                for r in ResortCatalog.all where ids.contains(r.id) && self?.states[r.id] == nil {
                    self?.states[r.id] = .ready
                }
            }
        }
    }

    func download(_ r: Resort) {
        guard state(for: r) != .ready else { return }
        states[r.id] = .downloading(0)
        var stylePackDone = 0.0, tilesDone = 0.0
        let report = { [weak self] in self?.states[r.id] = .downloading(0.15 * stylePackDone + 0.85 * tilesDone) }

        // 1. Style pack
        let styleOpts = StylePackLoadOptions(glyphsRasterizationMode: .ideographsRasterizedLocally,
                                             metadata: ["resort": r.id], acceptExpired: false)!
        let a = offlineManager.loadStylePack(for: Self.styleURI, loadOptions: styleOpts) { p in
            Task { @MainActor in
                stylePackDone = p.requiredResourceCount == 0 ? 0 : Double(p.completedResourceCount) / Double(p.requiredResourceCount)
                report()
            }
        } completion: { [weak self] result in
            if case let .failure(e) = result { Task { @MainActor in self?.states[r.id] = .failed(e.localizedDescription) } }
        }

        // 2. Tiles: style's vector tiles + terrain DEM for 3D
        let descriptor = offlineManager.createTilesetDescriptor(
            for: TilesetDescriptorOptions(styleURI: Self.styleURI, zoomRange: Self.zoomRange,
                                          tilesets: [Self.demTileset]))
        let b = r.bbox
        let polygon = Polygon([[
            .init(latitude: b.south, longitude: b.west), .init(latitude: b.south, longitude: b.east),
            .init(latitude: b.north, longitude: b.east), .init(latitude: b.north, longitude: b.west),
            .init(latitude: b.south, longitude: b.west),
        ]])
        let tileOpts = TileRegionLoadOptions(geometry: .polygon(polygon), descriptors: [descriptor],
                                             metadata: ["name": r.name], acceptExpired: true)!
        let c = tileStore.loadTileRegion(forId: r.id, loadOptions: tileOpts) { p in
            Task { @MainActor in
                tilesDone = p.requiredResourceCount == 0 ? 0 : Double(p.completedResourceCount) / Double(p.requiredResourceCount)
                report()
            }
        } completion: { [weak self] result in
            Task { @MainActor in
                switch result {
                case .success: self?.states[r.id] = .ready
                case let .failure(e): self?.states[r.id] = .failed(e.localizedDescription)
                }
                self?.cancelables[r.id] = nil
            }
        }
        cancelables[r.id] = [a, c]
    }

    func cancel(_ r: Resort) {
        cancelables[r.id]?.forEach { $0.cancel() }
        cancelables[r.id] = nil
        states[r.id] = .notDownloaded
    }

    func delete(_ r: Resort) {
        cancel(r)
        tileStore.removeTileRegion(forId: r.id)
        // Style pack is shared by all resorts; remove it only when no resort is left.
        if !states.values.contains(.ready) { offlineManager.removeStylePack(for: Self.styleURI) }
    }
}
