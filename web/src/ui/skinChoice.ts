// WHICH SKIN THE PLANET AND THE BOARD WEAR (owner, 2026-11-14; two-axis model, 2026-11-20).
//
// TWO APPEARANCES, BECAUSE THEY ARE NOT THE SAME ANY MORE:
//   PLANET  `mine` / `theirs`      a real skin, or 'colour' (Slab: the plain owner colour).
//   MATCH   `mineGame` / `theirsGame` a real skin ONLY — the board has no plain-colour tiles.
// A real skin sets BOTH at once in one tap ("choosing the real skins … we change it for both planet
// and game"). 'Colour' sets the planet only, so it needs a game skin next; if the player has never
// chosen one, `mineGame` is null and the picker makes that second step unmissable rather than
// silently choosing for them (online/skin-switch.ts). Painting still gets a valid board skin through
// `gameSkinFor`, so a stored or half-made choice can never crash a match.
//
// ONE PLACE COERCES. `normaliseSkinChoice` is the ONLY code allowed to decide what the model means:
// a real planet skin with no match value follows the planet (so old saves and one-tap choices paint
// both), 'colour' keeps a valid game choice (or null), and every unknown/corrupt value falls back
// without throwing. `chooseSkin`, the stored-value read, another tab's write and the server's answer
// all go through it.
//
// THE GATE (owner, 2026-11-20): "unlock the skins to all players" — SIGNED-IN ACCOUNTS ONLY. A guest
// is pinned to the product skins and never sees a real-skin tile; they KEEP the twenty owner colours
// (Colour is not a skin). This is a cosmetic gate, not a security boundary, and it is ONE predicate
// (`skinPickerVisible`) so it can be narrowed again in one line.
//
// THIS MODULE IS A COSMETIC CHOICE, NOT A RULE. src/engine/ is untouched by it.
import { browserStorage } from '../../../server/src/client.js';
import { signedInNickname } from '../accounts/menu-key.js';
import { STORAGE_PREFIX } from '../channel.js';
import { BACKGROUNDS, TERRITORY_IDS, setFaBackground, setFaSides } from './forestAsh.js';
import type { BackgroundId, TerritoryId } from './forestAsh.js';
import {
  SKIN_COLOUR,
  atlasSkinFor,
  isPlanetSkin,
  isSkinId,
} from './skin-catalogue.js';
import type { GameSkin, PlanetSkin } from './skin-catalogue.js';
import { setTileSkins } from './tileSkins.js';

/**
 * The one account the gate can be narrowed back to: the owner's nickname, untagged, exactly as
 * `signedInNickname` reports it. Kept even while the picker is open to every account, so narrowing
 * is a one-line edit in `skinPickerVisible` (and nowhere else).
 */
export const SKIN_PICKER_ADMIN: string | null = 'RYK';

/** True when this device is signed in as the owner's account (used only by a narrowed gate). */
export const isSkinPickerAdmin = (): boolean =>
  SKIN_PICKER_ADMIN !== null && signedInNickname() === SKIN_PICKER_ADMIN;

/**
 * The gate the picker's section and its server sync stand behind: a SIGNED-IN ACCOUNT, not a guest.
 * To narrow it back to the owner, replace the body with `signedInNickname() === SKIN_PICKER_ADMIN`.
 */
export const skinPickerVisible = (): boolean => signedInNickname() !== null;

// The switch's PLUMBING (storage read, server sync, mount) exists everywhere the product UI does.
// Seeing and using the pane is the ACCOUNT question above; a guest gets the Colour tile and a
// "sign in" line, never a real skin. Kept as an exported constant because other modules read it.
export const SKIN_SWITCH = true;

/** The stored choice's shape. `background` is the board backdrop, deliberately independent. */
export type SkinChoice = {
  /** The planet appearance. */
  mine: PlanetSkin;
  theirs: PlanetSkin;
  /** The match appearance; null only while a 'colour' planet has no real skin chosen yet. */
  mineGame: GameSkin | null;
  theirsGame: GameSkin | null;
  background: BackgroundId;
};

/**
 * THE PRODUCT'S DEFAULT LOOK, unchanged (owner, 2026-11-16): your own tiles are Forest (the nine
 * grass grounds, home-tree), your opponent's are Ash (the nine ash grounds, home-volcano). Both
 * appearances are Forest/Ash, so the default BOARD is exactly the board this game shipped.
 */
export const DEFAULT_SKIN: SkinChoice = {
  mine: 'forest',
  theirs: 'ash',
  mineGame: 'forest',
  theirsGame: 'ash',
  background: 'slate',
};

const KEY = 'severgrow.board-skin.v1';

const planet = (value: unknown, fallback: PlanetSkin): PlanetSkin =>
  isPlanetSkin(value) ? value : fallback;

const game = (value: unknown): GameSkin | null => (isSkinId(value) ? value : null);

/**
 * THE INVARIANT, IN ONE PLACE. Given a (possibly partial, possibly corrupt) choice and the value it
 * is being applied over, return the one valid shape:
 *  - a real planet skin with no valid match value follows the planet (old saves; one-tap choices);
 *  - an explicit valid game value is kept, so a match can diverge from the planet;
 *  - 'colour' keeps a valid game skin, otherwise null; an explicit null clears it (the picker's
 *    required second step).
 *  - invalid planet/game/background values fall back to `base`, never throw.
 * Pure: no storage, no clock, no gate.
 */
export const normaliseSkinChoice = (
  input: Partial<SkinChoice> | null | undefined,
  base: SkinChoice = DEFAULT_SKIN,
): SkinChoice => {
  const side = (
    planetValue: unknown,
    gameValue: unknown,
    basePlanet: PlanetSkin,
    baseGame: GameSkin | null,
  ): { planet: PlanetSkin; game: GameSkin | null } => {
    const p = planet(planetValue, basePlanet);
    if (p !== SKIN_COLOUR) {
      // A real planet skin is a real match skin too: a missing/invalid game value (an old save, a
      // corrupt one) follows the planet. An EXPLICIT valid game value is kept, so the match row can
      // diverge after the one-tap choice (the owner's "another one is chosen for the game only").
      return { planet: p, game: game(gameValue) ?? p };
    }
    // 'colour' is planet-only: keep the game appearance the player already has (or the one this
    // same call supplies). An EXPLICIT null clears it — that is how choosing Colour asks for a
    // fresh match skin instead of silently inheriting the previous one.
    if (gameValue === null) return { planet: p, game: null };
    return { planet: p, game: game(gameValue) ?? game(baseGame) };
  };
  const mine = side(input?.mine, input?.mineGame, base.mine, base.mineGame);
  const theirs = side(input?.theirs, input?.theirsGame, base.theirs, base.theirsGame);
  const background = BACKGROUNDS.some((b) => b.id === input?.background) ? input!.background! : base.background;
  return {
    mine: mine.planet,
    theirs: theirs.planet,
    mineGame: mine.game,
    theirsGame: theirs.game,
    background,
  };
};

/**
 * The board skin the painter must use for a seat. A 'colour' planet with no game skin chosen yet
 * resolves to the product fallback, so a half-made choice paints a real board instead of crashing.
 */
export const gameSkinFor = (choice: SkinChoice, seat: 'mine' | 'theirs'): GameSkin =>
  (seat === 'mine' ? choice.mineGame : choice.theirsGame) ?? (seat === 'mine' ? 'forest' : 'ash');

/** True while a chosen 'colour' planet still has no match skin (the picker's required second step). */
export const awaitingGameSkin = (choice: SkinChoice): boolean =>
  (choice.mine === SKIN_COLOUR && choice.mineGame === null) ||
  (choice.theirs === SKIN_COLOUR && choice.theirsGame === null);

/**
 * A guest is pinned to the product SKINS, exactly as before the unlock, but keeps the plain Colour
 * appearance: Colour is not a skin, and the twenty colours were always everyone's. The board
 * BACKGROUND is left as stored too (the owner asked for default skins only, never for the backdrop).
 * Signed-in accounts keep whatever they chose.
 */
const valid = (input: Partial<SkinChoice> | null | undefined): SkinChoice => {
  const picked = normaliseSkinChoice(input);
  return skinPickerVisible()
    ? picked
    : {
        ...picked,
        mine: picked.mine === SKIN_COLOUR ? SKIN_COLOUR : 'forest',
        theirs: picked.theirs === SKIN_COLOUR ? SKIN_COLOUR : 'ash',
        mineGame: 'forest',
        theirsGame: 'ash',
      };
};

let current: SkinChoice = DEFAULT_SKIN;
if (SKIN_SWITCH) {
  try { current = valid(JSON.parse(browserStorage()?.get(KEY) ?? 'null') as Partial<SkinChoice> | null); }
  catch { current = DEFAULT_SKIN; }
}

/**
 * Bumped by every DELIBERATE choice (a tap, and the account read that agrees with it). A server read
 * records the number it STARTED at, so an answer that was already on its way when the player chose
 * is recognisable as out of date and is dropped rather than written back (adoptServerSkin).
 */
let revision = 0;

/**
 * The board's two sides, from the MATCH appearance (never the planet's 'colour').
 *
 * THE MERGE'S ONE SEAM. The four atlas sets are pictures in the territory painter's own atlas
 * (`setFaSides`); the six recipes are painted by the tile-skin path (`setTileSkins`,
 * ui/tileSkins.ts). One side wears one of the two, so a recipe id can never reach an atlas that
 * has no cell for it, and every one of the ten choices paints something real.
 */
const apply = () => {
  const mine = gameSkinFor(current, 'mine');
  const theirs = gameSkinFor(current, 'theirs');
  setFaSides(atlasSkinFor(mine, 'forest'), atlasSkinFor(theirs, 'ash'));
  setTileSkins(mine, theirs);
  setFaBackground(current.background);
};
apply();

/**
 * ONE NOTIFICATION FOR EVERY CHANGE, whoever made it: a tap, an account read that agrees, or another
 * tab. The pane marks what it hears, so it can never show a skin the board is not wearing.
 */
type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();
const announce = () => {
  for (const listener of listeners) {
    try { listener(); } catch { /* a pane repaint must never break the choice */ }
  }
};
export const onSkinChoice = (listener: ChangeListener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const skinChoice = (): SkinChoice => current;

/** The number a read must quote back to adopt its answer (see adoptServerSkin). */
export const skinRevision = (): number => revision;

/** Store and apply a new choice; the next board set up (the next match) wears it. */
export const chooseSkin = (next: Partial<SkinChoice>): SkinChoice => {
  // A REAL SKIN IS ONE TAP FOR BOTH APPEARANCES (owner, 2026-11-20). This is the intent half of
  // the rule; `normaliseSkinChoice` is the validity half. A call that names a real planet skin and
  // NO match skin must not keep the previous match skin — unless the same call names a match skin
  // explicitly (a restore of the whole choice, or the picker's match row).
  const merged: Partial<SkinChoice> = { ...current, ...next };
  if (next.mine !== undefined && next.mineGame === undefined && isPlanetSkin(next.mine) && next.mine !== SKIN_COLOUR) merged.mineGame = next.mine;
  if (next.theirs !== undefined && next.theirsGame === undefined && isPlanetSkin(next.theirs) && next.theirs !== SKIN_COLOUR) merged.theirsGame = next.theirs;
  current = valid(merged);
  revision++;
  apply();
  try { browserStorage()?.set(KEY, JSON.stringify(current)); } catch { /* private mode: this visit only */ }
  announce();
  return current;
};

/**
 * ANOTHER TAB'S CHOICE IS THIS TAB'S CHOICE. Storage is shared but module state is not, so a second
 * tab can change the skin while this one is open; without this, this tab would keep wearing (and
 * drawing) its own old value for the rest of the visit. The browser only fires `storage` in the
 * OTHER tabs, so this never echoes a write back. Matching the exact prefixed key keeps the
 * channels apart: `main2:` and `futa05-test:` are different lines on one origin.
 */
if (SKIN_SWITCH && typeof window !== 'undefined') {
  const sharedKey = `${STORAGE_PREFIX}${KEY}`;
  window.addEventListener('storage', (event) => {
    if (event.key !== sharedKey) return;
    try { current = event.newValue === null ? DEFAULT_SKIN : valid(JSON.parse(event.newValue) as Partial<SkinChoice> | null); }
    catch { return; /* a corrupt write is not a choice */ }
    revision++;
    apply();
    announce();
  });
}

/**
 * Take the account's own saved skin (the four-id column the server has today) from a read that
 * STARTED at revision `issued`, and say whether it moved the choice. Three answers are refused, each
 * deliberately:
 *  - one from a guest: the product defaults are theirs (the gate above);
 *  - one that is out of date (`issued` is older than a choice made while it was in flight), so a
 *    slow read can never undo the player's tap;
 *  - one for a player whose local choice the server cannot represent (the six new skins, or Slab):
 *    adopting the server's older four-id answer would silently undo it. The server-side follow-up
 *    (widen the `skin` column) is recorded in docs/SKINS.md.
 */
export const adoptServerSkin = (saved: TerritoryId | null, issued: number): boolean => {
  if (!skinPickerVisible()) return false;
  if (!saved || !TERRITORY_IDS.includes(saved)) return false;
  if (issued !== revision) return false;
  // The server can only express the four atlas ids. A local six-id skin (or Slab) must not be
  // overwritten by an older answer the server happened to hold.
  if (!(TERRITORY_IDS as readonly string[]).includes(current.mine)) return false;
  if (saved === current.mine) return false;
  chooseSkin({ mine: saved });
  return true;
};

/**
 * The territory set a claimed tile wears ON THE PLANET, for every viewer (web/src/sphere/ground.ts
 * reads it as `claim.skin`). Each player's land wears the skin THAT player chose, and plain colour
 * when they chose none — for the admin, a signed-in player and a signed-out visitor alike.
 *
 * The server's public `skin` field still carries only the four atlas ids today, so a planet tile
 * resolves only those; a local six-id choice is kept in the model and previewed by the picker, and
 * the recipe branch extends this contract (docs/SKINS.md).
 */
export const planetSkinFor = (_ownerId: string, _me: string | null, stored: TerritoryId | null | undefined): TerritoryId | null =>
  stored && TERRITORY_IDS.includes(stored) ? stored : null;

/**
 * The viewer's OWN land, filled from this device when the server has no choice for it yet: only for
 * a viewer who can pick, and only for a set the planet renderer can paint today. Everyone else's own
 * land is never filled with the board's default: unchosen land is plain colour.
 */
export const planetOwnSkin = (): TerritoryId | undefined => {
  if (!skinPickerVisible()) return undefined;
  const mine = current.mine;
  return (TERRITORY_IDS as readonly string[]).includes(mine) ? (mine as TerritoryId) : undefined;
};

/**
 * The set one claimed tile wears on the planet. The viewer's OWN land wears the pick on this device,
 * so a tap on the planet's skin pane shows on the planet at once; every other tile follows
 * `planetSkinFor`.
 */
export const planetClaimSkin = (ownerId: string, me: string | null, stored: TerritoryId | null | undefined): TerritoryId | null => {
  const own = me !== null && ownerId === me ? planetOwnSkin() : undefined;
  return own ?? planetSkinFor(ownerId, me, stored);
};
