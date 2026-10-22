import { describe, expect, it } from "vitest";
import { claimVoucher, revertData, type ClaimAttempt, type ClaimDeps } from "./voucher";

const hash = `0x${"c".repeat(64)}` as const;
function deps(overrides: Partial<ClaimDeps> = {}) {
  const log: ClaimAttempt[] = [];
  let sends = 0;
  const d: ClaimDeps = {
    build: async () => ({ to: "0x00000000000000000000000000000000000000aa", data: "0x4e71d92d", value: 0n }),
    simulate: async () => {},
    send: async () => { sends++; return hash; },
    receipt: async () => ({ status: "success", blockNumber: 7n }),
    record: async a => { log.push(a); },
    ...overrides,
  };
  return { d, log, sends: () => sends };
}
const base = { chainId: 50383, account: "0x0000000000000000000000000000000000000001" };

describe("voucher claim (synthetic dependencies, not live transactions)", () => {
  it("sends nothing when the claim simulation reverts, and keeps the revert data", async () => {
    const reverted = Object.assign(new Error("execution reverted"), { cause: { data: "0x3e31dcc2" } });
    const { d, log, sends } = deps({ simulate: async () => { throw reverted; } });
    const result = await claimVoucher(d, base);
    expect(sends()).toBe(0);
    expect(result).toMatchObject({ outcome: "simulation-reverted", signedTransactions: 0, revertData: "0x3e31dcc2" });
    expect(log).toHaveLength(1);
  });
  it("records the hash before waiting for the receipt and keeps an on-chain revert", async () => {
    const order: string[] = [];
    const { d, log } = deps({ record: async a => { order.push(a.outcome); log.push(a); }, receipt: async () => { order.push("receipt-read"); return { status: "reverted", blockNumber: 9n }; } });
    const result = await claimVoucher(d, base);
    expect(order).toEqual(["broadcast", "receipt-read", "reverted"]);
    expect(result).toMatchObject({ outcome: "reverted", hash, block: "9" });
  });
  it("leaves a missing receipt unknown without a second send", async () => {
    const { d, sends } = deps({ receipt: async () => { throw new Error("timeout"); } });
    expect((await claimVoucher(d, base)).outcome).toBe("unknown");
    expect(sends()).toBe(1);
  });
  it("finds revert data nested in an error chain", () => {
    expect(revertData({ cause: { cause: { data: "0xdeadbeef" } } })).toBe("0xdeadbeef");
    expect(revertData(new Error("no data"))).toBeUndefined();
  });
});
