import { describe, expect, it } from "vitest";
import { PILOT_TO_DATABASE_SERVICE_CODE } from "@pro-now/types";

import { tradeCharacterFor, tradeShopFor } from "./tradeCharacter";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("tradeCharacterFor", () => {
  it("draws every service the server knows as one of the delivered characters", () => {
    for (const code of Object.values(PILOT_TO_DATABASE_SERVICE_CODE)) {
      expect(tradeCharacterFor(code), code).toMatch(/^\/world\/character_(appliance|auto|build|care|hair|help|home|move|pets|tech|well)_icon\.webp$/);
    }
  });

  it("an electrician is the tool-belt technician, not the plumber with a wrench (the demo's rule)", () => {
    const electric = Object.entries(PILOT_TO_DATABASE_SERVICE_CODE).find(([pilot]) => /^svc-electric/.test(pilot));
    expect(electric).toBeDefined();
    expect(tradeCharacterFor(electric![1])).toBe("/world/character_appliance_icon.webp");
  });

  it("falls back to the home character for no service or an unknown one", () => {
    expect(tradeCharacterFor(null)).toBe("/world/character_home_icon.webp");
    expect(tradeCharacterFor("NOT_A_SERVICE")).toBe("/world/character_home_icon.webp");
  });
});

describe("tradeShopFor", () => {
  it("every service stands in front of a shopfront that was delivered to the web app", () => {
    const publicDir = fileURLToPath(new URL("../public", import.meta.url));
    for (const code of Object.values(PILOT_TO_DATABASE_SERVICE_CODE)) {
      const uri = tradeShopFor(code);
      expect(uri, code).toMatch(/^\/world\/m\/shop_[a-z]+\.webp$/);
      expect(existsSync(publicDir + uri), uri).toBe(true);
    }
    expect(tradeShopFor(null)).toBe("/world/m/shop_home.webp");
  });
});
