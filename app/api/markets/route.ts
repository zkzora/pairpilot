import { readSnapshot } from "../../../src/adapters/dreamdex";
import { createMarkets } from "../../../src/lib/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const exchange = createMarkets();
  try {
    return Response.json(await readSnapshot(exchange), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 600) : "Testnet read failed. Try again." }, { status: 502 });
  } finally { await exchange.close(); }
}
