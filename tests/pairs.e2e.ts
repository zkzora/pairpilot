import { expect, test, type Page, type Route } from "@playwright/test";
import { getAddress, toFunctionSelector } from "viem";

// Fixture books for the four real Tokyo pools (metadata read 2026-10-22). No live network in these tests.
const POOLS = { ETH: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", BTC: "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0", SOL: "0xb483ec1fb34996638677c20ab087b16f1896fa53", HYPE: "0x63b47ed4a7de0fde659b0d82441dd74828b7297a" } as const;
type Asset = keyof typeof POOLS;
const SPEC: Record<Asset, [number, string, string, string, string]> = {
  ETH: [18, "10000000000000000", "100000000000000", "4000000000000000", "2400000000000000000000"],
  BTC: [8, "100000000000000000", "1000", "13000", "82000000000000000000000"],
  SOL: [9, "10000000000000000", "10000000", "100000000", "104000000000000000000"],
  HYPE: [6, "10000000000000000", "10000", "120000", "78000000000000000000"],
};
const market = (symbol: Asset) => {
  const [baseDecimals, tick, lot, minimum, price] = SPEC[symbol];
  return { market: { symbol, pool: POOLS[symbol], marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394", baseDecimals, quoteDecimals: 18, tick, lot, minimum }, mark: price, bid: price, ask: price, fundingRate: "0", fundingWindowSec: 28800, bookBlock: "1", bids: [], asks: [] };
};
const snapshot = (long: Asset, short: Asset) => ({ mode: "testnet", checkedAt: new Date(0).toISOString(), chainId: 50383, pair: `${long}/${short}`, markets: [market(long), market(short)] });
async function marketsRoute(page: Page, delayFor?: Asset) {
  await page.route(/\/api\/markets(\?|$)/, async (route: Route) => {
    const url = new URL(route.request().url());
    const long = (url.searchParams.get("long") ?? "ETH") as Asset, short = (url.searchParams.get("short") ?? "BTC") as Asset;
    if (long === delayFor) await new Promise(r => setTimeout(r, 1500));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(snapshot(long, short)) }).catch(() => {});
  });
}
const strip = (page: Page) => page.getByLabel(/market snapshot|Simulated prices/);

test.describe("simulation", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Injected offline condition for UI testing." }) }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
  });

  test("preset and swap choose the legs; a simulated pair opens, locks the selector and closes on its own markets", async ({ page }) => {
    await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
    await expect(page.getByLabel("Pair ticket")).toContainText("Long HYPE / Short SOL");
    await expect(strip(page)).toContainText("HYPE-PERP · Fixed price");
    await expect(strip(page)).toContainText("FIXED SIMULATED PRICES");
    await page.getByRole("button", { name: "⇄ Swap direction" }).click();
    await expect(page.getByLabel("Pair", { exact: true }).locator("option:checked")).toHaveText("SOL / HYPE (swapped)");
    await expect(page.getByLabel("Pair ticket")).toContainText("Long SOL / Short HYPE");
    await page.getByRole("button", { name: "Preview pair", exact: true }).click();
    await expect(page.getByText("Sequential: SOL long, then HYPE short", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
    await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
    await expect(page.locator(".card .market")).toHaveText(["SOL-PERP", "HYPE-PERP"]);
    await expect(page.getByLabel("Pair", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Pair ticket")).toContainText("Pair active · SOL/HYPE");
    await page.getByRole("button", { name: "Close pair", exact: true }).click();
    await expect(page.getByLabel("Close orders")).toContainText("SOL-PERP");
    await expect(page.getByLabel("Close orders")).toContainText("HYPE-PERP");
    await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
    await expect(page.getByText("Flat", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New pair", exact: true }).click();
    await expect(page.getByLabel("Pair", { exact: true })).toBeEnabled();
  });

  test("a residual below the market minimum is explained and close is disabled, not a dead end", async ({ page }) => {
    await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
    await page.getByLabel("Failure scenario").selectOption("partial");
    await page.getByRole("button", { name: "Preview pair", exact: true }).click();
    await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
    await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
    await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
    await expect(page.getByText("Residual exposure", { exact: true })).toBeVisible();
    await expect(page.locator(".card", { hasText: "SOL-PERP" }).locator(".chip")).toHaveText("Below minimum");
    await expect(page.getByText("This amount is below the market minimum. No order can close it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close remaining exposure", exact: true })).toBeDisabled();
    await expect(page.getByText("Flat", { exact: true })).toHaveCount(0);
  });

  test("changing the pair discards an open preview", async ({ page }) => {
    await page.getByRole("button", { name: "Preview pair", exact: true }).click();
    await expect(page.getByText("Review pair", { exact: true })).toBeVisible();
    await page.getByLabel("Pair", { exact: true }).selectOption({ label: "SOL / BTC" });
    await expect(page.getByText("Review pair", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Long SOL and short BTC in one plan.", { exact: false })).toBeVisible();
  });

  test("after reload, recovery follows the journal's markets even when the remembered selection differs", async ({ page }) => {
    await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
    await page.getByLabel("Failure scenario").selectOption("second-rejected");
    await page.getByRole("button", { name: "Preview pair", exact: true }).click();
    await page.getByRole("button", { name: "Execute simulation", exact: true }).click();
    await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
    await expect(page.locator(".card", { hasText: "SOL-PERP" }).locator(".chip")).toHaveText("Signature rejected");
    await page.evaluate(() => localStorage.setItem("pairpilot:pair", JSON.stringify({ long: "ETH", short: "BTC" })));
    await page.reload();
    await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
    await expect(page.locator(".card .market")).toHaveText(["HYPE-PERP", "SOL-PERP"]);
    await expect(page.getByLabel("Pair ticket")).toContainText("Pair active · HYPE/SOL");
    await page.getByRole("button", { name: "Close remaining exposure", exact: true }).click();
    await expect(page.getByLabel("Close orders")).toContainText("HYPE-PERP");
    await expect(page.getByLabel("Close orders")).not.toContainText("ETH-PERP");
    await page.getByRole("button", { name: "Execute simulated close", exact: true }).click();
    await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  });
});

test("a slow read for the previous pair never replaces the selected pair's markets", async ({ page }) => {
  await marketsRoute(page, "ETH");
  await page.goto("/");
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
  await expect(strip(page)).toContainText("HYPE-PERP · Mark");
  await page.waitForTimeout(2000); // the delayed ETH/BTC response arrives here and must be dropped
  await expect(strip(page)).toContainText("HYPE-PERP · Mark");
  await expect(strip(page)).not.toContainText("ETH-PERP");
});

test("linked wallet: a missing grant on either selected pool blocks preview", async ({ page }) => {
  const signer = getAddress("0x00000000000000000000000000000000000000a1"), owner = "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5";
  const selector = toFunctionSelector("function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)");
  await page.addInitScript(addr => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => method === "eth_requestAccounts" || method === "eth_accounts" ? [addr] : method === "eth_chainId" ? "0xc4cf" : method === "wallet_switchEthereumChain" ? null : (() => { throw { code: 4200, message: `mock: ${method}` }; })(),
      on: () => {}, removeListener: () => {},
    };
  }, signer);
  await marketsRoute(page);
  // The owner linked this signer on every pool EXCEPT SOL.
  await page.route(/hideki2\.infra\.testnet\.somnia\.network/, async route => {
    const body = route.request().postDataJSON() as { id: number; method: string; params: [{ to: string; data: string }] };
    if (body.method === "eth_call" && body.params[0].data.startsWith(selector)) {
      const ok = body.params[0].to.toLowerCase() !== POOLS.SOL;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: `0x${(ok ? 1 : 0).toString(16).padStart(64, "0")}` }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "offline in UI test" } }) });
  });
  await page.route(/smk\.somnia\.host/, route => route.abort());
  await page.routeWebSocket(/hideki2\.infra\.testnet\.somnia\.network/, ws => ws.close());
  await page.goto("/");
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("radio", { name: "Linked wallet", exact: true }).click();
  await page.getByLabel("Trading owner · full app-wallet address").fill(owner);
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  const perms = page.getByLabel("Operator permissions");
  await expect(perms.locator(".line", { hasText: "BTC-PERP" })).toContainText("Can place");
  await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
  await expect(perms.locator(".line", { hasText: "HYPE-PERP" })).toContainText("Can place");
  await expect(perms.locator(".line", { hasText: "SOL-PERP" })).toContainText("Cannot place");
  await expect(page.getByText("Signer is not linked for SOL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "⇄ Swap direction" }).click();
  await expect(perms.locator(".line", { hasText: "SOL-PERP" })).toContainText("Cannot place");
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
  await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / ETH" });
  await expect(perms.locator(".line", { hasText: "ETH-PERP" })).toContainText("Can place");
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
});

test("a pair chosen in Simulation shows that pair's live books after switching to Testnet", async ({ page }) => {
  await marketsRoute(page);
  await page.goto("/");
  await page.getByLabel("Pair", { exact: true }).selectOption({ label: "HYPE / SOL" });
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await expect(strip(page)).toContainText("HYPE-PERP · Mark");
  await expect(strip(page)).toContainText("SOL-PERP · Mark");
  await expect(strip(page)).not.toContainText("ETH-PERP");
});
