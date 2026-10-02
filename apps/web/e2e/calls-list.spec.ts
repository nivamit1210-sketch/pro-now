import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * הקריאות שלי (the demo's calls tab) on the real server: from the menu,
 * the customer's own jobs — the live one, the one waiting for their stars,
 * and the closed one with who came and what it came to. Each row opens
 * that job's screen. The professional acts through the API, as in w6.
 */
const LAT = 32.0853;
const LNG = 34.7818;

async function openCalls(page: Page) {
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^הקריאות שלי/ }).click();
  await expect(page).toHaveURL(/\/calls$/);
  await expect(page.getByText("הקריאות שלי", { exact: true })).toBeVisible();
}

test("a customer's job in the calls list, live, waiting for stars, then closed", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });

  await signInByEmail(page, uniqueEmail("e2e-calls"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", {
    data: { kind: "location", lat: LAT, lng: LNG, details: "הרצל 3" },
    headers: { origin: baseURL! },
  });
  expect(address.ok(), await address.text()).toBe(true);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
  try {
    await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
    await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
    await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    await page.getByRole("button", { name: "שליחת הקריאה" }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    await pro.acceptOfferFor(jobId);
    await pro.step(jobId, "en-route");

    // Live: the card on top, with who is coming and where it stands.
    await openCalls(page);
    await expect(page.getByText("עכשיו", { exact: true })).toBeVisible();
    await expect(page.getByText("הזמנה אחת פעילה")).toBeVisible();
    const live = page.getByRole("button", { name: /^הזמנה 1 מתוך 1: .*, דנה, בדרך$/ });
    await expect(live).toBeVisible();
    await shot("calls-live");
    await live.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));

    for (const step of ["arrive", "start"] as const) await pro.step(jobId, step);
    await pro.quote(jobId, 32000);
    await pro.step(jobId, "complete");
    const confirm = page.getByRole("button", { name: "אישור שהעבודה הושלמה" });
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await expect(page.getByText("איך היה?")).toBeVisible({ timeout: 15_000 });

    // Finished, review open: it waits for the customer, and the button opens the review.
    await openCalls(page);
    await expect(page.getByText("ממתין לך")).toBeVisible();
    await expect(page.getByText("עכשיו", { exact: true })).toHaveCount(0);
    await shot("calls-needs-rating");
    await page.getByRole("button", { name: "דירוג המקצוען" }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));
    await page.getByRole("button", { name: "5 כוכבים" }).click();
    await page.getByRole("button", { name: "שליחת דירוג" }).click();
    await expect(page.getByText("הקריאה נסגרה")).toBeVisible({ timeout: 15_000 });

    // Closed: history, with who came and the receipt's amount; nothing waits any more.
    await openCalls(page);
    await expect(page.getByText("הושלמו", { exact: true })).toBeVisible();
    await expect(page.getByText("ממתין לך")).toHaveCount(0);
    const row = page.getByRole("button", { name: / · הושלם$/ });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("היום · הושלם");
    await expect(row).toContainText("דנה");
    await expect(row).toContainText("320");
    await expect(page.getByText(/חויב|מאושר בכרטיס/)).toHaveCount(0);
    await shot("calls-closed");
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));
    await expect(page.getByText("הקריאה נסגרה")).toBeVisible();
  } finally {
    await pro.dispose();
  }
});

test("someone with no calls yet sees the empty state, and its button goes home", async ({ page }, testInfo) => {
  await signInByEmail(page, uniqueEmail("e2e-calls-empty"));
  await finishFirstRun(page);
  await openCalls(page);
  await expect(page.getByText("עוד לא שלחת קריאה")).toBeVisible();
  await expect(page.getByText("כל קריאה שתשלח תופיע כאן — עם מי הגיע, מתי, וכמה זה עלה.")).toBeVisible();
  await testInfo.attach("calls-empty", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "שליחת קריאה" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("textbox", { name: "ספרו מה צריך" })).toBeVisible();
});

test("back from the calls list returns to the menu it was opened from", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-calls-back"));
  await finishFirstRun(page);
  await openCalls(page);
  await page.getByRole("button", { name: "חזרה", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /^הקריאות שלי/ })).toBeVisible();
});
