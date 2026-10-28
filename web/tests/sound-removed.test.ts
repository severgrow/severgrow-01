// SOUND IS REMOVED FOR NOW (owner, 2026-10-27: "for now, remove the sound completely from the game").
// The Sound engine stays in the code, switched off at its one gate: nothing can turn it back on, no
// audio context is ever built, and Settings shows no sound controls.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SOUND_REMOVED, Sound } from '../src/ui/sound.js';

describe('sound is removed', () => {
  it('the engine cannot be switched on, so it never plays or builds a context', () => {
    expect(SOUND_REMOVED).toBe(true);
    const s = new Sound(SOUND_REMOVED);
    s.enabled = true;
    expect(s.enabled).toBe(false);
    let built = 0;
    (globalThis as unknown as { window: unknown }).window = { AudioContext: class { constructor() { built++; } } };
    s.unlock();
    expect(built).toBe(0);
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('every Sound the page builds carries the switch', () => {
    for (const file of ['../src/main.ts', '../src/online/live/mount.ts']) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(src, file).toContain('new Sound(SOUND_REMOVED)');
      expect(src.match(/new Sound\((?!SOUND_REMOVED)/g), file).toBeNull();
    }
  });

  it('Settings shows no sound or music controls', () => {
    const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
    for (const marker of ['data-setting="sound"', 'data-setting="music"', 'id="test-sound"', 'data-copy="soundHeading"']) {
      const at = html.indexOf(marker);
      if (at < 0) continue;
      // still in the markup for when it returns, but inside a block that is never shown
      const before = html.slice(0, at);
      const opened = Math.max(before.lastIndexOf('<div id="sound-removed" hidden'), before.lastIndexOf('<div id="sound-removed-volume" hidden'));
      const closed = Math.max(before.lastIndexOf('</div><!-- /sound-removed -->'), before.lastIndexOf('</div><!-- /sound-removed-volume -->'));
      expect(opened, marker).toBeGreaterThan(closed);
    }
  });
});
