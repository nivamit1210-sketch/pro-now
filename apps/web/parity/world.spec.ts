import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { finishFirstRun, linkFor, uniqueEmail } from "../e2e/helpers";

mkdirSync(path.resolve(import.meta.dirname, "../parity-report"), { recursive: true });

/**
 * World parity is intentionally a product smoke capture rather than a pixel
 * assertion: the demo's world is fixture-driven, while this route is backed
 * by the live catalogue and therefore has no honest one-to-one data state.
 */
test("the web world route exposes the same customer journey entry point", async ({ page }) => {
  const email = uniqueEmail("parity-world");
  await page.goto("http://localhost:4100/");
  await page.getByText("אני צריך מקצוען").click();
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByText("שליחת קישור").click();
  await page.goto(await linkFor(email));
  await finishFirstRun(page);
  await page.goto("http://localhost:4100/world");
  await expect(page.getByText("מטיילים בשכונה")).toBeVisible();
  await page.screenshot({ path: "parity-report/world-entry.png", fullPage: true });
});
