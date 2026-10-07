import React, { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatMoney, money, paymentPromiseHe, type QuoteView } from "@pro-now/types";

import { BackButton } from "../components/BackButton";
import { customerTheme, elevation, radii, scale, spacing, tabular, tint, type } from "../theme";
import { RingedAvatar, Surface } from "../components/surfaces";
import { VoiceNote } from "../components/VoiceNote";

/**
 * C11 — the quote the professional sent, for the customer to approve.
 *
 * This is the only screen where the customer agrees to a number that did
 * not exist when the job started, so it is the screen where a UI mistake
 * becomes a money mistake. Four rules:
 *
 * 1. **Every line is shown.** Quantity, unit price and line total, each
 *    computed by the server and echoed here. The client never re-derives a
 *    total from the lines — if the two ever disagreed, the client's version
 *    would be the wrong one to trust (/CLAUDE.md §3).
 * 2. **Approval is version-pinned.** `versionHash` is what
 *    `POST /v1/quotes/:id/approve` requires back. A newer version the
 *    customer has not seen therefore cannot be approved by a stale screen.
 *    The short hash is visible so support can match a screenshot to a row.
 * 3. **Superseded and already-decided quotes cannot be approved.** The
 *    actions disappear rather than failing on submit.
 * 4. **Nothing is pre-approved.** No default-selected confirm, no
 *    auto-advance.
 *
 * ---------------------------------------------------------------------
 * WHY THIS SCREEN STAYS LIGHT WHILE THE REST OF THE APP WENT DARK
 * ---------------------------------------------------------------------
 * It is now one of two light screens in the customer app, and it is the
 * exception that survived the reversal of §12 intact, on ChatGPT's original
 * reasoning: "הכסף וההסכמה צריכים להרגיש כמו מסמך ברור, לא כמו עוד live
 * event." Now that light is scarce, the exception lands harder than it did
 * when everything around it was ivory too — arriving here feels like being
 * handed a piece of paper, which is exactly the register consent should have.
 *
 * ---------------------------------------------------------------------
 * AND WHY IT SAYS LESS
 * ---------------------------------------------------------------------
 * Amit: "לא צריך מלא מלא מלל, צריך ממוקד ונגיש." Before the total, this
 * screen used to show an overline, a title, a professional row, a section
 * header, and then a card per line item. The number a person is being asked
 * to agree to was the sixth thing they met.
 *
 * It is now the first. Who inspected the fault, then the total at hero size,
 * then the breakdown directly on the surface — no card per line, because a
 * line item is not a unit that can be selected, moved or opened (§4). The
 * version hash stays, because support needs to match a screenshot to a row,
 * but it is micro type at the foot rather than a paragraph with a shield.
 */

const colors = customerTheme.colors;

export interface QuoteApprovalBodyProps {
  quote: QuoteView;
  /**
   * True on a visit-and-quote job: the approved quote REPLACES the visit
   * fee — it is already inside this total (Amit, 2026-09-26; the server's
   * `settlement.ts` reads it the same way). Said on the screen, so nobody
   * thinks they are paying the visit on top.
   */
  includesVisitFee?: boolean;
  serviceNameHe: string;
  professionalDisplayName: string;
  professionalPhotoUrl?: string | null;
  /** Set when a newer version exists — the customer must be moved to it. */
  supersededByVersion?: number | null;
  /**
   * HOW THIS AMOUNT SITS AGAINST WHAT PEOPLE ACTUALLY PAID.
   *
   * Amit: *"אחרי שמקבלים הצעת מחיר, צריך שיהיה מחיר בהשוואה לשוק לראות
   * אם יקר או לא יקר."*
   *
   * Decided by the server from approved quotes for the same service —
   * the client is never handed other people's prices to do arithmetic
   * on. Three states, and the screen is built for all three:
   *
   *   null            — there is nothing to compare (no live quote, or
   *                     the caller does not have the answer yet)
   *   available:false — not enough real jobs behind it yet, which is
   *                     where a new marketplace lives for a while
   *   available:true  — a range, always shown with its sample size
   *
   * There is no fourth state where a number is estimated. See
   * `price-context.ts` for why that is a hard line and not a preference.
   */
  priceContext?: QuotePriceContext | null;
  onApprove?: (versionHash: string) => void;
  onDecline?: () => void;
  onAskQuestion?: () => void;
  /** Photos of the fault, taken by the professional on site for this quote. */
  photos?: readonly string[];
  /**
   * The call was ordered for someone else (Amit, 2026-10-01): the quote
   * comes to the person who ordered — only they approve and pay — and
   * the person at home neither haggles nor pays. The name of who is at home.
   */
  forOnSiteHe?: string | null;
  /**
   * No money moves through the app (docs/21 §5 D1): approving decides the
   * price, and the amount is paid to the professional directly. The card
   * hold the approval would otherwise promise is not said.
   */
  paidDirectly?: boolean;
  /** A message this professional recorded about THIS quote. */
  voiceNote?: {
    seconds: number;
    transcriptHe?: string | null;
    playing?: boolean;
    onTogglePlay?: () => void;
  } | null;
  /**
   * Back, without answering the quote.
   *
   * Deliberately not a decline: leaving a screen is not a decision, and a
   * quote that expired because someone pressed a chevron would be a
   * financial consequence hidden in a navigation control. The quote stays
   * pending exactly as it was.
   */
  onBack?: () => void;
  width?: number;
  height?: number;
}

/** Mirrors the server's `PriceContext`. */
export type QuotePriceContext =
  | { available: false; sampleSize: number; needed: number }
  | {
      available: true;
      sampleSize: number;
      lowMinorUnits: number;
      typicalMinorUnits: number;
      highMinorUnits: number;
      band: "BELOW" | "WITHIN" | "ABOVE";
    };

const KIND_LABEL_HE: Record<string, string> = {
  LABOR: "עבודה",
  MATERIALS: "חומרים",
  OTHER: "אחר",
};

export function QuoteApprovalBody({
  quote,
  includesVisitFee = false,
  serviceNameHe,
  professionalDisplayName,
  professionalPhotoUrl = null,
  supersededByVersion = null,
  priceContext = null,
  onApprove,
  onDecline,
  onAskQuestion,
  voiceNote = null,
  photos = [],
  forOnSiteHe = null,
  paidDirectly = false,
  onBack,
  width = 390,
  height = 780,
}: QuoteApprovalBodyProps) {
  const decided = quote.status === "APPROVED" || quote.status === "DECLINED";

  /**
   * The largest single line on the quote.
   *
   * Read off the quote, never computed against the range: this is "the
   * biggest thing you are paying for", not "the reason it is expensive".
   * The second would be an opinion about somebody's work and would also
   * be wrong as often as not — a quote can be high because everything on
   * it is slightly high.
   */
  const biggestLine = useMemo(() => {
    let best: { description: string; total: number } | null = null;
    for (const li of quote.lineItems) {
      const total = li.quantity * li.unitPriceMinorUnits;
      if (!best || total > best.total) best = { description: li.description, total };
    }
    return best;
  }, [quote.lineItems]);
  const stale = quote.status === "SUPERSEDED" || supersededByVersion !== null;
  const actionable = !decided && !stale;

  return (
    <View style={[styles.screen, { width, height }]}>
      {onBack ? <BackButton onPress={onBack} tone="light" /> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ------------------------------------------------------------
            WHO — then what was found, what it buys, and only then how much.
            ------------------------------------------------------------ */}
        <View style={styles.head}>
          <View style={styles.proRow}>
            <RingedAvatar
              size={40}
              uri={professionalPhotoUrl}
              name={professionalDisplayName}
              colors={colors}
              ringColor={colors.trust}
            />
            <Text style={styles.who} numberOfLines={2}>
              {forOnSiteHe ? `${professionalDisplayName} בדק אצל ${forOnSiteHe} · ${serviceNameHe}` : `${professionalDisplayName} בדק את ${serviceNameHe}`}
            </Text>
          </View>
        </View>

        {/* WHAT HE FOUND, FIRST (Amit, 2026-10-01): the photos, his voice and his words —
            then what he will do, and only then the sum. A price on its own is not a quote. */}
        {photos.length > 0 || voiceNote || quote.notes ? <Text style={styles.sectionTitle}>מה נמצא בבדיקה</Text> : null}
        {/* What he saw, in his photos — so the decision can be made from far away. */}
        {photos.length > 0 ? (
          <View style={styles.photoRow}>
            {photos.map((u) => (
              <Image key={u} source={{ uri: u }} style={styles.photo} accessibilityLabel="תמונה של התקלה" />
            ))}
          </View>
        ) : null}

        {/*
          * A MESSAGE IN HIS OWN VOICE, when there is one. A quote is a
          * number a stranger arrived at in your kitchen; thirty seconds of
          * him explaining it does more for trust than any line item can.
          * Only a real recording for THIS job — VoiceNote has no stock
          * variant, on purpose.
          */}
        {voiceNote ? (
          <View style={styles.block}>
            <VoiceNote
              kind="JOB_MESSAGE"
              speakerNameHe={professionalDisplayName}
              speakerPhotoUri={professionalPhotoUrl}
              transcriptHe={voiceNote.transcriptHe}
              seconds={voiceNote.seconds}
              playing={voiceNote.playing}
              onTogglePlay={voiceNote.onTogglePlay}
              tone="light"
              width={width - spacing.lg * 2}
            />
          </View>
        ) : null}

        {quote.notes ? (
          <View style={styles.block}>
            <Text style={styles.notes}>{quote.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>מה כלול במחיר</Text>
        {/* ---------------- What it is made of ---------------- */}
        {/*
          * ON THE SURFACE, NOT IN CARDS. A line item has no independent
          * state and cannot be selected, opened or moved, so by §4 it is
          * not a card — it is a row with a hairline above it. Four cards
          * stacked here also made the total look like a fifth card rather
          * than like the answer.
          */}
        <View style={styles.block}>
          {quote.lineItems.map((li, i) => {
            const lineTotal = li.quantity * li.unitPriceMinorUnits;
            return (
              <View key={li.id} style={[styles.line, i > 0 && styles.lineDivided]}>
                <Text style={styles.lineTotal}>{formatMoney(money(lineTotal, "ILS"))}</Text>
                <View style={styles.lineText}>
                  <Text style={styles.lineDesc} numberOfLines={2}>
                    {li.description}
                  </Text>
                  <Text style={styles.lineMeta} numberOfLines={1}>
                    {KIND_LABEL_HE[li.kind] ?? li.kind}
                    {li.quantity !== 1
                      ? ` · ${li.quantity} × ${formatMoney(money(li.unitPriceMinorUnits, "ILS"))}`
                      : ""}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.total} numberOfLines={1}>
            {formatMoney(money(quote.totalMinorUnits, "ILS"))}
          </Text>
          <Text style={styles.totalNote}>
            {includesVisitFee ? "כולל מע״מ ודמי הביקור · הסכום הסופי לעבודה הזו" : "כולל מע״מ · הסכום הסופי לעבודה הזו"}
          </Text>
          {forOnSiteHe ? (
            <View style={styles.forOther}>
              <Text style={styles.forOtherText}>
                {paidDirectly
                  ? `רק אצלך מאשרים את המחיר. אצל ${forOnSiteHe} לא מתמקחים — המקצוען מתחיל לעבוד רק אחרי האישור שלך, ואת הסכום שאישרת משלמים לו ישירות.`
                  : `רק אצלך מאשרים ומשלמים. אצל ${forOnSiteHe} לא מתמקחים ולא משלמים כלום — המקצוען מתחיל לעבוד רק אחרי האישור שלך.`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ----------------------------------------------------------------
            A FAIRNESS GUARDRAIL, NOT A PRICE COMPARISON.

            Amit: *"אני לא מחפש להיות הכי זול, מחפש להיות מהיר, הוגן,
            חדשני."*

            So this appears in ONE case: a quote above what this work
            usually costs here. A quote in the usual range shows nothing,
            and a cheap one shows nothing either — "good price!" is a
            price-comparison site talking, it pushes professionals
            downward, and choosing plumbing on price is the wrong
            instinct to encourage.

            It is a QUESTION and it hands over the way to ask it. There
            are good reasons a job costs more — the hour, the parts, the
            flat with no shut-off valve — and every one of them is in the
            line items directly above. The customer is not told they are
            being overcharged; they are told what to ask.

            The sample size is not small print. A statement about what
            work "usually" costs, with no count behind it, is a claim
            pretending to be data.
            ---------------------------------------------------------------- */}
        {priceContext?.available && priceContext.band === "ABOVE" ? (
          <Surface colors={colors} level={1} style={styles.context}>
            <Text style={styles.contextBand}>שווה לשאול על המחיר</Text>
            <Text style={styles.contextRange} numberOfLines={2}>
              רוב העבודות האלה כאן יצאו עד{" "}
              {formatMoney(money(priceContext.highMinorUnits, "ILS"))} · לפי{" "}
              {priceContext.sampleSize} עבודות באותו שירות
            </Text>
            {/*
              * ---------------------------------------------------------
              * AND WHAT IS ACTUALLY DRIVING IT
              * ---------------------------------------------------------
              * Amit: *"למה יצא יותר יקר מהממוצע שלנו? איפה ההסבר למה?"*
              * and then, harder: *"נראה כאילו עובדים על הלקוח ככה."*
              *
              * That second sentence is the real failure. The box was
              * written to be a question rather than a verdict, and a
              * question with nothing to answer it is just an accusation
              * with a gentler verb. "This costs more than usual" and
              * then silence leaves exactly one conclusion available.
              *
              * The answer was already on the screen and nobody was
              * pointed at it: the quote's own line items, six inches
              * above this box. The single largest one is almost always
              * the difference — a part, a second hour, an after-hours
              * call-out — so it is named here, with its amount.
              *
              * It says WHAT the biggest item is, not that the item
              * justifies the price. The first is a fact read off the
              * quote; the second is an opinion about somebody's work,
              * and this screen does not get to have one.
              */}
            {biggestLine ? (
              <Text style={styles.contextWhy} numberOfLines={2}>
                הפריט הגדול בהצעה: {biggestLine.description} ·{" "}
                {formatMoney(money(biggestLine.total, "ILS"))}
              </Text>
            ) : null}
            <Text style={styles.contextNote}>
              יכולות להיות לזה סיבות טובות — שעה, חלפים, מורכבות. הפירוט המלא למעלה, והמקצוען יסביר.
            </Text>
            {onAskQuestion ? (
              <Pressable
                onPress={onAskQuestion}
                accessibilityRole="button"
                accessibilityLabel="שאלה למקצוען על המחיר"
                style={({ pressed }) => [styles.contextAsk, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.contextAskLabel}>שאלו את המקצוען</Text>
              </Pressable>
            ) : null}
          </Surface>
        ) : null}

        {stale ? (
          <Surface colors={colors} level={0} style={[styles.notice, { backgroundColor: tint.warning(0.14) }]}>
            <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
              {supersededByVersion !== null
                ? `נשלחה גרסה חדשה יותר (${supersededByVersion}). אשר אותה במקום גרסה זו.`
                : "הצעה זו הוחלפה בגרסה חדשה יותר."}
            </Text>
          </Surface>
        ) : null}

        {decided ? (
          <Surface
            colors={colors}
            level={0}
            style={[
              styles.notice,
              { backgroundColor: quote.status === "APPROVED" ? tint.action(0.12) : tint.neutralLight(0.05) },
            ]}
          >
            <Text
              style={[
                styles.noticeText,
                { color: quote.status === "APPROVED" ? colors.action : colors.textSecondary },
              ]}
            >
              {quote.status === "APPROVED" ? "אישרת את ההצעה הזו." : "דחית את ההצעה הזו."}
            </Text>
          </Surface>
        ) : null}

        {/* Provenance, in the smallest type the system has. */}
        <Text style={styles.hashText} numberOfLines={2}>
          גרסה {quote.version} של ההצעה — האישור שלכם הוא לגרסה הזו בלבד. אם המקצוען ישנה משהו, תתבקשו לאשר שוב.
        </Text>

      </ScrollView>

      {/* ---------------- Actions ---------------- */}
      {actionable ? (
        <View style={styles.actions}>
          {/* ----------------------------------------------------------
              WHAT PRESSING APPROVE ACTUALLY DOES TO THE MONEY.

              Amit, setting the rule: *"ברגע שלחץ אישור הכסף כאילו עובר
              אבל מגיע רק בסיום ביצוע העבודה — שלא יקרה מצב שהלקוח פתאום
              מתחרט אחרי ביצוע העבודה ואז אין מה לעשות."*

              The button said "אישור ותשלום", which reads as "pay now",
              and that is not what happens: the amount is HELD so the
              professional is not working against a promise, and it is
              taken only when the customer agrees the work is done. Both
              halves protect somebody, and the person being asked to
              press it is entitled to know which.

              Above the button, not in a sheet: this is the sentence that
              changes whether somebody presses.
              ---------------------------------------------------------- */}
          <Text style={styles.holdNote}>
            {paidDirectly ? "באפליקציה לא עובר כסף: האישור קובע את המחיר, והתשלום ישירות לבעל המקצוע." : paymentPromiseHe("WAITING_QUOTE_APPROVAL", "customer")}
          </Text>
          <Pressable
            onPress={() => onApprove?.(quote.versionHash)}
            accessibilityRole="button"
            accessibilityLabel={`אישור הצעת מחיר על סך ${formatMoney(money(quote.totalMinorUnits, "ILS"))}`}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}
          >
            {/*
              * "אישור ותשלום" MEANT "PAY NOW", AND IT DOES NOT.
              *
              * Amit: *"אישור תשלום רק בסוף העבודה."* Under the rule he
              * set, this tap HOLDS the amount and the money moves when
              * the work is confirmed finished — so a button that says
              * "pay" is the screen contradicting the sentence directly
              * above it, on the one screen where somebody is deciding
              * about their own money.
              *
              * The amount stays on the button. What is being approved is
              * a price, and a button that hides it would be worse than
              * one that misnames the moment.
              */}
            <Text style={styles.primaryLabel}>
              אישור ההצעה · {formatMoney(money(quote.totalMinorUnits, "ILS"))}
            </Text>
          </Pressable>
          {/* Only what the host can do: a button with nothing behind it is a promise. */}
          {onAskQuestion || onDecline ? (
            <View style={styles.secondaryRow}>
              {onAskQuestion ? (
                <Pressable onPress={onAskQuestion} accessibilityRole="button" style={styles.secondary}>
                  <Text style={styles.secondaryLabel}>שאלה לבעל המקצוע</Text>
                </Pressable>
              ) : null}
              {onDecline ? (
                <Pressable onPress={onDecline} accessibilityRole="button" style={styles.secondary}>
                  <Text style={[styles.secondaryLabel, { color: colors.statusDanger }]}>דחייה</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...type.bodyStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  totalBox: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  forOther: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: tint.trust(0.12) },
  forOtherText: { color: colors.textPrimary, fontSize: scale.meta, fontWeight: "700", textAlign: "right", writingDirection: "rtl", lineHeight: 20 },
  photoRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  photo: { width: 96, height: 96, borderRadius: radii.md },
  /*
   * NO PAGE BACKGROUND AND NO CORNERS. This body now renders inside
   * FocusSheet, which owns the surface, the radius and the shadow. A screen
   * that paints its own rounded page inside a sheet produces the
   * double-rounded-corner artefact that makes a sheet look like a
   * screenshot of a page.
   */
  screen: { backgroundColor: "transparent", overflow: "hidden" },
  // Clears the pinned action bar, so the version-hash line can be scrolled
  // into view rather than sitting permanently behind the approve button.
  scroll: { paddingBottom: 150 },

  head: {
    backgroundColor: colors.surface,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    alignItems: "flex-end",
    ...elevation(1),
  },
  proRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  who: { ...type.body, color: colors.textSecondary, flex: 1, textAlign: "right", writingDirection: "rtl" },
  /*
   * THE HERO IS THE NUMBER. §1 allows one hero per viewport and this is the
   * screen with the least doubt about which value deserves it: it is the
   * only figure on it the customer is being asked to agree to.
   */
  context: { marginTop: spacing.lg, gap: 4 },
  contextAsk: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.action,
    marginTop: spacing.md,
  },
  contextAskLabel: { ...type.bodyStrong, color: colors.action },
  contextBand: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl", textAlign: "right" },
  contextRange: {
    ...type.body,
    ...tabular,
    color: colors.textSecondary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  contextWhy: {
    ...type.caption,
    color: colors.textPrimary,
    writingDirection: "rtl",
    textAlign: "right",
    marginTop: 2,
  },
  contextNote: {
    ...type.meta,
    color: colors.textSecondary,
    writingDirection: "rtl",
    textAlign: "right",
    lineHeight: 17,
    marginTop: 2,
  },

  total: { ...type.hero, ...tabular, color: colors.textPrimary, marginTop: spacing.lg },
  totalNote: { ...type.meta, color: colors.textSecondary, writingDirection: "rtl", marginTop: 2 },

  notice: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  noticeText: { ...type.captionStrong, textAlign: "right", writingDirection: "rtl", lineHeight: 19 },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  line: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  lineDivided: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border },
  lineText: { flex: 1, alignItems: "flex-end" },
  lineDesc: { ...type.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  lineMeta: { ...type.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", marginTop: 1 },
  lineTotal: { ...type.bodyStrong, ...tabular, color: colors.textPrimary, minWidth: 74, textAlign: "left" },

  notesLabel: {
    ...type.metaStrong,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: spacing.xs,
  },

  vatNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  notes: { ...type.body, fontSize: scale.meta, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", lineHeight: 22 },

  hashRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm },
  hashText: {
    ...type.caption,
    flex: 1,
    // Inside the page's margins, like every other line (it ran to the edge in a sheet).
    paddingHorizontal: spacing.lg,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  holdNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    ...elevation(3),
  },
  primary: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  secondaryRow: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: spacing.sm },
  secondary: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, minHeight: 44, justifyContent: "center" },
  secondaryLabel: { ...type.captionStrong, color: colors.textSecondary },
});
