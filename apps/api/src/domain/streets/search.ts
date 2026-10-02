import { Prisma, type PrismaClient } from "@prisma/client";
import type { StreetSuggestion } from "@pro-now/types";

import { parseStreetQuery } from "./normalize.js";
import { SMALL_LOCALITY_STREETS, WHOLE_LOCALITY_CODE } from "./locate.js";

const LIMIT = 8;

/**
 * Streets for what was typed, the way a maps search box answers. People
 * type the street first and then, maybe, the place: "הרצל 12 רמת". So the
 * words split in two — the first ones each begin a word of the street, the
 * rest begin the locality's name ("רמת" → "רמת גן", not "תל אביב") — or
 * all of them are the street's, anywhere in the country.
 *
 * Order: a street in the place that was named, then a street that starts
 * the way the query does, then any other; within those, streets that start
 * with the first word, bigger places first, shorter names first.
 */
export async function suggestStreets(prisma: PrismaClient, query: string): Promise<StreetSuggestion[]> {
  const { words, houseNumber } = parseStreetQuery(query);
  if (words.length === 0) return [];
  const esc = (w: string) => w.replace(/[\\%_]/g, "\\$&");
  const street = Prisma.sql`split_part("searchText", '|', 1)`;
  const inStreet = (ws: string[]) => Prisma.join(ws.map((w) => Prisma.sql`${street} LIKE ${`% ${esc(w)}%`}`), " AND ");
  const localityStarts = (ws: string[]) => Prisma.sql`"searchText" LIKE ${`%| ${esc(ws.join(" "))}%`}`;
  const splits = words.slice(1).map((_, i) => Prisma.sql`(${inStreet(words.slice(0, i + 1))} AND ${localityStarts(words.slice(i + 1))})`);
  const inNamedPlace = splits.length > 0 ? Prisma.join(splits, " OR ") : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<Array<{ localityCode: number; streetCode: number; streetName: string; localityName: string }>>`
    SELECT "localityCode", "streetCode", "streetName", "localityName"
    FROM street_names
    -- Every word begins a word somewhere in the row, whichever split matches: the trigram index answers this part.
    WHERE ${Prisma.join(words.map((w) => Prisma.sql`"searchText" LIKE ${`% ${esc(w)}%`}`), " AND ")}
      AND (${inNamedPlace} OR ${inStreet(words)})
      -- A city as a whole is nobody's door; a village is (locate.ts).
      AND NOT ("streetCode" >= ${WHOLE_LOCALITY_CODE} AND "localityStreets" > ${SMALL_LOCALITY_STREETS})
    ORDER BY
      CASE WHEN ${inNamedPlace} THEN 0
           WHEN ${street} LIKE ${` ${esc(words.join(" "))}%`} THEN 1
           ELSE 2 END,
      ${street} LIKE ${` ${esc(words[0]!)}%`} DESC,
      "localityStreets" DESC,
      length("streetName")
    LIMIT ${LIMIT}`;
  return rows.map((r) => ({
    ...r,
    houseNumber: r.streetCode >= WHOLE_LOCALITY_CODE ? null : houseNumber,
    wholeLocality: r.streetCode >= WHOLE_LOCALITY_CODE,
  }));
}
