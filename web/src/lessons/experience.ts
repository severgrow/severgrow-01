// The staging experiment reuses the lesson's own legality and feedback. No second tutorial.
import type { Action, State } from '../../../src/engine/index.js';
import { FIRST_EXPERIENCE } from '../../../src/strings.js';
import { tapAnswer, type Tap } from './answer.js';
import type { Lit } from './lessons.js';

export const explanationTap = (
  state: State, selected: number | null, tap: Tap, lit: Lit, locked: boolean,
  placing: boolean, allowed: readonly Action[],
): { moves: boolean; answer: string | null } => {
  if (tap.t === 'other') return { moves: false, answer: null };
  // A fact about a home/rock/score cannot itself be played. It must not require an acknowledgement
  // before the next legal Draw or card selection. Actual early action instructions keep their lock.
  const fact = ['home','rock','score','led','none','undo','deckCount'].includes(lit.t)
    || ((lit.t === 'hex' || lit.t === 'hexes') && selected === null && !placing)
    || (lit.t === 'discard' && state.phase === 'ACT');
  const answer = tapAnswer(state, selected, tap, lit, locked && !fact, placing, allowed);
  return { moves: answer === null, answer };
};

export const experienceCopy = (id: string, original: string): string =>
  id === '1:intro:tree' ? FIRST_EXPERIENCE.home
  : id === '1:intro:their-home' ? FIRST_EXPERIENCE.opponent
  : id === '1:intro:first-draw' ? FIRST_EXPERIENCE.draw : original;

/** One intentional 44px target in the existing caption. A finite timer unlocks dismissal, never
 * dismisses the text. The rest of the caption remains transparent to gameplay touches. */
export const mountExplanationDismiss = (plate: HTMLElement, hooks: {
  now(): number; readMs: number; dismiss(id: string): void; acknowledge(): void;
}) => {
  const css = document.createElement('style');
  css.textContent = `
    #lesson-plate.lesson-has-dismiss { padding-right:52px; min-height:48px; }
    #lesson-plate .lesson-dismiss { position:absolute; right:0; top:0; bottom:0; margin:auto;
      width:48px; height:48px; padding:0; border:0; border-radius:10px; outline:0;
      background:none; color:#f0e9dc; opacity:.7; cursor:pointer; pointer-events:auto; }
    #lesson-plate .lesson-dismiss[aria-disabled='true'] { opacity:.3; }
    #lesson-plate .lesson-dismiss:focus-visible { outline:2px solid #f0e9dc; outline-offset:-5px; }
    #lesson-plate .lesson-dismiss svg { width:18px; height:18px; }
    #lesson-plate .lesson-dismiss[hidden] { display:none; }
  `;
  document.head.append(css);
  const key = document.createElement('button');
  key.type='button'; key.className='lesson-dismiss'; key.hidden=true;
  key.setAttribute('aria-label',FIRST_EXPERIENCE.dismiss);
  key.innerHTML='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  plate.append(key);
  let current: string | null=null, start=0, timer: ReturnType<typeof setTimeout> | undefined;
  key.addEventListener('click',()=>{
    if (!current) return;
    if(hooks.now()-start < hooks.readMs) { hooks.acknowledge(); return; }
    hooks.dismiss(current);
  });
  return {
    sync(id: string | null, appearedAt: number) {
      if(id===current && appearedAt===start) return;
      clearTimeout(timer); current=id; start=appearedAt;
      key.hidden=!id; plate.classList.toggle('lesson-has-dismiss',!!id);
      if(!id) return;
      const remaining=Math.max(0,hooks.readMs-(hooks.now()-start));
      key.setAttribute('aria-disabled',String(remaining>0));
      if(remaining>0) timer=setTimeout(()=>key.setAttribute('aria-disabled','false'),remaining);
    },
  };
};
