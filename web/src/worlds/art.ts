import ocean from '../assets/worlds/ocean.webp?url';
import forest from '../assets/worlds/forest.webp?url';
import magic from '../assets/worlds/magic-fields.webp?url';
import volcanic from '../assets/worlds/volcanic.webp?url';
import oceanHome from '../assets/worlds/ocean-home.svg?url';
import forestHome from '../assets/worlds/forest-home.svg?url';
import magicHome from '../assets/worlds/magic-fields-home.svg?url';
import volcanicHome from '../assets/worlds/volcanic-home.svg?url';
import type { WorldId } from './worlds.js';
/** URLs only: the browser fetches/decodes the chosen worlds, never all four in the menu. */
export const WORLD_ART: Partial<Record<WorldId, { ground: string; home: string }>> = {
  ocean: { ground: ocean, home: oceanHome }, forest: { ground: forest, home: forestHome },
  'magic-fields': { ground: magic, home: magicHome }, volcanic: { ground: volcanic, home: volcanicHome },
};
