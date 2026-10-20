import"./effects-C39bITaM.js";var e={amber:{core:`#f5d8a4`,bloom:`rgba(255,195,104,.30)`,angle:22,peak:.44},red:{core:`#e4705e`,bloom:`rgba(234,68,48,.32)`,angle:22,peak:.46},green:{core:`#a9d886`,bloom:`rgba(143,210,111,.28)`,angle:22,peak:.44},ivory:{core:`#f5ead1`,bloom:`rgba(255,233,182,.26)`,angle:22,peak:.42},pink:{core:`#edabc0`,bloom:`rgba(237,150,178,.26)`,angle:22,peak:.42},cyan:{core:`#a7d3d0`,bloom:`rgba(132,209,206,.24)`,angle:22,peak:.42}},t={flashMs:60,flashWhite:.35,alarmMs:1200,bloomPeak:.55,reflect:1.18,reach:52};e.amber.core,e.red.core,e.green.core,e.ivory.core,e.pink.core,e.cyan.core;var n=t.reach*1.45;Math.ceil(n)+2;var r=`
#futasaku-glass { position:fixed; z-index:35; box-sizing:border-box; border:1px solid rgba(214,204,177,.14);
  border-radius:15px; overflow:hidden; color:#f0e9dc; background:rgba(8,10,10,.42);
  box-shadow:inset 0 1px rgba(243,232,202,.06),0 10px 28px rgba(0,0,0,.22);
  backdrop-filter:blur(9px) saturate(1.05); -webkit-backdrop-filter:blur(9px) saturate(1.05);
  font:400 13px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); }
#futasaku-glass[hidden], #tutorial-focus[hidden] { display:none; }
/* Hosted inside #game.screen so z-order compares with #hud-menu (body-level glass sat above the whole screen). */
#futasaku-glass[data-mode='tutorial'] { pointer-events:none; z-index:40; max-width:min(420px,calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))); width:min(420px,calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)));
  left:50%; top:max(0px, env(safe-area-inset-top, 0px)); bottom:auto; transform:translateX(-50%); height:auto;
  background:rgba(12,14,14,.88);
  border:none !important; outline:none !important; box-shadow:0 12px 32px rgba(0,0,0,.36);
  backdrop-filter:blur(10px) saturate(1.05); -webkit-backdrop-filter:blur(10px) saturate(1.05);
  transition: opacity 220ms ease; filter:none; }
/* Phone tutorial: pad the map band between glass and cockpit, then centre the board
   so top gap (glass→board) matches bottom gap (board→hand/cockpit). */
html.futa04-tutorial #game.screen { overflow: visible; }
html.futa04-tutorial:not([data-layout='side']) .board-wrap {
  padding-top: var(--tutorial-pad-top, var(--tutorial-glass-h, 0px));
  padding-bottom: var(--tutorial-pad-bottom, 0px);
  box-sizing: border-box;
  min-height: 0;
}
/* Cancel thumb “map under cards” so the leftover band is truly glass↔dock. */
html.futa04-tutorial[data-thumb] .board-wrap,
html.futa04-tutorial.futa04-information[data-thumb] .board-wrap {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  --cam-under: 0px;
}
@media (max-width:600px) and (min-aspect-ratio:53/100) {
  html.futa04-tutorial.futa04-information[data-thumb] #game .board-wrap {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
}
html.futa04-tutorial:not([data-layout='side']) .board-wrap > .board {
  transform-origin: center center;
  max-width: 100%;
  max-height: 100%;
}
html.futa04-tutorial:not([data-layout='side']) .play {
  min-height: 0;
  overflow: visible;
}
html.futa04-tutorial .cam-fade { opacity: 0 !important; }
/* The campaign's little "LEVEL 1" line: quiet, tracked out, above the instruction. It answers
   "where am I?" without taking any of the one-line instruction budget. */
#futasaku-glass[data-mode='tutorial'][data-kicker]::before {
  content: attr(data-kicker);
  display: block;
  padding: 6px 12px 0;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(243, 230, 196, 0.62);
}
.large-text #futasaku-glass[data-mode='tutorial'][data-kicker]::before {
  font-size: 12px;
  letter-spacing: 0.14em;
}
#futasaku-glass[data-mode='tutorial'] .glass-tutorial { display:flex; flex-direction:column; gap:6px; padding:8px 10px 10px; margin:0; max-width:none;
  min-height:0; border-radius:0; background:transparent; box-shadow:none; pointer-events:none; }
/* One head row: PREVIOUS | title | NEXT/TAP, with full-size touch targets. */
#futasaku-glass[data-mode='tutorial'] {
  --glass-head-h: 44px;
}
.large-text #futasaku-glass[data-mode='tutorial'] { --glass-head-h: 48px; }
#futasaku-glass[data-mode='tutorial'] .glass-head {
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr);
  /* The side slots carry the CTAs, one of which is "DRAW 1 CARD": 11 monospace characters at
     11px inside the left/right third of a 360px glass, which left only ~2px of slack. A 4px gap
     and 6px button padding buy the CTA ~5px of headroom, so it cannot ellipsise if the webfont is
     substituted or not yet applied. */
  align-items:stretch; gap:4px; width:100%; pointer-events:none;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot {
  display:flex; align-items:stretch; min-width:0; min-height:0; height: var(--glass-head-h);
}
#futasaku-glass[data-mode='tutorial'] .glass-head-prev { justify-content:stretch; }
#futasaku-glass[data-mode='tutorial'] .glass-head-title { justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-head-next { justify-content:stretch; }
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button {
  width:100%; height:100%; min-height:0; min-width:0; padding:0 6px; box-sizing:border-box;
  border:1px solid rgba(214,204,177,.22); border-radius:8px;
  background:rgba(255,255,255,.05); color:#f0e9dc;
  font:400 11px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.04em; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  pointer-events:auto;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button:focus-visible { outline:2px solid #e8ddc9; outline-offset:1px; }
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"] {
  background:rgba(233,216,173,.14); border-color:rgba(233,216,173,.45); letter-spacing:.05em;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink {
  animation: tutorial-next-blink 1.15s ease-in-out infinite;
}
@keyframes tutorial-next-blink {
  0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(233,216,173,0); }
  50% { opacity:1; box-shadow:0 0 0 3px rgba(233,216,173,.32); }
}
#futasaku-glass[data-mode='tutorial'] .glass-instruction,
#futasaku-glass[data-mode='guidance'] .glass-instruction { margin:0; display:flex; justify-content:center; align-items:stretch; width:100%; max-width:100%; height:100%; }
#futasaku-glass[data-mode='tutorial'] .glass-led-sr,
#futasaku-glass[data-mode='guidance'] .glass-led-sr {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
#futasaku-glass[data-mode='tutorial'] .glass-led-window,
#futasaku-glass[data-mode='guidance'] .glass-led-window {
  position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden;
  height:100%; min-height:0; width:100%; max-width:100%; padding:3px 6px; box-sizing:border-box;
  border-radius:8px; background:#090c0b;
  box-shadow:inset 0 0 0 1px rgba(166,128,78,.18), inset 0 0 18px rgba(255,195,104,.06);
}
#futasaku-glass[data-mode='tutorial'] .glass-led-window::before,
#futasaku-glass[data-mode='guidance'] .glass-led-window::before {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background-image:radial-gradient(circle,rgba(166,128,78,.18) .65px,transparent .8px);
  background-size:2.3px 3.1px; background-position:0 2.6px;
}
#futasaku-glass[data-mode='tutorial'] .glass-led-cells,
#futasaku-glass[data-mode='guidance'] .glass-led-cells {
  display:block; position:relative; z-index:1; height:30px; width:auto; max-width:100%;
}
.large-text #futasaku-glass[data-mode='tutorial'] .glass-led-window { padding:4px 8px; }
.large-text #futasaku-glass[data-mode='guidance'] .glass-led-window { min-height:38px; padding:5px 8px; }
.large-text #futasaku-glass[data-mode='tutorial'] .glass-led-cells,
.large-text #futasaku-glass[data-mode='guidance'] .glass-led-cells { height:34px; }
/* The levels: one fixed height. The reason line is a touch smaller and always keeps room for two
   lines (owner, 2026-10-19: the reasons are full sentences that must fit in two lines). */
#futasaku-glass[data-mode='tutorial'][data-lesson='1'] .glass-why { font-size:12px; min-height:2.9em; }
#futasaku-glass[data-mode='tutorial'] .glass-why { margin:0; font:400 13px/1.45 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:rgba(240,233,220,.78); letter-spacing:.012em; text-transform:none; text-wrap:pretty; text-align:center; }
#futasaku-glass[data-mode='tutorial'] .glass-status { margin:0; font:400 13px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:#e8ddc9; letter-spacing:.015em; text-align:center; }
/* The level's mission: a quiet pill, not another instruction. */
#futasaku-glass[data-mode='tutorial'] .glass-mission {
  align-self:center; margin:0 0 6px; padding:3px 10px 2px; border:1px solid rgba(233,216,173,.18);
  border-radius:999px; background:rgba(233,216,173,.05); color:rgba(243,230,196,.76);
  font:600 10px/1.35 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.12em; text-transform:uppercase; text-align:center;
}
.large-text #futasaku-glass[data-mode='tutorial'] .glass-mission { font-size:12px; letter-spacing:.09em; }
/* A mission line is the last thing in the window: no stray gap under it. */
#futasaku-glass[data-mode='tutorial'] .glass-mission:last-child { margin-bottom:0; }
/* Large text: the tutorial window's copy follows the same ~18% step the rest of Futasaku takes
   (the Match Intel reference already goes 13px → 15px). The head buttons keep their 11px so the
   longest CTA ("DRAW 1 CARD") can never ellipsise inside a 360px glass. */
.large-text #futasaku-glass[data-mode='tutorial'] .glass-why,
.large-text #futasaku-glass[data-mode='tutorial'] .glass-status { font-size:15px; line-height:1.45; }
#futasaku-glass[data-mode='tutorial'] .glass-icons { display:flex; gap:10px; justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-icons span { font:400 11px/1.15 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:#cbbfa0; letter-spacing:.05em; }
/* Soft settle on the inner column when the lesson step changes (panel transform stays JS-owned). */
#futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial {
  animation: tutorial-glass-settle 280ms cubic-bezier(.22,.72,.24,1);
}
@keyframes tutorial-glass-settle {
  0% { opacity:.88; }
  100% { opacity:1; }
}
#futasaku-glass[data-mode='tutorial'][data-fade='out'] { opacity:.94; }
#futasaku-glass[data-mode='tutorial'][data-fade='in'] { opacity:1; }
#futasaku-glass .glass-chapter { color:#bcae8d; font:600 10px/1.1 monospace; letter-spacing:.16em; white-space:nowrap; }
#futasaku-glass .glass-copy { font-weight:650; letter-spacing:.09em; text-wrap:balance; text-shadow:0 1px 5px rgba(0,0,0,.8); }
#futasaku-glass[data-mode='intel'] { pointer-events:auto; display:flex; flex-direction:column; }
#futasaku-glass .intel-bar { display:flex; align-items:center; gap:8px; padding:4px 6px 2px 12px; min-height:44px; }
#futasaku-glass .intel-step { flex:1; min-width:0; font:600 11px/1 monospace; letter-spacing:.14em; color:#cbbfa0; font-variant-numeric:tabular-nums; }
#futasaku-glass .intel-close { width:44px; height:44px; flex:none; border:0; border-radius:9px; background:transparent; color:#e8ddc9; font-size:23px; line-height:1; cursor:pointer; }
#futasaku-glass .intel-close:focus-visible { outline:2px solid #e8ddc9; }
#futasaku-glass .intel-body { padding:2px 13px 12px; min-height:0; overflow:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:10px; }
#futasaku-glass .intel-readout { display:grid; gap:4px; min-height:58px; padding:10px 0 8px; border-top:1px solid rgba(229,214,183,.10); border-bottom:1px solid rgba(229,214,183,.10); }
#futasaku-glass .intel-who { font:600 10px/1 monospace; letter-spacing:.18em; color:#b7a98a; }
#futasaku-glass .intel-verb { font:700 28px/1.05 monospace; letter-spacing:.08em; color:#f6ecd8; text-shadow:0 1px 8px rgba(0,0,0,.45); }
#futasaku-glass .intel-detail { font:600 13px/1 monospace; letter-spacing:.12em; color:#e2d4b4; min-height:1em; }
#futasaku-glass .intel-nav { display:flex; align-items:center; gap:8px; }
#futasaku-glass .intel-nav button { flex:1; min-height:40px; border:1px solid rgba(214,204,177,.18); border-radius:8px;
  background:rgba(255,255,255,.03); color:#e8ddc9; font:600 11px/1 monospace; letter-spacing:.14em; cursor:pointer; }
#futasaku-glass .intel-nav button:disabled { opacity:.28; cursor:default; }
#futasaku-glass .intel-nav button:not(:disabled):is(:hover,:focus-visible) { background:rgba(255,255,255,.07); outline:none; }
#futasaku-glass .intel-nav button:focus-visible { outline:2px solid #e8ddc9; outline-offset:1px; }
#futasaku-glass .intel-meters { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px 10px; }
#futasaku-glass .intel-meter { display:grid; gap:2px; min-width:0; }
#futasaku-glass .intel-meter span { font:600 9px/1 monospace; letter-spacing:.14em; color:#b7a98a; }
#futasaku-glass .intel-meter b { font:700 14px/1.1 monospace; letter-spacing:.04em; color:#f4ebda; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#futasaku-glass .intel-cards { display:flex; flex-wrap:wrap; align-items:flex-start; gap:5px; }
#futasaku-glass .intel-card-wrap { position:relative; flex:none; }
#futasaku-glass .intel-card { display:block; position:relative; width:26px; height:37px; border-radius:3px; box-sizing:border-box; overflow:hidden; background:#171918; border:1px solid #958a70; }
#futasaku-glass .intel-card .futa04-card-art { position:absolute; inset:0; display:block; border-radius:inherit; background-size:300% 300%; background-repeat:no-repeat; }
#futasaku-glass .intel-card.fruit .futa04-card-art { background-size:cover; background-position:center; }
#futasaku-glass .intel-card .c-num { position:absolute; top:1px; left:2px; z-index:1; font:800 11px/1 monospace; }
#futasaku-glass .intel-card .c-suit { display:none; }
#futasaku-glass .intel-card-count { position:absolute; right:-3px; bottom:-3px; min-width:13px; height:13px; padding:0 2px; border-radius:5px; background:#24221e; border:1px solid #a99c81; font:700 9px/12px monospace; text-align:center; }
#futasaku-glass .intel-observation { margin:0; color:#d3c4a3; font-size:10px; letter-spacing:.09em; }
/* Two tab headings share the bar with the close control. Active state is word + cream
   underline (never colour alone). No borders: the glass already frames the sheet. */
#futasaku-glass .intel-tabs { display:flex; align-items:stretch; gap:2px; flex:1; min-width:0; }
#futasaku-glass .intel-tab { position:relative; flex:1 1 0; min-width:0; min-height:44px; padding:0 8px; border:0;
  background:transparent; color:#b7a98a; font:600 11px/1 monospace; letter-spacing:.14em; cursor:pointer;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#futasaku-glass .intel-tab[aria-selected='true'] { color:#f6ecd8; }
#futasaku-glass .intel-tab[aria-selected='true']::after { content:''; position:absolute; left:10px; right:10px; bottom:5px;
  height:2px; border-radius:1px; background:rgba(233,216,173,.8); }
#futasaku-glass .intel-tab:focus-visible { outline:2px solid #e8ddc9; outline-offset:-2px; border-radius:8px; }
.large-text #futasaku-glass .intel-tab { min-height:48px; font-size:12px; }
/* The moves reference reads as prose in the same face as the tutorial glass copy. */
#futasaku-glass .intel-howto p { margin:0 0 10px; font:400 13px/1.5 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  color:rgba(240,233,220,.82); letter-spacing:.012em; text-wrap:pretty; }
#futasaku-glass .intel-howto p:last-child { margin-bottom:0; }
#futasaku-glass .intel-howto b { color:#f6ecd8; font-weight:650; }
#futasaku-glass .intel-howto i { color:#cbbfa0; }
.large-text #futasaku-glass .intel-howto p { font-size:15px; }
#futasaku-glass[data-mode='guidance'] { pointer-events:auto; display:flex; flex-direction:column; }
#futasaku-glass[data-mode='guidance'] .glass-tutorial { display:flex; flex-direction:column; gap:8px; padding:12px 14px 12px; }
#futasaku-glass[data-mode='guidance'] .glass-actions { display:flex; justify-content:flex-end; pointer-events:auto; }
#futasaku-glass[data-mode='guidance'] .glass-actions button { min-height:44px; min-width:44px; padding:0 12px; border:1px solid rgba(214,204,177,.22);
  border-radius:10px; background:rgba(255,255,255,.05); color:#f0e9dc; font:400 12.5px/1.15 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.03em; cursor:pointer; white-space:nowrap; }
#tutorial-focus { position:fixed; inset:0; z-index:34; pointer-events:none; width:100vw; height:100dvh; overflow:visible;
  opacity:0; transition: opacity 240ms ease; }
#tutorial-focus[data-on='1'] { opacity:1; }
#tutorial-focus[data-fade='out'] { opacity:0; transition: opacity 160ms ease; }
/* Glass + focus live inside #game.screen; raise HUD above both so the menu is never covered.
   The slim HUD is a full-width top strip — keep it pointer-transparent except #hud-menu so
   PREVIOUS/NEXT on the glass stay clickable underneath the empty chrome. */
html.futa04-tutorial .game > .hud,
html.futa04-tutorial.futa04-branding.slim-hud .game > .hud {
  z-index: 45;
  pointer-events: none;
}
html.futa04-tutorial #hud-menu {
  position: relative;
  z-index: 46;
  opacity: 1 !important;
  filter: none !important;
  pointer-events: auto !important;
  visibility: visible !important;
}
html.futa04-tutorial #scrim { z-index: 50; }
html.futa04-tutorial .sheet { z-index: 51; }
/* Lessons: the menu stays above the dim. The map is not padded — the words sit in #lesson-plate. */
html.futa04-lesson .game > .hud,
html.futa04-lesson.futa04-branding.slim-hud .game > .hud {
  z-index: 45;
  pointer-events: none;
}
html.futa04-lesson #hud-menu {
  position: relative;
  z-index: 46;
  pointer-events: auto !important;
}
html.futa04-lesson #scrim { z-index: 50; }
html.futa04-lesson .sheet { z-index: 51; }
/* THE lesson info box: a caption floating over the felt. A soft translucent fill at .77 — no
   border, no outline, no ring, no shadow, no buttons. Flat (no blur: a blur would repaint the
   board underneath on every camera frame). pointer-events:none lets every tap through. */
#lesson-plate {
  position: fixed;
  left: 0; top: 0;
  z-index: 42;
  box-sizing: border-box;
  margin: 0;
  padding: 9px 14px 10px;
  border: 0;
  outline: 0;
  border-radius: 14px;
  background: rgba(14,13,12,.77);
  color: #f0e9dc;
  box-shadow: none;
  pointer-events: none;
  overflow: hidden;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  transition: transform 160ms ease, opacity 180ms ease;
}
#lesson-plate[hidden] { display: none !important; }
#lesson-plate .lesson-copy {
  margin: 0;
  /* One explanation, up to four centred lines on the smallest phone. The placement measures the
     real height once per beat and never lets the box cover the lit target. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  font: 400 12.5px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  color: rgba(240,233,220,.9);
  letter-spacing: .012em;
  text-align: center;
  text-wrap: pretty;
}
/* The smallest phones (320-340 px): half a pixel smaller, so the longest explanation keeps its
   four lines with room to spare (at 12.5px its second line had 0.4px left, and a rounding
   difference pushed the end of the sentence past the four-line clamp). */
@media (max-width: 340px) { #lesson-plate .lesson-copy { font-size: 12px; } }
.large-text #lesson-plate .lesson-copy { font-size: 15px; line-height: 1.4; }
/* The Bloom lesson's static example: three tiny faces per row, inside the SAME caption box.
   No new overlay, no animation, no border of its own; it is sized to stay legible at 360 px. */
#lesson-plate .lesson-example {
  margin: 7px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}
#lesson-plate .lesson-example[hidden] { display: none; }
#lesson-plate .lesson-example-row {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}
#lesson-plate .lesson-example-row[hidden] { display: none; }
#lesson-plate .lesson-example-card {
  --cw: 25px;
  --ch: 34px;
  width: 25px;
  height: 34px;
  padding: 1px 0 2px;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto 1fr;
  justify-items: center;
  align-items: center;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--suit, #f0e9dc) 42%, transparent);
  background: rgba(20, 21, 21, 0.88);
  color: var(--suit, #f0e9dc);
  box-shadow: none;
}
#lesson-plate .lesson-example-card .futa04-card-art { display: none; }
#lesson-plate .lesson-example-card :is(.c-num, .c-suit) { opacity: 1; }
#lesson-plate .lesson-example-card .c-num {
  font: 700 11px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  padding: 0;
}
#lesson-plate .lesson-example-card .c-suit svg { width: 11px; height: 11px; }
.large-text #lesson-plate .lesson-example-card { width: 30px; height: 40px; }
.large-text #lesson-plate .lesson-example-card .c-num { font-size: 13px; }
.large-text #lesson-plate .lesson-example-card .c-suit svg { width: 13px; height: 13px; }
.reduce-motion #lesson-plate .lesson-example-card { transition: none !important; }
.reduce-motion #lesson-plate { transition: none !important; }
/* Plain SVG mask dim — no foreignObject/backdrop-filter (iOS Safari ignores those cutouts
   and the grayscale+brightness crush leaves the board nearly black). */
#tutorial-focus .focus-dim { fill:rgba(0,0,0,.22); }
/* The levels: a NEW idea gets the strong dim; a guide is much lighter; a whisper has no dim at
   all and only pulses the target. Level 1 starts a little stronger than the rest. */
#tutorial-focus[data-tier='spotlight'][data-lesson='1'] .focus-dim { fill:rgba(0,0,0,.45); }
#tutorial-focus[data-tier='guide'] .focus-dim { fill:rgba(0,0,0,.15); }
#tutorial-focus[data-tier='whisper'] .focus-dim { fill:rgba(0,0,0,0); }
#tutorial-focus[data-tier='whisper'] .focus-hole { fill:transparent; }
#tutorial-focus[data-tier='whisper'] .focus-glow-soft { fill:color-mix(in srgb,var(--light-core,#e9d8c5) 10%,transparent); }
#tutorial-focus[data-tier='whisper'] .focus-glow { fill:color-mix(in srgb,var(--light-core,#e9d8c5) 14%,transparent); filter:drop-shadow(0 0 10px var(--light-bloom,rgba(233,216,173,.38))); }
#tutorial-focus[data-lesson='1'] .focus-glow { fill:color-mix(in srgb,var(--light-core,#e9d8c5) 16%,transparent); }
#tutorial-focus[data-lesson='1'] .focus-pointer-body { transform:scale(1.6); transform-origin:10px 1px; stroke:rgba(20,16,10,.85); stroke-width:1.6px; paint-order:stroke; }
/* Contour-free highlight: soft cream fill only — no stroke/ring outline. The ink is the
   published LIGHT tone, so the pointer and the display speak the same colour at low alpha. */
#tutorial-focus .focus-glow { fill:color-mix(in srgb,var(--light-core,#e9d8c5) 10%,transparent); stroke:none; stroke-width:0;
  filter:drop-shadow(0 0 12px var(--light-bloom,rgba(233,216,173,.55))); }
#tutorial-focus .focus-glow-soft { fill:color-mix(in srgb,var(--light-core,#e9d8c5) 18%,transparent); stroke:none; filter:drop-shadow(0 0 16px var(--light-bloom,rgba(233,216,173,.42))); }
/* ONE halo per target. When the target is the display, its own baked bloom IS the highlight;
   when the board already lights it (a top-rank tile's glow), the lesson does not stack a second.
   The paths stay in the DOM (only their ink is cleared), so the pointer's geometry is unchanged. */
#tutorial-focus[data-light-target='display'] :is(.focus-glow,.focus-glow-soft),
#tutorial-focus[data-light-target='lit'] :is(.focus-glow,.focus-glow-soft) { fill:transparent; filter:none; }
#tutorial-focus .focus-lift { transform-box:fill-box; transform-origin:center; }
/* Steady opacity pulse only — never scale (scale + live target breathe looked broken). */
#tutorial-focus[data-pulse='1'] .focus-lift { animation:tutorial-glow-pulse 1.6s ease-in-out infinite; }
@keyframes tutorial-glow-pulse {
  0%,100% { opacity:1; }
  50% { opacity:.72; }
}
#tutorial-focus .focus-pointer { filter:drop-shadow(0 1px 3px rgba(0,0,0,.4)) drop-shadow(0 0 8px var(--light-bloom,rgba(233,216,173,.32))); transform-origin:10px 4px; }
#tutorial-focus .focus-pointer-body { fill:color-mix(in srgb,var(--light-core,#fff) 35%,#fff 65%); stroke:none; }
#tutorial-focus[data-bob='1'] .focus-pointer { animation:tutorial-pointer-tap 1.1s ease-in-out infinite; }
#tutorial-focus[data-bob='hard'] .focus-pointer { animation:tutorial-pointer-tap-hard .85s ease-in-out infinite; }
@keyframes tutorial-pointer-tap { 0%,100% { transform:translate(0,0); } 45% { transform:translate(var(--bob-x,0px),var(--bob-y,7px)); } }
@keyframes tutorial-pointer-tap-hard { 0%,100% { transform:translate(0,0); } 45% { transform:translate(var(--bob-x,0px),var(--bob-y,10px)); } }
#tutorial-focus.nudge .focus-glow-soft { animation:tutorial-nudge .16s ease-out; }
@keyframes tutorial-nudge { 25% { transform:translateX(-4px); } 75% { transform:translateX(4px); } }
.reduce-motion #tutorial-focus .focus-glow, .reduce-motion #tutorial-focus .focus-pointer,
.reduce-motion #tutorial-focus .focus-lift,
.reduce-motion #tutorial-focus.nudge .focus-glow-soft,
.reduce-motion #futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink,
.reduce-motion #futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  #futasaku-glass[data-mode='tutorial'] { transition: opacity 120ms ease; }
  #futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink,
  #futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial { animation:none !important; }
  #tutorial-focus { transition: opacity 120ms ease; }
  #tutorial-focus .focus-glow, #tutorial-focus .focus-pointer,
  #tutorial-focus .focus-lift, #tutorial-focus.nudge .focus-glow-soft { animation:none !important; }
}
/* Bloom explain: soft mid-screen set + run faces (no hard frame — float only). */
#tutorial-bloom-demo {
  position:fixed; inset:0; z-index:36; pointer-events:none; display:flex; align-items:center; justify-content:center;
  padding:max(96px, 14vh) 16px 24px; box-sizing:border-box;
  opacity:0; transition:opacity 280ms ease;
}
#tutorial-bloom-demo[hidden] { display:none; }
#tutorial-bloom-demo[data-on='1'] { opacity:1; }
#tutorial-bloom-demo .tutorial-bloom-stage {
  display:flex; flex-direction:column; gap:22px; align-items:stretch;
  width:min(340px, calc(100vw - 32px)); padding:18px 14px 20px; box-sizing:border-box;
  /* the same dark glass as the tutorial panel, a little denser so the cards read over the board */
  border:1px solid rgba(214,204,177,.16); border-radius:15px; background:rgba(8,10,10,.72);
  box-shadow:inset 0 1px rgba(243,232,202,.07),0 14px 34px rgba(0,0,0,.38);
  backdrop-filter:blur(10px) saturate(1.05); -webkit-backdrop-filter:blur(10px) saturate(1.05);
}
#tutorial-bloom-demo .tutorial-bloom-group + .tutorial-bloom-group {
  padding-top:18px; border-top:1px solid rgba(214,204,177,.1);
}
#tutorial-bloom-demo .tutorial-bloom-group { display:flex; flex-direction:column; gap:8px; align-items:center; }
/* Same face as tutorial glass why-copy (not a mismatched display face). */
#tutorial-bloom-demo .tutorial-bloom-tag {
  margin:0; font:400 13.5px/1.5 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.012em; text-transform:none; color:rgba(240,233,220,.78);
  text-shadow:0 1px 5px rgba(0,0,0,.55);
}
#tutorial-bloom-demo .tutorial-bloom-row {
  display:flex; align-items:flex-end; justify-content:center; gap:8px;
}
#tutorial-bloom-demo .tutorial-bloom-card {
  --cw: clamp(44px, 12vw, 56px); --ch: calc(var(--cw) * 1.42);
  width:var(--cw); height:var(--ch); flex:none;
  transform:translateY(10px) scale(.94); opacity:0;
  box-shadow:0 6px 16px rgba(0,0,0,.38);
}
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card {
  animation:tutorial-bloom-card-in 420ms cubic-bezier(.22,.72,.24,1) forwards;
}
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(1) { animation-delay:40ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(2) { animation-delay:110ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(3) { animation-delay:180ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(1) { animation-delay:260ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(2) { animation-delay:330ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(3) { animation-delay:400ms; }
@keyframes tutorial-bloom-card-in {
  from { opacity:0; transform:translateY(18px) scale(.9); }
  to { opacity:1; transform:translateY(0) scale(1); }
}
.reduce-motion #tutorial-bloom-demo,
.reduce-motion #tutorial-bloom-demo .tutorial-bloom-card { transition:none; animation:none !important; }
.reduce-motion #tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card { opacity:1; transform:none; }
@media (prefers-reduced-motion:reduce) {
  #tutorial-bloom-demo, #tutorial-bloom-demo .tutorial-bloom-card { transition:none; animation:none !important; }
  #tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card { opacity:1; transform:none; }
}
`;Object.freeze([{id:-101,suit:0,rank:3},{id:-102,suit:1,rank:3},{id:-103,suit:2,rank:3}]),Object.freeze([{id:-111,suit:0,rank:4},{id:-112,suit:0,rank:5},{id:-113,suit:0,rank:6}]);var i=e=>r.slice(0,r.indexOf(`#futasaku-glass[hidden]`)).split(`#futasaku-glass`).join(e);export{i as t};