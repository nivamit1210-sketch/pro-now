import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { ConnectionBanner, customerDarkTheme, customerTheme, type ConnectionState } from "@pro-now/ui";

import { queryClient } from "./api";
import { useKeyboardCover } from "./keyboard";

/**
 * The app frame, as in the demo (tools/design-preview/src/App.tsx `App`):
 * the whole screen on a phone, a phone-wide column (at most 430px) centred
 * on a laptop, with the connection banner laid out above the screen rather
 * than over it. Every screen reads its size from here.
 */
/** `typing`: the on-screen keyboard is up, so the screen is the strip above it (keyboard.ts). */
const FrameContext = createContext({ width: 390, height: 780, typing: false });

export const useFrame = () => useContext(FrameContext);

/** The frame for whatever sits under a bar the caller draws: same width, the height left. */
export function SubFrame({ height, children }: { height: number; children: ReactNode }) {
  const { width, typing } = useFrame();
  return (
    <FrameContext.Provider value={{ width, height, typing }}>
      <View style={{ width, height, overflow: "hidden" }}>{children}</View>
    </FrameContext.Provider>
  );
}

/**
 * The browser's own online/offline events, as the demo reads them
 * (`useConnection`). Coming back online shows "reconnecting" while every
 * query refetches, so what is on screen is fresh again, not merely
 * reachable.
 */
function useConnection(): [ConnectionState, () => void] {
  const [state, setState] = useState<ConnectionState>(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"
  );
  const refresh = useCallback(async () => {
    setState("reconnecting");
    await queryClient.refetchQueries({ type: "active" }).catch(() => undefined);
    setState(navigator.onLine ? "online" : "offline");
  }, []);
  useEffect(() => {
    const goOffline = () => setState("offline");
    const goOnline = () => void refresh();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [refresh]);
  return [state, refresh];
}

export function Frame({ children }: { children: ReactNode }) {
  const { width, height: windowH } = useWindowDimensions();
  /*
   * THE HEIGHT THE PAGE ACTUALLY GIVES US, NOT THE WINDOW'S.
   *
   * The body is padded by the safe-area insets (the iPhone's status bar and
   * home indicator), so the space inside it is the window minus those. Sized
   * to the window, every screen ran one status bar past the bottom: the page
   * scrolled, and the bottom row — "ביטול הקריאה" on the search — sat off the
   * screen (Dvir, 2026-09-30). Measured from the root, so the insets are
   * whatever the device says they are. The window's height is only the first
   * frame's guess.
   */
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  /*
   * With the keyboard up, the app ends where the keyboard begins. The
   * keyboard also covers the bottom safe-area padding, which is not the
   * app's to give back, so that is added back before subtracting.
   */
  const keyboard = useKeyboardCover();
  const typing = keyboard > 0;
  /*
   * The field stays in sight. The screen shrinks to the strip above the
   * keyboard after the field was focused, so whatever scrolled it into view
   * then measured the old, taller screen; once the strip is laid out, the
   * focused field is brought into it.
   */
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el !== document.body) el.scrollIntoView({ block: "nearest" });
    }, 60);
    return () => clearTimeout(t);
  }, [typing]);
  const bottomPad = keyboard > 0 ? safeAreaBottom() : 0;
  const pageH = measuredH ?? windowH;
  const height = keyboard > 0 ? Math.max(200, pageH + bottomPad - keyboard) : pageH;
  const w = Math.min(430, width);
  const [connection, retry] = useConnection();
  const [bannerH, setBannerH] = useState(0);
  useEffect(() => {
    if (connection === "online") setBannerH(0);
  }, [connection]);

  return (
    <FrameContext.Provider value={{ width: w, height: height - bannerH, typing }}>
      <View
        style={[styles.root, { backgroundColor: customerDarkTheme.colors.bg }]}
        onLayout={(e) => setMeasuredH(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={{ width: w, height, overflow: "hidden" }}>
          <View onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}>
            <ConnectionBanner state={connection} colors={customerTheme.colors} onRetry={retry} />
          </View>
          <View style={{ height: height - bannerH, overflow: "hidden" }}>{children}</View>
        </View>
      </View>
    </FrameContext.Provider>
  );
}

/** The body's bottom padding, i.e. the home-indicator inset (index.html). */
function safeAreaBottom(): number {
  if (typeof document === "undefined") return 0;
  return parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
}

const styles = StyleSheet.create({
  // Fills #root, which fills the body's padded box; see `measuredH`.
  root: { height: "100%", overflow: "hidden", alignItems: "center", justifyContent: "flex-start" },
});
