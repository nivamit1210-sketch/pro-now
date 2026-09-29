import { useEffect, useRef } from "react";

/**
 * The job's live channel (docs/06 §WebSocket, docs/21 W6).
 *
 * The socket says only that the job changed; `onChange` re-reads it over
 * REST, which is the one source of truth. It reconnects with backoff, and
 * every (re)connect starts with the server's `READY`, which also triggers
 * a re-read, so nothing that happened while it was down is missed.
 */
const PING_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;

export function useJobSocket(jobId: string | undefined, onChange: () => void, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!jobId || !enabled || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1/ws/jobs/${encodeURIComponent(jobId)}`;
      socket = new WebSocket(url);
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type?: string };
          if (msg.type === "READY" || msg.type === "JOB_EVENT") onChangeRef.current();
          if (msg.type === "READY") attempt = 0;
        } catch {
          // Not ours to interpret; the periodic re-read covers anything lost.
        }
      };
      socket.onopen = () => {
        ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), PING_MS);
      };
      socket.onclose = (e) => {
        clearInterval(ping);
        // 4401/4404: not signed in, or not this person's job. Retrying changes nothing.
        if (closed || e.code === 4401 || e.code === 4404) return;
        const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++);
        retry = setTimeout(connect, wait);
      };
    };

    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      socket?.close();
    };
  }, [jobId, enabled]);
}
