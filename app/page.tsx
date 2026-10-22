"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { PairEngine } from "../src/core/engine";
import { BrowserJournal } from "../src/core/journal";
import { makePlan } from "../src/core/planner";
import type { MarketSpec, PairPlan, PairRecord, Venue } from "../src/core/types";
import { SIM_MARKETS, SIM_PRICES, SimulatedVenue, type Scenario } from "../src/adapters/simulated";
import { DreamdexVenue, type LiveSnapshot } from "../src/adapters/dreamdex";
import { hidekiTestnet, NETWORK } from "../src/lib/network";
import { Activity, Hero, Journal, Logo, MarketStrip, ModeSwitch, Post, Review, Ticket, type AccountStatus, type Mode, type Tab } from "./ui/parts";
import { Setup } from "./ui/setup";
import { shortHash } from "./ui/view";

declare global { interface Window { ethereum?: EIP1193Provider } }
const scenarios: { value: Scenario; label: string }[] = [
  { value: "success", label: "Both legs fill" }, { value: "second-empty", label: "Second leg gets no fill" },
  { value: "partial", label: "Second leg partially fills" }, { value: "timeout", label: "Timeout after broadcast" },
  { value: "recovery-empty", label: "Recovery has no liquidity" },
];
const tabs: [Tab, string][] = [["trade", "Trade"], ["activity", "Activity"], ["setup", "Setup"]];

/** Browser journal that also reports each durable write, so the UI shows progress mid-execution. */
class ObservedJournal extends BrowserJournal {
  constructor(private onWrite: (record: PairRecord) => void) { super(); }
  async write(record: PairRecord) { await super.write(record); this.onWrite(structuredClone(record)); }
}
function storedRecords(): PairRecord[] {
  const out: PairRecord[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("pairpilot:record:")) continue;
    try { out.push(JSON.parse(localStorage.getItem(key)!) as PairRecord); } catch { /* unreadable entries are skipped, never rewritten */ }
  }
  return out.sort((a, b) => b.plan.createdAt - a.plan.createdAt);
}

export default function Page() {
  const [tab, setTab] = useState<Tab>("trade");
  const [mode, setMode] = useState<Mode>("simulation");
  const [scenario, setScenario] = useState<Scenario>("success");
  const [total, setTotal] = useState("50");
  const [slippage, setSlippage] = useState("30");
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PairPlan | null>(null);
  const [record, setRecord] = useState<PairRecord | null>(null);
  const [account, setAccount] = useState("");
  const [dedicated, setDedicated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [journalOpen, setJournalOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [setupPath, setSetupPath] = useState<"browser" | "cli">("browser");
  const [hasWallet, setHasWallet] = useState(false);
  const sim = useRef<SimulatedVenue | null>(null);
  const live = useRef<DreamdexVenue | null>(null);
  const journal = useRef<ObservedJournal | null>(null);
  journal.current ??= new ObservedJournal(next => { setPlan(null); setRecord(next); });
  const actionLock = useRef(false);

  function persistSim(venue: SimulatedVenue) { localStorage.setItem("pairpilot:simulation", JSON.stringify(venue.snapshot())); }
  function activeKey(venue: Venue) { return `pairpilot:active:${venue.mode}:${venue.account.toLowerCase()}`; }
  async function restore(venue: Venue) {
    const id = localStorage.getItem(activeKey(venue));
    setRecord(id ? await journal.current!.read(id) : null);
    setPlan(null);
  }
  async function refresh() {
    setLoading(true); setSnapshotError("");
    try {
      const response = await fetch("/api/markets", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Testnet read failed.");
      setSnapshot(data as LiveSnapshot); return data as LiveSnapshot;
    } catch (e) { setSnapshotError(e instanceof Error ? e.message : String(e)); return null; }
    finally { setLoading(false); }
  }
  async function readStatus() {
    if (!live.current) return;
    setStatusLoading(true); setStatusError("");
    try { setStatus(await live.current.accountStatus()); }
    catch (e) { setStatusError(e instanceof Error ? e.message : String(e)); }
    finally { setStatusLoading(false); }
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pairpilot:simulation");
      sim.current = saved ? SimulatedVenue.restore(JSON.parse(saved), persistSim) : new SimulatedVenue("success", persistSim);
      setScenario(sim.current.scenario);
      void restore(sim.current).catch(e => setError(String(e)));
    } catch { setError("Saved simulation could not be restored. Use Reset simulation to start again."); }
    setMounted(true);
    setHasWallet(Boolean(window.ethereum));
    void refresh();
    return () => { void live.current?.dispose(); };
    // One initial restore, then explicit reads. No market polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!plan) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [plan]);
  useEffect(() => {
    if (tab === "setup" && mode === "testnet" && account && !status && !statusLoading) void readStatus();
    // Reads once when Setup opens; Refresh re-reads explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode, account]);

  async function action(label: string, work: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(label); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { actionLock.current = false; setBusy(""); }
  }
  function venue() {
    const result = mode === "simulation" ? sim.current : live.current;
    if (!result) throw new Error("Connect your testnet wallet first.");
    return result;
  }
  async function switchMode(next: Mode) {
    setMode(next); setError(""); setPlan(null); setDedicated(false); setSelected(null);
    const target = next === "simulation" ? sim.current : live.current;
    if (target) await restore(target); else setRecord(null);
  }
  async function connect() {
    if (!window.ethereum) throw new Error("No browser wallet found. Use the Setup tab to prepare a dedicated wallet, or run the local CLI.");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${NETWORK.id.toString(16)}` }] }); }
    catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: `0x${NETWORK.id.toString(16)}`, chainName: NETWORK.name, nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: [NETWORK.rpc], blockExplorerUrls: [NETWORK.explorer] }] });
    }
    const wallet = createWalletClient({ chain: hidekiTestnet, transport: custom(window.ethereum) });
    const [address] = await wallet.getAddresses();
    if (!address) throw new Error("Wallet returned no account.");
    await live.current?.dispose();
    live.current = new DreamdexVenue(createWalletClient({ account: address, chain: hidekiTestnet, transport: custom(window.ethereum) }));
    setAccount(address); setStatus(null); await restore(live.current);
  }
  async function preview() {
    await action("Preparing preview…", async () => {
      const v = venue();
      if (record && record.status !== "flat") throw new Error("Close or reconcile the existing pair before opening another. Use Reset simulation to clear demo state.");
      const liveData = mode === "testnet" ? await refresh() : null;
      if (mode === "testnet" && !liveData) throw new Error("Could not refresh testnet prices. No preview created.");
      const markets: [MarketSpec, MarketSpec] = liveData ? [liveData.markets[0].market, liveData.markets[1].market] : SIM_MARKETS;
      if (liveData?.markets.some(m => !m.mark)) throw new Error("A market's mark is stale. New pairs are unavailable.");
      const prices: [bigint, bigint] = liveData ? [BigInt(liveData.markets[0].ask ?? "0"), BigInt(liveData.markets[1].bid ?? "0")] : SIM_PRICES;
      if (!/^\d+$/.test(slippage)) throw new Error("Slippage must be an integer from 1 to 100 bps.");
      const next = makePlan({ id: crypto.randomUUID(), account: v.account, mode, total, slippageBps: Number(slippage), markets, prices });
      if (liveData) {
        for (const [index, leg] of next.legs.entries()) {
          const levels = index === 0 ? liveData.markets[index].asks : liveData.markets[index].bids;
          const visible = levels.filter(l => index === 0 ? BigInt(l.price) <= BigInt(leg.limitPrice) : BigInt(l.price) >= BigInt(leg.limitPrice)).reduce((sum, l) => sum + BigInt(l.quantity), 0n);
          if (visible < BigInt(leg.quantity)) throw new Error(`${leg.market.symbol}: insufficient visible depth within your slippage bound. Reduce notional or refresh.`);
        }
        await v.assertReady(next);
      }
      setPlan(next);
    });
  }
  async function execute() {
    if (!plan) return;
    const v = venue();
    // Save active intent before a send so a page refresh can find the durable journal.
    localStorage.setItem(activeKey(v), plan.id);
    const result = await new PairEngine(v, journal.current!).open(plan);
    setRecord(result); setPlan(null);
  }
  async function updatePair(kind: "close" | "reconcile") {
    if (!record) return;
    const engine = new PairEngine(venue(), journal.current!);
    setRecord(await engine[kind](record.plan.id));
  }
  function newPair() {
    if (record?.status !== "flat") return;
    localStorage.removeItem(activeKey(venue())); // The flat record stays in the journal and Activity.
    setRecord(null); setDedicated(false);
  }
  function resetSimulation() {
    sim.current = new SimulatedVenue(scenario, persistSim); persistSim(sim.current);
    localStorage.removeItem("pairpilot:active:simulation:simulation");
    setRecord(null); setPlan(null); setError("");
  }
  function download(target: PairRecord) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(target, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `pairpilot-${target.plan.mode}-${target.plan.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  function copyAddress() {
    void navigator.clipboard?.writeText(account).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  // Only engine work makes an in-flight operation "pending" rather than "interrupted".
  const engineBusy = ["Executing", "Waiting for wallet", "Reading receipts", "Closing"].some(prefix => busy.startsWith(prefix));
  const records = useMemo(() => mounted && tab === "activity"
    ? storedRecords().filter(r => r.plan.mode === mode && (mode === "simulation" || (account && r.plan.account.toLowerCase() === account.toLowerCase())))
    : [], [mounted, tab, mode, account, record]);
  const activeId = mounted ? localStorage.getItem(mode === "simulation" ? "pairpilot:active:simulation:simulation" : `pairpilot:active:testnet:${account.toLowerCase()}`) : null;
  const showPost = Boolean(record && !plan);

  return <div className="app">
    <header className="hdr">
      <a className="brand" href="/"><Logo /><span>PairPilot</span></a>
      <nav className="nav" aria-label="Sections">{tabs.map(([k, label]) => <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>)}</nav>
      <div className="spacer" />
      <ModeSwitch mode={mode} disabled={Boolean(busy)} onChange={next => void action("Switching…", () => switchMode(next))} />
      {mode === "testnet" && (account
        ? <><div className="pill"><span className="dot" />Somnia Tokyo · {NETWORK.id}</div><div className="addr"><span title={account}>{shortHash(account)}</span><button type="button" onClick={copyAddress} title="Copy address">{copied ? "Copied" : "Copy"}</button></div></>
        : <button type="button" className="btn sm" disabled={Boolean(busy)} onClick={() => void action("Connecting wallet…", connect)}>Connect wallet</button>)}
      <a className="help" href="/setup">Help</a>
    </header>
    <div className={`banner ${mode === "simulation" ? "sim" : ""}`}>
      <span className={`tag ${mode === "simulation" ? "t-sim" : "t-net"}`}>{mode === "simulation" ? "SIMULATION" : "TESTNET"}</span>
      <span className="copy">{mode === "simulation" ? "Simulated prices and fills. No wallet, no real orders." : "Signs real orders on Somnia Tokyo testnet. Two sequential orders are not atomic. Mainnet is disabled."}</span>
      <ModeSwitch mode={mode} disabled={Boolean(busy)} onChange={next => void action("Switching…", () => switchMode(next))} />
    </div>
    <main className={`main ${showPost ? "post" : !plan && !record ? "idle" : ""}`}>
      {error && <div className="alert bad" role="alert"><span className="glyph" aria-hidden="true">!</span><div><span className="body">{error}</span></div></div>}
      {busy && <p className="status-line" role="status">{busy} Keep this tab open until the result is recorded.</p>}
      {tab === "trade" && <>
        <MarketStrip mode={mode} snapshot={snapshot} error={snapshotError} loading={loading} disabled={Boolean(busy)} onRefresh={() => void refresh()} />
        <div className="work">
          <section className="panel" aria-label="Pair workspace">
            {plan ? <Review plan={plan} now={now} mode={mode} account={account} scenario={scenarios.find(s => s.value === scenario)!.label} dedicated={dedicated} busy={Boolean(busy)} onAck={setDedicated} onEdit={() => setPlan(null)} onRefresh={() => void preview()} onSign={() => void action(mode === "simulation" ? "Executing simulation…" : "Waiting for wallet / receipts…", execute)} />
              : record ? <Post record={record} busy={engineBusy} actionsDisabled={Boolean(busy)} onReconcile={() => void action("Reading receipts and positions…", () => updatePair("reconcile"))} onClose={() => void action("Closing filled exposure…", () => updatePair("close"))} onNew={newPair} onExport={() => download(record)} />
              : <Hero />}
          </section>
          <Ticket mode={mode} plan={plan} record={record} busy={busy} mounted={mounted} account={account} total={total} slippage={slippage} scenario={scenario} scenarios={scenarios}
            onTotal={v => { setTotal(v); setPlan(null); }} onSlippage={v => { setSlippage(v); setPlan(null); }} onScenario={v => { const next = v as Scenario; setScenario(next); if (sim.current) { sim.current.scenario = next; persistSim(sim.current); } }}
            onPreview={() => void preview()} onEdit={() => setPlan(null)} onReset={resetSimulation} />
        </div>
        <Journal record={showPost ? record : null} open={journalOpen} onToggle={() => setJournalOpen(o => !o)} />
      </>}
      {tab === "activity" && <Activity mode={mode} account={account} records={records} activeId={activeId} filter={filter} selectedId={selected} onFilter={setFilter} onSelect={setSelected} onResolve={() => setTab("trade")} onExport={download} onSimulate={() => { setTab("trade"); if (mode !== "simulation") void action("Switching…", () => switchMode("simulation")); }} />}
      {tab === "setup" && <Setup path={setupPath} onPath={setSetupPath} mode={mode} account={account} hasWallet={hasWallet} status={status} statusError={statusError} loading={statusLoading} copied={copied} busy={Boolean(busy)} onRefresh={() => void readStatus()} onCopy={copyAddress} onTrade={() => setTab("trade")} onConnect={() => void action("Connecting wallet…", connect)} onTestnet={() => void action("Switching…", () => switchMode("testnet"))} />}
    </main>
    <nav className="bottom-nav" aria-label="Sections">{tabs.map(([k, label]) => <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>)}</nav>
  </div>;
}
