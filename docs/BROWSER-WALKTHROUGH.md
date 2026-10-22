# Browser testnet walkthrough: linked wallet

For the user, who performs every wallet setup step and every signature. PairPilot never sees a key: the browser signs through a wallet extension, and the server has only the read-only `/api/markets` endpoint.

Result so far: **user-performed ETH/BTC and SOL/BTC browser open/close cycles verified by RPC on 2026-10-22.** Eight unique successful transactions match their exported owner, signer, pools, sides, quantities, price limits, IOC and fills. A separate current read returned ETH/BTC/SOL positions zero. See `evidence/browser-exports-verification-1792672013241.json`. Mock Playwright tests, live browser evidence and the CLI proof (`evidence/operator-pair-proof.json`) remain separate. Live incomplete-fill recovery and live HYPE trading are not verified.

## 0. Before you start

- Use a desktop browser with an EVM wallet extension (MetaMask, Rabby or similar).
- **Use a NEW account in the extension as the browser signer.** Do not import the CLI key from `.env.local`. That key stays local to the CLI, and the CLI's link does not authorize any other address.
- The owner is your dreamDEX app wallet. On 2026-10-22 it was `0x436dAE2EF8e8eECE9960b3C3a9DA6731a2D6c1F5` with 1,000 USDso Perps margin. Check the app for the current balance.
- Keep the owner free of other activity during the test: no manual trades, resting orders or stops, and no other bot trading it. Close the CLI pair first; the CLI and the browser keep separate journals and locks.

## 1. Fund and link the browser signer

1. In the extension, create the new account and copy its address.
2. Send it at least 1 STT on **Somnia Tokyo, chain 50383**. Shannon (50312) STT does not pay Tokyo gas. The Link a Bot screen in the dreamDEX app may offer to send gas.
3. In the dreamDEX app, open the wallet, choose **Link a bot**, tick **Perps**, paste the new address and press **Add bot**. Confirm in the app.

## 2. Open PairPilot and check readiness

1. `npm run dev`, then open <http://127.0.0.1:3000>.
2. Select **Testnet**, press **Connect wallet** and choose the new account. Approve adding or switching to Tokyo.
3. In the **Execution** panel choose **Linked wallet**, paste the owner's FULL address and press **Use this owner**.
4. Expect:
   - **Owner · positions and margin**: about 1,000 USDso, no positions, orders or stops.
   - **Signer · signs and pays gas**: your new address with at least 1 STT.
   - **Permissions**: ETH-PERP and BTC-PERP both show **Can place**.
   If either says **Cannot place**, the link did not cover this signer. Redo step 1.3 and press Refresh. Preview stays blocked until both pass.

## 3. Open the pair (two signatures)

1. Keep **Total notional 50** and **Slippage 30 bps**. Press **Preview pair** (no signature).
2. Read both legs and their price limits. Tick the dedicated-account box. Press **Sign & open testnet pair** within about 40 seconds.
3. The wallet asks twice: first the ETH long, then the BTC short. Each one is a `placeOrderFor` transaction to the pool, sent from your signer for the owner.
4. Expect **Pair open**, with both legs **Filled** and a receipt link each.
   - If you reject the second signature, the ETH long stays open: **Incomplete**. Use the close review to unwind it.
   - If a receipt does not arrive, the pair shows **Needs reconciliation**. Press **Reconcile**. Never sign the same order again.

## 4. Reconcile, review the close, close

1. Press **Reconcile**. It sends nothing and should keep **Pair open**.
2. Press **Close pair**. The **Close review** lists the actual open quantities, each close order and its price bound. It is valid for 30 seconds.
3. Press **Sign close orders** and approve both signatures.
4. Expect **Flat**, with the leg cards showing **Closed**. Press **Reconcile** again. It must stay **Flat**.

## 5. Keep the evidence

1. Press **Export JSON** and save the file as `evidence/browser-operator-pair-<id>.json`.
2. Hand the four transaction hashes to Claude. It will verify the receipts read-only, check that the sender is the browser signer, that `placeOrderFor` names the owner and the fill prices, read both owner positions back as zero, and check the explorer pages.
3. Write down anything confusing, with screenshots. That is user-testing evidence.

## If something goes wrong

- **Wallet account or network changed:** PairPilot drops the session. Reconnect the SAME signer and re-apply the owner. The pair is still in this browser's journal.
- **"This pair belongs to another signer":** you connected a different wallet than the one that opened the pair. Connect the original.
- **Positions changed outside this pair:** something else traded the owner. Stop, inspect in the dreamDEX app, then reconcile.
- **Reduce-only is not enforced on-chain.** PairPilot checks the position right before each close. A trade from elsewhere, or a liquidation, can still change it.
