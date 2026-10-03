import { expect, test } from "./fixtures";
import { linkFor, uniqueEmail } from "./helpers";
import { adminApi } from "./pro-helpers";

/**
 * W7 (docs/21): a new professional joins from the welcome screen, sends an
 * application the server checks, and an admin approves one service.
 */
test.use({ permissions: ["geolocation", "camera"], geolocation: { latitude: 32.08, longitude: 34.78 } });

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

  // The four explanation slides first, as in the demo; each picture shows
  // what its slide says (docs/DEMO-SYNC.md, 2026-10-01 P1).
  await expect(page.getByText("הרחוב הזה הוא גם שלך")).toBeVisible();
  await page.getByRole("button", { name: /^הבא/ }).click();
  await page.getByRole("button", { name: /^הבא/ }).click();
  await expect(page.getByText("רואים את העבודה לפני שמקבלים")).toBeVisible();
  await expect(page.getByText("קריאה חדשה")).toBeVisible();
  await page.getByRole("button", { name: /^הבא/ }).click();
  await expect(page.getByText("המחירון שלי")).toBeVisible();
  await page.getByRole("button", { name: "בואו נתחיל" }).click();

  // 0 · the welcome, promising only what exists.
  await expect(page.getByText("ברחוב של כולם", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "בואו נתחיל" }).click();

  // 1 · details, and how to be addressed (asked, never guessed).
  await page.getByRole("textbox", { name: "השם שהלקוחות יראו" }).fill("מיכל");
  await page.getByRole("textbox", { name: "שם מלא כפי שבתעודה" }).fill("מיכל לוי");
  await page.getByRole("button", { name: "בלשון נקבה" }).click();
  // How she is registered for tax is required; a business name is not.
  await expect(page.getByRole("button", { name: "המשך" })).toBeDisabled();
  await page.getByRole("button", { name: "עוסק פטור" }).click();
  await page.getByRole("textbox", { name: "תאריך לידה" }).fill("14/05/1990");
  // Her car, optional (audit v2 #8a): a full plate keeps "המשך" closed; the last digits are all that is kept.
  await page.getByRole("textbox", { name: "הרכב שלכם" }).fill("קיה פיקנטו אדומה");
  const plateTail = page.getByRole("textbox", { name: "הספרות האחרונות של מספר הרכב" });
  await plateTail.fill("12-345-67");
  await expect(page.getByText("רק 2 או 3 הספרות האחרונות של מספר הרכב, לא המספר המלא.")).toBeVisible();
  await expect(page.getByRole("button", { name: "המשך" })).toBeDisabled();
  await plateTail.fill("67");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page.getByRole("textbox", { name: "במילים שלכם" })).toBeVisible();
  const joined = (await (await page.request.get("/api/v1/pro/application")).json()) as { profile: { vehicle: unknown } };
  expect(joined.profile.vehicle).toEqual({ vehicleHe: "קיה פיקנטו אדומה", plateTail: "67" });

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

  // 4 · documents: the identity check and real uploads, into private storage.
  const jpeg = { name: "doc.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) };
  const uploadVia = async (rowButton: import("@playwright/test").Locator) => {
    const chooser = page.waitForEvent("filechooser");
    await rowButton.click();
    await (await chooser).setFiles(jpeg);
  };
  await expect(page.getByText("לא נבקש תעודת יושר", { exact: false })).toBeVisible();
  // Photos are re-encoded in the browser; give them a real image.
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"))).arrayBuffer()));
  });
  // The identity check (docs/10): the ID card, then the face straight, right and left.
  const idChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "צילום תעודת הזהות" }).click();
  await (await idChooser).setFiles({ name: "id.jpg", mimeType: "image/jpeg", buffer: Buffer.from(png) });
  await page.getByRole("button", { name: "נראה טוב" }).click();
  // Chromium's fake camera shows no face, so nothing is taken by itself: the shutter, three times.
  for (const tick of ["ישר ✓", "ימינה ✓", "שמאלה ✓"]) {
    await page.getByRole("button", { name: "צילום", exact: true }).click();
    await expect(page.getByText(tick)).toBeVisible();
  }
  await expect(page.getByText("הזהות נשלחה לבדיקה")).toBeVisible();
  // The tax file, then the licences.
  await uploadVia(page.getByRole("button", { name: "העלאה" }).first());
  await expect(page.getByText("✓ הועלה")).toHaveCount(1);
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

  // 6 · her shop: the sign reads her name until she types her own, and a swatch sets the colour.
  await expect(page.getByRole("textbox", { name: "השם על השלט" })).toHaveValue("מיכל");
  await page.getByRole("textbox", { name: "השם על השלט" }).fill("מיכל צנרת");
  await page.getByRole("radio", { name: "צבע סגול" }).click();
  await expect(page.getByLabel("השלט: מיכל צנרת")).toBeVisible();
  await expect(page.getByRole("button", { name: "דלג — אעצב את החנות אחר כך" })).toBeVisible();
  await page.getByRole("button", { name: "המשך" }).click();

  // 7 · her photo, required (Amit, 2026-09-30): nothing moves on until one is chosen.
  await expect(page.getByRole("button", { name: "בחרו תמונה או דמות" })).toBeDisabled();
  const photoChooser = page.waitForEvent("filechooser");
  await page.getByRole("radio", { name: "סלפי או תמונה" }).click();
  await (await photoChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: Buffer.from(png) });
  await expect(page.getByText("התמונה שלכם ✓")).toBeVisible();
  await page.getByRole("button", { name: "המשך" }).click();

  // 8 · the summary: how a customer will see her, each part editable, and what the review checks.
  await expect(page.getByText("הכול מוכן")).toBeVisible();
  await expect(page.getByLabel("הכרטיס שלקוחות יראו")).toContainText("מיכל");
  await page.getByRole("button", { name: "עריכת אזור" }).click();
  await expect(page.getByText(/שלב 3 מתוך/)).toBeVisible();
  await page.getByRole("button", { name: "המשך" }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^המשך$|שמירה והמשך|אפשר להמשיך/ }).click();
  await expect(page.getByText("ביקורות ודירוגים ברשת")).toBeVisible();
  await page.getByRole("button", { name: "שליחה לאישור PRO NOW" }).click();
  await expect(page).toHaveURL(/\/pro$/);
  await expect(page.getByText("הבקשה בבדיקה")).toBeVisible();
  // The true state, per step: received, and nothing checked yet.
  await expect(page.getByLabel("מה נבדק")).toContainText("התקבלו");
  await expect(page.getByLabel("מה נבדק")).not.toContainText("נבדק ✓");
  // Her shop can be redesigned from her page, and saving brings her back to it.
  await page.getByRole("link", { name: "עיצוב החנות ›" }).click();
  await expect(page.getByRole("textbox", { name: "השם על השלט" })).toHaveValue("מיכל צנרת");
  await page.getByRole("radio", { name: "צבע ירוק" }).click();
  await page.getByRole("button", { name: "המשך" }).click();
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
    // A person decides the identity first; the server refuses the account until then.
    const { identity } = await (await admin.get(`/api/v1/admin/professionals/${mine.profile.id}`)).json();
    await decide(`/api/v1/admin/identity/${identity.id}/decision`, { action: "APPROVE" });
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
  // Approved: the moment lands once on the device that watched it wait, then her work screen.
  await page.reload();
  await expect(page.getByText("אושרת!")).toBeVisible();
  await expect(page.getByText("מעכשיו את מקבלת קריאות", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "להתחיל לקבל עבודות" }).click();
  await expect(page.getByRole("button", { name: "התחלת משמרת" })).toBeVisible();
  await expect(page.getByText("מחוץ למשמרת")).toBeVisible();
  // And the review, per service, is still one link away.
  await page.goto("/pro?review=1");
  await expect(page.getByText("אושרתם לעבודה")).toBeVisible();
  await expect(page.getByText("מאושר ✓")).toHaveCount(2);
});
