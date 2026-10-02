import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { formatMoney, money, pilotServiceIdForDatabaseCode, type JobState } from "@pro-now/types";
import {
  JobClosedBody,
  JobCompleteBody,
  MatchConfirmBody,
  PrimaryAction,
  SearchingBody,
  TrackingBody,
  catalogServicePages,
  customerDarkTheme,
  departmentCodeByServiceId,
  spacing,
  type as t,
  type MarkName,
} from "@pro-now/ui";

import { api } from "../api";
import { useFrame } from "../frame";
import { ErrorScreen, LoadingScreen } from "../states";
import { tradeCharacterFor } from "../tradeCharacter";
import { useJobSocket } from "../useJobSocket";
import { JobWorldBackdrop } from "../world";
import { CityHero } from "../art/CityHero";

/**
 * One job, from "looking for a professional" to the review (docs/21 W6).
 *
 * Everything shown comes from the server: the job's status, who is coming
 * and their own price (`/match`), and the receipt it closed with. The
 * socket only says that something changed; the screen re-reads the job.
 * No money moves through the app (D1): the receipt says what is owed to
 * the professional directly, and the screens say "לתשלום", never "חויב".
 */
export const jobKey = (id: string) => ["job", id] as const;

const SEARCHING: ReadonlySet<JobState> = new Set(["DRAFT", "SEARCHING", "OFFERING"]);
const ASSIGNED: ReadonlySet<JobState> = new Set([
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
  "REVIEW_PENDING",
  "CLOSED",
]);
/** Where the customer may still cancel (docs/05 §Job transitions). */
const CUSTOMER_MAY_CANCEL: ReadonlySet<JobState> = new Set([
  "DRAFT",
  "SEARCHING",
  "OFFERING",
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "WAITING_QUOTE_APPROVAL",
]);

const ils = (minor: number | null | undefined) => (minor ? formatMoney(money(minor, "ILS")) : null);
const clockIn = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

export function Job() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const [matchSeen, setMatchSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The socket is the fast path; this interval is the net under it.
  const job = useQuery({ queryKey: jobKey(id), queryFn: () => api.getJob(id), refetchInterval: 20_000 });
  const status = job.data?.job.status;
  const match = useQuery({
    queryKey: [...jobKey(id), "match"],
    queryFn: () => api.getJobMatch(id),
    enabled: Boolean(status && ASSIGNED.has(status)),
  });
  useJobSocket(id, () => {
    void queryClient.invalidateQueries({ queryKey: jobKey(id) });
  }, Boolean(status) && status !== "CLOSED" && status !== "CANCELLED");

  if (job.isPending) return <LoadingScreen />;
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) return <Ended titleHe="הקריאה לא נמצאה" onHome={() => navigate("/")} />;
    return <ErrorScreen offline={!navigator.onLine} onRetry={() => void job.refetch()} />;
  }

  const { job: data, receipt, cancellationReason } = job.data;
  const serviceNameHe = data.service.nameHe;
  const pilotId = pilotServiceIdForDatabaseCode(data.service.code);
  const mark = ((pilotId && catalogServicePages[pilotId]?.mark) || "wrench") as MarkName;
  const departmentCode = pilotId ? (departmentCodeByServiceId[pilotId] ?? null) : null;

  const act = (fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: jobKey(id) });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "משהו לא עבד. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };
  /*
   * THE LINK FOR THE PERSON AT HOME. The app sends no SMS yet (vendor TBD),
   * so the orderer shares it: the phone's share sheet where there is one,
   * the clipboard where there is not. Each share mints a fresh link.
   */
  const onSite = job.data.onSite;
  const shareOnSite = onSite
    ? act(async () => {
        const { url } = await api.mintOnSiteLink(id);
        const text = `${onSite.name}, הזמנתי בשבילך ${serviceNameHe}. בקישור: מי מגיע, מתי, והקוד שהוא יגיד בדלת.`;
        if (typeof navigator.share === "function") {
          try {
            await navigator.share({ title: "PRO NOW", text, url });
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
          }
        }
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setNotice("הקישור הועתק — אפשר להדביק בהודעה");
      })
    : undefined;
  const onSiteStatusHe = onSite
    ? onSite.doorCode
      ? `הקוד לדלת: ${onSite.doorCode} · לחצו לשליחת הקישור ל${onSite.name}`
      : `לחצו לשליחת הקישור ל${onSite.name} — פרטי המקצוען והקוד יופיעו בו`
    : null;

  const cancel = CUSTOMER_MAY_CANCEL.has(data.status)
    ? act(async () => {
        if (window.confirm("לבטל את הקריאה?")) await api.cancelJob(id);
      })
    : undefined;

  const withError = (screen: React.ReactNode) => (
    <View style={{ flex: 1 }}>
      {screen}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      {notice && !actionError ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );

  if (data.status === "CANCELLED") {
    return cancellationReason === "NO_PROFESSIONAL_AVAILABLE" ? (
      <Ended
        titleHe="לא מצאנו מקצוען פנוי כרגע"
        bodyHe={`חיפשנו מקצוען ל${serviceNameHe} ואף אחד לא היה זמין. לא נגבה דבר. אפשר לנסות שוב בעוד כמה דקות.`}
        onHome={() => navigate("/")}
      />
    ) : (
      <Ended titleHe="הקריאה בוטלה" bodyHe="לא נגבה דבר." onHome={() => navigate("/")} />
    );
  }

  if (SEARCHING.has(data.status)) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(data.createdAt).getTime()) / 1000));
    /*
     * The search has no cancel of its own in the shared screen (its
     * "leave" belongs to the card after assignment), so the customer's way
     * out while nobody is found yet sits here.
     */
    return withError(
      <>
        <SearchingBody
          backdrop={<JobWorldBackdrop status={data.status} match={match.data ?? null} departmentCode={departmentCode} fallback={<CityHero />} />}
          serviceNameHe={serviceNameHe}
          elapsedSeconds={elapsedSeconds}
          departmentCode={departmentCode ?? undefined}
          onSiteNameHe={onSite?.name ?? null}
          onOpenOnSite={shareOnSite}
          onLeaveWait={cancel}
          onBack={() => navigate("/")}
          width={width}
          height={height}
        />
        {cancel ? (
          <Pressable onPress={cancel} accessibilityRole="button" style={styles.cancelSearch}>
            <Text style={styles.cancelSearchText}>ביטול הקריאה</Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  const m = match.data;
  if (!m) {
    if (match.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void match.refetch()} />;
    return <LoadingScreen />;
  }
  // Their chosen face (D1): the photo's link, or the drawn character of this job's trade.
  const professional = {
    ...m.professional,
    profilePhotoUrl: m.professional.portraitKind === "CHARACTER" ? tradeCharacterFor(data.service.code) : m.professional.profilePhotoUrl,
  };
  const approvedQuote = data.quotes?.find((q) => q.id === data.approvedQuoteId) ?? null;

  if (data.status === "REVIEW_PENDING") {
    const amount = receipt?.amountMinorUnits ?? null;
    return withError(
      <JobCompleteBody
        serviceNameHe={serviceNameHe}
        mark={mark}
        professionalDisplayName={professional.displayName}
        professionalPhotoUrl={professional.profilePhotoUrl}
        whenHe={new Date(data.updatedAt).toLocaleDateString("he-IL")}
        receiptLines={amount === null ? [] : [{ id: "work", labelHe: serviceNameHe, amountMinorUnits: amount }]}
        totalChargedMinorUnits={amount ?? 0}
        paymentCaptured={false}
        paymentMethodLabelHe={amount === null ? "הסכום נסגר ישירות מול בעל המקצוע" : "ישירות לבעל המקצוע"}
        onSubmitReview={(rating, text) =>
          void act(() => api.submitReview(id, { overallRating: rating, ...(text.trim() ? { text: text.trim() } : {}) }))()
        }
        onBack={() => navigate("/")}
        width={width}
        height={height}
      />
    );
  }

  if (data.status === "CLOSED") {
    return (
      <JobClosedBody
        serviceNameHe={serviceNameHe}
        mark={mark}
        professionalDisplayName={professional.displayName}
        whenHe={new Date(data.updatedAt).toLocaleDateString("he-IL")}
        totalChargedMinorUnits={receipt?.amountMinorUnits ?? 0}
        paymentCaptured={false}
        ratingGiven={job.data.ratingGiven}
        onDone={() => navigate("/")}
        width={width}
        height={height}
      />
    );
  }

  // Assigned: first the reveal of who is coming, then the visit itself.
  if (data.status === "PRO_ASSIGNED" && !matchSeen) {
    return withError(
      <MatchConfirmBody
        serviceNameHe={serviceNameHe}
        displayNameHe={professional.displayName}
        headlineHe={`אימות לשירות: ${serviceNameHe}`}
        photoUri={professional.profilePhotoUrl}
        portfolio={[]}
        reasons={[]}
        ratingAverage={professional.proNowRatingAverage}
        ratingCount={professional.proNowRatingCount}
        completedJobs={professional.proNowCompletedJobs}
        credentialsHe={[]}
        eta={m.eta}
        arrivalClockHe={m.eta ? clockIn(m.eta.etaSeconds) : null}
        price={m.price}
        hasAlternative={false}
        onAccept={() => setMatchSeen(true)}
        onBack={() => navigate("/")}
        width={width}
        height={height}
      />
    );
  }

  return withError(
    <TrackingBody
      backdrop={<JobWorldBackdrop status={data.status} match={m} departmentCode={departmentCode} fallback={<CityHero />} />}
      status={data.status}
      serviceNameHe={serviceNameHe}
      professional={professional}
      eta={m.eta}
      arrivalClockHe={m.eta && (data.status === "PRO_ASSIGNED" || data.status === "PRO_EN_ROUTE") ? clockIn(m.eta.etaSeconds) : null}
      money={{
        paidDirectly: !job.data.paymentsInApp,
        visitFeeHe: ils(m.price.visitFeeMinorUnits),
        approvedTotalHe: ils(approvedQuote?.totalMinorUnits),
        /* Ordered for someone else: the repair is quoted here, not at their door. */
        forSomeoneElse: Boolean(onSite),
      }}
      departmentCode={departmentCode}
      onSiteNameHe={onSite?.name ?? null}
      onSiteStatusHe={onSiteStatusHe}
      onOpenOnSiteView={shareOnSite}
      onConfirmCompletion={data.status === "COMPLETION_PENDING" ? act(() => api.confirmCompletion(id)) : undefined}
      onCancelJob={cancel}
      onBack={() => navigate("/")}
      width={width}
      height={height}
    />
  );
}

function Ended({ titleHe, bodyHe, onHome }: { titleHe: string; bodyHe?: string; onHome: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{titleHe}</Text>
      {bodyHe ? <Text style={styles.soft}>{bodyHe}</Text> : null}
      <View style={{ alignSelf: "stretch", marginTop: spacing.xl }}>
        <PrimaryAction labelHe="חזרה לדף הבית" onPress={onHome} />
      </View>
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", marginTop: spacing.sm },
  cancelSearch: {
    position: "absolute",
    bottom: spacing.xxl + spacing.lg,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "rgba(14,10,20,0.72)",
  },
  cancelSearchText: { ...t.body, color: colors.textPrimary, writingDirection: "rtl" },
  notice: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    color: colors.textPrimary,
    textAlign: "center",
    writingDirection: "rtl",
  },
  error: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    color: colors.statusDanger,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
