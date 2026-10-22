# PairPilot — Website & Dashboard Specification

Date: October 22, 2026  
Project: `C:\pairpilot`  
Audience: Claude Design, Claude Code, Codex, Antigravity  
Status: design and implementation brief. Proposed screens are not automatically implemented features.

## 1. Product and entry point

**Build a frontend that opens directly into Trade. Defer a separate marketing landing page.**

Trade, Activity, Setup, wallet connection, forms, positions, and receipts are the frontend. The dashboard is the main product interface.

Target user: an experienced perp trader expressing a relative view such as “ETH will outperform BTC.”

Failure: one manually submitted leg fills while the other fails or partially fills. The trader bears unintended exposure, price movement, slippage, and recovery work.

Mechanism: one two-leg plan, bounded IOC orders, recorded actual fills, position read-back, reconciliation of uncertain outcomes, and explicit unwind of remaining exposure.

Strongest alternatives: two native dreamDEX orders, existing pair-trading products such as Pear, or supported atomic batching if verified for the relevant accounts and perps.

Repeat-use hypothesis: traders return to inspect execution, manage the pair, reconcile uncertainty, and close positions. Demand is unvalidated. Ask three active traders to demonstrate their current pair workflow and compare task completion, interaction count, imbalance, and recovery under comparable conditions.

| Website structure | Assessment |
| --- | --- |
| Marketing page → Launch App | Adds a step and a second design surface; defer |
| Statistics/portfolio dashboard | Premature for one active pair; risks decorative metrics |
| Direct trading workspace | Recommended: plan, fills, positions, and recovery in one workflow |

First-time visitors enter **Simulation** without connecting a wallet. Users explicitly select **Testnet** before signing. Returning users reconnect the same account to restore its journal; never open a new trade automatically.

Use one short product explanation and expandable “How it works.” A landing page can follow if acquisition or public education requires it.

## 2. Five references

| Reference | What to study | PairPilot adaptation |
| --- | --- | --- |
| [Pear](https://www.pear.garden/) · [execution docs](https://docs.pear.garden/how-it-works/execution-logic) | Long and short legs presented as one trade | One pair ticket with both legs visible and separate fill states |
| [Hyperliquid](https://app.hyperliquid.xyz/trade) · [trading docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading) | Familiar trading vocabulary and information organization | Clear numeric hierarchy, recognizable order/position terminology |
| [GMX](https://gmx.io/) · [positions/order docs](https://docs.gmx.io/docs/trading/order-types/) | Position management, execution details, close review, history | Comparable leg rows, explicit position actions, review before closing |
| [DeFi Saver](https://defisaver.com/) · [simulation docs](https://help.defisaver.com/features/simulation-mode) | Exploring a product before committing funds | Persistent mode labels, accessible simulation, deliberate switch to testnet |
| [dreamDEX](https://app.testnet.dreamdex.io/) · [perps docs](https://app.testnet.dreamdex.io/docs/trading/perps-testnet) | Venue-specific account, margin, market, funding, USDso/STT terms | Consistent language and accurate integration behavior |

Primary workflow references: **Pear + GMX**. Use the others for supporting decisions, with one coherent visual system.

Reference boundaries:
- Pair trading already exists; differentiation must be demonstrated on dreamDEX.
- Pear documents batching and asynchronous fills. PairPilot v0 executes sequential orders.
- GMX uses oracle-based pricing; do not copy its pricing, fees, or execution guarantees into an order-book product.
- DeFi Saver documents fork-based simulation. PairPilot currently uses fixed prices and local fault scenarios, not a chain fork or prediction of transaction outcomes.
- Hyperliquid’s client-rendered app was not visually audited through the text fetch. Inspect its current UI directly before making visual claims.
- These references were researched through primary documentation on October 22, 2026, not through a complete UI audit.

Final palette, typography, logo, and art direction remain the user’s Claude Design choices.

## 3. Navigation and current implementation

Use three main navigation items:

| Menu | Route | Purpose | Current status |
| --- | --- | --- | --- |
| Trade | `/` | Create, review, open, reconcile, and close the active pair | Functional v0 exists |
| Activity | Activity tab on `/` | Browse local pair journals and receipts | Implemented (tab, not a separate route) |
| Setup | `/setup` | Prepare wallet, network, gas, and margin | Guide exists |

Use top navigation on desktop and accessible tabs on mobile. Three items do not need a large sidebar. Avoid a separate Dashboard menu duplicating Trade.

Secondary links: How it works, official docs, and GitHub once a public repository exists.

Already implemented: simulation/testnet separation, wallet connection, preview, active receipt, reconcile, close, export, and read-only `/api/markets`.

Proposed improvements: per-leg progress UI, review dialog/panel, account-readiness display, Activity, and layout restructuring.

**Funded signed testnet order execution remains unverified at this brief’s creation.** Do not present attractive screens as proof of live trading.

## 4. Trade screen contents

### Global header

- PairPilot name/logo; Trade, Activity, Setup.
- Simulation/Testnet mode selector with persistent text labels.
- Somnia Tokyo / Hideki, chain **50383**.
- Connected account, shortened address, copy address, Connect/Reconnect.
- Compact help access.

Rules: simulation needs no wallet; wrong network blocks signing; mode/account changes load the correct journal. A browser signer is not automatically the owner of a dreamDEX app wallet.

### Product explanation

Headline: **Trade the pair. Track every leg.**

Supporting text:
> Long ETH and short BTC in one plan. See actual fills and manage unfinished execution.

“How it works”: review → execute → reconcile/close. Keep the explanation short and dismissible without hiding core controls.

### Market strip

For ETH and BTC:
- Mark price.
- Best bid/ask when useful for preview.
- Funding rate with the actual calculation window.
- Read timestamp, order-book block, Refresh prices.

States:
- Loading → skeleton.
- Empty book → “No executable liquidity.”
- Unpriceable/stale mark → “Mark unavailable”; block opening.
- RPC failure → error + Retry, never price zero.
- Old data → snapshot age label; do not claim streaming if only snapshots exist.

Do not add 24h change, volume, open interest, or other metrics without a real source and a decision they support.

### Pair ticket

| Field | MVP behavior |
| --- | --- |
| Long | ETH-PERP, fixed |
| Short | BTC-PERP, fixed |
| Allocation | Approximately 50/50 notional after lot rounding |
| Total notional | Combined position value in USDso, not collateral |
| Price tolerance | Integer 1–100 bps; default 30 bps = 0.30% |
| Execution | Price-bounded IOC orders, sequential |
| Recovery | User-triggered unwind; no automatic protection |
| Primary action | Preview pair; does not sign |

Default configured total: 50 USDso. Maximum configured testnet plan: 200 USDso.

Explain notional versus margin. Show margin readiness only after the actual venue checks. Do not expose unsupported leverage sliders, all-market selectors, custom ratios, strategy selectors, or auto-recovery switches.

### Review before signing

Use one consistent inline review panel or focused dialog.

Show:
- Both sides, markets, requested base quantities, approximate notionals, and limit prices.
- Correct per-market decimals, IOC behavior, and readiness checks actually performed.
- Account, network, total notional, rounded allocation, preview countdown.
- Sequential execution: one leg can fill without the other.
- Dedicated-account acknowledgment for testnet.
- Edit/Back and **Sign & open testnet pair**; simulation uses **Execute simulation**.

Quotes last 60 seconds. The engine refuses to start with less than 20 seconds remaining. Show Refresh preview when headroom is insufficient, even before countdown zero. Do not promise both legs finish before expiry.

If expiry occurs after a leg was sent, preserve its actual status. Refreshing a quote must not resubmit that leg.

### Execution and active positions

Make this the primary surface after submission.

Show:
- Pair ID, mode, overall status.
- Each leg’s requested quantity, actual filled quantity, current open quantity, and status.
- Real testnet transaction hashes/explorer links only.
- Last reconciliation time and the next valid action.

Per-leg progression:
1. Not sent.
2. Waiting for wallet.
3. Submitted / awaiting receipt.
4. Confirmed, followed by fill result.
5. Partial fill, no fill, reverted, or outcome unknown when applicable.

Confirmed does not mean filled. **Pair open** requires both planned quantities and verified position read-back.

Use one pair panel with two position rows; v0 allows one active pair per account. Compare each fill with its own requested quantity. Never add ETH and BTC base quantities, or assume changing dollar imbalance always means an execution failure.

Actions:
- **Reconcile:** reads receipts/positions; sends no orders.
- **Close pair:** closes known paired exposure.
- **Close remaining exposure:** attempts to unwind known incomplete execution.
- **Export receipt:** JSON.
- **Execution journal:** expandable technical detail.

Unknown outcomes block further writes. If a send has no recorded hash, explain manual nonce/history inspection; provide no blind retry.

Close/recovery must keep remaining quantities visible. No liquidity or below-minimum dust is unresolved exposure. **Flat** requires both positions read back as zero.

Ordinary SDK perp orders expose no contract-enforced reduce-only flag. v0 closes through client-side checks; external trading, stops, bots, or liquidation can race them. Require a dedicated account and never claim guaranteed non-flipping recovery or offline protection.

## 5. PnL, margin, and charts

These must not block the execution MVP.

| Element | Requirement before adding |
| --- | --- |
| Pair PnL | Reconcile entry, mark, realized PnL, funding, and fees |
| Account equity/margin | Read through SDK; clearly label account-wide scope |
| Liquidation estimate | Explain estimator limitations and cross-margin assumptions |
| Historical ETH/BTC ratio | Real histories with aligned timestamps |
| Equity curve, win rate, APY | Real history and defensible methodology |

A large single-asset candlestick chart is not the core of this two-leg workflow. Start without a dominant chart.

If adding a ratio chart: define ETH price / BTC price and units, distinguish current ratio from history, never fabricate historical points, and do not equate ratio change with dollar-weighted pair PnL.

Equal notional is neither beta neutrality nor a profit/loss guarantee.

## 6. Responsive layout

Desktop starting point: wide workspace (about two-thirds) and narrower ticket (about one-third).

```text
+-----------------------------------------------------------------------+
| PairPilot   Trade   Activity   Setup       Mode / Network / Wallet      |
+-----------------------------------------------------------------------+
| Short explanation OR active issue requiring attention                  |
+-----------------------------------------------------------------------+
| ETH snapshot                  BTC snapshot           Refresh / time    |
+---------------------------------------------+-------------------------+
| Pair workspace                              | Pair ticket             |
| Initial: two-leg explanation + next step    | Long ETH / Short BTC    |
| Preview: quantities + limits                | Total notional          |
| Active: fills + current positions           | Slippage                |
| Recovery: issue + residual + next action    | Preview / Review        |
| Reconcile / Close / Export                  |                         |
+---------------------------------------------+-------------------------+
| Expandable execution journal / receipt details                         |
+-----------------------------------------------------------------------+
```

An unresolved active pair outranks the new-trade form. Disable or replace the opening ticket while the current pair requires action.

Mobile:
- Compact name/mode/wallet header; accessible Trade/Activity/Setup tabs.
- Before trading: ticket → review.
- After submission: issue/status → open quantities → reconcile/close → market data.
- Technical details in disclosures/drawers.
- Sticky actions must not cover residuals or errors.
- Preserve both legs, account, network, and prices in confirmation.

Test at 375, 768, and 1280 px.

## 7. Activity screen

Proposed contents:
- Journals for the selected account and mode.
- All / Active or unresolved / Closed filters.
- Date, pair, mode, status, operation count.
- Detail view: legs, fills, operations, receipt links, timeline, JSON export.

Clearly label **history stored in this browser**, not wallet-wide cross-device history. CLI journals are separate unless an explicit integration is built.

Reuse the same engine and account locks for any recovery action. Do not turn arbitrary imported JSON into executable recovery state without separate schema/identity validation. Skip complex search/sort until volume warrants it.

Empty state:
> No pair activity in this browser yet. Create a simulated pair to explore the workflow.

No fabricated performance metrics or testimonial content.

## 8. Setup screen

Provide two distinct own-account paths: injected browser wallet and local CLI wallet.

Include:
- Correct network, official links, switch-network instructions.
- Account address and copy action.
- Tokyo STT gas and paper USDso Perps margin requirements.
- Available eligibility/claim steps.
- Dedicated-account preparation.
- Official docs and return to Trade.

Only mark checks passed when actually read: network, wallet, gas, margin, positions, resting orders, pending stops. Explain indexer limitations for stop discovery. Otherwise show manual instructions or Not checked.

Link a Bot operator trading is implemented: the browser's Execution panel offers Own wallet or Linked wallet. It is verified live from the CLI only (2026-10-22); present browser operator signing as unverified until a live browser proof exists.

No private-key form. CLI keys stay in ignored local files.

## 9. State/action rules

| State | Primary action | Required constraint |
| --- | --- | --- |
| Simulation, no wallet | Preview simulation | No signing request |
| Testnet, disconnected | Connect wallet | Block opening |
| Wrong network | Switch network | Block signing |
| Insufficient funds | Setup / Refresh | Report actual read/check result |
| Ready preview | Sign & open | Enough expiry headroom |
| Submitted | Wait / Reconcile as appropriate | No repeated submission |
| Unknown | Reconcile | Block writes |
| Pair open | Close pair | Verified fills/positions |
| Partial execution | Close remaining exposure | Do not resend successful legs |
| Failed recovery | Reconcile / newly reviewed close | Preserve residual |
| External position change | Inspect / manual resolution | Do not assume attribution |
| Verified flat | New pair / Export | Both positions read back as zero |
| RPC failure | Retry read | Unknown is never zero |

## 10. UI copy

Use English consistently.

| Location | Copy |
| --- | --- |
| Headline | Trade the pair. Track every leg. |
| Simulation | Simulated prices and fills. No real orders. |
| Testnet | Signs real orders on Somnia Tokyo testnet. |
| Notional hint | Total position value across both legs, not collateral. |
| Preview | Preview pair |
| Signing | Sign & open testnet pair |
| Unknown | A transaction outcome is unknown. Reconcile before sending another order. |
| Partial fill | One or both legs are incomplete. Review the open quantities below. |
| Empty liquidity | No executable liquidity within your price limit. |
| Insufficient headroom | Refresh preview to allow enough time for both orders. |
| Reconcile hint | Reads receipts and positions. Sends no orders. |
| Flat | Both positions were read back as zero. |
| Recovery limit | Closing may partially fill or fail. Remaining exposure stays open. |

Do not claim guaranteed hedging, risk-free trading, atomic execution, offline protection, or an AI profit engine.

## 11. Visual direction

- Direction: focused, utilitarian trading workspace.
- Density: comfortable; structured, comparable numbers.
- Surfaces: a few clearly defined panels.
- Typography: clear, precise, calm; right-aligned tabular numbers.
- Motion: subtle, stable, reduced-motion aware.
- Branding: user selects final palette/fonts in Claude Design.

Use text labels for side/mode/status, one main accent, meaningful semantic colors, visible focus, keyboard access, 44 px targets, and inline recoverable errors that preserve input.

Avoid fullscreen heroes, oversized sidebars, decorative metric cards, nested cards everywhere, mascots/globes/glow, fake metrics, toast-only critical errors, shifting controls, and wallet gating just to explore.

## 12. Delivery priorities

**P0 — complete MVP workflow**
- Direct Trade entry and clear Simulation/Testnet separation.
- Existing exact ETH-long/BTC-short sizing and bounded IOC semantics.
- Review with quantities, prices, expiry/headroom.
- Per-leg results, overall status, actual open positions.
- Reconcile, explicit recovery/close, export, correct Setup.
- Restore across refresh without duplicate sends.
- Clear stale/RPC/unknown/residual states.
- Funded signed open → read-back → close → read-back evidence.

**P1 — after live execution is verified**
- Browser-journal Activity.
- Actual gas/margin/eligibility readouts.
- Clearer receipt detail.
- Validated fee/funding/PnL calculations if time permits.
- Trader comparisons against manual execution.

**P2 — only with a validated need and verified integration**
- Other markets/custom allocations, historical ratio chart.
- Reactivity, supported atomic execution. (Link a Bot operator mode moved into v0; see the implementation table.)
- Finish-the-missing-leg policy, spread triggers, automation.
- Marketing landing page and eventual mainnet support.

Exclude AI chat, copy trading, vaults, tokens, leaderboards, referrals, and social notifications from the MVP.

## 13. Existing-code boundaries

| UI capability | Existing source | Status |
| --- | --- | --- |
| Market snapshots | `app/api/markets/route.ts`, `readSnapshot` | Implemented |
| Ticket/preview | `src/core/planner.ts` | Implemented |
| Open/close/reconcile | `src/core/engine.ts` | Implemented |
| Local simulation | `src/adapters/simulated.ts` | Implemented |
| Browser journal/locks | `src/core/journal.ts` | Implemented |
| Own-wallet signing | `src/adapters/dreamdex.ts` | Implemented; funded execution unverified |
| Linked-wallet operator signing | `src/adapters/operator.ts`, `dreamdex.ts`, `app/ui/account.tsx` | Implemented; CLI live-verified, browser unverified |
| Close review | `PairEngine.reviewClose`, `app/ui/close.tsx` | Implemented |
| Activity | Journal enumeration in the Activity tab | Implemented |
| Account-readiness UI | SDK-backed read model (Setup, Execution panel) | Implemented |
| Historical charts/combined PnL | Additional data/calculations | Proposed |

Reuse planner/engine arithmetic. Do not add a server signing endpoint or expose CLI secrets in the browser bundle.

## 14. Acceptance criteria

- A new user understands both legs and can simulate without a wallet.
- Real snapshots, simulated execution, read-only testnet checks, and signed transactions remain distinct.
- Confirmation shows both legs, account, network, quantities, limits, and sequential execution.
- Confirmation without fills is not Pair open.
- Partial fills show actual quantities and the next action.
- Restart after broadcast uncertainty reconciles without duplicate orders.
- Unknown sends without hashes have no blind retry.
- Failed closes preserve residuals; Flat requires zero-position read-back.
- Activity states its local-history limits.
- Visible controls work; unimplemented features are not presented as active.
- Responsive, keyboard, focus, loading, empty, error, and offline states are tested.
- Product scope and final branding remain under the user’s direction.

## 15. Prompt for Claude Design

> Design PairPilot using this specification and docs/DESIGN.md. Open directly into Trade with Trade, Activity, Setup navigation. Use a wide pair workspace and narrower ticket at comfortable density. Show initial, review, waiting-for-wallet, submitted, paired, partial-fill, unknown, failed-recovery, and verified-flat states. Keep Simulation and Testnet visibly distinct. Preserve sequential execution, actual fill/position read-back, no-blind-retry reconciliation, and explicit unwind. Do not invent charts, PnL, balances, metrics, or implemented capabilities. The user selects final palette and typography. Deliver desktop/mobile designs, component states, and an implementation-ready content hierarchy.

This brief specifies frontend work. It does not itself implement screens, publish the site, execute trades, or establish production readiness.

