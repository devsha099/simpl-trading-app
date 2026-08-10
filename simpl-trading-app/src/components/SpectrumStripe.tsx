import { View, type StyleProp, type ViewStyle } from "react-native";
import { spectrum } from "../lib/theme";

/**
 * The stacked color-bar motif from the Terminal Amber direction — used
 * strategically as a section punctuation mark (never as running wallpaper).
 */
export function SpectrumStripe({ size = "md", style }: { size?: "sm" | "md"; style?: StyleProp<ViewStyle> }) {
  const barHeight = size === "sm" ? 1.5 : 3;
  return (
    <View style={[{ borderRadius: size === "sm" ? 2 : 4, overflow: "hidden" }, style]}>
      {spectrum.map((c) => (
        <View key={c} style={{ height: barHeight, backgroundColor: c }} />
      ))}
    </View>
  );
}

/** The small square lockup mark used beside the wordmark. */
export function SpectrumMark({ size = 26 }: { size?: number }) {
  const barHeight = size / spectrum.length;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, overflow: "hidden" }}>
      {spectrum.map((c) => (
        <View key={c} style={{ height: barHeight, backgroundColor: c }} />
      ))}
    </View>
  );
}
