import { allCoords, coordKey, rootCoord } from '../engine/index.js';
import type { Level } from '../bots/levels.js';
import { CAMPAIGN_LEVELS } from './levels.js';
import type { CampaignLevel } from './levels.js';

/** Published v1 openings. Never change these: old saves and queued Seed proofs replay against them. */
const OPENINGS: Record<number, { seed: number; botLevel: Level; radius: number; rock: string[]; gold: string[] }> = {
  1: { seed: 95001, botLevel: 1, radius: 2, rock: [], gold: ["0,0"] },
  2: { seed: 95002, botLevel: 1, radius: 2, rock: [], gold: ["0,0","-1,-1","1,1"] },
  3: { seed: 95003, botLevel: 1, radius: 2, rock: ["-2,0"], gold: ["0,0","0,2","0,-2"] },
  4: { seed: 95004, botLevel: 2, radius: 3, rock: [], gold: ["0,0","-2,0","2,0"] },
  5: { seed: 95005, botLevel: 2, radius: 3, rock: ["-3,1","3,-1"], gold: ["0,0","-2,0","2,0"] },
  6: { seed: 95006, botLevel: 3, radius: 3, rock: ["0,1"], gold: ["0,0","-2,0","2,0"] },
  7: { seed: 95007, botLevel: 3, radius: 3, rock: ["-3,0","-3,1"], gold: ["0,0","-2,0","2,0"] },
  8: { seed: 95008, botLevel: 3, radius: 3, rock: [], gold: ["0,0","-3,1","3,-1"] },
  9: { seed: 95009, botLevel: 4, radius: 3, rock: ["-2,-1","-2,0","-1,-1"], gold: ["0,0","0,2","0,-2"] },
  10: { seed: 95010, botLevel: 4, radius: 3, rock: ["-1,0","-1,-1","0,-1"], gold: ["0,0","-2,0","2,0"] },
  11: { seed: 95011, botLevel: 4, radius: 3, rock: ["-1,-1","1,1"], gold: ["0,0","-2,0","2,0"] },
  12: { seed: 95012, botLevel: 5, radius: 3, rock: ["-1,0","1,0","-1,-1"], gold: ["0,0","0,2","0,-2"] },
  13: { seed: 95013, botLevel: 5, radius: 3, rock: ["-2,0","-1,0","-1,-1","-1,-2"], gold: ["0,0","0,2","0,-2"] },
  14: { seed: 95014, botLevel: 5, radius: 3, rock: ["0,1"], gold: ["0,0","-2,0","2,0"] },
  15: { seed: 95015, botLevel: 6, radius: 3, rock: ["-3,1","3,-1","-1,0","1,0"], gold: ["0,0","0,2","0,-2"] },
  16: { seed: 95016, botLevel: 6, radius: 3, rock: ["-2,0","-1,0","2,0","3,0"], gold: ["0,0","-1,-1","1,1"] },
  17: { seed: 95017, botLevel: 6, radius: 3, rock: ["-1,0","-1,-1","-1,-2","1,1","1,2"], gold: ["0,0","0,2","0,-2"] },
  18: { seed: 95018, botLevel: 7, radius: 3, rock: ["-1,0","1,0"], gold: ["0,0","-2,0","2,0"] },
  19: { seed: 95019, botLevel: 7, radius: 3, rock: ["-3,0","-1,-1","0,1","1,1","2,0"], gold: ["0,0","0,2","0,-2"] },
  20: { seed: 95020, botLevel: 7, radius: 3, rock: ["-2,0","-1,0","0,-1","1,0","2,0"], gold: ["0,0","-2,-1","2,1","0,-3","0,3"] },
};

export const legacyCampaignLevelById = (id: string): CampaignLevel | null => {
  const current = CAMPAIGN_LEVELS.find(level => level.id === id);
  if (!current) return null;
  const old = OPENINGS[current.number];
  if (!old) return current; // Levels 21+ have not changed.
  const cells = allCoords(old.radius).map(coordKey);
  const homes: [string, string] = [0, 1].map(player => coordKey(rootCoord(player as 0 | 1, 'ring2', old.radius))) as [string, string];
  return { ...current, seed: old.seed, botLevel: old.botLevel, config: { boardRadius: old.radius, rootStyle: 'ring2', board: { cells, homes, rock: [...old.rock], gold: [...old.gold] } } };
};
