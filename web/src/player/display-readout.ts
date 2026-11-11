import type { Player, State } from '../../../src/engine/index.js';
import { viewFor } from '../../../src/engine/index.js';
import type { Step } from '../logic/anim.js';
import type { LedTone } from './led-cells.js';
import type { LedArt } from './led-art.js';
import type { FlavourPool } from './led-flavour.js';
import { FLAVOUR_POOLS, RIVAL_POOLS } from './led-flavour.js';

export type DisplayFlavour = { kind: string; pool: FlavourPool };
export type DisplayEvent = {
  /** The clear factual token (DRAW, +N, CUT-N, YOU WIN...). Always shown. */
  message: string; priority: number; duration: number; mode?: LedTone;
  /** Cosmetic choice only; the engine's RNG and hidden hands are never read. */
  key?: string; flavour?: DisplayFlavour;
  /** A short non-informative accent for a cut or a bloom. */
  accent?: 'cut' | 'bloom';
  /** A gentle attention pulse (waiting states). */
  pulse?: boolean;
  /** Pictures this moment MAY earn, best first (led-art.ts); the machine's ArtDeck decides how rarely. */
  anim?: readonly LedArt[];
};

const owned = (state: State, player: Player) => Object.values(state.board).filter(tile => tile?.owner === player && !tile.root).length;
const eventKey = (state: State, kind: string) => `${state.seed}:${state.turnNumber}:${state.history?.length ?? 0}:${kind}`;

/** Compact visible facts from completed engine actions. Ordinary moves remain quiet. */
/** `rival`: offline free play, where the sign is the opponent (RIVAL_POOLS); `neutral` everywhere else. */
export type DisplayVoice = 'neutral' | 'rival';
/** `art`: pictures may play (not in the teaching levels, not while watching a replay). */
export function displayEventForPlay(before: State, after: State, steps: readonly Step[], human: Player, voice: DisplayVoice = 'neutral', art = false): DisplayEvent | null {
  const a = viewFor(before, human), b = viewFor(after, human);
  const myTiles = owned(after, human) - owned(before, human);
  const theirTiles = owned(after, (1 - human) as Player) - owned(before, (1 - human) as Player);
  const cuts = steps.filter((step): step is Extract<Step,{k:'sever'}> => step.k === 'sever');
  const cutMine = cuts.filter(step=>step.player===human).reduce((sum,step)=>sum+step.keys.length,0);
  const cutTheirs = cuts.filter(step=>step.player!==human).reduce((sum,step)=>sum+step.keys.length,0);
  const bloom = steps.find((step): step is Extract<Step,{k:'grow'}> => step.k === 'grow' && step.style === 'bloom');
  const mega = steps.find((step): step is Extract<Step,{k:'megaBomb'}> => step.k === 'megaBomb');
  const as = (kind: keyof typeof FLAVOUR_POOLS): DisplayFlavour => ({ kind, pool: voice === 'rival' ? RIVAL_POOLS[kind] : FLAVOUR_POOLS[kind] });
  const make = (kind:string, message:string, priority:number, duration:number, mode:LedTone,
    extra: Pick<DisplayEvent,'flavour'|'accent'|'pulse'|'anim'> = {}):DisplayEvent =>
    ({message,priority,duration,mode,key:eventKey(after,kind),...extra});

  if (after.phase === 'GAME_OVER' && after.result) {
    const winner = after.result.winner;
    return make('result',winner===null?'DRAW GAME':winner===human?'YOU WIN':'OPP WINS',100,1700,
      winner===null?'ivory':winner===human?'green':'red',
      voice==='rival'&&winner!==null?{flavour:{kind:winner===human?'win':'lose',pool:RIVAL_POOLS[winner===human?'win':'lose']},
        ...(art&&winner!==human?{anim:['kanji'] as const}:{})}:{});
  }
  if (mega) {
    const mine = mega.player===human;
    return make('mega',`${mine?'+':'-'}${mega.destroyed.length}`,96,1150,mine?'green':'red',
      {flavour:as(mine?'mega':'mega-hit'),accent:'cut',...(art?{anim:!mine&&voice==='rival'?['blast','kanji'] as const:['blast'] as const}:{})});
  }
  // A cut of 6 or more may earn the snake; the opponent's big cut may earn the 点 instead.
  const bite = (n: number, theirs: boolean): Pick<DisplayEvent,'anim'> =>
    !art || n < 6 ? {} : { anim: theirs && voice === 'rival' ? ['kanji', 'snake'] : ['snake'] };
  if (cutMine>=3) return make('loss',`CUT-${cutMine}`,90,1050,'red',
    {flavour:as('cut-mine'),accent:'cut',...bite(cutMine,true)});
  if (cutTheirs>=3) return make('cut',`+${cutTheirs}`,88,1050,'green',
    {flavour:as('cut-theirs'),accent:'cut',...bite(cutTheirs,false)});

  const wasLead = Math.sign(a.score-a.opponentScore), nowLead = Math.sign(b.score-b.opponentScore);
  const comeback = a.score<=a.opponentScore-4 && b.score>=b.opponentScore && b.score>a.score;
  if (comeback) return make('comeback',`+${b.score-a.score}`,85,1050,'green',{flavour:as('comeback')});
  if (bloom && bloom.player===human && myTiles>=2) return make('bloom',`+${myTiles}`,80,1000,'green',
    {flavour:as('bloom'),accent:'bloom'});
  if (myTiles<=-3) return make('lost-tiles',`-${-myTiles}`,75,960,'red',{flavour:as('loss')});
  if (myTiles>=3) return make('gain',`+${myTiles}`,70,900,'green');
  if (theirTiles>=3 && before.turnPlayer!==human) return make('opponent-gain',`OPP +${theirTiles}`,68,960,'red');
  if (nowLead && nowLead!==wasLead) return make('lead',nowLead>0?'YOU LEAD':'OPP LEADS',65,1050,nowLead>0?'green':'red',
    {flavour:as(nowLead>0?'lead-you':'lead-them')});
  const delta = b.score-a.score;
  if (Math.abs(delta)>=3) return make('score-swing',`${delta>0?'+':''}${delta}`,60,900,delta>0?'green':'red');
  return null;
}
