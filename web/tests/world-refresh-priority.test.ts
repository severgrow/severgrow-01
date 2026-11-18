import { describe, expect, it, vi } from 'vitest';
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

// COLD START ON THE REAL SERVER (2026-11-18). Measured on futasaku.com/test/: the wallet read was
// sent and never answered, and achievements were only ever asked for after the wallet — so the pane
// said "Reading your progress…" for as long as the page stayed open. Achievements are their own read.
const hanging = () => new Promise<never>(() => {});
const achievementsState = (over: Record<string, unknown>) => {
  const world = { version: 1, revision: 2, cells: [{ id: '0,0', q: 0, r: 0 }], claims: [], disputes: [] };
  const state: any = Object.create(WorldView.prototype);
  Object.assign(state, {
    active: true, fromMemory: false, privateReadVersion: 0, publicReadVersion: 0, appliedPublicReadVersion: 0,
    world, identity: { playerId: 'me', token: 'token' }, identityKnown: true, identityFlight: null, wallet: null,
    challenges: { incoming: [], outgoing: [], serverNow: 0 }, challengeSignature: '',
    achievements: { playerId: 'me', views: null, routeMissing: false, retry: false }, achievementsLoading: false,
    paintSignature: 'same',
    client: { seedWallet: vi.fn(hanging), worldChallenges: vi.fn(hanging), worldMap: async () => ({ world }) },
    readWorld: vi.fn(async () => ({ world })), challengeSignatureOf: () => '', paintSignatureOf: () => 'same',
    chat: { prefetch: vi.fn() },
    paint: vi.fn(), notice: vi.fn(), paintWallet: vi.fn(), paintPanel: vi.fn(), paintSelection: vi.fn(),
    paintRings: vi.fn(), paintSwords: vi.fn(), pushPlanet: vi.fn(), paintStakes: vi.fn(), paintChallenges: vi.fn(),
    loadAchievements: vi.fn(), loadColour: vi.fn(), settleAutomatically: vi.fn(), schedule: vi.fn(),
    ...over,
  });
  return state;
};

it('asks for achievements the moment identity arrives, without waiting for the wallet', async () => {
  const identity = { playerId: 'me', token: 'token', kind: 'guest' };
  const state = achievementsState({ identity: null, ensureIdentity: vi.fn(async () => identity) });
  await state.attachIdentity();
  expect(state.client.seedWallet).toHaveBeenCalled();
  expect(state.loadAchievements).toHaveBeenCalled();
});

it('a poll asks again for achievements that have never arrived, even while the wallet hangs', async () => {
  const state = achievementsState({});
  await (state as WorldView).refresh();
  expect(state.loadAchievements).toHaveBeenCalledOnce();
  state.achievements = { playerId: 'me', views: null, routeMissing: false, retry: true };
  await (state as WorldView).refresh();
  expect(state.loadAchievements).toHaveBeenCalledTimes(2);
});

it('a poll does not re-read achievements that are already on screen', async () => {
  const state = achievementsState({ achievements: { playerId: 'me', views: [{ id: 'a' }], routeMissing: false, retry: false } });
  await (state as WorldView).refresh();
  expect(state.loadAchievements).not.toHaveBeenCalled();
});

it('a failed achievements read is asked again at 2 s, not at the next 12 s poll; never while hidden', async () => {
  vi.useFakeTimers();
  try {
    const state = achievementsState({ loadAchievements: WorldView.prototype['loadAchievements' as keyof WorldView], achievementRetryTimer: null, achievementRetries: 0 });
    let calls = 0;
    state.client.achievements = vi.fn(async () => { calls++; if (calls === 1) throw Object.assign(new Error('cold'), { status: 503 }); return [{ id: 'a', group: 'territory', done: false, claimed: false }]; });
    await state.loadAchievements();
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    expect(state.achievements.views).toHaveLength(1);
    // Hidden: the retry waits for the next visible poll instead.
    calls = 0;
    const hidden = achievementsState({ loadAchievements: WorldView.prototype['loadAchievements' as keyof WorldView], achievementRetryTimer: null, achievementRetries: 0 });
    hidden.client.achievements = vi.fn(async () => { calls++; throw Object.assign(new Error('cold'), { status: 503 }); });
    vi.stubGlobal('document', { hidden: true, getElementById: () => null, querySelector: () => null });
    await hidden.loadAchievements();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(1);
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});

// READY BEFORE THE TAP (owner, 2026-11-18: "this should load as soon as player opens the game right?
// even on main menu"). On the main menu, the moment an identity is known, the chat page and the
// achievements are read, so opening the Planet shows them at once.
describe('the main menu gets chat and achievements ready', () => {
  const menuState = (over: Record<string, unknown> = {}) => achievementsState({
    active: false, identity: null, achievementsReadAt: -Infinity,
    loadAchievements: vi.fn(async function (this: any) { this.achievementsReadAt = Date.now(); }), ...over });
  it('reads both as soon as the identity is known', () => {
    const state = menuState();
    (state as WorldView).warm({ playerId: 'me', token: 'token', kind: 'guest' } as never);
    expect(state.chat.prefetch).toHaveBeenCalledOnce();
    expect(state.loadAchievements).toHaveBeenCalledOnce();
    expect(state.identity).toMatchObject({ playerId: 'me' });
  });
  it('without an identity there is nothing to read yet', () => {
    const state = menuState();
    (state as WorldView).warm(null);
    expect(state.loadAchievements).not.toHaveBeenCalled();
  });
  it('a menu that repaints does not ask again for a fresh list', () => {
    const state = menuState({ achievements: { playerId: 'me', views: [{ id: 'a' }], routeMissing: false, retry: false }, achievementsReadAt: Date.now() });
    (state as WorldView).warm({ playerId: 'me', token: 'token', kind: 'guest' } as never);
    expect(state.loadAchievements).not.toHaveBeenCalled();
  });
  it('an open Planet runs its own reads; the menu warm-up stays out of its way', () => {
    const state = menuState({ active: true, identity: { playerId: 'me', token: 'token' } });
    (state as WorldView).warm({ playerId: 'me', token: 'token', kind: 'guest' } as never);
    expect(state.loadAchievements).not.toHaveBeenCalled();
  });
});
