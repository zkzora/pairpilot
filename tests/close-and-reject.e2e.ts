import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Deterministic offline market read, not a claim about the actual sponsor API.
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Injected offline condition for UI testing." }) }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
});

test("close review shows actual remaining quantities and price bounds before anything is sent", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("partial");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
  const review = page.getByLabel("Close orders");
  await expect(review).toContainText("+0.0099");
  await expect(review).toContainText("Sell 0.0099");
  await expect(review).toContainText("−0.00014");
  await expect(review).toContainText("Buy 0.00014");
  await expect(review).toContainText("≥");
  await expect(review).toContainText("≤");
  const sends = () => page.evaluate(() => JSON.parse(localStorage.getItem("pairpilot:simulation")!).sends as number);
  expect(await sends()).toBe(2);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Close orders")).toHaveCount(0);
  expect(await sends()).toBe(2);
  await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  expect(await sends()).toBe(4);
});

test("a rejected second signature leaves the first leg visible, survives reload and is never resent", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("second-rejected");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.locator(".chip", { hasText: "Signature rejected" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.locator(".chip", { hasText: "Signature rejected" })).toBeVisible();
  await expect(page.getByLabel("Current exposure")).toContainText("+0.0099 ETH");
  await page.getByRole("button", { name: "Reconcile", exact: true }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pairpilot:simulation")!).sends)).toBe(1);
});
