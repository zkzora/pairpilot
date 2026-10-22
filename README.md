# PairPilot

PairPilot opens and manages a long ETH / short BTC perp pair on dreamDEX, Somnia Tokyo/Hideki testnet (chain **50383**).

It is for traders expressing a relative view between two assets. Two manual orders can leave unintended exposure when one leg fails or only partially fills. PairPilot records each transaction intent, measures actual fills, shows residual positions, and provides an explicit unwind action. A timeout is treated as unknown until the receipt and positions are reconciled.

**Status:** functional local v0. On 2026-10-22 the CLI opened, reconciled and closed one real 50 USDso long ETH / short BTC pair on Tokyo testnet as a **linked-wallet operator** (signer `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50` trading for app wallet `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5`), and read both owner positions back as zero ([proof](evidence/operator-pair-proof.json)). Own-wallet signed trading and browser signing are still unverified with real orders. This is not a completed bounty submission.

## Run locally

Use Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. Start in **Simulation** and select a failure scenario. The market panel separately reads actual testnet data; simulation uses labeled fixed prices and simulated fills.

```sh
npm test
npm run test:browser
npm run typecheck
npm run build
npm run doctor
npm run demo
```

Browser tests need Playwright Chromium: `npx playwright install chromium`. An existing browser executable can be selected with the local `PAIRPILOT_CHROMIUM` environment variable. Read-only API checks and signed trading do not run in the unit/browser tests.

## Testnet wallet and orders

The in-app [setup guide](http://127.0.0.1:3000/setup) and [testnet runbook](docs/TESTNET.md) explain the two execution paths.

For the local CLI:

```sh
npm run wallet:init
npm run wallet:status
# Fund the printed address with STT on Tokyo before the next command.
npm run wallet:claim
npm run trade -- preview
npm run trade -- open
npm run trade -- reconcile
npm run trade -- close
```

`init` creates a dedicated private key in ignored `.env.local`; it refuses to replace an existing file. `status` and `preview` are read-only. `claim`, `open` and `close` sign real testnet transactions. Never paste the key into chat, commit it, or put it in a `NEXT_PUBLIC_` variable.

The browser path signs through an injected EVM wallet. The Next.js server provides only the read-only `/api/markets` endpoint and has no signing endpoint. The browser trades the connected wallet's **own account**. The CLI can also trade a dreamDEX app wallet that linked its key through **Link a Bot** (see below). Browser and CLI journals are separate: do not operate both against the same account.

### Linked app wallet (CLI operator mode)

Link a Bot grants the CLI key `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor` on every perp pool for one app wallet. Pass that app wallet's FULL address; PairPilot never guesses or shortens it:

```sh
npm run trade -- check --owner=0x<full app-wallet address>     # read-only: owner margin/positions/orders/stops, signer gas, both pools' permissions
npm run trade -- preview --owner=0x<full app-wallet address>
npm run trade -- simulate --owner=0x<full app-wallet address>  # read-only: the exact pre-send path for both legs
npm run trade -- open --owner=0x<full app-wallet address>
npm run trade -- reconcile --owner=0x<full app-wallet address>
npm run trade -- close --owner=0x<full app-wallet address>
```

`PAIRPILOT_OWNER_ADDRESS` works instead of the flag; bare `OWNER_ADDRESS` is refused. Margin, fills and positions are the owner's; the key signs and pays gas and cannot withdraw. Each order is `placeOrderFor` with explicit IOC, expiry and price bound, re-checked against the pool's `isOperatorAuthorized` before every send. Journals bind owner, signer, chain and mode; another key cannot resume the owner's pair. Stops cannot be armed by an operator, and the owner's voucher credit only trades on markets it allows.

## Implemented behavior

- One long ETH / short BTC ticket, approximately 50/50 notional after lot rounding.
- Exact bigint sizing with each market's base decimals, tick, lot and minimum.
- Explicit price-bounded IOC orders; unused quantity does not intentionally rest.
- Maximum configured testnet order plan of 200 USDso total; no leverage changes.
- Durable intent before signing, transaction hash saved before receipt waiting.
- No automatic retry of an ambiguous broadcast. Reconciliation sends no orders.
- Filled quantities checked against chain positions before continuing.
- Explicit close/unwind; residuals and below-minimum dust remain visible.
- Account locks across browser tabs or local CLI processes, within their own storage domains.
- JSON evidence export, five simulator scenarios and a read-only network doctor.

## Material limits

Orders are **sequential**, not atomic. Incomplete execution can lose value before recovery. A close may partially fill or fail; a slippage bound is not a maximum loss guarantee. Recovery is user-triggered and requires the client to run.

SDK 0.32.1's ordinary `PlacePerpOrderParams` has no reduce-only flag. v0 checks direction and quantity immediately before closing, but this is **client-side**. Another bot, manual trade, stop trigger, liquidation or other position-changing event can race those checks. Use a dedicated account, no concurrent clients and no pre-existing positions/resting orders/stops. Browser/CLI locks do not coordinate with the exchange or each other. Stop discovery depends on the indexer and can lag.

Equal dollar allocation is not beta neutrality or a profitable strategy. Funding, correlation changes, margin and liquidation still matter. Funding is displayed per the market's actual calculation window. Books are pinned to one block; the separate mark/funding read is not claimed to be the same snapshot. No Reactivity subscription, atomic batch, linked-bot operator mode, automated signals, native TP/SL, spread triggers or mainnet support is claimed.

An interrupted send without a transaction hash cannot be safely retried from this journal. Inspect the wallet nonce/history manually. Browser journals live in local storage; clearing that storage removes local recovery context. CLI journals live in ignored `.pairpilot/` and must be preserved across restarts.

## Evidence

- [Live read-only doctor](evidence/testnet-doctor.json): chain ID, block, 21 markets, ETH/BTC decimals, live mark and system wiring. Zero signed transactions.
- [Simulation traces](evidence/simulation.json): labeled local fills, recovery and unresolved-exposure cases. Hashes here are synthetic.
- [Browser test report](evidence/browser-tests.json): UI workflow checks, including refresh/restart, mode separation and 375/768/1280 px layouts. The browser suite deliberately injects an offline market-read error; its screenshots are not sponsor bug evidence.
- [Operator pair proof](evidence/operator-pair-proof.json): four signed `placeOrderFor` transactions (open ETH/BTC, close ETH/BTC), receipts, fill prices, explorer checks and the final zero owner positions. Journal: [testnet-pair-cd37d484-d55b-4783-af0d-858384424f47.json](evidence/testnet-pair-cd37d484-d55b-4783-af0d-858384424f47.json). Owner identification: [operator-link.json](evidence/operator-link.json); preflight and simulation: `evidence/operator-preflight.json`, `evidence/operator-simulation-*.json`.
- [Voucher claim attempts](evidence/voucher-claims.json): one reverted own-wallet claim (`0x3e31dcc2`) and one simulation that sent nothing.

## X posts

Required before submission: add links to **2–3 published posts** tagging **@DreamDEXSomnia**. No posts have been published or links invented. Use the [communication notes](docs/SUBMISSION.md) once the corresponding behavior is verified.

## Continue building

Read [HANDOFF.md](HANDOFF.md) in Claude Code, Codex or Antigravity. The user will choose the final visual design in Claude Design; [design constraints](docs/DESIGN.md) preserve execution semantics while changing the UI.

Official references and access limitations are in [docs/SOURCES.md](docs/SOURCES.md). Report real, reproducible non-security integration findings individually in `feedback/`. Send security findings privately under the organizer's disclosure instructions; do not commit them.
