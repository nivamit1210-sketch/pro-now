import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney, money } from "@pro-now/types";

import { proTheme, radii, scale, spacing, tabular, tint, type } from "../theme";
import { formatOnlineDuration } from "../shift-metrics";

/**
 * The moment a job closes — and the reason it exists at all.
 *
 * Before this, finishing a job dropped the professional straight back to the
 * map with no acknowledgement. The work happened, the money moved, and the
 * app said nothing. That is not a missing animation; it is the app failing
 * to close the only loop it is asking someone to run all day.
 *
 * THREE THINGS THIS SCREEN DOES, IN ORDER:
 *
 * 1. **States what was added, and to what.** Not "₪240" floating alone —
 *    ₪240 added to a shift that now stands at ₪620. One number without the
 *    other is a receipt; both together are a shift.
 * 2. **Says the next thing out loud: you are available again.** The
 *    professional does not have to work out whether they need to press
 *    anything, which is the ambiguity that makes people press GO ONLINE
 *    twice or stop responding for five minutes after every job.
 * 3. **Gets out of the way.** It auto-dismisses. A completion screen that
 *    waits for a tap is a completion screen that is still on the phone when
 *    the next offer arrives.
 *
 * WHAT IT REFUSES TO DO: no confetti, no "מעולה!", no streak. A professional
 * who just spent fifty minutes under a sink is not looking for applause from
 * a piece of software, and celebration on top of a payment screen reads as
 * the platform being pleased with its own cut.
 */

const colors = proTheme.colors;

export interface ProJobSettledBodyProps {
  /** What this job added, net, in minor units. Null when not yet settled. */
  addedNetMinorUnits: number | null;
  /** The shift total AFTER this job. */
  shiftNetMinorUnits: number | null;
  shiftJobCount: number;
  /** Minutes online so far, for the one line of shift context. */
  onlineMinutes: number;
  /** Whether the professional is going back online or ending the shift. */
  returningToAvailable: boolean;
  /** Fires when the screen dismisses itself, or when the pro taps. */
  onDone?: () => void;
  /** Milliseconds before auto-dismiss. */
  dwellMs?: number;
  width?: number;
  height?: number;
}

export function ProJobSettledBody({
  addedNetMinorUnits,
  shiftNetMinorUnits,
  shiftJobCount,
  onlineMinutes,
  returningToAvailable,
  onDone,
  dwellMs = 3600,
  width = 390,
  height = 780,
}: ProJobSettledBodyProps) {
  const rise = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [rise]);

  // The bar fills over the dwell, so the professional can SEE how long they
  // have before the app moves on. A timer that is invisible feels like a
  // screen that vanished; a timer they can watch feels like a screen that
  // finished.
  /*
   * THE CALLBACK IS HELD IN A REF, AND THAT IS THE WHOLE FIX.
   *
   * `onDone` was in the dependency array, and every caller passes an
   * inline arrow — a new function on every render. The professional's
   * side re-renders once a second from its own shift clock, so this
   * effect was torn down and rebuilt every second: the timeout was
   * cleared and re-armed before it could ever fire, and the bar eased
   * from wherever it had got to towards 1 over a fresh full duration,
   * approaching it and never arriving.
   *
   * So the screen never advanced and the bar never filled. It looked
   * like a slow animation; it was a timer that could not finish.
   */
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const bar = Animated.timing(sweep, {
      toValue: 1,
      duration: dwellMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    bar.start();
    const id = setTimeout(() => done.current?.(), dwellMs);
    return () => {
      clearTimeout(id);
      bar.stop();
    };
  }, [dwellMs, sweep]);

  const m = (v: number | null) => (v === null ? "—" : formatMoney(money(v, "ILS")));

  return (
    <Pressable
      onPress={onDone}
      accessibilityRole="button"
      accessibilityLabel="סגירה והמשך"
      style={[styles.screen, { width, height }]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
          },
        ]}
      >
        <View style={styles.tick}>
          <Text style={styles.tickGlyph}>✓</Text>
        </View>

        <Text style={styles.label}>סכום העבודה</Text>
        <Text style={styles.added}>{m(addedNetMinorUnits)}</Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowValue}>{m(shiftNetMinorUnits)}</Text>
          <Text style={styles.rowLabel}>סך המשמרת</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowValue}>
            {shiftJobCount === 1 ? "עבודה אחת" : `${shiftJobCount} עבודות`}
          </Text>
          <Text style={styles.rowLabel}>נסגרו במשמרת</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowValue}>{formatOnlineDuration(onlineMinutes)}</Text>
          <Text style={styles.rowLabel}>זמן במשמרת</Text>
        </View>

        <View style={styles.next}>
          <Text style={styles.nextText}>
            {returningToAvailable
              ? "שוב במשמרת — מחפשים לך את העבודה הבאה"
              : "המשמרת הסתיימה. הסכומים בלשונית ״הרווחים״."}
          </Text>
        </View>

        <View style={styles.sweepTrack}>
          <Animated.View
            style={[
              styles.sweepFill,
              { width: sweep.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
            ]}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "flex-end",
  },
  tick: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: tint.trust(0.16),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  tickGlyph: { color: colors.trust, fontSize: scale.section, lineHeight: 28 },
  label: { ...type.overline, color: colors.textSecondary },
  added: { ...type.display, ...tabular, color: colors.trust, marginTop: 2 },
  divider: {
    height: 1,
    alignSelf: "stretch",
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  row: {
    flexDirection: "row-reverse",
    alignSelf: "stretch",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  rowLabel: { ...type.caption, color: colors.textSecondary, writingDirection: "rtl" },
  rowValue: { ...type.bodyStrong, ...tabular, color: colors.textPrimary, writingDirection: "rtl" },
  next: {
    alignSelf: "stretch",
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tint.trust(0.1),
    padding: spacing.md,
  },
  nextText: {
    ...type.caption,
    fontSize: scale.meta,
    color: colors.trust,
    textAlign: "right",
    writingDirection: "rtl",
  },
  sweepTrack: {
    alignSelf: "stretch",
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.lg,
    overflow: "hidden",
  },
  sweepFill: { height: 3, borderRadius: 2, backgroundColor: colors.trust },
});
