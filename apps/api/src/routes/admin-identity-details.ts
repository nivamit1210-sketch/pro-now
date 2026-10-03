import type { FastifyInstance } from "fastify";
import { adminIdentityDetailsSchema } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";
import { ageOn, MINIMUM_AGE } from "../domain/identity-check.js";
import { lockProfessional } from "../domain/review-loop-store.js";
import { applicationView } from "./pro-onboarding.js";

const NOTICE_HE = "הפרטים בחשבון עודכנו על ידי PRO NOW";

/**
 * STAFF CORRECTION (docs/10 §Life after approval): the legal name and date
 * of birth lock once identity is verified, so a mistake in them is fixed
 * here, by staff, audited with before and after, and the professional is told.
 */
export default async function adminIdentityDetailsRoutes(app: FastifyInstance) {
  const admin = { onRequest: requireRole("ADMIN") };

  app.patch("/v1/admin/professionals/:id/identity-details", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminIdentityDetailsSchema.parse(req.body);
    let dateOfBirth: Date | undefined;
    if (body.dateOfBirth !== undefined) {
      dateOfBirth = new Date(`${body.dateOfBirth}T00:00:00Z`);
      if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date() || dateOfBirth.toISOString().slice(0, 10) !== body.dateOfBirth) {
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Not a date of birth", fields: [{ path: "dateOfBirth", message: "invalid" }] });
      }
      if (ageOn(dateOfBirth, new Date()) < MINIMUM_AGE) {
        return reply.status(422).send({ code: "UNDER_MINIMUM_AGE", message: `Professionals join from age ${MINIMUM_AGE}` });
      }
    }
    const outcome = await app.prisma.$transaction(async (tx) => {
      await lockProfessional(tx, id);
      const pro = await tx.professionalProfile.findUnique({ where: { id } });
      if (!pro) return null;
      const fields = (p: { legalName: string; dateOfBirth: Date | null }) => ({ legalName: p.legalName, dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null });
      const updated = await tx.professionalProfile.update({
        where: { id },
        data: { ...(body.legalName !== undefined ? { legalName: body.legalName } : {}), ...(dateOfBirth ? { dateOfBirth } : {}) },
      });
      await tx.auditLog.create({
        data: { actorId: req.user!.userId, action: "PRO_IDENTITY_DETAILS_CORRECTED", targetType: "professional", targetId: id, beforeJson: fields(pro), afterJson: fields(updated), reason: body.reason, requestId: req.id },
      });
      await tx.notification.create({ data: { userId: pro.userId, type: "PRO_DETAILS_CORRECTED", title: NOTICE_HE, body: NOTICE_HE, data: { url: "/pro" } } });
      return pro.userId;
    });
    if (outcome === null) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No such professional" });
    app.userEvents.publish(outcome, { type: "NOTIFICATION", title: NOTICE_HE, body: NOTICE_HE, url: "/pro" });
    return reply.send(await applicationView(app.prisma, id));
  });
}
