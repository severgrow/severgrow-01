import type { Level } from '../bots/levels.js';

export type Ticket = {
  id: string;
  playerId: string;
  seed: number;
  level: Level;
  rulesVersion: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
};

export type Account = {
  id: string;
  nickname: string | null;
  nicknameChangedAt: number | null;
  /** Banked sprout tokens, each the level of the win that earned it. */
  tokens: Level[];
  /** The day (UTC, days since 1970) of `placementsToday`. */
  placementsDay: number;
  placementsToday: number;
  createdAt: number;
};

export type Cell = { q: number; r: number; level: Level; owner: string | null; placedAt: number; replacedCount: number };

export type WorldEvent = {
  at: number;
  kind: 'place' | 'overgrow';
  q: number;
  r: number;
  level: Level;
  by: string;
  prevOwner: string | null;
  prevLevel: Level | null;
};

export type Fail = { ok: false; reason: string };
