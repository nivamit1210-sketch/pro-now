import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { requireRole } from "../auth/access.js";
import { createAddressSchema } from "@pro-now/validation";

import { readCache, writeCache } from "../domain/geocoding/cache-store.js";
import { locateStreet, WHOLE_LOCALITY_CODE, type Located } from "../domain/streets/locate.js";

/**
 * The customer's saved places.
 *
 * ---------------------------------------------------------------------
 * WHY THIS FILE WAS MISSING AND WHAT THAT MEANT
 * ---------------------------------------------------------------------
 * `POST /v1/jobs` requires an `addressId` and checks that the address
 * belongs to the caller — correctly, because dispatching somebody to a
 * stranger's door is the worst failure this product has. But nothing in
 * the API could CREATE an address, and nothing could list one.
 *
 * So a customer who installed the app could not request a professional at
 * all: every job creation failed with ADDRESS_NOT_FOUND unless a row had
 * been put in the database by the seed script. The customer app hid this
 * by sending the literal string `"demo-address"`, which worked against a
 * seeded development database and against nothing else. The gap was
 * invisible precisely because both halves were confident.
 *
 * ---------------------------------------------------------------------
 * WHERE AN ADDRESS COMES FROM
 * ---------------------------------------------------------------------
 * Only two places, and neither is free text (Dvir, 2026-10-01: "someone
 * can invite a professional to nowhere"):
 *
 * - A street from Israel's official list (`street_names`), which the
 *   server places on the map itself and refuses when the map does not know
 *   it (domain/streets/locate.ts).
 * - The device's own location. The coordinate is the phone's; its words
 *   come from the server's reverse geocoding, not from the client.
 *
 * Until 2026-10-01 the client sent text and coordinates of its choosing,
 * and the app paired whatever was typed with the live location.
 *
 * ---------------------------------------------------------------------
 * TAKING ONE OFF THE LIST (audit v2 #4, the picker's ×)
 * ---------------------------------------------------------------------
 * A job points at its address row: where the professional went, what the
 * customer, the professional and admin see about it afterwards. So an
 * address some job used is archived (`archivedAt`), never edited or
 * removed: the job keeps it word for word, and only the list and new
 * orders stop seeing it. An address no job ever used is deleted outright,
 * since nothing needs it and the customer asked for it gone.
 *
 * There is no default on the server. The app keeps the one chosen for the
 * next order, and when that one is gone it falls back to the newest still
 * listed, or asks (apps/web orderTarget.tsx).
 */
export default async function addressesRoutes(app: FastifyInstance) {
  /**
   * The caller's own customer profile, created on first use.
   *
   * Same upsert `POST /v1/jobs` does, for the same reason: a customer
   * profile is not a thing anybody signs up for, it is the row that
   * appears the first time somebody acts as a customer.
   */
  async function customerFor(userId: string) {
    return app.prisma.customerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  app.get("/v1/me/addresses", { onRequest: requireRole("CUSTOMER") }, async (req) => {
    const customer = await customerFor(req.user!.userId);
    const addresses = await app.prisma.address.findMany({
      where: { customerId: customer.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { addresses };
  });

  app.post("/v1/me/addresses", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const body = createAddressSchema.parse(req.body);
    const customer = await customerFor(req.user!.userId);
    const withDetails = (text: string) => (body.details ? `${text} · ${body.details}` : text);

    let place: Located & { formatted: string; localityCode?: number; streetCode?: number; houseNumber?: string | null };
    if (body.kind === "street") {
      const street = await app.prisma.streetName.findUnique({
        where: { localityCode_streetCode: { localityCode: body.localityCode, streetCode: body.streetCode } },
      });
      if (!street) return reply.status(400).send({ code: "STREET_NOT_FOUND", message: "No such street in the street list" });
      const houseNumber = street.streetCode >= WHOLE_LOCALITY_CODE ? null : (body.houseNumber ?? null);
      const cacheKey = `locate:${street.localityCode}:${street.streetCode}:${houseNumber ?? ""}`;
      let located = (await readCache(app, cacheKey)) as Located | null | undefined;
      try {
        if (located === undefined) {
          located = await locateStreet(app.providers.geocoding, { ...street, houseNumber });
          await writeCache(app, cacheKey, "locate", located);
        }
      } catch (error) {
        req.log.warn({ err: error }, "Locating a street failed");
        return reply.status(502).send({ code: "GEOCODING_UNAVAILABLE", message: "Address lookup is temporarily unavailable" });
      }
      if (!located) {
        return reply.status(422).send({ code: "ADDRESS_NOT_ON_MAP", message: "The map does not know this street yet" });
      }
      const text =
        street.streetCode >= WHOLE_LOCALITY_CODE
          ? street.localityName
          : `${street.streetName}${houseNumber ? ` ${houseNumber}` : ""}, ${street.localityName}`;
      place = { ...located, formatted: withDetails(text), localityCode: street.localityCode, streetCode: street.streetCode, houseNumber };
    } else {
      // The words for a coordinate are a nicety; the coordinate is the address.
      const found = await app.providers.geocoding.reverseGeocode({ lat: body.lat, lng: body.lng }).catch((error: unknown) => {
        req.log.warn({ err: error }, "Reverse geocoding a saved location failed");
        return null;
      });
      place = {
        lat: body.lat,
        lng: body.lng,
        placeId: found?.placeId ?? null,
        precision: "DEVICE",
        formatted: withDetails(found?.formattedAddress ?? "המיקום שלי"),
      };
    }

    /*
     * The same place saved twice is a list that grows every time somebody
     * requests from home. Matched on the text rather than on the
     * coordinate: two GPS fixes at one doorstep differ by metres, and
     * rounding them to decide sameness invents a tolerance nobody chose.
     */
    // One taken off the list stays with its jobs; saving the place again starts a new row.
    const existing = await app.prisma.address.findFirst({
      where: { customerId: customer.id, formatted: place.formatted, archivedAt: null },
    });
    if (existing) return reply.send({ address: existing });

    const address = await app.prisma.address.create({
      data: {
        customerId: customer.id,
        formatted: place.formatted,
        lat: place.lat,
        lng: place.lng,
        label: body.label ?? null,
        placeId: place.placeId,
        localityCode: place.localityCode ?? null,
        streetCode: place.streetCode ?? null,
        houseNumber: place.houseNumber ?? null,
        geoPrecision: place.precision,
      },
    });
    return reply.status(201).send({ address });
  });
  app.delete<{ Params: { id: string } }>("/v1/me/addresses/:id", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const customer = await customerFor(req.user!.userId);
    /*
     * Only the caller's own, still listed. Someone else's address answers
     * exactly as one that does not exist: this route must not tell anybody
     * whether an id is a stranger's address.
     */
    const address = await app.prisma.address.findFirst({
      where: { id: req.params.id, customerId: customer.id, archivedAt: null },
      select: { id: true },
    });
    if (!address) return reply.status(404).send({ code: "ADDRESS_NOT_FOUND", message: "Address not found for this customer" });

    const usedByJob = await app.prisma.job.findFirst({ where: { addressId: address.id }, select: { id: true } });
    if (!usedByJob) {
      try {
        await app.prisma.address.delete({ where: { id: address.id } });
        return reply.send({ removed: "deleted" });
      } catch (error) {
        // A job created against it a moment ago (the foreign key refused): keep it for that job.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")) throw error;
      }
    }
    await app.prisma.address.update({ where: { id: address.id }, data: { archivedAt: new Date() } });
    return reply.send({ removed: "archived" });
  });
}
