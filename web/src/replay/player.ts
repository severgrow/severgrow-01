// THE REPLAY PLAYER (owner brief, 2026-10-25): "the replay shows only the board and the logo …
// include the names on the players … a scrub bar … replay-again at the end … tap to pause."
//
// What this is: the board the player already knows, painted from the SAME `BoardView` and the same
// per-beat data the live game animates, with no cockpit, no hand, no cards, no guidance, no lesson
// window. What it is not: a second renderer. `frame.board` is a plain board map, `BoardView.render`
// paints it, and a changed tile arrives with one short crossfade (never a flight, never a spin).
//
// Playback is a plain clock over `model.frames` (see timeline.ts) and every seek paints a frame the
// timeline computed, so a drag on the scrub bar lands on the real position at once.
import { createHudBrandMark } from '../player/branding.js';
import { REPLAY } from '../../../src/strings.js';
import { IS_FUTA04 } from '../channel.js';
import { NO_OVERLAY, BoardView } from '../ui/board.js';
import type { MaterialLook } from '../logic/materials.js';
import type { ThemeId, ThemeStyle } from '../logic/themes.js';
import type { Board } from '../logic/anim.js';
import type { Player } from '../../../src/engine/index.js';
import type { ReplayHighlight, ReplayModel, ReplayTurningPoint } from './timeline.js';
import { boardAtIndex, frameAtTime, seekTo } from './seek.js';
import { REPLAY_CSS } from './replay-css.js';
import { posterFor, shareReplayPoster } from './poster.js';
import type { PosterData } from './poster.js';
import { loadBoardArtUrls, warmBoardArt } from './board-canvas.js';
import { paintVideoFrame, videoPlan } from './frames.js';
import { durationLabel, recordReplayVideo, saveVideo, shareOrSaveVideo, videoFile } from './video.js';
import type { RecordedVideo } from './video.js';
import { encodeReplayMp4, pickMp4Codec } from './encode.js';

export type ReplayDeps = {
  theme: () => { style: ThemeStyle; id: ThemeId };
  look: () => MaterialLook;
  reduceMotion: () => boolean;
  /** Back to the finish card (the card's own state is never touched by the replay). */
  onExit: () => void;
};

export type ReplayHandle = {
  open: (model: ReplayModel) => void;
  close: () => void;
  isOpen: () => boolean;
  /**
   * Test/diagnostic hook: the frame on screen, whether the clock is running, and the position
   * actually painted (a compact board signature and the seat whose turn it shows). It never drives
   * playback — the e2e suite reads it to prove a drag paints a different, correct position.
   */
  now: () => {
    index: number;
    playing: boolean;
    elapsed: number;
    total: number;
    ended: boolean;
    board: string;
    turn: number | null;
    /** DIAGNOSTIC ONLY (perf pass): ms for the last N steps, never read by playback. */
    perf?: {
      paint: number[];
      sig: number[];
      render: number[];
      turn: number[];
      seek: number[];
      rebuild: number[];
    };
  } | null;
  /**
   * Test/diagnostic hook: the whole frame plan (time, seat, kind) and each frame's own board
   * signature. It never drives playback; the e2e suite uses it to name an EXACT frame — a
   * hand-over — seek to it, and check the picture and the named seat are that frame's.
   */
  plan: () => {
    total: number;
    names: readonly [string, string];
    turningPoint: ReplayTurningPoint | null;
    frames: {
      index: number;
      at: number;
      duration: number;
      turn: number;
      boundary: boolean;
      kind: string;
      board: string;
    }[];
  } | null;
  /**
   * Test/diagnostic hook: one step of the video's own plan, painted on a canvas exactly as the
   * recorder paints it — a PNG data URL, with the board's art decoded first. It never drives
   * playback and never touches a recording; the e2e suite uses it to compare the video's board
   * with the board on screen.
   */
  videoFrame: (step?: number) => Promise<string | null>;
  /** Test/diagnostic hook: how the last video export went (time, paint time, pictures, size). */
  lastVideo: () => { ms: number; paintMs: number | null; painted: number; mime: string; bytes: number } | null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export type ReplayArtModule = typeof import('../ui/defaultArtBoard.js');

/**
 * The replay paints with the board the finished match painted with. On the product channel that is
 * `DefaultArtBoardView` — the stone/marble sprite board — and the game has already imported and
 * decoded it, so this resolves from memory. Anywhere else, or if the import fails, it resolves to
 * null and the plain `BoardView` stays: the replay must always open. Never rejects.
 */
export const loadReplayArt = (): Promise<ReplayArtModule | null> =>
  IS_FUTA04 ? import('../ui/defaultArtBoard.js').catch(() => null) : Promise.resolve(null);

/** A changed tile's crossfade: one short fade, staggered across a multi-tile beat. */
const POP_MS = 210;
const MAX_POPS = 18;

/** A compact, order-independent signature of a painted board (diagnostics and the e2e suite). */
const boardSignature = (board: Board): string =>
  Object.entries(board)
    .filter(([, tile]) => tile)
    .map(([key, tile]) => `${key}:${tile!.owner}:${tile!.strength}:${tile!.root ? 1 : 0}`)
    .sort()
    .join('|');

export const mountReplay = (deps: ReplayDeps): ReplayHandle => {
  const style = document.createElement('style');
  style.id = 'futasaku-replay-style';
  style.textContent = REPLAY_CSS;
  document.head.append(style);

  const root = document.createElement('section');
  root.id = 'replay';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', REPLAY.title);

  const stage = document.createElement('div');
  stage.className = 'rp-stage';

  const head = document.createElement('header');
  head.className = 'rp-head';
  const nameMe = document.createElement('span');
  nameMe.className = 'rp-name';
  nameMe.dataset.seat = '0';
  const score = document.createElement('span');
  score.className = 'rp-score';
  const scoreMe = document.createElement('span');
  const dash = document.createElement('span');
  dash.className = 'rp-dash';
  dash.textContent = '–';
  const scoreOpp = document.createElement('span');
  scoreMe.className = 'rp-pts';
  scoreMe.dataset.seat = '0';
  scoreOpp.className = 'rp-pts';
  scoreOpp.dataset.seat = '1';
  score.append(scoreMe, dash, scoreOpp);
  const nameOpp = document.createElement('span');
  nameOpp.className = 'rp-name';
  nameOpp.dataset.seat = '1';
  head.append(nameMe, score, nameOpp);

  // The turn line is SPOKEN, not shown (owner, 2026-10-26: no "… to move" on the replay). Whose
  // move it is reads from the names (the mover's name is lit, with a pip in their ink); a screen
  // reader still hears every hand-over. Once the match has ended the line becomes visible and
  // carries the result ("KAT-WHAT wins").
  const turn = document.createElement('p');
  turn.className = 'rp-turn';
  turn.setAttribute('role', 'status');
  turn.setAttribute('aria-live', 'polite');

  const boardBox = document.createElement('div');
  boardBox.className = 'rp-board';
  const svg = document.createElementNS(SVG_NS, 'svg');
  // The game's own board class: it carries the layer transitions and the seed-stone geometry the
  // live match relies on. The replay must not be a second, subtly different board.
  svg.setAttribute('class', 'board');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  boardBox.append(svg);

  const scrubWrap = document.createElement('div');
  scrubWrap.className = 'rp-scrub-wrap';
  const scrub = document.createElement('div');
  scrub.className = 'rp-scrub';
  scrub.dataset.rp = 'scrub';
  scrub.tabIndex = 0;
  scrub.setAttribute('role', 'slider');
  scrub.setAttribute('aria-label', REPLAY.scrub);
  scrub.setAttribute('aria-valuemin', '0');
  const track = document.createElement('div');
  track.className = 'rp-track';
  const fill = document.createElement('div');
  fill.className = 'rp-fill';
  const ticks = document.createElement('div');
  ticks.className = 'rp-ticks';
  ticks.setAttribute('aria-hidden', 'true');
  track.append(fill, ticks);
  const knob = document.createElement('div');
  knob.className = 'rp-knob';
  scrub.append(track, knob);
  // THE TURNING POINT: one small notch where the biggest cut landed (a sibling of the slider, so
  // it is its own button and does not fight the drag). Its tick is drawn at the exact percent; the
  // pseudo-element widens the touch target to 44px without moving the ink.
  const turnMark = document.createElement('button');
  turnMark.type = 'button';
  turnMark.className = 'rp-notch';
  turnMark.dataset.rp = 'turn';
  turnMark.hidden = true;
  // THE BIGGEST MOMENTS (owner, 2026-10-26: "2-4 biggest actions on timeline rather than more"):
  // one mark per play that moved the match most, instead of a hair per hand-over. The turning point
  // (the biggest cut) is one of them and keeps its own control above; the others are built per match.
  const moments = document.createElement('div');
  moments.className = 'rp-moments';
  scrubWrap.append(scrub, moments, turnMark);
  const bar = document.createElement('div');
  bar.className = 'rp-bar';

  const foot = document.createElement('footer');
  foot.className = 'rp-foot';
  const meta = document.createElement('span');
  meta.className = 'rp-meta';
  bar.append(scrubWrap, meta);
  const leftActions = document.createElement('div');
  leftActions.className = 'rp-actions rp-actions-start';
  const actions = document.createElement('div');
  actions.className = 'rp-actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'rp-btn';
  again.dataset.rp = 'again';
  again.textContent = REPLAY.again;
  again.hidden = true;
  // "Replay again" arrives over the foot of the finished board, centred, where the eye already is.
  again.classList.add('rp-again');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rp-btn';
  closeBtn.dataset.rp = 'close';
  closeBtn.textContent = REPLAY.close;
  // ONE quiet icon beside the mark: the finished poster, shared or saved. It is the same 44px
  // target and the same ink as everything else, and it never moves the footer's existing rows.
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'rp-icon';
  shareBtn.dataset.rp = 'share';
  shareBtn.setAttribute('aria-label', REPLAY.share);
  shareBtn.title = REPLAY.share;
  shareBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
  // THE VIDEO EXPORT (owner, 2026-10-26): the whole replay as a silent file, in the footer beside
  // the poster's share key — the same 44px target and the same ink as everything else.
  const videoBtn = document.createElement('button');
  videoBtn.type = 'button';
  videoBtn.className = 'rp-icon';
  videoBtn.dataset.rp = 'video';
  videoBtn.setAttribute('aria-label', REPLAY.exportVideo);
  videoBtn.title = REPLAY.exportVideo;
  videoBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="m15 10.5 5-3v9l-5-3"/></svg>';
  // THE SIGNATURE (owner, 2026-10-26: "an elegant place to place futasaku.com"): the footer's centre
  // carries the mark and the address as one lockup — the 双サク mark above, FUTASAKU.COM below in
  // Besley, in the game's cream, with a low carved edge. It sits where a screenshot or a screen recording of
  // the replay always catches it, and it is the one mark on this surface.
  const brand = document.createElement('div');
  brand.className = 'rp-brand';
  brand.setAttribute('aria-label', REPLAY.site);
  brand.setAttribute('role', 'img');
  const brandMark = createHudBrandMark('futasaku-replay-white');
  brandMark.classList.add('rp-brand-mark');
  const brandSite = document.createElement('span');
  brandSite.className = 'rp-brand-site';
  brandSite.setAttribute('aria-hidden', 'true');
  brandSite.textContent = REPLAY.site;
  brand.append(brandMark, brandSite);
  leftActions.append(closeBtn);
  actions.append(shareBtn, videoBtn);
  // The footer is two mirrored halves — Close on the left, the two keys on the right, the same
  // width — and the signature sits directly under the board (owner, 2026-10-30: "put the
  // futasaku.com directly under the board, all aligned and symmetric").
  foot.append(leftActions, actions);

  // The recording's own line: progress and the way out. It sits between the scrub bar and the
  // footer, so it never covers a control; while it is hidden nothing moves.
  const videoRow = document.createElement('div');
  videoRow.className = 'rp-video';
  videoRow.hidden = true;
  videoRow.setAttribute('role', 'status');
  videoRow.setAttribute('aria-live', 'polite');
  const videoText = document.createElement('span');
  videoText.className = 'rp-video-text';
  const videoCancel = document.createElement('button');
  videoCancel.type = 'button';
  videoCancel.className = 'rp-btn';
  videoCancel.dataset.rp = 'video-cancel';
  videoCancel.textContent = REPLAY.cancel;
  // Once the file is ready on a phone: one tap opens the share sheet (a phone only allows that from
  // a tap), or saves it instead. Both are the row's own 44px keys; while recording they are hidden.
  const videoShare = document.createElement('button');
  videoShare.type = 'button';
  videoShare.className = 'rp-btn rp-btn-go';
  videoShare.dataset.rp = 'video-share';
  videoShare.textContent = REPLAY.shareVideo;
  videoShare.hidden = true;
  const videoSave = document.createElement('button');
  videoSave.type = 'button';
  videoSave.className = 'rp-btn';
  videoSave.dataset.rp = 'video-save';
  videoSave.textContent = REPLAY.saveVideo;
  videoSave.hidden = true;
  videoRow.append(videoText, videoCancel, videoSave, videoShare);

  // THE MOMENT CAPTION: when the replay arrives at one of the bar's moments (by a tap on its pin, or
  // as playback passes it), one small glass plate over the top of the board says what happened —
  // "02 / 04" or "TURNING POINT" above, then the pin's diamond, the player's name in their ink and the
  // play in plain words. It rests a beat and fades; it never takes a tap and never covers a control.
  const caption = document.createElement('div');
  caption.className = 'rp-caption';
  caption.dataset.show = '0';
  caption.setAttribute('aria-hidden', 'true');
  const captionEyebrow = document.createElement('span');
  captionEyebrow.className = 'rp-caption-eyebrow';
  const captionLine = document.createElement('span');
  captionLine.className = 'rp-caption-line';
  caption.append(captionEyebrow, captionLine);
  boardBox.append(again, caption, brand);
  stage.append(head, turn, boardBox, bar, videoRow, foot);
  root.append(stage);
  document.body.append(root);

  // THE SAME BOARD AS THE MATCH (owner, 2026-10-26: "the board should look just like in the game").
  // The product channel paints with `DefaultArtBoardView` — the stone/marble sprites, rock clusters
  // and sculpted homes — not the plain `BoardView`. `main.ts` already imported that module for the
  // game, so this is a cache hit: resolving it costs a microtask, never a download. If the module
  // or its decoded art ever fails, the replay keeps the plain board (it must always open).
  const art = loadReplayArt();
  const plainBoard = new BoardView(svg, { tap: () => undefined, inspect: () => undefined });
  let artView: BoardView | null = null;
  let board: BoardView = plainBoard;
  const ghostLayer = document.createElementNS(SVG_NS, 'g');
  ghostLayer.setAttribute('class', 'l-fx rp-ghost-layer');

  let model: ReplayModel | null = null;
  /** Bumped by every `open`; an art load that lands after a newer open (or a close) is discarded. */
  let openSeq = 0;
  let index = -1;
  let elapsed = 0;
  let playing = false;
  let ended = false;
  let raf = 0;
  let lastTick = 0;
  let dragging = false;
  let resumeAfterDrag = false;
  let turnShown = -1;
  /** Signature of the board actually painted (a rebuild from the log differs from the frame list). */
  let painted = '';
  let sharing = false;
  /**
   * DIAGNOSTIC ONLY (perf pass, 2026-10-26): one timing pair per step, read through `now().perf`.
   * Nothing in playback reads it; it exists so a measurement can name where a beat's time went
   * instead of guessing (web/e2e/perf-replay.ts is the reader). Bounded work: a few
   * `performance.now()` pairs and one `push` per paint.
   */
  const perf = {
    paint: [] as number[],
    sig: [] as number[],
    render: [] as number[],
    turn: [] as number[],
    seek: [] as number[],
    rebuild: [] as number[],
  };
  const sample = (list: number[], ms: number): void => {
    list.push(Math.round(ms * 100) / 100);
  };
  /** The one recording in flight, if any. Aborted by Close, by a new match, or by Cancel. */
  let recording: AbortController | null = null;
  let videoTimer = 0;

  const reduce = (): boolean => deps.reduceMotion();

  const clearGhosts = (): void => {
    ghostLayer.replaceChildren();
  };

  /** Clone the tiles this beat removes, so a cut fades away instead of blinking out. */
  const captureGhosts = (keys: readonly string[]): void => {
    clearGhosts();
    if (!keys.length) return;
    for (const key of keys) {
      const el = board.tile(key);
      if (el) ghostLayer.append(el.cloneNode(true) as SVGGElement);
    }
  };

  const fadeGhosts = (ms: number): void => {
    if (!ghostLayer.childElementCount) return;
    const duration = Math.min(260, Math.max(120, ms * 0.5));
    for (const node of [...ghostLayer.children]) {
      node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' });
    }
    window.setTimeout(clearGhosts, duration + 30);
  };

  /** Place the turning-point notch, or take it away when this match has no cut to show. */
  const syncTurnMark = (): void => {
    syncMoments();
    if (!model?.turningPoint || model.totalMs <= 0) {
      turnMark.hidden = true;
      turnMark.removeAttribute('aria-label');
      turnMark.removeAttribute('title');
      return;
    }
    const frame = model.frames[model.turningPoint.frame];
    if (!frame) {
      turnMark.hidden = true;
      return;
    }
    turnMark.hidden = false;
    turnMark.style.left = `${((frame.at / model.totalMs) * 100).toFixed(3)}%`;
    turnMark.dataset.at = index === model.turningPoint.frame && !playing && !ended ? '1' : '0';
    turnMark.dataset.seat = String(model.turningPoint.seat);
    const label = REPLAY.turningPointLabel(model.turningPoint.tiles);
    turnMark.setAttribute('aria-label', label);
    turnMark.title = label;
  };

  const paintMeta = (): void => {
    if (!model) return;
    const seconds = Math.round(elapsed / 1000);
    const total = Math.round(model.totalMs / 1000);
    meta.textContent = `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')} / ${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
    const pct = model.totalMs > 0 ? Math.min(100, (elapsed / model.totalMs) * 100) : 0;
    scrub.style.setProperty('--rp-pct', `${pct.toFixed(3)}%`);
    const frame = model.frames[Math.max(0, index)];
    scrub.setAttribute('aria-valuemax', String(Math.max(0, model.frames.length - 1)));
    scrub.setAttribute('aria-valuenow', String(Math.max(0, index)));
    scrub.setAttribute(
      'aria-valuetext',
      frame ? `${REPLAY.toMove(model.names[frame.turn])} · ${Math.round(pct)}%` : '',
    );
  };

  /** The one line naming whose turn it is: the seat's name in the seat's own ink. */
  const setTurnLine = (seat: Player): void => {
    if (!model) return;
    const b = document.createElement('b');
    b.textContent = model.names[seat];
    turn.replaceChildren(b, document.createTextNode(` ${REPLAY.moveSuffix}`));
    turn.dataset.seat = String(seat);
    nameMe.dataset.live = seat === 0 ? '1' : '0';
    nameOpp.dataset.live = seat === 1 ? '1' : '0';
  };

  const paintTurn = (frameIndex: number): void => {
    if (!model) return;
    const frame = model.frames[frameIndex];
    if (!frame) return;
    const showsResult = ended && frameIndex === model.frames.length - 1 && model.result;
    const seat = showsResult ? null : frame.turn;
    const changed = turnShown < 0 || frame.turn !== model.frames[Math.max(0, frameIndex - 1)]?.turn || frame.boundary;
    if (seat === null) {
      // THE RESULT: the winner's name in their own ink, the rest of the line quiet.
      const { title, winner } = model.result!;
      const name = winner === null ? '' : model.names[winner];
      if (name && title.startsWith(name)) {
        const b = document.createElement('b');
        b.textContent = name;
        turn.replaceChildren(b, document.createTextNode(title.slice(name.length)));
        turn.dataset.seat = String(winner);
      } else {
        turn.textContent = title;
        delete turn.dataset.seat;
      }
    } else if (turnShown !== frameIndex || turn.dataset.seat !== String(seat)) {
      // The name gets the seat's own ink; the rest of the line stays quiet.
      setTurnLine(seat);
    }
    // One settle per hand-over, never a loop.
    turn.dataset.change = changed && !reduce() ? '1' : '0';
    if (changed && !reduce()) {
      turn.style.animation = 'none';
      void turn.offsetWidth;
      turn.style.removeProperty('animation');
      window.setTimeout(() => {
        if (turn.dataset.change === '1') turn.dataset.change = '0';
      }, 340);
    }
    turnShown = frameIndex;
    nameMe.textContent = model.names[0];
    nameOpp.textContent = model.names[1];
    nameMe.dataset.live = seat === 0 ? '1' : '0';
    nameOpp.dataset.live = seat === 1 ? '1' : '0';
  };

  /**
   * The match lifts every empty normal hex by 15% (`#board .hex-cell.normal.futa04-empty`, set by
   * the atmosphere) so the ground reads under the tiles. The replay's board is the same board, so it
   * gets the same class on the same cells — otherwise its empty hexes sit a shade darker than the
   * match's. Only the normal cells, as in the game: rock and bonus hexes keep their own look.
   */
  const lightEmptyCells = (shown: Board): void => {
    for (const cell of svg.querySelectorAll<SVGGElement>('.l-base .hex-cell.normal')) {
      const empty = !shown[cell.dataset.key ?? ''];
      if (cell.classList.contains('futa04-empty') !== empty) cell.classList.toggle('futa04-empty', empty);
    }
  };

  const paint = (i: number, rebuilt?: Board): void => {
    if (!model) return;
    const frame = model.frames[i];
    if (!frame) return;
    const tPaint = performance.now();
    // A rebuild from the log is a SEEK: it paints the position without replaying every beat's
    // motion between here and there (that is what a drag would otherwise look like).
    const forward = !rebuilt && i === index + 1;
    // Playback (never a seek or a drag) passing one of the bar's moments names it.
    if (!rebuilt && playing && i > index) {
      const crossed = momentCrossed(index, i);
      if (crossed) showCaption(crossed);
    }
    if (forward && !reduce() && frame.removed.length) captureGhosts(frame.removed);
    else clearGhosts();
    const shown = rebuilt ?? frame.board;
    const tSig = performance.now();
    painted = boardSignature(shown);
    sample(perf.sig, performance.now() - tSig);
    const tRender = performance.now();
    board.render(shown, NO_OVERLAY);
    lightEmptyCells(shown);
    sample(perf.render, performance.now() - tRender);
    if (forward && !reduce() && frame.changed.length) {
      const keys = frame.changed.slice(0, MAX_POPS);
      const stagger = keys.length > 1 ? Math.min(360, (frame.duration * 0.5) / (keys.length - 1)) : 0;
      keys.forEach((key, order) => {
        const el = board.tile(key);
        el?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
          duration: POP_MS,
          delay: order * stagger,
          easing: 'ease-out',
          fill: 'backwards',
        });
      });
    }
    if (forward) fadeGhosts(frame.duration);
    index = i;
    scoreMe.textContent = String(frame.scores[0]);
    scoreOpp.textContent = String(frame.scores[1]);
    const tTurn = performance.now();
    paintTurn(i);
    sample(perf.turn, performance.now() - tTurn);
    paintMeta();
    syncTurnMark();
    sample(perf.paint, performance.now() - tPaint);
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const setPlaying = (on: boolean): void => {
    if (!model) return;
    playing = on;
    root.dataset.paused = on ? '0' : '1';
    syncTurnMark();
    if (!on) {
      stop();
      return;
    }
    if (ended) {
      // "Replay again" is the only way forward from the end; a tap on a finished replay restarts it.
      restart();
      return;
    }
    lastTick = performance.now();
    stop();
    raf = requestAnimationFrame(tick);
  };

  const tick = (now: number): void => {
    raf = 0;
    if (!model || !playing) return;
    const dt = Math.max(0, now - lastTick);
    lastTick = now;
    elapsed += dt;
    const target = frameAtTime(model, elapsed);
    if (target !== index) paint(target);
    else paintMeta();
    if (elapsed >= model.totalMs) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const finish = (): void => {
    if (!model) return;
    elapsed = model.totalMs;
    playing = false;
    ended = true;
    stop();
    root.dataset.ended = '1';
    root.dataset.paused = '0';
    // THE WINNER POPS: their name and score lit in their ink, the other side quiet (CSS, on ended).
    const winner = model.result?.winner;
    root.dataset.winner = winner === 0 || winner === 1 ? String(winner) : 'draw';
    hideCaption();
    again.hidden = false;
    paint(Math.max(0, model.frames.length - 1));
    paintMeta();
    closeBtn.focus({ preventScroll: true });
  };

  const restart = (): void => {
    if (!model) return;
    ended = false;
    root.dataset.ended = '0';
    again.hidden = true;
    elapsed = 0;
    index = -1;
    turnShown = -1;
    board.render(model.from.board, NO_OVERLAY);
    scoreMe.textContent = String(model.from.scores[0]);
    scoreOpp.textContent = String(model.from.scores[1]);
    paint(0);
    elapsed = 0;
    playing = true;
    root.dataset.paused = '0';
    lastTick = performance.now();
    stop();
    raf = requestAnimationFrame(tick);
  };

  const seek = (fraction: number, keepPlaying: boolean): void => {
    if (!model) return;
    const { index: target, ms } = seekTo(model, fraction);
    if (target < 0) return;
    elapsed = ms;
    ended = false;
    root.dataset.ended = '0';
    again.hidden = true;
    // THE SEEK: the position at this beat is rebuilt from the action log (engine `apply` up to the
    // beat, then the beat's own step), not merely looked up. Playback stays O(1) on `frames`, but a
    // drag is a true replay-to-index, as the owner asked ("it must actually seek").
    const tRebuild = performance.now();
    const rebuilt = boardAtIndex(model.input, model, target);
    sample(perf.rebuild, performance.now() - tRebuild);
    const tSeek = performance.now();
    paint(target, rebuilt);
    sample(perf.seek, performance.now() - tSeek);
    if (keepPlaying) {
      playing = true;
      root.dataset.paused = '0';
      lastTick = performance.now();
      stop();
      raf = requestAnimationFrame(tick);
    }
  };

  const fractionAt = (clientX: number): number => {
    const rect = scrub.getBoundingClientRect();
    return rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
  };

  scrub.addEventListener('pointerdown', (event) => {
    if (!model) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    resumeAfterDrag = playing && !ended;
    playing = false;
    stop();
    scrub.setPointerCapture?.(event.pointerId);
    seek(fractionAt(event.clientX), false);
  });
  scrub.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    event.preventDefault();
    seek(fractionAt(event.clientX), false);
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    scrub.releasePointerCapture?.(event.pointerId);
    seek(fractionAt(event.clientX), false);
    if (resumeAfterDrag) {
      resumeAfterDrag = false;
      setPlaying(true);
    }
  };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);

  again.addEventListener('click', (event) => {
    event.stopPropagation();
    restart();
  });
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });

  // THE TURNING POINT: seek to the biggest cut and pause there, so the player is looking at the
  // moment it turned. A second press carries on from that beat (the replay's own clock).
  turnMark.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!model?.turningPoint) return;
    jumpTo(model.turningPoint.frame, turnMark);
  });

  // THE SHARE: the finished poster (names, score, final board, mark) through the phone's own share
  // sheet when it takes a file, otherwise a plain download. The poster is built from the replay's
  // data alone, so nothing hidden can ride along.
  shareBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!model || sharing) return;
    sharing = true;
    shareBtn.setAttribute('aria-busy', 'true');
    const data = posterFor(model);
    // The poster draws the board's faces from the same loaded module; a channel without it (or a
    // failed import) passes none, and the poster keeps its flat fallback.
    void (async () => {
      const mod = await art;
      await shareReplayPoster(
        data,
        mod
          ? {
              sprites: mod.DEFAULT_ART_SPRITES,
              ground: mod.BOARD_GROUND,
              rocks: mod.BOARD_ROCKS,
            }
          : null,
      );
    })()
      .catch(() => undefined)
      .finally(() => {
        sharing = false;
        shareBtn.removeAttribute('aria-busy');
      });
  });

  // THE VIDEO EXPORT (owner, 2026-10-26): the whole replay as a silent file. The pictures are
  // painted from the model into the recorder's own canvas, so the recording is independent of what
  // the surface is doing: a scrub, a pause, or the end card cannot change a single recorded frame.
  /** The recording's line: a message, and whether Cancel belongs beside it. */
  const showVideo = (text: string, cancel: boolean): void => {
    if (videoText.textContent !== text) videoText.textContent = text;
    videoCancel.hidden = !cancel;
    videoRow.dataset.live = cancel ? '1' : '0';
    // Progress changes once a second; announcing every tick would be noise. Only the settled
    // messages ("Video saved", "Could not make the video") are spoken.
    videoRow.setAttribute('aria-live', cancel ? 'off' : 'polite');
    videoRow.hidden = false;
  };
  /** Write progress only when the word changes: one announcement per second, not per frame. */
  const writeVideoProgress = (text: string): void => {
    if (!videoRow.hidden && videoText.textContent !== text) videoText.textContent = text;
  };
  const settleVideo = (): void => {
    window.clearTimeout(videoTimer);
    readyVideo = null;
    videoShare.hidden = true;
    videoSave.hidden = true;
    videoRow.hidden = true;
    videoRow.dataset.live = '0';
    videoCancel.hidden = true;
    videoBtn.disabled = false;
    videoBtn.removeAttribute('aria-busy');
  };
  /** The one recording in flight stops here — Close, a new match, or the Cancel key. */
  const cancelVideo = (): void => {
    const running = recording;
    recording = null;
    running?.abort();
    settleVideo();
  };

  /** Diagnostics for the test hook: how the last export went (never shown, never sent). */
  let lastVideo: { ms: number; paintMs: number | null; painted: number; mime: string; bytes: number } | null = null;
  /** The finished file, waiting for the player's tap on Share or Save. */
  let readyVideo: { video: RecordedVideo; data: PosterData } | null = null;
  const canShareFile = (file: File): boolean => {
    const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
    return !!nav.share && !!nav.canShare?.({ files: [file] });
  };
  /** True while the press that started the export still counts as a tap (Chrome says so). */
  const hasTapNow = (): boolean =>
    !!(navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive;
  const handOver = async (video: RecordedVideo, data: PosterData, mode: 'auto' | 'save' = 'auto'): Promise<void> => {
    const outcome = mode === 'save' ? saveVideo(video, data) : await shareOrSaveVideo(video, data, REPLAY.mark);
    if (outcome === 'cancelled') {
      // The share sheet was dismissed: keep the file ready for another try rather than lose it.
      readyVideo = { video, data };
      showVideo(REPLAY.videoDone, false);
      videoShare.hidden = !canShareFile(videoFile(video, data));
      videoSave.hidden = false;
      return;
    }
    videoShare.hidden = true;
    videoSave.hidden = true;
    readyVideo = null;
    showVideo(outcome === 'shared' ? REPLAY.videoShared : REPLAY.videoSaved, false);
    videoTimer = window.setTimeout(settleVideo, 2600);
  };
  videoShare.addEventListener('click', (event) => {
    event.stopPropagation();
    const ready = readyVideo;
    if (ready) void handOver(ready.video, ready.data);
  });
  videoSave.addEventListener('click', (event) => {
    event.stopPropagation();
    const ready = readyVideo;
    if (ready) void handOver(ready.video, ready.data, 'save');
  });

  const startVideo = async (): Promise<void> => {
    if (!model || recording) return;
    const current = model;
    const controller = new AbortController();
    recording = controller;
    window.clearTimeout(videoTimer);
    videoBtn.disabled = true;
    videoBtn.setAttribute('aria-busy', 'true');
    showVideo(REPLAY.recording(durationLabel(0), durationLabel(current.totalMs)), true);
    // The surface pauses while it records: the video is painted from the model, and a still screen
    // keeps the phone cool and the encoder's own clock honest. Its controls all stay usable.
    setPlaying(false);
    try {
      const art = await loadBoardArtUrls();
      // THE FAST WAY FIRST: the phone's own H.264 encoder, a moving .mp4 in a few seconds. Only a
      // browser without it records the screen in real time (the old .webm path).
      const codec = await pickMp4Codec();
      if (controller.signal.aborted) return;
      if (codec) showVideo(REPLAY.making(0), true);
      const video = codec
        ? await encodeReplayMp4({
            model: current,
            art,
            codec,
            signal: controller.signal,
            onProgress: (fraction) => writeVideoProgress(REPLAY.making(Math.round(fraction * 100))),
          })
        : await recordReplayVideo({
            model: current,
            art,
            signal: controller.signal,
            onProgress: (done, total) => writeVideoProgress(REPLAY.recording(durationLabel(done), durationLabel(total))),
          });
      if (!video || controller.signal.aborted) {
        settleVideo();
        return;
      }
      lastVideo = { ms: video.ms, paintMs: video.paintMs ?? null, painted: video.painted, mime: video.mime, bytes: video.blob.size };
      const data = posterFor(current);
      const file = videoFile(video, data);
      if (canShareFile(file) && !hasTapNow()) {
        // A phone opens its share sheet only from a tap: the file waits here for one.
        readyVideo = { video, data };
        showVideo(REPLAY.videoDone, false);
        videoShare.hidden = false;
        videoSave.hidden = false;
        videoShare.focus({ preventScroll: true });
        return;
      }
      showVideo(REPLAY.videoReady, false);
      await handOver(video, data);
    } catch {
      // The one honest line: this browser could not record, or the encoder stopped. Never a fake
      // "saved".
      settleVideo();
      if (!controller.signal.aborted) {
        showVideo(REPLAY.videoFailed, false);
        videoTimer = window.setTimeout(settleVideo, 3000);
      }
    } finally {
      // The button comes back only if no NEWER recording has taken over (a cancel followed by an
      // immediate second press must not re-enable the control under the running one).
      if (recording === controller) recording = null;
      if (!recording) {
        videoBtn.disabled = false;
        videoBtn.removeAttribute('aria-busy');
        videoCancel.hidden = true;
      }
    }
  };

  videoBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    void startVideo();
  });
  videoCancel.addEventListener('click', (event) => {
    event.stopPropagation();
    cancelVideo();
  });

  // Tap anywhere to pause, tap again to carry on. A tap on a control is not a pause.
  stage.addEventListener('pointerdown', (event) => {
    const el = event.target as Element | null;
    if (el?.closest('[data-rp], .rp-scrub')) return;
    if (dragging) return;
    event.preventDefault();
    if (!model || ended) return;
    setPlaying(!playing);
  });

  root.addEventListener('keydown', (event) => {
    if (!model) return;
    const key = event.key;
    // A focused control keeps its own Space/Enter: the dialog must not swallow the press that
    // activates "Replay again" or "Close".
    const target = event.target as Element | null;
    if ((key === ' ' || key === 'Spacebar') && target?.closest('button, a[href], input, [role="button"]')) return;
    if (key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    // The surface is `aria-modal`: Tab cycles its own controls (the bar, the turning-point notch
    // when it exists, "Replay again" when it exists, Close and Share) instead of wandering into the
    // game behind it.
    if (key === 'Tab') {
      const order: HTMLElement[] = [
        scrub,
        ...([...moments.children, ...(turnMark.hidden ? [] : [turnMark])] as HTMLElement[]).sort(
          (a, b) => parseFloat(a.style.left) - parseFloat(b.style.left),
        ),
        ...(again.hidden ? [] : [again]),
        ...(videoRow.hidden ? [] : [videoCancel]),
        closeBtn,
        shareBtn,
        ...(videoBtn.disabled ? [] : [videoBtn]),
      ];
      const at = order.indexOf(document.activeElement as HTMLElement);
      const dir = event.shiftKey ? -1 : 1;
      const next = at < 0 ? order[event.shiftKey ? order.length - 1 : 0]! : order[(at + dir + order.length) % order.length]!;
      event.preventDefault();
      next.focus({ preventScroll: true });
      return;
    }
    if (key === ' ' || key === 'Spacebar') {
      event.preventDefault();
      if (ended) restart();
      else setPlaying(!playing);
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      const step = key === 'ArrowRight' ? 1 : -1;
      const next = Math.min(Math.max(0, index + step), model.frames.length - 1);
      seek(model.totalMs > 0 ? model.frames[next]!.at / model.totalMs : 0, false);
      return;
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      seek(key === 'Home' ? 0 : 1, false);
    }
  });

  let captionTimer = 0;
  const CAPTION_HOLD_MS = 2400;
  const hideCaption = (): void => {
    window.clearTimeout(captionTimer);
    if (caption.dataset.show === '1') caption.dataset.show = '0';
  };
  const showCaption = (moment: ReplayHighlight): void => {
    if (!model) return;
    const order = model.highlights.indexOf(moment);
    const turning = moment.action === model.turningPoint?.action;
    const pad = (n: number) => String(n).padStart(2, '0');
    captionEyebrow.textContent = turning
      ? REPLAY.turningPoint
      : `${pad(order + 1)} / ${pad(model.highlights.length)}`;
    const mark = document.createElement('i');
    const who = document.createElement('b');
    who.textContent = model.names[moment.seat];
    const what = document.createElement('span');
    what.textContent = REPLAY.momentWhat(moment.cut, moment.swing);
    captionLine.replaceChildren(mark, who, what);
    caption.dataset.seat = String(moment.seat);
    caption.dataset.turning = turning ? '1' : '0';
    // Restart the arrival even when a caption is already up (two moments close together).
    caption.dataset.show = '0';
    void caption.offsetWidth;
    caption.dataset.show = '1';
    window.clearTimeout(captionTimer);
    captionTimer = window.setTimeout(hideCaption, CAPTION_HOLD_MS);
  };
  /** The moment whose first beat lies in (from, to] — what playback just passed — if any. */
  const momentCrossed = (from: number, to: number): ReplayHighlight | null =>
    model?.highlights.find((h) => h.frame > from && h.frame <= to) ?? null;

  /** The bar's marks for this match: every highlight but the turning point (that has its own control). */
  const buildMoments = (): void => {
    moments.replaceChildren();
    ticks.replaceChildren();
    if (!model || model.totalMs <= 0) return;
    for (const moment of model.highlights) {
      if (moment.action === model.turningPoint?.action) continue;
      const frame = model.frames[moment.frame];
      if (!frame) continue;
      const mark = document.createElement('button');
      mark.type = 'button';
      mark.className = 'rp-moment';
      mark.dataset.rp = 'moment';
      mark.dataset.seat = String(moment.seat);
      mark.dataset.frame = String(moment.frame);
      mark.style.left = `${((frame.at / model.totalMs) * 100).toFixed(3)}%`;
      const label = REPLAY.momentLabel(model.names[moment.seat], moment.cut, moment.swing);
      mark.setAttribute('aria-label', label);
      mark.title = label;
      mark.addEventListener('click', (event) => {
        event.stopPropagation();
        jumpTo(moment.frame, mark);
      });
      moments.append(mark);
    }
    syncMoments();
  };

  /** The mark of the beat on screen glows while the replay rests on it. */
  const syncMoments = (): void => {
    for (const mark of moments.children as HTMLCollectionOf<HTMLElement>) {
      mark.dataset.at = Number(mark.dataset.frame) === index && !playing && !ended ? '1' : '0';
    }
  };

  /**
   * A mark is a door to its moment: the first press lands on that play's first beat and pauses there,
   * so the player is looking at it; a second press carries on from it (the replay's own clock).
   */
  const jumpTo = (frameIndex: number, control: HTMLElement): void => {
    if (!model) return;
    const frame = model.frames[frameIndex];
    if (!frame) return;
    if (index === frameIndex && !playing && !ended) {
      setPlaying(true);
      return;
    }
    setPlaying(false);
    seek(model.totalMs > 0 ? frame.at / model.totalMs : 0, false);
    control.focus({ preventScroll: true });
    const moment = model.highlights.find((h) => h.frame === frameIndex);
    if (moment) showCaption(moment);
  };

  /** A view's static art, then the removal ghosts above it (`setup` empties the SVG). */
  const setupView = (view: BoardView, next: ReplayModel): void => {
    const { style: themeStyle, id } = deps.theme();
    view.setup(next.config, next.terrain, themeStyle, deps.look(), id);
    // The removal ghosts paint above the tiles, in board coordinates (they are moved this once,
    // after `setup` empties the SVG).
    svg.append(ghostLayer);
  };

  /** The opening position, painted before the staged entrance and the first beat. */
  const paintOpening = (next: ReplayModel): void => {
    board.render(next.from.board, NO_OVERLAY);
    lightEmptyCells(next.from.board);
    painted = boardSignature(next.from.board);
  };

  const open = (next: ReplayModel): void => {
    const seq = ++openSeq;
    // A recording of the previous match must not carry on into this one.
    cancelVideo();
    model = next;
    index = -1;
    elapsed = 0;
    ended = false;
    playing = false;
    turnShown = -1;
    root.dataset.ended = '0';
    root.dataset.paused = '0';
    again.hidden = true;
    painted = '';
    nameMe.textContent = next.names[0];
    nameOpp.textContent = next.names[1];
    scoreMe.textContent = String(next.from.scores[0]);
    scoreOpp.textContent = String(next.from.scores[1]);
    // The turn line is set here too, so the surface never shows a blank line while it fades in.
    setTurnLine(next.frames[0]?.turn ?? next.from.turn);
    buildMoments();
    paintMeta();
    syncTurnMark();
    root.hidden = false;
    closeBtn.focus({ preventScroll: true });
    void beginMatch(seq, next);
  };

  /**
   * The product board's art is decoded once by the game before the match, so this is a cache hit:
   * the board is mounted and painted in the same microtask the replay appears in. If the import or
   * the decode ever fails, the plain `BoardView` is mounted instead — a slow or broken picture can
   * never hold the screen or keep the replay from opening. Mounting the chosen view exactly once
   * also keeps the plain board's world-layer `warming` class out of the art board's SVG.
   */
  const beginMatch = async (seq: number, next: ReplayModel): Promise<void> => {
    const mod = await art;
    if (seq !== openSeq || model !== next) return;
    let view: BoardView = plainBoard;
    if (mod) {
      try {
        await mod.boardArtReady;
        if (seq !== openSeq || model !== next) return;
        artView ??= new mod.DefaultArtBoardView(svg, { tap: () => undefined, inspect: () => undefined });
        view = artView;
      } catch {
        // Decoded art is a nicety; the plain board still shows the real position.
      }
    }
    if (seq !== openSeq || model !== next) return;
    board = view;
    setupView(board, next);
    paintOpening(next);
    placeBrand();
    // One beat for the surface to arrive, then the match plays.
    window.setTimeout(() => {
      if (!model || root.hidden || seq !== openSeq) return;
      if (next.frames.length === 0) {
        finish();
        return;
      }
      restart();
    }, reduce() ? 0 : 180);
  };

  // THE SIGNATURE'S PLACE: the board's own drawn extent, read from the SVG, so the lockup sits a
  // fixed gap under the lowest hex and on the board's own centre line — on every board shape, and
  // however the box letterboxes it. Re-read only when the box changes size (never per frame).
  const BRAND_GAP = 14;
  const placeBrand = (): void => {
    if (root.hidden) return;
    let bb: DOMRect;
    try {
      bb = svg.getBBox();
    } catch {
      return;
    }
    const m = svg.getScreenCTM();
    if (!m || bb.width <= 0 || bb.height <= 0) return;
    const box = boardBox.getBoundingClientRect();
    const bottom = (bb.y + bb.height) * m.d + m.f - box.top;
    const centre = (bb.x + bb.width / 2) * m.a + m.e - box.left;
    const room = box.height - brand.offsetHeight;
    brand.style.top = `${Math.round(Math.max(0, Math.min(bottom + BRAND_GAP, room)))}px`;
    brand.style.left = `${Math.round(centre)}px`;
    brand.dataset.placed = '1';
  };
  const brandWatch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => placeBrand());
  brandWatch?.observe(boardBox);

  const close = (): void => {
    // A recording never outlives the surface it was started from.
    cancelVideo();
    stop();
    playing = false;
    dragging = false;
    resumeAfterDrag = false;
    clearGhosts();
    hideCaption();
    model = null;
    painted = '';
    root.hidden = true;
    root.dataset.ended = '0';
    root.dataset.paused = '0';
    deps.onExit();
  };

  return {
    open,
    close,
    isOpen: () => !root.hidden,
    now: () =>
      model
        ? {
            index,
            playing,
            elapsed: Math.round(elapsed),
            total: Math.round(model.totalMs),
            ended,
            board: painted,
            turn: model.frames[Math.max(0, index)]?.turn ?? null,
            perf,
          }
        : null,
    plan: () =>
      model
        ? {
            total: Math.round(model.totalMs),
            names: model.names,
            turningPoint: model.turningPoint,
            frames: model.frames.map((frame) => ({
              index: frame.index,
              at: Math.round(frame.at),
              duration: frame.duration,
              turn: frame.turn,
              boundary: frame.boundary,
              kind: frame.kind,
              board: boardSignature(frame.board),
            })),
          }
        : null,
    lastVideo: () => lastVideo,
    videoFrame: async (step = -1) => {
      if (!model) return null;
      const plan = videoPlan(model);
      const at = step < 0 ? plan.steps.length - 1 : Math.min(step, plan.steps.length - 1);
      await warmBoardArt(await loadBoardArtUrls());
      const canvas = document.createElement('canvas');
      paintVideoFrame(canvas, model, plan.steps[Math.max(0, at)]!);
      return canvas.toDataURL('image/png');
    },
  };
};
