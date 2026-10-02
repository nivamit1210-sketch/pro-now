import { errorFingerprint, scrubText } from "@pro-now/types";
import type { AlertNotifier } from "../infra/alerts/alert-notifier.js";
import { AlertThrottle } from "./alert-throttle.js";
import type { ErrorReporter } from "./error-reporter.js";

/**
 * One place every error worth waking somebody for goes through
 * (docs/16-DEPLOYMENT.md §Observability): kept in the error store, grouped, throttled,
 * scrubbed and sent to the phone. Reporting never throws — a broken alert
 * path must not turn one failure into two.
 */
export type IncidentSource = "api" | "web" | "process";

export interface Incident {
  source: IncidentSource;
  error: unknown;
  /** What failed, in words, when the error alone does not say (e.g. "uncaughtException"). */
  kind?: string;
  requestId?: string;
  method?: string;
  route?: string;
  userId?: string;
  /** A web page path (never its query). */
  path?: string;
  userAgent?: string;
  release?: string;
  /** Already stored by the browser; the server only announces it. */
  eventId?: string;
}

export interface MonitorOptions {
  reporter: ErrorReporter;
  notifier: AlertNotifier;
  environment: string;
  release?: string;
  /** e.g. https://pro-now.sentry.io */
  sentryOrgUrl?: string;
  throttleWindowMs: number;
  maxPerHour: number;
  log: { warn: (obj: object, msg: string) => void };
  now?: () => number;
}

export interface Monitor {
  report(incident: Incident): { eventId?: string };
  /**
   * Tells ops something that is not an error, e.g. a customer's safety
   * report (audit v2 #8b). Not grouped and not throttled: each one is a
   * person asking for a person, and the route that calls it caps how often.
   * Never throws, and `settle`/`flush` wait for it like any alert.
   */
  announce(html: string): void;
  /** Resolves when every alert already queued has been sent or has failed. */
  settle(): Promise<void>;
  flush(timeoutMs: number): Promise<void>;
  dispose(): void;
}

interface Normalised {
  name: string;
  message: string;
  stack?: string;
}

function normalise(error: unknown): Normalised {
  if (error instanceof Error) return { name: error.name, message: error.message || "(no message)", stack: error.stack };
  if (typeof error === "object" && error !== null && "message" in error) {
    const e = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof e.name === "string" ? e.name : "Error",
      message: String(e.message),
      stack: typeof e.stack === "string" ? e.stack : undefined,
    };
  }
  return { name: "NonError", message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error) };
}

export const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const ICON: Record<IncidentSource, string> = { api: "🔴", web: "🟠", process: "💥" };

function stackLines(stack: string | undefined, max: number): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") || /@/.test(l))
    .filter((l) => !l.includes("node_modules") && !l.includes("node:internal"))
    .slice(0, max)
    .map((l) => l.slice(0, 160));
}

export function formatIncident(
  incident: Incident,
  error: Normalised,
  opts: { environment: string; release?: string; eventId?: string; sentryOrgUrl?: string; droppedBefore: number }
): string {
  const lines: string[] = [];
  lines.push(`${ICON[incident.source]} <b>PRO NOW · ${escapeHtml(opts.environment)}</b> · ${incident.source}${incident.kind ? ` · ${escapeHtml(incident.kind)}` : ""}`);
  lines.push(`<b>${escapeHtml(error.name.slice(0, 80))}</b>: ${escapeHtml(scrubText(error.message).slice(0, 400))}`);
  if (incident.route) lines.push(`<code>${escapeHtml(`${incident.method ?? ""} ${incident.route}`.trim())}</code>`);
  if (incident.path) lines.push(`page <code>${escapeHtml(scrubText(incident.path).slice(0, 200))}</code>`);
  const ids: string[] = [];
  if (incident.requestId) ids.push(`req <code>${escapeHtml(incident.requestId)}</code>`);
  if (incident.userId) ids.push(`user <code>${escapeHtml(incident.userId)}</code>`);
  const release = incident.release ?? opts.release;
  if (release) ids.push(`rel <code>${escapeHtml(release.slice(0, 7))}</code>`);
  if (ids.length) lines.push(ids.join(" · "));
  if (incident.userAgent) lines.push(`<i>${escapeHtml(incident.userAgent.slice(0, 160))}</i>`);
  const frames = stackLines(error.stack, 4);
  if (frames.length) lines.push(`<pre>${escapeHtml(scrubText(frames.join("\n")))}</pre>`);
  if (opts.eventId) {
    lines.push(
      opts.sentryOrgUrl
        ? `🔎 <a href="${escapeHtml(`${opts.sentryOrgUrl.replace(/\/$/, "")}/issues/?query=${opts.eventId}`)}">Sentry</a> <code>${opts.eventId}</code>`
        : `🔎 Sentry event <code>${opts.eventId}</code>`
    );
  }
  if (opts.droppedBefore > 0) lines.push(`⚠️ ${opts.droppedBefore} earlier alert(s) were dropped by the hourly cap.`);
  return lines.join("\n");
}

export function createMonitor(opts: MonitorOptions): Monitor {
  const inflight = new Set<Promise<void>>();

  const send = (html: string) => {
    const p = opts.notifier
      .send(html)
      .catch((err: unknown) => opts.log.warn({ err: normalise(err).message, notifier: opts.notifier.name }, "Alert could not be sent"))
      .finally(() => inflight.delete(p));
    inflight.add(p);
  };

  const windowMinutes = Math.round(opts.throttleWindowMs / 60000);
  const throttle = new AlertThrottle({
    windowMs: opts.throttleWindowMs,
    maxPerHour: opts.maxPerHour,
    now: opts.now,
    onSummary: (_fp, repeats, title) => {
      const slot = throttle.admit();
      if (!slot.send) return;
      send(`🔁 ${title}\n×${repeats} more in the last ${windowMinutes} min`);
    },
  });

  return {
    report(incident) {
      try {
        const error = normalise(incident.error);
        const eventId =
          incident.eventId ??
          (incident.source === "web"
            ? undefined
            : opts.reporter.capture(incident.error, {
                source: incident.source,
                requestId: incident.requestId,
                method: incident.method,
                route: incident.route,
                userId: incident.userId,
              }));

        const fingerprint = errorFingerprint({ source: incident.source, name: error.name, message: error.message, stack: error.stack });
        const title = `${ICON[incident.source]} <b>${escapeHtml(error.name.slice(0, 80))}</b>: ${escapeHtml(scrubText(error.message).slice(0, 160))}`;
        const decision = throttle.hit(fingerprint, title);
        if (decision.send) {
          send(
            formatIncident(incident, error, {
              environment: opts.environment,
              release: opts.release,
              eventId,
              sentryOrgUrl: opts.sentryOrgUrl,
              droppedBefore: decision.droppedBefore,
            })
          );
        }
        return { eventId };
      } catch (err) {
        opts.log.warn({ err: normalise(err).message }, "Error reporting failed");
        return {};
      }
    },
    announce(html) {
      try {
        send(html);
      } catch (err) {
        opts.log.warn({ err: normalise(err).message }, "Announcement failed");
      }
    },
    async settle() {
      await Promise.all([...inflight]);
    },
    async flush(timeoutMs) {
      await Promise.race([
        Promise.all([this.settle(), opts.reporter.flush(timeoutMs)]),
        new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
      ]);
    },
    dispose() {
      throttle.dispose();
    },
  };
}
