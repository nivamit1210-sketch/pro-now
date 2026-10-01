import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  formatMoney,
  money,
  type ProPresenceState,
  type WorldGeo,
  ROAD_PLATE_ASSET_ID,
} from "@pro-now/demo-types";

import { proTheme, radii, spacing, tabular, tint, type, scale } from "../theme";
import { MapSurface } from "../components/MapSurface";
import { WorldBackdrop } from "../components/livingmap/WorldBackdrop";
import type { WorldAssetSources } from "../components/livingmap/AssetSlot";

/** How tall the band at the top of this screen is. */
const MAP_BAND_HEIGHT = 172;
import { Mark, type MarkName } from "../components/marks";
import {
  briefingLines,
  readShift,
  type ShiftBriefing,
  type ShiftSnapshot,
} from "../shift-metrics";

/**
 * P01 — "המשמרת שלי". The professional's first screen, and the one they look
 * at most.
 *
 * It answers exactly two questions, and which one it answers depends on
 * whether the shift is running:
 *
 *   OFFLINE →  "is it worth going online right now?"
 *   ONLINE  →  "is this shift working?"
 *
 * Those are different screens wearing the same frame, which is why this is
 * one component with one honest switch rather than two screens the
 * professional has to find.
 *
 * WHY THIS SITS BESIDE `ProOnlineBody` RATHER THAN REPLACING IT.
 * `ProOnlineBody` is the map-first presence surface: where am I, am I live,
 * which services are armed. This is the numbers surface. Merging them
 * produces a screen where the single most consequential control in the
 * product — GO ONLINE — competes for attention with six figures, and the
 * control loses.
 *
 * THE THING THIS SCREEN REFUSES TO DO. Every marketplace app eventually
 * grows a "surge nearby!" banner, because it works: it gets people online.
 * It also, when the server never said any such thing, invents demand — which
 * /CLAUDE.md §3 forbids and which costs far more than it earns the first
 * time someone drives in and finds an empty evening. So the briefing renders
 * only lines the server actually supplied (`briefingLines`), the screen is
 * built to look correct with ZERO of them, and the fallback is the one
 * number nobody can dispute: what this professional themselves earned last
 * week.
 */

const colors = proTheme.colors;

const ONLINE_STATES: ProPresenceState[] = [
  "AVAILABLE",
  "OFFER_RECEIVED",
  "RESERVED",
  "ASSIGNED",
  "EN_ROUTE",
  "ARRIVED",
  "SERVICING",
  "COMPLETING",
];

export interface ShiftServiceChip {
  id: string;
  nameHe: string;
  mark: MarkName;
  live: boolean;
  /** He switched it off himself (as opposed to a missing document). */
  off?: boolean;
}

function ShiftClock({ baseMinutes, sinceMs = null, style }: { baseMinutes: number; sinceMs?: number | null; style: object }) {
  /* From the moment the shift began, to the second — it used to restart at whole minutes on every return. */
  const [start] = React.useState(() => sinceMs ?? Date.now() - Math.max(0, baseMinutes) * 60_000);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  const hh = String(Math.floor(sec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return <Text style={[style, { fontVariant: ["tabular-nums"] }]}>{hh}:{mm}:{ss}</Text>;
}

export interface ProShiftBodyProps {
  /** The city behind the status band, when the host can show it. Left out, the painted plate. */
  backdrop?: React.ReactNode;
  /** A real street plan, when there is one. See `WorldGround`. */
  geo?: WorldGeo | null;

  displayNameHe: string;
  /** His trade, under his name: "וטרינר עד הבית". */
  tradeHe?: string | null;
  presenceState: ProPresenceState;
  /** The live shift, as the server reports it. */
  shift: ShiftSnapshot;
  /** What the server knows about the area right now. Fields may be absent. */
  briefing?: ShiftBriefing;
  /** Services armed for this shift. */
  services: ShiftServiceChip[];
  /** Injected so the screen is deterministic in tests and in the gallery. */
  nowMs?: number;
  onToggleOnline?: () => void;
  /**
   * Not approved for work yet — the identity check or required documents
   * are missing (Amit, 2026-10-01: you may look around, you may not work).
   * The shift button gives way to what is missing and the way to finish it.
   */
  notApproved?: { missingHe: string; onFinish: () => void; /** For showing the app before the check is done (Amit, 2026-10-01). */ onDemoStart?: () => void } | null;
  /**
   * "פנוי בעוד XX דקות" — Amit, 2026-09-27: a professional finishing
   * another job can say when he will be free; to a customer he already
   * counts as available, with that wait inside his arrival time.
   * `availableAtMs` is when that is; null when not set.
   */
  availableAtMs?: number | null;
  /**
   * A price he named that the customer has not answered yet (quote-first
   * services): "₪450 · גרירת רכב". Shown above the online button.
   */
  pendingPriceHe?: string | null;
  onAvailableIn?: (minutes: number) => void;
  onCancelAvailableIn?: () => void;
  onOpenEarnings?: () => void;
  onManageServices?: () => void;
  /**
   * Where the professional sets what they charge.
   *
   * A separate door from "ניהול", which is about documents and
   * eligibility. The two get confused easily and they fail differently:
   * an unset price is fixed here in ten seconds, an expired insurance is
   * not fixed on a phone at all.
   */
  onOpenPricing?: () => void;
  /**
   * The map-forward presence screen — where am I, and am I on shift.
   *
   * A separate door from "שירותים", which is about which work you are
   * taking. "ניהול" used to mean this one while sitting beside the
   * service list, which is how a professional looking for the service
   * switches ended up somewhere about location.
   */
  onOpenPresence?: () => void;
  width?: number;
  height?: number;
  /**
   * The world's art. Absent, the band falls back to the abstract grid.
   * The professional's app carries the plate and nothing else — see its
   * `worldSources`.
   */
  worldSources?: WorldAssetSources;
  /** False holds the city still, for screenshots and tests. */
  animate?: boolean;
  /** Taller when the band shows his own shop. */
  bandHeight?: number;
}

export function ProShiftBody({
  backdrop,
  geo = null,
  displayNameHe,
  tradeHe = null,
  presenceState,
  shift,
  briefing,
  services,
  nowMs,
  onToggleOnline,
  notApproved = null,
  availableAtMs = null,
  pendingPriceHe = null,
  onAvailableIn,
  onCancelAvailableIn,
  onOpenEarnings: _onOpenEarnings,
  onManageServices,
  onOpenPricing,
  onOpenPresence: _onOpenPresence,
  width = 390,
  height = 780,
  worldSources,
  animate = true,
  bandHeight = MAP_BAND_HEIGHT,
}: ProShiftBodyProps) {
  const now = nowMs ?? Date.now();
  const reading = readShift(shift, now);
  const isOnline = ONLINE_STATES.includes(presenceState);
  const isTransitioning = presenceState === "STARTING_SHIFT" || presenceState === "ENDING_SHIFT";
  const liveServices = services.filter((s) => s.live);

  const lines = briefingLines(briefing ?? {});
  const [soonOpen, setSoonOpen] = useState(false);
  /*
   * A pack of one file is a complete world — see the professional app's
   * `worldSources`. What is NOT a world is an empty object, which is what
   * a build without the art has, so the plate itself is the test.
   */
  const hasWorld = Boolean(worldSources?.[ROAD_PLATE_ASSET_ID]);
  const money0 = (v: number | null) => (v === null ? "—" : formatMoney(money(v, "ILS")));

  return (
    <View style={[styles.screen, { width, height }]}>
      {/*
        * A quiet band with somewhere in it. Context, not the subject —
        * the numbers are.
        *
        * ---------------------------------------------------------------
        * THE ONE SCREEN IN THE PRODUCT THAT HAPPENED NOWHERE
        * ---------------------------------------------------------------
        * This was an abstract grey street grid. That was an honest
        * placeholder — the maps vendor is an open business decision
        * (/CLAUDE.md §4) and `MapSurface` carries no geography and says
        * so — and it is still the screen a professional opens every
        * morning. Their customer, standing on the same street, gets a
        * city with light in it; they got a wireframe.
        *
        * So when the art is there, the band is the same neighbourhood the
        * customer is looking at, from above, resting. It is not a map and
        * does not pretend to be: no position, no pin, no other
        * professionals — `WorldBackdrop` has nowhere to put any of those,
        * which is the same structural safeguard the customer's side
        * relies on. The state is still carried by the status line, which
        * is the only thing on here that is allowed to say anything.
        *
        * Without the art it is the grid, unchanged. A screen that renders
        * a blank rectangle when a file is missing is worse than the
        * placeholder it replaced.
        */}
      <View style={[styles.mapBand, { height: bandHeight }]}>
        {hasWorld ? (
          <>
            {backdrop ?? <WorldBackdrop
              width={width}
              height={MAP_BAND_HEIGHT}
              sources={worldSources}
              animate={animate}
              /*
               * The professional's city is the customer's city. It was
               * the last screen still on the painted plate, which is a
               * quieter version of the same drift: a plumber and the
               * person who called them looking at two different streets
               * with the same names.
               */
              geo={geo}
            />}
            {/*
              * The state, in words, over the city — with its own plate,
              * because the plate is lit paving and white type on lit
              * paving is not type. See `verify:a11y`'s artwork check.
              */}
            <View style={styles.worldStatus} pointerEvents="none">
              <Text style={styles.worldStatusText} numberOfLines={1}>
                {isOnline ? "במשמרת · מחכים לקריאה" : "מחוץ למשמרת"}
              </Text>
            </View>
            {/* No engineer's note over his shop (UX audit): the band is his storefront, not a map. */}
          </>
        ) : (
          <MapSurface
            colors={{ ...colors, action: colors.trust }}
            dark
            height={MAP_BAND_HEIGHT}
            pulsing={isOnline}
            statusText={isOnline ? "במשמרת · מחכים לקריאה" : "מחוץ למשמרת"}
            statusTopOffset={16}
          />
        )}
        <View style={styles.mapFade} pointerEvents="none" />
      </View>

      {/*
        * ------------------------------------------------------------------
        * ONE SCREEN, ONE DECISION.
        *
        * Amit: *"העמוד הזה עמוססססס — מלא מלל, מלא מלבנים."* It had five
        * boxes, three small links, a row of chips, a "פנוי בעוד" row and the
        * button, all competing — and two paragraphs addressed to engineers
        * ("המספרים מגיעים מהשרת…"). What is left: who you are, the shift
        * clock while you are on it, what you offer and at what price, and
        * the one button. The status is said once, in the band, in one
        * vocabulary: במשמרת / מחוץ למשמרת.
        * ------------------------------------------------------------------
        */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {displayNameHe}
            </Text>
            {tradeHe ? <Text style={styles.trade} numberOfLines={1}>{tradeHe}</Text> : null}
          </View>
          {isOnline ? <Beacon color={colors.trust} /> : null}
        </View>

        {isOnline ? (
          <View style={styles.live} accessibilityLiveRegion="polite">
            <Text style={styles.liveLabel}>זמן במשמרת</Text>
            <ShiftClock baseMinutes={reading.onlineMinutes} sinceMs={shift.onlineSinceMs} style={styles.bigValue} />
            <Text style={styles.liveSub}>
              {money0(reading.settledNetMinorUnits)} במשמרת ·{" "}
              {reading.completedJobs === 0 ? "עוד לא נסגרה עבודה" : reading.completedJobs === 1 ? "עבודה אחת" : `${reading.completedJobs} עבודות`}
              {reading.inProgressJobs > 0 ? " · יש עבודה פעילה" : ""}
            </Text>
          </View>
        ) : liveServices.length === 0 ? (
          <Text style={styles.blocked}>
            {services.some((x) => x.off) ? "כל השירותים כבויים · ״עריכה״ כדי להדליק" : "חסר אימות לשירותים · ״המסמכים שלי״"}
          </Text>
        ) : null}

        {/* The area, only when the server actually said something. */}
        {lines.length > 0 ? (
          <View style={styles.briefing}>
            {lines.map((l) => (
              <View key={l.kind} style={styles.briefRow}>
                <View style={[styles.briefDot, { backgroundColor: l.kind === "DEMAND" ? colors.action : colors.trust }]} />
                <Text style={styles.briefText}>{l.textHe}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* What he offers — the chips open the same place as "עריכה". */}
        <View style={styles.servicesHead}>
          <Text style={styles.servicesTitle}>
            השירותים שלי{services.length > 1 ? ` · ${liveServices.length}/${services.length} פתוחים` : ""}
          </Text>
          {onManageServices ? (
            <Pressable onPress={onManageServices} accessibilityRole="button" accessibilityLabel="עריכת השירותים" style={styles.manageHit}>
              <Text style={styles.manage}>עריכה ›</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.chips}>
          {services.map((s) => (
            <Pressable
              key={s.id}
              onPress={onManageServices}
              accessibilityRole="button"
              accessibilityLabel={`${s.nameHe} · ${s.live ? "פתוח לקריאות" : "סגור"}`}
              style={[styles.chip, { borderColor: s.live ? tint.trust(0.4) : colors.border, opacity: s.live ? 1 : 0.55 }]}
            >
              <Mark name={s.mark} size={16} color={s.live ? colors.trust : colors.textSecondary} />
              <Text style={[styles.chipText, { color: s.live ? colors.textPrimary : colors.textSecondary }]}>{s.nameHe}</Text>
            </Pressable>
          ))}
        </View>

        {onOpenPricing ? (
          <Pressable onPress={onOpenPricing} accessibilityRole="button" style={styles.rowLink}>
            <Text style={styles.rowLinkText}>המחירים שלי</Text>
            <Text style={styles.rowLinkChevron}>›</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* The one decision on this screen keeps its own space at the bottom. */}
      <View style={styles.ctaBar}>
        {pendingPriceHe ? (
          <View style={styles.pendingCard} accessibilityLiveRegion="polite">
            <Text style={styles.pendingTitle}>ההצעה נשלחה · {pendingPriceHe}</Text>
            <Text style={styles.soonSub}>מחכים לאישור הלקוח.</Text>
          </View>
        ) : null}
        {!isOnline && availableAtMs !== null ? (
          <View style={styles.soonCard}>
            <Text style={styles.soonTitle}>
              זמינות בעוד {Math.max(1, Math.round((availableAtMs - (nowMs ?? Date.now())) / 60_000))} דק׳
            </Text>
            <Text style={styles.soonSub}>ההמתנה כלולה בזמן ההגעה שהלקוח רואה.</Text>
            {onCancelAvailableIn ? (
              <Pressable onPress={onCancelAvailableIn} accessibilityRole="button" style={styles.soonCancel}>
                <Text style={styles.soonCancelText}>ביטול</Text>
              </Pressable>
            ) : null}
          </View>
        ) : !isOnline && onAvailableIn && liveServices.length > 0 && soonOpen ? (
          <View style={styles.soonRow}>
            {[15, 30, 45, 60].map((m) => (
              <Pressable
                key={m}
                onPress={() => { setSoonOpen(false); onAvailableIn(m); }}
                accessibilityRole="button"
                accessibilityLabel={`זמינות בעוד ${m} דקות`}
                style={({ pressed }) => [styles.soonChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.soonChipText}>{m} דק׳</Text>
              </Pressable>
            ))}
            {/* A way out without choosing (button audit). */}
            <Pressable onPress={() => setSoonOpen(false)} accessibilityRole="button" accessibilityLabel="ביטול" style={({ pressed }) => [styles.soonChip, pressed && { opacity: 0.8 }]}>
              <Text style={styles.soonChipText}>ביטול</Text>
            </Pressable>
          </View>
        ) : null}
        {notApproved && !isOnline ? (
          <View style={styles.locked}>
            <Text style={styles.lockedTitle}>עוד לא מאושר לעבודה</Text>
            <Text style={styles.lockedSub}>חסר: {notApproved.missingHe}</Text>
            <Pressable
              onPress={notApproved.onFinish}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cta, styles.ctaStart, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.ctaText, { color: colors.onAction }]}>השלמת הרישום</Text>
            </Pressable>
            {notApproved.onDemoStart ? (
              <Pressable onPress={notApproved.onDemoStart} accessibilityRole="button" style={styles.soonToggle}>
                <Text style={styles.soonToggleText}>התחלת משמרת להדגמה</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
        <Pressable
          onPress={onToggleOnline}
          disabled={isTransitioning || (!isOnline && liveServices.length === 0)}
          accessibilityRole="button"
          accessibilityLabel={isOnline ? "סיום משמרת" : "התחלת משמרת"}
          style={({ pressed }) => [
            styles.cta,
            isOnline ? styles.ctaEnd : styles.ctaStart,
            pressed && { opacity: 0.85 },
            (isTransitioning || (!isOnline && liveServices.length === 0)) && { opacity: 0.45 },
          ]}
        >
          <Text style={[styles.ctaText, { color: isOnline ? colors.textPrimary : colors.onAction }]}>
            {isTransitioning ? "רגע…" : isOnline ? "סיום משמרת" : "התחלת משמרת"}
          </Text>
        </Pressable>
        )}
        {!notApproved && !isOnline && onAvailableIn && liveServices.length > 0 && availableAtMs === null && !soonOpen ? (
          <Pressable onPress={() => setSoonOpen(true)} accessibilityRole="button" style={styles.soonToggle}>
            <Text style={styles.soonToggleText}>או: זמינות בעוד…</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Beacon({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={[
        styles.beacon,
        { backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  locked: { gap: 6 },
  lockedTitle: { color: colors.textPrimary, fontSize: scale.body, fontWeight: "900", textAlign: "center", writingDirection: "rtl" },
  lockedSub: { color: colors.textSecondary, fontSize: scale.meta, textAlign: "center", writingDirection: "rtl", marginBottom: 6 },
  screen: { backgroundColor: colors.bg, overflow: "hidden" },
  mapBand: { height: MAP_BAND_HEIGHT, overflow: "hidden" },
  worldStatus: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(11,9,24,0.78)",
  },
  worldStatusText: { ...type.caption, color: "#F7F3FA", writingDirection: "rtl" },
  worldNote: {
    position: "absolute",
    bottom: 6,
    alignSelf: "center",
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: "rgba(12,9,16,0.72)",
  },
  worldNoteText: { ...type.micro, color: "rgba(247,243,250,0.82)", writingDirection: "rtl" },
  mapFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    backgroundColor: colors.bg,
    opacity: 0.55,
  },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  headRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  headState: { ...type.overline },
  name: { ...type.h3, color: colors.textPrimary, textAlign: "right", flexShrink: 1 },
  trade: { ...type.body, color: colors.textSecondary, textAlign: "right", marginTop: 2 },
  live: { marginTop: spacing.lg, alignItems: "flex-end" },
  liveLabel: { ...type.overline, color: colors.trust, textAlign: "right" },
  liveSub: { ...type.body, color: colors.textSecondary, textAlign: "right", marginTop: 4, writingDirection: "rtl" },
  blocked: { ...type.body, color: colors.textSecondary, textAlign: "right", marginTop: spacing.lg, writingDirection: "rtl" },
  rowLink: { minHeight: 56, marginTop: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  rowLinkText: { ...type.bodyStrong, color: colors.textPrimary, textAlign: "right" },
  rowLinkChevron: { ...type.h3, color: colors.textSecondary },
  soonToggle: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  soonToggleText: { ...type.body, color: colors.textSecondary, textDecorationLine: "underline" },
  beacon: { width: 8, height: 8, borderRadius: 4 },

  bigCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  bigLabel: { ...type.overline, color: colors.textSecondary, textAlign: "right" },
  bigValue: { ...type.h1, ...tabular, color: colors.textPrimary, textAlign: "right", marginTop: 2 },
  bigSub: { ...type.caption, color: colors.textSecondary, textAlign: "right", marginTop: 6 },

  metrics: { flexDirection: "row-reverse", gap: spacing.md, marginTop: spacing.md },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: { ...type.overline, color: colors.textSecondary, textAlign: "right" },
  metricValue: { ...type.h2, ...tabular, textAlign: "right", marginTop: 2 },
  metricSub: { ...type.caption, color: colors.textSecondary, textAlign: "right", marginTop: 4 },

  util: { marginTop: spacing.md },
  utilTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: "hidden" },
  utilFill: { height: 6, borderRadius: 3, backgroundColor: colors.trust },
  utilText: { ...type.caption, color: colors.textSecondary, textAlign: "right", marginTop: 6 },

  briefing: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  briefRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  briefDot: { width: 7, height: 7, borderRadius: 4 },
  briefText: { ...type.body, color: colors.textPrimary, textAlign: "right", flexShrink: 1 },
  briefNote: { ...type.caption, color: colors.textSecondary, textAlign: "right" },

  servicesHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  servicesTitle: { ...type.overline, color: colors.textSecondary },
  manageHit: { minHeight: 44, minWidth: 64, justifyContent: "center", alignItems: "flex-start" },
  manage: { ...type.overline, color: colors.actionText },

  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
    minHeight: 36,
  },
  chipText: { ...type.caption },

  earningsLink: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  earningsLinkText: { ...type.body, color: colors.textPrimary },

  soonRow: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  soonLabel: { color: "rgba(247,243,250,0.75)", fontSize: scale.meta, writingDirection: "rtl" },
  soonChip: { minHeight: 48, minWidth: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "rgba(247,243,250,0.3)" },
  soonChipText: { color: "#F7F3FA", fontSize: scale.meta, fontWeight: "700" },
  soonCard: { padding: 12, borderRadius: 16, backgroundColor: "rgba(47,191,138,0.14)", marginBottom: 10 },
  pendingCard: { padding: 12, borderRadius: 16, backgroundColor: "rgba(255,154,107,0.16)", marginBottom: 10 },
  pendingTitle: { color: "#FFB896", fontSize: scale.body, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  soonTitle: { color: "#7FE3BC", fontSize: scale.body, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  soonSub: { color: "rgba(247,243,250,0.8)", fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 2 },
  soonCancel: { alignSelf: "flex-start", marginTop: 6, paddingVertical: 4, paddingHorizontal: 10 },
  soonCancelText: { color: "#F7F3FA", fontSize: scale.meta, textDecorationLine: "underline" },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: { minHeight: 56, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  ctaStart: { backgroundColor: colors.action },
  ctaEnd: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  ctaText: { ...type.bodyStrong },
});
