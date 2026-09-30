import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../src/plugins/security.js";
import { loggerOptions } from "../src/server.js";

describe("the content security policy", () => {
  const csp = contentSecurityPolicy(
    { S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com/bucket", SENTRY_DSN: "https://k@o1.ingest.sentry.io/1", PUBLIC_URL: "https://pronow.app", NODE_ENV: "production" },
    "https://k2@o1.ingest.sentry.io/2"
  );
  it("runs only our own scripts, and is never framed", () => {
    expect(csp.scriptSrc).toEqual(["'self'"]);
    expect(csp.frameAncestors).toEqual(["'none'"]);
    expect(csp.objectSrc).toEqual(["'none'"]);
  });
  it("lets the page talk to exactly our sockets, storage and Sentry", () => {
    expect(csp.connectSrc).toEqual(["'self'", "wss://pronow.app", "https://acc.r2.cloudflarestorage.com", "https://o1.ingest.sentry.io", "https://o1.ingest.sentry.io"]);
    expect(csp.imgSrc).toContain("https://acc.r2.cloudflarestorage.com");
  });
  it("upgrades insecure requests only in production", () => {
    expect(csp.upgradeInsecureRequests).toEqual([]);
    expect(contentSecurityPolicy({ PUBLIC_URL: "http://192.168.1.239:4000", NODE_ENV: "local" }).upgradeInsecureRequests).toBeNull();
  });
});

describe("logs without personal data", () => {
  const capture = () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); } });
    const opts = loggerOptions();
    return { log: pino({ ...opts, serializers: opts.serializers, hooks: opts.hooks }, stream), lines };
  };

  it("never writes a sign-in token, a cookie or a query", () => {
    const { log, lines } = capture();
    log.info({ req: { method: "GET", url: "/api/auth/magic-link/verify?token=SECRET123&callbackURL=/", id: "r1", headers: { cookie: "s=1", "user-agent": "UA" } } }, "incoming request");
    const out = lines.join("");
    expect(out).not.toContain("SECRET123");
    expect(out).not.toContain("s=1");
    expect(out).toContain("/api/auth/magic-link/verify?[query]");
  });

  it("scrubs an email or a phone from a message", () => {
    const { log, lines } = capture();
    log.warn("no account for dana@example.com at 052-123-4567");
    expect(lines.join("")).toContain("no account for [email] at [phone]");
  });
});
