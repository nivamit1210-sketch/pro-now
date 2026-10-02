import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { formatMoney, money } from "@pro-now/types";

import { BackButton } from "../components/BackButton";
import { proTheme, radii, scale, spacing, tabular, tint, type } from "../theme";
import { Mark, type MarkName } from "../components/marks";
import { SectionHeader, Surface } from "../components/surfaces";

/**
 * P08 — what the professional earned, and what was taken.
 *
 * The earnings card on the shift screen showed one number and led nowhere,
 * which is the shape of a promise being avoided. A professional's
 * relationship with a marketplace is mostly this screen: if the arithmetic
 * is hard to follow, they assume they are being shaved, and they are often
 * right somewhere else.
 *
 * So the rule here is that **every deduction is named and shown, and the
 * gross is shown beside the net.** A platform that only displays take-home
 * is hiding its own commission behind a friendly number. The percentage is
 * not set in code — it is a business decision (/CLAUDE.md §4) — so this
 * screen renders whatever the server reports and never assumes a rate.
 *
 * The payout line says when money actually arrives, because "earned" and
 * "in my account" are different facts and confusing them is how a platform
 * loses trust it cannot buy back.
 */

const colors = proTheme.colors;

/**
 * What stands where the take-home number goes when there is not one yet.
 *
 * Not "₪0.00" and not an empty space: the first is wrong and the second
 * looks like a rendering fault. A professional reading this wants to know
 * that the money is counted and the split is not settled, which is
 * exactly what has happened.
 */
const PENDING_NET_HE = "בחישוב";

export interface EarningDay {
  /** "א׳", "ב׳" … — one short label per bar. */
  labelHe: string;
  /** Null for a day with no settled net — an empty bar, not a zero one. */
  netMinorUnits: number | null;
  jobs: number;
  /** Marks today, so the bar chart has an anchor. */
  isToday?: boolean;
}

export interface EarningJob {
  id: string;
  serviceNameHe: string;
  mark: MarkName;
  whenHe: string;
  grossMinorUnits: number;
  /** Everything taken off, itemised. Never a single "fees" lump. */
  deductions: { labelHe: string; minorUnits: number }[];
  /**
   * Null when the platform's commission has not been set, so what the
   * professional is owed is not yet computable — see `/CLAUDE.md §4` and
   * the ledger in `capture-payment.ts`, which writes the charge alone in
   * that case.
   *
   * It was a plain number, and the only value available to pass for an
   * unknown was 0 — which renders as ₪0.00 and tells somebody who worked
   * all week that they earned nothing. That is a worse falsehood than the
   * nullable type costs to carry, and it lands on the screen this file's
   * own header calls the whole relationship.
   */
  netMinorUnits: number | null;
}

export interface ProEarningsBodyProps {
  /** Net for the current period, or null while the split is unsettled. */
  periodNetMinorUnits: number | null;
  periodGrossMinorUnits: number;
  periodJobCount: number;
  periodLabelHe: string;
  days: EarningDay[];
  jobs: EarningJob[];
  /** When the next transfer lands, or null when nothing is pending. */
  nextPayoutHe: string | null;
  nextPayoutMinorUnits: number | null;
  /**
   * The customers paid the professional directly (no money moves through the
   * app): every amount is what the job came to, and there is no net to wait for.
   */
  paidDirectly?: boolean;
  onOpenJob?: (id: string) => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function ProEarningsBody({
  periodNetMinorUnits,
  periodGrossMinorUnits,
  periodJobCount,
  periodLabelHe,
  days,
  jobs,
  nextPayoutHe,
  nextPayoutMinorUnits,
  paidDirectly = false,
  onOpenJob,
  onBack,
  width = 390,
  height = 780,
}: ProEarningsBodyProps) {
  /*
   * "נוכה" is a SUBTRACTION of two recorded facts, not a percentage
   * applied — the same rule `/v1/pro/earnings` states. With no net there
   * is nothing to subtract, and the line is omitted rather than shown as
   * a deduction of zero, which would read as "we took nothing" on a week
   * where the answer is not in yet.
   */
  const taken = periodNetMinorUnits === null ? null : periodGrossMinorUnits - periodNetMinorUnits;
  const max = Math.max(1, ...days.map((d) => d.netMinorUnits ?? 0));

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <BackButton onPress={onBack} tone={"light"} placement="absolute" />

          <Text style={styles.period}>{periodLabelHe}</Text>
          {/* While the commission is undecided the big number is what the jobs
              came to — a fact — and it says so, rather than "בחישוב". */}
          <Text style={styles.net}>
            {formatMoney(money(periodNetMinorUnits ?? periodGrossMinorUnits, "ILS"))}
          </Text>
          <Text style={styles.netLabel}>
            {paidDirectly ? "סכום העבודות · שולם לך ישירות" : periodNetMinorUnits === null ? "סכום העבודות" : "נטו · אחרי כל הניכויים"}
          </Text>

          {/* Gross beside net. Showing only take-home hides the commission
              behind a friendly number. */}
          <View style={styles.grossRow}>
            {taken === null ? null : (
              <>
                <Text style={styles.grossText}>ברוטו {formatMoney(money(periodGrossMinorUnits, "ILS"))}</Text>
                <Text style={styles.grossDot}>·</Text>
                <Text style={styles.grossText}>נוכה {formatMoney(money(taken, "ILS"))}</Text>
                <Text style={styles.grossDot}>·</Text>
              </>
            )}
            <Text style={styles.grossText}>
              {periodJobCount === 1 ? "עבודה אחת" : `${periodJobCount} עבודות`}
            </Text>
          </View>
        </View>

        {/* ---------------- The week ---------------- */}
        {days.length > 0 ? (
        <View style={styles.block}>
          <SectionHeader title="השבוע" colors={colors} />
          <Surface colors={colors} level={1} dark>
            <View style={styles.chart}>
              {days.map((d) => {
                // A day with no settled net is a stub, not a bar: the same
                // height a zero day gets, because "nothing yet" and
                // "nothing earned" should not be told apart by eye when
                // only one of them is a fact.
                const h = Math.max(4, Math.round(((d.netMinorUnits ?? 0) / max) * 96));
                return (
                  <View key={d.labelHe} style={styles.barCol}>
                    <Text style={styles.barValue} numberOfLines={1}>
                      {(d.netMinorUnits ?? 0) > 0 ? Math.round((d.netMinorUnits ?? 0) / 100) : ""}
                    </Text>
                    <Svg width={22} height={100}>
                      <Rect
                        x={0}
                        y={100 - h}
                        width={22}
                        height={h}
                        rx={6}
                        fill={d.isToday ? colors.action : tint.trust(0.45)}
                      />
                    </Svg>
                    <Text style={[styles.barLabel, d.isToday && { color: colors.actionText }]}>{d.labelHe}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.chartNote}>בשקלים. העמודה הכתומה — היום.</Text>
          </Surface>
        </View>
        ) : null}

        {/* ---------------- Next payout — only when there is one ---------------- */}
        {nextPayoutHe && nextPayoutMinorUnits !== null ? (
        <View style={styles.block}>
          <SectionHeader title="תשלום הבא" colors={colors} />
          <Surface colors={colors} level={1} dark>
            {nextPayoutHe && nextPayoutMinorUnits !== null ? (
              <>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutWhen}>{nextPayoutHe}</Text>
                  <Text style={styles.payoutValue}>
                    {formatMoney(money(nextPayoutMinorUnits, "ILS"))}
                  </Text>
                </View>
              </>
            ) : null}
          </Surface>
        </View>
        ) : null}

        {/* ---------------- Job by job ---------------- */}
        <View style={styles.block}>
          <SectionHeader title="לפי עבודה" colors={colors} />
          <View style={{ gap: spacing.sm }}>
            {jobs.length === 0 ? (
              <Text style={styles.payoutNote}>עוד לא נסגרה עבודה. כל עבודה שהלקוח מאשר תופיע כאן.</Text>
            ) : null}
            {jobs.map((j) => (
              <Pressable key={j.id} onPress={onOpenJob ? () => onOpenJob(j.id) : undefined} disabled={!onOpenJob}>
                <Surface colors={colors} level={1} dark>
                  <View style={styles.jobRow}>
                    <View style={styles.jobMark}>
                      <Mark name={j.mark} size={17} color={colors.trust} />
                    </View>
                    <View style={styles.jobText}>
                      <Text style={styles.jobName} numberOfLines={1}>
                        {j.serviceNameHe}
                      </Text>
                      <Text style={styles.jobWhen} numberOfLines={1}>
                        {j.whenHe}
                      </Text>
                    </View>
                    <Text style={styles.jobNet}>
                      {paidDirectly
                        ? formatMoney(money(j.grossMinorUnits, "ILS"))
                        : j.netMinorUnits === null
                        ? PENDING_NET_HE
                        : formatMoney(money(j.netMinorUnits, "ILS"))}
                    </Text>
                  </View>

                  {/* Every deduction named. Never a single "fees" lump. */}
                  <View style={styles.breakdown}>
                    <View style={styles.breakRow}>
                      <Text style={styles.breakValue}>{formatMoney(money(j.grossMinorUnits, "ILS"))}</Text>
                      <Text style={styles.breakLabel}>{paidDirectly ? "שולם לך ישירות" : "סכום העבודה"}</Text>
                    </View>
                    {j.deductions.map((d) => (
                      <View key={d.labelHe} style={styles.breakRow}>
                        <Text style={[styles.breakValue, { color: colors.statusDanger }]}>
                          −{formatMoney(money(Math.abs(d.minorUnits), "ILS"))}
                        </Text>
                        <Text style={styles.breakLabel}>{d.labelHe}</Text>
                      </View>
                    ))}
                  </View>
                </Surface>
              </Pressable>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: spacing.xxl },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, alignItems: "flex-end" },
  // 44x44 minimum. A 25px chevron is a control most thumbs miss, which
  // is the same defect that made the demo bar unhittable.
  period: { ...type.overline, color: colors.textSecondary },
  net: { ...type.displayXL, ...tabular, fontSize: scale.display, lineHeight: 56, color: colors.textPrimary, marginTop: 2 },
  netLabel: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  grossRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: spacing.md, flexWrap: "wrap" },
  grossText: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  grossDot: { ...type.caption, color: colors.textSecondary },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  chart: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" },
  barCol: { alignItems: "center", gap: 4 },
  barValue: { ...type.caption, ...tabular, fontSize: scale.micro, color: colors.textSecondary, height: 14 },
  barLabel: { ...type.caption, fontSize: scale.micro, color: colors.textSecondary },
  chartNote: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", marginTop: spacing.md },

  payoutRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between" },
  payoutWhen: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  payoutValue: { ...type.h2, ...tabular, color: colors.trust },
  payoutNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  jobRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  jobMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tint.trust(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  jobText: { flex: 1, alignItems: "flex-end" },
  jobName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  jobWhen: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  jobNet: { ...type.bodyStrong, ...tabular, color: colors.textPrimary },

  breakdown: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
    gap: 4,
  },
  breakRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  breakLabel: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  breakValue: { ...type.caption, ...tabular, color: colors.textSecondary },

  noteRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm },
  noteText: {
    ...type.caption,
    flex: 1,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },
});
