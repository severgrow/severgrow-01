// Severgrow in the browser. You (player 1) against GreedyBot. All rules come from the
// engine in src/engine; this file only draws, animates and listens. The game state
// lives in a Session; the board on screen is shown through an AnimQueue whose last
// step always matches the real state, so animations can never leave it wrong.
import { coordKey, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State, View } from '../../src/engine/index.js';
import { COACH_STEPS, TUTORIAL_SEED, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import type { Advice, TipId } from '../../src/playtest/coach.js';
import { cutLoss } from './analysis.js';
import { cardName, hexName, moveCards } from './names.js';
import { AnimQueue, captionFor } from './logic/anim.js';
import type { Step } from './logic/anim.js';
import { gameHighlights } from './logic/highlights.js';
import { isBoardAction, kindsAvailable, options, optionsLabel, targetHexes, usableCards } from './logic/interaction.js';
import { endgameNote, scoreBreakdown } from './logic/endgame.js';
import { guideTarget } from './logic/guide.js';
import { STATS_KEY, parseStats, recordResult, statsLine } from './logic/stats.js';
import { LEVELS } from '../../src/bots/levels.js';
import { describe, resultReason, resultTitle } from './logic/log.js';
import { SAVE_KEY, decodeSave, encodeSave } from './logic/persist.js';
import { previewMove } from './logic/preview.js';
import { Session } from './logic/session.js';
import type { Played } from './logic/session.js';
import { SETTINGS_KEY, SPEEDS, parseSettings, speedFactor } from './logic/settings.js';
import type { Settings } from './logic/settings.js';
import { THEMES, cssVars, resolveColors } from './logic/themes.js';

/** The one look (Ink and glow colours, organic shapes). */
const THEME = THEMES.ink;
import { opportunities, weakSpots } from './logic/weakspots.js';
import { BoardView, NO_OVERLAY, S, centerOf } from './ui/board.js';
import type { Overlay } from './ui/board.js';
import { askBot } from './ui/botClient.js';
import { anim, cardFace, createEffects, shakeFrames } from './ui/effects.js';
import { fillIcons } from './ui/icons.js';
import { Sound, vibrate } from './ui/sound.js';

const HUMAN: Player = 0;
const BOT: Player = 1;
const COACH_KEY_OLD = 'severgrow.coach.enabled';

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
const sameAction = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

// ---------- settings ----------

let settings: Settings = parseSettings(store.get(SETTINGS_KEY), systemReduce());
let stats = parseStats(store.get(STATS_KEY));
const SEEN_KEY = 'severgrow.seen';
if (store.get(SETTINGS_KEY) === null && store.get(COACH_KEY_OLD) === '0') settings = { ...settings, coach: false };
const saveSettings = () => store.set(SETTINGS_KEY, JSON.stringify(settings));
/** Animation time scale (0 = no animations). */
const timeScale = () => speedFactor(settings.speed) * (settings.reduceMotion ? 0.6 : 1);
/** How much things move (0 when reduce motion is on). */
const motion = () => (settings.reduceMotion ? 0 : THEME.style.motion);

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
const board = new BoardView($('board') as unknown as SVGSVGElement, { tap: (k) => onHexTap(k), inspect: (k) => onInspect(k) });
const { flash, sparks, boardWrapPoint, floatText, caption, banner, flyCard, flyBack } = createEffects(board, () => timeScale(), () => motion());

const save = () => {
  if (session) store.set(SAVE_KEY, encodeSave({ state: session.state, coach }));
};

// ---------- the look ----------

function applyTheme() {
  const t = THEME;
  const root = document.documentElement;
  root.dataset.theme = t.id;
  for (const [k, v] of Object.entries(cssVars(t))) root.style.setProperty(k, v);
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('reduce-motion', settings.reduceMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolveColors(t).bg);
  sound.tune(t.style.soundBase, t.style.soundWave);
  if (session) board.setup(session.state.config, session.state.terrain, t.style);
  lastBoard = null;
  drawLogo();
  render();
}

function drawLogo() {
  const c = resolveColors(THEME);
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
function showScreen(name: 'menu' | 'game') {
  $('menu').hidden = name !== 'menu';
  $('game').hidden = name !== 'game';
  if (name === 'menu') {
    const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
    const canContinue = !!saved && saved.state.phase !== 'GAME_OVER';
    $('menu-continue').hidden = !canContinue;
    $('menu-play').textContent = canContinue ? 'New game' : 'Play';
    $('menu-play').classList.toggle('primary', !canContinue);
    $('menu-play').classList.toggle('ghost', canContinue);
    // First visit: point new players at the tutorial.
    const firstVisit = !canContinue && stats.played === 0 && store.get(SEEN_KEY) === null;
    $('menu-welcome').hidden = !firstVisit;
    $('menu-tutorial').classList.toggle('primary', firstVisit);
    $('menu-tutorial').classList.toggle('ghost', !firstVisit);
    if (firstVisit) {
      $('menu-play').classList.remove('primary');
      $('menu-play').classList.add('ghost');
    }
    $('menu-stats').textContent = statsLine(stats);
    renderLevelPickers();
  }
  $('gameover').hidden = true;
  render();
}

function sheet(id: string | null) {
  if (openSheet) openSheet.hidden = true;
  openSheet = id ? $(id) : null;
  $('scrim').hidden = !openSheet;
  if (openSheet) {
    openSheet.hidden = false;
    if (id === 'sheet-settings') syncSettingsForm();
    if (id === 'sheet-history') renderHistory();
    if (id === 'sheet-howto') renderHowTo();
    openSheet.querySelector<HTMLElement>('[data-close], button')?.focus();
  }
}

function renderHowTo() {
  const cfg = session?.state.config;
  const sprout = (cfg?.sproutsPerTurn ?? 1) > 0;
  const limit = cfg && cfg.maxTurnsPerPlayer > 0 ? ` or after ${cfg.maxTurnsPerPlayer} turns each` : '';
  $('howto-body').innerHTML = [
    '<p><b>Goal:</b> have more points than the bot at the end. Each tile scores 1 point, or 2 on a gold hex.</p>',
    '<p><b>Your turn:</b> draw a card, play cards to grow tiles, then throw one card away.</p>',
    `<p><b>Grow:</b> 3 or more cards in a row of one suit grow a <b>line</b>. 3 or more cards with the same number grow a <b>clump</b>.${sprout ? ' Once per turn you can <b>sprout</b> one tile with any single card.' : ''}</p>`,
    '<p><b>Strength:</b> a tile is as strong as its card. A stronger tile can replace a weaker bot tile.</p>',
    '<p><b>Stay joined:</b> every tile must link back to your root (the big bulb). Lose a link and everything past it is cut off.</p>',
    "<p><b>Win early:</b> surround the bot's root so it can't grow.</p>",
    `<p><b>The end:</b> the game ends when the deck runs out${limit}. Higher score wins; a tie goes to the bot.</p>`,
    '<p class="muted">Tap a card to see where it can go. Tap or hold a tile to see what it is worth.</p>',
  ].join('');
}

const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;
function renderLevelPickers() {
  for (const host of document.querySelectorAll<HTMLElement>('[data-level-seg]')) {
    host.replaceChildren(
      ...LEVELS.map((lv) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `seg-btn${settings.level === lv ? ' on' : ''}`;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(settings.level === lv));
        b.textContent = LEVEL_NAMES[lv];
        b.addEventListener('click', () => {
          settings = { ...settings, level: lv };
          saveSettings();
          renderLevelPickers();
        });
        return b;
      }),
    );
  }
}

function syncSettingsForm() {
  renderLevelPickers();
  // Phones whose browser cannot vibrate (all iPhones) get an honest label, not a dead switch.
  const vib = document.querySelector<HTMLInputElement>('[data-setting="vibration"]')!;
  vib.disabled = !('vibrate' in navigator);
  $('vibration-label').textContent = vib.disabled ? 'Vibration (not available on this phone)' : 'Vibration';
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
    input.checked = !!settings[input.dataset.setting as keyof Settings];
  }
  $('speed-seg').replaceChildren(
    ...SPEEDS.map((sp) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg-btn${settings.speed === sp ? ' on' : ''}`;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(settings.speed === sp));
      b.textContent = sp === 'skip' ? 'Off' : sp[0]!.toUpperCase() + sp.slice(1);
      b.addEventListener('click', () => {
        settings.speed = sp;
        saveSettings();
        if (sp === 'skip') fastForward();
        syncSettingsForm();
      });
      return b;
    }),
  );
}

// ---------- starting games ----------

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;

function beginSession(state: State, c: CoachProgress | null) {
  epoch++;
  for (const w of [...waiters]) w();
  pumping = false;
  session = new Session(state, HUMAN);
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
  board.setup(state.config, state.terrain, THEME.style);
  lastBoard = null;
  showScreen('game');
  scheduleBot();
}

function startGame(seed: number) {
  store.set(SEEN_KEY, '1');
  log = [`New game against the ${LEVEL_NAMES[settings.level].toLowerCase()} bot. You go first.`];
  beginSession(newGame(seed), null);
  save();
  banner('Your turn');
}

function continueGame() {
  const saved = decodeSave<CoachProgress>(store.get(SAVE_KEY));
  if (!saved) return startGame(randomSeed());
  log = ['Welcome back.'];
  beginSession(saved.state, saved.coach);
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
    if (p.before.phase !== 'GAME_OVER') {
      stats = recordResult(stats, p.after.result, HUMAN);
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
  queue.push(p.steps);
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
}

function scheduleBot() {
  if (!session || botBusy) return;
  const st = session.state;
  if (st.phase === 'GAME_OVER' || st.actor !== BOT) return;
  botBusy = true;
  const my = epoch;
  void (async () => {
    await idle();
    if (my !== epoch || !session) return;
    const first = session.state.phase === 'DRAW';
    const started = performance.now();
    thinking = true;
    renderHud();
    const action = await askBot(viewFor(session.state, BOT), settings.level);
    // A short think before the bot's turn and before each tile move; housekeeping is quick.
    const grows = action.t === 'MeldRun' || action.t === 'MeldSet' || action.t === 'Sprout';
    const beat = (first ? 550 : grows ? 300 : 90) * timeScale();
    const left = beat - (performance.now() - started);
    if (left > 0) await wait(left, my);
    thinking = false;
    if (my !== epoch || !session) return;
    const p = session.play(action, BOT);
    botBusy = false;
    if (p) afterPlay(p, BOT, null);
    else render();
  })();
}
let thinking = false;
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

async function pump() {
  if (pumping) return;
  pumping = true;
  const my = epoch;
  while (queue.pending > 0) {
    if (my !== epoch) return;
    if (timeScale() === 0) {
      fastForward();
      return;
    }
    await playStep(queue.peek()!, my);
  }
  if (my !== epoch) return;
  pumping = false;
  render();
  flushIdle();
}

const hexDist = (a: string, b: string) => {
  const p = parseKey(a);
  const q = parseKey(b);
  return Math.max(Math.abs(p.q - q.q), Math.abs(p.r - q.r), Math.abs(p.q + p.r - q.q - q.r));
};

async function playStep(step: Step, my: number) {
  const f = timeScale();
  const m = motion();
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
        const to = document.querySelector<HTMLElement>(`#hand [data-card="${step.card.id}"]`);
        const from = (step.from === 'deck' ? $('deck') : $('discard')).getBoundingClientRect();
        if (to) {
          const r = to.getBoundingClientRect();
          anim(to, m === 0 ? [{ opacity: 0 }, { opacity: 1 }] : [{ translate: `${from.left - r.left}px ${from.top - r.top}px`, scale: '0.7', opacity: 0.3 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: 380 * f, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
        sound.click();
        await wait(240 * f, my);
      } else {
        flyBack($('deck'), document.querySelector<HTMLElement>('.score.bot')!, f);
        await wait(120 * f, my);
      }
      return;
    }
    case 'grow': {
      const by = step.player;
      if (!show()) return;
      const per = (step.style === 'line' ? 140 : step.style === 'bloom' ? 110 : 0) * f;
      const cx = step.tiles.reduce((s, t) => s + centerOf(t.key).x, 0) / step.tiles.length;
      const cy = step.tiles.reduce((s, t) => s + centerOf(t.key).y, 0) / step.tiles.length;
      let last = 0;
      step.tiles.forEach((t, i) => {
        const tileEl = board.tile(t.key);
        const p = centerOf(t.key);
        const delay = step.style === 'line' ? i * per : step.style === 'bloom' ? (Math.hypot(p.x - cx, p.y - cy) / (S * 1.7)) * per : 0;
        last = Math.max(last, delay);
        const frames: Keyframe[] =
          m === 0
            ? [{ opacity: 0 }, { opacity: 1 }]
            : step.style === 'sprout'
              ? [{ transform: 'scale(0)' }, { transform: `scale(${1 + 0.32 * m})`, offset: 0.55 }, { transform: `scale(${1 - 0.08 * m})`, offset: 0.8 }, { transform: 'scale(1)' }]
              : step.style === 'bloom'
                ? [{ transform: 'scale(0.1)', opacity: 0 }, { transform: `scale(${1 + 0.14 * m})`, opacity: 1, offset: 0.7 }, { transform: 'scale(1)' }]
                : [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }];
        anim(tileEl, frames, { duration: (step.style === 'sprout' ? 460 : 360) * f, delay, easing: 'cubic-bezier(.2,.8,.3,1.1)' });
        if (t.replaced) {
          sparks(t.key, by === HUMAN ? 'bot' : 'you', delay, f);
          setTimeout(() => sound.sparks(), delay);
        }
        if (session?.state.terrain[t.key] === 'rich') sound.chime(delay / 1000 + 0.08);
      });
      // The veins of the new tiles grow in after them.
      for (const v of board.veinsTouching(new Set(step.tiles.map((t) => t.key)))) {
        anim(v, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 * f, delay: last + 120 * f });
      }
      sound.grow(step.tiles.length, per || 60);
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, step.tiles[Math.floor(step.tiles.length / 2)]!.key, by === HUMAN ? 'good' : 'info');
      await wait(last + 420 * f, my);
      return;
    }
    case 'sever': {
      const keys = new Set(step.keys);
      const mine = step.player === HUMAN;
      // The snap: a flash at the cut and a short shake, then the cut-off tiles fade
      // to grey and wither in a ripple outward from the cut.
      flash(step.origin, f, true);
      if (m > 0) anim($('board-wrap'), shakeFrames(7 * m), { duration: 340 * Math.max(f, 0.5) });
      sound.snap();
      vibrate(settings.vibration, mine ? [40, 30, 80] : 35);
      for (const v of board.veinsTouching(keys)) anim(v, [{ opacity: 1 }, { opacity: 1, offset: 0.15 }, { opacity: 0.2, offset: 0.3 }, { opacity: 0.8, offset: 0.4 }, { opacity: 0 }], { duration: 480 * f, fill: 'forwards' });
      let far = 0;
      for (const k of step.keys) {
        const d = hexDist(k, step.origin);
        far = Math.max(far, d);
        const tileEl = board.tile(k);
        tileEl?.classList.add('withering');
        anim(
          tileEl,
          m === 0
            ? [{ opacity: 1 }, { opacity: 0.35, offset: 0.5 }, { opacity: 0 }]
            : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.85, transform: 'scale(.94)', offset: 0.35 }, { opacity: 0, transform: `scale(${1 - 0.5 * m}) rotate(${(d % 2 ? 1 : -1) * 10 * m}deg)` }],
          { duration: 600 * f, delay: 220 * f + d * 110 * f, fill: 'forwards', easing: 'ease-in' },
        );
      }
      setTimeout(() => sound.sad(), 300 * f);
      floatText(`−${plural(step.keys.length, 'tile')}`, step.origin, mine ? 'bad' : 'good', f);
      caption(captionFor(step, HUMAN)!, step.origin, mine ? 'bad' : 'good');
      await wait(220 * f + far * 110 * f + 640 * f, my);
      show();
      return;
    }
    case 'remove': {
      for (const k of step.keys) anim(board.tile(k), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 * f, fill: 'forwards' });
      await wait(320 * f, my);
      show();
      return;
    }
    case 'discard': {
      const from = step.player === HUMAN ? cardRects.get(step.card.id) : document.querySelector<HTMLElement>('.score.bot')!.getBoundingClientRect();
      if (from) flyCard(step.card, from, $('discard').getBoundingClientRect(), f);
      const cap = captionFor(step, HUMAN);
      if (cap) caption(cap, null, 'info');
      await wait(320 * f, my);
      show();
      return;
    }
    case 'strangle': {
      const root = board.rootKey(step.loser);
      // The surrounding tiles squeeze inward twice, a slow beat, then the flourish.
      const rc = centerOf(root);
      for (const k of board.boardKeys) {
        const tileEl = board.tile(k);
        const p = centerOf(k);
        if (!tileEl || k === root || Math.hypot(p.x - rc.x, p.y - rc.y) > S * 1.9) continue;
        anim(tileEl, [{ translate: '0 0' }, { translate: `${(rc.x - p.x) * 0.14 * Math.max(m, 0.3)}px ${(rc.y - p.y) * 0.14 * Math.max(m, 0.3)}px`, offset: 0.45 }, { translate: '0 0' }], { duration: 700 * f, iterations: 2 });
      }
      await wait(1400 * f, my);
      flash(root, f * 1.6, true);
      if (m > 0) anim($('board-wrap'), shakeFrames(5 * m), { duration: 500 * f });
      sound.snap();
      caption(captionFor(step, HUMAN)!, root, step.loser === HUMAN ? 'bad' : 'good');
      await wait(500 * f, my);
      show();
      return;
    }
    case 'turn': {
      if (!show()) return;
      banner(step.player === HUMAN ? (step.final ? 'Your last turn' : 'Your turn') : "Bot's turn");
      await wait(320 * f, my);
      return;
    }
    case 'end': {
      if (!show()) return;
      const won = step.result.winner === HUMAN;
      sound.fanfare(won);
      vibrate(settings.vibration, won ? [30, 60, 30, 60, 140] : 70);
      if (won) for (let i = 0; i < 4; i++) setTimeout(() => flash(board.rootKey(HUMAN), f, false), i * 170 * f);
      await wait(800 * f, my);
      return;
    }
    case 'sync':
      show();
      return;
  }
}

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
    if (k < 1) scoreRaf = requestAnimationFrame(tick);
  };
  scoreRaf = requestAnimationFrame(tick);
  if (target[0] !== start[0]) anim($('score-you'), [{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 420 });
  if (target[1] !== start[1]) anim($('score-bot'), [{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 420 });
}

// ---------- rendering ----------

const busy = () => queue.pending > 0 || pumping;
const myTurn = () => !!session && session.state.actor === HUMAN && session.state.phase !== 'GAME_OVER';

function render() {
  if (!session || $('game').hidden) return;
  const v = session.view;
  const advice = myTurn() && !busy() ? currentAdvice() : null;
  renderHud();
  renderBoard(v, advice);
  renderControls(v, advice);
  renderHand(v, advice);
  renderPiles(v);
  renderCoach(advice);
  renderGameOver();
  renderGuide(advice);
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
  let t = guideTarget(session.view, session.legal, session.sel, guideGoal);
  if (t?.kind === 'other') {
    // Right card and hex: switch straight to the coach's way of growing there.
    session.sel = { ...session.sel, option: t.option };
    render();
    return;
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
  }
  if (!rect) return;
  arrow.hidden = false;
  arrow.dataset.target = t.kind === 'card' ? `card:${t.id}` : t.kind === 'hex' ? `hex:${t.key}` : t.kind;
  arrow.style.left = `${rect.x}px`;
  arrow.style.top = `${rect.y}px`;
}

function renderHud() {
  if (!session) return;
  const st = session.state;
  if (!busy()) shownScores = [session.view.score, session.view.opponentScore];
  $('score-you').textContent = String(shownScores[0]);
  $('score-bot').textContent = String(shownScores[1]);
  const over = st.phase === 'GAME_OVER' && !busy();
  const turn = $('turn');
  turn.className = `turn ${over ? 'over' : st.turnPlayer === HUMAN ? 'you' : 'bot'}${thinking ? ' thinking' : ''}`;
  const each = st.config.maxTurnsPerPlayer;
  const turnNo = Math.min(Math.ceil(st.turnNumber / 2), each > 0 ? each : Infinity);
  turn.innerHTML = over
    ? '<b>Game over</b>'
    : `<b>${st.turnPlayer === HUMAN ? 'Your turn' : thinking ? 'Bot thinking<span class="dots"><i></i><i></i><i></i></span>' : "Bot's turn"}</b><small>Turn ${turnNo}${each > 0 ? ` of ${each}` : ''}</small>`;
  $('hint').textContent = hintText(session.view);
  const note = st.phase === 'GAME_OVER' ? null : endgameNote(session.view);
  $('endnote').hidden = !note;
  $('endnote').textContent = note ?? '';
  // The turn as three steps; the current one is lit (only on your turn).
  const steps = $('steps');
  steps.hidden = st.phase === 'GAME_OVER';
  steps.classList.toggle('idle', st.actor !== HUMAN || busy());
  for (const li of steps.querySelectorAll<HTMLElement>('li')) {
    const on = st.actor === HUMAN && !busy() && li.dataset.step === st.phase;
    li.classList.toggle('on', on);
    if (on) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  }
}

/** In the default game (Rot and Knock off) throwing a card away ends the turn. */
const discardEndsTurn = (v: View) => !v.config.rotEnabled && !v.config.knockEnabled && !v.finalTurn;

function hintText(v: View): string {
  if (!session) return '';
  if (v.phase === 'GAME_OVER') return busy() ? '' : 'Game over.';
  if (v.actor !== HUMAN) return busy() ? 'Watch the bot’s move…' : 'The bot is thinking…';
  if (busy()) return '';
  const low = v.deckCount <= 3 ? ` ${v.deckCount === 0 ? 'The deck is empty.' : `Only ${plural(v.deckCount, 'card')} left.`}` : '';
  const sel = session.sel;
  switch (v.phase) {
    case 'DRAW':
      return `Draw a card: tap the deck or the discard pile.${low}`;
    case 'ACT': {
      if (session.pending) return settings.confirmMoves ? 'Check the preview, then Confirm.' : '';
      if (sel.card !== null) return targetHexes(v, session.legal, sel).size ? 'Tap a glowing hex to grow there.' : "That card can't grow anywhere now.";
      if (sel.kind !== null) return 'Tap a glowing hex.';
      if (sel.hex !== null) return 'Nothing grows there right now.';
      if (v.hand.length === 0) return 'No cards left. Tap “End turn”.';
      return session.legal.some(isBoardAction) ? 'Tap a card to see where it can grow. Done? Tap “Throw a card away”.' : 'Nothing to grow this time. Tap “Throw a card away”.';
    }
    case 'DISCARD':
      return discardEndsTurn(v) ? 'Last step: throw 1 card away. Then your turn ends.' : 'Throw 1 card away.';
    case 'KNOCK':
      return 'Knock to end the game soon, or end your turn.';
    case 'ROT_PICK':
      return 'Tap the bot tile that rots.';
    default:
      return '';
  }
}

function renderBoard(v: View, advice: Advice | null) {
  if (!session) return;
  let o: Overlay = { ...NO_OVERLAY, scars: scars.map(({ key, owner }) => ({ key, owner })), focusKey };
  if (myTurn() && !busy()) {
    const sel = session.sel;
    const pending = session.pending;
    const pv = pending ? previewMove(v, pending) : null;
    const anySel = sel.card !== null || sel.kind !== null || sel.hex !== null;
    o = {
      ...o,
      targets: !pending && (sel.card !== null || sel.kind !== null) ? targetHexes(v, session.legal, sel) : null,
      selectedHex: sel.hex ?? (pending?.t === 'RotPick' ? coordKey(pending.coord) : null),
      ghosts: pv?.ghosts ?? [],
      cutKeys: pv?.cutKeys ?? [],
      coachHexes: advice && !anySel ? advice.hexes.map(coordKey) : [],
      usable: true,
    };
  }
  if (!busy()) {
    if (settings.weakSpots) o.weak = weakSpots(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
    if (showOpps) o.opps = opportunities(v, { anyReach: true, minLoss: 2 }).slice(0, 3);
  }
  // Redraw the board only when something on it changed (cheaper on older phones).
  const key = JSON.stringify({ ...o, targets: o.targets ? [...o.targets] : null });
  if (queue.board !== lastBoard || key !== lastOverlay) {
    board.render(queue.board, o);
    lastBoard = queue.board;
    lastOverlay = key;
  }
  $('tool-weak').setAttribute('aria-pressed', String(settings.weakSpots));
  $('tool-targets').setAttribute('aria-pressed', String(showOpps));
  $('tool-skip').hidden = !busy();
  $('tool-replay').hidden = busy() || session.lastTurnOf(BOT).length === 0;
  renderTooltip(v);
}

function renderTooltip(v: View) {
  const tip = $('tooltip');
  if (!inspectKey || busy() || !session) {
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
  else if (!t) html = `<b>${name} · Empty${gold ? ' gold hex' : ''}</b><span>A tile here scores ${gold ? 2 : 1}.</span>`;
  else {
    const mine = t.owner === HUMAN;
    const who = mine ? 'Your' : "Bot's";
    if (t.root) html = `<b>${name} · ${who} root</b><span>It can never be taken.</span>`;
    else {
      const loss = cutLoss(v, key).length;
      const top = t.strength >= v.config.maxRank ? ' · top strength, can’t be replaced' : '';
      const lose = loss > 1 ? `If lost, ${mine ? 'you lose' : 'the bot loses'} ${loss} tiles.` : 'Losing it cuts nothing else.';
      html = `<b>${name} · ${who} tile</b><span>Strength ${t.strength}${top}${gold ? ' · gold: scores 2' : ''}</span><span>Joined to ${mine ? 'your' : 'its'} root. ${lose}</span>`;
    }
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const p = boardWrapPoint(key);
  const wrap = $('board-wrap').getBoundingClientRect();
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
    sound.click();
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
  const coachKind = advice?.action.t === 'Sprout' ? 'sprout' : null;

  if (v.phase === 'DRAW') {
    for (const a of legal) {
      if (a.t !== 'Draw') continue;
      const glow = advice && sameAction(advice.action, a) ? ' coach-glow' : '';
      moves.append(a.from === 'deck' ? button('Draw a card', `primary${glow}`, () => humanPlay(a)) : button(`Take ${cardName(v.discard.at(-1)!)}`, `ghost${glow}`, () => humanPlay(a)));
    }
  } else if (v.phase === 'ACT') {
    for (const k of kindsAvailable(v, legal, sel)) {
      const on = sel.kind === k.kind;
      const b = button(k.label, `kind${on ? ' on' : ''}${coachKind === k.kind && !anySel ? ' coach-glow' : ''}`, () => {
        session!.tapKind(k.kind);
        render();
      });
      b.setAttribute('aria-pressed', String(on));
      moves.append(b);
    }
    // Done growing: the next step is throwing a card away (or, with an empty hand, the turn just ends).
    const end = legal.find((a) => a.t === 'EndAct');
    const label = v.hand.length > 0 ? 'Throw a card away' : 'End turn';
    if (end && !pending) moves.append(button(label, `end ${anySel ? 'ghost' : 'primary'}${advice?.action.t === 'EndAct' ? ' coach-glow' : ''}`, () => humanPlay(end), `${label}: stop growing tiles`));
  } else if (v.phase === 'DISCARD') {
    const note = document.createElement('p');
    note.className = 'step-note';
    note.textContent = 'Pick 1 card to throw away';
    moves.append(note);
  } else {
    for (const a of legal) {
      if (isBoardAction(a) || a.t === 'Discard') continue;
      moves.append(button(a.t === 'Continue' ? 'End turn' : a.t === 'Knock' ? 'Knock' : a.t, 'primary', () => humanPlay(a)));
    }
  }
  if (anySel && !pending) moves.append(button('Cancel', 'ghost cancel', () => cancelSel()));
  if (session.canUndo && !anySel) moves.append(button('Undo', 'ghost undo', () => undoMove(), 'Undo your last move'));

  if (pending) {
    const pv = previewMove(v, pending);
    $('confirm-chip').textContent = pv ? pv.chip : pending.t === 'Discard' ? `Throw away ${cardName(v.hand.find((c) => c.id === pending.card)!)}` : '';
    $('confirm-play').textContent = pending.t === 'Discard' && discardEndsTurn(v) ? 'Throw away & end turn' : pending.t === 'Discard' ? 'Throw away' : 'Confirm';
    const warn = $('confirm-warn');
    warn.hidden = !pv?.warning;
    warn.textContent = pv?.warning ?? '';
    const opts = options(v, legal, sel);
    const n = opts.length;
    const other = $('confirm-other');
    other.hidden = n < 2;
    other.textContent = `${optionsLabel(opts)} ${(sel.option % Math.max(n, 1)) + 1}/${n}`;
    $('confirm').hidden = false;
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
  const cards = [...v.hand].sort((a, b) => a.suit - b.suit || a.rank - b.rank || a.id - b.id);
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
    b.className = `card s${c.suit}${lifted ? ' lifted' : ''}${playable ? ' playable' : ''}${legal.length > 0 && !playable ? ' dim' : ''}${coachCards.has(c.id) ? ' coach-glow' : ''}`;
    b.style.setProperty('--rot', `${(off * spread).toFixed(2)}deg`);
    b.style.setProperty('--dy', `${(off * off * 0.7).toFixed(1)}px`);
    b.style.visibility = hiddenCards.has(c.id) ? 'hidden' : '';
    b.setAttribute('aria-label', `${cardName(c)}${playable ? ', can be played' : ''}${lifted ? ', picked' : ''}`);
    b.setAttribute('aria-pressed', String(lifted));
    if (hand.children[i] !== b) hand.insertBefore(b, hand.children[i] ?? null);
  });
  for (const b of existing.values()) b.remove();
  hand.style.setProperty('--n', String(n));
  hand.classList.toggle('waiting', !myTurn());
}

const rememberCardRects = () => {
  cardRects = new Map([...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((b) => [Number(b.dataset.card), b.getBoundingClientRect()]));
};

function renderPiles(v: View) {
  $('deck-count').textContent = String(v.deckCount);
  const canDraw = myTurn() && !busy() && v.phase === 'DRAW';
  $('deck').setAttribute('aria-label', `Deck: ${plural(v.deckCount, 'card')}.${canDraw ? ' Tap to draw.' : ''}`);
  const top = v.discard.at(-1);
  const t = $('discard-top');
  t.className = `pile-top${top ? ` card s${top.suit}` : ' empty'}`;
  t.innerHTML = top ? cardFace(top) : '';
  $('discard').setAttribute('aria-label', top ? `Discard pile: ${cardName(top)} on top.${canDraw ? ' Tap to take it.' : ''}` : 'Discard pile: empty');
  $('deck').classList.toggle('ready', canDraw && session!.legal.some((a) => a.t === 'Draw' && a.from === 'deck'));
  $('discard').classList.toggle('ready', canDraw && session!.legal.some((a) => a.t === 'Draw' && a.from === 'discard'));
}

function renderCoach(advice: Advice | null) {
  const box = $('coach');
  const showSummary = settings.coach && coach.step >= COACH_STEPS && !coach.summaryDone && session?.state.phase !== 'GAME_OVER';
  box.hidden = !(advice || showSummary) || busy();
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
  $('go-title').textContent = resultTitle(r, HUMAN);
  go.className = `gameover ${r.winner === HUMAN ? 'won' : r.winner === null ? 'draw' : 'lost'}`;
  $('go-score').innerHTML = `<span class="you">${r.scores[HUMAN]}</span><span class="dash">–</span><span class="bot">${r.scores[BOT]}</span>`;
  $('go-reason').textContent = resultReason(r, HUMAN);
  const part = (p: Player) => {
    const b = scoreBreakdown(st, p);
    return `${b.tiles} tile${b.tiles === 1 ? '' : 's'}${b.gold ? ` (${b.gold} on gold)` : ''}`;
  };
  $('go-break').textContent = `You: ${part(HUMAN)} · Bot: ${part(BOT)}`;
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
  fastForward();
  if (!session.undo()) return;
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
  session?.cancel();
  inspectKey = null;
  render();
}

/** With "Confirm moves" off, a complete choice plays at once. */
function maybeAutoPlay() {
  if (!session || settings.confirmMoves) return;
  const a = session.pending;
  if (a && (a.t === 'Discard' || session.sel.hex !== null)) humanPlay(a);
}

function onCardTap(id: number) {
  sound.unlock();
  if (!session) return;
  if (busy()) fastForward();
  if (!myTurn()) return;
  sound.click();
  session.tapCard(id);
  inspectKey = null;
  render();
  maybeAutoPlay();
}

function onHexTap(key: string) {
  sound.unlock();
  if (!session) return;
  if (busy()) fastForward();
  if (!myTurn() || (session.view.phase !== 'ACT' && session.view.phase !== 'ROT_PICK')) {
    inspectKey = inspectKey === key ? null : key;
    render();
    return;
  }
  sound.click();
  session.tapHex(key);
  inspectKey = session.pending ? null : key;
  render();
  maybeAutoPlay();
}

function onInspect(key: string | null) {
  inspectKey = key;
  if (session) renderTooltip(session.view);
}

function replayBotTurn() {
  if (!session || busy()) return;
  const turn = session.lastTurnOf(BOT);
  if (!turn.length) return;
  session.cancel();
  queue.reset(turn[0]!.before.board);
  const v0 = viewFor(turn[0]!.before, HUMAN);
  shownScores = [v0.score, v0.opponentScore];
  for (const p of turn) queue.push(p.steps.filter((s) => s.k !== 'end' && s.k !== 'turn' && !(s.k === 'draw' && s.player === HUMAN)));
  const v = session.view;
  queue.push([{ k: 'sync', board: session.state.board, scores: [v.score, v.opponentScore] }]);
  banner('Replay: bot’s turn');
  render();
  void pump();
}

const bind = (id: string, fn: () => void) =>
  $(id).addEventListener('click', () => {
    sound.unlock();
    fn();
  });

bind('menu-play', () => {
  if (!$('menu-continue').hidden && !window.confirm('Start a new game? The saved game will be lost.')) return;
  startGame(randomSeed());
});
bind('menu-continue', () => continueGame());
bind('menu-tutorial', () => {
  settings = { ...settings, coach: true };
  saveSettings();
  startGame(TUTORIAL_SEED);
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
bind('confirm-other', () => {
  session?.nextOption();
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
bind('tool-weak', () => {
  settings = { ...settings, weakSpots: !settings.weakSpots };
  saveSettings();
  render();
});
bind('tool-targets', () => {
  showOpps = !showOpps;
  render();
});
bind('tool-skip', () => fastForward());
bind('tool-replay', () => replayBotTurn());
bind('go-rematch', () => startGame(randomSeed()));
bind('go-board', () => {
  gameOverDismissed = true;
  render();
});
bind('go-menu', () => showScreen('menu'));

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
    if (k === 'reduceMotion' || k === 'largeText') applyTheme();
    else render();
  });
}

// Keyboard: arrows move over the board, Enter picks, Esc cancels or closes; 1-9 pick cards.
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openSheet) sheet(null);
    else if (busy()) fastForward();
    else cancelSel();
    return;
  }
  if (openSheet || !session || $('game').hidden) return;
  const target = e.target as HTMLElement;
  if (/^[1-9]$/.test(e.key) && target.tagName !== 'INPUT') {
    document.querySelectorAll<HTMLButtonElement>('#hand [data-card]')[Number(e.key) - 1]?.click();
    return;
  }
  if (target.id !== 'board') return;
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    const keys = board.boardKeys;
    const cur = parseKey(focusKey ?? keys[Math.floor(keys.length / 2)]!);
    const [dq, dr] = dir;
    // Up and down alternate between the two hexes above (or below) to stay in a column.
    const shift = dr === 0 ? 0 : dr < 0 ? (cur.r % 2 === 0 ? 1 : 0) : cur.r % 2 === 0 ? 0 : -1;
    const next = coordKey({ q: cur.q + dq + shift, r: cur.r + dr });
    focusKey = keys.includes(next) ? next : coordKey(cur);
    inspectKey = focusKey;
    render();
    $('board').setAttribute('aria-label', `Board: ${describeHex(focusKey)}`);
  } else if ((e.key === 'Enter' || e.key === ' ') && focusKey) {
    e.preventDefault();
    onHexTap(focusKey);
  }
});

function describeHex(key: string) {
  const v = session!.view;
  const t = v.board[key];
  const name = hexName(parseKey(key), v.config.boardRadius);
  if (v.terrain[key] === 'rock') return `${name}, rock`;
  if (!t) return `${name}, empty${v.terrain[key] === 'rich' ? ' gold hex' : ''}`;
  return `${name}, ${t.owner === HUMAN ? 'your' : 'bot'} ${t.root ? 'root' : `tile, strength ${t.strength}`}`;
}

// In the background, finish animations at once: on return the board is simply current.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) fastForward();
});

// Install as an app and play offline (the service worker caches the page's own files).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline play is a bonus; the page works without it */
    });
  });
}

// Rotation or resize: just redraw (the game itself is untouched).
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
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
  settings: () => ({ ...settings }),
  busy: () => busy(),
};

fillIcons();
sound.enabled = settings.sound;
sound.musicOn = settings.music;
applyTheme();
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
if (Number.isSafeInteger(urlSeed) && urlSeed > 0) startGame(urlSeed);
else showScreen('menu');
