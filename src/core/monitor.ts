import { formatUnits } from "viem";
import { absolute, type OrderIntent, type PairRecord } from "./types";

/**
 * Active-pair monitoring and closed-pair review. Pure, exact bigint arithmetic.
 * Prices are raw quote units per whole base; sizes raw base units; money raw quote units.
 * Nothing here substitutes limit prices for fills, account equity for pair PnL, or zero
 * for an unknown cost.
 */

/** One leg's chain read: position and mark from one pinned block. */
export interface LegRead {
  symbol: string;
  /** False when the mark is stale: only `size` is real then. */
  priceable: boolean;
  /** Owner's SIGNED position in this market. */
  size: bigint;
  /** Owner's VWAP entry for the whole position in this market. */
  avgEntryPrice?: bigint;
  markPrice?: bigint;
  /** Price-only mark-to-market PnL, (mark − entry) × size / oneBase, truncated toward zero. */
  unrealizedPnl?: bigint;
  /** Funding owed since entry: POSITIVE means the account pays. */
  accruedFunding?: bigint;
  asOfBlock: bigint | null;
}
export interface MarksRead { readAt: number; legs: [LegRead, LegRead]; source: "chain" | "simulation" }

export type Attribution = "matches" | "differs";
export interface MonitorLeg {
  symbol: string; side: "long" | "short"; baseDecimals: number;
  journalSize: bigint; chainSize: bigint; attribution: Attribution; priceable: boolean;
  mark: bigint | null; entry: bigint | null; markedNotional: bigint | null;
  unrealizedPnl: bigint | null; accruedFunding: bigint | null;
}
export interface MonitorView {
  legs: [MonitorLeg, MonitorLeg];
  quoteDecimals: number | null;
  plannedAllocationBps: [number, number];
  actualAllocationBps: [number, number] | null;
  combinedNotional: bigint | null;
  combinedUnrealized: bigint | null;
  combinedFunding: bigint | null;
  /** Plain-language reasons a figure is unavailable. Never silently zero. */
  unavailable: string[];
}

const oneBase = (decimals: number) => 10n ** BigInt(decimals);
/** Same rounding as the SDK and MarginBank: BigInt division truncates toward zero. */
export const markToMarket = (size: bigint, entry: bigint, mark: bigint, baseDecimals: number) => (mark - entry) * size / oneBase(baseDecimals);
export const markedNotional = (size: bigint, mark: bigint, baseDecimals: number) => absolute(size) * mark / oneBase(baseDecimals);
const shareBps = (a: bigint, b: bigint): [number, number] => {
  const total = a + b;
  if (total === 0n) return [0, 0];
  const first = Number(a * 10_000n / total);
  return [first, 10_000 - first];
};

export function monitorPair(record: PairRecord, read: MarksRead): MonitorView {
  const unavailable: string[] = [];
  const legs = record.plan.legs.map((leg, i) => {
    const r = read.legs[i];
    if (r.symbol !== leg.market.symbol) throw new Error(`Read is for ${r.symbol}, not ${leg.market.symbol}. Discarded.`);
    const journalSize = BigInt(record.positions[i]), chainSize = r.size;
    const attribution: Attribution = chainSize === journalSize ? "matches" : "differs";
    const priced = r.priceable && r.markPrice !== undefined;
    const attributed = attribution === "matches";
    const amount = (v: bigint) => `${formatUnits(v, leg.market.baseDecimals)} ${leg.market.symbol}`;
    const pending = record.operations.some(o => o.leg === i && (o.status === "submitting" || o.status === "unknown"));
    if (!attributed) unavailable.push(pending
      ? `${leg.market.symbol}: the owner's position (${amount(chainSize)}) differs from this pair's record (${amount(journalSize)}) while an order on this leg has an unknown outcome. Reconcile reads its receipt; PnL is not attributed until then.`
      : `${leg.market.symbol}: the owner's position (${amount(chainSize)}) differs from this pair's record (${amount(journalSize)}). Something outside this pair traded this market, so PnL and funding are not attributed to the pair. Reconcile.`);
    if (!r.priceable && chainSize !== 0n) unavailable.push(`${leg.market.symbol}: the mark is stale, so this leg cannot be valued right now.`);
    // A flat, attributed leg contributes exactly zero; an open one needs a fresh mark.
    const flatAndOurs = attributed && chainSize === 0n;
    return {
      symbol: leg.market.symbol, side: leg.side, baseDecimals: leg.market.baseDecimals,
      journalSize, chainSize, attribution, priceable: r.priceable,
      mark: priced ? r.markPrice! : null,
      entry: chainSize !== 0n && r.avgEntryPrice !== undefined ? r.avgEntryPrice : null,
      markedNotional: priced ? markedNotional(chainSize, r.markPrice!, leg.market.baseDecimals) : flatAndOurs ? 0n : null,
      unrealizedPnl: flatAndOurs ? 0n : attributed && priced && r.unrealizedPnl !== undefined ? r.unrealizedPnl : null,
      accruedFunding: flatAndOurs ? 0n : attributed && priced && r.accruedFunding !== undefined ? r.accruedFunding : null,
    } satisfies MonitorLeg;
  }) as [MonitorLeg, MonitorLeg];

  const [q0, q1] = record.plan.legs.map(l => l.market.quoteDecimals);
  const quoteDecimals = q0 === q1 ? q0 : null;
  if (quoteDecimals === null) unavailable.push("The two markets settle in different quote units, so their values are not added together.");
  const both = <T,>(a: T | null, b: T | null) => a !== null && b !== null && quoteDecimals !== null;
  const planned = record.plan.legs.map(l => BigInt(l.quantity) * BigInt(l.referencePrice) / oneBase(l.market.baseDecimals)) as [bigint, bigint];
  return {
    legs, quoteDecimals,
    plannedAllocationBps: shareBps(planned[0], planned[1]),
    actualAllocationBps: both(legs[0].markedNotional, legs[1].markedNotional) ? shareBps(legs[0].markedNotional!, legs[1].markedNotional!) : null,
    combinedNotional: both(legs[0].markedNotional, legs[1].markedNotional) ? legs[0].markedNotional! + legs[1].markedNotional! : null,
    combinedUnrealized: both(legs[0].unrealizedPnl, legs[1].unrealizedPnl) ? legs[0].unrealizedPnl! + legs[1].unrealizedPnl! : null,
    combinedFunding: both(legs[0].accruedFunding, legs[1].accruedFunding) ? legs[0].accruedFunding! + legs[1].accruedFunding! : null,
    unavailable,
  };
}

/** Receipt fills for one transaction, re-derived read-only when a journal predates fillValue. */
export interface TxFills { filled: bigint; fillValue: bigint }
/**
 * Whether the owner's position in one market was this pair's alone, from the leg's first
 * open to its last close: the indexer lists only this pair's transactions as position changes
 * there (starting and ending at zero) and no funding settlement outside them. "verified"
 * needs the indexer to list this pair's OWN transactions too, so an empty or lagging response
 * is "unverified", never a verified zero.
 */
export type Exclusivity = { state: "verified"; throughBlock: bigint } | { state: "mixed"; reason: string } | { state: "unverified"; reason: string };
export interface PairHistory {
  /** Receipt fills by transaction hash (lowercase). */
  fills: Map<string, TxFills>;
  /** Fee and rebate events decoded from this pair's own receipts, for this owner. */
  fees: { txHash: string; pool: string; amount: bigint; isRebate: boolean }[];
  /**
   * FundingSettled events in this pair's own receipts, for this owner. The venue settles the
   * owner's accrued funding in a market whenever that position changes. POSITIVE = paid.
   */
  funding: { txHash: string; pool: string; amount: bigint }[];
  /** Transactions whose receipts were fully read; a fee or funding is only "0" for these. */
  receiptsRead: Set<string>;
  /** Per pool (lowercase). A pool without an entry was not checked. */
  exclusivity: Record<string, Exclusivity>;
  source: "chain+indexer" | "simulation";
}

function opFills(op: OrderIntent, history?: PairHistory): TxFills | null {
  if (op.status !== "confirmed" || op.filled === undefined) return op.status === "rejected" ? { filled: 0n, fillValue: 0n } : null;
  if (op.fillValue !== undefined) return { filled: BigInt(op.filled), fillValue: BigInt(op.fillValue) };
  const read = op.hash ? history?.fills.get(op.hash.toLowerCase()) : undefined;
  return read && read.filled === BigInt(op.filled) ? read : null;
}

export interface LegSummary {
  symbol: string; side: "long" | "short"; baseDecimals: number;
  planned: bigint;
  opened: bigint | null; avgOpenPrice: bigint | null;
  closed: bigint | null; avgClosePrice: bigint | null;
  openNow: bigint;
  /** Price PnL on the closed quantity, from this pair's own receipt fills. Excludes fees and funding. */
  realizedPricePnl: bigint | null;
  /** Net fees (charged minus rebates) for this leg's transactions; null when unknown. */
  fees: bigint | null;
  /** realizedPricePnl − fees: both come only from this pair's own receipts. */
  netBeforeFunding: bigint | null;
  /** Funding settled in this pair's own transactions: PAID positive, received negative; null when unknown. */
  funding: bigint | null;
  /**
   * Whose funding that is. "exclusive": the indexer shows the market was this pair's alone.
   * "conditional": that could not be checked. "mixed": other activity shared the market.
   * "no-position": this leg never held a position. null while funding is unknown.
   */
  fundingAttribution: FundingAttribution | null;
  /** netBeforeFunding − funding; null when funding is unknown or mixed. */
  net: bigint | null;
  /** "pair" only when funding is exclusive (or there was no position); otherwise "conditional". */
  netBasis: "pair" | "conditional" | null;
}
export type FundingAttribution = "exclusive" | "conditional" | "mixed" | "no-position";
export interface PairSummary {
  legs: [LegSummary, LegSummary];
  quoteDecimals: number | null;
  totals: { realizedPricePnl: bigint | null; fees: bigint | null; netBeforeFunding: bigint | null; funding: bigint | null; fundingAttribution: FundingAttribution | null; net: bigint | null; netBasis: "pair" | "conditional" | null };
  /** The engine's last chain read-back, when the record ended flat. */
  flatReadBackAt: number | null;
  notes: string[];
}

export function summarizePair(record: PairRecord, history?: PairHistory): PairSummary {
  const sim = record.plan.mode === "simulation";
  const notes: string[] = [];
  const legs = record.plan.legs.map((leg, i) => {
    const ops = record.operations.filter(o => o.leg === i);
    const sum = (kind: OrderIntent["kind"]) => {
      const fills = ops.filter(o => o.kind === kind).map(o => opFills(o, history));
      if (fills.some(f => f === null)) return null;
      return (fills as TxFills[]).reduce<TxFills>((t, f) => ({ filled: t.filled + f.filled, fillValue: t.fillValue + f.fillValue }), { filled: 0n, fillValue: 0n });
    };
    const open = sum("open"), close = sum("close");
    const avg = (f: TxFills | null) => f && f.filled > 0n ? f.fillValue / f.filled : null;
    let realized: bigint | null = null;
    if (open && close && open.filled > 0n && close.filled > 0n && close.filled <= open.filled) {
      // Cost basis of the closed quantity at this pair's own average open price.
      const basis = open.fillValue * close.filled / open.filled;
      const diff = leg.side === "long" ? close.fillValue - basis : basis - close.fillValue;
      realized = diff / 10n ** BigInt(leg.market.baseDecimals);
    } else if (open && close && close.filled === 0n) realized = 0n;

    const hashes = new Set(ops.filter(o => o.hash).map(o => o.hash!.toLowerCase()));
    const filledHashes = ops.filter(o => o.hash && o.status === "confirmed" && BigInt(o.filled ?? "0") > 0n).map(o => o.hash!.toLowerCase());
    const pool = leg.market.pool.toLowerCase(), symbol = leg.market.symbol;
    const ours = <T extends { txHash: string; pool: string }>(rows: T[]) => rows.filter(r => hashes.has(r.txHash.toLowerCase()) && r.pool.toLowerCase() === pool);
    // A receipt that was read and holds no event means 0. An unread receipt means unknown.
    const unread = history ? filledHashes.filter(h => !history.receiptsRead.has(h)) : [];
    let fees: bigint | null = null;
    if (!sim && history) {
      if (unread.length) notes.push(`${symbol}: ${unread.length} receipt(s) could not be read; fees and funding shown as unavailable.`);
      else fees = ours(history.fees).reduce((t, r) => t + (r.isRebate ? -r.amount : r.amount), 0n);
    }
    let funding: bigint | null = null, fundingAttribution: FundingAttribution | null = null;
    const neverHeld = open !== null && open.filled === 0n && filledHashes.length === 0;
    if (!sim && history && !unread.length) {
      if (neverHeld) [funding, fundingAttribution] = [0n, "no-position"];
      else if (BigInt(record.positions[i]) !== 0n) notes.push(`${symbol}: still open, so funding keeps accruing and settles when the position changes. The monitor shows what is owed now.`);
      else {
        funding = ours(history.funding).reduce((t, f) => t + f.amount, 0n);
        const check = history.exclusivity[pool];
        fundingAttribution = check?.state === "verified" ? "exclusive" : check?.state === "mixed" ? "mixed" : "conditional";
        if (check?.state === "verified") notes.push(`${symbol}: the indexer lists only this pair's transactions as the owner's position changes in this market from open to close, starting and ending at zero (checked through block ${check.throughBlock}). Its funding is this pair's.`);
        else if (check?.state === "mixed") notes.push(`${symbol}: ${check.reason} Funding settled in this pair's transactions may include that activity, so no net result is given for this leg.`);
        else notes.push(`${symbol}: exclusivity not verified (${check?.reason ?? "not checked"}). Funding is this pair's only if nothing else held or traded this market on the account while the pair was open.`);
      }
    }
    const netBeforeFunding = realized !== null && fees !== null ? realized - fees : null;
    const net = netBeforeFunding !== null && funding !== null && fundingAttribution !== "mixed" ? netBeforeFunding - funding : null;
    const netBasis = net === null ? null : fundingAttribution === "exclusive" || fundingAttribution === "no-position" ? "pair" : "conditional";
    return {
      symbol: leg.market.symbol, side: leg.side, baseDecimals: leg.market.baseDecimals,
      planned: BigInt(leg.quantity),
      opened: open?.filled ?? null, avgOpenPrice: avg(open),
      closed: close?.filled ?? null, avgClosePrice: avg(close),
      openNow: BigInt(record.positions[i]),
      realizedPricePnl: realized, fees, netBeforeFunding, funding, fundingAttribution, net, netBasis,
    } satisfies LegSummary;
  }) as [LegSummary, LegSummary];

  if (sim) notes.push("Simulation: fills at fixed prices; fees and funding are not simulated.");
  else {
    if (!history) notes.push("Chain and indexer history not read yet.");
    else notes.unshift("Fees and funding are MarginBank events in this pair's own receipts (FeeCharged, RebatePaid, BuilderFeeCharged, FundingSettled); a read receipt without one means 0. The venue settles the owner's whole position in a market, so funding is attributed per leg below.");
  }
  const [q0, q1] = record.plan.legs.map(l => l.market.quoteDecimals);
  const quoteDecimals = q0 === q1 ? q0 : null;
  const total = (pick: (l: LegSummary) => bigint | null) => quoteDecimals !== null && legs.every(l => pick(l) !== null) ? pick(legs[0])! + pick(legs[1])! : null;
  // The pair is only as attributable as its least attributable leg.
  const rank: FundingAttribution[] = ["no-position", "exclusive", "conditional", "mixed"];
  const fundingAttribution = legs.some(l => l.fundingAttribution === null) ? null : legs.map(l => l.fundingAttribution!).reduce((a, b) => rank.indexOf(a) >= rank.indexOf(b) ? a : b);
  const net = total(l => l.net);
  return {
    legs, quoteDecimals,
    totals: {
      realizedPricePnl: total(l => l.realizedPricePnl), fees: total(l => l.fees), netBeforeFunding: total(l => l.netBeforeFunding),
      funding: total(l => l.funding), fundingAttribution, net, netBasis: net === null ? null : legs.every(l => l.netBasis === "pair") ? "pair" : "conditional",
    },
    flatReadBackAt: record.status === "flat" ? record.events.at(-1)?.at ?? null : null,
    notes,
  };
}
