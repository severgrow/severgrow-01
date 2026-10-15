// Phase 4 — online menu / lobby screens. Duel play opens in Phase 5.

import { DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
import type { MatchListEntry, MatchSummary, MatchViewPayload } from '../../../server/src/protocol.js';
import { ONLINE } from '../../../src/strings.js';
import { createIdentityStore } from './identity.js';
import type { IdentityStore } from './identity.js';
import { duelApiUrl, duelRegion, findOpponentEnabled, onlineBuildEnabled, parkedOfferMs } from './config.js';
import { WAIT_DOTS_CSS, waitDots } from './live/wait-dots.js';
import { createHudBrandMark } from '../player/branding.js';
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
  now?: () => number;
};

type OnlineScreen = 'hub' | 'waiting' | 'join' | 'world' | null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type OnlineLobbyController = {
  enabled: boolean;
  openHub(): Promise<void>;
  handleBootHash(): Promise<void>;
  refreshTitle(): void;
  /** Live duels: open one of my matches by id (web/src/online/live/). */
  openMatch?(matchId: string): Promise<void>;
  /**
   * A rematch from a finished standard duel: create a fresh match and show the existing
   * invite/share screen (the same one `createMatch` / "Create a duel" opens).
   */
  rematch(): Promise<void>;
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
      handleBootHash: async () => undefined,
      refreshTitle: () => undefined,
      rematch: async () => undefined,
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

  let matches: MatchListEntry[] = [];
  let waiting: { matchId: string; inviteCode: string } | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let serverOffset = 0;

  // How the join screen was reached. A typed code joins straight away; a link arrival confirms
  // first (an intentional asymmetry — a forwarded link may reach the wrong person).
  let joinMode: 'typed' | 'link' = 'typed';
  let linkCode: string | null = null;

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
    hub.hidden = next !== 'hub';
    waitingEl.hidden = next !== 'waiting';
    joinEl.hidden = next !== 'join';
    worldEl.hidden = next !== 'world';
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
    $('online-world-title').textContent = ONLINE.worldTitle;
    $('online-matches-title').textContent = ONLINE.yourMatches;
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
    // The 0.5 product menu MOVES #menu-new into the PLAY submenu and labels it "Training" (main.ts).
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

  const renderMatches = () => {
    const list = $('online-matches');
    const empty = $('online-matches-empty');
    const rows = trimLobbyList(matches).map((e) => toLobbyRow(e, now(), serverOffset));
    list.replaceChildren();
    empty.hidden = rows.length > 0;
    for (const row of rows) {
      const li = document.createElement('li');
      li.className = `online-row bucket-${row.bucket}${row.warnLastTwoHours || row.atRisk ? ' warn' : ''}`;
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
      li.innerHTML = `<span class="online-row-icon" data-icon="${row.statusIcon}" aria-hidden="true"></span>
        <span class="online-row-main"><b>${escapeHtml(row.opponentName)}</b>
        <span class="online-row-status">${escapeHtml(row.statusWord)}</span></span>
        <span class="online-row-time">${row.timeLeft ? escapeHtml(row.timeLeft) : ''}${warnSmall}</span>`;
      const open = () => void openMatch(row.matchId);
      li.addEventListener('click', open);
      li.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
      list.appendChild(li);
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

  const reloadMatches = async () => {
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
  };

  const openWaiting = (match: MatchSummary) => {
    waiting = { matchId: match.matchId, inviteCode: match.inviteCode };
    fillCopy();
    show('waiting');
    setWaitingMode('invite');
    setWaitingTitle(ONLINE.waitingTitle, true);
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
  };

  const closeMatchedPrompt = () => {
    pendingMatched = null;
    const el = document.getElementById('online-matched');
    if (el) el.hidden = true;
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

  const openMatch = async (matchId: string) => {
    const id = await ensureIdentity();
    if (!id) return;
    try {
      const res = await client.getState(id.token, matchId);
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

  /** Creates a fresh match and opens the invite/share screen. `false` when it could not. */
  const createMatch = async (): Promise<boolean> => {
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
  };

  /**
   * A rematch from a finished standard duel. Identical to "Create a duel" from the hub — a fresh
   * match with a fresh invite code, shown on the same waiting/share screen. On failure, land on the
   * hub, which is where "Create a duel" reports its error line.
   */
  const rematch = async (): Promise<void> => {
    if (!(await createMatch())) await openHub();
  };

  const findOpponent = async () => {
    if (!findOpponentEnabled()) return;
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
  /**
   * The shared world map: a PUBLIC read (no account needed), the same grid for everyone. View only
   * — the player is looking at marks other people earned, so there is nothing to press.
   */
  const renderWorld = async () => {
    const grid = document.getElementById('online-world-grid');
    const summary = document.getElementById('online-world-summary');
    if (!grid) return;
    if (summary) summary.textContent = ONLINE.worldLoading;
    notice('online-world-notice', '');
    grid.replaceChildren();
    try {
      const payload = await client.worldMap();
      if (summary) {
        summary.textContent =
          payload.filled === 0 ? ONLINE.worldEmpty : ONLINE.worldHeld(payload.filled, payload.cells);
      }
      const byCell = new Map(payload.tiles.map((t) => [t.cell, t]));
      for (let cell = 0; cell < payload.cells; cell++) {
        const tile = byCell.get(cell);
        const el = document.createElement('div');
        el.className = 'world-cell';
        el.dataset.held = tile ? 'true' : 'false';
        if (tile?.tookOver) el.dataset.tookover = 'true';
        if (tile) {
          const name = tile.ownerName?.trim() || '';
          const mark = document.createElement('span');
          // A held cell carries the holder's initial; the full name rides the tooltip.
          mark.textContent = (name[0] ?? '·').toUpperCase();
          el.append(mark);
          el.title = tile.tookOver ? `${name} · ${ONLINE.worldTaken}` : name;
        }
        grid.append(el);
      }
    } catch {
      if (summary) summary.textContent = '';
      notice('online-world-notice', ONLINE.worldError);
    }
  };

  menuOnline?.addEventListener('click', () => void openHub());
  $('online-back').addEventListener('click', () => {
    show(null);
    hooks.showMenu();
    refreshTitle();
  });
  $('online-waiting-back').addEventListener('click', () => void openHub());
  $('online-join-back').addEventListener('click', () => void openHub());
  $('online-world-back').addEventListener('click', () => void openHub());
  document.getElementById('online-world')?.addEventListener('click', () => {
    fillCopy();
    show('world');
    void renderWorld();
  });
  $('online-create').addEventListener('click', () => void createMatch());
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

  return { enabled: true, openHub, handleBootHash, refreshTitle, openMatch, rematch };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const errorMessage = (error: unknown) => {
  if (error instanceof DuelError) return friendlyJoinError(error.code) || error.message;
  if (error instanceof Error) return error.message;
  return ONLINE.errGeneric;
};
