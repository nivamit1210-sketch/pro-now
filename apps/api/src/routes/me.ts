import type { FastifyInstance } from "fastify";
import type { JobStatus } from "@prisma/client";
import { avatarById } from "@pro-now/types";
import { customerOnboardingSchema, type MeResponse } from "@pro-now/validation";
import { requireRole } from "../auth/access.js";

/** A job someone is still inside: deleting now would strand the other side. */
const ACTIVE: JobStatus[] = [
  "SEARCHING",
  "OFFERING",
  "PRO_ASSIGNED",
  "PRO_EN_ROUTE",
  "PRO_ARRIVED",
  "DIAGNOSIS",
  "WAITING_QUOTE_APPROVAL",
  "IN_PROGRESS",
  "COMPLETION_PENDING",
  "PAYMENT_PENDING",
  "DISPUTED",
];

const ERASED = "[נמחק]";

export default async function meRoutes(app: FastifyInstance) {
  /** Who is signed in, and where they are in the first-run steps. */
  app.get("/v1/me", async (req, reply) => {
    if (!req.user) return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Missing or invalid session" });
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, customerProfile: true },
    });
    const c = user.customerProfile;
    const body: MeResponse = {
      user: { id: user.id, email: user.email, name: user.name },
      roles: req.user.roles,
      customer: req.user.roles.includes("CUSTOMER")
        ? { introSeen: Boolean(c?.introSeenAt), avatarId: c?.avatarId ?? null, avatarAnswered: c?.avatarAnswered ?? false }
        : null,
    };
    return reply.send(body);
  });

  /** The first-run answers: intro seen; avatar chosen or skipped. */
  app.patch("/v1/me/customer", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const body = customerOnboardingSchema.parse(req.body);
    if (body.avatarId && !avatarById(body.avatarId)) {
      return reply.status(400).send({ code: "UNKNOWN_AVATAR", message: "No such character" });
    }
    const data = {
      ...(body.introSeen ? { introSeenAt: new Date() } : {}),
      ...(body.avatarId !== undefined ? { avatarId: body.avatarId, avatarAnswered: true } : {}),
    };
    await app.prisma.customerProfile.upsert({
      where: { userId: req.user!.userId },
      update: data,
      create: { userId: req.user!.userId, ...data },
    });
    return reply.send({ ok: true });
  });

  /**
   * "Delete my account" (docs/21 W1): soft delete plus anonymisation.
   *
   * Direct identifiers are erased now: email, name, phone, photo, the
   * customer's name and addresses, and the professional's names. Every
   * way in (sessions, sign-in accounts, roles) is removed. Transactional
   * records (jobs, payments, reviews) stay, pointing at the anonymised
   * user, because other people's records depend on them. How long they
   * are kept is an open decision (18-ROADMAP §Open decisions, data
   * retention), not something this code decides.
   */
  app.delete("/v1/me", async (req, reply) => {
    if (!req.user) return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Missing or invalid session" });
    const { userId } = req.user;

    const active = await app.prisma.job.count({
      where: {
        status: { in: ACTIVE },
        OR: [{ customer: { userId } }, { assignedProfessional: { userId } }],
      },
    });
    if (active > 0) {
      return reply.status(409).send({
        code: "ACTIVE_JOB",
        message: "An account with a job in progress cannot be deleted until the job ends",
      });
    }

    await app.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: `deleted-${userId}@users.invalid`,
          emailVerified: false,
          name: "",
          phone: null,
          image: null,
        },
      });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.verification.deleteMany({ where: { identifier: before.email } });
      await tx.userRole.deleteMany({ where: { userId } });
      // What they typed to find a service: personal, and nobody else's record.
      await tx.matchFeedback.deleteMany({ where: { userId } });
      // Their inbox, their phones' push subscriptions, and mail not yet sent to them (W9).
      await tx.notification.deleteMany({ where: { userId } });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      await tx.emailOutbox.deleteMany({ where: { toEmail: before.email, status: "PENDING" } });

      const customer = await tx.customerProfile.findUnique({ where: { userId } });
      if (customer) {
        await tx.customerProfile.update({ where: { id: customer.id }, data: { fullName: null } });
        // The people they ordered for are not users and never agreed to be kept.
        await tx.job.updateMany({
          where: { customerId: customer.id },
          data: { onSiteName: null, onSitePhone: null, onSiteTokenHash: null, onSiteTokenExpiresAt: null },
        });
        await tx.address.updateMany({
          where: { customerId: customer.id },
          data: { formatted: ERASED, label: null, lat: 0, lng: 0 },
        });
      }
      await tx.professionalProfile.updateMany({
        where: { userId },
        data: { legalName: ERASED, displayName: ERASED, profilePhotoRef: null, presenceState: "OFFLINE" },
      });

      await tx.auditLog.create({
        data: { actorId: userId, action: "ACCOUNT_DELETED", targetType: "user", targetId: userId, requestId: req.id },
      });
    });

    return reply.send({ ok: true });
  });
}
