import { describe, expect, it } from "vitest";

import { SPAWN, WALK_LIMIT, nearestShop } from "./street";

/**
 * Simulates the player walking diagonally (ArrowUp + ArrowLeft) at
 * a given framerate and verifies they reach a shop within the budget.
 *
 * This mirrors the e2e test's real-world scenario: headless Chromium
 * on CI with SwiftShader renders the heavy scene at very low FPS.
 * Movement is delta-time based but capped per frame, so slow FPS
 * means less distance covered per wall-clock second.
 */
function simulateWalk(
  fpsAverage: number,
  budgetSeconds: number,
  deltaCap: number,
): { reachedShop: boolean; shopId: string | null; finalZ: number; framesRendered: number; distance: number } {
  const speed = 2.7;
  const diagonal = Math.SQRT1_2;
  let x: number = SPAWN.x;
  let z: number = SPAWN.z;
  const totalFrames = Math.floor(fpsAverage * budgetSeconds);
  const frameInterval = 1 / fpsAverage;

  for (let i = 0; i < totalFrames; i++) {
    const dt = Math.min(deltaCap, frameInterval);
    x = Math.max(-WALK_LIMIT, x + -diagonal * speed * dt);
    z = z + -diagonal * speed * dt;

    const shop = nearestShop(x, z);
    if (shop) {
      return { reachedShop: true, shopId: shop.shopId, finalZ: z, framesRendered: i + 1, distance: Math.hypot(shop.x - x, shop.z - z) };
    }
  }

  const shop = nearestShop(x, z, 999);
  return {
    reachedShop: false,
    shopId: null,
    finalZ: z,
    framesRendered: totalFrames,
    distance: shop ? Math.hypot(shop.x - x, shop.z - z) : Infinity,
  };
}

describe("walk reach under CI conditions", () => {
  it("reaches a shop at 60fps (desktop)", () => {
    const result = simulateWalk(60, 10, 0.2);
    expect(result.reachedShop).toBe(true);
    expect(result.shopId).toBe("home");
  });

  it("reaches a shop at 10fps", () => {
    const result = simulateWalk(10, 10, 0.2);
    expect(result.reachedShop).toBe(true);
    expect(result.shopId).toBe("home");
  });

  it("reaches a shop at 5fps (slow CI)", () => {
    const result = simulateWalk(5, 10, 0.2);
    expect(result.reachedShop).toBe(true);
    expect(result.shopId).toBe("home");
  });

  it("reaches a shop at 3fps (worst-case SwiftShader)", () => {
    const result = simulateWalk(3, 10, 0.2);
    expect(result.reachedShop).toBe(true);
    expect(result.shopId).toBe("home");
  });

  it("reaches a shop at 2fps (extreme)", () => {
    const result = simulateWalk(2, 10, 0.2);
    expect(result.reachedShop).toBe(true);
    expect(result.shopId).toBe("home");
  });

  it("reaches home (not hair) first since home is nearest to spawn", () => {
    const result = simulateWalk(30, 10, 0.2);
    expect(result.shopId).toBe("home");
  });
});
