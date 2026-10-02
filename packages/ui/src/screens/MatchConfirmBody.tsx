import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { EtaView, PriceQuoteView } from "@pro-now/types";

import { BackButton } from "../components/BackButton";
import { customerDarkTheme, depth, palette, radii, scale, spacing, tabular, tint, type } from "../theme";
import { priceExplainer } from "../pricing-copy";
import { Glow } from "../components/Glow";
import { MatchReveal } from "../components/MatchReveal";
import { LiveField } from "../components/LiveField";
import { PresenceRing, type PresenceState } from "../components/PresenceRing";
import { ProviderPortrait } from "../components/ProviderPortrait";
import { VoiceNote } from "../components/VoiceNote";
import { RtlRow } from "../components/RtlRow";
import { ImageSlot } from "../components/surfaces";
import { ShieldCheckMark, StarMark } from "../components/marks";

/**
 * C-PF — the personal match. PRO NOW's one WOW moment.
 *
 * WHY THIS SCREEN EXISTS. Dispatch normally chooses for the customer, and
 * that is a feature: being handed a directory while your kitchen fills with
 * water is a burden. But when someone is coming to cut your hair or work on
 * your body in your own home, the person IS the service, and "anyone
 * competent" answers a question nobody asked.
 *
 * THE REDESIGN, AND WHY. The first version was a profile page — heading,
 * small round avatar, three green chips, a row of little cards. ChatGPT's
 * verdict was exact: "זה נקי, אבל זה מרגיש כמו אפליקציית שירותים מ-2022.
 * אין פה עדיין את התחושה שהמערכת החכמה מצאה לי עכשיו את האדם הנכון." The
 * problem was never the colours; it was the composition. A profile page
 * says "here is a person, you decide". This screen has to say "we looked,
 * and here is who".
 *
 * So: one full-bleed surface instead of a card stack. The name at display
 * size. The facts on ONE line rather than three chips. The ETA promoted to
 * the second-largest thing on the screen, because "how soon" is half the
 * decision. And the portfolio edge-to-edge with the next image peeking,
 * because for a barber the work IS the argument.
 *
 * "WHY THIS MATCH" — THE PART THAT MATTERS MOST. ChatGPT: "ה-AI צריך
 * להופיע דרך ההסבר, לא דרך המילה AI." The screen never says "AI". It
 * states the actual reasons this person was proposed — a declared
 * specialty that matches what the customer asked for, being online now,
 * the distance. Every reason is a fact the server can stand behind; the
 * caller assembles them, so an invented one would have to be written down
 * somewhere a person can see it. A "97% match" score would be exactly the
 * fabricated capability (/CLAUDE.md §3) this product cannot afford.
 *
 * AND WHAT IT STILL WILL NOT DO. No photorealistic portrait. ChatGPT asked
 * for real photography and it is right about the feel — but a photographic
 * face on a proposed professional asserts that this specific person exists
 * and is free right now, which is fabricated supply. The composition is the
 * one it asked for; the portrait stays illustrated until there are licensed
 * photographs of real, signed-up professionals to put in it.
 */

/**
 * DARK THROUGHOUT.
 *
 * The hero was dark and everything under it ivory, which put a hard light
 * seam across the middle of the one screen in the product that is supposed
 * to feel like a single moment. The board Amit chose renders this screen
 * dark end to end, and now that the customer app is dark by default (see
 * CustomerHomeBody) there is nothing left arguing for the seam.
 */
const colors = customerDarkTheme.colors;

/**
 * "דניאל כהן" → "דניאל". The heading asks "למה דווקא דניאל?" and a full
 * legal name there sounds like a form, not like someone being introduced.
 */
function firstName(nameHe: string): string {
  return nameHe.replace(/[()[\]]/g, "").trim().split(/\s+/)[0] ?? nameHe;
}

export interface PortfolioItem {
  id: string;
  uri: string | null;
  captionHe: string;
}

/**
 * One stated reason this person was proposed. Facts only.
 *
 * TWO LINES, NOT ONE PHRASE. These rendered as four short phrases separated
 * by dots — "מוסמך לתקלה · זמין עכשיו · 8 דקות ממך · 214 עבודות" — and the
 * review's verdict was that it reads as telemetry: "נכון מוצרית אבל עדיין
 * מרגיש קצת כמו feature explanation… פתאום אנחנו מספרים סיפור במקום להציג
 * telemetry."
 *
 * So each reason carries a claim and the evidence under it:
 *
 *     מתמחה בדיוק במה שביקשתם
 *     תספורות גבר ופייד
 *
 * `textHe` is the claim, `detailHe` the evidence. Both come from the
 * caller, which means both are things the server can stand behind — and a
 * percentage match score, which is the obvious thing to put here, is
 * exactly the fabricated capability this product cannot afford
 * (/CLAUDE.md §3).
 */
export interface MatchReason {
  id: string;
  textHe: string;
  /** The fact underneath the claim. Optional; absent renders one line. */
  detailHe?: string | null;
  kind: "SKILL" | "LIVE" | "DISTANCE" | "HISTORY";
}

export interface MatchConfirmBodyProps {
  serviceNameHe: string;
  displayNameHe: string;
  /** The professional asked to be addressed in the feminine (addressAs "F"): מגיעה, זמינה. */
  professionalFemale?: boolean;
  /** "ספרית עד הבית · תספורות ועיצוב" — the line under the name. */
  headlineHe: string;
  /**
   * The professional's approved photo. Null until a real, signed-up
   * professional has uploaded one — and then it fills this same space, so
   * the composition does not change on the day it arrives.
   */
  photoUri?: string | null;
  portfolio: PortfolioItem[];
  /**
   * THEIR PLACE, FROM INSIDE IT.
   *
   * Amit: *"ממש שינוי מצלמה לתוך החנות, שינוי פריים... שיראו את כל
   * הפרטים של החנות מבפנים."*
   *
   * On the map that is a camera move (see the INTERIOR beat in
   * `arrival-journey.ts`). Here it is a picture, because this screen is
   * already a card about one person — and it is the only screen in the
   * product where somebody is deciding whether to let a stranger into
   * their home, so what their place actually looks like is not
   * decoration.
   *
   * Full width at the top, above the name. Absent for a trade whose
   * inside has not been drawn, and nothing stands in: a borrowed
   * interior is a claim about somebody's business.
   */
  shopInteriorUri?: string | null;
  /** Why this person, in the server's own facts. Empty renders nothing. */
  reasons: MatchReason[];
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  credentialsHe: string[];
  eta: EtaView | null;
  /** "22:48" — arrival clock time, computed by the caller from the ETA. */
  arrivalClockHe: string | null;
  price: PriceQuoteView;
  /**
   * Whether this professional is online right now, already assigned, or
   * neither. Drives the ring around the portrait, and it is passed rather
   * than assumed: a ring that always says "available" is a fabricated
   * availability claim (/CLAUDE.md §3).
   */
  presence?: PresenceState;
  /**
   * The spring-in. False for reduced motion, and false when this body is
   * re-rendered for a reason other than the match arriving — replaying an
   * arrival that did not happen is the same class of lie as a pulse that
   * outlives its state (§7).
   */
  animateReveal?: boolean;
  /** "זמין עכשיו". Omit to render the ring without a chip. */
  presenceLabelHe?: string | null;
  /**
   * A message this professional recorded for THIS request. There is no
   * stock-introduction variant — see VoiceNote for why.
   */
  voiceNote?: {
    seconds: number;
    transcriptHe?: string | null;
    playing?: boolean;
    onTogglePlay?: () => void;
  } | null;
  /** Whether another proposal exists at all. The count is deliberately hidden. */
  hasAlternative: boolean;
  onAccept?: () => void;
  onAnother?: () => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function MatchConfirmBody({
  serviceNameHe,
  displayNameHe,
  headlineHe,
  photoUri,
  portfolio,
  shopInteriorUri = null,
  reasons,
  ratingAverage,
  ratingCount,
  completedJobs,
  credentialsHe,
  eta,
  arrivalClockHe,
  price,
  presence = "ONLINE",
  animateReveal = true,
  professionalFemale = false,
  presenceLabelHe = professionalFemale ? "זמינה עכשיו" : "זמין עכשיו",
  voiceNote,
  hasAlternative,
  onAccept,
  onAnother,
  onBack,
  width = 390,
  height = 780,
}: MatchConfirmBodyProps) {
  const explain = priceExplainer(price, { proFirstNameHe: displayNameHe.split(" ")[0] });
  const etaMinutes = eta ? Math.round(eta.etaSeconds / 60) : null;
  /*
   * The hero is sized around the portrait rather than the other way round.
   * "פי 2–3 יותר נוכחות" is a size, not a proportion of the viewport, and
   * on a short phone the portrait has to shrink before the screen does.
   */
  const portraitSize = Math.min(Math.round(width * 0.62), Math.round(height * 0.3));
  const heroH = portraitSize + 150;

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* ---------------- Hero: one surface, edge to edge ---------------- */}
        {/*
          * THE HERO IS THE LIVE FIELD, NOT A PORTRAIT BLOWN UP.
          *
          * The first attempt at this composition filled it with the
          * illustrated portrait at 380px, and at that size an illustration
          * stops reading as a considered placeholder and starts reading as
          * a cartoon — the exact "avatar מצויר" ChatGPT said undermines the
          * premium feel. But the alternative it asked for, a photographic
          * face, asserts that this specific person exists and is free right
          * now: fabricated supply (/CLAUDE.md §3).
          *
          * So the surface is the brand's own live field — dark, quiet,
          * with one presence resolving out of it — and the portrait sits ON
          * it at a size an illustration can carry. The composition is the
          * one that was asked for. The photograph waits for a real,
          * signed-up professional who has agreed to be photographed.
          */}
        <View style={[styles.hero, { height: heroH }]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LiveField state="MATCHED" width={width} height={heroH} tone="dark" />
            {/*
              * The light is ON the person. Everything above this line was
              * already correct and still read flat, because a dark shadow
              * cast into a dark room is nothing — see components/Glow.tsx.
              * One soft source behind the portrait is what turns a circle
              * on black into someone standing in a lit doorway.
              */}
            <Glow
              color={presence === "ONLINE" ? "trust" : "signal"}
              width={width}
              height={heroH}
              intensity={0.16}
              originY={0.58}
              spread={0.62}
            />
          </View>

          <BackButton onPress={onBack} tone="dark" placement="absolute" />

          <View style={styles.heroTop}>
            <Text style={styles.brandMark}>PRO NOW MATCH</Text>
            <Text style={styles.brandSub}>נמצאה התאמה לבקשה שלך · {serviceNameHe}</Text>
          </View>

          {/*
            * THE PERSON IS THE HERO — the one change asked for by name.
            *
            * The portrait was 132px, floating on the field above a block of
            * text, and the note was that the screen "מסביר לי את ההתאמה
            * לפני שאני מרגיש את האדם": everything needed to decide was
            * present and none of it felt like meeting someone.
            *
            * At this size the portrait IS the composition, and the ring
            * puts the one urgent fact — he is online and can leave now — on
            * the person instead of in a chip beside them. Everything else
            * moved below.
            *
            * The monogram still stands in for a face (§8): a photographic
            * portrait on a professional who has not been assigned asserts
            * that this specific person exists and is free right now. When a
            * real signed-up professional has an approved photo it fills
            * exactly this space and nothing else about the screen changes.
            */}
          {/*
            * THE ARRIVAL. Amit: "ברגע שמוצא מקצוען שיהיה אווירה של מצאנו
            * מישהו… אפקט שנותן הרגשה של זכייה. התמונת פרופיל של הבן אדם
            * והמקצוע חשובים מאוד שיקפצו ישר."
            *
            * So the portrait springs in rather than appearing, and the
            * name and trade follow a beat later. The stagger is the point:
            * it is what makes the screen read as someone arriving instead
            * of as a view being rendered. MatchReveal has the full note.
            */}
          <View style={styles.heroFill} pointerEvents="none">
            <MatchReveal
              revealed
              animate={animateReveal}
              width={width}
              portrait={
                <PresenceRing state={presence} size={portraitSize} labelHe={presenceLabelHe}>
                  <ProviderPortrait
                    photoUri={photoUri}
                    displayNameHe={displayNameHe}
                    size={portraitSize}
                    shape="circle"
                    tone="dark"
                  />
                </PresenceRing>
              }
            />
          </View>
        </View>

        {/* ----------------------------------------------------------------
            THEIR PLACE. See `shopInteriorUri`.

            Under the portrait and above the name: you have seen who, and
            the next question a person asks about letting somebody into
            their home is what their place looks like.
            ---------------------------------------------------------------- */}
        {shopInteriorUri ? (
          <Image
            source={{ uri: shopInteriorUri }}
            style={styles.interior}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`בתוך העסק של ${displayNameHe}`}
          />
        ) : null}

        {/* ---------------- Who ---------------- */}
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {displayNameHe}
          </Text>
          <Text style={styles.headline} numberOfLines={1}>
            {headlineHe}
          </Text>

          {/*
            * ONE line of facts, not three chips. Three green pills read as
            * decoration and gave a rating, a job count and a verification
            * equal weight, which they do not have.
            */}
          <View style={styles.factLine}>
            {ratingAverage !== null ? (
              <>
                <StarMark size={13} />
                <Text style={styles.factText}>
                  {ratingAverage.toFixed(1)} ({ratingCount})
                </Text>
                <Text style={styles.factDot}>•</Text>
              </>
            ) : (
              <>
                <Text style={styles.factText}>חדש ב-PRO NOW</Text>
                <Text style={styles.factDot}>•</Text>
              </>
            )}
            <Text style={styles.factText}>
              {completedJobs === 1 ? "עבודה אחת" : `${completedJobs} עבודות`}
            </Text>
            {credentialsHe.length > 0 ? (
              <>
                <Text style={styles.factDot}>•</Text>
                <ShieldCheckMark size={13} color={palette.trust300} />
                <Text style={styles.factVerified}>PRO VERIFIED</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ---------------- When ---------------- */}
        {/*
          * A PANEL, NOT A ROW. "מתי הוא מגיע" is half the decision on this
          * screen and it was set as loose text on the background, which on
          * a dark surface means it had no more presence than the caption
          * under it. The panel is raised the only way a dark surface can
          * be: a lighter fill with a lit top edge (theme `depth`), plus one
          * dim glow behind the number itself.
          */}
        <View style={styles.when}>
          <Glow color="signal" width={width - spacing.lg * 2} height={112} intensity={0.1} originY={0.5} spread={0.5} />
          <Text style={styles.whenLead}>{professionalFemale ? "מגיעה אליך בעוד" : "מגיע אליך בעוד"}</Text>
          <Text style={styles.whenValue}>
            {etaMinutes === null ? "—" : `${etaMinutes} דקות`}
          </Text>
          <Text style={styles.whenSub}>
            {etaMinutes === null
              ? "זמן ההגעה טרם חושב"
              : arrivalClockHe
                ? `הגעה משוערת: ${arrivalClockHe}`
                : eta?.isRouteBased
                  ? "זמן נסיעה בפועל"
                  : "זמן נסיעה משוער"}
          </Text>
        </View>

        {/* ---------------- Why this match ---------------- */}
        {reasons.length > 0 ? (
          <View style={styles.why}>
            {/* "למה דווקא דניאל?" — about the person, not about the feature. */}
            <Text style={styles.whyTitle}>למה דווקא {firstName(displayNameHe)}?</Text>
            {reasons.slice(0, 3).map((r) => (
              <View key={r.id} style={styles.whyItem}>
                <View
                  style={[
                    styles.whyDotMark,
                    {
                      backgroundColor:
                        r.kind === "LIVE" ? tint.action(0.16) : tint.trust(0.16),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.whyDotCore,
                      { backgroundColor: r.kind === "LIVE" ? colors.action : palette.trust300 },
                    ]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.whyClaim}>{r.textHe}</Text>
                  {r.detailHe ? <Text style={styles.whyDetail}>{r.detailHe}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ---------------- What he said ---------------- */}
        {voiceNote ? (
          <View style={styles.voice}>
            <VoiceNote
              kind="JOB_MESSAGE"
              speakerNameHe={displayNameHe}
              speakerPhotoUri={photoUri}
              transcriptHe={voiceNote.transcriptHe}
              seconds={voiceNote.seconds}
              playing={voiceNote.playing}
              onTogglePlay={voiceNote.onTogglePlay}
              tone="dark"
              width={width - spacing.lg * 2}
            />
          </View>
        ) : null}

        {/* ---------------- The work ---------------- */}
        {portfolio.length > 0 ? (
          <View style={styles.workBlock}>
            <Text style={styles.workTitle}>העבודות שלה</Text>
            {/*
              * Edge to edge, with the next image peeking. Cards around
              * photographs put a frame between the customer and the only
              * thing on this screen that actually answers "will I like
              * what I get".
              */}
            <RtlRow gutter={spacing.lg} contentContainerStyle={{ gap: spacing.sm }}>
              {portfolio.map((w, i) => (
                <View key={w.id} style={[styles.work, i === 0 && styles.workFirst]}>
                  <ImageSlot uri={w.uri} subject={w.captionHe} ratio={i === 0 ? 3 / 4 : 1} colors={colors} radius={radii.lg} dark />
                </View>
              ))}
            </RtlRow>
            <Text style={styles.workNote}>העבודות פורסמו באישור הלקוחות שבהן.</Text>
          </View>
        ) : null}

        {/* ---------------- What it costs ---------------- */}
        <View style={styles.price}>
          <Text style={styles.priceValue}>{explain.headline}</Text>
          <Text style={styles.priceDetail}>{explain.detail}</Text>
        </View>

        {credentialsHe.length > 0 ? (
          <View style={styles.creds}>
            {credentialsHe.map((c) => (
              <View key={c} style={styles.credRow}>
                <ShieldCheckMark size={14} color={colors.trust} />
                <Text style={styles.credText}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* ---------------- Decide ---------------- */}
      <View style={styles.cta}>
        <Pressable
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel={`שליחת ${displayNameHe} אליי`}
          style={({ pressed }) => [styles.accept, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.acceptText}>כן, שלחו אותה אליי</Text>
          {etaMinutes !== null ? (
            <Text style={styles.acceptSub}>הגעה משוערת: {etaMinutes} דקות</Text>
          ) : null}
        </Pressable>

        {hasAlternative ? (
          /*
            * No count. "נותרו 2" turns a match into a countdown and reads
            * as e-commerce scarcity — the opposite of the calm this screen
            * needs. Whether another exists is enough.
            */
          <Pressable onPress={onAnother} accessibilityRole="button" style={styles.another}>
            <Text style={styles.anotherText}>רוצה לראות התאמה אחרת?</Text>
          </Pressable>
        ) : (
          <Text style={styles.exhausted}>זו ההתאמה שיש כרגע באזור שלך.</Text>
        )}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden" },

  hero: { backgroundColor: palette.night900, overflow: "hidden", alignItems: "center" },
  /*
   * IN THE FLOW, NOT ABSOLUTELY POSITIONED. The overline and the portrait
   * were both absolute over the same field and duly landed on top of each
   * other: "PRO NOW MATCH" ran under the portrait and off the right edge.
   * The hero is a column now, which is also why the portrait can be sized
   * from the viewport without anything else needing to be told.
   */
  heroFill: { alignItems: "center", justifyContent: "center", flex: 1 },
  /*
   * A quiet glyph, not a white puck. At 44px of near-opaque ivory it was
   * the brightest object on a dark screen whose entire job is to make one
   * person the brightest object on it.
   */

  heroTop: { alignSelf: "stretch", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, alignItems: "center" },
  brandMark: { ...type.microStrong, color: palette.signal300, letterSpacing: 1.8 },
  brandSub: {
    ...type.meta,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: 4,
  },
  brandSubUnused: {
    ...type.caption,
    fontSize: scale.micro,
    color: "rgba(255,255,255,0.86)",
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
  },

  /*
   * The identity moved off the hero and onto the light surface under it.
   * Over a portrait this size, text laid on the same surface competes with
   * the face for the first look — and the whole change was to make the
   * person the first look.
   */
  interior: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: spacing.md,
  },
  who: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, alignItems: "center" },
  name: { ...type.title, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  headline: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: 2,
  },
  factLine: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  factText: { ...type.metaStrong, ...tabular, color: colors.textPrimary },
  factVerified: { ...type.microStrong, color: colors.trust },
  factDot: { color: colors.textSecondary, fontSize: scale.micro },

  when: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: depth.panel.mid,
    alignItems: "center",
    overflow: "hidden",
    ...depth.litEdge(0.08),
  },
  whenLead: { ...type.meta, color: colors.textSecondary, writingDirection: "rtl" },
  /* The one hero-sized number on this screen (§1). */
  whenValue: { ...type.hero, ...tabular, color: colors.textPrimary, writingDirection: "rtl", marginTop: 2 },
  whenSub: { ...type.meta, ...tabular, color: colors.textSecondary, writingDirection: "rtl", marginTop: 4 },

  why: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: depth.panel.low,
    gap: spacing.lg,
    ...depth.litEdge(0.05),
  },
  whyTitle: {
    ...type.section,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  whyItem: { flexDirection: "row-reverse", gap: spacing.md, alignItems: "flex-start" },
  whyDotMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  whyDotCore: { width: 9, height: 9, borderRadius: 5 },
  whyClaim: {
    ...type.bodyStrong,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  whyDetail: {
    ...type.meta,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 1,
  },

  voice: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  workBlock: { marginTop: spacing.xxl },
  workTitle: {
    ...type.overline,
    color: colors.textSecondary,
    textAlign: "right",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  work: { width: 132 },
  workFirst: { width: 208 },
  workNote: {
    ...type.caption,
    fontSize: scale.micro,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },

  price: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, alignItems: "flex-end" },
  priceValue: { ...type.h1, ...tabular, color: colors.textPrimary, writingDirection: "rtl" },
  priceDetail: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
    lineHeight: 19,
  },

  creds: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 2 },
  credRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 30 },
  credText: { ...type.caption, fontSize: scale.micro, color: colors.textSecondary, writingDirection: "rtl" },

  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accept: {
    minHeight: 62,
    borderRadius: radii.lg,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  acceptText: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  acceptSub: { ...type.caption, fontSize: scale.micro, color: colors.onAction, opacity: 0.78 },
  another: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 6 },
  anotherText: { ...type.caption, fontSize: scale.meta, color: colors.textSecondary, writingDirection: "rtl" },
  exhausted: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
});
