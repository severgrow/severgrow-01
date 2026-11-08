// A quiet line when an achievement is earned. Not a modal, not a shower of anything, and not a sound.
//
// The achievements window already lists them. This only adds the moment one becomes done, and it
// stays out of the way:
//
//   * Campaign levels 1–10, and the stretches between them before level 10 is cleared, never show
//     it. The ids are saved, so they do not all appear once the player clears level 10.
//   * A replay of one of those levels stays quiet too, including a line that was waiting.
//   * A Blitz decision (the player's own clock) and the victory / Seeds card hold the line. It
//     shows once that surface is gone, and a refresh does not show it again.
//   * The first list this device sees is a baseline, not a backlog.
//   * Reduced motion is the same line with no travel. The plate itself never moves: the blur stays
//     on a still node, and only the words travel, and only when motion is on.
//
// NOT WIRED. The parent calls `mountAchievementToast` from web/src/main.ts. See that function.
import type { KeyValue } from '../../../server/src/client.js';
import { ACHIEVEMENT_COPY } from '../online/achievement-copy.js';
import { INTERFACE_MOTION, interfaceMotionAllowed } from '../ui/interface-motion.js';

/** Campaign levels 1 through this one never toast. Clearing this level ends the quiet chapter. */
export const QUIET_CAMPAIGN_THROUGH = 10;

/** How long the line stays. One timeout, then it is gone. Not a loop. */
export const ACHIEVEMENT_TOAST_DWELL_MS = 2200;

/** Per player, versioned. A shape change gets a new key. */
export const ACHIEVEMENT_TOAST_KEY = 'severgrow.achievement.toast.v1.';

const MEMORY_VERSION = 1;
const MAX_IDS = 64;

export const ACHIEVEMENT_TOAST_COPY = Object.freeze({
  /** One quiet word above the achievement's own title. No amount: Seeds are spoken at CLAIM. */
  kicker: 'Achievement',
});

/**
 * The plate does not animate (a filter on a moving node repaints every frame). Reduced motion, the
 * in-game Reduce motion class, and `data-motion="still"` all leave the words where they are.
 */
export const ACHIEVEMENT_TOAST_CSS = `
#achievement-toast {
  position: fixed; z-index: 8; left: 50%;
  top: max(64px, calc(env(safe-area-inset-top, 0px) + 52px));
  translate: -50% 0; box-sizing: border-box;
  width: max-content; max-width: min(280px, calc(100% - 32px));
  margin: 0; padding: 8px 14px; border: 0; border-radius: 15px;
  pointer-events: none; text-align: center;
  color: var(--instrument-selection, #f2e5c5);
  background: var(--dark-glass);
  -webkit-backdrop-filter: var(--dark-glass-blur);
  backdrop-filter: var(--dark-glass-blur);
  box-shadow: 0 10px 28px rgba(0, 0, 0, .22);
}
#achievement-toast[hidden] { display: none; }
#achievement-toast .achievement-toast-kicker {
  display: block;
  font-size: var(--instrument-label-size, .6875rem);
  letter-spacing: var(--instrument-tracking, .08em);
  text-transform: uppercase;
  color: var(--instrument-muted, #e8ddc5b3);
}
#achievement-toast .achievement-toast-line {
  display: block; margin-top: 2px;
  font-size: .84rem; letter-spacing: .04em; color: #f2e7cb;
}
#achievement-toast[data-motion="still"] .achievement-toast-line { animation: none; transition: none; }
@media (prefers-reduced-motion: reduce) {
  #achievement-toast .achievement-toast-line { animation: none; transition: none; }
}
html.reduce-motion #achievement-toast .achievement-toast-line { animation: none; transition: none; }
`;

export type AchievementToastMemory = {
  /** False until the first real list. That list is remembered, not announced. */
  baselined: boolean;
  /** Shown, or saved during the quiet chapter. Never announced again. */
  seen: readonly string[];
  /** Earned while a Blitz decision or the victory card was up. */
  held: readonly string[];
};

export type AchievementToastOffer = {
  /** Ids with `done: true` on a real read. Never the server's empty deadline fallback. */
  doneIds: readonly string[];
  /** The campaign level being played, or null when this is not a campaign match. */
  campaignLevel: number | null;
  /** Highest campaign level cleared. 0 if none. Level 10 cleared is 10. */
  clearedThrough: number;
  /** A Blitz decision or the victory / Seeds card is on screen. */
  covered: boolean;
};

export type AchievementToastDecision = {
  memory: AchievementToastMemory;
  /** Ids to put on screen now, in the order they were earned. */
  show: readonly string[];
};

export type AchievementToastHooks = {
  /** Signed-in player, or null. A guest stores nothing and sees nothing. */
  playerId: () => string | null;
  storage: () => KeyValue | null;
  campaignLevel: () => number | null;
  clearedThrough: () => number;
  covered: () => boolean;
  /** OS preference or the in-game Reduce motion setting. Omitted reads both itself. */
  reduceMotion?: () => boolean;
};

export type AchievementToastController = {
  /**
   * A real achievements read. Pass the ids whose `done` is true. An empty list is a real
   * "none yet" and becomes the baseline — do not pass the server's empty deadline fallback.
   */
  note(doneIds: readonly string[]): void;
  /** The Blitz decision or the victory / Seeds card went away. */
  release(): void;
  dispose(): void;
};

type ToastFrame = { opacity: number; translate: string };
export type AchievementToastMove = { frames: readonly ToastFrame[]; durationMs: number };

export const emptyAchievementToastMemory = (): AchievementToastMemory => ({
  baselined: false,
  seen: [],
  held: [],
});

const cleanId = (id: unknown): string | null =>
  typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : null;

const uniq = (ids: readonly unknown[]): string[] => {
  const out: string[] = [];
  for (const id of ids) {
    const clean = cleanId(id);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= MAX_IDS) break;
  }
  return out;
};

/**
 * True when a new unlock must be saved and not shown.
 * Inside levels 1–10, and until level 10 has been cleared (so the batch cannot replay on the menu
 * or all at once afterwards). A later replay of an early level is quiet again.
 */
export const achievementToastQuiet = (campaignLevel: number | null, clearedThrough: number): boolean => {
  const inEarlyLevel = campaignLevel !== null
    && Number.isInteger(campaignLevel)
    && campaignLevel >= 1
    && campaignLevel <= QUIET_CAMPAIGN_THROUGH;
  const stillInTheOpening = !Number.isFinite(clearedThrough) || clearedThrough < QUIET_CAMPAIGN_THROUGH;
  return inEarlyLevel || stillInTheOpening;
};

/** What the words may do. Reduced motion: nothing. Otherwise one short rise, the interface's own. */
export const achievementToastMotion = (reduceMotion: boolean): { animate: boolean; travelPx: number; durationMs: number } =>
  reduceMotion
    ? { animate: false, travelPx: 0, durationMs: 0 }
    : { animate: true, travelPx: INTERFACE_MOTION.travel, durationMs: INTERFACE_MOTION.open };

export const achievementToastEnter = (reduceMotion: boolean): AchievementToastMove | null => {
  const motion = achievementToastMotion(reduceMotion);
  if (!motion.animate || motion.durationMs <= 0) return null;
  return {
    durationMs: motion.durationMs,
    frames: [
      { opacity: 0, translate: `0 ${motion.travelPx}px` },
      { opacity: 1, translate: '0 0' },
    ],
  };
};

export const achievementToastExit = (reduceMotion: boolean): AchievementToastMove | null => {
  const motion = achievementToastMotion(reduceMotion);
  if (!motion.animate) return null;
  return {
    durationMs: INTERFACE_MOTION.close,
    frames: [
      { opacity: 1, translate: '0 0' },
      { opacity: 0, translate: `0 ${motion.travelPx}px` },
    ],
  };
};

export const offerAchievementToasts = (
  memory: AchievementToastMemory,
  offer: AchievementToastOffer,
): AchievementToastDecision => {
  const done = uniq(offer.doneIds);
  if (!memory.baselined) {
    return { memory: { baselined: true, seen: done, held: [] }, show: [] };
  }
  const seen = uniq(memory.seen);
  const seenSet = new Set(seen);
  const held = uniq(memory.held).filter((id) => !seenSet.has(id));
  const heldSet = new Set(held);
  const fresh = done.filter((id) => !seenSet.has(id) && !heldSet.has(id));
  if (achievementToastQuiet(offer.campaignLevel, offer.clearedThrough)) {
    return { memory: { baselined: true, seen: uniq([...seen, ...held, ...fresh]), held: [] }, show: [] };
  }
  const waiting = uniq([...held, ...fresh]);
  if (offer.covered || waiting.length === 0) {
    return { memory: { baselined: true, seen, held: waiting }, show: [] };
  }
  return { memory: { baselined: true, seen: uniq([...seen, ...waiting]), held: [] }, show: waiting };
};

/** The held line, once the covering surface is gone. Does nothing before the first real list. */
export const releaseAchievementToasts = (
  memory: AchievementToastMemory,
  opts: { campaignLevel: number | null; clearedThrough: number; covered: boolean },
): AchievementToastDecision => {
  if (!memory.baselined) return { memory, show: [] };
  return offerAchievementToasts(memory, { doneIds: [], ...opts });
};

export const readAchievementToastMemory = (storage: KeyValue | null, playerId: string): AchievementToastMemory => {
  if (!playerId) return emptyAchievementToastMemory();
  try {
    const raw = storage?.get(`${ACHIEVEMENT_TOAST_KEY}${playerId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const cache = parsed as { v?: unknown; baselined?: unknown; seen?: unknown; held?: unknown } | null;
    if (!cache || cache.v !== MEMORY_VERSION || cache.baselined !== true) return emptyAchievementToastMemory();
    return {
      baselined: true,
      seen: uniq(Array.isArray(cache.seen) ? cache.seen : []),
      held: uniq(Array.isArray(cache.held) ? cache.held : []),
    };
  } catch {
    return emptyAchievementToastMemory();
  }
};

export const writeAchievementToastMemory = (
  storage: KeyValue | null,
  playerId: string,
  memory: AchievementToastMemory,
): void => {
  if (!storage || !playerId) return;
  try {
    storage.set(`${ACHIEVEMENT_TOAST_KEY}${playerId}`, JSON.stringify({
      v: MEMORY_VERSION,
      baselined: memory.baselined,
      seen: uniq(memory.seen),
      held: uniq(memory.held),
    }));
  } catch {
    /* a full or blocked device keeps this session's memory only */
  }
};

const titleFor = (id: string): string | null => {
  if (!Object.prototype.hasOwnProperty.call(ACHIEVEMENT_COPY, id)) return null;
  const row = ACHIEVEMENT_COPY[id as keyof typeof ACHIEVEMENT_COPY];
  const title = row.title.trim();
  return title.length > 0 ? title : null;
};

const STYLE_ID = 'achievement-toast-style';

/**
 * Mount the line. Call it ONCE from `web/src/main.ts`, on the line after `mountStartupReveal()`
 * (line 11470). `campaignLevel` (line 3619) and `campaignProgress` (line 3723) are already in scope.
 * The signed-in id is the stored duel identity (`severgrow.duel.identity.v1`, guest or account),
 * read through `browserStorage()` so the channel prefix is applied:
 *
 *   const achievementToasts = mountAchievementToast({
 *     playerId: () => {
 *       try {
 *         const raw = browserStorage()?.get('severgrow.duel.identity.v1');
 *         const id = raw ? JSON.parse(raw) as { playerId?: unknown } : null;
 *         return typeof id?.playerId === 'string' ? id.playerId : null;
 *       } catch { return null; }
 *     },
 *     storage: () => browserStorage(),
 *     campaignLevel: () => campaignLevel?.number ?? null,
 *     clearedThrough: () => Math.max(0, unlockedThrough(campaignProgress) - 1),
 *     covered: () => {
 *       const over = document.getElementById('gameover');
 *       const victory = !!over && !over.hidden;
 *       const clock = document.getElementById('blitz-clock');
 *       const blitzDecision = document.documentElement.classList.contains('blitz-match')
 *         && clock?.dataset.side === 'mine';
 *       return victory || blitzDecision;
 *     },
 *     reduceMotion: () => !interfaceMotionAllowed(),
 *   });
 *
 * Feed it from `WorldView.loadAchievements` (`web/src/online/world-view.ts`, after
 * `afterAchievementsRead`, around line 2808) only when the outcome kind is `loaded` and
 * `views.length > 0` — an empty list is the server's deadline fallback, not "none earned":
 *
 *   achievementToasts.note(views.filter((view) => view.done).map((view) => view.id));
 *
 * Call `release()` at the end of `hideGameOver()` (`web/src/main.ts` line 8277), after the finish
 * card is hidden, and when the Blitz clock leaves the player's side (`#blitz-clock` `data-side`
 * is no longer `mine`, or `html` loses `blitz-match`). `note()` with the same ids also releases,
 * because `covered()` is read at call time. Do not call `release()` from the pre-show path in
 * `renderGameOver` (line 8574): that hide is the pause before the card, not the player leaving it.
 */
export function mountAchievementToast(hooks: AchievementToastHooks): AchievementToastController {
  const queue: string[] = [];
  let showing: string | null = null;
  let timer = 0;
  let root: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let gone = false;

  const reduce = (): boolean => hooks.reduceMotion?.() ?? !interfaceMotionAllowed();

  const clearTimer = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const ensure = (): { root: HTMLElement; line: HTMLElement } | null => {
    if (gone || typeof document === 'undefined') return null;
    if (root && line) return { root, line };
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = ACHIEVEMENT_TOAST_CSS;
      document.head.append(style);
    }
    const host = document.createElement('div');
    host.id = 'achievement-toast';
    host.hidden = true;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    const kicker = document.createElement('span');
    kicker.className = 'achievement-toast-kicker';
    kicker.textContent = ACHIEVEMENT_TOAST_COPY.kicker;
    const words = document.createElement('span');
    words.className = 'achievement-toast-line';
    host.append(kicker, words);
    document.body.append(host);
    root = host;
    line = words;
    return { root: host, line: words };
  };

  const stopMotion = (node: HTMLElement): void => {
    if (typeof node.getAnimations !== 'function') return;
    for (const anim of node.getAnimations()) anim.cancel();
  };

  const play = (node: HTMLElement, move: AchievementToastMove | null, easing: string): void => {
    if (!move || typeof node.animate !== 'function') return;
    const anim = node.animate([...move.frames], { duration: move.durationMs, easing, fill: 'both' });
    anim.finished.then(() => anim.cancel()).catch(() => undefined);
  };

  const hide = (): void => {
    clearTimer();
    if (gone || !root || !line) {
      showing = null;
      return;
    }
    const node = line;
    const host = root;
    const leave = achievementToastExit(reduce());
    const finish = (): void => {
      if (gone) return;
      stopMotion(node);
      host.hidden = true;
      node.textContent = '';
      showing = null;
      pump();
    };
    if (!leave) {
      finish();
      return;
    }
    stopMotion(node);
    const anim = node.animate([...leave.frames], {
      duration: leave.durationMs,
      easing: INTERFACE_MOTION.easeClose,
      fill: 'both',
    });
    const timerId = window.setTimeout(() => {
      anim.cancel();
      finish();
    }, leave.durationMs + 40);
    timer = timerId;
  };

  const pump = (): void => {
    if (gone || showing) return;
    const id = queue.shift();
    if (!id) return;
    const title = titleFor(id);
    const nodes = ensure();
    if (!title || !nodes) {
      pump();
      return;
    }
    showing = id;
    const reduced = reduce();
    nodes.root.dataset.motion = reduced ? 'still' : 'travel';
    nodes.root.dataset.achievement = id;
    nodes.line.textContent = title;
    nodes.root.hidden = false;
    stopMotion(nodes.line);
    play(nodes.line, achievementToastEnter(reduced), INTERFACE_MOTION.easeOpen);
    timer = window.setTimeout(hide, ACHIEVEMENT_TOAST_DWELL_MS);
  };

  const enqueue = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (!titleFor(id)) continue;
      if (id === showing || queue.includes(id)) continue;
      queue.push(id);
    }
    pump();
  };

  const context = () => ({
    campaignLevel: hooks.campaignLevel(),
    clearedThrough: hooks.clearedThrough(),
    covered: hooks.covered(),
  });

  const apply = (decision: AchievementToastDecision, playerId: string): void => {
    writeAchievementToastMemory(hooks.storage(), playerId, decision.memory);
    if (decision.show.length) enqueue(decision.show);
  };

  return {
    note(doneIds) {
      if (gone) return;
      const playerId = hooks.playerId();
      if (!playerId) return;
      const decision = offerAchievementToasts(readAchievementToastMemory(hooks.storage(), playerId), {
        doneIds,
        ...context(),
      });
      apply(decision, playerId);
    },
    release() {
      if (gone) return;
      const playerId = hooks.playerId();
      if (!playerId) return;
      const decision = releaseAchievementToasts(readAchievementToastMemory(hooks.storage(), playerId), context());
      apply(decision, playerId);
    },
    dispose() {
      gone = true;
      clearTimer();
      queue.length = 0;
      showing = null;
      if (line) stopMotion(line);
      root?.remove();
      root = null;
      line = null;
    },
  };
}
