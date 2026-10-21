/**
 * Territory challenge copy (docs/TERRITORY-CHALLENGES.md).
 *
 * It lives in the online layer, beside `seed-icon.ts`, because the product calls the currency by its
 * own word — the same word the Territory wallet already shows. `src/strings.ts` is scanned by
 * `web/tests/seed-words.test.ts`, which keeps the retired seed/plant vocabulary out of the game's
 * shared strings; the currency label has always lived on this side of that boundary.
 *
 * One sentence per state, one primary key, and the same words on the map, the sheet and the list.
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
  noFunds: 'You need 100 Seeds to challenge.',
  busy: 'That ground is already challenged.',
  sendFailed: 'That challenge could not be sent. No Seeds were taken.',
  answerFailed: 'That answer could not be sent. Try again.',
  confirmFailed: 'That result could not be confirmed yet. Try again.',
  settled: 'The ground is yours.',
  resultSettled: 'The result is settled.',
  alreadySettled: 'That result was already confirmed.',
  sent: 'The challenge is sent. Your 100 Seeds are held until it is answered.',
  duel: 'DUEL',
  ready: 'READY TO CLAIM',
  settledShort: 'SETTLED',
  forfeited: 'FORFEITED',
  stale: 'STALE',
  declinedShort: 'DECLINED',
} as const);
