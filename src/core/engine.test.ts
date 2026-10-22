import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { OPEN_HEADROOM_MS, PairEngine, RejectedOrder } from "./engine";
import { MemoryJournal } from "./journal";
import { amountRaw, boundedPrice, makePlan } from "./planner";
import { SIM_MARKETS, SIM_PRICES, SimulatedVenue, type Scenario } from "../adapters/simulated";

function setup(scenario: Scenario = "success") {
  const venue = new SimulatedVenue(scenario);
  const journal = new MemoryJournal();
  const engine = new PairEngine(venue, journal);
  const plan = makePlan({ id: "test-pair", account: venue.account, mode: venue.mode, total: "100", slippageBps: 30, markets: SIM_MARKETS, prices: SIM_PRICES });
  return { venue, journal, engine, plan };
}
describe("pair execution and recovery", () => {
  it("opens actual fills then closes both legs", async () => {
    const { engine, venue, plan } = setup();
    expect((await engine.open(plan)).status).toBe("paired");
    expect((await engine.close(plan.id)).status).toBe("flat");
    expect(venue.positionsRaw).toEqual([0n, 0n]);
  });
  it("never opens the same pair id twice", async () => {
    const { engine, venue, plan } = setup();
    await engine.open(plan); await engine.open(plan);
    expect(venue.sends).toBe(2);
  });
  it("reports incomplete execution and recovers only filled exposure", async () => {
    const { engine, venue, plan } = setup("second-empty");
    expect((await engine.open(plan)).status).toBe("incomplete");
    expect((await engine.close(plan.id)).status).toBe("flat");
    expect(venue.sends).toBe(3);
  });
  it("does not say flat when the recovery has no liquidity", async () => {
    const { engine, plan } = setup("recovery-empty");
    await engine.open(plan);
    const record = await engine.close(plan.id);
    expect(record.status).toBe("incomplete");
    expect(record.positions[0]).not.toBe("0");
  });
  it("tracks partial fills rather than requested quantities", async () => {
    const { engine, plan } = setup("partial");
    const record = await engine.open(plan);
    expect(record.status).toBe("incomplete");
    expect(-BigInt(record.positions[1])).toBeLessThan(BigInt(plan.legs[1].quantity));
  });
  it("reconciles an ambiguous send after restart without another transaction", async () => {
    const { engine, venue, journal, plan } = setup("timeout");
    expect((await engine.open(plan)).status).toBe("attention");
    await expect(engine.close(plan.id)).rejects.toThrow("unknown");
    const restarted = new PairEngine(venue, journal);
    expect((await restarted.reconcile(plan.id)).status).toBe("paired");
    expect(venue.sends).toBe(2);
  });
  it("never retries an interrupted send without a hash", async () => {
    const { engine, venue, journal, plan } = setup();
    venue.send = async () => { throw new Error("connection lost before hash returned"); };
    await engine.open(plan);
    const record = await new PairEngine(venue, journal).reconcile(plan.id);
    expect(record.status).toBe("attention");
    expect(record.events.at(-1)?.message).toContain("no transaction hash");
  });
  it("leaves pending receipts unknown", async () => {
    const { engine, venue, plan } = setup("timeout");
    await engine.open(plan); venue.outcomes.clear();
    expect((await engine.reconcile(plan.id)).status).toBe("attention");
    expect(venue.sends).toBe(2);
  });
  it("refuses expired previews and non-flat accounts", async () => {
    const { engine, venue, plan } = setup();
    await expect(engine.open({ ...plan, expiresAt: 0 })).rejects.toThrow("expired");
    venue.positionsRaw[0] = 1n;
    await expect(engine.open(plan)).rejects.toThrow("flat account");
    expect(venue.sends).toBe(0);
  });
  it("refuses a preview too close to expiry for both legs to land", async () => {
    const { engine, venue, journal, plan } = setup();
    await expect(engine.open({ ...plan, expiresAt: Date.now() + OPEN_HEADROOM_MS - 1_000 })).rejects.toThrow("both legs");
    expect(venue.sends).toBe(0);
    expect(await journal.read(plan.id)).toBeNull();
  });
  it("records a rejected second-leg signature as not sent and leaves the first leg visible", async () => {
    const { engine, venue, plan } = setup("second-rejected");
    const record = await engine.open(plan);
    expect(record.status).toBe("incomplete");
    expect(record.operations[1].status).toBe("rejected");
    expect(record.operations[1].hash).toBeUndefined();
    expect(record.positions[1]).toBe("0");
    expect(venue.sends).toBe(1);
    expect((await engine.close(plan.id)).status).toBe("flat");
  });
  it("reviews a close read-only, then sends exactly the reviewed quantities and bounds", async () => {
    const { engine, venue, plan } = setup("partial");
    const opened = await engine.open(plan);
    const review = await engine.reviewClose(plan.id);
    expect(venue.sends).toBe(2);
    expect(review.basis).toEqual(opened.positions);
    expect(review.orders.map(o => [o.leg, o.side, o.quantity])).toEqual([[0, "short", plan.legs[0].quantity], [1, "long", String(-BigInt(opened.positions[1]))]]);
    const closed = await engine.close(plan.id, review);
    expect(closed.status).toBe("flat");
    expect(closed.operations.filter(o => o.kind === "close").map(o => o.limitPrice)).toEqual(review.orders.map(o => o.limitPrice));
  });
  it("refuses an expired close review or one whose positions changed", async () => {
    const { engine, venue, plan } = setup();
    await engine.open(plan);
    const review = await engine.reviewClose(plan.id);
    await expect(engine.close(plan.id, { ...review, expiresAt: 0 })).rejects.toThrow("expired");
    await expect(engine.close(plan.id, { ...review, basis: ["1", review.basis[1]] })).rejects.toThrow("changed since the close review");
    await expect(engine.close(plan.id, { ...review, pairId: "other" })).rejects.toThrow("another pair");
    expect(venue.sends).toBe(2);
  });
  it("refuses external changes instead of closing unrelated exposure", async () => {
    const { engine, venue, plan } = setup();
    await engine.open(plan); venue.positionsRaw[0] += 1n;
    await expect(engine.close(plan.id)).rejects.toThrow("outside this pair");
    expect((await engine.reconcile(plan.id)).status).toBe("attention");
    expect(venue.sends).toBe(2);
  });
  it("rejects a different account or execution mode", async () => {
    const { engine, plan } = setup();
    await expect(engine.open({ ...plan, account: "someone-else" })).rejects.toThrow("does not match");
    await expect(engine.open({ ...plan, mode: "testnet" })).rejects.toThrow("does not match");
  });
  it("binds a journal to its signer: another key cannot resume the owner's pair", async () => {
    const { engine, venue, plan } = setup();
    await expect(engine.open({ ...plan, signer: "0x0000000000000000000000000000000000000bad" })).rejects.toThrow("does not match");
    await engine.open(plan);
    (venue as { signer: string }).signer = "0x0000000000000000000000000000000000000bad";
    await expect(engine.reconcile(plan.id)).rejects.toThrow("does not match");
    await expect(engine.close(plan.id)).rejects.toThrow("does not match");
    expect(venue.sends).toBe(2);
  });
  it("accepts own-wallet journals written before signer binding", async () => {
    const { engine, plan } = setup();
    const legacy = { ...plan }; delete legacy.signer;
    expect((await engine.open(legacy)).status).toBe("paired");
  });
  it("blocks concurrent pair operations", async () => {
    const { journal } = setup();
    await journal.exclusive("account", async () => {
      await expect(journal.exclusive("ACCOUNT", async () => 1)).rejects.toThrow("Another pair");
    });
  });
  it("distinguishes a wallet rejection from an unknown broadcast", async () => {
    const { engine, venue, plan } = setup();
    venue.send = async () => { throw new RejectedOrder("Wallet rejected signing"); };
    const record = await engine.open(plan);
    expect(record.operations[0].status).toBe("rejected");
    expect(record.positions).toEqual(["0", "0"]);
  });
  it("leaves below-minimum residuals visible", async () => {
    const { engine, venue, journal, plan } = setup();
    const record = await engine.open(plan);
    venue.positionsRaw[0] = 1n; record.positions[0] = "1";
    await journal.write(record);
    expect((await engine.close(plan.id)).status).toBe("incomplete");
    expect(venue.positionsRaw[0]).toBe(1n);
  });
});
describe("exact sizing and price bounds", () => {
  it("uses each market's different base decimals and valid lots", () => {
    const { plan } = setup();
    for (const leg of plan.legs) {
      expect(BigInt(leg.quantity) % BigInt(leg.market.lot)).toBe(0n);
      expect(BigInt(leg.quantity)).toBeGreaterThanOrEqual(BigInt(leg.market.minimum));
      expect(BigInt(leg.limitPrice) % BigInt(leg.market.tick)).toBe(0n);
    }
  });
  it("rounds a buy down and a sell up to remain inside slippage", () => {
    const p = parseUnits("123.456", 18), tick = parseUnits("0.1", 18);
    expect(boundedPrice(p, "long", 30, tick) * 10_000n).toBeLessThanOrEqual(p * 10_030n);
    expect(boundedPrice(p, "short", 30, tick) * 10_000n).toBeGreaterThanOrEqual(p * 9_970n);
  });
  it("rejects under-minimum size, malformed decimals and invalid slippage", () => {
    const { plan } = setup();
    expect(() => makePlan({ id: "small", account: "simulation", mode: "simulation", total: "1", slippageBps: 30, markets: SIM_MARKETS, prices: SIM_PRICES })).toThrow("minimum");
    for (const value of ["NaN", "-1", "1e3", "1,000", "1.001"]) expect(() => amountRaw(value, 2)).toThrow();
    expect(() => boundedPrice(1n, "long", 1000, 1n)).toThrow();
    expect(plan.legs).toHaveLength(2);
  });
});
