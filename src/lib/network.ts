import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets, type SomniaMarketsSignerConfig } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

export const NETWORK = {
  id: 50383,
  name: "Somnia Tokyo / Hideki testnet",
  rpc: "https://api.hideki2.infra.testnet.somnia.network",
  ws: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexer: "https://hideki-dev.smk.somnia.host/v1/graphql",
  explorer: "https://explorer.testnet.somnia.network/tokyo",
} as const;

export { hidekiTestnet };

export function createMarkets(signer: SomniaMarketsSignerConfig = {}) {
  return new SomniaMarkets({
    chain: hidekiTestnet,
    indexerUrl: NETWORK.indexer,
    addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    ...signer,
  });
}
