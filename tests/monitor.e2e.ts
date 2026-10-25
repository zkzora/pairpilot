import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Deterministic offline market read, not a claim about the actual sponsor API.
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Injected offline condition for UI testing." }) }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
});

async function openPartial(page: Page) {
  await page.getByLabel("Failure scenario").selectOption("partial");
  await page.getByRole("button", { name: "Preview pair", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
}
const row = (page: Page, table: string, name: string) => page.getByRole("table", { name: table }).getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });

test("monitor values the actual partial exposure at simulated marks, separate from the plan", async ({ page }) => {
  await openPartial(page);
  const monitor = page.getByLabel("Active pair monitor");
  await expect(monitor).toContainText("SIMULATED");
  await expect(monitor).toContainText("ETH/BTC · Simulation");
  await expect(row(page, "Current pair exposure", "Open now")).toContainText("+0.0099");
  await expect(row(page, "Current pair exposure", "Open now")).toContainText("−0.00014");
  // 0.0099 ETH × 2,500 and 0.00014 BTC × 85,000 at the fixed simulated marks.
  await expect(row(page, "Current pair exposure", "Marked value")).toHaveText(/24\.75\s*11\.90\s*36\.65/);
  await expect(row(page, "Current pair exposure", "Allocation · now")).toContainText("67.5%");
  await expect(row(page, "Current pair exposure", "Allocation · now")).toContainText("plan 50");
  await expect(row(page, "Current pair exposure", "Funding owed")).toContainText("Not simulated");
  await expect(monitor).toContainText("Equal notional is not beta neutrality.");
  // Reading the monitor sends nothing.
  await monitor.getByRole("button", { name: "Refresh", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pairpilot:simulation")!).sends)).toBe(2);
});

test("monitor reattaches to the journal's own markets after reload, whatever the selector", async ({ page }) => {
  await openPartial(page);
  await page.reload();
  await expect(row(page, "Current pair exposure", "Open now")).toContainText("+0.0099");
  await expect(page.getByLabel("Active pair monitor")).toContainText("ETH/BTC");
});

test("closed pair summary shows planned versus actual fills, read-back and the same summary in Activity", async ({ page }) => {
  await openPartial(page);
  await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
  await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  const summary = page.getByLabel("Pair summary");
  await expect(summary).toContainText("Closed pair summary");
  await expect(row(page, "Planned versus actual", "Filled on open")).toContainText("0.0099");
  await expect(row(page, "Planned versus actual", "Filled on open")).toContainText("0.00014");
  await expect(row(page, "Planned versus actual", "Avg open price")).toHaveText(/2,500\.00\s*85,000\.00/);
  await expect(row(page, "Planned versus actual", "Fees · receipts")).toContainText("Not simulated");
  await expect(row(page, "Planned versus actual", "Net")).toContainText("Not simulated");
  await expect(summary).toContainText("Final read-back: both positions zero");
  await expect(summary).toContainText("fees and funding are not simulated");
  await expect(page.getByLabel("Next step")).toContainText("Both legs read back as zero at");
  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("button", { name: "Activity" }).click();
  await expect(page.getByLabel("Pair summary")).toContainText("Closed pair summary");
  await expect(row(page, "Planned versus actual", "Closed")).toContainText("0.0099");
});

test("monitor stays readable on a phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await openPartial(page);
  await expect(page.getByLabel("Active pair monitor")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel("Active pair monitor").screenshot({ path: "test-results/monitor-mobile.png" });
});
