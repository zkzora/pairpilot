# getPerpVoucherEligibility reports eligible, but VoucherDistributor.claim() reverts with unnamed 0x3e31dcc2
Severity: normal
Area: SDK | contracts

Status: local draft. Not submitted to anyone. Sending requires the user's authorization.

## Steps to reproduce
1. On Somnia Tokyo / Hideki (chain 50383), use a fresh EOA with STT for gas, no positions, no resting orders, no main-funded principal and no wallet linkage.
2. `client.getPerpVoucherEligibility("0x478769E1177C0773c43A593DCCc4Ad15F15F1394", account)` returns `{ eligible: true, grantAmount: 1000e18 }`.
3. `trader.claimPerpVoucher({ marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394" })` (SDK 0.32.1), which resolves distributor `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4` and calls `claim()` (`0x4e71d92d`).

## Expected
Either the claim succeeds, or eligibility returns `eligible: false` with the reason the claim will revert.

## Actual
The transaction is mined and reverts with custom error data `0x3e31dcc2`. The SDK raises `ContractRevertError: claim reverted: for an unknown reason.` with no `errorName`, and its message does not include the transaction hash. An `eth_call` of `claim()` from the same account still reverts with `0x3e31dcc2` at later blocks, so it is deterministic.

Read-only state at block ~29996034, all consistent with the documented eligibility rules: campaign window open (`startsAt` 1790553600, `endsAt` 1798477478, block time 1792651498), `budgetRemaining` 408874e21 (408,874 claims), `isClaimed` false, `getMainFundedPrincipal` 0, no active perp pools, wallet linkage `isChild=false, isMain=false`, signer is a plain EOA.

Observation from the implementation bytecode (`0x9657f0fd53efc01cd108d93c835bb4b517732b43`, behind the EIP-1967 proxy): after the `nonReentrant` guard, `claim()` unpacks a struct from ERC-7201 slot `0xb7eec95a…a29a05aa807` (value `0x100010000000000093a80`: uint64 604800, then flags 1, 0, 1) and reverts with `0x3e31dcc2` when the flag at bit 80 is set. We have not confirmed the flag's name or intent; it may be a deliberate claim gate. `getPerpVoucherEligibility` does not read it, so it cannot report this reason. `0x3e31dcc2` is not in the SDK's error tables (546 error signatures checked) or in openchain/4byte.

## Evidence
- Signed: `0x83401fae8899cfe109e6cc846dd3e158733f353bc9b47a372fd5c77e8e6e6d3f`, block 29995018, status reverted, gasUsed 22781. Explorer (shows Failed): https://explorer.testnet.somnia.network/tokyo/tx/0x83401fae8899cfe109e6cc846dd3e158733f353bc9b47a372fd5c77e8e6e6d3f
- Read-only: repeated `eth_call` of `claim()` reverts `0x3e31dcc2`; `debug_traceCall` shows the revert inside the implementation's DELEGATECALL. Recorded in `evidence/voucher-claims.json`.

## Environment
`@somnia-chain/markets-sdk` 0.32.1, viem 2.57.8, Node 24.16.0, Somnia Tokyo / Hideki testnet chain 50383, wallet `0x39f4aebEff78aB72c2FDA3b34c7993608AA79C50`. 2026-10-22.
