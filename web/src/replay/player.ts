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
import { NO_OVERLAY, BoardView } from '../ui/board.js';
import type { MaterialLook } from '../logic/materials.js';
import type { ThemeId, ThemeStyle } from '../logic/themes.js';
import type { Board } from '../logic/anim.js';
import type { ReplayModel } from './timeline.js';
import { boardAtIndex, frameAtTime, seekTo } from './seek.js';
import { REPLAY_CSS } from './replay-css.js';

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
  } | null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  score.append(scoreMe, dash, scoreOpp);
  const nameOpp = document.createElement('span');
  nameOpp.className = 'rp-name';
  nameOpp.dataset.seat = '1';
  head.append(nameMe, score, nameOpp);

  const turn = document.createElement('p');
  turn.className = 'rp-turn';
  turn.setAttribute('role', 'status');
  turn.setAttribute('aria-live', 'polite');

  const boardBox = document.createElement('div');
  boardBox.className = 'rp-board';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  boardBox.append(svg);

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

  const foot = document.createElement('footer');
  foot.className = 'rp-foot';
  const meta = document.createElement('span');
  meta.className = 'rp-meta';
  const actions = document.createElement('div');
  actions.className = 'rp-actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'rp-btn';
  again.dataset.rp = 'again';
  again.textContent = REPLAY.again;
  again.hidden = true;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rp-btn';
  closeBtn.dataset.rp = 'close';
  closeBtn.textContent = REPLAY.close;
  const brand = createHudBrandMark('futasaku-replay-white');
  brand.classList.add('rp-brand');
  actions.append(again, closeBtn);
  foot.append(meta, actions, brand);

  stage.append(head, turn, boardBox, scrub, foot);
  root.append(stage);
  document.body.append(root);

  const board = new BoardView(svg, { tap: () => undefined, inspect: () => undefined });
  const ghostLayer = document.createElementNS(SVG_NS, 'g');
  ghostLayer.setAttribute('class', 'l-fx rp-ghost-layer');

  let model: ReplayModel | null = null;
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

  const paintTurn = (frameIndex: number): void => {
    if (!model) return;
    const frame = model.frames[frameIndex];
    if (!frame) return;
    const showsResult = ended && frameIndex === model.frames.length - 1 && model.result;
    const seat = showsResult ? null : frame.turn;
    const changed = turnShown < 0 || frame.turn !== model.frames[Math.max(0, frameIndex - 1)]?.turn || frame.boundary;
    if (seat === null) {
      turn.textContent = model.result!.title;
      delete turn.dataset.seat;
    } else if (turnShown !== frameIndex || turn.dataset.seat !== String(seat)) {
      // The name gets the seat's own ink; the rest of the line stays quiet.
      const b = document.createElement('b');
      b.textContent = model.names[seat];
      turn.replaceChildren(b, document.createTextNode(` ${REPLAY.moveSuffix}`));
      turn.dataset.seat = String(seat);
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

  const paint = (i: number, rebuilt?: Board): void => {
    if (!model) return;
    const frame = model.frames[i];
    if (!frame) return;
    // A rebuild from the log is a SEEK: it paints the position without replaying every beat's
    // motion between here and there (that is what a drag would otherwise look like).
    const forward = !rebuilt && i === index + 1;
    if (forward && !reduce() && frame.removed.length) captureGhosts(frame.removed);
    else clearGhosts();
    const shown = rebuilt ?? frame.board;
    painted = boardSignature(shown);
    board.render(shown, NO_OVERLAY);
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
    paintTurn(i);
    paintMeta();
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const setPlaying = (on: boolean): void => {
    if (!model) return;
    playing = on;
    root.dataset.paused = on ? '0' : '1';
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
    const rebuilt = boardAtIndex(model.input, model, target);
    paint(target, rebuilt);
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
    if (key === 'Escape') {
      event.preventDefault();
      close();
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

  const buildTicks = (): void => {
    ticks.replaceChildren();
    if (!model) return;
    let previous = -1;
    let shown = 0;
    for (const frame of model.frames) {
      if (frame.turn === previous) continue;
      previous = frame.turn;
      // The first hand-over is the opening position, not a tick on the bar.
      if (shown++ === 0 || model.totalMs <= 0) continue;
      const tick = document.createElement('span');
      tick.className = 'rp-tick';
      tick.dataset.seat = String(frame.turn);
      tick.style.left = `${((frame.at / model.totalMs) * 100).toFixed(3)}%`;
      ticks.append(tick);
    }
  };

  const open = (next: ReplayModel): void => {
    model = next;
    index = -1;
    elapsed = 0;
    ended = false;
    playing = false;
    turnShown = -1;
    root.dataset.ended = '0';
    root.dataset.paused = '0';
    again.hidden = true;
    nameMe.textContent = next.names[0];
    nameOpp.textContent = next.names[1];
    scoreMe.textContent = String(next.from.scores[0]);
    scoreOpp.textContent = String(next.from.scores[1]);
    const { style: themeStyle, id } = deps.theme();
    board.setup(next.config, next.terrain, themeStyle, deps.look(), id);
    // The removal ghosts paint above the tiles, in board coordinates (they are moved this once,
    // after `setup` empties the SVG).
    svg.append(ghostLayer);
    board.render(next.from.board, NO_OVERLAY);
    painted = boardSignature(next.from.board);
    buildTicks();
    paintMeta();
    root.hidden = false;
    // One beat for the surface to arrive, then the match plays.
    window.setTimeout(() => {
      if (!model || root.hidden) return;
      if (next.frames.length === 0) {
        finish();
        return;
      }
      restart();
    }, reduce() ? 0 : 180);
    closeBtn.focus({ preventScroll: true });
  };

  const close = (): void => {
    stop();
    playing = false;
    dragging = false;
    resumeAfterDrag = false;
    clearGhosts();
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
          }
        : null,
  };
};
