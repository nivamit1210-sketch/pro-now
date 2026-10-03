import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Navigate, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import type { ProApplicationView } from "@pro-now/types";
import { PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";
import { applicationKey } from "./ProJoin";
import { ProOnline } from "./ProOnline";
import { ProSignOut } from "./ProSignOut";
import { APPROVAL_STATE_HE, applicationPage, approvalProgress, fixLabelHe, fixLinkFor, resendErrorHe } from "./approval";
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
  const page = applicationPage(view);
  // An application sent back for fixes is not "submitted" until resent, and stays here (docs/10 §Review loop).
  if (!view || page === "join") return <Navigate to="/pro/join" replace />;

  const working = page === "working";
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
  // The identity's reason is shown once: in the fix list when it is one of the requests.
  const identityAsked = view.changesRequested && view.fixRequests.some((f) => f.itemKey === "IDENTITY");
  const progress = approvalProgress(view).map((p, i) => (i === 0 && identityAsked ? { ...p, noteHe: undefined } : p));
  return (
    <ScrollView style={{ width, height, backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      {view.changesRequested ? (
        <FixRequests view={view} />
      ) : (
        <>
          <Text style={styles.title}>{working ? "אושרתם לעבודה" : "הבקשה בבדיקה"}</Text>
          <Text style={styles.soft}>
            {working
              ? "השירותים המאושרים מקבלים קריאות כשאתם מחוברים. שירות שעדיין בבדיקה יתחיל לקבל כשיאושר."
              : "בודקים את הפרטים, את המסמכים ואת כל שירות בנפרד. נעדכן כאן כשיש החלטה."}
          </Text>
        </>
      )}
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

/**
 * A round of fixes the reviewer sent (docs/10 §Review loop): how many are
 * left, each with the reviewer's reason and the way to it, and the resend —
 * refused by the server while any is open, so disabled here too.
 */
function FixRequests({ view }: { view: ProApplicationView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);
  const open = view.fixRequests.filter((f) => f.status === "OPEN");
  const title = open.length === 0 ? "הכול תוקן — אפשר לשלוח שוב" : open.length === 1 ? "צריך לתקן דבר אחד" : `צריך לתקן ${open.length} דברים`;
  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setErrorHe(null);
    try {
      const result = await api.proSubmitApplication();
      queryClient.setQueryData(applicationKey, result);
    } catch (e) {
      const known = e instanceof ApiError ? resendErrorHe(e.code) : null;
      if (known) {
        setErrorHe(known);
        // The server knows better than this page what is still open or missing.
        void queryClient.invalidateQueries({ queryKey: applicationKey });
      } else setErrorHe(e instanceof ApiError ? e.message : "השליחה לא עברה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.soft}>ביקשנו כמה תיקונים לפני שנמשיך. מה שכבר אושר נשאר מאושר.</Text>
      <View style={styles.card} accessibilityLabel="מה לתקן">
        {view.fixRequests.map((f) => (
          <View key={f.itemKey} style={styles.fix}>
            <Text style={styles.fixLabel}>{fixLabelHe(f.itemKey, view)}</Text>
            <Text style={styles.soft}>{f.reasonHe}</Text>
            {f.status === "OPEN" ? (
              <Text style={styles.link} accessibilityRole="link" onPress={() => navigate(fixLinkFor(f.itemKey))}>
                לתקן ›
              </Text>
            ) : (
              <Text style={[styles.status, styles.good]}>תוקן ✓</Text>
            )}
          </View>
        ))}
      </View>
      {errorHe ? (
        <Text style={styles.alert} accessibilityRole="alert">
          {errorHe}
        </Text>
      ) : null}
      <PrimaryAction labelHe={busy ? "שולחים…" : "שליחה מחדש"} accessibilityLabelHe="שליחה מחדש" disabled={busy || open.length > 0} onPress={() => void resend()} />
    </>
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
  fix: { gap: spacing.xs, paddingVertical: spacing.xs },
  fixLabel: { ...t.bodyStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  alert: { ...t.metaStrong, color: colors.statusDanger, textAlign: "right", writingDirection: "rtl" },
  link: { ...t.metaStrong, color: colors.actionText, textAlign: "right", writingDirection: "rtl", paddingVertical: spacing.sm },
});
