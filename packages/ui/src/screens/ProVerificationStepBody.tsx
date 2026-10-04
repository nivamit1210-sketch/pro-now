import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BackButton } from "../components/BackButton";
import { proTheme, radii, spacing, type } from "../theme";
import type { StepState, VerificationStep } from "./ProVerificationBody";

const colors = proTheme.colors;

/**
 * ONE CREDENTIAL, AND WHAT TO DO ABOUT IT.
 *
 * ---------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS
 * ---------------------------------------------------------------------
 * Amit, on the verification page: *"כל מה שאני לוחץ פה פותח לי בכלל
 * משהו אחר ולא מחובר"*, and then *"תפעיל את כל העמוד הזה!!!"*
 *
 * He was right in the most literal way available. Every row on that page
 * called one handler that ignored which row had been pressed and opened
 * the SERVICES sheet — so five different credentials, in five different
 * states, all opened the same unrelated screen. The list was honest
 * about what was verified and led nowhere.
 *
 * ---------------------------------------------------------------------
 * WHAT IT IS ALLOWED TO SAY
 * ---------------------------------------------------------------------
 * The identity vendor is an open business decision (/CLAUDE.md §4) and
 * so is which credentials are mandatory per category. Neither is decided
 * here and neither needs to be for this screen to be real: a
 * professional is owed a page that says what this document proves, what
 * it is blocking while it is missing, and what the next action is.
 *
 * What it must NOT do is take a photograph of somebody's identity card
 * and tell them it has been submitted for verification, because there is
 * nobody to submit it to yet. So the action is present only when a
 * caller wires one, and the screen says plainly where the document goes
 * — which today is "nowhere yet". A green tick on a stub is the exact
 * failure `ProVerificationBody` was written to avoid, one screen deeper.
 */

const STATE_LABEL: Record<StepState, string> = {
  NOT_STARTED: "טרם הוגש",
  IN_REVIEW: "בבדיקה",
  VERIFIED: "אומת",
  REJECTED: "נדחה",
  EXPIRED: "פג תוקף",
  SANDBOX: "בדיקת הדגמה",
};

/** The colour a state is allowed to wear. Only one of them is green. */
function toneFor(state: StepState): { bg: string; fg: string } {
  switch (state) {
    case "VERIFIED":
      return { bg: "rgba(45,190,140,0.16)", fg: colors.trust ?? colors.textPrimary };
    case "REJECTED":
    case "EXPIRED":
      return { bg: "rgba(226,90,110,0.16)", fg: colors.statusDanger ?? colors.textPrimary };
    case "IN_REVIEW":
      return { bg: "rgba(247,181,86,0.16)", fg: colors.statusWarning ?? colors.textPrimary };
    default:
      return { bg: "rgba(23,18,31,0.06)", fg: colors.textSecondary };
  }
}

/**
 * What a good submission looks like. Deliberately generic: WHICH
 * documents a category requires is a business decision that is still
 * open, and a list of specifics invented here would be read as policy.
 */
const WHAT_GOOD_LOOKS_LIKE: readonly string[] = [
  "צילום שלם של המסמך — כל הפינות בפנים.",
  "כל הפרטים קריאים, בלי הבהקים ובלי טשטוש.",
  "המסמך בתוקף במועד ההגשה.",
  "השם על המסמך זהה לשם שאיתו נרשמת.",
];

export interface ProVerificationStepBodyProps {
  step: VerificationStep;
  /**
   * Submit a document for this step. Absent renders no button rather
   * than a dead one — and absent is the honest state until an identity
   * provider is chosen.
   */
  onSubmit?: (stepId: string) => void;
  /**
   * Where a submitted document actually goes, in Hebrew. Passed in
   * because it is a fact about the deployment, not about this screen.
   * Absent, the screen says the provider is not connected yet.
   */
  destinationHe?: string | null;
  /** The button's words. Absent: "הגשה מחדש" for a rejected or expired step, else "הגשת מסמך". */
  submitLabelHe?: string;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function ProVerificationStepBody({
  step,
  onSubmit,
  destinationHe = null,
  submitLabelHe,
  onBack,
  width = 390,
  height = 780,
}: ProVerificationStepBodyProps) {
  const tone = toneFor(step.state);
  const gates = step.gatesServicesHe ?? [];

  return (
    <View style={[styles.screen, { width, height }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} tone="light" placement="absolute" />

        <Text style={styles.title}>{step.titleHe}</Text>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.fg }]}>{STATE_LABEL[step.state]}</Text>
        </View>

        <Text style={styles.explain}>{step.explainHe}</Text>

        {/* What is true right now, when there is something to say. */}
        {step.actionHe ? <Text style={styles.action}>{step.actionHe}</Text> : null}
        {step.validUntilHe ? <Text style={styles.valid}>{step.validUntilHe}</Text> : null}

        {/* ----------------------------------------------------------------
            WHAT IT IS COSTING RIGHT NOW.

            The single most useful sentence on this screen, and the one a
            list of ticks cannot carry: not "this is missing" but "you are
            not being sent electrical work because of this". An empty
            `gatesServicesHe` means the step gates the ACCOUNT — see
            `ProVerificationBody`.
            ---------------------------------------------------------------- */}
        {step.state !== "VERIFIED" ? (
          <View style={styles.costs}>
            <Text style={styles.costsHead}>מה זה חוסם כרגע</Text>
            <Text style={styles.costsBody}>
              {gates.length === 0
                ? "את החשבון עצמו — בלי זה אי אפשר לצאת למשמרת."
                : gates.join(" · ")}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionHead}>מה צריך כדי שזה יאושר</Text>
        {WHAT_GOOD_LOOKS_LIKE.map((line) => (
          <View key={line} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>{line}</Text>
          </View>
        ))}

        {/* ----------------------------------------------------------------
            WHERE THE DOCUMENT GOES.

            Said before the button, not after it. Somebody is about to
            photograph an identity card; the least they are owed is to
            know who receives it — and the honest answer today is that
            the provider has not been chosen (/CLAUDE.md §4).
            ---------------------------------------------------------------- */}
        <Text style={styles.destination}>
          {destinationHe ??
            "ספק האימות עדיין לא נבחר, ולכן מסמך שיוגש כאן לא נשלח לשום גורם חיצוני ולא מאושר אוטומטית."}
        </Text>

        {onSubmit ? (
          <Pressable
            onPress={() => onSubmit(step.id)}
            accessibilityRole="button"
            accessibilityLabel={`הגשת מסמך עבור ${step.titleHe}`}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>
              {submitLabelHe ??
                (step.state === "EXPIRED" || step.state === "REJECTED" ? "הגשה מחדש" : "הגשת מסמך")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { overflow: "hidden", backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl * 2, paddingBottom: spacing.xxl },
  title: { ...type.title, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  pill: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  pillText: { ...type.microStrong },
  explain: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.lg,
  },
  action: {
    ...type.bodyStrong,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
  valid: {
    ...type.meta,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
  },
  costs: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  costsHead: {
    ...type.microStrong,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  costsBody: {
    ...type.bodyStrong,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xs,
  },
  sectionHead: {
    ...type.section,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  bulletRow: { flexDirection: "row-reverse", alignItems: "flex-start", marginBottom: spacing.sm },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textSecondary,
    marginTop: 9,
    marginLeft: spacing.md,
  },
  bulletText: {
    ...type.body,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  destination: {
    ...type.meta,
    color: colors.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.xxl,
  },
  cta: {
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.action,
  },
  ctaText: { ...type.bodyStrong, color: colors.onAction },
});
