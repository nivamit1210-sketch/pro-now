import { expect, test } from "@playwright/test";

import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

test("the customer can walk into a catalogue-backed shop and start a request", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-world"));
  await finishFirstRun(page);

  await page.goto("/world");
  await expect(page.getByText(/מטיילים בשכונה|העולם של PRO NOW/)).toBeVisible();

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

  // Held still after the move, the offset keeps walking: up and to the left.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y - 60, { steps: 4 });
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
});
