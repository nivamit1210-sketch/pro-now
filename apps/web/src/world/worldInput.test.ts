import { describe, expect, it } from "vitest";

import { movementFromKeyboard, movementFromPointer, stickKnobOffset, worldActionFromKey } from "./worldInput";

describe("world input", () => {
  it("maps arrows and WASD to the same movement", () => {
    expect(movementFromKeyboard(new Set(["ArrowUp"]))).toEqual({ x: 0, z: -1, sprint: false });
    expect(movementFromKeyboard(new Set(["w", "Shift"]))).toEqual({ x: 0, z: -1, sprint: true });
  });

  it("normalizes diagonal movement", () => {
    const result = movementFromKeyboard(new Set(["ArrowUp", "ArrowRight"]));
    expect(Math.hypot(result.x, result.z)).toBeCloseTo(1);
  });

  it("applies a pointer dead zone and radius clamp", () => {
    expect(movementFromPointer(2, 2, 100)).toEqual({ x: 0, z: 0, sprint: false });
    const result = movementFromPointer(200, -200, 100);
    expect(Math.hypot(result.x, result.z)).toBeCloseTo(1);
  });

  it("returns to zero when touch input is released", () => {
    expect(movementFromPointer(0, 0, 100)).toEqual({ x: 0, z: 0, sprint: false });
  });

  it("maps Escape to exit and Enter to shop entry", () => {
    expect(worldActionFromKey("Escape")).toBe("EXIT");
    expect(worldActionFromKey("Enter")).toBe("ENTER_SHOP");
    expect(worldActionFromKey("ArrowUp")).toBeNull();
  });
});

describe("stickKnobOffset", () => {
  it("follows the finger inside the ring", () => {
    expect(stickKnobOffset(20, -30, 60)).toEqual({ x: 20, y: -30 });
  });

  it("stops at the ring when the finger goes past it, in the same direction", () => {
    const knob = stickKnobOffset(0, -150, 60);
    expect(knob.x).toBeCloseTo(0);
    expect(knob.y).toBeCloseTo(-60);
    const diagonal = stickKnobOffset(90, 120, 60); // 150 px away
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(60);
    expect(diagonal.x / diagonal.y).toBeCloseTo(90 / 120);
  });

  it("rests in the middle when the finger has not moved", () => {
    expect(stickKnobOffset(0, 0, 60)).toEqual({ x: 0, y: 0 });
  });
});
