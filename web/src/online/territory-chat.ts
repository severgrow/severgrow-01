// TERRITORY CHAT, the page's side (owner, 2026-10-28): one shared channel for everyone in Territory,
// the newest 30 messages (server/src/chat/territory.ts keeps no more). It opens from the chat key in
// the map's bottom-left corner and rises from that corner on the menu window's dark glass. While open
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
    if (this.key) {
      this.key.setAttribute('aria-label', ONLINE.worldChat);
      this.key.title = ONLINE.worldChat;
      this.key.addEventListener('click', () => this.setOpen(!this.open));
    }
    if (this.input) {
      this.input.placeholder = ONLINE.worldChatPlaceholder;
      this.input.setAttribute('aria-label', ONLINE.worldChatPlaceholder);
    }
    const send = document.getElementById('world-chat-send');
    if (send) send.textContent = ONLINE.worldChatSend;
    if (this.empty) this.empty.textContent = ONLINE.worldChatEmpty;
    document.getElementById('world-chat-form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.send(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) { this.setOpen(false); event.stopPropagation(); }
    });
  }

  get isOpen(): boolean { return this.open; }

  setOpen(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    if (this.panel) this.panel.hidden = !open;
    this.key?.setAttribute('aria-expanded', String(open));
    this.key?.classList.toggle('on', open);
    this.picked = null;
    this.blockArmed = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!open) return;
    this.onOpen();
    this.say('');
    this.paint();
    void this.poll();
  }

  private async poll() {
    if (!this.open) return;
    const token = this.token();
    if (token) {
      try {
        this.messages = (await this.client.territoryChat(token)).messages;
        this.paint();
        if (this.status?.textContent === ONLINE.worldChatOffline) this.say('');
      } catch {
        this.say(ONLINE.worldChatOffline);
      }
    }
    if (this.open) this.timer = setTimeout(() => void this.poll(), TERRITORY_CHAT_POLL_MS);
  }

  private async send() {
    const token = this.token();
    const text = this.input?.value.trim() ?? '';
    if (!token || !text || this.busy) return;
    this.busy = true;
    try {
      this.messages = (await this.client.territoryChatSend(token, text, crypto.randomUUID())).messages;
      if (this.input) this.input.value = '';
      this.say('');
      this.paint(true);
    } catch (error) {
      this.say((error as { code?: string }).code === 'RATE_LIMITED' ? ONLINE.worldChatSlow : ONLINE.worldChatFailed);
    } finally {
      this.busy = false;
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
      const tag = document.createElement('i');
      tag.textContent = `#${m.tag}`;
      who.append(name, tag);
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
        block.type = 'button';
        block.textContent = this.blockArmed ? ONLINE.worldChatBlockConfirm : ONLINE.worldChatBlock;
        block.addEventListener('click', () => {
          if (!this.blockArmed) { this.blockArmed = true; this.paint(); return; }
          void this.block(m.id);
        });
        const report = document.createElement('button');
        report.type = 'button';
        report.textContent = ONLINE.worldChatReport;
        report.addEventListener('click', () => void this.report(m.id));
        keys.append(block, report);
        item.append(keys);
      }
      return item;
    }));
    if (atBottom) list.scrollTop = list.scrollHeight;
  }
}
