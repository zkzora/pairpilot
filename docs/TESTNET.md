# Testnet runbook

Network: Somnia Tokyo / Hideki, chain **50383**, SDK **0.32.1**. Public RPC: `https://api.hideki2.infra.testnet.somnia.network`; indexer: `https://hideki-dev.smk.somnia.host/v1/graphql`.

## Existing local wallet

Public address: `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50`.

The ignored `.env.local` holds the dedicated test private key. Do not show or commit it. `npm run wallet:init` refuses to replace this file. Last observed: zero STT, zero USDso equity, voucher eligible. These balances can change; use `npm run wallet:status`.

The user has not yet set up a funded account. Obtain STT using the official testnet app's gas/top-up flow or organizer assistance. Confirm the destination network is Tokyo/50383. A second documented route (SDK 0.32.1 `docs/BRIDGE.md`, `docs/reference/networks-and-endpoints.md`): Hideki STT is native-bridged from Shannon (50312) over the dev/test Hyperlane lane `somniatestnet-hideki2testnet`, so Shannon faucet STT sent to this same address can be bridged to 50383. STT that stays on Shannon does not fund Tokyo. PairPilot has no bridge command yet. Hold at least 1 STT on Tokyo: the SDK's voucher claim reserves its default gas ceiling times the fee ceiling (about 0.6 STT) before sending. If gas is being sent by an app wallet, the target is the public address above. Linking a bot grants operator permission for another owner; PairPilot v0 still trades the key's own account, funded with its own one-time voucher.

## End-to-end own-wallet CLI proof

```sh
npm run doctor
npm run wallet:status
npm run wallet:claim
npm run trade -- preview
npm run trade -- open
npm run trade -- reconcile
npm run trade -- close
npm run trade -- reconcile
npm run wallet:status
```

`claim`, `open` and `close` sign transactions. Claim only once if eligible. The preview expires after 60 seconds, and `open` refuses to start in its last 20 seconds because both legs carry that expiry on-chain and an expired order reverts. Run `open` within about 40 seconds; otherwise take a fresh preview. Default total position notional is 50 USDso (roughly 25 per leg); v0 limits configured total to 200. No automatic deposits or leverage changes are performed by trading commands.

Successful opening means BOTH actual signed position sizes match the plan's quantities. A confirmed transaction with zero fills is not a successful pair. Successful closing means chain position read-back returns zero in both markets; a receipt alone is insufficient. Keep the full recorded sequence, including failures.

Signed pair evidence is written to `evidence/testnet-pair-<id>.json`, with the local recovery journal in `.pairpilot/<id>.json`. Preserve the journal across crashes. A nonzero residual or unknown send returns CLI exit code 2. Operational failure returns 1. Simulation hashes must never be put into an explorer link or presented as real.

## Linked app-wallet operator (CLI; the browser uses the same adapter)

Link a Bot (Perps ticked) writes OperatorPermissionsRegistry grants for `placeOrderFor` (0x80054449), `cancelOrderFor` (0xe37b444b) and `reduceOrderFor` (0x364c2587) on each perp pool for one owner. PairPilot follows the official bot kit's `perp-core/src/operator.ts` flow: reads stay on the SDK pointed at the owner, and the signer sends `placeOrderFor(owner, …)` to the pool with explicit IOC (2), expiry and price bound.

1. Get the owner's FULL address. On 2026-10-22 it was read from the registry's grant logs where topic3 is the signer (layout: topic1 pool, topic2 owner, topic3 operator), then confirmed with each pool's `isOperatorAuthorized(owner, signer, selector)`. See `evidence/operator-link.json`. Never shorten or guess it.
2. `npm run trade -- check --owner=<owner>`: owner margin, positions, resting orders and stops; signer gas; permissions on both legs. Read-only.
3. `npm run trade -- preview --owner=<owner>` then `npm run trade -- simulate --owner=<owner>` (eth_call of both legs, nothing signed), then `open` within the preview window.
4. `reconcile`, `close`, `reconcile` with the same `--owner`. Success means both OWNER positions read zero.

Limits: an operator cannot arm stops or change leverage; voucher (Arena) credit only trades on the markets it allows (`getMaxPerpOrderSize` reports `voucherBlocked`); a market listed after linking needs the bot added again. Do not move Arena USDso out of the app wallet.

## Uncertainty and recovery

- **Known hash, no receipt:** `reconcile` reads the receipt; pending/unavailable stays attention. No automatic replacement is sent.
- **No hash after an interrupted signing/broadcast:** stop. Inspect wallet nonce/history on-chain. The program cannot prove no transaction was sent; it must not guess or erase the journal to retry.
- **External position changes:** leave attention visible. Manual trades, other bots, resting orders, stop triggers and liquidation can invalidate local attribution.
- **No close liquidity or below-minimum dust:** show the exact residual. Do not mark flat.
- **Stale CLI lock after a crash:** verify no PairPilot CLI process is running, then remove only the named empty lock directory. Keep journal JSON files. Never clear locks just to force a second active process through.

An ordinary opposite-side IOC is not contract-enforced reduce-only. These client checks do not solve the race with external trading or liquidation. This is a testnet limitation to address before any production use.

## Browser path

Use an injected EVM wallet. In Testnet mode, the Execution panel chooses **Own wallet** (the connected address trades its own margin) or **Linked wallet** (the connected address signs and pays gas for a dreamDEX app wallet that linked it through Link a Bot). For Linked wallet, enter the owner's full address; the panel shows owner margin, positions, orders and stops apart from signer gas, and reads both pools' `isOperatorAuthorized` for THIS signer. A CLI link does not authorize a browser wallet. Preview and every send re-check permissions. Closing first shows a close review of the actual remaining quantities and price bounds. The server does not hold keys or sign transactions. Reconnect the SAME signer after refresh (and re-apply the owner) to find its local journal; a wallet account or network change drops the session. Do not use browser and CLI for the same owner at once; their locks are independent. Step-by-step: [BROWSER-WALKTHROUGH.md](BROWSER-WALKTHROUGH.md). Not yet performed live.

## Atomicity investigation

The official bot kit's `advanced/batch-7702` is a spot round-trip example. Its existence does not establish deployed perp FOK semantics, same-owner atomic execution or application-wallet compatibility. First inspect supported smart-account batch capabilities and simulate a two-pool FOK transaction. Verify all-or-nothing fills and position read-back on Tokyo before claiming atomic execution. Prefer supported account infrastructure over a custom contract when it solves the problem.

## Bounty account rules

Do not transfer extra bounty USDso into a Perps Arena wallet. Keep organizer-provided extra funds in the permitted separate bounty account. A one-time voucher, weekly Arena allocation and additional bounty funds are different funding routes.
