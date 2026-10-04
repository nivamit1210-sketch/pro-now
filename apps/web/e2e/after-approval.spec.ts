import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInExisting } from "./helpers";
import { approvedProWithExpiringCredential } from "./pro-helpers";

/**
 * Life after approval (docs/10): a licence close to its date is renewed by
 * the professional, reviewed by staff, and drops off the expiring list; once
 * identity is verified the legal name is not theirs to change.
 */
test("a professional renews a licence that expires in 5 days; the admin verifies it", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const { email, displayName } = await approvedProWithExpiringCredential(5);
  const proCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL", extraHTTPHeaders: asPerson() });
  const adminCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL", extraHTTPHeaders: asPerson() });
  try {
    // The professional sees the warning and takes the renewal path.
    const p = await proCtx.newPage();
    await signInExisting(p, email, baseURL!);
    await p.getByRole("tab", { name: "המסמכים שלי" }).click();
    await expect(p).toHaveURL(/\/pro\/documents$/);
    const expiring = p.getByRole("button", { name: /יפוג בעוד 5 ימים — אפשר להעלות חידוש/ });
    await expect(expiring).toBeVisible();
    await expect(p.getByText(/בתוקף עד \d{2}\/\d{2}\/\d{4}/).first()).toBeVisible();
    await expiring.click();
    // The button reads "העלאת חידוש"; its accessible name says which document.
    const renew = p.getByRole("button", { name: /^הגשת מסמך עבור/ });
    await expect(renew).toHaveText("העלאת חידוש");
    await renew.click();
    await expect(p).toHaveURL(/\/pro\/join\?at=documents$/);

    const chooser = p.waitForEvent("filechooser");
    await p.getByRole("button", { name: "העלאת חידוש" }).click();
    await (await chooser).setFiles({ name: "renewal.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) });
    await expect(p.getByText("החידוש התקבל ונמצא בבדיקה")).toBeVisible({ timeout: 20_000 });

    await p.goto("/pro/documents");
    await expect(p.getByText(/החידוש התקבל ונמצא בבדיקה/)).toBeVisible();

    // The admin finds it under the renewals, and verifies the new document with a date a year ahead.
    const a = await adminCtx.newPage();
    await signInExisting(a, "e2e-admin@pronow.test", baseURL!);
    const intro = a.getByRole("button", { name: "דילוג על ההסבר" });
    await expect(intro.or(a.getByRole("button", { name: "תפריט" }))).toBeVisible();
    if (await intro.isVisible()) await finishFirstRun(a);
    await a.getByRole("button", { name: "תפריט" }).click();
    await a.getByRole("button", { name: /^ניהול/ }).click();
    await expect(a).toHaveURL(/\/admin$/);

    await expect(a.getByText(/^חידושים לבדיקה \(\d+\)$/)).toBeVisible();
    const row = a.getByRole("button", { name: new RegExp(`^${displayName} · .*מחליף מסמך שתוקפו עד \\d{2}/\\d{2}/\\d{4}`) });
    await expect(row).toBeVisible();
    await row.click();

    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
    await a.getByRole("textbox", { name: /בתוקף עד/ }).fill(nextYear);
    await a.getByRole("button", { name: /^אימות · .*PENDING · בתוקף עד \d{2}\/\d{2}\/\d{4}$/ }).click();
    const [y, m, d] = nextYear.split("-");
    await expect(a.getByText(new RegExp(`VERIFIED · בתוקף עד ${d}/${m}/${y}`)).first()).toBeVisible();

    // Nothing for this professional is about to expire any more.
    await a.getByRole("button", { name: "› חזרה לרשימה" }).click();
    await a.getByRole("tab", { name: "תוקף" }).click();
    await expect(a.getByText(/^פג בקרוב \(\d+\)$/)).toBeVisible();
    await expect(a.getByText(displayName)).toHaveCount(0);
  } finally {
    await proCtx.close();
    await adminCtx.close();
  }
});

test("after identity is verified the details step shows the legal name as text", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { email, displayName } = await approvedProWithExpiringCredential(100);
  await signInExisting(page, email, baseURL!);
  await expect(page.getByRole("tab", { name: "המסמכים שלי" })).toBeVisible();
  await page.goto("/pro/join?at=details");
  await expect(page.getByText(`${displayName} כהן`)).toBeVisible();
  await expect(page.getByText("לשינוי שם או תאריך לידה — פנו ל־PRO NOW")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "שם מלא כפי שבתעודה" })).toHaveCount(0);
});

test("staff correct a verified legal name with a reason, and it shows under recent changes", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { displayName } = await approvedProWithExpiringCredential(7);
  await signInExisting(page, "e2e-admin@pronow.test", baseURL!);
  const intro = page.getByRole("button", { name: "דילוג על ההסבר" });
  await expect(intro.or(page.getByRole("button", { name: "תפריט" }))).toBeVisible();
  if (await intro.isVisible()) await finishFirstRun(page);
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^ניהול/ }).click();
  await page.getByRole("tab", { name: "תוקף" }).click();
  await page.getByRole("button", { name: new RegExp(`${displayName} · `) }).click();

  await page.getByRole("button", { name: "תיקון שם או תאריך לידה" }).click();
  await page.getByRole("textbox", { name: "שם מלא כפי שבתעודה" }).fill(`${displayName} לוי`);
  await page.getByRole("button", { name: "שמירת התיקון" }).click();
  await expect(page.getByRole("alert")).toContainText("לתיקון צריך לכתוב סיבה");
  await page.getByRole("textbox", { name: /^סיבה/ }).fill("טעות הקלדה בשם");
  // A date that is not one is refused in place, and nothing is sent.
  await page.getByRole("textbox", { name: /^תאריך לידה/ }).fill("31/02/1990");
  await page.getByRole("button", { name: "שמירת התיקון" }).click();
  await expect(page.getByText("תאריך לא תקין — DD/MM/YYYY")).toBeVisible();
  await page.getByRole("textbox", { name: /^תאריך לידה/ }).fill("14/05/1990");
  await page.getByRole("button", { name: "שמירת התיקון" }).click();
  await expect(page.getByText("שם/תאריך לידה תוקנו על ידי צוות")).toBeVisible();
  await expect(page.getByText(`${displayName} · ${displayName} לוי`)).toBeVisible();
  // The reason was for that correction only.
  await expect(page.getByRole("textbox", { name: /^סיבה/ })).toHaveValue("");
});
