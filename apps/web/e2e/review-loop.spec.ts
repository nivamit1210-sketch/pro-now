import type { Locator, Page } from "@playwright/test";
import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInExisting } from "./helpers";
import { pendingApplicant } from "./pro-helpers";

/**
 * The review loop (docs/10 §Review loop: asking for fixes), end to end: the
 * reviewer marks two items with reasons and sends them as one round; the
 * professional sees both, fixes each in its own step, and resends; the
 * application is back in the queue with both fixed.
 */
test("a reviewer asks for two fixes; the professional fixes them and resends; the reviewer sees them fixed", async ({ page, browser, baseURL }) => {
  test.setTimeout(150_000);
  const name = `ליה${Date.now() % 100000}`;
  const { email } = await pendingApplicant("HOME_PLUMB_LEAK", name);

  // Reviewer: open the application from the admin's queue.
  await signInExisting(page, "e2e-admin@pronow.test", baseURL!);
  const intro = page.getByRole("button", { name: "דילוג על ההסבר" });
  await expect(intro.or(page.getByRole("button", { name: "תפריט" }))).toBeVisible();
  if (await intro.isVisible()) await finishFirstRun(page);
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^ניהול/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: `בקשה של ${name}` }).click();
  await expect(page.getByText("TAX_FILE · PENDING")).toBeVisible();

  const reason = page.getByRole("textbox", { name: /סיבה/ });
  const send = page.getByRole("button", { name: /^החזרה לתיקון \(\d+\)$/ });
  await expect(send).toHaveAccessibleName("החזרה לתיקון (0)");
  await expect(send).toBeDisabled();

  // A mark needs a reason; a draft mark can be taken back.
  await page.getByRole("button", { name: "בקשת תיקון · הפרטים" }).click();
  await expect(page.getByRole("alert")).toContainText("לבקשת תיקון צריך לכתוב סיבה");
  await reason.fill("שם המשפחה לא תואם");
  await page.getByRole("button", { name: "בקשת תיקון · הפרטים" }).click();
  await expect(page.getByText("לתיקון: שם המשפחה לא תואם")).toBeVisible();
  await expect(reason).toHaveValue("");
  await expect(send).toHaveAccessibleName("החזרה לתיקון (1)");
  await page.getByRole("button", { name: "ביטול · הפרטים" }).click();
  await expect(page.getByText("לתיקון: שם המשפחה לא תואם")).toHaveCount(0);
  await expect(send).toHaveAccessibleName("החזרה לתיקון (0)");

  // The tax file and the photo, each with its reason, then one round.
  await reason.fill("המסמך לא קריא, צריך צילום חד");
  await page.getByRole("button", { name: "בקשת תיקון · תיק עוסק" }).click();
  await expect(page.getByText("לתיקון: המסמך לא קריא, צריך צילום חד")).toBeVisible();
  await reason.fill("התמונה חשוכה");
  await page.getByRole("button", { name: "בקשת תיקון · התמונה" }).click();
  await expect(page.getByText("לתיקון: התמונה חשוכה")).toBeVisible();
  await page.getByRole("button", { name: /^החזרה לתיקון \(2\)$/ }).click();
  // The application has left the queue.
  await expect(page.getByRole("tab", { name: "בקשות הצטרפות" })).toBeVisible();
  await expect(page.getByRole("button", { name: `בקשה של ${name}` })).toHaveCount(0);

  // Professional: sees both reasons, fixes, resends.
  const proCtx = await browser.newContext({ locale: "he-IL", extraHTTPHeaders: asPerson() });
  try {
    const pro = await proCtx.newPage();
    await signInExisting(pro, email, baseURL!);
    await pro.goto("/pro");
    await expect(pro.getByText("צריך לתקן 2 דברים")).toBeVisible();
    await expect(pro.getByText("המסמך לא קריא, צריך צילום חד")).toBeVisible();
    await expect(pro.getByText("התמונה חשוכה")).toBeVisible();
    await expect(pro.getByRole("button", { name: "שליחה מחדש" })).toBeDisabled();

    // The tax file: a new upload in the documents step, then back to their page.
    await fixLink(pro, "תיק עוסק").click();
    await expect(pro).toHaveURL(/\/pro\/join\?at=documents$/);
    await expect(pro.getByText("תיק עוסק", { exact: true })).toBeVisible();
    const saved = pro.waitForResponse((r) => r.url().endsWith("/api/v1/pro/application/documents") && r.request().method() === "POST");
    const chooser = pro.waitForEvent("filechooser");
    // The tax file's row comes before the licences'.
    await pro.getByRole("button", { name: "להחליף" }).first().click();
    await (await chooser).setFiles({ name: "tax.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) });
    expect((await saved).ok()).toBe(true);
    await pro.getByRole("button", { name: /^המשך$|אפשר להמשיך/ }).click();
    await expect(pro).toHaveURL(/\/pro$/);
    await expect(pro.getByText("צריך לתקן דבר אחד")).toBeVisible();
    await expect(pro.getByText("תוקן ✓")).toHaveCount(1);

    // The photo: their own instead of the trade's character, then back.
    await fixLink(pro, "התמונה").click();
    await expect(pro).toHaveURL(/\/pro\/join\?at=portrait$/);
    // Photos are re-encoded in the browser; give it a real image.
    const jpeg = await pro.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"))).arrayBuffer()));
    });
    const photoChooser = pro.waitForEvent("filechooser");
    await pro.getByRole("radio", { name: "סלפי או תמונה" }).click();
    await (await photoChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
    await expect(pro.getByText("התמונה שלכם ✓")).toBeVisible();
    await pro.getByRole("button", { name: "המשך" }).click();
    await expect(pro).toHaveURL(/\/pro$/);
    await expect(pro.getByText("הכול תוקן — אפשר לשלוח שוב")).toBeVisible();
    await expect(pro.getByText("תוקן ✓")).toHaveCount(2);

    // While sending, the button's words change but not its name: wait for the page.
    await pro.getByRole("button", { name: "שליחה מחדש" }).click();
    await expect(pro.getByText("הבקשה בבדיקה")).toBeVisible();
  } finally {
    await proCtx.close();
  }

  // Reviewer: the application is back, with both fixed.
  await page.goto("/admin");
  const row = page.getByRole("button", { name: `בקשה של ${name}` });
  await expect(row).toContainText("חזר אחרי תיקון");
  await row.click();
  await expect(page.getByText("סבב התיקונים האחרון")).toBeVisible();
  await expect(page.getByText("תוקן ✓")).toHaveCount(2);
  await expect(page.getByText("המסמך לא קריא, צריך צילום חד")).toBeVisible();
  await expect(page.getByText("התמונה חשוכה")).toBeVisible();
  await expect(page.getByRole("button", { name: /^החזרה לתיקון \(0\)$/ })).toBeDisabled();

  // Nothing is pending any more: the identity and then the account can be approved
  // (which also takes this application out of the queue for later runs).
  await page.getByRole("button", { name: "הזהות אושרה" }).click();
  await expect(page.getByRole("button", { name: "הזהות אושרה" })).toHaveCount(0);
  await page.getByRole("button", { name: "אישור החשבון" }).click();
  await expect(page.getByText("TAX_FILE · VERIFIED").first()).toBeVisible();
});

/** The "לתקן ›" of one requested fix on the professional's page, found by the item's name. */
function fixLink(pro: Page, itemHe: string): Locator {
  const link = pro.getByRole("link", { name: "לתקן ›" });
  // The innermost block holding both the item's name and a link is that fix's own entry.
  return pro.getByLabel("מה לתקן").locator("div").filter({ hasText: itemHe }).filter({ has: link }).last().getByRole("link", { name: "לתקן ›" });
}
