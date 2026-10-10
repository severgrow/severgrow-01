import type { Card } from '../../../src/engine/index.js';
import type { MatchIntel } from '../logic/match-intel.js';
import { cardFace, suitClass } from '../ui/effects.js';

const CSS = `
#futasaku-glass { position:fixed; z-index:35; box-sizing:border-box; border:1px solid rgba(214,204,177,.16);
  border-radius:15px; overflow:hidden; color:#f0e9dc; background:rgba(10,13,13,.88);
  box-shadow:inset 0 1px rgba(243,232,202,.07),0 12px 32px rgba(0,0,0,.27);
  backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px);
  font:500 13px/1.35 Commissioner,system-ui,sans-serif; }
#futasaku-glass[hidden], #tutorial-focus[hidden] { display:none; }
#futasaku-glass[data-mode='tutorial'] { pointer-events:none;
  background:rgba(10,13,13,.06); backdrop-filter:none; -webkit-backdrop-filter:none; }
#futasaku-glass[data-mode='tutorial'] .glass-tutorial { display:inline-flex; align-items:center; gap:12px; padding:9px 11px; margin:8px;
  max-width:calc(100% - 38px); min-height:30px; border-radius:8px;
  background:rgba(10,13,13,.76); box-shadow:0 3px 12px rgba(0,0,0,.22); }
#futasaku-glass[data-mode='tutorial'][data-focus='deck'] .glass-tutorial,
#futasaku-glass[data-mode='tutorial'][data-focus='discard'] .glass-tutorial { float:right; }
#futasaku-glass .glass-chapter { color:#bcae8d; font:600 10px/1.1 monospace; letter-spacing:.16em; white-space:nowrap; }
#futasaku-glass .glass-copy { font-weight:650; letter-spacing:.09em; text-wrap:balance; text-shadow:0 1px 5px rgba(0,0,0,.8); }
#futasaku-glass[data-mode='intel'] { pointer-events:auto; display:flex; flex-direction:column; }
#futasaku-glass .intel-head { display:flex; align-items:center; justify-content:space-between; padding:9px 13px 6px; border-bottom:1px solid rgba(229,214,183,.12); }
#futasaku-glass .intel-head b { font-size:11px; letter-spacing:.17em; }
#futasaku-glass .intel-close { width:44px; height:44px; border:0; border-radius:9px; background:transparent; color:#e8ddc9; font-size:23px; line-height:1; cursor:pointer; }
#futasaku-glass .intel-close:focus-visible { outline:2px solid #e8ddc9; }
#futasaku-glass .intel-body { padding:8px 13px 12px; min-height:0; overflow:auto; overscroll-behavior:contain; }
#futasaku-glass .intel-kicker { color:#bbad8e; font-size:10px; font-weight:700; letter-spacing:.16em; margin:0 0 6px; }
#futasaku-glass .intel-cards { display:flex; flex-wrap:wrap; align-items:flex-start; gap:5px; margin-bottom:10px; }
#futasaku-glass .intel-card-wrap { position:relative; flex:none; }
#futasaku-glass .intel-card { display:block; position:relative; width:28px; height:40px; border-radius:3px; box-sizing:border-box; overflow:hidden; background:#171918; border:1px solid #958a70; }
#futasaku-glass .intel-card .futa04-card-art { position:absolute; inset:0; display:block; border-radius:inherit; background-size:300% 300%; background-repeat:no-repeat; }
#futasaku-glass .intel-card.fruit .futa04-card-art { background-size:cover; background-position:center; }
#futasaku-glass .intel-card .c-num { position:absolute; top:1px; left:2px; z-index:1; font:800 11px/1 monospace; }
#futasaku-glass .intel-card .c-suit { display:none; }
#futasaku-glass .intel-card-count { position:absolute; right:-3px; bottom:-3px; min-width:13px; height:13px; padding:0 2px; border-radius:5px; background:#24221e; border:1px solid #a99c81; font:700 9px/12px monospace; text-align:center; }
#futasaku-glass .intel-stats { display:flex; flex-wrap:wrap; gap:3px 13px; font-size:11px; color:#eee5d6; }
#futasaku-glass .intel-stats b { color:#f9edcf; font-variant-numeric:tabular-nums; }
#futasaku-glass .intel-observation { margin:8px 0 0; color:#d3c4a3; font-size:10px; letter-spacing:.09em; }
#tutorial-focus { position:fixed; inset:0; z-index:34; pointer-events:none; width:100vw; height:100dvh; }
#tutorial-focus .focus-dim { fill:rgba(1,3,3,.36); }
#tutorial-focus .focus-arrow { fill:none; stroke:#e9d8ad; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 0 3px rgba(235,202,141,.5)); }
#tutorial-focus .focus-arrow-head { fill:#e9d8ad; }
#tutorial-focus[data-gentle='true'] .focus-dim { fill:rgba(1,3,3,.17); }
#tutorial-focus[data-gentle='true'] .focus-arrow { opacity:.45; }
#tutorial-focus.nudge .focus-arrow { animation:tutorial-nudge .42s ease-out; }
@keyframes tutorial-nudge { 50% { opacity:.25; transform:translateY(-3px); } }
.reduce-motion #tutorial-focus .focus-arrow, .reduce-motion #tutorial-focus.nudge .focus-arrow { animation:none; }
@media (prefers-reduced-motion:reduce) { #tutorial-focus .focus-arrow { animation:none !important; } }
`;

const rectOf = (element: Element) => element.getBoundingClientRect();
const safe = (text: string) => text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

export type GlassSurface = ReturnType<typeof mountGlassSurface>;
export const mountGlassSurface = (onClose: () => void) => {
  const style = document.createElement('style'); style.id='futasaku-glass-style'; style.textContent=CSS; document.head.append(style);
  const panel = document.createElement('section'); panel.id='futasaku-glass'; panel.hidden=true;
  panel.setAttribute('aria-label','Match Intel');
  const focus = document.createElementNS('http://www.w3.org/2000/svg','svg'); focus.id='tutorial-focus'; focus.setAttribute('hidden','');
  focus.setAttribute('aria-hidden','true');
  document.body.append(focus,panel);
  const dock = document.getElementById('dock')!;
  let targets: string[] = [];
  let gentle = false;
  let arrow = true;
  let mode: 'tutorial' | 'intel' | null = null;
  const showFocus = (show: boolean) => show ? focus.removeAttribute('hidden') : focus.setAttribute('hidden','');
  const place = () => {
    if (!mode) return;
    const d = rectOf(dock);
    panel.style.left=`${Math.max(6,d.left+6)}px`;
    panel.style.width=`${Math.max(0,Math.min(innerWidth-12,d.width-12))}px`;
    panel.style.top=`${Math.max(6,d.top+4)}px`;
    panel.style.height=`${Math.max(140,Math.min(innerHeight-d.top-8,d.height-8))}px`;
    if (mode!=='tutorial') return;
    focus.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    focus.dataset.gentle=String(gentle);
    const boxes=targets.flatMap(selector=>[...document.querySelectorAll(selector)].map(rectOf))
      .filter(box=>box.width>0&&box.height>0);
    const holes=boxes.map(box=>`<rect x="${(box.left-5).toFixed(1)}" y="${(box.top-5).toFixed(1)}" width="${(box.width+10).toFixed(1)}" height="${(box.height+10).toFixed(1)}" rx="8" fill="black"/>`).join('');
    const target=boxes[0];
    let mark='';
    if (arrow && target) {
      const x=Math.min(innerWidth-19,Math.max(19,target.left+target.width/2));
      const below=target.top<innerHeight*.35;
      const y=below ? target.bottom+27 : target.top-27;
      const tip=below ? target.bottom+7 : target.top-7;
      mark=`<path class="focus-arrow" d="M${x} ${y}V${tip}"/><path class="focus-arrow-head" d="M${x-4} ${tip+(below?5:-5)}L${x} ${tip}L${x+4} ${tip+(below?5:-5)}Z"/>`;
    }
    focus.innerHTML=`<defs><mask id="tutorial-cutouts"><rect width="100%" height="100%" fill="white"/>${holes}</mask></defs><rect class="focus-dim" width="100%" height="100%" mask="url(#tutorial-cutouts)"/>${mark}`;
  };
  const observer = new ResizeObserver(place); observer.observe(dock);
  window.addEventListener('resize',place,{passive:true});
  const close = () => { mode=null; panel.hidden=true; showFocus(false); panel.replaceChildren(); onClose(); };
  const tutorial = (text: string, chapter: number, selectors: readonly string[], options: {gentle?:boolean;arrow?:boolean}={}) => {
    mode='tutorial'; targets=[...selectors]; gentle=!!options.gentle; arrow=options.arrow!==false;
    panel.dataset.mode='tutorial'; panel.dataset.focus=selectors[0]?.includes('#deck') ? 'deck' : selectors[0]?.includes('#discard') ? 'discard' : 'other'; panel.hidden=false; showFocus(selectors.length>0);
    panel.setAttribute('aria-label','Tutorial guidance');
    panel.setAttribute('role','status'); panel.setAttribute('aria-live','polite');
    panel.innerHTML=`<div class="glass-tutorial"><span class="glass-chapter">${String(chapter+1).padStart(2,'0')}</span><span class="glass-copy">${safe(text)}</span></div>`;
    requestAnimationFrame(place);
  };
  const intel = (data: MatchIntel) => {
    const scroll=panel.querySelector<HTMLElement>('.intel-body')?.scrollTop ?? 0;
    mode='intel'; panel.dataset.mode='intel'; panel.hidden=false; showFocus(false);
    panel.setAttribute('aria-label','Match Intel'); panel.setAttribute('role','dialog');
    panel.removeAttribute('aria-live');
    const groups=new Map<string,{card:Card;count:number}>();
    for(const card of data.discarded){const key=`${card.suit}:${card.rank}`;const group=groups.get(key);if(group)group.count++;else groups.set(key,{card,count:1});}
    const sorted=[...groups.values()].sort((a,b)=>(a.card.suit??4)-(b.card.suit??4)||a.card.rank-b.card.rank);
    const cards=sorted.map(({card,count})=>`<span class="intel-card-wrap" title="${card.suit===null?'Bomb':`Suit ${card.suit+1}, ${card.rank}`}${count>1?` — seen ${count} times`:''}"><span class="intel-card card ${suitClass(card)}">${cardFace(card)}</span>${count>1?`<span class="intel-card-count">${count}</span>`:''}</span>`).join('');
    const usedBombs=data.bombs[0]+data.bombs[1]>0 ? `<span>Bombs <b>${data.bombs[0]} : ${data.bombs[1]}</b></span>` : '';
    const cutTiles=data.cuts[0]+data.cuts[1]>0 ? `<span>Cut tiles <b>${data.cuts[0]} : ${data.cuts[1]}</b></span>` : '';
    panel.innerHTML=`<div class="intel-head"><b>MATCH INTEL</b><button class="intel-close" type="button" aria-label="Close Match Intel">×</button></div><div class="intel-body"><p class="intel-kicker">DISCARDED CARDS</p><div class="intel-cards">${cards||'<span>NONE YET</span>'}</div><p class="intel-kicker">MATCH</p><div class="intel-stats"><span>Score <b>${data.score[0]} : ${data.score[1]}</b></span><span>Tiles <b>${data.territory[0]} : ${data.territory[1]}</b></span><span>Blooms <b>${data.blooms[0]} : ${data.blooms[1]}</b></span>${usedBombs}${cutTiles}<span>Turn <b>${data.turn}</b></span></div>${data.observation?`<p class="intel-observation">${safe(data.observation)}</p>`:''}</div>`;
    panel.querySelector<HTMLElement>('.intel-body')!.scrollTop=scroll;
    panel.querySelector('.intel-close')?.addEventListener('click',close,{once:true});
    requestAnimationFrame(place);
  };
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  return {tutorial,intel,close,hide:()=>{mode=null;panel.hidden=true;showFocus(false);},nudge:()=>{focus.classList.remove('nudge');void focus.getBoundingClientRect();focus.classList.add('nudge');},refresh:place,isOpen:()=>mode==='intel'};
};
