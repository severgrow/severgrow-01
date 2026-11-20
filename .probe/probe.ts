import { allNeighbors, boardCoords, coordKey, homeCoord, newGame, onBoard } from '../src/engine/index.js';
for (const seed of [1,2,3,4,7,10]) {
  const s = newGame(seed);
  const rocks = Object.entries(s.terrain).filter(([,t])=>t==='rock').map(([k])=>k);
  console.log('seed',seed,'homes',[0,1].map(p=>coordKey(homeCoord(p,s.config))).join(' '),'rocks',rocks.join(' '));
  for (const p of [0,1] as const) {
    const d = allNeighbors(homeCoord(p,s.config)).filter(n=>onBoard(n,s.config)).map(n=>`${coordKey(n)}${s.terrain[coordKey(n)]==='rock'?'(rock)':''}`);
    console.log('  home',p,d.join(' '));
  }
}
console.log('board', boardCoords(newGame(1).config).length);
