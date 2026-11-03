import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import { lessonFor, lessonOpening, lessonAllows } from '../src/lessons/lessons.js';
import { explanationTap } from '../src/lessons/experience.js';

describe('optional reading, deliberate dismissal', () => {
  const opening = () => lessonOpening(lessonFor(1)!);
  it('allows a real first Draw while a non-action home fact is being read', () => {
    const s=opening(), legal=legalActions(viewFor(s,0)).filter(a=>lessonAllows({level:1},a));
    expect(explanationTap(s,null,{t:'deck'},{t:'home',player:0},true,false,legal)).toEqual({moves:true,answer:null});
  });
  it('keeps the explanation for blank taps and invalid gameplay taps', () => {
    const s=opening(), legal=legalActions(viewFor(s,0));
    expect(explanationTap(s,null,{t:'other'},{t:'home',player:0},true,false,legal).moves).toBe(false);
    expect(explanationTap(s,null,{t:'hex',key:'0,0'},{t:'deck'},true,false,legal)).toEqual({moves:false,answer:expect.any(String)});
  });
  it('a highlighted valid action is never subject to the reading timer', () => {
    const s=opening(), legal=legalActions(viewFor(s,0));
    expect(explanationTap(s,null,{t:'deck'},{t:'deck'},true,false,legal).moves).toBe(true);
  });
  it('permits legal alternative cards in an unlocked lesson, preserving early action locks', () => {
    const s0=opening();const s=apply(s0,{t:'Draw',from:'deck'});
    const legal=legalActions(viewFor(s,0));
    const cards=legal.flatMap(a=>'card' in a?[a.card]:[]);
    const id=cards[0]!;
    expect(explanationTap(s,null,{t:'card',id},{t:'card',id:id+999},false,false,legal).moves).toBe(true);
    expect(explanationTap(s,null,{t:'card',id},{t:'card',id:id+999},true,false,legal).moves).toBe(false);
    expect(explanationTap(s,null,{t:'card',id},{t:'hex',key:'0,0'},true,false,legal).moves).toBe(true);
  });
});
