/**
 * Territory challenge copy (docs/TERRITORY-CHALLENGES.md).
 *
 * It lives in the online layer, beside `seed-icon.ts`, because that is where Territory's own words
 * live. One sentence per state, one primary key, and the same words on the map, the sheet and the
 * list.
 *
 * 2026-10-29 pass — THE OWNER'S RULE CHANGE, verbatim:
 *   "make challenging free. make it clear, that if you lose, you lose the tile that you challenged
 *    with and opponent takes it. so challenging is like putting your tile at stake. after the match,
 *    automatically give the tile to the winner."
 *
 * So:
 *   - NO Seeds move anywhere in this loop. There is no price line, no "need N Seeds", no refund. A
 *     challenger risks one of their OWN tiles (`stakeCellId`), auto-chosen nearest the contested
 *     ground; the defender risks the CONTESTED tile. The winner takes the loser's tile.
 *   - The challenger's lines NAME the tile at stake (a coordinate is the only unambiguous name, and
 *     the map also rings it). The defender's lines name the ground they would lose.
 *   - Settlement is automatic. `settlingLine` is shown while the server is applying it; the only key
 *     is a harmless fallback (`settleKey`) for a client that has not seen the resolved row yet. No
 *     player is ever asked to press CONFIRM / TAKE THE GROUND.
 *   - A draw has no winner and NOTHING changes hands; the copy says exactly that.
 *
 * `web/tests/territory-defender-copy.test.ts` pins the words to the server's behaviour and fails if
 * anyone reintroduces a Seed price into a challenge.
 */

/** The one way a tile is named in a sentence. The map rings the same tile. */
/**
 * How a staked tile is NAMED in a sentence.
 *
 * Not its coordinate: this file's own rule (see the header) is that `3,-10` is the machine's name for
 * the ground, never a sentence a player reads. The tile is identified on the MAP instead — the stake
 * marker sits on that exact cell — so the words only have to say whose it is and that it is at risk.
 * The id is still what the marker uses; it is simply not spoken.
 */
export const stakeName = (_cellId: string): string => 'your nearest tile';

export const CHALLENGE = Object.freeze({
  title: 'Territory challenge',
  listLabel: 'Challenges',
  incoming: 'INCOMING',
  outgoing: 'OUTGOING',
  /**
   * The challenger's offer: what it costs (nothing) and what is at risk (their own tile). The tile
   * is the auto-chosen nearest one; the tap that opens this sheet also marks it on the map.
   */
  sendLine: (name: string, tile: string) =>
    `${name} holds this ground. Challenge for free — ${tile} is at stake: lose and they take it.`,
  sendKey: 'CHALLENGE',
  /** The tile bar's key on contested ground: it opens that challenge's own sheet. */
  viewKey: 'VIEW CHALLENGE',
  /**
   * The DEFENDER's sheet: who challenged, the live countdown, and the one thing they would lose —
   * the contested ground. Answering costs nothing; only the duel decides it.
   */
  defendLine: (name: string, left: string) =>
    `${name} challenged your tile. Answer within ${left} to keep it — lose the duel and they take it.`,
  /**
   * The defender's meta line: the owner's report was about being shown a price. Uppercase because
   * the sheet's meta line is set in caps, and deliberately number-free.
   */
  defendMeta: 'NO SEEDS TO PAY · YOUR TILE AT STAKE',
  acceptKey: 'ACCEPT',
  declineKey: 'DECLINE',
  /** Declining is the one irreversible key: the first press only arms it. */
  declineConfirm: 'TAP AGAIN TO DECLINE',
  waitLine: (name: string) => `You challenged ${name}. They have 24 h to answer — your tile is at stake.`,
  duelLine: 'Win the duel, take the ground. Lose it, they take your tile.',
  openDuelKey: 'OPEN DUEL',
  /**
   * Settlement is automatic. This is what the sheet says while the server applies it: the winner
   * has already been decided, so there is nothing for the player to choose.
   */
  settlingLine: (name: string) => `${name} won the duel. Settling the ground…`,
  /** `settleKey` is the harmless fallback only: it posts the same idempotent confirm the server does. */
  settleKey: 'SETTLE NOW',
  drawLine: 'A draw. Nothing changes hands.',
  drawMeta: 'NOTHING CHANGES HANDS · NO SEEDS TO PAY',
  /** `contested` is true when the winner is the challenger, who took this very ground. */
  resolvedLine: (name: string | null, contested: boolean) => {
    if (name === null) return 'Nothing changed hands.';
    return contested ? `${name} took this ground.` : `${name} kept this ground and took a tile.`;
  },
  closedLine: 'This challenge is over.',
  notNow: 'NOT NOW',
  close: 'CLOSE',
  remaining: (left: string) => `${left} left`,
  /**
   * The deadline itself, when it has passed with no answer. This sentence is the server's rule
   * (`expireChallenges`: the contested tile moves to the challenger, their own staked tile simply
   * stays theirs, the defender is never charged). `web/tests/territory-defender-copy.test.ts` fails
   * if the two ever disagree.
   */
  deadlineLine: (name: string) => `The deadline passed. ${name} takes this ground.`,
  /** The challenger's offer's meta line: the stake, then the answer window. Never a Seed amount. */
  sendMeta: (tile: string) => `${tile.toUpperCase()} AT STAKE · 24 H TO ANSWER`,
  /** The same meta for a challenge that already exists (waiting, contested, settling). */
  stakeMeta: (tile: string) => `${tile.toUpperCase()} AT STAKE`,
  /** The map ring's spoken name, so a screen reader is told which tile is at risk. */
  stakeLabel: (tile: string) => `${tile} is at stake in a challenge.`,  /** The rail's cap: anything past it is counted, never silently dropped. */
  more: (count: number) => `+${count} MORE`,
  /** A polite screen-reader line for a player who cannot see the rail appear. */
  incomingAnnounce: (name: string) => `${name} challenged your ground.`,
  /** The menu key's spoken line, without the challenger's name (the menu has not read it). */
  incomingAnnounceCount: (count: number) => (count === 1
    ? '1 challenge is waiting for your answer.'
    : `${count} challenges are waiting for your answer.`),
  /** The crossed swords on a contested tile: the glyph's one spoken name, who and which side. */
  markerFrom: (name: string) => `Challenge on this tile. ${name} challenged you.`,
  markerTo: (name: string) => `Challenge on this tile. You challenged ${name}.`,
  /**
   * ANOTHER PAIR'S DISPUTE (owner, 2026-10-29): information, not a call to action. It names nobody
   * — the mark is about the TILE being in dispute — and says whether the duel has started, because
   * "waiting" and "being fought" are different news. Both are read by assistive tech only; there is
   * no tap, so no sentence here may promise one.
   */
  othersPending: 'A tile in dispute. Another player has challenged this ground.',
  othersLive: 'A tile in dispute. A duel is being played over this ground.',
  /** A challenger with no tile cannot put one at stake. Clear, and not about money. */
  noTile: 'You need a tile of your own to put at stake.',
  /** Every tile you hold already backs a challenge (one tile backs one stake). */
  allStaked: 'All your tiles are already at stake. Finish a challenge, or grow another tile.',
  busy: 'Someone already challenged this ground.',
  sendFailed: 'The challenge did not send. Nothing was taken.',
  answerFailed: 'That answer did not send. Try again.',
  confirmFailed: 'That result is not settled yet. Try again.',
  settled: 'The ground is yours.',
  resultSettled: 'The result is settled.',
  alreadySettled: 'That result was already settled.',
  sent: (tile: string) => `Challenge sent. ${tile} is at stake until they answer.`,
  duel: 'DUEL',
  /** A finished duel whose settlement is being applied (no tap needed). */
  settlingShort: 'SETTLING',
  settledShort: 'SETTLED',
  forfeited: 'FORFEITED',
  stale: 'STALE',
  closedShort: 'CLOSED',
  declinedShort: 'DECLINED',
} as const);
