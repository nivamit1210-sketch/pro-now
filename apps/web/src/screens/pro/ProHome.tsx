import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Navigate, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import type { ProApplicationView } from "@pro-now/types";
import { PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";
import { applicationKey } from "./ProJoin";
import { ProOnline } from "./ProOnline";
import { ProSignOut } from "./ProSignOut";
import { APPROVAL_STATE_HE, approvalProgress } from "./approval";
import { tradeCharacterFor } from "../../tradeCharacter";

/*
 * "Waiting" is remembered on this device only to give the approval its
 * moment (the demo's ShopOpen): someone who watched their application wait
 * sees it land once. A per-device convenience; losing it only skips the moment.
 */
const waitingKey = (proId: string) => `pronow.pro.waiting.${proId}`;
function remember(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode or blocked storage: no moment, nothing else changes */
  }
}
function recalls(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The professional's own page (docs/21 W7). Someone already registered
 * lands here directly (Amit, 2026-09-30). Until PRO NOW approves them it
 * says where their application stands, per service, in the server's words.
 */
const SERVICE_STATUS_HE: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING: "בבדיקה",
  APPROVED: "מאושר ✓",
  DISABLED: "לא אושר",
  SUSPENDED: "מושהה",
};

export function ProHome() {
  const navigate = useNavigate();
  // "?review=1" shows the application's status even once approved.
  const reviewOnly = new URLSearchParams(location.search).get("review") === "1";
  const { width, height } = useFrame();
  const [, rerender] = useState(0);
  const application = useQuery({
    queryKey: applicationKey,
    queryFn: async () => {
      try {
        return await api.proApplication();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
        throw e;
      }
    },
    refetchInterval: 60_000,
  });

  if (application.isPending) return <LoadingScreen />;
  if (application.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void application.refetch()} />;
  const view = application.data;
  if (!view || !view.submitted) return <Navigate to="/pro/join" replace />;

  const accountApproved = view.profile.verificationStatus === "APPROVED";
  const approved = view.services.filter((s) => s.status === "APPROVED");
  const working = accountApproved && approved.length > 0;
  if (working && !reviewOnly) {
    if (recalls(waitingKey(view.profile.id))) {
      return (
        <ApprovedMoment
          view={view}
          width={width}
          height={height}
          onStart={() => {
            remember(waitingKey(view.profile.id), false);
            rerender((n) => n + 1);
          }}
          onDesignShop={() => {
            remember(waitingKey(view.profile.id), false);
            navigate("/pro/join?at=shop");
          }}
        />
      );
    }
    // Approved for at least one service: the work screen.
    return <ProOnline />;
  }
  if (!working) remember(waitingKey(view.profile.id), true);
  return <ApplicationStatus view={view} width={width} height={height} />;
}

/**
 * Where the application stands, per service, in the server's words — the
 * page before approval, and the profile tab after it.
 */
export function ApplicationStatus({ view, width, height }: { view: ProApplicationView; width: number; height: number }) {
  const navigate = useNavigate();
  const accountApproved = view.profile.verificationStatus === "APPROVED";
  const approved = view.services.filter((s) => s.status === "APPROVED");
  const working = accountApproved && approved.length > 0;
  const progress = approvalProgress(view);
  return (
    <ScrollView style={{ width, height, backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Text style={styles.title}>{accountApproved && approved.length > 0 ? "אושרתם לעבודה" : "הבקשה בבדיקה"}</Text>
      <Text style={styles.soft}>
        {accountApproved && approved.length > 0
          ? "השירותים המאושרים מקבלים קריאות כשאתם מחוברים. שירות שעדיין בבדיקה יתחיל לקבל כשיאושר."
          : "בודקים את הפרטים, את המסמכים ואת כל שירות בנפרד. נעדכן כאן כשיש החלטה."}
      </Text>
      {working ? null : (
        <View style={styles.card} accessibilityLabel="מה נבדק">
          {progress.map((p) => (
            <View key={p.labelHe}>
              <Row labelHe={p.labelHe} statusHe={APPROVAL_STATE_HE[p.state]} tone={p.state} />
              {/* A retake or a refusal comes with the reviewer's own words; what is theirs to fix, with the way there. */}
              {p.noteHe ? <Text style={styles.soft}>{p.noteHe}</Text> : null}
              {p.action ? (
                <Text style={styles.link} accessibilityRole="link" onPress={() => navigate(p.action!.to)}>
                  {p.action.labelHe}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
      <Text style={styles.section}>לפי שירות</Text>
      <View style={styles.card}>
        <Row labelHe="הפרטים והמסמכים" statusHe={accountApproved ? "מאושר ✓" : "בבדיקה"} />
        {view.services.map((s) => (
          <Row key={s.serviceId} labelHe={s.nameHe} statusHe={SERVICE_STATUS_HE[s.status] ?? s.status} />
        ))}
      </View>
      <PrimaryAction labelHe="עריכת הפרטים" onPress={() => navigate("/pro/join?at=summary")} />
      {/* The one step joining may skip comes back here (Amit, 2026-09-30). */}
      <Text style={styles.link} accessibilityRole="link" onPress={() => navigate("/pro/join?at=shop")}>
        {view.profile.shop ? "עיצוב החנות ›" : "לעצב את החנות ›"}
      </Text>
      <Text style={styles.link} accessibilityRole="link" onPress={() => navigate("/?as=customer")}>
        להזמין מקצוען לעצמכם ›
      </Text>
      <ProSignOut />
    </ScrollView>
  );
}

function Row({ labelHe, statusHe, tone }: { labelHe: string; statusHe: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{labelHe}</Text>
      <Text style={[styles.status, tone === "done" && styles.good, (tone === "attention" || tone === "refused") && styles.bad, tone === "queued" && styles.active]}>{statusHe}</Text>
    </View>
  );
}

/** The approval lands: their face, what they may now do, one button. */
function ApprovedMoment({ view, width, height, onStart, onDesignShop }: { view: ProApplicationView; width: number; height: number; onStart: () => void; onDesignShop: () => void }) {
  const p = view.profile;
  const face =
    p.portrait?.kind === "PHOTO" && p.portrait.uploadId
      ? `/api/v1/media/${encodeURIComponent(p.portrait.uploadId)}`
      : tradeCharacterFor(view.services.find((s) => s.status === "APPROVED")?.code);
  const approvedNames = view.services.filter((s) => s.status === "APPROVED").map((s) => s.nameHe);
  return (
    <ScrollView style={{ width, height, backgroundColor: colors.bg }} contentContainerStyle={[styles.body, { flexGrow: 1, justifyContent: "center" }]}>
      <Image source={{ uri: face }} style={styles.momentFace} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Text style={[styles.title, { textAlign: "center" }]}>{p.addressAs ? "אושרת!" : "אושרתם!"}</Text>
      <Text style={[styles.soft, { textAlign: "center" }]}>
        {p.addressAs === "F"
          ? `מעכשיו את מקבלת קריאות ל${approvedNames.join(", ")} — כשאת מחוברת.`
          : p.addressAs === "M"
            ? `מעכשיו אתה מקבל קריאות ל${approvedNames.join(", ")} — כשאתה מחובר.`
            : `מעכשיו אתם מקבלים קריאות ל${approvedNames.join(", ")} — כשאתם מחוברים.`}
      </Text>
      <PrimaryAction labelHe="להתחיל לקבל עבודות" onPress={onStart} />
      {p.shop ? null : (
        <Text style={[styles.link, { textAlign: "center" }]} accessibilityRole="link" onPress={onDesignShop}>
          לעצב את החנות
        </Text>
      )}
    </ScrollView>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingTop: spacing.xxl },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  card: { borderRadius: 16, backgroundColor: colors.surfaceElevated, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", minHeight: 36 },
  label: { ...t.body, color: colors.textPrimary, writingDirection: "rtl", flexShrink: 1 },
  status: { ...t.metaStrong, color: colors.textSecondary, writingDirection: "rtl" },
  good: { color: colors.trust },
  bad: { color: colors.statusDanger },
  active: { color: colors.actionText },
  section: { ...t.metaStrong, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  momentFace: { width: 160, height: 160, borderRadius: 80, alignSelf: "center", marginBottom: spacing.md },
  link: { ...t.metaStrong, color: colors.actionText, textAlign: "right", writingDirection: "rtl", paddingVertical: spacing.sm },
});
