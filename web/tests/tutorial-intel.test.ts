import { describe, expect, it } from 'vitest';
import { apply, createCards, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { matchIntel, openingPublicDiscard, publicDiscardHistory } from '../src/logic/match-intel.js';
import { Session } from '../src/logic/session.js';
import { tutorialAccepts, tutorialChapter, tutorialLesson, tutorialLessons, tutorialOpponentAction, TUTORIAL_CHAPTER_COUNT } from '../src/logic/tutorial-script.js';

const intended = (state: State, chapter: number, step: number): Action => {
  const lesson=tutorialLesson(chapter,step)!;
  const action=legalActions(viewFor(state,0)).find(candidate=>tutorialAccepts(lesson,candidate,state));
  expect(action,`chapter ${chapter+1}, ${lesson.id}`).toBeDefined();
  return action!;
};

describe('authored tutorial uses the current engine',()=>{
  it('offers a legal action at every guided step without changing card identities',()=>{
    expect(TUTORIAL_CHAPTER_COUNT).toBe(10);
    for(let chapter=0;chapter<TUTORIAL_CHAPTER_COUNT-1;chapter++) {
      let state=tutorialChapter(chapter);
      const cards=[...state.hands[0],...state.hands[1],...state.deck,...state.discard];
      expect(cards).toHaveLength(createCards(state.config).length);
      expect(new Set(cards.map(card=>card.id)).size).toBe(cards.length);
      for(const [step,lesson] of tutorialLessons(chapter).entries()) {
        if(lesson.action==='Opponent') break;
        const action=intended(state,chapter,step);
        state=apply(state,action);
      }
    }
  });

  it('guides the opening without accepting unrelated legal actions',()=>{
    const state=tutorialChapter(0);
    const draw=tutorialLesson(0,0)!;
    expect(tutorialAccepts(draw,{t:'Draw',from:'deck'},state)).toBe(true);
    expect(tutorialAccepts(draw,{t:'Draw',from:'discard'},state)).toBe(false);
    const after=apply(state,{t:'Draw',from:'deck'});
    const grow=tutorialLesson(0,1)!;
    expect(tutorialAccepts(grow,{t:'EndAct'},after)).toBe(false);
    expect(legalActions(viewFor(after,0)).some(action=>tutorialAccepts(grow,action,after))).toBe(true);
  });

  it('the Cut lesson actually removes separated enemy territory',()=>{
    let state=tutorialChapter(3);
    state=apply(state,intended(state,3,0));
    expect(state.board['1,-1']?.owner).toBe(0);
    expect(state.board['0,-1']).toBeNull();
    expect(state.lastResolution?.severed.some(group=>group.player===1&&group.coords.some(c=>c.q===0&&c.r===-1))).toBe(true);
  });

  it('the Bomb and Mega Bomb lessons use distinct legal actions and protect both homes',()=>{
    const bomb=tutorialChapter(5), mega=tutorialChapter(6);
    expect(intended(bomb,5,0).t).toBe('PlayFruit');
    const action=intended(mega,6,0);
    expect(action.t).toBe('MegaBomb');
    const after=apply(mega,action);
    expect(after.board['2,-2']?.root).toBe(true);
    expect(after.board['-2,2']?.root).toBe(true);
    expect(after.board['0,0']?.owner).toBe(0);
    expect(after.lastResolution?.megaBomb?.destroyed.length).toBeGreaterThanOrEqual(3);
  });

  it('the final-turn lesson gives the scripted opponent the equalising Grow-first turn',()=>{
    let state=tutorialChapter(8);
    expect(state.phase).toBe('ACT');
    expect(state.deck).toHaveLength(0);
    state=apply(state,intended(state,8,0));
    state=apply(state,intended(state,8,1));
    expect(state.actor).toBe(1);
    expect(state.phase).toBe('ACT');
    while(state.phase!=='GAME_OVER') {
      const action=tutorialOpponentAction(legalActions(viewFor(state,1)));
      expect(action).not.toBeNull();
      state=apply(state,action!);
    }
    expect(state.result?.reason).toBe('deck_exhaustion');
  });
});

describe('Match Intel and replay boundaries',()=>{
  it('uses public discard events and retains cards seen before they were picked up',()=>{
    const state=tutorialChapter(7);
    const view=viewFor(state,0);
    const opening=openingPublicDiscard(state,state);
    const card=opening.at(-1)!;
    const history=[{t:'Discard' as const,player:1 as const,card:card.id}];
    const seen=publicDiscardHistory(view,history,opening);
    expect(seen.map(item=>item.id)).toEqual([card.id,card.id]);
    const intel=matchIntel(view,history,opening);
    expect(intel.discarded).toEqual(seen);
    expect(intel.score).toEqual([view.score,view.opponentScore]);
  });

  it('reconstructs the last opponent turn from a saved log without changing state',()=>{
    const base=tutorialChapter(0);
    const live=new Session(base,0,[],base);
    let state=base;
    for(let step=0;step<4;step++) {
      const action=intended(state,0,step);
      expect(live.play(action)).not.toBeNull();
      state=live.state;
    }
    while(state.turnPlayer===1&&state.phase!=='GAME_OVER') {
      const action=tutorialOpponentAction(legalActions(viewFor(state,1)))!;
      expect(live.play(action,1)).not.toBeNull();
      state=live.state;
    }
    expect(live.canReplayOpponent).toBe(true);
    const restored=new Session(state,0,live.log,base);
    const snapshot=JSON.stringify(restored.state);
    const turn=restored.lastTurnOf(1);
    expect(turn.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(restored.state)).toBe(snapshot);
    expect(turn.at(-1)?.after).toEqual(state);
  });
});
