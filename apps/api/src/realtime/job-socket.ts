import type { FastifyInstance } from "fastify";
import { jobParticipant } from "../auth/access.js";

/**
 * Private, authorized-per-job WebSocket channel — see
 * /docs/06-API-SPEC.md §WebSocket channels.
 *
 * Only the job's customer and its assigned professional may listen. What
 * they hear is that the job changed (`JOB_EVENT`, with the event's type);
 * they re-read the job over REST, which is the only source of state. On
 * connect a `READY` tells the client to do that once, so nothing that
 * happened before the socket opened is missed.
 */
export function registerJobSocket(app: FastifyInstance) {
  app.get("/v1/ws/jobs/:id", { websocket: true }, async (socket, req) => {
    const { id: jobId } = req.params as { id: string };

    if (!req.user) {
      socket.close(4401, "UNAUTHENTICATED");
      return;
    }
    if (!(await jobParticipant(app.prisma, req.user.userId, jobId))) {
      socket.close(4404, "JOB_NOT_FOUND");
      return;
    }

    const unsubscribe = app.jobEvents.subscribe(jobId, (notice) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "JOB_EVENT", jobId, eventType: notice.type, at: notice.at }));
      }
    });
    socket.send(JSON.stringify({ type: "READY", jobId }));

    // A client ping keeps proxies from closing an idle socket.
    socket.on("message", () => {
      socket.send(JSON.stringify({ type: "PONG", jobId, at: new Date().toISOString() }));
    });

    socket.on("close", unsubscribe);
  });
}

/**
 * The person's own channel (docs/21 W9): offers reach a professional the
 * moment dispatch sends them, and notifications reach anyone signed in.
 * Like the job channel, it says that something happened; the client
 * re-reads the offer or the inbox over REST.
 */
export function registerUserSocket(app: FastifyInstance) {
  app.get("/v1/ws/me", { websocket: true }, async (socket, req) => {
    if (!req.user) {
      socket.close(4401, "UNAUTHENTICATED");
      return;
    }
    const unsubscribe = app.userEvents.subscribe(req.user.userId, (notice) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(notice));
    });
    socket.send(JSON.stringify({ type: "READY" }));
    socket.on("message", () => socket.send(JSON.stringify({ type: "PONG", at: new Date().toISOString() })));
    socket.on("close", unsubscribe);
  });
}
