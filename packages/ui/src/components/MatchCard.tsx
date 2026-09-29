import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney, money, type JobMatchView, type PriceQuoteView } from "@pro-now/types";

import { customerTheme, radius, scale, spacing, tint, touchTarget, typography } from "../theme";
import { formatCompletedJobs, formatEta, formatMinimumBillable, formatProNowRating } from "../format";
import { Avatar, Divider, SectionLabel, Skeleton, StatusPill, type ThemeColors } from "./primitives";
import { VerificationBadge } from "./VerificationBadge";

/**
 * C09 — Match found. The single most consequential screen in the customer
 * app: it is where a person decides to let a stranger into their home.
 *
 * Every fact on this card comes from `JobMatchView`. There is no prop for a
 * name, a rating, an ETA or a price that the caller can pass "for now" —
 * the card renders what the server said or it renders an honest absence.
 * That is a deliberate API shape, because the previous version of this
 * screen fetched the real job and then displayed a hard-coded professional,
 * which is exactly what /CLAUDE.md §3 forbids.
 *
 * Design references the spec, not a competitor: /docs/03-DESIGN-SYSTEM.md
 * §10 Match card — "real photo, factual badges, ETA visually dominant,
 * price/visit fee, never expose precise pre-assignment location".
 */

const colors: ThemeColors = customerTheme.colors;

export interface MatchCardProps {
  match: JobMatchView;
  onConfirm: () => void;
  onRequestAnother?: () => void;
  confirming?: boolean;
}

/** Hebrew copy per pricing model. Copy lives in the client, not the API. */
function pricePresentation(price: PriceQuoteView): { label: string; value: string | null; note: string } {
  const currency = (price.currency as "ILS" | "USD" | "EUR") ?? "ILS";
  const fmt = (minor: number | null | undefined) =>
    minor === null || minor === undefined ? null : formatMoney(money(minor, currency));

  switch (price.priceModel) {
    case "FIXED":
      return {
        label: "מחיר לעבודה",
        value: fmt(price.fixedTotalMinorUnits),
        note: "מחיר סופי וקבוע מראש לעבודה הזו.",
      };
    case "VISIT_QUOTE":
      return {
        label: "דמי ביקור",
        value: fmt(price.visitFeeMinorUnits),
        note: "דמי הביקור כוללים הגעה ואבחון. באפליקציה לא עובר כסף: את דמי הביקור ואת התיקון עצמו משלמים ישירות לבעל המקצוע.",
      };
    case "HOURLY": {
      const rate = fmt(price.hourlyRateMinorUnits);
      const minimum = formatMinimumBillable(price.minimumBillableMinutes);
      return {
        label: "תעריף לשעה",
        value: rate,
        note: minimum
          ? `חיוב לפי זמן העבודה בפועל, מינימום ${minimum}.`
          : "חיוב לפי זמן העבודה בפועל.",
      };
    }
    case "DISTANCE_TIME": {
      const base = fmt(price.baseMinorUnits);
      const perKm = fmt(price.perKmMinorUnits);
      const floor = fmt(price.minimumFareMinorUnits);
      const parts = [
        perKm ? `בתוספת ${perKm} לכל ק״מ בפועל` : "בתוספת חיוב לפי מרחק בפועל",
        floor ? `מחיר מינימום ${floor}` : null,
      ].filter(Boolean);
      return { label: "מחיר בסיס", value: base, note: `${parts.join(". ")}.` };
    }
    default:
      return { label: "מחיר", value: null, note: "פרטי המחיר יוצגו לפני האישור." };
  }
}

export function MatchCard({ match, onConfirm, onRequestAnother, confirming = false }: MatchCardProps) {
  const { professional, eta, price, serviceNameHe } = match;

  const etaDisplay = formatEta(eta);
  const rating = formatProNowRating(professional.proNowRatingAverage, professional.proNowRatingCount);
  const jobsLine = formatCompletedJobs(professional.proNowCompletedJobs);
  const priceView = pricePresentation(price);

  return (
    <View style={styles.card} accessibilityLabel={`התאמה נמצאה עבור ${serviceNameHe}`}>
      <View style={styles.headerRow}>
        <StatusPill label="נמצא בעל מקצוע" color={colors.action} tint={tint.action()} live />
        <Text style={styles.serviceName} numberOfLines={1}>
          {serviceNameHe}
        </Text>
      </View>

      {/* --- Professional --- */}
      <View style={styles.proRow}>
        <Avatar
          name={professional.displayName}
          photoUrl={professional.profilePhotoUrl}
          seed={professional.id}
          size={68}
          ringColor={colors.trust}
          colors={colors}
        />
        <View style={styles.proInfo}>
          <Text style={styles.proName} numberOfLines={1}>
            {professional.displayName}
          </Text>

          {rating || jobsLine ? (
            // One Text, not a flex row: a wrapped row would strand the "·"
            // separator at the end of a line, and bidi reordering of a mixed
            // Hebrew/Latin string is only correct within a single run.
            <Text style={styles.reputationLine}>
              {rating ? (
                <>
                  <Text style={styles.star}>★ </Text>
                  <Text style={styles.ratingValue}>{rating.rating}</Text>
                  <Text style={styles.ratingCount}>
                    {rating.count === 1 ? " · ביקורת מאומתת אחת" : ` · ${rating.count} ביקורות מאומתות`}
                  </Text>
                </>
              ) : null}
              {rating && jobsLine ? <Text style={styles.ratingCount}>{"  ·  "}</Text> : null}
              {jobsLine ? <Text style={styles.jobsText}>{jobsLine}</Text> : null}
            </Text>
          ) : (
            // Honest absence — a new professional has no PRO NOW history to
            // show, and inventing one would be the exact failure mode the
            // invariant exists to prevent.
            <Text style={styles.noHistory}>בעל מקצוע חדש ב-PRO NOW</Text>
          )}
        </View>
      </View>

      {professional.verifications.length > 0 ? (
        <View style={styles.badgeRow}>
          {professional.verifications.map((kind) => (
            <VerificationBadge key={kind} kind={kind} />
          ))}
        </View>
      ) : null}

      {professional.externalReputation ? (
        <View style={styles.externalRow}>
          <Text style={styles.externalLabel}>
            מוניטין חיצוני ({professional.externalReputation.source})
          </Text>
          <Text style={styles.externalValue}>
            {professional.externalReputation.ratingAverage !== null
              ? `★ ${professional.externalReputation.ratingAverage.toFixed(1)}`
              : "מקושר"}
            {professional.externalReputation.ratingCount !== null
              ? ` · ${professional.externalReputation.ratingCount} ביקורות`
              : ""}
          </Text>
        </View>
      ) : null}

      {/* --- ETA: visually dominant, per the design spec --- */}
      <View style={styles.etaBlock}>
        {etaDisplay ? (
          <>
            <View style={styles.etaValueRow}>
              <Text style={styles.etaValue}>{etaDisplay.value}</Text>
              <Text style={styles.etaUnit}>{etaDisplay.unit}</Text>
            </View>
            <Text style={styles.etaLabel}>
              {etaDisplay.isApproximate ? "זמן הגעה משוער (הערכה ראשונית)" : "זמן הגעה משוער"}
            </Text>
          </>
        ) : (
          // No ETA has been computed. "Real ETA only" means showing nothing
          // here, not a placeholder that looks like a measurement.
          <>
            <Text style={styles.etaPending}>מחשבים זמן הגעה…</Text>
            <Text style={styles.etaLabel}>נעדכן ברגע שהחישוב יסתיים</Text>
          </>
        )}
      </View>

      <Divider color={colors.border} style={{ marginVertical: spacing.lg }} />

      {/* --- Price --- */}
      <SectionLabel colors={colors}>מה משלמים</SectionLabel>
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>{priceView.label}</Text>
        {priceView.value ? (
          <Text style={styles.priceValue}>{priceView.value}</Text>
        ) : (
          <Text style={styles.priceUnknown}>ייקבע לאחר אבחון</Text>
        )}
      </View>
      <Text style={styles.priceNote}>{priceView.note}</Text>

      {/* --- Actions --- */}
      <Pressable
        onPress={onConfirm}
        disabled={confirming}
        accessibilityRole="button"
        accessibilityLabel={`אישור והזמנת ${professional.displayName}`}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.primaryButtonPressed,
          confirming && styles.primaryButtonDisabled,
        ]}
      >
        <Text style={styles.primaryButtonLabel}>
          {confirming ? "מאשרים…" : `אישור והזמנה`}
        </Text>
      </Pressable>

      {onRequestAnother ? (
        <Pressable
          onPress={onRequestAnother}
          disabled={confirming}
          accessibilityRole="button"
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionLabel}>חפש בעל מקצוע אחר</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Loading state for the match card — same silhouette, no invented content. */
export function MatchCardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="טוען את פרטי ההתאמה">
      <Skeleton width="45%" height={26} radius={radius.pill} colors={colors} />
      <View style={[styles.proRow, { marginTop: spacing.lg }]}>
        <Skeleton width={68} height={68} radius={34} colors={colors} />
        <View style={[styles.proInfo, { gap: spacing.sm }]}>
          <Skeleton width="60%" height={20} colors={colors} />
          <Skeleton width="80%" height={14} colors={colors} />
        </View>
      </View>
      <View style={[styles.etaBlock, { marginTop: spacing.lg }]}>
        <Skeleton width={120} height={46} colors={colors} />
      </View>
      <Divider color={colors.border} style={{ marginVertical: spacing.lg }} />
      <Skeleton width="100%" height={18} colors={colors} />
      <View style={{ height: spacing.sm }} />
      <Skeleton width="70%" height={14} colors={colors} />
      <View style={{ height: spacing.xl }} />
      <Skeleton width="100%" height={54} radius={radius.md} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  serviceName: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
    textAlign: "left",
  },

  proRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  proInfo: { flex: 1, alignItems: "flex-end" },
  proName: { ...typography.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  reputationLine: {
    ...typography.caption,
    marginTop: 4,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 20,
    color: colors.textSecondary,
  },
  ratingValue: { color: colors.textPrimary, fontWeight: "700" },
  star: { color: "#F5A524" },
  ratingCount: { color: colors.textSecondary, fontWeight: "400" },
  jobsText: { color: colors.textSecondary },
  noHistory: { ...typography.caption, color: colors.textSecondary, marginTop: 4, textAlign: "right", writingDirection: "rtl" },

  badgeRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },

  externalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  externalLabel: { ...typography.caption, color: colors.textSecondary },
  externalValue: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },

  etaBlock: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  etaValueRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: spacing.sm },
  etaValue: {
    fontSize: scale.display,
    lineHeight: 58,
    fontWeight: "700",
    color: colors.actionText,
    fontVariant: ["tabular-nums" as const],
  },
  etaUnit: { ...typography.h2, color: colors.actionText },
  etaLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  etaPending: { ...typography.h2, color: colors.textSecondary },

  priceRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  priceLabel: { ...typography.body, color: colors.textPrimary },
  priceValue: {
    ...typography.h2,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums" as const],
  },
  priceUnknown: { ...typography.bodyStrong, color: colors.textSecondary },
  priceNote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "right", writingDirection: "rtl",
    marginTop: spacing.xs,
    lineHeight: 19,
  },

  primaryButton: {
    minHeight: 54,
    backgroundColor: colors.action,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonLabel: { ...typography.button, color: colors.onAction },

  secondaryAction: {
    minHeight: touchTarget.minimum,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  secondaryActionLabel: { ...typography.body, color: colors.textSecondary },
});
