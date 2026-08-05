import { ActivityIndicator, SafeAreaView, StyleSheet } from "react-native";

// The root layout's router state machine (CLAUDE.md §4) handles all
// navigation away from here based on auth state — this screen just needs to
// exist so "/" has something to render while that decision resolves.
export default function Index() {
  return (
    <SafeAreaView style={styles.screen}>
      <ActivityIndicator />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#ffffff" },
});
