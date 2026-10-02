import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { PrimaryAction, ProEarningsBody, ProPricingBody, ProProfileBody, ProVerificationBody, ProVerificationStepBody, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { ErrorScreen, LoadingScreen } from "../../states";
import { applicationKey } from "./ProJoin";
import { ProSignOut } from "./ProSignOut";
import { VehicleFields } from "./ProVehicle";
import { vehicleInput, vehicleLineHe, vehicleProblemsHe, type VehicleDraft } from "./vehicle";
import { earningsPropsFor, eligibilityFor, pricingRowsFor, publicProfilePropsFor, verificationStepsFor } from "./proPages";

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

/**
 * הפרופיל — the demo's profile tab: "ככה הלקוחות רואים אותך", their profile
 * framed as a customer is shown it (the same summary as the match card),
 * with "עריכה" back to the join's summary. Signing out stays under it
 * (sync item H); the application's status is on "המסמכים שלי".
 */
export function ProProfileTab({ width, height }: Size) {
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ["pro-public-profile"], queryFn: api.proPublicProfile });
  // Their car (audit v2 #8a) lives on the application; changed here, any time.
  const application = useQuery({ queryKey: applicationKey, queryFn: api.proApplication });
  const [editingVehicle, setEditingVehicle] = useState(false);
  if (profile.isPending) return <LoadingScreen />;
  if (profile.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void profile.refetch()} />;
  const props = publicProfilePropsFor(profile.data);
  const vehicle = application.data?.profile.vehicle ?? null;
  const frameH = height - PROFILE_HEAD_H - PROFILE_VEHICLE_H - PROFILE_FOOT_H;
  return (
    <View style={[styles.profileScreen, { width, height }]}>
      <View style={styles.profileHead}>
        <Text accessibilityRole="header" style={styles.profileTitle}>
          ככה הלקוחות רואים אותך
        </Text>
        <Pressable
          onPress={() => navigate("/pro/join?at=summary")}
          accessibilityRole="button"
          accessibilityLabel="עריכת החנות והפרטים"
          style={styles.editButton}
        >
          <Text style={styles.editText}>עריכה</Text>
        </Pressable>
      </View>
      <View style={[styles.frame, { height: frameH }]}>
        <ProProfileBody
          {...props}
          workPhotoSubjects={[]}
          activeSinceYear={null}
          areaLabelHe={null}
          width={width - spacing.lg * 2}
          height={frameH}
        />
      </View>
      {/* What the customer looks for at the door, from assignment on (audit v2 #8a). */}
      <Pressable
        onPress={() => vehicle && setEditingVehicle(true)}
        disabled={!vehicle}
        accessibilityRole="button"
        accessibilityLabel="עריכת הרכב"
        style={styles.vehicleRow}
      >
        <Text style={styles.vehicleLabel}>רכב</Text>
        <Text style={styles.vehicleValue} numberOfLines={1}>
          {vehicle ? (vehicleLineHe(vehicle) ?? "לא הוספתם רכב") : "…"}
        </Text>
        <Text style={styles.linkText}>{vehicle && vehicleLineHe(vehicle) ? "שינוי" : "הוספה"}</Text>
      </Pressable>
      <View style={{ height: PROFILE_FOOT_H, justifyContent: "center" }}>
        <ProSignOut />
      </View>
      {editingVehicle && vehicle ? (
        <ProVehicleEditor current={vehicle} onDone={() => setEditingVehicle(false)} width={width} height={height} />
      ) : null}
    </View>
  );
}

const PROFILE_HEAD_H = 76;
const PROFILE_VEHICLE_H = 48;
const PROFILE_FOOT_H = 52;

/** The car's two questions over the profile tab: saved to the server, or left as they were. */
function ProVehicleEditor({ current, onDone, width, height }: Size & { current: { vehicleHe: string | null; plateTail: string | null }; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<VehicleDraft>({ vehicleHe: current.vehicleHe ?? "", plateTail: current.plateTail ?? "" });
  const [busy, setBusy] = useState(false);
  const [problemHe, setProblemHe] = useState<string | null>(null);
  const problems = vehicleProblemsHe(draft);
  const ok = !problems.vehicleHe && !problems.plateTail && !busy;
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    setProblemHe(null);
    try {
      queryClient.setQueryData(applicationKey, await api.proSetVehicle(vehicleInput(draft)));
      onDone();
    } catch (e) {
      setProblemHe(!navigator.onLine ? "אין חיבור לאינטרנט. נסו שוב כשהחיבור יחזור." : e instanceof ApiError ? "הפרטים לא נשמרו. בדקו אותם ונסו שוב." : "משהו לא נשמר. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.sheet, { width, height }]} accessibilityViewIsModal>
      <Text accessibilityRole="header" style={styles.profileTitle}>
        הרכב שלכם
      </Text>
      <Text style={styles.sheetSoft}>כך הלקוח מזהה אתכם כשאתם מגיעים: הדגם והצבע, ו־2 או 3 הספרות האחרונות של מספר הרכב.</Text>
      <VehicleFields draft={draft} onChange={setDraft} />
      {problemHe ? <Text accessibilityRole="alert" style={[styles.sheetSoft, styles.problem]}>{problemHe}</Text> : null}
      <PrimaryAction labelHe={busy ? "שומרים…" : "שמירה"} disabled={!ok} onPress={() => void save()} />
      <Pressable onPress={onDone} accessibilityRole="button" style={styles.sheetCancel}>
        <Text style={styles.linkText}>ביטול</Text>
      </Pressable>
    </View>
  );
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
  profileScreen: { backgroundColor: colors.bg },
  vehicleRow: { height: PROFILE_VEHICLE_H, flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  vehicleLabel: { ...t.metaStrong, color: colors.textSecondary, writingDirection: "rtl" },
  vehicleValue: { ...t.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", flex: 1, minWidth: 0 },
  sheet: { position: "absolute", top: 0, left: 0, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md, zIndex: 20 },
  sheetSoft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  sheetCancel: { alignSelf: "center", padding: spacing.sm },
  profileHead: { height: PROFILE_HEAD_H, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  profileTitle: { ...t.h3, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", flexShrink: 1 },
  editButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.action },
  editText: { ...t.metaStrong, color: colors.onAction },
  linkText: { ...t.metaStrong, color: colors.actionText, writingDirection: "rtl" },
  frame: { marginHorizontal: spacing.lg, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(247,243,250,0.18)" },
});
