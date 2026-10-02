import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { palette, scale } from "../theme";

/**
 * Factual trust badges only — see /docs/10-TRUST-VERIFICATION.md.
 * Never render an arbitrary numeric "trust score"; only these enumerated,
 * verified facts.
 */
export type VerificationKind =
  | "IDENTITY_VERIFIED"
  | "IDENTITY_CHECKED"
  | "BUSINESS_VERIFIED"
  | "LICENSE_VERIFIED"
  | "CREDENTIALS_CHECKED"
  | "EXTERNAL_REPUTATION_LINKED";

const LABELS_HE: Record<VerificationKind, string> = {
  IDENTITY_VERIFIED: "זהות אומתה",
  IDENTITY_CHECKED: "הזהות נבדקה על ידי PRO NOW",
  BUSINESS_VERIFIED: "עסק אומת",
  LICENSE_VERIFIED: "רישיון מקצועי אומת",
  CREDENTIALS_CHECKED: "תעודות נבדקו",
  EXTERNAL_REPUTATION_LINKED: "מוניטין חיצוני מקושר",
};

export function VerificationBadge({ kind }: { kind: VerificationKind }) {
  return (
    <View style={styles.badge} accessibilityRole="text" accessibilityLabel={LABELS_HE[kind]}>
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.label}>{LABELS_HE[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "rgba(15,164,127,0.12)",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 4,
  },
  checkmark: { color: "#0FA47F", fontWeight: "700" },
  label: { color: palette.trust700, fontSize: scale.meta, fontWeight: "600" },
});
