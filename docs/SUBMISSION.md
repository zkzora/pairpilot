# Bounty completion checklist

Rules below come from the user's supplied organizer brief. DoraHacks could not be fetched in this session; re-check current organizer rules before submitting.

- Get the DoraHacks email whitelisted. Only the user should send their email/ticket unless they explicitly authorize someone else.
- DONE 2026-10-22: public repository https://github.com/zkzora/pairpilot (default branch main), published with the user's go-ahead. Verified on GitHub: no .env.local or .pairpilot journals.
- DONE 2026-10-22: actual PairPilot perp orders on Somnia Tokyo/50383 with hashes and zero read-back: ETH/BTC (CLI), ETH/BTC and SOL/BTC (browser, user-signed), HYPE/SOL (CLI), HYPE/ETH injected-fault recovery (CLI). See the README proof table.
- DONE 2026-10-25: hosted demo https://pairpilot-delta.vercel.app (Simulation needs no wallet; Testnet reads live books). Linked at the top of the README.
- Demo: `evidence/demo/pairpilot-demo.webm` (49 s, simulation plus testnet read-only, recorded with `scripts/record-demo.ts`). README explains the user, failure, mechanism and limits. A screen recording of a live browser signing would strengthen it; that needs the user's wallet.
- Publish 2–3 accurate X posts tagging @DreamDEXSomnia, then put their actual links in README. Drafts: `docs/X-POSTS.md`. No posts have been sent.
- Keep one reproducible accepted-candidate feedback item per Markdown file in `feedback/`; do not manufacture findings or report expected/injected behavior as sponsor faults.
- Submit before November 1, 23:59 UTC (November 2, 06:59 WIB), subject to organizer confirmation.
- If selected, plan the later mainnet migration and order proof. The supplied brief splits each $500 MVP award into $300 at results and $200 after qualifying mainnet use within 30 days of perps launch. Mainnet support is not implemented here.

## Accurate post themes (draft topics, not published posts)

1. The two-leg execution problem, the exact MVP scope and why we selected dreamDEX perps. Link a simulation only if labeled as simulation.
2. Actual testnet transaction sequence and what fill/position reconciliation showed. Publish after signed evidence exists; include limits and failures honestly.
3. A reproducible integration lesson or demonstrated recovery case, linked to code/evidence. Clearly distinguish our fault injection from a venue issue.

Never claim guaranteed profit, loss protection, atomicity, a fully decentralized recovery service or a prize placement without the corresponding evidence.
