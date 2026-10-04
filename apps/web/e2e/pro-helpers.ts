import { request, type APIRequestContext } from "@playwright/test";
import { asPerson } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { credentialTypeFor } from "@pro-now/types";
import { linkFor, uniqueEmail } from "./helpers";

/**
 * A professional dispatch will actually offer a job to (docs/21 W6): an
 * approved account, the service approved with their own visit fee, its
 * documents current, available, and a fresh location. The professional's
 * own screens are W7, so here they act through the API.
 */
export async function dispatchableProfessional(opts: {
  serviceCode: string;
  lat: number;
  lng: number;
  baseURL: string;
  offline?: boolean;
  addressAs?: "M" | "F";
  /** Their car, as joining saves it (audit v2 #8a): free text and the plate's last digits. */
  vehicle?: { vehicleHe: string | null; plateTail: string | null };
}) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const email = uniqueEmail("e2e-pro");
  let professionalId = "";
  try {
    const service = await db.service.findUniqueOrThrow({ where: { code: opts.serviceCode }, include: { requirements: true } });
    const user = await db.user.create({ data: { email, emailVerified: true, name: "דנה" } });
    await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
    const profile = await db.professionalProfile.create({
      data: {
        userId: user.id,
        legalName: "דנה לוי",
        displayName: "דנה",
        addressAs: opts.addressAs ?? "F",
        vehicleHe: opts.vehicle?.vehicleHe ?? null,
        vehiclePlateTail: opts.vehicle?.plateTail ?? null,
        verificationStatus: "APPROVED",
        // Offline: the professional goes online from their own screen (W7).
        presenceState: opts.offline ? "OFFLINE" : "AVAILABLE",
      },
    });
    professionalId = profile.id;
    await db.professionalService.create({
      data: { professionalId: profile.id, serviceId: service.id, status: "APPROVED", basePriceMinorUnits: 18000 },
    });
    for (const r of service.requirements) {
      const type = credentialTypeFor(r.requirement);
      if (!type) continue;
      await db.professionalCredential.create({
        data: {
          professionalId: profile.id, serviceId: service.id, type, number: `E2E-${r.requirement}`, issuer: "e2e",
          status: "VERIFIED", expiresAt: new Date(Date.now() + 365 * 86400_000),
        },
      });
    }
    await db.professionalLocation.create({
      data: { professionalId: profile.id, lat: opts.lat + 0.01, lng: opts.lng, accuracyMeters: 10, capturedAt: new Date(), receivedAt: new Date() },
    });
  } finally {
    await db.$disconnect();
  }

  // Signed in the way a person is: an email link, opened.
  const api = await request.newContext({ baseURL: opts.baseURL, extraHTTPHeaders: { origin: opts.baseURL, ...asPerson() } });
  await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } });
  await api.get(await linkFor(email), { maxRedirects: 5 });
  return Object.assign(new Professional(api, professionalId), { email });
}

export class Professional {
  constructor(
    private readonly api: APIRequestContext,
    private readonly professionalId: string
  ) {}

  private async post(path: string, data: unknown = {}, idem?: string) {
    const res = await this.api.post(`/api/v1${path}`, { data, headers: idem ? { "idempotency-key": idem } : {} });
    if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  /**
   * Accepts the offer for THIS job. An offer for any other job (another
   * test's, or one still being searched from an earlier run) is skipped,
   * so the test depends on nothing else in the database.
   */
  async acceptOfferFor(jobId: string): Promise<void> {
    for (let i = 0; i < 80; i++) {
      const res = await this.api.get("/api/v1/pro/offers/current");
      // No offer waiting is an empty answer, not an error.
      const raw = res.ok() ? await res.text() : "";
      const offer = raw ? (JSON.parse(raw) as { offerId?: string; jobId?: string }) : null;
      if (offer?.offerId && offer.jobId === jobId) {
        await this.post(`/offers/${offer.offerId}/accept`, {}, `acc-${Date.now()}`);
        return;
      }
      if (offer?.offerId) await this.post(`/offers/${offer.offerId}/skip`);
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No offer for job ${jobId} reached the professional`);
  }

  /** The server's own view of this professional: presence and the open shift. */
  async status(): Promise<{ presenceState: string; shiftId: string | null }> {
    const res = await this.api.get("/api/v1/pro/status");
    if (!res.ok()) throw new Error(`/pro/status: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  step(jobId: string, step: "en-route" | "arrive" | "start" | "complete") {
    return this.post(`/jobs/${jobId}/${step}`);
  }

  quote(jobId: string, unitPriceMinorUnits: number) {
    return this.post(`/jobs/${jobId}/quotes`, {
      lineItems: [{ description: "החלפת סיפון", quantity: 1, unitPriceMinorUnits, kind: "MATERIALS" }],
    });
  }

  /** Offline, so a later test's job is never offered to this professional. */
  async dispose() {
    await this.api.dispose();
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    try {
      await db.professionalProfile.update({ where: { id: this.professionalId }, data: { presenceState: "OFFLINE" } });
    } finally {
      await db.$disconnect();
    }
  }
}

/** The test server's admin (playwright.config.ts), signed in through the API. */
export async function adminApi(baseURL: string) {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL, ...asPerson() } });
  const email = "e2e-admin@pronow.test";
  await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/" } });
  await api.get(await linkFor(email), { maxRedirects: 5 });
  return api;
}

/** An application waiting for review (docs/21 W8): identity, account, one service, its licences and documents pending; the trade's character as the photo, and nothing missing. */
export async function pendingApplicant(serviceCode: string, displayName: string) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const service = await db.service.findUniqueOrThrow({ where: { code: serviceCode }, include: { requirements: true } });
    const email = uniqueEmail("e2e-applicant");
    const user = await db.user.create({ data: { email, emailVerified: true, name: displayName } });
    await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
    const profile = await db.professionalProfile.create({
      data: { userId: user.id, legalName: `${displayName} כהן`, displayName, addressAs: "M", verificationStatus: "SERVICE_REVIEW", dateOfBirth: new Date("1988-04-12"), portraitKind: "CHARACTER" },
    });
    // Complete, as a sent application is: the professional can resend it after a round of fixes (docs/10 §Review loop).
    await db.businessProfile.create({ data: { professionalId: profile.id, taxStatus: "EXEMPT" } });
    await db.professionalService.create({ data: { professionalId: profile.id, serviceId: service.id, status: "PENDING", basePriceMinorUnits: 20000 } });
    await db.serviceArea.create({ data: { professionalId: profile.id, centerLat: 32.08, centerLng: 34.78, radiusMeters: 10_000 } });
    for (const kind of ["TAX_FILE"]) {
      const u = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/${kind}.jpg` } });
      await db.professionalDocument.create({ data: { professionalId: profile.id, kind, storageRef: u.storageKey, uploadId: u.id } });
    }
    // The identity check (docs/10): the ID card and three face photos, waiting for a person.
    const uploadIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const u = await db.upload.create({ data: { ownerId: user.id, kind: "IDENTITY", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/identity-${i}.jpg` } });
      uploadIds.push(u.id);
    }
    await db.identityVerification.create({ data: { professionalId: profile.id, vendorName: "sandbox-identity", isSandbox: true, status: "MANUAL_REVIEW", uploadIds } });
    for (const r of service.requirements) {
      const type = credentialTypeFor(r.requirement);
      if (!type) continue;
      const u = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/${type}.jpg` } });
      await db.professionalCredential.create({ data: { professionalId: profile.id, serviceId: service.id, type, number: "77777", documentRef: u.id, status: "PENDING" } });
    }
    return { professionalId: profile.id, email };
  } finally {
    await db.$disconnect();
  }
}

/**
 * An approved professional whose first licence runs out in `days` days
 * (docs/10 §Life after approval): verified identity and date of birth, the
 * service approved, every document current except that licence. The
 * professional signs in themselves, as a person does.
 */
export async function approvedProWithExpiringCredential(days: number, serviceCode = "HOME_PLUMB_LEAK") {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const service = await db.service.findUniqueOrThrow({ where: { code: serviceCode }, include: { requirements: true } });
    const email = uniqueEmail("e2e-renewal");
    const displayName = `שרה${Date.now() % 100000}`;
    const user = await db.user.create({ data: { email, emailVerified: true, name: displayName } });
    await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
    const profile = await db.professionalProfile.create({
      data: { userId: user.id, legalName: `${displayName} כהן`, displayName, addressAs: "F", verificationStatus: "APPROVED", dateOfBirth: new Date("1988-04-12"), portraitKind: "CHARACTER" },
    });
    await db.businessProfile.create({ data: { professionalId: profile.id, taxStatus: "EXEMPT" } });
    await db.serviceArea.create({ data: { professionalId: profile.id, centerLat: 32.08, centerLng: 34.78, radiusMeters: 10_000 } });
    await db.identityVerification.create({
      data: { professionalId: profile.id, vendorName: "sandbox-identity", isSandbox: true, status: "VERIFIED", method: "MANUAL", decidedAt: new Date(), photosDeletedAt: new Date() },
    });
    const taxUpload = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/TAX_FILE.jpg` } });
    await db.professionalDocument.create({ data: { professionalId: profile.id, kind: "TAX_FILE", storageRef: taxUpload.storageKey, uploadId: taxUpload.id, status: "VERIFIED" } });
    await db.professionalService.create({ data: { professionalId: profile.id, serviceId: service.id, status: "APPROVED", basePriceMinorUnits: 18000 } });
    let first = true;
    for (const r of service.requirements) {
      const type = credentialTypeFor(r.requirement);
      if (!type) continue;
      const u = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/${type}.jpg` } });
      await db.professionalCredential.create({
        data: {
          professionalId: profile.id, serviceId: service.id, type, number: "88888", issuer: "e2e", documentRef: u.id, status: "VERIFIED",
          // Only the first one runs out; the rest hold for a year.
          expiresAt: new Date(Date.now() + (first ? days : 365) * 86400_000 + 3600_000),
        },
      });
      first = false;
    }
    return { email, displayName, professionalId: profile.id };
  } finally {
    await db.$disconnect();
  }
}
