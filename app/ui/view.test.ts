import { describe, expect, it } from "vitest";
import { PairEngine } from "../../src/core/engine";
import { MemoryJournal } from "../../src/core/journal";
import { makePlan } from "../../src/core/planner";
import type { PairRecord } from "../../src/core/types";
import { SIM_MARKETS, SIM_PRICES, SimulatedVenue, type Scenario } from "../../src/adapters/simulated";
import { legView, pairAlert, pairStatus, totalNotional } from "./view";

async function run(scenario: Scenario) {
  const venue = new SimulatedVenue(scenario), engine = new PairEngine(venue, new MemoryJournal());
  const plan = makePlan({ id: `view-${scenario}`, account: venue.account, mode: venue.mode, total: "100", slippageBps: 30, markets: SIM_MARKETS, prices: SIM_PRICES });
  return { engine, plan, record: await engine.open(plan) };
}
const value = (record: PairRecord, leg: 0 | 1, key: string) => legView(record, leg, false).rows.find(r => r.k === key)?.v;

describe("dashboard view of journal records (simulated engine runs)", () => {
  it("labels a fully filled pair as open, then flat with read-back", async () => {
    const { engine, plan, record } = await run("success");
    expect(pairStatus(record, false).label).toBe("Pair open");
    expect(legView(record, 0, false).status).toBe("Filled");
    expect(pairAlert(record, false)).toBeNull();
    const flat = await engine.close(plan.id);
    expect(pairStatus(flat, false).label).toBe("Flat");
    expect(legView(flat, 1, false).status).toBe("Closed");
    expect(pairAlert(flat, false)?.title).toContain("read back as zero");
  });
  it("shows a second leg with no fill as incomplete, never paired", async () => {
    const { record } = await run("second-empty");
    expect(pairStatus(record, false).label).toBe("Incomplete");
    expect(legView(record, 1, false).status).toBe("No fill");
    expect(legView(record, 1, false).note).toContain("does not resend");
    expect(pairAlert(record, false)?.tone).toBe("warn");
  });
  it("reports partial fills from receipts, not requested quantities", async () => {
    const { record, plan } = await run("partial");
    expect(legView(record, 1, false).status).toBe("Partial fill");
    expect(value(record, 1, "Filled")).not.toBe(value(record, 1, "Requested"));
    expect(value(record, 1, "Requested")).toContain(SIM_MARKETS[1].symbol);
    expect(totalNotional(plan)).toBeGreaterThan(0n);
  });
  it("keeps an unknown outcome unresolved: unknown fill, last recorded position, blocking alert", async () => {
    const { record } = await run("timeout");
    expect(pairStatus(record, false).label).toBe("Needs reconciliation");
    expect(legView(record, 1, false).status).toBe("Outcome unknown");
    expect(value(record, 1, "Filled")).toBe("Unknown");
    expect(value(record, 1, "Last recorded")).toBeDefined();
    expect(pairAlert(record, false)?.title).toContain("Reconcile before sending another order");
  });
  it("calls a failed recovery residual exposure", async () => {
    const { engine, plan } = await run("recovery-empty");
    const record = await engine.close(plan.id);
    expect(pairStatus(record, false).label).toBe("Residual exposure");
    expect(legView(record, 0, false).status).toBe("Residual");
  });
  it("distinguishes an in-flight wallet prompt from an interrupted send without a hash", async () => {
    const { record } = await run("success");
    const pending: PairRecord = { ...record, plan: { ...record.plan, mode: "testnet" }, status: "opening", operations: [{ ...record.operations[0], status: "submitting", hash: undefined, filled: undefined }], positions: ["0", "0"] };
    expect(legView(pending, 0, true).status).toBe("Waiting for wallet");
    expect(pairAlert(pending, true)?.title).toContain("in your wallet");
    expect(legView(pending, 0, false).status).toBe("Interrupted");
    expect(pairStatus(pending, false).label).toBe("Needs reconciliation");
    expect(pairAlert(pending, false)?.title).toContain("no transaction hash");
  });
});
