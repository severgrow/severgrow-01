import { mountSheetViewport } from '../ui/sheet-viewport.js';
import { authJson } from './email-auth.js';
import { mountEmailPanel } from './email-panel.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';
// Accounts — mounted once from main.ts (docs/ACCOUNTS.md and docs/EMAIL-ACCOUNTS.md). Email codes and Google
// where it helps: a one-time welcome before the first online visit, a line in the online hub for
// guests, and an Account block in Settings (sign out, delete my account). Offline play never sees
// any of it. Nothing shows until the Google provider is switched on in Supabase, so this is safe to
// ship before the dashboard is set up. A failure here can never break the game (every path is caught).
import { ACCOUNT, PRIVACY } from '../../../src/strings.js';
import { taggedName } from '../../../src/player-tag.js';
import { DUEL_CLIENT_VERSION, browserStorage } from '../../../server/src/client.js';
import type { KeyValue } from '../../../server/src/client.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/index.js';
import { duelApiUrl, duelRegion } from '../online/config.js';
import { IDENTITY_STORAGE_KEY } from '../online/identity.js';
import { DISPLAY_NAME_MAX } from '../../../server/src/display-name.js';
import { cachedTerritory, readTerritory } from '../online/territory-cache.js';
import { glassBaseCss } from '../player/glass-surface.js';
import { installProfileUI, profileColour } from './profile.js';
import { EMAIL_ON_KEY, GOOGLE_ON_KEY, paintAccountKey } from './menu-key.js';
import type { ProfileFacts } from './profile.js';
import { PLAYER_PROFILE_EVENT } from './profile-request.js';
import type { PlayerProfileRequest } from './profile-request.js';
import { visitorFacts } from './visitor-profile.js';
import type { HeadToHead, PublicPlayerProfile } from '../../../server/src/protocol.js';
import { formatRivalryLine } from '../logic/rivalry.js';
import type { VisitorFacts } from './profile.js';
import { STATS_KEY, parseStats } from '../logic/stats.js';
import { accountRecord, offlineRecord } from '../logic/match-record.js';
import { DEVICE_KEY, deviceIdFrom, matchesWonEver, newDeviceId, offlineCounters } from '../logic/offline-sync.js';
import { browserCountry } from '../logic/country.js';
import type { OfflineSummary } from '../../../server/src/protocol.js';
import {
  WELCOME_KEY,
  authorizeUrl,
  challengeFor,
  cleanSearch,
  clearAccount,
  googleEnabled,
  identityFromSignIn,
  isCallbackHash,
  newVerifier,
  readAccount,
  signInMessage,
  readCallback,
  redirectTarget,
  savePending,
  setFlash,
  setNicknamePrompt,
  takeFlash,
  pendingNicknamePrompt,
  clearNicknamePrompt,
  takePending,
  writeAccount,
} from './core.js';
import type { ReturnTo } from './core.js';

type Identity = { token: string; playerId: string; displayName: string | null; kind: 'guest' | 'account' };

const env = (): Record<string, string | undefined> => (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const supabase = (): { url: string; key: string } | null => {
  const url = env().VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env().VITE_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
};

const G_LOGO = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const CSS = `
${glassBaseCss('.acct-glass')}
.acct-glass { font-size:.8125rem; z-index:95; left:50%; top:50%; transform:translate(-50%,-50%); width:min(400px, calc(100vw - 32px));
  max-height:calc(100dvh - 32px); overflow:auto; padding:18px 16px 16px; background:rgba(8,10,10,.88); display:flex; flex-direction:column; gap:12px; }
.acct-glass[hidden], .acct-scrim[hidden], .acct-toast[hidden], [data-acct][hidden] { display:none !important; }
.acct-scrim { position:fixed; inset:0; z-index:94; background:rgba(4,6,5,.5); }
.acct-glass h3 { margin:6px 0 0; font:700 14px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#e2d4b4; }
.acct-glass h2 { margin:0; font:700 18px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#f6ecd8; }
.acct-glass p, .acct-glass li { margin:0; color:#e2d4b4; line-height:1.45; }
.acct-glass ul { margin:0; padding-left:18px; display:grid; gap:6px; }
.acct-small { font-size:12px; color:#b7a98a !important; }
.acct-email-form { display:flex; flex-direction:column; gap:12px; }
.acct-email-form input { min-height:48px; width:100%; border:1px solid rgba(214,204,177,.28); border-radius:8px; padding:10px 12px; background:rgba(255,255,255,.04); color:#f0e9dc; font:inherit; font-size:max(16px,1rem); }
.acct-email-form input:focus-visible { outline:2px solid #f0e9dc; outline-offset:2px; }
.acct-email-form .acct-actions { justify-content:space-between; gap:8px; }
.acct-email-form label { color:var(--instrument-muted); }
.acct-actions { display:flex; flex-direction:column; gap:8px; }
.acct-actions.row { flex-direction:row; justify-content:flex-end; flex-wrap:wrap; }
.acct-btn { min-height:44px; padding:0 16px; border-radius:999px; cursor:pointer; border:1px solid rgba(214,204,177,.28);
  background:rgba(255,255,255,.04); color:#f0e9dc; font:700 .875rem/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.06em; }
.acct-btn.danger { border-color:rgba(224,115,92,.6); color:#f2b3a3; }
.acct-btn.danger.solid { background:#c4553f; border-color:#c4553f; color:#fff6ef; }
.acct-btn:disabled { opacity:.55; cursor:default; }
/* Google's own dark sign-in button: #131314, grey outline, the four-colour G (branding guidelines). */
.acct-google { display:inline-flex; align-items:center; justify-content:center; gap:10px; min-height:48px; padding:0 18px; border-radius:999px;
  background:#131314; border:1px solid #8e918f; color:#e3e3e3; cursor:pointer; font:500 15px/1 Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing:.01em; }
.acct-google:hover { background:#1d1d1f; }
.acct-google:disabled { opacity:.6; cursor:default; }
.acct-google:focus-visible, .acct-btn:focus-visible, .acct-linkbtn:focus-visible { outline:2px solid #f0e9dc; outline-offset:2px; }
.acct-linkbtn { align-self:center; min-height:44px; padding:0 8px; border:0; background:none; color:#b7a98a; font:inherit; font-size:.8125rem; text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
.acct-status { min-height:1.3em; font-size:.8125rem; color:#c9e4a8 !important; }
.acct-status[data-tone='bad'] { color:#e0735c !important; }
.acct-status:empty { display:none; }
#acct-hub { display:flex; flex-direction:column; gap:10px; align-items:stretch; text-align:center; }
#acct-hub p { margin:0; }
#acct-settings { display:flex; flex-direction:column; gap:8px; margin:4px 0 10px; }
#acct-settings .acct-who { margin:0; font-weight:700; color:var(--ink, #f0e9dc); }
#acct-settings p { margin:0; }
#acct-settings .acct-actions.row { justify-content:flex-start; }
.acct-toast { position:fixed; z-index:96; left:50%; top:calc(env(safe-area-inset-top, 0px) + 14px); transform:translateX(-50%);
  width:min(420px, calc(100vw - 32px)); box-sizing:border-box; padding:12px 14px; border-radius:14px; background:rgba(8,10,10,.92);
  border:1px solid rgba(214,204,177,.25); color:#f0e9dc; font:400 14px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); text-align:center; }
.acct-toast[data-tone='bad'] { border-color:rgba(224,115,92,.6); }
/* The nickname field: dark glass, NO border contour — the fill alone marks it, cream text on focus. */
.acct-input { min-height:44px; width:100%; box-sizing:border-box; padding:0 14px; border:0; border-radius:12px;
  background:rgba(255,255,255,.07); color:#f6ecd8; font:600 max(16px, 1rem)/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); }
.acct-input::placeholder { color:#8f866f; font-weight:400; }
.acct-input:focus-visible { outline:2px solid #f0e9dc; outline-offset:1px; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const button = (cls: string, text: string, key?: string): HTMLButtonElement => {
  const b = el('button', cls, text);
  b.type = 'button';
  if (key) b.dataset.acct = key;
  return b;
};
const googleButton = (key: string): HTMLButtonElement => {
  const b = button('acct-google', '', key);
  b.innerHTML = `${G_LOGO}<span></span>`;
  b.querySelector('span')!.textContent = ACCOUNT.continueGoogle;
  return b;
};

const sheet = (id: string, label: string) => {
  const scrim = el('div', 'acct-scrim');
  const panel = el('section', 'acct-glass');
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', label);
  scrim.hidden = panel.hidden = true;
  document.body.append(scrim, panel);
  let onClose: (() => void) | null = null;
  // A LOCKED sheet asks for something that must be given (a new account's name): the scrim and
  // Escape do not dismiss it; only the sheet's own action closes it.
  let locked = false;
  let trigger: HTMLElement | null = null;
  const viewport = mountSheetViewport(panel);
  const close = () => {
    if (panel.hidden) return;
    locked = false;
    scrim.hidden = true;
    exitSurface(panel, { onDone: () => { panel.hidden = true; } });
    const f = onClose;
    onClose = null;
    trigger?.focus({ preventScroll: true });
    f?.();
  };
  scrim.addEventListener('click', () => { if (!locked) close(); });
  panel.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.stopPropagation(); if (!locked) close(); }
    if (e.key === 'Tab') {
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  return {
    panel,
    open: (then?: () => void, options: { locked?: boolean } = {}) => {
      trigger = document.activeElement as HTMLElement | null;
      onClose = then ?? null;
      locked = options.locked === true;
      scrim.hidden = panel.hidden = false;
      viewport();
      enterSurface(panel);
      (panel.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    },
    close,
  };
};

const readIdentity = (kv: KeyValue | null): Identity | null => {
  try {
    const raw = kv?.get(IDENTITY_STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Identity>) : null;
    return v && typeof v.token === 'string' && typeof v.playerId === 'string' ? (v as Identity) : null;
  } catch {
    return null;
  }
};
const writeIdentity = (kv: KeyValue | null, id: Identity): boolean => {
  try {
    if (!kv) return false;
    kv.set(IDENTITY_STORAGE_KEY, JSON.stringify(id));
    return true;
  } catch {
    return false;
  }
};

const apiUrl = (path: string): string | null => {
  const api = duelApiUrl();
  if (!api) return null;
  const region = duelRegion();
  return `${api}${path}${region ? `?forceFunctionRegion=${encodeURIComponent(region)}` : ''}`;
};
const apiRequest = async (method: 'POST' | 'PATCH', path: string, body: unknown, token: string | null): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> => {
  const url = apiUrl(path);
  if (!url) return { ok: false, status: 0, json: {} };
  return authJson(url, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-futasaku-client-version': DUEL_CLIENT_VERSION,
      'x-futasaku-rules-version': CURRENT_RULES_VERSION,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
};
const apiPost = (path: string, body: unknown, token: string | null) => apiRequest('POST', path, body, token);
/** Does this identity have any online match at all? null when it cannot be told (offline, error). */
const hasMatches = async (token: string): Promise<boolean | null> => {
  const url = apiUrl('/v1/players/me/matches');
  if (!url) return null;
  try {
    const res = await authJson(url, { headers: { accept: 'application/json', authorization: `Bearer ${token}`, 'x-futasaku-client-version': DUEL_CLIENT_VERSION, 'x-futasaku-rules-version': CURRENT_RULES_VERSION } });
    if (!res.ok) return null;
    const body = res.json as { matches?: unknown };
    return Array.isArray(body.matches) ? body.matches.length > 0 : null;
  } catch {
    return null;
  }
};
/** PATCH /v1/players/me chooses a display name (server/src/fetch-app.ts). */
const apiPatch = (path: string, body: unknown, token: string | null) => apiRequest('PATCH', path, body, token);

const SETTINGS_CACHE = 'futasaku.auth.google.v1';
/**
 * Is "Continue with Google" switched on in the Supabase dashboard? The answer is REMEMBERED on the
 * device (GOOGLE_ON_KEY) so the menu can paint its account key with the other keys on the next
 * visit (./menu-key.ts), and it is re-asked in the background once per session so a change in the
 * dashboard still reaches the device. Only a first visit waits for the network.
 */
const probeGoogle = async (settings: ReturnType<typeof authJson>, kv: KeyValue | null): Promise<boolean> => {
  let askedThisSession = false;
  try {
    askedThisSession = sessionStorage.getItem(SETTINGS_CACHE) !== null;
  } catch {
    /* no session storage */
  }
  const ask = async (): Promise<boolean | null> => {
    try {
      const res = await settings;
      if (!res.ok) return null;
      const on = googleEnabled(res.json);
      try {
        sessionStorage.setItem(SETTINGS_CACHE, on ? '1' : '0');
        kv?.set(GOOGLE_ON_KEY, on ? '1' : '0');
      } catch {
        /* fine */
      }
      return on;
    } catch {
      return null;
    }
  };
  let known: string | null = null;
  try {
    known = kv?.get(GOOGLE_ON_KEY) ?? null;
  } catch {
    known = null;
  }
  if (known === '1' || known === '0') {
    if (!askedThisSession) void ask();
    return known === '1';
  }
  return (await ask()) ?? false;
};

let mounted = false;

export const mountAccounts = async (): Promise<void> => {
  if (mounted) return;
  mounted = true;
  const style = el('style');
  style.textContent = CSS;
  document.head.append(style);

  // ---- 0. the privacy policy at futasaku.com/#privacy (every build, even offline-only ones) ----
  const privacy = sheet('acct-privacy', PRIVACY.title);
  privacy.panel.append(el('h2', '', PRIVACY.title), el('p', 'acct-small', PRIVACY.updated), el('p', '', PRIVACY.intro));
  // The same document at its canonical, crawlable address (real HTML, no JavaScript needed). The
  // panel stays the offline-friendly view; this normal anchor just makes the two visibly one page.
  const canonicalPolicy = el('a', 'acct-linkbtn', 'futasaku.com/privacy');
  canonicalPolicy.href = './privacy/';
  canonicalPolicy.style.alignSelf = 'flex-start';
  canonicalPolicy.style.paddingLeft = '0';
  privacy.panel.append(canonicalPolicy);
  for (const s of PRIVACY.sections) {
    privacy.panel.append(el('h3', '', s.heading));
    const ul = el('ul');
    for (const line of s.lines) ul.append(el('li', '', line));
    privacy.panel.append(ul);
  }
  {
    const close = button('acct-btn', PRIVACY.close, 'privacy-close');
    const row = el('div', 'acct-actions row');
    row.append(close);
    privacy.panel.append(row);
    close.addEventListener('click', () => privacy.close());
  }
  const openPrivacy = () => {
    privacy.open(() => {
      if (location.hash === '#privacy') history.replaceState(history.state, '', location.pathname + location.search);
    });
    privacy.panel.scrollTop = 0;
  };
  const checkHash = () => {
    if (location.hash === '#privacy') openPrivacy();
  };
  checkHash();
  window.addEventListener('hashchange', checkHash);

  const supa = supabase();
  // Only a real project (https) is asked about Google; local/test builds point at a placeholder
  // address and would just log a failed request. VITE_ACCOUNTS=on forces it (the local e2e), =off hides it.
  const flag = env().VITE_ACCOUNTS;
  if (!supa || !duelApiUrl() || flag === 'off' || (flag !== 'on' && !supa.url.startsWith('https://'))) return;
  const kv = browserStorage();

  const toast = el('div', 'acct-toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  document.body.append(toast);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const say = (text: string, bad = false) => {
    toast.textContent = text;
    toast.dataset.tone = bad ? 'bad' : '';
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 5200);
  };

  const signedIn = (): { email: string | null; identity: Identity } | null => {
    const id = readIdentity(kv);
    const acct = readAccount(kv);
    if (!id || !acct || acct.playerId !== id.playerId || id.kind !== 'account') return null;
    return { email: acct.email, identity: id };
  };
  const shownName = (id: Identity | null): string | null => (id?.displayName ? taggedName(id.displayName, id.playerId) : null);

  /**
   * Back where the player started: wait (up to 10 s) for the menu button to be ready, then tap it.
   * On the product menu the duel lobby is MOVED behind the PLAY submenu (web/src/main.ts), so the
   * entry can be present but not visible; opening that doorway first is part of finding it. A
   * button that is merely hidden in a background screen is still waited for, never force-clicked.
   */
  const go = (returnTo: ReturnTo) => {
    const id = returnTo === 'online' ? 'menu-online' : returnTo === 'settings' ? 'menu-settings' : null;
    if (!id) return;
    const until = Date.now() + 10_000;
    const retry = () => {
      if (Date.now() < until) setTimeout(tryTap, 150);
    };
    const tryTap = () => {
      const b = document.getElementById(id);
      const menu = document.getElementById('menu');
      if (!b || b.hidden || !menu) return retry();
      if (b.offsetParent === null) {
        // Not on screen: the product menu hides the lobby behind the PLAY submenu — open it.
        const play = document.getElementById('menu-play');
        if (play && !play.hidden && play.offsetParent !== null) play.click();
        return retry();
      }
      b.click();
    };
    tryTap();
  };

  const completeSignIn = async (access: string, provider: 'google' | 'email', returnTo: ReturnTo, active:()=>boolean = ()=>true): Promise<void> => {
    const checkActive=()=>{if(!active())throw new Error('account-cancelled');};
    checkActive();
    let before = readIdentity(kv);
    // Establish the usual local player before an email upgrade. Even a lost FIRST response then
    // recovers the same player and its required name step; no second identity system is needed.
    if (provider === 'email' && !before) {
      const guest = await apiPost('/v1/guests', {}, null);
      checkActive();
      const identity = guest.ok ? identityFromSignIn(guest.json) : null;
      if (!identity || !writeIdentity(kv, identity)) throw new Error('account-storage-failed');
      before = identity;
    }
    const guestHadMatches = before ? await hasMatches(before.token) : null;
    checkActive();
    const res = await apiPost(`/v1/auth/${provider}`, {accessToken:access}, before?.token ?? null);
    checkActive();
    const identity = res.ok ? identityFromSignIn(res.json) : null;
    if (!identity) throw new Error(res.status === 401 ? 'account-session-expired' : 'account-exchange-failed');
    // Do not reload onto a forgotten identity if browser storage is blocked.
    if (!writeAccount(kv, {provider,email:typeof res.json.email === 'string'?res.json.email:null,playerId:identity.playerId}) || !writeIdentity(kv,identity))
      throw new Error('account-storage-failed');
    window.dispatchEvent(new Event('futasaku:identity'));
    kv?.set(WELCOME_KEY,'1');
    if (res.json.outcome === 'created' || res.json.outcome === 'linked' || (before?.kind === 'guest' && before.playerId === identity.playerId)) setNicknamePrompt(kv,identity.playerId);
    setFlash(kv,{kind:'signed-in',text:signInMessage({outcome:res.json.outcome,name:shownName(identity)??'',beforePlayerId:before?.playerId??null,afterPlayerId:identity.playerId,guestHadMatches}),returnTo});
    // Keep the verified session for a failed exchange's retry. Close it only after success.
    void authJson(`${supa.url}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:supa.key,authorization:`Bearer ${access}`}}).catch(()=>undefined);
    location.reload();
  };

  // ---- 1. coming back from Google (?code=…) ----
  const callback = readCallback(location.search, location.hash);
  if (callback) {
    const pending = takePending(kv, Date.now());
    // Drop the code from the address bar at once: it is single-use and must not be bookmarked or shared.
    history.replaceState(history.state, '', location.pathname + cleanSearch(location.search) + (isCallbackHash(location.hash) ? '' : location.hash));
    if (pending) {
      const fail = (text: string, why?: unknown) => {
        // The reason never reaches the player, so log it: without this, every sign-in failure looks
        // identical ("did not finish") and the stage that broke is unguessable. Console only, no
        // player-facing change.
        if (why !== undefined) console.warn('[FUTASAKU] Google sign-in failed:', why);
        setFlash(kv, { kind: 'failed', text, returnTo: pending.returnTo });
      };
      try {
        if ('error' in callback) fail(ACCOUNT.failed, { stage: 'callback', error: callback.error });
        else {
          const ex = await authJson(`${supa.url}/auth/v1/token?grant_type=pkce`, {
            method: 'POST',
            headers: { apikey: supa.key, 'content-type': 'application/json' },
            body: JSON.stringify({ auth_code: callback.code, code_verifier: pending.verifier }),
          });
          const session = ex.ok ? (ex.json as { access_token?: unknown }) : null;
          const access = typeof session?.access_token === 'string' ? session.access_token : null;
          if (!access) {
            const body = ex.ok ? null : String(ex.status);
            fail(ACCOUNT.failed, { stage: 'token-exchange', status: ex.status, body: body?.slice(0, 300) });
          } else {
            await completeSignIn(access, 'google', pending.returnTo);
            return;
          }
        }
      } catch {
        fail(navigator.onLine ? ACCOUNT.failed : ACCOUNT.offline);
      }
    }
  }

  // The main menu's account key (section 4b). Looked up once: the menu's first layout may already have
  // painted it from the device's memory (./menu-key.ts).
  const menuLogin = document.getElementById('menu-login') as HTMLButtonElement | null;
  // ---- 2. Supported sign-in methods (one shared settings request). ----
  const authSettings = authJson(`${supa.url}/auth/v1/settings`,{headers:{apikey:supa.key}});
  const [available, emailAvailable] = await Promise.all([
    probeGoogle(authSettings, kv),
    (async () => {
      try {
        const [server, settings] = await Promise.all([
          authJson(apiUrl('/v1/auth/methods')!),
          authSettings,
        ]);
        const external = settings.json.external as Record<string,unknown>|undefined;
        return server.ok && server.json.email === true && settings.ok && external?.email === true;
      } catch { return false; }
    })(),
  ]);
  try { kv?.set(EMAIL_ON_KEY,emailAvailable?'1':'0'); } catch { /* blocked storage */ }
  const flash = takeFlash(kv);
  if (flash) {
    say(flash.text, flash.kind === 'failed');
    setTimeout(() => go(flash.returnTo), 0);
  }
  if (!available && !emailAvailable && !signedIn()) {
    // The menu may have painted the key early from the device's memory (./menu-key.ts); Google is
    // off, so take it away rather than leave a key that cannot work.
    if (menuLogin) { menuLogin.hidden = true; menuLogin.dataset.owned = '1'; }
    return;
  }
  document.body.classList.add('acct-on');

  const start = async (returnTo: ReturnTo, btn: HTMLButtonElement | null, status: HTMLElement | null) => {
    if (!navigator.onLine) {
      if (status) {
        status.textContent = ACCOUNT.offline;
        status.dataset.tone = 'bad';
      } else say(ACCOUNT.offline, true);
      return;
    }
    const verifier = newVerifier();
    if (!savePending(kv, { verifier, returnTo, at: Date.now() })) {
      say(ACCOUNT.unavailable, true);
      return;
    }
    if (btn) btn.disabled = true;
    if (status) {
      status.textContent = ACCOUNT.opening;
      status.dataset.tone = '';
    }
    location.assign(authorizeUrl(supa.url, redirectTarget(location), await challengeFor(verifier)));
  };

  const emailSheet = sheet('acct-email', ACCOUNT.emailTitle);
  let emailReturnTo: ReturnTo = 'menu';
  const emailGoogle = googleButton('email-google'); emailGoogle.hidden=!available;
  emailGoogle.addEventListener('click',()=>void start(emailReturnTo,emailGoogle,null));
  const emailPanel = mountEmailPanel(emailSheet.panel,{supabase:supa,alternative:emailGoogle,
    complete:(access,active)=>completeSignIn(access,'email',emailReturnTo,active),close:()=>emailSheet.close()});
  const openEmail = (returnTo:ReturnTo) => {
    welcome.close(); emailReturnTo=returnTo; emailPanel.reset(); emailSheet.open(()=>emailPanel.cancel());
    emailSheet.panel.querySelector<HTMLInputElement>('input:not([hidden])')?.focus({preventScroll:true});
  };
  const emailButton = (returnTo:ReturnTo) => {
    const b=button('acct-btn',ACCOUNT.continueEmail,`${returnTo}-email`);
    b.hidden=!emailAvailable; b.addEventListener('click',()=>openEmail(returnTo)); return b;
  };

  const privacyLink = () => {
    const b = button('acct-linkbtn', ACCOUNT.privacy, 'privacy');
    b.addEventListener('click', () => {
      welcome.close();
      confirmSheet.close();
      openPrivacy();
    });
    return b;
  };

  // ---- 3. the one-time welcome before the first online visit ----
  const welcome = sheet('acct-welcome', ACCOUNT.welcomeTitle);
  const confirmSheet = sheet('acct-confirm', ACCOUNT.deleteTitle);
  // The nickname step reuses the same glass panel. Its contents are rebuilt each time it opens.
  const nickSheet = sheet('acct-nickname', ACCOUNT.nicknameTitle);
  {
    const status = el('p', 'acct-status');
    status.setAttribute('role', 'status');
    const g = googleButton('welcome-google'); g.hidden=!available;
    const guest = button('acct-btn', ACCOUNT.playAsGuest, 'welcome-guest');
    const actions = el('div', 'acct-actions');
    actions.append(emailButton('online'), g, guest);
    welcome.panel.append(el('h2', '', ACCOUNT.welcomeTitle), el('p', '', ACCOUNT.welcomeBody), actions, status, el('p', 'acct-small', ACCOUNT.welcomeSmall), privacyLink());
    g.addEventListener('click', () => void start('online', g, status));
    guest.addEventListener('click', () => {
      try {
        kv?.set(WELCOME_KEY, '1');
      } catch {
        /* fine */
      }
      welcome.close();
      document.getElementById('menu-online')?.click();
    });
  }
  const welcomeSeen = (): boolean => {
    try {
      return kv?.get(WELCOME_KEY) === '1';
    } catch {
      return true; // storage blocked: never nag
    }
  };
  document.getElementById('menu-online')?.addEventListener(
    'click',
    (e) => {
      if (signedIn() || welcomeSeen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      welcome.open();
    },
    true,
  );

  // ---- 4. a line for guests at the top of the online hub ----
  const hubHead = document.querySelector('#online-hub .online-head');
  const hub = el('div', 'online-card');
  hub.id = 'acct-hub';
  {
    const status = el('p', 'acct-status');
    status.setAttribute('role', 'status');
    const g = googleButton('hub-google'); g.hidden=!available;
    hub.append(el('p', 'muted small', ACCOUNT.hubGuest), emailButton('online'), g, status);
    g.addEventListener('click', () => void start('online', g, status));
    hubHead?.after(hub);
  }

  // ---- 4b. the main menu's account key: LOG IN when signed out, the player's NAME when signed in --
  // Owner brief (2026-10-21): the menu's bottom row is two keys — this one on the left, Settings on
  // the right. Signed out it reads LOG IN and starts the one Google flow (`start`, tagged 'menu', so
  // a fresh sign-in lands back on the menu). Signed in it reads the player's NAME and opens their
  // profile. It reuses `signedIn` and `shownName`: no second sign-in path, no second identity read.
  const profile = installProfileUI();

  /**
   * The profile's facts. Seeds and tiles are the SAME pair the Territory entry shows: the cache is
   * the lobby's own menu-show read, and an empty cache costs ONE more pair read, never a poll.
   *
   * The rest arrives after the sheet is already on screen (owner, 2026-11-01): the offline record is
   * this device's own counters to begin with, then the account's totals across every device; the
   * online record comes from the match list the server returns unbounded; the flag is derived on the
   * device and costs nothing. Nothing here polls, and every read paints as it lands.
   */
  /** This device's saved record (the game writes it under the same keys); blocked storage reads as none. */
  const readLocal = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeLocal = (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Blocked storage: the device simply stays anonymous and its offline games stay local.
    }
  };

  /** GET with the player's own token; null when the API is absent, offline or unhappy. */
  const apiGet = async (path: string, token: string): Promise<Record<string, unknown> | null> => {
    const url = apiUrl(path);
    if (!url) return null;
    try {
      const res = await authJson(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'x-futasaku-client-version': DUEL_CLIENT_VERSION,
          'x-futasaku-rules-version': CURRENT_RULES_VERSION,
        },
      });
      return res.ok ? (res.json as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  /** This browser's id for itself, minted once. Two devices on one account stay two rows. */
  const deviceId = (): string => {
    const known = deviceIdFrom(readLocal(DEVICE_KEY));
    if (known) return known;
    const fresh = newDeviceId(Math.random);
    writeLocal(DEVICE_KEY, fresh);
    return fresh;
  };

  /**
   * Send THIS device's totals and take back the account's aggregate. The POST both writes and reads,
   * so a device that has played offline needs one request, not two; the counters are cumulative and
   * the server never lowers them, which makes a repeat safe. A device that has played nothing only
   * reads, so it does not create an empty row.
   */
  const syncOffline = async (token: string, device: string): Promise<OfflineSummary | null> => {
    const counters = offlineCounters(parseStats(readLocal(STATS_KEY)), device);
    const body = counters.played > 0
      ? await apiPost('/v1/players/me/offline', counters, token)
      : { ok: true, json: (await apiGet('/v1/players/me/offline', token)) ?? {} };
    const offline = (body.json as { offline?: OfflineSummary }).offline;
    return offline && typeof offline.games === 'number' ? offline : null;
  };

  const localRecord = () => offlineRecord(parseStats(readLocal(STATS_KEY)));

  const profileFacts = (identity: Identity): ProfileFacts => {
    const pair = cachedTerritory(identity.playerId);
    const offline = localRecord();
    return {
      name: shownName(identity),
      country: browserCountry(),
      // NOT null: a player who never chose a colour still has the one the game derived for them,
      // which is what their tiles wear on the map. The read below only replaces it with a stored
      // choice, so the one tile can never vanish while the read is in flight or fails.
      colour: profileColour(identity.playerId),
      seeds: pair?.seeds ?? null,
      tiles: pair?.tiles ?? null,
      matchesWon: matchesWonEver(offline, null),
      offline,
      online: null,
    };
  };

  const openProfile = () => {
    const s = signedIn();
    if (!s) return;
    const { identity } = s;
    const token = identity.token;
    const seq = ++visitorRequest;
    let facts = profileFacts(identity);
    // One painter for every read: each answer repaints the sheet it is already looking at, and the
    // all-time win total is recomputed from whichever halves are known.
    const paint = (patch: Partial<ProfileFacts>) => {
      if (seq !== visitorRequest) return;
      facts = { ...facts, ...patch };
      facts.matchesWon = matchesWonEver(facts.offline, facts.online);
      profile.show(facts);
    };
    facts.matchesWon = matchesWonEver(facts.offline, facts.online);
    profile.open(facts, menuLogin);

    void apiGet(`/v1/players/${encodeURIComponent(identity.playerId)}/profile`,token).then(body=>{
      const wire=(body as {profile?:PublicPlayerProfile}|null)?.profile;
      if(wire)paint({connectedTiles:wire.connectedTiles ?? null,tiles:wire.tiles,
        online:wire.online,colour:profileColour(identity.playerId,wire.colourId)});
    });
    const device = deviceId();
    void syncOffline(token, device).then((offline) => {
      if (offline) paint({ offline: accountRecord(offline) });
    });
    // This one public aggregate also supplies the online record and colour; do not add separate
    // match-list/colour reads to the Edge pool for facts already returned in that snapshot.
    // At most one pair read, and only when the Territory entry's read has not landed. The same
    // request also paints the Territory entry (web/src/online/lobby-ui.ts), so nothing is doubled.
    void readTerritory(identity.playerId).then((counts) => {
      if (!counts) return;
      paint({ seeds: counts.seeds, tiles: counts.tiles });
    });
  };

  /**
   * ANOTHER PLAYER'S PROFILE (owner, 2026-11-01: "allow to look up other peoples profile on
   * territory"). The Territory tile bar asks through `profile-request.ts`; this module owns the
   * token, so the read happens here and lands in the SAME sheet in its visitor mode.
   *
   * The sheet opens at once in its honest empty state (every fact is the em dash), then the one
   * allow-listed read paints it. A failed, absent or slow read simply leaves the empty state —
   * never an invented number. `visitorRequest` makes a late answer from an older tile unable to
   * overwrite a newer sheet.
   */
  let visitorRequest = 0;
  const visitorFromWire = (
    wire: PublicPlayerProfile | null | undefined,
    headToHead: HeadToHead | undefined,
  ): VisitorFacts | null => {
    const facts = visitorFacts(wire ?? null);
    if (!facts) return null;
    return {
      ...facts,
      rivalryLine: headToHead ? formatRivalryLine(headToHead, wire?.displayName) : null,
    };
  };
  const openPlayerProfile = (playerId: string, opener: HTMLElement | null) => {
    const seq = ++visitorRequest;
    profile.openVisitor(null, opener);
    const identity = readIdentity(kv);
    if (!identity) return;
    void apiGet(`/v1/players/${encodeURIComponent(playerId)}/profile`, identity.token).then((body) => {
      if (seq !== visitorRequest) return;
      const payload = body as { profile?: PublicPlayerProfile; headToHead?: HeadToHead } | null;
      profile.showVisitor(visitorFromWire(payload?.profile, payload?.headToHead));
    });
  };
  window.addEventListener(PLAYER_PROFILE_EVENT, (event) => {
    const detail = (event as CustomEvent<PlayerProfileRequest>).detail;
    if (!detail || typeof detail.playerId !== 'string' || !detail.playerId) return;
    openPlayerProfile(detail.playerId, detail.trigger ?? null);
  });

  // A finished OFFLINE game (main.ts dispatches this after it saves the record): tell the account, so
  // the same numbers show on the player's other devices. Signed out, or with no API, this is a no-op.
  window.addEventListener('futasaku:offline-game', () => {
    const s = signedIn();
    if (!s) return;
    void syncOffline(s.identity.token, deviceId());
  });

  menuLogin?.addEventListener('click', () => {
    if (signedIn()) openProfile();
    else if(emailAvailable)openEmail('menu');
    else void start('menu', menuLogin, null);
  });

  // ---- 5. the Account block in Settings ----
  // Settings is essentials only (owner, 2026-10-23); the account is one of them: its own last group.
  const box = el('div');
  box.id = 'acct-settings';
  const accountHead = el('h3', '', ACCOUNT.settingsTitle);
  document.querySelector('#sheet-settings .sheet-body')?.append(accountHead, box);

  const ask = (title: string, lines: readonly string[], yes: string, danger: boolean, run: (status: HTMLElement, yesBtn: HTMLButtonElement) => Promise<boolean>) => {
    confirmSheet.panel.textContent = '';
    confirmSheet.panel.setAttribute('aria-label', title);
    const status = el('p', 'acct-status');
    status.setAttribute('role', 'status');
    const ul = el('ul');
    for (const l of lines) ul.append(el('li', '', l));
    const no = button('acct-btn', ACCOUNT.cancel, 'confirm-no');
    const ok = button(danger ? 'acct-btn danger solid' : 'acct-btn', yes, 'confirm-yes');
    const actions = el('div', 'acct-actions row');
    actions.append(no, ok);
    confirmSheet.panel.append(el('h2', '', title), ul, status, actions);
    no.addEventListener('click', () => confirmSheet.close());
    ok.addEventListener('click', () => {
      ok.disabled = no.disabled = true;
      status.textContent = ACCOUNT.working;
      status.dataset.tone = '';
      void run(status, ok).then((done) => {
        if (done) confirmSheet.close();
        else ok.disabled = no.disabled = false;
      });
    });
    confirmSheet.open();
  };

  const signOut = () =>
    ask(ACCOUNT.signOutTitle, [ACCOUNT.signOutBody], ACCOUNT.signOut, false, async () => {
      try {
        kv?.remove(IDENTITY_STORAGE_KEY);
        kv?.remove('severgrow.duel.session.v1');
        kv?.remove(WELCOME_KEY);
      } catch {
        /* storage blocked */
      }
      clearAccount(kv);
      location.reload();
      return true;
    });

  const deleteAccount = () =>
    ask(ACCOUNT.deleteTitle, ACCOUNT.deleteLines, ACCOUNT.deleteConfirm, true, async (status) => {
      const s = signedIn();
      if (!s) return true;
      try {
        const res = await apiPost(`/v1/auth/${readAccount(kv)?.provider ?? 'google'}/delete`, {}, s.identity.token);
        if (!res.ok) throw new Error(String(res.status));
        clearAccount(kv);
        writeIdentity(kv, { ...s.identity, kind: 'guest' });
        renderSettings();
        refresh();
        say(ACCOUNT.deleted);
        return true;
      } catch {
        status.textContent = navigator.onLine ? ACCOUNT.unavailable : ACCOUNT.offline;
        status.dataset.tone = 'bad';
        return false;
      }
    });

  /**
   * Choose a name. AFTER THE SIGN-IN THAT FORMED THE ACCOUNT it is required (owner, 2026-10-28: "if
   * someone creates an account they have to type in their nickname" — the generated nature names
   * are for guests): the box starts empty, there is no skip, the scrim and Escape do not close it,
   * and it comes back after a reload until a name is saved. FROM SETTINGS it is the old, optional
   * rename, prefilled. The server re-checks the name (server/src/display-name.ts); this only reports.
   */
  const submitNickname = async (input: HTMLInputElement, status: HTMLElement, save: HTMLButtonElement, skip: HTMLButtonElement | null) => {
    const s = signedIn();
    if (!s) return;
    if (input.value.trim().length === 0) {
      status.textContent = ACCOUNT.nicknameError;
      status.dataset.tone = 'bad';
      input.focus({ preventScroll: true });
      return;
    }
    save.disabled = true;
    if (skip) skip.disabled = true;
    status.textContent = ACCOUNT.working;
    status.dataset.tone = '';
    try {
      const res = await apiPatch('/v1/players/me', { displayName: input.value }, s.identity.token);
      const player = res.ok ? (res.json.player as { displayName?: unknown } | undefined) : undefined;
      if (!player || typeof player.displayName !== 'string') throw new Error(res.status === 400 ? 'invalid-name' : 'service-unavailable');
      // Keep this device's identity honest, so Settings and the lobby show the NEW name at once.
      // The #tag is derived from the player id, so it is untouched and stays exactly as it was.
      writeIdentity(kv, { ...s.identity, displayName: player.displayName });
      clearNicknamePrompt(kv);
      nickSheet.close();
      renderSettings();
      say(ACCOUNT.nicknameSaved);
    } catch (error) {
      status.textContent = !navigator.onLine ? ACCOUNT.offline : error instanceof Error && error.message === 'invalid-name' ? ACCOUNT.nicknameError : ACCOUNT.unavailable;
      status.dataset.tone = 'bad';
      save.disabled = false;
      if (skip) skip.disabled = false;
    }
  };

  const openNickname = (required = false) => {
    const s = signedIn();
    if (!s) return;
    nickSheet.panel.textContent = '';
    const status = el('p', 'acct-status');
    status.setAttribute('role', 'status');
    const input = el('input', 'acct-input');
    input.type = 'text';
    // The server's own limit, imported rather than repeated: 8 on NEW names and renames (owner,
    // 2026-10-30). A legacy longer name may still be stored on this device; typing over it counts
    // as a new name, and the server refuses anything past the same bound.
    input.maxLength = DISPLAY_NAME_MAX;
    // A new account types its own name: the generated guest name is never offered as a suggestion.
    input.value = required ? '' : s.identity.displayName ?? '';
    input.placeholder = ACCOUNT.nicknamePlaceholder;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', ACCOUNT.nicknamePlaceholder);
    const save = button('acct-btn', ACCOUNT.nicknameSave, 'nickname-save');
    const skip = required ? null : button('acct-btn', ACCOUNT.nicknameSkip, 'nickname-skip');
    const actions = el('div', 'acct-actions row');
    if (skip) actions.append(skip);
    actions.append(save);
    nickSheet.panel.append(el('h2', '', ACCOUNT.nicknameTitle), el('p', '', required ? ACCOUNT.nicknameRequiredBody : ACCOUNT.nicknameBody), input, status, actions);
    skip?.addEventListener('click', () => nickSheet.close());
    save.addEventListener('click', () => void submitNickname(input, status, save, skip));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        void submitNickname(input, status, save, skip);
      }
    });
    nickSheet.open(undefined, { locked: required });
    // `open` focuses the first button, which would make "Skip for now" feel like the primary action.
    input.focus({ preventScroll: true });
  };

  const renderSettings = () => {
    box.textContent = '';
    const s = signedIn();
    const id = s?.identity ?? readIdentity(kv);
    const name = shownName(id);
    if (name) box.append(el('p', 'acct-who', ACCOUNT.youAre(name)));
    if (s) {
      box.append(el('p', 'muted small', ACCOUNT.signedIn(s.email,readAccount(kv)?.provider)));
      // The Settings entry for the name: reuses the same sheet as the first-login step.
      const nameRow = el('div', 'acct-actions row');
      const rename = button('acct-btn', ACCOUNT.nicknameSettings, 'change-nickname');
      rename.addEventListener('click', () => openNickname());
      nameRow.append(rename);
      box.append(nameRow);
      const row = el('div', 'acct-actions row');
      const out = button('acct-btn', ACCOUNT.signOut, 'sign-out');
      const del = button('acct-btn danger', ACCOUNT.deleteAccount, 'delete');
      out.addEventListener('click', signOut);
      del.addEventListener('click', deleteAccount);
      row.append(out, del);
      box.append(row);
    } else {
      const status = el('p', 'acct-status');
      status.setAttribute('role', 'status');
      const g = googleButton('settings-google'); g.hidden=!available;
      g.addEventListener('click', () => void start('settings', g, status));
      box.append(el('p', 'muted small', ACCOUNT.guestNote), emailButton('settings'), g, status);
    }
    const p = privacyLink();
    p.style.alignSelf = 'flex-start';
    p.style.paddingLeft = '0';
    box.append(p);
  };

  const refresh = () => {
    hub.hidden = signedIn() !== null;
    // The main menu's LEFT footer key follows the account state (owner brief, 2026-10-21): a guest
    // sees LOG IN and the key starts the Google flow; a signed-in player sees their NAME and the key
    // opens the profile. It is hidden only when this Google branch is skipped entirely, so a channel
    // with no sign-in never shows a dead key. `shownName` is the same name Settings and the lobby use.
    if (menuLogin) {
      const s = signedIn();
      const name = s ? shownName(s.identity) : null;
      // This branch only runs once Google is known to be on, so the key is live in both states:
      // LOG IN for a guest, the player's name when signed in. (Channels/builds where the Google
      // branch never runs keep the markup's hidden key, so no dead key is ever shown.) The menu's
      // first layout already painted it the same way (./menu-key.ts); from here this module owns it.
      paintAccountKey(menuLogin, name);
      menuLogin.dataset.owned = '1';
    }
    // A sign-out reloads the page, but storage can also change under us; never leave a profile open
    // for an identity this device no longer has.
    if (profile.isOpen() && signedIn() === null) profile.close();
  };
  renderSettings();
  refresh();
  // A tap on the early-painted key, made before this module arrived, is honoured now.
  if (menuLogin?.dataset.earlyClick) {
    delete menuLogin.dataset.earlyClick;
    menuLogin.click();
  }
  // ---- 6. the new account's name step, right after the sign-in that formed this account ----
  // Owed until a name is saved (owner, 2026-10-28): a reload brings it back, and it cannot be skipped.
  // A later sign-in on another device is 'signed-in' and never sets the invitation, so an existing
  // account is never asked again.
  const pendingNickname = pendingNicknamePrompt(kv);
  if (pendingNickname && signedIn()?.identity.playerId === pendingNickname) openNickname(true);
  else if (pendingNickname && !signedIn()) clearNicknamePrompt(kv);
  // The lobby rewrites identity (first guest, link codes, a 401 reset); keep both views honest.
  for (const id of ['menu-settings', 'gm-settings']) document.getElementById(id)?.addEventListener('click', () => setTimeout(renderSettings, 0));
  document.getElementById('menu-online')?.addEventListener('click', () => setTimeout(refresh, 0));
  window.addEventListener('storage', (e) => {
    if (e.key === IDENTITY_STORAGE_KEY || e.key === 'futasaku.account.v1') {
      renderSettings();
      refresh();
    }
  });
};
