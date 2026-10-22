import { describe, expect, it } from "vitest";
import { isUnknownChain, walletErrorCode, walletErrorText } from "./wallet-error";

describe("browser wallet errors (synthetic provider objects)", () => {
  it("never renders a plain provider object as [object Object]", () => {
    expect(walletErrorText({ code: -32000, message: "insufficient funds for gas" })).toBe("insufficient funds for gas (wallet error -32000)");
    expect(walletErrorText({ foo: 1 })).toBe('Wallet error: {"foo":1}');
    expect(walletErrorText(new Error("boom"))).toBe("boom");
  });
  it("explains a rejected and an already-pending request", () => {
    expect(walletErrorText({ code: 4001, message: "User rejected the request." })).toContain("rejected in the wallet");
    expect(walletErrorText({ code: -32002, message: "Request already pending" })).toContain("already has a request waiting");
  });
  it("recognizes an unknown chain directly or wrapped in an internal error", () => {
    expect(isUnknownChain({ code: 4902, message: "Unrecognized chain ID" })).toBe(true);
    expect(isUnknownChain({ code: -32603, message: "Internal error", data: { originalError: { code: 4902 } } })).toBe(true);
    expect(walletErrorCode({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(4902);
    expect(isUnknownChain({ code: -32603, message: 'Unrecognized chain ID "0xc4cf". Try adding the chain using wallet_addEthereumChain first.' })).toBe(true);
    expect(isUnknownChain({ code: 4001, message: "User rejected" })).toBe(false);
  });
});
