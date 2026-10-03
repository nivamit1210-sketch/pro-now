import { describe, it, expect } from "vitest";
import { loadEnv } from "@pro-now/config";

/**
 * A deployed environment must refuse to boot while a vendor setting still
 * points at a stand-in on its own machine (/docs/21-PRODUCTION-PLAN.md §0).
 */

const base = {
  DATABASE_URL: "postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech/pronow",
  AUTH_SECRET: "a-test-secret-that-is-at-least-32-chars",
};

describe("loadEnv — local stand-ins", () => {
  it("boots locally with every stand-in and no Redis", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "local",
      DATABASE_URL: "postgresql://pronow@localhost:5432/pronow",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      SMTP_URL: "smtp://localhost:1025",
      GOOGLE_ISSUER_URL: "http://localhost:8080/google",
    });
    expect(env.REDIS_URL).toBeUndefined();
  });

  it("boots production when every setting points elsewhere", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "PRO NOW <no-reply@pro-now.example>",
        PUBLIC_URL: "https://pro-now.onrender.com",
      })
    ).not.toThrow();
  });

  for (const [key, value] of [
    ["DATABASE_URL", "postgresql://pronow@localhost:5432/pronow"],
    ["S3_ENDPOINT", "http://127.0.0.1:9000"],
    ["SMTP_URL", "smtp://localhost:1025"],
    ["GOOGLE_ISSUER_URL", "http://[::1]:8080/google"],
    ["PUBLIC_URL", "http://app.localhost:4000"],
    ["REDIS_URL", "redis://127.0.0.1:6379"],
  ] as const) {
    it(`refuses production with ${key} on this machine`, () => {
      expect(() => loadEnv({ ...base, NODE_ENV: "production", [key]: value })).toThrow(key);
    });
  }

  it("refuses staging the same way", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "staging", SMTP_URL: "smtp://localhost:1025" })).toThrow("SMTP_URL");
  });

  it("allows a production build against stand-ins only when asked explicitly", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        SMTP_URL: "smtp://localhost:1025",
        EMAIL_FROM: "PRO NOW <no-reply@pronow.test>",
        ALLOW_LOCAL_STANDINS: "1",
      })
    ).not.toThrow();
  });

  it("refuses the fixture geocoder in production", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        GEOCODING_PROVIDER: "fixture",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "PRO NOW <no-reply@pro-now.example>",
        PUBLIC_URL: "https://pro-now.onrender.com",
      })
    ).toThrow("GEOCODING_PROVIDER");
  });
});

describe("loadEnv — sign-in", () => {
  const deployed = {
    ...base,
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "PRO NOW <no-reply@pro-now.example>",
    PUBLIC_URL: "https://pro-now.onrender.com",
  };

  it("refuses production without an email provider", () => {
    expect(() => loadEnv({ ...deployed, RESEND_API_KEY: undefined })).toThrow("BREVO_API_KEY, RESEND_API_KEY or SMTP_URL");
  });

  it("accepts SMTP as a production fallback", () => {
    expect(() => loadEnv({ ...deployed, RESEND_API_KEY: undefined, SMTP_URL: "smtps://smtp.example.com:465" })).not.toThrow();
  });

  it("refuses production without EMAIL_FROM", () => {
    expect(() => loadEnv({ ...deployed, EMAIL_FROM: undefined })).toThrow("EMAIL_FROM");
  });

  it("refuses production that forgot PUBLIC_URL (the default is this machine)", () => {
    expect(() => loadEnv({ ...deployed, PUBLIC_URL: undefined })).toThrow("PUBLIC_URL");
  });

  it("refuses a short AUTH_SECRET", () => {
    expect(() => loadEnv({ ...base, AUTH_SECRET: "too-short" })).toThrow("AUTH_SECRET");
  });

  it("reads ADMIN_EMAILS as a trimmed, lower-cased list", () => {
    const env = loadEnv({ ...base, ADMIN_EMAILS: " Dvir@Example.com, ,amit@example.com " });
    expect(env.ADMIN_EMAILS).toEqual(["dvir@example.com", "amit@example.com"]);
    expect(loadEnv(base).ADMIN_EMAILS).toEqual([]);
  });
});
