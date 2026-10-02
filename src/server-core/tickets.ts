// Game tickets and server-side verification: the whole game is replayed with the real
// engine; the human's moves must be legal, the bot's must match the bot exactly.
import { apply, legalActions, newGame, rulesConfig, viewFor } from '../engine/index.js';
import type { Action, State } from '../engine/index.js';
import { LEVELS, botSeed } from '../bots/levels.js';
import { botFor } from '../bots/versions.js';
import type { Level } from '../bots/levels.js';
import { DEFAULT_WORLD_CONFIG } from './config.js';
import type { WorldConfig } from './config.js';
import type { Account, Fail, Ticket } from './types.js';

/**
 * A new game ticket. `seed` must be chosen by the SERVER (its own secure random source),
 * never taken from the player's request: the deal follows from the seed, so a player who
 * could choose it could choose their cards. Verification only ever uses this stored seed.
 */
export const issueTicket = (p: { id: string; playerId: string; seed: number; level: Level; now: number }, cfg: WorldConfig = DEFAULT_WORLD_CONFIG): Ticket => ({
  id: p.id,
  playerId: p.playerId,
  seed: p.seed >>> 0,
  level: p.level,
  rulesVersion: cfg.rulesVersion,
  botVersion: cfg.botVersion,
  issuedAt: p.now,
  expiresAt: p.now + cfg.ticketTtl,
  used: false,
});

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
/** Accepts only plain objects with a known move type (anything else is junk). */
const MOVE_TYPES = new Set(['Draw', 'MeldRun', 'MeldSet', 'Sprout', 'Fruit', 'EndAct', 'Discard', 'Knock', 'Continue', 'RotPick']);
const looksLikeAction = (a: unknown): a is Action => !!a && typeof a === 'object' && !Array.isArray(a) && MOVE_TYPES.has((a as { t?: unknown }).t as string);

export type Verified = { ok: true; scores: [number, number] } | Fail;

/**
 * Replays `actions` for `ticket` with exactly the rules and bot versions stored on it, so
 * earlier games still verify after an update. The human is player 0 and moves first.
 */
export const verifyGame = (ticket: Ticket, actions: Action[], now: number, cfg: WorldConfig = DEFAULT_WORLD_CONFIG): Verified => {
  const rules = rulesConfig(ticket.rulesVersion);
  if (!rules) return { ok: false, reason: 'This game was played under rules this server no longer knows.' };
  const bot = botFor(ticket.botVersion ?? 'bots-v0.5');
  if (!bot) return { ok: false, reason: 'This game was played against a bot version this server no longer knows.' };
  if (now > ticket.expiresAt) return { ok: false, reason: 'This game ticket has expired.' };
  if (!LEVELS.includes(ticket.level)) return { ok: false, reason: 'Unknown bot level.' };
  if (!Array.isArray(actions)) return { ok: false, reason: 'The game log is not a list of moves.' };
  if (actions.length > cfg.maxLogLength) return { ok: false, reason: 'The game log is too long.' };
  let s: State = newGame(ticket.seed, rules);
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (s.phase === 'GAME_OVER') return { ok: false, reason: `Move ${i + 1} came after the game ended.` };
    if (!looksLikeAction(a)) return { ok: false, reason: `Move ${i + 1} is not a move.` };
    if (s.actor === 0) {
      if (!legalActions(viewFor(s, 0)).some((x) => same(x, a))) return { ok: false, reason: `Move ${i + 1} was not allowed.` };
    } else {
      const expected = bot(viewFor(s, 1), ticket.level, botSeed(s.seed, ticket.level, s.turnNumber, s.history?.length ?? 0));
      if (!same(expected, a)) return { ok: false, reason: `Move ${i + 1} is not what the bot plays.` };
    }
    s = apply(s, a);
  }
  if (s.phase !== 'GAME_OVER' || !s.result) return { ok: false, reason: 'The game is not finished.' };
  if (s.result.winner !== 0) return { ok: false, reason: 'The player did not win this game.' };
  return { ok: true, scores: s.result.scores };
};

export const newAccount = (id: string, now: number): Account => ({
  id,
  nickname: null,
  nicknameChangedAt: null,
  tokens: [],
  placementsDay: 0,
  placementsToday: 0,
  createdAt: now,
});

/** A verified win: the ticket is used up and one token of its level is banked. */
export const finishGame = (
  account: Account,
  ticket: Ticket,
  actions: Action[],
  now: number,
  cfg: WorldConfig = DEFAULT_WORLD_CONFIG,
): { ok: true; account: Account; ticket: Ticket } | Fail => {
  if (ticket.playerId !== account.id) return { ok: false, reason: 'This game ticket is not yours.' };
  if (ticket.used) return { ok: false, reason: 'This game ticket was already used.' };
  if (account.tokens.length >= cfg.maxBankedTokens) return { ok: false, reason: `You already have ${cfg.maxBankedTokens} sprouts waiting. Place a sprout first.` };
  const v = verifyGame(ticket, actions, now, cfg);
  if (!v.ok) return v;
  return { ok: true, account: { ...account, tokens: [...account.tokens, ticket.level] }, ticket: { ...ticket, used: true } };
};
