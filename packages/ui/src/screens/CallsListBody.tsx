import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatMoney, money } from "@pro-now/types";

import { customerDarkTheme, elevation, radii, scale, spacing, tabular, tint, type } from "../theme";
import { lex } from "../lexicon";
import { BackButton, BACK_BUTTON_CLEARANCE } from "../components/BackButton";
import { Mark, type MarkName, StarMark } from "../components/marks";
import { Persona } from "../components/Persona";

/**
 * C16 — the customer's calls.
 *
 * This tab used to render the profile screen, which is the laziest kind of
 * dead end: it looks implemented and answers nothing. A calls list has a
 * different job from a profile — it is where someone goes mid-job to check
 * "where is he", and afterwards to find a receipt or re-book the person who
 * was good.
 *
 * So it is ordered by urgency rather than by date: what is happening right
 * now, then what needs the customer (an unapproved quote, an unrated job),
 * then history. A reverse-chronological list buries the live job under last
 * March's paint job by the third month of use.
 */

/* Night, like the rest of the app — the light page read "חיוור" (Amit, 2026-10-01). */
const colors = customerDarkTheme.colors;
const CARD = "#1D1726";
const CARD_SOFT = "rgba(247,243,250,0.05)";
const LINE = "rgba(247,243,250,0.10)";

export interface CallListItem {
  id: string;
  serviceNameHe: string;
  mark: MarkName;
  /** Plain-language state, e.g. lex.onTheWay or lex.done. */
  stateHe: string;
  whenHe: string;
  live: boolean;
  /** Set while a professional is assigned. */
  proNameHe: string | null;
  proSeed: string | null;
  etaMinutes: number | null;
  totalMinorUnits: number | null;
  myRating: number | null;
  /** True when a quote is waiting for this customer to approve or decline. */
  needsQuoteApproval?: boolean;
  /**
   * Whether a rating is still owed and can still be given. Omitted, an
   * unrated finished call counts as owed (the demo's rule); the product sets
   * it, because a cancelled call has no rating and a closed one can no
   * longer take one.
   */
  needsRating?: boolean;
  /** Live orders: 0 on the way · 1 arrived · 2 checking · 3 working · 4 finishing. */
  stage?: number;
  /** Live orders: something waits on the customer. */
  attention?: boolean;
  /** Live orders, when ordered for someone else: who is at home. */
  forHe?: string | null;
}

export interface CallsListBodyProps {
  /* A visible way back (button audit #25) — the phone's back was the only one. */
  onBack?: () => void;
  /** The history section's title; "הושלמו" unless it also holds cancelled calls. */
  historyTitleHe?: string;
  calls: CallListItem[];
  onOpen?: (id: string) => void;
  onRate?: (id: string) => void;
  onApproveQuote?: (id: string) => void;
  onNewCall?: () => void;
  width?: number;
  height?: number;
}

export function CallsListBody({
  onBack,
  historyTitleHe = "הושלמו",
  calls,
  onOpen,
  onRate,
  onApproveQuote,
  onNewCall,
  width = 390,
  height = 780,
}: CallsListBodyProps) {
  const live = calls.filter((c) => c.live);
  const needsYou = calls.filter((c) => !c.live && (c.needsQuoteApproval || (c.needsRating ?? c.myRating === null)));
  const done = calls.filter((c) => !live.includes(c) && !needsYou.includes(c));

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} tone="dark" placement="absolute" />
        <View style={styles.head}>
          <Text style={styles.title}>{lex.myCalls}</Text>
        </View>

        {calls.length === 0 ? (
          <View style={styles.block}>
            <View style={[n.rowCard, styles.empty]}>
              <View style={styles.emptyMark}>
                <Mark name="handyman" size={24} color={colors.action} />
              </View>
              <Text style={styles.emptyTitle}>עוד לא שלחת קריאה</Text>
              <Text style={styles.emptyBody}>
                כל קריאה שתשלח תופיע כאן — עם מי הגיע, מתי, וכמה זה עלה.
              </Text>
              <Pressable onPress={onNewCall} accessibilityRole="button" style={styles.emptyCta}>
                <Text style={styles.emptyCtaText}>{lex.sendCall}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ---------------- Happening now ---------------- */}
        {live.length > 0 ? (
          <View style={n.sectionHead}>
            <Text style={n.sectionTitle}>עכשיו</Text>
            <Text style={n.sectionCount}>{live.length === 1 ? "הזמנה אחת פעילה" : `${live.length} פעילות`}</Text>
          </View>
        ) : null}
        {live.map((c, i) => (
          <Pressable
            key={c.id}
            onPress={() => onOpen?.(c.id)}
            accessibilityRole="button"
            accessibilityLabel={`הזמנה ${i + 1} מתוך ${live.length}: ${c.serviceNameHe}${c.proNameHe ? `, ${c.proNameHe}` : ""}, ${c.stateHe}${c.etaMinutes !== null ? `, ${c.etaMinutes} דקות` : ""}`}
            style={({ pressed }) => [n.liveCard, c.attention && n.liveCardCall, pressed && { opacity: 0.9 }]}
          >
            <View style={n.liveTop}>
              <View style={[n.livePill, c.attention && n.livePillCall]}>
                <View style={[n.liveDot, c.attention && { backgroundColor: colors.action }]} />
                <Text style={n.liveState}>{c.stateHe}</Text>
              </View>
              {c.etaMinutes !== null ? (
                <View style={n.liveEta}>
                  <Text style={n.liveEtaNum}>{c.etaMinutes}</Text>
                  <Text style={n.liveEtaUnit}>דק׳</Text>
                </View>
              ) : null}
            </View>
            <View style={n.liveMid}>
              <View style={n.liveMark}>
                <Mark name={c.mark} size={22} color={colors.action} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={n.liveService} numberOfLines={1}>
                  {c.serviceNameHe}
                </Text>
                <Text style={n.liveProName} numberOfLines={1}>
                  {c.proNameHe ? `${c.proNameHe}${c.forHe ? ` · בשביל ${c.forHe}` : ""}` : `${lex.scanning}…`}
                </Text>
              </View>
              {live.length > 1 ? <Text style={n.liveSeq}>הזמנה {i + 1}</Text> : null}
            </View>
            {/* Where it stands, in five words — never colour alone. */}
            <View style={n.rail} accessibilityElementsHidden>
              {["בדרך", "הגיע", "בבדיקה", "בעבודה", "סיום"].map((w, k) => {
                const st = c.stage ?? 0;
                return (
                  <View key={w} style={n.railStep}>
                    <View style={[n.railBar, k < st && n.railDone, k === st && n.railNow]} />
                    <Text style={[n.railWord, k === st && n.railWordNow]}>{w}</Text>
                  </View>
                );
              })}
            </View>
          </Pressable>
        ))}

        {/* ---------------- Waiting on you ---------------- */}
        {needsYou.length > 0 ? (
          <View style={styles.block}>
            <Text style={n.sectionTitleSmall}>ממתין לך</Text>
            <View style={{ gap: spacing.sm }}>
              {needsYou.map((c) => (
                <View key={c.id} style={n.rowCard}>
                  <Row call={c} onOpen={onOpen} />
                  <Pressable
                    onPress={() => (c.needsQuoteApproval ? onApproveQuote?.(c.id) : onRate?.(c.id))}
                    accessibilityRole="button"
                    style={styles.rowCta}
                  >
                    <Text style={styles.rowCtaText}>
                      {c.needsQuoteApproval ? "צפייה בהצעת המחיר" : "דירוג המקצוען"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ---------------- History ---------------- */}
        {done.length > 0 ? (
          <View style={styles.block}>
            <Text style={n.sectionTitleSmall}>{historyTitleHe}</Text>
            <View style={{ gap: spacing.sm }}>
              {done.map((c) => (
                <View key={c.id} style={n.rowCard}>
                  <Row call={c} onOpen={onOpen} />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ call: c, onOpen }: { call: CallListItem; onOpen?: (id: string) => void }) {
  /* The whole row opens its call (button audit #22) — it used to look pressable and do nothing. */
  return (
    <Pressable
      disabled={!onOpen}
      onPress={() => onOpen?.(c.id)}
      accessibilityRole="button"
      accessibilityLabel={`${c.serviceNameHe} · ${c.stateHe}`}
    >
      <View style={styles.row}>
        <View style={styles.rowMark}>
          <Mark name={c.mark} size={18} color={colors.action} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {c.serviceNameHe}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {c.whenHe} · {c.stateHe}
          </Text>
        </View>
        {c.totalMinorUnits !== null ? (
          <Text style={styles.rowTotal}>{formatMoney(money(c.totalMinorUnits, "ILS"))}</Text>
        ) : null}
      </View>

      {c.proSeed && c.proNameHe ? (
        <View style={styles.rowPro}>
          <Persona seed={c.proSeed} size={24} />
          <Text style={styles.rowProName} numberOfLines={1}>
            {c.proNameHe}
          </Text>
          {c.myRating !== null ? (
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((i) => (
                <StarMark
                  key={i}
                  size={11}
                  filled={i <= (c.myRating as number)}
                  color={i <= (c.myRating as number) ? colors.action : "rgba(247,243,250,0.2)"}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: spacing.xxl },

  head: { paddingHorizontal: spacing.lg, paddingTop: BACK_BUTTON_CLEARANCE, alignItems: "flex-end" },
  title: { ...type.h1, color: colors.textPrimary, writingDirection: "rtl" },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  empty: { alignItems: "center" },
  emptyMark: {
    width: 54,
    height: 54,
    borderRadius: 27,
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
  emptyCta: {
    minHeight: 48,
    alignSelf: "stretch",
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  emptyCtaText: { ...type.bodyStrong, fontSize: scale.meta, color: colors.onAction },

  liveWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  liveCard: { backgroundColor: colors.action, borderRadius: radii.lg, padding: spacing.lg, ...elevation(2) },
  liveTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  livePill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.onAction },
  liveState: { ...type.captionStrong, color: colors.onAction, writingDirection: "rtl" },
  liveEta: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  liveEtaText: { ...type.bodyStrong, ...tabular, color: colors.onAction },
  liveService: { ...type.h2, color: colors.onAction, textAlign: "right", writingDirection: "rtl", marginTop: spacing.md },
  livePro: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  liveProName: { ...type.caption, color: "rgba(255,255,255,0.92)", writingDirection: "rtl" },

  row: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  rowMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tint.action(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, alignItems: "flex-end" },
  rowName: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  rowMeta: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  rowTotal: { ...type.bodyStrong, ...tabular, color: colors.textPrimary },

  rowPro: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
  },
  rowProName: { ...type.caption, flex: 1, color: colors.textSecondary, writingDirection: "rtl" },
  stars: { flexDirection: "row-reverse", gap: 1.5 },

  rowCta: {
    minHeight: 44,
    borderRadius: radii.sm,
    backgroundColor: tint.action(0.12),
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  rowCtaText: { ...type.captionStrong, color: colors.actionText },
});

/* The night page (Amit, 2026-10-01: "נראה קצת חיוור"). */
const n = StyleSheet.create({
  liveCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: CARD, borderRadius: radii.lg, padding: spacing.lg, borderRightWidth: 3, borderRightColor: colors.action, shadowColor: colors.action, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } },
  liveCardCall: { borderWidth: 1, borderColor: "rgba(255,92,56,0.55)" },
  liveTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  livePill: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tint.trust(0.16) },
  livePillCall: { backgroundColor: tint.action(0.18) },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.trust },
  liveState: { color: colors.textPrimary, fontSize: scale.meta, fontWeight: "800", writingDirection: "rtl" },
  liveEta: { flexDirection: "row-reverse", alignItems: "baseline", gap: 4 },
  liveEtaNum: { color: colors.action, fontSize: scale.title, fontWeight: "900", ...tabular },
  liveEtaUnit: { color: colors.textSecondary, fontSize: scale.meta, fontWeight: "700" },
  liveMid: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: spacing.md },
  liveMark: { width: 46, height: 46, borderRadius: 23, backgroundColor: tint.action(0.14), alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,92,56,0.35)" },
  liveService: { color: colors.textPrimary, fontSize: scale.section, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  liveProName: { color: colors.textSecondary, fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 2 },
  liveSeq: { color: colors.textSecondary, fontSize: scale.micro, fontWeight: "700" },
  rail: { flexDirection: "row-reverse", gap: 4, marginTop: spacing.lg },
  railStep: { flex: 1, gap: 6 },
  railBar: { height: 4, borderRadius: 2, backgroundColor: LINE },
  railDone: { backgroundColor: colors.trust },
  railNow: { backgroundColor: colors.action },
  railWord: { color: "rgba(247,243,250,0.42)", fontSize: scale.micro, textAlign: "center" },
  railWordNow: { color: colors.textPrimary, fontWeight: "800" },
  sectionHead: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { color: colors.textPrimary, fontSize: scale.section, fontWeight: "800", writingDirection: "rtl" },
  sectionCount: { color: colors.textSecondary, fontSize: scale.meta },
  sectionTitleSmall: { color: colors.textSecondary, fontSize: scale.meta, fontWeight: "800", textAlign: "right", marginBottom: spacing.sm, writingDirection: "rtl" },
  rowCard: { backgroundColor: CARD_SOFT, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: LINE },
});
