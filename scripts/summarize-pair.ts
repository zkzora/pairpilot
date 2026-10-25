import { readFile, writeFile } from "node:fs/promises";
import { formatUnits } from "viem";
import { readPairHistory } from "../src/adapters/dreamdex.js";
import { summarizePair } from "../src/core/monitor.js";
import type { PairRecord } from "../src/core/types.js";
import { createMarkets } from "../src/lib/network.js";

/**
 * Read-only closed-pair summary for testnet journals: planned vs filled, average fill prices
 * from receipts, realized price PnL, fees and funding from MarginBank events in the pair's own
 * receipts, and per market whether the indexer shows that market as this pair's alone. Cross-checks realized PnL against the indexer's own
 * MarginBank figure for each close. Sends nothing, needs no key.
 * Usage: npm run summary -- <journal.json>... [--out=evidence/pair-summaries.json]
 */
const args = process.argv.slice(2);
const out = args.find(a => a.startsWith("--out="))?.slice(6);
const files = args.filter(a => !a.startsWith("--"));
if (!files.length) throw new Error("Usage: npm run summary -- <pair journal JSON>... [--out=<file>]");
const text = (v: bigint | null, d: number | null) => v === null || d === null ? null : formatUnits(v, d);
const markets = createMarkets();
const results = [];
try {
  for (const file of files) {
    const record = JSON.parse(await readFile(file, "utf8")) as PairRecord;
    if (record.plan.mode !== "testnet") throw new Error(`${file}: only testnet journals have receipts.`);
    const history = await readPairHistory(markets, record);
    const s = summarizePair(record, history);
    const q = s.quoteDecimals;
    // Independent check: MarginBank's realized PnL for each close transaction, as indexed.
    const crossCheck = [];
    for (const o of record.operations.filter(o => o.kind === "close" && o.hash)) {
      const leg = record.plan.legs[o.leg];
      const rows = await markets.client.listPerpPositionChanges({ account: record.plan.account.toLowerCase(), pool: leg.market.pool.toLowerCase(), txHash: o.hash!.toLowerCase() });
      crossCheck.push({ leg: leg.market.symbol, txHash: o.hash, indexedRealizedPnl: rows.length ? formatUnits(rows.reduce((t, r) => t + r.realizedPnl, 0n), leg.market.quoteDecimals) : null });
    }
    const legs = s.legs.map((l, i) => {
      const leg = record.plan.legs[i], bd = leg.market.baseDecimals, qd = leg.market.quoteDecimals;
      return {
        symbol: l.symbol, side: l.side, planned: formatUnits(l.planned, bd), opened: text(l.opened, bd), avgOpenPrice: text(l.avgOpenPrice, qd),
        closed: text(l.closed, bd), avgClosePrice: text(l.avgClosePrice, qd), openNow: formatUnits(l.openNow, bd),
        realizedPricePnl: text(l.realizedPricePnl, qd), fees: text(l.fees, qd), netBeforeFunding: text(l.netBeforeFunding, qd),
        fundingPaid: text(l.funding, qd), fundingAttribution: l.fundingAttribution, exclusivity: history.exclusivity[leg.market.pool.toLowerCase()] ?? null,
        net: text(l.net, qd), netBasis: l.netBasis,
      };
    });
    const totals = { realizedPricePnl: text(s.totals.realizedPricePnl, q), fees: text(s.totals.fees, q), netBeforeFunding: text(s.totals.netBeforeFunding, q), fundingPaid: text(s.totals.funding, q), fundingAttribution: s.totals.fundingAttribution, net: text(s.totals.net, q), netBasis: s.totals.netBasis };
    const indexedTotal = crossCheck.every(c => c.indexedRealizedPnl !== null) && q !== null
      ? crossCheck.reduce((t, c) => t + Number(c.indexedRealizedPnl), 0) : null;
    results.push({ pair: record.plan.id, journal: file, status: record.status, legs, totals, flatReadBackAt: s.flatReadBackAt ? new Date(s.flatReadBackAt).toISOString() : null, notes: s.notes, crossCheck });
    console.log(`\n${legs[0].symbol}/${legs[1].symbol} ${record.plan.id.slice(0, 8)} · ${record.status}`);
    for (const l of legs) console.log(`  ${l.symbol} ${l.side}: opened ${l.opened ?? "unknown"} @ ${l.avgOpenPrice ?? "unknown"}, closed ${l.closed ?? "unknown"} @ ${l.avgClosePrice ?? "-"}; realized ${l.realizedPricePnl ?? "unknown"}, fees ${l.fees ?? "unknown"}, funding paid ${l.fundingPaid ?? "unknown"} (${l.fundingAttribution ?? "unknown"}${l.exclusivity && l.exclusivity.state !== "verified" ? `: ${l.exclusivity.reason}` : ""}), net ${l.net ?? "unknown"} (${l.netBasis ?? "-"})`);
    console.log(`  pair: realized ${totals.realizedPricePnl ?? "unknown"}, fees ${totals.fees ?? "unknown"}, net before funding ${totals.netBeforeFunding ?? "unknown"}, funding paid ${totals.fundingPaid ?? "unknown"} (${totals.fundingAttribution ?? "unknown"}), net ${totals.net ?? "unknown"} (${totals.netBasis ?? "-"})`);
    console.log(`  indexer realized PnL for the closes: ${indexedTotal === null ? "not indexed" : indexedTotal}`);
  }
} finally { await markets.close(); }
if (out) {
  await writeFile(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "read-only: chain receipts (fills, MarginBank fee and FundingSettled events, block times) and the dreamDEX indexer (per-market exclusivity check, realized PnL cross-check)", pairs: results }, (_k, v) => typeof v === "bigint" ? String(v) : v, 2)}\n`);
  console.log(`\nWrote ${out}`);
}
