import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { IntakeAnswer, IntakeQuestion, ServiceIntake } from "@pro-now/demo-types";

import { BackButton } from "../components/BackButton";
import { AddressLine } from "../components/AddressLine";
import { customerDarkTheme, depth, elevation, radii, scale, spacing, tabular, tint, type } from "../theme";
import { Mark, type MarkName, ShieldCheckMark } from "../components/marks";
import { ImageSlot, SectionHeader, Surface } from "../components/surfaces";

/**
 * C06 — describing the fault, before anyone is sent.
 *
 * This screen was missing, and its absence showed up as an inconsistency
 * rather than a gap: the professional's job screen displayed photos and a
 * voice note the customer had never been given any way to send. Media
 * appearing on one side of a marketplace that cannot be produced on the
 * other is a fiction, and finding it is exactly what walking the whole
 * journey is for.
 *
 * Why it earns a step of its own, rather than a bigger text box:
 *
 * - **People describe faults badly in writing and well out loud.** "It makes
 *   a noise like this" is thirty seconds of audio and an unanswerable
 *   paragraph. The voice note is the highest-value field here.
 * - **A photo removes a visit.** A professional who sees the fitting before
 *   leaving brings the right part; one who does not comes twice, and the
 *   second visit is the customer's money and morning.
 * - **It is the only moment the customer knows the answer.** Asked later,
 *   on the phone, half of it is forgotten.
 *
 * Nothing here is mandatory. A customer with a burst pipe should be able to
 * press send in four seconds, so every field is optional and the button
 * never waits for one.
 *
 * PLATFORM CAPABILITIES LIVE IN THE APP, NOT HERE. Recording and the camera
 * are handed in as callbacks, because this component is shared by the Expo
 * apps (expo-av, expo-image-picker) and by the web prototype
 * (MediaRecorder, a file input). A presentational screen that reached for a
 * browser API would stop being shippable on a phone.
 */

/**
 * DARK, AND FOUR BLOCKS OF PROSE SHORTER.
 *
 * Amit, looking at this screen: "לא צריך מלא מלא מלל, צריך ממוקד ונגיש."
 * Before the first question it showed a heading, a three-line paragraph
 * about why details help, the service name, a second heading, and a second
 * note saying the questions are optional. Five things, all of them true,
 * none of them what the person opened the screen to do.
 *
 * What survived: one heading, the service name, and the questions. The
 * "everything is optional" promise is now carried by the secondary action
 * under the button — "אפשר לשלוח גם בלי פרטים" — which is where a person
 * actually looks for permission to skip, and where it costs no reading.
 */
const colors = customerDarkTheme.colors;

export interface FaultPhoto {
  id: string;
  /** Local preview URL. Null renders the honest placeholder instead. */
  uri: string | null;
  subjectHe: string;
}

export interface FaultVoice {
  uri: string | null;
  seconds: number;
}

export interface DescribeFaultBodyProps {
  /** Where this order goes (undefined: the line is not shown; null: none chosen yet). */
  orderAddressHe?: string | null;
  orderForHe?: string | null;
  onChangeAddress?: () => void;
  serviceNameHe: string;
  mark: MarkName;
  /** Symptoms already chosen on the service page, shown back for confirmation. */
  symptomsHe: string[];
  /**
   * The questions THIS service asks. Absent for a service with no intake,
   * and the screen is then exactly what it was before — which is the point:
   * a service without a good set of questions must not be given a bad one.
   */
  /**
   * What a photograph would be of, for THIS service — or null when a
   * photograph does not apply and the section should not exist.
   *
   * The screen used to show "תמונות · תמונה אחת של המקום מספיקה. המקצוען
   * יראה איזה חלק צריך" to everyone, which is right for a leak and absurd
   * for a personal trainer. Hiding the section is better than softening the
   * wording: an empty photo grid on a massage booking is a question the
   * customer has to decide to ignore.
   */
  photoPromptHe?: string | null;
  intake?: ServiceIntake;
  answers?: IntakeAnswer[];
  onAnswer?: (answer: IntakeAnswer) => void;
  text: string;
  onChangeText: (v: string) => void;
  photos: FaultPhoto[];
  onAddPhoto?: () => void;
  /**
   * The photo library, which is a different door from the camera.
   *
   * One "הוספה" button that always opened the camera meant a customer who
   * had already photographed the leak an hour ago could not send that
   * photograph — they had to go and take another one.
   */
  onAddFromLibrary?: () => void;
  onRemovePhoto?: (id: string) => void;
  voice: FaultVoice | null;
  recording: boolean;
  /** Seconds recorded so far, while `recording` is true. */
  recordSeconds: number;
  /** Absent when the device or browser cannot record; the row then explains. */
  canRecord: boolean;
  /** Why the microphone cannot be reached, in Hebrew. Null when it can. */
  recordBlockedHe?: string | null;
  onStartRecord?: () => void;
  onStopRecord?: () => void;
  onDeleteVoice?: () => void;
  onSend?: () => void;
  onBack?: () => void;
  /**
   * The example price for what has been chosen so far, in one line — for
   * a fixed or hourly service whose price follows the answers. Null where
   * the price does not depend on them (a visit fee).
   */
  livePriceHe?: string | null;
  /** A sentence this service's customers really say — the recording's example. Never another trade's. */
  voiceExampleHe?: string | null;
  /** What the details are for, in this service's own pricing terms (`pricingKindOf`). */
  detailsNoteHe?: string | null;
  /**
   * A PRICE-LIST SERVICE (a haircut, a dog walk, a cleaning visit): what
   * to order, from the example list, so there is an amount to approve on
   * the card. Nothing else is asked — no problem questions (Amit,
   * 2026-09-29). Absent for work priced only once somebody looks.
   */
  priceList?: Array<{ id: string; nameHe: string; amountHe: string }>;
  /**
   * WHERE TO — towing and moving are priced by the trip. The pickup is the
   * address the call is sent from; this is the other end.
   */
  destination?: { valueHe: string; onChange: (v: string) => void; placeholderHe: string } | null;
  pickedIds?: string[];
  onTogglePick?: (id: string) => void;
  width?: number;
  height?: number;
}

export function DescribeFaultBody({
  orderAddressHe,
  orderForHe = null,
  onChangeAddress,
  serviceNameHe,
  mark,
  symptomsHe,
  photoPromptHe,
  intake,
  answers = [],
  onAnswer,
  text,
  onChangeText,
  photos,
  onAddPhoto,
  onAddFromLibrary,
  onRemovePhoto,
  voice,
  recording,
  recordSeconds,
  canRecord,
  recordBlockedHe = null,
  onStartRecord,
  onStopRecord,
  onDeleteVoice,
  onSend,
  onBack,
  livePriceHe = null,
  detailsNoteHe = null,
  voiceExampleHe = null,
  priceList,
  destination = null,
  pickedIds = [],
  onTogglePick,
  width = 390,
  height = 780,
}: DescribeFaultBodyProps) {

  /* Where the professional prices from the photos (towing, moving…), they come first. */
  const photosFirst = Boolean(destination);
  const photosBlock =
        photoPromptHe !== null ? (
        <View style={styles.block}>
          <SectionHeader title="תמונות" colors={colors} />
          <View style={styles.photoGrid}>
            {photos.map((ph) => (
              <View key={ph.id} style={styles.photoWrap}>
                <ImageSlot uri={ph.uri} subject={ph.subjectHe} ratio={1} colors={colors} />
                <Pressable
                  onPress={() => onRemovePhoto?.(ph.id)}
                  accessibilityRole="button"
                  accessibilityLabel="הסרת תמונה"
                  style={styles.photoRemove}
                >
                  <Text style={styles.photoRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              onPress={onAddPhoto}
              accessibilityRole="button"
              accessibilityLabel="צילום תמונה"
              style={styles.photoAdd}
            >
              <Text style={styles.photoAddPlus}>+</Text>
              <Text style={styles.photoAddText}>צילום</Text>
            </Pressable>

            {onAddFromLibrary ? (
              <Pressable
                onPress={onAddFromLibrary}
                accessibilityRole="button"
                accessibilityLabel="בחירה מהגלריה"
                style={styles.photoAdd}
              >
                <Text style={styles.photoAddPlus}>+</Text>
                <Text style={styles.photoAddText}>גלריה</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.hint}>
            {photoPromptHe ? `${photoPromptHe.replace(/[.,]$/, "")}.` : "תמונה אחת מספיקה."} המקצוען יראה את התמונות לפני שהוא יוצא.
          </Text>
        </View>
        ) : null;

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          {/*
            * ONE CONTROL IN THIS CORNER. The back chevron and the service
            * mark were two overlapping discs in the same place, which is
            * the kind of defect a screenshot catches and a code review
            * never does.
            */}
          <BackButton onPress={onBack} tone={"dark"} placement="inline" />

          <View style={styles.titleRow}>
            <View style={styles.markBubble}>
              <Mark name={mark} size={20} color={colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              {/*
                * Neutral, because this screen is shared by every service.
                * "מה קרה" is right for a burst pipe and wrong for an hour
                * with a trainer — and a heading that assumes a disaster is
                * how a marketplace quietly narrows itself back down to home
                * repairs.
                */}
              <Text style={styles.title}>{intake ? "כמה פרטים" : "מה צריך?"}</Text>
              <Text style={styles.service} numberOfLines={1}>
                {serviceNameHe}
              </Text>
            </View>
          </View>
          {orderAddressHe !== undefined ? <AddressLine addressHe={orderAddressHe} forHe={orderForHe} onChange={onChangeAddress} /> : null}
        </View>

        {symptomsHe.length > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="סימנת" colors={colors} />
            <View style={styles.chips}>
              {symptomsHe.map((sx) => (
                <View key={sx} style={styles.chip}>
                  <Text style={styles.chipText}>{sx}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {destination ? (
          <View style={styles.block}>
            <SectionHeader title="לאן?" colors={colors} />
            <TextInput
              value={destination.valueHe}
              onChangeText={destination.onChange}
              placeholder={destination.placeholderHe}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="כתובת היעד"
              style={styles.destInput}
              textAlign="right"
            />
            <Text style={styles.listNote}>מאיפה — הכתובת שבחרתם. המקצוען רואה את שתיהן לפני שהוא שולח מחיר.</Text>
          </View>
        ) : null}

        {photosFirst ? photosBlock : null}

        {priceList && priceList.length > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="מה להזמין?" colors={colors} />
            <Text style={styles.listNote}>מחירון לדוגמה — כל מקצוען קובע את שלו, ותראו את שלו לפני שתאשרו.</Text>
            {priceList.map((row) => {
              const on = pickedIds.includes(row.id);
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onTogglePick?.(row.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${row.nameHe} ${row.amountHe}`}
                  style={[styles.listRow, on && styles.listRowOn]}
                >
                  <View style={[styles.listBox, on && styles.listBoxOn]}>{on ? <Text style={styles.listTick}>✓</Text> : null}</View>
                  <Text style={[styles.listName, on && { fontWeight: "700" }]} numberOfLines={1}>{row.nameHe}</Text>
                  <Text style={styles.listAmount}>{row.amountHe}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* ---------------- What this service actually needs to know ---- */}
        {intake ? (
          <View style={styles.block}>
            {intake.questions.map((q) => (
              <IntakeRow
                key={q.id}
                question={q}
                answer={answers.find((a) => a.questionId === q.id)}
                onAnswer={onAnswer}
              />
            ))}
          </View>
        ) : null}

        {/* ----------------------------------------------------------------
            WORDS — and this used to be the LAST block on the screen.

            The screen is titled "מה צריך?" and the box you answer it in
            was below the voice recorder and the photo grid, 320 pixels
            past the bottom of the phone. `verify:screens` measured it;
            nobody had noticed it by eye because everybody testing this
            screen already knew the box was down there.

            Amit: *"שורות החיפוש תמיד צריכות להיות בלמעלה של התפריטים...
            אם רוצים לספר מה הבעיה."*

            So it sits directly under the questions now. The structured
            answers stay first — a service that asks "which floor" gets a
            better answer from a field than from a paragraph — and the
            two attachment blocks move below, which costs them nothing:
            a voice note is something you decide to add, not something
            you fail to find.
            ---------------------------------------------------------------- */}
        <View style={styles.block}>
          <SectionHeader title={intake ? "עוד משהו במילים שלך" : "במילים שלך"} colors={colors} />
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={
              intake
                ? "כל דבר שהשאלות לא כיסו"
                : "מתי זה התחיל, מה כבר ניסית, כל דבר שיעזור"
            }
            accessibilityLabel="מה צריך, במילים שלך"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={styles.textArea}
            textAlign="right"
          />
        </View>

        {/* ---------------- Voice — the field that carries the most ------ */}
        <View style={styles.block}>
          <SectionHeader title="הקלטה קולית" colors={colors} />
          <Surface colors={colors} level={1}>
            {voice ? (
              <View style={styles.voiceDone}>
                <View style={styles.voiceBadge}>
                  <Text style={styles.voiceBadgeText}>
                    {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, "0")}
                  </Text>
                </View>
                <Text style={styles.voiceDoneText}>הקלטה נשמרה ותישלח למקצוען</Text>
                <Pressable onPress={onDeleteVoice} accessibilityRole="button">
                  <Text style={styles.deleteLink}>מחיקה</Text>
                </Pressable>
              </View>
            ) : canRecord ? (
              <Pressable
                onPress={recording ? onStopRecord : onStartRecord}
                accessibilityRole="button"
                accessibilityLabel={recording ? "עצירת הקלטה" : "התחלת הקלטה"}
                style={({ pressed }) => [
                  styles.recordBtn,
                  recording && styles.recordBtnActive,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={[styles.recordDot, recording && styles.recordDotActive]} />
                <Text style={[styles.recordLabel, recording && { color: colors.statusDanger }]}>
                  {recording
                    ? `מקליט · ${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")} · לחץ לעצירה`
                    : "להקליט הסבר קצר"}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.cannot}>
                {/* The specific reason when we have one. "המכשיר לא
                    מאפשר" is wrong and unhelpful when the truth is that
                    the preview is in a frame without microphone access. */}
                {recordBlockedHe ?? "המכשיר או הדפדפן הזה לא מאפשר הקלטה."} אפשר לכתוב במקום.
              </Text>
            )}
            <Text style={styles.hint}>
              {voiceExampleHe
                ? `הכי קל פשוט לדבר, למשל: "${voiceExampleHe}". מה שקשה לכתוב — קל להגיד.`
                : "הכי קל פשוט לדבר — מה שקשה לכתוב, קל להגיד."}
            </Text>
          </Surface>
        </View>

        {photosFirst ? null : photosBlock}

        <View style={styles.block}>
          <View style={styles.privacyRow}>
            <ShieldCheckMark size={15} color={colors.trust} />
            <Text style={styles.privacyText}>
              מה שמוסיפים נשלח רק למקצוען שיקבל את הקריאה, ואחרי שהוא מקבל אותה. הכתובת המלאה נחשפת
              באותו רגע — לא לפניו.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.cta}>
        {livePriceHe ? (
          <View style={styles.livePrice} accessibilityLiveRegion="polite">
            <Text style={styles.livePriceText}>{livePriceHe}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={onSend}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
        >
          {/* Never blocked on a field. Someone with a burst pipe presses send
              in four seconds, and this screen must let them. */}
          <Text style={styles.ctaLabel}>שליחת הקריאה</Text>
        </Pressable>

        {/*
          * WHAT THESE DETAILS DO NOT DO: set the price. A tester added
          * detail after detail and watched the price stay put, and asked
          * what decides it. The professional's own price does — shown before
          * you accept him — and on work that needs a look, his quote.
          */}
        <Text style={styles.ctaNote}>
          {detailsNoteHe ??
            (priceList && priceList.length > 0
              ? "כל מקצוען קובע את המחירון שלו — ותראו את המחיר שלו לפני שתאשרו."
              : "התיאור, ההקלטה והתמונות עוזרים למקצוען להגיע מוכן.")}
        </Text>
      </View>
    </View>
  );
}

/**
 * One question.
 *
 * ALL OPTIONS ARE VISIBLE AT ONCE — no dropdown, no "show more". A dropdown
 * hides the shape of the question, and someone holding a phone over a
 * leaking pipe should be able to see every answer and hit one. It costs
 * vertical space, which is the cheapest thing on this screen.
 *
 * Tapping a chosen option UNSETS it, because the alternative is a customer
 * who mis-tapped being stuck with an answer the professional will act on.
 */
function IntakeRow({
  question,
  answer,
  onAnswer,
}: {
  question: IntakeQuestion;
  answer?: IntakeAnswer;
  onAnswer?: (a: IntakeAnswer) => void;
}) {
  const chosen = answer?.optionIds ?? [];
  const opts =
    question.kind === "YESNO"
      ? [
          { id: "yes", labelHe: "כן" },
          { id: "no", labelHe: "לא" },
          // "לא יודע" is a first-class answer, offered as plainly as the
          // other two. Leaving it out pushes people into guessing, and a
          // guess is worse than a gap because it gets acted on.
          { id: "unknown", labelHe: "לא יודע" },
        ]
      : (question.options ?? []);

  const pick = (id: string) => {
    if (!onAnswer) return;
    if (question.kind === "MULTI") {
      const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
      onAnswer({ questionId: question.id, optionIds: next });
    } else {
      onAnswer({ questionId: question.id, optionIds: chosen.includes(id) ? [] : [id] });
    }
  };

  return (
    <View style={styles.q}>
      <Text style={styles.qPrompt}>{question.promptHe}</Text>

      {question.kind === "TEXT" ? (
        <TextInput
          value={answer?.textValue ?? ""}
          onChangeText={(v) => onAnswer?.({ questionId: question.id, textValue: v })}
          placeholder={question.placeholderHe}
          accessibilityLabel={question.promptHe}
          placeholderTextColor={colors.textSecondary}
          style={styles.qInput}
          textAlign="right"
        />
      ) : question.kind === "NUMBER" ? (
        <View style={styles.qOpts}>
          {numberChoices(question).map((n) => {
            const on = answer?.numberValue === n;
            return (
              <Pressable
                key={n}
                onPress={() =>
                  onAnswer?.({
                    questionId: question.id,
                    numberValue: on ? undefined : n,
                  })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${question.promptHe} ${n}`}
                style={[styles.qOpt, on && styles.qOptOn]}
              >
                <Text style={[styles.qOptText, on && styles.qOptTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
          {question.unitHe ? <Text style={styles.qUnit}>{question.unitHe}</Text> : null}
        </View>
      ) : (
        <View style={styles.qOpts}>
          {opts.map((o) => {
            const on = chosen.includes(o.id);
            return (
              <Pressable
                key={o.id}
                onPress={() => pick(o.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${question.promptHe} ${o.labelHe}`}
                style={[styles.qOpt, on && styles.qOptOn]}
              >
                <Text style={[styles.qOptText, on && styles.qOptTextOn]}>{o.labelHe}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * A NUMBER question becomes a row of taps, not a keyboard.
 *
 * "כמה חדרים?" with a numeric keyboard is four interactions — focus, type,
 * dismiss, verify — for an answer between 1 and 6. Capped at eight choices
 * so the row never wraps into a wall of digits.
 */
function numberChoices(q: IntakeQuestion): number[] {
  const min = Math.max(1, q.min ?? 1);
  const max = Math.max(min, q.max ?? min + 5);
  const out: number[] = [];
  for (let n = min; n <= max && out.length < 8; n += 1) out.push(n);
  return out;
}

const styles = StyleSheet.create({
  destInput: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...type.body,
    writingDirection: "rtl",
    marginBottom: spacing.xs,
  },
  listNote: { ...type.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", marginBottom: spacing.xs },
  listRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  listRowOn: { borderColor: colors.action, backgroundColor: tint.action(0.1) },
  listBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textSecondary, alignItems: "center", justifyContent: "center" },
  listBoxOn: { borderColor: colors.action, backgroundColor: colors.action },
  listTick: { ...type.microStrong, color: colors.onAction },
  listName: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: "right", writingDirection: "rtl" },
  listAmount: { ...type.bodyStrong, color: colors.textPrimary, ...tabular },
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: 132 },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: "flex-end" },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, alignSelf: "stretch" },
  markBubble: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: depth.panel.mid,
    alignItems: "center",
    justifyContent: "center",
    ...depth.litEdge(0.07),
  },
  title: { ...type.title, color: colors.textPrimary, writingDirection: "rtl", textAlign: "right" },
  service: { ...type.meta, color: colors.textSecondary, writingDirection: "rtl", textAlign: "right" },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  intakeNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: spacing.md,
  },
  q: { marginBottom: spacing.lg },
  qPrompt: {
    ...type.bodyStrong,
    fontSize: scale.meta,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: spacing.sm,
  },
  qOpts: { flexDirection: "row-reverse", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  qOpt: {
    minHeight: 44,
    // 44 in BOTH directions. "כן" is two narrow letters, so padding alone
    // left a 37px-wide target — tall enough to pass a height check and still
    // too small to hit with a thumb.
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  qOptOn: { borderColor: colors.action, backgroundColor: tint.action(0.1) },
  qOptText: { ...type.caption, fontSize: scale.meta, color: colors.textPrimary, writingDirection: "rtl" },
  qOptTextOn: { color: colors.actionText, fontWeight: "700" },
  qUnit: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  qInput: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    ...type.body,
    color: colors.textPrimary,
  },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: tint.action(0.12),
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  chipText: { ...type.captionStrong, color: colors.actionText, writingDirection: "rtl" },

  recordBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    minHeight: 58,
    borderRadius: radii.md,
    backgroundColor: tint.action(0.1),
  },
  recordBtnActive: { backgroundColor: tint.danger(0.12) },
  recordDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.action },
  recordDotActive: { backgroundColor: colors.statusDanger, borderRadius: 3 },
  recordLabel: { ...type.bodyStrong, fontSize: scale.meta, color: colors.actionText, writingDirection: "rtl" },

  voiceDone: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  voiceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: tint.trust(0.14),
  },
  voiceBadgeText: { ...type.captionStrong, ...tabular, color: colors.trust },
  voiceDoneText: { ...type.caption, flex: 1, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  deleteLink: { ...type.captionStrong, color: colors.statusDanger },

  cannot: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  hint: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
    lineHeight: 18,
  },

  photoGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  photoWrap: { width: "31%", position: "relative" },
  photoRemove: {
    position: "absolute",
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: { color: "#FFFFFF", fontSize: scale.meta, lineHeight: 17 },
  photoAdd: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radii.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  photoAddPlus: { fontSize: scale.section, color: colors.actionText, lineHeight: 30 },
  photoAddText: { ...type.caption, fontSize: scale.micro, color: colors.textSecondary },

  textArea: {
    minHeight: 96,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    padding: spacing.md,
    ...type.body,
    fontSize: scale.meta,
    color: colors.textPrimary,
    writingDirection: "rtl",
    textAlignVertical: "top",
  },

  privacyRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm },
  privacyText: {
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
    minHeight: 58,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
  livePrice: {
    marginBottom: spacing.sm,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tint.neutralDark(0.07),
  },
  livePriceText: { ...type.metaStrong, color: colors.actionText, textAlign: "center", writingDirection: "rtl" },
  ctaNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.sm,
  },
});
