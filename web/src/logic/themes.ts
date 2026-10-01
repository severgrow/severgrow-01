// The three visual themes as design tokens. Every colour on the page comes from a
// theme's palette (at most 5 colours) or a mix of two palette colours, so switching
// the theme changes the whole look at once. Pure data plus small colour helpers.

export const THEME_IDS = ['ink', 'nature', 'tabletop'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const COLOR_TOKENS = [
  'bg', // page background
  'surface', // panels, sheets, cards' backs
  'text', // main text
  'muted', // labels and hints
  'line', // hex outlines
  'hexFill', // empty hexes
  'rock', // rock hexes
  'gold', // gold (rich) hexes
  'you', // your tiles and veins
  'bot', // the bot's tiles and veins
  'youInk', // numbers printed on your tiles
  'botInk', // numbers printed on the bot's tiles
  'accent', // main buttons
  'accentInk', // text on main buttons
  'danger', // weak spots and warnings
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** A palette index, or a mix: `pct` percent of palette colour a over palette colour b. */
export type ColorRef = number | { mix: [a: number, b: number, pct: number] };

export const STYLE_TOKENS = [
  'font', // the one typeface
  'textWeight',
  'numberWeight', // scores and tile numbers
  'radius', // corner rounding of panels and buttons (px)
  'tileShape', // flat hexes, organic hexes or chunky pieces
  'texture', // background texture
  'veinWidth', // network line width (board units)
  'glow', // 0..1: only "ink" glows, and only the network
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
  texture: 'none' | 'soil' | 'wood';
  veinWidth: number;
  glow: number;
  shadow: number;
  motion: number;
  youMark: 'dot' | 'ring' | 'pip';
  botMark: 'bar' | 'diamond' | 'cross';
  youFill: 'solid' | 'soft';
  botFill: 'hatch' | 'grain' | 'stripe';
  soundBase: number;
  soundWave: 'sine' | 'triangle' | 'square' | 'sawtooth';
};

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  palette: string[];
  colors: Record<ColorToken, ColorRef>;
  style: ThemeStyle;
};

const mix = (a: number, b: number, pct: number): ColorRef => ({ mix: [a, b, pct] });

export const THEMES: Record<ThemeId, Theme> = {
  ink: {
    id: 'ink',
    name: 'Ink and glow',
    description: 'Near-black paper, flat bold shapes, and one glowing colour for your network.',
    // paper, ink, glow (you), signal (bot), gold
    palette: ['#0d0e11', '#edeae2', '#4df0b4', '#ff6b4a', '#f2c14e'],
    colors: {
      bg: 0,
      surface: mix(1, 0, 8),
      text: 1,
      muted: mix(1, 0, 66),
      line: mix(1, 0, 20),
      hexFill: mix(1, 0, 6),
      rock: mix(1, 0, 28),
      gold: 4,
      you: 2,
      bot: 3,
      youInk: 0,
      botInk: 0,
      accent: 2,
      accentInk: 0,
      danger: 3,
    },
    style: {
      font: 'Space Grotesk',
      textWeight: 500,
      numberWeight: 700,
      radius: 6,
      tileShape: 'flat',
      texture: 'none',
      veinWidth: 3.2,
      glow: 1,
      shadow: 0,
      motion: 0.8,
      youMark: 'dot',
      botMark: 'bar',
      youFill: 'solid',
      botFill: 'hatch',
      soundBase: 330,
      soundWave: 'triangle',
    },
  },
  nature: {
    id: 'nature',
    name: 'Macro nature',
    description: 'Dark soil up close: soft organic tiles joined by fine living veins.',
    // soil, bone, lichen (you), rust (bot), amber
    palette: ['#1a120c', '#f0e2c4', '#86d0bd', '#e0703f', '#e3b04b'],
    colors: {
      bg: 0,
      surface: mix(1, 0, 10),
      text: 1,
      muted: mix(1, 0, 68),
      line: mix(1, 0, 16),
      hexFill: mix(1, 0, 8),
      rock: mix(1, 0, 30),
      gold: 4,
      you: 2,
      bot: 3,
      youInk: 0,
      botInk: 0,
      accent: 4,
      accentInk: 0,
      danger: 3,
    },
    style: {
      font: 'Fraunces',
      textWeight: 400,
      numberWeight: 700,
      radius: 16,
      tileShape: 'organic',
      texture: 'soil',
      veinWidth: 1.6,
      glow: 0,
      shadow: 0.5,
      motion: 1,
      youMark: 'ring',
      botMark: 'diamond',
      youFill: 'soft',
      botFill: 'grain',
      soundBase: 262,
      soundWave: 'sine',
    },
  },
  tabletop: {
    id: 'tabletop',
    name: 'Tabletop',
    description: 'A board game on a dark wooden table: chunky pieces, printed cards, lamp light.',
    // walnut, parchment, enamel blue (you), lacquer red (bot), brass
    palette: ['#24160c', '#f4e7cf', '#6aa3e0', '#e0604a', '#d8a23c'],
    colors: {
      bg: 0,
      surface: mix(1, 0, 12),
      text: 1,
      muted: mix(1, 0, 70),
      line: mix(1, 0, 24),
      hexFill: mix(1, 0, 14),
      rock: mix(1, 0, 40),
      gold: 4,
      you: 2,
      bot: 3,
      youInk: 0,
      botInk: 0,
      accent: 4,
      accentInk: 0,
      danger: 3,
    },
    style: {
      font: 'Bree Serif',
      textWeight: 400,
      numberWeight: 400,
      radius: 10,
      tileShape: 'chunky',
      texture: 'wood',
      veinWidth: 4,
      glow: 0,
      shadow: 1,
      motion: 0.6,
      youMark: 'pip',
      botMark: 'cross',
      youFill: 'solid',
      botFill: 'stripe',
      soundBase: 220,
      soundWave: 'triangle',
    },
  },
};

// ---------- colour helpers ----------

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** pct percent of colour a over colour b (plain sRGB mix, like CSS color-mix in srgb). */
export const mixHex = (a: string, b: string, pct: number): string => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => (v * pct + y[i]! * (100 - pct)) / 100));
};

export const resolveColor = (t: Theme, ref: ColorRef): string =>
  typeof ref === 'number' ? t.palette[ref]! : mixHex(t.palette[ref.mix[0]]!, t.palette[ref.mix[1]]!, ref.mix[2]);

export const resolveColors = (t: Theme): Record<ColorToken, string> =>
  Object.fromEntries(COLOR_TOKENS.map((k) => [k, resolveColor(t, t.colors[k])])) as Record<ColorToken, string>;

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
  const c = resolveColors(t);
  const out: Record<string, string> = {};
  for (const k of COLOR_TOKENS) out[`--c-${k}`] = c[k];
  const s = t.style;
  out['--font'] = `'${s.font}', system-ui, sans-serif`;
  out['--w-text'] = String(s.textWeight);
  out['--w-num'] = String(s.numberWeight);
  out['--radius'] = `${s.radius}px`;
  out['--shadow'] = String(s.shadow);
  out['--motion'] = String(s.motion);
  out['--glow'] = String(s.glow);
  return out;
};
