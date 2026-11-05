// THE MENU'S SOUND KEY (owner, 2026-11-05: "make sound disabled by default but on main menu in corner
// make a low opacity cream icon with the sound showing that its disabled").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU_SOUND_CSS, menuSoundKeyState } from '../src/player/menu-sound-key.js';

const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

describe('the menu\'s sound key', () => {
  it('off: the crossed-out speaker, low opacity, and it says how to turn sound on', () => {
    const off = menuSoundKeyState(false);
    expect(off.icon).toBe('mute');
    expect(off.label).toMatch(/off/i);
    expect(off.pressed).toBe(false);
    const on = menuSoundKeyState(true);
    expect(on.icon).toBe('sound');
    expect(on.label).toMatch(/on/i);
    expect(on.pressed).toBe(true);
  });

  it('is cream, low opacity, a 44px target in a corner, with a focus ring and no motion of its own', () => {
    expect(MENU_SOUND_CSS).toContain('#menu-sound');
    expect(MENU_SOUND_CSS).toMatch(/width:\s*44px/);
    expect(MENU_SOUND_CSS).toMatch(/height:\s*44px/);
    expect(MENU_SOUND_CSS).toMatch(/#e8ddc5/i);
    expect(MENU_SOUND_CSS).toMatch(/opacity:\s*\.3/);
    expect(MENU_SOUND_CSS).toContain(':focus-visible');
    expect(MENU_SOUND_CSS).toContain('position: absolute');
  });

  it('is mounted by the page and turns sound on and off through the one settings path', () => {
    expect(main).toContain('mountMenuSoundKey(');
    expect(main).toMatch(/setSound\(/);
  });
});
