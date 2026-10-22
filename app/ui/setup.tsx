import type { ReactNode } from "react";
import { formatEther, formatUnits } from "viem";
import { NETWORK } from "../../src/lib/network";
import type { AccountStatus, Mode } from "./parts";
import { shortHash, type Tone } from "./view";

type Check = { v: string; t: Tone };
const fmt = (n: number, digits: number) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const time = (at: number) => new Date(at).toLocaleTimeString();
const voucherReasons: Record<string, string> = { alreadyClaimed: "Already claimed by this address", notFlat: "The account holds a position or resting order", mainFunded: "The account carries principal from a linked main wallet", ended: "The campaign has ended", notStarted: "The campaign has not started", budgetExhausted: "The voucher budget is exhausted", dormant: "No voucher programme on this deployment" };

/** Each step's live state, from read-only checks only. */
function setupChecks(status: AccountStatus | null) {
  if (!status) return null;
  const gas = status.gasWei === null ? null : Number(formatEther(status.gasWei));
  const equity = status.equity === null ? null : Number(formatUnits(status.equity, status.quoteDecimals));
  const v = status.voucher;
  const count = (n: number | null): Check => n === null ? { v: "Read failed", t: "bad" } : { v: n === 0 ? "None" : `${n} found`, t: n === 0 ? "ok" : "warn" };
  const checks = {
    network: (status.chainId === null ? { v: "Read failed", t: "bad" } : status.chainId === NETWORK.id ? { v: `Tokyo ${NETWORK.id}`, t: "ok" } : { v: `Wrong chain ${status.chainId}`, t: "bad" }) as Check,
    gas: (gas === null ? { v: "Read failed", t: "bad" } : { v: `${fmt(gas, 4)} STT`, t: gas === 0 ? "bad" : gas < 1 ? "warn" : "ok" }) as Check,
    margin: (equity === null ? { v: "Read failed", t: "bad" } : { v: `${fmt(equity, 2)} USDso`, t: equity > 0 ? "ok" : "bad" }) as Check,
    voucher: (!v ? { v: "Read failed", t: "warn" } : !v.eligible ? { v: "Not eligible", t: "mute" } : v.simulation === "ok" ? { v: "Claimable", t: "ok" } : { v: "Claim would revert", t: "bad" }) as Check,
    positions: count(status.activePositions), orders: count(status.restingOrders),
    stops: (status.pendingStops === null ? { v: "Indexer unavailable", t: "warn" } : count(status.pendingStops)) as Check,
  };
  const empty = checks.positions.t === "ok" && checks.orders.t === "ok" && checks.stops.t === "ok";
  return { ...checks, empty, ready: checks.network.t === "ok" && checks.gas.t !== "bad" && checks.margin.t === "ok" && empty };
}
function Step({ n, title, check, children }: { n: number; title: string; check?: Check | null; children: ReactNode }) {
  return <div className="step"><span className="num">{n}</span><div className="step-body"><div className="step-head"><span className="t">{title}</span>{check && <span className={`chip t-${check.t}`}>{check.v}</span>}</div>{children}</div></div>;
}
const Sub = ({ label, check }: { label: string; check: Check }) => <div className="sub-check"><span className="muted">{label}</span><span className={`chip t-${check.t}`}>{check.v}</span></div>;
const Cmd = ({ children }: { children: string }) => <code className="cmd">{children}</code>;
const gasWays = <ul className="ways">
  <li>dreamDEX testnet app: its gas top-up, or Link a Bot gas funding sent to this address.</li>
  <li>Event organizers.</li>
  <li>Shannon (50312) faucet STT only after bridging it to Tokyo. STT on Shannon does not pay Tokyo gas.</li>
</ul>;

export function Setup({ path, onPath, mode, account, hasWallet, status, statusError, loading, copied, busy, onRefresh, onCopy, onTrade, onConnect, onTestnet }: {
  path: "browser" | "cli"; onPath: (p: "browser" | "cli") => void; mode: Mode; account: string; hasWallet: boolean;
  status: AccountStatus | null; statusError: string; loading: boolean; copied: boolean; busy: boolean;
  onRefresh: () => void; onCopy: () => void; onTrade: () => void; onConnect: () => void; onTestnet: () => void;
}) {
  const connected = mode === "testnet" && Boolean(account);
  const live = connected ? setupChecks(status) : null;
  const v = connected ? status?.voucher : undefined;
  return <>
    <div className="setup-head"><h1>Setup</h1><span className="muted pretty" style={{ fontSize: 13 }}>Prepare one dedicated account for testnet pairs. Simulation needs none of this. <a href="/setup">Full setup guide</a></span></div>
    <div className="seg setup-paths" role="radiogroup" aria-label="Setup path">
      <button type="button" role="radio" aria-checked={path === "browser"} className="net" onClick={() => onPath("browser")}>Browser wallet</button>
      <button type="button" role="radio" aria-checked={path === "cli"} className="net" onClick={() => onPath("cli")}>Local CLI</button>
    </div>
    <div className="work">
      <div className="setup-main">
        {path === "browser" ? <div className="steps-list">
          <span className="muted pretty" style={{ fontSize: 13 }}>This website signs with a wallet extension and never sees a private key. Use an address that the CLI does not also use.</span>
          <Step n={1} title="Use a dedicated wallet account" check={hasWallet ? { v: "Wallet found", t: "ok" } : { v: "No wallet found", t: "bad" }}>
            <p>Install an EVM wallet extension and create a new account used only for PairPilot: no other bots, orders, stops or manual trades.</p>
          </Step>
          <Step n={2} title={`Connect on Somnia Tokyo (chain ${NETWORK.id})`} check={mode !== "testnet" ? { v: "Simulation mode", t: "mute" } : !account ? { v: "Not connected", t: "bad" } : live?.network ?? null}>
            <p>Connecting asks the wallet to add and switch to Tokyo. Shannon (50312) is a different network.</p>
            {mode !== "testnet" ? <button type="button" className="btn sm" disabled={busy} onClick={onTestnet}>Switch to Testnet mode</button>
              : !account && <button type="button" className="btn sm" disabled={busy || !hasWallet} onClick={onConnect}>Connect this wallet</button>}
          </Step>
          <Step n={3} title="Fund gas: at least 1 STT on Tokyo" check={live?.gas}>
            {connected ? <div className="fund"><span className="muted" style={{ fontSize: 12 }}>Send STT on chain {NETWORK.id} to</span><span className="mono addr-full">{account}</span><button type="button" className="link-btn" onClick={onCopy}>{copied ? "Copied" : "Copy address"}</button></div>
              : <p>Connect first to see the exact address to fund.</p>}
            {gasWays}
          </Step>
          <Step n={4} title="Add Perps margin (paper USDso)" check={live?.margin}>
            {live?.margin.t === "ok" ? <p>Margin is available. No voucher claim is needed.</p>
              : !v ? <p>Connect to read this address&apos;s one-time voucher state.</p>
              : !v.eligible ? <p>{voucherReasons[v.reason ?? ""] ?? "Not eligible"}. Ask the organizers for paper USDso.</p>
              : v.simulation === "ok" ? <p>The one-time 1,000 paper USDso voucher is claimable and a read-only claim simulation passes. Claim it once in the dreamDEX testnet app; this website does not send claims.</p>
              : <p className="c-warn pretty">The SDK reports this address eligible, but a read-only simulation of the claim reverts{v.revertData ? <> with <span className="mono">{v.revertData}</span></> : null}. Do not send it: it would fail and still cost gas. Ask the organizers for paper USDso.</p>}
            {live && <Sub label="One-time voucher" check={live.voucher} />}
          </Step>
          <Step n={5} title="Start from an empty account" check={live ? (live.empty ? { v: "Empty", t: "ok" } : { v: "Not empty", t: "warn" }) : null}>
            <p>Close other positions and cancel resting orders and pending stops, so every fill belongs to this pair.</p>
            {live && <div className="sub-checks"><Sub label="Positions" check={live.positions} /><Sub label="Resting orders" check={live.orders} /><Sub label="Pending stops (indexer)" check={live.stops} /></div>}
          </Step>
        </div> : <div className="steps-list">
          <span className="muted pretty" style={{ fontSize: 13 }}>The CLI signs with its own key in ignored <code>.env.local</code>. This website never reads that file, so the CLI address appears in your terminal, not here.</span>
          <Step n={1} title="Create or find the CLI wallet"><p><Cmd>npm run wallet:init</Cmd> creates one dedicated key and prints its address. It refuses to replace an existing file. Already set up? <Cmd>npm run wallet:status</Cmd> prints the address.</p></Step>
          <Step n={2} title="Fund gas: at least 1 STT on Tokyo"><p>Send STT on chain {NETWORK.id} to the printed address.</p>{gasWays}</Step>
          <Step n={3} title="Check the account"><p><Cmd>npm run wallet:status</Cmd> shows STT, Perps margin, open positions and voucher eligibility. Read-only.</p></Step>
          <Step n={4} title="Add Perps margin"><p><Cmd>npm run wallet:claim</Cmd> simulates the one-time voucher claim first and sends nothing if it would revert. Every attempt is kept in <code>evidence/voucher-claims.json</code>. If the simulation reverts, ask the organizers for paper USDso.</p></Step>
          <Step n={5} title="Trade the pair"><p><Cmd>npm run trade -- preview</Cmd>, then <Cmd>npm run trade -- open</Cmd> within 40 seconds. Run <Cmd>npm run trade -- reconcile</Cmd> after any doubt and <Cmd>npm run trade -- close</Cmd> to unwind. These sign real testnet transactions.</p></Step>
          <Step n={6} title="Or trade your dreamDEX app wallet"><p>In the dreamDEX app, Link a Bot with Perps ticked and paste the CLI address. The app wallet keeps its margin and positions; the CLI key only signs and pays gas. Add <Cmd>--owner=0x…</Cmd> with the app wallet&apos;s FULL address to every trade command, and start with <Cmd>npm run trade -- check</Cmd>, which reads both pools&apos; permissions. Steps 4 and 5 then apply to the app wallet, not the CLI key.</p></Step>
        </div>}
        <div className="dashed">No private keys are entered on this website. The browser trades only the connected wallet&apos;s own account. The CLI can trade a dreamDEX app wallet that linked the CLI key through Link a Bot (step 6 of the Local CLI path).</div>
      </div>
      <div className="acct" aria-busy={loading}>
        {path === "cli" ? <>
          <div className="acct-head">CLI wallet</div>
          <p className="muted pretty" style={{ fontSize: 13 }}>Its address, gas and margin are printed by <Cmd>npm run wallet:status</Cmd>. Browser and CLI keep separate journals: do not use both on one address.</p>
        </> : <>
          <div className="acct-head">Readiness{connected && <button type="button" className="btn sm" disabled={loading} onClick={onRefresh}>{loading ? "Reading…" : "Refresh"}</button>}</div>
          {mode !== "testnet" ? <p className="muted pretty" style={{ fontSize: 13 }}>Simulation mode. Switch to Testnet and connect a wallet to read its readiness. Nothing here is checked in simulation.</p>
            : !account ? <p className="muted pretty" style={{ fontSize: 13 }}>Connect a wallet to read its network, gas, margin and open activity.</p>
            : <>
              <div className="acct-addr"><span className="mono" title={account}>{shortHash(account)}</span><button type="button" className="link-btn" onClick={onCopy}>{copied ? "Copied" : "Copy"}</button></div>
              {statusError && <span className="error-line" role="alert">Account read failed: {statusError}</span>}
              {!status && !statusError && <span className="muted" style={{ fontSize: 13 }}>Reading account state from Somnia Tokyo…</span>}
              {live && <div className={`alert ${live.ready ? "ok" : "warn"}`}><span className="glyph" aria-hidden="true">{live.ready ? "✓" : "!"}</span><div><span className="title">{live.ready ? "Ready for a testnet pair" : "Not ready yet"}</span><span className="body">{live.ready ? "Network, gas, margin and an empty account were read just now." : "Finish the steps marked red or amber, then refresh."}</span></div></div>}
              {status && <span className="hint">Read-only. Read at {time(status.checkedAt)}.</span>}
            </>}
        </>}
        <button type="button" className={`btn full ${live?.ready ? "primary" : ""}`} onClick={onTrade}>Back to Trade</button>
      </div>
    </div>
  </>;
}
