import Foundation
import CryptoKit
import WebKit

/// The app's offline memory for the map. Every network request the web map makes (vector tiles,
/// terrain, fonts, satellite imagery, OpenStreetMap run data) arrives here as `skimap-net://host/path`
/// and is answered from disk when possible, so a resort that was opened or saved once still works
/// with no signal.
///
/// - Tiles and fonts: cache first (they rarely change), network when missing.
/// - JSON and OpenStreetMap queries: network first (fresh data), the cached copy when offline.
final class MapCache: NSObject, WKURLSchemeHandler, @unchecked Sendable {
    static let shared = MapCache()
    static let scheme = "skimap-net"

    let directory: URL
    private let session: URLSession
    private let lock = NSLock()
    private var running: [ObjectIdentifier: URLSessionDataTask] = [:]
    /// Files trimmed oldest-first above this size, except those a saved resort needs.
    private let budget: Int64 = 1_500_000_000

    override init() {
        directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("MapCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let config = URLSessionConfiguration.default
        config.urlCache = nil                       // this class is the cache
        config.timeoutIntervalForRequest = 25
        config.httpMaximumConnectionsPerHost = 8
        session = URLSession(configuration: config)
        super.init()
    }

    // MARK: Keys

    struct Entry: Codable { let status: Int; let mime: String; let savedAt: Date }

    /// One file per request: the method, the https URL and, for a POST, the decoded form body.
    static func key(method: String, url: String, body: String? = nil) -> String {
        let digest = SHA256.hash(data: Data("\(method) \(url)\n\(body ?? "")".utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// The `data` field of an `application/x-www-form-urlencoded` body, decoded (what the query says,
    /// independent of how a browser chose to escape it).
    static func formValue(_ body: Data?, field: String = "data") -> String? {
        guard let body, let text = String(data: body, encoding: .utf8) else { return nil }
        for pair in text.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard kv.count == 2, kv[0] == field else { continue }
            return kv[1].replacingOccurrences(of: "+", with: " ").removingPercentEncoding
        }
        return nil
    }

    private func files(_ key: String) -> (data: URL, meta: URL) {
        (directory.appendingPathComponent(key + ".bin"), directory.appendingPathComponent(key + ".json"))
    }

    func cached(_ key: String) -> (Data, Entry)? {
        let f = files(key)
        guard let meta = try? Data(contentsOf: f.meta), let entry = try? JSONDecoder().decode(Entry.self, from: meta),
              let data = try? Data(contentsOf: f.data) else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: f.data.path)   // recently used
        return (data, entry)
    }

    private func store(_ key: String, _ data: Data, _ entry: Entry) {
        let f = files(key)
        try? data.write(to: f.data, options: .atomic)
        try? JSONEncoder().encode(entry).write(to: f.meta, options: .atomic)
    }

    func remove(_ key: String) {
        let f = files(key)
        try? FileManager.default.removeItem(at: f.data)
        try? FileManager.default.removeItem(at: f.meta)
    }

    // MARK: Fetch

    enum Policy { case cacheFirst, networkFirst }

    static func policy(method: String, url: URL) -> Policy {
        if method != "GET" { return .networkFirst }
        let ext = url.pathExtension.lowercased()
        // TileJSON (e.g. tiles.openfreemap.org/planet) names the current tile set: keep it fresh.
        return ["pbf", "png", "jpg", "jpeg", "webp", "mvt"].contains(ext) || url.host == "server.arcgisonline.com" ? .cacheFirst : .networkFirst
    }

    /// Fetch through the cache. `completion` runs on an arbitrary queue.
    @discardableResult
    func fetch(_ request: URLRequest, completion: @escaping (Result<(Data, Entry), Error>) -> Void) -> URLSessionDataTask? {
        guard let url = request.url else { completion(.failure(URLError(.badURL))); return nil }
        let method = request.httpMethod ?? "GET"
        let key = Self.key(method: method, url: url.absoluteString, body: method == "POST" ? Self.formValue(request.httpBody) : nil)
        let hit = cached(key)
        if let hit, Self.policy(method: method, url: url) == .cacheFirst { completion(.success(hit)); return nil }
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            let http = response as? HTTPURLResponse
            if let data, let http, (200..<300).contains(http.statusCode) {
                let entry = Entry(status: http.statusCode, mime: http.mimeType ?? "application/octet-stream", savedAt: Date())
                self?.store(key, data, entry)
                completion(.success((data, entry)))
            } else if let hit {
                completion(.success(hit))                         // offline or server trouble: the saved copy
            } else if let data, let http {
                completion(.success((data, Entry(status: http.statusCode, mime: http.mimeType ?? "text/plain", savedAt: Date()))))
            } else {
                completion(.failure(error ?? URLError(.cannotLoadFromNetwork)))
            }
        }
        task.resume()
        return task
    }

    /// Cached size on disk, and an oldest-first trim that never touches files a saved resort needs.
    func trim(keeping pinned: Set<String>) {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]) else { return }
        let bins = items.filter { $0.pathExtension == "bin" }.compactMap { u -> (URL, Int64, Date)? in
            let v = try? u.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            return (u, Int64(v?.fileSize ?? 0), v?.contentModificationDate ?? .distantPast)
        }
        var total = bins.reduce(0) { $0 + $1.1 }
        for (u, size, _) in bins.sorted(by: { $0.2 < $1.2 }) where total > budget {
            let key = u.deletingPathExtension().lastPathComponent
            if pinned.contains(key) { continue }
            remove(key)
            total -= size
        }
    }

    // MARK: WKURLSchemeHandler (skimap-net://host/path → https://host/path)

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let original = task.request.url, var parts = URLComponents(url: original, resolvingAgainstBaseURL: false) else {
            task.didFailWithError(URLError(.badURL)); return
        }
        parts.scheme = "https"
        guard let url = parts.url else { task.didFailWithError(URLError(.badURL)); return }
        var request = URLRequest(url: url)
        request.httpMethod = task.request.httpMethod ?? "GET"
        request.httpBody = task.request.httpBody ?? task.request.httpBodyStream.map(Self.read)
        for (k, v) in task.request.allHTTPHeaderFields ?? [:] where k.lowercased() == "content-type" { request.setValue(v, forHTTPHeaderField: k) }
        if request.httpMethod == "POST" { request.timeoutInterval = 90 }   // Overpass can take a while
        let id = ObjectIdentifier(task)
        pending.insert(id)                    // before fetching: a cache hit answers on the next main-queue turn
        let dataTask = fetch(request) { [weak self] result in
            DispatchQueue.main.async {
                guard let self, self.finish(id) else { return }      // stopped by WebKit meanwhile
                switch result {
                case let .success((data, entry)):
                    let response = HTTPURLResponse(url: original, statusCode: entry.status, httpVersion: "HTTP/1.1", headerFields: [
                        "Content-Type": entry.mime, "Content-Length": String(data.count),
                        "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store",
                    ])!
                    task.didReceive(response)
                    task.didReceive(data)
                    task.didFinish()
                case let .failure(error):
                    task.didFailWithError(error)
                }
            }
        }
        if let dataTask, pending.contains(id) { lock.lock(); running[id] = dataTask; lock.unlock() }
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        lock.lock(); let t = running.removeValue(forKey: id); lock.unlock()
        t?.cancel()
        pending.remove(id)
    }

    /// Tasks WebKit still waits on (main thread only). A task answered after WebKit stopped it would crash.
    private var pending = Set<ObjectIdentifier>()
    private func finish(_ id: ObjectIdentifier) -> Bool {
        lock.lock(); running[id] = nil; lock.unlock()
        return pending.remove(id) != nil
    }

    private static func read(_ stream: InputStream) -> Data {
        stream.open(); defer { stream.close() }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
        return data
    }
}

/// Serves the bundled web map (`Web` folder reference) as `skimap://app/…`. A custom origin, unlike
/// `file://`, lets the page load its JavaScript modules. The CDN links in index.html are pointed at
/// the copies bundled by ios/bundle-web.sh, so nothing depends on a CDN being reachable.
final class AppFiles: NSObject, WKURLSchemeHandler {
    static let scheme = "skimap"
    private let root = Bundle.main.url(forResource: "Web", withExtension: nil)

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let file = root.flatMap { r in task.request.url.map { r.appendingPathComponent($0.path).standardizedFileURL } }
        guard let url = task.request.url, let root, let file, file.path.hasPrefix(root.standardizedFileURL.path),
              var data = try? Data(contentsOf: file) else {
            let url = task.request.url ?? URL(string: "skimap://app/")!
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        if file.lastPathComponent == "index.html", var html = String(data: data, encoding: .utf8) {
            html = html.replacingOccurrences(of: #"https://cdn\.jsdelivr\.net/npm/maplibre-gl@[^/]+/dist/"#, with: "../vendor/", options: .regularExpression)
            html = html.replacingOccurrences(of: #"https://cdn\.jsdelivr\.net/npm/osmtogeojson@[^"]+"#, with: "../vendor/osmtogeojson.mjs", options: .regularExpression)
            data = Data(html.utf8)
        }
        let mime: String = switch file.pathExtension.lowercased() {
        case "html": "text/html"
        case "js", "mjs": "text/javascript"
        case "css": "text/css"
        case "json", "geojson": "application/json"
        case "woff2": "font/woff2"
        case "png": "image/png"
        default: "application/octet-stream"
        }
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                        headerFields: ["Content-Type": mime, "Content-Length": String(data.count)])!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}
