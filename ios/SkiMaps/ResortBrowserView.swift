import SwiftUI
import CoreLocation

/// The map screen: the resort as a living miniature at a chosen hour. Opens on the resort you're in
/// (or the nearest within 40 km); search swaps resort with a cinematic fly-in.
/// Native conventions: system materials, SF Symbols, Dynamic Type, 44 pt targets, a real Slider.
struct ResortBrowserView: View {
    @StateObject private var offline = OfflineResortStore()
    @StateObject private var locator = Locator()
    @State private var resort: Resort?
    @State private var query = ""
    @State private var showPicker = false
    @State private var selected: [String: Any]?
    @State private var is3D = true
    @State private var hour = 15.5

    private var daylight: Daylight { Daylight(hour: hour, southern: (resort?.camera.lat ?? 47) < 0) }

    var body: some View {
        ZStack(alignment: .top) {
            ResortMapView(resort: resort, is3D: is3D, hour: hour, selectedFeature: $selected)
                .ignoresSafeArea()

            // Sky wash behind the title, in the hour's own zenith colour, so the type stays legible.
            LinearGradient(colors: [Color(daylight.zenith).opacity(0.55), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 200)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)

            HStack(alignment: .top) {
                if let r = resort { titleBlock(r) }
                Spacer(minLength: 12)
                searchButton
            }
            .padding(.horizontal, 16).padding(.top, 8)
        }
        .overlay(alignment: .trailing) { viewControls }
        .overlay(alignment: .bottom) {
            VStack(spacing: 10) {
                if let f = selected { featureCard(f).transition(.move(edge: .bottom).combined(with: .opacity)) }
                hourPanel
            }
            .padding(.horizontal, 16).padding(.bottom, 8)
            .animation(.snappy, value: selected == nil)
        }
        // After dusk the materials and type switch to their dark appearance.
        .environment(\.colorScheme, daylight.isDark ? .dark : .light)
        .sheet(isPresented: $showPicker) { picker.presentationDetents([.medium, .large]) }
        .onReceive(locator.$coordinate.compactMap { $0 }) { c in
            if resort == nil { select(ResortCatalog.nearest(to: c) ?? ResortCatalog.all.first) }
        }
        .task {
            locator.start()
            try? await Task.sleep(for: .seconds(3))
            if resort == nil { showPicker = true }  // no fix / not near a resort: ask
        }
    }

    private func select(_ r: Resort?) {
        guard let r else { return }
        resort = r
        selected = nil
        // Start at the resort's own local time when it's daylight there; otherwise mid-afternoon.
        let now = Date(), cal = Calendar(identifier: .gregorian)
        let utc = cal.dateComponents(in: TimeZone(identifier: "UTC")!, from: now)
        let local = (Double(utc.hour ?? 12) + Double(utc.minute ?? 0) / 60 + r.camera.lon / 15)
            .truncatingRemainder(dividingBy: 24)
        let h = local < 0 ? local + 24 : local
        hour = (7.5...19).contains(h) ? h : 15.5
    }

    // MARK: Title

    private func titleBlock(_ r: Resort) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(r.name)
                .font(.largeTitle.weight(.light))
                .lineLimit(2).minimumScaleFactor(0.7)
            Text([Locale.current.localizedString(forRegionCode: r.country) ?? r.country, tierLabel(r.tier)]
                .compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
            legend(r).padding(.top, 6)
        }
        .accessibilityElement(children: .combine)
    }

    private func tierLabel(_ tier: Int?) -> String? {
        switch tier {
        case 1: "Over 2 M skier visits"
        case 2: "1–2 M skier visits"
        case 3: "0.5–1 M skier visits"
        default: nil
        }
    }

    /// Run colours in this region's words, from the same palette as the map (PisteStyle.swift).
    private func legend(_ r: Resort) -> some View {
        let region = RunRegion.of(r.country)
        return FlowRow(spacing: 12) {
            ForEach(PisteDifficulty.legend(for: r.country)) { e in
                HStack(spacing: 6) {
                    Capsule().fill(Color(e.difficulty.color(in: region))).frame(width: 18, height: 6)
                        .overlay(Capsule().stroke(.white, lineWidth: 1.5))
                    Text(e.label)
                }
            }
        }
        .font(.caption.weight(.medium)).foregroundStyle(.secondary)
    }

    // MARK: Controls

    private var searchButton: some View {
        Button { showPicker = true } label: {
            Image(systemName: "magnifyingglass").font(.body.weight(.semibold))
                .frame(width: 48, height: 48)
                .background(.regularMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search ski resorts")
    }

    private var viewControls: some View {
        Button { withAnimation(.snappy) { is3D.toggle() } } label: {
            Text(is3D ? "2D" : "3D").font(.subheadline.weight(.semibold)).frame(width: 48, height: 48)
                .background(.regularMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .padding(.trailing, 16)
        .accessibilityLabel(is3D ? "Switch to flat 2D map" : "Switch to 3D map")
    }

    /// The hour: drag to relight sun, sky and shadows across the mountain.
    private var hourPanel: some View {
        HStack(spacing: 12) {
            Image(systemName: daylight.altitude > 0 ? (daylight.hour < 12 ? "sunrise.fill" : "sun.max.fill") : "moon.stars.fill")
                .symbolRenderingMode(.multicolor)
                .font(.title3)
                .frame(width: 28)
                .contentTransition(.symbolEffect(.replace))
            Slider(value: $hour, in: Daylight.range)
                .tint(Color(daylight.horizon.mixed(with: .orange, 0.35)))
                .accessibilityLabel("Time of day")
                .accessibilityValue("\(daylight.clock), \(daylight.part)")
            VStack(alignment: .trailing, spacing: 0) {
                Text(daylight.clock).font(.subheadline.weight(.semibold)).monospacedDigit()
                Text(daylight.part).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(minWidth: 76, alignment: .trailing)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    // MARK: Search

    private var picker: some View {
        NavigationStack {
            List(ResortCatalog.all.filter { $0.matches(query) }) { r in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.name).font(.headline)
                        Text([Locale.current.localizedString(forRegionCode: r.country) ?? r.country, tierLabel(r.tier)]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    offlineButton(r)
                }
                .contentShape(Rectangle())
                .onTapGesture { select(r); showPicker = false }
            }
            .searchable(text: $query, prompt: "Resort, village or country")
            .navigationTitle("Ski resorts")
        }
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

    // MARK: Details

    private func featureCard(_ p: [String: Any]) -> some View {
        let name = (p["name"] as? String) ?? (p["ref"] as? String) ?? "Unnamed"
        let difficulty = (p["piste:difficulty"] as? String).flatMap(PisteDifficulty.init(rawValue:))
        let country = resort?.country ?? ""
        let detail = difficulty.map { $0.label(for: country) } ?? (p["aerialway"] as? String)?.replacingOccurrences(of: "_", with: " ").capitalized ?? ""
        let dot = difficulty.map { Color($0.color(in: RunRegion.of(country))) } ?? Color(UIColor(hex: 0xD8352F))
        return HStack(spacing: 14) {
            Circle().fill(dot).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 2.5))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.headline).lineLimit(1)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Button { selected = nil } label: {
                Image(systemName: "xmark").font(.body.weight(.semibold)).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close details")
        }
        .padding(.leading, 18).padding(.vertical, 6).padding(.trailing, 6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Wraps its children onto new lines, like the legend on the web map.
struct FlowRow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxW { x = 0; y += rowH + spacing / 2; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height); widest = max(widest, x - spacing)
        }
        return CGSize(width: widest, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowH + spacing / 2; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += s.width + spacing; rowH = max(rowH, s.height)
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
