import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Navigate, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { pilotServiceIdForDatabaseCode, type OfferCardView } from "@pro-now/types";
import { ProOfferBody, ProOnlineBody, catalogServicePages, customerDarkTheme, spacing, type as t, type MarkName } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";
import { ProSignOut } from "./ProSignOut";

/**
 * ONLINE, IN THE BROWSER (docs/21 W7).
 *
 * A web page on iOS cannot track location or wake in the background, so
 * this says plainly: keep the app open while online. While it is open it
 * sends the position every 20 s, and the server — which owns presence —
 * takes the professional offline when the pings stop (the heartbeat
 * sweep).
 *
 * The offer shows the server's countdown and the expected earnings when
 * they are knowable (CLAUDE.md §3, transparent payout); accepting goes
 * through the atomic accept.
 *
 * Offers now arrive on the person's live channel (W9) and, with the phone's
 * notifications on, as a push; the poll below is only the fallback.
 */
const PING_MS = 20_000;
/** The live channel brings offers the moment they are sent (W9); this is the net under it. */
const OFFER_POLL_MS = 15_000;
const ONLINE = new Set(["AVAILABLE", "OFFER_RECEIVED", "RESERVED"]);
export const proStatusKey = ["pro-status"] as const;

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000 })
  );
}

export function ProOnline() {
  const navigate = useNavigate();
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

  // The heartbeat: position while online, every 20 s.
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

  const current: OfferCardView | null = offer.data ?? null;
  if (current && new Date(current.expiresAt).getTime() > nowMs) {
    return (
      <ProOfferBody
        offer={current}
        nowMs={nowMs}
        proFemale={s.addressAs === "F"}
        responding={busy}
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

  return (
    <View style={{ width, height }}>
      <ProOnlineBody
        presenceState={s.presenceState}
        proFemale={s.addressAs === "F"}
        displayNameHe={s.displayName}
        // No money moves through the app (D1): nothing to total here.
        todayNetMinorUnits={null}
        todayJobCount={s.jobsToday}
        services={s.approvedServices.map((x) => {
          const pilotId = pilotServiceIdForDatabaseCode(x.code);
          return {
            id: x.id,
            nameHe: x.nameHe,
            mark: ((pilotId && catalogServicePages[pilotId]?.mark) || "wrench") as MarkName,
            enabled: true,
          };
        })}
        onToggleOnline={busy ? undefined : toggle}
        width={width}
        height={height - 44}
      />
      {/* Online: keep the app open. Offline: the way out (signing out while
          online would leave dispatch counting on someone who has gone). */}
      {online ? (
        <Text style={styles.keepOpen}>
          {s.addressAs === "F"
            ? "את מחוברת — השאירי את האפליקציה פתוחה כדי לקבל קריאות."
            : "אתה מחובר — השאר את האפליקציה פתוחה כדי לקבל קריאות."}
        </Text>
      ) : (
        <View style={styles.strip}>
          <ProSignOut />
        </View>
      )}
      {problemHe ? <Text accessibilityRole="alert" style={styles.problem}>{problemHe}</Text> : null}
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  keepOpen: { ...t.meta, height: 44, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl", paddingHorizontal: spacing.lg, backgroundColor: colors.bg },
  strip: { height: 44, justifyContent: "center", backgroundColor: colors.bg },
  problem: { ...t.body, position: "absolute", bottom: spacing.xxl, left: spacing.lg, right: spacing.lg, color: colors.statusDanger, textAlign: "center", writingDirection: "rtl" },
});
