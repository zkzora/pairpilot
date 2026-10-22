import { describe, expect, it } from "vitest";
import { createWalletClient, decodeFunctionData, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DreamdexVenue } from "./dreamdex";
import { assertPlacePermissions, encodePlaceOrderFor, IOC, OPERATOR_SELECTOR, operatorAbi, readPermissions, resolveExecution } from "./operator";
import { hidekiTestnet } from "../lib/network";

// Synthetic addresses and a throwaway key; no network calls and no transactions.
const signer = "0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50";
const owner = "0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5";
const eth = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf" as Address, btc = "0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0" as Address;

describe("owner/signer separation", () => {
  it("trades the signer's own account when no owner is configured", () => {
    expect(resolveExecution(signer)).toEqual({ mode: "own", owner: signer, signer });
  });
  it("keeps a configured owner apart from the signer", () => {
    expect(resolveExecution(signer, owner.toLowerCase())).toEqual({ mode: "operator", owner, signer });
  });
  it("refuses an owner that is the signer, a shortened address or a bad checksum", () => {
    expect(() => resolveExecution(signer, signer.toLowerCase())).toThrow("signer's own address");
    expect(() => resolveExecution(signer, "0x436d…c1F5")).toThrow("FULL");
    expect(() => resolveExecution(signer, owner.slice(0, 41))).toThrow("FULL");
    expect(() => resolveExecution(signer, owner.replace("dAE", "DAE"))).toThrow("FULL");
  });
  it("binds the venue's position reads to the owner and its signatures to the signer", async () => {
    const key = `0x${"1".repeat(64)}` as Hex, local = privateKeyToAccount(key);
    const wallet = createWalletClient({ account: local, chain: hidekiTestnet, transport: http("http://127.0.0.1:9") });
    const operator = new DreamdexVenue(wallet, owner), own = new DreamdexVenue(wallet);
    try {
      expect([operator.account, operator.signer, operator.execution.mode]).toEqual([owner, local.address, "operator"]);
      expect([own.account, own.signer, own.execution.mode]).toEqual([local.address, local.address, "own"]);
    } finally { await Promise.all([operator.dispose(), own.dispose()]); }
  });
});

describe("placeOrderFor encoding", () => {
  it("names the owner, explicit IOC, expiry and price bound; no builder fee or user data", () => {
    const expiry = 1_792_651_600_000_000_000n;
    const data = encodePlaceOrderFor({ owner: owner as Address, isBid: false, price: 84_745n * 10n ** 18n, quantity: 29_000n, expireTimestampNs: expiry });
    expect(data.slice(0, 10)).toBe(OPERATOR_SELECTOR.placeOrderFor);
    const { functionName, args } = decodeFunctionData({ abi: operatorAbi, data });
    expect(functionName).toBe("placeOrderFor");
    expect(args).toEqual([owner, false, 0n, 84_745n * 10n ** 18n, 29_000n, expiry, IOC, 0, "0x0000000000000000000000000000000000000000", 0n]);
  });
  it("rejects a missing price bound, quantity or expiry", () => {
    expect(() => encodePlaceOrderFor({ owner: owner as Address, isBid: true, price: 0n, quantity: 1n, expireTimestampNs: 1n })).toThrow("price bound");
    expect(() => encodePlaceOrderFor({ owner: owner as Address, isBid: true, price: 1n, quantity: 1n, expireTimestampNs: 0n })).toThrow("expiry");
  });
});

describe("operator permissions", () => {
  const legs = [{ symbol: "ETH", pool: eth }, { symbol: "BTC", pool: btc }];
  it("asks each pool for the three granted selectors", async () => {
    const asked: string[] = [];
    await readPermissions(async (pool, selector) => { asked.push(`${pool}:${selector}`); return true; }, legs);
    expect(asked.sort()).toEqual([eth, btc].flatMap(p => Object.values(OPERATOR_SELECTOR).map(s => `${p}:${s}`)).sort());
  });
  it("refuses to trade when either leg lacks placeOrderFor, naming the market", async () => {
    const execution = resolveExecution(signer, owner);
    const permissions = await readPermissions(async (pool, selector) => !(pool === btc && selector === OPERATOR_SELECTOR.placeOrderFor), legs);
    expect(() => assertPlacePermissions(execution, permissions)).toThrow(/BTC.*No order sent/);
    expect(() => assertPlacePermissions(execution, permissions)).not.toThrow(/ETH/);
  });
  it("passes when both legs may place for the owner", async () => {
    const permissions = await readPermissions(async () => true, legs);
    expect(() => assertPlacePermissions(resolveExecution(signer, owner), permissions)).not.toThrow();
  });
});
