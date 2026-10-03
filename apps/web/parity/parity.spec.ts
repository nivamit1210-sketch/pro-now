import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { linkFor, uniqueEmail } from "../e2e/helpers";
import { dispatchableProfessional } from "../e2e/pro-helpers";

/**
 * The product against the demo, screen by screen (see parity.config.ts for
 * why this is not in CI). Each screen writes demo | product | diff to
 * parity-report/ and asserts the share of differing pixels stays under
 * MAX_DIFF, so a screen that drifts from the demo is caught at the next
 * catch-up.
 *
 * Home is reported but not asserted: it differs by decision (docs/21 W2).
 * Upcoming controls are dimmed, and the demo's invented data (recent jobs,
 * counts, address) is absent.
 */
const DEMO = "http://127.0.0.1:4421";
const PRODUCT = "http://localhost:4100";
const OUT = path.resolve(import.meta.dirname, "../parity-report");
/** Anti-aliasing and the drifting backdrops account for well under this. */
const MAX_DIFF = 0.02;

mkdirSync(OUT, { recursive: true });
const results: Record<string, number> = {};

async function shot(page: Page) {
  await page.waitForTimeout(1500);
  return PNG.sync.read(await page.screenshot({ animations: "disabled" }));
}

function compare(name: string, demo: PNG, product: PNG, assert = true) {
  const { width, height } = demo;
  const diff = new PNG({ width, height });
  const n = pixelmatch(demo.data, product.data, diff.data, width, height, { threshold: 0.15 });
  const share = n / (width * height);
  results[name] = share;
  const sheet = new PNG({ width: width * 3, height });
  PNG.bitblt(demo, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(product, sheet, 0, 0, width, height, width, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2, 0);
  writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(sheet));
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  if (assert) expect(share, `${name}: ${(share * 100).toFixed(2)}% of pixels differ`).toBeLessThan(MAX_DIFF);
}

test("the product's screens match the demo's", async ({ browser }) => {
  test.setTimeout(600_000);
  const demo = await (await browser.newContext()).newPage();
  const product = await (await browser.newContext()).newPage();

  await demo.goto(DEMO);
  await product.goto(PRODUCT);
  compare("1-welcome", await shot(demo), await shot(product));

  // Into the intro: the demo by phone and code, the product by email link.
  await demo.getByText("אני צריך מקצוען").click();
  await demo.getByPlaceholder("050-0000000").fill("0501234567");
  await demo.getByText("שליחת קוד").click();
  // The demo takes ~700ms to reach the code stage; fill the code field itself.
  await demo.getByPlaceholder("000000", { exact: true }).fill("123456");
  await demo.getByText("כניסה", { exact: true }).click();

  const email = uniqueEmail("parity");
  await product.getByText("אני צריך מקצוען").click();
  await product.getByPlaceholder("name@example.com").fill(email);
  await product.getByText("שליחת קישור").click();
  await product.goto(await linkFor(email));

  for (let slide = 0; slide < 5; slide++) {
    compare(`2-intro-${slide + 1}`, await shot(demo), await shot(product));
    const next = slide < 4 ? "הבא" : "בואו נתחיל";
    await demo.getByText(next, { exact: true }).click();
    await product.getByText(next, { exact: true }).click();
  }

  compare("3-avatar", await shot(demo), await shot(product));

  await demo.getByText("דלג כרגע").click();
  await product.getByText("דלג כרגע").click();
  // Reloading before the skip is saved lands back on the avatar screen.
  await product.waitForURL(`${PRODUCT}/`);
  // The product's home shows the saved address, as the demo's does.
  await product.request.post(`${PRODUCT}/api/v1/me/addresses`, {
    data: { kind: "location", lat: 32.0853, lng: 34.7818, details: "אהרון דוד גורדון 18" },
    headers: { origin: PRODUCT },
  });
  await product.reload();
  compare("4-home", await shot(demo), await shot(product), false);

  /*
   * THE CUSTOMER FLOW, past home (catch-up 2026-10-01). Reported, not yet
   * asserted: these screens were wired one by one, and the report is how the
   * remaining differences are found. Each step drives both apps by the same
   * labels — they share their screen components — and a step that cannot be
   * reached in one of them is recorded rather than ending the run.
   */
  const step = async (name: string, act: (p: Page) => Promise<void>) => {
    for (const [label, p] of [["demo", demo], ["product", product]] as const) {
      try {
        await act(p);
      } catch (e) {
        unreachable[name] = `${label}: ${(e as Error).message.split("\n")[0]}`;
      }
    }
    compare(name, await shot(demo), await shot(product), false);
  };
  const unreachable: Record<string, string> = {};

  await step("5-home-scrolled", async (p) => void (await p.mouse.wheel(0, 700)));
  await step("6-menu", (p) => p.getByRole("button", { name: "תפריט" }).click({ timeout: 5000 }));
  await step("6b-menu-closed", (p) => p.getByRole("button", { name: "תפריט" }).click({ timeout: 5000 }));

  // הקריאות שלי, before any call: the empty state, asserted (both from the menu).
  for (const p of [demo, product]) {
    await p.getByRole("button", { name: "תפריט" }).click({ timeout: 5000 });
    await p.getByRole("button", { name: /^הקריאות שלי/ }).click({ timeout: 5000 });
  }
  // The demo's prototype notice ("אב־טיפוס…") covers the top for its first seconds.
  await demo.waitForTimeout(4000);
  compare("6c-calls-empty", await shot(demo), await shot(product));
  for (const p of [demo, product]) {
    await p.getByRole("button", { name: "חזרה", exact: true }).click({ timeout: 5000 });
    await p.getByRole("button", { name: "תפריט" }).click({ timeout: 5000 });
  }

  // Someone to take the product's call (the demo invents its match).
  // The demo's car at the door (audit v2 #8a), as a professional would give it while joining.
  const pro = await dispatchableProfessional({
    serviceCode: "CLEAN_URGENT",
    lat: 32.0853,
    lng: 34.7818,
    baseURL: PRODUCT,
    vehicle: { vehicleHe: "יונדאי i20 לבנה", plateTail: "47" },
  });
  await step("7-category", async (p) => {
    await p.mouse.wheel(0, -2000);
    await p.getByRole("button", { name: "ניקיון", exact: true }).click({ timeout: 5000 });
  });
  await step("8-service", (p) => p.getByRole("button", { name: "ניקיון דחוף" }).first().click({ timeout: 5000 }));
  await step("9-form", (p) => p.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click({ timeout: 5000 }));
  await step("10-form-picked", (p) => p.getByText("ביקור ניקיון · 3 שעות").first().click({ timeout: 5000 }));
  await step("11-searching", (p) => p.getByRole("button", { name: "שליחת הקריאה" }).click({ timeout: 5000 }));

  // הקריאות שלי with the call live: the professional on the way. Reported.
  const job = product.url().match(/\/jobs\/([^/?#]+)/)?.[1];
  // At once: the offer would expire while the demo walks its own match screen.
  const onTheWay = job
    ? pro.acceptOfferFor(job).then(() => pro.step(job, "en-route")).catch((e: Error) => e)
    : Promise.resolve(new Error("no job on the product"));
  await onTheWay;
  await step("12-calls-live", async (p) => {
    if (p === product) {
      const failed = await onTheWay;
      if (failed instanceof Error) throw failed;
    } else {
      // The demo asks for the address first: the device's location, then send again.
      if (await p.getByText("לאן לשלוח את המקצוען?").count()) {
        await p.context().grantPermissions(["geolocation"]);
        await p.context().setGeolocation({ latitude: 32.0853, longitude: 34.7818 });
        await p.getByText("המיקום שלי עכשיו").click({ timeout: 5000 });
        await p.getByRole("button", { name: "אישור הכתובת" }).click({ timeout: 5000 });
        await p.getByRole("button", { name: "שליחת הקריאה" }).click({ timeout: 5000 });
      }
      await p.getByRole("button", { name: "כן, מתאים לי" }).click({ timeout: 30_000 });
    }
    await p.getByRole("button", { name: "תפריט" }).click({ timeout: 10_000 });
    await p.getByRole("button", { name: /^הקריאות שלי/ }).click({ timeout: 5000 });
  });

  // At the door (the demo's ArrivalVerifyBody): who to expect and the code. Reported.
  await step("13-arrival", async (p) => {
    if (p === product) {
      if (!job) throw new Error("no job on the product");
      await pro.step(job, "arrive");
      await p.goto(`${PRODUCT}/jobs/${job}`);
      await p.getByText("קוד האימות שלכם").waitFor({ timeout: 15_000 });
    } else {
      // The live order from the calls list, its tracking, then the demo's own "almost there".
      await p.getByRole("button", { name: /^הזמנה 1 מתוך 1/ }).click({ timeout: 5000 });
      const follow = p.getByRole("button", { name: /^לעקוב אחרי/ });
      if (await follow.count()) await follow.first().click({ timeout: 5000 });
      await p.getByRole("button", { name: /המקצוען כמעט אצלך$/ }).click({ timeout: 10_000 });
      await p.getByText("קוד האימות שלכם").waitFor({ timeout: 10_000 });
    }
  });
  await pro.dispose();

  writeFileSync(path.join(OUT, "unreachable.json"), JSON.stringify(unreachable, null, 2));
  // Leave nothing live behind on the product's server.
  if (job) await product.request.post(`${PRODUCT}/api/v1/jobs/${job}/cancel`, { data: {}, headers: { origin: PRODUCT } });
});
