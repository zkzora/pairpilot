import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, decodeFunctionData, formatEther, formatUnits, http, type Hash } from "viem";
import { decodePlaceOrder } from "@somnia-chain/markets-sdk";
import { operatorAbi } from "../src/adapters/operator.js";
import type { PairRecord } from "../src/core/types.js";
import { createMarkets, hidekiTestnet, NETWORK } from "../src/lib/network.js";

/**
 * Read-only proof for one testnet pair journal (CLI file or browser export):
 * every recorded transaction's receipt, sender, order owner, fills and price bound,
 * its explorer page, and the owner's final positions in the journal's OWN markets.
 * Usage: npm run verify -- evidence/testnet-pair-<id>.json [label]
 */
const [file, label = "pair"] = process.argv.slice(2);
if (!file) throw new Error("Usage: npm run verify -- <pair journal JSON> [label]");
const record = JSON.parse(await readFile(file, "utf8")) as PairRecord;
if (record.plan.mode !== "testnet") throw new Error("Only testnet journals have transactions to verify. Simulation hashes are synthetic.");
const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc) });
const owner = record.plan.account, signer = record.plan.signer ?? record.plan.account;
const problems: string[] = [];
const transactions = [];
for (const op of record.operations) {
  const leg = record.plan.legs[op.leg];
  const step = `${op.kind} ${leg.market.symbol} ${op.side}`;
  if (!op.hash) { transactions.push({ step, status: op.status, note: "no transaction hash recorded (not broadcast)", message: op.message }); continue; }
  const hash = op.hash as Hash;
  const [tx, receipt] = await Promise.all([rpc.getTransaction({ hash }), rpc.getTransactionReceipt({ hash })]);
  const fills = decodePlaceOrder(receipt, leg.market.pool as `0x${string}`).fills;
  const filled = fills.reduce((s, f) => s + f.quantityFilled, 0n), quote = fills.reduce((s, f) => s + f.quantityFilled * f.fillPrice, 0n);
  const avg = filled ? quote / filled : null;
  let orderOwner: string = tx.from;
  try { const call = decodeFunctionData({ abi: operatorAbi, data: tx.input }); if (call.functionName === "placeOrderFor") orderOwner = call.args[0] as string; } catch { /* own-wallet placeOrder */ }
  const inBound = avg === null || (op.side === "long" ? avg <= BigInt(op.limitPrice) : avg >= BigInt(op.limitPrice));
  const url = `${NETWORK.explorer}/tx/${hash}`;
  const page = await fetch(url).then(async r => ({ http: r.status, showsHash: (await r.text()).toLowerCase().includes(hash.slice(2, 22)) })).catch(e => ({ http: 0, showsHash: false, error: String(e) }));
  const checks = { success: receipt.status === "success", sentBySigner: tx.from.toLowerCase() === signer.toLowerCase(), ownerInOrder: orderOwner.toLowerCase() === owner.toLowerCase(), journalFillMatches: String(filled) === op.filled, fillsInsideBound: inBound, explorerPage: page.http === 200 && page.showsHash };
  for (const [k, ok] of Object.entries(checks)) if (!ok) problems.push(`${step}: ${k} failed`);
  transactions.push({ step, hash, explorer: url, block: String(receipt.blockNumber), from: tx.from, to: tx.to, orderOwner, limitPrice: formatUnits(BigInt(op.limitPrice), leg.market.quoteDecimals), filled: formatUnits(filled, leg.market.baseDecimals), avgFillPrice: avg === null ? null : formatUnits(avg, leg.market.quoteDecimals), gasUsed: String(receipt.gasUsed), checks });
}
const markets = createMarkets();
const final: Record<string, unknown> = {};
try {
  final.readAfterBlock = String(await rpc.getBlockNumber());
  for (const leg of record.plan.legs) final[`${leg.market.symbol} owner position`] = formatUnits((await markets.client.getPerpPosition({ pool: leg.market.pool as `0x${string}`, marginBank: leg.market.marginBank as `0x${string}`, account: owner as `0x${string}` })).size, leg.market.baseDecimals);
  const bank = await markets.client.getMarginAccount(record.plan.legs[0].market.marginBank as `0x${string}`, owner as `0x${string}`);
  Object.assign(final, { ownerEquityUSDso: formatUnits(bank.equity, 18), ownerActivePerpPools: bank.activePerpPools.length, signerGasSTT: formatEther(await rpc.getBalance({ address: signer as `0x${string}` })) });
} finally { await markets.close(); }
const flat = record.plan.legs.every(l => final[`${l.market.symbol} owner position`] === "0");
const proof = { mode: "testnet", kind: `read-only verification: ${label}`, verifiedAt: new Date().toISOString(), chainId: NETWORK.id, planId: record.plan.id, journal: file, pair: `${record.plan.legs[0].market.symbol}/${record.plan.legs[1].market.symbol}`, owner, signer, execution: owner.toLowerCase() === signer.toLowerCase() ? "own" : "operator", journalStatus: record.status, events: record.events.map(e => e.message), transactions, finalReadback: final, ownerFlatInJournalMarkets: flat, problems };
const out = `evidence/${label}-proof-${record.plan.id}.json`;
await writeFile(out, JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify({ out, pair: proof.pair, journalStatus: record.status, ownerFlatInJournalMarkets: flat, transactions: transactions.map(t => [t.step, "checks" in t && t.checks ? Object.values(t.checks).every(Boolean) : t.note, "avgFillPrice" in t ? t.avgFillPrice : null]), final, problems }, null, 1));
if (problems.length || !flat) process.exitCode = 2;
