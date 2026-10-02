import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

/**
 * TYPING ON A PHONE (an iPhone 16 Pro recording, 2026-10-02): with a live
 * job, the request form's send panel and the job's capsule rode up with the
 * keyboard and covered the text box being typed in.
 *
 * Chromium has no on-screen keyboard, and the app only learns of one through
 * `visualViewport` (keyboard.ts) — so the test stands in for iOS there: the
 * visible strip shrinks by a keyboard's height, exactly as Safari reports it.
 */
const KEYBOARD_PX = 380; // iPhone 16 Pro: the keyboard with its suggestion and accessory bars

test.beforeEach(async ({ page }) => {
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
    Object.defineProperty(window, "visualViewport", {
      get: () => fake,
      configurable: true,
    });
    (window as unknown as { setKeyboard: (px: number) => void }).setKeyboard = (
      px: number,
    ) => {
      keyboard = px;
      target.dispatchEvent(new Event("resize"));
    };
  });
});

const setKeyboard = (page: Page, px: number) =>
  page.evaluate(
    (v) =>
      (window as unknown as { setKeyboard: (n: number) => void }).setKeyboard(
        v,
      ),
    px,
  );

/**
 * At least `min` px of the box are on screen above the keyboard, and nothing
 * sits on them: the browser's own hit test, across that visible part,
 * lands on the box itself.
 */
async function visibleAndUncovered(
  page: Page,
  label: string,
  keyboard: number,
  min = 40,
): Promise<string | true> {
  return page.getByRole("textbox", { name: label }).evaluate(
    (el, { keyboard, min }) => {
      const r = el.getBoundingClientRect();
      const bottom = Math.min(
        r.bottom,
        document.documentElement.clientHeight - keyboard,
      );
      const top = Math.max(r.top, 0);
      if (bottom - top < min)
        return `only ${Math.round(bottom - top)} px of the box above the keyboard`;
      for (const y of [top + 8, (top + bottom) / 2, bottom - 8]) {
        const hit = document.elementFromPoint(r.left + r.width / 2, y);
        if (!(hit === el || el.contains(hit)))
          return `covered at y=${Math.round(y)} by ${hit?.textContent?.slice(0, 40) ?? "?"}`;
      }
      return true;
    },
    { keyboard, min },
  );
}

test("typing a second request with a job live: the text box stays in sight above the keyboard", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-keyboard"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", {
    data: { kind: "location", lat: 32.0853, lng: 34.7818, details: "הרצל 1" },
    headers: { origin: baseURL! },
  });
  expect(address.ok(), await address.text()).toBe(true);

  // A first request, still searching: a live job, so home carries its capsule.
  await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
  await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
  await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
  await page.getByRole("button", { name: "שליחת הקריאה" }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  const jobId = new URL(page.url()).pathname.split("/").pop()!;
  try {
    await page.goto("/");
    // The capsule draws a walker, not words; its name is "<service> · <state>".
    const capsule = page.getByRole("button", { name: /^נזילה.* · / });
    await expect(capsule.first()).toBeVisible();

    // A second request: the form, then the keyboard.
    await page
      .getByRole("textbox", { name: "ספרו מה צריך" })
      .fill("שקע שלא עובד");
    await page
      .getByRole("button", { name: /המשך עם/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    const field = page.getByRole("textbox", { name: "מה צריך, במילים שלך" });
    await expect(field).toBeVisible();
    await field.click();
    await setKeyboard(page, KEYBOARD_PX);

    // The box is above the keyboard and nothing covers it, empty or typed in.
    await expect
      .poll(() => visibleAndUncovered(page, "מה צריך, במילים שלך", KEYBOARD_PX))
      .toBe(true);
    await field.fill("השקע בסלון לא עובד מאתמול, וגם המנורה במטבח מהבהבת");
    await expect
      .poll(() => visibleAndUncovered(page, "מה צריך, במילים שלך", KEYBOARD_PX))
      .toBe(true);
    // The header, the capsule and the send panel step aside while typing...
    await expect(
      page.getByRole("button", { name: "שליחת הקריאה" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "תפריט" })).toHaveCount(0);
    await expect(capsule).toHaveCount(0);

    // ...and come back when the keyboard closes.
    await setKeyboard(page, 0);
    await expect(capsule.first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "שליחת הקריאה" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "תפריט" })).toBeVisible();
    await expect(field).toHaveValue(/השקע בסלון/);
  } finally {
    // Never leave a request searching: a later test's professional would be offered it.
    await page.request.post(`/api/v1/jobs/${jobId}/cancel`, {
      data: {},
      headers: { origin: baseURL! },
    });
  }
  await expect(
    page.getByText(/עוזרים למקצוען להגיע מוכן|כל מקצוען קובע/).first(),
  ).toBeVisible();
});
