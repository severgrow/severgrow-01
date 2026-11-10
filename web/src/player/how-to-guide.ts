// THE IN-GAME GUIDE (owner, 2026-11-09; switch 2026-11-10). A new player learns inside a real game.
//
//   - "?" lives in the cockpit's CONTEXT key whenever that key has no real action (smart-cockpit.ts
//     draws it; a real move keeps the key).
//   - "HOW TO PLAY", a quiet text key above the cockpit's top row: a player's first games, and the
//     whole time the guide is on (it is then the off switch while the context key holds a move).
//   - Both are ONE SWITCH (owner, 2026-11-10: "once how to play is clicked, it'll show the windows
//     first and then highlight always until it's toggled off - make sure the button ? looks pressed
//     in"). While on: each kind of move opens its lesson window by itself the first time it is
//     possible, then the move to make stays lit, until the switch is pressed again.
//   - The LED invites ("TAP ? →") while the guide is off and something new is possible.
//
// The decisions live in logic/guide-watcher.ts (pure, tested). This module owns the label, the
// switch, its memory (this device + the account for what was seen) and the calls into the page.
// No timers or loops: the steady light is applied once per render, after the page has drawn.
import type { Action, View } from '../../../src/engine/index.js';
import {
  EMPTY_GUIDE_PROGRESS, guideActive, guideLedWord, guideStep, guideTap, guideWindow, markGuideSeen,
  mergeGuideProgress, nextGuideBeat, parseGuideProgress, showGuideLabel,
} from '../logic/guide-watcher.js';
import type { GuideBeat, GuideProgress, GuideWindow } from '../logic/guide-watcher.js';
import type { Lit } from '../lessons/lessons.js';
import type { KeyValue } from '../../../server/src/client.js';

export const GUIDE_STORAGE_KEY = 'severgrow.guide.v1';
/** The switch, on this device (separate from the account copy of what was seen). */
export const GUIDE_ON_KEY = 'severgrow.guide.on.v1';
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
/* ON: the switch reads as pressed in (a darker glass well, gold words), so pressing again is
   clearly how to turn the guide off. */
html #smart-panel > #futasaku-guide-label[aria-pressed='true'] { opacity:1; color:#ffe1a7; }
html #smart-panel > #futasaku-guide-label[aria-pressed='true'] > span {
  /* the well hugs the words; the 44px tap area around it stays transparent */
  padding:5px 8px 4px; border-radius:6px; background:rgb(6 7 8 / .6);
  box-shadow:inset 0 2px 4px rgb(0 0 0 / .6), inset 0 0 0 1px rgb(255 214 140 / .34);
}
/* The steady light on the move to make while the guide is on: one still gold outline, no motion,
   on whatever the move starts from (the Draw pile, the Bloom key, the playable cards). */
html.futasaku-guide-on [data-guide-lit] { outline:2px solid rgb(255 214 140 / .78); outline-offset:3px; border-radius:10px; }
html.futasaku-guide-on #hand [data-guide-lit] { outline-offset:2px; }
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
  /** The player has finished the lessons (the label then stays away). */
  lessonsDone(): boolean;
  /** Draw the window (the existing lesson glass, lit on the real board). */
  openWindow(win: GuideWindow): void;
  closeWindow(): void;
  /** The page elements a lit thing is drawn on (lessons/lesson-view.ts litTarget). */
  litSelectors(lit: Lit): string[];
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
  label.setAttribute('aria-pressed', 'false');
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
  let on = (() => { try { return hooks.storage?.get(GUIDE_ON_KEY) === '1'; } catch { return false; } })();
  const seen = () => new Set<string>(progress.seen);
  const active = (): boolean => !hooks.busy() && !!hooks.position() && guideActive({ setting: hooks.setting(), blitz: hooks.blitz() });
  const currentBeat = (): GuideBeat | null => {
    const p = hooks.position();
    return p && active() ? nextGuideBeat(p.view, p.legal, seen()) : null;
  };

  const close = () => {
    if (!open) return;
    open = null;
    hooks.closeWindow();
  };

  /** The steady light: which elements carry it now. Changed only when the lit thing changes. */
  let litNow: Element[] = [];
  let litKey = '';
  const light = (lit: Lit | null) => {
    const key = lit ? JSON.stringify(lit) : '';
    if (key === litKey && litNow.every((el) => el.isConnected)) return;
    for (const el of litNow) el.removeAttribute('data-guide-lit');
    litKey = key;
    litNow = lit ? hooks.litSelectors(lit).flatMap((sel) => [...document.querySelectorAll(sel)]) : [];
    for (const el of litNow) el.setAttribute('data-guide-lit', '');
  };

  const openBeat = (beat: GuideBeat, p: { view: View; legal: readonly Action[] }) => {
    const win = guideWindow(beat, p.view, p.legal);
    if (!win) return;
    open = win;
    progress = markGuideSeen(progress, beat);
    write();
    pushAccount();
    light(null); // the window lights its own target
    hooks.clearLedPrompt();
    hooks.openWindow(win);
  };

  const setOn = (next: boolean) => {
    on = next;
    try { hooks.storage?.set(GUIDE_ON_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    document.documentElement.classList.toggle('futasaku-guide-on', next);
    label.setAttribute('aria-pressed', String(next));
    if (!next) { close(); light(null); }
    hooks.clearLedPrompt();
    hooks.refreshCockpit();
    update();
  };

  /** "?" or the label was tapped: the switch. */
  const tap = () => {
    const t = guideTap({ active: active(), on });
    if (t.kind === 'none') return;
    setOn(t.kind === 'on');
  };
  label.addEventListener('click', tap);

  const place = () => {
    const panel = document.getElementById('smart-panel');
    if (panel && label.parentElement !== panel) panel.append(label);
  };

  /** After the page has drawn (once per render, coalesced): the window to open, or the light. */
  let paintQueued = false;
  const paint = () => {
    paintQueued = false;
    const p = hooks.position();
    if (!on || !active() || !p) { light(null); return; }
    if (open) { light(null); return; }
    const step = guideStep({ on, view: p.view, legal: p.legal, seen: seen() });
    if (step.kind === 'window') { openBeat(step.beat, p); return; }
    light(step.kind === 'glow' ? step.lit : null);
  };

  let wasOn = true;
  /** Called on every render: the label, the switch's look, and the light (after the draw). */
  function update() {
    place();
    const act = active();
    // Runs on every render: touch the page only when something changed.
    const hide = !act || !showGuideLabel({ active: act, gamesStarted: Math.max(1, progress.games), lessonsDone: hooks.lessonsDone(), on });
    if (label.hidden !== hide) label.hidden = hide;
    if (!act) {
      if (open) close();
      if (litNow.length) light(null);
      if (wasOn) hooks.clearLedPrompt(); // a guide turned off (Settings, a Blitz duel) never leaves its pointer up
    }
    wasOn = act;
    if (on && act && !paintQueued) { paintQueued = true; requestAnimationFrame(paint); }
  }
  document.documentElement.classList.toggle('futasaku-guide-on', on);
  label.setAttribute('aria-pressed', String(on));
  hooks.ledWord(() => guideLedWord({ active: active(), beat: currentBeat(), on }));

  return {
    update,
    tap,
    /** The context key may show "?" (read by the cockpit on each sync). */
    keyActive: active,
    /** The switch is on ("?" drawn pressed in). */
    isOn: () => on,
    /** A move was made: a window that taught it (or any move, for "how to win") closes. */
    moved(t: Action['t']) {
      if (open && open.closesOn.includes(t)) close();
      light(null); // the move changed the position: the next render lights the next move
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
