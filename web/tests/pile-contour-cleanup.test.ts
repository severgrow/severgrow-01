import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css=readFileSync(new URL('../src/player/smart-cockpit.ts',import.meta.url),'utf8');
const rule=(selector:string)=>{const start=css.indexOf(selector);expect(start).toBeGreaterThanOrEqual(0);return css.slice(start,css.indexOf('}',start)+1);};
describe('the owner removes pile contour frames',()=>{
  it('keeps Bloom gold as soft light with no hard rim',()=>{
    const gold=rule("html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-top.card {");
    expect(gold).toContain('border-color:transparent');expect(gold).not.toMatch(/0 0 0 1px/);
    for(const glow of ['0 0 3px rgba(255,250,235,.62)','0 0 9px 1px rgba(232,180,88,.55)','0 0 18px 5px rgba(184,130,44,.24)'])expect(gold).toContain(glow);
  });
  it('uses the actual card corner ratio for the quiet empty socket',()=>{
    const socket=rule('html.futa04-information .dock #discard .pile-top.empty {');
    expect(socket).toContain('border-radius:5.9% / 4.2%');
    expect(socket).toMatch(/border:1px solid/);expect(socket).not.toMatch(/dashed|animation/);
  });
});
