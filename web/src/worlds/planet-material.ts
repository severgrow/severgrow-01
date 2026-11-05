import { WORLDS, WORLD_IDS, type WorldId } from './worlds.js';
/** Low-detail planet pigments share the board's art direction; ownership hue remains underneath. */
export const WORLD_RGB = Object.fromEntries(WORLD_IDS.map(id => [id,
  [1, 3, 5].map(start => parseInt(WORLDS[id].base.slice(start, start + 2), 16) / 255),
])) as Record<WorldId, [number, number, number]>;
export const PLANET_WORLD_MATERIAL = `
  // World-fixed variation: neither rotating the camera nor crossing a hex restarts the material.
  if (kind > 3.5 && kind < 4.5 && uWorld > .5) {
    vec3 pigment = mix(uWorldPigment, vColour, .32);
    float field = grain;
    if (uWorld < 1.5) { // ocean: quiet long current lines
      float current = sin(vLocal.x * 220.0 + sin(vLocal.y * 68.0) * 3.0 + vLocal.z * 90.0);
      field = smoothstep(.55, .98, current) * .32 + grain * .4;
      pigment = mix(pigment, vec3(.34,.51,.53), field * .19);
    } else if (uWorld < 2.5) { // forest: low, soft canopy light
      pigment *= .84 + .3 * smoothstep(.2, .8, grain);
    } else if (uWorld < 3.5) { // magic fields: rare silver paths, never emissive neon
      float path = 1.0 - smoothstep(.02, .09, abs(grain - .53));
      pigment = mix(pigment, vec3(.58,.59,.65), path * .14);
    } else { // cooled basalt with occasional warmth
      pigment *= .88 + grain * .2;
      pigment = mix(pigment, vec3(.47,.29,.16), smoothstep(.77,.87,grain) * .3);
    }
    c = pigment;
  }
`;
