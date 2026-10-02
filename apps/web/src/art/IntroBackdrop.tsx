/**
 * The pictures behind the intro slides, ported 1:1 from the demo
 * (tools/design-preview/src/App.tsx `IntroBackdrop` and the scenes it
 * draws). The two cards are illustrations and say so ("דוגמה"): no real
 * person, no rating, no invented supply.
 */
import { scale } from "@pro-now/ui";
import { WelcomeScene } from "./WelcomeScene";

/* The evening city in both modes, as in the demo (CITY_BG): the daytime
   render was the foggy one (Amit's UX audit). */
const cityBg = () => ({ src: "/world/splash_city.webp", pos: "64% 50%" });

export function IntroBackdrop({ slide, side = "customer" }: { slide: number; side?: "customer" | "pro" }) {
  if (side === "pro") {
    if (slide === 1) return <ProsLineup />;
    /* Amit, 2026-09-30: "See the job before you accept" showed the hair
       salon and "the prices are yours" showed the street; each now shows
       what it says (demo 19d78e1, docs/DEMO-SYNC.md, 2026-10-01 P1). */
    if (slide === 2) return <ProOfferScene />;
    if (slide === 3) return <ProPricesScene />;
    /* "הרחוב הזה הוא גם שלך": the same living street of shops. */
    return <WelcomeScene />;
  }
  if (slide === 1) return <AvatarsLineup />;
  if (slide === 2) return <ProsLineup />;
  if (slide === 3) return <TrustCard />;
  if (slide === 4) return <FamilyScene />;
  /* "A whole city": our street of shops with their professionals, alive. */
  return <WelcomeScene />;
}

function AvatarsLineup() {
  const ids = ["01", "06", "02", "09", "03", "07", "04", "11", "05", "08", "12", "10"];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src="/clips/show_salon_in.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, filter: "blur(2px)" }} />
      <div style={{ position: "absolute", left: "6%", right: "6%", top: "8%", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {ids.map((id) => (
          <img key={id} src={`/world/avatar_${id}_portrait.webp`} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 18, background: "rgba(255,255,255,.06)", boxShadow: "0 8px 20px rgba(0,0,0,.45)" }} />
        ))}
      </div>
    </div>
  );
}
const PRO_LINEUP = ["home", "hair", "auto", "care", "tech", "pets", "appliance", "well", "move"] as const;
function ProsLineup() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src="/clips/show_salon_side.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, filter: "blur(2px)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "9%", height: "50%", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: "0 2px", padding: "0 6px" }}>
        {PRO_LINEUP.map((id, i) => (
          <img
            key={id}
            src={`/world/character_${id}_world.webp`}
            alt=""
            style={{ height: i < 4 ? "46%" : "50%", marginTop: i < 4 ? 0 : -18, filter: "drop-shadow(0 10px 14px rgba(0,0,0,.55))" }}
          />
        ))}
      </div>
    </div>
  );
}
function TrustCard() {
  const row = (t: string) => (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 8, color: "#F7F3FA", fontSize: scale.meta, lineHeight: "20px" }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: "#2FBF8A", color: "#0d0a16", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: scale.meta, fontWeight: 800, flex: "0 0 auto" }}>✓</span>
      <span style={{ textAlign: "right" }}>{t}</span>
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src={cityBg().src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: cityBg().pos, opacity: 0.25, filter: "blur(3px)" }} />
      <div style={{ position: "absolute", left: "7%", right: "7%", top: "7%", borderRadius: 22, padding: "16px 16px 18px", background: "rgba(23,18,31,.82)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", direction: "rtl" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <img src="/world/character_home_world.webp" alt="" style={{ height: 150, filter: "drop-shadow(0 8px 12px rgba(0,0,0,.5))" }} />
          <div style={{ flex: 1, paddingBottom: 8 }}>
            <div style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>יוסי · אינסטלציה</div>
            <div style={{ color: "rgba(247,243,250,.62)", fontSize: scale.micro, marginTop: 2 }}>דוגמה לכרטיס מקצוען</div>
            <div style={{ display: "inline-block", marginTop: 8, padding: "4px 10px", borderRadius: 999, background: "rgba(47,191,138,.16)", color: "#7FE3BC", fontSize: scale.micro, fontWeight: 700 }}>מאומת ב-PRO NOW</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
          {row("זהות אומתה")}
          {row("תעודות נבדקו לסוג העבודה הזאת")}
          {row("מאושר לשירות שביקשתם")}
          {row("רואים מתי יגיע — לפני שמאשרים")}
          {row("המחיר מוצג לפני שמתחילים לעבוד")}
        </div>
      </div>
    </div>
  );
}

function FamilyScene() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src="/clips/kitchen.jpg" alt="" style={{ position: "absolute", left: 0, right: 0, top: "6%", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%", filter: "saturate(1.08)" }} />
      <div style={{ position: "absolute", left: "22%", right: "5%", top: "5%", borderRadius: 18, padding: "12px 14px", background: "rgba(23,18,31,.9)", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 16px 40px rgba(0,0,0,.55)", direction: "rtl" }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#F7F3FA", fontSize: scale.meta, fontWeight: 800 }}>הצעת מחיר התקבלה</span>
          <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
        </div>
        <div style={{ color: "rgba(247,243,250,.8)", fontSize: scale.meta, marginTop: 4 }}>אצל סבא וסבתא · יוסי, אינסטלציה</div>
        {/* The same amount the demo quote carries elsewhere (₪250), marked
            as an example — a line the way a real quote lists it. */}
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,.06)", display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#F7F3FA", fontSize: scale.meta }}>
            <span>החלפת אטם בברז המטבח</span><span>₪250</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#F7F3FA", fontSize: scale.meta, fontWeight: 800, borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 4 }}>
            <span>סה״כ לאישור</span><span>₪250</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12, background: "#FF6B4A", color: "#1a0f0c", fontWeight: 800, fontSize: scale.meta }}>אישור · ₪250</span>
          <span style={{ flex: "0 0 34%", textAlign: "center", padding: "8px 0", borderRadius: 12, background: "rgba(255,255,255,.1)", color: "#F7F3FA", fontSize: scale.meta }}>שאלה</span>
        </div>
      </div>
    </div>
  );
}

/*
 * THE PROFESSIONAL'S TWO EXAMPLES — a job arriving and his own price list,
 * marked "דוגמה". The demo's own example figures (the leak job 2.4 km and 9
 * minutes away, the ₪250 tap washer, the ₪179 visit). No commission and no
 * payout split: that is a decision still to be made (docs/18), so the job
 * shows the price from his list and nothing taken from it.
 */
function ProExampleStage({ children }: { children: React.ReactNode }) {
  const bg = cityBg();
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 70% at 50% 28%, #6a3f73 0%, #2a1838 55%, #120c18 90%)" }}>
      <img src={bg.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: bg.pos, opacity: 0.25, filter: "blur(3px)" }} />
      <div style={{ position: "absolute", left: "7%", right: "7%", top: "6%", borderRadius: 22, padding: "16px 16px 18px", background: "rgba(23,18,31,.86)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", direction: "rtl" }}>
        {children}
      </div>
    </div>
  );
}

const exRow = (a: string, b: string, strong = false) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#F7F3FA", fontSize: scale.meta, lineHeight: "20px", fontWeight: strong ? 800 : 400 }}>
    <span>{a}</span>
    <span style={{ flex: "0 0 auto" }}>{b}</span>
  </div>
);

function ProOfferScene() {
  return (
    <ProExampleStage>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,107,74,.18)", color: "#FF9A80", fontSize: scale.micro, fontWeight: 800 }}>קריאה חדשה</span>
        <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
      </div>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1, paddingBottom: 6 }}>
          <div style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>החלפת אטם בברז</div>
          <div style={{ color: "rgba(247,243,250,.7)", fontSize: scale.meta, marginTop: 4 }}>רמת אביב · 2.4 ק״מ ממך · 9 דק׳ נסיעה</div>
          <div style={{ color: "rgba(247,243,250,.7)", fontSize: scale.meta, marginTop: 2 }}>קומה 4, יש מעלית · 2 תמונות מהלקוח</div>
        </div>
        <img src="/world/character_home_world.webp" alt="" style={{ height: 120, filter: "drop-shadow(0 8px 12px rgba(0,0,0,.5))" }} />
      </div>
      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.06)", display: "grid", gap: 4 }}>
        {exRow("לפי המחירון שלך", "₪250", true)}
        <div style={{ color: "rgba(247,243,250,.6)", fontSize: scale.micro }}>הסכום ידוע לפני שאתה מקבל</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <span style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 12, background: "#FF6B4A", color: "#1a0f0c", fontWeight: 800, fontSize: scale.meta }}>קבלת העבודה</span>
        <span style={{ flex: "0 0 30%", textAlign: "center", padding: "9px 0", borderRadius: 12, background: "rgba(255,255,255,.1)", color: "#F7F3FA", fontSize: scale.meta }}>דילוג</span>
      </div>
    </ProExampleStage>
  );
}

function ProPricesScene() {
  const chip = (t: string, on: boolean) => (
    <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: scale.micro, fontWeight: 700, background: on ? "rgba(47,191,138,.18)" : "rgba(255,255,255,.08)", color: on ? "#7FE3BC" : "rgba(247,243,250,.7)" }}>{t}</span>
  );
  return (
    <ProExampleStage>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#F7F3FA", fontSize: scale.body, fontWeight: 800 }}>המחירון שלי</span>
        <span style={{ color: "rgba(247,243,250,.55)", fontSize: scale.micro }}>דוגמה</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {chip("ביקור ואבחון", true)}
        {chip("מחיר קבוע", true)}
        {chip("לשעה", false)}
      </div>
      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.06)", display: "grid", gap: 7 }}>
        {exRow("ביקור ואבחון · נזילה", "₪179")}
        {exRow("החלפת אטם בברז", "₪250")}
        <div style={{ color: "#FF9A80", fontSize: scale.meta, fontWeight: 700 }}>+ עבודה שלא ברשימה</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", color: "#F7F3FA", fontSize: scale.meta }}>
        <span>תוספת לילה ושבת</span>
        <span style={{ width: 40, height: 24, borderRadius: 12, background: "#2FBF8A", position: "relative", display: "inline-block" }}>
          <span style={{ position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: 9, background: "#fff" }} />
        </span>
      </div>
      <div style={{ color: "rgba(247,243,250,.6)", fontSize: scale.micro, marginTop: 10 }}>הלקוח רואה את המחיר שלך לפני שהוא מזמין</div>
    </ProExampleStage>
  );
}
