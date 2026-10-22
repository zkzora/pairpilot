import type { CloseReview, PairRecord } from "../../src/core/types";
import { base, limitText, signedBase } from "./view";

/** What the close will send: read from current positions and the book, before any signature. */
export function CloseReviewPanel({ review, record, now, busy, onCancel, onConfirm, onRefresh }: { review: CloseReview; record: PairRecord; now: number; busy: boolean; onCancel: () => void; onConfirm: () => void; onRefresh: () => void }) {
  const sim = record.plan.mode === "simulation", remaining = Math.max(0, review.expiresAt - now), expired = remaining === 0;
  return <section className="close-review" aria-label="Close review">
    <div className="head-row"><h2 className="sub">Close review</h2><span className="muted" style={{ fontSize: 13 }}>Nothing is signed yet</span>
      <span className={`end chip ${expired ? "t-warn" : "t-mute"}`} aria-live="off">{expired ? "Expired" : `Valid ${Math.ceil(remaining / 1000)} s`}</span></div>
    <div className="table" role="table" aria-label="Close orders">
      <div className="th" role="row"><span role="columnheader">Market</span><span className="r" role="columnheader">Open now</span><span className="r" role="columnheader">Close order</span><span className="r" role="columnheader">Price bound</span></div>
      {review.orders.map(o => { const leg = record.plan.legs[o.leg]; return <div role="row" key={o.leg}>
        <span role="cell">{leg.market.symbol}-PERP</span>
        <span className="r" role="cell">{signedBase(o.position, leg)}</span>
        <span className="r" role="cell">{o.side === "long" ? "Buy" : "Sell"} {base(o.quantity, leg)}</span>
        <span className="r" role="cell">{limitText(o.side, o.limitPrice, leg)}</span></div>; })}
    </div>
    {review.orders.length === 0 && <span className="muted">No close order can be sent.</span>}
    {review.residuals.map(r => <span key={r.leg} className="leg-note c-warn">{record.plan.legs[r.leg].market.symbol}: {signedBase(r.position, record.plan.legs[r.leg])} stays open, {r.reason}.</span>)}
    <div className="notes">
      <span>Each close is an IOC order bounded by the price above. It can fill partly or not at all; whatever remains stays visible as residual exposure.</span>
      {!sim && <span>Reduce-only is checked by this client against the position read just now, not enforced on-chain. Other trades or liquidation on this account can still change it.</span>}
    </div>
    <div className="actions end">
      <button type="button" className="btn" disabled={busy} onClick={onCancel}>Back</button>
      {expired ? <button type="button" className="btn primary" disabled={busy} onClick={onRefresh}>Review close again</button>
        : <button type="button" className="btn primary" disabled={busy || review.orders.length === 0} onClick={onConfirm}>{sim ? "Execute simulated close" : "Sign close orders"}</button>}
    </div>
  </section>;
}
