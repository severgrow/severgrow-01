// THE CONSISTENCY SWEEP's source invariants (owner brief, 2026-10-25: "see if there's anything that
// doesn't live up to the high standard we created" — materials, type, targets, brand).
//
// `web/e2e/consistency-surfaces.ts` measures the built page at the five release viewports. This file
// locks the three source rules whose drift the browser sweep found, so a new surface cannot quietly
// reintroduce them:
//   1. `--font-mono` is a REAL token. It was referenced by three rules (the deck/discard odometer,
//      the Bloom count badge, the finish plate's "what the level taught" line) and defined nowhere,
//      so each of the three fell back to a different face: system monospace twice, Besley (a serif)
//      once. A token that does not exist is not a token.
//   2. No UI chrome asks the OPERATING SYSTEM for a monospace face first. `.online-code` did, so the
//      invite code was the one piece of type in the lobby that was not Fragment Mono.
//   3. The lobby screens sit on the game's painted backdrop like every other screen. `.online-hub`,
//      `.online-waiting` and `.online-join` painted an opaque `--c-bg` rectangle; their own sibling
//      `.online-world` (and `#play-menu`, `#levels`) use `background: none`, so the lobby was the
//      only flat black page in the product.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** Every CSS-in-TS template plus the two stylesheets, with the file that holds it. */
const styles: { path: string; text: string }[] = [
  { path: 'src/style.css', text: read('src/style.css') },
  { path: 'src/fonts-futa04.css', text: read('src/fonts-futa04.css') },
  { path: 'src/online/online-css.ts', text: read('src/online/online-css.ts') },
  { path: 'src/online/chat/style.ts', text: read('src/online/chat/style.ts') },
  { path: 'src/replay/replay-css.ts', text: read('src/replay/replay-css.ts') },
  { path: 'src/player/fonts.ts', text: read('src/player/fonts.ts') },
  { path: 'src/player/information.ts', text: read('src/player/information.ts') },
  { path: 'src/player/smart-cockpit.ts', text: read('src/player/smart-cockpit.ts') },
];

/** The three system-monospace families a drifting rule reaches for. */
const SYSTEM_MONO = /^(ui-monospace|monospace|SFMono|Menlo|Consolas)/i;

/** The first family named in a `font-family:`/`font:` shorthand value. */
const firstFamily = (value: string): string => {
  const stack = value.replace(/[!;].*$/, '').trim();
  const after = stack.includes('/') ? stack.slice(stack.indexOf('/') + 1) : stack;
  return after.split(',')[0]!.replace(/["']/g, '').trim();
};

/** Every `font-family:` / `font:` shorthand in a stylesheet, with its selector. */
const fontDeclarations = (text: string): { selector: string; value: string }[] => {
  const out: { selector: string; value: string }[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of text.matchAll(rule)) {
    const selector = match[1]!.trim().replace(/\s+/g, ' ').slice(0, 80);
    for (const decl of match[2]!.matchAll(/(?:^|;)\s*(font-family|font)\s*:\s*([^;}]+)/g))
      out.push({ selector, value: decl[2]! });
  }
  return out;
};

describe('one type system, one ink', () => {
  it('defines --font-mono wherever the product defines its other faces', () => {
    // Both blocks that declare --font-ui/--font-num must declare --font-mono too: the runtime block
    // (player/fonts.ts) and the cold-load stylesheet (fonts-futa04.css).
    for (const path of ['src/player/fonts.ts', 'src/fonts-futa04.css']) {
      const text = read(path);
      expect(text, `${path} must define --font-mono beside --font-ui`).toMatch(/--font-mono\s*:/);
      expect(text, `${path} must keep the numerals face in both tokens`).toMatch(
        /--font-mono\s*:\s*(?:'Futasaku Numerals'|var\(--font-num\))/,
      );
    }
  });

  it('never asks the operating system for a UI monospace face first', () => {
    const offenders: string[] = [];
    for (const { path, text } of styles) {
      for (const { selector, value } of fontDeclarations(text)) {
        // The Lab and the ?debug=1 corner are not product surfaces.
        if (/\.lab|\?debug|debug-corner/.test(selector)) continue;
        if (SYSTEM_MONO.test(firstFamily(value))) offenders.push(`${path}  ${selector}  { ${value.trim()} }`);
      }
    }
    expect(offenders, 'a surface is painting the OS monospace instead of Fragment Mono').toEqual([]);
  });

  it('keeps the lobby fill the world-surface suite pins, and records why it is the odd one out', () => {
    // The sweep found this the ONE material difference between the lobby and every other screen
    // (#play-menu, #levels and .online-world stand on the shared painted surface). It is pinned
    // deliberately: web/tests/world-surface.test.ts calls the world-map change "the world map only"
    // and web/e2e/online-lobby-overlay.ts asserts the lobby is opaque. So this file does not demand
    // a change — it only fails if someone flips it WITHOUT updating that decision's owner-facing
    // note, so the drift cannot change hands silently.
    const source = read('src/online/online-css.ts');
    const lobby = source.match(/\.online-hub,\s*\.online-waiting,\s*\.online-join\s*\{([^}]*)\}/);
    expect(lobby, 'the lobby screens must keep one shared rule').not.toBeNull();
    if (/background\s*:\s*var\(--c-bg\)/.test(lobby![1]!))
      expect(source, 'an opaque lobby must carry its reason').toMatch(/pinned on purpose/);
  });
});

describe('44px, everywhere the thumb goes', () => {
  /** Every block that matches `selector`, as text. */
  const blocks = (css: string, selector: RegExp): string[] =>
    [...css.matchAll(new RegExp(`(${selector.source})\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[2]!);

  it('gives the replay plate 44px controls, scrub bar included', () => {
    const css = read('src/replay/replay-css.ts');
    const buttons = blocks(css, /\.rp-btn/);
    expect(buttons.length, 'the replay still has its action button').toBeGreaterThan(0);
    for (const block of buttons) {
      const height = block.match(/min-height:\s*(\d+(?:\.\d+)?)px/);
      expect(height, 'the replay button must declare a height we can check').not.toBeNull();
      expect(Number(height![1]), 'a replay button under 44px is not a thumb target').toBeGreaterThanOrEqual(44);
    }
    // The scrub bar is the replay's primary drag target: it was 30px (24px in landscape).
    const scrub = blocks(css, /#replay \.rp-scrub|\.rp-scrub/);
    expect(scrub.length, 'the scrub bar still exists').toBeGreaterThan(0);
    for (const block of scrub) {
      const height = block.match(/(?:^|;)\s*height:\s*(\d+(?:\.\d+)?)px/);
      if (!height) continue;
      expect(Number(height[1]), 'a scrub bar under 44px tall is a miss waiting to happen').toBeGreaterThanOrEqual(44);
    }
  });

  it('gives the chat quick-phrase key a full 44px target, not a 36px one', () => {
    const css = read('src/online/chat/style.ts');
    const toggle = css.match(/\.match-chat-phrase-toggle\s*\{([^}]*)\}/);
    expect(toggle, 'the quick-phrase key must keep its own rule').not.toBeNull();
    const width = toggle![1]!.match(/(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/);
    const minWidth = toggle![1]!.match(/min-width:\s*(\d+(?:\.\d+)?)px/);
    const value = Number((width ?? minWidth)?.[1] ?? 0);
    expect(value, 'the quick-phrase key was 36px wide inside a 44px row').toBeGreaterThanOrEqual(44);
  });
});
