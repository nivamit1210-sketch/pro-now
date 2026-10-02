import type { Locator, Page } from "@playwright/test";

/**
 * An iPhone keyboard, for a browser that has none.
 *
 * The app learns of the on-screen keyboard only through `visualViewport`
 * (keyboard.ts): iOS keeps the page's size and shrinks the visible strip.
 * `fakeKeyboard` replaces `visualViewport` before the app loads so a test
 * can do the same, by a real keyboard's height.
 */
export const IPHONE_KEYBOARD_PX = 380; // iPhone 16 Pro: the keyboard with its suggestion and accessory bars

export async function fakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = new EventTarget();
    let keyboard = 0;
    const fake = {
      get height() {
        return document.documentElement.clientHeight - keyboard;
      },
      get width() {
        return document.documentElement.clientWidth;
      },
      scale: 1,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    Object.defineProperty(window, "visualViewport", { get: () => fake, configurable: true });
    (window as unknown as { setKeyboard: (px: number) => void }).setKeyboard = (px: number) => {
      keyboard = px;
      target.dispatchEvent(new Event("resize"));
    };
  });
}

export const setKeyboard = (page: Page, px: number) =>
  page.evaluate((v) => (window as unknown as { setKeyboard: (n: number) => void }).setKeyboard(v), px);

/**
 * At least `min` px of the field are on screen above the keyboard, and
 * nothing sits on them: the browser's own hit test, across that visible
 * part, lands on the field itself. Returns true, or what is wrong.
 */
export function visibleAndUncovered(field: Locator, keyboard: number, min = 40): Promise<string | true> {
  return field.evaluate(
    (el, { keyboard, min }) => {
      const r = el.getBoundingClientRect();
      const bottom = Math.min(r.bottom, document.documentElement.clientHeight - keyboard);
      const top = Math.max(r.top, 0);
      const need = Math.min(min, r.height);
      if (bottom - top < need) return `only ${Math.max(0, Math.round(bottom - top))} of ${Math.round(r.height)} px above the keyboard`;
      for (const y of [top + 4, (top + bottom) / 2, bottom - 4]) {
        const hit = document.elementFromPoint(r.left + r.width / 2, y);
        if (!(hit === el || el.contains(hit))) return `covered at y=${Math.round(y)} by "${(hit?.textContent ?? "?").trim().slice(0, 40)}"`;
      }
      return true;
    },
    { keyboard, min }
  );
}
