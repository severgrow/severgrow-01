import type { Player } from '../../../src/engine/index.js';
import type { Step } from '../logic/anim.js';

export type OutcomeCue = { step: Step; tone: 'good' | 'bad'; strength: number };

/** One truthful light cue per action, attached to the step where its result appears. */
export function outcomeCue(steps: readonly Step[], human: Player): OutcomeCue | null {
  const end = steps.find((step): step is Extract<Step, { k: 'end' }> => step.k === 'end');
  if (end?.result.winner !== undefined && end.result.winner !== null)
    return { step: end, tone: end.result.winner === human ? 'good' : 'bad', strength: 1 };

  const bomb = steps.find((step): step is Extract<Step, { k: 'megaBomb' }> => step.k === 'megaBomb');
  if (bomb) return { step: bomb, tone: bomb.player === human ? 'good' : 'bad', strength: Math.min(1, .58 + bomb.destroyed.length * .07) };

  const cut = steps.filter((step): step is Extract<Step, { k: 'sever' }> => step.k === 'sever')
    .sort((a, b) => b.keys.length - a.keys.length)[0];
  if (cut) return { step: cut, tone: cut.player === human ? 'bad' : 'good', strength: Math.min(.94, .52 + cut.keys.length * .1) };

  const grow = steps.find((step): step is Extract<Step, { k: 'grow' }> => step.k === 'grow');
  if (grow) return { step: grow, tone: grow.player === human ? 'good' : 'bad',
    strength: grow.style === 'bloom' ? .68 : grow.tiles.some(tile => tile.replaced) ? .58 : .32 };

  const fruit = steps.find((step): step is Extract<Step, { k: 'fruit' }> => step.k === 'fruit');
  if (fruit) return { step: fruit, tone: fruit.player === human ? 'good' : 'bad', strength: .6 };

  const strengthen = steps.find((step): step is Extract<Step, { k: 'strengthen' }> => step.k === 'strengthen');
  return strengthen ? { step: strengthen, tone: strengthen.player === human ? 'good' : 'bad', strength: .32 } : null;
}
