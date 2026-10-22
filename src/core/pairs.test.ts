import { describe, expect, it } from "vitest";
import { SIM_PRICE, simMarkets, simPrices, SimulatedVenue } from "../adapters/simulated";
import { assertPlacePermissions, readPermissions, resolveExecution } from "../adapters/operator";
import { PairEngine } from "./engine";
import { MemoryJournal } from "./journal";
import { checkPair, DEFAULT_PAIR, PAIR_PRESETS, pairLabel, parsePair, presetOf, swapPair, type PairSelection } from "./pairs";
import { assertDepth, assertSnapshotPair, makePlan } from "./planner";
import { legNotional } from "../../app/ui/view";

const ALL_DIRECTIONS: PairSelection[] = PAIR_PRESETS.flatMap(p => [p, swapPair(p)]);
const plan = (pair: PairSelection, total = "50") => makePlan({ id: `pair-${pair.long}-${pair.short}`, account: "simulation", mode: "simulation", total, slippageBps: 30, markets: simMarkets(pair), prices: simPrices(pair) });

describe("pair configuration", () => {
  it("offers the six presets, ETH/BTC first, and accepts each in both directions", () => {
    expect(PAIR_PRESETS.map(pairLabel)).toEqual(["ETH/BTC", "SOL/ETH", "SOL/BTC", "HYPE/SOL", "HYPE/ETH", "HYPE/BTC"]);
    expect(DEFAULT_PAIR).toEqual({ long: "ETH", short: "BTC" });
    expect(ALL_DIRECTIONS).toHaveLength(12);
    for (const p of ALL_DIRECTIONS) expect(checkPair(p)).toEqual(p);
    expect(presetOf({ long: "SOL", short: "HYPE" })).toEqual({ index: 3, reversed: true });
  });
  it("parses LONG/SHORT text and rejects identical, unknown or malformed pairs", () => {
    expect(parsePair("hype/sol")).toEqual({ long: "HYPE", short: "SOL" });
    expect(() => parsePair("ETH/ETH")).toThrow("different");
    expect(() => parsePair("DOGE/ETH")).toThrow("Supported assets");
    expect(() => parsePair("HYPE")).toThrow("LONG/SHORT");
    expect(() => checkPair({ long: "SOL", short: "SOL" })).toThrow("different");
  });
});

describe("sizing across mixed decimals (simulated fixtures, Tokyo metadata)", () => {
  it.each(ALL_DIRECTIONS.map(p => [pairLabel(p), p] as const))("%s: long first, short second, lot/tick aligned, about 50/50", (_label, pair) => {
    const p = plan(pair);
    expect(p.legs.map(l => [l.market.symbol, l.side])).toEqual([[pair.long, "long"], [pair.short, "short"]]);
    for (const leg of p.legs) {
      expect(BigInt(leg.quantity) % BigInt(leg.market.lot)).toBe(0n);
      expect(BigInt(leg.limitPrice) % BigInt(leg.market.tick)).toBe(0n);
      expect(BigInt(leg.quantity)).toBeGreaterThanOrEqual(BigInt(leg.market.minimum));
      expect(BigInt(leg.limitPrice) * 10_000n).toBeLessThanOrEqual(BigInt(leg.referencePrice) * 10_030n);
      expect(BigInt(leg.limitPrice) * 10_000n).toBeGreaterThanOrEqual(BigInt(leg.referencePrice) * 9_970n);
    }
    const [a, b] = p.legs.map(legNotional), total = a + b;
    // Lot rounding only shaves each leg below its 25 USDso half: both stay within 45–55% of the pair.
    for (const n of [a, b]) { expect(n * 100n / total).toBeGreaterThanOrEqual(45n); expect(n * 100n / total).toBeLessThanOrEqual(55n); }
  });
  it("uses each market's own decimals: HYPE 6, SOL 9, BTC 8, ETH 18", () => {
    expect(plan({ long: "HYPE", short: "SOL" }).legs.map(l => [l.market.baseDecimals, l.quantity])).toEqual([[6, "620000"], [9, "160000000"]]);
  });
  it("refuses a total whose leg rounds below a market minimum, naming that market", () => {
    // 10 USDso total → 5 per leg: 0.033 SOL is under SOL's 0.1 minimum.
    expect(() => plan({ long: "HYPE", short: "SOL" }, "10")).toThrow(/^SOL: amount is below the market minimum/);
    expect(() => plan({ long: "SOL", short: "HYPE" }, "10")).toThrow(/^SOL:/);
  });
});

describe("fresh market reads", () => {
  const p = plan({ long: "HYPE", short: "SOL" });
  const book = (symbol: string, quantity: string, price: string) => ({ symbol, mark: "1", bids: [{ price, quantity }], asks: [{ price, quantity }] });
  it("rejects a read for another pair or with a stale mark", () => {
    expect(() => assertSnapshotPair([book("ETH", "1", "1"), book("BTC", "1", "1")], { long: "HYPE", short: "SOL" })).toThrow("not HYPE/SOL");
    expect(() => assertSnapshotPair([book("SOL", "1", "1"), book("HYPE", "1", "1")], { long: "HYPE", short: "SOL" })).toThrow("not HYPE/SOL");
    expect(() => assertSnapshotPair([{ ...book("HYPE", "1", "1"), mark: null }, book("SOL", "1", "1")], { long: "HYPE", short: "SOL" })).toThrow("HYPE: mark is stale");
  });
  it("requires depth inside each leg's bound on the right side of the book", () => {
    const enough = [book("HYPE", p.legs[0].quantity, p.legs[0].limitPrice), book("SOL", p.legs[1].quantity, p.legs[1].limitPrice)];
    expect(() => assertDepth(p, enough)).not.toThrow();
    const thinSol = [enough[0], book("SOL", String(BigInt(p.legs[1].quantity) - 1n), p.legs[1].limitPrice)];
    expect(() => assertDepth(p, thinSol)).toThrow(/^SOL: insufficient visible depth/);
    const outsideBound = [{ ...enough[0], asks: [{ price: String(BigInt(p.legs[0].limitPrice) + 1n), quantity: p.legs[0].quantity }] }, enough[1]];
    expect(() => assertDepth(p, outsideBound)).toThrow(/^HYPE: insufficient/);
  });
});

describe("execution and recovery for every pair (simulated)", () => {
  it.each(ALL_DIRECTIONS.map(p => [pairLabel(p), p] as const))("%s opens paired and closes flat", async (_label, pair) => {
    const venue = new SimulatedVenue(), engine = new PairEngine(venue, new MemoryJournal()), p = plan(pair);
    expect((await engine.open(p)).status).toBe("paired");
    expect((await engine.close(p.id, await engine.reviewClose(p.id))).status).toBe("flat");
  });
  it("recovers a partial HYPE/SOL pair from the journal's own markets; a sub-minimum residual stays visible", async () => {
    const venue = new SimulatedVenue("partial"), engine = new PairEngine(venue, new MemoryJournal()), p = plan({ long: "HYPE", short: "SOL" });
    const opened = await engine.open(p);
    expect(opened.status).toBe("incomplete");
    expect(opened.positions).toEqual(["620000", "-80000000"]); // 0.62 HYPE long, 0.08 SOL short (< 0.1 SOL minimum)
    const review = await engine.reviewClose(p.id);
    expect(review.orders.map(o => [p.legs[o.leg].market.symbol, o.side, o.quantity])).toEqual([["HYPE", "short", "620000"]]);
    expect(BigInt(review.orders[0].limitPrice)).toBeLessThan(SIM_PRICE.HYPE); // bounded around HYPE's own price
    expect(review.residuals).toEqual([{ leg: 1, position: "-80000000", reason: expect.stringContaining("below the market minimum") }]);
    const closed = await engine.close(p.id, review);
    expect(closed.status).toBe("incomplete");
    expect(closed.positions).toEqual(["0", "-80000000"]);
  });
  it("prices a full HYPE/SOL close around HYPE and SOL, never around ETH/BTC", async () => {
    const engine = new PairEngine(new SimulatedVenue(), new MemoryJournal()), p = plan({ long: "HYPE", short: "SOL" });
    await engine.open(p);
    const review = await engine.reviewClose(p.id);
    expect(review.orders.map(o => p.legs[o.leg].market.symbol)).toEqual(["HYPE", "SOL"]);
    expect(BigInt(review.orders[0].limitPrice)).toBeLessThan(SIM_PRICE.HYPE);
    expect(BigInt(review.orders[1].limitPrice)).toBeGreaterThan(SIM_PRICE.SOL);
    expect(BigInt(review.orders[1].limitPrice)).toBeLessThan(SIM_PRICE.SOL * 2n);
  });
});

describe("operator permissions on the selected pools", () => {
  const signer = "0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50", owner = "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5";
  const hype = "0x63b47ed4a7de0fde659b0d82441dd74828b7297a", sol = "0xb483ec1fb34996638677c20ab087b16f1896fa53";
  const legs = [{ symbol: "HYPE", pool: hype as `0x${string}` }, { symbol: "SOL", pool: sol as `0x${string}` }];
  it.each([["SOL", sol], ["HYPE", hype]])("refuses when %s lacks placeOrderFor", async (symbol, missing) => {
    const permissions = await readPermissions(async pool => pool !== missing, legs);
    expect(() => assertPlacePermissions(resolveExecution(signer, owner), permissions)).toThrow(new RegExp(`on ${symbol}\\.`));
  });
});
