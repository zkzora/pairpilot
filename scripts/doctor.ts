import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { createMarkets, hidekiTestnet, NETWORK } from "../src/lib/network.js";
import { ASSETS } from "../src/core/pairs.js";

const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), network: NETWORK, sdk: "0.32.1", signedTransactions: 0 };
const markets = createMarkets();
const timer = setTimeout(() => { console.error("Doctor timed out after 45 seconds; no transactions sent."); process.exit(1); }, 45_000);
try {
  const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc, { timeout: 12_000, retryCount: 1 }) });
  report.chainId = await rpc.getChainId();
  if (report.chainId !== NETWORK.id) throw new Error("RPC returned a different chain ID");
  report.block = String(await rpc.getBlockNumber());
  const all = await markets.client.listPerpMarkets();
  report.marketCount = all.length;
  // Every supported asset; pairs are formed from these at runtime.
  report.assets = await Promise.all(all.filter(m => (ASSETS as readonly string[]).includes(m.baseSymbol ?? "")).map(async m => {
    const [state, system] = await Promise.all([markets.client.getPerpState(m.poolAddress), markets.client.getPerpSystemConfig(m.marginBank)]);
    return { symbol: m.baseSymbol, pool: m.poolAddress, marginBank: m.marginBank, baseDecimals: m.baseDecimals, quoteDecimals: m.quoteDecimals, tickSize: m.tickSize, lotSize: m.lotSize, minQuantity: m.minQuantity, mark: String(state.markPrice), priceable: state.markPriceOk, fundingRate: String(state.fundingRate), fundingWindowSec: state.fundingWindowSec, fullyWired: system.fullyWired };
  }));
  report.status = "ok";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await markets.close();
  clearTimeout(timer);
  await mkdir("evidence", { recursive: true });
  await writeFile("evidence/testnet-doctor.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
