"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import { PairEngine } from "../src/core/engine";
import { BrowserJournal } from "../src/core/journal";
import { makePlan } from "../src/core/planner";
import type { CloseReview, MarketSpec, PairPlan, PairRecord, Venue } from "../src/core/types";
import { simMarkets, simMarks, simPrices, SimulatedVenue, type Scenario } from "../src/adapters/simulated";
import { monitorPair, summarizePair, type MarksRead } from "../src/core/monitor";
import { checkPair, DEFAULT_PAIR, samePair, type PairSelection } from "../src/core/pairs";
import { assertDepth, assertSnapshotPair } from "../src/core/planner";
import { DreamdexVenue, readPairHistory, readPairMarks, type LiveSnapshot } from "../src/adapters/dreamdex";
import type { Execution, PoolPermission } from "../src/adapters/operator";
import { hidekiTestnet, NETWORK } from "../src/lib/network";
import { ExecutionPanel, type Discovery, type ExecChoice } from "./ui/account";
import { Activity, Hero, Journal, Logo, MarketStrip, ModeSwitch, Post, Review, Ticket, type AccountStatus, type Mode, type Tab } from "./ui/parts";
import { PairMonitor, PairSummaryView, type HistoryState } from "./ui/monitor";
import { MONITOR_INTERVAL_MS, MONITOR_STALE_MS, monitorKey, ReadGate } from "./ui/read-gate";
import { Setup } from "./ui/setup";
import { shortHash } from "./ui/view";
import { isUnknownChain, walletErrorText } from "./ui/wallet-error";

declare global { interface Window { ethereum?: EIP1193Provider } }
const scenarios: { value: Scenario; label: string }[] = [
  { value: "success", label: "Both legs fill" }, { value: "second-empty", label: "Second leg gets no fill" },
  { value: "partial", label: "Second leg partially fills" }, { value: "timeout", label: "Timeout after broadcast" },
  { value: "recovery-empty", label: "First close finds no liquidity" }, { value: "second-rejected", label: "Second signature rejected" },
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
/** The snapshot only if it was read for exactly this long/short pair. */
const snapshotFor = (snap: LiveSnapshot | null, p: PairSelection) => snap && snap.markets[0]?.market.symbol === p.long && snap.markets[1]?.market.symbol === p.short ? snap : null;
/** History is re-read whenever the journal changes; a flat record's history is then fixed. */
const historyId = (r: PairRecord) => `${r.plan.id}#${r.events.length}`;
const ownersKey = (signer: string) => `pairpilot:owners:${signer.toLowerCase()}`;
function savedOwnersFor(signer: string): string[] { try { return signer ? JSON.parse(localStorage.getItem(ownersKey(signer)) ?? "[]") : []; } catch { return []; } }

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
  /** The connected wallet: always the SIGNER. The trading owner is execution.owner. */
  const [account, setAccount] = useState("");
  const [choice, setChoice] = useState<ExecChoice>("own");
  const [pair, setPair] = useState<PairSelection>(DEFAULT_PAIR);
  const pairRef = useRef<PairSelection>(DEFAULT_PAIR);
  const marketRequest = useRef(0);
  const [ownerInput, setOwnerInput] = useState("");
  const [execution, setExecution] = useState<Execution | null>(null);
  const [permissions, setPermissions] = useState<PoolPermission[] | null>(null);
  const [permissionsError, setPermissionsError] = useState("");
  const [closeReview, setCloseReview] = useState<CloseReview | null>(null);
  const [discovery, setDiscovery] = useState<Discovery>({ state: "idle", scannedBlocks: 0, owners: [] });
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
  const listening = useRef(false);
  const pendingWalletChange = useRef("");
  const disconnecting = useRef(false);
  /** Active pair monitor: the latest read for the CURRENT key only, one read at a time. */
  const [marks, setMarks] = useState<{ key: string; read: MarksRead | null; error: string }>({ key: "", read: null, error: "" });
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksTick, setMarksTick] = useState(0);
  const marksGate = useRef(new ReadGate());
  const marksKey = useRef("");
  const recordRef = useRef<PairRecord | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryState>>({});
  const historyLoads = useRef(new Set<string>());

  /** Read-only marks for the shown pair's OWN markets and owner. Never sends, never changes the journal. */
  async function readMarks(): Promise<void> {
    const r = recordRef.current, key = marksKey.current, v = live.current, s = sim.current;
    if (!r || !key || (r.plan.mode === "testnet" ? !v : !s)) return;
    if (!marksGate.current.busy) setMarksLoading(true);
    const result = await marksGate.current.run(key, () => marksKey.current, async () => r.plan.mode === "simulation" ? simMarks(r, s!.positionsRaw) : readPairMarks(v!.exchange, r));
    if (result.status === "skipped") {
      // A read that already timed out still holds the gate: say so instead of starting another request.
      if (result.overdue && marksKey.current === key) setMarks(m => ({ key, read: m.key === key ? m.read : null, error: "The previous read timed out and has not returned yet. No new request is sent until it does." }));
      return; // Otherwise the read in flight reports for itself.
    }
    setMarksLoading(false); setMarksTick(Date.now());
    if (result.status === "ok") setMarks({ key, read: result.value, error: "" });
    else if (result.status === "error") setMarks(m => ({ key, read: m.key === key ? m.read : null, error: result.error }));
    // Read for an account, chain, pair, mode or journal version that is no longer shown: dropped. Read the current one.
    else if (marksKey.current) return readMarks();
  }
  const loadHistory = useCallback(async (r: PairRecord) => {
    const id = historyId(r), v = live.current;
    if (r.plan.mode !== "testnet" || historyLoads.current.has(id)) return;
    if (!v) { setHistories(h => ({ ...h, [id]: { state: "error", error: "Connect the wallet to read receipts." } })); return; }
    historyLoads.current.add(id);
    setHistories(h => ({ ...h, [id]: { state: "loading" } }));
    try {
      const history = await readPairHistory(v.exchange, r);
      setHistories(h => live.current === v ? { ...h, [id]: { state: "ok", history, at: Date.now() } } : (({ [id]: _, ...rest }) => rest)(h));
    } catch (e) {
      setHistories(h => live.current === v ? { ...h, [id]: { state: "error", error: `History read failed: ${e instanceof Error ? e.message : String(e)}` } } : (({ [id]: _, ...rest }) => rest)(h));
    } finally { historyLoads.current.delete(id); }
  }, []);

  function persistSim(venue: SimulatedVenue) { localStorage.setItem("pairpilot:simulation", JSON.stringify(venue.snapshot())); }
  /** Active pairs are keyed by OWNER: the positions belong there, whichever key signs. */
  function activeKey(venue: Venue) { return `pairpilot:active:${venue.mode}:${venue.account.toLowerCase()}`; }
  async function restore(venue: Venue) {
    const id = localStorage.getItem(activeKey(venue));
    setRecord(id ? await journal.current!.read(id) : null);
    setPlan(null); setCloseReview(null);
  }
  async function refresh(target: PairSelection = pairRef.current) {
    const request = ++marketRequest.current;
    const current = () => request === marketRequest.current && samePair(pairRef.current, target);
    setLoading(true); setSnapshotError("");
    try {
      const response = await fetch(`/api/markets?long=${target.long}&short=${target.short}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Testnet read failed.");
      const read = data as LiveSnapshot;
      // A slower response for a previous pair or an older request is dropped, never shown.
      if (!current()) return null;
      setSnapshot(read); return read;
    } catch (e) { if (current()) setSnapshotError(e instanceof Error ? e.message : String(e)); return null; }
    finally { if (request === marketRequest.current) setLoading(false); }
  }
  /** Read-only: owner state, signer gas and, for a linked owner, both pools' permissions. */
  async function readAccount(fresh?: LiveSnapshot | null) {
    const v = live.current;
    if (!v) return;
    setStatusLoading(true); setStatusError(""); setPermissionsError("");
    const target = pairRef.current;
    const active = record && record.status !== "flat" ? record.plan.legs.map(l => ({ symbol: l.market.symbol, pool: l.market.pool })) : null;
    const snap = fresh ?? snapshot;
    const fromSnapshot = snap && snap.markets.length === 2 && snap.markets[0].market.symbol === target.long && snap.markets[1].market.symbol === target.short
      ? snap.markets.map(m => ({ symbol: m.market.symbol, pool: m.market.pool })) : null;
    const pools = async () => active ?? fromSnapshot ?? v.pairPools(target);
    const [s, p] = await Promise.allSettled([v.accountStatus(), v.execution.mode === "operator" ? pools().then(list => v.permissions(list)) : Promise.resolve(null)]);
    if (live.current !== v) return; // The wallet or owner changed while reading.
    if (s.status === "fulfilled") setStatus(s.value); else setStatusError(s.reason instanceof Error ? s.reason.message : String(s.reason));
    if (p.status === "fulfilled") {
      setPermissions(p.value);
      if (p.value?.every(x => x.placeOrderFor)) localStorage.setItem(ownersKey(v.signer), JSON.stringify([v.account, ...savedOwnersFor(v.signer).filter(o => o.toLowerCase() !== v.account.toLowerCase())].slice(0, 5)));
    } else setPermissionsError(p.reason instanceof Error ? p.reason.message : String(p.reason));
    setStatusLoading(false);
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
    // The first market read below uses the remembered pair.
    try { if (localStorage.getItem("pairpilot:exec-choice") === "linked") setChoice("linked"); } catch { /* a remembered choice is only a convenience */ }
    try {
      const saved = JSON.parse(localStorage.getItem("pairpilot:pair") ?? "null") as PairSelection | null;
      if (saved) { const valid = checkPair(saved); pairRef.current = valid; setPair(valid); }
    } catch { /* an invalid remembered pair falls back to the default */ }
    void refresh();
    return () => { void live.current?.dispose(); };
    // One initial restore, then explicit reads. No market polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!plan && !closeReview) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [plan, closeReview]);
  useEffect(() => {
    if (tab === "setup" && mode === "testnet" && live.current && !status && !statusLoading) void readAccount();
    // Reads once when Setup opens; Refresh re-reads explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode, execution]);

  /** Drop every trace of the previous signer in memory. Journals stay in local storage. */
  /** User-initiated: drop the signer session here and ask the wallet to revoke this site's access. Journals stay. */
  async function disconnect() {
    if (actionLock.current) return;
    disconnecting.current = true;
    try { await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); }
    catch { /* Not every wallet supports revocation; the session is still dropped here. */ }
    finally { forgetWallet(""); disconnecting.current = false; }
  }
  function forgetWallet(message: string) {
    void live.current?.dispose(); live.current = null;
    setAccount(""); setExecution(null); setStatus(null); setPermissions(null); setPlan(null); setCloseReview(null); setDedicated(false);
    setDiscovery({ state: "idle", scannedBlocks: 0, owners: [] });
    if (mode === "testnet") setRecord(null);
    setError(message);
  }
  async function action(label: string, work: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(label); setError("");
    try { await work(); } catch (e) { setError(walletErrorText(e)); }
    finally {
      actionLock.current = false; setBusy("");
      // A wallet change during a send is applied only after the engine has recorded the outcome.
      if (pendingWalletChange.current) { forgetWallet(pendingWalletChange.current); pendingWalletChange.current = ""; }
    }
  }
  function venue() {
    const result = mode === "simulation" ? sim.current : live.current;
    if (!result) throw new Error(choice === "linked" && account ? "Enter and apply the trading owner's full address first." : "Connect your testnet wallet first.");
    return result;
  }
  async function switchMode(next: Mode) {
    setMode(next); setError(""); setPlan(null); setCloseReview(null); setDedicated(false); setSelected(null);
    // Entering Testnet with books for another pair (chosen in Simulation): read the selected pair now.
    if (next === "testnet" && !snapshotFor(snapshot, pairRef.current)) { setSnapshot(null); void refresh(pairRef.current); }
    const target = next === "simulation" ? sim.current : live.current;
    if (target) await restore(target); else setRecord(null);
  }
  /** Build the testnet venue for this signer. Linked mode never falls back to the signer's own account. */
  async function applyExecution(signer: Address, next: ExecChoice, owner: string) {
    await live.current?.dispose(); live.current = null;
    setExecution(null); setStatus(null); setPermissions(null); setRecord(null); setPlan(null); setCloseReview(null); setDedicated(false);
    if (next === "linked" && !owner) return;
    const wallet = createWalletClient({ account: signer, chain: hidekiTestnet, transport: custom(window.ethereum!) });
    const v = new DreamdexVenue(wallet, next === "linked" ? owner : undefined);
    live.current = v; setExecution(v.execution);
    await restore(v);
    void readAccount();
  }
  function listen(provider: EIP1193Provider) {
    if (listening.current) return;
    listening.current = true;
    const changed = (what: string) => {
      const message = `Wallet ${what} changed. Reconnect to continue. Pairs stay in this browser's journal, bound to the signer that opened them.`;
      if (disconnecting.current) return; // Our own revoke, not an outside change.
      if (actionLock.current) pendingWalletChange.current = message; else forgetWallet(message);
    };
    provider.on?.("accountsChanged", () => changed("account"));
    provider.on?.("chainChanged", () => changed("network"));
  }
  async function connect() {
    if (!window.ethereum) throw new Error("No browser wallet found. Use the Setup tab to prepare a dedicated wallet, or run the local CLI.");
    const chainId = `0x${NETWORK.id.toString(16)}`;
    await window.ethereum.request({ method: "eth_requestAccounts" });
    try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
    catch (e) {
      if (!isUnknownChain(e)) throw e;
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: "Somnia Tokyo Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: [NETWORK.rpc], blockExplorerUrls: [NETWORK.explorer] }] });
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (Number(current) !== NETWORK.id) throw new Error(`The wallet is on chain ${Number(current)}, not Somnia Tokyo (${NETWORK.id}). Switch the network in the wallet, then connect again.`);
    const wallet = createWalletClient({ chain: hidekiTestnet, transport: custom(window.ethereum) });
    const [address] = await wallet.getAddresses();
    if (!address) throw new Error("Wallet returned no account.");
    listen(window.ethereum);
    setAccount(address);
    await applyExecution(address, choice, ownerInput);
    void findOwners(); // In the background: which app wallets linked this signer?
  }
  /** Read-only: app wallets that linked the connected signer, verified on the selected pools. */
  async function findOwners() {
    const v = live.current;
    if (!v) return;
    setDiscovery({ state: "scanning", scannedBlocks: 0, owners: [] });
    try {
      const target = pairRef.current;
      // Use the selected pair's read; fetch it if it is missing or still in flight.
      const snap = snapshotFor(snapshot, target) ?? await refresh(target);
      const pools = snap
        ? snap.markets.map(m => ({ symbol: m.market.symbol, pool: m.market.pool, marginBank: m.market.marginBank, quoteDecimals: m.market.quoteDecimals }))
        : await v.pairPools(target);
      const found = await v.discoverOwners(pools, n => { if (live.current === v) setDiscovery(d => ({ ...d, scannedBlocks: Number(n) })); });
      if (live.current !== v) return;
      setDiscovery({ state: "done", scannedBlocks: Number(found.scannedBlocks), owners: found.owners.map(o => ({ owner: o.owner, verified: o.verified, equity: o.equity === null ? null : Number(o.equity) / 10 ** o.quoteDecimals })) });
    } catch (e) { if (live.current === v) setDiscovery({ state: "error", scannedBlocks: 0, owners: [], error: walletErrorText(e) }); }
  }
  /** One click from a discovered, verified owner. Never applied without the user's click. */
  async function useOwner(owner: string) {
    if (!account) return;
    setChoice("linked"); setOwnerInput(owner);
    try { localStorage.setItem("pairpilot:exec-choice", "linked"); } catch { /* convenience only */ }
    await applyExecution(account as Address, "linked", owner);
  }
  async function chooseExecution(next: ExecChoice) {
    setChoice(next); setError("");
    try { localStorage.setItem("pairpilot:exec-choice", next); } catch { /* convenience only */ }
    if (account) await applyExecution(account as Address, next, "");
  }
  async function preview() {
    await action("Preparing preview…", async () => {
      const v = venue();
      if (record && record.status !== "flat") throw new Error("Close or reconcile the existing pair before opening another. Use Reset simulation to clear demo state.");
      const target = pairRef.current;
      const liveData = mode === "testnet" ? await refresh(target) : null;
      if (mode === "testnet" && !liveData) throw new Error("Could not refresh testnet prices for the selected pair. No preview created.");
      const books = liveData?.markets.map(m => ({ symbol: m.market.symbol, mark: m.mark, bids: m.bids, asks: m.asks }));
      if (books) assertSnapshotPair(books, target);
      const markets: [MarketSpec, MarketSpec] = liveData ? [liveData.markets[0].market, liveData.markets[1].market] : simMarkets(target);
      const prices: [bigint, bigint] = liveData ? [BigInt(liveData.markets[0].ask ?? "0"), BigInt(liveData.markets[1].bid ?? "0")] : simPrices(target);
      if (!/^\d+$/.test(slippage)) throw new Error("Slippage must be an integer from 1 to 100 bps.");
      const next = makePlan({ id: crypto.randomUUID(), account: v.account, signer: v.signer, mode, total, slippageBps: Number(slippage), markets, prices });
      if (liveData) {
        assertDepth(next, books!);
        // Includes the per-pool operator permission check for a linked owner.
        await v.assertReady(next);
      }
      // A pair change while reading invalidates this preview.
      if (!samePair(pairRef.current, target)) throw new Error("The pair changed while the preview was being prepared. Preview again.");
      setPlan(next);
    });
  }
  /** New pairs only. Locked while an active/unresolved pair exists (recovery uses the journal); a change discards any preview. */
  function selectPair(next: PairSelection) {
    if (actionLock.current || (record && record.status !== "flat")) return;
    const valid = checkPair(next);
    pairRef.current = valid; setPair(valid);
    try { localStorage.setItem("pairpilot:pair", JSON.stringify(valid)); } catch { /* convenience only */ }
    setPlan(null); setCloseReview(null); setDedicated(false);
    if (mode === "testnet") {
      setSnapshot(null);
      if (live.current?.execution.mode === "operator") setPermissions(null);
      // Permissions are re-read for the NEW pools once the new pair's markets arrive.
      void refresh(valid).then(read => { if (live.current?.execution.mode === "operator" && samePair(pairRef.current, valid)) void readAccount(read); });
    }
  }
  async function execute() {
    if (!plan) return;
    const v = venue();
    // Save active intent before a send so a page refresh can find the durable journal.
    localStorage.setItem(activeKey(v), plan.id);
    const result = await new PairEngine(v, journal.current!).open(plan);
    setRecord(result); setPlan(null);
  }
  async function reconcile() {
    if (!record) return;
    setCloseReview(null);
    setRecord(await new PairEngine(venue(), journal.current!).reconcile(record.plan.id));
  }
  async function reviewClose() {
    if (!record) return;
    setCloseReview(await new PairEngine(venue(), journal.current!).reviewClose(record.plan.id));
  }
  async function confirmClose() {
    if (!record || !closeReview) return;
    const review = closeReview;
    try { setRecord(await new PairEngine(venue(), journal.current!).close(record.plan.id, review)); }
    finally { setCloseReview(null); }
  }
  function newPair() {
    if (record?.status !== "flat") return;
    localStorage.removeItem(activeKey(venue())); // The flat record stays in the journal and Activity.
    setRecord(null); setDedicated(false);
  }
  function resetSimulation() {
    sim.current = new SimulatedVenue(scenario, persistSim); persistSim(sim.current);
    localStorage.removeItem("pairpilot:active:simulation:simulation");
    setRecord(null); setPlan(null); setCloseReview(null); setError("");
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
  const owner = mode === "simulation" ? "simulation" : execution?.owner ?? "";
  const records = useMemo(() => mounted && tab === "activity"
    ? storedRecords().filter(r => r.plan.mode === mode && (mode === "simulation" || (owner && r.plan.account.toLowerCase() === owner.toLowerCase())))
    : [], [mounted, tab, mode, owner, record]);
  const activeId = mounted && owner ? localStorage.getItem(`pairpilot:active:${mode}:${owner.toLowerCase()}`) : null;
  const showPost = Boolean(record && !plan);
  const linked = execution?.mode === "operator";
  const missing = permissions?.filter(p => !p.placeOrderFor).map(p => p.symbol) ?? [];
  const recordSigner = record ? record.plan.signer ?? record.plan.account : "";
  const signerMismatch = record && mode === "testnet" && account && recordSigner.toLowerCase() !== account.toLowerCase()
    ? `Opened by signer ${shortHash(recordSigner)}; the connected signer is ${shortHash(account)}. Connect the original signer to reconcile or close. This signer sends nothing for it.` : "";
  const previewBlock = mode === "simulation" ? "" : !account ? "Connect a wallet to preview" : choice === "linked" && !execution ? "Enter and apply the trading owner" : missing.length ? `Signer is not linked for ${missing.join(" and ")}` : "";
  // Everything the monitor read depends on. A change discards reads in flight for the old key.
  const watchKey = record && !plan && record.status !== "flat" ? monitorKey({ mode, chainId: NETWORK.id, owner: record.plan.account, signer: mode === "simulation" ? "simulation" : account, planId: historyId(record), symbols: [record.plan.legs[0].market.symbol, record.plan.legs[1].market.symbol] }) : "";
  marksKey.current = watchKey; recordRef.current = record;
  const watching = tab === "trade" && Boolean(watchKey) && !busy;
  useEffect(() => {
    if (!watching) return;
    void readMarks();
    // Simulated marks change only when the journal does; testnet re-reads on a bounded interval.
    if (mode === "simulation") return;
    const timer = setInterval(() => { setMarksTick(Date.now()); if (!document.hidden) void readMarks(); }, MONITOR_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, watchKey]);
  const shownMarks = marks.key === watchKey ? marks : { read: null, error: "" };
  const marksView = useMemo(() => {
    if (!record || !shownMarks.read) return null;
    try { return monitorPair(record, shownMarks.read); } catch { return null; } // A read for other markets is discarded.
  }, [record, shownMarks.read]);
  const marksStale = Boolean(shownMarks.read && mode === "testnet" && marksTick - shownMarks.read.readAt > MONITOR_STALE_MS);
  const drift = marksView && !marksStale && !shownMarks.error ? marksView.legs.filter(l => l.attribution === "differs").map(l => l.symbol) : [];
  const summaryFor = (r: PairRecord) => {
    const h = histories[historyId(r)];
    return <PairSummaryView record={r} summary={summarizePair(r, h?.state === "ok" ? h.history : undefined)} history={h} onLoad={() => void loadHistory(r)} />;
  };
  const monitorSlot = !record ? null : record.status === "flat" ? summaryFor(record)
    : <PairMonitor record={record} view={marksView} state={{ read: shownMarks.read, error: shownMarks.error, loading: marksLoading, stale: marksStale }} signer={record.plan.signer ?? record.plan.account} disabled={Boolean(busy)} onRefresh={() => void readMarks()} />;
  const accountLabel = !execution ? "" : linked ? `Owner ${shortHash(execution.owner)} · signer ${shortHash(execution.signer)}` : `${shortHash(execution.owner)} · own browser wallet`;

  return <div className="app">
    <header className="hdr">
      <a className="brand" href="/home"><Logo /><span>PairPilot</span></a>
      <nav className="nav" aria-label="Sections">{tabs.map(([k, label]) => <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>)}</nav>
      <div className="spacer" />
      <ModeSwitch mode={mode} disabled={Boolean(busy)} onChange={next => void action("Switching…", () => switchMode(next))} />
      {mode === "testnet" && (account
        ? <><div className="pill"><span className="dot" />Somnia Tokyo · {NETWORK.id}</div><div className="addr"><span title={`Signer ${account}`}>{shortHash(account)}</span><button type="button" onClick={copyAddress} title="Copy signer address">{copied ? "Copied" : "Copy"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void disconnect()} title="Disconnect this wallet from PairPilot">Disconnect</button></div></>
        : <button type="button" className="btn sm" disabled={Boolean(busy)} onClick={() => void action("Connecting wallet…", connect)}>Connect wallet</button>)}
      <a className="help" href="/setup">Help</a>
    </header>
    <div className={`banner ${mode === "simulation" ? "sim" : ""}`}>
      <span className={`tag ${mode === "simulation" ? "t-sim" : "t-net"}`}>{mode === "simulation" ? "SIMULATION" : "TESTNET"}</span>
      <span className="copy">{mode === "simulation" ? "Simulated prices and fills. No wallet, no real orders." : linked ? `Signs real orders on Somnia Tokyo testnet FOR owner ${shortHash(execution!.owner)}; signer ${shortHash(execution!.signer)} pays gas. Two sequential orders are not atomic.` : "Signs real orders on Somnia Tokyo testnet. Two sequential orders are not atomic. Mainnet is disabled."}</span>
      <ModeSwitch mode={mode} disabled={Boolean(busy)} onChange={next => void action("Switching…", () => switchMode(next))} />
    </div>
    <main className={`main ${showPost ? "post" : !plan && !record ? "idle" : ""}`}>
      {error && <div className="alert bad" role="alert"><span className="glyph" aria-hidden="true">!</span><div><span className="body">{error}</span></div></div>}
      {busy && <p className="status-line" role="status">{busy} Keep this tab open until the result is recorded.</p>}
      {tab === "trade" && <>
        <MarketStrip mode={mode} pair={pair} snapshot={snapshotFor(snapshot, pair)} error={snapshotError} loading={loading} disabled={Boolean(busy)} onRefresh={() => void refresh()} />
        <div className="work">
          <section className="panel" aria-label="Pair workspace">
            {plan ? <Review plan={plan} now={now} mode={mode} accountLabel={accountLabel} scenario={scenarios.find(s => s.value === scenario)!.label} dedicated={dedicated} busy={Boolean(busy)} onAck={setDedicated} onEdit={() => setPlan(null)} onRefresh={() => void preview()} onSign={() => void action(mode === "simulation" ? "Executing simulation…" : "Waiting for wallet / receipts…", execute)} />
              : record ? <Post record={record} busy={engineBusy} actionsDisabled={Boolean(busy)} signerMismatch={signerMismatch} closeReview={closeReview} now={now} monitor={monitorSlot} drift={drift}
                  onReconcile={() => void action("Reading receipts and positions…", reconcile)} onClose={() => void action("Reading positions for the close review…", reviewClose)}
                  onConfirmClose={() => void action(mode === "simulation" ? "Closing filled exposure…" : "Closing: confirm each order in your wallet…", confirmClose)} onCancelClose={() => setCloseReview(null)} onNew={newPair} onExport={() => download(record)} />
              : <Hero pair={pair} />}
          </section>
          <div className="side">
            {mode === "testnet" && <ExecutionPanel choice={choice} onChoice={c => void action("Switching account…", () => chooseExecution(c))} signer={account} execution={execution}
              ownerInput={ownerInput} onOwnerInput={setOwnerInput} onApplyOwner={() => void action("Checking owner…", () => applyExecution(account as Address, "linked", ownerInput))} savedOwners={mounted ? savedOwnersFor(account) : []}
              status={status} statusError={statusError} permissions={permissions} permissionsError={permissionsError} loading={statusLoading} busy={Boolean(busy)}
              discovery={discovery} onFind={() => void findOwners()} onUseOwner={o => void action("Checking owner…", () => useOwner(o))} locked={Boolean(plan || (record && record.status !== "flat"))} onRefresh={() => void readAccount()} />}
            <Ticket mode={mode} plan={plan} record={record} busy={busy} mounted={mounted} previewBlock={previewBlock} pair={pair} onPair={selectPair} total={total} slippage={slippage} scenario={scenario} scenarios={scenarios}
              onTotal={v => { setTotal(v); setPlan(null); }} onSlippage={v => { setSlippage(v); setPlan(null); }} onScenario={v => { const next = v as Scenario; setScenario(next); if (sim.current) { sim.current.scenario = next; persistSim(sim.current); } }}
              onPreview={() => void preview()} onEdit={() => setPlan(null)} onReset={resetSimulation} />
          </div>
        </div>
        <Journal record={showPost ? record : null} open={journalOpen} onToggle={() => setJournalOpen(o => !o)} />
      </>}
      {tab === "activity" && <Activity mode={mode} account={owner === "simulation" ? "" : owner} records={records} activeId={activeId} filter={filter} selectedId={selected} summary={summaryFor} onFilter={setFilter} onSelect={setSelected} onResolve={() => setTab("trade")} onExport={download} onSimulate={() => { setTab("trade"); if (mode !== "simulation") void action("Switching…", () => switchMode("simulation")); }} />}
      {tab === "setup" && <Setup path={setupPath} onPath={setSetupPath} mode={mode} account={account} hasWallet={hasWallet} status={status} statusError={statusError} loading={statusLoading} copied={copied} busy={Boolean(busy)} onRefresh={() => void readAccount()} onCopy={copyAddress} onTrade={() => setTab("trade")} onConnect={() => void action("Connecting wallet…", connect)} onTestnet={() => void action("Switching…", () => switchMode("testnet"))} />}
    </main>
    <nav className="bottom-nav" aria-label="Sections">{tabs.map(([k, label]) => <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{label}</button>)}</nav>
  </div>;
}
