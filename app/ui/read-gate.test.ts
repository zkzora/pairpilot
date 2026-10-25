import { describe, expect, it } from "vitest";
import { monitorKey, ReadGate } from "./read-gate";

const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setTimeout(r, 0));

describe("monitor read gate", () => {
  it("never runs two reads at once", async () => {
    const gate = new ReadGate(), d = deferred<number>();
    const first = gate.run("k", () => "k", () => d.promise);
    expect(await gate.run("k", () => "k", async () => 2)).toEqual({ status: "skipped", overdue: false });
    d.resolve(1);
    expect(await first).toEqual({ status: "ok", value: 1 });
    await tick();
    expect(await gate.run("k", () => "k", async () => 3)).toEqual({ status: "ok", value: 3 });
  });
  it("keeps the lock after a timeout until the slow read settles, so refreshes never stack requests", async () => {
    const gate = new ReadGate(20), slow = deferred<number>();
    let started = 0, active = 0, maxActive = 0;
    const read = (p: Promise<number>) => async () => { started++; active++; maxActive = Math.max(maxActive, active); try { return await p; } finally { active--; } };
    expect(await gate.run("k", () => "k", read(slow.promise))).toEqual({ status: "error", error: "Read timed out after 0.02 s." });
    expect(gate.busy).toBe(true);
    // Repeated refresh attempts while the timed-out request is still open.
    for (let i = 0; i < 5; i++) expect(await gate.run("k", () => "k", read(Promise.resolve(i)))).toEqual({ status: "skipped", overdue: true });
    expect([started, active, maxActive]).toEqual([1, 1, 1]);
    slow.resolve(42); // The late value is never delivered: its caller already got the timeout.
    await tick(); await tick();
    expect(gate.busy).toBe(false);
    expect(await gate.run("k", () => "k", read(Promise.resolve(7)))).toEqual({ status: "ok", value: 7 });
    expect([started, maxActive]).toEqual([2, 1]);
  });
  it("releases the lock when a timed-out read later fails", async () => {
    const gate = new ReadGate(20), slow = deferred<number>();
    await gate.run("k", () => "k", () => slow.promise);
    slow.reject(new Error("rpc down"));
    await tick(); await tick();
    expect(gate.busy).toBe(false);
  });
  it("discards a result or an error that lands after the context changed", async () => {
    const gate = new ReadGate();
    let current = "pair-a";
    const d = deferred<number>();
    const pending = gate.run("pair-a", () => current, () => d.promise);
    current = "pair-b"; // account, chain, pair or mode changed while reading
    d.resolve(1);
    expect(await pending).toEqual({ status: "stale" });
    await tick();
    const e = deferred<number>();
    const failing = gate.run("pair-b", () => current, () => e.promise);
    current = "pair-c";
    e.reject(new Error("rpc down"));
    expect(await failing).toEqual({ status: "stale" });
  });
  it("reports a failed read as an error instead of a value", async () => {
    const gate = new ReadGate(20);
    expect(await gate.run("k", () => "k", async () => { throw new Error("rpc down"); })).toEqual({ status: "error", error: "rpc down" });
  });
  it("keys reads by mode, chain, owner, signer, pair id and markets", () => {
    const base = { mode: "testnet", chainId: 50383, owner: "0xAA", signer: "0xBB", planId: "p1", symbols: ["ETH", "BTC"] as [string, string] };
    expect(monitorKey(base)).toBe(monitorKey({ ...base, owner: "0xaa" }));
    for (const change of [{ mode: "simulation" }, { chainId: 1 }, { owner: "0xCC" }, { signer: "0xDD" }, { planId: "p2" }, { symbols: ["BTC", "ETH"] as [string, string] }])
      expect(monitorKey({ ...base, ...change })).not.toBe(monitorKey(base));
  });
});
