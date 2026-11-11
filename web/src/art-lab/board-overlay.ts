// THE SKINNED BOARD IN THE REAL SCREEN. The lab's art (uploads held as blob: URLs) is handed to the
// skin system as a skin root, and the game's own SkinBoardView draws the generator's position inside
// the phone frame: it takes the game board's place (id="board", so the game's own CSS sizes and
// styles it), while the game's board stays hidden underneath.
import type { State, Tile } from '../../../src/engine/index.js';
import { NO_OVERLAY } from '../ui/board.js';
import type { Overlay } from '../ui/board.js';
import { createEffects } from '../ui/effects.js';
import { forgetSkinFiles, provideSkinFiles } from '../ui/skin/assets.js';
import { SkinBoardView } from '../ui/skin/SkinBoardView.js';
import { SKIN_CSS } from '../ui/skin/skin-css.js';
import type { SkinDef, Tier } from '../ui/skin/types.js';
import { homeRotation, setOrient, setRotation } from '../logic/orient.js';
import { materialLook } from '../logic/materials.js';
import { THEMES } from '../logic/themes.js';
import type { PhoneFrame } from './frame.js';
import { skinOf, tierFiles } from './pack.js';
import type { LabState, SystemFiles } from './pack.js';
import { TIERS } from './slots.js';

const typeOf = (path: string) => (path.endsWith('.json') ? 'application/json' : path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp');

let seq = 0;

/** The pack's tier folders as an in-memory skin root (blob: URLs); `release` frees them. */
export const memorySkin = (state: LabState, system: SystemFiles) => {
  const root = `art-lab-${++seq}`;
  const files = tierFiles(state, system);
  const urls = {} as Record<Tier, Map<string, string>>;
  const byPath = new Map<string, Set<string>>();
  for (const t of TIERS) {
    urls[t] = new Map();
    for (const [p, d] of files[t]) {
      const u = URL.createObjectURL(new Blob([d as Uint8Array<ArrayBuffer>], { type: typeOf(p) }));
      urls[t].set(p, u);
      (byPath.get(p) ?? byPath.set(p, new Set()).get(p)!).add(u);
    }
  }
  provideSkinFiles(root, urls);
  const skin: SkinDef = skinOf(state, root);
  return {
    skin,
    /** blob: URLs of a pack path (both tiers), so the lab can point at where a slot appears */
    urlsOf: (path: string) => [...(byPath.get(path) ?? [])],
    release: () => {
      forgetSkinFiles(root);
      for (const t of TIERS) for (const u of urls[t].values()) URL.revokeObjectURL(u);
    },
  };
};

export type Scar = Overlay['scars'][number];

/** The tiles lost between two positions (what a Bomb, Blast or cut leaves on the ground). */
export const lostTiles = (before: Record<string, Tile | null>, after: Record<string, Tile | null>) =>
  Object.keys(before).filter((k) => before[k] && !after[k] && !before[k]!.root);

export class BoardOverlay {
  view: SkinBoardView | null = null;
  private svg: SVGSVGElement | null = null;
  private memory: ReturnType<typeof memorySkin> | null = null;
  private key = '';
  private watch: MutationObserver | null = null;

  constructor(private frame: PhoneFrame) {}

  /** Draws `state` with this art in the frame; rebuilds the board only when the art or the board shape changed. */
  draw(art: LabState, system: SystemFiles, artRev: number, state: State, scars: Scar[], reduceMotion: boolean, fresh: string[] = []) {
    const d = this.frame.doc;
    const game = d?.getElementById('board-game') ?? d?.getElementById('board');
    if (!d || !game) return;
    if (game.id === 'board') {
      game.id = 'board-game';
      game.setAttribute('aria-hidden', 'true');
    }
    if (!d.getElementById('art-lab-skin-css')) {
      const st = d.createElement('style');
      st.id = 'art-lab-skin-css';
      st.textContent = `${SKIN_CSS}\n#board-game{position:absolute !important;inset:0;opacity:0 !important;pointer-events:none}`;
      d.head.append(st);
    }
    const shape = `${artRev}|${state.config.boardRadius}|${this.frame.orient()}|${reduceMotion}`;
    if (shape !== this.key || !this.svg?.isConnected) {
      this.key = shape;
      this.svg?.remove();
      this.memory?.release();
      this.memory = memorySkin(art, system);
      // the lab draws in the frame's orientation, with the player's home at the bottom (as the game does)
      const orient = this.frame.orient();
      setOrient(orient);
      setRotation(homeRotation(orient, state.config, 0));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'board';
      svg.setAttribute('class', game.getAttribute('class') ?? 'board');
      svg.setAttribute('preserveAspectRatio', game.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'The board, drawn with the art pack');
      game.after(svg);
      this.svg = svg as SVGSVGElement;
      this.view = new SkinBoardView(this.svg, { tap: () => {}, inspect: () => {} }, this.memory.skin, { full: true });
      this.view.setup(state.config, state.terrain, THEMES.soil.style, materialLook('soil', 'normal', reduceMotion), 'soil');
      // the game's layout frames its board (room for the hand below): use the same window onto it
      const follow = () => {
        for (const a of ['viewBox', 'preserveAspectRatio']) { const v = game.getAttribute(a); if (v && this.svg?.getAttribute(a) !== v) this.svg?.setAttribute(a, v); }
      };
      this.watch?.disconnect();
      this.watch = new MutationObserver(follow);
      this.watch.observe(game, { attributes: true, attributeFilter: ['viewBox', 'preserveAspectRatio'] });
      if (state.config.boardRadius === 3) follow();
    }
    this.view!.render(state.board, { ...NO_OVERLAY, scars, fresh });
  }

  /** The game's own board effects, on the skinned board (flash, sparks, cut flash, shake). */
  effects(reduceMotion: boolean) {
    return this.view ? { fx: createEffects(this.view, () => 1, () => (reduceMotion ? 0 : 1)), view: this.view } : null;
  }

  /** Every place a picture of this pack path is drawn right now (to point at a slot on the board). */
  where(path: string): Element[] {
    if (!this.svg || !this.memory) return [];
    const urls = new Set(this.memory.urlsOf(path));
    return [...this.svg.querySelectorAll('image')].filter((i) => urls.has(i.getAttribute('href') ?? ''));
  }

  tier(): string { return this.svg?.dataset.tier ?? ''; }
}
