/**
 * Makes `street_names` match apps/api/data/il-streets.json.gz.
 *
 *   npm run db:streets -w apps/api      (also the last step of db:migrate:deploy)
 *
 * Its own process, before the server starts, so the list's memory is gone
 * by the time the server needs any (src/domain/streets/load.ts). A failure
 * is reported and does not stop the deploy: the server runs, and only the
 * address box's suggestions wait for the next successful sync.
 * STREETS_SYNC_STRICT=1 makes a failure fail the step (CI).
 */
import "../src/load-env.js";
import { createPrisma } from "../src/db/prisma-client.js";
import { syncStreetNames } from "../src/domain/streets/load.js";

const prisma = createPrisma();
const started = Date.now();
try {
  const result = await syncStreetNames(prisma);
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1e6);
  console.log(
    result
      ? `Street list loaded: ${result.loaded} streets in ${Date.now() - started} ms (heap ${heapMb} MB)`
      : `Street list already current (${Date.now() - started} ms)`
  );
} catch (err) {
  console.error("Could not sync the street list; address suggestions stay on the previous list.", err);
  if (process.env.STREETS_SYNC_STRICT === "1") process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
