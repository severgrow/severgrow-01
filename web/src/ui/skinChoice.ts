// WHICH TERRITORY SETS AND BACKGROUND THE BOARD WEARS (owner, 2026-11-14: "for now, only on test,
// make a switch inside the planet menu with colors"). The choice is this browser's own, kept in
// storage, and applied before a board is set up.
//
// THE ADMIN GATE (owner, 2026-11-16): "from the live version - except for my account RYK - hide the
// skins in the planet for now. make the new grass and tree default player skins and the new ash and
// volcano default opp skin, don't show the selection of skins or background in the planet for any
// players except for the admin account RYK." So the picker belongs to the admin alone, and every
// other player is pinned to the product skins in DEFAULT_SKIN (the background is NOT pinned: he
// asked only for default skins). "For now" is why it is ONE constant and ONE predicate: set
// `SKIN_PICKER_ADMIN` to null and the picker is everyone's again, with no other edit.
//
// THIS IS A COSMETIC GATE, NOT A SECURITY BOUNDARY. The nickname lives in this device's storage and
// a player who edits it (or renames themselves) can pass the gate. That is acceptable for hiding a
// cosmetic picker "for now"; nothing server-side is protected by it.
import { browserStorage } from '../../../server/src/client.js';
import { signedInNickname } from '../accounts/menu-key.js';
import { IS_TEST_ROUTE, STORAGE_PREFIX } from '../channel.js';
import { BACKGROUNDS, TERRITORY_IDS, setFaBackground, setFaSides } from './forestAsh.js';
import type { BackgroundId, TerritoryId } from './forestAsh.js';

/**
 * The one account allowed to see (and use) the skin and background picker: the owner's nickname,
 * untagged, exactly as `signedInNickname` reports it. `null` lifts the gate (see the header).
 */
export const SKIN_PICKER_ADMIN: string | null = 'RYK';

/** True only when the account signed in on THIS device is the gate's account. Cosmetic, see above. */
export const isSkinPickerAdmin = (): boolean =>
  SKIN_PICKER_ADMIN !== null && signedInNickname() === SKIN_PICKER_ADMIN;

/** The one predicate the picker's section and its server sync stand behind. */
export const skinPickerVisible = (): boolean => isSkinPickerAdmin();

// The switch's PLUMBING (storage read, server sync, mount) exists on /test/, on a local dev host,
// and for the admin anywhere — so RYK keeps the picker on the live site too. Seeing it is the
// narrower question above (`skinPickerVisible`); the /test/ route alone is not enough any more,
// which is what the old "/test/ only" comment here and in main.ts used to claim.
export const SKIN_SWITCH = IS_TEST_ROUTE
  || (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
  || isSkinPickerAdmin();

export type SkinChoice = { mine: TerritoryId; theirs: TerritoryId; background: BackgroundId };
/**
 * THE PRODUCT'S DEFAULT LOOK: your own tiles are Forest (the nine grass grounds, home-tree), your
 * opponent's are Ash (the nine ash grounds, home-volcano). Not a stored preference — this is where a
 * player who never chose, and every non-admin player, starts.
 */
export const DEFAULT_SKIN: SkinChoice = { mine: 'forest', theirs: 'ash', background: 'slate' };
const KEY = 'severgrow.board-skin.v1';

const valid = (c: Partial<SkinChoice> | null): SkinChoice => {
  const picked: SkinChoice = {
    mine: TERRITORY_IDS.includes(c?.mine as TerritoryId) ? c!.mine! : DEFAULT_SKIN.mine,
    theirs: TERRITORY_IDS.includes(c?.theirs as TerritoryId) ? c!.theirs! : DEFAULT_SKIN.theirs,
    background: BACKGROUNDS.some((b) => b.id === c?.background) ? c!.background! : DEFAULT_SKIN.background,
  };
  // EVERY PLAYER BUT THE ADMIN WEARS THE PRODUCT SKINS, whatever this device (or the server) stored
  // before the gate existed. The background is deliberately left as stored: the owner asked for
  // default skins only, and nobody but him can select either now.
  return isSkinPickerAdmin() ? picked : { ...picked, mine: DEFAULT_SKIN.mine, theirs: DEFAULT_SKIN.theirs };
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
 *
 * Without this, a slow GET could land after the tap and silently undo it: the board then wears the
 * old skin while the player, the stored choice and the server all say the new one. That is the
 * owner's "chosen forest, in game it gives me water" (reported 2026-11-15).
 */
let revision = 0;
const apply = () => { setFaSides(current.mine, current.theirs); setFaBackground(current.background); };
apply();

/**
 * ONE NOTIFICATION FOR EVERY CHANGE, whoever made it: a tap, an account read that agrees, or another
 * tab (below). The switch marks what it hears, so the chips can never show a skin the board is not
 * wearing.
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
  current = valid({ ...current, ...next });
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
 * Take the account's own saved skin from a read that STARTED at revision `issued`, and say whether
 * it moved the choice. Three answers are refused, each deliberately:
 *  - one from a player who is not the admin: the product defaults are theirs (the admin gate above),
 *    so a skin stored before the gate existed can never pull the board off Forest/Ash;
 *  - one that is out of date (`issued` is older than a choice made while it was in flight), so a
 *    slow read can never undo the player's tap;
 *  - one that is empty (`null`: an account that never chose). "No saved skin" is not "Forest": it
 *    leaves this browser's own choice exactly as it is instead of writing a default over it.
 */
export const adoptServerSkin = (saved: TerritoryId | null, issued: number): boolean => {
  if (!isSkinPickerAdmin()) return false;
  if (!saved || !TERRITORY_IDS.includes(saved)) return false;
  if (issued !== revision) return false;
  if (saved === current.mine) return false;
  chooseSkin({ mine: saved });
  return true;
};

/**
 * The territory set a claimed tile wears ON THE PLANET for THIS viewer (web/src/sphere/ground.ts
 * reads it as `claim.skin`, and `ownSkin` only fills a claim that has none). The admin sees every
 * owner's stored set, exactly as before. Every other player sees the product defaults, whatever any
 * account stored before the gate existed: their own tiles Forest (grass + tree), everyone else's Ash
 * (ash + volcano) — the same pair the board is pinned to above. `null` means "leave it to ground.ts"
 * and is what an admin with no stored set already got; a signed-out visitor's planet is untouched.
 */
export const planetSkinFor = (ownerId: string, me: string | null, stored: TerritoryId | null | undefined): TerritoryId | null => {
  if (isSkinPickerAdmin()) return stored ?? null;
  if (!me) return stored ?? null;
  return ownerId === me ? DEFAULT_SKIN.mine : DEFAULT_SKIN.theirs;
};
