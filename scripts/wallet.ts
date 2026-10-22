import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { claimVoucher, type ClaimAttempt } from "../src/adapters/voucher.js";
import { createMarkets, hidekiTestnet, NETWORK } from "../src/lib/network.js";

const attemptsFile = "evidence/voucher-claims.json";
async function recordAttempt(attempt: ClaimAttempt) {
  await mkdir("evidence", { recursive: true });
  const log = existsSync(attemptsFile) ? JSON.parse(await readFile(attemptsFile, "utf8")) as { attempts: ClaimAttempt[] } : { attempts: [] };
  log.attempts.push(attempt);
  await writeFile(attemptsFile, JSON.stringify(log, null, 2) + "\n");
}

const command = process.argv[2] ?? "status";
if (command === "init") {
  if (existsSync(".env.local")) throw new Error(".env.local already exists. Kept the existing key/configuration; no replacement created.");
  const key = generatePrivateKey(), account = privateKeyToAccount(key);
  await writeFile(".env.local", `# Dedicated Somnia Tokyo testnet wallet. NEVER commit or share.\nPAIRPILOT_PRIVATE_KEY=${key}\n`, { flag: "wx", mode: 0o600 });
  console.log(`Created ONE testnet wallet: ${account.address}\nPrivate key stored only in ignored .env.local. Fund this address with Tokyo STT, then run npm run wallet:status.\nDo not send the key in chat. No transactions sent.`);
} else {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const key = process.env.PAIRPILOT_PRIVATE_KEY;
  if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error("Run npm run wallet:init first, or set PAIRPILOT_PRIVATE_KEY locally.");
  const account = privateKeyToAccount(key as Hex);
  const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc) });
  const exchange = createMarkets({ privateKey: key as Hex });
  try {
    if (await rpc.getChainId() !== NETWORK.id) throw new Error("RPC chain mismatch. No transaction sent.");
    const all = await exchange.client.listPerpMarkets();
    const eth = all.find(m => m.baseSymbol === "ETH");
    if (!eth) throw new Error("ETH perp unavailable.");
    const gas = await rpc.getBalance({ address: account.address });
    const [margin, voucher] = await Promise.all([exchange.client.getMarginAccount(eth.marginBank, account.address), exchange.client.getPerpVoucherEligibility(eth.marginBank, account.address)]);
    console.log(JSON.stringify({ network: NETWORK.name, chainId: NETWORK.id, account: account.address, gasSTT: formatEther(gas), equityUSDso: formatUnits(margin.equity, eth.quoteDecimals), activePositions: margin.activePerpPools, voucher }, (_k, value) => typeof value === "bigint" ? String(value) : value, 2));
    if (command === "claim") {
      if (gas === 0n) throw new Error("Fund this address with STT on Tokyo before claiming.");
      if (!voucher.eligible) throw new Error("Wallet is not eligible for the one-time voucher. No claim sent.");
      // The SDK eligibility read can say eligible while claim() reverts (seen on Tokyo, 2026-10-22), so simulate first.
      const wallet = createWalletClient({ account, chain: hidekiTestnet, transport: http(NETWORK.rpc) });
      const result = await claimVoucher({
        build: async () => { const c = await exchange.trader.buildClaimPerpVoucher({ marginBank: eth.marginBank }); return { to: c.to, data: c.data, value: c.value }; },
        simulate: async call => { await rpc.call({ ...call, account: account.address }); },
        send: async call => wallet.sendTransaction({ ...call, account, chain: hidekiTestnet, gas: await rpc.estimateGas({ ...call, account: account.address }) * 125n / 100n }),
        receipt: hash => rpc.waitForTransactionReceipt({ hash, timeout: 45_000 }),
        record: recordAttempt,
      }, { chainId: NETWORK.id, account: account.address });
      if (result.hash) console.log(`Explorer: ${NETWORK.explorer}/tx/${result.hash}`);
      if (result.outcome === "simulation-reverted") throw new Error(`Claim simulation reverted${result.revertData ? ` with ${result.revertData}` : ""}. No transaction sent. Recorded in ${attemptsFile}.`);
      if (result.outcome === "unknown") { process.exitCode = 2; throw new Error(`Claim ${result.hash} has no receipt yet. Do NOT claim again; re-check wallet:status. Recorded in ${attemptsFile}.`); }
      if (result.outcome !== "success") throw new Error(`Voucher transaction reverted: ${result.hash}. Recorded in ${attemptsFile}.`);
      await writeFile("evidence/voucher-claim.json", JSON.stringify(result, null, 2) + "\n");
      console.log("Claim confirmed. Run wallet:status to verify credited margin.");
    } else if (command !== "status") throw new Error("Use init, status or claim.");
  } finally { await exchange.close(); }
}
// SDK socket retirement can take time on Node; all work is complete before exiting.
