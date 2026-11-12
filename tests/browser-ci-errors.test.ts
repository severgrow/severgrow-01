import { describe,it,expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const run=(code:string)=>spawnSync(process.execPath,['--import',resolve('scripts/browser-ci-errors.mjs'),'--input-type=module','--eval',code],{encoding:'utf8'});
describe('public browser CI error diagnostics preserve the gate',()=>{
 it('leaves successful processes successful and quiet',()=>{
  const p=run('console.log("ready")');expect(p.status).toBe(0);expect(p.stdout.trim()).toBe('ready');expect(p.stderr).toBe('');
 });
 it('reports synchronous assertion failures while retaining a nonzero exit',()=>{
  const p=run('throw Error("fixture failure 100%\\nsecond line")');
  expect(p.status).toBe(1);expect(p.stderr).toContain('::error title=Browser check failure::Error: fixture failure 100%25%0Asecond line');
  expect(p.stderr).toContain('at file:');
 });
 it('also reports rejected asynchronous assertions without consuming them',()=>{
  const p=run('await Promise.reject(Error("async fixture"))');
  expect(p.status).toBe(1);expect(p.stderr).toContain('::error title=Browser check failure::Error: async fixture');
 });
});
