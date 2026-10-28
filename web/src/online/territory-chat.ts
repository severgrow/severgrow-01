import { enterSurface, exitSurface } from '../ui/interface-motion.js';
// TERRITORY CHAT, the page's side (owner, 2026-10-28): one shared channel for everyone in Territory,
// the newest 30 messages (server/src/chat/territory.ts keeps no more). It opens from the chat key in
// the row of keys under MENU and closes from its own close key, on the same dark glass. While open
// it asks for the channel every few seconds; shut, it asks for nothing. Tapping someone else's message
// offers the two moderation keys duel chat already has: Block (two taps) and Report.
import type { DuelClient } from '../../../server/src/client.js';
import type { TerritoryMessage } from '../../../server/src/chat/territory.js';
import { ONLINE } from '../../../src/strings.js';

/** How often an open chat asks for news. */
export const TERRITORY_CHAT_POLL_MS = 4_000;

export class TerritoryChat {
  private open = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private pending: { text: string; id: string } | null = null;
  private generation = 0;
  private failures = 0;
  private signature = '';
  private request: AbortController | null = null;
  /** The message whose moderation keys are showing, and whether its Block is armed. */
  private picked: string | null = null;
  private blockArmed = false;
  private messages: TerritoryMessage[] = [];
  private readonly panel = document.getElementById('online-world-chat-panel') as HTMLElement | null;
  private readonly key = document.getElementById('online-world-chat') as HTMLButtonElement | null;
  private readonly list = document.getElementById('world-chat-list') as HTMLOListElement | null;
  private readonly empty = document.getElementById('world-chat-empty') as HTMLElement | null;
  private readonly input = document.getElementById('world-chat-input') as HTMLInputElement | null;
  private readonly status = document.getElementById('world-chat-status') as HTMLElement | null;

  constructor(
    private readonly client: DuelClient,
    private readonly token: () => string | null,
    /** Told when the chat opens, so the menu window can shut (one window at a time). */
    private readonly onOpen: () => void = () => undefined,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (!this.open) return;
      this.cancelPoll();
      if (!document.hidden) void this.poll();
    });
    window.addEventListener('online', () => { if (this.open) { this.cancelPoll(); void this.poll(); } });
    const viewport = () => {
      const v = window.visualViewport;
      const keyboard = !!v && v.height < innerHeight * .8;
      if (!this.panel) return;
      this.panel.classList.toggle('keyboard', keyboard);
      if (keyboard && v) {
        this.panel.style.top = `${v.offsetTop + 12}px`;
        this.panel.style.bottom = 'auto';
        this.panel.style.maxHeight = `${Math.max(100, v.height - 24)}px`;
      } else { this.panel.style.top = ''; this.panel.style.bottom = ''; this.panel.style.maxHeight = ''; }
    };
    window.visualViewport?.addEventListener('resize', viewport);
    window.visualViewport?.addEventListener('scroll', viewport);
    if (this.key) {
      this.key.setAttribute('aria-label', ONLINE.worldChat);
      this.key.title = ONLINE.worldChat;
      this.key.addEventListener('click', () => this.setOpen(!this.open));
    }
    if (this.input) {
      this.input.placeholder = ONLINE.worldChatPlaceholder;
      this.input.setAttribute('aria-label', ONLINE.worldChatPlaceholder);
    }
    const back = document.getElementById('world-chat-back');
    back?.addEventListener('click', () => this.setOpen(false));
    const heading = document.getElementById('world-chat-heading'); if (heading) heading.textContent = ONLINE.worldChat;
    const send = document.getElementById('world-chat-send');
    if (send) send.textContent = ONLINE.worldChatSend;
    if (this.empty) this.empty.textContent = ONLINE.worldChatEmpty;
    this.input?.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
    document.getElementById('world-chat-form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.send(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) { this.setOpen(false); event.stopImmediatePropagation(); }
    });
  }

  get isOpen(): boolean { return this.open; }

  setOpen(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    if (this.panel) {
      const panel = this.panel;
      if (open) { panel.hidden = false; enterSurface(panel, { travel: 4, scale: .996 }); }
      else exitSurface(panel, { onDone: () => { panel.hidden = true; } });
    }
    this.key?.setAttribute('aria-expanded', String(open));
    this.key?.classList.toggle('on', open);
    this.picked = null;
    this.blockArmed = false;
    this.cancelPoll();
    // Focus goes back to the key that opened it, or to MENU when the row of keys has folded away.
    if (!open) { (this.key && !this.key.closest('[inert]') ? this.key : document.getElementById('online-world-menu'))?.focus({ preventScroll: true }); return; }
    this.onOpen();
    document.getElementById('world-chat-back')?.focus({ preventScroll: true });
    this.say('');
    this.paint();
    void this.poll();
  }

  private cancelPoll() {
    this.generation++;
    this.request?.abort(); this.request = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll() {
    if (!this.open || document.hidden || this.busy) return;
    const generation = this.generation;
    const request = new AbortController();
    this.request = request;
    const token = this.token();
    if (token) {
      try {
        const page = await this.client.territoryChat(token, request.signal);
        if (generation !== this.generation) return;
        this.messages = page.messages;
        this.failures = 0;
        this.paint();
        if (this.status?.textContent === ONLINE.worldChatOffline) this.say('');
      } catch {
        if (generation !== this.generation) return;
        this.failures++;
        this.say(ONLINE.worldChatOffline);
      }
    }
    if (this.open && generation === this.generation && !document.hidden) this.timer = setTimeout(() => void this.poll(), Math.min(60_000, TERRITORY_CHAT_POLL_MS * 2 ** Math.min(4, this.failures)));
  }

  private async send() {
    const token = this.token();
    const text = this.input?.value.trim() ?? '';
    if (!token || !text || this.busy) return;
    const pending = this.pending ?? { text, id: crypto.randomUUID() };
    this.pending = pending;
    this.busy = true;
    const send = document.getElementById('world-chat-send') as HTMLButtonElement | null;
    if (send) send.disabled = true;
    this.cancelPoll();
    try {
      this.messages = (await this.client.territoryChatSend(token, pending.text, pending.id)).messages;
      if (this.input?.value.trim() === pending.text) this.input.value = '';
      this.pending = null;
      if (send) send.textContent = ONLINE.worldChatSend;
      this.say('');
      this.paint(true);
    } catch (error) {
      if (send) send.textContent = ONLINE.worldChatRetry;
      this.say((error as { code?: string }).code === 'RATE_LIMITED' ? ONLINE.worldChatSlow : ONLINE.worldChatFailed);
    } finally {
      this.busy = false;
      if (send) send.disabled = false;
      if (this.open) void this.poll();
    }
  }

  private async block(id: string) {
    const token = this.token();
    if (!token) return;
    try {
      this.messages = (await this.client.territoryChatBlock(token, id)).messages;
      this.picked = null;
      this.blockArmed = false;
      this.paint();
    } catch {
      this.say(ONLINE.worldChatFailed);
    }
  }

  private async report(id: string) {
    const token = this.token();
    if (!token) return;
    try {
      await this.client.territoryChatReport(token, id, 'abuse');
      this.picked = null;
      this.say(ONLINE.worldChatReported);
      this.paint();
    } catch {
      this.say(ONLINE.worldChatFailed);
    }
  }

  private say(text: string) { if (this.status) this.status.textContent = text; }

  /** Newest at the bottom; the list stays at the bottom unless the reader has scrolled up. */
  private paint(forceBottom = false) {
    const list = this.list;
    if (!list) return;
    const signature = JSON.stringify([this.messages, this.picked, this.blockArmed]);
    if (signature === this.signature && !forceBottom) return;
    this.signature = signature;
    const focused = document.activeElement as HTMLElement | null;
    const focusedId = focused?.closest<HTMLElement>('[data-message-id]')?.dataset.messageId;
    const focusedAction = focused?.dataset.action;
    const previousTop = list.scrollTop;
    const atBottom = forceBottom || list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    if (this.empty) this.empty.hidden = this.messages.length > 0;
    list.replaceChildren(...this.messages.map((m) => {
      const item = document.createElement('li');
      item.className = `world-chat-line${m.mine ? ' mine' : ''}${this.picked === m.id ? ' picked' : ''}`;
      item.dataset.messageId = m.id;
      const who = document.createElement('span');
      who.className = 'world-chat-who';
      const name = document.createElement('b');
      name.textContent = m.name;
      // The name is what the player reads; the tag is kept as the author's tooltip and accessible
      // name, so two players with the same name stay distinguishable (owner, 2026-10-28).
      name.title = `#${m.tag}`;
      who.append(name);
      const text = document.createElement('span');
      text.className = 'world-chat-text';
      text.textContent = m.text;
      item.append(who, text);
      if (!m.mine) {
        item.tabIndex = 0;
        const pick = () => { this.picked = this.picked === m.id ? null : m.id; this.blockArmed = false; this.paint(); };
        item.addEventListener('click', (event) => { if (!(event.target as HTMLElement).closest('button')) pick(); });
        item.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target === item) pick(); });
      }
      if (this.picked === m.id) {
        const keys = document.createElement('span');
        keys.className = 'world-chat-mod';
        const block = document.createElement('button');
        block.type = 'button'; block.dataset.action = 'block';
        block.textContent = this.blockArmed ? ONLINE.worldChatBlockConfirm : ONLINE.worldChatBlock;
        block.addEventListener('click', () => {
          if (!this.blockArmed) { this.blockArmed = true; this.paint(); return; }
          void this.block(m.id);
        });
        const report = document.createElement('button');
        report.type = 'button'; report.dataset.action = 'report';
        report.textContent = ONLINE.worldChatReport;
        report.addEventListener('click', () => void this.report(m.id));
        keys.append(block, report);
        item.append(keys);
      }
      return item;
    }));
    if (atBottom) list.scrollTop = list.scrollHeight;
    else list.scrollTop = previousTop;
    if (focusedId) {
      const row = [...list.children].find(e => (e as HTMLElement).dataset.messageId === focusedId) as HTMLElement | undefined;
      (focusedAction ? row?.querySelector<HTMLElement>(`[data-action="${focusedAction}"]`) : row)?.focus({ preventScroll: true });
    }
  }
}
