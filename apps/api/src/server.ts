import "./load-env.js";
import { pathToFileURL } from "node:url";

import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import { loadEnv } from "@pro-now/config";

import observabilityPlugin from "./plugins/observability.js";
import corsPlugin from "./plugins/cors.js";
import prismaPlugin from "./plugins/prisma.js";
import jobLockPlugin from "./plugins/job-lock.js";
import providersPlugin from "./plugins/providers.js";
import dispatchSweeperPlugin from "./plugins/dispatch-sweeper.js";
import mediaCleanupPlugin from "./plugins/media-cleanup.js";
import presenceSweeperPlugin from "./plugins/presence-sweeper.js";
import authPlugin from "./plugins/auth.js";
import webAppPlugin from "./plugins/web-app.js";

import catalogRoutes from "./routes/catalog.js";
import addressesRoutes from "./routes/addresses.js";
import geoRoutes from "./routes/geo.js";
import jobsRoutes from "./routes/jobs.js";
import matchRoutes from "./routes/match.js";
import requestMatchRoutes from "./routes/request-match.js";
import onSiteRoutes from "./routes/on-site.js";
import proOnboardingRoutes from "./routes/pro-onboarding.js";
import adminProsRoutes from "./routes/admin-pros.js";
import offersRoutes from "./routes/offers.js";
import proRoutes from "./routes/pro.js";
import proJobsRoutes from "./routes/pro-jobs.js";
import proReputationRoutes from "./routes/pro-reputation.js";
import proServicesRoutes from "./routes/pro-services.js";
import quotesRoutes from "./routes/quotes.js";
import reviewsRoutes from "./routes/reviews.js";
import meRoutes from "./routes/me.js";
import uploadsRoutes from "./routes/uploads.js";
import clientErrorsRoutes from "./routes/client-errors.js";
import adminDebugRoutes from "./routes/admin-debug.js";
import demoAuthRoutes from "./routes/demo-auth.js";
import { registerJobSocket } from "./realtime/job-socket.js";

declare module "fastify" {
  interface FastifyInstance {
    config: ReturnType<typeof loadEnv>;
  }
}

/**
 * A zod error, recognised by SHAPE rather than by `instanceof`.
 *
 * zod ships a CJS build and an ESM build of the same file. The schemas in
 * `@pro-now/validation` throw the class from one of them and this module
 * imports the class from the other, so `err instanceof ZodError` is false
 * for an error that is unmistakably a ZodError — the dual-package hazard,
 * arriving as a 500 for every malformed request. `name` and `issues` are
 * stable across both builds, and across a future duplicate install.
 */
interface ZodIssueLike {
  path: Array<string | number>;
  message: string;
}

function zodIssuesOf(err: unknown): ZodIssueLike[] | null {
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as { name?: unknown; issues?: unknown };
  if (candidate.name !== "ZodError" || !Array.isArray(candidate.issues)) return null;
  return candidate.issues as ZodIssueLike[];
}

/**
 * Everything the server answers besides the web app itself lives under
 * /api: REST at /api/v1/*, sign-in at /api/auth/*, the job socket at
 * /api/v1/ws/*. The web app owns every other path (docs/21 §2, W2).
 */
export const API_PREFIX = "/api";

export async function buildServer(opts: { logger?: boolean } = {}) {
  const config = loadEnv();
  const app = Fastify({ logger: opts.logger ?? true });
  app.decorate("config", config);

  await app.register(observabilityPlugin);
  await app.register(corsPlugin);
  await app.register(websocketPlugin);
  await app.register(prismaPlugin);
  await app.register(jobLockPlugin);
  await app.register(providersPlugin);
  // After providers and prisma: the sweep needs both.
  await app.register(dispatchSweeperPlugin);
  await app.register(mediaCleanupPlugin);
  await app.register(presenceSweeperPlugin);
  await app.register(authPlugin);
  await app.register(demoAuthRoutes);

  app.get("/health", async () => ({ ok: true, sandbox: config.NODE_ENV !== "production" }));

  /*
   * BEFORE THE ROUTES, AND THAT IS THE WHOLE POINT.
   *
   * Every route below is registered as a plugin, so each one gets its own
   * encapsulation context. Fastify resolves the error handler from the
   * context a route was registered INTO — so a handler set on the root
   * after the routes are already in place is never reached by anything
   * they throw. This one sat at the bottom of the file and had never run:
   * every error response the API has ever sent came from Fastify's
   * default serializer, which is why no response carried a `requestId`
   * and why a zod failure returned 500 with the validator's internals
   * pasted into the message.
   */
  app.setErrorHandler((err, req, reply) => {
    /*
     * A MALFORMED REQUEST IS THE CLIENT'S NEWS, NOT OURS.
     *
     * Every route parses its body with a zod schema, and a ZodError
     * carries no `statusCode` — so a missing field came back as 500
     * "Internal Server Error" with zod's own `issues` array serialized
     * into the message. Wrong twice: it told an app that had made a
     * fixable mistake that the server had broken, and it leaked the
     * shape of the validator to anyone who sent a bad body.
     *
     * 400, with the field paths and nothing else.
     */
    const zodIssues = zodIssuesOf(err);
    if (zodIssues) {
      req.log.info({ issues: zodIssues, url: req.url }, "Request failed validation");
      return reply.status(400).send({
        code: "VALIDATION_FAILED",
        message: "Request body failed validation",
        fields: zodIssues.map((i) => ({ path: i.path.join("."), message: i.message })),
        requestId: req.id,
      });
    }

    // Fastify errors carry `statusCode`/`code`, and so now do the domain
    // errors thrown by the state machines — this comment asserted that
    // before it was true, and a refused transition reached the client as
    // "Internal Server Error" with the reason swallowed. A plain `Error`
    // still carries neither, so both are read defensively.
    const { statusCode, code, message } = err as { statusCode?: number; code?: string; message?: string };
    const status = statusCode ?? 500;

    /*
     * A 4xx is the server doing its job — refusing something — and is only
     * logged. A 5xx is a bug or an outage: it is stored with its request
     * and sent to the phone (docs/23-OBSERVABILITY.md).
     */
    if (status >= 500) {
      req.log.error({ err }, "Unhandled error");
      app.monitor.report({
        source: "api",
        error: err,
        requestId: req.id,
        method: req.method,
        route: req.routeOptions.url ?? req.url.split("?")[0],
        userId: req.user?.userId,
      });
    } else {
      req.log.info({ err: { code, message }, statusCode: status }, "Request refused");
    }
    reply.status(status).send({
      code: code ?? "INTERNAL_ERROR",
      message: status >= 500 ? "Internal server error" : (message ?? "Request failed"),
      requestId: req.id,
    });
  });

  await app.register(catalogRoutes, { prefix: API_PREFIX });
  await app.register(addressesRoutes, { prefix: API_PREFIX });
  await app.register(geoRoutes, { prefix: API_PREFIX });
  await app.register(jobsRoutes, { prefix: API_PREFIX });
  await app.register(matchRoutes, { prefix: API_PREFIX });
  await app.register(requestMatchRoutes, { prefix: API_PREFIX });
  await app.register(onSiteRoutes, { prefix: API_PREFIX });
  await app.register(proOnboardingRoutes, { prefix: API_PREFIX });
  await app.register(adminProsRoutes, { prefix: API_PREFIX });
  await app.register(offersRoutes, { prefix: API_PREFIX });
  await app.register(proRoutes, { prefix: API_PREFIX });
  await app.register(proJobsRoutes, { prefix: API_PREFIX });
  await app.register(proReputationRoutes, { prefix: API_PREFIX });
  await app.register(proServicesRoutes, { prefix: API_PREFIX });
  await app.register(quotesRoutes, { prefix: API_PREFIX });
  await app.register(reviewsRoutes, { prefix: API_PREFIX });
  await app.register(meRoutes, { prefix: API_PREFIX });
  await app.register(uploadsRoutes, { prefix: API_PREFIX });
  await app.register(clientErrorsRoutes, { prefix: API_PREFIX });
  await app.register(adminDebugRoutes, { prefix: API_PREFIX });

  await app.register(async (api) => registerJobSocket(api), { prefix: API_PREFIX });

  // Last: the web app owns every path the API does not.
  await app.register(webAppPlugin);


  return app;
}

/**
 * What escapes every handler. A rejected promise nobody awaited is
 * reported and the server keeps serving; an uncaught exception leaves the
 * process in an unknown state, so it is reported, given two seconds to
 * reach the phone, and the process exits for Render to restart it.
 */
function installProcessHandlers(app: Awaited<ReturnType<typeof buildServer>>) {
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "Unhandled promise rejection");
    app.monitor.report({ source: "process", kind: "unhandledRejection", error: reason });
  });
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "Uncaught exception; exiting");
    app.monitor.report({ source: "process", kind: "uncaughtException", error: err });
    void app.monitor.flush(2000).finally(() => process.exit(1));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildServer()
    .then(async (app) => {
      installProcessHandlers(app);
      await app.listen({ port: app.config.PORT, host: "0.0.0.0" });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
