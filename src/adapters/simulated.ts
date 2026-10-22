import { parseUnits } from "viem";
import { RejectedOrder } from "../core/engine";
import { boundedPrice } from "../core/planner";
import { DEFAULT_PAIR, isAsset, type Asset, type PairSelection } from "../core/pairs";
import { signed, type Hash, type MarketSpec, type OrderIntent, type OrderOutcome, type PairPlan, type Side, type Venue } from "../core/types";

export type Scenario = "success" | "second-empty" | "partial" | "timeout" | "recovery-empty" | "second-rejected";
const BANK = "0x0000000000000000000000000000000000000003" as const;
/** Labeled simulator fixtures. Decimals, ticks, lots and minimums mirror Tokyo metadata read 2026-10-22; prices are fixed and NOT live. */
export const SIM_SPECS: Record<Asset, MarketSpec> = {
  ETH: { symbol: "ETH", pool: "0x0000000000000000000000000000000000000001", marginBank: BANK, baseDecimals: 18, quoteDecimals: 18, tick: String(parseUnits("0.01", 18)), lot: String(parseUnits("0.0001", 18)), minimum: String(parseUnits("0.004", 18)) },
  BTC: { symbol: "BTC", pool: "0x0000000000000000000000000000000000000002", marginBank: BANK, baseDecimals: 8, quoteDecimals: 18, tick: String(parseUnits("0.1", 18)), lot: "1000", minimum: "13000" },
  SOL: { symbol: "SOL", pool: "0x0000000000000000000000000000000000000004", marginBank: BANK, baseDecimals: 9, quoteDecimals: 18, tick: String(parseUnits("0.01", 18)), lot: String(parseUnits("0.01", 9)), minimum: String(parseUnits("0.1", 9)) },
  HYPE: { symbol: "HYPE", pool: "0x0000000000000000000000000000000000000005", marginBank: BANK, baseDecimals: 6, quoteDecimals: 18, tick: String(parseUnits("0.01", 18)), lot: String(parseUnits("0.01", 6)), minimum: String(parseUnits("0.12", 6)) },
};
export const SIM_PRICE: Record<Asset, bigint> = { ETH: parseUnits("2500", 18), BTC: parseUnits("85000", 18), SOL: parseUnits("150", 18), HYPE: parseUnits("40", 18) };
export const simMarkets = (p: PairSelection): [MarketSpec, MarketSpec] => [SIM_SPECS[p.long], SIM_SPECS[p.short]];
export const simPrices = (p: PairSelection): [bigint, bigint] => [SIM_PRICE[p.long], SIM_PRICE[p.short]];
/** The default ETH/BTC fixtures, kept for existing tests, the demo and older simulation journals. */
export const SIM_MARKETS = simMarkets(DEFAULT_PAIR);
export const SIM_PRICES = simPrices(DEFAULT_PAIR);
function simPrice(symbol: string) {
  if (!isAsset(symbol)) throw new Error(`${symbol}: no simulated price.`);
  return SIM_PRICE[symbol];
}
export class SimulatedVenue implements Venue {
  readonly mode = "simulation" as const;
  readonly account = "simulation";
  readonly signer = "simulation";
  positionsRaw: [bigint, bigint] = [0n, 0n];
  sends = 0;
  outcomes = new Map<Hash, OrderOutcome>();
  constructor(public scenario: Scenario = "success", private persist?: (venue: SimulatedVenue) => void) {}
  async positions(): Promise<[bigint, bigint]> { return [...this.positionsRaw]; }
  async assertReady() {}
  async prepare() {}
  async send(_plan: PairPlan, order: OrderIntent, onHash: (hash: Hash) => Promise<void>): Promise<OrderOutcome> {
    // Injected: the user rejects the second signature in the wallet. Nothing is broadcast.
    if (this.scenario === "second-rejected" && order.kind === "open" && order.leg === 1) throw new RejectedOrder("Injected wallet rejection of the second signature. No order was sent.");
    this.sends++;
    let filled = BigInt(order.quantity);
    if (order.kind === "open" && order.leg === 1) {
      if (["second-empty", "recovery-empty"].includes(this.scenario)) filled = 0n;
      if (this.scenario === "partial") filled = filled / 2n / 1000n * 1000n;
    }
    if (order.kind === "close" && this.scenario === "recovery-empty") filled = 0n;
    const hash: Hash = `0x${this.sends.toString(16).padStart(64, "0")}`;
    const outcome = { hash, filled: String(filled) };
    this.positionsRaw[order.leg] += signed(order.side, filled);
    this.outcomes.set(hash, outcome);
    this.persist?.(this);
    await onHash(hash);
    if (this.scenario === "timeout" && order.kind === "open" && order.leg === 1) throw new Error("Injected transport timeout AFTER broadcast. The transaction actually filled.");
    return outcome;
  }
  async receipt(_plan: PairPlan, order: OrderIntent) { return order.hash ? this.outcomes.get(order.hash) ?? null : null; }
  // Prices come from the JOURNAL's own leg market, never from a current selector.
  async closePrice(plan: PairPlan, leg: 0 | 1, side: Side) { return boundedPrice(simPrice(plan.legs[leg].market.symbol), side, plan.slippageBps, BigInt(plan.legs[leg].market.tick)); }
  snapshot() { return { scenario: this.scenario, positions: this.positionsRaw.map(String), sends: this.sends, outcomes: [...this.outcomes] }; }
  static restore(value: ReturnType<SimulatedVenue["snapshot"]>, persist?: (venue: SimulatedVenue) => void) {
    const venue = new SimulatedVenue(value.scenario, persist);
    venue.positionsRaw = value.positions.map(BigInt) as [bigint, bigint];
    venue.sends = value.sends;
    venue.outcomes = new Map(value.outcomes);
    return venue;
  }
}
