import { test, expect } from "@playwright/test";

test("landing explains illustrated outcomes and opens the working dashboard", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "One leg filled. The other didn't." })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Incomplete pair");
  await expect(page.getByText("Next: review the close for the leg that is still open", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "HYPE / SOL" }).click();
  await expect(page.getByRole("heading", { name: "Long HYPE / Short SOL" })).toBeVisible();
  await page.getByRole("button", { name: "Receipt pending", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Outcome unknown");
  await expect(page.getByText("INTERACTIVE ILLUSTRATION · NO ORDERS")).toBeVisible();
  await page.getByRole("link", { name: "Open PairPilot", exact: false }).click();
  await expect(page.getByRole("radiogroup", { name: "Execution mode" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pair ticket", exact: true })).toBeVisible();
});

test("landing proof is downloadable and links real recorded transactions", async ({ page, request }) => {
  await page.goto("/home");
  const recovery = page.locator("#proof details").first();
  await expect(recovery.locator("summary")).toContainText("HYPE / ETH");
  await expect(recovery.locator("summary")).toContainText("Recovery · injected fault");
  await expect(recovery.locator("summary")).toContainText("Recovered to flat");
  await recovery.locator("summary").click();
  await expect(recovery).toContainText("not broadcast");
  await expect(recovery.getByRole("link", { name: /Close HYPE.*0x4532aeec/ })).toHaveAttribute("href", /tokyo\/tx\/0x4532aeec1c17a3c2cd65b722794edc5ee7f61c86ffcb4121b0c83a00692b857b/);
  await expect(page.locator("#proof details")).toHaveCount(5);
  await page.locator("#proof details", { hasText: "bda58fa7" }).locator("summary").click();
  const receipt = page.getByRole("link", { name: /Open ETH.*0x971ad9d0/ });
  await expect(receipt).toHaveAttribute("href", /tokyo\/tx\/0x971ad9d010d22bafd7d2f11ecf7411eb49a47453c169706f36c88425f4d6e57a/);
  const response = await request.get("/proof/pairpilot-browser-verification.json");
  expect(response.ok()).toBeTruthy();
  const proof = await response.json();
  expect(proof.chainId).toBe(50383);
  expect(new Set(proof.reports.flatMap((r: { transactions: { hash: string }[] }) => r.transactions.map(t => t.hash))).size).toBe(8);
});

test("wireframes explain unknown blocking and close review without wallet access", async ({ page }) => {
  await page.goto("/wireframes");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review close", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close review", exact: true }).click();
  await expect(page.getByText("CLOSE REVIEW / Exact remaining quantities / 30 s expiry")).toBeVisible();
  await page.getByRole("button", { name: "Show closed state", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Flat", exact: true })).toBeVisible();
});

test("landing and wireframes stay within a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ["/home", "/wireframes"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
