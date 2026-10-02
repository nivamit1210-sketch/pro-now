import { describe, expect, it } from "vitest";

import { advanceAlongStreet } from "./ambient";

describe("advanceAlongStreet", () => {
  const half = 50;
  const margin = 10; // limit is ±60

  it("moves by velocity × dt inside the street", () => {
    expect(advanceAlongStreet(0, 2, 0.5, half, margin)).toBe(1);
    expect(advanceAlongStreet(10, -4, 0.25, half, margin)).toBe(9);
  });

  it("comes back in at the far end with the overshoot kept", () => {
    expect(advanceAlongStreet(59, 4, 0.5, half, margin)).toBeCloseTo(-59);
    expect(advanceAlongStreet(-59, -4, 0.5, half, margin)).toBeCloseTo(59);
  });

  it("stays on the street after a very long frame", () => {
    const z = advanceAlongStreet(0, 8, 100, half, margin);
    expect(z).toBeGreaterThanOrEqual(-60);
    expect(z).toBeLessThanOrEqual(60);
    // 800 m forward on a 120 m loop from the middle lands 40 m before it.
    expect(z).toBeCloseTo(-40);
  });

  it("is still when there is no time or speed", () => {
    expect(advanceAlongStreet(12, 5, 0, half, margin)).toBe(12);
    expect(advanceAlongStreet(12, 0, 1, half, margin)).toBe(12);
  });
});
