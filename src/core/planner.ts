import { parseUnits } from "viem";
import type { LegPlan, MarketSpec, PairPlan, Side } from "./types";

export function amountRaw(value: string, decimals: number): bigint {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value) || value.length > 50) throw new Error("Enter a positive decimal amount without commas or exponents.");
  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const raw = parseUnits(value, decimals);
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  return raw;
}
export function grid(value: bigint, step: bigint, up = false) {
  if (step <= 0n) throw new Error("Market has an invalid tick or lot size.");
  return (value / step + (up && value % step !== 0n ? 1n : 0n)) * step;
}
export function boundedPrice(reference: bigint, side: Side, slippageBps: number, tick: bigint) {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 100) throw new Error("Slippage must be an integer from 1 to 100 bps.");
  if (reference <= 0n) throw new Error("No executable price available.");
  // Round inward so rounding never exceeds the user's bound.
  const numerator = reference * BigInt(side === "long" ? 10_000 + slippageBps : 10_000 - slippageBps);
  const price = grid(side === "long" ? numerator / 10_000n : (numerator + 9_999n) / 10_000n, tick, side === "short");
  if (price <= 0n) throw new Error("Slippage price is below one tick.");
  return price;
}
export function makePlan(input: {
  id: string; account: string; signer?: string; mode: PairPlan["mode"]; total: string; slippageBps: number;
  markets: [MarketSpec, MarketSpec]; prices: [bigint, bigint]; now?: number;
}): PairPlan {
  if (input.markets[0].pool.toLowerCase() === input.markets[1].pool.toLowerCase()) throw new Error("Choose two different markets.");
  if (input.markets.some(m => m.quoteDecimals !== input.markets[0].quoteDecimals)) throw new Error("Pair collateral units differ.");
  if (input.markets[0].marginBank.toLowerCase() !== input.markets[1].marginBank.toLowerCase()) throw new Error("Pair must use the same MarginBank.");
  const total = amountRaw(input.total, input.markets[0].quoteDecimals);
  const legs = input.markets.map((market, i): LegPlan => {
    const side = i === 0 ? "long" : "short";
    const reference = input.prices[i];
    const limit = boundedPrice(reference, side, input.slippageBps, BigInt(market.tick));
    const quantity = grid((total / 2n) * 10n ** BigInt(market.baseDecimals) / limit, BigInt(market.lot));
    if (quantity < BigInt(market.minimum)) throw new Error(`${market.symbol}: amount is below the market minimum after lot rounding. Increase total notional.`);
    return { market, side, quantity: String(quantity), limitPrice: String(limit), referencePrice: String(reference) };
  }) as [LegPlan, LegPlan];
  const now = input.now ?? Date.now();
  return { id: input.id, account: input.account, signer: input.signer ?? input.account, mode: input.mode, chainId: 50383, createdAt: now, expiresAt: now + 60_000, slippageBps: input.slippageBps, legs };
}

export interface BookLevel { price: string; quantity: string }
export interface PairBook { symbol: string; mark: string | null; bids: BookLevel[]; asks: BookLevel[] }

/** A fresh read must be exactly the selected long/short markets, each with a live mark. */
export function assertSnapshotPair(books: readonly PairBook[], pair: { long: string; short: string }) {
  if (books.length !== 2 || books[0].symbol !== pair.long || books[1].symbol !== pair.short) throw new Error(`Market read is for ${books.map(b => b.symbol).join("/")}, not ${pair.long}/${pair.short}. Refresh prices; no preview created.`);
  const stale = books.filter(b => !b.mark).map(b => b.symbol);
  if (stale.length) throw new Error(`${stale.join(" and ")}: mark is stale. New pairs are unavailable.`);
}
/** Visible depth inside each leg's price bound must cover its quantity: asks for the long, bids for the short. */
export function assertDepth(plan: PairPlan, books: readonly PairBook[]) {
  plan.legs.forEach((leg, i) => {
    if (books[i]?.symbol !== leg.market.symbol) throw new Error(`${leg.market.symbol}: book does not match the plan. Refresh prices.`);
    const levels = leg.side === "long" ? books[i].asks : books[i].bids;
    const inside = levels.filter(l => leg.side === "long" ? BigInt(l.price) <= BigInt(leg.limitPrice) : BigInt(l.price) >= BigInt(leg.limitPrice));
    const visible = inside.reduce((sum, l) => sum + BigInt(l.quantity), 0n);
    if (visible < BigInt(leg.quantity)) throw new Error(`${leg.market.symbol}: insufficient visible depth within your slippage bound. Reduce notional or refresh.`);
  });
}
