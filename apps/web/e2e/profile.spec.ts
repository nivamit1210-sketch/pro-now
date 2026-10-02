import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

/**
 * החשבון שלי (the demo's card tab), opened from the menu: it says what the
 * server knows, and the payment row — no vendor yet (D1) — is shown without
 * a way to a card nobody can add.
 */
test("the profile, from the menu", async ({ page, baseURL }) => {
  const email = uniqueEmail("e2e-profile");
  await signInByEmail(page, email);
  await finishFirstRun(page);
  const saved = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: 32.0853, lng: 34.7818, details: "דיזנגוף 50" }, headers: { origin: baseURL! } });
  expect(saved.ok(), await saved.text()).toBe(true);

  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^החשבון שלי/ }).filter({ hasText: "פרטים" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("עוד לא שלחתם קריאה")).toBeVisible();
  // The address the next request goes to, not "לא נשמרה כתובת".
  await expect(page.getByText("לא נשמרה כתובת")).toHaveCount(0);
  await expect(page.getByText("לא נשמר אמצעי תשלום")).toBeVisible();
  await expect(page.getByRole("button", { name: /אמצעי תשלום/ })).toHaveCount(0);

  // The address row goes where addresses are kept; back returns to the menu.
  await page.getByRole("button", { name: /הכתובות שלי/ }).click();
  await expect(page).toHaveURL(/\/addresses$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/$/);
});
