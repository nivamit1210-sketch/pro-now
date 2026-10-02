/**
 * The street behind the top of the home screen, and the day/night rule
 * (06:00–18:00 by day) the other backdrops still follow. Ported from the
 * demo (tools/design-preview/src/App.tsx `CityHero`, src/daylight.ts).
 */
export function isDaytime(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= 6 && h < 18;
}

const CITY_HERO_CSS = "@keyframes pnCity{0%{transform:scale(1.02) translateX(0)}100%{transform:scale(1.12) translateX(-3%)}}";

/**
 * THE EVENING CITY, AT EVERY HOUR. The demo's `CITY_BG` shows the evening
 * render by day too: "the daytime render was the foggy one" (its UX audit).
 */
const CITY_HERO_BG = { src: "/world/splash_city.webp", pos: "64% 50%" } as const;

export function CityHero({ lift = 0 }: { lift?: number }) {
  const bg = CITY_HERO_BG;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{CITY_HERO_CSS}</style>
      <img
        src={bg.src}
        alt=""
        style={{
          position: "absolute", left: 0, right: 0, top: `${-lift}%`, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: bg.pos, filter: "brightness(1.1) saturate(1.12)",
          animation: "pnCity 22s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}

/** Each department's shop in our street (the demo's `DEPT_SHOP`). */
const DEPT_SHOP: Readonly<Record<string, string>> = {
  HOME_URGENT: "home", APPLIANCES: "appliance", HOME_CARE: "care", BEAUTY: "hair", WELLNESS: "well",
  PETS: "pets", VEHICLE: "auto", LOGISTICS: "move", TECH: "tech", ODD_JOBS: "help", IMPROVEMENT: "build",
};

/**
 * A trade's page in front of its own shop (the demo's `TradeBackdrop`,
 * docs/DEMO-SYNC.md, 2026-10-01 C2): the city, dimmer and drifting, with the
 * trade's shop from our street over it. The demo draws hair and home open
 * with their professional in the door; the product has only the street
 * fronts, so it uses those.
 */
export function TradeBackdrop({ department }: { department: string | null }) {
  const shop = (department && DEPT_SHOP[department]) || "home";
  const bg = isDaytime()
    ? { src: "/world/splash_city_day.webp", pos: "50% 40%" }
    : { src: "/world/splash_city.webp", pos: "64% 40%" };
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{CITY_HERO_CSS}</style>
      <img
        src={bg.src}
        alt=""
        style={{
          position: "absolute", inset: 0, width: "100%", height: "60%", objectFit: "cover",
          objectPosition: bg.pos, opacity: 0.7, animation: "pnCity 24s ease-in-out infinite alternate",
        }}
      />
      <img
        src={`/world/m/shop_${shop}.webp`}
        alt=""
        style={{
          position: "absolute", left: "-2%", top: "7%", width: "46%", height: "25%", objectFit: "contain",
          objectPosition: "left bottom", filter: "drop-shadow(0 18px 30px rgba(0,0,0,.55))",
        }}
      />
    </div>
  );
}
