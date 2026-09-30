import type { Page } from "@playwright/test";
import { asPerson, expect, test } from "./fixtures";
import { linkFor, uniqueEmail } from "./helpers";
import { dispatchableProfessional, pendingApplicant } from "./pro-helpers";

/**
 * Demo sync 2026-09-30, item H (docs/sync/SYNC-2026-09-30.md): a
 * professional can sign out, someone registered goes straight to their own
 * page (Amit, 2026-09-30), and the next person on the same device never
 * sees the last one's data.
 */
test.use({ permissions: ["geolocation"], geolocation: { latitude: 32.08, longitude: 34.78 } });

/** "אני בעל מקצוע" from the welcome screen, then the emailed link. Each sign-in is a new address (fixtures.ts). */
async function signInAsPro(page: Page, email: string) {
  await page.setExtraHTTPHeaders(asPerson());
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("button", { name: /אני בעל מקצוע/ }).click();
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByRole("button", { name: "שליחת קישור" }).click();
  await expect(page.getByText("בדקו את המייל")).toBeVisible();
  await page.goto(await linkFor(email));
}

test("a professional signs out and back in; the next person on the device starts fresh", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await pendingApplicant("HOME_PLUMB_LEAK", `נוי${Date.now() % 100000}`);

  await signInAsPro(page, email);
  await expect(page.getByText("הבקשה בבדיקה")).toBeVisible();
  await page.getByRole("button", { name: "יציאה מהחשבון" }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  // Registered: straight back to their own page, no joining again.
  await signInAsPro(page, email);
  await expect(page.getByText("הבקשה בבדיקה")).toBeVisible();
  await page.getByRole("button", { name: "יציאה מהחשבון" }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  // Someone new on the same tab: joining, and nothing of the last person.
  await signInAsPro(page, uniqueEmail("e2e-next"));
  await expect(page).toHaveURL(/\/pro\/join$/);
  await expect(page.getByRole("button", { name: "בואו נתחיל" })).toBeVisible();
  await expect(page.getByText("הבקשה בבדיקה")).toHaveCount(0);
  // Joining has its own way out.
  await page.getByRole("button", { name: "יציאה מהחשבון" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test("an approved professional signs out while offline; online, going offline comes first", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: 32.08, lng: 34.78, baseURL: baseURL!, offline: true });
  try {
    await signInAsPro(page, pro.email);
    const signOut = page.getByRole("button", { name: "יציאה מהחשבון" });
    await expect(signOut).toBeVisible();

    await page.getByRole("button", { name: "התחברות לקבלת עבודות" }).click();
    await expect(page.getByText(/השאירי את האפליקציה פתוחה/)).toBeVisible();
    await expect(signOut).toHaveCount(0);

    await page.getByRole("button", { name: "סיום משמרת" }).click();
    await expect(signOut).toBeVisible();
    await signOut.click();
    await expect(page).toHaveURL(/\/welcome$/);
  } finally {
    await pro.dispose();
  }
});
