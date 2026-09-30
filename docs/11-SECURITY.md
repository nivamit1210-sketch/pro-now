# 11 — Security

## Baseline
Least privilege everywhere. Secrets only via environment/secret manager —
never committed, never shipped inside a mobile bundle. RBAC for every admin
action. Encryption in transit and at rest via infrastructure/provider
capabilities. Sensitive documents (KYC, credentials) served only via
short-lived signed URLs, isolated from public profile media. Upload type/
size validation plus a malware-scanning strategy. OTP and API rate
limiting, tuned per endpoint risk — auth, matching, messaging, location,
and offer-accept are specially protected. Authorization checked on every
object access (no IDOR). Every privileged admin action is audit-logged.
Dependency/security scanning runs in CI.

## OWASP-mapped review checklist (release gate — see `/docs/15-QA-TEST-PLAN.md`)
IDOR tests · RBAC tests · OTP brute-force/rate limits · session revoke/
rotation · admin MFA decision · signed-upload URL scope · malicious-file
strategy · PII-in-logs scan · secret scan · dependency scan · webhook
signature validation · SQL injection (ORM + validation) · admin XSS · CSRF
where relevant · SSRF around any URL-fetching integration · mass-assignment
protection · abuse protection on any financial endpoint.

## Security review — W10 (2026-09-30)
What the web app and the API do today, and how each item is checked.

**Headers** (`apps/api/src/plugins/security.ts`, `@fastify/helmet`):
- Content-Security-Policy on every response: `default-src 'self'`,
  `script-src 'self'` (no inline script, no eval), `style-src 'self'
  'unsafe-inline'` (react-native-web writes style tags at runtime),
  images/media from self, `data:`, `blob:` and the storage origin only,
  `connect-src` limited to self, the API's own `ws(s)://` origin, storage
  and Sentry's ingest origin, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`; `upgrade-insecure-requests` in
  production. Verified with 0 violations walking `/welcome`, sign-in, the
  composer, `/addresses`, `/inbox`, `/pro/join` and `/` in WebKit and
  Chromium, and by the whole e2e suite running under it.
- HSTS (180 days, includeSubDomains) in production only, so local HTTP on
  a phone keeps working. `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options`, COOP/CORP.
- Tests: `apps/api/test/security.test.ts` (the policy per environment) and
  `w10-hardening.int.test.ts` (headers on real responses, no HSTS outside
  production).

**Input**:
- Every body and query is parsed by a zod schema from `packages/validation`
  before a handler reads it. The proof is a sweep, not a review:
  `w10-hardening.int.test.ts` enumerates every `/api/*` route from the
  server's own route index and sends garbage bodies (object, array, text)
  and garbage queries as a customer, a professional and an admin. Nothing
  may answer 500. It found one: `GET /v1/admin/jobs?status=<unknown>` was a
  500 and is now a 400 `UNKNOWN_STATUS`.
- Body limit 64 KB (`bodyLimit` in `buildServer`) → 413. Files never pass
  through the API: uploads go straight to storage with presigned URLs
  whose size and type are fixed when signed.

**Logs** (`loggerOptions()` in `server.ts`):
- Cookies, `Authorization` and `Set-Cookie` are redacted; request URLs are
  logged without their query string; every string logged passes through
  `scrubText` (emails, phone numbers, tokens). Sentry already scrubs the
  same way (W4). Test: a captured pino stream in `security.test.ts`.

**Dependencies**: `npm run audit:shipped` in CI fails on any high or
critical advisory in a package the API or the web app ships. At W10: 246
packages ship, 0 advisories (nodemailer 7 → 10 fixed the one high).

**Sign-in and sessions**: Better Auth — `httpOnly`, `SameSite=Lax`
cookies, `Secure` over HTTPS; origin and CSRF checks pinned on even under
test; `trustedOrigins` is only `PUBLIC_URL`.

**Authorization**: object access is checked per route (the IDOR tests in
the integration suite: a customer cannot read another's job, a
professional cannot act on an offer that is not theirs); admin routes are
403 for anyone not in `ADMIN_EMAILS`, and every admin decision writes an
audit row (W8).

**Open items — known, not fixed in W10:**
- Rate limiting is Better Auth's built-in limiter only (in memory, per IP,
  on in production). No per-email limit. `@fastify/rate-limit` is Phase 3
  (`docs/21 §4b`).
- `DEMO_AUTH_ENABLED=1` on the public Render test deployment is the gated
  tester sign-in. It must be `0` in any real production.
- No malware scanning on uploads (images and PDFs, served only through
  short-lived signed URLs). A vendor decision (`docs/18 §Open decisions`).
- Admin MFA: not decided (`docs/18 §Open decisions`).

## Payments
Card data is handled by the payment provider, never by PRO NOW servers,
wherever the vendor's integration allows it. Webhook handlers are
idempotent and signature-verified before any state change.

## Production launch gate
Legal/privacy review is required before production launch — this is a
human sign-off, not a code check, and is tracked in
`/docs/17-APP-STORES.md §Go/No-Go`.
