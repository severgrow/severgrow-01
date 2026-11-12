// THE PHONE FRAME: the real game, in an iframe at a real phone size, so the art is judged in the
// game's own screen (cockpit, hand, piles, stars) with the game's own layout rules for that size.
// It runs as `../?artlab=1&seed=N`: its own storage, no server (web/src/channel.ts IS_ART_FRAME).
// The lab hides the game's board and lays the skinned board exactly over it (board-overlay.ts).
import type { Action, Player, State } from '../../../src/engine/index.js';
import { rawSet } from './raw-storage.js';

export type PhoneSize = { id: string; label: string; w: number; h: number };
export const PHONES: readonly PhoneSize[] = [
  { id: 'small', label: 'Small phone · 375×667', w: 375, h: 667 },
  { id: 'phone', label: 'Phone · 390×844', w: 390, h: 844 },
  { id: 'big', label: 'Big phone · 430×932', w: 430, h: 932 },
];

type Hook = { state(): State | null; busy(): boolean; playFor(a: Action, who: Player): boolean; legal(): Action[] };

export class PhoneFrame {
  readonly iframe = document.createElement('iframe');
  private ready: Promise<void> = Promise.resolve();
  private css: HTMLStyleElement | null = null;
  private extraCss = '';

  constructor(readonly host: HTMLElement) {
    this.iframe.className = 'phone-screen';
    this.iframe.title = 'The game at phone size';
    this.iframe.setAttribute('scrolling', 'no');
    host.append(this.iframe);
  }

  get win(): (Window & { __severgrow?: Hook }) | null { return this.iframe.contentWindow as never; }
  get doc(): Document | null { try { return this.iframe.contentDocument; } catch { return null; } }
  hook(): Hook | null { return this.win?.__severgrow ?? null; }

  /** Starts the real game at this seed (and waits until its first turn is on screen). */
  load(seed: number, size: PhoneSize, reduceMotion: boolean): Promise<void> {
    this.iframe.width = String(size.w);
    this.iframe.height = String(size.h);
    this.iframe.style.width = `${size.w}px`;
    this.iframe.style.height = `${size.h}px`;
    // the frame's settings, under its own storage prefix: quiet, no tutorial, the lab's motion
    rawSet('futa05-art:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, vibration: false, coach: false, autoSkip: false, reduceMotion }));
    this.css = null;
    this.ready = new Promise<void>((ok) => {
      const started = performance.now();
      const wait = () => {
        const h = this.hook(), d = this.doc;
        if (h?.state?.() && d?.getElementById('deck')?.classList.contains('ready') && !h.busy()) { this.style(); return ok(); }
        if (performance.now() - started > 25_000) return ok();
        setTimeout(wait, 120);
      };
      this.iframe.onload = () => wait();
    });
    this.iframe.src = `../?artlab=1&seed=${seed}`;
    return this.ready;
  }
  whenReady() { return this.ready; }

  /** The lab's styles inside the game page: the game's own board hidden, card art swapped. */
  setCss(css: string) { this.extraCss = css; this.style(); }
  private style() {
    const d = this.doc;
    if (!d?.head) return;
    if (!this.css || !this.css.isConnected) {
      this.css = d.createElement('style');
      this.css.id = 'art-lab-frame-css';
      d.head.append(this.css);
    }
    this.css.textContent = `#board-game{opacity:0 !important}\n${this.extraCss}`;
  }

  /** The game board's box in the frame, with its drawing's viewBox and fit. */
  board(): { x: number; y: number; w: number; h: number; viewBox: string; par: string } | null {
    const svg = this.doc?.getElementById('board');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, viewBox: svg.getAttribute('viewBox') ?? '', par: svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet' };
  }
  orient(): 'flat' | 'pointy' { return this.doc?.documentElement.dataset.orient === 'pointy' ? 'pointy' : 'flat'; }
  state(): State | null { return this.hook()?.state() ?? null; }
}
