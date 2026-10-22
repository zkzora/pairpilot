import { expect, test, type Page } from "@playwright/test";
import { getAddress, toFunctionSelector } from "viem";

// Mock wallet + mocked chain reads only: registry grant logs, the pool's registry address and permissions.
const SIGNER = getAddress("0x00000000000000000000000000000000000000a1");
const OWNER = "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5";
const REGISTRY = "0x6b2fbfed328ff5f20c0be7d3c3437613affe8d3a";
const ETH = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", BTC = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0";
const IS_AUTHORIZED = toFunctionSelector("function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)");
const GET_REGISTRY = toFunctionSelector("function getOperatorPermissionsRegistry() view returns (address)");
const GRANT_BLOCK = 996_500;
const word = (hex: string) => `0x${hex.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
const market = (symbol: string, pool: string, baseDecimals: number, price: string) => ({ market: { symbol, pool, marginBank: "0x478769e1177c0773c43a593dccc4ad15f15f1394", baseDecimals, quoteDecimals: 18, tick: "10000000000000000", lot: "1000", minimum: "13000" }, mark: price, bid: price, ask: price, fundingRate: "0", fundingWindowSec: 28800, bookBlock: "1", bids: [], asks: [] });

// A short chain for the no-grant case lets the scan reach genesis quickly under request interception.
async function open(page: Page, linked: boolean, HEAD = 1_000_000) {
  await page.addInitScript(addr => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => method === "eth_requestAccounts" || method === "eth_accounts" ? [addr] : method === "eth_chainId" ? "0xc4cf" : method === "wallet_switchEthereumChain" ? null : (() => { throw { code: 4200, message: `mock: ${method}` }; })(),
      on: () => {}, removeListener: () => {},
    };
  }, SIGNER);
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "testnet", checkedAt: new Date(0).toISOString(), chainId: 50383, pair: "ETH/BTC", markets: [market("ETH", ETH, 18, "2400000000000000000000"), market("BTC", BTC, 8, "82000000000000000000000")] }) }));
  await page.route(/hideki2\.infra\.testnet\.somnia\.network/, async route => {
    const body = route.request().postDataJSON() as { id: number; method: string; params: [{ to?: string; data?: string; fromBlock?: string; toBlock?: string; address?: string; topics?: (string | null)[] }] };
    const reply = (result: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    if (body.method === "eth_chainId") return reply("0xc4cf");
    if (body.method === "eth_blockNumber") return reply(`0x${HEAD.toString(16)}`);
    if (body.method === "eth_getLogs") {
      const q = body.params[0], from = parseInt(q.fromBlock!, 16), to = parseInt(q.toBlock!, 16);
      const ours = linked && q.address?.toLowerCase() === REGISTRY && q.topics?.[3] === word(SIGNER) && from <= GRANT_BLOCK && GRANT_BLOCK <= to;
      return reply(ours ? [ETH, BTC].map(pool => ({ address: REGISTRY, topics: ["0x10f879368ceb20c35c69315bc27ed8488f731570cf213d3e1bc2ad9b7749de28", word(pool), word(OWNER), word(SIGNER)], data: `0x80054449${"0".repeat(56)}${word("1").slice(2)}`, blockNumber: `0x${GRANT_BLOCK.toString(16)}`, logIndex: "0x0", transactionHash: word("ab"), blockHash: word("cd"), transactionIndex: "0x0", removed: false })) : []);
    }
    if (body.method === "eth_call" && body.params[0].data === GET_REGISTRY) return reply(word(REGISTRY));
    if (body.method === "eth_call" && body.params[0].data?.startsWith(IS_AUTHORIZED)) {
      const owner = getAddress(`0x${body.params[0].data.slice(34, 74)}`);
      return reply(word(linked && owner === OWNER ? "1" : "0"));
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
}

test("a linked browser signer finds its app wallet and applies it with one click", async ({ page }) => {
  await open(page, true);
  const found = page.getByLabel("Linked app wallets");
  // Discovery is several sequential reads (markets, registry, head, log windows, permissions); allow for a loaded machine.
  await expect(found).toContainText("Linked by app wallet 0x436d…c1F5", { timeout: 15_000 });
  await page.getByRole("button", { name: "Trade this app wallet", exact: true }).click();
  await expect(page.getByLabel("Owner account")).toContainText("0x436d…c1F5");
  const perms = page.getByLabel("Operator permissions");
  await expect(perms.locator(".line", { hasText: "ETH-PERP" })).toContainText("Can place");
  await expect(perms.locator(".line", { hasText: "BTC-PERP" })).toContainText("Can place");
  await expect(page.getByText("LINKED WALLET", { exact: true })).toBeVisible();
});

test("a signer with no Link a Bot grant is told so, and nothing is offered or applied", async ({ page }) => {
  await open(page, false, 20_000);
  const found = page.getByLabel("Linked app wallets");
  await expect(found).toContainText("No Link a Bot grant for this signer");
  await expect(page.getByRole("button", { name: "Trade this app wallet", exact: true })).toHaveCount(0);
  await expect(page.getByText("Enter and apply the trading owner", { exact: true })).toBeVisible();
});
