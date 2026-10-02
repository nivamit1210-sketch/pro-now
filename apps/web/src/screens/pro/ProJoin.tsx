import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import {
  catalogMatchRules,
  databaseCodeForPilotService,
  documentConditionHe,
  documentInfoFor,
  matchServicesByText,
  pilotServiceIdForDatabaseCode,
  type ProApplicationView,
} from "@pro-now/types";
import { IntroBody, PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api, useMe } from "../../api";
import { useFrame } from "../../frame";
import { compressImage } from "../../media";
import { pickFile } from "../../pickFile";
import { brandColorFromFile } from "../../art/brandColor";
import { IntroBackdrop } from "../../art/IntroBackdrop";
import { worldSources } from "../../art/worldSources";
import { tradeCharacterFor, tradeShopFor } from "../../tradeCharacter";
import { IdentityCheck } from "../../identity/IdentityCheck";
import { ErrorScreen, LoadingScreen } from "../../states";
import { APPROVAL_STEPS_HE, formatDateOfBirthHe, parseDateOfBirthHe } from "./approval";
import { ProSignOut } from "./ProSignOut";
import { ACCOUNT_DOCS } from "./proPages";

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

const STEPS = ["פרטים", "מה אתם עושים", "אזור", "מסמכים", "מחירים", "החנות שלכם", "התמונה שלכם", "סיכום ושליחה"] as const;
const SHOP_STEP = 5;
const DOCUMENTS_STEP = 3;
const RADII_KM = [5, 10, 15, 25, 40];
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
/** A service requirement in the professional's words (D4: the research's list, service-documents.ts). */
function requirementHe(requirement: string): string {
  return documentInfoFor(requirement)?.nameHe ?? "מסמך";
}

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
    case "TAX_STATUS": return "איך אתם רשומים במס";
    case "CREDENTIAL": return `${requirementHe(b ?? "")} ל${svc(a)}`;
    case "IDENTITY": return "בדיקת זהות";
    case "DATE_OF_BIRTH": return "תאריך לידה";
    default: return code;
  }
}

/** Uploads a document through the same private storage path as W4. */
async function uploadDocument(file: File): Promise<string> {
  const mime = file.type || "application/pdf";
  return (await api.uploadMedia({ kind: "DOCUMENT", mime, body: file })).upload.id;
}

const PRO_INTRO_KEY = "pn.proIntroSeen";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function ProJoin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { width, height } = useFrame();
  // Coming back to edit a sent application opens at the summary, as in the demo.
  const [params] = useSearchParams();
  const at = params.get("at");
  // at=details (or nothing) opens the details step, where the date of birth is.
  const [step, setStep] = useState(at === "summary" ? STEPS.length - 1 : at === "shop" ? SHOP_STEP : at === "documents" ? DOCUMENTS_STEP : 0);
  /*
   * The four explanation slides, then the welcome — once, for someone who has
   * not started joining (the demo's order, docs/DEMO-SYNC.md, 2026-10-01 P1).
   * Remembered on this device for this person: whoever skips or finishes
   * them is not shown them again here, and the next person on the same
   * device still is.
   */
  const me = useMe();
  const introKey = me.data ? `${PRO_INTRO_KEY}.${me.data.user.id}` : null;
  const [introDone, setIntroDone] = useState(false);
  const introSeen = introDone || (introKey !== null && readFlag(introKey));
  const [introSlide, setIntroSlide] = useState(0);
  // The welcome, once, for someone who has not started joining.
  const [welcomed, setWelcomed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);
  // The server's age rule (docs/10), said under the date of birth rather than as a generic error.
  const [underAge, setUnderAge] = useState(false);

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
    setUnderAge(false);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "profile" in result) queryClient.setQueryData(applicationKey, result);
      else await queryClient.invalidateQueries({ queryKey: applicationKey });
      if (next !== undefined) setStep(next);
    } catch (e) {
      if (e instanceof ApiError && e.code === "UNDER_MINIMUM_AGE") setUnderAge(true);
      else setErrorHe(e instanceof ApiError ? e.message : "משהו לא נשמר. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (application.isPending) return <LoadingScreen />;
  if (application.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void application.refetch()} />;
  if (me.isPending) return <LoadingScreen />;
  if (!application.data && !introSeen) {
    return (
      <IntroBody
        side="PRO"
        background={<IntroBackdrop side="pro" slide={introSlide} />}
        onSlide={setIntroSlide}
        sources={worldSources}
        onDone={() => {
          try {
            if (introKey) localStorage.setItem(introKey, "1");
          } catch {
            /* private mode: shown again next time, nothing lost */
          }
          setIntroDone(true);
        }}
        width={width}
        height={height}
      />
    );
  }
  if (!application.data && !welcomed) return <Welcome width={width} height={height} onStart={() => setWelcomed(true)} onBack={() => navigate("/welcome")} />;

  const stepBody = (() => {
    switch (step) {
      case 0:
        return (
          <Details
            view={view}
            busy={busy}
            underAge={underAge}
            onSave={({ business, ...details }) => save(async () => {
              await api.proJoin(details);
              return api.proSetBusiness(business);
            }, 1)}
          />
        );
      case 1: return view ? <Services view={view} open={openServices.data?.services ?? null} busy={busy} onSave={(ids) => save(() => api.proSetServices(ids), 2)} /> : null;
      case 2: return view ? <Area view={view} busy={busy} onSave={(a) => save(() => api.proSetArea(a), 3)} /> : null;
      case 3: return view ? <Documents view={view} busy={busy} save={save} onNext={() => setStep(4)} /> : null;
      case 4: return view ? <Prices view={view} busy={busy} save={save} onNext={() => setStep(5)} /> : null;
      case 5:
        // From their page ("לעצב את החנות"), done means back to it, as in the demo.
        return view ? <Shop view={view} busy={busy} save={save} onNext={() => (at === "shop" && view.submitted ? navigate("/pro") : setStep(6))} /> : null;
      case 6: return view ? <Portrait view={view} busy={busy} save={save} onNext={() => setStep(7)} /> : null;
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

type TaxStatus = "EXEMPT" | "LICENSED" | "COMPANY";
const TAX_STATUS_HE: ReadonlyArray<readonly [TaxStatus, string]> = [
  ["EXEMPT", "עוסק פטור"],
  ["LICENSED", "עוסק מורשה"],
  ["COMPANY", "חברה בע״מ"],
];

function Details({
  view,
  busy,
  underAge,
  onSave,
}: {
  view: ProApplicationView | null;
  busy: boolean;
  underAge: boolean;
  onSave: (d: { displayName: string; legalName: string; addressAs: "M" | "F"; dateOfBirth: string; business: { tradingName: string | null; taxStatus: TaxStatus } }) => void;
}) {
  const [displayName, setDisplayName] = useState(view?.profile.displayName ?? "");
  const [legalName, setLegalName] = useState(view?.profile.legalName ?? "");
  const [addressAs, setAddressAs] = useState<"M" | "F" | null>((view?.profile.addressAs as "M" | "F" | null) ?? null);
  // The demo's step 2 (Amit, 2026-09-30): a business name if they have one, and how they are registered for tax.
  const [tradingName, setTradingName] = useState(view?.profile.business?.tradingName ?? "");
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(view?.profile.business?.taxStatus ?? null);
  // Asked here because the identity check needs it; the reviewer compares it with the ID card (docs/10).
  const [birthText, setBirthText] = useState(formatDateOfBirthHe(view?.profile.dateOfBirth));
  const dateOfBirth = parseDateOfBirthHe(birthText);
  const ok = displayName.trim().length > 0 && legalName.trim().length > 1 && addressAs && taxStatus && dateOfBirth;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>ברוכים הבאים ל־PRO NOW</Text>
      <Text style={styles.soft}>עבודה מגיעה רק אחרי ש־PRO NOW מאשרת את הפרטים, המסמכים וכל שירות בנפרד. זה לוקח כמה דקות.</Text>
      <Field label="השם שהלקוחות יראו" value={displayName} onChange={setDisplayName} max={40} />
      <Field label="שם מלא כפי שבתעודה" value={legalName} onChange={setLegalName} max={80} />
      <View style={{ gap: 4 }}>
        <Text style={styles.label}>תאריך לידה</Text>
        <TextInput
          value={birthText}
          onChangeText={setBirthText}
          accessibilityLabel="תאריך לידה"
          placeholder="יום/חודש/שנה"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          maxLength={10}
          inputMode="numeric"
        />
        {underAge ? (
          <Text accessibilityRole="alert" style={styles.error}>ההצטרפות לבעלי מקצוע מגיל 18.</Text>
        ) : birthText.trim().length >= 8 && !dateOfBirth ? (
          <Text style={styles.note}>למשל 14/05/1990</Text>
        ) : null}
      </View>
      <Text style={styles.label}>איך לפנות אליכם?</Text>
      <View style={styles.row}>
        {([["M", "בלשון זכר"], ["F", "בלשון נקבה"]] as const).map(([k, he]) => (
          <Chip key={k} labelHe={he} on={addressAs === k} onPress={() => setAddressAs(k)} />
        ))}
      </View>
      <Field label="שם העסק (לא חובה)" value={tradingName} onChange={setTradingName} max={40} placeholder="למשל: יוסי אינסטלציה" />
      <Text style={styles.label}>איך אתם רשומים במס?</Text>
      <View style={styles.row}>
        {TAX_STATUS_HE.map(([k, he]) => (
          <Chip key={k} labelHe={he} on={taxStatus === k} onPress={() => setTaxStatus(k)} />
        ))}
      </View>
      <PrimaryAction
        labelHe="המשך"
        disabled={!ok || busy}
        onPress={() =>
          ok &&
          onSave({
            displayName: displayName.trim(),
            legalName: legalName.trim(),
            addressAs,
            dateOfBirth,
            business: { tradingName: tradingName.trim() || null, taxStatus },
          })
        }
      />
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
      {/* Nothing understood is said, not left as a list that did not move (the demo, a2bc4a5). */}
      {text.trim().length >= 2 && suggested.size === 0 ? (
        <Text style={styles.note}>לא זיהינו שירות מהמילים האלה. בחרו מהרשימה למטה, או נסו לכתוב אחרת — למשל ״חשמלאי״ או ״מספרת כלבים״.</Text>
      ) : null}
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
  const queryClient = useQueryClient();
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const has = (kind: string) => view.documents.some((d) => d.kind === kind && d.status !== "REJECTED");
  const credentialRows = view.services.flatMap((s) => s.requirements.map((r) => ({ service: s, r })));
  const accountMissing = view.missing.filter((m) => m === "IDENTITY" || m.startsWith("DOCUMENT:") || m.startsWith("CREDENTIAL:"));
  return (
    <View style={styles.section}>
      <Text style={styles.title}>מסמכים</Text>
      <Text style={styles.soft}>מה שהחוק דורש לכל מקצוע, ומה ש־PRO NOW מבקשת מכולם. לא נבקש תעודת יושר — אסור לדרוש אותה.</Text>
      <IdentityCheck legalNameHe={view.profile.legalName} current={view.identity} onSubmitted={(v) => queryClient.setQueryData(applicationKey, v)} />
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
              const file = await pickFile("image/*,application/pdf");
              if (file) await save(async () => api.proAddDocument({ kind: d.kind, uploadId: await uploadDocument(file) }));
            })()}
          />
        </View>
      ))}
      {credentialRows.map(({ service, r }) => {
        const key = `${service.serviceId}:${r.requirement}`;
        const info = documentInfoFor(r.requirement);
        const pilotId = pilotServiceIdForDatabaseCode(service.code);
        const whenHe = pilotId ? documentConditionHe(pilotId, r.requirement) : null;
        const label = `${requirementHe(r.requirement)} · ${service.nameHe}`;
        // Mandatory: the law, always. Otherwise the law in some cases (said when), or recommended.
        const levelHe = r.mandatory ? "" : whenHe ? ` (${whenHe})` : " (מומלץ)";
        return (
          <View key={key} style={styles.docRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listText}>{label}{levelHe}</Text>
              <TextInput
                value={numbers[key] ?? r.credential?.number ?? ""}
                onChangeText={(v) => setNumbers((n) => ({ ...n, [key]: v }))}
                placeholder={info?.numberLabelHe ?? "מספר (אם יש)"}
                accessibilityLabel={`מספר · ${label}`}
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                maxLength={40}
              />
              <Text style={styles.note}>{r.credential ? "✓ הועלה · ממתין לבדיקה" : info?.checkHe ?? "צילום או PDF של המסמך"}</Text>
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
                      uploadId: await uploadDocument(file),
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

const BRAND_SWATCHES = [
  { hex: "#FF5C38", he: "כתום" }, { hex: "#8B5CF6", he: "סגול" }, { hex: "#2FBF8A", he: "ירוק" }, { hex: "#3B82F6", he: "כחול" },
  { hex: "#F59E0B", he: "ענבר" }, { hex: "#EC4899", he: "ורוד" }, { hex: "#14B8A6", he: "טורקיז" }, { hex: "#E5E7EB", he: "לבן" },
] as const;

/**
 * Their shop in our street (the demo's step 5; sync item E): their trade's
 * shopfront with their name in neon, a logo whose colour becomes the brand
 * colour, eight swatches. The one step joining may skip (Amit, 2026-09-30):
 * it then opens with these defaults, to be designed from their page later.
 * Customers see the shop when the street arrives (D2).
 */
function Shop({ view, busy, save, onNext }: { view: ProApplicationView; busy: boolean; save: (fn: () => Promise<unknown>) => Promise<void>; onNext: () => void }) {
  const p = view.profile;
  // Until they type their own, the sign reads the business name, else their name (the demo's rule).
  const [name, setName] = useState(p.shop?.name ?? (p.business?.tradingName || p.displayName).slice(0, 22));
  const [color, setColor] = useState<string>(p.shop?.brandColor ?? BRAND_SWATCHES[0].hex);
  const [logoId, setLogoId] = useState<string | null>(p.shop?.logoUploadId ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  const logoUri = logoPreview ?? (logoId ? `/api/v1/media/${encodeURIComponent(logoId)}` : null);
  const pickLogo = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    await save(async () => {
      const [blob, fromLogo] = await Promise.all([compressImage(file), brandColorFromFile(file)]);
      const id = (await api.uploadMedia({ kind: "PHOTO", mime: "image/jpeg", body: blob })).upload.id;
      setLogoId(id);
      setLogoPreview(URL.createObjectURL(blob));
      if (fromLogo) setColor(fromLogo);
    });
  };
  const ok = name.trim().length > 0;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>החנות שלכם ברחוב</Text>
      <Text style={styles.soft}>ככה לקוחות יכירו אתכם — השם, הצבע והלוגו שלכם.</Text>
      <View style={styles.shopPreview} accessibilityLabel={`השלט: ${name}`}>
        <Image source={{ uri: tradeShopFor(view.services[0]?.code) }} style={styles.facade} resizeMode="contain" />
        <View style={[styles.sign, { borderColor: color }]}>
          {logoUri ? <Image source={{ uri: logoUri }} style={styles.signLogo} /> : null}
          <Text style={[styles.signText, { textShadowColor: color, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } }]} numberOfLines={1}>
            {name.trim() || "השם שלכם"}
          </Text>
        </View>
      </View>
      <Field label="השם על השלט" value={name} onChange={setName} max={22} />
      <Text style={styles.label}>לוגו (לא חובה)</Text>
      <Chip labelHe={logoId ? "✓ הלוגו עלה — להחליף" : "העלאת לוגו · ניקח ממנו את צבע המותג"} on={false} onPress={() => void pickLogo()} />
      <Text style={styles.label}>צבע המותג</Text>
      <View style={styles.row}>
        {BRAND_SWATCHES.map((c) => (
          <Pressable
            key={c.hex}
            onPress={() => setColor(c.hex)}
            accessibilityRole="radio"
            accessibilityState={{ checked: color.toUpperCase() === c.hex }}
            accessibilityLabel={`צבע ${c.he}`}
            style={[styles.swatch, { backgroundColor: c.hex }, color.toUpperCase() === c.hex && styles.swatchOn]}
          />
        ))}
      </View>
      <PrimaryAction
        labelHe="המשך"
        disabled={!ok || busy}
        onPress={() =>
          void save(async () => {
            const saved = await api.proSetShop({ name: name.trim(), brandColor: color, logoUploadId: logoId });
            onNext();
            return saved;
          })
        }
      />
      {/* The only skip in joining (Amit, 2026-09-30). */}
      <Pressable onPress={onNext} accessibilityRole="button" style={styles.skip}>
        <Text style={styles.tag}>דלג — אעצב את החנות אחר כך</Text>
      </Pressable>
    </View>
  );
}

/**
 * Their own photo, or their trade's drawn character (the demo's step 6).
 * Required: "המשך" waits for one of the two. The customer they are sent to
 * sees it (D1, Dvir 2026-09-30), and so does the admin.
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

/** The identity check in the summary: the server's current check, nothing assumed. */
function identityHe(identity: ProApplicationView["identity"]): string {
  const status = identity?.status;
  return status === "VERIFIED" ? "זהות: אושרה" : status === "MANUAL_REVIEW" || status === "PENDING" ? "זהות: בבדיקה" : "זהות: חסרה";
}

const TAX_HE: Record<string, string> = { EXEMPT: "עוסק פטור", LICENSED: "עוסק מורשה", COMPANY: "חברה בע״מ" };

/**
 * The summary before sending (the demo's last step): how a customer will
 * see them, each part with "עריכה" back to its step, what is still missing,
 * and what the review after sending checks.
 */
function Send({ view, busy, onSubmit, onGoTo }: { view: ProApplicationView; busy: boolean; onSubmit: () => void; onGoTo: (step: number) => void }) {
  const stepOf = (code: string) =>
    code === "ADDRESS_AS" || code === "TAX_STATUS" || code === "DATE_OF_BIRTH" ? 0 : code === "SERVICES" ? 1 : code === "AREA" ? 2 : code.startsWith("PRICE") ? 4 : code === "PORTRAIT" ? 6 : 3;
  const p = view.profile;
  const face =
    p.portrait?.kind === "PHOTO" && p.portrait.uploadId
      ? `/api/v1/media/${encodeURIComponent(p.portrait.uploadId)}`
      : p.portrait?.kind === "CHARACTER"
        ? tradeCharacterFor(view.services[0]?.code)
        : null;
  const docsTotal = view.documents.length + view.services.reduce((n, s) => n + s.requirements.filter((r) => r.mandatory).length, 0);
  const docsIn = view.documents.filter((d) => d.status !== "REJECTED").length + view.services.reduce((n, s) => n + s.requirements.filter((r) => r.mandatory && r.credential && r.credential.status !== "REJECTED").length, 0);
  const rows: Array<{ t: string; v: string; to: number }> = [
    { t: "פרטים", v: [p.displayName, p.business ? TAX_HE[p.business.taxStatus] : null].filter(Boolean).join(" · ") || "—", to: 0 },
    { t: "שירותים", v: view.services.length ? view.services.map((s) => s.nameHe).join(" · ") : "—", to: 1 },
    { t: "אזור", v: view.area ? `עד ${view.area.radiusKm} ק״מ מהבית` : "—", to: 2 },
    { t: "מסמכים", v: `${identityHe(view.identity)} · ${docsIn}/${docsTotal} חובה`, to: 3 },
    { t: "מחירים", v: `${view.services.filter((s) => s.priced).length}/${view.services.length} שירותים`, to: 4 },
    { t: "החנות", v: p.shop ? p.shop.name : "עיצוב ברירת מחדל, אפשר אחר כך", to: 5 },
    { t: "התמונה", v: p.portrait?.kind === "PHOTO" ? "תמונה שלכם" : p.portrait?.kind === "CHARACTER" ? "הדמות של המקצוע" : "—", to: 6 },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{view.missing.length === 0 ? "הכול מוכן" : "כמעט שם"}</Text>
      <Text style={styles.soft}>ככה יראה אתכם לקוח:</Text>
      <View style={[styles.card, p.shop && { borderColor: p.shop.brandColor }]} accessibilityLabel="הכרטיס שלקוחות יראו">
        {face ? <Image source={{ uri: face }} style={styles.cardFace} resizeMode="cover" /> : <View style={[styles.cardFace, styles.cardFaceEmpty]} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardName}>{p.displayName || "השם שלכם"}</Text>
          <Text style={styles.note}>{p.shop?.name ?? p.business?.tradingName ? `${p.shop?.name ?? p.business?.tradingName} · ` : ""}חדש ב־PRO NOW</Text>
          <Text style={styles.note} numberOfLines={1}>{view.services.slice(0, 2).map((s) => s.nameHe).join(" · ")}</Text>
        </View>
      </View>

      {rows.map((r) => (
        <Pressable key={r.t} onPress={() => onGoTo(r.to)} accessibilityRole="button" accessibilityLabel={`עריכת ${r.t}`} style={styles.sumRow}>
          <Text style={styles.sumLabel}>{r.t}</Text>
          <Text style={styles.sumValue} numberOfLines={1}>{r.v}</Text>
          <Text style={styles.tag}>עריכה</Text>
        </Pressable>
      ))}

      {view.missing.length > 0 ? (
        <>
          <Text style={styles.label}>לפני שאפשר לשלוח, חסרים:</Text>
          {view.missing.map((m) => (
            <Pressable key={m} onPress={() => onGoTo(stepOf(m))} accessibilityRole="button" style={styles.listRow}>
              <Text style={styles.listText}>{missingHe(m, view)}</Text>
              <Text style={styles.tag}>להשלמה ›</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.label}>מה קורה אחרי השליחה</Text>
      {APPROVAL_STEPS_HE.map((t, i) => (
        <View key={t} style={styles.approvalRow}>
          <View style={styles.approvalNum}><Text style={styles.approvalNumText}>{i + 1}</Text></View>
          <Text style={styles.listText}>{t}</Text>
        </View>
      ))}
      <Text style={styles.note}>נעדכן כאן כשיש החלטה. עד אז אפשר לערוך הכול.</Text>
      {/* Also after the first sending: a service added later waits as a draft until it is sent. */}
      <PrimaryAction labelHe="שליחה לאישור PRO NOW" disabled={busy || view.missing.length > 0} onPress={onSubmit} />
    </View>
  );
}

/**
 * The welcome, before the first step (the demo's step 0, Amit 2026-09-29),
 * in the product's plural. It promises only what is built: the shop in the
 * street joins this list when it exists (sync item E, decision D2).
 */
function Welcome({ width, height, onStart, onBack }: { width: number; height: number; onStart: () => void; onBack: () => void }) {
  const lineup = ["home", "hair", "auto", "pets", "care"];
  const benefits: Array<[string, string, string]> = [
    ["📍", "עבודות לידכם, עכשיו", "מתחברים כשנוח לכם, והקריאות מגיעות לפי המיקום שלכם"],
    ["₪", "אתם קובעים את המחירים", "ורואים כמה תקבלו לפני שאתם מאשרים עבודה"],
    ["✓", "כל שירות נבדק בנפרד", "לקוחות יודעים שמי שמגיע אושר בדיוק למה שהזמינו"],
  ];
  return (
    <View style={[styles.screen, { width, height }]}>
      <Image source={{ uri: "/world/splash_city.webp" }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} resizeMode="cover" />
      <View style={styles.welcomeShade} />
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="חזרה">
          <Text style={styles.back}>›</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { gap: spacing.md }]}>
        <Text style={styles.kicker}>PRO NOW לבעלי מקצוע</Text>
        <Text style={styles.hero}>העסק שלכם,{"\n"}ברחוב של כולם.</Text>
        <Text style={styles.soft}>בערך 5 דקות: מה אתם עושים, איפה, המסמכים והמחירים שלכם. עבודה מגיעה אחרי ש־PRO NOW מאשרת.</Text>
        <View style={styles.lineup}>
          {lineup.map((id, i) => (
            <Image key={id} source={{ uri: `/world/character_${id}_icon.webp` }} style={[styles.lineupImg, { transform: [{ translateY: i % 2 ? 6 : 0 }] }]} resizeMode="contain" />
          ))}
        </View>
        {benefits.map(([glyph, title, sub]) => (
          <View key={title} style={styles.benefit}>
            <View style={styles.benefitGlyph}><Text style={styles.benefitGlyphText}>{glyph}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listText}>{title}</Text>
              <Text style={styles.note}>{sub}</Text>
            </View>
          </View>
        ))}
        <PrimaryAction labelHe="בואו נתחיל" onPress={onStart} />
        <ProSignOut />
      </ScrollView>
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
  card: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surfaceElevated, borderWidth: 1.5, borderColor: colors.action },
  cardFace: { width: 64, height: 64, borderRadius: 32 },
  cardFaceEmpty: { backgroundColor: colors.bg },
  cardName: { ...t.bodyStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  sumRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceElevated },
  sumLabel: { ...t.metaStrong, color: colors.textSecondary, width: 64, textAlign: "right", writingDirection: "rtl" },
  sumValue: { ...t.body, color: colors.textPrimary, flex: 1, textAlign: "right", writingDirection: "rtl" },
  approvalRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, minHeight: 36 },
  approvalNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated },
  approvalNumText: { ...t.metaStrong, color: colors.textPrimary },
  welcomeShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,8,16,0.72)" },
  kicker: { ...t.metaStrong, color: colors.actionText, textAlign: "right", writingDirection: "rtl" },
  hero: { ...t.h1, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  lineup: { flexDirection: "row-reverse", justifyContent: "center", gap: 4, paddingVertical: spacing.sm },
  lineupImg: { width: 60, height: 76 },
  benefit: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  benefitGlyph: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated },
  benefitGlyphText: { ...t.bodyStrong, color: colors.textPrimary },
  shopPreview: { height: 220, borderRadius: 20, overflow: "hidden", backgroundColor: "#1B1230", alignItems: "center", justifyContent: "flex-end" },
  facade: { position: "absolute", bottom: 0, width: "100%", height: "92%" },
  sign: { position: "absolute", top: 18, alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 14, borderWidth: 2, backgroundColor: "rgba(10,8,16,0.72)", maxWidth: "90%" },
  signLogo: { width: 28, height: 28, borderRadius: 14 },
  signText: { ...t.h2, color: "#FFFFFF", writingDirection: "rtl" },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: colors.textPrimary, transform: [{ scale: 1.1 }] },
  skip: { minHeight: 44, alignItems: "center", justifyContent: "center" },
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
