// WHICH TERRITORY SETS AND BACKGROUND THE BOARD WEARS (owner, 2026-11-14: "for now, only on test,
// make a switch inside the planet menu with colors"). The choice is this browser's own, kept in
// storage, and applied before a board is set up. Off /test/ (and off a local dev host) the stored
// choice is ignored, so the live site always shows the defaults: Forest against Ash, classic ground.
import { browserStorage } from '../../../server/src/client.js';
import { IS_TEST_ROUTE } from '../channel.js';
import { BACKGROUNDS, TERRITORY_IDS, setFaBackground, setFaSides } from './forestAsh.js';
import type { BackgroundId, TerritoryId } from './forestAsh.js';

export const SKIN_SWITCH = IS_TEST_ROUTE
  || (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

export type SkinChoice = { mine: TerritoryId; theirs: TerritoryId; background: BackgroundId };
export const DEFAULT_SKIN: SkinChoice = { mine: 'forest', theirs: 'ash', background: 'classic' };
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
const apply = () => { setFaSides(current.mine, current.theirs); setFaBackground(current.background); };
apply();

export const skinChoice = (): SkinChoice => current;
/** Store and apply a new choice; the next board set up (the next match) wears it. */
export const chooseSkin = (next: Partial<SkinChoice>): SkinChoice => {
  current = valid({ ...current, ...next });
  apply();
  try { browserStorage()?.set(KEY, JSON.stringify(current)); } catch { /* private mode: this visit only */ }
  return current;
};
