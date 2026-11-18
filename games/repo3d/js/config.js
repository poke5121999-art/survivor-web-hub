// Every gameplay number in one table. Source game works in px with TILE = 24 px; here 1 tile = 1 m,
// so a source speed or delta-v in px/s divides by 24 (see the inventory in the run log).
const PX = 1 / 24;

export const CFG = {
  physicsHz: 60,
  gravity: 9.81,
  tile: 1,
  wallH: 2.8,

  player: {
    radius: 0.31, halfHeight: 0.52, eye: 1.5, crouchEye: 0.9,
    sneak: 46 * PX, walk: 78 * PX, run: 78 * 1.85 * PX, jump: 4.2,
    stamina: 100, runDrain: 22, staminaRegen: 16, staminaDelay: 0.6, throwStamina: 6,
    hp: 100, str: 30, sens: 0.0022, speedFloor: 0.35,
  },

  grab: {
    range: 3.2, minDist: 0.9, maxDist: 2.8, scrollStep: 0.2,
    newtonsPerStr: 10, spring: 14, maxSpeed: 7, angDamp: 0.86, breakDist: 1.6,
    throwBase: 130 * PX, throwMax: 560 * PX,
  },

  loot: {
    dmgScale: 0.35, shatterBelow: 0.12, graceAfterPickup: 1.0, invulnAfterHit: 0.8, graceAfterSpawn: 3,
    kgPerMass: 0.25,
    materials: {
      soul: { frag: 1.6, thresh: 55 * PX, shatter: true, color: 0x7fd6ff, rough: 0.1, metal: 0, emissive: 0x2a6f99 },
      ceramic: { frag: 1.0, thresh: 95 * PX, shatter: true, color: 0xd8cfc0, rough: 0.35, metal: 0 },
      wood: { frag: 0.5, thresh: 155 * PX, shatter: false, color: 0x8a5a33, rough: 0.7, metal: 0 },
      metal: { frag: 0.18, thresh: 260 * PX, shatter: false, color: 0xc9b98a, rough: 0.28, metal: 1 },
    },
    sizes: {
      small: { half: 0.17, mass: 8, value: [400, 1100] },
      medium: { half: 0.28, mass: 24, value: [1400, 3200] },
      big: { half: 0.46, mass: 58, value: [4200, 9000] },
    },
  },

  extract: { hold: 3, padSize: 2.4 },
};
