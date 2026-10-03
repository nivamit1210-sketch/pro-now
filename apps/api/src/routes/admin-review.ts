import type { FastifyInstance } from "fastify";
import { adminFixMarkSchema } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";
import { itemExists } from "../domain/review-loop.js";
import { applicationItems, cancelMark, lockProfessional, markItem } from "../domain/review-loop-store.js";

/** THE REVIEWER'S MARKS (docs/10 §Review loop): items to fix, collected in a draft round. */
export default async function adminReviewRoutes(app: FastifyInstance) {
  const admin = { onRequest: requireRole("ADMIN") };

  app.post("/v1/admin/professionals/:id/fix-requests", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminFixMarkSchema.parse(req.body);
    const outcome = await app.prisma.$transaction(async (tx) => {
      const pro = await tx.professionalProfile.findUnique({ where: { id } });
      if (!pro) return { status: 404, body: { code: "PROFESSIONAL_NOT_FOUND", message: "No such professional" } };
      await lockProfessional(tx, id);
      const fresh = await tx.professionalProfile.findUniqueOrThrow({ where: { id } });
      if (fresh.verificationStatus !== "SERVICE_REVIEW") return { status: 409, body: { code: "NOT_IN_REVIEW", message: "Only an application in review can be marked" } };
      if (!itemExists(body.itemKey, await applicationItems(tx, id))) return { status: 422, body: { code: "UNKNOWN_ITEM", message: "This application has no such item" } };
      const mark = await markItem(tx, { professionalId: id, itemKey: body.itemKey, reasonHe: body.reasonHe, actorId: req.user!.userId });
      await tx.auditLog.create({ data: { actorId: req.user!.userId, action: "FIX_REQUEST_MARKED", targetType: "professional", targetId: id, afterJson: { itemKey: body.itemKey }, reason: body.reasonHe, requestId: req.id } });
      return { status: 201, body: { id: mark.id } };
    });
    return reply.status(outcome.status).send(outcome.body);
  });

  app.delete("/v1/admin/fix-requests/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await app.prisma.fixRequest.findUnique({ where: { id } });
    if (!found) return reply.status(404).send({ code: "FIX_REQUEST_NOT_FOUND", message: "No such request" });
    const result = await app.prisma.$transaction(async (tx) => {
      await lockProfessional(tx, found.professionalId);
      const r = await cancelMark(tx, id);
      if (r === "CANCELLED") {
        await tx.auditLog.create({ data: { actorId: req.user!.userId, action: "FIX_REQUEST_CANCELLED", targetType: "professional", targetId: found.professionalId, beforeJson: { itemKey: found.itemKey }, requestId: req.id } });
      }
      return r;
    });
    if (result === "NOT_FOUND") return reply.status(404).send({ code: "FIX_REQUEST_NOT_FOUND", message: "No such request" });
    if (result === "NOT_DRAFT") return reply.status(409).send({ code: "ALREADY_SENT", message: "This request was already sent" });
    return reply.status(204).send();
  });
}
