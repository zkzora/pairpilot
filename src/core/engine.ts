import { absolute, signed, type CloseReview, type Journal, type OrderIntent, type OrderOutcome, type PairPlan, type PairRecord, type Venue } from "./types";
import { grid } from "./planner";

/** Minimum preview lifetime left before the first open leg may be sent. */
export const OPEN_HEADROOM_MS = 20_000;
/** How long a reviewed close stays valid. Prices move; a stale bound is refused. */
export const CLOSE_REVIEW_MS = 30_000;
/** A transport error is deliberately NOT a rejection. Unknown sends never auto-retry. */
export class RejectedOrder extends Error {}
export class PairEngine {
  constructor(private venue: Venue, private journal: Journal) {}
  private needsAttention(record: PairRecord) { return record.status === "attention"; }
  private async save(record: PairRecord, message?: string) {
    if (message) record.events.push({ at: Date.now(), message });
    await this.journal.write(record);
  }
  private async checkIdentity(plan: PairPlan) {
    const signer = plan.signer ?? plan.account; // Journals from before operator support were own-wallet.
    if (plan.chainId !== 50383 || plan.mode !== this.venue.mode || plan.account.toLowerCase() !== this.venue.account.toLowerCase() || signer.toLowerCase() !== this.venue.signer.toLowerCase()) throw new Error("Journal owner, signer, network or execution mode does not match the connected venue.");
  }
  private async checkPositions(record: PairRecord) {
    const actual = await this.venue.positions(record.plan);
    if (actual.some((v, i) => v !== BigInt(record.positions[i]))) throw new Error("Positions changed outside this pair. Stop and reconcile manually before another order.");
  }
  private async apply(record: PairRecord, order: OrderIntent, outcome: OrderOutcome) {
    const filled = BigInt(outcome.filled);
    if (filled < 0n || filled > BigInt(order.quantity) || (outcome.reverted && filled !== 0n)) throw new Error("Receipt has an invalid fill amount; manual reconciliation required.");
    order.hash = outcome.hash;
    order.filled = String(filled);
    order.status = outcome.reverted ? "rejected" : "confirmed";
    record.positions[order.leg] = String(BigInt(record.positions[order.leg]) + signed(order.side, filled));
    await this.save(record, `${order.kind} ${record.plan.legs[order.leg].market.symbol}: ${filled} raw units filled${outcome.reverted ? " (transaction reverted)" : ""}.`);
  }
  private async submit(record: PairRecord, order: OrderIntent) {
    await this.checkPositions(record);
    await this.venue.prepare(record.plan, order);
    record.operations.push(order);
    // Durable intent BEFORE handing anything to a signer. A crash here is ambiguous.
    await this.save(record, `Prepared ${order.kind} for ${record.plan.legs[order.leg].market.symbol}.`);
    try {
      const outcome = await this.venue.send(record.plan, order, async hash => {
        order.hash = hash;
        await this.save(record, `Broadcast ${hash}.`);
      });
      await this.apply(record, order, outcome);
      await this.checkPositions(record);
    } catch (error) {
      order.message = error instanceof Error ? error.message : String(error);
      // Even a known receipt followed by a failed read must not be submitted twice.
      if (order.status === "confirmed" || order.status === "rejected") {
        record.status = "attention";
      } else if (error instanceof RejectedOrder && !order.hash) {
        order.status = "rejected";
      } else {
        order.status = "unknown";
        record.status = "attention";
      }
      await this.save(record, order.message);
    }
  }
  async open(plan: PairPlan): Promise<PairRecord> {
    return this.journal.exclusive(plan.account, async () => {
      await this.checkIdentity(plan);
      const existing = await this.journal.read(plan.id);
      if (existing) return existing; // Same intent id cannot open twice.
      if (Date.now() > plan.expiresAt) throw new Error("Preview expired. Refresh prices before opening.");
      await this.venue.assertReady(plan);
      const actual = await this.venue.positions(plan);
      if (actual.some(v => v !== 0n)) throw new Error("Use a dedicated, flat account for PairPilot v0.");
      // Both legs carry plan.expiresAt on-chain, and a past expiry reverts. Without room for
      // the second leg, the first could fill alone.
      if (plan.expiresAt - Date.now() < OPEN_HEADROOM_MS) throw new Error(`Preview expired or expires within ${OPEN_HEADROOM_MS / 1000} seconds; both legs may not fit. Refresh prices before opening.`);
      const record: PairRecord = { version: 1, plan, status: "opening", positions: ["0", "0"], operations: [], events: [] };
      await this.save(record, `${plan.mode}: opening the pair with bounded IOC orders.`);
      try {
        for (const leg of [0, 1] as const) {
          if (Date.now() > plan.expiresAt) throw new Error("Preview expired between legs. Remaining order was not sent.");
          const p = plan.legs[leg];
          await this.submit(record, { id: `${plan.id}:open:${leg}`, leg, kind: "open", side: p.side, quantity: p.quantity, limitPrice: p.limitPrice, status: "submitting" });
          if (record.status === "attention" || record.operations.at(-1)?.filled !== p.quantity) break;
        }
        if (record.status !== "attention") record.status = record.positions.every((p, i) => BigInt(p) === signed(plan.legs[i].side, BigInt(plan.legs[i].quantity))) ? "paired" : record.positions.every(p => p === "0") ? "flat" : "incomplete";
        await this.save(record);
      } catch (error) {
        record.status = record.positions.some(p => p !== "0") ? "incomplete" : "attention";
        await this.save(record, error instanceof Error ? error.message : String(error));
      }
      return record;
    });
  }
  async reconcile(id: string): Promise<PairRecord> {
    const found = await this.journal.read(id);
    if (!found) throw new Error("Pair journal not found.");
    return this.journal.exclusive(found.plan.account, async () => {
      const record = (await this.journal.read(id))!;
      await this.checkIdentity(record.plan);
      for (const order of record.operations) {
        if (order.status !== "unknown" && order.status !== "submitting") continue;
        if (!order.hash) {
          record.status = "attention";
          await this.save(record, "An interrupted send has no transaction hash. Do not retry: inspect the wallet nonce/history manually.");
          return record;
        }
        const receipt = await this.venue.receipt(record.plan, order);
        if (!receipt) {
          record.status = "attention";
          await this.save(record, "Receipt is pending or unavailable. No replacement order sent.");
          return record;
        }
        await this.apply(record, order, receipt);
      }
      try {
        await this.checkPositions(record);
        const wasClosing = record.operations.some(o => o.kind === "close");
        record.status = record.positions.every(p => p === "0") ? "flat" : !wasClosing && record.positions.every((p, i) => BigInt(p) === signed(record.plan.legs[i].side, BigInt(record.plan.legs[i].quantity))) ? "paired" : "incomplete";
        await this.save(record, "Positions reconciled against venue state. No orders sent.");
      } catch (error) {
        record.status = "attention";
        await this.save(record, error instanceof Error ? error.message : String(error));
      }
      return record;
    });
  }
  /** Read-only: the close orders and residuals for the current positions. Sends nothing. */
  private async closeOrders(record: PairRecord, now: number): Promise<CloseReview> {
    const review: CloseReview = { pairId: record.plan.id, createdAt: now, expiresAt: now + CLOSE_REVIEW_MS, basis: [...record.positions], orders: [], residuals: [] };
    for (const leg of [0, 1] as const) {
      const position = BigInt(record.positions[leg]);
      if (position === 0n) continue;
      const market = record.plan.legs[leg].market;
      const quantity = grid(absolute(position), BigInt(market.lot));
      if (quantity < BigInt(market.minimum)) { review.residuals.push({ leg, position: String(position), reason: "below the market minimum after lot rounding; manual action required" }); continue; }
      const side = position > 0n ? "short" : "long";
      review.orders.push({ leg, side, position: String(position), quantity: String(quantity), limitPrice: String(await this.venue.closePrice(record.plan, leg, side)) });
      if (quantity !== absolute(position)) review.residuals.push({ leg, position: String(position - signed(side === "short" ? "long" : "short", quantity)), reason: "lot rounding leaves this remainder open" });
    }
    return review;
  }
  async reviewClose(id: string): Promise<CloseReview> {
    const record = await this.journal.read(id);
    if (!record) throw new Error("Pair journal not found.");
    await this.checkIdentity(record.plan);
    if (record.operations.some(o => ["submitting", "unknown"].includes(o.status))) throw new Error("Resolve unknown transactions before closing; another order could increase exposure.");
    await this.checkPositions(record);
    return this.closeOrders(record, Date.now());
  }
  /** Close filled exposure. With a review, sends exactly the reviewed quantities and price bounds. */
  async close(id: string, review?: CloseReview): Promise<PairRecord> {
    const found = await this.journal.read(id);
    if (!found) throw new Error("Pair journal not found.");
    return this.journal.exclusive(found.plan.account, async () => {
      const record = (await this.journal.read(id))!;
      await this.checkIdentity(record.plan);
      if (record.operations.some(o => ["submitting", "unknown"].includes(o.status))) throw new Error("Resolve unknown transactions before closing; another order could increase exposure.");
      await this.checkPositions(record);
      if (review) {
        if (review.pairId !== id) throw new Error("Close review belongs to another pair. No order sent.");
        if (Date.now() > review.expiresAt) throw new Error("Close review expired. Review the close again; no order sent.");
        if (review.basis.some((p, i) => p !== record.positions[i])) throw new Error("Positions changed since the close review. Review again; no order sent.");
      }
      if (record.positions.every(p => p === "0")) { record.status = "flat"; await this.save(record); return record; }
      record.status = "closing";
      await this.save(record, "Close requested. Recovery may leave residual exposure if liquidity is unavailable.");
      try {
        const plan = review ?? await this.closeOrders(record, Date.now());
        for (const residual of plan.residuals) await this.save(record, `${record.plan.legs[residual.leg].market.symbol}: ${residual.reason}.`);
        for (const order of plan.orders) {
          await this.submit(record, { id: `${id}:close:${record.operations.length}`, leg: order.leg, kind: "close", side: order.side, quantity: order.quantity, limitPrice: order.limitPrice, status: "submitting" });
          if (this.needsAttention(record)) break;
        }
        if (!this.needsAttention(record)) record.status = record.positions.every(p => p === "0") ? "flat" : "incomplete";
        await this.save(record);
      } catch (error) {
        record.status = "attention";
        await this.save(record, error instanceof Error ? error.message : String(error));
      }
      return record;
    });
  }
}
