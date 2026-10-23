// A lesson narrows what the page offers: no Bloom before level 5 (owner, 2026-10-22). The session is
// the page's one door for moves, so a Bloom it does not offer can be neither seen nor played.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';
import { lessonAllows, lessonFor, lessonOpening } from '../src/lessons/lessons.js';

/** Level 5's opening after its first draw: a Bloom (3-3-3) is legal in the engine. */
const withBloom = (): State => {
  let s = lessonOpening(lessonFor(5)!);
  s = apply(s, legalActions(viewFor(s, 0)).find((a) => a.t === 'Draw' && a.from === 'deck')!);
  return s;
};

describe('Session.allow', () => {
  it('drops a move the lesson does not offer from the legal list, and refuses to play it', () => {
    const s = withBloom();
    const bloom = legalActions(viewFor(s, 0)).find((a) => a.t === 'Bloom');
    expect(bloom).toBeDefined();
    const early = new Session(s, 0);
    early.allow = (a) => lessonAllows({ level: 4 }, a);
    expect(early.legal.some((a) => a.t === 'Bloom')).toBe(false);
    expect(early.legal.some((a) => a.t === 'Sprout')).toBe(true);
    expect(early.play(bloom!)).toBeNull();
    expect(early.state).toBe(s);
  });

  it('offers and plays it once the lesson has taught it', () => {
    const s = withBloom();
    const taught = new Session(s, 0);
    taught.allow = (a) => lessonAllows({ level: 5 }, a);
    const bloom = taught.legal.find((a) => a.t === 'Bloom');
    expect(bloom).toBeDefined();
    expect(taught.play(bloom!)).not.toBeNull();
  });

  it('with no lesson, every legal move is offered', () => {
    const s = withBloom();
    expect(new Session(s, 0).legal).toEqual(legalActions(viewFor(s, 0)));
  });
});
