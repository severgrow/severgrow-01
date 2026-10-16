// The dashboard shell: token gate, navigation, hash router.
//
// Order of business at boot:
//   1. find a token (the game's own stored identity on this device, or a token pasted last time);
//   2. ask the API who we are (`/v1/admin/session`). Only a 200 means admin — a 401/403 shows the
//      plain access-denied screen and STOPS. No screen is ever rendered before that answer, so a
//      non-admin visitor never sees even the dashboard's shape.
//
// The route lives in the hash, so a view is linkable and the browser's back button works.
import { AdminApi, apiBaseFromLocation, apiBaseUrl, findToken, forgetToken, rememberPastedToken, type AdminSession } from './api.js';
import type { Ctx } from './ui.js';
import { button, el } from './ui.js';
import { renderOverview } from './screens/overview.js';
import { renderReports } from './screens/reports.js';
import { renderPlayer } from './screens/player.js';
import { renderMatchDetail, renderMatches } from './screens/matches.js';
import { renderSeeds } from './screens/seeds.js';
import { renderCampaign } from './screens/campaign.js';
import { renderOps } from './screens/ops.js';
import { formatDateTime, parseHash } from './format.js';

const ROUTES: readonly { route: string; label: string }[] = [
  { route: 'overview', label: 'Overview' },
  { route: 'reports', label: 'Reports' },
  { route: 'player', label: 'Player' },
  { route: 'matches', label: 'Matches' },
  { route: 'seeds', label: 'Seeds & world' },
  { route: 'campaign', label: 'Campaign' },
  { route: 'ops', label: 'Health & ops' },
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

const render = (session: AdminSession, api: AdminApi): void => {
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
  nav.replaceChildren(
    ...ROUTES.map((entry) => el('a', { href: `#/${entry.route}`, text: entry.label, dataset: { route: entry.route } })),
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
  whoSeen.textContent = `rules ${session.rulesVersion} · server ${formatDateTime(session.serverNow)}`;
  boot.hidden = true;
  denied.hidden = true;
  gate.hidden = true;
  adminRoot.hidden = false;

  window.addEventListener('hashchange', () => void route(ctx));
  void route(ctx);
};

const start = async (): Promise<void> => {
  const base = apiBaseFromLocation(location.search) ?? apiBaseUrl();
  if (!base) {
    showGate('This dashboard build has no API address configured. Rebuild it with VITE_DUEL_API_URL set, or add ?api=https://… to the URL.');
    return;
  }
  const found = findToken();
  if (!found) {
    showGate('This dashboard uses your normal player token. It has not been found on this device, so paste it below — or sign in to the game in this browser first.');
    return;
  }
  boot.hidden = false;
  const api = new AdminApi(base, found.token);
  const session = await api.session();
  if (!session.ok) {
    if (session.status === 401) {
      // The token is dead. Clear the pasted copy so the next attempt is a fresh paste.
      forgetToken();
      showGate('That token is no longer valid. Paste a current one, or sign in to the game in this browser.');
      return;
    }
    if (session.status === 403) {
      showDenied();
      return;
    }
    showGate(`The dashboard could not reach the API (${session.message}).`);
    return;
  }
  render(session.data, api);
};

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
