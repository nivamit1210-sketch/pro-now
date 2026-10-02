import { describe, expect, it } from "vitest";

import { tradeBackdropArt } from "./CityHero";

const NOON = new Date(2026, 9, 2, 12, 0);
const NIGHT = new Date(2026, 9, 2, 21, 0);

describe("a trade's page backdrop (the demo's TradeBackdrop)", () => {
  it("is the evening city by day and by night, never the foggy daytime render", () => {
    expect(tradeBackdropArt("HOME_CARE", NOON).city.src).toBe("/world/splash_city.webp");
    expect(tradeBackdropArt("HOME_CARE", NIGHT).city.src).toBe("/world/splash_city.webp");
  });

  it("frames it as the demo does at each hour", () => {
    expect(tradeBackdropArt("PETS", NOON).city.pos).toBe("50% 40%");
    expect(tradeBackdropArt("PETS", NIGHT).city.pos).toBe("64% 40%");
  });

  it("draws hair and home open, with their professional in the door", () => {
    expect(tradeBackdropArt("BEAUTY").shopSrc).toBe("/world/venue_hair.webp");
    expect(tradeBackdropArt("HOME_URGENT").shopSrc).toBe("/world/venue_home.webp");
  });

  it("the other trades stand in front of their street front", () => {
    expect(tradeBackdropArt("HOME_CARE").shopSrc).toBe("/world/m/shop_care.webp");
    expect(tradeBackdropArt("VEHICLE").shopSrc).toBe("/world/m/shop_auto.webp");
  });

  it("an unknown department falls back to home", () => {
    expect(tradeBackdropArt(null).shopSrc).toBe("/world/venue_home.webp");
    expect(tradeBackdropArt("NOPE").shopSrc).toBe("/world/venue_home.webp");
  });
});
