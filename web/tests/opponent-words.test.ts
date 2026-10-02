// UI polish pass 3, Part 3: the player never sees the word "bot". Everything the page says
// about the other side comes from OPPONENT_LABEL (src/strings.ts). This test scans the
// strings file, the page's HTML (text, aria-labels, alt and title text, the description),
// and every message the game builds while real games are played: the move log, the board
// captions, the highlights, move descriptions, warnings, previews, the coach and the tips.
// (The browser test also scans the live page in every state: web/e2e/smoke.ts.)
import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Event, Player, State } from '../../src/engine/index.js';
import { OPP, OPPONENT_LABEL } from '../../src/strings.js';
import { COACH_STEPS, TIP_ORDER, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import { moveSentence } from '../../src/playtest/names.js';
import { dangerWarning } from '../../src/playtest/analysis.js';
import { describe, resultReason, resultTitle } from '../src/logic/log.js';
import { buildSteps, captionFor } from '../src/logic/anim.js';
import { gameHighlights } from '../src/logic/highlights.js';
import { previewMove } from '../src/logic/preview.js';
import { TIPS } from '../src/logic/tips.js';
import { bannerView, showTurn, HIDDEN } from '../src/logic/turnbanner.js';
import { playGame } from './ui-helpers.js';

/** The one rule: no whole word "bot" or "bots", in any case. */
const BOT = /\bbots?\b/i;
/** Intentional exceptions (none so far). */
export const ALLOWLIST: readonly string[] = [];
const clean = (text: string) => !BOT.test(text) || ALLOWLIST.some((a) => text.includes(a));

group('the word "bot" never reaches the player', () => {
  it('the strings file: one label, every phrase built from it, none says "bot"', () => {
    expect(OPPONENT_LABEL).toBe('Opponent');
    for (const [k, v] of Object.entries(OPP)) {
      expect(clean(v), k).toBe(true);
      expect(v.toLowerCase(), k).toContain(OPPONENT_LABEL.toLowerCase());
    }
  });

  it("the page's HTML: visible text, aria-labels, alt and title text, the description", () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]*>/g, ' ');
    const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]!);
    for (const t of [text, ...attrs]) expect(clean(t), t.slice(0, 80)).toBe(true);
    // the HTML uses the same words as OPPONENT_LABEL (static text cannot import it)
    expect(html).toContain(`>${OPP.label}<`);
    expect(html).toContain(`${OPP.label} score`);
  });

  it('every message built while real games are played (log, captions, highlights, moves, warnings, previews, coach)', () => {
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
    expect(COACH_STEPS).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(200);
    const bad = [...seen].filter((t) => !clean(t));
    expect(bad).toEqual([]);
    // and the other side is named in plenty of them
    expect([...seen].filter((t) => t.includes(OPP.noun) || t.includes(OPP.label)).length).toBeGreaterThan(20);
  });
});
