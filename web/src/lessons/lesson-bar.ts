// THE LESSON BAR — the title and the ONE action, in the game's top row.
//
// A lesson used to spend a whole row of the glass window on its title and a big NEXT button, plus
// another row on "LEVEL n". Both now live in the HUD row the game already pays for:
//
//     [menu]        TITLE (LED)                       [NEXT] [logo]
//
// The title is centred in the span the controls actually leave free (menu → logo), never in the
// viewport, so a wider logo or a longer label cannot pull it off centre. NEXT is a real 44 px
// target pinned to the right end of that span, and it never displaces the title: the LED is scaled
// to the room left between them.
//
// Pure state (what the bar says and whether NEXT shows) is separated from the DOM so the tests can
// pin every branch without a browser.
import { drawLedCells, ledMessageWidth } from '../player/led-cells.js';

export type LessonBarLabels = { next: string; showMe: string; restart: string };

export type LessonBarInput = {
  /** The level's name while the short stage intro runs; null after it. */
  stageName: string | null;
  /** The lesson cannot finish any more: the bar offers RESTART LEVEL instead of a title. */
  stuck: boolean;
  /** What the window says now (already faded by the mastery tier), or null when it is silent. */
  beat: { title: string; explain?: boolean } | null;
  /** A wrong tap's one-word answer; it owns the display for its moment. */
  answer: string | null;
  /** The safety net has passed 6 s: the player may ask to be shown. */
  showMe: boolean;
  /** The reason line, for the screen reader (the visible copy is in the window below). */
  line: string | null;
  labels: LessonBarLabels;
};

export type LessonBarState = {
  /** The LED text, or null when the bar should be invisible. */
  title: string | null;
  /** What the screen reader hears: the title and the one line together, as one utterance. */
  spoken: string;
  next: { show: boolean; label: string; blink: boolean };
};

/** What the top row shows right now. No DOM, no clock: every branch is a function of its input. */
export const lessonBarFor = (input: LessonBarInput): LessonBarState => {
  const { stageName, stuck, beat, answer, showMe, line, labels } = input;
  const hidden = { show: false, label: '', blink: false };
  if (stageName) return { title: stageName.toUpperCase(), spoken: stageName.toUpperCase(), next: hidden };
  if (stuck) return { title: null, spoken: line ?? labels.restart, next: { show: true, label: labels.restart, blink: false } };
  const title = answer ? answer.toUpperCase() : beat?.title ?? null;
  const spoken = [title, line].filter(Boolean).join('. ');
  const next = beat?.explain
    ? { show: true, label: labels.next, blink: true }
    : showMe && beat
      ? { show: true, label: labels.showMe, blink: false }
      : hidden;
  return { title, spoken, next };
};

/** How wide the LED may be: the span minus a symmetric reserve for the button, if it is shown. */
export const lessonBarRoom = (span: number, nextWidth: number, nextShown: boolean, gap = 8): number =>
  Math.max(60, Math.round(span - (nextShown ? 2 * (nextWidth + gap) : 0)));

export type LessonBar = {
  paint: (state: LessonBarState) => void;
  /** The button's one handler: what NEXT does changes with the step. */
  onNext: (fn: () => void) => void;
  hide: () => void;
};

const CSS = `
/* One gutter for the whole column: the bar, the window and the map share the same left and right
   edge (the board's own 2px), so nothing reads as "off by a few pixels". Scoped to a lesson. */
html[data-lesson] #game > .hud { padding-left: 2px; padding-right: 2px; }
#lesson-hud {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  pointer-events: none;
}
#lesson-hud[hidden] { display: none !important; }
#lesson-hud .lesson-hud-title {
  grid-column: 1 / -1;
  grid-row: 1;
  min-width: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
#lesson-hud .lesson-hud-cells {
  display: block;
  max-width: 100%;
  height: auto;
}
#lesson-hud .lesson-hud-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
#lesson-next {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  pointer-events: auto;
  box-sizing: border-box;
  height: 44px;
  min-width: 44px;
  padding: 0 12px;
  border: 1px solid rgba(214, 204, 177, .28);
  border-radius: 10px;
  background: rgba(233, 216, 173, .14);
  color: #f0e9dc;
  font: 400 11px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .06em;
  white-space: nowrap;
  cursor: pointer;
}
#lesson-next[hidden] { display: none !important; }
#lesson-next:focus-visible { outline: 2px solid #e8ddc9; outline-offset: 1px; }
#lesson-next.blink { animation: lesson-next-blink 1.15s ease-in-out infinite; }
@keyframes lesson-next-blink {
  0%, 100% { box-shadow: 0 0 0 0 rgba(233, 216, 173, 0); }
  50% { box-shadow: 0 0 0 3px rgba(233, 216, 173, .32); }
}
.large-text #lesson-next { font-size: 12px; }
.reduce-motion #lesson-next.blink,
.large-text.reduce-motion #lesson-next.blink { animation: none !important; }
@media (prefers-reduced-motion: reduce) { #lesson-next.blink { animation: none !important; } }
`;

/** Reflect the state into the top row. No-ops when nothing changed (the game repaints often). */
export const mountLessonBar = (): LessonBar => {
  let style = document.getElementById('lesson-bar-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'lesson-bar-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.getElementById('lesson-hud');
  const canvas = root?.querySelector<HTMLCanvasElement>('.lesson-hud-cells') ?? null;
  const sr = root?.querySelector<HTMLElement>('.lesson-hud-sr') ?? null;
  const next = document.getElementById('lesson-next') as HTMLButtonElement | null;
  let handler: () => void = () => {};
  let last = '';
  let lastState: LessonBarState | null = null;
  next?.addEventListener('click', (e) => { e.preventDefault(); handler(); });

  const paint = (state: LessonBarState) => {
    if (!root || !canvas || !next) return;
    lastState = state;
    const visible = !!state.title || state.next.show;
    root.hidden = !visible;
    if (!visible) { last = ''; return; }
    if (sr) sr.textContent = state.spoken;
    next.hidden = !state.next.show;
    next.textContent = state.next.label;
    next.classList.toggle('blink', state.next.blink);
    // The button's width depends on the webfont: read it every time and repaint when it moves,
    // or a late font swap would leave the LED sized for the fallback face.
    const span = root.clientWidth || root.getBoundingClientRect().width;
    const buttonW = state.next.show ? next.offsetWidth : 0;
    const key = JSON.stringify([state.title, state.spoken, state.next, span, buttonW, Math.round(root.getBoundingClientRect().height)]);
    if (key === last) return;
    last = key;
    const text = (state.title ?? '').toUpperCase();
    const titleEl = root.querySelector<HTMLElement>('.lesson-hud-title');
    if (!text) {
      if (titleEl) titleEl.style.paddingRight = '';
      canvas.width = 0; canvas.height = 0;
      canvas.style.width = '0px'; canvas.style.height = '0px';
      return;
    }
    const natural = ledMessageWidth(text) * 1.1;
    // The LED shrinks to the room the button leaves, so a long title can never push NEXT away.
    // The smallest legible LED (the cells' own 0.5 floor) still has to fit; when it does not (a
    // 320px phone with a wide label) the title steps left to sit beside the button instead of
    // being covered by it. At 390px and up the symmetric reserve always fits, so the title is
    // exactly centred in the span.
    const gap = 8;
    const smallest = ledMessageWidth(text) * 0.5;
    let room = lessonBarRoom(span, buttonW, state.next.show);
    let shift = 0;
    // The reserve already contains the two gaps: a title may use them before it has to move.
    if (state.next.show && smallest > room + 2 * gap) {
      room = Math.max(40, span - (buttonW + gap));
      shift = Math.max(0, 2 * (buttonW + gap) + room - span);
    }
    if (titleEl) titleEl.style.paddingRight = shift ? `${shift}px` : '';
    const scale = Math.min(1.1, (room / natural) * 1.1);
    drawLedCells(canvas, text, false, 'amber', scale);
    canvas.style.maxWidth = '100%';
  };

  // The webfont (and the label itself) can change the button's width after the first paint:
  // re-fit the LED when either box actually changes size, never on a guessed delay.
  if (typeof ResizeObserver !== 'undefined') {
    const again = () => { if (lastState) { last = ''; paint(lastState); } };
    if (next) new ResizeObserver(again).observe(next);
    if (root) new ResizeObserver(again).observe(root);
  }

  return {
    paint,
    onNext: (fn) => { handler = fn; },
    hide: () => { last = ''; lastState = null; if (root) root.hidden = true; },
  };
};
