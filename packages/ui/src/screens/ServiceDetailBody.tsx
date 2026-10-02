import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { PriceQuoteView, VisitTermsHe } from "@pro-now/types";

import { AddressLine } from "../components/AddressLine";
import { BackButton } from "../components/BackButton";
import { customerDarkTheme, depth, elevation, radii, scale, spacing, tabular, tint, type } from "../theme";
import { priceExplainer } from "../pricing-copy";
import { ClockMark, Mark, type MarkName, ShieldCheckMark } from "../components/marks";
import { SectionHeader, Surface } from "../components/surfaces";

/**
 * C04 — the service page, reached from the home catalogue and shown before
 * the customer asks for anyone to come.
 *
 * Its whole job is to make the commitment legible BEFORE dispatch starts,
 * because once a professional accepts, someone has left to drive to this
 * address. So it answers three questions in order: what am I paying, what
 * is included, and what happens the moment I press the button.
 *
 * SYMPTOMS ARE SELECTABLE, NOT PROSE. The description used to end with a
 * comma-separated list — "הפסקת חשמל מקומית, ממסר פחת שקופץ, שקע שאינו
 * עובד" — and the first person to read it asked what those options meant.
 * They were right to: a list of concrete cases reads as a set of choices,
 * and if tapping one does nothing the screen has lied about its own
 * affordance.
 *
 * Making them real chips is also the better product. The job row already has
 * a `structuredAnswers` column (/docs/05-DATABASE.md); filling it at the
 * only moment the customer actually knows the answer means the professional
 * arrives knowing whether it is one dead socket or the whole flat, and can
 * bring the right part instead of a second visit.
 *
 * Honesty rules:
 * - Pricing copy is derived from the server's `PriceQuoteView` by
 *   `priceExplainer()` below. Each model explains its own shape; no model
 *   is described as "fixed" unless it is.
 * - `availableNowCount` is real supply or it is absent. A missing count
 *   renders as a missing count, never as "זמין עכשיו" — the ONLINE-FIRST
 *   promise is the one thing this product cannot fake (/CLAUDE.md §3).
 * - No ETA is promised here. Travel time depends on who accepts, and
 *   nobody has accepted yet.
 */

/**
 * DARK, AND SHORTER. Two rounds of feedback landed on this screen at once.
 *
 * It was still ivory after the customer app went dark, which made the
 * ordering step the one light interruption in a dark flow — and not for
 * the reason light is allowed (§0: a surface you touch or read closely).
 *
 * And Amit on the copy: "לא צריך מלא מלא מלל, צריך ממוקד ונגיש." He is
 * right, and the count is the argument: before the first tappable thing
 * this screen showed a hero placeholder, a title, a description, a supply
 * pill, a section heading, and a note under the chips. Six blocks to say
 * "what's wrong?" — on a screen a person opens because water is coming out
 * of something.
 */
const colors = customerDarkTheme.colors;

export { priceExplainer };

export interface ServiceDetailBodyProps {
  /** Where this order goes (undefined: the line is not shown; null: none chosen yet). */
  orderAddressHe?: string | null;
  orderForHe?: string | null;
  onChangeAddress?: () => void;
  nameHe: string;
  mark: MarkName;
  /** What the licensed hero photograph shows. */
  photoSubject: string;
  photoUri?: string | null;
  descriptionHe: string;
  /**
   * Concrete cases the customer can tap. Optional: a service with no useful
   * distinctions should not invent them just to fill the screen.
   */
  symptomsHe?: string[];
  /** A price-list service: its cheapest line, for "מחירון · החל מ־₪X". */
  priceListFromMinorUnits?: number | null;
  /** Priced by the professional before he sets off (towing, moving, painting…). */
  quoteBeforeDispatch?: boolean;
  /** The trade's words for a visit (`visitTermsHe`): a vet's "הטיפול", a plumber's "התיקון". */
  visitTerms?: VisitTermsHe;
  /** What the visit covers. Facts from the catalogue, not marketing. */
  includedHe: string[];
  /** What it explicitly does not cover — prevents the dispute, later. */
  notIncludedHe: string[];
  price: PriceQuoteView;
  /** Real count of professionals ONLINE and eligible right now, or null. */
  availableNowCount: number | null;
  /** Credentials required for this service, per /CLAUDE.md §3. */
  requiredCredentialsHe: string[];
  /**
   * The service is modelled and visible but not launched.
   *
   * Without this the page fell through to the unknown-supply path and
   * offered "בדיקה מחדש" — a button promising to re-run a supply query that
   * will never run, because nothing dispatches this service yet. Offering a
   * retry for a state that cannot change is a small, repeatable lie.
   */
  comingSoon?: boolean;
  /**
   * Work that is booked for a time, not dispatched now (painting, tiling,
   * mounting a TV). Ordering for a chosen time is the agreed next stage
   * (ROADMAP, 2026-09-27), so until it is built the page says so plainly
   * instead of dispatching somebody "now" to lay tiles.
   */
  scheduledOnly?: boolean;
  /**
   * Receives the tapped symptoms and anything typed beside them.
   *
   * The chips were the ONLY vocabulary this screen had, and a closed list
   * of five cases is not a vocabulary — Amit, looking at the computer
   * technician page: *"בתוך הקטגוריות חסרה האפשרות לטקסט חופשי."* He is
   * right, and the chips' own note admits it: "זה מה שעוזר למקצוען להגיע
   * מוכן". A person whose problem is the sixth thing had no way to help
   * anybody arrive prepared.
   *
   * The note travels with the symptoms rather than replacing them, and
   * lands in the describe screen's own box so nothing typed here is
   * retyped there.
   */
  onRequestNow?: (symptomsHe: string[], noteHe: string) => void;
  /** Re-runs the supply query. The honest action when nobody is online. */
  onRecheck?: () => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function ServiceDetailBody({
  orderAddressHe,
  orderForHe = null,
  onChangeAddress,
  nameHe,
  mark,
  photoSubject: _photoSubject,
  photoUri: _photoUri = null,
  descriptionHe,
  symptomsHe = [],
  includedHe,
  notIncludedHe,
  price,
  availableNowCount,
  requiredCredentialsHe,
  comingSoon: comingSoonIn,
  scheduledOnly = false,
  priceListFromMinorUnits = null,
  quoteBeforeDispatch = false,
  visitTerms,
  onRequestNow,
  onRecheck,
  onBack,
  width = 390,
  height = 780,
}: ServiceDetailBodyProps) {
  const explainer = priceExplainer(price, { stage: "service", listFromMinorUnits: priceListFromMinorUnits, quoteFirst: quoteBeforeDispatch, terms: visitTerms });
  const comingSoon = comingSoonIn || scheduledOnly;
  /*
   * Unknown is not zero. The page says "נבדוק זמינות כששולחים" when the
   * server has not reported this service — and offered no way to send, so
   * the promise led nowhere. Unknown dispatches and the search checks;
   * only a reported zero stops here.
   */
  const canDispatch = !comingSoon && (availableNowCount === null || availableNowCount > 0);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (sx: string) =>
    setPicked((cur) => (cur.includes(sx) ? cur.filter((x) => x !== sx) : [...cur, sx]));

  /*
   * WHETHER THIS SCREEN MAY ASK FOR ANYTHING AT ALL.
   *
   * The chips were shown on every service page including the ones that
   * cannot be requested — the computer technician's page in Amit's
   * screenshot says "השירות ייפתח בקרוב" and its only button is "חזרה",
   * and above it five chips invited you to describe your problem under a
   * note promising it "עוזר למקצוען להגיע מוכן". Nothing was collected.
   * There is no professional and no request to attach it to.
   *
   * So asking is tied to there being somewhere for the answer to go. A
   * question whose answer is discarded is worse than no question, and
   * adding a free-text box beside those chips would have made it twice
   * as convincing and no more true.
   *
   * When this service opens, `canDispatch` becomes true and the block
   * comes back with the box in it — nothing here needs changing.
   */
  const mayAsk = canDispatch;

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ----------------------------------------------------------
            ONE HEADER. The hero was a full-bleed grey hatched rectangle
            standing in for a photograph nobody has commissioned, at a
            third of the screen — a placeholder that large does not read as
            "photo pending", it reads as broken. And the back control and
            the service mark were two overlapping discs in the same corner.

            What is left is the mark, the name, one line, and the supply
            fact. Everything that is not one of those four was explaining
            the screen to the person already looking at it.
            ---------------------------------------------------------- */}
        <View style={styles.head}>
          <BackButton onPress={onBack} tone={"dark"} placement="inline" />

          <View style={styles.markWrap}>
            <Mark name={mark} size={26} color={colors.textPrimary} />
          </View>

          <Text style={styles.title}>{nameHe}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {descriptionHe}
          </Text>
          {orderAddressHe !== undefined ? <AddressLine addressHe={orderAddressHe} forHe={orderForHe} onChange={onChangeAddress} /> : null}

          {/* Supply — real or absent, never implied. */}
          {availableNowCount === null ? (
            <Text style={styles.supplyQuiet}>
              {scheduledOnly ? "שירות בתיאום מראש — ההזמנה לשעה שתבחרו נפתחת בקרוב" : comingSoon ? "השירות ייפתח בקרוב" : "נבדוק זמינות כששולחים"}
            </Text>
          ) : availableNowCount === 0 ? (
            <Text style={[styles.supplyQuiet, { color: colors.statusWarningText }]}>
              אין פנויים באזור שלך כרגע
            </Text>
          ) : (
            <View style={styles.supplyRow}>
              <View style={styles.dot} />
              <Text style={styles.supplyLive}>
                {availableNowCount === 1 ? "אחד פנוי עכשיו" : `${availableNowCount} פנויים עכשיו`}
              </Text>
            </View>
          )}
        </View>

        {/* ---------------- What's actually happening ----------------
            Only when there is something to tick. With no chips (Amit,
            2026-09-29: words, a recording, a photo) the next screen is
            where the words go, and a box here asked the same thing twice. */}
        {mayAsk && symptomsHe.length > 0 ? (
          <View style={styles.block}>
            {/*
              * Neutral, because this page is shared by every service.
              * "מה קורה אצלך?" is right for a leak and strange for a
              * haircut — and the version below it, "מה שקובע אם המקצוען
              * מגיע עם החלק הנכון או חוזר פעם שנייה", assumed a part and a
              * repair. One page, thirty services: the shared copy has to be
              * true for all of them or it quietly narrows the marketplace
              * back to the trades it was written for.
              */}
            <SectionHeader title={symptomsHe.length > 0 ? "מה הכי מתאים?" : "מה צריך?"} colors={colors} />
            <View style={styles.symptoms}>
              {(mayAsk ? symptomsHe : []).map((sx) => {
                const on = picked.includes(sx);
                return (
                  <Pressable
                    key={sx}
                    onPress={() => toggle(sx)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[
                      styles.symptom,
                      on && { backgroundColor: tint.action(0.14), borderColor: colors.action },
                    ]}
                  >
                    <Text
                      style={[styles.symptomText, on && { color: colors.actionText, fontWeight: "700" }]}
                      numberOfLines={2}
                    >
                      {sx}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/*
              * THE SIXTH THING.
              *
              * Amit: *"בתוך הקטגוריות חסרה האפשרות לטקסט חופשי."*
              *
              * Five chips is a vocabulary of five, and the note under them
              * promises the professional will arrive prepared — which was
              * a promise this screen could only keep for people whose
              * problem was on the list. Everyone else tapped nothing, or
              * tapped the nearest wrong one, which is worse than silence
              * because it sends somebody with the wrong part.
              *
              * One line, not a paragraph: the describe screen is where
              * there is room to write, and what is typed here is carried
              * into that box rather than asked for twice.
              */}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={
                symptomsHe.length > 0 ? "משהו אחר? כתבו במילים שלכם" : "ספרו לנו במילים שלכם"
              }
              accessibilityLabel="תיאור חופשי של מה שצריך"
              placeholderTextColor={colors.textSecondary}
              style={styles.noteInput}
              textAlign="right"
            />
            <Text style={styles.symptomNote}>
              לא חובה. זה מה שעוזר למקצוען להגיע מוכן.
            </Text>
          </View>
        ) : null}

        {/* ---------------- Price ---------------- */}
        <View style={styles.block}>
          <SectionHeader title="מחיר" colors={colors} />
          <Surface colors={colors} level={1}>
            <Text style={styles.priceHeadline}>{explainer.headline}</Text>
            <Text style={styles.priceDetail}>{explainer.detail}</Text>
          </Surface>
        </View>

        {/* ---------------- Included / not included ---------------- */}
        <View style={styles.block}>
          <SectionHeader title="מה כולל" colors={colors} />
          <View style={styles.bullets}>
            {includedHe.map((b, i) => (
              <Bullet key={`in-${i}`} text={b} tone="yes" />
            ))}
            {notIncludedHe.map((b, i) => (
              <Bullet key={`out-${i}`} text={b} tone="no" />
            ))}
          </View>
        </View>

        {/* ---------------- Verification ---------------- */}
        {requiredCredentialsHe.length > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="מי יגיע" colors={colors} />
            <Surface colors={colors} level={0} style={{ backgroundColor: tint.action(0.07) }}>
              <View style={styles.credHead}>
                <ShieldCheckMark size={16} color={colors.action} />
                <Text style={styles.credTitle}>לשירות הזה נשלחים רק בעלי מקצוע שעברו:</Text>
              </View>
              {requiredCredentialsHe.map((c, i) => (
                <Text key={i} style={styles.credItem}>
                  · {c}
                </Text>
              ))}
            </Surface>
          </View>
        ) : null}

        {/* ---------------- What happens next ---------------- */}
        <View style={styles.block}>
          <SectionHeader title="מה קורה אחרי שתלחצו" colors={colors} />
          <View style={styles.steps}>
            {[
              "מחפשים בעל מקצוע מאומת שזמין עכשיו באזור שלך.",
              "תראו מי נמצא, כמה זמן עד שיגיע, ומה המחיר — לפני שתאשרו.",
              "רק אחרי שתאשרו, הכתובת המלאה ומספר הטלפון נחשפים לשני הצדדים.",
            ].map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
          <View style={styles.etaNote}>
            <ClockMark size={14} color={colors.textSecondary} />
            <Text style={styles.etaNoteText}>
              זמן ההגעה מוצג רק אחרי שבעל מקצוע מסוים מקבל את העבודה — הוא תלוי במי שקיבל אותה.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ---------------- CTA ---------------- */}
      {/*
       * When nobody is online the screen offers the action that actually
       * exists — check again — and states the true reason. It deliberately
       * does NOT offer to notify the customer: PRO NOW has no availability
       * watch, and a button that promises a push nobody will send is a
       * fabricated capability, which /CLAUDE.md §3 rules out just as firmly
       * as fabricated supply. When the watch is built, this is where it goes.
       */}
      <View style={styles.cta}>
        <Pressable
          onPress={canDispatch ? () => onRequestNow?.(picked, note.trim()) : comingSoon ? onBack : onRecheck}
          accessibilityRole="button"
          accessibilityLabel={
            canDispatch
              ? `בקשת ${nameHe} עכשיו`
              : comingSoon
                ? "חזרה"
                : "בדיקה מחדש של הזמינות"
          }
          style={({ pressed }) => [
            styles.ctaBtn,
            !canDispatch && styles.ctaBtnQuiet,
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={[styles.ctaLabel, !canDispatch && { color: colors.textPrimary }]}>
            {canDispatch ? "בקשת בעל מקצוע עכשיו" : comingSoon ? "חזרה" : "בדיקה מחדש"}
          </Text>
        </Pressable>
        <Text style={styles.ctaNote}>
          {canDispatch
            ? "בלי התחייבות עד שתאשרו את ההתאמה"
            : scheduledOnly
              ? "עבודה שמתאמים מראש — לא שולחים מקצוען ״עכשיו״"
              : comingSoon
              ? "השירות קיים בקטלוג ועדיין לא נפתח להזמנה"
              : "הזמינות משתנה לאורך היום"}
        </Text>
      </View>
    </View>
  );
}

function Bullet({ text, tone }: { text: string; tone: "yes" | "no" }) {
  return (
    <View style={styles.bullet}>
      <View
        style={[
          styles.bulletGlyph,
          { backgroundColor: tone === "yes" ? tint.action(0.12) : tint.neutralLight(0.06) },
        ]}
      >
        <Text style={[styles.bulletGlyphText, { color: tone === "yes" ? colors.action : colors.textSecondary }]}>
          {tone === "yes" ? "✓" : "−"}
        </Text>
      </View>
      <Text style={[styles.bulletText, tone === "no" && { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  // The CTA is pinned over the scroll, so the last content needs room to
  // clear it — otherwise the closing note is unreachable, not just hidden.
  scroll: { paddingBottom: 150 },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: "flex-end" },
  markWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: depth.panel.mid,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    ...depth.litEdge(0.07),
  },
  title: { ...type.title, color: colors.textPrimary, writingDirection: "rtl", textAlign: "right" },
  description: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
  },

  supplyRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.action },
  supplyLive: { ...type.metaStrong, color: colors.actionText, writingDirection: "rtl" },
  supplyQuiet: { ...type.meta, color: colors.textSecondary, writingDirection: "rtl", marginTop: spacing.md },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  priceHeadline: { ...type.h1, ...tabular, color: colors.textPrimary, textAlign: "right" },
  priceDetail: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
    lineHeight: 19,
  },

  symptoms: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  symptom: {
    // 44px minimum: these are the first thing a customer taps on this page,
    // and at 40px they were the "הכפתורים צפופים" complaint made literal.
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: "100%",
  },
  symptomText: { ...type.caption, fontSize: scale.meta, color: colors.textPrimary, writingDirection: "rtl" },
  noteInput: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    // The same 44 the chips take, and for the same reason: it sits in the
    // same row of touch targets and a shorter one reads as less real.
    minHeight: 48,
    marginTop: spacing.md,
    writingDirection: "rtl",
  },

  symptomNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
    lineHeight: 18,
  },

  bullets: { gap: spacing.sm },
  bullet: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.md },
  bulletGlyph: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
  bulletGlyphText: { fontSize: scale.micro, fontWeight: "700" },
  bulletText: {
    ...type.body,
    flex: 1,
    fontSize: scale.meta,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },

  credHead: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  credTitle: { ...type.captionStrong, color: colors.textPrimary, writingDirection: "rtl" },
  credItem: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
  },

  steps: { gap: spacing.md },
  step: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.md },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tint.neutralLight(0.06),
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { ...type.captionStrong, color: colors.textPrimary },
  stepText: {
    ...type.body,
    flex: 1,
    fontSize: scale.meta,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 21,
  },

  etaNote: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.lg },
  etaNoteText: {
    ...type.caption,
    flex: 1,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  cta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    ...elevation(3),
  },
  ctaBtn: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  // Outlined rather than greyed-out: "check again" is a real, enabled action,
  // and a disabled-looking button would say the screen is a dead end.
  ctaBtnQuiet: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.border },
  ctaLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  ctaNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.sm,
  },
});
