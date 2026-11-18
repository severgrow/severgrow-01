// WARM START FOR GLOBAL CHAT (2026-11-18): the last page an account read is shown at once on its
// next visit, while the fresh read is on its way. Keyed to that account's credentials: a page is
// never shown to anyone else on the device, and an old page is not shown at all.
import { describe, expect, it } from 'vitest';
import { CHAT_MEMORY_KEY, CHAT_MEMORY_MAX_AGE_MS, chatMemory } from '../src/online/chat-memory.js';

const store = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); } };
};

describe('chat memory', () => {
  it('gives the same account its last page back', () => {
    const s = store(); let now = 1000;
    const memory = chatMemory(s, () => now);
    memory.save('token-a', [{ id: 'm1' }]);
    now += 60_000;
    expect(memory.load('token-a')).toEqual([{ id: 'm1' }]);
  });
  it('never gives one account another account\'s page', () => {
    const s = store();
    const memory = chatMemory(s, () => 1000);
    memory.save('token-a', [{ id: 'private' }]);
    expect(memory.load('token-b')).toBeNull();
  });
  it('does not keep the credential itself', () => {
    const s = store();
    chatMemory(s, () => 1000).save('secret-token-value', [{ id: 'm1' }]);
    expect(s.m.get(CHAT_MEMORY_KEY)).not.toContain('secret-token-value');
  });
  it('an old page is not shown', () => {
    const s = store(); let now = 1000;
    const memory = chatMemory(s, () => now);
    memory.save('token-a', [{ id: 'm1' }]);
    now += CHAT_MEMORY_MAX_AGE_MS + 1;
    expect(memory.load('token-a')).toBeNull();
  });
  it('a corrupt entry or a storage that refuses is no memory, never a crash', () => {
    const s = store();
    s.set(CHAT_MEMORY_KEY, '{nonsense');
    expect(chatMemory(s, () => 1).load('token-a')).toBeNull();
    const refusing = { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); }, remove: () => {} };
    const memory = chatMemory(refusing, () => 1);
    expect(() => memory.save('token-a', [])).not.toThrow();
    expect(memory.load('token-a')).toBeNull();
    expect(chatMemory(null, () => 1).load('token-a')).toBeNull();
  });
});
