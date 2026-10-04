import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/access.js";
import { daysUntil, isCoveredByRenewal } from "../domain/credentials/expiry.js";

/**
 * WHICH CREDENTIALS NEED STAFF (docs/10 §Life after approval, §Renewal, §Staff
 * view): what expires within 30 days, what has expired, what was verified
 * with no date, and the renewals waiting for review. Read-only, so nothing is
 * written to the audit log. Only approved professionals are listed.
 */
const EXPIRING_DAYS = 30;
const EXPIRED_LIMIT = 100;

export default async function adminCredentialsRoutes(app: FastifyInstance) {
  const admin = { onRequest: requireRole("ADMIN") };
  const include = { service: { select: { nameHe: true } }, professional: { select: { displayName: true } } };
  const approved = { professional: { verificationStatus: "APPROVED" as const } };
  type Loaded = Awaited<ReturnType<typeof load>>[number];
  const load = (status: string[]) => app.prisma.professionalCredential.findMany({ where: { status: { in: status }, ...approved }, include });
  const row = (c: Loaded) => ({
    credentialId: c.id,
    professionalId: c.professionalId,
    displayName: c.professional.displayName,
    serviceNameHe: c.service.nameHe,
    type: c.type,
    expiresAt: c.expiresAt?.toISOString() ?? null,
  });
  const time = (c: { expiresAt: Date | null }) => c.expiresAt?.getTime() ?? 0;

  app.get("/v1/admin/credentials/expiry", admin, async () => {
    const now = new Date();
    const all = await load(["VERIFIED", "EXPIRED"]);
    const verified = all.filter((c) => c.status === "VERIFIED");
    // A credential another verified one of the same type and service outlasts is covered by that renewal (docs/10 §Notices), as the warnings skip it.
    const covered = (c: Loaded & { expiresAt: Date }) =>
      isCoveredByRenewal(c, verified.filter((o) => o.id !== c.id && o.professionalId === c.professionalId && o.serviceId === c.serviceId && o.type === c.type));
    const expiring = verified
      .filter((c) => c.expiresAt && daysUntil(c.expiresAt, now) >= 0 && daysUntil(c.expiresAt, now) <= EXPIRING_DAYS && !covered({ ...c, expiresAt: c.expiresAt }))
      .sort((a, b) => time(a) - time(b));
    const expired = all
      .filter((c) => c.status === "EXPIRED" || (c.expiresAt && daysUntil(c.expiresAt, now) < 0))
      .sort((a, b) => time(b) - time(a))
      .slice(0, EXPIRED_LIMIT);
    const undated = verified.filter((c) => !c.expiresAt && !c.noExpiry);
    return { expiring: expiring.map(row), expired: expired.map(row), undated: undated.map(row) };
  });

  app.get("/v1/admin/credentials/renewals", admin, async () => {
    const pending = await load(["PENDING"]);
    if (pending.length === 0) return { renewals: [] };
    const current = await app.prisma.professionalCredential.findMany({
      where: { status: { in: ["VERIFIED", "EXPIRED"] }, professionalId: { in: [...new Set(pending.map((c) => c.professionalId))] } },
      select: { professionalId: true, serviceId: true, type: true, expiresAt: true },
    });
    const renewals = pending.flatMap((c) => {
      const same = current.filter((o) => o.professionalId === c.professionalId && o.serviceId === c.serviceId && o.type === c.type);
      if (same.length === 0) return [];
      const dates = same.flatMap((o) => (o.expiresAt ? [o.expiresAt.getTime()] : []));
      return [{ ...row(c), replacesExpiresAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null }];
    });
    const key = (r: { replacesExpiresAt: string | null }) => (r.replacesExpiresAt ? Date.parse(r.replacesExpiresAt) : Infinity);
    renewals.sort((a, b) => key(a) - key(b));
    return { renewals: renewals.map(({ expiresAt: _unused, ...r }) => r) };
  });
}
