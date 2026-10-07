/**
 * WHAT THE PERSON AT HOME SEES.
 *
 * Amit's headline case: he orders a plumber for his grandfather, or for his
 * wife at home, and handles everything from his own phone — the photos, the
 * quote, the payment. That half existed. The other half did not: the one
 * person who actually opens the door had nothing, and a stranger knocking on
 * an elderly man's door with "your grandson sent me" is precisely the moment
 * this product exists to make safe.
 *
 * So the person at home gets one text message with a link — no app to
 * install, no account — and this page: who is coming, that he was checked,
 * when, and the one thing they have to do, which is ask for the code before
 * opening. Everything else (price, approval, payment) stays with whoever
 * ordered, and the page says so, so nobody at the door is asked for money.
 *
 * Built for a phone held by someone who may not read small print: few
 * words, large type, one instruction at a time.
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { customerTheme, radii, spacing, tabular, tint, type } from "../theme";
import { ProviderPortrait } from "../components/ProviderPortrait";
import { ShieldCheckMark } from "../components/marks";

const colors = customerTheme.colors;

export type OnSiteStage = "coming" | "at_door" | "inside" | "done";

export interface OnSiteBodyProps {
  /** Who ordered — "אמית". */
  ordererNameHe: string;
  /** Who is at home — "סבא יוסף". */
  onSiteNameHe: string;
  serviceNameHe: string;
  proNameHe: string;
  /** The professional asked to be addressed in the feminine (addressAs "F"): תגיע, עברה, ממנה. */
  proFemale?: boolean;
  proPhotoUri?: string | null;
  /** What was checked, in words: "זהות מאומתת", "רישיון אינסטלציה". */
  verifiedHe: string[];
  stage: OnSiteStage;
  /** "14:20", when known. */
  arrivalClockHe?: string | null;
  minutesAway?: number | null;
  /** The code the professional says at the door. */
  codeHe: string | null;
  vehicleHe?: string | null;
  /** The repair's price, by the person who ordered: waiting for them, or approved by them. Never the amount. */
  priceState?: "WAITING" | "APPROVED" | null;
  /**
   * No money moves through the app (docs/21 §5 D1): the person at home pays
   * the professional the approved amount directly. Without it the page
   * says the orderer pays, which only in-app payments make true.
   */
  paidDirectly?: boolean;
  onCallOrderer?: () => void;
  onCallPro?: () => void;
  onHelp?: () => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function OnSiteBody({
  ordererNameHe,
  onSiteNameHe,
  serviceNameHe,
  proNameHe,
  proFemale = false,
  proPhotoUri = null,
  verifiedHe,
  stage,
  arrivalClockHe = null,
  minutesAway = null,
  codeHe,
  vehicleHe = null,
  priceState = null,
  paidDirectly = false,
  onCallOrderer,
  onCallPro,
  onHelp,
  onBack,
  width = 390,
  height = 780,
}: OnSiteBodyProps) {
  const first = onSiteNameHe.split(" ")[0] ?? onSiteNameHe;
  const proFirst = proNameHe.split(" ")[0] ?? proNameHe;
  const g = (male: string, female: string) => (proFemale ? female : male);
  const headline =
    stage === "coming"
      ? `${proFirst} בדרך אליך`
      : stage === "at_door"
        ? `${proFirst} בדלת`
        : stage === "inside"
          ? `${proFirst} אצלך`
          : "העבודה הסתיימה";
  const when =
    stage === "coming"
      ? minutesAway !== null && minutesAway > 0
        ? `${g("יגיע", "תגיע")} בעוד כ־${minutesAway} דקות${arrivalClockHe ? ` · בערך ב־${arrivalClockHe}` : ""}`
        : arrivalClockHe
          ? `${g("יגיע", "תגיע")} בערך ב־${arrivalClockHe}`
          : g("יגיע בקרוב", "תגיע בקרוב")
      : stage === "at_door"
        ? `לפני שפותחים — בקשו ${g("ממנו", "ממנה")} את הקוד`
        : stage === "inside"
          ? priceState === "APPROVED"
            ? `${ordererNameHe} אישר את המחיר — ${proFirst} ${g("מתחיל", "מתחילה")} לעבוד`
            : `${ordererNameHe} רואה הכול ומאשר את המחיר מהטלפון שלו`
          : paidDirectly
            ? `את הסכום ש${ordererNameHe} אישר משלמים ל${proFirst} ישירות.`
            : `${ordererNameHe} אישר ושילם. אין צורך לעשות דבר.`;

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="חזרה" style={styles.back}>
            <Text style={styles.backText}>חזרה ›</Text>
          </Pressable>
        ) : null}

        {/* The message that brought them here, as it arrived. */}
        <View style={styles.sms}>
          <Text style={styles.smsFrom}>PRO NOW · הודעה</Text>
          <Text style={styles.smsText}>
            שלום {first}, {ordererNameHe} הזמין אליך בעל מקצוע דרך PRO NOW ({serviceNameHe}). {proFirst} {g("עבר", "עברה")}
            אימות זהות. התמונה {g("שלו", "שלה")} וקוד לדלת — בקישור.
          </Text>
        </View>

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.when}>{when}</Text>

        <View style={styles.card}>
          <View style={styles.proRow}>
            <ProviderPortrait photoUri={proPhotoUri} displayNameHe={proNameHe} size={72} tone="light" />
            <View style={{ flex: 1 }}>
              <Text style={styles.proName} numberOfLines={1}>{proNameHe}</Text>
              <Text style={styles.proService} numberOfLines={1}>{serviceNameHe}</Text>
              {vehicleHe ? <Text style={styles.proService} numberOfLines={1}>{g("מגיע", "מגיעה")} ב{vehicleHe}</Text> : null}
            </View>
          </View>
          {verifiedHe.map((v) => (
            <View key={v} style={styles.verified}>
              <ShieldCheckMark size={18} color={colors.trust} />
              <Text style={styles.verifiedText}>{v}</Text>
            </View>
          ))}
        </View>

        {stage === "coming" || stage === "at_door" ? (
          <View style={[styles.code, stage === "at_door" && styles.codeNow]}>
            <Text style={styles.codeLabel}>{g("כשהוא בדלת, בקשו ממנו את הקוד:", "כשהיא בדלת, בקשו ממנה את הקוד:")}</Text>
            <Text style={styles.codeDigits} accessibilityLabel={`הקוד ${codeHe ?? ""}`}>
              {codeHe ? codeHe.split("").join(" ") : "הקוד יגיע רגע לפני"}
            </Text>
            <Text style={styles.codeWarn}>{g("אם הוא לא יודע", "אם היא לא יודעת")} את הקוד — אל תפתחו, והתקשרו ל{ordererNameHe}.</Text>
          </View>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.note}>
            {paidDirectly
              ? `לא מתמקחים ולא מאשרים כלום: את המחיר מאשר ${ordererNameHe}. את הסכום שאושר משלמים ל${proFirst} ישירות, כרגיל.`
              : `אין צורך לשלם כלום ולא לאשר כלום. המחיר, האישור והתשלום — אצל ${ordererNameHe}.`}
          </Text>
        </View>

        <Pressable onPress={onCallOrderer} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}>
          <Text style={styles.primaryText}>להתקשר ל{ordererNameHe}</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onCallPro} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
            <Text style={styles.secondaryText}>להתקשר ל{proFirst}</Text>
          </Pressable>
          <Pressable onPress={onHelp} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
            <Text style={styles.secondaryText}>משהו לא בסדר</Text>
          </Pressable>
        </View>
        <Text style={styles.fine}>המספרים מוסתרים — השיחה עוברת דרך PRO NOW.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  back: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center" },
  backText: { ...type.metaStrong, color: colors.actionText, writingDirection: "rtl" },
  sms: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    padding: spacing.md,
    borderRadius: radii.lg,
    borderBottomRightRadius: 4,
    backgroundColor: tint.neutralDark(0.06),
    gap: 4,
  },
  smsFrom: { ...type.microStrong, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  smsText: { ...type.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  headline: { ...type.title, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", marginTop: spacing.sm },
  when: { ...type.bodyStrong, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  proName: { ...type.section, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  proService: { ...type.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  verified: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  verifiedText: { ...type.bodyStrong, color: colors.trust, textAlign: "right", writingDirection: "rtl" },
  code: {
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
  },
  codeNow: { borderColor: colors.action, borderWidth: 2 },
  codeLabel: { ...type.bodyStrong, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  codeDigits: { ...type.displayXL, color: colors.textPrimary, letterSpacing: 6, ...tabular },
  codeWarn: { ...type.meta, color: colors.statusWarningText, textAlign: "center", writingDirection: "rtl" },
  noteBox: { padding: spacing.md, borderRadius: radii.md, backgroundColor: tint.neutralDark(0.04) },
  note: { ...type.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  primary: {
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...type.bodyStrong, color: colors.onAction, writingDirection: "rtl" },
  row: { flexDirection: "row-reverse", gap: spacing.sm },
  secondary: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  fine: { ...type.micro, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
});
