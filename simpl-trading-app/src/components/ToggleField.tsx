import { StyleSheet, Switch, Text, View } from "react-native";

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleField({ label, value, onValueChange }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  label: { flex: 1, fontSize: 15, color: "#111827", marginRight: 12 },
});
