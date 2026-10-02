import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * The arrival screen (the demo's ArrivalVerifyBody, docs/21 W6): when the
 * professional says "הגעתי", the customer's job opens on who to expect and
 * the server's code to ask for at the door. Going back shows the live job;
 * once the diagnosis starts the visit moves on without it.
 */
const LAT = 32.06;
const LNG = 34.775;

test("at the door: the professional, the server's code, and back to the live job", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-arrival"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "שינקין 12" }, headers: { origin: baseURL! } });
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
    await page.getByRole("button", { name: /^שליחת .* אליי$/ }).click({ timeout: 15_000 });

    // On the way: the live job, no arrival screen yet.
    await pro.step(jobId, "en-route");
    await expect(page.getByText(/בדרך אליכם/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("קוד האימות שלכם")).toHaveCount(0);

    // The code is the server's, issued at assignment for an ordinary job too.
    const mine = await page.request.get(`/api/v1/jobs/${jobId}`);
    const code = ((await mine.json()) as { doorCode: string | null }).doorCode;
    expect(code).toMatch(/^\d{4}$/);

    // "הגעתי": the arrival screen, by itself over the socket.
    await pro.step(jobId, "arrive");
    await expect(page.getByText("קוד האימות שלכם")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(`קוד האימות ${code!.split("").join(" ")}`)).toBeVisible();
    await expect(page.getByText(/^.+ הגיע$/)).toBeVisible();
    // Only the count PRO NOW really has: this professional's first job.
    // The name the customer picked, not the dispatch catalogue's "נזילה/פיצוץ בצנרת" (audit v2 #1).
    await expect(page.getByText("נזילה או דליפת מים · עבודה ראשונה דרך PRO NOW")).toBeVisible();
    await expect(page.getByText("אל תכניסו אדם שאינו תואם לשם, לתמונה ולקוד שמופיעים כאן.")).toBeVisible();
    // No calling or messaging without a masking vendor, no vehicle the server never recorded.
    await expect(page.getByRole("button", { name: "שיחה" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "הודעה" })).toHaveCount(0);
    await expect(page.getByText("מגיע ב")).toHaveCount(0);
    await testInfo.attach("arrival", { body: await page.screenshot(), contentType: "image/png" });

    // Back: the live job, still at the door.
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page.getByText("קוד האימות שלכם")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));

    // The diagnosis starts: the visit moves on.
    await pro.step(jobId, "start");
    await expect(page.getByText(/על הביקור והאבחון/).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await pro.dispose();
  }
});

test("the arrival screen gives way by itself when the diagnosis starts", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-arrival-2"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "שינקין 14" }, headers: { origin: baseURL! } });
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
    await page.getByRole("button", { name: /^שליחת .* אליי$/ }).click({ timeout: 15_000 });
    for (const step of ["en-route", "arrive"] as const) await pro.step(jobId, step);
    await expect(page.getByText("קוד האימות שלכם")).toBeVisible({ timeout: 15_000 });
    await pro.step(jobId, "start");
    await expect(page.getByText("קוד האימות שלכם")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/על הביקור והאבחון/).first()).toBeVisible();
  } finally {
    await pro.dispose();
  }
});
