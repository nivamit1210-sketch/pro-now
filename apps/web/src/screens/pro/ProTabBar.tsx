import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigate } from "react-router";
import { NavGlyph, proTheme, type as t } from "@pro-now/ui";

import { PRO_TABS, type ProPage } from "./proPages";

export const PRO_TAB_BAR_H = 64;

/**
 * The professional's four tabs, as in the demo: plain Hebrew, a different
 * mark per tab. Pricing opens from the shift tab, so on it the shift tab
 * stays lit. A tab replaces the page in history rather than stacking it,
 * so back leaves the professional's side instead of cycling through tabs.
 */
export function ProTabBar({ page, width }: { page: ProPage; width: number }) {
  const navigate = useNavigate();
  const active = page === "pricing" ? "shift" : page;
  return (
    <View style={[styles.bar, { width }]} accessibilityRole="tablist">
      {PRO_TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? colors.actionText : colors.textSecondary;
        return (
          <Pressable
            key={tab.key}
            onPress={() => (on && page !== "pricing" ? undefined : navigate(tab.path, { replace: true }))}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.labelHe}
            style={styles.item}
          >
            <NavGlyph name={tab.mark} size={22} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.labelHe}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const colors = proTheme.colors;
const styles = StyleSheet.create({
  bar: {
    height: PRO_TAB_BAR_H,
    flexDirection: "row-reverse",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 44 },
  label: { ...t.micro, fontWeight: "700" },
});
