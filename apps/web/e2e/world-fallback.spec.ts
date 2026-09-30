import { expect, test } from "@playwright/test";

import { finishFirstRun, signInByEmail, uniqueEmail } from "./helpers";

test("WebGL failure keeps the neighbourhood actions available", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await signInByEmail(page, uniqueEmail("e2e-world-fallback"));
  await finishFirstRun(page);

  await page.goto("/world");
  await expect(page.getByRole("button", { name: "להמשיך בלי העולם" })).toBeVisible();
  await expect(page.getByRole("button", { name: "היכנסו" })).toBeVisible();
  await page.getByRole("button", { name: "היכנסו" }).click();
  await expect(page.getByRole("button", { name: "נזילה או דליפת מים" })).toBeVisible();
  await expect(page.getByRole("button", { name: "יציאה" })).toBeVisible();
});
