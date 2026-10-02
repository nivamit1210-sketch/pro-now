import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";
import { IPHONE_KEYBOARD_PX, fakeKeyboard, setKeyboard, visibleAndUncovered } from "./keyboard-helpers";

/**
 * TYPING ON A PHONE (an iPhone 16 Pro recording, 2026-10-02): with a live
 * job, the request form's send panel and the job's capsule rode up with the
 * keyboard and covered the text box being typed in.
 *
 * Chromium has no on-screen keyboard, and the app only learns of one through
 * `visualViewport` (keyboard.ts) — so the test stands in for iOS there: the
 * visible strip shrinks by a keyboard's height, exactly as Safari reports it.
 */
const KEYBOARD_PX = IPHONE_KEYBOARD_PX;

test.beforeEach(async ({ page }) => fakeKeyboard(page));

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
      .poll(() => visibleAndUncovered(field, KEYBOARD_PX))
      .toBe(true);
    await field.fill("השקע בסלון לא עובד מאתמול, וגם המנורה במטבח מהבהבת");
    await expect
      .poll(() => visibleAndUncovered(field, KEYBOARD_PX))
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

test("signing in on a phone: the email box is not covered by the buttons when the keyboard is up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /אני צריך מקצוען/ }).click();
  const email = page.getByRole("textbox", { name: "כתובת מייל" });
  await email.click();
  await setKeyboard(page, KEYBOARD_PX);
  // The screen scrolls rather than stacking "שליחת קישור" on the box (it did, 2026-10-02).
  await expect.poll(() => visibleAndUncovered(email, KEYBOARD_PX)).toBe(true);
  await email.fill("someone@example.com");
  await expect.poll(() => visibleAndUncovered(email, KEYBOARD_PX)).toBe(true);
  await setKeyboard(page, 0);
  await expect(page.getByRole("button", { name: "שליחת קישור" })).toBeVisible();
});
