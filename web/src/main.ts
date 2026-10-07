// first: the release channel (the test copy keeps its own storage)
import { IS_TEST, IS_TEST2, FEATURES } from './channel.js';
// Futasaku in the browser. You (player 1) against the computer. All rules come from the
// engine in src/engine; this file only draws, animates and listens. The game state
// lives in a Session; the board on screen is shown through an AnimQueue whose last
// step always matches the real state, so animations can never leave it wrong.
import { apply, bloomGroups, coordKey, hexDistance, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, View } from '../../src/engine/index.js';
import { COACH_STEPS, TUTORIAL_SEED, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import type { Advice, TipId } from '../../src/playtest/coach.js';
import { cutLoss } from './analysis.js';
import { cardName, hexName, moveCards } from './names.js';
import { AnimQueue, captionFor } from './logic/anim.js';
import type { Step } from './logic/anim.js';
import { gameHighlights } from './logic/highlights.js';
import { growControls, isBoardAction, kindCards, kindOf, moveButtons, onlyChoice, playNow, shortKindLabel, sproutKind, targetHexes, targetKinds, usableCards } from './logic/interaction.js';
import { fruitCardState, fruitOffer, hexTapIntent } from './logic/fruitcard.js';
import {
  DESK_IDLE,
  comboFor,
  deskClick,
  deskHover,
  deskShape,
  drawNext,
  bloomEndpoints,
  drawStarts,
  endpointBloom,
  growToward,
  hexAtPoint,
  hexesAlong,
  keyStep,
  onlyPlacement,
  paintEnter,
  paintGhost,
  paintMatch,
  paintProblem,
  paintTap,
  proximity,
  suggestBloom,
  unavailable,
} from './logic/draw.js';
import type { Combo, Desk, Ghost as DrawGhost, Meld, Pt } from './logic/draw.js';
import { TIPS, TIPS_KEY, markTip, parseTips } from './logic/tips.js';
import type { TipId as FirstTip } from './logic/tips.js';
import { finalTurns, scoreBreakdown, turnsLeft } from './logic/endgame.js';
import { breakdownOf, raceShare, raceWords } from './logic/race.js';
import { ambientPlan } from './logic/ambient.js';
import { REPLAY_SPEED, actorOf, involvedKeys, nudgeToward } from './logic/opponent.js';
import { shareCard } from './ui/sharecard.js';
import { perfStart, perfStep } from './logic/perf.js';
import { deckMoment, splashPlan, sporesHome } from './logic/candy.js';
import { CUT_REPLAY_SPEED, cutPlan } from './logic/cut.js';
import type { CutInput } from './logic/cut.js';
import { BOARD_MARGIN, HEIGHTS, SLIM_HUD, boardUnits, computeLayout, fanSlots, setBoardShape, setFixedBoardOrient, setSlimHud, THUMB } from './logic/layout.js';
import type { Thumb } from './logic/layout.js';
import { comboGroups, handOrder, nextSort } from './logic/hand.js';
import { guideTarget } from './logic/guide.js';
import { STATS_KEY, parseStats, recordResult, statsLine } from './logic/stats.js';
import { LEVELS, botSeed } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';
import { LEVEL_INFO } from './logic/levels-ui.js';
import { LEVEL_ICONS } from './ui/levelIcons.js';
import { describe, moveSummary, resultReason, resultTitle } from './logic/log.js';
import { SAVE_KEY, decodeSave, encodeSave } from './logic/persist.js';
import { previewMove } from './logic/preview.js';
import { STUCK_MS, hintFor, hintWeight, isRoutineHint } from './logic/hint.js';
import type { Hint, HintCtx } from './logic/hint.js';
import { CONFIRM_MODES, forecastMove, ghostLinks, needsConfirm, riskLines } from './logic/forecast.js';
import { hapticFor, settleFor, undoPitches } from './logic/feedback.js';
import { pileCountState, pileStates, stackLayers } from './logic/piles.js';
import { renderPileMeter } from './player/pile-meter.js';
import { effectBudget, idleTarget, moveTier, pitchLadder, tierBanner } from './logic/juice.js';
import type { Budget, Tier } from './logic/juice.js';
import { Session } from './logic/session.js';
import type { Played } from './logic/session.js';
import { SETTINGS_KEY, EFFECTS, SPEEDS, parseSettings, speedFactor } from './logic/settings.js';
import { GLOW_SETTINGS } from './logic/topglow.js';
import type { Settings } from './logic/settings.js';
import { THEMES, THEME_IDS, cssVars, resolveColors, themeOf } from './logic/themes.js';
import { DETAILS, MATERIAL_TOKENS, materialLook, materialsOf } from './logic/materials.js';

/** The one look (Ink and glow colours, organic shapes). */
const theme = () => themeOf(settings.palette);
const look = () => materialLook(settings.palette, settings.materialDetail, settings.reduceMotion);
import { opportunities, weakSpots } from './logic/weakspots.js';
import { BoardView, NO_OVERLAY, S, centerOf } from './ui/board.js';
import { setSeedStoneStrength } from './ui/seedstone.js';
let DesignView: typeof BoardView = BoardView;
const branding = typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test2'
  ? await import('./player/branding.js') : null;
branding?.mountBranding();
if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test') {
  await import('./ui/design-v2.css');
  DesignView = (await import('./ui/designBoard.js')).DesignBoardView;
}
// the V3 look (menu -> V3, or ?design=v3; remembered in this channel's own storage): the same
// game on the skinned renderer with the V3 art. Its code loads only when the look is on.
const V3_KEY = 'severgrow.look.v3';
const V3_MODE = FEATURES.v3 && (() => {
  const q = new URLSearchParams(location.search).get('design');
  try {
    if (q === 'v3') localStorage.setItem(V3_KEY, '1');
    return q === 'v3' || localStorage.getItem(V3_KEY) === '1';
  } catch {
    return q === 'v3';
  }
})();
const v3 = V3_MODE ? await Promise.all([import('./ui/skin/SkinBoardView.js'), import('./skins/forestVolcanoV3.js')]) : null;
if (V3_MODE) document.documentElement.classList.add('design-v3');
import type { Overlay } from './ui/board.js';
import { askBot } from './ui/botClient.js';
import { anim, cardFace, createEffects, removeAfter, shakeFrames, suitClass } from './ui/effects.js';
import { fillIcons } from './ui/icons.js';
import { getPixelGrid, setPixelGrid } from './ui/geom.js';
import { onPhotosReady, photosForOrientation, warmPhotos } from './ui/photo.js';
import { getOrient, getRotation, homeRotation, setOrient, setRotation } from './logic/orient.js';
import { Sound, vibrate } from './ui/sound.js';
import { TurnPill } from './ui/turnpill.js';
import { bannerOpts, turnTone } from './logic/turnbanner.js';
import { BLOOM, FRUIT, GAME_TITLE, HOME, OPP, SPROUT, WELCOME, turnsLeftText } from '../../src/strings.js';
import { homeSides } from './logic/home.js';
import { landmarkMotion, strangleFinish } from './logic/landmark.js';
import { pulseLandmark } from './ui/landmarks.js';
import { debugLines, isDebug } from './logic/debug.js';
import { NOTES_KEY, emptyNotes, noteEvent, notesSummary } from './logic/playnotes.js';
import type { NoteEvent, Notes } from './logic/playnotes.js';
import { NOTHING_TO_PLAY, emptyReason, opponentBeats, skipPlan } from './logic/emptyturn.js';
import type { Beats } from './logic/emptyturn.js';

const HUMAN: Player = 0;
const BOT: Player = 1;
if (IS_TEST2) setFixedBoardOrient('flat');
const COACH_KEY_OLD = 'severgrow.coach.enabled';
const BOOT_PARAMS = new URLSearchParams(location.search);
// the test copy's DESIGN version (Lab -> DESIGN): the same game, drawn with the V2 illustrated skin
const DESIGN_MODE = IS_TEST && BOOT_PARAMS.get('design') === '1';
if (DESIGN_MODE) document.documentElement.classList.add('design-v2');

// ---------- small helpers ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: the page still works, it just won't remember */
    }
  },
};
const systemReduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- settings ----------

let settings: Settings = parseSettings(store.get(SETTINGS_KEY), systemReduce());
let stats = parseStats(store.get(STATS_KEY));
const SEEN_KEY = 'severgrow.seen';
const SMOOTH_KEY = 'severgrow.smoother';
/** Polish pass 3: the tile card stays open (pinned) after a tap or long-press, so its buttons can be used. */
let cardPinned = false;
/** v0.5: first-time tips for Fruit and Strengthen, remembered in the browser. */
let tipsSeen = parseTips(store.get(TIPS_KEY));
let tipOpen: FirstTip | null = null;
if (store.get(SETTINGS_KEY) === null && store.get(COACH_KEY_OLD) === '0') settings = { ...settings, coach: false };
const saveSettings = () => store.set(SETTINGS_KEY, JSON.stringify(settings));
// A previous automatic "Smoother mode" could leave this preview on Low effects. Restore
// the normal visual level once; an explicit Reduce motion/device preference still applies.
if (IS_TEST2 && store.get(SMOOTH_KEY) && settings.effects === 'low') {
  settings = { ...settings, effects: 'normal' };
  saveSettings();
}
/** Animation time scale (0 = no animations). */
/** overhaul item 19: Replay plays the opponent's turn a little slower */
let replaying = false;
/** overhaul item 20: after replaying the biggest cut, the result screen comes back */
let reopenGameOver = false;
/** Replay speed: 0.75 for the opponent's turn, 0.5 for the biggest cut (Part 2) */
let replaySpeed = REPLAY_SPEED;
const timeScale = () => speedFactor(settings.speed) * (settings.reduceMotion ? 0.6 : 1) * (replaying ? 1 / replaySpeed : 1);
/** How much things move (0 when reduce motion is on). */
const motion = () => (settings.reduceMotion ? 0 : theme().style.motion);

// ---------- game state ----------

type CoachProgress = { step: number; taught: TipId[]; known: string[]; choice: number; summaryDone: boolean };
const freshCoach = (): CoachProgress => ({ step: 0, taught: [], known: [], choice: 0, summaryDone: false });

let session: Session | null = null;
let coach: CoachProgress = freshCoach();
let log: string[] = [];
let queue = new AnimQueue({});
let shownScores: [number, number] = [0, 0];
const hiddenCards = new Set<number>();
let scars: { key: string; owner: Player; age: number }[] = [];
let inspectKey: string | null = null;
let focusKey: string | null = null;
let showOpps = false;
let gameOverDismissed = false;
let botBusy = false;
let epoch = 0;
let pumping = false;
let cardRects = new Map<number, DOMRect>();

const sound = new Sound();
const boardHandlers = { tap: (k: string) => onHexTap(k), inspect: (k: string | null) => onInspect(k), hold: (k: string) => pinCard(k) };
const boardSvg = $('board') as unknown as SVGSVGElement;
const board = v3 ? new v3[0].SkinBoardView(boardSvg, boardHandlers, v3[1].FOREST_VOLCANO_V3) : DESIGN_MODE ? new DesignView(boardSvg, boardHandlers) : new BoardView(boardSvg, boardHandlers);
// the menu's V3 option: switches the look and reloads (the game in progress is saved)
if (FEATURES.v3) {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'menu-v3';
  b.className = `btn ghost menu-v3${V3_MODE ? ' on' : ''}`;
  b.textContent = V3_MODE ? 'Leave V3' : 'V3';
  b.setAttribute('aria-pressed', String(V3_MODE));
  b.addEventListener('click', () => {
    try {
      if (V3_MODE) localStorage.removeItem(V3_KEY);
      else localStorage.setItem(V3_KEY, '1');
    } catch {
      /* storage blocked: the address carries it */
    }
    const u = new URL(location.href);
    if (V3_MODE) u.searchParams.delete('design');
    else u.searchParams.set('design', 'v3');
    location.href = u.pathname + u.search;
  });
  row.appendChild(b);
  document.querySelector('#menu .menu-buttons')?.appendChild(row);
}
/** Material pass 2: the "Your turn" / "Bot's turn" pill and its faint edge wash. */
const pill = new TurnPill($('turn-pill'), $('edge-wash'));
const announceTurn = (player: Player, label?: string) => {
  const o = bannerOpts(settings);
  document.body.dataset.turn = player === HUMAN ? 'you' : 'opponent';
  pill.show(player, o, label);
  const tone = turnTone(player, o);
  if (tone && settings.sound) sound.turn(tone.notes, tone.gain, tone.ms);
};
const { flash, cutFlash, sparks, spark, drift, ring, stream, boardWrapPoint, floatText, caption, banner, flyCard, flyBack, particles } = createEffects(board, () => timeScale(), () => motion());

const save = () => {
  if (session) store.set(SAVE_KEY, encodeSave({ seed: session.state.seed, actions: session.log, coach, level: gameLevel, base: session.base }));
};

// ---------- the look ----------

function applyTheme() {
  const t = theme();
  const root = document.documentElement;
  root.dataset.theme = t.id;
  for (const [k, v] of Object.entries(cssVars(t))) root.style.setProperty(k, v);
  const mat = materialsOf(t.id);
  for (const k of MATERIAL_TOKENS) root.style.setProperty(`--m-${k}`, mat.colors[k]);
  const lk = look();
  root.style.setProperty('--m-intensity', String(lk.intensity));
  root.style.setProperty('--m-rim', String(lk.rim));
  root.classList.toggle('mat-textures', lk.textures);
  root.classList.toggle('mat-motion', lk.motion);
  if (lk.textures) warmPhotos();
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  // overhaul Part 3: the decorations, all behind one switch (and quiet with Reduce motion)
  root.classList.toggle('eye-candy', settings.eyeCandy);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolveColors(t).bg);
  drawSpores(t.style.spores && !settings.reduceMotion);
  sound.tune(t.style.soundBase, t.style.soundWave);
  if (session) {
    board.setup(session.state.config, session.state.terrain, t.style, look(), t.id);
    lastAmbBoard = null;
  }
  lastBoard = null;
  drawLogo();
  render();
}

/** Seven faint spores at fixed, spread-out places (no randomness needed). */
function drawSpores(on: boolean) {
  const box = $('spores');
  if (!on) return box.replaceChildren();
  if (box.childElementCount) return;
  for (let i = 0; i < 7; i++) {
    const m = document.createElement('i');
    m.style.left = `${(i * 37 + 9) % 100}%`;
    m.style.top = `${100 + ((i * 23) % 30)}%`;
    m.style.setProperty('--t', `${46 + ((i * 13) % 30)}s`);
    m.style.setProperty('--d', `${-((i * 11) % 40)}s`);
    box.appendChild(m);
  }
}

/**
 * Part 3 B: the opening splash: a vein grows from a root to a tile and the game's name appears.
 * Once per visit, about 1.6s, never blocks a tap (a tap ends it), still with Reduce motion.
 */
function showSplash() {
  let shown = false;
  try {
    shown = sessionStorage.getItem('severgrow.splash') === '1';
    sessionStorage.setItem('severgrow.splash', '1');
  } catch {
    shown = true;
  }
  const plan = splashPlan({ reduceMotion: settings.reduceMotion, on: settings.eyeCandy, shownThisVisit: shown });
  if (!plan.show) return;
  const c = resolveColors(theme());
  const box = $('splash');
  box.innerHTML = `<svg viewBox="0 0 220 120" width="260" height="142" aria-hidden="true">
    <path class="sp-vein" d="M40 92 C 70 92, 80 50, 110 52 S 160 30, 182 30" stroke="${c.you}" stroke-width="5" stroke-linecap="round" fill="none" pathLength="100"/>
    <circle cx="40" cy="92" r="13" fill="${c.you}"/><circle cx="40" cy="92" r="6" fill="${c.bg}"/>
    <polygon class="sp-tile" points="182,16 194,23 194,37 182,44 170,37 170,23" fill="${c.you}"/>
  </svg><p class="sp-name">${GAME_TITLE}</p>`;
  box.classList.toggle('still', !plan.animated);
  box.style.setProperty('--sp-ms', `${plan.ms}ms`);
  box.hidden = false;
  const end = () => {
    box.classList.add('out');
    setTimeout(() => (box.hidden = true), 320);
    document.removeEventListener('pointerdown', end, true);
  };
  document.addEventListener('pointerdown', end, true);
  setTimeout(end, plan.ms);
}

/** Part 3 F: the menu's terrarium: a glass dome with a little living board inside (Eye candy). */
function drawTerrarium() {
  const box = $('terrarium');
  if (!settings.eyeCandy) return box.replaceChildren();
  const c = resolveColors(theme());
  const hex = (x: number, y: number, r: number, fill: string, cls = '') => {
    const p = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return `<polygon class="${cls}" points="${p}" fill="${fill}"/>`;
  };
  const tiles = [
    [86, 104, c.you, 'tr-moss'],
    [104, 104, c.you, 'tr-moss d1'],
    [95, 89, c.you, 'tr-moss d2'],
    [122, 104, c.bot, 'tr-lava'],
    [131, 89, c.bot, 'tr-lava d1'],
  ] as const;
  box.innerHTML = `<svg viewBox="0 0 220 140" width="220" height="140" aria-hidden="true">
    <ellipse cx="110" cy="122" rx="78" ry="10" fill="#000" opacity=".25"/>
    <path d="M36 118 Q36 22 110 22 Q184 22 184 118 Z" class="tr-glass"/>
    <rect x="30" y="112" width="160" height="12" rx="6" class="tr-base"/>
    ${tiles.map(([x, y, f, cls]) => hex(x, y, 9.5, f, cls)).join('')}
    <path d="M86 104 L95 89 L104 104" stroke="${c.you}" stroke-width="2" fill="none" opacity=".7"/>
    <circle class="tr-spore" cx="80" cy="70" r="1.6" fill="${c.text}"/><circle class="tr-spore d1" cx="130" cy="60" r="1.3" fill="${c.text}"/><circle class="tr-spore d2" cx="105" cy="48" r="1.2" fill="${c.text}"/>
    <path d="M52 40 Q70 28 92 27" class="tr-shine"/>
  </svg>`;
}

function drawLogo() {
  if (branding) { branding.drawLogo(); return; }
  drawTerrarium();
  const c = resolveColors(theme());
  $('logo').innerHTML = `<svg viewBox="0 0 120 84" width="132" height="92" aria-hidden="true">
    <g stroke="${c.you}" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M60 50 L34 30"/><path d="M60 50 L86 30"/><path d="M60 50 L60 74" stroke-dasharray="2 6"/>
    </g>
    <polygon points="32,12 43,18.5 43,31.5 32,38 21,31.5 21,18.5" fill="${c.you}"/>
    <polygon points="88,12 99,18.5 99,31.5 88,38 77,31.5 77,18.5" fill="${c.bot}"/>
    <circle cx="60" cy="50" r="12" fill="${c.you}"/><circle cx="60" cy="50" r="5.5" fill="${c.bg}"/>
  </svg>`;
}

// ---------- screens and sheets ----------

let openSheet: HTMLElement | null = null;
function showScreen(name: 'menu' | 'levels' | 'game') {
  $('menu').hidden = name !== 'menu';
  $('levels').hidden = name !== 'levels';
  $('game').hidden = name !== 'game';
  if (name === 'levels') {
    renderLevelGrid();
  }
  if (name === 'menu') {
    const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
    const canContinue = !!saved && saved.state.phase !== 'GAME_OVER';
    $('menu-continue').hidden = !canContinue;
    // where I left off: the version, the level and the turn
    if (canContinue) {
      const s = saved!.state;
      const turnNo = Math.ceil(s.turnNumber / 2);
      $('menu-continue').innerHTML = `<span class="vb-name">Continue</span><span class="vb-sub">Level ${saved!.level} · turn ${turnNo}</span>`;
      $('menu-continue').classList.add('version-btn');
    } else $('menu-continue').textContent = 'Continue';
    {
      $('menu-new').classList.toggle('primary', !canContinue);
      $('menu-new').classList.toggle('ghost', canContinue);
    }
    // First visit: point new players at the tutorial.
    const firstVisit = !canContinue && stats.played === 0 && store.get(SEEN_KEY) === null;
    $('menu-welcome').hidden = !firstVisit;
    // Step 7: the first-run welcome card: the three steps of a turn, the goal, the tutorial
    if (firstVisit && !$('menu-welcome').firstChild) {
      $('menu-welcome').innerHTML = `<b class="welcome-title">${WELCOME.title}</b><ol class="welcome-steps">${WELCOME.steps.map((st) => `<li><span class="i" data-icon="${st.icon}"></span><b>${st.name}</b><span>${st.text}</span></li>`).join('')}</ol><p class="welcome-goal">${WELCOME.goal}</p><p class="welcome-tut">${WELCOME.tutorial}</p>`;
      fillIcons($('menu-welcome'));
    }
    $('menu-tutorial').classList.toggle('primary', firstVisit);
    $('menu-tutorial').classList.toggle('ghost', !firstVisit);
    if (firstVisit) {
      $('menu-new').classList.remove('primary');
      $('menu-new').classList.add('ghost');
    }
    // the overall record
    $('menu-stats').textContent = statsLine(stats);
  }
  $('gameover').hidden = true;
  render();
}

function sheet(id: string | null) {
  if (openSheet) openSheet.hidden = true;
  openSheet = id ? $(id) : null;
  // the in-game menu pauses the game; How to play and Settings opened from it keep it paused
  if (id === 'sheet-menu') {
    setPaused(true);
    if (FEATURES.slimHeader) fillMenuStatus();
  }
  else if (id === null) setPaused(false);
  $('scrim').hidden = !openSheet;
  if (openSheet) {
    openSheet.hidden = false;
    if (id === 'sheet-settings') syncSettingsForm();
    if (id === 'sheet-history') renderHistory();
    if (id === 'sheet-howto') renderHowTo();
    openSheet.querySelector<HTMLElement>('[data-close], button')?.focus();
  }
  if (IS_TEST2) {
    document.documentElement.classList.toggle('test2-information-blocked', !!openSheet);
    updateTest2Help();
  }
}

function renderHowTo() {
  const cfg = session?.state.config;
  const sprout = (cfg?.sproutsPerTurn ?? 1) > 0;
  const words = SPROUT;
  const limit = cfg && cfg.maxTurnsPerPlayer > 0 ? ` or after ${cfg.maxTurnsPerPlayer} turns each` : '';
  $('howto-body').innerHTML = [
    `<p><b>Goal:</b> have more points than ${OPP.the} at the end. Each tile scores 1 point, or 2 on a gold hex.</p>`,
    '<p><b>Your turn:</b> draw a card, play cards to grow tiles, then throw one card.</p>',
    `<p><b>Grow:</b>${BLOOM.howto}${sprout ? words.howto : ''}</p>`,
    `<p><b>Painting a bloom:</b> ${TIPS.draw.text} For numbers in a row, the lowest goes on the first hex you paint; “Reverse” flips it. <button type="button" class="link" data-tip="draw">Show tip</button></p>`,
    `<p><b>Strength:</b> a tile is as strong as its card. A stronger tile can replace a weaker ${OPP.noun} tile.</p>`,
    ...(cfg?.allowStrengthen ?? true
      ? [`<p><b>Strengthen:</b> a higher card can replace your own tile to make it stronger. It doesn’t score points, but it’s harder for ${OPP.the} to replace. It uses your ${words.name} for the turn, and it doesn’t stop a cut or Fruit. ${words.strengthenExample} <button type="button" class="link" data-tip="strengthen">Show tip</button></p>`]
      : []),
    ...((cfg?.fruitCardCount ?? 4) > 0
      ? [`<p>${FRUIT.howto.trim()} <i>Example: an ${OPP.noun} 9 blocks your way; play a Fruit card on it and the 9 is gone, with everything that hung on it.</i> <button type="button" class="link" data-tip="fruit">Show tip</button></p>`]
      : []),
    '<p><b>Stay joined:</b> every tile must link back to your home (your tree). Lose a link and everything past it is cut off: tiles cut off from your home wither.</p>',
    `<p><b>Win early:</b> ${HOME.surround.charAt(0).toLowerCase()}${HOME.surround.slice(1)} (all 6 sides).</p>`,
    `<p><b>The end:</b> the game ends when the deck runs out${limit}. Higher score wins; a tie goes to ${OPP.the}.</p>`,
    '<p class="legend"><span class="lg lg-gold">2</span> gold hex (×2) · <span class="lg lg-coach"></span> coach tip · <span class="lg lg-ghost"></span> preview · <span class="lg lg-weak">−4</span> weak link</p>',
    '<p class="legend">A bushier tile or hotter lava means a stronger tile.</p>',
    '<p class="muted">Tap a card to see where it can go. Tap or hold a tile to see what it is worth.</p>',
    '<p class="muted"><b>Keyboard:</b> D draws from the deck, T takes the throw pile, 1-9 pick cards, Tab to the board then arrows and Enter to paint, Backspace removes the last hex, U undoes, Esc cancels.</p>',
  ].join('');
}

/** The 3x3 level screen: number, name, one line, and my wins at that level. */
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
  if (t && (t.dataset.tip === 'fruit' || t.dataset.tip === 'strengthen' || (IS_TEST2 && t.dataset.tip === 'draw'))) showTip(t.dataset.tip);
});

function renderLevelGrid() {
  $('level-grid').replaceChildren(
    ...LEVELS.map((lv) => {
      const b = document.createElement('button');
      b.type = 'button';
      const wins = stats.winsByLevel[lv - 1] ?? 0;
      b.className = `level-tile${settings.level === lv ? ' on' : ''}${lv === 7 ? ' classic' : ''}`;
      b.dataset.level = String(lv);
      b.setAttribute('aria-label', `Level ${lv}, ${LEVEL_INFO[lv].name}${lv === 7 ? `, the classic ${OPP.noun}` : ''}. You won ${wins} time${wins === 1 ? '' : 's'}.`);
      b.innerHTML = `<span class="lt-num num">${lv}</span>${wins ? `<span class="lt-wins num">${wins}</span>` : ''}<span class="lt-icon">${LEVEL_ICONS[lv]}</span><span class="lt-name">${LEVEL_INFO[lv].name}</span>`;
      b.addEventListener('click', () => {
        sound.unlock();
        settings = { ...settings, level: lv };
        saveSettings();
        startGame(randomSeed(), lv);
      });
      return b;
    }),
  );
}

function syncSettingsForm() {
  // Phones whose browser cannot vibrate (all iPhones) get an honest label, not a dead switch.
  const vib = document.querySelector<HTMLInputElement>('[data-setting="vibration"]')!;
  vib.disabled = !('vibrate' in navigator);
  $('vibration-label').textContent = vib.disabled ? 'Vibration (not available on this phone)' : 'Vibration';
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
    input.checked = !!settings[input.dataset.setting as keyof Settings];
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-volume]')) input.value = String(settings[input.dataset.volume as 'sfxVolume' | 'musicVolume']);
  segmented('speed-seg', SPEEDS, settings.speed, (sp) => (sp === 'skip' ? 'Off' : cap(sp)), (sp) => {
    settings.speed = sp;
    if (sp === 'skip') fastForward();
  });
  segmented('palette-seg', THEME_IDS, settings.palette, (id) => THEMES[id].name, (id) => {
    settings.palette = id;
    applyTheme();
  });
  segmented('effects-seg', EFFECTS, settings.effects, cap, (e) => {
    settings.effects = e;
  });
  segmented('detail-seg', DETAILS, settings.materialDetail, cap, (d) => {
    settings.materialDetail = d;
    applyTheme();
  });
  segmented('glow-seg', GLOW_SETTINGS, settings.topGlow, cap, (g) => {
    settings.topGlow = g;
    render();
  });
  // "Confirm moves" (overhaul item 8): Smart asks only for risky moves; low-risk moves play at once with Undo
  segmented('confirm-seg', CONFIRM_MODES, settings.confirmPolicy, (x) => (x === 'smart' ? 'Smart' : cap(x)), (x) => {
    settings.confirmPolicy = x;
  });
}

const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);

/** A row of radio-like buttons for one setting; picking one saves and redraws the form. */
function segmented<T extends string>(id: string, values: readonly T[], current: T, label: (v: T) => string, pick: (v: T) => void) {
  $(id).replaceChildren(
    ...values.map((val) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg-btn${current === val ? ' on' : ''}`;
      b.dataset.value = val;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(current === val));
      b.textContent = label(val);
      b.addEventListener('click', () => {
        pick(val);
        saveSettings();
        syncSettingsForm();
      });
      return b;
    }),
  );
}

// ---------- starting games ----------

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;

function beginSession(state: State, c: CoachProgress | null, log: readonly Action[] = [], base: State | null = null) {
  epoch++;
  for (const w of [...waiters]) w();
  pumping = false;
  session = new Session(state, HUMAN, log, base);
  finalShown = false;
  lastDeckSeen = -1;
  goCounted = false;
  replaying = false;
  coach = c ? { ...c, choice: 0 } : freshCoach(); // the coach shows only its best move
  queue = new AnimQueue(state.board);
  const v = viewFor(state, HUMAN);
  shownScores = [v.score, v.opponentScore];
  hiddenCards.clear();
  scars = [];
  inspectKey = null;
  focusKey = null;
  gameOverDismissed = false;
  botBusy = false;
  board.setup(state.config, state.terrain, theme().style, look(), theme().id);
  lastAmbBoard = null;
  applyLayout();
  lastBoard = null;
  showScreen('game');
  scheduleBot();
}


/** Part 3 G: the opening deal: the hand flies in from the deck, card by card (Eye candy). */
function dealIn() {
  if (!settings.eyeCandy || motion() === 0 || timeScale() === 0) return;
  requestAnimationFrame(() => {
    const from = $('deck').getBoundingClientRect();
    document.querySelectorAll<HTMLElement>('#hand .card').forEach((card, i) => {
      const r = card.getBoundingClientRect();
      anim(card, [{ translate: `${from.left - r.left}px ${from.top - r.top}px`, rotate: '-12deg', opacity: 0 }, { translate: '0 0', rotate: '0deg', opacity: 1 }], { duration: 420 * timeScale(), delay: i * 70 * timeScale(), easing: 'cubic-bezier(.2,.8,.3,1.05)', fill: 'backwards' });
    });
  });
}

/** The test copy's phone extras (thumb layout settings, idle tip): null in the live build. */
/** The test copy's step guidance (the step's word on the map, the step's controls as the hero). */
let placeTeachingPanel: typeof import('./player/overlay-placement.js').placeTeachingPanel | null = null;
let test2Help: ReturnType<typeof import('./player/help.js').mountHelp> | null = null;
let guideMod: ReturnType<typeof import('./player/guide.js').mountGuide> | null = null;
let thumbMod: { side: (w: number, h: number) => 'right' | 'left' | null; tip: (t: string | null, thumbOn: boolean) => void } | null = null;
/** The replay button: hidden in the test copy (its code stays). */
const REPLAY_BUTTON = FEATURES.replay;
/** The test copy: the weak-spot corner icons are gone (their signals live on the map and the tile card). */
if (!FEATURES.weakTools) for (const id of ['tool-weak', 'tool-targets']) document.getElementById(id)?.remove();
// the test copy: the header keeps only the menu button and the score bar; the scores, the turn
// and History move into the menu (no player marks there: the colours say who is who)
if (FEATURES.slimHeader) {
  setSlimHud(true);
  document.documentElement.classList.add('slim-hud');
  const body = document.querySelector('#sheet-menu .sheet-body');
  if (body) {
    const box = document.createElement('div');
    box.id = 'gm-status';
    box.className = 'gm-status';
    box.innerHTML = '<div class="gm-scores"><span class="gm-you"><small>You</small><b class="num" id="gm-score-you">0</b></span><span class="gm-bot"><b class="num" id="gm-score-bot">0</b><small></small></span></div><div class="gm-turn" id="gm-turn"></div><button id="gm-history" class="btn ghost" type="button">What happened</button>';
    box.querySelector('.gm-bot small')!.textContent = OPP.Label;
    body.prepend(box);
    box.querySelector('#gm-history')!.addEventListener('click', () => sheet('sheet-history'));
  }
}
/** The test copy's menu: the scores and the turn, as the header used to show them. */
function fillMenuStatus() {
  const you = document.getElementById('gm-score-you');
  if (!you) return;
  you.textContent = $('score-you').textContent;
  $('gm-score-bot').textContent = $('score-bot').textContent;
  const turn = $('gm-turn');
  turn.className = `gm-turn ${$('turn').className}`;
  turn.innerHTML = $('turn').innerHTML;
}
/** The thumb layout in use (test copy, phones in portrait), or null. */
let thumbLayout: Thumb | null = null;
/** Thumb layout v2, smart overlap: how far (px) the board reaches under the fan right now. */
let thumbOverlap = 0;
let overlapFor: unknown = null;
// the Lab (test copy only: this import is dropped from the live build)
let lab: {
  camera: ReturnType<typeof import('./player/camera.js').installCamera>;
  overrides: () => Partial<RulesConfig>;
  thinking: (on: boolean) => void;
  watchingChanged: (w: { level: number; pause: number } | null) => void;
} | null = null;
let camera: ReturnType<typeof import('./player/camera.js').installCamera> | null = null;
// Literal build guards keep player enhancements out of the legacy bundle.
declare const __CHANNEL__: string;
async function mountPlayerEnhancements() {
  const loads: Promise<unknown>[] = [];
  if (typeof __CHANNEL__ !== 'undefined' && (__CHANNEL__ === 'test' || __CHANNEL__ === 'test2')) {
    placeTeachingPanel = (await import('./player/overlay-placement.js')).placeTeachingPanel;
    loads.push(import('./player/player-css.js').then((m) => {
      const style = document.createElement('style'); style.id = 'player-styles'; style.textContent = m.PLAYER_CSS; document.head.append(style);
      layoutKey = ''; applyLayout(); if (session) render();
    }));
    loads.push(import('./player/thumb.js').then((t) => {
      thumbMod = t.mountThumb({
        relayout: () => {
          layoutKey = '';
          render();
          applyLayout();
        },
        reduceMotion: () => settings.reduceMotion,
      });
      layoutKey = '';
      applyLayout();
      if (session) render();
      // the step guidance (its setting sits under the phone layout rows)
      return import('./player/guide.js').then((g) => {
        guideMod = g.mountGuide({ reduceMotion: () => settings.reduceMotion });
        if (session) render();
      });
    }));
    camera = (await import('./player/camera.js')).installCamera(board.svg, $('board-wrap'), { reduceMotion: () => settings.reduceMotion, changed: () => {} });
  }
  if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test') {
    loads.push(import('./player/fonts.js').then((f) => f.applyFont()));
    loads.push(import('./lab-mode/panel.js').then((m) => {
      lab = m.mountLab({
        sheet,
        play: (_o, level) => startGame(randomSeed(), level as Level),
        watch: (level, green, pause) => startGame(randomSeed(), level as Level, { level: green as Level, pause }),
        setWatch: (w) => {
          watching = w ? { level: w.level as Level, pause: w.pause } : null;
          document.body.classList.toggle('lab-watching', !!watching);
          render();
          scheduleBot();
        },
        board: board.svg,
        boardWrap: $('board-wrap'),
        camera,
      });
    }));
  }

  if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test2') {
    loads.push(import('./player/fonts.js').then((f) => f.applyFont('new')));
  }

  await Promise.all(loads);
  if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test2') {
    (await import('./player/atmosphere.js')).mountAtmosphere();
    (await import('./player/information.js')).mountInformation();
    (await import('./player/cards.js')).mountCards();
    test2Help = (await import('./player/help.js')).mountHelp({ sheet });
    layoutKey = '';
    if (session) render();
  }
}

/**
 * Thumb layout v2, smart overlap (test copy only): the board may reach under the fan's band by
 * up to 15% of its height, but only where every hex under a card is empty or rock, far from
 * anything that could be played there this turn (my network: 4 hexes, a Bloom's reach; the
 * opponent's: 1), with no tile, home, gold hex, target highlight or Bloom painting under a card.
 * Worked out when the board changes (not every frame); a change re-lays the page with a short
 * crossfade. Anything that would end up under a card cancels it at once.
 */
/**
 * The test copy's smart camera (lab-mode/camera.ts): what it needs on every render. DEFAULT_TILE
 * is the classic board's tile (hexagon radius 3) on this screen with the current layout.
 */
function feedCamera(v: View) {
  if (!session || !camera) return;
  const r = board.svg.getBoundingClientRect();
  if (r.width === 0) return;
  // the classic board's drawing area (board units, logic/layout.ts boardUnits for radius 3)
  const halfLong = Math.sqrt(3) * S * 3 + (Math.sqrt(3) / 2) * S + 2;
  const halfShort = 1.5 * S * 3 + S + 2;
  const flat = getOrient() === 'flat';
  const cw = 2 * (flat ? halfShort : halfLong);
  const chh = 2 * (flat ? halfLong : halfShort);
  // (on phones the map runs on under the cards: the window above them is what counts)
  const winH = r.height - (parseFloat(getComputedStyle($('board-wrap')).getPropertyValue('--cam-under')) || 0);
  const defaultTile = Math.sqrt(3) * S * Math.min(r.width / cw, winH / chh);
  const shown = queue.board;
  const tiles = Object.entries(shown).flatMap(([k, t]) => (t ? [{ key: k, owner: t.owner, ...centerOf(k) }] : []));
  const last = session.state.history?.at(-1);
  const recent = !last ? [] : last.t === 'Bloom' ? last.hexes.map((c) => centerOf(coordKey(c))) : 'coord' in last && last.coord ? [centerOf(coordKey(last.coord as { q: number; r: number }))] : [];
  const centres = new Map(Object.keys(v.board).map((k) => [k, centerOf(k)] as const));
  camera.update(
    {
      tiles,
      me: HUMAN,
      recent,
      turnKey: `${session.state.turnNumber}`,
      defaultTile,
      canMove: !busy() && !draw.shape.length && !draw.ptr && draw.desk.phase === 'idle',
    },
    centres,
  );
}

function checkOverlap(v: View) {
  if (!session || !thumbLayout) return;
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const h = Math.round(vv?.height ?? window.innerHeight);
  const cfg = session.state.config;
  const maxHand = cfg.handSize + 1;
  const side = thumbLayout.side;
  // things under a card right now (highlights, a Bloom being painted) cancel it whatever the board
  const live = new Set<string>([...(session.sel.card !== null || session.sel.kind !== null ? targetHexes(v, session.legal, session.sel) : []), ...draw.shape]);
  const key = session.state;
  if (overlapFor === key && live.size === 0) return;
  overlapFor = key;
  const st = session.state;
  const mine: { q: number; r: number }[] = [];
  const theirs: { q: number; r: number }[] = [];
  for (const [k, t] of Object.entries(st.board)) if (t) (t.owner === HUMAN ? mine : theirs).push(parseKey(k));
  const forbidden = (k: string) => {
    const c = parseKey(k);
    if (st.board[k] || st.terrain[k] === 'rich' || live.has(k)) return true;
    return mine.some((m) => hexDistance(m, c) <= 4) || theirs.some((m) => hexDistance(m, c) <= 1);
  };
  const base = computeLayout({ w, h, ...safeArea() }, cfg.boardRadius, maxHand, side, 0);
  // only worth it when the board is held back by the height (else it can't grow)
  let pick = 0;
  // (while the camera is zoomed in, the fan stays below the board: the visible window decides)
  const camWhole = !camera || camera.isWhole();
  if (camWhole && base.board.w < base.zone.w - 1) {
    const most = Math.floor(base.board.h * THUMB.overlapMax);
    for (const f of [1, 0.75, 0.5, 0.25]) {
      const o = Math.floor(most * f);
      if (o < 8) continue;
      const l = computeLayout({ w, h, ...safeArea() }, cfg.boardRadius, maxHand, side, o);
      if (l.orient !== getOrient()) continue;
      const u = boardUnits(cfg.boardRadius, l.orient);
      const t = l.thumb!;
      const cards = fanSlots(t, maxHand).map((p) => ({ x: l.dock.x + p.x, y: l.dock.y + p.y, a: (-p.rot * Math.PI) / 180 }));
      const R = S * 0.95 * l.scale;
      const hw = t.card.w / 2 + R;
      const hh = t.card.h / 2 + R + THUMB.lift;
      const under = (k: string) => {
        const c = centerOf(k);
        const x = l.board.x + (c.x - u.x0) * l.scale;
        const y = l.board.y + (c.y - u.y0) * l.scale;
        return cards.some((cd) => {
          const dx = x - cd.x;
          const dy = y - cd.y;
          const rx = dx * Math.cos(cd.a) - dy * Math.sin(cd.a);
          const ry = dx * Math.sin(cd.a) + dy * Math.cos(cd.a);
          return Math.abs(rx) <= hw && Math.abs(ry) <= hh;
        });
      };
      // the piles sit at the dock's top left: they may lie over the map only where the cards may
      const pl = { x: l.dock.x + t.piles.x, y: l.dock.y + t.piles.y, w: t.piles.w, h: t.piles.h };
      const underPiles = (k: string) => {
        const c = centerOf(k);
        const x = l.board.x + (c.x - u.x0) * l.scale;
        const y = l.board.y + (c.y - u.y0) * l.scale;
        return x > pl.x - R && x < pl.x + pl.w + R && y > pl.y - R && y < pl.y + pl.h + R;
      };
      if (Object.keys(st.board).every((k) => !forbidden(k) || (!under(k) && !underPiles(k)))) {
        pick = o;
        break;
      }
    }
  }
  if (pick !== thumbOverlap) {
    thumbOverlap = pick;
    layoutKey = '';
    // a short crossfade while the board takes its new size
    const wrap = $('board-wrap');
    wrap.classList.remove('relayout-fade');
    void wrap.offsetWidth;
    wrap.classList.add('relayout-fade');
    requestAnimationFrame(() => render());
  }
}

function startGame(seed: number, level: Level = settings.level, watch: { level: Level; pause: number } | null = null) {
  watching = IS_TEST ? watch : null;
  thumbOverlap = 0;
  overlapFor = null;
  if (IS_TEST) {
    document.body.classList.toggle('lab-watching', !!watching);
    lab?.watchingChanged(watching);
  }
  store.set(SEEN_KEY, '1');
  gameLevel = level;
  // the test copy: the Lab's active experiment (none: the classic game)
  const state = newGame(seed, IS_TEST && lab ? lab.overrides() : {});
  log = [`New game against Level ${level} (${LEVEL_INFO[level].name}). You go first.`];
  beginSession(state, null);
  dealIn();
  firstToolTips();
  save();
  announceTurn(HUMAN);
}

function continueGame() {
  const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
  if (!saved) return startGame(randomSeed());
  log = ['Welcome back.'];
  watching = null;
  if (IS_TEST) {
    document.body.classList.remove('lab-watching');
    lab?.watchingChanged(null);
  }
  gameLevel = saved.level;
  beginSession(saved.state, saved.coach, saved.actions, saved.base);
}

// ---------- the coach ----------

let adviceMemo: { key: string; state: State; advice: Advice | null } | null = null;
function currentAdvice(): Advice | null {
  if (!session || session.state.actor !== HUMAN || session.state.phase === 'GAME_OVER') return null;
  const key = `${coach.choice}|${settings.coach}|${coach.step}`;
  if (adviceMemo && adviceMemo.state === session.state && adviceMemo.key === key) return adviceMemo.advice;
  const advice = coachAdvice({ view: session.view, step: coach.step, enabled: settings.coach, taught: coach.taught, known: coach.known }, coach.choice);
  adviceMemo = { key, state: session.state, advice };
  return advice;
}

// ---------- playing moves ----------

function afterPlay(p: Played, by: Player, advice: Advice | null) {
  log.unshift(describe(p.before, p.action, p.after, HUMAN));
  if (p.after.phase === 'GAME_OVER' && p.after.result) {
    log.unshift(`${resultTitle(p.after.result, HUMAN)}. ${resultReason(p.after.result, HUMAN)}`);
    if (p.before.phase !== 'GAME_OVER' && !watching) {
      stats = recordResult(stats, p.after.result, HUMAN, gameLevel);
      store.set(STATS_KEY, JSON.stringify(stats));
    }
  }
  log = log.slice(0, 300);
  if (by === HUMAN) {
    coach.step++;
    if (advice?.tip && !coach.taught.includes(advice.tip.id)) coach.taught.push(advice.tip.id);
    if (advice) coach.known = advice.known;
    coach.choice = 0;
  }
  for (const s of p.steps) if (s.k === 'draw' && s.player === HUMAN && s.card) hiddenCards.add(s.card.id);
  markMoment(p.steps, p.before);
  queue.push(p.steps);
  // the opponent's turn starts: work it out now, so its pace is known when its turn is shown
  if (p.after.phase === 'DRAW' && p.after.turnPlayer === BOT) void planBotTurn(p.after).then((plan) => (botPlan = plan));
  save();
  render();
  void pump();
  scheduleBot();
}

/** The player plays `a` (from Confirm, a single tap, or the coach). */
function humanPlay(a: Action) {
  if (!session) return;
  fastForward();
  const advice = currentAdvice();
  rememberCardRects();
  const p = session.play(a, HUMAN);
  if (!p) return;
  inspectKey = null;
  guideGoal = null;
  afterPlay(p, HUMAN, advice);
  // v0.6: after a Fruit card, another one in hand stays picked, its targets lit (until the throw)
  if (a.t === 'PlayFruit' && session.state.phase === 'ACT') {
    const next = session.legal.find((x) => x.t === 'PlayFruit');
    if (next) {
      session.tapCard(next.card);
      render();
    }
  }
}

/**
 * The opponent's whole turn, worked out at its start (Step 2): each action is the same one the
 * bot would pick step by step (its View and seeded randomness only), so knowing them early only
 * sets the pace: an empty turn (draw, end, throw) is quick, about EMPTY_TURN_MS.
 */
type BotPlan = { keys: string[]; actions: Action[]; beats: Beats };
/** Where a game is: the same turn, phase and number of events means the same position. */
const posKey = (s: State) => `${s.seed}|${s.turnNumber}|${s.phase}|${s.actor}|${s.history?.length ?? 0}`;
let botPlan: BotPlan | null = null;
/** The opponent's empty turn is on show: the draw, throw and next turn start are quick. */
let quickShow: Beats | null = null;
const askFor = (st: State) => askBot(viewFor(st, BOT), gameLevel, botSeed(st.seed, gameLevel, st.turnNumber, st.history?.length ?? 0));
async function planBotTurn(from: State): Promise<BotPlan> {
  const keys: string[] = [];
  const actions: Action[] = [];
  let s = from;
  while (s.phase !== 'GAME_OVER' && s.actor === BOT && s.turnPlayer === BOT && actions.length < 40) {
    const a = await askFor(s);
    keys.push(posKey(s));
    actions.push(a);
    s = apply(s, a);
  }
  return { keys, actions, beats: opponentBeats(actions, timeScale()) };
}

function scheduleBot() {
  if (!session || botBusy) return;
  const st = session.state;
  if (st.phase === 'GAME_OVER') return;
  // the Lab's "Watch a game" (test copy only): a second opponent plays my seat
  if (st.actor !== BOT) return void (IS_TEST && watching && scheduleWatch());
  botBusy = true;
  const my = epoch;
  void (async () => {
    await idle();
    if (my !== epoch || !session) return;
    const started = performance.now();
    thinking = true;
    if (IS_TEST) lab?.thinking(true);
    renderHud();
    const st = session.state;
    if (st.phase === 'DRAW' && st.turnPlayer === BOT && botPlan?.keys[0] !== posKey(st)) botPlan = await planBotTurn(st);
    const i = botPlan ? botPlan.keys.indexOf(posKey(st)) : -1;
    const action = i >= 0 ? botPlan!.actions[i]! : await askFor(st);
    // A short think before the bot's turn and before each tile move; housekeeping is quick.
    const grows = action.t === 'Bloom' || action.t === 'Sprout';
    const beat = i >= 0 ? botPlan!.beats.think[i]! : (grows ? 300 : 90) * timeScale();
    quickShow = i >= 0 && botPlan!.beats.quick ? botPlan!.beats : null;
    const left = beat - (performance.now() - started);
    if (left > 0) await wait(left, my);
    thinking = false;
    if (IS_TEST) lab?.thinking(false);
    pill.botMoved();
    if (my !== epoch || !session) return;
    const p = session.play(action, BOT);
    botBusy = false;
    if (p) afterPlay(p, BOT, null);
    else render();
  })();
}
/** The Lab's "Watch a game": the level playing my seat and the pause after each move (null: I play). */
let watching: { level: Level; pause: number } | null = null;
function scheduleWatch() {
  if (!session || botBusy || !watching) return;
  botBusy = true;
  const my = epoch;
  // something on my side (a skipped animation, a new deal) can restart the step: try again
  const retry = () => {
    botBusy = false;
    if (watching && session) setTimeout(scheduleBot, 60);
  };
  void (async () => {
    await idle();
    if (my !== epoch || !session || !watching) return retry();
    const st = session.state;
    const lvl = watching.level;
    const action = await askBot(viewFor(st, HUMAN), lvl, botSeed(st.seed ^ 0x9e3779b9, lvl, st.turnNumber, st.history?.length ?? 0));
    const grows = action.t === 'Bloom' || action.t === 'Sprout';
    await wait(((grows ? 300 : 90) + (watching?.pause ?? 0)) * timeScale(), my);
    if (my !== epoch || !session || !watching || session.state !== st) return retry();
    const p = session.play(action, HUMAN);
    botBusy = false;
    if (p) afterPlay(p, HUMAN, null);
    else render();
  })();
}
let thinking = false;
/** Which side the header capsule last showed (for its cross-fade). */
let lastTurnKey = '';
/** Whether the ? tip is open. */
/** The bot level of the game being played (kept with the saved game). */
let gameLevel: Level = 7;
let lastBoard: unknown = null;
let lastOverlay = '';
let coachWhyOpen = false;
/** The move the coach's arrow is guiding to (null: no arrow). */
let guideGoal: Action | null = null;

// ---------- the animation player ----------

const waiters = new Set<() => void>();
/** Waits ms, but returns at once if the animations are skipped (epoch changes). */
const wait = (ms: number, my = epoch) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || my !== epoch) return resolve();
    const done = () => {
      clearTimeout(t);
      waiters.delete(done);
      resolve();
    };
    const t = setTimeout(done, ms);
    waiters.add(done);
  });
// Step 7: the pause menu. While it is open the opponent's moves and the animations wait
// (the step in progress finishes; the next one starts after "Back to the game").
let paused = false;
/** v0.7: the list of Bloom choices is open (when there are two or more) */
let bloomMenu = false;
let unpauseWaiters: (() => void)[] = [];
const whilePaused = () => new Promise<void>((resolve) => (paused ? unpauseWaiters.push(resolve) : resolve()));
function setPaused(on: boolean) {
  if (paused === on) return;
  paused = on;
  document.body.classList.toggle('paused', on);
  if (!on) {
    const w = unpauseWaiters;
    unpauseWaiters = [];
    for (const r of w) r();
  }
}
let idleWaiters: (() => void)[] = [];
const idle = () => new Promise<void>((resolve) => (queue.pending === 0 && !pumping ? resolve() : idleWaiters.push(resolve)));
const flushIdle = () => {
  const w = idleWaiters;
  idleWaiters = [];
  for (const r of w) r();
};

/** Shows everything still queued at once and stops running effects. */
function fastForward() {
  if (queue.pending === 0 && !pumping) return;
  epoch++;
  replaying = false;
  board.focus(null);
  for (const w of [...waiters]) w();
  // Finish our own one-off effects (never the endless CSS decorations like the root pulse).
  for (const a of document.getAnimations()) {
    if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) continue;
    const t = a.effect instanceof KeyframeEffect ? a.effect.target : null;
    if (!(t instanceof Element) || !t.closest('.l-fx, .l-tiles, .l-veins, .flyer, #board-wrap, #hand, .hud')) continue;
    try {
      a.finish();
    } catch {
      a.cancel();
    }
  }
  board.fx.replaceChildren();
  document.querySelectorAll('.flyer').forEach((f) => f.remove());
  for (const s of queue.skipAll()) settleStep(s, false);
  pumping = false;
  render();
  flushIdle();
  // A bot turn that was waiting on the animations carries on.
  if (botBusy && !thinking) {
    botBusy = false;
    scheduleBot();
  }
}

/** Book-keeping for a step that is shown (with or without animation). */
function settleStep(s: Step, animated: boolean) {
  if (s.k === 'draw' && s.card) hiddenCards.delete(s.card.id);
  if (s.k === 'sever') scars.push(...s.keys.map((key) => ({ key, owner: s.player, age: 0 })));
  if (s.k === 'turn') scars = scars.map((x) => ({ ...x, age: x.age + 1 })).filter((x) => x.age <= 2);
  if (s.k === 'sync') {
    if (animated) countScores(s.scores);
    else shownScores = [s.scores[HUMAN], s.scores[BOT]];
  }
  if (!animated && s.k === 'sever') caption(captionFor(s, HUMAN)!, s.origin, s.player === HUMAN ? 'bad' : 'good');
}

/** The Grow step that auto-skip already skipped once (after an Undo it asks instead). */
let skippedFrom: State | null = null;
/**
 * Step 2: nothing can grow this turn. With "Auto-skip when nothing to play" on, skip the Grow
 * step and go straight to throwing (an empty turn is two taps: draw, throw). Off, the moves row
 * shows why and a Continue button (renderControls).
 */
function autoAdvance() {
  if (!session || !myTurn() || busy() || session.view.phase !== 'ACT') return;
  if (session.state === skippedFrom) return;
  if (skipPlan(session.legal, session.view.hand.length, settings.autoSkip).kind !== 'auto') return;
  const end = session.legal.find((a) => a.t === 'EndAct');
  if (!end) return;
  skippedFrom = session.state;
  // v0.8: after a sprout or a Fruit card the turn was not empty: go on to the throw quietly
  if (!grewThisTurn()) {
    note({ t: 'empty', at: Date.now() });
    caption(NOTHING_TO_PLAY, null, 'info');
  }
  humanPlay(end);
}

// ---------- the juice budget ----------

type Moment = { tier: Tier; budget: Budget; banner: string | null; chain: number; first: boolean };
const moments = new WeakMap<Step, Moment>();

/** Tags one action's steps with how big the moment is, and which effect in a chain each is. */
function markMoment(steps: readonly Step[], before: State) {
  const tier = moveTier(steps, (k) => before.terrain[k] === 'rich');
  const budget = effectBudget(tier, settings.effects, settings.reduceMotion);
  // Part 2: a cut has its own banner in its payoff (logic/cut.ts), so the move's banner stays quiet
  // (a Fruit card shows its own "Fruited!" in its burst, mine only: the opponent's is calmer)
  const banner = budget.banner && !steps.some((s) => s.k === 'sever' || s.k === 'fruit') ? tierBanner(steps) : null;
  let chain = 0;
  let first = true;
  for (const st of steps) {
    if (st.k !== 'grow' && st.k !== 'sever' && st.k !== 'strangle' && st.k !== 'fruit' && st.k !== 'strengthen') continue;
    moments.set(st, { tier, budget, banner, chain, first });
    chain++;
    first = false;
  }
}
const momentOf = (st: Step): Moment => moments.get(st) ?? { tier: 'none', budget: effectBudget('none', 'normal', false), banner: null, chain: 0, first: false };

/** The big-moment build-up: a short beat (the board draws in), then the impact. */
async function anticipate(m: Moment, f: number, my: number) {
  if (m.budget.anticipationMs <= 0 || !m.first) return;
  anim($('board-wrap'), [{ transform: 'scale(1)' }, { transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { duration: (m.budget.anticipationMs + 120) * f, easing: 'ease-in-out' });
  await wait(m.budget.anticipationMs * f, my);
}

/** The impact of a big moment: shake, thud, banner, vibration, then a brief freeze (hit-stop). */
async function impact(m: Moment, f: number, my: number) {
  const b = m.budget;
  if (b.shake > 0) anim($('board-wrap'), shakeFrames(b.shake * motion()), { duration: 320 * Math.max(f, 0.5) });
  if (b.thud) sound.thud();
  if (b.vibrate) vibrate(settings.vibration, b.vibrate);
  if (m.banner && m.first) banner(m.banner, 'big');
  if (b.hitStopMs > 0) await wait(b.hitStopMs * Math.max(f, 0.5), my);
}

/**
 * Part 4: Smoother mode. While moves animate, frame times are watched; under 50 fps for 3
 * seconds in a row, effects drop to Low (once per device) and a one-time note offers to undo it.
 */
let perf = perfStart();
let perfRaf = 0;
function watchFrames() {
  if (IS_TEST2) return; // no automatic effect downgrade or interruption in Futasaku 0.3
  if (perfRaf || perf.done || settings.effects === 'low' || store.get(SMOOTH_KEY)) return;
  let last = performance.now();
  const tick = (t: number) => {
    const r = perfStep(perf, t - last);
    perf = r.state;
    last = t;
    if (r.drop) {
      perfRaf = 0;
      return smootherMode();
    }
    perfRaf = busy() ? requestAnimationFrame(tick) : 0;
  };
  perfRaf = requestAnimationFrame(tick);
}
function smootherMode() {
  const before = settings.effects;
  settings = { ...settings, effects: 'low' };
  saveSettings();
  store.set(SMOOTH_KEY, '1');
  const note = $('smoother');
  note.hidden = false;
  $('smoother-undo').onclick = () => {
    settings = { ...settings, effects: before };
    saveSettings();
    note.hidden = true;
    render();
  };
  $('smoother-keep').onclick = () => (note.hidden = true);
}

async function pump() {
  if (pumping) return;
  pumping = true;
  watchFrames();
  const my = epoch;
  while (queue.pending > 0) {
    if (my !== epoch) return;
    await whilePaused();
    if (my !== epoch) return;
    if (timeScale() === 0) {
      fastForward();
      return;
    }
    await playStep(queue.peek()!, my);
  }
  if (my !== epoch) return;
  pumping = false;
  replaying = false;
  board.focus(null);
  if (reopenGameOver) {
    reopenGameOver = false;
    gameOverDismissed = false;
  }
  render();
  flushIdle();
}

async function playStep(step: Step, my: number) {
  const f = timeScale();
  const m = motion();
  // Overhaul item 19: the opponent's actions: the rest of the board dims a little, and the
  // view leans 1.5% toward the action (none with Reduce motion)
  const actor = actorOf(step);
  const involved = involvedKeys(step);
  if (actor === BOT && involved.length) {
    board.focus(involved);
    if (m > 0) {
      const n = nudgeToward(involved, 200, 170);
      const w = $('board-wrap').getBoundingClientRect();
      anim($('board-wrap'), [{ translate: '0 0' }, { translate: `${(n.x * w.width).toFixed(1)}px ${(n.y * w.height).toFixed(1)}px`, offset: 0.4 }, { translate: '0 0' }], { duration: 900 * f, easing: 'ease-in-out' });
    }
  } else if (actor !== null) board.focus(null);
  const show = () => {
    if (my !== epoch) return false;
    queue.next();
    settleStep(step, true);
    render();
    return true;
  };
  switch (step.k) {
    case 'draw': {
      if (!show()) return;
      if (step.player === HUMAN && step.card) {
        const hp = hapticFor('draw', settings);
        if (hp) vibrate(true, hp as number | number[]);
        const to = document.querySelector<HTMLElement>(`#hand [data-card="${step.card.id}"]`);
        const from = (step.from === 'deck' ? $('deck') : $('discard')).getBoundingClientRect();
        if (to) {
          const r = to.getBoundingClientRect();
          anim(to, m === 0 ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: `${from.left - r.left}px ${from.top - r.top}px`, scale: '0.7', rotate: '-8deg', opacity: 0.3 }, { translate: `${(from.left - r.left) * 0.45}px ${(from.top - r.top) * 0.45 - 46 * m}px`, scale: '0.95', rotate: '4deg', opacity: 1, offset: 0.55 }, { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 }], { duration: 420 * f, easing: 'cubic-bezier(.3,.7,.3,1)' });
        }
        sound.click();
        await wait(240 * f, my);
      } else {
        flyBack($('deck'), document.querySelector<HTMLElement>('.score.bot')!, f);
        await wait(quickShow ? quickShow.show.draw : 120 * f, my);
      }
      return;
    }
    case 'grow': {
      const by = step.player;
      const mo = momentOf(step);
      const b = mo.budget;
      await anticipate(mo, f, my);
      if (!show()) return;
      const per = (step.style === 'bloom' ? 60 : 0) * f;
      // v0.7: a Bloom pops outward from its first hex (the lowest number), a quick staggered ripple
      const cx = centerOf(step.tiles[0]!.key).x;
      const cy = centerOf(step.tiles[0]!.key).y;
      const pop = mo.tier === 'big' ? 1.6 : mo.tier === 'medium' ? 1.25 : 1; // stronger ripple for bigger moments
      let last = 0;
      step.tiles.forEach((t, i) => {
        const tileEl = board.tile(t.key);
        const p = centerOf(t.key);
        const delay = step.style === 'bloom' ? (Math.hypot(p.x - cx, p.y - cy) / (S * 1.7)) * per : 0;
        last = Math.max(last, delay);
        const st = settleFor(t.strength ?? 1, session?.state.config.maxRank ?? 9);
        // Squash and stretch: a quick pop that overshoots and settles.
        const frames: Keyframe[] =
          m === 0 || b.fadeOnly
            ? [{ opacity: 0 }, { opacity: 1 }]
            : step.style === 'sprout'
              ? [{ transform: 'scale(0)' }, { transform: `scale(${1 + 0.32 * m}, ${1 + 0.18 * m})`, offset: 0.55 }, { transform: `scale(${1 - 0.06 * m}, ${1 + 0.04 * m})`, offset: 0.8 }, { transform: 'scale(1)' }]
              : [{ transform: `translateY(${-st.drop * m}px) scale(0.15)`, opacity: 0 }, { transform: `translateY(0) scale(${1 + (0.05 + st.squash) * m * pop}, ${1 - st.squash * 0.5 * m})`, opacity: 1, offset: 0.62 }, { transform: `scale(${1 - 0.04 * m}, ${1 + 0.03 * m})`, offset: 0.84 }, { transform: 'scale(1)' }];
        anim(tileEl, frames, { duration: (step.style === 'sprout' ? 460 : st.ms) * f, delay, easing: 'cubic-bezier(.2,.8,.3,1.1)', transformOrigin: 'center' } as KeyframeAnimationOptions);
        // overhaul item 17: blades spring up, a puff of spores (mine) as it lands, a heavier tap for the top rank
        if (m > 0 && !b.fadeOnly) {
          tileEl?.classList.add('spring');
          setTimeout(() => tileEl?.classList.remove('spring'), delay + 900 * f);
          if (b.particles > 0 && by === HUMAN && !t.replaced) drift(t.key, delay + st.ms * 0.55 * f, f, st.heavy ? 3 : 1);
        }
        const hp = hapticFor(st.heavy ? 'placeTop' : 'place', settings);
        if (hp && by === HUMAN && (st.heavy || i === 0)) setTimeout(() => vibrate(true, hp as number | number[]), delay + st.ms * 0.6 * f);
        if (t.replaced) {
          // The bot's tile dissolves into sparks as mine takes its place.
          sparks(t.key, by === HUMAN ? 'bot' : 'you', delay, f, Math.max(4, Math.round(b.particles / Math.max(step.tiles.length, 1))));
          setTimeout(() => sound.sparks(), delay);
        } else if (mo.tier === 'big' && b.particles > 0) sparks(t.key, by === HUMAN ? 'you' : 'bot', delay, f, Math.round(b.particles / step.tiles.length));
        if (session?.state.terrain[t.key] === 'rich') sound.chime(delay / 1000 + 0.08);
      });
      if (mo.tier === 'small' && b.particles > 0) spark(step.tiles[0]!.key, 120 * f, f);
      sound.grow(pitchLadder(step.tiles.length, mo.chain), per || 60);
      // Part 3 D: a few spores drift home to my root from what I just grew (Eye candy)
      if (settings.eyeCandy && by === HUMAN && m > 0 && b.particles > 0) {
        const home = sporesHome(step.tiles.map((t) => t.key), board.rootKey(HUMAN));
        if (home.length) setTimeout(() => stream(home.map((s) => s.from), board.rootKey(HUMAN), f, Math.min(6, home.length + 2)), last + 380 * f);
      }
      if (b.float && by === HUMAN) floatText(`+${step.tiles.length}`, step.tiles[Math.floor(step.tiles.length / 2)]!.key, 'good', f);
      const cap = captionFor(step, HUMAN);
      if (cap && !(mo.banner && mo.first)) caption(cap, step.tiles[Math.floor(step.tiles.length / 2)]!.key, by === HUMAN ? 'good' : 'info');
      if (mo.tier === 'big') await impact(mo, f, my);
      await wait(last + 420 * f, my);
      return;
    }
    case 'sever': {
      // Part 2: the cinematic cut, played from the pure plan (logic/cut.ts)
      const mine = step.player === HUMAN;
      const mo = momentOf(step);
      const victim = Object.values(queue.board).filter((t) => t && t.owner === step.player && !t.root).length;
      // the caption comes first, so it is there however the cut ends (played, skipped, interrupted)
      caption(captionFor(step, HUMAN)!, step.origin, mine ? 'bad' : 'good');
      await playCut({ origin: step.origin, keys: step.keys, victimTiles: victim, mine }, mo.first || mo.chain === 0, mo.chain, f, my);
      if (my !== epoch) return;
      show();
      return;
    }
    case 'remove': {
      for (const k of step.keys) anim(board.tile(k), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 * f, fill: 'forwards' });
      await wait(320 * f, my);
      show();
      return;
    }
    case 'strengthen': {
      // Level up: a quick pulse, a thin ring expanding, the number ticks up, a small solid thud.
      const mo = momentOf(step);
      const top = step.to >= (session?.state.config.maxRank ?? 9);
      if (!show()) return;
      const tileEl = board.tile(step.key);
      if (m > 0 && !mo.budget.fadeOnly) anim(tileEl, [{ transform: 'scale(1)' }, { transform: `scale(${1 + 0.16 * m})`, offset: 0.35 }, { transform: `scale(${1 - 0.03 * m})`, offset: 0.7 }, { transform: 'scale(1)' }], { duration: 420 * f, easing: 'cubic-bezier(.2,.8,.3,1.1)', transformOrigin: 'center' } as KeyframeAnimationOptions);
      if (m > 0) ring(step.key, f, top);
      const num = tileEl?.querySelector('.tile-num');
      if (num && step.to > step.from) {
        const stone = IS_TEST2 ? tileEl?.querySelector<SVGGElement>('.seed-stone') ?? null : null;
        const setShown = (value: number) => stone ? setSeedStoneStrength(stone, value) : (num.textContent = String(value));
        const n = step.to - step.from;
        for (let i = 1; i <= n; i++) setTimeout(() => setShown(step.from + i), (i * 260 * f) / n);
        setShown(step.from);
      }
      if (settings.sound) sound.thud();
      if (top && mo.budget.particles > 0) sparks(step.key, step.player === HUMAN ? 'you' : 'bot', 120 * f, f, Math.min(8, mo.budget.particles));
      vibrate(settings.vibration && settings.effects !== 'low', 12);
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, step.key, step.player === HUMAN ? 'good' : 'info');
      await wait(560 * f, my);
      return;
    }
    case 'fruit': {
      // v0.6 Fruit card: the card lifts and flies to the tile, the tile swells like a pod, then
      // bursts (a spore puff, a thud, "Fruited!"); the cut that follows is its own steps.
      // The opponent's version is calmer: no banner, a caption instead.
      const mo = momentOf(step);
      const b = mo.budget;
      const mine = step.player === HUMAN;
      const tileEl = board.tile(step.target);
      const to = tileEl?.getBoundingClientRect();
      const from = mine ? cardRects.get(step.card.id) : document.querySelector<HTMLElement>('.score.bot')!.getBoundingClientRect();
      if (from && to && m > 0) {
        flyCard(step.card, from, to, f * (mine ? 1 : 1.2));
        await wait(380 * f, my);
      }
      await anticipate(mo, f, my);
      // the pod swells (a plain fade with Reduce motion)
      anim(tileEl, m === 0 || b.fadeOnly ? [{ opacity: 1 }, { opacity: 0.85 }] : [{ transform: 'scale(1)' }, { transform: `scale(${1 + 0.14 * m})`, offset: 0.7 }, { transform: `scale(${1 + 0.1 * m})` }], { duration: 300 * f, fill: 'forwards', easing: 'ease-out', transformOrigin: 'center' } as KeyframeAnimationOptions);
      await wait(300 * f, my);
      // the burst: spores puff out, a soft thud
      if (b.particles > 0) sparks(step.target, mine ? 'you' : 'bot', 0, f, Math.max(6, Math.round(b.particles / (mine ? 2 : 3))));
      flash(step.target, f, false);
      if (settings.sound) sound.thud();
      {
        const hp = hapticFor('throw', settings);
        if (hp && mine) vibrate(true, hp as number | number[]);
      }
      anim(tileEl, m === 0 || b.fadeOnly ? [{ opacity: 0.85 }, { opacity: 0 }] : [{ opacity: 1, transform: `scale(${1 + 0.1 * m})` }, { opacity: 0, transform: `scale(${1 + 0.35 * m})` }], { duration: 260 * f, fill: 'forwards', easing: 'ease-in', transformOrigin: 'center' } as KeyframeAnimationOptions);
      if (mine && b.banner) banner(FRUIT.banner, 'big');
      await impact(mo, f, my);
      const cap = captionFor(step, HUMAN);
      if (cap && !(mine && b.banner)) caption(cap, step.target, mine ? 'good' : 'bad');
      await wait(220 * f, my);
      show();
      return;
    }
    case 'discard': {
      // The opponent's card is represented by the pile update; its old flight crossed the
      // player's board and felt like a card thrown at the camera.
      const from = step.player === HUMAN ? cardRects.get(step.card.id) : null;
      if (from) flyCard(step.card, from, $('discard').getBoundingClientRect(), f);
      if (step.player === HUMAN) {
        const hp = hapticFor('throw', settings);
        if (hp) vibrate(true, hp as number | number[]);
      }
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, null, 'info');
      await wait(quickShow && step.player === BOT ? quickShow.show.discard : 320 * f, my);
      show();
      return;
    }
    case 'strangle': {
      const root = board.rootKey(step.loser);
      // Step 4: the Strangle finish (never over 2.0s at Normal): the surrounding tiles pulse
      // inward, a slow beat, then the volcano is smothered by moss while my tree blooms, or my
      // tree withers while the volcano roars. Tap or Skip jumps to the end state.
      const loserEl = board.homeEls[step.loser];
      const winnerEl = board.homeEls[step.loser === HUMAN ? BOT : HUMAN];
      const beats = strangleFinish({ speed: f, reduceMotion: settings.reduceMotion }, step.loser === HUMAN ? 'tree' : 'volcano');
      const rc = centerOf(root);
      for (const b of beats) {
        if (b.k === 'pulse') {
          for (const k of board.boardKeys) {
            const tileEl = board.tile(k);
            const p = centerOf(k);
            if (!tileEl || k === root || Math.hypot(p.x - rc.x, p.y - rc.y) > S * 1.9) continue;
            anim(tileEl, [{ translate: '0 0' }, { translate: `${(rc.x - p.x) * 0.14 * Math.max(m, 0.3)}px ${(rc.y - p.y) * 0.14 * Math.max(m, 0.3)}px`, offset: 0.45 }, { translate: '0 0' }], { duration: b.ms });
          }
          sound.snap();
        } else if (b.k === 'smother' || b.k === 'wither') {
          loserEl?.classList.add('strangled');
          loserEl?.classList.remove('idle', 'danger', 'worried', 'show-ring');
          if (b.k === 'smother') sound.sigh();
          else sound.grind();
        } else if (b.k === 'bloom' || b.k === 'roar') {
          winnerEl?.classList.add('won');
          if (winnerEl) pulseLandmark(winnerEl, 'tapped');
        }
        await wait(b.ms, my);
      }
      if (!beats.length) loserEl?.classList.add('strangled');
      await impact(momentOf(step), f, my);
      caption(captionFor(step, HUMAN)!, root, step.loser === HUMAN ? 'bad' : 'good');
      await wait(400 * f, my);
      show();
      return;
    }
    case 'turn': {
      if (!show()) return;
      announceTurn(step.player, step.player === HUMAN && step.final ? 'Your last turn' : undefined);
      // My turn starts: a soft glow passes over my hand.
      if (step.player === HUMAN) anim($('hand'), [{ filter: 'drop-shadow(0 0 0 transparent)' }, { filter: 'drop-shadow(0 -4px 10px color-mix(in srgb, var(--c-text) 30%, transparent))', offset: 0.4 }, { filter: 'drop-shadow(0 0 0 transparent)' }], { duration: 900 * Math.max(f, 0.5) });
      // an empty opponent turn starts at once (its quick beats are in its plan)
      const oppQuick = step.player === BOT && session && botPlan?.beats.quick && botPlan.keys[0] === posKey(session.state);
      const quick = oppQuick ? 0 : quickShow && step.player === HUMAN ? quickShow.show.turn : null;
      if (step.player === HUMAN) quickShow = null;
      await wait(quick ?? 320 * f, my);
      return;
    }
    case 'end': {
      if (!show()) return;
      const won = step.result.winner === HUMAN;
      sound.fanfare(won);
      {
        const hp = hapticFor(won ? 'win' : 'lose', settings);
        if (hp) vibrate(true, hp as number | number[]);
      }
      if (won) {
        // A fuller flourish: soft flashes and a ring of sparks from my root (within the cap).
        // three soft rings, at most 3 a second (photosensitivity)
        for (let i = 0; i < 3; i++) setTimeout(() => flash(board.rootKey(HUMAN), f, false), i * 340 * Math.max(f, 1));
        const spend = effectBudget('big', settings.effects, settings.reduceMotion).particles;
        if (spend) sparks(board.rootKey(HUMAN), 'you', 300 * f, f * 1.4, spend);
      }
      await wait(800 * f, my);
      return;
    }
    case 'sync':
      show();
      return;
  }
}

/** Overhaul item 14: the tug-of-war bar follows the shown scores (so it moves with the count-up). */
function setRace(s: readonly [number, number]) {
  const race = $('race');
  const share = raceShare(s[0], s[1]).toFixed(3);
  if (race.style.getPropertyValue('--share') !== share) race.style.setProperty('--share', share);
  race.setAttribute('aria-label', raceWords(s[0], s[1], OPP.Label));
}

/** Overhaul item 14: tap a score to see what it is made of (tap again or anywhere to close). */
function showBreakdown(p: Player) {
  const pop = $('score-pop');
  if (!session || (!pop.hidden && pop.dataset.p === String(p))) {
    pop.hidden = true;
    return;
  }
  const b = breakdownOf(session.state, p);
  pop.dataset.p = String(p);
  pop.className = `score-pop ${p === HUMAN ? 'you' : 'bot'}`;
  pop.replaceChildren(
    Object.assign(document.createElement('b'), { textContent: p === HUMAN ? 'Your score' : `${OPP.Label} score` }),
    ...b.lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })),
  );
  pop.hidden = false;
}

let lastAmbBoard: State['board'] | null = null;
let lastAmbKey = '';

/**
 * Part 2: plays one cut from its plan (logic/cut.ts): anticipation, hit-stop with a small local
 * flash and a micro zoom, the vein pulse, the snap and shake, the ripple of dying tiles (moss
 * withers, lava cools and crumbles), the scar, and the payoff. `quiet`: no payoff (Fruit).
 */
async function playCut(c: CutInput, first: boolean, chain: number, f: number, my: number, quiet = false) {
  const plan = cutPlan(c, { speed: f, reduceMotion: settings.reduceMotion || motion() === 0, effects: settings.effects }, first);
  document.documentElement.dataset.cutTier = plan.tier; // (read by the filmstrip tool: where the cut starts)
  const at = (ms: number, fn: () => void) => setTimeout(() => my === epoch && fn(), ms);
  const wrap = $('board-wrap');
  const P = board.screenPoint(c.origin);
  const W = wrap.getBoundingClientRect();
  const origin = `${(P.x - W.left).toFixed(0)}px ${(P.y - W.top).toFixed(0)}px`;
  const keys = new Set(c.keys);
  // the veins' blur glow draws a black box in Chrome while tiles animate under it; it is also the
  // costliest thing on the board, so it rests during the cut (the next redraw brings it back)
  document.querySelectorAll('svg.board .veins[filter]').forEach((g) => g.removeAttribute('filter'));
  if (!quiet) sound.duck(plan.duckMs);
  for (const s of plan.stages) {
    switch (s.name) {
      case 'anticipation':
        anim(wrap, [{ scale: '1' }, { scale: '0.988' }, { scale: '1' }], { duration: s.dur + 80 * f, easing: 'ease-in-out', transformOrigin: origin } as KeyframeAnimationOptions);
        break;
      case 'flash':
        at(s.at, () => cutFlash(c.origin, plan.flash.ms, plan.flash.alpha, plan.flash.radius));
        break;
      case 'zoom':
        at(s.at, () => anim(wrap, [{ scale: '1' }, { scale: String(plan.zoom), offset: 0.35 }, { scale: '1' }], { duration: s.dur * 2, easing: 'ease-out', transformOrigin: origin } as KeyframeAnimationOptions));
        break;
      case 'pulse':
        at(s.at, () => {
          for (const v of board.veinsTouching(keys)) {
            v.classList.add('snapping');
            anim(v, [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0.15, offset: 0.7 }, { opacity: 0 }], { duration: s.dur + 200 * f, fill: 'forwards' });
          }
        });
        break;
      case 'snap':
        at(s.at, () => {
          sound.snap(2 ** ((2 * chain) / 12));
          if (plan.shakePx > 0) anim(wrap, shakeFrames(plan.shakePx), { duration: 260 * Math.max(f, 0.5) });
          const hp = plan.haptic && hapticFor(plan.haptic, settings);
          if (hp && !quiet) vibrate(true, hp as number | number[]);
        });
        break;
      case 'crumble':
        at(s.at, () => {
          if (!quiet) sound.sad();
        });
        break;
      case 'payoff':
        if (!quiet)
          at(s.at, () => {
            floatText(plan.float, c.origin, c.mine ? 'bad' : 'good', f);
            if (plan.banner) banner(plan.banner, c.mine ? 'calm' : 'big');
          });
        break;
      default:
        break;
    }
  }
  // the ripple: each tile dies in its own material
  const motes = settings.effects === 'low' || plan.stages[0]?.name === 'fade' ? 0 : plan.tier === 'huge' ? 2 : 1;
  for (const t of plan.tiles) {
    const el = board.tile(t.key);
    const lava = queue.board[t.key]?.owner === BOT;
    if (!el) continue;
    const frames: Keyframe[] =
      plan.stages[0]?.name === 'fade'
        ? [{ opacity: 1 }, { opacity: 0 }]
        : lava
          ? // lava: a last flare, then it cools (the withering style darkens it) and sinks into crumbs
            [{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.15 }, { opacity: 0.9, transform: 'scale(0.96)', offset: 0.55 }, { opacity: 0, transform: 'scale(0.7) translateY(3px)' }]
          : // moss: it dries (the withering style), curls a little and drops away
            [{ opacity: 1, transform: 'scale(1) rotate(0deg)' }, { opacity: 0.95, transform: 'scale(0.95)', offset: 0.45 }, { opacity: 0, transform: `scale(0.6) rotate(${t.ring % 2 ? 8 : -8}deg) translateY(4px)` }];
    el.classList.add('withering');
    anim(el, frames, { duration: t.dur, delay: t.at, fill: 'forwards', easing: 'ease-in', transformOrigin: 'center' } as KeyframeAnimationOptions);
    if (motes) drift(t.key, t.at + t.dur * 0.5, f, motes);
  }
  await wait(plan.total, my);
}

/** the result screen's count-up plays once per game */
let goCounted = false;

/** the final-turns banner shows once per game */
let finalShown = false;

let scoreRaf = 0;
function countScores(to: [number, number]) {
  const target: [number, number] = [to[HUMAN], to[BOT]];
  const start: [number, number] = [...shownScores];
  if (start[0] === target[0] && start[1] === target[1]) return;
  const t0 = performance.now();
  const dur = 600 * Math.max(timeScale(), 0.3);
  cancelAnimationFrame(scoreRaf);
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    shownScores = [Math.round(start[0] + (target[0] - start[0]) * k), Math.round(start[1] + (target[1] - start[1]) * k)];
    $('score-you').textContent = String(shownScores[0]);
    $('score-bot').textContent = String(shownScores[1]);
    setRace(shownScores);
    if (k < 1) scoreRaf = requestAnimationFrame(tick);
  };
  scoreRaf = requestAnimationFrame(tick);
  // A fast tick, then a tiny bounce on the final number.
  const bounce: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.45 }, { transform: 'scale(0.96)', offset: 0.75 }, { transform: 'scale(1)' }];
  if (target[0] !== start[0]) anim($('score-you'), bounce, { duration: 360, delay: dur });
  if (target[1] !== start[1]) anim($('score-bot'), bounce, { duration: 360, delay: dur });
}

// ---------- rendering ----------

const busy = () => queue.pending > 0 || pumping;
const myTurn = () => !!session && session.state.actor === HUMAN && session.state.phase !== 'GAME_OVER';

/** Test2's idle prompt yields for every active move, including Bloom painting without a card. */
function updateTest2MoveActive() {
  if (!IS_TEST2) return;
  const active = !!session && !$('game').hidden && (busy() || session.sel.card !== null || session.sel.hex !== null || session.sel.kind !== null || !!session.pending || !!draw.shape.length || draw.desk.phase === 'live' || !!draw.ptr);
  document.documentElement.classList.toggle('test2-move-active', active);
  document.documentElement.dataset.test2Bloom = String(!!session?.sel.kind?.startsWith('bloom-'));
  document.documentElement.dataset.test2Waiting = String(myTurn() && !busy() && !watching);
  document.documentElement.dataset.test2Turn = String(session?.state.turnNumber ?? '');
}

// ---------- idle hint ----------
// After about 8 seconds without a tap on my turn, the next control pulses very gently.
// One quiet pulse, no sound, no nagging; any tap or change clears it.
let idleTimer: ReturnType<typeof setTimeout> | undefined;
function armIdle() {
  clearTimeout(idleTimer);
  document.querySelectorAll('.idle-hint').forEach((e) => e.classList.remove('idle-hint'));
  if (!session || busy()) return;
  const t = idleTarget(session.view.phase, myTurn(), !!session.pending);
  if (!t) return;
  idleTimer = setTimeout(() => {
    const el = t === 'deck' ? $('deck') : t === 'confirm' ? $('confirm-play') : $('hand');
    el.classList.add('idle-hint');
  }, 8000);
}

/** Polish pass 3: hands the top-rank glow its settings when they change. */
let glowKey = '';
function syncGlow() {
  const o = { setting: settings.topGlow, effects: settings.effects, reduceMotion: settings.reduceMotion };
  const k = JSON.stringify(o);
  if (k === glowKey) return;
  glowKey = k;
  board.setGlow(o);
}

function render() {
  applyLayout();
  syncGlow();
  updateTest2MoveActive();
  if (!session || $('game').hidden) return;
  armIdle();
  const v = session.view;
  const advice = myTurn() && !busy() ? currentAdvice() : null;
  document.documentElement.style.setProperty('--anim', String(timeScale()));
  renderHud();
  const combo = drawCombo();
  if (!combo && (draw.shape.length || draw.desk.phase === 'live' || draw.msg)) draw = { ...DRAW0 };
  // exactly one place for this line or clump: show it ready, with Confirm (nothing to draw)
  if (combo && !session.pending && !draw.shape.length && draw.desk.phase === 'idle' && !draw.redraw) {
    const only = onlyPlacement(combo);
    if (only) session.preset(only);
  }
  board.setDrawing(!!combo, drawHandlers);
  renderBoard(v, advice);
  if (combo) paintDraw();
  else $('draw-info').hidden = true;
  renderControls(v, advice);
  $('dock').classList.toggle('confirming', !$('confirm').hidden);
  renderHand(v, advice);
  renderPiles(v, advice);
  if (IS_TEST2) requestAnimationFrame(() => { alignDrawPiles(); alignHandGlow(); });
  if (FEATURES.smartCamera && camera) {
    // what I am working on: the map (a card picked, painting, the opponent's turn) or the cards
    const mapFocus = !myTurn() || busy() || draw.shape.length > 0 || !!draw.ptr || session.sel.card !== null || session.sel.hex !== null;
    document.documentElement.dataset.focus = mapFocus ? 'map' : 'cards';
    feedCamera(v);
  }
  if (FEATURES.phoneLayout && thumbLayout) checkOverlap(v);
  // the test copy: the step's tip, faintly over the board after a few idle seconds (my turn, no
  // animation, no Bloom being painted)
  if (FEATURES.guidance && guideMod) {
    // the step, from the game's own state: whose turn it is and the phase
    const st = session.state;
    const over = st.phase === 'GAME_OVER';
    const step = over || watching ? null : st.actor !== HUMAN ? 'opp' : st.phase === 'DRAW' ? 'draw' : st.phase === 'DISCARD' ? 'throw' : 'grow';
    guideMod.update({ step, turn: st.turnNumber, picked: session.sel.card !== null });
  }
  renderCoach(advice);
  renderGameOver();
  renderGuide(advice);
  renderFirstTip(v);
  updateTest2Help();
  if (!IS_TEST2 && placeTeachingPanel && thumbLayout) {
    const keys = targetHexes(v, session.legal, session.sel);
    requestAnimationFrame(() => {
      placeTeachingPanel?.($('first-tip'), keys);
      placeTeachingPanel?.($('coach'), keys);
    });
  }
  if (myTurn() && !busy() && v.phase === 'ACT' && !autoQueued) {
    autoQueued = true;
    setTimeout(() => {
      autoQueued = false;
      autoAdvance();
    }, 250);
  }
}
let autoQueued = false;
/** Optional teaching yields to the player's move and to other sheets. */
function updateTest2Help() {
  test2Help?.update({ blocked: !session || busy() || (!!openSheet && openSheet.id !== 'sheet-test2-help') || !!session?.pending || !!draw.shape.length || cardPinned || session?.state.phase === 'GAME_OVER' });
}


/** The coach's arrow: points at the one thing to tap next for the suggested move. */
function renderGuide(advice: Advice | null) {
  const arrow = $('guide-arrow');
  arrow.hidden = true;
  if (!session || !guideGoal || !advice || !myTurn() || busy() || openSheet) return;
  if (JSON.stringify(advice.action) !== JSON.stringify(guideGoal)) {
    guideGoal = null;
    return;
  }
  let t = guideTarget(session.view, session.legal, session.sel, guideGoal, session.pending);
  if (t?.kind === 'preset') {
    // A line or clump: the coach shows its placement on the board, ready to confirm.
    if (IS_TEST2) draw = { ...DRAW0 };
    session.preset(guideGoal);
    render();
    return;
  }
  if (IS_TEST2 && t?.kind === 'confirm' && session.pending?.t === 'Bloom') {
    // Only an explicit demonstrated placement is ready; a bare inspected hex still needs
    // the player to choose the Bloom group before drawing its shape.
    t = session.presetMove?.t === 'Bloom'
      ? { kind: 'hex', key: coordKey(session.presetMove.hexes[0]!) }
      : { kind: 'kind', move: kindOf(session.pending)! };
  } else if (FEATURES.tapAgain && t?.kind === 'confirm' && session.pending) {
    const card = moveCards(session.pending)[0];
    if (card !== undefined) t = { kind: 'card', id: card };
  }
  if (!t) {
    guideGoal = null;
    return;
  }
  let rect: { x: number; y: number } | null = null;
  const above = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 4 };
  };
  switch (t.kind) {
    case 'card':
      rect = above(document.querySelector(`#hand [data-card="${t.id}"]`));
      break;
    case 'hex':
      rect = board.screenPoint(t.key);
      rect = { x: rect.x, y: rect.y - 6 };
      break;
    case 'confirm':
      rect = above($('confirm-play'));
      break;
    case 'cancel':
      rect = above(document.querySelector('#confirm-cancel:not([hidden]), #moves .cancel') ?? $('confirm-cancel'));
      break;
    case 'deck':
      rect = above($('deck'));
      break;
    case 'discard':
      rect = above($('discard'));
      break;
    case 'end':
      rect = above(document.querySelector('#moves .end'));
      break;
    case 'button':
      rect = above(document.querySelector('#moves .btn.primary'));
      break;
    case 'kind': {
      const el = document.querySelector<HTMLElement>(`#moves [data-kind="${t.move}"]`);
      rect = above(el && el.offsetParent ? el : document.querySelector('#moves .bloom-toggle'));
      break;
    }
  }
  if (!rect) return;
  arrow.hidden = false;
  arrow.dataset.target = t.kind === 'card' ? `card:${t.id}` : t.kind === 'hex' ? `hex:${t.key}` : t.kind === 'kind' ? `kind:${t.move}` : t.kind;
  arrow.style.left = `${rect.x}px`;
  arrow.style.top = `${rect.y}px`;
}

/** The hidden ?debug=1 corner: the only place the game's random number shows. */
const DEBUG = isDebug(location.search);
// Step 10: local playtest notes (?debug=1 only; kept in this browser, never sent anywhere)
let notes: Notes = DEBUG ? ((): Notes => {
  try {
    const n = JSON.parse(store.get(NOTES_KEY) ?? '') as Notes;
    return Array.isArray(n?.events) ? n : emptyNotes();
  } catch {
    return emptyNotes();
  }
})() : emptyNotes();
let notedPlayer: Player | null = null;
function note(e: NoteEvent) {
  if (!DEBUG) return;
  notes = noteEvent(notes, e);
  store.set(NOTES_KEY, JSON.stringify(notes));
}
if (DEBUG) {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as Element | null;
      const where = t?.closest('#hand') ? 'hand' : t?.closest('#board-wrap') ? 'board' : t?.closest('.piles') ? 'piles' : t?.closest('#moves') ? 'moves' : t?.closest('.dock') ? 'dock' : 'other';
      if (session && myTurn()) note({ t: 'input', at: Date.now(), where });
    },
    true,
  );
  const exp = document.createElement('button');
  exp.type = 'button';
  exp.className = 'btn small ghost debug-export';
  exp.textContent = 'Export as JSON';
  exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ summary: notesSummary(notes), events: notes.events }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playtest-notes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.body.append(exp);
}
function renderDebug(st: State) {
  if (!DEBUG) return;
  // my turns start and end (for the notes)
  if (st.turnPlayer !== notedPlayer) {
    if (notedPlayer === HUMAN) note({ t: 'turnEnd', at: Date.now() });
    if (st.turnPlayer === HUMAN && st.phase !== 'GAME_OVER') note({ t: 'turnStart', at: Date.now() });
    notedPlayer = st.turnPlayer;
  }
  const el = $('debug-corner');
  el.hidden = false;
  const sm = notesSummary(notes);
  el.textContent = [
    ...debugLines({ seed: st.seed, turnNumber: st.turnNumber, level: gameLevel }),
    `my turns ${sm.turns} · ${(sm.avgTurnMs / 1000).toFixed(1)} s each`,
    `undo ${sm.undos} · empty turns ${sm.emptyTurns}`,
    sm.longestPause ? `longest pause ${(sm.longestPause.ms / 1000).toFixed(1)} s (then: ${sm.longestPause.before})` : 'longest pause -',
  ].join('\n');
}

function renderHud() {
  if (!session) return;
  const st = session.state;
  renderDebug(st);
  if (!busy()) shownScores = [session.view.score, session.view.opponentScore];
  $('score-you').textContent = String(shownScores[0]);
  $('score-bot').textContent = String(shownScores[1]);
  const scoreKey = `${shownScores[0]}:${shownScores[1]}:${document.documentElement.className}`;
  if (scoreKey !== lastScoreFit) {
    lastScoreFit = scoreKey;
    fitHudNames();
  }
  setRace(shownScores);
  const over = st.phase === 'GAME_OVER' && !busy();
  // Overhaul item 15: the final turns: a calm vignette and a softer ambient sound; one short banner
  const ft = finalTurns(session.view);
  const finalOn = ft.final && st.phase !== 'GAME_OVER';
  document.documentElement.classList.toggle('final-turns', finalOn);
  sound.setCalm(finalOn);
  if (finalOn && !finalShown && !busy() && st.actor === HUMAN && ft.banner) {
    finalShown = true;
    banner(ft.banner, 'calm');
  }
  const turn = $('turn');
  turn.className = `turn ${over ? 'over' : st.turnPlayer === HUMAN ? 'you' : 'bot'}${thinking ? ' thinking' : ''}`;
  const turnKey = over ? 'over' : `${st.turnPlayer}`;
  if (turnKey !== lastTurnKey && lastTurnKey !== '' && !settings.reduceMotion && settings.speed !== 'skip') anim(turn, [{ opacity: 0.25 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
  lastTurnKey = turnKey;
  turn.innerHTML = over
    ? '<b>Game over</b>'
    : `<b>${st.turnPlayer === HUMAN ? (watching ? `Green turn (Level ${watching.level})` : 'Your turn') : thinking ? `${OPP.Label} turn<span class="dots"><i></i><i></i><i></i></span>` : `${OPP.Label} turn`}</b><small>Level ${gameLevel} · ${turnsLeftText(turnsLeft(session.view))}</small>`;
  // The dock's hint line: always there (one fixed row), saying what to do next.
  const hint = dockHint(session.view);
  const hintEl = $('hint');
  if (hintEl.dataset.text !== hint.text || hintEl.dataset.arrow !== String(hint.arrow)) {
    hintEl.dataset.text = hint.text;
    hintEl.dataset.arrow = String(hint.arrow);
    // Step 3 item 11: one calm line, no floating triangle
    hintEl.innerHTML = '<span class="hint-text"></span>';
    hintEl.querySelector('.hint-text')!.textContent = hint.text;
  }
  updateHintWeight();
}

/**
 * Positioning pass: the hint is at full weight for my first 3 turns, then quieter; it comes back
 * at full weight when it says something unusual, or when I've tapped nothing for about 6 s on
 * my turn (I may be stuck).
 */
let lastInputAt = Date.now();
let stuckTimer = 0;
document.addEventListener('pointerdown', () => {
  lastInputAt = Date.now();
  updateHintWeight();
}, { capture: true, passive: true });
function updateHintWeight() {
  if (!session) return;
  const el = $('hint');
  const text = el.dataset.text ?? '';
  const mine = session.state.actor === HUMAN && session.state.phase !== 'GAME_OVER';
  const idle = mine ? Date.now() - lastInputAt : 0;
  const w = hintWeight({ myTurns: Math.ceil(session.state.turnNumber / 2), idleMs: idle, routine: isRoutineHint(text) });
  el.classList.toggle('quiet', w === 'quiet');
  clearTimeout(stuckTimer);
  if (w === 'quiet' && mine) stuckTimer = window.setTimeout(updateHintWeight, Math.max(50, STUCK_MS - idle + 20));
}

/** In the default game (Rot and Knock off) throwing a card ends the turn. */
const discardEndsTurn = (v: View) => !v.config.rotEnabled && !v.config.knockEnabled && !v.finalTurn;

/** The dock's one-line hint (overhaul item 13 shortens and sharpens it). */
function dockHint(v: View): Hint {
  if (!session) return { text: '', arrow: null };
  const h = hintFor(hintCtx(v));
  if (IS_TEST2 && session.presetMove?.t === 'Bloom') return { text: 'Tap a glowing hex to bloom', arrow: 'up' };
  if (IS_TEST2 && session.sel.card === null && session.sel.kind === null && (session.pending?.t === 'Bloom' || session.pending?.t === 'Sprout')) return { text: 'Pick a card or Bloom', arrow: 'down' };
  // the test copy: no Confirm box; a second tap on the card or the hex places the move
  if (FEATURES.tapAgain && session.pending && h.text.startsWith('Confirm,')) return { ...h, text: 'Tap again to place it' };
  return h;
}

// ---------- the layout (overhaul items 1-2): fixed dock, board fits the rest ----------

/** The safe-area insets (notch, home bar), read from CSS env() through a probe element. */
function safeArea() {
  const probe = document.getElementById('safe-probe') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'safe-probe' }));
  const cs = getComputedStyle(probe);
  const px = (s: string) => parseFloat(s) || 0;
  return { safeTop: px(cs.paddingTop), safeBottom: px(cs.paddingBottom), safeLeft: px(cs.paddingLeft), safeRight: px(cs.paddingRight) };
}

let firstToolTips: () => void = () => {};
let layoutKey = '';
/** Draw brings the two pile instruments toward the first hand card, without moving
 * their counters separately or letting them cover the cockpit's action buttons. */
function alignDrawPiles() {
  const box = document.getElementById('test2-box');
  const piles = box?.querySelector<HTMLElement>(':scope > .piles');
  if (!box || !piles) return;
  if (document.documentElement.dataset.step !== 'draw' || document.documentElement.dataset.thumb === 'left') {
    piles.style.setProperty('--test2-draw-shift', '0px');
    return;
  }
  const handCard = document.querySelector<HTMLElement>('#hand .card');
  const actions = document.getElementById('test2-actions');
  if (!handCard) return;
  // offsetLeft is layout geometry, so the calculation stays steady while the group animates.
  const baseLeft = box.getBoundingClientRect().left + piles.offsetLeft;
  const desired = handCard.getBoundingClientRect().left - baseLeft;
  const rightLimit = Math.min(window.innerWidth - 8, (actions?.getBoundingClientRect().left ?? window.innerWidth) - 8);
  const room = Math.max(0, rightLimit - baseLeft - piles.offsetWidth);
  piles.style.setProperty('--test2-draw-shift', `${Math.round(Math.max(0, Math.min(desired, room)))}px`);
}
/** Bound the turn backlight to the visible card fan. On phones #hand occupies the whole
 * dock, so percentages of that container let the old glow spill far below the cards. */
function alignHandGlow() {
  const hand = document.getElementById('hand');
  if (!hand) return;
  const cards = [...hand.querySelectorAll<HTMLElement>('.card')].filter(card => card.getClientRects().length && getComputedStyle(card).visibility !== 'hidden');
  if (!cards.length) return;
  const origin = hand.getBoundingClientRect();
  const rects = cards.map(card => card.getBoundingClientRect());
  const left = Math.min(...rects.map(rect => rect.left));
  const right = Math.max(...rects.map(rect => rect.right));
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  // Place the backlight at the outside of the fan; its hollow centre keeps
  // colour from pooling between overlapping translucent cards.
  const insetX = 2;
  const insetY = 2;
  hand.style.setProperty('--test2-hand-glow-x', `${Math.round(left - origin.left + insetX)}px`);
  hand.style.setProperty('--test2-hand-glow-y', `${Math.round(top - origin.top + insetY)}px`);
  hand.style.setProperty('--test2-hand-glow-w', `${Math.round(Math.max(1, right - left - insetX * 2))}px`);
  hand.style.setProperty('--test2-hand-glow-h', `${Math.round(Math.max(1, bottom - top - insetY * 2))}px`);
}
/** Sets the layout's sizes as CSS variables; only when the viewport (or board size) changes. */
function applyLayout() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const h = Math.round(vv?.height ?? window.innerHeight);
  const radius = session?.state.config.boardRadius ?? 3;
  // the Lab (test copy): a board of any shape fits by the box around its tiles
  const shapeCfg = session?.state.config;
  setBoardShape(shapeCfg?.board ? { cells: shapeCfg.board.cells, rot: (o) => homeRotation(o, shapeCfg, HUMAN) } : null);
  // the test copy's thumb layout (phones in portrait, the setting on): sized for the game's hand
  const thumbSide = FEATURES.phoneLayout && thumbMod ? thumbMod.side(w, h) : null;
  const maxHand = (shapeCfg?.handSize ?? 7) + 1;
  const key = `${w}x${h}r${radius}d${window.devicePixelRatio || 1}b${shapeCfg?.board ? shapeCfg.board.cells.length + shapeCfg.board.homes.join() : ''}t${thumbSide ?? ''}${thumbSide ? `${maxHand}o${thumbOverlap}` : ''}`;
  // phones: the board sits just above the dock (board.setup resets this, so set it every time);
  // the thumb layout puts it at the bottom of its zone (at most 24pt above the cards)
  const par = FEATURES.phoneLayout && thumbMod?.side(w, h) ? 'xMidYMax meet' : 'xMidYMid meet';
  if (board.svg.getAttribute('preserveAspectRatio') !== par) board.svg.setAttribute('preserveAspectRatio', par);
  if (key === layoutKey) return;
  layoutKey = key;
  const l = thumbSide ? computeLayout({ w, h, ...safeArea() }, radius, maxHand, thumbSide, thumbOverlap) : computeLayout({ w, h, ...safeArea() }, radius);
  if (branding) Object.assign(l, branding.polishLayout(l, { w, h, ...safeArea() }, radius));
  const thumbWas = thumbLayout;
  thumbLayout = l.thumb ?? null;
  if (thumbLayout) {
    document.documentElement.dataset.thumb = thumbLayout.side;
    const r = document.documentElement.style;
    const t = thumbLayout;
    for (const [name, b] of [['deck', t.deck], ['discard', t.discard], ['moves', t.moves], ['undo', t.undo], ['sort', t.sort], ['tips', t.tips]] as const) {
      r.setProperty(`--t-${name}-x`, `${b.x.toFixed(1)}px`);
      r.setProperty(`--t-${name}-y`, `${b.y.toFixed(1)}px`);
      r.setProperty(`--t-${name}-w`, `${b.w.toFixed(1)}px`);
      r.setProperty(`--t-${name}-h`, `${b.h.toFixed(1)}px`);
    }
    r.setProperty('--t-pile-w', `${t.pileCard.w}px`);
    r.setProperty('--t-overlap', `${Math.max(0, l.zone.y + l.zone.h - l.dock.y).toFixed(1)}px`);
    r.setProperty('--t-gap', `${Math.max(0, l.zone.y + l.zone.h - (l.board.y + l.board.h)).toFixed(1)}px`);
    r.setProperty('--t-pile-h', `${t.pileCard.h}px`);
    if (thumbOverlap > 0) document.documentElement.dataset.fanOver = '1';
    else delete document.documentElement.dataset.fanOver;
  } else {
    delete document.documentElement.dataset.thumb;
    delete document.documentElement.dataset.fanOver;
  }
  if (thumbWas !== thumbLayout && session) queueMicrotask(() => render());
  // Step 3: the board's orientation (points left-right or up-down), whichever gives bigger
  // tiles; a turn of the board is a full redraw (rendering only: the game state never changes)
  document.documentElement.dataset.orient = l.orient;
  // Positioning pass: the board also turns (steps of 60 degrees) so the homes sit on the centre
  // line, and the tile centres snap to device pixels (every gap the same); display only
  const cfg = session?.state.config ?? newGame(1).config;
  const rot = homeRotation(l.orient, cfg, HUMAN);
  const grid = 1 / (l.scale * (window.devicePixelRatio || 1));
  const familyChanged = l.orient !== getOrient();
  if (familyChanged || rot !== getRotation() || Math.abs(grid - getPixelGrid()) > 1e-9) {
    setOrient(l.orient);
    setRotation(rot);
    setPixelGrid(grid);
    if (familyChanged) photosForOrientation();
    if (session) {
      board.setup(session.state.config, session.state.terrain, theme().style, look(), theme().id);
      lastAmbBoard = null;
      lastBoard = null;
      layoutKey = key;
      render();
    }
  }
  const root = document.documentElement.style;
  const px = (n: number) => `${Math.round(n)}px`;
  root.setProperty('--hud-h', px(FEATURES.slimHeader ? SLIM_HUD : HEIGHTS.hud));
  root.setProperty('--race-h', px(FEATURES.slimHeader ? 0 : HEIGHTS.race));
  root.setProperty('--dock-h', px(l.dock.h));
  root.setProperty('--dock-w', px(l.dock.w));
  root.setProperty('--board-margin', `${BOARD_MARGIN}px`);
  for (const [k, v] of Object.entries(l.rows)) root.setProperty(`--row-${k}`, px(v));
  root.setProperty('--pile-card-h', `${l.parts.pileCard.h.toFixed(1)}px`);
  root.setProperty('--centre-w', `${l.parts.hint.w.toFixed(1)}px`);
  root.setProperty('--pile-col', `${l.parts.deck.w.toFixed(1)}px`);
  root.setProperty('--cw', px(l.card.w));
  root.setProperty('--slice', px(l.card.slice));
  document.documentElement.dataset.layout = l.mode;
  board.svg.setAttribute('preserveAspectRatio', l.thumb ? 'xMidYMax meet' : 'xMidYMid meet');
  fitHudNames();
  if (IS_TEST2) requestAnimationFrame(() => { alignDrawPiles(); alignHandGlow(); });

}
window.addEventListener('resize', () => applyLayout());
window.visualViewport?.addEventListener('resize', () => applyLayout());

/**
 * Positioning pass: the score bar keeps "You" and "Opponent" only while both fit their (equal)
 * columns; otherwise both words go together (the marks, colours, aria-labels and the tooltip
 * still say whose score it is). Never a cut-off word.
 */
let lastScoreFit = '';
function fitHudNames() {
  const hud = document.querySelector<HTMLElement>('.hud');
  if (!hud) return;
  hud.classList.remove('names-off', 'tight');
  const over = () => [...hud.querySelectorAll<HTMLElement>('.score')].some((e) => e.scrollWidth > e.clientWidth + 1); // 1px: rounding of a fractional column
  if (!over()) return;
  hud.classList.add('names-off');
  // still too wide (Large text, three-digit scores on a 360px phone): smaller numbers and a
  // narrower pill, both sides alike
  if (over()) hud.classList.add('tight');
}

/** The moment, summarised for the hint line (overhaul item 13; the wording lives in logic/hint.ts). */
function hintCtx(v: View): HintCtx {
  const sel = session!.sel;
  const pending = session!.pending;
  const dc = drawCombo();
  const kinds = sel.card !== null ? new Set(targetKinds(v, session!.legal, sel).values()) : null;
  return {
    phase: v.phase,
    myTurn: v.actor === HUMAN,
    busy: busy(),
    words: SPROUT,
    deckCount: v.deckCount,
    canTakeThrow: session!.legal.some((a) => a.t === 'Draw' && a.from === 'discard'),
    // a picked Fruit card: the "any strength" note, or why it has nothing to do (never "grow")
    fruit: kinds?.has('fruit')
      ? { firstTime: anyNoteCard === sel.card }
      : v.hand.find((c) => c.id === sel.card)?.suit === null
        ? { firstTime: false, reason: fruitCardState(v, session!.legal, sel.card!).reason }
        : null,
    pending: !pending ? null : sproutKind(v, pending) === 'strengthen' ? 'strengthen' : dc ? 'drawn' : 'board',
    drawing: dc ? { n: dc.n, fine: finePointer() } : null,
    card: kinds ? { single: sel.kind === 'sprout', grow: kinds.has('grow'), replace: kinds.has('replace'), strengthen: kinds.has('strengthen') } : null,
    kindPicked: sel.kind !== null,
    hexWithNoMove: sel.hex !== null,
    handEmpty: v.hand.length === 0,
    canSprout: session!.legal.some((a) => a.t === 'Sprout'),
    canCombo: session!.legal.some((a) => a.t === 'Bloom'),
    bloomBlocked: (() => {
      const groups = bloomGroups(v.hand);
      return groups.length ? Math.min(...groups.map((g) => g.cards.length)) : null;
    })(),
    throwEndsTurn: v.phase === 'DISCARD' && discardEndsTurn(v),
    fruitReady: session!.legal.some((a) => a.t === 'PlayFruit'),
    grew: grewThisTurn(),
  };
}

/** v0.8: what used my sprout this turn (a Fruit card uses it too): the last such move since my draw. */
function grewThisTurn(): null | 'sprout' | 'fruit' {
  const log = session!.log;
  for (let i = log.length - 1; i >= 0; i--) {
    const a = log[i]!;
    if (a.t === 'Draw' || a.t === 'EndAct' || a.t === 'Discard') return null;
    if (a.t === 'PlayFruit') return 'fruit';
    if (a.t === 'Sprout') return 'sprout';
  }
  return null;
}

/**
 * UX pass: the hexes the opponent grew on or strengthened on its last turn, shown at the start
 * of my turn until I change the board (an undo back to that board shows them again).
 */
let freshTurn = -1;
let freshBoard: State['board'] | null = null;
function freshKeys(): string[] {
  if (!session || busy()) return [];
  const st = session.state;
  if (st.turnPlayer !== HUMAN || st.phase === 'GAME_OVER') return [];
  if (st.turnNumber !== freshTurn) {
    freshTurn = st.turnNumber;
    freshBoard = st.board;
  }
  if (st.board !== freshBoard) return [];
  const keys = new Set<string>();
  for (const p of session.lastTurnOf(BOT))
    for (const s of p.steps) {
      if (s.k === 'grow') for (const t of s.tiles) keys.add(t.key);
      if (s.k === 'strengthen') keys.add(s.key);
    }
  return [...keys].filter((k) => st.board[k]?.owner === BOT).sort();
}

/** Overhaul item 10: a preview's veins and its at-risk "−N" (only when the move makes it worse). */
function ghostExtras(v: View, pending: Action | null, ghosts: { key: string }[]): Pick<Overlay, 'ghostLinks' | 'atRisk'> {
  if (!pending || ghosts.length === 0) return {};
  const f = forecastMove(v, pending);
  const worse = f?.atRisk && f.atRisk.loss >= 2 && f.atRisk.loss > f.atRiskBefore ? f.atRisk : null;
  return { ghostLinks: ghostLinks(v.board, v.player, ghosts.map((g) => g.key)), atRisk: worse };
}

function renderBoard(v: View, advice: Advice | null) {
  if (!session) return;
  let o: Overlay = { ...NO_OVERLAY, scars: scars.map(({ key, owner, age }) => ({ key, owner, age })), focusKey, fresh: freshKeys() };
  if (myTurn() && !busy()) {
    const sel = session.sel;
    const pending = session.pending;
    const pv = pending ? previewMove(v, pending) : null;
    const anySel = sel.card !== null || sel.kind !== null || sel.hex !== null;
    const kinds = !pending && (sel.card !== null || sel.kind !== null) && !drawCombo() ? targetKinds(v, session.legal, sel) : null;
    o = {
      ...o,
      targets: !pending && (sel.card !== null || sel.kind !== null) ? targetHexes(v, session.legal, sel) : null,
      ...(kinds ? { targetKinds: Object.fromEntries(kinds) } : {}),
      selectedHex: sel.hex ?? (pending?.t === 'RotPick' ? coordKey(pending.coord) : null),
      ghosts: pv?.ghosts ?? [],
      cutKeys: pv?.cutKeys ?? [],
      ...ghostExtras(v, pending, pv?.ghosts ?? []),
      coachHexes: advice && !anySel && !IS_TEST2 ? advice.hexes.map(coordKey) : [],
      usable: true,
    };
    const dc = drawCombo();
    // overhaul item 7: before drawing only the starts; while drawing only what can come next
    const drawn = draw.shape.length ? draw.shape : draw.desk.phase === 'live' ? [draw.desk.start] : [];
    if (dc && !pending) {
      const targets = drawNext(dc, drawn);
      if (IS_TEST2 && drawn.length === 1) for (const key of bloomEndpoints(dc, drawn[0]!, draw.reverse)) targets.add(key);
      o = { ...o, targets, selectedHex: null, coachHexes: [] };
    }
  }
  if (!busy() && !FEATURES.weakTools) {
    // the test copy: no weak-spot toggles; my most dangerous weak link always pulses gently
    // with its "-N" (the opponent's weak links are on their tile card, when tapped)
    if (v.phase !== 'GAME_OVER') o.pulse = weakSpots(v)[0] ?? null;
  } else if (!busy()) {
    if (settings.weakSpots) o.weak = weakSpots(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
    if (showOpps) o.opps = opportunities(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
    // My most dangerous weak link (one the bot could cut next turn) pulses gently.
    if (settings.weakPulse && !settings.weakSpots && v.phase !== 'GAME_OVER') o.pulse = weakSpots(v)[0] ?? null;
    o.botFragile = showOpps;
  }
  // Redraw the board only when something on it changed (cheaper on older phones).
  const key = JSON.stringify({ ...o, targets: o.targets ? [...o.targets] : null });
  if (queue.board !== lastBoard || key !== lastOverlay) {
    board.render(queue.board, o);
    lastBoard = queue.board;
    lastOverlay = key;
  }
  // Overhaul item 16: ambient life, quiet while moves animate (so cuts read clearly)
  const ambKey = busy() ? 'busy' : `${settings.effects}|${settings.reduceMotion}`;
  if (queue.board !== lastAmbBoard || ambKey !== lastAmbKey) {
    lastAmbBoard = queue.board;
    lastAmbKey = ambKey;
    board.ambient(busy() ? null : ambientPlan({ board: queue.board, terrain: v.terrain, config: v.config, me: HUMAN, effects: settings.effects, reduceMotion: settings.reduceMotion }));
  }
  document.getElementById('tool-weak')?.setAttribute('aria-pressed', String(settings.weakSpots));
  document.getElementById('tool-targets')?.setAttribute('aria-pressed', String(showOpps));
  $('tool-skip').hidden = !busy();
  // Positioning pass: the bottom-left slot always holds a tool (Skip while something animates,
  // otherwise Replay, dimmed until there is a turn to replay), so the "?" opposite is never alone
  const noReplay = session.lastTurnOf(BOT).length === 0;
  $('tool-replay').hidden = busy() || !REPLAY_BUTTON;
  $('tool-replay').classList.toggle('off', noReplay);
  $('tool-replay').setAttribute('aria-disabled', String(noReplay));
  $('tool-replay').dataset.tip = noReplay ? REPLAY_NONE : REPLAY_TIP;
  // Undo (overhaul item 9): always in the same place; lit with a dot while a move can be taken back
  const undoOk = session.canUndo && !busy();
  // Positioning pass: Undo always holds its slot (opposite Sort), dimmed and disabled until a move
  // can be taken back, so it appearing never moves anything and Sort is never alone
  $('tool-undo').hidden = false;
  ($('tool-undo') as HTMLButtonElement).disabled = !undoOk;
  // Step 4: the homes (tree, volcano): idle life, a calm worried state and the "sides blocked"
  // ring in danger (or when tapped), smothered or withered after a Strangle. Public information.
  {
    const res = session.state.result;
    const states = ([0, 1] as const).map((p) => {
      const sides = homeSides(v, p);
      const m = landmarkMotion({ reduceMotion: settings.reduceMotion, effects: settings.effects }, sides.danger);
      const strangled = !busy() && res?.reason === 'strangle' && res.winner !== p;
      return { ...sides, ...m, tapped: cardPinned && inspectKey === sides.key, strangled, won: !busy() && res?.reason === 'strangle' && res.winner === p };
    });
    board.setHomes(states);
    const warn = $('root-warn');
    warn.hidden = !(states[HUMAN]!.danger && v.phase !== 'GAME_OVER');
  }
  placeCorners();
  renderTooltip(v);
}

/**
 * Pins the four corner buttons (weak spots, bot's weak links, replay, skip) to the corners
 * of the board as it is actually drawn (the board is centred inside a taller area).
 */
function placeCorners() {
  const wrap = $('board-wrap');
  const svg = board.svg;
  const vb = svg.viewBox.baseVal;
  if (!vb || !vb.width) return;
  const w = wrap.getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / vb.width, r.height / vb.height);
  const dw = vb.width * scale;
  const dh = vb.height * scale;
  const left = r.left - w.left + (r.width - dw) / 2;
  const top = r.top - w.top + (r.height - dh) / 2;
  wrap.style.setProperty('--b-left', `${Math.max(0, left).toFixed(0)}px`);
  wrap.style.setProperty('--b-top', `${Math.max(0, top).toFixed(0)}px`);
  wrap.style.setProperty('--b-right', `${Math.max(0, w.width - left - dw).toFixed(0)}px`);
  wrap.style.setProperty('--b-bottom', `${Math.max(0, w.height - top - dh).toFixed(0)}px`);
}

function renderTooltip(v: View) {
  const tip = $('tooltip');
  if (IS_TEST2 || !inspectKey || busy() || !session) {
    tip.hidden = true;
    return;
  }
  const key = inspectKey;
  const t = v.board[key];
  const terrain = v.terrain[key];
  const name = hexName(parseKey(key), v.config.boardRadius);
  const gold = terrain === 'rich';
  let html: string;
  if (terrain === 'rock') html = `<b>${name} · Rock</b><span>Nothing can grow here.</span>`;
  else if (!t) {
    const scar = scars.find((s) => s.key === key);
    const cut = scar ? `<span class="muted">${scar.owner === HUMAN ? 'Your' : OPP.Label} tile here was cut off ${scar.age === 0 ? 'this turn' : scar.age === 1 ? 'a turn ago' : 'two turns ago'}.</span>` : '';
    html = `<b>${name} · Empty${gold ? ' gold hex' : ''}</b><span>A tile here scores ${gold ? 2 : 1}.</span>${cut}`;
  }
  else {
    const mine = t.owner === HUMAN;
    const who = mine ? 'Your' : OPP.Label;
    if (t.root) {
      const sides = homeSides(v, t.owner);
      html = mine ? `<b>${HOME.mine}</b><span>${HOME.tapMine(sides.blocked)}</span>` : `<b>${HOME.theirs}</b><span>${HOME.tapTheirs(sides.blocked)}</span>`;
    }
    else {
      const loss = cutLoss(v, key).length;
      const top = t.strength >= v.config.maxRank ? ' · top strength, can’t be replaced' : '';
      const lose = loss > 1 ? `If lost, ${mine ? 'you lose' : `${OPP.the} loses`} ${loss} tiles.` : 'Losing it cuts nothing else.';
      html = `<b>${name} · ${who} tile</b><span>Strength ${t.strength}${top}${gold ? ' · gold: scores 2' : ''}</span><span>Joined to ${mine ? 'your' : 'their'} home. ${lose}</span>`;
      // the test copy: the opponent's weak link (was the "their weak links" toggle), on their card only
      if (!FEATURES.weakTools && !mine && opportunities(v, { anyReach: true, minLoss: 2 }).some((o) => o.key === key)) html += `<span class="tc-note">${OPP.Label} weak link: you can reach it now.</span>`;
    }
  }
  // v0.6: in my Grow step, an opponent tile a Fruit card can remove offers "Use Fruit card"
  const offer = cardPinned && myTurn() ? fruitOffer(v, session.legal, key) : null;
  if (offer) html += `${offer.note ? `<span class="tc-note">${offer.note}</span>` : ''}<button type="button" class="btn primary small tc-fruit" data-fruit="${key}">${offer.label}</button>`;
  tip.innerHTML = html;
  tip.hidden = false;
  tip.classList.toggle('pinned', cardPinned);
  const p = boardWrapPoint(key);
  const wrap = $('board-wrap').getBoundingClientRect();
  tip.setAttribute('role', cardPinned ? 'dialog' : 'tooltip');
  tip.setAttribute('aria-label', `Tile card: ${name}`);
  const w = Math.min(250, wrap.width - 16);
  tip.style.width = `${w}px`;
  tip.style.left = `${Math.min(Math.max(p.x - w / 2, 8), wrap.width - w - 8)}px`;
  const above = p.y > wrap.height * 0.45;
  tip.style.top = above ? '' : `${p.y + S}px`;
  tip.style.bottom = above ? `${wrap.height - p.y + S}px` : '';
}

const button = (text: string, cls: string, onClick: () => void, label?: string) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${cls}`;
  b.textContent = text;
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', () => {
    sound.unlock();
    onClick();
  });
  return b;
};

function renderControls(v: View, advice: Advice | null) {
  if (!session) return;
  const moves = $('moves');
  moves.replaceChildren();
  $('confirm').hidden = true;
  if (!myTurn() || busy()) {
    if (session.state.phase === 'GAME_OVER' && !busy() && gameOverDismissed) {
      moves.append(
        button('Results', 'ghost', () => {
          gameOverDismissed = false;
          render();
        }),
        button('Rematch', 'primary', () => startGame(randomSeed())),
      );
    }
    return;
  }
  const legal = session.legal;
  const sel = session.sel;
  const pending = session.pending;
  const anySel = sel.card !== null || sel.kind !== null || sel.hex !== null;
  const coachKind = advice && advice.action.t === 'Bloom' ? kindOf(advice.action) : null;

  if (v.phase === 'DRAW') {
    // Nothing here: the two piles glow and say "Tap to draw" / "Tap to take".
  } else if (v.phase === 'ACT' && !grewThisTurn() && skipPlan(legal, v.hand.length, settings.autoSkip && session.state !== skippedFrom).kind === 'ask') {
    // Step 2, auto-skip off (or after an Undo of a skip): why nothing can be played, and Continue
    // (v0.8: only for a truly empty Grow step; after a sprout or a Fruit card it is "Throw a card")
    const end = legal.find((a) => a.t === 'EndAct')!;
    const note = document.createElement('span');
    note.className = 'note empty-reason';
    // positioning pass: one short line in the centre column; the full reason on hover and for
    // screen readers
    note.textContent = NOTHING_TO_PLAY;
    note.title = `${NOTHING_TO_PLAY}. ${emptyReason(v.hand)}`;
    note.setAttribute('aria-label', note.title);
    moves.append(note, button('Continue', 'primary empty-continue', () => humanPlay(end), 'Continue to the Throw step'));
  } else if (v.phase === 'ACT') {
    // Sprout first: tapping a card picks it. Say so while nothing is picked.
    const grow = growControls(legal);
    const kindButtons = moveButtons(v, legal, sel);
    // two or more ways to bloom: one "Bloom" button opens the list of choices (they never
    // crowd the row or run off the screen); a single way gets its own button
    const many = kindButtons.length > 1;
    let host: HTMLElement = moves;
    if (!many && (!IS_TEST2 || !sel.kind?.startsWith('bloom-'))) bloomMenu = false;
    if (many) {
      const chosen = kindButtons.find((k) => sel.kind === k.kind);
      const toggle = button(chosen ? shortKindLabel(chosen.kind) : BLOOM.Name, `kind bloom-toggle${chosen || bloomMenu ? ' on' : ''}`, () => {
        bloomMenu = !bloomMenu;
        render();
      });
      const sub = document.createElement('small');
      sub.className = 'kind-keep';
      sub.textContent = BLOOM.choices(kindButtons.length);
      toggle.append(sub);
      if (IS_TEST2) renderBloomIcons(toggle, chosen?.kind ?? kindButtons[0]!.kind, v, true);
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', String(bloomMenu));
      moves.append(toggle);
      const panel = document.createElement('div');
      panel.className = 'bloom-options';
      panel.setAttribute('role', 'menu');
      panel.hidden = !bloomMenu;
      moves.append(panel);
      host = panel;
    }
    for (const k of kindButtons) {
      const on = sel.kind === k.kind;
      // two or more share the row: short words, so they fit beside the piles on a phone
      const b = button(k.label, `kind${on ? ' on' : ''}${coachKind === k.kind && !anySel ? ' coach-glow' : ''}`, () => {
        bloomMenu = false;
        session!.tapKind(k.kind);
        if (IS_TEST2) {
          // A Bloom starts a fresh shape, including when a board hex was picked first.
          session!.sel = { ...session!.sel, hex: null };
          draw = { ...DRAW0 };
          board.ghost(null);
        }
        render();
      });
      b.dataset.kind = k.kind;
      b.dataset.kinds = k.kinds.join(' ');
      if (many) {
        b.setAttribute('role', 'menuitemradio');
        // the cards it uses, so two "Bloom 4 tiles" are told apart (numbers in their suit colours)
        const cards = kindCards(k.kind)
          .map((id) => v.hand.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .sort((x, y) => x.rank - y.rank || (x.suit ?? 0) - (y.suit ?? 0));
        const nums = document.createElement('span');
        nums.className = 'kind-cards';
        nums.innerHTML = cards.map((c) => `<b class="${suitClass(c)}">${c.rank}</b>`).join('');
        b.prepend(nums);
        b.setAttribute('aria-label', `${k.label}: ${cards.map((c) => c.rank).join(', ')}`);
      }
      b.setAttribute('aria-pressed', String(on));
      if (IS_TEST2) renderBloomIcons(b, k.kind, v, !many && (on || kindCards(k.kind).length > 4));
      host.append(b);
    }
    if (IS_TEST2 && !many && sel.kind?.startsWith('bloom-') && kindButtons.length) {
      const chosenButton = moves.querySelector<HTMLButtonElement>('[data-kind]')!;
      const toggle = button('', 'kind bloom-toggle on', () => { bloomMenu = !bloomMenu; render(); });
      renderBloomIcons(toggle, sel.kind, v, true);
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', String(bloomMenu));
      const panel = document.createElement('div'); panel.className = 'bloom-options';
      panel.setAttribute('role', 'menu'); panel.hidden = !bloomMenu;
      moves.replaceChild(toggle, chosenButton); panel.append(chosenButton); moves.append(panel);
    }
    // Done growing: the next step is throwing a card (or, with an empty hand, the turn just ends).
    const end = legal.find((a) => a.t === 'EndAct');
    const label = v.hand.length > 0 ? IS_TEST2 ? 'Skip' : 'Throw a card' : 'End turn';
    if (end && !pending && grow.throwButton) moves.append(button(label, `end ${anySel ? 'ghost' : 'primary'}${IS_TEST2 && v.hand.length > 0 ? ' test2-skip' : ''}${advice?.action.t === 'EndAct' ? ' coach-glow' : ''}`, () => humanPlay(end), `${label}: stop growing tiles`));
    // Sprouting stays optional in the rules: a small link skips it and goes on to Throw.
    if (end && !pending && grow.skipLink && !anySel) moves.append(button(IS_TEST2 ? 'Skip' : SPROUT.skip, `link end skip${IS_TEST2 ? ' test2-skip' : ''}${advice?.action.t === 'EndAct' ? ' coach-glow' : ''}`, () => humanPlay(end), SPROUT.skipTitle));
  } else if (v.phase === 'DISCARD') {
    // (the hint line says "Tap a card to throw it")
  } else {
    for (const a of legal) {
      if (isBoardAction(a) || a.t === 'Discard') continue;
      moves.append(button(a.t === 'Continue' ? 'End turn' : a.t === 'Knock' ? 'Knock' : a.t, 'primary', () => humanPlay(a)));
    }
  }
  if (IS_TEST2 && sel.kind?.startsWith('bloom-')) {
    const end = legal.find(a => a.t === 'EndAct');
    if (end && !moves.querySelector('.end')) moves.append(button('Skip', 'end test2-skip', () => humanPlay(end), SPROUT.skipTitle));
  }
  const dc = drawCombo();
  if (dc && !pending) {
    if (draw.shape.length > 0 || draw.suggested) moves.append(button('Clear', 'ghost draw-clear', () => cancelDraw(), 'Clear the shape'));
    // a run: which end gets the lowest number (a set has one number: no toggle)
    if (dc.run) {
      const b = button('Reverse', `ghost draw-reverse${draw.reverse ? ' on' : ''}`, () => toggleReverse(), 'Reverse the numbers: highest on the first hex');
      b.setAttribute('aria-pressed', String(draw.reverse));
      moves.append(b);
    }
  }
  if (dc && settings.placementList) {
    // an opt-in accessibility list: step through every legal placement of this combo
    const all = dc.actions;
    const i = Math.max(0, all.findIndex((a) => JSON.stringify(a) === JSON.stringify(pending)));
    const step = (d: number) => {
      const k = pending ? (i + d + all.length) % all.length : d > 0 ? 0 : all.length - 1;
      if (IS_TEST2) {
        draw = { ...DRAW0 };
        board.ghost(null);
      }
      session!.preset(all[k]!);
      render();
    };
    moves.append(button('◀', 'ghost list-prev', () => step(-1), 'Previous placement'));
    const lab = document.createElement('span');
    lab.className = 'list-pos';
    lab.textContent = pending ? `Placement ${i + 1} of ${all.length}` : `${all.length} placements`;
    moves.append(lab);
    moves.append(button('▶', 'ghost list-next', () => step(1), 'Next placement'));
  }
  if (anySel && (!pending || IS_TEST2)) moves.append(button('Cancel', 'ghost cancel', () => cancelSel()));

  if (IS_TEST2 && dc) {
    const panel = moves.querySelector<HTMLElement>('.bloom-options');
    if (panel) for (const control of [...moves.children]) {
      if (control.matches('.draw-clear, .draw-reverse, .list-prev, .list-pos, .list-next, .cancel')) panel.append(control);
    }
    for (const control of moves.querySelectorAll<HTMLButtonElement>('.draw-clear, .draw-reverse, .cancel')) {
      control.setAttribute('aria-label', control.title || control.textContent || 'Cancel');
      control.classList.add('test2-compact-control');
      control.innerHTML = control.classList.contains('draw-reverse')
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    }
  }
  if (pending) {
    const pv = previewMove(v, pending);
    $('confirm-chip').textContent = pv ? pv.chip : pending.t === 'Discard' ? `Discard ${cardName(v.hand.find((c) => c.id === pending.card)!)}` : '';
    $('confirm-play').textContent = pending.t === 'Discard' && discardEndsTurn(v) ? 'Discard & end turn' : pending.t === 'Discard' ? 'Discard' : 'Confirm';
    // Overhaul item 8: the risks that made this move ask (icons + short lines); else the old note
    const risks = (() => {
      const f = forecastMove(v, pending);
      return f ? riskLines(f) : [];
    })();
    renderRisks(risks);
    const warn = $('confirm-warn');
    const quiet = risks.length > 0 || (!pv?.warning && !pv?.note);
    warn.hidden = quiet;
    warn.textContent = quiet ? '' : (pv?.warning ?? pv?.note ?? '');
    warn.classList.toggle('note', !pv?.warning && !!pv?.note);
    // Polish pass 3: previewing a Sprout onto an opponent tile? A small "i" opens its tile card,
    // so Fruit stays reachable while a card is picked.
    const info = $('confirm-info');
    const onOpp = pending.t === 'Sprout' && v.board[coordKey(pending.coord)]?.owner === BOT;
    info.hidden = !onOpp || fruitOffer(v, legal, coordKey((pending as Extract<Action, { t: 'Sprout' }>).coord)) === null;
    if (!info.hidden) info.dataset.key = coordKey((pending as Extract<Action, { t: 'Sprout' }>).coord);
    // the test copy: no Confirm box (a second tap on the card or the hex places the move)
    $('confirm').hidden = FEATURES.tapAgain;
  }
}

/** Test2 keeps the actual rank/suit combinations and accessible names, without instruction prose. */
function renderBloomIcons(button: HTMLButtonElement, kind: string, v: View, compact = false) {
  const cards = kindCards(kind).map(id => v.hand.find(c => c.id === id)).filter(c => !!c);
  const icons = document.createElement('span');
  icons.className = 'test2-combination';
  icons.setAttribute('aria-hidden', 'true');
  icons.innerHTML = cards.map(c => `<span class="test2-mini-card ${suitClass(c!)}">${cardFace(c!)}</span>`).join('');
  button.replaceChildren(icons);
  // Show the actual combination in the cockpit, including the selected Bloom.
  if (compact) button.classList.add('test2-compact-control');
  button.setAttribute('aria-label', `${shortKindLabel(kind)}: ${cards.map(c => cardName(c!)).join(', ')}`);
}

/** The forecast bar's risk lines (overhaul item 8): one icon and short line each. */
function renderRisks(risks: ReturnType<typeof riskLines>) {
  const box = $('confirm-risks');
  box.replaceChildren(
    ...risks.map((r) => {
      const li = document.createElement('li');
      li.className = `risk risk-${r.reason}`;
      const i = document.createElement('span');
      i.className = 'risk-icon';
      i.setAttribute('aria-hidden', 'true');
      i.textContent = r.icon;
      li.append(i, document.createTextNode(r.text));
      return li;
    }),
  );
  box.hidden = risks.length === 0;
}


/** First-time tips for Fruit and Strengthen: shown once, until dismissed (re-open from How to play). */
function renderFirstTip(v: View) {
  const card = $('first-tip');
  if (!session || (openSheet && (!IS_TEST2 || openSheet.id !== 'sheet-test2-help'))) {
    card.hidden = true;
    return;
  }
  if (!tipOpen && myTurn() && !busy() && v.phase === 'ACT') {
    if (!tipsSeen.draw && drawCombo()) tipOpen = 'draw';
    else if (!tipsSeen.fruit && v.hand.some((c) => c.suit === null)) tipOpen = 'fruit';
    else if (!tipsSeen.strengthen && session.sel.card !== null && [...targetKinds(v, session.legal, session.sel).values()].includes('strengthen')) tipOpen = 'strengthen';
  }
  card.hidden = !tipOpen || (IS_TEST2 && (!myTurn() || busy() || v.phase !== 'ACT'));
  if (!tipOpen) return;
  $('first-tip-title').textContent = TIPS[tipOpen].title;
  $('first-tip-text').textContent = TIPS[tipOpen].text;
  $('first-tip-demo').hidden = tipOpen !== 'draw';
}

function showTip(id: FirstTip) {
  tipOpen = id;
  sheet(null);
  render();
  if (IS_TEST2 && test2Help) {
    // How to play can open before a game exists; fill this explicit lesson directly.
    $('first-tip-title').textContent = TIPS[id].title;
    $('first-tip-text').textContent = TIPS[id].text;
    $('first-tip-demo').hidden = id !== 'draw';
    $('first-tip').hidden = false;
    test2Help.open('tip');
  }
}

function renderHand(v: View, advice: Advice | null) {
  if (!session) return;
  const hand = $('hand');
  const sel = session.sel;
  const legal = myTurn() && !busy() ? session.legal : [];
  const usable = legal.length ? usableCards(v, legal, { ...sel, card: null }) : new Set<number>();
  const picked = new Set(session.pending ? moveCards(session.pending) : []);
  const coachCards = advice && sel.card === null && !session.pending ? new Set(advice.cards) : new Set<number>();
  const cards = handOrder(v.hand, settings.handSort);
  const bloomCards = IS_TEST2 && myTurn() && !busy() ? new Set(sel.kind?.startsWith('bloom-')
    ? kindCards(sel.kind) : sel.card === null && sel.kind === null
      ? legal.flatMap(a => a.t === 'Bloom' ? a.cards : []) : []) : new Set<number>();
  // overhaul item 3: cards of the same combo share a small bracket under them
  const combos = comboGroups(v.hand);
  // remember where every card was, so a reorder (Sort) slides them into place (FLIP)
  const before = new Map([...hand.querySelectorAll<HTMLElement>('[data-card]')].map((b) => [Number(b.dataset.card), b.getBoundingClientRect().left]));
  const n = cards.length;
  const spread = Math.min(3.5, 22 / Math.max(n, 1));
  const existing = new Map([...hand.querySelectorAll<HTMLButtonElement>('[data-card]')].map((b) => [Number(b.dataset.card), b]));
  cards.forEach((c, i) => {
    let b = existing.get(c.id);
    existing.delete(c.id);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.dataset.card = String(c.id);
      b.innerHTML = cardFace(c);
      b.addEventListener('click', () => onCardTap(c.id));
    }
    const off = i - (n - 1) / 2;
    const lifted = sel.card === c.id || picked.has(c.id);
    const playable = legal.length > 0 && usable.has(c.id);
    // v0.6: a Fruit card glows softly when it has a target now; dimmed, it says why (one line)
    const fs = c.suit === null ? fruitCardState(v, legal, c.id) : null;
    const firstFruit = c.suit === null && cards[i - 1]?.suit !== null && i > 0;
    b.className = `card ${suitClass(c)}${lifted ? ' lifted' : ''}${playable ? ' playable' : ''}${legal.length > 0 && !playable ? ' dim' : ''}${fs?.ready && myTurn() ? ' fruit-ready' : ''}${firstFruit ? ' fruit-gap' : ''}${coachCards.has(c.id) ? ' coach-glow' : ''}`;
    if (IS_TEST2) {
      b.classList.toggle('test2-bloom-card', bloomCards.has(c.id));
      b.classList.toggle('test2-throw-picked', session!.pending?.t === 'Discard' && session!.pending.card === c.id);
    }
    if (fs?.reason && myTurn()) b.title = fs.reason;
    else b.removeAttribute('title');
    if (thumbLayout) {
      // the test copy's thumb layout: each card on the arc, turned with it; picked: lifted outward
      const p = fanSlots(thumbLayout, n)[i]!;
      b.style.setProperty('--fx', `${p.x.toFixed(1)}px`);
      b.style.setProperty('--fy', `${p.y.toFixed(1)}px`);
      b.style.setProperty('--rot', `${p.rot.toFixed(2)}deg`);
      b.style.setProperty('--lx', `${(p.nx * THUMB.lift).toFixed(1)}px`);
      b.style.setProperty('--ly', `${(p.ny * THUMB.lift).toFixed(1)}px`);
      // each card's number corner stays visible: right hand, later cards on top; left, earlier
      b.style.zIndex = String(thumbLayout.side === 'left' ? n - i : i + 1);
    } else {
      b.style.zIndex = '';
      b.style.setProperty('--rot', `${(off * spread).toFixed(2)}deg`);
      b.style.setProperty('--dy', `${(off * off * 0.7).toFixed(1)}px`);
    }
    if (IS_TEST2 && b.classList.contains('test2-throw-picked')) b.style.zIndex = '100';
    b.style.visibility = hiddenCards.has(c.id) ? 'hidden' : '';
    b.setAttribute('aria-label', `${cardName(c)}${playable ? ', can be played' : ''}${fs?.reason && myTurn() ? `, ${fs.reason}` : ''}${lifted ? ', picked' : ''}${IS_TEST2 && session!.pending?.t === 'Discard' && session!.pending.card === c.id ? ', tap again to throw and finish your turn' : ''}`);
    b.setAttribute('aria-pressed', String(lifted));
    const g = combos.get(c.id);
    if (g === undefined) delete b.dataset.combo;
    else b.dataset.combo = String(g % 3);
    if (hand.children[i] !== b) hand.insertBefore(b, hand.children[i] ?? null);
  });
  for (const b of existing.values()) b.remove();
  if (!settings.reduceMotion && settings.speed !== 'skip') {
    for (const b of hand.querySelectorAll<HTMLElement>('[data-card]')) {
      const was = before.get(Number(b.dataset.card));
      const dx = was === undefined ? 0 : was - b.getBoundingClientRect().left;
      if (Math.abs(dx) > 2) anim(b, [{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 280 * timeScale(), easing: 'cubic-bezier(.2,.9,.3,1.25)' });
    }
  }
  const sortBtn = $('hand-sort');
  sortBtn.hidden = false;
  (sortBtn as HTMLButtonElement).disabled = n < 2;
  const sortWords = `Sorted ${settings.handSort === 'suit' ? 'by suit' : 'by number'}. Tap to sort ${settings.handSort === 'suit' ? 'by number' : 'by suit'}.`;
  sortBtn.setAttribute('aria-label', sortWords);
  sortBtn.title = sortWords;
  hand.style.setProperty('--n', String(n));
  hand.classList.toggle('waiting', !myTurn());
}

const rememberCardRects = () => {
  cardRects = new Map([...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((b) => [Number(b.dataset.card), b.getBoundingClientRect()]));
};

/** Part 3 C: the deck count last drawn (-1 before a game is shown) */
let lastDeckSeen = -1;
/** the biggest the piles have been this game (for the stack thickness) */
let deckFull = 1;

function renderPiles(v: View, advice: Advice | null) {
  const looks = pileStates(v.phase, myTurn(), busy(), session!.legal);
  const top = v.discard.at(-1);
  const t = $('discard-top');
  t.className = `pile-top${top ? ` card ${suitClass(top)}` : ' empty'}`;
  t.innerHTML = top ? cardFace(top) : '';
  if (IS_TEST2) renderPileMeter($('deck-count'), v.deckCount);
  else $('deck-count').textContent = String(v.deckCount);
  // UX pass: the last few cards: the count turns amber (the game ends when the deck runs out)
  const low = v.deckCount > 0 && v.deckCount <= 5 && v.phase !== 'GAME_OVER';
  $('deck').classList.toggle('low', low);
  if (IS_TEST2) renderPileMeter($('discard-count'), v.discard.length);
  else $('discard-count').textContent = String(v.discard.length);
  // Part 3 C: the last card, and the deck running out, each get a small moment (Eye candy)
  const dm = deckMoment(lastDeckSeen, v.deckCount);
  if (lastDeckSeen >= 0 && dm && settings.eyeCandy && motion() > 0) {
    if (dm === 'last') {
      anim($('deck'), [{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-3deg)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      if (settings.sound) sound.chime();
    } else anim($('deck'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(0.9) translateY(4px)' }], { duration: 700, easing: 'ease-out' });
  }
  lastDeckSeen = v.deckCount;
  // overhaul item 6: the stacks are as thick as the piles are big; the last card stands alone
  deckFull = Math.max(deckFull, v.deckCount + v.discard.length);
  $('deck').dataset.layers = String(stackLayers(v.deckCount, deckFull));
  $('discard').dataset.layers = String(stackLayers(v.discard.length, deckFull));
  $('deck').dataset.count = pileCountState(v.deckCount);
  $('deck').querySelector('.pile-label')!.textContent = v.deckCount === 1 && v.phase !== 'GAME_OVER' ? 'Last card' : 'Deck';
  for (const [id, look] of [['deck', looks.deck], ['discard', looks.discard]] as const) {
    const b = $(id) as HTMLButtonElement;
    b.disabled = !look.enabled;
    b.classList.toggle('ready', look.glow);
    b.classList.toggle('dim', look.dim);
    const coachOn = !!advice && advice.action.t === 'Draw' && advice.action.from === id && look.enabled;
    b.classList.toggle('coach-glow', IS_TEST2 ? false : coachOn);
    $(`${id}-hint`).textContent = look.hint ?? '';
  }
  if (IS_TEST2) {
    // A new card combination, regardless of board space. Duplicate faces don't create one.
    const key = (cards: readonly Card[]) => cards.map(c => `${c.suit}:${c.rank}`).sort().join('|');
    const before = new Set(bloomGroups(v.hand).map(g => key(g.cards)));
    const createsBloom = !!top && bloomGroups([...v.hand, top]).some(g => !before.has(key(g.cards)));
    $('discard').classList.toggle('test2-bloom-draw', looks.discard.enabled && createsBloom);
  }
  $('deck').setAttribute('aria-label', `Deck: ${plural(v.deckCount, 'card')}.${looks.deck.enabled ? ' Tap to draw.' : ''}`);
  $('discard').setAttribute('aria-label', top ? `Throw pile: ${plural(v.discard.length, 'card')}, ${cardName(top)} on top.${looks.discard.enabled ? ' Tap to take it.' : ''}` : 'Throw pile: empty');
}

function renderCoach(advice: Advice | null) {
  const box = $('coach');
  const showSummary = settings.coach && coach.step >= COACH_STEPS && !coach.summaryDone && session?.state.phase !== 'GAME_OVER';
  box.hidden = !(advice || showSummary) || busy() || (IS_TEST2 && !myTurn());
  $('coach-advice').hidden = !advice;
  $('coach-summary').hidden = !showSummary || !!advice;
  if (advice) {
    $('coach-step').textContent = `${coach.step + 1} of ${COACH_STEPS}`;
    $('coach-suggested').textContent = advice.suggested;
    $('coach-why').textContent = advice.why.join(' ');
    const tip = $('coach-tip');
    tip.hidden = !advice.tip;
    tip.textContent = advice.tip ? advice.tip.text : '';
    $('coach-why').hidden = !coachWhyOpen;
    $('coach-why-btn').setAttribute('aria-expanded', String(coachWhyOpen));
    $('coach-why-btn').textContent = coachWhyOpen ? 'Less' : 'Why?';
    $('coach-show').textContent = guideGoal ? 'Hide arrow' : 'Show me where';
    $('coach-show').setAttribute('aria-pressed', String(!!guideGoal));
  } else if (showSummary && session) {
    $('coach-step').textContent = '';
    const sum = coachSummary(coach.taught, session.state.config);
    $('coach-summary-title').textContent = sum.title;
    $('coach-summary-list').replaceChildren(
      ...sum.bullets.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
  }
}

function renderGameOver() {
  const go = $('gameover');
  const st = session?.state;
  const show = !!st && st.phase === 'GAME_OVER' && !!st.result && !busy() && !gameOverDismissed && !$('game').hidden;
  if (go.hidden === !show) return;
  go.hidden = !show;
  if (!show || !st?.result) return;
  const r = st.result;
  const won = r.winner === HUMAN;
  $('go-title').textContent = won ? `You beat Level ${gameLevel}!` : resultTitle(r, HUMAN);
  // No world map yet: every game is practice.
  $('go-sub').textContent = won ? SPROUT.practice : `Level ${gameLevel} · ${LEVEL_INFO[gameLevel].name}`;
  $('go-rematch').textContent = won ? 'Play again' : 'Try again';
  const other = $('go-other');
  const target = won ? Math.min(9, gameLevel + 1) : Math.max(1, gameLevel - 1);
  other.hidden = target === gameLevel;
  other.textContent = won ? `Try Level ${target}` : 'Try a lower level';
  other.dataset.level = String(target);
  go.className = `gameover ${r.winner === HUMAN ? 'won' : r.winner === null ? 'draw' : 'lost'}`;
  $('go-score').innerHTML = `<span class="you">${r.scores[HUMAN]}</span><span class="dash">–</span><span class="bot">${r.scores[BOT]}</span>`;
  // overhaul item 20: the final score counts up once, calmly (not with Reduce motion or Speed Off)
  if (timeScale() > 0 && !settings.reduceMotion && !goCounted) {
    goCounted = true;
    const els = [$('go-score').querySelector('.you')!, $('go-score').querySelector('.bot')!];
    const to = [r.scores[HUMAN], r.scores[BOT]];
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - (1 - k) ** 3;
      els.forEach((el, i) => (el.textContent = String(Math.round(to[i]! * e))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  $('go-cut').hidden = !session?.biggestCut;
  $('go-share').textContent = 'Share';
  $('go-reason').textContent = resultReason(r, HUMAN);
  // UX pass: what I did with the one-card move
  const moves = moveSummary(st.history ?? [], HUMAN);
  $('go-moves').textContent = moves ?? '';
  $('go-moves').hidden = !moves;
  const part = (p: Player) => {
    const b = scoreBreakdown(st, p);
    return `${b.tiles} tile${b.tiles === 1 ? '' : 's'}${b.gold ? ` (${b.gold} on gold)` : ''}`;
  };
  $('go-break').textContent = `You: ${part(HUMAN)} · ${OPP.label}: ${part(BOT)}`;
  $('go-stats').textContent = statsLine(stats);
  $('go-highlights').replaceChildren(
    ...gameHighlights(st.history ?? [], HUMAN).map((h) => {
      const li = document.createElement('li');
      li.className = h.by === HUMAN ? 'you' : h.by === BOT ? 'bot' : '';
      li.innerHTML = `<span class="h-value num">${h.value}</span><span class="h-title">${h.title}</span><span class="h-text">${h.text}</span>`;
      return li;
    }),
  );
  $('go-rematch').focus();
}

function renderHistory() {
  $('history').replaceChildren(
    ...log.map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
}

// ---------- input ----------

/** Takes back the player's last move of this turn (nothing hidden was revealed by it). */
function undoMove() {
  if (!session) return;
  note({ t: 'undo', at: Date.now() });
  fastForward();
  const before = session.state.board;
  if (!session.undo()) return;
  // Overhaul item 9: the move runs backwards (its tiles sink away, cut tiles come back),
  // with a falling sound and a light double tap. The state itself is restored exactly.
  const after = session.state.board;
  const gone = Object.keys(before).filter((k) => before[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const back = Object.keys(after).filter((k) => after[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (settings.sound) sound.undo(undoPitches(gone.length));
  const hp = hapticFor('undo', settings);
  if (hp) vibrate(true, hp as number | number[]);
  const f = timeScale();
  if (f > 0 && !settings.reduceMotion) {
    for (const k of gone) {
      const el = board.tile(k);
      if (!el) continue;
      const ghost = el.cloneNode(true) as SVGGElement;
      ghost.classList.add('undo-ghost');
      el.parentNode?.appendChild(ghost);
      removeAfter(anim(ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55) translateY(4px)' }], { duration: 260 * f, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }), ghost, 320 * f);
    }
    requestAnimationFrame(() => {
      for (const k of back) anim(board.tile(k), [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 240 * f, delay: 120 * f, easing: 'ease-out', fill: 'backwards' });
    });
  }
  queue.reset(session.state.board);
  const v = session.view;
  shownScores = [v.score, v.opponentScore];
  scars = [];
  inspectKey = null;
  guideGoal = null;
  log.unshift('You took back a move.');
  save();
  render();
}

function cancelSel() {
  bloomMenu = false;
  draw = { ...DRAW0 };
  board.ghost(null);
  session?.cancel();
  inspectKey = null;
  cardPinned = false;
  render();
}

/** A clear choice (one move on the picked spot) plays at once: no Confirm, Undo can take it back. */
function maybeAutoPlay() {
  if (!session || !myTurn() || busy()) return;
  // Test2 commits a complete card-and-target Sprout, including Strengthen. Blooms finish
  // through the drawing path, so an inferred placement never spends a partly chosen group.
  const sprout = IS_TEST2 && (session.sel.kind === null || session.sel.kind === 'sprout') ? onlyChoice(session.view, session.legal, { ...session.sel, kind: 'sprout' }) : null;
  const a = sprout ?? playNow(session.view, session.legal, session.sel) ?? (settings.confirmPolicy === 'never' ? onlyChoice(session.view, session.legal, session.sel) : null);
  if (a && (!IS_TEST2 || a.t !== 'Bloom') && !asksConfirm(a)) humanPlay(a);
}

/** Overhaul item 8: does this move wait for Confirm? (the "Confirm moves" setting and the forecast) */
function asksConfirm(a: Action): boolean {
  if (IS_TEST2 && a.t === 'Discard') return true;
  if (IS_TEST2 && (a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit')) return false;
  return !!session && needsConfirm(settings.confirmPolicy, forecastMove(session.view, a));
}

function onCardTap(id: number) {
  sound.unlock();
  if (!session) return;
  if (busy()) fastForward();
  if (!myTurn()) return;
  // the test copy: no Confirm box; tapping a card of the waiting move again places it
  if (FEATURES.tapAgain && session.pending && (!IS_TEST2 || (session.pending.t !== 'Bloom' && session.pending.t !== 'Sprout')) && moveCards(session.pending).includes(id)) return humanPlay(session.pending);
  sound.click();
  pickFruit(id);
  inspectKey = null;
  // a Fruit card with nothing to do says why, in one line
  if (session.view.hand.find((c) => c.id === id)?.suit === null) {
    const why = fruitCardState(session.view, session.legal, id).reason;
    if (why) caption(why, null, 'info');
  }
  // Throw step: tapping a card throws it (only the last card asks first, per "Confirm moves").
  if (session.view.phase === 'DISCARD' && session.pending?.t === 'Discard' && !asksConfirm(session.pending)) return humanPlay(session.pending);
  // A card with just one place to grow picks it at once: one tap plays it (Undo takes it back).
  if (session.sel.card !== null && session.sel.hex === null && (!IS_TEST2 || session.view.hand.find(c => c.id === session!.sel.card)?.suit !== null)) {
    const only = [...targetHexes(session.view, session.legal, session.sel)];
    if (only.length === 1) session.tapHex(only[0]!);
  }
  render();
  maybeAutoPlay();
}

// ---------- painting a Bloom (v0.7) ----------

type Ptr = { id: number; last: Pt; start: Pt; moved: boolean; downKey: string | null; type: string; cur: string | null; viewport: string };
type DrawUi = { shape: string[]; reverse: boolean; desk: Desk; ptr: Ptr | null; msg: string | null; redraw?: boolean; suggested?: boolean };
const DRAW0: DrawUi = { shape: [], reverse: false, desk: DESK_IDLE, ptr: null, msg: null };
let draw: DrawUi = { ...DRAW0 };
let drawFrame = 0;
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** The picked Bloom while painting is possible (my Grow step, a Bloom picked), else null. */
let comboMemo: { state: unknown; sel: unknown; combo: Combo | null } | null = null;
function drawCombo(): Combo | null {
  if (!session || !myTurn() || busy() || session.view.phase !== 'ACT') return null;
  // worked out once per position and selection, not on every pointer move
  if (comboMemo?.state !== session.state || comboMemo.sel !== session.sel) comboMemo = { state: session.state, sel: session.sel, combo: comboFor(session.view, session.legal, session.sel) };
  return comboMemo.combo;
}

/** The ghost of the shape being painted right now (null when nothing is painted). */
function drawGhostNow(c: Combo): DrawGhost | null {
  const v = session!.view;
  if (draw.desk.phase === 'live') return deskShape(v, c, draw.desk, draw.reverse);
  return draw.shape.length ? paintGhost(v, c, draw.shape, draw.reverse) : null;
}

/** Repaints only the ghost layer and the info card (no full board redraw), once per frame. */
function paintDraw() {
  updateTest2MoveActive();
  cancelAnimationFrame(drawFrame);
  drawFrame = requestAnimationFrame(() => {
    const c = drawCombo();
    if (!c || !session) return;
    const g = session.presetMove ? null : drawGhostNow(c);
    const shape = draw.desk.phase === 'live' ? growToward(c, draw.desk.start, draw.desk.hover, draw.reverse) : draw.shape;
    const blocked = session.presetMove ? [] : [...unavailable(session.view, c, shape, draw.reverse).keys()];
    board.ghost(g || blocked.length ? {
      tiles: g?.tiles ?? [],
      blocked: !!g && !g.action && g.tiles.length === c.n,
      unavailable: blocked,
      cursor: focusKey && document.activeElement === $('board') ? focusKey : null,
    } : null);
    renderDrawInfo(c, g);
  });
}

/** The info card above the board: the counter, the result chip or why not, in plain words (also read out). */
function renderDrawInfo(c: Combo, g: DrawGhost | null) {
  const box = $('draw-info');
  const v = session!.view;
  let text = '';
  if (session!.presetMove) text = '';
  else if (g?.action) {
    const pv = previewMove(v, g.action);
    text = IS_TEST2
      ? `${c.n}/${c.n}${pv?.warning ? ` · ${pv.warning}` : ''}${draw.msg ? ` · ${draw.msg}` : ''}`
      : `${c.n}/${c.n} · ${pv?.chip ?? ''}${pv?.warning ? ` · ${pv.warning}` : ''}`;
  } else if (g?.reason) text = draw.msg ? `${g.reason} · ${draw.msg}` : g.reason;
  else if (draw.msg) text = draw.msg;
  box.textContent = text;
  box.hidden = !text;
  const n = g?.tiles.length ?? 0;
  $('draw-live').textContent = g?.action ? `${n} of ${c.n} hexes chosen. ${previewMove(v, g.action)?.chip ?? ''}` : n ? `${n} of ${c.n} hexes chosen` : '';
}

/** A soft rising tick and a light haptic for each hex added (Sound and Vibration toggles). */
function drawTick(i: number) {
  if (settings.sound) sound.grow([pitchLadder(i + 1, 0)[i]!], 0);
  vibrate(settings.vibration, 6);
}

function cancelDraw(msg: string | null = null) {
  if (draw.suggested) session?.preset(null);
  draw = { ...DRAW0, reverse: draw.reverse, msg };
  board.ghost(null);
  render();
}

/** Flips which end of a run gets the lowest number (only shown for runs). */
function toggleReverse() {
  const c = drawCombo();
  if (!c) return;
  if (draw.suggested) session!.preset(null);
  draw = { ...draw, reverse: !draw.reverse, suggested: false };
  // keep only the part of the shape that still fits the flipped numbers
  const kept: string[] = [];
  for (const k of draw.shape) {
    const next = paintEnter(c, kept, k, draw.reverse);
    if (next.length === kept.length) break;
    kept.push(k);
  }
  draw = { ...draw, shape: kept };
  render();
}

/** A finished shape: placed at once, or shown with Confirm (the "Confirm moves" setting). */
function finishDraw(a: Meld) {
  draw = { ...DRAW0, reverse: draw.reverse };
  board.ghost(null);
  if (asksConfirm(a)) {
    session!.preset(a);
    render();
  } else humanPlay(a);
}

/**
 * A tap on a hex while painting (no drag). The first tap on an empty shape also shows the
 * suggested Bloom through that hex (with its result chip and Confirm); tapping on adds hexes
 * one by one (every Bloom can be made by taps alone); a mouse uses the two-click machine.
 */
function drawTap(c: Combo, key: string, type: string) {
  const v = session!.view;
  if (IS_TEST2 && (draw.shape.length === 1 || draw.desk.phase === 'live')) {
    const start = draw.desk.phase === 'live' ? draw.desk.start : draw.shape[0]!;
    const shortcut = endpointBloom(c, start, key, draw.reverse, v);
    if (shortcut) return finishDraw(shortcut);
  }
  if (((type === 'mouse' || type === 'keyboard') && draw.shape.length === 0) || draw.desk.phase === 'live') {
    const r = deskClick(draw.desk, key, v, c, draw.reverse);
    if (r.finish) {
      // The desktop shape grows toward the pointer, so hovering rock can still suggest a
      // legal nearby clump. Test2 finishes only when the chosen hex belongs to that clump.
      if (IS_TEST2 && !r.finish.hexes.some((h) => coordKey(h) === key)) {
        draw = { ...draw, desk: deskHover(draw.desk, key), msg: 'Choose a glowing hex' };
        board.shake(settings.reduceMotion);
        paintDraw();
        return;
      }
      return finishDraw(r.finish);
    }
    // a click on another legal start begins again from there
    if (draw.desk.phase === 'live' && r.desk.phase === 'live' && key !== draw.desk.start && drawStarts(c, draw.reverse).has(key) && !deskShape(v, c, r.desk, draw.reverse).action) {
      draw = { ...draw, desk: { phase: 'live', start: key, hover: key }, shape: [] };
    } else draw = { ...draw, desk: r.desk, shape: [] };
    if (r.desk.phase === 'live' && draw.desk.phase === 'live') drawTick(0);
    paintDraw();
    return;
  }
  if (draw.suggested) session!.preset(null);
  const next = paintTap(c, draw.shape, key, draw.reverse);
  if (next.length > draw.shape.length) drawTick(next.length - 1);
  else if (next.length === draw.shape.length && !draw.shape.includes(key)) draw = { ...draw, msg: unavailable(v, c, draw.shape, draw.reverse).get(key) ?? null };
  draw = { ...draw, shape: next, suggested: false, msg: next.length !== draw.shape.length ? null : draw.msg };
  const m = paintMatch(c, next, draw.reverse);
  if (m) return finishDraw(m);
  // the one-tap suggestion: a first tap shows the best Bloom through this hex, ready to confirm
  if (!IS_TEST2 && next.length === 1 && draw.shape.length === 1) {
    const s = suggestBloom(v, c.actions, key);
    if (s) {
      session!.preset(s);
      draw = { ...draw, suggested: true };
      render();
      return;
    }
  }
  render();
}

const drawHandlers = {
  down(p: Pt, e: PointerEvent) {
    const c = drawCombo();
    if (!c || !session) return;
    if (e.button === 2) return cancelDraw();
    // a second finger (a pinch, a scroll) cancels the painting
    if (draw.ptr && draw.ptr.id !== e.pointerId) return cancelDraw();
    const keys = new Set(board.boardKeys);
    const key = hexAtPoint(p.x, p.y, keys);
    if (!IS_TEST2 && session.presetMove && !draw.suggested) {
      // painting again over a waiting preview: the preview goes (and the one-placement shortcut
      // does not bring it straight back while this painting is on)
      session.preset(null);
      draw = { ...draw, redraw: true };
      render();
    }
    draw.ptr = { id: e.pointerId, last: p, start: p, moved: false, downKey: key, type: e.pointerType, cur: key, viewport: `${innerWidth}:${innerHeight}` };
    // a hex is added when the finger lifts (a tap) or starts to move (a drag), not on touch
    paintDraw();
  },
  move(p: Pt, e: PointerEvent) {
    const c = drawCombo();
    if (!c) return;
    const keys = new Set(board.boardKeys);
    // after a first click the live shape follows the pointer, button held or not
    if (draw.desk.phase === 'live') {
      const k = hexAtPoint(p.x, p.y, keys);
      if (k && k !== draw.desk.hover) {
        draw = { ...draw, desk: deskHover(draw.desk, k), msg: IS_TEST2 ? null : draw.msg };
        paintDraw();
      }
      if (draw.ptr && Math.hypot(p.x - draw.ptr.start.x, p.y - draw.ptr.start.y) > S * 0.25) draw.ptr.moved = true;
      return;
    }
    if (!draw.ptr || e.pointerId !== draw.ptr.id) return;
    const ptr = draw.ptr;
    // Chromium can synthesize a move in the newly rotated coordinate system
    // before dispatching resize. It must not count as painting backwards.
    if (ptr.viewport !== `${innerWidth}:${innerHeight}`) { draw.ptr = null; return; }
    if (!ptr.moved && Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y) > S * 0.25) {
      ptr.moved = true;
      if (IS_TEST2 && session!.presetMove) {
        session!.preset(null);
        draw = { ...draw, redraw: true };
      }
      // a drag begins with the hex it started on (a drag from a suggestion reshapes it)
      if (draw.suggested) {
        session!.preset(null);
        draw = { ...draw, suggested: false, shape: ptr.downKey && draw.shape[0] === ptr.downKey ? [ptr.downKey] : [] };
      }
      if (ptr.downKey && !draw.shape.includes(ptr.downKey)) {
        const next = paintEnter(c, draw.shape, ptr.downKey, draw.reverse);
        if (next.length > draw.shape.length) drawTick(next.length - 1);
        draw = { ...draw, shape: next, msg: null };
      }
    }
    // only hexes the finger moves INTO count (fast swipes are sampled so none is skipped)
    const entered: string[] = [];
    for (const k of hexesAlong(ptr.last, p, keys)) {
      if (k === ptr.cur) continue;
      entered.push(k);
      ptr.cur = k;
    }
    ptr.last = p;
    if (!ptr.moved) return;
    let shape = draw.shape;
    let msg = draw.msg;
    for (const k of entered) {
      const next = paintEnter(c, shape, k, draw.reverse);
      if (next.length > shape.length) {
        drawTick(next.length - 1);
        msg = null;
      } else if (next.length === shape.length && !shape.includes(k)) msg = unavailable(session!.view, c, shape, draw.reverse).get(k) ?? msg;
      shape = next;
    }
    draw = { ...draw, shape, msg };
    paintDraw();
  },
  up(p: Pt, e: PointerEvent, inside: boolean) {
    const c = drawCombo();
    const ptr = draw.ptr;
    if (!c || !ptr || ptr.id !== e.pointerId) return;
    draw.ptr = null;
    if (IS_TEST2 && !inside) return cancelDraw('Painting cancelled');
    if (!ptr.moved) {
      // A coach/list/sole-placement preview is a complete choice. Selecting one of its
      // ghost hexes places it, while an ordinary first touch keeps choosing the shape.
      const preset = session!.presetMove;
      if (IS_TEST2 && preset?.t === 'Bloom') {
        if (ptr.downKey && preset.hexes.some((h) => coordKey(h) === ptr.downKey)) return finishDraw(preset);
        session!.preset(null);
        draw = { ...draw, redraw: true };
      }
      if (ptr.downKey) drawTap(c, ptr.downKey, ptr.type);
      return;
    }
    // lifting the finger outside the board: nothing is placed
    if (!inside) return cancelDraw('Painting cancelled');
    // a live two-click shape dragged and released: it finishes where it was released
    if (draw.desk.phase === 'live') {
      const at = hexAtPoint(p.x, p.y, new Set(board.boardKeys));
      // A release in a gap must not substitute the last legal hovered destination.
      if (IS_TEST2 && !at) return cancelDraw('Painting cancelled');
      const k = at ?? draw.desk.hover;
      return drawTap(c, k, ptr.type);
    }
    const g = drawGhostNow(c);
    if (g?.action) return finishDraw(g.action);
    // released early: the partial shape stays (with Clear); a full shape that can't go shakes
    if (draw.shape.length === c.n) {
      board.shake(settings.reduceMotion);
      draw = { ...draw, msg: paintProblem(session!.view, c, draw.shape, draw.reverse) };
    }
    render();
  },
  cancel() {
    if (draw.ptr || draw.shape.length || draw.desk.phase === 'live') cancelDraw();
  },
};

function onHexTap(key: string) {
  sound.unlock();
  if (!session) return;
  if (busy()) fastForward();
  const idleGrowSpot = IS_TEST2 && myTurn() && session.view.phase === 'ACT' &&
    session.sel.card === null && session.sel.kind === null && !session.view.board[key] &&
    session.legal.some(a => a.t === 'Sprout' && coordKey(a.coord) === key);
  if (IS_TEST2 && (!myTurn() ||
      (session.view.phase !== 'ACT' && session.view.phase !== 'ROT_PICK') ||
      (session.view.phase === 'ACT' && ((!idleGrowSpot && session.sel.card === null && session.sel.kind === null) ||
        hexTapIntent(session.view, session.legal, session.sel, key) === 'tilecard')))) {
    boinkTile(key);
    return;
  }
  reactHome(key);
  if (!myTurn() || (session.view.phase !== 'ACT' && session.view.phase !== 'ROT_PICK')) {
    pinCard(inspectKey === key && cardPinned ? null : key);
    return;
  }
  sound.click();
  // An opponent tile the picked card cannot take (or any opponent tile with nothing picked)
  // opens its tile card, which offers "Use Fruit card". The picked card stays picked.
  if (session.view.phase === 'ACT' && hexTapIntent(session.view, session.legal, session.sel, key) === 'tilecard') {
    pinCard(inspectKey === key && cardPinned ? null : key);
    return;
  }
  cardPinned = false;
  // Tapping the previewed hex again plays the move (same as Confirm).
  if (session.sel.hex === key && session.pending && (!IS_TEST2 || (session.pending.t !== 'Bloom' && session.pending.t !== 'Sprout'))) return humanPlay(session.pending);
  session.tapHex(key);
  inspectKey = session.pending ? null : key;
  render();
  maybeAutoPlay();
}

function onInspect(key: string | null) {
  if (IS_TEST2) return;
  // hovering never moves a pinned tile card
  if (cardPinned) return;
  inspectKey = key;
  if (session) renderTooltip(session.view);
}

/** Test2 idle touch response. Never select a tile or change the session. */
function boinkTile(key: string) {
  if (!session?.view.board[key]) return;
  sound.click();
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tile = session.view.board[key]?.root
    ? board.homeEls.find(home=>home.dataset.key === key) : board.tile(key);
  if (!tile) return;
  for (const animation of tile.getAnimations()) if (animation.id === 'test2-boink') animation.cancel();
  tile.classList.add('test2-boink');
  const animation = anim(tile, [
    { scale:'1', rotate:'0deg' },
    { scale:'.97', rotate:'-1.2deg', offset:.25 },
    { scale:'1.025', rotate:'.8deg', offset:.6 },
    { scale:'1', rotate:'0deg' },
  ], { duration:240, easing:'ease-out', fill:'none' });
  if (!animation) { tile.classList.remove('test2-boink'); return; }
  animation.id = 'test2-boink';
  const clear = () => { if (!tile.getAnimations().some(a=>a.id === 'test2-boink' && a.playState !== 'finished' && a.playState !== 'idle')) tile.classList.remove('test2-boink'); };
  void animation.finished.then(clear,clear);
}

/** Step 4: tapping a home: the tree's heartbeat and rustle, or the volcano's thump and rumble. */
function reactHome(key: string) {
  const p = board.homeEls.findIndex((g) => g.dataset.key === key);
  if (p < 0 || board.homeEls[p]!.classList.contains('strangled')) return;
  if (!settings.reduceMotion) pulseLandmark(board.homeEls[p]!, 'tapped');
  if (p === HUMAN) sound.rustle();
  else sound.rumble();
}

/** Opens (and keeps open) the tile card for `key`, or closes it (null). Long-press does the same. */
function pinCard(key: string | null) {
  if (IS_TEST2) { if (key) boinkTile(key); return; }
  inspectKey = key;
  cardPinned = key !== null;
  render();
}

/** "Use Fruit card" in the tile card: the Fruit card and this target are picked (Confirm per "Confirm moves"). */
function useFruitOn(key: string) {
  if (!session) return;
  const offer = fruitOffer(session.view, session.legal, key);
  if (!offer) return;
  sound.click();
  session.cancel();
  pickFruit(offer.action.card);
  session.tapHex(key);
  inspectKey = null;
  cardPinned = false;
  render();
  maybeAutoPlay();
}

/** Picks a card in the hand; a Fruit card's first pick shows the "any strength" note once. */
function pickFruit(id: number) {
  if (!session) return;
  session.tapCard(id);
  if (session.sel.card === id && session.view.hand.find((c) => c.id === id)?.suit === null && !tipsSeen.fruitAny) {
    anyNoteCard = id;
    tipsSeen = markTip(tipsSeen, 'fruitAny');
    store.set(TIPS_KEY, JSON.stringify(tipsSeen));
  }
}
/** The Fruit card the "any strength" note is shown for (the first one picked). */
let anyNoteCard: number | null = null;

const REPLAY_TIP = `Replay ${OPP.theirs} last turn`;
const REPLAY_NONE = `Nothing to replay yet: ${OPP.the} hasn't moved`;
function replayBotTurn() {
  if (!session || busy()) return;
  const turn = session.lastTurnOf(BOT);
  if (!turn.length) return;
  session.cancel();
  replaying = true;
  replaySpeed = REPLAY_SPEED;
  queue.reset(turn[0]!.before.board);
  const v0 = viewFor(turn[0]!.before, HUMAN);
  shownScores = [v0.score, v0.opponentScore];
  for (const p of turn) queue.push(p.steps.filter((s) => s.k !== 'end' && s.k !== 'turn' && !(s.k === 'draw' && s.player === HUMAN)));
  const v = session.view;
  queue.push([{ k: 'sync', board: session.state.board, scores: [v.score, v.opponentScore] }]);
  banner(`Replay: ${OPP.Label} turn`, 'bot');
  render();
  void pump();
}

const bind = (id: string, fn: () => void) =>
  $(id).addEventListener('click', () => {
    sound.unlock();
    fn();
  });

bind('menu-new', () => {
  if (!$('menu-continue').hidden && !window.confirm('Start a new game? The saved game will be lost.')) return;
  showScreen('levels');
});
for (const [sel, p] of [['.hud .score.you', HUMAN], ['.hud .score.bot', BOT]] as const) {
  const el = document.querySelector<HTMLElement>(sel)!;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', () => showBreakdown(p));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') showBreakdown(p);
  });
}
document.addEventListener('pointerdown', (e) => {
  if (!(e.target as Element | null)?.closest?.('.hud .score, #score-pop')) $('score-pop').hidden = true;
});
bind('levels-back', () => showScreen('menu'));
// Overhaul item 11: every button answers a press the same way: a 0.97 press (CSS), a soft
// tick (Sound) and, with Effects High, a tiny tap (Vibration). Nothing plays before a tap.
document.addEventListener(
  'pointerdown',
  (e) => {
    const b = (e.target as Element | null)?.closest?.('.btn, .ctool, .undo-chip, .seg-btn, .chip, .icon-only, .hand-sort, .level-tile');
    if (!b || (b as HTMLButtonElement).disabled) return;
    sound.unlock();
    if (settings.sound) sound.click();
    const hp = hapticFor('press', settings);
    if (hp) vibrate(true, hp as number | number[]);
  },
  { capture: true },
);
bind('hint-btn', () => sheet('sheet-howto'));
bind('hand-sort', () => {
  settings = { ...settings, handSort: nextSort(settings.handSort) };
  saveSettings();
  render();
});
// overhaul item 7: legal hexes brighten softly as the finger or mouse comes near
{
  let raf = 0;
  let last: { x: number; y: number } | null = null;
  const glowNear = () => {
    raf = 0;
    const targets = board.svg.querySelectorAll<SVGPathElement>('.l-over .target');
    if (!targets.length) return;
    const m = board.svg.getScreenCTM();
    const p = last && m ? new DOMPoint(last.x, last.y).matrixTransform(m.inverse()) : null;
    for (const t of targets) {
      const key = t.dataset.key ?? t.getAttribute('data-key');
      const c = key ? centerOf(key) : null;
      const near = p && c ? proximity(Math.hypot(p.x - c.x, p.y - c.y)) : 0;
      t.style.setProperty('--near', near.toFixed(2));
    }
  };
  const track = (e: PointerEvent) => {
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(glowNear);
  };
  board.svg.addEventListener('pointermove', track);
  board.svg.addEventListener('pointerdown', track);
  board.svg.addEventListener('pointerleave', () => {
    last = null;
    if (!raf) raf = requestAnimationFrame(glowNear);
  });
}
// desktop: a card tilts a few degrees toward the pointer
// the test copy: a fan lying over the map is see-through until I touch it
let fanSleep = 0;
$('dock').addEventListener(
  'pointerdown',
  () => {
    if (!FEATURES.mapBehindCards) return;
    document.documentElement.classList.add('fan-awake');
    clearTimeout(fanSleep);
    fanSleep = window.setTimeout(() => document.documentElement.classList.remove('fan-awake'), 3000);
  },
  { capture: true, passive: true },
);
$('hand').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || settings.reduceMotion) return;
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--tilt-x', `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1)}deg`);
  card.style.setProperty('--tilt-y', `${(((e.clientY - r.top) / r.height - 0.5) * -6).toFixed(1)}deg`);
});
$('hand').addEventListener('pointerout', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  card?.style.removeProperty('--tilt-x');
  card?.style.removeProperty('--tilt-y');
});
bind('go-other', () => {
  const lv = Number($('go-other').dataset.level) as Level;
  settings = { ...settings, level: lv };
  saveSettings();
  startGame(randomSeed(), lv);
});
bind('menu-continue', () => continueGame());
bind('menu-tutorial', () => {
  settings = { ...settings, coach: true };
  saveSettings();
  startGame(TUTORIAL_SEED, 7); // the tutorial is tuned for the classic opponent
});
bind('menu-howto', () => sheet('sheet-howto'));
bind('menu-settings', () => sheet('sheet-settings'));
bind('hud-menu', () => sheet('sheet-menu'));
bind('hud-history', () => sheet('sheet-history'));
bind('gm-resume', () => sheet(null));
bind('gm-new', () => {
  if (session && session.state.phase !== 'GAME_OVER' && session.state.turnNumber > 1 && !window.confirm('Start a new game? This one will be lost.')) return;
  sheet(null);
  startGame(randomSeed());
});
bind('gm-howto', () => sheet('sheet-howto'));
bind('gm-settings', () => sheet('sheet-settings'));
bind('gm-main', () => {
  sheet(null);
  fastForward();
  showScreen('menu');
});
bind('restart-tutorial', () => {
  settings = { ...settings, coach: true };
  saveSettings();
  sheet(null);
  startGame(randomSeed());
});
bind('scrim', () => sheet(null));
for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.addEventListener('click', () => sheet(null));

bind('confirm-play', () => {
  if (!session) return;
  const a = session.pending;
  if (a) humanPlay(a);
});
bind('confirm-cancel', () => cancelSel());
bind('confirm-info', () => {
  const k = $('confirm-info').dataset.key;
  if (k) pinCard(k);
});
$('tooltip').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fruit]');
  if (b) useFruitOn(b.dataset.fruit!);
});
bind('first-tip-ok', () => {
  if (tipOpen) {
    tipsSeen = markTip(tipsSeen, tipOpen);
    store.set(TIPS_KEY, JSON.stringify(tipsSeen));
  }
  tipOpen = null;
  render();
});
bind('deck', () => {
  if (busy()) fastForward();
  const a = myTurn() ? session!.legal.find((x) => x.t === 'Draw' && x.from === 'deck') : undefined;
  if (a) humanPlay(a);
});
bind('discard', () => {
  if (busy()) fastForward();
  const a = myTurn() ? session!.legal.find((x) => x.t === 'Draw' && x.from === 'discard') : undefined;
  if (a) humanPlay(a);
});
if (FEATURES.weakTools) bind('tool-weak', () => {
  settings = { ...settings, weakSpots: !settings.weakSpots };
  saveSettings();
  render();
});
if (FEATURES.weakTools) bind('tool-targets', () => {
  showOpps = !showOpps;
  render();
});
bind('tool-skip', () => {
  pill.skip();
  fastForward();
});
bind('tool-replay', () => replayBotTurn());
// Step 3 item 7: the corner tools' tooltips: hover (mouse), long-press (touch), and once
// automatically the first time they appear (one at a time, a few seconds each)
{
  const tip = $('ctool-tip');
  let timer = 0;
  const show = (b: HTMLElement, ms = 0) => {
    const wrap = $('board-wrap').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    tip.textContent = b.dataset.tip ?? '';
    tip.hidden = false;
    const right = r.left - wrap.left > wrap.width / 2;
    const below = r.top - wrap.top < wrap.height / 2;
    tip.style.left = right ? '' : `${r.left - wrap.left}px`;
    tip.style.right = right ? `${wrap.right - r.right}px` : '';
    tip.style.top = below ? `${r.bottom - wrap.top + 6}px` : '';
    tip.style.bottom = below ? '' : `${wrap.bottom - r.top + 6}px`;
    clearTimeout(timer);
    if (ms) timer = window.setTimeout(() => (tip.hidden = true), ms);
  };
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
  };
  for (const b of document.querySelectorAll<HTMLElement>('.ctool')) {
    b.title = '';
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show(b));
    b.addEventListener('pointerleave', hide);
    let press = 0;
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') press = window.setTimeout(() => show(b, 2200), 450);
    });
    for (const ev of ['pointerup', 'pointercancel'] as const) b.addEventListener(ev, () => clearTimeout(press));
  }
  const KEY = 'severgrow.ctools.seen';
  /** The first time the tools show in a game: name each once (shield, then target). */
  firstToolTips = () => {
    if (!FEATURES.weakTools || store.get(KEY)) return;
    store.set(KEY, '1');
    const tools = ['tool-weak', 'tool-targets'].map((id) => document.getElementById(id)).filter((b): b is HTMLElement => !!b && !b.hidden);
    tools.forEach((b, i) => window.setTimeout(() => show(b, 2400), 900 + i * 2700));
  };
}
bind('tool-undo', () => undoMove());
bind('go-rematch', () => startGame(randomSeed(), gameLevel));
bind('go-board', () => {
  gameOverDismissed = true;
  render();
});
bind('go-menu', () => showScreen('menu'));
// Overhaul item 20: replay the game's biggest cut (from the board just before it), then come back here
bind('go-cut', () => {
  const p = session?.biggestCut;
  if (!session || !p || busy()) return;
  gameOverDismissed = true;
  reopenGameOver = true;
  replaying = true;
  replaySpeed = CUT_REPLAY_SPEED;
  queue.reset(p.before.board);
  const v0 = viewFor(p.before, HUMAN);
  shownScores = [v0.score, v0.opponentScore];
  queue.push(p.steps.filter((s) => s.k !== 'end' && s.k !== 'turn' && s.k !== 'draw'));
  const v = session.view;
  queue.push([{ k: 'sync', board: session.state.board, scores: [v.score, v.opponentScore] }]);
  render();
  void pump();
});
// Overhaul item 20: a picture of the result for the share sheet (or saved); nothing is uploaded
bind('go-share', () => {
  const st = session?.state;
  if (!st?.result) return;
  const hl = gameHighlights(st.history ?? [], HUMAN).filter((h) => h.value > 0).map((h) => `${h.title}: ${h.text}`);
  void shareCard({
    game: GAME_TITLE,
    title: $('go-title').textContent ?? '',
    sub: $('go-sub').textContent ?? '',
    score: [st.result.scores[HUMAN], st.result.scores[BOT]],
    highlights: hl,
    board: st.board,
    radius: st.config.boardRadius,
    cells: st.config.board?.cells,
    me: HUMAN,
  }).then((r) => {
    if (r === 'saved') $('go-share').textContent = 'Saved';
  });
});

bind('coach-hide', () => {
  settings = { ...settings, coach: false };
  saveSettings();
  render();
});
bind('coach-show', () => {
  // "Show me where": an arrow points at each thing to tap, one step at a time.
  const advice = currentAdvice();
  if (!session || !advice) return;
  guideGoal = guideGoal ? null : advice.action;
  if (guideGoal) session.cancel();
  render();
});
bind('coach-why-btn', () => {
  coachWhyOpen = !coachWhyOpen;
  render();
});
// Sound and vibration can't be checked from a computer: let the player test them here.
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
bind('test-sound', () => {
  sound.unlock();
  const was = sound.enabled;
  sound.enabled = true;
  sound.click();
  sound.chime(0.15);
  setTimeout(() => sound.snap(), 600);
  setTimeout(() => sound.fanfare(true), 1300);
  setTimeout(() => (sound.enabled = was), 2400);
  $('test-note').textContent = "You should hear a click, a chime, a snap and a short tune. Nothing? Check your phone's silent switch and volume.";
});
bind('test-vibration', () => {
  vibrate(true, [60, 60, 120]);
  $('test-note').textContent = canVibrate ? 'Your phone should buzz three times.' : "This phone's browser doesn't let websites vibrate (iPhones never do).";
});
bind('coach-summary-ok', () => {
  coach.summaryDone = true;
  save();
  render();
});

for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
  input.addEventListener('change', () => {
    const k = input.dataset.setting as keyof Settings;
    settings = { ...settings, [k]: input.checked };
    saveSettings();
    if (k === 'sound') sound.enabled = settings.sound;
    if (k === 'music') {
      sound.unlock();
      sound.setMusic(settings.music);
    }
    if (k === 'reduceMotion' || k === 'largeText' || k === 'eyeCandy') applyTheme();
    else render();
  });
}

// Step 7: the effects and music volume sliders (each its own bus; the limiter is on the master)
for (const input of document.querySelectorAll<HTMLInputElement>('[data-volume]')) {
  input.addEventListener('input', () => {
    const k = input.dataset.volume as 'sfxVolume' | 'musicVolume';
    settings = { ...settings, [k]: Number(input.value) };
    sound.unlock();
    sound.setMix(settings);
  });
  input.addEventListener('change', () => {
    saveSettings();
    if (input.dataset.volume === 'sfxVolume' && settings.sound) sound.click();
  });
}

// Keyboard: arrows move over the board, Enter picks, Esc cancels or closes; 1-9 pick cards.
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openSheet) sheet(null);
    else if (busy()) fastForward();
    // Esc first stops the shape being painted; again, it cancels the bloom
    else if (drawCombo() && (draw.shape.length || draw.desk.phase === 'live' || draw.ptr)) cancelDraw();
    else cancelSel();
    return;
  }
  if (openSheet || !session || $('game').hidden) return;
  const target = e.target as HTMLElement;
  if (/^[1-9]$/.test(e.key) && target.tagName !== 'INPUT') {
    document.querySelectorAll<HTMLButtonElement>('#hand [data-card]')[Number(e.key) - 1]?.click();
    return;
  }
  // Step 7: whole turns from the keyboard: D draws from the deck, T takes the throw pile, U undoes
  if (target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'd') return void $('deck').click();
    if (k === 't') return void $('discard').click();
    if (k === 'u' && !($('tool-undo') as HTMLButtonElement).disabled) return void $('tool-undo').click();
  }
  if (target.id !== 'board') return;
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    const keys = board.boardKeys;
    focusKey = keyStep(focusKey ?? keys[Math.floor(keys.length / 2)]!, e.key, new Set(keys));
    const dc = drawCombo();
    if (dc && draw.desk.phase === 'live') {
      draw = { ...draw, desk: deskHover(draw.desk, focusKey) };
      paintDraw();
    }
    inspectKey = dc ? null : focusKey;
    render();
    $('board').setAttribute('aria-label', `Board: ${describeHex(focusKey)}`);
  } else if ((e.key === 'Enter' || e.key === ' ') && session.presetMove && drawCombo()) {
    e.preventDefault();
    humanPlay(session.presetMove);
  } else if ((e.key === 'Enter' || e.key === ' ') && focusKey) {
    e.preventDefault();
    const dc = drawCombo();
    if (dc) drawTap(dc, focusKey, 'keyboard');
    else onHexTap(focusKey);
  } else if (e.key === 'Backspace' && drawCombo()) {
    e.preventDefault();
    if (draw.desk.phase === 'live') draw = { ...draw, desk: DESK_IDLE };
    else draw = { ...draw, shape: draw.shape.slice(0, -1) };
    paintDraw();
  }
});

function describeHex(key: string) {
  const v = session!.view;
  const t = v.board[key];
  const name = hexName(parseKey(key), v.config.boardRadius);
  if (v.terrain[key] === 'rock') return `${name}, rock`;
  if (!t) return `${name}, empty${v.terrain[key] === 'rich' ? ' gold hex' : ''}`;
  return `${name}, ${t.owner === HUMAN ? 'your' : OPP.noun} ${t.root ? 'root' : `tile, strength ${t.strength}`}`;
}

// In the background, finish animations at once: on return the board is simply current.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) fastForward();
});

// Install as an app and play offline (the service worker caches the page's own files).
// the test copy (/test/) works online only: no worker of its own (main's worker skips it too)
if (!IS_TEST && 'serviceWorker' in navigator && location.protocol === 'https:') {
  const registerOffline = () => {
    navigator.serviceWorker
      .register(typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test2' ? './test2-sw.js' : './sw.js')
      // ask for a newer worker on every launch (browsers may otherwise keep an old one for a day);
      // a moment after registering, when the browser is free to run the check
      .then((r) => setTimeout(() => void r.update().catch(() => undefined), 1500))
      .catch(() => {
        /* offline play is a bonus; the page works without it */
      });
  };
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline, { once: true });
}

// Rotation or resize: just redraw (the game itself is untouched).
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  // A held finger still has the old screen coordinates after rotation. Keep the
  // painted hexes, but stop this pointer before its release can retrace the shape.
  draw.ptr = null;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(), 80);
});
document.addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
    document.documentElement.classList.remove('kbd');
  },
  { capture: true },
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow')) document.documentElement.classList.add('kbd');
});

// ---------- start ----------

/** Read-only hook for the automated browser test (nothing is sent anywhere). */
(window as unknown as Record<string, unknown>).__severgrow = {
  state: () => session?.state ?? null,
  pending: () => session?.pending ?? null,
  canUndo: () => !!session?.canUndo,
  /** tests only: pick this exact Bloom card group (the button picks its family's usual one) */
  pickKind: (kind: string) => {
    if (!session) return;
    session.sel = { ...session.sel, kind, ...(IS_TEST2 ? { hex: null } : {}) };
    if (IS_TEST2) {
      session.preset(null);
      draw = { ...DRAW0 };
      board.ghost(null);
    }
    render();
  },
  /** tests only (filmstrip): play this action for this player, as if chosen */
  playFor: (a: Action, who: Player) => {
    const p = session?.play(a, who);
    if (p) afterPlay(p, who, null);
    return !!p;
  },
  settings: () => ({ ...settings }),
  busy: () => busy(),
  particles: () => ({ alive: particles.alive, peak: particles.peak }),
  world: () => board.worldStats,
};

await mountPlayerEnhancements();
fillIcons();
// once the photo-like grass and lava are painted (in the background), redraw the board with them
onPhotosReady(() => {
  lastBoard = null;
  if (!busy()) render();
});
sound.enabled = settings.sound;
sound.setMix(settings);
sound.musicOn = settings.music;
applyTheme();
if (!IS_TEST2) showSplash();
const params = BOOT_PARAMS;
// Positioning pass: the alignment overlay (the centre line and the 16pt margins), for checking
// the layout by eye: ?align=1 (or ?align=0 to turn it off), remembered; the lab has a switch too
{
  const KEY = 'severgrow.align';
  if (params.has('align')) store.set(KEY, params.get('align') === '1' ? '1' : '');
  document.documentElement.classList.toggle('align-overlay', store.get(KEY) === '1');
}
const urlSeed = Number(params.get('seed'));
if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test' && params.get('lab') === '1') {
  // the dev-only material lab: every material in every palette (?lab=1, add &detail=low for Low)
  for (const id of ['menu', 'levels', 'game']) $(id).hidden = true;
  void import('./lab.js').then((m) => m.showLab(params.get('detail') === 'low' ? 'low' : 'normal', settings.reduceMotion));
} else if (Number.isSafeInteger(urlSeed) && urlSeed > 0) startGame(urlSeed);
else showScreen('menu');

window.dispatchEvent(new Event('severor-ready'));
