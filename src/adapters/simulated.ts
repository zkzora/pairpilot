import { parseUnits } from "viem";
import { boundedPrice } from "../core/planner";
import { signed, type Hash, type MarketSpec, type OrderIntent, type OrderOutcome, type PairPlan, type Side, type Venue } from "../core/types";

export type Scenario = "success" | "second-empty" | "partial" | "timeout" | "recovery-empty";
export const SIM_MARKETS: [MarketSpec, MarketSpec] = [
  { symbol: "ETH", pool: "0x0000000000000000000000000000000000000001", marginBank: "0x0000000000000000000000000000000000000003", baseDecimals: 18, quoteDecimals: 18, tick: String(parseUnits("0.01", 18)), lot: String(parseUnits("0.0001", 18)), minimum: String(parseUnits("0.004", 18)) },
  { symbol: "BTC", pool: "0x0000000000000000000000000000000000000002", marginBank: "0x0000000000000000000000000000000000000003", baseDecimals: 8, quoteDecimals: 18, tick: String(parseUnits("0.1", 18)), lot: "1000", minimum: "13000" },
];
export const SIM_PRICES: [bigint, bigint] = [parseUnits("2500", 18), parseUnits("85000", 18)];
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
  async closePrice(plan: PairPlan, leg: 0 | 1, side: Side) { return boundedPrice(SIM_PRICES[leg], side, plan.slippageBps, BigInt(plan.legs[leg].market.tick)); }
  snapshot() { return { scenario: this.scenario, positions: this.positionsRaw.map(String), sends: this.sends, outcomes: [...this.outcomes] }; }
  static restore(value: ReturnType<SimulatedVenue["snapshot"]>, persist?: (venue: SimulatedVenue) => void) {
    const venue = new SimulatedVenue(value.scenario, persist);
    venue.positionsRaw = value.positions.map(BigInt) as [bigint, bigint];
    venue.sends = value.sends;
    venue.outcomes = new Map(value.outcomes);
    return venue;
  }
}
