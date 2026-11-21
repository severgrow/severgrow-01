// THE FINISH CARD'S WINDOW (owner, 2026-11-12). The card's big window shows THE PLANET only when the
// player can do something there: a WIN, with at least one tile's price in the wallet. Every other
// finish — a loss, a draw, or a win with fewer Seeds than a tile costs — shows the FINAL BOARD in the
// same window, at the same size and with the same frame (the board RESULT shows, made large).
//
// NO THREE PLANETS IN A ROW (owner, 2026-11-20: "never show the planet view and the end of the game
// 3 times in a row ... if player keeps winning, show the winning board view result every 2 planet
// views to alternate and not bore"). So a qualifying win does not show the planet every time: the
// cycle is PLANET, PLANET, BOARD, PLANET, PLANET, BOARD ... The run below is the memory that makes
// it happen, persisted per player by main.ts (this file stays pure: the caller reads and writes).
//
// The card decides from the last balance it knew (so it never flickers on the common case), then
// once more when the wallet is read fresh (a win whose payout just crossed the price shows the
// planet). Pure: main.ts owns the DOM and the reads.

/** One tile on the planet (server/src/seeds/config.ts `SEED_ECONOMY.tileCost`; the pane shows the live price). */
export const PLANET_TILE_PRICE = 100;

export type FinishWindow = 'planet' | 'board';

/**
 * AT MOST TWO PLANET VIEWS IN A ROW (owner, 2026-11-20). `planetRun` counts the PLANET windows shown
 * for consecutive QUALIFYING wins (a win that can afford a tile) since the last winning board.
 *
 * "Every 2 planet views" can be read two ways: planet, board, planet, board, or planet, planet,
 * board. The owner's own constraint settles it — "never ... 3 times in a row" — and "show the
 * winning board ... every 2 planet views" names the board as what follows TWO planet views. So the
 * cycle is PLANET, PLANET, BOARD: two planets, then one winning board, then two planets again.
 * (The other reading would alternate every single win, which is a bigger change than he asked for.)
 */
export const PLANET_RUN_CYCLE = 3;
export const PLANET_RUN_PLANETS = 2;

/**
 * A stored run outside the cycle is not a run: 0 means "the next qualifying win gets its planet".
 * The count never needs to grow — it lives in 0..PLANET_RUN_CYCLE-1 and returns to 0 on the board.
 */
export const normalizePlanetRun = (n: unknown): number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n < PLANET_RUN_CYCLE ? n : 0;

/** Both halves of the one decision, so the view and the run stored for it can never disagree. */
export type FinishChoice = { view: FinishWindow; planetRun: number };

/**
 * THE ONE DECISION: which window, and the run to remember for the next one.
 *
 *  · a loss or a draw is the final board, and it ENDS the winning run (the player is not on a
 *    streak of wins any more): the run goes back to 0, so the next win gets its planet;
 *  · level 10's TEACHING win always shows the planet and does not consume a slot — the rule is
 *    about boredom, never teaching, and a teaching win that ate the second slot would suppress the
 *    next real win's planet;
 *  · a win short of a tile's price shows the board and spends no slot (the planet was never due);
 *  · a qualifying win shows the planet for the first two, then the winning BOARD on the third and
 *    the run starts over.
 */
export const finishChoice = (m: { won: boolean; balance: number | null; hasBoard: boolean; teach?: boolean; planetRun?: number }): FinishChoice => {
  const planetRun = normalizePlanetRun(m.planetRun ?? 0);
  // THE RULE (owner, 2026-11-12): the planet ONLY on a win with a tile's price in the wallet. A loss
  // or a draw is the final board, always — even when no board figure was made (the window then shows
  // the board the page still holds; main.ts never leaves it empty).
  if (!m.won) return { view: 'board', planetRun: 0 };
  // Level 10 TEACHES the planet, in the planet's own window: its win always shows it, whatever the
  // wallet says (its 100 Seeds may not have landed yet, or cannot be verified offline).
  if (m.teach) return { view: 'planet', planetRun };
  if (!(m.balance !== null && m.balance >= PLANET_TILE_PRICE)) return { view: 'board', planetRun };
  if (planetRun >= PLANET_RUN_PLANETS) return { view: 'board', planetRun: 0 };
  return { view: 'planet', planetRun: planetRun + 1 };
};

export const finishWindowFor = (m: { won: boolean; balance: number | null; hasBoard: boolean; teach?: boolean; planetRun?: number }): FinishWindow =>
  finishChoice(m).view;

/** `severgrow.*`: the last wallet balance this device saw, so the card can choose before any read. */
export const SEED_BALANCE_KEY = 'severgrow.seeds.balance.v1';

export const parseBalance = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/**
 * THE PLANET RUN, PER PLAYER (owner, 2026-11-20). One small integer, kept in the store so the
 * alternation survives closing the tab between games (in memory it would silently restart every
 * session and the player would never see it). Keyed by player id, the same discipline as the
 * Practice streaks and the ticket shelf: another account signed in on this device never inherits
 * this player's place. A missing, damaged or out-of-cycle value reads as 0 (let the next win show
 * its planet) and an unknown player has no run at all.
 */
export const FINISH_PLANET_RUN_KEY = 'severgrow.finish.planet-run.v1';

type PlanetRunBook = { v: 1; players: Record<string, number> };

const readPlanetRuns = (raw: string | null): PlanetRunBook => {
  try {
    const saved = JSON.parse(raw ?? 'null') as { v?: unknown; players?: unknown } | null;
    if (!saved || saved.v !== 1 || !saved.players || typeof saved.players !== 'object' || Array.isArray(saved.players)) {
      return { v: 1, players: {} };
    }
    const players: Record<string, number> = {};
    for (const [id, run] of Object.entries(saved.players as Record<string, unknown>)) {
      // 0 is absence (see withPlanetRun), so only a real run is kept; a bogus entry is dropped.
      const n = normalizePlanetRun(run);
      if (n > 0) players[id] = n;
    }
    return { v: 1, players };
  } catch {
    return { v: 1, players: {} };
  }
};

/** This player's run (0..PLANET_RUN_CYCLE-1) out of the stored book. */
export const planetRunOf = (raw: string | null, playerId: string | null): number =>
  normalizePlanetRun(readPlanetRuns(raw).players[playerId ?? '']);

/** The stored book with this player's run set (0 removes the entry: bounded storage, nothing to prune). */
export const withPlanetRun = (raw: string | null, playerId: string | null, run: number): string => {
  const book = readPlanetRuns(raw);
  const id = playerId ?? '';
  const next = normalizePlanetRun(run);
  if (next === 0) delete book.players[id];
  else book.players[id] = next;
  return JSON.stringify(book);
};

/**
 * ONE WINDOW, CHOSEN ONCE (owner, 2026-11-13: "make sure it's not like both the planet view and board
 * view load up - only the correct one should show up ... if needs loading, do 1s fade in"). A loss or
 * a draw (and level 10's teaching win) knows its window at once. Any other win waits for the balance
 * AFTER this game's payout, then shows the one right window with a FINISH_FADE_MS fade, and never
 * switches afterwards.
 */
export type FinishPlan = { kind: 'now'; view: FinishWindow } | { kind: 'wait' };

export const finishWindowPlan = (m: { won: boolean; hasBoard: boolean; teach?: boolean }): FinishPlan => {
  if (!m.won) return { kind: 'now', view: 'board' };
  if (m.teach) return { kind: 'now', view: 'planet' };
  return { kind: 'wait' };
};

/** The shared inputs of the decision once a win's balance is in (see decideFinishWindow). */
export type FinishDecisionInput = { won: boolean; teach?: boolean; hasBoard: boolean; payout: number | null; remembered: number | null; planetRun?: number };

/** The balance AFTER this game's payout when the server answered, else the last one this device saw. */
const choiceInput = (m: FinishDecisionInput) => ({
  won: m.won,
  ...(m.teach ? { teach: true } : {}),
  hasBoard: m.hasBoard,
  balance: m.payout ?? m.remembered,
  ...(m.planetRun === undefined ? {} : { planetRun: m.planetRun }),
});

/**
 * The one decision once a win's balance is in: the balance AFTER this game's payout when the server
 * answered (`payout`), else the last one this device saw (`remembered`: offline, a failed or slow
 * settle, a game with no proof). A fresh guest with neither shows the board.
 */
export const decideFinishWindow = (m: FinishDecisionInput): FinishWindow =>
  finishChoice(choiceInput(m)).view;

/** The run to store for that same decision — the same pure rule, read from the same inputs. */
export const decidePlanetRunAfter = (m: FinishDecisionInput): number =>
  finishChoice(choiceInput(m)).planetRun;

/** A window that was ready within this long appears at once, with no fade (nothing had to load). */
export const FINISH_INSTANT_MS = 150;

/** The longest a win's window waits for the payout's balance before deciding from the last one known. */
export const FINISH_DECIDE_MS = 3_500;
/** The chosen window's arrival when it had to wait (the planet is drawn underneath the fade). */
export const FINISH_FADE_MS = 1_000;
