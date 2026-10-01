// The page's look as design tokens. Three palettes ("Soil", "Moss night", "Ink") share
// the same screen, shapes and colour roles; only colours and the background treatment
// change, so switching is instant. Pure data plus small colour helpers.
//
// Colour roles (the same in every palette):
//   you = mint, only for your tiles and veins;  bot = coral, only for the bot's.
//   gold = amber, only for gold hexes and their "2" badge.
//   accent = neutral warm cream for buttons, so they never compete with the pieces.
//   dew / ash / moss / ember = suit tints, only on cards in the hand (never the board).

export const THEME_IDS = ['soil', 'moss', 'ink'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'soil';

export const COLOR_TOKENS = [
  'bg', // page background
  'surface', // panels and sheets
  'card', // card faces
  'text', // main text (warm cream)
  'muted', // labels and hints
  'line', // hex outlines
  'hexFill', // empty hexes (shallow soil pockets)
  'rock', // rock hexes (cool blue-grey stone)
  'rockEdge', // light facets on rock
  'gold', // gold hexes (amber) and their badge
  'goldInk', // the "2" on the gold badge
  'you', // your tiles and veins (mint)
  'bot', // the bot's tiles and veins (coral)
  'youInk', // numbers printed on your tiles
  'botInk', // numbers printed on the bot's tiles
  'accent', // main buttons (neutral cream)
  'accentInk', // text on main buttons
  'danger', // weak-spot badges and warnings
  'dew', // suit tints (cards only)
  'ash',
  'moss',
  'ember',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const STYLE_TOKENS = [
  'font', // the one typeface
  'textWeight',
  'numberWeight', // scores and tile numbers
  'radius', // corner rounding of panels and buttons (px)
  'tileShape', // organic hexes in every palette
  'texture', // background texture
  'spores', // a few slow, faint drifting spores
  'boardGlow', // 0..1 soft glow under the board
  'vignette', // 0..1 darkening at the edges
  'veinWidth', // network line width (board units)
  'glow', // 0..1 glow on the networks
  'shadow', // 0..1 strength of soft shadows
  'motion', // 0..1 strength of movement (shake, pop sizes)
  'youMark', // a shape on your tiles (colour-blind safe)
  'botMark',
  'youFill', // fill pattern of your tiles
  'botFill',
  'soundBase', // base pitch (Hz) of the sound set
  'soundWave', // oscillator wave of the sound set
] as const;
export type StyleToken = (typeof STYLE_TOKENS)[number];

export type ThemeStyle = {
  font: string;
  textWeight: number;
  numberWeight: number;
  radius: number;
  tileShape: 'flat' | 'organic' | 'chunky';
  texture: 'none' | 'soil';
  spores: boolean;
  boardGlow: number;
  vignette: number;
  veinWidth: number;
  glow: number;
  shadow: number;
  motion: number;
  youMark: 'dot' | 'ring' | 'pip';
  botMark: 'box' | 'diamond' | 'tri';
  youFill: 'solid' | 'soft';
  botFill: 'hatch' | 'grain' | 'stripe';
  soundBase: number;
  soundWave: 'sine' | 'triangle' | 'square' | 'sawtooth';
};

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  colors: Record<ColorToken, string>;
  style: ThemeStyle;
};

// Shared by all three palettes: the players, gold and the suits keep their meaning.
const ROLES = {
  you: '#4df0b4',
  bot: '#ff6b4a',
  youInk: '#0b1a14',
  botInk: '#1e0d08',
  gold: '#f2b84b',
  goldInk: '#2a1c04',
  dew: '#a3d1eb',
  ash: '#bd9be8',
  moss: '#bfcf7c',
  ember: '#cd876f',
} as const;

const STYLE: ThemeStyle = {
  font: 'Alegreya Sans',
  textWeight: 500,
  numberWeight: 800,
  radius: 16,
  tileShape: 'organic',
  texture: 'none',
  spores: false,
  boardGlow: 0,
  vignette: 0,
  veinWidth: 2.4,
  glow: 1,
  shadow: 0,
  motion: 0.9,
  youMark: 'ring',
  botMark: 'diamond',
  youFill: 'soft',
  botFill: 'grain',
  soundBase: 262,
  soundWave: 'sine',
};

export const THEMES: Record<ThemeId, Theme> = {
  soil: {
    id: 'soil',
    name: 'Soil',
    description: 'Dark warm earth with a fine soil grain, a soft vignette and a few drifting spores.',
    colors: {
      ...ROLES,
      bg: '#1b1912',
      surface: '#28251b',
      card: '#2c291e',
      text: '#f0e8d2',
      muted: '#b5ab90',
      line: '#4b4434',
      hexFill: '#26231a',
      rock: '#647383',
      rockEdge: '#a9b6c4',
      accent: '#efe5cb',
      accentInk: '#1b1912',
      danger: '#fff4dc',
    },
    style: { ...STYLE, texture: 'soil', spores: true, vignette: 0.55, shadow: 0.4 },
  },
  moss: {
    id: 'moss',
    name: 'Moss night',
    description: 'Cool green-black with a soft glow under the board.',
    colors: {
      ...ROLES,
      bg: '#0d1613',
      surface: '#16221d',
      card: '#1a2722',
      text: '#ede7d4',
      muted: '#a8b1a2',
      line: '#2f3f37',
      hexFill: '#15211c',
      rock: '#5c6b7b',
      rockEdge: '#a3b1c0',
      accent: '#ebe3cc',
      accentInk: '#0d1613',
      danger: '#fff4dc',
    },
    style: { ...STYLE, boardGlow: 0.7, vignette: 0.35 },
  },
  ink: {
    id: 'ink',
    name: 'Ink',
    description: 'Near-black paper and flat shapes. No texture, nothing extra.',
    colors: {
      ...ROLES,
      bg: '#0d0e11',
      surface: '#18191d',
      card: '#1c1d21',
      text: '#ede9df',
      muted: '#a39f97',
      line: '#35363c',
      hexFill: '#17181c',
      rock: '#58626e',
      rockEdge: '#9ea8b4',
      accent: '#ebe6da',
      accentInk: '#0d0e11',
      danger: '#fff4dc',
    },
    style: { ...STYLE, glow: 0.6 },
  },
};

export const themeOf = (id: string | undefined): Theme => THEMES[(THEME_IDS as readonly string[]).includes(id ?? '') ? (id as ThemeId) : DEFAULT_THEME];

// ---------- colour helpers ----------

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** pct percent of colour a over colour b (plain sRGB mix, like CSS color-mix in srgb). */
export const mixHex = (a: string, b: string, pct: number): string => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => (v * pct + y[i]! * (100 - pct)) / 100));
};

export const resolveColors = (t: Theme): Record<ColorToken, string> => ({ ...t.colors });

const luminance = (hex: string) => {
  const lin = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
};

/** WCAG contrast ratio between two colours (1 to 21). */
export const contrast = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

/** CSS custom properties for a theme: --c-<token> colours plus style values. */
export const cssVars = (t: Theme): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of COLOR_TOKENS) out[`--c-${k}`] = t.colors[k];
  const s = t.style;
  out['--font'] = `'${s.font}', system-ui, sans-serif`;
  out['--w-text'] = String(s.textWeight);
  out['--w-num'] = String(s.numberWeight);
  out['--radius'] = `${s.radius}px`;
  out['--shadow'] = String(s.shadow);
  out['--motion'] = String(s.motion);
  out['--glow'] = String(s.glow);
  out['--board-glow'] = String(s.boardGlow);
  out['--vignette'] = String(s.vignette);
  return out;
};
