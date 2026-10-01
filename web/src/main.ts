// Severgrow in the browser: you (green, player 1) against a simple bot (purple).
// All rules come from the engine in src/engine; this file only draws and clicks.
import { SUIT_NAMES, allCoords, apply, coordKey, legalActions, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import { rankActions } from '../../src/bots/GreedyBot.js';
import type { Action, Coord, GameResult, Player, State, View } from '../../src/engine/index.js';
import { cutLoss, dangerWarning, threats } from './analysis.js';
import { chooseAction } from './bot.js';
import { COACH_STEPS, TUTORIAL_SEED, coachAdvice, coachSummary } from '../../src/playtest/coach.js';
import type { Advice, TipId } from '../../src/playtest/coach.js';
import { SUIT_ICONS, cardName, hexName, moveCards, moveHexes, moveSentence, touchesHex } from './names.js';

const HUMAN: Player = 0;
const BOT: Player = 1;
const SAVE_KEY = 'severgrow.save.v4';
const COACH_KEY = 'severgrow.coach.enabled';
const PAGE_SIZE = 15;
const BOT_DELAY_MS = 650;

let state: State;
let log: string[] = [];
let selected: Action | null = null;
let filterHex: string | null = null;
let filterCard: number | null = null;
let inspectKey: string | null = null;
let hoverKey: string | null = null;
let shownLimit = PAGE_SIZE;
let flash: string[] = [];
let botTimer: ReturnType<typeof setTimeout> | undefined;

/** Coach progress for the current game (saved with it). */
type CoachProgress = { step: number; taught: TipId[]; known: string[]; choice: number; summaryDone: boolean };
const freshCoach = (): CoachProgress => ({ step: 0, taught: [], known: [], choice: 0, summaryDone: false });
let coach: CoachProgress = freshCoach();
/** The coach's advice for the current position (recomputed on every render). */
let advice: Advice | null = null;

/** True when a parked leftover-card rule (Rot or Knock) is switched on (spec appendix A). */
const parkedOn = () => state.config.rotEnabled || state.config.knockEnabled;
/** When true, the move list shows only Sprout moves (best first). */
let sproutMode = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};

// ---------- small storage helpers (per device, best effort) ----------

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

const save = () => store.set(SAVE_KEY, JSON.stringify({ state, log, coach }));

const load = (): boolean => {
  try {
    const raw = store.get(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { state: State; log: string[]; coach?: CoachProgress };
    if (!saved.state?.board || !Array.isArray(saved.log)) return false;
    state = saved.state;
    log = saved.log;
    coach = saved.coach ?? freshCoach();
    return true;
  } catch {
    return false;
  }
};

/** The coach is on unless the player turned it off (remembered on this device). */
const coachEnabled = () => store.get(COACH_KEY) !== '0';

const currentAdvice = (): Advice | null =>
  coachAdvice(
    { view: viewFor(state, HUMAN), step: coach.step, enabled: coachEnabled(), taught: coach.taught, known: coach.known },
    coach.choice,
  );

// ---------- game flow ----------

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;

const startGame = (seed: number) => {
  clearTimeout(botTimer);
  botTimer = undefined;
  state = newGame(seed);
  coach = freshCoach();
  log = ['New game. You go first.'];
  selected = null;
  filterHex = null;
  filterCard = null;
  inspectKey = null;
  shownLimit = PAGE_SIZE;
  flash = [];
  save();
  render();
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);

const resultText = (r: GameResult): { text: string; tone: 'win' | 'lose' | '' } => {
  const [you, bot] = [r.scores[HUMAN], r.scores[BOT]];
  const tally = `You ${you}, bot ${bot}.`;
  if (r.reason === 'double_strangle') return { text: `Draw: both roots were surrounded. ${tally}`, tone: '' };
  const won = r.winner === HUMAN;
  const tone = won ? 'win' : 'lose';
  switch (r.reason) {
    case 'strangle':
      return { text: won ? "You win! You surrounded the bot's root." : 'The bot wins: it surrounded your root.', tone };
    case 'knock': {
      if (!r.undercut) return { text: `${won ? 'You win' : 'The bot wins'} by knocking. ${tally}`, tone };
      const knocker = other(r.winner!);
      return {
        text: knocker === HUMAN ? `Undercut! You knocked but did not finish ahead. ${tally}` : `Undercut! The bot knocked and you held on. ${tally}`,
        tone,
      };
    }
    case 'turn_limit':
      return { text: `Time's up: 30 turns each. ${won ? 'You win!' : 'The bot wins.'} ${tally}${you === bot ? ' A tie goes to the bot.' : ''}`, tone };
    case 'deck_exhaustion': {
      const tie = you === bot ? ' Tied on points: a tie goes to the bot.' : '';
      return { text: `The deck ran out. ${won ? 'You win!' : 'The bot wins.'} ${tally}${tie}`, tone };
    }
  }
};

const resolutionText = (s: State, skipRot = false): string => {
  const r = s.lastResolution;
  if (!r) return '';
  const parts: string[] = [];
  if (r.overgrown.length) parts.push(`took over ${r.overgrown.length} tile${r.overgrown.length > 1 ? 's' : ''}`);
  if (r.rotted.length && !skipRot) parts.push(`${r.rotted.length} tile${r.rotted.length > 1 ? 's' : ''} rotted`);
  for (const cut of r.severed) {
    const whose = cut.player === HUMAN ? 'your' : "the bot's";
    parts.push(`${cut.coords.length} of ${whose} tiles were cut off`);
  }
  return parts.length ? ` — ${parts.join(', ')}` : '';
};

/** One log line, written so it never reveals the bot's hidden cards. */
const describe = (before: State, a: Action, after: State): string => {
  const R = before.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  const resolves = a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Fruit' || a.t === 'Continue' || a.t === 'RotPick';
  const tail = resolves ? resolutionText(after, a.t === 'RotPick') : '';
  if (before.actor === HUMAN) {
    if (a.t === 'RotPick') return `You chose the bot's tile at ${hn(a.coord)} to rot${tail}`;
    if (a.t === 'Knock') return 'You knocked. The bot gets one last turn.';
    if (a.t === 'MeldRun' || a.t === 'MeldSet') return `You grew ${a.cards.length} tiles${tail}`;
    return `You: ${moveSentence(viewFor(before, HUMAN), a)}${tail}`;
  }
  const hand = before.hands[BOT];
  const names = (ids: number[]) => ids.map((id) => cardName(hand.find((c) => c.id === id)!)).join(', ');
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? 'Bot drew a card' : `Bot took the ${cardName(before.discard.at(-1)!)}`;
    case 'MeldRun':
      return `Bot grew a line of ${a.cards.length} tiles from ${hn(a.start)} (${names(a.cards)})${tail}`;
    case 'MeldSet':
      return `Bot grew a clump of ${a.cards.length} tiles at ${a.hexes.map(hn).join(', ')} (${names(a.cards)})${tail}`;
    case 'Sprout':
      return `Bot sprouted a ${cardName(hand.find((c) => c.id === a.card)!)} at ${hn(a.coord)}${tail}`;
    case 'Fruit':
      return `Bot gave up ${a.sacrifice.map(hn).join(' ')} to destroy your tile at ${hn(a.target)}${tail}`;
    case 'EndAct':
      return 'Bot finished playing cards';
    case 'Discard':
      return `Bot threw away ${cardName(hand.find((c) => c.id === a.card)!)}`;
    case 'Knock':
      return 'Bot knocked! You get one last turn.';
    case 'Continue':
      return `Bot ended its turn${tail}`;
    case 'RotPick':
      return `Bot chose your tile at ${hn(a.coord)} to rot${tail}`;
  }
};

const changedHexes = (s: State): string[] => {
  const r = s.lastResolution;
  if (!r) return [];
  return [...r.placed, ...r.rotted, ...r.severed.flatMap((x) => x.coords), ...(r.fruit ? [...r.fruit.sacrifice, r.fruit.target] : [])].map(coordKey);
};

const step = (a: Action) => {
  const before = state;
  state = apply(state, a);
  log.unshift(describe(before, a, state));
  if (['MeldRun', 'MeldSet', 'Fruit', 'Continue', 'RotPick'].includes(a.t) && state.lastResolution !== before.lastResolution) {
    flash = changedHexes(state);
  }
  if (state.phase === 'GAME_OVER' && state.result) log.unshift(resultText(state.result).text);
  else if (before.turnPlayer !== state.turnPlayer) {
    log.unshift(state.turnPlayer === HUMAN ? (state.finalTurn ? '— Your last turn —' : '— Your turn —') : '— Bot’s turn —');
  }
};

const play = (a: Action) => {
  const humanMove = state.actor === HUMAN;
  const shown = humanMove ? advice : null;
  try {
    step(a);
    if (humanMove) {
      // One coach step per player action. Keep the tip and word explanations shown.
      coach.step++;
      if (shown?.tip && !coach.taught.includes(shown.tip.id)) coach.taught.push(shown.tip.id);
      if (shown) coach.known = shown.known;
      coach.choice = 0;
    }
  } catch (e) {
    log.unshift(`That move was not allowed (${(e as Error).message}).`);
  }
  selected = null;
  filterHex = null;
  filterCard = null;
  inspectKey = null;
  shownLimit = PAGE_SIZE;
  sproutMode = false;
  log = log.slice(0, 200);
  save();
  render();
};

const scheduleBot = () => {
  if (botTimer !== undefined || state.phase === 'GAME_OVER' || state.actor !== BOT) return;
  botTimer = setTimeout(() => {
    botTimer = undefined;
    if (state.phase !== 'GAME_OVER' && state.actor === BOT) play(chooseAction(viewFor(state, BOT)));
  }, BOT_DELAY_MS);
};

// ---------- rendering ----------

const statusText = (v: View): { text: string; tone: string } => {
  if (v.result) return resultText(v.result);
  if (v.actor === BOT) {
    if (v.phase === 'ROT_PICK') return { text: 'The bot is choosing which of your tiles rot…', tone: '' };
    return { text: v.finalTurn ? 'The bot is playing its last turn…' : 'Bot is thinking…', tone: '' };
  }
  const last = v.finalTurn ? 'Last turn! ' : '';
  const deckNote = v.deckCount <= 3 ? ` (${v.deckCount === 0 ? 'Deck is empty' : `Only ${v.deckCount} cards left`}: the game ends when it runs out.)` : '';
  switch (v.phase) {
    case 'DRAW':
      return { text: `${last}Your turn: draw a card.${deckNote}`, tone: '' };
    case 'ACT':
      return { text: `${last}Play cards to grow tiles, or tap “I'm done playing cards”.`, tone: '' };
    case 'DISCARD':
      return { text: `${last}Throw away one card.`, tone: '' };
    case 'KNOCK':
      return { text: 'Knock to end the game soon, or end your turn.', tone: '' };
    case 'ROT_PICK':
      return { text: `The bot holds too many loose cards. Tap which of its tiles rots (${v.rotPick?.remaining ?? 0} more).`, tone: '' };
    default:
      return { text: '', tone: '' };
  }
};

const S = 26;
const center = (c: Coord) => ({ x: S * Math.sqrt(3) * (c.q + c.r / 2), y: S * 1.5 * c.r });
const corners = (c: Coord, size = S) => {
  const { x, y } = center(c);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(x + size * Math.cos(a)).toFixed(2)},${(y + size * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
};

const tileInfo = (v: View, key: string): { text: string; doomed: string[]; danger: boolean } => {
  const c = parseKey(key);
  const name = hexName(c, v.config.boardRadius);
  const terrain = v.terrain[key];
  const tile = v.board[key];
  if (terrain === 'rock') return { text: `${name}: rock. Nothing can grow here.`, doomed: [], danger: false };
  if (!tile) return { text: `${name}: empty${terrain === 'rich' ? ' gold hex (a tile here scores 2)' : ''}.`, doomed: [], danger: false };
  const mine = tile.owner === HUMAN;
  if (tile.root) return { text: `${name}: ${mine ? 'your' : "the bot's"} root. It can never be taken.`, doomed: [], danger: false };
  const lost = cutLoss(v, key);
  const n = lost.length;
  const tiles = `${n} tile${n === 1 ? '' : 's'}`;
  const strength = tile.strength === 9 ? 'strength 9, cannot be taken over' : `strength ${tile.strength}`;
  if (mine) return { text: `${name}: your tile (${strength}). If it is cut, you lose ${tiles}.`, doomed: lost, danger: n >= 3 };
  return { text: `${name}: bot tile (${strength}). Cut it and the bot loses ${tiles}.`, doomed: lost, danger: false };
};

const renderBoard = (v: View) => {
  const el = $<HTMLElement>('board') as unknown as SVGSVGElement;
  el.replaceChildren();
  const coords = allCoords(v.config.boardRadius);
  const xs = coords.map((c) => center(c).x);
  const ys = coords.map((c) => center(c).y);
  const pad = S + 4;
  el.setAttribute(
    'viewBox',
    `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`,
  );

  const previewHexes = selected ? moveHexes(selected).map(coordKey) : [];
  const candidates = new Set(v.actor === HUMAN && v.phase === 'ROT_PICK' ? (v.rotPick?.candidates ?? []).map(coordKey) : []);
  const risky = new Set(threats(v, HUMAN).map((t) => t.key));
  const focus = hoverKey ?? inspectKey;
  const info = focus ? tileInfo(v, focus) : null;
  const doomed = new Set(info?.doomed ?? []);

  for (const c of coords) {
    const key = coordKey(c);
    const terrain = v.terrain[key] ?? 'normal';
    const { x, y } = center(c);
    const g = svg('g', {});
    const base = svg('polygon', { points: corners(c), class: `hex ${terrain}` });
    const tile = v.board[key];
    const name = hexName(c, v.config.boardRadius);
    base.appendChild(svg('title', {}, name));
    base.addEventListener('click', () => onHex(key));
    base.addEventListener('pointerenter', (e) => {
      // Redrawing creates a fresh hex under the pointer, which fires pointerenter
      // again: only redraw when the hovered hex actually changes.
      if ((e as PointerEvent).pointerType === 'mouse' && hoverKey !== key) {
        hoverKey = key;
        render();
      }
    });
    base.addEventListener('pointerleave', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' && hoverKey === key) {
        hoverKey = null;
        render();
      }
    });
    g.appendChild(base);

    if (flash.includes(key)) g.appendChild(svg('polygon', { points: corners(c, S - 3), class: 'flash' }));
    if (tile) {
      g.appendChild(svg('polygon', { points: corners(c, S - 5), class: tile.owner === HUMAN ? 'tile-you' : 'tile-bot', 'pointer-events': 'none' }));
      g.appendChild(svg('text', { x, y, class: 'tile-label', 'font-size': tile.root ? 15 : 16 }, tile.root ? 'R' : String(tile.strength)));
    } else if (terrain !== 'rock') {
      g.appendChild(svg('text', { x, y: y - (terrain === 'rich' ? 4 : 0), class: 'name' }, name));
    }
    if (terrain === 'rich') g.appendChild(svg('text', { x, y: y + S * 0.62, class: 'rich-mark' }, '×2'));
    if (doomed.has(key)) g.appendChild(svg('polygon', { points: corners(c, S - 5), class: 'doomed' }));
    if (risky.has(key)) {
      g.appendChild(svg('circle', { cx: x + S * 0.55, cy: y - S * 0.5, r: 6, class: 'risk' }));
      g.appendChild(svg('text', { x: x + S * 0.55, y: y - S * 0.5, class: 'risk-mark' }, '!'));
    }
    if (candidates.has(key)) g.appendChild(svg('polygon', { points: corners(c, S - 2), class: 'preview-cut' }));
    el.appendChild(g);
  }

  if (selected) {
    const strengthAt = new Map<string, number>();
    if (selected.t === 'MeldRun' || selected.t === 'MeldSet') {
      const ranks = selected.cards.map((id) => v.hand.find((h) => h.id === id)!.rank).sort((a, b) => a - b);
      moveHexes(selected).forEach((c, i) => strengthAt.set(coordKey(c), selected!.t === 'MeldSet' ? ranks[0]! : ranks[i]!));
    }
    for (const key of previewHexes) {
      const c = parseKey(key);
      const isTarget = selected.t === 'Fruit' && coordKey(selected.target) === key;
      const isSacrifice = selected.t === 'Fruit' && !isTarget;
      el.appendChild(svg('polygon', { points: corners(c, S - 2), class: isSacrifice ? 'preview-cut' : 'preview' }));
      const { x, y } = center(c);
      if (strengthAt.has(key)) el.appendChild(svg('text', { x, y: y - S * 0.55, class: 'ghost', 'font-size': 12 }, `→${strengthAt.get(key)}`));
      if (isTarget) el.appendChild(svg('text', { x, y: y - S * 0.55, class: 'ghost', 'font-size': 12 }, '✕'));
    }
  }
  if (advice && !selected) {
    for (const c of advice.hexes) el.appendChild(svg('polygon', { points: corners(c, S - 2), class: 'coach-hex' }));
  }
  if (focus) el.appendChild(svg('polygon', { points: corners(parseKey(focus), S - 1), class: 'inspect' }));

  const infoEl = $('tile-info');
  if (info) {
    infoEl.textContent = info.text;
    infoEl.className = `tile-info${info.danger ? ' danger' : ''}`;
  } else {
    infoEl.textContent = risky.size
      ? 'Red ! marks your weak spots the bot could cut. Tap any tile to see what it would cost.'
      : 'Tap any tile to see what you would lose if it were cut.';
    infoEl.className = 'tile-info';
  }
};

const renderHand = (v: View) => {
  const el = $('hand');
  el.replaceChildren();
  const used = new Set(selected ? moveCards(selected) : []);
  const sorted = [...v.hand].sort((a, b) => a.suit - b.suit || a.rank - b.rank || a.id - b.id);
  for (const c of sorted) {
    const b = document.createElement('button');
    b.type = 'button';
    const suggested = advice !== null && !selected && advice.cards.includes(c.id);
    b.className = `card s${c.suit}${used.has(c.id) ? ' used' : ''}${filterCard === c.id ? ' filtered' : ''}${suggested ? ' coach-card' : ''}`;
    b.setAttribute('aria-label', cardName(c));
    b.innerHTML = `<span class="icon">${SUIT_ICONS[c.suit]}</span>${c.rank}<small>${SUIT_NAMES[c.suit]}</small>`;
    b.addEventListener('click', () => {
      filterCard = filterCard === c.id ? null : c.id;
      selected = null;
      shownLimit = PAGE_SIZE;
      render();
    });
    el.appendChild(b);
  }
  $('deadwood').textContent = parkedOn() ? `Leftover (deadwood): ${v.myDeadwood}` : '';
  $('bot-hand').textContent =
    v.config.fruitPerPlayer > 0
      ? `The bot holds ${v.opponentHandCount} hidden cards. Fruit used: you ${v.fruitUsed[HUMAN]}/${v.config.fruitPerPlayer}, bot ${v.fruitUsed[BOT]}/${v.config.fruitPerPlayer}.`
      : `The bot holds ${v.opponentHandCount} hidden cards.`;
};

const isBoardMove = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout' || a.t === 'Fruit' || a.t === 'RotPick';

const renderMoves = (v: View) => {
  const el = $('moves');
  el.replaceChildren();
  const all = v.actor === HUMAN ? legalActions(v) : [];
  // Best moves first (GreedyBot's ranking), so the strongest options sit on top.
  const rankOf = new Map(v.actor === HUMAN ? rankActions(v).map((r, i) => [JSON.stringify(r.action), i]) : []);
  const byRank = (x: Action, y: Action) => (rankOf.get(JSON.stringify(x)) ?? 0) - (rankOf.get(JSON.stringify(y)) ?? 0);
  const sprouts = all.filter((a) => a.t === 'Sprout');
  const card = filterCard === null ? null : v.hand.find((c) => c.id === filterCard);
  const sameCard = (id: number) => {
    const c = v.hand.find((h) => h.id === id);
    return !!c && !!card && c.suit === card.suit && c.rank === card.rank;
  };
  // Filters narrow board moves and discards; simple moves (draw, done, end turn) always stay.
  const keep = (a: Action) => {
    if (!isBoardMove(a) && a.t !== 'Discard') return true;
    if (filterHex && !touchesHex(a, filterHex)) return false;
    return card ? moveCards(a).some(sameCard) : true;
  };
  let shown = all.filter(keep);
  // Sprout moves are many: they get their own button unless a hex or card is picked.
  if (sproutMode) shown = shown.filter((a) => a.t === 'Sprout');
  else if (filterHex === null && filterCard === null) shown = shown.filter((a) => a.t !== 'Sprout');
  shown = [...shown.filter((a) => !isBoardMove(a)), ...shown.filter(isBoardMove).sort(byRank)];
  const filtered = filterHex !== null || filterCard !== null;
  $('clear-filter').hidden = !filtered;

  const hint = $('hint');
  if (v.actor !== HUMAN) hint.textContent = v.result ? 'Tap “New game” to play again.' : 'Waiting for the bot…';
  else if (filtered && !shown.some((a) => isBoardMove(a) || a.t === 'Discard') && all.some(isBoardMove)) {
    hint.textContent = 'No moves use that. Tap “Show all”.';
  }
  else if (shown.length > shownLimit) hint.textContent = `${shown.length} possible moves. Tap a hex or a card to narrow them down.`;
  else if (all.some(isBoardMove)) hint.textContent = 'Tap a move to see it on the board first.';
  else hint.textContent = '';

  if (sprouts.length > 0 && !sproutMode && filterHex === null && filterCard === null) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `move sprout${advice?.action.t === 'Sprout' ? ' coach-glow' : ''}`;
    b.textContent = `🌱 Sprout one tile (${sprouts.length} places)`;
    b.addEventListener('click', () => {
      sproutMode = true;
      shownLimit = PAGE_SIZE;
      render();
    });
    el.appendChild(b);
  }
  if (sproutMode) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'move more';
    back.textContent = '← Back to all moves';
    back.addEventListener('click', () => {
      sproutMode = false;
      render();
    });
    el.appendChild(back);
  }
  for (const a of shown.slice(0, shownLimit)) {
    const b = document.createElement('button');
    b.type = 'button';
    const primary = a.t === 'Draw' || a.t === 'EndAct' || a.t === 'Continue';
    const warn = isBoardMove(a) ? dangerWarning(v, a) : null;
    const isSel = selected !== null && JSON.stringify(selected) === JSON.stringify(a);
    b.className = `move${primary ? ' primary' : ''}${isSel ? ' selected' : ''}${warn ? ' risky' : ''}${advice && JSON.stringify(advice.action) === JSON.stringify(a) ? ' coach-glow' : ''}`;
    b.textContent = `${warn ? '⚠ ' : ''}${moveSentence(v, a)}`;
    b.addEventListener('click', () => {
      if (isBoardMove(a)) {
        selected = a;
        render();
        $('confirm').scrollIntoView({ block: 'nearest' });
      } else play(a);
    });
    el.appendChild(b);
  }
  if (shown.length > shownLimit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'move more';
    more.textContent = `Show more (${shown.length - shownLimit} left)`;
    more.addEventListener('click', () => {
      shownLimit += PAGE_SIZE * 2;
      render();
    });
    el.appendChild(more);
  }

  const confirm = $('confirm');
  confirm.hidden = !selected;
  if (selected) {
    $('confirm-text').textContent = moveSentence(v, selected);
    const warn = dangerWarning(v, selected);
    const warnEl = $('confirm-warn');
    warnEl.hidden = !warn;
    warnEl.textContent = warn ?? '';
  }
};

const renderCoach = () => {
  const on = coachEnabled();
  const toggle = $('coach-toggle');
  toggle.textContent = `Coach: ${on ? 'ON' : 'OFF'}`;
  toggle.setAttribute('aria-pressed', String(on));
  const box = $('coach');
  const showSummary = on && coach.step >= COACH_STEPS && !coach.summaryDone && state.phase !== 'GAME_OVER';
  box.hidden = !(advice || showSummary);
  $('coach-advice').hidden = !advice;
  $('coach-summary').hidden = !showSummary || !!advice;
  if (advice) {
    $('coach-step').textContent = `Step ${coach.step + 1} of ${COACH_STEPS}`;
    $('coach-suggested').textContent = advice.suggested;
    $('coach-why').textContent = advice.why.join(' ');
    const tip = $('coach-tip');
    tip.hidden = !advice.tip;
    tip.textContent = advice.tip ? `Tactic tip: ${advice.tip.text}` : '';
    $('coach-next').textContent = advice.choices > 1 ? `Not this, show another (${advice.choice + 1} of ${advice.choices})` : 'Not this, show another';
    ($('coach-next') as HTMLButtonElement).disabled = advice.choices < 2;
  } else if (showSummary) {
    $('coach-step').textContent = '';
    const sum = coachSummary(coach.taught, state.config);
    $('coach-summary-title').textContent = sum.title;
    $('coach-summary-list').replaceChildren(
      ...sum.bullets.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
  }
};

const render = () => {
  const v = viewFor(state, HUMAN);
  advice = currentAdvice();
  const status = statusText(v);
  const st = $('status');
  st.textContent = status.text;
  st.className = `status ${status.tone}`;
  $('score-you').textContent = String(v.score);
  $('score-bot').textContent = String(v.opponentScore);
  $('deck').textContent = String(v.deckCount);
  const top = v.discard.at(-1);
  $('discard').textContent = top ? `${SUIT_ICONS[top.suit]} ${top.rank}` : '–';
  renderCoach();
  renderBoard(v);
  renderHand(v);
  renderMoves(v);
  $('log').replaceChildren(
    ...log.map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
  scheduleBot();
};

// ---------- input ----------

const onHex = (key: string) => {
  const v = viewFor(state, HUMAN);
  if (v.actor === HUMAN && v.phase === 'ROT_PICK') {
    const pick = legalActions(v).find((a) => a.t === 'RotPick' && coordKey(a.coord) === key);
    if (pick) {
      selected = pick;
      inspectKey = key;
      render();
      return;
    }
  }
  const same = filterHex === key;
  filterHex = same ? null : key;
  inspectKey = same ? null : key;
  selected = null;
  shownLimit = PAGE_SIZE;
  if (filterHex && v.actor === HUMAN) {
    const matches = legalActions(v).filter((a) => touchesHex(a, filterHex!));
    if (matches.length === 1 && isBoardMove(matches[0]!)) selected = matches[0]!;
  }
  render();
};

$('confirm-play').addEventListener('click', () => {
  if (selected) play(selected);
});
$('confirm-cancel').addEventListener('click', () => {
  selected = null;
  render();
});
$('clear-filter').addEventListener('click', () => {
  filterHex = null;
  filterCard = null;
  inspectKey = null;
  selected = null;
  render();
});
$('new-game').addEventListener('click', () => {
  if (state.phase !== 'GAME_OVER' && state.turnNumber > 1 && !window.confirm('Start a new game? This one will be lost.')) return;
  startGame(randomSeed());
});
const isBoardAction = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Fruit' || a.t === 'RotPick';

$('coach-toggle').addEventListener('click', () => {
  store.set(COACH_KEY, coachEnabled() ? '0' : '1');
  coach.choice = 0;
  render();
});
$('coach-show').addEventListener('click', () => {
  if (!advice) return;
  filterHex = null;
  filterCard = null;
  if (isBoardAction(advice.action)) {
    selected = advice.action;
    render();
    $('board').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    render();
    document.querySelector('.move.coach-glow')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
$('coach-do').addEventListener('click', () => {
  if (advice) play(advice.action);
});
$('coach-next').addEventListener('click', () => {
  coach.choice++;
  selected = null;
  save();
  render();
});
$('coach-summary-ok').addEventListener('click', () => {
  coach.summaryDone = true;
  save();
  render();
});
$('tutorial-game').addEventListener('click', () => {
  if (state.phase !== 'GAME_OVER' && state.turnNumber > 1 && !window.confirm('Start the tutorial game? This game will be lost.')) return;
  store.set(COACH_KEY, '1');
  startGame(TUTORIAL_SEED);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('restart-tutorial').addEventListener('click', () => {
  if (state.phase !== 'GAME_OVER' && state.turnNumber > 1 && !window.confirm('Restart the tutorial with a new game? This game will be lost.')) return;
  store.set(COACH_KEY, '1');
  startGame(randomSeed());
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- start ----------

const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
if (Number.isSafeInteger(urlSeed) && urlSeed > 0) startGame(urlSeed);
else if (load()) render();
else startGame(randomSeed());
