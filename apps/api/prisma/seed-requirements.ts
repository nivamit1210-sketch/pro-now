import type { PrismaClient } from "@prisma/client";
import {
  PILOT_TO_DATABASE_SERVICE_CODE,
  documentRequirementsFor,
  pilotServiceById,
  requirementsForService,
} from "@pro-now/types";

/**
 * WHAT EACH SERVICE REQUIRES OF THE PROFESSIONAL.
 *
 * `credential-eligibility.ts` reads `ServiceRequirement` rows. Documents
 * come from the research's list (D4, Dvir 2026-09-30:
 * service-documents.ts). The catalogue still contributes its account-level
 * labels (identity, business, the lockout's property policy), which the
 * engine reports and does not gate on — but never a "background check":
 * demanding a criminal record is an offence in Israel, and the research's
 * list has none.
 *
 * Requirements are REPLACED rather than added to, so removing one from the
 * list removes it here. It runs as ONE transaction: a failure halfway must
 * never leave a service with no requirements, because an empty list of
 * mandatory requirements is satisfied by anybody.
 *
 * It touches nothing else. That is why it exists on its own: the full seed
 * also resets every service's market switches, which an admin may have
 * changed in production (docs/16 §Neon runbook).
 */
export async function seedServiceRequirements(prisma: PrismaClient): Promise<{ rows: number; services: number }> {
  const serviceIdByCode = new Map((await prisma.service.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id]));
  const plan: Array<{ serviceId: string; rows: Array<{ requirement: string; mandatory: boolean }> }> = [];

  for (const [pilotServiceId, databaseCode] of Object.entries(PILOT_TO_DATABASE_SERVICE_CODE)) {
    const serviceId = serviceIdByCode.get(databaseCode);
    if (!serviceId) continue;
    const catalogService = pilotServiceById[pilotServiceId];
    const accountLevel = requirementsForService(catalogService?.requiredCredentials ?? [])
      .filter((r) => !r.isDocument && r.requirement !== "BACKGROUND_CHECK")
      .map((r) => ({ requirement: r.requirement, mandatory: r.mandatory }));
    const documents = documentRequirementsFor(pilotServiceId).map((r) => ({ requirement: r.requirement, mandatory: r.mandatory }));
    plan.push({ serviceId, rows: [...accountLevel, ...documents] });
  }

  await prisma.$transaction(async (tx) => {
    for (const { serviceId, rows } of plan) {
      await tx.serviceRequirement.deleteMany({ where: { serviceId } });
      if (rows.length > 0) await tx.serviceRequirement.createMany({ data: rows.map((r) => ({ serviceId, ...r })) });
    }
  });

  return { rows: plan.reduce((n, p) => n + p.rows.length, 0), services: plan.filter((p) => p.rows.length > 0).length };
}
