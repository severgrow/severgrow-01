// Mycelium in the browser: you (green, player 1) against a simple bot (purple).
// All rules come from the engine in src/engine; this file only draws and clicks.
import { allCoords, apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Coord, GameResult, Player, State, View } from '../../src/engine/index.js';
import { chooseAction } from './bot.js';
import { SUIT_ICONS, cardName, hexName, moveCards, moveHexes, moveLabel, touchesHex } from './names.js';
import { SUIT_NAMES } from '../../src/engine/index.js';

const HUMAN: Player = 0;
const BOT: Player = 1;
const SAVE_KEY = 'mycelium.save.v1';
const PAGE_SIZE = 15;
let shownLimit = PAGE_SIZE;
const BOT_DELAY_MS = 650;

let state: State;
let log: string[] = [];
let selected: Action | null = null;
let filterHex: string | null = null;
let filterCard: number | null = null;
let flash: string[] = [];
let botTimer: ReturnType<typeof setTimeout> | undefined;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};

// ---------- saving (per device, best effort) ----------

const save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, log }));
  } catch {
    /* private mode or storage blocked: the game still works, it just won't resume */
  }
};

const load = (): boolean => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { state: State; log: string[] };
    if (!saved.state?.board || !Array.isArray(saved.log)) return false;
    state = saved.state;
    log = saved.log;
    return true;
  } catch {
    return false;
  }
};

// ---------- game flow ----------

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_000;

const startGame = (seed: number) => {
  clearTimeout(botTimer);
  botTimer = undefined;
  state = newGame(seed);
  log = [`New game (seed ${seed}). You go first: draw a card.`];
  selected = null;
  filterHex = null;
  filterCard = null;
  flash = [];
  save();
  render();
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);

const resultText = (r: GameResult): { text: string; tone: 'win' | 'lose' | '' } => {
  const [you, bot] = [r.scores[HUMAN], r.scores[BOT]];
  const tally = `You ${you} – Bot ${bot}`;
  if (r.reason === 'double_strangle') return { text: `Draw: both roots were strangled. ${tally}`, tone: '' };
  const won = r.winner === HUMAN;
  const tone = won ? 'win' : 'lose';
  switch (r.reason) {
    case 'strangle':
      return { text: won ? `You win! You strangled the bot's root.` : `The bot wins: it strangled your root.`, tone };
    case 'knock': {
      const knocker = r.undercut ? other(r.winner!) : r.winner!;
      if (!r.undercut) return { text: `${won ? 'You win' : 'The bot wins'} by knocking. ${tally}`, tone };
      return {
        text: knocker === HUMAN ? `Undercut! You knocked but did not finish ahead. ${tally}` : `Undercut! The bot knocked and you held on. ${tally}`,
        tone,
      };
    }
    case 'deck_exhaustion':
      return { text: `The deck ran out. ${won ? 'You win' : 'The bot wins'}. ${tally}`, tone };
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
    parts.push(`${cut.coords.length} of ${whose} tiles withered (cut off from the root)`);
  }
  return parts.length ? ` — ${parts.join(', ')}` : '';
};

/** One log line, written so it never reveals the bot's hidden cards. */
const describe = (before: State, a: Action, after: State): string => {
  const R = before.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  const resolves = a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Fruit' || a.t === 'Continue' || a.t === 'RotPick';
  // A Rot pick already names its tile; only report what withered after it.
  const tail = resolves ? resolutionText(after, a.t === 'RotPick') : '';
  if (before.actor === HUMAN) {
    if (a.t === 'RotPick') return `You chose the bot's tile at ${hn(a.coord)} to rot${tail}`;
    if (a.t === 'Knock') return 'You knocked. The bot gets one final turn.';
    return `${moveLabel(viewFor(before, HUMAN), a)}${tail}`;
  }
  const hand = before.hands[BOT];
  const names = (ids: number[]) => ids.map((id) => cardName(hand.find((c) => c.id === id)!)).join(', ');
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? 'Bot drew from the deck' : `Bot took ${cardName(before.discard.at(-1)!)} from the discard pile`;
    case 'MeldRun':
      return `Bot grew a Hypha (${names(a.cards)}) from ${hn(a.start)}${tail}`;
    case 'MeldSet':
      return `Bot grew a Bloom (${names(a.cards)}) on ${a.hexes.map(hn).join(' ')}${tail}`;
    case 'Fruit':
      return `Bot used Fruit: gave up ${a.sacrifice.map(hn).join(' ')} to destroy your tile at ${hn(a.target)}${tail}`;
    case 'EndAct':
      return 'Bot finished playing cards';
    case 'Discard':
      return `Bot discarded ${cardName(hand.find((c) => c.id === a.card)!)}`;
    case 'Knock':
      return 'Bot knocked! You get one final turn.';
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

const play = (a: Action) => {
  const before = state;
  try {
    state = apply(state, a);
  } catch (e) {
    log.unshift(`That move was not allowed (${(e as Error).message}).`);
    render();
    return;
  }
  log.unshift(describe(before, a, state));
  const boardMove = ['MeldRun', 'MeldSet', 'Fruit', 'Continue', 'RotPick'].includes(a.t);
  if (boardMove) flash = changedHexes(state);
  if (state.phase === 'GAME_OVER' && state.result) log.unshift(resultText(state.result).text);
  if (before.turnPlayer !== state.turnPlayer && state.phase !== 'GAME_OVER') {
    if (state.turnPlayer === HUMAN) log.unshift(state.finalTurn ? '— Your final turn —' : '— Your turn —');
    else flash = boardMove ? flash : [];
  }
  selected = null;
  filterHex = null;
  filterCard = null;
  shownLimit = PAGE_SIZE;
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
    if (v.phase === 'ROT_PICK') return { text: 'Too much deadwood: the bot is choosing which of your tiles rot…', tone: '' };
    return { text: v.finalTurn ? 'You knocked. The bot is playing its final turn…' : 'Bot is thinking…', tone: '' };
  }
  const final = v.finalTurn ? 'Final turn! ' : '';
  switch (v.phase) {
    case 'DRAW':
      return { text: `${final}Your turn: draw a card.`, tone: '' };
    case 'ACT':
      return { text: `${final}Play card combos onto the board, or tap “Done playing cards”.`, tone: '' };
    case 'DISCARD':
      return { text: `${final}Discard one card.`, tone: '' };
    case 'KNOCK':
      return { text: 'Knock to end the game soon, or Continue.', tone: '' };
    case 'ROT_PICK':
      return { text: `The bot has too much deadwood. Tap which of its tiles rots (${v.rotPick?.remaining ?? 0} more).`, tone: '' };
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

  for (const c of coords) {
    const key = coordKey(c);
    const terrain = v.terrain[key] ?? 'normal';
    const { x, y } = center(c);
    const g = svg('g', {});
    const base = svg('polygon', { points: corners(c), class: `hex ${terrain}` });
    const tile = v.board[key];
    const name = hexName(c, v.config.boardRadius);
    const title = svg('title', {}, `${name}${terrain !== 'normal' ? ` (${terrain})` : ''}${tile ? `: ${tile.owner === HUMAN ? 'your' : "bot's"} ${tile.root ? 'root' : `tile, strength ${tile.strength}`}` : ''}`);
    base.appendChild(title);
    if (terrain !== 'rock') base.addEventListener('click', () => onHex(key));
    g.appendChild(base);

    if (flash.includes(key)) g.appendChild(svg('polygon', { points: corners(c, S - 3), class: 'flash' }));
    if (tile) {
      g.appendChild(svg('polygon', { points: corners(c, S - 5), class: tile.owner === HUMAN ? 'tile-you' : 'tile-bot', 'pointer-events': 'none' }));
      g.appendChild(svg('text', { x, y, class: 'tile-label', 'font-size': tile.root ? 15 : 16 }, tile.root ? 'R' : String(tile.strength)));
    } else if (terrain !== 'rock') {
      g.appendChild(svg('text', { x, y: y - (terrain === 'rich' ? 4 : 0), class: 'name' }, name));
    }
    if (terrain === 'rich') g.appendChild(svg('text', { x, y: y + S * 0.62, class: 'rich-mark' }, '×2'));
    if (candidates.has(key)) g.appendChild(svg('polygon', { points: corners(c, S - 2), class: 'preview-cut' }));
    el.appendChild(g);
  }

  // Selected move preview and the hex filter go on top.
  if (selected) {
    const strengthAt = new Map<string, number>();
    if (selected.t === 'MeldRun' || selected.t === 'MeldSet') {
      const ranks = selected.cards.map((id) => v.hand.find((h) => h.id === id)!.rank).sort((a, b) => a - b);
      moveHexes(selected).forEach((c, i) => strengthAt.set(coordKey(c), selected!.t === 'MeldSet' ? ranks[0]! : ranks[i]!));
    }
    for (const key of previewHexes) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const c = { q, r };
      const isTarget = selected.t === 'Fruit' && coordKey(selected.target) === key;
      const isSacrifice = selected.t === 'Fruit' && !isTarget;
      el.appendChild(svg('polygon', { points: corners(c, S - 2), class: isSacrifice ? 'preview-cut' : 'preview' }));
      const { x, y } = center(c);
      if (strengthAt.has(key)) el.appendChild(svg('text', { x, y: y - S * 0.55, class: 'ghost', 'font-size': 12 }, `→${strengthAt.get(key)}`));
      if (isTarget) el.appendChild(svg('text', { x, y: y - S * 0.55, class: 'ghost', 'font-size': 12 }, '✕'));
    }
  }
  if (filterHex) {
    const [q, r] = filterHex.split(',').map(Number) as [number, number];
    el.appendChild(svg('polygon', { points: corners({ q, r }, S - 1), class: 'filter' }));
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
    b.className = `card s${c.suit}${used.has(c.id) ? ' used' : ''}${filterCard === c.id ? ' filtered' : ''}`;
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
  $('deadwood').textContent = `Leftover (deadwood): ${v.myDeadwood}`;
  $('bot-hand').textContent = `The bot holds ${v.opponentHandCount} hidden cards. Fruit used: you ${v.fruitUsed[HUMAN]}/${v.config.fruitPerPlayer}, bot ${v.fruitUsed[BOT]}/${v.config.fruitPerPlayer}.`;
};

const isBoardMove = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Fruit' || a.t === 'RotPick';

const renderMoves = (v: View) => {
  const el = $('moves');
  el.replaceChildren();
  const all = v.actor === HUMAN ? legalActions(v) : [];
  const card = filterCard === null ? null : v.hand.find((c) => c.id === filterCard);
  const sameCard = (id: number) => {
    const c = v.hand.find((h) => h.id === id);
    return !!c && !!card && c.suit === card.suit && c.rank === card.rank;
  };
  let shown = all.filter((a) => (filterHex ? touchesHex(a, filterHex) : true) && (card ? moveCards(a).some(sameCard) : true));
  // Simple moves first (draw, done, knock...), board moves after.
  shown = [...shown.filter((a) => !isBoardMove(a)), ...shown.filter(isBoardMove)];
  const filtered = filterHex !== null || filterCard !== null;
  $('clear-filter').hidden = !filtered;

  const hint = $('hint');
  if (v.actor !== HUMAN) hint.textContent = v.result ? 'Tap “New game” to play again.' : 'Waiting for the bot…';
  else if (filtered && shown.length === 0) hint.textContent = 'No moves use that. Tap “Show all”.';
  else if (shown.length > shownLimit) hint.textContent = `${shown.length} possible moves. Tap a hex or a card to narrow them down.`;
  else if (all.some(isBoardMove)) hint.textContent = 'Board moves show a preview first. Tap a hex or a card to filter.';
  else hint.textContent = '';

  for (const a of shown.slice(0, shownLimit)) {
    const b = document.createElement('button');
    b.type = 'button';
    const primary = !isBoardMove(a) && (a.t === 'Draw' || a.t === 'EndAct' || a.t === 'Continue');
    b.className = `move${primary ? ' primary' : ''}${selected && JSON.stringify(selected) === JSON.stringify(a) ? ' selected' : ''}`;
    b.textContent = moveLabel(v, a);
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
  if (selected) $('confirm-text').textContent = moveLabel(v, selected);
};

const render = () => {
  const v = viewFor(state, HUMAN);
  const status = statusText(v);
  const st = $('status');
  st.textContent = status.text;
  st.className = `status ${status.tone}`;
  $('score-you').textContent = String(v.score);
  $('score-bot').textContent = String(v.opponentScore);
  $('deck').textContent = String(v.deckCount);
  const top = v.discard.at(-1);
  $('discard').textContent = top ? `${SUIT_ICONS[top.suit]} ${top.rank}` : '–';
  renderBoard(v);
  renderHand(v);
  renderMoves(v);
  const logEl = $('log');
  logEl.replaceChildren(
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
      render();
      return;
    }
  }
  filterHex = filterHex === key ? null : key;
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
  selected = null;
  render();
});
$('new-game').addEventListener('click', () => {
  if (state.phase !== 'GAME_OVER' && !window.confirm('Start a new game? This one will be lost.')) return;
  startGame(randomSeed());
});

// ---------- start ----------

const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
if (Number.isSafeInteger(urlSeed) && urlSeed > 0) startGame(urlSeed);
else if (load()) render();
else startGame(randomSeed());
