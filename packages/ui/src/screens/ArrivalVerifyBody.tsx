import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BackButton } from "../components/BackButton";
import { customerTheme, palette, radii, scale, spacing, tabular, tint, type } from "../theme";
import { LiveField } from "../components/LiveField";
import { ProviderPortrait } from "../components/ProviderPortrait";
import { ShieldCheckMark } from "../components/marks";

/**
 * אימות בדלת — the minute before a stranger knocks.
 *
 * WHY THIS IS THE MOST IMPORTANT SCREEN IN THE PRODUCT. Everything PRO NOW
 * does well makes this moment harder: the faster we find someone, the less
 * time the customer has had to get comfortable with the idea that a person
 * they have never met is about to be inside their home. Speed manufactures
 * anxiety, and no quantity of badges on an earlier screen answers a knock
 * at the door.
 *
 * So the product's single strongest safety feature is also its simplest:
 * a code that only the assigned professional has. The customer asks through
 * the door, and the answer either matches or it does not. That is not a
 * trust signal — it is a physical check that works exactly when trust
 * signals stop being read, because the person is frightened.
 *
 * WHAT IS ON THIS SCREEN AND WHY IT IS ONLY THIS:
 *   - The code, at display size. It is the only thing that acts.
 *   - Who to expect, and what they arrive in. A plate number is checkable
 *     from a window before opening anything.
 *   - One instruction, plainly worded: do not let in someone who does not
 *     match.
 *
 * WHAT IS DELIBERATELY ABSENT: reassurance copy. "אתם בידיים טובות" at the
 * moment someone knocks is the platform talking about itself. The screen
 * hands over a fact and gets out of the way.
 *
 * AND THE CODE IS THE SERVER'S. The client renders it and never derives it.
 * A code a phone can compute is a code an impostor's phone can compute.
 */

const colors = customerTheme.colors;

export interface ArrivalVerifyBodyProps {
  displayNameHe: string;
  /** The professional asked to be addressed in the feminine (addressAs "F"): הגיעה, מגיעה. */
  professionalFemale?: boolean;
  photoUri?: string | null;
  /** "חשמלאי מוסמך · 214 עבודות דרך PRO NOW" */
  headlineHe: string;
  /**
   * The four-digit code, from the server. Null while it has not been issued
   * — the screen then says so rather than showing an empty frame.
   */
  codeHe: string | null;
  /** "יונדאי i20 לבנה", when the professional registered a vehicle. */
  vehicleHe?: string | null;
  /** Last digits of the plate. Never the full plate before arrival. */
  plateTailHe?: string | null;
  /** Minutes away. Null once they have arrived. */
  etaMinutes: number | null;
  /** Set when the call is for someone else, who is the one at the door. */
  onSiteNameHe?: string | null;
  onCall?: () => void;
  onMessage?: () => void;
  onShare?: () => void;
  onReport?: () => void;
  /** Back to the live job. The arrival code stays valid either way. */
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function ArrivalVerifyBody({
  displayNameHe,
  professionalFemale = false,
  photoUri,
  headlineHe,
  codeHe,
  vehicleHe,
  plateTailHe,
  etaMinutes,
  onSiteNameHe = null,
  onCall,
  onMessage,
  onShare,
  onReport,
  onBack,
  width = 390,
  height = 780,
}: ArrivalVerifyBodyProps) {
  const arrived = etaMinutes === null || etaMinutes <= 0;
  const fieldH = Math.round(height * 0.34);

  return (
    <View style={[styles.screen, { width, height }]}>
      {onBack ? <BackButton onPress={onBack} tone="dark" /> : null}
      <View style={{ height: fieldH }}>
        <LiveField state="ROUTE" width={width} height={fieldH} tone="dark" />
        <View style={styles.fieldOverlay} pointerEvents="none">
          <ProviderPortrait
            photoUri={photoUri}
            displayNameHe={displayNameHe}
            size={96}
            tone="dark"
          />
          {/*
            * The name sits on its own plate rather than straight on the
            * field. The field is deliberately faint and its brightness
            * varies with the route drawn through it, so white type on it is
            * a contrast ratio that changes depending on where the line
            * happens to pass.
            */}
          <View style={styles.namePlate}>
            <Text style={styles.name} numberOfLines={1}>
              {displayNameHe}
            </Text>
            <Text style={styles.headline} numberOfLines={1}>
              {headlineHe}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyInner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.status}>
          {arrived ? `${displayNameHe} ${professionalFemale ? "הגיעה" : "הגיע"}` : `${displayNameHe} כמעט אצלך`}
        </Text>
        {!arrived ? (
          <Text style={styles.eta}>
            {etaMinutes === 1 ? "בעוד דקה" : `בעוד ${etaMinutes} דקות`}
          </Text>
        ) : null}

        {/* ---------------- The code ---------------- */}
        <View style={styles.codeBlock}>
          <Text style={styles.codeLabel}>קוד האימות שלכם</Text>
          {codeHe ? (
            <CodeDigits code={codeHe} />
          ) : (
            <Text style={styles.codePending}>הקוד יונפק רגע לפני ההגעה</Text>
          )}
          <Text style={styles.codeNote}>
            {onSiteNameHe
              ? /* No SMS yet (vendor TBD): the code is on the link the orderer shares. */
                `הקוד מופיע גם בקישור של ${onSiteNameHe}, והוא/היא יבקשו אותו בדלת. רק מי שקיבל את הקריאה יודע אותו.`
              : "בקשו את הקוד בדלת. רק מי שקיבל את הקריאה יודע אותו."}
          </Text>
        </View>

        {/* ---------------- What to look for ---------------- */}
        {vehicleHe || plateTailHe ? (
          <View style={styles.vehicle}>
            <Text style={styles.vehicleLabel}>{professionalFemale ? "מגיעה ב" : "מגיע ב"}</Text>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleText}>{vehicleHe ?? "רכב פרטי"}</Text>
              {plateTailHe ? (
                <View style={styles.plate}>
                  <Text style={styles.plateText}>••• {plateTailHe}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.warn}>
          <ShieldCheckMark size={16} color={colors.statusWarningText} />
          <Text style={styles.warnText}>
            אל תכניסו אדם שאינו תואם לשם, לתמונה ולקוד שמופיעים כאן.
          </Text>
        </View>

        {/* ---------------- What you can do ----------------
            Only what exists, as on the tracking screen: a call or message
            button with no calling behind it is a promise the screen cannot
            keep (no number-masking vendor yet, CLAUDE.md §4). */}
        {onCall || onMessage || onShare ? (
          <View style={styles.actions}>
            {onCall ? <Action labelHe="שיחה" onPress={onCall} /> : null}
            {onMessage ? <Action labelHe="הודעה" onPress={onMessage} /> : null}
            {onShare ? <Action labelHe="שיתוף הקריאה" onPress={onShare} /> : null}
          </View>
        ) : null}

        {onReport ? (
          <Pressable onPress={onReport} accessibilityRole="button" style={styles.report}>
            <Text style={styles.reportText}>משהו לא נראה לי תקין</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Four digits, spaced and tabular, each in its own cell.
 *
 * A code is read ALOUD through a door, and grouped digits are read aloud
 * correctly far more often than a run of four. The cells also make it
 * unmistakably a code rather than a price or a count.
 */
function CodeDigits({ code }: { code: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Stopped on the way out, like every other one-shot in the app: a
    // started animation with no cleanup keeps a frame callback alive
    // against a view that has gone.
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v]);

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={`קוד האימות ${code.split("").join(" ")}`}
      style={[
        styles.codeRow,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {code.split("").map((d, i) => (
        <View key={`${d}-${i}`} style={styles.codeCell}>
          <Text style={styles.codeDigit}>{d}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

function Action({ labelHe, onPress }: { labelHe: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={labelHe}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.88 }]}
    >
      <Text style={styles.actionText} numberOfLines={1}>
        {labelHe}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, overflow: "hidden" },

  fieldOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 4 },
  namePlate: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: "rgba(16,12,22,0.86)",
    alignItems: "center",
  },
  name: { ...type.h2, color: "#FFFFFF", writingDirection: "rtl" },
  headline: { ...type.caption, color: "rgba(255,255,255,0.88)", writingDirection: "rtl", marginTop: 2 },

  body: { flex: 1 },
  bodyInner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: "flex-end",
  },
  status: { ...type.h1, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  eta: { ...type.body, color: colors.textSecondary, writingDirection: "rtl", marginTop: 2 },

  codeBlock: { alignSelf: "stretch", alignItems: "center", marginTop: spacing.xl },
  codeLabel: { ...type.overline, color: colors.textSecondary },
  /**
   * ROW, NOT ROW-REVERSE. A code is not Hebrew.
   *
   * This shipped for about four minutes as `row-reverse` like every other
   * row in the app, and rendered 4821 as "1 2 8 4". A verification code
   * displayed backwards is worse than no verification code: the customer
   * reads out a number the professional does not have, concludes the
   * person at the door is an impostor, and the one safety feature in the
   * product has just manufactured the fear it exists to remove. Digits run
   * left-to-right in Hebrew text — that is Unicode bidi, not a preference —
   * and the cells have to follow the digits.
   */
  codeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  codeCell: {
    width: 62,
    height: 76,
    borderRadius: radii.lg,
    backgroundColor: palette.ink900,
    alignItems: "center",
    justifyContent: "center",
  },
  codeDigit: { ...type.display, ...tabular, fontSize: scale.hero, lineHeight: 44, color: "#FFFFFF" },
  codePending: { ...type.h3, color: colors.textSecondary, marginTop: spacing.md },
  codeNote: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },

  vehicle: { alignSelf: "stretch", alignItems: "flex-end", marginTop: spacing.xl },
  vehicleLabel: { ...type.overline, color: colors.textSecondary },
  vehicleRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  vehicleText: { ...type.h3, color: colors.textPrimary, writingDirection: "rtl" },
  plate: {
    paddingHorizontal: 10,
    minHeight: 30,
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: palette.sun500,
  },
  plateText: { ...type.captionStrong, ...tabular, color: palette.ink900 },

  warn: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 8,
    alignSelf: "stretch",
    marginTop: spacing.xl,
  },
  warnText: {
    ...type.caption,
    fontSize: scale.micro,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    flex: 1,
    lineHeight: 19,
  },

  actions: { flexDirection: "row-reverse", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.xl },
  action: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: tint.neutralLight(0.06),
  },
  actionText: { ...type.captionStrong, fontSize: scale.meta, color: colors.textPrimary },

  report: { minHeight: 44, justifyContent: "center", alignSelf: "center", marginTop: spacing.md },
  // berry500 is 4.33:1 on ivory — under the bar for body text. berry700 is
  // the text-weight member of that family.
  reportText: { ...type.caption, color: palette.berry700, writingDirection: "rtl" },
});
