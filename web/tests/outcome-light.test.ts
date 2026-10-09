import { describe, expect, it } from 'vitest';
import type { Step } from '../src/logic/anim.js';
import { outcomeCue } from '../src/player/outcome-light.js';

describe('board outcome light', () => {
  it('stays quiet during routine Draw and Throw actions', () => {
    expect(outcomeCue([{ k:'draw', player:0, from:'deck' }, { k:'discard', player:0, card:{ id:1, suit:0, rank:3 } }],0)).toBeNull();
  });

  it('uses the mover perspective and gives Bloom more weight than a single placement', () => {
    const sprout: Step = { k:'grow', style:'sprout', player:0, tiles:[{ key:'0,1', strength:4, replaced:false }] };
    const bloom: Step = { k:'grow', style:'bloom', player:1, tiles:[{ key:'0,1', strength:4, replaced:false }] };
    expect(outcomeCue([sprout],0)).toMatchObject({ step:sprout, tone:'good', strength:.32 });
    expect(outcomeCue([bloom],0)).toMatchObject({ step:bloom, tone:'bad', strength:.68 });
  });

  it('shows the cut when growth and a sever happen in one action', () => {
    const bloom: Step = { k:'grow', style:'bloom', player:0, tiles:[{ key:'0,1', strength:8, replaced:true }] };
    const cut: Step = { k:'sever', player:1, by:0, keys:['1,1','2,1','2,0'], origin:'0,1' };
    expect(outcomeCue([bloom,cut],0)).toMatchObject({ step:cut, tone:'good' });
    expect(outcomeCue([{ ...cut, player:0, by:1 }],0)?.tone).toBe('bad');
  });

  it('favours a Blast or final result over smaller action signals', () => {
    const bomb: Step = { k:'megaBomb', player:1, target:'0,1', destroyed:['0,1','1,1'] };
    const win: Step = { k:'end', result:{ winner:0, reason:'strangle', scores:[20,12] } };
    expect(outcomeCue([bomb],0)).toMatchObject({ step:bomb, tone:'bad' });
    expect(outcomeCue([bomb,win],0)).toMatchObject({ step:win, tone:'good', strength:1 });
  });
});
