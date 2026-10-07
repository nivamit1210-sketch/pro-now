import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { formatMoney, money, pilotServiceIdForDatabaseCode, type JobState } from "@pro-now/types";
import {
  ArrivalVerifyBody,
  JobClosedBody,
  JobCompleteBody,
  FocusSheet,
  QuoteApprovalBody,
  type QuotePriceContext,
  priceExplainer,
  OrdersDock,
  PrimaryAction,
  SearchingBody,
  TrackingBody,
  catalogServicePages,
  customerDarkTheme,
  departmentCodeByServiceId,
  radii,
  spacing,
  type as t,
  type MarkName,
} from "@pro-now/ui";

import { api, useMe } from "../api";
import { useFrame } from "../frame";
import { ErrorScreen, LoadingScreen } from "../states";
import { tradeCharacterFor } from "../tradeCharacter";
import { useJobSocket } from "../useJobSocket";
import { JobWorldBackdrop } from "../world";
import { strollHref } from "../world/worldLinks";
import { CityHero } from "../art/CityHero";
import { arrivalHeadlineHe, showsArrival } from "./arrival";
import { SafetySheet } from "./SafetySheet";
import { liveEtaClock, matchRevealState, onTheWayState, revealFigure } from "./matchReveal";
import { severalOrders } from "../orders";
import { useOrders } from "../useOrders";
import { useVoicePlayer } from "../useVoicePlayer";

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
/**
 * Once the professional is at the door there is nobody to follow, so the
 * same place offers a walk round the street while the work is done (the
 * demo's "✦ סיור בעיר שלנו", on its tracking stages from "arrived" on). The
 * quote has its own screen there, without it.
 */
const STROLL_WHILE_WORKING: ReadonlySet<JobState> = new Set(["PRO_ARRIVED", "DIAGNOSIS", "IN_PROGRESS", "COMPLETION_PENDING"]);

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

/**
 * An order's screens, with the other orders one tap away: with two orders or
 * more, the demo's switcher (OrdersDock, "1 מתוך 2") over the order's own
 * screens, beside the back control.
 */
export function Job() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { width } = useFrame();
  const orders = useOrders(id ?? null);
  return (
    <View style={{ flex: 1 }}>
      <JobScreen />
      {severalOrders(orders) ? (
        <View style={styles.switcher} pointerEvents="box-none">
          <OrdersDock variant="switcher" orders={orders} onOpen={(next) => navigate(`/jobs/${next}`)} width={width} />
        </View>
      ) : null}
    </View>
  );
}

function JobScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const [matchSeen, setMatchSeen] = useState(false);
  const [arrivalSeen, setArrivalSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  // On the way: the street is the screen (the demo's), and the tracking card
  // is its "פרטי ההזמנה" — open while this is true.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The quote sheet, put aside; it opens again the next time the job does.
  const [quoteDismissed, setQuoteDismissed] = useState(false);
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: api.getAddresses });
  const me = useMe();
  // Into the street and back to this job; without a figure, the picker first (the demo's strollDoor).
  const hasAvatar = Boolean(me.data?.customer?.avatarId);
  const stroll = () => navigate(strollHref(hasAvatar, `/jobs/${id}`));

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
  // A voice note sent with a quote waiting for this orderer (ordered for someone else).
  const voiceOfQuote = job.data?.job.quotes?.find((q) => q.status === "SENT")?.media?.find((x) => x.kind === "VOICE_NOTE" && x.uploadId);
  const quoteVoice = useVoicePlayer(voiceOfQuote ? `/api/v1/media/${encodeURIComponent(voiceOfQuote.uploadId!)}` : null);

  if (job.isPending) return <LoadingScreen />;
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) return <Ended titleHe="הקריאה לא נמצאה" onHome={() => navigate("/")} />;
    return <ErrorScreen offline={!navigator.onLine} onRetry={() => void job.refetch()} />;
  }

  const { job: data, receipt, cancellationReason } = job.data;
  // The name, mark and street the customer picked (audit v2 #1); older jobs go by the service.
  const serviceNameHe = job.data.serviceNameHe;
  const pilotId = data.catalogServiceId ?? pilotServiceIdForDatabaseCode(data.service.code);
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
        const female = match.data?.professional.addressAs === "F";
        const text = `${onSite.name}, הזמנתי בשבילך ${serviceNameHe}. בקישור: מי ${female ? "מגיעה" : "מגיע"}, מתי, והקוד ${female ? "שהיא תגיד" : "שהוא יגיד"} בדלת.`;
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

  const withError = (screen: React.ReactNode, overlay?: React.ReactNode) => (
    <View style={{ flex: 1 }}>
      {screen}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      {notice && !actionError ? <Text style={styles.notice}>{notice}</Text> : null}
      {overlay}
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

  // Assigned, but who it is has not arrived yet (`/match`): the search stays
  // up rather than a loading screen, so the street flying it carries on into
  // the flight to the shop instead of being torn down and built again.
  const awaitingReveal = data.status === "PRO_ASSIGNED" && !matchSeen && !match.data && !match.isError;
  if (SEARCHING.has(data.status) || awaitingReveal) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(data.createdAt).getTime()) / 1000));
    /*
     * The search has no cancel of its own in the shared screen (its
     * "leave" belongs to the card after assignment), so the customer's way
     * out while nobody is found yet sits here.
     */
    return withError(
      <>
        <SearchingBody
          backdrop={<JobWorldBackdrop status={data.status} match={match.data ?? null} departmentCode={departmentCode} serviceId={pilotId} fallback={<CityHero />} />}
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
  // How they asked to be addressed while joining: הגיעה, מגיעה (addressAs "F").
  const professionalFemale = m.professional.addressAs === "F";
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
        onStroll={stroll}
        strollNeedsAvatar={!hasAvatar}
        width={width}
        height={height}
      />
    );
  }

  // Assigned: first the reveal of who is coming, then the visit itself. As
  // the demo's: the search screen stays, the camera flies into the trade's
  // shop, and the match card rises over it with the one person the server
  // assigned (matchReveal.ts).
  if (data.status === "PRO_ASSIGNED" && !matchSeen) {
    const explain = priceExplainer(m.price, { stage: "match", proFirstNameHe: professional.displayName.split(" ")[0] });
    const character = m.professional.portraitKind === "CHARACTER";
    // The same shape as the search above (a fragment holding the screen), so
    // React keeps the street that has been flying the search: the flight into
    // the shop starts from wherever the search left the camera.
    return withError(
      <>
      <SearchingBody
        backdrop={
          <JobWorldBackdrop
            status={data.status}
            match={m}
            departmentCode={departmentCode}
            serviceId={pilotId}
            reveal={{
              nameHe: professional.displayName,
              female: professionalFemale,
              figure: revealFigure(professional.profilePhotoUrl, character),
            }}
            fallback={<CityHero />}
          />
        }
        living={matchRevealState(m, departmentCode, serviceNameHe, professional.profilePhotoUrl)}
        serviceNameHe={serviceNameHe}
        departmentCode={departmentCode ?? undefined}
        etaMinutes={m.eta ? Math.round(m.eta.etaSeconds / 60) : null}
        arrivalClockHe={m.eta ? clockIn(m.eta.etaSeconds) : null}
        visitFeeHe={`${explain.headline} · ${explain.detail}`}
        checkingEligibility
        onSiteNameHe={onSite?.name ?? null}
        onOpenOnSite={shareOnSite}
        onAccept={() => setMatchSeen(true)}
        onBack={() => navigate("/")}
        width={width}
        height={height}
      />
      </>
    );
  }

  /*
   * ON THE WAY, IN THE STREET (the demo's ASSIGNED_ROUTE). The same screen
   * as the search and the reveal, so the street carries on: their van drives
   * to you, the live card counts down to the server's ETA, and an invite
   * offers a walk meanwhile ("נקרא לכם כש… מתקרב": the server's PRO_NEARBY).
   * "פרטי ההזמנה" opens the tracking card, which has everything else
   * (cancelling, the money).
   *
   * Not for an order for someone else: the demo's wait there says "{name}
   * קיבל הודעה עם הפרטים וקוד לדלת", and nothing is sent by itself here (no
   * SMS, D4): the person who ordered sends the link, from the tracking card's
   * door-code line. So that card stays the screen for them.
   */
  if ((data.status === "PRO_ASSIGNED" || data.status === "PRO_EN_ROUTE") && !detailsOpen && !onSite) {
    const clock = liveEtaClock(m.eta, m.etaSecondsAtAssignment ?? null);
    const explain = priceExplainer(m.price, { stage: "match", proFirstNameHe: professional.displayName.split(" ")[0] });
    const addressHe = addresses.data?.addresses.find((a) => a.id === data.addressId)?.formatted ?? null;
    return withError(
      <>
      <SearchingBody
        backdrop={<JobWorldBackdrop status={data.status} match={m} departmentCode={departmentCode} serviceId={pilotId} fallback={<CityHero />} />}
        living={onTheWayState(m, departmentCode, serviceNameHe, professional.profilePhotoUrl)}
        serviceNameHe={serviceNameHe}
        departmentCode={departmentCode ?? undefined}
        etaMinutes={m.eta ? Math.round(m.eta.etaSeconds / 60) : null}
        arrivalClockHe={m.eta ? clockIn(m.eta.etaSeconds) : null}
        liveEta={
          clock
            ? {
                proFirstNameHe: professional.displayName.split(" ")[0] ?? professional.displayName,
                female: professionalFemale,
                proPhotoUri: professional.profilePhotoUrl,
                serviceNameHe,
                ...clock,
              }
            : null
        }
        onStroll={stroll}
        waitDetailsHe={[
          { labelHe: "העבודה", valueHe: serviceNameHe },
          { labelHe: "המחיר", valueHe: explain.headline },
          ...(addressHe ? [{ labelHe: "הכתובת", valueHe: addressHe }] : []),
        ]}
        onPlayAction={(action) => {
          if (action === "JOB_DETAILS") setDetailsOpen(true);
          if (action === "PLAY_MORE" || action === "WHILE_YOU_WAIT") stroll();
        }}
        onSafety={() => setSafetyOpen(true)}
        onLeaveWait={() => navigate("/")}
        onBack={() => navigate("/")}
        width={width}
        height={height}
      />
      </>,
      <SafetySheet
        visible={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        jobId={id}
        onSiteNameHe={null}
        onShare={shareOnSite}
        width={width}
        height={height}
      />
    );
  }

  /*
   * AT THE DOOR: who to expect, the server's code to ask for, and the car
   * when the professional gave one (audit v2 #8a: the server sends it only
   * from assignment, and of the plate only its last digits). No call or
   * message (no masking vendor yet) — the screen shows only what is real.
   * Sharing exists only for an order for someone else: the link with the
   * code, for them.
   */
  if (showsArrival(data.status, arrivalSeen)) {
    return withError(
      <ArrivalVerifyBody
        displayNameHe={professional.displayName}
        professionalFemale={professionalFemale}
        photoUri={professional.profilePhotoUrl}
        headlineHe={arrivalHeadlineHe(serviceNameHe, professional.proNowCompletedJobs)}
        codeHe={job.data.doorCode}
        onSiteNameHe={onSite?.name ?? null}
        vehicleHe={m.vehicle?.vehicleHe ?? null}
        plateTailHe={m.vehicle?.plateTailHe ?? null}
        etaMinutes={null}
        onShare={shareOnSite}
        onBack={() => setArrivalSeen(true)}
        // "משהו לא נראה לי תקין": the demo's safety sheet, and a report that reaches a person (audit v2 #8b).
        onReport={() => setSafetyOpen(true)}
        width={width}
        height={height}
      />,
      <SafetySheet
        visible={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        jobId={id}
        onSiteNameHe={onSite?.name ?? null}
        onShare={shareOnSite}
        width={width}
        height={height}
      />
    );
  }

  const strollPill = STROLL_WHILE_WORKING.has(data.status) ? (
    <Pressable onPress={stroll} accessibilityRole="button" accessibilityLabel="סיור בעיר שלנו" style={styles.groundSwitch}>
      <Text style={styles.groundSwitchText}>✦ סיור בעיר שלנו</Text>
    </Pressable>
  ) : null;

  /*
   * ORDERED FOR SOMEONE ELSE: THE PRICE IS DECIDED HERE (the demo's quote
   * sheet over the visit; Dvir, 2026-10-07). What the professional found,
   * in photos and words, then what it includes, then the sum; approving
   * lets them start. No money in the app (D1): at home they pay the
   * approved amount directly. Declining is the job's own cancellation.
   */
  const pendingQuote = data.status === "WAITING_QUOTE_APPROVAL" && onSite ? (data.quotes?.find((q) => q.status === "SENT") ?? null) : null;
  const quoteSheet =
    pendingQuote && !quoteDismissed ? (
      <FocusSheet
        visible
        heightFraction={0.94}
        titleHe={`${professional.displayName} ${professionalFemale ? "שלחה" : "שלח"} הצעת מחיר`}
        onDismiss={() => setQuoteDismissed(true)}
        width={width}
        height={height}
      >
        <QuoteApprovalBody
          quote={pendingQuote}
          includesVisitFee={data.service.priceModel === "VISIT_QUOTE"}
          serviceNameHe={serviceNameHe}
          professionalDisplayName={professional.displayName}
          professionalPhotoUrl={professional.profilePhotoUrl}
          priceContext={job.data.priceContext as QuotePriceContext | null}
          photos={(pendingQuote.media ?? []).filter((x) => x.kind === "PHOTO" && x.uploadId).map((x) => `/api/v1/media/${encodeURIComponent(x.uploadId!)}`)}
          forOnSiteHe={onSite!.name}
          voiceNote={quoteVoice}
          paidDirectly={!job.data.paymentsInApp}
          onApprove={(hash) => void act(() => api.approveQuote(pendingQuote.id, hash, `approve-${pendingQuote.id}-${hash}`))()}
          onDecline={cancel}
          width={width}
          height={Math.round(height * 0.94) - 56}
        />
      </FocusSheet>
    ) : null;

  return withError(
    <TrackingBody
      backdrop={<JobWorldBackdrop status={data.status} match={m} departmentCode={departmentCode} serviceId={pilotId} fallback={<CityHero />} />}
      status={data.status}
      serviceNameHe={serviceNameHe}
      professional={professional}
      professionalFemale={professionalFemale}
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
      onBack={() => (data.status === "PRO_ASSIGNED" || data.status === "PRO_EN_ROUTE" ? setDetailsOpen(false) : navigate("/"))}
      width={width}
      height={height}
    />,
    <>
      {strollPill}
      {quoteSheet}
    </>
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
  // Over the order's screens, beside the back control (the demo's top-left).
  switcher: { position: "absolute", top: spacing.sm, left: spacing.lg, zIndex: 20 },
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
  // The demo's ground switch, under the back control on the tracking screen.
  groundSwitch: {
    position: "absolute",
    zIndex: 5,
    top: spacing.xl * 2,
    left: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(46,38,64,0.92)",
    alignItems: "center",
  },
  groundSwitchText: { ...t.bodyStrong, color: "#F7F3FA", writingDirection: "rtl" },
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
