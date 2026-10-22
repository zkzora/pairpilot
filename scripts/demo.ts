import { mkdir, writeFile } from "node:fs/promises";
import { PairEngine } from "../src/core/engine.js";
import { MemoryJournal } from "../src/core/journal.js";
import { makePlan } from "../src/core/planner.js";
import { SIM_MARKETS, SIM_PRICES, SimulatedVenue, type Scenario } from "../src/adapters/simulated.js";

const results = [];
for (const scenario of ["success", "second-empty", "partial", "timeout", "recovery-empty"] as Scenario[]) {
  const venue = new SimulatedVenue(scenario), journal = new MemoryJournal();
  const engine = new PairEngine(venue, journal);
  const plan = makePlan({ id: `demo-${scenario}`, account: venue.account, mode: venue.mode, total: "100", slippageBps: 30, markets: SIM_MARKETS, prices: SIM_PRICES });
  const opened = await engine.open(plan);
  const afterOpen = opened.status;
  const reconciled = await new PairEngine(venue, journal).reconcile(plan.id);
  const closed = await engine.close(plan.id);
  results.push({ scenario, afterOpen, afterReconcile: reconciled.status, afterClose: closed.status, finalPositions: closed.positions, sends: venue.sends, journal: closed });
}
await mkdir("evidence", { recursive: true });
await writeFile("evidence/simulation.json", JSON.stringify({ mode: "simulation", checkedAt: new Date().toISOString(), realTransactions: 0, results }, null, 2) + "\n");
console.table(results.map(({ journal: _journal, ...rest }) => rest));
