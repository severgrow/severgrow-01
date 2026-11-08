// THE MAIN MENU DOES NOT ZOOM (owner, 2026-11-08: "make it impossible to zoom out on main menu").
//
// The planet behind the menu already ignores pinch and wheel in its menu mode (sphere/planet.ts); what
// moved was the PAGE: a browser pinch, a trackpad pinch (ctrl + wheel), or Ctrl/Cmd + - / + / 0. While
// the menu shows, each of those is refused; every other screen keeps the browser's own zoom.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU_ZOOM_LOCK_CSS, isZoomKey } from '../src/player/menu-zoom-lock.js';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const src = read('../src/player/menu-zoom-lock.ts');
const main = read('../src/main.ts');

describe('the main menu cannot be zoomed', () => {
  it('stops a touch pinch from starting while the menu shows (pan only, no pinch-zoom)', () => {
    expect(MENU_ZOOM_LOCK_CSS).toContain('html.menu-zoom-lock');
    expect(MENU_ZOOM_LOCK_CSS).toMatch(/touch-action:\s*pan-x pan-y/);
  });
  it('refuses Safari gesture zoom and the trackpad pinch (ctrl + wheel)', () => {
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) expect(src).toContain(`'${name}'`);
    expect(src).toMatch(/'wheel'[\s\S]*?ctrlKey/);
    expect(src).toContain('passive: false');
  });
  it('refuses Ctrl/Cmd with + - = 0, and nothing else', () => {
    const k = (key: string, ctrlKey = false, metaKey = false) => isZoomKey({ key, ctrlKey, metaKey });
    for (const key of ['+', '-', '=', '0', '_']) {
      expect(k(key, true)).toBe(true);
      expect(k(key, false, true)).toBe(true);
      expect(k(key)).toBe(false);
    }
    expect(k('a', true)).toBe(false);
  });
  it('is on only while the menu shows, and pins the viewport scale only then', () => {
    expect(src).toContain("getElementById('menu')");
    // Territory opens OVER the menu (the menu stays unhidden): its planet keeps its own pinch.
    expect(src).toContain("getElementById('online-world-screen')");
    expect(src).toContain('!menu.hidden && (!world || !!world.hidden)');
    expect(src).toContain('maximum-scale=1');
    expect(src).toMatch(/attributeFilter:\s*\['hidden'\]/);
    // one attribute on one element: no page-subtree watcher
    expect(src).not.toMatch(/subtree:\s*true/);
    expect(main).toContain('mountMenuZoomLock()');
  });
});
