// Tomb Busters — numbers. Every value carries its source:
//   APK  = out/config_json/MapSubGarbageConfig.json (+ tr_English.json names)
//   WIKI = https://wiki.biligame.com/chaoziran  (pages 蛤蟆, 木偶, 机关, 手电)
//   PLACEHOLDER = no source found; invented only so the run is playable. Replace when a real number turns up.
// World scale: 1 unit = 1 m. Wiki speed is a 1-5 rank, not m/s, so every speed below is PLACEHOLDER.

export const PLAYER = {
  hp: 100,             // PLACEHOLDER (wiki says "残血" low-HP, spikes 45HP, toad 10HP/s; no max HP page found)
  walk: 4.0, sprint: 6.5, // PLACEHOLDER
  radius: 0.4, eye: 1.62,
  shovelDmg: 20, shovelReach: 2.3, shovelCd: 0.6, // PLACEHOLDER
};

export const FLASHLIGHT = {
  seconds: 140,        // WIKI 手电: usable 140 s, 0.5 durability/s of 70
  range: 22, angle: 0.42, // PLACEHOLDER
};

// Loot values in 铲铲币. Real, from MapSubGarbageConfig (Min=Max for these).
export const LOOT = {
  abacus:   { name: 'Abacus',          value: 1200,   src: 'APK' },
  mirror:   { name: 'Bronze Mirror',   value: 2400,   src: 'APK' },
  lantern:  { name: 'Lantern',         value: 2400,   src: 'APK' },
  bracelet: { name: 'Jade Bracelet',   value: 3000,   src: 'APK' },
  ring:     { name: 'Jade Thumb Ring', value: 5000,   src: 'APK' },
  goblet:   { name: 'Golden Goblet',   value: 20000,  src: 'APK' },
  flute:    { name: 'Ethereal Flute',  value: 60000,  src: 'APK' },
  ruyi:     { name: 'Ruyi Goblet',     value: 100000, src: 'APK' },
  seal:     { name: 'Ghost Seal',      value: 300000, src: 'APK' },
};

// 宝椁 (treasure coffin): wiki says the guaranteed floor is the Jade Thumb Ring and it never rolls the Golden Goblet.
// Never rolls below the floor. The upper-tier chance below is PLACEHOLDER.
export const COFFIN = { holdSec: 1.6, rolls: [['flute', 0.12]], floor: 'ring' };

export const TOAD = {   // WIKI 蛤蟆
  hp: 120,              // WIKI single-player 120
  swallowDps: 10,       // WIKI 10 HP per second while held in the mouth
  tongueWindup: 0.2,    // WIKI 吐舌前摇 0.2 s
  dragWindup: 1.0,      // WIKI 拖倒员工前摇 1.0 s
  height: 2.3,          // WIKI model height 2.3 m
  cryTime: 5,           // WIKI 哭泣 about 5 s
  restTime: 5,          // WIKI 休息 about 5 s before burrowing
  spitOnceAtLowHp: true, // WIKI solo rule: spits you out once when you are low (no 摸金符)
  lowHp: 25,            // PLACEHOLDER threshold
  creep: 1.2, chase: 2.6, // PLACEHOLDER m/s (wiki rank 2 of 5; slow)
  tongueRange: 9,       // PLACEHOLDER
  wakeRadius: 2.4,      // PLACEHOLDER (stepping on / near the mound wakes it)
};

export const PUPPET = { // WIKI 木偶
  hp: 1000000,          // WIKI: only guns kill it; the player has none, so effectively immortal
  hit: 90,              // WIKI 90 HP per hit
  speed: 5.2,           // PLACEHOLDER (wiki rank 5 of 5)
  freezeWhenSeen: true, // WIKI: stops moving while looked at
  hitCd: 1.6, noticeRange: 16, // PLACEHOLDER
  meshNote: 'PLACEHOLDER mesh — Puppet model not extracted yet',
};

export const SPIDER = { // WIKI 蜘蛛 (https://wiki.biligame.com/chaoziran)
  hp: 150,              // WIKI 血量 150
  hit: 90,              // WIKI 伤害 90 HP per hit
  length: 1.8, height: 0.9, // WIKI tested model size 1.8 m long, 0.9 m tall
  speed: 3.0,           // PLACEHOLDER m/s (wiki rank 2 of 5 for speed; chase value invented)
  hitCd: 1.5,           // PLACEHOLDER
  dropTime: 0.5,        // PLACEHOLDER: time to climb down from the ceiling
  senseUnder: 3.2,      // PLACEHOLDER: "walking right under it" triggers the chase (WIKI: passing under it)
  watchRange: 14,       // PLACEHOLDER: WIKI "观察": stops to stare at a far player and never aggros if you keep distance
  webRadius: 1.15,      // PLACEHOLDER
  webSlow: 0.45,        // PLACEHOLDER: WIKI says webs slow prey; the factor is not given
};
export const COFFIN_GOLD = { // WIKI 金椁: always a gold-tier item, floor = Golden Goblet. Real art not found: the bronze mesh, tinted (PLACEHOLDER tint)
  holdSec: 2.2, rolls: [['flute', 0.35]], floor: 'goblet',
};
export const SPIKES = { dmg: 45, delay: 0.5, up: 0.7, cd: 1.4 }; // WIKI 地刺 45HP/hit; delay/up/cd PLACEHOLDER
export const CROSSBOW = { dmgMin: 20, dmgMax: 30, lock: 0.7, range: 14, cd: 1.8, arc: 1.2 }; // WIKI 连弩 20-30 HP; lock/range/cd/arc PLACEHOLDER

export const EXTRACT = { holdSec: 3.0 }; // PLACEHOLDER
export const SAVE_KEY = 'tombbusters.save.v1';
