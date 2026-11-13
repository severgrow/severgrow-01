/** Static smoked-metal channel, following the exact rendered board silhouette. No animation work. */
import { el } from './geom.js';
type Point = readonly [number,number];
type Edge = readonly [Point,Point];

export function drawRimHardware(parent: SVGGElement, defs: SVGDefsElement, id: string, rim: string, edges: readonly Edge[]): void {
  const metal = el('linearGradient',{id,x1:0,y1:0,x2:.65,y2:1},defs);
  for(const [at,colour] of [[0,'#e8ddc5'],[.18,'#8a8070'],[.46,'#343a32'],[.62,'#0b100c'],[1,'#938773']] as const)
    el('stop',{offset:at,'stop-color':colour},metal);
  const bezel = el('g',{class:'planet-bezel',fill:'none','stroke-linejoin':'round','pointer-events':'none'},parent);
  el('path',{d:rim,class:'planet-bezel-gasket'},bezel);
  el('path',{d:rim,stroke:`url(#${id})`,class:'planet-bezel-face'},bezel);
  el('path',{d:rim,class:'planet-bezel-groove'},bezel);
  // Two pairs of shallow tooling marks, placed on actual side edges, never on tile art.
  const candidates=edges.map(([a,b])=>({a,b,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,len:Math.hypot(b[0]-a[0],b[1]-a[1])})).filter(e=>e.len>1);
  if(!candidates.length)return;
  const cy=(Math.min(...candidates.map(e=>e.y))+Math.max(...candidates.map(e=>e.y)))/2;
  let marks='';
  for(const side of [-1,1]){
    const extreme=Math.max(...candidates.map(e=>side*e.x));
    const edge=candidates.filter(e=>extreme-side*e.x<.25).sort((a,b)=>Math.abs(a.y-cy)-Math.abs(b.y-cy))[0]!;
    const nx=-(edge.b[1]-edge.a[1])/edge.len,ny=(edge.b[0]-edge.a[0])/edge.len;
    for(const t of [.38,.62]){
      const x=edge.a[0]+(edge.b[0]-edge.a[0])*t,y=edge.a[1]+(edge.b[1]-edge.a[1])*t;
      marks+=`M${(x-nx*1.35).toFixed(2)},${(y-ny*1.35).toFixed(2)}L${(x+nx*1.35).toFixed(2)},${(y+ny*1.35).toFixed(2)}`;
    }
  }
  el('path',{d:marks,class:'planet-bezel-etch'},bezel);
}
