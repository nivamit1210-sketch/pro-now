import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { formatMoney, money } from "@pro-now/types";

import { proTheme, radii, scale, spacing, tabular, tint, type } from "../theme";
import { SectionHeader, Surface } from "../components/surfaces";

/**
 * P19 — WHERE THE PROFESSIONAL WRITES THE QUOTE.
 *
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------
 * Amit: *"מתחיל אבחון לא קורה כלום, לא עובר לטופס שהוא ממלא... הרי הוא
 * חייב לרשום את הבעיות לפני שמשקלל הצעת מחיר, לפחות שהכל יהיה שקוף מול
 * הלקוח שיופיע לו גם."*
 *
 * He is describing the hole exactly. The professional's screen had a
 * button reading "שליחת הצעת מחיר" and no screen behind it: the quote
 * the customer then approved was a fixture, written by nobody. Every
 * other piece of that chain exists — the schema, the server's
 * `buildQuoteVersion`, the version hash, the customer's approval screen
 * — and the one place a human was supposed to type was missing.
 *
 * ---------------------------------------------------------------------
 * WHAT THE SCREEN IS ALLOWED TO DECIDE, WHICH IS NOTHING
 * ---------------------------------------------------------------------
 * No suggested prices, no templates with amounts in them, no "similar
 * jobs charged". What a professional charges is their own commercial
 * decision (/CLAUDE.md §4) and a default in a box is a recommendation
 * whatever the label says.
 *
 * The total shown here is ARITHMETIC, not a price the app has agreed to.
 * The server recomputes it from the same lines and binds it to a version
 * hash, and the customer approves that hash — so if this screen and the
 * server ever disagreed, the server would win and the customer would see
 * the server's number. The screen says so rather than implying its sum
 * is the contract.
 *
 * ---------------------------------------------------------------------
 * THE LINES ARE THE TRANSPARENCY
 * ---------------------------------------------------------------------
 * *"שהכל יהיה שקוף מול הלקוח שיופיע לו גם."* Every line typed here is
 * shown to the customer, with its quantity and unit price, on the
 * approval screen — that screen has always rendered them and has never
 * had real ones to render. Which is also why the placeholder text asks
 * for a description a customer could understand rather than a code.
 */

const colors = proTheme.colors;

export type QuoteLineKind = "LABOR" | "MATERIALS" | "OTHER";

export interface QuoteDraftLine {
  id: string;
  description: string;
  /** Whole units. A half-hour is 0.5, and the server takes a positive number. */
  quantity: number;
  unitPriceMinorUnits: number;
  kind: QuoteLineKind;
}

const KIND_HE: Record<QuoteLineKind, string> = {
  LABOR: "עבודה",
  MATERIALS: "חומרים",
  OTHER: "אחר",
};

export interface ProQuoteBuilderBodyProps {
  serviceNameHe: string;
  /**
   * The professional's own price list. Each one is a tap that adds a line
   * at its price, so a quote is built from prices he set in advance and the
   * total moves as work is added (a tester: "לא משנה כמה דברים הוספתי המחיר
   * נשאר קבוע").
   */
  priceList?: readonly { id: string; nameHe: string; amountMinorUnits: number }[];
  /** Visit-and-quote: the quote's total includes the visit fee. See `QuoteApprovalBody`. */
  includesVisitFee?: boolean;
  /** What the customer said is wrong, so it can be quoted against. */
  symptomsHe?: string[];
  customerTextHe?: string | null;
  /**
   * The top of the usual range for this service, or null below the
   * minimum sample. The same figure the customer will be shown, told
   * here BEFORE the quote goes out — see `price-context.ts`.
   */
  /**
   * WHAT WAS ALREADY AGREED ABOUT THE PRICE OF THIS SERVICE.
   *
   * Amit: *"כמובן יש מקצועות שיש להם מחירים קבועים ויש מקצועות שזה
   * משתנה."*
   *
   * The builder treated every job as an open quote, which is right for a
   * leak and wrong for a haircut: on a FIXED service the customer was
   * shown a price before anybody was dispatched, and a professional who
   * types a different one is changing a deal rather than pricing a job.
   *
   * Passing the sentence rather than the model keeps the decision with
   * the catalogue, where the price actually lives, and lets this screen
   * stay ignorant of pricing archetypes.
   */
  agreedPriceNoteHe?: string | null;
  usualUpToMinorUnits?: number | null;
  /** A quote already went to the customer: this one replaces it. */
  updating?: boolean;
  usualSampleSize?: number;
  /**
   * The lines of the quote being REPLACED, when this is a new version.
   *
   * A professional updating a quote is editing what they already sent —
   * usually adding one thing they found — and starting them from a blank
   * form means retyping the four lines that have not changed. The server
   * supersedes the previous SENT quote and the customer approves the new
   * version's hash, so this is a new quote either way; only the typing
   * is saved.
   */
  initialLines?: QuoteDraftLine[];
  initialNotesHe?: string;
  /** Start with one amount field (priced-before-setting-off work); lines on request. */
  simple?: boolean;
  onSend?: (draft: { lines: QuoteDraftLine[]; notesHe: string; media?: QuoteMedia }) => void;
  /**
   * No money moves through the app (docs/21 §5 D1): the customer pays the
   * professional directly, so the screen must not promise a payment here.
   */
  paidDirectly?: boolean;
  /**
   * ORDERED FOR SOMEONE ELSE (Amit, 2026-10-01; Dvir, 2026-10-07).
   *
   * The son abroad ordered for his parents: the parents do not haggle at
   * the door. So even a repair is quoted here, with a photo of the fault
   * and what was found in words, and it goes to the person who ordered,
   * who approves it in the app. The money still moves outside the app
   * (D1): at home they pay the approved amount directly.
   */
  forOrderer?: { ordererHe: string; onSiteHe: string } | null;
  /** The fault in pictures: the host's camera or picker. Resolves a URI, or null. */
  onPickPhoto?: () => Promise<string | null>;
  /** The fault in his own voice: the host's microphone. */
  voiceRecorder?: { start: () => Promise<boolean>; stop: () => Promise<{ uri: string; seconds: number } | null> } | null;
  onBack?: () => void;
  width?: number;
  height?: number;
}

/** What he saw, sent with the quote: photos of the fault and a voice note explaining it. */
export interface QuoteMedia {
  photos: string[];
  voice: { uri: string; seconds: number } | null;
}

/** A blank line, so "add" never produces a row with somebody else's number in it. */
function emptyLine(n: number): QuoteDraftLine {
  return { id: `l${n}`, description: "", quantity: 1, unitPriceMinorUnits: 0, kind: "LABOR" };
}

export function ProQuoteBuilderBody({
  serviceNameHe,
  priceList = [],
  includesVisitFee = false,
  symptomsHe = [],
  customerTextHe = null,
  agreedPriceNoteHe = null,
  usualUpToMinorUnits = null,
  updating,
  usualSampleSize = 0,
  initialLines,
  initialNotesHe = "",
  simple = false,
  onSend,
  onBack,
  paidDirectly = false,
  forOrderer = null,
  onPickPhoto,
  voiceRecorder = null,
  width = 390,
  height = 780,
}: ProQuoteBuilderBodyProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<{ uri: string; seconds: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  useEffect(() => {
    if (!recording) return;
    setRecSeconds(0);
    const t = setInterval(() => setRecSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  const toggleRecord = async () => {
    if (!voiceRecorder) return;
    if (recording) {
      setRecording(false);
      const v = await voiceRecorder.stop();
      if (v) setVoice(v);
    } else if (await voiceRecorder.start()) { setMicBlocked(false); setRecording(true); }
    else setMicBlocked(true);
  };
  const showEvidence = Boolean(onPickPhoto || voiceRecorder);
  const [lines, setLines] = useState<QuoteDraftLine[]>(
    initialLines && initialLines.length > 0 ? initialLines : [emptyLine(1)]
  );
  const [notes, setNotes] = useState(initialNotesHe);
  /* One amount, or itemised lines — see `simple`. */
  const [detailed, setDetailed] = useState(!simple || (initialLines?.length ?? 0) > 1);
  const simpleAmount = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceMinorUnits), 0);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceMinorUnits), 0),
    [lines]
  );

  /**
   * THE SAME MONEY, SPLIT THE WAY THE CHIPS SAY.
   *
   * Amit, looking at the three chips on a line: *"מה קורה שאני לוחץ על
   * עבודה, חומרים, אחר?"*
   *
   * Something did happen — the chip is how the line is labelled on the
   * customer's approval screen, under its description — but nothing on
   * THIS screen moved, so from where he was standing the control did
   * nothing. That is the same fault as a button that changes a word: a
   * consequence the presser cannot see is, to them, no consequence.
   *
   * It is also the split both sides argue about. "Why is this ₪320" is
   * almost always "how much of that is parts", and a professional who
   * can see their own split before sending is a professional who can
   * answer that before it is asked.
   *
   * Arithmetic over his own lines. Nothing is inferred, nothing is
   * suggested, and a kind with no money in it is not shown at all.
   */
  const split = useMemo(() => {
    const by: Record<QuoteLineKind, number> = { LABOR: 0, MATERIALS: 0, OTHER: 0 };
    for (const l of lines) by[l.kind] += Math.round(l.quantity * l.unitPriceMinorUnits);
    return (Object.keys(by) as QuoteLineKind[])
      .filter((k) => by[k] > 0)
      .map((k) => ({ kind: k, labelHe: KIND_HE[k], amount: by[k] }));
  }, [lines]);

  /*
   * A quote with no description and no amount is not a quote. The server
   * refuses an empty line list; this refuses to SEND one, which is the
   * same rule said earlier and more kindly.
   */
  const linesOk =
    lines.length > 0 &&
    lines.every((l) => l.description.trim().length > 0) &&
    lines.some((l) => l.unitPriceMinorUnits > 0);
  /* Far away, they decide from what he shows and says: a photo and his words are required (Amit, 2026-10-01). */
  const evidenceMissing = forOrderer ? [photos.length === 0 ? "תמונה של התקלה" : null, notes.trim().length < 4 ? "מה מצאת, במילים" : null].filter((x): x is string => Boolean(x)) : [];
  const sendable = linesOk && evidenceMissing.length === 0;

  const patch = (id: string, next: Partial<QuoteDraftLine>) =>
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...next } : l)));

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>
          {(updating ?? Boolean(initialLines && initialLines.length > 0)) ? "עדכון הצעת מחיר" : "הצעת מחיר"} ·{" "}
          {serviceNameHe}
        </Text>
        {(updating ?? Boolean(initialLines && initialLines.length > 0)) ? (
          /*
           * Said once, here. A new version supersedes the old one and the
           * customer approves the new hash — so a professional editing
           * needs to know the old numbers stop applying the moment this
           * is sent, not that both offers are somehow live.
           */
          <Text style={styles.replacing}>
            ההצעה הקודמת תתבטל והלקוח יקבל את זו לאישור.
          </Text>
        ) : null}

        {forOrderer ? (
          <View style={styles.orderer}>
            <Text style={styles.ordererTitle}>ההצעה נשלחת ל{forOrderer.ordererHe}</Text>
            <Text style={styles.ordererSub}>
              הקריאה הוזמנה על ידי {forOrderer.ordererHe} עבור {forOrderer.onSiteHe}. רק שם מאשרים את המחיר — אצל {forOrderer.onSiteHe} לא סוגרים מחיר. את הסכום שאושר משלמים לך ישירות, כרגיל.
            </Text>
          </View>
        ) : null}

        {/* What the customer said, so the quote answers it. */}
        {symptomsHe.length > 0 || customerTextHe ? (
          <Surface colors={colors} level={1} dark style={styles.said}>
            <Text style={styles.saidHead}>מה הלקוח תיאר</Text>
            {symptomsHe.length > 0 ? (
              <Text style={styles.saidText}>{symptomsHe.join(" · ")}</Text>
            ) : null}
            {customerTextHe ? <Text style={styles.saidText}>{customerTextHe}</Text> : null}
          </Surface>
        ) : null}

        {detailed ? (
          <>
        <SectionHeader title="מה צריך לעשות" colors={colors} />

        {/* ----------------------------------------------------------------
            A SERVICE WITH AN AGREED PRICE SAYS SO BEFORE THE FIRST LINE.

            See `agreedPriceNoteHe`. Above the lines rather than beside
            the total, because it changes what the professional is doing
            here — filling in an agreed price, not setting one — and that
            has to be known before they start typing.
            ---------------------------------------------------------------- */}
        {agreedPriceNoteHe ? <Text style={styles.agreed}>{agreedPriceNoteHe}</Text> : null}

        {lines.map((l, i) => (
          <Surface key={l.id} colors={colors} level={1} dark style={styles.line}>
            {/*
              * NUMBERED, because "שורה 2" in an error message is no help
              * on a screen where the rows are not numbered — and with
              * three of them the eye needs somewhere to land.
              */}
            <Text style={styles.lineNumber}>שורה {i + 1}</Text>
            <Text style={styles.fieldLabel}>מה נעשה</Text>
            <TextInput
              value={l.description}
              onChangeText={(t) => patch(l.id, { description: t })}
              placeholder="מה נעשה — במילים שהלקוח יבין"
              accessibilityLabel={`תיאור שורה ${i + 1}`}
              placeholderTextColor={colors.textSecondary}
              style={styles.desc}
              textAlign="right"
            />

            <View style={styles.numbers}>
              <View style={styles.numField}>
                <Text style={styles.numLabel}>כמות</Text>
                <TextInput
                  value={String(l.quantity)}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^\d.]/g, ""));
                    patch(l.id, { quantity: Number.isFinite(n) && n > 0 ? n : 0 });
                  }}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`כמות בשורה ${i + 1}`}
                  style={styles.num}
                  textAlign="right"
                />
              </View>

              <View style={styles.numField}>
                <Text style={styles.numLabel}>מחיר ליחידה (₪)</Text>
                <TextInput
                  /*
                   * Typed in whole shekels and held in agorot. Money is
                   * integer minor units everywhere in this codebase
                   * (/CLAUDE.md §3), and asking a professional to type
                   * agorot would be asking them to do the conversion.
                   */
                  value={l.unitPriceMinorUnits === 0 ? "" : String(l.unitPriceMinorUnits / 100)}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^\d.]/g, ""));
                    patch(l.id, {
                      unitPriceMinorUnits: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0,
                    });
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  accessibilityLabel={`מחיר ליחידה בשורה ${i + 1}`}
                  style={styles.num}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.kindRow}>
              {(Object.keys(KIND_HE) as QuoteLineKind[]).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => patch(l.id, { kind: k })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: l.kind === k }}
                  accessibilityLabel={`${KIND_HE[k]} · שורה ${i + 1}`}
                  style={[styles.kind, l.kind === k && styles.kindOn]}
                >
                  <Text style={[styles.kindText, l.kind === k && styles.kindTextOn]}>
                    {KIND_HE[k]}
                  </Text>
                </Pressable>
              ))}
              {lines.length > 1 ? (
                <Pressable
                  onPress={() => setLines((cur) => cur.filter((x) => x.id !== l.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`מחיקת שורה ${i + 1}`}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>מחיקה</Text>
                </Pressable>
              ) : null}
            </View>

            {/*
              * LABELLED, because the screen carries two sums and they are
              * the same number on a one-line quote. An unlabelled "320 ₪"
              * above a "סה״כ להצעה 320 ₪" reads as the app saying the
              * same thing twice rather than as a row and its total.
              */}
            <View style={styles.lineTotalRow}>
              <Text style={styles.lineTotal}>
                {formatMoney(money(Math.round(l.quantity * l.unitPriceMinorUnits), "ILS"))}
              </Text>
              <Text style={styles.fieldLabel}>סה״כ לשורה</Text>
            </View>
          </Surface>
        ))}

        {priceList.length > 0 ? (
          <View style={styles.listWrap}>
            <Text style={styles.fieldLabel}>מהמחירון שלך — לחיצה מוסיפה לשורה</Text>
            <View style={styles.listChips}>
              {priceList.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() =>
                    setLines((cur) => {
                      const blank = cur.length === 1 && !cur[0]!.description.trim() && cur[0]!.unitPriceMinorUnits === 0;
                      const line: QuoteDraftLine = {
                        id: `p${Date.now()}`,
                        description: it.nameHe,
                        quantity: 1,
                        unitPriceMinorUnits: it.amountMinorUnits,
                        kind: "LABOR",
                      };
                      return blank ? [line] : [...cur, line];
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`הוספת ${it.nameHe} מהמחירון`}
                  style={({ pressed }) => [styles.listChip, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.listChipText}>
                    {it.nameHe} · {formatMoney(money(it.amountMinorUnits, "ILS"))}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={() => setLines((cur) => [...cur, emptyLine(cur.length + 1)])}
          accessibilityRole="button"
          accessibilityLabel="הוספת שורה להצעה"
          style={styles.addLine}
        >
          <Text style={styles.addLineText}>+ שורה</Text>
        </Pressable>

        {/* ----------------------------------------------------------------
            AND WHAT THE THREE CHIPS ARE FOR.

            Amit: *"מה קורה שאני לוחץ על עבודה, חומרים, אחר?"* The answer
            was real and invisible — the chip is the label the line
            carries on the customer's approval screen — so it is said
            here, once, next to the lines rather than in a help sheet
            nobody opens. The split at the bottom is the other half of
            the answer: press a chip and a number moves.
            ---------------------------------------------------------------- */}
        <Text style={styles.kindNote}>
          עבודה · חומרים · אחר — הסיווג מופיע ללקוח מתחת לשורה, ומסכם למטה.
        </Text>

          </>
        ) : (
          <>
        {/*
          ONE NUMBER FIRST (design review, 2026-09-29). Pricing a tow from
          its photos is one amount, not a line-item form; the lines are
          one tap away for whoever wants to itemise.
          */}
        <SectionHeader title="המחיר שלך" colors={colors} />
        <View style={styles.simpleRow}>
          <Text style={styles.simpleCurrency}>₪</Text>
          <TextInput
            value={simpleAmount > 0 ? String(Math.round(simpleAmount / 100)) : ""}
            onChangeText={(t) => {
              const n = Number(t.replace(/[^0-9]/g, "")) || 0;
              setLines([{ id: "s1", description: lines[0]?.description.trim() ? lines[0]!.description : `${serviceNameHe} · לפי התמונות והפרטים`, quantity: 1, unitPriceMinorUnits: n * 100, kind: "LABOR" }]);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(247,243,250,0.3)"
            accessibilityLabel="המחיר ללקוח בשקלים"
            style={styles.simpleAmount}
            textAlign="center"
          />
        </View>
        {priceList.length > 0 ? (
          <View style={styles.listWrap}>
            <Text style={styles.fieldLabel}>מהמחירון שלך</Text>
            <View style={styles.listChips}>
              {priceList.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() => setLines([{ id: "s1", description: it.nameHe, quantity: 1, unitPriceMinorUnits: it.amountMinorUnits, kind: "LABOR" }])}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.nameHe} מהמחירון`}
                  style={({ pressed }) => [styles.listChip, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.listChipText}>
                    {it.nameHe} · {formatMoney(money(it.amountMinorUnits, "ILS"))}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => setDetailed(true)} accessibilityRole="button" style={styles.addLine}>
          <Text style={styles.addLineText}>הוספת פירוט ›</Text>
        </Pressable>

          </>
        )}

        <SectionHeader title={forOrderer ? "מה מצאת — במילים" : "הערה ללקוח"} colors={colors} />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={forOrderer ? "מה התקלה, מה צריך לעשות ולמה — כדי שיבינו מרחוק" : "למה זה מה שצריך, ומה קורה אם לא — זה מה שמונע ויכוח אחר כך"}
          accessibilityLabel={forOrderer ? "מה מצאת, במילים" : "הערה ללקוח"}
          placeholderTextColor={colors.textSecondary}
          multiline
          style={styles.notes}
          textAlign="right"
        />

        {showEvidence ? (
          <>
            <SectionHeader title="התקלה בתמונות ובקול" colors={colors} />
            <Text style={styles.evidenceHint}>{forOrderer ? "כדי שיראו מרחוק בדיוק מה ראית." : "כדי שהלקוח יראה מה ראית."}</Text>
            <View style={styles.evidenceRow}>
              {photos.map((u) => (
                <View key={u} style={styles.evidenceThumb}>
                  <Image source={{ uri: u }} style={{ width: "100%", height: "100%" }} />
                  {/* Only the small × removes it — tapping the picture used to delete it (Amit). */}
                  <Pressable onPress={() => setPhotos((p) => p.filter((x) => x !== u))} accessibilityRole="button" accessibilityLabel="הסרת התמונה" hitSlop={6} style={styles.evidenceXBtn}>
                    <Text style={styles.evidenceX}>×</Text>
                  </Pressable>
                </View>
              ))}
              {onPickPhoto && photos.length < 4 ? (
                <Pressable
                  onPress={async () => {
                    const u = await onPickPhoto();
                    if (u) setPhotos((p) => [...p, u]);
                  }}
                  accessibilityRole="button"
                  style={styles.evidenceAdd}
                >
                  <Text style={styles.evidenceAddText}>+ צילום התקלה</Text>
                </Pressable>
              ) : null}
            </View>
            {voiceRecorder ? (
              <Pressable onPress={toggleRecord} accessibilityRole="button" accessibilityLabel={recording ? "עצירת ההקלטה" : voice ? "הקלטה מחדש" : "הקלטה קולית"} style={[styles.recBtn, recording && styles.recOn]}>
                <Text style={styles.recText}>
                  {recording ? `■ עצירה · ${recSeconds} שנ׳` : voice ? `✓ הוקלט · ${voice.seconds} שנ׳ · הקלטה מחדש` : "🎙  הקלטה קולית (לא חובה)"}
                </Text>
              </Pressable>
            ) : null}
            {micBlocked ? <Text style={styles.evidenceHint}>המיקרופון לא זמין כאן — אפשר להמשיך בלי הקלטה.</Text> : null}
          </>
        ) : null}

        {usualUpToMinorUnits !== null && usualSampleSize > 0 ? (
          <Text style={styles.usual}>
            עבודות כאלה כאן יצאו בדרך כלל עד{" "}
            {formatMoney(money(usualUpToMinorUnits, "ILS"))} · לפי {usualSampleSize} עבודות. הלקוח
            רואה את זה גם.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {/* ----------------------------------------------------------------
            WHAT THE CHIPS ADD UP TO.

            Shown only when there is more than one kind with money in it:
            a "split" of one line into one bucket is a heading with
            nothing under it, and it would be on the screen for every
            simple quote, which is most of them.
            ---------------------------------------------------------------- */}
        {split.length > 1 ? (
          <View style={styles.splitRow}>
            {split.map((sp) => (
              <Text key={sp.kind} style={styles.splitItem}>
                {sp.labelHe} {formatMoney(money(sp.amount, "ILS"))}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalValue}>{formatMoney(money(total, "ILS"))}</Text>
          <Text style={styles.totalLabel}>סה״כ להצעה</Text>
        </View>
        {/*
          * The sum is arithmetic, not an agreement. The server recomputes
          * it from the same lines and binds it to a version hash, and the
          * customer approves the HASH — so the screen must not imply its
          * own total is the contract.
          */}
        {includesVisitFee ? (
          <Text style={styles.serverNote}>דמי הביקור כלולים בהצעה: אם הלקוח יאשר, זה כל מה שישולם על העבודה.</Text>
        ) : null}
        <Text style={styles.serverNote}>
          {forOrderer
            ? `ההצעה הזו בדיוק מגיעה ל${forOrderer.ordererHe} לאישור.`
            : paidDirectly
              ? "הלקוח יראה בדיוק את ההצעה הזו. באפליקציה לא עובר כסף — הסכום משולם לך ישירות."
              : "הלקוח יראה ויאשר בדיוק את ההצעה הזו."}
        </Text>

        <Pressable
          onPress={() => (sendable && !recording ? onSend?.({ lines, notesHe: notes.trim(), media: { photos, voice } }) : undefined)}
          disabled={!sendable || recording}
          accessibilityRole="button"
          accessibilityLabel={forOrderer ? `שליחת הצעת המחיר ל${forOrderer.ordererHe}` : "שליחת הצעת המחיר ללקוח"}
          style={({ pressed }) => [styles.send, (!sendable || recording) && { opacity: 0.4 }, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.sendText}>{forOrderer ? `שליחה ל${forOrderer.ordererHe} לאישור` : "שליחה ללקוח"}</Text>
        </Pressable>

        {!sendable ? (
          <Text style={styles.why}>{!linesOk ? (detailed ? "צריך תיאור לכל שורה, ולפחות שורה אחת עם מחיר." : "רושמים מחיר — ואז שולחים.") : `חסר: ${evidenceMissing.join(" ו")}`}</Text>
        ) : null}

        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
            <Text style={styles.backText}>חזרה</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  orderer: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: "rgba(124,92,255,0.16)", borderWidth: 1, borderColor: "rgba(124,92,255,0.5)" },
  ordererTitle: { color: colors.textPrimary, fontSize: scale.body, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  ordererSub: { color: colors.textSecondary, fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginTop: 4, lineHeight: 20 },
  evidenceHint: { color: colors.textSecondary, fontSize: scale.meta, textAlign: "right", writingDirection: "rtl", marginHorizontal: spacing.lg, marginTop: -4 },
  evidenceRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  evidenceThumb: { width: 72, height: 72, borderRadius: radii.md, overflow: "hidden" },
  evidenceXBtn: { position: "absolute", top: 4, left: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  evidenceX: { color: "#fff", fontSize: scale.meta, fontWeight: "900", lineHeight: 16 },
  evidenceAdd: { minWidth: 120, height: 72, borderRadius: radii.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(247,243,250,0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  evidenceAddText: { color: colors.textPrimary, fontSize: scale.meta, fontWeight: "800" },
  recBtn: { marginHorizontal: spacing.lg, marginTop: spacing.sm, minHeight: 48, borderRadius: radii.md, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  recOn: { backgroundColor: "rgba(255,92,56,0.25)" },
  recText: { color: colors.textPrimary, fontSize: scale.meta, fontWeight: "800", writingDirection: "rtl" },
  simpleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, marginBottom: 8, paddingVertical: 10, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(47,191,138,0.45)" },
  simpleCurrency: { color: "rgba(247,243,250,0.7)", fontSize: scale.section, fontWeight: "800" },
  simpleAmount: { minWidth: 140, color: "#FFFFFF", fontSize: scale.hero, fontWeight: "900", paddingVertical: 4 },
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { padding: spacing.xl, gap: spacing.md },
  title: { ...type.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },

  replacing: {
    ...type.caption,
    color: colors.statusWarningText,
    textAlign: "right",
    writingDirection: "rtl",
  },
  said: { gap: 4 },
  saidHead: { ...type.captionStrong, color: colors.trust, textAlign: "right", writingDirection: "rtl" },
  saidText: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },

  agreed: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  line: { gap: spacing.sm },
  /*
   * ---------------------------------------------------------------------
   * A FIELD ON A DARK CARD HAS TO BE LIGHTER THAN THE CARD
   * ---------------------------------------------------------------------
   * Amit: *"דף הצעת המחיר שהמקצוען רושם, השורות קצת לא ברורות ונעלמות
   * מאחורי הרקע."*
   *
   * They were. The boxes were filled with `colors.bg` — the PAGE colour
   * — inside a card drawn one step above it, so every field was darker
   * than the thing it sat on and read as a hole rather than as somewhere
   * to type. The border that was supposed to rescue it was the next
   * shade along and invisible at arm's length.
   *
   * On a dark surface a field goes UP, not down: `surfaceElevated` on
   * the card, with a border bright enough to find. The same inversion
   * that makes a light form work, applied the right way round.
   */
  lineNumber: {
    ...type.captionStrong,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  fieldLabel: {
    ...type.micro,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  desc: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(247,243,250,0.22)",
    paddingHorizontal: spacing.md,
    minHeight: 48,
    writingDirection: "rtl",
  },
  numbers: { flexDirection: "row-reverse", gap: spacing.sm },
  numField: { flex: 1, gap: 2 },
  numLabel: { ...type.micro, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  num: {
    ...type.body,
    ...tabular,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(247,243,250,0.22)",
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  kindRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  kind: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  kindOn: { borderColor: colors.trust, backgroundColor: tint.trust(0.14) },
  kindText: { ...type.captionStrong, color: colors.textPrimary },
  kindTextOn: { color: colors.textPrimary, fontWeight: "700" },
  remove: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  removeText: { ...type.caption, color: colors.statusDanger },
  lineTotalRow: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  lineTotal: { ...type.bodyStrong, ...tabular, color: colors.textPrimary, textAlign: "right" },

  listWrap: { gap: spacing.sm },
  listChips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  listChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.trust,
  },
  listChipText: { ...type.captionStrong, color: colors.trust },
  addLine: {
    minHeight: 48,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addLineText: { ...type.bodyStrong, color: colors.trust },

  notes: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 96,
    writingDirection: "rtl",
  },
  usual: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  footer: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  kindNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  splitRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  splitItem: { ...type.caption, ...tabular, color: colors.textSecondary, writingDirection: "rtl" },
  totalRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between" },
  totalLabel: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  totalValue: { ...type.h2, ...tabular, color: colors.textPrimary },
  serverNote: {
    ...type.micro,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 16,
  },
  send: {
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.trust,
  },
  // Mint is light, so the label on it is ink rather than white.
  sendText: { ...type.bodyStrong, color: colors.bg },
  why: { ...type.caption, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
  back: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  backText: { ...type.caption, color: colors.textSecondary },
});
