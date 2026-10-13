// Phase 3b — perspective layer: map/unmap, seat mirror, seat-1 full game, camera, replay.
import { describe, expect, it, beforeAll } from 'vitest';
import {
  applyAs,
  coordKey,
  eventsOf,
  homeCoord,
  legalActions,
  mirror,
  newGame,
  parseKey,
  viewFor,
  CURRENT_RULES_VERSION,
} from '../../src/engine/index.js';
import type { Action, Event, Player, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import {
  SHARED_FIELDS,
  PRIVATE_FIELDS,
  PERSONAL_SETTINGS,
  classicHexKeys,
  createOnlineDriver,
  createPerspective,
  homesOnScreen,
  offlinePerspective,
  onlinePerspective,
  previewCameraFrame,
} from '../src/online/index.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import { setOrient, setRotation } from '../src/logic/orient.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

beforeAll(() => {
  setOrient('pointy');
  setRotation(0);
});

const eventHexKeys = (ev: Event): string[] => {
  if (ev.t === 'Bloom') return ev.hexes.map(coordKey);
  if (ev.t === 'Sprout' || ev.t === 'Strengthen' || ev.t === 'Overgrow') return [coordKey(ev.coord)];
  if (ev.t === 'RotPick') return [coordKey(ev.coord)];
  if (ev.t === 'FruitCard') return [coordKey(ev.target)];
  if (ev.t === 'MegaBomb') return [coordKey(ev.target), ...ev.destroyed.map(coordKey)];
  if (ev.t === 'Rot' || ev.t === 'Sever') return ev.coords.map(coordKey);
  return [];
};

describe('perspective map/unmap', () => {
  it('roundtrips every classic hex for both seats', () => {
    for (const seat of [0, 1] as const) {
      const p = onlinePerspective(seat);
      for (const key of classicHexKeys(3)) {
        expect(p.unmapKey(p.mapKey(key))).toBe(key);
        const c = parseKey(key);
        expect(p.unmapCoord(p.mapCoord(c))).toEqual(c);
      }
    }
  });

  it('seat 0 is identity; seat 1 is (q,r)→(-q,-r)', () => {
    const s0 = onlinePerspective(0);
    const s1 = onlinePerspective(1);
    expect(s0.rotated).toBe(false);
    expect(s1.rotated).toBe(true);
    for (const key of classicHexKeys(3)) {
      expect(s0.mapKey(key)).toBe(key);
      expect(s1.mapKey(key)).toBe(coordKey(mirror(parseKey(key))));
    }
  });

  it('offline uses identity and rejects seat 1', () => {
    const off = offlinePerspective();
    expect(off.me).toBe(0);
    expect(off.rotated).toBe(false);
    expect(off.online).toBe(false);
    expect(off.coachEnabled).toBe(true);
    expect(off.hiddenDeckHintsEnabled).toBe(true);
    expect(() => createPerspective({ me: 1, online: false })).toThrow(/seat 0/);
  });

  it('online turns coach and hidden-deck hints off; Me/Opponent labels', () => {
    for (const seat of [0, 1] as const) {
      const p = onlinePerspective(seat);
      expect(p.coachEnabled).toBe(false);
      expect(p.hiddenDeckHintsEnabled).toBe(false);
      expect(p.labels.scoreMe).toBe('Me');
      expect(p.labels.scoreOpponent).toBe('Opponent');
      expect(p.labels.captionWho(seat)).toBe('You');
      expect(p.labels.captionWho(seat === 0 ? 1 : 0)).toBe('Opponent');
      expect(p.labels.material(seat)).toBe('moss');
      expect(p.labels.material(seat === 0 ? 1 : 0)).toBe('lava');
      expect(p.labels.homeKind(seat)).toBe('tree');
      expect(p.labels.homeKind(seat === 0 ? 1 : 0)).toBe('volcano');
      expect(p.labels.scorePair(12, 8)).toBe('12:8');
    }
    expect(SHARED_FIELDS).toEqual(['tiles', 'scores', 'throw', 'deckCount', 'turnsLeft', 'starter']);
    expect(PRIVATE_FIELDS).toEqual(['hand', 'draft', 'selection', 'undo']);
    expect(PERSONAL_SETTINGS).toContain('bloomHints');
  });
});

describe('seat 0 vs seat 1 mirror', () => {
  it('same match: screen boards are mirrors with Me=moss on both', () => {
    let s = newGame(42);
    for (let i = 0; i < 40 && s.phase !== 'GAME_OVER'; i++) {
      s = applyAs(s, s.actor, GreedyBot.chooseAction(viewFor(s, s.actor)));
    }
    const p0 = onlinePerspective(0);
    const p1 = onlinePerspective(1);
    const b0 = p0.mapBoardToScreen(s.board);
    const b1 = p1.mapBoardToScreen(s.board);

    for (const key of classicHexKeys(3)) {
      const eng = s.board[key];
      if (!eng) continue;
      const k0 = p0.mapKey(key);
      const k1 = p1.mapKey(key);
      expect(k1).toBe(coordKey(mirror(parseKey(k0))));
      expect(b0[k0]?.strength).toBe(eng.strength);
      expect(b1[k1]?.strength).toBe(eng.strength);
      expect(b0[k0]?.owner).toBe(p0.displayOwner(eng.owner));
      expect(b1[k1]?.owner).toBe(p1.displayOwner(eng.owner));
    }

    const h0 = homesOnScreen(p0, s.config);
    const h1 = homesOnScreen(p1, s.config);
    expect(h0.me.y).toBeGreaterThan(h0.opp.y);
    expect(h1.me.y).toBeGreaterThan(h1.opp.y);
    expect(h1.me.key).toBe(h0.me.key);
    expect(h1.opp.key).toBe(h0.opp.key);
  });
});

describe('full game as seat 1 through map/unmap', () => {
  it('tap/Bloom/Strengthen/Bomb/Blast path matches seat-0 server result', () => {
    const seed = 77;
    let auth = newGame(seed);
    let seat1 = newGame(seed);
    const p1 = onlinePerspective(1);
    const seen = { bloom: false, sprout: false, strengthen: false, fruit: false, mega: false };

    while (auth.phase !== 'GAME_OVER' && seat1.phase !== 'GAME_OVER') {
      expect(seat1.actor).toBe(auth.actor);
      const actor = auth.actor as Player;
      const legal = legalActions(viewFor(auth, actor));

      const pick =
        legal.find((a) => a.t === 'MegaBomb') ??
        legal.find((a) => a.t === 'PlayFruit') ??
        legal.find((a) => a.t === 'Bloom') ??
        legal.find((a) => a.t === 'Sprout') ??
        GreedyBot.chooseAction(viewFor(auth, actor));

      if (pick.t === 'Bloom') seen.bloom = true;
      if (pick.t === 'Sprout') {
        seen.sprout = true;
        const before = auth.board[coordKey(pick.coord)];
        if (before && before.owner === actor) seen.strengthen = true;
      }
      if (pick.t === 'PlayFruit') seen.fruit = true;
      if (pick.t === 'MegaBomb') seen.mega = true;

      const screen = p1.mapActionToScreen(pick);
      const back = p1.mapActionToEngine(screen);
      expect(back).toEqual(pick);

      auth = applyAs(auth, actor, pick);
      seat1 = applyAs(seat1, actor, back);
      expect(JSON.stringify(seat1.board)).toBe(JSON.stringify(auth.board));
      expect(seat1.result).toEqual(auth.result);
    }
    expect(auth.phase).toBe('GAME_OVER');
    expect(seat1.result).toEqual(auth.result);
    expect(seen.sprout || seen.bloom).toBe(true);
  });

  it('surround win as seat 1 matches seat 0', () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      let s = newGame(seed);
      const log: Action[] = [];
      for (let i = 0; i < 200 && s.phase !== 'GAME_OVER'; i++) {
        const a = GreedyBot.chooseAction(viewFor(s, s.actor));
        log.push(a);
        s = applyAs(s, s.actor, a);
      }
      if (s.result?.reason !== 'strangle' && s.result?.reason !== 'double_strangle') continue;
      found = true;
      const p1 = onlinePerspective(1);
      let a0 = newGame(seed);
      let a1 = newGame(seed);
      for (const action of log) {
        const screen = p1.mapActionToScreen(action);
        const engine = p1.mapActionToEngine(screen);
        expect(engine).toEqual(action);
        a0 = applyAs(a0, a0.actor, action);
        a1 = applyAs(a1, a1.actor, engine);
      }
      expect(a1.result).toEqual(a0.result);
      expect(a0.result?.reason === 'strangle' || a0.result?.reason === 'double_strangle').toBe(true);
    }
    expect(found).toBe(true);
  });
});

describe('camera framing both seats', () => {
  const widths = [360, 390, 430, 1280] as const;

  it('frames my tiles first at phone and desktop widths for both seats', () => {
    let s = newGame(19);
    for (let i = 0; i < 50 && s.phase !== 'GAME_OVER'; i++) {
      s = applyAs(s, s.actor, GreedyBot.chooseAction(viewFor(s, s.actor)));
    }
    for (const seat of [0, 1] as const) {
      const p = onlinePerspective(seat);
      const tiles = p.cameraTiles(s.board);
      const homes = homesOnScreen(p, s.config);
      expect(homes.me.y).toBeGreaterThan(homes.opp.y);
      for (const width of widths) {
        const height = width === 1280 ? 800 : Math.round(width * (844 / 390));
        const frame = previewCameraFrame({ tiles, me: 0, width, height });
        expect(frame.tile).toBeGreaterThan(0);
        const mine = tiles.filter((t) => t.owner === 0).map((t) => t.key);
        if (!frame.whole) {
          for (const k of mine) expect(frame.framedKeys).toContain(k);
        } else {
          expect(frame.framedKeys.length).toBe(tiles.length);
        }
        expect(Number.isFinite(frame.cx)).toBe(true);
        expect(Number.isFinite(frame.cy)).toBe(true);
      }
    }
  });
});

describe('opponent replay hexes', () => {
  it('mapped events land on the mirrored hexes for both seats', () => {
    let before = newGame(33);
    let after = before;
    let acted: Action | null = null;
    for (let i = 0; i < 80; i++) {
      const actor = after.actor;
      const a = GreedyBot.chooseAction(viewFor(after, actor));
      if (a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit' || a.t === 'MegaBomb') {
        before = after;
        after = applyAs(after, actor, a);
        acted = a;
        break;
      }
      after = applyAs(after, actor, a);
    }
    expect(acted).not.toBeNull();
    const boardEvs = eventsOf(before, acted!, after).filter((e) => eventHexKeys(e).length > 0);
    expect(boardEvs.length).toBeGreaterThan(0);

    const p0 = onlinePerspective(0);
    const p1 = onlinePerspective(1);
    for (const ev of boardEvs) {
      const s0 = p0.mapEventToScreen(ev);
      const s1 = p1.mapEventToScreen(ev);
      const keys0 = eventHexKeys(s0);
      const keys1 = eventHexKeys(s1);
      expect(keys0.length).toBe(keys1.length);
      for (let i = 0; i < keys0.length; i++) {
        expect(keys1[i]).toBe(coordKey(mirror(parseKey(keys0[i]!))));
      }
      for (const k of keys1) {
        expect(p1.unmapKey(k)).toBe(coordKey(mirror(parseKey(k))));
      }
    }
  });
});

describe('OnlineDriver exposes perspective', () => {
  it('seat 1 snapshot rotates screen view; coach off; engine view untouched', () => {
    const state = newGame(5);
    const view = viewFor(state, 1);
    const payload: MatchViewPayload = {
      matchId: 'm1',
      seat: 1,
      status: 'active',
      revision: 1,
      turnStartRevision: 1,
      startingPlayer: view.turnPlayer,
      view,
      legalActions: legalActions(view),
      events: [],
      turnDeadlineAt: null,
      graceUsed: [0, 0],
      gracePeriods: 1,
      result: null,
      opponent: { seat: 0, displayName: 'Friend', playerId: 'p0' },
      rulesVersion: CURRENT_RULES_VERSION,
      serverNow: 1,
      actor: view.actor,
      turnPlayer: view.turnPlayer,
    };
    const fetchImpl: FetchLike = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, player: payload, serverNow: 1 }),
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const driver = createOnlineDriver({
      client,
      token: 'tok',
      matchId: 'm1',
      initial: payload,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const snap = driver.snapshot();
    expect(snap.perspective.me).toBe(1);
    expect(snap.perspective.rotated).toBe(true);
    expect(snap.perspective.coachEnabled).toBe(false);
    expect(snap.perspective.hiddenDeckHintsEnabled).toBe(false);
    expect(snap.perspective.scoreMeLabel).toBe('Me');
    expect(snap.view.player).toBe(1);
    const engHome = coordKey(homeCoord(1, state.config));
    const screenHome = coordKey(mirror(parseKey(engHome)));
    expect(Object.keys(snap.screenView.board)).toContain(screenHome);
    const engTile = snap.view.board[engHome];
    const screenTile = snap.screenView.board[screenHome];
    expect(screenTile?.strength).toBe(engTile?.strength);
    expect(screenTile?.owner).toBe(0);
    if (snap.screenLegal[0]) {
      expect(driver.toEngineAction(snap.screenLegal[0])).toEqual(snap.legal[0]);
    }
  });
});

// Keep State import used for documentation of board shape in comments above.
void (null as unknown as State);
