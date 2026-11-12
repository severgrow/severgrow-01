// THE FINISH CARD'S WINDOW (owner, 2026-11-12). The card's big window shows THE PLANET only when the
// player can do something there: a WIN, with at least one tile's price in the wallet. Every other
// finish — a loss, a draw, or a win with fewer Seeds than a tile costs — shows the FINAL BOARD in the
// same window, at the same size and with the same frame (the board RESULT shows, made large).
//
// The card decides from the last balance it knew (so it never flickers on the common case), then
// once more when the wallet is read fresh (a win whose payout just crossed the price shows the
// planet). Pure: main.ts owns the DOM and the reads.

/** One tile on the planet (server/src/seeds/config.ts `SEED_ECONOMY.tileCost`; the pane shows the live price). */
export const PLANET_TILE_PRICE = 100;

export type FinishWindow = 'planet' | 'board';

export const finishWindowFor = (m: { won: boolean; balance: number | null; hasBoard: boolean; teach?: boolean }): FinishWindow => {
  // THE RULE (owner, 2026-11-12): the planet ONLY on a win with a tile's price in the wallet. A loss
  // or a draw is the final board, always — even when no board figure was made (the window then shows
  // the board the page still holds; main.ts never leaves it empty).
  if (!m.won) return 'board';
  // Level 10 TEACHES the planet, in the planet's own window: its win always shows it, whatever the
  // wallet says (its 100 Seeds may not have landed yet, or cannot be verified offline).
  if (m.teach && m.won) return 'planet';
  return m.balance !== null && m.balance >= PLANET_TILE_PRICE ? 'planet' : 'board';
};

/** `severgrow.*`: the last wallet balance this device saw, so the card can choose before any read. */
export const SEED_BALANCE_KEY = 'severgrow.seeds.balance.v1';

export const parseBalance = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
