import { Logo } from "../ui/logo";

export default function SetupPage() {
  return <div className="app"><header className="hdr"><a className="brand" href="/"><Logo /><span>PairPilot</span></a><div className="spacer" /><a className="back" href="/">Back to Trade</a></header><main className="guide">
    <p className="eyebrow">Somnia Tokyo / Hideki · 50383</p><h1>Get ready for a testnet trade.</h1>
    <p>Start with simulation. Real testnet orders need a dedicated account, STT for gas and paper USDso in its Perps account.</p>
    <h2>Option A · browser wallet</h2><ol>
      <li>Create a dedicated test wallet in your browser wallet extension. Keep the seed phrase and private key in the wallet.</li>
      <li>In PairPilot, select <strong>Testnet → Connect wallet</strong>. The app requests Somnia Tokyo, chain <code>50383</code>.</li>
      <li>Obtain STT on this exact network through the official dreamDEX testnet app’s wallet gas/top-up flow, or bridge STT from Shannon (50312) over the Hyperlane lane documented in the SDK. Shannon STT does not pay Tokyo gas until bridged. Keep at least 1 STT.</li>
      <li>Fund this address’s Perps margin with paper USDso. The local CLI can claim the documented one-time voucher for an eligible own-wallet account; do not claim repeatedly through multiple accounts.</li>
      <li>Verify the account is flat with no open orders, pending TP/SL or other bots. Preview 50 USDso total, then sign the two orders. A failed second leg leaves the first exposed until closed.</li>
      <li>Use <strong>Reconcile</strong>, <strong>Close pair</strong>, then <strong>Export JSON</strong> to keep transaction hashes and remaining quantities.</li>
    </ol>
    <h2>Option B · local CLI wallet</h2><ol>
      <li>Run <code>npm run wallet:init</code>. It creates one dedicated key in ignored <code>.env.local</code> and prints only the public address. Never paste that key into chat.</li>
      <li>Send STT on Tokyo to the printed address. Run <code>npm run wallet:status</code> to check its balance and margin.</li>
      <li>Run <code>npm run wallet:claim</code> to claim the one-time paper USDso voucher after eligibility is verified.</li>
      <li>Run <code>npm run trade -- preview</code>, then <code>npm run trade -- open</code> to execute the saved preview, limited to 200 USDso total. These commands sign real testnet transactions.</li>
      <li>Run <code>npm run trade -- reconcile</code> after uncertainty. Run <code>npm run trade -- close</code> to close filled exposure. CLI and browser journals are separate; use one execution path per wallet.</li>
    </ol>
    <h2>Using a wallet inside dreamDEX</h2>
    <p>The app wallet and your browser wallet may be different addresses. Link a Bot grants a separate key permission to trade the app wallet; it does not turn the bot address into the owner. The browser path trades only its own wallet. The local CLI can trade a linked app wallet: pass the app wallet&apos;s full address with <code>--owner=</code> to every <code>npm run trade</code> command, starting with the read-only <code>check</code>. Margin and positions stay on the app wallet; the CLI key signs and pays gas.</p>
    <p>Extra bounty USDso must stay separate from Perps Arena accounts under the bounty rules.</p>
    <h2>Limits of this version</h2>
    <p>Orders execute sequentially. Recovery requires this client to run and may partially fill or fail. Position checks cannot prevent a race with another client; ordinary SDK orders do not expose a contract-enforced reduce-only flag. Do not trade elsewhere on the account while a pair is active. Browser history lives in this browser’s local storage.</p>
    <p>Equal dollar allocation is not a guarantee of market neutrality, profitability or a maximum loss. This version does not arm TP/SL or change your leverage setting.</p>
    <h2>Official references</h2><ul>
      <li><a href="https://app.testnet.dreamdex.io/docs/developers/perps-testnet" target="_blank" rel="noreferrer">Perps developer setup</a></li>
      <li><a href="https://app.testnet.dreamdex.io/docs/trading/perps-testnet" target="_blank" rel="noreferrer">Perps, test funds and margin</a></li>
      <li><a href="https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot" target="_blank" rel="noreferrer">Link a Bot and its permission limits</a></li>
    </ul>
  </main></div>;
}
