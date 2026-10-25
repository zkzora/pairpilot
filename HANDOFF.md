# PairPilot — continuation handoff

Updated: 2026-10-23, Asia/Jakarta. Public repo: https://github.com/zkzora/pairpilot (branch `main`).

## Direction

**Positioning:** PairPilot helps traders understand and resolve long/short pairs whose execution did not finish as planned. One ticket for a two-asset perp pair on dreamDEX (ETH, BTC, SOL, HYPE; six presets, swappable direction), with fill read-back and a reviewed unwind of whatever is left open.

**Strongest alternative:** two manual orders in the dreamDEX app. If traders find that just as easy, a good dashboard and many tests are not an advantage. Other alternatives: pair products such as Pear; atomic batching if it becomes supported.

**Current priorities (user, 2026-10-22):**
1. One-leg failure and recovery are the main story of the landing page, demo and posts. (Done for the landing page and the demo; keep it that way.)
2. Test with 3 traders, PairPilot vs two manual orders: `docs/USER-TESTS.md`. **Not run yet. No user evidence exists.**
3. A clear next step in every state: unknown outcome, incomplete pair, residual below minimum. A "Next step" line now appears per state; refine it from the trader tests.
4. Keep docs and evidence in sync with each other.

**Active pair workspace (2026-10-23, local, not pushed):** Plan → Execute → Monitor → Recover/Close → Review. `src/core/monitor.ts` (pure bigint: `monitorPair`, `summarizePair`), reads in `src/adapters/dreamdex.ts` (`readPairMarks`, `readPairHistory`), `simMarks` in the simulator, UI in `app/ui/monitor.tsx`, bounded non-overlapping reads in `app/ui/read-gate.ts`. Fill value (Σ quantity × fill price) is now stored on each order; older journals are re-read from receipts. `npm run summary` writes `evidence/pair-summaries.json`. Funding comes from FundingSettled events in the pair's own receipts; `checkExclusive` asks the indexer whether each market was the pair's alone (pair's own transactions listed, nothing else, zero to zero), and net is "pair", "conditional" or not given. `ReadGate` keeps its lock until a timed-out read actually settles, so refreshes never stack requests. No signed trades were made for this work.

**Do not add:** more pairs, AI agents, MCP, Reactivity or more menus without a reason from user testing. The user reserves visual direction.

## Verified state

| What | Evidence |
| --- | --- |
| Live linked-wallet pairs on Somnia Tokyo (50383): ETH/BTC CLI, ETH/BTC browser, SOL/BTC browser, HYPE/SOL CLI. Each opened paired, closed, owner read back flat | `evidence/cli-operator-proof-cd37d484-…`, `browser-operator-proof-bda58fa7-…`, `browser-operator-proof-43dc36bf-…`, `hype-sol-operator-proof-6516f259-…` |
| Live recovery: HYPE/ETH, second leg deliberately withheld (`--inject=withhold-second-leg`, labeled) → incomplete → reconcile (no orders) → close review unwound HYPE → flat | `evidence/recovery-injected-hype-eth-proof-8ab9e2fb-…` |
| Every live run re-checked read-only by `npm run verify -- <journal>`: receipt success, signer, `placeOrderFor` owner, fills = journal, fills inside bound, explorer page, final positions | `scripts/verify-pair.ts` |
| Owner identified from registry grant logs, never guessed | `evidence/operator-link.json` |
| Per-pair results for all 5 live pairs (realized price PnL, fees, funding, net), each market indexer-verified as the pair's alone; realized PnL equals the indexer's MarginBank figure for every close | `evidence/pair-summaries.json` |
| Tests: 116 unit, 41 browser (mock wallets, injected offline reads), typecheck, build | `npm test`, `npm run test:browser` |

Accounts: owner/app wallet `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5`; CLI signer `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50` (key in ignored `.env.local`); browser signer `0xd41C88eE843dcCBe6E8AD3D62e4c33Ccb6C9787b` (user's wallet extension).

What the recovery proof shows: recovery from ONE scenario (a withheld second leg with liquidity available to close). It does not show that every market failure can be resolved: thin books, partial closes and liquidation races remain.

## Not verified / not built

1. Own-wallet signed orders: the one-time voucher `claim()` reverts on-chain (`0x3e31dcc2`, a gating flag the SDK eligibility check does not read). `evidence/voucher-claims.json`; draft finding `feedback/voucher-eligibility-says-eligible-but-claim-reverts.md` (not sent).
2. Atomic execution: legs are sequential. Perp FOK batching for one owner is unverified; do not change EOA delegation or deploy contracts without a reviewed design.
3. Reduce-only is a client-side check (SDK 0.32.1 has no flag). Liquidation and outside trades can race it.
4. Trader validation, X posts and submission: not done. Hosted demo is live (2026-10-25): https://pairpilot-delta.vercel.app, Vercel project `zkzoras-projects/pairpilot`, connected to GitHub `zkzora/pairpilot`: every push to `main` builds and promotes production (Node 24.x). Git builds contain only committed files. A manual `vercel deploy --prod` uploads the local folder instead; `.vercelignore` keeps `.env*` and `.pairpilot/` out of that upload, because the CLI does not read `.gitignore`. X drafts in `docs/X-POSTS.md`; checklist in `docs/SUBMISSION.md`.
5. Mainnet, stops/TP-SL, leverage changes, finish-the-missing-leg automation: not built, by design for now.
6. The testnet monitor in the browser has only been exercised against the live chain through `npm run summary` and the read functions; the browser UI was checked in Simulation (tests and screenshots). No live pair was open while it was built.

## Key files

- `src/core/`: `engine.ts` (pair state machine, `reviewClose`/`close`), `planner.ts` (bigint sizing, snapshot/depth guards), `pairs.ts` (assets, presets), journals.
- `src/adapters/`: `dreamdex.ts` (SDK reads, signing, receipts, owner/signer split, owner discovery), `operator.ts` (`placeOrderFor`, permissions, `findLinkedOwners`), `simulated.ts`, `voucher.ts`.
- `app/`: dashboard `/` (`page.tsx`, `ui/*`), overview `/home`, design board `/wireframes`, guide `/setup`, read-only `/api/markets`. No signing endpoint.
- `scripts/`: `trade.ts`, `wallet.ts`, `verify-pair.ts`, `summarize-pair.ts`, `record-demo.ts`, `doctor.ts`.
- `evidence/`: proofs, preflights, simulations, demo. `docs/`: runbooks (`TESTNET.md`, `BROWSER-WALKTHROUGH.md`, `HYPE-SOL-WALKTHROUGH.md`), `USER-TESTS.md`, `X-POSTS.md`, `SUBMISSION.md`.

## Rules that must hold

Bigint sizing; bounded IOC; durable intent before signing and hash before waiting; unknown outcomes block new writes; reconcile sends nothing; no blind retries; residuals never reported flat; journals bound to owner, signer, chain and mode; recovery uses the journal's own markets. Never print keys or replace `.env.local`; preserve `.pairpilot/`. Label simulations and injected faults. No mainnet, posts or messages to organizers without the user's go-ahead.

## Practical notes

- Commands: `npm ci`, `npm run dev`, `npm test`, `npm run test:browser` (set `PAIRPILOT_CHROMIUM` to an installed Chromium if Playwright's is missing), `npm run typecheck`, `npm run build`, `npm run doctor`, `npm run verify -- <journal>`.
- CLI: `npm run trade -- check|preview|simulate|open|reconcile|close --owner=0x<app wallet> --pair=LONG/SHORT`. `open` must run within about 40 s of `preview`.
- Demo: `npx tsx scripts/record-demo.ts` against `next start` (not the dev server) with `PAIRPILOT_URL`. Stop a temporary `next start` by its port; its command line has a quote between `next` and `start`, so name matching misses it.
- Shell heredocs on this machine have collapsed `\\` and turned `\b` into a backspace. Write scripts with the editor, then run them; scan for control characters if in doubt.

## Paste into Claude Code / Codex / Antigravity

> Continue PairPilot in this repository. Read AGENTS.md, README.md, HANDOFF.md and docs/TESTNET.md first. The product and its positioning are fixed: understand and resolve long/short pairs whose execution did not finish as planned. Work only on the current priorities in HANDOFF: recovery as the main story, the 3-trader comparison in docs/USER-TESTS.md (record only real sessions), clear next steps per state, and docs/evidence consistency. Keep keys local, preserve journals, label simulations and injected faults, never retry an unknown transaction, and do not add features without a reason from user testing.
