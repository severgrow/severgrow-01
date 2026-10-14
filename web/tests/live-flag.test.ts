// The live-duel channel gate. The owner asked for `/futa0.5/` to carry EVERYTHING, so the
// `futa05` preview channel now ships live duels alongside the `futa-test` copy. The product
// `futa04` build must still never mount them. (Revert = drop 'futa05' from flag.ts.)
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const source = transformSync(readFileSync(new URL('../src/online/live/flag.ts', import.meta.url), 'utf8'), {
  loader: 'ts',
  format: 'cjs',
}).code;

type Flag = { liveDuelsEnabled: (env?: Record<string, string | undefined>) => boolean };

/** Boot flag.ts with only `__CHANNEL__` defined (no VITE_LIVE_DUELS, as in a real build). */
const boot = (channel: string): Flag => {
  const exports: Record<string, unknown> = {};
  const module = { exports };
  runInNewContext(source, { __CHANNEL__: channel, exports, module });
  return module.exports as Flag;
};

describe('live duels channel gate', () => {
  it.each(['futa-test', 'futa05'])('%s mounts live duels', (channel) => {
    expect(boot(channel).liveDuelsEnabled()).toBe(true);
  });

  it.each(['futa04', 'live', 'test'])('%s never mounts live duels', (channel) => {
    expect(boot(channel).liveDuelsEnabled()).toBe(false);
  });

  it('VITE_LIVE_DUELS=1 forces it on for any channel (the browser tests)', () => {
    expect(boot('futa04').liveDuelsEnabled({ VITE_LIVE_DUELS: '1' })).toBe(true);
    expect(boot('live').liveDuelsEnabled({ VITE_LIVE_DUELS: '1' })).toBe(true);
    // Anything other than the exact '1' does not turn it on.
    expect(boot('futa04').liveDuelsEnabled({ VITE_LIVE_DUELS: '0' })).toBe(false);
  });
});
