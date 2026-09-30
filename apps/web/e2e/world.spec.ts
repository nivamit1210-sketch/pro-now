import { expect, test } from "@playwright/test";

import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

test("the customer can walk into a catalogue-backed shop and start a request", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, uniqueEmail("e2e-world"));
  await finishFirstRun(page);

  await page.goto("/world");
  await expect(page.getByText(/מטיילים בשכונה|העולם של PRO NOW/)).toBeVisible();

  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(2_000);
  await page.keyboard.up("ArrowDown");
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "היכנסו" }).click();

  await expect(page.getByRole("button", { name: "נזילה או דליפת מים" })).toBeVisible();
  await page.getByRole("button", { name: "נזילה או דליפת מים" }).click();
  await expect(page).toHaveURL(/\/?service=svc-leak/);
  await expect(page.getByRole("textbox", { name: "מה צריך, במילים שלך" })).toBeVisible();
});
