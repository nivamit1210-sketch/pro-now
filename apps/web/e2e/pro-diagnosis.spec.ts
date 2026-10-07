import path from "node:path";
import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, signInExisting, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * "Two kinds of work" (docs/18 ROADMAP, 2026-09-29; Dvir, 2026-10-02), the
 * professional in their own browser:
 *
 *   - an ordinary visit-and-diagnosis job ends at the diagnosis — the app
 *     carries the visit fee and nothing else, and the repair is agreed at
 *     the door;
 *   - a job ordered for someone else is quoted in the app, because the
 *     person at the door is not the one who decides.
 *
 * Getting to the diagnosis goes through the API (w7-journey drives those
 * steps by hand); what is on trial here is the button at the diagnosis.
 */
const LAT = 32.07;
const LNG = 34.79;

test.describe("the pro's diagnosis", () => {
  test("an ordinary visit: 'סיימתי את האבחון', no quote, settled at the visit fee", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await signInByEmail(page, uniqueEmail("e2e-diag-customer"));
    await finishFirstRun(page);
    const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "אבן גבירול 10" }, headers: { origin: baseURL! } });
    expect(address.ok(), await address.text()).toBe(true);
    const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
    const proCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL", extraHTTPHeaders: asPerson() });
    try {
      await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
      await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
      await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
      await page.getByRole("button", { name: "שליחת הקריאה" }).click();
      await expect(page).toHaveURL(/\/jobs\//);
      const jobId = new URL(page.url()).pathname.split("/").pop()!;
      await pro.acceptOfferFor(jobId);
      await page.getByRole("button", { name: "כן, מתאים לי" }).click({ timeout: 15_000 });
      for (const step of ["en-route", "arrive", "start"] as const) await pro.step(jobId, step);

      // The customer: the visit fee, and the repair settled directly.
      await expect(page.getByText("‏180 ‏₪ על הביקור והאבחון · את התיקון עצמו סוגרים ישירות מול המקצוען")).toBeVisible({ timeout: 15_000 });

      // The professional: one button, and it is not a quote.
      const p = await proCtx.newPage();
      await signInExisting(p, pro.email, baseURL!);
      await p.goto(`/pro/jobs/${jobId}`);
      const finish = p.getByRole("button", { name: /^סיימתי את האבחון/ });
      await expect(finish).toBeVisible({ timeout: 15_000 });
      // The professional reads the name the customer picked (audit v2 #1).
      await expect(p.getByText("נזילה או דליפת מים").first()).toBeVisible();
      await expect(p.getByText("נזילה/פיצוץ בצנרת")).toHaveCount(0);
      await expect(p.getByRole("button", { name: /שליחת הצעת מחיר/ })).toHaveCount(0);
      await expect(p.getByText(/הקריאה הוזמנה על ידי/)).toHaveCount(0);
      await testInfo.attach("pro-diagnosis", { body: await p.screenshot(), contentType: "image/png" });
      await finish.click();
      await expect(p.getByText("סיימת — מחכים לאישור הלקוח")).toBeVisible({ timeout: 15_000 });

      // The customer confirms what is owed: the visit fee, to the professional directly.
      const confirm = page.getByRole("button", { name: "אישור שהעבודה הושלמה" });
      await expect(confirm).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("‏180 ‏₪ · לתשלום ישירות למקצוען")).toBeVisible();
      await expect(page.getByText(/הצעת המחיר/)).toHaveCount(0);
      await confirm.click();
      await expect(page.getByText("איך היה?")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("סיכום לתשלום")).toBeVisible();
      await expect(page.getByText(/^‏?180\s*‏?₪$/).first()).toBeVisible();
    } finally {
      await proCtx.close();
      await pro.dispose();
    }
  });

  test("ordered for someone else: the repair is quoted in the app, to the person who ordered", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await signInByEmail(page, uniqueEmail("e2e-diag-orderer"));
    await finishFirstRun(page);
    const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "סבא: ויצמן 3" }, headers: { origin: baseURL! } });
    expect(address.ok(), await address.text()).toBe(true);
    const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
    const proCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL", extraHTTPHeaders: asPerson() });
    try {
      await page.reload();
      await page.getByRole("button", { name: "שינוי כתובת" }).click();
      await page.getByRole("switch", { name: "הקריאה היא בשביל מישהו אחר" }).click();
      await page.getByRole("textbox", { name: "שם מי שנמצא בבית" }).fill("סבא יוסף");
      await page.getByRole("textbox", { name: "טלפון של מי שנמצא בבית" }).fill("050-1234567");
      await page.getByRole("button", { name: "אישור הכתובת" }).click();
      await expect(page.getByText(/עבור סבא יוסף/)).toBeVisible();
      await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה אצל סבא");
      await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
      await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
      await page.getByRole("button", { name: "שליחת הקריאה" }).click();
      await expect(page).toHaveURL(/\/jobs\//);
      const jobId = new URL(page.url()).pathname.split("/").pop()!;
      await pro.acceptOfferFor(jobId);
      await page.getByRole("button", { name: "כן, מתאים לי" }).click({ timeout: 15_000 });
      for (const step of ["en-route", "arrive", "start"] as const) await pro.step(jobId, step);

      // The orderer is told the price comes to them, in the app — not settled at grandpa's door.
      await expect(page.getByText("אחרי הביקור והאבחון הצעת המחיר תגיע אליך באפליקציה · בבית לא סוגרים מחיר")).toBeVisible({ timeout: 15_000 });

      // The professional quotes, and is told where it goes.
      const p = await proCtx.newPage();
      await signInExisting(p, pro.email, baseURL!);
      await p.goto(`/pro/jobs/${jobId}`);
      const quote = p.getByRole("button", { name: /^שליחת הצעת מחיר/ });
      await expect(quote).toBeVisible({ timeout: 15_000 });
      await expect(p.getByRole("button", { name: /^סיימתי את האבחון/ })).toHaveCount(0);
      // This orderer skipped the profile, so has no name: the sentence says who without one.
      await expect(p.getByText("הקריאה הוזמנה בשביל מי שבבית: ההצעה נשלחת למי שהזמין. בבית לא סוגרים מחיר.")).toBeVisible();
      await expect(p.getByText("מצלמים, מקליטים ושולחים הצעת מחיר למי שהזמין באפליקציה. בבית לא סוגרים מחיר.")).toBeVisible();
      await testInfo.attach("pro-diagnosis-on-site", { body: await p.screenshot(), contentType: "image/png" });
      await quote.click();
      await p.getByRole("textbox", { name: "תיאור שורה 1" }).fill("החלפת סיפון");
      await p.getByRole("textbox", { name: "מחיר ליחידה בשורה 1" }).fill("320");
      // Far away, they decide from what was found: a photo of the fault and the finding in words, or it does not go.
      const send = p.getByRole("button", { name: "שליחת הצעת המחיר למי שהזמין" });
      await expect(send).toBeDisabled();
      const chooser = p.waitForEvent("filechooser");
      await p.getByRole("button", { name: "+ צילום התקלה" }).click();
      await (await chooser).setFiles(path.resolve(import.meta.dirname, "../public/world/character_auto_world.webp"));
      await expect(p.getByRole("button", { name: "הסרת התמונה" })).toBeVisible();
      await p.getByRole("textbox", { name: "מה מצאת, במילים" }).fill("הסיפון סדוק מתחת לכיור");
      await send.click();

      // It waits for the person who ordered (still no money in the app, D1); the professional is told so.
      await expect(p.getByText("ממתינים לאישור של מי שהזמין. מתחילים לעבוד רק אחרי האישור.")).toBeVisible({ timeout: 15_000 });
      // The orderer sees what was found, then the sum, and approves.
      await expect(page.getByLabel("תמונה של התקלה")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("הסיפון סדוק מתחת לכיור")).toBeVisible();
      await expect(page.getByText("באפליקציה לא עובר כסף: האישור קובע את המחיר, והתשלום ישירות לבעל המקצוע.")).toBeVisible();
      await testInfo.attach("orderer-approves", { body: await page.screenshot(), contentType: "image/png" });
      await page.getByRole("button", { name: /^אישור הצעת מחיר על סך/ }).click();
      await expect(page.getByText("הצעת המחיר: ‏320 ‏₪ · משלמים ישירות למקצוען")).toBeVisible({ timeout: 15_000 });
      // At home: the price was approved by whoever ordered, and is paid directly; never the amount.
      const minted = await page.request.post(`/api/v1/jobs/${jobId}/on-site-link`, { headers: { origin: baseURL! } });
      const home = await (await browser.newContext({ locale: "he-IL", extraHTTPHeaders: asPerson() })).newPage();
      await home.goto(new URL(((await minted.json()) as { url: string }).url).pathname);
      await expect(home.getByText(/אישר את המחיר — דנה מתחילה לעבוד$/)).toBeVisible({ timeout: 15_000 });
      await expect(home.getByText(/את הסכום שאושר משלמים לדנה ישירות, כרגיל\.$/)).toBeVisible();
      await expect(home.getByText("₪")).toHaveCount(0);
      await home.context().close();
      await p.getByRole("button", { name: /^סיימתי/ }).first().click({ timeout: 15_000 });
      await expect(p.getByText("סיימת — מחכים לאישור הלקוח")).toBeVisible({ timeout: 15_000 });
      const confirm = page.getByRole("button", { name: "אישור שהעבודה הושלמה" });
      await expect(confirm).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("‏320 ‏₪ · לתשלום ישירות למקצוען")).toBeVisible();
      await confirm.click();
      await expect(page.getByText("איך היה?")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/^‏?320\s*‏?₪$/).first()).toBeVisible();
    } finally {
      await proCtx.close();
      await pro.dispose();
    }
  });
});
