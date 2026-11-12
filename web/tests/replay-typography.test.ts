import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_RULES_VERSION, rulesConfig } from '../../src/engine/versions.js';
import { buildReplay } from '../src/replay/timeline.js';
import { posterFor, posterLayout } from '../src/replay/poster.js';
import { replayUIFamily, warmReplayUI } from '../src/replay/typography.js';

afterEach(()=>vi.unstubAllGlobals());
describe('replay labels use the actual game UI typography',()=>{
 it('reads the game body role and loads its real regular face before a canvas export',async()=>{
  const body={};const load=vi.fn().mockResolvedValue([]);
  vi.stubGlobal('document',{body,fonts:{load}});
  vi.stubGlobal('getComputedStyle',vi.fn((element)=>({fontFamily:'Fallback',getPropertyValue:(name:string)=>element===body&&name==='--font-ui'?'Game UI Family':''})));
  expect(replayUIFamily()).toBe('Game UI Family');
  await warmReplayUI();expect(load).toHaveBeenCalledWith('400 30px Game UI Family');
 });
 it('keeps labels regular, without changing the display signature',()=>{
  const model=buildReplay({seed:2,rulesVersion:CURRENT_RULES_VERSION,config:rulesConfig(CURRENT_RULES_VERSION)!,startingPlayer:0,actions:[],names:['YOU','OPPONENT']});
  const layout=posterLayout(posterFor(model));
  expect(layout.names.map(n=>n.weight)).toEqual([400,400]);
  expect(layout.turn.weight).toBe(400);expect(layout.tagline.weight).toBe(400);
  expect(layout.mark.weight).toBe(800);
 });
});
