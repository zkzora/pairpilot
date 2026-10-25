# PairPilot

**PairPilot helps traders understand and resolve long/short pairs whose execution did not finish as planned.** One ticket for a two-leg perp trade on dreamDEX, Somnia Tokyo testnet (chain 50383): long one asset, short another (ETH, BTC, SOL, HYPE). When only one leg fills, PairPilot shows what actually filled and what is still open, says what to do next, and unwinds the rest through a reviewed close. The headline proof is a live recovery: run 5 below.

**Live demo: https://pairpilot-delta.vercel.app** — no setup. Simulation runs in the browser with no wallet (pick "First close finds no liquidity" to see a failed recovery, then a reviewed close to flat). Testnet reads live Somnia Tokyo books and signs only with your own wallet.

**Demo video (49 s):** [evidence/demo/pairpilot-demo.webm](evidence/demo/pairpilot-demo.webm). Part 1 is labeled SIMULATION: a HYPE/SOL pair whose second signature is rejected, then the close review and recovery to flat. Part 2 is TESTNET, read-only: live HYPE/SOL books and setup. Live signed trades are listed below with explorer links.

## The problem

A relative-value trader opens a long/short pair as two separate orders. If one fills and the other fails, partially fills or times out, the trader is left with unhedged exposure, an unclear state and manual recovery work. Retrying blindly can double a position.

## What PairPilot does

1. **Plan the pair.** About 50/50 notional, sized in exact integers from each market's decimals, tick, lot and minimum. Pools and metadata are discovered from the dreamDEX SDK at runtime. Default total 50 USDso, cap 200.
2. **Check before signing.** Fresh books for the selected pair; stale or mismatched reads, and depth too thin inside the price bound, are refused. Margin, existing positions, orders and stops are checked; for a linked app wallet, both pools' operator permissions too. Both orders are simulated.
3. **Send two bounded IOC orders, one after another.** The intent is saved before signing and the hash before waiting. Unfilled quantity is cancelled by the venue, never resent.
4. **Read back what happened.** Fills are decoded from receipts and checked against on-chain positions. An unknown outcome blocks new orders until reconciled; reconcile sends nothing.
5. **Monitor the open pair.** While a pair is open, the Trade view re-reads the owner's position, mark, average entry, marked value, price-only unrealized PnL and funding owed for the journal's own two markets, every 15 s and one read at a time. A position that differs from what the pair recorded is flagged and not counted as the pair's PnL.
6. **Recover explicitly.** Each state gets one plain next step. The close review shows each leg's actual open quantity and price bound before anything is signed. A residual below the market minimum stays visible; nothing is reported flat until positions read zero.
7. **Review the closed pair.** Planned versus filled quantities, average fill prices from receipts, realized price PnL, fees and funding settled in the pair's own receipts, and the final zero read-back. Funding and net say whose they are: pair-exclusive only when the indexer shows each market was the pair's alone from open to close, otherwise conditional, or not given when other activity shared a market. Any figure that cannot be read shows as unavailable, never as 0.

It runs in two ways, both against the same engine: a **browser dashboard** (keys stay in your wallet extension; the server has no signing endpoint) and a **local CLI**. Either one trades its own account or a dreamDEX app wallet that linked it through **Link a Bot** (operator `placeOrderFor`).

## Live testnet proof (Somnia Tokyo, chain 50383, 2026-10-22)

Every row below was independently re-verified from chain data: receipt success, sender = signer, `placeOrderFor` owner = app wallet, decoded fills = journal fills, fills inside the price bound, explorer page present, and the owner's positions read back as zero.

| # | Path | Pair | What happened | Proof |
|---|---|---|---|---|
| 1 | CLI, linked app wallet | ETH/BTC | Opened paired (0.0103 ETH / 0.0003 BTC), reconciled, closed, flat | [cli-operator-proof-cd37d484.json](evidence/cli-operator-proof-cd37d484-d55b-4783-af0d-858384424f47.json) |
| 2 | Browser, user-signed, linked | ETH/BTC | Opened paired (0.0207 ETH / 0.00061 BTC), closed, flat | [browser-operator-proof-bda58fa7.json](evidence/browser-operator-proof-bda58fa7-368a-4915-af86-62bc1fbad4f6.json) |
| 3 | Browser, user-signed, linked | SOL/BTC | Opened paired (0.23 SOL / 0.0003 BTC), closed, flat | [browser-operator-proof-43dc36bf.json](evidence/browser-operator-proof-43dc36bf-185e-4b9b-bda1-8d9cc2655f34.json) |
| 4 | CLI, linked app wallet | HYPE/SOL | Opened paired (0.31 HYPE / 0.23 SOL), reconciled, closed, flat | [hype-sol-operator-proof.json](evidence/hype-sol-operator-proof-6516f259-4cfb-4945-b25b-e7d0af214ddd.json) |
| 5 | CLI, linked, **injected fault** | HYPE/ETH | HYPE long filled; ETH short deliberately withheld (`--inject=withhold-second-leg`, labeled in the journal) → **incomplete** → reconcile (no orders) → close review unwound HYPE only → flat | [recovery-injected-hype-eth-proof.json](evidence/recovery-injected-hype-eth-proof-8ab9e2fb-8185-4d1c-9bfe-59081193117a.json) |

Transactions (explorer `https://explorer.testnet.somnia.network/tokyo/tx/…`):

1. ETH/BTC CLI: [open ETH](https://explorer.testnet.somnia.network/tokyo/tx/0xce94c5e657a7e9dc349fbef716eaf8de523c79f35a7a5cdfa4d5511577a5d1aa) · [open BTC](https://explorer.testnet.somnia.network/tokyo/tx/0xd1f3431acc76b411e56fc7900ca3cf81bfe2316f2e281620b0f8212db21427f3) · [close ETH](https://explorer.testnet.somnia.network/tokyo/tx/0x755a1052afdf3593a34aad3fc8f4ad245f33ebdb24a003ff70e180f10a18ba00) · [close BTC](https://explorer.testnet.somnia.network/tokyo/tx/0x92e1dec77c75f0224f466880ec2ed72e785f3dc3f31510d69a1d29566122cbe5)
2. ETH/BTC browser: [open ETH](https://explorer.testnet.somnia.network/tokyo/tx/0x971ad9d010d22bafd7d2f11ecf7411eb49a47453c169706f36c88425f4d6e57a) · [open BTC](https://explorer.testnet.somnia.network/tokyo/tx/0x47911ce1c0baf54879c5d6e43ba90ec9c1f88cefed434b9c02e9b7f4f8b25035) · [close ETH](https://explorer.testnet.somnia.network/tokyo/tx/0x92e53f5fc050a6b30d9cd9d3b472661a0ca26f9d59d63bcc8caef2903007d233) · [close BTC](https://explorer.testnet.somnia.network/tokyo/tx/0x51cc3536be3b663b9fc89313f22ed18c5f6befc1c52acaf04ddcec9187b69b55)
3. SOL/BTC browser: [open SOL](https://explorer.testnet.somnia.network/tokyo/tx/0x41a24218af1ae1261c3314806627c801c80505b0fe561d7ded668447a066361e) · [open BTC](https://explorer.testnet.somnia.network/tokyo/tx/0x5fb8759ffb7b9884616f4c403e825dfde9f03414284261a62afe31536641b7f3) · [close SOL](https://explorer.testnet.somnia.network/tokyo/tx/0x6270c900b713807cdbd8f8865d19b37376544254069f8eeeff5782a28dd28718) · [close BTC](https://explorer.testnet.somnia.network/tokyo/tx/0x153e30aa2a2076420251b56c0ef0b1530c9eba47bbd98b0147593d3a840b661b)
4. HYPE/SOL CLI: [open HYPE](https://explorer.testnet.somnia.network/tokyo/tx/0x583241ba1854187b00608aefe9158479b9d3c5d8d3f995015f84ea7e8437705f) · [open SOL](https://explorer.testnet.somnia.network/tokyo/tx/0x4c6b8ee5ff57aa7325e1b1ae6120137d52aabe000beb76cf7ce0c2f6bda9cb0d) · [close HYPE](https://explorer.testnet.somnia.network/tokyo/tx/0x2609cc08e4222fa10e93e846a6d446704409a124be98cba345671e488c8f65e2) · [close SOL](https://explorer.testnet.somnia.network/tokyo/tx/0xbee0842860e478eae7e4ff09adc7e435d9eb79230eb3748ec09e01cb38da27f1)
5. HYPE/ETH recovery: [open HYPE](https://explorer.testnet.somnia.network/tokyo/tx/0xa39db5665305f38b0b16fc7f5419aa94de1d9d7f84f3ac3cac3a1699e0e68e6e) · ETH short not broadcast (injected) · [close HYPE](https://explorer.testnet.somnia.network/tokyo/tx/0x4532aeec1c17a3c2cd65b722794edc5ee7f61c86ffcb4121b0c83a00692b857b)

### What each live pair made or lost

Read-only, from the pairs' own receipts and the dreamDEX indexer: [evidence/pair-summaries.json](evidence/pair-summaries.json) (`npm run summary -- <journal>`). USDso; funding paid is positive, received is negative. Net = realized − fees − funding paid. This is each pair's result, not the account's equity change.

| # | Pair | Realized price PnL | Fees | Funding paid | Funding attribution | Net |
|---|---|---:|---:|---:|---|---:|
| 1 | ETH/BTC CLI | −0.009178 | 0 | 0 | pair-exclusive | −0.009178 |
| 2 | ETH/BTC browser | +0.056405 | 0 | −0.007416 | pair-exclusive | +0.063821 |
| 3 | SOL/BTC browser | +0.005972 | 0 | 0 | pair-exclusive | +0.005972 |
| 4 | HYPE/SOL CLI | −0.0194 | 0 | 0 | pair-exclusive | −0.0194 |
| 5 | HYPE/ETH recovery | +0.0144 | 0 | 0 | pair-exclusive (ETH: no position) | +0.0144 |

- **Realized PnL:** for every close, the figure from receipt fills equals the indexer's own MarginBank figure (`crossCheck` in the file).
- **Fees and funding** are MarginBank events in the pairs' own receipts. Fees are 0 because no receipt holds a fee or rebate event. Funding settles when the owner's position changes, so pair 2's two close receipts hold its only settlements; the other pairs' receipts hold none.
- **"Pair-exclusive"** means the indexer lists only the pair's own transactions as the owner's position changes in that market between open and close, starting and ending at zero, and no funding settlement in other transactions. An indexer that has not yet listed the pair's own transactions counts as unverified, never as a verified zero.

Accounts: app wallet (owner, margin and positions) `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5`; CLI signer `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50`; browser signer `0xd41C88eE843dcCBe6E8AD3D62e4c33Ccb6C9787b`. How the owner was identified without guessing: [operator-link.json](evidence/operator-link.json). Re-verify any journal yourself: `npm run verify -- <journal.json>` (read-only).

## Run it

Node.js 24+ and npm.

```sh
npm ci
npm run dev          # http://127.0.0.1:3000  (dashboard)   /home (overview)   /setup (guide)
```

Start in **Simulation**: pick a pair, a failure scenario, preview and execute. Prices and fills there are fixed and labeled. **Testnet** reads live books and signs with your wallet; see [docs/BROWSER-WALKTHROUGH.md](docs/BROWSER-WALKTHROUGH.md). After you connect, PairPilot looks up which app wallets linked your wallet and offers to trade one.

CLI (signs with a local key in ignored `.env.local`):

```sh
npm run wallet:init && npm run wallet:status          # create a dedicated key, then fund it with Tokyo STT
npm run trade -- check   --owner=0x<app wallet> --pair=HYPE/SOL   # read-only readiness
npm run trade -- preview --owner=0x<app wallet> --pair=HYPE/SOL
npm run trade -- simulate --owner=0x<app wallet>      # eth_call of both legs; nothing signed
npm run trade -- open     --owner=0x<app wallet>      # within 40 s of preview; signs two orders
npm run trade -- reconcile --owner=0x<app wallet>     # sends nothing
npm run trade -- close    --owner=0x<app wallet>      # unwinds the JOURNAL's markets
```

Omit `--owner` to trade the key's own account. `npm run summary -- <journal.json>` prints a closed-pair summary from receipts and the indexer (read-only, no key). Runbooks: [docs/TESTNET.md](docs/TESTNET.md), [docs/HYPE-SOL-WALKTHROUGH.md](docs/HYPE-SOL-WALKTHROUGH.md).

Checks: `npm test` (116 unit tests), `npm run test:browser` (41 Playwright tests at 375/768/1280 px, using mock wallets and injected offline reads, never real keys), `npm run typecheck`, `npm run build`, `npm run doctor` (read-only network check).

## Limits, stated plainly

- **Not atomic.** The two orders are sequential. One can fill without the other; PairPilot makes that visible and recoverable, it does not prevent it. Price moves before recovery can cost money; a slippage bound is not a loss limit.
- **Reduce-only is client-side.** dreamDEX SDK 0.32.1 ordinary orders have no reduce-only flag. PairPilot re-reads the position right before each close, but another bot, manual trade or liquidation on the same account can race it. Use an account dedicated to PairPilot.
- **Dust can remain.** A leg left below the market minimum cannot be closed by any order; it stays visible as residual exposure.
- **Equal notional is not a hedge guarantee.** It is not beta-neutral; funding, correlation and liquidation still apply.
- **Monitor figures are estimates.** Unrealized PnL is (mark − the owner's average entry) × size, before fees and funding; a close fills at book prices. Entry and funding are per owner and market, so they are attributed to the pair only while the owner's position equals the pair's record, and funding owed on an open pair is always labeled conditional. In the summary, funding is pair-exclusive only after the indexer check above; if the indexer lags or cannot be read, net is labeled conditional, and if another trade shared a market, no net is given for it. In the browser, testnet monitoring needs the wallet connected; simulation marks are fixed and fees and funding are not simulated.
- **Testnet only.** No mainnet, no stops or leverage changes, no automation. Own-wallet signed orders are implemented but not live-proven: the one-time voucher claim reverts on-chain for that key (see [feedback draft](feedback/voucher-eligibility-says-eligible-but-claim-reverts.md)), so all live proofs use a linked app wallet.
- Journals are local: browser journals in local storage, CLI journals in ignored `.pairpilot/`. A send interrupted before its hash is saved needs a manual nonce check; PairPilot never guesses or retries.

## Evidence index

Live proofs are listed above. Supporting material:

- [Status ledger](evidence/STATUS.md): what was verified, how, and what was not.
- [Read-only doctor](evidence/testnet-doctor.json): chain 50383, 21 markets, metadata for ETH, BTC, SOL, HYPE.
- Preflights and transaction simulations before each live run: `evidence/operator-preflight-*.json`, `evidence/operator-simulation-*.json`.
- [Voucher claim attempts](evidence/voucher-claims.json): one reverted claim (`0x3e31dcc2`) and one simulation that sent nothing.
- [Simulation traces](evidence/simulation.json) and [browser test report](evidence/browser-tests.json): local and labeled, with synthetic hashes.

## Repository map

`src/core/` engine, planner, pairs, journals · `src/adapters/` dreamDEX venue, operator (`placeOrderFor`, permissions, owner discovery), simulator, voucher · `app/` dashboard, overview, setup · `scripts/` CLI, verifier, demo recorder · `tests/` Playwright · `evidence/` proofs · `docs/` runbooks and design notes · `feedback/` integration findings (drafts, not submitted).

Sources and their limits: [docs/SOURCES.md](docs/SOURCES.md).
