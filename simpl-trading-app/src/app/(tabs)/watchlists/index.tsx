import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useWatchlists } from "../../../hooks/useWatchlists";

export default function WatchlistsHomeScreen() {
  const router = useRouter();
  const { watchlists, loading, createWatchlist } = useWatchlists();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");

  const closeModal = () => {
    setModalVisible(false);
    setName("");
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createWatchlist(name);
    closeModal();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable style={styles.newButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.newButtonText}>+ New Watchlist</Text>
      </Pressable>

      <FlatList
        data={watchlists}
        keyExtractor={(w) => w.id}
        ListEmptyComponent={
          <Text style={styles.empty}>Make a watchlist to get started.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              // Collapsed form, no "/index" suffix — a URL literally ending
              // in "/index" resolves against the sibling [symbol] dynamic
              // route instead of this index screen (shipped as a real bug
              // once). See CLAUDE.md's typed-routes gotcha for the story.
              router.push({
                pathname: "/watchlists/[watchlistId]",
                params: { watchlistId: item.id },
              })
            }
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>
              {item.symbols.length} {item.symbols.length === 1 ? "ticker" : "tickers"}
            </Text>
          </Pressable>
        )}
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Name your watchlist</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Tech stocks"
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={closeModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalCreate} onPress={handleCreate}>
                <Text style={styles.modalCreateText}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  center: { justifyContent: "center", alignItems: "center" },
  newButton: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  newButtonText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  name: { fontSize: 17, fontWeight: "600", color: "#111827" },
  count: { fontSize: 14, color: "#9ca3af" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 12 },
  modalInput: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    color: "#111827",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { color: "#6b7280", fontWeight: "600", fontSize: 15 },
  modalCreate: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  modalCreateText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
