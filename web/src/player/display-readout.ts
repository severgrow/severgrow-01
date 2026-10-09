import type { Player, State } from '../../../src/engine/index.js';
import { viewFor } from '../../../src/engine/index.js';
import type { Step } from '../logic/anim.js';
import type { LedMotif, LedTone } from './led-cells.js';

export type DisplayPersonality = { chance: number; lines: readonly string[]; motif?: LedMotif; tone?: LedTone };
export type DisplayEvent = {
  message: string; priority: number; duration: number; mode?: LedTone;
  /** Cosmetic choice only; the engine's RNG and hidden hands are never read. */
  key?: string; personality?: DisplayPersonality;
};

const owned = (state: State, player: Player) => Object.values(state.board).filter(tile => tile?.owner === player && !tile.root).length;
const eventKey = (state: State, kind: string) => `${state.seed}:${state.turnNumber}:${state.history?.length ?? 0}:${kind}`;

/** Compact visible facts from completed engine actions. Ordinary moves remain quiet. */
export function displayEventForPlay(before: State, after: State, steps: readonly Step[], human: Player): DisplayEvent | null {
  const a = viewFor(before, human), b = viewFor(after, human);
  const myTiles = owned(after, human) - owned(before, human);
  const theirTiles = owned(after, (1 - human) as Player) - owned(before, (1 - human) as Player);
  const cuts = steps.filter((step): step is Extract<Step,{k:'sever'}> => step.k === 'sever');
  const cutMine = cuts.filter(step=>step.player===human).reduce((sum,step)=>sum+step.keys.length,0);
  const cutTheirs = cuts.filter(step=>step.player!==human).reduce((sum,step)=>sum+step.keys.length,0);
  const bloom = steps.find((step): step is Extract<Step,{k:'grow'}> => step.k === 'grow' && step.style === 'bloom');
  const mega = steps.find((step): step is Extract<Step,{k:'megaBomb'}> => step.k === 'megaBomb');
  const make = (kind:string, message:string, priority:number, duration:number, mode:LedTone, personality?:DisplayPersonality):DisplayEvent =>
    ({message,priority,duration,mode,key:eventKey(after,kind),...(personality?{personality}:{})});

  if (after.phase === 'GAME_OVER' && after.result) {
    const winner = after.result.winner;
    return make('result',winner===null?'DRAW GAME':winner===human?'YOU WIN':'OPP WINS',100,1700,
      winner===null?'ivory':winner===human?'green':'red');
  }
  if (mega) {
    const mine = mega.player===human;
    return make('mega',`${mine?'+':'-'}${mega.destroyed.length}`,96,1150,mine?'green':'red',
      {chance:100,lines:mine?['OH.','BOOM']:['OH.','RUDE.'],motif:'shock',tone:'ivory'});
  }
  if (cutMine>=3) return make('loss',`-${cutMine}`,90,1050,'red',
    {chance:cutMine>=6?35:18,lines:['RUDE.','OUCH','RIP'],motif:'scatter',tone:'red'});
  if (cutTheirs>=3) return make('cut',`+${cutTheirs}`,88,1050,'green',
    {chance:cutTheirs>=6?32:16,lines:['CLEAN','NICE.','OOOH'],motif:'stars',tone:'green'});

  const wasLead = Math.sign(a.score-a.opponentScore), nowLead = Math.sign(b.score-b.opponentScore);
  const comeback = a.score<=a.opponentScore-4 && b.score>=b.opponentScore && b.score>a.score;
  if (comeback) return make('comeback',`+${b.score-a.score}`,85,1050,'green',
    {chance:45,lines:['BACK!','HELLO','♥'],motif:'heart',tone:'pink'});
  if (bloom && bloom.player===human && myTiles>=2) return make('bloom',`+${myTiles}`,80,1000,'green',
    {chance:myTiles>=5?30:12,lines:['NICE.','OOOH','CLEAN'],motif:'stars',tone:'green'});
  if (myTiles<=-3) return make('lost-tiles',`-${-myTiles}`,75,960,'red');
  if (myTiles>=3) return make('gain',`+${myTiles}`,70,900,'green');
  if (theirTiles>=3 && before.turnPlayer!==human) return make('opponent-gain',`OPP +${theirTiles}`,68,960,'red');
  if (nowLead && nowLead!==wasLead) return make('lead',nowLead>0?'YOU LEAD':'OPP LEADS',65,1050,nowLead>0?'green':'red',
    {chance:18,lines:['OOOH','BOLD'],tone:nowLead>0?'green':'red'});
  const delta = b.score-a.score;
  if (Math.abs(delta)>=3) return make('score-swing',`${delta>0?'+':''}${delta}`,60,900,delta>0?'green':'red');
  return null;
}
