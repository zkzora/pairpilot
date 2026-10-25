import { describe, expect, it } from "vitest";
import type { SomniaMarkets } from "@somnia-chain/markets-sdk";
import type { TransactionReceipt } from "viem";
import { checkExclusive } from "./dreamdex";

/** Fake indexer and chain for the read-only exclusivity check. No network. */
const owner = "0x436dae2ef8e8eece9960b3c3a9da6731a2d6c1f5", pool = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf";
const ops = [{ kind: "open" as const, hash: "0xa1" }, { kind: "close" as const, hash: "0xa2" }];
const receipts = new Map([["0xa1", { blockNumber: 100n }], ["0xa2", { blockNumber: 200n }]]) as unknown as Map<string, TransactionReceipt>;
const rpc = { getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_000n + blockNumber / 100n }) }; // block 100 → 1001 s, 200 → 1002 s
const change = (txHash: string, blockNumber: bigint, sizeBefore: bigint, sizeAfter: bigint) => ({ txHash, blockNumber, logIndex: 0, sizeBefore, sizeAfter });
const ours = [change("0xa1", 100n, 0n, 5n), change("0xA2", 200n, 5n, 0n)];
function exchange(changes: ReturnType<typeof change>[], funding: { txHash: string; timestamp: string }[] = []) {
  return { client: { listPerpPositionChanges: async () => changes, getFundingPayments: async () => funding } } as unknown as SomniaMarkets;
}
const check = (ex: SomniaMarkets, flat = true) => checkExclusive(ex, rpc, owner, pool, ops, receipts, flat);

describe("per-market exclusivity of a pair's funding", () => {
  it("never treats an empty or lagging indexer response as a verified zero", async () => {
    expect(await check(exchange([]))).toEqual({ state: "unverified", reason: "the indexer does not list 2 of this pair's transaction(s) yet" });
    expect(await check(exchange([ours[0]]))).toEqual({ state: "unverified", reason: "the indexer does not list 1 of this pair's transaction(s) yet" });
  });
  it("verifies a market whose only position changes and settlements were this pair's, from zero to zero", async () => {
    expect(await check(exchange(ours, [{ txHash: "0xa2", timestamp: "1002" }, { txHash: "0xold", timestamp: "900" }]))).toEqual({ state: "verified", throughBlock: 200n });
    // Another transaction in the same second but an earlier block is outside the window.
    expect(await check(exchange([change("0xother", 99n, 0n, 1n), ...ours]))).toMatchObject({ state: "verified" });
  });
  it("reports shared activity as mixed", async () => {
    expect(await check(exchange([ours[0], change("0xother", 150n, 5n, 6n), change("0xa2", 200n, 6n, 0n)]))).toMatchObject({ state: "mixed", reason: expect.stringMatching(/1 position change\(s\) by other transactions/) });
    expect(await check(exchange([change("0xa1", 100n, 3n, 8n), change("0xa2", 200n, 8n, 0n)]))).toMatchObject({ state: "mixed", reason: expect.stringMatching(/already held a position/) });
    expect(await check(exchange([ours[0], change("0xa2", 200n, 5n, 1n)]))).toMatchObject({ state: "mixed", reason: expect.stringMatching(/did not end at zero/) });
    expect(await check(exchange(ours, [{ txHash: "0xkeeper", timestamp: "1001" }]))).toMatchObject({ state: "mixed", reason: expect.stringMatching(/1 funding settlement\(s\) in other transactions/) });
  });
  it("does not verify an open position, an unread receipt or a truncated page", async () => {
    expect(await check(exchange(ours), false)).toEqual({ state: "unverified", reason: "the position is still open" });
    const missing = checkExclusive(exchange(ours), rpc, owner, pool, [...ops, { kind: "close", hash: "0xa3" }], receipts, true);
    expect(await missing).toEqual({ state: "unverified", reason: "a receipt of this pair could not be read" });
    const full = Array.from({ length: 1000 }, (_, i) => change(`0x${i}`, 150n, 0n, 0n));
    expect(await check(exchange(full))).toMatchObject({ state: "unverified", reason: expect.stringMatching(/too many/) });
    const page = Array.from({ length: 200 }, () => ({ txHash: "0xa2", timestamp: "1002" }));
    expect(await check(exchange(ours, page))).toMatchObject({ state: "unverified", reason: expect.stringMatching(/does not reach back/) });
  });
});
