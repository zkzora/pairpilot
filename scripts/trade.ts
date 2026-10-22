import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWalletClient, formatEther, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DreamdexVenue, readSnapshot } from "../src/adapters/dreamdex.js";
import { FileJournal } from "../src/adapters/file-journal.js";
import { PairEngine, RejectedOrder } from "../src/core/engine.js";
import { assertDepth, assertSnapshotPair, makePlan } from "../src/core/planner.js";
import { DEFAULT_PAIR, journalPair, pairLabel, parsePair } from "../src/core/pairs.js";
import type { MarketSpec, OrderIntent, PairPlan, Venue } from "../src/core/types.js";
import { hidekiTestnet, NETWORK } from "../src/lib/network.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const key = process.env.PAIRPILOT_PRIVATE_KEY;
if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error("Set up a dedicated wallet with npm run wallet:init. Never paste a key into chat.");
// The bot kit's bare OWNER_ADDRESS is refused so a stray shell variable cannot silently redirect trading.
if (process.env.OWNER_ADDRESS) throw new Error("Use --owner=0x… or PAIRPILOT_OWNER_ADDRESS for linked-wallet operator trading; bare OWNER_ADDRESS is not read.");
const ownerArg = process.argv.find(a => a.startsWith("--owner="))?.slice("--owner=".length) ?? process.env.PAIRPILOT_OWNER_ADDRESS;
const pairArg = process.argv.find(a => a.startsWith("--pair="))?.slice("--pair=".length) ?? process.env.PAIRPILOT_PAIR;
// The selector only chooses NEW pairs (check/preview). Recovery always uses the journal's own markets.
const pair = pairArg ? parsePair(pairArg) : DEFAULT_PAIR;
const account = privateKeyToAccount(key as Hex);
const venue = new DreamdexVenue(createWalletClient({ account, chain: hidekiTestnet, transport: http(NETWORK.rpc) }), ownerArg);
const { owner, signer, mode: execution } = venue.execution;
// Recovery testing only, never on by default: a labeled stand-in for a rejected second signature.
const inject = process.argv.find(a => a.startsWith("--inject="))?.slice("--inject=".length);
if (inject !== undefined && inject !== "withhold-second-leg") throw new Error("The only fault injection is --inject=withhold-second-leg.");
const command0 = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "preview";
if (inject && command0 !== "open") throw new Error("--inject=withhold-second-leg applies to open only.");
function withholdSecondLeg(inner: DreamdexVenue): Venue {
  return {
    mode: inner.mode, account: inner.account, signer: inner.signer,
    positions: plan => inner.positions(plan), assertReady: plan => inner.assertReady(plan), prepare: (plan, order) => inner.prepare(plan, order),
    receipt: (plan, order) => inner.receipt(plan, order), closePrice: (plan, leg, side) => inner.closePrice(plan, leg, side),
    // Leg 2 passes every pre-send check, then is NOT broadcast: the same outcome as a wallet rejection.
    send: (plan, order, onHash) => order.kind === "open" && order.leg === 1
      ? Promise.reject(new RejectedOrder("INJECTED FAULT (--inject=withhold-second-leg): the second leg was deliberately not sent, standing in for a rejected wallet signature. No order sent."))
      : inner.send(plan, order, onHash),
  };
}
const journal = new FileJournal(), engine = new PairEngine(inject ? withholdSecondLeg(venue) : venue, journal);
const command = command0;
// Active intents are keyed by OWNER: positions belong to the owner, whichever key signs.
const activeFile = `.pairpilot/active-${owner.toLowerCase()}.json`;
const json = (value: unknown) => JSON.stringify(value, (_k, v) => typeof v === "bigint" ? String(v) : v, 2);
async function active(): Promise<PairPlan> {
  const plan = JSON.parse(await readFile(activeFile, "utf8")) as PairPlan;
  if ((plan.signer ?? plan.account).toLowerCase() !== signer.toLowerCase()) throw new Error(`The active intent for ${owner} was created by signer ${plan.signer}. Use that signer; this one is ${signer}.`);
  return plan;
}
async function markets(): Promise<[MarketSpec, MarketSpec]> { return (await readSnapshot(venue.exchange, pair)).markets.map(m => m.market) as [MarketSpec, MarketSpec]; }
function noteJournalPair(plan: PairPlan) {
  const traded = journalPair(plan.legs);
  if (pairArg && pairLabel(pair) !== `${traded.long}/${traded.short}`) console.log(`Note: --pair=${pairLabel(pair)} is ignored. This command acts on the active journal's ${traded.long}/${traded.short} markets.`);
}
try {
  await mkdir(".pairpilot", { recursive: true });
  console.log(`Pair for new previews: ${pairLabel(pair)} (long ${pair.long}, short ${pair.short}).`);
  console.log(`Execution: ${execution === "operator" ? `linked-wallet operator. Owner ${owner} holds margin and positions; signer ${signer} signs and pays gas.` : `own wallet ${owner}.`}`);
  if (command === "check") {
    // Read-only: owner state, signer gas and per-pool permissions for both legs.
    const legs = await markets();
    const status = await venue.accountStatus();
    const permissions = execution === "operator" ? await venue.permissions(legs.map(m => ({ symbol: m.symbol, pool: m.pool }))) : "own wallet: no operator grant needed";
    const positions = await Promise.all(legs.map(async m => ({ symbol: m.symbol, size: (await venue.exchange.client.getPerpPosition({ pool: m.pool, marginBank: m.marginBank, account: owner })).size })));
    const report = { mode: "testnet", kind: "read-only preflight", pair: pairLabel(pair), checkedAt: new Date(status.checkedAt).toISOString(), chainId: status.chainId, execution: venue.execution, signerGasSTT: status.gasWei === null ? null : formatEther(status.gasWei), ownerEquityUSDso: status.equity === null ? null : formatUnits(status.equity, status.quoteDecimals), ownerActivePerpPools: status.activePositions, ownerRestingOrders: status.restingOrders, ownerPendingStops: status.pendingStops, ownerPositions: positions, permissions, signedTransactions: 0 };
    await mkdir("evidence", { recursive: true });
    await writeFile(`evidence/${execution}-preflight-${pairLabel(pair).replace("/", "-")}.json`, json(report) + "\n");
    console.log(json(report));
  } else if (command === "preview") {
    await journal.exclusive(owner, async () => {
      if (existsSync(activeFile)) {
        const old = JSON.parse(await readFile(activeFile, "utf8")) as PairPlan, record = await journal.read(old.id);
        if (record && record.status !== "flat") throw new Error("An active or unresolved pair already exists for this owner. Reconcile/close it first.");
      }
      const snapshot = await readSnapshot(venue.exchange, pair);
      const books = snapshot.markets.map(m => ({ symbol: m.market.symbol, mark: m.mark, bids: m.bids, asks: m.asks }));
      assertSnapshotPair(books, pair);
      const legs = snapshot.markets.map(m => m.market) as [MarketSpec, MarketSpec];
      const plan = makePlan({ id: crypto.randomUUID(), account: owner, signer, mode: "testnet", total: process.env.PAIRPILOT_TOTAL ?? "50", slippageBps: Number(process.env.PAIRPILOT_SLIPPAGE_BPS ?? "30"), markets: legs, prices: [BigInt(snapshot.markets[0].ask ?? "0"), BigInt(snapshot.markets[1].bid ?? "0")] });
      assertDepth(plan, books);
      await venue.assertReady(plan);
      await writeFile(activeFile, JSON.stringify(plan, null, 2) + "\n");
      console.log(json({ message: "Read-only preview; no transactions sent. Run open within 40 seconds to sign this exact intent; opening is refused in the last 20 seconds of the 60-second preview.", plan }));
    });
  } else if (command === "simulate") {
    // The exact pre-send path for both legs (permission, margin, eth_call, gas estimate). Nothing is signed.
    const plan = await active();
    noteJournalPair(plan);
    const results = [];
    for (const leg of [0, 1] as const) {
      const p = plan.legs[leg];
      const intent: OrderIntent = { id: `${plan.id}:simulate:${leg}`, leg, kind: "open", side: p.side, quantity: p.quantity, limitPrice: p.limitPrice, status: "submitting" };
      try { await venue.prepare(plan, intent); results.push({ leg: p.market.symbol, side: p.side, quantity: p.quantity, limitPrice: p.limitPrice, simulation: "ok" }); }
      catch (error) { results.push({ leg: p.market.symbol, side: p.side, simulation: "reverted", message: error instanceof Error ? error.message : String(error) }); }
    }
    const report = { mode: "testnet", kind: "read-only transaction simulation", at: new Date().toISOString(), planId: plan.id, owner, signer, execution, results, signedTransactions: 0, note: "Each leg simulated from the current flat state; leg 2 is re-checked live before it is sent." };
    await mkdir("evidence", { recursive: true });
    await writeFile(`evidence/${execution}-simulation-${plan.id}.json`, json(report) + "\n");
    console.log(json(report));
    if (results.some(r => r.simulation !== "ok")) process.exitCode = 1;
  } else if (["open", "close", "reconcile"].includes(command)) {
    const plan = await active();
    noteJournalPair(plan);
    const record = command === "open" ? await engine.open(plan) : await engine[command as "close" | "reconcile"](plan.id);
    await mkdir("evidence", { recursive: true });
    await writeFile(`evidence/testnet-pair-${plan.id}.json`, JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify(record, null, 2));
    if (record.status === "attention" || record.status === "incomplete") process.exitCode = 2;
  } else throw new Error("Use check, preview, simulate, open, reconcile or close. Add --pair=LONG/SHORT (ETH/BTC default; ETH, BTC, SOL, HYPE) and --owner=0x<full address> for linked-wallet operator trading.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally { await venue.dispose(); }
