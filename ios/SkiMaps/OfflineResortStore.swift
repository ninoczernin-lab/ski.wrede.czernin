import Foundation

/// "Save offline" for one resort: everything the web map needs for it goes into MapCache ahead of
/// time, so the resort opens with no signal. The same files land there anyway when you browse a
/// resort; saving fetches them up front and keeps them from being trimmed.
///
/// Saved: the map tiles (OpenFreeMap, zoom 6–14), terrain (AWS Terrain Tiles, zoom 6–14), the label
/// fonts, and the OpenStreetMap runs, lifts and huts. Satellite imagery is not saved (Esri's terms
/// don't allow bulk downloads), so the Satellite look needs a connection.
@MainActor
final class OfflineResortStore: ObservableObject {
    enum State: Equatable { case notDownloaded, downloading(Double), ready, failed(String) }

    @Published private(set) var states: [String: State] = [:]
    private var tasks: [String: Task<Void, Never>] = [:]
    private let cache = MapCache.shared
    private let manifests: URL

    static let tileJSON = URL(string: "https://tiles.openfreemap.org/planet")!
    static let terrain = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    static let overpass = URL(string: "https://overpass-api.de/api/interpreter")!
    static let fonts = ["Noto Sans Regular", "Noto Sans Bold"]
    static let glyphRanges = ["0-255", "256-511", "512-767", "7936-8191", "8192-8447"]
    static let zooms = 6...14

    init() {
        manifests = cache.directory.appendingPathComponent("saved", isDirectory: true)
        try? FileManager.default.createDirectory(at: manifests, withIntermediateDirectories: true)
        for id in savedIDs() { states[id] = .ready }
        let pinned = Set(savedIDs().flatMap { keys(for: $0) })
        Task.detached(priority: .background) { [cache] in cache.trim(keeping: pinned) }
    }

    func state(for r: Resort) -> State { states[r.id] ?? .notDownloaded }

    func download(_ r: Resort) {
        guard state(for: r) != .ready, tasks[r.id] == nil else { return }
        states[r.id] = .downloading(0)
        tasks[r.id] = Task { [weak self] in
            guard let self else { return }
            do {
                let keys = try await self.fetchAll(for: r) { p in self.states[r.id] = .downloading(p) }
                try JSONEncoder().encode(keys).write(to: self.manifest(r.id), options: .atomic)
                self.states[r.id] = .ready
            } catch is CancellationError {
                self.states[r.id] = .notDownloaded
            } catch {
                self.states[r.id] = .failed(error.localizedDescription)
            }
            self.tasks[r.id] = nil
        }
    }

    func cancel(_ r: Resort) { tasks[r.id]?.cancel() }

    /// Forgets the saved copy. Files another saved resort shares stay.
    func delete(_ r: Resort) {
        let others = Set(savedIDs().filter { $0 != r.id }.flatMap { keys(for: $0) })
        for k in keys(for: r.id) where !others.contains(k) { cache.remove(k) }
        try? FileManager.default.removeItem(at: manifest(r.id))
        states[r.id] = .notDownloaded
    }

    // MARK: Files

    private func manifest(_ id: String) -> URL { manifests.appendingPathComponent(id + ".json") }
    private func savedIDs() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: manifests.path)) ?? [])
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }
    }
    private func keys(for id: String) -> [String] {
        (try? JSONDecoder().decode([String].self, from: Data(contentsOf: manifest(id)))) ?? []
    }

    // MARK: Download

    private func fetchAll(for r: Resort, progress: @escaping (Double) -> Void) async throws -> [String] {
        // The tile set's URL template comes from its TileJSON (it changes with each OpenFreeMap build).
        let tileJSON = try await get(URLRequest(url: Self.tileJSON))
        guard let json = try? JSONSerialization.jsonObject(with: tileJSON.data) as? [String: Any],
              let template = (json["tiles"] as? [String])?.first else { throw URLError(.cannotParseResponse) }

        var requests: [URLRequest] = []
        for (x, y, z) in Self.tiles(r.bbox, zooms: Self.zooms) {
            for t in [template, Self.terrain] {
                let u = t.replacingOccurrences(of: "{z}", with: "\(z)").replacingOccurrences(of: "{x}", with: "\(x)").replacingOccurrences(of: "{y}", with: "\(y)")
                if let url = URL(string: u) { requests.append(URLRequest(url: url)) }
            }
        }
        for font in Self.fonts {
            let stack = font.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? font
            for range in Self.glyphRanges {
                if let url = URL(string: "https://tiles.openfreemap.org/fonts/\(stack)/\(range).pbf") { requests.append(URLRequest(url: url)) }
            }
        }
        var overpass = URLRequest(url: Self.overpass)
        overpass.httpMethod = "POST"
        overpass.timeoutInterval = 180
        overpass.setValue("application/x-www-form-urlencoded;charset=UTF-8", forHTTPHeaderField: "Content-Type")
        let query = Self.overpassQuery(r.bbox)
        var form = CharacterSet.alphanumerics; form.insert(charactersIn: "-._*")
        overpass.httpBody = Data(("data=" + (query.addingPercentEncoding(withAllowedCharacters: form) ?? query)).utf8)

        var keys = [MapCache.key(method: "GET", url: Self.tileJSON.absoluteString)]
        let total = Double(requests.count + 1)
        var done = 0.0
        // Six at a time: quick, and polite to the free tile servers.
        try await withThrowingTaskGroup(of: String.self) { group in
            var queue = requests[...]
            for _ in 0..<6 { if let next = queue.popFirst() { group.addTask { try await self.keyed(next) } } }
            while let key = try await group.next() {
                try Task.checkCancellation()
                keys.append(key); done += 1; progress(0.9 * done / total)
                if let next = queue.popFirst() { group.addTask { try await self.keyed(next) } }
            }
        }
        _ = try await get(overpass)                       // the runs, lifts and huts (slowest, last)
        keys.append(MapCache.key(method: "POST", url: Self.overpass.absoluteString, body: query))
        progress(1)
        return keys
    }

    private nonisolated func keyed(_ request: URLRequest) async throws -> String {
        _ = try await get(request)
        return MapCache.key(method: "GET", url: request.url!.absoluteString)
    }

    private nonisolated func get(_ request: URLRequest) async throws -> (data: Data, entry: MapCache.Entry) {
        try await withCheckedThrowingContinuation { c in
            MapCache.shared.fetch(request) { result in
                switch result {
                case let .success((data, entry)) where (200..<300).contains(entry.status): c.resume(returning: (data, entry))
                case let .success((_, entry)): c.resume(throwing: URLError(.badServerResponse, userInfo: ["status": entry.status]))
                case let .failure(e): c.resume(throwing: e)
                }
            }
        }
    }

    /// Slippy-map tiles covering the resort's box at each zoom.
    static func tiles(_ b: Resort.BBox, zooms: ClosedRange<Int>) -> [(Int, Int, Int)] {
        func x(_ lon: Double, _ z: Int) -> Int { Int(floor((lon + 180) / 360 * pow(2, Double(z)))) }
        func y(_ lat: Double, _ z: Int) -> Int {
            let r = lat * .pi / 180
            return Int(floor((1 - log(tan(r) + 1 / cos(r)) / .pi) / 2 * pow(2, Double(z))))
        }
        return zooms.flatMap { z in
            (x(b.west, z)...x(b.east, z)).flatMap { tx in (y(b.north, z)...y(b.south, z)).map { ty in (tx, ty, z) } }
        }
    }

    /// The same text as pipeline/query.mjs builds (byte for byte), so a saved copy answers the web map.
    static func overpassQuery(_ b: Resort.BBox) -> String {
        // Numbers printed the way JavaScript prints them: 47 not 47.0, 47.1234 as is.
        func js(_ v: Double) -> String { v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : "\(v)" }
        let bb = "\(js(b.south)),\(js(b.west)),\(js(b.north)),\(js(b.east))"
        return """
        [out:json][timeout:180];
        (
          way["piste:type"](\(bb));
          relation["piste:type"](\(bb));
          way["aerialway"](\(bb));
          node["aerialway"="station"](\(bb));
          way["landuse"="winter_sports"](\(bb));
          relation["landuse"="winter_sports"](\(bb));
          node["tourism"~"^(alpine_hut|wilderness_hut)$"](\(bb));
          way["tourism"~"^(alpine_hut|wilderness_hut)$"](\(bb));
          node["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food)$"](\(bb));
          way["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food)$"](\(bb));
        );
        out body;
        >;
        out skel qt;
        """
    }
}
