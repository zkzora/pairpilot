import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseUnits } from "viem";
import { simMarkets, simPrices } from "../../src/adapters/simulated";
import { summarizePair, type PairHistory } from "../../src/core/monitor";
import { makePlan } from "../../src/core/planner";
import type { OrderIntent, PairRecord } from "../../src/core/types";
import { PairSummaryView } from "./monitor";

/** What the closed-pair summary SAYS about funding and net in each attribution state. */
const usd = (v: string) => parseUnits(v, 18);
const plan = makePlan({ id: "ui", account: "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5", mode: "testnet", total: "50", slippageBps: 30, markets: simMarkets({ long: "ETH", short: "BTC" }), prices: simPrices({ long: "ETH", short: "BTC" }) });
const [ethPool, btcPool] = plan.legs.map(l => l.market.pool.toLowerCase());
const op = (leg: 0 | 1, kind: "open" | "close", hash: `0x${string}`, filled: bigint, price: string): OrderIntent => ({ id: hash, leg, kind, side: (leg === 0) === (kind === "open") ? "long" : "short", quantity: String(filled), limitPrice: "0", status: "confirmed", hash, filled: String(filled), fillValue: String(filled * usd(price)) });
const record: PairRecord = { version: 1, plan, status: "flat", positions: ["0", "0"], events: [{ at: 1_000, message: "flat" }],
  operations: [op(0, "open", "0xa1", 10n ** 16n, "2500"), op(1, "open", "0xb1", 30000n, "85000"), op(0, "close", "0xa2", 10n ** 16n, "2510"), op(1, "close", "0xb2", 30000n, "85000")] };
const history = (exclusivity: PairHistory["exclusivity"]): PairHistory => ({
  fills: new Map(), fees: [], receiptsRead: new Set(["0xa1", "0xb1", "0xa2", "0xb2"]), source: "chain+indexer", exclusivity,
  funding: [{ txHash: "0xa2", pool: ethPool, amount: usd("0.002") }, { txHash: "0xb2", pool: btcPool, amount: -usd("0.001") }],
});
const render = (h: PairHistory) => renderToStaticMarkup(<PairSummaryView record={record} summary={summarizePair(record, h)} history={{ state: "ok", history: h, at: 0 }} onLoad={() => {}} />).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const netRow = (text: string) => text.match(/ Net (?!before)(.*?) Final read-back/)![1] + " ";
const verified = { state: "verified" as const, throughBlock: 1n };

describe("closed pair summary wording", () => {
  it("shows an unqualified net only when both markets were verified as this pair's alone", () => {
    const text = render(history({ [ethPool]: verified, [btcPool]: verified }));
    expect(text).toContain("pays 0.0020 pair-exclusive");
    expect(netRow(text)).toBe("+0.0980 +0.0010 +0.0990 ");
    expect(netRow(text)).not.toContain("conditional");
  });
  it("labels funding and net conditional when the indexer could not confirm exclusivity", () => {
    const text = render(history({ [ethPool]: { state: "unverified", reason: "the indexer does not list 2 of this pair's transaction(s) yet" }, [btcPool]: verified }));
    expect(text).toContain("pays 0.0020 conditional");
    expect(netRow(text)).toBe("+0.0980 conditional +0.0010 +0.0990 conditional ");
    expect(text).toContain("ETH: exclusivity not verified (the indexer does not list 2 of this pair's transaction(s) yet)");
  });
  it("gives no net at all when another activity shared a market, but keeps net before funding", () => {
    const text = render(history({ [ethPool]: verified, [btcPool]: { state: "mixed", reason: "the owner already held a position in this market when the pair opened." } }));
    expect(text).toContain("receives 0.0010 shared with other activity");
    expect(netRow(text)).toBe("+0.0980 Not attributable Not attributable ");
    expect(text).toMatch(/Net before funding \+0\.1000 0\.0000 \+0\.1000/);
  });
});
