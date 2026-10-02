import { describe, expect, it } from "vitest";

import { createFrameGovernor, DEFAULT_FRAME_GOVERNOR } from "./frameGovernor";

const feed = (frames: number[]) => {
  const governor = createFrameGovernor();
  let last = governor.verdict;
  for (const ms of frames) last = governor.record(ms);
  return last;
};

describe("frame governor", () => {
  const warmup = Array(DEFAULT_FRAME_GOVERNOR.warmupFrames).fill(400);

  it("keeps the effects on a fast device, whatever the slow warm-up", () => {
    expect(feed([...warmup, ...Array(12).fill(16.7)])).toBe("keep");
  });

  it("drops them when frames come in slower than 30 fps", () => {
    expect(feed([...warmup, ...Array(12).fill(45)])).toBe("drop");
  });

  it("decides on a very slow renderer within about 1.5 s of sampling", () => {
    // Software WebGL with the effects on: ~180 ms a frame.
    const governor = createFrameGovernor();
    warmup.forEach((ms) => governor.record(ms));
    const verdicts = Array.from({ length: 12 }, () => governor.record(180));
    expect(verdicts.indexOf("drop")).toBe(8); // 9 frames × 180 ms ≥ 1500 ms
  });

  it("is not swayed by one hitch", () => {
    expect(feed([...warmup, 16, 17, 900, 16, 17, 16, 17, 16, 17, 16, 17, 16])).toBe("keep");
  });

  it("waits while there are too few frames to judge", () => {
    expect(feed([...warmup, 20, 20, 20])).toBe("measuring");
  });

  it("ignores frames that measured nothing", () => {
    expect(feed([...warmup, 0, NaN, -5, ...Array(11).fill(20)])).toBe("measuring");
  });

  it("does not change its mind", () => {
    const governor = createFrameGovernor();
    [...warmup, ...Array(12).fill(16)].forEach((ms) => governor.record(ms));
    expect(governor.record(500)).toBe("keep");
    expect(governor.verdict).toBe("keep");
  });
});
