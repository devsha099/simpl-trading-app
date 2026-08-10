import { Text, View, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { colors } from "../lib/theme";

type Props = TextProps & { style?: StyleProp<TextStyle> };

/**
 * The "hazy" chromatic-ghost effect from the Terminal Amber direction — a
 * soft phosphor-green/amber double-image behind the real text, evoking a
 * slightly misregistered CRT signal. RN's Text only supports a single
 * textShadow, so the multi-color haze is built from two offset ghost copies
 * stacked under the real one, rather than a CSS-style shadow list.
 * Reserved for hero moments (wordmarks, big numbers) — never body text.
 */
export function HazyText({ style, children, ...rest }: Props) {
  return (
    <View>
      <Text
        style={[style, { position: "absolute", left: -2, top: 0, color: colors.phosphor, opacity: 0.55 }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </Text>
      <Text
        style={[style, { position: "absolute", left: 2, top: 1.5, color: colors.amber, opacity: 0.6 }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </Text>
      <Text style={style} {...rest}>
        {children}
      </Text>
    </View>
  );
}
