import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJournal } from "./file-journal";
import { PairEngine } from "../core/engine";
import { makePlan } from "../core/planner";
import { SIM_MARKETS, SIM_PRICES, SimulatedVenue } from "./simulated";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function directory() { const value = await mkdtemp(join(tmpdir(), "pairpilot-test-")); directories.push(value); return value; }
describe("CLI durability", () => {
  it("restores an unknown transaction from disk, then reconciles without re-sending", async () => {
    const path = await directory(), venue = new SimulatedVenue("timeout");
    const plan = makePlan({ id: "disk-test", account: venue.account, mode: venue.mode, total: "50", slippageBps: 30, markets: SIM_MARKETS, prices: SIM_PRICES });
    await new PairEngine(venue, new FileJournal(path)).open(plan);
    const restored = new PairEngine(venue, new FileJournal(path));
    expect((await restored.reconcile(plan.id)).status).toBe("paired");
    expect(venue.sends).toBe(2);
    expect((await readdir(path)).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("locks two independent journal instances out of the same account", async () => {
    const path = await directory(), first = new FileJournal(path), second = new FileJournal(path);
    await first.exclusive("simulation", async () => {
      await expect(second.exclusive("simulation", async () => 1)).rejects.toThrow("locked");
    });
    expect(await second.exclusive("simulation", async () => 42)).toBe(42);
  });
});
