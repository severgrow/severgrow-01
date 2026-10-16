// THE SEEDS AWARD LINE, pinned without a browser. The finish card's reward used to be one muted
// sentence; it now has three honest states — nothing, a calm notice, and an award with a small
// moment — and this file owns the two rules that are easy to get wrong:
//
//   * NO SEEDS IS ABSENCE: never a zero, never an empty animation waiting for a number.
//   * REDUCE MOTION AND SPEED OFF GET THE STATIC FORM: the final number, one frame, no count, no
//     bloom, no timers left behind.
//
// The layout half ("does the line still fit one screen at 360x640?") is a real browser's job and is
// asserted there, next to the other finish-card measurement: web/e2e/finish-fit.ts.
//
// There is no jsdom in this repo, so a tiny DOM stub stands in (the pattern web/tests/tutorial-gate
// already uses). It records child order and `animate` calls, which is all the paint path touches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED_REVEAL_CSS, paintSeedReward, seedCountValues, seedReward } from '../src/ui/seed-reveal.js';
import type { SeedReward } from '../src/ui/seed-reveal.js';

class StubEl {
  id = '';
  className = '';
  hidden = false;
  animations = 0;
  readonly attrs = new Map<string, string>();
  children: StubEl[] = [];
  readonly classList = { add: (name: string) => { this.className = `${this.className} ${name}`.trim(); } };
  private own = '';
  constructor(readonly tag: string) {}
  /** Like the real thing: leaf text when there is text, otherwise the descendants' text joined. */
  get textContent(): string {
    return this.children.length ? this.children.map((child) => child.textContent).join('') : this.own;
  }
  set textContent(value: string) {
    this.own = value;
    this.children = [];
  }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
    if (key === 'id') this.id = value;
  }
  getAttribute(key: string) {
    return this.attrs.get(key) ?? null;
  }
  append(...kids: StubEl[]) {
    this.children.push(...kids);
  }
  replaceChildren(...kids: StubEl[]) {
    this.children = [...kids];
  }
  animate() {
    this.animations += 1;
    return { cancel: () => undefined };
  }
}

const nodes = new Map<string, StubEl>();

const installDom = () => {
  nodes.clear();
  const documentStub = {
    head: { append: (node: StubEl) => { if (node.id) nodes.set(node.id, node); } },
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: (tag: string) => new StubEl(tag),
    createElementNS: (_ns: string, tag: string) => new StubEl(tag),
    createTextNode: (data: string) => {
      const node = new StubEl('#text');
      node.textContent = data;
      return node;
    },
  };
  (globalThis as unknown as { document?: unknown }).document = documentStub;
  (globalThis as unknown as { window?: unknown }).window = {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  };
};

/** The painted row's own parts, in the order `paintSeedReward` builds them. */
const parts = (host: StubEl) => {
  const [sr, row] = host.children;
  const [bloom, emblem, num, word] = row!.children;
  return { sr: sr!, row: row!, bloom: bloom!, emblem: emblem!, num: num!, word: word! };
};

const paint = (host: StubEl, view: SeedReward, opts: { animate: boolean; tick?: (step: number, last: boolean) => void }) =>
  paintSeedReward(host as unknown as HTMLElement, view, opts);

let host: StubEl;
beforeEach(() => {
  vi.useFakeTimers();
  installDom();
  host = new StubEl('p');
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { document?: unknown }).document;
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('the reward message becomes one of three states', () => {
  it('an empty message is no reward at all', () => {
    expect(seedReward('')).toEqual({ kind: 'none' });
    expect(seedReward('   ')).toEqual({ kind: 'none' });
  });

  it('a win that paid is a number', () => {
    expect(seedReward('+12 Seeds')).toEqual({ kind: 'award', amount: 12 });
    expect(seedReward('+175 Seeds')).toEqual({ kind: 'award', amount: 175 });
    expect(seedReward('+1 Seed')).toEqual({ kind: 'award', amount: 1 });
  });

  it('a zero award is absence, never a number to stare at', () => {
    expect(seedReward('+0 Seeds')).toEqual({ kind: 'none' });
  });

  it('pending, capped and unavailable stay the calm sentences the game already wrote', () => {
    for (const text of ['Seeds pending verification', 'Seed limit reached today', 'Seed rewards unavailable for this match']) {
      expect(seedReward(text)).toEqual({ kind: 'notice', text });
    }
  });
});

describe('no Seeds shows nothing', () => {
  it('paints no line, no zero, no empty row', () => {
    paint(host, { kind: 'none' }, { animate: true });
    expect(host.hidden).toBe(true);
    expect(host.children).toHaveLength(0);
    expect(host.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a notice is still one calm line, exactly as before the reveal existed', () => {
    paint(host, { kind: 'notice', text: 'Seed limit reached today' }, { animate: true });
    expect(host.hidden).toBe(false);
    expect(host.textContent).toBe('Seed limit reached today');
    expect(host.children).toHaveLength(1); // a text node: no emblem, no count, no animation
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the count lands on the amount, in a few rising steps', () => {
  it('always ends exactly on the amount and never goes backwards', () => {
    for (const amount of [1, 3, 10, 50, 175]) {
      const values = seedCountValues(amount);
      expect(values.at(-1), `${amount}`).toBe(amount);
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < values.length; i++) expect(values[i]!, `${amount} ${values}`).toBeGreaterThan(values[i - 1]!);
      expect(new Set(values).size, `${amount}`).toBe(values.length);
    }
  });

  it('one Seed has nothing to count, so it is a single step', () => {
    expect(seedCountValues(1)).toEqual([1]);
  });
});

describe('Reduce motion and Speed off get the static form', () => {
  it('paints the final number at once, with no animation and no timers', () => {
    paint(host, { kind: 'award', amount: 50 }, { animate: false });
    const { row, num, bloom, emblem, word } = parts(host);
    expect(host.hidden).toBe(false);
    expect(num.textContent).toBe('+50');
    expect(word.textContent).toBe('Seeds');
    expect(emblem.children[0]!.className).toContain('seed-icon'); // the app's own emblem, reused
    expect([row.animations, bloom.animations, emblem.animations]).toEqual([0, 0, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the reduction is a first-class CSS rule, not an afterthought', () => {
    expect(SEED_REVEAL_CSS).toContain('.reduce-motion .seed-gain-bloom { display: none; }');
  });
});

describe('the award gets one moment, and only one', () => {
  it('starts at zero, animates the row / emblem / bloom, and lands on the amount', () => {
    const ticks: boolean[] = [];
    paint(host, { kind: 'award', amount: 50 }, { animate: true, tick: (_step, last) => ticks.push(last) });
    const { sr, row, num, bloom, emblem } = parts(host);
    expect(row.className).toBe('seed-gain');
    expect(num.textContent).toBe('+0');
    expect(row.animations).toBe(1);
    expect(emblem.animations).toBe(1);
    expect(bloom.animations).toBe(1);
    // The reader is told the same sentence the game always wrote; the moving row is decoration.
    expect(row.getAttribute('aria-hidden')).toBe('true');
    expect(sr.textContent).toBe('+50 Seeds');
    expect(sr.className).toBe('sr-only');
    vi.runAllTimers();
    expect(num.textContent).toBe('+50');
    expect(ticks.at(-1)).toBe(true);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('a repaint cancels the running count, so a re-render cannot double-step it', () => {
    paint(host, { kind: 'award', amount: 50 }, { animate: true });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    paint(host, { kind: 'notice', text: 'Seeds pending verification' }, { animate: true });
    expect(vi.getTimerCount()).toBe(0);
    expect(host.textContent).toBe('Seeds pending verification');
  });

  it('a late arrival repaints the SAME line: same host, one line either way', () => {
    paint(host, { kind: 'notice', text: 'Seeds pending verification' }, { animate: true });
    const before = host.children.length;
    paint(host, { kind: 'award', amount: 15 }, { animate: true });
    expect(host.children).toHaveLength(before + 1); // the invisible label + the row, nothing else
    expect(parts(host).num.textContent).toBe('+0');
    vi.runAllTimers();
    expect(parts(host).num.textContent).toBe('+15');
  });
});
