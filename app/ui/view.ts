import { formatUnits } from "viem";
import { grid } from "../../src/core/planner";
import { absolute, type LegPlan, type OrderIntent, type PairPlan, type PairRecord } from "../../src/core/types";

/** Display-only derivations from the durable journal. Execution decisions stay in src/core. */
export type Tone = "ok" | "info" | "warn" | "bad" | "mute";
export type StepState = "done" | "active" | "warn" | "bad" | "idle";
export interface Row { k: string; v: string; tone?: Tone }
export interface LegView { side: "LONG" | "SHORT"; market: string; symbol: string; status: string; tone: Tone; steps: { label: string; state: StepState }[] | null; rows: Row[]; hash?: string; note?: string }
export interface Alert { tone: Tone; title: string; body: string }

export const base = (raw: string | bigint, leg: LegPlan) => formatUnits(BigInt(raw), leg.market.baseDecimals);
export const signedBase = (raw: string | bigint, leg: LegPlan) => {
  const value = BigInt(raw);
  return value === 0n ? "0" : `${value > 0n ? "+" : "−"}${formatUnits(absolute(value), leg.market.baseDecimals)}`;
};
export function quote(raw: string | bigint | null, decimals = 18) {
  return raw === null ? "Unavailable" : Number(formatUnits(BigInt(raw), decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
/** Exact display rounding (half away from zero) of a raw bigint to `places` decimals. No floats. */
export function fixed(raw: bigint, decimals: number, places: number) {
  const negative = raw < 0n, abs = negative ? -raw : raw;
  const step = decimals > places ? 10n ** BigInt(decimals - places) : 1n;
  const rounded = (abs + step / 2n) / step * step;
  const [whole, frac = ""] = formatUnits(rounded, decimals).split(".");
  return `${negative && rounded !== 0n ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${places ? `.${frac.padEnd(places, "0").slice(0, places)}` : ""}`;
}
/** Quote money: 4 decimals under 1 USDso so small PnL and funding stay visible, else 2. */
export const money = (raw: bigint, decimals: number) => fixed(raw, decimals, absolute(raw) < 10n ** BigInt(decimals) ? 4 : 2);
export const signedMoney = (raw: bigint, decimals: number) => `${raw > 0n ? "+" : ""}${money(raw, decimals)}`;
/** An open leg no order can close: after lot rounding it is under the market minimum. */
export function belowMinimum(record: PairRecord, index: 0 | 1) {
  const position = absolute(BigInt(record.positions[index])), market = record.plan.legs[index].market;
  return position !== 0n && grid(position, BigInt(market.lot)) < BigInt(market.minimum);
}
/** Open legs that a close order can actually reduce. */
export const closableLegs = (record: PairRecord) => ([0, 1] as const).filter(i => record.positions[i] !== "0" && !belowMinimum(record, i));
export const shortHash = (hash: string) => hash.length > 14 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
export const limitText = (side: OrderIntent["side"], price: string, leg: LegPlan) => `${side === "long" ? "≤" : "≥"} ${quote(price, leg.market.quoteDecimals)}`;
/** Worst-case quote value at the order's limit; the same bound assertReady caps. */
export const legNotional = (leg: LegPlan) => BigInt(leg.limitPrice) * BigInt(leg.quantity) / 10n ** BigInt(leg.market.baseDecimals);
export const totalNotional = (plan: PairPlan) => legNotional(plan.legs[0]) + legNotional(plan.legs[1]);
export const percent = (part: bigint, whole: bigint) => whole === 0n ? "0.0" : (Number(part * 1000n / whole) / 10).toFixed(1);
const unresolved = (o: OrderIntent) => o.status === "submitting" || o.status === "unknown";
const settled = (record: PairRecord, busy: boolean) => busy || (record.status !== "opening" && record.status !== "closing");
const sideWord = (leg: LegPlan) => `${leg.market.symbol} ${leg.side}`;

/** Sum of confirmed fills; null while any operation's outcome is still unknown. */
function filled(ops: OrderIntent[]) {
  return ops.some(unresolved) ? null : ops.reduce((total, o) => total + BigInt(o.filled ?? "0"), 0n);
}

export function pairStatus(record: PairRecord, busy: boolean): { label: string; tone: Tone } {
  const closing = record.operations.some(o => o.kind === "close");
  if (record.status === "paired") return { label: "Pair open", tone: "info" };
  if (record.status === "flat") return { label: "Flat", tone: "ok" };
  if (record.status === "incomplete") return { label: closing ? "Residual exposure" : "Incomplete", tone: "warn" };
  if (busy && (record.status === "opening" || record.status === "closing")) return { label: record.status === "opening" ? "Executing" : "Closing", tone: "info" };
  // attention, or a run that stopped mid-send without recording its result.
  return { label: "Needs reconciliation", tone: "warn" };
}

export function pairSubtitle(record: PairRecord, busy: boolean) {
  const last = record.operations.at(-1);
  if (busy && last) return `Order ${record.operations.length} · ${last.kind} ${record.plan.legs[last.leg].market.symbol}`;
  if (busy) return "Checking account and preparing order 1";
  if (record.status === "paired") return "Both legs filled and read back";
  if (record.status === "flat") return "Verified by read-back";
  if (record.status === "incomplete") return record.operations.some(o => o.kind === "close") ? "Close did not finish" : "The pair did not fill as planned";
  return "New orders blocked until reconciled";
}

export function legView(record: PairRecord, index: 0 | 1, busy: boolean): LegView {
  const leg = record.plan.legs[index], symbol = leg.market.symbol, sim = record.plan.mode === "simulation";
  const ops = record.operations.filter(o => o.leg === index);
  const opens = ops.filter(o => o.kind === "open"), closes = ops.filter(o => o.kind === "close");
  const last = ops.at(-1);
  const position = BigInt(record.positions[index]);
  const opened = filled(opens);
  const view: LegView = { side: leg.side === "long" ? "LONG" : "SHORT", market: `${symbol}-PERP`, symbol, status: "Not sent", tone: "mute", steps: null, rows: [] };
  const stepLabels = [sim ? "Prepared" : "Wallet", "Submitted", "Confirmed", last?.kind === "close" ? "Closed" : "Filled"];
  const steps = (states: StepState[], labels: (string | undefined)[] = []) => states.map((state, i) => ({ label: labels[i] ?? stepLabels[i], state }));

  if (!last) {
    view.status = busy && record.status === "opening" ? "Queued" : "Not sent";
    if (index === 1 && !busy && opens.length === 0 && record.operations.some(o => o.leg === 0)) view.note = "Order 2 is sent only after order 1 fills completely.";
  } else if (last.status === "submitting" && !last.hash) {
    [view.status, view.tone] = busy ? [sim ? "Sending" : "Waiting for wallet", "info"] : ["Interrupted", "bad"];
    view.steps = steps([busy ? "active" : "bad", "idle", "idle", "idle"]);
    if (!busy) view.note = "The send stopped before a transaction hash was saved. Check the account nonce and history; do not retry.";
  } else if (unresolved(last)) {
    const waiting = busy && last.status === "submitting";
    [view.status, view.tone] = waiting ? ["Waiting for receipt", "info"] : ["Outcome unknown", "warn"];
    view.steps = steps(waiting ? ["done", "done", "active", "idle"] : ["done", "done", "warn", "idle"], [undefined, undefined, waiting ? undefined : "No receipt"]);
    if (!waiting) view.note = "Broadcast, but no receipt was read. Reconcile reads it again; nothing is resent.";
  } else if (last.status === "rejected") {
    [view.status, view.tone] = last.hash ? ["Reverted", "bad"] : ["Signature rejected", "bad"];
    view.steps = steps(last.hash ? ["done", "done", "bad", "idle"] : ["bad", "idle", "idle", "idle"], last.hash ? [undefined, undefined, "Reverted"] : ["Rejected"]);
    view.note = last.message;
  } else {
    const amount = BigInt(last.filled ?? "0"), complete = last.kind === "open" ? amount === BigInt(last.quantity) : position === 0n;
    if (last.kind === "open") [view.status, view.tone] = complete ? ["Filled", "ok"] : amount === 0n ? ["No fill", "warn"] : ["Partial fill", "warn"];
    else [view.status, view.tone] = complete ? ["Closed", "mute"] : ["Residual", "warn"];
    view.steps = steps(["done", "done", "done", complete ? "done" : "warn"], [undefined, undefined, undefined, complete ? undefined : amount === 0n ? "No fill" : "Partial"]);
    if (!complete && last.kind === "open") view.note = `Unfilled ${base(BigInt(last.quantity) - amount, leg)} ${symbol} was cancelled by IOC. PairPilot does not resend it.`;
    if (!complete && last.kind === "close") view.note = amount === 0n
      ? `The close got no fill within its limit, so the position is unchanged. Nothing was resent.`
      : `Close filled ${base(amount, leg)} of ${base(last.quantity, leg)} ${symbol} within its limit. The rest stays open.`;
  }
  view.hash = last?.hash;
  if (belowMinimum(record, index) && settled(record, busy)) {
    [view.status, view.tone] = ["Below minimum", "warn"];
    view.note = `${signedBase(position, leg)} ${symbol} is under the ${base(leg.market.minimum, leg)} ${symbol} market minimum. No order can close it; it stays open and visible.`;
  }

  const recorded = settled(record, busy) && record.status !== "attention";
  const exposed = (record.status === "incomplete" || !recorded) && position !== 0n;
  view.rows = [
    { k: "Requested", v: `${base(leg.quantity, leg)} ${symbol}` },
    { k: "Filled", v: opened === null ? "Unknown" : `${base(opened, leg)} ${symbol}`, tone: opened === null || (opens.length > 0 && opened !== BigInt(leg.quantity)) ? "warn" : undefined },
    { k: recorded ? "Open now" : "Last recorded", v: `${signedBase(position, leg)} ${symbol}`, tone: exposed ? "warn" : undefined },
    { k: last?.kind === "close" ? "Close limit" : "Price limit", v: limitText(last?.side ?? leg.side, last?.limitPrice ?? leg.limitPrice, leg) },
  ];
  if (closes.length) {
    const closed = filled(closes);
    view.rows.splice(2, 0, { k: "Close filled", v: closed === null ? "Unknown" : `${base(closed, leg)} ${symbol}`, tone: closed === null ? "warn" : undefined });
  }
  return view;
}

export function pairAlert(record: PairRecord, busy: boolean): Alert | null {
  const sim = record.plan.mode === "simulation", legs = record.plan.legs;
  const last = record.operations.at(-1);
  if (busy) {
    if (!sim && last?.status === "submitting" && !last.hash) {
      const other = legs[last.leg === 0 ? 1 : 0];
      return { tone: "info", title: `Confirm the ${sideWord(legs[last.leg])} in your wallet.`, body: last.kind === "open" && last.leg === 1 ? `The ${sideWord(other)} is already open. If you reject this signature, it stays open without its hedge.` : "Rejecting this signature sends no order for this leg." };
    }
    return { tone: "info", title: "Recording the result. Keep this tab open.", body: "Receipts and positions are read back before the next step." };
  }
  const pending = record.operations.find(unresolved);
  if (pending && !pending.hash) return { tone: "bad", title: "An interrupted send has no transaction hash.", body: "PairPilot cannot prove whether it was broadcast. Do not retry: check the account nonce and history on the explorer before any new order." };
  if (pending) return { tone: "warn", title: "A transaction outcome is unknown. Reconcile before sending another order.", body: `The ${sideWord(legs[pending.leg])} ${pending.kind} was ${sim ? "sent by the simulator with synthetic hash" : "broadcast as"} ${shortHash(pending.hash!)}, but no receipt was read. Opening and closing are blocked until it is reconciled.` };
  if (record.status === "attention" || !settled(record, busy)) return { tone: "warn", title: "Positions need checking before another order.", body: record.events.at(-1)?.message ?? "Reconcile reads receipts and positions." };
  if (record.status === "incomplete") {
    const dust = ([0, 1] as const).filter(i => belowMinimum(record, i));
    if (dust.length && closableLegs(record).length === 0) {
      const parts = dust.map(i => { const leg = legs[i], value = BigInt(record.positions[i]); return `${leg.market.symbol} ${signedBase(value, leg)} (minimum ${base(leg.market.minimum, leg)}, about ${quote(absolute(value) * BigInt(leg.referencePrice) / 10n ** BigInt(leg.market.baseDecimals), leg.market.quoteDecimals)} USDso)`; });
      return { tone: "warn", title: `${parts.length > 1 ? "These amounts are" : "This amount is"} below the market minimum. No order can close ${parts.length > 1 ? "them" : "it"}.`, body: `${parts.join(" · ")} stays open. The venue rejects orders smaller than its minimum, so PairPilot cannot send one; the exposure is shown here, never reported as flat.` };
    }
    const open = legs.map((leg, i) => ({ leg, value: BigInt(record.positions[i]) })).filter(x => x.value !== 0n).map(x => `${x.leg.market.symbol} ${signedBase(x.value, x.leg)} open`);
    const closing = record.operations.some(o => o.kind === "close");
    return { tone: "warn", title: closing ? "Closing may partially fill or fail. Remaining exposure stays open." : "One or both legs are incomplete. Review the open quantities below.", body: `${open.join(" · ") || "No open quantity"}. Unfilled IOC quantity was cancelled; nothing is resent automatically.` };
  }
  if (record.status === "flat") {
    const at = record.events.at(-1)?.at;
    return { tone: "ok", title: "Both positions were read back as zero.", body: `${sim ? "Read from the simulator" : "Read from chain"}${at ? ` at ${new Date(at).toLocaleTimeString()}` : ""}.` };
  }
  return null;
}

/** Activity timeline wording: human amounts and short hashes. Raw units stay in the journal. */
export function humanEvent(message: string, plan: PairPlan): string {
  return message
    .replace(/\b(open|close) (\w+): (\d+) raw units filled/g, (_m, kind: string, symbol: string, raw: string) => {
      const leg = plan.legs.find(l => l.market.symbol === symbol);
      return leg ? `${kind} ${symbol}: ${formatUnits(BigInt(raw), leg.market.baseDecimals)} ${symbol} filled` : _m;
    })
    .replace(/0x[0-9a-fA-F]{64}/g, hash => shortHash(hash));
}

/**
 * The one thing to do next in each state, in plain words. Never suggests resending.
 * `drift` lists symbols whose latest monitor read differs from this pair's record.
 */
export function nextStep(record: PairRecord, busy: boolean, drift: string[] = []): string | null {
  if (busy) return null;
  const legs = record.plan.legs, pending = record.operations.find(unresolved);
  if (pending && !pending.hash) return "Check the signer's transaction history on the explorer first. PairPilot cannot tell whether that order was sent, so do not send any new order until you know.";
  if (pending || record.status === "opening" || record.status === "closing") return "Press Reconcile to read the receipt and positions. If the receipt is still pending, wait a few seconds and reconcile again. Never sign the same order twice.";
  if (drift.length && (record.status === "paired" || record.status === "incomplete")) return `The latest read shows a different ${drift.join(" and ")} position than this pair recorded, so something outside this pair traded ${drift.length > 1 ? "those markets" : "that market"}. Press Reconcile to re-read. PairPilot closes only what this pair recorded, after a review.`;
  if (record.status === "attention") return "Positions on this account changed outside this pair, or a read failed. Check the account in the dreamDEX app, then press Reconcile. Closing stays blocked until the record matches the chain.";
  if (record.status === "incomplete") {
    const closable = closableLegs(record);
    if (!closable.length) return "Nothing PairPilot can send: what remains is below the market minimum. Leave it, or handle it in the dreamDEX app. It stays listed here as open exposure.";
    const open = closable.map(i => `${legs[i].market.symbol} ${signedBase(record.positions[i], legs[i])}`).join(" and ");
    const dust = ([0, 1] as const).filter(i => belowMinimum(record, i)).map(i => `${legs[i].market.symbol} ${signedBase(record.positions[i], legs[i])}`);
    const dustNote = dust.length ? ` ${dust.join(" and ")} is below the market minimum and stays open; no order can close it.` : "";
    const lastCloses = closable.map(i => record.operations.filter(o => o.leg === i && o.kind === "close").at(-1));
    const noFill = lastCloses.every(o => o && o.status === "confirmed" && BigInt(o.filled ?? "0") === 0n);
    if (noFill) return `The close got no fill: nothing traded inside its price bound, so ${open} is still open. Review the close again when the book has liquidity; the review re-reads the position and price bound. Nothing is sent again automatically.${record.plan.mode === "simulation" ? " (In this simulated scenario only the first close finds an empty book.)" : ""}${dustNote}`;
    return record.operations.some(o => o.kind === "close")
      ? `The close filled partly. Review the close again for ${open}: the review re-reads the position and shows the current price bound. A close can fill partly again when the book is thin.${dustNote}`
      : `Decide what to do with ${open}: close it with Close remaining exposure (you review quantity and price bound before signing), or keep it on purpose. PairPilot does not send the missing leg for you.${dustNote}`;
  }
  if (record.status === "paired") return `Both legs are open: ${legs.map((l, i) => `${l.market.symbol} ${signedBase(record.positions[i], l)}`).join(" and ")}. The monitor re-reads marks; Reconcile re-reads positions; Close pair opens a review before anything is signed. Nothing closes automatically.`;
  if (record.status === "flat") { const at = record.events.at(-1)?.at; return `Done. Both legs read back as zero${at ? ` at ${new Date(at).toLocaleTimeString()}` : ""}. Check the summary, export JSON to keep the receipts, then start a new pair if you want.`; }
  return null;
}
