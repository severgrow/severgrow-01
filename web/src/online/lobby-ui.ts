// Phase 4 — online menu / lobby screens. Duel play opens in Phase 5.

import { DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
import type { MatchListEntry, MatchSummary, MatchViewPayload, ReplayPayload, WorldMapPayload } from '../../../server/src/protocol.js';
import { ONLINE, REPLAY } from '../../../src/strings.js';
import { createIdentityStore } from './identity.js';
import type { IdentityStore } from './identity.js';
import { duelApiUrl, duelRegion, findOpponentEnabled, onlineBuildEnabled, parkedOfferMs } from './config.js';
import { createLobbyActionGuard } from './lobby-action.js';
import {
  countNeedingResponse,
  needsMyResponse,
  yourMatchesButtonName,
  yourMatchesLabel,
} from './match-attention.js';
import { WAIT_DOTS_CSS, waitDots } from './live/wait-dots.js';
import { createHudBrandMark } from '../player/branding.js';
import { enterSurface, exitSurface, resetSurface } from '../ui/interface-motion.js';
import { leaveLobbyForMatch } from './lobby-exit.js';
import { WorldView } from './world-view.js';
import { installTerritoryCountUI, territoryCounts } from './menu-territory.js';
import type { TerritoryCounts } from './menu-territory.js';
import { cachedTerritory, registerTerritoryReader, rememberTerritory } from './territory-cache.js';
import { seedIcon } from './seed-icon.js';
import type { SeedFlushResult } from './seed-rewards.js';
import { settlePendingSeeds } from './seed-settle.js';
import type { SeedWallet } from '../../../server/src/seeds/types.js';

import {
  FIRST_ONLINE_CARD_KEY,
  friendlyJoinError,
  inviteLink,
  isSearchParked,
  isWellFormedInviteCode,
  normalizeInviteCodeInput,
  pageTitleForLobby,
  parseJoinHash,
  shareInviteText,
  toLobbyRow,
  trimLobbyList,
  yourTurnCount,
} from './lobby.js';

export type LobbyUiHooks = {
  /** Return to the main menu screen. */
  showMenu: () => void;
  /**
   * A finished duel's replay, fetched by the lobby (it owns the identity/token) and handed to the
   * page, which owns the player. Absent: a finished row simply re-opens the match, as before.
   */
  openReplay?: (payload: ReplayPayload) => void;
  /** Open the duel board. `liveJoin` is true only when the match turned ACTIVE while this player
   *  was on the screen (the waiting creator when the friend joins, or the joiner itself); it is
   *  false when the player returns to a match later. Used only to gate the one-off lottery. */
  openDuel?: (payload: {
    matchId: string;
    seat: 0 | 1;
    view: MatchViewPayload;
    token: string;
    liveJoin: boolean;
  }) => void;
  /**
   * Start a local game against the computer (the existing offline game). Offered from a long
   * parked search; the search keeps running in the background. Never touches online state, so the
   * offline save/Continue mechanism is unchanged.
   */
  startComputerGame?: () => void;
  /**
   * Play one of the game's own sound cues by name (the bank in `ui/sound-bank.ts`). The Territory
   * screen uses it so its keys speak the same voice as the board; absent, it is simply silent.
   */
  cue?: (name: string) => void;
  /**
   * The campaign level this device is on, for the Territory's selection line (owner report,
   * 2026-10-24). It is the SAME record the PLAY entry reads, so the two surfaces can never disagree
   * about the player's own number.
   */
  campaignLevel?: () => number | null;
  now?: () => number;
};

type OnlineScreen = 'hub' | 'waiting' | 'join' | 'world' | null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type OnlineLobbyController = {
  enabled: boolean;
  openHub(): Promise<void>;
  /**
   * The shared world map, opened as its own read-only view. `from` is where the player came from:
   * the main menu (owner direction 2026-10-15 — the world map is a TOP-LEVEL menu entry, never in
   * the PLAY submenu) or the online hub. The back control returns to exactly that place, so the
   * main menu never bounces a player into the online hub.
   */
  openWorld(from: 'hub' | 'menu'): void;
  /**
   * Leave the lobby for a match: the one transition every entry point uses (a match row, a friend
   * joining, a join code, a Territory challenge). Tears the Territory view down and gives the
   * visible lobby screen the interface's own exit beat before `#game` is shown. `showScreen` hides
   * every lobby screen regardless, so this is the transition, not the guarantee.
   */
  leaveForMatch(): void;
  handleBootHash(): Promise<void>;
  refreshTitle(): void;
  /** Live duels: open one of my matches by id (web/src/online/live/). */
  openMatch?(matchId: string): Promise<void>;
  /**
   * A rematch from a finished standard duel. Mutual (2026-10-22): the first press waits, the
   * second press starts the game for both. `finishedMatchId` is the duel that just ended; with an
   * older server (no rematch endpoint) it falls back to a fresh invite, as before.
   */
  rematch(finishedMatchId?: string | null): Promise<void>;
  trainingSeedTicket(botLevel: number): Promise<{ id: string; seed: number } | null>;
  syncSeedRewards(): Promise<SeedFlushResult>;
};

export const installOnlineLobby = (hooks: LobbyUiHooks): OnlineLobbyController => {
  const api = duelApiUrl();
  const enabled = onlineBuildEnabled();
  const menuOnline = document.getElementById('menu-online') as HTMLButtonElement | null;
  if (menuOnline) menuOnline.hidden = !enabled;
  if (!enabled || !api) {
    return {
      enabled: false,
      openHub: async () => undefined,
      openWorld: () => undefined,
      leaveForMatch: () => undefined,
      handleBootHash: async () => undefined,
      refreshTitle: () => undefined,
      rematch: async () => undefined,
      trainingSeedTicket: async () => null,
      syncSeedRewards: async () => ({ awards: [], refused: [] }),
    };
  }

  // Self-healing identity: the lobby client owns the 401 recovery hook. Any authenticated lobby
  // call (create, find, join, list, open a match, link code) rejected because the stored token is
  // stale silently mints a fresh guest and retries the SAME request once. The live duel has its own
  // client (web/src/main.ts) with NO hook, so a token rejected mid-match surfaces an honest error
  // instead of swapping identity and abandoning the duel.
  let identityStore: IdentityStore | null = null;
  const client = new DuelClient({
    baseUrl: api,
    storage: browserStorage(),
    ...(duelRegion() ? { region: duelRegion()! } : {}),
    onUnauthorized: async () => {
      if (!identityStore) return null;
      const status = await identityStore.recover();
      return status.ok ? status.identity.token : null;
    },
  });
  const identity: IdentityStore = createIdentityStore({
    client,
    onReplaced: () => onIdentityReplaced(),
  });
  identityStore = identity;
  let identityReplaced = false;
  const now = hooks.now ?? (() => Date.now());

  /**
   * ONE lobby action at a time. The server ignores a duplicate find/create/join, but the client
   * must not send one either: a second tap while the first request is in flight is refused before
   * it can reach the network, the key it came from is locked with `aria-busy` (a pending face),
   * and the lock is released on success, failure and timeout. The guard itself is DOM-free and
   * unit-tested (web/tests/lobby-action-guard.test.ts); this only paints the control.
   */
  const pendingControlIds: Record<string, string> = { find: 'online-find', create: 'online-create', join: 'online-join-submit' };
  let pendingControl: HTMLButtonElement | null = null;
  const paintPending = (action: string | null) => {
    if (pendingControl) {
      // Give the key back exactly as it was: a control disabled for its own reason stays disabled.
      pendingControl.disabled = pendingControl.dataset.pendingWasDisabled === '1';
      pendingControl.removeAttribute('aria-busy');
      pendingControl.classList.remove('is-pending');
      delete pendingControl.dataset.pendingWasDisabled;
      pendingControl = null;
    }
    if (!action) return;
    const el = document.getElementById(pendingControlIds[action] ?? '') as HTMLButtonElement | null;
    if (!el) return;
    pendingControl = el;
    el.dataset.pendingWasDisabled = el.disabled ? '1' : '0';
    el.disabled = true;
    el.setAttribute('aria-busy', 'true');
    el.classList.add('is-pending');
  };
  const guard = createLobbyActionGuard({ onPending: paintPending });

  let matches: MatchListEntry[] = [];
  let waiting: { matchId: string; inviteCode: string } | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let serverOffset = 0;
  let worldView: WorldView | null = null;

  /**
   * THE DISCLOSURE'S OWN STATE — and the guard against the list snapping shut.
   *
   * The hub refreshes the match list on a timer (and after joins/searches), so `renderMatches`
   * runs many times while the player looks at the screen. It must never decide whether the list is
   * open: it only PAINTS `matchesExpanded`. Only a click on the disclosure changes this boolean.
   * That is the whole fix for the obvious bug ("a poll re-collapses the panel"): the renderer has
   * no write to this state, so a poll cannot close what the player opened. The choice survives
   * screen changes for the session because this module-scoped value is not reset on `openHub`.
   */
  let matchesExpanded = false;
  /** A cheap fingerprint of the painted rows: unchanged polls do not rebuild the DOM at all. */
  let matchesSignature = '';
  /** One list request at a time, so a 10s poll can never stack behind a slow network. */
  let reloadInFlight = false;
  let hubPollTimer: ReturnType<typeof setInterval> | null = null;
  const HUB_POLL_MS = 10_000;

  const stopHubPoll = () => {
    if (hubPollTimer) {
      clearInterval(hubPollTimer);
      hubPollTimer = null;
    }
  };

  // How the join screen was reached. A typed code joins straight away; a link arrival confirms
  // first (an intentional asymmetry — a forwarded link may reach the wrong person).
  let joinMode: 'typed' | 'link' = 'typed';
  let linkCode: string | null = null;
  /**
   * Where the world map was opened from, so its back control returns there: the online hub, or the
   * main menu's own top-level entry.
   */
  let worldFrom: 'hub' | 'menu' = 'hub';

  // Phase 7.5: the parked Find-opponent search. It is independent of the invite `waiting` screen
  // and keeps running (its own timer) while the player is on the board playing the computer.
  let search: { token: string; matchId: string; startedAt: number } | null = null;
  let searchTimer: ReturnType<typeof setInterval> | null = null;
  let computerGameActive = false;
  let pendingMatched: { token: string; payload: MatchViewPayload } | null = null;

  /**
   * A rejected token was replaced with a fresh guest. The old token's matches are unreachable (the
   * server no longer knows it), so stop polling any waiting/search state tied to it and remember to
   * tell the player with ONE line. A live duel is untouched — it runs on its own client and never
   * calls this hook.
   */
  const onIdentityReplaced = () => {
    identityReplaced = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopSearchTimer();
    stopHubPoll();
    search = null;
    waiting = null;
  };

  /** Show the one honest line for a replaced identity in whichever online screen is open. */
  const flashIdentityReplaced = () => {
    if (!identityReplaced) return;
    identityReplaced = false;
    const line = ONLINE.identityReset;
    if (!hub.hidden) notice('online-hub-notice', line);
    else if (!waitingEl.hidden) notice('online-waiting-notice', line);
    else if (!joinEl.hidden) notice('online-join-notice', line);
  };

  const hub = $('online-hub');
  const waitingEl = $('online-waiting');
  const joinEl = $('online-join');
  const worldEl = $('online-world-screen');
  const menuEl = document.getElementById('menu');

  // The SHARED wait-dots stylesheet (web/src/online/live/wait-dots.ts). The lobby can be the first
  // online surface a player sees, before any live UI is installed, so inject it here once. Guarded
  // so a second install (or the live UI) never adds a duplicate.
  if (typeof document !== 'undefined' && !document.getElementById('futasaku-wait-dots-css')) {
    const style = document.createElement('style');
    style.id = 'futasaku-wait-dots-css';
    style.textContent = WAIT_DOTS_CSS;
    document.head.append(style);
  }

  // The waiting headline is ONE stable text node plus ONE persistent dots node: the search screen
  // re-renders every 2s, and rebuilding the dots each time would restart the CSS animation before
  // it could cycle (the same reason the live pill builds its dots once).
  const waitingTitleText = document.createTextNode('');
  const waitingTitleDots = waitDots();
  waitingTitleDots.hidden = true;
  $('online-waiting-title').replaceChildren(waitingTitleText, waitingTitleDots);
  const setWaitingTitle = (text: string, dotsVisible: boolean) => {
    waitingTitleText.data = text;
    waitingTitleDots.hidden = !dotsVisible;
  };

  // The small, treeless Futasaku wordmark the game HUD shows top-right (#hud-brand). Built once
  // and moved into whichever online submenu header is open, so every screen carries the same mark
  // at the same size instead of a big wordmark. Failure here just leaves the header bare.
  let brandMark: SVGSVGElement | null = null;
  try {
    brandMark = createHudBrandMark('futasaku-online-white');
    brandMark.id = 'online-brand';
    brandMark.classList.add('online-brand');
  } catch {
    brandMark = null;
  }
  const screens: Record<'hub' | 'waiting' | 'join' | 'world', HTMLElement> = { hub, waiting: waitingEl, join: joinEl, world: worldEl };
  const notice = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  /**
   * The same notice line, but ending in the SHARED animated ellipsis. The dots node is rebuilt
   * here on purpose: these lines are written once when a screen opens (never on a timer), so a
   * fresh node cannot restart an animation that is already running.
   */
  const noticeWithDots = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.replaceChildren(document.createTextNode(text), waitDots());
  };

  const show = (next: OnlineScreen) => {
    if (next !== 'world') worldView?.close();
    hub.hidden = next !== 'hub';
    waitingEl.hidden = next !== 'waiting';
    joinEl.hidden = next !== 'join';
    worldEl.hidden = next !== 'world';
    // Each online screen arrives on the shared interface beat; the screens we leave are reset so a
    // half-finished entrance can never surface later. No transform on the game: these are menus.
    for (const [key, el] of Object.entries(screens) as [keyof typeof screens, HTMLElement][]) {
      if (key === next) enterSurface(el, { travel: 6 });
      else resetSurface(el);
    }
    // The online screens are their own full-screen view: keep the main menu fully out of the
    // way (hidden, not merely behind) so its title/buttons can never bleed through the panel.
    // Every path back to the menu goes through hooks.showMenu() → showScreen('menu').
    if (menuEl) menuEl.hidden = next !== null;
    if (brandMark) {
      const head = next ? screens[next].querySelector('.online-head') : null;
      if (head && brandMark.parentElement !== head) head.append(brandMark);
    }
    if (next !== 'waiting' && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    // The match list only refreshes while the hub is the visible screen.
    if (next !== 'hub') stopHubPoll();
  };

  /**
   * THE ONE WAY OUT OF THE LOBBY FOR A MATCH (owner report, 2026-10-28: "accepting challenge in
   * territory opens the duel screen under it ... everything on top of eachother — can never happen").
   *
   * Hiding the screens is `showScreen`'s job (it calls the same shared list, so it can never be
   * skipped); this is the deliberate part: the Territory view is torn down whole — the challenge
   * sheet lives on `<body>`, outside the screen that is leaving, so it goes now rather than fading
   * over the board — and the screen the player is looking at leaves on the interface's own beat
   * (`leaveLobbyForMatch`). The game screen itself is never animated: it is only revealed.
   */
  const leaveForMatch = (): void => {
    leaveLobbyForMatch({ teardown: () => worldView?.close(true) });
  };

  const fillCopy = () => {
    $('online-hub-title').textContent = ONLINE.hubTitle;
    $('online-create').textContent = ONLINE.create;
    const findBtn = document.getElementById('online-find') as HTMLButtonElement | null;
    if (findBtn) {
      findBtn.textContent = ONLINE.findOpponent;
      findBtn.hidden = !findOpponentEnabled();
      findBtn.title = ONLINE.findOpponentHint;
    }
    $('online-join-open').textContent = ONLINE.join;
    const worldBtn = document.getElementById('online-world') as HTMLButtonElement | null;
    if (worldBtn) worldBtn.textContent = ONLINE.worldMap;
    // The Territory's heading AND its spoken name come from the one string (owner, 2026-10-16:
    // the shared screen is called Territory). It opens from two places - the menu and the hub - and
    // both must name the same screen.
    $('online-world-title').textContent = ONLINE.worldTitle;
    $('online-world-screen').setAttribute('aria-label', ONLINE.worldTitle);
    // The Your-matches label carries a COUNT, so `paintMatchesDisclosure` owns its text. Writing
    // the count-less string here would wipe the number every time another screen calls fillCopy.
    $('online-matches-empty').textContent = ONLINE.emptyMatches;
    // The waiting TITLE is owned by `setWaitingTitle` (it carries the shared animated dots), so it
    // is deliberately not written here — writing textContent would drop the persistent dots node.
    $('online-waiting-body').textContent = ONLINE.waitingBody;
    $('online-waiting-expiry').textContent = ONLINE.waitingExpiry;
    $('online-share').textContent = ONLINE.share;
    $('online-copy').textContent = ONLINE.copyLink;
    const codeHint = document.getElementById('online-code-hint');
    if (codeHint) codeHint.textContent = ONLINE.codeTapCopy;
    $('online-cancel-match').textContent = ONLINE.cancelMatch;
    $('online-join-title').textContent = ONLINE.joinTitle;
    $('online-join-prompt').textContent = ONLINE.joinPrompt;
    $('online-join-submit').textContent = ONLINE.joinSubmit;
    const joinCancel = document.getElementById('online-join-cancel');
    if (joinCancel) joinCancel.textContent = ONLINE.cancel;
    const storageNote = document.getElementById('online-storage-note');
    if (storageNote) storageNote.textContent = ONLINE.storageNote;
    const linkHelp = document.getElementById('online-link-help');
    if (linkHelp) linkHelp.textContent = ONLINE.linkCodeHelp;
    const linkMake = document.getElementById('online-link-make');
    if (linkMake) linkMake.textContent = ONLINE.linkCodeMake;
    const tagline = document.getElementById('menu-tagline');
    if (tagline) tagline.textContent = ONLINE.tagline;
    if (menuOnline) {
      menuOnline.textContent = ONLINE.playOnline;
      menuOnline.setAttribute('aria-label', ONLINE.playOnline);
    }
    // The 0.5 product menu MOVES #menu-new into the PLAY submenu and labels it "Practice match" (main.ts).
    // Only the flat legacy menu names it "Play offline"; fillCopy runs again on every hub open, so
    // writing it here would stomp the product label back to "Play offline".
    const offline = document.getElementById('menu-new');
    if (offline && !offline.closest('#play-actions')) {
      offline.textContent = ONLINE.playOffline;
      offline.setAttribute('aria-label', ONLINE.playOffline);
    }
  };

  const refreshTitle = () => {
    document.title = pageTitleForLobby(yourTurnCount(matches));
  };

  /**
   * Paint the disclosure from `matchesExpanded`. This function is the ONLY place the button,
   * badge and panel chrome are written, and it never ASSIGNS the open/closed choice — a render
   * caused by the poll therefore cannot close a list the player opened.
   */
  const paintMatchesDisclosure = (total: number, waiting: number) => {
    const toggle = $('online-matches-toggle') as HTMLButtonElement;
    const label = $('online-matches-title');
    const badge = $('online-matches-attention');
    const panel = $('online-matches-panel');
    label.textContent = yourMatchesLabel(total);
    toggle.setAttribute('aria-expanded', String(matchesExpanded));
    // The visible label plus the badge in words: a screen reader never hears a bare "!".
    toggle.setAttribute('aria-label', yourMatchesButtonName(total, waiting));
    badge.hidden = waiting === 0;
    badge.textContent = '!';
    panel.hidden = !matchesExpanded;
  };

  const setMatchesExpanded = (open: boolean) => {
    if (matchesExpanded === open) return;
    matchesExpanded = open;
    const toggle = $('online-matches-toggle') as HTMLButtonElement;
    const panel = $('online-matches-panel');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      // The lobby's own interface beat; `enterSurface` is already gated by Reduce motion and the
      // OS preference, and the badge itself is static (no animation to gate).
      enterSurface(panel, { travel: 4, scale: 0.99 });
    } else {
      exitSurface(panel, {
        travel: 4,
        scale: 0.99,
        onDone: () => {
          // A rapid reopen cancels `exitSurface`, so `onDone` must also re-check the state.
          if (!matchesExpanded) panel.hidden = true;
        },
      });
    }
  };

  const renderMatches = () => {
    const list = $('online-matches');
    const empty = $('online-matches-empty');
    const shown = trimLobbyList(matches);
    const rows = shown.map((entry) => ({ entry, row: toLobbyRow(entry, now(), serverOffset) }));
    const waiting = countNeedingResponse(shown);
    paintMatchesDisclosure(rows.length, waiting);
    empty.hidden = rows.length > 0;
    // Rebuild rows only when something they show actually changed. A poll that finds the same
    // list leaves the DOM (and any keyboard focus) exactly where it was.
    const signature = rows
      .map(({ entry, row }) =>
        [
          row.matchId,
          row.bucket,
          row.opponentName,
          row.statusWord,
          row.timeLeft ?? '',
          row.warnLastTwoHours ? 1 : 0,
          row.graceWord ?? '',
          needsMyResponse(entry) ? 1 : 0,
        ].join('\u0001'),
      )
      .join('\u0002');
    if (signature !== matchesSignature) {
      matchesSignature = signature;
      const focusedId =
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.matchId ?? null : null;
      list.replaceChildren();
      for (const { entry, row } of rows) {
        const needsResponse = needsMyResponse(entry);
        const li = document.createElement('li');
        li.className = `online-row bucket-${row.bucket}${row.warnLastTwoHours || row.atRisk ? ' warn' : ''}${
          needsResponse ? ' needs-response' : ''
        }`;
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.dataset.matchId = row.matchId;
        // Grace is shown as a word next to the clock (never colour alone), plus the last-2-hours warn.
        const warnSmall = [
          row.graceWord ? escapeHtml(row.graceWord) : '',
          row.warnLastTwoHours ? escapeHtml(ONLINE.warnLastTwoHours) : '',
        ]
          .filter(Boolean)
          .map((t) => `<small>${t}</small>`)
          .join('');
        // The "!" is decoration only (aria-hidden): the row's own words say "Your turn", and the
        // disclosure button carries the count in its accessible name.
        li.innerHTML = `<span class="online-row-mark" aria-hidden="true">
          <span class="online-row-icon" data-icon="${row.statusIcon}"></span>
          ${needsResponse ? '<span class="online-row-attention">!</span>' : ''}
        </span>
        <span class="online-row-main"><b>${escapeHtml(row.opponentName)}</b>
        <span class="online-row-status">${escapeHtml(row.statusWord)}</span></span>
        <span class="online-row-time">${row.timeLeft ? escapeHtml(row.timeLeft) : ''}${warnSmall}</span>`;
      const open = () => void (row.replayable ? openReplay(row.matchId) : openMatch(row.matchId));
      li.addEventListener('click', open);
      li.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
      list.appendChild(li);
      }
      if (focusedId) {
        const again = [...list.querySelectorAll<HTMLElement>('li[data-match-id]')].find(
          (el) => el.dataset.matchId === focusedId,
        );
        again?.focus();
      }
    }
    refreshTitle();
  };

  const ensureIdentity = async () => {
    const status = await identity.ensure();
    if (!status.ok) {
      notice('online-hub-notice', status.message || ONLINE.errStorage);
      return null;
    }
    return status.identity;
  };
  // Seeds settle through the ONE path that also serves the finish card (online/seed-settle.ts).
  // It owns the deadline, the retry and the identity for a payout, so the hub and a finish card can
  // never disagree about a proof, and a player who never opens this hub is still paid.
  const syncSeedRewards = () => settlePendingSeeds();
  const trainingSeedTicket = async (botLevel: number) => {
    const id = await ensureIdentity();
    if (!id) return null;
    try {
      const ticket = await client.issueTrainingTicket(id.token, botLevel);
      return { id: ticket.id, seed: ticket.seed };
    } catch { return null; }
  };
  worldView = new WorldView(client, async () => {
    const id = await ensureIdentity();
    return id ? { token: id.token, playerId: id.playerId } : null;
  });
  worldView.setCue((name) => hooks.cue?.(name));
  // The Territory's own-tile level comes from this device's campaign record, not from the server's
  // last paid clear (owner report, 2026-10-24).
  worldView.setMyLevel(() => hooks.campaignLevel?.() ?? null);

  const reloadMatches = async () => {
    // Single flight: a slow request must not let the 10s hub poll stack a second list read.
    if (reloadInFlight) return;
    reloadInFlight = true;
    try {
      const id = await ensureIdentity();
      if (!id) return;
      try {
        const res = await client.listMatches(id.token);
        serverOffset = res.serverNow - now();
        matches = res.matches;
        renderMatches();
        notice('online-hub-notice', '');
        flashIdentityReplaced();
      } catch (error) {
        notice('online-hub-notice', errorMessage(error));
      }
    } finally {
      reloadInFlight = false;
    }
  };

  /**
   * A quiet list refresh while the hub is the visible screen. The red "!" lives on a COLLAPSED
   * button, so it is only useful if it can appear without the player touching anything: an
   * opponent's Throw (or a friend joining) must light it. Ten seconds is slower than a live duel's
   * 2s play poll — this is the menu, not the board — and the timer stops with the screen.
   */
  const startHubPoll = () => {
    stopHubPoll();
    hubPollTimer = setInterval(() => {
      if (hub.hidden) {
        stopHubPoll();
        return;
      }
      void reloadMatches();
    }, HUB_POLL_MS);
  };

  const maybeFirstCard = () => {
    const card = $('online-first-card');
    const storage = browserStorage();
    const seen = storage?.get(FIRST_ONLINE_CARD_KEY) === '1';
    if (seen) {
      card.hidden = true;
      return;
    }
    $('online-first-title').textContent = ONLINE.firstCardTitle;
    const ul = $('online-first-list');
    ul.replaceChildren();
    for (const line of ONLINE.firstCardLines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    $('online-first-ok').textContent = ONLINE.firstCardOk;
    card.hidden = false;
  };

  const openHub = async () => {
    fillCopy();
    show('hub');
    maybeFirstCard();
    closeMatchedPrompt();
    computerGameActive = false;
    // A search may still be running in the background: say so, but never block the hub.
    notice('online-hub-notice', search ? ONLINE.searchStatusSr : '');
    const linkBlock = document.getElementById('online-link-block');
    if (linkBlock) linkBlock.hidden = false;
    await reloadMatches();
    startHubPoll();
  };

  const openWaiting = (match: MatchSummary) => {
    waiting = { matchId: match.matchId, inviteCode: match.inviteCode };
    fillCopy();
    show('waiting');
    setWaitingMode('invite');
    setWaitingTitle(ONLINE.waitingTitle, true);
    $('online-waiting-body').textContent = ONLINE.waitingBody; // a rematch wait rewrites it
    $('online-invite-code').textContent = match.inviteCode;
    $('online-invite-code').setAttribute('aria-label', `${match.inviteCode}. ${ONLINE.codeTapCopy}.`);
    notice('online-waiting-notice', '');
    flashIdentityReplaced();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => void pollWaiting(), 2000);
  };

  const pollWaiting = async () => {
    if (!waiting) return;
    const id = identity.peek();
    if (!id) return;
    try {
      const res = await client.getState(id.token, waiting.matchId);
      serverOffset = res.serverNow - now();
      if (res.player.status === 'active') {
        const payload = res.player;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        // The friend just joined while we sat on the waiting screen: this is our live-join moment.
        launchDuel(id.token, payload, true);
      }
    } catch {
      /* keep waiting; quiet */
    }
  };

  const launchDuel = (token: string, player: MatchViewPayload, liveJoin: boolean) => {
    if (hooks.openDuel) {
      hooks.openDuel({ matchId: player.matchId, seat: player.seat, view: player, token, liveJoin });
      return;
    }
    notice('online-hub-notice', ONLINE.openDuelSoon);
    show('hub');
  };

  // ---- Phase 7.5: parked Find-opponent search ----

  /**
   * The waiting screen carries two honest modes: `invite` (share a code) and `search` (you are in
   * the queue). No new visual language: we only hide the invite-only controls and swap the words.
   */
  const setWaitingMode = (mode: 'invite' | 'search') => {
    waitingEl.dataset.mode = mode;
    waitingEl.setAttribute('aria-label', mode === 'search' ? ONLINE.searchTitle : ONLINE.waitingTitle);
    for (const id of ['online-invite-code', 'online-code-hint', 'online-share', 'online-copy', 'online-waiting-expiry']) {
      const el = document.getElementById(id);
      if (el) el.hidden = mode === 'search';
    }
    const cancel = document.getElementById('online-cancel-match') as HTMLButtonElement | null;
    if (cancel) cancel.textContent = mode === 'search' ? ONLINE.searchStop : ONLINE.cancelMatch;
    const options = document.getElementById('online-search-options');
    if (options && mode !== 'search') options.hidden = true;
  };

  const renderSearch = () => {
    if (!search) return;
    const parked = isSearchParked(now() - search.startedAt, parkedOfferMs());
    // Active search shows the animated dots; the parked "Nobody yet" offer is a still state.
    setWaitingTitle(parked ? ONLINE.searchParkedTitle : ONLINE.searchTitle, !parked);
    $('online-waiting-body').textContent = parked ? ONLINE.searchParkedBody : ONLINE.searchBody;
    const options = document.getElementById('online-search-options');
    if (options) options.hidden = !parked;
  };

  const stopSearchTimer = () => {
    if (searchTimer) {
      clearInterval(searchTimer);
      searchTimer = null;
    }
  };

  const stopSearch = () => {
    stopSearchTimer();
    search = null;
    setWaitingMode('invite');
  };

  const cancelSearchAndStop = async () => {
    const s = search;
    stopSearch();
    if (s) {
      try {
        await client.cancelSearch(s.token);
      } catch {
        /* calm: the search may already be gone */
      }
    }
  };

  /** Gentle, dismissible "Opponent found" prompt while the player is inside a computer game. */
  const openMatchedPrompt = (token: string, payload: MatchViewPayload) => {
    pendingMatched = { token, payload };
    const el = document.getElementById('online-matched');
    if (!el) {
      launchDuel(token, payload, true);
      return;
    }
    $('online-matched-title').textContent = ONLINE.matchedTitle;
    $('online-matched-body').textContent = ONLINE.matchedBody;
    const nowBtn = document.getElementById('online-matched-now') as HTMLButtonElement | null;
    const laterBtn = document.getElementById('online-matched-later') as HTMLButtonElement | null;
    if (nowBtn) nowBtn.textContent = ONLINE.matchedPlayNow;
    if (laterBtn) laterBtn.textContent = ONLINE.matchedLater;
    el.hidden = false;
    el.classList.remove('ix-closing');
    const card = el.querySelector<HTMLElement>('.online-card');
    if (card) enterSurface(card);
  };

  const closeMatchedPrompt = () => {
    pendingMatched = null;
    const el = document.getElementById('online-matched');
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.online-card');
    el.classList.add('ix-closing');
    const done = () => {
      if (!pendingMatched) el.hidden = true;
      el.classList.remove('ix-closing');
    };
    if (!exitSurface(card ?? el, { onDone: done })) done();
  };

  const pollSearch = async () => {
    if (!search) return;
    try {
      const res = await client.getState(search.token, search.matchId);
      serverOffset = res.serverNow - now();
      const payload = res.player;
      const token = search.token;
      if (payload.status === 'active') {
        stopSearch();
        void reloadMatches();
        if (computerGameActive) openMatchedPrompt(token, payload);
        else launchDuel(token, payload, true);
        return;
      }
      if (payload.status === 'finished') {
        // The parked search expired (nobody came within the window). Calm, honest exit.
        stopSearch();
        void openHub();
        notice('online-hub-notice', ONLINE.searchCancelled);
        return;
      }
    } catch {
      /* quiet: a transient failure must not drop a parked search */
    }
    renderSearch();
  };

  const startSearch = (token: string, matchId: string) => {
    search = { token, matchId, startedAt: now() };
    waiting = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    fillCopy();
    show('waiting');
    setWaitingMode('search');
    renderSearch();
    notice('online-waiting-notice', ONLINE.searchStatusSr);
    flashIdentityReplaced();
    stopSearchTimer();
    searchTimer = setInterval(() => void pollSearch(), 2000);
  };

  /**
   * A FINISHED duel's row opens its replay (owner brief, 2026-10-25): the last ten finished duels
   * are exactly what the list already shows, so the way in is the row itself. The authorised read
   * happens here because the lobby owns the identity and its token; the payload is handed to the
   * page, which owns the player.
   */
  const openReplay = async (matchId: string) => {
    const id = await ensureIdentity();
    if (!id) return;
    try {
      const res = await client.replay(id.token, matchId);
      serverOffset = res.serverNow - now();
      hooks.openReplay?.(res.replay);
    } catch {
      notice('online-hub-notice', REPLAY.unavailable);
    }
  };

  const openMatch = async (matchId: string) => {
    const id = await ensureIdentity();
    if (!id) return;
    try {
      // Only the turns this device has not seen (owner report, 2026-10-27: reopening a match
      // replayed the whole game and flickered, not just the opponent's move made meanwhile).
      const res = await client.openView(id.token, matchId);
      serverOffset = res.serverNow - now();
      if (res.player.status === 'waiting') {
        try {
          const summary = await client.getMatch(id.token, matchId);
          openWaiting(summary.match);
          return;
        } catch {
          notice('online-hub-notice', ONLINE.waitingInviteHint);
          return;
        }
      }
      // Returning to a match from the list is never a live join: no lottery, the chip carries it.
      launchDuel(id.token, res.player, false);
    } catch (error) {
      notice('online-hub-notice', errorMessage(error));
    }
  };

  // The Territory challenge sheet can open the linked duel it created. `openMatch` is declared here,
  // after the view was constructed, so the view is handed the opener once it exists.
  worldView?.setMatchOpener((matchId) => void openMatch(matchId));

  /**
   * Creates a fresh match and opens the invite/share screen. `started` is false when the guard
   * refused a second tap, so a caller such as rematch can tell "declined" from "failed".
   */
  const createMatch = async (): Promise<{ ok: boolean; started: boolean }> => {
    const out = await guard.run('create', async () => {
      const id = await ensureIdentity();
      if (!id) return false;
      try {
        const res = await client.createMatch(id.token);
        serverOffset = res.serverNow - now();
        openWaiting(res.match);
        return true;
      } catch (error) {
        notice('online-hub-notice', errorMessage(error));
        return false;
      }
    });
    return { ok: out.started && !out.timedOut && out.value === true, started: out.started };
  };

  /**
   * A rematch from a finished standard duel (owner, 2026-10-22: "they both press rematch = they're
   * straight in a new game"). The server pairs the two presses: the first creates the rematch and
   * waits on the usual waiting screen (which already enters the game the moment the seat fills),
   * the second enters it at once. The invite code stays on that screen as a second way in.
   * A server without the endpoint (before its deploy) answers NOT_FOUND, and then this is exactly
   * the old behaviour: a fresh invite via "Create a duel". On failure, land on the hub. A refused
   * second tap (the first request is still in flight) leaves the screen alone.
   */
  const rematch = async (finishedMatchId: string | null = null): Promise<void> => {
    if (finishedMatchId) {
      const out = await guard.run('create', async (): Promise<'done' | 'failed' | 'older-server'> => {
        const id = await ensureIdentity();
        if (!id) return 'failed';
        try {
          const res = await client.rematch(id.token, finishedMatchId);
          serverOffset = res.serverNow - now();
          if (res.player.status === 'active') {
            launchDuel(id.token, res.player, true);
            return 'done';
          }
          openWaiting(res.match);
          setWaitingTitle(ONLINE.rematchWaitingTitle, true);
          $('online-waiting-body').textContent = ONLINE.rematchWaitingBody;
          return 'done';
        } catch (error) {
          if (error instanceof DuelError && error.status === 404 && error.code === 'NOT_FOUND') return 'older-server';
          notice('online-hub-notice', errorMessage(error));
          return 'failed';
        }
      });
      if (!out.started) return;
      if (!out.timedOut && out.value === 'done') return;
      if (out.timedOut || out.value === 'failed') {
        await openHub();
        return;
      }
    }
    const created = await createMatch();
    if (created.started && !created.ok) await openHub();
  };

  const findOpponent = async () => {
    if (!findOpponentEnabled()) return;
    await guard.run('find', async () => {
      const id = await ensureIdentity();
      if (!id) return;
      noticeWithDots('online-hub-notice', ONLINE.findOpponentLooking);
      try {
        const res = await client.findOpponent(id.token);
        serverOffset = res.serverNow - now();
        if (res.paired && res.player.status === 'active') {
          // Paired with an opponent right now: a live join.
          launchDuel(id.token, res.player, true);
          return;
        }
        // Parked: we stay in the queue and keep polling, even if the player leaves the screen.
        startSearch(id.token, res.match.matchId);
      } catch (error) {
        notice('online-hub-notice', errorMessage(error));
      }
    });
  };

  const joinWithCode = async (raw: string) => {
    // Normalise first: a pasted whole link, or a code read aloud in groups, must still land.
    const cleaned = normalizeInviteCodeInput(raw);
    if (!cleaned) {
      notice('online-join-notice', ONLINE.joinPrompt);
      return;
    }
    if (!isWellFormedInviteCode(cleaned)) {
      // Never silently accept a malformed code: say what a code looks like.
      notice('online-join-notice', ONLINE.errCodeFormat);
      return;
    }
    await guard.run('join', async () => {
      const id = await ensureIdentity();
      if (!id) return;
      try {
        const res = await client.joinMatch(id.token, cleaned);
        serverOffset = res.serverNow - now();
        // Joining a duel in person is the joiner's live-join moment.
        launchDuel(id.token, res.player, true);
      } catch (error) {
        if (error instanceof DuelError && error.code === 'ALREADY_JOINED') {
          notice('online-join-notice', ONLINE.errAlreadyJoined);
          await reloadMatches();
          return;
        }
        notice('online-join-notice', error instanceof DuelError ? friendlyJoinError(error.code) : errorMessage(error));
      }
    });
  };

  /**
   * The join screen has two honest modes. `typed` (arrived from the hub) shows the code field and
   * joins straight away. `link` (arrived via #/join/CODE) hides the field and shows the confirm
   * with Join / Cancel, so a forwarded link gives a graceful exit. Reuses #online-join-confirm.
   */
  const setJoinMode = (mode: 'typed' | 'link', code = '') => {
    joinMode = mode;
    linkCode = mode === 'link' ? code : null;
    const input = $('online-join-code') as HTMLInputElement;
    const field = input.closest('.online-field') as HTMLElement | null;
    const confirm = $('online-join-confirm') as HTMLElement;
    const cancel = document.getElementById('online-join-cancel') as HTMLButtonElement | null;
    const viaLink = mode === 'link';
    if (field) field.hidden = viaLink;
    confirm.hidden = !viaLink;
    if (viaLink) confirm.textContent = ONLINE.joinConfirmUnknown;
    if (cancel) cancel.hidden = !viaLink;
    input.value = viaLink ? code : '';
    notice('online-join-notice', '');
  };

  const shareInvite = async () => {
    if (!waiting) return;
    const text = shareInviteText(waiting.inviteCode);
    const link = inviteLink(waiting.inviteCode);
    try {
      if (navigator.share) {
        await navigator.share({ title: ONLINE.brand, text, url: link });
        return;
      }
    } catch {
      /* fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(link);
      notice('online-waiting-notice', ONLINE.copied);
    } catch {
      notice('online-waiting-notice', link);
    }
  };

  const copyInvite = async () => {
    if (!waiting) return;
    const link = inviteLink(waiting.inviteCode);
    try {
      await navigator.clipboard.writeText(link);
      notice('online-waiting-notice', ONLINE.copied);
    } catch {
      notice('online-waiting-notice', link);
    }
  };

  /**
   * The code is the escape hatch: in-app browsers keep separate storage, links get truncated, and
   * people read codes aloud. Tapping the code itself copies just the code.
   */
  const copyInviteCode = async () => {
    if (!waiting) return;
    const code = waiting.inviteCode;
    try {
      await navigator.clipboard.writeText(code);
      notice('online-waiting-notice', ONLINE.codeCopied);
    } catch {
      // Clipboard blocked: show the code so it can still be read out.
      notice('online-waiting-notice', code);
    }
  };

  // ---- wire buttons ----
  fillCopy();
  /** The shared world view owns its refresh, pan/zoom, selection and purchases. */
  const renderWorld = () => worldView?.open();

  menuOnline?.addEventListener('click', () => void openHub());
  $('online-back').addEventListener('click', () => {
    show(null);
    hooks.showMenu();
    refreshTitle();
  });
  $('online-waiting-back').addEventListener('click', () => void openHub());
  $('online-join-back').addEventListener('click', () => void openHub());
  /**
   * The world map is reachable from TWO places and its back control is honest about which one: the
   * main menu entry (top-level, owner direction 2026-10-15) returns to the menu, the hub entry
   * returns to the hub. `openWorld` never touches identity or matches — the map is a public read.
   */
  const openWorld = (from: 'hub' | 'menu') => {
    worldFrom = from;
    fillCopy();
    show('world');
    void renderWorld();
  };
  document.getElementById('menu-world')?.addEventListener('click', () => openWorld('menu'));
  $('online-world-back').addEventListener('click', () => {
    if (worldFrom === 'hub') return void openHub();
    show(null);
    hooks.showMenu();
    refreshTitle();
  });
  document.getElementById('online-world')?.addEventListener('click', () => openWorld('hub'));
  // The first affordable claim is invited only on the quiet menu, never during a match,
  // animation, online turn or rematch flow. The server remembers acknowledgement per identity.
  let invitationOpen = false;
  let invitationDismissedThisSession = false;
  /**
   * The Territory entry's two read-outs. They are painted from the SAME menu-show pass that offers
   * the invitation, so the menu never pays a second wallet request for them (owner brief,
   * 2026-10-20). This is not a poll: one read when the menu appears, and only while it is on show.
   */
  const territoryUI = installTerritoryCountUI();
  let menuPass: Promise<void> | null = null;

  /**
   * The pair, read ONCE for this identity: the wallet and the map in one `Promise.all`. Used by the
   * menu pass below AND by the profile (through `registerTerritoryReader`), so the two surfaces can
   * never pay for two different reads of the same thing (owner brief, 2026-10-21). Unknown stays
   * unknown; the caller paints an em dash, never a 0.
   */
  const readMenuCounts = async (playerId?: string): Promise<TerritoryCounts | null> => {
    const id = await ensureIdentity();
    if (!id || (playerId && id.playerId !== playerId)) {
      if (menuEl?.hidden === false) territoryUI.paint(null);
      return null;
    }
    let wallet: SeedWallet | null = null;
    let world: WorldMapPayload['world'] | null = null;
    let incoming = 0;
    try {
      const [readWallet, map, challenges] = await Promise.all([
        client.seedWallet(id.token),
        client.worldMap(),
        // The menu's own signal: a challenge waiting for an answer. It is read in the SAME pass as
        // the wallet and the map, and a failure here only means the entry shows no signal.
        client.worldChallenges(id.token).catch(() => null),
      ]);
      wallet = readWallet;
      world = map.world;
      incoming = challenges?.incoming?.length ?? 0;
    } catch {
      // Offline, signed out, or a failed request: both read-outs stay hidden, together.
      wallet = null;
      world = null;
    }
    const counts = territoryCounts(wallet, world, id.playerId, incoming);
    rememberTerritory(id.playerId, counts);
    if (menuEl?.hidden === false) territoryUI.paint(counts);
    // The invitation reads the SAME wallet response; it never costs a second request.
    offerWorldInvitation(id, wallet);
    return counts;
  };
  registerTerritoryReader((playerId) => readMenuCounts(playerId));

  const offerWorldInvitation = (id: { token: string }, wallet: SeedWallet | null) => {
    if (invitationOpen || invitationDismissedThisSession || menuEl?.hidden !== false || !worldEl.hidden) return;
    if (!wallet || wallet.balance < 100 || wallet.worldInvitationSeen) return;
    invitationOpen = true;
    const sheet = document.createElement('div');
    sheet.className = 'world-invitation';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '100 Seeds');
    const card = document.createElement('div');
    card.className = 'world-invitation-card';
    const title = document.createElement('strong');
    title.textContent = '100 SEEDS';
    const line = document.createElement('p');
    line.textContent = 'Your place in the world is waiting.';
    const actions = document.createElement('div');
    const open = document.createElement('button');
    open.textContent = ONLINE.worldInviteOpen;
    const later = document.createElement('button');
    later.textContent = 'LATER';
    const finish = (go: boolean) => {
      sheet.remove(); invitationOpen = false; invitationDismissedThisSession = true;
      void client.acknowledgeWorldInvitation(id.token).catch(() => { /* Retry on a later session. */ });
      if (go) openWorld('menu');
    };
    open.addEventListener('click', () => finish(true));
    later.addEventListener('click', () => finish(false));
    actions.append(open, later);
    card.append(seedIcon(28), title, line, actions);
    sheet.append(card);
    document.body.append(sheet);
    open.focus();
  };

  /**
   * ONE pass per menu show: settle queued proofs, read the wallet ONCE and the world ONCE, paint
   * the two read-outs, then use that same wallet for the invitation card. Single-flight, so a
   * burst of `futasaku:menu` events can never stack requests. Any failure hides both numbers (a
   * stale or invented value is worse than no value); the label and the entry stay untouched.
   */
  const refreshMenu = (): Promise<void> => {
    if (menuEl?.hidden !== false) return Promise.resolve();
    // A return from another screen never blinks: paint what is known for THIS identity, and clear
    // at once when the identity changed (a sign-out reload, or a fresh guest).
    territoryUI.paint(cachedTerritory(identity.peek()?.playerId ?? null));
    if (menuPass) return menuPass;
    menuPass = (async () => {
      try {
        // Settle queued Seed proofs first, so the wallet read below already includes them.
        await syncSeedRewards();
        if (menuEl?.hidden !== false) return;
        // One wallet + one map read, remembered for the profile too (territory-cache.ts).
        await readMenuCounts();
      } finally {
        menuPass = null;
      }
    })();
    return menuPass;
  };
  window.addEventListener('futasaku:menu', () => { void refreshMenu(); });
  if (menuEl?.hidden === false) void refreshMenu();
  $('online-create').addEventListener('click', () => void createMatch());
  // The "Your matches" disclosure. Opening also asks for the freshest list; the render it causes
  // reads `matchesExpanded`, so it cannot shut the panel it just opened.
  $('online-matches-toggle').addEventListener('click', () => {
    const open = !matchesExpanded;
    setMatchesExpanded(open);
    if (open) void reloadMatches();
  });
  document.getElementById('online-find')?.addEventListener('click', () => void findOpponent());
  $('online-join-open').addEventListener('click', () => {
    fillCopy();
    show('join');
    setJoinMode('typed');
  });
  $('online-join-submit').addEventListener('click', () => {
    const input = $('online-join-code') as HTMLInputElement;
    void joinWithCode(joinMode === 'link' && linkCode ? linkCode : input.value);
  });
  document.getElementById('online-join-cancel')?.addEventListener('click', () => {
    // Cancel a link arrival: leave without joining. The shared hub is the graceful exit.
    setJoinMode('typed');
    void openHub();
  });
  $('online-share').addEventListener('click', () => void shareInvite());
  $('online-copy').addEventListener('click', () => void copyInvite());
  // The code is tappable (or Enter/Space when focused) so a blocked link still has a way through.
  $('online-invite-code').addEventListener('click', () => void copyInviteCode());
  $('online-invite-code').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      void copyInviteCode();
    }
  });
  // One button, two honest jobs: stop a parked search (search screen), or cancel the waiting match
  // (invite screen).
  $('online-cancel-match').addEventListener('click', () => {
    if (search && waitingEl.dataset.mode === 'search') {
      void (async () => {
        await cancelSearchAndStop();
        await openHub();
        notice('online-hub-notice', ONLINE.searchCancelled);
      })();
      return;
    }
    // Invite waiting screen: retire the match ON THE SERVER so it stops lingering as an "open"
    // duel until the 48h window runs out. Owner-only and idempotent server-side; confirmed here so
    // a stray tap cannot silently kill a shared invite.
    const current = waiting;
    if (!current) {
      void openHub();
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm(ONLINE.cancelMatchConfirm)) return;
    void (async () => {
      const id = identity.peek();
      try {
        if (id) await client.cancelMatch(id.token, current.matchId);
      } catch {
        /* calm: the match may already be gone (expired, or cancelled on another device) */
      }
      if (waiting?.matchId === current.matchId) waiting = null;
      await openHub();
    })();
  });
  // Play the computer: the offline game starts and the search KEEPS RUNNING in the background.
  document.getElementById('online-search-computer')?.addEventListener('click', () => {
    computerGameActive = true;
    hooks.startComputerGame?.();
  });
  // Invite a friend instead: stop the search, then open the invite screen.
  document.getElementById('online-search-invite')?.addEventListener('click', () => {
    void (async () => {
      await cancelSearchAndStop();
      await createMatch();
    })();
  });
  // Keep searching: hide the offer and give the queue another full window.
  document.getElementById('online-search-keep')?.addEventListener('click', () => {
    if (search) search.startedAt = now();
    renderSearch();
  });
  // Opponent found while playing the computer: the offline game stays resumable.
  document.getElementById('online-matched-now')?.addEventListener('click', () => {
    const pending = pendingMatched;
    closeMatchedPrompt();
    if (pending) launchDuel(pending.token, pending.payload, true);
  });
  document.getElementById('online-matched-later')?.addEventListener('click', () => {
    closeMatchedPrompt();
    notice('online-hub-notice', ONLINE.matchedNotice);
    void reloadMatches();
  });
  $('online-first-ok').addEventListener('click', () => {
    browserStorage()?.set(FIRST_ONLINE_CARD_KEY, '1');
    $('online-first-card').hidden = true;
  });

  const linkMake = document.getElementById('online-link-make');
  const linkRedeem = document.getElementById('online-link-redeem');
  const linkStatus = document.getElementById('online-link-status');
  const linkBlock = document.getElementById('online-link-block');
  if (linkBlock) linkBlock.hidden = false;
  linkMake?.addEventListener('click', async () => {
    const id = await ensureIdentity();
    if (!id || !linkStatus) return;
    try {
      const res = await identity.createLinkCode();
      linkStatus.textContent = ONLINE.linkCodeDone(res.code);
    } catch (error) {
      linkStatus.textContent = errorMessage(error);
    }
  });
  linkRedeem?.addEventListener('click', async () => {
    const input = document.getElementById('online-link-redeem-input') as HTMLInputElement | null;
    if (!input || !linkStatus) return;
    const status = await identity.redeemLinkCode(input.value.trim());
    linkStatus.textContent = status.ok ? ONLINE.copied : status.message;
  });

  const handleBootHash = async () => {
    const hash = typeof location !== 'undefined' ? location.hash : '';
    // Only a join link brings us here. Anything else (no hash, the tutorial, the menu) is ignored.
    if (!hash.startsWith('#/join')) return;
    const code = parseJoinHash(hash);
    fillCopy();
    show('join');
    // Clear hash so refresh does not re-prompt forever.
    history.replaceState(null, '', location.pathname + location.search);
    if (code) {
      setJoinMode('link', code);
      return;
    }
    // A join link that is malformed or truncated: land on the join screen and say why. Never a
    // blank screen or a silent no-op.
    setJoinMode('typed');
    notice('online-join-notice', ONLINE.errLinkBroken);
    ($('online-join-code') as HTMLInputElement).focus();
  };

  return { enabled: true, openHub, openWorld, leaveForMatch, handleBootHash, refreshTitle, openMatch, rematch, trainingSeedTicket, syncSeedRewards };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const errorMessage = (error: unknown) => {
  if (error instanceof DuelError) return friendlyJoinError(error.code) || error.message;
  if (error instanceof Error) return error.message;
  return ONLINE.errGeneric;
};
