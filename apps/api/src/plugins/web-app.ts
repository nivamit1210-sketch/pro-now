import fp from "fastify-plugin";
import path from "node:path";
import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * apiRuntimeDir is the bundle's directory, apps/api/dist. A relative
 * WEB_DIST_DIR is read from the repository root, as render.yaml writes it —
 * not from the working directory, which `npm run start -w apps/api` sets to
 * apps/api (that sent production to apps/api/apps/web/dist, and / to 404).
 */
export function resolveWebDistRoot(
  configuredRoot = process.env.WEB_DIST_DIR,
  apiRuntimeDir = import.meta.dirname,
): string {
  const repoRoot = path.resolve(apiRuntimeDir, "../../..");
  return path.resolve(repoRoot, configuredRoot || "apps/web/dist");
}

/**
 * The web app, served by this same process (docs/21 §2, W2): one origin,
 * so the session cookie is first-party and there is no CORS for the app.
 *
 * - Hashed build files (/assets/*) are immutable for a year.
 * - index.html, the service worker and the manifest are revalidated every
 *   time, so a deploy reaches people on their next load.
 * - Any other GET that is not /api and not a file is the app's own route
 *   (/welcome, /sign-in, …): answered with index.html.
 *
 * Only registered when a build exists (WEB_DIST_DIR, default apps/web/dist).
 * In development the Vite server serves the app instead.
 */
export default fp(async (app: FastifyInstance) => {
  const root = resolveWebDistRoot();
  if (!existsSync(path.join(root, "index.html"))) {
    app.log.warn({ root }, "No web build found; not serving the web app");
    return;
  }

  await app.register(fastifyStatic, {
    root,
    // Whatever is on disk now, not a list taken at boot: a rebuild (or a
    // build that finished after start) is served without a restart. A miss
    // falls through to the not-found handler below.
    setHeaders(res, filePath) {
      const rel = path.relative(root, filePath);
      res.header(
        "Cache-Control",
        rel.startsWith("assets" + path.sep) ? "public, max-age=31536000, immutable" : "no-cache"
      );
    },
  });

  app.setNotFoundHandler((req, reply) => {
    const isApp = req.method === "GET" && !req.url.startsWith("/api/") && !path.extname(req.url.split("?")[0] ?? "");
    if (isApp && req.headers.accept?.includes("text/html")) {
      reply.header("Cache-Control", "no-cache");
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ code: "NOT_FOUND", message: "Not found" });
  });
});
