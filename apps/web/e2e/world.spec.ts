import { PNG } from "pngjs";

import { expect, test } from "./fixtures";

import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

test("the customer can walk into a catalogue-backed shop and start a request", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-world"));
  await finishFirstRun(page);

  await page.goto("/world");
  // The demo's chrome: just the round back button, no title pill, no bottom bar.
  await expect(page.getByRole("button", { name: "יציאה מהעולם" })).toBeVisible();
  await expect(page.getByRole("button", { name: "להמשיך בלי העולם" })).toHaveCount(0);

  // The first shop stands up the street and to the left of where you start.
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowLeft");
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowUp");
  await page.getByRole("button", { name: "היכנסו" }).click();

  await expect(page.getByRole("button", { name: "נזילה או דליפת מים" })).toBeVisible();
  await page.getByRole("button", { name: "נזילה או דליפת מים" }).click();
  // Home opens that service's page first, as in the demo; then the form.
  await page.getByRole("button", { name: /^בקשת .* עכשיו$/ }).click();
  await expect(page.getByRole("textbox", { name: "מה צריך, במילים שלך" })).toBeVisible();
});

test("on a phone, dragging on the street walks to a shop", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-world-drag"));
  await finishFirstRun(page);

  await page.goto("/world");
  const canvas = page.locator(".world-canvas__surface canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // The demo's hint over the high opening view, until the first step.
  const hint = page.getByText("גררו באצבע על המסך כדי ללכת");
  await expect(hint).toBeVisible({ timeout: 30_000 });

  // Held still after the move, the offset keeps walking: up and to the left.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y - 60, { steps: 4 });
  // The thumb stick shows where the finger came down, as in the demo.
  await expect(page.locator(".world-canvas__stick")).toBeVisible();
  await expect(hint).toBeHidden();
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
  await expect(page.locator(".world-canvas__stick")).toBeHidden();
});

/** Share of the shot that is near-black: every channel under 24 of 255. */
function nearBlackShare(png: PNG): number {
  let dark = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i]! < 24 && png.data[i + 1]! < 24 && png.data[i + 2]! < 24) dark++;
  }
  return dark / (png.width * png.height);
}

test("at the start the street is in view, not a wall in front of the camera", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-world-view"));
  await finishFirstRun(page);

  // Midday, so the check reads the daylight street whatever the CI clock says.
  await page.clock.setFixedTime(new Date("2026-10-02T12:00:00"));
  await page.goto("/world");
  const canvas = page.locator(".world-canvas__surface canvas");
  await expect(canvas).toBeVisible();
  // The arrival screen lifts once the street's art is in; then let the camera settle.
  await expect(page.getByText("נכנסים לעיר")).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(3000);

  // A filler wall stood across the pavement once (#62) and filled the left
  // two thirds of the phone with black. The daylight street has almost none.
  const share = nearBlackShare(PNG.sync.read(await canvas.screenshot()));
  console.log(`world view near-black share: ${(share * 100).toFixed(1)}%`);
  expect(share, `${(share * 100).toFixed(1)}% of the street view is black`).toBeLessThan(0.15);
});

test.describe("arriving on a slow network", () => {
  // page.route cannot see what a service worker answers, so none for this one.
  test.use({ serviceWorkers: "block" });

  test("the arrival screen holds until the street's art is in, then lifts", async ({ page }) => {
    test.setTimeout(120_000);
    await signInByEmail(page, uniqueEmail("e2e-world-arrival"));
    await finishFirstRun(page);

    /*
     * A slow network, held by the test rather than by a clock: the street's
     * pictures wait until the arrival screen has been checked. A fixed delay
     * let them land mid-check (about 2 s in); the frame that then uploads all
     * of them blocks the page for seconds on CI's software renderer, and the
     * screen had lifted by the time the next check could run.
     */
    let releaseArt!: () => void;
    const artHeld = new Promise<void>((release) => (releaseArt = release));
    await page.route(/\/world\/.+\.webp$/, async (route) => {
      await artHeld;
      await route.continue();
    });
    await page.goto("/world");
    const arrival = page.getByRole("status").filter({ hasText: "נכנסים לעיר" });
    await expect(arrival.getByText("PRO NOW")).toBeVisible();
    // No art yet, so it holds (well inside its 12 s cap).
    await page.waitForTimeout(1500);
    await expect(arrival).toBeVisible();

    releaseArt();
    await expect(arrival).toBeHidden({ timeout: 30_000 });
    await expect(page.locator(".world-canvas__surface canvas")).toBeVisible();
  });
});
