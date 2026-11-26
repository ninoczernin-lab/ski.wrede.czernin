import SwiftUI
import WebKit

/// The map itself: the same MapLibre web map as the website (bundled in the app, see
/// ios/bundle-web.sh), with real 3D terrain, the cartoon look, moving skiers and the hour slider.
/// Network requests go through MapCache, so resorts opened or saved once work offline.
struct WebMapView: UIViewRepresentable {
    /// The resort to show. Changing it flies the map there.
    var resortID: String?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppFiles(), forURLScheme: AppFiles.scheme)
        config.setURLSchemeHandler(MapCache.shared, forURLScheme: MapCache.scheme)
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.isScrollEnabled = false                 // the map handles every gesture itself
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never // the page lays out under the notch itself
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = context.coordinator
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }   // Safari → Develop → this iPhone
        #endif
        var url = URLComponents(string: "skimap://app/preview/index.html")!
        if let resortID { url.queryItems = [URLQueryItem(name: "resort", value: resortID)] }
        context.coordinator.shown = resortID
        web.load(URLRequest(url: url.url!))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        guard let id = resortID, id != context.coordinator.shown else { return }
        context.coordinator.shown = id
        context.coordinator.pick(id, in: web)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var shown: String?
        private var loaded = false
        private var queued: String?

        /// Fly to a resort (waits for the page's map to be ready).
        func pick(_ id: String, in web: WKWebView) {
            guard loaded else { queued = id; return }
            let safe = id.replacingOccurrences(of: "'", with: "")
            web.evaluateJavaScript("(function go(){ if (window.__preview) window.__preview.pickResort('\(safe)'); else setTimeout(go, 200); })()")
        }

        func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true
            if let q = queued { queued = nil; pick(q, in: web) }
        }

        /// Links in the map's attribution open in Safari, never inside the map.
        func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = action.request.url, action.navigationType == .linkActivated, url.scheme == "https" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        /// WebKit can drop a page's process under memory pressure; reload instead of showing a blank map.
        func webViewWebContentProcessDidTerminate(_ web: WKWebView) {
            loaded = false
            web.reload()
        }
    }
}
