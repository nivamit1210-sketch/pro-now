import { expect, test } from "./fixtures";
import { finishFirstRun, linkFor, signInByEmail, uniqueEmail } from "./helpers";

/**
 * W2 acceptance (docs/21): a person signs in, lands on home, reloads and
 * stays signed in — by email link and by Google — and signs out.
 */

const home = (page: import("@playwright/test").Page) => page.getByText("מה אתם צריכים עכשיו?");

test("a visitor who is not signed in starts at the welcome screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText("שבא עכשיו.")).toBeVisible();
  // The professional's side opened in W7: it leads to their sign-in.
  await page.getByRole("button", { name: /אני בעל מקצוע/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?side=pro$/);
});

test("sign in by email link, first run, reload, sign out", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-email"));
  await finishFirstRun(page);
  await expect(home(page)).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(home(page)).toBeVisible();

  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^יציאה/ }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  const session = await (await page.request.get("/api/auth/get-session")).json();
  expect(session).toBeNull();
});

test("a returning person goes straight home", async ({ page, context }) => {
  const email = uniqueEmail("e2e-return");
  await signInByEmail(page, email);
  await finishFirstRun(page);
  await context.clearCookies();
  await signInByEmail(page, email);
  await expect(page).toHaveURL(/\/$/);
  await expect(home(page)).toBeVisible();
});

test("the quick tryout starts with the intro every time", async ({ page, context }) => {
  // One shared test account: a second tryout must not skip what the first one saw.
  for (let round = 0; round < 2; round++) {
    await page.goto("/sign-in");
    await page.getByText("כניסה מהירה לניסיון").click();
    await expect(page).toHaveURL(/\/intro$/);
    await expect(page.getByText("עיר שלמה של בעלי מקצוע")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByText("הבא", { exact: true }).click();
    await page.getByText("בואו נתחיל").click();
    await expect(page).toHaveURL(/\/(avatar)?$/);
    if (page.url().endsWith("/avatar")) await page.getByText("דלג כרגע").click();
    await expect(home(page)).toBeVisible();
    await context.clearCookies();
  }
});

test("sign in with Google (the local mock issuer)", async ({ page }) => {
  const email = uniqueEmail("e2e-google");
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "המשך עם Google" }).click();
  // The mock issuer's own login page: who to be, and what Google would say.
  await page.locator('input[name="username"]').fill(email);
  await page.locator('[name="claims"]').fill(JSON.stringify({ email, email_verified: true, name: "Dana Levi" }));
  await page.getByRole("button", { name: "Sign-in" }).click();
  await expect(page).toHaveURL(/\/intro$/);
});

test("a sign-in link works once; the second time it says so", async ({ page }) => {
  const email = uniqueEmail("e2e-reuse");
  await signInByEmail(page, email);
  await expect(page).toHaveURL(/\/intro$/);
  await page.context().clearCookies();
  await page.goto(await linkFor(email));
  await expect(page).toHaveURL(/\/sign-in\?expired=1(&error=INVALID_TOKEN)?$/);
  await expect(page.getByText("הקישור כבר לא בתוקף")).toBeVisible();
});

test("the app is installable: manifest and an active service worker", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "service worker inspection runs in Chromium");
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "PRO NOW", display: "standalone", lang: "he" });
  await expect
    .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)))
    .toBe(true);
});

test("back from 'check your email' returns to the email field, as in the demo", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByPlaceholder("name@example.com").fill(uniqueEmail("e2e-back"));
  await page.getByRole("button", { name: "שליחת קישור" }).click();
  await expect(page.getByText("בדקו את המייל")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
});

test("the account image opens character selection", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-avatar-circle"));
  await finishFirstRun(page);
  const account = page.getByRole("button", { name: "החשבון שלי" });
  await expect(account).toBeEnabled();
  await account.click();
  await expect(page).toHaveURL(/\/avatar$/);
  await expect(page.getByText("מי מטייל ברחוב?")).toBeVisible();
});

test("a double tap on 'send link' sends one email", async ({ page }) => {
  const email = uniqueEmail("e2e-double");
  await page.goto("/sign-in");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByRole("button", { name: "שליחת קישור" }).evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(page.getByText("בדקו את המייל")).toBeVisible();
  await linkFor(email);
  await page.waitForTimeout(1000);
  const found = (await (
    await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  ).json()) as { messages: unknown[] };
  expect(found.messages).toHaveLength(1);
});

test("home's hero is the evening city at noon too, like the demo", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-hero"));
  await finishFirstRun(page);
  // Noon on the phone's clock (set after the intro, whose steps run on it), then home again.
  await page.clock.setFixedTime(new Date("2026-10-02T12:00:00"));
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(page.locator('img[src="/world/splash_city.webp"]').first()).toBeAttached();
  await expect(page.locator('img[src="/world/splash_city_day.webp"]')).toHaveCount(0);
});
