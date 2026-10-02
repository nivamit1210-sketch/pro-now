import { StyleSheet, Text, TextInput, View } from "react-native";
import { customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { VEHICLE_TEXT_MAX, vehicleProblemsHe, type VehicleDraft } from "./vehicle";

/**
 * The two optional questions about the car (audit v2 #8a), the same in the
 * join's details step and on the profile tab: what the customer looks for
 * at the door, as in the demo's arrival screen ("מגיע ב… · ••• 47").
 */
export function VehicleFields({ draft, onChange }: { draft: VehicleDraft; onChange: (d: VehicleDraft) => void }) {
  const problems = vehicleProblemsHe(draft);
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>הרכב שלכם (לא חובה)</Text>
        <TextInput
          value={draft.vehicleHe}
          onChangeText={(vehicleHe) => onChange({ ...draft, vehicleHe })}
          accessibilityLabel="הרכב שלכם"
          placeholder="למשל: יונדאי i20 לבנה"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          maxLength={VEHICLE_TEXT_MAX}
        />
        {problems.vehicleHe ? <Text accessibilityRole="alert" style={styles.error}>{problems.vehicleHe}</Text> : null}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>הספרות האחרונות של מספר הרכב (לא חובה)</Text>
        <TextInput
          value={draft.plateTail}
          onChangeText={(plateTail) => onChange({ ...draft, plateTail })}
          accessibilityLabel="הספרות האחרונות של מספר הרכב"
          placeholder="2 או 3 ספרות, למשל 47"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, styles.tail]}
          inputMode="numeric"
        />
        {problems.plateTail ? (
          <Text accessibilityRole="alert" style={styles.error}>{problems.plateTail}</Text>
        ) : (
          <Text style={styles.note}>הלקוח רואה את הרכב רק אחרי שקיבלתם את הקריאה, כדי לזהות אתכם בדלת. את המספר המלא לא שומרים.</Text>
        )}
      </View>
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  label: { ...t.metaStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  note: { ...t.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  error: { ...t.meta, color: colors.statusDanger, textAlign: "right", writingDirection: "rtl" },
  input: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  tail: { width: 140, alignSelf: "flex-end", textAlign: "center", letterSpacing: 2 },
});
