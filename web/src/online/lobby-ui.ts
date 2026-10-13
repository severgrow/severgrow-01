// Phase 4 — online menu / lobby screens. Duel play opens in Phase 5.

import { DuelClient, DuelError, browserStorage } from '../../../server/src/client.js';
import type { MatchListEntry, MatchSummary, MatchViewPayload } from '../../../server/src/protocol.js';
import { ONLINE } from '../../../src/strings.js';
import { createIdentityStore } from './identity.js';
import type { IdentityStore } from './identity.js';
import { duelApiUrl, findOpponentEnabled, onlineBuildEnabled } from './config.js';
import {
  FIRST_ONLINE_CARD_KEY,
  friendlyJoinError,
  inviteLink,
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
  now?: () => number;
};

type OnlineScreen = 'hub' | 'waiting' | 'join' | null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type OnlineLobbyController = {
  enabled: boolean;
  openHub(): Promise<void>;
  handleBootHash(): Promise<void>;
  refreshTitle(): void;
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
    };
  }

  const client = new DuelClient({ baseUrl: api, storage: browserStorage() });
  const identity: IdentityStore = createIdentityStore({ client });
  const now = hooks.now ?? (() => Date.now());

  let matches: MatchListEntry[] = [];
  let waiting: { matchId: string; inviteCode: string } | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let serverOffset = 0;

  const hub = $('online-hub');
  const waitingEl = $('online-waiting');
  const joinEl = $('online-join');
  const notice = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const show = (next: OnlineScreen) => {
    hub.hidden = next !== 'hub';
    waitingEl.hidden = next !== 'waiting';
    joinEl.hidden = next !== 'join';
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
    $('online-matches-title').textContent = ONLINE.yourMatches;
    $('online-matches-empty').textContent = ONLINE.emptyMatches;
    $('online-waiting-title').textContent = ONLINE.waitingTitle;
    $('online-waiting-body').textContent = ONLINE.waitingBody;
    $('online-waiting-expiry').textContent = ONLINE.waitingExpiry;
    $('online-share').textContent = ONLINE.share;
    $('online-copy').textContent = ONLINE.copyLink;
    $('online-cancel-match').textContent = ONLINE.cancelMatch;
    $('online-join-title').textContent = ONLINE.joinTitle;
    $('online-join-prompt').textContent = ONLINE.joinPrompt;
    $('online-join-submit').textContent = ONLINE.joinSubmit;
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
    const offline = document.getElementById('menu-new');
    if (offline) {
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
      li.className = `online-row bucket-${row.bucket}${row.warnLastTwoHours ? ' warn' : ''}`;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.dataset.matchId = row.matchId;
      li.innerHTML = `<span class="online-row-icon" data-icon="${row.statusIcon}" aria-hidden="true"></span>
        <span class="online-row-main"><b>${escapeHtml(row.opponentName)}</b>
        <span class="online-row-status">${escapeHtml(row.statusWord)}</span></span>
        <span class="online-row-time">${row.timeLeft ? escapeHtml(row.timeLeft) : ''}${
          row.warnLastTwoHours ? `<small>${escapeHtml(ONLINE.warnLastTwoHours)}</small>` : ''
        }</span>`;
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
    const linkBlock = document.getElementById('online-link-block');
    if (linkBlock) linkBlock.hidden = false;
    await reloadMatches();
  };

  const openWaiting = (match: MatchSummary) => {
    waiting = { matchId: match.matchId, inviteCode: match.inviteCode };
    fillCopy();
    show('waiting');
    $('online-invite-code').textContent = match.inviteCode;
    notice('online-waiting-notice', '');
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

  const createMatch = async () => {
    const id = await ensureIdentity();
    if (!id) return;
    try {
      const res = await client.createMatch(id.token);
      serverOffset = res.serverNow - now();
      openWaiting(res.match);
    } catch (error) {
      notice('online-hub-notice', errorMessage(error));
    }
  };

  const findOpponent = async () => {
    if (!findOpponentEnabled()) return;
    const id = await ensureIdentity();
    if (!id) return;
    notice('online-hub-notice', ONLINE.findOpponentLooking);
    try {
      const res = await client.findOpponent(id.token);
      serverOffset = res.serverNow - now();
      if (res.paired && res.player.status === 'active') {
        // Paired with an opponent right now: a live join.
        launchDuel(id.token, res.player, true);
        return;
      }
      openWaiting(res.match);
      notice('online-waiting-notice', ONLINE.findOpponentLooking);
    } catch (error) {
      notice('online-hub-notice', errorMessage(error));
    }
  };

  const joinWithCode = async (code: string) => {
    const id = await ensureIdentity();
    if (!id) return;
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) {
      notice('online-join-notice', ONLINE.joinPrompt);
      return;
    }
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

  // ---- wire buttons ----
  fillCopy();
  menuOnline?.addEventListener('click', () => void openHub());
  $('online-back').addEventListener('click', () => {
    show(null);
    hooks.showMenu();
    refreshTitle();
  });
  $('online-waiting-back').addEventListener('click', () => void openHub());
  $('online-join-back').addEventListener('click', () => void openHub());
  $('online-create').addEventListener('click', () => void createMatch());
  document.getElementById('online-find')?.addEventListener('click', () => void findOpponent());
  $('online-join-open').addEventListener('click', () => {
    fillCopy();
    show('join');
    notice('online-join-notice', '');
    $('online-join-confirm').hidden = true;
    ($('online-join-code') as HTMLInputElement).value = '';
  });
  $('online-join-submit').addEventListener('click', () =>
    void joinWithCode(($('online-join-code') as HTMLInputElement).value),
  );
  $('online-share').addEventListener('click', () => void shareInvite());
  $('online-copy').addEventListener('click', () => void copyInvite());
  $('online-cancel-match').addEventListener('click', () => void openHub());
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
    const code = parseJoinHash(typeof location !== 'undefined' ? location.hash : '');
    if (!code) return;
    fillCopy();
    show('join');
    ($('online-join-code') as HTMLInputElement).value = code;
    $('online-join-confirm').hidden = false;
    $('online-join-confirm').textContent = ONLINE.joinConfirmUnknown;
    // Clear hash so refresh does not re-prompt forever.
    history.replaceState(null, '', location.pathname + location.search);
  };

  return { enabled: true, openHub, handleBootHash, refreshTitle };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const errorMessage = (error: unknown) => {
  if (error instanceof DuelError) return friendlyJoinError(error.code) || error.message;
  if (error instanceof Error) return error.message;
  return ONLINE.errGeneric;
};
