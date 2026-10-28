// THE TERRITORY KEY ROW'S ONE MOTION (owner, 2026-10-28: "i like the way they 'roll out' but its
// speed, the animations speed seems random and now very smooth neither, make that look clean
// organic and efficient, built it in a smart way so it loads instantly always").
//
// The roll-out IDEA stays. What is locked here is why it felt random, and why it can open on the
// next frame:
//
//   1. ONE transition list on the row's key. The old sheet had TWO different `transition`
//      shorthands on the same element (the base `.world-key` press list and the row's roll-out
//      list); the more specific one won outright, so the press lost its easing and, worse, the
//      row's `transition-delay` (a stagger meant for the roll-out) also delayed the press — by a
//      different amount for each key and in each state. That is the felt "random speed". Now
//      transform/opacity belong to the roll-out and scale/translate belong to the press, in ONE
//      property list, and only the roll-out carries the wave.
//   2. ONE delay formula, `--key-order * --key-stagger`, for both directions. Opening leads with
//      the key nearest MENU; closing is the same formula mirrored (`count - 1 - i`), so the fold
//      is the same gesture, not a second one.
//   3. EVERY key is indexed, from the live row (`keyRowOrder`), never from a fixed
//      `:nth-last-child` list that silently missed the next key added.
//   4. Nothing in the tap path measures, flushes or waits: the row already rests at opacity 0 on
//      screen, is pre-promoted with `will-change`, and `setKeys` only writes attributes and one
//      class. No forced layout, no rAF, no timer before the first animated frame.
//
// The built page is measured by web/e2e/territory-keys.ts (per-frame opacity, press delays,
// repeat runs, reduce motion, a filmstrip). This file guards the source so a rename or a stray
// override fails `npm run check` instead of the next visual pass.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keyRowOrder } from '../src/online/world-view.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const onlineCss = read('../src/online/online-css.ts');
const worldView = read('../src/online/world-view.ts');
const html = read('../index.html');

/** Every flat rule of a stylesheet, preludes tidied (comments removed, whitespace collapsed). */
const rules = (css: string): { prelude: string; body: string }[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      prelude: (m[1] ?? '').slice((m[1] ?? '').lastIndexOf('*/') + 2).replace(/\s+/g, ' ').trim(),
      body: m[2] ?? '',
    }))
    .filter((r) => !r.prelude.startsWith('@') && r.prelude !== '');

/** The selector list of a rule, split so a multi-line list matches each selector exactly. */
const selectorsOf = (prelude: string): string[] => prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim());

/** The declaration body of the FIRST rule whose selector list contains EXACTLY `selector`. */
const bodyOf = (css: string, selector: string): string | null =>
  rules(css).find((r) => selectorsOf(r.prelude).includes(selector))?.body ?? null;

/** Every rule whose selector list contains EXACTLY `selector`, in source order. */
const bodiesOf = (css: string, selector: string): string[] =>
  rules(css).filter((r) => selectorsOf(r.prelude).includes(selector)).map((r) => r.body);

/** One declaration's value, whitespace collapsed (`''` when the rule does not declare it). */
const decl = (body: string, name: string): string => {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const part of clean.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0 && part.slice(0, colon).trim() === name) return part.slice(colon + 1).replace(/\s+/g, ' ').trim();
  }
  return '';
};
const list = (body: string, name: string): string[] =>
  decl(body, name).split(',').map((s) => s.trim()).filter(Boolean);

/** The row's markup, and every key in it, in document order (leftmost first, MENU-nearest last). */
const rowStart = html.indexOf('<nav id="online-world-keys"');
const rowhtml = html.slice(rowStart, html.indexOf('</nav>', rowStart));
const rowKeysInMarkup = [...rowhtml.matchAll(/<button\b[^>]*class="world-key\b/g)].length;

/** The two rules that give the row its motion. */
const keyBody = bodyOf(onlineCss, '.world-keys .world-key');
const openBody = bodyOf(onlineCss, '.world-keys.open .world-key');
const rowOpen = bodyOf(onlineCss, '.world-keys.open');

describe('the roll-out is ONE motion, not two competing transition shorthands', () => {
  it('the row key exists, and its one transition list covers the roll-out AND the press', () => {
    expect(keyBody, '.world-keys .world-key must exist').not.toBeNull();
    const props = list(keyBody!, 'transition-property');
    // Roll-out: transform + opacity (compositor only). Press: scale + translate (separate
    // properties, so the two can coexist without either shorthand dropping the other).
    expect(props.slice(0, 2)).toEqual(['transform', 'opacity']);
    expect(props).toContain('scale');
    expect(props).toContain('translate');
    // No shorthand anywhere in the row's rule: a shorthand would reset the list below it.
    expect(keyBody!, 'the row must not use the transition shorthand').not.toMatch(/(^|;)\s*transition\s*:/);
  });

  it('the row loses nothing the base key transitions (the old override dropped box-shadow/colour)', () => {
    const base = bodyOf(onlineCss, '.world-key');
    expect(base, 'the shared .world-key rule must exist').not.toBeNull();
    const baseProps = [...base!.matchAll(/([a-z-]+)\s+[\d.]+m?s\s/g)].map((m) => m[1]!);
    expect(baseProps.length, 'the base key still declares its own press/glow timings').toBeGreaterThan(0);
    const rowProps = list(keyBody!, 'transition-property');
    for (const prop of baseProps) expect(rowProps, `${prop} must survive the row's rule`).toContain(prop);
  });

  it('the stagger delay lands on the roll-out ONLY: the press answers in --ix-press, undelayed', () => {
    const props = list(keyBody!, 'transition-property');
    const durations = list(keyBody!, 'transition-duration');
    const delays = list(keyBody!, 'transition-delay');
    // One delay entry per property, or the browser cycles them and the press inherits the wave.
    expect(delays.length).toBe(props.length);
    expect(durations.length).toBe(props.length);
    for (const [index, prop] of props.entries()) {
      const delay = delays[index]!;
      if (prop === 'transform' || prop === 'opacity') {
        expect(delay, `${prop} carries the one wave expression`).toBe('var(--key-wave)');
        expect(durations[index], `${prop} uses the vocabulary's direction token`).toBe('var(--key-move)');
      } else {
        expect(delay, `${prop} must never be delayed by the wave`).toBe('0ms');
        expect(durations[index], `${prop} answers in a press`).toBe('var(--ix-press)');
      }
    }
    // The timing function is the vocabulary's too - never a second easing personality.
    for (const easing of list(keyBody!, 'transition-timing-function')) {
      expect(['var(--key-ease)', 'var(--ix-ease-open)']).toContain(easing);
    }
  });

  it('the arrival and the fold are the vocabulary, and the wave gap is derived, not invented', () => {
    const row = bodyOf(onlineCss, '.world-keys');
    expect(row, '.world-keys must exist').not.toBeNull();
    // Folded state = the fold-back; open state = the arrival.
    expect(decl(row!, '--key-move')).toBe('var(--ix-close)');
    expect(decl(row!, '--key-ease')).toBe('var(--ix-ease-close)');
    expect(decl(rowOpen!, '--key-move')).toBe('var(--ix-open)');
    expect(decl(rowOpen!, '--key-ease')).toBe('var(--ix-ease-open)');
    // The stagger is a fifth of a press: a delay tied to the token, not a new duration token.
    expect(decl(row!, '--key-stagger')).toBe('calc(var(--ix-press) / 5)');
    // No hand-picked duration or curve is left in the row's motion: every value is a token.
    expect(decl(keyBody!, 'transition-duration')).not.toMatch(/\d/);
    for (const easing of list(keyBody!, 'transition-timing-function')) expect(easing).toMatch(/^var\(--(key-ease|ix-ease-open)\)$/);
  });

  it('the roll-out alone writes the open pose: opacity and transform, nothing expensive', () => {
    expect(openBody, '.world-keys.open .world-key must exist').not.toBeNull();
    const pose = openBody!;
    expect(decl(pose, 'opacity')).toBe('1');
    expect(decl(pose, 'transform').replace(/\s+/g, '')).toBe('translateX(0)scale(1)');
    // A filter, blur or shadow animation would break the map's own moving-layer budget.
    expect(pose, 'no filter/blur/shadow may join the roll-out').not.toMatch(/filter|blur|box-shadow/);
    expect(keyBody!, 'the row key paints no filter of its own').not.toMatch(/\bfilter\s*:/);
    // Pre-promoted, so the first tap needs no rasterisation: the row is ready before it opens.
    expect(decl(keyBody!, 'will-change')).toBe('transform, opacity');
    expect(pose, 'the open state must not restate the transition').not.toMatch(/transition/);
  });
});

describe('ONE delay formula, mirrored, and every key carries an index', () => {
  it('the row declares exactly one delay, one wave expression, one stagger', () => {
    const rowRules = rules(onlineCss).filter((r) => selectorsOf(r.prelude).some((s) => s.includes('.world-keys')));
    const delays = rowRules.flatMap((r) => [...r.body.matchAll(/transition-delay\s*:/g)]);
    expect(delays.length, 'the wave is declared once, on the row key').toBe(1);
    // The stagger appears once, on the row itself.
    const staggers = rules(onlineCss).filter((r) => /--key-stagger\s*:/.test(r.body));
    expect(staggers.length, '--key-stagger is declared once').toBe(1);
    expect(staggers[0]!.body).toContain('--key-stagger: calc(var(--ix-press) / 5)');
  });

  it('opening leads nearest-first; closing is the SAME formula mirrored, not a second one', () => {
    // The formula: order * stagger. Only `--key-order` changes direction.
    expect(decl(keyBody!, '--key-wave').replace(/\s+/g, '')).toBe('calc(var(--key-order)*var(--key-stagger))');
    expect(decl(keyBody!, '--key-order').replace(/\s+/g, '')).toBe('calc(var(--key-count,1)-1-var(--key-i,0))');
    expect(decl(openBody!, '--key-order').replace(/\s+/g, '')).toBe('var(--key-i,0)');
    // And the delay itself is the wave plus zero: no second, unrelated timing hides in it.
    expect(decl(keyBody!, 'transition-delay')).toBe('var(--key-wave), var(--key-wave), 0ms, 0ms, 0ms, 0ms');
  });

  it('every key in the markup gets an index from the row itself (a fourth/fifth cannot be missed)', () => {
    // The row really holds keys today; the count is read, never hardcoded in the test either.
    expect(rowKeysInMarkup, 'the row must hold keys').toBeGreaterThanOrEqual(3);
    // The view stamps the index from the live list, nearest MENU = 0.
    expect(worldView, 'the row key list is read from the live row').toContain("row?.querySelectorAll<HTMLButtonElement>('.world-key')");
    expect(worldView, 'every key is indexed from the list length').toContain('keyRowOrder(');
    expect(worldView, 'the key receives its index').toContain("setProperty('--key-i'");
    expect(worldView, 'the row receives the count the closed formula needs').toContain("setProperty('--key-count'");
    // The old trap: a fixed :nth-last-child list that stopped at three.
    expect(onlineCss, 'no fixed per-key selector list may come back').not.toMatch(/:nth-last-child\(/);
    // The pure order: unique, complete, and mirrored for any count a future row can have.
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const order = keyRowOrder(count);
      expect(order).toHaveLength(count);
      expect(new Set(order).size, 'each key has its own place in the wave').toBe(count);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(order[count - 1], 'the last key in the DOM is the first out (nearest MENU)').toBe(0);
      expect(order[0], 'the farthest key leads the fold').toBe(count - 1);
    }
  });
});

describe('the row opens on the next frame: the tap path writes, never measures', () => {
  const setKeys = /private setKeys\([\s\S]*?\n  \}/.exec(worldView)?.[0] ?? '';

  it('setKeys still owns every state the rest of the screen reads', () => {
    expect(setKeys, 'setKeys must exist').not.toBe('');
    expect(setKeys).toContain("classList.toggle('open', open)");
    expect(setKeys).toContain("toggleAttribute('inert', !open)");
    expect(setKeys).toContain("setAttribute('aria-expanded', String(open))");
    expect(setKeys).toContain("classList.toggle('on', open)");
    expect(setKeys).toContain('this.chat.setOpen(false)');
    expect(setKeys).toContain('this.setPane(null, false)');
    expect(setKeys).toContain('menu?.focus({ preventScroll: true })');
    expect(setKeys).toContain('this.paintPanel()');
  });

  it('the tap path never measures, flushes or waits (that is the old first-frame hunt)', () => {
    expect(setKeys, 'no layout read may sit in the tap path').not.toMatch(
      /getBoundingClientRect|offsetWidth|offsetHeight|offsetTop|clientWidth|clientHeight|getComputedStyle|scrollWidth/,
    );
    expect(setKeys, 'no frame or timer may be awaited before the class lands').not.toMatch(/requestAnimationFrame|setTimeout|setInterval|queueMicrotask/);
    // The one class change that starts the motion is the LAST write in the handler: nothing after
    // it can extend the task the first frame waits for.
    const classAt = setKeys.indexOf("classList.toggle('open', open)");
    expect(classAt, 'the open class is toggled').toBeGreaterThan(-1);
    expect(setKeys.slice(classAt + 1), 'nothing may follow the class toggle').not.toMatch(/\.(setAttribute|classList|toggleAttribute|textContent)\b/);
  });

  it('Escape still folds the row, and the row is stamped before it can ever be opened', () => {
    expect(worldView).toContain('else if (this.keysOpen) this.setKeys(false)');
    expect(worldView.indexOf("setProperty('--key-i'"), 'the index is stamped in the wiring, at construction').toBeLessThan(
      worldView.indexOf('private setKeys'),
    );
  });
});

describe('reduce motion still covers the keys: they simply appear', () => {
  it('both reduce paths switch the row and the MENU glyph off together', () => {
    expect(onlineCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.world-keys \.world-key, \.world-menu-glyph i \{ transition: none; \}/);
    expect(onlineCss).toMatch(/html\.reduce-motion :is\(\.world-keys \.world-key, \.world-menu-glyph i\) \{ transition: none; \}/);
    // And no promoted layer is kept for an animation that will not run.
    expect(onlineCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.world-keys \.world-key \{ will-change: auto; \}/);
    expect(onlineCss).toMatch(/html\.reduce-motion \.world-keys \.world-key \{ will-change: auto; \}/);
  });

  it('no reduced path can still stagger or travel a key', () => {
    // The `@media` path (exact selector) and the app-setting path (`:is(...)`) both reach the key.
    const mediaBody = bodiesOf(onlineCss, '.world-keys .world-key').find((body) => /transition:\s*none/.test(body));
    expect(mediaBody, 'the OS reduce rule reaches the row key').toBeTruthy();
    const appRule = /html\.reduce-motion :is\(\.world-keys \.world-key, \.world-menu-glyph i\) \{([^}]*)\}/.exec(onlineCss)?.[1] ?? '';
    expect(appRule, 'the app Reduce motion rule reaches the row key').toMatch(/transition:\s*none/);
    for (const body of [mediaBody!, appRule]) expect(body, 'a reduced key may not keep a delay').not.toMatch(/transition-delay/);
  });
});
