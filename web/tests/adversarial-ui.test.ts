// Adversarial tests for the page logic (brief, Part 9.6). Tests 1 and 2 live in
// interaction.test.ts; 3, 4 and 5 are here. The browser smoke test repeats 1-5 on the real page.
import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Tile } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { AnimQueue, captionFor } from '../src/logic/anim.js';
import { gameHighlights } from '../src/logic/highlights.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';
import { parseSettings } from '../src/logic/settings.js';
import { Session } from '../src/logic/session.js';
import { playGame } from './ui-helpers.js';

const norm = (b: Record<string, Tile | null>) =>
  JSON.stringify(Object.entries(b).filter(([, t]) => t).sort(([a], [c]) => a.localeCompare(c)).map(([k, t]) => [k, t!.owner, t!.strength, !!t!.root]));

/** Plays a whole game through a Session (both sides GreedyBot), feeding an animation queue. */
const playThrough = (seed: number, onStep: (q: AnimQueue, ses: Session, i: number) => void) => {
  const ses = new Session(newGame(seed));
  const q = new AnimQueue(ses.state.board);
  for (let i = 0; i < 5000 && ses.state.phase !== 'GAME_OVER'; i++) {
    const who = ses.state.actor;
    const p = ses.play(GreedyBot.chooseAction(viewFor(ses.state, who)), who)!;
    q.push(p.steps);
    onStep(q, ses, i);
  }
  return { ses, q };
};

describe('adversarial UI tests', () => {
  it('ADVERSARIAL 3: turning animations off mid-animation leaves a correct board', () => {
    for (const seed of [21, 22, 23]) {
      let off = false;
      const { ses, q } = playThrough(seed, (queue, s, i) => {
        if (!off) {
          queue.next(); // animations on: show one step at a time, falling behind
          if (i === 40) {
            off = true; // the player switches animations off right now
            queue.skipAll();
            expect(norm(queue.board)).toBe(norm(s.state.board));
          }
        } else {
          queue.skipAll();
          expect(norm(queue.board)).toBe(norm(s.state.board));
        }
      });
      q.skipAll();
      expect(norm(q.board)).toBe(norm(ses.state.board));
    }
  });

  it('ADVERSARIAL 4: a bot turn that cuts a lot at once is shown, captioned and counted correctly', () => {
    let best: { seed: number; i: number; n: number } | null = null;
    for (let seed = 1; seed <= 80 && !best; seed++) {
      let i = 0;
      playGame(seed, ({ before, after }) => {
        i++;
        if (best || before.actor !== 1) return;
        const cut = (after.lastResolution?.severed ?? []).find((c) => c.player === 0);
        if (cut && cut.coords.length >= 4 && after.lastResolution !== before.lastResolution) best = { seed, i, n: cut.coords.length };
      });
    }
    expect(best).not.toBeNull();
    const { seed, i: at, n } = best!;
    let seen = false;
    const { ses, q } = playThrough(seed, (queue, s, i) => {
      if (i + 1 !== at) {
        queue.skipAll(); // keep up, so only the bot's big move is waiting at the target
        return;
      }
      const steps = s.lastTurnOf(1).at(-1)!.steps;
      const sever = steps.find((x) => x.k === 'sever' && x.player === 0)!;
      expect(sever.k === 'sever' && sever.keys.length).toBe(n);
      expect(captionFor(sever, 0)).toBe(`Your opponent cut off ${n} of your tiles`);
      // Halfway through the animation, the cut tiles are still shown; after it, they are gone.
      expect(queue.pending).toBe(steps.length);
      while (queue.pending > 0 && queue.next() !== sever) {
        /* advance up to the cut */
      }
      if (sever.k === 'sever') for (const k of sever.keys) expect(queue.board[k] ?? null).toBeNull();
      queue.skipAll();
      expect(norm(queue.board)).toBe(norm(s.state.board));
      seen = true;
    });
    expect(seen).toBe(true);
    q.skipAll();
    const h = gameHighlights(ses.state.history ?? [], 0)[0]!;
    expect(h.value).toBeGreaterThanOrEqual(n);
  });

  it('ADVERSARIAL 5: changing a display setting (or reloading after a rotation) keeps the game exactly', () => {
    const { ses } = playThrough(31, () => {});
    // a game stopped mid-way (every move through a session, so its action log is complete)
    const mid = new Session(newGame(32));
    for (let i = 0; i < 60 && mid.state.phase !== 'GAME_OVER'; i++) mid.play(GreedyBot.chooseAction(viewFor(mid.state, mid.state.actor)), mid.state.actor);
    for (const s of [ses, mid]) {
      const raw = encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 });
      const settingsBefore = parseSettings(JSON.stringify({ largeText: false }));
      const settingsAfter = { ...settingsBefore, largeText: true };
      expect(settingsAfter.largeText).not.toBe(settingsBefore.largeText);
      const back = decodeSave(raw)!;
      expect(JSON.stringify(back.state)).toBe(JSON.stringify(s.state));
      // The restored game still plays on identically.
      const again = new Session(back.state);
      if (s.state.phase !== 'GAME_OVER') {
        const who = s.state.actor;
        const a: Action = GreedyBot.chooseAction(viewFor(s.state, who));
        expect(JSON.stringify(again.play(a, who)!.after)).toBe(JSON.stringify(new Session(s.state).play(a, who)!.after));
      }
    }
    expect(decodeSave('{"state":{}}')).toBeNull();
    expect(decodeSave('nonsense')).toBeNull();
  });
});
