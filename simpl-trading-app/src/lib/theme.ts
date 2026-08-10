/**
 * "Terminal Amber" — the app's single visual identity (see CLAUDE.md).
 * Dark, phosphor-glow ground inspired by the amber ticker terminals that ran
 * the first stock quote feeds, not a generic dark-mode toggle — there is no
 * light variant. Every screen pulls colors/fonts/spacing from here so the
 * look stays one system instead of drifting screen to screen.
 */

export const colors = {
  ink: "#15120c",
  inkRaised: "#221c14",
  inkRaised2: "#2b2318",
  inkLine: "#3c3423",
  paper: "#f5efe0",
  paperDim: "#b9ae95",
  amber: "#e2a23c",
  amberSoft: "#ecb35a",
  amberDeep: "#a5701f",
  amberGlow: "rgba(226,162,60,0.4)",
  amberGlowStrong: "rgba(226,162,60,0.6)",
  phosphor: "#63c191",
  rust: "#c96b4c",
  buttonInk: "#241505",
};

// The stacked spectrum-stripe motif — a deliberate, curated band (not a
// random rainbow): brand amber and the two semantic data colors anchor each
// end, bridged by a few warm-to-cool stops in between.
export const spectrum = ["#c96b4c", "#e2a23c", "#e7c46a", "#63c191", "#4f9ea8", "#5b7fa6", "#8a6fb0", "#b0587f"];

export const fonts = {
  display: "ZillaSlab-SemiBold",
  displayBold: "ZillaSlab-Bold",
  displayItalic: "ZillaSlab-MediumItalic",
  displayRegular: "ZillaSlab-Regular",
  body: "IBMPlexSans-Regular",
  bodySemiBold: "IBMPlexSans-SemiBold",
  mono: "IBMPlexMono-Regular",
  monoMedium: "IBMPlexMono-Medium",
  monoSemiBold: "IBMPlexMono-SemiBold",
};

export const fontAssets = {
  "ZillaSlab-Regular": require("../../assets/fonts/ZillaSlab-Regular.ttf"),
  "ZillaSlab-SemiBold": require("../../assets/fonts/ZillaSlab-SemiBold.ttf"),
  "ZillaSlab-Bold": require("../../assets/fonts/ZillaSlab-Bold.ttf"),
  "ZillaSlab-MediumItalic": require("../../assets/fonts/ZillaSlab-MediumItalic.ttf"),
  "IBMPlexSans-Regular": require("../../assets/fonts/IBMPlexSans-Regular.ttf"),
  "IBMPlexSans-SemiBold": require("../../assets/fonts/IBMPlexSans-SemiBold.ttf"),
  "IBMPlexMono-Regular": require("../../assets/fonts/IBMPlexMono-Regular.ttf"),
  "IBMPlexMono-Medium": require("../../assets/fonts/IBMPlexMono-Medium.ttf"),
  "IBMPlexMono-SemiBold": require("../../assets/fonts/IBMPlexMono-SemiBold.ttf"),
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// A single-shadow RN approximation of the amber glow, for spots where the
// full multi-layer <HazyText> would be overkill (small labels, icons).
export const glow = {
  textShadowColor: colors.amberGlow,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 16,
};

export const labelCaps = {
  fontFamily: fonts.mono,
  fontSize: 10.5,
  letterSpacing: 1.2,
  textTransform: "uppercase" as const,
  color: colors.paperDim,
};
