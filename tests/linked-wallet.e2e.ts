import { expect, test, type Page } from "@playwright/test";
import { getAddress, toFunctionSelector } from "viem";

// Synthetic browser wallet and chain responses: no real network, keys or signatures.
const SIGNER = getAddress("0x00000000000000000000000000000000000000a1");
const OTHER_SIGNER = getAddress("0x00000000000000000000000000000000000000a2");
const LINKED_OWNER = "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5";
const PARTIAL_OWNER = getAddress("0x00000000000000000000000000000000000000b2");
const ETH_POOL = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", BTC_POOL = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0";
const IS_AUTHORIZED = toFunctionSelector("function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)");
const market = (symbol: string, pool: string, baseDecimals: number, tick: string, lot: string, minimum: string, price: string) => ({
  market: { symbol, pool, marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394", baseDecimals, quoteDecimals: 18, tick, lot, minimum },
  mark: price, bid: price, ask: price, fundingRate: "0", fundingWindowSec: 28800, bookBlock: "1", bids: [], asks: [],
});
const snapshot = { mode: "testnet", checkedAt: new Date(0).toISOString(), chainId: 50383, markets: [
  market("ETH", ETH_POOL, 18, "10000000000000000", "100000000000000", "4000000000000000", "2400000000000000000000"),
  market("BTC", BTC_POOL, 8, "100000000000000000", "1000", "13000", "82000000000000000000000"),
] };

async function setup(page: Page, signer = SIGNER) {
  await page.addInitScript(addr => {
    const listeners: Record<string, ((v: unknown) => void)[]> = {};
    (window as unknown as { __signer: string }).__signer = addr;
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        const signerNow = (window as unknown as { __signer: string }).__signer;
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [signerNow];
        if (method === "eth_chainId") return "0xc4cf";
        if (method === "wallet_switchEthereumChain") return null;
        throw Object.assign(new Error(`mock wallet: ${method} unsupported`), { code: 4200 });
      },
      on: (event: string, fn: (v: unknown) => void) => { (listeners[event] ??= []).push(fn); },
      removeListener: () => {},
    };
    (window as unknown as { __emit: (e: string, v: unknown) => void }).__emit = (event, value) => (listeners[event] ?? []).forEach(fn => fn(value));
  }, signer);
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ contentType: "application/json", body: JSON.stringify(snapshot) }));
  // Pool permissions: LINKED_OWNER granted this signer both pools; PARTIAL_OWNER only ETH. Every other chain read fails.
  await page.route(/hideki2\.infra\.testnet\.somnia\.network/, async route => {
    const body = route.request().postDataJSON() as { id: number; method: string; params: [{ to: string; data: string }] };
    const reply = (result: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    if (body.method === "eth_chainId") return reply("0xc4cf");
    if (body.method === "eth_call" && body.params[0].data.startsWith(IS_AUTHORIZED)) {
      const owner = getAddress(`0x${body.params[0].data.slice(10 + 24, 10 + 64)}`), pool = body.params[0].to.toLowerCase();
      const ok = owner === LINKED_OWNER || (owner === getAddress(PARTIAL_OWNER) && pool === ETH_POOL);
      return reply(`0x${(ok ? 1 : 0).toString(16).padStart(64, "0")}`);
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "offline in UI test" } }) });
  });
  await page.route(/smk\.somnia\.host/, route => route.abort());
  await page.routeWebSocket(/somnia/, ws => ws.close());
  await page.goto("/");
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
}
async function connectLinked(page: Page, owner?: string) {
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  // A fresh browser starts on Own wallet, shown compact; Change opens the choice.
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("radio", { name: "Linked wallet", exact: true }).click();
  if (owner) { await page.getByLabel("Trading owner · full app-wallet address").fill(owner); await page.getByRole("button", { name: "Use this owner", exact: true }).click(); }
}
const seed = (page: Page, record: object, owner: string) => page.evaluate(([r, o]) => {
  const rec = r as { plan: { id: string } };
  localStorage.setItem(`pairpilot:record:${rec.plan.id}`, JSON.stringify(rec));
  localStorage.setItem(`pairpilot:active:testnet:${(o as string).toLowerCase()}`, rec.plan.id);
}, [record, owner] as const);
function testnetRecord(owner: string, signer: string, status: string, positions: [string, string]) {
  return { version: 1, status, positions, operations: [], events: [{ at: 1, message: "seeded journal for UI test" }], plan: { id: `seed-${status}-${signer.slice(-2)}`, account: owner, signer, chainId: 50383, mode: "testnet", createdAt: 1, expiresAt: 2, slippageBps: 30,
    legs: [{ market: snapshot.markets[0].market, side: "long", quantity: "10300000000000000", limitPrice: "2410000000000000000000", referencePrice: "2400000000000000000000" },
      { market: snapshot.markets[1].market, side: "short", quantity: "30000", limitPrice: "81700000000000000000000", referencePrice: "82000000000000000000000" }] } };
}

test("linked wallet needs a full owner, never the signer itself, and a grant on BOTH pools", async ({ page }) => {
  await setup(page);
  await connectLinked(page);
  await expect(page.getByText("Enter and apply the trading owner", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
  await page.getByLabel("Trading owner · full app-wallet address").fill("0x436d…c1F5");
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "FULL" })).toBeVisible();
  await page.getByLabel("Trading owner · full app-wallet address").fill(SIGNER);
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "signer's own address" })).toBeVisible();
  await page.getByLabel("Trading owner · full app-wallet address").fill(PARTIAL_OWNER);
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  const perms = page.getByLabel("Operator permissions");
  await expect(perms).toContainText("ETH-PERP");
  await expect(perms.locator(".line", { hasText: "ETH-PERP" })).toContainText("Can place");
  await expect(perms.locator(".line", { hasText: "BTC-PERP" })).toContainText("Cannot place");
  await expect(page.getByRole("alert").filter({ hasText: "not linked for BTC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
  await expect(page.getByText("Signer is not linked for BTC", { exact: true })).toBeVisible();
});

test("owner and signer are shown apart; a wallet account change drops the session", async ({ page }) => {
  await setup(page);
  await connectLinked(page, LINKED_OWNER);
  const perms = page.getByLabel("Operator permissions");
  await expect(perms.locator(".line", { hasText: "ETH-PERP" })).toContainText("Can place");
  await expect(perms.locator(".line", { hasText: "BTC-PERP" })).toContainText("Can place");
  await expect(page.getByLabel("Owner account")).toContainText("0x436d…c1F5");
  await expect(page.getByLabel("Signer account")).toContainText(`${SIGNER.slice(0, 6)}…${SIGNER.slice(-4)}`);
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeEnabled();
  await page.evaluate(([next]) => { (window as unknown as { __signer: string }).__signer = next; (window as unknown as { __emit: (e: string, v: unknown) => void }).__emit("accountsChanged", [next]); }, [OTHER_SIGNER]);
  await expect(page.getByRole("alert").filter({ hasText: "Wallet account changed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
});

test("each owner sees only its own pair; changing owner is locked while a pair is open", async ({ page }) => {
  await setup(page);
  await seed(page, testnetRecord(LINKED_OWNER, SIGNER, "flat", ["0", "0"]), LINKED_OWNER);
  await connectLinked(page, LINKED_OWNER);
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  await expect(page.getByText("Linked wallet · owner", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByLabel("Trading owner · full app-wallet address").fill(PARTIAL_OWNER);
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  await expect(page.getByText("Trade the pair. Track every leg.", { exact: true })).toBeVisible();
  await seed(page, testnetRecord(LINKED_OWNER, SIGNER, "paired", ["10300000000000000", "-30000"]), LINKED_OWNER);
  await page.getByLabel("Trading owner · full app-wallet address").fill(LINKED_OWNER);
  await page.getByRole("button", { name: "Use this owner", exact: true }).click();
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeDisabled();
  await expect(page.getByText("Resolve or close the active pair before changing who trades.", { exact: true })).toBeVisible();
});

test("a pair opened by another signer is shown but cannot be closed or reconciled from this one", async ({ page }) => {
  await setup(page);
  await seed(page, testnetRecord(LINKED_OWNER, OTHER_SIGNER, "paired", ["10300000000000000", "-30000"]), LINKED_OWNER);
  await connectLinked(page, LINKED_OWNER);
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  await expect(page.getByText("This pair belongs to another signer.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close pair", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reconcile", exact: true })).toBeDisabled();
});

test("disconnect hides the owner's pair; reconnecting the same signer and owner restores it from the journal", async ({ page }) => {
  await setup(page);
  await seed(page, testnetRecord(LINKED_OWNER, SIGNER, "paired", ["10300000000000000", "-30000"]), LINKED_OWNER);
  await connectLinked(page, LINKED_OWNER);
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
  await expect(page.getByText("Pair open", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /changed|object Object/ })).toHaveCount(0);
  // The owner stays in the field, so reconnecting the same signer re-applies it and restores the pair.
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByText("Pair open", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeDisabled();
});
