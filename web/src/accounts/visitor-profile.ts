/**
 * ANOTHER PLAYER'S PROFILE, mapped from the server's closed allow-list
 * (`GET /v1/players/:id/profile` → `PublicPlayerProfile`).
 *
 * Pure, and deliberately the ONLY place the wire becomes panel facts. Its rules are the same as the
 * own-profile builder's (web/src/accounts/profile.ts): a value is a fact or it is `null`, which the
 * panel paints as the em dash. Nothing is guessed — a missing record is `null`, never zero, and a
 * non-numeric or negative count is dropped rather than printed. The type it returns (`VisitorFacts`)
 * has no Seeds and no offline field at all, so private facts cannot be rendered even by mistake.
 */
import type { PublicPlayerProfile } from '../../../server/src/protocol.js';
import type { Record3 } from '../logic/match-record.js';
import { TILE_COLOURS } from '../../../src/tile-colours.js';
import type { VisitorFacts } from './profile.js';
import type { OfflineFacts } from './profile.js';

/** A public count is a whole, non-negative number — otherwise it is not a fact. */
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/**
 * The palette crosses the wire as `hsl(<h> <s>% <l>%)` (src/tile-colours.ts), which is what the map
 * paints. A visitor's line names the colour the way a designer would: the same swatch, plus its hex.
 * Anything that is not that exact shape has no hex — the swatch still paints, the line stays quiet.
 */
export const hslToHex = (css: string): string | null => {
  const m = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(css.trim());
  if (!m) return null;
  const h = ((Number(m[1]) % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, Number(m[2]))) / 100;
  const l = Math.min(100, Math.max(0, Number(m[3]))) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
            : [c, 0, x];
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v + m0)) * 255).toString(16).padStart(2, '0');
  return `#${byte(r!)}${byte(g!)}${byte(b!)}`;
};

/** The online record, only when all three parts are real. */
const record = (value: unknown): Record3 | null => {
  if (typeof value !== 'object' || value === null) return null;
  const online = value as { games?: unknown; wins?: unknown; longestStreak?: unknown };
  const games = count(online.games);
  const wins = count(online.wins);
  const longestStreak = count(online.longestStreak);
  if (games === null || wins === null || longestStreak === null) return null;
  // Wins can never exceed games: a payload that says so is broken, not a new fact.
  if (wins > games) return null;
  return { games, wins, longestStreak };
};

/**
 * THE PUBLIC OFFLINE ROW: counts only. Each value is its own fact, so a server that sends the
 * games count but not a streak (an older shape) still paints the games and an em dash for the rest.
 * A non-numeric, negative or non-finite number is not a fact and becomes `null`.
 */
const offlineRow = (value: unknown): OfflineFacts | null => {
  if (typeof value !== 'object' || value === null) return null;
  const offline = value as { games?: unknown; hardStreak?: unknown; blitzStreak?: unknown };
  return {
    games: count(offline.games),
    hardStreak: count(offline.hardStreak),
    blitzStreak: count(offline.blitzStreak),
  };
};

/**
 * The stored country, or null. Two letters only — the same alphabet the flag renderer can draw —
 * and never the edge's own "unplaceable" markers. An unknown country renders NO flag.
 */
const storedCountry = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return code;
};

/**
 * `null` in, `null` out: the panel's honest loading/failed state. Profiles show the display name
 * without the account tag. The colour is resolved
 * from the one shared palette by `colourId` — the wire carries the slot, never a second copy of
 * the palette — so the visitor's swatch and hex are exactly the map's colour.
 */
/**
 * THE MAP ALREADY HAS THIS FACT (owner, 2026-11-20: a visitor profile could open with even the name
 * blank). A tile carries its owner's public name, level and the exact `hsl(...)` the map paints, so
 * the sheet can show them on the first frame. The palette still owns the swatch's name and hex:
 * matching the wire colour against `TILE_COLOURS` means no second colour system is invented. A colour
 * that is not one of the twenty (an older server's own ink) still paints and still gets a hex; its
 * name is left to the swatch's generic public label rather than guessed.
 */
export const visitorColour = (css: string | null | undefined): VisitorFacts['colour'] => {
  const shown = typeof css === 'string' ? css.trim() : '';
  if (!shown) return null;
  const palette = TILE_COLOURS.find((colour) => colour.css === shown);
  return { css: shown, name: palette?.name ?? 'Tile colour', hex: hslToHex(shown) };
};

export const visitorFacts = (profile: PublicPlayerProfile | null | undefined): VisitorFacts | null => {
  if (!profile) return null;
  const name = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  const colourId = count(profile.colourId);
  const palette = colourId === null ? null : TILE_COLOURS[colourId] ?? null;
  return {
    name: name || null,
    level: count(profile.level),
    tiles: count(profile.tiles),
    connectedTiles: count(profile.connectedTiles),
    colour: palette ? { css: palette.css, name: palette.name, hex: hslToHex(palette.css) } : null,
    online: record(profile.online),
    // The new public facts. Both are OPTIONAL on the wire (an older server omits them) and both
    // render honestly when absent: dashes for the row, nothing at all for the flag.
    offline: offlineRow(profile.offline),
    country: storedCountry(profile.country),
  };
};
