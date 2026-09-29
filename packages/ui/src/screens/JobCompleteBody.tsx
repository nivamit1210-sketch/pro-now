import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { formatMoney, money } from "@pro-now/types";

import { BackButton } from "../components/BackButton";
import { customerDarkTheme, elevation, radii, scale, spacing, tabular, tint, type } from "../theme";
import { Mark, type MarkName, StarMark } from "../components/marks";
import { RingedAvatar, SectionHeader, Surface } from "../components/surfaces";

/**
 * C13 — after the work is done: what was charged, and the one review the
 * customer is entitled to leave.
 *
 * Receipt and review share a screen because they are the same moment, but
 * they obey different rules:
 *
 * - The receipt is a **record**, not a summary. Every charged line comes
 *   from the server's ledger; the client adds nothing and re-computes
 *   nothing. If a payout split is not final yet, it says so instead of
 *   showing a provisional number as final (/CLAUDE.md §3).
 * - The review is **earned, not solicited**. It is reachable only because
 *   this job actually completed, which is what makes the resulting rating
 *   a fact rather than marketing. Submitting is optional, and the screen
 *   never blocks on it — a rating extracted under a modal is not a rating.
 *
 * Nothing here is pre-filled: no default star count, no suggested text.
 */

const colors = customerDarkTheme.colors;

export interface ReceiptLine {
  id: string;
  labelHe: string;
  amountMinorUnits: number;
  /** Rendered muted, for discounts and credits. */
  negative?: boolean;
}

export interface JobCompleteBodyProps {
  serviceNameHe: string;
  /** "הביקור הסתיים" for a visit-only job; the work is settled directly. */
  titleHe?: string;
  mark: MarkName;
  professionalDisplayName: string;
  professionalPhotoUrl?: string | null;
  /** "היום, 14:20 · 55 דקות" — assembled by the caller from job events. */
  whenHe: string;
  receiptLines: ReceiptLine[];
  totalChargedMinorUnits: number;
  /**
   * WHETHER THE MONEY ACTUALLY MOVED.
   *
   * This screen said "חויב ₪300 · ✓ התשלום עבר בהצלחה" from the day it was
   * written, in an app with no payment provider at all — choosing one is
   * still an open business decision (/CLAUDE.md §4), so there was nothing
   * behind the tick. Telling somebody their card was charged when it was
   * not is the worst thing in this product to be wrong about: they stop
   * watching for the charge, and they are the only person who would have
   * noticed it never arrived.
   *
   * So the number is labelled for what is true. Captured says "חויב";
   * anything else says "לתשלום" — the amount is real either way, because
   * it is the quote the customer approved, and only the tense is in
   * question.
   *
   * Default false, deliberately: a caller who forgets this understates
   * rather than overstates, and understating is recoverable.
   */
  paymentCaptured?: boolean;
  /** Last 4 digits only. The client never holds a full instrument. */
  paymentMethodLabelHe: string | null;
  /** Set once a review exists for this job — the form is then closed. */
  existingRating?: number | null;
  onSubmitReview?: (rating: number, text: string) => void;
  onDownloadInvoice?: () => void;
  /** Back to the app. The review can still be left later. */
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function JobCompleteBody({
  serviceNameHe,
  mark,
  professionalDisplayName,
  professionalPhotoUrl = null,
  whenHe,
  receiptLines,
  totalChargedMinorUnits,
  paymentCaptured = false,
  paymentMethodLabelHe,
  existingRating = null,
  onSubmitReview,
  onDownloadInvoice,
  onBack,
  titleHe = "העבודה הושלמה",
  width = 390,
  height = 780,
}: JobCompleteBodyProps) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const submitted = existingRating !== null;

  return (
    <View style={[styles.screen, { width, height }]}>
      {onBack ? <BackButton onPress={onBack} tone="light" /> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ---------------- Confirmation ---------------- */}
        <View style={styles.head}>
          <View style={styles.markBubble}>
            <Mark name={mark} size={26} color={colors.action} />
          </View>
          <Text style={styles.title}>{titleHe}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {serviceNameHe} · {whenHe}
          </Text>
        </View>

        {/* ---------------- Receipt ---------------- */}
        <View style={styles.block}>
          <SectionHeader title={paymentCaptured ? "חיוב" : "סיכום לתשלום"} colors={colors} />
          <Surface colors={colors} level={1} padded={false} style={styles.card}>
            {receiptLines.map((l, i) => (
              <View key={l.id} style={[styles.line, i > 0 && styles.lineDivided]}>
                <Text style={[styles.lineAmount, l.negative && { color: colors.actionText }]}>
                  {l.negative ? "−" : ""}
                  {formatMoney(money(Math.abs(l.amountMinorUnits), "ILS"))}
                </Text>
                <Text style={styles.lineLabel} numberOfLines={2}>
                  {l.labelHe}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalValue}>{formatMoney(money(totalChargedMinorUnits, "ILS"))}</Text>
              <Text style={styles.totalLabel}>{paymentCaptured ? "חויב" : "לתשלום"}</Text>
            </View>
          </Surface>

          <View style={styles.payRow}>
            {/* No invoice without somewhere to get one (as JobClosedBody's "Quiet"). */}
            {onDownloadInvoice ? (
              <Pressable onPress={onDownloadInvoice} accessibilityRole="button">
                <Text style={styles.link}>חשבונית</Text>
              </Pressable>
            ) : null}
            <Text style={styles.payMethod} numberOfLines={1}>
              {paymentMethodLabelHe ??
                (paymentCaptured
                  ? "אמצעי התשלום יוצג לאחר סליקה"
                  : /*
                     * Not "the method will appear later" — that implies a
                     * charge is on its way. Nothing has been taken, and
                     * the customer should know that now rather than
                     * discover it on a statement that never shows it.
                     */
                    "טרם בוצע חיוב")}
            </Text>
          </View>
        </View>

        {/* ---------------- Review ---------------- */}
        <View style={styles.block}>
          <SectionHeader title={submitted ? "הדירוג שלך" : "איך היה?"} colors={colors} />
          <Surface colors={colors} level={1}>
            <View style={styles.reviewPro}>
              <RingedAvatar
                size={48}
                uri={professionalPhotoUrl}
                name={professionalDisplayName}
                colors={colors}
                ringColor={colors.action}
              />
              <View style={styles.reviewProText}>
                <Text style={styles.reviewProName} numberOfLines={1}>
                  {professionalDisplayName}
                </Text>
                <Text style={styles.reviewProMeta} numberOfLines={1}>
                  {submitted ? "תודה — הדירוג נרשם" : `הדירוג יופיע בפרופיל של ${professionalDisplayName.replace(/\s*\([^)]*\)\s*/g, "").split(" ")[0]}`}
                </Text>
              </View>
            </View>

            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((i) => {
                const active = i <= (submitted ? (existingRating ?? 0) : rating);
                return (
                  <Pressable
                    key={i}
                    disabled={submitted}
                    onPress={() => setRating(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`${i} כוכבים`}
                    style={styles.starHit}
                  >
                    <StarMark size={34} filled={active} color={active ? colors.statusWarning : colors.border} />
                  </Pressable>
                );
              })}
            </View>

            {!submitted ? (
              <>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="מה היה טוב, ומה אפשר לשפר? (אופציונלי)"
                  accessibilityLabel="טקסט הביקורת"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  style={styles.input}
                  textAlign="right"
                />
                <Pressable
                  disabled={rating === 0}
                  onPress={() => onSubmitReview?.(rating, text)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.submit,
                    rating === 0 && { backgroundColor: colors.border },
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={[styles.submitLabel, rating === 0 && { color: colors.textSecondary }]}>
                    שליחת דירוג
                  </Text>
                </Pressable>
                <Text style={styles.reviewNote}>
                  דירוג אפשרי רק לעבודה שהושלמה בפועל, ופעם אחת לכל עבודה.
                </Text>
              </>
            ) : null}
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: spacing.xxl },

  head: {
    backgroundColor: colors.surface,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    alignItems: "center",
    ...elevation(1),
  },
  markBubble: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: tint.action(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.h1, color: colors.textPrimary, marginTop: spacing.md, writingDirection: "rtl" },
  subtitle: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
    writingDirection: "rtl",
  },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  card: { paddingVertical: spacing.xs },

  line: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lineDivided: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border },
  lineLabel: { ...type.body, flex: 1, fontSize: scale.meta, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  lineAmount: { ...type.bodyStrong, ...tabular, color: colors.textPrimary },

  totalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: tint.neutralLight(0.03),
  },
  totalLabel: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  totalValue: { ...type.h2, ...tabular, color: colors.textPrimary },

  payRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  payMethod: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  link: { ...type.captionStrong, color: colors.actionText },

  reviewPro: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  reviewProText: { flex: 1, alignItems: "flex-end" },
  reviewProName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  reviewProMeta: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },

  starRow: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  starHit: { padding: 5 },

  input: {
    minHeight: 84,
    borderRadius: radii.sm,
    backgroundColor: tint.neutralLight(0.04),
    padding: spacing.md,
    marginTop: spacing.md,
    ...type.body,
    fontSize: scale.meta,
    color: colors.textPrimary,
    writingDirection: "rtl",
    textAlignVertical: "top",
  },
  submit: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  submitLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  reviewNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.sm,
  },
});
