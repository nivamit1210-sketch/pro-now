import type { FastifyInstance } from "fastify";
import { adminMarketChangeSchema, adminRoleChangeSchema } from "@pro-now/validation";
import { JOB_STATES } from "@pro-now/types";
import { requireRole } from "../auth/access.js";
import { currentCheck } from "../domain/identity-check.js";
import { applicationView } from "./pro-onboarding.js";

/**
 * THE ADMIN (docs/21 W8; the approvals themselves are admin-pros.ts).
 *
 * Every route requires ADMIN, and every change writes `audit_logs` with
 * who, what, before, after and why. Both are proved for every route, not
 * a sample (test/integration/admin.int.test.ts enumerates them).
 *
 * Personal data is shown only where the task needs it: a professional's
 * documents through links that expire in two minutes; a job's parties by
 * name and role. Nothing here edits a job's state: the state machine owns
 * that, and an operator's exceptions are their own epic.
 */
const LINK_SECONDS = 120;

export default async function adminRoutes(app: FastifyInstance) {
  const admin = { onRequest: requireRole("ADMIN") };
  const signed = (key: string) => app.providers.storage.createPresignedGet({ key, expiresInSeconds: LINK_SECONDS });

  /** One application, with its documents opened through short-lived links. */
  app.get("/v1/admin/professionals/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pro = await app.prisma.professionalProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, createdAt: true } },
        documents: { include: { upload: true } },
        portraitUpload: true,
        credentials: { include: { service: { select: { nameHe: true } } } },
        identityChecks: true,
      },
    });
    if (!pro) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No such professional" });
    const uploads = await app.prisma.upload.findMany({
      where: { id: { in: pro.credentials.map((c) => c.documentRef).filter((x): x is string => Boolean(x)) } },
    });
    const byId = new Map(uploads.map((u) => [u.id, u]));
    const check = currentCheck(pro.identityChecks);
    const photoRows = check ? await app.prisma.upload.findMany({ where: { id: { in: check.uploadIds } } }) : [];
    const urlFor = async (uploadId: string | undefined) => {
      const u = photoRows.find((r) => r.id === uploadId);
      return u ? signed(u.storageKey) : null;
    };
    const photos = check
      ? { idCard: await urlFor(check.uploadIds[0]), straight: await urlFor(check.uploadIds[1]), right: await urlFor(check.uploadIds[2]), left: await urlFor(check.uploadIds[3]) }
      : null;
    if (photos && Object.values(photos).some(Boolean)) {
      await app.prisma.auditLog.create({ data: { actorId: req.user!.userId, action: "IDENTITY_PHOTOS_VIEWED", targetType: "professional", targetId: id, requestId: req.id } });
    }
    return reply.send({
      identity:
        check && photos
          ? {
              id: check.id,
              status: check.status,
              vendorName: check.vendorName,
              isSandbox: check.isSandbox,
              method: check.method,
              submittedAt: check.createdAt.toISOString(),
              decidedAt: check.decidedAt?.toISOString() ?? null,
              decisionReason: check.decisionReason,
              photos,
              declared: { legalName: pro.legalName, dateOfBirth: pro.dateOfBirth?.toISOString().slice(0, 10) ?? null },
              provider: {
                nameMatch: check.nameMatch,
                livenessPassed: check.livenessPassed,
                documentValid: check.documentValid,
                reasonCodes: check.reasonCodes,
              },
            }
          : null,
      application: await applicationView(app.prisma, id),
      email: pro.user.email,
      joinedAt: pro.user.createdAt.toISOString(),
      documents: await Promise.all(
        pro.documents.map(async (d) => ({
          id: d.id,
          kind: d.kind,
          status: d.status,
          mime: d.upload?.mime ?? null,
          url: d.upload ? await signed(d.upload.storageKey) : null,
        }))
      ),
      portrait:
        pro.portraitKind === "PHOTO" || pro.portraitKind === "CHARACTER"
          ? {
              kind: pro.portraitKind,
              mime: pro.portraitUpload?.mime ?? null,
              url: pro.portraitUpload ? await signed(pro.portraitUpload.storageKey) : null,
            }
          : null,
      credentials: await Promise.all(
        pro.credentials.map(async (c) => {
          const u = c.documentRef ? byId.get(c.documentRef) : undefined;
          return {
            id: c.id,
            serviceNameHe: c.service.nameHe,
            type: c.type,
            number: c.number,
            status: c.status,
            expiresAt: c.expiresAt?.toISOString() ?? null,
            mime: u?.mime ?? null,
            url: u ? await signed(u.storageKey) : null,
          };
        })
      ),
    });
  });

  /** The job inspector: newest first, filterable by status. */
  app.get("/v1/admin/jobs", admin, async (req, reply) => {
    const { status } = req.query as { status?: string };
    // An unknown status is the caller's mistake (it was a 500: the database refused the enum).
    if (status && !(JOB_STATES as readonly string[]).includes(status)) {
      return reply.status(400).send({ code: "UNKNOWN_STATUS", message: `No such job status: ${status}` });
    }
    const jobs = await app.prisma.job.findMany({
      where: status ? { status: status as (typeof JOB_STATES)[number] } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        service: { select: { nameHe: true } },
        assignedProfessional: { select: { displayName: true } },
      },
    });
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        serviceNameHe: j.service.nameHe,
        professional: j.assignedProfessional?.displayName ?? null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    };
  });

  /** One job's whole story, from its events. */
  app.get("/v1/admin/jobs/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await app.prisma.job.findUnique({
      where: { id },
      include: {
        service: { select: { nameHe: true, code: true, priceModel: true } },
        address: { select: { formatted: true } },
        customer: { include: { user: { select: { email: true, name: true } } } },
        assignedProfessional: { select: { id: true, displayName: true } },
        events: { orderBy: { createdAt: "asc" } },
        offers: { orderBy: { offeredAt: "asc" }, include: { professional: { select: { displayName: true } } } },
        quotes: { orderBy: { version: "asc" }, include: { lineItems: true } },
        review: { select: { overallRating: true, text: true } },
      },
    });
    if (!job) return reply.status(404).send({ code: "JOB_NOT_FOUND", message: "No such job" });
    return reply.send({
      id: job.id,
      status: job.status,
      service: job.service,
      address: job.address?.formatted ?? null,
      description: job.description,
      customer: { name: job.customer.fullName ?? job.customer.user.name ?? null, email: job.customer.user.email },
      professional: job.assignedProfessional,
      onSite: job.onSiteName ? { name: job.onSiteName } : null,
      createdAt: job.createdAt.toISOString(),
      events: job.events.map((e) => ({ at: e.createdAt.toISOString(), type: e.type, actor: e.actor, metadata: e.metadata })),
      offers: job.offers.map((o) => ({
        at: o.offeredAt.toISOString(),
        professional: o.professional.displayName,
        status: o.status,
        etaSeconds: o.etaSecondsSnapshot,
      })),
      quotes: job.quotes.map((q) => ({ version: q.version, status: q.status, totalMinorUnits: q.totalMinorUnits, lines: q.lineItems.length })),
      review: job.review,
    });
  });

  /** Users by email, with their roles. */
  app.get("/v1/admin/users", admin, async (req) => {
    const { q } = req.query as { q?: string };
    const users = await app.prisma.user.findMany({
      where: q ? { email: { contains: q.trim().toLowerCase() } } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { roles: true, professionalProfile: { select: { id: true, verificationStatus: true } } },
    });
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roles: u.roles.map((r) => r.role),
        deleted: u.deletedAt !== null,
        professional: u.professionalProfile,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  });

  /**
   * Granting or removing CUSTOMER or PROFESSIONAL. ADMIN is not here: it
   * comes only from the ADMIN_EMAILS allowlist (docs/21 W1), so an admin
   * account cannot mint another one.
   */
  app.post("/v1/admin/users/:id/roles", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminRoleChangeSchema.parse(req.body);
    const user = await app.prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!user) return reply.status(404).send({ code: "USER_NOT_FOUND", message: "No such user" });
    const before = user.roles.map((r) => r.role);
    if (body.grant) {
      await app.prisma.userRole.createMany({ data: [{ userId: id, role: body.role }], skipDuplicates: true });
    } else {
      await app.prisma.userRole.deleteMany({ where: { userId: id, role: body.role } });
      // A professional without the role cannot be online.
      if (body.role === "PROFESSIONAL") {
        await app.prisma.professionalProfile.updateMany({ where: { userId: id, presenceState: "AVAILABLE" }, data: { presenceState: "OFFLINE" } });
      }
    }
    const after = (await app.prisma.userRole.findMany({ where: { userId: id } })).map((r) => r.role);
    await app.prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: body.grant ? "ROLE_GRANTED" : "ROLE_REVOKED",
        targetType: "user",
        targetId: id,
        beforeJson: { roles: before },
        afterJson: { roles: after },
        reason: body.reason,
        requestId: req.id,
      },
    });
    return reply.send({ roles: after });
  });

  /** Market activation, per service: visible to customers, open to professionals, dispatched. */
  app.get("/v1/admin/market", admin, async () => {
    const rows = await app.prisma.marketActivation.findMany({
      include: { service: { select: { code: true, nameHe: true } } },
      orderBy: { service: { nameHe: "asc" } },
    });
    return {
      activations: rows.map((r) => ({
        id: r.id,
        marketCode: r.marketCode,
        service: r.service,
        customerVisible: r.customerVisible,
        providerOnboardingEnabled: r.providerOnboardingEnabled,
        dispatchEnabled: r.dispatchEnabled,
      })),
    };
  });

  app.patch("/v1/admin/market/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = adminMarketChangeSchema.parse(req.body);
    const row = await app.prisma.marketActivation.findUnique({ where: { id } });
    if (!row) return reply.status(404).send({ code: "ACTIVATION_NOT_FOUND", message: "No such activation" });
    const { reason, ...change } = body;
    const before = { customerVisible: row.customerVisible, providerOnboardingEnabled: row.providerOnboardingEnabled, dispatchEnabled: row.dispatchEnabled };
    const updated = await app.prisma.marketActivation.update({ where: { id }, data: change });
    const after = { customerVisible: updated.customerVisible, providerOnboardingEnabled: updated.providerOnboardingEnabled, dispatchEnabled: updated.dispatchEnabled };
    await app.prisma.auditLog.create({
      data: { actorId: req.user!.userId, action: "MARKET_CHANGED", targetType: "market_activation", targetId: id, beforeJson: before, afterJson: after, reason, requestId: req.id },
    });
    return reply.send({ id, ...after });
  });

  /** What was suggested for a sentence, and what was chosen (W5; kept 4 days, D3). */
  app.get("/v1/admin/match-feedback", admin, async () => {
    const rows = await app.prisma.matchFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return {
      feedback: rows.map((r) => ({
        id: r.id,
        text: r.text,
        suggested: r.suggestedServiceIds,
        chosen: r.chosenServiceId,
        confidence: r.confidence,
        // The interesting rows: the customer chose something the matcher did not suggest first.
        missed: r.chosenServiceId !== null && r.suggestedServiceIds[0] !== r.chosenServiceId,
        at: r.createdAt.toISOString(),
      })),
    };
  });

  /** How much of the free tiers is used, against limits only when configured. */
  app.get("/v1/admin/usage", admin, async () => {
    const [users, professionals, jobsByStatus, storage, database] = await Promise.all([
      app.prisma.user.count({ where: { deletedAt: null } }),
      app.prisma.professionalProfile.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
      app.prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      app.prisma.upload.aggregate({ where: { status: "READY" }, _sum: { bytes: true }, _count: { _all: true } }),
      app.prisma.$queryRawUnsafe<Array<{ bytes: bigint }>>("SELECT pg_database_size(current_database()) AS bytes"),
    ]);
    return {
      users,
      professionals: Object.fromEntries(professionals.map((p) => [p.verificationStatus, p._count._all])),
      jobs: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count._all])),
      storage: { bytes: storage._sum.bytes ?? 0, files: storage._count._all, limitBytes: app.config.STORAGE_LIMIT_BYTES ?? null },
      database: { bytes: Number(database[0]?.bytes ?? 0), limitBytes: app.config.DATABASE_LIMIT_BYTES ?? null },
    };
  });
}
