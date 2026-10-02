import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAlertsConfigured, loadEnv } from "@pro-now/config";
import { createTelegramAlertNotifier } from "../src/infra/alerts/telegram.js";
import { AlertThrottle } from "../src/observability/alert-throttle.js";
import { createMonitor, type Incident } from "../src/observability/monitor.js";
import { noopErrorReporter, scrubSentryEvent, type ErrorReporter } from "../src/observability/error-reporter.js";
import type { AlertNotifier } from "../src/infra/alerts/alert-notifier.js";
import clientErrorsRoutes from "../src/routes/client-errors.js";

const MIN = 60_000;

describe("Telegram alert notifier", () => {
  it("sends HTML to the configured chat", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    await createTelegramAlertNotifier("123:ABC", "42", fetchImpl).send("<b>hi</b>");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(init!.body as string)).toEqual({
      chat_id: "42",
      text: "<b>hi</b>",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  it("never repeats the bot token in its error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad token 123:ABC", { status: 401 }));
    const failure = createTelegramAlertNotifier("123:ABC", "42", fetchImpl).send("x");
    await expect(failure).rejects.toThrow("Telegram sendMessage failed (401): bad token [REDACTED]");
  });
});

describe("AlertThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces the first occurrence and summarises the repeats when the window closes", () => {
    const onSummary = vi.fn();
    const t = new AlertThrottle({ windowMs: 10 * MIN, maxPerHour: 100, onSummary });

    expect(t.hit("fp", "boom").send).toBe(true);
    expect(t.hit("fp", "boom").send).toBe(false);
    expect(t.hit("fp", "boom").send).toBe(false);
    expect(onSummary).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10 * MIN);
    expect(onSummary).toHaveBeenCalledWith("fp", 2, "boom");
    // A new window: the next occurrence is announced again.
    expect(t.hit("fp", "boom").send).toBe(true);
  });

  it("sends no summary for an error that happened once", () => {
    const onSummary = vi.fn();
    const t = new AlertThrottle({ windowMs: 10 * MIN, maxPerHour: 100, onSummary });
    t.hit("fp", "boom");
    vi.advanceTimersByTime(10 * MIN);
    expect(onSummary).not.toHaveBeenCalled();
  });

  it("caps a storm of different errors per hour and reports what it dropped", () => {
    const t = new AlertThrottle({ windowMs: 10 * MIN, maxPerHour: 2, onSummary: () => {} });
    expect(t.hit("a", "a")).toEqual({ send: true, droppedBefore: 0 });
    expect(t.hit("b", "b")).toEqual({ send: true, droppedBefore: 0 });
    expect(t.hit("c", "c")).toEqual({ send: false });
    expect(t.hit("d", "d")).toEqual({ send: false });

    vi.advanceTimersByTime(61 * MIN);
    expect(t.hit("e", "e")).toEqual({ send: true, droppedBefore: 2 });
  });
});

function harness(overrides: { reporter?: ErrorReporter; notifier?: AlertNotifier } = {}) {
  const sent: string[] = [];
  const notifier: AlertNotifier = overrides.notifier ?? { name: "memory", send: async (html) => void sent.push(html) };
  const warn = vi.fn();
  const monitor = createMonitor({
    reporter: overrides.reporter ?? noopErrorReporter,
    notifier,
    environment: "production",
    release: "abcdef1234567",
    sentryOrgUrl: "https://pro-now.sentry.io",
    throttleWindowMs: 10 * MIN,
    maxPerHour: 30,
    log: { warn },
  });
  return { monitor, sent, warn };
}

describe("Monitor", () => {
  const apiIncident: Incident = {
    source: "api",
    error: Object.assign(new Error("No quote for dana@example.com <script>"), {
      stack: "Error: No quote\n    at approve (/app/src/routes/quotes.ts:40:11)\n    at x (/app/node_modules/fastify/lib/a.js:1:1)",
    }),
    requestId: "req-7",
    method: "POST",
    route: "/api/v1/quotes/:id/approve",
    userId: "user_1",
  };

  it("stores an API error and sends one scrubbed, escaped alert that links to it", async () => {
    const capture = vi.fn().mockReturnValue("0123456789abcdef0123456789abcdef");
    const { monitor, sent } = harness({ reporter: { name: "fake", capture, flush: async () => {} } });

    expect(monitor.report(apiIncident)).toEqual({ eventId: "0123456789abcdef0123456789abcdef" });
    await monitor.settle();

    expect(capture).toHaveBeenCalledWith(apiIncident.error, {
      source: "api",
      requestId: "req-7",
      method: "POST",
      route: "/api/v1/quotes/:id/approve",
      userId: "user_1",
    });
    expect(sent).toHaveLength(1);
    const msg = sent[0]!;
    expect(msg).toContain("PRO NOW · production");
    expect(msg).toContain("No quote for [email] &lt;script&gt;");
    expect(msg).not.toContain("dana@example.com");
    expect(msg).toContain("<code>POST /api/v1/quotes/:id/approve</code>");
    expect(msg).toContain("req <code>req-7</code>");
    expect(msg).toContain("rel <code>abcdef1</code>");
    expect(msg).toContain("at approve (/app/src/routes/quotes.ts:40:11)");
    expect(msg).not.toContain("node_modules");
    expect(msg).toContain('href="https://pro-now.sentry.io/issues/?query=0123456789abcdef0123456789abcdef"');
    monitor.dispose();
  });

  it("does not store a web error twice: the browser already sent it to Sentry", async () => {
    const capture = vi.fn();
    const { monitor, sent } = harness({ reporter: { name: "fake", capture, flush: async () => {} } });
    monitor.report({ source: "web", error: { name: "TypeError", message: "x is undefined" }, eventId: "f".repeat(32), path: "/addresses" });
    await monitor.settle();
    expect(capture).not.toHaveBeenCalled();
    expect(sent[0]).toContain("page <code>/addresses</code>");
    expect(sent[0]).toContain("f".repeat(32));
    monitor.dispose();
  });

  it("sends one alert for a burst of the same bug", async () => {
    const { monitor, sent } = harness();
    for (let i = 0; i < 50; i++) monitor.report({ ...apiIncident, requestId: `req-${i}` });
    await monitor.settle();
    expect(sent).toHaveLength(1);
    monitor.dispose();
  });

  it("survives a notifier that fails, and logs it", async () => {
    const { monitor, warn } = harness({ notifier: { name: "broken", send: () => Promise.reject(new Error("network down")) } });
    expect(() => monitor.report(apiIncident)).not.toThrow();
    await monitor.settle();
    expect(warn).toHaveBeenCalledWith({ err: "network down", notifier: "broken" }, "Alert could not be sent");
    monitor.dispose();
  });

  it("announces a non-error to ops every time: no grouping, no throttle (audit v2 #8b)", async () => {
    const { monitor, sent } = harness();
    for (let i = 0; i < 40; i++) monitor.announce("🛡️ <b>safety</b>");
    await monitor.settle();
    expect(sent).toHaveLength(40);
    monitor.dispose();
  });

  it("an announcement survives a notifier that fails, and logs it", async () => {
    const { monitor, warn } = harness({ notifier: { name: "broken", send: () => Promise.reject(new Error("network down")) } });
    expect(() => monitor.announce("x")).not.toThrow();
    await monitor.settle();
    expect(warn).toHaveBeenCalledWith({ err: "network down", notifier: "broken" }, "Alert could not be sent");
    monitor.dispose();
  });

  it("reports things that are not Errors", async () => {
    const { monitor, sent } = harness();
    monitor.report({ source: "process", kind: "unhandledRejection", error: "plain string reason" });
    await monitor.settle();
    expect(sent[0]).toContain("process · unhandledRejection");
    expect(sent[0]).toContain("<b>NonError</b>: plain string reason");
    monitor.dispose();
  });
});

describe("scrubSentryEvent", () => {
  it("removes cookies, bodies, query strings and auth headers, and reduces the user to an id", () => {
    const event = scrubSentryEvent({
      message: "failed for dana@example.com",
      exception: { values: [{ value: "phone 0521234567" }] },
      breadcrumbs: [{ message: "GET x", data: { url: "https://s3.example.com/a?X-Amz-Signature=1" } }],
      request: {
        url: "https://pronow.app/api/v1/x?token=abc",
        query_string: "token=abc",
        cookies: { session: "s" },
        data: { address: "Herzl 1" },
        headers: { cookie: "s=1", Authorization: "Bearer t", "user-agent": "Safari" },
      },
      user: { id: "u1", email: "dana@example.com" } as { id: string },
    });
    expect(event.message).toBe("failed for [email]");
    expect(event.exception!.values![0]!.value).toBe("phone [phone]");
    expect(event.breadcrumbs![0]!.data!.url).toBe("https://s3.example.com/a?[redacted]");
    expect(event.request).toEqual({ url: "https://pronow.app/api/v1/x?[redacted]", headers: { "user-agent": "Safari" } });
    expect(event.user).toEqual({ id: "u1" });
  });
});

describe("alert configuration", () => {
  const base = { DATABASE_URL: "postgres://x", AUTH_SECRET: "x".repeat(32) };

  it("refuses half a Telegram configuration", () => {
    expect(() => loadEnv({ ...base, ALERT_TELEGRAM_BOT_TOKEN: "1:A" })).toThrow("must be set together");
    expect(() => loadEnv({ ...base, ALERT_TELEGRAM_CHAT_ID: "42" })).toThrow("must be set together");
  });

  it("accepts none, or both", () => {
    expect(() => assertAlertsConfigured(loadEnv(base))).not.toThrow();
    expect(loadEnv({ ...base, ALERT_TELEGRAM_BOT_TOKEN: "1:A", ALERT_TELEGRAM_CHAT_ID: "42" }).ALERT_TELEGRAM_CHAT_ID).toBe("42");
  });
});

describe("POST /api/v1/client-errors", () => {
  async function app() {
    const report = vi.fn().mockReturnValue({});
    const server = Fastify({ logger: false });
    server.decorate("monitor", { report, announce: () => {}, settle: async () => {}, flush: async () => {}, dispose: () => {} });
    server.setErrorHandler((err, _req, reply) => reply.status((err as { name?: string }).name === "ZodError" ? 400 : 500).send());
    await server.register(clientErrorsRoutes, { prefix: "/api" });
    return { server, report };
  }

  it("announces a browser crash, without the page's query string", async () => {
    const { server, report } = await app();
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/client-errors",
      headers: { "user-agent": "iPhone Safari" },
      payload: { kind: "render", name: "TypeError", message: "x is undefined", path: "/addresses?email=a@b.co", eventId: "a".repeat(32) },
    });
    expect(res.statusCode).toBe(204);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ source: "web", kind: "render", path: "/addresses", eventId: "a".repeat(32), userAgent: "iPhone Safari" })
    );
  });

  it("refuses a report that does not fit the schema", async () => {
    const { server, report } = await app();
    const res = await server.inject({ method: "POST", url: "/api/v1/client-errors", payload: { kind: "render", message: "x", extra: 1 } });
    expect(res.statusCode).toBe(400);
    expect(report).not.toHaveBeenCalled();
  });

  it("limits how many reports one source can send", async () => {
    const { server, report } = await app();
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await server.inject({ method: "POST", url: "/api/v1/client-errors", payload: { kind: "error", message: `m${i}` } });
      codes.push(res.statusCode);
    }
    expect(codes.filter((c) => c === 204)).toHaveLength(20);
    expect(codes.filter((c) => c === 429)).toHaveLength(5);
    expect(report).toHaveBeenCalledTimes(20);
  });
});
