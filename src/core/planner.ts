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
