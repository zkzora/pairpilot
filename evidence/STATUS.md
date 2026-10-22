# Verification status

Build session: 2026-10-22, Asia/Jakarta.

| Check | Observed result |
| --- | --- |
| Core/adapter/view tests | 84 passed across 8 test files after four-asset pairs (all 12 directions, mixed decimals, minimum refusal, depth/stale guards, journal-market recovery, missing grant on either pool); before that 47 passed across 6 test files (adds close review exactness/expiry/basis and rejected second signature); before that 44 passed across 6 test files (adds operator owner/signer, encoding, permission and signer-binding tests); earlier 33 passed across 5 test files (adds simulate-first voucher claim tests); previously 29 passed across 4 test files (2026-10-22, after the Claude Design dashboard; includes view-model labels derived from real simulated engine runs) |
| Browser workflows | 29 passed across 6 spec files after four-asset pairs, disconnect and wallet-connect fixes; before that 19 passed across 3 spec files after browser linked-wallet support and close review; before that 13 passed after the UX review fixes (adds partial-fill ticket separation, phone ticket-first layout in both modes, and Setup browser/CLI paths); previously 10 passed on the Claude Design dashboard, including 375/768/1280 px, reload reconciliation, the 20 s preview-headroom refusal (fake clock) and the Activity/Setup tabs. Re-run with `PAIRPILOT_CHROMIUM` pointing at cached Playwright Chromium 1243; the headless shell expected by the installed Playwright (1248) is not downloaded on this machine |
| TypeScript | Passed after correcting the synthetic receipt fixture's topic type |
| Production build | Passed; routes `/`, `/setup`, `/api/markets` |
| npm production audit | Zero reported vulnerabilities at this run |
| Read-only doctor | Chain 50383, 21 markets, ETH/BTC live and system fully wired at recorded block (re-run 2026-10-22 at block 29732212) |
| Local live-data endpoint | HTTP 200 with actual chain order books and mark/funding state |
| Unfunded CLI preview | Refused at the live margin gate with no transaction sent |
| Voucher claim (signed) | FAILED on-chain, 2026-10-22: tx `0x83401fae8899cfe109e6cc846dd3e158733f353bc9b47a372fd5c77e8e6e6d3f`, block 29995018, reverted with unnamed `0x3e31dcc2` while `getPerpVoucherEligibility` reported eligible. Explorer page verified (HTTP 200, shows Failed). Cost ≈0.000137 STT. See `evidence/voucher-claims.json` and `feedback/voucher-eligibility-says-eligible-but-claim-reverts.md` (local draft, not sent) |
| Voucher claim (simulate-first CLI) | Re-run after the fix: simulation reverted `0x3e31dcc2`, **no transaction sent**, attempt recorded |
| Wallet after attempts | 4.999863314 STT, 0 USDso equity, nonce 1, no positions (read-only, 2026-10-22) |
| Signed pair open/close proof (own wallet) | NOT PERFORMED: the signer's own account has no Perps margin |
| Signed pair proof (linked-wallet operator, CLI) | PASSED 2026-10-22: pair `cd37d484-d55b-4783-af0d-858384424f47` opened paired (ETH +0.0103, BTC −0.0003 on the owner), reconciled, closed and reconciled flat. Owner positions read 0/0 at block 30110208; 4 `placeOrderFor` txs, all success, signer-sent, owner-attributed, explorer pages verified. `evidence/operator-pair-proof.json` |
| Operator unit tests | Owner/signer resolution, placeOrderFor encoding, missing-permission refusal and signer-bound journals (see test counts above) |
| Explorer URL format | Verified: `https://explorer.testnet.somnia.network/tokyo/tx/<hash>` resolves a real Tokyo transaction |
| HYPE/SOL readiness | READ-ONLY 2026-10-22: API books for HYPE (6 dec) and SOL (9 dec); owner flat with 1,000.06 USDso; `placeOrderFor` granted on both pools; preview HYPE long 0.31 @ ≤78.53, SOL short 0.23 @ ≥104.22; both legs simulated OK. 0 signed transactions. NOT live-verified |
| Browser signing (user performed; RPC verified) | PASSED 2026-10-22 for ETH/BTC (`bda58fa7-368a-4915-af86-62bc1fbad4f6`) and SOL/BTC (`43dc36bf-185e-4b9b-bda1-8d9cc2655f34`). User-supplied exports contain 8 unique successful open/close transactions from browser signer `0xd41C88eE843dcCBe6E8AD3D62e4c33Ccb6C9787b` for the linked owner. RPC verification matches sender, owner, pool, side, quantity, price bound, IOC and decoded fill amounts. A separate current read returned ETH/BTC/SOL positions zero. `evidence/browser-exports-verification-1792672013241.json`. This does not verify live incomplete-fill recovery or HYPE trading. |

Simulation traces and browser screenshots are labeled local evidence. Browser tests deliberately inject an offline API condition; this is not a dreamDEX finding. No sponsor feedback report, X post, remote repository or submission was published.

Source of execution results: local npm/test commands, user-supplied browser exports and independent read-only SDK/RPC checks. Limited happy-path funded execution is verified for CLI ETH/BTC and browser ETH/BTC and SOL/BTC. This does not establish live incomplete-fill recovery, live HYPE trading, atomicity, on-chain reduce-only enforcement, strategy profitability or production readiness. Current position reads are separate from historical receipts.

## Live verification round (2026-10-22, evening)

| Check | Observed result |
| --- | --- |
| HYPE/SOL live pair (CLI, linked app wallet) | Pair `6516f259`: opened paired (HYPE +0.31 @ 78.55, SOL −0.23 @ 105.06), reconcile paired, closed (78.50 / 105.08), reconcile flat. Verifier: all checks pass, owner HYPE 0 / SOL 0 at block 30254255. `evidence/hype-sol-operator-proof-6516f259-…json` |
| Live recovery (CLI, injected fault) | Pair `8ab9e2fb` HYPE/ETH: HYPE long 0.31 filled; ETH short withheld by `--inject=withhold-second-leg` (labeled in journal, never broadcast) → incomplete → reconcile sent nothing → close unwound HYPE only → flat. Owner HYPE 0 / ETH 0 at block 30255205. `evidence/recovery-injected-hype-eth-proof-8ab9e2fb-…json` |
| Browser signing (user-signed, linked app wallet) | VERIFIED: ETH/BTC `bda58fa7` and SOL/BTC `43dc36bf`, browser signer `0xd41C88eE…787b`. Re-verified with `npm run verify`: every check passes; current owner positions zero. `evidence/browser-operator-proof-*.json` |
| First CLI pair re-verified | `cd37d484` ETH/BTC re-checked with the same verifier (journal fills vs receipts added): all checks pass. `evidence/cli-operator-proof-cd37d484-…json` |
| Tests | 89 unit, 37 browser (mock wallets, injected offline reads), typecheck, production build |
| Demo | `evidence/demo/pairpilot-demo.webm`, 49 s, recorded from a production build; simulation labeled, testnet part read-only |

UX fixes from user testing this round: browser 0 USDso confusion (linked app wallet discovery from registry logs), wallet connect `[object Object]` errors, sub-minimum residual dead end (now named, leg labeled "Below minimum", close disabled with reason), Activity raw units, swapped-pair label, testnet strip showing the previous pair's books after a Simulation pair change.
