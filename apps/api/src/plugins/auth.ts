import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import { AUTH_BASE_PATH, createAuth, type Auth } from "../auth/auth.js";
import { rolesOf, type Role } from "../auth/roles.js";
import { createResendEmailProvider } from "../infra/email/resend.js";
import type { EmailProvider } from "../infra/email/email-provider.js";
import { createSmtpEmailProvider, unconfiguredEmailProvider } from "../infra/email/smtp.js";

/** Who is calling, resolved from the session cookie. Server-side truth only. */
export interface RequestUser {
  userId: string;
  sessionId: string;
  roles: Role[];
}

declare module "fastify" {
  interface FastifyRequest {
    user?: RequestUser;
  }
  interface FastifyInstance {
    auth: Auth;
    /** Outgoing email: sign-in links, and the notifications outbox (W9). */
    email: EmailProvider;
  }
}

export default fp(async (app: FastifyInstance) => {
  const { EMAIL_FROM, RESEND_API_KEY, SMTP_URL } = app.config;
  const from = EMAIL_FROM ?? "PRO NOW <no-reply@pronow.test>";
  const email = RESEND_API_KEY
    ? createResendEmailProvider(RESEND_API_KEY, from)
    : SMTP_URL
      ? createSmtpEmailProvider(SMTP_URL, from)
      : unconfiguredEmailProvider;
  const auth = createAuth({ config: app.config, prisma: app.prisma, email });
  app.decorate("auth", auth);
  app.decorate("email", email);

  // Better Auth speaks Fetch Request/Response; Fastify speaks Node. Translate.
  app.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    async handler(req, reply) {
      const hasBody = req.method !== "GET" && req.body !== undefined;
      const response = await auth.handler(
        new Request(new URL(req.url, app.config.PUBLIC_URL), {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          body: hasBody ? JSON.stringify(req.body) : undefined,
        })
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie" && key !== "content-length") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      const text = await response.text();
      return reply.send(text.length > 0 ? text : null);
    },
  });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith(`${AUTH_BASE_PATH}/`) || !req.headers.cookie) return;
    const { headers, response } = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    // A session past its updateAge comes back with a refreshed cookie.
    const refreshed = headers.getSetCookie();
    if (refreshed.length > 0) reply.header("set-cookie", refreshed);
    if (!response) return;
    req.user = {
      userId: response.user.id,
      sessionId: response.session.id,
      roles: await rolesOf(app.prisma, response.user.id),
    };
  });
});
