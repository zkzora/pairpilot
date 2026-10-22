# Live HYPE/SOL walkthrough (open → reconcile → close)

**Status: performed live on 2026-10-22 from the CLI** (pair `6516f259`): opened paired, reconciled, closed, owner HYPE and SOL read back zero; all four transactions re-verified (`evidence/hype-sol-operator-proof-6516f259-4cfb-4945-b25b-e7d0af214ddd.json`). The steps below repeat it; the browser path B has not been run for HYPE/SOL.

Pair: **long HYPE / short SOL**, 50 USDso total (about 25 per leg), slippage 30 bps, IOC orders, cap 200 USDso. The same steps work reversed (`--pair=SOL/HYPE`).

## Read-only preflight before the first live run (2026-10-22)

| Check | Result |
| --- | --- |
| Markets | HYPE pool `0x63b47ed4…297a` (6 base decimals, lot 0.01, min 0.12 HYPE ≈ 9.4 USD); SOL pool `0xb483ec1f…fa53` (9 decimals, lot 0.01, min 0.1 SOL ≈ 10.4 USD). Same MarginBank, quote 18 decimals. |
| Books | Both priceable; about 89k USD HYPE asks and 258k USD SOL bids within 20 levels. |
| Owner `0x436dAE2E…c1F5` | 1,000.06 USDso equity, 0 active pools, 0 resting orders, 0 stops. |
| Signer `0x39f4…AC50` (CLI) | `placeOrderFor`, `cancelOrderFor`, `reduceOrderFor` granted on both HYPE and SOL; 4.94 STT gas. |
| Preview `dd432065…` (expired) | HYPE long 0.31 @ ≤ 78.53 (≈ 24.34 USDso); SOL short 0.23 @ ≥ 104.22 (≈ 23.97 USDso). |
| Simulation | Both `placeOrderFor` legs `eth_call` OK from the signer for the owner. 0 signed transactions. |

Prices move. Every number above must be re-read; nothing is sent from a stale preview.

## Path A: CLI (linked app wallet)

Run from `C:\pairpilot`. Each `open` and `close` signs real testnet transactions with the CLI key; everything else is read-only.

```sh
O=--owner=0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5
npm run trade -- check    $O --pair=HYPE/SOL   # owner flat, both pools "placeOrderFor": true
npm run trade -- preview  $O --pair=HYPE/SOL   # fresh books, depth, margin; nothing signed
npm run trade -- simulate $O                   # both legs eth_call; uses the saved preview's markets
npm run trade -- open     $O                   # within 40 s of preview; two placeOrderFor sends
npm run trade -- reconcile $O                  # reads receipts and positions; sends nothing
npm run trade -- close    $O                   # reviewed IOC closes from the JOURNAL's HYPE/SOL markets
npm run trade -- reconcile $O                  # must report flat
```

`simulate`, `open`, `reconcile` and `close` always act on the active journal's markets; a different `--pair` on those commands is reported and ignored.

## Path B: browser (your own linked signer)

Follow `docs/BROWSER-WALKTHROUGH.md` up to a ready Execution panel, then:

1. In the Pair ticket choose **HYPE / SOL** (Swap direction gives SOL/HYPE).
2. Wait for the strip to show HYPE-PERP and SOL-PERP marks; the Execution panel must show **Can place** for both.
3. **Preview pair**, read both legs, tick the dedicated-account box, **Sign & open testnet pair**, approve two signatures.
4. **Reconcile** (no signature) → **Close pair** → check the Close review lists HYPE-PERP and SOL-PERP with price bounds → **Sign close orders**, approve two signatures → **Reconcile** → **Flat**.
5. **Export JSON**.

## Stop conditions

- An unknown receipt: run reconcile only. Never re-send.
- Incomplete open (one leg filled): use the close review. A leg below its market minimum (0.12 HYPE or 0.1 SOL) cannot be closed by an order and stays visible as residual.
- Positions changed outside the pair, or permissions missing on either pool: stop; nothing is sent.

## Evidence to keep

The pair journal (`evidence/testnet-pair-<id>.json`, or the browser export), the four transaction hashes, and a read-only verification of each receipt (sender = signer, `placeOrderFor` owner = app wallet, fills inside bounds), explorer pages, and a final read of HYPE and SOL owner positions = 0. Record it separately from the ETH/BTC proof.
