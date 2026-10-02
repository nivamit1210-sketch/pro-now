import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { customerTheme, radii, scale, spacing, tint } from "../theme";
import { PinMark } from "./marks";

const colors = customerTheme.colors;

/*
 * WHERE THIS ORDER GOES, SAID WHILE ORDERING (Dvir, 2026-10-02: "מהרגע
 * שאני מתחיל את התהליך לא כתוב לי בשום מקום בכתובת שאני עושה אליה את
 * ההזמנה, וגם אין לי אפשרות לשנות"). One line on the service and describe
 * screens: the address — and whose door, when it is for someone else — and
 * "שינוי", which opens the address picker and comes back here.
 */
export function AddressLine({
  addressHe,
  forHe = null,
  onChange,
}: {
  /** null: no address yet — the line asks for one. */
  addressHe: string | null;
  forHe?: string | null;
  onChange?: () => void;
}) {
  const label = addressHe ? `${addressHe}${forHe ? ` · עבור ${forHe}` : ""}` : "עוד לא נבחרה כתובת";
  return (
    <Pressable
      onPress={onChange}
      disabled={!onChange}
      accessibilityRole="button"
      accessibilityLabel={addressHe ? `ההזמנה לכתובת: ${label}. שינוי כתובת` : "בחירת כתובת להזמנה"}
      style={({ pressed }) => [styles.row, !addressHe && styles.rowMissing, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.pin}>
        <PinMark size={15} color={colors.action} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.kicker}>לאן</Text>
        <Text style={styles.addr} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {onChange ? <Text style={styles.change}>{addressHe ? "שינוי" : "בחירה"}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: tint.action(0.06),
    borderWidth: 1,
    borderColor: tint.action(0.2),
    marginTop: spacing.md,
  },
  rowMissing: { borderColor: colors.action, borderStyle: "dashed" },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: tint.action(0.12) },
  kicker: { color: colors.textSecondary, fontSize: scale.micro, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  addr: { color: colors.textPrimary, fontSize: scale.meta, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  change: { color: colors.actionText, fontSize: scale.meta, fontWeight: "800", paddingHorizontal: spacing.sm },
});
