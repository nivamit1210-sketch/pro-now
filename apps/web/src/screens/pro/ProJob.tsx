import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { formatMoney, money, pilotServiceIdForDatabaseCode, type JobState } from "@pro-now/types";
import {
  PrimaryAction,
  ProJobBody,
  ProJobSettledBody,
  ProQuoteBuilderBody,
  catalogServicePages,
  customerDarkTheme,
  spacing,
  type as t,
  type MarkName,
} from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";
import { useJobSocket } from "../../useJobSocket";
import { proJobPlan } from "./jobPlan";
import { proStatusKey } from "./ProOnline";
import { PRO_TAB_BAR_H, ProTabBar } from "./ProTabBar";
import { SETTLED_STATES, settledView } from "./settled";

/**
 * The professional's job (docs/21 W7): the address (released only now),
 * who opens the door and the code, navigation, each step, and the quote.
 * The job's socket announces the customer's side (a cancellation, the
 * confirmation), and the job is re-read over REST.
 *
 * Navigation: Waze and Google Maps by coordinates. The ETA stays the
 * server's estimate until a routing provider is chosen (docs/21 §5 D5).
 */
const NEXT_STEP: Partial<Record<JobState, "en-route" | "arrive" | "start" | "complete">> = {
  PRO_ASSIGNED: "en-route",
  PRO_EN_ROUTE: "arrive",
  PRO_ARRIVED: "start",
  IN_PROGRESS: "complete",
};
const DONE: ReadonlySet<JobState> = new Set(["COMPLETION_PENDING", "COMPLETED", "REVIEW_PENDING", "CLOSED", "CANCELLED"]);

export function ProJob() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problemHe, setProblemHe] = useState<string | null>(null);

  const key = ["pro-job", id] as const;
  const job = useQuery({ queryKey: key, queryFn: () => api.proJob(id), refetchInterval: 20_000 });
  // Still listening while the customer is asked to confirm: their answer is what closes the job here.
  const listening = Boolean(job.data) && (!DONE.has(job.data!.status) || job.data!.status === "COMPLETION_PENDING");
  useJobSocket(id, () => void queryClient.invalidateQueries({ queryKey: key }), listening);
  const status = useQuery({ queryKey: proStatusKey, queryFn: api.proStatus });

  /*
   * THE JOB SETTLED (the demo's ProJobSettledBody): shown when this screen
   * watched the job close — the customer confirmed while it was open — not
   * when an old, closed job is opened again. Read fresh, after the close,
   * so the shift's count and amounts include this job.
   */
  const watchedOpen = useRef(false);
  const [settledDone, setSettledDone] = useState(false);
  const jobStatus = job.data?.status;
  if (jobStatus && !SETTLED_STATES.has(jobStatus) && jobStatus !== "CANCELLED") watchedOpen.current = true;
  const showSettled = Boolean(jobStatus && SETTLED_STATES.has(jobStatus) && watchedOpen.current && !settledDone);
  const settled = useQuery({
    queryKey: ["pro-job-settled", id],
    queryFn: async () => {
      const [s, earnings] = await Promise.all([api.proStatus(), api.proEarnings().catch(() => null)]);
      // The fresh status no longer names this job as active, so a tab tapped meanwhile does not bounce back here.
      queryClient.setQueryData(proStatusKey, s);
      return { status: s, earnings };
    },
    enabled: showSettled,
    staleTime: Infinity,
  });
  const leave = () => {
    // Drop the cached status: it still names this job as active, and
    // /pro would send the professional straight back here.
    queryClient.removeQueries({ queryKey: proStatusKey });
    navigate("/pro");
  };

  if (job.isPending) return <LoadingScreen />;
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) return <Ended titleHe="העבודה לא נמצאה" onBack={() => navigate("/pro")} />;
    return <ErrorScreen offline={!navigator.onLine} onRetry={() => void job.refetch()} />;
  }
  const j = job.data;
  const female = status.data?.addressAs === "F";

  const act = (fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    setProblemHe(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      setProblemHe(e instanceof ApiError ? e.message : "משהו לא עבד. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (j.status === "CANCELLED") return <Ended titleHe="הלקוח ביטל את הקריאה" onBack={() => navigate("/pro")} />;
  if (showSettled && settled.isPending) return <LoadingScreen />;
  if (showSettled && settled.data) {
    // Above the professional's tabs, as in the demo: the job is over, the shift is not.
    return (
      <View style={{ width, height }}>
        <ProJobSettledBody
          {...settledView({ job: j, status: settled.data.status, earnings: settled.data.earnings, nowMs: Date.now() })}
          onDone={() => {
            setSettledDone(true);
            leave();
          }}
          width={width}
          height={height - PRO_TAB_BAR_H}
        />
        <ProTabBar page="shift" width={width} />
      </View>
    );
  }
  if (DONE.has(j.status)) {
    return (
      <Ended
        titleHe={j.status === "COMPLETION_PENDING" ? "סיימת — מחכים לאישור הלקוח" : "העבודה הסתיימה"}
        bodyHe="באפליקציה לא עובר כסף: את הסכום הלקוח משלם לך ישירות."
        onBack={leave}
      />
    );
  }

  if (quoting) {
    return (
      <ProQuoteBuilderBody
        serviceNameHe={j.serviceNameHe}
        customerTextHe={j.descriptionHe}
        paidDirectly
        onSend={(draft) =>
          void act(async () => {
            await api.proSendQuote(j.jobId, {
              lineItems: draft.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceMinorUnits: l.unitPriceMinorUnits, kind: l.kind })),
              notes: draft.notesHe || undefined,
            });
            setQuoting(false);
          })()
        }
        onBack={() => setQuoting(false)}
        width={width}
        height={height}
      />
    );
  }

  const pilotId = pilotServiceIdForDatabaseCode(j.serviceCode) ?? null;
  const mark = ((pilotId && catalogServicePages[pilotId]?.mark) || "wrench") as MarkName;
  const next = NEXT_STEP[j.status];
  const agreed = j.approvedQuote?.totalMinorUnits;
  /* Ordinary visit: finish the diagnosis. Ordered for someone else: quote in the app. */
  const plan = proJobPlan(j);
  const navigateTo = j.lat !== null && j.lng !== null
    ? () => window.open(`https://waze.com/ul?ll=${j.lat},${j.lng}&navigate=yes`, "_blank", "noopener")
    : undefined;

  return (
    <View style={{ width, height }}>
      <ProJobBody
        status={j.status}
        serviceNameHe={j.serviceNameHe}
        mark={mark}
        addressHe={j.addressHe}
        accessNoteHe={j.accessNoteHe}
        routeEtaMinutes={j.routeEtaMinutes}
        distanceHe={null}
        customerNameHe={j.customerNameHe}
        customerSeed={j.jobId}
        onSiteContactNameHe={j.onSiteNameHe}
        kind={plan.kind}
        visitTerms={plan.visitTerms}
        diagnosisOnly={plan.diagnosisOnly}
        quoteGoesToHe={plan.quoteGoesToHe}
        doorCodeHe={j.doorCodeHe}
        symptomsHe={[]}
        descriptionHe={j.descriptionHe}
        media={j.media.map((m) => ({ id: m.id, kind: m.kind === "VOICE_NOTE" ? "VOICE" : "PHOTO", subjectHe: "תמונה מהלקוח", uri: m.url }))}
        payoutMinorUnits={j.payoutMinorUnits}
        payoutIsEstimate={j.payoutIsEstimate}
        agreedPriceHe={agreed ? formatMoney(money(agreed, "ILS")) : null}
        proFemale={female}
        onNavigate={navigateTo}
        onAdvance={next ? act(() => api.proStep(j.jobId, next)) : undefined}
        onSendQuote={j.status === "DIAGNOSIS" ? () => setQuoting(true) : undefined}
        onFinishDiagnosis={j.status === "DIAGNOSIS" ? act(() => api.proStep(j.jobId, "complete")) : undefined}
        width={width}
        height={height}
      />
      {navigateTo ? (
        <Text
          accessibilityRole="link"
          style={styles.maps}
          onPress={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}`, "_blank", "noopener")}
        >
          או ב־Google Maps ›
        </Text>
      ) : null}
      {problemHe ? <Text accessibilityRole="alert" style={styles.problem}>{problemHe}</Text> : null}
    </View>
  );
}

function Ended({ titleHe, bodyHe, onBack }: { titleHe: string; bodyHe?: string; onBack: () => void }) {
  return (
    <View style={styles.ended}>
      <Text style={styles.title}>{titleHe}</Text>
      {bodyHe ? <Text style={styles.soft}>{bodyHe}</Text> : null}
      <View style={{ alignSelf: "stretch", marginTop: spacing.xl }}>
        <PrimaryAction labelHe="חזרה" onPress={onBack} />
      </View>
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  ended: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", marginTop: spacing.sm },
  maps: { ...t.metaStrong, position: "absolute", top: spacing.md, left: spacing.lg, color: colors.actionText, writingDirection: "rtl" },
  problem: { ...t.body, position: "absolute", bottom: spacing.xxl, left: spacing.lg, right: spacing.lg, color: colors.statusDanger, textAlign: "center", writingDirection: "rtl" },
});
