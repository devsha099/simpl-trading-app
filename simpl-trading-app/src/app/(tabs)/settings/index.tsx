import { SafeAreaView, StyleSheet, Text } from "react-native";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>Coming soon.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 32 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827" },
  sub: { fontSize: 15, color: "#6b7280", marginTop: 8 },
});
