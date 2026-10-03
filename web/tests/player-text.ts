// Every message the game builds while real games are played: the move log, the board
// captions, the highlights, move descriptions, warnings, previews, the coach, the tips and the
// turn banner. Shared by the word scans (opponent-words.test.ts, seed-words.test.ts).
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Event, Player, State } from '../../src/engine/index.js';
import { TIP_ORDER, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import { moveSentence } from '../../src/playtest/names.js';
import { dangerWarning } from '../../src/playtest/analysis.js';
import { describe, resultReason, resultTitle } from '../src/logic/log.js';
import { buildSteps, captionFor } from '../src/logic/anim.js';
import { gameHighlights } from '../src/logic/highlights.js';
import { previewMove } from '../src/logic/preview.js';
import { TIPS } from '../src/logic/tips.js';
import { bannerView, showTurn, HIDDEN } from '../src/logic/turnbanner.js';
import { playGame } from './ui-helpers.js';

let cache: string[] | null = null;
export const playerMessages = (): readonly string[] => {
  if (cache) return cache;
  const seen = new Set<string>();
  const add = (t: string | null | undefined) => {
    if (t) seen.add(t);
  };
  for (const seed of [3, 11, 27]) {
    let i = 0;
    let history: readonly Event[] = [];
    let last: State | null = null;
    playGame(seed, ({ before, action, after }) => {
      i++;
      for (const me of [0, 1] as Player[]) {
        add(describe(before, action, after, me));
        for (const st of buildSteps(before, action, after, me)) add(captionFor(st, me));
      }
      if (after.phase === 'ACT' && i % 4 === 0) {
        const v = viewFor(after, after.actor);
        const legal = legalActions(v);
        for (const a of legal.slice(0, 12)) {
          add(moveSentence(v, a));
          add(dangerWarning(v, a));
          const pv = previewMove(v, a);
          add(pv?.chip);
          add(pv?.warning);
          add(pv?.note);
        }
        const adv = coachAdvice({ view: v, step: 0, enabled: true, taught: [], known: [] });
        if (adv) {
          for (const t of Object.values(adv).flat()) if (typeof t === 'string') add(t);
          add(adv.tip?.text);
        }
      }
      history = after.history ?? history;
      last = after;
    });
    for (const me of [0, 1] as Player[]) {
      if (last!.result) {
        add(resultTitle(last!.result, me));
        add(resultReason(last!.result, me));
      }
      for (const h of gameHighlights(history, me)) add(h.text);
    }
  }
  const s = coachSummary(TIP_ORDER, viewFor(playGame(3, undefined, 1), 0).config);
  add(s.title);
  s.bullets.forEach(add);
  for (const t of Object.values(TIPS)) {
    add(t.title);
    add(t.text);
  }
  for (const p of [0, 1] as Player[]) add(bannerView(showTurn(HIDDEN, p, { speed: 1, reduceMotion: false, skip: false, effects: 'normal' })).label);
  cache = [...seen];
  return cache;
};
