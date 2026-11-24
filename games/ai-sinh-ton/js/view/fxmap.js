// Maps every effect key the sim emits (sim `fx`, `attack`, projectile, zone, dash, buff, state keys) to a look, and
// plays it with Blockade Z's G.fx calls, own ground marks and sounds. A key missing from KEYS plays a generic burst
// and is logged once. counters[key] counts the effects played per key (the view-shots tool reads it).
// On top of that base look every skill a beast casts plays three beats (fx/beats.js): the wind-up at the caster on its cast,
// the impact where each part lands, the after-image. An instant skill's impact is drawn HOLD seconds after its cast so the
// wind-up shows first; an ultimate's events are held while its close-up winds up (ultcam.js) and released together.
import { arenaNorm } from '../sim/battle.js?v=20261124a';
import { HEROES } from '../data/heroes.js?v=20261124a';
import { ENEMIES } from '../data/enemies.js?v=20261124a';
import { createBeats } from './fx/beats.js?v=20261124a';
import { pixelTextures } from './fx/pixel.js?v=20261124a';
const THREE = window.THREE;
const BZ = window.BZ;

// palette per style: [core, edge]
const STYLE = {
  steel: [0xfff0c0, 0xffa040], fire: [0xffe070, 0xff4010], ice: [0xffffff, 0x7ad0ff], poison: [0xd0ff70, 0x4aa820], shock: [0xffffff, 0x70c0ff],
  holy: [0xfff6b0, 0xffc840], blood: [0xff7080, 0xa01028], earth: [0xe0d0a8, 0x8a6a44], void: [0xe8b0ff, 0x7a30d8], plasma: [0xc0ffff, 0x20c0f0],
  web: [0xffffff, 0xc0c8e8], sand: [0xffe090, 0xc89a40], bio: [0xe0ff90, 0x78b838], gun: [0xfff0a0, 0xff9a30], metal: [0xe8eef8, 0x7a8aa0],
};

// key: { s style, n size multiplier, snd sound, boom real explosion, bolt look for `bolt` parts, sky bolt from above, fall mark projectile,
//        z zone look [shader style, colour 1, colour 2, puff rate, extra], atk look of a basic attack, ult/self wave }
const K = (s, o = {}) => ({ s, ...o });
export const KEYS = {
  // hero basic attacks
  slash_heavy: K('steel', { atk: 'slash', n: 2.3, snd: 'heavy' }), slash: K('steel', { atk: 'slash', n: 1.7 }), minigun: K('gun', { atk: 'tracer' }),
  pistol: K('gun', { atk: 'tracer' }), shuriken: K('metal', { atk: 'tracer', n: 1.2 }), thrust: K('ice', { atk: 'thrust', n: 2 }), punch: K('fire', { atk: 'punch' }),
  glaive: K('poison', { atk: 'slash', n: 2.4 }), shotgun: K('gun', { atk: 'tracer' }), javelin: K('shock', { atk: 'tracer', n: 1.3 }), hatchet: K('blood', { atk: 'slash', n: 1.8 }),
  webbow: K('web', { atk: 'tracer' }), rocket: K('fire', { boom: true, n: 1 }),
  // hero skills and ultimates
  gold_shield: K('holy', { self: true }), charge: K('steel', { trail: true }), quake: K('earth', { self: true, ult: true, snd: 'heavy' }), overdrive: K('fire', { self: true }),
  cluster: K('fire', { boom: true, fall: 'nade' }), drones: K('metal', { self: true, ult: true }), heal: K('holy', { heal: true }), dart: K('bio', { bolt: 'tracer' }),
  revive: K('holy', { self: true, ult: true }), dash: K('shock', { trail: true }), gust: K('ice', { n: 1.2, snd: 'swipe' }), blades: K('steel', { bolt: 'slash', ult: true }),
  airstrike: K('fire', { boom: true, fall: 'shell' }), mines: K('steel', { boom: true, fall: 'bomb' }), artillery: K('fire', { boom: true, fall: 'shell', ult: true }),
  blink: K('void', { bolt: 'slash', trail: true }), pierce_star: K('metal', { n: 1.2 }), vanish: K('void', { self: true, ult: true }), ice_wave: K('ice', { n: 1.2 }),
  ice_spike: K('ice', { n: 1.4 }), blizzard: K('ice', { ult: true, z: [2, 0x2f7fe0, 0x9fd4ff, 7] }), molotov: K('fire', { z: [0, 0xc02808, 0xffc030, 14] }),
  rocket_jump: K('fire', { boom: true, trail: true }), dragon_breath: K('fire', { ult: true, z: [0, 0xc02808, 0xffd040, 20] }),
  poison_cloud: K('poison', { z: [1, 0x3a8a18, 0xb8f050, 5] }), drain: K('blood', { bolt: 'drain' }), plague: K('poison', { ult: true, mark: true }),
  turret: K('metal', { self: true }), armor_up: K('metal', { self: true }), fortress: K('metal', { self: true, ult: true }),
  ball_lightning: K('shock', { ult: true, z: [5, 0x2080ff, 0xe0f4ff, 0, 'ball'] }), smite: K('holy', { bolt: 'sky', sky: true }), thunder: K('shock', { bolt: 'sky', sky: true, ult: true, snd: 'thunder' }),
  pounce: K('blood', { bolt: 'slash', trail: true }), howl: K('earth', { self: true, snd: 'roar' }), werewolf: K('blood', { self: true, ult: true }),
  swing: K('web', { trail: true }), web_pull: K('web', { pull: true }), web_net: K('web', { ult: true, mark: true, z: [3, 0xb8c0d8, 0xd8e0f0, 0] }),
  // enemy attacks
  claw: K('blood', { atk: 'claw' }), bite: K('blood', { atk: 'bite' }), acid: K('poison', { n: 0.8 }), smash: K('earth', { atk: 'smash', n: 1.4, snd: 'heavy' }),
  boulder: K('earth', { n: 1.2, snd: 'boom' }), plasma: K('plasma', { atk: 'tracer', n: 0.9 }), scarab: K('sand', { n: 1 }), void_ball: K('void', { n: 1.3, snd: 'boom' }),
  // enemy and boss skills
  leap: K('earth', { trail: true }), bloat: K('bio', { n: 1, snd: 'boom' }), shriek: K('plasma', { self: true, snd: 'screech' }), boss_slam: K('earth', { self: true, snd: 'heavy' }),
  roar: K('earth', { self: true, snd: 'roar' }), rockfall: K('earth', { fall: 'rock', snd: 'heavy' }), phase: K('void', { self: true, trail: true }), shards: K('void', { bolt: 'tracer' }),
  wail: K('void', { self: true, snd: 'screech' }), screech: K('plasma', { self: true, snd: 'screech' }), dive: K('metal', { trail: true }), sonic: K('plasma', { n: 1.2, snd: 'screech' }),
  eggs: K('bio', { self: true }), web_spit: K('web', { n: 1.2 }), acid_sea: K('poison', { z: [1, 0x4aa820, 0xc8ff50, 6] }), bats: K('blood', { bolt: 'tracer' }),
  blooddash: K('blood', { trail: true }), bloodnova: K('blood', { self: true, snd: 'boom' }), bloodrain: K('blood', { fall: 'blood' }), plasma_volley: K('plasma', { bolt: 'tracer' }),
  laser: K('plasma', { n: 1.2 }), beam_in: K('plasma', { self: true }), acid_mines: K('poison', { fall: 'acid' }), pillars: K('sand', { n: 1.2 }), mummies: K('sand', { self: true }),
  curse: K('sand', { n: 1.2 }), orbring: K('sand', { self: true, snd: 'boom' }), bombrun: K('fire', { boom: true, fall: 'bomb' }), tractor: K('plasma', { z: [4, 0x40c0ff, 0xd8f4ff, 0, 'beam'] }),
  emp: K('plasma', { self: true, snd: 'thunder' }), charge_boss: K('earth', { trail: true }), void_breath: K('void', { n: 1.3, snd: 'roar' }), meteor: K('fire', { boom: true, fall: 'meteor' }),
  tailspin: K('earth', { self: true, snd: 'swipe' }), boulder_roll: K('earth', { n: 1.3 }),
  // emitted by the sim itself
  turret_shot: K('gun', { atk: 'tracer' }), chain: K('shock', { bolt: 'arc' }), kill_blast: K('fire', { n: 0.8, snd: 'boom' }),
  fire_pool: K('fire', { z: [0, 0xc02808, 0xffc030, 14] }), web: K('web', { z: [3, 0xb8c0d8, 0xffffff, 0] }),
};
// `charge` is both a hero skill and a boss skill: one entry serves both
KEYS.charge = K('steel', { trail: true, snd: 'heavy' });

const STATE = { invuln: STYLE.holy, stealth: STYLE.void, taunt: STYLE.steel };
const PROJ = {
};
const ULT_SPAN = 6;
// Chồn Gió (was Gió): the whirlwind lasts as long as the stun it casts (the sim's aoe is instant); the ultimate is ten cuts over the sim's own window
const GIO = HEROES.find((h) => h.id === 'chon');
const WHIRL_DUR = GIO.s2.ops[0].status.dur;
const ULT_CUTS = GIO.ult.ops.find((o) => o.op === 'bolts');
const SLASH_N = 10;

// ---- the vertical layer ----
// Every key gets layers that rise off the floor so the event reads as a 3D one from the fixed overview. A layer is
// [builder, ...args]; the builders are in createFxMap. Sets: cast (at the caster), land (where a burst, cone, line, bolt,
// heal or shield part lands), zone (a zone starts), dash (the end of a dash), ult (extra at the hero, on top of GENERIC_ULT).
//   pillar h rad life a   light column from the floor        wall k life h a    shock wall growing to k * event radius
//   flash size y          short local glow (<= 80 ms)        fount n v kind sp  debris and sparks thrown up (v m/s up)
//   plume h n kind size   rolling smoke / gas / fire column  spikes h rad n     columns along a line event
const GENERIC_ULT = [['pillar', 12, 1.5, 1.0, 0.42], ['wall', 1, 0.45, 1.3, 0.42], ['fount', 12, 11, 'spark', 3]];
const RISE = [['pillar', 4.5, 1, 0.9], ['fount', 8, 8, 'spark', 1.5]];
const SLAM = [['wall', 1, 0.4, 1.2, 0.8], ['fount', 14, 10, 'debris', 3.5], ['plume', 3.6, 5, 'dust', 3.2], ['flash', 3], ['pillar', 4, 1.2, 0.5]];
const BLAST = [['fount', 9, 9.5, 'debris', 2.5], ['plume', 3.6, 4, 'smoke', 3], ['flash', 2.4], ['pillar', 4.6, 0.8, 0.5]];
const SPARK = [['fount', 5, 8, 'spark', 1.2], ['pillar', 3, 0.45, 0.4]];
const DUST_DASH = [['fount', 8, 8.5, 'debris', 3], ['plume', 3.2, 3, 'dust', 2.4], ['wall', 2.5, 0.35, 0.9, 0.5]];
const VERT = {
  gold_shield: { cast: [['pillar', 5.5, 1.2, 1.0], ['fount', 8, 8, 'spark', 1.4], ['wall', 2.3, 0.4, 1.5, 0.45]] },
  charge: { dash: DUST_DASH }, quake: { ult: [['pillar', 7, 1.8, 0.9]], land: [['wall', 1, 0.45, 1.3, 0.6], ['fount', 20, 11, 'debris', 4], ['plume', 4.8, 6, 'dust', 3.4], ['flash', 3.6]] },
  overdrive: { cast: RISE }, cluster: { land: BLAST }, drones: { ult: [['fount', 14, 11, 'metal', 3]] },
  heal: { land: [['pillar', 4.2, 0.6, 0.9], ['fount', 6, 7.5, 'spark', 0.8]] }, dart: { land: [['fount', 3, 7.5, 'spark', 0.8], ['plume', 2.8, 2, 'gas', 1.4]] },
  revive: { ult: [['pillar', 14, 1.4, 1.1], ['fount', 18, 12, 'spark', 3], ['wall', 3.2, 0.5, 1.2, 0.5]] },
  dash: { dash: [['plume', 3, 3, 'wind', 1.8], ['fount', 6, 8.5, 'spark', 1.2]] }, gust: { land: [['wall', 1, 0.45, 1.4, 0.5], ['fount', 10, 9, 'ice', 3], ['pillar', 3.2, 1.4, 0.5, 0.3]] },
  blades: { ult: [['wall', 1, 0.5, 1.2, 0.5]], land: [['fount', 5, 8.5, 'metal', 1.5], ['pillar', 3.6, 0.5, 0.35]] },
  airstrike: { land: BLAST }, mines: { land: [['fount', 6, 8.5, 'debris', 2], ['plume', 3.2, 3, 'dust', 2.4], ['pillar', 3.2, 0.6, 0.4]] },
  artillery: { ult: [['wall', 1.2, 0.5, 1.2, 0.5]], land: [['fount', 14, 11.5, 'debris', 3.5], ['plume', 5, 6, 'smoke', 3.6], ['pillar', 7, 1.4, 0.6, 0.3], ['wall', 1, 0.4, 1.3, 0.35]] },
  blink: { dash: [['pillar', 4.6, 0.7, 0.55], ['plume', 3.2, 3, 'ink', 1.8]] }, pierce_star: { land: [['fount', 6, 8.5, 'metal', 1.4], ['pillar', 3.2, 0.5, 0.4]] },
  vanish: { ult: [['plume', 4.8, 7, 'ink', 2.8]] },
  ice_wave: { land: [['pillar', 3.6, 0.55, 0.7], ['fount', 10, 9.5, 'ice', 3], ['wall', 0.9, 0.4, 1, 0.4]] }, ice_spike: { land: [['spikes', 3.6, 0.38, 4]] },
  blizzard: { ult: [['wall', 1, 0.5, 1.4, 0.5]], land: [['fount', 16, 11, 'ice', 4]] },
  molotov: { zone: [['flash', 2.5], ['fount', 8, 9, 'fire', 2], ['plume', 3.8, 4, 'fire', 2.4], ['pillar', 4, 0.9, 0.6]] },
  rocket_jump: { dash: [['fount', 10, 10, 'fire', 2.5], ['plume', 3.6, 4, 'smoke', 3], ['flash', 2.6]], land: [['wall', 1, 0.4, 1.2, 0.6], ['pillar', 4, 1, 0.5]] },
  dragon_breath: { zone: [['plume', 5.2, 6, 'fire', 3.4], ['fount', 16, 11, 'fire', 3.5], ['flash', 3.4]] },
  poison_cloud: { zone: [['plume', 3.8, 6, 'gas', 2.8], ['pillar', 3.2, 1.6, 0.9, 0.25]] }, drain: { land: [['fount', 4, 7.5, 'blood', 1], ['pillar', 3, 0.4, 0.4]] },
  plague: { land: [['pillar', 10, 1.6, 1.2], ['wall', 1, 0.6, 1.2, 0.4], ['plume', 4.6, 7, 'gas', 3.4]] },
  turret: { cast: [['pillar', 4, 0.8, 0.7], ['fount', 8, 8.5, 'metal', 1.6]] }, armor_up: { land: [['pillar', 3.5, 0.9, 0.8], ['fount', 6, 8, 'metal', 1]] },
  fortress: { ult: [['fount', 16, 11, 'metal', 3.4], ['wall', 4.5, 0.5, 1.2, 0.5]] },
  ball_lightning: { zone: [['pillar', 7, 1, 0.8], ['flash', 2.4, 1.3]] }, smite: { land: [['pillar', 18, 0.5, 0.35, 0.5], ['flash', 2.4], ['fount', 6, 9, 'spark', 1.4]] },
  thunder: { ult: [['wall', 1.2, 0.5, 1.2, 0.5]], land: [['pillar', 18, 0.8, 0.45, 0.55], ['flash', 3], ['fount', 8, 10, 'spark', 2], ['wall', 2.6, 0.35, 1, 0.5]] },
  pounce: { dash: [['fount', 8, 8.5, 'blood', 2.4], ['plume', 3, 3, 'dust', 2.2]] }, howl: { cast: [['pillar', 4.8, 1.4, 0.9], ['wall', 5, 0.5, 1.2, 0.5], ['plume', 3.4, 4, 'dust', 2.8]] },
  werewolf: { ult: [['wall', 6, 0.5, 1.4, 0.5], ['fount', 14, 11, 'blood', 3]] },
  swing: { dash: [['fount', 5, 8.5, 'web', 1.4], ['pillar', 3, 0.4, 0.4]] }, web_pull: { land: [['pillar', 3.6, 1.2, 0.8], ['fount', 8, 8.5, 'web', 1]] },
  web_net: { ult: [['pillar', 4, 2, 1.0]], land: [['wall', 1, 0.5, 1.1, 0.4], ['fount', 14, 11, 'web', 4]] },
  // enemies and bosses
  boss_slam: { land: SLAM }, tailspin: { land: SLAM }, roar: { cast: [['wall', 6, 0.5, 1.3, 0.5], ['pillar', 4.6, 1.4, 0.9]] },
  rockfall: { land: [['fount', 8, 9, 'debris', 2.4], ['plume', 3.4, 4, 'dust', 2.6], ['flash', 2.2], ['pillar', 3.2, 0.8, 0.45]] },
  phase: { dash: [['pillar', 5, 0.8, 0.6], ['plume', 3.4, 4, 'ink', 2]] }, shards: { land: SPARK }, wail: { land: [['wall', 1, 0.5, 1.2, 0.6], ['pillar', 5, 1.4, 0.9]] },
  screech: { cast: [['wall', 5, 0.4, 1.1, 0.5], ['pillar', 4, 0.9, 0.7]] }, 
  dive: { dash: [['plume', 3.4, 4, 'dust', 2.6], ['fount', 10, 10, 'debris', 3], ['wall', 3, 0.35, 1, 0.5]] }, sonic: { land: [['wall', 1, 0.45, 1.1, 0.45], ['pillar', 3.2, 1, 0.6]] },
  eggs: { cast: [['pillar', 3.6, 1.2, 0.8], ['plume', 3, 3, 'gas', 2.2]] }, web_spit: { land: [['fount', 6, 8.5, 'web', 1.5], ['plume', 3, 3, 'gas', 2]] },
  acid_sea: { zone: [['plume', 3.8, 6, 'gas', 2.8], ['pillar', 3, 2, 0.9, 0.25]] }, bats: { land: [['fount', 3, 7.5, 'blood', 1]] },
  blooddash: { dash: [['fount', 8, 9, 'blood', 2.4], ['pillar', 3.6, 0.6, 0.5]] },
  bloodnova: { land: [['wall', 1, 0.45, 1.2, 0.7], ['pillar', 6, 1.2, 0.8], ['fount', 12, 10.5, 'blood', 3.5]] }, bloodrain: { land: [['fount', 6, 8.5, 'blood', 1.6], ['pillar', 3, 0.5, 0.4]] },
  plasma_volley: { land: SPARK }, laser: { land: [['spikes', 6.5, 0.5, 4], ['fount', 8, 9, 'spark', 1.6]] }, beam_in: { cast: [['pillar', 14, 1, 1.0], ['flash', 2.6]], land: [['pillar', 14, 1, 1.0]] },
  acid_mines: { land: [['fount', 6, 8.5, 'gas', 1.8], ['plume', 3.2, 3, 'gas', 2.2], ['pillar', 3, 0.7, 0.5]] },
  pillars: { land: [['spikes', 4.6, 0.8, 5], ['fount', 6, 8.5, 'sand', 1.4]] }, mummies: { cast: [['plume', 3.4, 5, 'dust', 2.6], ['pillar', 3.6, 1.2, 0.8]] },
  curse: { land: [['pillar', 3.4, 1.2, 0.8], ['fount', 8, 8.5, 'sand', 2.4]] }, orbring: { land: [['wall', 1, 0.45, 1.1, 0.6], ['pillar', 4.6, 1.2, 0.7]] },
  bombrun: { land: BLAST }, tractor: { zone: [['pillar', 12, 1.8, 1.4, 0.22]] },
  emp: { land: [['wall', 1, 0.45, 1.2, 0.6], ['pillar', 7, 1.6, 0.8], ['fount', 12, 10, 'spark', 3]] },
  charge_boss: { dash: DUST_DASH }, void_breath: { land: [['plume', 4.6, 6, 'ink', 3], ['fount', 10, 9.5, 'void', 3.5], ['pillar', 4, 1.2, 0.7]] },
  meteor: { land: [['fount', 16, 11.5, 'debris', 4], ['plume', 5, 6, 'smoke', 3.6], ['flash', 3.6], ['pillar', 7, 1.4, 0.6], ['wall', 1, 0.4, 1.3, 0.6]] },
  boulder_roll: { land: [['spikes', 3.4, 0.7, 4], ['plume', 3, 3, 'dust', 2.2]] }, 
  
  
};
// debris and spark colours per kind: [palette from the event colours]
const DEBRIS = {
  debris: (c) => [0x8a7a68, 0xb0a088, 0x6a5a48, c.a], spark: (c) => [c.b, c.a, 0xffe090], metal: (c) => [0xc0c8d4, 0x7a8aa0, c.a], ice: () => [0xdff4ff, 0x9adcff, 0x7ad0ff],
  fire: () => [0xffd070, 0xff8a30, 0xff4010], blood: () => [0xd8203a, 0xa01028, 0x6a0a18], gas: (c) => [c.b, c.a, 0x9cff3a], web: () => [0xffffff, 0xc0c8e8, 0x98a0c0],
  sand: () => [0xffe090, 0xc89a40, 0x8a6a30], void: () => [0xe8b0ff, 0x7a30d8, 0x4a1a90],
};
// smoke columns: [start colour, end colour, additive]
const PLUME = {
  smoke: [0x3a3632, 0x7a746c, false], dust: [0xb8ae98, 0x8a8070, false], gas: [null, null, false], fire: [0xffd070, 0xff3a10, true], ink: [0x2a2038, 0x6a5a82, false], wind: [0xffffff, 0xbfe4ff, true],
};

// skill keys only a boss uses: an enemy warning under one of them is drawn as a boss warning (crimson, with teeth)
const BOSS_KEYS = (() => {
  const of = (list) => new Set(list.flatMap((e) => [...(e.skills || []).map((k) => k.fx), e.attack && e.attack.fx]).filter(Boolean));
  const boss = of(ENEMIES.filter((e) => e.boss)); const other = of(ENEMIES.filter((e) => !e.boss));
  return new Set([...boss].filter((k) => !other.has(k)));
})();
const BOSS_DEATH = [['pillar', 14, 2, 1.2, 0.4], ['fount', 24, 12, 'fire', 5], ['plume', 5.5, 7, 'smoke', 4], ['wall', 1, 0.5, 1.4, 0.6], ['flash', 4]];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const HOLD = 0.09;          // s of view time between an instant skill's cast and its drawn impact (the wind-up)
const SELF_TIMED = new Set(['aoe', 'cone', 'line', 'zone', 'rain', 'bolts']); // sim ops that wait out their own `delay`
const GLOW_CLOSE = 0.55;  // glow dots' brightness in the ultimate's close-up, where they fill the frame (fx-beats clipped white < 1%)
const BUNG_CAP = 6;         // impacts drawn per frame at most (a volley of bolts lands many at once)
const HIT_CAP = 5;          // hero hit sparks per frame at most
const PART_SHAPE = { burst: 'burst', cone: 'cone', line: 'line', bolt: 'bolt', heal: 'heal', shield: 'heal', mark: 'zone', pull: 'zone' };

export function createFxMap(H, marks, ctx) {
  const { G, scene, camera } = H;
  const pix = pixelTextures(scene);
  // Blockade Z's blast shock rings are additive 0xffe0b0 at 0.9: on the pale chapter floors they clip to pure white, so they are
  // tinted down; and they are flat ruled rings, so they take the marks' burst of dust streaks instead (same unit radius, same scaling)
  const shock = marks.shockGeo.clone().rotateX(-Math.PI / 2);
  scene.traverse((o) => { const m = o.isMesh && o.material; if (m && o.geometry.type === 'RingGeometry' && m.blending === THREE.AdditiveBlending && m.color.getHex() === 0xffe0b0) { m.color.multiplyScalar(0.4); o.geometry = shock; m.map = marks.shockTex; m.needsUpdate = true; } });
  const counters = {}; const missing = new Set(); const bump = (k) => { counters[k] = (counters[k] || 0) + 1; };
  const beats = createBeats(H, marks);
  const juice = () => window.__G && window.__G.juice;
  // per hero: its last cast { t: sim time, slot, wait: seconds until the impact } and its ultimate hold
  const lastCast = new Map(); let bungLeft = BUNG_CAP; let hitLeft = HIT_CAP;
  const held = new Map(); // uid -> events held back while its ultimate winds up
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let budget = { pop: 0, boom: 0, puff: 0 };
  const reduceFlash = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);
  const snd = (name, x, z, gain = 0.5) => { if (name) G.audio.playAt(name, V(x, 0, z), { gain }); };


  // ---- vertical layer builders (see VERT) ----
  const UP = V(0, 1, 0); let vb = 0;
  const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
  const qual = () => Math.max(0.5, H.quality.particles);
  function colorsFor(key, uid) {
    const u = uid ? ctx.unit(uid) : null;
    if (u && u.hero) { const a = ctx.colorOf(uid); return { a, b: mixHex(a, 0xffffff, 0.35) }; }
    const p = pal(KEYS[key]); return { a: p[1], b: mixHex(p[1], p[0], 0.5) };
  }
  const BUILD = {
    pillar(x, z, c, r, e, h, rad, life, a) { marks.pillar(x, z, c.a, { h, r: rad, life, a }); },
    wall(x, z, c, r, e, k, life, h, a) { const R = r ? Math.min(e && e.part === 'burst' ? 3.6 : 6, Math.max(1.4, r * k)) : k; marks.wall(x, z, R * 0.2, R, c.a, life, h, a); },
    flash(x, z, c, r, e, size, y = 0.8) { marks.flash(x, y, z, Math.min(size, 2.6), c.b); },
    fount(x, z, c, r, e, n, v, kind, sp) {
      const cols = (DEBRIS[kind] || DEBRIS.spark)(c);
      G.fx.burst(V(x, 0.3, z), n, cols, { dir: UP, push: v, speed: sp, grav: 14, life: (v / 14) * 2 + 0.5, size: 0.26, bounce: 0.15 });
      const m = Math.max(2, Math.round(n * 0.5 * qual()));
      for (let i = 0; i < m && budget.puff-- > 0; i++) {
        const a = G.rng.range(0, 6.283); const d = G.rng.range(0, sp * 0.4);
        G.fx.puff(V(x, 0.3, z), { glow: true, vel: V(Math.cos(a) * d, v * G.rng.range(0.75, 1.05), Math.sin(a) * d), g: 14, drag: 0.1, s0: 0.3, s1: 0.08, life: G.rng.range(1.0, 1.4), c0: c.a, c1: c.a, a0: 0.6, spin: 0 });
      }
    },
    plume(x, z, c, r, e, h, n, kind, size) {
      let [c0, c1, add] = PLUME[kind] || PLUME.smoke; if (kind === 'gas') { c0 = c.b; c1 = c.a; }
      const N = Math.max(2, Math.round(n * qual()));
      for (let i = 0; i < N; i++) {
        G.fx.puff(V(x + G.rng.range(-0.3, 0.3) * size * 0.3, 0.3, z + G.rng.range(-0.3, 0.3) * size * 0.3), { glow: add, vel: V(G.rng.range(-0.5, 0.5), (h / 0.95) * G.rng.range(0.8, 1.1), G.rng.range(-0.5, 0.5)), drag: 0.6, s0: size * 0.35, s1: size, life: G.rng.range(1.3, 1.7), delay: i * 0.06, c0, c1, a0: add ? 0.5 : 0.55 });
      }
    },
    spikes(x, z, c, r, e, h, rad, n) {
      if (e && e.x2 !== undefined) for (let i = 0; i < n; i++) { const t = (i + 1) / n; marks.pillar(e.x + (e.x2 - e.x) * t, e.z + (e.z2 - e.z) * t, c.a, { h: h * (0.75 + 0.25 * ((i * 7) % 3) / 2), r: rad, life: 0.7, a: 0.45, rise: 0.1 + i * 0.03 }); }
      else marks.pillar(x, z, c.a, { h, r: rad, life: 0.7, a: 0.45 });
    },
  };
  function layers(list, x, z, c, r, e) {
    if (!list) return;
    for (const L of list) { if (vb <= 0) return; vb--; BUILD[L[0]](x, z, c, r, e, ...L.slice(1)); }
  }

  function look(key) {
    const k = KEYS[key];
    if (k) return k;
    if (!missing.has(key)) { missing.add(key); console.warn('[fxmap] no effect for key ' + key); }
    return null;
  }
  const pal = (k) => STYLE[(k && k.s) || 'steel'];
  const teamCol = (team, p) => (team === 0 ? p : [0xffd0a0, 0xff5a30]);

  function screenAng(ax, az, bx, bz) {
    const a = V(ax, 1, az).project(camera); const b = V(bx, 1, bz).project(camera);
    return Math.atan2((b.y - a.y) * H.size.h, (b.x - a.x) * H.size.w);
  }

  // BZ's pop has a white core at alpha 1.2: in the ultimate's close-up it is a white disc filling the middle of the frame, so
  // there it is a smaller burst in the effect's own colours
  function pop(x, y, z, r, cols) {
    if (budget.pop-- <= 0) return;
    const J = juice(); if (!(J && J.ult && J.ult.active)) { G.fx.pop(V(x, y, z), r, cols); return; }
    G.fx.puff(V(x, y, z), { glow: true, s0: r * 0.5, s1: r * 2, life: 0.3, c0: cols[0], c1: cols[1] || cols[0], a0: 0.45, spin: 0 });
    beats.sparks.burst(x, y, z, 6 + r * 4, { speed: [3, 7], up: 0.6, colors: cols, w: 0.08, len: 0.2, life: 0.4, grav: 4 });
  }
  function boom(x, z, r) {
    if (budget.boom-- <= 0) return;
    if (reduceFlash()) { G.fx.pop(V(x, 0.3, z), r * 0.8, [0xffd070, 0xff6020]); return; }
    G.fx.explosion(V(x, 0.2, z), Math.min(0.7, Math.max(0.4, r / 4.2))); // a hero volley lands several at once: capped so they do not burn out together
  }
  function wave(x, z, r, cols, life = 0.55) { marks.ring(x, z, Math.max(0.3, r * 0.2), r, cols[1], life, 0.85); marks.ring(x, z, 0.2, r * 0.8, cols[0], life * 0.8, 0.22); }

  // ---- parts of the sim `fx` event ----
  const PART = {
    burst(e, k, p) {
      const r = e.r || 1; const cols = teamCol(e.team, p); const n = k.n || 1;
      pop(e.x, 0.3, e.z, Math.min(r >= 3 ? 1.1 : 2, Math.max(0.5, r * 0.4 * Math.min(1.3, n))), cols);
      wave(e.x, e.z, r, cols, 0.5); marks.flare(e.x, e.z, r * 1.1, cols[1], 0.45, e.team === 0 ? 0.3 : 0.5);
      if (e.key === 'gust' && e.team === 0) { marks.whirl(e.x, e.z, r, ctx.colorOf(e.by), WHIRL_DUR); bump('gio_whirl'); }
      if (k.boom && r >= 1.6) { if (k.ult && e.team === 0) G.fx.pop(V(e.x, 0.3, e.z), 1.2, [0xffd070, 0xff6020]); else boom(e.x, e.z, r); } // a volley ultimate lands many at once: their additive shock rings and screen flashes would stack to white
      if (k.s === 'earth' && budget.puff-- > 0) G.fx.chunks && G.fx.chunks(V(e.x, 0.4, e.z), 4 + Math.round(r), [BZ.mat('stone')], V(0, 1, 0), 0.7);
      snd(k.snd || (k.boom ? 'boom' : (e.team === 0 ? 'impact' : 'hit')), e.x, e.z, k.boom ? 0.5 : 0.3);
    },
    cone(e, k, p) {
      const cols = teamCol(e.team, p); const half = (e.deg * Math.PI) / 360; const r = e.r;
      for (let i = 0; i < 16; i++) {
        const a = e.ang + (G.rng.next() * 2 - 1) * half; const d = r * (0.25 + G.rng.next() * 0.75);
        const v = V(e.x + Math.cos(a) * d, 0.5 + G.rng.next() * 0.8, e.z + Math.sin(a) * d);
        G.fx.puff(v, { glow: true, vel: V(Math.cos(a) * 3, 0.5, Math.sin(a) * 3), drag: 1.5, s0: 0.7, s1: 1.8, life: 0.5 + G.rng.next() * 0.3, c0: cols[0], c1: cols[1], a0: 0.7, spin: 0 });
      }
      marks.ring(e.x, e.z, 0.5, r, cols[1], 0.45, 0.6);
      snd(k.snd || 'swipe', e.x, e.z, 0.4);
    },
    line(e, k, p) {
      const cols = teamCol(e.team, p);
      marks.strip(e.x, e.z, e.x2, e.z2, Math.max(0.5, e.w), cols[1], 0.4, 0.8); marks.strip(e.x, e.z, e.x2, e.z2, Math.max(0.2, e.w * 0.3), cols[0], 0.3, 0.95);
      for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; G.fx.puff(V(e.x + (e.x2 - e.x) * t, 0.9, e.z + (e.z2 - e.z) * t), { glow: true, s0: 1.1, s1: 0.3, life: 0.3, c0: cols[0], c1: cols[1], a0: 0.9, spin: 0 }); }
      snd(k.snd || 'saber_swing', e.x, e.z, 0.4);
    },
    heal(e) { rise(e.x, e.z, 0x58e070, 12, 1.3); marks.pillar(e.x, e.z, 0x6ae880, { h: 3.2, r: 0.7, life: 0.65, a: 0.32 }); snd('pickup', e.x, e.z, 0.3); },
    shield(e) { rise(e.x, e.z, 0x9ad8ff, 9, 1.3); marks.pillar(e.x, e.z, 0x9ad8ff, { h: 2.6, r: 1, life: 0.5, a: 0.28 }); },
    bolt(e, k, p) {
      const cols = teamCol(e.team, p); const style = k.bolt || 'tracer';
      const to = V(e.x, 1.2, e.z);
      if (style === 'sky') {
        const J = juice();
        if (J && J.ult && J.ult.active) beats.sparks.drop(e.x, e.z, 10, { colors: [cols[1], cols[0]], w: 0.35, n: 4 }); // BZ's bolt boxes are thick white bars up close
        else { G.fx.bolt(V(e.x, 18, e.z), V(e.x, 0.2, e.z), cols[1]); G.fx.bolt(V(e.x + 0.2, 18, e.z), V(e.x, 0.2, e.z), cols[0]); }
        pop(e.x, 0.3, e.z, 1.4, cols); marks.ring(e.x, e.z, 0.3, 2.2, cols[1], 0.4, 0.9); snd(k.snd || 'thunder', e.x, e.z, 0.35); return;
      }
      if (e.key === 'blades' && cuts) cuts.q.push({ x: e.x, z: e.z });
      const from = V(e.fromX, 1.3, e.fromZ);
      // a chain hop as thin streaks: BZ's arc boxes stop with the world when an ultimate's close-up freezes it and fill the
      // close-up as thick white bars
      if (style === 'arc') beats.zap(from.x, from.y, from.z, to.x, to.y, to.z, cols[1], false);
      else if (style === 'drain') { G.fx.bolt(to, from, 0xff4060); pop(e.x, 1, e.z, 0.7, [0xff7080, 0xa01028]); }
      else if (style === 'slash' && e.key === 'blades') { G.fx.puff(to, { glow: true, s0: 0.3, s1: 1.2, life: 0.18, c0: cols[1], c1: cols[1], a0: 0.7, spin: 0 }); }
      else if (style === 'slash') { G.fx.slash(to, cols[0], screenAng(e.fromX, e.fromZ, e.x, e.z), 1.5); G.fx.puff(to, { glow: true, s0: 0.3, s1: 1.4, life: 0.2, c0: 0xffffff, c1: cols[1], a0: 1, spin: 0 }); }
      else { G.fx.tracer(from, to, cols[1]); pop(e.x, 1, e.z, 0.6, cols); }
      snd(k.snd, e.x, e.z, 0.3);
    },
    mark(e, k, p) { marks.flare(e.x, e.z, e.r, p[1], Math.min(e.dur || 2, 3), 0.28); wave(e.x, e.z, e.r, p, 0.7); },
    pull(e, k, p) { marks.ring(e.x, e.z, e.r, 0.4, p[0], 0.5, 0.8); marks.ring(e.x, e.z, e.r * 0.7, 0.3, p[1], 0.6, 0.6); snd('swipe', e.x, e.z, 0.4); },
  };

  // motes drifting up and round a unit, a few starting high: a heal, a buff, a state or a status on it
  function rise(x, z, c, n, r = 0.9, h = 1) {
    const c0 = mixHex(c, 0xffffff, 0.55);
    for (let i = 0; i < n && budget.puff-- > 0; i++) {
      const a = G.rng.range(0, 6.283); const d = G.rng.range(0.25, r);
      G.fx.puff(V(x + Math.cos(a) * d, G.rng.range(0.1, 1.1), z + Math.sin(a) * d), { glow: true, vel: V(-Math.sin(a) * 0.7, G.rng.range(1.6, 3.2) * h, Math.cos(a) * 0.7), drag: 0.4, s0: G.rng.range(0.26, 0.42), s1: 0.06, life: G.rng.range(0.6, 1.0), delay: (i % 4) * 0.04, c0, c1: c, a0: 1, spin: 0 });
    }
  }
  function sparkle(x, z, cols, n) {
    for (let i = 0; i < n && budget.puff-- > 0; i++) {
      const a = G.rng.range(0, 6.283); const d = G.rng.range(0.3, 1);
      G.fx.puff(V(x + Math.cos(a) * d, 0.3, z + Math.sin(a) * d), { glow: true, vel: V(0, G.rng.range(1.5, 3), 0), drag: 0.5, s0: 0.35, s1: 0.1, life: G.rng.range(0.6, 1), c0: cols[0], c1: cols[1], a0: 1, spin: 0 });
    }
  }

  const lastHurt = new Map();

  // ---- Gió's light: the dash stroke and afterimages, the cut arc, the ten cuts of the ultimate ----
  const dashWin = { uid: 0, until: 0 }; let cuts = null;
  const sideOf = (ax, az, bx, bz) => { const a = V(ax, 1, az).project(camera); const b = V(bx, 1, bz).project(camera); return b.x >= a.x ? 1 : -1; };
  const heroCol = (uid) => ctx.colorOf(uid);
  const coreOf = (c) => new THREE.Color(c).lerp(new THREE.Color(0xdff6ff), 0.3).getHex();
  // a wide additive stroke in the hero's pale colour turns a bright floor white: the same hue with less red cannot clip all three channels
  const coolOf = (c) => { const k = new THREE.Color(c); k.r *= 0.35; return k.getHex(); };
  function gioDash(e, d) {
    const c = heroCol(e.uid); const blink = !!e.blink;
    marks.streak(e.x, 1.0, e.z, e.x2, 1.0, e.z2, blink ? 1.0 : 1.7, coolOf(c), blink ? 0.4 : 0.55, 0.6, { sweep: 0.07, k: [0.1, 0.75, 0.1], kind: 'dash' });
    marks.streak(e.x, 1.0, e.z, e.x2, 1.0, e.z2, blink ? 0.22 : 0.3, coreOf(c), blink ? 0.34 : 0.5, 0.45, { sweep: 0.06, k: [0.3, 1, 0.3], kind: 'dash' });
    const n = Math.max(1, Math.round((blink ? 2 : 4) * Math.min(1, qual() + 0.34))); const flip = sideOf(e.x, e.z, e.x2, e.z2);
    for (let i = 0; i < n; i++) { const t = blink ? 0.3 + i * 0.4 : (i + 0.5) / n * 0.92 + 0.04; marks.ghost(e.x + (e.x2 - e.x) * t, e.z + (e.z2 - e.z) * t, c, { delay: i * 0.025, life: 0.38, a: 0.55, flip, drift: 0.5 }); }
    if (!blink) { dashWin.uid = e.uid; dashWin.until = ctx.time() + 0.04; bump('gio_dash'); }
  }
  function dashHit(e) {
    const c = heroCol(dashWin.uid); const cols = [coreOf(c), c];
    pop(e.x, 1, e.z, 0.8, cols); G.fx.slash(V(e.x, 1.1, e.z), cols[0], G.rng.range(-0.8, 0.8), 1.6);
    marks.flash(e.x, 1.1, e.z, 1.8, c, 0.4); bump('gio_dash_hit');
  }
  function cutAt(i, x, z) {
    const fin = i === SLASH_N - 1; const u = cuts && ctx.unit(cuts.uid); const c = heroCol(cuts.uid);
    const rt = V(1, 0, 0).applyQuaternion(camera.quaternion); const up = V(0, 1, 0).applyQuaternion(camera.quaternion);
    const th = (i % 2 ? -1 : 1) * (0.5 + 0.16 * ((i * 7) % 3)) + (fin ? 0.1 : 0); const L = fin ? 6.2 : 4.3 + 0.4 * ((i * 5) % 3);
    const jx = ((i * 53) % 7 - 3) * 0.25; const jz = ((i * 29) % 5 - 2) * 0.25;
    const cx = x + jx; const cz = z + jz; const cy = 1.4;
    const dx = (rt.x * Math.cos(th) + up.x * Math.sin(th)) * L; const dy = (rt.y * Math.cos(th) + up.y * Math.sin(th)) * L; const dz = (rt.z * Math.cos(th) + up.z * Math.sin(th)) * L;
    const sgn = i % 2 ? -1 : 1;
    marks.streak(cx - dx * sgn, cy - dy * sgn, cz - dz * sgn, cx + dx * sgn, cy + dy * sgn, cz + dz * sgn, fin ? 1.3 : 0.75, coolOf(c), 0.45, 0.6, { sweep: 0.06, k: [0.08, 0.55, 0.08], kind: 'cut', bow: 0.05 * sgn });
    marks.streak(cx - dx * sgn, cy - dy * sgn, cz - dz * sgn, cx + dx * sgn, cy + dy * sgn, cz + dz * sgn, fin ? 0.3 : 0.15, coreOf(c), 0.4, 0.9, { sweep: 0.06, k: [0.14, 0.5, 0.14], kind: 'cut', bow: 0.05 * sgn });
    pop(x, 1.1, z, 0.55, [c, c]); marks.flash(x, 1.2, z, fin ? 1.8 : 1.4, c, fin ? 0.12 : 0.22);
    if (fin) { marks.ring(x, z, 0.5, 5, c, 0.5, 0.8); marks.wall(x, z, 0.5, 4.5, c, 0.45, 1.6, 0.4); }
    bump('gio_slash'); snd('swipe', x, z, 0.35); void u;
    const J = window.__G && window.__G.juice; if (J && J.slash) J.slash(i, fin);
  }
  // Gió's basic cut: a short diagonal streak across the target, alternating direction
  let gioSide = 1;
  function gioCut(at, cols) {
    gioSide = -gioSide; const rt = V(1, 0, 0).applyQuaternion(camera.quaternion); const up = V(0, 1, 0).applyQuaternion(camera.quaternion);
    const th = gioSide * 0.6; const L = 1.7; const dx = (rt.x * Math.cos(th) + up.x * Math.sin(th)) * L; const dy = (rt.y * Math.cos(th) + up.y * Math.sin(th)) * L; const dz = (rt.z * Math.cos(th) + up.z * Math.sin(th)) * L;
    marks.streak(at.x - dx, at.y - dy, at.z - dz, at.x + dx, at.y + dy, at.z + dz, 0.55, cols[1], 0.2, 0.9, { sweep: 0.04, k: [0.1, 0.7, 0.1], kind: 'hit' });
    marks.streak(at.x - dx, at.y - dy, at.z - dz, at.x + dx, at.y + dy, at.z + dz, 0.16, cols[0], 0.17, 0.9, { sweep: 0.04, k: [0.25, 0.9, 0.25], kind: 'hit' });
    pop(at.x, at.y, at.z, 0.4, cols);
  }
  function updateCuts(B) {
    if (!cuts) return;
    while (cuts.i < SLASH_N) {
      const due = ULT_CUTS.every * cuts.i; const dt = B.t - cuts.t0;
      if (dt < due - 1e-6) break;
      let tgt = cuts.q.shift();
      if (!tgt) { if (dt < due + 0.12) break; const u = ctx.unit(cuts.uid); tgt = u ? { x: u.x + Math.cos(u.face) * 1.8, z: u.z + Math.sin(u.face) * 1.8 } : { x: 0, z: 0 }; }
      cutAt(cuts.i++, tgt.x, tgt.z);
    }
    if (cuts.i >= SLASH_N) cuts = null;
  }
  // a hero's blade arc: edge points at the tip and a third of the way up the blade, from the cut phase of the swing
  function swordArc(a) {
    const g = a.grip; if (!g || g.row.type !== 'sword2') return;
    const sw = a.st.swing; const inCut = sw >= 0.3 && sw < 0.62 && a.u.alive;
    if (inCut) {
      if (!a.arc || !a.arc.on) { a.arc = marks.arc(heroCol(a.u.uid), 0.11, 0.95, [0.2, 1, 0.2]); bump('gio_arc'); }
      a.node.updateMatrixWorld(true); const o = g.objs[0].g;
      const t = o.localToWorld(V(0, 1.1, 0)); const b = o.localToWorld(V(0, 0.38, 0));
      marks.arcPush(a.arc, t.x, t.y, t.z, b.x, b.y, b.z);
    } else if (a.arc) { marks.arcEnd(a.arc); a.arc = null; }
  }

  // ---- the beats of a beast's skills ----
  const heroOf = (uid) => { const u = uid ? ctx.unit(uid) : null; return u && u.hero ? u : null; };
  const skillOf = (u, slot) => (slot === 'ult' ? u.def && u.def.ult : u.skills && (u.skills.find((s) => s.slot === slot) || {}).def);
  // seconds from a cast to its first impact: the longest own delay of a self-timed op, capped; 0 when it lands at once
  function waitOf(def) { let w = 0; if (def && def.ops) for (const o of def.ops) if (o.delay && SELF_TIMED.has(o.op)) w = Math.max(w, o.delay); return Math.min(0.9, w); }
  function heroCast(u, slot) {
    const def = skillOf(u, slot); const wait = waitOf(def); lastCast.set(u.uid, { t: ctx.time(), slot, wait });
    if (slot !== 'ult') beats.gong(u, wait || HOLD, { color: ctx.colorOf(u.uid) });
  }
  // an instant skill's part arrives in the cast's own tick: drawn HOLD later, after the wind-up
  const instant = (uid) => { const c = lastCast.get(uid); return !!c && !c.wait && c.slot !== 'ult' && c.t === ctx.time(); };
  function heroBung(u, e, shape) {
    if (bungLeft-- <= 0) return;
    const c = lastCast.get(u.uid); const isUlt = c && c.slot === 'ult' && ctx.time() - c.t < 0.05;
    let x = e.x; let z = e.z; let r = e.r || (shape === 'bolt' ? 1.6 : 2); const o = { color: ctx.colorOf(u.uid) };
    if (e.part === 'cone') { x = e.x + Math.cos(e.ang) * e.r * 0.55; z = e.z + Math.sin(e.ang) * e.r * 0.55; r = e.r * 0.6; }
    if (e.part === 'line') { o.line = [e.x, e.z, e.x2, e.z2, e.w]; x = e.x2; z = e.z2; r = Math.max(1.2, e.w * 1.5); }
    beats.bung(u, isUlt && shape === 'burst' && r >= 4 ? 'ult' : shape, x, z, r, o);
    if (shape === 'burst') { const J = juice(); if (J && J.skillHit && !isUlt) J.skillHit(r); }
    knock(u, e, c);
  }
  // knock-back you can see: the foes a burst pushes skid away on a short torn scar and a puff of dust
  function knock(u, e, c) {
    if (e.part !== 'burst' || !c) return; const def = skillOf(u, c.slot); const op = def && def.ops && def.ops.find((o) => o.kb); if (!op) return;
    const B = window.__G && window.__G.B; if (!B) return; let n = 0;
    for (const f of B.enemies) {
      if (!f.alive || n >= 8) continue; const dx = f.x - e.x; const dz = f.z - e.z; const d = Math.hypot(dx, dz); if (d > (e.r || 2) + 0.5 || d < 0.05) continue;
      n++; const L = Math.min(2.4, op.kb + 0.4); const ux = dx / d; const uz = dz / d;
      beats.decals.add({ x: f.x - ux * L * 0.5, z: f.z - uz * L * 0.5, sx: L * 0.55, sz: 0.35, rot: Math.atan2(uz, ux), kind: 4, color: 0x2a2018, glow: 0x6a5040, life: 1.6 });
      if (budget.puff-- > 0) G.fx.puff(V(f.x, 0.3, f.z), { vel: V(ux * 3, 0.6, uz * 3), drag: 2.4, s0: 0.6, s1: 1.6, life: 0.6, c0: 0xb8ae98, c1: 0x8a8070, a0: 0.5 });
    }
  }
  // a beast's hit on a foe: a short glint where it lands; a critical is a bigger gold star with rays
  function hitFeel(e) {
    const by = heroOf(e.by); if (!by || e.dot || e.x === undefined) return;
    const t = ctx.unit(e.uid); const y = t && t.boss ? 2.4 : 1.1;
    if (e.crit) {
      beats.sparks.emit({ x: e.x, y, z: e.z, life: 0.16, w: 0.9, len: 0.9, stretch: 0, color: 0xffe9a0, a: 0.9, kind: 1 });
      beats.sparks.burst(e.x, y, e.z, 6, { speed: [5, 9], up: 0.5, colors: [0xffd860, 0xfff0c0], w: 0.07, len: 0.25, life: 0.22, grav: 0 });
      bump('crit_glint'); return;
    }
    if (hitLeft-- <= 0) return;
    const sk = beats.skinOf(by, ctx.colorOf(by.uid));
    beats.sparks.burst(e.x, y, e.z, 3, { speed: [3, 6], up: 0.4, colors: [sk.core, sk.edge], w: 0.06, len: 0.18, life: 0.16, grav: 0 });
  }
  function hold(uid) { if (!held.has(uid)) held.set(uid, []); }
  function release(uid) {
    const q = held.get(uid); if (!q) return; held.delete(uid);
    const u = ctx.unit(uid);
    if (u) { beats.bung(u, 'release', u.x, u.z, 3, { color: ctx.colorOf(uid) }); bump('ult_release'); }
    for (const e of q) dispatch(e);
  }

  // ---- event handlers: return nothing; ctx supplies unit lookups ----
  const ON = {
    fx(e) {
      const hu = e.team !== 1 && heroOf(e.by || e.uid);
      if (hu && instant(hu.uid) && !e.late) { beats.later(HOLD, () => ON.fx({ ...e, late: true })); return; }
      if (hu && PART_SHAPE[e.part]) heroBung(hu, e, PART_SHAPE[e.part]);
      const k = look(e.key); if (!k) { PART.burst(e, KEYS.slash, STYLE.steel); return; }
      const p = pal(k); const f = PART[e.part]; if (!f) return;
      f(e, k, p); bump(e.key);
      const set = VERT[e.key] && VERT[e.key].land; if (!set) return;
      let x = e.x; let z = e.z;
      if (e.part === 'cone') { x = e.x + Math.cos(e.ang) * e.r * 0.6; z = e.z + Math.sin(e.ang) * e.r * 0.6; } else if (e.part === 'line') { x = e.x2; z = e.z2; }
      layers(set, x, z, colorsFor(e.key, e.by || e.uid), e.part === 'bolt' ? 2 : e.r, e);
    },
    tele(e) {
      const k = look(e.key); marks.tele(e.team === 1 && BOSS_KEYS.has(e.key) ? { ...e, boss: true } : e, k && k.fall); if (k) bump(e.key);
    },
    zone(e) {
      if (e.team === 0) { const B = window.__G && window.__G.B; const u = B && B.heroes.find((h) => h.alive && lastCast.has(h.uid) && lastCast.get(h.uid).t === ctx.time()); if (u) beats.later(e.delay || (instant(u.uid) ? HOLD : 0), () => beats.bung(u, 'zone', e.x, e.z, e.r, { color: ctx.colorOf(u.uid) })); }
      const k = look(e.key); if (!k || !k.z) { if (k) bump(e.key); return; }
      marks.zoneStart(e, k.z); bump(e.key);
      const p = pal(k); marks.ring(e.x, e.z, 0.5, e.r, p[1], 0.5, 0.7);
      layers(VERT[e.key] && VERT[e.key].zone, e.x, e.z, { a: p[1], b: mixHex(p[1], p[0], 0.5) }, e.r, e);
    },
    zone_end(e) { marks.zoneEnd(e.id); },
    // nothing on the ground outlives the wave: warnings, zones, rings and Blockade Z's decals go when it is cleared or the battle ends
    wave_clear() { G.fx.clear(); marks.clear(); beats.clear(); },
    won() { G.fx.clear(); marks.clear(); beats.clear(); },
    lost() { G.fx.clear(); marks.clear(); beats.clear(); },
    cast(e) {
      const u = ctx.unit(e.uid); if (!u) return; if (u.hero) heroCast(u, e.slot); const k = look(e.key); if (!k) return; bump(e.key);
      const p = u.hero ? [0xffffff, ctx.colorOf(e.uid)] : pal(k);
      rise(u.x, u.z, p[1], 5, 0.8); marks.flare(u.x, u.z, 2, p[1], 0.5, 0.3);
      if (k.snd && !u.hero) snd(k.snd, u.x, u.z, 0.5);
      layers(VERT[e.key] && VERT[e.key].cast, u.x, u.z, colorsFor(e.key, e.uid), undefined, e);
    },
    ult(e) {
      const u = ctx.unit(e.uid); if (!u) return; const k = look(e.key); if (k) bump(e.key);
      lastCast.set(u.uid, { t: ctx.time(), slot: 'ult', wait: 0 });
      const J = juice(); const wait = J && J.ultBegin ? J.ultBegin(e) : 0;
      beats.gong(u, wait || HOLD, { ult: true, real: wait > 0, color: ctx.colorOf(u.uid) });
      if (wait > 0) {
        hold(u.uid); held.get(u.uid).push({ ...e, e: 'ultFx' });
        // a tracer still in flight would stand frozen through the hold and pass the close-up lens as a thick white bar
        if (G.fx.dbgTracers) for (const t of G.fx.dbgTracers) { t.life = 0; t.m.visible = false; }
      } else ON.ultFx(e);
    },
    // the ultimate's base look at the caster, drawn when its wind-up is over
    ultFx(e) {
      const u = ctx.unit(e.uid); if (!u) return;
      if (e.key === 'blades') cuts = { t0: ctx.time(), i: 0, q: [], uid: e.uid, n: 0 };
      const c = ctx.colorOf(e.uid); const col = new THREE.Color(c);
      marks.flare(u.x, u.z, 4.5, c, 0.9, 0.3); marks.ring(u.x, u.z, 0.5, ULT_SPAN, c, 0.7, 0.8); marks.ring(u.x, u.z, 0.3, ULT_SPAN * 0.6, c, 0.55, 0.4);
      pop(u.x, 1, u.z, 1.1, [col.getHex(), col.getHex()]); snd('wave_start', u.x, u.z, 0.4);
      const cc = { a: c, b: mixHex(c, 0xffffff, 0.35) }; marks.wash(c, 0.8, 0.22);
      const J = juice(); layers(J && J.ult && J.ult.active ? GENERIC_ULT.filter((L) => L[0] !== 'pillar') : GENERIC_ULT, u.x, u.z, cc, ULT_SPAN, e); layers(VERT[e.key] && VERT[e.key].ult, u.x, u.z, cc, ULT_SPAN, e);
    },
    dash(e) {
      const hu = heroOf(e.uid);
      if (hu && instant(hu.uid) && !e.late) { beats.later(HOLD, () => ON.dash({ ...e, late: true })); return; }
      if (hu && bungLeft-- > 0) beats.bung(hu, 'dash', e.x2, e.z2, 2, { color: ctx.colorOf(hu.uid), line: [e.x, e.z, e.x2, e.z2, 1.4] });
      const k = look(e.key); if (k) bump(e.key);
      const p = pal(k); const dx = e.x2 - e.x; const dz = e.z2 - e.z; const d = Math.hypot(dx, dz);
      marks.strip(e.x, e.z, e.x2, e.z2, 1.1, p[1], 0.35, 0.7);
      if (e.key === 'dash' || (e.key === 'blades' && e.blink)) gioDash(e, d);
      const n = Math.min(10, Math.ceil(d / 1.2));
      for (let i = 0; i < n && budget.puff-- > 0; i++) { const t = i / n; G.fx.puff(V(e.x + dx * t, 0.6, e.z + dz * t), { glow: true, s0: 0.9, s1: 0.2, life: 0.35, c0: p[0], c1: p[1], a0: 0.8, spin: 0 }); }
      if (e.jump) { marks.ring(e.x2, e.z2, 0.4, 2, p[1], 0.4, 0.8); G.fx.puff(V(e.x2, 0.3, e.z2), { s0: 0.8, s1: 2.4, life: 0.5, c0: 0xb8b0a0, c1: 0x9a9488, a0: 0.5 }); }
      snd('swipe', e.x, e.z, 0.3);
      const set = VERT[e.key] && VERT[e.key].dash; if (set) { const c = colorsFor(e.key, e.uid); layers(set, e.x2, e.z2, c, undefined, e); if (e.blink || e.key === 'phase') layers(set, e.x, e.z, c, undefined, e); }
    },
    summon(e) {
      const u = ctx.unit(e.owner); const c = u && u.hero ? ctx.colorOf(e.owner) : 0xb0c0ff;
      pop(e.x, 0.6, e.z, 1.1, [0xffffff, c]); rise(e.x, e.z, c, 6, 1); bump('summon'); snd('pickup', e.x, e.z, 0.3);
      if (u && u.hero && bungLeft-- > 0) beats.bung(u, 'heal', e.x, e.z, 1.4, { color: c });
    },
    spawn(e) {
      if (arenaNorm(e.x, e.z) < 0.98) { // spawned inside the arena by a skill: the old pop
        const c = e.boss ? 0xff6030 : 0xc8b0ff; pop(e.x, 0.5, e.z, 0.9, [0xffffff, c]); marks.ring(e.x, e.z, 0.3, 1.6, c, 0.4, 0.7); return;
      }
      // climbing over the island's edge (arrival.js): a splash of the water or a puff of the abyss where it comes up, and a
      // few dislodged blocks falling away
      const W = H.world; const th = W ? W.theme : null; const ap = W ? W.arrival(e.x, e.z) : null;
      const ex = ap ? e.x + ap.dx * ap.d : e.x; const ez = ap ? e.z + ap.dz * ap.d : e.z;
      const wet = !!th && th.abyss.type === 'water'; const ey = wet ? th.abyss.y + 0.3 : -0.8;
      const cA = th ? (wet ? th.abyss.foam : th.abyss.shallow) : 0xa9b6c4; const cB = th ? (wet ? th.abyss.shallow : th.abyss.haze) : 0xa9b6c4;
      const su = ctx.unit(e.uid);
      if (su && su.horde) { if (W && !(ap && ap.bridge) && G.rng.chance(0.35)) W.debris(ex, ez, 1, 2); if (budget.puff > 0 && G.rng.chance(0.3)) { budget.puff--; G.fx.puff(V(ex, ey, ez), { vel: V(0, 2.4, 0), drag: 1.8, s0: 0.7, s1: 1.7, life: 0.55, c0: cA, c1: cB, a0: 0.55 }); } return; }
      const fog = new THREE.Color(cB); const mist = fog.getHex(); const pale = new THREE.Color(cA).lerp(new THREE.Color(0xffffff), 0.2).getHex();
      if (W && !e.boss && !(ap && ap.bridge)) W.debris(ex, ez, e.elite ? 4 : 2, 2.5);
      if (e.boss) {
        if (W) W.quake(e.x, e.z);
        const dark = fog.clone().multiplyScalar(0.28).getHex(); const mid = fog.clone().multiplyScalar(0.55).getHex();
        for (let i = 0; i < 9; i++) {
          const a = G.rng.range(0, 6.283); const d = G.rng.range(0, 1.6);
          G.fx.puff(V(e.x + Math.cos(a) * d, 0.4 + G.rng.range(0, 0.8), e.z + Math.sin(a) * d), { vel: V(Math.cos(a) * 1.4, G.rng.range(2.2, 4.2), Math.sin(a) * 1.4), drag: 1.4, s0: 1.6, s1: 4.6, life: 1.1 + G.rng.range(0, 0.4), c0: dark, c1: mid, a0: 0.85 });
        }
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; G.fx.puff(V(e.x, 0.3, e.z), { vel: V(Math.cos(a) * 5, 0.5, Math.sin(a) * 5), drag: 2.2, s0: 1.2, s1: 3, life: 0.8, c0: mid, c1: mist, a0: 0.6 }); }
        marks.ring(e.x, e.z, 0.6, 7, 0x2a2038, 0.8, 0.85); marks.ring(e.x, e.z, 0.4, 4.6, 0x6a5a82, 0.65, 0.5);
        snd('heavy', e.x, e.z, 0.3);
        return;
      }
      const n = e.elite ? 7 : 4; const big = e.elite ? 1.4 : 1;
      for (let i = 0; i < n; i++) {
        const a = G.rng.range(0, 6.283);
        G.fx.puff(V(ex, ey + G.rng.range(0, 0.4), ez), { vel: V(Math.cos(a) * 1.2, G.rng.range(1.8, 3.2), Math.sin(a) * 1.2), drag: 1.8, s0: 0.8 * big, s1: 2.0 * big, life: 0.6 + G.rng.range(0, 0.2), c0: pale, c1: mist, a0: 0.65 });
      }
      marks.ring(e.x, e.z, 0.3, e.elite ? 2.2 : 1.5, pale, 0.5, 0.55);
    },
    heal(e) { if (e.amt > 0 && budget.puff > 0) { sparkle(e.x, e.z, [0xd8ffb8, 0x58e070], 2); } },
    revive(e) {
      const u = ctx.unit(e.uid); const x = e.x; const z = e.z; bump('revive');
      marks.pillar(x, z, 0xffd860, 1.1); rise(x, z, 0xffd860, 14, 1.5, 1.3); void u;
    },
    die(e) {
      if (e.expire) { rise(e.x, e.z, 0xc8d0ff, 5, 0.8); return; }
      const u = ctx.unit(e.uid); if (!u) return;
      if (u.hero) { pop(e.x, 0.8, e.z, 1.2, [0xffffff, 0xff6070]); marks.ring(e.x, e.z, 0.3, 2.4, 0xff6070, 0.5, 0.8); return; }
      if (e.boss) { boom(e.x, e.z, 5); wave(e.x, e.z, 7, STYLE.fire, 0.8); marks.flare(e.x, e.z, 6, 0xffa040, 0.7, 0.45); layers(BOSS_DEATH, e.x, e.z, { a: 0xffa040, b: 0xffd890 }, 7, e); return; }
      if (u.horde) return; // the horde renderer's own cubes
      if (budget.puff-- > 0) G.fx.puff(V(e.x, 0.5, e.z), { s0: 0.6, s1: 1.9, life: 0.55, c0: 0xa8a49c, c1: 0x7a766e, a0: 0.45 });
    },
    hit(e) {
      hitFeel(e);
      if (dashWin.uid && e.by === dashWin.uid && ctx.time() <= dashWin.until && !e.dot && e.x !== undefined) dashHit(e);
      const u = ctx.unit(e.uid); if (!u || !u.hero) return;
      if (e.shield) { pop(u.x, 1.2, u.z, 0.45, [0xffffff, 0x9ad8ff]); return; }
      const t = lastHurt.get(e.uid) || 0; if (ctx.time() - t < 0.18) return; lastHurt.set(e.uid, ctx.time());
      pop(u.x, 1.3, u.z, 0.45, [0xffffff, 0xff5060]);
    },
    block(e) { const u = ctx.unit(e.uid); if (u) { pop(u.x, 1.3, u.z, 0.5, [0xffffff, 0xffd860]); marks.flash(u.x, 1.3, u.z, 1.2, 0xffd860, 0.3); } },
    buff(e) { const u = ctx.unit(e.uid); if (!u) return; const k = look(e.key); if (k) bump(e.key); const p = pal(k); rise(u.x, u.z, p[1], 10, 1.1); if (u.hero && lastCast.has(u.uid) && lastCast.get(u.uid).t === ctx.time() && bungLeft-- > 0) beats.bung(u, 'self', u.x, u.z, 2.2, { color: ctx.colorOf(u.uid) }); },
    state(e) {
      const u = ctx.unit(e.uid); if (!u) return; const k = look(e.fx); if (k) bump(e.fx);
      const p = STATE[e.key] || pal(k); rise(u.x, u.z, p[1], 10, 1.1); snd('saber_on', u.x, u.z, 0.3);
      if (u.hero && lastCast.has(u.uid) && lastCast.get(u.uid).t === ctx.time() && bungLeft-- > 0) beats.bung(u, 'self', u.x, u.z, 2.2, { color: ctx.colorOf(u.uid) });
    },
    status(e) { const u = ctx.unit(e.uid); if (u && u.hero) { const c = { burn: 0xff7030, poison: 0x78d838, freeze: 0x8ae0ff, slow: 0x8ab8ff, stun: 0xffe860, root: 0x8a6a44, bleed: 0xc02838 }[e.k]; if (c) rise(u.x, u.z, c, 4, 0.7); } },
  };

  function dispatch(e) { const h = ON[e.e]; if (h) h(e); }

  // ---- basic attacks ----
  function attack(e, from, hero) {
    const k = look(e.key); if (!k) return; bump(e.key);
    const p = pal(k); const team = ctx.unit(e.uid) ? ctx.unit(e.uid).team : 0; const cols = teamCol(team, p);
    const tgt = V(e.tx, 1.0, e.tz); const kind = k.atk;
    if (e.kind === 'shot' || e.kind === 'cone') {
      const n = e.kind === 'cone' ? 3 : 1;
      // in the ultimate's close-up a tracer box passes near the lens as a thick white bar: a streak of light in its colour instead
      const J = juice(); const close = J && J.ult && J.ult.active;
      for (let i = 0; i < n; i++) {
        const to = V(e.tx + G.rng.range(-0.3, 0.3) * (n > 1 ? 2 : 1), 1.0, e.tz + G.rng.range(-0.3, 0.3));
        if (close) { const d = to.clone().sub(from); const L = d.length() || 1; beats.sparks.emit({ x: from.x, y: from.y, z: from.z, vx: d.x / 0.08, vy: d.y / 0.08, vz: d.z / 0.08, life: 0.08, w: 0.06, len: Math.min(2, L * 0.3), stretch: 0, color: cols[1], a: 0.8 }); }
        else G.fx.tracer(from.clone(), to, cols[1]);
      }
      G.fx.muzzle(from); if (e.key === 'shuriken' || e.key === 'javelin') pop(e.tx, 1, e.tz, 0.5, cols);
      if (!hero) snd(e.key === 'plasma' ? 'smg' : 'pistol', e.x, e.z, 0.3);
      return;
    }
    if (e.kind === 'proj') { G.fx.muzzle(from); if (!hero) snd(e.key === 'boulder' ? 'swipe' : 'pistol', e.x, e.z, 0.25); return; }
    // melee: a slash in front of the attacker, aimed along the screen direction of the blow
    const dx = e.tx - e.x; const dz = e.tz - e.z; const d = Math.hypot(dx, dz) || 1; const f = Math.min(d, 1.5) / d;
    const at = V(e.x + dx * f, 1.0, e.z + dz * f); const ang = screenAng(e.x, e.z, e.tx, e.tz);
    if (kind === 'slash' && e.key === 'slash' && hero) gioCut(at, [coreOf(heroCol(e.uid)), heroCol(e.uid)]);
    else if (kind === 'slash') G.fx.slash(at, cols[0], ang + 0.5, k.n || 1.5);
    else if (kind === 'thrust') { G.fx.slash(tgt, cols[0], ang, 1.8); G.fx.tracer(V(e.x, 1.1, e.z), tgt, cols[1]); }
    else if (kind === 'punch') { G.fx.pop(tgt, 0.6, cols); G.fx.slash(tgt, cols[0], ang, 1.1); }
    else if (kind === 'claw') { G.fx.slash(V(e.tx, 1.1, e.tz), 0xffb0a0, ang + 1.2, 0.8); }
    else if (kind === 'bite') { G.fx.slash(V(e.tx, 0.9, e.tz), 0xfff0e0, ang + 1.6, 0.7); }
    else if (kind === 'smash') { marks.ring(e.tx, e.tz, 0.4, 2.2, 0xd8c8a8, 0.4, 0.7); G.fx.puff(V(e.tx, 0.3, e.tz), { s0: 0.8, s1: 2.8, life: 0.5, c0: 0xb8ae98, c1: 0x8a8070, a0: 0.55 }); snd('heavy', e.tx, e.tz, 0.35); }
  }

  // ---- projectiles drawn from B.projs ----
  const projs = new Map();
  // one group per projectile on screen, kept per look and reused: a volley does not build geometry and materials anew
  const projFree = new Map();
  const PROJ_BLOB = { mesh: 'blob', c: 0xfff0b0, size: 0.9, arc: 0 };
  function takeProj(def) {
    const free = projFree.get(def); const g = free && free.pop();
    if (g) { g.visible = true; g.rotation.set(0, 0, 0); return g; }
    return buildProj(def);
  }
  function dropProj(r) { r.g.visible = false; let free = projFree.get(r.def); if (!free) { free = []; projFree.set(r.def, free); } free.push(r.g); }
  function buildProj(def) {
    const g = new THREE.Group();
    const col = (c) => new THREE.MeshBasicMaterial({ color: c });
    // every projectile is a block: a rocket a long box with a red tip, a rock a tumbling lump, a scarab a shell box with
    // gold wing plates, anything else a glowing cube that spins as it flies
    const box = (sx, sy, sz, m) => new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    if (def.mesh === 'rocket') { const b = box(0.26, 0.26, 0.7, new THREE.MeshLambertMaterial({ color: 0xe8e8f0 })); const n = box(0.18, 0.18, 0.22, col(0xff4a30)); n.position.z = 0.45; g.add(b, n); }
    else if (def.mesh === 'rock') { const r = box(0.8, 0.66, 0.74, new THREE.MeshLambertMaterial({ color: 0x8a7a68 })); r.userData.tumble = 1; g.add(r); }
    else if (def.mesh === 'scarab') { const b = box(0.5, 0.3, 0.66, col(0x30c890)); g.add(b); const w = box(0.7, 0.04, 0.3, col(0xffd860)); w.position.y = 0.2; g.add(w); }
    else { const s = 0.44 * def.size; const c = box(s, s, s, col(def.c)); c.userData.tumble = 1; g.add(c); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: def.c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.setScalar(1.4 * def.size); g.add(sp); scene.add(g); return g;
  }
  function syncProjs(B, dt) {
    const seen = new Set();
    for (const p of B.projs) {
      seen.add(p); let r = projs.get(p);
      if (!r) { const def = PROJ[p.key] || PROJ_BLOB; r = { g: takeProj(def), def, d0: Math.hypot(p.tx - p.x, p.tz - p.z) + 0.01, x: p.x, z: p.z }; projs.set(p, r); }
      const k = 1 - Math.exp(-30 * dt); r.x += (p.x - r.x) * k; r.z += (p.z - r.z) * k;
      const left = Math.hypot(p.tx - r.x, p.tz - r.z); const prog = Math.min(1, Math.max(0, 1 - left / r.d0));
      const y = 1.2 + Math.sin(Math.PI * prog) * r.def.arc; r.g.position.set(r.x, y, r.z);
      if (r.def.spin) r.g.rotation.y += r.def.spin * dt; else r.g.lookAt(p.tx, 1.0, p.tz);
      const c0 = r.g.children[0]; if (c0.userData.tumble) { c0.rotation.x += dt * 7; c0.rotation.z += dt * 5; }
      if (r.def.trail && budget.puff > 0) G.fx.trail(r.g.position);
      else if (r.def.mesh === 'blob' && budget.puff-- > 0 && G.rng.chance(0.5)) G.fx.puff(r.g.position.clone(), { glow: true, s0: 0.5, s1: 0.1, life: 0.25, c0: r.def.c, c1: r.def.c, a0: 0.6, spin: 0 });
    }
    for (const [p, r] of projs) if (!seen.has(p)) { dropProj(r); projs.delete(p); }
  }

  // ---- lingering effects on units ----
  function unitsFx(B, dt) {
    for (const u of B.units) {
      if (!u.alive || !u.status) continue;
      const s = u.status; if (!(s.burn || s.poison || s.freeze || s.bleed)) continue;
      if (!u.hero) continue; // enemy statuses are drawn by the zombie pool itself
      if (!G.rng.chance(dt * 9) || budget.puff-- <= 0) continue;
      const c = s.burn ? [0xffd070, 0xff4010] : s.poison ? [0xd0ff70, 0x4aa820] : s.freeze ? [0xffffff, 0x7ad0ff] : [0xff7080, 0xa01028];
      G.fx.puff(V(u.x + G.rng.range(-0.4, 0.4), 0.4, u.z + G.rng.range(-0.4, 0.4)), { glow: !!s.burn, vel: V(0, s.burn ? 2 : 0.8, 0), drag: 0.6, s0: 0.4, s1: 0.8, life: 0.7, c0: c[0], c1: c[1], a0: 0.7 });
    }
  }

  return {
    KEYS, counters, missing, STYLE, look,
    onEvent(e) { if (held.size && e.e !== 'ult') { for (const q of held.values()) { q.push(e); return; } } dispatch(e); },
    hold, release, held, beats,
    attack, swordArc, WHIRL_DUR,
    update(B, dt) {
      { const J = juice(); pix.glowK(J && J.ult && J.ult.active ? GLOW_CLOSE : 1); }
      budget = { pop: 8, boom: 2, puff: 60 }; vb = 28; bungLeft = BUNG_CAP; hitLeft = HIT_CAP;
      if (B) { syncProjs(B, dt); unitsFx(B, dt); updateCuts(B); } marks.update(dt, B, beats.zap);
      const J = juice(); beats.update(dt, J ? J.realDt || dt : dt);
    },
    clear() { for (const r of projs.values()) dropProj(r); projs.clear(); marks.clear(); beats.clear(); held.clear(); lastCast.clear(); cuts = null; dashWin.uid = 0; },
    wrapA,
  };
}
