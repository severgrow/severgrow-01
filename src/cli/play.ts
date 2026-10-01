// Terminal client (Milestone E): a human (player 1) against GreedyBot. The game logic
// is the engine; this file only prints and reads. I/O is injected so tests can drive it.
import { allCoords, apply, coordKey, newGame, viewFor } from '../engine/index.js';
import type { Action, State } from '../engine/index.js';
import { createGreedyBot } from '../bots/GreedyBot.js';
import { cardName, hexName, moveSentence } from '../playtest/names.js';
import { PRESETS, settle, visibleMoves } from '../playtest/presets.js';
import type { Mode } from '../playtest/presets.js';

/** The board as 7 text rows: YR/BR roots, Y5/B3 tiles, ## rock, ** gold, .. empty. */
export const renderBoard = (s: State): string => {
  const R = s.config.boardRadius;
  const rows: string[] = [];
  for (let r = -R; r <= R; r++) {
    const cells: string[] = [];
    for (const c of allCoords(R).filter((x) => x.r === r)) {
      const k = coordKey(c);
      const t = s.board[k];
      if (t) cells.push(`${t.owner === 0 ? 'Y' : 'B'}${t.root ? 'R' : t.strength}`);
      else cells.push(s.terrain[k] === 'rock' ? '##' : s.terrain[k] === 'rich' ? '**' : '..');
    }
    const label = hexName({ q: Math.max(-R, -r - R), r }, R)[0];
    rows.push(`${label} ${' '.repeat(Math.abs(r) * 2)}${cells.join('  ')}`);
  }
  return rows.join('\n');
};

const statusBlock = (s: State, mode: Mode): string => {
  const v = viewFor(s, 0);
  const top = v.discard.at(-1);
  const res = v.lastResolution;
  const last = res
    ? `Last change: placed ${res.placed.length}, took over ${res.overgrown.length}, rotted ${res.rotted.length}, cut off ${res.severed.reduce((n, x) => n + x.coords.length, 0)}`
    : 'Last change: none yet';
  return [
    '',
    renderBoard(s),
    `Key: YR/BR roots, Y5/B3 tiles with strength, ** gold hex (2 points), ## rock, .. empty`,
    `Score: you ${v.score}, bot ${v.opponentScore}   Deck: ${v.deckCount}   Discard top: ${top ? cardName(top) : '-'}`,
    `Your hand: ${[...v.hand].sort((a, b) => a.suit - b.suit || a.rank - b.rank).map(cardName).join(', ')}`,
    mode === 'classic' ? `Leftover (deadwood): ${v.myDeadwood}` : `Leftover: (not used in Lite)`,
    last,
  ].join('\n');
};

export type TerminalIO = {
  seed: number;
  mode?: Mode;
  ask: (prompt: string) => Promise<string>;
  print: (line: string) => void;
};

/** Plays until the game ends or the player types q. Returns the last state. */
export const runTerminalGame = async (io: TerminalIO): Promise<State> => {
  const mode = io.mode ?? 'classic';
  const bot = createGreedyBot({ allowKnock: mode === 'classic' });
  let s = newGame(io.seed, PRESETS[mode]);
  io.print(`Mycelium (${mode}). You are Y, the bot is B. Grow your network, keep it linked to your root, cut the bot's links.`);
  while (s.phase !== 'GAME_OVER') {
    if (s.actor === 1) {
      const a = bot.chooseAction(viewFor(s, 1));
      s = settle(apply(s, a), mode);
      io.print(`Bot: ${a.t}${a.t === 'MeldRun' || a.t === 'MeldSet' ? ` (${a.cards.length} tiles)` : ''}`);
      continue;
    }
    const v = viewFor(s, 0);
    const moves = visibleMoves(v, mode);
    io.print(statusBlock(s, mode));
    io.print('Moves:');
    moves.forEach((m, i) => io.print(`  ${i + 1}. ${moveSentence(v, m)}`));
    let pick: Action | undefined;
    while (!pick) {
      const answer = (await io.ask(`Choose 1-${moves.length} (q to quit): `)).trim().toLowerCase();
      if (answer === 'q') return s;
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= moves.length) pick = moves[n - 1];
      else io.print(`Please type a number from 1 to ${moves.length} (or q to quit).`);
    }
    s = settle(apply(s, pick), mode);
    if (mode === 'lite' && s.phase === 'KNOCK' && s.actor === 0) s = settle(apply(s, { t: 'Continue' }), mode);
  }
  const r = s.result!;
  const who = r.winner === null ? 'Nobody wins' : r.winner === 0 ? 'You win' : 'The bot wins';
  io.print(statusBlock(s, mode));
  io.print(`Game over: ${who} (${r.reason}${r.undercut ? ', undercut' : ''}). Score: you ${r.scores[0]}, bot ${r.scores[1]}.`);
  return s;
};
