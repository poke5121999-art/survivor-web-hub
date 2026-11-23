// Theme tables for the battle world, one or two per biome (stages.js CHAPTERS, BIOME_THEMES below). The generator (pad.js) and the scene
// (world.js) read only these. Colours: `amb`, `key` and light colours are linear multipliers baked into vertex colours;
// hex colours are scene colours. Tiles are voxtex.js atlas keys, weighted.
//   top: the play floor: base tiles, patches of other tiles by low-frequency noise (paths, worn stone, puddles)
//   edge: top of the terraces and satellites; side: first row under a top, then deeper rows
//   abyss: water (a plane `y` below the floor) or mist (sheets over a deep pit); `rise` is what climbing monsters fade from
//   lights: the light-giving props placed on the rim (warm ones count for the look test); tall / low: other rim props
import { STREET } from './themes/street.js?v=20261122a';
import { PARKING } from './themes/parking.js?v=20261122a';
import { FACTORY } from './themes/factory.js?v=20261122a';
import { CRYPT } from './themes/crypt.js?v=20261122a';
import { LANDING } from './themes/landing.js?v=20261122a';
import { VOID } from './themes/void.js?v=20261122a';
import { FOREST } from './themes/forest.js?v=20261122a';
import { SWAMP } from './themes/swamp.js?v=20261122a';
export const THEMES = [FOREST, STREET, PARKING, CRYPT, SWAMP, FACTORY, LANDING, VOID];
// The themes of each biome; a biome with two takes them in turn by stage number. The biomes not built yet stand in the
// nearest built world until their own theme exists: volcano in the tomb (warm torchlight over a dark pit), snow in the cold
// factory (snow, ice, blue light), coast and sky in the sunny landing meadow over bright water.
export const BIOME_THEMES = {
  forest: [FOREST], street: [STREET, PARKING], crypt: [CRYPT], swamp: [SWAMP], volcano: [CRYPT], snow: [FACTORY],
  coast: [LANDING], factory: [FACTORY], sky: [LANDING], void: [LANDING, VOID],
};
export const STAND_IN = { volcano: 'crypt', snow: 'factory', coast: 'landing', sky: 'landing' };
export function themeOf(biome, n) { const list = BIOME_THEMES[biome] || BIOME_THEMES.forest; return list[(n | 0) % list.length]; }

// light-giving props: colour (linear), radius (m), strength, height of the flame or lamp, whether it reads as warm
export const LIGHTS = {
  lamp: { color: [1.0, 0.62, 0.28], r: 8, k: 1.0, h: 3.3, warm: 1, glow: 2.4 },
  coldlamp: { color: [0.55, 0.75, 1.0], r: 6, k: 0.7, h: 3.3, warm: 0, glow: 1.8, glowC: 0x5a88b0 },
  barrelfire: { color: [1.0, 0.5, 0.16], r: 6.5, k: 1.0, h: 1.15, warm: 1, glow: 1.9 },
  wreckfire: { color: [1.0, 0.48, 0.14], r: 7.5, k: 1.1, h: 1.2, warm: 1, glow: 2.4 },
  campfire: { color: [1.0, 0.52, 0.18], r: 8, k: 1.25, h: 0.6, warm: 1, glow: 2.6 },
  torch: { color: [1.0, 0.56, 0.2], r: 5.5, k: 0.95, h: 1.15, warm: 1, glow: 1.6 },
  brazier: { color: [1.0, 0.52, 0.18], r: 6.5, k: 1.1, h: 1.1, warm: 1, glow: 2.0 },
  mushrooms: { color: [1.0, 0.78, 0.32], r: 3.5, k: 0.8, h: 0.5, warm: 1, glow: 1.4, glowC: 0xffd070 },
  glowshroom: { color: [0.9, 1.0, 0.4], r: 4.5, k: 0.9, h: 0.6, warm: 1, glow: 1.6, glowC: 0xd8ff70 },
  bluecap: { color: [0.3, 1.0, 0.8], r: 4.5, k: 0.8, h: 0.6, warm: 0, glow: 1.6, glowC: 0x60ffd0 },
  wisp: { color: [0.35, 1.0, 0.85], r: 6, k: 0.9, h: 1.3, warm: 0, glow: 2.2, glowC: 0x70ffe0 },
  crystal: { color: [0.62, 0.36, 1.0], r: 5, k: 0.9, h: 1.4, warm: 0, glow: 2.0, glowC: 0xb080ff },
};
