// THE ART PACK: what the lab holds (LabState) and the one zip it exports. The zip is the game's
// own folder layout, so an agent drops it in unchanged:
//   skin.json      the SkinDef as JSON (ui/skin/pack-json.ts skinFromJson reads it)
//   manifest.json  what each tier has (the format `npm run skin:manifest` writes), with content hashes
//   pack.json      the lab's own record (every slot, its settings, where each file came from)
//   README.md      what is in the pack and how to drop it in
//   lo/… hi/…      board art per tier (skin root)
//   cards/… planet/…  card and planet art (one size)
// Pure: no DOM. Converting pictures (lo/hi tiers) happens in the page before files reach here.
import { MASK_TEMPLATES, skinFromJson } from '../ui/skin/pack-json.js';
import type { SkinJson } from '../ui/skin/pack-json.js';
import type { HomeLayer, NetworkLook, PropSet, SkinDef, Tier } from '../ui/skin/types.js';
import { SKIN_TIERS, SLOTS, TIERS, WORLD_UNITS, defaults, slotById } from './slots.js';
import type { Slot } from './slots.js';
import { crc32, unzip, zip } from './zip.js';
import type { ZipEntry } from './zip.js';

export type Value = string | number | boolean;
export type Source = 'designer' | 'current';
/** One file in a slot: tiered art has lo and hi, cards / planet / icons one copy. */
export type LabFile = { name: string; source: Source; mime: string; lo: Uint8Array; hi?: Uint8Array; settings: Record<string, Value> };
export type SlotState = { files: LabFile[]; settings: Record<string, Value> };
export type LabState = { label: string; slots: Record<string, SlotState> };
/** Files the pack always carries that the designer never makes (the strength masks). */
export type SystemFiles = Map<string, Record<Tier, Uint8Array>>;

export const PACK_FORMAT = 'futasaku-art-pack';
export const PACK_VERSION = 1;

export const emptyState = (label = 'New art pack'): LabState => ({
  label,
  slots: Object.fromEntries(SLOTS.map((s) => [s.id, { files: [], settings: defaults(s.settings) }])),
});

export type Status = 'done' | 'current' | 'missing' | 'placeholder';
/** done: the designer's art; current: today's game art; missing: required and empty; placeholder: optional and empty. */
export const slotStatus = (slot: Slot, st: SlotState | undefined): Status => {
  const files = st?.files ?? [];
  if (slot.count.max === 0) return 'done';
  if (files.some((f) => f.source === 'designer')) return 'done';
  if (files.length) return 'current';
  return slot.optional ? 'placeholder' : 'missing';
};

const num = (v: Value | undefined, d: number) => (typeof v === 'number' ? v : d);
const str = (v: Value | undefined, d: string) => (typeof v === 'string' ? v : d);
const stem = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');

/** The file's place in the pack: the slot's path for its position (sets keep the file's own name). */
export const filePath = (slot: Slot, i: number, f: LabFile) => {
  // painted tiles are named by the strength they stand for (the board reads s<strength>_)
  const name = slot.id.endsWith('-tiles') ? `s${num(f.settings.strength, Math.min(9, i + 1))}_${String(i + 1).padStart(2, '0')}` : slot.fileSettings ? safeName(f.name, i) : undefined;
  const p = slot.path(i, name);
  // the name says what the file is (Safari writes PNG, not WebP)
  return f.mime === 'image/png' ? p.replace(/\.webp$/, '.png') : p;
};
const safeName = (name: string, i: number) => {
  const s = stem(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `${String(i + 1).padStart(2, '0')}_${s || 'file'}`;
};

/** The SkinDef a lab state draws with (root: where its tier folders live). */
export const skinJsonOf = (state: LabState): SkinJson => {
  const at = (id: string) => state.slots[id] ?? { files: [], settings: {} };
  const paths = (id: string) => { const s = slotById(id)!; return at(id).files.map((f, i) => filePath(s, i, f)); };
  const ground = paths('ground');
  const groundOr = (own: string[]) => (own.length ? own : ground);
  const player = (p: 'p1' | 'p2') => {
    const set = at(`${p}-base`).settings, ov = at(`${p}-overlay`), cut = at(`${p}-cutoff`);
    return {
      base: groundOr(paths(`${p}-base`)),
      ...(ov.files.length ? { overlay: paths(`${p}-overlay`)[0]! } : {}),
      proxy: { base: str(set.proxy, '#2f3a30'), overlay: str(ov.settings.overlayProxy, '#4f8a3c') },
      worldUnits: num(set.worldUnits, WORLD_UNITS),
      clarity: num(ov.settings.clarity, 0.7),
      cutoff: `states/${p}_cutoff_tint.json`,
      ...(cut.files.length ? { cutoffProps: { dir: `states/${p}_cutoff_props/`, size: num(cut.settings.cutoffSize, 12) } } : {}),
    };
  };
  const props = (p: 'p1' | 'p2'): PropSet => {
    const slot = slotById(`${p}-props`)!;
    return {
      dir: `props/${p}/`, size: 18,
      rules: at(`${p}-props`).files.map((f, i) => {
        const anim = str(f.settings.anim, 'none');
        return { match: stem(filePath(slot, i, f)), size: num(f.settings.size, 18), minStrength: num(f.settings.minStrength, 1), anim: anim === 'none' ? null : (anim as 'sway' | 'pulse') };
      }),
    };
  };
  const home = (p: 'p1' | 'p2'): HomeLayer[] => at(`${p}-home`).files.map((f, i) => {
    const anim = str(f.settings.anim, 'none');
    return {
      src: filePath(slotById(`${p}-home`)!, i, f), size: num(f.settings.size, 64), dx: num(f.settings.dx, 0), dy: num(f.settings.dy, 0), opacity: num(f.settings.opacity, 1),
      turn: f.settings.turn !== false, ...(anim !== 'none' ? { anim: anim as NonNullable<HomeLayer['anim']> } : {}),
    };
  });
  const net = (p: 'p1' | 'p2'): NetworkLook & { key: string } => {
    const s = at(`${p}-links`).settings;
    return {
      key: p, outline: str(s.outline, '#111'), body: str(s.body, '#ccc'), glow: str(s.glow, '#f5edda'),
      widths: { thin: num(s.thin, 2), normal: num(s.normal, 3.5), heavy: num(s.heavy, 5.5) },
      ...(at(`${p}-links`).files.length ? { strip: paths(`${p}-links`)[0]! } : {}),
    };
  };
  const tiles = Object.fromEntries((['p1', 'p2'] as const).filter((p) => at(`${p}-tiles`).files.length)
    .map((p) => [p, { dir: `tiles/${p}/`, base: str(at(`${p}-base`).settings.proxy, '#2f3a30') }]));
  const motes = at('motes').files.map((f, i) => ({
    material: f.settings.player === 'Player 2' ? 'p2' : 'p1', src: filePath(slotById('motes')!, i, f),
    minStrength: num(f.settings.minStrength, 6), kind: (f.settings.kind === 'fall' ? 'fall' : 'rise') as 'rise' | 'fall', size: num(f.settings.size, 6),
  }));
  const scars = (['p1', 'p2'] as const).map((p) => paths(`${p}-scar`)[0]);
  const numbers = (['p1', 'p2'] as const).map((p) => {
    const s = at(`${p}-numbers`).settings;
    return { ink: str(s.ink, '#f5edda'), plate: str(s.plate, '#000'), plateAlpha: num(s.plateAlpha, 0.85) };
  }) as SkinDef['numbers'];
  const groundProxy = str(at('ground').settings.proxy, '#262a28');
  return {
    id: slug(state.label), label: state.label, worldUnits: WORLD_UNITS, tiers: SKIN_TIERS,
    policy: { upgradeAt: 280, downgradeBelow: 200 }, masks: MASK_TEMPLATES,
    owners: ['p1', 'p2'], cells: { normal: 'empty', rich: 'gold', rock: 'rock' },
    materials: {
      empty: { base: ground, proxy: { base: groundProxy }, clarity: 0 },
      gold: { base: ground, proxy: { base: groundProxy }, clarity: 0 },
      rock: { base: ground, proxy: { base: '#57534c' }, clarity: 0 },
      p1: player('p1'), p2: player('p2'),
    },
    props: { p1: props('p1'), p2: props('p2'), rock: { dir: 'props/rock/', size: 62 }, gold: { dir: 'props/gold/', size: 64 } },
    ...(Object.keys(tiles).length ? { tiles } : {}),
    networkStyle: 'network/style.json',
    network: [net('p1'), net('p2')],
    homes: [home('p1'), home('p2')],
    ...(motes.length ? { ambient: { max: num(at('motes').settings.max, 4), motes } } : {}),
    ...(scars[0] && scars[1] ? { scars: [scars[0], scars[1]] as [string, string] } : {}),
    numbers,
  };
};

export const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'art-pack';

/** A lab state as a drawable skin rooted at `root`. */
export const skinOf = (state: LabState, root: string): SkinDef => skinFromJson(skinJsonOf(state), root);

const enc = new TextEncoder();
const json = (v: unknown) => enc.encode(`${JSON.stringify(v, null, 1)}\n`);
const hash8 = (d: Uint8Array) => crc32(d).toString(16).padStart(8, '0');

/** The cut-off tint files (states/p?_cutoff_tint.json) the skin names. */
const tintOf = (st: SlotState) => {
  const warm = num(st.settings.warm, 0);
  return { desaturate: num(st.settings.desaturate, 0.55), darken: num(st.settings.darken, 0.3), ...(warm > 0 ? { warm_shift: warm } : warm < 0 ? { cool_shift: -warm } : {}) };
};

/** Every file of the skin's tier folders: path -> bytes, per tier. */
export const tierFiles = (state: LabState, system: SystemFiles): Record<Tier, Map<string, Uint8Array>> => {
  const skin = skinJsonOf(state);
  const out: Record<Tier, Map<string, Uint8Array>> = { lo: new Map(), hi: new Map() };
  for (const slot of SLOTS) {
    if (!slot.rule.tiered) continue;
    (state.slots[slot.id]?.files ?? []).forEach((f, i) => {
      const p = filePath(slot, i, f);
      out.lo.set(p, f.lo);
      out.hi.set(p, f.hi ?? f.lo);
    });
  }
  for (const [p, t] of system) for (const tier of TIERS) out[tier].set(p, t[tier]);
  const style = Object.fromEntries(skin.network.map((n) => [n.key, { outline: n.outline, body: n.body, glow: n.glow, widths: n.widths }]));
  for (const tier of TIERS) {
    out[tier].set(skin.networkStyle, json(style));
    for (const p of ['p1', 'p2'] as const) out[tier].set(`states/${p}_cutoff_tint.json`, json(tintOf(state.slots[`${p}-cutoff`] ?? { files: [], settings: {} })));
  }
  return out;
};

/** Card, icon and planet files (one size): path -> bytes. */
export const flatFiles = (state: LabState): Map<string, Uint8Array> => {
  const out = new Map<string, Uint8Array>();
  for (const slot of SLOTS) if (!slot.rule.tiered) (state.slots[slot.id]?.files ?? []).forEach((f, i) => out.set(filePath(slot, i, f), f.lo));
  return out;
};

export type Manifest = { version: string; generated: string; tiers: Record<Tier, string[]>; hash: Record<Tier, Record<string, string>> };
export const manifestOf = (tiers: Record<Tier, Map<string, Uint8Array>>): Manifest => {
  const m: Manifest = { version: '', generated: 'Futasaku Art Lab', tiers: { lo: [], hi: [] }, hash: { lo: {}, hi: {} } };
  for (const t of TIERS) for (const [p, d] of [...tiers[t]].sort(([a], [b]) => a.localeCompare(b))) { m.tiers[t].push(p); m.hash[t][p] = hash8(d); }
  m.version = hash8(enc.encode(JSON.stringify(m.hash)));
  return m;
};

type PackRecord = {
  format: typeof PACK_FORMAT; version: number; label: string;
  slots: Record<string, { settings: Record<string, Value>; files: { name: string; source: Source; mime: string; path: string; settings: Record<string, Value> }[] }>;
};

/** The README an agent reads before dropping the pack in. */
export const readme = (state: LabState, statuses: Record<string, Status>, m: Manifest) => {
  const lines = SLOTS.map((s) => `| ${s.n} | ${s.title} | ${statuses[s.id]} | ${(state.slots[s.id]?.files ?? []).length} |`);
  return `# ${state.label} — Futasaku art pack

Made in the Futasaku Art Lab (futasaku.com/art). Format ${PACK_FORMAT} v${PACK_VERSION}, manifest ${m.version}.

## Drop it in (for the agent)

1. Copy \`lo/\`, \`hi/\`, \`skin.json\` and \`manifest.json\` to \`web/public/<skin-folder>/\` (the skin root).
2. Draw the board with it, unchanged:
   \`new SkinBoardView(svg, handlers, skinFromJson(skinJson, '<skin-folder>'))\` (web/src/ui/skin/pack-json.ts).
3. Cards: \`cards/*.webp\` replace \`web/src/assets/cards/*.webp\` (same names and sizes); \`cards/icons/*.svg\`, when present, replace the suit symbols.
4. Planet: \`planet/*.webp\` are the per-tile-kind textures for the planet's textured mode (\`PlanetRenderer\` \`textures\` option).
5. Check: \`npm run check\` and the board, card and planet browser suites; the pack's own test loads \`skin.json\` + \`manifest.json\` and finds every file the board asks for.

Tiers: lo (phones) hexes ${SKIN_TIERS.lo.hexPx} px, textures ${SKIN_TIERS.lo.texPx} px; hi hexes ${SKIN_TIERS.hi.hexPx} px, textures ${SKIN_TIERS.hi.texPx} px.

## Slots

| # | Slot | Status | Files |
|---|------|--------|-------|
${lines.join('\n')}

Status: done = the designer's art; current = today's game art kept; placeholder = optional, not supplied (the game falls back); missing = required, not supplied.
`;
};

/** The whole art pack as zip bytes. */
export const exportPack = (state: LabState, system: SystemFiles): Uint8Array => {
  const tiers = tierFiles(state, system);
  const flat = flatFiles(state);
  const m = manifestOf(tiers);
  const statuses = Object.fromEntries(SLOTS.map((s) => [s.id, slotStatus(s, state.slots[s.id])]));
  const record: PackRecord = {
    format: PACK_FORMAT, version: PACK_VERSION, label: state.label,
    slots: Object.fromEntries(SLOTS.map((s) => [s.id, {
      settings: state.slots[s.id]?.settings ?? {},
      files: (state.slots[s.id]?.files ?? []).map((f, i) => ({ name: f.name, source: f.source, mime: f.mime, path: filePath(s, i, f), settings: f.settings })),
    }])),
  };
  const entries: ZipEntry[] = [
    { name: 'README.md', data: enc.encode(readme(state, statuses, m)) },
    { name: 'skin.json', data: json(skinJsonOf(state)) },
    { name: 'manifest.json', data: json(m) },
    { name: 'pack.json', data: json(record) },
  ];
  for (const t of TIERS) for (const p of m.tiers[t]) entries.push({ name: `${t}/${p}`, data: tiers[t].get(p)! });
  for (const [p, d] of [...flat].sort(([a], [b]) => a.localeCompare(b))) entries.push({ name: p, data: d });
  return zip(entries);
};

/** Reopens a pack (plain-English errors for anything that is not one). */
export const importPack = (bytes: Uint8Array): LabState => {
  const files = new Map(unzip(bytes).map((e) => [e.name, e.data]));
  const raw = files.get('pack.json');
  if (!raw) throw new Error('This zip is not an art pack from the Art Lab (it has no pack.json).');
  const rec = JSON.parse(new TextDecoder().decode(raw)) as PackRecord;
  if (rec.format !== PACK_FORMAT) throw new Error('This zip is not a Futasaku art pack.');
  if (rec.version > PACK_VERSION) throw new Error('This pack was made by a newer Art Lab. Reload the page to update it.');
  const state = emptyState(rec.label);
  for (const slot of SLOTS) {
    const r = rec.slots[slot.id];
    if (!r) continue;
    state.slots[slot.id] = {
      settings: { ...defaults(slot.settings), ...r.settings },
      files: r.files.flatMap((f): LabFile[] => {
        const lo = slot.rule.tiered ? files.get(`lo/${f.path}`) : files.get(f.path);
        if (!lo) return [];
        const hi = slot.rule.tiered ? files.get(`hi/${f.path}`) : undefined;
        return [{ name: f.name, source: f.source, mime: f.mime, lo, ...(hi ? { hi } : {}), settings: { ...defaults(slot.fileSettings), ...f.settings } }];
      }),
    };
  }
  return state;
};

/** Total bytes a phone downloads for this pack: the lo tier, cards and planet (masks count too). */
export const phoneBytes = (state: LabState, system: SystemFiles) => {
  let n = 0;
  for (const d of tierFiles(state, system).lo.values()) n += d.length;
  for (const d of flatFiles(state).values()) n += d.length;
  return n;
};
