import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { signOutHere } from "../../auth";

const ONLINE = new Set(["AVAILABLE", "OFFER_RECEIVED", "RESERVED"]);

/**
 * The professional's way out on this device (demo sync 2026-09-30, item H;
 * the demo's "התנתקות"). Signing in again goes straight to their own page.
 *
 * A professional who is still online is taken offline first, so dispatch
 * never offers work to someone who has left. The work screen hides this
 * while online anyway; this covers the other pro screens. A job in
 * progress is left as it is: the session ends on this device, not the job.
 */
export function ProSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await api.proStatus().catch(() => null);
      if (status?.shiftId && !status.activeJobId && ONLINE.has(status.presenceState)) {
        await api.proEndShift(status.shiftId).catch(() => undefined);
      }
      await signOutHere(queryClient, () => navigate("/welcome", { replace: true }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={() => void signOut()} disabled={busy} accessibilityRole="button" accessibilityLabel="יציאה מהחשבון" style={styles.hit}>
      <Text style={styles.text}>יציאה מהחשבון</Text>
    </Pressable>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg },
  text: { ...t.metaStrong, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
});
