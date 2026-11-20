import SwiftUI
import CoreLocation

/// Single map screen. Opens on the resort you're in (or nearest within 40 km); search swaps resort.
struct ResortBrowserView: View {
    @StateObject private var offline = OfflineResortStore()
    @StateObject private var locator = Locator()
    @State private var resort: Resort?
    @State private var query = ""
    @State private var showPicker = false
    @State private var selected: [String: Any]?
    @State private var is3D = true
    @State private var lightPreset = "day"

    var body: some View {
        ZStack(alignment: .top) {
            ResortMapView(resort: resort, is3D: is3D, lightPreset: lightPreset, selectedFeature: $selected)
                .ignoresSafeArea()

            Button { showPicker = true } label: {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text(resort?.name ?? "Search ski resorts").lineLimit(1)
                    Spacer()
                    if let r = resort { offlineBadge(r) }
                }
                .padding(.horizontal, 16).frame(height: 48)
                .background(.regularMaterial, in: Capsule())
            }
            .buttonStyle(.plain).padding(.horizontal, 16).padding(.top, 8)
        }
        .overlay(alignment: .trailing) { mapControls }
        .overlay(alignment: .bottomLeading) { if let r = resort, selected == nil { legend(r) } }
        .overlay(alignment: .bottom) { if let f = selected { featureCard(f) } }
        .sheet(isPresented: $showPicker) { picker.presentationDetents([.medium, .large]) }
        .onReceive(locator.$coordinate.compactMap { $0 }) { c in
            if resort == nil { resort = ResortCatalog.nearest(to: c) ?? ResortCatalog.all.first }
        }
        .task {
            locator.start()
            try? await Task.sleep(for: .seconds(3))
            if resort == nil { showPicker = true }  // no fix / not near a resort: ask
        }
    }

    /// Right-edge buttons, thumb-reachable on iPhone.
    private var mapControls: some View {
        VStack(spacing: 0) {
            Button { withAnimation { is3D.toggle() } } label: {
                Text(is3D ? "2D" : "3D").font(.headline).frame(width: 48, height: 48)
            }
            .accessibilityLabel(is3D ? "Switch to flat 2D map" : "Switch to 3D map")
            Divider().frame(width: 32)
            Menu {
                Picker("Light", selection: $lightPreset) {
                    Label("Dawn", systemImage: "sunrise").tag("dawn")
                    Label("Day", systemImage: "sun.max").tag("day")
                    Label("Dusk", systemImage: "sunset").tag("dusk")
                    Label("Night", systemImage: "moon.stars").tag("night")
                }
            } label: {
                Image(systemName: "sun.max").font(.title3).frame(width: 48, height: 48)
            }
            .accessibilityLabel("Map lighting")
        }
        .buttonStyle(.plain)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.trailing, 12)
    }

    private var picker: some View {
        NavigationStack {
            List(ResortCatalog.all.filter { $0.matches(query) }) { r in
                HStack {
                    VStack(alignment: .leading) {
                        Text(r.name).font(.headline)
                        Text(r.villages.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    offlineButton(r)
                }
                .contentShape(Rectangle())
                .onTapGesture { resort = r; selected = nil; showPicker = false }
            }
            .searchable(text: $query, prompt: "Resort or village")
            .navigationTitle("Ski resorts")
        }
    }

    @ViewBuilder private func offlineBadge(_ r: Resort) -> some View {
        if offline.state(for: r) == .ready { Image(systemName: "checkmark.icloud").foregroundStyle(.green) }
    }

    @ViewBuilder private func offlineButton(_ r: Resort) -> some View {
        switch offline.state(for: r) {
        case .notDownloaded, .failed:
            Button { offline.download(r) } label: { Image(systemName: "arrow.down.circle").font(.title2) }
                .buttonStyle(.borderless).accessibilityLabel("Download \(r.name) for offline use")
        case let .downloading(p):
            Button { offline.cancel(r) } label: { ProgressView(value: p).progressViewStyle(.circular) }
                .buttonStyle(.borderless)
        case .ready:
            Menu {
                Button("Remove offline map", role: .destructive) { offline.delete(r) }
            } label: { Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(.green) }
        }
    }

    /// Colour key for the current resort, using the same colours as the map (PisteStyle.swift).
    private func legend(_ r: Resort) -> some View {
        HStack(spacing: 10) {
            ForEach(PisteDifficulty.legend(for: r.country)) { d in
                HStack(spacing: 4) {
                    Capsule().fill(Color(d.color)).frame(width: 16, height: 5)
                        .overlay(Capsule().stroke(.white, lineWidth: 1))
                    Text(d.label).font(.caption2.weight(.medium))
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(.regularMaterial, in: Capsule())
        .padding(.leading, 12).padding(.bottom, 28)
        .accessibilityElement(children: .combine)
    }

    private func featureCard(_ p: [String: Any]) -> some View {
        let name = (p["name"] as? String) ?? (p["ref"] as? String) ?? "Unnamed"
        let detail = (p["piste:difficulty"] as? String).flatMap { PisteDifficulty(rawValue: $0)?.label }
            ?? (p["aerialway"] as? String)?.capitalized ?? ""
        return HStack {
            VStack(alignment: .leading) {
                Text(name).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Button { selected = nil } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain)
        }
        .padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)).padding()
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
