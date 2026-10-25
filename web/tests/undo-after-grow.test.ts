// UNDO AFTER A GROW MUST TAKE BACK THE GROW (owner report, 2026-10-24).
//
// After the one Grow, tapping the board skips the optional Bloom and goes straight to Throw. The app
// plays that EndAct itself. It used to be checkpointed like any other move, so the undo stack became
// [before-Grow, before-EndAct] and the FIRST Undo took back only the app's jump to Throw — the board
// still showed the Grow, so Undo looked like it did nothing until you pressed it twice.
//
// These tests pin the distinction: an app-initiated EndAct (`{ auto: true }`) is not a stop of its
// own, while a DELIBERATE "throw a card" stays undoable exactly as before.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';

const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

/** The source of a named function body in main.ts, by brace matching from its opening `{`. */
const bodyOf = (name: string): string => {
  const at = main.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`main.ts no longer defines ${name}()`);
  const open = main.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < main.length; i += 1) {
    if (main[i] === '{') depth += 1;
    else if (main[i] === '}') {
      depth -= 1;
      if (depth === 0) return main.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${name}()`);
};

/** A position where the player has a Grow available, reached by a real draw from a seed. */
const growable = (): State => {
  for (let seed = 1; seed < 500; seed++) {
    const start = newGame(seed);
    const draw = legalActions(viewFor(start, 0)).find((a) => a.t === 'Draw' && a.from === 'deck');
    if (!draw) continue;
    const s = apply(start, draw);
    if (s.actor === 0 && legalActions(viewFor(s, 0)).some((a) => a.t === 'Sprout')) return s;
  }
  throw new Error('no growable opening found');
};

const grow = (s: State): Action => legalActions(viewFor(s, 0)).find((a) => a.t === 'Sprout')!;
const endAct = (s: State): Action => legalActions(viewFor(s, 0)).find((a) => a.t === 'EndAct')!;

describe('undo after a Grow', () => {
  it('the app\u2019s own jump to Throw is NOT a separate undo stop', () => {
    const session = new Session(growable(), 0);
    const before = session.state;
    const growMove = grow(before);
    expect(session.play(growMove, 0)).not.toBeNull();
    const afterGrow = session.state;
    // The app skips Bloom to Throw on the player's behalf.
    expect(session.play(endAct(afterGrow), 0, { auto: true })).not.toBeNull();
    expect(session.state.phase).not.toBe('ACT');

    // ONE undo must land on the position before the Grow — not on the world after it.
    expect(session.canUndo).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.state).toEqual(before);
  });

  it('a DELIBERATE throw-a-card is still undoable, exactly as before', () => {
    const session = new Session(growable(), 0);
    const growMove = grow(session.state);
    session.play(growMove, 0);
    const afterGrow = session.state;
    session.play(endAct(afterGrow), 0); // no `auto`: the player pressed it

    // First undo takes back the deliberate EndAct; a second takes back the Grow.
    expect(session.undo()).toBe(true);
    expect(session.state).toEqual(afterGrow);
    expect(session.undo()).toBe(true);
    expect(session.state.actor).toBe(0);
  });

  it('an auto EndAct never strands the player with nothing to undo', () => {
    const session = new Session(growable(), 0);
    session.play(grow(session.state), 0);
    session.play(endAct(session.state), 0, { auto: true });
    // The Grow's own checkpoint is still there; the auto step did not replace it.
    expect(session.canUndo).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.state.phase).toBe('ACT');
  });

  // The FIRST fix marked only the board-tap path (`trySkipBloomToThrow`). Every other EndAct the
  // app plays for the player was still a checkpoint, and the clearest one is `autoAdvance`: on a
  // turn with nothing left but EndAct it plays the EndAct ~250 ms after the Grow. Proven in the
  // built app (a practice game from seed 2): the card reached DISCARD, one Undo returned to the
  // state AFTER the Grow, and the `skippedFrom` guard stopped the auto-skip re-firing, so the
  // player was left in ACT with only "Skip" — the same "Undo did nothing" report, one level along.
  it('every EndAct the app plays on the player’s behalf is marked auto', () => {
    for (const fn of ['autoAdvance', 'ensureTutorialThrowPhase', 'scheduleTutorialRoutineThrow', 'trySkipBloomToThrow']) {
      const body = bodyOf(fn);
      expect(body, `${fn}() plays an EndAct for the player`).toMatch(/\b(?:humanPlay|session\.play)\(end[^;]*auto:\s*true/s);
    }
  });
});
