import { describe, expect, it } from 'vitest';
import { appViewport } from '../src/ui/app-viewport.js';
const base = { width: 393, height: 806, visualWidth: 393, visualHeight: 806, screenWidth: 393, screenHeight: 852, largeHeight: 852, standalone: true };
describe('installed app uses the same height for its paint and layout', () => {
  it('recovers the strip below an under-reported iPhone viewport', () => expect(appViewport(base)).toEqual({w:393,h:852}));
  it('uses large viewport evidence even when screen dimensions are unavailable', () => expect(appViewport({...base,screenWidth:0,screenHeight:0,largeHeight:874})).toEqual({w:393,h:874}));
  it('keeps layout stable while the installed app keyboard shrinks visualViewport', () => expect(appViewport({...base,visualHeight:390})).toEqual({w:393,h:852}));
  it('does not enlarge Safari tabs into the browser toolbar', () => expect(appViewport({...base,standalone:false,visualHeight:710})).toEqual({w:393,h:710}));
  it('supports landscape without applying portrait screen dimensions', () => expect(appViewport({...base,width:852,height:360,largeHeight:393})).toEqual({w:852,h:393}));
  it('does not use another display or an implausibly tall screen', () => expect(appViewport({...base,screenWidth:1440,screenHeight:2000,largeHeight:806})).toEqual({w:393,h:806}));
});
