import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { ProEarningsBody, ProPricingBody, ProVerificationBody, ProVerificationStepBody, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { ErrorScreen, LoadingScreen } from "../../states";
import { applicationKey } from "./ProJoin";
import { ApplicationStatus } from "./ProHome";
import { earningsPropsFor, eligibilityFor, pricingRowsFor, verificationStepsFor } from "./proPages";

type Size = { width: number; height: number };

/**
 * The tabs' pages (the demo's, 2026-10-01). Each reads the server and says
 * only what it read: no sample week, no payout date, no commission — those
 * are undecided (CLAUDE.md §4) and the screens are told so.
 */

export function ProEarningsTab({ width, height }: Size) {
  const earnings = useQuery({ queryKey: ["pro-earnings"], queryFn: api.proEarnings });
  if (earnings.isPending) return <LoadingScreen />;
  if (earnings.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void earnings.refetch()} />;
  return (
    <ProEarningsBody
      {...earningsPropsFor(earnings.data)}
      // The payout schedule is undecided, and under D1 nothing is paid out by us.
      nextPayoutHe={null}
      nextPayoutMinorUnits={null}
      width={width}
      height={height}
    />
  );
}

export function ProDocumentsTab({ width, height }: Size) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const application = useQuery({ queryKey: applicationKey, queryFn: api.proApplication });
  const services = useQuery({ queryKey: ["pro-services"], queryFn: api.proServices });
  if (application.isPending || services.isPending) return <LoadingScreen />;
  if (application.isError || services.isError)
    return (
      <ErrorScreen
        offline={!navigator.onLine}
        onRetry={() => {
          void application.refetch();
          void services.refetch();
        }}
      />
    );
  const steps = verificationStepsFor(application.data);
  const open = openId ? steps.find((s) => s.id === openId) ?? null : null;
  if (open) {
    return (
      <View style={{ width, height }}>
        <ProVerificationStepBody
          step={open}
          // Uploading happens where it did when joining; the admin reviews it there.
          onSubmit={open.state === "VERIFIED" || open.state === "IN_REVIEW" ? undefined : () => navigate("/pro/join?at=documents")}
          onBack={() => setOpenId(null)}
          width={width}
          height={height}
        />
      </View>
    );
  }
  return (
    <ProVerificationBody
      displayNameHe={application.data.profile.displayName}
      steps={steps}
      services={eligibilityFor(services.data.services)}
      onOpenStep={setOpenId}
      width={width}
      height={height}
    />
  );
}

export function ProProfileTab({ width, height }: Size) {
  const application = useQuery({ queryKey: applicationKey, queryFn: api.proApplication });
  if (application.isPending) return <LoadingScreen />;
  if (application.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void application.refetch()} />;
  return <ApplicationStatus view={application.data} width={width} height={height} />;
}

const SAVE_AFTER_MS = 800;

/**
 * Their prices, saved to the server as they type (debounced per service).
 * The server validates; what it refuses is said under the screen. No price
 * list and no night surcharge yet: the first waits on sync item D, the
 * second has nowhere to be kept, and a field that is not kept is a promise.
 */
export function ProPricingPage({ width, height, onBack }: Size & { onBack: () => void }) {
  const queryClient = useQueryClient();
  const services = useQuery({ queryKey: ["pro-services"], queryFn: api.proServices });
  const [problemHe, setProblemHe] = useState<string | null>(null);
  const [savedHe, setSavedHe] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  if (services.isPending) return <LoadingScreen />;
  if (services.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void services.refetch()} />;

  const save = (serviceId: string, amountMinorUnits: number | null) => {
    const pending = timers.current.get(serviceId);
    if (pending) clearTimeout(pending);
    setSavedHe(null);
    timers.current.set(
      serviceId,
      setTimeout(() => {
        timers.current.delete(serviceId);
        api
          .proSetPricing(serviceId, { basePriceMinorUnits: amountMinorUnits })
          .then(async () => {
            setProblemHe(null);
            setSavedHe("נשמר");
            await queryClient.invalidateQueries({ queryKey: ["pro-services"] });
          })
          .catch((e) => setProblemHe(e instanceof ApiError ? e.message : "המחיר לא נשמר. נסו שוב."));
      }, SAVE_AFTER_MS)
    );
  };

  return (
    <View style={{ width, height }}>
      <ProPricingBody
        rows={pricingRowsFor(services.data.services)}
        // The commission is an open business decision (CLAUDE.md §4).
        commissionPercent={null}
        onChange={save}
        showPriceList={false}
        showAfterHours={false}
        onBack={onBack}
        width={width}
        height={height}
      />
      {problemHe || savedHe ? (
        <Text accessibilityRole={problemHe ? "alert" : undefined} style={[styles.note, problemHe ? styles.problem : null]}>
          {problemHe ?? savedHe}
        </Text>
      ) : null}
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  note: { ...t.metaStrong, position: "absolute", bottom: spacing.lg, left: spacing.lg, right: spacing.lg, color: colors.trust, textAlign: "center", writingDirection: "rtl" },
  problem: { color: colors.statusDanger },
});
