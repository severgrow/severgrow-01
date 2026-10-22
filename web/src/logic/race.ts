// The score race (UI overhaul item 14): a thin tug-of-war bar under the header, and the
// breakdown shown when a score is tapped. Pure.

import type { Player, View } from '../../../src/engine/index.js';
import { score } from '../../../src/engine/index.js';
import { scoreBreakdown } from './endgame.js';
import { t, tPlural } from '../../../src/i18n/index.js';

/** How much of the bar is mine (0.5 = level). Never fully one colour: the other side keeps a sliver. */
export const raceShare = (me: number, opp: number): number => {
  const a = Math.max(0, me);
  const b = Math.max(0, opp);
  if (a + b === 0) return 0.5;
  return Math.min(0.94, Math.max(0.06, a / (a + b)));
};

/** The bar in words (for screen readers): who leads and by how much. */
export const raceWords = (me: number, opp: number, oppLabel: string): string =>
  me === opp ? t('ui.race.level', 'Level at {n}', { n: me }) : me > opp ? t('ui.race.youLead', 'You lead by {n}', { n: me - opp }) : t('ui.race.oppLeads', '{opp} leads by {n}', { opp: oppLabel, n: opp - me });

export type Breakdown = { tiles: number; gold: number; root: number; total: number; lines: string[] };

/** What a score is made of: 1 per tile, +1 more on gold, and the root when it counts. The total
 *  is the engine's authoritative score, so the displayed breakdown can never drift from the rules. */
export const breakdownOf = (v: Pick<View, 'board' | 'terrain' | 'config'>, p: Player): Breakdown => {
  const b = scoreBreakdown(v, p);
  const root = v.config.rootsScore && Object.values(v.board).some((t) => t?.owner === p && t.root) ? 1 : 0;
  const total = score(v, p);
  const lines = [t('ui.race.tilesLine', '{tiles}: {n}', { tiles: tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, b.tiles), n: b.tiles })];
  if (b.gold) lines.push(t('ui.race.goldLine', '{n} on gold: +{n}', { n: b.gold }));
  if (root) lines.push(t('ui.race.rootLine', 'Root: +1'));
  lines.push(t('ui.race.totalLine', 'Total: {n}', { n: total }));
  return { tiles: b.tiles, gold: b.gold, root, total, lines };
};
