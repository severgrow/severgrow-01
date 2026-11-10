// THE IN-GAME GUIDE (owner, 2026-11-09). A brand-new player who opens a friend's duel link learns
// inside that real game: nothing opens by itself, and their friend never waits.
//
//   - "?" lives in the cockpit's CONTEXT key whenever that key has no real action (smart-cockpit.ts
//     draws it; a real context action always wins).
//   - "HOW TO PLAY", a quiet text key above the cockpit's top row, in a player's first games only.
//   - The LED points at "?" ("TAP ? →") instead of its idle blink while a new beat is possible.
//   - Tapping either opens the existing lesson window for the beat possible right now, lit on the
//     real board; with nothing new it lights the next move; on their turn it opens Match Intel.
//
// The decisions live in logic/guide-watcher.ts (pure, tested). This module only owns its label,
// its memory (this device + the account) and the calls into the page's hooks. No timers, no loops.
import type { Action, View } from '../../../src/engine/index.js';
import {
  EMPTY_GUIDE_PROGRESS, guideActive, guideLedWord, guideTap, guideWindow, markGuideSeen,
  mergeGuideProgress, nextGuideBeat, parseGuideProgress, showGuideLabel,
} from '../logic/guide-watcher.js';
import type { GuideBeat, GuideProgress, GuideWindow } from '../logic/guide-watcher.js';
import type { KeyValue } from '../../../server/src/client.js';

export const GUIDE_STORAGE_KEY = 'severgrow.guide.v1';
export const GUIDE_LABEL_TEXT = 'HOW TO PLAY';
export const GUIDE_KEY_LABEL = 'How to play';

const CSS = `
/* The label is part of the cockpit: the same type and ivory as its keys, no outline, a 44px target.
   It sits over the display (the top row's first two cells) so it never meets the chat key that
   online duels place over the context key. Its bottom edge is one key-gap above the top row, the
   same gap the keys keep between themselves. */
html #smart-panel > #futasaku-guide-label {
  position:absolute; white-space:nowrap; text-align:left; left:0; bottom:calc(100% + var(--control-gap,4px));
  width:calc(2 * var(--control-size,44px) + var(--control-gap,4px)); height:var(--control-size,44px);
  min-height:44px; margin:0; padding:0; border:0; background:none; box-shadow:none; border-radius:10px;
  display:flex; align-items:flex-end; justify-content:flex-start;
  font:500 11px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.16em; text-transform:uppercase;
  color:var(--control-ivory,#f5edda); opacity:.56; cursor:pointer; pointer-events:auto; touch-action:manipulation;
  -webkit-tap-highlight-color:transparent; z-index:2;
}
html #smart-panel > #futasaku-guide-label > span { display:block; line-height:1; padding:0 0 0 2px; }
html #smart-panel > #futasaku-guide-label:is(:hover,[aria-expanded='true']) { opacity:.9; }
html #smart-panel > #futasaku-guide-label:active { opacity:1; }
html #smart-panel > #futasaku-guide-label:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; opacity:1; }
html #smart-panel > #futasaku-guide-label[hidden] { display:none; }
@media (prefers-reduced-motion:no-preference) { html #smart-panel > #futasaku-guide-label { transition:opacity 160ms ease; } }
`;

export type HowToGuideHooks = {
  /** The switch in Settings. */
  setting(): boolean;
  /** A Blitz duel is on screen: the guide is fully off. */
  blitz(): boolean;
  /** Something else owns the teaching right now (the Tutorial, a lesson, the campaign's own window). */
  busy(): boolean;
  /** The player's view and the moves legal right now, or null when no game is on screen. */
  position(): { view: View; legal: readonly Action[] } | null;
  /** How many Tips Match Intel has for this position. */
  tips(): number;
  /** The player has finished the lessons (the label then stays away). */
  lessonsDone(): boolean;
  /** Draw the window (the existing lesson glass, lit on the real board). */
  openWindow(win: GuideWindow): void;
  closeWindow(): void;
  /** Light the next move, as the idle re-prompt does. */
  prompt(): void;
  openIntel(tab: 'tips' | 'rules'): void;
  /** The cockpit's LED: install / clear the guide's idle word. */
  ledWord(fn: (() => string | null) | null): void;
  clearLedPrompt(): void;
  /** Re-draw the cockpit (its context key reads `keyActive`). */
  refreshCockpit(): void;
  storage: KeyValue | null;
  /** The account copy (signed-in players), or null when there is no account or no server support. */
  account: {
    load(): Promise<GuideProgress | null>;
    save(p: GuideProgress): Promise<GuideProgress | null>;
  } | null;
};

export type HowToGuide = ReturnType<typeof mountHowToGuide>;

export const mountHowToGuide = (hooks: HowToGuideHooks) => {
  if (!document.getElementById('futasaku-guide-style')) {
    const style = document.createElement('style');
    style.id = 'futasaku-guide-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const label = document.createElement('button');
  label.id = 'futasaku-guide-label';
  label.type = 'button';
  label.hidden = true;
  label.setAttribute('aria-label', GUIDE_KEY_LABEL);
  label.setAttribute('aria-expanded', 'false');
  const text = document.createElement('span');
  text.textContent = GUIDE_LABEL_TEXT;
  label.append(text);

  const read = (): GuideProgress => {
    try { return parseGuideProgress(JSON.parse(hooks.storage?.get(GUIDE_STORAGE_KEY) ?? 'null')); } catch { return EMPTY_GUIDE_PROGRESS; }
  };
  let progress = read();
  const write = () => { try { hooks.storage?.set(GUIDE_STORAGE_KEY, JSON.stringify(progress)); } catch { /* private mode */ } };
  /** One account write at a time, and only when something changed. */
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
  // Join the account's copy once: a player who opened windows on another phone sees them as seen.
  void hooks.account?.load().then((remote) => {
    if (!remote) { if (progress.seen.length || progress.games) pushAccount(); return; }
    const joined = mergeGuideProgress(progress, parseGuideProgress(remote));
    const changed = joined.seen.length !== progress.seen.length || joined.games !== progress.games;
    progress = joined; write();
    if (changed || joined.seen.length !== remote.seen.length || joined.games !== remote.games) pushAccount();
    update();
  }, () => undefined);

  let open: GuideWindow | null = null;
  const seen = () => new Set<string>(progress.seen);
  const active = (): boolean => !hooks.busy() && !!hooks.position() && guideActive({ setting: hooks.setting(), blitz: hooks.blitz() });
  const currentBeat = (): GuideBeat | null => {
    const p = hooks.position();
    return p && active() ? nextGuideBeat(p.view, p.legal, seen()) : null;
  };

  const close = () => {
    if (!open) return;
    open = null;
    label.setAttribute('aria-expanded', 'false');
    hooks.closeWindow();
  };

  /** "?" or the label was tapped. */
  const tap = () => {
    if (open) { close(); return; }
    const p = hooks.position();
    if (!p) return;
    const t = guideTap({ active: active(), view: p.view, legal: p.legal, seen: seen(), tips: hooks.tips() });
    if (t.kind === 'none') return;
    if (t.kind === 'intel') { hooks.openIntel(t.tab); return; }
    if (t.kind === 'glow') { hooks.prompt(); return; }
    const win = guideWindow(t.beat, p.view, p.legal);
    if (!win) return;
    open = win;
    label.setAttribute('aria-expanded', 'true');
    progress = markGuideSeen(progress, t.beat);
    write();
    pushAccount();
    hooks.clearLedPrompt();
    hooks.openWindow(win);
    hooks.refreshCockpit();
  };
  label.addEventListener('click', tap);

  const place = () => {
    const panel = document.getElementById('smart-panel');
    if (panel && label.parentElement !== panel) panel.append(label);
  };

  let wasOn = true;
  /** Called on every render: the label, the LED's word, and a window that no longer applies. */
  function update() {
    place();
    const on = active();
    // Runs on every render: touch the page only when something changed.
    const hide = !on || !showGuideLabel({ active: on, gamesStarted: Math.max(1, progress.games), lessonsDone: hooks.lessonsDone() });
    if (label.hidden !== hide) label.hidden = hide;
    if (!on) {
      if (open) close();
      if (wasOn) hooks.clearLedPrompt(); // a guide turned off (Settings, a Blitz duel) never leaves its pointer up
    }
    wasOn = on;
  }
  hooks.ledWord(() => guideLedWord({ active: active(), beat: currentBeat() }));

  return {
    update,
    tap,
    /** The context key may show "?" (read by the cockpit on each sync). */
    keyActive: active,
    /** A move was made: a window that taught it (or any move, for "how to win") closes. */
    moved(t: Action['t']) {
      if (open && open.closesOn.includes(t)) close();
    },
    /** A real game started (not Blitz, guide on): counts towards the label's first games. */
    gameStarted() {
      if (!guideActive({ setting: hooks.setting(), blitz: hooks.blitz() })) return;
      progress = { ...progress, games: progress.games + 1 };
      write();
      pushAccount();
      update();
    },
    close,
    isOpen: () => !!open,
    progress: () => progress,
  };
};
