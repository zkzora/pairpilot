export type Side = "long" | "short";
export type Hash = `0x${string}`;
export interface MarketSpec {
  symbol: string;
  pool: `0x${string}`;
  marginBank: `0x${string}`;
  baseDecimals: number;
  quoteDecimals: number;
  tick: string;
  lot: string;
  minimum: string;
}
export interface LegPlan {
  market: MarketSpec;
  side: Side;
  quantity: string;
  limitPrice: string;
  referencePrice: string;
}
export interface PairPlan {
  id: string;
  /** Position owner: margin, fills and positions belong here. */
  account: string;
  /** Transaction signer and gas payer. Equals account for own-wallet execution; absent in journals written before operator support. */
  signer?: string;
  chainId: 50383;
  mode: "simulation" | "testnet";
  createdAt: number;
  expiresAt: number;
  slippageBps: number;
  legs: [LegPlan, LegPlan];
}
export interface OrderIntent {
  id: string;
  leg: 0 | 1;
  kind: "open" | "close";
  side: Side;
  quantity: string;
  limitPrice: string;
  status: "submitting" | "confirmed" | "unknown" | "rejected";
  hash?: Hash;
  filled?: string;
  message?: string;
}
export type PairStatus = "draft" | "opening" | "paired" | "incomplete" | "closing" | "flat" | "attention";
export interface PairRecord {
  version: 1;
  plan: PairPlan;
  status: PairStatus;
  positions: [string, string];
  operations: OrderIntent[];
  events: { at: number; message: string }[];
}
export interface OrderOutcome { hash: Hash; filled: string; reverted?: boolean }
export interface Venue {
  mode: PairPlan["mode"];
  /** Position owner. */
  account: string;
  /** Transaction signer; differs from account only for linked-wallet operator execution. */
  signer: string;
  /** Read actual chain positions. Never substitute an empty position on RPC failure. */
  positions(plan: PairPlan): Promise<[bigint, bigint]>;
  assertReady(plan: PairPlan): Promise<void>;
  /** Build/simulate before declaring an intent; no transaction may be sent here. */
  prepare(plan: PairPlan, order: OrderIntent): Promise<void>;
  /** Save hash as soon as broadcast returns, before waiting for a receipt. */
  send(plan: PairPlan, order: OrderIntent, onHash: (hash: Hash) => Promise<void>): Promise<OrderOutcome>;
  receipt(plan: PairPlan, order: OrderIntent): Promise<OrderOutcome | null>;
  closePrice(plan: PairPlan, leg: 0 | 1, side: Side): Promise<bigint>;
}
export interface Journal {
  read(id: string): Promise<PairRecord | null>;
  write(record: PairRecord): Promise<void>;
  exclusive<T>(account: string, work: () => Promise<T>): Promise<T>;
}
export const signed = (side: Side, quantity: bigint) => side === "long" ? quantity : -quantity;
export const absolute = (value: bigint) => value < 0n ? -value : value;
export const opposite = (side: Side): Side => side === "long" ? "short" : "long";
