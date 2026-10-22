import { expect, test, type Page } from "@playwright/test";

// Mock EIP-1193 wallets that fail the way real extensions do: with plain objects, not Errors.
type Behaviour = "wrapped-unknown-chain" | "reject-accounts" | "stays-on-shannon";
async function open(page: Page, behaviour: Behaviour) {
  await page.addInitScript(mode => {
    let chain = "0xc488"; // Shannon 50312 until switched
    const added: string[] = [];
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method, params }: { method: string; params?: { chainId?: string }[] }) => {
        if (method === "eth_requestAccounts") {
          if (mode === "reject-accounts") throw { code: 4001, message: "User rejected the request." };
          return ["0x00000000000000000000000000000000000000A1"];
        }
        if (method === "eth_accounts") return ["0x00000000000000000000000000000000000000A1"];
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain") {
          const target = params![0].chainId!;
          if (mode === "stays-on-shannon") return null;
          if (!added.includes(target)) throw { code: -32603, message: "Internal JSON-RPC error.", data: { originalError: { code: 4902, message: `Unrecognized chain ID "${target}".` } } };
          chain = target; return null;
        }
        if (method === "wallet_revokePermissions") { (window as unknown as { __revoked: boolean }).__revoked = true; return null; }
        if (method === "wallet_addEthereumChain") { added.push(params![0].chainId!); (window as unknown as { __added: unknown }).__added = params![0]; return null; }
        throw { code: 4200, message: `mock wallet: ${method} unsupported` };
      },
      on: () => {}, removeListener: () => {},
    };
  }, behaviour);
  await page.route(/\/api\/markets(\?|$)/, route => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Injected offline condition for UI testing." }) }));
  await page.routeWebSocket(/hideki2.infra.testnet.somnia.network/, ws => ws.close());
  await page.route(/hideki2.infra.testnet.somnia.network|smk.somnia.host/, route => route.abort());
  await page.goto("/");
  await page.getByRole("radio", { name: "Testnet", exact: true }).click();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
}

test("adds Somnia Tokyo when the wallet reports an unknown chain wrapped in an internal error", async ({ page }) => {
  await open(page, "wrapped-unknown-chain");
  await expect(page.locator(".addr")).toContainText("0x0000…00A1");
  const added = await page.evaluate(() => (window as unknown as { __added: { chainId: string; rpcUrls: string[] } }).__added);
  expect(added.chainId).toBe("0xc4cf");
  expect(added.rpcUrls[0]).toContain("hideki2");
  await expect(page.getByText("[object Object]")).toHaveCount(0);
});

test("shows a readable message when the wallet rejects the connection", async ({ page }) => {
  await open(page, "reject-accounts");
  await expect(page.getByRole("alert").filter({ hasText: "rejected in the wallet" })).toBeVisible();
  await expect(page.getByText("[object Object]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
});

test("refuses to connect while the wallet is still on another network", async ({ page }) => {
  await open(page, "stays-on-shannon");
  await expect(page.getByRole("alert").filter({ hasText: "not Somnia Tokyo (50383)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
});

test("disconnect drops the signer session and asks the wallet to revoke access", async ({ page }) => {
  await open(page, "wrapped-unknown-chain");
  await expect(page.locator(".addr")).toContainText("0x0000…00A1");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
  await expect(page.locator(".addr")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /changed|object Object/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __revoked?: boolean }).__revoked)).toBe(true);
  await expect(page.getByRole("button", { name: "Preview pair", exact: true })).toBeDisabled();
});
