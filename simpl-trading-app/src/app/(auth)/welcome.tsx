import { useRouter } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.brand}>Simpl</Text>
        <Text style={styles.tagline}>Calm, simple, long-term investing.</Text>
        <Text style={styles.body}>
          Search a stock, buy it, hold it. No charts to chase, no signals, no noise —
          just a straightforward way to invest for the long run.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => router.push("/signup")}>
          <Text style={styles.primaryButtonText}>Sign Up</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/login")}>
          <Text style={styles.secondaryButtonText}>Log In</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", justifyContent: "space-between" },
  content: { padding: 24, paddingTop: 80 },
  brand: { fontSize: 32, fontWeight: "700", color: "#111827" },
  tagline: { fontSize: 20, color: "#111827", marginTop: 16, fontWeight: "600" },
  body: { fontSize: 16, color: "#6b7280", marginTop: 12, lineHeight: 22 },
  actions: { padding: 24, gap: 12 },
  primaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  secondaryButtonText: { color: "#111827", fontSize: 16, fontWeight: "600" },
});
