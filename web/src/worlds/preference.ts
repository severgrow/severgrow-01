import { browserStorage } from '../../../server/src/client.js';
import { FEATURES, IS_TEST_ROUTE } from '../channel.js';
import { worldPreference, type WorldId } from './worlds.js';
/** Experimental selector and saved choice are both gated, including when a preview is promoted. */
export const WORLD_SKINS_ENABLED = FEATURES.planet && IS_TEST_ROUTE;
let pref: ReturnType<typeof worldPreference> | null = null;
const preference = () => {
  if (!pref) {
    try { pref = worldPreference(browserStorage()); } catch { pref = worldPreference(null); }
  }
  return pref;
};
export const selectedWorld = (): WorldId => WORLD_SKINS_ENABLED ? preference().get() : 'futasaku';
export const selectWorld = (id: WorldId) => {
  if (!WORLD_SKINS_ENABLED || id === selectedWorld()) return;
  pref!.set(id);
  window.dispatchEvent(new CustomEvent('futasaku:world-style', { detail: pref!.get() }));
};
