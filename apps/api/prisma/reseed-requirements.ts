/**
 * `npm run db:seed:requirements -w apps/api` — only the service
 * requirements, nothing else (seed-requirements.ts says why). Safe against
 * production: it prints what changes, per service, before and after.
 */
import "../src/load-env.js";

import { createPrisma } from "../src/db/prisma-client.js";
import { seedServiceRequirements } from "./seed-requirements.js";

const prisma = createPrisma();

async function snapshot(): Promise<Map<string, string>> {
  const rows = await prisma.serviceRequirement.findMany({ include: { service: { select: { code: true } } } });
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.service.code, [...(by.get(r.service.code) ?? []), `${r.requirement}${r.mandatory ? "" : "?"}`]);
  return new Map([...by].map(([code, list]) => [code, list.sort().join(", ")]));
}

async function main() {
  const before = await snapshot();
  const result = await seedServiceRequirements(prisma);
  const after = await snapshot();
  for (const code of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(code) ?? "—";
    const b = after.get(code) ?? "—";
    if (a !== b) console.log(`${code}\n  before: ${a}\n  after:  ${b}`);
  }
  console.log(`service requirements: ${result.rows} across ${result.services} service(s). ("?" = not mandatory)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
