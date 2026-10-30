/** Futasaku 0.4 cockpit presentation. Game-owned buttons remain the action source. */
import { BLOOM_PAD, LED_ADVANCE, drawLedBloom, drawLedCells, drawLedHot, ledBloomSprite, ledHotSprite, ledMarqueeSpan, ledMarqueeTravel, ledMessageWidth, ledMotifFrames, ledStaticMessage, ledToken } from './led-cells.js';
import type { LedTone } from './led-cells.js';
import { publishDisplayLight, LIGHT_CAPS } from './light.js';
import { DisplayMachine } from './display-machine.js';
import type { DisplayFrame } from './display-machine.js';
import type { DisplayEvent } from './display-readout.js';
type Action = { key: string; label: string; icon: string; priority: number; source: HTMLButtonElement };

const ICONS: Record<string, string> = {
  skip: '<path d="m5 5 7 7-7 7V5Zm8 0 7 7-7 7V5Z" fill="currentColor" stroke="none"/>',
  cancel: '<path d="M6 6 18 18M18 6 6 18"/>',
  clear: '<path d="M5 7h14M9 7V5h6v2m2 0-.7 12H7.7L7 7m3 4v5m4-5v5"/>',
  reverse: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  previous: '<path d="m14.5 5-7 7 7 7"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  whole: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  next: '<path d="m9.5 5 7 7-7 7"/>',
  bloom: '<path d="M12 12c-3-4-3-7 0-8 3 1 3 4 0 8Zm0 0c4-3 7-3 8 0-1 3-4 3-8 0Zm0 0c3 4 3 7 0 8-3-1-3-4 0-8Zm0 0c-4 3-7 3-8 0 1-3 4-3 8 0Z"/>',
  continue: '<path d="m8 5 8 7-8 7"/>',
  confirm: '<path d="m5 12 5 5L19 7"/>',
  neutral: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const svg = (kind: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] ?? ICONS.continue}</svg>`;
const actionKind = (button: HTMLButtonElement) => button.matches('[data-kind],.bloom-toggle') ? 'bloom'
  : button.matches('.draw-clear') ? 'clear' : button.matches('.draw-reverse') ? 'reverse'
  : button.matches('.list-prev') ? 'previous' : button.matches('.list-next') ? 'next'
  : button.matches('.cancel') ? 'cancel' : button.matches('.futa04-skip,.end') ? 'skip'
  : button.matches('.empty-continue') ? 'continue' : button.matches('.primary') ? 'confirm' : 'continue';
const priority: Record<string, number> = { back: -1, clear: 0, confirm: 1, cancel: 2, bloom: 3, reverse: 4, next: 5, previous: 6, continue: 7, skip: 8, whole: 9 };

/** Where in each idle-blink beat the dots go dark (80% for 200 ms of 1000 ms). */
const ALARM_ON_PCT = Math.round((1 - LIGHT_CAPS.alarmOffMs / LIGHT_CAPS.alarmMs) * 100);

export const SMART_COCKPIT_CSS = `
html.futa04-information #step-cue { display:none !important; }
/* The match computer owns instructions; leave the entire board unobstructed. */
html.futa04-information #board-wrap :is(#draw-info,#captions,#banner,#root-warn,#turn-pill) { display:none !important; }
html.futa04-information #tool-skip { display:none !important; }
html.futa04-information .cam-whole { display:none !important; }
html.futa04-information #futa04-box {
  --hardware-edge:inset 0 1px rgba(226,218,191,.10),inset 1px 0 rgba(225,212,180,.035),inset -1px 0 rgba(225,212,180,.03),inset 0 -2px rgba(0,0,0,.48);
  --box-tools:calc(3 * var(--control-size) + 2 * var(--control-gap));
}
html.futa04-information #futa04-box #moves { position:absolute !important; width:0 !important; height:0 !important; min-height:0 !important; overflow:hidden !important; visibility:hidden !important; pointer-events:none !important; }
html.futa04-information #futa04-box > #smart-panel {
  grid-column:3; grid-row:1 / 3; align-self:end; justify-self:end;
  display:grid; grid-template-columns:repeat(3,var(--control-size)); grid-template-rows:repeat(2,var(--control-size));
  gap:var(--control-gap); width:var(--box-tools); height:calc(2 * var(--control-size) + var(--control-gap));
  position:relative; z-index:5; box-sizing:border-box;
}
html.futa04-information[data-thumb='left'] #futa04-box > #smart-panel { grid-column:1; justify-self:start; }
body.paused #smart-panel { visibility:hidden; }
body.paused #smart-bloom { visibility:hidden; }
html.futa04-information #futa04-box #futa04-actions { display:contents !important; position:static !important; width:auto !important; height:auto !important; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(1) { grid-column:1; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(2) { grid-column:2; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(3) { grid-column:3; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > .hand-slot[hidden] { display:grid !important; visibility:visible !important; }
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) {
  width:var(--control-size) !important; height:var(--control-size) !important;
  min-width:var(--control-size); min-height:var(--control-size); max-width:var(--control-size);
  margin:0; padding:0; position:relative; inset:auto; flex:none;
  display:grid; place-items:center; box-sizing:border-box;
  border:0; border-radius:12px;
  background:#111312;
  color:var(--control-ivory); opacity:1;
  box-shadow:none;
  touch-action:manipulation;
}
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot)::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/button-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
/* Major board events catch the DISPLAY's own bezel — the emitter. The keys never
   brighten themselves; they receive light only through the reflected wash below, so
   nothing reads as a second light source. */
html.futa04-information #smart-panel.hardware-reflect #smart-led::before {
  animation:futa04-hardware-reflect 640ms ease-out;
}
@keyframes futa04-hardware-reflect {
  0%,100% { filter:none; }
  27% { filter:brightness(1.06); }
  55% { filter:brightness(1.02); }
}
html.futa04-information.reduce-motion #smart-panel.hardware-reflect #smart-led::before { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-panel.hardware-reflect #smart-led::before { animation:none; }
}
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) :is(svg,.i) { position:relative; z-index:1; }
html.futa04-information #futa04-box #smart-context { grid-column:3; grid-row:1; cursor:pointer; }
html.futa04-information #futa04-box #smart-context svg { width:21px; height:21px; }
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) :is(svg,.i) { opacity:.94; }
html.futa04-information #futa04-box #smart-context:is(:hover,:focus-visible,[aria-expanded='true']) {
  color:#fff1cf; box-shadow:0 0 9px var(--light-bloom,rgba(196,150,88,.22));
}
/* NO lit state on the Skip key (owner, 2026-10-15: "skip is highlighted on every grow — remove;
   i just wanted it to be possible during grow, but not extra highlighted"). Skip is therefore
   styled by the base key rule above, exactly like Draw/Grow/Blast, and no longer brightens its
   frame, warms its icon or carries a halo. It is still OFFERED whenever Skip is the move in this
   slot — availability never depended on these rules, only on the action being present. */
html.futa04-information #futa04-box #smart-context:disabled { opacity:.68; cursor:default; }
html.futa04-information #futa04-box #smart-context:disabled svg { opacity:.45; }
/* 0.6 polish: a disabled key must read unavailable, not merely quieter. The key keeps its face and
   its place (a control cannot vanish and shift the row), but the LABEL goes from the live warm
   ivory to a neutral muted ink at full opacity. Measured from rendered pixels: 3.2:1 on the key
   face — legible at the non-text floor, and unmistakably not the 12.3:1 of a live key.
   web/e2e/polish-3.ts reads both numbers; nothing here is eyeballed. */
html.futa04-information .dock #futa04-box #futa04-actions > .hand-slot:disabled { opacity:1; color:#66635b; }
html.futa04-information .dock #futa04-box #futa04-actions > .hand-slot:disabled :is(svg,.i) { opacity:1; }
html.futa04-information #futa04-box #smart-context:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.futa04-information #futa04-box #smart-led {
  grid-column:1 / 3; grid-row:1; width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  padding:8px 6px; box-sizing:border-box; border:0; border-radius:12px;
  background:#111312; box-shadow:none; position:relative;
  /* How far the bloom may reach BEYOND the display, in CSS px: 26 to each side, 84 above/below.
     These are the hard bounds of the light, not a preference. */
  --led-bloom-wing:26px; --led-bloom-lip:84px;
}
html.futa04-information #futa04-box #smart-led::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/display-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
html.futa04-information #futa04-box #smart-led-window {
  display:flex; align-items:center; justify-content:center; overflow:hidden; width:100%; height:100%; padding:0; box-sizing:border-box; position:relative;
  border-radius:6px; background:#090c0b; box-shadow:none; z-index:1;
}
html.futa04-information #futa04-box #smart-led-window::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background-image:radial-gradient(circle,rgba(166,128,78,.20) .65px,transparent .8px);
  background-size:2.3px 3.1px; background-position:0 2.6px;
}
html.futa04-information #futa04-box #smart-led-text {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
/* THE INK LAYER. A plain box around the glyph canvas, and the ONLY thing that blinks.
   Measured (2026-10-29, 4x CPU, 390x844, CDP): an OPACITY animation on the canvas itself never
   composites — Chrome vetoes it for directly-composited canvas content — so the 1 Hz idle blink
   was 180 main-thread frames/s (540 beginMain in 3 s, the whole game's biggest CPU cost) for a cue
   that changes twice a second. On this plain box the same animation is composited: 0. The canvas
   is untouched, so its pixels, its scale rule and its marquee are exactly as they were. */
html.futa04-information #futa04-box #smart-led-ink { display:block; flex:none; height:26px; }
/* While the marquee runs the box covers the glass, so the strip inside it is laid out from the
   window's own left edge. (The canvas rule below still says position:absolute; left:0, but it
   loses on specificity to the #futa04-box #smart-led-cells rule above — so the strip used to be
   silently CENTRED as a flex item, i.e. a marquee started in the middle of its text and its light
   was in step with a different part of the message. The box is what actually anchors it now, and
   the measured before/after screenshots agree pixel for pixel once both are anchored.) */
html.futa04-information #smart-led-window.scrolling #smart-led-ink { position:absolute; left:0; right:0; top:50%; translate:0 -50%; height:26px; }
html.futa04-information #futa04-box #smart-led-cells {
  display:block; flex:none; width:auto; height:26px; position:relative;
}
@media (min-width:1500px) {
  html.futa04-information #smart-led[data-mode='score'] #smart-led-cells { scale:1.32; }
  /* The bloom is baked from the same dots, so a scaled strip needs the same scale or the
     halo would sit inside the glyphs on a wide desktop. */
  html.futa04-information #smart-led[data-mode='score'] #smart-led-bloom { scale:1.32; }
}
html.futa04-information #smart-led-cells.scrolling { position:absolute; left:0; }
@keyframes smart-led-scroll { from { transform:translateX(0); } to { transform:translateX(calc(-1 * var(--led-travel,0px))); } }
html.futa04-information #smart-led-cells.scrolling { animation:smart-led-scroll var(--led-duration,8s) linear infinite; }
/* Attention pulses and impact flashes are short, one-shot and fully skipped under reduce-motion.
   Every one of them animates OPACITY on a box or a sprite that was baked once; none of them
   animates a filter or a shadow, so the compositor never re-rasterises the LED.
   The pulse rides the WRAPPER for the same measured reason as the blink: opacity on the canvas
   would be main-thread work. The hot sprite itself only becomes visible for the pulse. */
html.futa04-information #smart-led-window.led-pulse #smart-led-pulse { animation:smart-led-pulse 500ms ease-in-out 1; }
html.futa04-information #smart-led-window.led-pulse #smart-led-hot { opacity:1; }
/* Idle re-prompt: keep blinking with the board cues until the player starts the next move.
   NEGATIVE SPACE (owner, 2026-10-22: the brightening was barely visible): the dots and their glow
   switch OFF for LIGHT_CAPS.alarmOffMs of every LIGHT_CAPS.alarmMs. Opacity only, on a baked
   sprite, so nothing re-rasterises — and steps(1,end) makes the blink a STATE: the compositor
   changes it at 80% and 98% of the beat instead of interpolating for the whole second. */
html.futa04-information #smart-led.led-alarm #smart-led-ink { animation:smart-led-alarm ${LIGHT_CAPS.alarmMs}ms steps(1,end) infinite; }
/* The glow rests at its own dimmed strength (--light-bloom-op), so it blinks between THAT and off. */
html.futa04-information #smart-led.led-alarm #smart-led-bloom { animation:smart-led-alarm-bloom ${LIGHT_CAPS.alarmMs}ms steps(1,end) infinite; }
@keyframes smart-led-alarm {
  0%, ${ALARM_ON_PCT - 2}% { opacity:1; }
  ${ALARM_ON_PCT}%, ${100 - 2}% { opacity:0; }
  100% { opacity:1; }
}
@keyframes smart-led-alarm-bloom {
  0%, ${ALARM_ON_PCT - 2}% { opacity:var(--light-bloom-op,.286); }
  ${ALARM_ON_PCT}%, ${100 - 2}% { opacity:0; }
  100% { opacity:var(--light-bloom-op,.286); }
}
@keyframes smart-led-pulse { 0%,100% { opacity:0; } 50% { opacity:.62; } }
/* A flash is one 60 ms breath of at most 35% white on the display's own glass. Never a strobe,
   never a filter on the glyph canvas. */
html.futa04-information #smart-led-flash {
  position:absolute; inset:0; pointer-events:none; background:#fff; opacity:0;
  border-radius:inherit; z-index:3;
}
html.futa04-information #smart-led-window.led-flash-cut #smart-led-flash { animation:smart-led-flash-cut 60ms linear 1; }
html.futa04-information #smart-led-window.led-flash-bloom #smart-led-flash { animation:smart-led-flash-bloom 60ms linear 1; }
@keyframes smart-led-flash-cut { 0% { opacity:0; } 22% { opacity:.35; } 100% { opacity:0; } }
@keyframes smart-led-flash-bloom { 0% { opacity:0; } 28% { opacity:.26; } 100% { opacity:0; } }
/* The baked brightness layer: the same lit dots as the cells, one draw, opacity-only cues.
   It sits in its own plain box (the pulse layer) so the one-shot pulse can be a composited
   opacity change instead of a main-thread animation on a canvas — measured, see #smart-led-ink. */
html.futa04-information #smart-led-pulse {
  position:absolute; inset:0; pointer-events:none; z-index:2; opacity:1;
}
html.futa04-information #smart-led-hot {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  pointer-events:none; opacity:0; z-index:2;
}
html.futa04-information #smart-led-window.scrolling #smart-led-hot {
  left:0; transform:translate(0,-50%);
  animation:smart-led-hot-scroll var(--led-duration,8s) linear infinite;
}
@keyframes smart-led-hot-scroll {
  from { transform:translate(0,-50%); }
  to { transform:translate(calc(-1 * var(--led-travel,0px)),-50%); }
}
/* The old "chrome" pulse ran brightness()+drop-shadow() on every key's own frame art,
   which is why the buttons looked like a second lamp. It is gone, and so is the masked
   gradient spill: light now arrives as the display's own baked bloom, which starts at the
   lit dots and fades in every direction with no edge to read. */
@keyframes idle-urgency-draw {
  0%,100% { box-shadow:0 0 0 1px rgba(239,234,220,.44),0 1px 3px rgba(242,237,224,.10) !important; }
  50% { box-shadow:0 0 0 1px rgba(239,234,220,.72),0 1px 4px rgba(242,237,224,.20) !important; }
}
@keyframes idle-urgency-grow {
  0%,100% { opacity:1; }
  50% { opacity:.8; }
}
/* The grow hand keeps its scale breathe (futa04-card-breathe's 1.055) while the LED alarms, on the
   LED's beat, with the urgency dip on top. An opacity-only cue here REPLACED the breathe, so the
   hand looked like it stopped the moment the display started blinking GROW! (owner, 2026-10-15). */
@keyframes idle-urgency-grow-hand {
  0%,100% { scale:1; opacity:1; }
  50% { scale:1.055; opacity:.86; }
}
/* Keep the throw hand's scale breathe (futa04-card-breathe) while the LED alarms —
   idle must not replace body pulse with a glow-only cue. The cue is a tight rim, not a
   halo, so the cards never read as lamps; colours and depth shadow are unchanged. */
@keyframes idle-urgency-throw {
  0%,100% {
    scale:1;
    box-shadow:0 0 0 1px rgba(222,110,83,.40),0 1px 3px rgba(190,68,47,.26),0 5px 12px rgba(20,11,10,.28);
  }
  50% {
    scale:1.04;
    box-shadow:0 0 0 1px rgba(255,120,90,.72),0 1px 4px rgba(220,70,45,.34),0 5px 14px rgba(20,11,10,.36);
  }
}
/* Matching board cues while the LED holds the sticky idle re-prompt. */
html.futa04-information.idle-urgency[data-step='draw'] :is(#deck,#discard).ready .pile-card {
  animation:idle-urgency-draw 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim):not(.lifted) {
  animation:idle-urgency-grow-hand 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='grow'] #smart-bloom:not([hidden]) #smart-bloom-button,
html.futa04-information.idle-urgency[data-step='grow'] #smart-bloom:not([hidden]) #smart-bloom-button .futa04-combination {
  animation:idle-urgency-grow 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='throw'] #hand:not(.waiting) .card:not(.futa04-throw-picked) {
  animation:idle-urgency-throw 1200ms ease-in-out infinite;
}
html.futa04-information.reduce-motion.idle-urgency :is(#deck,#discard).ready .pile-card,
html.futa04-information.reduce-motion.idle-urgency #hand .card,
html.futa04-information.reduce-motion.idle-urgency #smart-bloom-button,
html.futa04-information.reduce-motion.idle-urgency #smart-bloom-button .futa04-combination {
  animation:none !important;
}
@media (prefers-reduced-motion:reduce) {
  html.futa04-information.idle-urgency :is(#deck,#discard).ready .pile-card,
  html.futa04-information.idle-urgency #hand .card,
  html.futa04-information.idle-urgency #smart-bloom-button,
  html.futa04-information.idle-urgency #smart-bloom-button .futa04-combination {
    animation:none !important;
  }
}
html.futa04-information.reduce-motion #smart-led-window:is(.led-pulse,.led-alarm,.led-flash-cut,.led-flash-bloom) :is(#smart-led-pulse,#smart-led-flash) { animation:none !important; }
html.futa04-information.reduce-motion #smart-led.led-alarm :is(#smart-led-ink,#smart-led-bloom) { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-led-window:is(.led-pulse,.led-alarm,.led-flash-cut,.led-flash-bloom) :is(#smart-led-pulse,#smart-led-flash) { animation:none !important; }
  html.futa04-information #smart-led.led-alarm :is(#smart-led-ink,#smart-led-bloom) { animation:none !important; }
}
/* NOTHING RUNS WHEN IT CANNOT BE SEEN. The tab is hidden (a phone in a pocket), the page is
   paused, or the game screen is away: pause every display animation instead of letting the
   compositor keep ticking a layer nobody can look at. Pausing keeps the animation's phase, so
   the blink or marquee resumes exactly where it stopped when the player comes back. */
html.led-hidden #smart-led :is(#smart-led-ink,#smart-led-cells,#smart-led-pulse,#smart-led-hot,#smart-led-bloom,#smart-led-bloom-clip,#smart-led-window,#smart-led-flash),
body.paused #smart-led :is(#smart-led-ink,#smart-led-cells,#smart-led-pulse,#smart-led-hot,#smart-led-bloom,#smart-led-bloom-clip,#smart-led-window,#smart-led-flash) {
  animation-play-state:paused !important;
}
/* Opponent replay: the read-out says "not yours" by going a little quieter. A modest luminance
   drop that stays fully legible — never a blackout, never a flash, no border, no badge: the DIM
   is the whole signal. It is a STATE, not motion, so Reduce motion keeps it and adds nothing. */
html.futa04-information #smart-panel.led-theirs #smart-led { filter:brightness(.8) saturate(.9); }
/* THE BLOOM. One baked sprite of the display's actual lit dots, directionally blurred along the
   tone's angle, padded so its falloff ends well before the bitmap edge. It sits over the frame
   art and the glass (z 2) and is normal-blended: low-alpha light over a dark cockpit, not a
   screen wash and not a rectangle. The sprite writes --led-bloom-pad, so the strip of dots
   inside the bitmap lands exactly on the window's dots.

   THE HARD BOUNDS (owner, 2026-10-20, after a bright wash spread across the cockpit on a
   scrolling marquee: "the light from display - that can never happen"). A marquee bakes ONE
   sprite for the WHOLE message — thousands of px wide — and that sprite is translated along the
   strip. Unclipped, the part of it that is outside the display painted the cockpit and the hand.
   So the bloom now lives inside a fixed clip: the display's own box plus --led-bloom-wing beside
   it and --led-bloom-lip above/below, feathered at the left and right ends so the bound has no
   visible edge. The light can therefore never be wider or taller than that band, whatever the
   message is, and it stays a bloom hugging the display. */
html.futa04-information #smart-led-bloom-clip {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:calc(100% + 2 * var(--led-bloom-wing,26px));
  height:calc(100% + 2 * var(--led-bloom-lip,84px));
  overflow:hidden; pointer-events:none; z-index:2;
  -webkit-mask-image:linear-gradient(to right,transparent 0,#000 var(--led-bloom-wing,26px),#000 calc(100% - var(--led-bloom-wing,26px)),transparent 100%);
  mask-image:linear-gradient(to right,transparent 0,#000 var(--led-bloom-wing,26px),#000 calc(100% - var(--led-bloom-wing,26px)),transparent 100%);
}
html.futa04-information #smart-led-bloom {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  pointer-events:none; z-index:0; opacity:var(--light-bloom-op,.286);
}
/* Scrolling: the sprite is aligned to the strip's own left edge. The clip is offset by its own
   wing on each side, so the alignment inside it is the old alignment plus that wing. */
html.futa04-information #smart-led-bloom.scrolling {
  left:calc(6px - var(--led-bloom-pad,0px) + var(--led-bloom-wing,26px));
  transform:translate(0,-50%);
  animation:smart-led-bloom-scroll var(--led-duration,8s) linear infinite;
}
@keyframes smart-led-bloom-scroll {
  from { transform:translate(0,-50%); }
  to { transform:translate(calc(-1 * var(--led-travel,0px)),-50%); }
}
/* A major event catches the display's own bezel: an opacity step on the baked sprite. It never
   re-rasterises the LED and never passes the bloom cap (light-bloom-op * 1.18 <= .55). */
html.futa04-information #smart-panel.hardware-reflect #smart-led-bloom {
  animation:futa04-hardware-reflect 640ms ease-out;
}
@keyframes futa04-hardware-reflect {
  0%,100% { opacity:var(--light-bloom-op,.286); }
  27% { opacity:calc(var(--light-bloom-op,.286) * 1.18); }
  55% { opacity:calc(var(--light-bloom-op,.286) * 1.06); }
}
html.futa04-information.reduce-motion #smart-panel.hardware-reflect #smart-led-bloom { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-panel.hardware-reflect #smart-led-bloom { animation:none; }
}
/* On a wide desktop the cockpit and its piles grow as one instrument. Phone
   controls retain their exact existing footprint. */
@media (min-width:1500px) {
  html.futa04-information[data-layout='side'] .dock > #futa04-box {
    width:min(560px,100%); justify-self:end;
  }
  html.futa04-information[data-layout='side'] .dock .hand-row > #hand {
    justify-content:flex-end; --slice:54px;
  }
  html.futa04-information[data-layout='side'] #futa04-box {
    --control-size:72px; --box-tools:224px; --box-pile:88px; --box-piles:184px;
    height:160px; grid-template-rows:72px 72px;
  }
  html.futa04-information[data-layout='side'] #futa04-box .pile-card {
    --pile-h:125px; --cw:88px; --ch:125px; width:88px; height:125px;
  }
  html.futa04-information[data-layout='side'][data-step='draw'] .dock > #futa04-box {
    --box-piles:224px;
  }
}
html.futa04-information #smart-selector {
  position:absolute; right:0; top:0; z-index:10;
  display:flex; gap:var(--control-gap); width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  overflow-x:auto; overflow-y:hidden; padding:0; box-sizing:border-box; scrollbar-width:none;
  border:0; border-radius:12px;
  background:var(--hardware-surface);
  box-shadow:0 2px 8px rgba(0,0,0,.4);
}
html.futa04-information #smart-selector::-webkit-scrollbar { display:none; }
html.futa04-information #smart-selector[hidden] { display:none; }
html.futa04-information #smart-selector button {
  display:grid; place-items:center; flex:0 0 var(--control-size); width:var(--control-size); height:var(--control-size);
  border:1px solid rgba(201,198,186,.31); border-radius:12px; padding:0;
  background:var(--hardware-surface);
  color:var(--control-ivory); touch-action:manipulation; box-shadow:var(--hardware-edge);
}
html.futa04-information #smart-selector button:first-child { background:rgba(196,150,88,.10); }
html.futa04-information #smart-selector button:is(:hover,:focus-visible) { background:rgba(196,150,88,.2); outline:1px solid var(--control-amber); }
html.futa04-information #smart-selector button svg { width:19px; height:19px; }
html.futa04-information #smart-selector .futa04-combination { display:flex; flex-wrap:nowrap; gap:1px; max-width:40px; }
html.futa04-information #smart-selector .futa04-mini-card { width:9px !important; min-width:9px !important; height:18px !important; padding:0 !important; border-radius:2px; }
html.futa04-information #smart-selector .futa04-mini-card .c-num { font-size:7px !important; }
html.futa04-information #smart-selector .futa04-mini-card .c-suit svg { width:7px !important; height:7px !important; }
html.futa04-information #smart-selector .smart-action-label { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
html.futa04-information #futa04-box > #smart-bloom {
  grid-column:2; grid-row:1 / 3; align-self:stretch; justify-self:center;
  display:grid; place-items:center; position:static; z-index:6;
  width:100%; min-width:0; height:calc(2 * var(--control-size) + var(--control-gap));
}
html.futa04-information #futa04-box > #smart-bloom[hidden] { display:none; }
html.futa04-information #smart-bloom-button {
  display:grid; place-items:center; position:relative; width:100%; min-width:44px; height:100%;
  /* One track that can never be wider than the key: the recipe is sized by the control, never
     the other way round (an auto track grew to the recipe's min-content and pushed it out). */
  grid-template-columns:minmax(0,1fr);
  border:0; border-radius:0; padding:4px 2px 8px;
  background:none; color:var(--control-ivory); cursor:pointer; box-shadow:none;
  touch-action:manipulation;
  /* The recipe is sized against the control it lives in (see the fit rules below). */
  container-type:inline-size;
}
html.futa04-information #smart-bloom-button:is(:hover,:focus-visible,[aria-expanded='true']) {
  filter:brightness(1.18);
}
html.futa04-information #smart-bloom-button:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
/* Quiet TE-style corner ticks + soft brightness pulse on the recipe (button stays frameless). */
html.futa04-information #smart-bloom-button::before,
html.futa04-information #smart-bloom-button::after {
  content:''; position:absolute; width:8px; height:8px; pointer-events:none;
  border-color:rgba(255,225,167,.52); border-style:solid;
  animation:futa04-bloom-corners 2.6s ease-in-out infinite;
}
html.futa04-information #smart-bloom-button::before { top:5px; left:6px; border-width:1px 0 0 1px; }
html.futa04-information #smart-bloom-button::after { right:6px; bottom:7px; border-width:0 1px 1px 0; }
/* A tiny film registration drift lives on the projected recipe alone. The control
   remains transparent; the coloured ink and card edges provide all its light. */
html.futa04-information #smart-bloom-button .futa04-combination {
  animation:futa04-recipe-projector 7.3s steps(1,end) infinite, futa04-bloom-ready 2.6s ease-in-out infinite;
  filter:drop-shadow(.25px .2px 1.2px rgba(244,227,186,.38));
}
html.futa04-information #smart-bloom-button .futa04-mini-card {
  opacity:.92; text-shadow:0 0 2px currentColor;
  box-shadow:0 0 1.5px currentColor,inset 0 0 1px currentColor;
}
@keyframes futa04-recipe-projector {
  0%,18%,20%,51%,53%,83%,85%,100% { opacity:.9; translate:0 0; }
  19%,52% { opacity:.82; translate:.28px -.2px; }
  84% { opacity:.94; translate:-.22px .16px; }
}
@keyframes futa04-bloom-ready {
  0%,100% { filter:drop-shadow(.25px .2px 1.2px rgba(244,227,186,.28)); }
  50% { filter:drop-shadow(.25px .2px 3px rgba(255,225,167,.55)); }
}
@keyframes futa04-bloom-corners {
  0%,100% { opacity:.42; }
  50% { opacity:.88; }
}
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button::before,
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button::after,
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button .futa04-combination { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-bloom-button::before,
  html.futa04-information #smart-bloom-button::after,
  html.futa04-information #smart-bloom-button .futa04-combination { animation:none !important; }
}
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination { display:flex; flex-wrap:nowrap; justify-content:center; gap:3px; width:100%; max-width:100%; }
/* The recipe must always FIT its own button. The designed cards are 26px wide (30px on a large
   desktop), which leaves 22px of slack at 390x844 — but a five- or six-card run, and the narrow
   cockpit (40px centre column at 320x568, 68px in landscape), used to paint outside the control:
   measured overhang 44px at 320, 8px at 360, 23px for a six-card run at 390, 20px in landscape.
   The cards keep the designed size whenever it fits and share the button's content box when it
   does not, so a recipe can never cover the LED display beside it. */
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card { flex:0 1 clamp(26px,2.5vw,30px); width:auto; min-width:0; height:clamp(41px,3.9vw,47px); padding:1px; border-radius:3px; container-type:inline-size; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination:has(.futa04-mini-card:nth-child(5)) .futa04-mini-card { flex-basis:21px; height:35px; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination:has(.futa04-mini-card:nth-child(6)) .futa04-mini-card { flex-basis:19px; }
/* The printed rank and suit follow their own card (cqw is the card's content box): the 13px mark
   is untouched at every designed width and only narrows when the card itself is narrow — the
   shared 320px cockpit gives a three-card recipe 11px cards, a six-card one 15px at 390. */
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card .c-num { font-size:min(13px, 110cqw); }
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card .c-suit svg { width:min(13px, 120cqw); height:min(13px, 120cqw); }
html.futa04-information #smart-bloom-count { position:absolute; right:2px; top:1px; font:600 9px/1 var(--font-mono,monospace); color:var(--control-ivory); }
html.futa04-information #smart-bloom-count[hidden] { display:none; }
html.futa04-information #smart-bloom-selector {
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); z-index:12;
  display:flex; gap:0; width:max-content; max-width:calc(100% - 12px);
  overflow-x:auto; overflow-y:hidden; padding:3px; box-sizing:border-box;
  border:1px solid rgba(201,198,186,.26); border-radius:9px;
  background:#171918; box-shadow:0 7px 18px rgba(0,0,0,.5);
}
html.futa04-information #smart-bloom-selector[hidden] { display:none; }
html.futa04-information #smart-bloom-selector button {
  display:flex; align-items:center; justify-content:center; flex:1 0 auto; min-width:76px; min-height:44px;
  border:0; border-radius:0; padding:3px 6px;
  background:transparent; color:var(--control-ivory); touch-action:manipulation;
}
html.futa04-information #smart-bloom-selector button:hover .futa04-combination { filter:brightness(1.2); }
html.futa04-information #smart-bloom-selector button:focus-visible { outline:1px solid var(--control-amber); outline-offset:-2px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-combination { display:flex; flex-wrap:nowrap; gap:3px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card { flex:0 0 20px; width:20px; min-width:20px; height:34px; padding:2px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card .c-num { font-size:13px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card .c-suit svg { width:13px; height:13px; }
/* The deck's back artwork and the discard face use the same card footprint.
   Stack pseudo-layers sit behind it and do not move its visual centre. */
html.futa04-information .dock #futa04-box :is(#deck,#discard) .pile-meta .pile-count { left:50%; transform:translateX(-50%); }
/* Match the illustrated card's printed corners instead of the legacy card silhouette. */
html.futa04-information.futa04-card-art-ready #hand .card:has(>.futa04-card-art) { border-radius:calc(var(--cw) * .075); }
html.futa04-information.futa04-card-art-ready #hand .card > .futa04-card-art { border-radius:inherit; }
html.futa04-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim):not(.futa04-bloom-pick) { box-shadow:0 0 0 1px rgba(119,194,115,.4),0 0 6px 1px rgba(88,171,86,.43),0 5px 12px rgba(5,16,9,.30); }
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card:not(.futa04-throw-picked) { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53),0 5px 12px rgba(20,11,10,.34); }
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card.futa04-throw-picked { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53) !important; }
html.futa04-information #discard .gd-halo { inset:0; border-radius:6px; }
/* Both legal draw choices glow softly: a cool white light around the actual card, no outline box
   (owner, 2026-10-22: "remove the contour thing, make the glow a tiny bit brighter and make it
   breathe"). The light is its own layer whose OPACITY breathes on the pile's 1.8 s breath
   (information.ts), so the two move as one and no shadow is ever re-painted per frame. The
   discard's amber edge is reserved for a card that completes a combo. */
html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card {
  border-radius:calc(var(--cw) * .075);
  box-shadow:none !important;
}
html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card::after {
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  box-shadow:0 0 12px 2px rgba(242,237,224,.42);
  opacity:.8;
  animation:futa04-draw-pile-glow 1.8s ease-in-out 240ms infinite;
}
@keyframes futa04-draw-pile-glow { 0%, 100% { opacity:.6; } 50% { opacity:1; } }
html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-card::after { display:none; }
html.futa04-information.reduce-motion[data-step='draw'] :is(#deck,#discard).ready .pile-card::after { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card::after { animation:none; } }
html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-card { box-shadow:none !important; }
html.futa04-information[data-step='draw'] :is(#deck,#discard) .gd-fx { display:none !important; }
html.futa04-information[data-step='draw'] #discard.ready:not(.futa04-bloom-draw) .pile-top.card { border-color:var(--c-line); box-shadow:0 1px 2px rgba(0,0,0,.4); }
/* When the Throw pile can complete a Bloom it is GOLD, not yellow (owner, 2026-10-26: "the glow
   around discard pile when it completes a bloom looks yellow - make it look more gold than
   yellow").
   OWNER, 2026-10-30: "i dont like the color, its to mustardy, make it more like heavenly gold".
   Mustard is a low-brightness yellow at high chroma, and the 10-26 values kept ALL of the chroma
   at the card's edge: rgba(212,175,55) is hue 45 / chroma .74 / value .83, so the ring itself was
   the mustard (painted pixels: rgb(149,125,53), h 45, s .65, v .58). Heavenly gold is the
   opposite SHAPE — a pale cream CORE (rgba(255,246,214): hue 47, chroma .16, value 1.0) with the
   gold living in the MIDDLE of the falloff (rgba(232,180,88): hue 38, chroma .62, value .91)
   fading to nothing at 18px. The metal reads from the cream highlight, not from a saturated ring.
   Measured on painted pixels by web/e2e/throw-pile-presentation.ts: the brightest point is the
   core (h 46, s .18, v .92) and the peak chroma is 5px out (h 37, s .52) — where the old rule had
   its brightest AND most saturated point on the rim itself. Nothing here is a filter, a blur or
   an animation: five box-shadow layers and one border. */
html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-top.card {
  transform:translateY(-3px); border-color:rgba(255,242,205,.9);
  box-shadow:0 0 0 1px rgba(255,246,214,.82), 0 0 3px rgba(255,250,235,.62),
    0 0 9px 1px rgba(232,180,88,.55), 0 0 18px 5px rgba(184,130,44,.24),
    0 2px 4px rgba(0,0,0,.45);
  transition:transform var(--dur-ack) var(--ease-standard),border-color .2s ease-out,box-shadow .2s ease-out;
}
/* Legal empty sockets share one warm, recessed treatment on Forest and Volcano turns. */
html.futa04-information #board .l-over .receptive-well {
  fill:rgba(225,216,190,.045); stroke:rgba(5,6,5,.66); stroke-width:2.5;
  pointer-events:none;
}
html.futa04-information #board .l-over .receptive-well.kind-strengthen { fill:rgba(99,171,96,.11); }
/* BLOOM HAS ITS OWN COLOUR (owner, 2026-10-23: "blooming highlighted on the board a different colour
   than grow 1 tile, so it's intuitive"). Cream is a one-tile Grow, green your tiles and Strengthen,
   coral a take or a cut, gold a rich tile; a Bloom is aqua everywhere: the tiles it may reach, their
   breath, the shape being painted, the preview and the cards picked for it in the hand. */
html.futa04-information #board .l-over .receptive-well.kind-bloom { fill:rgba(120,204,194,.12); }
html.futa04-information #board .l-over .receptive-well:is(.kind-replace,.kind-fruit) { fill:rgba(192,83,65,.11); }
/* Legal tiles invite the tap (owner, 2026-10-22: "slight movement inviting for tapping ... CLICK
   HERE but subtly"). A glow in the tile's own ink breathes in and out, rolling outward from home
   one ring at a time; light only, never a scale, so the board's ratios stay exact. The hit target
   and its hover brightening are the .target path above it, untouched. */
html.futa04-information #board .l-over .target-invite {
  fill:#ded6bd; stroke:none; opacity:0; pointer-events:none;
  animation:target-invite 2400ms cubic-bezier(.45,0,.55,1) infinite both; /* delay: board.ts (its clock) */
}
html.futa04-information #board .l-over .target-invite.kind-strengthen { fill:#a6d49b; }
html.futa04-information #board .l-over .target-invite.kind-bloom { fill:#9adbd2; }
html.futa04-information #board .l-over .target-invite:is(.kind-replace,.kind-fruit) { fill:#e5a18b; }
@keyframes target-invite {
  0%, 100% { opacity:0; }
  45% { opacity:.17; }
  60% { opacity:.13; }
}
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-over .target-invite { animation:none; opacity:0; } }
html.futa04-information.reduce-motion #board .l-over .target-invite { animation:none; opacity:0; }
html.futa04-information #board .l-over .target.kind-grow {
  fill:#ded6bd; fill-opacity:calc(.10 + var(--near,0) * .22);
  stroke:color-mix(in srgb,#d8c8a5 76%,var(--light-core,#f5d8a4) 24%);
  stroke-width:1.45; stroke-opacity:calc(.42 + var(--near,0) * .4);
  stroke-dasharray:none; animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.futa04-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit) {
  stroke-dasharray:none; stroke-width:1.45;
  fill-opacity:calc(.10 + var(--near,0) * .22);
  stroke-opacity:calc(.42 + var(--near,0) * .4);
  animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.futa04-information #board .l-over .target.kind-strengthen { fill:#a6d49b; stroke:color-mix(in srgb,#a5d294 76%,var(--light-core,#f5d8a4) 24%); }
html.futa04-information #board .l-over .target.kind-bloom { fill:#9adbd2; stroke:color-mix(in srgb,#8fd3c9 80%,var(--light-core,#f5d8a4) 20%); }
html.futa04-information #board .l-over .target:is(.kind-replace,.kind-fruit) { fill:#e5a18b; stroke:color-mix(in srgb,#db917a 76%,var(--light-core,#f5d8a4) 24%); }
html.futa04-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit):hover { fill-opacity:.23; stroke-opacity:.74; }
html.futa04-information #board .l-over .will-cut,
html.futa04-information #board .l-over .blast-affected {
  fill:#db806e; fill-opacity:.12; stroke:#d99179; stroke-width:1.15; stroke-opacity:.58;
  stroke-dasharray:none; pointer-events:none;
}
/* A Blast reads as its target first (owner, 2026-10-23): the tile it lands on is the strongest
   mark, the neighbours it also destroys clearly fainter, so the eye finds the middle at once. */
html.futa04-information #board .l-over .blast-affected { fill-opacity:.09; stroke-opacity:.46; }
html.futa04-information #board .l-over .selected.blast-selected { fill:#e5a18b; fill-opacity:.30; stroke:#e5aa90; stroke-width:1.6; stroke-opacity:.95; pointer-events:none; }
html.futa04-information #board .l-over .target.kind-grow:hover {
  fill-opacity:.24; stroke-opacity:.72;
}
html.futa04-information #board .l-over .selected.receptive-active {
  fill:#e2d7ba; fill-opacity:.20; stroke:#e1d0a9; stroke-opacity:.70; stroke-width:1.35;
  pointer-events:none;
}
/* Selected and previewed tiles use the same flat hex well as a legal move. */
html.futa04-information #board .l-over :is(.selected,.ghost-tile) {
  stroke-dasharray:none; stroke-width:1.2; fill-opacity:.19; stroke-opacity:.74; pointer-events:none;
}
html.futa04-information #board .l-over :is(.selected,.ghost-tile):is(.kind-strengthen,.kind-grow) {
  fill:#a6d49b; stroke:#a5d294;
}
html.futa04-information #board .l-over :is(.selected,.ghost-tile).kind-bloom {
  fill:#9adbd2; stroke:#8fd3c9;
}
html.futa04-information #board .l-over :is(.selected,.ghost-tile).kind-replace {
  fill:#e5a18b; stroke:#db917a;
}
/* The hexes being painted: the same flat grid, green ink and stroke as a legal well, so the
   shape you draw reads as one family with the legal-move highlights. The stroke is the SAME
   light-warmed mix the well uses (#a5d294 76% + the light core), not the flat green: the two
   have to compute to one value or the first painted hex reads as a different green from the
   well it grew out of. Each hex pops softly as it joins the shape (the group holds the ink and
   its stone, so both arrive together). */
html.futa04-information #board .l-draw .ghost-tile {
  fill:#9adbd2; fill-opacity:.19;
  stroke:color-mix(in srgb,#8fd3c9 80%,var(--light-core,#f5d8a4) 20%); stroke-width:1.45; stroke-opacity:.74;
  stroke-dasharray:none; animation:none;
  transition:fill-opacity .18s ease-out, stroke-opacity .18s ease-out, stroke .18s ease-out;
}
html.futa04-information #board .l-draw .ghost.cant .ghost-tile {
  fill:#e5a18b; stroke:#db917a;
}
html.futa04-information #board .l-draw .ghost.blocked:not(.cant) .ghost-tile { fill-opacity:.11; }
html.futa04-information #board .l-draw .ghost {
  transform-box:fill-box; transform-origin:center;
  animation:draw-hex-pop 260ms cubic-bezier(.2,.9,.32,1.12) both;
  will-change:transform;
}
@keyframes draw-hex-pop {
  0% { transform:scale(.58); opacity:0; }
  55% { transform:scale(1.06); opacity:1; }
  100% { transform:scale(1); opacity:1; }
}
html.futa04-information.reduce-motion #board .l-draw .ghost { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-draw .ghost { animation:none; } }
html.futa04-information #board .l-draw .ghost.cant .ghost-tile { stroke-opacity:.82; }
html.futa04-information #board .l-territory-contour .territory-contour {
  stroke-width:.82; stroke-linecap:round; stroke-linejoin:round; opacity:.75;
}
html.futa04-information #board .l-territory-contour .territory-contour.p0 { stroke:#c9e9a9; }
html.futa04-information #board .l-territory-contour .territory-contour.p1 { stroke:#e4a289; }
html.futa04-information #board .l-territory-contour .territory-contour.grow-in {
  stroke-dasharray:1; animation:draw-on calc(280ms * var(--anim,1)) ease-out both;
}
html.futa04-information.reduce-motion #board .l-territory-contour .territory-contour.grow-in { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-territory-contour .territory-contour.grow-in { animation:none; } }
@media (prefers-reduced-motion:reduce) { html.futa04-information :is(#smart-led-cells,#smart-led-bloom,#smart-led-hot).scrolling { animation:none; } }
html.futa04-information.reduce-motion :is(#smart-led-cells,#smart-led-bloom,#smart-led-hot).scrolling { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-over .target.kind-grow { animation:none; transition:none; } }
html.futa04-information.reduce-motion #board .l-over .target.kind-grow { animation:none; transition:none; }
`;

/** `heldMove`: the display's word for a held move (GROW 1, BLOOM 3, BOMB), shown instead of CANCEL. */
export function mountSmartCockpit(options: { heldMove?: () => string | null } = {}) {
  const box = document.getElementById('futa04-box')!;
  const actions = document.getElementById('futa04-actions')!;
  const moves = document.getElementById('moves')!;
  const rail = document.getElementById('futa04-information-rail')!;
  const style = document.createElement('style');
  style.id = 'smart-cockpit-style'; style.textContent = SMART_COCKPIT_CSS; document.head.append(style);
  const panel = document.createElement('div'); panel.id = 'smart-panel'; panel.setAttribute('role','group'); panel.setAttribute('aria-label','Game controls');
  const led = document.createElement('div'); led.id = 'smart-led'; led.setAttribute('role','status'); led.setAttribute('aria-live','polite');
  const windowEl = document.createElement('div'); windowEl.id = 'smart-led-window';
  const text = document.createElement('span'); text.id = 'smart-led-text';
  // Two plain boxes carry the opacity cues. A canvas is directly-composited content: an opacity
  // animation on it is refused by the compositor and becomes main-thread work on every frame
  // (measured 2026-10-29: the idle blink alone was 180 main frames/s). The boxes around the
  // canvases composite the same animation for free, and the canvases themselves never change.
  const ink = document.createElement('div'); ink.id = 'smart-led-ink'; ink.setAttribute('aria-hidden','true');
  const pulse = document.createElement('div'); pulse.id = 'smart-led-pulse'; pulse.setAttribute('aria-hidden','true');
  const cells = document.createElement('canvas'); cells.id = 'smart-led-cells'; cells.setAttribute('aria-hidden','true');
  // The one-shot brightness layer (pulse/alarm) and the capped flash, both opacity-only.
  const hot = document.createElement('canvas'); hot.id = 'smart-led-hot'; hot.setAttribute('aria-hidden','true');
  const flashEl = document.createElement('i'); flashEl.id = 'smart-led-flash'; flashEl.setAttribute('aria-hidden','true');
  // The bloom lives outside the glass (the window clips the marquee) so its falloff can pass the
  // bezel instead of being cut into a rectangle — but inside a FIXED clip of its own, so a
  // marquee's whole-strip sprite can never paint across the cockpit (see the CSS).
  const bloomEl = document.createElement('canvas'); bloomEl.id = 'smart-led-bloom'; bloomEl.setAttribute('aria-hidden','true');
  const bloomClip = document.createElement('div'); bloomClip.id = 'smart-led-bloom-clip'; bloomClip.setAttribute('aria-hidden','true');
  bloomClip.append(bloomEl);
  ink.append(cells);
  pulse.append(hot);
  windowEl.append(text,ink,pulse,flashEl); led.append(windowEl,bloomClip);
  const context = document.createElement('button'); context.id = 'smart-context'; context.type = 'button'; context.setAttribute('aria-haspopup','menu'); context.setAttribute('aria-expanded','false');
  const selector = document.createElement('div'); selector.id = 'smart-selector'; selector.setAttribute('role','menu'); selector.hidden = true;
  context.setAttribute('aria-controls',selector.id);
  const bloom = document.createElement('div'); bloom.id = 'smart-bloom'; bloom.hidden = true;
  const bloomButton = document.createElement('button'); bloomButton.id = 'smart-bloom-button'; bloomButton.type = 'button';
  const bloomCount = document.createElement('span'); bloomCount.id = 'smart-bloom-count'; bloomCount.hidden = true;
  const bloomSelector = document.createElement('div'); bloomSelector.id = 'smart-bloom-selector'; bloomSelector.setAttribute('role','menu'); bloomSelector.hidden = true;
  bloomButton.setAttribute('aria-controls',bloomSelector.id);
  bloom.append(bloomButton,bloomSelector);
  panel.append(led,context,actions,selector); box.append(panel,bloom);
  moves.setAttribute('aria-hidden','true');
  let current: Action[] = [];
  let signature = '';
  let lastPhase = '';
  let lastAction = '';
  let lastText = '';
  let lastMode: LedTone = 'amber';
  let lastCompact = false;
  let lastMotif: DisplayFrame['motif'];
  let lastFlash: DisplayFrame['flash'];
  let motifTimer = 0;
  /** The running motif painter, so the interval can be stopped while the page is hidden. */
  let motifPaint: (() => void) | null = null;
  let flashTimer = 0;
  /**
   * The idle re-prompt blink's own clock: two wake-ups a second while the display is blinking its
   * step word, and none at all otherwise (see the CSS note and player/led-blink.ts for why this is
   * not a CSS animation any more).
   */
  let lastReduced = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  let reel: Animation[] = [];
  const close = () => { selector.hidden = true; context.setAttribute('aria-expanded','false'); };
  const closeBloom = () => { bloomSelector.hidden = true; bloomButton.setAttribute('aria-expanded','false'); };
  let bloomSources: HTMLButtonElement[] = [];
  let bloomSignature = '';
  const syncBloom = () => {
    const byKind = new Map<string,HTMLButtonElement>();
    for (const button of moves.querySelectorAll<HTMLButtonElement>('button[data-kind]')) {
      if (!button.disabled && button.dataset.kind && !byKind.has(button.dataset.kind)) byKind.set(button.dataset.kind,button);
    }
    const highestRank = (button: HTMLButtonElement) => Math.max(0,...[...button.querySelectorAll<HTMLElement>('.futa04-mini-card .c-num')].map(node=>Number(node.textContent?.trim())||0));
    /**
     * LONGEST FIRST (owner, 2026-10-30: "show the biggest/longest blooms first"). The order used to
     * be by the HIGHEST CARD RANK a recipe holds, which is not the same thing: a 5-card run of 3-7
     * sorted below a 3-card run of 8-9, so the biggest Bloom was not at the top of the menu. Every
     * mini-card carries the card it plays, so the COUNT of them is the recipe's real size; the rank
     * is only the tie-break, then the kind, so the same hand always lists in the same order.
     * `moveButtons` already sorts its buttons this way — this list follows that order and only
     * re-sorts where the cockpit builds its own, so the two surfaces can never disagree.
     */
    const cardCount = (button: HTMLButtonElement) => button.querySelectorAll('.futa04-mini-card').length;
    bloomSources = [...byKind.values()].sort((a,b) =>
      cardCount(b) - cardCount(a) || highestRank(b) - highestRank(a) || (a.dataset.kind ?? '').localeCompare(b.dataset.kind ?? '', 'en', { numeric: true }));
    const next = bloomSources.map(button => `${button.dataset.kind}:${button.getAttribute('aria-label')}`).join('|');
    bloom.hidden = bloomSources.length === 0;
    if (next === bloomSignature) return;
    bloomSignature = next; closeBloom();
    if (!bloomSources.length) return;
    const first = bloomSources[0]!;
    const face = first.querySelector('.futa04-combination')?.cloneNode(true);
    bloomButton.replaceChildren(...(face ? [face] : [document.createTextNode('BLOOM')]),bloomCount);
    bloomButton.setAttribute('aria-label',bloomSources.length === 1 ? first.getAttribute('aria-label') || 'Bloom' : `${bloomSources.length} Bloom combinations`);
    bloomButton.setAttribute('aria-haspopup',bloomSources.length > 1 ? 'menu' : 'false');
    bloomCount.hidden = true; // The visible control is the recipe cards alone.
    bloomSelector.replaceChildren(...bloomSources.map((button,index) => {
      const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role','menuitem');
      choice.setAttribute('aria-label',button.getAttribute('aria-label') || `Bloom combination ${index+1}`);
      const cards = button.querySelector('.futa04-combination')?.cloneNode(true);
      if (cards) choice.append(cards);
      choice.addEventListener('click',() => { closeBloom(); bloomSources[index]?.click(); });
      return choice;
    }));
  };
  const setText = (frame: DisplayFrame) => {
    const { text:value, mode } = frame;
    const reduceNow = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    // Speed "Off" sets --anim to 0: like reduce motion, the light holds still (a steady glow).
    const anim = Number.parseFloat(document.documentElement.style.getPropertyValue('--anim'));
    const still = reduceNow() || (Number.isFinite(anim) && anim === 0);
    const pulsing = !!frame.pulse && !frame.alarm && !still;
    const alarming = !!frame.alarm && !still;
    windowEl.classList.toggle('led-pulse', pulsing);
    windowEl.classList.toggle('led-alarm', alarming);
    // The blink dims the bloom too, which sits outside the window, so the class rides on #smart-led.
    led.classList.toggle('led-alarm', alarming);
    // The pulse/alarm is the display's own glass now (the baked hot layer inside the window).
    // The keys never animate, so the panel carries no beat class of its own.
    panel.dataset.ledMode = mode;
    // ONE light contract: the root publishes the tone once, and every CSS consumer follows.
    // `publishLight` writes only when the tone changes (the bloom never changes per frame).
    publishDisplayLight(mode);
    // Same flag drives LED alarm + board cue blinks (piles / hand / bloom).
    document.documentElement.classList.toggle('idle-urgency', !!frame.alarm);
    if (value === lastText && mode === lastMode && !!frame.compact === lastCompact && frame.motif === lastMotif && frame.flash === lastFlash) return;
    const previous = lastText;
    const animated = !still;
    const scoreTick = animated && mode === 'score' && lastMode === 'score' && previous.length === value.length;
    const animateReel = previous && animated && !scoreTick;
    for (const running of reel) running.cancel(); reel = [];
    window.clearInterval(motifTimer);
    windowEl.querySelector('.led-reel-old')?.remove();
    let old: HTMLCanvasElement | null = null;
    if (animateReel || scoreTick) {
      old = document.createElement('canvas'); old.className = 'led-reel-old';
      old.width = cells.width; old.height = cells.height;
      old.getContext('2d')?.drawImage(cells,0,0);
      old.style.cssText = `position:absolute;width:${cells.style.width};height:26px;left:${cells.classList.contains('scrolling') ? '0' : '50%'};top:50%;transform:translate(${cells.classList.contains('scrolling') ? '0' : '-50%'},-50%);pointer-events:none`;
      if (scoreTick) {
        const ctx = old.getContext('2d');
        const dpr = old.width / ledMessageWidth(previous);
        for (let i = 0; i < previous.length; i++) if (previous[i] === value[i])
          ctx?.clearRect(i * LED_ADVANCE * dpr,0,LED_ADVANCE * dpr,old.height);
      }
      windowEl.append(old);
    }
    lastText = value; lastMode = mode; lastCompact = !!frame.compact; lastMotif = frame.motif; lastFlash = frame.flash;
    text.textContent = value; led.title = value; led.dataset.mode = mode;
    cells.classList.remove('scrolling');
    led.style.setProperty('--led-bloom-pad', `${BLOOM_PAD}px`);
    requestAnimationFrame(() => {
      if (value !== lastText || mode !== lastMode || !!frame.compact !== lastCompact || frame.motif !== lastMotif || frame.flash !== lastFlash) { old?.remove(); return; }
      const reduced = reduceNow();
      // A recognised caption/banner gets its short token even with motion on; other copy keeps its scroll.
      const token = ledToken(value);
      const shown = token ?? (reduced || frame.compact ? ledStaticMessage(value) : value);
      const scrolling = animated && !frame.motif && mode !== 'score' && ledMessageWidth(shown) > windowEl.clientWidth - 2;
      if (frame.motif) {
        const frames = ledMotifFrames(frame.motif);
        // Bake the whole small set ONCE: the 11 fps loop only swaps finished pictures.
        const bloomFrames = frames.map(picture => ledBloomSprite(picture,false,mode));
        const hotFrames = frames.map(picture => ledHotSprite(picture,false,mode));
        const first = bloomFrames.find(Boolean);
        if (first) {
          bloomEl.width = first.canvas.width; bloomEl.height = first.canvas.height;
          bloomEl.style.width = `${first.width}px`; bloomEl.style.height = `${first.height}px`;
        }
        // Contexts are looked up once per motif, not once per 11 fps frame.
        const hotCtx = hot.getContext('2d');
        const bloomCtx = bloomEl.getContext('2d');
        let index = 0;
        const paint = () => {
          const at = index++ % frames.length;
          drawLedCells(cells,frames[at]!,false,mode);
          const hotFrame = hotFrames[at];
          if (hotFrame) {
            if (hot.width !== hotFrame.canvas.width || hot.height !== hotFrame.canvas.height) { hot.width = hotFrame.canvas.width; hot.height = hotFrame.canvas.height; }
            hot.style.width = `${hotFrame.width}px`; hot.style.height = `${hotFrame.height}px`;
            hotCtx?.clearRect(0,0,hot.width,hot.height);
            hotCtx?.drawImage(hotFrame.canvas,0,0);
          }
          const bloomFrame = bloomFrames[at];
          if (bloomFrame) {
            if (bloomEl.width !== bloomFrame.canvas.width || bloomEl.height !== bloomFrame.canvas.height) { bloomEl.width = bloomFrame.canvas.width; bloomEl.height = bloomFrame.canvas.height; }
            bloomEl.style.width = `${bloomFrame.width}px`; bloomEl.style.height = `${bloomFrame.height}px`;
            bloomCtx?.clearRect(0,0,bloomEl.width,bloomEl.height);
            bloomCtx?.drawImage(bloomFrame.canvas,0,0);
          }
        };
        motifPaint = paint;
        paint();
        window.clearInterval(motifTimer);
        // Not while the page is hidden: the motif is an 11 fps canvas repaint and a phone in a
        // pocket has nobody looking at it (the same rule world-view.ts follows for its 12 s poll).
        motifTimer = document.hidden ? 0 : window.setInterval(paint,88);
      } else {
        motifPaint = null;
        // Baked for the WINDOW while it scrolls: one period plus the glass, never the message
        // three times over. The bloom also needs the light of the dots just outside the glass
        // (its falloff reaches ~BLOOM_PAD past the bezel), so its strip carries that margin.
        const span = scrolling ? ledMarqueeSpan(shown, windowEl.clientWidth) : undefined;
        drawLedCells(cells,shown,scrolling,mode,1,span);
        // One bake per message: the bloom and the brightness layer come from those same dots.
        drawLedHot(hot,shown,scrolling,mode,1,span);
        drawLedBloom(bloomEl,shown,scrolling,mode,1,span === undefined ? undefined : span + 2 * BLOOM_PAD);
      }
      bloomEl.classList.toggle('scrolling', scrolling);
      windowEl.classList.toggle('scrolling', scrolling);
      window.clearTimeout(flashTimer);
      windowEl.classList.remove('led-flash-cut','led-flash-bloom');
      if (frame.flash && animated) {
        void windowEl.offsetWidth; // restart the one-shot accent
        windowEl.classList.add(frame.flash === 'bloom' ? 'led-flash-bloom' : 'led-flash-cut');
        // A flash is one capped breath (LIGHT_CAPS.flashMs), never a brightness filter.
        flashTimer = window.setTimeout(() => windowEl.classList.remove('led-flash-cut','led-flash-bloom'), LIGHT_CAPS.flashMs);
      }
      if (scrolling) {
        const travel = ledMarqueeTravel(shown);
        // The bloom is the same baked strip, so it travels the same distance for the same time.
        for (const target of [cells,led]) {
          target.style.setProperty('--led-travel',`${travel}px`);
          // 56 px/s: a touch faster than the old 42, still a sentence you can read once. The
          // 3.2 s floor keeps a short scroll from crawling.
          target.style.setProperty('--led-duration',`${Math.max(3.2,travel/56).toFixed(1)}s`);
        }
        cells.classList.add('scrolling');
      }
      if (old && old.isConnected) {
        if (scoreTick) {
          const tick = old.animate([{translate:'0 0',opacity:1},{translate:'0 2px',opacity:0}],{duration:180,easing:'ease-out'});
          reel = [tick]; tick.onfinish = () => old?.remove();
        } else {
          const duration = 190;
          const ease = 'cubic-bezier(.2,.7,.2,1)';
          const outgoing = old.animate([{translate:'0 0',opacity:1},{translate:'0 26px',opacity:0}],{duration,easing:ease});
          const incoming = cells.animate([{translate:'0 -26px',opacity:0},{translate:'0 0',opacity:1}],{duration,easing:ease});
          reel = [outgoing,incoming]; outgoing.onfinish = () => old?.remove();
        }
      }
    });
  };
  // The motif animation (an 11 fps canvas repaint) stops with the page: nothing is looking at it,
  // and a phone in a pocket must not keep painting the LED cells.
  // The display's CSS animations (the marquee, the blink) are paused too — a composited animation
  // is invisible but still costs the compositor a tick and the GPU a frame, so the screen, not
  // just the painter, is why the gate exists. Paused, not cancelled: the phase survives.
  const applyVisibilityGate = () => {
    document.documentElement.classList.toggle('led-hidden', document.hidden);
  };
  applyVisibilityGate();
  document.addEventListener('visibilitychange', () => {
    applyVisibilityGate();
    window.clearInterval(motifTimer);
    motifTimer = 0;
    if (document.hidden) return;
    if (motifPaint) {
      motifPaint();
      motifTimer = window.setInterval(motifPaint, 88);
    }
  });
  // Hold times follow Speed (--anim); skip/0 floors inside DisplayMachine.
  const machine = new DisplayMachine(setText, () => {
    const raw = Number.parseFloat(document.documentElement.style.getPropertyValue('--anim'));
    return Number.isFinite(raw) ? raw : 1;
  });
  const phaseMessage = () => {
    const root = document.documentElement;
    if (root.dataset.step === 'opp') return 'WAIT';
    if (root.dataset.step === 'draw') return 'DRAW!';
    if (root.dataset.step === 'throw') return 'THROW!';
    if (root.dataset.futa04Bloom === 'true') return 'BLOOM!';
    if (root.dataset.step === 'grow') {
      // After the one Grow, Bloom is optional — make Skip feel like an invitation.
      if (root.dataset.futa04Grew === 'true' && root.dataset.futa04BloomReady === 'true') return 'SKIP?';
      return 'GROW!';
    }
    return 'FUTASAKU';
  };
  machine.reset(phaseMessage());
  publishDisplayLight('amber');
  // The cadence the blink really runs, written once as a contract for the display suite: ON for
  // the rest of the beat, OFF for LIGHT_CAPS.alarmOffMs, 1 Hz in total.
  led.dataset.alarmOn = String(LIGHT_CAPS.alarmMs - LIGHT_CAPS.alarmOffMs);
  led.dataset.alarmOff = String(LIGHT_CAPS.alarmOffMs);
  const refreshMessage = () => machine.phase(phaseMessage());
  const flash = (value: string, ms = 1900) => machine.event({message:value.toUpperCase(),priority:30,duration:ms});
  const collect = (): Action[] => {
    const buttons = [...moves.querySelectorAll<HTMLButtonElement>('button')];
    const items = buttons.filter(button => !button.disabled && !button.matches('[data-kind],.bloom-toggle'));
    if (document.getElementById('tool-skip')?.hidden === false) {
      const skip = document.getElementById('tool-skip') as HTMLButtonElement;
      items.push(skip);
    }
    const camera = document.querySelector<HTMLButtonElement>('.cam-whole');
    if (camera && !camera.hidden) items.push(camera);
    if (document.getElementById('confirm')?.hidden === false) {
      items.push(document.getElementById('confirm-play') as HTMLButtonElement,document.getElementById('confirm-cancel') as HTMLButtonElement);
    }
    return items.filter(button => !button.closest('[hidden]') || button.closest('.bloom-options'))
      .map((button,index) => {
        const kind = button.matches('.cam-whole') ? button.textContent?.trim() === 'Back to play' ? 'back' : 'whole'
          : button.id === 'tool-skip' ? 'skip' : button.id === 'confirm-play' ? 'confirm' : button.id === 'confirm-cancel' ? 'cancel' : actionKind(button);
        const label = button.getAttribute('aria-label') || button.title || button.textContent?.trim() || kind;
        const key = `${kind}:${button.dataset.kind ?? ''}:${label}`;
        return { key,label,icon:kind,priority:(button.id === 'tool-skip' ? -2 : priority[kind] ?? 9)+index/100,source:button };
      }).sort((a,b)=>a.priority-b.priority);
  };
  const renderSelector = () => {
    selector.replaceChildren(...current.map(item => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role','menuitem');
      b.dataset.action = item.key; b.setAttribute('aria-label',item.label); b.title = item.label;
      const combination = item.icon === 'bloom' ? item.source.querySelector('.futa04-combination') : null;
      if (combination) b.append(combination.cloneNode(true)); else b.innerHTML = svg(item.icon);
      const label = document.createElement('span'); label.className = 'smart-action-label'; label.textContent = item.label; b.append(label);
      b.addEventListener('click', () => { close(); current.find(a=>a.key===item.key)?.source.click(); });
      return b;
    }));
  };
  context.addEventListener('click', () => {
    if (current.length === 1) { current[0]!.source.click(); return; }
    if (current.length < 2) return;
    const opening = selector.hidden;
    if (opening) { selector.hidden = false; context.setAttribute('aria-expanded','true'); selector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else close();
  });
  const activateBloom = (source: HTMLButtonElement | undefined, cardId?: number) => {
    if (!source) return;
    if (cardId != null && Number.isFinite(cardId)) source.dataset.bloomCard = String(cardId);
    else delete source.dataset.bloomCard;
    source.click();
  };
  bloomButton.addEventListener('click', (event) => {
    const mini = (event.target as Element | null)?.closest?.('.futa04-mini-card') as HTMLElement | null;
    const cardId = mini ? Number(mini.dataset.card) : NaN;
    const picked = Number.isFinite(cardId) ? cardId : undefined;
    // One recipe: tap the face (or a mini-card) to start; mini-card sets tile one.
    if (bloomSources.length === 1) { activateBloom(bloomSources[0], picked); return; }
    if (bloomSources.length < 2) return;
    // Several recipes: any face tap opens the drawer. Mini-card → tile-one lives on the menu items.
    const opening = bloomSelector.hidden;
    if (opening) { bloomSelector.hidden = false; bloomButton.setAttribute('aria-expanded','true'); bloomSelector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else closeBloom();
  });
  bloomSelector.addEventListener('click', (event) => {
    const mini = (event.target as Element | null)?.closest?.('.futa04-mini-card') as HTMLElement | null;
    if (!mini) return;
    const choice = mini.closest('button');
    if (!choice || !bloomSelector.contains(choice)) return;
    const index = [...bloomSelector.querySelectorAll(':scope > button')].indexOf(choice);
    const cardId = Number(mini.dataset.card);
    event.preventDefault();
    event.stopPropagation();
    closeBloom();
    activateBloom(bloomSources[index], Number.isFinite(cardId) ? cardId : undefined);
  }, true);
  document.addEventListener('pointerdown', event => {
    machine.interact();
    if (!panel.contains(event.target as Node)) close();
    if (!bloom.contains(event.target as Node)) closeBloom();
  }, { capture:true });
  document.addEventListener('keydown', event => {
    machine.interact();
    if (event.key !== 'Escape') return;
    if (!bloomSelector.hidden) { event.preventDefault(); closeBloom(); bloomButton.focus(); }
    else if (!selector.hidden) { event.preventDefault(); close(); context.focus(); }
  });
  rail.addEventListener('futa04-noticechange', () => {
    const shown = rail.querySelector<HTMLElement>('[data-information-active="true"]');
    if (shown && rail.dataset.noticePriority === 'major') flash(shown.textContent?.trim() || 'ACTION',2200);
    else refreshMessage();
  });
  window.addEventListener('resize', () => { lastText = ''; machine.repaint(); });
  return { score: (you:number,opp:number) => machine.score(you,opp), sync() {
    const reduced = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (reduced !== lastReduced) { lastReduced = reduced; lastText = ''; machine.repaint(); }
    syncBloom();
    const next = collect();
    const phase = document.documentElement.dataset.step ?? '';
    const key = `${phase}:${next.map(a=>a.key).join('|')}`;
    current = next;
    if (key !== signature) { close(); signature = key; renderSelector(); }
    const first = current[0];
    // Never hint SKIP — phaseMessage already owns SKIP?/THROW!/GROW!, and a SKIP hint
    // was lingering into the throw step after EndAct.
    if (lastPhase === phase && lastAction && first?.key !== lastAction) {
      const hint = first?.icon === 'clear' ? 'CLEAR' : first?.icon === 'reverse' ? 'FLIP'
        : first?.icon === 'cancel' ? options.heldMove?.() ?? 'CANCEL' : first?.icon === 'bloom' ? 'BLOOM' : '';
      if (hint) machine.hint(hint);
    }
    if (lastPhase !== phase && phase === 'opp') machine.event({message:'WAIT',priority:20,duration:1050,mode:'red',pulse:true});
    lastPhase = phase; lastAction = first?.key ?? '';
    context.innerHTML = svg(first?.icon ?? 'neutral'); context.disabled = !first;
    // The slot's current action, so CSS can light a key that is the move (e.g. Skip).
    context.dataset.action = first?.icon ?? '';
    context.setAttribute('aria-haspopup',current.length > 1 ? 'menu' : 'false');
    context.setAttribute('aria-label',first ? current.length > 1 ? `${first.label}. ${current.length} actions available` : first.label : 'No action available');
    context.title = context.getAttribute('aria-label') ?? '';
    for (const b of moves.querySelectorAll<HTMLButtonElement>('button')) b.tabIndex = -1;
    refreshMessage();
  }, flash, hint: (value:string) => machine.hint(value), event: (event:DisplayEvent) => machine.event(event),
    /**
     * The display is showing the OPPONENT's replayed turn: dim the glass so it reads as not
     * yours. A state, toggled by its owner (main's `theirsDim`); one small class, no inline
     * style, so nothing here can leak a stuck dim past the drain that clears it.
     */
    dim: (on: boolean) => { panel.classList.toggle('led-theirs', on); },
    /**
     * Hold a drag word (DRAW/PLACE/THROW/BLOOM/MEGA) on the sign; null clears it. Never FAST.
     * `immediate` bypasses the display dwell for a word that announces a STATE (the replay's
     * REPLAY sign), so the sign is up on the frame the board starts moving.
     */
    led: (word:string|null, opts?: { immediate?: boolean }) => {
      if (word) machine.hold(word, word === 'THROW' ? 'red' : word === 'BLOOM' || word === 'MEGA' ? 'green' : 'amber', opts);
      else machine.release();
    },
    reset: (you=0,opp=0) => machine.reset(phaseMessage(),you,opp),
    /** A lesson message is on screen: the sign keeps the score and real results only. */
    quiet: (on: boolean) => machine.setQuiet(on),
    /** Hold the score on the sign while a lesson points at it; false lets it go. */
    holdScore: (on: boolean) => { if (on) machine.holdScore(); else machine.release(); } };
}
