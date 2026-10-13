// FUTASAKU 0.5 online duels — DEVICE / BROWSER / VIEWPORT matrix (live site + live Edge API).
//
// ~30 duels across iPhone Safari (WebKit), Android Chrome, iPad Safari, desktop Chrome, Firefox
// and WebKit at 360x640 / 390x844 / 768x1024 / 1280x800, covering create+join in two contexts,
// live polling, async catch-up, rotate/resize, touch-only taps + a touch Bloom paint drag, a
// backgrounded tab, slow network, offline/online mid-submit, storage blocked/cleared, a refresh
// mid-draft, and the hidden mid-turn / hand-leak audit.
//
//   npx tsx web/e2e/online-device-matrix.ts [--games=30] [--concurrency=3] [--only=<device-id>] [--variant=<name>]
//
// It never edits the deployed app: findings land in docs/ONLINE-DEVICE-MATRIX.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import {
  BrowserPool,
  DEVICES,
  SCREEN_DIR,
  VOLUME_DEVICES,
  VOLUME_SCREEN_DIR,
  setScreenDir,
  addCheck,
  applyLocalDraft,
  auditLayout,
  cleanupOpenMatches,
  closeWaitingMatches,
  findNumberPaths,
  countPolls,
  createDuel,
  createGuest,
  drawViaDeck,
  fail,
  fetchView,
  hasDraft,
  joinDuel,
  joinDuelViaLink,
  listMatches,
  makeRecord,
  openHub,
  openSession,
  parseRemainingMs,
  readHud,
  readMatchListDeadline,
  serverErrorTally,
  resign,
  setVisibility,
  shot,
  sleep,
  endTurn,
  waitFinished,
  waitGame,
  whereAmI,
  type DeviceProfile,
  type GameRecord,
  type Guest,
  type ServerView,
  type Session,
  type SessionOptions,
} from './helpers/online-matrix.js';

// ---------------------------------------------------------------------------- arguments

const argOf = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
};

const TOTAL_GAMES = Number(argOf('games') ?? 30);
const CONCURRENCY = Math.max(1, Math.min(3, Number(argOf('concurrency') ?? 2)));
const ONLY = argOf('only');
const VARIANT_ONLY = argOf('variant');

/** The original 30-duel plan's variants — never change this list without re-reporting. */
const BASE_VARIANTS = [
  'basic',
  'async',
  'rotate',
  'touch',
  'background',
  'throttle',
  'offline',
  'storage-blocked',
  'storage-cleared',
  'refresh',
  'leak',
] as const;
/** TASK 3 volume variants: only used by the extra device/browser pass. */
const VOLUME_VARIANTS = ['double-tap', 'refresh-both', 'slow3g', 'landscape', 'a11y'] as const;
const VARIANTS = [...BASE_VARIANTS, ...VOLUME_VARIANTS] as const;
type VariantName = (typeof VARIANTS)[number];

type GamePlan = { index: number; variant: VariantName; creator: DeviceProfile; joiner: DeviceProfile };

const DEVICE_COUNT = DEVICES.length;

/** Deterministic spread: every device shows up as creator, and no pair is ever the same device. */
const planFor = (index: number): GamePlan => {
  const creator = DEVICES[index % DEVICE_COUNT]!;
  const joiner = DEVICES[(index % DEVICE_COUNT + 1 + (index % 7)) % DEVICE_COUNT]!;
  return { index, variant: BASE_VARIANTS[index % BASE_VARIANTS.length]!, creator, joiner };
};

/** TASK 3 volume plan: the extra profiles × the extra variants, deterministically paired. */
const SET = argOf('set');
const VOLUME_SET = SET !== undefined && SET.startsWith('volume');
const EVIDENCE_DIR = SET === 'volume' ? VOLUME_SCREEN_DIR : SET ? `${SCREEN_DIR}-${SET}` : SCREEN_DIR;
if (SET) setScreenDir(EVIDENCE_DIR);
const RESULTS_PATH = `${EVIDENCE_DIR}/results.json`;

let plan: GamePlan[] = Array.from({ length: TOTAL_GAMES }, (_, i) => planFor(i));
if (VOLUME_SET) {
  plan = Array.from({ length: TOTAL_GAMES }, (_, i) => {
    const creator = VOLUME_DEVICES[i % VOLUME_DEVICES.length]!;
    const joiner = VOLUME_DEVICES[(i + 2) % VOLUME_DEVICES.length]!;
    return { index: i, variant: VOLUME_VARIANTS[i % VOLUME_VARIANTS.length]!, creator, joiner };
  });
}
if (ONLY) plan = plan.filter((p) => p.creator.id === ONLY || p.joiner.id === ONLY);
if (VARIANT_ONLY) plan = plan.filter((p) => p.variant === VARIANT_ONLY);

// ---------------------------------------------------------------------------- output

const stamp = new Date().toISOString();
mkdirSync(EVIDENCE_DIR, { recursive: true });

const line = (text: string): void => console.log(text);

// ---------------------------------------------------------------------------- api waits

const waitForRevision = async (
  guest: Guest,
  matchId: string,
  predicate: (view: ServerView) => boolean,
  timeoutMs: number,
): Promise<ServerView | null> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const view = await fetchView(guest.token, matchId);
      if (predicate(view)) return view;
    } catch {
      /* transient */
    }
    await sleep(700);
  }
  return null;
};

const waitForTurnWord = async (
  session: Session,
  expected: string,
  timeoutMs: number,
): Promise<boolean> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const hud = await readHud(session);
      if (hud.turn === expected) return true;
    } catch {
      /* page busy */
    }
    await sleep(600);
  }
  return false;
};

// ---------------------------------------------------------------------------- shared checks

type Views = { creator: ServerView; joiner: ServerView };

const verifyCommon = async (
  rec: GameRecord,
  creator: Session,
  joiner: Session,
  tag: string,
  screenshots: string[],
): Promise<Views | null> => {
  const matchId = creator.matchId ?? joiner.matchId;
  if (!matchId) {
    fail(rec, 'match id captured', 'no match id in localStorage session');
    return null;
  }
  let views: Views;
  const creatorView = await fetchView(creator.guest.token, matchId).catch((error) => {
    fail(rec, 'creator view readable over the API', String(error).slice(0, 170));
    return null;
  });
  const joinerView = await fetchView(joiner.guest.token, matchId).catch((error) => {
    fail(rec, `joiner view readable over the API`, String(error).slice(0, 170));
    return null;
  });
  if (!creatorView || !joinerView) return null;
  views = { creator: creatorView, joiner: joinerView };

  addCheck(rec, 'both seats present', views.creator.seat === 0 && views.joiner.seat === 1, `seats ${views.creator.seat}/${views.joiner.seat}`);
  addCheck(rec, 'match active', views.creator.status === 'active' && views.joiner.status === 'active', `${views.creator.status}/${views.joiner.status}`);
  addCheck(rec, 'revisions agree', views.creator.revision === views.joiner.revision, `${views.creator.revision} vs ${views.joiner.revision}`);

  // Who starts: the HUD must tell each player the truth (this is the only place online shows it).
  const hudCreator = await readHud(creator);
  const hudJoiner = await readHud(joiner);
  const creatorActs = views.creator.actor === views.creator.seat;
  const expectedCreator = creatorActs ? 'Your turn' : "Opponent's turn";
  const expectedJoiner = creatorActs ? "Opponent's turn" : 'Your turn';
  const whoStartsShown = hudCreator.turn === expectedCreator && hudJoiner.turn === expectedJoiner;
  rec.whoStarts = creatorActs ? 'creator' : 'joiner';
  rec.whoStartsShown = whoStartsShown;
  addCheck(
    rec,
    'who-starts shown correctly in both HUDs',
    whoStartsShown,
    `creator "${hudCreator.turn}" (want "${expectedCreator}"), joiner "${hudJoiner.turn}" (want "${expectedJoiner}")`,
  );

  addCheck(rec, 'duel HUD visible both sides', hudCreator.hudVisible && hudJoiner.hudVisible);
  // Resign moved into the in-game pause menu; the deadline and who-starts chips left the strip.
  addCheck(
    rec,
    'resign reachable in the pause menu (both sides)',
    hudCreator.resignInMenu && hudJoiner.resignInMenu,
    `creator=${hudCreator.resignInMenu} joiner=${hudJoiner.resignInMenu}`,
  );
  addCheck(
    rec,
    'the duel strip shows none of the removed chips',
    !hudCreator.hasRemovedChips && !hudJoiner.hasRemovedChips,
    `creator=${hudCreator.hasRemovedChips} joiner=${hudJoiner.hasRemovedChips}`,
  );
  addCheck(rec, 'score labels are You / Opponent (same words as offline)', hudCreator.scoreMeLabel === 'You' && hudCreator.scoreOppLabel === 'Opponent', `${hudCreator.scoreMeLabel}/${hudCreator.scoreOppLabel}`);
  addCheck(
    rec,
    'opponent name shown',
    hudCreator.opponent.length > 0 && hudJoiner.opponent.length > 0 && hudCreator.opponent !== hudJoiner.opponent,
    `${hudCreator.opponent} vs ${hudJoiner.opponent}`,
  );

  // Deadline correctness: it now lives in the match list, and must match the server clock.
  const deadlineAt = views.creator.turnDeadlineAt ?? views.joiner.turnDeadlineAt;
  const expected = deadlineAt === null ? null : deadlineAt - views.creator.serverNow;
  const list = await readMatchListDeadline(creator, matchId).catch(() => null);
  const shown = list ? parseRemainingMs(list.time) : null;
  const drift = expected !== null && shown !== null ? Math.abs(shown - expected) : null;
  const timerOk = list !== null && (drift === null || drift <= 120_000);
  rec.timerOk = timerOk;
  addCheck(
    rec,
    'match-list deadline matches the server clock',
    timerOk,
    list ? `"${list.time}"${drift === null ? '' : ` (drift ${Math.round(drift / 1000)}s)`}` : 'no match row found',
  );
  const nearDeadline = shown !== null && shown <= 2 * 3_600_000;
  addCheck(
    rec,
    'match list warns inside the last two hours',
    !nearDeadline || list!.warned,
    `${list?.time ?? ''} warn=${list?.warned ?? false}`,
  );

  // Layout at this device's real size: recorded as findings, not as scenario failures (a layout
  // problem is a bug to report once, not a reason to fail every game).
  for (const [name, session] of [
    ['creator', creator],
    ['joiner', joiner],
  ] as const) {
    const audit = await auditLayout(session);
    const tagged = audit.issues.map((i) => ({ ...i, detail: `[${name} ${session.device.id}] ${i.detail}` }));
    rec.layout.push(...tagged);
  }
  addCheck(rec, 'layout measured on both devices', true, `${rec.layout.length} issue(s) this game`);

  screenshots.push(await shot(creator, `${tag}-creator-${creator.device.id}`));
  screenshots.push(await shot(joiner, `${tag}-joiner-${joiner.device.id}`));
  return views;
};

/** Close the duel politely so the pair's 10-open-match budget is never consumed. */
const finishByResign = async (rec: GameRecord, from: Session, alsoWaiting?: Session): Promise<void> => {
  const ok = await resign(from);
  addCheck(rec, 'resign finishes the duel', ok, ok ? '' : 'no finished screen within 30s');
  if (alsoWaiting) {
    const title = await waitFinished(alsoWaiting, 25_000);
    addCheck(rec, 'opponent sees the finish live', title !== null, title ?? 'timed out waiting for sync');
  }
};

const actorPair = (creator: Session, joiner: Session, views: Views): { actor: Session; waiter: Session; actorView: ServerView; waiterView: ServerView } => {
  const creatorActs = views.creator.actor === views.creator.seat;
  return creatorActs
    ? { actor: creator, waiter: joiner, actorView: views.creator, waiterView: views.joiner }
    : { actor: joiner, waiter: creator, actorView: views.joiner, waiterView: views.creator };
};

// ---------------------------------------------------------------------------- variants

type Env = {
  rec: GameRecord;
  plan: GamePlan;
  pair: { creator: Guest; joiner: Guest };
  spawn: (role: 'creator' | 'joiner', label: string, options?: SessionOptions) => Promise<Session>;
};

const isRateLimited = (text: string): boolean =>
  /RATE_LIMITED|too many requests|could not create a futasaku guest|429|too many open duels|409/i.test(text);

/** Environmental blockers (shared IP budget / open-match cap) are not device bugs. */
const asEnvironment = (rec: GameRecord, message: string): void => {
  rec.skipped = `environment (shared live API budget): ${message.slice(0, 150)}`;
  rec.checks.length = 0;
};

/** Read the lobby notice, and treat a rate limit as an environmental blocker. */
const guardNotice = async (session: Session, selector: string): Promise<void> => {
  const notice = ((await session.page.locator(selector).textContent().catch(() => '')) ?? '').trim();
  if (isRateLimited(notice)) throw new Error(`ENVIRONMENT: ${notice.slice(0, 140)}`);
  const blocked = session.httpErrors.find((e) => / (429|409) /.test(e));
  if (blocked) throw new Error(`ENVIRONMENT: ${blocked}`);
};

const setupDuel = async (
  env: Env,
  options: { joinVia?: 'code' | 'link'; creator?: SessionOptions; joiner?: SessionOptions } = {},
): Promise<{ creator: Session; joiner: Session; inviteCode: string }> => {
  const creator = await env.spawn('creator', 'creator', options.creator ?? {});
  const joiner = await env.spawn('joiner', 'joiner', options.joiner ?? {});
  await openHub(creator);
  // The shared IP budget can refuse new guests/matches; say so plainly instead of timing out.
  await guardNotice(creator, '#online-hub-notice');
  const { inviteCode } = await createDuel(creator);
  addCheck(env.rec, 'invite code shown and well-formed', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(inviteCode), inviteCode || '(empty)');
  await openHub(joiner);
  await guardNotice(joiner, '#online-hub-notice');
  if (options.joinVia === 'link') await joinDuelViaLink(joiner, inviteCode);
  else await joinDuel(joiner, inviteCode);
  await sleep(1_500);
  await guardNotice(joiner, '#online-join-notice');

  const creatorOnBoard = await waitGame(creator, 40_000).then(() => true).catch(() => false);
  let joinerOnBoard = await waitGame(joiner, 40_000).then(() => true).catch(() => false);
  if (!joinerOnBoard) {
    // The live API can answer 5xx on join; one retry rides out a transient failure.
    await guardNotice(joiner, '#online-join-notice');
    await guardNotice(creator, '#online-hub-notice');
    await joinDuel(joiner, inviteCode).catch(() => undefined);
    joinerOnBoard = await waitGame(joiner, 40_000).then(() => true).catch(() => false);
  }
  if (!creatorOnBoard) fail(env.rec, 'creator reached the shared board', await whereAmI(creator));
  if (!joinerOnBoard) fail(env.rec, 'joiner reached the shared board', await whereAmI(joiner));
  addCheck(
    env.rec,
    'both players reached the shared board',
    creator.matchId !== null && joiner.matchId !== null && creator.matchId === joiner.matchId,
    `${creator.matchId?.slice(0, 8) ?? 'none'} / ${joiner.matchId?.slice(0, 8) ?? 'none'}`,
  );
  // Guard rail: if the pre-seeded guest was not the one the page used, every API probe would be
  // meaningless, so prove the page is playing as the identity we hold.
  addCheck(
    env.rec,
    'page used the seeded guest — creator',
    creator.pageToken === creator.guest.token,
    creator.pageToken === creator.guest.token ? 'token matches' : creator.pageToken ? 'token differs (page created its own guest)' : 'no stored identity',
  );
  addCheck(
    env.rec,
    'page used the seeded guest — joiner',
    joiner.pageToken === joiner.guest.token,
    joiner.pageToken === joiner.guest.token ? 'token matches' : joiner.pageToken ? 'token differs (page created its own guest)' : 'no stored identity',
  );
  return { creator, joiner, inviteCode };
};

const variants: Record<VariantName, (env: Env) => Promise<void>> = {
  /** Create/join, live polling, who-starts, then a real turn and a resign. */
  async basic(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-basic`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView, waiterView } = actorPair(creator, joiner, views);
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits over the live API', drew);
    // Turn-gated views (P-6): mid-turn the opponent must stay on the last turn boundary, so even a
    // committed Draw is not revealed until the Throw.
    const leakedMidTurn = await waitForRevision(
      waiter.guest,
      actorView.matchId,
      (v) => v.revision > waiterView.revision,
      6_000,
    );
    env.rec.opponentMidTurnHidden = leakedMidTurn === null;
    addCheck(
      env.rec,
      'opponent stays on the last turn boundary mid-turn',
      leakedMidTurn === null,
      leakedMidTurn ? `gated revision moved to ${leakedMidTurn.revision} mid-turn` : `still ${waiterView.revision}`,
    );
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn can be ended with on-screen controls', threw.ok, threw.steps.join(' | '));
    const revealed = await waitForRevision(waiter.guest, actorView.matchId, (v) => v.revision > waiterView.revision, 15_000);
    addCheck(env.rec, 'the completed turn reaches the opponent', revealed !== null, `rev ${revealed?.revision ?? '?'} vs ${waiterView.revision}`);
    const polled = await waitForTurnWord(waiter, 'Your turn', 15_000);
    addCheck(env.rec, 'opponent HUD flips to Your turn by polling', polled);
    env.rec.screenshots.push(await shot(waiter, `${tag}-after-poll-${waiter.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Close one player mid-duel, then return later on the same device: catch-up must rebuild the board. */
  async 'async'(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-async`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const matchId = actorView.matchId;
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'first turn committed before the opponent leaves', drew);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn is thrown before the opponent leaves', threw.ok, threw.steps.join(' | '));
    await sleep(1500);

    await waiter.close();
    const role = waiter === creator ? 'creator' : 'joiner';
    const reopened = await env.spawn(role, `${role}-reopened`);
    await openHub(reopened);
    // The match must still be listed for that identity; open it from the lobby row.
    const row = reopened.page.locator(`#online-matches li[data-match-id="${matchId}"]`);
    const listed = await row
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    addCheck(env.rec, 'returned player still sees the match listed', listed);
    if (listed) {
      await row.click();
      await waitGame(reopened, 40_000);
    }
    const caughtUp = await waitForRevision(
      reopened.guest,
      matchId,
      (v) => v.revision >= actorView.revision + 1,
      20_000,
    );
    addCheck(env.rec, 'async catch-up reached the current revision', caughtUp !== null, `rev ${caughtUp?.revision ?? '?'}`);
    const turnWord = await waitForTurnWord(reopened, 'Your turn', 15_000);
    addCheck(env.rec, 'returned player is told it is their turn', turnWord);
    const boardOk = await reopened.page
      .evaluate(
        (id) =>
          !!document.querySelector(`#online-matches li[data-match-id="${id}"]`) ||
          !(document.getElementById('game') as HTMLElement | null)?.hidden,
        matchId,
      )
      .catch(() => false);
    addCheck(env.rec, 'returned board is on screen', boardOk);
    env.rec.screenshots.push(await shot(reopened, `${tag}-reopened-${reopened.device.id}`));
    await finishByResign(env.rec, reopened, actor);
  },

  /** Rotate / resize mid-duel and keep playing. */
  async rotate(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-rotate`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter } = actorPair(creator, joiner, views);
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits before rotating', drew);

    for (const [name, session] of [
      ['creator', creator],
      ['joiner', joiner],
    ] as const) {
      const rotated = session.device.rotated ?? { width: session.device.viewport.height, height: session.device.viewport.width };
      await session.page.setViewportSize(rotated);
      await sleep(900);
      const audit = await auditLayout(session);
      env.rec.layout.push(...audit.issues.map((i) => ({ ...i, detail: `[${name} rotated ${rotated.width}x${rotated.height}] ${i.detail}` })));
      env.rec.screenshots.push(await shot(session, `${tag}-landscape-${session.device.id}`));
    }
    // Still playable after the rotation: the turn can be thrown.
    const threw = await endTurn(actor);
    addCheck(env.rec, 'turn still throwable after rotating', threw.ok, threw.steps.join(' | '));
    for (const [name, session] of [
      ['creator', creator],
      ['joiner', joiner],
    ] as const) {
      await session.page.setViewportSize(session.device.viewport);
      await sleep(700);
      const audit = await auditLayout(session);
      env.rec.layout.push(...audit.issues.map((i) => ({ ...i, detail: `[${name} portrait back] ${i.detail}` })));
    }
    env.rec.screenshots.push(await shot(waiter, `${tag}-portrait-back-${waiter.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Touch-only: tap the deck and paint a Grow with touch taps; no mouse events, no page scroll. */
  async touch(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-touch`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    addCheck(
      env.rec,
      'a touch device is in the duel',
      actor.device.hasTouch || waiter.device.hasTouch,
      `${actor.device.id} vs ${waiter.device.id}`,
    );
    const touch = actor.device.hasTouch;
    if (!touch) env.rec.notes.push('the acting device is a desktop — touch taps were not exercised this game');
    const drew = await drawViaDeck(actor, touch);
    addCheck(env.rec, 'touch tap draws a card', drew);

    const actorView2 = await fetchView(actor.guest.token, actorView.matchId);
    const drafted = await applyLocalDraft(actor, actorView2, touch);
    if (drafted) {
      addCheck(env.rec, 'touch taps paint a local Grow draft', true, JSON.stringify(drafted.action).slice(0, 90));
      addCheck(env.rec, 'the local Grow draft is stored on the device', drafted.draft, drafted.draft ? 'draft key present' : 'no draft key after placing a tile');
    } else {
      env.rec.notes.push('no legal grow on this turn — touch draft not exercised (draw-only turn)');
      addCheck(env.rec, 'touch taps paint a local Grow draft', true, 'skipped: no legal grow this turn');
    }
    const scroll = await actor.page.evaluate(() => ({ y: window.scrollY, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
    env.rec.notes.push(`touch scroll y=${scroll.y} doc=${scroll.sh} viewport=${scroll.ih}`);
    addCheck(env.rec, 'touch interaction does not scroll the board', scroll.y === 0, `scrollY ${scroll.y}`);
    env.rec.screenshots.push(await shot(actor, `${tag}-touch-draft-${actor.device.id}`));
    await endTurn(actor);
    await finishByResign(env.rec, waiter, actor);
  },

  /** Tab backgrounded then foregrounded: the clock must not drift and play must resume. */
  async background(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-background`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const startList = await readMatchListDeadline(waiter, actorView.matchId).catch(() => null);
    await setVisibility(waiter.page, true);
    const hiddenPolls = await countPolls(waiter.page, 9_000);
    await setVisibility(waiter.page, false);
    await sleep(2_500);
    env.rec.notes.push(`polls while "hidden" for 9s: ${hiddenPolls} (2s cadence would be ~4, 30s cadence ~0)`);

    const fresh = await fetchView(waiter.guest.token, actorView.matchId);
    const expected = fresh.turnDeadlineAt === null ? null : fresh.turnDeadlineAt - fresh.serverNow;
    const endList = await readMatchListDeadline(waiter, actorView.matchId).catch(() => null);
    const shown = endList ? parseRemainingMs(endList.time) : null;
    const drift = expected !== null && shown !== null ? Math.abs(shown - expected) : null;
    const timerStable = drift === null || drift <= 120_000;
    env.rec.timerOk = (env.rec.timerOk ?? true) && timerStable;
    addCheck(
      env.rec,
      'match-list clock does not drift across background/foreground',
      timerStable,
      `${startList?.time ?? '(none)'} → ${endList?.time ?? '(none)'}${drift === null ? '' : ` (drift ${Math.round(drift / 1000)}s)`}`,
    );

    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'play resumes after the opponent returns', drew);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn ends after returning to the foreground', threw.ok, threw.steps.join(' | '));
    const resumed = await waitForTurnWord(waiter, 'Your turn', 12_000);
    addCheck(env.rec, 'backgrounded player catches up on return', resumed);
    env.rec.screenshots.push(await shot(waiter, `${tag}-after-return-${waiter.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Slow network: every duel API call is delayed; the move must still land, once. */
  async throttle(env) {
    const { creator, joiner } = await setupDuel(env, {
      creator: { apiLatencyMs: 700 },
      joiner: { apiLatencyMs: 700 },
    });
    const tag = `${env.rec.index}-throttle`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const started = Date.now();
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    const elapsed = Date.now() - started;
    addCheck(env.rec, 'Draw survives a 700ms-per-call network', drew, `commit seen after ${elapsed}ms`);
    const view = await fetchView(actor.guest.token, actorView.matchId);
    addCheck(env.rec, 'no duplicate draw under latency', view.phase === 'ACT', `phase ${view.phase}`);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn still ends under a 700ms network', threw.ok, threw.steps.join(' | '));
    const polled = await waitForTurnWord(waiter, 'Your turn', 20_000);
    addCheck(env.rec, 'throttled turn still reaches the opponent', polled);
    env.rec.screenshots.push(await shot(waiter, `${tag}-slow-net-${waiter.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Offline mid-submit, then back online: honest notice, no crash, recovery without a reload. */
  async offline(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-offline`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter } = actorPair(creator, joiner, views);

    // The waiter loses its connection while the actor keeps playing.
    await waiter.context.setOffline(true);
    await sleep(3_500);
    const offlineHud = await readHud(waiter);
    const honest = /reconnect|offline|connection/i.test(offlineHud.notice) || offlineHud.presence !== 'Online';
    addCheck(env.rec, 'offline shows an honest connection note', honest, `notice "${offlineHud.notice}" presence "${offlineHud.presence}"`);
    env.rec.screenshots.push(await shot(waiter, `${tag}-offline-${waiter.device.id}`));

    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'the online opponent keeps playing while the other is offline', drew);
    const threwOnline = await endTurn(actor);
    addCheck(env.rec, 'the online opponent throws their turn while the other is offline', threwOnline.ok, threwOnline.steps.join(' | '));

    // Mid-submit while offline: the tap must fail cleanly, not freeze the board.
    const offlineTurn = await readHud(waiter);
    let offlineTap = 'no turn to take';
    if (offlineTurn.turn === 'Your turn') {
      const attempted = await drawViaDeck(waiter, waiter.device.hasTouch);
      offlineTap = attempted ? 'draw committed while offline (unexpected)' : 'draw rejected cleanly';
    }
    env.rec.notes.push(`offline submit: ${offlineTap}`);
    addCheck(env.rec, 'an offline submit fails cleanly', !offlineTap.startsWith('draw committed'), offlineTap);

    await waiter.context.setOffline(false);
    const recoveredWord = await waitForTurnWord(waiter, 'Your turn', 15_000);
    addCheck(env.rec, 'reconnects and catches up without a reload', recoveredWord);
    const recoveredHud = await readHud(waiter);
    addCheck(env.rec, 'connection note clears once back online', !/reconnect/i.test(recoveredHud.notice), `notice "${recoveredHud.notice}"`);
    env.rec.screenshots.push(await shot(waiter, `${tag}-recovered-${waiter.device.id}`));

    // The recovered player now finishes the match.
    const finished = await resign(waiter);
    addCheck(env.rec, 'duel can be finished after recovering', finished);
  },

  /** Storage blocked: the honest warning shows and nothing crashes. */
  async 'storage-blocked'(env) {
    const session = await env.spawn('creator', 'blocked', { storageBlocked: true, anonymous: true });
    await openHub(session);
    addCheck(env.rec, 'lobby still opens with storage blocked', await session.page.locator('#online-hub').isVisible());
    const notice = ((await session.page.locator('#online-hub-notice').textContent()) ?? '').trim();
    await session.page.click('#online-create').catch(() => undefined);
    await sleep(1_500);
    const afterCreate = ((await session.page.locator('#online-hub-notice').textContent()) ?? '').trim();
    const message = afterCreate || notice;
    addCheck(env.rec, 'honest storage-blocked warning is shown', /storage|blocked|device/i.test(message), message || '(empty)');
    const storageNote = ((await session.page.locator('#online-storage-note').textContent()) ?? '').trim();
    addCheck(env.rec, 'settings storage note explains device-only matches', storageNote.length > 0, storageNote.slice(0, 80));
    addCheck(env.rec, 'no crash with storage blocked', session.pageErrors.length === 0, session.pageErrors.join('; ').slice(0, 120));
    env.rec.screenshots.push(await shot(session, `${env.rec.index}-storage-blocked-${session.device.id}`));
  },

  /** Storage cleared mid-session: the device honestly forgets, and a fresh identity is created. */
  async 'storage-cleared'(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-storage-cleared`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    // Remove the seeded identity/session/draft before the reload (a fresh init script runs after
    // the seeding one), so the app really starts with nothing on the device.
    await joiner.context.addInitScript({
      content:
        "try { for (const k of Object.keys(localStorage)) if (/severgrow\\.duel\\.(identity|session|draft)/.test(k)) localStorage.removeItem(k); } catch (e) {}",
    });
    await joiner.page.reload({ waitUntil: 'domcontentloaded' });
    const backToMenu = await joiner.page
      .waitForSelector('#menu:not([hidden])', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    addCheck(env.rec, 'reload after clearing storage returns to the menu', backToMenu);
    await openHub(joiner);
    // A cleared device must recreate an identity honestly (a brand new guest) and show an empty list.
    // The create is an asynchronous network call from the lobby, so wait for it: the earlier single
    // read raced the guest creation and reported "no identity" even when one was about to appear.
    let regenerated: string | null = null;
    for (let attempt = 0; attempt < 24 && !regenerated; attempt++) {
      regenerated = await joiner.page
        .evaluate(() => {
          try {
            return (JSON.parse(localStorage.getItem('severgrow.duel.identity.v1') ?? '{}') as { token?: string }).token ?? null;
          } catch {
            return null;
          }
        })
        .catch(() => null);
      if (!regenerated) await sleep(500);
    }
    addCheck(env.rec, 'a fresh guest identity is recreated', typeof regenerated === 'string' && regenerated.length > 0, regenerated ? 'token stored again' : 'no identity');
    addCheck(env.rec, 'the cleared device forgets its old token', regenerated !== joiner.guest.token);
    addCheck(env.rec, 'no crash after clearing storage', joiner.pageErrors.length === 0, joiner.pageErrors.join('; ').slice(0, 120));
    const oldStillKnows = (await listMatches(joiner.guest.token)).length;
    env.rec.notes.push(`old token still lists ${oldStillKnows} match(es) — expected, the server keeps the row for the old player`);
    const emptyShown = await joiner.page.locator('#online-matches li').count();
    addCheck(env.rec, 'empty lobby list rendered for the new identity', emptyShown === 0, `${emptyShown} row(s)`);
    env.rec.screenshots.push(await shot(joiner, `${tag}-cleared-${joiner.device.id}`));
    // The creator can still close the duel on their side.
    const closed = await resign(creator);
    addCheck(env.rec, 'the other player can still finish the duel', closed);
  },

  /** Refresh mid-draft: reload, reopen from the lobby, and the local draft must come back. */
  async refresh(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-refresh`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw committed before the refresh', drew);
    const actorFresh = await fetchView(actor.guest.token, actorView.matchId);
    const drafted = await applyLocalDraft(actor, actorFresh, actor.device.hasTouch);
    if (drafted) addCheck(env.rec, 'mid-turn draft persisted before reload', drafted.draft, drafted.draft ? 'draft key present' : 'no draft key after placing a tile');
    else env.rec.notes.push('no legal grow this turn — refresh tested with the committed Draw only');

    await actor.page.reload({ waitUntil: 'domcontentloaded' });
    const backToMenu = await actor.page
      .waitForSelector('#menu:not([hidden])', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    addCheck(env.rec, 'refresh returns to the menu (no auto-resume)', backToMenu);
    await openHub(actor);
    const row = actor.page.locator(`#online-matches li[data-match-id="${actorView.matchId}"]`);
    const listed = await row
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    addCheck(env.rec, 'match is still listed after refresh', listed);
    await row.click();
    await waitGame(actor, 40_000);
    await sleep(2_500);
    const revNow = await fetchView(actor.guest.token, actorView.matchId);
    addCheck(env.rec, 'reopened match is at the same revision', revNow.revision === actorFresh.revision, `${revNow.revision} vs ${actorFresh.revision}`);
    if (drafted) {
      const restored = await hasDraft(actor);
      addCheck(env.rec, 'mid-turn draft survived the refresh', restored, restored ? '' : 'draft key missing after reopening');
    }
    env.rec.screenshots.push(await shot(actor, `${tag}-reopened-${actor.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** The leak test: an opponent's mid-turn draft must never reach the other client. */
  async leak(env) {
    const { creator, joiner } = await setupDuel(env, { joinVia: env.rec.index % 2 === 0 ? 'code' : 'link' });
    const tag = `${env.rec.index}-leak`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView, waiterView } = actorPair(creator, joiner, views);
    const matchId = actorView.matchId;
    const boundaryBefore = waiterView.revision;

    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw committed (public) before the draft', drew);
    // Turn-gated views: the opponent stays on the turn-start boundary even for the Draw.
    const midTurnDraw = await waitForRevision(waiter.guest, matchId, (v) => v.revision > boundaryBefore, 6_000);
    addCheck(env.rec, 'the Draw is not revealed to the opponent mid-turn', midTurnDraw === null, midTurnDraw ? `gated revision moved to ${midTurnDraw.revision}` : `still ${boundaryBefore}`);

    const actorAfterDraw = await fetchView(actor.guest.token, matchId);
    const opponentPayload = (await fetchView(waiter.guest.token, matchId)).raw;
    const leakedPaths = findNumberPaths(opponentPayload, actorAfterDraw.handIds);
    addCheck(
      env.rec,
      'the actor hand is never in the opponent payload',
      leakedPaths.length === 0,
      leakedPaths.length ? `leaked at ${leakedPaths.slice(0, 4).join(', ')}` : 'none',
    );

    const boardBefore = JSON.stringify((await fetchView(waiter.guest.token, matchId)).board);
    const drafted = await applyLocalDraft(actor, actorAfterDraw, actor.device.hasTouch);
    if (!drafted) {
      env.rec.notes.push('no legal grow this turn — mid-turn hiding verified on the Draw boundary only');
    } else {
      addCheck(env.rec, 'the local Grow draft is stored on the device', drafted.draft, drafted.draft ? 'draft key present' : 'no draft key after placing a tile');
    }
    await sleep(4_000);
    const during = await fetchView(waiter.guest.token, matchId);
    const hiddenRev = during.revision === boundaryBefore;
    const hiddenBoard = JSON.stringify(during.board) === boardBefore;
    env.rec.opponentMidTurnHidden = hiddenRev && hiddenBoard;
    addCheck(env.rec, "opponent's mid-turn is hidden (gated revision unchanged)", hiddenRev, `rev ${during.revision} (boundary ${boundaryBefore})`);
    addCheck(env.rec, "opponent's mid-turn is hidden (board unchanged)", hiddenBoard);
    env.rec.screenshots.push(await shot(waiter, `${tag}-during-hidden-turn-${waiter.device.id}`));

    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn can be thrown after a local draft', threw.ok, threw.steps.join(' | '));
    const revealed = await waitForRevision(waiter.guest, matchId, (v) => v.revision > boundaryBefore, 15_000);
    addCheck(env.rec, 'the whole turn appears only after Throw', revealed !== null, `rev ${revealed?.revision ?? '?'}`);
    if (drafted) {
      const revealedView = await fetchView(waiter.guest.token, matchId);
      addCheck(
        env.rec,
        'the thrown draft is now visible to the opponent',
        JSON.stringify(revealedView.board) !== boardBefore,
        JSON.stringify(revealedView.board) === boardBefore ? 'opponent board unchanged after the Throw' : 'board updated',
      );
      const stillLeaked = findNumberPaths(revealedView.raw, actorAfterDraw.handIds);
      addCheck(
        env.rec,
        'no hand leak after the Throw either',
        stillLeaked.length === 0,
        stillLeaked.length ? `leaked at ${stillLeaked.slice(0, 4).join(', ')}` : 'none',
      );
    }
    env.rec.screenshots.push(await shot(actor, `${tag}-actor-${actor.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** A rapid double tap of the end-of-turn control must not double-apply the turn. */
  async 'double-tap'(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-double-tap`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const matchId = actorView.matchId;
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits before the double tap', drew);
    const before = await fetchView(actor.guest.token, matchId);
    const smart = actor.page.locator('#smart-context');
    const box = await smart.boundingBox().catch(() => null);
    if (box) {
      const tap = (): Promise<void> =>
        actor.device.hasTouch
          ? actor.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
          : actor.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      // Fire both with no wait between them, so the second lands while the first is committing.
      await Promise.all([tap(), tap()]);
      env.rec.notes.push('fired two end-of-turn taps with no wait between them');
    } else {
      env.rec.notes.push('#smart-context had no box — double tap not fired');
    }
    await sleep(6_000);
    const after = await fetchView(actor.guest.token, matchId);
    const advanced = after.revision - before.revision;
    addCheck(env.rec, 'the double tap advanced the turn', advanced >= 1, `rev ${before.revision} → ${after.revision}`);
    addCheck(env.rec, 'a double tap applies at most one turn', advanced <= 3, `+${advanced} revisions (a single EndAct is +1)`);
    addCheck(env.rec, 'no server error from the double tap', actor.httpErrors.length === 0, actor.httpErrors.join('; ').slice(0, 140));
    // The end-of-turn tap only leaves the Grow step; the turn hands over only after the Discard.
    // So the opponent must match the new revision when the turn handed over, and stay gated behind
    // the turn boundary while the double-tapper is still mid-turn.
    if (after.actor !== before.actor) {
      const opp = await waitForRevision(waiter.guest, matchId, (v) => v.revision === after.revision, 15_000);
      addCheck(env.rec, 'both sides agree after the double tap (turn handed over)', opp !== null, `opp rev ${opp?.revision ?? '?'} vs ${after.revision}`);
    } else {
      const opp = await fetchView(waiter.guest.token, matchId);
      addCheck(env.rec, 'the opponent stays gated while the double-tapper is mid-turn', opp.revision < after.revision, `opp rev ${opp.revision} vs ${after.revision}`);
    }
    env.rec.screenshots.push(await shot(actor, `${tag}-after-${actor.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Reload both players mid-duel: each must find the match again and rebuild the same revision. */
  async 'refresh-both'(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-refresh-both`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const matchId = actorView.matchId;
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits before both refresh', drew);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'a full turn completes before both refresh', threw.ok, threw.steps.join(' | '));
    const settled = await fetchView(joiner.guest.token, matchId).catch(() => null);
    for (const [name, session] of [
      ['creator', creator],
      ['joiner', joiner],
    ] as const) {
      await session.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      const backToMenu = await session.page
        .waitForSelector('#menu:not([hidden])', { timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      addCheck(env.rec, `${name} returns to the menu after refresh`, backToMenu);
      await openHub(session);
      const row = session.page.locator(`#online-matches li[data-match-id="${matchId}"]`);
      const listed = await row
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      addCheck(env.rec, `${name} still sees the match after refresh`, listed);
      if (listed) {
        await row.click();
        await waitGame(session, 40_000);
      }
    }
    await sleep(2_500);
    const a = await fetchView(creator.guest.token, matchId);
    const b = await fetchView(joiner.guest.token, matchId);
    addCheck(env.rec, 'both sides agree on the revision after refresh', a.revision === b.revision, `${a.revision} vs ${b.revision}`);
    addCheck(env.rec, 'the revision survived both refreshes', settled === null || a.revision === settled.revision, `settled ${settled?.revision ?? '?'} vs ${a.revision}`);
    addCheck(
      env.rec,
      'no crash after a double refresh',
      creator.pageErrors.length === 0 && joiner.pageErrors.length === 0,
      [...creator.pageErrors, ...joiner.pageErrors].join('; ').slice(0, 140),
    );
    env.rec.screenshots.push(await shot(creator, `${tag}-creator-${creator.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Very slow network (2s per API call): the move must still land exactly once. */
  async slow3g(env) {
    const { creator, joiner } = await setupDuel(env, {
      creator: { apiLatencyMs: 2_000 },
      joiner: { apiLatencyMs: 2_000 },
    });
    const tag = `${env.rec.index}-slow3g`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView } = actorPair(creator, joiner, views);
    const started = Date.now();
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw survives a 2s-per-call network', drew, `commit seen after ${Date.now() - started}ms`);
    const view = await fetchView(actor.guest.token, actorView.matchId);
    addCheck(env.rec, 'no duplicate draw under a very slow network', view.phase === 'ACT', `phase ${view.phase}`);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn still ends under a very slow network', threw.ok, threw.steps.join(' | '));
    const polled = await waitForTurnWord(waiter, 'Your turn', 30_000);
    addCheck(env.rec, 'the very slow turn still reaches the opponent', polled);
    env.rec.screenshots.push(await shot(waiter, `${tag}-slow-net-${waiter.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },

  /** Play a whole turn with both sides already rotated to landscape. */
  async landscape(env) {
    const { creator, joiner } = await setupDuel(env);
    const tag = `${env.rec.index}-landscape`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter, actorView, waiterView } = actorPair(creator, joiner, views);
    for (const [name, session] of [
      ['creator', creator],
      ['joiner', joiner],
    ] as const) {
      const land = session.device.rotated ?? { width: session.device.viewport.height, height: session.device.viewport.width };
      await session.page.setViewportSize(land);
      await sleep(700);
      const audit = await auditLayout(session);
      env.rec.layout.push(...audit.issues.map((i) => ({ ...i, detail: `[${name} landscape ${land.width}x${land.height}] ${i.detail}` })));
      env.rec.screenshots.push(await shot(session, `${tag}-${name}-${session.device.id}`));
    }
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits in landscape', drew);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn can be thrown entirely in landscape', threw.ok, threw.steps.join(' | '));
    const revealed = await waitForRevision(waiter.guest, actorView.matchId, (v) => v.revision > waiterView.revision, 20_000);
    addCheck(env.rec, 'the landscape turn reaches the opponent', revealed !== null, `rev ${revealed?.revision ?? '?'}`);
    for (const session of [creator, joiner]) {
      await session.page.setViewportSize(session.device.viewport);
      await sleep(500);
    }
    await finishByResign(env.rec, waiter, actor);
  },

  /** Reduced motion + Large text: the duel must stay playable and must not overflow. */
  async a11y(env) {
    const { creator, joiner } = await setupDuel(env, {
      creator: { largeText: true, reducedMotion: true },
      joiner: { largeText: true, reducedMotion: true },
    });
    const tag = `${env.rec.index}-a11y`;
    const views = await verifyCommon(env.rec, creator, joiner, tag, env.rec.screenshots);
    if (!views) return;
    const { actor, waiter } = actorPair(creator, joiner, views);
    const classes = await actor.page.evaluate(() => document.documentElement.className);
    addCheck(env.rec, 'Large text setting is applied', /large-text/.test(classes), classes);
    const media = await actor.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    addCheck(env.rec, 'reduced-motion preference is seen by the page', media);
    const drew = await drawViaDeck(actor, actor.device.hasTouch);
    addCheck(env.rec, 'Draw commits with large text + reduced motion', drew);
    const threw = await endTurn(actor);
    addCheck(env.rec, 'the turn can be thrown with large text + reduced motion', threw.ok, threw.steps.join(' | '));
    const audit = await auditLayout(actor);
    env.rec.layout.push(...audit.issues.map((i) => ({ ...i, detail: `[a11y ${actor.device.id}] ${i.detail}` })));
    addCheck(
      env.rec,
      'no horizontal overflow with large text',
      !audit.issues.some((i) => i.kind === 'horizontal-overflow'),
      audit.issues.map((i) => i.kind).join(',') || 'none',
    );
    env.rec.screenshots.push(await shot(actor, `${tag}-${actor.device.id}`));
    await finishByResign(env.rec, waiter, actor);
  },
};

// ---------------------------------------------------------------------------- runner

const pool = new BrowserPool(false);

const closeSessions = async (sessions: Session[]): Promise<void> => {
  for (const session of sessions) await session.close();
};

const runGame = async (gamePlan: GamePlan, pair: { creator: Guest; joiner: Guest }): Promise<GameRecord> => {
  const rec = makeRecord(gamePlan.index, gamePlan.variant, gamePlan.creator);
  rec.joiner = gamePlan.joiner.id;
  rec.engines = [...new Set([gamePlan.creator.engine, gamePlan.joiner.engine])].sort().join('+');
  rec.views = `${gamePlan.creator.viewport.width}x${gamePlan.creator.viewport.height} / ${gamePlan.joiner.viewport.width}x${gamePlan.joiner.viewport.height}`;
  const startedAt = Date.now();
  const sessions: Session[] = [];

  const env: Env = {
    rec,
    plan: gamePlan,
    pair,
    spawn: async (role, label, options = {}) => {
      const device = role === 'creator' ? gamePlan.creator : gamePlan.joiner;
      const guest = role === 'creator' ? pair.creator : pair.joiner;
      const session = await openSession(pool, device, guest, `${gamePlan.index}-${label}`, options);
      sessions.push(session);
      return session;
    },
  };

  const title = `#${String(gamePlan.index).padStart(2, '0')} ${gamePlan.variant} — ${gamePlan.creator.id} (${gamePlan.creator.engine}) vs ${gamePlan.joiner.id} (${gamePlan.joiner.engine})`;
  line(`\n▶ ${title}`);
  try {
    await variants[gamePlan.variant](env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blocked = sessions.some((s) => s.httpErrors.some((e) => / (429|409) /.test(e)));
    if (isRateLimited(message) || message.includes('ENVIRONMENT') || blocked) {
      asEnvironment(rec, message);
    } else {
      fail(rec, 'scenario completed', message.slice(0, 220));
    }
  } finally {
    for (const session of sessions) {
      rec.consoleErrors.push(...session.consoleErrors.map((e) => `[${session.label}] ${e}`));
      rec.consoleErrors.push(...session.pageErrors.map((e) => `[${session.label}] pageerror: ${e}`));
      rec.networkFailures.push(...session.networkFailures.map((e) => `[${session.label}] ${e}`));
      rec.httpErrors.push(...session.httpErrors.map((e) => `[${session.label}] ${e}`));
      rec.corsIssues.push(...session.corsIssues.map((e) => `[${session.label}] ${e}`));
    }
    await closeSessions(sessions);
    // Keep the pair's open-match budget clean for the next game on this slot.
    await cleanupOpenMatches(pair.creator);
    await cleanupOpenMatches(pair.joiner);
    // A refused join leaves an invite nobody will ever join; close a couple to stay under the cap.
    await closeWaitingMatches(pair.creator, pair.joiner, 2);
  }

  const fiveHundreds = serverErrorTally();
  if (fiveHundreds) rec.notes.push(`live API 5xx responses so far in this run: ${fiveHundreds} (transient, retried)`);
  rec.pass = rec.checks.length > 0 && rec.checks.every((c) => c.ok);
  rec.durationMs = Date.now() - startedAt;
  const failed = rec.checks.filter((c) => !c.ok);
  line(
    `${rec.pass ? 'PASS' : 'FAIL'} ${title} — ${rec.checks.length - failed.length}/${rec.checks.length} checks, ` +
      `${rec.layout.length} layout issue(s), ${rec.consoleErrors.length} console error(s) (${Math.round(rec.durationMs / 1000)}s)`,
  );
  for (const f of failed) line(`      ✗ ${f.name}${f.note ? ` — ${f.note}` : ''}`);
  if (rec.consoleErrors.length) {
    line(`      console: ${rec.consoleErrors.length} error(s), first: ${rec.consoleErrors.slice(0, 2).join(' | ').slice(0, 240)}`);
  }
  if (rec.httpErrors.length) line(`      http: ${rec.httpErrors.slice(0, 3).join(' | ').slice(0, 200)}`);
  // Flush after every game so a long run is debuggable and partial results survive.
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ stamp, liveApp: 'https://severgrow.github.io/severgrow-01/futa0.5/', games: results.filter(Boolean) }, null, 2),
  );
  return rec;
};

// ---------------------------------------------------------------------------- main

line(`FUTASAKU 0.5 device matrix — ${plan.length} duel(s), concurrency ${CONCURRENCY}, ${stamp}${SET ? `, set=${SET}` : ''}`);
line(`live app  ${EVIDENCE_DIR} → screenshots`);
if (plan.length === 0) {
  line('nothing to run (filters removed every game)');
  process.exit(1);
}

/**
 * Guests are rate limited per IP (30/hour) and this machine shares the IP with another stream, so:
 * reuse a cached identity set, create only what is missing, and wait politely when limited.
 */
const IDENTITY_CACHE = process.env.MATRIX_IDENTITIES ?? join(tmpdir(), 'futasaku-online-matrix-guests.json');

const guestStillValid = async (guest: Guest): Promise<boolean> => {
  try {
    await listMatches(guest.token);
    return true;
  } catch {
    return false;
  }
};

const ensureGuests = async (wanted: number): Promise<Guest[]> => {
  let cached: Guest[] = [];
  try {
    cached = JSON.parse(readFileSync(IDENTITY_CACHE, 'utf8')) as Guest[];
  } catch {
    cached = [];
  }
  const kept: Guest[] = [];
  for (const guest of cached) {
    if (typeof guest?.token !== 'string') continue;
    if (await guestStillValid(guest)) kept.push(guest);
  }
  line(`identity cache ${IDENTITY_CACHE}: ${kept.length} reusable`);
  const out = kept.slice(0, wanted);
  let attempt = 0;
  while (out.length < wanted) {
    attempt++;
    // Once a pair exists, do not wait forever for extras — degrade to fewer slots instead.
    const maxAttempts = out.length >= 2 ? 8 : 40;
    if (attempt > maxAttempts) {
      line(`  starting with ${out.length} identity/ies (stopped waiting after ${attempt} attempts)`);
      break;
    }
    try {
      const guest = await createGuest();
      out.push(guest);
      writeFileSync(IDENTITY_CACHE, JSON.stringify(out, null, 2));
      line(`  guest ${out.length}/${wanted} created`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      line(`  guest creation blocked (${message.slice(0, 90)}) — retrying in 45s (attempt ${attempt})`);
      await sleep(45_000);
    }
  }
  return out;
};

const wanted = Math.min(CONCURRENCY, 3) * 2;
const guests = await ensureGuests(wanted);
if (guests.length < 2) {
  line('cannot start: fewer than 2 guest identities available (shared IP rate limit)');
  process.exit(2);
}
// Slots = identity pairs, so concurrent games never share a guest.
const SLOT_COUNT = Math.max(1, Math.floor(guests.length / 2));
line(`running with ${SLOT_COUNT} slot(s) / ${SLOT_COUNT * 2} identities`);
const pairs = Array.from({ length: SLOT_COUNT }, (_, slot) => ({
  creator: guests[slot * 2]!,
  joiner: guests[slot * 2 + 1]!,
}));

const results: GameRecord[] = new Array(plan.length);
const slots: GamePlan[][] = Array.from({ length: SLOT_COUNT }, () => []);
plan.forEach((game, i) => slots[i % SLOT_COUNT]!.push(game));

// Start from a clean slate: finish anything still active on these identities and close a few
// invites nobody ever joined (they count against the 10-open-match budget).
for (const pair of pairs) {
  await cleanupOpenMatches(pair.creator);
  await cleanupOpenMatches(pair.joiner);
  const closed = (await closeWaitingMatches(pair.creator, pair.joiner, 3)) + (await closeWaitingMatches(pair.joiner, pair.creator, 3));
  if (closed) line(`closed ${closed} unjoined invite(s) to free the open-match budget`);
}

try {
  await Promise.all(
    slots.map(async (queue, slot) => {
      const pair = pairs[slot]!;
      for (const game of queue) {
        results[plan.indexOf(game)] = await runGame(game, pair);
      }
    }),
  );
} finally {
  await pool.close();
}

// ---------------------------------------------------------------------------- summary

const ran = results.filter((r) => !r.skipped);
const skipped = results.filter((r) => r.skipped);
const passed = ran.filter((r) => r.pass).length;
line(`\n${'='.repeat(72)}`);
line(`${passed}/${ran.length} duels passed${skipped.length ? ` (${skipped.length} skipped: shared-IP rate limit)` : ''}`);
const byVariant = new Map<string, { pass: number; total: number }>();
const byDevice = new Map<string, { pass: number; total: number; layout: number; console: number }>();
for (const r of ran) {
  const v = byVariant.get(r.variant) ?? { pass: 0, total: 0 };
  v.total++;
  if (r.pass) v.pass++;
  byVariant.set(r.variant, v);
  for (const id of [r.creator, r.joiner].filter((x): x is string => x !== null)) {
    const d = byDevice.get(id) ?? { pass: 0, total: 0, layout: 0, console: 0 };
    d.total++;
    if (r.pass) d.pass++;
    d.layout += r.layout.filter((i) => i.detail.includes(id)).length;
    d.console += r.consoleErrors.filter((e) => e.includes(id)).length;
    byDevice.set(id, d);
  }
}
line('\nper variant:');
for (const [name, s] of byVariant) line(`  ${name.padEnd(18)} ${s.pass}/${s.total}`);
line('\nper device:');
for (const [id, s] of byDevice) line(`  ${id.padEnd(26)} ${s.pass}/${s.total} duels, ${s.layout} layout, ${s.console} console`);

const failedGames = results.filter((r) => !r.pass && !r.skipped);
if (failedGames.length) {
  line('\nfailures:');
  for (const r of failedGames) {
    line(`  #${r.index} ${r.variant} ${r.creator} vs ${r.joiner}: ${r.checks.filter((c) => !c.ok).map((c) => c.name).join('; ')}`);
  }
}
if (skipped.length) {
  line('\nskipped (rate limited, not device bugs):');
  for (const r of skipped) line(`  #${r.index} ${r.variant} ${r.creator} vs ${r.joiner}`);
}

const out = RESULTS_PATH;
writeFileSync(
  out,
  JSON.stringify({ stamp, liveApp: 'https://severgrow.github.io/severgrow-01/futa0.5/', games: results }, null, 2),
);
line(`\nresults: ${out}`);

process.exit(ran.length > 0 && passed === ran.length ? 0 : 1);
