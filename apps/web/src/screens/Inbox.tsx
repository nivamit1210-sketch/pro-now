import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BACK_BUTTON_CLEARANCE, BackButton, PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../api";
import { useFrame } from "../frame";
import { enablePush, pushState, type PushState } from "../push";
import { ErrorScreen, LoadingScreen } from "../states";
import { inboxKey } from "../useUserChannel";

/**
 * The inbox (docs/21 W9): where a missed push is still found. Opening it
 * marks everything read. Phone notifications are turned on from here.
 */
const PUSH_HE: Record<PushState, string> = {
  on: "התראות לטלפון פעילות ✓",
  off: "",
  denied: "ההתראות חסומות בדפדפן. אפשר לאפשר אותן בהגדרות האתר.",
  unsupported: "הדפדפן הזה לא תומך בהתראות. ההודעות יופיעו כאן.",
  "needs-install": "באייפון: הוסיפו את PRO NOW למסך הבית (שיתוף ← הוספה למסך הבית), ואז אפשר להפעיל התראות.",
  failed: "לא הצלחנו להפעיל התראות כרגע. אפשר לנסות שוב; בינתיים ההודעות יופיעו כאן.",
};

export function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  // Back to where they came from; opened directly (a push, a link), there is no "from", so home.
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/"));
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const inbox = useQuery({ queryKey: inboxKey, queryFn: api.inbox });
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);
  // Seen once shown: the unread count clears when the inbox is opened.
  const unread = inbox.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) void api.markInboxRead().then(() => queryClient.invalidateQueries({ queryKey: inboxKey }));
  }, [unread, queryClient]);

  if (inbox.isPending) return <LoadingScreen />;
  if (inbox.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void inbox.refetch()} />;

  return (
    <View style={{ width, height, backgroundColor: colors.bg }}>
      <ScrollView style={{ width, height }} contentContainerStyle={styles.body}>
        <Text style={styles.title}>התראות</Text>
        {push === "off" || push === "failed" ? (
          <PrimaryAction
            labelHe={busy ? "מפעילים…" : "הפעלת התראות לטלפון"}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void enablePush().then(setPush).catch(() => setPush("failed")).finally(() => setBusy(false));
            }}
          />
        ) : push ? (
          <Text style={styles.soft}>{PUSH_HE[push]}</Text>
        ) : null}
        {push === "failed" ? <Text style={styles.soft}>{PUSH_HE.failed}</Text> : null}
        {inbox.data.notifications.length === 0 ? (
          <Text style={styles.soft}>עוד אין התראות. כשמשהו יקרה בקריאה שלכם, זה יופיע כאן.</Text>
        ) : (
          inbox.data.notifications.map((n) => (
            <Pressable key={n.id} onPress={() => n.url && navigate(n.url)} accessibilityRole="button" style={[styles.row, !n.read && styles.unread]}>
              <Text style={styles.rowTitle}>{n.title}</Text>
              <Text style={styles.rowBody}>{n.body}</Text>
              <Text style={styles.when}>{new Date(n.at).toLocaleString("he-IL")}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
      {/* The shared back chip, where and as on every other screen; drawn last so it stays on top. */}
      <BackButton onPress={back} tone="dark" />
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingTop: BACK_BUTTON_CLEARANCE, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  row: { padding: spacing.md, borderRadius: 14, backgroundColor: colors.surfaceElevated, gap: 2 },
  unread: { borderWidth: 1, borderColor: colors.action },
  rowTitle: { ...t.bodyStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  rowBody: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  when: { ...t.micro, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
});
