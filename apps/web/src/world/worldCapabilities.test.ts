import { describe, expect, it } from "vitest";

import { detectWorldCapabilities, shouldPauseWorld } from "./worldCapabilities";

describe("world capability policy", () => {
  it("falls back when WebGL is unavailable", () => {
    expect(
      detectWorldCapabilities({
        webglAvailable: false,
        reducedMotion: false,
        coarsePointer: false,
        devicePixelRatio: 2,
      }).canRender
    ).toBe(false);
  });

  it("caps coarse-pointer pixel ratio at 1.5", () => {
    expect(
      detectWorldCapabilities({
        webglAvailable: true,
        reducedMotion: false,
        coarsePointer: true,
        devicePixelRatio: 3,
      }).pixelRatio
    ).toBe(1.5);
  });

  it("caps desktop pixel ratio at 2", () => {
    expect(
      detectWorldCapabilities({
        webglAvailable: true,
        reducedMotion: false,
        coarsePointer: false,
        devicePixelRatio: 3,
      }).pixelRatio
    ).toBe(2);
  });

  it("keeps state changes but disables decorative animation for reduced motion", () => {
    const result = detectWorldCapabilities({
      webglAvailable: true,
      reducedMotion: true,
      coarsePointer: false,
      devicePixelRatio: 1,
    });
    expect(result.canRender).toBe(true);
    expect(result.animateTransitions).toBe(false);
  });

  it("pauses while the document is hidden", () => {
    expect(shouldPauseWorld("hidden")).toBe(true);
    expect(shouldPauseWorld("visible")).toBe(false);
  });
});
