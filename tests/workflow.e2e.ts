import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Deterministic UI failure case, not a claim about the actual sponsor API.
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Injected offline condition for UI testing." }) }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
});

test("opens and closes a simulated pair; exports a labeled receipt", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toContain("simulation");
  await page.getByRole("button", { name: "Close pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps incomplete execution visible then recovers", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("second-empty");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.locator(".chip", { hasText: "No fill" })).toBeVisible();
  await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
});

test("reloads an ambiguous transaction and reconciles without a duplicate send", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("timeout");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Needs reconciliation", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Needs reconciliation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reconcile", exact: true }).click();
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  const sends = await page.evaluate(() => JSON.parse(localStorage.getItem("pairpilot:simulation")!).sends);
  expect(sends).toBe(2);
});

test("shows unresolved recovery rather than reporting flat", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("recovery-empty");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
  await expect(page.getByText("Residual exposure", { exact: true })).toBeVisible();
  await expect(page.getByText("Flat", { exact: true })).toHaveCount(0);
});

test("testnet mode requires a wallet and never offers simulated execution", async ({ page }) => {
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await expect(page.getByText("Signs real orders on Somnia Tokyo testnet", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Execute simulation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No browser wallet" })).toBeVisible();
});

test("refuses to sign a preview inside the last 20 seconds", async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Execute simulation", exact: true })).toBeEnabled();
  await page.clock.fastForward(45_000);
  await expect(page.getByRole("button", { name: "Refresh preview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute simulation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Execute simulation", exact: true })).toBeEnabled();
});

test("activity lists this browser's simulated pair; setup reads nothing in simulation", async ({ page }) => {
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Activity" }).click();
  await expect(page.getByRole("button", { name: /Long ETH \/ Short BTC/ })).toBeVisible();
  await expect(page.getByText("History in this browser only", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Resolve in Trade", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close pair", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Setup" }).click();
  await expect(page.getByText("Nothing here is checked in simulation", { exact: false })).toBeVisible();
  await expect(page.getByText("No wallet found", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Local CLI", exact: true }).click();
  await expect(page.getByText("npm run wallet:claim", { exact: true })).toBeVisible();
  await expect(page.getByText("This website never reads that file", { exact: false })).toBeVisible();
});

test("after a partial fill the ticket shows actual exposure apart from the original plan", async ({ page }) => {
  await page.getByLabel("Failure scenario").selectOption("partial");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  const current = page.getByLabel("Current exposure"), plan = page.getByLabel("Original plan");
  await expect(current).toContainText("−0.00014 BTC");
  await expect(current).not.toContainText("0.00029");
  await expect(plan).toContainText("Original plan · not current exposure");
  await expect(plan).toContainText("0.00029 BTC");
});

for (const mode of ["Simulation", "Testnet"]) {
  test(`phone: the pair ticket comes first before a position exists (${mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    if (mode === "Testnet") await page.getByRole("radio", { name: "Testnet", exact: true }).click();
    const box = await page.getByRole("button", { name: "Preview pair", exact: true }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  });
}

for (const width of [375, 768, 1280]) {
  test(`usable without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: "Preview pair", exact: true }).click();
    await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
    await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `evidence/screenshots/pairpilot-${width}.png`, fullPage: true });
  });
}
