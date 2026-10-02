import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

import { expandStreetName, searchForm } from "./normalize.js";

/**
 * apps/api/data/il-streets.json.gz, refreshed by scripts/fetch-streets.mjs:
 * two levels up from the bundle (dist/server.js), four from this file.
 */
export const SNAPSHOT = ["..", "../../.."]
  .map((up) => path.resolve(import.meta.dirname, up, "data/il-streets.json.gz"))
  .find((file) => existsSync(file));

/**
 * Bump when `rowsFromSnapshot` or normalize.ts changes what a row says: the
 * fingerprint is the snapshot's bytes plus this, so either change reloads
 * the table and nothing else does.
 */
export const ROW_FORMAT = 1;

const BATCH = 2_000;
/** Any constant, so two deploys syncing together load the list once. */
const LOCK_KEY = 2026_10_01;

interface Snapshot {
  source: string;
  fetchedAt: string;
  cities: Record<string, string>;
  streets: Array<[localityCode: number, streetCode: number, name: string]>;
}

export interface StreetRow {
  localityCode: number;
  streetCode: number;
  localityName: string;
  streetName: string;
  searchText: string;
  localityStreets: number;
}

/**
 * The table's rows, one at a time: the snapshot is compact (three fields a
 * street) and a row is not, so rows are made as they are written rather
 * than held — 63k of them as objects cost the server its whole heap.
 */
export function* rowsFromSnapshot(snapshot: Pick<Snapshot, "cities" | "streets">): Generator<StreetRow> {
  const perLocality = new Map<number, number>();
  for (const [locality] of snapshot.streets) perLocality.set(locality, (perLocality.get(locality) ?? 0) + 1);
  for (const [localityCode, streetCode, name] of snapshot.streets) {
    const localityName = snapshot.cities[String(localityCode)] ?? "";
    const streetName = expandStreetName(name);
    yield {
      localityCode,
      streetCode,
      localityName,
      streetName,
      // "|" divides the street's words from the locality's; search.ts ranks on it.
      searchText: ` ${searchForm(streetName)} | ${searchForm(localityName)} `,
      localityStreets: perLocality.get(localityCode) ?? 0,
    };
  }
}

function* batches<T>(items: Iterable<T>, size: number): Generator<T[]> {
  let batch: T[] = [];
  for (const item of items) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

export function fingerprintOf(snapshotBytes: Buffer): string {
  return createHash("sha256").update(snapshotBytes).update(`:rows-v${ROW_FORMAT}`).digest("hex");
}

/**
 * Makes `street_names` match the checked-in snapshot. Runs as its own step
 * of a deploy (scripts/sync-streets.ts, from `db:migrate:deploy`), never
 * inside the web server: on 2026-10-01 loading it at boot took the server
 * past its 256 MB heap on every start, in a loop (docs/16 §Production).
 *
 * - Unchanged list: one query — the fingerprint is kept as the table's
 *   comment and compared before anything is unzipped.
 * - Changed list: rows are written in batches to a staging table (each
 *   batch its own short statement, so the database never holds a long
 *   transaction open), then swapped in with one short transaction that
 *   copies server-side. Searches see the old list or the new one, never
 *   half of either.
 */
export async function syncStreetNames(prisma: PrismaClient): Promise<{ loaded: number } | null> {
  if (!SNAPSHOT) throw new Error("apps/api/data/il-streets.json.gz is missing");
  const bytes = await readFile(SNAPSHOT);
  const fingerprint = fingerprintOf(bytes);
  const current = async (db: Pick<PrismaClient, "$queryRaw">) =>
    (await db.$queryRaw<Array<{ c: string | null }>>`SELECT obj_description('street_names'::regclass, 'pg_class') AS c`)[0]?.c;
  if ((await current(prisma)) === fingerprint) return null;

  const snapshot = JSON.parse(gunzipSync(bytes).toString("utf8")) as Snapshot;
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS street_names_staging`);
  await prisma.$executeRawUnsafe(`CREATE UNLOGGED TABLE street_names_staging (LIKE street_names INCLUDING DEFAULTS)`);
  let loaded = 0;
  try {
    for (const rows of batches(rowsFromSnapshot(snapshot), BATCH)) {
      // Six arrays, not 12,000 bind parameters: one statement a batch, and no ORM objects per row.
      await prisma.$executeRaw`
        INSERT INTO street_names_staging ("localityCode", "streetCode", "localityName", "streetName", "searchText", "localityStreets")
        SELECT * FROM unnest(
          ${rows.map((r) => r.localityCode)}::int[],
          ${rows.map((r) => r.streetCode)}::int[],
          ${rows.map((r) => r.localityName)}::text[],
          ${rows.map((r) => r.streetName)}::text[],
          ${rows.map((r) => r.searchText)}::text[],
          ${rows.map((r) => r.localityStreets)}::int[]
        )`;
      loaded += rows.length;
    }
    const swapped = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      if ((await current(tx)) === fingerprint) return false;
      await tx.$executeRawUnsafe(`DELETE FROM street_names`);
      await tx.$executeRawUnsafe(
        `INSERT INTO street_names SELECT DISTINCT ON ("localityCode", "streetCode") * FROM street_names_staging ORDER BY "localityCode", "streetCode"`
      );
      // COMMENT takes no bind parameters; the fingerprint is hex.
      await tx.$executeRawUnsafe(`COMMENT ON TABLE street_names IS '${fingerprint}'`);
      return true;
    });
    return swapped ? { loaded } : null;
  } finally {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS street_names_staging`);
  }
}
