// The replay tool (spec 18): rebuild a game from seed + action log, validating each
// action and printing its events, then the final result.
import { apply, newGame } from '../engine/index.js';
import type { Action, RulesConfig, State } from '../engine/index.js';

const brief = (a: Action): string => {
  switch (a.t) {
    case 'Draw':
      return `Draw ${a.from}`;
    case 'MeldRun':
      return `MeldRun cards ${a.cards.join(',')} from ${a.start.q},${a.start.r} dir ${a.dir}`;
    case 'MeldSet':
      return `MeldSet cards ${a.cards.join(',')} on ${a.hexes.map((h) => `${h.q},${h.r}`).join(' ')}`;
    case 'PlayFruit':
      return `PlayFruit card ${a.card} on ${a.target.q},${a.target.r}`;
    case 'Discard':
      return `Discard card ${a.card}`;
    case 'RotPick':
      return `RotPick ${a.coord.q},${a.coord.r}`;
    default:
      return a.t;
  }
};

export const replayReport = (
  seed: number,
  actions: readonly Action[],
  config: Partial<RulesConfig> = {},
): { ok: boolean; text: string; state: State } => {
  let s = newGame(seed, config);
  const lines = [`Replay: seed ${seed}, ${actions.length} actions`];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]!;
    const before = s;
    try {
      s = apply(s, a);
    } catch (e) {
      lines.push(`#${i + 1} ${brief(a)} ILLEGAL: ${(e as Error).message}`);
      return { ok: false, text: lines.join('\n'), state: before };
    }
    lines.push(`#${i + 1} ${brief(a)}  (player ${before.actor + 1}, turn ${before.turnNumber})`);
    for (const e of s.history!.slice(before.history!.length)) lines.push(`    - ${JSON.stringify(e)}`);
  }
  lines.push(`Final: phase ${s.phase}${s.result ? `, result ${JSON.stringify(s.result)}` : ''}`);
  return { ok: true, text: lines.join('\n'), state: s };
};
