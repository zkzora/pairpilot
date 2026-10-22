import { useState, type ReactNode } from "react";
import { formatEther, formatUnits } from "viem";
import type { Execution, PoolPermission } from "../../src/adapters/operator";
import type { AccountStatus } from "./parts";
import { shortHash, type Tone } from "./view";

export type ExecChoice = "own" | "linked";
export interface Discovery { state: "idle" | "scanning" | "done" | "error"; scannedBlocks: number; owners: { owner: string; verified: boolean; equity: number | null }[]; error?: string }

/** What the chain says about app wallets that linked this signer, with a one-click choice. */
function LinkedOwners({ discovery, onFind, onUse, busy, locked, zeroOwnMargin }: { discovery: Discovery; onFind: () => void; onUse: (owner: string) => void; busy: boolean; locked: boolean; zeroOwnMargin: boolean }) {
  const verified = discovery.owners.filter(o => o.verified);
  const hours = (discovery.scannedBlocks / 36_000).toFixed(1); // ~10 blocks per second on Tokyo
  return <div className="link-hint" aria-label="Linked app wallets" role="status">
    {zeroOwnMargin && <span className="pretty">This wallet has <strong>no Perps margin of its own</strong>. Through Link a Bot it can trade an app wallet&apos;s margin instead.</span>}
    {discovery.state === "scanning" && <span className="hint">Looking for app wallets that linked this signer… {discovery.scannedBlocks ? `${hours} h of blocks checked` : ""}</span>}
    {discovery.state === "error" && <span className="error-line">Link lookup failed: {discovery.error}</span>}
    {verified.map(o => <div className="found" key={o.owner}>
      <span>Linked by app wallet <span className="mono" title={o.owner}>{shortHash(o.owner)}</span>{o.equity !== null && <> · {chip(`${num(o.equity, 2)} USDso`, o.equity > 0 ? "ok" : "warn")}</>}</span>
      <button type="button" className="btn sm primary" disabled={busy || locked} onClick={() => onUse(o.owner)}>Trade this app wallet</button>
    </div>)}
    {discovery.state === "done" && discovery.owners.some(o => !o.verified) && <span className="hint">Some grants in the logs are not accepted by the selected pools (revoked or partial); they are not offered.</span>}
    {discovery.state === "done" && verified.length === 0 && <span className="hint pretty">No Link a Bot grant for this signer in the last {hours} h. If you linked it earlier, choose Linked wallet and paste the app wallet&apos;s full address.</span>}
    {(discovery.state === "done" || discovery.state === "error" || discovery.state === "idle") && <button type="button" className="link-btn" disabled={busy} onClick={onFind}>{discovery.state === "idle" ? "Find linked app wallets" : "Search again"}</button>}
  </div>;
}
const chip = (v: string, t: Tone) => <span className={`chip t-${t}`}>{v}</span>;
const num = (n: number, d: number) => n.toLocaleString("en-US", { maximumFractionDigits: d });
function Row({ k, title, children }: { k: string; title?: string; children: ReactNode }) {
  return <div className="line"><span className="k" title={title}>{k}</span><span className="v">{children}</span></div>;
}
const count = (n: number | null | undefined) => n === null || n === undefined ? chip("Read failed", "bad") : chip(n === 0 ? "None" : `${n}`, n === 0 ? "ok" : "warn");

/** Testnet execution account: who signs and pays gas, and whose positions and margin are used. */
export function ExecutionPanel(p: {
  choice: ExecChoice; onChoice: (c: ExecChoice) => void; signer: string; execution: Execution | null;
  ownerInput: string; onOwnerInput: (v: string) => void; onApplyOwner: () => void; savedOwners: string[];
  status: AccountStatus | null; statusError: string; permissions: PoolPermission[] | null; permissionsError: string;
  loading: boolean; busy: boolean; locked: boolean; onRefresh: () => void;
  discovery: Discovery; onFind: () => void; onUseOwner: (owner: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const operator = p.execution?.mode === "operator";
  const gas = p.status?.gasWei == null ? null : Number(formatEther(p.status.gasWei));
  const equity = p.status?.equity == null ? null : Number(formatUnits(p.status.equity, p.status.quoteDecimals));
  const missing = p.permissions?.filter(x => !x.placeOrderFor).map(x => x.symbol) ?? [];
  // A failed read is shown as unread, never as a value or as still loading.
  const pending = p.statusError ? chip("Not read", "warn") : "…";
  const gasChip = gas === null ? (p.status ? chip("Read failed", "bad") : pending) : chip(`${num(gas, 4)} STT`, gas === 0 ? "bad" : gas < 1 ? "warn" : "ok");
  const marginChip = equity === null ? (p.status ? chip("Read failed", "bad") : pending) : chip(`${num(equity, 2)} USDso`, equity > 0 ? "ok" : "bad");
  const activity = !p.status ? null : [p.status.activePositions, p.status.restingOrders, p.status.pendingStops];
  const activityChip = !activity ? pending : activity.some(n => n === null) ? chip("Read failed", "warn") : activity.every(n => n === 0) ? chip("Empty", "ok") : chip(`${activity[0]} pos · ${activity[1]} ord · ${activity[2]} stop`, "warn");
  // Compact once chosen and healthy; the full form returns for any problem or on request.
  const problem = Boolean(p.permissionsError || missing.length);
  const compact = Boolean(p.execution) && !editing && !problem && (p.choice === "own" || operator);
  const refresh = p.execution && <button type="button" className="link-btn end-btn" disabled={p.loading || p.busy} onClick={p.onRefresh}>{p.loading ? "Reading…" : "Refresh"}</button>;

  if (compact && p.execution) return <section className="ticket acct-panel compact" aria-label="Execution account">
    <div className="ticket-head">
      <h2 className="sub">Execution</h2><span className={`tag ${operator ? "t-net" : "t-mute"}`}>{operator ? "LINKED WALLET" : "OWN WALLET"}</span>
      {refresh}
      <button type="button" className="link-btn" disabled={p.busy || p.locked} title={p.locked ? "Resolve or close the active pair before changing who trades." : undefined} onClick={() => setEditing(true)}>Change</button>
    </div>
    {p.statusError && <span className="error-line" role="alert">Account read failed: {p.statusError}</span>}
    <div className="mini" aria-label={operator ? "Owner account" : "Trading account"}>
      <Row k={operator ? "Owner" : "Account"} title={p.execution.owner}><span className="mono">{shortHash(p.execution.owner)}</span></Row>
      <Row k="Margin">{marginChip}</Row>
      <Row k="Activity">{activityChip}</Row>
      {!operator && <Row k="Gas">{gasChip}</Row>}
    </div>
    {operator && <>
      <div className="mini" aria-label="Signer account">
        <Row k="Signer" title={p.execution.signer}><span className="mono">{shortHash(p.execution.signer)}</span></Row>
        <Row k="Gas">{gasChip}</Row>
      </div>
      <div className="mini" aria-label="Operator permissions">
        {p.permissions?.map(x => <Row key={x.symbol} k={`${x.symbol}-PERP`}>{chip(x.placeOrderFor ? "Can place" : "Cannot place", x.placeOrderFor ? "ok" : "bad")}</Row>) ?? <span className="hint">Reading permissions…</span>}
      </div>
    </>}
    {!operator && equity === 0 && <LinkedOwners discovery={p.discovery} onFind={p.onFind} onUse={p.onUseOwner} busy={p.busy} locked={p.locked} zeroOwnMargin />}
    {p.locked && <span className="hint">Resolve or close the active pair before changing who trades.</span>}
    {p.status && <span className="hint">Read {new Date(p.status.checkedAt).toLocaleTimeString()}. Re-checked before preview and every send.</span>}
  </section>;

  return <section className="ticket acct-panel" aria-label="Execution account">
    <div className="ticket-head"><h2 className="sub">Execution</h2>{refresh}{p.execution && editing && <button type="button" className="link-btn" onClick={() => setEditing(false)}>Done</button>}</div>
    <div className="seg" role="radiogroup" aria-label="Execution account">
      <button type="button" role="radio" aria-checked={p.choice === "own"} className="net" disabled={p.busy || p.locked} onClick={() => { setEditing(false); p.onChoice("own"); }}>Own wallet</button>
      <button type="button" role="radio" aria-checked={p.choice === "linked"} className="net" disabled={p.busy || p.locked} onClick={() => { setEditing(true); p.onChoice("linked"); }}>Linked wallet</button>
    </div>
    {p.locked && <span className="hint">Resolve or close the active pair before changing who trades.</span>}
    <span className="hint pretty">{p.choice === "own" ? "The connected wallet signs and trades its own Perps account." : "The connected wallet signs and pays gas for a dreamDEX app wallet that linked it with Link a Bot. Margin and positions stay on that owner."}</span>
    {p.choice === "linked" && <div className="field">
      <label htmlFor="owner">Trading owner · full app-wallet address</label>
      <div className="input"><input id="owner" list="saved-owners" value={p.ownerInput} onChange={e => p.onOwnerInput(e.target.value.trim())} disabled={p.busy || p.locked} placeholder="0x… (40 hex characters)" spellCheck={false} autoComplete="off" style={{ fontSize: 13 }} /></div>
      <datalist id="saved-owners">{p.savedOwners.map(o => <option key={o} value={o} />)}</datalist>
      <button type="button" className="btn sm" disabled={p.busy || p.locked || !p.signer || !p.ownerInput} onClick={() => { setEditing(false); p.onApplyOwner(); }}>Use this owner</button>
      {!p.signer && <span className="hint">Connect the signer wallet first.</span>}
      {p.signer && <LinkedOwners discovery={p.discovery} onFind={p.onFind} onUse={o => { setEditing(false); p.onUseOwner(o); }} busy={p.busy} locked={p.locked} zeroOwnMargin={false} />}
    </div>}
    {!p.execution ? <span className="hint">{p.signer ? "Choose who trades, then read the account." : "Connect a wallet in Testnet mode to sign."}</span> : <>
      {p.statusError && <span className="error-line" role="alert">Account read failed: {p.statusError}</span>}
      <div className="ticket-group" aria-label={operator ? "Owner account" : "Trading account"}>
        <span className="hint">{operator ? "Owner · positions and margin" : "Account · positions, margin and gas"}</span>
        <Row k="Address" title={p.execution.owner}><span className="mono">{shortHash(p.execution.owner)}</span></Row>
        <Row k="Perps margin">{marginChip}</Row>
        <Row k="Open positions">{p.status ? count(p.status.activePositions) : pending}</Row>
        <Row k="Resting orders">{p.status ? count(p.status.restingOrders) : pending}</Row>
        <Row k="Pending stops">{p.status ? (p.status.pendingStops === null ? chip("Indexer unavailable", "warn") : count(p.status.pendingStops)) : pending}</Row>
        {!operator && <Row k="STT gas">{gasChip}</Row>}
      </div>
      {operator && <>
        <div className="ticket-group plan-sep" aria-label="Signer account">
          <span className="hint">Signer · signs and pays gas</span>
          <Row k="Address" title={p.execution.signer}><span className="mono">{shortHash(p.execution.signer)}</span></Row>
          <Row k="STT gas">{gasChip}</Row>
        </div>
        <div className="ticket-group plan-sep" aria-label="Operator permissions">
          <span className="hint">Permissions · checked on each pool</span>
          {p.permissionsError && <span className="error-line">Permission read failed: {p.permissionsError}</span>}
          {p.permissions ? p.permissions.map(x => <Row key={x.symbol} k={`${x.symbol}-PERP`}>{chip(x.placeOrderFor ? "Can place" : "Cannot place", x.placeOrderFor ? "ok" : "bad")}</Row>) : !p.permissionsError && <span className="hint">Reading…</span>}
          {missing.length > 0 && <span className="error-line" role="alert">This signer is not linked for {missing.join(" and ")} on this owner. In the dreamDEX app, Link a Bot with Perps ticked and paste {shortHash(p.execution.signer)}. Preview stays blocked.</span>}
        </div>
      </>}
      {p.status && <span className="hint">Read-only. Read at {new Date(p.status.checkedAt).toLocaleTimeString()}. Permissions are checked again before preview and before every send.</span>}
    </>}
  </section>;
}
