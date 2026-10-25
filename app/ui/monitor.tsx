import { useEffect, type ReactNode } from "react";
import { formatUnits } from "viem";
import type { FundingAttribution, MarksRead, MonitorView, PairHistory, PairSummary } from "../../src/core/monitor";
import type { PairRecord } from "../../src/core/types";
import { NETWORK } from "../../src/lib/network";
import { fixed, money, shortHash, signedBase, signedMoney } from "./view";

/** Display only. Every figure comes from src/core/monitor; null renders as "Unavailable", never 0. */
const time = (at: number) => new Date(at).toLocaleTimeString();
const NA = <span className="faint">Unavailable</span>;
const NOT_SIMULATED = <span className="faint">Not simulated</span>;
const price = (v: bigint | null, decimals: number) => v === null ? NA : fixed(v, decimals, 2);
const pnl = (v: bigint | null, decimals: number | null) => v === null || decimals === null ? NA : <span className={v > 0n ? "c-ok" : v < 0n ? "c-bad" : ""}>{signedMoney(v, decimals)}</span>;
/** Funding is stored as owed/paid: positive means the account pays. */
const funding = (v: bigint | null, decimals: number | null) => v === null || decimals === null ? NA : v === 0n ? "0" : v > 0n ? <span className="c-bad">pays {money(v, decimals)}</span> : <span className="c-ok">receives {money(-v, decimals)}</span>;
const bps = (b: number) => (b / 100).toFixed(1);
const SideTag = ({ side }: { side: "long" | "short" }) => <span className={`tag ${side === "long" ? "t-long" : "t-short"}`}>{side === "long" ? "LONG" : "SHORT"}</span>;

export interface MonitorState { read: MarksRead | null; error: string; loading: boolean; stale: boolean }

export function PairMonitor({ record, view, state, signer, disabled, onRefresh }: { record: PairRecord; view: MonitorView | null; state: MonitorState; signer: string; disabled: boolean; onRefresh: () => void }) {
  const sim = record.plan.mode === "simulation", legs = record.plan.legs, q = view?.quoteDecimals ?? null;
  const qd = legs[0].market.quoteDecimals;
  const read = state.read, block = read?.legs[0].asOfBlock;
  const tag = state.loading && !read ? "READING" : state.error ? "READ FAILED" : state.stale ? "STALE" : read ? (sim ? "SIMULATED" : "LIVE READ") : "NOT READ";
  const tone = state.error || state.stale ? "t-warn" : "t-mute";
  return <section className="monitor" aria-label="Active pair monitor" aria-busy={state.loading}>
    <div className="head-row">
      <h3 className="sub">Active pair monitor</h3>
      <span className={`tag ${tone}`}>{tag}</span>
      <span className="muted" style={{ fontSize: 12 }}>{read ? `${sim ? "Simulator" : "Chain"} read ${time(read.readAt)}${block !== null && block !== undefined ? ` · block ${block}` : ""}` : state.loading ? "Reading positions and marks…" : "No read yet"}</span>
      <button type="button" className="btn sm end" disabled={disabled || state.loading} onClick={onRefresh}>Refresh</button>
    </div>
    <span className="muted" style={{ fontSize: 12 }}>{legs[0].market.symbol}/{legs[1].market.symbol} · {sim ? "Simulation" : `Testnet · chain ${NETWORK.id}`} · owner <span className="mono" title={record.plan.account}>{sim ? "simulator" : shortHash(record.plan.account)}</span> · signer <span className="mono" title={signer}>{sim ? "none" : shortHash(signer)}</span></span>
    {state.error && <div className="alert warn plain" role="status"><span className="glyph" aria-hidden="true">!</span><div><span className="body pretty">Latest read failed: {state.error} {read ? `Figures below are from ${time(read.readAt)} and may be out of date.` : "No figures are shown until a read succeeds."}</span></div></div>}
    {!state.error && state.stale && read && <div className="alert warn plain" role="status"><span className="glyph" aria-hidden="true">!</span><div><span className="body pretty">This read is from {time(read.readAt)}. It is older than 45 seconds; press Refresh before acting on it.</span></div></div>}
    {view && <div className="table mon-table" role="table" aria-label="Current pair exposure">
      <div className="th" role="row"><span role="columnheader" /> {view.legs.map(l => <span key={l.symbol} className="r" role="columnheader"><SideTag side={l.side} /> {l.symbol}</span>)}<span className="r" role="columnheader">Pair</span></div>
      <div role="row"><span role="rowheader">Open now{sim ? "" : " · chain"}</span>{view.legs.map((l, i) => <span key={l.symbol} className={`r ${l.attribution === "differs" ? "c-warn" : ""}`} role="cell">{signedBase(l.chainSize, legs[i])}</span>)}<span className="r" role="cell" /></div>
      {view.legs.some(l => l.attribution === "differs") && <div role="row"><span role="rowheader">This pair&apos;s record</span>{view.legs.map((l, i) => <span key={l.symbol} className="r" role="cell">{signedBase(l.journalSize, legs[i])}</span>)}<span className="r" role="cell" /></div>}
      <div role="row"><span role="rowheader">Mark</span>{view.legs.map(l => <span key={l.symbol} className="r" role="cell">{price(l.mark, qd)}</span>)}<span className="r" role="cell" /></div>
      <div role="row"><span role="rowheader">Avg entry · owner</span>{view.legs.map(l => <span key={l.symbol} className="r" role="cell">{l.chainSize === 0n ? "—" : price(l.entry, qd)}</span>)}<span className="r" role="cell" /></div>
      <div role="row"><span role="rowheader">Marked value</span>{view.legs.map(l => <span key={l.symbol} className="r" role="cell">{l.markedNotional === null ? NA : money(l.markedNotional, qd)}</span>)}<span className="r" role="cell">{view.combinedNotional === null ? NA : money(view.combinedNotional, qd)}</span></div>
      <div role="row"><span role="rowheader">Allocation · now</span>{[0, 1].map(i => <span key={i} className="r" role="cell">{view.actualAllocationBps ? `${bps(view.actualAllocationBps[i])}%` : NA}</span>)}<span className="r muted" role="cell">plan {bps(view.plannedAllocationBps[0])} / {bps(view.plannedAllocationBps[1])}</span></div>
      <div role="row"><span role="rowheader">Unrealized · est.</span>{view.legs.map(l => <span key={l.symbol} className="r" role="cell">{pnl(l.unrealizedPnl, qd)}</span>)}<span className="r" role="cell">{pnl(view.combinedUnrealized, q)}</span></div>
      <div role="row"><span role="rowheader">Funding owed</span>{view.legs.map(l => <span key={l.symbol} className="r" role="cell">{sim ? NOT_SIMULATED : qualified(funding(l.accruedFunding, qd), l.accruedFunding === null ? null : "conditional")}</span>)}<span className="r" role="cell">{sim ? "" : funding(view.combinedFunding, q)}</span></div>
    </div>}
    {view && view.unavailable.length > 0 && <div className="notes" aria-label="Unavailable figures">{view.unavailable.map(u => <span key={u} className="c-warn">{u}</span>)}</div>}
    <div className="notes">
      <span>Values in USDso. Unrealized is an estimate: (mark − the owner&apos;s average entry) × open size, before fees and funding. A close fills at book prices, not the mark.{sim ? " Simulated marks are fixed, so it stays 0." : ""}</span>
      <span>Plan allocation uses preview prices; &quot;now&quot; uses current marks. Equal notional is not beta neutrality.</span>
      {!sim && <span>Funding owed is the owner&apos;s accrued funding in each market. It is shown only while the position equals this pair&apos;s record, and is this pair&apos;s only if nothing else traded the market since the pair opened.</span>}
      {!sim && <span>Reads every 15 s while this tab shows the pair, one at a time. Reads send nothing.</span>}
    </div>
  </section>;
}

/** Funding settled in a pair's receipts is the owner's whole position in that market: say whose it is. */
const ATTRIBUTION: Record<FundingAttribution, { text: string; tone: string }> = {
  exclusive: { text: "pair-exclusive", tone: "muted" }, "no-position": { text: "no position", tone: "muted" },
  conditional: { text: "conditional", tone: "c-warn" }, mixed: { text: "shared with other activity", tone: "c-warn" },
};
const qualified = (value: ReactNode, attribution: FundingAttribution | null) => attribution === null ? value
  : <span className="qualified">{value}<span className={`qual ${ATTRIBUTION[attribution].tone}`}>{ATTRIBUTION[attribution].text}</span></span>;
/** Net is unqualified only when funding is the pair's alone. */
function netCell(net: bigint | null, basis: "pair" | "conditional" | null, attribution: FundingAttribution | null, decimals: number | null) {
  if (attribution === "mixed") return <span className="faint">Not attributable</span>;
  if (net === null || decimals === null) return NA;
  return basis === "pair" ? pnl(net, decimals) : <span className="qualified">{pnl(net, decimals)}<span className="qual c-warn">conditional</span></span>;
}

export type HistoryState = { state: "loading" } | { state: "ok"; history: PairHistory; at: number } | { state: "error"; error: string };

export function PairSummaryView({ record, summary, history, onLoad }: { record: PairRecord; summary: PairSummary; history: HistoryState | undefined; onLoad: () => void }) {
  const testnet = record.plan.mode === "testnet", legs = record.plan.legs, q = summary.quoteDecimals, qd = legs[0].market.quoteDecimals;
  useEffect(() => { if (testnet && !history) onLoad(); }, [testnet, history, onLoad]);
  const qty = (v: bigint | null, i: number) => v === null ? NA : formatUnits(v, legs[i].market.baseDecimals);
  const rows: [string, (i: 0 | 1) => ReactNode, ReactNode][] = [
    ["Planned", i => qty(summary.legs[i].planned, i), ""],
    ["Filled on open", i => qty(summary.legs[i].opened, i), ""],
    ["Avg open price", i => price(summary.legs[i].avgOpenPrice, qd), ""],
    ["Closed", i => qty(summary.legs[i].closed, i), ""],
    ["Avg close price", i => summary.legs[i].closed === 0n ? "—" : price(summary.legs[i].avgClosePrice, qd), ""],
    ["Open now · recorded", i => signedBase(summary.legs[i].openNow, legs[i]), ""],
    ["Realized price PnL", i => pnl(summary.legs[i].realizedPricePnl, qd), pnl(summary.totals.realizedPricePnl, q)],
    ["Fees · receipts", i => !testnet ? NOT_SIMULATED : summary.legs[i].fees === null ? NA : money(summary.legs[i].fees!, qd), !testnet ? NOT_SIMULATED : summary.totals.fees === null || q === null ? NA : money(summary.totals.fees, q)],
    ["Net before funding", i => !testnet ? NOT_SIMULATED : pnl(summary.legs[i].netBeforeFunding, qd), !testnet ? NOT_SIMULATED : pnl(summary.totals.netBeforeFunding, q)],
    ["Funding · settled", i => !testnet ? NOT_SIMULATED : qualified(funding(summary.legs[i].funding, qd), summary.legs[i].fundingAttribution), !testnet ? NOT_SIMULATED : qualified(funding(summary.totals.funding, q), summary.totals.fundingAttribution)],
    ["Net", i => !testnet ? NOT_SIMULATED : netCell(summary.legs[i].net, summary.legs[i].netBasis, summary.legs[i].fundingAttribution, qd), !testnet ? NOT_SIMULATED : netCell(summary.totals.net, summary.totals.netBasis, summary.totals.fundingAttribution, q)],
  ];
  const txs = record.operations.filter(o => o.hash);
  return <section className="summary" aria-label="Pair summary">
    <div className="head-row">
      <h3 className="sub">{record.status === "flat" ? "Closed pair summary" : "Pair summary so far"}</h3>
      <span className={`tag ${testnet ? "t-net" : "t-sim"}`}>{testnet ? "TESTNET" : "SIMULATION"}</span>
      {testnet && <span className="muted" style={{ fontSize: 12 }}>{history?.state === "loading" ? "Reading receipts and checking the indexer…" : history?.state === "ok" ? `Receipts read ${time(history.at)}` : history?.state === "error" ? "History read failed" : ""}</span>}
      {testnet && history?.state !== "loading" && <button type="button" className="btn sm end" onClick={onLoad}>{history?.state === "error" ? "Read again" : "Re-read"}</button>}
    </div>
    {history?.state === "error" && <span className="c-warn" style={{ fontSize: 12 }}>{history.error} Fees and funding stay unavailable; fills come from the journal.</span>}
    <div className="table mon-table" role="table" aria-label="Planned versus actual">
      <div className="th" role="row"><span role="columnheader" />{summary.legs.map(l => <span key={l.symbol} className="r" role="columnheader"><SideTag side={l.side} /> {l.symbol}</span>)}<span className="r" role="columnheader">Pair</span></div>
      {rows.map(([k, cell, total]) => <div role="row" key={k}><span role="rowheader">{k}</span><span className="r" role="cell">{cell(0)}</span><span className="r" role="cell">{cell(1)}</span><span className="r" role="cell">{total}</span></div>)}
    </div>
    <div className="notes">
      {summary.flatReadBackAt !== null ? <span>Final read-back: both positions zero at {new Date(summary.flatReadBackAt).toLocaleString()}{testnet ? ", read from chain" : ", from the simulator"}.</span>
        : <span className="c-warn">Not flat: {summary.legs.map((l, i) => l.openNow === 0n ? "" : `${l.symbol} ${signedBase(l.openNow, legs[i])}`).filter(Boolean).join(" · ") || "no open quantity recorded, but the pair is not verified flat"}. Realized figures cover the closed part only.</span>}
      <span>Prices are this pair&apos;s own receipt fills (quantity × fill price), not limit prices. Realized price PnL uses this pair&apos;s average open price for the closed quantity.</span>
      <span>Net before funding = realized − fees, both from this pair&apos;s own receipts. Net also subtracts funding settled in those receipts; it is marked conditional unless the indexer shows each market was this pair&apos;s alone from open to close, and is not given when other activity shared a market. None of these is the account&apos;s equity change.</span>
      {summary.notes.map(n => <span key={n}>{n}</span>)}
    </div>
    {testnet && txs.length > 0 && <div className="notes" aria-label="Transactions">{txs.map(o => <a key={o.id} href={`${NETWORK.explorer}/tx/${o.hash}`} target="_blank" rel="noreferrer">{o.kind} {legs[o.leg].market.symbol} · {o.status}: {shortHash(o.hash!)} ↗</a>)}</div>}
  </section>;
}
