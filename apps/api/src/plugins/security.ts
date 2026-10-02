import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

/**
 * SECURITY HEADERS (docs/21 W10, docs/11-SECURITY.md).
 *
 * The CSP names exactly what the page loads, and nothing else:
 * - scripts only from this origin (the built page has no inline script);
 * - styles inline too, because react-native-web writes its styles at run
 *   time — the one allowance, and it cannot run code;
 * - images, voice notes and uploads from storage (presigned URLs) and
 *   blob:/data: for what the browser itself makes (photo previews);
 * - connections to this origin (REST and the sockets), storage (the
 *   direct upload) and, when configured, Sentry;
 * - never framed (frame-ancestors 'none'), no plugins, no base-URI games.
 * HSTS and upgrade-insecure-requests only in production AND only when
 * PUBLIC_URL is https: over plain http they mean nothing at best, and
 * Safari applies upgrade-insecure-requests even to localhost, so a
 * production build served over http never loads its own scripts (found by
 * the W10 production-build e2e run).
 */
const originOf = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export const servesHttpsInProduction = (env: { NODE_ENV: string; PUBLIC_URL: string }) =>
  env.NODE_ENV === "production" && new URL(env.PUBLIC_URL).protocol === "https:";

export function contentSecurityPolicy(env: { S3_ENDPOINT?: string; SENTRY_DSN?: string; PUBLIC_URL: string; NODE_ENV: string }, webSentryDsn?: string) {
  const storage = originOf(env.S3_ENDPOINT);
  const sentry = [originOf(env.SENTRY_DSN), originOf(webSentryDsn)].filter((x): x is string => Boolean(x));
  const publicUrl = new URL(env.PUBLIC_URL);
  const sockets = `${publicUrl.protocol === "https:" ? "wss" : "ws"}://${publicUrl.host}`;
  const extra = (list: Array<string | null>) => list.filter((x): x is string => Boolean(x));
  return {
    defaultSrc: ["'self'"],
    // WebAssembly for the identity check's face guidance (docs/10). Compiles wasm only; `eval` of JavaScript stays blocked.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:", ...extra([storage])],
    mediaSrc: ["'self'", "blob:", ...extra([storage])],
    connectSrc: ["'self'", sockets, ...extra([storage]), ...sentry],
    fontSrc: ["'self'", "data:"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(servesHttpsInProduction(env) ? { upgradeInsecureRequests: [] } : { upgradeInsecureRequests: null }),
  };
}

export default fp(async (app: FastifyInstance) => {
  await app.register(helmet, {
    contentSecurityPolicy: { directives: contentSecurityPolicy(app.config, process.env.VITE_SENTRY_DSN) },
    hsts: servesHttpsInProduction(app.config) ? { maxAge: 180 * 24 * 3600, includeSubDomains: true } : false,
    // The location of a job's photo is a signed storage URL: never leak the page's URL to it.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
  });
});
