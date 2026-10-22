import { readSnapshot } from "../../../src/adapters/dreamdex";
import { createMarkets } from "../../../src/lib/network";
import { checkPair, DEFAULT_PAIR } from "../../../src/core/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Read-only books for one supported pair: /api/markets?long=HYPE&short=SOL (default ETH/BTC). */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  let pair;
  try { pair = query.has("long") || query.has("short") ? checkPair({ long: query.get("long") ?? "", short: query.get("short") ?? "" }) : DEFAULT_PAIR; }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unsupported pair." }, { status: 400 }); }
  const exchange = createMarkets();
  try {
    return Response.json(await readSnapshot(exchange, pair), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 600) : "Testnet read failed. Try again." }, { status: 502 });
  } finally { await exchange.close(); }
}
