import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Navigate, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";
import { applicationKey } from "./ProJoin";
import { ProOnline } from "./ProOnline";
import { ProSignOut } from "./ProSignOut";

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
  // Approved for at least one service: the work screen.
  if (accountApproved && approved.length > 0 && !reviewOnly) return <ProOnline />;
  return (
    <ScrollView style={{ width, height, backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Text style={styles.title}>{accountApproved && approved.length > 0 ? "אושרתם לעבודה" : "הבקשה בבדיקה"}</Text>
      <Text style={styles.soft}>
        {accountApproved && approved.length > 0
          ? "השירותים המאושרים מקבלים קריאות כשאתם מחוברים. שירות שעדיין בבדיקה יתחיל לקבל כשיאושר."
          : "בודקים את הפרטים, את המסמכים ואת כל שירות בנפרד. נעדכן כאן כשיש החלטה."}
      </Text>
      <View style={styles.card}>
        <Row labelHe="הפרטים והמסמכים" statusHe={accountApproved ? "מאושר ✓" : "בבדיקה"} />
        {view.services.map((s) => (
          <Row key={s.serviceId} labelHe={s.nameHe} statusHe={SERVICE_STATUS_HE[s.status] ?? s.status} />
        ))}
      </View>
      <PrimaryAction labelHe="עדכון הבקשה" onPress={() => navigate("/pro/join")} />
      <Text style={styles.link} accessibilityRole="link" onPress={() => navigate("/?as=customer")}>
        להזמין מקצוען לעצמכם ›
      </Text>
      <ProSignOut />
    </ScrollView>
  );
}

function Row({ labelHe, statusHe }: { labelHe: string; statusHe: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{labelHe}</Text>
      <Text style={styles.status}>{statusHe}</Text>
    </View>
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
  link: { ...t.metaStrong, color: colors.actionText, textAlign: "right", writingDirection: "rtl", paddingVertical: spacing.sm },
});
