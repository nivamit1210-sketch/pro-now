import type { FastifyInstance } from "fastify";
import { adminDecisionSchema } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";
import { evaluateServiceCredentials } from "../domain/dispatch/credential-eligibility.js";
import { applicationView } from "./pro-onboarding.js";

/**
 * APPROVING PROFESSIONALS (docs/21 W7; the screens are W8).
 *
 * Three decisions, each separate and each written to `audit_logs` with who
 * made it and why:
 *
 * - the ACCOUNT: the details and the documents everyone gives;
 * - each CREDENTIAL: a licence or certificate, with its expiry;
 * - each SERVICE: allowed only when the account is approved and the
 *   service's credentials satisfy the very rule dispatch applies
 *   (`evaluateServiceCredentials`), so an approval cannot outrun the
 *   evidence behind it (CLAUDE.md §3, verification per service).
 *
 * Which documents are mandatory per service is decided case by case and
 * recorded (docs/21 §5 D8); the code enforces what `service_requirements`
 * says, not an opinion of its own.
 */
export default async function adminProsRoutes(app: FastifyInstance) {
  const admin = { onRequest: requireRole("ADMIN") };

  const audit = (actorId: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason: string | undefined, requestId: string) =>
    app.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        beforeJson: before as object,
        afterJson: after as object,
        reason: reason ?? null,
        requestId,
      },
    });

  /** Applications waiting for a decision, oldest first. */
  app.get("/v1/admin/pro-applications", admin, async () => {
    const pending = await app.prisma.professionalProfile.findMany({
      where: { verificationStatus: "SERVICE_REVIEW" },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
      take: 50,
    });
    return { applications: await Promise.all(pending.map((p) => applicationView(app.prisma, p.id))) };
  });

  app.post("/v1/admin/professionals/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminDecisionSchema.parse(req.body);
    const pro = await app.prisma.professionalProfile.findUnique({ where: { id } });
    if (!pro) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No such professional" });
    const status = body.approve ? "APPROVED" : "DRAFT";
    await app.prisma.professionalProfile.update({ where: { id }, data: { verificationStatus: status } });
    await app.prisma.professionalDocument.updateMany({
      where: { professionalId: id, status: "PENDING" },
      data: { status: body.approve ? "VERIFIED" : "REJECTED" },
    });
    await audit(req.user!.userId, body.approve ? "PRO_ACCOUNT_APPROVED" : "PRO_ACCOUNT_REJECTED", "professional", id, { verificationStatus: pro.verificationStatus }, { verificationStatus: status }, body.reason, req.id);
    return reply.send(await applicationView(app.prisma, id));
  });

  app.post("/v1/admin/credentials/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminDecisionSchema.parse(req.body);
    const credential = await app.prisma.professionalCredential.findUnique({ where: { id } });
    if (!credential) return reply.status(404).send({ code: "CREDENTIAL_NOT_FOUND", message: "No such credential" });
    const after = {
      status: body.approve ? "VERIFIED" : "REJECTED",
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : credential.expiresAt,
    };
    await app.prisma.professionalCredential.update({ where: { id }, data: after });
    await audit(req.user!.userId, body.approve ? "CREDENTIAL_VERIFIED" : "CREDENTIAL_REJECTED", "credential", id, { status: credential.status }, after, body.reason, req.id);
    return reply.send(await applicationView(app.prisma, credential.professionalId));
  });

  app.post("/v1/admin/pro-services/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminDecisionSchema.parse(req.body);
    const ps = await app.prisma.professionalService.findUnique({
      where: { id },
      include: { professional: { include: { credentials: true } }, service: { include: { requirements: true } } },
    });
    if (!ps) return reply.status(404).send({ code: "PRO_SERVICE_NOT_FOUND", message: "No such application" });

    if (body.approve) {
      if (ps.professional.verificationStatus !== "APPROVED") {
        return reply.status(409).send({ code: "ACCOUNT_NOT_APPROVED", message: "Approve the account before its services" });
      }
      const evaluation = evaluateServiceCredentials(
        ps.service.requirements,
        ps.professional.credentials.filter((c) => c.serviceId === ps.serviceId)
      );
      if (!evaluation.satisfied) {
        return reply.status(409).send({
          code: "CREDENTIALS_NOT_SATISFIED",
          message: "The service's mandatory credentials are not all verified and current",
          missing: evaluation.missing,
          unverified: evaluation.unverified,
          expired: evaluation.expired,
        });
      }
    }
    const status = body.approve ? "APPROVED" : "DISABLED";
    await app.prisma.professionalService.update({ where: { id }, data: { status } });
    await audit(req.user!.userId, body.approve ? "PRO_SERVICE_APPROVED" : "PRO_SERVICE_REJECTED", "professional_service", id, { status: ps.status }, { status }, body.reason, req.id);
    return reply.send(await applicationView(app.prisma, ps.professionalId));
  });
}
