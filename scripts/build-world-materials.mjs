// Four tiny, deterministic, periodic material atlases. The field is sampled in WORLD coordinates,
// not restarted in each hex. All edge-crossing marks wrap, so any neighbouring arrangement joins.
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../web/src/assets/worlds/', import.meta.url); mkdirSync(dir, { recursive: true });
const size = 240;
let state = 735;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
const n = x => Number(x.toFixed(2));
const wrap = (x, y, paint) => [-size, 0, size].flatMap(dx => [-size, 0, size].map(dy => x+dx < -24 || x+dx > size+24 || y+dy < -24 || y+dy > size+24 ? '' : paint(n(x+dx), n(y+dy)))).join('');
const svg = (body, defs = '', view = '0 0 240 240') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}"><defs>${defs}</defs>${body}</svg>`;
const gradient = (id, a, b) => `<radialGradient id="${id}" cx=".3" cy=".18" r=".8"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
const write = (name, data) => writeFileSync(new URL(name + '.svg', dir), data);
// OCEAN: coherent long currents over a deep bed. Periodic contours meet with the same tangent.
let ocean = '<path fill="#153943" d="M0 0h240v240H0z"/>';
for(let j=0;j<14;j++){
 const y=j*size/14, amp=6+random()*6, phase=random()*6.28;
 const points=Array.from({length:49},(_,i)=>[i*5,y+Math.sin(i*5/size*Math.PI*2+phase)*amp]);
 const d=points.map(([x,y],i)=>`${i?'L':'M'}${n(x)},${n(y)}`).join('');
 for(const dy of [-size,0,size])ocean+=`<path d="${d}" transform="translate(0 ${dy})" fill="none" stroke="${j%3?'#39606a':'#64868a'}" stroke-opacity="${j%3?.27:.34}" stroke-width="${j%3?1.3:.7}"/>`;
}
write('ocean',svg(ocean));
// FOREST: low broad canopy forms, a soft north-west catch; forest floor between the crowns.
let forest='<path fill="#263829" d="M0 0h240v240H0z"/>';
for(let j=0;j<8;j++)for(let i=0;i<8;i++){
 const x=i*30+(random()-.5)*18,y=j*30+(random()-.5)*18,r=10+random()*8;
 forest+=wrap(x,y,(x,y)=>`<ellipse cx="${x+2}" cy="${y+3}" rx="${n(r+2)}" ry="${n(r*.75)}" fill="#14251b" opacity=".55"/><path d="M${n(x-r)},${y} Q${n(x-r*.85)},${n(y-r)} ${x},${n(y-r*.8)} Q${n(x+r)},${n(y-r*.8)} ${n(x+r)},${y} Q${n(x+r*.8)},${n(y+r*.7)} ${x},${n(y+r*.6)} Q${n(x-r)},${n(y+r*.8)} ${n(x-r)},${y}" fill="url(#canopy)"/><path d="M${n(x-r*.65)},${n(y-r*.12)} Q${n(x-r*.35)},${n(y-r*.6)} ${n(x+r*.2)},${n(y-r*.5)}" fill="none" stroke="#82916b" stroke-opacity=".22" stroke-width="1.4"/>`);
}
write('forest',svg(forest,gradient('canopy','#566344','#263c2d')));
// MAGIC FIELDS: silver reed beds, sparse quiet mineral paths, dark indigo soil.
let magic='<path fill="#343341" d="M0 0h240v240H0z"/>';
for(let j=0;j<8;j++){
 const y=j*30; const d=`M-20 ${y+3}Q40 ${y-18} 100 ${y+1}T220 ${y+1}T340 ${y+1}`;
 for(const dy of [-240,0,240])magic+=`<path d="${d}" transform="translate(0 ${dy})" fill="none" stroke="#77798a" stroke-width=".7" opacity=".25"/>`;
}
for(let i=0;i<75;i++){
 const x=random()*240,y=random()*240,r=2+random()*3;
 magic+=wrap(x,y,(x,y)=>`<path d="M${x} ${y+r}q-7 -9 -2 -${n(r+5)}q6 2 2 ${n(r+5)}q6 -8 7 -5q1 3 -7 5" fill="#8e8b9f" opacity=".24"/>`);
}
write('magic-fields',svg(magic));
// VOLCANIC: irregular cooled basalt plates, narrow shaded joints, very rare residual heat.
let lava='<path fill="#211f20" d="M0 0h240v240H0z"/>';
const core=Array.from({length:8},(_,j)=>Array.from({length:8},(_,i)=>[i*30+(i?(random()-.5)*18:0),j*30+(j?(random()-.5)*18:0)]));
// Opposite edges share junctions. Independently jittering the ninth row/column creates a seam.
const grid=Array.from({length:9},(_,j)=>Array.from({length:9},(_,i)=>[core[j%8][i%8][0]+(i===8?240:0),core[j%8][i%8][1]+(j===8?240:0)]));
for(let j=0;j<8;j++)for(let i=0;i<8;i++){
 const p=[grid[j][i],grid[j][i+1],grid[j+1][i+1],grid[j+1][i]],cx=p.reduce((a,v)=>a+v[0],0)/4,cy=p.reduce((a,v)=>a+v[1],0)/4;
 const d=p.map(([x,y],k)=>`${k?'L':'M'}${n(cx+(x-cx)*.96)} ${n(cy+(y-cy)*.96)}`).join('')+'Z';
 const v=43+Math.floor(random()*12);lava+=`<path d="${d}" fill="rgb(${v+3},${v},${v})" stroke="#67615c" stroke-opacity=".22" stroke-width=".6"/>`;
 if(random()<.09)lava+=wrap(cx,cy,(x,y)=>`<path d="M${n(p[0][0])} ${n(p[0][1])}L${n(p[1][0])} ${n(p[1][1])}" transform="translate(${n(x-cx)} ${n(y-cy)})" stroke="#a96f42" stroke-width=".65" opacity=".62"/>`);
}
write('volcanic',svg(lava));
// Landmarks: top-down silhouettes, restrained light, no fake extruded/isometric tile edges.
const home=(name,body,defs='')=>write(`${name}-home`,svg(body,defs,'-32 -32 64 64'));
home('ocean','<ellipse cy="2" rx="22" ry="18" fill="#0b2932"/><path d="M-21 0C-22-17-4-21 11-15S26 0 17 12S-10 21-18 10Z" fill="#8d9f82"/><path d="M-17-2C-18-13-4-18 10-12S21 0 14 9S-8 16-14 8Z" fill="#d1c6a2"/><ellipse cx="0" cy="1" rx="11" ry="9" fill="#27656a"/><path d="M-8-2Q0-9 9-3" stroke="#a6c8b6" stroke-width=".8" fill="none"/><path d="M-19 6Q-9 21 11 13" stroke="#f1dfb1" stroke-width=".8" opacity=".7" fill="none"/><path d="M-12-9l2-7m-2 7l-6-2m6 2l4-4" stroke="#3f6648" stroke-width="2"/>');
home('forest','<ellipse cy="7" rx="22" ry="15" fill="#18271d"/><path d="M-17 15Q0 22 18 13" fill="none" stroke="#91845e" stroke-opacity=".6"/><circle r="21" fill="url(#c)"/>'+Array.from({length:7},(_,i)=>{const a=i/7*Math.PI*2;return `<circle cx="${n(Math.cos(a)*11)}" cy="${n(Math.sin(a)*10-2)}" r="9" fill="url(#c)" stroke="#73855c" stroke-opacity=".25" stroke-width=".6"/>`;}).join('')+'<circle cx="-2" cy="-4" r="10" fill="url(#c)"/><path d="M-9-8q6-7 13-3" fill="none" stroke="#aeb98a" stroke-opacity=".6" stroke-width="1"/>',gradient('c','#7f8c60','#304932'));
home('magic-fields','<ellipse cy="5" rx="21" ry="16" fill="#242735"/><ellipse rx="19" ry="15" fill="none" stroke="#8d8b9f" stroke-opacity=".45"/>'+Array.from({length:6},(_,i)=>`<path transform="rotate(${i*60})" d="M0-21L6-7 0 3-6-7Z" fill="url(#crystal)" stroke="#bbb7c5" stroke-opacity=".45" stroke-width=".5"/>`).join('')+'<path d="M0-9L7 0 0 8-7 0Z" fill="#b1c4b7"/><path d="M0-9V8" stroke="#e1dfd6" stroke-width=".6"/>', '<linearGradient id="crystal" x2="1" y2="1"><stop stop-color="#b8b0c3"/><stop offset=".48" stop-color="#666879"/><stop offset="1" stop-color="#37394a"/></linearGradient>');
home('volcanic','<path d="M-23 4L-18-13-5-23 12-19 23-3 18 15 1 22-17 17Z" fill="#28272a" stroke="#756b61" stroke-opacity=".5"/><path d="M-17 3L-12-10-2-16 11-11 16 1 9 13-4 15Z" fill="url(#basalt)"/><ellipse rx="10" ry="8" fill="#191c1e"/><path d="M-8 0Q-3-9 5-5L9 0" stroke="#a26a41" stroke-width="1.5" fill="none"/><path d="M-6 1L1-3 6 2 0 5Z" fill="#6d422b"/><path d="M-1-2L3 0-1 2Z" fill="#ba8750"/>',gradient('basalt','#6d6258','#302d2e'));
