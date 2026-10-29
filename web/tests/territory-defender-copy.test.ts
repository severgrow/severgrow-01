// THE DEFENDER IS NEVER CHARGED (owner report, 2026-10-28), AND SINCE 2026-10-29 NOBODY IS.
//
// Owner, 2026-10-28, verbatim: "i accepted the territory challenge, but i had to pay 50 seeds too —
// only challenging player should be paying 50 — the defending one have to be saying 'respond to keep
// your tile in 23:59 (timer)'".
//
// Owner, 2026-10-29, verbatim: "make challenging free ... challenging is like putting your tile at
// stake." So the seed price is gone entirely: the challenger risks a TILE, the defender risks the
// CONTESTED tile, and the winner takes the loser's tile. These tests pin the words to that rule and
// fail if any challenge sentence reintroduces a Seed price or forgets to name the stake.
//
// A copy or economy change that breaks this file is a real decision, not a formatting tweak.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHALLENGE } from '../src/online/challenge-copy.js';
import { defendSheetCopy } from '../src/online/challenge-view.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Every string the DEFENDER can read in the challenge sheet, rail or tile marker. */
const defenderFacing = (): string[] => [
  CHALLENGE.defendLine('RYK', '22 h'),
  CHALLENGE.defendMeta,
  CHALLENGE.acceptKey,
  CHALLENGE.declineKey,
  CHALLENGE.declineConfirm,
  CHALLENGE.incomingAnnounce('RYK'),
  CHALLENGE.incomingAnnounceCount(1),
  CHALLENGE.incomingAnnounceCount(3),
  CHALLENGE.markerFrom('RYK'),
  CHALLENGE.deadlineLine('RYK'),
  CHALLENGE.closedLine,
  CHALLENGE.answerFailed,
  CHALLENGE.forfeited,
];

/** Every string the CHALLENGER can read while sending, waiting or settling. */
const challengerFacing = (): string[] => [
  CHALLENGE.sendLine('RYK', 'your tile 3,-10'),
  CHALLENGE.sendMeta('your tile 3,-10'),
  CHALLENGE.sent('your tile 3,-10'),
  CHALLENGE.waitLine('RYK'),
  CHALLENGE.duelLine,
  CHALLENGE.settlingLine('BloomHeron'),
  CHALLENGE.stakeMeta('your tile 3,-10'),
  CHALLENGE.stakeLabel('your tile 3,-10'),
  CHALLENGE.noTile,
  CHALLENGE.sendFailed,
];

describe('the defender is told to answer, never to pay', () => {
  it('states the live countdown and asks for an answer', () => {
    const line = CHALLENGE.defendLine('RYK', '22 h');
    expect(line).toContain('RYK');
    expect(line).toContain('22 h');
    expect(line).toMatch(/answer/i);
    expect(line).toMatch(/keep/i);
    // The countdown is the one time label the whole feature uses, floored (challenge-view.ts).
    expect(CHALLENGE.defendLine('RYK', '59 min')).toContain('59 min');
    expect(CHALLENGE.defendLine('RYK', '2 d')).toContain('2 d');
    // RULE CHANGE (owner, 2026-10-29): they are told what losing costs them — the contested tile.
    expect(line).toMatch(/lose the duel/i);
    expect(line).toMatch(/take it/i);
  });

  it('never shows the defender a price — no amount of Seeds, no "you pay"', () => {
    for (const text of defenderFacing()) {
      // A figure followed by "Seeds" is a price. The defender has none in this loop.
      expect(text, text).not.toMatch(/\b\d+\s*seeds?\b/i);
      expect(text, text).not.toMatch(/\byou (?:pay|owe|spend|are charged)\b/i);
      expect(text, text).not.toMatch(/\bcosts? you\b/i);
    }
  });

  it('says outright that defending costs no Seeds AND that the contested tile is what is at risk', () => {
    expect(CHALLENGE.defendMeta).toMatch(/NO SEEDS TO PAY/i);
    expect(CHALLENGE.defendMeta).toMatch(/YOUR TILE AT STAKE/i);
    // It is a statement, not a number: no countdown, no amount, nothing to misread as a charge.
    expect(CHALLENGE.defendMeta).not.toMatch(/\d/);
  });
});

describe('the challenger names the tile, never a Seed price', () => {
  it('says the challenge is free and what happens on a loss', () => {
    const line = CHALLENGE.sendLine('RYK', 'your tile 3,-10');
    expect(line).toContain('RYK');
    expect(line).toMatch(/free/i);
    expect(line).toContain('your tile 3,-10');
    expect(line).toMatch(/lose/i);
    expect(line).toMatch(/take/i);
  });

  it('names the stake in the meta line instead of an amount', () => {
    expect(CHALLENGE.sendMeta('your tile 3,-10')).toContain('YOUR TILE 3,-10 AT STAKE');
    expect(CHALLENGE.sendMeta('your tile 3,-10')).toContain('24 H TO ANSWER');
    expect(CHALLENGE.sent('your tile 3,-10')).toContain('your tile 3,-10');
    // No sentence anywhere implies that challenging is paid in Seeds.
    for (const text of challengerFacing()) {
      expect(text, text).not.toMatch(/\b\d+\s*seeds?\b/i);
      expect(text, text).not.toMatch(/\byou (?:pay|owe|spend|are charged)\b/i);
      expect(text, text).not.toMatch(/need \d+ seeds/i);
    }
  });

  it('uses the owner’s word: the tile is AT STAKE', () => {
    for (const text of [CHALLENGE.sendLine('RYK', 'your tile 3,-10'), CHALLENGE.sendMeta('your tile 3,-10'), CHALLENGE.defendMeta]) {
      expect(text, text).toMatch(/stake/i);
    }
  });
});

describe('the defender’s countdown is live, and honest at zero', () => {
  const HOUR = 60 * 60 * 1000;
  const start = 1_000_000;
  const challenge = { challengerName: 'RYK', expiresAt: start + 24 * HOUR };

  it('re-reads the deadline: the same sheet says 23 h an hour later, without reopening', () => {
    expect(defendSheetCopy(challenge, start).line).toContain('24 h');
    expect(defendSheetCopy(challenge, start + HOUR).line).toContain('23 h');
    expect(defendSheetCopy(challenge, start + 23 * HOUR + 59 * 60_000).line).toContain('1 min');
    // Never a price, at any point of the countdown.
    for (const now of [start, start + HOUR, start + 23 * HOUR]) {
      const copy = defendSheetCopy(challenge, now);
      expect(copy.line).not.toMatch(/\d+\s*seeds/i);
      expect(copy.meta).toBe(CHALLENGE.defendMeta);
      expect(copy.expired).toBe(false);
    }
  });

  it('stops asking at the deadline and says exactly what the server does', () => {
    for (const now of [start + 24 * HOUR, start + 30 * HOUR]) {
      const copy = defendSheetCopy(challenge, now);
      expect(copy.expired).toBe(true);
      expect(copy.line).toBe(CHALLENGE.deadlineLine('RYK'));
      expect(copy.meta).toBe(CHALLENGE.forfeited);
    }
  });

  it('the world view uses that one function for both the open and the ticking sheet', () => {
    const source = read('../src/online/world-view.ts');
    // Two call sites: the sheet's first paint and the once-a-second clock. A third copy of the
    // sentence would let the two drift.
    expect(source.match(/defendSheetCopy\(/g)?.length).toBe(2);
  });
});
describe('the expiry sentence matches what the server actually does', () => {
  const postgres = read('../../server/src/seeds/postgres.ts');
  const expiry = postgres.slice(postgres.indexOf('async expireChallenges'), postgres.indexOf('async adminAdjustSeeds'));
  const pending = expiry.slice(expiry.indexOf("if (c.status === 'pending')"), expiry.indexOf('} else {'));

  it('the pending branch moves the tile to the challenger and closes as expired', () => {
    expect(pending).toMatch(/takeCell\(client, c\.cellId, c\.defenderId, c\.challengerId/);
    expect(pending).toContain("status='expired'");
  });

  it('the pending branch never charges or credits the defender', () => {
    // The ONLY wallet movement (for a legacy row) is that row's recorded stake coming back.
    expect(pending).not.toMatch(/creditWallet\(client, c\.defenderId/);
    expect(pending).not.toMatch(/balance\s*-/);
  });

  it('so the sentence says the deadline passed and the challenger took the ground', () => {
    const line = CHALLENGE.deadlineLine('RYK');
    expect(line).toMatch(/deadline passed/i);
    expect(line).toContain('RYK');
    expect(line).toMatch(/takes this ground/i);
    // No refund promise, no payment by the viewer — neither is what the server does.
    expect(line).not.toMatch(/refund|seeds|pay/i);
  });
});
