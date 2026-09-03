import { SafeAreaView, StyleSheet, Text } from "react-native";
import { SpectrumStripe } from "../../../components/SpectrumStripe";
import { colors, fonts } from "../../../lib/theme";

// Formerly "Research" (renamed 2026-09-02): stock financials/fundamentals
// are moving onto the stock's own page instead, freeing this tab for its
// own purpose — short financial-education videos, uploaded later.
// Placeholder until that video content exists, same pattern the old
// Research tab used.
export default function EducationScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Education</Text>
      <SpectrumStripe size="sm" style={styles.stripe} />
      <Text style={styles.sub}>Video lessons on investing fundamentals are coming soon.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, padding: 24, paddingTop: 32 },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.paper },
  stripe: { width: 80, marginTop: 14 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim, marginTop: 16 },
});
