/**
 * The one pair configuration shared by the browser, CLI and simulator. Market metadata
 * (pools, decimals, ticks, lots, minimums) is never stored here: it is discovered at
 * runtime from the SDK, except for the labeled simulator fixtures.
 */
export const ASSETS = ["ETH", "BTC", "SOL", "HYPE"] as const;
export type Asset = (typeof ASSETS)[number];
export interface PairSelection { long: Asset; short: Asset }

/** Presets go first-asset LONG, second-asset SHORT. Swap direction reverses any of them. */
export const PAIR_PRESETS: readonly PairSelection[] = [
  { long: "ETH", short: "BTC" }, { long: "SOL", short: "ETH" }, { long: "SOL", short: "BTC" },
  { long: "HYPE", short: "SOL" }, { long: "HYPE", short: "ETH" }, { long: "HYPE", short: "BTC" },
];
export const DEFAULT_PAIR: PairSelection = PAIR_PRESETS[0];

export const pairLabel = (p: PairSelection) => `${p.long}/${p.short}`;
export const swapPair = (p: PairSelection): PairSelection => ({ long: p.short, short: p.long });
export const samePair = (a: PairSelection, b: PairSelection) => a.long === b.long && a.short === b.short;
export const isAsset = (value: string): value is Asset => (ASSETS as readonly string[]).includes(value);

/** A preset, in either direction. Identical or unsupported assets are refused. */
export function checkPair(p: { long: string; short: string }): PairSelection {
  if (!isAsset(p.long) || !isAsset(p.short)) throw new Error(`Supported assets are ${ASSETS.join(", ")}.`);
  if (p.long === p.short) throw new Error("Long and short must be different assets.");
  const pair = { long: p.long, short: p.short };
  if (!PAIR_PRESETS.some(x => samePair(x, pair) || samePair(swapPair(x), pair))) throw new Error(`${pairLabel(pair)} is not a supported pair.`);
  return pair;
}
/** "HYPE/SOL" → { long: HYPE, short: SOL }. */
export function parsePair(text: string): PairSelection {
  const [long, short, extra] = text.trim().toUpperCase().split("/");
  if (!long || !short || extra !== undefined) throw new Error("Write the pair as LONG/SHORT, for example HYPE/SOL.");
  return checkPair({ long, short });
}
/** The preset this selection belongs to, and whether it runs reversed. */
export function presetOf(p: PairSelection) {
  const index = PAIR_PRESETS.findIndex(x => samePair(x, p) || samePair(swapPair(x), p));
  return { index, reversed: index >= 0 && !samePair(PAIR_PRESETS[index], p) };
}
/** The pair a journal actually traded: its own immutable leg markets, never the selector. */
export const journalPair = (legs: readonly { market: { symbol: string } }[]) => ({ long: legs[0].market.symbol, short: legs[1].market.symbol });
