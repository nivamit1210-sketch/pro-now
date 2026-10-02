import { StyleSheet, Text, View } from "react-native";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { OnSiteBody, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../api";
import { useFrame } from "../frame";
import { tradeCharacterFor } from "../tradeCharacter";
import { ErrorScreen, LoadingScreen } from "../states";

/**
 * The page the person at home opens (docs/21 W6): no account, no app. Who
 * is coming, what was checked, when, and the one thing to do — ask for the
 * code before opening the door. It has no address and no price, and
 * nothing on it approves or pays; that belongs to whoever ordered.
 *
 * It has no socket (nobody is signed in), so it re-reads every 15 s.
 */
export function OnSite() {
  const { token = "" } = useParams();
  const { width, height } = useFrame();
  const page = useQuery({
    queryKey: ["on-site", token],
    queryFn: () => api.getOnSite(token),
    refetchInterval: 15_000,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  if (page.isPending) return <LoadingScreen />;
  if (page.isError) {
    if (page.error instanceof ApiError && page.error.status === 404) {
      return <Plain titleHe="הקישור כבר לא בתוקף" bodyHe="אפשר לבקש קישור חדש ממי שהזמין." />;
    }
    return <ErrorScreen offline={!navigator.onLine} onRetry={() => void page.refetch()} />;
  }

  const v = page.data;
  if (v.stage === "cancelled") return <Plain titleHe="הביקור בוטל" bodyHe={`${v.ordererNameHe} ביטל/ה את הקריאה. אף אחד לא יגיע.`} />;
  if (v.stage === "searching" || !v.professional) {
    return (
      <Plain
        titleHe={`שלום ${v.onSiteNameHe}`}
        bodyHe={`${v.ordererNameHe} הזמין/ה בשבילך ${v.serviceNameHe}. מחפשים עכשיו מקצוען פנוי — כשיימצא, יופיעו כאן השם שלו והקוד שהוא יגיד בדלת.`}
      />
    );
  }

  const verifiedHe = [
    `אימות לשירות: ${v.serviceNameHe}`,
    ...(v.professional.verifications.includes("IDENTITY_VERIFIED") ? ["זהות מאומתת"] : []),
    ...(v.professional.verifications.includes("IDENTITY_CHECKED") ? ["הזהות נבדקה על ידי PRO NOW"] : []),
  ];
  return (
    <OnSiteBody
      ordererNameHe={v.ordererNameHe}
      onSiteNameHe={v.onSiteNameHe}
      serviceNameHe={v.serviceNameHe}
      proNameHe={v.professional.displayName}
      proFemale={v.professional.addressAs === "F"}
      proPhotoUri={v.professional.portraitKind === "CHARACTER" ? tradeCharacterFor(v.serviceCode) : v.professional.photoUrl}
      verifiedHe={verifiedHe}
      stage={v.stage}
      minutesAway={v.etaSeconds === null ? null : Math.max(1, Math.round(v.etaSeconds / 60))}
      codeHe={v.doorCode}
      width={width}
      height={height}
    />
  );
}

function Plain({ titleHe, bodyHe }: { titleHe: string; bodyHe: string }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{titleHe}</Text>
      <Text style={styles.soft}>{bodyHe}</Text>
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", marginTop: spacing.sm },
});
