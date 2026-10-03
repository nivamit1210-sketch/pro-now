import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor, type ProApplicationView } from "@pro-now/types";
import {
  ACCOUNT_DOCUMENT_KINDS,
  proAreaSchema,
  proBusinessSchema,
  proCredentialSchema,
  proDocumentSchema,
  proIdentitySchema,
  proJoinSchema,
  proPortraitSchema,
  proShopSchema, proVehicleSchema,
  proServicesSchema,
} from "@pro-now/validation";
import { ageOn, currentCheck, MINIMUM_AGE } from "../domain/identity-check.js";
import { grantRole } from "../auth/roles.js";
import { requireRole } from "../auth/access.js";
import { PILOT_MARKET_CODE } from "../config/market.js";
import { credentialItem, documentItem, serviceItem, valuesChanged } from "../domain/review-loop.js";
import { answerRound, currentRoundRequests, lockProfessional, recordChange } from "../domain/review-loop-store.js";

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
 *
 * Every save here tells the review loop what really changed (docs/10
 * §Review loop: `recordChange`): a real change to an item the reviewer
 * asked about fixes that request; a save of the same values fixes nothing.
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

/** Deletes identity photos from storage and their upload rows. A storage failure leaves the row for the clean-up to retry. */
export async function deleteIdentityPhotos(app: FastifyInstance, uploadIds: readonly string[]): Promise<void> {
  if (uploadIds.length === 0) return;
  const uploads = await app.prisma.upload.findMany({ where: { id: { in: [...uploadIds] } } });
  for (const u of uploads) {
    try {
      await app.providers.storage.delete(u.storageKey);
      await app.prisma.upload.delete({ where: { id: u.id } });
    } catch (err) {
      app.log.warn({ err, uploadId: u.id }, "identity photo not deleted; the media clean-up retries");
    }
  }
}

export async function applicationView(db: PrismaClient, professionalId: string): Promise<ProApplicationView> {
  const pro = await db.professionalProfile.findUniqueOrThrow({
    where: { id: professionalId },
    include: {
      services: { include: { service: { include: { requirements: true } } }, orderBy: { createdAt: "asc" } },
      documents: true,
      credentials: true,
      businessProfile: true,
      identityChecks: true,
    },
  });
  const area = await db.serviceArea.findFirst({ where: { professionalId }, orderBy: { id: "desc" } });

  const missing: string[] = [];
  if (!pro.addressAs) missing.push("ADDRESS_AS");
  if (!pro.dateOfBirth) missing.push("DATE_OF_BIRTH");
  if (pro.services.length === 0) missing.push("SERVICES");
  if (!area) missing.push("AREA");
  if (!pro.businessProfile?.taxStatus) missing.push("TAX_STATUS");
  if (!pro.portraitKind) missing.push("PORTRAIT");
  const identity = currentCheck(pro.identityChecks);
  if (!identity || !["MANUAL_REVIEW", "PENDING", "VERIFIED"].includes(identity.status)) missing.push("IDENTITY");
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
      dateOfBirth: pro.dateOfBirth ? pro.dateOfBirth.toISOString().slice(0, 10) : null,
      vehicle: { vehicleHe: pro.vehicleHe, plateTail: pro.vehiclePlateTail },
      verificationStatus: pro.verificationStatus,
      shop: pro.shopName && pro.shopBrandColor ? { name: pro.shopName, brandColor: pro.shopBrandColor, logoUploadId: pro.shopLogoUploadId } : null,
      business: pro.businessProfile?.taxStatus
        ? { tradingName: pro.businessProfile.tradingName, taxStatus: pro.businessProfile.taxStatus as "EXEMPT" | "LICENSED" | "COMPANY" }
        : null,
      // Their own photo is theirs to see: the screen opens it through /v1/media/:id (the owner may).
      portrait: pro.portraitKind === "PHOTO" || pro.portraitKind === "CHARACTER" ? { kind: pro.portraitKind, uploadId: pro.portraitUploadId } : null,
    },
    services,
    area: area ? { lat: area.centerLat, lng: area.centerLng, radiusKm: area.radiusMeters / 1000 } : null,
    documents: pro.documents.map((d) => ({ kind: d.kind, status: d.status })),
    identity: identity
      ? { id: identity.id, status: identity.status, submittedAt: identity.createdAt.toISOString(), reasonHe: ["RETAKE_REQUESTED", "REJECTED"].includes(identity.status) ? identity.decisionReason : null }
      : null,
    missing,
    submitted: UNDER_REVIEW.has(pro.verificationStatus),
    fixRequests: await currentRoundRequests(db, professionalId),
    changesRequested: pro.verificationStatus === "CHANGES_REQUESTED",
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
    const dateOfBirth = new Date(`${body.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Not a date of birth", fields: [{ path: "dateOfBirth", message: "invalid" }] });
    }
    if (ageOn(dateOfBirth, new Date()) < MINIMUM_AGE) {
      return reply.status(422).send({ code: "UNDER_MINIMUM_AGE", message: `Professionals join from age ${MINIMUM_AGE}` });
    }
    await grantRole(app.prisma, userId, "PROFESSIONAL");
    const before = await app.prisma.professionalProfile.findUnique({ where: { userId } });
    const profile = await app.prisma.professionalProfile.upsert({
      where: { userId },
      update: { displayName: body.displayName, legalName: body.legalName, addressAs: body.addressAs, dateOfBirth },
      create: { userId, displayName: body.displayName, legalName: body.legalName, addressAs: body.addressAs, dateOfBirth },
    });
    // The first join creates the details; nothing could have been asked about them yet.
    const changed = before !== null && valuesChanged(
      { displayName: before.displayName, legalName: before.legalName, addressAs: before.addressAs, dateOfBirth: before.dateOfBirth },
      { displayName: profile.displayName, legalName: profile.legalName, addressAs: profile.addressAs, dateOfBirth: profile.dateOfBirth },
    );
    await recordChange(app.prisma, { professionalId: profile.id, itemKey: "DETAILS", actorId: userId, requestId: req.id, changed });
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
    // The shift clock and its count start at the server's own start time, not the screen's.
    const shiftJobs = shift
      ? await app.prisma.job.count({ where: { assignedProfessionalId: p.id, updatedAt: { gte: shift.startedAt }, status: { in: ["COMPLETED", "REVIEW_PENDING", "CLOSED"] } } })
      : 0;
    return reply.send({
      displayName: p.displayName,
      addressAs: p.addressAs,
      verificationStatus: p.verificationStatus,
      presenceState: p.presenceState,
      shiftId: shift?.id ?? null,
      shiftStartedAt: shift?.startedAt.toISOString() ?? null,
      shiftJobs,
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
    const dropped = await app.prisma.professionalService.findMany({
      where: { professionalId: p.id, status: "DRAFT", serviceId: { notIn: serviceIds } },
      select: { serviceId: true },
    });
    await app.prisma.professionalService.deleteMany({
      where: { professionalId: p.id, status: "DRAFT", serviceId: { notIn: serviceIds } },
    });
    for (const d of dropped) {
      await recordChange(app.prisma, { professionalId: p.id, itemKey: serviceItem(d.serviceId), actorId: req.user!.userId, requestId: req.id, changed: true });
    }
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
    const before = await app.prisma.businessProfile.findUnique({ where: { professionalId: p.id } });
    await app.prisma.businessProfile.upsert({ where: { professionalId: p.id }, update: data, create: { professionalId: p.id, ...data } });
    const changed = valuesChanged({ tradingName: before?.tradingName ?? null, taxStatus: before?.taxStatus ?? null }, data);
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "DETAILS", actorId: req.user!.userId, requestId: req.id, changed });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * Their car (audit v2 #8a): asked in the details step, changed from the
   * profile tab, never required. Of the plate only its last 2-3 digits are
   * accepted — a full one is refused (VALIDATION_FAILED), not trimmed — and
   * the database holds the same line. A customer is told it only while a
   * visit with them is on (domain/vehicle.ts).
   */
  app.put("/v1/pro/application/vehicle", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proVehicleSchema.parse(req.body);
    await app.prisma.professionalProfile.update({
      where: { id: p.id },
      data: { vehicleHe: body.vehicleHe, vehiclePlateTail: body.plateTail },
    });
    const changed = valuesChanged({ vehicleHe: p.vehicleHe, plateTail: p.vehiclePlateTail }, { vehicleHe: body.vehicleHe, plateTail: body.plateTail });
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "DETAILS", actorId: req.user!.userId, requestId: req.id, changed });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * Their shop (sync item E). Never required: "דלג — אעצב את החנות אחר כך"
   * is the one skip joining allows (Amit, 2026-09-30). The logo must be a
   * ready photo of their own.
   */
  app.put("/v1/pro/application/shop", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proShopSchema.parse(req.body);
    if (body.logoUploadId) {
      const logo = await app.prisma.upload.findFirst({ where: { id: body.logoUploadId, ownerId: req.user!.userId, status: "READY", kind: "PHOTO" } });
      if (!logo) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "The logo must be a ready photo upload of yours" });
    }
    const shop = { shopName: body.name.trim(), shopBrandColor: body.brandColor.toUpperCase(), shopLogoUploadId: body.logoUploadId ?? null };
    await app.prisma.professionalProfile.update({ where: { id: p.id }, data: shop });
    const changed = valuesChanged({ shopName: p.shopName, shopBrandColor: p.shopBrandColor, shopLogoUploadId: p.shopLogoUploadId }, shop);
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "SHOP", actorId: req.user!.userId, requestId: req.id, changed });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  app.put("/v1/pro/application/area", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proAreaSchema.parse(req.body);
    const before = await app.prisma.serviceArea.findFirst({ where: { professionalId: p.id }, orderBy: { id: "desc" } });
    const area = { centerLat: body.lat, centerLng: body.lng, radiusMeters: Math.round(body.radiusKm * 1000) };
    await app.prisma.serviceArea.deleteMany({ where: { professionalId: p.id } });
    await app.prisma.serviceArea.create({ data: { professionalId: p.id, ...area } });
    const changed = !before || valuesChanged({ centerLat: before.centerLat, centerLng: before.centerLng, radiusMeters: before.radiusMeters }, area);
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "AREA", actorId: req.user!.userId, requestId: req.id, changed });
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
    // A new copy is always a change.
    await recordChange(app.prisma, { professionalId: p.id, itemKey: documentItem(body.kind), actorId: req.user!.userId, requestId: req.id, changed: true });
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
    }
    const portrait = body.kind === "PHOTO" ? { portraitKind: "PHOTO", portraitUploadId: body.uploadId } : { portraitKind: "CHARACTER", portraitUploadId: null };
    await app.prisma.professionalProfile.update({ where: { id: p.id }, data: portrait });
    const changed = valuesChanged({ portraitKind: p.portraitKind, portraitUploadId: p.portraitUploadId }, portrait);
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "PORTRAIT", actorId: req.user!.userId, requestId: req.id, changed });
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
    await recordChange(app.prisma, { professionalId: p.id, itemKey: credentialItem(body.serviceId, body.requirement), actorId: req.user!.userId, requestId: req.id, changed: true });
    return reply.send(await applicationView(app.prisma, p.id));
  });

  /**
   * The identity check (docs/10 §Identity check in the app). Four identity
   * photos of their own go to the provider; the sandbox always answers
   * MANUAL_REVIEW and a person decides (admin-pros.ts). A retake replaces an
   * undecided check, and its photos are deleted (Dvir, 2026-10-02: kept only
   * until a decision, and a replaced check will never get one).
   */
  const ALREADY_VERIFIED = { code: "IDENTITY_ALREADY_VERIFIED", message: "Identity is already verified" };
  const IDENTITY_REJECTED = { code: "IDENTITY_REJECTED", message: "The identity check was refused; a refusal is final" };
  app.post("/v1/pro/application/identity", pro, async (req, reply) => {
    const p = await professionalOf(app, req, reply);
    if (!p) return;
    const body = proIdentitySchema.parse(req.body);
    const ids = [body.documentUploadId, ...body.selfieUploadIds];
    if (new Set(ids).size !== 4) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "Four different photos" });
    const uploads = await app.prisma.upload.findMany({ where: { id: { in: ids }, ownerId: req.user!.userId, status: "READY", kind: "IDENTITY" } });
    if (uploads.length !== 4) return reply.status(422).send({ code: "UPLOAD_NOT_READY", message: "The photos must be ready identity uploads of yours" });

    const sameFour = (a: { uploadIds: string[] }) => a.uploadIds.length === 4 && a.uploadIds.every((id, i) => id === ids[i]);
    const first = currentCheck(await app.prisma.identityVerification.findMany({ where: { professionalId: p.id } }));
    if (first?.status === "VERIFIED") return reply.status(409).send(ALREADY_VERIFIED);
    // A refusal is final (docs/10): no new check over it.
    if (first?.status === "REJECTED") return reply.status(409).send(IDENTITY_REJECTED);
    // The same four photos again (a double tap): the same answer, no second attempt.
    if (first && sameFour(first)) return reply.send(await applicationView(app.prisma, p.id));

    // The provider is called outside the transaction: no row lock is held across it.
    const result = await app.providers.identity.submit({
      professionalId: p.id,
      documentImageRef: uploads.find((u) => u.id === body.documentUploadId)!.storageKey,
      selfieImageRef: uploads.find((u) => u.id === body.selfieUploadIds[0])!.storageKey,
      declaredLegalName: p.legalName,
      declaredDateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : "",
    });

    const outcome = await app.prisma.$transaction(async (tx) => {
      // One submission at a time per professional; what follows reads fresh.
      await tx.$queryRawUnsafe(`SELECT id FROM professional_profiles WHERE id = $1 FOR UPDATE`, p.id);
      const attempts = await tx.identityVerification.findMany({ where: { professionalId: p.id } });
      const current = currentCheck(attempts);
      if (current?.status === "VERIFIED") return { conflict: ALREADY_VERIFIED, created: false, replacedUploadIds: [] as string[] };
      if (current?.status === "REJECTED") return { conflict: IDENTITY_REJECTED, created: false, replacedUploadIds: [] as string[] };
      if (current && sameFour(current)) return { conflict: null, created: false, replacedUploadIds: [] as string[] };
      const replaced = attempts.filter((a) => a.status === "MANUAL_REVIEW" || a.status === "PENDING");
      await tx.identityVerification.create({
        data: {
          professionalId: p.id,
          vendorName: app.providers.identity.vendorName,
          isSandbox: app.providers.identity.isSandbox,
          status: result.status,
          method: result.status === "VERIFIED" ? "VENDOR" : null,
          verificationId: result.verificationId,
          uploadIds: ids,
          nameMatch: result.nameMatch,
          livenessPassed: result.livenessPassed,
          documentValid: result.documentValid,
          reasonCodes: result.reasonCodes,
        },
      });
      for (const a of replaced) {
        await tx.identityVerification.update({ where: { id: a.id }, data: { status: "SUPERSEDED", uploadIds: [], photosDeletedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: { actorId: req.user!.userId, action: "IDENTITY_SUBMITTED", targetType: "professional", targetId: p.id, afterJson: { status: result.status, vendor: app.providers.identity.vendorName }, requestId: req.id },
      });
      // A photo the new check reuses stays: it belongs to the live check now.
      return { conflict: null, created: true, replacedUploadIds: replaced.flatMap((a) => a.uploadIds).filter((id) => !ids.includes(id)) };
    });
    if (outcome.conflict) return reply.status(409).send(outcome.conflict);
    // Only a new attempt is a change; the same four photos again are not.
    await recordChange(app.prisma, { professionalId: p.id, itemKey: "IDENTITY", actorId: req.user!.userId, requestId: req.id, changed: outcome.created });
    await deleteIdentityPhotos(app, outcome.replacedUploadIds);
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
    // One transaction under the professional's lock: a resend never interleaves with a send or a fix (docs/10 §Review loop).
    const answer = await app.prisma.$transaction(async (tx) => {
      await lockProfessional(tx, p.id);
      const a = await answerRound(tx, p.id);
      if (a.code === "FIXES_OPEN") return a;
      await tx.professionalService.updateMany({ where: { professionalId: p.id, status: "DRAFT" }, data: { status: "PENDING" } });
      // Read fresh under the lock. CHANGES_REQUESTED is not in UNDER_REVIEW, so a resend after fixes goes back to SERVICE_REVIEW — the queue.
      const fresh = await tx.professionalProfile.findUniqueOrThrow({ where: { id: p.id } });
      if (!UNDER_REVIEW.has(fresh.verificationStatus)) {
        await tx.professionalProfile.update({ where: { id: p.id }, data: { verificationStatus: "SERVICE_REVIEW" } });
      }
      await tx.auditLog.create({
        data: { actorId: req.user!.userId, action: "PRO_APPLICATION_SUBMITTED", targetType: "professional", targetId: p.id, requestId: req.id },
      });
      return a;
    });
    if (answer.code === "FIXES_OPEN") {
      return reply.status(409).send({ code: "FIXES_OPEN", message: "Some requested fixes are still open", open: answer.open });
    }
    return reply.send(await applicationView(app.prisma, p.id));
  });
}
