// WHICH TERRITORY SETS AND BACKGROUND THE BOARD WEARS (owner, 2026-11-14: "for now, only on test,
// make a switch inside the planet menu with colors"). The choice is this browser's own, kept in
// storage, and applied before a board is set up. Off /test/ (and off a local dev host) the stored
// choice is ignored, so the live site uses Forest against Ash on the quiet Cinder ground.
import { browserStorage } from '../../../server/src/client.js';
import { IS_TEST_ROUTE, STORAGE_PREFIX } from '../channel.js';
import { BACKGROUNDS, TERRITORY_IDS, setFaBackground, setFaSides } from './forestAsh.js';
import type { BackgroundId, TerritoryId } from './forestAsh.js';

export const SKIN_SWITCH = IS_TEST_ROUTE
  || (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

export type SkinChoice = { mine: TerritoryId; theirs: TerritoryId; background: BackgroundId };
export const DEFAULT_SKIN: SkinChoice = { mine: 'forest', theirs: 'ash', background: 'slate' };
const KEY = 'severgrow.board-skin.v1';

const valid = (c: Partial<SkinChoice> | null): SkinChoice => ({
  mine: TERRITORY_IDS.includes(c?.mine as TerritoryId) ? c!.mine! : DEFAULT_SKIN.mine,
  theirs: TERRITORY_IDS.includes(c?.theirs as TerritoryId) ? c!.theirs! : DEFAULT_SKIN.theirs,
  background: BACKGROUNDS.some((b) => b.id === c?.background) ? c!.background! : DEFAULT_SKIN.background,
});

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
 * it moved the choice. Two answers are refused, both deliberately:
 *  - one that is out of date (`issued` is older than a choice made while it was in flight), so a
 *    slow read can never undo the player's tap;
 *  - one that is empty (`null`: an account that never chose). "No saved skin" is not "Forest": it
 *    leaves this browser's own choice exactly as it is instead of writing a default over it.
 */
export const adoptServerSkin = (saved: TerritoryId | null, issued: number): boolean => {
  if (!saved || !TERRITORY_IDS.includes(saved)) return false;
  if (issued !== revision) return false;
  if (saved === current.mine) return false;
  chooseSkin({ mine: saved });
  return true;
};
