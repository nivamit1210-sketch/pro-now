import React, { useEffect, useRef, useState } from "react";
import { scale } from "@pro-now/demo-ui";
import { loadFaceSense, readImage, readVideo, STRAIGHT, TURNED } from "./faceSense";

/*
 * IDENTITY CHECK — the ID card, then the face, then the match.
 *
 * Amit (2026-10-01), after signing up to Lime: photograph the ID, watch it
 * being read, then the camera opens and asks you to look straight, then
 * right, then left — and the face is matched to the card. Only then does
 * the join move on, and nobody is approved for work without it. "שגם השלב
 * הזה יראה חדשני מהיר ולא מתיש וברור": one big action per screen, the frame
 * tells you what to do, a tick the moment each part is done. ~20 seconds.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The photo of the card and the camera
 * are real (the browser's own). The reading of the card and the face match
 * are played, not computed: the identity-verification vendor is an open
 * decision (/CLAUDE.md §4, /docs/18-ROADMAP.md §Open Decisions), and the
 * screen says so in one quiet line. Nothing leaves the phone.
 */

export interface IdentityResult {
  idUri: string;
  /* A still from the camera, when there was one; null when the camera could not open. */
  selfieUri: string | null;
}

type Phase = "id" | "reading" | "face" | "match";
const TURNS = [
  { he: "מסתכלים ישר", arrow: "" },
  { he: "מסובבים את הראש ימינה", arrow: "→" },
  { he: "ועכשיו שמאלה", arrow: "←" },
] as const;
const TURN_MS = 1700;
const FACE_STEPS = ["מביטים ישר", "מסובבים את הראש ימינה", "ועכשיו שמאלה"];

const CORAL = "#FF6B4A";
const GREEN = "#2FBF8A";
const INK = "#F7F3FA";

const CSS = `
@keyframes pnIdScan { 0% { top: 4%; } 50% { top: 92%; } 100% { top: 4%; } }
@keyframes pnIdIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pnIdPop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes pnIdNudgeR { 0%,100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
@keyframes pnIdNudgeL { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-10px); } }
@keyframes pnIdTurnR { 0%,100% { transform: perspective(300px) rotateY(0); } 50% { transform: perspective(300px) rotateY(-28deg); } }
@keyframes pnIdTurnL { 0%,100% { transform: perspective(300px) rotateY(0); } 50% { transform: perspective(300px) rotateY(28deg); } }
@keyframes pnIdLink { from { width: 0; } to { width: 100%; } }
@keyframes pnIdBreath { 0%,100% { box-shadow: 0 0 0 0 rgba(255,107,74,.0); } 50% { box-shadow: 0 0 26px 2px rgba(255,107,74,.45); } }
`;

export function IdentityCheck({
  nameHe,
  onPickFile,
  onTakeSelfie,
  onDone,
}: {
  nameHe: string;
  onPickFile: () => Promise<{ uri: string; name: string } | null>;
  /** The phone's own selfie camera (a file picker with capture="user"): used where a live camera is not allowed. */
  onTakeSelfie?: () => Promise<{ uri: string; name: string } | null>;
  onDone: (r: IdentityResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("id");
  const [idUri, setIdUri] = useState<string | null>(null);
  const [read, setRead] = useState(0);
  const [turn, setTurn] = useState(-1);
  /* "on": a live camera, read frame by frame · "photo": the phone's selfie camera, one picture per step ·
     "none": no face sensing on this device — the move is shown, honestly marked. */
  const [camera, setCamera] = useState<"off" | "on" | "photo" | "none">("off");
  const [preparing, setPreparing] = useState(false);
  /* The real check: 0 straight · 1 one way · 2 the other way · 3 done. */
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [faceSeen, setFaceSeen] = useState(false);
  const firstSign = useRef(0);
  const holdSince = useRef<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [selfie, setSelfie] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);
  /* Fetched while the ID card is being photographed, so the face step does not wait. */
  useEffect(() => {
    void loadFaceSense();
  }, []);

  /* Reading the card: a sweep, then three lines tick in. */
  useEffect(() => {
    if (phase !== "reading") return;
    if (read >= 3) {
      const t = setTimeout(() => setPhase("face"), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRead((n) => n + 1), read === 0 ? 1300 : 450);
    return () => clearTimeout(t);
  }, [phase, read]);

  /* The turns: straight, right, left — each fills a third of the ring. */
  useEffect(() => {
    if (phase !== "face" || turn < 0 || camera !== "none") return;
    if (turn >= TURNS.length) {
      stop();
      setPhase("match");
      return;
    }
    const t = setTimeout(() => setTurn((n) => n + 1), TURN_MS);
    return () => clearTimeout(t);
  }, [phase, turn, camera]);

  /* The match: both pictures, a line between them, the tick — and on. */
  useEffect(() => {
    if (phase !== "match" || !idUri) return;
    const t = setTimeout(() => done.current({ idUri, selfieUri: selfie }), 2100);
    return () => clearTimeout(t);
  }, [phase, idUri, selfie]);

  const shootId = async () => {
    const f = await onPickFile();
    if (!f) return;
    setIdUri(f.uri);
    setRead(0);
    setPhase("reading");
  };

  const finishFace = (selfieUri: string | null) => {
    stop();
    setSelfie(selfieUri);
    setTimeout(() => setPhase("match"), 900);
  };

  const openCamera = async () => {
    setPreparing(true);
    const lm = await loadFaceSense();
    if (!lm) {
      /* No face sensing here: the old guided move, said plainly. */
      setPreparing(false);
      setCamera("none");
      setTimeout(() => setTurn(0), 500);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 }, audio: false });
      stream.current = s;
      setCamera("on");
      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      /* No live camera in this page (the demo's host does not allow it): the phone's selfie camera, one picture per step. */
      setCamera("photo");
    }
    setPreparing(false);
  };

  /* LIVE: read the face a few times a second; each step must hold for a moment. */
  useEffect(() => {
    if (phase !== "face" || camera !== "on" || step >= 3) return;
    let alive = true;
    let raf = 0;
    let last = 0;
    const tick = async (now: number) => {
      if (!alive) return;
      const v = video.current;
      const lm = await loadFaceSense();
      if (lm && v && v.readyState >= 2 && now - last > 90) {
        last = now;
        const r = await readVideo(lm, v, now);
        setFaceSeen(r.found);
        const want = step === 0 ? r.found && Math.abs(r.turn) < STRAIGHT : step === 1 ? r.found && Math.abs(r.turn) > TURNED : r.found && Math.abs(r.turn) > TURNED && Math.sign(r.turn) === -firstSign.current;
        setHint(!r.found ? "לא רואים פנים — הביטו למצלמה" : r.size < 0.22 ? "התקרבו קצת למצלמה" : null);
        if (want) {
          holdSince.current ??= now;
          if (now - holdSince.current > (step === 0 ? 600 : 350)) {
            holdSince.current = null;
            if (step === 1) firstSign.current = Math.sign(r.turn);
            if (step === 2) {
              const c = document.createElement("canvas");
              c.width = 360;
              c.height = Math.round((360 * v.videoHeight) / v.videoWidth);
              const g = c.getContext("2d");
              if (g) {
                g.translate(c.width, 0);
                g.scale(-1, 1);
                g.drawImage(v, 0, 0, c.width, c.height);
              }
              setStep(3);
              finishFace(g ? c.toDataURL("image/jpeg", 0.85) : null);
              return;
            }
            setStep((n) => n + 1);
          }
        } else holdSince.current = null;
      }
      raf = requestAnimationFrame((t) => void tick(t));
    };
    raf = requestAnimationFrame((t) => void tick(t));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [phase, camera, step]);

  /* PHOTO: the phone's selfie camera, then the same reading on the picture. */
  const shootSelfie = async () => {
    const pick = onTakeSelfie ?? onPickFile;
    const f = await pick();
    if (!f) return;
    setPreparing(true);
    const lm = await loadFaceSense();
    const r = lm ? await readImage(lm, f.uri) : null;
    setPreparing(false);
    if (!r || !r.found) {
      setHint("לא זיהינו פנים בתמונה — נסו שוב, מול האור");
      return;
    }
    const ok = step === 0 ? Math.abs(r.turn) < STRAIGHT * 1.5 : step === 1 ? Math.abs(r.turn) > TURNED : Math.abs(r.turn) > TURNED && Math.sign(r.turn) === -firstSign.current;
    if (!ok) {
      setHint(step === 0 ? "הביטו ישר למצלמה וצלמו שוב" : step === 1 ? "סובבו את הראש עוד קצת ימינה וצלמו שוב" : "עכשיו לצד השני — שמאלה — וצלמו שוב");
      return;
    }
    setHint(null);
    if (step === 1) firstSign.current = Math.sign(r.turn);
    const next = [...shots, f.uri];
    setShots(next);
    if (step === 2) {
      setStep(3);
      finishFace(next[0] ?? f.uri);
    } else setStep((n) => n + 1);
  };

  const first = nameHe.trim() || "השם שלך";
  const stepOf = phase === "id" || phase === "reading" ? 0 : phase === "face" ? 1 : 2;

  return (
    <div style={{ direction: "rtl", color: INK, fontFamily: "inherit" }}>
      <style>{CSS}</style>
      {/* Three dots: card · face · match. Where you are, at a glance. */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14 }} aria-hidden>
        {["תעודה", "פנים", "התאמה"].map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: scale.micro, fontWeight: 900, background: i < stepOf ? GREEN : i === stepOf ? CORAL : "rgba(255,255,255,.12)", color: "#fff", transition: "background .3s" }}>{i < stepOf ? "✓" : i + 1}</div>
            <span style={{ fontSize: scale.micro, fontWeight: 800, color: i <= stepOf ? INK : "rgba(247,243,250,.5)" }}>{t}</span>
            {i < 2 ? <div style={{ width: 18, height: 2, background: i < stepOf ? GREEN : "rgba(255,255,255,.15)" }} /> : null}
          </div>
        ))}
      </div>

      {phase === "id" || phase === "reading" ? (
        <div style={{ animation: "pnIdIn .35s ease both" }}>
          <div style={{ fontSize: scale.section, fontWeight: 900, textAlign: "center" }}>{phase === "id" ? "צילום תעודת הזהות" : "קוראים את התעודה…"}</div>
          <div style={{ fontSize: scale.meta, color: "rgba(247,243,250,.72)", textAlign: "center", marginTop: 4 }}>{phase === "id" ? "הצד עם התמונה, בתוך המסגרת" : "רגע אחד"}</div>
          <div style={{ position: "relative", margin: "18px auto 0", width: "88%", aspectRatio: "1.586", borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,.05)", border: idUri ? "none" : "2px dashed rgba(255,255,255,.25)", animation: phase === "id" ? "pnIdBreath 2.4s ease-in-out infinite" : undefined }}>
            {idUri ? <img src={idUri} alt="תעודת הזהות שצולמה" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
              /* The card drawn as an outline: where the photo goes, where the lines go. */
              <div style={{ position: "absolute", inset: "14% 10%", display: "flex", gap: "8%" }} aria-hidden>
                <div style={{ width: "30%", borderRadius: 8, background: "rgba(255,255,255,.1)" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingTop: 6 }}>
                  {[80, 60, 70, 45].map((w) => <div key={w} style={{ height: 8, width: `${w}%`, borderRadius: 4, background: "rgba(255,255,255,.1)" }} />)}
                </div>
              </div>
            )}
            {/* Corner brackets. */}
            {[{ top: 8, right: 8 }, { top: 8, left: 8 }, { bottom: 8, right: 8 }, { bottom: 8, left: 8 }].map((p, i) => (
              <div key={i} aria-hidden style={{ position: "absolute", width: 22, height: 22, ...p, borderColor: phase === "reading" && read >= 3 ? GREEN : CORAL, borderStyle: "solid", borderWidth: 0, ...(p.top !== undefined ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }), ...(p.right !== undefined ? { borderRightWidth: 3 } : { borderLeftWidth: 3 }), borderRadius: 4, transition: "border-color .3s" }} />
            ))}
            {phase === "reading" && read < 3 ? (
              <div aria-hidden style={{ position: "absolute", left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent, ${CORAL}, transparent)`, boxShadow: `0 0 18px 4px rgba(255,107,74,.6)`, animation: "pnIdScan 1.3s ease-in-out infinite" }} />
            ) : null}
          </div>
          {phase === "reading" ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {["התעודה זוהתה", `השם: ${first}`, "התמונה בתעודה נקלטה"].map((t, i) =>
                i < read ? (
                  <div key={t} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: scale.body, fontWeight: 800, animation: "pnIdIn .3s ease both" }}>
                    <span style={{ color: GREEN }}>✓</span>
                    {t}
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <button type="button" onClick={shootId} style={btn}>צילום התעודה</button>
          )}
        </div>
      ) : null}

      {phase === "face" ? (
        <div style={{ animation: "pnIdIn .35s ease both", textAlign: "center" }}>
          <div style={{ fontSize: scale.section, fontWeight: 900 }}>
            {camera === "off" ? "עכשיו הפנים" : camera === "none" ? (turn < 0 ? "עכשיו הפנים" : TURNS[Math.min(turn, TURNS.length - 1)]!.he) : step >= 3 ? "הפנים זוהו" : FACE_STEPS[step]}
          </div>
          <div style={{ fontSize: scale.meta, color: hint ? CORAL : "rgba(247,243,250,.72)", marginTop: 4, minHeight: 20, fontWeight: hint ? 800 : 400 }}>
            {camera === "off" ? "סריקה קצרה: ישר, ימינה ושמאלה" : hint ?? (camera === "photo" ? "צילום אחד לכל כיוון" : camera === "on" ? "לאט, בלי למהר" : "לאט, בלי למהר")}
          </div>
          <div style={{ position: "relative", margin: "18px auto 0", width: 220, height: 220 }}>
            {/* Three arcs: one per check, each turning green when the face did it. */}
            <svg width="220" height="220" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden>
              {[0, 1, 2].map((k) => {
                const done = camera === "none" ? turn > k : step > k;
                const now = camera === "none" ? turn === k : step === k;
                return (
                  <circle key={k} cx="50" cy="50" r="47" fill="none" stroke={done ? GREEN : now ? CORAL : "rgba(255,255,255,.12)"} strokeWidth="3.4" strokeLinecap="round"
                    strokeDasharray={`${295.3 / 3 - 6} ${295.3}`} strokeDashoffset={-(295.3 / 3) * k} style={{ transition: "stroke .35s" }} />
                );
              })}
            </svg>
            <div style={{ position: "absolute", inset: 12, borderRadius: "50%", overflow: "hidden", background: "radial-gradient(circle at 50% 40%, #3a2a4a, #15101d)", boxShadow: camera === "on" && faceSeen ? `0 0 0 3px ${GREEN}55, 0 0 28px ${GREEN}55` : "none", transition: "box-shadow .3s" }}>
              {camera === "on" ? (
                <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              ) : camera === "photo" && shots.length > 0 ? (
                <img src={shots[shots.length - 1]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ animation: camera === "none" && turn === 1 ? `pnIdTurnR ${TURN_MS}ms ease-in-out` : camera === "none" && turn === 2 ? `pnIdTurnL ${TURN_MS}ms ease-in-out` : undefined }}>
                  <ellipse cx="50" cy="46" rx="22" ry="28" fill="none" stroke="rgba(247,243,250,.55)" strokeWidth="2" />
                  <circle cx="42" cy="42" r="2.4" fill="rgba(247,243,250,.7)" />
                  <circle cx="58" cy="42" r="2.4" fill="rgba(247,243,250,.7)" />
                  <path d="M43 58 Q50 63 57 58" fill="none" stroke="rgba(247,243,250,.6)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M22 100 Q50 72 78 100" fill="none" stroke="rgba(247,243,250,.4)" strokeWidth="2" />
                </svg>
              )}
              {step >= 3 ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,11,23,.45)" }}>
                  <div style={{ width: 72, height: 72, borderRadius: 36, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: scale.title, fontWeight: 900, color: "#fff", animation: "pnIdPop .45s ease both" }}>✓</div>
                </div>
              ) : null}
            </div>
            {/* Which way to turn, while it is being asked. */}
            {(camera === "on" || camera === "photo") && (step === 1 || step === 2) ? (
              <div aria-hidden style={{ position: "absolute", top: "42%", [step === 1 ? "right" : "left"]: -30, fontSize: scale.title, fontWeight: 900, color: CORAL, animation: `${step === 1 ? "pnIdNudgeR" : "pnIdNudgeL"} .7s ease-in-out infinite` }}>{step === 1 ? "→" : "←"}</div>
            ) : camera === "none" && turn >= 1 && turn < TURNS.length ? (
              <div aria-hidden style={{ position: "absolute", top: "42%", [turn === 1 ? "right" : "left"]: -30, fontSize: scale.title, fontWeight: 900, color: CORAL, animation: `${turn === 1 ? "pnIdNudgeR" : "pnIdNudgeL"} .7s ease-in-out infinite` }}>{TURNS[turn]!.arrow}</div>
            ) : null}
          </div>
          {/* The three checks, ticked as they pass. */}
          {camera === "on" || camera === "photo" ? (
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 14 }}>
              {["ישר", "ימינה", "שמאלה"].map((w, k) => (
                <div key={w} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: scale.meta, fontWeight: 800, color: step > k ? GREEN : step === k ? INK : "rgba(247,243,250,.45)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: step > k ? GREEN : "rgba(255,255,255,.1)", color: "#fff", fontSize: scale.micro }}>{step > k ? "✓" : k + 1}</span>
                  {w}
                </div>
              ))}
            </div>
          ) : null}
          {camera === "off" ? (
            <button type="button" onClick={openCamera} disabled={preparing} style={{ ...btn, opacity: preparing ? 0.6 : 1 }}>{preparing ? "מכינים את הסריקה…" : "פתיחת המצלמה"}</button>
          ) : camera === "photo" && step < 3 ? (
            <button type="button" onClick={shootSelfie} disabled={preparing} style={{ ...btn, opacity: preparing ? 0.6 : 1 }}>{preparing ? "בודקים את התמונה…" : step === 0 ? "צילום — מביטים ישר" : step === 1 ? "צילום — ראש ימינה" : "צילום — ראש שמאלה"}</button>
          ) : camera === "none" ? (
            <div style={{ fontSize: scale.micro, color: "rgba(247,243,250,.55)", marginTop: 14 }}>סריקת הפנים לא זמינה במכשיר הזה — מראים את התנועה</div>
          ) : null}
        </div>
      ) : null}

      {phase === "match" ? (
        <div style={{ animation: "pnIdIn .35s ease both", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginTop: 10 }}>
            <Thumb uri={idUri} label="התעודה" />
            <div style={{ width: 70, height: 3, background: "rgba(255,255,255,.12)", position: "relative" }}>
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, background: GREEN, animation: "pnIdLink .7s .2s ease both" }} />
            </div>
            <Thumb uri={selfie} label="עכשיו" round />
          </div>
          <div style={{ margin: "18px auto 0", width: 64, height: 64, borderRadius: 32, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: scale.title, fontWeight: 900, color: "#fff", animation: "pnIdPop .5s .8s ease both" }}>✓</div>
          <div style={{ fontSize: scale.section, fontWeight: 900, marginTop: 12, animation: "pnIdIn .3s 1s ease both" }}>הפנים תואמות לתעודה</div>
          <div style={{ fontSize: scale.meta, color: "rgba(247,243,250,.72)", marginTop: 4, animation: "pnIdIn .3s 1.1s ease both" }}>הזהות אומתה. ממשיכים.</div>
        </div>
      ) : null}

      <div style={{ fontSize: scale.micro, color: "rgba(247,243,250,.45)", textAlign: "center", marginTop: 18 }}>זיהוי הפנים רץ בטלפון עצמו · ההתאמה לתעודה בהדגמה מדומה · שום תמונה לא יוצאת מהטלפון</div>
    </div>
  );
}

function Thumb({ uri, label, round = false }: { uri: string | null; label: string; round?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ width: round ? 86 : 110, height: round ? 86 : 70, borderRadius: round ? 43 : 10, overflow: "hidden", background: "rgba(255,255,255,.08)", border: `2px solid ${GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: scale.title }}>
        {uri ? <img src={uri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "☺"}
      </div>
      <span style={{ fontSize: scale.micro, fontWeight: 800, color: "rgba(247,243,250,.75)" }}>{label}</span>
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "block",
  margin: "22px auto 0",
  minHeight: 54,
  padding: "0 34px",
  borderRadius: 27,
  border: "none",
  background: CORAL,
  color: "#fff",
  fontSize: scale.body,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
};
