import { subscribeOpponentStatus } from '../live/opponent-status.js';
import { MATCH_CHAT } from '../../../../src/strings.js';
import { CHAT_MAX_LENGTH } from '../../../../server/src/chat/rules.js';
import type {
  ChatMessage,
  QuickPhrase,
} from '../../../../server/src/chat/types.js';
import { browserStorage } from '../../../../server/src/client.js';
import { chatReadCursor } from './read-cursor.js';
import type { DuelClient } from '../../../../server/src/client.js';
import type { MatchChannel, MatchDriverSnapshot } from '../types.js';
import { createChatController, type ChatState } from './controller.js';
import { chatDraftStore } from './draft-store.js';
import { CHAT_CSS } from './style.js';
import { ICONS } from '../../ui/icons.js';
import { createChatMotion } from './motion.js';

/** Nonmodal instrument panel: board remains playable. No document scroll or focus steal on arrival. */
export const mountMatchChat = (o: {
  host: HTMLElement;
  header: HTMLElement;
  client: DuelClient;
  token: string;
  matchId: string;
  channel: MatchChannel;
  snapshot: () => MatchDriverSnapshot;
  copy?: typeof MATCH_CHAT;
}) => {
  const copy = o.copy ?? MATCH_CHAT;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createChatMotion(
    () =>
      motionPreference.matches ||
      document.documentElement.classList.contains('reduce-motion'),
  );
  const settleMotion = () => {
    if (motionPreference.matches) motion.settle();
  };
  motionPreference.addEventListener('change', settleMotion);
  if (!document.getElementById('match-chat-style')) {
    const style = document.createElement('style');
    style.id = 'match-chat-style';
    style.textContent = CHAT_CSS;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = 'match-chat';
  const toggle = document.createElement('button');
  toggle.id = 'match-chat-toggle';
  toggle.type = 'button';
  toggle.className = 'icon-only';
  toggle.setAttribute('aria-label', copy.open);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'match-chat-panel');
  // Static trusted icon, never message HTML.
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H10l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>';
  const dot = document.createElement('span');
  dot.className = 'match-chat-dot';
  dot.hidden = true;
  toggle.append(dot);
  const preview = document.createElement('div');
  preview.className = 'match-chat-preview';
  preview.hidden = true;
  preview.setAttribute('aria-hidden', 'true');
  const panel = document.createElement('section');
  panel.id = 'match-chat-panel';
  panel.className = 'match-chat-panel';
  panel.hidden = true;
  panel.inert = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'match-chat-title');
  const head = document.createElement('header');
  head.className = 'match-chat-head';
  const title = document.createElement('h2');
  title.id = 'match-chat-title';
  title.textContent = copy.title;
  const button = (text: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = run;
    return b;
  };
  const close = button('', () => setOpen(false));
  close.innerHTML = ICONS.close!;
  close.setAttribute('aria-label', copy.close);
  const toolsToggle = button('···', () => {
    setPhrases(false);
    controls.open = !controls.open;
  });
  toolsToggle.setAttribute('aria-label', copy.tools);
  toolsToggle.setAttribute('aria-expanded', 'false');
  toolsToggle.setAttribute('aria-controls', 'match-chat-controls');
  const headKeys = document.createElement('div');
  headKeys.className = 'match-chat-head-keys';
  headKeys.append(toolsToggle, close);
  const heading = document.createElement('div');
  const opponentName = document.createElement('span');
  opponentName.className = 'match-chat-opponent-name';
  opponentName.textContent = o.snapshot().opponentName || copy.opponent;
  const presenceDot = document.createElement('span');
  presenceDot.className = 'match-chat-presence';
  presenceDot.setAttribute('role', 'img');
  opponentName.append(presenceDot);
  heading.append(title, opponentName);
  head.append(heading, headKeys);
  const log = document.createElement('div');
  log.className = 'match-chat-log';
  log.tabIndex = 0;
  log.setAttribute('aria-label', copy.title);
  const older = button(copy.older, () => {
    void ctl.older();
  });
  const entries = document.createElement('div');
  const empty = document.createElement('p');
  empty.className = 'match-chat-empty';
  empty.textContent = copy.empty;
  entries.append(empty);
  log.append(older, entries);
  // A small separate live region avoids announcing the whole transcript on reconnection.
  const live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const newer = button(copy.newer, () => {
    if (ctl.state().hasNewer) {
      void ctl.latest().then(() => {
        log.scrollTop = log.scrollHeight;
        newer.hidden = true;
      });
    } else {
      log.scrollTop = log.scrollHeight;
      newer.hidden = true;
    }
  });
  newer.className = 'match-chat-newer';
  newer.hidden = true;
  const foot = document.createElement('div');
  foot.className = 'match-chat-foot';
  const status = document.createElement('p');
  status.className = 'match-chat-status';
  status.setAttribute('role', 'status');
  const outgoing = document.createElement('div');
  outgoing.className = 'match-chat-outgoing';
  outgoing.hidden = true;
  const form = document.createElement('form');
  form.className = 'match-chat-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.maxLength = 560;
  input.setAttribute('aria-label', copy.message);
  input.setAttribute('aria-describedby', 'match-chat-availability');
  status.id = 'match-chat-availability';
  const send = button(copy.send, () => undefined);
  send.type = 'submit';
  send.className = 'match-chat-send';
  const submit = () => {
    if (composing) return;
    if ([...input.value.normalize('NFC')].length > CHAT_MAX_LENGTH) {
      live.textContent = copy.remaining(
        CHAT_MAX_LENGTH - [...input.value.normalize('NFC')].length,
      );
      return;
    }
    setPhrases(false);
    void ctl.send();
  };
  let composing = false;
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    ctl.draft(input.value);
  });
  input.oninput = () => {
    ctl.draft(input.value);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    submit();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.isComposing || composing || e.keyCode === 229))
      e.preventDefault();
  };
  const phrases = document.createElement('div');
  phrases.className = 'match-chat-phrases';
  phrases.id = 'match-chat-phrases';
  phrases.hidden = true;
  phrases.setAttribute('role', 'group');
  phrases.setAttribute('aria-label', copy.quickPhrases);
  let phrasesOpen = false;
  const phraseToggle = button('', () => setPhrases(!phrasesOpen));
  phraseToggle.className = 'match-chat-phrase-toggle';
  phraseToggle.setAttribute('aria-label', copy.quickPhrases);
  phraseToggle.setAttribute('aria-expanded', 'false');
  phraseToggle.setAttribute('aria-controls', phrases.id);
  phraseToggle.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5h10a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 0 1-3.5 3.5h-5.5L6 21v-3.8A3.5 3.5 0 0 1 3.5 14V8A3.5 3.5 0 0 1 7 4.5Z"/><g fill="currentColor" stroke="none"><circle cx="8" cy="11" r=".9"/><circle cx="12" cy="11" r=".9"/><circle cx="16" cy="11" r=".9"/></g></svg>';
  function setPhrases(open: boolean) {
    phrasesOpen = open;
    phrases.inert = !open;
    motion.visible(phrases, open);
    phraseToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      controls.open = false;
      const first = phrases.querySelector<HTMLButtonElement>(
        'button:not(:disabled)',
      );
      (first ?? phraseToggle).focus({ preventScroll: true });
    }
  }
  form.append(input, phraseToggle, send);
  for (const id of Object.keys(copy.phrases) as QuickPhrase[])
    phrases.append(
      button(copy.phrases[id], () => {
        setPhrases(false);
        phraseToggle.focus({ preventScroll: true });
        void ctl.send({ text: null, phrase: id });
      }),
    );
  foot.append(status, outgoing, form, phrases);
  const controls = document.createElement('details');
  controls.className = 'match-chat-controls';
  controls.id = 'match-chat-controls';
  controls.addEventListener('toggle', () =>
    toolsToggle.setAttribute('aria-expanded', String(controls.open)),
  );
  const summary = document.createElement('summary');
  summary.textContent = copy.tools;
  const tools = document.createElement('div');
  tools.className = 'match-chat-tools';
  const mute = button(
    copy.mute,
    () => void ctl.action('mute', { value: !ctl.state().muted }),
  );
  const block = button(
    copy.block,
    () => void ctl.action('block', { value: !ctl.state().blockedByMe }),
  );
  tools.append(mute, block);
  const reportForm = document.createElement('div');
  reportForm.className = 'match-chat-tools';
  reportForm.hidden = true;
  const reason = document.createElement('select');
  reason.setAttribute('aria-label', copy.report);
  for (const [id, label] of [
    ['abuse', copy.abuse],
    ['spam', copy.spam],
    ['other', copy.other],
  ]) {
    const option = document.createElement('option');
    option.value = id!;
    option.textContent = label!;
    reason.append(option);
  }
  let reportTarget: string | null = null;
  const reportSend = button(copy.reportConfirm, () => {
    if (!reportTarget) return;
    reportSend.disabled = true;
    void ctl
      .action('report', {
        messageId: reportTarget,
        reason: reason.value as 'abuse' | 'spam' | 'other',
      })
      .then((ok) => {
        reportSend.disabled = false;
        if (ok) {
          reportForm.hidden = true;
          reportTarget = null;
          live.textContent = copy.reportDone;
        }
      });
  });
  const reportCancel = button(copy.cancel, () => {
    reportForm.hidden = true;
    reportTarget = null;
    toolsToggle.focus();
  });
  reportForm.append(reason, reportSend, reportCancel);
  controls.append(summary, tools, reportForm);
  panel.append(head, log, newer, foot, controls, live);
  root.append(panel);
  const cockpit = o.host.querySelector<HTMLElement>('#smart-panel');
  (cockpit ?? o.header).append(toggle, preview);
  o.host.append(root);
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let displayedUnreadBoundary: number | null = null;
  let panelOpen = false,
    lastUnread = 0,
    lastSequence = 0;
  let lastPreview = '',
    lastMessages = '',
    lastAnnouncement = '',
    lastFailure = '';
  const text = (m: Pick<ChatMessage, 'text' | 'phrase'>) =>
    m.phrase ? copy.phrases[m.phrase] : (m.text ?? '');
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const ctl = createChatController({
    ...o,
    onChange: render,
    draftStore: chatDraftStore(browserStorage(), o.matchId, o.snapshot().seat),
    readCursor: chatReadCursor(browserStorage(), o.matchId, o.snapshot().seat),
  });
  let opponentStatus: 'online' | 'away' | 'unknown' = 'unknown';
  function paintPresence() {
    const presence = navigator.onLine ? opponentStatus : 'unknown';
    presenceDot.dataset.presence = presence;
    const label = presence === 'online' ? copy.opponentOnline : presence === 'away' ? copy.opponentOffline : copy.opponentUnknown;
    presenceDot.setAttribute('aria-label', label);
    presenceDot.title = label;
  }
  const stopPresence = subscribeOpponentStatus(o.matchId, (value) => {
    opponentStatus = value;
    paintPresence();
  });
  function render(s: ChatState) {
    paintPresence();
    if (panelOpen !== s.open) {
      panelOpen = s.open;
      panel.inert = !s.open;
      panel.setAttribute('aria-hidden', String(!s.open));
      motion.visible(panel, s.open);
    }
    toggle.setAttribute('aria-expanded', String(s.open));
    dot.hidden = s.unread === 0 || s.muted || s.blocked;
    if (!dot.hidden && s.unread > lastUnread && !s.open) motion.unread(dot);
    lastUnread = s.unread;
    toggle.setAttribute(
      'aria-label',
      s.unread && !s.muted && !s.blocked
        ? `${copy.open} · ${copy.unread(s.unread)}`
        : copy.open,
    );
    if (s.preview && s.preview.id !== lastPreview) {
      lastPreview = s.preview.id;
      preview.textContent = text(s.preview).slice(0, 100);
      motion.visible(preview, true);
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => ctl.dismissPreview(), 4200);
    }
    if (!s.preview) motion.visible(preview, false);
    const key =
      s.messages.map((m) => m.id).join(',') + ':' + (s.unreadFrom ?? '');
    if (key !== lastMessages) {
      const previousHeight = log.scrollHeight,
        previousTop = log.scrollTop;
      const bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 44;
      const oldFirst = entries.firstElementChild?.getAttribute('data-message');
      const loadingOlder =
        oldFirst && s.messages.findIndex((m) => m.id === oldFirst) > 0;
      const focusedMessage = entries.contains(document.activeElement)
        ? document.activeElement?.closest<HTMLElement>('[data-message]')
            ?.dataset.message
        : undefined;
      motion.cancelWithin(entries);
      entries.replaceChildren();
      if (!s.messages.length) entries.append(empty);
      let previous: ChatMessage | undefined,
        previousLine: HTMLElement | undefined;
      for (const m of s.messages) {
        const boundary = m.sequence === s.unreadFrom;
        if (boundary) {
          const divider = document.createElement('p');
          divider.className = 'match-chat-unread';
          divider.textContent = copy.newer;
          divider.setAttribute('role', 'separator');
          divider.setAttribute('aria-label', copy.newer);
          entries.append(divider);
        }
        const line = document.createElement('article');
        line.className = 'match-chat-line';
        line.dataset.mine = String(m.mine);
        line.dataset.message = m.id;
        const meta = document.createElement('div');
        meta.className = 'match-chat-meta';
        const who = document.createElement('span');
        who.className = 'match-chat-speaker';
        who.textContent = m.mine ? copy.you : copy.opponent;
        const stamp = document.createElement('time');
        stamp.className = 'match-chat-time';
        stamp.dateTime = new Date(m.createdAt).toISOString();
        stamp.textContent = time.format(m.createdAt);
        stamp.title = new Date(m.createdAt).toLocaleString();
        meta.append(who, stamp);
        const grouped =
          previous &&
          previous.mine === m.mine &&
          m.createdAt >= previous.createdAt &&
          m.createdAt - previous.createdAt < 300000 &&
          !boundary;
        if (grouped) {
          meta.hidden = true;
          line.dataset.grouped = 'true';
          if (previousLine) previousLine.dataset.continues = 'true';
        }
        line.setAttribute(
          'aria-label',
          `${m.mine ? copy.you : copy.opponent}, ${new Date(m.createdAt).toLocaleString()}`,
        );
        const body = document.createElement('p');
        body.className = 'match-chat-text';
        body.textContent = text(m);
        line.append(meta);
        if (!m.mine) {
          const actions = document.createElement('details');
          actions.className = 'match-chat-message-actions';
          const actionToggle = document.createElement('summary');
          actionToggle.setAttribute('aria-label', copy.messageActions);
          actionToggle.textContent = '⋯';
          actions.append(actionToggle);
          actions.addEventListener('toggle', () => {
            if (actions.open)
              for (const other of entries.querySelectorAll<HTMLDetailsElement>('.match-chat-message-actions[open]'))
                if (other !== actions) other.open = false;
          });
          const report = button(copy.report, () => {
            actions.open = false;
            reportTarget = m.id;
            reportForm.hidden = false;
            controls.open = true;
            reason.focus();
          });
          report.className = 'match-chat-report';
          report.setAttribute(
            'aria-label',
            `${copy.report}: ${text(m).slice(0, 60)}`,
          );
          actions.append(report);
          line.append(actions);
        }
        line.append(body);
        entries.append(line);
        previous = m;
        previousLine = line;
        if (s.open && lastSequence > 0 && m.sequence > lastSequence)
          motion.arrival(line);
      }
      if (loadingOlder)
        log.scrollTop = previousTop + log.scrollHeight - previousHeight;
      else if (bottom || !lastMessages) {
        log.scrollTop = log.scrollHeight;
        newer.hidden = true;
      } else newer.hidden = false;
      const newest = s.messages.at(-1);
      if (newest && !newest.mine && s.open && newest.id !== lastAnnouncement) {
        live.textContent = `${copy.opponent}: ${text(newest)}`;
        lastAnnouncement = newest.id;
      }
      if (focusedMessage)
        entries
          .querySelector<HTMLElement>(
            `[data-message="${focusedMessage}"] summary`,
          )
          ?.focus({ preventScroll: true });
      lastSequence = Math.max(
        lastSequence,
        ...s.messages.map((m) => m.sequence),
      );
      lastMessages = key;
    }
    if (!s.open) displayedUnreadBoundary = null;
    else if (s.unreadFrom !== displayedUnreadBoundary) {
      displayedUnreadBoundary = s.unreadFrom;
      const marker = entries.querySelector('.match-chat-unread');
      if (marker)
        log.scrollTop +=
          marker.getBoundingClientRect().top -
          log.getBoundingClientRect().top -
          8;
    }
    if (s.hasNewer) newer.hidden = false;
    older.hidden = !s.hasOlder;
    older.disabled = s.loading;
    if (input.value !== s.draft && !composing) input.value = s.draft;
    input.disabled = !s.canSend || s.outgoing !== null;
    send.disabled = input.disabled || s.loading;
    for (const b of phrases.querySelectorAll('button'))
      b.disabled = input.disabled;
    const snap = o.snapshot();
    status.textContent = !navigator.onLine
      ? copy.offline
      : s.error
      ? copy.unavailable
      : !s.ready
        ? copy.loading
        : s.blocked
          ? copy.blocked
          : snap.status === 'finished'
            ? copy.ended
            : !s.realtimeConnected || snap.connection !== 'online'
              ? copy.reconnecting
              : s.canSend
              ? ''
              : copy.available;
    status.hidden = status.textContent === '';
    outgoing.replaceChildren();
    outgoing.hidden = !s.outgoing && !s.error;
    if (s.outgoing) {
      const item = s.outgoing;
      outgoing.append(
        document.createTextNode(
          `${text(item.content)} · ${item.state === 'pending' ? copy.pending : item.code === 'RATE_LIMITED' ? copy.rate : copy.failed}`,
        ),
      );
      if (item.state === 'failed') {
        const retry = button(copy.retry, () => void ctl.send());
        retry.disabled = !s.canSend;
        outgoing.append(
          retry,
          button(copy.discard, () => ctl.discard()),
        );
      }
      if (item.state === 'failed' && lastFailure !== item.requestId) {
        live.textContent = copy.failed;
        lastFailure = item.requestId;
      }
    } else if (s.error)
      outgoing.append(button(copy.reconnect, () => void ctl.refresh()));
    mute.textContent = s.muted ? copy.unmute : copy.mute;
    mute.setAttribute('aria-pressed', String(s.muted));
    block.textContent = s.blockedByMe ? copy.unblock : copy.block;
    block.setAttribute('aria-pressed', String(s.blockedByMe));
  }
  function setOpen(value: boolean) {
    setPhrases(false);
    ctl.setOpen(value);
    if (value) {
      close.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        if (ctl.state().open) {
          const marker = entries.querySelector('.match-chat-unread');
          if (marker)
            log.scrollTop +=
              marker.getBoundingClientRect().top -
              log.getBoundingClientRect().top -
              8;
          else log.scrollTop = log.scrollHeight;
        }
        newer.hidden = true;
      });
    } else {
      input.blur();
      toggle.focus({ preventScroll: true });
    }
  }
  toggle.onclick = () => setOpen(!ctl.state().open);
  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && phrasesOpen) {
      e.preventDefault();
      e.stopPropagation();
      setPhrases(false);
      phraseToggle.focus({ preventScroll: true });
      return;
    }
    const messageMenu = entries.querySelector<HTMLDetailsElement>('.match-chat-message-actions[open]');
    if (e.key === 'Escape' && messageMenu) {
      e.preventDefault();
      e.stopPropagation();
      messageMenu.open = false;
      messageMenu.querySelector('summary')?.focus({ preventScroll: true });
      return;
    }
    if (e.key === 'Escape' && ctl.state().open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  document.addEventListener('keydown', keydown, true);
  const outside = (e: PointerEvent) => {
    for (const menu of entries.querySelectorAll<HTMLDetailsElement>('.match-chat-message-actions[open]'))
      if (!menu.contains(e.target as Node)) menu.open = false;
    if (
      phrasesOpen &&
      !phrases.contains(e.target as Node) &&
      !phraseToggle.contains(e.target as Node)
    )
      setPhrases(false);
    if (
      ctl.state().open &&
      !root.contains(e.target as Node) &&
      !toggle.contains(e.target as Node)
    ) {
      ctl.setOpen(false);
      input.blur();
    }
  };
  document.addEventListener('pointerdown', outside);
  log.addEventListener('scroll', () => {
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 44)
      newer.hidden = true;
  });
  const resume = () => {
    if (!document.hidden) void ctl.refresh();
  };
  document.addEventListener('visibilitychange', resume);
  const connectivity = () => {
    ctl.turnChanged();
    if (navigator.onLine) resume();
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  window.addEventListener('focus', resume);
  const viewport = () => {
    const followLatest =
      log.scrollHeight - log.scrollTop - log.clientHeight < 44;
    const v = window.visualViewport;
    const height = v?.height ?? window.innerHeight;
    const keyboard = height < window.innerHeight * 0.75;
    let top = keyboard && height < 350 ? 8 : 52;
    let available = height - top - 12;
    const box = o.host.querySelector<HTMLElement>('#futa04-box');
    const area = box?.getBoundingClientRect();
    const key = toggle.getBoundingClientRect();
    const cockpitTop =
      o.host.querySelector('#smart-context')?.getBoundingClientRect().top ??
      key.top;
    const desktopTop = Math.max(
      64,
      o.header.getBoundingClientRect().bottom + 24,
    );
    const horizontalRoom = area
      ? 2 *
        Math.min(
          area.left + area.width / 2 - 16,
          window.innerWidth - 16 - area.left - area.width / 2,
        )
      : 0;
    const docked =
      !keyboard &&
      window.innerWidth >= 1000 &&
      document.documentElement.dataset.layout === 'side' &&
      area &&
      area.width >= 280 &&
      horizontalRoom >= 260 &&
      cockpitTop - desktopTop - 8 >= 240;
    root.dataset.desktopDocked = String(Boolean(docked));
    if (docked && area) {
      const center = area.left + area.width / 2;
      const width = Math.min(480, area.width, horizontalRoom);
      const left = center - width / 2;
      top = desktopTop;
      available = cockpitTop - top - 8;
      root.style.setProperty('--chat-left', `${left}px`);
      root.style.setProperty('--chat-width', `${width}px`);
    }
    // THE CORNER BADGE IS ABOVE THE PANEL (owner, 2026-10-26: on a phone "the 'x' button to close the
    // chat clashes with the logo in the top right corner"). The panel started at a flat 52px, but the
    // badge is fixed at the HUD menu ink's top — on a notched phone the safe area pushes that ink to
    // ~75px, so the badge's box (75→97) landed squarely on the 44px close key (54→98). The panel now
    // starts below the badge's MEASURED box plus the same 8px gap the cockpit uses, so it clears the
    // mark on any device instead of guessing a phone's inset. A no-op where the panel already starts
    // lower (desktop dock, landscape), and skipped when the badge is standing down (width 0). The
    // panel keeps its bottom edge: it gives up exactly the height the badge takes.
    const offset = v?.offsetTop ?? 0;
    const brand = document.getElementById('hud-brand')?.getBoundingClientRect();
    if (brand && brand.width > 0) {
      const clear = brand.bottom + 8 - offset;
      if (clear > top) {
        available -= clear - top;
        top = clear;
      }
    }
    root.dataset.keyboard = String(keyboard);
    root.style.setProperty('--chat-top', `${offset + top}px`);
    root.style.setProperty('--chat-height', `${Math.max(120, available)}px`);
    if (followLatest && ctl.state().open) log.scrollTop = log.scrollHeight;
  };
  let layoutFrame: number | null = null;
  const scheduleViewport = () => {
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      viewport();
    });
  };
  let layoutSignature = '';
  const placementChanges = new MutationObserver(() => {
    const page = document.documentElement;
    const signature = [
      page.dataset.layout,
      page.dataset.thumb,
      // The corner badge's own box is part of the chat's placement now: the panel starts below it.
      ...['--side-dock-shift', '--dock-w', '--dock-h', '--futasaku-logo-top', '--futasaku-logo-height'].map((k) =>
        page.style.getPropertyValue(k),
      ),
    ].join('|');
    if (signature !== layoutSignature) {
      layoutSignature = signature;
      scheduleViewport();
    }
  });
  placementChanges.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-layout', 'data-thumb'],
  });
  const cockpitLayout = new ResizeObserver(scheduleViewport);
  const box = o.host.querySelector<HTMLElement>('#futa04-box');
  if (box) cockpitLayout.observe(box);
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', scheduleViewport);
  viewport();
  ctl.start();
  return {
    update: () => ctl.turnChanged(),
    stop() {
      motion.stop();
      motionPreference.removeEventListener('change', settleMotion);
      stopPresence();
      ctl.stop();
      document.removeEventListener('keydown', keydown, true);
      if (previewTimer) clearTimeout(previewTimer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('focus', resume);
      window.removeEventListener('resize', scheduleViewport);
      cockpitLayout.disconnect();
      placementChanges.disconnect();
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      window.visualViewport?.removeEventListener('resize', viewport);
      window.visualViewport?.removeEventListener('scroll', viewport);
      root.remove();
      preview.remove();
      toggle.remove();
    },
  };
};
