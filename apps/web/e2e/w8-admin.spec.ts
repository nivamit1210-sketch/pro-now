import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, signInExisting, uniqueEmail } from "./helpers";
import { pendingApplicant } from "./pro-helpers";

/**
 * W8 (docs/21): the admin reviews an application and approves it, one
 * decision at a time; switches need reasons; a non-admin never gets in.
 */
test("the admin approves an application, account, licence and service", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const name = `רון${Date.now() % 100000}`;
  await pendingApplicant("HOME_PLUMB_LEAK", name);

  await signInExisting(page, "e2e-admin@pronow.test", baseURL!);
  // A first sign-in goes through the intro; a returning one lands home.
  // Wait for what is drawn, not the URL: "/" is passed through on the way.
  const intro = page.getByRole("button", { name: "דילוג על ההסבר" });
  await expect(intro.or(page.getByRole("button", { name: "תפריט" }))).toBeVisible();
  if (await intro.isVisible()) await finishFirstRun(page);
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^ניהול/ }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: `בקשה של ${name}` }).click();
  await expect(page.getByText("TAX_FILE · PENDING")).toBeVisible();
  await expect(page.getByText("ספק בדיקה: סביבת ניסיון — אין בדיקה אוטומטית")).toBeVisible();
  await expect(page.getByLabel("תעודת זהות")).toBeVisible();
  await expect(page.getByText("פתיחת המסמך ›").first()).toBeVisible();
  // A retake is asked for with the round of fixes now (docs/10 §Review loop), not on its own.
  await expect(page.getByRole("button", { name: "צילום מחדש" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "בקשת תיקון · בדיקת הזהות" })).toBeVisible();

  // A refusal without a reason is refused.
  await page.getByRole("button", { name: "סירוב", exact: true }).first().click();
  await expect(page.getByRole("alert")).toContainText("סיבה");

  // Service first: the server refuses until the account is approved.
  await page.getByRole("button", { name: "אישור השירות" }).click();
  await expect(page.getByRole("alert")).toContainText("ACCOUNT_NOT_APPROVED");

  // The account waits for the identity, decided by a person; the photos go once it is.
  await page.getByRole("button", { name: "אישור החשבון" }).click();
  await expect(page.getByRole("alert")).toContainText("קודם צריך לאשר את הזהות.");
  await page.getByRole("button", { name: "הזהות אושרה" }).click();
  await expect(page.getByText("נמחקה אחרי ההחלטה")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "הזהות אושרה" })).toHaveCount(0);

  await page.getByRole("button", { name: "אישור החשבון" }).click();
  await expect(page.getByText("TAX_FILE · VERIFIED")).toBeVisible();
  await page.getByRole("textbox", { name: /בתוקף עד/ }).fill("2027-12-31");
  for (const b of await page.getByRole("button", { name: "אימות" }).all()) await b.click();
  await expect(page.getByText("עד 2027-12-31").first()).toBeVisible();
  await page.getByRole("button", { name: "אישור השירות" }).click();
  await expect(page.getByText(/· APPROVED/)).toBeVisible();

  // The market: a switch needs a reason.
  await page.getByRole("button", { name: "› חזרה לרשימה" }).click();
  await page.getByRole("tab", { name: "שוק" }).click();
  await expect(page.getByText("כתבו סיבה כדי לשנות מתג.")).toBeVisible();

  // The users and the inspector render.
  await page.getByRole("tab", { name: "משתמשים" }).click();
  await expect(page.getByText("הרשאת ניהול ניתנת רק דרך רשימת ADMIN_EMAILS")).toBeVisible();
  await page.getByRole("tab", { name: "שימוש" }).click();
  await expect(page.getByText("מסד נתונים")).toBeVisible();
});

test("someone who is not an admin never sees it", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-not-admin"));
  await finishFirstRun(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "תפריט" }).click();
  await expect(page.getByRole("button", { name: /^ניהול/ })).toHaveCount(0);
});
