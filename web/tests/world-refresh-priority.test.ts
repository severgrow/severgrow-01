import { expect, it, vi } from 'vitest';
import { WorldView } from '../src/online/world-view.js';

it('reports the first failed public read when a fresh visit has no map to show', async () => {
  const view: any = Object.create(WorldView.prototype);
  Object.assign(view, {
    active: true, world: null, identity: null, privateReadVersion: 0, publicReadVersion: 0,
    readFailures: 0, readWorld: vi.fn(async () => { throw new Error('offline'); }),
    notice: vi.fn(), schedule: vi.fn(),
  });
  await (view as WorldView).refresh(true);
  expect(view.notice).toHaveBeenCalledWith('Could not read the map. Try again.');
  expect(view.schedule).toHaveBeenCalledOnce();
});

it('retries missing guest identity on a later map refresh after a temporary outage', async () => {
  const world = { version: 1, revision: 1, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [], disputes: [] };
  const identity = { playerId: 'me', token: 'token', kind: 'guest' };
  const view: any = Object.create(WorldView.prototype);
  Object.assign(view, {
    active: true, identityKnown: true, identity: null, identityFlight: null,
    world, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0,
    appliedPublicReadVersion: 0, readFailures: 0,
    ensureIdentity: vi.fn(async () => identity),
    client: { seedWallet: async () => null, worldChallenges: async () => null,
      worldMap: async () => ({ world }) },
    chat: { prefetch: vi.fn() }, readWorld: async () => ({ world }),
    challenges: { incoming: [], outgoing: [], serverNow: 0 },
    achievements: { retry: false }, paintSignature: 'same',
    challengeSignatureOf: () => '', paintSignatureOf: () => 'same',
    paint: vi.fn(), notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(),
    paintSelection: vi.fn(), paintRings: vi.fn(), paintSwords: vi.fn(),
    pushPlanet: vi.fn(), paintStakes: vi.fn(), paintChallenges: vi.fn(),
    loadAchievements: vi.fn(), loadColour: vi.fn(), settleAutomatically: vi.fn(), schedule: vi.fn(),
  });
  await (view as WorldView).refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(view.ensureIdentity).toHaveBeenCalledOnce();
  expect(view.identity).toEqual(identity);
  expect(view.chat.prefetch).toHaveBeenCalledOnce();
});

it('paints a fresh public planet before a slow private wallet or challenge read', async () => {
  let finishPrivate!: (value: unknown) => void;
  const slowPrivate = new Promise<unknown>(resolve => { finishPrivate = resolve; });
  const world = { version: 1, revision: 2, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [], disputes: [] };
  const state: any = Object.create(WorldView.prototype);
  Object.assign(state, {
    active: true, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0, appliedPublicReadVersion: 0, world: { ...world, revision: 1 },
    identity: { playerId: 'me', token: 'token' }, wallet: null,
    challenges: { incoming: [], outgoing: [], serverNow: 0 },
    achievements: { retry: false }, paintSignature: 'old',
    client: { worldMap: vi.fn(async () => ({ world })), seedWallet: () => slowPrivate,
      worldChallenges: () => slowPrivate },
    readWorld: vi.fn(async () => ({ world })),
    challengeSignatureOf: () => '', paintSignatureOf: () => 'new',
    paint: vi.fn(() => { state.paintSignature = 'new'; }), notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(),
    paintSelection: vi.fn(), paintRings: vi.fn(), paintSwords: vi.fn(),
    pushPlanet: vi.fn(), paintStakes: vi.fn(), paintChallenges: vi.fn(),
    loadAchievements: vi.fn(), settleAutomatically: vi.fn(), schedule: vi.fn(),
  });
  const refresh = (state as WorldView).refresh(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.world).toBe(world);
  expect(state.paint).toHaveBeenCalledOnce();
  finishPrivate({ balance: 40, incoming: [], outgoing: [], serverNow: 0 });
  await refresh;
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.wallet.balance).toBe(40);
  expect(state.paintSelection).toHaveBeenCalledTimes(2);
  let finishMutation!: (value: unknown) => void;
  state.client.seedWallet = () => new Promise(resolve => { finishMutation = resolve; });
  let actionSettled = false;
  const mutation = (state as WorldView).refresh(true, true).then(() => { actionSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(actionSettled).toBe(false);
  finishMutation({ balance: 30 });
  await mutation;
  expect(actionSettled).toBe(true);
  expect(state.wallet.balance).toBe(30);
});

it('does not repaint older ownership after a newer forced response', async () => {
  const pending: Array<(value: unknown) => void> = [];
  const walletPending: Array<(value: unknown) => void> = [];
  const first = { version: 1, revision: 2, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [], disputes: [] };
  const newer = { ...first, revision: 3 };
  const state: any = Object.create(WorldView.prototype);
  Object.assign(state, {
    active: true, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0, appliedPublicReadVersion: 0,
    world: { ...first, revision: 1 }, identity: { playerId: 'me', token: 'token' },
    wallet: null, challenges: { incoming: [], outgoing: [], serverNow: 0 },
    achievements: { retry: false }, paintSignature: 'old',
    client: { worldMap: () => new Promise(resolve => pending.push(resolve)),
      seedWallet: () => new Promise(resolve => walletPending.push(resolve)), worldChallenges: async () => null },
    challengeSignatureOf: () => '', paintSignatureOf: () => 'new',
    paint: vi.fn(() => { state.paintSignature = 'new'; }), notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(),
    paintSelection: vi.fn(), paintRings: vi.fn(), paintSwords: vi.fn(),
    pushPlanet: vi.fn(), paintStakes: vi.fn(), paintChallenges: vi.fn(),
    loadAchievements: vi.fn(), settleAutomatically: vi.fn(), schedule: vi.fn(),
  });
  const slow = (state as WorldView).refresh(true);
  const fast = (state as WorldView).refresh(true);
  pending[1]!({ world: newer });
  await fast;
  pending[0]!({ world: first });
  await slow;
  walletPending[1]!({ balance: 30 });
  await new Promise(resolve => setTimeout(resolve, 0));
  walletPending[0]!({ balance: 10 });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.world).toBe(newer);
  expect(state.wallet.balance).toBe(30);
  expect(state.paint).toHaveBeenCalledOnce();
});

it('does not rewind a same-revision skin or colour with an older request', async () => {
  const pending: Array<(value: unknown) => void> = [];
  const claim = (colour: string) => ({ cellId: '0,0', ownerId: 'me', ownerName: 'Me', colour,
    skin: 'forest', claimedAt: 1 });
  const old = { version: 1, revision: 2, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [claim('green')], disputes: [] };
  const fresh = { ...old, claims: [claim('red')] };
  const state: any = Object.create(WorldView.prototype);
  Object.assign(state, {
    active: true, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0, appliedPublicReadVersion: 0,
    world: { ...old, revision: 1 }, identity: { playerId: 'me', token: 'token' },
    wallet: null, challenges: { incoming: [], outgoing: [], serverNow: 0 },
    achievements: { retry: false }, paintSignature: 'old',
    client: { worldMap: () => new Promise(resolve => pending.push(resolve)),
      seedWallet: async () => null, worldChallenges: async () => null },
    challengeSignatureOf: () => '', paintSignatureOf: () => 'new',
    paint: vi.fn(() => { state.paintSignature = 'new'; }),
    notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(), paintSelection: vi.fn(),
    paintRings: vi.fn(), paintSwords: vi.fn(), pushPlanet: vi.fn(), paintStakes: vi.fn(),
    paintChallenges: vi.fn(), loadAchievements: vi.fn(), settleAutomatically: vi.fn(), schedule: vi.fn(),
  });
  const earlier = (state as WorldView).refresh(true);
  const later = (state as WorldView).refresh(true);
  pending[1]!({ world: fresh }); await later;
  pending[0]!({ world: old }); await earlier;
  expect(state.world.claims[0].colour).toBe('red');
});

it('reuses a slow private read across public polls so the wallet can still settle', async () => {
  let finishWallet!: (value: unknown) => void;
  const wallet = new Promise(resolve => { finishWallet = resolve; });
  const world = { version: 1, revision: 2, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [], disputes: [] };
  const state: any = Object.create(WorldView.prototype);
  Object.assign(state, {
    active: true, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0, appliedPublicReadVersion: 0,
    world: { ...world, revision: 1 }, identity: { playerId: 'me', token: 'token' }, wallet: { balance: 55 },
    challenges: { incoming: [], outgoing: [], serverNow: 0 }, challengeSignature: '',
    achievements: { retry: false }, paintSignature: 'old',
    client: { seedWallet: vi.fn(() => wallet), worldChallenges: vi.fn(async () => null) },
    readWorld: vi.fn(async () => ({ world })), challengeSignatureOf: () => '', paintSignatureOf: () => 'new',
    paint: vi.fn(() => { state.paintSignature = 'new'; }), notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(),
    paintSelection: vi.fn(), paintRings: vi.fn(), paintSwords: vi.fn(), pushPlanet: vi.fn(),
    paintStakes: vi.fn(), paintChallenges: vi.fn(), loadAchievements: vi.fn(),
    settleAutomatically: vi.fn(), schedule: vi.fn(),
  });
  await (state as WorldView).refresh();
  await (state as WorldView).refresh();
  finishWallet({ balance: 55 });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.client.seedWallet).toHaveBeenCalledOnce();
  expect(state.wallet.balance).toBe(55);
  expect(state.paintPanel).toHaveBeenCalledTimes(2);
});
