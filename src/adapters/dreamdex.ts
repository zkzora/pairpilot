import { decodePlaceOrder, marginBankEventsAbi, type SomniaMarkets } from "@somnia-chain/markets-sdk";
import { createPublicClient, decodeEventLog, http, parseAbi, type Address, type TransactionReceipt, type WalletClient } from "viem";
import { boundedPrice } from "../core/planner";
import { RejectedOrder } from "../core/engine";
import type { Hash, MarketSpec, OrderIntent, OrderOutcome, PairPlan, PairRecord, Side, Venue } from "../core/types";
import type { Exclusivity, LegRead, MarksRead, PairHistory, TxFills } from "../core/monitor";
import { createMarkets, hidekiTestnet, NETWORK } from "../lib/network";
import { DEFAULT_PAIR, pairLabel, type PairSelection } from "../core/pairs";
import { assertPlacePermissions, encodePlaceOrderFor, findLinkedOwners, IOC, operatorAbi, readPermissions, resolveExecution, revertName, type Execution, type GrantLog } from "./operator";
import { revertData } from "./voucher";

const registryAbi = parseAbi(["function getOperatorPermissionsRegistry() view returns (address)"]);
export interface MarketSnapshot {
  market: MarketSpec;
  mark: string | null;
  bid: string | null;
  ask: string | null;
  fundingRate: string;
  fundingWindowSec: number;
  bookBlock: string;
  bids: { price: string; quantity: string }[];
  asks: { price: string; quantity: string }[];
}
export interface LiveSnapshot { mode: "testnet"; checkedAt: string; chainId: number; pair: string; markets: MarketSnapshot[] }

/** Fresh books for the selected long/short markets, pinned to one block. Metadata comes from the SDK. */
export async function readSnapshot(exchange: SomniaMarkets, pair: PairSelection = DEFAULT_PAIR): Promise<LiveSnapshot> {
  const all = await exchange.client.listPerpMarkets();
  const selected = [pair.long, pair.short].map(symbol => {
    const market = all.find(m => m.baseSymbol === symbol);
    if (!market) throw new Error(`${symbol} perp is unavailable.`);
    return market;
  });
  const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc, { timeout: 12_000, retryCount: 1 }) });
  const chainId = await rpc.getChainId();
  if (chainId !== NETWORK.id) throw new Error("RPC is on the wrong network.");
  const blockNumber = await rpc.getBlockNumber();
  const markets = await Promise.all(selected.map(async m => {
    const [state, book] = await Promise.all([
      exchange.client.getPerpState(m.poolAddress),
      exchange.client.getSpotOrderBook(m.poolAddress, { depth: 20, blockNumber }),
    ]);
    const market: MarketSpec = { symbol: m.baseSymbol!, pool: m.poolAddress, marginBank: m.marginBank, baseDecimals: m.baseDecimals, quoteDecimals: m.quoteDecimals, tick: m.tickSize, lot: m.lotSize, minimum: m.minQuantity };
    return { market, mark: state.markPriceOk ? String(state.markPrice) : null, bid: book.bids[0] ? String(book.bids[0].price) : null, ask: book.asks[0] ? String(book.asks[0].price) : null, fundingRate: String(state.fundingRate), fundingWindowSec: state.fundingWindowSec, bookBlock: String(blockNumber), bids: book.bids.map(l => ({ price: String(l.price), quantity: String(l.quantity) })), asks: book.asks.map(l => ({ price: String(l.price), quantity: String(l.quantity) })) };
  }));
  return { mode: "testnet", checkedAt: new Date().toISOString(), chainId, pair: pairLabel(pair), markets };
}

export function outcomeFromReceipt(receipt: TransactionReceipt, pool: Address): OrderOutcome {
  const decoded = decodePlaceOrder(receipt, pool);
  // OrderPlaced alone does not prove an order is STILL resting. Verify the
  // actual open-order state alongside position read-back, not from an event id.
  const filled = decoded.fills.reduce((total, fill) => total + fill.quantityFilled, 0n);
  const fillValue = decoded.fills.reduce((total, fill) => total + fill.quantityFilled * fill.fillPrice, 0n);
  return { hash: receipt.transactionHash, reverted: receipt.status !== "success", filled: String(filled), fillValue: String(fillValue) };
}

/**
 * Keys stay in the injected wallet or a local CLI signer. Two execution modes:
 * own-wallet (signer trades its own account) and linked-wallet operator (signer sends
 * placeOrderFor for an owner that granted it through Link a Bot). Every read below is
 * the OWNER's account; every signature and gas payment is the SIGNER's.
 */
export class DreamdexVenue implements Venue {
  readonly mode = "testnet" as const;
  /** Position owner: margin, orders, stops, fills and positions. */
  readonly account: Address;
  /** Transaction signer and gas payer. */
  readonly signer: Address;
  readonly execution: Execution;
  readonly exchange: SomniaMarkets;
  private rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc, { timeout: 12_000, retryCount: 1 }) });
  private prepared = new Map<string, { to: Address; data: Hash; value: bigint; gas?: bigint }>();
  constructor(private wallet: WalletClient, owner?: string) {
    if (!wallet.account) throw new Error("Connect a wallet first.");
    this.execution = resolveExecution(wallet.account.address, owner);
    this.account = this.execution.owner;
    this.signer = this.execution.signer;
    this.exchange = createMarkets({ walletClient: wallet });
  }
  async dispose() { await this.exchange.close(); }
  async positions(plan: PairPlan): Promise<[bigint, bigint]> {
    const [positions, orders] = await Promise.all([
      Promise.all(plan.legs.map(async leg => (await this.exchange.client.getPerpPosition({ pool: leg.market.pool, marginBank: leg.market.marginBank, account: this.account })).size)),
      this.exchange.client.getOpenOrdersOnchain(plan.legs.map(leg => leg.market.pool), this.account),
    ]);
    if (orders.orders.length) throw new Error("Resting orders exist in this pair. Inspect and cancel them before continuing.");
    return positions as [bigint, bigint];
  }
  private async checkSigner() {
    if (await this.wallet.getChainId() !== NETWORK.id) throw new Error("Switch wallet to Somnia Tokyo (50383).");
    const addresses = await this.wallet.getAddresses();
    if (!addresses.some(a => a.toLowerCase() === this.signer.toLowerCase())) throw new Error("Wallet account changed. Reconnect before trading.");
  }
  /** What each pool enforces for owner -> signer. Own-wallet execution needs no grant. */
  async permissions(pools: { symbol: string; pool: Address }[]) {
    return readPermissions((pool, selector) => this.rpc.readContract({ address: pool, abi: operatorAbi, functionName: "isOperatorAuthorized", args: [this.account, this.signer, selector] }), pools);
  }
  /**
   * Read-only: app wallets that linked THIS signer through Link a Bot, from the registry's
   * recent grant logs (default 24 h at ~10 blocks/s), each verified with the pools' own
   * isOperatorAuthorized and read for margin. Never applied automatically.
   */
  async discoverOwners(pools: { symbol: string; pool: Address; marginBank?: Address; quoteDecimals?: number }[], onProgress?: (scannedBlocks: bigint) => void) {
    // The pool names the registry it enforces; read over plain RPC.
    const registry = await this.rpc.readContract({ address: pools[0].pool, abi: registryAbi, functionName: "getOperatorPermissionsRegistry" });
    if (/^0x0{40}$/i.test(registry)) return { owners: [], scannedBlocks: 0n };
    const signerTopic = `0x${this.signer.slice(2).toLowerCase().padStart(64, "0")}` as `0x${string}`;
    const hex = (n: bigint) => `0x${n.toString(16)}` as const;
    const head = await this.rpc.getBlockNumber();
    const found = await findLinkedOwners({
      signer: this.signer, head, onProgress,
      getLogs: (from, to) => this.rpc.request({ method: "eth_getLogs", params: [{ address: registry, fromBlock: hex(from), toBlock: hex(to), topics: [null, null, null, signerTopic] }] }) as Promise<GrantLog[]>,
    });
    const owners = await Promise.all(found.owners.filter(o => o.owner !== this.signer).map(async o => {
      const permissions = await readPermissions((pool, selector) => this.rpc.readContract({ address: pool, abi: operatorAbi, functionName: "isOperatorAuthorized", args: [o.owner, this.signer, selector] }), pools);
      const bank = pools[0].marginBank;
      const equity = bank ? await this.exchange.client.getMarginAccount(bank, o.owner).then(b => b.equity).catch(() => null) : null;
      return { ...o, verified: permissions.every(x => x.placeOrderFor), permissions, equity, quoteDecimals: pools[0].quoteDecimals ?? 18 };
    }));
    return { owners, scannedBlocks: found.scannedBlocks };
  }
  /** The selected pair's two pools, from runtime market discovery. */
  async pairPools(pair: PairSelection = DEFAULT_PAIR) {
    const all = await this.exchange.client.listPerpMarkets();
    return [pair.long, pair.short].map(symbol => {
      const market = all.find(m => m.baseSymbol === symbol);
      if (!market) throw new Error(`${symbol} perp is unavailable.`);
      return { symbol, pool: market.poolAddress, marginBank: market.marginBank, quoteDecimals: market.quoteDecimals };
    });
  }
  private async checkPermission(plan: PairPlan, legs: (0 | 1)[]) {
    if (this.execution.mode === "own") return;
    assertPlacePermissions(this.execution, await this.permissions(legs.map(i => ({ symbol: plan.legs[i].market.symbol, pool: plan.legs[i].market.pool }))));
  }
  /** Read-only setup checks. Each read settles separately so one stalled source does not hide the rest. */
  async accountStatus() {
    const markets = await this.exchange.client.listPerpMarkets();
    const eth = markets.find(m => m.baseSymbol === "ETH");
    if (!eth) throw new Error("ETH perp is unavailable.");
    const [chainId, gas, bank, orders, stops] = await Promise.allSettled([
      this.wallet.getChainId(),
      this.rpc.getBalance({ address: this.signer }),
      this.exchange.client.getMarginAccount(eth.marginBank, this.account),
      this.exchange.client.getOpenOrdersOnchain(markets.map(m => m.poolAddress), this.account),
      this.exchange.client.listPerpStopOrders({ account: this.account }),
    ]);
    const value = <T,>(result: PromiseSettledResult<T>) => result.status === "fulfilled" ? result.value : null;
    // Eligibility alone can say "eligible" while claim() reverts, so a read-only claim simulation follows it.
    // An operator cannot claim for its owner, so the voucher is only read for own-wallet execution.
    let voucher: { eligible: boolean; reason?: string; simulation?: "ok" | "reverted"; revertData?: string } | null = null;
    if (this.execution.mode === "own") try {
      const eligibility = await this.exchange.client.getPerpVoucherEligibility(eth.marginBank, this.account);
      voucher = eligibility.eligible ? { eligible: true } : { eligible: false, reason: eligibility.reason };
      if (eligibility.eligible) {
        const call = await this.exchange.trader.buildClaimPerpVoucher({ marginBank: eth.marginBank });
        try { await this.rpc.call({ to: call.to, data: call.data, value: call.value, account: this.signer }); voucher.simulation = "ok"; }
        catch (error) { voucher.simulation = "reverted"; voucher.revertData = revertData(error); }
      }
    } catch { voucher = null; }
    return {
      execution: this.execution,
      voucher,
      checkedAt: Date.now(),
      quoteDecimals: eth.quoteDecimals,
      chainId: value(chainId),
      gasWei: value(gas),
      equity: value(bank)?.equity ?? null,
      activePositions: value(bank)?.activePerpPools.length ?? null,
      restingOrders: value(orders)?.orders.length ?? null,
      pendingStops: value(stops)?.length ?? null,
    };
  }
  async assertReady(plan: PairPlan) {
    await this.checkSigner();
    await this.checkPermission(plan, [0, 1]);
    const bank = await this.exchange.client.getMarginAccount(plan.legs[0].market.marginBank, this.account);
    if (bank.activePerpPools.length) throw new Error("Use a dedicated account with no existing perp positions.");
    const all = await this.exchange.client.listPerpMarkets();
    const orders = await this.exchange.client.getOpenOrdersOnchain(all.map(m => m.poolAddress), this.account);
    if (orders.orders.length) throw new Error("Cancel existing resting orders before opening a pair.");
    const stops = await this.exchange.client.listPerpStopOrders({ account: this.account });
    if (stops.length) throw new Error("Cancel pending TP/SL before using this dedicated account.");
    // Cap v0 test runs to 200 USDso total. Never change leverage or pull from another wallet.
    const notional = plan.legs.reduce((sum, leg) => sum + BigInt(leg.limitPrice) * BigInt(leg.quantity) / 10n ** BigInt(leg.market.baseDecimals), 0n);
    if (notional > 200n * 10n ** BigInt(plan.legs[0].market.quoteDecimals)) throw new Error("Testnet v0 is capped at 200 USDso total notional.");
    for (const leg of plan.legs) {
      const max = await this.exchange.client.getMaxPerpOrderSize({ pool: leg.market.pool, marginBank: leg.market.marginBank, account: this.account, isBid: leg.side === "long", price: BigInt(leg.limitPrice), autoPull: false });
      if (!max.priceable || !max.placeable || BigInt(leg.quantity) > max.maxQuantity) throw new Error(`${leg.market.symbol}: ${max.priceable && max.limitedBy === "voucherBlocked" ? "the owner's voucher credit does not cover this market" : "insufficient margin, stale mark or account restriction"}. No order sent.`);
    }
    // Individual leg previews share the same starting equity. Re-check each leg after fills.
  }
  async prepare(plan: PairPlan, order: OrderIntent) {
    await this.checkSigner();
    await this.checkPermission(plan, [order.leg]);
    const leg = plan.legs[order.leg], market = leg.market;
    const ownOrders = await this.exchange.client.getOpenOrdersOnchain(plan.legs.map(l => l.market.pool), this.account);
    if (ownOrders.orders.length) throw new Error("Resting orders appeared. Cancel/reconcile them before continuing.");
    if (order.kind === "open") {
      const preview = await this.exchange.client.previewPerpOrderMargin({ pool: market.pool, marginBank: market.marginBank, account: this.account, isBid: order.side === "long", quantity: BigInt(order.quantity), price: BigInt(order.limitPrice), autoPull: false });
      if (!preview.priceable || !preview.hasCollateralForLock || !preview.meetsInitialMargin) throw new Error(`${market.symbol}: live margin check rejected this leg. No order sent.`);
    } else {
      const pos = (await this.positions(plan))[order.leg];
      if (pos === 0n || (pos > 0n) === (order.side === "long") || BigInt(order.quantity) > (pos > 0n ? pos : -pos)) throw new Error("Close no longer reduces the current position. Reconcile first.");
    }
    const isBid = order.side === "long", price = BigInt(order.limitPrice), quantity = BigInt(order.quantity);
    const expireTimestampNs = BigInt(order.kind === "open" ? plan.expiresAt : Date.now() + 60_000) * 1_000_000n;
    const request = this.execution.mode === "operator"
      ? { to: market.pool, data: encodePlaceOrderFor({ owner: this.account, isBid, price, quantity, expireTimestampNs }), value: 0n }
      : await this.exchange.trader.buildPlacePerpOrder({ pool: market.pool, isBid, price, quantity, orderType: IOC, expireTimestampNs }).then(({ order: call }) => ({ to: call.to, data: call.data, value: call.value }));
    try { await this.rpc.call({ ...request, account: this.signer }); }
    catch (error) {
      const data = revertData(error);
      throw new Error(`${market.symbol}: order simulation reverted${data ? ` (${revertName(data) ?? data})` : ""}. No order sent.`);
    }
    const gas = await this.rpc.estimateGas({ ...request, account: this.signer });
    this.prepared.set(order.id, { ...request, gas: gas * 125n / 100n });
  }
  async send(plan: PairPlan, order: OrderIntent, onHash: (hash: Hash) => Promise<void>) {
    const call = this.prepared.get(order.id);
    if (!call) throw new RejectedOrder("Order was not prepared.");
    let hash: Hash;
    try {
      // This is deliberately one send, with no automatic re-broadcast after a timeout.
      hash = await this.wallet.sendTransaction({ ...call, account: this.wallet.account!, chain: hidekiTestnet });
    } catch (error) {
      const code = (error as { code?: number; cause?: { code?: number } }).code ?? (error as { cause?: { code?: number } }).cause?.code;
      if (code === 4001) throw new RejectedOrder("Wallet rejected signing. No order was sent.");
      throw error;
    }
    await onHash(hash);
    const receipt = await this.rpc.waitForTransactionReceipt({ hash, timeout: 45_000 });
    return outcomeFromReceipt(receipt, plan.legs[order.leg].market.pool);
  }
  async receipt(plan: PairPlan, order: OrderIntent): Promise<OrderOutcome | null> {
    if (!order.hash) return null;
    try { return outcomeFromReceipt(await this.rpc.getTransactionReceipt({ hash: order.hash }), plan.legs[order.leg].market.pool); }
    catch (error) {
      if ((error as { name?: string }).name === "TransactionReceiptNotFoundError") return null;
      throw error;
    }
  }
  async closePrice(plan: PairPlan, index: 0 | 1, side: Side) {
    const market = plan.legs[index].market;
    const book = await this.exchange.client.getSpotOrderBook(market.pool, { depth: 1 });
    const touch = side === "long" ? book.asks[0]?.price : book.bids[0]?.price;
    if (!touch) throw new Error(`${market.symbol}: no counterparty to close against. Residual remains open.`);
    return boundedPrice(touch, side, plan.slippageBps, BigInt(market.tick));
  }
}

/**
 * Read-only marks for a journal's OWN markets, from the chain: position, VWAP entry, mark,
 * price-only unrealized PnL and funding owed. Works without a wallet.
 */
export async function readPairMarks(exchange: SomniaMarkets, record: PairRecord): Promise<MarksRead> {
  const owner = record.plan.account as Address;
  const legs = await Promise.all(record.plan.legs.map(async (leg): Promise<LegRead> => {
    const a = await exchange.client.getPerpPositionAnalytics({ pool: leg.market.pool, marginBank: leg.market.marginBank, account: owner });
    return a.priceable
      ? { symbol: leg.market.symbol, priceable: true, size: a.size, avgEntryPrice: a.avgEntryPrice, markPrice: a.markPrice, unrealizedPnl: a.unrealizedPnl, accruedFunding: a.accruedFunding, asOfBlock: a.asOfBlock }
      : { symbol: leg.market.symbol, priceable: false, size: a.size, asOfBlock: a.asOfBlock };
  }));
  return { readAt: Date.now(), legs: legs as [LegRead, LegRead], source: "chain" };
}

/**
 * Read-only history for a journal: receipt fills (for journals written before fillValue),
 * MarginBank fee and funding events in the pair's OWN receipts, and, per market, whether the
 * indexer shows that market as this pair's alone from open to close. Failures become
 * "unknown" or "unverified", never zero.
 */
export async function readPairHistory(exchange: SomniaMarkets, record: PairRecord): Promise<PairHistory> {
  const rpc = createPublicClient({ chain: hidekiTestnet, transport: http(NETWORK.rpc, { timeout: 12_000, retryCount: 1 }) });
  const owner = record.plan.account.toLowerCase();
  const confirmed = record.operations.filter(o => o.hash && o.status === "confirmed");
  // A receipt that cannot be read is left out: its fills, fees and funding stay unknown.
  const receipts = new Map<string, TransactionReceipt>();
  await Promise.all(confirmed.map(async o => { const r = await rpc.getTransactionReceipt({ hash: o.hash! }).catch(() => null); if (r) receipts.set(o.hash!.toLowerCase(), r); }));
  const fills = new Map<string, TxFills>();
  for (const o of confirmed) {
    const receipt = receipts.get(o.hash!.toLowerCase());
    if (!receipt) continue;
    const out = outcomeFromReceipt(receipt, record.plan.legs[o.leg].market.pool);
    fills.set(o.hash!.toLowerCase(), { filled: BigInt(out.filled), fillValue: BigInt(out.fillValue ?? "0") });
  }
  const fees: PairHistory["fees"] = [], funding: PairHistory["funding"] = [];
  const receiptsRead = new Set<string>();
  for (const [hash, receipt] of receipts) {
    receiptsRead.add(hash);
    for (const log of receipt.logs) {
      let decoded;
      try { decoded = decodeEventLog({ abi: marginBankEventsAbi, data: log.data, topics: log.topics }); } catch { continue; }
      const args = decoded.args as { account?: string; payer?: string; perpPool?: string; amount?: bigint; payment?: bigint };
      const who = (args.account ?? args.payer ?? "").toLowerCase();
      if (who !== owner || !args.perpPool) continue;
      const pool = args.perpPool.toLowerCase();
      if ((decoded.eventName === "FeeCharged" || decoded.eventName === "BuilderFeeCharged") && args.amount !== undefined) fees.push({ txHash: hash, pool, amount: args.amount, isRebate: false });
      if (decoded.eventName === "RebatePaid" && args.amount !== undefined) fees.push({ txHash: hash, pool, amount: args.amount, isRebate: true });
      if (decoded.eventName === "FundingSettled" && args.payment !== undefined) funding.push({ txHash: hash, pool, amount: args.payment });
    }
  }
  const exclusivity: PairHistory["exclusivity"] = {};
  await Promise.all(record.plan.legs.map(async (leg, i) => {
    const pool = leg.market.pool.toLowerCase();
    const ops = confirmed.filter(o => o.leg === i && BigInt(o.filled ?? "0") > 0n);
    if (!ops.length) return; // Never held a position: nothing to attribute.
    exclusivity[pool] = await checkExclusive(exchange, rpc, owner, pool, ops.map(o => ({ kind: o.kind, hash: o.hash!.toLowerCase() })), receipts, BigInt(record.positions[i]) === 0n)
      .catch(e => ({ state: "unverified" as const, reason: `the indexer could not be read: ${e instanceof Error ? e.message : String(e)}` }));
  }));
  return { fills, fees, funding, receiptsRead, exclusivity, source: "chain+indexer" };
}

const PAGE = 1000, FUNDING_PAGE = 200;
/** One market: were this pair's transactions the owner's only position changes and funding settlements there, from open to close? */
export async function checkExclusive(exchange: SomniaMarkets, rpc: { getBlock(a: { blockNumber: bigint }): Promise<{ timestamp: bigint }> }, owner: string, pool: string,
  ops: { kind: "open" | "close"; hash: string }[], receipts: Map<string, TransactionReceipt>, flat: boolean): Promise<Exclusivity> {
  if (!flat) return { state: "unverified", reason: "the position is still open" };
  if (ops.some(o => !receipts.has(o.hash))) return { state: "unverified", reason: "a receipt of this pair could not be read" };
  const blocks = ops.map(o => receipts.get(o.hash)!.blockNumber);
  const first = blocks.reduce((a, b) => a < b ? a : b), last = blocks.reduce((a, b) => a > b ? a : b);
  const [from, to] = await Promise.all([first, last].map(async b => Number((await rpc.getBlock({ blockNumber: b })).timestamp)));
  const ourHashes = new Set(ops.map(o => o.hash));
  const rows = (await exchange.client.listPerpPositionChanges({ account: owner, pool, from, to: to + 1, order: "asc", limit: PAGE }))
    .filter(r => r.blockNumber >= first && r.blockNumber <= last)
    .sort((a, b) => a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
  if (rows.length >= PAGE) return { state: "unverified", reason: "too many indexed position changes in the window to check" };
  // Completeness: the indexer must list this pair's own transactions. Missing ones mean it lags or is incomplete.
  const missing = [...ourHashes].filter(h => !rows.some(r => r.txHash.toLowerCase() === h));
  if (missing.length) return { state: "unverified", reason: `the indexer does not list ${missing.length} of this pair's transaction(s) yet` };
  const outside = rows.filter(r => !ourHashes.has(r.txHash.toLowerCase()));
  if (outside.length) return { state: "mixed", reason: `the indexer lists ${outside.length} position change(s) by other transactions in this market while the pair was open.` };
  if (rows[0].sizeBefore !== 0n) return { state: "mixed", reason: "the owner already held a position in this market when the pair opened." };
  if (rows.at(-1)!.sizeAfter !== 0n) return { state: "mixed", reason: "the owner's position did not end at zero with the pair's last close." };
  const settlements = await exchange.client.getFundingPayments(owner, { pool, limit: FUNDING_PAGE });
  if (settlements.length >= FUNDING_PAGE && Math.min(...settlements.map(r => Number(r.timestamp))) > from) return { state: "unverified", reason: "the funding history page does not reach back to the open" };
  // Timestamps are whole seconds and blocks are faster, so a boundary second counts as inside: conservative.
  const foreign = settlements.filter(r => !ourHashes.has(r.txHash.toLowerCase()) && Number(r.timestamp) >= from && Number(r.timestamp) <= to);
  if (foreign.length) return { state: "mixed", reason: `the indexer lists ${foreign.length} funding settlement(s) in other transactions while the pair was open.` };
  return { state: "verified", throughBlock: last };
}
