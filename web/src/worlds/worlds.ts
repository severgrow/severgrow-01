/** Stable cosmetic ids. Never part of engine state, ownership colour, a proof or a bot version. */
export const WORLD_IDS = ['futasaku', 'ocean', 'forest', 'magic-fields', 'volcanic'] as const;
export type WorldId = typeof WORLD_IDS[number];
export type WorldMaterial = { name: string; base: string; shade: string; light: string; accent: string; code: number };
export const WORLDS: Readonly<Record<WorldId, WorldMaterial>> = {
  futasaku: { name: 'FUTASAKU', base: '#252826', shade: '#151917', light: '#72776b', accent: '#c49658', code: 0 },
  ocean: { name: 'OCEAN', base: '#18444c', shade: '#0c252e', light: '#739d9b', accent: '#b9c8ad', code: 1 },
  forest: { name: 'FOREST', base: '#354532', shade: '#19291f', light: '#879376', accent: '#b2ac7d', code: 2 },
  'magic-fields': { name: 'MAGIC FIELDS', base: '#434150', shade: '#242735', light: '#9d99ac', accent: '#a8bbb3', code: 3 },
  volcanic: { name: 'VOLCANIC', base: '#3a3230', shade: '#211f20', light: '#80766d', accent: '#b37846', code: 4 },
};
export const parseWorldId = (raw: unknown): WorldId => WORLD_IDS.includes(raw as WorldId) ? raw as WorldId : 'futasaku';
export type DuelWorlds = { readonly environment: WorldId; readonly owners: readonly [WorldId, WorldId] };
/** Owners use screen seats (YOU, OPPONENT). Future match metadata/campaigns supply opponent id here. */
export const duelWorlds = (local: unknown, opponent: unknown = 'futasaku'): DuelWorlds => ({
  environment: parseWorldId(local), owners: [parseWorldId(local), parseWorldId(opponent)],
});

type Store = { get(key: string): string | null; set(key: string, value: string): void };
export const WORLD_STYLE_KEY = 'severgrow.world-style.v1';
/** The existing channel storage adapter supplies isolation. Memory fallback survives blocked writes. */
export function worldPreference(store: Store | null) {
  let current: WorldId = 'futasaku';
  try { current = parseWorldId(JSON.parse(store?.get(WORLD_STYLE_KEY) ?? 'null')); } catch { /* old/corrupt/private storage */ }
  return {
    get: () => current,
    set(id: WorldId) { current = parseWorldId(id); try { store?.set(WORLD_STYLE_KEY, JSON.stringify(current)); } catch { /* keep for this session */ } },
  };
}
