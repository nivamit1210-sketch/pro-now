import { describe, expect, it, vi } from "vitest";
import type { GeocodingProvider, GeocodingResult, StructuredAddressQuery } from "@pro-now/types";

import { expandStreetName, parseStreetQuery, sameNameKey, searchForm, withoutStreetType } from "../src/domain/streets/normalize.js";
import { fingerprintOf, rowsFromSnapshot } from "../src/domain/streets/load.js";
import { locateStreet, SMALL_LOCALITY_STREETS, type StreetToLocate } from "../src/domain/streets/locate.js";

describe("street names", () => {
  it("expands the list's leading abbreviations, with or without a geresh", () => {
    expect(expandStreetName("שד הרצל")).toBe("שדרות הרצל");
    expect(expandStreetName("שד' רוטשילד")).toBe("שדרות רוטשילד");
    expect(expandStreetName("רח 3003")).toBe("רחוב 3003");
    expect(expandStreetName("הרצל")).toBe("הרצל");
    // A name that is only the abbreviation is left alone.
    expect(expandStreetName("שד")).toBe("שד");
  });

  it("compares without punctuation, so a dash or a quote never hides a match", () => {
    expect(searchForm("תל אביב - יפו")).toBe("תל אביב יפו");
    expect(searchForm('בסמ"ה')).toBe("בסמה");
    expect(searchForm("ז'בוטינסקי")).toBe("זבוטינסקי");
  });

  it("treats OpenStreetMap's spelling of a place as the same place", () => {
    expect(sameNameKey("תל־אביב–יפו")).toBe(sameNameKey("תל אביב - יפו"));
    expect(sameNameKey("קריית אונו")).toBe(sameNameKey("קרית אונו"));
    expect(sameNameKey("הרצל")).toBe(sameNameKey("שד הרצל"));
    expect(sameNameKey("רמת גן")).not.toBe(sameNameKey("רמת השרון"));
    expect(withoutStreetType("שד הרצל")).toBe("הרצל");
    expect(withoutStreetType("דרך")).toBe("דרך");
  });

  it("takes the last number as the house number, wherever it is typed", () => {
    expect(parseStreetQuery("הרצל 12")).toEqual({ words: ["הרצל"], houseNumber: "12" });
    expect(parseStreetQuery("12 הרצל, רמת גן")).toEqual({ words: ["הרצל", "רמת", "גן"], houseNumber: "12" });
    expect(parseStreetQuery("הרצל 12א")).toEqual({ words: ["הרצל"], houseNumber: "12א" });
    expect(parseStreetQuery("רחוב 3003 5")).toEqual({ words: ["רחוב", "3003"], houseNumber: "5" });
    expect(parseStreetQuery("הר")).toEqual({ words: ["הר"], houseNumber: null });
  });

  it("derives the rows the search reads, with each locality's size", () => {
    const rows = [...rowsFromSnapshot({
      cities: { "5000": "תל אביב - יפו", "1": "כפר קטן" },
      streets: [
        [5000, 1, "שד רוטשילד"],
        [5000, 2, "הרצל"],
        [1, 9000, "כפר קטן"],
      ],
    })];
    expect(rows[0]).toEqual({
      localityCode: 5000,
      streetCode: 1,
      localityName: "תל אביב - יפו",
      streetName: "שדרות רוטשילד",
      searchText: " שדרות רוטשילד | תל אביב יפו ",
      localityStreets: 2,
    });
    expect(rows[2]!.localityStreets).toBe(1);
  });
});

/** A geocoder that answers from a table of structured queries. */
function geocoder(answers: Array<[Partial<StructuredAddressQuery>, GeocodingResult]>): GeocodingProvider & { calls: StructuredAddressQuery[] } {
  const calls: StructuredAddressQuery[] = [];
  return {
    vendorName: "test",
    isSandbox: true,
    calls,
    reverseGeocode: vi.fn(),
    searchAddress: vi.fn(),
    async searchStructured(query) {
      calls.push(query);
      return answers
        .filter(([q]) => q.street === query.street && q.houseNumber === query.houseNumber && q.locality === query.locality)
        .map(([, r]) => r);
    },
  };
}

const at = (lat: number, road: string | null, houseNumber: string | null, localities: string[]): GeocodingResult => ({
  lat,
  lng: 34.78,
  formattedAddress: "…",
  placeId: `p${lat}`,
  parts: { road, houseNumber, localities },
});

const herzl: StreetToLocate = { streetCode: 2, streetName: "הרצל", localityName: "תל אביב - יפו", localityStreets: 2000, houseNumber: "12" };

describe("locating a street from the list", () => {
  it("places the house when the map knows it", async () => {
    const g = geocoder([[{ street: "הרצל", houseNumber: "12", locality: "תל אביב - יפו" }, at(32.06, "הרצל", "12", ["תל־אביב–יפו"])]]);
    await expect(locateStreet(g, herzl)).resolves.toMatchObject({ lat: 32.06, precision: "HOUSE" });
  });

  it("refuses another street the geocoder offers instead, and falls back to the street itself", async () => {
    const g = geocoder([
      [{ street: "הרצל", houseNumber: "999", locality: "תל אביב - יפו" }, at(1, "חנה ומרדכי וייסר", null, ["תל־אביב–יפו"])],
      [{ street: "הרצל", locality: "תל אביב - יפו" }, at(32.05, "הרצל", null, ["תל־אביב–יפו"])],
    ]);
    await expect(locateStreet(g, { ...herzl, houseNumber: "999" })).resolves.toMatchObject({ lat: 32.05, precision: "STREET" });
  });

  it("refuses the same street in another place", async () => {
    const g = geocoder([[{ street: "הרצל", locality: "תל אביב - יפו" }, at(31.7, "הרצל", null, ["ירושלים"])]]);
    await expect(locateStreet(g, { ...herzl, houseNumber: null })).resolves.toBeNull();
  });

  it("tries the street without its type, as OpenStreetMap often names it", async () => {
    const g = geocoder([[{ street: "הרצל", locality: "אופקים" }, at(31.3, "הרצל", null, ["אופקים"])]]);
    const ofakim = { streetCode: 5, streetName: "שדרות הרצל", localityName: "אופקים", localityStreets: 300, houseNumber: null };
    await expect(locateStreet(g, ofakim)).resolves.toMatchObject({ lat: 31.3, precision: "STREET" });
  });

  it("locates a village as a whole when its street is not on the map, even under a regional council's name", async () => {
    const village = { streetCode: 101, streetName: "חיטה", localityName: "כפר גדעון", localityStreets: 12, houseNumber: "3" };
    const g = geocoder([[{ locality: "כפר גדעון" }, at(32.6, null, null, ["מועצה אזורית עמק יזרעאל", "כפר גדעון"])]]);
    await expect(locateStreet(g, village)).resolves.toMatchObject({ lat: 32.6, precision: "LOCALITY" });
  });

  it("never places a city's street at the city's centre", async () => {
    const g = geocoder([[{ locality: "תל אביב - יפו" }, at(32.08, null, null, ["תל־אביב–יפו"])]]);
    await expect(locateStreet(g, herzl)).resolves.toBeNull();
    expect(g.calls.some((c) => c.street === undefined)).toBe(false);
    const wholeCity = { ...herzl, streetCode: 9000, localityStreets: SMALL_LOCALITY_STREETS + 1 };
    await expect(locateStreet(g, wholeCity)).resolves.toBeNull();
  });
});

describe("the street list's fingerprint", () => {
  it("changes with the snapshot and with nothing else", () => {
    const a = fingerprintOf(Buffer.from("snapshot a"));
    expect(fingerprintOf(Buffer.from("snapshot a"))).toBe(a);
    expect(fingerprintOf(Buffer.from("snapshot b"))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
