import { formatUnits } from "viem";
import type { LiveSnapshot } from "../../src/adapters/dreamdex";
import { simMarkets, simPrices } from "../../src/adapters/simulated";
import { PAIR_PRESETS, pairLabel, presetOf, type PairSelection } from "../../src/core/pairs";
import { OPEN_HEADROOM_MS } from "../../src/core/engine";
import type { CloseReview, PairPlan, PairRecord } from "../../src/core/types";
import { CloseReviewPanel } from "./close";
import { NETWORK } from "../../src/lib/network";
import { Logo } from "./logo";
import { signed } from "../../src/core/types";
import { base, closableLegs, humanEvent, nextStep, legNotional, legView, limitText, pairAlert, pairStatus, pairSubtitle, percent, quote, shortHash, signedBase, totalNotional, type Alert, type LegView, type Tone } from "./view";

export { Logo };
export type Tab = "trade" | "activity" | "setup";
export type Mode = PairPlan["mode"];
export type AccountStatus = Awaited<ReturnType<import("../../src/adapters/dreamdex").DreamdexVenue["accountStatus"]>>;
const glyph: Record<Tone, string> = { ok: "✓", info: "i", warn: "!", bad: "!", mute: "i" };
const time = (at: number) => new Date(at).toLocaleTimeString();


export const SideTag = ({ side }: { side: "LONG" | "SHORT" }) => <span className={`tag ${side === "LONG" ? "t-long" : "t-short"}`}>{side}</span>;
export function Callout({ alert, live }: { alert: Alert; live?: boolean }) {
  return <div className={`alert ${alert.tone}`} role={live ? "status" : undefined}><span className="glyph" aria-hidden="true">{glyph[alert.tone]}</span><div><span className="title pretty">{alert.title}</span><span className="body pretty">{alert.body}</span></div></div>;
}

export function ModeSwitch({ mode, disabled, onChange }: { mode: Mode; disabled: boolean; onChange: (mode: Mode) => void }) {
  return <div className="seg" role="radiogroup" aria-label="Execution mode">
    {(["simulation", "testnet"] as const).map(value => <button key={value} type="button" role="radio" aria-checked={mode === value} className={value === "simulation" ? "sim" : "net"} disabled={disabled} onClick={() => mode !== value && onChange(value)}>{value === "simulation" ? "Simulation" : "Testnet"}</button>)}
  </div>;
}

export function MarketStrip({ mode, pair, snapshot, error, loading, disabled, onRefresh }: { mode: Mode; pair: PairSelection; snapshot: LiveSnapshot | null; error: string; loading: boolean; disabled: boolean; onRefresh: () => void }) {
  if (mode === "simulation") return <section className="strip sim-strip" aria-label="Simulated prices">
    {simMarkets(pair).map((m, i) => <div key={m.symbol}><div className="stat"><span className="k">{m.symbol}-PERP · Fixed price</span><span className="big">{quote(simPrices(pair)[i], m.quoteDecimals)}</span></div><div className="stat extra"><span className="k">Fills</span><span className="v">Simulated</span></div></div>)}
    <div className="meta"><div><span className="tag t-sim">FIXED SIMULATED PRICES</span><span className="muted" style={{ fontSize: 12 }}>Not live market data</span></div></div>
  </section>;
  return <section className="strip" aria-label="Testnet market snapshot" aria-busy={loading}>
    {snapshot?.markets.map(m => <div key={m.market.symbol}>
      <div className="stat" style={{ minWidth: 112 }}><span className="k">{m.market.symbol}-PERP · Mark</span><span className="big">{quote(m.mark, m.market.quoteDecimals)}</span></div>
      <div className="stat"><span className="k">Bid / Ask</span><span className="v">{quote(m.bid, m.market.quoteDecimals)} / {quote(m.ask, m.market.quoteDecimals)}</span></div>
      <div className="stat"><span className="k">Funding</span><span className="v">{(Number(formatUnits(BigInt(m.fundingRate), 18)) * 100).toFixed(4)}% <span className="muted" style={{ fontFamily: "var(--sans)" }}>per {m.fundingWindowSec / 3600}h</span></span></div>
    </div>)}
    <div className="meta">
      <div>
        <span className={`tag ${error ? "t-bad" : "t-mute"}`}>{loading ? "READING CHAIN" : error ? "READ FAILED" : snapshot ? "SNAPSHOT" : "NOT READ"}</span>
        {error ? <span className="error-line" role="alert">Market read failed: {error}</span> : <span className="muted" style={{ fontSize: 12 }}>{snapshot ? `Read ${time(Date.parse(snapshot.checkedAt))} · block ${snapshot.markets[0]?.bookBlock}` : loading ? "Reading Somnia Tokyo order books…" : "No snapshot yet"}</span>}
      </div>
      <button type="button" className="btn sm" style={{ flex: "none" }} disabled={loading || disabled} onClick={onRefresh}>Refresh prices</button>
    </div>
  </section>;
}

const exampleLegs = (pair: PairSelection) => [
  { side: "LONG" as const, market: `${pair.long}-PERP`, seq: "Order 1", desc: "Buys about half the notional with an IOC price limit." },
  { side: "SHORT" as const, market: `${pair.short}-PERP`, seq: "Order 2", desc: "Sells the other half after order 1 fills completely. It can fill differently." },
];
export function Hero({ pair }: { pair: PairSelection }) {
  return <div className="panel-body" style={{ gap: 24 }}>
    <div className="hero"><span className="eyebrow">No active pair</span><h1>Trade the pair. Track every leg.</h1><p>Long {pair.long} and short {pair.short} in one plan. See actual fills and manage unfinished execution.</p></div>
    <div className="cards">{exampleLegs(pair).map(x => <div className="card" key={x.market} style={{ flexBasis: 220, gap: 10 }}><div className="card-head"><SideTag side={x.side} /><span className="market">{x.market}</span><span className="end">{x.seq}</span></div><span className="muted pretty" style={{ fontSize: 13 }}>{x.desc}</span></div>)}</div>
    <details className="how-wrap">
      <summary>How it works</summary>
      <div className="how">{[["1", "Review", "Check both legs, quantities and price limits. Nothing is signed."], ["2", "Execute", "Two IOC orders are sent one after another. One can fill without the other."], ["3", "Reconcile & close", "Read back actual fills and positions, then close what is still open."]].map(([n, t, b]) => <div key={n}><span className="num">{n}</span><div><span className="t">{t}</span><span className="b">{b}</span></div></div>)}</div>
    </details>
  </div>;
}

export function Review({ plan, now, mode, accountLabel, scenario, dedicated, busy, onAck, onEdit, onRefresh, onSign }: { plan: PairPlan; now: number; mode: Mode; accountLabel: string; scenario: string; dedicated: boolean; busy: boolean; onAck: (v: boolean) => void; onEdit: () => void; onRefresh: () => void; onSign: () => void }) {
  const sim = mode === "simulation", remaining = Math.max(0, plan.expiresAt - now), low = remaining < OPEN_HEADROOM_MS;
  const total = totalNotional(plan), quoteDecimals = plan.legs[0].market.quoteDecimals;
  const seconds = Math.ceil(remaining / 1000);
  return <div className="panel-body">
    <div className="head-row">
      <h2 className="title">Review pair</h2><span className="muted" style={{ fontSize: 13 }}>Nothing is signed yet</span>
      <div className="timer"><span className="muted" style={{ fontSize: 12 }}>Preview expires in</span><span className={`v ${low ? "t-warn" : "t-mute"}`} aria-live="off">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
      <div className="track" aria-hidden="true"><div className={low ? "t-warn" : "t-mute"} style={{ width: `${remaining / 600}%` }} /></div>
    </div>
    <div className="cards">{plan.legs.map((leg, i) => {
      const long = leg.side === "long", sym = leg.market.symbol, bps = plan.slippageBps;
      const checks: [string, string, Tone][] = sim ? [["Above minimum after lot rounding", "OK", "ok"], ["Prices", "Fixed, simulated", "mute"]] : [["Mark price fresh", "OK", "ok"], ["Visible depth inside limit", "OK", "ok"], ["Above minimum after lot rounding", "OK", "ok"], ["Margin preview for this leg", "OK", "ok"]];
      return <div className="card" key={sym}>
        <div className="card-head"><SideTag side={long ? "LONG" : "SHORT"} /><span className="market">{sym}-PERP</span><span className="end">Order {i + 1}</span></div>
        <div className="qty"><span className="mono">{base(leg.quantity, leg)} {sym}</span><span className="muted">≈ {quote(legNotional(leg), leg.market.quoteDecimals)} USDso at limit</span></div>
        <div className="kv-grid">
          <div className="kv"><span className="k">Price limit</span><span className="v">{limitText(leg.side, leg.limitPrice, leg)}</span></div>
          <div className="kv"><span className="k">Reference</span><span className="v">{sim ? `Fixed ${quote(leg.referencePrice, leg.market.quoteDecimals)} ${long ? "+" : "−"} ${bps} bps` : `Best ${long ? "ask" : "bid"} ${quote(leg.referencePrice, leg.market.quoteDecimals)} ${long ? "+" : "−"} ${bps} bps`}</span></div>
          <div className="kv"><span className="k">Time in force</span><span className="v">IOC · unfilled part cancels</span></div>
          <div className="kv"><span className="k">Lot / minimum</span><span className="v">{base(leg.market.lot, leg)} / {base(leg.market.minimum, leg)} {sym}</span></div>
        </div>
        <div className="checks">{checks.map(([k, v, t]) => <div key={k}><span className="muted">{k}</span><span className={`tagv t-${t}`}>{v}</span></div>)}</div>
      </div>;
    })}</div>
    <div className="facts">
      {[["Account", sim ? "Simulator · no wallet" : accountLabel], ["Network", sim ? "Local simulator" : `${NETWORK.name.split(" / ")[0]} · chain ${NETWORK.id}`],
        ["Total notional", `${quote(total, quoteDecimals)} USDso at limits`], ["Allocation after rounding", `${percent(legNotional(plan.legs[0]), total)}% ${plan.legs[0].market.symbol} / ${percent(legNotional(plan.legs[1]), total)}% ${plan.legs[1].market.symbol}`],
        ["Execution", `Sequential: ${plan.legs[0].market.symbol} long, then ${plan.legs[1].market.symbol} short`], sim ? ["Scenario", scenario] : ["Perps margin", "Checked now, re-checked before each leg"]].map(([k, v]) => <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
    </div>
    <div className="alert warn plain"><span className="glyph" aria-hidden="true">!</span><div><span className="body pretty">Orders are sent one after another, not atomically. One leg can fill without the other. If that happens, you choose how to close the remaining exposure. Equal notional is not beta neutral or a guaranteed hedge.</span></div></div>
    {!sim && <label className="ack"><input type="checkbox" checked={dedicated} onChange={e => onAck(e.target.checked)} /><span className="pretty">The trading account is used only for PairPilot during this pair. No bot, resting order, stop or manual trade is active on it. I understand closing uses client-side position checks, not a contract-enforced reduce-only flag.</span></label>}
    {low && <div className="c-warn" style={{ fontSize: 13 }} role="status">{remaining === 0 ? "Preview expired." : `Less than ${OPEN_HEADROOM_MS / 1000} seconds left.`} Refresh the preview so both orders have time to land.</div>}
    <div className="actions end">
      <button type="button" className="btn" disabled={busy} onClick={onEdit}>Edit</button>
      {low ? <button type="button" className="btn primary" disabled={busy} onClick={onRefresh}>Refresh preview</button>
        : <button type="button" className="btn primary" disabled={busy || (!sim && !dedicated)} onClick={onSign}>{sim ? "Execute simulation" : "Sign & open testnet pair"}</button>}
    </div>
  </div>;
}

function Steps({ steps }: { steps: NonNullable<LegView["steps"]> }) {
  return <div className="steps">{steps.map((s, i) => <div key={i} className={s.state}><div className="bar" /><span className="lbl">{s.label}</span></div>)}</div>;
}
function LegCard({ view, mode }: { view: LegView; mode: Mode }) {
  return <div className="card" style={{ flexBasis: 280 }}>
    <div className="card-head"><SideTag side={view.side} /><span className="market">{view.market}</span><span className={`chip t-${view.tone}`} style={{ marginLeft: "auto" }}>{view.status}</span></div>
    {view.steps && <Steps steps={view.steps} />}
    <div className="kv-grid">{view.rows.map(r => <div className="kv" key={r.k}><span className="k">{r.k}</span><span className={`v mono ${r.tone ? `c-${r.tone}` : ""}`}>{r.v}</span></div>)}</div>
    {view.note && <span className="leg-note">{view.note}</span>}
    <div className="receipt"><span className="muted">Receipt</span>
      {mode === "simulation" ? <span className="faint">{view.hash ? "Simulated fill · no transaction" : "No simulated send"}</span>
        : view.hash ? <><span className="mono" style={{ color: "var(--text-2)" }} title={view.hash}>{shortHash(view.hash)}</span><a href={`${NETWORK.explorer}/tx/${view.hash}`} target="_blank" rel="noreferrer">Explorer ↗</a></>
        : <span className="faint">No transaction recorded</span>}
    </div>
  </div>;
}

export function Post({ record, busy, actionsDisabled, signerMismatch, closeReview, now, onReconcile, onClose, onConfirmClose, onCancelClose, onNew, onExport }: { record: PairRecord; busy: boolean; actionsDisabled: boolean; signerMismatch: string; closeReview: CloseReview | null; now: number; onReconcile: () => void; onClose: () => void; onConfirmClose: () => void; onCancelClose: () => void; onNew: () => void; onExport: () => void }) {
  const signer = record.plan.signer ?? record.plan.account, linked = signer.toLowerCase() !== record.plan.account.toLowerCase();
  actionsDisabled ||= Boolean(signerMismatch);
  const mode = record.plan.mode, status = pairStatus(record, busy), alert = pairAlert(record, busy);
  const unresolved = record.operations.some(o => o.status === "submitting" || o.status === "unknown");
  const needsReconcile = record.status === "attention" || unresolved || (!busy && (record.status === "opening" || record.status === "closing"));
  // Every remaining leg is under its market minimum: no close order exists to send.
  const onlyDust = record.status === "incomplete" && closableLegs(record).length === 0;
  const last = record.events.at(-1);
  return <div className="panel-body" style={{ gap: 18 }}>
    <div className="head-row">
      <span className="muted" style={{ fontSize: 13 }}>Pair <span className="mono" style={{ color: "var(--text-2)" }} title={record.plan.id}>{record.plan.id.slice(0, 4)}…{record.plan.id.slice(-4)}</span></span>
      <span className={`tag ${mode === "simulation" ? "t-sim" : "t-net"}`}>{mode === "simulation" ? "SIMULATION" : "TESTNET"}</span>
      {last && <span className="end muted" style={{ fontSize: 12 }}>Updated {time(last.at)}</span>}
    </div>
    {linked && <span className="muted" style={{ fontSize: 12 }}>Linked wallet · owner <span className="mono" title={record.plan.account}>{shortHash(record.plan.account)}</span> holds the positions · signer <span className="mono" title={signer}>{shortHash(signer)}</span> signs</span>}
    <div className="head-row" style={{ gap: "8px 12px" }}><span className={`overall c-${status.tone}`} aria-live="polite">{status.label}</span><span className="muted">{pairSubtitle(record, busy)}</span></div>
    {signerMismatch && <Callout alert={{ tone: "bad", title: "This pair belongs to another signer.", body: signerMismatch }} live />}
    {alert && <Callout alert={alert} live />}
    <div className="cards">{([0, 1] as const).map(i => <LegCard key={i} view={legView(record, i, busy)} mode={mode} />)}</div>
    {!closeReview && !signerMismatch && nextStep(record, busy) && <div className="next-step" aria-label="Next step"><span className="k">Next step</span><p className="pretty">{nextStep(record, busy)}{mode === "testnet" && record.operations.some(o => (o.status === "submitting" || o.status === "unknown") && !o.hash) && <> <a href={`${NETWORK.explorer}/address/${record.plan.signer ?? record.plan.account}`} target="_blank" rel="noreferrer">Open signer history ↗</a></>}</p></div>}
    {closeReview ? <CloseReviewPanel review={closeReview} record={record} now={now} busy={actionsDisabled} onCancel={onCancelClose} onConfirm={onConfirmClose} onRefresh={onClose} /> : <>
    <div className="actions">
      {record.status === "flat"
        ? <button type="button" className="btn primary" disabled={actionsDisabled} onClick={onNew}>New pair</button>
        : <button type="button" className={`btn ${needsReconcile || onlyDust ? "" : "primary"}`} disabled={actionsDisabled || needsReconcile || onlyDust} onClick={onClose}>{record.status === "paired" ? "Close pair" : "Close remaining exposure"}</button>}
      {record.status !== "flat" && <button type="button" className={`btn ${needsReconcile ? "primary" : ""}`} disabled={actionsDisabled} onClick={onReconcile}>Reconcile</button>}
      <button type="button" className="btn" disabled={busy} onClick={onExport}>Export JSON</button>
    </div>
    <div className="notes">
      {record.status !== "flat" && <span>Reconcile reads receipts and positions. Sends no orders.</span>}
      {needsReconcile && <span>There is no retry button: resending could open a duplicate order.</span>}
      {onlyDust && <span>Close is disabled: the remaining amount is below the market minimum, so there is no order to send.</span>}
      {record.status !== "flat" && <span>Close opens a review of the actual remaining quantities and price bounds first. {mode === "simulation" ? "Simulated closes use fixed prices and the selected scenario." : "Reduce-only is a client-side check, not enforced on-chain."}</span>}
    </div>
    </>}
  </div>;
}

export function Ticket(props: {
  mode: Mode; plan: PairPlan | null; record: PairRecord | null; busy: string; mounted: boolean; previewBlock: string;
  pair: PairSelection; onPair: (p: PairSelection) => void;
  total: string; slippage: string; scenario: string; scenarios: { value: string; label: string }[];
  onTotal: (v: string) => void; onSlippage: (v: string) => void; onScenario: (v: string) => void; onPreview: () => void; onEdit: () => void; onReset: () => void;
}) {
  const { mode, plan, record, busy, total, slippage } = props, sim = mode === "simulation";
  const locked = Boolean(record && record.status !== "flat" && !plan);
  // Positions are chain-verified after each order; attention/interrupted records only hold the last recorded value.
  const settledRecord = record?.status === "paired" || record?.status === "incomplete";
  const reviewing = Boolean(plan);
  const value = Number(total), over = !sim && value > 200, invalid = !(value > 0);
  const slip = Number(slippage);
  const legs = (record?.plan ?? plan)?.legs;
  return <aside className="ticket" aria-label="Pair ticket">
    <div className="ticket-head"><h2 className="sub">Pair ticket</h2><span className="end">{reviewing ? "Locked while reviewing" : locked && legs ? `Pair active · ${legs[0].market.symbol}/${legs[1].market.symbol}` : `Long ${props.pair.long} / Short ${props.pair.short}`}</span></div>
    {locked && legs ? <>
      <div className="box">One active pair per account. Close or resolve the current pair before opening another.</div>
      <div className="ticket-group" aria-label="Current exposure">
        <span className="hint">{settledRecord ? "Open now" : "Last recorded, not re-read"}</span>
        {legs.map((l, i) => { const open = BigInt(record!.positions[i]), off = open !== signed(l.side, BigInt(l.quantity)) && open !== 0n; return <div className="line" key={l.market.symbol}><span className="k">{l.market.symbol}-PERP</span><span className={`v mono ${off ? "c-warn" : ""}`}>{signedBase(open, l)} {l.market.symbol}</span></div>; })}
      </div>
      <div className="ticket-group plan" aria-label="Original plan">
        <span className="hint">Original plan · not current exposure</span>
        {legs.map(l => <div className="line" key={l.market.symbol}><span className="k">{l.side === "long" ? "Long" : "Short"} {l.market.symbol}-PERP</span><span className="v mono">{base(l.quantity, l)} {l.market.symbol}</span></div>)}
        <div className="line"><span className="k">Total at limits</span><span className="v mono">{quote(totalNotional(record!.plan), legs[0].market.quoteDecimals)} USDso</span></div>
        <div className="line"><span className="k">Slippage</span><span className="v mono">{record!.plan.slippageBps} bps</span></div>
      </div>
      <button type="button" className="btn primary full" disabled>Preview pair</button>
    </> : <form style={{ display: "contents" }} onSubmit={e => { e.preventDefault(); props.onPreview(); }}>
      <PairPicker pair={props.pair} disabled={Boolean(busy)} onPair={props.onPair} />
      {sim && <div className="field"><label htmlFor="scenario">Failure scenario</label><div className="input"><select id="scenario" value={props.scenario} disabled={Boolean(busy) || reviewing} onChange={e => props.onScenario(e.target.value)}>{props.scenarios.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div><span className="hint">Injected locally; not venue findings.</span></div>}
      <div className="field-row">
      <div className="field"><label htmlFor="total">Total notional</label>
        <div className={`input ${over || invalid ? "invalid" : ""}`}><input id="total" value={total} onChange={e => props.onTotal(e.target.value)} disabled={Boolean(busy) || reviewing} type="text" inputMode="decimal" autoComplete="off" required aria-describedby="total-help" aria-invalid={over || invalid} /><span className="unit">USDso</span></div>
        <span id="total-help" className={`hint ${over || invalid ? "bad" : ""}`}>{over ? "Testnet max is 200 USDso." : sim ? "Both legs, not collateral." : "Both legs, not collateral. Max 200."}</span>
      </div>
      <div className="field"><label htmlFor="slippage">Slippage tolerance</label>
        <div className="input"><input id="slippage" value={slippage} onChange={e => props.onSlippage(e.target.value)} disabled={Boolean(busy) || reviewing} type="text" inputMode="numeric" autoComplete="off" required aria-describedby="slippage-help" /><span className="unit">bps</span></div>
        <span id="slippage-help" className="hint">{Number.isFinite(slip) ? `${(slip / 100).toFixed(2)}%` : "—"} · 1–100 bps per IOC limit.</span>
      </div>
      </div>
      <details className="ticket-facts">
        <summary>Execution rules</summary>
        <div className="line"><span className="k">Execution</span><span className="v">IOC with price limit · sequential</span></div>
        <div className="line"><span className="k">Recovery</span><span className="v">Explicit unwind · you start it</span></div>
        <div className="line"><span className="k">Perps margin</span><span className="v muted">{sim ? "Not used" : "Checked at preview"}</span></div>
      </details>
      {reviewing ? <button type="button" className="btn full" disabled={Boolean(busy)} onClick={props.onEdit}>Edit ticket</button>
        : <button type="submit" className="btn primary full" disabled={!props.mounted || Boolean(busy) || over || invalid || Boolean(props.previewBlock)} aria-busy={Boolean(busy)}>Preview pair</button>}
      <span className="center-hint">{reviewing ? "Inputs stay fixed until you edit" : props.previewBlock || "Preview does not sign anything"}</span>
      {sim && <button type="button" className="link-btn reset-link" disabled={Boolean(busy)} onClick={props.onReset}>Reset simulation</button>}
    </form>}
  </aside>;
}

export function Journal({ record, open, onToggle }: { record: PairRecord | null; open: boolean; onToggle: () => void }) {
  const events = record?.events ?? [];
  return <section className="journal" aria-label="Execution journal">
    <div className="journal-head"><button type="button" aria-expanded={open} onClick={onToggle}><span className="glyph" aria-hidden="true">{open ? "−" : "+"}</span>Execution journal</button><span className="muted" style={{ fontSize: 12 }}>{events.length ? `${events.length} events` : "Empty"}</span></div>
    {open && <div className="journal-body">
      {events.length === 0 && <div className="row"><span className="faint">No operations yet.</span></div>}
      {events.map((e, i) => <div className="row" key={i}><time>{time(e.at)}</time><span>{e.message}</span></div>)}
      {record && record.operations.length > 0 && <>
        <h3>Operations · raw units</h3>
        <table><thead><tr><th>Operation</th><th>Side</th><th>Quantity</th><th>Limit</th><th>Filled</th><th>Status</th><th>{record.plan.mode === "simulation" ? "Hash · synthetic" : "Hash"}</th></tr></thead>
          <tbody>{record.operations.map(o => <tr key={o.id}><td>{o.kind} {record.plan.legs[o.leg].market.symbol}</td><td>{o.side}</td><td>{o.quantity}</td><td>{o.limitPrice}</td><td>{o.filled ?? "—"}</td><td>{o.status}</td><td>{o.hash ?? "none"}</td></tr>)}</tbody></table>
      </>}
    </div>}
  </section>;
}

export function Activity({ mode, account, records, activeId, filter, selectedId, onFilter, onSelect, onResolve, onExport, onSimulate }: { mode: Mode; account: string; records: PairRecord[]; activeId: string | null; filter: "all" | "active" | "closed"; selectedId: string | null; onFilter: (f: "all" | "active" | "closed") => void; onSelect: (id: string) => void; onResolve: () => void; onExport: (r: PairRecord) => void; onSimulate: () => void }) {
  const shown = records.filter(r => filter === "all" || (filter === "closed" ? r.status === "flat" : r.status !== "flat"));
  const sel = shown.find(r => r.plan.id === selectedId) ?? shown[0];
  const scope = mode === "simulation" ? "Simulation · this browser" : `Testnet · ${account ? shortHash(account) : "no wallet connected"} · this browser`;
  return <>
    <div className="page-head">
      <div><h1>Activity</h1><span className="muted pretty" style={{ fontSize: 13 }}>{scope}</span></div>
      <div className="seg" role="group" aria-label="Filter pairs">{([["all", "All"], ["active", "Active or unresolved"], ["closed", "Closed"]] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => onFilter(k)}>{label}</button>)}</div>
    </div>
    <div className="dashed">History in this browser only. It is not the full wallet history, and the CLI journal is kept separately in .pairpilot/.</div>
    {mode === "testnet" && !account ? <div className="empty-state"><span>Connect your testnet wallet to see its pairs recorded in this browser.</span></div>
      : records.length === 0 ? <div className="empty-state"><span>No pair activity in this browser yet.{mode === "simulation" ? " Create a simulated pair to explore the workflow." : ""}</span>{mode === "simulation" && <button type="button" className="btn primary" onClick={onSimulate}>Open Trade in Simulation</button>}</div>
      : <div className="work">
        <div className="list">
          {shown.map(r => { const s = pairStatus(r, false); return <button key={r.plan.id} type="button" aria-current={r.plan.id === sel?.plan.id} onClick={() => onSelect(r.plan.id)}>
            <div><span style={{ fontWeight: 500 }}>Long {r.plan.legs[0].market.symbol} / Short {r.plan.legs[1].market.symbol}</span><span className="meta">{new Date(r.plan.createdAt).toLocaleString()} · <span className="mono">{r.plan.id.slice(0, 8)}</span> · {r.operations.length} operations</span></div>
            <span className={`chip t-${s.tone}`}>{s.label}</span></button>; })}
          {shown.length === 0 && <div className="none">No pairs match this filter.</div>}
        </div>
        {sel && <ActivityDetail record={sel} active={sel.plan.id === activeId} onResolve={onResolve} onExport={() => onExport(sel)} />}
      </div>}
  </>;
}
function ActivityDetail({ record, active, onResolve, onExport }: { record: PairRecord; active: boolean; onResolve: () => void; onExport: () => void }) {
  const s = pairStatus(record, false), testnet = record.plan.mode === "testnet";
  return <div className="detail">
    <div className="head-row"><span className="muted" style={{ fontSize: 13 }}>Pair <span className="mono" style={{ color: "var(--text-2)" }}>{record.plan.id.slice(0, 8)}</span> · {new Date(record.plan.createdAt).toLocaleString()}</span><span className={`chip end t-${s.tone}`}>{s.label}</span></div>
    <div className="table" role="table" aria-label="Leg quantities">
      <div className="th" role="row"><span role="columnheader">Leg</span><span className="r" role="columnheader">Requested</span><span className="r" role="columnheader">Filled</span><span className="r" role="columnheader">Open · recorded</span></div>
      {record.plan.legs.map((leg, i) => { const rows = legView(record, i as 0 | 1, false).rows; return <div role="row" key={leg.market.symbol}>
        <span className="leg" role="cell"><SideTag side={leg.side === "long" ? "LONG" : "SHORT"} />{leg.market.symbol}-PERP</span>
        <span className="r" role="cell">{base(leg.quantity, leg)}</span><span className="r" role="cell">{rows[1].v.split(" ")[0]}</span><span className="r" role="cell">{rows.find(r => r.k === "Open now" || r.k === "Last recorded")!.v.split(" ")[0]}</span></div>; })}
    </div>
    <div className="timeline"><span className="tl-title">Timeline</span>
      {record.events.map((e, i) => <div className="ev" key={i}><div className="rail"><span className="d" /><span className="l" /></div><div><span>{humanEvent(e.message, record.plan)}</span><time>{time(e.at)}</time></div></div>)}
    </div>
    {testnet && record.operations.some(o => o.hash) && <div className="notes">{record.operations.filter(o => o.hash).map(o => <a key={o.id} href={`${NETWORK.explorer}/tx/${o.hash}`} target="_blank" rel="noreferrer">{o.kind} {record.plan.legs[o.leg].market.symbol}: {shortHash(o.hash!)} ↗</a>)}</div>}
    {!active && record.status !== "flat" && <span className="leg-note">This record is no longer the active pair for this account{record.plan.mode === "simulation" ? " (the simulator was reset)" : ""}. It is kept as history.</span>}
    <div className="actions">
      {active && record.status !== "flat" && <button type="button" className="btn primary" onClick={onResolve}>Resolve in Trade</button>}
      <button type="button" className="btn" onClick={onExport}>Export JSON</button>
    </div>
  </div>;
}

/** Pair preset plus direction. Presets go first asset LONG; Swap reverses. Allocation stays about 50/50. */
function PairPicker({ pair, disabled, onPair }: { pair: PairSelection; disabled: boolean; onPair: (p: PairSelection) => void }) {
  const { index, reversed } = presetOf(pair);
  return <div className="pair-picker">
    <div className="pair-row">
      <div className="field" style={{ flex: 1, minWidth: 0 }}>
        <label htmlFor="pair">Pair</label>
        <div className="input"><select id="pair" value={index} disabled={disabled} onChange={e => onPair(PAIR_PRESETS[Number(e.target.value)])}>
          {PAIR_PRESETS.map((p, i) => <option key={pairLabel(p)} value={i}>{i === index && reversed ? `${p.short} / ${p.long} (swapped)` : `${p.long} / ${p.short}`}</option>)}
        </select></div>
      </div>
      <button type="button" className="btn sm swap" disabled={disabled} onClick={() => onPair({ long: pair.short, short: pair.long })} title="Swap which asset is long and which is short">⇄ Swap direction</button>
    </div>
    <div className="legs-fixed" aria-label="Selected legs">
      <span className="hint">First asset long, second short · ≈ 50% each</span>
      {exampleLegs(pair).map(x => <div key={x.market}><SideTag side={x.side} /><span style={{ fontWeight: 500 }}>{x.market}</span></div>)}
    </div>
  </div>;
}
