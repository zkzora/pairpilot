# Brief for Claude Design

**Status (2026-10-22):** the user's Claude Design file `PairPilot Dashboard/PairPilotAppV1.dc.html` is implemented in `app/` (`app/ui/parts.tsx`, `app/ui/view.ts`, `app/globals.css`). Deliberate deviations that protect the rules below: the simulation failure-scenario picker is kept; "Avg fill" is omitted because receipts record fill quantity, not price; Setup account checks are real read-only SDK reads instead of "Not checked" rows; Activity reads this browser's journals instead of mock rows; leg cards say "Closed" (the pair status alone says "Flat").

**Review fixes (2026-10-22, user priorities 1-3):** the locked ticket shows actual open positions ("Open now", or "Last recorded, not re-read" while unresolved) separately from "Original plan · not current exposure"; on phones the ticket comes first before a position exists, the price strip is compact, simulated fixed prices move below the ticket, and "How it works" is collapsible (Preview at ≤682 px on 375×812, was 1,779 px); Setup separates Browser wallet and Local CLI paths, shows the exact address to fund, a live chip per step, and reads voucher eligibility plus a read-only claim simulation. Still open: a close review screen (priority 4) and plainer Activity amounts (priority 5).

Full page structure, content, states and implementation priorities: [PairPilot website specification](../PAIRPILOT_WEBSITE_SPEC.md).

The user chooses final branding and visual direction in Claude Design. The current neutral UI is functional scaffolding.

The core task is to express **long ETH / short BTC** as one pair, review both orders, execute, understand incomplete fills and close/reconcile. Keep the trade form and pair status prominent. A decorative dashboard is not the product.

Preserve these states and behaviors:

- Visibly separate simulation from actual testnet signing. Live market snapshots do not mean the simulated orders are live.
- Show each leg's side, requested quantity, actual open quantity, price limit and market units.
- Show pending, incomplete, attention and flat honestly. Never label paired because transactions were merely submitted.
- Make review and signing explicit. Reconcile must send no orders. Closing is a distinct action and may leave residuals.
- Keep wallet/network identity, stale quote errors, expired previews, missing funds, external position changes and failure recovery visible.
- Approximate equal notional must not be described as risk-free, beta neutral or a guaranteed hedge.
- Clearly state that v0 recovery uses client-side checks and needs an exclusive test account.
- Keep keyboard focus, labeled fields, readable contrast, 44px touch targets, loading/error/empty states and responsive layouts.

Stable implementation boundary: `src/core/` and `src/adapters/` own execution semantics. The design should update `app/` components and styles without duplicating arithmetic, interpreting RPC failure as zero, faking receipts or changing retry behavior.

Possible user-facing hierarchy: pair ticket → two-leg review → current status/residuals → reconcile/close → receipt links. Keep raw units and full transaction diagnostics in an expandable journal.

