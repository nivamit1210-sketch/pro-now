import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SAFETY_NOTE_MAX, SAFETY_REASON_HE, SAFETY_RECEIVED_HE, SAFETY_REPORT_REASONS, EMERGENCY_POLICE_NUMBER, type SafetyReportReason } from "@pro-now/types";
import { Sheet, customerTheme, palette, radii, scale, spacing, type as t } from "@pro-now/ui";

import { api } from "../api";
import { EMERGENCY_LINE_HE, SAFETY_SENT_BODY_HE, safetyErrorHe, safetyIntroHe } from "./safety";

/**
 * "משהו לא נראה לי תקין" (audit v2 #8b): the demo's safety sheet from the
 * door. First the two choices (share the job's status, when there is a
 * link to share; report a problem with the visit), then the report: what is
 * wrong, a line if they want, sent to a person on the team — a support
 * ticket, an ops alert, a row in the admin. Then only what is true:
 * received, and somebody will come back to them. The police number is on
 * every step.
 */
type Step = "menu" | "report" | "sent";

export function SafetySheet({
  visible,
  onClose,
  jobId,
  onSiteNameHe,
  onShare,
  width,
  height,
}: {
  visible: boolean;
  onClose: () => void;
  jobId: string;
  onSiteNameHe: string | null;
  onShare?: () => void;
  width: number;
  height: number;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);

  // Opened again after a report: a fresh start, not the last one's receipt.
  useEffect(() => {
    if (!visible) return;
    setStep((s) => (s === "sent" ? "menu" : s));
    setErrorHe(null);
  }, [visible]);

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setErrorHe(null);
    try {
      await api.reportSafety(jobId, { reason, note: note.trim() || null });
      setStep("sent");
      setReason(null);
      setNote("");
    } catch (e) {
      setErrorHe(safetyErrorHe(e));
    } finally {
      setBusy(false);
    }
  };

  const share = onSiteNameHe && onShare ? onShare : undefined;
  const titleHe = step === "menu" ? "בטיחות" : step === "report" ? "דיווח על בעיה במהלך הביקור" : SAFETY_RECEIVED_HE;

  return (
    <Sheet visible={visible} onClose={onClose} colors={colors} titleHe={titleHe} width={width} height={height}>
      {step === "menu" ? (
        <View>
          <Text style={styles.body}>{safetyIntroHe(share ? onSiteNameHe : null)}</Text>
          {share ? (
            <Pressable style={styles.primary} accessibilityRole="button" onPress={() => { onClose(); share(); }}>
              <Text style={styles.primaryText}>שיתוף מצב הקריאה</Text>
            </Pressable>
          ) : null}
          <Pressable style={share ? styles.secondary : styles.primary} accessibilityRole="button" onPress={() => setStep("report")}>
            <Text style={share ? styles.secondaryText : styles.primaryText}>דיווח על בעיה במהלך הביקור</Text>
          </Pressable>
          <Emergency />
        </View>
      ) : step === "report" ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="מה לא תקין?">
          <Text style={styles.label}>מה לא תקין?</Text>
          {SAFETY_REPORT_REASONS.map((r) => {
            const on = reason === r;
            return (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={SAFETY_REASON_HE[r]}
                style={[styles.reason, on && styles.reasonOn]}
              >
                <View style={[styles.dot, on && styles.dotOn]} />
                <Text style={styles.reasonText}>{SAFETY_REASON_HE[r]}</Text>
              </Pressable>
            );
          })}
          <Text style={[styles.label, { marginTop: spacing.md }]}>מה קרה? (לא חובה)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            accessibilityLabel="מה קרה? (לא חובה)"
            multiline
            maxLength={SAFETY_NOTE_MAX}
            style={styles.note}
            placeholderTextColor={colors.textSecondary}
          />
          {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
          <Pressable
            style={[styles.primary, (!reason || busy) && styles.disabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !reason || busy }}
            disabled={!reason || busy}
            onPress={() => void send()}
          >
            <Text style={styles.primaryText}>{busy ? "שולחים…" : "שליחת הדיווח"}</Text>
          </Pressable>
          <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => setStep("menu")}>
            <Text style={styles.backText}>חזרה</Text>
          </Pressable>
          <Emergency />
        </View>
      ) : (
        <View>
          <Text style={styles.body}>{SAFETY_SENT_BODY_HE}</Text>
          <Pressable style={styles.primary} accessibilityRole="button" onPress={onClose}>
            <Text style={styles.primaryText}>סגירה</Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

function Emergency() {
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${EMERGENCY_POLICE_NUMBER}`)} style={styles.emergency}>
      <Text style={styles.emergencyText}>{EMERGENCY_LINE_HE}</Text>
    </Pressable>
  );
}

const colors = customerTheme.colors;
// The demo's sheet (tools/design-preview App.tsx `sheetBody`, `sheetPrimary`, `sheetSecondary`).
const styles = StyleSheet.create({
  body: { ...t.body, fontSize: scale.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", lineHeight: 22 },
  primary: { minHeight: 54, borderRadius: radii.md, backgroundColor: colors.action, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  primaryText: { ...t.bodyStrong, fontSize: scale.body, color: colors.onAction, writingDirection: "rtl" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  // berry700, as the arrival screen's own link: berry500 on white is under 4.5:1 for small text.
  secondaryText: { ...t.captionStrong, color: palette.berry700, writingDirection: "rtl" },
  backText: { ...t.captionStrong, color: colors.textSecondary, writingDirection: "rtl" },
  disabled: { opacity: 0.45 },
  label: { ...t.captionStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", marginBottom: spacing.xs },
  reason: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  reasonOn: { borderColor: colors.actionText, backgroundColor: colors.bg },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textSecondary },
  dotOn: { borderColor: colors.actionText, backgroundColor: colors.action },
  reasonText: { ...t.body, color: colors.textPrimary, writingDirection: "rtl", textAlign: "right", flex: 1 },
  note: {
    minHeight: 72,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    textAlignVertical: "top",
  },
  error: { ...t.caption, color: palette.berry700, textAlign: "right", writingDirection: "rtl", marginTop: spacing.sm },
  emergency: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  emergencyText: { ...t.caption, color: colors.textSecondary, writingDirection: "rtl", textDecorationLine: "underline" },
});
