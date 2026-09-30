import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import { catalogMatchRules, databaseCodeForPilotService, matchServicesByText, type ProApplicationView } from "@pro-now/types";
import { PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../../api";
import { useFrame } from "../../frame";
import { compressImage } from "../../media";
import { pickFile } from "../../pickFile";
import { tradeCharacterFor } from "../../tradeCharacter";
import { ErrorScreen, LoadingScreen } from "../../states";
import { ProSignOut } from "./ProSignOut";

/**
 * JOINING AS A PROFESSIONAL (docs/21 W7), in the demo's order and words
 * (ProOnboardingBody, Amit 2026-09-29): details · what you do · area ·
 * documents · prices · your photo · send. Work arrives only after PRO NOW
 * approves.
 *
 * Everything that decides the outcome is the server's: which services are
 * open, which documents each one requires, what is still missing. The
 * screen keeps only what is being typed; every step saves, and the next
 * one is drawn from the server's answer.
 *
 * Deferred, as the demo itself allows: the shop's design (the one thing
 * Amit's rule lets a professional skip). The photo is required (Amit,
 * 2026-09-30). Services beyond our list: later.
 */
export const applicationKey = ["pro-application"] as const;

const STEPS = ["פרטים", "מה אתם עושים", "אזור", "מסמכים", "מחירים", "התמונה שלכם", "שליחה"] as const;
const RADII_KM = [5, 10, 15, 25, 40];
const ACCOUNT_DOCS: Array<{ kind: "GOVERNMENT_ID" | "SELFIE" | "TAX_FILE"; labelHe: string; noteHe: string }> = [
  { kind: "GOVERNMENT_ID", labelHe: "תעודת זהות", noteHe: "צילום ברור של שני הצדדים, או של הרישיון" },
  { kind: "SELFIE", labelHe: "תמונת פנים", noteHe: "כדי לוודא שמי שמגיע הוא מי שנרשם" },
  { kind: "TAX_FILE", labelHe: "תיק עוסק", noteHe: "אישור עוסק פטור/מורשה או חברה" },
];
const PRICE_FIELDS: Record<string, Array<{ key: "basePriceMinorUnits" | "minimumBillableMinutes" | "perKmMinorUnits"; labelHe: string; minutes?: boolean }>> = {
  VISIT_QUOTE: [{ key: "basePriceMinorUnits", labelHe: "דמי ביקור ואבחון (₪)" }],
  FIXED: [{ key: "basePriceMinorUnits", labelHe: "מחיר לעבודה (₪)" }],
  HOURLY: [
    { key: "basePriceMinorUnits", labelHe: "מחיר לשעה (₪)" },
    { key: "minimumBillableMinutes", labelHe: "מינימום לחיוב (דקות)", minutes: true },
  ],
  DISTANCE_TIME: [
    { key: "basePriceMinorUnits", labelHe: "מחיר בסיס (₪)" },
    { key: "perKmMinorUnits", labelHe: "לכל ק״מ (₪)" },
  ],
};
/** The requirement codes, in the words a professional reads. */
const REQUIREMENT_HE: Record<string, string> = {
  LICENSE: "רישיון",
  CERTIFICATE: "תעודה מקצועית",
  INSURANCE: "ביטוח",
};

function missingHe(code: string, view: ProApplicationView): string {
  const [kind, a, b] = code.split(":");
  const svc = (c?: string) => view.services.find((s) => s.code === c)?.nameHe ?? c ?? "";
  switch (kind) {
    case "ADDRESS_AS": return "איך לפנות אליכם";
    case "SERVICES": return "לפחות שירות אחד";
    case "AREA": return "אזור עבודה";
    case "DOCUMENT": return ACCOUNT_DOCS.find((d) => d.kind === a)?.labelHe ?? "מסמך";
    case "PRICE": return `מחיר ל${svc(a)}`;
    case "PORTRAIT": return "תמונה או דמות";
    case "CREDENTIAL": return `${REQUIREMENT_HE[(b ?? "").split(":")[0] ?? ""] ?? "מסמך"} ל${svc(a)}`;
    default: return code;
  }
}

/** Uploads a document through the same private storage path as W4. */
async function uploadDocument(file: File, asPhoto: boolean): Promise<string> {
  if (asPhoto) {
    const blob = await compressImage(file);
    return (await api.uploadMedia({ kind: "PHOTO", mime: "image/jpeg", body: blob })).upload.id;
  }
  const mime = file.type || "application/pdf";
  return (await api.uploadMedia({ kind: "DOCUMENT", mime, body: file })).upload.id;
}

export function ProJoin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);

  // 404 before joining is an answer ("not yet"), not an error.
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
  });
  const openServices = useQuery({ queryKey: ["pro-open-services"], queryFn: api.proOpenServices, enabled: Boolean(application.data) });

  const view = application.data ?? null;
  const save = async (fn: () => Promise<ProApplicationView | unknown>, next?: number) => {
    if (busy) return;
    setBusy(true);
    setErrorHe(null);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "profile" in result) queryClient.setQueryData(applicationKey, result);
      else await queryClient.invalidateQueries({ queryKey: applicationKey });
      if (next !== undefined) setStep(next);
    } catch (e) {
      setErrorHe(e instanceof ApiError ? e.message : "משהו לא נשמר. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (application.isPending) return <LoadingScreen />;
  if (application.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void application.refetch()} />;

  const stepBody = (() => {
    switch (step) {
      case 0: return <Details view={view} busy={busy} onSave={(d) => save(() => api.proJoin(d), 1)} />;
      case 1: return view ? <Services view={view} open={openServices.data?.services ?? null} busy={busy} onSave={(ids) => save(() => api.proSetServices(ids), 2)} /> : null;
      case 2: return view ? <Area view={view} busy={busy} onSave={(a) => save(() => api.proSetArea(a), 3)} /> : null;
      case 3: return view ? <Documents view={view} busy={busy} save={save} onNext={() => setStep(4)} /> : null;
      case 4: return view ? <Prices view={view} busy={busy} save={save} onNext={() => setStep(5)} /> : null;
      case 5: return view ? <Portrait view={view} busy={busy} save={save} onNext={() => setStep(6)} /> : null;
      default:
        return view ? (
          <Send
            view={view}
            busy={busy}
            onSubmit={() => save(async () => {
              const sent = await api.proSubmitApplication();
              navigate("/pro", { replace: true });
              return sent;
            })}
            onGoTo={setStep}
          />
        ) : null;
    }
  })();

  return (
    <View style={[styles.screen, { width, height }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (step === 0 ? navigate("/welcome") : setStep(step - 1))} accessibilityRole="button" accessibilityLabel="חזרה">
          <Text style={styles.back}>›</Text>
        </Pressable>
        <Text style={styles.stepOf}>{`שלב ${step + 1} מתוך ${STEPS.length} · ${STEPS[step]}`}</Text>
      </View>
      <View style={styles.progress}>
        {STEPS.map((s, i) => <View key={s} style={[styles.progressDot, i <= step && styles.progressOn]} />)}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {stepBody}
        {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
        {step === 0 ? <ProSignOut /> : null}
      </ScrollView>
    </View>
  );
}

function Details({ view, busy, onSave }: { view: ProApplicationView | null; busy: boolean; onSave: (d: { displayName: string; legalName: string; addressAs: "M" | "F" }) => void }) {
  const [displayName, setDisplayName] = useState(view?.profile.displayName ?? "");
  const [legalName, setLegalName] = useState(view?.profile.legalName ?? "");
  const [addressAs, setAddressAs] = useState<"M" | "F" | null>((view?.profile.addressAs as "M" | "F" | null) ?? null);
  const ok = displayName.trim().length > 0 && legalName.trim().length > 1 && addressAs;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>ברוכים הבאים ל־PRO NOW</Text>
      <Text style={styles.soft}>עבודה מגיעה רק אחרי ש־PRO NOW מאשרת את הפרטים, המסמכים וכל שירות בנפרד. זה לוקח כמה דקות.</Text>
      <Field label="השם שהלקוחות יראו" value={displayName} onChange={setDisplayName} max={40} />
      <Field label="שם מלא כפי שבתעודה" value={legalName} onChange={setLegalName} max={80} />
      <Text style={styles.label}>איך לפנות אליכם?</Text>
      <View style={styles.row}>
        {([["M", "בלשון זכר"], ["F", "בלשון נקבה"]] as const).map(([k, he]) => (
          <Chip key={k} labelHe={he} on={addressAs === k} onPress={() => setAddressAs(k)} />
        ))}
      </View>
      <PrimaryAction labelHe="המשך" disabled={!ok || busy} onPress={() => ok && onSave({ displayName: displayName.trim(), legalName: legalName.trim(), addressAs })} />
    </View>
  );
}

function Services({ view, open, busy, onSave }: { view: ProApplicationView; open: Array<{ id: string; code: string; nameHe: string }> | null; busy: boolean; onSave: (ids: string[]) => void }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set(view.services.map((s) => s.serviceId)));
  // The customer's matcher, reading a professional's own words (as in the demo).
  const suggested = useMemo(() => {
    if (!open || text.trim().length < 2) return new Set<string>();
    const codes = new Set(matchServicesByText(text, catalogMatchRules).map((m) => databaseCodeForPilotService(m.serviceId).databaseCode));
    return new Set(open.filter((s) => codes.has(s.code)).map((s) => s.id));
  }, [text, open]);
  if (!open) return <LoadingScreen />;
  const toggle = (id: string) => setChosen((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ordered = [...open].sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)));
  return (
    <View style={styles.section}>
      <Text style={styles.title}>מה אתם עושים?</Text>
      <Text style={styles.soft}>כתבו במילים שלכם, ונסמן את השירותים שמתאימים. כל שירות נבדק ומאושר בנפרד.</Text>
      <Field label="במילים שלכם" value={text} onChange={setText} max={200} placeholder="למשל: אינסטלטור, פותח סתימות ומחליף ברזים" />
      {ordered.map((s) => (
        <Pressable key={s.id} onPress={() => toggle(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: chosen.has(s.id) }} accessibilityLabel={s.nameHe} style={styles.listRow}>
          <View style={[styles.check, chosen.has(s.id) && styles.checkOn]} />
          <Text style={styles.listText}>{s.nameHe}</Text>
          {suggested.has(s.id) ? <Text style={styles.tag}>מתאים למה שכתבתם</Text> : null}
        </Pressable>
      ))}
      <PrimaryAction labelHe={`המשך · ${chosen.size} שירותים`} disabled={chosen.size === 0 || busy} onPress={() => onSave([...chosen])} />
    </View>
  );
}

function Area({ view, busy, onSave }: { view: ProApplicationView; busy: boolean; onSave: (a: { lat: number; lng: number; radiusKm: number }) => void }) {
  const [radiusKm, setRadiusKm] = useState(view.area?.radiusKm ?? 10);
  const [home, setHome] = useState<{ lat: number; lng: number } | null>(view.area ? { lat: view.area.lat, lng: view.area.lng } : null);
  const [locating, setLocating] = useState(false);
  const [problemHe, setProblemHe] = useState<string | null>(null);
  const locate = () => {
    setLocating(true);
    setProblemHe(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setHome({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => { setProblemHe("לא קיבלנו מיקום. אפשר לאשר גישה למיקום בהגדרות הדפדפן ולנסות שוב."); setLocating(false); },
      { enableHighAccuracy: false, timeout: 15_000 }
    );
  };
  return (
    <View style={styles.section}>
      <Text style={styles.title}>אזור העבודה</Text>
      <Text style={styles.soft}>הבית ורדיוס הם ברירת המחדל. כשתהיו מחוברים, הקריאות יגיעו לפי המיקום שלכם באותו רגע.</Text>
      <PrimaryAction labelHe={home ? "המיקום נשמר · לעדכן" : locating ? "מאתרים…" : "המיקום שלי עכשיו הוא הבית"} disabled={locating} onPress={locate} />
      {problemHe ? <Text style={styles.error}>{problemHe}</Text> : null}
      <Text style={styles.label}>רדיוס</Text>
      <View style={styles.row}>
        {RADII_KM.map((r) => <Chip key={r} labelHe={`${r} ק״מ`} on={radiusKm === r} onPress={() => setRadiusKm(r)} />)}
      </View>
      <PrimaryAction labelHe="המשך" disabled={!home || busy} onPress={() => home && onSave({ ...home, radiusKm })} />
    </View>
  );
}

function Documents({ view, busy, save, onNext }: { view: ProApplicationView; busy: boolean; save: (fn: () => Promise<unknown>) => Promise<void>; onNext: () => void }) {
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const has = (kind: string) => view.documents.some((d) => d.kind === kind && d.status !== "REJECTED");
  const credentialRows = view.services.flatMap((s) => s.requirements.map((r) => ({ service: s, r })));
  const accountMissing = view.missing.filter((m) => m.startsWith("DOCUMENT:") || m.startsWith("CREDENTIAL:"));
  return (
    <View style={styles.section}>
      <Text style={styles.title}>מסמכים</Text>
      <Text style={styles.soft}>מה שהחוק דורש לכל מקצוע, ומה ש־PRO NOW מבקשת מכולם. לא נבקש תעודת יושר — אסור לדרוש אותה.</Text>
      {ACCOUNT_DOCS.map((d) => (
        <View key={d.kind} style={styles.docRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listText}>{d.labelHe}</Text>
            <Text style={styles.note}>{has(d.kind) ? "✓ הועלה" : d.noteHe}</Text>
          </View>
          <Chip
            labelHe={has(d.kind) ? "להחליף" : "העלאה"}
            on={false}
            onPress={() => void (async () => {
              const file = await pickFile(d.kind === "SELFIE" ? "image/*" : "image/*,application/pdf", d.kind === "SELFIE" ? "user" : undefined);
              if (file) await save(async () => api.proAddDocument({ kind: d.kind, uploadId: await uploadDocument(file, d.kind === "SELFIE") }));
            })()}
          />
        </View>
      ))}
      {credentialRows.map(({ service, r }) => {
        const key = `${service.serviceId}:${r.requirement}`;
        const label = `${REQUIREMENT_HE[r.requirement.split(":")[0] ?? ""] ?? "מסמך"} · ${service.nameHe}`;
        return (
          <View key={key} style={styles.docRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listText}>{label}{r.mandatory ? "" : " (מומלץ)"}</Text>
              <TextInput
                value={numbers[key] ?? r.credential?.number ?? ""}
                onChangeText={(v) => setNumbers((n) => ({ ...n, [key]: v }))}
                placeholder="מספר רישיון"
                accessibilityLabel={`מספר · ${label}`}
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                maxLength={40}
              />
              <Text style={styles.note}>{r.credential ? "✓ הועלה · ממתין לבדיקה" : "צילום או PDF של המסמך"}</Text>
            </View>
            <Chip
              labelHe={r.credential ? "להחליף" : "העלאה"}
              on={false}
              onPress={() => void (async () => {
                const file = await pickFile("image/*,application/pdf");
                if (file) {
                  await save(async () =>
                    api.proAddCredential({
                      serviceId: service.serviceId,
                      requirement: r.requirement,
                      number: (numbers[key] ?? "").trim() || undefined,
                      uploadId: await uploadDocument(file, false),
                    })
                  );
                }
              })()}
            />
          </View>
        );
      })}
      <PrimaryAction labelHe={accountMissing.length ? `עוד ${accountMissing.length} חסרים · אפשר להמשיך ולחזור` : "המשך"} disabled={busy} onPress={onNext} />
    </View>
  );
}

function Prices({ view, busy, save, onNext }: { view: ProApplicationView; busy: boolean; save: (fn: () => Promise<unknown>) => Promise<void>; onNext: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const saveAll = async () => {
    for (const s of view.services) {
      const fields = PRICE_FIELDS[s.priceModel] ?? [];
      const body: Record<string, number> = {};
      for (const f of fields) {
        const raw = values[`${s.serviceId}:${f.key}`];
        if (raw === undefined || raw.trim() === "") continue;
        const n = Number(raw.replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(n)) continue;
        body[f.key] = f.minutes ? Math.round(n) : Math.round(n * 100);
      }
      if (Object.keys(body).length > 0) await save(() => api.proSetPricing(s.serviceId, body));
    }
    onNext();
  };
  return (
    <View style={styles.section}>
      <Text style={styles.title}>המחירים שלכם</Text>
      <Text style={styles.soft}>כל מקצוען קובע את המחירים שלו. הלקוח רואה אותם לפני שהוא מאשר, ואין עליהם מינימום או מקסימום.</Text>
      {view.services.map((s) => (
        <View key={s.serviceId} style={styles.priceBlock}>
          <Text style={styles.listText}>{s.nameHe}{s.priced ? " · ✓" : ""}</Text>
          {(PRICE_FIELDS[s.priceModel] ?? []).map((f) => (
            <Field
              key={f.key}
              label={f.labelHe}
              value={values[`${s.serviceId}:${f.key}`] ?? ""}
              onChange={(v) => setValues((c) => ({ ...c, [`${s.serviceId}:${f.key}`]: v }))}
              max={8}
              numeric
            />
          ))}
        </View>
      ))}
      <PrimaryAction labelHe="שמירה והמשך" disabled={busy} onPress={() => void saveAll()} />
    </View>
  );
}

/**
 * Their own photo, or their trade's drawn character (the demo's step 6).
 * Required: "המשך" waits for one of the two. The photo stays with the
 * application for the admin; customers do not see it yet.
 */
function Portrait({ view, busy, save, onNext }: { view: ProApplicationView; busy: boolean; save: (fn: () => Promise<unknown>) => Promise<void>; onNext: () => void }) {
  const chosen = view.profile.portrait?.kind ?? null;
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const character = tradeCharacterFor(view.services[0]?.code);
  const takePhoto = async () => {
    const file = await pickFile("image/*", "user");
    if (!file) return;
    await save(async () => {
      const blob = await compressImage(file);
      const uploadId = (await api.uploadMedia({ kind: "PHOTO", mime: "image/jpeg", body: blob })).upload.id;
      const next = await api.proSetPortrait({ kind: "PHOTO", uploadId });
      setPreview(URL.createObjectURL(blob));
      return next;
    });
  };
  return (
    <View style={styles.section}>
      <Text style={styles.title}>התמונה שלכם</Text>
      <Text style={styles.soft}>לקוחות סומכים על מי שהם רואים. תמונה אמיתית — או הדמות של המקצוע שלכם מהעיר.</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => void takePhoto()}
          disabled={busy}
          accessibilityRole="radio"
          accessibilityState={{ checked: chosen === "PHOTO" }}
          accessibilityLabel="סלפי או תמונה"
          style={[styles.portraitOption, chosen === "PHOTO" && styles.portraitOn]}
        >
          {preview ? <Image source={{ uri: preview }} style={styles.portraitImage} /> : <Text style={styles.portraitPlus}>{chosen === "PHOTO" ? "✓" : "+"}</Text>}
          <Text style={styles.portraitLabel}>{chosen === "PHOTO" ? "התמונה שלכם ✓" : "סלפי או תמונה"}</Text>
          {chosen === "PHOTO" ? <Text style={styles.portraitNote}>לחצו כדי להחליף</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => void save(() => api.proSetPortrait({ kind: "CHARACTER" }))}
          disabled={busy}
          accessibilityRole="radio"
          accessibilityState={{ checked: chosen === "CHARACTER" }}
          accessibilityLabel="הדמות של המקצוע"
          style={[styles.portraitOption, chosen === "CHARACTER" && styles.portraitOn]}
        >
          <Image source={{ uri: character }} style={styles.portraitImage} resizeMode="contain" />
          <Text style={styles.portraitLabel}>{chosen === "CHARACTER" ? "הדמות ✓" : "הדמות"}</Text>
          <Text style={styles.portraitNote}>במקום תמונה</Text>
        </Pressable>
      </View>
      <PrimaryAction labelHe={chosen ? "המשך" : "בחרו תמונה או דמות"} disabled={busy || !chosen} onPress={onNext} />
    </View>
  );
}

function Send({ view, busy, onSubmit, onGoTo }: { view: ProApplicationView; busy: boolean; onSubmit: () => void; onGoTo: (step: number) => void }) {
  const stepOf = (code: string) =>
    code === "ADDRESS_AS" ? 0 : code === "SERVICES" ? 1 : code === "AREA" ? 2 : code.startsWith("PRICE") ? 4 : code === "PORTRAIT" ? 5 : 3;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>שליחה לאישור</Text>
      {view.missing.length === 0 ? (
        <Text style={styles.soft}>הכול כאן. אחרי השליחה נבדוק את הפרטים, את המסמכים ואת כל שירות בנפרד, ונעדכן כאן.</Text>
      ) : (
        <>
          <Text style={styles.soft}>לפני שאפשר לשלוח, חסרים:</Text>
          {view.missing.map((m) => (
            <Pressable key={m} onPress={() => onGoTo(stepOf(m))} accessibilityRole="button" style={styles.listRow}>
              <Text style={styles.listText}>{missingHe(m, view)}</Text>
              <Text style={styles.tag}>להשלמה ›</Text>
            </Pressable>
          ))}
        </>
      )}
      <PrimaryAction labelHe="שליחה לאישור" disabled={busy || view.missing.length > 0} onPress={onSubmit} />
    </View>
  );
}

function Field({ label, value, onChange, max, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        maxLength={max}
        inputMode={numeric ? "decimal" : "text"}
      />
    </View>
  );
}

function Chip({ labelHe, on, onPress }: { labelHe: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{labelHe}</Text>
    </Pressable>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  back: { color: colors.textPrimary, fontSize: 28, paddingHorizontal: spacing.sm },
  stepOf: { ...t.meta, color: colors.textSecondary, writingDirection: "rtl" },
  progress: { flexDirection: "row-reverse", gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceElevated },
  progressOn: { backgroundColor: colors.action },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  section: { gap: spacing.md },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  label: { ...t.metaStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  note: { ...t.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  input: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  row: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.textSecondary },
  chipOn: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { ...t.body, color: colors.textPrimary, writingDirection: "rtl" },
  chipTextOn: { color: colors.bg },
  listRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  listText: { ...t.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", flexShrink: 1 },
  tag: { ...t.meta, color: colors.actionText, writingDirection: "rtl" },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.textSecondary },
  checkOn: { backgroundColor: colors.action, borderColor: colors.action },
  docRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm },
  priceBlock: { gap: spacing.sm, paddingVertical: spacing.sm },
  portraitOption: {
    flex: 1,
    minWidth: 140,
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.surfaceElevated,
    backgroundColor: colors.surfaceElevated,
  },
  portraitOn: { borderColor: colors.action },
  portraitImage: { width: 110, height: 110, borderRadius: 55 },
  portraitPlus: { ...t.h2, color: colors.textPrimary },
  portraitLabel: { ...t.bodyStrong, color: colors.textPrimary, textAlign: "center", writingDirection: "rtl" },
  portraitNote: { ...t.meta, color: colors.textSecondary, textAlign: "center", writingDirection: "rtl" },
  error: { ...t.body, color: colors.statusDanger, textAlign: "right", writingDirection: "rtl" },
});
