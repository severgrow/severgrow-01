/**
 * Territory challenge copy (docs/TERRITORY-CHALLENGES.md).
 *
 * It lives in the online layer, beside `seed-icon.ts`, because the product calls the currency by its
 * own word — the same word the Territory wallet already shows. `src/strings.ts` is scanned by
 * `web/tests/seed-words.test.ts`, which keeps the retired seed/plant vocabulary out of the game's
 * shared strings; the currency label has always lived on this side of that boundary.
 *
 * One sentence per state, one primary key, and the same words on the map, the sheet and the list.
 *
 * 2026-10-24 pass: the sheet no longer prints the contested cell's coordinate. A player reads the
 * holder's name, what it costs and how long is left; `3,-10` is the machine's name for the ground
 * and stays in the DOM (data attributes) rather than in a sentence. The stake is always read from
 * the world's own `cost`, never written as "100" here.
 */
export const CHALLENGE = Object.freeze({
  title: 'Territory challenge',
  listLabel: 'Challenges',
  incoming: 'INCOMING',
  outgoing: 'OUTGOING',
  /** the challenger's sheet: the rival's name and the exact stake, then one key */
  sendLine: (name: string, stake: number) => `${name} holds this ground. Stake ${stake} Seeds and give them 24 h?`,
  sendKey: 'CHALLENGE',
  /** the defender's sheet: what is at stake and how long is left, then ACCEPT / DECLINE */
  defendLine: (name: string, stake: number) => `${name} staked ${stake} Seeds on this ground. Answer within 24 h?`,
  acceptKey: 'ACCEPT',
  declineKey: 'DECLINE',
  /** Declining is the one irreversible key: the first press only arms it. */
  declineConfirm: 'TAP AGAIN TO DECLINE',
  waitLine: (name: string) => `Your challenge is with ${name}. They have 24 h to answer.`,
  duelLine: 'The duel decides the ground.',
  openDuelKey: 'OPEN DUEL',
  confirmLine: (name: string) => `${name} won the duel. Take the ground?`,
  drawLine: 'The duel was a draw. The ground stays with its holder.',
  drawKey: 'CONFIRM DRAW',
  takeKey: 'TAKE THE GROUND',
  resolvedLine: (name: string | null) => (name ? `${name} took this ground.` : 'The ground did not change hands.'),
  closedLine: 'This challenge is closed.',
  notNow: 'NOT NOW',
  close: 'CLOSE',
  remaining: (left: string) => `${left} left`,
  stakeMeta: (stake: number, left: string) => `${stake} SEEDS · ${left} LEFT`,
  /** The offer's meta line: what it costs and the one thing it buys. */
  sendMeta: (stake: number) => `${stake} SEEDS · 24 H TO ANSWER`,
  /** The confirm's meta line: the stake is already committed, so only the amount is news. */
  stakeOnly: (stake: number) => `${stake} SEEDS`,
  /** The rail's cap: anything past it is counted, never silently dropped. */
  more: (count: number) => `+${count} MORE`,
  /** A polite screen-reader line for a player who cannot see the rail appear. */
  incomingAnnounce: (name: string) => `${name} is challenging your ground.`,
  /** The menu key's spoken line, without the challenger's name (the menu has not read it). */
  incomingAnnounceCount: (count: number) => (count === 1
    ? '1 challenge is waiting for your answer.'
    : `${count} challenges are waiting for your answer.`),
  noFunds: (stake: number) => `You need ${stake} Seeds to challenge.`,
  busy: 'That ground is already challenged.',
  sendFailed: 'That challenge could not be sent. No Seeds were taken.',
  answerFailed: 'That answer could not be sent. Try again.',
  confirmFailed: 'That result could not be confirmed yet. Try again.',
  settled: 'The ground is yours.',
  resultSettled: 'The result is settled.',
  alreadySettled: 'That result was already confirmed.',
  sent: (stake: number) => `The challenge is sent. Your ${stake} Seeds are held until it is answered.`,
  duel: 'DUEL',
  ready: 'READY TO CLAIM',
  settledShort: 'SETTLED',
  forfeited: 'FORFEITED',
  stale: 'STALE',
  closedShort: 'CLOSED',
  declinedShort: 'DECLINED',
} as const);
