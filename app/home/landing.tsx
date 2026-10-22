"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "../ui/logo";
import { PAIR_PRESETS, pairLabel } from "../../src/core/pairs";
import s from "./landing.module.css";

const examples: Record<string, { quantity: string; partial: string }> = {
  ETH: { quantity: "0.0099", partial: "0.0049" }, BTC: { quantity: "0.00029", partial: "0.00014" },
  SOL: { quantity: "0.16", partial: "0.08" }, HYPE: { quantity: "0.62", partial: "0.31" },
};
const proofPairs = [
  { pair: "ETH / BTC", id: "bda58fa7", txs: [
    ["Open ETH", "0x971ad9d010d22bafd7d2f11ecf7411eb49a47453c169706f36c88425f4d6e57a"],
    ["Open BTC", "0x47911ce1c0baf54879c5d6e43ba90ec9c1f88cefed434b9c02e9b7f4f8b25035"],
    ["Close ETH", "0x92e53f5fc050a6b30d9cd9d3b472661a0ca26f9d59d63bcc8caef2903007d233"],
    ["Close BTC", "0x51cc3536be3b663b9fc89313f22ed18c5f6befc1c52acaf04ddcec9187b69b55"],
  ] },
  { pair: "SOL / BTC", id: "43dc36bf", txs: [
    ["Open SOL", "0x41a24218af1ae1261c3314806627c801c80505b0fe561d7ded668447a066361e"],
    ["Open BTC", "0x5fb8759ffb7b9884616f4c403e825dfde9f03414284261a62afe31536641b7f3"],
    ["Close SOL", "0x6270c900b713807cdbd8f8865d19b37376544254069f8eeeff5782a28dd28718"],
    ["Close BTC", "0x153e30aa2a2076420251b56c0ef0b1530c9eba47bbd98b0147593d3a840b661b"],
  ] },
];
type Illustration = "filled" | "partial" | "unknown";
const scenarios: [Illustration, string][] = [["filled", "Both filled"], ["partial", "Partial fill"], ["unknown", "Receipt pending"]];

function Arrow({ diagonal = false }: { diagonal?: boolean }) { return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>; }
function Brand() { return <Link href="/home" className={s.brand} aria-label="PairPilot home"><Logo /><span>PairPilot</span></Link>; }

export default function Landing() {
  const [selection, setSelection] = useState(0);
  const [scenario, setScenario] = useState<Illustration>("filled");
  const pair = PAIR_PRESETS[selection];
  const unknown = scenario === "unknown", partial = scenario === "partial";
  return <div className={s.page}>
    <a href="#main" className={s.skip}>Skip to content</a>
    <header className={s.header}>
      <Brand />
      <nav aria-label="Overview navigation"><a href="#workspace">Workspace</a><a href="#how-it-works">How it works</a><a href="#proof">Testnet proof</a></nav>
      <Link href="/" className={s.launch}>Launch app <Arrow diagonal /></Link>
    </header>

    <main id="main">
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroText}>
          <div className={s.eyebrow}><span className={s.dot} /> PAIR EXECUTION / SOMNIA TOKYO</div>
          <h1 id="hero-title">Two positions.<br /><span>One clear plan.</span></h1>
          <p>Go long and short on dreamDEX. Review both legs, follow actual fills, and see exactly what remains open.</p>
          <div className={s.heroActions}><Link href="/" className={s.primary}>Open PairPilot <Arrow diagonal /></Link><a href="#workspace" className={s.textLink}>Explore the workspace <span aria-hidden="true">↓</span></a></div>
          <div className={s.heroFoot}><span>Testnet</span><span>Paper USDso</span><span>Your wallet signs</span></div>
        </div>
        <figure className={s.heroArt}>
          <Image src="/brand/pairpilot-hero-v1.png" alt="Two separate cobalt and titanium paths forming a paired architectural instrument" fill sizes="(max-width: 760px) 100vw, 52vw" preload />
          <div className={s.artIndex}><span>01 / LONG</span><span>02 / SHORT</span></div>
          <figcaption>Separate legs.<br />A shared execution plan.</figcaption>
          <span className={s.artFine}>PAIRPILOT / STUDY 001</span>
        </figure>
      </section>

      <div className={s.assetBand} aria-label="Supported assets"><span>FOUR ASSETS.<br />SIX PAIR COMBINATIONS.</span><div><b>ETH</b><i>/</i><b>BTC</b><i>/</i><b>SOL</b><i>/</i><b>HYPE</b></div><span>Choose your pair.<br />Reverse your direction.</span></div>

      <section id="workspace" className={s.workspaceSection} aria-labelledby="workspace-title">
        <div className={s.sectionHead}><span className={s.eyebrow}>01 / THE WORKSPACE</span><div><h2 id="workspace-title">Every leg has a story.<br /><span>Keep the whole picture.</span></h2><p>One order can fill while another does not. PairPilot keeps requested, filled, and open quantities in view.</p></div></div>
        <div className={s.demo}>
          <div className={s.demoBar}><div><Logo /><strong>Pair workspace</strong></div><span className={s.illustrationLabel}>INTERACTIVE ILLUSTRATION · NO ORDERS</span></div>
          <div className={s.demoBody}>
            <aside className={s.pairPicker} aria-label="Illustration pair selection"><span className={s.smallLabel}>CHOOSE A PAIR</span>{PAIR_PRESETS.map((p, i) => <button type="button" key={pairLabel(p)} aria-pressed={selection === i} onClick={() => setSelection(i)}><span>{p.long} <span className={s.slash}>/</span> {p.short}</span><Arrow /></button>)}<span className={s.pickerNote}>Approx. equal notional.<br />Sequential IOC orders.</span></aside>
            <div className={s.demoMain}>
              <div className={s.demoTitle}><h3>Long {pair.long} / Short {pair.short}</h3><span className={s.smallLabel}>EXAMPLE / FIXED VALUES</span></div>
              <div className={s.scenarios} aria-label="Illustrated execution outcome">{scenarios.map(([key, label]) => <button type="button" key={key} aria-pressed={scenario === key} onClick={() => setScenario(key)}>{label}</button>)}</div>
              <div className={`${s.outcome} ${scenario !== "filled" ? s.warning : ""}`} role="status"><span className={s.statusDot} /><strong>{unknown ? "Outcome unknown" : partial ? "Incomplete pair" : "Pair open"}</strong><span>{unknown ? "Read the receipt before sending anything else." : partial ? "Review the actual exposure before closing." : "Both legs filled and positions read back."}</span></div>
              <div className={s.legGrid}>{[pair.long, pair.short].map((asset, i) => <div className={s.leg} key={`${i}-${asset}`}>
                <div className={s.legHeading}><span className={i === 0 ? s.long : s.short}>{i === 0 ? "LONG" : "SHORT"}</span><strong>{asset}-PERP</strong><span className={s.fillTag}>{i === 1 && unknown ? "Unknown" : i === 1 && partial ? "Partial" : "Filled"}</span></div>
                <div className={`${s.progress} ${i === 1 && unknown ? s.progressUnknown : i === 1 && partial ? s.progressWarn : ""}`}><span /><span /><span /><span /></div>
                <div className={s.steps}><span>Wallet</span><span>Submitted</span><span>Confirmed</span><span>Filled</span></div>
                <dl><div><dt>Requested</dt><dd>{examples[asset].quantity} <small>{asset}</small></dd></div><div><dt>Filled</dt><dd>{i === 1 && unknown ? "Unknown" : i === 1 && partial ? examples[asset].partial : examples[asset].quantity} <small>{asset}</small></dd></div><div><dt>Open quantity</dt><dd>{i === 1 && unknown ? "Not read" : `${i === 0 ? "+" : "−"}${i === 1 && partial ? examples[asset].partial : examples[asset].quantity}`} <small>{asset}</small></dd></div></dl>
              </div>)}</div>
              <div className={s.demoBottom}><span>{unknown ? "Reconcile reads state. It never resends an order." : "Price-bounded execution. Remaining exposure stays visible."}</span><Link href="/">Open full workspace <Arrow /></Link></div>
            </div>
          </div>
          <div className={s.demoCaption}>Illustrative quantities and outcomes only. Partial fills below a market minimum may require manual action. Use Simulation in the app to exercise the execution engine.</div>
        </div>
      </section>

      <section id="how-it-works" className={s.process} aria-labelledby="process-title">
        <div className={s.processIntro}><span className={s.eyebrow}>02 / FROM INTENT TO OUTCOME</span><h2 id="process-title">A deliberate route<br />through every trade.</h2><p>For traders who already have a relative view between two assets. You choose the idea; PairPilot helps you follow its execution.</p><Link href="/setup">Prepare your wallet <Arrow /></Link></div>
        <ol className={s.processList}>{[
          ["Build the pair", "Pick your long and short assets, total notional, and slippage. Each market keeps its own size and price rules."],
          ["Review before signing", "See both quantities and price limits. A preview sends nothing, and stale previews must be refreshed."],
          ["Follow each leg", "Sign two sequential orders. Actual receipts and positions determine the outcome, including partial or unknown results."],
          ["Reconcile, then close", "Check unresolved results without resending. Review the remaining exposure before signing close orders."],
        ].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div><span className={s.processArrow} aria-hidden="true">↘</span></li>)}</ol>
      </section>

      <section id="proof" className={s.proof} aria-labelledby="proof-title">
        <div className={s.sectionHead}><span className={s.eyebrow}>03 / THE RECEIPTS</span><div><h2 id="proof-title">A trail you can verify.</h2><p>Two user-performed browser cycles on Somnia Tokyo. Eight successful transactions, checked against their exported order plans and fills.</p></div></div>
        <div className={s.proofMeta}><span>RECORDED 22 OCT 2026</span><span>CHAIN 50383</span><span>HISTORICAL TESTNET EVIDENCE</span></div>
        <div className={s.proofRows}>{proofPairs.map(p => <details key={p.id} className={s.proofRow}><summary><span className={s.proofPair}>{p.pair}</span><span className={s.proofId}>{p.id}…</span><span className={s.proofSequence}>Open <Arrow /> Close <Arrow /> Read back</span><span className={s.flat}>Recorded flat</span><span className={s.plus} aria-hidden="true">+</span></summary><div className={s.receipts}>{p.txs.map(([step, hash]) => <a key={hash} href={`https://explorer.testnet.somnia.network/tokyo/tx/${hash}`} target="_blank" rel="noreferrer"><span>{step}</span><span>{hash.slice(0, 10)}…{hash.slice(-6)} <Arrow diagonal /></span></a>)}</div></details>)}</div>
        <div className={s.proofFoot}><span>Recorded outcomes are not a live account balance or a profit claim.</span><a href="/proof/pairpilot-browser-verification.json" download>Download verification JSON <span aria-hidden="true">↓</span></a></div>
      </section>

      <section className={s.faq} aria-labelledby="faq-title"><div><span className={s.eyebrow}>04 / BEFORE YOU START</span><h2 id="faq-title">Know the boundaries.</h2></div><div>{[
        ["Do both orders execute together?", "Orders are sent one after the other. They are not atomic: one can fill while the other fails. PairPilot shows the result of each leg and the exposure that remains."],
        ["Where do the funds stay?", "In your trading account. For a linked wallet, the owner holds margin and positions while an authorized signer pays gas and signs orders. The website has no server signing endpoint."],
        ["What if the result is unknown?", "Use Reconcile to read receipts and positions. PairPilot does not automatically send replacement orders. An interrupted send without a hash requires a manual history check."],
        ["Can every position always be closed?", "A close can fill partly, fail for lack of liquidity, or leave an amount below the market minimum. Remaining exposure stays visible. Close checks run in the client; they are not contract-enforced reduce-only protection."],
        ["Is this live on mainnet?", "PairPilot is a testnet MVP on Somnia Tokyo. Trading uses paper USDso and STT gas. Equal notional allocation does not guarantee a hedge or a profit."],
      ].map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>

      <section className={s.endCta}><span className={s.eyebrow}>YOUR NEXT PAIR STARTS HERE</span><h2>Put both legs<br /><span>in the same view.</span></h2><Link href="/" className={s.primary}>Launch PairPilot <Arrow diagonal /></Link><span className={s.endNote}>Start in Simulation. Connect a wallet when you are ready for testnet.</span></section>
    </main>
    <footer className={s.footer}><Brand /><span>Pair execution on dreamDEX · Somnia Tokyo testnet</span><div><Link href="/setup">Setup</Link><a href="https://app.testnet.dreamdex.io/docs/trading/perps-testnet" target="_blank" rel="noreferrer">dreamDEX docs <Arrow diagonal /></a><a href="#main">Back to top ↑</a></div></footer>
  </div>;
}
