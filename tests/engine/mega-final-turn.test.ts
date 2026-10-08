import { describe, expect, it } from 'vitest';
import { allNeighbors, apply, coordKey, homeCoord, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { Session } from '../../web/src/logic/session.js';
import { decodeSave, encodeSave } from '../../web/src/logic/persist.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';

const bomb = (id: number) => ({ id, suit:null, rank:0 } as const);
const card = (id: number) => ({ id, suit:0, rank:3 } as const);
const play = (s: State, a: Action) => apply(s,a);

describe('Mega Bomb', () => {
  const position = () => {
    const base = newGame(3107);
    const target = { q:-1, r:2 };
    const board = { ...base.board };
    board[coordKey(target)] = { owner:1 as Player, strength:9 };
    for (const cell of allNeighbors(target)) {
      const key = coordKey(cell);
      if (board[key] === null) board[key] = { owner:1 as Player, strength:4 };
    }
    const hand = [bomb(1000),bomb(1001),card(1002)];
    return { state:{ ...base, board, hands:[hand,base.hands[1]] as State['hands'], phase:'ACT' as const }, target };
  };

  it('requires two Bombs and an enemy target adjacent to connected territory', () => {
    const { state,target } = position();
    const actions = legalActions(viewFor(state,0));
    expect(actions.some(a=>a.t==='MegaBomb' && coordKey(a.target)===coordKey(target))).toBe(true);
    expect(legalActions(viewFor({...state,hands:[[bomb(1000)],state.hands[1]]},0)).some(a=>a.t==='MegaBomb')).toBe(false);
    expect(()=>play(state,{t:'MegaBomb',cards:[1000,1001],target:homeCoord(0,state.config)})).toThrow();
    expect(()=>play(state,{t:'MegaBomb',cards:[1000,1001],target:homeCoord(1,state.config)})).toThrow();
  });

  it('appears beside ordinary Bloom options without changing their card sets', () => {
    const {state}=position();
    const extra=[{id:1400,suit:0,rank:4},{id:1401,suit:1,rank:4},{id:1402,suit:2,rank:4}] as State['hands'][0];
    const combined={...state,hands:[[...state.hands[0],...extra],state.hands[1]] as State['hands']};
    const legal=legalActions(viewFor(combined,0));
    expect(legal.some(a=>a.t==='MegaBomb')).toBe(true);
    expect(legal.some(a=>a.t==='Bloom' && a.cards.length===3)).toBe(true);
  });

  it('consumes both Bombs, removes only enemy non-home tiles in the seven-hex area, and replays exactly', () => {
    const { state,target } = position();
    const action: Action = {t:'MegaBomb',cards:[1000,1001],target};
    const after = play(state,action);
    expect(after.hands[0].map(c=>c.id)).toEqual([1002]);
    expect(after.lastResolution?.megaBomb?.destroyed).toHaveLength(6);
    expect(after.board[coordKey(target)]).toBeNull();
    expect(after.board[coordKey(homeCoord(0,state.config))]?.root).toBe(true);
    expect(after.board[coordKey(homeCoord(1,state.config))]?.root).toBe(true);
    expect(play(structuredClone(state),action)).toEqual(after);
  });

  it('also works at an edge and never destroys owned tiles', () => {
    const { state } = position();
    const target = {q:-3,r:3};
    const board = { ...state.board,[coordKey(target)]:{owner:1 as Player,strength:2} };
    const edge = {...state,board};
    const after = play(edge,{t:'MegaBomb',cards:[1000,1001],target});
    expect(after.board[coordKey(homeCoord(0,edge.config))]?.root).toBe(true);
    expect(after.lastResolution?.megaBomb?.destroyed.every(c=>edge.board[coordKey(c)]?.owner===1)).toBe(true);
  });

  it('can be undone and saved/reloaded deterministically', () => {
    const {state,target} = position();
    const action: Action = {t:'MegaBomb',cards:[1000,1001],target};
    const session = new Session(state,0);
    expect(session.play(action)).not.toBeNull();
    expect(session.canUndo).toBe(true);
    const raw = encodeSave({seed:state.seed,actions:[action],coach:null,level:7,base:state});
    expect(decodeSave(raw)?.state).toEqual(session.state);
    expect(session.undo()).toBe(true);
    expect(session.state).toEqual(state);
  });
});

describe('equal deck-end turns', () => {
  const ready = (mover: Player, turnNumber: number) => {
    const base = newGame(4301);
    return { ...base, startingPlayer:0 as Player, turnPlayer:mover, actor:mover, turnNumber,
      phase:'ACT' as const, deck:[], hands:[[card(1100)],[card(1101)]] as State['hands'] };
  };
  const finish = (state: State) => {
    const act = play(state,{t:'EndAct'});
    if (state.hands[state.turnPlayer].length === 0) return act;
    expect(act.phase).toBe('DISCARD');
    return play(act,{t:'Discard',card:act.hands[act.turnPlayer][0]!.id});
  };

  it('gives starter and then second player a full Grow-first final turn', () => {
    const first = finish(ready(1,2));
    expect(first.phase).toBe('ACT');
    expect(first.turnPlayer).toBe(0);
    expect(first.deckFinal).toEqual({first:0,remaining:2});
    expect(legalActions(viewFor(first,0)).every(a=>a.t!=='Draw')).toBe(true);
    expect(decodeSave(encodeSave({seed:first.seed,actions:[],coach:null,level:7,base:first}))?.state).toEqual(first);
    const second = finish(first);
    expect(second.phase).toBe('ACT');
    expect(second.turnPlayer).toBe(1);
    expect(second.deckFinal?.remaining).toBe(1);
    const end = finish(second);
    expect(end.phase).toBe('GAME_OVER');
    expect(end.result?.reason).toBe('deck_exhaustion');
  });

  it('ends after the non-starter gets their one no-draw final turn', () => {
    const last = finish(ready(0,3));
    expect(last.phase).toBe('ACT');
    expect(last.turnPlayer).toBe(1);
    expect(last.deckFinal).toEqual({first:1,remaining:1});
    const end = finish(last);
    expect(end.phase).toBe('GAME_OVER');
    expect(end.turnPlayer).toBe(1);
  });

  it('uses the recorded starting seat even when player 1 started', () => {
    const startSeatOne={...ready(0,2),startingPlayer:1 as Player};
    const first=finish(startSeatOne);
    expect(first.deckFinal).toEqual({first:1,remaining:2});
    expect(first.turnPlayer).toBe(1);
    const next={...ready(1,3),startingPlayer:1 as Player};
    const only=finish(next);
    expect(only.deckFinal).toEqual({first:0,remaining:1});
    expect(only.turnPlayer).toBe(0);
  });

  it('permits a regular Bloom and Mega Bomb during a no-draw final turn', () => {
    const bloomHand = [{id:1201,suit:0,rank:1},{id:1202,suit:0,rank:2},{id:1203,suit:0,rank:3}] as State['hands'][0];
    const bloomState = {...ready(0,3),hands:[bloomHand,[card(1101)]] as State['hands'],deckFinal:{first:0 as Player,remaining:1 as const}};
    const bloom = legalActions(viewFor(bloomState,0)).find(a=>a.t==='Bloom');
    expect(bloom).toBeDefined();
    expect(play(bloomState,bloom!).phase).toBe('ACT');

    const root = newGame(3107);
    const target={q:-1,r:2};
    const board={...root.board,[coordKey(target)]:{owner:1 as Player,strength:4}};
    const megaState: State={...root,board,phase:'ACT',deck:[],deckFinal:{first:0,remaining:1},hands:[[bomb(1300),bomb(1301),card(1302)],root.hands[1]]};
    const mega=legalActions(viewFor(megaState,0)).find(a=>a.t==='MegaBomb' && coordKey(a.target)===coordKey(target));
    expect(mega).toBeDefined();
    expect(play(megaState,mega!).board[coordKey(target)]).toBeNull();
  });

  it('lets the bot complete an ordinary no-draw final turn', () => {
    const first=finish(ready(0,3));
    let state=first;
    for(let i=0;i<12 && state.phase!=='GAME_OVER';i++) {
      const action=GreedyBot.chooseAction(viewFor(state,state.actor));
      expect(action.t).not.toBe('Draw');
      state=play(state,action);
    }
    expect(state.phase).toBe('GAME_OVER');
  });
});
