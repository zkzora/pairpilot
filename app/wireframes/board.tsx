"use client";

import { useState } from "react";
import Link from "next/link";
import { PAIR_PRESETS, pairLabel } from "../../src/core/pairs";
import s from "./wireframes.module.css";

type Screen = "landing" | "dashboard" | "flow";
type Stage = "ready" | "review" | "paired" | "partial" | "unknown" | "close" | "flat";
const stages: [Stage, string][] = [["ready", "Empty"], ["review", "Open review"], ["paired", "Pair open"], ["partial", "Partial fill"], ["unknown", "Unknown"], ["close", "Close review"], ["flat", "Flat"]];
const references = [
  { name: "Morpho", url: "https://morpho.org/", observation: "Dominant technical hero, large left-aligned headline, restrained blue CTA.", use: "One strong visual focal point; preserve PairPilot's own palette and identity." },
  { name: "Linear", url: "https://linear.app/", observation: "Clear type hierarchy and a product preview that explains the workflow.", use: "Show the workspace early. Use distinct narrative sections instead of repeated feature cards." },
  { name: "Pear", url: "https://www.pear.garden/", observation: "Long/short language is introduced before entering the app.", use: "Explain the two-leg idea. Link directly to PairPilot's app; do not copy profit claims or feature scope." },
];

function Label({ number, children }: { number: string; children: React.ReactNode }) { return <span className={s.noteLabel}><b>{number}</b>{children}</span>; }
function Stub({ short = false }: { short?: boolean }) { return <span className={`${s.stub} ${short ? s.shortStub : ""}`} aria-hidden="true" />; }

export default function WireframeBoard() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [stage, setStage] = useState<Stage>("ready");
  const [tab, setTab] = useState("Trade");
  const [mobile, setMobile] = useState(false);
  const [annotated, setAnnotated] = useState(true);
  const [pairIndex, setPairIndex] = useState(0);
  const pair = PAIR_PRESETS[pairIndex];
  const active = !["ready", "flat"].includes(stage);
  const title = stages.find(([key]) => key === stage)![1];
  const chooseScreen = (next: Screen) => { setScreen(next); setTab("Trade"); };

  return <div className={s.page}>
    <header className={s.top}><div><span className={s.index}>PAIRPILOT / DESIGN STUDY 01</span><h1>One product. Two surfaces.</h1><p>Landing page + trading dashboard. An interactive structural wireframe.</p></div><div className={s.links}><Link href="/home">View landing ↗</Link><Link href="/">Open working app ↗</Link></div></header>
    <div className={s.toolbar}>
      <nav aria-label="Wireframe screens">{([['landing','Landing'],['dashboard','Dashboard'],['flow','User flow']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={screen === key} onClick={() => chooseScreen(key)}>{label}</button>)}</nav>
      <div className={s.options}><label><input type="checkbox" checked={annotated} onChange={e => setAnnotated(e.target.checked)} /> Notes</label><button type="button" aria-pressed={mobile} onClick={() => setMobile(v => !v)}>{mobile ? "Mobile view" : "Desktop view"}</button></div>
    </div>
    <p className={s.disclaimer}>DESIGN PROTOTYPE — illustrative data only. No wallet access, live balances, signatures, or orders.</p>
    {screen === "dashboard" && <div className={s.stageBar} aria-label="Dashboard state">{stages.map(([key, label]) => <button key={key} type="button" aria-pressed={stage === key} onClick={() => { setStage(key); setTab("Trade"); }}>{label}</button>)}</div>}
    <div className={s.board}>
      <main className={`${s.artboard} ${mobile ? s.mobile : ""} ${!annotated ? s.noNotes : ""}`} aria-label={`${screen} wireframe`}>
        {screen === "landing" && <>
          <div className={s.wireNav}><b><span className={s.mark} />PairPilot</b><span>Workspace · How it works · Proof</span><button type="button" onClick={() => chooseScreen("dashboard")}>Launch app ↗</button></div>
          <section className={s.wireHero}><div><Label number="01">Value proposition</Label><span className={s.kicker}>PAIR EXECUTION / SOMNIA TOKYO</span><h2>Two positions.<br />One clear plan.</h2><p>Review both legs. Follow actual fills.<br />Manage remaining exposure.</p><button type="button" className={s.darkButton} onClick={() => chooseScreen("dashboard")}>Open PairPilot ↗</button><span className={s.micro}>Testnet / paper USDso / your wallet signs</span></div><div className={s.artPlaceholder}><Label number="02">Original hero image</Label><div className={s.rails}><i /><i /></div><span>COBALT + TITANIUM<br />TWO SEPARATE PATHS</span></div></section>
          <div className={s.wireAssetBand}><span>4 ASSETS / 6 PAIRS</span><b>ETH / BTC / SOL / HYPE</b></div>
          <section className={s.wireSection}><Label number="03">Interactive product preview</Label><h3>Every leg has a story.<br />Keep the whole picture.</h3><div className={s.previewBlock}><aside>ETH / BTC<br /><br />SOL / ETH<br /><br />HYPE / SOL</aside><div><span>ILLUSTRATION / NO ORDERS</span><div className={s.previewCards}><div>LONG ETH<Stub /><Stub short /></div><div>SHORT BTC<Stub /><Stub short /></div></div><button type="button" onClick={() => { chooseScreen("dashboard"); setStage("partial"); }}>Explore the failure state →</button></div></div></section>
          <section className={`${s.wireSection} ${s.paperStrip}`}><Label number="04">Four-step explanation</Label><h3>A deliberate route through every trade.</h3><div className={s.fourSteps}>{['Build the pair','Review','Sign each leg','Reconcile & close'].map((x, i) => <div key={x}><span>0{i+1}</span><b>{x}</b><Stub /></div>)}</div></section>
          <section className={s.wireSection}><Label number="05">Verifiable testnet evidence</Label><h3>A trail you can verify.</h3><div className={s.evidenceLine}><b>ETH / BTC</b><span>4 transactions</span><span>Recorded flat</span></div><div className={s.evidenceLine}><b>SOL / BTC</b><span>4 transactions</span><span>Recorded flat</span></div><span className={s.micro}>Historical proof with real explorer links. No fabricated volume or PnL.</span></section>
          <section className={s.wireSection}><Label number="06">Limits + final CTA</Label><h3>Know the boundaries.</h3><p>Sequential execution · unknown receipts · liquidity · minimum sizes</p><button type="button" className={s.darkButton} onClick={() => chooseScreen("dashboard")}>Launch PairPilot ↗</button></section>
          <div className={s.wireFooter}>PairPilot <span>Setup / dreamDEX docs / Testnet</span></div>
        </>}

        {screen === "dashboard" && <>
          <div className={s.wireNav}><button type="button" className={s.brandButton} onClick={() => chooseScreen("landing")}><span className={s.mark} />PairPilot</button><nav aria-label="Dashboard wireframe tabs">{['Trade','Activity','Setup'].map(t => <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav><span>SIMULATION / WIREFRAME</span></div>
          <div className={s.wireBanner}>Prototype only. This screen cannot connect a wallet or send transactions.</div>
          {tab === "Trade" && <>
            <div className={s.marketStrip}><span>{pair.long}-PERP <Stub short /></span><span>{pair.short}-PERP <Stub short /></span><span>Snapshot + refresh<Stub short /></span></div>
            <div className={`${s.dashGrid} ${active ? s.activeGrid : ""}`}>
              <section className={s.workspace}><Label number="01">Execution state first when active</Label><span className={s.kicker}>{active ? `${pairLabel(pair)} / EXECUTION` : "NO ACTIVE PAIR"}</span><h2>{stage === "ready" ? "Trade the pair. Track every leg." : title}</h2>
                {stage === "ready" ? <><p>Make the purpose clear in one paragraph. Keep the order ticket above the explanation on mobile.</p><div className={s.previewCards}><div>LONG {pair.long}<Stub /><Stub short /></div><div>SHORT {pair.short}<Stub /><Stub short /></div></div><details><summary>How it works</summary><p>Review → sign each leg → reconcile → review close.</p></details></>
                  : stage === "review" ? <><div className={s.reviewNotice}>PREVIEW / Nothing signed / Countdown + expiry guard</div><div className={s.previewCards}><div>BUY {pair.long}<p>Quantity · price limit<br />IOC · lot/minimum</p></div><div>SELL {pair.short}<p>Quantity · price limit<br />IOC · lot/minimum</p></div></div><label className={s.ack}><input type="checkbox" /> Dedicated account acknowledgment</label><button type="button" className={s.darkButton} onClick={() => setStage("paired")}>Show open state →</button></>
                  : stage === "close" ? <><div className={s.reviewNotice}>CLOSE REVIEW / Exact remaining quantities / 30 s expiry</div><div className={s.evidenceLine}><b>{pair.long}</b><span>Actual open size</span><span>SELL + bound</span></div><div className={s.evidenceLine}><b>{pair.short}</b><span>Actual open size</span><span>BUY + bound</span></div><p>Show dust or blocked closes explicitly. Never promise all remaining exposure can be removed.</p><button type="button" className={s.darkButton} onClick={() => setStage("flat")}>Show closed state →</button></>
                  : <><div className={s.reviewNotice}>{stage === "unknown" ? "Outcome unknown. Read receipts before any new order." : stage === "partial" ? "One leg is incomplete. Show actual exposure and the recovery action." : stage === "flat" ? "Both owner positions read back as zero. Evidence remains available." : "Both legs filled. Position read-back matches the plan."}</div><div className={s.previewCards}>{[pair.long,pair.short].map((asset,i) => <div key={asset}><b>{i === 0 ? "LONG" : "SHORT"} {asset}</b><div className={s.wireProgress}>Wallet → Submitted → Confirmed → Filled</div><p>Requested / Filled / Open now</p><strong>{stage === "flat" ? "0" : i === 1 && stage === "unknown" ? "Unknown" : i === 1 && stage === "partial" ? "Partial quantity" : "Actual quantity"}</strong><Stub short /><span>Receipt / explorer link</span></div>)}</div><div className={s.wireActions}>{stage === "flat" ? <button type="button" className={s.darkButton} onClick={() => setStage("ready")}>New pair</button> : <button type="button" className={s.darkButton} disabled={stage === "unknown"} onClick={() => setStage("close")}>Review close</button>}{stage !== "flat" && <button type="button" onClick={() => stage === "unknown" && setStage("paired")}>Reconcile {stage === "unknown" && "→ show resolved state"}</button>}<span>Export JSON</span></div><p className={s.micro}>In the real app, reconcile only reads state. Wireframe controls choose illustrative layouts.</p></>}
              </section>
              <aside className={s.wireTicket}><Label number="02">Who trades + order ticket</Label><h3>Execution account</h3><div className={s.evidenceLine}><b>Owner</b><span>Margin + positions</span></div><div className={s.evidenceLine}><b>Signer</b><span>Gas + permissions</span></div><p>Clear readiness checks. Discover linked owners before requiring address entry.</p><hr /><h3>Pair ticket</h3><label>Pair<select aria-label="Wireframe pair" value={pairIndex} disabled={active} onChange={e => setPairIndex(Number(e.target.value))}>{PAIR_PRESETS.map((p,i) => <option key={pairLabel(p)} value={i}>{p.long} / {p.short}</option>)}</select></label><label>Total notional<input readOnly value="50 USDso" /></label><label>Slippage<input readOnly value="30 bps" /></label>{active ? <div className={s.reviewNotice}>Selection locked.<br />Current exposure shown separately from original plan.</div> : <button type="button" className={s.darkButton} onClick={() => setStage("review")}>Preview pair →</button>}</aside>
            </div>
            <details className={s.wireJournal}><summary>Execution journal / diagnostic detail</summary><p>Durable intent → broadcast hash → receipt fill → position read-back. Exact raw amounts stay here.</p></details>
          </>}
          {tab === "Activity" && <section className={s.wireSection}><Label number="03">Local history + evidence</Label><h2>Activity</h2><p>Filter: All / Active or unresolved / Closed</p><div className={s.previewBlock}><aside>Pair list<br /><br />{pairLabel(pair)}<br /><br />Recorded status</aside><div><h3>Pair detail</h3><div className={s.evidenceLine}><b>Requested</b><span>Filled</span><span>Recorded open</span></div><p>Readable event timeline, owner/signer identity, explorer links and JSON export.</p><Stub /><Stub /><Stub short /></div></div><p className={s.micro}>Illustrative history layout. Never show fake trading history as real activity.</p></section>}
          {tab === "Setup" && <section className={s.wireSection}><Label number="04">Progressive setup</Label><h2>Get ready to trade.</h2><p>Choose Browser wallet / Local CLI, then explain only that path.</p>{['Connect the signer on Tokyo','Find the app wallet that linked it','Check owner margin + signer gas','Check both selected pool permissions'].map((x,i) => <div className={s.setupStep} key={x}><b>0{i+1}</b><span>{x}</span><span>Action / clear status</span></div>)}<p>Use explicit names: “Owner holds the positions” and “Signer signs and pays gas”.</p></section>}
          <div className={s.wireFooter}>No signing in this prototype <span>Working dashboard: /</span></div>
        </>}

        {screen === "flow" && <section className={s.wireSection}><Label number="01">Complete user journey</Label><h2>From the first visit<br />to a checked outcome.</h2><div className={s.flow}>{[
          ["01", "Landing", "Understand the two-leg problem. Explore an illustration without connecting."],
          ["02", "Setup", "Connect a signer. Find the linked owner. Read gas, margin and permissions."],
          ["03", "Pair ticket", "Choose assets, direction, total notional and slippage."],
          ["04", "Open review", "Check two quantities, limits and expiry. Nothing signed yet."],
          ["05", "Sign sequentially", "First leg → receipt and position → second leg."],
          ["06", "Inspect outcome", "Paired / incomplete / unknown. Never assume success from a sent transaction."],
          ["07", "Reconcile or close", "Unknown: read only. Known exposure: review exact close orders."],
          ["08", "Verify + keep evidence", "Confirm remaining positions. Export receipts and journal; preserve residuals if any."],
        ].map(([n,title,body]) => <div key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div><span aria-hidden="true">↓</span></div>)}</div></section>}
      </main>
      {annotated && <aside className={s.notes}>
        <div><span className={s.index}>DIRECTION</span><h2>Precision, with room to breathe.</h2><p>Dark editorial landing; compact trading workspace. Geist + Geist Mono, the existing blue mark, one primary accent.</p></div>
        <div><span className={s.index}>INFORMATION ORDER</span><p>Landing: purpose → working example → process → evidence → limitations → app.</p><p>Dashboard: ticket first when empty on mobile; execution status first when active.</p></div>
        <div><span className={s.index}>EXECUTION CONTRACT</span><p>Keep all engine checks and journal identity intact. Wireframes never imply atomic execution, automatic recovery, profit or guaranteed closure.</p></div>
        <div><span className={s.index}>OBSERVED REFERENCES</span>{references.map(r => <details key={r.name}><summary>{r.name} <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name} reference`}>↗</a></summary><p><b>Observed:</b> {r.observation}</p><p><b>Adapted:</b> {r.use}</p></details>)}</div>
        <div><span className={s.index}>ROUTES</span><p><Link href="/home">/home — visual landing</Link><br /><Link href="/">/ — working dashboard</Link><br />/wireframes — this design board</p></div>
      </aside>}
    </div>
  </div>;
}
