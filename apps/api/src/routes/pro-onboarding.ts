import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor, type ProApplicationView } from "@pro-now/types";
import {
  ACCOUNT_DOCUMENT_KINDS,
  proAreaSchema,
  proBusinessSchema,
  proCredentialSchema,
  proDocumentSchema,
  proJoinSchema,
  proPortraitSchema,
  proServicesSchema,
} from "@pro-now/validation";
import { grantRole } from "../auth/roles.js";
import { requireRole } from "../auth/access.js";
import { PILOT_MARKET_CODE } from "../config/market.js";

/**
 * JOINING AS A PROFESSIONAL (docs/21 W7; Amit, 2026-09-29).
 *
 * A professional receives work only after PRO NOW approves them: their
 * details, their documents, and each service on its own (CLAUDE.md §3,
 * verification per service). This file is the applicant's side; the
 * approvals are `admin-pros.ts`.
 *
 * What is required comes from the server, never from the screen: the
 * account documents everyone gives, and each service's own requirements
 * (`service_requirements`). A criminal-record certificate is never asked
 * for — demanding one is an offence in Israel (the research, 2026-09-29).
 *
 * Nothing here sets a price or a commission (CLAUDE.md §4): prices are the
 * professional's own, through `PATCH /v1/pro/services/:id/pricing`.
 */

const UNDER_REVIEW = new Set(["SERVICE_REVIEW", "APPROVED", "LIMITED"]);

async function professionalOf(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  const pro = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!pro) {
    reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "Join first: POST /v1/pro/join" });
    return null;
  }
  return pro;
}

async function readyUpload(db: PrismaClient, userId: string, uploadId: string) {
  return db.upload.findFirst({ where: { id: uploadId, ownerId: userId, status: "READY", kind: { in: ["DOCUMENT", "PHOTO"] } } });
}

export async function applicationView(db: PrismaClient, professionalId: string): Promise<ProApplicationView> {
  const pro = await db.professionalProfile.findUniqueOrThrow({
    where: { id: professionalId },
    include: {
      services: { include: { service: { include: { requirements: true } } }, orderBy: { createdAt: "asc" } },
      documents: true,
      credentials: true,
      businessProfile: true,
    },
  });
  const area = await db.serviceArea.findFirst({ where: { professionalId }, orderBy: { id: "desc" } });

  const missing: string[] = [];
  if (!pro.addressAs) missing.push("ADDRESS_AS");
  if (pro.services.length === 0) missing.push("SERVICES");
  if (!area) missing.push("AREA");
  if (!pro.businessProfile?.taxStatus) missing.push("TAX_STATUS");
  if (!pro.portraitKind) missing.push("PORTRAIT");
  for (const kind of ACCOUNT_DOCUMENT_KINDS) {
    if (!pro.documents.some((d) => d.kind === kind && d.status !== "REJECTED")) missing.push(`DOCUMENT:${kind}`);
  }

  const services = pro.services.map((ps) => {
    const priced =
      ps.basePriceMinorUnits !== null && (ps.service.priceModel !== "DISTANCE_TIME" || ps.perKmMinorUnits !== null);
    if (!priced) missing.push(`PRICE:${ps.service.code}`);
    const requirements = ps.service.requirements
      .filter((r) => credentialTypeFor(r.requirement) !== null)
      .map((r) => {
        const type = credentialTypeFor(r.requirement)!;
        const credential =
          [...pro.credentials].reverse().find((c) => c.serviceId === ps.serviceId && c.type === type && c.status !== "REJECTED") ?? null;
        if (r.mandatory && !credential) missing.push(`CREDENTIAL:${ps.service.code}:${r.requirement}`);
        return {
          requirement: r.requirement,
          mandatory: r.mandatory,
          credential: credential ? { id: credential.id, status: credential.status, number: credential.number } : null,
        };
      });
    return {
      id: ps.id,
      serviceId: ps.serviceId,
      code: ps.service.code,
      nameHe: ps.service.nameHe,
      priceModel: ps.service.priceModel,
      status: ps.status,
      priced,
      requirements,
    };
  });

  return {
    profile: {
      id: pro.id,
      displayName: pro.displayName,
      legalName: pro.legalName,
      addressAs: pro.addressAs,
      verificationStatus: pro.verificationStatus,
      business: pro.businessProfile?.taxStatus
        ? { tradingName: pro.businessProfile.tradingName, taxStatus: pro.businessProfile.taxStatus as "EXEMPT" | "LICENSED" | "COMPANY" }
        : null,
      // Their own photo is theirs to see: the screen opens it through /v1/media/:id (the owner may).
      portrait: pro.portraitKind === "PHOTO" || pro.portraitKind === "CHARACTER" ? { kind: pro.portraitKind, uploadId: pro.portraitUploadId } : null,
    },
    services,
    area: area ? { lat: area.centerLat, lng: area.centerLng, radiusKm: area.radiusMeters / 1000 } : null,
    documents: pro.documents.map((d) => ({ kind: d.kind, status: d.status })),
    missing,
    submitted: UNDER_REVIEW.has(pro.verificationStatus),
  };
}

export default async function proOnboardingRoutes(app: FastifyInstance) {
  const signedIn = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await reply.status(401).send({ code: "UNAUTHENTICATED", message: "Missing or invalid session" });
  };
  const pro = { onRequest: requireRole("PROFESSIONAL") };

  /** Any signed-in person may apply. The role grants nothing but the application itself. */
  app.post("/v1/pro/join", { onRequest: signedIn }, async (req, reply) => {
    const body = proJoinSchema.parse(req.body);
    const userId = req.user!.userId;
    await grantRole(app.prisma, userId, "PROFESSIONAL");
    const profile = await app.prisma.professionalProfile.upsert({
      where: { userId },
      update: { displayName: body.displayName, legalName: body.legalName, addressAs: body.addressAs },
      create: { userId, displayName: body.displayName, legalName: body.legalName, addressAs: body.addressAs },
    });
    return reply.send(await applicationView(app.prisma, profile.id));
  });

  /**
   * Where the professional stands right now (docs/21 W7): presence, the
   * open shift, the job they are on, and the services they may work.
   * The screen decides nothing from memory; it reads this.
   */
  app.get("/v1/pro/status", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [shift, activeJob, services, doneToday] = await Promise.all([
      app.prisma.availabilitySession.findFirst({ where: { professionalId: p.id, status: "ACTIVE" }, orderBy: { startedAt: "desc" } }),
      app.prisma.job.findFirst({
        where: { assignedProfessionalId: p.id, status: { in: ["PRO_ASSIGNED", "PRO_EN_ROUTE", "PRO_ARRIVED", "DIAGNOSIS", "WAITING_QUOTE_APPROVAL", "IN_PROGRESS", "COMPLETION_PENDING"] } },
        select: { id: true },
      }),
      app.prisma.professionalService.findMany({
        where: { professionalId: p.id, status: "APPROVED" },
        include: { service: { select: { id: true, code: true, nameHe: true } } },
      }),
      app.prisma.job.count({ where: { assignedProfessionalId: p.id, updatedAt: { gte: startOfDay }, status: { in: ["COMPLETED", "REVIEW_PENDING", "CLOSED"] } } }),
    ]);
    return reply.send({
      displayName: p.displayName,
      addressAs: p.addressAs,
      verificationStatus: p.verificationStatus,
      presenceState: p.presenceState,
      shiftId: shift?.id ?? null,
      activeJobId: activeJob?.id ?? null,
      approvedServices: services.map((s) => s.service),
      jobsToday: doneToday,
    });
  });

  /** What a professional may apply for: services open to professionals in the pilot market. */
  app.get("/v1/pro/services/open", pro, async () => {
    const open = await app.prisma.marketActivation.findMany({
      where: { marketCode: PILOT_MARKET_CODE, providerOnboardingEnabled: true },
      include: { service: { select: { id: true, code: true, nameHe: true, priceModel: true } } },
    });
    return {
      services: open
        .map((a) => a.service)
        .sort((a, b) => a.nameHe.localeCompare(b.nameHe, "he")),
    };
  });

  app.get("/v1/pro/application", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * The services applied for. Only services open to professionals in the
   * pilot market; an approved or pending one is never dropped from here
   * (withdrawing it is a decision with a review behind it, not an edit).
   */
  app.put("/v1/pro/application/services", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const { serviceIds } = proServicesSchema.parse(req.body);
    const open = await app.prisma.marketActivation.findMany({
      where: { marketCode: PILOT_MARKET_CODE, providerOnboardingEnabled: true, serviceId: { in: serviceIds } },
      select: { serviceId: true },
    });
    const openIds = new Set(open.map((o) => o.serviceId));
    const closed = serviceIds.filter((id) => !openIds.has(id));
    if (closed.length > 0) {
      return reply.status(422).send({ code: "SERVICE_NOT_OPEN", message: "Not open to professionals yet", fields: closed.map((id) => ({ path: "serviceIds", message: id })) });
    }
    await app.prisma.professionalService.deleteMany({
      where: { professionalId: p.id, status: "DRAFT", serviceId: { notIn: serviceIds } },
    });
    for (const serviceId of serviceIds) {
      await app.prisma.professionalService.upsert({
        where: { professionalId_serviceId: { professionalId: p.id, serviceId } },
        update: {},
        create: { professionalId: p.id, serviceId, status: "DRAFT" },
      });
    }
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * The business behind the professional. Entering it verifies nothing: the
   * customer-facing "עסק אומת" comes only from `verificationStatus`, which an
   * admin or a registry sets (docs/10 §Onboarding step 3).
   */
  app.put("/v1/pro/application/business", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proBusinessSchema.parse(req.body);
    const data = { tradingName: body.tradingName?.trim() || null, taxStatus: body.taxStatus };
    await app.prisma.businessProfile.upsert({ where: { professionalId: p.id }, update: data, create: { professionalId: p.id, ...data } });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  app.put("/v1/pro/application/area", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proAreaSchema.parse(req.body);
    await app.prisma.serviceArea.deleteMany({ where: { professionalId: p.id } });
    await app.prisma.serviceArea.create({
      data: { professionalId: p.id, centerLat: body.lat, centerLng: body.lng, radiusMeters: Math.round(body.radiusKm * 1000) },
    });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  app.post("/v1/pro/application/documents", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proDocumentSchema.parse(req.body);
    const upload = await readyUpload(app.prisma, req.user!.userId, body.uploadId);
    if (!upload) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "The document must be a ready upload of yours" });
    // A new copy replaces a pending one; a verified one stays until an admin decides otherwise.
    await app.prisma.professionalDocument.deleteMany({ where: { professionalId: p.id, kind: body.kind, status: "PENDING" } });
    await app.prisma.professionalDocument.create({
      data: { professionalId: p.id, kind: body.kind, storageRef: upload.storageKey, uploadId: upload.id, status: "PENDING" },
    });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * The face they join with: a ready photo of their own, or their trade's
   * character. The customer they are sent to sees it (D1, Dvir 2026-09-30:
   * a photo is approved as it is, for now; `domain/portrait.ts`).
   */
  app.put("/v1/pro/application/portrait", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proPortraitSchema.parse(req.body);
    if (body.kind === "PHOTO") {
      const upload = await app.prisma.upload.findFirst({ where: { id: body.uploadId, ownerId: req.user!.userId, status: "READY", kind: "PHOTO" } });
      if (!upload) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "The photo must be a ready photo upload of yours" });
      await app.prisma.professionalProfile.update({ where: { id: p.id }, data: { portraitKind: "PHOTO", portraitUploadId: upload.id } });
    } else {
      await app.prisma.professionalProfile.update({ where: { id: p.id }, data: { portraitKind: "CHARACTER", portraitUploadId: null } });
    }
    return reply.send(await applicationView(app.prisma, p.id));
  });

  app.post("/v1/pro/application/credentials", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proCredentialSchema.parse(req.body);
    const type = credentialTypeFor(body.requirement);
    const required = await app.prisma.serviceRequirement.findFirst({
      where: { serviceId: body.serviceId, requirement: body.requirement },
    });
    const applied = await app.prisma.professionalService.findUnique({
      where: { professionalId_serviceId: { professionalId: p.id, serviceId: body.serviceId } },
    });
    if (!type || !required || !applied) {
      return reply.status(422).send({ code: "NOT_A_REQUIREMENT", message: "This service does not require that document, or was not applied for" });
    }
    const upload = await readyUpload(app.prisma, req.user!.userId, body.uploadId);
    if (!upload) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "The document must be a ready upload of yours" });
    await app.prisma.professionalCredential.deleteMany({
      where: { professionalId: p.id, serviceId: body.serviceId, type, status: "PENDING" },
    });
    await app.prisma.professionalCredential.create({
      data: { professionalId: p.id, serviceId: body.serviceId, type, number: body.number ?? null, documentRef: upload.id, status: "PENDING" },
    });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /** Everything required is there: the services go to review, and so does the account. */
  app.post("/v1/pro/application/submit", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const view = await applicationView(app.prisma, p.id);
    if (view.missing.length > 0) {
      return reply.status(409).send({ code: "APPLICATION_INCOMPLETE", message: "Some required items are missing", missing: view.missing });
    }
    await app.prisma.professionalService.updateMany({ where: { professionalId: p.id, status: "DRAFT" }, data: { status: "PENDING" } });
    if (!UNDER_REVIEW.has(p.verificationStatus)) {
      await app.prisma.professionalProfile.update({ where: { id: p.id }, data: { verificationStatus: "SERVICE_REVIEW" } });
    }
    await app.prisma.auditLog.create({
      data: { actorId: req.user!.userId, action: "PRO_APPLICATION_SUBMITTED", targetType: "professional", targetId: p.id, requestId: req.id },
    });
    return reply.send(await applicationView(app.prisma, p.id));
  });
}
