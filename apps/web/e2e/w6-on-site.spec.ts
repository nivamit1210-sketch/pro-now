import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * Ordering for someone else (docs/21 W6): grandpa gets a link with who is
 * coming and the code the professional will say at the door.
 */
const LAT = 32.1;
const LNG = 34.8;

test("the person at home gets a page with the professional and the door code", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-orderer"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", {
    data: { kind: "location", lat: LAT, lng: LNG, details: "סבא: ויצמן 3" },
    headers: { origin: baseURL! },
  });
  expect(address.ok(), await address.text()).toBe(true);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
  try {
    // The person at home is chosen with the address, from home's chip, as in
    // the demo (docs/DEMO-SYNC.md, 2026-10-01 C3): a switch, a name, a mobile.
    await page.reload();
    await page.getByRole("button", { name: "שינוי כתובת" }).click();
    await page.getByRole("switch", { name: "הקריאה היא בשביל מישהו אחר" }).click();
    await page.getByRole("textbox", { name: "שם מי שנמצא בבית" }).fill("סבא יוסף");
    await page.getByRole("textbox", { name: "טלפון של מי שנמצא בבית" }).fill("050-1234567");
    await page.getByRole("button", { name: "אישור הכתובת" }).click();
    await expect(page.getByText(/עבור סבא יוסף/)).toBeVisible();

    await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה אצל סבא");
    await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
    // The service page first, as in the demo; then the form, which only describes the job.
    await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    await expect(page.getByRole("switch")).toHaveCount(0);
    await page.getByRole("button", { name: "שליחת הקריאה" }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;

    await pro.acceptOfferFor(jobId);
    await page.getByRole("button", { name: /^שליחת .* אליי$/ }).click({ timeout: 15_000 });

    // The orderer sees the code the server issued at assignment.
    const status = page.getByText(/^הקוד לדלת: \d{4} · לחצו לשליחת הקישור לסבא יוסף$/);
    await expect(status).toBeVisible({ timeout: 15_000 });
    const code = (await status.textContent())!.match(/\d{4}/)![0];

    // The link the share button sends, opened with no account at all.
    const minted = await page.request.post(`/api/v1/jobs/${jobId}/on-site-link`, { headers: { origin: baseURL! } });
    expect(minted.ok(), await minted.text()).toBe(true);
    const { url } = (await minted.json()) as { url: string };
    const grandpa = await browser.newContext({ locale: "he-IL", extraHTTPHeaders: asPerson() });
    const phone = await grandpa.newPage();
    await phone.goto(new URL(url).pathname);
    // Spaced for reading aloud; the label carries it whole.
    await expect(phone.getByLabel(`הקוד ${code}`)).toBeVisible();
    await expect(phone.getByText("דנה").first()).toBeVisible();
    // Spoken of as she asked while joining (audit v2 #3).
    await expect(phone.getByText("כשהיא בדלת, בקשו ממנה את הקוד:")).toBeVisible();
    // No address, no price, nothing to approve or pay.
    await expect(phone.getByText("ויצמן")).toHaveCount(0);
    await expect(phone.getByText("₪")).toHaveCount(0);
    await grandpa.close();
  } finally {
    await pro.dispose();
  }
});
