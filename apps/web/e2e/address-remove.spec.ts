import { expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

/*
 * The picker's × (audit v2 #4; Dvir, 2026-10-02: "אין אפשרות להסיר כתובת").
 * Removing the address chosen for the next order takes the choice, and the
 * person at its door, with it: home then offers the newest address still
 * listed. Removing the last one leaves nothing saved.
 */
const target = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("pn.orderTarget") ?? "{}") as { addressId?: string | null; onSite?: unknown });

test("× takes an address off my list, and the order falls back to the newest left", async ({ page, baseURL }) => {
  await signInByEmail(page, uniqueEmail("e2e-address-remove"));
  await finishFirstRun(page);
  const headers = { origin: baseURL! };
  const street = async (q: string) =>
    ((await (await page.request.get(`/api/v1/geo/streets?q=${encodeURIComponent(q)}`)).json()).suggestions as Array<{ localityCode: number; streetCode: number }>)[0]!;
  const herzl = await street("הרצל תל");
  const saveStreet = async (houseNumber: string, label: string) => {
    const res = await page.request.post("/api/v1/me/addresses", {
      data: { kind: "street", localityCode: herzl.localityCode, streetCode: herzl.streetCode, houseNumber, label },
      headers,
    });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()).address.id as string;
  };
  await saveStreet("12", "בית");
  const workId = await saveStreet("999", "עבודה");

  // The work address, for someone else, is the next order's.
  await page.reload();
  await page.getByRole("button", { name: "שינוי כתובת" }).click();
  await page.getByRole("radio", { name: /עבודה/ }).click();
  await page.getByRole("switch", { name: "הקריאה היא בשביל מישהו אחר" }).click();
  await page.getByRole("textbox", { name: "שם מי שנמצא בבית" }).fill("דנה");
  await page.getByRole("textbox", { name: "טלפון של מי שנמצא בבית" }).fill("050-1234567");
  await page.getByRole("button", { name: "אישור הכתובת" }).click();
  await expect(page.getByText("עבודה · עבור דנה")).toBeVisible();
  expect((await target(page)).addressId).toBe(workId);

  // ×: off the list on the screen and on the server; the choice and its person go with it.
  await page.getByRole("button", { name: "שינוי כתובת" }).click();
  const savedRows = page.getByRole("radio", { name: /הרצל/ });
  await expect(savedRows).toHaveCount(2);
  await page.getByRole("button", { name: "הסרת הכתובת עבודה" }).click();
  await expect(page.getByRole("radio", { name: /עבודה/ })).toHaveCount(0);
  await expect(savedRows).toHaveCount(1);
  await expect(page.getByRole("radio", { name: /בית/ })).toBeVisible();
  expect(await target(page)).toEqual({ addressId: null, onSite: null });
  const listed = (await (await page.request.get("/api/v1/me/addresses")).json()).addresses as Array<{ id: string; label: string }>;
  expect(listed.map((a) => a.label)).toEqual(["בית"]);

  // Home now offers the newest one left, for nobody else.
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page.getByText("בית", { exact: true })).toBeVisible();
  await expect(page.getByText(/עבור דנה/)).toHaveCount(0);

  // And the last one: nothing saved, nothing to remove.
  await page.getByRole("button", { name: "שינוי כתובת" }).click();
  await page.getByRole("button", { name: "הסרת הכתובת בית" }).click();
  await expect(page.getByText("הכתובות שלי")).toHaveCount(0);
  await expect(savedRows).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^הסרת הכתובת/ })).toHaveCount(0);
  expect((await (await page.request.get("/api/v1/me/addresses")).json()).addresses).toEqual([]);
});
