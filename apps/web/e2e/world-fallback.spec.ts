import { expect, test } from "./fixtures";

import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

test("WebGL failure keeps the neighbourhood actions available", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await signInByEmail(page, uniqueEmail("e2e-world-fallback"));
  await finishFirstRun(page);

  await page.goto("/world");
  // No bottom bar: the round back button is the way out, as in the demo.
  await expect(page.getByRole("button", { name: "להמשיך בלי העולם" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "יציאה מהעולם" })).toBeVisible();
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible();
  await page.getByRole("button", { name: "היכנסו" }).click();
  await expect(page.getByRole("button", { name: "נזילה או דליפת מים" })).toBeVisible();
  await page.getByRole("button", { name: "יציאה מהעולם" }).click();
  await expect(page).toHaveURL(/\/$/);
});
