import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, signInExisting, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * Audit v2 #8b: "משהו לא נראה לי תקין" under the door code opens the
 * demo's safety sheet; the report reaches a person (a ticket the admin
 * sees, and an ops alert), and the customer is told only that it was
 * received. The admin closes it with what was done.
 */
const LAT = 32.061;
const LNG = 34.776;

test("at the door: a safety report from the customer reaches the admin, who closes it", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  await signInByEmail(page, uniqueEmail("e2e-safety"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "שינקין 20" }, headers: { origin: baseURL! } });
  expect(address.ok(), await address.text()).toBe(true);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
  const note = `הגיע עם עוד מישהו ${Date.now() % 100000}`;
  try {
    await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
    await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
    await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    await page.getByRole("button", { name: "שליחת הקריאה" }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    await pro.acceptOfferFor(jobId);
    await page.getByRole("button", { name: /^שליחת .* אליי$/ }).click({ timeout: 15_000 });
    for (const step of ["en-route", "arrive"] as const) await pro.step(jobId, step);
    await expect(page.getByText("קוד האימות שלכם")).toBeVisible({ timeout: 15_000 });

    // The demo's sheet. An ordinary job has no link to share, so only the report is offered.
    await page.getByRole("button", { name: "משהו לא נראה לי תקין" }).click();
    await expect(page.getByText("בטיחות", { exact: true })).toBeVisible();
    await expect(page.getByText("הדיווח מגיע לאדם מהצוות שלנו, לא למקצוען.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "שיתוף מצב הקריאה" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "בסכנה מיידית: משטרה 100" })).toBeVisible();
    await page.getByRole("button", { name: "דיווח על בעיה במהלך הביקור" }).click();

    // What is wrong first; then the words, if they want.
    const send = page.getByRole("button", { name: "שליחת הדיווח" });
    await expect(send).toBeDisabled();
    await page.getByRole("radio", { name: "הקוד לא תואם" }).click();
    await page.getByRole("textbox", { name: "מה קרה? (לא חובה)" }).fill(note);
    await testInfo.attach("report", { body: await page.screenshot(), contentType: "image/png" });
    await send.click();
    await expect(page.getByText("קיבלנו, נחזור אליך")).toBeVisible();
    await expect(page.getByText("הדיווח אצל הצוות שלנו. בסכנה מיידית: משטרה 100.")).toBeVisible();
    await testInfo.attach("received", { body: await page.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: "סגירה" }).last().click();
    await expect(page.getByText("קיבלנו, נחזור אליך")).toHaveCount(0);
    await expect(page.getByText("קוד האימות שלכם")).toBeVisible();

    // The admin: the report, counted on its tab, closed with what was done.
    const adminCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL" });
    try {
      const a = await adminCtx.newPage();
      await signInExisting(a, "e2e-admin@pronow.test", baseURL!);
      const intro = a.getByRole("button", { name: "דילוג על ההסבר" });
      await expect(intro.or(a.getByRole("button", { name: "תפריט" }))).toBeVisible();
      if (await intro.isVisible()) await finishFirstRun(a);
      await a.goto("/admin");
      await a.getByRole("tab", { name: /^דיווחים \(\d+\)$/ }).click();
      const row = a.getByLabel("דיווח: הקוד לא תואם").filter({ hasText: note });
      await expect(row).toBeVisible();
      await expect(row).toContainText("נזילה או דליפת מים");
      await expect(row).toContainText("מקצוען: דנה");
      await expect(row.getByRole("button", { name: "סימון כטופל" })).toBeDisabled();
      await a.getByRole("textbox", { name: "מה נעשה (חובה לסגירה, נשמר ביומן)" }).fill("דיברנו עם הלקוח ועם המקצוענית");
      await testInfo.attach("admin", { body: await a.screenshot(), contentType: "image/png" });
      await row.getByRole("button", { name: "סימון כטופל" }).click();
      await expect(a.getByText(note)).toHaveCount(0);
      await a.getByRole("button", { name: "טופלו" }).click();
      await expect(a.getByText(`״${note}״`)).toBeVisible();
    } finally {
      await adminCtx.close();
    }
  } finally {
    await pro.dispose();
  }
});
