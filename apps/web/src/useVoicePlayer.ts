import { useEffect, useRef, useState } from "react";

/**
 * Plays one recorded voice note (a quote's, ordered for someone else): its
 * length from the file itself, and play/stop on the same control. Null
 * without a URL.
 */
export function useVoicePlayer(url: string | null): { seconds: number; playing: boolean; onTogglePlay: () => void } | null {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    a.preload = "metadata";
    audio.current = a;
    const length = () => {
      if (Number.isFinite(a.duration)) setSeconds(Math.round(a.duration));
    };
    const stopped = () => setPlaying(false);
    a.addEventListener("loadedmetadata", length);
    a.addEventListener("durationchange", length);
    a.addEventListener("ended", stopped);
    a.addEventListener("pause", stopped);
    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", length);
      a.removeEventListener("durationchange", length);
      a.removeEventListener("ended", stopped);
      a.removeEventListener("pause", stopped);
      audio.current = null;
    };
  }, [url]);
  if (!url) return null;
  return {
    seconds,
    playing,
    onTogglePlay: () => {
      const a = audio.current;
      if (!a) return;
      if (playing) {
        a.pause();
        return;
      }
      a.currentTime = 0;
      void a.play().then(() => setPlaying(true), () => setPlaying(false));
    },
  };
}
