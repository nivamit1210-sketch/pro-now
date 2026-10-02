/**
 * The welcome screen's picture: our street of shops, alive.
 *
 * Ported 1:1 from the demo (tools/design-preview/src/App.tsx `WelcomeScene`,
 * Amit 2026-10-01): the twelve shops, each with its professional in the
 * doorway (one strip, `clips/welcome_street.webp`), pass slowly along the
 * pavement over the evening city by the sea. The intro's "a whole city"
 * slide shows the same street. Nobody bobs or floats: the street moves,
 * the people stay at their doors.
 */
import { useEffect, useState } from "react";

const STRIP = "/clips/welcome_street.webp";
const WELCOME_CSS =
  "@keyframes pnParade{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes pnCity{0%{transform:scale(1.04)}100%{transform:scale(1.12) translateX(-3%)}}";

/** True once every url has loaded or failed, or after 2.5 s at the latest. */
export function useAllLoaded(urls: readonly string[]): boolean {
  const [ready, setReady] = useState(false);
  const key = urls.join("|");
  useEffect(() => {
    let left = urls.length;
    let live = true;
    const done = () => {
      if (live && --left <= 0) setReady(true);
    };
    for (const u of key.split("|")) {
      const im = new window.Image();
      im.onload = done;
      im.onerror = done;
      im.src = u;
    }
    const t = setTimeout(() => live && setReady(true), 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return ready;
}

export function WelcomeScene() {
  /* Shown only once the strip has arrived, then faded in, so it never
     appears in pieces as it loads. */
  const ready = useAllLoaded([STRIP]);
  const strip = { height: "100%", display: "block", filter: "drop-shadow(0 14px 18px rgba(0,0,0,.45))" } as const;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2a1838" }}>
      <style>{WELCOME_CSS}</style>
      <img src="/world/splash_city.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 40%", opacity: 0.85, animation: "pnCity 30s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(23,14,36,.15) 0%, rgba(23,14,36,.35) 40%, rgba(15,10,22,.92) 62%, #0f0a16 100%)" }} />
      {/* the pavement the shops stand on */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "38%", height: "8%", background: "linear-gradient(180deg, rgba(255,170,110,.22), rgba(42,24,56,0))" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "9%", height: "31%", overflow: "hidden" }}>
        <div style={{ display: "flex", height: "100%", width: "max-content", animation: "pnParade 90s linear infinite", willChange: "transform", opacity: ready ? 1 : 0, transition: "opacity .9s ease-out" }}>
          <img src={STRIP} alt="" style={strip} />
          <img src={STRIP} alt="" style={strip} />
        </div>
      </div>
    </div>
  );
}
