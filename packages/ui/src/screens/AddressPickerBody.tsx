import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { BackButton, BACK_BUTTON_CLEARANCE } from "../components/BackButton";
import { customerTheme, elevation, radii, scale, spacing, tint, type } from "../theme";
import { ClockMark, PinMark, ShieldCheckMark } from "../components/marks";
import { Persona } from "../components/Persona";
import { SectionHeader, Surface } from "../components/surfaces";

/**
 * C05 — where should the professional actually go?
 *
 * This started as a decorative chip at the top of the home screen and was
 * the first thing a real user pressed. That is worth taking seriously,
 * because the address is not a setting — it is the single fact the whole
 * dispatch is aimed at, and getting it wrong sends a stranger to the wrong
 * door.
 *
 * The feature that reframed this screen: **a call is often not for the
 * person holding the phone.** Someone books a plumber for a parent who does
 * not use apps. That is not an edge case to bolt on later; it changes what
 * the product is asking. So "for someone else" is a first-class mode here,
 * and when it is on, the screen collects the two things the professional
 * actually needs — who will open the door, and the number to call when they
 * arrive. Without those, the job fails at the doorstep no matter how good
 * the dispatch was.
 *
 * Honesty notes:
 *
 * - **Live location is a real request, not a decoration.** Tapping it asks
 *   the device. If permission is refused or unavailable, the screen says so
 *   and offers typing instead; it never silently invents a location.
 * - **A coordinate is not a street address.** Turning one into "רחוב X 12"
 *   needs a geocoding vendor, which is an open business decision
 *   (/CLAUDE.md §4). Until one is chosen this screen shows the coarse
 *   position honestly and asks for the details it cannot derive.
 * - The recipient's phone is collected but never shown to the professional
 *   before assignment (/docs/12-PRIVACY.md).
 */

const colors = customerTheme.colors;

export interface SavedAddress {
  id: string;
  /** "בית", "עבודה", "אצל סבא" */
  labelHe: string;
  formattedHe: string;
  /** Set when this address belongs to someone else. */
  forSomeoneElseNameHe?: string | null;
}

export type LiveLocationState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "ready"; coarseLabelHe: string }
  | { status: "denied" }
  | { status: "unavailable" };

/** A street from the official list, offered while the customer types. */
export interface AddressSuggestion {
  localityCode: number;
  streetCode: number;
  streetName: string;
  localityName: string;
  houseNumber: string | null;
  /** The locality itself: a village without named streets. */
  wholeLocality: boolean;
}

export type AddressSuggestionsState = "idle" | "loading" | "ready" | "error";

/**
 * Where the professional goes: ONE of these, never two at once. Typed
 * text alone is none of them — it only finds a street to pick.
 */
export type AddressChoice =
  | { kind: "saved"; addressId: string }
  | { kind: "street"; suggestion: AddressSuggestion; houseNumber: string; detailsHe: string }
  | { kind: "live"; detailsHe: string };

export interface AddressPickerResult {
  choice: AddressChoice;
  forSomeoneElse: boolean;
  recipientNameHe: string;
  recipientPhone: string;
}

export interface AddressPickerBodyProps {
  saved: SavedAddress[];
  /** The saved address chosen when the screen opens, if any. */
  selectedId: string | null;
  liveLocation: LiveLocationState;
  /** W6 owns the order-level recipient; until then the affordance is visible but closed. */
  forSomeoneElseEnabled?: boolean;
  /** Streets for the text in the box, from two characters; the caller fetches them. */
  suggestions?: AddressSuggestion[];
  suggestionsState?: AddressSuggestionsState;
  onQueryChange?: (text: string) => void;
  /** The confirmed address is being placed on the map. */
  saving?: boolean;
  /** Why the last confirm did not go through, in the customer's words. */
  errorHe?: string | null;
  onUseLiveLocation?: () => void;
  onSelect?: (id: string) => void;
  /** Take an address off my list (the demo's ×). */
  onRemove?: (id: string) => void;
  onConfirm?: (result: AddressPickerResult) => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

/** What the box needs before it starts suggesting. */
export const SUGGEST_MIN_CHARS = 2;
const HOUSE_NUMBER = /^\d{1,4}[א-ת]?$/;

type Picked =
  | { kind: "saved"; id: string }
  | { kind: "street"; suggestion: AddressSuggestion }
  | { kind: "live" }
  | null;

export function AddressPickerBody({
  saved,
  selectedId,
  liveLocation,
  forSomeoneElseEnabled = true,
  suggestions = [],
  suggestionsState = "idle",
  onQueryChange,
  saving = false,
  errorHe = null,
  onUseLiveLocation,
  onSelect,
  onRemove,
  onConfirm,
  onBack,
  width = 390,
  height = 780,
}: AddressPickerBodyProps) {
  const [typed, setTyped] = useState("");
  /*
   * ONE CHOICE, NOT THREE THAT RACE.
   *
   * This screen used to hold a saved address (always one: the first, by
   * default), the typed text and the live location side by side, and the
   * confirm took whichever it checked first. So typing a new address and
   * confirming quietly kept the old one, and the other way round (Dvir,
   * 2026-10-01). Now picking any of them un-picks the others.
   */
  const [pick, setPick] = useState<Picked>(selectedId ? { kind: "saved", id: selectedId } : null);
  const [houseNumber, setHouseNumber] = useState("");
  const [details, setDetails] = useState("");
  const [forOther, setForOther] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  // The live card is a choice only once the device has answered.
  const livePicked = pick?.kind === "live" && liveLocation.status === "ready";
  const houseOk = pick?.kind !== "street" || houseNumber.trim() === "" || HOUSE_NUMBER.test(houseNumber.trim());
  const hasPlace = pick?.kind === "saved" || pick?.kind === "street" || livePicked;
  // Sending someone to a stranger's door without a name and a number is how
  // a job fails at the doorstep, so the CTA waits for both.
  const recipientOk = !forOther || (recipientName.trim().length > 1 && recipientPhone.trim().length >= 9);
  const canConfirm = hasPlace && houseOk && recipientOk && !saving;
  const searching = pick?.kind !== "street" && typed.trim().length >= SUGGEST_MIN_CHARS;

  const changeTyped = (text: string) => {
    setTyped(text);
    // Typing is looking for a new address: whatever was picked is not it.
    if (pick?.kind !== "street") setPick(null);
    onQueryChange?.(text);
  };
  const pickStreet = (suggestion: AddressSuggestion) => {
    setPick({ kind: "street", suggestion });
    setHouseNumber(suggestion.houseNumber ?? "");
  };
  const pickSaved = (id: string) => {
    setPick({ kind: "saved", id });
    setTyped("");
    onSelect?.(id);
  };
  const pickLive = () => {
    setPick({ kind: "live" });
    setTyped("");
    onUseLiveLocation?.();
  };
  const unpickStreet = () => {
    setPick(null);
    setHouseNumber("");
  };
  const confirm = () => {
    if (!canConfirm || !pick) return;
    const choice: AddressChoice =
      pick.kind === "saved"
        ? { kind: "saved", addressId: pick.id }
        : pick.kind === "street"
          ? { kind: "street", suggestion: pick.suggestion, houseNumber: houseNumber.trim(), detailsHe: details.trim() }
          : { kind: "live", detailsHe: details.trim() };
    onConfirm?.({ choice, forSomeoneElse: forOther, recipientNameHe: recipientName.trim(), recipientPhone: recipientPhone.trim() });
  };
  const ctaLabel = saving
    ? "מאתרים את הכתובת במפה…"
    : forOther && !recipientOk
      ? "צריך שם וטלפון של מי שבבית"
      : !hasPlace && typed.trim()
        ? "בחרו כתובת מהרשימה"
        : "אישור הכתובת";

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <BackButton onPress={onBack} tone={"light"} placement="absolute" />
          <Text style={styles.title}>לאן לשלוח את המקצוען?</Text>
          <Text style={styles.subtitle}>הכתובת המלאה נחשפת רק אחרי שמקצוען מקבל את הקריאה.</Text>
        </View>

        {/*
         * ---------------- Where to type it ----------------
         *
         * THIS BOX WAS AT THE BOTTOM AND IT IS THE POINT OF THE SCREEN.
         *
         * It used to be the fourth block down, under the location card and
         * under however many saved addresses somebody had — so a person
         * with five saved addresses had to scroll past all of them to type
         * a sixth. The old copy admitted it in as many words: "type an
         * address BELOW", written twice, pointing down at something off
         * the bottom of the screen.
         *
         * A box you have to go looking for is a box people do not find.
         * Where you SAY the thing goes at the top of the screen; the
         * shortcuts to say it faster go underneath.
         */}
        <View style={styles.block}>
          <SectionHeader title="הקלידו כתובת" colors={colors} />
          {pick?.kind === "street" ? (
            /*
             * The street is settled — it is a real one, from the official
             * list — so what is left is the door: the number, and the
             * floor and flat the professional will ask for at the gate.
             */
            <View style={{ gap: spacing.sm }}>
              <View style={[styles.savedCard, styles.pickedCard]}>
                <View style={styles.savedRow}>
                  <View style={[styles.savedIcon, { backgroundColor: tint.action(0.14) }]}>
                    <PinMark size={17} color={colors.action} />
                  </View>
                  <View style={styles.savedText}>
                    <Text style={styles.savedLabel} numberOfLines={1}>
                      {pick.suggestion.wholeLocality ? pick.suggestion.localityName : pick.suggestion.streetName}
                    </Text>
                    {pick.suggestion.wholeLocality ? null : (
                      <Text style={styles.savedAddr} numberOfLines={1}>
                        {pick.suggestion.localityName}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={unpickStreet} accessibilityRole="button" accessibilityLabel="החלפת הרחוב" hitSlop={10}>
                    <Text style={styles.change}>החלפה</Text>
                  </Pressable>
                </View>
              </View>
              {pick.suggestion.wholeLocality ? null : (
                <TextInput
                  value={houseNumber}
                  onChangeText={setHouseNumber}
                  placeholder="מספר בית"
                  accessibilityLabel="מספר בית"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, !houseOk && { borderColor: colors.statusDanger }]}
                  textAlign="right"
                />
              )}
              {!houseOk ? (
                <Text style={styles.fieldNote}>מספר בית הוא מספר, ואולי אות אחריו — למשל 12 או 12א.</Text>
              ) : houseNumber.trim() === "" && !pick.suggestion.wholeLocality ? (
                <Text style={styles.fieldNote}>בלי מספר בית המקצוען מגיע לרחוב, לא לדלת.</Text>
              ) : null}
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="קומה, כניסה ודירה (לא חובה)"
                accessibilityLabel="קומה, כניסה ודירה"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                textAlign="right"
              />
            </View>
          ) : (
            <>
              <TextInput
                value={typed}
                onChangeText={changeTyped}
                placeholder="רחוב ומספר, ואפשר גם עיר"
                accessibilityLabel="כתובת חדשה"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                textAlign="right"
                autoCorrect={false}
              />
              {searching ? (
                <Surface colors={colors} level={1} style={styles.suggestions}>
                  {suggestions.map((s, i) => (
                    <Pressable
                      key={`${s.localityCode}:${s.streetCode}`}
                      onPress={() => pickStreet(s)}
                      accessibilityRole="button"
                      accessibilityLabel={suggestionLabel(s)}
                      style={({ pressed }) => [styles.suggestion, i > 0 && styles.suggestionRule, pressed && { opacity: 0.7 }]}
                    >
                      <View style={styles.savedRow}>
                        <PinMark size={15} color={colors.textSecondary} />
                        <View style={styles.savedText}>
                          <Text style={styles.suggestionTitle} numberOfLines={1}>
                            {s.wholeLocality ? s.localityName : `${s.streetName}${s.houseNumber ? ` ${s.houseNumber}` : ""}`}
                          </Text>
                          {s.wholeLocality ? null : (
                            <Text style={styles.savedAddr} numberOfLines={1}>
                              {s.localityName}
                            </Text>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                  {suggestions.length === 0 ? (
                    <Text style={styles.suggestionNote}>
                      {suggestionsState === "error"
                        ? "החיפוש לא זמין כרגע. אפשר לבחור את המיקום שלי עכשיו."
                        : suggestionsState === "ready"
                          ? "לא מצאנו רחוב כזה. בדקו את האיות, או בחרו את המיקום שלי עכשיו."
                          : "מחפשים…"}
                    </Text>
                  ) : null}
                </Surface>
              ) : null}
            </>
          )}
        </View>

        {/* ---------------- Live location ---------------- */}
        <View style={styles.block}>
          <Pressable
            onPress={pickLive}
            accessibilityRole="radio"
            aria-checked={livePicked}
            style={({ pressed }) => [styles.liveCard, livePicked && styles.liveCardOn, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.liveIcon}>
              <PinMark size={19} color={colors.action} />
            </View>
            <View style={styles.liveText}>
              <Text style={styles.liveTitle}>
                {liveLocation.status === "asking" ? "מאתרים אותך…" : "המיקום שלי עכשיו"}
              </Text>
              <Text style={styles.liveSub} numberOfLines={2}>
                {liveLocation.status === "ready"
                  ? liveLocation.coarseLabelHe
                  : liveLocation.status === "denied"
                    ? "אין הרשאת מיקום. אפשר להפעיל בהגדרות, או פשוט להקליד כתובת למעלה."
                    : liveLocation.status === "unavailable"
                      ? "לא הצלחנו לאתר מיקום במכשיר הזה. הקלידו כתובת למעלה."
                      : "נשתמש במיקום המכשיר"}
              </Text>
            </View>
            {livePicked ? (
              <View style={styles.tick}>
                <ShieldCheckMark size={15} color={colors.trust} />
              </View>
            ) : null}
          </Pressable>

          {livePicked ? (
            // A coordinate is not a door. Saying so is cheaper than sending a
            // professional to the middle of the street.
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="קומה, כניסה ודירה"
                accessibilityLabel="קומה, כניסה ודירה"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                textAlign="right"
              />
              <Text style={styles.fieldNote}>בלי קומה ודירה המקצוען מגיע לבניין, לא לדלת.</Text>
            </View>
          ) : null}
        </View>

        {/* ---------------- Saved ---------------- */}
        {saved.length > 0 ? (
          <View style={styles.block}>
            <SectionHeader title="הכתובות שלי" colors={colors} />
            <View style={{ gap: spacing.sm }}>
              {saved.map((a) => {
                const on = pick?.kind === "saved" && pick.id === a.id;
                return (
                  <View key={a.id}>
                  <Pressable onPress={() => pickSaved(a.id)} accessibilityRole="radio" aria-checked={on}>
                    <Surface
                      colors={colors}
                      level={1}
                      style={[styles.savedCard, on && { borderColor: colors.action, borderWidth: 2 }]}
                    >
                      <View style={styles.savedRow}>
                        <View style={[styles.savedIcon, on && { backgroundColor: tint.action(0.14) }]}>
                          {a.forSomeoneElseNameHe ? (
                            <Persona seed={a.id} size={30} />
                          ) : (
                            <PinMark size={17} color={on ? colors.action : colors.textSecondary} />
                          )}
                        </View>
                        <View style={styles.savedText}>
                          <Text style={styles.savedLabel} numberOfLines={1}>
                            {a.labelHe}
                            {a.forSomeoneElseNameHe ? (
                              <Text style={styles.savedFor}> · עבור {a.forSomeoneElseNameHe}</Text>
                            ) : null}
                          </Text>
                          <Text style={styles.savedAddr} numberOfLines={1}>
                            {a.formattedHe}
                          </Text>
                        </View>
                        <View style={[styles.radio, on && styles.radioOn]} />
                      </View>
                    </Surface>
                  </Pressable>
                  {/* Removing an address from my list (Dvir, 2026-10-02: "אין אפשרות להסיר כתובת"). */}
                  {onRemove ? (
                    <Pressable
                      onPress={() => {
                        // The one that is gone is no longer the choice; nothing else is chosen for you.
                        if (on) setPick(null);
                        onRemove(a.id);
                      }}
                      accessibilityRole="button"
                      // The address too: unlabelled rows all read "כתובת", and a screen reader must tell them apart.
                      accessibilityLabel={`הסרת הכתובת ${a.labelHe} · ${a.formattedHe}`}
                      hitSlop={8}
                      style={styles.remove}
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ---------------- For someone else ---------------- */}
        <View style={styles.block}>
          <Surface colors={colors} level={1}>
            <View style={styles.switchRow}>
              <Switch
                accessibilityLabel="הקריאה היא בשביל מישהו אחר"
                value={forOther}
                onValueChange={setForOther}
                disabled={!forSomeoneElseEnabled}
                trackColor={{ true: colors.action, false: colors.border }}
                thumbColor="#FFFFFF"
              />
              <View style={styles.switchText}>
                <Text style={[styles.switchTitle, !forSomeoneElseEnabled && { color: colors.textSecondary }]}>הקריאה היא בשביל מישהו אחר</Text>
                <Text style={styles.switchSub}>
                  {forSomeoneElseEnabled
                    ? "מזמינים עבור הורה, סבא או שכן? המקצוען צריך לדעת מי פותח את הדלת."
                    : "הזמנה עבור מישהו אחר תיפתח בשלב הבא — אחרי שהקריאה הרגילה תעבוד."}
                </Text>
              </View>
            </View>

            {forOther ? (
              <View style={styles.recipient}>
                <TextInput
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="שם מי שנמצא בבית"
                  accessibilityLabel="שם מי שנמצא בבית"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                  textAlign="right"
                />
                <TextInput
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                  placeholder="טלפון שלו"
                  accessibilityLabel="טלפון של מי שנמצא בבית"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                  style={styles.input}
                  textAlign="right"
                />
                <View style={styles.privacyRow}>
                  <ClockMark size={13} color={colors.textSecondary} />
                  <Text style={styles.privacyText}>
                    העדכונים על ההגעה יגיעו אליך. המספר שלו נחשף למקצוען רק אחרי שהקריאה שויכה, ודרך
                    מספר מסווה.
                  </Text>
                </View>
              </View>
            ) : null}
          </Surface>
        </View>
      </ScrollView>

      <View style={styles.cta}>
        {errorHe ? <Text style={styles.error}>{errorHe}</Text> : null}
        <Pressable
          disabled={!canConfirm}
          onPress={confirm}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.ctaBtn,
            !canConfirm && { backgroundColor: colors.border },
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={[styles.ctaLabel, !canConfirm && { color: colors.textSecondary }]}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function suggestionLabel(s: AddressSuggestion): string {
  return s.wholeLocality ? s.localityName : `${s.streetName}${s.houseNumber ? ` ${s.houseNumber}` : ""}, ${s.localityName}`;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden", borderRadius: radii.xl },
  scroll: { paddingBottom: 116 },

  /* Clear of the back button, which sat on the title's last word. */
  head: { paddingHorizontal: spacing.lg, paddingTop: BACK_BUTTON_CLEARANCE, alignItems: "flex-end" },
  // 44x44 minimum. A 25px chevron is a control most thumbs miss, which
  // is the same defect that made the demo bar unhittable.
  title: { ...type.h1, color: colors.textPrimary, writingDirection: "rtl", textAlign: "right" },
  subtitle: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
  },

  block: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },

  liveCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...elevation(1),
  },
  liveCardOn: { borderWidth: 2, borderColor: colors.action },
  liveIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: tint.action(0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  liveText: { flex: 1, alignItems: "flex-end" },
  liveTitle: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  liveSub: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tint.trust(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  liveNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  savedCard: { paddingVertical: spacing.md, borderWidth: 2, borderColor: "transparent" },
  pickedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    borderColor: colors.action,
  },
  change: { ...type.bodyStrong, fontSize: scale.meta, color: colors.actionText },

  suggestions: { marginTop: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  suggestion: { justifyContent: "center", minHeight: 52, paddingVertical: spacing.sm },
  suggestionRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  suggestionTitle: { ...type.bodyStrong, fontSize: scale.meta, color: colors.textPrimary, writingDirection: "rtl" },
  suggestionNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    paddingVertical: spacing.md,
    lineHeight: 18,
  },
  fieldNote: { ...type.caption, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl", lineHeight: 18 },
  error: {
    ...type.caption,
    color: colors.statusDanger,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  savedRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  savedIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  savedText: { flex: 1, alignItems: "flex-end" },
  savedLabel: { ...type.bodyStrong, color: colors.textPrimary, writingDirection: "rtl" },
  savedFor: { ...type.caption, color: colors.actionText },
  savedAddr: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  remove: { position: "absolute", top: 6, left: 6, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tint.neutralDark(0.06) },
  removeText: { color: colors.textSecondary, fontSize: scale.body, fontWeight: "800", lineHeight: 20 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioOn: { borderColor: colors.action, borderWidth: 6 },

  input: {
    minHeight: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...type.body,
    fontSize: scale.meta,
    color: colors.textPrimary,
    writingDirection: "rtl",
  },

  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  switchText: { flex: 1, alignItems: "flex-end" },
  switchTitle: { ...type.bodyStrong, fontSize: scale.meta, color: colors.textPrimary, writingDirection: "rtl" },
  switchSub: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  recipient: { gap: spacing.sm, marginTop: spacing.lg },
  privacyRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.xs },
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
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: { ...type.bodyStrong, fontSize: scale.body, color: colors.onAction },
});
