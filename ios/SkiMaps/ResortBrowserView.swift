import SwiftUI
import CoreLocation

/// The map screen. The map, its title, legend, hour slider, compass and 2D/3D and look buttons are the
/// web map (WebMapView), identical to the website. The app adds a native resort search with offline
/// saving, and opens on the resort you're in (or the nearest within 40 km).
struct ResortBrowserView: View {
    @StateObject private var offline = OfflineResortStore()
    @StateObject private var locator = Locator()
    @State private var resortID: String?
    @State private var query = ""
    @State private var showPicker = false
    @State private var started = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if started {
                WebMapView(resortID: resortID).ignoresSafeArea()
            } else {
                Color(.systemBackground).ignoresSafeArea()
            }
            // Same place and size as the web map's own search button, which the page hides in the app.
            searchButton.padding(.trailing, 16).padding(.top, 10)
        }
        .sheet(isPresented: $showPicker) {
            picker
                .presentationDetents([.medium, .large])
                // Swiping the list scrolls it, instead of first resizing the sheet.
                .presentationContentInteraction(.scrolls)
                .presentationBackground(.thinMaterial)
                .presentationCornerRadius(28)
        }
        .onReceive(locator.$coordinate.compactMap { $0 }) { c in
            if !started { resortID = ResortCatalog.nearest(to: c)?.id; started = true }
        }
        .task {
            locator.start()
            // No location (denied, indoors, no resort near): open on the first resort after a moment.
            try? await Task.sleep(for: .seconds(2.5))
            if !started { started = true }
        }
    }

    // MARK: Search

    private var searchButton: some View {
        Button { showPicker = true } label: {
            Image(systemName: "magnifyingglass")
                .font(.body.weight(.semibold))
                .glassLabel()
                .frame(width: 48, height: 48)
                .glass(in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(GlassPressStyle())
        .accessibilityLabel("Search ski resorts")
    }

    private var picker: some View {
        NavigationStack {
            List(ResortCatalog.all.filter { $0.matches(query) }) { r in
                HStack {
                    // A real button: VoiceOver reads it as one, and the row highlights on press.
                    Button { resortID = r.id; started = true; showPicker = false } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.name).font(.headline)
                            Text(Locale.current.localizedString(forRegionCode: r.country) ?? r.country)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    offlineButton(r)
                }
            }
            .searchable(text: $query, prompt: "Resort, village or country")
            .navigationTitle("Ski resorts")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showPicker = false } }
            }
        }
    }

    @ViewBuilder private func offlineButton(_ r: Resort) -> some View {
        switch offline.state(for: r) {
        case .notDownloaded:
            Button { offline.download(r) } label: { Image(systemName: "arrow.down.circle").font(.title2) }
                .buttonStyle(.borderless).accessibilityLabel("Save \(r.name) for offline use")
        case .failed:
            Button { offline.download(r) } label: { Image(systemName: "exclamationmark.arrow.circlepath").font(.title2).foregroundStyle(.orange) }
                .buttonStyle(.borderless).accessibilityLabel("Saving \(r.name) failed. Try again")
        case let .downloading(p):
            Button { offline.cancel(r) } label: { ProgressView(value: p).progressViewStyle(.circular) }
                .buttonStyle(.borderless).accessibilityLabel("Saving \(r.name), \(Int(p * 100)) percent. Cancel")
        case .ready:
            Menu {
                Button("Remove offline copy", role: .destructive) { offline.delete(r) }
            } label: { Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(.green) }
                .accessibilityLabel("\(r.name) is saved for offline use")
        }
    }
}

final class Locator: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate: CLLocationCoordinate2D?
    private let manager = CLLocationManager()
    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }
    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        coordinate = locs.last?.coordinate
        m.stopUpdatingLocation()
    }
}
