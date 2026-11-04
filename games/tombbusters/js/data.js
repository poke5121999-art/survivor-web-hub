// Tomb Busters — numbers. Every value carries its source:
//   APK  = out/config_json/MapSubGarbageConfig.json (+ tr_English.json names)
//   WIKI = https://wiki.biligame.com/chaoziran  (pages 蛤蟆, 木偶, 机关, 手电)
//   PLACEHOLDER = no source found; invented only so the run is playable. Replace when a real number turns up.
// World scale: 1 unit = 1 m. Wiki speed is a 1-5 rank, not m/s, so every speed below is PLACEHOLDER.

export const PLAYER = {
  hp: 100,             // PLACEHOLDER (wiki says "残血" low-HP, spikes 45HP, toad 10HP/s; no max HP page found)
  walk: 4.0, sprint: 6.5, // PLACEHOLDER
  radius: 0.4, eye: 1.62,
  shovelDmg: 34,        // WIKI 铲子: 伤害 34
  shovelReach: 2.3, shovelCd: 0.6, // PLACEHOLDER
};

export const FLASHLIGHT = {
  seconds: 140,        // WIKI 手电: usable 140 s, 0.5 durability/s of 70
  range: 22, angle: 0.42, // PLACEHOLDER
};

// Loot values in 铲铲币. Real, from MapSubGarbageConfig (Min=Max for these).
export const LOOT = {
  laser:    { name: 'Laser Pointer',  value: 3000,   src: 'APK' },   // also a tool: points at a crossbow to switch it off (WIKI 激光笔)
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

// ---------- Drop 3 ----------
export const CATFISH = { // WIKI 巨鲶 (Mawfin)
  hp: 120,              // WIKI 血量 120
  hit: 40,              // WIKI 伤害 40 HP, forced damage: if the bite lands it always hurts, spacing does not dodge it
  length: 3, height: 1.6, // WIKI model 3 m long
  speed0: 3.0, accel: 4.5, speedMax: 11, // PLACEHOLDER: WIKI says it keeps accelerating while chasing; numbers invented (rank 4 of 5)
  patrol: 1.6,          // PLACEHOLDER
  sight: 18, cone: 0.42,// PLACEHOLDER: WIKI "only sees in a straight line"
  crashStun: 2.5,       // PLACEHOLDER: WIKI: slams a wall when it cannot turn, gets stunned
  biteCd: 1.2,          // PLACEHOLDER
};
export const BEAR = {   // WIKI 大熊 (Grizzle)
  hp: 150,              // WIKI
  shot: 50, kick: 80,   // WIKI 子弹 50 HP, 踹伤 80 HP
  height: 2.6,          // WIKI
  shotWindup: 0.44, kickWindup: 0.35, // WIKI (wiki-tester estimates)
  speed: 3.8,           // PLACEHOLDER (rank 3 of 5)
  patrol: 1.3,          // PLACEHOLDER
  sight: 16, shootMin: 3.2, shootMax: 15, kickRange: 2.0, // PLACEHOLDER
  reload: 1.8,          // PLACEHOLDER
  crouchHit: 0.1,       // WIKI: it can barely hit a crouching employee; the exact odds are PLACEHOLDER
  mimic: true,          // WIKI: imitates employee voices (shown as a text warning here, no audio)
};
export const FALSE_DOOR = { // WIKI 假门
  dmg: 55,              // WIKI 55 HP per hit
  mashNeeded: 10, mashTime: 3.0, // PLACEHOLDER: WIKI "struggle free in time or be dragged into the abyss"
  knocksToAnger: 3,     // PLACEHOLDER: WIKI: knocking too many times angers it
  angerRange: 3.0,      // PLACEHOLDER
};
export const TOOLS = {  // out-of-run shop. buy / recycle(sell) / repair prices are WIKI (道具 pages), in 铲铲币
  shovel: { name: 'Shovel',        buy: 5000,  sell: 2500,  dur: null, repair: 0,   note: 'Damage 34. Starter kit.' },
  flash:  { name: 'Flashlight',    buy: 2000,  sell: 1000,  dur: 70,   repair: 11,  note: '140 s of light (0.5 durability/s). Starter kit.' },
  gourd:  { name: 'Gourd',         buy: 2000,  sell: 1000,  dur: 20,   repair: 50,  note: 'Hold G on a monster to absorb it. A caught monster sells as loot. Costs up to 10 durability per use.' },
  stun:   { name: 'Stun Gun',      buy: 40000, sell: 20000, dur: 70,   repair: 230, note: 'Hold R: auto-locks the nearest monster and stuns it while you keep it in sight. 0.5 durability/s.' },
  charm:  { name: 'Moujin Charm',  buy: 4000,  sell: 1000,  dur: null, repair: 0,   note: 'Blocks one lethal hit, then breaks and restores some HP.' },
};
export const GOURD = {  // WIKI 葫芦: success depends on the monster state; up to three boosts count
  holdSec: 2.5, range: 6, durPerUse: 10,   // WIKI: at most 10 durability per use
  base: 0.2, perBoost: 0.2,                 // PLACEHOLDER numbers; the boosts themselves are WIKI: stunned, from behind, weakened, back-to-back
  sellValue: { toad: 4000, spider: 2700, catfish: 3000, bear: 3000, puppet: 5000 }, // WIKI 吸入葫芦价值 (the APK's gourd sell table has the same ranks)
};
export const STUN = { range: 9, breakRange: 12, durPerSec: 0.5, minSec: 0 }; // WIKI: 0.5 durability/s, breaks if too far or out of sight; ranges PLACEHOLDER
export const CHARM = { restore: 50 };           // PLACEHOLDER: wiki says "restores part of your HP"
export const MERCY_FLASH_SEC = 30;              // PLACEHOLDER: a dead flashlight with no coins to repair it still gives 30 s so a broke player is never stuck
export const SAVE_VERSION = 3;

// Bestiary: ratings 1-5 and descriptions are the game's own (BestiaryInfoConfig + tr_English); `wiki` lines are from the wiki pages.
export const BESTIARY = {
  toad:    { name: 'Slurp',    blood: 4, spd: 2, atk: 2, desc: 'An internal-map monster that can only see moving prey. It often lurks near Salvage, waiting for employees to collect them. It captures prey with its tongue; striking the tongue at the right moment is an effective counter.', wiki: '120 HP solo, swallow 10 HP/s' },
  puppet:  { name: 'Puppet',   blood: 5, spd: 5, atk: 4, desc: 'An internal-map monster with an extremely hard body, but it can be killed with firearms. It dashes toward prey at high speed, but stops when watched.', wiki: 'Hit 90 HP, only firearms hurt it' },
  spider:  { name: 'Spider',   blood: 2, spd: 2, atk: 4, desc: 'An internal-map monster that clings to walls and spins webs in its territory. Its webs track prey and slow movement.', wiki: '150 HP, hit 90 HP' },
  catfish: { name: 'Mawfin',   blood: 2, spd: 4, atk: 2, desc: 'An internal-map monster driven by hunger to seek intruders. It is extremely fast in a chase, but clumsy when turning.', wiki: '120 HP, bite 40 HP (forced), straight-line sight' },
  bear:    { name: 'Grizzle',  blood: 3, spd: 3, atk: 3, desc: 'An internal-map monster that typically attacks with a shotgun, switching to melee at close range.', wiki: '150 HP, shot 50 HP, kick 80 HP, mimics voices' },
};
