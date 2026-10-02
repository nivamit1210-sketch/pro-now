import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@pro-now/api-client";
import type { ProApplicationView } from "@pro-now/types";
import { PrimaryAction, customerDarkTheme, spacing, type as t } from "@pro-now/ui";

import { api } from "../api";
import { compressImage } from "../media";
import { pickFile } from "../pickFile";
import { cameraMode, FACE_POSITIONS, inPosition } from "./facePlan";
import { loadFaceSense, readVideo } from "./faceSense";

/**
 * THE IDENTITY CHECK (docs/10 §Identity check in the app): the ID card, then
 * the face straight, right and left, then "sent". A person at PRO NOW looks
 * at the four photos and decides; nothing here says the face matched,
 * because nothing here computes that. The face detection only takes each
 * photo by itself; the shutter is always there.
 *
 * Each photo is uploaded as soon as it is taken. The ids live in this
 * component only: leaving the screen loses unsent photos (20 seconds to
 * retake; unlinked uploads are swept after 4 days).
 */
type Identity = ProApplicationView["identity"];
type Phase = "status" | "id" | "face" | "sent";
type Shot = { blob: Blob; id: string | null; failed: boolean };

const INSTRUCTION_HE = ["מסתכלים ישר", "מסובבים את הראש ימינה", "ועכשיו שמאלה"] as const;
const TICK_HE = ["ישר", "ימינה", "שמאלה"] as const;
const HOLD_MS = 600;

function errorHe(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "אין חיבור לאינטרנט. נסו שוב כשהחיבור יחזור.";
  if (e instanceof ApiError && e.code === "UPLOAD_NOT_READY") return "התמונות עוד עולות. נסו שוב בעוד רגע.";
  if (e instanceof ApiError && e.code === "IDENTITY_ALREADY_VERIFIED") return "הזהות כבר אושרה.";
  return "משהו לא נשלח. נסו שוב.";
}

async function uploadIdentity(blob: Blob): Promise<string> {
  return (await api.uploadMedia({ kind: "IDENTITY", mime: "image/jpeg", body: blob })).upload.id;
}

export function IdentityCheck({ legalNameHe, current, onSubmitted }: { legalNameHe: string; current: Identity; onSubmitted: (view: ProApplicationView) => void }) {
  const decided = current?.status === "VERIFIED" || current?.status === "REJECTED" || current?.status === "MANUAL_REVIEW" || current?.status === "PENDING";
  const [phase, setPhase] = useState<Phase>(decided ? "status" : "id");

  // The ID card.
  const [idFile, setIdFile] = useState<Blob | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [idUploadId, setIdUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemHe, setProblemHe] = useState<string | null>(null);
  useEffect(() => () => { if (idPreview) URL.revokeObjectURL(idPreview); }, [idPreview]);

  // The face.
  const [mode, setMode] = useState<"checking" | "live" | "picker">("checking");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [sensing, setSensing] = useState(false);
  const [faceSeen, setFaceSeen] = useState<boolean | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const video = useRef<HTMLVideoElement | null>(null);
  // Mirrors of state for handlers that must not act twice (a double tap, an async frame).
  const taken = useRef(0);
  const capturing = useRef(false);
  const submitting = useRef(false);
  const autoSent = useRef<string | null>(null);
  const submitted = useRef(onSubmitted);
  submitted.current = onSubmitted;
  useEffect(() => () => stream?.getTracks().forEach((tr) => tr.stop()), [stream]);

  const start = () => {
    setIdFile(null);
    setIdPreview(null);
    setIdUploadId(null);
    setShots([]);
    taken.current = 0;
    autoSent.current = null;
    setProblemHe(null);
    setMode("checking");
    setPhase("id");
  };

  const shootId = async () => {
    const file = await pickFile("image/*", "environment");
    if (!file) return;
    setProblemHe(null);
    setIdFile(file);
    setIdPreview(URL.createObjectURL(file));
  };

  const acceptId = async () => {
    if (!idFile || busy) return;
    setBusy(true);
    setProblemHe(null);
    try {
      setIdUploadId(await uploadIdentity(await compressImage(idFile)));
      setPhase("face");
    } catch (e) {
      setProblemHe(errorHe(e));
    } finally {
      setBusy(false);
    }
  };

  // Entering the face: a live front camera if this page may open one, else the phone's camera app.
  useEffect(() => {
    if (phase !== "face" || mode !== "checking") return;
    let alive = true;
    void (async () => {
      const open = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const m = navigator.mediaDevices ? await cameraMode(open) : "picker";
      if (!alive) return;
      if (m === "picker") return setMode("picker");
      try {
        const s = await open();
        if (!alive) return s.getTracks().forEach((tr) => tr.stop());
        // Permission taken back, or the camera gone, mid-way: the phone's camera app instead.
        s.getVideoTracks().forEach((tr) => tr.addEventListener("ended", () => { setStream(null); setMode("picker"); }));
        setStream(s);
        setMode("live");
        setSensing(Boolean(await loadFaceSense()));
      } catch {
        if (alive) setMode("picker");
      }
    })();
    return () => { alive = false; };
  }, [phase, mode]);

  const upload = useCallback((index: number, blob: Blob) => {
    setShots((all) => all.map((s, i) => (i === index ? { ...s, failed: false } : s)));
    uploadIdentity(blob).then(
      (id) => setShots((all) => all.map((s, i) => (i === index ? { ...s, id } : s))),
      () => setShots((all) => all.map((s, i) => (i === index ? { ...s, failed: true } : s)))
    );
  }, []);

  const addShot = useCallback((blob: Blob) => {
    const index = taken.current;
    if (index >= FACE_POSITIONS.length) return;
    taken.current = index + 1;
    setShots((all) => [...all, { blob, id: null, failed: false }]);
    upload(index, blob);
  }, [upload]);

  const captureFrame = useCallback(() => {
    const v = video.current;
    if (!v || v.videoWidth === 0 || capturing.current) return;
    capturing.current = true;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      capturing.current = false;
      if (b) addShot(b);
    }, "image/jpeg", 0.85);
  }, [addShot]);

  // Each position, held for a moment, takes its own photo. Guidance only.
  const position = FACE_POSITIONS[shots.length];
  useEffect(() => {
    if (mode !== "live" || !sensing || !position) return;
    let alive = true;
    let raf = 0;
    let last = 0;
    let since: number | null = null;
    void loadFaceSense().then((lm) => {
      const tick = (now: number) => {
        if (!alive) return;
        const v = video.current;
        if (lm && v && v.readyState >= 2 && now - last > 90) {
          last = now;
          try {
            const r = readVideo(lm, v, now);
            setFaceSeen(r.found);
            if (r.found && inPosition(position, r.turn, true)) {
              since ??= now;
              if (now - since > HOLD_MS) return captureFrame();
            } else since = null;
          } catch {
            return setSensing(false);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [mode, sensing, position, captureFrame]);

  // All three taken: the camera closes.
  useEffect(() => { if (shots.length >= FACE_POSITIONS.length) setStream(null); }, [shots.length]);

  const shootPicker = async () => {
    const file = await pickFile("image/*", "user");
    if (!file) return;
    try {
      addShot(await compressImage(file));
    } catch (e) {
      setProblemHe(errorHe(e));
    }
  };

  // The four ids, once all exist: the ID card, then straight, right, left.
  const [s0, s1, s2] = shots.map((s) => s.id);
  const four = idUploadId && s0 && s1 && s2 ? ([idUploadId, s0, s1, s2] as const) : null;
  const ready = four !== null;
  const submit = async () => {
    if (!four || submitting.current) return;
    submitting.current = true;
    setProblemHe(null);
    try {
      const view = await api.proSubmitIdentity({ documentUploadId: four[0], selfieUploadIds: [four[1], four[2], four[3]] });
      setPhase("sent");
      submitted.current(view);
    } catch (e) {
      setProblemHe(errorHe(e));
    } finally {
      submitting.current = false;
    }
  };
  // Sent by itself once per set of photos; after a failure, the button below sends again.
  const key = four ? four.join("|") : null;
  useEffect(() => {
    if (key === null || phase !== "face" || autoSent.current === key) return;
    autoSent.current = key;
    void submit();
  });

  const reason = current?.reasonHe ? `: ${current.reasonHe}` : ".";

  if (phase === "status") {
    if (current?.status === "VERIFIED") return <Text style={[styles.title, styles.ok]}>הזהות אושרה ✓</Text>;
    if (current?.status === "REJECTED") return <Text accessibilityRole="alert" style={styles.warn}>{`הבקשה לא אושרה${reason}`}</Text>;
    return (
      <View style={styles.section}>
        <Text style={[styles.title, styles.ok]}>הזהות בבדיקה ✓</Text>
        <Text style={styles.soft}>אדם מצוות PRO NOW בודק את התמונות. נעדכן אתכם כאן.</Text>
        <Pressable onPress={start} accessibilityRole="button" accessibilityLabel="צילום מחדש" style={styles.link}>
          <Text style={styles.linkText}>צילום מחדש</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "sent") {
    return (
      <View style={styles.section} accessibilityLiveRegion="polite">
        <Text style={[styles.title, styles.ok]}>הזהות נשלחה לבדיקה</Text>
        <Text style={styles.soft}>אדם מצוות PRO NOW בודק את התמונות. נעדכן אתכם כאן.</Text>
      </View>
    );
  }

  const problem = problemHe ? <Text accessibilityRole="alert" style={styles.warn}>{problemHe}</Text> : null;

  if (phase === "id") {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>בדיקת זהות</Text>
        {current?.status === "RETAKE_REQUESTED" ? <Text style={styles.warn}>{`ביקשנו לצלם שוב${reason}`}</Text> : null}
        <Text style={styles.soft}>{`תעודת הזהות של ${legalNameHe.trim() || "בעל/ת החשבון"}, הצד עם התמונה. אחר כך שלוש תמונות פנים. בערך 20 שניות.`}</Text>
        {idPreview ? (
          <>
            <img src={idPreview} alt="תעודת הזהות שצולמה" style={{ width: "100%", borderRadius: 16, objectFit: "contain", maxHeight: 260 }} />
            <PrimaryAction labelHe={busy ? "מעלים…" : "נראה טוב"} accessibilityLabelHe="נראה טוב" disabled={busy} onPress={() => void acceptId()} />
            <Pressable onPress={() => void shootId()} disabled={busy} accessibilityRole="button" accessibilityLabel="צילום מחדש" style={styles.link}>
              <Text style={styles.linkText}>צילום מחדש</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryAction labelHe="צילום תעודת הזהות" onPress={() => void shootId()} />
        )}
        {problem}
      </View>
    );
  }

  // phase === "face"
  const step = Math.min(shots.length, 2);
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{shots.length >= 3 ? "שולחים לבדיקה…" : INSTRUCTION_HE[step]}</Text>
      {mode === "checking" ? <Text style={styles.soft}>פותחים את המצלמה…</Text> : null}
      {mode === "live" && shots.length < 3 ? (
        <>
          <View style={styles.oval}>
            <video
              ref={(el) => {
                video.current = el;
                if (el && stream && el.srcObject !== stream) {
                  el.srcObject = stream;
                  void el.play().catch(() => undefined);
                }
              }}
              aria-label="מצלמה קדמית"
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
            />
          </View>
          {sensing && faceSeen === false ? <Text style={styles.note}>לא רואים פנים. מסתכלים למצלמה, מול האור.</Text> : null}
          <PrimaryAction labelHe="צילום" onPress={captureFrame} />
        </>
      ) : null}
      {mode === "picker" ? (
        <>
          <Text style={styles.note}>המצלמה לא נפתחה כאן, אז נצלם עם מצלמת הטלפון.</Text>
          {TICK_HE.map((w, k) => (
            <PrimaryAction key={w} labelHe={`צילום ${w}`} disabled={k !== shots.length} onPress={() => void shootPicker()} />
          ))}
        </>
      ) : null}
      <View style={styles.ticks}>
        {TICK_HE.map((w, k) => (
          <Text key={w} style={[styles.tick, k < shots.length && styles.ok]}>{k < shots.length ? `${w} ✓` : w}</Text>
        ))}
      </View>
      {shots.map((s, k) =>
        s.failed ? (
          <View key={k} style={styles.retry}>
            <Text style={styles.warn}>{`התמונה "${TICK_HE[k]}" לא עלתה.`}</Text>
            <Pressable onPress={() => upload(k, s.blob)} accessibilityRole="button" accessibilityLabel={`נסו שוב · ${TICK_HE[k]}`} style={styles.link}>
              <Text style={styles.linkText}>נסו שוב</Text>
            </Pressable>
          </View>
        ) : null
      )}
      {problem}
      {problemHe && ready ? <PrimaryAction labelHe="שליחה שוב" onPress={() => void submit()} /> : null}
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  section: { gap: spacing.md, paddingBottom: spacing.md },
  title: { ...t.h2, color: colors.textPrimary, textAlign: "right", writingDirection: "rtl" },
  soft: { ...t.body, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  note: { ...t.meta, color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  warn: { ...t.body, color: colors.statusDanger, textAlign: "right", writingDirection: "rtl" },
  ok: { color: colors.trust },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-end" },
  linkText: { ...t.meta, color: colors.actionText, writingDirection: "rtl" },
  oval: { alignSelf: "center", width: 220, height: 290, borderRadius: 145, overflow: "hidden", borderWidth: 3, borderColor: colors.action, backgroundColor: colors.surfaceElevated },
  ticks: { flexDirection: "row-reverse", justifyContent: "center", gap: spacing.lg },
  tick: { ...t.metaStrong, color: colors.textSecondary, writingDirection: "rtl" },
  retry: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
});
