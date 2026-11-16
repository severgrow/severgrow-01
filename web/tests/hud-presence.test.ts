// THE TOP BAR SHOWS NO PRESENCE (owner, 2026-11-16: "'away' and any other text from top should not be
// shown, lighting and in chat dot next to name is enough to show if online/offline"). The header keeps
// the presence state for the page's logic; only the bolt (top) and the chat's dot show it.
import { describe, expect, it } from 'vitest';
import { ONLINE_CSS } from '../src/online/online-css.js';
import { CHAT_CSS } from '../src/online/chat/style.js';

describe('who is online is shown by the bolt and the chat dot only', () => {
  it('the header never paints a presence word or dot, in any duel', () => {
    expect(ONLINE_CSS).toMatch(/\.duel-hud \[data-duel-presence\] \{ display: none !important; \}/);
    expect(ONLINE_CSS).not.toMatch(/\[data-duel-presence\]::before/);
  });
  it('the chat keeps its dot beside the name, Blitz included', () => {
    expect(CHAT_CSS).toMatch(/\.match-chat-presence\[data-presence='online'\]\{background:#8fbf6a;\}/);
    expect(CHAT_CSS).not.toMatch(/data-blitz-duel='1'\] \.match-chat-presence/);
  });
});
