import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { simMarkets, simMarks, simPrices, SimulatedVenue } from "../adapters/simulated";
import { PairEngine } from "./engine";
import { MemoryJournal } from "./journal";
import { markedNotional, markToMarket, monitorPair, summarizePair, type LegRead, type MarksRead, type PairHistory } from "./monitor";
import { makePlan } from "./planner";
import type { OrderIntent, PairRecord } from "./types";

const usd = (v: string) => parseUnits(v, 18);
const pair = { long: "HYPE", short: "SOL" } as const;
// A HYPE (6 decimals) / SOL (9 decimals) plan from simulator fixtures that mirror Tokyo metadata.
const plan = makePlan({ id: "mon", account: "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5", mode: "testnet", total: "50", slippageBps: 30, markets: simMarkets(pair), prices: simPrices(pair) });
const op = (o: Partial<OrderIntent> & Pick<OrderIntent, "leg" | "kind" | "side">): OrderIntent => ({ id: `${o.kind}-${o.leg}-${Math.random()}`, quantity: "0", limitPrice: "0", status: "confirmed", ...o });
function record(positions: [string, string], operations: OrderIntent[], status: PairRecord["status"] = "paired"): PairRecord {
  return { version: 1, plan, status, positions, operations, events: [{ at: 1_000, message: "test" }] };
}
const leg = (symbol: string, size: bigint, extra: Partial<LegRead> = {}): LegRead => ({ symbol, priceable: true, size, asOfBlock: 7n, ...extra });
const read = (a: LegRead, b: LegRead): MarksRead => ({ readAt: 1, legs: [a, b], source: "chain" });

describe("active pair monitor", () => {
  // 0.62 HYPE long @ 40 entry, mark 42; 0.16 SOL short @ 150 entry, mark 148.
  const opened = record(["620000", "-160000000"], []);
  const marks = read(
    leg("HYPE", 620000n, { avgEntryPrice: usd("40"), markPrice: usd("42"), unrealizedPnl: markToMarket(620000n, usd("40"), usd("42"), 6), accruedFunding: usd("0.001") }),
    leg("SOL", -160000000n, { avgEntryPrice: usd("150"), markPrice: usd("148"), unrealizedPnl: markToMarket(-160000000n, usd("150"), usd("148"), 9), accruedFunding: -usd("0.0004") }),
  );
  it("marks each leg in its own decimals and sums only matching quote units", () => {
    const v = monitorPair(opened, marks);
    expect(v.legs.map(l => l.markedNotional)).toEqual([usd("26.04"), usd("23.68")]); // 0.62 × 42, 0.16 × 148
    expect(v.legs.map(l => l.unrealizedPnl)).toEqual([usd("1.24"), usd("0.32")]);   // (42−40)×0.62, (150−148)×0.16
    expect(v.combinedNotional).toBe(usd("49.72"));
    expect(v.combinedUnrealized).toBe(usd("1.56"));
    expect(v.combinedFunding).toBe(usd("0.0006")); // owed: positive means the account pays
    expect(v.actualAllocationBps).toEqual([5237, 4763]);
    expect(v.plannedAllocationBps[0] + v.plannedAllocationBps[1]).toBe(10_000);
    expect(v.unavailable).toEqual([]);
  });
  it("does not attribute PnL when the owner's position differs from this pair's record", () => {
    const external = read(leg("HYPE", 900000n, { avgEntryPrice: usd("40"), markPrice: usd("42"), unrealizedPnl: 1n, accruedFunding: 1n }), marks.legs[1]);
    const v = monitorPair(opened, external);
    expect(v.legs[0].attribution).toBe("differs");
    expect(v.legs[0].unrealizedPnl).toBeNull();
    expect(v.legs[0].markedNotional).toBe(markedNotional(900000n, usd("42"), 6)); // valuation of what is there, not PnL
    expect(v.combinedUnrealized).toBeNull();
    expect(v.unavailable[0]).toMatch(/^HYPE: the owner's position .* differs from this pair's record/);
  });
  it("shows a stale mark as unavailable, never as zero, while a flat leg of ours counts as zero", () => {
    const stale = monitorPair(opened, read({ symbol: "HYPE", priceable: false, size: 620000n, asOfBlock: 7n }, marks.legs[1]));
    expect(stale.legs[0]).toMatchObject({ mark: null, markedNotional: null, unrealizedPnl: null });
    expect(stale.combinedUnrealized).toBeNull();
    expect(stale.unavailable).toContain("HYPE: the mark is stale, so this leg cannot be valued right now.");
    const oneLeg = record(["620000", "0"], [], "incomplete");
    const v = monitorPair(oneLeg, read(marks.legs[0], { symbol: "SOL", priceable: false, size: 0n, asOfBlock: 7n }));
    expect(v.legs[1]).toMatchObject({ markedNotional: 0n, unrealizedPnl: 0n, accruedFunding: 0n });
    expect(v.combinedUnrealized).toBe(usd("1.24"));
    expect(v.actualAllocationBps).toEqual([10_000, 0]);
  });
  it("uses actual chain sizes after a partial fill, not requested quantities", () => {
    const partial = record(["620000", "-80000000"], [], "incomplete");
    const v = monitorPair(partial, read(marks.legs[0], leg("SOL", -80000000n, { avgEntryPrice: usd("150"), markPrice: usd("148"), unrealizedPnl: markToMarket(-80000000n, usd("150"), usd("148"), 9), accruedFunding: 0n })));
    expect(v.legs[1].markedNotional).toBe(usd("11.84"));
    expect(v.legs[1].journalSize).toBe(-80000000n);
  });
  it("discards a read made for another pair and refuses to add different quote units", () => {
    expect(() => monitorPair(opened, read(leg("ETH", 0n), leg("BTC", 0n)))).toThrow("not HYPE");
    const mixed: PairRecord = { ...opened, plan: { ...plan, legs: [plan.legs[0], { ...plan.legs[1], market: { ...plan.legs[1].market, quoteDecimals: 6 } }] } };
    const v = monitorPair(mixed, marks);
    expect([v.combinedNotional, v.combinedUnrealized, v.actualAllocationBps]).toEqual([null, null, null]);
    expect(v.unavailable).toContain("The two markets settle in different quote units, so their values are not added together.");
  });
});

describe("closed pair summary", () => {
  // Long 0.62 HYPE bought at 40, sold 0.62 at 41; short 0.16 SOL sold at 150, bought back 0.08 at 149.
  const ops = [
    op({ leg: 0, kind: "open", side: "long", hash: "0xa1", filled: "620000", fillValue: String(620000n * usd("40")) }),
    op({ leg: 1, kind: "open", side: "short", hash: "0xb1", filled: "160000000", fillValue: String(160000000n * usd("150")) }),
    op({ leg: 0, kind: "close", side: "short", hash: "0xa2", filled: "620000", fillValue: String(620000n * usd("41")) }),
    op({ leg: 1, kind: "close", side: "long", hash: "0xb2", filled: "80000000", fillValue: String(80000000n * usd("149")) }),
  ];
  const [hypePool, solPool] = plan.legs.map(l => l.market.pool.toLowerCase());
  const closedPartly = record(["0", "-80000000"], ops, "incomplete");
  const flat = record(["0", "0"], [...ops.slice(0, 3), op({ leg: 1, kind: "close", side: "long", hash: "0xb2", filled: "160000000", fillValue: String(160000000n * usd("149")) })], "flat");
  const verified = { [hypePool]: { state: "verified" as const, throughBlock: 9n }, [solPool]: { state: "verified" as const, throughBlock: 9n } };
  // Funding settled in this pair's own close receipts: HYPE paid 0.002, SOL received 0.001.
  const settled = [
    { txHash: "0xa2", pool: hypePool, amount: usd("0.002") },
    { txHash: "0xb2", pool: solPool, amount: -usd("0.001") },
    { txHash: "0xf9", pool: hypePool, amount: usd("9") },        // another transaction: never this pair's
    { txHash: "0xa2", pool: "0x0000000000000000000000000000000000000009", amount: usd("9") }, // another market
  ];
  const history = (over: Partial<PairHistory> = {}): PairHistory => ({
    fills: new Map(), fees: [], funding: [], receiptsRead: new Set(["0xa1", "0xb1", "0xa2", "0xb2"]),
    exclusivity: {}, source: "chain+indexer", ...over,
  });
  it("computes realized price PnL from this pair's own fills, long and short, partial close included", () => {
    const s = summarizePair(closedPartly, history());
    expect(s.legs[0]).toMatchObject({ opened: 620000n, avgOpenPrice: usd("40"), closed: 620000n, avgClosePrice: usd("41"), realizedPricePnl: usd("0.62") });
    expect(s.legs[1]).toMatchObject({ opened: 160000000n, closed: 80000000n, openNow: -80000000n, realizedPricePnl: usd("0.08") }); // (150 − 149) × 0.08
    expect(s.totals.realizedPricePnl).toBe(usd("0.7"));
  });
  it("takes fees from receipts with rebates as credits, and keeps unread receipts unknown", () => {
    const fees = [{ txHash: "0xa1", pool: hypePool, amount: usd("0.01"), isRebate: false }, { txHash: "0xa2", pool: hypePool, amount: usd("0.004"), isRebate: true }];
    expect(summarizePair(closedPartly, history({ fees })).legs[0].fees).toBe(usd("0.006"));
    expect(summarizePair(closedPartly, history()).legs[1].fees).toBe(0n); // receipts read, no fee event
    const unread = summarizePair(flat, history({ receiptsRead: new Set(["0xa1", "0xa2"]), exclusivity: verified, funding: settled }));
    expect([unread.legs[1].fees, unread.legs[1].funding, unread.legs[1].net]).toEqual([null, null, null]);
    expect(unread.totals.fees).toBeNull();
    expect(unread.notes.join(" ")).toMatch(/SOL: 2 receipt\(s\) could not be read/);
  });
  it("gives an unqualified pair net only when the indexer verified each market was this pair's alone", () => {
    const s = summarizePair(flat, history({ funding: settled, exclusivity: verified }));
    expect(s.legs.map(l => l.funding)).toEqual([usd("0.002"), -usd("0.001")]); // only this pair's own transactions and markets
    expect(s.legs.map(l => l.fundingAttribution)).toEqual(["exclusive", "exclusive"]);
    expect(s.legs[0]).toMatchObject({ netBeforeFunding: usd("0.62"), net: usd("0.62") - usd("0.002"), netBasis: "pair" });
    expect(s.totals).toMatchObject({ net: usd("0.62") + usd("0.16") - usd("0.001"), netBasis: "pair", fundingAttribution: "exclusive" });
    expect(s.flatReadBackAt).toBe(1_000);
  });
  it("marks net conditional when exclusivity is unverified, including an indexer that has not listed the pair yet", () => {
    for (const exclusivity of [{}, { [hypePool]: { state: "unverified" as const, reason: "the indexer does not list 2 of this pair's transaction(s) yet" }, [solPool]: verified[solPool] }]) {
      const s = summarizePair(flat, history({ funding: settled, exclusivity }));
      expect(s.legs[0]).toMatchObject({ fundingAttribution: "conditional", net: usd("0.618"), netBasis: "conditional" });
      expect(s.totals).toMatchObject({ netBasis: "conditional", fundingAttribution: "conditional" });
      expect(s.notes.join(" ")).toMatch(/HYPE: exclusivity not verified/);
    }
  });
  it("gives no net for a leg whose market was shared with other activity, but keeps net before funding", () => {
    const s = summarizePair(flat, history({ funding: settled, exclusivity: { ...verified, [solPool]: { state: "mixed", reason: "the indexer lists 1 position change(s) by other transactions in this market while the pair was open." } } }));
    expect(s.legs[1]).toMatchObject({ fundingAttribution: "mixed", funding: -usd("0.001"), net: null, netBasis: null, netBeforeFunding: usd("0.16") });
    expect(s.totals).toMatchObject({ net: null, netBasis: null, fundingAttribution: "mixed", netBeforeFunding: usd("0.78") });
    expect(s.notes.join(" ")).toMatch(/SOL: the indexer lists 1 position change.* no net result is given for this leg/);
  });
  it("leaves funding unknown for a leg that is still open, and zero for a leg that never held a position", () => {
    const s = summarizePair(closedPartly, history({ funding: settled, exclusivity: verified }));
    expect([s.legs[1].funding, s.legs[1].net]).toEqual([null, null]);
    expect(s.legs[0].fundingAttribution).toBe("exclusive");
    expect(s.totals.net).toBeNull();
    expect(s.notes.join(" ")).toMatch(/SOL: still open, so funding keeps accruing/);
    const oneLeg = record(["0", "0"], [ops[0], op({ leg: 1, kind: "open", side: "short", status: "rejected" }), ops[2]], "flat");
    const r = summarizePair(oneLeg, history({ funding: settled, exclusivity: { [hypePool]: verified[hypePool] } }));
    expect(r.legs[1]).toMatchObject({ funding: 0n, fundingAttribution: "no-position", netBasis: "pair" });
    expect(r.totals.netBasis).toBe("pair");
  });
  it("never turns an unknown outcome into a fill, and reads older journals from receipts", () => {
    const unknown = record(["620000", "0"], [ops[0], op({ leg: 1, kind: "open", side: "short", hash: "0xb1", status: "unknown" })], "attention");
    const s = summarizePair(unknown, history());
    expect([s.legs[1].opened, s.legs[1].realizedPricePnl]).toEqual([null, null]);
    const old = record(["0", "0"], ops.map(o => ({ ...o, fillValue: undefined })), "flat");
    const fills = new Map(ops.map(o => [o.hash!, { filled: BigInt(o.filled!), fillValue: BigInt(o.fillValue!) }]));
    expect(summarizePair(old, history({ fills })).legs[0].avgOpenPrice).toBe(usd("40"));
    expect(summarizePair(old, history()).legs[0].avgOpenPrice).toBeNull(); // no receipts read: unknown, not the limit price
  });
});

describe("simulation marks", () => {
  it("values a simulated pair at its fixed prices with zero price PnL and no simulated funding", async () => {
    const venue = new SimulatedVenue("partial"), engine = new PairEngine(venue, new MemoryJournal());
    const p = makePlan({ id: "sim-mon", account: venue.account, mode: venue.mode, total: "50", slippageBps: 30, markets: simMarkets(pair), prices: simPrices(pair) });
    const rec = await engine.open(p);
    const v = monitorPair(rec, simMarks(rec, venue.positionsRaw));
    expect(v.legs.map(l => l.chainSize)).toEqual([620000n, -80000000n]);
    expect(v.combinedUnrealized).toBe(0n);
    expect(v.combinedFunding).toBeNull();
    const s = summarizePair(rec);
    expect(s.legs[0].avgOpenPrice).toBe(usd("40"));
    expect(s.notes[0]).toMatch(/^Simulation: fills at fixed prices/);
  });
});
