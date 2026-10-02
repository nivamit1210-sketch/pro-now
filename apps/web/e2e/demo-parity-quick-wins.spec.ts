import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, signInExisting, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * Small demo-parity fixes on the real server: the inbox's shared back chip,
 * home's door into the street, the active-job capsule's walker and minutes,
 * and the professional's "job settled" screen when the customer confirms.
 */
const LAT = 32.0853;
const LNG = 34.7818;
const home = (page: import("@playwright/test").Page) => page.getByText("מה אתם צריכים עכשיו?");

test("the inbox has the shared back chip, back to where they came from or home", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-inbox-back"));
  await finishFirstRun(page);
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: /^התראות/ }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("עוד אין התראות", { exact: false })).toBeVisible();
  // One back control, drawn (BackButton), not a typed "›".
  await expect(page.getByRole("button", { name: "חזרה" })).toHaveCount(1);
  await expect(page.getByText("›", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(home(page)).toBeVisible();

  // Opened directly (a push, a link): nowhere to go back to, so home.
  await page.goto("/inbox");
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(home(page)).toBeVisible();
});

test("home's stroll card opens the street, choosing a figure first when there is none", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-stroll"));
  await finishFirstRun(page); // skips the figure
  const door = page.getByRole("button", { name: "בחירת דמות וטיול ברחוב של פרו נאו" });
  await expect(door).toBeEnabled();
  await expect(page.getByText("בחרו דמות ותצאו לרחוב")).toBeVisible();
  await door.click();
  await expect(page).toHaveURL(/\/avatar\?then=world$/);
  await page.getByRole("button", { name: "דמות 2" }).click();
  await page.getByRole("button", { name: "אישור הדמות" }).click();
  await expect(page).toHaveURL(/\/world$/);

  // With a figure, the same card goes straight into the street.
  await page.goto("/");
  await expect(page.getByText("לכו בין העסקים עם הדמות שלכם")).toBeVisible();
  await page.getByRole("button", { name: "טיול ברחוב של פרו נאו" }).click();
  await expect(page).toHaveURL(/\/world$/);
});

test("the home capsule: the server's minutes while the professional is on the way", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-capsule"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "הרצל 3" }, headers: { origin: baseURL! } });
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

    // What the server says: its ETA, in minutes, on the capsule.
    const match = await (await page.request.get(`/api/v1/jobs/${jobId}/match`)).json();
    expect(match.eta).not.toBeNull();
    expect(typeof match.etaSecondsAtAssignment).toBe("number");
    await page.goto("/");
    const capsule = page.getByRole("button", { name: /^.* · בדרך אליך, \d+ דקות$/ });
    await expect(capsule).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^\d+ דק׳$/)).toBeVisible();
    await testInfo.attach("home-capsule-en-route", { body: await page.screenshot(), contentType: "image/png" });
    await capsule.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));

    // Arrived: nobody is on the way, so no minutes.
    await pro.step(jobId, "arrive");
    await page.goto("/");
    // In her words: she asked to be addressed in the feminine while joining (audit v2 #3).
    await expect(page.getByRole("button", { name: /^.* · הגיעה$/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^\d+ דק׳$/)).toHaveCount(0);
  } finally {
    await pro.dispose();
  }
});

test("the professional sees the job settled when the customer confirms, then is back on shift", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL!, offline: true });
  const proCtx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    permissions: ["geolocation"],
    geolocation: { latitude: LAT + 0.01, longitude: LNG },
    locale: "he-IL",
    extraHTTPHeaders: asPerson(),
  });
  const custCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: "he-IL", extraHTTPHeaders: asPerson() });
  try {
    const p = await proCtx.newPage();
    await signInExisting(p, pro.email, baseURL!);
    await expect(p).toHaveURL(/\/pro$/);
    await p.getByRole("button", { name: "התחלת משמרת" }).click();
    await expect(p.getByRole("button", { name: "סיום משמרת" })).toBeVisible();

    const c = await custCtx.newPage();
    await signInByEmail(c, uniqueEmail("e2e-settled-customer"));
    await finishFirstRun(c);
    await c.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "הרצל 3" }, headers: { origin: baseURL! } });
    await c.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
    await c.getByRole("button", { name: /המשך עם נזילה/ }).click();
    await c.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    await c.getByRole("button", { name: "שליחת הקריאה" }).click();
    await expect(c).toHaveURL(/\/jobs\//);
    const jobId = new URL(c.url()).pathname.split("/").pop()!;

    // Her steps go through the API; her screen is the job's.
    await pro.acceptOfferFor(jobId);
    for (const step of ["en-route", "arrive", "start"] as const) await pro.step(jobId, step);
    await pro.quote(jobId, 32000);
    await pro.step(jobId, "complete");
    await p.goto(`/pro/jobs/${jobId}`);
    await expect(p.getByText("סיימת — מחכים לאישור הלקוח")).toBeVisible();

    // The customer confirms; her screen closes the job with what it came to.
    await c.getByRole("button", { name: "אישור שהעבודה הושלמה" }).click({ timeout: 15_000 });
    await expect(p.getByText("סכום העבודה")).toBeVisible({ timeout: 25_000 });
    await expect(p.getByText(/320/).first()).toBeVisible();
    await expect(p.getByText("סך המשמרת")).toBeVisible();
    await expect(p.getByText("עבודה אחת")).toBeVisible();
    await expect(p.getByText("שוב במשמרת — מחפשים לך את העבודה הבאה")).toBeVisible();
    // D1: nothing on it says the customer was charged.
    await expect(p.getByText(/חויב|מאושר בכרטיס/)).toHaveCount(0);
    await testInfo.attach("pro-job-settled", { body: await p.screenshot(), contentType: "image/png" });

    // It dismisses itself, back to the shift.
    await expect(p).toHaveURL(/\/pro$/, { timeout: 10_000 });
    await expect(p.getByRole("button", { name: "סיום משמרת" })).toBeVisible();
    await p.getByRole("button", { name: "סיום משמרת" }).click();
    await expect(p.getByRole("button", { name: "התחלת משמרת" })).toBeVisible();

    // An old job, opened again, is not settled a second time.
    await p.goto(`/pro/jobs/${jobId}`);
    await expect(p.getByText("העבודה הסתיימה")).toBeVisible();
    await expect(p.getByText("סכום העבודה")).toHaveCount(0);
  } finally {
    await proCtx.close();
    await custCtx.close();
    await pro.dispose();
  }
});

test("a trade's page stands in front of its own shop, over the evening city even at noon", async ({ page }) => {
  await signInByEmail(page, uniqueEmail("e2e-trade-backdrop"));
  await finishFirstRun(page);
  await page.clock.setFixedTime(new Date("2026-10-02T12:00:00"));
  await page.goto("/");

  await page.getByRole("button", { name: "ניקיון", exact: true }).click();
  await expect(page.getByText("מה צריך?")).toBeVisible();
  // The demo's evening city in both modes; the foggy daytime render is gone from here.
  await expect(page.locator('img[src="/world/splash_city.webp"]')).toHaveCount(1);
  await expect(page.locator('img[src*="splash_city_day"]')).toHaveCount(0);
  await expect(page.locator('img[src="/world/m/shop_care.webp"]')).toBeVisible();

  // Home repairs: the workshop drawn open, with its professional in the door.
  await page.getByRole("button", { name: "חזרה", exact: true }).click();
  await page.getByRole("button", { name: "תיקונים בבית", exact: true }).click();
  await expect(page.locator('img[src="/world/venue_home.webp"]')).toBeVisible();
});
