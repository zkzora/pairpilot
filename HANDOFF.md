# PairPilot — continuation handoff

Updated: 2026-10-22, Asia/Jakarta.

## Agreed direction

The idea remains PairPilot: one ticket for a two-asset long/short perp pair (ETH, BTC, SOL, HYPE; six presets, ETH/BTC default, swappable direction), with fill-aware reconciliation and explicit unwind of incomplete execution. Do not pivot to a generic AI bot, funding bot, liquidation protector or dashboard. The user explicitly reserved visual direction for Claude Design. Keep the present UI neutral until their design arrives.

## Product checkpoint

- **User:** relative-value perp trader already opening long/short pairs.
- **Failure:** one manual order fills while the other fails or fills partially, leaving unwanted exposure and recovery work. The trader bears the loss/slippage.
- **Mechanism:** bounded IOC orders, actual fill/position read-back, durable intents and hashes, no blind retries, explicit close/recovery with residual visibility.
- **Strongest alternatives:** two native manual orders; existing pair-trading products such as Pear; supported atomic batching if available.
- **Potential advantage:** a focused dreamDEX workflow with inspectable execution/recovery. This is a venue-specific hypothesis, not a unique global invention.
- **Validation:** have three active perp traders demonstrate their pair workflow. Compare task completion, actions, execution imbalance and recovery with two manual orders under comparable conditions. No interviews or demand evidence collected yet.
- **Minimal demo:** real testnet pair → reconcile fills → close → read zero positions; separately inject a controlled failure, show unresolved exposure and recover where liquidity permits. Label injected failures and separate-run evidence.

## Existing files

- `src/core/engine.ts`: durable pair state machine; `planner.ts`: bigint sizing/price grids; `types.ts`: stable domain interfaces.
- `src/adapters/dreamdex.ts`: SDK market snapshots, build-only order calldata, wallet signing, receipt decoding and position read-back.
- `src/adapters/simulated.ts`: five fault scenarios; `src/core/journal.ts`: memory/browser journals; `file-journal.ts`: CLI atomic file writes and filesystem locks.
- `app/page.tsx`: neutral client UI, wallet connection, simulation/testnet separation, explicit review/execute/reconcile/close/export.
- `app/api/markets/route.ts`: read-only live market data. **No signing route.**
- `scripts/wallet.ts`, `scripts/trade.ts`: CLI setup, simulate-first voucher claim, check/preview/simulate/open/reconcile/close for own wallet or `--owner=` linked wallet.
- `src/adapters/operator.ts`: owner/signer resolution, `placeOrderFor` encoding, permission checks. `app/ui/account.tsx`: browser Execution panel. `app/ui/close.tsx` + `PairEngine.reviewClose`: close review.
- `evidence/`: real read-only checks and clearly labeled simulator/browser results.

## Verified so far

- SDK pinned to public npm version 0.32.1.
- Actual RPC chain ID 50383; 21 markets; ETH base decimals 18, BTC base decimals 8; both quote decimals 18; system configuration fully wired at the recorded block.
- `/api/markets` returned HTTP 200 using live books and fresh chain state.
- Core scenario tests passed; browser tests passed at 375/768/1280 px; production build and TypeScript check passed. Re-run the documented commands after changes; evidence files record previous runs, not future guarantees.
- Browser tests use injected offline market errors for determinism. This is not a dreamDEX bug.
- 2026-10-22 continuation: re-ran tests (23 passed), typecheck, browser (8 passed via `PAIRPILOT_CHROMIUM` → cached Playwright Chromium 1243), build and doctor (block 29732212). Added an engine guard: `open` refuses to start with under 20 s of preview left, because both legs carry `plan.expiresAt` on-chain and the SDK documents that an already-expired order reverts, which could leave leg 0 filled alone.
- Dedicated local test wallet created: `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50`. Last observed STT=0, margin=0, eligible for the one-time 1,000 paper USDso voucher.

## First live attempt (2026-10-22)

- Wallet funded with 5 STT by Link a Bot. Doctor OK at block 29994852.
- `wallet:claim` sent ONE claim: `0x83401fae8899cfe109e6cc846dd3e158733f353bc9b47a372fd5c77e8e6e6d3f` (block 29995018) **reverted** with unnamed custom error `0x3e31dcc2`, although `getPerpVoucherEligibility` said eligible. All documented conditions read as satisfied. Bytecode shows a set flag (bit 80 of distributor ERC-7201 slot `…a807`) gating `claim()`; its intent is unconfirmed. Draft finding: `feedback/voucher-eligibility-says-eligible-but-claim-reverts.md` (not sent).
- Our bug, fixed: the old claim path lost the hash on revert, wrote no evidence and did not simulate. `src/adapters/voucher.ts` now simulates first, records the hash before the receipt wait, appends every attempt to `evidence/voucher-claims.json` and never re-sends an unknown claim (tests in `voucher.test.ts`). Re-run: simulation reverted, no transaction sent.
- Wallet now: 4.999863314 STT, 0 USDso, nonce 1, flat. No orders were sent. Steps 4–8 (status, preview, open, reconcile, close) remain blocked on margin.
- Explorer format verified: `https://explorer.testnet.somnia.network/tokyo/tx/<hash>`.
- Next funding decision (user): ask organizers why claims are gated or for paper USDso; or bridge USDso from Shannon (public `mint` there per SDK docs) and deposit margin. That route needs Shannon STT (address has 0) and a deposit/bridge step PairPilot does not have yet. Superseded the same day: the app wallet's margin is now traded through linked-wallet operator mode (below).

## Signed operator pair proof (2026-10-22)

- Owner `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5` (smart-account app wallet) identified from 63 registry grant events to signer `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50` (21 pools × 3 selectors, all approved); ETH and BTC pools confirm `isOperatorAuthorized`; swapped roles return false. `evidence/operator-link.json`.
- Preflight: owner 1,000 USDso equity (its own claimed Arena voucher), flat, no orders or stops; both legs placeable (limited by collateral, not `voucherBlocked`). Dry and live simulations of both `placeOrderFor` legs passed.
- Pair `cd37d484-d55b-4783-af0d-858384424f47`: open ETH long 0.0103 @ 2402.88 (`0xce94c5e6…d1aa`), BTC short 0.0003 @ 81969.2 (`0xd1f3431a…27f3`) → `paired`; reconcile `paired`; close ETH @ 2403.02 (`0x755a1052…ba00`), BTC @ 82004.6 (`0x92e1dec7…cbe5`) → `flat`; reconcile `flat`. Final read at block 30110208: owner ETH 0, BTC 0, 0 active pools, 0 orders; signer positions 0. Owner equity 999.990822 USDso; signer paid 0.055 STT gas. All four explorer pages verified. `evidence/operator-pair-proof.json`.
- At the time of the CLI proof, browser signing was unverified. The user subsequently completed two browser pairs; see the browser proof below. Own-wallet signed orders, atomic execution and recovery from a real incomplete fill remain unverified.

## User-performed browser proof (2026-10-22)

- User supplied three JSON exports: ETH/BTC flat (`bda58fa7-368a-4915-af86-62bc1fbad4f6`), SOL/BTC paired and its later flat snapshot (`43dc36bf-185e-4b9b-bda1-8d9cc2655f34`). They represent two pairs and eight unique transactions.
- Browser signer `0xd41C88eE843dcCBe6E8AD3D62e4c33Ccb6C9787b` traded for owner `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5`. Read-only RPC checks verified every receipt succeeded, sender, owner, pool, side, quantity, limit price, IOC and decoded filled quantity. A separate current read returned ETH, BTC and SOL owner positions zero.
- Original exports preserved as `evidence/browser-journal-<id>-<status>.json`; verification: `evidence/browser-exports-verification-1792672013241.json`. No transactions were signed during this verification. JSON labels alone are not trusted as chain evidence.
- This verifies happy-path browser execution on two pairs, not live HYPE trading or recovery from a real incomplete fill.

## Four-asset pairs (2026-10-22)

- Shared configuration `src/core/pairs.ts` (assets, six presets, swap, validation) used by browser, CLI (`--pair=`) and simulator (`simMarkets/simPrices`, fixtures mirror Tokyo metadata; prices labeled fixed). `assertSnapshotPair` and `assertDepth` in `src/core/planner.ts` guard every preview. `/api/markets?long=&short=` serves read-only books for one supported pair.
- Recovery, close review, permissions for an active pair, Activity titles and exports use the journal's own legs. Old ETH/BTC journals need no migration.
- Tests: 84 unit (all 12 directions sized and opened/closed, mixed decimals, minimum refusal, depth/stale guards, journal-market recovery, missing grant on either pool) and 29 browser (preset/swap, preview invalidation, selector lock, reload recovery with a different remembered selection, stale-response drop, linked missing SOL grant).
- HYPE/SOL: read-only preflight and `placeOrderFor` simulation passed for owner 0x436dAE2E…c1F5; NOT live-signed. Walkthrough: `docs/HYPE-SOL-WALKTHROUGH.md`.

## Linked app-wallet discovery (2026-10-22)

- User report: the browser showed 0 USDso although the link existed. Cause: the dashboard defaults to Own wallet, so it showed the browser signer's OWN margin (0), never mentioning the link. Not an adapter bug: Linked mode read 1,000.06 USDso for the same signer.
- Browser signer `0xd41C88eE843dcCBe6E8AD3D62e4c33Ccb6C9787b` (9.92 STT) is linked by owner `0x436dAE2E…c1F5` (63 grants, block 30138483), verified read-only.
- Fix: after connect, `DreamdexVenue.discoverOwners` scans the pool's OperatorPermissionsRegistry grant logs for THIS signer (newest first, 24 h cap, 8 × 1000-block reads in parallel, newer revoke wins; `findLinkedOwners` in `src/adapters/operator.ts`), verifies each candidate with the selected pools' `isOperatorAuthorized`, reads its margin, and offers "Trade this app wallet". Nothing switches without a click. Own wallet with 0 margin explains why. Live: found and verified in 3.3 s. The indexer's `OperatorApproval` has no perp Link a Bot grants, so logs are the source.

## Live verification round (2026-10-22, evening)

- Live-verified: HYPE/SOL CLI pair `6516f259`; injected-fault recovery HYPE/ETH `8ab9e2fb` (`--inject=withhold-second-leg`, CLI open only, labeled); user-signed browser pairs ETH/BTC `bda58fa7` and SOL/BTC `43dc36bf`. All re-checked with `npm run verify -- <journal>` (scripts/verify-pair.ts).
- Demo: `evidence/demo/pairpilot-demo.webm` via `scripts/record-demo.ts` (run against `next start`, not the dev server). When stopping a temporary `next start`, stop by PORT: the process command line has a quote between `next` and `start`.
- Submission: README rewritten for judges; X post drafts in `docs/X-POSTS.md` (not posted); public repository https://github.com/zkzora/pairpilot (main), published with the user's go-ahead.
- Still unverified: own-wallet signed orders (voucher gated), atomic execution, mainnet.

## Not verified / not implemented

1. Signed testnet orders exist only for the CLI operator path above. Own-wallet signing has only the reverted voucher claim; that wallet still has no Perps margin of its own. Do not claim bounty eligibility or successful live trading until receipts and position read-back exist.
2. Live close/recovery uses client-side position checks; there is no contract-enforced reduce-only flag in the ordinary SDK order interface. Treat concurrent account activity as unsupported. Liquidation remains a race even on a dedicated account.
3. Two calls are sequential. The bot-kit 7702 example demonstrates spot batching; perp FOK atomic execution for the same owner is **not verified**. Investigate supported smart-account batching before adding infrastructure; do not change EOA delegation or deploy a contract without a concrete reviewed implementation.
4. Linked app-wallet operator trading is implemented in the CLI (`--owner=` / `PAIRPILOT_OWNER_ADDRESS`; bare `OWNER_ADDRESS` is refused) and in the browser (Execution panel → Linked wallet). Both paths have live evidence, using different linked signers. The browser signer needs its own Link a Bot grant. Walkthrough: `docs/BROWSER-WALKTHROUGH.md`.
5. Reactivity was researched but is not wired into v0. A useful follow-up is fill events with same-block state, after the baseline works live. Do not call ordinary RPC snapshots Reactivity.
6. No spread triggers, finish-the-missing-leg policy, custom ratios, native TP/SL, mainnet, X posts, public repo, deployment or submission has been completed.
7. No validated feedback issues or user interviews yet.

## Immediate next work

1. Preserve `.env.local` and `.pairpilot/`; never print secrets. Fund the existing public address with STT on **50383**, not Shannon 50312. Do not create more voucher accounts. Alternative route: Shannon faucet STT to the same address, then bridge Shannon→Hideki 2 (SDK `docs/BRIDGE.md`; no PairPilot bridge command yet). Keep ≥1 STT on Tokyo for the SDK claim's gas reservation.
2. Run `npm run wallet:status`. Then `npm run wallet:claim` if eligible. Record real receipt.
3. Run `npm run trade -- preview`, then `npm run trade -- open` within 40 seconds (the engine refuses the last 20 s of the 60 s preview). Use 50 USDso total initially. Observe actual fills and transaction hashes.
4. Run `npm run trade -- reconcile`, `npm run trade -- close`, then `npm run trade -- reconcile`. Export/preserve evidence. If any outcome is unknown, reconcile; never re-send blindly. If no hash is recorded, inspect chain nonce/history manually.
5. Fix any live integration failure and add meaningful regression coverage. Never classify our injected faults or our own coding mistakes as sponsor bugs.
6. UX review priorities 1-3 DONE (ticket separates actual exposure from the original plan; phone ticket-first; Setup split into browser/CLI paths with live voucher simulation). Priorities 4 (close review screen) and 5 (plain Activity amounts, raw units only in the journal) remain. Earlier: Claude Design dashboard (`PairPilot Dashboard/PairPilotAppV1.dc.html`) implemented with Trade/Activity/Setup tabs; deviations listed in `docs/DESIGN.md`. Re-check the receipt explorer link format after the first real transaction.
7. DONE: user-performed browser ETH/BTC and SOL/BTC receipts verified and recorded separately. Remaining: live recovery validation, trader validation and submission deliverables. HYPE remains read-only/simulation verified only.

## Local commands

```sh
npm ci
npm test
npm run test:browser
npm run typecheck
npm run build
npm run doctor
npm run demo
npm run dev
```

The dev server was started on http://127.0.0.1:3000 in the originating session; check whether it is still running. CLI signing needs Node 24 and the existing local environment file. Browser tests require Playwright Chromium or `PAIRPILOT_CHROMIUM` pointing at an installed executable.

## Paste into Claude Code / Codex / Antigravity

> Continue PairPilot in this existing repository. Read AGENTS.md, README.md, HANDOFF.md and docs/TESTNET.md first. Preserve the PairPilot product direction and the user's decision to choose visuals in Claude Design. Inspect current files and evidence; do not scaffold another app. Keep private keys local and preserve journals. Start by checking testnet wallet funding and the existing test suite, then complete the live open/reconcile/close proof if funds are available. Clearly separate simulation, real read-only checks and signed transactions. Never blindly retry an unknown transaction. Report the next concrete blocker if funded signing cannot proceed, and continue independent verification and implementation.
