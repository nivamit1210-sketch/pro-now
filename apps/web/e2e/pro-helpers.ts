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
export async function dispatchableProfessional(opts: { serviceCode: string; lat: number; lng: number; baseURL: string; offline?: boolean; addressAs?: "M" | "F" }) {
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

/** An application waiting for review (docs/21 W8): account, one service, its licences and documents pending. */
export async function pendingApplicant(serviceCode: string, displayName: string) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const service = await db.service.findUniqueOrThrow({ where: { code: serviceCode }, include: { requirements: true } });
    const email = uniqueEmail("e2e-applicant");
    const user = await db.user.create({ data: { email, emailVerified: true, name: displayName } });
    await db.userRole.create({ data: { userId: user.id, role: "PROFESSIONAL" } });
    const profile = await db.professionalProfile.create({
      data: { userId: user.id, legalName: `${displayName} כהן`, displayName, addressAs: "M", verificationStatus: "SERVICE_REVIEW" },
    });
    await db.professionalService.create({ data: { professionalId: profile.id, serviceId: service.id, status: "PENDING", basePriceMinorUnits: 20000 } });
    await db.serviceArea.create({ data: { professionalId: profile.id, centerLat: 32.08, centerLng: 34.78, radiusMeters: 10_000 } });
    for (const kind of ["GOVERNMENT_ID", "SELFIE", "TAX_FILE"]) {
      const u = await db.upload.create({ data: { ownerId: user.id, kind: "DOCUMENT", mime: "image/jpeg", bytes: 10, status: "READY", storageKey: `e2e/${profile.id}/${kind}.jpg` } });
      await db.professionalDocument.create({ data: { professionalId: profile.id, kind, storageRef: u.storageKey, uploadId: u.id } });
    }
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
