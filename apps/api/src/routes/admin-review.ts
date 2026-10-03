import type { FastifyInstance } from "fastify";
import { adminFixMarkSchema } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";
import { FIXES_TITLE_HE, fixesBodyHe, storeFixesNotice } from "../domain/notifications/fixes-requested.js";
import { deleteIdentityPhotos } from "./pro-onboarding.js";
import { itemExists } from "../domain/review-loop.js";
import { applicationItems, cancelMark, identityRetakeable, lockProfessional, markItem, sendRound } from "../domain/review-loop-store.js";

/** THE REVIEWER'S MARKS (docs/10 §Review loop): items to fix, collected in a draft round; an open sent request can still be taken back. */
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
      if (body.itemKey === "IDENTITY" && !(await identityRetakeable(tx, id))) {
        return { status: 409, body: { code: "IDENTITY_NOT_OPEN", message: "The identity check is already decided; it cannot be sent back for a retake" } };
      }
      const mark = await markItem(tx, { professionalId: id, itemKey: body.itemKey, reasonHe: body.reasonHe, actorId: req.user!.userId });
      await tx.auditLog.create({
        data: {
          actorId: req.user!.userId, action: "FIX_REQUEST_MARKED", targetType: "professional", targetId: id,
          ...(mark.previousReasonHe !== null ? { beforeJson: { reasonHe: mark.previousReasonHe } } : {}),
          afterJson: { itemKey: body.itemKey }, reason: body.reasonHe, requestId: req.id,
        },
      });
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
        await tx.auditLog.create({ data: { actorId: req.user!.userId, action: "FIX_REQUEST_CANCELLED", targetType: "professional", targetId: found.professionalId, beforeJson: { itemKey: found.itemKey }, afterJson: { status: "CANCELLED" }, requestId: req.id } });
      }
      return r;
    });
    if (result === "NOT_FOUND") return reply.status(404).send({ code: "FIX_REQUEST_NOT_FOUND", message: "No such request" });
    if (result === "NOT_CANCELLABLE") return reply.status(409).send({ code: "ALREADY_SENT", message: "This request was already answered or closed" });
    return reply.status(204).send();
  });

  app.post("/v1/admin/professionals/:id/review-round/send", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const outcome = await app.prisma.$transaction(async (tx) => {
      const pro = await tx.professionalProfile.findUnique({ where: { id } });
      if (!pro) return { code: "PROFESSIONAL_NOT_FOUND" as const };
      await lockProfessional(tx, id);
      const sent = await sendRound(tx, { professionalId: id, actorId: req.user!.userId });
      if (sent.code === "SENT") {
        await storeFixesNotice(tx, sent.userId, sent.count);
        await tx.auditLog.create({ data: { actorId: req.user!.userId, action: "REVIEW_ROUND_SENT", targetType: "professional", targetId: id, afterJson: { roundId: sent.roundId, count: sent.count }, requestId: req.id } });
      }
      return sent;
    });
    if (outcome.code === "PROFESSIONAL_NOT_FOUND") return reply.status(404).send({ code: outcome.code, message: "No such professional" });
    if (outcome.code === "NOTHING_MARKED") return reply.status(409).send({ code: outcome.code, message: "Mark at least one item before sending" });
    if (outcome.code === "NOT_IN_REVIEW") return reply.status(409).send({ code: outcome.code, message: "Only an application in review can be sent" });
    const { userId, count } = outcome;
    await deleteIdentityPhotos(app, outcome.identityUploadIds);
    app.userEvents.publish(userId, { type: "NOTIFICATION", title: FIXES_TITLE_HE, body: fixesBodyHe(count), url: "/pro" });
    void app.push.sendPush({ userId, title: FIXES_TITLE_HE, body: fixesBodyHe(count), data: { url: "/pro" } }).catch((err) => app.log.warn({ err }, "fixes push failed"));
    return reply.send({ roundId: outcome.roundId, count });
  });
}
