import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatMoney, money } from "@pro-now/types";

import { customerTheme, elevation, palette, radii, scale, spacing, tabular, tint, type } from "../theme";
import { lex } from "../lexicon";
import { BackButton, BACK_BUTTON_CLEARANCE } from "../components/BackButton";
import { ClockMark, Mark, type MarkName, PinMark, ShieldCheckMark, StarMark } from "../components/marks";
import { Persona } from "../components/Persona";
import { SectionHeader, Surface } from "../components/surfaces";

/**
 * C14 — the customer's own card. "הכרטיס שלי".
 *
 * Every marketplace has a settings screen. This is deliberately not one: a
 * list of rows labelled "Payment methods" and "Notifications" tells the
 * person nothing about their relationship with the product. What a customer
 * actually wants to know here is *what has this done for me*, and what is
 * still open.
 *
 * So the page leads with their real history — calls made, what they came to,
 * the professionals who came — and the administrative rows sit underneath
 * where they belong.
 *
 * Honesty rules, same as everywhere:
 *
 * - The stats are counts of things that actually happened. There is no
 *   "member since" badge that flatters an empty account, and no invented
 *   loyalty tier. A new customer's card says so plainly, and says what to
 *   do next instead.
 * - An open call is shown as open, with its real state. This is often the
 *   most useful thing on the screen and it is not buried.
 * - The saved address is coarse in the summary line; precision lives in the
 *   address editor, not on a page someone might show a friend.
 */

const colors = customerTheme.colors;

export interface CustomerCallHistoryItem {
  id: string;
  serviceNameHe: string;
  mark: MarkName;
  /** "לפני שבועיים · הושלם" — assembled by the caller from job events. */
  metaHe: string;
  /** Seed for the professional's illustration; null when unassigned. */
  proSeed: string | null;
  proNameHe: string | null;
  totalMinorUnits: number | null;
  /** Set when the customer left one, so the card can show it back to them. */
  myRating: number | null;
}

export interface CustomerOpenCall {
  id: string;
  serviceNameHe: string;
  mark: MarkName;
  /** Plain-language state, e.g. lex.onTheWay. */
  stateHe: string;
  etaMinutes: number | null;
  proSeed: string | null;
  proNameHe: string | null;
}

export interface CustomerProfileBodyProps {
  /* A visible way back (button audit #25) — the phone's back was the only one. */
  onBack?: () => void;
  displayNameHe: string;
  /** Stable seed for their own illustration — their user id. */
  seed: string;
  /** Coarse home area. Never the full street address on this page. */
  homeAreaLabelHe: string | null;
  /** Masked instrument label, e.g. "ויזה · 4417". Null when none saved. */
  paymentLabelHe: string | null;
  /** Calls that are live right now. Usually zero or one. */
  openCalls: CustomerOpenCall[];
  history: CustomerCallHistoryItem[];
  /** Total spent through PRO NOW, when there is anything to total. */
  lifetimeSpendMinorUnits: number | null;
  onOpenCall?: (id: string) => void;
  onEditAddresses?: () => void;
  onEditPayment?: () => void;
  /**
   * Throw away everything this device remembered and start clean.
   *
   * Present only in the prototype. A review session that keeps what you
   * typed needs an obvious way to get back to a first-run state, or the
   * second time anybody tests the sign-up flow they are testing it with
   * last week's answers already filled in.
   */
  onResetReviewSession?: () => void;

  /** What is currently remembered, in one line. Null when nothing is. */
  reviewSavedHe?: string | null;
  width?: number;
  height?: number;
}

export function CustomerProfileBody({
  onBack,
  displayNameHe,
  seed,
  homeAreaLabelHe,
  paymentLabelHe,
  openCalls,
  history,
  lifetimeSpendMinorUnits,
  onOpenCall,
  onEditAddresses,
  onEditPayment,
  onResetReviewSession,

  reviewSavedHe,
  width = 390,
  height = 780,
}: CustomerProfileBodyProps) {
  const completed = history.length;
  const rated = history.filter((h) => h.myRating !== null).length;
  const isNew = completed === 0 && openCalls.length === 0;

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} tone="light" placement="absolute" />
        {/* ---------------- Header, no card around it ---------------- */}
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <Persona seed={seed} size={72} ring={colors.action} label={`איור · ${displayNameHe}`} />
            <View style={styles.heroText}>
              <Text style={styles.name} numberOfLines={1}>
                {displayNameHe}
              </Text>
              {homeAreaLabelHe ? (
                <View style={styles.areaRow}>
                  <PinMark size={13} color={colors.textSecondary} />
                  <Text style={styles.area} numberOfLines={1}>
                    {homeAreaLabelHe}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Numbers directly on the background — no card, per the
              "fewer containers" pass. They are facts, not a widget. */}
          {!isNew ? (
            <View style={styles.stats}>
              <Stat value={String(completed)} label={lex.myCalls} />
              <View style={styles.statDivider} />
              <Stat
                value={lifetimeSpendMinorUnits !== null ? formatMoney(money(lifetimeSpendMinorUnits, "ILS")) : "—"}
                label="סה״כ"
                muted={lifetimeSpendMinorUnits === null}
              />
              <View style={styles.statDivider} />
              <Stat value={String(rated)} label="ביקורות שכתבתם" muted={rated === 0} />
            </View>
          ) : null}
        </View>

        {/* ---------------- Open call — the most useful thing here ------ */}
        {openCalls.map((c) => (
          <Pressable key={c.id} onPress={() => onOpenCall?.(c.id)} style={styles.openWrap}>
            <View style={styles.openCard}>
              <View style={styles.openTop}>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{c.stateHe}</Text>
                </View>
                {c.etaMinutes !== null ? (
                  <View style={styles.openEta}>
                    <ClockMark size={14} color={palette.white} />
                    <Text style={styles.openEtaText}>{c.etaMinutes} דק׳</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.openService} numberOfLines={1}>
                {c.serviceNameHe}
              </Text>

              {c.proSeed && c.proNameHe ? (
                <View style={styles.openPro}>
                  <Persona seed={c.proSeed} size={34} ring="rgba(255,255,255,0.5)" />
                  <Text style={styles.openProName} numberOfLines={1}>
                    {c.proNameHe}
                  </Text>
                </View>
              ) : (
                <Text style={styles.openProName}>{lex.scanning}…</Text>
              )}
            </View>
          </Pressable>
        ))}

        {/* ---------------- New customer ---------------- */}
        {isNew ? (
          <View style={styles.block}>
            <Surface colors={colors} level={1} style={styles.emptyCard}>
              <View style={styles.emptyMark}>
                <Mark name="handyman" size={26} color={colors.action} />
              </View>
              <Text style={styles.emptyTitle}>עוד לא שלחתם קריאה</Text>
              <Text style={styles.emptyBody}>
                כשתשלחו, המקצוען שמגיע יופיע כאן — עם זמן הגעה ומה אומת עליו.
              </Text>
            </Surface>
          </View>
        ) : null}

        {/* ---------------- History ---------------- */}
        {history.length > 0 ? (
          <View style={styles.block}>
            <SectionHeader title={lex.myCalls} colors={colors} />
            <View style={{ gap: spacing.sm }}>
              {history.map((h) => (
                <Pressable key={h.id} onPress={() => onOpenCall?.(h.id)}>
                  <Surface colors={colors} level={1} style={styles.historyCard}>
                    <View style={styles.historyRow}>
                      <View style={styles.historyMark}>
                        <Mark name={h.mark} size={18} color={colors.action} />
                      </View>
                      <View style={styles.historyText}>
                        <Text style={styles.historyName} numberOfLines={1}>
                          {h.serviceNameHe}
                        </Text>
                        <Text style={styles.historyMeta} numberOfLines={1}>
                          {h.metaHe}
                        </Text>
                      </View>
                      {h.totalMinorUnits !== null ? (
                        <Text style={styles.historyTotal}>
                          {formatMoney(money(h.totalMinorUnits, "ILS"))}
                        </Text>
                      ) : null}
                    </View>

                    {h.proSeed && h.proNameHe ? (
                      <View style={styles.historyPro}>
                        <Persona seed={h.proSeed} size={26} />
                        <Text style={styles.historyProName} numberOfLines={1}>
                          {h.proNameHe}
                        </Text>
                        {h.myRating !== null ? (
                          <View style={styles.myRating}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <StarMark
                                key={i}
                                size={11}
                                filled={i <= (h.myRating as number)}
                                color={i <= (h.myRating as number) ? colors.statusWarning : colors.border}
                              />
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.rateLink}>לדרג</Text>
                        )}
                      </View>
                    ) : null}
                  </Surface>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* ---------------- The administrative rows, where they belong -- */}
        <View style={styles.block}>
          <SectionHeader title="הגדרות" colors={colors} />
          <Surface colors={colors} level={1} padded={false} style={{ paddingVertical: spacing.xs }}>
            <SettingRow
              icon={<PinMark size={17} color={colors.textSecondary} />}
              label={lex.myPlaces}
              value={homeAreaLabelHe ?? "לא נשמרה כתובת"}
              onPress={onEditAddresses}
            />
            <SettingRow
              icon={<ShieldCheckMark size={17} color={colors.trust} />}
              label="אמצעי תשלום"
              value={paymentLabelHe ?? "לא נשמר אמצעי תשלום"}
              onPress={onEditPayment}
              divided
            />
          </Surface>

          <Text style={styles.footnote}>{lex.trustNote}</Text>
        </View>

        {/* ---------------- Prototype only, and labelled as such ------- */}
        {onResetReviewSession ? (
          <View style={styles.block}>
            <SectionHeader title="תצוגה" colors={colors} />
            <Surface colors={colors} level={1} padded={false} style={{ paddingVertical: spacing.xs }}>
              <SettingRow
                icon={<ShieldCheckMark size={17} color={colors.textSecondary} />}
                label="התחלה מחדש"
                value={reviewSavedHe ?? "מוחק מה שנשמר במכשיר הזה"}
                onPress={onResetReviewSession}
              />
            </Surface>
            <Text style={styles.footnote}>
              מה שבחרתם ומה שכתבתם נשמר במכשיר הזה בלבד ולא נשלח לשום מקום. קריאה פעילה לא
              נשמרת.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, muted = false }: { value: string; label: string; muted?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, muted && { color: colors.textSecondary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  divided = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress?: () => void;
  divided?: boolean;
}) {
  // A row that goes nowhere is information, not a button: no chevron, no press.
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.settingRow, divided && styles.settingDivided, pressed && { opacity: 0.7 }]}
    >
      {onPress ? <Text style={styles.settingChevron}>›</Text> : null}
      <View style={styles.settingText}>
        <Text style={styles.settingLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.settingValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <View style={styles.settingIcon}>{icon}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: spacing.xxl },

  hero: { paddingHorizontal: spacing.lg, paddingTop: BACK_BUTTON_CLEARANCE, paddingBottom: spacing.lg },
  heroRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.lg },
  heroText: { flex: 1, alignItems: "flex-end" },
  name: { ...type.h1, color: colors.textPrimary, writingDirection: "rtl" },
  areaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 2 },
  area: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },

  // Numbers sit on the background. No card: they are facts, not a widget.
  stats: { flexDirection: "row-reverse", alignItems: "stretch", marginTop: spacing.xl },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  statValue: { ...type.h2, ...tabular, color: colors.textPrimary },
  statLabel: { ...type.caption, fontSize: scale.micro, color: colors.textSecondary, writingDirection: "rtl", marginTop: 1 },

  openWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  openCard: {
    backgroundColor: colors.action,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...elevation(2),
  },
  openTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  livePill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.white },
  liveText: { ...type.captionStrong, color: palette.white, writingDirection: "rtl" },
  openEta: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  openEtaText: { ...type.bodyStrong, ...tabular, color: palette.white },

  openService: {
    ...type.h2,
    color: palette.white,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
  openPro: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  openProName: { ...type.caption, color: "rgba(255,255,255,0.92)", writingDirection: "rtl" },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  emptyCard: { alignItems: "center" },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tint.action(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { ...type.h3, color: colors.textPrimary, marginTop: spacing.md, writingDirection: "rtl" },
  emptyBody: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.xs,
    lineHeight: 19,
  },

  historyCard: { paddingVertical: spacing.md },
  historyRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  historyMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tint.action(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  historyText: { flex: 1, alignItems: "flex-end" },
  historyName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  historyMeta: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  historyTotal: { ...type.bodyStrong, ...tabular, color: colors.textPrimary },

  historyPro: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
  },
  historyProName: { ...type.caption, flex: 1, color: colors.textSecondary, writingDirection: "rtl" },
  myRating: { flexDirection: "row-reverse", gap: 1.5 },
  rateLink: { ...type.captionStrong, color: colors.actionText },

  settingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  settingDivided: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: { flex: 1, alignItems: "flex-end" },
  settingLabel: { ...type.bodyStrong, fontSize: scale.meta, color: colors.textPrimary, writingDirection: "rtl" },
  settingValue: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  settingChevron: { fontSize: scale.section, color: colors.textSecondary, fontWeight: "300", marginTop: -2 },

  footnote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
