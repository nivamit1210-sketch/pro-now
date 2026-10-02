import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import type { OfferCardView } from "@pro-now/types";
import { ProOfferBody, ProShiftBody, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { CityHero } from "../../art/CityHero";
import { ErrorScreen, LoadingScreen } from "../../states";
import { ProDocumentsTab, ProEarningsTab, ProPricingPage, ProProfileTab } from "./ProTabs";
import { PRO_TAB_BAR_H, ProTabBar } from "./ProTabBar";
import { markFor, proPageFromPath, shiftChipsFor } from "./proPages";

/**
 * THE PROFESSIONAL'S SIDE, ONCE APPROVED (docs/21 W7; the demo's tabs,
 * 2026-10-01): המשמרת · הרווחים · המסמכים שלי · הפרופיל.
 *
 * Presence lives here, above the tabs, because it is not a tab's business:
 * a professional reading their earnings is still online, their phone must
 * still send its position, and an offer must still take the screen.
 *
 * A web page on iOS cannot track location or wake in the background, so
 * this says plainly: keep the app open while online. While it is open it
 * sends the position every 20 s, and the server — which owns presence —
 * takes the professional offline when the pings stop (the heartbeat
 * sweep).
 *
 * The offer shows the server's countdown and the expected earnings when
 * they are knowable (CLAUDE.md §3, transparent payout); accepting goes
 * through the atomic accept. Offers arrive on the person's live channel
 * (W9) and, with the phone's notifications on, as a push; the poll below
 * is only the fallback.
 */
const PING_MS = 20_000;
/** The live channel brings offers the moment they are sent (W9); this is the net under it. */
const OFFER_POLL_MS = 15_000;
const ONLINE = new Set(["AVAILABLE", "OFFER_RECEIVED", "RESERVED"]);
const KEEP_OPEN_H = 44;
export const proStatusKey = ["pro-status"] as const;
export const proServicesKey = ["pro-services"] as const;

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000 })
  );
}

export function ProOnline() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = proPageFromPath(pathname);
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const [busy, setBusy] = useState(false);
  const [problemHe, setProblemHe] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const last = useRef<GeolocationPosition | null>(null);

  const status = useQuery({ queryKey: proStatusKey, queryFn: api.proStatus, refetchInterval: 10_000 });
  const online = Boolean(status.data && ONLINE.has(status.data.presenceState));
  const offer = useQuery({
    queryKey: ["pro-offer"],
    queryFn: api.proCurrentOffer,
    enabled: online,
    refetchInterval: OFFER_POLL_MS,
  });
  const services = useQuery({ queryKey: proServicesKey, queryFn: api.proServices });

  // The heartbeat: position while online, every 20 s, whatever tab is open.
  useEffect(() => {
    if (!online) return;
    const watch = navigator.geolocation.watchPosition((p) => (last.current = p), () => {}, { enableHighAccuracy: true });
    const ping = async () => {
      const p = last.current ?? (await position().catch(() => null));
      if (!p) return;
      await api
        .proPing({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyMeters: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() })
        .catch((e) => {
          // Taken offline by the server (the heartbeat sweep): re-read, do not retry.
          if (e instanceof ApiError && e.status === 409) void queryClient.invalidateQueries({ queryKey: proStatusKey });
        });
    };
    void ping();
    const timer = setInterval(() => void ping(), PING_MS);
    return () => {
      clearInterval(timer);
      navigator.geolocation.clearWatch(watch);
    };
  }, [online, queryClient]);

  // The countdown ticks locally; its end is the server's `expiresAt`.
  useEffect(() => {
    if (!offer.data) return;
    const tick = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(tick);
  }, [offer.data]);

  if (status.isPending) return <LoadingScreen />;
  if (status.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void status.refetch()} />;
  const s = status.data;
  if (s.activeJobId) return <Navigate to={`/pro/jobs/${s.activeJobId}`} replace />;

  const act = (fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    setProblemHe(null);
    try {
      await fn();
    } catch (e) {
      setProblemHe(
        e instanceof GeolocationPositionError
          ? "לא קיבלנו מיקום. כדי לקבל קריאות צריך לאשר גישה למיקום."
          : e instanceof ApiError
            ? e.message
            : "משהו לא עבד. נסו שוב."
      );
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: proStatusKey });
    }
  };

  // An offer takes the whole screen, on any tab: the bar would cover "לא עכשיו".
  const current: OfferCardView | null = offer.data ?? null;
  if (current && new Date(current.expiresAt).getTime() > nowMs) {
    return (
      <ProOfferBody
        offer={current}
        nowMs={nowMs}
        proFemale={s.addressAs === "F"}
        responding={busy}
        backdrop={<CityHero />}
        onAccept={act(async () => {
          await api.proAcceptOffer(current.offerId, `accept-${current.offerId}`);
          navigate(`/pro/jobs/${current.jobId}`);
        })}
        onSkip={act(async () => {
          await api.proSkipOffer(current.offerId);
          await queryClient.invalidateQueries({ queryKey: ["pro-offer"] });
        })}
        width={width}
        height={height}
      />
    );
  }

  const toggle = act(async () => {
    if (online) {
      if (s.shiftId) await api.proEndShift(s.shiftId);
      return;
    }
    const p = await position();
    await api.proStartShift({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      enabledServiceIds: s.approvedServices.map((x) => x.id),
    });
  });

  // Online: keep the app open — said on every tab, because every tab keeps them online.
  const strip = online ? KEEP_OPEN_H : 0;
  const bodyH = height - PRO_TAB_BAR_H - strip;
  const names = s.approvedServices.map((x) => x.nameHe);

  const body = (() => {
    switch (page) {
      case "earnings":
        return <ProEarningsTab width={width} height={bodyH} />;
      case "documents":
        return <ProDocumentsTab width={width} height={bodyH} />;
      case "profile":
        return <ProProfileTab width={width} height={bodyH} />;
      case "pricing":
        return <ProPricingPage width={width} height={bodyH} onBack={() => navigate("/pro", { replace: true })} />;
      default:
        return (
          <ProShiftBody
            backdrop={<CityHero />}
            displayNameHe={s.displayName}
            tradeHe={names.length ? `${names[0]}${names.length > 1 ? ` ועוד ${names.length - 1}` : ""}` : null}
            presenceState={s.presenceState}
            shift={{
              onlineSinceMs: online && s.shiftStartedAt ? new Date(s.shiftStartedAt).getTime() : null,
              // No money moves through the app (D1): there is no settled amount to divide by the hour.
              settledNetMinorUnits: null,
              completedJobs: s.shiftJobs,
            }}
            // The server has no area reading yet; the screen shows no briefing rather than a guess.
            briefing={{}}
            services={
              services.data
                ? shiftChipsFor(services.data.services)
                : s.approvedServices.map((x) => ({ id: x.id, nameHe: x.nameHe, mark: markFor(x.code), live: true }))
            }
            onToggleOnline={busy ? undefined : toggle}
            onOpenEarnings={() => navigate("/pro/earnings", { replace: true })}
            onManageServices={() => navigate("/pro/documents", { replace: true })}
            manageLabelHe="פרטים ›"
            onOpenPricing={() => navigate("/pro/pricing")}
            width={width}
            height={bodyH}
          />
        );
    }
  })();

  return (
    <View style={{ width, height, backgroundColor: colors.bg }}>
      <View style={{ width, height: bodyH, overflow: "hidden" }}>{body}</View>
      {online ? (
        <Text style={styles.keepOpen}>
          {s.addressAs === "F"
            ? "את במשמרת — השאירי את האפליקציה פתוחה כדי לקבל קריאות."
            : s.addressAs === "M"
              ? "אתה במשמרת — השאר את האפליקציה פתוחה כדי לקבל קריאות."
              : "במשמרת — השאירו את האפליקציה פתוחה כדי לקבל קריאות."}
        </Text>
      ) : null}
      <ProTabBar page={page} width={width} />
      {problemHe ? <Text accessibilityRole="alert" style={styles.problem}>{problemHe}</Text> : null}
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  keepOpen: { ...t.meta, height: KEEP_OPEN_H, lineHeight: KEEP_OPEN_H, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", paddingHorizontal: spacing.lg, backgroundColor: colors.bg },
  problem: { ...t.body, position: "absolute", bottom: PRO_TAB_BAR_H + spacing.xl, left: spacing.lg, right: spacing.lg, color: colors.statusDanger, textAlign: "center", writingDirection: "rtl" },
});
