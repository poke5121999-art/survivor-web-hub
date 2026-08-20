/*
 * Ca Trực Đêm — a playable build of the "REPO 2D TOP DOWN" design doc.
 * See docs/proposals/repo-2d-topdown.md in the meta-repo for the design this implements.
 *
 * Single player. The doc targets 1-6 players; multiplayer is deliberately NOT here, because
 * the co-carry and object-authority work it needs is the largest single item in the doc and
 * belongs on a server (realm-server/), not in this file.
 */
(() => {
'use strict';

// ============================================================ config
const TILE = 24;
const RW = 21, RH = 15;          // room size in tiles
const GX = 3,  GY = 3;           // rooms per level
const MW = RW * GX, MH = RH * GY;
const WPX = MW * TILE, HPX = MH * TILE;
// How much HOUSE fits on screen must not depend on how big the screen is, and since the page now
// letterboxes the canvas to a fixed 9:16 column (index.html `.screen`, sized by fitCanvas below),
// that is ONE number rather than two: the world WIDTH the frame spans. Height follows the aspect.
// It is one room plus a tile of margin, so a room's two side walls and both its side doors are on
// screen together — which is what you need in order to read a room and aim a cart at a door.
// WHY a fixed number at all: the build used to multiply a fixed zoom by whatever the canvas happened
// to be, so a small screen showed barely half the world a desktop did.
// ROOT-CAUSE: view scale was expressed in screen pixels, and screens differ.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md (the landscape form of this rule)
// 14 tiles across. It was 22 — a whole room plus a tile — which is a good number for reading a room
// and a bad one for reading a PERSON: on a 390 px phone that drew a tile at 17 px and the player
// eleven px across. Closer in costs you the far wall of a wide room; the minimap is what that wall
// was for. One number, so it is one edit to change your mind.
const VIEW_W_WORLD = 14 * TILE;
const zoom = () => viewW / VIEW_W_WORLD;

// A corridor the generator carves to repair a walled-off room. Doors are already 3 tiles wide;
// this is the same width, so a repaired room is a room the cart can still be pushed into.
// WHY: the cart is 40 px across and a tile is 24, so a one-tile corridor is a corridor only the
// player fits through — the repair pass was quietly building rooms the whole haul loop excludes.
// ROOT-CAUSE: corridor width was a hard-coded 1 chosen for reachability, and reachability was
// only ever tested with the player's 15 px box.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
const REPAIR_CORRIDOR_TILES = 3;

// The route on the minimap is drawn for everyone, not only for the owner of the Extraction
// Tracker. Set false to put the route back behind that purchase, which is what the design doc
// originally sold. SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
const MINIMAP_ROUTE_ALWAYS = true;

// The minimap is see-through ALWAYS, and nearly gone when something that can hurt you is behind it.
// It used to be solid, and to fade only while the player walked under it — which stopped being
// possible the moment the camera started centring the player, because then the player is never in
// that corner. What the panel still hides is the top-right of the WORLD, so the thing worth hiding
// for is a monster, not the player.
// Not to zero either way: a map you cannot see at all is worse than one you squint past.
const MINIMAP_IDLE_ALPHA  = 0.60;
const MINIMAP_FADED_ALPHA = 0.16;

const FLOOR = 0, WALL = 1, PROP = 2;

// prop kinds — solid either way; the code only changes how the tile is painted
const P_BLOCK = 1, P_TABLE = 2, P_SHELF = 3, P_CRATE = 4, P_PLANT = 5;
const PROP_CH = { x:P_BLOCK, T:P_TABLE, S:P_SHELF, C:P_CRATE, P:P_PLANT };
const FLOOR_STYLE = { wood:0, tile:1, concrete:2, carpet:3 };

const PLAYER_BASE_SPEED = 132;
const SPEED_FLOOR = 0.35;        // never fully immobilised, however heavy the haul
const TURN_FLOOR  = 0.40;        // heavy loot slows how fast the look stick can swing

const LOS_R      = 14 * TILE;
const CONE_HALF  = 0.62;
const CONE_R     = 6.8 * TILE;
const PERIPH_R   = 2.4 * TILE;

// Breakage. C3-6 of the doc: ship ONE global multiplier, because this is the most
// contested number in the genre and it must be tunable without a rebuild.
let   DMG_MULT      = 1.0;
const DMG_SCALE     = 0.35;      // fraction of original value lost at 2x threshold
const INVULN_AFTER_HIT = 0.8;    // doc C3-5: longer than the source game's ~0.5s, this is mobile
const GRACE_AFTER_PICKUP = 1.0;

const QUOTA_FACTOR = 0.7;        // you may leave 30% of the value behind
const EXTRACT_COUNTDOWN = 5;

const STAM_MAX = 100, STAM_DRAIN = 22, STAM_REGEN = 16;

// Deadzone as a FRACTION of the stick's radius, not a pixel count: the radius is derived from the
// screen, so a flat 4 px was a real deadzone on a tablet and none at all on a phone.
const STICK_DEAD = 0.14;

// How long the facing keeps pointing where it was last AIMED once nothing is aiming it any more.
// Doc C2-2 freezes the facing when the look stick is released, so a thumb can leave to tap an item
// and come back; that is what this window protects. Past it, walking turns you.
// WHY it is not simply forever: the thing you are carrying is pinned to the facing, and the mouse
// (or a released thumb) is usually left BELOW the character — so a frozen facing meant every load
// you picked up hung underneath you and trailed there whichever way you walked. That is what the
// report "dragging loot keeps getting pulled down, is that gravity?" was describing. It is not
// gravity; there is none in this game. It was a stale aim.
const LOOK_IDLE = 1.1;

// How far from the character the cursor has to be before it counts as pointing at anything.
const MOUSE_LOOK_MIN = 2.2 * TILE;

// Nước rút. Keep the run input held and the character winds up into a sprint on its own.
// WHY it is time-based and not a gesture: the thing it replaced fired on a double-tap of the run
// input — a stick hitting its own rim twice — and could not be aimed at a moment on purpose.
const RUSH_DELAY  = 1.0;    // seconds of unbroken running before the sprint kicks in
const RUSH_GAIN   = 0.28;   // extra top speed per upgrade level
const RUSH_STAM   = 1.7;    // stamina burns this much faster while sprinting
const RUSH_NOISE  = 3.0;    // and you are this loud, which is what the blind hunter listens for


// ============================================================ sound
// The source game's tension is carried by AUDIO more than by anything on screen — a thing you
// cannot see breathing in the next room is the whole genre. This build had none at all, so the
// dread had nothing to work with.
//
// It is synthesised, not sampled: every sound here is an oscillator or a burst of filtered noise.
// WHY no files: this game ships as three text files inside a static hub with no build step, and a
// sound pack would be larger than the entire game and would have to be licensed.
// A browser refuses to start audio before the player has touched the page, so the context is
// opened lazily on the first press — see SFX.wake() in setupInput and in the veil button.
const SFX = (() => {
  let ac = null, master = null, nb = null, on = true;

  function ready(){
    if (!on) return null;
    if (!ac){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { on = false; return null; }
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    }
    if (ac.state === 'suspended'){ const r = ac.resume(); if (r && r.catch) r.catch(()=>{}); }
    return ac;
  }
  function noiseBuffer(){
    if (nb) return nb;
    const n = Math.floor(ac.sampleRate * 1.0);
    nb = ac.createBuffer(1, n, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = Math.random()*2-1;
    return nb;
  }
  // One envelope shape for everything: a fast attack to `peak`, then an exponential tail.
  function env(t0, a, d, peak){
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(master);
    return g;
  }
  function tone(freq, a, d, peak, type, sweepTo, when){
    if (!ready()) return;
    const t0 = ac.currentTime + (when || 0);
    const o = ac.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + a + d);
    o.connect(env(t0, a, d, peak));
    o.start(t0); o.stop(t0 + a + d + 0.03);
  }
  function noise(dur, peak, type, freq, q, when){
    if (!ready()) return;
    const t0 = ac.currentTime + (when || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    src.connect(f); f.connect(env(t0, 0.006, dur, peak));
    src.start(t0, Math.random()*0.5, dur + 0.05);
  }

  return {
    wake(){ ready(); },
    get on(){ return on; },
    setOn(v){ on = v; if (!v && ac && master) master.gain.value = 0; else if (master) master.gain.value = 0.55; },
    // two thumps, the second softer — a heart, not a drum
    heart(k){ tone(56, 0.010, 0.15, 0.22*k, 'sine', 32);
              tone(52, 0.010, 0.13, 0.13*k, 'sine', 30, 0.20); },
    hit(n){ noise(0.20, 0.45, 'lowpass', 900, 1);
            tone(130, 0.006, 0.22, 0.30, 'triangle', 46);
            if (n >= 30) tone(90, 0.01, 0.4, 0.18, 'sawtooth', 40); },
    crack(){ noise(0.09, 0.32, 'bandpass', 2600, 3.5); },
    shatter(){ noise(0.45, 0.42, 'highpass', 1700, 0.7);
               noise(0.14, 0.28, 'bandpass', 3600, 4, 0.03);
               tone(300, 0.005, 0.35, 0.12, 'triangle', 90); },
    // the moment something notices you: a short swell of two notes a semitone apart
    sting(){ tone(196, 0.02, 0.55, 0.16, 'sawtooth');
             tone(208, 0.02, 0.55, 0.14, 'sawtooth'); },
    tick(i){ tone(620 + i*70, 0.004, 0.07, 0.20, 'square'); },
    chime(){ tone(523, 0.01, 0.30, 0.20, 'sine');
             tone(659, 0.01, 0.32, 0.18, 'sine', null, 0.09);
             tone(784, 0.01, 0.50, 0.20, 'sine', null, 0.18); },
    thud(){ noise(0.30, 0.35, 'lowpass', 240, 1); tone(70, 0.01, 0.35, 0.22, 'sine', 38); },
  };
})();

// ============================================================ feel
// Everything in here is presentation, and none of it is allowed to change a rule: the numbers it
// reads are already decided by the simulation. It exists because three different things — a
// monster closing in, taking a hit, and watching money break — all produced the same output
// before, which was a number quietly changing somewhere on the HUD.
const DREAD_R = 10*TILE;         // how close something has to be before you feel it
const FX = {
  dread: 0, beat: 0, beat2: false, beatPulse: 0, rate: 1.15,
  shake: 0, hitstop: 0,
  flash: 0, flashCol: '255,255,255',
  hurtT: 0, hurtDir: 0,
  tickPulse: 0, lastTick: -1,
  pops: []                        // world-anchored numbers that rise and fade
};
let shakeX = 0, shakeY = 0;

function fxReset(){
  FX.dread = FX.beat = FX.beatPulse = FX.shake = FX.hitstop = 0;
  FX.beat2 = false; FX.rate = 1.15;
  FX.flash = FX.hurtT = FX.tickPulse = 0; FX.lastTick = -1;
  FX.pops.length = 0;
}
function fxShake(n){ FX.shake = Math.min(14, Math.max(FX.shake, n)); }
function fxFlash(a, col){ if (a > FX.flash){ FX.flash = a; FX.flashCol = col; } }
function fxPop(x, y, text, col, size){
  FX.pops.push({ x, y, t:0, life:1.4, text, col, size: size || 13 });
  if (FX.pops.length > 24) FX.pops.shift();
}

// How frightened the screen should look right now: the nearest awake monster, made worse if it
// is actually hunting you. Sleeping ones do not count — a tranquillised thing is not a threat.
function threatLevel(){
  const p = S.player;
  if (!p || S.dead) return 0;
  let best = 0;
  for (const m of S.monsters){
    if (m.sleep > 0) continue;
    const d = Math.hypot(p.x-m.x, p.y-m.y);
    if (d > DREAD_R) continue;
    let t = 1 - d/DREAD_R;
    if (m.state === 'chase') t = Math.min(1, t*1.3 + 0.32);
    if (t > best) best = t;
  }
  return best;
}

function stepFx(dt){
  const want = threatLevel();
  // Rises fast and falls slow, like the feeling does. A dread that drained as quickly as it
  // filled would flicker every time a patrol stepped behind a wall.
  FX.dread = mix(FX.dread, want, Math.min(1, dt * (want > FX.dread ? 3.4 : 1.0)));

  // The heart runs ALWAYS, because it is drawn on the HUD and a heart that stops is a dead one.
  // What changes with the danger is the RATE — about 52 beats a minute standing in an empty room,
  // about 176 with something on top of you — and whether you can hear it. Being hit spikes it too.
  const alarm = Math.max(FX.dread, FX.hurtT*0.8);
  FX.rate = mix(1.15, 0.34, alarm);                  // seconds between beats
  FX.beat += dt;
  if (FX.beat >= FX.rate){
    FX.beat = 0; FX.beatPulse = 1; FX.beat2 = false;
    if (FX.dread > 0.06) SFX.heart(clamp(FX.dread, 0.25, 1));
  } else if (!FX.beat2 && FX.beat >= FX.rate*0.22){
    // the second, softer thump of the pair — a heart is lub-DUB, not a metronome
    FX.beat2 = true; FX.beatPulse = Math.max(FX.beatPulse, 0.5);
  }

  FX.beatPulse = Math.max(0, FX.beatPulse - dt*2.6);
  FX.shake     = Math.max(0, FX.shake - dt*16);
  FX.flash     = Math.max(0, FX.flash - dt*3.4);
  FX.hurtT     = Math.max(0, FX.hurtT - dt*1.6);
  FX.tickPulse = Math.max(0, FX.tickPulse - dt*3.2);

  for (let i=FX.pops.length-1;i>=0;i--){
    const q = FX.pops[i];
    q.t += dt; q.y -= dt*26;
    if (q.t >= q.life) FX.pops.splice(i,1);
  }
}

// ============================================================ util
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const mix   = (a,b,t) => a + (b-a)*t;
function angDiff(a,b){ let d=a-b; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return d; }
const money = n => '$' + Math.round(n).toLocaleString('en-US');

// ============================================================ authored rooms
// Doc: "Các phòng được tạo sẵn dưới dạng prefab", connected through door points.
//
// These read as rooms in a house, the way the source game's maps do: furniture pushed
// against the walls, a clear middle to haul through, and the four doorways left open.
// Every prop still blocks sight and movement — what the letter changes is only how it is
// drawn, which is what makes a kitchen look like a kitchen from above.
//
//  '#' wall   '.' floor   'L' loot spot   'M' monster post
//  'T' table / counter / bed   'S' shelf, cabinet, bookcase   'C' crate, box, appliance
//  'P' planter, barrel, potted plant       'x' plain block (kept for older layouts)
//
// Layout rule: doors are carved at the middle of every shared edge, so rows 6-8 must stay
// clear near the left and right walls, and columns 9-11 near the top and bottom ones.
const ROOMS = [
  { name:'Phòng khách', floor:'carpet', rows:[
    '#####################',
    '#P...S.........S...P#',
    '#....S.........S....#',
    '#..TT...........TT..#',
    '#..T.L.........L.T..#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#....L.........L....#',
    '#.TTT...........TTT.#',
    '#....S.........S....#',
    '#P...S.........S...P#',
    '#...................#',
    '#...................#',
    '#####################' ]},
  { name:'Nhà kho', floor:'concrete', rows:[
    '#####################',
    '#.C.C.........C.C..P#',
    '#.SSS.SSS...SSS.SSS.#',
    '#.SL....S...S....LS.#',
    '#.S.....S...S.....S.#',
    '#.SSS...S...S...SSS.#',
    '#.......M...........#',
    '#...................#',
    '#...................#',
    '#.SSS...S...S...SSS.#',
    '#.SL....S...S....LS.#',
    '#.SSS.SSS...SSS.SSS.#',
    '#.C.C....L....C.C..P#',
    '#...................#',
    '#####################' ]},
  { name:'Bếp', floor:'tile', rows:[
    '#####################',
    '#.TTTTT.....TTTTT...#',
    '#.L...T.....T...L...#',
    '#.....T.....T.......#',
    '#.TTTTT.....TTTTT...#',
    '#...CCC.....CCC.....#',
    '#........M..........#',
    '#...................#',
    '#...................#',
    '#.TTTTT.....TTTTT...#',
    '#.....T.....T.......#',
    '#.L...T.....T...L...#',
    '#.TTTTT.....TTTTT...#',
    '#...................#',
    '#####################' ]},
  { name:'Hành lang', floor:'wood', rows:[
    '#####################',
    '#.SS.SS.....SS.SS...#',
    '#...................#',
    '#.L...............L.#',
    '#...................#',
    '#.SSSSSSS...SSSSSSS.#',
    '#.........M.........#',
    '#...................#',
    '#...................#',
    '#.SSSSSSS...SSSSSSS.#',
    '#...................#',
    '#.L...............L.#',
    '#...................#',
    '#.SS.SS.....SS.SS...#',
    '#####################' ]},
  { name:'Thư phòng', floor:'wood', rows:[
    '#####################',
    '#.S.S.S.....S.S.S...#',
    '#...................#',
    '#.L...............L.#',
    '#.S.S.S.....S.S.S...#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#...................#',
    '#.S.S.S.....S.S.S...#',
    '#.L...............L.#',
    '#...................#',
    '#.S.S.S.....S.S.S...#',
    '#...................#',
    '#####################' ]},
  { name:'Sân trong', floor:'concrete', rows:[
    '#####################',
    '#...................#',
    '#...PPPPP...PPPPP...#',
    '#...P...........P...#',
    '#...P...L.L.....P...#',
    '#..PP..........PP...#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#..PP..........PP...#',
    '#...P...L.L.....P...#',
    '#...P...........P...#',
    '#...PPPPP...PPPPP...#',
    '#...................#',
    '#####################' ]},
  { name:'Phòng ngủ', floor:'carpet', rows:[
    '#####################',
    '#.SS...........SS...#',
    '#.TTT.........TTT...#',
    '#.TTT.L.....L.TTT...#',
    '#.TTT.........TTT...#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#...................#',
    '#.TTT.........TTT...#',
    '#.TTT.L.....L.TTT...#',
    '#.TTT.........TTT...#',
    '#.SS...........SS...#',
    '#...................#',
    '#####################' ]},
  { name:'Phòng ăn', floor:'wood', rows:[
    '#####################',
    '#.S.....T...TT....S.#',
    '#.S...TTT...T.....S.#',
    '#.....T.T...TT......#',
    '#.L...T.T...T.....L.#',
    '#.....TTT...T.......#',
    '#.........M.........#',
    '#...................#',
    '#...................#',
    '#.....TTT...TT......#',
    '#.L...T.T...TT....L.#',
    '#.....T.T...T.......#',
    '#.S...TTT...T.....S.#',
    '#.S.....T...T.....S.#',
    '#####################' ]},
  { name:'Phòng tắm', floor:'tile', rows:[
    '#####################',
    '#.TT.TT.....TT.TT...#',
    '#.T..T......T..T....#',
    '#.L..L......L..L....#',
    '#...................#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#...................#',
    '#.T..T......T..T....#',
    '#.TT.TT.....TT.TT...#',
    '#...................#',
    '#...................#',
    '#...................#',
    '#####################' ]}
];

// ============================================================ loot presets
// Doc C3-1: value, durability and audio are SEPARATE presets, so a ceramic vase and a
// stone bust can be worth the same money at completely different risk.
const MATERIALS = [
  { key:'gốm',     frag:1.00, thresh: 95,  col:'#cfd8dc', edge:'#8fa2ab', shatter:true  },
  { key:'gỗ',      frag:0.50, thresh:155,  col:'#a8743f', edge:'#6f4a26', shatter:false },
  { key:'kim loại',frag:0.18, thresh:260,  col:'#98a0a8', edge:'#5f676f', shatter:false }
];
const SIZES = [
  { key:'nhỏ',   r: 7, mass: 8,  vmin: 400,  vmax: 1100 },
  { key:'vừa',   r:11, mass: 24, vmin: 1400, vmax: 3200 },
  { key:'to',    r:16, mass: 58, vmin: 4200, vmax: 9000 }
];

// ============================================================ monsters
// Doc B3: each monster is four properties — how it detects, how it moves, what it does,
// and what the player can do about it.
const MONSTERS = {
  patrol:  { name:'Kẻ đi tuần', hp: 40,  dmg:10,  cd:0.9, speed: 58, sight:7.5, hear:0,   col:'#3a2b2b', eye:'#c8503c' },
  listen:  { name:'Kẻ nghe',    hp:120,  dmg:32,  cd:1.6, speed: 74, sight:0,   hear:9.0, col:'#2b2f38', eye:'#7fb2c8' },
  stalk:   { name:'Kẻ bám',     hp: 60,  dmg:30,  cd:1.1, speed: 66, sight:8.5, hear:0,   col:'#241f2e', eye:'#b06fd0' },
  bomber:  { name:'Kẻ nổ',      hp: 30,  dmg:14,  cd:0.9, speed: 62, sight:6.5, hear:3.0, col:'#3d3222', eye:'#e0a03c' },
  heavy:   { name:'Kẻ nặng',    hp:300,  dmg:100, cd:1.8, speed: 40, sight:6.0, hear:6.0, col:'#22282a', eye:'#d04a3a' }
};
// How many of them are in the house. The old curve was 1 + ceil(level/2) and it flattened almost
// immediately against the number of authored monster posts, so a level 12 house held the same five
// things a level 6 house did and the difficulty curve stopped being felt anywhere but the quota.
// Counted from level 1 rather than from zero, so the first two levels hold exactly what they held
// before this changed. Those two are where a player learns the loop, and a house that kills them
// there teaches nothing; the growth belongs later, where the quota is already asking for it.
const FOES_BASE = 2, FOES_PER_LEVEL = 0.9, FOES_MAX = 12;
function foesForLevel(lv){ return Math.min(FOES_MAX, FOES_BASE + Math.floor((lv-1)*FOES_PER_LEVEL)); }

// A monster that has not found you in this long gives up on where it is and moves to a room near
// you. WHY it exists: without it the counter-play to every monster in the game is "walk the other
// way and never come back", and a house you can empty by avoiding it is not a house you fear.
// It never lands anywhere you can see — see relocateFoe.
// These three numbers are the difference between a house that keeps finding you and a house that
// ambushes you. Measured with a bot soak: at 25 s / 10 tiles / a 7-tile landing ring, something was
// being dropped next to the player roughly every 25 seconds, and level 1 — two slow patrols — went
// from a walkover to a coin flip. It is a nudge toward the player's half of the map, not a spawn.
const RELOCATE_AFTER = 40;      // seconds since it last detected the player
const RELOCATE_MIN_D = 16*TILE; // and it has to be genuinely on the other side of the house
const RELOCATE_NEAR  = [9*TILE, 15*TILE];   // a room or two away, never the next doorway

// Finishing an extraction is loud. The source game's whole endgame is that banking the haul tells
// the house exactly where you are standing.
const EXTRACT_NOISE_R = 30*TILE;

// Once the last pad is done the only thing left in the level is the truck, so that is where they
// go. They spread around it on a ring rather than piling onto it, which is what leaves a gap to
// thread — the point is a squeeze, not a wall.
const TRUCK_GUARD_R = 3.8*TILE;

const LEVEL_MONSTERS = [
  ['patrol'],
  ['patrol','listen'],
  ['patrol','listen','bomber'],
  ['patrol','listen','bomber','stalk'],
  ['patrol','listen','bomber','stalk','heavy']
];

// ============================================================ shop
// The source game's Service Station rolls a DIFFERENT stock every visit, split into two
// separate sets: Upgrades (permanent, buyer-only, price climbs per purchase) and Items
// (consumables/tools you keep). Doc B5 holds the upgrade table this is built from.
//
// Anything the doc proposed that would need a FOURTH input is not here: C2 fixed the
// control scheme at two sticks + grab + three slots, and "a phase proposing a fourth
// input defaults to no". That rule also killed the dash: it needed no new button, but it
// needed a double-tap on the rim of a moving stick, which is a gesture nobody can hit on
// purpose while a monster is chasing them. What replaced it asks for no gesture at all —
// keep running and you break into a sprint.
const UPGRADE_MAX_SPAWNS = 3;      // an upgrade may be ROLLED into the shop at most 3 times
const SHOP_UPGRADE_SLOTS = 3;
const SHOP_GEAR_SLOTS    = 3;

const UPGRADES = [
  { key:'hp',     name:'Nâng máu',        desc:'+20 máu tối đa, và hồi đầy ngay.',                     base: 6000 },
  { key:'stam',   name:'Nâng thể lực',    desc:'+10 thể lực, chạy được lâu hơn.',                      base: 2000 },
  { key:'str',    name:'Nâng sức',        desc:'+10 sức. Cùng món đồ đó sẽ nhẹ đi tương đối.',          base: 6000 },
  { key:'range',  name:'Nâng tầm với',    desc:'Nhặt được đồ từ xa hơn.',                              base: 6000 },
  { key:'sprint', name:'Nâng tốc độ chạy',desc:'Chạy nhanh hơn 20%. Chỉ có tác dụng khi đang chạy.',    base: 6000 },
  { key:'rush',   name:'Nước rút',        desc:'Chạy liền hơn 1 giây là bứt tốc. Nhanh hơn hẳn, nhưng tốn thể lực và ồn hơn.', base: 12000 },
  { key:'push',   name:'Đẩy',             desc:'Va vào quái thì hất nó ra thay vì đứng chịu trận.',     base: 4500 },
  { key:'regen',  name:'Hồi thể lực nhanh',desc:'Đứng im hồi thể lực nhanh hơn hẳn.',                   base: 3000 },
  { key:'light',  name:'Nâng đèn',        desc:'Nón nhìn dài và rộng hơn.',                            base: 5000 },
  { key:'grip',   name:'Găng chống sốc',  desc:'Đồ bạn đang vác chịu va đập tốt hơn 25%.',             base: 7000 }
];

// Gear = the source game's "Items". Bought gear goes into the TRUCK STASH, not straight
// into your hands, and survives every later level until it is used up. `stock` is how many
// times it may be bought in one run; at that point it stops being offered at all.
// `aim` decides what a press on the slot DOES. A thing that leaves your hand has to be pointed,
// so holding its slot raises a joystick and letting go throws it; a thing that happens to you has
// nowhere to point, so its slot is a plain button and a tap is the whole interaction.
const GEAR = [
  { key:'gun',     name:'Súng lục',        short:'Súng', desc:'Bắn thẳng theo hướng kéo. 6 viên.',                    uses:6, price: 9000,  stock:4, aim:true },
  { key:'tranq',   name:'Súng gây mê',     short:'Mê',   desc:'Không giết, nhưng ru con quái trúng đạn ngủ 12 giây.', uses:3, price: 12000, stock:3, aim:true },
  { key:'bomb',    name:'Lựu đạn',         short:'Bom',  desc:'Ném ra, nổ sau 1,4 giây. Nổ gần đồ là mất tiền.',      uses:2, price: 7000,  stock:5, aim:true },
  { key:'heal',    name:'Băng cứu thương', short:'Máu',  desc:'Hồi 45 máu ngay lập tức.',                             uses:2, price: 4500,  stock:6 },
  { key:'tracker', name:'Máy dò bệ',       short:'Dò',   desc:'Hiện những bệ bạn chưa tìm ra, và vẽ đường tới chúng.',uses:1, price: 6000,  stock:2, passive:true },
  { key:'float',   name:'Bình phản trọng lực', short:'Nhẹ', desc:'20 giây món đang vác nhẹ như không.',               uses:2, price: 10000, stock:3 },
  { key:'shield',  name:'Keo bọc chống vỡ',short:'Bọc',  desc:'25 giây món đang vác không mất giá trị dù va đập.',    uses:2, price: 11000, stock:3 }
];
const GEAR_BY_KEY = {};
for (const g of GEAR) GEAR_BY_KEY[g.key] = g;

// ============================================================ cart
// Source game: a wheeled platform that holds several small-to-medium valuables, shows the
// money total on its front face, and reappears at the start of every level without having
// to be brought back. Grabbing the front (the money side) is STRONG, any other side WEAK.
const CART_R          = 20;
const CART_SLOTS      = 6;
const CART_MASS       = 40;        // the cart's own weight, before anything is loaded
const CART_EFFICIENCY = 3.4;       // wheels: loaded mass costs this much less than carrying
const CART_WEAK_MUL   = 0.55;      // pushing from the wrong side
const CART_HANDLE_ARC = 1.05;      // how wide the "front" is, in radians either side
// 0 = the load rides protected: a slam costs you the wall, never the contents. That is the source
// game's rule — a mod exists (RemoveCartProtection) whose entire job is to undo it. Raise this
// above 0 and the fraction of a crash that reaches the load comes back.
// WHY: the cart is the only way to move six things in one trip, and charging money for using it
// correctly made bare hands the better play.
// ROOT-CAUSE: impact damage was applied to whatever was in reach of the collision, and being in
// the cart was never treated as a state that changes what a collision means.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
const CART_IMPACT_ABSORB = 0;
const CART_TURN_PENALTY  = 0.5;    // the cart's share of the turn penalty — the one place its mass still tells
const CART_WEAK_SPEED_MUL = 0.7;   // wrong-side grab: a choice you pay for in speed, not in weight
const CART_MAX_SIZE   = 1;         // index into SIZES: 'to' (2) will not fit on the cart

// ============================================================ state
const S = {
  seed: 0, level: 1, wallet: 0,
  grid: null, rooms: [], segs: [], explored: null,
  worldCv: null,
  loot: [], monsters: [], pads: [], bullets: [], bombs: [], corpses: [],
  car: { x:0, y:0 }, cart: null,
  quotaTotal: 0, padIndex: 0,
  countdown: 0, countdownActive: false,
  player: null,
  upg: newUpgrades(),
  upgSpawned: {},                  // how many times each upgrade has been ROLLED into a shop
  gearBought: {},                  // how many times each gear has been bought this run
  stash: [],                       // the shared locker on the truck; bought gear lands here
  offer: null,                     // the stock this shop visit rolled, held so it cannot re-roll
  stashOpen: false,
  running: false, dead: false, levelDone: false, noFoes: false,
  shopMode: false, pay: { active:false, t:0 }, onButton: false, shopCanLeave: false,
  button: { x:0, y:0, r:0 }, cut: null,
  time: 0, message: '', messageT: 0,
  bigMap: false
};
function newUpgrades(){
  const u = {};
  for (const x of UPGRADES) u[x.key] = 0;
  return u;
}

function newPlayer(){
  return {
    x:0, y:0, dir:0, hp: 100 + S.upg.hp*20, hpMax: 100 + S.upg.hp*20,
    stam: STAM_MAX + S.upg.stam*10, stamMax: STAM_MAX + S.upg.stam*10,
    str: 30 + S.upg.str*10, held: null, hurt: 0, noise: 0, speedScale: 1,
    // The hands start EMPTY, like the source game: everything you carry into a house was
    // bought at the station and taken out of the truck's locker first.
    inv: [ null, null, null ],
    aimSlot: -1, aimId: -1, aimX: 0, aimY: 0, cooldown: 0, lookIdle: 0,
    pushing: false, runT: 0, rushing: false,
    floatT: 0, shieldT: 0
  };
}

const solidAt = (gx,gy) => (gx<0||gy<0||gx>=MW||gy>=MH) ? true : S.grid[gy*MW+gx] !== FLOOR;

// ============================================================ world generation
function buildLevel(seed){
  S.seed = seed;
  S.buildId = (S.buildId || 0) + 1;      // every rebuild invalidates the cached minimap route
  const rnd = mulberry32(seed);
  S.grid = new Uint8Array(MW*MH);
  S.explored = new Uint8Array(MW*MH);
  S.rooms = []; S.loot = []; S.monsters = []; S.pads = [];
  S.bullets = []; S.bombs = []; S.corpses = [];
  S.padIndex = 0; S.countdown = 0; S.countdownActive = false;
  S.levelDone = false; S.dead = false; S.hurtLog = []; S.shiftLost = false;

  const lootSpots = [], monSpots = [];
  const order = ROOMS.map((_,i)=>i);
  for (let i = order.length-1; i > 0; i--){ const j = (rnd()*(i+1))|0; [order[i],order[j]]=[order[j],order[i]]; }

  S.deco = new Uint8Array(MW*MH);
  S.roomStyle = new Uint8Array(GX*GY);
  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
    const ri = cy*GX+cx;
    const t = ROOMS[order[ri % order.length]];
    const fx = rnd()<0.5, fy = rnd()<0.5;
    S.rooms.push({ name:t.name, cx, cy, seen:false });
    S.roomStyle[ri] = FLOOR_STYLE[t.floor || 'wood'];
    for (let y=0; y<RH; y++) for (let x=0; x<RW; x++){
      const sx = fx ? RW-1-x : x, sy = fy ? RH-1-y : y;
      const ch = (t.rows[sy] || '')[sx] || '.';
      const gx = cx*RW+x, gy = cy*RH+y;
      const prop = PROP_CH[ch] || 0;
      let v = ch === '#' ? WALL : prop ? PROP : FLOOR;
      if (x===0||y===0||x===RW-1||y===RH-1) v = WALL;      // room shell is always closed
      S.grid[gy*MW+gx] = v;
      if (v === PROP) S.deco[gy*MW+gx] = prop;
      if (v === FLOOR && ch === 'L') lootSpots.push({gx,gy,ri});
      if (v === FLOOR && ch === 'M') monSpots.push({gx,gy,ri});
    }
  }

  // Doc: rooms meet at authored door points; unused doors get sealed. Here every shared
  // edge gets one 3-wide door, which is what "connected by door points" comes to on a grid.
  const carve = carveTile;                              // never the map border; see carveTile
  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
    const my = cy*RH + (RH>>1), mx = cx*RW + (RW>>1);
    if (cx < GX-1){ const col=(cx+1)*RW; for(let d=-1;d<=1;d++) for(let o=-2;o<=1;o++) carve(col+o, my+d); }
    if (cy < GY-1){ const row=(cy+1)*RH; for(let d=-1;d<=1;d++) for(let o=-2;o<=1;o++) carve(mx+d, row+o); }
  }

  // the car (start point) sits in a corner room
  const carRoom = 0;
  const cgx = (carRoom%GX)*RW + (RW>>1), cgy = ((carRoom/GX)|0)*RH + (RH>>1);
  for (let y=cgy-2; y<=cgy+2; y++) for (let x=cgx-2; x<=cgx+2; x++) carve(x,y);
  S.car.x = (cgx+0.5)*TILE; S.car.y = (cgy+0.5)*TILE;
  // Where the cart will be parked, needed before it exists: the passability post-condition below
  // has to know the tile it starts on. Same numbers makeCart is called with, kept in one place.
  const cartSpawnX = S.car.x + TILE*2.6, cartSpawnY = S.car.y + TILE*0.4;

  let reach = flood(cgx, cgy);
  for (let pass=0; pass<2; pass++){
    let repaired = false;
    for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
      let n = 0;
      for (let y=cy*RH; y<(cy+1)*RH; y++) for (let x=cx*RW; x<(cx+1)*RW; x++) if (reach[y*MW+x]) n++;
      if (n < 14){
        repaired = true;
        // REPAIR_CORRIDOR_TILES wide, centred on the room's middle row and column. A one-tile
        // corridor reconnected the room for the player and left it sealed for the cart.
        // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
        const my = cy*RH+(RH>>1), mx = cx*RW+(RW>>1);
        const lo = -((REPAIR_CORRIDOR_TILES-1)>>1), hi = lo + REPAIR_CORRIDOR_TILES - 1;
        for (let x=cx*RW+1; x<(cx+1)*RW-1; x++) for (let d=lo; d<=hi; d++) carve(x, my+d);
        for (let y=cy*RH+1; y<(cy+1)*RH-1; y++) for (let d=lo; d<=hi; d++) carve(mx+d, y);
      }
    }
    if (!repaired) break;
    reach = flood(cgx,cgy);
  }
  for (let i=0;i<S.grid.length;i++) if (S.grid[i]===FLOOR && !reach[i]) S.grid[i] = WALL;

  // --- extraction pads, chosen BEFORE the loot is scattered.
  //
  // CORRECTION to this file's own earlier reading of doc A2-2: the source game does NOT
  // scatter every pad. The first Extraction Point spawns in the room the truck lands in and
  // never moves, so you always know where the first haul goes; only the LATER ones "generate
  // the farthest possible into the map, each as far from the others as possible".
  // SEE: repo-2025horror.fandom.com/wiki/Extraction_Point, escapistmagazine.com/how-to-extract-items-in-repo
  // This build puts pad #1 in a room NEXT DOOR to the truck rather than in the truck's own
  // room: the truck room is the hub (locker, cart) and needs the floor space.
  //
  // WHY pads are placed first even though doc B2 says loot comes first: B2 is about the
  // QUOTA, which still derives from the value actually scattered (below). Pad POSITIONS never
  // depended on the loot — only on which rooms exist and are reachable — and they have to be
  // known before scattering, because loot is not allowed in the truck room or in a pad's room.
  // ROOT-CAUSE this fixes: loot spawned in the truck room was free money you could bank
  // without entering the house, and loot spawned in a pad's room turned that pad's quota into
  // a walk of three metres. Both hollow out the haul the whole game is built on.
  const padCount = padsForLevel(S.level);
  const roomAt = (cx,cy) => (cx<0||cy<0||cx>=GX||cy>=GY) ? -1 : cy*GX+cx;
  const roomPoint = ri => {
    const r = S.rooms[ri];
    const gx = r.cx*RW + (RW>>1), gy = r.cy*RH + (RH>>1);
    return reach[gy*MW+gx] ? { ri, x:(gx+0.5)*TILE, y:(gy+0.5)*TILE } : null;
  };
  const carCx = carRoom % GX, carCy = (carRoom/GX)|0;
  const neighbours = [[1,0],[0,1],[-1,0],[0,-1]]
    .map(([dx,dy]) => roomAt(carCx+dx, carCy+dy))
    .filter(ri => ri >= 0)
    .map(roomPoint)
    .filter(Boolean);
  const cand = [];
  for (let ri=0; ri<S.rooms.length; ri++){
    if (ri === carRoom) continue;
    const pt = roomPoint(ri);
    if (pt) cand.push(pt);
  }
  let chosen;
  if (neighbours.length){
    const first = neighbours[(rnd()*neighbours.length)|0];
    const rest = cand.filter(c => c.ri !== first.ri);
    chosen = [first].concat(pickSpread(rest, padCount-1, rnd, [first]));
  } else {
    chosen = pickSpread(cand, padCount, rnd, []);
  }
  chosen.forEach((c,i) => S.pads.push({
    x:c.x, y:c.y, ri:c.ri, quota: 0, placed: [], value: 0,
    active: i===0, done:false, index:i
  }));

  // --- passability is a post-condition, not a hope. Every pad and the cart's parking spot must
  // be reachable from the truck through space the CART fits in, not just space the player fits in.
  // WHY: the generator only ever checked reachability with the player's 15 px box, so it could
  // ship a level whose quota sat behind a gap the 40 px cart cannot enter — the haul loop's one
  // tool locked out of the half of the map that needs it.
  // ROOT-CAUSE: "connected" was defined by the flood fill's own neighbour test (a single floor
  // tile), and nothing in generation ever expressed how wide the widest mover is.
  // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
  // Runs AFTER the unreachable-floor seal above, so the corridors it opens survive.
  ensureCartRoutes(cgx, cgy,
    S.pads.map(p => ({ gx:(p.x/TILE)|0, gy:(p.y/TILE)|0 }))
          .concat([{ gx:(cartSpawnX/TILE)|0, gy:(cartSpawnY/TILE)|0 }]));

  // --- loot. Doc B2: scatter the loot FIRST, then derive the quota from what was actually
  // scattered. Fixing the quota first can produce a level you cannot clear.
  // The truck's room and every pad's room are off limits — see the pad block above.
  const banned = new Set([carRoom].concat(S.pads.map(p => p.ri)));
  const open = lootSpots.filter(s => reach[s.gy*MW+s.gx]);
  let spots = open.filter(s => !banned.has(s.ri));
  // Safety valve: with enough pads every room could end up banned, and a level with no loot
  // has no quota and cannot be finished. The truck's room stays banned regardless.
  if (!spots.length) spots = open.filter(s => s.ri !== carRoom);
  for (let i=spots.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [spots[i],spots[j]]=[spots[j],spots[i]]; }
  const want = Math.min(spots.length, 12 + S.level*2);
  for (let i=0;i<want;i++){
    const sp = spots[i];
    const roll = rnd();
    const size = SIZES[ roll < 0.45 ? 0 : roll < 0.82 ? 1 : 2 ];
    const mat  = MATERIALS[ (rnd()*MATERIALS.length)|0 ];
    const v0   = Math.round(mix(size.vmin, size.vmax, rnd()) / 50) * 50;
    S.loot.push(makeLoot((sp.gx+0.5)*TILE, (sp.gy+0.5)*TILE, size, mat, v0));
  }

  const totalValue = S.loot.reduce((a,l)=>a+l.value0, 0);
  S.quotaTotal = Math.round(totalValue * QUOTA_FACTOR * difficultyCurve(S.level));
  const per = Math.round(S.quotaTotal / Math.max(1, S.pads.length));
  S.pads.forEach(p => { p.quota = per; });

  // --- monsters
  const pool = LEVEL_MONSTERS[Math.min(LEVEL_MONSTERS.length-1, S.level-1)];
  if (!S.noFoes){
    const farFromTruck = (gx,gy) => Math.hypot((gx+0.5)*TILE-S.car.x,(gy+0.5)*TILE-S.car.y) > 12*TILE;
    const ms = monSpots.filter(s => reach[s.gy*MW+s.gx] && farFromTruck(s.gx, s.gy));
    for (let i=ms.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [ms[i],ms[j]]=[ms[j],ms[i]]; }
    // The authored posts run out at nine — one per room — long before the count does, so past that
    // the rest stand on any reachable floor tile far enough from the truck. Without this the whole
    // difficulty curve silently capped itself on the level layout.
    const spare = [];
    for (let gy=1; gy<MH-1; gy++) for (let gx=1; gx<MW-1; gx++){
      if (S.grid[gy*MW+gx] === FLOOR && reach[gy*MW+gx] && farFromTruck(gx,gy)) spare.push({gx,gy});
    }
    for (let i=spare.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [spare[i],spare[j]]=[spare[j],spare[i]]; }
    const n = Math.min(ms.length + spare.length, foesForLevel(S.level));
    for (let i=0;i<n;i++){
      const sp = i < ms.length ? ms[i] : spare[i - ms.length];
      const type = pool[(rnd()*pool.length)|0];
      S.monsters.push(makeMonster(type, (sp.gx+0.5)*TILE, (sp.gy+0.5)*TILE));
    }
  }

  S.player = S.player ? Object.assign(S.player, { x:S.car.x, y:S.car.y+TILE*2, held:null, hurt:0 }) : newPlayer();
  S.player.x = S.car.x; S.player.y = S.car.y + TILE*2;
  S.player.hpMax = 100 + S.upg.hp*20;
  S.player.stamMax = STAM_MAX + S.upg.stam*10;
  S.player.str = 30 + S.upg.str*10;
  S.player.hp = S.player.hpMax; S.player.stam = S.player.stamMax;
  S.player.held = null; S.player.aimSlot = -1; S.player.aimId = -1;
  S.player.pushing = false; S.player.floatT = 0; S.player.shieldT = 0;
  S.player.runT = 0; S.player.rushing = false;
  S.stashOpen = false;

  // The cart is not something you buy and not something you bring home: the source game
  // respawns one at the truck at the start of every level, and it never has to come back.
  S.cart = makeCart(cartSpawnX, cartSpawnY);

  fxReset();
  S.segs = buildSegments();
  prerenderWorld(mulberry32(seed ^ 0x9e3779b9));
  prerenderMinimap();
  S.time = 0;
  toast('Màn ' + S.level + ' — cần ' + money(S.quotaTotal) + ' qua ' + S.pads.length + ' bệ');
}

function difficultyCurve(lv){
  // Doc B1, from the source game: 0.4 at level 1, ~0.7 by 10, 1.0 from 20 on.
  if (lv <= 1) return 0.4;
  if (lv <= 10) return mix(0.4, 0.7, (lv-1)/9);
  if (lv <= 20) return mix(0.7, 1.0, (lv-10)/10);
  return 1.0;
}
function padsForLevel(lv){
  if (lv <= 1) return 1;
  if (lv <= 3) return 2;
  if (lv <= 5) return 3;
  if (lv <= 14) return 4;
  return 5;
}
function pickSpread(cand, n, rnd, seeds){
  // Source game: every extraction after the first "generates the farthest possible into the
  // map, with every extraction trying to spawn as far from other existing points as possible".
  // So this is a plain farthest-point walk — score everything, take the best, repeat.
  // Doc A2-3 still holds: it terminates by construction, it never loops until a rule fits.
  const out = [];
  const anchors = (seeds || []).slice();
  const pool = cand.slice();
  while (out.length < n && pool.length){
    let best = 0, bestScore = -1;
    for (let i=0;i<pool.length;i++){
      const c = pool[i];
      let d = Math.hypot(c.x-S.car.x, c.y-S.car.y);
      for (const o of anchors) d = Math.min(d, Math.hypot(c.x-o.x, c.y-o.y));
      const score = d + rnd()*TILE*3;
      if (score > bestScore){ bestScore = score; best = i; }
    }
    const pick = pool.splice(best,1)[0];
    out.push(pick); anchors.push(pick);
  }
  return out;
}

function flood(sx, sy){
  const seen = new Uint8Array(MW*MH);
  if (solidAt(sx,sy)) return seen;
  const q = [sy*MW+sx]; seen[sy*MW+sx] = 1;
  while (q.length){
    const i = q.pop(), x = i%MW, y = (i/MW)|0;
    const nb = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
    for (const [nx,ny] of nb){
      if (nx<0||ny<0||nx>=MW||ny>=MH) continue;
      const j = ny*MW+nx;
      if (seen[j] || S.grid[j] !== FLOOR) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

// The map border is the outer shell of the whole level and is never carved: a hole in it opens
// onto nothing and the flood fill would walk off the map.
function carveTile(gx,gy){ if (gx>0&&gy>0&&gx<MW-1&&gy<MH-1) S.grid[gy*MW+gx] = FLOOR; }

// A tile the CART can stand on: the whole 3x3 block around it is floor, i.e. 72 px of clearance,
// the same width an authored door is carved to. The player only needs the tile itself.
function cartPassable(gx,gy){
  for (let y=gy-1; y<=gy+1; y++) for (let x=gx-1; x<=gx+1; x++){
    if (x<0||y<0||x>=MW||y>=MH) return false;
    if (S.grid[y*MW+x] !== FLOOR) return false;
  }
  return true;
}

// flood(), but stepping only through tiles the cart fits in — which is what "connected" has to
// mean for anything the haul loop needs to reach.
function floodCart(sx, sy){
  const seen = new Uint8Array(MW*MH);
  if (!cartPassable(sx,sy)) return seen;
  const q = [sy*MW+sx]; seen[sy*MW+sx] = 1;
  while (q.length){
    const i = q.pop(), x = i%MW, y = (i/MW)|0;
    for (const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      if (nx<0||ny<0||nx>=MW||ny>=MH) continue;
      const j = ny*MW+nx;
      if (seen[j] || !cartPassable(nx,ny)) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

// Shortest tile path over plain floor, 4-neighbour, from (sx,sy) to the first tile `accept` says
// yes to. Returns [[x,y], ...] starting at the source, or null when nothing acceptable is
// reachable. Used both to widen a route for the cart and to draw one on the minimap.
// `inset` keeps the search away from the map shell. The widening pass needs it: carveTile refuses
// the outer border, so a path that hugs the shell gets its 3x3 blocks clipped, never becomes wide
// enough, and the pass spends its whole budget re-carving the same useless corridor. The minimap
// route must NOT be insetted — the player can stand next to the wall.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md (the Unity build guards the same
// way in StepFloor; this side had dropped it, which is a difference in a place no seed reaches yet)
function bfsPath(sx, sy, accept, inset){
  inset = inset || 0;
  if (sx<0||sy<0||sx>=MW||sy>=MH) return null;
  if (S.grid[sy*MW+sx] !== FLOOR) return null;
  const start = sy*MW+sx;
  const prev = new Int32Array(MW*MH).fill(-2);
  prev[start] = -1;
  const q = [start];
  for (let head=0; head<q.length; head++){
    const i = q[head], x = i%MW, y = (i/MW)|0;
    if (accept(x,y)){
      const out = [];
      for (let j=i; j !== -1; j = prev[j]) out.push([j%MW, (j/MW)|0]);
      return out.reverse();
    }
    for (const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      if (nx<inset||ny<inset||nx>=MW-inset||ny>=MH-inset) continue;
      const j = ny*MW+nx;
      if (prev[j] !== -2 || S.grid[j] !== FLOOR) continue;
      prev[j] = i; q.push(j);
    }
  }
  return null;
}

// The generator's post-condition: from the truck, every target listed must be reachable through
// cart-passable space. Where one is not, the plain-floor path to the nearest cart-passable tile
// is widened to REPAIR_CORRIDOR_TILES and the flood is run again.
//
// Bounded at four passes on purpose: each pass only ever turns wall into floor, so it converges,
// but a map with a target the player cannot even walk to must end the loop rather than spin.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
function ensureCartRoutes(cgx, cgy, targets){
  const lo = -((REPAIR_CORRIDOR_TILES-1)>>1), hi = lo + REPAIR_CORRIDOR_TILES - 1;
  const widen = (x,y) => { for (let dy=lo; dy<=hi; dy++) for (let dx=lo; dx<=hi; dx++) carveTile(x+dx, y+dy); };
  for (let pass=0; pass<4; pass++){
    if (!cartPassable(cgx,cgy)){ widen(cgx,cgy); continue; }   // the truck's own parking space
    const comp = floodCart(cgx,cgy);
    let carved = false;
    for (const t of targets){
      if (t.gx<0||t.gy<0||t.gx>=MW||t.gy>=MH) continue;
      if (comp[t.gy*MW+t.gx]) continue;
      const path = bfsPath(t.gx, t.gy, (x,y) => comp[y*MW+x] === 1, 2);
      if (!path) continue;                    // no walkable path at all: nothing to widen
      for (const [x,y] of path) widen(x,y);
      carved = true;
    }
    if (!carved) break;
  }
}

// The way to the objective, as tiles. Doc: the minimap tells you where to go; a straight line
// through three walls tells you where the pad is and not how to reach it.
// WHY: the old minimap drew player -> pad as one segment, which points into a wall as often as
// not, and a map that lies is worse than a map that says nothing.
// ROOT-CAUSE: the target was known in world space and the walls only ever existed in the grid,
// so nothing in the draw path had a reason to consult them.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
//
// Cached: this is a full breadth-first search over the map and the answer only changes when the
// player steps into a new tile, the objective moves, or the level is rebuilt. The walls are
// folded into the cache key rather than assumed constant — a stale route is a wrong route, and
// this is the one number a test that walls the player in has no way to tell the cache about.
let routeCache = { key:'', pts:[] };
function gridStamp(){
  let h = 2166136261 >>> 0;
  const g = S.grid;
  for (let i=0;i<g.length;i++){ h = Math.imul(h ^ g[i], 16777619); }
  return h >>> 0;
}
// How much of the route the player is ALLOWED to see: it stops at the first tile they have not
// explored. This is a rule, not a drawing detail, which is why it lives here and has its own test —
// found by a soak run that measured 380 of 380 waypoints sitting in rooms nobody had opened yet.
function visibleRoute(){
  const route = routeToObjective();
  let cut = 0;
  while (cut < route.length){
    const gi = (((route[cut].y/TILE)|0)*MW + ((route[cut].x/TILE)|0));
    if (!S.explored[gi]) break;
    cut++;
  }
  return route.slice(0, cut);
}

function routeToObjective(){
  const p = S.player;
  if (!p || !S.grid) return [];
  const target = S.levelDone ? S.car : (S.pads[S.padIndex] || S.car);
  if (!target) return [];
  const pgx = (p.x/TILE)|0, pgy = (p.y/TILE)|0;
  const tgx = (target.x/TILE)|0, tgy = (target.y/TILE)|0;
  const key = (S.buildId||0)+':'+gridStamp()+':'+pgx+':'+pgy+':'+tgx+':'+tgy;
  if (routeCache.key === key) return routeCache.pts;
  const path = bfsPath(pgx, pgy, (x,y) => x === tgx && y === tgy);
  const pts = path ? path.map(([x,y]) => ({ x:(x+0.5)*TILE, y:(y+0.5)*TILE })) : [];
  routeCache = { key, pts };
  return pts;
}

function makeLoot(x,y,size,mat,v0){
  return { x, y, vx:0, vy:0, r:size.r, mass:size.mass, size:size.key, sizeIdx:SIZES.indexOf(size),
           mat, value0:v0, value:v0, held:false, invuln:0, grace:0,
           onPad:null, inCart:false, cracks:0, gone:false, bob: Math.random()*6,
           freeX:x, freeY:y, holdD:0 };
}
function makeMonster(type,x,y){
  const d = MONSTERS[type];
  return { type, x, y, hp:d.hp, dmg:d.dmg, speed:d.speed, dir:0,
           state:'patrol', tx:x, ty:y, think:0, alert:0, hit:0, home:{x,y}, wob:Math.random()*7,
           sleep:0, kx:0, ky:0,
           lost: 0,                              // seconds since it last had the player
           guardA: Math.random()*Math.PI*2 };    // its own place on the ring around the truck
}
function makeCart(x,y){
  return { x, y, r:CART_R, items:[], held:false, mode:'strong',
           freeX:x, freeY:y, holdD:0, face:0 };
}
function cartLoad(cart){ return cart.items.reduce((a,l)=> a + (l.gone?0:l.mass), 0); }
function cartValue(cart){ return cart.items.reduce((a,l)=> a + (l.gone?0:l.value), 0); }
function cartFits(cart, l){
  return cart.items.length < CART_SLOTS && l.sizeIdx <= CART_MAX_SIZE;
}

// ---- wall segments (merged runs) for the visibility polygon
function buildSegments(){
  const out = [];
  for (const side of [-1,1]){
    for (let y=0;y<MH;y++){
      let x=0;
      while (x<MW){
        if (solidAt(x,y) && !solidAt(x,y+side)){
          let x2=x; while (x2+1<MW && solidAt(x2+1,y) && !solidAt(x2+1,y+side)) x2++;
          const yy = (side===-1 ? y : y+1)*TILE;
          out.push(seg(x*TILE, yy, (x2+1)*TILE, yy));
          x = x2+1;
        } else x++;
      }
    }
  }
  for (const side of [-1,1]){
    for (let x=0;x<MW;x++){
      let y=0;
      while (y<MH){
        if (solidAt(x,y) && !solidAt(x+side,y)){
          let y2=y; while (y2+1<MH && solidAt(x,y2+1) && !solidAt(x+side,y2+1)) y2++;
          const xx = (side===-1 ? x : x+1)*TILE;
          out.push(seg(xx, y*TILE, xx, (y2+1)*TILE));
          y = y2+1;
        } else y++;
      }
    }
  }
  return out;
}
function seg(x1,y1,x2,y2){
  return { x1,y1,x2,y2, minX:Math.min(x1,x2), maxX:Math.max(x1,x2), minY:Math.min(y1,y2), maxY:Math.max(y1,y2) };
}

// Floors are painted per room, not per map: a kitchen reads as a kitchen from above because
// it is tiled, and the storeroom reads as one because it is bare concrete. It is the cheapest
// way to make a shuffled grid of prefabs feel like one house instead of one texture.
// The light pass MULTIPLIES over this, so everything here is painted bright — anything dark
// here ends up black once the sight cone lands on it.
const FLOORS = [
  { base:[112,96,74],  alt:[122,104,80] },   // 0 wood
  { base:[126,128,124],alt:[136,138,134] },  // 1 tile
  { base:[108,108,106],alt:[114,114,112] },  // 2 concrete
  { base:[104,84,80],  alt:[112,92,86] }     // 3 carpet
];
const WALLS = [
  [86,74,62],    // 0 wood room  — papered
  [78,86,86],    // 1 tiled room — cold
  [74,74,72],    // 2 concrete   — bare
  [88,68,66]     // 3 carpeted   — dark red paper
];
function prerenderWorld(rnd){
  if (!S.worldCv){ S.worldCv = document.createElement('canvas'); S.worldCv.width = WPX; S.worldCv.height = HPX; }
  const c = S.worldCv.getContext('2d');
  c.setTransform(1,0,0,1,0,0);
  c.fillStyle = '#0a0b0c'; c.fillRect(0,0,WPX,HPX);
  for (let gy=0; gy<MH; gy++) for (let gx=0; gx<MW; gx++){
    const i = gy*MW+gx, v = S.grid[i], x = gx*TILE, y = gy*TILE, n = rnd();
    if (v === FLOOR){
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      const st = FLOORS[S.roomStyle ? S.roomStyle[ri] : 0] || FLOORS[0];
      paintFloor(c, x, y, st, gx, gy, n);
    } else if (v === WALL){
      // wallpaper follows the room, so a wall tells you which room you are looking into
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      const w = WALLS[S.roomStyle ? S.roomStyle[ri] : 0] || WALLS[0];
      c.fillStyle = `rgb(${(w[0]+n*12)|0},${(w[1]+n*11)|0},${(w[2]+n*10)|0})`;
      c.fillRect(x,y,TILE,TILE);
      c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x,y+TILE-4,TILE,4);
      c.fillStyle = 'rgba(255,246,226,0.10)'; c.fillRect(x,y,TILE,2);
      if (((gx ^ gy) & 3) === 0){ c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(x+2, y+2, TILE-4, 1); }
    } else {
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      const st = FLOORS[S.roomStyle ? S.roomStyle[ri] : 0] || FLOORS[0];
      paintFloor(c, x, y, st, gx, gy, n);                 // furniture stands ON the floor
      paintProp(c, x, y, S.deco ? S.deco[i] : P_BLOCK, n);
    }
  }
  paintDoorFrames(c);
}
function paintFloor(c, x, y, st, gx, gy, n){
  // The pattern has to come from the GRID, not from the random stream. Tinting each tile at
  // random turned a floor into camouflage: the eye read the blotches as objects and the room
  // as clutter. Planks run in rows, tiles checker, and the randomness is demoted to a faint
  // wear jitter you only notice up close.
  let swap;
  if (st === FLOORS[1])      swap = (gx + gy) & 1;        // tile: checkerboard
  else if (st === FLOORS[0]) swap = ((gy >> 1) & 1);      // wood: two-tile plank rows
  else                       swap = 0;                     // carpet, concrete: one tone
  const col = swap ? st.alt : st.base;
  const j = ((n*4)|0) - 1;
  c.fillStyle = `rgb(${col[0]+j},${col[1]+j},${col[2]+j})`;
  c.fillRect(x,y,TILE,TILE);
  if (st === FLOORS[0]){                                   // wood: plank seams + board ends
    c.fillStyle = 'rgba(0,0,0,0.20)'; c.fillRect(x, y+TILE-1, TILE, 1);
    if (((gx + (gy>>1)*2) & 3) === 0){ c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(x, y, 1, TILE); }
  } else if (st === FLOORS[1]){                            // tile: grout
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(x, y+TILE-1, TILE, 1); c.fillRect(x+TILE-1, y, 1, TILE);
  } else if (st === FLOORS[3]){                            // carpet: dense fleck, low contrast
    if (n > 0.45){ c.fillStyle = 'rgba(0,0,0,0.055)'; c.fillRect(x+((n*67)%20), y+((n*41)%20), 2, 2); }
    if (n < 0.2){ c.fillStyle = 'rgba(255,230,210,0.045)'; c.fillRect(x+((n*97)%20), y+((n*57)%20), 2, 2); }
  } else if (n > 0.9){                                     // concrete: the odd stain
    c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(x+((n*53)%16), y+((n*29)%16), 6, 3);
  }
}
function paintProp(c, x, y, kind, n){
  const T = TILE;
  const box = (ix,iy,w,h,top,side,edge) => {
    c.fillStyle = side; c.fillRect(x+ix, y+iy, w, h);
    c.fillStyle = top;  c.fillRect(x+ix, y+iy, w, Math.max(2, h*0.62));
    c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x+ix, y+iy+h-3, w, 3);
    if (edge){ c.strokeStyle = edge; c.lineWidth = 1; c.strokeRect(x+ix+0.5, y+iy+0.5, w-1, h-1); }
  };
  if (kind === P_TABLE){            // table / counter / bed — low, warm wood
    box(1, 2, T-2, T-4, '#8e6b45', '#6d4f32', 'rgba(0,0,0,0.35)');
    c.fillStyle = 'rgba(255,236,200,0.10)'; c.fillRect(x+2, y+3, T-4, 2);
  } else if (kind === P_SHELF){     // shelf / cabinet / bookcase — tall, dark, with shelves
    box(1, 0, T-2, T, '#5c4a3a', '#41352a', 'rgba(0,0,0,0.45)');
    c.fillStyle = 'rgba(0,0,0,0.30)';
    c.fillRect(x+2, y+7, T-4, 2); c.fillRect(x+2, y+15, T-4, 2);
    if (n > 0.5){ c.fillStyle = 'rgba(190,160,120,0.30)'; c.fillRect(x+3, y+2, T-6, 4); }
  } else if (kind === P_CRATE){     // crate / appliance — pale box with a cross brace
    box(2, 2, T-4, T-4, '#b9ac92', '#8f8470', 'rgba(0,0,0,0.40)');
    c.strokeStyle = 'rgba(80,68,50,0.55)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x+3, y+3); c.lineTo(x+T-3, y+T-3);
    c.moveTo(x+T-3, y+3); c.lineTo(x+3, y+T-3); c.stroke();
  } else if (kind === P_PLANT){     // planter / barrel — round, greener
    c.fillStyle = '#6b5a44';
    c.beginPath(); c.arc(x+T/2, y+T/2, T*0.42, 0, Math.PI*2); c.fill();
    c.fillStyle = '#4f6b45';
    c.beginPath(); c.arc(x+T/2, y+T/2-1, T*0.30, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.30)';
    c.beginPath(); c.ellipse(x+T/2, y+T*0.82, T*0.36, T*0.14, 0, 0, Math.PI*2); c.fill();
  } else {                          // plain block, the old 'x'
    c.fillStyle = `rgb(${(112+n*12)|0},${(104+n*10)|0},${(92+n*9)|0})`;
    c.fillRect(x+1,y+1,TILE-2,TILE-2);
    c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(x+1,y+TILE-5,TILE-2,4);
    c.fillStyle = 'rgba(255,240,210,0.09)'; c.fillRect(x+1,y+1,TILE-2,2);
  }
}
// A gap in a wall reads as a hole; a gap with posts either side reads as a door, which is
// what every room in the source game is joined by.
function paintDoorFrames(c){
  for (let gy=1; gy<MH-1; gy++) for (let gx=1; gx<MW-1; gx++){
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    const onCol = (gx % RW) === 0 || (gx % RW) === RW-1;
    const onRow = (gy % RH) === 0 || (gy % RH) === RH-1;
    if (!onCol && !onRow) continue;
    const x = gx*TILE, y = gy*TILE;
    c.fillStyle = 'rgba(30,24,18,0.55)';
    if (onCol){ c.fillRect(x, y, 3, TILE); c.fillRect(x+TILE-3, y, 3, TILE); }
    else      { c.fillRect(x, y, TILE, 3); c.fillRect(x, y+TILE-3, TILE, 3); }
    c.fillStyle = 'rgba(226,200,150,0.10)';
    c.fillRect(x+3, y+3, TILE-6, TILE-6);
  }
}

// One pixel per tile, painted once per level. The minimap then blits the rooms the player
// has actually walked into, so the map shows the real WALLS of a room — its shell, its
// doorways and the furniture blocks inside it — instead of a flat rectangle that tells you
// a room exists but nothing about how to move through it.
function prerenderMinimap(){
  if (!S.mapCv){ S.mapCv = document.createElement('canvas'); }
  S.mapCv.width = MW; S.mapCv.height = MH;
  const c = S.mapCv.getContext('2d');
  const img = c.createImageData(MW, MH);
  const d = img.data;
  for (let i=0;i<MW*MH;i++){
    const v = S.grid[i], o = i*4;
    // wall: bright and solid, it is the thing you are reading the map for
    // prop: dimmer block — it stops you but it is not the room's shape
    // floor: dark blue-grey, the space you can walk
    const col = v === WALL ? [150,170,200] : v === PROP ? [96,110,132] : [34,46,64];
    d[o] = col[0]; d[o+1] = col[1]; d[o+2] = col[2]; d[o+3] = 255;
  }
  c.putImageData(img, 0, 0);
}

// ============================================================ visibility
function visPoly(ox,oy,R,uniform){
  const local = [];
  for (const s of S.segs){
    if (s.minX>ox+R || s.maxX<ox-R || s.minY>oy+R || s.maxY<oy-R) continue;
    local.push(s);
  }
  const angles = [], seen = new Set(), R2 = (R*1.08)*(R*1.08);
  for (const s of local){
    for (let k=0;k<2;k++){
      const px = k? s.x2:s.x1, py = k? s.y2:s.y1, key = px+':'+py;
      if (seen.has(key)) continue; seen.add(key);
      const dx = px-ox, dy = py-oy;
      if (dx*dx+dy*dy > R2) continue;
      const a = Math.atan2(dy,dx);
      angles.push(a-0.0004, a+0.0004);
    }
  }
  for (let i=0;i<uniform;i++) angles.push(-Math.PI + i*(2*Math.PI/uniform));
  angles.sort((a,b)=>a-b);
  const pts = new Float64Array(angles.length*2);
  for (let i=0;i<angles.length;i++){
    const a = angles[i], dx = Math.cos(a), dy = Math.sin(a);
    let best = R;
    for (let j=0;j<local.length;j++){
      const s = local[j];
      const ex = s.x2-s.x1, ey = s.y2-s.y1;
      const den = dx*ey - dy*ex;
      if (den > -1e-9 && den < 1e-9) continue;
      const ax = s.x1-ox, ay = s.y1-oy;
      const t = (ax*ey-ay*ex)/den;
      if (t<=0 || t>=best) continue;
      const u = (ax*dy-ay*dx)/den;
      if (u<0||u>1) continue;
      best = t;
    }
    pts[i*2] = ox+dx*best; pts[i*2+1] = oy+dy*best;
  }
  return pts;
}
function pathPoly(c, pts){
  c.beginPath(); c.moveTo(pts[0],pts[1]);
  for (let i=2;i<pts.length;i+=2) c.lineTo(pts[i],pts[i+1]);
  c.closePath();
}
function losClear(x0,y0,x1,y1){
  const dx = x1-x0, dy = y1-y0, d = Math.hypot(dx,dy);
  const steps = Math.ceil(d/(TILE*0.45));
  for (let i=1;i<steps;i++){
    const t = i/steps;
    if (solidAt(((x0+dx*t)/TILE)|0, ((y0+dy*t)/TILE)|0)) return false;
  }
  return true;
}

// ============================================================ movement helpers
function hitsSolid(x,y,r){
  for (const [ox,oy] of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]])
    if (solidAt(((x+ox)/TILE)|0, ((y+oy)/TILE)|0)) return true;
  return false;
}
function moveEnt(e, dx, dy, r){
  let blocked = false;
  if (!hitsSolid(e.x+dx, e.y, r)) e.x += dx; else blocked = true;
  if (!hitsSolid(e.x, e.y+dy, r)) e.y += dy; else blocked = true;
  return blocked;
}

// Weight is two numbers, not one: what is in your arms, and what is on the wheels. They are
// separated because they buy different things — arms cost you speed and sight, wheels cost you
// only the swing of a turn.
// WHY: pushing an EMPTY cart used to slow the player by a third and pull the sight cone toward
// its floor, so the tool the whole haul loop is built around made the game darker and slower
// than walking with nothing.
// ROOT-CAUSE: the cart fed the same single carried-weight number that speed and cone radius
// read, so every future change to cart mass silently became a change to how far you can see.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
function handWeight(p){
  if (p.floatT > 0) return 0;                       // anti-gravity flask: weightless, briefly
  return p.held ? p.held.mass : 0;
}
function pushWeight(p){
  if (p.floatT > 0) return 0;
  if (!p.pushing || !S.cart) return 0;
  // Wheels are the whole point of a cart: the same mass costs a fraction of what it costs
  // in your arms, which is what makes a full cart better than four trips.
  const w = (CART_MASS + cartLoad(S.cart)) / CART_EFFICIENCY;
  return S.cart.mode === 'weak' ? w / CART_WEAK_MUL : w;
}
// Kept as the old name so nothing that asks "how heavy am I" has to know about the split.
function carriedWeight(p){ return handWeight(p); }
function playerSpeed(p){
  // Doc A2-1: weight belongs in the DENOMINATOR. The original formula multiplied by it,
  // which made an empty-handed player stand still and a loaded one sprint.
  const s = PLAYER_BASE_SPEED / (1 + handWeight(p) / Math.max(1, p.str));
  const base = Math.max(s, PLAYER_BASE_SPEED * SPEED_FLOOR);
  // A wrong-side grab still costs, but as a flat multiplier: the player chose the handle they
  // grabbed, and letting go and taking the front is always available.
  return (p.pushing && S.cart && S.cart.mode === 'weak') ? base * CART_WEAK_SPEED_MUL : base;
}
function turnRate(p){
  // The only place a loaded cart is still felt: it swings wide.
  const t = 1 / (1 + (handWeight(p) + pushWeight(p)*CART_TURN_PENALTY) / Math.max(1, p.str*1.1));
  return Math.max(t, TURN_FLOOR);
}
function coneRadius(p){
  const base = CONE_R * (1 + S.upg.light*0.16);
  // Hand weight only — a cart never takes light away.
  return base * Math.max(0.42, 1 - handWeight(p) / Math.max(1, p.str*1.6));
}
function coneHalf(p){ return CONE_HALF * (1 + S.upg.light*0.08); }
function grabRange(p){ return (1.9 + S.upg.range*0.55) * TILE; }

// ============================================================ loot damage
// Doc C3-2, the rule no guide states: damage comes from STOPPING SUDDENLY, not from touching.
// The input is the change in velocity, so dragging along a wall is free and slamming into one is not.
function damageLoot(l, impulse){
  if (l.gone) return 0;
  if (l.shopGoods) return 0;         // stock on a shop floor is not yours to break yet
  // Being in the cart is a STATE of the loot, not a property of the collision that happened to
  // it, so the guard sits at the damage entry point: a bomb blast or a monster swipe cannot
  // re-open the hole later the way a check inside stepCart could.
  // WHY: loaded carts lost money on every doorframe, which made the cart worse than four trips
  // by hand — the opposite of what it exists for.
  // ROOT-CAUSE: cart contents were damaged through the same path as hand-held loot, with only a
  // multiplier between them, so "protected" was never expressible.
  // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
  if (l.inCart && CART_IMPACT_ABSORB <= 0) return 0;
  if (S.time < l.invuln || S.time < l.grace) return 0;
  if (l.held && S.player.shieldT > 0) return 0;     // wrapping tape: nothing gets through
  const thresh = l.mat.thresh * (l.held ? (1 + S.upg.grip*0.25) : 1);
  if (impulse <= thresh) return 0;
  const loss = l.value0 * l.mat.frag * DMG_SCALE * DMG_MULT * (impulse - thresh) / thresh;
  const before = l.value;
  l.value = Math.max(0, l.value - loss);
  l.invuln = S.time + INVULN_AFTER_HIT;
  l.cracks = Math.min(3, l.cracks + 1);
  if (l.mat.shatter && l.value <= l.value0 * 0.12) l.value = 0;   // C3-3: some things shatter
  const lost = before - l.value;
  // C3-8 again, one step further: the number on the item already drops, but a number dropping is
  // not a feeling. What the source game sells here is the wince — so the money leaves the object
  // visibly, the screen jolts by however much it was worth, and glass sounds like glass.
  if (lost > 0.5){
    fxPop(l.x, l.y - l.r, '-' + money(lost), l.value <= 0 ? '255,120,100' : '236,150,120',
          l.value <= 0 ? 17 : 13);
    fxShake(Math.min(7, 1.6 + lost/900));
  }
  if (l.value <= 0){
    l.gone = true; lootJustDestroyed = true; l.held = false;
    if (S.player.held === l) S.player.held = null;
    fxFlash(0.30, '255,225,215'); fxShake(Math.min(11, 5 + before/700));
    SFX.shatter();
    toast('Vỡ mất ' + money(before));
  } else if (lost > 0.5) SFX.crack();
  return lost;
}

// Carried things — loot in your hands, or the cart you are pushing — are PINNED to the ray
// straight in front of the player. They never trail behind, never swing out to the side, and
// never end up somewhere the sight cone is not pointing.
//
// WHY: a damped spring (what this used to be) lags by design, so a loot ball drifted behind
// the shoulder whenever the player turned or walked, and the thing you were carrying was
// outside the only lit part of the screen.
// ROOT-CAUSE: the hold point was a spring TARGET, not a constraint, so "in front" was
// something the simulation converged toward instead of something that was always true.
// SEE: user report 2026-08-17 "loot lúc nhặt lên luôn phải nằm phía trước mặt player".
//
// Breakage survives the change because doc C3-2's rule is about STOPPING SUDDENLY, and that
// is measured here as the gap between where the hold point wanted to go this frame and where
// geometry actually let the object go. Walk into a wall and that gap is your walking speed;
// stand still against a wall and it is zero, which is the case a spring got wrong.
function holdInFront(o, dt, wantD, radius){
  const p = S.player;
  const cs = Math.cos(p.dir), sn = Math.sin(p.dir);
  const fx = p.x + cs*wantD, fy = p.y + sn*wantD;      // the unobstructed hold point
  let d = wantD, blocked = false;
  while (d > radius*0.4){
    if (!hitsSolid(p.x + cs*d, p.y + sn*d, radius*0.7)) break;
    d -= 2; blocked = true;
  }
  const ox = o.x, oy = o.y;
  o.x = p.x + cs*d; o.y = p.y + sn*d;
  o.holdD = d;
  const wvx = (fx - o.freeX)/dt, wvy = (fy - o.freeY)/dt;   // how fast the hold point moved
  const avx = (o.x - ox)/dt,     avy = (o.y - oy)/dt;       // how fast the object really moved
  o.freeX = fx; o.freeY = fy;
  o.vx = avx; o.vy = avy;
  return blocked ? Math.hypot(wvx-avx, wvy-avy) : 0;
}

function stepLoot(l, dt){
  if (l.gone) return;
  if (l.inCart) return;                                 // the cart carries it; see stepCart
  if (l.held){
    const impulse = holdInFront(l, dt, l.r + 12, l.r);
    if (impulse > 0) damageLoot(l, impulse);
    return;
  }
  l.vx *= Math.pow(0.02, dt); l.vy *= Math.pow(0.02, dt);
  if (Math.abs(l.vx) < 1) l.vx = 0;
  if (Math.abs(l.vy) < 1) l.vy = 0;
  const pvx = l.vx, pvy = l.vy;
  let hitWall = false;
  if (hitsSolid(l.x + l.vx*dt, l.y, l.r*0.7)){ l.vx = -l.vx*0.25; hitWall = true; } else l.x += l.vx*dt;
  if (hitsSolid(l.x, l.y + l.vy*dt, l.r*0.7)){ l.vy = -l.vy*0.25; hitWall = true; } else l.y += l.vy*dt;
  if (hitWall){
    const impulse = Math.hypot(pvx - l.vx, pvy - l.vy);
    damageLoot(l, impulse);
  }
  l.invuln = Math.max(l.invuln, 0);
}

function stepCart(dt){
  const cart = S.cart, p = S.player;
  if (!cart) return;
  if (cart.held){
    const impulse = holdInFront(cart, dt, cart.r + 16, cart.r);
    // With CART_IMPACT_ABSORB at 0 the load is protected and this loop has nothing to do; the
    // loop is kept so raising that knob brings the trade-off back without a code change.
    // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
    if (impulse > 0 && CART_IMPACT_ABSORB > 0){
      const reach = impulse * CART_IMPACT_ABSORB * (cart.mode === 'weak' ? 1.35 : 1);
      for (const l of cart.items) damageLoot(l, reach);
    }
  }
  // contents ride on the cart, laid out in a little grid so the stack reads at a glance
  for (let i=0;i<cart.items.length;i++){
    const l = cart.items[i];
    if (l.gone) continue;
    const col = i % 3, row = (i/3)|0;
    l.x = cart.x + (col-1)*11; l.y = cart.y + (row-0.5)*11;
    l.vx = l.vy = 0;
  }
  cart.items = cart.items.filter(l => !l.gone);
}

// STRONG vs WEAK, from the source game: grabbing the front of the cart — the face with the
// money total on it — pushes properly; grabbing any other side is the awkward one.
function cartGrabMode(p, cart){
  const toPlayer = Math.atan2(p.y-cart.y, p.x-cart.x);
  return Math.abs(angDiff(toPlayer, cart.face)) < CART_HANDLE_ARC ? 'strong' : 'weak';
}
function grabCart(p){
  const cart = S.cart;
  if (!cart || p.held) return false;
  if (Math.hypot(cart.x-p.x, cart.y-p.y) > cart.r + grabRange(p)) return false;
  cart.mode = cartGrabMode(p, cart);
  cart.held = true; p.pushing = true;
  cart.freeX = cart.x; cart.freeY = cart.y;
  toast(cart.mode === 'strong' ? 'Đẩy xe — nắm đúng mặt trước' : 'Đẩy xe — nắm sai mặt, nặng hơn hẳn');
  return true;
}
function releaseCart(p){
  const cart = S.cart;
  if (!cart || !cart.held) return;
  cart.held = false; p.pushing = false;
  cart.face = p.dir + Math.PI;                 // the handle ends up where you left it
  cart.vx = cart.vy = 0;
  // Parking a loaded cart on the open pad unloads the whole thing at once.
  const pad = S.pads[S.padIndex];
  if (pad && pad.active && !pad.done && cart.items.length &&
      Math.abs(cart.x-pad.x) < TILE*2.4 && Math.abs(cart.y-pad.y) < TILE*2.4){
    const n = cart.items.length, v = cartValue(cart);
    for (const l of cart.items){ l.inCart = false; l.onPad = pad; pad.placed.push(l); }
    cart.items = [];
    recomputePad(pad);
    toast('Dỡ ' + n + ' món lên bệ: ' + money(v));
  }
}

function pickUp(p){
  if (p.pushing){ releaseCart(p); return true; }
  if (p.held){ dropHeld(p); return true; }
  const best = nearestLoot(p);
  if (!best) return grabCart(p);              // nothing to pick up: take the cart handle
  if (best.onPad){                            // shop only — lifting a good back off the checkout
    const pad = best.onPad;
    const i = pad.placed.indexOf(best);
    if (i >= 0) pad.placed.splice(i,1);
    best.onPad = null;
    recomputePad(pad);
    if (S.pay.active){ S.pay.active = false; S.countdownActive = false; S.countdown = 0; }
  }
  best.held = true;
  best.grace = S.time + GRACE_AFTER_PICKUP;   // C3-5: no damage in the first second after pickup
  best.vx = best.vy = 0;
  best.freeX = p.x + Math.cos(p.dir)*(best.r+12);
  best.freeY = p.y + Math.sin(p.dir)*(best.r+12);
  p.held = best;
  return true;
}
function dropHeld(p){
  if (!p.held) return;
  const l = p.held;
  l.held = false; l.vx *= 0.3; l.vy *= 0.3;
  l.grace = S.time + 0.35;
  p.held = null;
  // onto the cart first — you walk up to the cart to load it, so it must win over the floor
  const cart = S.cart;
  if (cart && Math.hypot(l.x-cart.x, l.y-cart.y) < cart.r + TILE*1.4){
    if (cartFits(cart, l)){
      l.inCart = true; cart.items.push(l);
      toast('Chất lên xe: ' + money(l.value) + ' (' + cart.items.length + '/' + CART_SLOTS + ')');
      return;
    }
    toast(l.sizeIdx > CART_MAX_SIZE ? 'Món to quá, xe không chở được' : 'Xe đầy rồi');
  }
  const pad = S.pads[S.padIndex];
  if (pad && pad.active && !pad.done &&
      Math.abs(l.x-pad.x) < TILE*1.9 && Math.abs(l.y-pad.y) < TILE*1.9){
    l.onPad = pad; pad.placed.push(l); recomputePad(pad);
    toast('Đặt lên bệ: ' + money(l.value));
  }
}
function recomputePad(pad){
  pad.value = pad.placed.reduce((a,l)=> a + (l.gone?0:l.value), 0);
  if (pad.value < pad.quota) pad.countdown = 0;   // doc B1: taking loot back cancels the countdown
}

// ============================================================ monsters
// A sound in the house. Anything close enough turns and comes to look at the SPOT — not at the
// player, who may well have moved on by the time it arrives. That distinction is the whole reason
// this is a position and not a "go get him" flag.
function makeNoise(x, y, radius, strength){
  for (const m of S.monsters){
    if (m.sleep > 0) continue;
    if (Math.hypot(m.x-x, m.y-y) > radius) continue;
    m.tx = x; m.ty = y;
    m.alert = Math.max(m.alert, strength);
    m.lost = 0;                       // it has somewhere to be; the give-up clock restarts
  }
}

// Move a monster that has lost the player into a room near them. It NEVER appears anywhere the
// player can see: every candidate tile has to be out of line of sight, which on this map means
// behind a wall or in the next room. A monster that blinks into view is a bug the player can see.
function relocateFoe(m, rnd){
  const p = S.player;
  const [lo, hi] = RELOCATE_NEAR;
  for (let attempt = 0; attempt < 40; attempt++){
    const a = rnd()*Math.PI*2, r = mix(lo, hi, rnd());
    const x = p.x + Math.cos(a)*r, y = p.y + Math.sin(a)*r;
    const gx = (x/TILE)|0, gy = (y/TILE)|0;
    if (gx < 1 || gy < 1 || gx >= MW-1 || gy >= MH-1) continue;
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    if (hitsSolid(x, y, 9)) continue;
    if (losClear(p.x, p.y, x, y)) continue;        // in sight — never here
    m.x = x; m.y = y; m.home = { x, y };
    m.tx = x; m.ty = y; m.lost = 0; m.alert = 0; m.state = 'patrol';
    return true;
  }
  return false;
}

function stepMonsters(dt){
  const p = S.player;
  for (const m of S.monsters){
    const d = MONSTERS[m.type];
    m.wob += dt*4; m.hit = Math.max(0, m.hit - dt);
    const dist = Math.hypot(p.x-m.x, p.y-m.y);

    // knockback decays wherever it came from — a tranq dart, a bomb, or a shove
    if (m.kx || m.ky){
      moveEnt(m, m.kx*dt, m.ky*dt, 9);
      m.kx *= Math.pow(0.02, dt); m.ky *= Math.pow(0.02, dt);
      if (Math.abs(m.kx) < 2) m.kx = 0;
      if (Math.abs(m.ky) < 2) m.ky = 0;
    }
    m.shoveCd = Math.max(0, (m.shoveCd || 0) - dt);
    if (m.sleep > 0){
      m.sleep -= dt; m.alert = 0; m.state = 'sleep';
      continue;                       // tranquillised: it neither hunts nor hits
    }

    // Đẩy: walking into something shoves it away instead of standing there being chewed.
    // WHY the cooldown and the ASSIGNMENT: this first added to the knockback every frame
    // while in contact, which at 60 fps compounds against a 0.94/frame decay and settles
    // near 1900 px/s — the shove launched monsters clean across the map.
    // ROOT-CAUSE: a per-contact impulse was written as a per-frame force.
    if (S.upg.push > 0 && dist < 26 && m.shoveCd <= 0){
      const a = Math.atan2(m.y-p.y, m.x-p.x);
      const shove = 150 + 90 * S.upg.push;
      m.kx = Math.cos(a) * shove;
      m.ky = Math.sin(a) * shove;
      m.shoveCd = 0.5;
    }

    let detects = false;
    if (d.sight > 0 && dist < d.sight*TILE && losClear(m.x,m.y,p.x,p.y)){
      const a = Math.abs(angDiff(Math.atan2(p.y-m.y, p.x-m.x), m.dir));
      if (a < 1.1 || dist < 3*TILE) detects = true;
    }
    // the listener: blind, but noise carries. Running is what gets you caught.
    if (!detects && d.hear > 0 && p.noise > 0 && dist < d.hear*TILE*p.noise*0.6) detects = true;

    if (detects){
      // The moment it turns onto you is the moment worth hearing. Only the FIRST frame of it —
      // an alert that keeps refreshing while it chases you would fire this every step.
      if (m.alert <= 0){ SFX.sting(); fxShake(2.2); }
      m.alert = 2.6; m.tx = p.x; m.ty = p.y;                 // target updates ONLY on detection
      m.lost = 0;
    }
    else { m.alert = Math.max(0, m.alert - dt); m.lost += dt; }

    // Given up on where it is standing: move to a room near the player, out of sight.
    if (m.lost >= RELOCATE_AFTER && dist > RELOCATE_MIN_D && !S.levelDone && !S.dead){
      if (relocateFoe(m, Math.random)) SFX.thud();          // something moved, somewhere behind you
      else m.lost = RELOCATE_AFTER * 0.5;                   // nowhere to go; try again shortly
    }

    if (m.alert > 0){ m.state = 'chase'; }
    else if (S.levelDone || S.shiftLost){
      // The shift is over and there is exactly one thing left in the house worth standing near.
      // They ring the truck rather than pile onto it, which is what leaves a gap to thread.
      m.state = 'hunt';
      m.tx = S.car.x + Math.cos(m.guardA)*TRUCK_GUARD_R;
      m.ty = S.car.y + Math.sin(m.guardA)*TRUCK_GUARD_R;
      m.think -= dt;
      if (m.think <= 0){ m.think = 3.5 + Math.random()*3; m.guardA += (Math.random()-0.5)*1.2; }
    }
    else {
      m.state = 'patrol';
      m.think -= dt;
      const away = Math.hypot(m.x-m.home.x, m.y-m.home.y);
      if (m.think <= 0 || Math.hypot(m.tx-m.x, m.ty-m.y) < 14){
        m.think = 1.4 + Math.random()*2.2;
        if (away > 9*TILE){ m.tx = m.home.x; m.ty = m.home.y; }
        else {
          const a = Math.random()*Math.PI*2, r = 60+Math.random()*150;
          m.tx = clamp(m.x + Math.cos(a)*r, TILE, WPX-TILE);
          m.ty = clamp(m.y + Math.sin(a)*r, TILE, HPX-TILE);
        }
      }
    }
    const ax = m.tx-m.x, ay = m.ty-m.y, am = Math.hypot(ax,ay) || 1;
    m.dir = Math.atan2(ay,ax);
    const spd = m.speed * (m.state === 'chase' ? 1.25 : m.state === 'hunt' ? 1.0 : 0.7);
    moveEnt(m, ax/am*spd*dt, ay/am*spd*dt, 9);

    if (dist < 22 && m.hit <= 0 && !S.dead && m.alert > 0){
      m.hit = d.cd || 0.9;
      hurtPlayer(m.dmg, m.type, m.x, m.y);
      // a monster hitting you also hits what you are carrying
      if (p.held) damageLoot(p.held, m.dmg * 4);
    }
  }
}
function hurtPlayer(n, src, fromX, fromY){
  const p = S.player;
  (S.hurtLog = S.hurtLog || []).push({ t:+S.time.toFixed(1), n, src: src || '?', hp: Math.round(p.hp - n) });
  p.hp -= n; p.hurt = 0.45;
  // Three things at once, because one of them alone reads as a HUD number changing: the screen
  // jumps, the world stalls for a frame or two, and the blood comes in from the side it came from.
  fxShake(3 + Math.min(9, n*0.14));
  FX.hitstop = Math.max(FX.hitstop, n >= 25 ? 0.11 : 0.07);
  FX.hurtT = 1; FX.hurtDir = (fromX === undefined) ? p.dir : Math.atan2(fromY-p.y, fromX-p.x);
  SFX.hit(n);
  if (p.hp <= 0){ p.hp = 0; SFX.thud(); die(); }
}
function killMonster(m){
  const i = S.monsters.indexOf(m);
  if (i >= 0) S.monsters.splice(i,1);
  if (m.type === 'bomber'){
    S.bombs.push({ x:m.x, y:m.y, t:0, fuse:0, r:TILE*3.2, done:false, owner:'foe' });
  }
}

// ============================================================ items
function useSlot(p, i, aimed){
  const it = p.inv[i];
  if (!it || it.uses <= 0 || p.cooldown > 0 || S.dead) return false;
  const def = GEAR_BY_KEY[it.kind];
  if (def && def.passive) return false;          // the tracker works by being equipped
  const ang = aimed !== undefined ? aimed : p.dir;
  if (it.kind === 'gun'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*620, vy:Math.sin(ang)*620, life:0.9, kind:'gun' });
    it.uses--; p.cooldown = 0.45;
  } else if (it.kind === 'tranq'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520, life:1.0, kind:'tranq' });
    it.uses--; p.cooldown = 0.6;
  } else if (it.kind === 'heal'){
    p.hp = Math.min(p.hpMax, p.hp + 45); it.uses--; p.cooldown = 0.4;
    toast('Hồi máu');
  } else if (it.kind === 'bomb'){
    S.bombs.push({ x:p.x + Math.cos(ang)*30, y:p.y + Math.sin(ang)*30,
                   vx:Math.cos(ang)*300, vy:Math.sin(ang)*300, t:0, fuse:1.4, r:TILE*3.4, done:false, owner:'player' });
    it.uses--; p.cooldown = 0.5;
  } else if (it.kind === 'float'){
    p.floatT = 20; it.uses--; p.cooldown = 0.4;
    toast('Phản trọng lực — 20 giây');
  } else if (it.kind === 'shield'){
    p.shieldT = 25; it.uses--; p.cooldown = 0.4;
    toast('Bọc chống vỡ — 25 giây');
  } else return false;
  S.lastUse = { kind: it.kind, angle: ang, t: S.time };   // a bullet can hit a wall within one frame
  if (it.uses <= 0) p.inv[i] = null;              // used up, and the slot frees for the locker
  return true;
}
function hasGear(p, key){
  return p.inv.some(it => it && it.kind === key && it.uses > 0);
}
function stepProjectiles(dt){
  for (let i=S.bullets.length-1;i>=0;i--){
    const b = S.bullets[i];
    b.life -= dt;
    const nx = b.x + b.vx*dt, ny = b.y + b.vy*dt;
    if (b.life <= 0 || solidAt((nx/TILE)|0,(ny/TILE)|0)){ S.bullets.splice(i,1); continue; }
    b.x = nx; b.y = ny;
    for (const m of S.monsters){
      if (Math.hypot(m.x-b.x, m.y-b.y) < 13){
        if (b.kind === 'tranq'){
          // Source game's Tranq Gun: non-lethal, it just takes the thing out of the fight.
          m.sleep = 12; m.alert = 0; m.state = 'sleep';
          toast(MONSTERS[m.type].name + ' ngủ rồi');
        } else {
          m.hp -= 25; m.alert = 3;
          if (m.hp <= 0) killMonster(m);
        }
        S.bullets.splice(i,1);
        break;
      }
    }
  }
  for (let i=S.bombs.length-1;i>=0;i--){
    const b = S.bombs[i];
    b.t += dt;
    if (b.vx !== undefined){
      if (!hitsSolid(b.x+b.vx*dt, b.y, 4)) b.x += b.vx*dt; else b.vx = -b.vx*0.3;
      if (!hitsSolid(b.x, b.y+b.vy*dt, 4)) b.y += b.vy*dt; else b.vy = -b.vy*0.3;
      b.vx *= Math.pow(0.08, dt); b.vy *= Math.pow(0.08, dt);
    }
    if (b.t >= b.fuse && !b.done){
      b.done = true;
      for (const m of S.monsters.slice()){
        const d = Math.hypot(m.x-b.x, m.y-b.y);
        if (d < b.r){ m.hp -= 90 * (1 - d/b.r); if (m.hp <= 0) killMonster(m); }
      }
      // the funniest and most expensive source of damage in the source game: your own bomb
      for (const l of S.loot){
        if (l.gone) continue;
        const d = Math.hypot(l.x-b.x, l.y-b.y);
        if (d < b.r) damageLoot(l, 420 * (1 - d/b.r));
      }
      const dp = Math.hypot(S.player.x-b.x, S.player.y-b.y);
      if (dp < b.r) hurtPlayer(Math.round(55 * (1 - dp/b.r)), 'bomb', b.x, b.y);
      fxShake(9); fxFlash(0.35, '255,170,90');
    }
    if (b.t > b.fuse + 0.6) S.bombs.splice(i,1);
  }
}

// ============================================================ extraction
function stepExtraction(dt){
  const pad = S.pads[S.padIndex];
  if (!pad || pad.done) return;
  recomputePad(pad);
  if (pad.value >= pad.quota){
    pad.countdown = (pad.countdown || 0) + dt;
    S.countdownActive = true;
    S.countdown = Math.max(0, EXTRACT_COUNTDOWN - pad.countdown);
    // One beat per whole second, rising in pitch. A countdown you can hear is a countdown you can
    // stand away from and still trust, which is the point of standing away from it.
    const whole = Math.ceil(S.countdown);
    if (whole !== FX.lastTick){
      FX.lastTick = whole; FX.tickPulse = 1;
      if (whole > 0) SFX.tick(EXTRACT_COUNTDOWN - whole);
    }
    if (pad.countdown >= EXTRACT_COUNTDOWN) completePad(pad);
  } else {
    pad.countdown = 0; S.countdownActive = false; S.countdown = 0; FX.lastTick = -1;
  }
}
function completePad(pad){
  pad.done = true; pad.active = false;
  S.countdownActive = false; S.countdown = 0; FX.lastTick = -1;
  fxFlash(0.42, '150,255,190'); fxShake(3.5); SFX.chime();
  // Banking the haul tells the house exactly where you are standing. Everything within earshot
  // comes to look at the PAD — which by then is usually the spot you most want to leave.
  makeNoise(pad.x, pad.y, EXTRACT_NOISE_R, 2.2);
  const taken = pad.value;
  S.wallet += taken;
  const surplus = taken - pad.quota;
  for (const l of pad.placed){ l.gone = true; }
  const last = S.padIndex >= S.pads.length - 1;
  // Doc B1: surplus becomes a money bag, except on the final extraction.
  if (surplus > 0 && !last){
    const bag = makeLoot(pad.x + TILE*1.6, pad.y, SIZES[0], MATERIALS[2], Math.round(surplus));
    bag.isBag = true;
    bag.grace = S.time + 3;             // the bag is immune for ~3s so it can bounce
    S.loot.push(bag);
    S.wallet -= surplus;
    toast('Dư ' + money(surplus) + ' → túi tiền');
  }
  if (last){
    S.levelDone = true;
    toast('Xong hết bệ. Về xe.');
  } else {
    S.padIndex++;
    S.pads[S.padIndex].active = true;
    toast('Bệ tiếp theo đã mở');
  }
}

// ============================================================ lifecycle
// Doc B1 makes the level a haul against a quota, but nothing ever checked whether the quota was
// still reachable. A soak run found seed 6378 (level 3): every valuable collected, hauled, and
// broken along the way — $8,411 of a $9,523 quota with nothing left on the map to fetch. The truck
// only ends a level once every pad is done, so the player stood in a house with nothing to do and
// no way out, and the only button on screen wiped the whole run. The game punished them for a
// board IT made unwinnable, exactly as harshly as for dying.
// This names the moment instead: the shift is called, and the truck becomes the way out.
let lootJustDestroyed = false;
function recoverableValue(){
  let v = 0;
  for (const pad of S.pads) v += pad.value || 0;      // value already standing on a pad counts
  for (const l of S.loot) if (!l.gone && !l.onPad) v += l.value;
  return v;
}
function checkShiftLost(){
  if (!S.running || S.levelDone || S.dead || S.shiftLost) return;
  if (recoverableValue() + 0.5 >= S.quotaTotal) return;
  S.shiftLost = true;
  toast('Không còn đủ đồ để đạt chỉ tiêu. Về xe để kết thúc ca.');
}
function endLostShift(){
  if (!S.shiftLost || S.dead) return;
  S.dead = true; S.running = false;
  showVeil('Ca này hỏng rồi',
    'Số đồ còn lại trong nhà không đủ để đạt chỉ tiêu màn ' + S.level + ' nữa, nên ca này coi như trượt. ' +
    'Doc B4: trượt chỉ tiêu là mất cả run — tiền, nâng cấp và tủ đồ.',
    'Làm lại từ màn 1', () => { resetRun(); startLevel(); });
}
function die(){
  if (S.dead) return;
  S.dead = true; S.running = false;
  S.corpses.push({ x:S.player.x, y:S.player.y });
  showVeil('Ca trực kết thúc',
    'Bạn gục ở màn ' + S.level + '. Trong bản nhiều người, đồng đội có thể vác đầu bạn về bệ để hồi sinh — bản một người này thì mất cả ca.',
    'Làm lại từ màn 1', () => { resetRun(); startLevel(); });
}
// Doc B4: losing a run costs everything — money, upgrades, and the locker. That is what
// gives the quota weight; if a loss only cost one level nobody would fear it.
function resetRun(){
  S.level = 1; S.wallet = 0;
  S.upg = newUpgrades();
  S.upgSpawned = {}; S.gearBought = {};
  S.stash = []; S.offer = null;
  // Reset the player IN PLACE. buildLevel, the bot and the test hooks all hold a reference
  // to this object; swapping it for a new one silently detaches every one of them, and the
  // detached copy keeps answering questions with stale values instead of failing loudly.
  const fresh = newPlayer();
  if (S.player) Object.assign(S.player, fresh); else S.player = fresh;
}
function finishLevel(){
  // The shift's own record, kept because the station REPLACES the house — its pads and its loot
  // become the checkout and the stock, so after this call there is nothing left to ask about how
  // the level went.
  S.lastLevel = { level:S.level, wallet:S.wallet,
                  pads:S.pads.map(q => ({ done:q.done, quota:q.quota, value:q.value })) };
  // Doors, then the van pulls out, then the station — the shift ends on screen rather than in a
  // scene change. startShop is what actually builds the next place; this only delays it.
  startCut('depart', '', '', () => startShop());
}
function startLevel(seed){
  S.shopMode = false;
  buildLevel(seed === undefined ? (Math.random()*999999)|0 : seed);
  S.running = true; S.dead = false;
  hideVeil();
  startCut('arrive', 'Màn ' + S.level, 'Chỉ tiêu ' + money(S.quotaTotal));
}


// ============================================================ the service station, as a room
// The station used to be a panel of buttons over a frozen game. In the source game it is a PLACE:
// a room off the truck with the night's stock standing on the floor, a checkout you carry things
// onto, and a button by the till you stand on to pay. Everything a shop needs was already in this
// file — a room, loot you can carry, a cart, a pad that adds up what is standing on it, and a
// countdown — so the shop is a level rather than a screen, and reuses all of it.
//
// The one rule that differs from a house: on the checkout pad you may take things BACK OFF. In a
// house that would let you cancel an extraction after banking it; here it is just changing your
// mind, which is the entire point of a shop.
const PAY_COUNTDOWN = 3;          // how long the till takes, and how long you have to change your mind

// The station is a HALL, not a room: one room wide and the height of the whole map, because the
// frame is 9:16 and a 21x15 room inside it is a stripe of floor with black above and below it.
// Laid out the way you walk it — stock at the top, the checkout in the middle, the truck at the
// bottom — so a visit is a walk down it rather than a circuit of a box.
const SHOP_COL = 1;               // which column of rooms is carved out
// The hall's interior is TWELVE tiles across, which with its two walls is exactly the 14 the frame
// shows. Cut down from 19 when the camera zoomed in: a shop you cannot see both sides of is a shop
// you have to walk the length of to find out what is in it.
const SHOP_X0 = 4, SHOP_X1 = 15;
const SHOP_CX = ((SHOP_COL*RW + SHOP_X0 - 1) + (SHOP_COL*RW + SHOP_X1 + 1) + 1) / 2 * TILE;
// Interior height in tiles. Deliberately SHORTER than the frame can show: the bottom band of a
// portrait frame belongs to the two thumb sticks and the grab button, and a truck drawn under them
// is a truck you cannot see yourself walking into.
const SHOP_ROWS = 30;

function shopTile(tx, ty){        // hall-local tile -> world centre
  return { x: ((SHOP_COL*RW + tx) + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

function makeGood(kind, key, name, price, x, y){
  // A good is a piece of loot with a price where its value would be. That is not a trick: it means
  // it can be carried, dropped, loaded onto the cart and totted up by the pad with no new code, and
  // the cart is exactly as useful for a six-item shopping trip as it is for a haul.
  const l = makeLoot(x, y, SIZES[0], MATERIALS[2], price);
  l.good = { kind, key, name };
  l.shopGoods = true;             // and nothing in a shop breaks — see damageLoot
  return l;
}

function buildShop(){
  S.shopMode = true;
  S.buildId = (S.buildId || 0) + 1;
  S.grid = new Uint8Array(MW*MH).fill(WALL);
  S.deco = new Uint8Array(MW*MH);
  S.explored = new Uint8Array(MW*MH);
  S.roomStyle = new Uint8Array(GX*GY).fill(FLOOR_STYLE.tile);
  S.rooms = [];
  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++)
    S.rooms.push({ name:'Trạm dịch vụ', cx, cy, seen: cx===SHOP_COL });
  S.loot = []; S.monsters = []; S.pads = []; S.bullets = []; S.bombs = []; S.corpses = [];
  S.padIndex = 0; S.countdown = 0; S.countdownActive = false;
  S.levelDone = false; S.dead = false; S.shiftLost = false; S.hurtLog = [];
  S.quotaTotal = 0;
  S.pay = { active:false, t:0 };
  S.onButton = false; S.shopCanLeave = false;

  const gx0 = SHOP_COL*RW;
  for (let y=1; y<=SHOP_ROWS; y++) for (let x=SHOP_X0; x<=SHOP_X1; x++){
    const i = y*MW + gx0+x;
    S.grid[i] = FLOOR; S.explored[i] = 1;
  }
  // shelving behind each row of stock, so the goods are standing in front of something. Kept clear
  // of the top of the frame, where the health bar and the minimap are drawn over the world.
  for (const y of [7, 13]) for (const x of [4,5, 9,10, 14,15]){
    const i = y*MW + gx0+x;
    S.grid[i] = PROP; S.deco[i] = P_SHELF;
  }

  if (!S.offer) S.offer = rollShop();
  // Three columns inside a twelve-tile hall.
  const cols = [6, 10, 14];
  S.offer.upgrades.forEach((u, i) => {
    const t = shopTile(cols[i % cols.length], 9);
    S.loot.push(makeGood('up', u.key, u.name, upgradePrice(u), t.x, t.y));
  });
  S.offer.gear.forEach((g, i) => {
    const t = shopTile(cols[i % cols.length], 15);
    S.loot.push(makeGood('gear', g.key, g.name, g.price, t.x, t.y));
  });

  const padT = shopTile(10, 21);
  S.pads.push({ x:padT.x, y:padT.y, ri:GX+SHOP_COL, quota:0, placed:[], value:0,
                active:true, done:false, index:0, shop:true });
  const btn = shopTile(13, 21);      // beside the checkout, not behind it
  S.button = { x:btn.x, y:btn.y, r:TILE*1.05 };

  const truck = shopTile(10, 27);
  S.car.x = truck.x; S.car.y = truck.y;
  S.cart = makeCart(truck.x + TILE*2.8, truck.y - TILE*0.4);

  S.player = S.player || newPlayer();
  S.player.x = truck.x - TILE*2.8; S.player.y = truck.y - TILE*0.2;
  S.player.held = null; S.player.aimSlot = -1; S.player.aimId = -1;
  S.player.pushing = false; S.player.runT = 0; S.player.rushing = false;
  S.player.hp = S.player.hpMax; S.player.stam = S.player.stamMax;
  S.stashOpen = false;

  fxReset();
  S.segs = buildSegments();
  prerenderWorld(mulberry32((S.seed ^ 0x5bf03635) >>> 0));
  prerenderMinimap();
  S.time = 0;
  S.running = true;
  startCut('arrive', 'Trạm dịch vụ', 'Ví ' + money(S.wallet));
  toast('Trạm dịch vụ — mang đồ lên bệ, đạp nút bên cạnh để trả tiền.');
}

function startShop(){
  S.offer = null;                 // a fresh visit rolls fresh stock, like the source game
  buildShop();
  hideVeil();
}
function leaveShop(){
  startCut('depart', '', '', () => {
    S.shopMode = false;
    S.level++;
    S.offer = null;
    startLevel();
  });
}

function togglePay(){
  const pad = S.pads[0];
  if (!pad) return;
  if (S.pay.active){
    S.pay.active = false; S.pay.t = 0;
    S.countdownActive = false; S.countdown = 0; FX.lastTick = -1;
    toast('Đã hủy thanh toán'); SFX.thud();
    return;
  }
  const live = pad.placed.filter(l => !l.gone);
  if (!live.length){ toast('Chưa có món nào trên bệ'); return; }
  if (pad.value > S.wallet){
    toast('Không đủ tiền: ' + money(pad.value) + ' — ví có ' + money(S.wallet));
    SFX.thud();
    return;
  }
  S.pay.active = true; S.pay.t = 0; FX.lastTick = -1;
  toast('Đang thanh toán ' + money(pad.value) + '…');
}

function completePurchase(pad){
  const live = pad.placed.filter(l => !l.gone);
  const total = live.reduce((a,l) => a + l.value, 0);
  if (total > S.wallet){ S.pay.active = false; return; }   // it changed under us; charge nothing
  S.wallet -= total;
  let ups = 0, gears = 0;
  for (const l of live){
    if (l.good.kind === 'up'){ S.upg[l.good.key]++; ups++; }
    else {
      const def = GEAR_BY_KEY[l.good.key];
      S.stash.push({ kind:l.good.key, uses:def.uses });
      S.gearBought[l.good.key] = (S.gearBought[l.good.key]||0) + 1;
      gears++;
    }
    l.gone = true; l.onPad = null;
  }
  pad.placed.length = 0; pad.value = 0;
  S.pay.active = false; S.countdownActive = false; S.countdown = 0; FX.lastTick = -1;
  applyUpgrades();
  fxFlash(0.4, '150,255,190'); fxShake(3); SFX.chime();
  toast('Đã mua ' + (ups ? ups + ' nâng cấp' : '') + (ups && gears ? ' và ' : '') +
        (gears ? gears + ' món (đã vào tủ trên xe)' : '') + ' — ' + money(total));
}

function stepShop(dt){
  const p = S.player, pad = S.pads[0];
  if (!pad) return;
  recomputePad(pad);

  // The floor button. It toggles on the step ON — you have to step off and back on to change your
  // mind again, which is what makes "đạp lại" a deliberate second action and not a wobble.
  const on = Math.hypot(p.x-S.button.x, p.y-S.button.y) < S.button.r + 9;
  if (on && !S.onButton) togglePay();
  S.onButton = on;

  if (S.pay.active){
    if (!pad.placed.some(l => !l.gone)){
      S.pay.active = false; S.countdownActive = false; S.countdown = 0;
    } else {
      S.pay.t += dt;
      S.countdownActive = true;
      S.countdown = Math.max(0, PAY_COUNTDOWN - S.pay.t);
      const whole = Math.ceil(S.countdown);
      if (whole !== FX.lastTick){
        FX.lastTick = whole; FX.tickPulse = 1;
        if (whole > 0) SFX.tick(PAY_COUNTDOWN - whole);
      }
      if (S.pay.t >= PAY_COUNTDOWN) completePurchase(pad);
    }
  } else if (S.countdownActive){ S.countdownActive = false; S.countdown = 0; FX.lastTick = -1; }

  // The truck is the exit, but the player is standing next to it when the room opens, so it only
  // becomes an exit once they have walked away from it once.
  const d = Math.hypot(p.x-S.car.x, p.y-S.car.y);
  if (!S.shopCanLeave && d > TILE*4.5) S.shopCanLeave = true;
  if (S.shopCanLeave && d < TILE*2.2) leaveShop();
}


// ============================================================ arriving and leaving
// The truck was a blue rectangle that existed before the level did. In the source game it is how
// the shift STARTS: the name of the place, the van coming in hard enough to rock the camera, the
// back doors opening, and you stepping out of it. Leaving is the same sentence backwards.
//
// These run on REAL time, not on the fixed simulation step, and the simulation does not advance
// while one is playing — see frame(). That is deliberate: a cutscene the monsters get to walk
// around during is a cutscene that can kill you.
const CUT_ARRIVE = 3.0, CUT_DEPART = 2.1;
const CUT_IN_START = 1.05, CUT_IN_HIT = 1.85;   // when the van starts moving, and when it lands
const CUT_DOOR_OPEN = [1.95, 2.55];             // the back doors
const CUT_STEP_OUT  = [2.30, 2.95];             // and you, walking out of them
const CUT_DOOR_SHUT = [0.10, 0.60];             // leaving: doors first
const CUT_DRIVE_OFF = [0.60, 1.75];             // then the van

// Off by default for nobody, but switchable: an automated run drives the game through hundreds of
// level starts and should not sit through three seconds of van for each of them.
let cutscenesOn = true;
function setCutscenes(on){
  cutscenesOn = !!on;
  if (!on && S.cut){ const f = S.cut.then; S.cut = null; if (f) f(); }
}
function startCut(kind, label, sub, then){
  if (!cutscenesOn){ if (then) then(); return; }
  S.cut = { kind, t:0, label:label||'', sub:sub||'', then:then||null, banged:false, shut:false };
}
// Any input skips it. An intro you have already seen twelve times is an intro you are trying to
// get past, and a game that will not let you is a game you stop starting.
function skipCut(){
  if (!S.cut) return false;
  const f = S.cut.then; S.cut = null; if (f) f();
  return true;
}
function stepCut(dt){
  const c = S.cut;
  if (!c) return;
  c.t += dt;
  if (c.kind === 'arrive'){
    if (!c.banged && c.t >= CUT_IN_HIT){ c.banged = true; fxShake(13); SFX.thud(); }
    if (c.t >= CUT_ARRIVE){ const f = c.then; S.cut = null; if (f) f(); }
  } else {
    if (!c.shut && c.t >= CUT_DOOR_SHUT[1]){ c.shut = true; SFX.thud(); }
    if (c.t >= CUT_DEPART){ const f = c.then; S.cut = null; if (f) f(); }
  }
}
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1-t, 3);
const span = (t, a, b) => clamp((t-a)/(b-a), 0, 1);

// Where the van is DRAWN. Its real position never moves — every nearTruck test in the game reads
// that — so the whole animation lives in this one offset.
function carDrawOffset(){
  const c = S.cut;
  if (!c) return { dx:0, dy:0, door:1, alpha:1 };
  const run = Math.max(vwW(), 600) * 1.25;
  if (c.kind === 'arrive'){
    const k = ease(span(c.t, CUT_IN_START, CUT_IN_HIT));
    return { dx: -run*(1-k), dy:0, door: span(c.t, CUT_DOOR_OPEN[0], CUT_DOOR_OPEN[1]),
             alpha: c.t < CUT_IN_START ? 0 : 1 };
  }
  const k = ease(span(c.t, CUT_DRIVE_OFF[0], CUT_DRIVE_OFF[1]));
  return { dx: run*k, dy:0, door: 1 - span(c.t, CUT_DOOR_SHUT[0], CUT_DOOR_SHUT[1]), alpha:1 };
}
// And where the PLAYER is drawn: stepping out of the back on the way in, climbing in on the way
// out. Returns null when they are inside the van and should not be drawn at all.
function playerDrawPos(){
  const p = S.player, c = S.cut;
  if (!c) return { x:p.x, y:p.y, alpha:1 };
  const off = carDrawOffset();
  const cx = S.car.x + off.dx, cy = S.car.y + off.dy;
  if (c.kind === 'arrive'){
    if (c.t < CUT_STEP_OUT[0]) return null;
    const k = ease(span(c.t, CUT_STEP_OUT[0], CUT_STEP_OUT[1]));
    return { x: mix(cx, p.x, k), y: mix(cy, p.y, k), alpha: Math.min(1, k*2.2) };
  }
  const k = ease(span(c.t, 0, CUT_DOOR_SHUT[0] + 0.18));
  if (k >= 1) return null;
  return { x: mix(p.x, cx, k), y: mix(p.y, cy, k), alpha: 1 - k*0.4 };
}

// The card. Name of the place first, because knowing where you have been dropped is the one thing
// the old build never said out loud.
function drawCutscene(c, hud){
  const cut = S.cut;
  if (!cut) return;
  const w = hud.w, h = hud.h;
  let veil = 0, text = 0;
  if (cut.kind === 'arrive'){
    veil = 1 - span(cut.t, 0.75, CUT_IN_START + 0.35);
    text = Math.min(span(cut.t, 0.10, 0.55), 1 - span(cut.t, 1.55, 2.15));
  } else {
    veil = span(cut.t, CUT_DRIVE_OFF[1] - 0.25, CUT_DEPART);
    text = 0;
  }
  if (veil > 0.002){ c.fillStyle = `rgba(6,7,9,${veil})`; c.fillRect(0,0,w,h); }
  if (text > 0.002 && cut.label){
    c.textAlign = 'center';
    c.font = `400 ${Math.round(Math.min(w*0.11, 46))}px Cambria, "Times New Roman", serif`;
    c.fillStyle = `rgba(232,235,238,${text})`;
    c.fillText(cut.label, w/2, h*0.44);
    if (cut.sub){
      c.font = `600 ${Math.round(Math.min(w*0.035, 14))}px ui-monospace, monospace`;
      c.fillStyle = `rgba(208,138,52,${text*0.95})`;
      c.fillText(cut.sub, w/2, h*0.44 + Math.min(w*0.075, 32));
    }
    // a hairline under the name, which is what makes it read as a card and not as a toast
    c.strokeStyle = `rgba(140,150,160,${text*0.5})`; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w*0.5 - w*0.16, h*0.44 + Math.min(w*0.115, 50));
    c.lineTo(w*0.5 + w*0.16, h*0.44 + Math.min(w*0.115, 50));
    c.stroke();
    c.textAlign = 'left';
  }
}

// ============================================================ toast
function toast(msg){ S.message = msg; S.messageT = 3.2; }

// ============================================================ input
const keys = new Set();
let stickL = null, stickR = null;   // {id, ox, oy, x, y}
let lookHeld = false;
const CV = () => document.getElementById('game');

function setupInput(){
  const cv = CV();
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['w','a','s','d','e','f','r','1','2','3','shift','tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    if (skipCut()) return;
    if (k === 'r'){ resetRun(); startLevel(); return; }
    if (k === 'tab'){ S.bigMap = !S.bigMap; return; }
    if (k === 'e'){ pickUp(S.player); return; }
    if (k === 'f'){ toggleStash(); return; }
    if (k === '1' || k === '2' || k === '3'){ useSlot(S.player, +k - 1); return; }
    keys.add(k);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  cv.addEventListener('pointerdown', e => {
    SFX.wake();                       // browsers refuse to start audio outside a user gesture
    // One finger is enough: this device is a touchscreen, and its mouse events are ghosts.
    if (e.pointerType === 'touch') touchSeen = true;
    if (skipCut()) return;
    cv.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    const hud = hudLayout();
    // The two left-hand buttons are real touch targets, not decoration.
    // WHY: they were drawn but never hit-tested, so on a phone — the platform this design
    // is for — the grab button did nothing and a touch there was read as a movement stick.
    // ROOT-CAUSE: pointerdown split the screen in half before testing any button.
    // SEE: doc C2-4, which moved the grab button to the left thumb precisely so it is used.
    if (S.player && Math.hypot(p.x-hud.grab.x, p.y-hud.grab.y) < hud.grab.r*1.25){
      pickUp(S.player); return;
    }
    if (S.player && nearTruck(S.player) &&
        Math.hypot(p.x-hud.stash.x, p.y-hud.stash.y) < hud.stash.r*1.25){
      toggleStash(); return;
    }
    // item slots first: a press that STARTS on a slot is aiming, not looking (doc C2-5)
    for (let i=0;i<3;i++){
      const s = hud.slots[i];
      if (Math.hypot(p.x-s.x, p.y-s.y) < s.r*1.6){
        const it = S.player.inv[i];
        const def = it && GEAR_BY_KEY[it.kind];
        if (!it || it.uses <= 0) return;
        if (def && def.passive) return;                 // the tracker works by being carried
        // A thing that happens to you has nowhere to point: its slot is a plain button.
        if (!def || !def.aim){ useSlot(S.player, i); return; }
        S.player.aimSlot = i; S.player.aimId = e.pointerId;
        S.player.aimX = p.x; S.player.aimY = p.y;
        stickR = null;
        return;
      }
    }
    // A stick is only born in the thumb band. Above it the screen is buttons and world, and a
    // touch that misses a button there does nothing rather than yanking the character sideways.
    if (p.y > hud.thumbY){
      if (p.x < hud.w*0.5){ stickL = { id:e.pointerId, ox:p.x, oy:p.y, x:p.x, y:p.y }; }
      // The look stick FLOATS, exactly like the move stick: its origin is where the thumb landed.
      // WHY: its origin used to be pinned to the middle of its painted ring, so putting a thumb
      // down anywhere below that middle — which is most of the band, and where a thumb naturally
      // rests — read as "push down" and swung the character to face the floor and stay there.
      // Resting a thumb is now worth nothing; you turn by DRAGGING, which is the only motion that
      // was ever meant to mean anything.
      else { stickR = { id:e.pointerId, ox:p.x, oy:p.y, x:p.x, y:p.y }; lookHeld = true; }
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = canvasPoint(e);
    if (S.player && S.player.aimSlot >= 0 && S.player.aimId === e.pointerId){
      S.player.aimX = p.x; S.player.aimY = p.y; return;
    }
    if (stickL && stickL.id === e.pointerId){ stickL.x = p.x; stickL.y = p.y; }
    if (stickR && stickR.id === e.pointerId){ stickR.x = p.x; stickR.y = p.y; }
  });
  const up = e => {
    const p = canvasPoint(e);
    const pl = S.player;
    if (pl && pl.aimSlot >= 0 && pl.aimId === e.pointerId){
      const hud = hudLayout(), s = hud.slots[pl.aimSlot];
      const dx = p.x - s.x, dy = p.y - s.y;
      // Letting go USES it — that is the whole point of holding it. The one way out is the X in the
      // top corner, which is what a mobile MOBA trains the thumb to look for. Releasing without
      // having dragged anywhere throws it along the way you are already facing rather than eating
      // the press, because a press that does nothing is indistinguishable from a broken button.
      if (!overCancel(hud, p)){
        const far = Math.hypot(dx,dy) > hud.aimR*STICK_DEAD;
        useSlot(pl, pl.aimSlot, far ? Math.atan2(dy,dx) : pl.dir);
      }
      pl.aimSlot = -1; pl.aimId = -1;
      return;
    }
    if (stickL && stickL.id === e.pointerId) stickL = null;
    if (stickR && stickR.id === e.pointerId){ stickR = null; lookHeld = false; }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  // MOUSE-look is read from a POINTER event filtered on `pointerType`, and is switched off for good
  // the first time a finger touches the screen.
  //
  // WHY, and this is the whole "the rotate joystick keeps turning me downward" bug: a touchscreen
  // fires COMPATIBILITY mouse events after every tap — a mousemove at the point the finger lifted
  // from. Those arrive as plain MouseEvents, whose `pointerType` is undefined, so the old guard
  // (`if (e.pointerType === 'touch') return`) let every one of them through. Lifting a thumb off the
  // look stick therefore planted a phantom cursor at the BOTTOM of the screen, and for the next
  // second the character turned to face it. Measured: 65 degrees of unasked-for rotation, every
  // time a thumb came off, in the corner of the screen where a thumb always is.
  // ROOT-CAUSE: a mouse-only input was read from an event that a touchscreen also sends.
  cv.addEventListener('pointermove', e => {
    if (touchSeen || e.pointerType !== 'mouse') return;
    mouseScreen = canvasPoint(e);
    mouseMovedAt = performance.now();
  });
  // A cursor that leaves the play area has stopped looking at anything.
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouseScreen = null; });
}
function overCancel(hud, p){
  return Math.hypot(p.x-hud.cancel.x, p.y-hud.cancel.y) < hud.cancel.r*1.25;
}
function aimAngle(p, hud){
  const s = hud.slots[p.aimSlot];
  const dx = p.aimX - s.x, dy = p.aimY - s.y;
  return Math.hypot(dx,dy) > hud.aimR*STICK_DEAD ? Math.atan2(dy,dx) : p.dir;
}
// The cursor is remembered in SCREEN space and converted to a world point fresh every frame.
//
// WHY: it used to be converted ONCE, at the moment the mouse moved, and stored as a fixed point in
// the house. Walking then swung the facing through that point like a compass needle passing a
// magnet — and since whatever you are carrying is pinned to the facing, the load swung around you.
// Measured on a straight walk with the cursor left sitting still: the facing travelled 229 degrees
// in two and a half seconds, and 479 with a hand resting on the mouse. That is the "dragging an
// item makes it rotate randomly" report. Nothing was random about it; it was parallax.
// ROOT-CAUSE: a screen-space input was stored in world space, so camera motion became input.
// It got worse the moment the camera stopped being clamped to the map and started following.
let mouseScreen = null, mouseMovedAt = -1e9, touchSeen = false;
// Real time, not simulation time: how long ago the player physically moved the mouse.
const mouseFresh = () => (performance.now() - mouseMovedAt) < LOOK_IDLE*1000;
const mouseWorldNow = () => mouseScreen &&
  { x: cam.x + mouseScreen.x/zoom(), y: cam.y + mouseScreen.y/zoom() };
function canvasPoint(e){
  const cv = CV(), r = cv.getBoundingClientRect();
  return { x:(e.clientX-r.left)/r.width*viewW, y:(e.clientY-r.top)/r.height*viewH };
}

// ============================================================ camera / sizing
const cam = { x:0, y:0 };
let viewW = 1280, viewH = 720, dpr = 1, lightCv = null;
// The game is locked to a PORTRAIT frame. On a phone held upright that is the whole screen; on a
// desktop it is a 9:16 column with black either side — the shape every other game on the hub uses.
// WHY this is JavaScript and not one CSS declaration: an `aspect-ratio` box has to be clamped by
// max-width on a narrow screen and by max-height on a wide one, and whichever clamp fires breaks the
// ratio instead of preserving it. Fitting it explicitly is exact on both.
const FRAME_W = 9, FRAME_H = 16;
function fitCanvas(){
  const cv = CV(), box = cv.parentElement;
  if (!box) return;
  // clientWidth/Height INCLUDE padding, and the surround holds back the notch insets as padding.
  const cs = getComputedStyle(box);
  const aw = box.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = box.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
  if (!(aw > 0) || !(ah > 0)) return;
  const k = Math.min(aw/FRAME_W, ah/FRAME_H);
  cv.style.width  = Math.round(k*FRAME_W) + 'px';
  cv.style.height = Math.round(k*FRAME_H) + 'px';
}
function resize(){
  fitCanvas();
  const cv = CV(), r = cv.getBoundingClientRect();
  if (!r.width) return;
  dpr = Math.min(devicePixelRatio || 1, 2);
  viewW = Math.round(r.width); viewH = Math.round(r.height);
  cv.width = Math.round(viewW*dpr); cv.height = Math.round(viewH*dpr);
  if (!lightCv) lightCv = document.createElement('canvas');
  lightCv.width = cv.width; lightCv.height = cv.height;
}
function worldTransform(c){
  const k = dpr*zoom();
  c.setTransform(k,0,0,k, (-cam.x+shakeX)*k, (-cam.y+shakeY)*k);
}
// World point -> a point in the HUD's coordinate space, shake included. Anything drawn on top of
// the darkness (aim lines, floating numbers) has to go through these or it detaches from the world
// the instant the screen is hit.
const scrX = x => (x - cam.x + shakeX)*zoom();
const scrY = y => (y - cam.y + shakeY)*zoom();
const vwW = () => viewW/zoom(), vwH = () => viewH/zoom();

// ============================================================ HUD layout
// Laid out around two thumbs on a phone held upright, and around one rule: NOTHING a thumb presses
// may sit where a thumb STEERS. The sticks own a band across the bottom of the frame; every button
// lives above that band, and a touch inside the band can only ever be a stick.
//
// WHY the rule exists: the left stick floats — it appears wherever the thumb lands — and the grab
// button used to sit directly above it with a touch radius that overlapped its travel. Reaching to
// move sometimes grabbed instead, and the stick's ring was drawn over the buttons while dragging.
// The three item slots had the mirror problem: they were arced around the right stick close enough
// to be clipped by the frame edge, and the aim ring raised from one covered the other two.
function hudLayout(){
  const w = viewW, h = viewH;
  const pad = Math.min(w,h) * 0.05;
  const R   = Math.min(w,h) * 0.115;      // stick radius — a thumb's comfortable throw
  const sr  = R * 0.44;                   // button radius
  const left  = { x: pad + R, y: h - pad - R, r: R };
  const right = { x: w - pad - R, y: h - pad - R, r: R };

  // Everything below this line belongs to the sticks. Buttons start above it.
  const thumbY = h - (pad + 2*R + 10);

  // The three slots run UP THE RIGHT EDGE in a column rather than on an arc. A column cannot be
  // clipped by the frame, its spacing does not change with the aspect, and a raised aim stick on
  // one of them covers empty screen rather than the other two.
  const slots = [0,1,2].map(i => ({
    x: w - pad - sr,
    y: thumbY - sr*1.5 - i*(sr*2.45),
    r: sr, i
  }));
  // Grab sits on the LEFT thumb (doc C2-4 — grabbing needs no aim), up and IN from the corner the
  // move thumb rests in, so reaching for it is a deliberate move away from the stick.
  const grab  = { x: pad + R + sr*1.6, y: thumbY - sr*1.35, r: sr*1.25 };
  // The locker sits above it, on the same thumb, and only appears when the truck is within reach —
  // it is a start-room action, not a field one.
  const stash = { x: grab.x, y: grab.y - sr*2.8, r: sr*1.25 };
  // Where a raised item goes to be put back down: the top-right corner, the way a mobile MOBA does
  // it. It is the furthest point from the thumb that raised it, and on the way to nowhere else.
  const cancel = { x: w - pad - sr*1.6, y: pad + sr*1.6, r: sr*1.6 };
  // The heart belongs WITH the controls, not tucked in a corner beside the health bar where nobody
  // found it. Centre-bottom, just above the thumb band: between the two sticks, clear of every
  // button, and squarely in the middle of where the eyes already are.
  const heart = { x: w/2, y: thumbY - Math.min(w,h)*0.075 - 8, r: Math.min(w,h)*0.075 };
  return { w, h, left, right, slots, grab, stash, cancel, heart, pad, thumbY, aimR: R };
}
function nearTruck(p){ return Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*3.2; }

// ============================================================ step
function step(dt){
  S.time += dt;
  S.ticks = (S.ticks || 0) + 1;   // the fixed-step counter; a render frame may run 0, 1 or 2
  S.messageT = Math.max(0, S.messageT - dt);
  const p = S.player;
  if (!p) return;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hurt = Math.max(0, p.hurt - dt);

  p.floatT = Math.max(0, p.floatT - dt);
  p.shieldT = Math.max(0, p.shieldT - dt);

  // ---- movement intent
  let vx = 0, vy = 0, push = 0;
  // The bot plays houses, not shops: it reasons about quotas and pads to extract, neither of which
  // a service station has. In the station it stands still and the run waits for a human.
  if (window.__botActive && window.BOT && !S.shopMode) { const b = window.BOT.think(dt); vx = b.vx; vy = b.vy; push = b.push; if (b.look !== undefined) p.dir = b.look; }
  else {
    if (keys.has('w')||keys.has('arrowup')) vy -= 1;
    if (keys.has('s')||keys.has('arrowdown')) vy += 1;
    if (keys.has('a')||keys.has('arrowleft')) vx -= 1;
    if (keys.has('d')||keys.has('arrowright')) vx += 1;
    const m = Math.hypot(vx,vy);
    if (m > 0){ vx/=m; vy/=m; push = keys.has('shift') ? 1 : 0.6; }
    if (stickL){
      // The origin TRAILS the thumb: once the thumb is further out than the stick's own radius, the
      // origin is dragged along behind it so it stays exactly that far back.
      // WHY: the origin used to be frozen wherever the thumb first landed, forever. After a long drag
      // the thumb sits hundreds of px out, so a correction of a few dozen px barely moves the angle —
      // measured, a 40 px push straight up after a 200 px drag right steered 65 degrees off intent.
      // A thumb's natural arc sags downward, so in the hand that reads as a gravity dragging the
      // character down whenever you are already moving.
      // ROOT-CAUSE: a floating-origin stick was implemented as a fixed-origin one placed late.
      const maxD = hudLayout().left.r;
      let dx = stickL.x-stickL.ox, dy = stickL.y-stickL.oy;
      let d = Math.hypot(dx,dy);
      if (d > maxD){
        stickL.ox += dx/d*(d-maxD); stickL.oy += dy/d*(d-maxD);
        dx = stickL.x-stickL.ox; dy = stickL.y-stickL.oy; d = maxD;
      }
      if (d > maxD*STICK_DEAD){ vx = dx/d; vy = dy/d; push = clamp(d/maxD, 0, 1); }
    }
  }

  // Doc C2-3: stick deflection IS the run/walk/sneak control. No extra button, and it gives
  // the sound-hunting monster something real to hunt.
  let tier = 0;               // 0 sneak, 1 walk, 2 run
  if (push > 0.85) tier = 2; else if (push > 0.35) tier = 1;
  if (tier === 2 && p.stam <= 0) tier = 1;
  const moving = !!(vx || vy);

  // Nước rút: hold the run input and the character winds up into a sprint by itself. No gesture,
  // no cooldown, no button — the cost is stamina and being heard.
  const runNow = tier === 2 && moving;
  p.runT = runNow ? p.runT + dt : 0;
  p.rushing = runNow && S.upg.rush > 0 && p.runT >= RUSH_DELAY && p.stam > 0;

  p.noise = !moving ? 0 : p.rushing ? RUSH_NOISE : tier === 2 ? 2 : tier === 1 ? 1 : 0.25;
  if (S.noiseOverride != null) p.noise = S.noiseOverride;
  let tierMul = tier === 2 ? 1.5 * (1 + S.upg.sprint*0.20) : tier === 1 ? 1.0 : 0.5;
  if (p.rushing) tierMul *= 1 + RUSH_GAIN*S.upg.rush;
  if (tier === 2){ p.stam = Math.max(0, p.stam - STAM_DRAIN*dt*(p.rushing ? RUSH_STAM : 1)); }
  else {
    // Hồi thể lực nhanh: standing still is already the fastest recovery; the upgrade
    // widens that gap, so holding position near a blind hunter pays twice.
    const idle = !moving || tier === 0;
    p.stam = Math.min(p.stamMax, p.stam + STAM_REGEN*dt*(tier===0?1.4:1)*(idle ? 1 + S.upg.regen*0.5 : 1));
  }

  p.speedMul = tierMul;        // the tier multiplier, kept so a test can read what running is worth
  if (vx || vy){
    const sp = playerSpeed(p) * tierMul;
    moveEnt(p, vx*sp*dt, vy*sp*dt, 7.5);
  }

  // ---- look
  if (!window.__botActive){
    let want = null, aimed = false;
    // Aiming outranks looking: while an item is raised, the character turns to face where it is
    // about to be thrown, so the light cone shows you what you are shooting at.
    if (p.aimSlot >= 0){
      want = aimAngle(p, hudLayout()); aimed = true;
    } else if (stickR){
      const maxD = hudLayout().right.r;
      let dx = stickR.x-stickR.ox, dy = stickR.y-stickR.oy;
      let d = Math.hypot(dx,dy);
      if (d > maxD){                       // the origin trails the thumb, same as the move stick
        stickR.ox += dx/d*(d-maxD); stickR.oy += dy/d*(d-maxD);
        dx = stickR.x-stickR.ox; dy = stickR.y-stickR.oy; d = maxD;
      }
      if (d > maxD*STICK_DEAD){ want = Math.atan2(dy,dx); aimed = true; }
    }
    // A mouse that has not moved is not looking anywhere — it is just lying there. Honouring a
    // parked cursor is what pinned the facing (and the load in your arms) below the character.
    // A cursor sitting ON the character points nowhere: the vector is a couple of pixels long and
    // its ANGLE is noise, so a hand resting on the mouse span the facing. The camera centres the
    // player now, which puts the middle of the screen exactly where that happens.
    const mw = mouseFresh() && mouseWorldNow();
    if (want === null && mw && Math.hypot(mw.x-p.x, mw.y-p.y) > MOUSE_LOOK_MIN){
      want = Math.atan2(mw.y-p.y, mw.x-p.x); aimed = true;
    }
    p.lookIdle = aimed ? 0 : p.lookIdle + dt;
    // Nothing has aimed the look for a moment and you are walking: face where you are going. The
    // sight cone leads, and whatever you are carrying is carried ahead of you rather than dragged.
    // ...and only on a REAL push. The move vector is normalised, so a thumb sitting a few pixels
    // off its origin still reports a full-length direction whose ANGLE is thumb-noise; facing that
    // would swing the load in your arms for no reason at all.
    if (want === null && moving && push > 0.30 && p.lookIdle > LOOK_IDLE) want = Math.atan2(vy, vx);
    // Doc C2-2: releasing the look stick FREEZES the facing. It never resets and never
    // snaps to the movement direction — that is what lets a thumb leave to tap an item.
    if (want !== null){
      const rate = 7.5 * turnRate(p);
      p.dir += clamp(angDiff(want, p.dir), -rate*dt, rate*dt);
    }
  }

  stepFx(dt);
  for (const l of S.loot) stepLoot(l, dt);
  stepCart(dt);
  if (S.shopMode){
    stepShop(dt);
    if (!S.shopMode) return;                  // the truck took us to the next level mid-step
  } else {
    if (!S.noFoes) stepMonsters(dt);
    stepProjectiles(dt);
    stepExtraction(dt);

    // reaching the car after the last pad ends the level
    if (S.levelDone && Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*2.4){ finishLevel(); return; }
    if (S.shiftLost && Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*2.4){ endLostShift(); return; }
    if (lootJustDestroyed){ lootJustDestroyed = false; checkShiftLost(); }

    markExplored();
  }

  // The player is ALWAYS in the middle of the frame, including at the edges of the map. The camera
  // used to be clamped to the map's bounds, so near the top rows — which is where the truck and the
  // first room are — the character was pushed to about a third of the way down the screen and the
  // whole picture sat high. Past the wall there is nothing to protect: the border is solid wall,
  // drawn near-black, under a vignette. Letting the view run past it costs a strip of darkness and
  // buys a frame that is composed the same way everywhere.
  // In the station the hall is exactly as wide as the frame, so the camera holds it still across and
  // only follows the player down its length.
  const tx = (S.shopMode ? SHOP_CX : p.x) - vwW()/2;
  const ty = p.y - vwH()/2;
  cam.x += (tx-cam.x) * Math.min(1, dt*8);
  cam.y += (ty-cam.y) * Math.min(1, dt*8);
}

function markExplored(){
  const p = S.player, R = Math.max(coneRadius(p), PERIPH_R);
  const rt = Math.ceil(R/TILE)+1;
  const gx0 = (p.x/TILE)|0, gy0 = (p.y/TILE)|0;
  for (let gy=gy0-rt; gy<=gy0+rt; gy++){
    if (gy<0||gy>=MH) continue;
    for (let gx=gx0-rt; gx<=gx0+rt; gx++){
      if (gx<0||gx>=MW) continue;
      const i = gy*MW+gx;
      if (S.explored[i]) continue;
      const px = (gx+0.5)*TILE, py = (gy+0.5)*TILE;
      const d = Math.hypot(px-p.x, py-p.y);
      if (d > R) continue;
      const ang = Math.abs(angDiff(Math.atan2(py-p.y, px-p.x), p.dir));
      if (!((d < coneRadius(p) && ang < coneHalf(p)*1.15) || d < PERIPH_R)) continue;
      if (!losClear(p.x,p.y,px,py)) continue;
      S.explored[i] = 1;
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      if (S.rooms[ri]) S.rooms[ri].seen = true;
    }
  }
}

// ============================================================ render
function draw(){
  const cv = CV(), c = cv.getContext('2d');
  if (FX.shake > 0.05){
    const a = Math.random()*Math.PI*2;
    shakeX = Math.cos(a)*FX.shake; shakeY = Math.sin(a)*FX.shake;
  } else { shakeX = shakeY = 0; }
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.fillRect(0,0,cv.width,cv.height);
  if (!S.grid) return;

  worldTransform(c);
  c.drawImage(S.worldCv, 0, 0);
  drawPads(c); drawButton(c); drawCart(c); drawLoot(c); drawCar(c); drawMonsters(c); drawProjectiles(c); drawPlayer(c);

  buildLight();
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'multiply';
  c.drawImage(lightCv, 0, 0);

  c.globalCompositeOperation = 'lighter';
  worldTransform(c);
  drawMemory(c);

  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  drawVignette(c);
  drawHud(c);
}

function buildLight(){
  const c = lightCv.getContext('2d'), p = S.player;
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  // The station has its lights on. It is the one place in this game that is not a dark house, and
  // making the player hunt for the price of a bandage with a torch would be a joke at their expense.
  if (S.shopMode){
    // Lit, but only inside the four walls. Lighting the whole canvas showed the solid rock the room
    // is carved out of as a grey field twice the size of the shop, which read as a bug.
    c.fillStyle = 'rgb(4,5,7)'; c.fillRect(0,0,lightCv.width,lightCv.height);
    worldTransform(c);
    c.fillStyle = 'rgb(198,194,186)';
    c.fillRect(SHOP_COL*RW*TILE, 0, RW*TILE, (SHOP_ROWS+1)*TILE);
    return;
  }
  c.fillStyle = 'rgb(6,7,9)'; c.fillRect(0,0,lightCv.width,lightCv.height);
  worldTransform(c);
  c.globalCompositeOperation = 'lighter';

  const master = visPoly(p.x, p.y, LOS_R, 80);
  c.save(); pathPoly(c, master); c.clip();

  // small pool at your feet
  let g = c.createRadialGradient(p.x,p.y,2,p.x,p.y,PERIPH_R);
  g.addColorStop(0,'rgba(168,176,180,0.34)');
  g.addColorStop(1,'rgba(90,100,110,0)');
  c.fillStyle = g; c.fillRect(p.x-PERIPH_R,p.y-PERIPH_R,PERIPH_R*2,PERIPH_R*2);

  const cr = coneRadius(p), ch = coneHalf(p);
  cone(c, p, cr*1.06, ch*1.32, 0.20, [232,214,170]);
  cone(c, p, cr,      ch*1.10, 0.34, [244,226,182]);
  cone(c, p, cr*0.94, ch,      0.66, [255,238,198]);

  // pads glow so a player can find the active one
  for (const pad of S.pads){
    if (pad.done) continue;
    const d = Math.hypot(pad.x-p.x, pad.y-p.y);
    if (d > LOS_R) continue;
    const poly = visPoly(pad.x, pad.y, 4.2*TILE, 40);
    c.save(); pathPoly(c, poly); c.clip();
    const gg = c.createRadialGradient(pad.x,pad.y,2,pad.x,pad.y,4.2*TILE);
    const col = pad.active ? '90,190,140' : '110,120,130';
    gg.addColorStop(0, `rgba(${col},0.55)`);
    gg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = gg; c.fillRect(pad.x-4.2*TILE, pad.y-4.2*TILE, 8.4*TILE, 8.4*TILE);
    c.restore();
  }
  c.restore();
}
function cone(c,p,r,half,alpha,rgb){
  const g = c.createRadialGradient(p.x,p.y,TILE*0.4,p.x,p.y,r);
  g.addColorStop(0,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  g.addColorStop(0.5,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha*0.76})`);
  g.addColorStop(1,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  c.fillStyle = g;
  c.beginPath(); c.moveTo(p.x,p.y); c.arc(p.x,p.y,r,p.dir-half,p.dir+half); c.closePath(); c.fill();
}
function drawMemory(c){
  const gx0 = Math.max(0,(cam.x/TILE)|0), gy0 = Math.max(0,(cam.y/TILE)|0);
  const gx1 = Math.min(MW-1,((cam.x+vwW())/TILE)|0), gy1 = Math.min(MH-1,((cam.y+vwH())/TILE)|0);
  for (let gy=gy0; gy<=gy1; gy++) for (let gx=gx0; gx<=gx1; gx++){
    const i = gy*MW+gx;
    if (!S.explored[i]) continue;
    const v = S.grid[i];
    c.fillStyle = v===FLOOR ? 'rgb(6,8,10)' : v===PROP ? 'rgb(12,12,14)' : 'rgb(12,15,19)';
    c.fillRect(gx*TILE, gy*TILE, TILE, TILE);
  }
}
function drawCar(c){
  const off = carDrawOffset();
  if (off.alpha <= 0.001) return;
  const x = S.car.x + off.dx, y = S.car.y + off.dy;
  const a = c.globalAlpha;
  c.globalAlpha = a * off.alpha;

  c.fillStyle = '#2c3540'; c.fillRect(x-TILE*1.5, y-TILE, TILE*3, TILE*2);
  c.fillStyle = '#3f4c5a'; c.fillRect(x-TILE*1.2, y-TILE*0.7, TILE*2.4, TILE*1.4);
  c.fillStyle = '#89a6b8'; c.fillRect(x-TILE*0.5, y-TILE*0.35, TILE, TILE*0.7);

  // The back of the van: a dark opening, and one door swinging off the near edge of it. `door` is
  // 0 shut, 1 wide open, and it is the same number the arrival and the departure read in opposite
  // directions — which is why leaving looks like arriving played backwards.
  const bx = x - TILE*1.5, by = y - TILE, bw = TILE*0.85, bh = TILE*2;
  c.fillStyle = `rgba(6,8,10,${0.35 + off.door*0.6})`;
  c.fillRect(bx, by, bw, bh);
  c.save();
  c.translate(bx, by);
  c.rotate(-off.door*1.15);
  c.fillStyle = '#39434f'; c.fillRect(0, 0, bw*0.55, bh);
  c.strokeStyle = 'rgba(190,205,220,0.4)'; c.lineWidth = 1.2;
  c.strokeRect(0, 0, bw*0.55, bh);
  c.restore();

  c.strokeStyle = 'rgba(200,220,235,0.35)'; c.lineWidth = 1.5;
  c.strokeRect(x-TILE*1.5, y-TILE, TILE*3, TILE*2);
  c.globalAlpha = a;
}
function drawCart(c){
  const cart = S.cart;
  if (!cart) return;
  const r = cart.r;
  c.save(); c.translate(cart.x, cart.y);
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.ellipse(0, r*0.75, r*1.05, r*0.45, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#4a525c'; c.fillRect(-r, -r*0.8, r*2, r*1.6);
  c.strokeStyle = cart.held ? '#d0a253' : '#79838f'; c.lineWidth = 2.4;
  c.strokeRect(-r, -r*0.8, r*2, r*1.6);
  c.fillStyle = '#2b3138';
  c.fillRect(-r*0.85, r*0.62, r*0.5, r*0.34); c.fillRect(r*0.35, r*0.62, r*0.5, r*0.34);
  // the handle bar marks the front — the face you must grab for STRONG mode
  c.rotate(cart.face);
  c.strokeStyle = cart.mode === 'weak' && cart.held ? '#b8544a' : '#e0c07a';
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(r*0.95, -r*0.5); c.lineTo(r*0.95, r*0.5); c.stroke();
  c.restore();
  // the money total, on the front face, exactly like the source game
  c.font = '700 11px ui-monospace, monospace'; c.textAlign = 'center';
  c.fillStyle = cart.items.length ? '#e0c07a' : '#8b939d';
  c.fillText(money(cartValue(cart)) + '  ' + cart.items.length + '/' + CART_SLOTS, cart.x, cart.y - r - 6);
  c.textAlign = 'left';
}
// The till button, painted on the floor beside the checkout. Green while it is counting, because
// the thing it is counting down to is money leaving your wallet.
function drawButton(c){
  if (!S.shopMode || !S.button.r) return;
  const b = S.button, live = S.pay.active;
  c.beginPath();
  c.fillStyle = live ? 'rgba(40,110,80,0.55)' : 'rgba(60,66,74,0.45)';
  c.arc(b.x, b.y, b.r, 0, Math.PI*2); c.fill();
  c.beginPath();
  c.strokeStyle = live ? '#6fd8a4' : S.onButton ? '#d0a253' : '#7d8794';
  c.lineWidth = 3;
  c.arc(b.x, b.y, b.r, 0, Math.PI*2); c.stroke();
  c.font = '700 10px ui-monospace, monospace'; c.textAlign = 'center';
  c.fillStyle = live ? '#d8fff0' : '#c3ccd6';
  c.fillText(live ? 'HỦY' : 'TRẢ TIỀN', b.x, b.y + 3.5);
  c.textAlign = 'left';
}
function drawPads(c){
  for (const pad of S.pads){
    const col = pad.done ? '#3a4a42' : pad.active ? '#4fa87a' : '#5a6570';
    c.strokeStyle = col; c.lineWidth = 2.5;
    c.strokeRect(pad.x-TILE*1.8, pad.y-TILE*1.8, TILE*3.6, TILE*3.6);
    c.fillStyle = pad.done ? 'rgba(40,60,50,0.35)' : pad.active ? 'rgba(50,120,90,0.22)' : 'rgba(60,70,80,0.15)';
    c.fillRect(pad.x-TILE*1.8, pad.y-TILE*1.8, TILE*3.6, TILE*3.6);
    if (!pad.done){
      c.fillStyle = '#dfe6ea'; c.font = '600 13px ui-monospace, monospace'; c.textAlign = 'center';
      c.fillText(pad.shop ? money(pad.value) : money(pad.value) + ' / ' + money(pad.quota),
                 pad.x, pad.y - TILE*2.1);
      c.textAlign = 'left';
    }
  }
}
function drawLoot(c){
  for (const l of S.loot){
    if (l.gone) continue;
    const y = l.held ? l.y : l.y + Math.sin(S.time*2.4 + l.bob)*1.2;
    c.beginPath(); c.fillStyle = 'rgba(0,0,0,0.4)';
    c.ellipse(l.x, y + l.r*0.7, l.r*0.9, l.r*0.42, 0, 0, Math.PI*2); c.fill();
    c.beginPath();
    c.fillStyle = l.good ? (l.good.kind === 'up' ? '#d3a04a' : '#5aa3ab') : l.isBag ? '#c8a33c' : l.mat.col;
    c.arc(l.x, y, l.r, 0, Math.PI*2); c.fill();
    c.lineWidth = 2;
    c.strokeStyle = l.good ? (l.good.kind === 'up' ? '#8a6222' : '#2f6a71') : l.isBag ? '#8a6d1e' : l.mat.edge;
    c.stroke();
    if (l.good){
      // A price with no name on it is a number, not an offer.
      c.font = '600 10px ui-sans-serif, system-ui'; c.textAlign = 'center';
      c.fillStyle = '#dfe6ea';
      c.fillText(l.good.name, l.x, y + l.r + 12);
    }
    for (let i=0;i<l.cracks;i++){
      c.beginPath(); c.strokeStyle = 'rgba(20,20,20,0.6)'; c.lineWidth = 1.2;
      const a = i*2.1 + l.bob;
      c.moveTo(l.x + Math.cos(a)*l.r*0.2, y + Math.sin(a)*l.r*0.2);
      c.lineTo(l.x + Math.cos(a+0.7)*l.r*0.9, y + Math.sin(a+0.7)*l.r*0.9);
      c.stroke();
    }
    // C3-8 step 2: the value must be visible or losing it reads as the game cheating
    c.font = '600 11px ui-monospace, monospace'; c.textAlign = 'center';
    const lost = l.value < l.value0;
    c.fillStyle = lost ? '#d98a7a' : '#e2e8ec';
    c.fillText(money(l.value), l.x, y - l.r - 5);
    c.textAlign = 'left';
  }
}
function drawMonsters(c){
  for (const m of S.monsters){
    const d = MONSTERS[m.type], s = Math.sin(m.wob)*1.5;
    c.save(); c.translate(m.x, m.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0,9,10,4.5,0,0,Math.PI*2); c.fill();
    c.fillStyle = d.col;
    c.beginPath();
    c.moveTo(-9,10); c.lineTo(-7,-9+s); c.lineTo(0,-14); c.lineTo(7,-9-s); c.lineTo(9,10);
    c.closePath(); c.fill();
    if (m.sleep > 0){
      c.strokeStyle = 'rgba(150,190,220,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-4,-9); c.lineTo(-1.6,-9); c.moveTo(1.6,-9); c.lineTo(4,-9); c.stroke();
      c.font = '600 10px ui-monospace, monospace'; c.fillStyle = 'rgba(160,200,230,0.9)';
      c.fillText('z', 6, -14);
    } else {
      c.fillStyle = m.state === 'chase' ? d.eye : 'rgba(120,100,90,0.8)';
      c.fillRect(-4,-9,2.4,2.4); c.fillRect(1.6,-9,2.4,2.4);
    }
    c.restore();
  }
}
function drawProjectiles(c){
  c.fillStyle = '#ffe9a8';
  for (const b of S.bullets){ c.beginPath(); c.arc(b.x,b.y,2.6,0,Math.PI*2); c.fill(); }
  for (const b of S.bombs){
    if (b.done){
      const t = clamp((b.t-b.fuse)/0.6,0,1);
      c.beginPath(); c.fillStyle = `rgba(255,${180-t*120|0},80,${0.55*(1-t)})`;
      c.arc(b.x,b.y,b.r*(0.4+t*0.9),0,Math.PI*2); c.fill();
    } else {
      c.beginPath(); c.fillStyle = (Math.floor(b.t*8)%2) ? '#e05a3a' : '#3a2a26';
      c.arc(b.x,b.y,5,0,Math.PI*2); c.fill();
    }
  }
}
function drawPlayer(c){
  const p = S.player;
  const at = playerDrawPos();
  if (!at) return;                       // inside the van
  const a0 = c.globalAlpha;
  c.globalAlpha = a0 * at.alpha;
  c.save(); c.translate(at.x, at.y);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.ellipse(0,8,10,4.5,0,0,Math.PI*2); c.fill();
  c.rotate(p.dir);
  c.fillStyle = '#cfcbb9'; c.beginPath(); c.arc(0,0,7,0,Math.PI*2); c.fill();
  c.strokeStyle = 'rgba(18,20,18,0.85)'; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#8d8873'; c.beginPath(); c.arc(3.6,0,3.3,0,Math.PI*2); c.fill();
  c.fillStyle = '#ffe6a8'; c.fillRect(6,-1.5,5,3);
  c.restore();
  c.globalAlpha = a0;
}
function drawVignette(c){
  const w = c.canvas.width, h = c.canvas.height;
  const R = Math.max(w,h);

  // The dread layer. It does two things a static vignette cannot: it CLOSES IN as something gets
  // near — the lit hole in the middle shrinks — and it BREATHES, once per heartbeat, in time with
  // the sound. Neither is information the player did not have; both are information they were
  // reading off a monster's eye colour two rooms away instead of feeling.
  const dread = FX.dread, beat = FX.beatPulse;
  const inner = Math.min(w,h) * (0.22 - dread*0.11 - beat*dread*0.035);
  const g = c.createRadialGradient(w/2,h/2,Math.max(4,inner),w/2,h/2,R*0.86);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(0.6,`rgba(0,0,0,${0.13 + dread*0.16})`);
  g.addColorStop(1,`rgba(${dread > 0.02 ? '26,4,4' : '0,0,0'},${0.5 + dread*0.34})`);
  c.fillStyle = g; c.fillRect(0,0,w,h);

  if (dread > 0.05 && beat > 0){
    const bg = c.createRadialGradient(w/2,h/2,R*0.30,w/2,h/2,R*0.78);
    bg.addColorStop(0,'rgba(120,10,10,0)');
    bg.addColorStop(1,`rgba(130,14,12,${beat*dread*0.30})`);
    c.fillStyle = bg; c.fillRect(0,0,w,h);
  }

  // Pain, and the side it came from. A wedge on the edge you were hit from is the difference
  // between "I am hurt" and "it is behind me".
  if (S.player && (S.player.hurt > 0 || FX.hurtT > 0)){
    const k = Math.max(S.player.hurt/0.45, FX.hurtT);
    const hg = c.createRadialGradient(w/2,h/2,R*0.2,w/2,h/2,R*0.72);
    hg.addColorStop(0,'rgba(150,26,20,0)');
    hg.addColorStop(1,`rgba(160,28,20,${k*0.6})`);
    c.fillStyle = hg; c.fillRect(0,0,w,h);

    const a = FX.hurtDir - S.player.dir;      // where it came from, relative to where you face
    const ex = w/2 + Math.cos(a)*w*0.62, ey = h/2 + Math.sin(a)*h*0.62;
    const wg = c.createRadialGradient(ex,ey,0,ex,ey,Math.min(w,h)*0.72);
    wg.addColorStop(0,`rgba(190,30,24,${FX.hurtT*0.55})`);
    wg.addColorStop(1,'rgba(190,30,24,0)');
    c.fillStyle = wg; c.fillRect(0,0,w,h);

    // And a hard red RIM around the whole frame. The radial wash above says which side it came
    // from; this says, unmissably, that it happened at all — a centred gradient on a portrait
    // frame is easy to read as atmosphere rather than as damage.
    const band = Math.min(w,h)*0.16, aRim = Math.min(0.85, FX.hurtT*0.9);
    const edge = (x0,y0,x1,y1,rx,ry,rw,rh) => {
      const g2 = c.createLinearGradient(x0,y0,x1,y1);
      g2.addColorStop(0,`rgba(176,26,20,${aRim})`);
      g2.addColorStop(1,'rgba(176,26,20,0)');
      c.fillStyle = g2; c.fillRect(rx,ry,rw,rh);
    };
    edge(0,0,0,band, 0,0,w,band);              // top
    edge(0,h,0,h-band, 0,h-band,w,band);       // bottom
    edge(0,0,band,0, 0,0,band,h);              // left
    edge(w,0,w-band,0, w-band,0,band,h);       // right
  }

  // The extraction glow: the frame itself goes green while the money is being counted, so the
  // countdown is legible from anywhere on screen and not only where the number is.
  if (S.countdownActive){
    const k = 0.20 + FX.tickPulse*0.30;
    const eg = c.createRadialGradient(w/2,h/2,Math.min(w,h)*0.34,w/2,h/2,R*0.80);
    eg.addColorStop(0,'rgba(70,200,140,0)');
    eg.addColorStop(1,`rgba(70,210,145,${k*0.55})`);
    c.fillStyle = eg; c.fillRect(0,0,w,h);
  }

  if (FX.flash > 0.002){
    c.fillStyle = `rgba(${FX.flashCol},${Math.min(0.6, FX.flash)})`;
    c.fillRect(0,0,w,h);
  }
}

// ---------- HUD (canvas, so the layout is exact on every device)
function drawHud(c){
  const p = S.player, hud = hudLayout(), k = dpr;
  c.save(); c.scale(k,k);
  // Nothing to steer during a cutscene, so nothing that steers is drawn.
  if (S.cut){ drawCutscene(c, hud); c.restore(); return; }

  // health + stamina, top-left. The heart is NOT here any more — see the controls, below.
  const bx = 14, by = 14, bw = Math.min(168, hud.w*0.42), bh = 9;
  c.fillStyle = 'rgba(10,12,14,0.72)'; c.fillRect(bx-3,by-3,bw+6,bh*2+9);
  c.fillStyle = '#3a1f1c'; c.fillRect(bx,by,bw,bh);
  c.fillStyle = '#b8433a'; c.fillRect(bx,by,bw*clamp(p.hp/p.hpMax,0,1),bh);
  c.fillStyle = '#1c2a2c'; c.fillRect(bx,by+bh+4,bw,bh-3);
  c.fillStyle = '#4c8f96'; c.fillRect(bx,by+bh+4,bw*clamp(p.stam/p.stamMax,0,1),bh-3);

  drawMinimap(c, hud);

  drawPops(c);
  if (S.countdownActive) drawCountdown(c, hud);
  if (S.messageT > 0){
    // Above the thumb sticks, not under them: the sticks own the bottom band of a portrait frame.
    c.font = '600 14px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = `rgba(226,232,236,${Math.min(1,S.messageT)})`;
    c.fillText(S.message, hud.w/2,
               Math.min(hud.stash.y - hud.stash.r, hud.heart.y - hud.heart.r) - 14);
    c.textAlign = 'left';
  }

  // sticks. The left one is drawn AT THE THUMB, not in the corner: it floats and its origin trails,
  // so a ring painted anywhere else is a ring that lies about which way "up" is.
  const lo = stickL ? { x:stickL.ox, y:stickL.oy } : hud.left;
  ring(c, lo.x, lo.y, hud.left.r, stickL ? 'rgba(210,140,50,0.7)' : 'rgba(210,140,50,0.3)');
  const lk = stickL ? { x:clamp(stickL.x-stickL.ox,-hud.left.r,hud.left.r), y:clamp(stickL.y-stickL.oy,-hud.left.r,hud.left.r) } : {x:0,y:0};
  dot(c, lo.x+lk.x, lo.y+lk.y, hud.left.r*0.3, stickL ? 'rgba(230,160,60,0.9)' : 'rgba(210,140,50,0.45)');
  // Drawn at the thumb for the same reason as the left one: a ring painted anywhere else is a ring
  // that lies about where the middle is. At rest it sits in its corner and its knob shows the way
  // the character is currently facing.
  const ro = stickR ? { x:stickR.ox, y:stickR.oy } : hud.right;
  ring(c, ro.x, ro.y, hud.right.r, stickR ? 'rgba(210,140,50,0.7)' : 'rgba(210,140,50,0.3)');
  const rk = stickR ? { x:clamp(stickR.x-stickR.ox,-hud.right.r,hud.right.r), y:clamp(stickR.y-stickR.oy,-hud.right.r,hud.right.r) }
                    : { x:Math.cos(p.dir)*hud.right.r*0.55, y:Math.sin(p.dir)*hud.right.r*0.55 };
  dot(c, ro.x+rk.x, ro.y+rk.y, hud.right.r*0.3, stickR ? 'rgba(230,160,60,0.9)' : 'rgba(210,140,50,0.45)');

  // item slots
  for (let i=0;i<3;i++){
    const s = hud.slots[i], it = p.inv[i];
    const usable = it && it.uses > 0;
    // A filled disc behind it: a ring alone over a dark room is hard to find with a thumb, and
    // these are the only three buttons that ever hold something worth finding in a hurry.
    c.beginPath();
    c.fillStyle = usable ? 'rgba(38,16,15,0.72)' : 'rgba(16,18,20,0.55)';
    c.arc(s.x, s.y, s.r, 0, Math.PI*2); c.fill();
    ring(c, s.x, s.y, s.r, usable ? 'rgba(200,70,60,0.85)' : 'rgba(90,70,68,0.5)');
    c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = usable ? '#e6ebee' : '#6a6f74';
    const label = it ? (GEAR_BY_KEY[it.kind] ? GEAR_BY_KEY[it.kind].short : it.kind) : '—';
    c.fillText(label, s.x, s.y - 1);
    if (it){
      c.font = '600 9.5px ui-monospace, monospace';
      c.fillText('x'+it.uses, s.x, s.y + s.r*0.62);
    }
    c.textAlign = 'left';
  }
  if (p.aimSlot >= 0) drawAim(c, hud, p);

  // The heart. Big, low, and in the middle: it is the DISTANCE read-out and its rate is the whole
  // message, so it is worth more room than a status icon.
  drawHeart(c, hud.heart.x, hud.heart.y, hud.heart.r);

  // grab button, left side
  const near = nearestLoot(p);
  const grabLit = near || p.held || p.pushing || nearCart(p);
  c.beginPath();
  c.fillStyle = grabLit ? 'rgba(14,34,24,0.72)' : 'rgba(16,18,20,0.55)';
  c.arc(hud.grab.x, hud.grab.y, hud.grab.r, 0, Math.PI*2); c.fill();
  ring(c, hud.grab.x, hud.grab.y, hud.grab.r, grabLit ? 'rgba(80,190,120,0.9)' : 'rgba(70,90,78,0.45)');
  c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
  c.fillStyle = grabLit ? '#e6ebee' : '#6a6f74';
  const grabLabel = p.pushing ? 'Buông' : p.held ? 'Thả' : nearCart(p) && !near ? 'Đẩy xe' : 'Nhặt';
  c.fillText(grabLabel, hud.grab.x, hud.grab.y+4);

  // locker button — only while you are standing at the truck
  if (nearTruck(p)){
    c.beginPath();
    c.fillStyle = 'rgba(14,24,38,0.72)';
    c.arc(hud.stash.x, hud.stash.y, hud.stash.r, 0, Math.PI*2); c.fill();
    ring(c, hud.stash.x, hud.stash.y, hud.stash.r, 'rgba(120,160,215,0.9)');
    c.fillStyle = '#dbe6f2';
    c.fillText('Tủ đồ', hud.stash.x, hud.stash.y+4);
  }
  c.textAlign = 'left';

  // what is currently running on you, in one line — a buff you cannot see is a buff you
  // cannot plan around, and both of these are bought with real money
  const badges = [];
  if (p.floatT > 0)  badges.push('Nhẹ ' + p.floatT.toFixed(0) + 's');
  if (p.shieldT > 0) badges.push('Bọc ' + p.shieldT.toFixed(0) + 's');
  if (p.rushing) badges.push('Nước rút');
  if (badges.length){
    c.font = '600 11px ui-monospace, monospace';
    c.fillStyle = '#8fd0b4';
    c.fillText(badges.join('   '), 14, 52);
  }

  c.restore();
}
// A raised item, drawn the way a mobile MOBA draws a raised skill: a stick under the thumb that
// says which way, a line out of the CHARACTER that says where it lands, and one target in the far
// corner that says how to put it down again.
function drawAim(c, hud, p){
  const s = hud.slots[p.aimSlot];
  const R = hud.aimR;
  let dx = p.aimX - s.x, dy = p.aimY - s.y;
  const d = Math.hypot(dx,dy) || 1;
  const live = d > R*STICK_DEAD;
  const k = Math.min(1, R/d);
  const cancelling = overCancel(hud, { x:p.aimX, y:p.aimY });

  // the throw line, out of the character rather than out of the button
  if (live && !cancelling){
    const a = Math.atan2(dy,dx);
    const px = scrX(p.x), py = scrY(p.y);
    const reach = Math.max(hud.w, hud.h);
    const g = c.createLinearGradient(px, py, px+Math.cos(a)*reach, py+Math.sin(a)*reach);
    g.addColorStop(0, 'rgba(255,214,150,0.55)');
    g.addColorStop(1, 'rgba(255,214,150,0)');
    c.strokeStyle = g; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px,py); c.lineTo(px+Math.cos(a)*reach, py+Math.sin(a)*reach); c.stroke();
    ring(c, px+Math.cos(a)*R*2.2, py+Math.sin(a)*R*2.2, 7, 'rgba(255,214,150,0.75)');
  }

  // the stick itself, centred on the slot that raised it
  ring(c, s.x, s.y, R, cancelling ? 'rgba(190,80,70,0.75)' : 'rgba(255,214,150,0.6)');
  dot(c, s.x + dx*k, s.y + dy*k, R*0.26, cancelling ? 'rgba(200,90,78,0.9)' : 'rgba(255,214,150,0.9)');

  // the way out
  const cn = hud.cancel;
  c.fillStyle = cancelling ? 'rgba(150,42,34,0.85)' : 'rgba(20,14,14,0.7)';
  c.beginPath(); c.arc(cn.x, cn.y, cn.r, 0, Math.PI*2); c.fill();
  ring(c, cn.x, cn.y, cn.r, cancelling ? 'rgba(255,150,140,0.95)' : 'rgba(190,110,100,0.7)');
  c.strokeStyle = cancelling ? '#ffe2de' : '#c8918a'; c.lineWidth = 2.6;
  const q = cn.r*0.42;
  c.beginPath();
  c.moveTo(cn.x-q, cn.y-q); c.lineTo(cn.x+q, cn.y+q);
  c.moveTo(cn.x+q, cn.y-q); c.lineTo(cn.x-q, cn.y+q);
  c.stroke();
}
// Money leaving an object, drawn where the object is. The old build changed a number on the item
// and printed one line of text at the bottom of the screen; neither is something a player looking
// at the thing they just dropped will see.
function drawPops(c){
  for (const q of FX.pops){
    const k = q.t / q.life;
    const a = k < 0.12 ? k/0.12 : 1 - Math.pow((k-0.12)/0.88, 2);
    c.font = `700 ${q.size}px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.fillStyle = `rgba(10,8,8,${a*0.55})`;
    c.fillText(q.text, scrX(q.x)+1, scrY(q.y)+1);
    c.fillStyle = `rgba(${q.col},${a})`;
    c.fillText(q.text, scrX(q.x), scrY(q.y));
    c.textAlign = 'left';
  }
}

// The countdown used to be one line of green text at the top of the screen, which is exactly where
// nobody looks while a monster is walking toward the pad they are standing on. This is a ring that
// empties, a number that punches on every second, and the frame going green around all of it.
function drawCountdown(c, hud){
  const r = Math.min(hud.w, hud.h) * 0.135;
  const cx = hud.w/2, cy = hud.h * 0.24;
  const k = clamp(S.countdown / EXTRACT_COUNTDOWN, 0, 1);
  const pop = FX.tickPulse;

  c.save();
  c.translate(cx, cy);
  c.scale(1 + pop*0.12, 1 + pop*0.12);

  c.beginPath(); c.fillStyle = `rgba(6,20,14,${0.55 + pop*0.2})`;
  c.arc(0, 0, r*1.02, 0, Math.PI*2); c.fill();

  c.beginPath(); c.strokeStyle = 'rgba(70,120,95,0.45)'; c.lineWidth = r*0.15;
  c.arc(0, 0, r, 0, Math.PI*2); c.stroke();

  // the arc drains clockwise from the top, so "nearly gone" is a shape and not a decimal
  c.beginPath();
  c.strokeStyle = `rgba(${pop > 0.5 ? '190,255,215' : '110,225,160'},0.95)`;
  c.lineWidth = r*0.15; c.lineCap = 'round';
  c.arc(0, 0, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*k);
  c.stroke();
  c.lineCap = 'butt';

  c.textAlign = 'center';
  c.font = `700 ${Math.round(r*0.92)}px ui-monospace, monospace`;
  c.fillStyle = '#e6fff1';
  c.fillText(String(Math.ceil(S.countdown)), 0, r*0.33);
  c.font = `600 ${Math.round(r*0.26)}px ui-sans-serif, system-ui`;
  c.fillStyle = 'rgba(150,220,185,0.9)';
  c.fillText('GIAO HÀNG', 0, -r*0.42);
  c.textAlign = 'left';
  c.restore();
}
// A heart that beats faster the closer the thing is. It is the one piece of HUD that answers a
// question the sight cone cannot: something is near, and it is THIS near. The rate carries that on
// its own, so nothing here prints a number.
function drawHeart(c, cx, cy, r){
  const k = FX.beatPulse;
  const danger = Math.max(FX.dread, FX.hurtT*0.8);
  const s = r * (1 + k*0.22);
  // calm slate-red -> alarmed blood-red, with the beat itself brightening it
  const lo = [96, 52, 56], hi = [214, 44, 38];
  const t = clamp(danger + k*0.22, 0, 1);
  const col = lo.map((v,i) => Math.round(mix(v, hi[i], t)));

  c.save();
  c.translate(cx, cy);
  // A soft aura, so a fast beat is visible out of the corner of the eye — and a ring that expands
  // and fades on each beat, which is what carries the RATE at a glance.
  const aura = 0.22 + 0.32*danger;
  const g = c.createRadialGradient(0,0,r*0.35,0,0,r*2.0);
  g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${aura*(0.45 + 0.55*k)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(-r*2,-r*2,r*4,r*4);
  if (k > 0.02){
    c.beginPath();
    c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.55*k})`;
    c.lineWidth = Math.max(1.5, r*0.10*k);
    c.arc(0, 0, r*(1.15 + (1-k)*0.75), 0, Math.PI*2);
    c.stroke();
  }
  c.scale(s/r, s/r);
  c.beginPath();
  // two lobes and a point — drawn rather than typed, so it scales cleanly at any dpr
  c.moveTo(0, r*0.92);
  c.bezierCurveTo(-r*1.15, r*0.10, -r*0.62, -r*0.92, 0, -r*0.28);
  c.bezierCurveTo(r*0.62, -r*0.92, r*1.15, r*0.10, 0, r*0.92);
  c.closePath();
  c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
  c.fill();
  c.lineWidth = 1.6;
  c.strokeStyle = `rgba(10,8,10,0.75)`;
  c.stroke();
  c.restore();
}
function nearCart(p){
  return S.cart && Math.hypot(S.cart.x-p.x, S.cart.y-p.y) < S.cart.r + grabRange(p);
}
function ring(c,x,y,r,col){ c.beginPath(); c.strokeStyle = col; c.lineWidth = 2.5; c.arc(x,y,r,0,Math.PI*2); c.stroke(); }
function dot(c,x,y,r,col){ c.beginPath(); c.fillStyle = col; c.arc(x,y,r,0,Math.PI*2); c.fill(); }
// The ONE answer to "what would I pick up right now": the grab button's label reads it, and the
// grab itself takes it. They used to be two loops with two different filters — the label lit up
// for loot riding on your own cart, and neither of them asked whether a wall was in the way.
// SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
function nearestLoot(p){
  let best = null, bd = grabRange(p);
  for (const l of S.loot){
    // On a SHOP checkout you may take something back off — that is changing your mind, and it is
    // the whole point of a shop. On a house's extraction pad you may not, because that would be
    // un-banking a haul the level has already paid you for.
    if (l.gone || l.held || l.inCart) continue;
    if (l.onPad && !S.shopMode) continue;
    const d = Math.hypot(l.x-p.x, l.y-p.y);
    // Sight is required only BEYOND arm's length. A wall is 24 px thick, so anything on its far
    // side is at least ~38 px from the player's centre; inside one tile you are in the same room as
    // the thing you are grabbing. Demanding sight at every distance broke normal play instead of
    // the exploit: loot resting against a wall stopped being pickable from some angles, and the bot
    // spent a whole 130 s level stuck in the "picking up" state.
    if (d < bd && (d <= TILE * 1.1 || losClear(p.x, p.y, l.x, l.y))){ bd = d; best = l; }
  }
  return best;
}
function drawMinimap(c, hud){
  const big = S.bigMap;
  const w = big ? Math.min(hud.w*0.6, 460) : Math.min(hud.w*0.34, 210);
  const h = w * (MH/MW);
  const x = big ? (hud.w-w)/2 : hud.w - w - 14, y = big ? (hud.h-h)/2 : 14;

  // Rather than move it — every corner is somebody's corner — it gets out of the way: while
  // something that can hurt you is drawn behind it, it drops to a ghost and back.
  // The fade is eased rather than switched, because a panel that blinks reads as a glitch.
  const pl = S.player;
  const m = TILE*1.4*zoom();            // a tile and a bit of margin around the panel
  const behind = (wx, wy) => {
    const sx0 = scrX(wx), sy0 = scrY(wy);
    return sx0 > x-3-m && sx0 < x+w+3+m && sy0 > y-3-m && sy0 < y+h+3+m;
  };
  let want = 0;
  if (!big && pl){
    if (pl.aimSlot >= 0) want = 1;                       // the cancel target shares this corner
    else if (behind(pl.x, pl.y)) want = 1;               // only reachable when the camera is pinned
    else for (const mo of S.monsters){ if (mo.sleep <= 0 && behind(mo.x, mo.y)){ want = 1; break; } }
  }
  S.mapFade = mix(S.mapFade || 0, want, 0.12);
  const alpha0 = c.globalAlpha;
  c.globalAlpha = alpha0 * (big ? 1 : mix(MINIMAP_IDLE_ALPHA, MINIMAP_FADED_ALPHA, S.mapFade));

  c.fillStyle = 'rgba(8,10,13,0.82)'; c.fillRect(x-3,y-3,w+6,h+6);
  c.strokeStyle = 'rgba(90,120,170,0.7)'; c.lineWidth = 1.5; c.strokeRect(x-3,y-3,w+6,h+6);
  const sx = w/MW, sy = h/MH;
  // blit the real tile layout of every room already entered, walls and all
  if (S.mapCv){
    const smooth = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    for (let ri=0; ri<S.rooms.length; ri++){
      const r = S.rooms[ri];
      if (!r.seen) continue;
      c.drawImage(S.mapCv, r.cx*RW, r.cy*RH, RW, RH,
                  x + r.cx*RW*sx, y + r.cy*RH*sy, RW*sx, RH*sy);
    }
    c.imageSmoothingEnabled = smooth;
  }
  // doc: minimap shows found loot, the active pad, and the way back to the car
  for (const l of S.loot){
    if (l.gone || l.onPad) continue;
    const gi = (((l.y/TILE)|0)*MW + ((l.x/TILE)|0));
    if (!S.explored[gi]) continue;
    c.fillStyle = l.isBag ? '#e0b64a' : '#cfd8dc';
    c.fillRect(x + l.x/TILE*sx - 1.2, y + l.y/TILE*sy - 1.2, 2.4, 2.4);
  }
  // The Extraction Tracker is a bought tool in the source game ("tells you where to escape").
  // What it sells here is DISCOVERY: the pads you have not opened yet. The way to the pad you
  // are already working on is not for sale — see MINIMAP_ROUTE_ALWAYS, which puts it back behind
  // the purchase if that is wanted.
  const tracked = hasGear(S.player, 'tracker');
  for (const pad of S.pads){
    if (!tracked && !pad.active && !pad.done && !(S.rooms[pad.ri] && S.rooms[pad.ri].seen)) continue;
    c.fillStyle = pad.done ? '#3d5a4c' : pad.active ? '#5ecf95' : '#6a747f';
    c.fillRect(x + pad.x/TILE*sx - 3, y + pad.y/TILE*sy - 3, 6, 6);
  }
  if (S.cart){
    c.fillStyle = '#d0a253';
    c.fillRect(x + S.cart.x/TILE*sx - 2.5, y + S.cart.y/TILE*sy - 2.5, 5, 5);
  }
  c.fillStyle = '#7fb6e0';
  c.fillRect(x + S.car.x/TILE*sx - 3.5, y + S.car.y/TILE*sy - 3.5, 7, 7);
  // The real path, walked tile by tile around the walls — never a straight line through them.
  // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
  if (MINIMAP_ROUTE_ALWAYS || tracked || S.levelDone){
    // The route is drawn only as far as the player has actually been. Everything else on this map
    // already obeys that — rooms blit on `seen`, loot dots on `explored` — and a line that carries
    // on into rooms nobody has opened maps the house for you from the first frame of the level, in
    // a game whose whole tension is not knowing what the next door opens onto.
    // WHY it is cut rather than hidden: the part you have walked is still the useful part, and it
    // is the part you are entitled to.
    // ROOT-CAUSE: the route was drawn from simulation truth, while every other marker beside it is
    // drawn from player knowledge.
    // SEE: docs/patches/phase-5.4-patch-25-repo2d-playtest-fixes.md
    const route = visibleRoute();
    if (route.length > 1){
      const dash = c.getLineDash ? c.getLineDash() : null;
      c.setLineDash([3,3]);
      c.strokeStyle = 'rgba(120,220,170,0.75)'; c.lineWidth = 1.4;
      c.beginPath();
      for (let i=0;i<route.length;i++){
        const px = x + route[i].x/TILE*sx, py = y + route[i].y/TILE*sy;
        if (i === 0) c.moveTo(px,py); else c.lineTo(px,py);
      }
      c.stroke();
      c.setLineDash(dash || []);
    }
  }
  c.fillStyle = '#ffd98a';
  c.fillRect(x + S.player.x/TILE*sx - 2, y + S.player.y/TILE*sy - 2, 4, 4);
  c.globalAlpha = alpha0;
}

// ============================================================ DOM ui
function el(id){ return document.getElementById(id); }
function showVeil(title, body, btnText, onClick, extraHtml){
  el('veilTitle').textContent = title;
  el('veilBody').textContent = body;
  el('veilExtra').innerHTML = extraHtml || '';
  el('veilKeys').style.display = extraHtml ? 'none' : '';
  // "let the bot play" belongs to the title screen. On the shop or the locker it would hand
  // the run to the agent while a panel is still open, and the panel's state goes stale.
  const b2 = el('veilBtn2');
  if (b2) b2.hidden = !!extraHtml;
  const b = el('veilBtn');
  b.textContent = btnText;
  b.onclick = onClick;
  el('veil').hidden = false;
}
function hideVeil(){ el('veil').hidden = true; }

// What the station has in stock tonight, rolled fresh every visit, in two separate sets. Where it
// is LAID OUT is buildShop's job; this only decides what is on the floor.
//   Upgrades — permanent, buyer-only, price climbs per purchase. Each one may be ROLLED at
//              most UPGRADE_MAX_SPAWNS times in a run; after that it is gone for good, so a
//              skipped offer is a real decision and not a thing you can wait out.
//   Gear     — goes to the truck's locker, not to your hands, and survives every later level.
//              Each has a per-run stock; once bought that many times it stops appearing.
function rollShop(){
  const rnd = mulberry32((S.seed ^ (S.level*2654435761)) >>> 0);
  const pick = (pool, n) => {
    const p = pool.slice();
    for (let i=p.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [p[i],p[j]]=[p[j],p[i]]; }
    return p.slice(0, n);
  };
  const upPool = UPGRADES.filter(u => (S.upgSpawned[u.key]||0) < UPGRADE_MAX_SPAWNS);
  const gePool = GEAR.filter(g => (S.gearBought[g.key]||0) < g.stock);
  const upgrades = pick(upPool, SHOP_UPGRADE_SLOTS);
  // rolling it IS spawning it — this is the counter that retires an upgrade
  for (const u of upgrades) S.upgSpawned[u.key] = (S.upgSpawned[u.key]||0) + 1;
  return { upgrades, gear: pick(gePool, SHOP_GEAR_SLOTS) };
}
function upgradePrice(u){ return Math.round(u.base * Math.pow(1.6, S.upg[u.key])); }

function applyUpgrades(){
  const p = S.player;
  if (!p) return;
  p.hpMax = 100 + S.upg.hp*20;   p.hp = p.hpMax;          // "+20 máu tối đa, và hồi đầy ngay"
  p.stamMax = STAM_MAX + S.upg.stam*10; p.stam = p.stamMax;
  p.str = 30 + S.upg.str*10;
}

// ---------- the truck locker
// Doc/user requirement: gear bought at the station lands in a shared locker on the truck,
// and the start room needs a button to open it. Nothing is carried automatically — you walk
// to the truck and choose what goes in your three slots, and whatever you leave behind is
// still there next level.
function toggleStash(){
  if (S.stashOpen){ closeStash(); return; }
  if (!S.player || S.dead || !S.running) return;   // never over the shop or the intro veil
  if (!nearTruck(S.player)){ toast('Phải đứng cạnh xe mới mở được tủ đồ'); return; }
  S.stashOpen = true;
  S.running = false;
  showStash();
}
function closeStash(){
  S.stashOpen = false;
  hideVeil();
  if (!S.dead) S.running = true;
}
function showStash(){
  const p = S.player;
  const slotRows = [0,1,2].map(i => {
    const it = p.inv[i];
    const def = it ? GEAR_BY_KEY[it.kind] : null;
    return `<button class="up" data-slot="${i}" ${it?'':'disabled'}>
      <span class="t">Ô ${i+1} — ${def ? def.name : 'trống'}</span>
      <span class="d">${def ? def.desc : 'Chọn một món bên dưới để đưa vào ô này.'}</span>
      <span class="p">${it ? 'x'+it.uses+' · bấm để trả lại tủ' : '—'}</span>
    </button>`;
  }).join('');
  const stashRows = S.stash.map((it,i) => {
    const def = GEAR_BY_KEY[it.kind];
    return `<button class="gear" data-stash="${i}">
      <span class="t">${def.name}</span>
      <span class="d">${def.desc}</span>
      <span class="p">x${it.uses} · bấm để cầm lên</span>
    </button>`;
  }).join('') || `<div class="empty">Tủ trống. Đồ mua ở trạm dịch vụ sẽ nằm ở đây.</div>`;

  showVeil('Tủ đồ trên xe',
    'Ba ô trên tay bắt đầu ca nào cũng rỗng. Lấy đồ ra khỏi tủ trước khi vào nhà; thứ để lại vẫn còn nguyên cho ca sau.',
    'Đóng tủ', closeStash,
    `<div class="wallet">Ví: ${money(S.wallet)}</div>
     <div class="seg">Ba ô trên tay</div><div class="shop">${slotRows}</div>
     <div class="seg">Trong tủ (${S.stash.length})</div><div class="shop">${stashRows}</div>`);

  el('veilExtra').querySelectorAll('[data-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.slot;
      if (!p.inv[i]) return;
      S.stash.push(p.inv[i]); p.inv[i] = null;
      showStash();
    });
  });
  el('veilExtra').querySelectorAll('[data-stash]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.stash;
      const free = p.inv.indexOf(null);
      if (free < 0){ toast('Ba ô đã đầy'); return; }
      p.inv[free] = S.stash.splice(i,1)[0];
      showStash();
    });
  });
}

function updateBar(){
  el('hLevel').textContent = S.shopMode ? 'Trạm' : S.level;
  const pad = S.pads[S.padIndex];
  const q = el('hQuota');
  if (S.shopMode){
    q.textContent = pad ? 'trên bệ ' + money(pad.value) : '—';
    q.classList.toggle('met', !!pad && pad.value > 0 && pad.value <= S.wallet);
  }
  else if (S.levelDone){ q.textContent = 'xong — về xe'; q.classList.add('met'); }
  else if (pad){ q.textContent = money(pad.value) + ' / ' + money(pad.quota); q.classList.toggle('met', pad.value >= pad.quota); }
  el('hWallet').textContent = money(S.wallet);
  const p = S.player;
  el('hCarry').textContent =
    p && p.pushing && S.cart ? ('xe đẩy · ' + S.cart.items.length + '/' + CART_SLOTS + ' · ' + money(cartValue(S.cart)))
    : p && p.held ? (p.held.size + ' · ' + money(p.held.value))
    : '—';
  el('hPads').textContent = S.pads.filter(p=>p.done).length + '/' + S.pads.length;
  el('hSeed').textContent = String(S.seed).padStart(6,'0');
}

// ============================================================ loop
const FIXED = 1/60;
let acc = 0, last = 0, timeScale = 1;
function frame(now){
  const dt = Math.min(0.25, (now-last)/1000); last = now;
  const cv = CV();
  const rr = cv.getBoundingClientRect();
  if (cv.width !== Math.round(rr.width*dpr) || cv.height !== Math.round(rr.height*dpr)) resize();
  stepCut(dt);                     // real time: a cutscene is not part of the simulation
  if (S.running && !S.dead && !S.cut){
    // Hitstop: the world stalls for a fraction of a second on a heavy impact, which is what makes
    // the impact land. It is counted down in REAL time so it lasts the same however slow the world
    // has been made, and it never stops the clock outright — a frozen game reads as a hang.
    let ts = timeScale;
    if (FX.hitstop > 0){ FX.hitstop = Math.max(0, FX.hitstop - dt); ts *= 0.14; }
    acc += dt * ts;
    let steps = 0;
    while (acc >= FIXED && steps < 240){ step(FIXED); acc -= FIXED; steps++; if (!S.running || S.cut) break; }
  }
  draw();
  updateBar();
  requestAnimationFrame(frame);
}

// ============================================================ boot
window.__boot = function(){
  setupInput();
  resize();
  addEventListener('resize', resize);
  // The frame's height changes when the page chrome wraps, and that fires no window resize event.
  if (window.ResizeObserver){
    const box = CV().parentElement;
    if (box) new ResizeObserver(() => resize()).observe(box);
  }
  buildLevel((Math.random()*999999)|0);
  S.running = false;

  el('veilBtn').onclick = () => {
    SFX.wake(); S.running = true; hideVeil();
    startCut('arrive', 'Màn ' + S.level, 'Chỉ tiêu ' + money(S.quotaTotal));
  };
  el('sndBtn').onclick = () => {
    const on = !SFX.on;
    SFX.setOn(on); SFX.wake();
    el('sndBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    el('sndBtn').textContent = on ? 'Âm thanh' : 'Tắt tiếng';
  };
  el('veilBtn2').hidden = false;
  el('veilBtn2').onclick = () => { S.running = true; hideVeil(); setBot(true); };
  el('newBtn').onclick = () => { resetRun(); startLevel(); };
  el('foeBtn').onclick = () => {
    S.noFoes = !S.noFoes;
    el('foeBtn').setAttribute('aria-pressed', S.noFoes ? 'true' : 'false');
    if (S.noFoes) S.monsters.length = 0;
  };
  el('botBtn').onclick = () => setBot(!window.__botActive);

  last = performance.now();
  requestAnimationFrame(frame);
};
function setBot(on){
  window.__botActive = on;
  el('botBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on && window.BOT) window.BOT.reset();
  toast(on ? 'Bot đang chơi' : 'Bạn điều khiển');
}

// ============================================================ hooks for tests + bot
window.REPO = {
  S, TILE, MW, MH, RW, RH, GX, GY, WPX, HPX,
  solidAt, losClear, hitsSolid, money, clamp, angDiff,
  pickUp, dropHeld, useSlot, playerSpeed, grabRange, nearestLoot,
  startLevel, setBot, resetRun,
  damageLoot,
  UPGRADES, GEAR, GEAR_BY_KEY, UPGRADE_MAX_SPAWNS, CART_SLOTS, CART_MAX_SIZE,
  grabCart, releaseCart, cartValue, cartLoad, cartFits, nearTruck, hasGear,
  toggleStash, rollShop, startShop, leaveShop, togglePay,
  shop(){
    if (!S.shopMode) return null;
    const pad = S.pads[0];
    return {
      goods: S.loot.filter(l => l.good && !l.gone).map(l => ({
        kind:l.good.kind, key:l.good.key, name:l.good.name, price:l.value,
        x:l.x, y:l.y, onPad: !!l.onPad, held: !!l.held })),
      pad: pad ? { x:pad.x, y:pad.y, value:pad.value, count:pad.placed.filter(l=>!l.gone).length } : null,
      button: { x:S.button.x, y:S.button.y, r:S.button.r },
      truck: { x:S.car.x, y:S.car.y },
      paying: S.pay.active, countdown: S.countdown,
      canLeave: S.shopCanLeave, wallet: S.wallet
    };
  },
  // turnRate / coneRadius take the player, like playerSpeed above; handWeight / pushWeight are
  // the zero-argument hooks the patch's contract names, and read the current player.
  cartPassable, routeToObjective, turnRate, coneRadius, carriedWeight,
  route(){ return routeToObjective(); },
  visibleRoute(){ return visibleRoute(); },
  checkShiftLost, endLostShift, recoverableValue,
  handWeight(){ return S.player ? handWeight(S.player) : 0; },
  pushWeight(){ return S.player ? pushWeight(S.player) : 0; },
  giveGear(key, n){
    const def = GEAR_BY_KEY[key];
    for (let i=0;i<(n||1);i++) S.stash.push({ kind:key, uses:def.uses });
    return S.stash.length;
  },
  equip(key){
    const i = S.stash.findIndex(it => it.kind === key);
    const free = S.player.inv.indexOf(null);
    if (i < 0 || free < 0) return false;
    S.player.inv[free] = S.stash.splice(i,1)[0];
    return true;
  },
  cut(){ return S.cut ? { kind:S.cut.kind, t:S.cut.t, label:S.cut.label } : null; },
  skipCut, setCutscenes,
  carDrawOffset, playerDrawPos,
  frame(){ const cv = CV(), r = cv.getBoundingClientRect();
           return { w:r.width, h:r.height, aspect:r.width/r.height, zoom:zoom(),
                    worldW:vwW(), worldH:vwH() }; },
  stick(){ return stickL ? { ox:stickL.ox, oy:stickL.oy, x:stickL.x, y:stickL.y } : null; },
  lookStick(){ return stickR ? { ox:stickR.ox, oy:stickR.oy, x:stickR.x, y:stickR.y } : null; },
  hud(){ return hudLayout(); },
  lastUse(){ return S.lastUse || null; },
  aiming(){ const p = S.player; return p && p.aimSlot >= 0
              ? { slot:p.aimSlot, x:p.aimX, y:p.aimY, angle:aimAngle(p, hudLayout()) } : null; },
  rushing(){ return !!(S.player && S.player.rushing); },
  fx(){ return { dread:FX.dread, shake:FX.shake, hitstop:FX.hitstop, flash:FX.flash,
                 hurtT:FX.hurtT, tickPulse:FX.tickPulse, pops:FX.pops.map(q=>q.text) }; },
  threat(){ return threatLevel(); },
  heart(){ const hud = hudLayout();
           return { rate: FX.rate, bpm: Math.round(60/FX.rate), pulse: FX.beatPulse,
                    danger: Math.max(FX.dread, FX.hurtT*0.8),
                    x: hud.heart.x, y: hud.heart.y, r: hud.heart.r }; },
  mouseLook(){ return mouseFresh() ? mouseWorldNow() : null; },
  foesForLevel, makeNoise,
  relocateFoe(i){ return relocateFoe(S.monsters[i||0], Math.random); },
  soundOn(){ return SFX.on; },
  mapFade(){ return S.mapFade || 0; },
  mapAlpha(){ return mix(MINIMAP_IDLE_ALPHA, MINIMAP_FADED_ALPHA, S.mapFade || 0); },
  lookIdle(){ return S.player ? S.player.lookIdle : 0; },
  get timeScale(){ return timeScale; },
  set timeScale(v){ timeScale = clamp(v, 0.1, 12); },
  get dmgMult(){ return DMG_MULT; },
  set dmgMult(v){ DMG_MULT = v; },
  setNoise(v){ S.noiseOverride = v; },
  warp(x,y){ S.player.x = x; S.player.y = y; cam.x = x-vwW()/2; cam.y = y-vwH()/2; },
  spawnFoe(type, dx, dy){
    const m = makeMonster(type, S.player.x + (dx||0), S.player.y + (dy||0));
    S.monsters.push(m); return m;
  },
  botReport(){ return window.BOT ? window.BOT.report() : null; },
  hurtLog(){ return S.hurtLog || []; },
  state(){
    const p = S.player;
    const pad = S.pads[S.padIndex];
    return {
      level:S.level, wallet:S.wallet, seed:S.seed, running:S.running, dead:S.dead,
      shopMode:S.shopMode, paying:S.pay.active, cut: S.cut ? S.cut.kind : null,
      lastLevel: S.lastLevel || null,
      levelDone:S.levelDone, noFoes:S.noFoes,
      hp:p?p.hp:0, hpMax:p?p.hpMax:0, stam:p?p.stam:0, str:p?p.str:0,
      x:p?p.x:0, y:p?p.y:0, dir:p?p.dir:0, noise:p?p.noise:0,
      held: p&&p.held ? { size:p.held.size, value:p.held.value, value0:p.held.value0, mat:p.held.mat.key } : null,
      inv: p ? p.inv.map(it => it ? { kind:it.kind, uses:it.uses } : null) : [],
      stash: S.stash.map(it => ({ kind:it.kind, uses:it.uses })),
      pushing: !!(p && p.pushing),
      rushing: !!(p && p.rushing), speedMul: p ? (p.speedMul || 0) : 0, runT: p ? (p.runT || 0) : 0,
      cart: S.cart ? { x:S.cart.x, y:S.cart.y, items:S.cart.items.length, value:cartValue(S.cart),
                       held:S.cart.held, mode:S.cart.mode } : null,
      upgSpawned: Object.assign({}, S.upgSpawned),
      gearBought: Object.assign({}, S.gearBought),
      offer: S.offer ? { upgrades:S.offer.upgrades.map(u=>u.key), gear:S.offer.gear.map(g=>g.key) } : null,
      loot: S.loot.filter(l=>!l.gone).length,
      lootTotal: S.loot.length,
      lootValue: S.loot.reduce((a,l)=>a+(l.gone?0:l.value),0),
      lootValue0: S.loot.reduce((a,l)=>a+l.value0,0),
      monsters: S.monsters.length,
      chasing: S.monsters.filter(m=>m.state==='chase').length,
      hunting: S.monsters.filter(m=>m.state==='hunt').length,
      foes: S.monsters.map(m=>({ type:m.type, x:m.x, y:m.y, state:m.state,
                                 alert:m.alert, lost:m.lost, tx:m.tx, ty:m.ty })),
      pads: S.pads.map(q=>({ quota:q.quota, value:q.value, done:q.done, active:q.active, ri:q.ri })),
      carRoom: 0, GX, GY,
      padIndex: S.padIndex,
      quotaTotal: S.quotaTotal,
      countdown: S.countdown,
      upg: Object.assign({}, S.upg),
      bot: !!window.__botActive
    };
  }
};
})();
