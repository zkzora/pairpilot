import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Address, type Log, type TransactionReceipt } from "viem";
import { outcomeFromReceipt } from "./dreamdex";

const pool = "0x0000000000000000000000000000000000000001" as Address;
const other = "0x0000000000000000000000000000000000000002" as Address;
const abi = parseAbi(["event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)"]);
function fill(quantity: bigint, address = pool): Log {
  return {
    address,
    topics: encodeEventTopics({ abi, eventName: "OrderFilled", args: { takerOrderId: 1n, makerOrderId: 2n } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [quantity, 0n, 0n, 2500n * 10n ** 18n]),
    blockNumber: 1n, blockHash: `0x${"a".repeat(64)}`, transactionHash: `0x${"b".repeat(64)}`, logIndex: 0, transactionIndex: 0, removed: false,
  };
}
function receipt(logs: Log[], status: "success" | "reverted" = "success") {
  return { transactionHash: `0x${"b".repeat(64)}`, logs, status } as TransactionReceipt;
}
describe("SDK receipt integration (synthetic fixtures, not live transactions)", () => {
  it("sums actual fills using SDK event decoding and filters another pool", () => {
    const outcome = outcomeFromReceipt(receipt([fill(12n), fill(8n), fill(999n, other)]), pool);
    expect(outcome.filled).toBe("20");
    expect(outcome.reverted).toBe(false);
  });
  it("does not treat a successful transaction without fills as an executed leg", () => {
    expect(outcomeFromReceipt(receipt([]), pool).filled).toBe("0");
  });
  it("preserves an on-chain revert and transaction hash", () => {
    const outcome = outcomeFromReceipt(receipt([], "reverted"), pool);
    expect(outcome.reverted).toBe(true);
    expect(outcome.filled).toBe("0");
    expect(outcome.hash).toBe(`0x${"b".repeat(64)}`);
  });
});
