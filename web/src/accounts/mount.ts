// Accounts — the DOM side, mounted once from main.ts (docs/ACCOUNTS.md). Adds "Continue with Google"
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
import { glassBaseCss } from '../player/glass-surface.js';
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
  readCallback,
  redirectTarget,
  savePending,
  setFlash,
  takeFlash,
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
.acct-glass { z-index:95; left:50%; top:50%; transform:translate(-50%,-50%); width:min(400px, calc(100vw - 32px));
  max-height:calc(100dvh - 32px); overflow:auto; padding:18px 16px 16px; background:rgba(8,10,10,.88); display:flex; flex-direction:column; gap:12px; }
.acct-glass[hidden], .acct-scrim[hidden], .acct-toast[hidden], [data-acct][hidden] { display:none !important; }
.acct-scrim { position:fixed; inset:0; z-index:94; background:rgba(4,6,5,.5); }
.acct-glass h3 { margin:6px 0 0; font:700 14px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#e2d4b4; }
.acct-glass h2 { margin:0; font:700 18px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#f6ecd8; }
.acct-glass p, .acct-glass li { margin:0; color:#e2d4b4; line-height:1.45; }
.acct-glass ul { margin:0; padding-left:18px; display:grid; gap:6px; }
.acct-small { font-size:12px; color:#b7a98a !important; }
.acct-actions { display:flex; flex-direction:column; gap:8px; }
.acct-actions.row { flex-direction:row; justify-content:flex-end; flex-wrap:wrap; }
.acct-btn { min-height:44px; padding:0 16px; border-radius:999px; cursor:pointer; border:1px solid rgba(214,204,177,.28);
  background:rgba(255,255,255,.04); color:#f0e9dc; font:700 14px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.06em; }
.acct-btn.danger { border-color:rgba(224,115,92,.6); color:#f2b3a3; }
.acct-btn.danger.solid { background:#c4553f; border-color:#c4553f; color:#fff6ef; }
.acct-btn:disabled { opacity:.55; cursor:default; }
/* Google's own dark sign-in button: #131314, grey outline, the four-colour G (branding guidelines). */
.acct-google { display:inline-flex; align-items:center; justify-content:center; gap:10px; min-height:48px; padding:0 18px; border-radius:999px;
  background:#131314; border:1px solid #8e918f; color:#e3e3e3; cursor:pointer; font:500 15px/1 Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing:.01em; }
.acct-google:hover { background:#1d1d1f; }
.acct-google:disabled { opacity:.6; cursor:default; }
.acct-google:focus-visible, .acct-btn:focus-visible, .acct-linkbtn:focus-visible { outline:2px solid #f0e9dc; outline-offset:2px; }
.acct-linkbtn { align-self:center; min-height:44px; padding:0 8px; border:0; background:none; color:#b7a98a; font:inherit; font-size:13px; text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
.acct-status { min-height:1.3em; font-size:13px; color:#c9e4a8 !important; }
.acct-status[data-tone='bad'] { color:#e0735c !important; }
.acct-status:empty { display:none; }
#acct-hub { display:flex; flex-direction:column; gap:10px; align-items:stretch; text-align:center; }
#acct-hub p { margin:0; }
#acct-settings { display:flex; flex-direction:column; gap:8px; margin:4px 0 10px; }
#acct-settings .acct-who { margin:0; font-weight:700; color:var(--ink, #f0e9dc); }
#acct-settings p { margin:0; }
#acct-settings .acct-actions.row { justify-content:flex-start; }
body.acct-on #online-storage-note { display:none; }
.acct-toast { position:fixed; z-index:96; left:50%; top:calc(env(safe-area-inset-top, 0px) + 14px); transform:translateX(-50%);
  width:min(420px, calc(100vw - 32px)); box-sizing:border-box; padding:12px 14px; border-radius:14px; background:rgba(8,10,10,.92);
  border:1px solid rgba(214,204,177,.25); color:#f0e9dc; font:400 14px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); text-align:center; }
.acct-toast[data-tone='bad'] { border-color:rgba(224,115,92,.6); }
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
  const close = () => {
    if (panel.hidden) return;
    scrim.hidden = panel.hidden = true;
    const f = onClose;
    onClose = null;
    f?.();
  };
  scrim.addEventListener('click', close);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  return {
    panel,
    open: (then?: () => void) => {
      onClose = then ?? null;
      scrim.hidden = panel.hidden = false;
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
const apiPost = async (path: string, body: unknown, token: string | null): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> => {
  const url = apiUrl(path);
  if (!url) return { ok: false, status: 0, json: {} };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-futasaku-client-version': DUEL_CLIENT_VERSION,
      'x-futasaku-rules-version': CURRENT_RULES_VERSION,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
};

const SETTINGS_CACHE = 'futasaku.auth.google.v1';
/** Is "Continue with Google" switched on in the Supabase dashboard? Asked once per session. */
const probeGoogle = async (supa: { url: string; key: string }): Promise<boolean> => {
  try {
    const hit = sessionStorage.getItem(SETTINGS_CACHE);
    if (hit === '1' || hit === '0') return hit === '1';
  } catch {
    /* no session storage */
  }
  try {
    const res = await fetch(`${supa.url}/auth/v1/settings`, { headers: { apikey: supa.key } });
    const on = res.ok && googleEnabled(await res.json());
    try {
      sessionStorage.setItem(SETTINGS_CACHE, on ? '1' : '0');
    } catch {
      /* fine */
    }
    return on;
  } catch {
    return false;
  }
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

  /** Back where the player started: waits (up to 10 s) for the menu button to be ready, then taps it. */
  const go = (returnTo: ReturnTo) => {
    const id = returnTo === 'online' ? 'menu-online' : returnTo === 'settings' ? 'menu-settings' : null;
    if (!id) return;
    const until = Date.now() + 10_000;
    const tryTap = () => {
      const b = document.getElementById(id);
      const menu = document.getElementById('menu');
      if (b && !b.hidden && menu && !menu.hidden && b.offsetParent !== null) b.click();
      else if (Date.now() < until) setTimeout(tryTap, 150);
    };
    tryTap();
  };

  // ---- 1. coming back from Google (?code=…) ----
  const callback = readCallback(location.search, location.hash);
  if (callback) {
    const pending = takePending(kv, Date.now());
    // Drop the code from the address bar at once: it is single-use and must not be bookmarked or shared.
    history.replaceState(history.state, '', location.pathname + cleanSearch(location.search) + (isCallbackHash(location.hash) ? '' : location.hash));
    if (pending) {
      const fail = (text: string) => {
        setFlash(kv, { kind: 'failed', text, returnTo: pending.returnTo });
      };
      try {
        if ('error' in callback) fail(ACCOUNT.failed);
        else {
          const ex = await fetch(`${supa.url}/auth/v1/token?grant_type=pkce`, {
            method: 'POST',
            headers: { apikey: supa.key, 'content-type': 'application/json' },
            body: JSON.stringify({ auth_code: callback.code, code_verifier: pending.verifier }),
          });
          const session = ex.ok ? ((await ex.json()) as { access_token?: unknown }) : null;
          const access = typeof session?.access_token === 'string' ? session.access_token : null;
          if (!access) fail(ACCOUNT.failed);
          else {
            const before = readIdentity(kv);
            const res = await apiPost('/v1/auth/google', { accessToken: access }, before?.token ?? null);
            // Our server has its own token now; the Supabase session is not needed any more.
            void fetch(`${supa.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: supa.key, authorization: `Bearer ${access}` } }).catch(() => undefined);
            const identity = res.ok ? identityFromSignIn(res.json) : null;
            if (!identity) fail(res.status === 403 || res.status === 404 ? ACCOUNT.unavailable : ACCOUNT.failed);
            else {
              writeIdentity(kv, identity);
              writeAccount(kv, { provider: 'google', email: typeof res.json.email === 'string' ? res.json.email : null, playerId: identity.playerId });
              try {
                kv?.set(WELCOME_KEY, '1');
              } catch {
                /* fine */
              }
              const name = shownName(identity) ?? '';
              const outcome = res.json.outcome;
              const text = outcome === 'linked' ? ACCOUNT.linked(name) : outcome === 'signed-in' && before && before.playerId !== identity.playerId ? ACCOUNT.switched(name) : ACCOUNT.welcomeBack(name);
              setFlash(kv, { kind: 'signed-in', text, returnTo: pending.returnTo });
              // Start clean on the new identity: every online screen re-reads it from storage.
              location.reload();
              return;
            }
          }
        }
      } catch {
        fail(navigator.onLine ? ACCOUNT.failed : ACCOUNT.offline);
      }
    }
  }

  // ---- 2. is Google switched on? Nothing below shows until it is. ----
  const available = await probeGoogle(supa);
  const flash = takeFlash(kv);
  if (flash) {
    say(flash.text, flash.kind === 'failed');
    setTimeout(() => go(flash.returnTo), 0);
  }
  if (!available) return;
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
  {
    const status = el('p', 'acct-status');
    status.setAttribute('role', 'status');
    const g = googleButton('welcome-google');
    const guest = button('acct-btn', ACCOUNT.playAsGuest, 'welcome-guest');
    const actions = el('div', 'acct-actions');
    actions.append(g, guest);
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
    const g = googleButton('hub-google');
    hub.append(el('p', 'muted small', ACCOUNT.hubGuest), g, status);
    g.addEventListener('click', () => void start('online', g, status));
    hubHead?.after(hub);
  }

  // ---- 5. the Account block in Settings ----
  const note = document.getElementById('online-storage-note');
  const box = el('div');
  box.id = 'acct-settings';
  note?.after(box);

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
        const res = await apiPost('/v1/auth/google/delete', {}, s.identity.token);
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

  const renderSettings = () => {
    box.textContent = '';
    const s = signedIn();
    const id = s?.identity ?? readIdentity(kv);
    const name = shownName(id);
    if (name) box.append(el('p', 'acct-who', ACCOUNT.youAre(name)));
    if (s) {
      box.append(el('p', 'muted small', ACCOUNT.signedIn(s.email)));
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
      const g = googleButton('settings-google');
      g.addEventListener('click', () => void start('settings', g, status));
      box.append(el('p', 'muted small', ACCOUNT.guestNote), g, status);
    }
    const p = privacyLink();
    p.style.alignSelf = 'flex-start';
    p.style.paddingLeft = '0';
    box.append(p);
  };

  const refresh = () => {
    hub.hidden = signedIn() !== null;
  };
  renderSettings();
  refresh();
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
