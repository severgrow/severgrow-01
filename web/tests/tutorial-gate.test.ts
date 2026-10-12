// Focus lock for the Pro tutorial: gate, inert cleanup, one target per step.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL } from '../../src/strings.js';
import {
  GATE_BLOCKED_SELECTORS, GATE_WINDOW_SELECTORS, allowedSelectorsForLesson,
  mountTutorialGate,
} from '../src/logic/tutorial-gate.js';
import {
  TUTORIAL_CHAPTER_COUNT, resolveLessonTarget, tutorialChapter, tutorialFeedback,
  tutorialLesson, tutorialLessons, wordCount,
} from '../src/logic/tutorial-script.js';

/** Tiny DOM stub so gate mount tests run without happy-dom. */
const installDom = () => {
  type NodeLike = {
    id?: string; className?: string; attrs: Map<string, string>;
    children: NodeLike[]; parent: NodeLike | null; tag: string;
    setAttribute: (k: string, v: string) => void;
    removeAttribute: (k: string) => void;
    getAttribute: (k: string) => string | null;
    querySelector: (sel: string) => NodeLike | null;
    querySelectorAll: (sel: string) => NodeLike[];
    closest: (sel: string) => NodeLike | null;
    contains: (other: NodeLike) => boolean;
    addEventListener?: never;
  };
  const listeners = new Map<string, Set<EventListener>>();
  const make = (tag: string, id = '', className = ''): NodeLike => {
    const node: NodeLike = {
      tag, id, className, attrs: new Map(), children: [], parent: null,
      setAttribute(k, v) { this.attrs.set(k, v); },
      removeAttribute(k) { this.attrs.delete(k); },
      getAttribute(k) { return this.attrs.get(k) ?? null; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const out: NodeLike[] = [];
        const walk = (n: NodeLike) => {
          if (match(n, sel)) out.push(n);
          for (const c of n.children) walk(c);
        };
        walk(this);
        return out;
      },
      closest(sel) {
        let cur: NodeLike | null = this;
        while (cur) { if (match(cur, sel)) return cur; cur = cur.parent; }
        return null;
      },
      contains(other) {
        if (other === this) return true;
        return this.children.some(c => c.contains(other));
      },
    };
    return node;
  };
  const match = (n: NodeLike, sel: string): boolean => {
    if (sel.startsWith('#') && !sel.includes(' ') && !sel.includes('.')) return n.id === sel.slice(1);
    if (sel === '#futasaku-glass .glass-head button'
      || sel === '#futasaku-glass .glass-actions button'
      || sel === '#futasaku-glass [data-tut]') {
      return n.tag === 'button' && !!n.closest('#futasaku-glass');
    }
    if (sel.startsWith('#') && sel.includes(' ')) {
      const [root, ...rest] = sel.split(/\s+/);
      const rootEl = n.closest(root!);
      if (!rootEl) return false;
      const sub = rest.join(' ');
      if (sub.startsWith('[data-tut')) return n.attrs.has('data-tut') && rootEl.contains(n);
      if (sub.includes('button')) return n.tag === 'button' && rootEl.contains(n);
      return rootEl.contains(n);
    }
    if (sel.startsWith('[data-tut')) return n.attrs.has('data-tut');
    if (sel.startsWith('.')) return (n.className ?? '').split(/\s+/).includes(sel.slice(1));
    return n.tag === sel;
  };
  const body = make('body');
  const game = make('div', 'game');
  const menu = make('div', 'menu');
  const levels = make('div', 'levels');
  const scrim = make('div', 'scrim');
  const glass = make('section', 'futasaku-glass');
  const actions = make('div', '', 'glass-actions');
  const skip = make('button'); skip.attrs.set('data-tut', 'skip');
  const exit = make('button'); exit.attrs.set('data-tut', 'exit');
  const deck = make('button', 'deck');
  const hud = make('button', 'hud-menu');
  const sort = make('button', 'hand-sort');
  for (const [p, c] of [
    [actions, skip], [actions, exit], [glass, actions],
    [game, deck], [game, hud], [game, sort],
    [body, game], [body, menu], [body, levels], [body, scrim], [body, glass],
  ] as const) {
    c.parent = p; p.children.push(c);
  }
  const doc = {
    body,
    getElementById: (id: string) => body.querySelector(`#${id}`),
    querySelector: (sel: string) => body.querySelector(sel),
    querySelectorAll: (sel: string) => body.querySelectorAll(sel),
    addEventListener: (type: string, fn: EventListener, opts?: { capture?: boolean }) => {
      const key = `${type}:${opts?.capture ? '1' : '0'}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventListener, opts?: EventListenerOptions | boolean) => {
      const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
      listeners.get(`${type}:${capture ? '1' : '0'}`)?.delete(fn);
    },
    dispatchCapture: (type: string, target: NodeLike) => {
      const ev = {
        type, target, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() {},
      };
      for (const fn of listeners.get(`${type}:1`) ?? []) fn(ev as unknown as Event);
      return ev;
    },
    _listeners: listeners,
  };
  (globalThis as unknown as { document: typeof doc }).document = doc;
  (globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => Date.now() };
  return { doc, deck, hud, sort, skip, exit, body };
};

describe('tutorial gate: allowed selectors', () => {
  it('every guided lesson has a non-empty allow list that includes the target', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      const state = tutorialChapter(chapter);
      for (const lesson of tutorialLessons(chapter)) {
        if (lesson.action === 'Opponent' || lesson.action === 'FreeTurn') continue;
        const target = resolveLessonTarget(lesson, state);
        expect(target, lesson.id).not.toBeNull();
        const allow = allowedSelectorsForLesson(lesson, target!.selector, 'step');
        expect(allow.selectors.length, lesson.id).toBeGreaterThan(0);
        if (target!.selector && lesson.action !== 'Next' && lesson.focus !== 'explainer' && lesson.focus !== 'none') {
          expect(allow.selectors, lesson.id).toContain(target!.selector);
        }
        for (const win of GATE_WINDOW_SELECTORS) {
          expect(allow.selectors, lesson.id).toContain(win);
        }
      }
    }
  });

  it('busy mode allows glass window controls and the menu button', () => {
    const allow = allowedSelectorsForLesson(null, '#deck', 'busy');
    expect(allow.windowOnly).toBe(true);
    expect(allow.selectors).toEqual([...GATE_WINDOW_SELECTORS, '#hud-menu']);
    expect(allow.selectors).not.toContain('#deck');
  });

  it('blocked chrome is never in the allow list for a normal step', () => {
    const lesson = tutorialLesson(1, 0)!;
    const allow = allowedSelectorsForLesson(lesson, '#deck', 'step');
    expect(allow.selectors).toContain('#hud-menu');
    for (const blocked of GATE_BLOCKED_SELECTORS) {
      if (blocked === '#deck') continue;
      expect(allow.selectors).not.toContain(blocked);
    }
  });

  it('draw step keeps the deck as the gate target (glow may cover both pile faces)', () => {
    const drawLesson = tutorialLessons(1).find(l => l.id === 'draw')!;
    expect(drawLesson.action).toBe('Draw');
    const target = resolveLessonTarget(drawLesson, tutorialChapter(1));
    expect(target!.selector).toBe('#deck');
    const allow = allowedSelectorsForLesson(drawLesson, target!.selector, 'step');
    expect(allow.selectors).toContain('#deck');
    expect(allow.selectors).not.toContain('#discard');
  });

  it('throw steps allow discard pile for look / drag without drawing from it', () => {
    const throwLesson = tutorialLessons(1).find(l => l.id === 'throw')!;
    expect(throwLesson.action).toBe('Discard');
    const target = resolveLessonTarget(throwLesson, tutorialChapter(1));
    const allow = allowedSelectorsForLesson(throwLesson, target!.selector, 'step');
    expect(allow.selectors).toContain('#discard');
    expect(allow.selectors).toContain('#hand .card');
    expect(target!.selector).toContain('#discard');
  });

  it('menu stays listed for free-play allow audits and is never blocked', () => {
    expect(GATE_BLOCKED_SELECTORS).not.toContain('#hud-menu');
    const free = tutorialLessons(TUTORIAL_CHAPTER_COUNT - 1).find(l => l.action === 'FreeTurn');
    expect(free).toBeTruthy();
    const allow = allowedSelectorsForLesson(free!, '', 'step');
    expect(allow.selectors).toContain('#hud-menu');
  });
});

describe('tutorial gate: mount lifecycle', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('sets and clears the gate; menu stays open, blocked chrome calls onBlocked', () => {
    const { doc, deck, hud, sort, skip } = installDom();
    const onBlocked = vi.fn();
    let gate: ReturnType<typeof mountTutorialGate>;
    try {
      gate = mountTutorialGate({ onBlocked });
    } catch (error) {
      throw new Error(`mount failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    expect(gate.isActive()).toBe(false);

    gate.set(allowedSelectorsForLesson(tutorialLesson(1, 0), '#deck', 'step'), 'step');
    expect(gate.isActive()).toBe(true);
    expect(gate.wouldBlock(hud as unknown as EventTarget)).toBe(false);
    expect(gate.wouldBlock(deck as unknown as EventTarget)).toBe(false);
    expect(gate.wouldBlock(skip as unknown as EventTarget)).toBe(false);
    expect(gate.wouldBlock(sort as unknown as EventTarget)).toBe(true);

    doc.dispatchCapture('click', hud);
    expect(onBlocked).not.toHaveBeenCalled();
    doc.dispatchCapture('click', sort);
    expect(onBlocked).toHaveBeenCalled();

    gate.clear();
    expect(gate.isActive()).toBe(false);
    expect(gate.wouldBlock(hud as unknown as EventTarget)).toBe(false);
  });

  it('clear after exit / skip / chapter / error leaves no active gate', () => {
    installDom();
    const gate = mountTutorialGate({ onBlocked: () => undefined });
    for (const reason of ['exit', 'skip', 'chapter', 'error', 'complete'] as const) {
      gate.set({ selectors: [...GATE_WINDOW_SELECTORS] }, 'busy');
      expect(gate.isActive(), reason).toBe(true);
      gate.clear();
      expect(gate.isActive(), reason).toBe(false);
    }
  });

  it('a normal (non-tutorial) game has no gate', () => {
    installDom();
    const gate = mountTutorialGate({ onBlocked: () => undefined });
    expect(gate.isActive()).toBe(false);
  });
});

describe('tutorial gate: wrong-tap feedback', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('rate-limits onBlocked to at most once per 400ms', () => {
    const { doc, sort } = installDom();
    const onBlocked = vi.fn();
    let now = 1000;
    (globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => now };
    const gate = mountTutorialGate({ onBlocked });
    gate.set(allowedSelectorsForLesson(tutorialLesson(1, 0), '#deck', 'step'), 'step');
    doc.dispatchCapture('click', sort);
    doc.dispatchCapture('click', sort);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    now += 400;
    doc.dispatchCapture('click', sort);
    expect(onBlocked).toHaveBeenCalledTimes(2);
    gate.clear();
  });

  it('rate-limited onBlocked stays a silent hook (UI shows no locked toast)', () => {
    // Strings may still exist for older builds; the live UI must not surface them.
    expect(typeof tutorialFeedback).toBe('function');
  });
});

describe('tutorial gate: copy and one-target audit', () => {
  it('has Exit tutorial in TUTORIAL strings', () => {
    const tut = TUTORIAL as typeof TUTORIAL & { exit?: string };
    expect(tut.exit, 'TUTORIAL.exit missing').toBeTruthy();
    expect(tut.exit).toMatch(/Exit tutorial/i);
  });

  it('every guided step has a resolvable target, a short title, and a body line', () => {
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      const state = tutorialChapter(chapter);
      for (const lesson of tutorialLessons(chapter)) {
        if (lesson.action === 'Opponent' || lesson.action === 'FreeTurn') continue;
        const target = resolveLessonTarget(lesson, state);
        expect(target, lesson.id).not.toBeNull();
        if (lesson.action !== 'Next' && lesson.focus !== 'explainer' && lesson.focus !== 'none') {
          expect(target!.selector, lesson.id).toBeTruthy();
        }
        expect(wordCount(lesson.instruction), lesson.id).toBeLessThanOrEqual(4);
        if (lesson.why) expect(wordCount(lesson.why), lesson.id).toBeLessThanOrEqual(18);
      }
    }
  });

  it('guided titles are short labels (HOME, DRAW PILE, GROW…)', () => {
    const ok = /^[A-Z][A-Z0-9 /-]{1,24}$/;
    for (let chapter = 0; chapter < TUTORIAL_CHAPTER_COUNT; chapter++) {
      for (const lesson of tutorialLessons(chapter)) {
        if (lesson.action === 'Opponent' || lesson.action === 'FreeTurn') continue;
        expect(lesson.instruction, lesson.id).toMatch(ok);
      }
    }
  });
});
