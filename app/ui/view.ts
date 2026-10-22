import { formatUnits } from "viem";
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
    if (!complete && last.kind === "close") view.note = `Close filled ${base(amount, leg)} of ${base(last.quantity, leg)} ${symbol} within its limit. The rest stays open.`;
  }
  view.hash = last?.hash;

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
