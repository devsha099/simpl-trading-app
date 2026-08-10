import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleField({ label, value, onValueChange }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.inkRaised2, true: colors.amberDeep }}
        thumbColor={value ? colors.amber : colors.paperDim}
        ios_backgroundColor={colors.inkRaised2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.inkLine,
  },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.paper, marginRight: 12 },
});
