// Beta feedback — the DOM side, mounted once from main.ts. Adds "Report a problem" to the pause
// menu and Settings, reports crashes silently, and opens the tester guide at futasaku.com/#beta.
// It only reads the page (the existing read-only `window.__severgrow` hooks); it never changes the
// game, and a failure here can never break play (every path is caught).
import { BETA_GUIDE, FEEDBACK } from '../../../src/strings.js';
import { DUEL_CLIENT_VERSION, browserStorage } from '../../../server/src/client.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/index.js';
import { duelApiUrl, duelRegion } from '../online/config.js';
import { getOnlineSession } from '../online/duel-runtime.js';
import { IDENTITY_STORAGE_KEY } from '../online/identity.js';
import { glassBaseCss } from '../player/glass-surface.js';
import { buildContext, cleanStack, createCrashGate, createQueue, safePath } from './core.js';
import type { FeedbackKind, FeedbackPayload } from './core.js';

declare const __CHANNEL__: string;

type Hooks = {
  state?: () => { phase?: string; turnNumber?: number; actor?: number; turnPlayer?: number; deck?: unknown[] } | null;
  online?: () => Record<string, unknown> | null;
  settings?: () => Record<string, unknown>;
  animLog?: () => { ev?: string; t?: number }[];
};
const hooks = (): Hooks => ((window as unknown as { __severgrow?: Hooks }).__severgrow ?? {});

const started = performance.now();
const crashMessages: string[] = [];

/** The release this page is: the hashed main script name changes with every build. */
const buildId = (): string | null => {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"], script[type="module"][src*="assets/"]');
  const name = s?.src.split('/').pop() ?? null;
  return name ? `${name} · ${DUEL_CLIENT_VERSION} · ${CURRENT_RULES_VERSION}` : `${DUEL_CLIENT_VERSION} · ${CURRENT_RULES_VERSION}`;
};

const visibleScreen = (): string => {
  for (const id of ['game', 'menu', 'levels']) {
    const el = document.getElementById(id);
    if (el && !el.hidden) return id;
  }
  if (document.querySelector('[id^="online-"]:not([hidden]).screen, #online-hub:not([hidden])')) return 'online';
  return 'other';
};

const context = (): Record<string, unknown> => {
  const h = hooks();
  let game = null;
  try {
    const st = h.state?.() ?? null;
    // Only the position (step and turn). Never the hand, the deck order or the seed.
    if (st) game = { phase: st.phase, turnNumber: st.turnNumber, actor: st.actor, turnPlayer: st.turnPlayer, deckCount: st.deck?.length };
  } catch {
    game = null;
  }
  let duel: Record<string, unknown> | null = null;
  let matchId: string | null = null;
  try {
    duel = h.online?.() ?? null;
    matchId = getOnlineSession()?.driver.snapshot().matchId ?? null;
  } catch {
    duel = null;
  }
  let recent: unknown[] = [];
  try {
    recent = (h.animLog?.() ?? []).slice(-15).map((m) => ({ ev: m.ev, t: Math.round(m.t ?? 0) }));
  } catch {
    recent = [];
  }
  return buildContext({
    channel: typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : '',
    path: safePath(location.pathname),
    screen: visibleScreen(),
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 },
    standalone: matchMedia?.('(display-mode: standalone)').matches ?? false,
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    lang: navigator.language,
    online: navigator.onLine,
    settings: (() => {
      try {
        return h.settings?.() ?? null;
      } catch {
        return null;
      }
    })(),
    game,
    duel,
    matchId,
    recent,
    errors: crashMessages,
    uptimeMs: performance.now() - started,
  });
};

const token = (): string | null => {
  try {
    const raw = browserStorage()?.get(IDENTITY_STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as { token?: unknown }) : null;
    return typeof v?.token === 'string' ? v.token : null;
  } catch {
    return null;
  }
};

const send = async (api: string, p: FeedbackPayload): Promise<'ok' | 'retry' | 'drop'> => {
  if (!navigator.onLine) return 'retry';
  const region = duelRegion();
  const url = `${api}/v1/feedback${region ? `?forceFunctionRegion=${encodeURIComponent(region)}` : ''}`;
  const t = token();
  try {
    const res = await fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-futasaku-client-version': DUEL_CLIENT_VERSION,
        'x-futasaku-rules-version': CURRENT_RULES_VERSION,
        ...(t ? { authorization: `Bearer ${t}` } : {}),
      },
      body: JSON.stringify(p),
    });
    if (res.ok) return 'ok';
    // Refused for good (bad input) or rate limited: never retry in a loop.
    return res.status >= 500 ? 'retry' : 'drop';
  } catch {
    return 'retry';
  }
};

const CSS = `
${glassBaseCss('.fb-glass')}
.fb-glass { z-index:95; left:50%; top:50%; transform:translate(-50%,-50%); width:min(420px, calc(100vw - 32px));
  max-height:calc(100dvh - 32px); overflow:auto; padding:16px; background:rgba(8,10,10,.86); display:flex; flex-direction:column; gap:10px; }
.fb-glass[hidden], .fb-scrim[hidden] { display:none !important; }
.fb-scrim { position:fixed; inset:0; z-index:94; background:rgba(4,6,5,.45); }
.fb-glass h2 { margin:0; font:700 17px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#f6ecd8; }
.fb-glass h3 { margin:6px 0 0; font:700 14px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; color:#e2d4b4; }
.fb-glass p { margin:0; color:#e2d4b4; line-height:1.45; }
.fb-glass ul { margin:0; padding-left:18px; color:#e2d4b4; line-height:1.45; display:grid; gap:4px; }
.fb-glass .fb-small { font-size:12px; color:#b7a98a; }
.fb-glass textarea { width:100%; box-sizing:border-box; min-height:110px; resize:vertical; border-radius:10px; padding:10px;
  border:1px solid rgba(214,204,177,.25); background:rgba(255,255,255,.04); color:#f0e9dc; font:400 15px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); }
.fb-glass .fb-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.fb-glass .fb-actions button, .fb-glass .fb-link { min-height:44px; min-width:44px; padding:0 14px; border-radius:10px; cursor:pointer;
  border:1px solid rgba(214,204,177,.25); background:rgba(255,255,255,.04); color:#f0e9dc; font:700 14px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.06em; }
.fb-glass .fb-actions button.primary { background:#8fbf6a; border-color:#8fbf6a; color:#0d100d; }
.fb-glass .fb-actions .fb-link { background:none; border:0; text-decoration:underline; padding:0 4px; margin-right:auto; }
.fb-glass .fb-status { min-height:1.4em; color:#c9e4a8; }
.fb-glass .fb-status[data-tone='bad'] { color:#e0735c; }
.large-text .fb-glass p, .large-text .fb-glass li { font-size:16px; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

/** One glass sheet over a scrim; closes on Escape or a tap outside. */
const sheet = (id: string, label: string) => {
  const scrim = el('div', 'fb-scrim');
  const panel = el('section', 'fb-glass');
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', label);
  scrim.hidden = panel.hidden = true;
  document.body.append(scrim, panel);
  const close = () => {
    scrim.hidden = panel.hidden = true;
  };
  scrim.addEventListener('click', close);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  return {
    panel,
    open: () => {
      scrim.hidden = panel.hidden = false;
    },
    close,
    isOpen: () => !panel.hidden,
  };
};

let mounted = false;

export const mountFeedback = (): void => {
  if (mounted) return;
  mounted = true;
  const api = duelApiUrl();
  const queue = createQueue(browserStorage());
  const style = el('style');
  style.textContent = CSS;
  document.head.append(style);

  const submit = async (kind: FeedbackKind, message: string, extra: Record<string, unknown> = {}): Promise<'ok' | 'queued' | 'failed'> => {
    if (!api) return 'failed';
    const payload: FeedbackPayload = { kind, message, build: buildId(), context: { ...context(), ...extra } };
    const r = await send(api, payload);
    if (r === 'ok') return 'ok';
    if (r === 'retry') {
      queue.push(payload);
      return 'queued';
    }
    return 'failed';
  };

  // ---- crashes: silent, deduplicated, at most 5 per page load ----
  const gate = createCrashGate(5);
  const crash = (message: string, stack: string) => {
    try {
      if (!api || !gate(message, stack)) return;
      crashMessages.push(message.slice(0, 200));
      void submit('crash', message.slice(0, 500), { stack: cleanStack(stack, location.origin) });
    } catch {
      /* reporting must never cause a second error */
    }
  };
  window.addEventListener('error', (e) => crash(e.message || String(e.error ?? ''), (e.error as Error | undefined)?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: unknown; stack?: unknown } | undefined;
    crash(String(r?.message ?? r ?? 'unhandled rejection'), String(r?.stack ?? ''));
  });

  // Anything saved while offline goes out now and whenever the connection comes back.
  const flush = () => {
    if (api) void queue.flush((p) => send(api, p));
  };
  flush();
  window.addEventListener('online', flush);

  // ---- the tester guide (futasaku.com/#beta) ----
  const guide = sheet('fb-guide', BETA_GUIDE.title);
  const fillGuide = () => {
    guide.panel.textContent = '';
    guide.panel.append(el('h2', '', BETA_GUIDE.title), el('p', '', BETA_GUIDE.intro));
    for (const s of BETA_GUIDE.sections) {
      guide.panel.append(el('h3', '', s.heading));
      const ul = el('ul');
      for (const line of s.lines) ul.append(el('li', '', line));
      guide.panel.append(ul);
    }
    const actions = el('div', 'fb-actions');
    const close = el('button', 'primary', FEEDBACK.close);
    close.type = 'button';
    close.addEventListener('click', () => {
      guide.close();
      if (location.hash === '#beta') history.replaceState(null, '', location.pathname + location.search);
    });
    actions.append(close);
    guide.panel.append(actions);
  };
  const openGuide = () => {
    fillGuide();
    guide.open();
    (guide.panel.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  };
  const checkHash = () => {
    if (location.hash === '#beta') openGuide();
  };
  checkHash();
  window.addEventListener('hashchange', checkHash);

  // ---- "Report a problem" ----
  if (!api) return; // a build with no server (offline only) has nowhere to send a report
  const report = sheet('fb-report', FEEDBACK.title);
  const status = el('p', 'fb-status');
  status.setAttribute('role', 'status');
  const area = el('textarea');
  area.maxLength = 2000;
  area.placeholder = FEEDBACK.placeholder;
  area.setAttribute('aria-label', FEEDBACK.prompt);
  const sendBtn = el('button', 'primary', FEEDBACK.send);
  const cancelBtn = el('button', '', FEEDBACK.cancel);
  const guideBtn = el('button', 'fb-link', FEEDBACK.guideLink);
  for (const b of [sendBtn, cancelBtn, guideBtn]) b.type = 'button';
  sendBtn.dataset.fb = 'send';
  const actions = el('div', 'fb-actions');
  actions.append(guideBtn, cancelBtn, sendBtn);
  report.panel.append(el('h2', '', FEEDBACK.title), el('p', '', FEEDBACK.prompt), area, el('p', 'fb-small', FEEDBACK.attached), status, actions);
  cancelBtn.addEventListener('click', () => report.close());
  area.addEventListener('input', () => {
    if (status.dataset.tone === 'bad') {
      status.textContent = '';
      status.dataset.tone = '';
    }
  });
  guideBtn.addEventListener('click', () => {
    report.close();
    openGuide();
  });
  let busy = false;
  sendBtn.addEventListener('click', () => {
    if (busy) return;
    const text = area.value.trim();
    if (!text) {
      status.dataset.tone = 'bad';
      status.textContent = FEEDBACK.empty;
      area.focus();
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    status.dataset.tone = '';
    status.textContent = FEEDBACK.sending;
    void submit('report', text).then((r) => {
      busy = false;
      sendBtn.disabled = false;
      if (r === 'failed') {
        status.dataset.tone = 'bad';
        status.textContent = FEEDBACK.failed;
        return;
      }
      status.textContent = r === 'ok' ? FEEDBACK.sent : FEEDBACK.queued;
      area.value = '';
      window.setTimeout(() => {
        if (report.isOpen()) report.close();
      }, 1400);
    });
  });
  const openReport = () => {
    // Close whichever menu sheet we came from, so the dialog is on top of the game, not the menu.
    document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-close]')?.click();
    status.textContent = '';
    report.open();
    area.focus({ preventScroll: true });
  };

  // Entry points: the pause menu (in a game) and Settings (anywhere).
  const button = (id: string, cls: string) => {
    const b = el('button', cls, FEEDBACK.open);
    b.type = 'button';
    b.id = id;
    b.dataset.fb = 'open';
    b.addEventListener('click', openReport);
    return b;
  };
  const settingsBtn = document.getElementById('gm-settings');
  settingsBtn?.parentElement?.insertBefore(button('gm-report', 'btn ghost'), settingsBtn.nextSibling);
  const settingsBody = document.querySelector('#sheet-settings .sheet-body');
  settingsBody?.append(button('settings-report', 'btn ghost'));
};
