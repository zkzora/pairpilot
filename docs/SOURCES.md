# Resource and evidence ledger

Checked during the 2026-10-22 Asia/Jakarta build session. This is a focused review of relevant pages/code, not a claim to have read every file of every linked repository.

| Resource | Access/review | Implementation consequence |
| --- | --- | --- |
| [dreamDEX bot kit](https://github.com/somnia-chain/dreamdex-bot-kit) | Read README, perps guide, perp-starter source, perp-core exchange/orders/market helpers, funding/guard READMEs and batch-7702 README. | Existing funding/guard bots narrow differentiation; own-wallet and operator paths differ; decimals vary. The spot batch is not evidence of live atomic perps. |
| [Somnia platform Markets overview](https://somnia-platform-docs.vercel.app/markets/somnia-markets) | Web tool could not open it; direct HTTPS fetch succeeded and article text was read. | Same on-chain order-book family; typed SDK and raw contracts are alternative integration surfaces. |
| [Testnet developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet) | Read current guide and SDK 0.32.1 installed declarations/source. | Tokyo/Hideki 50383, network endpoints, runtime market discovery, margin sizing, voucher and bot permissions. |
| [Testnet trading guide](https://app.testnet.dreamdex.io/docs/trading/perps-testnet) | Read current guide, linked orders/margin/funding pages. | Distinguish notional/margin, funding-window units, market availability and paper funds. |
| [Link a Bot](https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot) | Read permission and funding workflow. | Bot cannot withdraw or arm owner's native TP/SL. Implemented in v0 as linked-wallet operator execution (`placeOrderFor`, per-pool `isOperatorAuthorized`), following the bot kit's perp-core operator flow; verified live from the CLI on 2026-10-22. |
| [SDK perps reference](https://prd.smk.somnia.host/docs/typescript/perps) | Read relevant discovery, position/margin, previews, event, stops and batch sections; inspect installed types. | Use chain position read-back; ordinary placement interface has no reduce-only parameter. |
| [SDK Reactivity](https://prd.smk.somnia.host/docs/typescript/reactivity) | Read event-plus-state model and local-network caveats. | Potential later integration; no Reactivity behavior claimed in current code. |
| [DoraHacks bounty/resources](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail#resources) | Public web fetch failed with HTTP 405. Rules were taken from the user's supplied full brief. | Whitelist, repo, live orders, X posts, disclosure and deadlines require a final organizer-page check before submission. |
| [Pear execution](https://docs.pear.garden/how-it-works/execution-logic) | Read primary product documentation. | Pairing and asynchronous execution already exist elsewhere. Do not claim a new category or first-ever mechanism. |

## Evidence boundaries

- **Pitch:** fill-aware pair execution for dreamDEX traders.
- **Implemented:** local UI, exact sizing, sequential own-wallet and linked-wallet operator order adapter, durable journals bound to owner/signer, reconciliation, reviewed close and simulator faults.
- **Verified:** local tests/browser behavior, real read-only Tokyo SDK/RPC reads, and five live linked-wallet runs re-verified from chain data: ETH/BTC (CLI and browser), SOL/BTC (browser), HYPE/SOL (CLI) and an injected-fault HYPE/ETH recovery (CLI). See the README proof table. Own-wallet signed orders are not verified.
- **Assumptions:** traders need this workflow on dreamDEX; it offers sufficient improvement over native orders; atomic batching may improve it. Demand and the advantage over two manual orders are untested with traders (`docs/USER-TESTS.md`).

Network metadata and contract state can change. Re-run the doctor and discover markets at runtime rather than trusting this ledger as a contract-address manifest.
