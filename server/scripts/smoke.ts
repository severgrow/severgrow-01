// A manual end-to-end smoke of a running duel server. Not part of the test suite: it talks to a
// real deployment so you can verify a live environment quickly.
//
//   PORT=8787 npm run server:dev                 # terminal 1
//   npm run server:smoke                         # terminal 2
//   BASE_URL=https://duel.example npm run server:smoke
import { DuelClient } from '../src/client.js';
import type { FetchLike, KeyValue } from '../src/client.js';

const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;

const memory = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

let failures = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
  if (!ok) failures++;
};

const main = async (): Promise<void> => {
  const fetchImpl = globalThis.fetch as unknown as FetchLike;
  const a = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });
  const b = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });

  const health = await fetchImpl(`${baseUrl}/v1/health`, { method: 'GET', headers: {} });
  const healthBody = (await health.json()) as { ok?: boolean; rulesVersion?: string };
  check('health reports the pinned rules version', healthBody.ok === true && typeof healthBody.rulesVersion === 'string', healthBody.rulesVersion);

  const guestA = await a.createGuest('Smoke A');
  const guestB = await b.createGuest('Smoke B');
  check('two guests can be created', guestA.ok && guestB.ok);

  const created = await a.createMatch(guestA.token);
  check('guest A creates a waiting match with an invite code', created.match.status === 'waiting' && created.match.inviteCode.length === 8, created.match.inviteCode);

  const joined = await b.joinMatch(guestB.token, created.match.inviteCode);
  check('guest B joins with the code and the match becomes active', joined.match.status === 'active' && joined.player.seat === 1);

  const matchId = created.match.matchId;
  const viewA = (await a.getState(guestA.token, matchId)).player;
  const viewB = (await b.getState(guestB.token, matchId)).player;
  const hidden = (payload: typeof viewA): boolean =>
    !Object.keys(payload.view).some((k) => ['seed', 'deck', 'hands', 'history', 'fruitKnown'].includes(k));
  check('both views hide the seed, the deck and both hands', hidden(viewA) && hidden(viewB));
  check('the two seats see different own hands', JSON.stringify(viewA.view.hand) !== JSON.stringify(viewB.view.hand));

  const acting = viewA.legalActions.length > 0 ? { client: a, token: guestA.token, payload: viewA } : { client: b, token: guestB.token, payload: viewB };
  check('the player to act has legal actions', acting.payload.legalActions.length > 0, `seat ${acting.payload.seat}`);
  const action = acting.payload.legalActions[0]!;

  const submitted = await acting.client.submitAction(acting.token, matchId, {
    expectedRevision: acting.payload.revision,
    requestId: 'smoke-move-1',
    action,
  });
  check('a legal action is accepted and the revision advances', submitted.replayed === false && submitted.player.revision === acting.payload.revision + 1);

  const replay = await acting.client.submitAction(acting.token, matchId, {
    expectedRevision: acting.payload.revision,
    requestId: 'smoke-move-1',
    action,
  });
  check('the same request id is applied exactly once (replayed)', replay.replayed === true && replay.player.revision === submitted.player.revision);

  const stale = await acting.client
    .submitAction(acting.token, matchId, { expectedRevision: acting.payload.revision, requestId: 'smoke-move-2', action })
    .then(() => 'accepted')
    .catch((error: unknown) => (error as { code?: string }).code ?? 'unknown');
  check('a stale revision is refused', stale === 'STALE_REVISION', String(stale));

  const after = (await a.getState(guestA.token, matchId)).player;
  const afterB = (await b.getState(guestB.token, matchId)).player;
  check('both seats see the new revision', after.revision === submitted.player.revision && afterB.revision === submitted.player.revision);

  const reconnect = await a.reconnect(guestA.token, matchId, 0);
  check('reconnect returns the view and the public events', reconnect.player.revision === after.revision && reconnect.player.events.length > 0, `${reconnect.player.events.length} events`);

  const outsider = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });
  const outsiderGuest = await outsider.createGuest();
  const denied = await outsider
    .getState(outsiderGuest.token, matchId)
    .then(() => 'allowed')
    .catch((error: unknown) => (error as { code?: string }).code ?? 'unknown');
  check('an unrelated player cannot read the match', denied === 'NOT_A_PARTICIPANT', String(denied));

  const badToken = await a
    .getState('not-a-real-token-value-1234567890', matchId)
    .then(() => 'allowed')
    .catch((error: unknown) => (error as { code?: string }).code ?? 'unknown');
  check('a bad token is rejected', badToken === 'UNAUTHORIZED', String(badToken));

  console.log(failures === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

await main();
