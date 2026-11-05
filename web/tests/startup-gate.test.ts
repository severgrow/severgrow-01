import { expect,it,vi } from 'vitest';
import { createStartupGate } from '../src/player/startup.js';
it('reveals the first menu only after app, fonts and the first planet frame',()=>{
 const show=vi.fn(),gate=createStartupGate(show);
 gate.ready(true);gate.fonts();expect(show).not.toHaveBeenCalled();
 gate.painted();expect(show).toHaveBeenCalledOnce();gate.painted();gate.fallback();expect(show).toHaveBeenCalledOnce();
});
it('handles an early planet frame and never waits for a planet on a deep-linked game',()=>{
 const show=vi.fn(),gate=createStartupGate(show);gate.painted();gate.fonts();gate.ready(true);expect(show).toHaveBeenCalledOnce();
 const game=vi.fn(),direct=createStartupGate(game);direct.ready(false);direct.fonts();expect(game).toHaveBeenCalledOnce();
});
it('has a single fail-open path for unavailable code or graphics',()=>{
 const show=vi.fn(),gate=createStartupGate(show);gate.fallback();gate.ready(true);gate.fonts();gate.painted();expect(show).toHaveBeenCalledOnce();
});
