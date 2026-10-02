import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CityHero } from "./CityHero";

/** The home hero is the demo's `CITY_BG`: the evening city at every hour. */
describe("CityHero", () => {
  afterEach(() => vi.useRealTimers());

  for (const [when, at] of [["at noon", "2026-10-02T12:00:00"], ["at night", "2026-10-02T21:00:00"]] as const) {
    it(`shows the evening city ${when}`, () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(at));
      const html = renderToStaticMarkup(createElement(CityHero));
      expect(html).toContain('src="/world/splash_city.webp"');
      expect(html).not.toContain("splash_city_day");
    });
  }
});
