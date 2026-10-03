import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { finishFirstRun, signInByEmail, uniqueEmail } from "../e2e/helpers";

/**
 * The world against the demo's city (see parity.config.ts for why this is
 * not in CI). Both are shot at a pinned hour, noon and 20:00, on the opening
 * view and after a short walk up the street.
 *
 * A whole-frame diff cannot reach 2% here: the passers-by and traffic are
 * random in both, and the demo's street is built from 3D blocks where the
 * product still stands painted facades (a later catch-up). So each shot also
 * reports the mean colour of the SKY band (top 12%) and the GROUND band
 * (bottom 25%): the sky is what the lighting and sky catch-up changes, and
 * the ground is where the sun's shadows fall.
 *
 * The third shot is up at the first shop on the left (the shopfront's
 * dressing): the same up-and-left drag in both, held until the product offers
 * "היכנסו" and for a fixed spell in the demo, whose steps are slower here.
 */
const DEMO = "http://127.0.0.1:4421";
const PRODUCT = "http://localhost:4100";
const OUT = path.resolve(import.meta.dirname, "../parity-report/world-light");
mkdirSync(OUT, { recursive: true });

type Rgb = [number, number, number];
const results: Record<string, unknown> = existsSync(path.join(OUT, "results.json"))
  ? (JSON.parse(readFileSync(path.join(OUT, "results.json"), "utf8")) as Record<string, unknown>)
  : {};

function band(png: PNG, from: number, to: number): Rgb {
  const sum: Rgb = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(png.height * from); y < Math.floor(png.height * to); y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      sum[0] += png.data[i]!;
      sum[1] += png.data[i + 1]!;
      sum[2] += png.data[i + 2]!;
      n++;
    }
  }
  return sum.map((v) => Math.round(v / n)) as Rgb;
}

/** Largest per-channel difference, as a share of 255. */
const delta = (a: Rgb, b: Rgb) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!))) / 255;

function compare(name: string, demo: PNG, product: PNG) {
  const { width, height } = demo;
  const diff = new PNG({ width, height });
  const n = pixelmatch(demo.data, product.data, diff.data, width, height, { threshold: 0.15 });
  const sheet = new PNG({ width: width * 3, height });
  PNG.bitblt(demo, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(product, sheet, 0, 0, width, height, width, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2, 0);
  writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(sheet));
  const sky = { demo: band(demo, 0, 0.12), product: band(product, 0, 0.12) };
  const ground = { demo: band(demo, 0.75, 1), product: band(product, 0.75, 1) };
  results[name] = {
    frame: n / (width * height),
    sky: { ...sky, delta: delta(sky.demo, sky.product) },
    ground: { ...ground, delta: delta(ground.demo, ground.product) },
  };
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
}

async function canvasShot(page: Page): Promise<PNG> {
  await page.waitForTimeout(3000);
  return PNG.sync.read(await page.screenshot({ animations: "disabled" }));
}

/** Drag straight up from the middle and hold: both walk forward while held. */
async function walk(page: Page, ms: number) {
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  await page.mouse.move(width / 2, height / 2 - 70, { steps: 4 });
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function openDemo(browser: Browser, at: Date): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.clock.setFixedTime(at);
  await page.goto(`${DEMO}/?city=1`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000);
  return page;
}

async function openProduct(browser: Browser, at: Date): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: PRODUCT })).newPage();
  page.on("response", (r) => {
    if (r.status() >= 400) console.log(`product ${r.status()} ${r.url()}`);
  });
  await signInByEmail(page, uniqueEmail("parity-world"));
  await finishFirstRun(page);
  await page.clock.setFixedTime(at);
  await page.goto("/world");
  await expect(page.locator(".world-canvas__surface canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("נכנסים לעיר")).toBeHidden({ timeout: 60_000 });
  return page;
}

/** Drag up and to the left from the middle and hold, as the e2e walk to a shop does. */
async function walkToShop(page: Page, product: boolean) {
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  await page.mouse.move(width / 2 - 60, height / 2 - 60, { steps: 4 });
  if (product) await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible({ timeout: 15_000 });
  else await page.waitForTimeout(12_000);
  await page.mouse.up();
}

/** The opening view, the street after a short walk, then the first shop; the page is closed after. */
async function shots(page: Page, settleMs: number, product: boolean): Promise<[PNG, PNG, PNG]> {
  const opening = await canvasShot(page);
  // The first push starts the flight down behind the walker. The demo's runs
  // on its capped frame step (about 20 s on software WebGL) and carries on
  // once started; the product's runs on the wall clock (1.9 s).
  await walk(page, 1500);
  await page.waitForTimeout(settleMs);
  const street = await canvasShot(page);
  await walkToShop(page, product);
  await page.waitForTimeout(product ? 0 : settleMs / 2);
  const shop = await canvasShot(page);
  await page.context().close();
  return [opening, street, shop];
}

for (const [hour, at] of [
  ["day", new Date("2026-10-02T12:00:00")],
  ["night", new Date("2026-10-02T20:00:00")],
] as const) {
  test(`the world by ${hour} against the demo's city`, async ({ browser }) => {
    test.setTimeout(600_000);
    // One WebGL page at a time: two at once on a software renderer ran past the timeout.
    const demo = await shots(await openDemo(browser, at), 25_000, false);
    const product = await shots(await openProduct(browser, at), 0, true);
    compare(`world-${hour}-1-opening`, demo[0], product[0]);
    compare(`world-${hour}-2-street`, demo[1], product[1]);
    compare(`world-${hour}-3-shop`, demo[2], product[2]);
  });
}
