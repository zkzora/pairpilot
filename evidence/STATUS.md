# Verification status

Build session: 2026-10-22, Asia/Jakarta.

| Check | Observed result |
| --- | --- |
| Core/adapter/view tests | 44 passed across 6 test files (adds operator owner/signer, encoding, permission and signer-binding tests); earlier 33 passed across 5 test files (adds simulate-first voucher claim tests); previously 29 passed across 4 test files (2026-10-22, after the Claude Design dashboard; includes view-model labels derived from real simulated engine runs) |
| Browser workflows | 13 passed after the UX review fixes (adds partial-fill ticket separation, phone ticket-first layout in both modes, and Setup browser/CLI paths); previously 10 passed on the Claude Design dashboard, including 375/768/1280 px, reload reconciliation, the 20 s preview-headroom refusal (fake clock) and the Activity/Setup tabs. Re-run with `PAIRPILOT_CHROMIUM` pointing at cached Playwright Chromium 1243; the headless shell expected by the installed Playwright (1248) is not downloaded on this machine |
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
| Browser signing | NOT PERFORMED. No injected wallet was used in this session |

Simulation traces and browser screenshots are labeled local evidence. Browser tests deliberately inject an offline API condition; this is not a dreamDEX finding. No sponsor feedback report, X post, remote repository or submission was published.

Source of execution results: local npm/test commands and real read-only SDK/RPC calls during this session. These results do not verify funded order execution, atomicity, on-chain reduce-only enforcement, strategy profitability or production readiness.
