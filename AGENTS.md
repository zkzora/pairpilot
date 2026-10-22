<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PairPilot project instructions

Read README.md, HANDOFF.md and docs/TESTNET.md before continuing. The accepted product is a two-asset long/short perp pair workflow (ETH, BTC, SOL, HYPE presets; ETH/BTC default) with actual fill reconciliation and explicit unwind. The user will choose visuals in Claude Design; do not start branding or pivot the product.

- Start product decisions from the specific trader failure, cost, mechanism and strongest practical alternative. Demand and differentiation remain hypotheses until validated.
- Keep simulation, live read-only checks, signed testnet execution and mainnet evidence separate. Never fabricate receipts, X posts, findings, interviews or award claims.
- Keep bigint arithmetic, per-market decimals/ticks/lots/minimums, bounded IOC orders, durable intents/hashes and no-blind-retry behavior intact.
- Unknown transactions block new writes until resolved. Reconciliation sends no orders. A residual position is never flat.
- SDK ordinary perp orders do not expose a reduce-only flag. Client checks are not on-chain enforcement; exclusive-account assumptions and liquidation races must remain explicit.
- Preserve .env.local and .pairpilot journals. Never print keys or pass secrets to a browser bundle. The HTTP server has no signing endpoint.
- No mainnet trades, remote publication, messages to organizers or X posts without applicable user authorization. Local implementation and testnet verification are authorized.
- Use existing code; do not scaffold another repository. Run meaningful tests for execution changes plus typecheck/build; UI changes need the browser checks.
- Follow the user's product-ideation preferences: compare meaningful alternatives, challenge favorites, distinguish pitch/implementation/verified evidence/assumptions, and establish a concrete validation/demo plan before expanding scope. No guaranteed hackathon win claims.
