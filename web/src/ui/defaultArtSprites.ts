// The board's sprite list in its historic order (nine player-0 grounds, nine player-1 grounds, the
// two homes), read by the replay's painter and the art lab. Since 2026-11-13 it is the Forest & Ash
// skin (ui/forestAsh.ts): nine Forest, nine Ash, the fruit tree and the volcano.
import { FA_ASH, FA_FOREST, FA_HOMES } from './forestAsh.js';

export const DEFAULT_ART_SPRITES: readonly string[] = [
  ...FA_FOREST.map((s) => s.url), ...FA_ASH.map((s) => s.url), FA_HOMES[0].url, FA_HOMES[1].url,
];
