import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  customerPriceLineHe,
  formFor,
  payoutNoteHe,
  priceViolations,
  pricedForDispatch,
  type PricingModel,
  type ProServicePrice,
} from "@pro-now/types";

import { BackButton } from "../components/BackButton";
import { Mark, type MarkName } from "../components/marks";
import { SectionHeader, Surface } from "../components/surfaces";
import { proTheme, radii, spacing, type } from "../theme";

/**
 * P05 — WHERE THE PROFESSIONAL SETS THEIR OWN PRICE.
 *
 * ---------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS
 * ---------------------------------------------------------------------
 * דורון asked Amit the question a professional asks first: *"איפה נקבע
 * המחיר?"* The answer was clear — the professional sets their call-out
 * price themselves, it lives on their card, the quote for the work comes
 * after they have seen the fault, and nothing starts until both sides
 * approve. Every part of that existed in the types. None of it existed as a
 * screen, so the honest answer to דורון was "designed, not built".
 *
 * ---------------------------------------------------------------------
 * FOUR THINGS IT WILL NOT DO
 * ---------------------------------------------------------------------
 * 1. **No recommended price, no average.** Both are claims about a market
 *    that has not opened. A "recommended" number on an empty marketplace is
 *    the platform setting prices while appearing not to.
 * 2. **No net figure.** The commission is an undecided business question
 *    (/CLAUDE.md §4), so the professional is shown what the CUSTOMER pays —
 *    the thing they are actually setting — and told the payout terms are
 *    not final. `payoutNoteHe` computes a net the day a commission exists
 *    and not one minute earlier.
 * 3. **No price where the service does not have one to set.** A call-out
 *    fee for a haircut is a fee for arriving. The form each service shows
 *    comes from its pricing model, and a distance-and-time service says
 *    plainly that its tariff waits on the maps vendor.
 * 4. **Unpriced is not free.** A service with no price cannot be
 *    dispatched, and the row says so — rather than quietly sending somebody
 *    out for an amount nobody agreed.
 *
 * The screen is a view over `pro-pricing.ts`, which holds every rule and is
 * tested without a renderer.
 */

const colors = proTheme.colors;

export interface ProPricingRow {
  serviceId: string;
  nameHe: string;
  mark: MarkName;
  pricingModel: PricingModel;
  /** What they have already set, in agorot. Null means not set yet. */
  amountMinorUnits: number | null;
  /** Set when this service is not dispatchable for a reason other than price. */
  blockedReasonHe?: string | null;
}

export interface ProPricingBodyProps {
  rows: readonly ProPricingRow[];
  /**
   * The platform's cut. NULL until somebody decides it, and null is the
   * expected value today — see /CLAUDE.md §4. It is a prop rather than a
   * constant so that there is nowhere to put a default.
   */
  commissionPercent?: number | null;
  onChange?: (serviceId: string, amountMinorUnits: number | null) => void;
  /** Night/Shabbat surcharge, in percent. Null: none. */
  afterHoursPercent?: number | null;
  onAfterHoursChange?: (percent: number | null) => void;
  /** The jobs he does and what each costs — his quotes are built from these. */
  priceList?: readonly { id: string; nameHe: string; amountMinorUnits: number }[];
  /** False for a professional whose services are priced only by visit-and-diagnosis: no price list to show. */
  showPriceList?: boolean;
  /** False where the surcharge cannot be saved yet: a field that is not kept would be a promise. */
  showAfterHours?: boolean;
  onPriceListChange?: (list: { id: string; nameHe: string; amountMinorUnits: number }[]) => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

/**
 * What the professional typed, read as money.
 *
 * Accepts "180", "180.5" and an empty box, and returns null for the empty
 * box rather than zero — the difference between "I have not said" and "it
 * is free", which is the distinction the whole screen turns on. Anything
 * that is not a number at all returns undefined, and the caller keeps the
 * previous value rather than wiping what they had.
 */
function readShekels(text: string): number | null | undefined {
  const t = text.trim().replace(/[^\d.]/g, "");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

export function ProPricingBody({
  rows,
  commissionPercent = null,
  onChange,
  afterHoursPercent = null,
  onAfterHoursChange,
  priceList = [],
  showPriceList = true,
  showAfterHours = true,
  onPriceListChange,
  onBack,
  width = 390,
  height = 780,
}: ProPricingBodyProps) {
  /*
   * The text boxes hold TEXT, not money.
   *
   * Storing the parsed number and re-formatting it on every keystroke is
   * what makes a price field impossible to type in: delete the last digit
   * of "180" and it becomes 18, re-renders as "18", and the cursor jumps.
   * So the string is local to the screen and the parsed value is what
   * leaves it.
   */
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.serviceId, r.amountMinorUnits === null ? "" : String(r.amountMinorUnits / 100)])
    )
  );

  const [ahDraft, setAhDraft] = useState(afterHoursPercent === null ? "" : String(afterHoursPercent));
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const addItem = () => {
    const amount = readShekels(newPrice);
    if (!newName.trim() || amount === null || amount === undefined || amount <= 0) return;
    onPriceListChange?.([...priceList, { id: `i${Date.now()}`, nameHe: newName.trim(), amountMinorUnits: amount }]);
    setNewName("");
    setNewPrice("");
  };

  const readyCount = useMemo(
    () =>
      rows.filter((r) =>
        pricedForDispatch({
          serviceId: r.serviceId,
          pricingModel: r.pricingModel,
          amountMinorUnits: r.amountMinorUnits,
        })
      ).length,
    [rows]
  );

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {onBack ? (
          <View style={styles.backRow}>
            <BackButton onPress={onBack} tone="dark" placement="inline" />
          </View>
        ) : null}

        <Text style={styles.title}>המחירים שלך</Text>
        {/* One sentence, and only about what this professional has (Amit:
            "כל אחד מחליט לעצמו"; a visit-only trade has no price list). */}
        <Text style={styles.lede}>
          {showPriceList
            ? "כל מחיר כאן — שלך. הלקוח רואה אותו לפני שהוא מזמין."
            : "המחיר שלך לביקור ואבחון. את העבודה עצמה סוגרים מול הלקוח אחרי שרואים את התקלה."}
        </Text>

        {/*
          * A COUNT, NOT A PROGRESS BAR.
          *
          * A bar invites "nearly done" over a set of services that are each
          * individually either dispatchable or not. Eligibility is per
          * service (/CLAUDE.md §3), so the number is per service too.
          */}
        <Text style={styles.readyLine}>
          {readyCount === rows.length
            ? "לכל השירותים שלך יש מחיר."
            : `${readyCount} מתוך ${rows.length} שירותים מתומחרים. שירות בלי מחיר לא מקבל קריאות.`}
        </Text>

        <SectionHeader title="לפי שירות" colors={colors} />

        {rows.map((row) => {
          const field = formFor(row.pricingModel);
          const price: ProServicePrice = {
            serviceId: row.serviceId,
            pricingModel: row.pricingModel,
            amountMinorUnits: row.amountMinorUnits,
          };
          const problems = priceViolations(price);
          const customerLine = customerPriceLineHe(price);
          const payout = payoutNoteHe(price, commissionPercent);

          return (
            <Surface key={row.serviceId} kind="raised" colors={colors} style={styles.card}>
              <View style={styles.cardHead}>
                <Mark name={row.mark} size={22} color={colors.trust} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {row.nameHe}
                </Text>
              </View>

              {field.kind === "NOT_SET_HERE" ? (
                <Text style={styles.notSet}>{field.reasonHe}</Text>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>{field.labelHe}</Text>
                  <View style={styles.inputRow}>
                    {/* The currency sits outside the box: typing over a ₪
                        you have to select around is a small daily tax. */}
                    <Text style={styles.currency}>₪</Text>
                    <TextInput
                      value={draft[row.serviceId] ?? ""}
                      onChangeText={(t) => {
                        setDraft((d) => ({ ...d, [row.serviceId]: t }));
                        const parsed = readShekels(t);
                        if (parsed !== undefined) onChange?.(row.serviceId, parsed);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="לא נקבע"
                      placeholderTextColor={colors.textSecondary}
                      accessibilityLabel={`${field.labelHe} — ${row.nameHe}`}
                      style={styles.input}
                    />
                  </View>
                  <Text style={styles.help}>{field.helpHe}</Text>

                  {problems.length > 0 ? (
                    problems.map((p) => (
                      <Text key={p} style={styles.problem}>
                        {p}
                      </Text>
                    ))
                  ) : customerLine ? (
                    <View style={styles.preview}>
                      {/*
                        * WHAT THE CUSTOMER ACTUALLY SEES, verbatim.
                        *
                        * Not a description of it — the same string the
                        * customer's screen renders, from the same function.
                        * A professional setting a price should be looking at
                        * the sentence their price becomes.
                        */}
                      <Text style={styles.previewLabel}>הלקוח יראה</Text>
                      <Text style={styles.previewLine}>{customerLine}</Text>
                    </View>
                  ) : (
                    <Text style={styles.unpriced}>
                      בלי מחיר השירות הזה לא יופיע ללקוחות.
                    </Text>
                  )}

                  {payout ? (
                    <Text style={styles.payout}>
                      {payout.netHe
                        ? `${payout.grossHe} ← ${payout.netHe} אליך · ${payout.noteHe}`
                        : `${payout.grossHe} · ${payout.noteHe}`}
                    </Text>
                  ) : null}
                </>
              )}

              {row.blockedReasonHe ? (
                <Text style={styles.blocked}>{row.blockedReasonHe}</Text>
              ) : null}
            </Surface>
          );
        })}

        {showAfterHours ? (<>
        {/* ---------------- After hours ---------------- */}
        <SectionHeader title="תוספת לילה ושבת" colors={colors} />
        <Surface kind="raised" colors={colors} style={styles.card}>
          <Text style={styles.fieldLabel}>אחוז תוספת (20:00–07:00, ומשישי 15:00 עד מוצ״ש)</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currency}>%</Text>
            <TextInput
              value={ahDraft}
              onChangeText={(t) => {
                setAhDraft(t);
                const n = t.trim() === "" ? null : Number(t.replace(/[^\d]/g, ""));
                if (n === null) onAfterHoursChange?.(null);
                else if (Number.isFinite(n)) onAfterHoursChange?.(Math.max(0, Math.min(100, n)));
              }}
              keyboardType="number-pad"
              placeholder="בלי תוספת"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="אחוז תוספת לילה ושבת"
              style={styles.input}
            />
          </View>
          <Text style={styles.help}>
            הלקוח רואה את המחיר כולל התוספת, בשעות שהיא חלה, לפני שהוא מזמין. עד 100%.
          </Text>
        </Surface>
        </>) : null}

        {/* ---------------- The price list — only for work priced by the job ---------------- */}
        {showPriceList ? (<>
        <SectionHeader title="המחירון שלך" colors={colors} />
        <Surface kind="raised" colors={colors} style={styles.card}>
          <Text style={styles.help}>
            העבודות שאתה עושה ומה כל אחת עולה. בשירותים במחירון — הלקוח בוחר מכאן, ומשלם לך ישירות אחרי שסיימת.
          </Text>
          {priceList.map((it) => (
            <View key={it.id} style={styles.listRow}>
              <Text style={styles.listName} numberOfLines={1}>{it.nameHe}</Text>
              {/* His price, editable in place — every line is his to set (Amit: "כל אחד מחליט לעצמו"). */}
              <View style={styles.listPriceBox}>
                <Text style={styles.listPrice}>₪</Text>
                <TextInput
                  value={it.amountMinorUnits ? String(Math.round(it.amountMinorUnits / 100)) : ""}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^0-9]/g, "")) || 0;
                    onPriceListChange?.(priceList.map((x) => (x.id === it.id ? { ...x, amountMinorUnits: n * 100 } : x)));
                  }}
                  keyboardType="number-pad"
                  accessibilityLabel={`המחיר של ${it.nameHe}`}
                  style={styles.listPriceInput}
                />
              </View>
              <Pressable
                onPress={() => onPriceListChange?.(priceList.filter((x) => x.id !== it.id))}
                accessibilityRole="button"
                accessibilityLabel={`הסרת ${it.nameHe} מהמחירון`}
                style={styles.listRemove}
              >
                <Text style={styles.listRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="עבודה — למשל החלפת סיפון"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="שם העבודה החדשה במחירון"
              style={[styles.addInput, { flex: 2 }]}
            />
            <TextInput
              value={newPrice}
              onChangeText={setNewPrice}
              keyboardType="decimal-pad"
              placeholder="₪"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="מחיר העבודה החדשה"
              style={[styles.addInput, { flex: 1 }]}
            />
          </View>
          <Pressable onPress={addItem} accessibilityRole="button" accessibilityLabel="הוספה למחירון" style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ הוספה למחירון</Text>
          </Pressable>
        </Surface>
        </>) : null}

        {/*
          * The three steps, restated at the bottom where a professional who
          * has just typed a number is asking "and then what". It is the
          * same sequence as the lede and that repetition is deliberate:
          * this is the part of the deal they will be asked about by every
          * customer.
          */}
        <SectionHeader title="איך זה עובד" colors={colors} />
        <Surface kind="outlined" colors={colors} style={styles.card}>
          <Text style={styles.step}>1 · תיקון שהמחיר שלו לא ידוע מראש: הלקוח רואה את דמי הביקור והאבחון שלך לפני שהוא מזמין. את התיקון עצמו אתם סוגרים ישירות.</Text>
          {showPriceList ? (
            <Text style={styles.step}>2 · עבודה עם מחיר ידוע: הלקוח בוחר מהמחירון שלך, ומשלם לך ישירות אחרי שסיימת.</Text>
          ) : null}
          <Text style={styles.step}>{showPriceList ? "3" : "2"} · הלקוח רואה את המחיר שלך לפני שהוא מאשר אותך.</Text>
          <Text style={styles.stepNote}>
            אין מכרז ואין הצעות מתחרות. המחיר שלך הוא שלך.
          </Text>
        </Surface>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden" },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  backRow: { flexDirection: "row-reverse" },
  title: { ...type.h1, color: colors.textPrimary, textAlign: "right" },
  lede: { ...type.body, color: colors.textSecondary, textAlign: "right" },
  readyLine: { ...type.captionStrong, color: colors.trust, textAlign: "right" },

  card: { padding: spacing.lg, gap: spacing.sm },
  listRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  listName: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: "right" },
  listPrice: { ...type.bodyStrong, color: colors.trust },
  listPriceBox: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  listPriceInput: { ...type.bodyStrong, color: colors.trust, width: 64, minWidth: 0, textAlign: "center" },
  listRemove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  listRemoveText: { ...type.h3, color: colors.textSecondary },
  addRow: { flexDirection: "row-reverse", gap: spacing.sm },
  addInput: {
    ...type.body,
    minWidth: 0,
    flexShrink: 1,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(247,243,250,0.14)",
    paddingHorizontal: spacing.md,
    minHeight: 44,
    textAlign: "right",
  },
  addBtn: { alignSelf: "flex-end", paddingVertical: spacing.sm },
  addBtnText: { ...type.bodyStrong, color: colors.trust },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...type.h3, color: colors.textPrimary, flex: 1, textAlign: "right" },

  fieldLabel: { ...type.captionStrong, color: colors.textSecondary, textAlign: "right" },
  inputRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(247,243,250,0.14)",
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  currency: { ...type.h3, color: colors.textSecondary },
  input: { ...type.h3, color: colors.textPrimary, flex: 1, textAlign: "right", paddingVertical: spacing.sm },
  help: { ...type.caption, color: colors.textSecondary, textAlign: "right" },
  problem: { ...type.caption, color: colors.statusDanger, textAlign: "right" },
  unpriced: { ...type.caption, color: colors.textSecondary, textAlign: "right" },
  notSet: { ...type.body, color: colors.textSecondary, textAlign: "right" },

  preview: {
    borderRadius: radii.md,
    backgroundColor: "rgba(63,208,168,0.08)",
    padding: spacing.md,
    gap: 2,
  },
  previewLabel: { ...type.caption, color: colors.textSecondary, textAlign: "right" },
  previewLine: { ...type.bodyStrong, color: colors.textPrimary, textAlign: "right" },
  payout: { ...type.caption, color: colors.textSecondary, textAlign: "right" },
  blocked: { ...type.caption, color: colors.statusDanger, textAlign: "right" },

  step: { ...type.body, color: colors.textSecondary, textAlign: "right" },
  stepNote: { ...type.caption, color: colors.textSecondary, textAlign: "right", marginTop: spacing.xs },
});
