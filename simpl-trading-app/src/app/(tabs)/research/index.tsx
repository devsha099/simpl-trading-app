import { SafeAreaView, StyleSheet, Text } from "react-native";
import { SpectrumStripe } from "../../../components/SpectrumStripe";
import { colors, fonts } from "../../../lib/theme";

export default function ResearchScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Research</Text>
      <SpectrumStripe size="sm" style={styles.stripe} />
      <Text style={styles.sub}>Coming soon.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, padding: 24, paddingTop: 32 },
  title: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.paper },
  stripe: { width: 80, marginTop: 14 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: colors.paperDim, marginTop: 16 },
});
