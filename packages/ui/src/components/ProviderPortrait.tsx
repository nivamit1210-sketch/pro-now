import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, radii, type } from "../theme";

/**
 * A professional's portrait — the real one, or nothing that pretends to be.
 *
 * THE RULE THIS ENFORCES (Visual System v1 §8, "reality has visual
 * priority"): real approved photo → approved portfolio media → neutral
 * placeholder. Never an invented face standing in for a provider.
 *
 * WHY THE PLACEHOLDER IS A MONOGRAM AND NOT A CHARACTER. The illustrated
 * personas elsewhere in this product are fine: they populate a gallery, a
 * chat header, a tab. Here they are not, because this screen is proposing a
 * SPECIFIC PERSON who is supposedly free right now, and a face on that
 * proposal — drawn or photographed — asserts that the person exists.
 * ChatGPT put the boundary better than I had: "לפני MATCH — אין פנים.
 * אחרי MATCH — האדם נכנס לממשק."
 *
 * There is a second reason, which is about the day this ships. If the demo
 * leans on an illustrated character, then the moment real professionals
 * upload real photographs the whole screen changes character — and a
 * composition nobody has ever seen is suddenly in production. A monogram
 * occupies exactly the space a photograph will, so the layout is already
 * the final one and only the content arrives.
 *
 * DECIDED 2026-09-30 (Dvir, D1 in docs/sync/SYNC-2026-09-30.md): after the
 * match, `photoUri` is the face the professional chose while joining —
 * their photo, approved as it is for now, or their trade's drawn character.
 * The character is their own choice, not an invented stand-in, so it is
 * shown. Before the match there is still no face, and the monogram remains
 * for anyone who never chose one.
 */

export interface ProviderPortraitProps {
  /** The approved photo. Null until a real professional has uploaded one. */
  photoUri?: string | null;
  displayNameHe: string;
  size?: number;
  /** Dark surfaces get the night monogram; light ones the sand monogram. */
  tone?: "light" | "dark";
  /**
   * `circle` for the hero portrait, which sits inside a circular presence
   * ring — a rounded square inside a circle reads as two shapes that missed
   * each other, which is exactly how the first build of the Match hero
   * looked. `rounded` everywhere else.
   */
  shape?: "rounded" | "circle";
}

export function ProviderPortrait({
  photoUri,
  displayNameHe,
  size = 132,
  tone = "dark",
  shape = "rounded",
}: ProviderPortraitProps) {
  const dark = tone === "dark";
  const radius = shape === "circle" ? size / 2 : Math.round(size * 0.28);

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        accessibilityLabel={displayNameHe}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`תמונת הפרופיל של ${displayNameHe} טרם נוספה`}
      style={[
        styles.mono,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: dark ? palette.night700 : palette.sandDeep,
          borderColor: dark ? "rgba(247,243,250,0.14)" : "rgba(23,18,31,0.1)",
        },
      ]}
    >
      <Text
        style={[
          styles.letter,
          { fontSize: Math.round(size * 0.42), color: dark ? "#F7F3FA" : palette.ink700 },
        ]}
      >
        {initial(displayNameHe)}
      </Text>
    </View>
  );
}

/**
 * The first Hebrew letter, and nothing clever.
 *
 * Two-letter initials would need a surname, which a display name is not
 * guaranteed to carry, and a wrong second letter is worse than none.
 */
function initial(nameHe: string): string {
  const cleaned = nameHe.replace(/[()[\]]/g, "").trim();
  return cleaned.charAt(0) || "·";
}

const styles = StyleSheet.create({
  mono: { alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden" },
  letter: { ...type.h1, fontWeight: "700", lineHeight: undefined },
});

export const portraitRadius = radii.lg;
