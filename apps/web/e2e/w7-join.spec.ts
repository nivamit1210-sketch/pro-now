import { expect, test } from "@playwright/test";
import { linkFor, uniqueEmail } from "./helpers";
import { adminApi } from "./pro-helpers";

/**
 * W7 (docs/21): a new professional joins from the welcome screen, sends an
 * application the server checks, and an admin approves one service.
 */
test.use({ permissions: ["geolocation"], geolocation: { latitude: 32.08, longitude: 34.78 } });

test("a professional joins, is reviewed, and is approved for one service", async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const email = uniqueEmail("e2e-join");

  await page.goto("/");
  await page.getByRole("button", { name: /אני בעל מקצוע/ }).click();
  await expect(page).toHaveURL(/side=pro/);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByRole("button", { name: "שליחת קישור" }).click();
  await expect(page.getByText("בדקו את המייל")).toBeVisible();
  await page.goto(await linkFor(email));
  await expect(page).toHaveURL(/\/pro\/join$/);

  // 1 · details, and how to be addressed (asked, never guessed).
  await page.getByRole("textbox", { name: "השם שהלקוחות יראו" }).fill("מיכל");
  await page.getByRole("textbox", { name: "שם מלא כפי שבתעודה" }).fill("מיכל לוי");
  await page.getByRole("button", { name: "בלשון נקבה" }).click();
  await page.getByRole("button", { name: "המשך" }).click();

  // 2 · in her own words; the matcher marks what fits.
  await page.getByRole("textbox", { name: "במילים שלכם" }).fill("אינסטלטורית, מטפלת בנזילות");
  await expect(page.getByText("מתאים למה שכתבתם").first()).toBeVisible();
  await page.getByRole("checkbox", { name: "נזילה/פיצוץ בצנרת" }).click();
  await page.getByRole("button", { name: /^המשך · 1 שירותים$/ }).click();

  // 3 · area.
  await page.getByRole("button", { name: "המיקום שלי עכשיו הוא הבית" }).click();
  await expect(page.getByRole("button", { name: "המיקום נשמר · לעדכן" })).toBeVisible();
  await page.getByRole("button", { name: "15 ק״מ" }).click();
  await page.getByRole("button", { name: "המשך" }).click();

  // 4 · documents: real uploads, into private storage.
  const jpeg = { name: "doc.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) };
  const uploadVia = async (rowButton: import("@playwright/test").Locator) => {
    const chooser = page.waitForEvent("filechooser");
    await rowButton.click();
    await (await chooser).setFiles(jpeg);
  };
  await expect(page.getByText("לא נבקש תעודת יושר", { exact: false })).toBeVisible();
  // ID first, then (the selfie row is second) the tax file: the rows keep their order.
  await uploadVia(page.getByRole("button", { name: "העלאה" }).first());
  await expect(page.getByText("✓ הועלה")).toHaveCount(1);
  // The selfie is re-encoded in the browser like any photo; give it a real image.
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"))).arrayBuffer()));
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "העלאה" }).first().click();
  await (await chooser).setFiles({ name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from(png) });
  await expect(page.getByText("✓ הועלה")).toHaveCount(2);
  await uploadVia(page.getByRole("button", { name: "העלאה" }).first());
  await expect(page.getByText("✓ הועלה")).toHaveCount(3);
  // Every licence the service requires, with its number.
  while ((await page.getByRole("button", { name: "העלאה" }).count()) > 0) {
    const numberBox = page.getByRole("textbox", { name: /^מספר · / }).first();
    if (await numberBox.isVisible()) await numberBox.fill("123456");
    await uploadVia(page.getByRole("button", { name: "העלאה" }).first());
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: /^המשך$|אפשר להמשיך/ }).click();

  // 5 · her own price.
  await page.getByRole("textbox", { name: "דמי ביקור ואבחון (₪)" }).fill("190");
  await page.getByRole("button", { name: "שמירה והמשך" }).click();

  // 6 · send; the server said nothing is missing.
  await expect(page.getByText("הכול כאן.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page).toHaveURL(/\/pro$/);
  await expect(page.getByText("הבקשה בבדיקה")).toBeVisible();

  // The admin approves the account, the licence, then the service (W8 gives this a screen).
  const admin = await adminApi(baseURL!);
  try {
    const { applications } = await (await admin.get("/api/v1/admin/pro-applications")).json();
    const mine = applications.find((a: { profile: { displayName: string } }) => a.profile.displayName === "מיכל");
    expect(mine).toBeTruthy();
    const decide = async (url: string, data: object) => {
      const res = await admin.post(url, { data });
      expect(res.ok(), await res.text()).toBe(true);
      return res.json();
    };
    await decide(`/api/v1/admin/professionals/${mine.profile.id}/decision`, { approve: true });
    for (const s of mine.services) {
      for (const r of s.requirements) {
        if (r.credential) await decide(`/api/v1/admin/credentials/${r.credential.id}/decision`, { approve: true, expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString() });
      }
    }
    for (const s of mine.services) await decide(`/api/v1/admin/pro-services/${s.id}/decision`, { approve: true });
  } finally {
    await admin.dispose();
  }
  await page.reload();
  await expect(page.getByText("אושרתם לעבודה")).toBeVisible();
  await expect(page.getByText("מאושר ✓")).toHaveCount(2);
});
