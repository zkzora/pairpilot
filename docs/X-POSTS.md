# X post drafts (not published)

Drafts for the user to review and post. Each claim maps to a proof file in the repository. Nothing here has been posted.

---

**1 · The problem and the product**

A long/short perp pair is two orders. If one fills and the other doesn't, you're holding naked exposure you never wanted.

PairPilot puts both legs on one ticket on @DreamDEXSomnia testnet: bounded IOC orders, fills read back from chain, and an explicit, reviewed unwind for whatever is left.

ETH · BTC · SOL · HYPE, six pairs, both directions.

https://github.com/zkzora/pairpilot

Evidence: README "Live testnet proof" table.

---

**2 · Live runs**

Five live runs on @DreamDEXSomnia Tokyo testnet today, each re-checked from chain data (receipt, signer, fills inside price bounds, owner positions back to zero):

• ETH/BTC from the CLI
• ETH/BTC and SOL/BTC signed in the browser
• HYPE/SOL from the CLI
• a HYPE/ETH recovery (below)

Every transaction is linked: https://github.com/zkzora/pairpilot#live-testnet-proof-somnia-tokyo-chain-50383-2026-10-22

Evidence: `evidence/*-proof-*.json`.

---

**3 · Recovery, not just the happy path**

We deliberately withheld the second leg of a HYPE/ETH pair: a labeled fault injection that stands in for a rejected wallet signature.

PairPilot showed the one-legged HYPE long as incomplete, reconcile sent nothing, the close review unwound only HYPE, and the owner read back flat.

Not atomic, not magic. Just visible, recoverable state on @DreamDEXSomnia.

https://github.com/zkzora/pairpilot

Evidence: `evidence/recovery-injected-hype-eth-proof-8ab9e2fb-8185-4d1c-9bfe-59081193117a.json`.

---

Avoid in any post: profit or loss-protection claims, "atomic", "risk-free", "hedged", mainnet, or any prize claim.
