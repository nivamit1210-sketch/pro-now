import { describe, expect, it } from "vitest";
import { cameraMode, inPosition } from "./facePlan";

describe("inPosition", () => {
  it("straight means the nose near the middle", () => {
    expect(inPosition("straight", 0.05, true)).toBe(true);
    expect(inPosition("straight", 0.2, true)).toBe(false);
  });
  it("right and left follow the picture, flipped when the selfie is mirrored", () => {
    expect(inPosition("right", -0.2, true)).toBe(true);
    expect(inPosition("right", 0.2, true)).toBe(false);
    expect(inPosition("right", 0.2, false)).toBe(true);
    expect(inPosition("left", 0.2, true)).toBe(true);
    expect(inPosition("left", 0.05, true)).toBe(false);
  });
});

describe("cameraMode", () => {
  it("uses the live camera when it opens", async () => {
    const stop = { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream;
    expect(await cameraMode(async () => stop)).toBe("live");
  });
  it("falls back to the phone's camera app when permission is denied", async () => {
    expect(await cameraMode(async () => { throw new DOMException("denied", "NotAllowedError"); })).toBe("picker");
  });
});
