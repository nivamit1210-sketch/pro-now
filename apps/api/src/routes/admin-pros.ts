import type { FastifyInstance } from "fastify";
import { adminDecisionSchema, adminIdentityDecisionSchema } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";
import { evaluateServiceCredentials } from "../domain/dispatch/credential-eligibility.js";
import { accountApprovalBlocker, currentCheck } from "../domain/identity-check.js";
import { israelDay } from "../domain/credentials/expiry.js";
import { credentialTypeFor } from "@pro-now/types";
import { parseItem, serviceItem } from "../domain/review-loop.js";
import { cancelMarksFor, closeForRefusal, hasPendingReview, lockProfessional } from "../domain/review-loop-store.js";
import { applicationView, deleteIdentityPhotos } from "./pro-onboarding.js";

/**
 * APPROVING PROFESSIONALS (docs/21 W7; the screens are W8).
 *
 * Three decisions, each separate and each written to `audit_logs` with who
 * made it and why:
 *
 * - the ACCOUNT: the details and the documents everyone gives;
 * - IDENTITY: a person's decision on the current check; the account needs it, and 18 (docs/10).
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

  const audit = (actorId: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason: string | undefined, requestId: string, db: Pick<typeof app.prisma, "auditLog"> = app.prisma) =>
    db.auditLog.create({
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
    // Back after a round of fixes (docs/10 §Review loop): the latest sent round was answered by a resend.
    const latestSent = await app.prisma.reviewRound.findMany({
      where: { professionalId: { in: pending.map((p) => p.id) }, sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { professionalId: true, status: true },
      distinct: ["professionalId"],
    });
    const returned = new Set(latestSent.filter((r) => r.status === "ANSWERED").map((r) => r.professionalId));
    return {
      applications: await Promise.all(pending.map(async (p) => ({ ...(await applicationView(app.prisma, p.id)), returned: returned.has(p.id) }))),
    };
  });

  app.post("/v1/admin/professionals/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminDecisionSchema.parse(req.body);
    const outcome = await app.prisma.$transaction(async (tx) => {
      const exists = await tx.professionalProfile.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return { status: 404, body: { code: "PROFESSIONAL_NOT_FOUND", message: "No such professional" } };
      await lockProfessional(tx, id);
      const pro = await tx.professionalProfile.findUniqueOrThrow({ where: { id } });
      if (body.approve) {
        const checks = await tx.identityVerification.findMany({ where: { professionalId: id } });
        const blocker = accountApprovalBlocker({ dateOfBirth: pro.dateOfBirth, current: currentCheck(checks) }, new Date());
        if (blocker) return { status: 409, body: { code: blocker, message: "The account cannot be approved yet" } };
        // Sent back to the professional: approval waits for the resend, even with every request fixed or cancelled.
        if (pro.verificationStatus === "CHANGES_REQUESTED" || (await hasPendingReview(tx, id))) return { status: 409, body: { code: "FIXES_PENDING", message: "Items are marked for fixing; send or cancel them first" } };
      }
      const status = body.approve ? "APPROVED" : "DRAFT";
      await tx.professionalProfile.update({ where: { id }, data: { verificationStatus: status } });
      await tx.professionalDocument.updateMany({
        where: { professionalId: id, status: "PENDING" },
        data: { status: body.approve ? "VERIFIED" : "REJECTED" },
      });
      if (!body.approve) await closeForRefusal(tx, id);
      await audit(req.user!.userId, body.approve ? "PRO_ACCOUNT_APPROVED" : "PRO_ACCOUNT_REJECTED", "professional", id, { verificationStatus: pro.verificationStatus }, { verificationStatus: status }, body.reason, req.id, tx);
      return null;
    });
    if (outcome) return reply.status(outcome.status).send(outcome.body);
    return reply.send(await applicationView(app.prisma, id));
  });

  app.post("/v1/admin/identity/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminIdentityDecisionSchema.parse(req.body);
    const found = await app.prisma.identityVerification.findUnique({ where: { id } });
    if (!found) return reply.status(404).send({ code: "IDENTITY_NOT_FOUND", message: "No such identity check" });

    const status = body.action === "APPROVE" ? "VERIFIED" : "REJECTED";
    const actionName = body.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const outcome = await app.prisma.$transaction(async (tx) => {
      // Same lock as the professional's submit: a decision and a resubmission never interleave.
      await tx.$queryRawUnsafe(`SELECT id FROM professional_profiles WHERE id = $1 FOR UPDATE`, found.professionalId);
      const attempts = await tx.identityVerification.findMany({ where: { professionalId: found.professionalId } });
      const check = attempts.find((a) => a.id === id);
      if (!check || currentCheck(attempts)?.id !== check.id) return { code: "IDENTITY_NOT_CURRENT" as const, message: "A newer check replaced this one" };
      if (!["MANUAL_REVIEW", "PENDING"].includes(check.status)) return { code: "IDENTITY_ALREADY_DECIDED" as const, message: "Already decided" };
      const after = { status, method: body.action === "APPROVE" ? "MANUAL" : null, decidedById: req.user!.userId, decidedAt: new Date(), decisionReason: body.reason ?? null, uploadIds: [] as string[], photosDeletedAt: new Date() };
      await tx.identityVerification.update({ where: { id }, data: after });
      // What the photos were compared against, as it stood at the decision (the photos themselves are deleted).
      const pro = await tx.professionalProfile.findUniqueOrThrow({ where: { id: check.professionalId }, select: { legalName: true, dateOfBirth: true } });
      const declared = { legalName: pro.legalName, dateOfBirth: pro.dateOfBirth ? pro.dateOfBirth.toISOString().slice(0, 10) : null };
      await cancelMarksFor(tx, check.professionalId, (k) => k === "IDENTITY");
      await audit(req.user!.userId, `IDENTITY_${actionName}`, "professional", check.professionalId, { status: check.status }, { status, method: after.method, declared }, body.reason, req.id, tx);
      return { code: null, uploadIds: check.uploadIds };
    });
    if (outcome.code) return reply.status(409).send({ code: outcome.code, message: outcome.message });
    // Kept only until this decision (Dvir, 2026-10-02); deleted after the commit, from the list read under the lock.
    await deleteIdentityPhotos(app, outcome.uploadIds);
    return reply.send(await applicationView(app.prisma, found.professionalId));
  });

  app.post("/v1/admin/credentials/:id/decision", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminDecisionSchema.parse(req.body);
    const credential = await app.prisma.professionalCredential.findUnique({ where: { id } });
    if (!credential) return reply.status(404).send({ code: "CREDENTIAL_NOT_FOUND", message: "No such credential" });
    // docs/10 §Life after approval: a verified credential always says when it expires, or that it doesn't.
    if (body.approve) {
      if (!body.expiresAt && body.noExpiry !== true) return reply.status(422).send({ code: "EXPIRY_REQUIRED", message: "Enter the expiry date, or mark it as having none" });
      if (body.expiresAt && israelDay(new Date(body.expiresAt)) <= israelDay(new Date())) return reply.status(422).send({ code: "EXPIRY_IN_PAST", message: "התאריך כבר עבר" });
    }
    const after = {
      status: body.approve ? "VERIFIED" : "REJECTED",
      expiresAt: body.approve ? (body.expiresAt ? new Date(body.expiresAt) : null) : credential.expiresAt,
      noExpiry: body.approve ? body.noExpiry === true : credential.noExpiry,
    };
    await app.prisma.$transaction(async (tx) => {
      await lockProfessional(tx, credential.professionalId);
      await tx.professionalCredential.update({ where: { id }, data: after });
      // A new date (or "no expiry") starts the warnings over; the same date keeps what was sent.
      if (after.noExpiry !== credential.noExpiry || (after.expiresAt?.getTime() ?? null) !== (credential.expiresAt?.getTime() ?? null)) {
        await tx.credentialNotice.deleteMany({ where: { credentialId: id } });
      }
      await cancelMarksFor(tx, credential.professionalId, (k) => {
        const p = parseItem(k);
        return p?.kind === "CREDENTIAL" && p.serviceId === credential.serviceId && credentialTypeFor(p.requirement) === credential.type;
      });
      await audit(req.user!.userId, body.approve ? "CREDENTIAL_VERIFIED" : "CREDENTIAL_REJECTED", "credential", id, { status: credential.status }, after, body.reason, req.id, tx);
    });
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
    await app.prisma.$transaction(async (tx) => {
      await lockProfessional(tx, ps.professionalId);
      await tx.professionalService.update({ where: { id }, data: { status } });
      await cancelMarksFor(tx, ps.professionalId, (k) => k === serviceItem(ps.serviceId));
      await audit(req.user!.userId, body.approve ? "PRO_SERVICE_APPROVED" : "PRO_SERVICE_REJECTED", "professional_service", id, { status: ps.status }, { status }, body.reason, req.id, tx);
    });
    return reply.send(await applicationView(app.prisma, ps.professionalId));
  });
}
