import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor } from "@pro-now/types";

/**
 * A professional dispatch will offer a job to: approved account, the
 * service approved with their own visit fee, its documents current,
 * available, and a fresh location near (lat, lng).
 */
export async function dispatchablePro(db: PrismaClient, email: string, serviceId: string, lat: number, lng: number) {
  const user = await db.user.create({ data: { email, emailVerified: true, name: "Pat Pro" } });
  await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
  const profile = await db.professionalProfile.create({
    data: { userId: user.id, legalName: "Pat Pro", displayName: "Pat", verificationStatus: "APPROVED", presenceState: "AVAILABLE" },
  });
  await db.professionalService.create({
    data: { professionalId: profile.id, serviceId, status: "APPROVED", basePriceMinorUnits: 25000 },
  });
  const service = await db.service.findUniqueOrThrow({ where: { id: serviceId }, include: { requirements: true } });
  for (const r of service.requirements) {
    const type = credentialTypeFor(r.requirement);
    if (!type) continue;
    await db.professionalCredential.create({
      data: {
        professionalId: profile.id, serviceId, type, number: `T-${r.requirement}`, issuer: "test",
        status: "VERIFIED", expiresAt: new Date(Date.now() + 365 * 86400_000),
      },
    });
  }
  await db.professionalLocation.create({
    data: { professionalId: profile.id, lat: lat + 0.01, lng, accuracyMeters: 10, capturedAt: new Date(), receivedAt: new Date() },
  });
  return profile;
}

/** Offline, so the next file's job is never offered to this professional. */
export async function takeOffline(db: PrismaClient, professionalId: string | undefined) {
  if (professionalId) await db.professionalProfile.update({ where: { id: professionalId }, data: { presenceState: "OFFLINE" } });
}

async function applicantWith(db: PrismaClient, email: string, verificationStatus: "DRAFT" | "SERVICE_REVIEW") {
  const user = await db.user.create({ data: { email, emailVerified: true, name: "Rina Applicant" } });
  await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
  const profile = await db.professionalProfile.create({
    data: { userId: user.id, legalName: "רינה אברהם", displayName: "רינה", addressAs: "F", dateOfBirth: new Date("1990-05-14"), verificationStatus, portraitKind: "CHARACTER" },
  });
  await db.businessProfile.create({ data: { professionalId: profile.id, taxStatus: "LICENSED_DEALER" } });
  await db.serviceArea.create({ data: { professionalId: profile.id, centerLat: 31.25, centerLng: 34.79, radiusMeters: 10000 } });
  const open = await db.marketActivation.findFirstOrThrow({ where: { providerOnboardingEnabled: true, service: { priceModel: "VISIT_QUOTE" } } });
  await db.professionalService.create({ data: { professionalId: profile.id, serviceId: open.serviceId, status: "PENDING", basePriceMinorUnits: 25000 } });
  const upload = async (kind: string) =>
    db.upload.create({ data: { ownerId: user.id, kind, mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `test/${kind}-${crypto.randomUUID()}.jpg` } });
  const doc = await upload("DOCUMENT");
  await db.professionalDocument.create({ data: { professionalId: profile.id, kind: "TAX_FILE", storageRef: doc.storageKey, uploadId: doc.id } });
  const photos = [await upload("IDENTITY"), await upload("IDENTITY"), await upload("IDENTITY"), await upload("IDENTITY")].map((u) => u.id);
  await db.identityVerification.create({ data: { professionalId: profile.id, vendorName: "sandbox-identity", status: "MANUAL_REVIEW", uploadIds: photos } });
  return { id: profile.id, userId: user.id, email, serviceId: open.serviceId };
}

/** An application waiting for a reviewer: everything given, nothing decided (docs/10 §Review loop). */
export const applicantInReview = (db: PrismaClient, email: string) => applicantWith(db, email, "SERVICE_REVIEW");
/** The same application, still the professional's own to finish. */
export const draftApplicant = (db: PrismaClient, email: string) => applicantWith(db, email, "DRAFT");
