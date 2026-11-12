// FUTASAKU 0.5 — the enemy-turn gate, proved on two seats.
//
//   npx tsx web/e2e/online-turn-gate.ts
//
// The owner's rule (two-phone playtest): a player CANNOT start their turn until the enemy's
// finished turn has fully animated on screen. This drives TWO contexts over a local duel API and
// samples the watching seat every 25ms while the acting seat completes a whole turn through the
// page's own touch UI (Draw -> paint a Bloom -> Throw -> Discard).
//
// It proves: the gate closes the instant the completion is detected; the board does NOT show the
// final state before the replay runs; the replay really animates (intermediate boards observed);
// input opens only once the replay has drained on the true board — and it FAILS if the old
// behaviour comes back (a stray tap skipping the replay and committing a move).
import { mkdirSync } from 'node:fs';
import { onlinePerspective } from '../src/online/perspective.js';
import {
  type LocalMatch,
  type LocalDuel,
  type SeatSession,
  drawnTiles,
  openDuel,
  openSeat,
  readOnline,
  sleep,
  startLocalDuel,
  touchTap,
  waitingFlag,
} from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4231);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---------------------------------------------------------------------------- page scripts

/** Sample the watching page: the gate, the turn word, and the exact tiles drawn right now. */
const SAMPLER = `(() => {
  if (window.__gate) return;
  // Also count animation frames, so the report can say how smoothly the replay drew.
  window.__frames = 0;
  window.__frameTick = function () { window.__frames++; requestAnimationFrame(window.__frameTick); };
  requestAnimationFrame(window.__frameTick);
  window.__gate = [];
  window.__gateTimer = setInterval(function () {
    const hook = window.__severgrow || {};
    const o = hook.online ? hook.online() : null;
    const turn = (document.querySelector('[data-duel-turn]') || {}).textContent || '';
    window.__gate.push({
      t: Date.now(),
      turn: turn.trim(),
      revealing: !!(o && o.revealing),
      live: !!(o && o.live),
      myTurn: !!(o && o.myTurn),
      queued: o ? o.queued : -1,
      drawn: Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (el) {
        return el.dataset.key;
      }).sort().join(',')
    });
  }, 25);
})()`;

type Sample = {
  t: number;
  turn: string;
  revealing: boolean;
  live: boolean;
  myTurn: boolean;
  queued: number;
  drawn: string;
};

const centreOf = async (session: SeatSession, selector: string): Promise<{ x: number; y: number } | null> =>
  session.page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);

/**
 * A point that is really inside the element: a fanned hand card's centre can sit under the next
 * card, so the tap would land on the wrong one (Futa04 forces one specific discard).
 */
const exposedPoint = (session: SeatSession, selector: string): Promise<{ x: number; y: number } | null> =>
  session.page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (const yf of [0.5, 0.35, 0.65, 0.22, 0.78]) {
      for (const xf of [0.5, 0.3, 0.7, 0.2, 0.8]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) return { x: x, y: y };
      }
    }
    return null;
  })()`) as Promise<{ x: number; y: number } | null>;

/** A real finger tap on a selector (the phone path). */
const tapSelectorTouch = async (session: SeatSession, selector: string): Promise<boolean> => {
  const p = (await exposedPoint(session, selector)) ?? (await centreOf(session, selector));
  if (!p) return false;
  await touchTap(session, p);
  return true;
};

const statePhase = (session: SeatSession): Promise<string> =>
  session.page
    .evaluate(
      () =>
        (window as unknown as { __severgrow?: { state: () => null | { phase: string } } }).__severgrow?.state()?.phase ??
        '',
    )
    .catch(() => '');

const waitPhase = async (
  session: SeatSession,
  want: (phase: string) => boolean,
  timeout = 20_000,
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const phase = await statePhase(session);
    if (phase && want(phase)) return true;
    await sleep(80);
  }
  return false;
};

const hasDraft = (session: SeatSession): Promise<boolean> =>
  session.page.evaluate(() => {
    try {
      return Object.keys(sessionStorage).some((k) => k.indexOf('severgrow.duel.draft.v1.') !== -1);
    } catch {
      return false;
    }
  });

type Plan = {
  phase: string;
  actor: number;
  /** A legal Bloom to paint (the recipe plus one placement of it). */
  bloom: { kind: string; hexes: string[] } | null;
  /** A card in no Bloom recipe plus one of its Sprout targets: pick the card, then the hex. */
  sprout: { card: number; hex: string } | null;
  hasGrow: boolean;
};

// NOTE: page scripts are plain STRINGS on purpose. tsx/esbuild rewrites named inner functions
// with a `__name` helper the page does not have, which would make page.evaluate throw.
const READ_PLAN = `(() => {
  const hook = window.__severgrow;
  const st = hook && hook.state ? hook.state() : null;
  if (!st) return null;
  const legal = hook.legal ? hook.legal() : [];
  const key = function (c) { return c.q + ',' + c.r; };
  const blooms = [];
  for (const a of legal) if (a.t === 'Bloom') blooms.push(a);
  let bloom = null;
  if (blooms.length) {
    // The biggest recipe, so the replay has the most tiles to show.
    const best = blooms.slice().sort(function (a, b) { return b.hexes.length - a.hexes.length; })[0];
    const cards = best.cards.slice().sort(function (a, b) { return a - b; });
    bloom = { kind: 'bloom-' + cards.length + '-' + cards.join('.'), hexes: best.hexes.map(key) };
  }
  const inBloom = {};
  for (const b of blooms) for (const c of b.cards) inBloom[c] = true;
  const sprouts = {};
  for (const a of legal) {
    if (a.t !== 'Sprout') continue;
    if (inBloom[a.card]) continue;
    sprouts[a.card] = sprouts[a.card] || {};
    sprouts[a.card][key(a.coord)] = true;
  }
  let sprout = null;
  for (const card in sprouts) {
    const targets = Object.keys(sprouts[card]);
    if (targets.length) { sprout = { card: Number(card), hex: targets[0] }; break; }
  }
  let hasGrow = false;
  for (const a of legal) if (a.t === 'Bloom' || a.t === 'Sprout') hasGrow = true;
  return { phase: st.phase, actor: st.actor, bloom: bloom, sprout: sprout, hasGrow: hasGrow };
})()`;

/** The legal grows, worked out IN THE PAGE (the page's own display coordinates). */
const readPlan = (session: SeatSession): Promise<Plan | null> =>
  session.page.evaluate(READ_PLAN) as Promise<Plan | null>;

// ---------------------------------------------------------------------------- driving a turn

/** Draw from the deck with a finger, retrying until the Grow step opens. */
const drawViaDeck = async (session: SeatSession): Promise<boolean> => {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await tapSelectorTouch(session, '#deck')) {
      if (await waitPhase(session, (p) => p === 'ACT', 6_000)) return true;
    }
    await sleep(300);
  }
  return false;
};

/** A point really inside the drawn hex (display coordinates already: the page's own keys). */
const hexPoint = (session: SeatSession, key: string): Promise<{ x: number; y: number } | null> =>
  exposedPoint(session, `#board .hex-cell[data-key="${key}"]`);

/**
 * Enter a Bloom recipe through the page's own controls and paint it with finger taps — exactly
 * the gesture the owner made on the phone (press the Bloom control, draw on the lit hexes).
 */
const paintBloom = async (session: SeatSession, bloom: { kind: string; hexes: string[] }): Promise<boolean> => {
  // Enter the recipe through the page's own Bloom control (the toggle first when there is a list).
  const entered = (await session.page.evaluate(`(() => {
    const k = ${JSON.stringify(bloom.kind)};
    const visible = function (el) { return !!el && el.offsetParent !== null; };
    let btn = document.querySelector('#moves [data-kind="' + k + '"]');
    if (visible(btn)) { btn.click(); return true; }
    const toggle = document.querySelector('#moves .bloom-toggle');
    if (toggle) {
      toggle.click();
      btn = document.querySelector('#moves [data-kind="' + k + '"]');
      if (btn) { btn.click(); return true; }
    }
    return false;
  })()`)) as boolean;
  if (!entered) return false;

  for (const variant of [bloom.hexes, [...bloom.hexes].reverse()]) {
    for (const key of variant) {
      const point = await hexPoint(session, key);
      if (!point) continue;
      await touchTap(session, point);
      await sleep(110);
      if (await hasDraft(session)) return true;
    }
    await sleep(250);
    if (await hasDraft(session)) return true;
  }
  return false;
};

/**
 * The documented two-tap Grow: pick the card, then tap the target hex. (Futa04 has no Confirm
 * box, so a card whose Recipe is a single placement also commits on the card tap alone.)
 */
const tapCardThenHex = async (session: SeatSession, sprout: { card: number; hex: string }): Promise<boolean> => {
  if (!(await tapSelectorTouch(session, `#hand [data-card="${sprout.card}"]`))) return false;
  await sleep(320);
  if (await hasDraft(session)) return true;
  const point = await hexPoint(session, sprout.hex);
  if (!point) return false;
  await touchTap(session, point);
  await sleep(700);
  return (await hasDraft(session)) || (await statePhase(session)) !== 'ACT';
};

/** Wait until the page has finished animating (the moves row is empty while it is busy). */
const waitIdle = async (session: SeatSession, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await session.page.evaluate('!!(window.__severgrow && window.__severgrow.busy())'))) return true;
    await sleep(100);
  }
  return false;
};

/** Leave the Grow step with the page's own Throw control (retrying: the row is empty while busy). */
const endGrowStep = async (session: SeatSession): Promise<{ ok: boolean; how: string }> => {
  await waitIdle(session);
  for (let attempt = 0; attempt < 6; attempt++) {
    const info = (await session.page.evaluate(`(() => {
      const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end');
      if (!b) return { found: false, how: 'no Throw control in #moves' };
      if (b.disabled) return { found: true, how: 'Throw control disabled' };
      b.click();
      return { found: true, how: 'clicked ' + (b.className || '') };
    })()`)) as { found: boolean; how: string };
    if (info.found && (await waitPhase(session, (p) => p !== 'ACT', 5_000))) return { ok: true, how: info.how };
    await sleep(300);
    await waitIdle(session, 4_000);
  }
  return { ok: false, how: `the Grow step would not end (phase ${await statePhase(session)})` };
};

/**
 * Throw a card in the DISCARD step. Owner rule (2026-10-25): a tap picks the card and the same
 * card again DESELECTS, so the throw is a tap on the Throw pile while the card is picked.
 */
const throwACard = async (session: SeatSession): Promise<{ ok: boolean; how: string }> => {
  // The engine forces ONE card into the throw pile: read it from the page's own legal list.
  await waitIdle(session);
  const readCard = async (): Promise<number | null> =>
    (await session.page.evaluate(
      `(() => { const d = window.__severgrow.legal().filter(function (a) { return a.t === 'Discard'; })[0]; return d ? d.card : null; })()`,
    )) as number | null;
  let cardId = await readCard();
  for (let i = 0; i < 5 && cardId === null; i++) {
    await sleep(400);
    cardId = await readCard();
  }
  if (cardId === null) return { ok: false, how: 'no Discard was legal' };
  for (let i = 0; i < 3; i++) {
    await tapSelectorTouch(session, `#hand [data-card="${cardId}"]`);
    await sleep(250);
    if ((await statePhase(session)) !== 'DISCARD') return { ok: true, how: `threw card ${cardId}` };
    await tapSelectorTouch(session, '#discard');
    await sleep(450);
    if ((await statePhase(session)) !== 'DISCARD') return { ok: true, how: `threw card ${cardId} via the pile` };
  }
  const confirmVisible = await session.page
    .locator('#confirm-play')
    .isVisible()
    .catch(() => false);
  if (confirmVisible) {
    await session.page.evaluate(() => (document.getElementById('confirm-play') as HTMLElement).click());
    await sleep(400);
  }
  return { ok: (await statePhase(session)) !== 'DISCARD', how: `card ${cardId} did not throw` };
};

type TurnResult = { grew: boolean; drew: boolean; threw: boolean; how: string };

/** One whole turn through the page's own touch UI. `withGrow: false` plays the weakest turn. */
const playTurnViaUi = async (session: SeatSession, withGrow: boolean): Promise<TurnResult> => {
  const drew = await drawViaDeck(session);
  let grew = false;
  let how = 'none';
  if (drew && withGrow) {
    for (let attempt = 0; attempt < 3 && !grew; attempt++) {
      const plan = await readPlan(session);
      if (plan?.bloom) {
        grew = await paintBloom(session, plan.bloom);
        how = `painted ${plan.bloom.kind} over ${plan.bloom.hexes.length} hexes`;
      }
      if (!grew && plan?.sprout) {
        grew = await tapCardThenHex(session, plan.sprout);
        how = `picked card ${plan.sprout.card} then hex ${plan.sprout.hex}`;
      }
      if (!grew) {
        how = plan?.hasGrow ? `a grow was legal but not placed: ${JSON.stringify(plan)}` : 'no grow was legal';
        if (plan?.hasGrow) await sleep(400);
      }
    }
  }
  const ended = await endGrowStep(session);
  const thrown = await throwACard(session);
  const threw = ended.ok && thrown.ok;
  if (!threw) how = `${how}; end=${ended.how}; throw=${thrown.how}`;
  return { grew, drew, threw, how };
};

/** Wait for a seat to hold the turn (the page's own waiting flag). */
const waitMyTurn = async (session: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(session)) return true;
    await sleep(120);
  }
  return false;
};

/**
 * Authoritative board the given seat may see, straight from the API (never the page's copy),
 * mapped into that seat's SCREEN keys so it can be compared with what the page draws.
 */
const serverBoard = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1): Promise<string[]> => {
  const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
  const p = onlinePerspective(seat);
  return Object.entries(view.view.board)
    .filter(([, tile]) => !!tile)
    .map(([key]) => p.mapKey(key))
    .sort();
};

const matchWithWatcher = async (duel: LocalDuel, watcher: 0 | 1): Promise<LocalMatch> => {
  // The starting seat is the engine's seeded lottery; retry until the seat under test is watching.
  for (let i = 0; i < 8; i++) {
    const match = await duel.newMatch();
    if ((match.starterSeat === 0 ? 1 : 0) === watcher) return match;
  }
  throw new Error(`could not create a match watched by seat ${watcher}`);
};

const arrayFrom = (csv: string): string[] => (csv ? csv.split(',') : []);

// ---------------------------------------------------------------------------- the scenarios

const duel = await startLocalDuel({ port: PORT });
const results: string[] = [];

try {
  /**
   * One full scenario: `watcher` seat samples while the other seat takes a whole turn through the
   * touch UI. `strayTaps` fires taps at the board and the deck mid-replay: they must never commit
   * a move or skip the replay. `withGrow: false` plays a Draw + Discard only (no tiles at all).
   */
  const scenario = async (options: {
    name: string;
    watcher: 0 | 1;
    reduceMotion?: boolean;
    withGrow?: boolean;
    strayTaps?: boolean;
  }): Promise<void> => {
    const withGrow = options.withGrow ?? true;
    const match = await matchWithWatcher(duel, options.watcher);
    const actorSeat: 0 | 1 = options.watcher === 0 ? 1 : 0;
    const watcher = await openSeat(duel, match, options.watcher, {
      reduceMotion: options.reduceMotion ?? false,
    });
    const actor = await openSeat(duel, match, actorSeat, {
      reduceMotion: options.reduceMotion ?? false,
    });
    try {
      await openDuel(actor, match.matchId);
      await openDuel(watcher, match.matchId);
      check(`${options.name}: the actor holds the turn`, await waitMyTurn(actor, 40_000));
      check(`${options.name}: the watcher starts waiting on the enemy turn`, !(await waitingFlag(watcher)));

      // The board BEFORE the enemy turn (the watcher's own view of it), as drawn.
      const before = await drawnTiles(watcher);
      const beforeCsv = before.join(',');

      // Count the watcher's OWN action submissions: a stray tap must never send one.
      let posted = 0;
      const onRequest = (request: { url: () => string; method: () => string }): void => {
        if (request.method() === 'POST' && /\/actions(\?|$)/.test(request.url())) posted++;
      };
      watcher.page.on('request', onRequest as never);

      await watcher.page.evaluate(SAMPLER);
      const turn = await playTurnViaUi(actor, withGrow);
      check(
        `${options.name}: the actor completed a turn through the touch UI`,
        turn.drew && turn.threw,
        JSON.stringify(turn),
      );

      // The stray taps: DURING the replay, a player poking the deck or an empty hex must change
      // nothing — no skipped animation, no committed move. (In the old code every one of these
      // entry points called fastForward() first, which lifted the gate and jumped the board.)
      let strayHeld: boolean | null = null;
      if (options.strayTaps) {
        const wait = Date.now() + 12_000;
        while (Date.now() < wait) {
          const o = await readOnline(watcher);
          if (o?.revealing) break;
          await sleep(15);
        }
        // An EMPTY hex: its tile-group tap is the path that used to fast-forward the replay.
        const empty = (await watcher.page.evaluate(`(() => {
          const drawn = new Set(Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (el) { return el.dataset.key; }));
          const cells = document.querySelectorAll('#board .hex-cell[data-key]');
          for (const c of cells) {
            const k = c.getAttribute('data-key');
            if (drawn.has(k)) continue;
            const r = c.getBoundingClientRect();
            if (r.width > 10 && r.top > 0 && r.bottom < window.innerHeight) return { key: k, x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          return null;
        })()`)) as { key: string; x: number; y: number } | null;
        await tapSelectorTouch(watcher, '#deck');
        if (empty) await touchTap(watcher, { x: empty.x, y: empty.y });
        await sleep(120);
        const afterTap = await readOnline(watcher);
        strayHeld = afterTap?.revealing === true && afterTap.myTurn === false;
        if (!strayHeld) console.log(`    (stray tap landed on ${empty?.key ?? 'no hex'}; gate now ${JSON.stringify(afterTap)})`);
      }

      // Wait for the replay to drain and the watcher's own turn to open.
      const opened = await waitMyTurn(watcher, 30_000);
      const final = await drawnTiles(watcher);
      const finalCsv = final.join(',');
      await sleep(400);
      const samples = ((await watcher.page.evaluate('window.__gate')) as Sample[] | undefined) ?? [];
      const frames = (await watcher.page.evaluate('window.__frames')) as number;
      await watcher.page.evaluate('clearInterval(window.__gateTimer); window.__frameTick = function () {};');

      const authoritative = await serverBoard(duel, match, options.watcher);
      const authorCsv = authoritative.join(',');

      // ---- the timeline, for the report
      const timeline: string[] = [];
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]!;
        const p = samples[i - 1];
        if (!p || p.revealing !== s.revealing || p.myTurn !== s.myTurn || p.drawn !== s.drawn || p.turn !== s.turn) {
          timeline.push(`${s.t - samples[0]!.t}ms turn="${s.turn}" gate=${s.revealing} myTurn=${s.myTurn} tiles=${arrayFrom(s.drawn).length}`);
        }
      }
      console.log(`    ${options.name} timeline:\n      ${timeline.join('\n      ')}`);

      const detected = samples.find((s) => s.revealing);
      const gateSamples = samples.filter((s) => s.revealing);
      const revealMs = detected ? (gateSamples.at(-1)!.t ?? detected.t) - detected.t : 0;
      const spanMs = samples.length ? (samples.at(-1)!.t ?? 0) - samples[0]!.t : 0;
      console.log(`    ${options.name}: ${frames} frames drawn over ${spanMs}ms (~${spanMs ? Math.round((frames * 1000) / spanMs) : 0} fps while the enemy turn animated)`);
      results.push(
        `${options.name}: gate ${revealMs}ms, ${frames} frames / ${spanMs}ms (~${spanMs ? Math.round((frames * 1000) / spanMs) : 0} fps), ${gateSamples.length} gated samples`,
      );
      const distinct = new Set(samples.map((s) => s.drawn));

      // (1) the gate closed at the moment the completion was detected…
      check(
        `${options.name}: the gate closes when the completion is detected`,
        !!detected && !detected.myTurn,
        detected ? `t=${detected.t - samples[0]!.t}ms turn="${detected.turn}"` : 'never gated',
      );
      // …and the board was still the OLD one at that instant (never a silent jump).
      check(
        `${options.name}: the board is still the pre-turn board when the gate closes`,
        !!detected && detected.drawn === beforeCsv,
        detected ? `${arrayFrom(detected.drawn).length} tiles vs ${before.length} before` : '',
      );
      // (2) input NEVER opens on a stale board: every sample that can act shows the true final board.
      check(
        `${options.name}: input only opens on the true final board`,
        samples.every((s) => !s.myTurn || s.drawn === authorCsv),
        `${samples.filter((s) => s.myTurn).length} open samples`,
      );
      check(`${options.name}: the reveal opens the watcher's turn`, opened && finalCsv === authorCsv, `seen=${final.length} server=${authoritative.length}`);
      watcher.page.off('request', onRequest as never);
      check(
        `${options.name}: no move was submitted while a stray tap hit the live board`,
        posted === 0,
        `${posted} action POST(s)`,
      );
      if (options.strayTaps) {
        check(
          `${options.name}: a stray tap did NOT cut the enemy replay short`,
          strayHeld === true,
          `gate still shut and closed to input after the tap: ${strayHeld}`,
        );
      }
      // (3) the replay really ran: the gate held for a readable beat, and a multi-tile grow showed
      //     intermediate boards rather than one jump.
      check(
        `${options.name}: the replay held the gate for a readable beat`,
        revealMs >= (options.reduceMotion ? 220 : 450),
        `${revealMs}ms over ${gateSamples.length} samples`,
      );
      const placedKeys = authoritative.filter((k) => !before.includes(k)).length;
      if (placedKeys >= 1) {
        const firstFinal = samples.find((s) => s.drawn === authorCsv);
        check(
          `${options.name}: the tiles arrived DURING the gate, never before it`,
          !!firstFinal && firstFinal.revealing,
          firstFinal ? `first final-board sample at ${firstFinal.t - samples[0]!.t}ms gated=${firstFinal.revealing}` : 'the final board was never drawn',
        );
      }
      if (withGrow && !options.reduceMotion) {
        check(
          `${options.name}: the actor really grew tiles (the replay had something to show)`,
          placedKeys > 0,
          `placed=${placedKeys} (${turn.how})`,
        );
        const intermediate = [...distinct].filter((d) => d !== beforeCsv && d !== authorCsv).length;
        check(
          `${options.name}: the replay showed intermediate board states`,
          placedKeys <= 1 || intermediate >= 1,
          `placed=${placedKeys}, ${distinct.size} distinct boards seen, ${intermediate} intermediate`,
        );
      }
      if (!withGrow) {
        check(`${options.name}: no tiles were placed by a grow-less turn`, beforeCsv === authorCsv, `${before.length} -> ${authoritative.length}`);
      }
      // (4) after it drains, the gate is truly open.
      const after = await readOnline(watcher);
      check(`${options.name}: after the drain myTurn is true and the gate is open`, !!after && after.myTurn && !after.revealing, JSON.stringify(after));
    } finally {
      await watcher.context.close();
      await actor.context.close();
    }
  };

  await scenario({ name: 'seat 1 watching', watcher: 1, strayTaps: true });
  await scenario({ name: "seat 0 watching", watcher: 0 });
  await scenario({ name: 'reduced motion', watcher: 0, reduceMotion: true });
  await scenario({ name: 'no grow (hidden draw + discard)', watcher: 1, withGrow: false });
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} enemy-turn gate checks failed`);
  process.exit(1);
}
console.log('\nEnemy-turn gate: input stays closed until the enemy turn has animated (both seats).');
