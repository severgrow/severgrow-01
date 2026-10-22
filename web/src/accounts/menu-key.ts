// The main menu's account key (LOG IN, or the player's name), painted in the menu's FIRST layout
// alongside the other keys (owner, 2026-10-22: it "loads longer than rest of the buttons - laggy
// feeling"). Everything here is synchronous and reads only this device: whether this build has
// accounts at all, the remembered answer to "is Google sign-in on?", and who is signed in. The
// accounts module (./mount.ts) still asks Supabase in the background and takes the key away if
// Google turns out to be off, so a dead key never stays up.
//
// Kept tiny on purpose: it rides in the main bundle, so it imports no network client.
import type { KeyValue } from '../../../server/src/client.js';
import { MENU, PROFILE } from '../../../src/strings.js';
import { taggedName } from '../../../src/player-tag.js';
import { readAccount } from './core.js';
import { duelApiUrl } from '../online/config.js';

/** The remembered answer to "is Google on?" ('1' / '0'), kept across visits. */
export const GOOGLE_ON_KEY = 'futasaku.auth.google-on.v1';
/** The online identity's storage key — the SAME string as IDENTITY_STORAGE_KEY (pinned by a test). */
export const IDENTITY_KEY = 'severgrow.duel.identity.v1';

/** True when the accounts module would ask about Google at all (mirrors its own guard). */
export const accountsConfigured = (c: { supabaseUrl: string | null | undefined; duelApi: boolean; flag: string | undefined }): boolean =>
  !!c.supabaseUrl && c.duelApi && c.flag !== 'off' && (c.flag === 'on' || c.supabaseUrl.startsWith('https://'));

/** The same check, from this build's own settings (the accounts module reads the same two). */
export const accountsConfiguredInThisBuild = (): boolean => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return accountsConfigured({ supabaseUrl: env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, ''), duelApi: !!duelApiUrl(), flag: env.VITE_ACCOUNTS });
};

/** The signed-in player's shown name, or null for a guest / nobody. */
const signedInName = (kv: KeyValue | null): string | null => {
  try {
    const raw = kv?.get(IDENTITY_KEY);
    const id = raw ? (JSON.parse(raw) as { playerId?: unknown; kind?: unknown; displayName?: unknown }) : null;
    if (!id || typeof id.playerId !== 'string' || id.kind !== 'account' || typeof id.displayName !== 'string' || !id.displayName) return null;
    if (readAccount(kv)?.playerId !== id.playerId) return null;
    return taggedName(id.displayName, id.playerId);
  } catch {
    return null;
  }
};

/** What the key should be right now, from this device alone. */
export const accountKeyNow = (kv: KeyValue | null, configured: boolean): { show: boolean; name: string | null } => {
  if (!configured) return { show: false, name: null };
  let known: string | null = null;
  try {
    known = kv?.get(GOOGLE_ON_KEY) ?? null;
  } catch {
    known = null;
  }
  // Unknown (a first visit) shows the key: the live build has Google on, and the background check
  // hides it again if not. Known-off never shows it.
  if (known === '0') return { show: false, name: null };
  return { show: true, name: signedInName(kv) };
};

/** LOG IN for a guest, the name for a signed-in player — the one way the key is ever painted. */
export const paintAccountKey = (btn: HTMLButtonElement, name: string | null): void => {
  btn.hidden = false;
  btn.textContent = name ?? MENU.login;
  // The spoken label carries the name, so a screen-reader user knows whose profile it opens.
  btn.setAttribute('aria-label', name ? PROFILE.open(name) : MENU.login);
  btn.title = name ? PROFILE.open(name) : MENU.login;
};

const localKv = (): KeyValue | null => {
  try {
    const ls = globalThis.localStorage;
    return ls ? { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) } : null;
  } catch {
    return null;
  }
};

/**
 * Called from the menu's synchronous layout. Paints the key until the accounts module owns it
 * (`data-owned`), and remembers a press made before that module arrived, which it then replays —
 * so a quick first tap is never lost.
 */
export const paintEarlyAccountKey = (btn: HTMLButtonElement | null, configured: boolean): void => {
  if (!btn || btn.dataset.owned === '1') return;
  const now = accountKeyNow(localKv(), configured);
  if (!now.show) return;
  paintAccountKey(btn, now.name);
  if (btn.dataset.early === '1') return;
  btn.dataset.early = '1';
  btn.addEventListener('click', () => {
    if (btn.dataset.owned !== '1') btn.dataset.earlyClick = '1';
  });
};
