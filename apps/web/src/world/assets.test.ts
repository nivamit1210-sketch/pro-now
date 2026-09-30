import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WORLD_ASSETS, worldAssetUrl, type WorldAssetId } from "./assets";

describe("world assets", () => {
  it("maps every world id to a literal public asset", () => {
    for (const [id, file] of Object.entries(WORLD_ASSETS)) {
      expect(worldAssetUrl(id as WorldAssetId)).toBe(`/world/${file}`);
      expect(file).toMatch(/\.(webp|png|jpg)$/);
      expect(existsSync(resolve(process.cwd(), "public", "world", file))).toBe(true);
    }
  });
});
