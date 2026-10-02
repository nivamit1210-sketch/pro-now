import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { BackButton, BACK_BUTTON_CLEARANCE } from "../components/BackButton";
import { customerTheme, elevation, proTheme, radii, scale, spacing, tabular, type } from "../theme";
import { ShieldCheckMark } from "../components/marks";
import { breakableEmail, isPlausibleEmail } from "../email";

/**
 * A00 (product) — signing in with an email link or Google.
 *
 * The product's version of the demo's `PhoneAuthBody`: the same screen,
 * with the same layout, type, colours and two stages ("enter" → "check"),
 * asking for an email instead of a phone number (docs/21 W1 decision A,
 * W2: the demo's look, email/Google). The styles are the demo screen's
 * own, copied rather than re-drawn.
 *
 * No password: the email gets a one-time link, valid for 15 minutes.
 */

export type EmailSignInStage = "email" | "sent";

export interface EmailSignInBodyProps {
  side: "customer" | "pro";
  stage: EmailSignInStage;
  email: string;
  onChangeEmail: (v: string) => void;
  /** Seconds until another link may be sent. 0 enables it. */
  resendInSeconds: number;
  errorHe?: string | null;
  busy?: boolean;
  onSubmitEmail?: () => void;
  onGoogle?: () => void;
  onDemo?: () => void;
  onResend?: () => void;
  onBack?: () => void;
  width?: number;
  height?: number;
}

export function EmailSignInBody({
  side,
  stage,
  email,
  onChangeEmail,
  resendInSeconds,
  errorHe = null,
  busy = false,
  onSubmitEmail,
  onGoogle,
  onDemo,
  onResend,
  onBack,
  width = 390,
  height = 780,
}: EmailSignInBodyProps) {
  const colors = side === "pro" ? proTheme.colors : customerTheme.colors;
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (stage !== "email") return;
    const id = setTimeout(() => ref.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [stage]);

  const canSubmit = isPlausibleEmail(email);

  return (
    <View style={[styles.screen, { width, height, backgroundColor: colors.bg }]}>
      <BackButton onPress={onBack} tone={"light"} placement="absolute" />

      {/*
        * Scrolls, so a short screen never stacks the button on the field:
        * with the keyboard up an iPhone leaves about 300 px, and the fixed
        * layout pushed "שליחת קישור" over the email box. With room, the
        * content grows to fill it and looks as it always did.
        */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {stage === "email" ? "מה המייל שלך?" : "בדקו את המייל"}
        </Text>

        <Text style={[styles.why, { color: colors.textSecondary }]}>
          {stage === "email"
            ? side === "pro"
              ? "לשם נשלח קישור כניסה, בלי סיסמה. המייל לא נחשף ללקוחות."
              : "לשם נשלח קישור כניסה, בלי סיסמה. המייל לא נחשף למקצוען."
            : /* The address is isolated left-to-right (U+2068…U+2069): inside a
                 Hebrew sentence its punctuation otherwise jumps sides. */
              `שלחנו קישור כניסה ל-⁨${breakableEmail(email.trim())}⁩. פתחו אותו בטלפון הזה — הוא תקף ל-15 דקות.`}
        </Text>

        {stage === "email" ? (
          <TextInput
            ref={ref}
            value={email}
            onChangeText={onChangeEmail}
            placeholder="name@example.com"
            accessibilityLabel="כתובת מייל"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: errorHe ? colors.statusDanger : colors.border, color: colors.textPrimary },
            ]}
            textAlign="right"
            onSubmitEditing={canSubmit ? onSubmitEmail : undefined}
          />
        ) : (
          <Pressable
            onPress={onResend}
            disabled={resendInSeconds > 0 || busy}
            accessibilityRole="button"
            style={styles.resend}
          >
            <Text style={[styles.resendText, { color: resendInSeconds > 0 ? colors.textSecondary : colors.action }]}>
              {resendInSeconds > 0 ? `אפשר לשלוח שוב בעוד ${resendInSeconds}` : "שליחת קישור חדש"}
            </Text>
          </Pressable>
        )}

        {errorHe ? <Text style={[styles.error, { color: colors.statusDanger }]}>{errorHe}</Text> : null}

        <View style={styles.privacyRow}>
          <ShieldCheckMark size={14} color={colors.trust} />
          <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
            {stage === "email"
              ? "לא נשלח אליך פרסומות ולא נמכור את המייל."
              : "לא הגיע? כדאי להציץ גם בתיקיית הספאם."}
          </Text>
        </View>
      </View>

      {stage === "email" ? (
        <View style={styles.footer}>
          <Pressable
            onPress={onSubmitEmail}
            disabled={!canSubmit || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: canSubmit && !busy ? colors.action : colors.border },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={[styles.ctaText, { color: canSubmit && !busy ? "#FFFFFF" : colors.textSecondary }]}>
              {busy ? "רגע…" : "שליחת קישור"}
            </Text>
          </Pressable>

          {onGoogle ? (
            <>
              <Text style={[styles.or, { color: colors.textSecondary }]}>או</Text>
              <Pressable
                onPress={onGoogle}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={[styles.ctaText, { color: colors.textPrimary }]}>המשך עם Google</Text>
              </Pressable>
            </>
          ) : null}

          {onDemo ? (
            <Pressable
              onPress={onDemo}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={[styles.ctaText, { color: colors.textPrimary }]}>כניסה מהירה לניסיון</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.terms, { color: colors.textSecondary }]}>
            בהמשך אתה מאשר את תנאי השימוש ומדיניות הפרטיות.
          </Text>
        </View>
      ) : (
        <View style={styles.footer} />
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { overflow: "hidden", borderRadius: radii.xl },
  scroll: { flexGrow: 1, justifyContent: "space-between" },

  /*
   * ---------------------------------------------------------------------
   * THE SCREEN WAS TWO THIRDS EMPTY
   * ---------------------------------------------------------------------
   * Amit, on the code screen: *"לא מובן ככ למעלה."*
   *
   * A fixed top padding put the whole form — a headline, a line of
   * explanation, one box and a hint — in the top third of the phone, with
   * roughly five hundred points of blank ivory beneath it and the button
   * pinned far below that. Nothing in the gap, and nothing to tell the
   * eye the two halves belong together.
   *
   * It is also the only place in the product that does this. Every other
   * screen either fills its space with the world or is a list that runs
   * to the bottom of it. These two are the first thing a new customer
   * sees after the welcome screen, and they read as a page that failed to
   * finish loading.
   *
   * `flex: 1` with the content centred gives the form the room it
   * actually occupies rather than a number somebody guessed, and it is
   * the same shape on a small phone and a large one. The minimum top
   * padding keeps it clear of the back control on short screens, where
   * centring alone would slide it under.
   */
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    // Clear of the back control, which floats over the scroll.
    paddingTop: BACK_BUTTON_CLEARANCE,
    paddingBottom: spacing.xl,
    alignItems: "flex-end",
  },
  title: { ...type.h1, writingDirection: "rtl", textAlign: "right" },
  why: {
    ...type.body,
    fontSize: scale.meta,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: spacing.sm,
    lineHeight: 22,
  },

  input: {
    alignSelf: "stretch",
    minHeight: 58,
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    ...type.h3,
    ...tabular,
  },
  codeInput: { letterSpacing: 8, fontSize: scale.section },

  error: { ...type.caption, alignSelf: "flex-end", marginTop: spacing.sm, writingDirection: "rtl" },
  resend: { alignSelf: "flex-end", paddingVertical: spacing.md, minHeight: 44, justifyContent: "center" },
  resendText: { ...type.captionStrong, writingDirection: "rtl" },

  privacyRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.lg },
  privacyText: { ...type.caption, flex: 1, textAlign: "right", writingDirection: "rtl", lineHeight: 18 },

  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  cta: { minHeight: 58, borderRadius: radii.md, alignItems: "center", justifyContent: "center", ...elevation(1) },
  ctaText: { ...type.bodyStrong, fontSize: scale.body },
  or: { ...type.caption, textAlign: "center", marginVertical: spacing.md, writingDirection: "rtl" },
  secondary: { minHeight: 58, borderRadius: radii.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  terms: {
    ...type.caption,
    fontSize: scale.micro,
    textAlign: "center",
    writingDirection: "rtl",
    marginTop: spacing.md,
  },
});
