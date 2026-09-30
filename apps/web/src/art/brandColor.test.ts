import { describe, expect, it } from "vitest";

import { dominantColorOf } from "./brandColor";

const px = (...colors: Array<[number, number, number, number]>) => colors.flat();

describe("dominantColorOf", () => {
  it("finds the logo's vivid colour and ignores white, black, grey and transparent", () => {
    const purple: [number, number, number, number] = [139, 92, 246, 255];
    const pixels = px(
      ...Array<[number, number, number, number]>(10).fill([255, 255, 255, 255]),
      ...Array<[number, number, number, number]>(10).fill([0, 0, 0, 255]),
      ...Array<[number, number, number, number]>(10).fill([128, 128, 128, 255]),
      ...Array<[number, number, number, number]>(10).fill([255, 0, 0, 0]),
      ...Array<[number, number, number, number]>(3).fill(purple)
    );
    expect(dominantColorOf(pixels)).toBe("#8B5CF6");
  });

  it("the most frequent vivid colour wins", () => {
    const pixels = px(...Array<[number, number, number, number]>(2).fill([255, 92, 56, 255]), ...Array<[number, number, number, number]>(5).fill([47, 191, 138, 255]));
    expect(dominantColorOf(pixels)).toBe("#2FBF8A");
  });

  it("a logo with no vivid colour gives no colour", () => {
    expect(dominantColorOf(px([255, 255, 255, 255], [20, 20, 20, 255]))).toBeNull();
    expect(dominantColorOf([])).toBeNull();
  });
});
