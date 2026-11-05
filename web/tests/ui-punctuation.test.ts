import {expect,it} from 'vitest';
import * as copy from '../../src/strings.js';
import {CHALLENGE} from '../src/online/challenge-copy.js';
// Only product-authored copy. Player text must retain its own punctuation.
it('uses hyphens in static player-facing copy',()=>{
 const walk=(value:unknown,path:string)=>{
  if(typeof value==='string')expect(value,path).not.toContain('\u2014');
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))walk(child,path+'.'+key);
 };
 walk(copy,'strings');walk(CHALLENGE,'challenge');
 expect(CHALLENGE.sendLine('Kat-what','tile')).toBe("Kat-what's ground. Challenge - the winner takes the opponent's tile.");
 expect(CHALLENGE.sendLine('A\u2014B','tile')).toContain('A\u2014B');
});
