import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * W6 acceptance (docs/21): a customer's job from sign-in to review, on the
 * real server and the real dispatch engine. The customer is in the
 * browser; the professional acts through the API until their screens
 * exist (W7).
 */
const LAT = 32.0853;
const LNG = 34.7818;

test("from a typed sentence to a review, with no money in the app", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });

  await signInByEmail(page, uniqueEmail("e2e-w6"));
  await finishFirstRun(page);
  const address = await page.request.post("/api/v1/me/addresses", {
    data: { kind: "location", lat: LAT, lng: LNG, details: "הרצל 1" },
    headers: { origin: baseURL! },
  });
  expect(address.ok(), await address.text()).toBe(true);
  const pro = await dispatchableProfessional({ serviceCode: "HOME_PLUMB_LEAK", lat: LAT, lng: LNG, baseURL: baseURL! });
  try {

  // The customer describes the problem and sends the request.
  await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
  await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
  // The service page first, as in the demo; then the form.
  await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
  await expect(page.getByRole("textbox", { name: "מה צריך, במילים שלך" })).toHaveValue("נזילה במטבח");
  await page.getByRole("button", { name: "שליחת הקריאה" }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  // Real supply only: the screen says it is looking, and invents nobody.
  await expect(page.getByText("מחפשים מי זמין עכשיו")).toBeVisible();
  await shot("searching");

  const jobId = new URL(page.url()).pathname.split("/").pop()!;
  await pro.acceptOfferFor(jobId);

  // The socket announces the acceptance; who is coming appears, with their own price.
  await expect(page.getByText("נמצאה התאמה לבקשה שלך")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("באפליקציה לא עובר כסף")).toBeVisible();
  await shot("match");
  await page.getByRole("button", { name: /^שליחת .* אליי$/ }).click();

  // An ordinary visit ends at the diagnosis (docs/18, 2026-09-29): the visit
  // fee is all the app carries; the repair is settled at the door.
  for (const step of ["en-route", "arrive", "start"] as const) await pro.step(jobId, step);
  await expect(page.getByText("‏180 ‏₪ על הביקור והאבחון · את התיקון עצמו סוגרים ישירות מול המקצוען")).toBeVisible({ timeout: 15_000 });
  await shot("diagnosis");

  await pro.step(jobId, "complete");
  const confirm = page.getByRole("button", { name: "אישור שהעבודה הושלמה" });
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("‏180 ‏₪ · לתשלום ישירות למקצוען")).toBeVisible();
  await expect(page.getByText("באפליקציה לא עובר כסף — את הסכום משלמים ישירות לבעל המקצוע.")).toBeVisible();
  await expect(page.getByText(/אישור תשלום|משחרר את התשלום|אישרתם/)).toHaveCount(0);
  await shot("completion-pending");
  await confirm.click();

  // The review opens with a receipt of what is owed directly; nothing claims a charge or an invoice.
  await expect(page.getByText("איך היה?")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ישירות לבעל המקצוע")).toBeVisible();
  await expect(page.getByRole("button", { name: "חשבונית" })).toHaveCount(0);
  await shot("review");
  await page.getByRole("button", { name: "5 כוכבים" }).click();
  await page.getByRole("textbox", { name: "טקסט הביקורת" }).fill("הגיעה מהר ופתרה הכול");
  await page.getByRole("button", { name: "שליחת דירוג" }).click();

  await expect(page.getByText("הקריאה נסגרה")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("לא השארתם דירוג")).toHaveCount(0);
  await shot("closed");
  await page.getByRole("button", { name: "סיום, חזרה למסך הבית" }).click();
  await expect(page).toHaveURL(/\/$/);
  } finally {
    await pro.dispose();
  }
});

test("the customer can cancel while nobody has been found yet", async ({ page, baseURL }) => {
  page.on("dialog", (d) => void d.accept());
  await signInByEmail(page, uniqueEmail("e2e-w6-cancel"));
  await finishFirstRun(page);
  await page.request.post("/api/v1/me/addresses", {
    data: { kind: "location", lat: LAT, lng: LNG, details: "הרצל 2" },
    headers: { origin: baseURL! },
  });
  await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("המזגן לא מקרר");
  await page.getByRole("button", { name: /המשך עם מזגן/ }).click();
  // The service page first, as in the demo; then the form.
  await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
  await page.getByRole("button", { name: "שליחת הקריאה" }).click();
  await expect(page.getByText("מחפשים מי זמין עכשיו")).toBeVisible();
  await page.getByRole("button", { name: "ביטול הקריאה" }).click();
  await expect(page.getByText("הקריאה בוטלה")).toBeVisible();
  await expect(page.getByText("לא נגבה דבר.")).toBeVisible();
});
