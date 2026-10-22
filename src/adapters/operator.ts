import { decodeErrorResult, encodeFunctionData, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import { contractErrorsAbi } from "@somnia-chain/markets-sdk";

/**
 * Linked-wallet operator ("trading key") execution, after the official dreamDEX bot kit
 * (packages/perp-core/src/operator.ts). Link a Bot writes registry grants for three
 * selectors on every perp pool. The signer then calls `placeOrderFor(owner, …)`: margin,
 * positions and fills are the OWNER's; the signer only pays gas and cannot withdraw.
 * SDK 0.32.1 has no perp `…For` writes, so the call is encoded here; reads stay on the SDK.
 */
export const OPERATOR_SELECTOR = { placeOrderFor: "0x80054449", cancelOrderFor: "0xe37b444b", reduceOrderFor: "0x364c2587" } as const;
export const operatorAbi = parseAbi([
  "function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
  "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
]);
/** OrderBook ImmediateOrCancel: fill what crosses, cancel the rest. Nothing rests. */
export const IOC = 2;

export interface Execution { mode: "own" | "operator"; owner: Address; signer: Address }

/** Owner comes only from explicit configuration: a full address, never a prefix, guess or lookup. */
export function resolveExecution(signer: string, owner?: string): Execution {
  const s = getAddress(signer);
  if (owner === undefined || owner === "") return { mode: "own", owner: s, signer: s };
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner) || !isAddress(owner)) throw new Error("Owner must be the FULL 0x-prefixed 40-hex app-wallet address (checksum-valid if mixed case). It is never guessed or shortened.");
  const o = getAddress(owner);
  if (o === s) throw new Error("The owner is the signer's own address. Omit the owner to trade the signer's own account.");
  return { mode: "operator", owner: o, signer: s };
}

/** `placeOrderFor` with explicit IOC, expiry and price bound; no builder fee, no user data. */
export function encodePlaceOrderFor(p: { owner: Address; isBid: boolean; price: bigint; quantity: bigint; expireTimestampNs: bigint }): Hex {
  if (p.price <= 0n || p.quantity <= 0n) throw new Error("Operator order needs a positive price bound and quantity.");
  if (p.expireTimestampNs <= 0n || p.expireTimestampNs >= 2n ** 64n) throw new Error("Operator order needs an explicit uint64 expiry in nanoseconds.");
  return encodeFunctionData({ abi: operatorAbi, functionName: "placeOrderFor", args: [p.owner, p.isBid, 0n, p.price, p.quantity, p.expireTimestampNs, IOC, 0, "0x0000000000000000000000000000000000000000", 0n] });
}

export type PermissionReader = (pool: Address, selector: Hex) => Promise<boolean>;
export interface PoolPermission { symbol: string; pool: Address; placeOrderFor: boolean; cancelOrderFor: boolean; reduceOrderFor: boolean }

/** Ask each pool what it enforces for owner → signer. */
export async function readPermissions(read: PermissionReader, pools: { symbol: string; pool: Address }[]): Promise<PoolPermission[]> {
  return Promise.all(pools.map(async ({ symbol, pool }) => {
    const [placeOrderFor, cancelOrderFor, reduceOrderFor] = await Promise.all([read(pool, OPERATOR_SELECTOR.placeOrderFor), read(pool, OPERATOR_SELECTOR.cancelOrderFor), read(pool, OPERATOR_SELECTOR.reduceOrderFor)]);
    return { symbol, pool, placeOrderFor, cancelOrderFor, reduceOrderFor };
  }));
}

/** Every leg needs placeOrderFor. Missing grants name the market; nothing is sent. */
export function assertPlacePermissions(execution: Execution, permissions: PoolPermission[]) {
  const missing = permissions.filter(p => !p.placeOrderFor).map(p => p.symbol);
  if (missing.length) throw new Error(`Signer ${execution.signer} may not place orders for ${execution.owner} on ${missing.join(", ")}. In the dreamDEX app, Link a Bot with Perps ticked for this signer on that owner. No order sent.`);
}

/** Name a pool revert from its data when the SDK error table knows it. */
export function revertName(data: string | undefined) {
  if (!data || data === "0x") return undefined;
  try { return decodeErrorResult({ abi: contractErrorsAbi, data: data as Hex }).errorName; } catch { return undefined; }
}
