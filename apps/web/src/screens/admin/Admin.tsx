import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type AdminProfessionalView } from "@pro-now/api-client";
import { customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api, useMe } from "../../api";
import { useFrame } from "../../frame";
import { ErrorScreen, LoadingScreen } from "../../states";

/**
 * THE ADMIN (docs/21 W8, inside the web app per D7).
 *
 * Who may see it is the server's answer: every call behind these tabs
 * requires ADMIN and is refused otherwise, and every change is written to
 * audit_logs with a reason. This screen checks the role only to decide
 * what to draw.
 */
const TABS = [
  ["queue", "בקשות הצטרפות"],
  ["jobs", "קריאות"],
  ["users", "משתמשים"],
  ["market", "שוק"],
  ["feedback", "התאמות"],
  ["usage", "שימוש"],
] as const;
type Tab = (typeof TABS)[number][0];

const JOB_STATUS_HE: Record<string, string> = {
  SEARCHING: "מחפשים",
  OFFERING: "הצעה נשלחה",
  PRO_ASSIGNED: "שובץ",
  PRO_EN_ROUTE: "בדרך",
  PRO_ARRIVED: "הגיע",
  DIAGNOSIS: "בבדיקה",
  IN_PROGRESS: "בעבודה",
  COMPLETION_PENDING: "מחכה לאישור",
  REVIEW_PENDING: "מחכה לדירוג",
  CLOSED: "נסגרה",
  CANCELLED: "בוטלה",
};

export function Admin() {
  const me = useMe();
  const { width, height } = useFrame();
  const [tab, setTab] = useState<Tab>("queue");
  if (me.isPending) return <LoadingScreen />;
  if (me.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void me.refetch()} />;
  if (!me.data.roles.includes("ADMIN")) return <Navigate to="/" replace />;

  return (
    <View style={[styles.screen, { width, height }]}>
      <Text style={styles.heading}>ניהול</Text>
      <ScrollView horizontal contentContainerStyle={styles.tabs} showsHorizontalScrollIndicator={false}>
        {TABS.map(([id, he]) => (
          <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[styles.tab, tab === id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{he}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.body}>
        {tab === "queue" ? <Queue /> : tab === "jobs" ? <Jobs /> : tab === "users" ? <Users /> : tab === "market" ? <Market /> : tab === "feedback" ? <Feedback /> : <Usage />}
      </ScrollView>
    </View>
  );
}

/** Server refusals the reviewer acts on, in their words; the code stays beside them. */
const ERROR_HE: Record<string, string> = {
  IDENTITY_NOT_VERIFIED: "קודם צריך לאשר את הזהות.",
  UNDER_MINIMUM_AGE: "לפי תאריך הלידה, מתחת לגיל 18.",
  DATE_OF_BIRTH_MISSING: "חסר תאריך לידה בפרטים.",
};

/** An action that needs a reason when it refuses; errors shown in place. */
function useAct() {
  const [busy, setBusy] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setErrorHe(null);
    try {
      await fn();
    } catch (e) {
      setErrorHe(e instanceof ApiError ? `${ERROR_HE[e.code] ?? e.message} (${e.code})` : e instanceof Error ? e.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  };
  return { busy, errorHe, run };
}

function Queue() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "applications"], queryFn: api.admin.applications });
  const [openId, setOpenId] = useState<string | null>(null);
  if (list.isPending) return <LoadingScreen />;
  if (list.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void list.refetch()} />;
  if (openId) return <Application id={openId} onBack={() => { setOpenId(null); void queryClient.invalidateQueries({ queryKey: ["admin", "applications"] }); }} />;
  if (list.data.applications.length === 0) return <Text style={styles.soft}>אין בקשות שמחכות להחלטה.</Text>;
  return (
    <View style={styles.list}>
      {list.data.applications.map((a) => (
        <Pressable key={a.profile.id} onPress={() => setOpenId(a.profile.id)} accessibilityRole="button" accessibilityLabel={`בקשה של ${a.profile.displayName}`} style={styles.row}>
          <Text style={styles.rowTitle}>{a.profile.displayName} · {a.profile.legalName}</Text>
          <Text style={styles.rowSub}>{a.services.map((s) => s.nameHe).join(" · ")}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Application({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const key = ["admin", "professional", id];
  const view = useQuery({ queryKey: key, queryFn: () => api.admin.professional(id) });
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const { busy, errorHe, run } = useAct();
  const decide = (fn: () => Promise<unknown>) => run(async () => { await fn(); await queryClient.invalidateQueries({ queryKey: key }); });
  if (view.isPending) return <LoadingScreen />;
  if (view.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void view.refetch()} />;
  const v = view.data;
  const a = v.application;
  const refusal = () => (reason.trim() ? { approve: false, reason: reason.trim() } : null);
  const needReason = "לסירוב צריך לכתוב סיבה";
  return (
    <View style={styles.list}>
      <Pressable onPress={onBack} accessibilityRole="button"><Text style={styles.link}>› חזרה לרשימה</Text></Pressable>
      <Text style={styles.title}>{a.profile.displayName} · {a.profile.legalName}</Text>
      <Text style={styles.soft}>{v.email} · פנייה: {a.profile.addressAs === "F" ? "נקבה" : a.profile.addressAs === "M" ? "זכר" : "—"} · {a.area ? `רדיוס ${a.area.radiusKm} ק״מ` : "בלי אזור"}</Text>
      <Text style={styles.soft}>
        {a.profile.business
          ? `${a.profile.business.tradingName ?? "בלי שם עסק"} · ${({ EXEMPT: "עוסק פטור", LICENSED: "עוסק מורשה", COMPANY: "חברה בע״מ" } as const)[a.profile.business.taxStatus]} · לא נבדק`
          : "פרטי העסק: לא מולאו"}
      </Text>
      <Field label="סיבה (חובה לסירוב, נשמרת ביומן)" value={reason} onChange={setReason} />

      {v.identity ? <IdentityBlock identity={v.identity} busy={busy} reason={reason} decide={decide} run={run} /> : null}

      <Text style={styles.section}>החשבון והמסמכים</Text>
      {v.documents.map((d) => (
        <View key={d.id} style={styles.row}>
          <Text style={styles.rowTitle}>{d.kind} · {d.status}</Text>
          {d.url ? <Text style={styles.link} accessibilityRole="link" onPress={() => window.open(d.url!, "_blank", "noopener")}>פתיחת המסמך ›</Text> : <Text style={styles.rowSub}>אין קובץ</Text>}
        </View>
      ))}
      <View style={styles.row}>
        <Text style={styles.rowTitle}>
          {v.portrait?.kind === "PHOTO" ? "תמונה" : v.portrait?.kind === "CHARACTER" ? "תמונה · הדמות של המקצוע" : "תמונה · לא נבחרה"}
        </Text>
        {v.portrait?.url ? <Text style={styles.link} accessibilityRole="link" onPress={() => window.open(v.portrait!.url!, "_blank", "noopener")}>פתיחת התמונה ›</Text> : null}
      </View>
      <View style={styles.actions}>
        <Action labelHe="אישור החשבון" disabled={busy} onPress={() => decide(() => api.admin.decideAccount(id, { approve: true }))} />
        <Action labelHe="סירוב" danger disabled={busy} onPress={() => { const r = refusal(); return r ? decide(() => api.admin.decideAccount(id, r)) : run(async () => { throw new Error(needReason); }); }} />
      </View>

      <Text style={styles.section}>רישיונות ותעודות</Text>
      <Field label="בתוקף עד (YYYY-MM-DD, לאישור רישיון)" value={expires} onChange={setExpires} />
      {v.credentials.map((c) => (
        <View key={c.id} style={styles.row}>
          <Text style={styles.rowTitle}>
            {[c.serviceNameHe, c.type, c.number, c.status, c.expiresAt ? `עד ${c.expiresAt.slice(0, 10)}` : null].filter(Boolean).join(" · ")}
          </Text>
          {c.url ? <Text style={styles.link} accessibilityRole="link" onPress={() => window.open(c.url!, "_blank", "noopener")}>פתיחת המסמך ›</Text> : null}
          <View style={styles.actions}>
            <Action
              labelHe="אימות"
              disabled={busy}
              onPress={() => decide(() => api.admin.decideCredential(c.id, { approve: true, ...(/^\d{4}-\d{2}-\d{2}$/.test(expires) ? { expiresAt: new Date(expires).toISOString() } : {}) }))}
            />
            <Action labelHe="סירוב" danger disabled={busy} onPress={() => { const r = refusal(); return r ? decide(() => api.admin.decideCredential(c.id, r)) : run(async () => { throw new Error(needReason); }); }} />
          </View>
        </View>
      ))}

      <Text style={styles.section}>שירותים — כל אחד בנפרד</Text>
      {a.services.map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={styles.rowTitle}>{s.nameHe} · {s.status}{s.priced ? "" : " · בלי מחיר"}</Text>
          <View style={styles.actions}>
            <Action labelHe="אישור השירות" disabled={busy} onPress={() => decide(() => api.admin.decideService(s.id, { approve: true }))} />
            <Action labelHe="סירוב" danger disabled={busy} onPress={() => { const r = refusal(); return r ? decide(() => api.admin.decideService(s.id, r)) : run(async () => { throw new Error(needReason); }); }} />
          </View>
        </View>
      ))}
      {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
    </View>
  );
}

type Identity = NonNullable<AdminProfessionalView["identity"]>;

const mark = (b: boolean | null) => (b === true ? "✓" : b === false ? "✗" : "—");

/**
 * The identity check (docs/10): the four photos, what was declared, what the
 * provider found, and a person's decision. The photos are deleted once it is
 * decided, so a decided check shows where they were.
 */
function IdentityBlock({ identity: idn, busy, reason, decide, run }: {
  identity: Identity;
  busy: boolean;
  reason: string;
  decide: (fn: () => Promise<unknown>) => Promise<void>;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const photos: Array<[string, string | null]> = [
    ["תעודת זהות", idn.photos.idCard],
    ["פנים · ישר", idn.photos.straight],
    ["פנים · ימינה", idn.photos.right],
    ["פנים · שמאלה", idn.photos.left],
  ];
  const dob = idn.declared.dateOfBirth ? idn.declared.dateOfBirth.split("-").reverse().join("/") : "—";
  const withReason = (action: "RETAKE" | "REJECT") => {
    const r = reason.trim();
    return r.length >= 3 ? decide(() => api.admin.decideIdentity(idn.id, { action, reason: r })) : run(async () => { throw new Error("לצילום מחדש או לסירוב צריך לכתוב סיבה"); });
  };
  const open = idn.status === "MANUAL_REVIEW" || idn.status === "PENDING";
  return (
    <>
      <Text style={styles.section}>זהות</Text>
      <View style={styles.photos}>
        {photos.map(([label, uri]) => (
          <View key={label} style={styles.photo}>
            {uri ? (
              <Image source={{ uri }} style={{ width: 150, height: 110 }} resizeMode="contain" accessibilityLabel={label} />
            ) : (
              <View style={styles.photoGone}><Text style={styles.rowSub}>נמחקה אחרי ההחלטה</Text></View>
            )}
            <Text style={styles.rowSub}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.rowTitle}>שם בתעודה: {idn.declared.legalName} · תאריך לידה: {dob}</Text>
      <Text style={styles.rowSub}>
        {idn.isSandbox
          ? "ספק בדיקה: סביבת ניסיון — אין בדיקה אוטומטית"
          : `ספק: ${idn.vendorName} · התאמת שם ${mark(idn.provider.nameMatch)} · בדיקת חיות ${mark(idn.provider.livenessPassed)} · תעודה בתוקף ${mark(idn.provider.documentValid)}`}
      </Text>
      <Text style={styles.rowSub}>
        {idn.status}{idn.decidedAt ? ` · ${new Date(idn.decidedAt).toLocaleString("he-IL")}` : ""}{idn.decisionReason ? ` · ${idn.decisionReason}` : ""}
      </Text>
      {open ? (
        <View style={styles.actions}>
          <Action labelHe="הזהות אושרה" disabled={busy} onPress={() => decide(() => api.admin.decideIdentity(idn.id, { action: "APPROVE" }))} />
          <Action labelHe="צילום מחדש" disabled={busy} onPress={() => withReason("RETAKE")} />
          <Action labelHe="סירוב זהות" danger disabled={busy} onPress={() => withReason("REJECT")} />
        </View>
      ) : null}
    </>
  );
}

function Jobs() {
  const [status, setStatus] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "jobs", status], queryFn: () => api.admin.jobs(status || undefined) });
  if (openId) return <JobStory id={openId} onBack={() => setOpenId(null)} />;
  return (
    <View style={styles.list}>
      <View style={styles.actions}>
        {["", "SEARCHING", "OFFERING", "PRO_ASSIGNED", "IN_PROGRESS", "COMPLETION_PENDING", "CLOSED", "CANCELLED"].map((s) => (
          <Chip key={s || "all"} labelHe={s ? (JOB_STATUS_HE[s] ?? s) : "הכול"} on={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      {list.isPending ? <LoadingScreen /> : list.isError ? <ErrorScreen offline={!navigator.onLine} onRetry={() => void list.refetch()} /> : list.data.jobs.length === 0 ? (
        <Text style={styles.soft}>אין קריאות כאלה.</Text>
      ) : (
        list.data.jobs.map((j) => (
          <Pressable key={j.id} onPress={() => setOpenId(j.id)} accessibilityRole="button" style={styles.row}>
            <Text style={styles.rowTitle}>{j.serviceNameHe} · {JOB_STATUS_HE[j.status] ?? j.status}</Text>
            <Text style={styles.rowSub}>{new Date(j.createdAt).toLocaleString("he-IL")} · {j.professional ?? "בלי מקצוען"}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function JobStory({ id, onBack }: { id: string; onBack: () => void }) {
  const job = useQuery({ queryKey: ["admin", "job", id], queryFn: () => api.admin.job(id) });
  if (job.isPending) return <LoadingScreen />;
  if (job.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void job.refetch()} />;
  const j = job.data;
  return (
    <View style={styles.list}>
      <Pressable onPress={onBack} accessibilityRole="button"><Text style={styles.link}>› חזרה לרשימה</Text></Pressable>
      <Text style={styles.title}>{j.service.nameHe} · {JOB_STATUS_HE[j.status] ?? j.status}</Text>
      <Text style={styles.soft}>
        {j.customer.name ?? j.customer.email} · {j.address ?? "—"} · {j.professional?.displayName ?? "בלי מקצוען"}
        {j.onSite ? ` · בשביל ${j.onSite.name}` : ""}
      </Text>
      {j.description ? <Text style={styles.soft}>״{j.description}״</Text> : null}
      <Text style={styles.section}>ציר הזמן</Text>
      {j.events.map((e, i) => (
        <View key={i} style={styles.timeline}>
          <Text style={styles.rowSub}>{new Date(e.at).toLocaleTimeString("he-IL")}</Text>
          <Text style={styles.rowTitle}>{e.type} · {e.actor}</Text>
        </View>
      ))}
      {j.offers.length ? <Text style={styles.section}>הצעות</Text> : null}
      {j.offers.map((o, i) => (
        <Text key={i} style={styles.rowSub}>{new Date(o.at).toLocaleTimeString("he-IL")} · {o.professional} · {o.status}</Text>
      ))}
      {j.quotes.map((q) => (
        <Text key={q.version} style={styles.rowSub}>הצעת מחיר {q.version} · {q.status} · ₪{(q.totalMinorUnits / 100).toFixed(0)}</Text>
      ))}
      {j.review ? <Text style={styles.rowSub}>דירוג {j.review.overallRating}{j.review.text ? ` · ״${j.review.text}״` : ""}</Text> : null}
    </View>
  );
}

function Users() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["admin", "users", q], queryFn: () => api.admin.users(q || undefined) });
  const { busy, errorHe, run } = useAct();
  return (
    <View style={styles.list}>
      <Field label="חיפוש לפי אימייל" value={q} onChange={setQ} />
      <Field label="סיבה לשינוי תפקיד (נשמרת ביומן)" value={reason} onChange={setReason} />
      <Text style={styles.soft}>הרשאת ניהול ניתנת רק דרך רשימת ADMIN_EMAILS בשרת, לא מכאן.</Text>
      {list.isPending ? <LoadingScreen /> : list.isError ? <ErrorScreen offline={!navigator.onLine} onRetry={() => void list.refetch()} /> : (
        list.data.users.map((u) => (
          <View key={u.id} style={styles.row}>
            <Text style={styles.rowTitle}>{u.email}{u.deleted ? " · נמחק" : ""}</Text>
            <Text style={styles.rowSub}>{u.roles.join(" · ") || "בלי תפקיד"}{u.professional ? ` · מקצוען: ${u.professional.verificationStatus}` : ""}</Text>
            <View style={styles.actions}>
              {(["CUSTOMER", "PROFESSIONAL"] as const).map((role) => {
                const has = u.roles.includes(role);
                return (
                  <Action
                    key={role}
                    labelHe={`${has ? "הסרת" : "הוספת"} ${role === "CUSTOMER" ? "לקוח" : "מקצוען"}`}
                    danger={has}
                    disabled={busy || reason.trim().length < 3}
                    onPress={() => run(async () => {
                      await api.admin.changeRole(u.id, { role, grant: !has, reason: reason.trim() });
                      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
                    })}
                  />
                );
              })}
            </View>
          </View>
        ))
      )}
      {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
    </View>
  );
}

function Market() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["admin", "market"], queryFn: api.admin.market });
  const { busy, errorHe, run } = useAct();
  const SWITCHES = [
    ["customerVisible", "גלוי ללקוחות"],
    ["providerOnboardingEnabled", "פתוח להצטרפות"],
    ["dispatchEnabled", "שיבוץ פעיל"],
  ] as const;
  return (
    <View style={styles.list}>
      <Field label="סיבה לשינוי (נשמרת ביומן)" value={reason} onChange={setReason} />
      {list.isPending ? <LoadingScreen /> : list.isError ? <ErrorScreen offline={!navigator.onLine} onRetry={() => void list.refetch()} /> : (
        list.data.activations.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={styles.rowTitle}>{a.service?.nameHe} · {a.marketCode}</Text>
            <View style={styles.actions}>
              {SWITCHES.map(([k, he]) => (
                <Chip
                  key={k}
                  labelHe={`${he}: ${a[k] ? "כן" : "לא"}`}
                  on={a[k]}
                  onPress={() => {
                    if (busy || reason.trim().length < 3) return;
                    void run(async () => {
                      await api.admin.changeMarket(a.id, { [k]: !a[k], reason: reason.trim() });
                      await queryClient.invalidateQueries({ queryKey: ["admin", "market"] });
                    });
                  }}
                />
              ))}
            </View>
          </View>
        ))
      )}
      {reason.trim().length < 3 ? <Text style={styles.soft}>כתבו סיבה כדי לשנות מתג.</Text> : null}
      {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
    </View>
  );
}

function Feedback() {
  const list = useQuery({ queryKey: ["admin", "feedback"], queryFn: api.admin.matchFeedback });
  if (list.isPending) return <LoadingScreen />;
  if (list.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void list.refetch()} />;
  if (list.data.feedback.length === 0) return <Text style={styles.soft}>אין משובים מהימים האחרונים (נשמרים 4 ימים).</Text>;
  return (
    <View style={styles.list}>
      <Text style={styles.soft}>מסומנות השורות שבהן הלקוח בחר משהו אחר מההצעה הראשונה — אלה המשפטים שכדאי להוסיף לסט הבדיקה.</Text>
      {list.data.feedback.map((f) => (
        <View key={f.id} style={[styles.row, f.missed && styles.missed]}>
          <Text style={styles.rowTitle}>״{f.text}״</Text>
          <Text style={styles.rowSub}>הוצע: {f.suggested.join(", ") || "—"} · נבחר: {f.chosen ?? "—"} · {f.confidence}</Text>
        </View>
      ))}
    </View>
  );
}

function Usage() {
  const u = useQuery({ queryKey: ["admin", "usage"], queryFn: api.admin.usage });
  if (u.isPending) return <LoadingScreen />;
  if (u.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void u.refetch()} />;
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  const of = (b: number, limit: number | null) => (limit ? `${mb(b)} מתוך ${mb(limit)} (${Math.round((100 * b) / limit)}%)` : `${mb(b)} · אין מגבלה מוגדרת`);
  return (
    <View style={styles.list}>
      <Line labelHe="משתמשים" valueHe={String(u.data.users)} />
      <Line labelHe="אחסון קבצים" valueHe={`${of(u.data.storage.bytes, u.data.storage.limitBytes)} · ${u.data.storage.files} קבצים`} />
      <Line labelHe="מסד נתונים" valueHe={of(u.data.database.bytes, u.data.database.limitBytes)} />
      <Text style={styles.section}>מקצוענים</Text>
      {Object.entries(u.data.professionals).map(([k, n]) => <Line key={k} labelHe={k} valueHe={String(n)} />)}
      <Text style={styles.section}>קריאות</Text>
      {Object.entries(u.data.jobs).map(([k, n]) => <Line key={k} labelHe={JOB_STATUS_HE[k] ?? k} valueHe={String(n)} />)}
    </View>
  );
}

function Line({ labelHe, valueHe }: { labelHe: string; valueHe: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.rowTitle}>{labelHe}</Text>
      <Text style={styles.rowSub}>{valueHe}</Text>
    </View>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} style={styles.input} placeholderTextColor={colors.textSecondary} />
    </View>
  );
}

function Action({ labelHe, onPress, danger, disabled }: { labelHe: string; onPress: () => unknown; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={() => void onPress()} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.action, danger && styles.actionDanger, disabled && { opacity: 0.45 }]}>
      <Text style={styles.actionText}>{labelHe}</Text>
    </Pressable>
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
  heading: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", padding: spacing.lg, paddingBottom: spacing.sm },
  tabs: { flexDirection: "row-reverse", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.surfaceElevated },
  tabOn: { backgroundColor: colors.action },
  tabText: { ...t.metaStrong, color: colors.textPrimary, writingDirection: "rtl" },
  tabTextOn: { color: colors.bg },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  list: { gap: spacing.sm },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  section: { ...t.metaStrong, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl", marginTop: spacing.md },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  label: { ...t.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  input: { minHeight: 40, borderRadius: 10, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  row: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceElevated, gap: 4 },
  missed: { borderWidth: 1, borderColor: colors.action },
  rowTitle: { ...t.body, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  rowSub: { ...t.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  line: { flexDirection: "row-reverse", justifyContent: "space-between", gap: spacing.md, paddingVertical: 4 },
  timeline: { flexDirection: "row-reverse", gap: spacing.md, alignItems: "center" },
  link: { ...t.metaStrong, color: colors.actionText, textAlign: "right", writingDirection: "rtl" },
  photos: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  photo: { gap: 4, alignItems: "center" },
  photoGone: { width: 150, height: 110, borderRadius: 8, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  action: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.action },
  actionDanger: { backgroundColor: colors.statusDanger },
  actionText: { ...t.metaStrong, color: colors.bg, writingDirection: "rtl" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.textSecondary },
  chipOn: { backgroundColor: colors.trust, borderColor: colors.trust },
  chipText: { ...t.meta, color: colors.textPrimary, writingDirection: "rtl" },
  chipTextOn: { color: colors.bg },
  error: { ...t.body, color: colors.statusDanger, textAlign: "right", writingDirection: "rtl" },
});
