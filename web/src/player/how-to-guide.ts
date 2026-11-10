// THE QUIET HELP KEY (owner, 2026-11-10: "goal is to keep players in, but not make too much noise on
// the screen" - the studio version, agreed). Zero unsolicited text, one familiar key:
//
//   - The help key is the cockpit's existing Match Intel key. While a player is new (a guest or a
//     first-ever game; the first GUIDE_FRESH_GAMES games; never a signed-in player who already
//     finished a game) it shows "?" instead of the bulb and is slightly brighter, in the same metal
//     and glass. It never pulses. Afterwards it is the bulb again ("the ? shrinks to the normal help
//     icon"): a newcomer reads "?" as "how do I play"; a regular knows the bulb as Match Intel.
//   - The first time Grow, Strengthen, Cut, Bloom, Bomb or Blast becomes possible, the key gets ONE
//     soft edge light for 1.5 s, then returns to normal. Once per action, ever (this device).
//   - A tap opens the existing lesson window for that exact action, lit on the real board. It closes
//     when the player makes the move or taps anywhere else. Nothing ever opens by itself.
//   - Otherwise the key is Match Intel, exactly as before. Off in Blitz and in the Tutorial/lessons.
//   - Turning the Settings switch off and on again makes the player "new" again.
//
// Decisions live in logic/guide-watcher.ts (pure, tested). This module owns the key's look, what
// this device remembers, and the window's open/close. One 1.5 s timer per light; no loops.
import type { Action, View } from '../../../src/engine/index.js';
import {
  EMPTY_GUIDE_PROGRESS, guideActive, guideFresh, guideHintBeat, guideTap, guideWindow, markGuideSeen,
  mergeGuideProgress, parseGuideProgress,
} from '../logic/guide-watcher.js';
import type { GuideBeat, GuideProgress, GuideWindow } from '../logic/guide-watcher.js';
import type { Lit } from '../lessons/lessons.js';
import type { KeyValue } from '../../../server/src/client.js';

export const GUIDE_STORAGE_KEY = 'severgrow.guide.v1';
/** What only this device remembers: which actions had their light, finished games, a re-enable. */
export const GUIDE_LOCAL_KEY = 'severgrow.guide.local.v1';
/** How long the one-time edge light stays (owner: "for 1.5 seconds"). */
export const GUIDE_HINT_MS = 1500;
/** How long the guide waits before it talks to the server (boot and a game start stay quiet). */
export const GUIDE_SYNC_DELAY_MS = 4000;
/** The key's names: "How to play" while new, "Tips" (its usual name) afterwards. */
export const GUIDE_KEY_LABEL = 'How to play';

const CSS = `
/* NEW PLAYER: "?" in place of the bulb, a touch brighter, in the key's own metal and glass. Still. */
/* (id-heavy and !important: the desktop cockpit forces every icon in a key to show, and a regular
   player must see the bulb ALONE — owner, 2026-11-10: "both bulb and ? ... extremely ugly") */
html #futa04-help-button > .guide-q { display: none !important; }
html.futasaku-guide-fresh #futa04-help-button > .guide-q { display: inline-flex !important; }
html.futasaku-guide-fresh #futa04-help-button > .i:not(.guide-q) { display: none !important; }
html.futasaku-guide-fresh #futa04-help-button { filter: brightness(1.18); }
html.futasaku-guide-fresh #futa04-help-button .guide-q { color: #fff3dc; }
/* THE ONE-TIME EDGE LIGHT: a soft light that rises and settles once, 1.5 s, then it is gone. */
#futa04-help-button.guide-hint { position: relative; }
/* (the cockpit hides every key's ::after - information.ts - so this one id-heavy rule wins while lit) */
html #futa04-box #futa04-actions > #futa04-help-button.guide-hint::after,
#futa04-help-button.guide-hint::after {
  display: block; content: ''; position: absolute; inset: -2px; border-radius: inherit; pointer-events: none;
  /* light only, never a drawn rim — and the SAME light as every highlight in the game (the Draw
     pile's own cool cream), so "lit" always means one thing (owner, 2026-11-10) */
  box-shadow: 0 0 12px 2px rgb(242 237 224 / .46), 0 0 24px 4px rgb(242 237 224 / .16);
  opacity: 0; animation: guide-hint-edge ${GUIDE_HINT_MS}ms ease-in-out 1 both;
}
@keyframes guide-hint-edge { 0% { opacity: 0; } 25%, 70% { opacity: 1; } 100% { opacity: 0; } }
/* Reduce motion: the same light, still (on for the 1.5 s, then off). */
.reduce-motion #futa04-box #futa04-actions > #futa04-help-button.guide-hint::after { animation: none; opacity: 1; }
@media (prefers-reduced-motion: reduce) { html #futa04-box #futa04-actions > #futa04-help-button.guide-hint::after { animation: none; opacity: 1; } }
/* LESSON OPEN: the key reads as pressed in — a darker, sunken well and a softly lit gold "?" — so a
   second press is plainly how to put the lesson away (owner, 2026-11-10). Depth and light only:
   no drawn ring or outline anywhere (owner: "that 2d line contour should not be there"). */
html #futa04-box #futa04-actions > #futa04-help-button[aria-pressed='true'] {
  filter: none; background: rgb(6 7 8 / .72);
  box-shadow: inset 0 3px 7px rgb(0 0 0 / .75), inset 0 -1px 2px rgb(242 237 224 / .04);
}
html #futa04-box #futa04-actions > #futa04-help-button[aria-pressed='true'] .guide-q {
  color: #ffe1a7; transform: translateY(1px); filter: drop-shadow(0 0 4px rgb(255 205 120 / .55));
}
`;

/** "?" drawn in the bulb's own stroke, size and weight. */
const QUESTION_SVG = '<span class="i guide-q" aria-hidden="true"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 1 1 4.4 2.65c-.95.5-1.5 1.15-1.5 2.1V15"/><path d="M12 18.6h.01"/></svg></span>';

export type HowToGuideHooks = {
  /** The switch in Settings. */
  setting(): boolean;
  /** A Blitz duel is on screen: the guide is fully off. */
  blitz(): boolean;
  /** Something else owns the teaching right now (the Tutorial, a lesson, the campaign's own window). */
  busy(): boolean;
  /** The player's view and the moves legal right now, or null when no game is on screen. */
  position(): { view: View; legal: readonly Action[] } | null;
  /** A signed-in account (not a guest). */
  signedIn(): boolean;
  /** The help key (the Match Intel key), when the cockpit has one. */
  bulb(): HTMLElement | null;
  /** Draw the window (the existing lesson glass, lit on the real board). */
  openWindow(win: GuideWindow): void;
  closeWindow(): void;
  /** The page elements a lit thing is drawn on (lessons/lesson-view.ts litTarget). */
  litSelectors(lit: Lit): string[];
  storage: KeyValue | null;
  /** The server copy of what was seen, or null (no identity, or no server support). */
  account: {
    load(): Promise<GuideProgress | null>;
    save(p: GuideProgress): Promise<GuideProgress | null>;
  } | null;
};

type Local = { hinted: GuideBeat[]; finished: number; base: number; reenabled: boolean };
const EMPTY_LOCAL: Local = { hinted: [], finished: 0, base: 0, reenabled: false };

export type HowToGuide = ReturnType<typeof mountHowToGuide>;

export const mountHowToGuide = (hooks: HowToGuideHooks) => {
  if (!document.getElementById('futasaku-guide-style')) {
    const style = document.createElement('style');
    style.id = 'futasaku-guide-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.documentElement;

  // ---------- memory: what was seen (this device + the server), what only this device knows ----------
  const read = (): GuideProgress => {
    try { return parseGuideProgress(JSON.parse(hooks.storage?.get(GUIDE_STORAGE_KEY) ?? 'null')); } catch { return EMPTY_GUIDE_PROGRESS; }
  };
  let progress = read();
  const write = () => { try { hooks.storage?.set(GUIDE_STORAGE_KEY, JSON.stringify(progress)); } catch { /* private mode */ } };
  let local: Local = (() => {
    try {
      const raw = JSON.parse(hooks.storage?.get(GUIDE_LOCAL_KEY) ?? 'null') as Partial<Local> | null;
      return {
        hinted: Array.isArray(raw?.hinted) ? raw!.hinted.filter((b): b is GuideBeat => typeof b === 'string') : [],
        finished: Number.isFinite(raw?.finished) ? Math.max(0, Math.floor(raw!.finished!)) : 0,
        base: Number.isFinite(raw?.base) ? Math.max(0, Math.floor(raw!.base!)) : 0,
        reenabled: raw?.reenabled === true,
      };
    } catch { return { ...EMPTY_LOCAL }; }
  })();
  const writeLocal = () => { try { hooks.storage?.set(GUIDE_LOCAL_KEY, JSON.stringify(local)); } catch { /* private mode */ } };

  /** One server write at a time, and only when something changed. */
  let saving = false, dirty = false;
  const pushAccount = () => {
    if (!hooks.account) return;
    if (saving) { dirty = true; return; }
    saving = true;
    void hooks.account.save(progress).then((joined) => {
      if (joined) { progress = mergeGuideProgress(progress, parseGuideProgress(joined)); write(); }
    }, () => undefined).finally(() => {
      saving = false;
      if (dirty) { dirty = false; pushAccount(); }
    });
  };
  // The server copy is bookkeeping, never urgent: a write waits a few quiet seconds (and merges with
  // any other in that window), so the guide never adds a request at the moment a board opens and
  // the duel's own requests are racing for the line (online-presence-journey measures exactly that).
  let pushTimer = 0;
  const pushSoon = () => {
    if (!hooks.account || pushTimer) return;
    pushTimer = window.setTimeout(() => { pushTimer = 0; pushAccount(); }, GUIDE_SYNC_DELAY_MS);
  };
  // Join the server's copy once — only after a game has started (never at boot: a player who only
  // visits the menu or Territory causes no guide traffic at all), and a few quiet seconds in. A
  // player who opened a lesson on another phone then sees it as seen.
  let joined = false;
  const joinSoon = () => {
    if (joined || !hooks.account) return;
    joined = true;
    window.setTimeout(() => void hooks.account?.load().then((remote) => {
      if (!remote) { if (progress.seen.length || progress.games) pushAccount(); return; }
      const merged = mergeGuideProgress(progress, parseGuideProgress(remote));
      const changed = merged.seen.length !== progress.seen.length || merged.games !== progress.games;
      progress = merged; write();
      if (changed || merged.seen.length !== remote.seen.length || merged.games !== remote.games) pushAccount();
      update();
    }, () => undefined), GUIDE_SYNC_DELAY_MS);
  };

  // ---------- the decisions, read from the pure watcher ----------
  const seen = () => new Set<string>(progress.seen);
  const hinted = () => new Set<string>(local.hinted);
  const active = (): boolean => !hooks.busy() && !!hooks.position() && guideActive({ setting: hooks.setting(), blitz: hooks.blitz() });
  const fresh = (): boolean => active() && guideFresh({
    setting: hooks.setting(), blitz: hooks.blitz(), signedIn: hooks.signedIn(), finishedGames: local.finished,
    gamesStarted: Math.max(1, progress.games - local.base), hinted: hinted(), reenabled: local.reenabled,
  });

  // ---------- the window: opened only by a tap; closed by the move or a tap elsewhere ----------
  let open: GuideWindow | null = null;
  let keep: string[] = [];
  const onPointerDown = (ev: Event) => {
    const t = ev.target instanceof Element ? ev.target : null;
    if (!open || !t) return;
    // inside the window, on the help key, or on the lit thing (the move being made): keep it
    if (t.closest('#futasaku-glass, #futa04-help-button')) return;
    if (keep.some((sel) => { try { return !!t.closest(sel); } catch { return false; } })) return;
    close();
  };
  // The lesson leaves focus where it was (on the board or the key), so its glass never hears the
  // keyboard: Escape closes it here, without also cancelling a card picked underneath.
  const onKeyDown = (ev: KeyboardEvent) => {
    if (!open || ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  };
  const close = () => {
    if (!open) return;
    open = null;
    keep = [];
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    hooks.bulb()?.removeAttribute('aria-pressed');
    hooks.closeWindow();
  };
  const openBeat = (beat: GuideBeat, p: { view: View; legal: readonly Action[] }): boolean => {
    const win = guideWindow(beat, p.view, p.legal);
    if (!win) return false;
    open = win;
    keep = hooks.litSelectors(win.lit);
    progress = markGuideSeen(progress, beat);
    write();
    pushSoon();
    hooks.openWindow(win);
    hooks.bulb()?.setAttribute('aria-pressed', 'true');
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return true;
  };

  /**
   * The help key was tapped. Returns true when the guide answered it (a lesson opened, or the open
   * lesson closed); false means "do what the key always does" (Match Intel).
   */
  const tap = (): boolean => {
    if (open) { close(); return true; }
    const p = hooks.position();
    if (!p || !active()) return false;
    const t = guideTap({ fresh: fresh(), view: p.view, legal: p.legal, seen: seen() });
    return t.kind === 'window' ? openBeat(t.beat, p) : false;
  };

  // ---------- the key: "?" and brighter while new; one edge light per new action ----------
  let glyphFor: HTMLElement | null = null;
  const ensureGlyph = (bulb: HTMLElement) => {
    if (glyphFor === bulb && bulb.querySelector('.guide-q')) return;
    bulb.querySelector('.guide-q')?.remove();
    bulb.insertAdjacentHTML('beforeend', QUESTION_SVG);
    glyphFor = bulb;
  };
  let hintTimer = 0;
  const light = (bulb: HTMLElement) => {
    bulb.classList.remove('guide-hint');
    void bulb.offsetWidth; // restart the one light
    bulb.classList.add('guide-hint');
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => bulb.classList.remove('guide-hint'), GUIDE_HINT_MS);
  };

  /** Called on every render. Touches the page only when something changed. */
  function update() {
    const isFresh = fresh();
    if (root.classList.contains('futasaku-guide-fresh') !== isFresh) root.classList.toggle('futasaku-guide-fresh', isFresh);
    const bulb = hooks.bulb();
    // The key's NAME is the help module's (help.ts names it "How to play" while this class is on).
    if (bulb) ensureGlyph(bulb);
    if (!active()) { close(); return; }
    if (!isFresh) return;
    const p = hooks.position();
    if (!p || !bulb) return;
    const beat = guideHintBeat({ fresh: isFresh, view: p.view, legal: p.legal, hinted: hinted() });
    if (!beat) return;
    local = { ...local, hinted: [...local.hinted, beat] };
    writeLocal();
    light(bulb);
  }

  let lastSetting = hooks.setting();

  return {
    update,
    tap,
    /** The player made a move: an open lesson closes (whether or not it was the move it taught). */
    moved(_t: Action['t']) {
      if (open) close();
    },
    /** A real game started (not Blitz, guide on): counts towards the first games. */
    gameStarted() {
      if (!guideActive({ setting: hooks.setting(), blitz: hooks.blitz() })) return;
      progress = { ...progress, games: progress.games + 1 };
      write();
      joinSoon();
      pushSoon();
      update();
    },
    /** A game reached its end on this device. */
    gameFinished() {
      local = { ...local, finished: local.finished + 1 };
      writeLocal();
    },
    /** The Settings switch changed: turning it back on makes the player new again. */
    settingChanged() {
      const now = hooks.setting();
      if (now && !lastSetting) {
        local = { hinted: [], finished: local.finished, base: progress.games, reenabled: true };
        writeLocal();
      }
      lastSetting = now;
      update();
    },
    close,
    isOpen: () => !!open,
    progress: () => progress,
  };
};
