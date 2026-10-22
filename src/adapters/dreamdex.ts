import { decodePlaceOrder, type SomniaMarkets } from "@somnia-chain/markets-sdk";
import { createPublicClient, http, type Address, type TransactionReceipt, type WalletClient } from "viem";
import { boundedPrice } from "../core/planner";
import { RejectedOrder } from "../core/engine";
import type { Hash, MarketSpec, OrderIntent, OrderOutcome, PairPlan, Side, Venue } from "../core/types";
import { createMarkets, hidekiTestnet, NETWORK } from "../lib/network";
import { assertPlacePermissions, encodePlaceOrderFor, IOC, operatorAbi, readPermissions, resolveExecution, revertName, type Execution } from "./operator";
import { revertData } from "./voucher";

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
export interface LiveSnapshot { mode: "testnet"; checkedAt: string; chainId: number; markets: MarketSnapshot[] }

export async function readSnapshot(exchange: SomniaMarkets): Promise<LiveSnapshot> {
  const all = await exchange.client.listPerpMarkets();
  const selected = ["ETH", "BTC"].map(symbol => {
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
  return { mode: "testnet", checkedAt: new Date().toISOString(), chainId, markets };
}

export function outcomeFromReceipt(receipt: TransactionReceipt, pool: Address): OrderOutcome {
  const decoded = decodePlaceOrder(receipt, pool);
  // OrderPlaced alone does not prove an order is STILL resting. Verify the
  // actual open-order state alongside position read-back, not from an event id.
  return { hash: receipt.transactionHash, reverted: receipt.status !== "success", filled: String(decoded.fills.reduce((total, fill) => total + fill.quantityFilled, 0n)) };
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
