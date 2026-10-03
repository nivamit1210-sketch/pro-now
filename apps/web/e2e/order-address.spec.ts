import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

/*
 * AUDIT V2 #2 (Dvir, 2026-10-02): "מהרגע שאני מתחיל את התהליך לא כתוב לי
 * בשום מקום בכתובת שאני עושה אליה את ההזמנה, וגם אין לי אפשרות לשנות".
 * As in the demo: the service page and the form say where the order goes
 * ("לאן · address · שינוי"), a dashed "בחירה" while there is none, and
 * sending before any address asks where to send the professional first.
 * The picker opens over the order and returns to it with everything kept.
 */
test("no address yet: the line asks, sending asks where to, and the order goes there", async ({ page }) => {
  test.setTimeout(90_000);
  await signInByEmail(page, uniqueEmail("e2e-order-address"));
  await finishFirstRun(page);

  await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
  await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
  // The service page: no address yet, so the line asks for one.
  await expect(page.getByRole("button", { name: "בחירת כתובת להזמנה" })).toBeVisible();
  await expect(page.getByText("עוד לא נבחרה כתובת")).toBeVisible();
  await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();

  // The form says the same; sending asks where to send the professional first.
  await expect(page.getByRole("button", { name: "בחירת כתובת להזמנה" })).toBeVisible();
  await page.getByRole("button", { name: "שליחת הקריאה" }).click();
  await expect(page.getByText("לאן לשלוח את המקצוען?")).toBeVisible();
  await expect(page).not.toHaveURL(/\/jobs\//);

  await page.getByRole("textbox", { name: "כתובת חדשה" }).fill("הרצל 12 תל");
  await page.getByRole("button", { name: "הרצל 12, תל אביב - יפו", exact: true }).click();
  await page.getByRole("button", { name: "אישור הכתובת" }).click();

  // Back on the form, with the words kept and the address on the line.
  const line = page.getByRole("button", { name: /^ההזמנה לכתובת: הרצל 12, תל אביב - יפו\. שינוי כתובת$/ });
  await expect(line).toBeVisible();
  await expect(page.getByRole("textbox", { name: "מה צריך, במילים שלך" })).toHaveValue(/נזילה במטבח/);

  // "שינוי" opens the picker; back returns to the form as it was.
  await line.click();
  await expect(page.getByText("לאן לשלוח את המקצוען?")).toBeVisible();
  // The order underneath is out of reach while the picker is open: one way back.
  await expect(page.getByRole("button", { name: "חזרה" })).toHaveCount(1);
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(line).toBeVisible();
  await expect(page.getByRole("textbox", { name: "מה צריך, במילים שלך" })).toHaveValue(/נזילה במטבח/);

  // Send: the order goes to the address on the line.
  await page.getByRole("button", { name: "שליחת הקריאה" }).click();
  await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });
  const jobId = new URL(page.url()).pathname.split("/").pop()!;
  const { job } = (await (await page.request.get(`/api/v1/jobs/${jobId}`)).json()) as { job: { addressId: string } };
  const { addresses } = (await (await page.request.get("/api/v1/me/addresses")).json()) as { addresses: Array<{ id: string; formatted: string }> };
  expect(addresses.find((a) => a.id === job.addressId)?.formatted).toBe("הרצל 12, תל אביב - יפו");
  await page.request.post(`/api/v1/jobs/${jobId}/cancel`, { data: {}, headers: { origin: new URL(page.url()).origin } });
});

test("a saved address: the service page says where, and 'שינוי' comes back to it", async ({ page, baseURL }) => {
  await signInByEmail(page, uniqueEmail("e2e-order-address-2"));
  await finishFirstRun(page);
  const saved = await page.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: 32.056, lng: 34.77, label: "בית", details: "קומה 4, דירה 12, כניסה ב׳ ליד הגינה" }, headers: { origin: baseURL! } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const formatted = (await saved.json()).address.formatted as string;
  await page.reload();

  await page.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
  await page.getByRole("button", { name: /המשך עם נזילה/ }).click();
  const line = page.getByRole("button", { name: `ההזמנה לכתובת: ${formatted}. שינוי כתובת` });
  await expect(line).toBeVisible();
  // A long address is cut short on the line; "שינוי" stays on the screen.
  await expect(line.getByText("שינוי", { exact: true })).toBeInViewport({ ratio: 1 });
  await line.click();
  await expect(page.getByText("לאן לשלוח את המקצוען?")).toBeVisible();
  await page.getByRole("button", { name: "חזרה" }).click();
  // The same service page, not home.
  await expect(line).toBeVisible();
  await expect(page.getByRole("button", { name: /^בקשת .* עכשיו$/ })).toBeVisible();
});
