import type { Hash } from "../core/types";

export interface ClaimCall { to: `0x${string}`; data: `0x${string}`; value: bigint }
export type ClaimOutcome = "simulation-reverted" | "broadcast" | "success" | "reverted" | "unknown";
export interface ClaimAttempt {
  mode: "testnet"; chainId: number; account: string; distributor: string; at: string;
  outcome: ClaimOutcome; signedTransactions: 0 | 1; hash?: Hash; block?: string; revertData?: string; message?: string;
}
export interface ClaimDeps {
  build(): Promise<ClaimCall>;
  /** eth_call before signing. Throws on revert. */
  simulate(call: ClaimCall): Promise<void>;
  /** Exactly one broadcast. */
  send(call: ClaimCall): Promise<Hash>;
  receipt(hash: Hash): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
  /** Durable append. Called before and after the receipt wait. */
  record(attempt: ClaimAttempt): Promise<void>;
}

/** Revert data from a viem/SDK error chain, if the node returned any. */
export function revertData(error: unknown): string | undefined {
  for (let e = error as { data?: unknown; cause?: unknown } | undefined, depth = 0; e && depth < 10; e = e.cause as typeof e, depth++) {
    if (typeof e.data === "string" && e.data.startsWith("0x")) return e.data;
  }
  return undefined;
}

/** One-time voucher claim: simulate, send once, record the hash before waiting, never resend. */
export async function claimVoucher(deps: ClaimDeps, base: { chainId: number; account: string }): Promise<ClaimAttempt> {
  const call = await deps.build();
  const attempt = (fields: Pick<ClaimAttempt, "outcome" | "signedTransactions"> & Partial<ClaimAttempt>): ClaimAttempt =>
    ({ mode: "testnet", chainId: base.chainId, account: base.account, distributor: call.to, at: new Date().toISOString(), ...fields });
  try { await deps.simulate(call); }
  catch (error) {
    const result = attempt({ outcome: "simulation-reverted", signedTransactions: 0, revertData: revertData(error), message: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    await deps.record(result);
    return result;
  }
  const hash = await deps.send(call);
  await deps.record(attempt({ outcome: "broadcast", signedTransactions: 1, hash }));
  try {
    const receipt = await deps.receipt(hash);
    const result = attempt({ outcome: receipt.status, signedTransactions: 1, hash, block: String(receipt.blockNumber) });
    await deps.record(result);
    return result;
  } catch (error) {
    // A known hash without a receipt is ambiguous: read it later, never send a second claim.
    const result = attempt({ outcome: "unknown", signedTransactions: 1, hash, message: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    await deps.record(result);
    return result;
  }
}
