// The dashboard shell: token gate, navigation, hash router.
//
// Order of business at boot:
//   0. if this load is Google's return trip, finish the sign-in (admin/src/google.ts);
//   1. find a token (the dashboard's own Google sign-in, the game's stored identity on this device,
//      or a token pasted in this tab);
//   2. ask the API who we are (`/v1/admin/session`). Only a 200 means admin — a 401/403 shows the
//      plain access-denied screen and STOPS. No screen is ever rendered before that answer, so a
//      non-admin visitor never sees even the dashboard's shape.
//
// The route lives in the hash, so a view is linkable and the browser's back button works.
import { AdminApi, apiBaseFromLocation, apiBaseUrl, clearSignedOut, findToken, forgetDeadToken, forgetToken, gameToken, rememberPastedToken, type AdminSession } from './api.js';
import { finishGoogle, googleAvailable, startGoogle, supabaseConfig } from './google.js';
import { renderPlayers } from './screens/players.js';
import { renderBots } from './screens/bots.js';
import type { Ctx } from './ui.js';
import type { TokenSource } from './api.js';
import { button, el } from './ui.js';
import { renderOverview } from './screens/overview.js';
import { renderReports } from './screens/reports.js';
import { renderPlayer } from './screens/player.js';
import { renderMatchDetail, renderMatches } from './screens/matches.js';
import { renderSeeds } from './screens/seeds.js';
import { renderCampaign } from './screens/campaign.js';
import { renderOps } from './screens/ops.js';
import { formatDateTime, parseHash } from './format.js';

/** The sections, grouped the way the owner asks questions: who plays, what they play, what broke. */
const ROUTES: readonly { group: string; route: string; label: string }[] = [
  { group: 'Today', route: 'overview', label: 'Overview' },
  { group: 'Players', route: 'players', label: 'All players' },
  { group: 'Players', route: 'bots', label: 'Bots (test accounts)' },
  { group: 'Players', route: 'player', label: 'Look up a player' },
  { group: 'Players', route: 'campaign', label: 'Campaign progress' },
  { group: 'Play', route: 'matches', label: 'Online matches' },
  { group: 'Play', route: 'seeds', label: 'Seeds & world' },
  { group: 'Support', route: 'reports', label: 'Reports' },
  { group: 'Support', route: 'ops', label: 'Health & ops' },
];

const need = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`the dashboard's own markup is missing #${id}`);
  return node as T;
};

const boot = need('boot');
const adminRoot = need('admin');
const gate = need('gate');
const denied = need('denied');
const nav = need('nav');
const view = need('view');
const whoName = need('who-name');
const whoSeen = need('who-seen');
const gateBody = need('gate-body');
const gateInput = need('gate-token') as HTMLInputElement;
const gateNotice = need('gate-notice');

const showDenied = (): void => {
  boot.hidden = true;
  adminRoot.hidden = true;
  gate.hidden = true;
  denied.hidden = false;
};

const showGate = (message: string): void => {
  boot.hidden = true;
  adminRoot.hidden = true;
  denied.hidden = true;
  gate.hidden = false;
  gateBody.textContent = message;
  gateInput.focus();
};

const render = (session: AdminSession, api: AdminApi, source: TokenSource): void => {
  const ctx: Ctx = {
    api,
    session: { admin: session.admin, rulesVersion: session.rulesVersion, limits: session.limits },
    navigate: (hash) => {
      if (location.hash === hash) void route(ctx);
      else location.hash = hash;
    },
    denied: showDenied,
  };

  // Navigation.
  const groups = [...new Set(ROUTES.map((entry) => entry.group))];
  nav.replaceChildren(
    ...groups.map((group) =>
      el(
        'div',
        { class: 'nav-group' },
        el('p', { class: 'nav-label', text: group }),
        ...ROUTES.filter((entry) => entry.group === group).map((entry) =>
          el('a', { href: `#/${entry.route}`, text: entry.label, dataset: { route: entry.route } }),
        ),
      ),
    ),
  );

  const highlight = (route: string): void => {
    const active = route === 'match' ? 'matches' : route;
    for (const link of nav.querySelectorAll('a')) {
      const isActive = link.dataset.route === active;
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };

  const route = async (ctxIn: Ctx): Promise<void> => {
    const { route: name, rest, params } = parseHash(location.hash);
    highlight(name);
    view.replaceChildren();
    view.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    switch (name) {
      case 'overview':
        await renderOverview(view, ctxIn);
        return;
      case 'reports':
        await renderReports(view, ctxIn, params);
        return;
      case 'players':
        await renderPlayers(view, ctxIn, params);
        return;
      case 'bots':
        await renderBots(view, ctxIn, params);
        return;
      case 'player':
        await renderPlayer(view, ctxIn, params);
        return;
      case 'matches':
        await renderMatches(view, ctxIn, params);
        return;
      case 'match':
        await renderMatchDetail(view, ctxIn, params.get('id') ?? rest ?? '');
        return;
      case 'seeds':
        await renderSeeds(view, ctxIn, params);
        return;
      case 'campaign':
        await renderCampaign(view, ctxIn);
        return;
      case 'ops':
        await renderOps(view, ctxIn);
        return;
      default:
        ctxIn.navigate('#/overview');
    }
  };

  whoName.textContent = `${session.admin.displayName ?? '(no name)'} #${session.admin.tag}`;
  whoName.title = source === 'google' ? 'Signed in with Google on this page' : source === 'game' ? "Using this browser's game sign-in" : 'Using a pasted token';
  whoSeen.textContent = `rules ${session.rulesVersion} · server ${formatDateTime(session.serverNow)}`;
  boot.hidden = true;
  denied.hidden = true;
  gate.hidden = true;
  adminRoot.hidden = false;

  window.addEventListener('hashchange', () => void route(ctx));
  void route(ctx);
};

const supa = supabaseConfig();
const gateGoogle = need('gate-google') as HTMLButtonElement;
const gatePaste = need('gate-paste') as HTMLDetailsElement;

const SIGN_IN = 'Sign in with the Google account you play FUTASAKU with.';

/** Show the sign-in card, with the Google button when Google sign-in is switched on. */
const askToSignIn = (message: string, notice = ''): void => {
  showGate(message);
  gateNotice.textContent = notice;
  gateGoogle.hidden = true;
  if (!supa) {
    gatePaste.open = true;
    return;
  }
  void googleAvailable(supa).then((on) => {
    gateGoogle.hidden = !on;
    if (on) gateGoogle.focus();
    else gatePaste.open = true;
  });
};

const start = async (): Promise<void> => {
  const base = apiBaseFromLocation(location.search) ?? apiBaseUrl();
  if (!base) {
    showGate('This dashboard build has no API address configured. Rebuild it with VITE_DUEL_API_URL set, or add ?api=https://… to the URL.');
    return;
  }
  boot.hidden = false;
  const returned = await finishGoogle(supa, base, gameToken());
  if (returned?.ok) clearSignedOut();
  if (returned && !returned.ok) {
    askToSignIn(SIGN_IN, returned.message);
    return;
  }
  const found = findToken();
  if (!found) {
    askToSignIn(SIGN_IN);
    return;
  }
  const api = new AdminApi(base, found.token);
  const session = await api.session();
  if (!session.ok) {
    if (session.status === 401) {
      // That token is dead: drop it (never the game's own identity) and ask again.
      forgetDeadToken(found.source);
      askToSignIn('That sign-in has expired. Sign in again.');
      return;
    }
    if (session.status === 403) {
      showDenied();
      return;
    }
    showGate(`The dashboard could not reach the API (${session.message}).`);
    return;
  }
  render(session.data, api, found.source);
};

gateGoogle.addEventListener('click', () => {
  if (!supa) return;
  gateGoogle.disabled = true;
  gateNotice.textContent = 'Opening Google…';
  startGoogle(supa).catch((error: unknown) => {
    gateGoogle.disabled = false;
    gateNotice.textContent = error instanceof Error ? error.message : 'Google sign-in could not start.';
  });
});

gateInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') (document.getElementById('gate-submit') as HTMLButtonElement | null)?.click();
});

need('gate-submit').addEventListener('click', () => {
  const token = gateInput.value.trim();
  if (token.length < 16) {
    gateNotice.textContent = 'That does not look like a token.';
    return;
  }
  rememberPastedToken(token);
  clearSignedOut();
  gateNotice.textContent = '';
  void start();
});

need('denied-again').addEventListener('click', () => {
  location.reload();
});

need('sign-out').addEventListener('click', () => {
  forgetToken();
  location.reload();
});

// A stray unhandled rejection must not leave a blank page: it becomes a plain line on screen.
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  view.replaceChildren(el('div', { class: 'state error', role: 'alert' }, el('p', { text: `The dashboard hit an unexpected error: ${message}` }), button('Reload', () => location.reload(), { small: true })));
});

void start();
