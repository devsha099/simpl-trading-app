import { useRouter } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { HazyText } from "../../components/HazyText";
import { SpectrumMark, SpectrumStripe } from "../../components/SpectrumStripe";
import { colors, fonts, spacing } from "../../lib/theme";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <SpectrumMark size={30} />
        <HazyText style={styles.brand}>
          simpl<Text style={styles.brandAccent}>trading</Text>
        </HazyText>
        <Text style={styles.tagline}>Calm, simple, long-term investing.</Text>
        <Text style={styles.body}>
          Search a stock, buy it, hold it. No charts to chase, no signals, no noise —
          just a straightforward way to invest for the long run.
        </Text>
      </View>

      <View style={styles.actions}>
        <SpectrumStripe size="sm" style={styles.stripe} />
        <Pressable style={styles.primaryButton} onPress={() => router.push("/signup")}>
          <Text style={styles.primaryButtonText}>Sign Up</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/login")}>
          <Text style={styles.secondaryButtonText}>Log In</Text>
        </Pressable>
        <Text style={styles.finprint}>SELF-DIRECTED · BROKERAGE SERVICES BY ALPACA · MEMBER FINRA/SIPC</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, justifyContent: "space-between" },
  content: { padding: spacing.xl, paddingTop: 88 },
  brand: {
    fontFamily: fonts.displayBold,
    fontSize: 36,
    color: colors.paper,
    marginTop: 18,
    letterSpacing: -0.5,
  },
  brandAccent: { color: colors.amber },
  tagline: { fontFamily: fonts.bodySemiBold, fontSize: 19, color: colors.paper, marginTop: 16 },
  body: { fontFamily: fonts.body, fontSize: 15.5, color: colors.paperDim, marginTop: 12, lineHeight: 23 },
  actions: { padding: spacing.xl, gap: 12 },
  stripe: { marginBottom: 8 },
  primaryButton: {
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: colors.amber,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, color: colors.buttonInk, fontSize: 16 },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.amberDeep,
  },
  secondaryButtonText: { fontFamily: fonts.bodySemiBold, color: colors.paper, fontSize: 16 },
  finprint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.paperDim,
    textAlign: "center",
    marginTop: 8,
    opacity: 0.8,
  },
});
