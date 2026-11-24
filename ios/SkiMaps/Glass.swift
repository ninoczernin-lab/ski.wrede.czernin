import SwiftUI

/// The HUD's physical glass: one language for every floating control (search pill, map-view rail,
/// hour panel, details sheet).
///
/// - iOS 26 and later: Apple's own Liquid Glass (`glassEffect`), the same material as Control Center
///   and Apple Maps' floating controls, with real refraction, specular rim and interactive response.
/// - Earlier iOS: built from system materials, so it still blurs and vibrancy-lifts what's behind:
///   an ultra-thin material, a 0.75 pt rim lit from the top-left (where the sun catches a bevel),
///   an inner top sheen, and a soft two-layer floating shadow.
struct GlassSurface<S: InsettableShape>: ViewModifier {
    let shape: S
    var interactive = true
    @Environment(\.colorScheme) private var scheme

    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            let dark = scheme == .dark
            content
                .background(.ultraThinMaterial, in: shape)
                // Inner sheen: light pooling along the upper edge of the pane.
                .overlay {
                    shape.inset(by: 1)
                        .fill(LinearGradient(colors: [.white.opacity(dark ? 0.10 : 0.30), .white.opacity(0)],
                                             startPoint: .top, endPoint: .center))
                        .allowsHitTesting(false)
                }
                // Specular rim: bright where the light hits (top-left), fading to a soft tint below.
                .overlay {
                    shape.strokeBorder(
                        LinearGradient(stops: [
                            .init(color: .white.opacity(dark ? 0.55 : 0.95), location: 0),
                            .init(color: .white.opacity(dark ? 0.18 : 0.35), location: 0.45),
                            .init(color: .white.opacity(dark ? 0.05 : 0.12), location: 1),
                        ], startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 0.75)
                    .allowsHitTesting(false)
                }
                // Float: a wide soft ambient shadow plus a tight contact shadow, never heavy.
                .shadow(color: .black.opacity(dark ? 0.32 : 0.13), radius: 16, x: 0, y: 8)
                .shadow(color: .black.opacity(dark ? 0.20 : 0.07), radius: 1.5, x: 0, y: 1)
        }
    }
}

extension View {
    /// Float this view on HUD glass.
    func glass<S: InsettableShape>(in shape: S, interactive: Bool = true) -> some View {
        modifier(GlassSurface(shape: shape, interactive: interactive))
    }

    /// Labels on glass: system label colours (vibrant on materials) plus a hairline shadow so icons
    /// stay crisp over both bright snow and a dark night sky.
    func glassLabel() -> some View { modifier(GlassLabel()) }
}

private struct GlassLabel: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content
            .foregroundStyle(.primary)
            .shadow(color: scheme == .dark ? .black.opacity(0.45) : .white.opacity(0.55), radius: 0.6, x: 0, y: 0.5)
    }
}

/// Tactile press: a quick spring scale-down with a subtle brightness pulse and a light haptic.
/// Reduce Motion keeps the brightness feedback and drops the scaling.
struct GlassPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.93 : 1)
            .brightness(configuration.isPressed ? 0.07 : 0)
            .animation(.spring(response: 0.28, dampingFraction: 0.62), value: configuration.isPressed)
            .sensoryFeedback(.impact(weight: .light, intensity: 0.6), trigger: configuration.isPressed) { _, pressed in pressed }
    }
}
