import type { Player, State } from '../../../src/engine/index.js';
import { viewFor } from '../../../src/engine/index.js';
import type { Step } from '../logic/anim.js';

export type DisplayEvent = { message: string; priority: number; duration: number; followup?: string; score?: string; mode?: 'amber'|'red' };
const owned = (state: State, player: Player) => Object.values(state.board).filter(tile => tile?.owner === player && !tile.root).length;
const scoreLine = (you: number, opp: number) => `YOU ${you} • ${opp} OPP`;

/** Readouts are derived from completed engine actions, never from animation guesses. */
export function displayEventForPlay(before: State, after: State, steps: readonly Step[], human: Player, turnStart: State | null = null): DisplayEvent | null {
  const a = viewFor(before, human), b = viewFor(after, human);
  const score = scoreLine(b.score, b.opponentScore);
  const myTiles = owned(after, human) - owned(before, human);
  const theirTiles = owned(after, (1 - human) as Player) - owned(before, (1 - human) as Player);
  const cutMine = steps.filter((step): step is Extract<Step,{k:'sever'}> => step.k === 'sever' && step.player === human).reduce((sum,step)=>sum+step.keys.length,0);
  const cutTheirs = steps.filter((step): step is Extract<Step,{k:'sever'}> => step.k === 'sever' && step.player !== human).reduce((sum,step)=>sum+step.keys.length,0);
  const bloom = steps.find((step): step is Extract<Step,{k:'grow'}> => step.k === 'grow' && step.style === 'bloom');
  const mega = steps.find((step): step is Extract<Step,{k:'megaBomb'}> => step.k === 'megaBomb');
  const mover = before.turnPlayer;
  if (mega) return { message:'MEGA BOMB', followup:`-${mega.destroyed.length} TILES`, priority:95, duration:1450, score };
  if (cutMine >= 2) return { message:`CUT -${cutMine}`, priority:90, duration:1450, score };
  if (bloom && mover === human) return { message:`BLOOM +${Math.max(0,myTiles)}`, priority:80, duration:1350, score };
  if (cutTheirs >= 2) return { message:`CUT -${cutTheirs}`, priority:75, duration:1350, score };
  if (myTiles <= -3) return { message:`-${-myTiles} TILES`, priority:85, duration:1350, score };
  if (myTiles >= 3) return { message:`+${myTiles} TILES`, priority:70, duration:1200, score };
  if (theirTiles >= 3 && mover !== human) return { message:`OPP +${theirTiles}`, priority:65, duration:1100, score };
  const wasLead = Math.sign(a.score - a.opponentScore), nowLead = Math.sign(b.score - b.opponentScore);
  if (nowLead && nowLead !== wasLead) return { message:nowLead > 0 ? `YOU LEAD +${b.score-b.opponentScore}` : `OPP LEADS +${b.opponentScore-b.score}`, priority:60, duration:1250, score };
  if (turnStart && steps.some(step=>step.k==='turn')) {
    const start = viewFor(turnStart,human);
    const delta = mover === human ? b.score-start.score : b.opponentScore-start.opponentScore;
    if (delta) return { message:`${mover === human ? 'TURN' : 'OPP'} ${delta > 0 ? '+' : ''}${delta}`, priority:45, duration:1050, score };
  }
  return null;
}

export { scoreLine };
