// Material pass 2, Part 7: the "Your turn" / "Bot's turn" pill on the page. The timing and
// what to show come from the pure state machine in logic/turnbanner.ts; this only draws it,
// one animation frame at a time while it is visible (no frames run while it is hidden).
import type { Player } from '../../../src/engine/index.js';
import { HIDDEN, bannerView, botMoved, showTurn, tick } from '../logic/turnbanner.js';
import type { BannerOpts, BannerState } from '../logic/turnbanner.js';

export class TurnPill {
  private s: BannerState = HIDDEN;
  private raf = 0;
  private last = 0;
  private label: HTMLElement;
  private dots: HTMLElement;

  constructor(
    private pill: HTMLElement,
    private wash: HTMLElement,
  ) {
    pill.innerHTML = '<span class="tp-mark" aria-hidden="true"></span><span class="tp-label"></span><span class="tp-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    this.label = pill.querySelector('.tp-label')!;
    this.dots = pill.querySelector('.tp-dots')!;
  }

  /** A new turn starts (the latest always wins). `label` overrides the text, e.g. "Your last turn". */
  show(player: Player, opts: BannerOpts, label?: string) {
    this.s = showTurn(this.s, player, opts);
    this.label.textContent = label ?? bannerView(this.s).label;
    this.draw();
    this.loop();
  }

  /** The bot's first move appeared: the thinking dots go. */
  botMoved() {
    this.s = botMoved(this.s);
    this.draw();
  }

  /** "Skip": end it at once. */
  skip() {
    this.s = HIDDEN;
    this.draw();
  }

  private loop() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const step = (now: number) => {
      this.s = tick(this.s, Math.min(100, now - this.last));
      this.last = now;
      this.draw();
      if (this.s.phase !== 'hidden') this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private draw() {
    const v = bannerView(this.s);
    const p = this.pill;
    p.hidden = !v.visible;
    p.className = `turn-pill ${v.marker === 'diamond' ? 'bot' : 'you'}${v.sweep ? ' sweep' : ''}${v.fadeOnly ? ' fade-only' : ''}`;
    p.style.opacity = String(v.opacity);
    p.style.transform = `translate(-50%, ${v.slide.toFixed(2)}px)`;
    this.dots.hidden = !(v.thinking && v.visible);
    this.wash.className = `edge-wash${v.wash ? ` ${v.wash}` : ''}`;
    this.wash.style.opacity = v.wash ? String(0.6 * v.opacity) : '0';
  }
}
