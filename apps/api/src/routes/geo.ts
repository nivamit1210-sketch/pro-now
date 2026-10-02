import type { FastifyInstance } from "fastify";
import type { GeocodingResult } from "@pro-now/types";
import { reverseGeocodeQuerySchema, searchGeocodeQuerySchema, streetSuggestQuerySchema } from "@pro-now/validation";

import { cacheKeyForReverse, cacheKeyForSearch, normalizeSearchQuery } from "../domain/geocoding/cache.js";
import { readCache, writeCache } from "../domain/geocoding/cache-store.js";
import { suggestStreets } from "../domain/streets/search.js";
import { requireRole } from "../auth/access.js";

export default async function geoRoutes(app: FastifyInstance) {
  /*
   * As-you-type suggestions for the address box, from the official street
   * list in our own database: no third party sees the keystrokes, and none
   * rate-limits them (Nominatim's policy forbids autocomplete). A query a
   * keystroke, so only for a signed-in customer, whose screen asks.
   */
  app.get("/v1/geo/streets", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { q } = streetSuggestQuerySchema.parse(req.query);
    // The list is loaded by the deploy (scripts/sync-streets.ts), never by this server.
    return reply.send({ suggestions: await suggestStreets(app.prisma, q) });
  });

  app.get("/v1/geo/reverse", async (req, reply) => {
    const { lat, lng } = reverseGeocodeQuerySchema.parse(req.query);
    const cacheKey = cacheKeyForReverse({ lat, lng });
    const cached = await readCache(app, cacheKey);
    if (cached !== undefined) return reply.send({ result: cached as GeocodingResult | null, cached: true });

    try {
      const result = await app.providers.geocoding.reverseGeocode({ lat, lng });
      await writeCache(app, cacheKey, "reverse", result);
      return reply.send({ result, cached: false });
    } catch (error) {
      req.log.warn({ err: error }, "Reverse geocoding failed");
      return reply.status(502).send({ code: "GEOCODING_UNAVAILABLE", message: "Address lookup is temporarily unavailable" });
    }
  });

  app.get("/v1/geo/search", async (req, reply) => {
    const { q } = searchGeocodeQuerySchema.parse(req.query);
    const normalized = normalizeSearchQuery(q);
    const cacheKey = cacheKeyForSearch(normalized)!;
    const cached = await readCache(app, cacheKey);
    if (cached !== undefined) return reply.send({ results: cached as GeocodingResult[], cached: true });

    try {
      const results = await app.providers.geocoding.searchAddress(normalized);
      await writeCache(app, cacheKey, "search", results);
      return reply.send({ results, cached: false });
    } catch (error) {
      req.log.warn({ err: error }, "Address search failed");
      return reply.status(502).send({ code: "GEOCODING_UNAVAILABLE", message: "Address lookup is temporarily unavailable" });
    }
  });
}
