import { asPerson, expect, test } from "./fixtures";
import { finishFirstRun, signInByEmail, signInExisting, uniqueEmail } from "./helpers";
import { dispatchableProfessional } from "./pro-helpers";

/**
 * docs/21 W6 + W7 acceptance: a customer and a professional, each in their
 * own browser, from going online to the review. Everything between them
 * goes through the real server, dispatch engine and job socket.
 */
const LAT = 32.05;
const LNG = 34.76;

test("the customer and the professional, two browsers, request to review", async ({ browser, baseURL }) => {
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
    // The professional goes online from their own screen.
    const p = await proCtx.newPage();
    await signInExisting(p, pro.email, baseURL!);
    await expect(p).toHaveURL(/\/pro$/);
    await p.getByRole("button", { name: "התחלת משמרת" }).click();
    await expect(p.getByRole("button", { name: "סיום משמרת" })).toBeVisible();
    await expect(p.getByText("את במשמרת — השאירי את האפליקציה פתוחה כדי לקבל קריאות.")).toBeVisible();

    // The customer asks.
    const c = await custCtx.newPage();
    await signInByEmail(c, uniqueEmail("e2e-w7-customer"));
    await finishFirstRun(c);
    await c.request.post("/api/v1/me/addresses", { data: { kind: "location", lat: LAT, lng: LNG, details: "דיזנגוף 50" }, headers: { origin: baseURL! } });
    await c.getByRole("textbox", { name: "ספרו מה צריך" }).fill("נזילה במטבח");
    await c.getByRole("button", { name: /המשך עם נזילה/ }).click();
    // The service page first, as in the demo; then the form.
    await c.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
    await c.getByRole("button", { name: "שליחת הקריאה" }).click();
    await expect(c.getByText("מחפשים מי זמין עכשיו")).toBeVisible();

    // The offer reaches her with the server's countdown; she takes it.
    await expect(p.getByText("שניות להחליט")).toBeVisible({ timeout: 15_000 });
    await p.getByRole("button", { name: /^קבלת העבודה/ }).click();
    await expect(p.getByText("דיזנגוף 50")).toBeVisible();

    // The customer sees who is coming.
    await c.getByRole("button", { name: /^שליחת .* אליי$/ }).click({ timeout: 15_000 });

    // Her steps, each reaching the customer live.
    await p.getByRole("button", { name: "יציאה לדרך" }).click();
    await expect(c.getByText(/בדרך אליכם/).first()).toBeVisible({ timeout: 15_000 });
    await p.getByRole("button", { name: "הגעתי" }).click();
    await p.getByRole("button", { name: "התחלת בדיקה" }).click();

    // An ordinary visit ends at the diagnosis (docs/18, 2026-09-29): the app
    // carries the visit fee, the repair is agreed at the door — no quote here.
    await expect(p.getByRole("button", { name: /שליחת הצעת מחיר/ })).toHaveCount(0);
    await p.getByRole("button", { name: /^סיימתי את האבחון/ }).click();
    await expect(p.getByText("סיימת — מחכים לאישור הלקוח")).toBeVisible();

    // The customer confirms the visit fee, owed to her directly, and rates.
    await expect(c.getByText("‏180 ‏₪ · לתשלום ישירות למקצוען")).toBeVisible({ timeout: 15_000 });
    await c.getByRole("button", { name: "אישור שהעבודה הושלמה" }).click({ timeout: 15_000 });
    // The job settled on her screen (the demo's ProJobSettledBody); it dismisses itself.
    await expect(p.getByText("סכום העבודה")).toBeVisible({ timeout: 25_000 });
    await c.getByRole("button", { name: "5 כוכבים" }).click();
    await c.getByRole("button", { name: "שליחת דירוג" }).click();
    await expect(c.getByText("הקריאה נסגרה")).toBeVisible();

    // Back to her shift, and off it.
    await expect(p).toHaveURL(/\/pro$/, { timeout: 10_000 });
    await p.getByRole("button", { name: "סיום משמרת" }).click();
    await expect(p.getByRole("button", { name: "התחלת משמרת" })).toBeVisible();

    // Her week (demo sync, the pro tabs): the job, paid to her directly — no net, nothing "בחישוב".
    await p.getByRole("tab", { name: "הרווחים" }).click();
    await expect(p).toHaveURL(/\/pro\/earnings$/);
    await expect(p.getByText("סכום העבודות · שולם לך ישירות")).toBeVisible();
    await expect(p.getByText("שולם לך ישירות", { exact: true }).first()).toBeVisible();
    await expect(p.getByText("בחישוב")).toHaveCount(0);

    // Her documents and services, in the server's words.
    await p.getByRole("tab", { name: "המסמכים שלי" }).click();
    await expect(p).toHaveURL(/\/pro\/documents$/);
    await expect(p.getByRole("heading", { name: "המסמכים שלי" })).toBeVisible();
    await expect(p.getByText("תיק עוסק", { exact: true })).toBeVisible();
    // Approved before the identity check existed: not asked for one until re-verification exists (docs/10).
    await expect(p.getByText("זהות", { exact: true })).toHaveCount(0);

    // Her profile as customers see it (the demo's profile tab): the job she just did counts, and "עריכה" leads to her details.
    await p.getByRole("tab", { name: "הפרופיל" }).click();
    await expect(p).toHaveURL(/\/pro\/profile$/);
    await expect(p.getByRole("heading", { name: "ככה הלקוחות רואים אותך" })).toBeVisible();
    await expect(p.getByText("דנה").first()).toBeVisible();
    await expect(p.getByRole("button", { name: "עריכת החנות והפרטים" })).toBeVisible();
    await expect(p.getByRole("button", { name: "יציאה מהחשבון" })).toBeVisible();

    // Her car, changed from the profile tab (audit v2 #8a): never a full plate.
    await expect(p.getByText("לא הוספתם רכב")).toBeVisible();
    await p.getByRole("button", { name: "עריכת הרכב" }).click();
    await p.getByRole("textbox", { name: "הרכב שלכם" }).fill("טויוטה יאריס אפורה");
    const tail = p.getByRole("textbox", { name: "הספרות האחרונות של מספר הרכב" });
    await tail.fill("1234567");
    await expect(p.getByRole("button", { name: "שמירה" })).toBeDisabled();
    await tail.fill("308");
    await p.getByRole("button", { name: "שמירה" }).click();
    await expect(p.getByText("טויוטה יאריס אפורה · ••• 308")).toBeVisible();

    // Her prices: kept by the server, and no field it cannot keep.
    await p.getByRole("tab", { name: "המשמרת" }).click();
    await p.getByRole("button", { name: /המחירים שלי/ }).click();
    await expect(p).toHaveURL(/\/pro\/pricing$/);
    await expect(p.getByText("המחירים שלך")).toBeVisible();
    await expect(p.getByText("תוספת לילה ושבת")).toHaveCount(0);
    const price = p.getByRole("textbox").first();
    await price.fill("235");
    await expect(p.getByText("נשמר")).toBeVisible({ timeout: 5_000 });
    await p.reload();
    await expect(p.getByRole("textbox").first()).toHaveValue("235");
  } finally {
    await proCtx.close();
    await custCtx.close();
    await pro.dispose();
  }
});
