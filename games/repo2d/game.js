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
// Khung 9:16 nhìn thấy đúng chừng này thế giới. Máy nằm ngang phải thấy CÙNG MỘT
// LƯỢNG thế giới, chỉ là rộng hơn và thấp hơn — nếu không thì xoay ngang vừa là ăn
// gian (thấy xa hơn) vừa vỡ hình (viewW/14 ô làm ô to gấp rưỡi).
// Neo theo diện tích: dọc 9:16 ra đúng con số cũ, ngang 16:9 ra đúng ảnh dọc xoay 90°.
// Đo theo CẠNH NGẮN của khung, không theo bề ngang: bề ngang đổi gấp ba khi xoay máy,
// cạnh ngắn thì gần như không đổi. Nằm ngang kéo gần thêm một nấc (11 thay vì 14) đúng
// kiểu camera MOBA trên điện thoại — cạnh ngắn lúc nằm ngang vốn ngắn hơn lúc cầm dọc,
// giữ nguyên con số thì người bé đi thấy rõ.
const VIEW_W_WORLD_LAND = 9.5 * TILE;
const zoom = () => Math.min(viewW, viewH) /
  (viewW > viewH ? VIEW_W_WORLD_LAND : VIEW_W_WORLD);

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

// WHY 92 and not the 132 this shipped with: at 132 a walking player outran every chasing monster
// in the game (the fastest chase in MONSTERS is 74*1.25 = 92.5 px/s), so being seen cost nothing —
// you turned around and left, and stamina was a bar that never emptied. The base speed is now set
// just under the fastest chase, which makes "it has seen me" a problem you have to spend something
// to solve. What you spend is stamina, through the sprint button.
// ROOT-CAUSE: the escape speed and the pursuit speed were tuned independently and never compared.
// SEE: docs/proposals/repo-2d-topdown.md C2-3.
const PLAYER_BASE_SPEED = 92;
const SPEED_FLOOR = 0.35;        // never fully immobilised, however heavy the haul
const TURN_FLOOR  = 0.40;        // heavy loot slows how fast the look stick can swing

// The three stick tiers. Running is now the TOP of what the stick alone gives you — it is free,
// silent-ish and permanent, and it is not fast enough to break away from anything that has
// already seen you. The extra gear above it is the sprint button, and that one costs stamina.
// Two things the stick says, and one the button says. Measured against the chase speeds in
// MONSTERS (speed x 1.25):
//   sneak 46  - everything catches you, which is the price of being quiet
//   walk  78  - outpaces the patrol (72) and the heavy (50); the bomber (77) is a dead heat
//   RUN  143  - outpaces everything, for as long as the bar lasts. The button, not the stick.
// The old middle rung (a free 92 from a full stick) is gone on purpose: it was a third speed the
// player could not see they were in, and it made the run button look like it did nothing.
const TIER_MUL = [0.5, 0.85];        // sneak, walk — the only two the stick gives

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

// How much a house is allowed to hold. The source game caps BOTH the number of valuables of each
// size and the total value, grows both with the level, and freezes them at level 20 — with a hard
// ceiling of 50 valuables however far you get. That last number is the game's own.
// WHY a cap at all, when the quota is derived from whatever happened to scatter: without one the
// level's whole economy is an accident of how many floor tiles the generator found. The cap makes
// "level 7" mean a definite amount of money and a definite amount of walking, and it is the knob
// that says how long a house takes.
// SEE: https://repo-2025horror.fandom.com/wiki/Valuables — "the maximum number of valuables of each
// size and the maximum total value ... depend on the current level. From level 20 onward, these
// characteristics no longer change. The total number of valuables cannot exceed 50."
const LOOT_CAP_LEVEL = 20;                  // past this nothing grows, exactly as in the source game
const LOOT_CAP_VALUE = [46000, 150000];     // total scattered value, level 1 -> level 20
const LOOT_CAP_COUNT = [14, 50];            // and how many pieces it may be split into
const LOOT_CAP_BIG   = [2, 12];             // per size, so a house cannot be all wardrobes...
const LOOT_CAP_MED   = [5, 22];             // ...nor all trinkets
function lootCap(lv){
  const k = clamp((lv - 1) / (LOOT_CAP_LEVEL - 1), 0, 1);
  return {
    value: Math.round(mix(LOOT_CAP_VALUE[0], LOOT_CAP_VALUE[1], k)),
    count: Math.round(mix(LOOT_CAP_COUNT[0], LOOT_CAP_COUNT[1], k)),
    big:   Math.round(mix(LOOT_CAP_BIG[0],   LOOT_CAP_BIG[1],   k)),
    med:   Math.round(mix(LOOT_CAP_MED[0],   LOOT_CAP_MED[1],   k))
  };
}

const QUOTA_FACTOR = 0.7;        // you may leave 30% of the value behind
const EXTRACT_COUNTDOWN = 5;

const STAM_MAX = 100, STAM_DRAIN = 22, STAM_REGEN = 16;

// Chạy — the run button. A fourth input, and the doc's "a phase proposing a fourth input defaults
// to no" was overridden deliberately by the owner: with the base speed lowered to under a chase,
// the player needs one control that says "spend stamina, get away".
//
// It is a MODE, not a modifier. One tap puts the character into a run that costs stamina; another
// tap puts them back to walking. WHY it changed from the first version: that one only did anything
// while the stick was ALSO at its rim, so the button and the stick were arguing about the same
// decision and the owner could not tell what the button was for — "cái nút rút là gì vậy". A mode
// the player switches is a thing they can name; a modifier on a tier they cannot see is not.
//
// It does NOT let go when you stop moving. A mode that switched itself off would be the same
// invisible rule again, in the other direction.
// 1.85 x the walk tier = 145 px/s, which clears the fastest chase in the house (92) with room to
// spare. It was 1.55 while the run rode on top of a middle rung that no longer exists; leaving it
// there would have quietly made running 121 and cost the escape a third of its margin.
const RUN_MUL      = 1.85;   // the run form's speed, over the walk tier
const RUN_NOISE    = 2.6;    // louder than a walk, quieter than a bolt
const RUN_MIN_STAM = 8;      // stamina needed to START running, so a tap on an empty bar does nothing

// Deadzone as a FRACTION of the stick's radius, not a pixel count: the radius is derived from the
// screen, so a flat 4 px was a real deadzone on a tablet and none at all on a phone.
const STICK_DEAD = 0.14;

// Getting hit shoves you. The screen already shook and flashed, but nothing MOVED — so a hit read
// as a number changing rather than as a thing that happened to your body. Scaled by the damage, so
// a patrol's swipe nudges and the heavy one throws you.
const HIT_KNOCK_BASE = 150, HIT_KNOCK_PER_DMG = 3, HIT_KNOCK_MAX = 370;

// A cursor that has not moved for this long has stopped aiming — the desktop equivalent of taking
// a thumb off the look stick. Per doc C2-2 the facing then FREEZES where it was; it does not reset
// and it does not follow your feet.
// WHY it is not simply forever: a cursor left lying below the character would hold the facing (and
// the load pinned to it) pointing down for as long as nobody touched the mouse.
const LOOK_IDLE = 1.1;

// How far from the character the cursor has to be before it counts as pointing at anything.
const MOUSE_LOOK_MIN = 2.2 * TILE;

// Nước rút. Keep the run input held and the character winds up into a sprint on its own.
// WHY it is time-based and not a gesture: the thing it replaced fired on a double-tap of the run
// input — a stick hitting its own rim twice — and could not be aimed at a moment on purpose.
// It now rides ON the sprint button rather than replacing it: hold the sprint for a second and
// the upgrade turns it into a full bolt. Before the button existed this fired on its own, which
// meant the player never chose to spend the stamina.
const RUSH_DELAY  = 1.0;    // seconds of unbroken sprinting before the bolt kicks in
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
  let ac = null, master = null, nb = null, on = true, an = null;

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

  // ================================================================ the score
  // Three states, crossfaded, never cut: the HOUSE on its own, the DRONE that says something is
  // in it with you, and the CLUSTER that says the something has seen you. Vertical layering - all
  // three run the whole time and only their gain moves, because a layer that STARTS on a cue
  // announces the cue, and the point is that you feel it before you know it.
  //
  // Everything is synthesised, and not to save bytes - the hub could carry a few MB of audio.
  // A drone only works if it is genuinely CONTINUOUS, and a looped file has a seam you hear on
  // every lap. Oscillators have no lap.
  //
  // What the layers are made of, and why:
  //   room     - lowpassed noise, filter drifting on a slow LFO. A room is never silent.
  //   drone    - two sines a fraction of a hertz apart, ~46 Hz. The detune makes them BEAT
  //              against each other about once a second, which is the unease; the pitch is as
  //              low as a laptop speaker can still deliver.
  //   shimmer  - a whisper of bandpassed noise at 4 kHz, kept below where you notice it.
  //   cluster  - two saws a MINOR SECOND apart. The most dissonant interval there is, and the
  //              stand-in for the atonal string cluster a real horror score would use here.
  //   pursuit  - a TRITONE above the cluster's root. It only exists while something is chasing.
  //
  // Sources: "drones of dread" (Game Developer), the safe/alert/pursuit split and "the stinger is
  // the shock, the silence after it is the creep" (Mowjera), vertical layering (The Game Audio Co).
  let mus = null;
  const MUS_LEVEL = { room: 0.055, drone: 0.115, shimmer: 0.020, cluster: 0.085, pursuit: 0.095 };

  function lfo(rate, depth, target){
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = rate;
    const g = ac.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    return o;
  }
  function layerGain(bus){ const g = ac.createGain(); g.gain.value = 0.0001; g.connect(bus); return g; }
  function osc(type, freq, to){
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(to); o.start(); return o;
  }
  // A SEPARATE, long noise buffer for the continuous layers. The one-shots share a 1-second
  // buffer and read it from a random offset, which is fine for a 60 ms crack. Loop that same
  // second forever and the ear finds the seam: a lowpassed drone on a 1 s loop is a 1 Hz pulse,
  // and once you hear it you cannot stop hearing it.
  let lb = null;
  function loopBuffer(){
    if (lb) return lb;
    const n = Math.floor(ac.sampleRate * 7.3);        // an odd length, so it lines up with nothing
    lb = ac.createBuffer(1, n, ac.sampleRate);
    const d = lb.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = Math.random()*2-1;
    return lb;
  }
  function loop(filterType, freq, q, to){
    const src = ac.createBufferSource(); src.buffer = loopBuffer(); src.loop = true;
    const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); f.connect(to); src.start();
    return f;
  }

  function buildScore(){
    const bus = ac.createGain(); bus.gain.value = 1; bus.connect(master);
    const duck = ac.createGain(); duck.gain.value = 1; duck.connect(bus);

    const room = layerGain(duck);
    const roomF = loop('lowpass', 170, 0.7, room);
    lfo(0.05, 60, roomF.frequency);              // the house breathing, once every twenty seconds

    const drone = layerGain(duck);
    const droneF = ac.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 220;
    droneF.connect(drone);
    // 0.6 Hz apart, so the pair beats against each other about once a second.
    osc('sine', 46, droneF);
    osc('sine', 46.6, droneF);
    // WHY the two harmonics above it: 46 Hz is below what a laptop or phone speaker can move, so
    // on the machines this game is actually played on the whole drone would be a rule nobody can
    // hear. The octave and the fifth above carry it onto small speakers; on anything with bass
    // they sit under the fundamental and are not heard as separate notes.
    const partial = (f, lvl) => {
      const g = ac.createGain(); g.gain.value = lvl; g.connect(droneF);
      osc('sine', f, g);
    };
    partial(92, 0.42); partial(92.9, 0.42);
    partial(138, 0.16);
    const shimmer = layerGain(duck);
    loop('bandpass', 4200, 9, shimmer);

    const cluster = layerGain(duck);
    const clusterF = ac.createBiquadFilter(); clusterF.type = 'lowpass'; clusterF.frequency.value = 420;
    clusterF.Q.value = 2; clusterF.connect(cluster);
    osc('sawtooth', 116.5, clusterF);
    osc('sawtooth', 123.5, clusterF);            // a minor second: the interval that will not settle
    lfo(0.11, 90, clusterF.frequency);

    const pursuit = layerGain(duck);
    const pursuitF = ac.createBiquadFilter(); pursuitF.type = 'lowpass'; pursuitF.frequency.value = 700;
    pursuitF.connect(pursuit);
    osc('sawtooth', 164.8, pursuitF);            // tritone above 116.5 - the devil's interval
    osc('sawtooth', 82.4, pursuitF);

    return { bus, duck, room, drone, shimmer, cluster, pursuit,
             at: { room:0, drone:0, shimmer:0, cluster:0, pursuit:0 },
             hushT: 0, duckT: 0 };
  }

  // Only write a gain when it has actually moved. setTargetAtTime once a frame per layer would
  // pile up sixty scheduled events a second on each parameter for no audible gain.
  function ramp(node, key, want, tau){
    if (Math.abs(mus.at[key] - want) < 0.004) return;
    mus.at[key] = want;
    node.gain.setTargetAtTime(Math.max(0.0001, want), ac.currentTime, tau || 0.25);
  }

  return {
    wake(){ ready(); },
    get on(){ return on; },
    // The score, driven once a frame off the dread the game already computes for the screen.
    // `chased` is the harder fact: something has actually seen you and is coming.
    score(dread, chased, dt, quiet){
      if (!ready()) return;
      if (!mus) mus = buildScore();
      mus.duckT = Math.max(0, mus.duckT - dt);
      mus.hushT = Math.max(0, mus.hushT - dt);
      // Silence is a layer too. After a chase breaks, everything drops out for a moment before
      // the house comes back - the release the whole build-up was for.
      const open = mus.hushT > 0 ? 0 : 1;
      const d = quiet ? 0 : clamp(dread, 0, 1);
      ramp(mus.room,    'room',    open * MUS_LEVEL.room * (quiet ? 0.6 : 1), 0.6);
      ramp(mus.drone,   'drone',   open * MUS_LEVEL.drone   * clamp(d/0.35, 0, 1), 0.5);
      ramp(mus.shimmer, 'shimmer', open * MUS_LEVEL.shimmer * clamp((d-0.2)/0.5, 0, 1), 0.7);
      ramp(mus.cluster, 'cluster', open * MUS_LEVEL.cluster * clamp((d-0.45)/0.45, 0, 1), 0.35);
      ramp(mus.pursuit, 'pursuit', open * MUS_LEVEL.pursuit * (chased ? clamp((d-0.5)/0.4, 0, 1) : 0), 0.3);
      const want = mus.duckT > 0 ? 0.25 : 1;
      if (Math.abs((mus.duckAt || 1) - want) > 0.01){
        mus.duckAt = want;
        mus.duck.gain.setTargetAtTime(want, ac.currentTime, want < 1 ? 0.02 : 0.35);
      }
    },
    // Pull the score down under a cue so the cue lands. A stinger buried in its own soundtrack
    // is a stinger nobody hears.
    duckScore(t){ if (mus) mus.duckT = Math.max(mus.duckT, t || 0.8); },
    // Everything out, for real, for a moment.
    hush(t){ if (mus) mus.hushT = Math.max(mus.hushT, t || 1.2); },
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
    sting(){ if (mus) mus.duckT = Math.max(mus.duckT, 0.9);   // the score gets out of its way
             tone(196, 0.02, 0.55, 0.16, 'sawtooth');
             tone(208, 0.02, 0.55, 0.14, 'sawtooth'); },
    tick(i){ tone(620 + i*70, 0.004, 0.07, 0.20, 'square'); },
    chime(){ tone(523, 0.01, 0.30, 0.20, 'sine');
             tone(659, 0.01, 0.32, 0.18, 'sine', null, 0.09);
             tone(784, 0.01, 0.50, 0.20, 'sine', null, 0.18); },
    thud(){ noise(0.30, 0.35, 'lowpass', 240, 1); tone(70, 0.01, 0.35, 0.22, 'sine', 38); },
    // the AEngel arriving: a short bright warp, falling away
    warp(){ noise(0.22, 0.34, 'bandpass', 2200, 2); tone(880, 0.005, 0.30, 0.16, 'triangle', 180); },
    // and taking its swipe
    screech(){ if (mus) mus.duckT = Math.max(mus.duckT, 1.0);
               noise(0.42, 0.5, 'highpass', 1400, 0.8);
               tone(520, 0.01, 0.45, 0.22, 'sawtooth', 110);
               tone(300, 0.01, 0.5, 0.16, 'square', 70, 0.04); },

    // ---------------------------------------------------------------- the house, and you in it
    // ONE RULE holds this whole set together, and breaking it would make the game unreadable:
    // anything the HOUSE does is short, dry and HIGH; anything a MONSTER does is long and LOW.
    // The house is allowed to lie to you about whether you are alone - that is most of the fear -
    // but it is never allowed to sound like the thing that would actually kill you.

    // Your own boots. `k` is the noise the simulation says you are making, which is the same
    // number the blind hunter listens to - so what you hear IS what it hears.
    step(k){ const v = 0.05 + 0.16*clamp(k/3, 0, 1);
             noise(0.055 + 0.02*k, v, 'bandpass', 300 + Math.random()*140, 1.4);
             if (k >= 2.4) tone(70, 0.004, 0.07, v*0.5, 'sine', 44); },

    // The house settling: a joist, a pipe, a board. Short, dry, high - never mistakable for legs.
    creak(){ const f = 900 + Math.random()*1400;
             tone(f, 0.012, 0.10 + Math.random()*0.12, 0.045, 'triangle', f*0.72);
             noise(0.06, 0.05, 'bandpass', f*1.6, 6); },
    drip(){ tone(1500 + Math.random()*600, 0.003, 0.055, 0.05, 'sine', 420); },

    // A door on its hinge. Rising while it swings open, falling as it falls shut.
    hinge(opening){ const a = opening ? 420 : 300, b = opening ? 660 : 190;
                    tone(a, 0.02, 0.30, 0.055, 'sawtooth', b);
                    noise(0.22, 0.05, 'bandpass', 1500, 7); },
    // Wood under load, then wood giving up.
    strain(){ tone(150, 0.03, 0.42, 0.13, 'sawtooth', 96); noise(0.3, 0.10, 'lowpass', 500, 1); },
    splinter(){ if (mus) mus.duckT = Math.max(mus.duckT, 0.7);
                noise(0.40, 0.42, 'highpass', 900, 0.7);
                noise(0.13, 0.30, 'bandpass', 2200, 5, 0.04);
                tone(120, 0.006, 0.40, 0.26, 'square', 44); },

    // Something moving in a room your torch is not pointed at. LOW and dragged, per the rule
    // above - this is the one cue that is allowed to mean "it is close and you cannot see it".
    shuffle(k){ noise(0.20 + Math.random()*0.12, 0.05 + 0.13*k, 'lowpass', 380, 0.9);
                if (Math.random() < 0.35) tone(58, 0.02, 0.26, 0.05*k, 'sine', 38); },
    // and the breath of the thing, when it is very close and still out of sight
    breath(k){ noise(0.55, 0.05 + 0.10*k, 'bandpass', 520, 1.2); },

    // What the score is doing right now, and how many times each cue has fired. Audio is the one
    // system where "it works" normally means a human listening, and a check a human has to run is
    // a check that stops being run. These two make every rule above assertable by a machine; what
    // no machine can judge is whether the result is FRIGHTENING, and that stays a listen.
    // The actual signal coming out of the mix, not what we asked for. Everything else about this
    // system is checkable by reading intent; this is the one hook that proves the oscillators are
    // really making a sound and not a graph of silent nodes wired to nothing.
    level(){
      if (!ready() || !master) return null;
      if (!an){ an = ac.createAnalyser(); an.fftSize = 2048; master.connect(an); }
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]*buf[i];
      return Math.sqrt(sum/buf.length);
    },
    // Average magnitude between two frequencies, in dB. Used to prove the drone survives on a
    // speaker that cannot move 46 Hz: if all its energy sat under 80 Hz it would be a rule that
    // only exists on hardware nobody is playing this on.
    band(lo, hi){
      if (!ready() || !master) return null;
      if (!an){ an = ac.createAnalyser(); an.fftSize = 2048; master.connect(an); }
      const bins = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(bins);
      const per = ac.sampleRate / an.fftSize;
      let sum = 0, n = 0;
      for (let i = 0; i < bins.length; i++){
        const f = i*per;
        if (f < lo || f > hi) continue;
        sum += bins[i]; n++;
      }
      return n ? sum/n : null;
    },
    scoreState(){ return mus ? { room:mus.at.room, drone:mus.at.drone, shimmer:mus.at.shimmer,
                                 cluster:mus.at.cluster, pursuit:mus.at.pursuit,
                                 hush:mus.hushT, duck:mus.duckAt === undefined ? 1 : mus.duckAt,
                                 running: !!ac && ac.state === 'running' } : null; },
    fired: {},
  };
})();
// Wrap every cue so calling it is counted. Done out here rather than inside each one because a
// counter you have to remember to add is a counter that is missing from the cue you needed it on.
for (const k in SFX){
  if (typeof SFX[k] !== 'function' || k === 'scoreState' || k === 'setOn' || k === 'wake') continue;
  const fn = SFX[k];
  SFX[k] = function(){ SFX.fired[k] = (SFX.fired[k] || 0) + 1; return fn.apply(SFX, arguments); };
}

// ============================================================ feel
// Everything in here is presentation, and none of it is allowed to change a rule: the numbers it
// reads are already decided by the simulation. It exists because three different things — a
// monster closing in, taking a hit, and watching money break — all produced the same output
// before, which was a number quietly changing somewhere on the HUD.
const DREAD_R = 10*TILE;         // how close something has to be before you feel it
const HOUSE_GAP  = [7, 18];      // seconds between one creak of the house and the next
const HUSH_FROM  = 0.65;         // dread it has to have reached...
const HUSH_TO    = 0.35;         // ...and fallen back through, for the drop-to-silence to fire
const FOE_HEARD_R  = 7*TILE;     // how close something has to be before you hear it move
const FOE_BREATH_R = 3.2*TILE;   // and before you hear it breathe
const FX = {
  dread: 0, beat: 0, beat2: false, beatPulse: 0, rate: 1.15,
  houseT: 4, peak: 0, foeSnd: 0,
  shake: 0, hitstop: 0,
  flash: 0, flashCol: '255,255,255',
  hurtT: 0, hurtDir: 0,
  tickPulse: 0, lastTick: -1,
  // The jolt of SEEING one. It is its own channel rather than a nudge to dread, because dread is
  // recomputed every frame from how near the thing is and would swallow a one-frame bump whole.
  spotT: 0,
  pops: []                        // world-anchored numbers that rise and fade
};
let shakeX = 0, shakeY = 0;

function fxReset(){
  FX.houseT = 4; FX.peak = 0; FX.foeSnd = 0;
  FX.dread = FX.beat = FX.beatPulse = FX.shake = FX.hitstop = 0;
  FX.beat2 = false; FX.rate = 1.15;
  FX.flash = FX.hurtT = FX.tickPulse = FX.spotT = 0; FX.lastTick = -1;
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
  // A statue standing in front of you, running out of patience, outranks anything with legs.
  const a = S.angel;
  if (a && a.phase === 'stand' && a.t >= ANGEL_SETTLE)
    // Unarmed it is a presence, not a threat — its clock has not started. Half the dread, and flat,
    // so a room you have not pointed a torch at yet does not sit at chase-level tension forever.
    best = a.armed ? 0.45 + 0.5 * clamp(a.unlitT / ANGEL_PATIENCE, 0, 1) : 0.32;
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
  const alarm = Math.max(FX.dread, FX.hurtT*0.8, FX.spotT*0.75);
  FX.rate = mix(1.15, 0.34, alarm);                  // seconds between beats
  FX.beat += dt;
  if (FX.beat >= FX.rate){
    FX.beat = 0; FX.beatPulse = 1; FX.beat2 = false;
    if (FX.dread > 0.06) SFX.heart(clamp(FX.dread, 0.25, 1));
  } else if (!FX.beat2 && FX.beat >= FX.rate*0.22){
    // the second, softer thump of the pair — a heart is lub-DUB, not a metronome
    FX.beat2 = true; FX.beatPulse = Math.max(FX.beatPulse, 0.5);
  }

  // ---- the score. Nothing here decides anything; it reads what the simulation already decided.
  // `chased` is deliberately stricter than dread: dread rises for a thing standing near you in the
  // dark, and that thing deserves the drone. The tritone is for a thing that has SEEN you.
  const chased = !!S.player && !S.shopMode && !S.dead && (
    S.monsters.some(m => m.sleep <= 0 && m.state === 'chase' && m.alert > 0 &&
                         Math.hypot(S.player.x-m.x, S.player.y-m.y) < DREAD_R*1.4) ||
    !!(S.angel && S.angel.armed && S.angel.phase === 'stand'));
  // Silence, used as a layer. A chase that breaks drops EVERYTHING for a beat before the house
  // comes back - the release is what the build-up was for, and an ambience that simply resumes
  // throws it away.
  FX.peak = Math.max(FX.peak, FX.dread);
  if (FX.peak > HUSH_FROM && FX.dread < HUSH_TO){ FX.peak = 0; SFX.hush(1.1); }
  if (FX.dread < 0.05) FX.peak = 0;
  SFX.score(FX.dread, chased, dt, S.shopMode || !S.running);

  // The house talking to itself. Short, dry and high, and only while nothing else is happening -
  // a creak on top of a chase is noise on the one channel that has to stay readable.
  if (!S.shopMode && S.running && !S.dead){
    FX.houseT -= dt;
    if (FX.houseT <= 0){
      FX.houseT = HOUSE_GAP[0] + Math.random()*(HOUSE_GAP[1]-HOUSE_GAP[0]);
      if (FX.dread < 0.3){ if (Math.random() < 0.7) SFX.creak(); else SFX.drip(); }
    }
  }

  FX.beatPulse = Math.max(0, FX.beatPulse - dt*2.6);
  FX.shake     = Math.max(0, FX.shake - dt*16);
  FX.flash     = Math.max(0, FX.flash - dt*3.4);
  FX.hurtT     = Math.max(0, FX.hurtT - dt*1.6);
  FX.tickPulse = Math.max(0, FX.tickPulse - dt*3.2);
  FX.spotT     = Math.max(0, FX.spotT - dt*1.5);

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
// HOW MANY ROUNDS EACH ONE TAKES is the number that matters, not the health. A pistol round is
// 25, and the owner's expectation — stated twice — is that a monster normally goes down in one to
// three. So: patrol 40 (2), bomber 30 (2), stalk 60 (3), Kẻ nghe 75 (3), Kẻ húc 75 (3).
// Kẻ nặng is the deliberate exception at 300 (12): it is the thing you are supposed to run from,
// and a house where everything dies to three rounds has nothing left to be frightened of.
// SEE: docs/proposals/repo-2d-topdown.md F22-2.
const MONSTERS = {
  // `col` was near-black on all five, which is atmospheric and unreadable: a thing standing in your
  // own torch beam has to be a SHAPE, not a suggestion. Lifted enough to read against a lit floor,
  // still dark enough to vanish outside the beam — which is where the fear lives.
  patrol:  { name:'Kẻ đi tuần', hp: 40,  dmg:10,  cd:0.9, speed: 58, sight:7.5, hear:0,   col:'#6b4a45', eye:'#ff6a4e', rim:'#e8b9ad' },
  listen:  { name:'Kẻ nghe',    hp: 75,  dmg:32,  cd:1.6, speed: 74, sight:0,   hear:9.0, col:'#4a5566', eye:'#8fd4f0', rim:'#bcd6e6' },
  stalk:   { name:'Kẻ bám',     hp: 60,  dmg:30,  cd:1.1, speed: 66, sight:8.5, hear:0,   col:'#453a5c', eye:'#cf87f0', rim:'#d3c0e6' },
  bomber:  { name:'Kẻ nổ',      hp: 30,  dmg:14,  cd:0.9, speed: 62, sight:6.5, hear:3.0, col:'#6d5a33', eye:'#ffc25a', rim:'#e8d4a8' },
  heavy:   { name:'Kẻ nặng',    hp:300,  dmg:100, cd:1.8, speed: 40, sight:6.0, hear:6.0, col:'#3f4b4e', eye:'#ff5a45', rim:'#c8d6d8' },
  // Kẻ húc. It does not chase and it does not touch you while walking: its whole threat is one
  // straight line, announced three seconds before it is fired. Everything about it is built so the
  // counter-play is a step sideways and a wall between you, never a health bar.
  rook:    { name:'Kẻ húc',     hp: 75,  dmg:26,  cd:1.2, speed: 54, sight:9.0, hear:0,   col:'#5b4a30', eye:'#ffc94e', rim:'#e2cfa4' }
};
// Parsed once: the additive highlight pass needs these as numbers every frame.
for (const k in MONSTERS){
  const hex = MONSTERS[k].eye;
  MONSTERS[k].eyeRgb = [1,3,5].map(i => parseInt(hex.substr(i,2), 16));
}
// How many of them are in the house. The old curve was 1 + ceil(level/2) and it flattened almost
// immediately against the number of authored monster posts, so a level 12 house held the same five
// things a level 6 house did and the difficulty curve stopped being felt anywhere but the quota.
// Counted from level 1 rather than from zero, so the first two levels hold exactly what they held
// before this changed. Those two are where a player learns the loop, and a house that kills them
// there teaches nothing; the growth belongs later, where the quota is already asking for it.
// The FIRST shift is empty. Owner's call, 2026-08-23: the house is quiet for one level and then
// it is a horror game again. The same shape as the jammed doors, which also start at level 2 - the
// first shift is where the loop is learned, and a player who dies to a patrol before they know what
// a pad is has learned nothing.
// It is a DEFAULT, not a rule: pressing the monster button on level 1 still lets them in.
const FOES_FROM_LEVEL = 1;   // the first shift is no longer the empty one
// How soon the AEngel and the mirrors turn up for the FIRST time in a house. Short enough that
// a shift cannot end without meeting them; long enough that neither is standing there while you
// are still reading the room you walked into.
const FIRST_VISIT = [8, 16];
// THREE. Owner's call, 2026-08-23: "đông như quân Nguyên" — a level 12 house held twelve of them
// and the fight stopped being a fight you could read. WHY a hard cap rather than a gentler curve:
// six pistol rounds is 150 damage, and past three bodies no amount of ammunition is the answer, so
// a crowd does not raise the difficulty — it removes the option of fighting at all and leaves
// running as the only verb. The curve below still shapes the early levels (2, 2, 3); the cap is
// what stops it becoming a mob.
// Three in every house, first shift included — the owner's call, 2026-08-26. It used to open
// with two and climb to three by the third house, and the first house opened with none at all
// so the loop could be learned in quiet. Both are gone: the house is the same size every time
// now, so what a player learns in the first one is what the rest of them are.
const FOES_BASE = 3, FOES_PER_LEVEL = 0, FOES_MAX = 3;
// How many BODIES a house holds - which since 2026-08-27 is no longer the same as how many
// MONSTERS it holds. The roster below is three things; the statue and the pair of mirrors are two
// of them that never stand in S.monsters. Asked about the level currently being played it reads
// that house's own roster, so the number and the house can never disagree; asked about a
// hypothetical level it rolls one.
function foesForLevel(lv){
  const r = (S.roster && S.level === lv) ? S.roster : rosterForLevel(lv, Math.random);
  return bodyKinds(r).length;
}

// Two monsters used to be able to stand on the exact same pixel, and a chasing one ran THROUGH
// the spot it was aiming at and turned round again - measured at 0.8 px apart and ~12 direction
// reversals a second with four of them on one standing player. On screen that is a monster
// vibrating, and a pile of them vibrating against each other.
//
// Two separate causes, so two separate numbers:
//   * the stand-off: a chase target is the tile you are standing on, so a monster that walks all
//     the way to it must overshoot. It stops a body short instead - still inside its own 22 px
//     strike range, so nothing about how hard it hits changes.
//   * the separation: a gentle sideways drift out of anything it is overlapping. A drift, not an
//     impulse - a bounce is what we are removing, so pushing them apart hard would be the same
//     defect wearing the opposite sign.
// SEE: owner feedback 2026-08-23 "đừng cho quái chạm vào nhau, nó cứ nảy nảy"
const FOE_STANDOFF = 18;     // how far short of its target a chasing monster stops
const FOE_SEP_R    = 20;     // two bodies (radius 9) plus a little air
const FOE_SEP_PUSH = 26;     // px/s of drift out of an overlap - a third of walking speed

// The guarantee, as opposed to the steering above: after everything has moved, no two bodies are
// left overlapping. It is a POSITION correction with no velocity in it, which is what keeps it
// from turning into the bounce it exists to remove - each body is moved half the overlap, once,
// and next frame there is nothing left to correct.
const FOE_BODY = 9;          // the radius every monster already moves with

function separateFoes(){
  const ms = S.monsters, want = FOE_BODY*2;
  for (let i=0; i<ms.length; i++) for (let j=i+1; j<ms.length; j++){
    const a = ms[i], b = ms[j];
    // A rook mid-dash cannot steer and does not stop for bodies - it rams them. Nudging it here
    // would bend the one straight line its whole design is built on.
    if (a.rook === 'dash' || b.rook === 'dash') continue;
    let dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy);
    if (d >= want) continue;
    if (d < 0.01){ dx = (i & 1) ? 1 : 0; dy = (i & 1) ? 0 : 1; d = 1; }
    const push = (want-d)*0.5, ux = dx/d*push, uy = dy/d*push;
    moveEnt(a, -ux, -uy, FOE_BODY);
    moveEnt(b,  ux,  uy, FOE_BODY);
  }
}

function foeSeparation(m){
  let sx = 0, sy = 0;
  for (const o of S.monsters){
    if (o === m) continue;
    const dx = m.x-o.x, dy = m.y-o.y;
    const d = Math.hypot(dx, dy);
    if (d >= FOE_SEP_R) continue;
    if (d < 0.01){ sx += 1; continue; }        // exactly on top: any direction beats none
    const k = (FOE_SEP_R - d)/FOE_SEP_R;
    sx += dx/d*k; sy += dy/d*k;
  }
  const l = Math.hypot(sx, sy);
  return l < 1e-6 ? null : { x: sx/l, y: sy/l };
}

// A monster that has not found you in this long gives up on where it is and moves to a room near
// you. WHY it exists: without it the counter-play to every monster in the game is "walk the other
// way and never come back", and a house you can empty by avoiding it is not a house you fear.
// It never lands anywhere you can see — see relocateFoe.
// These three numbers are the difference between a house that keeps finding you and a house that
// ambushes you. Measured with a bot soak: at 25 s / 10 tiles / a 7-tile landing ring, something was
// being dropped next to the player roughly every 25 seconds, and level 1 — two slow patrols — went
// from a walkover to a coin flip. It is a nudge toward the player's half of the map, not a spawn.
// Strictly inside the 22 px a monster must be within to strike — see the note at the shove itself.
const PUSH_R = 20;
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
  ['patrol','listen','bomber','stalk','rook'],
  ['patrol','listen','bomber','stalk','heavy','rook']
];

// What actually gets stocked, which is no longer the table above.
//
// The owner's call, 2026-08-26: every house holds THREE, they are three DIFFERENT kinds, the plain
// patroller is not one of them, and one of them is always a Rook. The table above ramped the roster
// by house number, which meant the interesting monsters were something you had to grind four houses
// to meet — and with only three bodies in a house, a random draw from a ramped pool served the same
// patroller three times over. The table stays because other code still reads it, and because it
// records the order these things were meant to arrive in.
//
// WHY a Rook is guaranteed rather than merely possible: it is the only one that changes how a ROOM
// is read — a corridor with a Rook in it is a lane you do not stand in — and one that turns up in
// one house out of five is a rule nobody learns.
const STOCK_ALWAYS = 'rook';
const STOCK_NEVER  = 'patrol';
// The AEngel and the pair of mirrors COUNT AS MONSTERS - the owner's call, 2026-08-27. Both were
// built as house events, each on a clock of its own, so both arrived in every house whatever else
// was already in it: "how dangerous is this house" was answered by three bodies, and then two more
// things turned up regardless. A house now holds three THINGS, and a statue that takes your torch
// off you is allowed to be one of them.
// They are not in MONSTERS and never will be - neither has health and neither can be shot, which
// is a property held by KEEPING THEM OUT of S.monsters rather than by a flag every damage site has
// to remember to check. So they are kind names the roster understands and the body list does not.
const ANGEL_KIND  = 'angel';
const MIRROR_KIND = 'mirror';
const EVENT_KINDS = [ANGEL_KIND, MIRROR_KIND];
function stockFrom(pool, rnd){
  const rest = pool.filter(k => k !== STOCK_ALWAYS && k !== STOCK_NEVER);
  for (let i = rest.length-1; i > 0; i--){ const j = (rnd()*(i+1))|0; [rest[i],rest[j]] = [rest[j],rest[i]]; }
  const picked = [STOCK_ALWAYS].concat(rest).slice(0, FOES_MAX);
  // Shuffled again so the Rook is not always the one on the first authored post, which is the post
  // nearest the way in.
  for (let i = picked.length-1; i > 0; i--){ const j = (rnd()*(i+1))|0; [picked[i],picked[j]] = [picked[j],picked[i]]; }
  return picked;
}
// What a house past the authored three is stocked with: three out of everything, the statue and
// the mirrors included.
function stockKinds(rnd){ return stockFrom(Object.keys(MONSTERS).concat(EVENT_KINDS), rnd); }
// Bodies only. The one caller is the monster button, on a house whose roster holds no bodies.
function stockBodies(rnd){ return stockFrom(Object.keys(MONSTERS), rnd); }

// The first three houses are AUTHORED rather than rolled, so the game hands over one answer at a
// time instead of three at once: the statue you answer with the torch, then the glass you answer by
// breaking it, then the charge you answer with a step sideways. From the fourth house on it is a
// random three out of the pool above - which means a house can be one Rook and two events, or
// three bodies and no light left behind at all.
// It is a DEFAULT, not a rule: the monster button still walks bodies into house one.
const SCRIPTED_ROSTER = [
  [ANGEL_KIND],
  [ANGEL_KIND, MIRROR_KIND],
  [ANGEL_KIND, MIRROR_KIND, STOCK_ALWAYS]
];
function rosterForLevel(lv, rnd){
  if (lv >= 1 && lv <= SCRIPTED_ROSTER.length) return SCRIPTED_ROSTER[lv-1].slice();
  return stockKinds(rnd || Math.random);
}
function rosterHas(kind){ return (S.roster || []).indexOf(kind) >= 0; }
// The roster minus the two things that are not bodies: what actually gets built into S.monsters.
function bodyKinds(roster){ return (roster || []).filter(k => !!MONSTERS[k]); }

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
  // `test` = you may try it on the shop floor before buying. Only things that SHOOT something you
  // can watch fly: a bandage tests nothing you could see, and a grenade tests the shop.
  // TWENTY rounds, not six. Owner's call, 2026-08-23: "bắn hay bom gì cũng không xi nhê". Six is
  // 150 damage, which does not kill Kẻ nặng (300) and barely dents a pair of anything, so the
  // pistol read as a toy whatever you did with it. Twenty is 500 — enough that a gun is a decision
  // about whether to spend it rather than a thing that never works.
  { key:'gun',     name:'Súng lục',        short:'Súng', desc:'Bắn thẳng theo hướng kéo. 20 viên.',                   uses:20, price: 9000,  stock:4, aim:true, test:true },
  { key:'tranq',   name:'Súng gây mê',     short:'Mê',   desc:'Không giết, nhưng ru con quái trúng đạn ngủ 12 giây.', uses:3, price: 12000, stock:3, aim:true, test:true },
  { key:'bomb',    name:'Lựu đạn',         short:'Bom',  desc:'Ném ra, nổ sau 1,4 giây. Nổ gần đồ là mất tiền.',      uses:2, price: 7000,  stock:5, aim:true },
  { key:'heal',    name:'Băng cứu thương', short:'Máu',  desc:'Hồi 45 máu ngay lập tức.',                             uses:2, price: 4500,  stock:6 },
  { key:'tracker', name:'Máy dò bệ',       short:'Dò',   desc:'Hiện những bệ bạn chưa tìm ra, và vẽ đường tới chúng.',uses:1, price: 6000,  stock:2, passive:true },
  { key:'float',   name:'Bình phản trọng lực', short:'Nhẹ', desc:'20 giây món đang vác nhẹ như không.',               uses:2, price: 10000, stock:3 },
  { key:'shield',  name:'Keo bọc chống vỡ',short:'Bọc',  desc:'25 giây món đang vác không mất giá trị dù va đập.',    uses:2, price: 11000, stock:3 },
  // The answer to a jammed door. Cheap on purpose: a door you cannot open is a detour, not a
  // paywall, and the bar is worth buying for the SECONDS it saves you while something is coming.
  { key:'pry',     name:'Xà beng',         short:'Phá',  desc:'Phá cánh cửa bị kẹt ngay trước mặt. Ồn.',              uses:3, price: 5000,  stock:4 }
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
const PRY_REACH = 2.2*TILE;   // how far in front of you the bar reaches for a jammed door
const CART_MAX_SIZE   = 1;         // index into SIZES: 'to' (2) will not fit on the cart

// ============================================================ cửa giữa các phòng
// A door leaf in every opening between two rooms.
//
// It blocks SIGHT and nothing else. That is the whole design: a closed door means the next room is
// a black rectangle you have to commit to walking into, which is most of what a house full of
// doorways was missing — before this every room was visible from the room before it, and the map
// was one big lit space with walls in it.
//
// WHY it does not block MOVEMENT: the grid is what pathing, the cart's route validator and the
// level generator all read, and a door that edits the grid would have to be open at build time and
// closed at play time — two truths about the same tile. Sight is the one thing that can be layered
// on top without any of them knowing.
//
// It swings open on its own when anything alive is close. Nobody has to press anything: the source
// game's doors are pushed through, and a button to open a door is a fifth input.
const DOOR_OPEN_R   = 1.8*TILE;   // anything alive this close pushes it open
const DOOR_OPEN_T   = 0.22;       // seconds to swing open
const DOOR_SHUT_T   = 1.1;        // and it takes longer to fall shut, so you are not fighting it
const DOOR_SEE_AT   = 0.55;       // open past this and it stops blocking sight

// The opening is carved THREE tiles wide and the leaf was one tile of it, hinged in the middle.
// So "a shut door hides the next room" was only true head-on: step a tile off the centre line and
// you read the whole room through the two thirds of the gap nothing was covering. A door is now a
// PAIR of leaves hinged at the two jambs, meeting in the middle, covering the opening end to end.
// WHY it matters more than it sounds: the tension in this house is walking into a black rectangle,
// and a door that only covers its middle third quietly gives that away every time.
// ROOT-CAUSE: the leaf was drawn and sight-tested at one tile because that is the tile the door
// record sits on, not because that is the width of the hole it is closing.
// SEE: door rework, 2026-08-23
const DOOR_SPAN     = 3*TILE;     // the width of the opening the pair has to cover
const DOOR_LEAF     = DOOR_SPAN/2;
const DOOR_THICK    = 6;          // how far a shut pair sticks out of the doorway, for collision

// Some doors are JAMMED. A jammed door does not swing for you: it blocks the WAY as well as the
// sight, and the ways past it are the pry bar, a grenade, or something big enough to shoulder it
// down. It is the one door in the house you have to make a decision about.
//
// WHY it can never make a level unwinnable: a door is only allowed to jam if every floor tile the
// house could reach with it open can still be reached with it shut (see lockDoors). A jam always
// costs a detour and never the run - which is also why the cart route validator, the pad placer
// and the level generator do not need to know jammed doors exist.
const DOOR_LOCK_FRAC  = 0.25;     // at most this share of the doors in one house
const DOOR_LOCK_LEVEL = 2;        // level 1 teaches the loop with every door working
const DOOR_BASH_T     = 1.6;      // seconds a body with shoulders spends forcing one
const DOOR_BASH_R     = 1.2*TILE;
const DOOR_BREAK_NOISE = 11*TILE; // splintering wood is loud, and the house hears it

function makeDoor(gx, gy, vertical){
  return { gx, gy, x:(gx+0.5)*TILE, y:(gy+0.5)*TILE, vertical, side:1,
           open:0, locked:false, broken:false, bash:0, splint:0, warned:0 };
}

// Every floor tile sitting on a room boundary is a doorway. Only the middle tile of each opening
// carries the pair - the openings are carved three wide, and the pair spans all three.
function buildDoors(rnd){
  S.doors = [];
  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
    const my = cy*RH + (RH>>1), mx = cx*RW + (RW>>1);
    if (cx < GX-1){
      const col = (cx+1)*RW;
      if (S.grid[my*MW+col] === FLOOR) S.doors.push(makeDoor(col, my, true));
    }
    if (cy < GY-1){
      const row = (cy+1)*RH;
      if (S.grid[row*MW+mx] === FLOOR) S.doors.push(makeDoor(mx, row, false));
    }
  }
  const r = rnd || Math.random;
  for (const d of S.doors) d.side = r() < 0.5 ? 1 : -1;   // which room the pair swings into
  lockDoors(r);
}

// The three floor tiles a shut pair stands on.
function doorTiles(d){
  return d.vertical ? [[d.gx, d.gy-1], [d.gx, d.gy], [d.gx, d.gy+1]]
                    : [[d.gx-1, d.gy], [d.gx, d.gy], [d.gx+1, d.gy]];
}

function doorBlockMask(){
  const m = new Uint8Array(MW*MH);
  if (S.doors) for (const d of S.doors){
    if (!d.locked || d.broken) continue;
    for (const t of doorTiles(d)) if (t[0]>=0 && t[1]>=0 && t[0]<MW && t[1]<MH) m[t[1]*MW+t[0]] = 1;
  }
  return m;
}

// Flood the walkable house from the truck, optionally refusing the tiles jammed doors stand on.
function floodWalk(mask){
  const seen = new Uint8Array(MW*MH);
  if (!S.car) return seen;
  const sx = clamp((S.car.x/TILE)|0, 0, MW-1), sy = clamp((S.car.y/TILE)|0, 0, MH-1);
  const start = sy*MW+sx;
  if (S.grid[start] !== FLOOR || (mask && mask[start])) return seen;
  seen[start] = 1;
  const q = [start];
  for (let head=0; head<q.length; head++){
    const i = q[head], x = i%MW, y = (i/MW)|0;
    for (const nb of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      const nx = nb[0], ny = nb[1];
      if (nx<0||ny<0||nx>=MW||ny>=MH) continue;
      const j = ny*MW+nx;
      if (seen[j] || S.grid[j] !== FLOOR || (mask && mask[j])) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

// Jam a few doors, and prove each one before keeping it: with the door shut, every floor tile the
// house could reach without it must STILL be reachable. A door that fails that test is un-jammed
// again. That is the whole safety net - no pad, no piece of loot and no corner of the map can end
// up behind a door the player has no tool for.
// Where the truck parks and where the pads are, in tiles - the set the cart has to keep reaching.
function cartTargets(){
  const t = [];
  if (S.car) t.push([clamp((S.car.x/TILE)|0, 0, MW-1), clamp((S.car.y/TILE)|0, 0, MH-1)]);
  for (const pad of (S.pads || [])) t.push([clamp((pad.x/TILE)|0, 0, MW-1), clamp((pad.y/TILE)|0, 0, MH-1)]);
  return t;
}

function lockDoors(rnd){
  if (!S.doors.length || S.shopMode || S.level < DOOR_LOCK_LEVEL) return;
  const base = floodWalk(null);
  // The cart needs three tiles of clearance and a jam takes all three, so a jam cuts a doorway
  // for the CART even where a person can still squeeze past. Checking only walkability would let
  // a house pass that quietly turns the whole haul into hand trips.
  const cgx = S.car ? clamp((S.car.x/TILE)|0, 0, MW-1) : 0;
  const cgy = S.car ? clamp((S.car.y/TILE)|0, 0, MH-1) : 0;
  const baseCart = floodCart(cgx, cgy, null);
  const targets = cartTargets();
  const budget = Math.max(1, Math.round(S.doors.length * DOOR_LOCK_FRAC));
  const order = S.doors.map(function(_, i){ return i; });
  for (let i=order.length-1; i>0; i--){ const j = (rnd()*(i+1))|0; const t = order[i]; order[i] = order[j]; order[j] = t; }
  let locked = 0;
  for (const i of order){
    if (locked >= budget) break;
    const d = S.doors[i];
    d.locked = true;
    const mask = doorBlockMask(), now = floodWalk(mask);
    let ok = true;
    for (let k=0; k<base.length; k++) if (base[k] && !mask[k] && !now[k]){ ok = false; break; }
    if (ok){
      const nowCart = floodCart(cgx, cgy, mask);
      for (const t of targets){
        const k = t[1]*MW + t[0];
        if (baseCart[k] && !nowCart[k]){ ok = false; break; }
      }
    }
    if (ok) locked++; else d.locked = false;
  }
}

// One way out of a jammed door, wherever the force came from.
function breakDoor(d, how){
  if (!d || d.broken) return false;
  d.broken = true; d.locked = false; d.open = 1; d.bash = 0; d.splint = 1;
  SFX.splinter(); fxShake(how === 'bash' ? 8 : 6);
  if (!S.shopMode) makeNoise(d.x, d.y, DOOR_BREAK_NOISE, 2);
  return true;
}

// The jammed door nearest to a point, within `r`.
function nearestLockedDoor(x, y, r){
  let best = null, bd = r;
  if (S.doors) for (const d of S.doors){
    if (!d.locked || d.broken) continue;
    const dd = Math.hypot(d.x-x, d.y-y);
    if (dd < bd){ bd = dd; best = d; }
  }
  return best;
}
function breakDoorsNear(x, y, r){
  let n = 0;
  if (S.doors) for (const d of S.doors){
    if (!d.locked || d.broken) continue;
    if (Math.hypot(d.x-x, d.y-y) < r && breakDoor(d, 'blast')) n++;
  }
  return n;
}

function stepDoors(dt){
  if (!S.doors) return;
  const bodies = S.shopMode ? [] : crewAlive().concat(S.monsters);
  for (const d of S.doors){
    if (d.splint > 0) d.splint = Math.max(0, d.splint - dt*0.6);
    if (d.warned > 0) d.warned = Math.max(0, d.warned - dt);
    if (d.locked && !d.broken){
      d.open = 0;
      // Anything with shoulders forces it eventually - and that is deliberately everything except
      // YOU. A jammed door that opened if the player leaned on it long enough would make the pry
      // bar a thing nobody ever has a reason to buy, and being the one body in the house that
      // cannot kick a door in is exactly why you carry tools.
      let bashing = false;
      for (const b of bodies){
        if (b === S.player) continue;
        if (Math.abs(b.x-d.x) > DOOR_BASH_R || Math.abs(b.y-d.y) > DOOR_BASH_R) continue;
        // A monster only forces a door it WANTS through. Without this every jam in the house
        // dissolves in the first minute, because five things wandering their patrol routes brush
        // past twelve doorways and the rule quietly deletes itself.
        const mate = S.mates && S.mates.indexOf(b) >= 0;
        if (!mate && !(b.alert > 0)) continue;
        bashing = true; break;
      }
      const was = d.bash;
      d.bash = bashing ? d.bash + dt : Math.max(0, d.bash - dt*0.5);
      // wood under load, once a beat, so you can hear it coming through before it does
      if (bashing && Math.floor(was/0.45) !== Math.floor(d.bash/0.45) &&
          Math.hypot(d.x-S.player.x, d.y-S.player.y) < 14*TILE) SFX.strain();
      if (d.bash >= DOOR_BASH_T) breakDoor(d, 'bash');
      continue;
    }
    if (d.broken){ d.open = 1; continue; }        // a broken door is a hole, for good
    let near = false;
    for (const b of bodies){
      if (Math.abs(b.x-d.x) > DOOR_OPEN_R || Math.abs(b.y-d.y) > DOOR_OPEN_R) continue;
      near = true; break;
    }
    const was = d.open;
    d.open = clamp(d.open + (near ? dt/DOOR_OPEN_T : -dt/DOOR_SHUT_T), 0, 1);
    const heard = Math.hypot(d.x-S.player.x, d.y-S.player.y) < 10*TILE;
    // the hinge as it starts to move, either way, and the clack when it passes the middle
    if (heard && was < 0.02 && d.open >= 0.02) SFX.hinge(true);
    if (heard && was > 0.98 && d.open <= 0.98) SFX.hinge(false);
    if (was < DOOR_SEE_AT && d.open >= DOOR_SEE_AT && heard) SFX.thud();
  }
}

// A closed door is a wall as far as any sightline is concerned - the player's torch, a monster's
// eyes, the AEngel's beam check, all of them, because they all come through losClear.
function doorBlocks(x0, y0, x1, y1){
  if (!S.doors) return false;
  for (const d of S.doors){
    if (d.broken) continue;
    if (!d.locked && d.open >= DOOR_SEE_AT) continue;
    // the pair spans the whole opening, not just its middle tile
    const half = DOOR_LEAF;
    const ax = d.vertical ? d.x : d.x - half, ay = d.vertical ? d.y - half : d.y;
    const bx = d.vertical ? d.x : d.x + half, by = d.vertical ? d.y + half : d.y;
    const dx = x1-x0, dy = y1-y0, ex = bx-ax, ey = by-ay;
    const den = dx*ey - dy*ex;
    if (Math.abs(den) < 1e-9) continue;
    const px = ax-x0, py = ay-y0;
    const t = (px*ey - py*ex) / den;
    const u = (px*dy - py*dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

// A JAMMED door is solid. A working one is not, on purpose: sight is the one thing that could be
// layered on top of the grid without the pathing, the cart route validator and the generator each
// needing a second truth about the same tile, and a leaf that swung bodies around would undo that.
// A jammed door is safe to make solid because it never moves and never opens on its own.
function doorHits(x, y, r){
  if (!S.doors) return false;
  for (const d of S.doors){
    if (!d.locked || d.broken) continue;
    const hx = d.vertical ? DOOR_THICK*0.5 : DOOR_LEAF;
    const hy = d.vertical ? DOOR_LEAF : DOOR_THICK*0.5;
    if (Math.abs(x-d.x) < hx + r && Math.abs(y-d.y) < hy + r) return true;
  }
  return false;
}
// Same question in tiles, for anything that plans a route rather than walks one.
function doorBlockedTile(gx, gy){
  if (!S.doors) return false;
  for (const d of S.doors){
    if (!d.locked || d.broken) continue;
    for (const t of doorTiles(d)) if (t[0] === gx && t[1] === gy) return true;
  }
  return false;
}

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
  angel: null, angelTimer: 0, angelFx: null, lightZones: [],
  mirror: null, mirrorTimer: 0, mirrorFx: null,
  mates: [], crewOn: true, spectate: -1,
  doors: [],
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
    aimSlot: -1, aimId: -1, aimX: 0, aimY: 0, cooldown: 0,
    pushing: false, runT: 0, rushing: false, blindT: 0, slowT: 0, kx: 0, ky: 0,
    floatT: 0, shieldT: 0,
    sprint: false, sprinting: false, sprintOffT: 0, stunT: 0,
    // `down` is one worker on the floor; `S.dead` is the whole crew. They used to be the same
    // flag, which is exactly why dying ended the shift.
    down: false
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
  // WHY: the doors of the PREVIOUS house survived until buildDoors ran at the very end of this
  // function, and everything in between - loot placement, monster posts, the cart route repair -
  // asks whether a point is clear. A jammed door from the last level answering that question is a
  // wall in a house it was never in.
  // ROOT-CAUSE: doors were built last but never cleared first, so S.doors was stale for one whole
  // level build.
  // SEE: door rework, 2026-08-23
  S.doors = [];
  S.padIndex = 0; S.countdown = 0; S.countdownActive = false;
  S.levelDone = false; S.dead = false; S.hurtLog = []; S.shiftLost = false;
  S.restocks = 0;
  // FIRST visit of a house, not a routine one. WHY the two are separated: both were on a 30-60
  // second dice roll from the moment you walked in, so whether a house contained an AEngel or a pair
  // of mirrors at all depended on how long you took in it — a fast shift met neither, and the owner
  // asked for every house to hold all three of the things worth meeting. After the first, the
  // ordinary interval takes over and nothing about their pacing changes.
  S.angel = null; S.angelFx = null; S.lightZones = []; S.angelTimer = mix(FIRST_VISIT[0], FIRST_VISIT[1], Math.random());
  S.mirror = null; S.mirrorFx = null; S.mirrorTimer = mix(FIRST_VISIT[0], FIRST_VISIT[1], Math.random());
  S.angelGone = false; S.mirrorGone = false;
  // The house's roster, rolled ONCE and read by everything after: which bodies stand on the
  // authored posts, whether a statue is coming, whether there is glass in the house.
  // WHY it draws from a stream of its own rather than from `rnd`: `rnd` lays out this whole house,
  // and taking three numbers out of the front of it would move every wall, every valuable and every
  // door in every seeded house the tests pin.
  S.roster = rosterForLevel(S.level, mulberry32(seed ^ 0x2f7a1c3d));
  S.respawns = [];        // bodies the house owes you back, each with its own clock
  S.foeDrops = 0;         // how many times something has dropped money in this house

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
  // Three tiles either side, not two: the truck is 4.7 tiles long now and the clearing has to hold
  // it plus the cart parked beside it.
  for (let y=cgy-2; y<=cgy+2; y++) for (let x=cgx-3; x<=cgx+3; x++) carve(x,y);
  S.car.x = (cgx+0.5)*TILE; S.car.y = (cgy+0.5)*TILE;
  // Where the cart will be parked, needed before it exists: the passability post-condition below
  // has to know the tile it starts on. Same numbers makeCart is called with, kept in one place.
  const cartSpawnX = S.car.x + TILE*3.3, cartSpawnY = S.car.y + TILE*1.6;

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
  const cap = lootCap(S.level);
  // The authored 'L' marks run out long before the cap does — nine rooms hold about fourteen of
  // them, so a level-20 house was still scattering a level-2 house's worth of money and the cap
  // was a number that never bit. Top up from open floor instead, away from the truck and the pads,
  // which is exactly what the restock pass already does when a level runs short mid-shift.
  if (spots.length < cap.count){
    const extra = [];
    for (let gy=1; gy<MH-1; gy++) for (let gx=1; gx<MW-1; gx++){
      const i = gy*MW+gx;
      if (S.grid[i] !== FLOOR || !reach[i]) continue;
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      if (banned.has(ri)) continue;
      const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
      if (hitsSolid(x, y, 16)) continue;                       // room for the biggest piece
      if (Math.hypot(x-S.car.x, y-S.car.y) < 6*TILE) continue; // never in the truck's lap
      if (spots.some(sp => Math.abs(sp.gx-gx) + Math.abs(sp.gy-gy) < 3)) continue;
      extra.push({ gx, gy, ri });
    }
    for (let i=extra.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [extra[i],extra[j]]=[extra[j],extra[i]]; }
    // spread them out: take every Nth of the shuffled list rather than a clump
    for (const e of extra){
      if (spots.length >= cap.count) break;
      if (spots.some(sp => Math.abs(sp.gx-e.gx) + Math.abs(sp.gy-e.gy) < 3)) continue;
      spots.push(e);
    }
  }
  const want = Math.min(spots.length, cap.count);
  let capValue = 0, capBig = 0, capMed = 0;
  for (let i=0;i<want;i++){
    const sp = spots[i];
    const roll = rnd();
    let sizeIdx = roll < 0.45 ? 0 : roll < 0.82 ? 1 : 2;
    // Per-size ceilings, applied by DEMOTING rather than by skipping: a house that ran out of big
    // pieces should still put something on that spot, or the far rooms end up empty and the level
    // gets shorter instead of cheaper.
    if (sizeIdx === 2 && capBig >= cap.big) sizeIdx = 1;
    if (sizeIdx === 1 && capMed >= cap.med) sizeIdx = 0;
    const size = SIZES[sizeIdx];
    const mat  = MATERIALS[ (rnd()*MATERIALS.length)|0 ];
    const v0   = Math.round(mix(size.vmin, size.vmax, rnd()) / 50) * 50;
    // The value ceiling stops the level dead — the last piece is allowed to cross it, so a house
    // is never one crate short of its own cap on a rounding accident.
    if (capValue >= cap.value) break;
    capValue += v0;
    if (sizeIdx === 2) capBig++; else if (sizeIdx === 1) capMed++;
    S.loot.push(makeLoot((sp.gx+0.5)*TILE, (sp.gy+0.5)*TILE, size, mat, v0));
  }

  const totalValue = S.loot.reduce((a,l)=>a+l.value0, 0);
  S.quotaTotal = Math.round(totalValue * QUOTA_FACTOR * difficultyCurve(S.level));
  const per = Math.round(S.quotaTotal / Math.max(1, S.pads.length));
  S.pads.forEach(p => { p.quota = per; });

  // --- monsters
  const pool = LEVEL_MONSTERS[Math.min(LEVEL_MONSTERS.length-1, S.level-1)];
  const kinds = bodyKinds(S.roster);
  if (!S.noFoes && kinds.length){
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
    const n = Math.min(ms.length + spare.length, kinds.length);
    for (let i=0;i<n;i++){
      const sp = i < ms.length ? ms[i] : spare[i - ms.length];
      const type = kinds[i % kinds.length];
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
  S.player.blindT = 0; S.player.slowT = 0;
  S.player.kx = 0; S.player.ky = 0;
  S.player.down = false; S.player.stunT = 0; S.spectate = -1;
  // The crew is placed around the player, so it has to come AFTER the player has a position.
  // It used to sit up with the AEngel reset, which runs before the truck exists — spawnCrew read
  // x off a null player and took the whole level build down with it.
  spawnCrew();
  S.stashOpen = false;

  // The cart is not something you buy and not something you bring home: the source game
  // respawns one at the truck at the start of every level, and it never has to come back.
  S.cart = makeCart(cartSpawnX, cartSpawnY);

  fxReset();
  S.segs = buildSegments();
  buildDoors(mulberry32(seed ^ 0x5bf03635));
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
function cartPassable(gx,gy,mask){
  for (let y=gy-1; y<=gy+1; y++) for (let x=gx-1; x<=gx+1; x++){
    if (x<0||y<0||x>=MW||y>=MH) return false;
    if (S.grid[y*MW+x] !== FLOOR) return false;
    if (mask && mask[y*MW+x]) return false;      // a jammed door, for the callers that care
  }
  return true;
}

// flood(), but stepping only through tiles the cart fits in — which is what "connected" has to
// mean for anything the haul loop needs to reach.
function floodCart(sx, sy, mask){
  const seen = new Uint8Array(MW*MH);
  if (!cartPassable(sx,sy,mask)) return seen;
  const q = [sy*MW+sx]; seen[sy*MW+sx] = 1;
  while (q.length){
    const i = q.pop(), x = i%MW, y = (i/MW)|0;
    for (const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      if (nx<0||ny<0||nx>=MW||ny>=MH) continue;
      const j = ny*MW+nx;
      if (seen[j] || !cartPassable(nx,ny,mask)) continue;
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
  // A route drawn through a jammed door is a route the player cannot walk. During generation
  // there are no doors yet, so this costs the cart-route repair nothing.
  const jam = (S.doors && S.doors.length) ? doorBlockMask() : null;
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
      if (prev[j] !== -2 || S.grid[j] !== FLOOR || (jam && jam[j])) continue;
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
           reveal: 0,                            // fade-in of "this thing has seen you", 0..1
           seen: false, spotT: 0, unseenT: 0,    // the player's side: have I laid eyes on this one
           rook: type === 'rook' ? 'walk' : null, // the rook's own state machine
           goal: null, path: null, pi: 0, pathT: 0, windT: 0, dashLeft: 0,
           stun: 0, charging: false, rammed: null, linger: 0,
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
  // Closed doors join the wall list for this frame. Without this the lighting would pour straight
  // through a shut door while every sight TEST said it was blocked — the rule would be real and
  // invisible, which is the same as not shipping it.
  const shut = [];
  if (S.doors) for (const d of S.doors){
    if (d.broken || (!d.locked && d.open >= DOOR_SEE_AT)) continue;
    const half = DOOR_LEAF;
    shut.push(d.vertical ? seg(d.x, d.y-half, d.x, d.y+half)
                         : seg(d.x-half, d.y, d.x+half, d.y));
  }
  for (const s of S.segs.concat(shut)){
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
  return !doorBlocks(x0, y0, x1, y1);
}

// ============================================================ movement helpers
function hitsSolid(x,y,r){
  for (const [ox,oy] of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]])
    if (solidAt(((x+ox)/TILE)|0, ((y+oy)/TILE)|0)) return true;
  return doorHits(x, y, r);          // a jammed door is a wall until something breaks it
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
  const s2 = (p.pushing && S.cart && S.cart.mode === 'weak') ? base * CART_WEAK_SPEED_MUL : base;
  return p.slowT > 0 ? s2 * 0.55 : s2;
}
function turnRate(p){
  // The only place a loaded cart is still felt: it swings wide.
  const t = 1 / (1 + (handWeight(p) + pushWeight(p)*CART_TURN_PENALTY) / Math.max(1, p.str*1.1));
  return Math.max(t, TURN_FLOOR);
}
function coneRadius(p){
  if (!p) return 0;
  if (p.blindT > 0) return 0;          // AEngel took the torch; only the pool at your feet is left
  // A colleague's torch is a worklight, not your upgraded one.
  if (p.mate) return CONE_R * 0.62;
  const base = CONE_R * (1 + S.upg.light*0.16);
  // Hand weight only — a cart never takes light away.
  return base * Math.max(0.42, 1 - handWeight(p) / Math.max(1, p.str*1.6));
}
function coneHalf(p){ return p && p.mate ? CONE_HALF : CONE_HALF * (1 + S.upg.light*0.08); }
function grabRange(p){ return (1.9 + S.upg.range*0.55) * TILE; }

// ============================================================ loot damage
// Doc C3-2, the rule no guide states: damage comes from STOPPING SUDDENLY, not from touching.
// The input is the change in velocity, so dragging along a wall is free and slamming into one is not.
function damageLoot(l, impulse){
  if (l.gone) return 0;
  if (l.isHead) return 0;            // a colleague does not lose value by being dropped
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
  if (l.held && (l.holder || S.player).shieldT > 0) return 0;   // wrapping tape: nothing gets through
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
  // Whoever is carrying it. Defaulting to the player is what keeps the cart (which has no holder)
  // and every pre-crew call site working unchanged.
  const p = o.holder || S.player;
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
  if (p.down) return cycleSpectate();  // a head on the floor has nothing to grab with — it watches
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
  best.held = true; best.holder = p;
  best.grace = S.time + GRACE_AFTER_PICKUP;   // C3-5: no damage in the first second after pickup
  best.vx = best.vy = 0;
  best.freeX = p.x + Math.cos(p.dir)*(best.r+12);
  best.freeY = p.y + Math.sin(p.dir)*(best.r+12);
  p.held = best;
  return true;
}
// The sprint toggle. Kept here with the other things a thumb does to the character, and the ONE
// place the flag is set from — the HUD button, the keyboard and the tests all come through it.
function toggleSprint(){
  const p = S.player;
  if (!p || S.dead || S.shopMode || p.down) return false;
  if (p.sprint){ p.sprint = false; toast('Đi bộ.'); return false; }
  if (p.stam < RUN_MIN_STAM){ toast('Chưa đủ thể lực để chạy.'); return false; }
  p.sprint = true; p.sprintOffT = 0;
  toast('Chạy — tốn thể lực.');
  return true;
}

function dropHeld(p){
  if (!p.held) return;
  const l = p.held;
  l.held = false; l.holder = null; l.vx *= 0.3; l.vy *= 0.3;
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
  const p = (m.target && !m.target.down) ? m.target : S.player;
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

// Who a given monster is currently interested in. It used to be "the player", unconditionally,
// which would have left three colleagues walking through the house as furniture.
// Sight picks the nearest living body it can actually see; hearing picks the loudest thing within
// earshot, weighted by distance, which is what lets a mate's clumsy running pull a listener off you.
function foeTarget(m){
  const d = MONSTERS[m.type];
  const live = crewAlive();
  if (!live.length) return S.player;
  let seen = null, sd = 1e9;
  for (const a of live){
    const dist = Math.hypot(a.x-m.x, a.y-m.y);
    if (d.sight > 0 && dist < d.sight*TILE && losClear(m.x, m.y, a.x, a.y)){
      const off = Math.abs(angDiff(Math.atan2(a.y-m.y, a.x-m.x), m.dir));
      if ((off < 1.1 || dist < 3*TILE) && dist < sd){ sd = dist; seen = a; }
    }
  }
  if (seen) return seen;
  if (d.hear > 0){
    let heard = null, best = 0;
    for (const a of live){
      const noise = (a === S.player) ? (a.noise || 0) : (a.noise || 0);
      if (noise <= 0) continue;
      const dist = Math.hypot(a.x-m.x, a.y-m.y);
      const reach = d.hear*TILE*noise*0.6;
      if (dist >= reach) continue;
      const score = reach - dist;
      if (score > best){ best = score; heard = a; }
    }
    if (heard) return heard;
  }
  // Nobody detected: it keeps facing whoever is nearest, so patrols still drift toward the crew.
  let near = live[0], nd = 1e9;
  for (const a of live){
    const dist = Math.hypot(a.x-m.x, a.y-m.y);
    if (dist < nd){ nd = dist; near = a; }
  }
  return near;
}

// The one cue in the game that is allowed to mean "it is close and you cannot see it". Only the
// NEAREST unseen thing gets a voice: five monsters each dragging a foot is a wall of noise, and a
// wall of noise carries no information at all.
// It deliberately does NOT fire for something you can already see - the torch has told you.
// Turning the monsters ON in the middle of a level.
// WHY it is not just startLevel(): rebuilding the house would throw away everything you had
// already hauled onto the pads, which makes the toggle punish you for pressing it. They walk in
// instead - never on top of the truck, never next to you, and never anywhere you could watch one
// appear out of nothing, which is the same rule the mid-shift restock already follows.
function populateFoes(){
  if (S.shopMode || !S.grid || !S.car) return 0;
  // Walking them in mid-shift obeys the same rule as building the house: three kinds, all different,
  // Rook among them. It fills the kinds that are MISSING rather than drawing fresh, so pressing the
  // toggle after two have died puts back the two that died and not two more of the survivor.
  const here = S.monsters.map(m => m.type);
  // The roster's own bodies first. The first two houses have none — their roster is the statue and
  // the glass — and an explicit press outranks that: a button that visibly does nothing reads as
  // broken, so on those it draws a full set of bodies from the ordinary pool instead.
  const mine = bodyKinds(S.roster);
  const kinds = mine.length ? mine : stockBodies(Math.random);
  const pool = kinds.filter(k => !here.includes(k));
  const want = kinds.length - S.monsters.length;
  let made = 0;
  for (let i = 0; i < want; i++){
    for (let tries = 0; tries < 240; tries++){
      const gx = 1 + ((Math.random()*(MW-2))|0), gy = 1 + ((Math.random()*(MH-2))|0);
      if (S.grid[gy*MW+gx] !== FLOOR) continue;
      const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
      if (hitsSolid(x, y, 11)) continue;
      if (Math.hypot(x-S.car.x, y-S.car.y) < 12*TILE) continue;
      if (S.player && Math.hypot(x-S.player.x, y-S.player.y) < 9*TILE) continue;
      if (S.player && inSight(x, y)) continue;
      S.monsters.push(makeMonster(pool[made % Math.max(1, pool.length)] || STOCK_ALWAYS, x, y));
      made++; break;
    }
  }
  return made;
}

// ============================================================ what a body leaves, and when it comes back
// Two rules the owner asked for together on 2026-08-27, and they only work as a pair.
//
// A monster that dies drops money, and how much is HOW HARD IT WAS. Derived rather than authored,
// so retuning a monster's health or its hit retunes what it drops and the two can never drift
// apart. The weights put the plain patroller at about the price of a small vase and the heavy at
// about the price of the biggest thing in the house - which is the whole point of the heavy:
// twelve pistol rounds is an investment, and until now it had no payout at all.
const FOE_LOOT_PER_HP  = 9;
const FOE_LOOT_PER_DMG = 60;
const FOE_LOOT_SPREAD  = 0.18;      // plus or minus, so one kind is not one fixed number
// And the ceiling, which is the half that keeps the first rule honest. WHY there is one: bodies
// come BACK now (below), so with no cap the house is a farm - stand in a doorway, shoot whatever
// walks into it, meet the quota without ever touching a valuable. Three drops is a bonus; an
// unlimited number of them is a different game.
const FOE_DROP_MAX = 3;
// A body is gone for a COUNTDOWN, not for the shift. Without it a house with a gun in it empties
// out and the back half of every shift is a walk; with it, killing something buys you a window you
// can measure rather than a room you own. The statue and the mirrors already worked exactly this
// way - both have always come back on a clock - so this is that same rule finally reaching the
// things that can actually be killed.
const FOE_RESPAWN = 45;

function foeLootValue(type){
  const d = MONSTERS[type];
  if (!d) return 0;
  return Math.round((d.hp*FOE_LOOT_PER_HP + d.dmg*FOE_LOOT_PER_DMG) / 50) * 50;
}
// A monster does not PAY you. It drops a thing on the floor, and that thing is an ordinary
// valuable in every respect: it has weight that slows you down, it is made of something that can
// crack, and it only becomes money the way every other value in this house does - carried to a pad
// without being dropped down a doorway on the way.
// WHY this is worth spelling out: the first cut of this made a money bag and a floating "+$8,700",
// and even though the thing on the floor was always an object, a rising money number IS a payout as
// far as the player is concerned. Owner's call, 2026-08-27: "rớt loot ra chứ không phải là cho tiền
// trực tiếp". So no pop, no bag - a piece of loot, sized by what it is worth.
//
// The size comes out of the VALUE rather than being rolled: the house's own size table already says
// what a $950 thing looks like and what an $8,700 thing looks like, and using it means the heavy -
// the one you spent twelve rounds on - drops something genuinely heavy to carry home.
function sizeForValue(v){
  for (let i = 0; i < SIZES.length; i++) if (v <= SIZES[i].vmax) return i;
  return SIZES.length - 1;
}
function dropFoeItem(x, y, value){
  if ((S.foeDrops || 0) >= FOE_DROP_MAX) return null;
  const size = SIZES[sizeForValue(value)];
  const mat  = MATERIALS[(Math.random()*MATERIALS.length)|0];
  const l = makeLoot(x, y, size, mat, value);
  l.fromFoe = true;
  l.grace = S.time + 3;          // it lands in the middle of a fight; three seconds before it can break
  S.loot.push(l);
  S.foeDrops = (S.foeDrops || 0) + 1;
  return l;
}
function foeDropsLeft(){ return Math.max(0, FOE_DROP_MAX - (S.foeDrops || 0)); }
function dropFoeLoot(x, y, type){
  const base = foeLootValue(type);
  if (base <= 0) return null;
  const v = Math.round(base * mix(1-FOE_LOOT_SPREAD, 1+FOE_LOOT_SPREAD, Math.random()) / 50) * 50;
  return dropFoeItem(x, y, v);
}

function queueRespawn(type){
  if (S.shopMode || S.levelDone || S.shiftLost || S.noFoes) return false;
  (S.respawns = S.respawns || []).push({ type, t: FOE_RESPAWN });
  return true;
}
// Somewhere reachable, well away from the truck, never within nine tiles of anybody alive, and
// never anywhere the player is looking - the same rule the mid-shift restock follows, because a
// monster that blinks into view is a bug the player can see.
function respawnSpot(){
  for (let tries = 0; tries < 300; tries++){
    const gx = 1 + ((Math.random()*(MW-2))|0), gy = 1 + ((Math.random()*(MH-2))|0);
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
    if (hitsSolid(x, y, 11)) continue;
    if (S.car && Math.hypot(x-S.car.x, y-S.car.y) < 12*TILE) continue;
    if (crewAlive().some(a => Math.hypot(x-a.x, y-a.y) < 9*TILE)) continue;
    if (inSight(x, y)) continue;
    return { x, y };
  }
  return null;
}
function stepRespawns(dt){
  const q = S.respawns;
  if (!q || !q.length) return;
  for (let i = q.length-1; i >= 0; i--){
    const e = q[i];
    e.t -= dt;
    if (e.t > 0) continue;
    // The shift is over, one way or the other: nothing else walks in.
    if (S.levelDone || S.shiftLost || S.dead){ q.splice(i,1); continue; }
    const at = respawnSpot();
    if (!at){ e.t = 3; continue; }       // nowhere out of sight right now - try again shortly
    S.monsters.push(makeMonster(e.type, at.x, at.y));
    q.splice(i, 1);
    SFX.thud();                          // something moved, somewhere behind you
    toast(MONSTERS[e.type].name + ' vừa vào nhà');
  }
}
// Everything the house owes you the return of, as ONE list: the bodies you killed, the statue you
// filled or that clawed you, the glass you broke. All three were always countdowns; this is the
// first time any of them is a number the player can read.
// The FIRST arrival of the statue or the mirrors is deliberately not in here - that one is meant
// to be a surprise, and a countdown to it would hand the surprise away.
function pendingReturns(){
  const out = (S.respawns || []).map(r => ({ name: MONSTERS[r.type].name, t: r.t }));
  if (S.angelGone  && !S.angel  && rosterHas(ANGEL_KIND))  out.push({ name:'AEngel', t: S.angelTimer });
  if (S.mirrorGone && !S.mirror && rosterHas(MIRROR_KIND)) out.push({ name:'Gương',  t: S.mirrorTimer });
  return out.filter(r => r.t > 0).sort((a,b) => a.t - b.t);
}

function stepFoeSound(dt){
  const p = S.player;
  if (!p || S.dead || S.shopMode) return;
  FX.foeSnd -= dt;
  if (FX.foeSnd > 0) return;
  let near = null, nd = FOE_HEARD_R;
  for (const m of S.monsters){
    if (m.sleep > 0) continue;
    const d = Math.hypot(p.x-m.x, p.y-m.y);
    if (d < nd && !inSight(m.x, m.y)){ nd = d; near = m; }
  }
  if (!near){ FX.foeSnd = 0.4; return; }
  const k = 1 - nd/FOE_HEARD_R;
  if (nd < FOE_BREATH_R && Math.random() < 0.4) SFX.breath(k); else SFX.shuffle(k);
  FX.foeSnd = 0.55 + Math.random()*0.9;
}

// The player's own side of "seen": the frame a body resolves out of the dark for THEM. It latches,
// and it only unlatches after a couple of seconds fully out of view, because a danger cue that
// re-fires every time something crosses the edge of the torch beam is a strobe and not a warning.
const SPOT_FX_T   = 0.55;     // how long the ring that says "there it is" lives
const SPOT_FORGET = 2.5;      // out of sight for this long, and the next look is a fresh sighting
function stepFoeSpotted(m, dt){
  m.spotT = Math.max(0, (m.spotT || 0) - dt);
  if (m.sleep > 0) return;
  const vis = inSight(m.x, m.y) || (m.reveal || 0) > 0.02;
  if (vis){
    m.unseenT = 0;
    if (!m.seen){
      m.seen = true; m.spotT = SPOT_FX_T;
      FX.spotT = 1;               // the screen jolts with the eye - see the alarm term in stepFx
      fxShake(1.6);
    }
  } else {
    m.unseenT = (m.unseenT || 0) + dt;
    if (m.unseenT > SPOT_FORGET) m.seen = false;
  }
}

function stepMonsters(dt){
  for (const m of S.monsters){
    const d = MONSTERS[m.type];
    m.wob += dt*4; m.hit = Math.max(0, m.hit - dt);
    const p = foeTarget(m);
    m.target = p;
    const dist = Math.hypot(p.x-m.x, p.y-m.y);
    const want = foeRevealed(m) ? 1 : 0;
    m.reveal = clamp((m.reveal || 0) + (want ? dt/REVEAL_FADE : -dt/REVEAL_FADE), 0, 1);
    stepFoeSpotted(m, dt);

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
    //
    // WHY THE RADIUS IS SMALLER THAN THE STRIKE RANGE, and this is the whole rule: it used to be
    // 26 against a strike range of 22, so a monster was thrown back BEFORE it could ever reach the
    // distance at which it is allowed to hit you. Measured: with the upgrade bought, a patrol shoved
    // at a standing player for ten seconds and did ZERO damage, oscillating between 27 and 46 px and
    // never once crossing 26. That is not "buys you room", that is immunity, and it is what the
    // owner saw as "quái ủi ủi vào người mà không gây sát thương, cứ tự knockback ngược lại".
    // At 20 the monster has to get inside its own strike range first: it lands the blow, THEN it is
    // thrown off. The upgrade lowers the rate you are hit at instead of setting it to nothing.
    // SEE: docs/proposals/repo-2d-topdown.md F22-1.
    if (S.upg.push > 0 && p === S.player && dist < PUSH_R && m.shoveCd <= 0){
      const a = Math.atan2(m.y-p.y, m.x-p.x);
      const shove = 150 + 90 * S.upg.push;
      m.kx = Math.cos(a) * shove;
      m.ky = Math.sin(a) * shove;
      m.shoveCd = 0.5;
    }

    // Kẻ húc runs its own head: no chase, no contact damage, one straight line at a time.
    if (m.type === 'rook'){ stepRook(m, dt, dist); continue; }

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
    // Never step PAST the thing being walked to, and stop a body short of a live target.
    const standOff = m.state === 'chase' ? FOE_STANDOFF : 0;
    const step = Math.max(0, Math.min(spd*dt, am - standOff));
    let mx = ax/am*step, my = ay/am*step;
    const sep = foeSeparation(m);
    if (sep){ mx += sep.x*FOE_SEP_PUSH*dt; my += sep.y*FOE_SEP_PUSH*dt; }
    if (mx || my) moveEnt(m, mx, my, 9);

    if (dist < 22 && m.hit <= 0 && !S.dead && !p.down && m.alert > 0){
      m.hit = d.cd || 0.9;
      hurtActor(p, m.dmg, m.type, m.x, m.y);
      // a monster hitting you also hits what you are carrying
      if (p.held) damageLoot(p.held, m.dmg * 4);
    }
  }
}

// ============================================================ Kẻ húc (the rook)
// A monster with no chase in it. It walks a route across the house, and if it catches sight of you
// on the way it stops, winds up for three seconds in plain view, and fires itself down one straight
// line - far past where you were standing, because it cannot steer once it is moving.
//
// WHY it is built out of a wind-up and an overshoot rather than out of speed: every other monster
// here is answered by distance, which makes "walk backwards" the whole game. This one is answered
// by a SIDESTEP and by geometry - a corner, a doorway, another monster in the lane - and it hurts
// most in the open rooms where the other four are easiest.
const ROOK_WIND        = 3.0;      // seconds of telegraph before the dash. Long on purpose.
const ROOK_DASH_SPEED  = 430;
const ROOK_OVERSHOOT   = [1.5, 2.0];  // it travels this multiple of the distance it aimed at
const ROOK_SELF_STUN   = 6.0;      // what hitting anything solid costs it
const ROOK_LINGER      = 10.0;     // milling about once it reaches its chosen spot
const ROOK_MILL_R      = 1.5*TILE;
const ROOK_PLAYER_STUN = 2.0;      // if it puts you into a wall
const ROOK_WALL_DMG    = 0.6;      // extra damage on that, as a fraction of the ram
const ROOK_KNOCK       = 560;
const ROOK_FOE_DMG     = 0.5;      // what it does to another monster in the lane - and it keeps going
const ROOK_HIT_R       = 22;
const ROOK_REPATH      = 1.2;      // seconds between route recalculations while walking

function rookSees(m, dist){
  const p = m.target || S.player;
  if (S.dead || p.down) return false;
  if (dist > MONSTERS.rook.sight*TILE) return false;
  if (!losClear(m.x, m.y, p.x, p.y)) return false;
  const a = Math.abs(angDiff(Math.atan2(p.y-m.y, p.x-m.x), m.dir));
  return a < 1.2 || dist < 3*TILE;
}

// A spot in some room that is NOT the start room — the truck's room is the one place in the house
// the player has to be able to stand still in.
function rookPickGoal(m){
  for (let i = 0; i < 90; i++){
    const ri = 1 + ((Math.random()*(GX*GY-1))|0);
    const r = S.rooms[ri];
    if (!r) continue;
    const gx = r.cx*RW + 1 + ((Math.random()*(RW-2))|0);
    const gy = r.cy*RH + 1 + ((Math.random()*(RH-2))|0);
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
    if (hitsSolid(x, y, 9)) continue;
    m.goal = { x, y, gx, gy, ri };
    m.path = null; m.pathT = 0;
    return true;
  }
  return false;
}

// Shortest floor path to the goal, walked waypoint by waypoint. Recomputed on a timer rather than
// every frame: the grid does not move, and a BFS per monster per frame is the one thing in this
// file that would actually cost a phone anything.
function rookRepath(m){
  m.pathT = ROOK_REPATH;
  if (!m.goal) return;
  const sx = clamp((m.x/TILE)|0, 0, MW-1), sy = clamp((m.y/TILE)|0, 0, MH-1);
  const tgx = m.goal.gx, tgy = m.goal.gy;
  const path = bfsPath(sx, sy, (x,y) => x === tgx && y === tgy);
  m.path = path ? path.map(([x,y]) => ({ x:(x+0.5)*TILE, y:(y+0.5)*TILE })) : null;
  m.pi = m.path ? Math.min(1, m.path.length-1) : 0;
}

function rookCrash(m, what){
  m.rook = 'stun'; m.stun = ROOK_SELF_STUN;
  m.charging = false; m.state = 'patrol'; m.alert = 0;
  m.path = null; m.rammed = null;
  fxShake(what === 'wall' ? 9 : 6); SFX.thud();
}

function rookSlam(m, who){
  const p = who || S.player;
  const a = m.dir;
  hurtActor(p, m.dmg, 'rook', m.x, m.y);
  // Into a wall? Probed along the direction it threw you, one and a bit tiles out - the distance
  // the knockback actually covers before it decays. A hit in the open is a hit; a hit with a wall
  // behind you is the expensive one, and the player can see which they are standing in.
  const probe = 1.35*TILE;
  const walled = hitsSolid(p.x + Math.cos(a)*probe, p.y + Math.sin(a)*probe, 7.5);
  if (walled && !S.dead && !p.down){
    hurtActor(p, Math.round(m.dmg*ROOK_WALL_DMG), 'rook-wall', m.x, m.y);
    p.stunT = ROOK_PLAYER_STUN;
    fxFlash(0.42, '190,60,50');
    toast('Bị húc dập vào tường — choáng ' + ROOK_PLAYER_STUN + ' giây.');
  }
  p.kx = Math.cos(a)*ROOK_KNOCK; p.ky = Math.sin(a)*ROOK_KNOCK;
  rookCrash(m, 'player');
}

function stepRook(m, dt, dist){
  const p = m.target || S.player;
  m.rook = m.rook || 'walk';
  m.windT = m.windT || 0;

  if (m.rook === 'stun'){
    m.stun -= dt;
    m.state = 'patrol'; m.charging = false;
    if (m.stun <= 0){ m.rook = 'walk'; m.path = null; }
    return;
  }

  // The dash. Nothing steers it: the angle was locked when it fired.
  if (m.rook === 'dash'){
    m.state = 'chase'; m.charging = true; m.alert = 1.2;
    const stepLen = ROOK_DASH_SPEED*dt;
    const nx = m.x + Math.cos(m.dir)*stepLen, ny = m.y + Math.sin(m.dir)*stepLen;

    // it will run over ANYONE in the lane, colleague or not
    let struck = null;
    for (const a of crewAlive()) if (Math.hypot(a.x-nx, a.y-ny) < ROOK_HIT_R + 8){ struck = a; break; }
    if (!S.dead && struck){ rookSlam(m, struck); return; }

    // Another monster in the lane takes half of what you would have taken, and the rook does NOT
    // stop for it. One per dash each, so a body it is standing on is not hit sixty times a second.
    for (const o of S.monsters.slice()){
      if (o === m || o.sleep > 0) continue;
      if (m.rammed && m.rammed.has(o)) continue;
      if (Math.hypot(o.x-nx, o.y-ny) > 20) continue;
      if (m.rammed) m.rammed.add(o);
      o.hp -= m.dmg*ROOK_FOE_DMG; o.alert = Math.max(o.alert, 3);
      o.kx = Math.cos(m.dir)*300; o.ky = Math.sin(m.dir)*300;
      if (o.hp <= 0) killMonster(o);
      fxShake(4); SFX.thud();
    }

    const bx = m.x, by = m.y;
    moveEnt(m, Math.cos(m.dir)*stepLen, Math.sin(m.dir)*stepLen, 9);
    const moved = Math.hypot(m.x-bx, m.y-by);
    m.dashLeft -= moved;
    if (moved < stepLen*0.5){ rookCrash(m, 'wall'); return; }   // it met a wall
    if (m.dashLeft <= 0){ m.rook = 'walk'; m.charging = false; m.state = 'patrol'; m.rammed = null; m.path = null; }
    return;
  }

  // Winding up. It tracks you while it winds - that is what makes the three seconds a decision
  // and not a coin flip - and locks the angle at the instant it fires.
  if (m.rook === 'wind'){
    m.state = 'chase'; m.charging = true; m.alert = 1.2;
    if (!rookSees(m, dist)){
      // Lost you mid-wind: it goes back to where it was walking, per the spec. The wind-up is
      // spent, which is the reward for breaking line of sight.
      m.rook = 'walk'; m.charging = false; m.state = 'patrol'; m.windT = 0; m.alert = 0;
      return;
    }
    const want = Math.atan2(p.y-m.y, p.x-m.x);
    m.dir += clamp(angDiff(want, m.dir), -2.6*dt, 2.6*dt);
    m.windT += dt;
    if (m.windT >= ROOK_WIND){
      m.windT = 0;
      m.dir = want;
      m.dashLeft = dist * mix(ROOK_OVERSHOOT[0], ROOK_OVERSHOOT[1], Math.random());
      m.dashSpan = m.dashLeft;   // what it committed to, kept because dashLeft is spent as it flies
      m.dashAim  = dist;
      m.rammed = new Set();
      m.rook = 'dash';
      SFX.sting(); fxShake(3);
    }
    return;
  }

  // Milling about at the spot it chose.
  if (m.rook === 'linger'){
    m.state = 'patrol'; m.charging = false;
    m.linger -= dt;
    if (rookSees(m, dist)){ m.rook = 'wind'; m.windT = 0; return; }
    m.think -= dt;
    if (m.think <= 0 || Math.hypot(m.tx-m.x, m.ty-m.y) < 10){
      m.think = 1.2 + Math.random()*1.6;
      const a = Math.random()*Math.PI*2, r = Math.random()*ROOK_MILL_R;
      m.tx = m.goal.x + Math.cos(a)*r; m.ty = m.goal.y + Math.sin(a)*r;
    }
    const ax = m.tx-m.x, ay = m.ty-m.y, am = Math.hypot(ax,ay) || 1;
    m.dir = Math.atan2(ay,ax);
    moveEnt(m, ax/am*m.speed*0.45*dt, ay/am*m.speed*0.45*dt, 9);
    if (m.linger <= 0){ m.rook = 'walk'; m.goal = null; m.path = null; }
    return;
  }

  // Walking its route.
  m.state = 'patrol'; m.charging = false;
  if (rookSees(m, dist)){ m.rook = 'wind'; m.windT = 0; return; }
  if (!m.goal && !rookPickGoal(m)) return;
  m.pathT -= dt;
  if (!m.path || m.pathT <= 0) rookRepath(m);
  if (!m.path){ m.goal = null; return; }              // nothing reachable; choose again next tick
  while (m.pi < m.path.length && Math.hypot(m.path[m.pi].x-m.x, m.path[m.pi].y-m.y) < 10) m.pi++;
  if (m.pi >= m.path.length){
    m.rook = 'linger'; m.linger = ROOK_LINGER; m.think = 0;
    m.tx = m.goal.x; m.ty = m.goal.y;
    return;
  }
  const wp = m.path[m.pi];
  const ax = wp.x-m.x, ay = wp.y-m.y, am = Math.hypot(ax,ay) || 1;
  m.dir = Math.atan2(ay,ax);
  m.tx = wp.x; m.ty = wp.y;
  moveEnt(m, ax/am*m.speed*dt, ay/am*m.speed*dt, 9);
}

function hurtPlayer(n, src, fromX, fromY){
  const p = S.player;
  (S.hurtLog = S.hurtLog || []).push({ t:+S.time.toFixed(1), n, src: src || '?', hp: Math.round(p.hp - n) });
  p.hp -= n; p.hurt = 0.45;
  // Away from whatever hit you. Decays like the monsters' own knockback does, and moves through
  // moveEnt so it cannot push you into a wall.
  if (fromX !== undefined){
    const away = Math.atan2(p.y-fromY, p.x-fromX);
    const k = Math.min(HIT_KNOCK_MAX, HIT_KNOCK_BASE + n*HIT_KNOCK_PER_DMG);
    p.kx = Math.cos(away)*k; p.ky = Math.sin(away)*k;
  }
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
  // The drop goes down BEFORE the bomber's own blast (queued above) resolves, which is what the
  // bag's three-second grace is for: the thing that killed it is allowed to be standing on it.
  const bag = dropFoeLoot(m.x, m.y, m.type);
  const back = queueRespawn(m.type);
  // ONE line for one event. Two toast() calls in a row is one message overwriting the other before
  // anybody has read it, and the one that would lose here is the one that says you were paid.
  // Kept SHORT because the toast is one centred line on a 390-wide phone frame: past about
  // forty-five characters it runs off both edges. It names WHAT fell rather than what it is worth —
  // the money is not yours until the thing is standing on a pad, and saying a number here is the
  // same lie the floating "+$" was.
  const name = MONSTERS[m.type].name;
  toast(name + (bag ? ' chết — rơi món ' + bag.size : ' chết — hết đồ rơi')
             + (back ? ', quay lại sau ' + FOE_RESPAWN + 's' : ''));
}

// ============================================================ items
// TỰ NGẮM. Chạm nhanh một ô đồ là bắn thẳng vào con gần nhất; muốn tự chọn hướng thì
// vẫn giữ ô rồi kéo như cũ — kéo quá vạch chết là quyền tự ngắm trả lại cho ngón tay.
// WHY: trên điện thoại nằm ngang, ngón cái phải giữ ô đồ VÀ xoay hướng cùng lúc trong
//   khi con quái đang chạy tới. Game bắn/MOBA di động không bắt ai làm thế: chạm là
//   trúng, giữ mới là ngắm tay. Trước bản này, một cú chạm không kéo bắn theo p.dir —
//   tức là theo hướng người đang QUAY, gần như không bao giờ trùng hướng con quái.
const AUTO_AIM_RANGE = TILE * 11;      // xa hơn thế thì đạn cũng chưa chắc tới
function autoAimAngle(p, kind, fallback){
  // Chỉ mấy món BẮN/NÉM mới cần ngắm; băng, keo, bình nhẹ thì hướng nào cũng vậy.
  if (kind !== 'gun' && kind !== 'tranq' && kind !== 'bomb') return fallback;
  let best = null, bestScore = Infinity;
  for (const m of S.monsters){
    if (m.hp <= 0) continue;
    if (m.sleep > 0) continue;                       // đang ngủ thì để dành đạn
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > AUTO_AIM_RANGE) continue;
    // Nhìn thấy được thì ưu tiên hẳn: bắn vào tường không giúp được ai.
    const blocked = !losClear(p.x, p.y, m.x, m.y);
    if (blocked && kind !== 'bomb') continue;        // bom còn nảy, đạn thì không
    // Gần nhất thắng, nhưng con đang lao vào mình được cộng điểm — nó mới là con giết mình.
    const chasing = m.state === 'chase' && m.alert > 0;
    const score = d * (chasing ? 0.65 : 1) * (blocked ? 1.6 : 1);
    if (score < bestScore){ bestScore = score; best = m; }
  }
  return best ? Math.atan2(best.y - p.y, best.x - p.x) : fallback;
}

function useSlot(p, i, aimed){
  const it = p.inv[i];
  if (!it || it.uses <= 0 || p.cooldown > 0 || S.dead || p.down) return false;
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
  } else if (it.kind === 'pry'){
    // It only spends a use when there is something to spend it ON. Pressing a slot and losing a
    // charge to empty air is the kind of thing a player never forgives a shop item for.
    const d = nearestLockedDoor(p.x + Math.cos(ang)*PRY_REACH*0.6,
                                p.y + Math.sin(ang)*PRY_REACH*0.6, PRY_REACH);
    if (!d){ toast('Không có cửa kẹt trong tầm với'); return false; }
    breakDoor(d, 'pry');
    it.uses--; p.cooldown = 0.6;
    toast('Phá được cửa');
  } else return false;
  S.lastUse = { kind: it.kind, angle: ang, t: S.time };   // a bullet can hit a wall within one frame
  if (it.uses <= 0) p.inv[i] = null;              // used up, and the slot frees for the locker
  return true;
}
// Fire the thing in your hands, for show. Spends nothing: it is the shop's stock, you have not
// bought it yet, and a demo that costs ammo is a demo nobody takes twice.
function testHeld(p){
  const l = p.held;
  if (!S.shopMode || !l || !l.good || l.good.kind !== 'gear') return false;
  const def = GEAR_BY_KEY[l.good.key];
  if (!def || !def.test || p.cooldown > 0) return false;
  const ang = p.dir;
  if (def.key === 'gun'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*620, vy:Math.sin(ang)*620, life:0.9, kind:'gun' });
    p.cooldown = 0.45;
  } else if (def.key === 'tranq'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520, life:1.0, kind:'tranq' });
    p.cooldown = 0.6;
  } else return false;
  SFX.crack();
  return true;
}
function testableInHand(p){
  const l = p && p.held;
  if (!S.shopMode || !l || !l.good || l.good.kind !== 'gear') return null;
  const def = GEAR_BY_KEY[l.good.key];
  return def && def.test ? def : null;
}
function hasGear(p, key){
  return p.inv.some(it => it && it.kind === key && it.uses > 0);
}
function stepProjectiles(dt){
  for (let i=S.bullets.length-1;i>=0;i--){
    const b = S.bullets[i];
    b.life -= dt;
    const nx = b.x + b.vx*dt, ny = b.y + b.vy*dt;
    // A jammed door is boards nailed across a doorway. It stops your body and it stops your eyes;
    // it has to stop a pistol round too. WHY this needs saying: bullets read the GRID, and a jammed
    // door deliberately does not touch the grid — so without this line it is the one thing in the
    // house you can shoot through but not see through, which is a rule nobody could ever guess.
    // SEE: docs/proposals/repo-2d-topdown.md F22-3.
    if (b.life <= 0 || solidAt((nx/TILE)|0,(ny/TILE)|0) || doorHits(nx, ny, 2)){ S.bullets.splice(i,1); continue; }
    b.x = nx; b.y = ny;
    // Glass is the one thing in this game a tranq dart is as good as a bullet on.
    if (damageMirror(b.x, b.y, 25)){ S.bullets.splice(i,1); continue; }
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
      if (S.mirror){
        for (const pane of [S.mirror.a, S.mirror.b]){
          const dm = Math.hypot(pane.x-b.x, pane.y-b.y);
          if (dm < b.r){ damageMirror(pane.x, pane.y, 90 * (1 - dm/b.r)); break; }
        }
      }
      // A blast that can throw a monster across a room takes a jammed door off its hinges too.
      breakDoorsNear(b.x, b.y, b.r);
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
  // Heads first: the extraction firing is what puts them back on their feet, and they must be out
  // of `placed` before the money is counted so a head never reads as a zero-value haul item.
  reviveFromPad(pad);
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

// ============================================================ the house restocks
// Doc B1 makes a level a haul against a quota, and doc B4 makes missing that quota cost the whole
// run. Put together they produce a board the GAME made unwinnable: break enough on the way to the
// pad and the value left in the house drops under the quota, at which point nothing the player does
// can finish the level. That used to be called — the shift was declared lost and the run ended.
//
// It is now repaired instead. When the last of the reachable value falls under what the quota needs,
// the house quietly puts more out: real loot, on real floor, and never anywhere the player can see
// it appear. Losing the run is kept as the last resort for when there is nowhere left to put any.
//
// You cannot farm it. It only fires when the level has become unwinnable, and it only tops up to a
// little over the quota — always less than was there before something got broken.
const RESTOCK_MARGIN   = 1.12;   // top up to this much of the quota, so one more accident is survivable
const RESTOCK_MIN_D    = 8*TILE; // never closer than this to the player
const RESTOCK_MAX_ITEMS = 14;    // per top-up; past this the level really is beyond saving
const RESTOCK_MAX_TIMES = 4;     // per level

// Somewhere the player is not looking, would not be looking, and is not standing.
// Ranked, best first: a room they have never opened beats a tile they have not walked past, which
// beats any old spot behind them.
function restockSpots(){
  const p = S.player;
  const banned = new Set([0].concat(S.pads.filter(q => !q.done).map(q => q.ri)));
  const out = [];
  for (let gy=1; gy<MH-1; gy++) for (let gx=1; gx<MW-1; gx++){
    const i = gy*MW+gx;
    if (S.grid[i] !== FLOOR) continue;
    const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
    if (banned.has(ri)) continue;
    const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
    if (Math.hypot(x-p.x, y-p.y) < RESTOCK_MIN_D) continue;
    if (hitsSolid(x, y, 14)) continue;                 // room for the biggest piece
    if (losClear(p.x, p.y, x, y)) continue;            // in view — never here
    const roomSeen = S.rooms[ri] && S.rooms[ri].seen;
    out.push({ x, y, rank: (roomSeen ? 1 : 0) + (S.explored[i] ? 1 : 0) });
  }
  out.sort((a,b) => a.rank - b.rank);
  return out;
}

function restockForQuota(){
  if ((S.restocks || 0) >= RESTOCK_MAX_TIMES) return 0;
  const want = S.quotaTotal * RESTOCK_MARGIN - recoverableValue();
  if (want <= 0) return 0;
  const spots = restockSpots();
  if (!spots.length) return 0;

  const rnd = mulberry32((S.seed ^ (0x7f4a7c15 + (S.restocks||0)*2654435761)) >>> 0);
  let added = 0, n = 0;
  while (added < want && n < RESTOCK_MAX_ITEMS && n < spots.length){
    // Weighted toward the big end when the shortfall is big, so a hole worth $9,000 is not filled
    // with forty vases the player has to carry one at a time.
    const short = want - added;
    const roll = rnd();
    const size = SIZES[ short > 4000 ? (roll < 0.55 ? 2 : 1)
                      : short > 1500 ? (roll < 0.6 ? 1 : 0)
                      : 0 ];
    const mat  = MATERIALS[ (rnd()*MATERIALS.length)|0 ];
    const v0   = Math.round(mix(size.vmin, size.vmax, rnd()) / 50) * 50;
    const sp   = spots[n];
    const l = makeLoot(sp.x, sp.y, size, mat, v0);
    l.restocked = true;
    S.loot.push(l);
    added += v0; n++;
  }
  if (n > 0) S.restocks = (S.restocks || 0) + 1;
  return added;
}

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
  // The board just became unwinnable. Try to repair it before calling the shift: the player broke
  // something, which is the game working as designed — it should not also be the end of the run.
  restockForQuota();
  // RE-CHECK, do not assume. "It put something out" is not the same as "the level is winnable
  // again": a top-up is capped per visit and by what floor there is to put things on, so it can
  // fall short. Returning on `added > 0` alone left the player in a house that still could not
  // make quota and no longer had any way to end the shift — a worse trap than the one being fixed.
  if (recoverableValue() + 0.5 >= S.quotaTotal){
    toast('Hình như trong nhà vẫn còn thứ gì đó chưa lấy.');
    return;
  }
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
// Going down. WHY this is no longer `S.dead = true`: the shift now belongs to a crew of four,
// and one of them hitting zero pops their head off rather than closing the level. The shift is
// only lost when there is nobody left standing to pick a head up — see crewWiped().
function die(){
  if (S.dead || !S.player || S.player.down) return;
  downActor(S.player);
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
  S.player.down = false;
  S.mates = [];
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
  S.mates = [];                     // the station is not a job; nobody follows you in
  S.doors = [];                     // and it is one lit hall, not a house of doorways
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
  // NO CART in the station. It is not a convenience here, it is a trap: dropHeld puts a carried
  // thing on the cart in preference to the floor, so a good let go anywhere near it went INTO the
  // cart — and a good in the cart is skipped by the grab search, which left a player who had put
  // more on the checkout than they could afford with no way to take any of it back off.
  // Shopping is six items across a twelve-tile hall; it never needed wheels.
  S.cart = null;

  S.player = S.player || newPlayer();
  // Xe về tới trạm thì ba ô trên tay TRẢ HẾT về tủ — đúng câu ghi trong bảng tủ đồ
  // ("ba ô trên tay bắt đầu ca nào cũng rỗng") và đúng chú thích ở newPlayer().
  // ROOT-CAUSE: trước bản này inv chỉ bị dọn ở resetRun(), tức là chỉ khi bắt đầu
  //   một run mới. Đồ cầm từ ca 1 nằm lại trong tay mãi, nên tới ca 3 là đủ ba ô;
  //   lúc đó bấm món trong tủ chỉ chạy vào nhánh `free < 0` rồi im lặng thoát ra —
  //   người chơi thấy "mua đồ xong không trang bị được, đồ kẹt luôn trong tủ".
  // Không mất gì: đồ về tủ, và tủ giữ nguyên qua mọi ca.
  for (let i = 0; i < S.player.inv.length; i++) {
    if (S.player.inv[i]) { S.stash.push(S.player.inv[i]); S.player.inv[i] = null; }
  }
  S.player.x = truck.x - TILE*1.0; S.player.y = truck.y + TILE*2.0;
  S.player.held = null; S.player.aimSlot = -1; S.player.aimId = -1;
  S.player.pushing = false; S.player.runT = 0; S.player.rushing = false;
  S.player.hp = S.player.hpMax; S.player.stam = S.player.stamMax;
  S.stashOpen = false;

  fxReset();
  S.segs = buildSegments();
  buildDoors();
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


// ============================================================ Kẻ soi gương (the Mirror Master)
// Not a monster in the S.monsters sense, for the same reason the AEngel is not one: it takes no
// damage from anything, ever, and keeping it out of that array makes that true by construction
// rather than by a flag every damage site has to remember to check.
//
// The shape of it: every 30–45 seconds two mirrors appear — one near you, one in another room —
// and two seconds later something walks out of the near one and comes for you. It cannot be shot.
// The mirrors can. Break either one and the thing that came out of it dies and drops what it was
// carrying; fail to, and it reaches you and puts you through the far mirror instead of hurting you.
//
// WHY the mirrors and not the creature (the doc offered both, "tùy theo mức độ khả thi"): making
// the creature itself shootable turns it into a sixth monster with a bigger health bar, and this
// game already has five of those. Making the MIRROR the target means the counter-play is a thing
// you have to look for and reach, the torch keeps its job (light it and it slows down), and a
// player with no gun still has an answer — walk away from mirror A, because the further it gets
// from the glass it came out of, the slower it moves.
const MIRROR_EVERY      = [30, 45];   // seconds between visits
const MIRROR_EMERGE     = 2.0;        // the glass stands there this long before anything comes out
const MIRROR_SPEED      = 58;
const MIRROR_FAR        = 12*TILE;    // distance from mirror A at which it is at its slowest
const MIRROR_SLOW_FLOOR = 0.32;       // and that slowest is this much of its speed
const MIRROR_TORCH_MUL  = 0.42;       // hold the beam on it and it wades
const MIRROR_HP         = 70;         // per mirror — about three pistol rounds
const MIRROR_NEAR       = [4, 7];     // how far from you mirror A lands, in tiles
const MIRROR_GRAB_R     = 20;         // how close it has to get to put you through the far one
const MIRROR_LOOT       = [1500, 3200];
const MIRROR_REPATH     = 0.8;
const MIRROR_R          = 15;         // the pane's own radius, for shots and for drawing

function mirrorNextIn(){ return mix(MIRROR_EVERY[0], MIRROR_EVERY[1], Math.random()); }

// A floor tile inside a given room that nothing is standing in.
function mirrorSpotInRoom(ri){
  const r = S.rooms[ri];
  if (!r) return null;
  for (let i = 0; i < 60; i++){
    const gx = r.cx*RW + 1 + ((Math.random()*(RW-2))|0);
    const gy = r.cy*RH + 1 + ((Math.random()*(RH-2))|0);
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
    if (hitsSolid(x, y, 11)) continue;
    return { x, y, gx, gy, ri };
  }
  return null;
}
function roomOf(x, y){
  const gx = clamp((x/TILE)|0, 0, MW-1), gy = clamp((y/TILE)|0, 0, MH-1);
  return ((gy/RH)|0)*GX + ((gx/RW)|0);
}

function spawnMirrors(){
  const p = S.player;
  // A: near you, and in sight, because the whole beat is that a mirror was not there a moment ago.
  let a = null;
  for (let i = 0; i < 70; i++){
    const ang = Math.random()*Math.PI*2;
    const d = mix(MIRROR_NEAR[0], MIRROR_NEAR[1], Math.random()) * TILE;
    const x = p.x + Math.cos(ang)*d, y = p.y + Math.sin(ang)*d;
    const gx = (x/TILE)|0, gy = (y/TILE)|0;
    if (gx < 1 || gy < 1 || gx >= MW-1 || gy >= MH-1) continue;
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    if (hitsSolid(x, y, 11)) continue;
    if (i < 50 && !losClear(p.x, p.y, x, y)) continue;
    a = { x, y, gx, gy, ri: roomOf(x, y) };
    break;
  }
  if (!a){ S.mirrorTimer = 4; return false; }

  // B: any other room, the start room included — the doc is explicit that being thrown back to
  // the truck is a legal outcome, and it is not always a kind one.
  let b = null;
  const order = [];
  for (let ri = 0; ri < GX*GY; ri++) if (ri !== a.ri) order.push(ri);
  for (let i = order.length-1; i > 0; i--){ const j = (Math.random()*(i+1))|0; const t = order[i]; order[i] = order[j]; order[j] = t; }
  for (const ri of order){ b = mirrorSpotInRoom(ri); if (b) break; }
  if (!b){ S.mirrorTimer = 4; return false; }

  a.hp = MIRROR_HP; a.hpMax = MIRROR_HP;
  b.hp = MIRROR_HP; b.hpMax = MIRROR_HP;
  S.mirror = { t: 0, phase: 'wait', a, b, m: null };
  SFX.warp();
  toast('Có gương trong nhà. Đập vỡ một cái là xong.');
  return true;
}

// The creature dies with its glass: break either pane and whatever came out of the other one has
// nothing holding it here.
function breakMirror(which){
  const mr = S.mirror;
  if (!mr) return;
  const at = mr.m || mr.a;
  const value = Math.round(mix(MIRROR_LOOT[0], MIRROR_LOOT[1], Math.random()) / 50) * 50;
  // The glass is a monster now, so what it leaves is counted against the same three the bodies
  // share, and it is a piece of loot rather than a bag of money for the same reason theirs is.
  // A house where you shot three patrols and then broke a mirror pays for three of those things,
  // not four - otherwise the cap says one number and the house pays another.
  const bag = dropFoeItem(at.x, at.y, value);
  S.mirrorFx = { x: which.x, y: which.y, t: 0, kind: 'break' };
  S.mirror = null;
  S.mirrorTimer = mirrorNextIn();
  S.mirrorGone = true;
  fxShake(9); fxFlash(0.35, '210,230,255'); SFX.chime();
  toast(bag ? 'Gương vỡ - nó tan theo, để lại một món ' + bag.size + '.'
            : 'Gương vỡ - nó tan theo, nhưng nhà này hết đồ rơi rồi.');
}

function damageMirror(x, y, n){
  const mr = S.mirror;
  if (!mr) return false;
  for (const pane of [mr.a, mr.b]){
    if (Math.hypot(pane.x-x, pane.y-y) > MIRROR_R + 4) continue;
    pane.hp -= n;
    fxShake(3);
    if (pane.hp <= 0) breakMirror(pane);
    return true;
  }
  return false;
}

// It reached you. No damage — it puts you through the far pane and starts over.
function mirrorTake(mr, who){
  const p = who || S.player;
  const to = mr.b;
  p.x = to.x; p.y = to.y;
  p.kx = 0; p.ky = 0;
  if (p === S.player){ cam.x = p.x - vwW()/2; cam.y = p.y - vwH()/2; }
  else { p.path = null; p.target = null; p.job = 'idle'; }
  S.mirrorFx = { x: to.x, y: to.y, t: 0, kind: 'warp' };
  S.mirror = null;
  S.mirrorTimer = mirrorNextIn();
  S.mirrorGone = true;
  fxShake(p === S.player ? 12 : 5); fxFlash(0.45, '190,215,255'); SFX.warp();
  toast(p === S.player ? 'Nó đẩy bạn qua gương bên kia.'
                       : 'Nó đẩy ' + p.name + ' qua gương bên kia.');
}

function stepMirror(dt){
  if (S.mirrorFx){ S.mirrorFx.t += dt; if (S.mirrorFx.t > 0.9) S.mirrorFx = null; }
  if (S.shopMode || S.noFoes || S.dead || S.levelDone || S.shiftLost){ S.mirror = null; return; }

  if (!S.mirror){
    if (!rosterHas(MIRROR_KIND)) return;      // same rule as the statue - the arrival is gated, not the thing
    S.mirrorTimer -= dt;
    if (S.mirrorTimer <= 0) spawnMirrors();
    return;
  }
  const mr = S.mirror, p = S.player;
  mr.t += dt;

  if (mr.phase === 'wait'){
    if (mr.t < MIRROR_EMERGE) return;
    mr.phase = 'out';
    mr.m = { x: mr.a.x, y: mr.a.y, dir: Math.atan2(p.y-mr.a.y, p.x-mr.a.x),
             reveal: 0, lit: false, path: null, pi: 0, pathT: 0, born: 0, spotT: SPOT_FX_T };
    fxShake(4); FX.spotT = 1; SFX.sting();
    return;
  }

  const m = mr.m;
  m.born += dt;
  m.spotT = Math.max(0, (m.spotT || 0) - dt);
  m.lit = litByTorch(m.x, m.y);
  // it walks at whoever is nearest and standing; a downed body is not a target
  const live = crewAlive();
  const quarry = live.length
    ? live.reduce((b, a) => Math.hypot(a.x-m.x, a.y-m.y) < Math.hypot(b.x-m.x, b.y-m.y) ? a : b)
    : p;
  const seen = Math.hypot(p.x-m.x, p.y-m.y) < REVEAL_R && losClear(p.x, p.y, m.x, m.y);
  m.reveal = clamp(m.reveal + (seen ? dt/REVEAL_FADE : -dt/REVEAL_FADE), 0, 1);

  // The leash: the further it gets from the glass it walked out of, the less of it there is.
  const away = Math.hypot(m.x-mr.a.x, m.y-mr.a.y);
  const falloff = mix(1, MIRROR_SLOW_FLOOR, clamp(away/MIRROR_FAR, 0, 1));
  const spd = MIRROR_SPEED * falloff * (m.lit ? MIRROR_TORCH_MUL : 1);

  // Route to the player, recomputed on a timer.
  m.pathT -= dt;
  if (!m.path || m.pathT <= 0){
    m.pathT = MIRROR_REPATH;
    const sx = clamp((m.x/TILE)|0, 0, MW-1), sy = clamp((m.y/TILE)|0, 0, MH-1);
    const tgx = clamp((quarry.x/TILE)|0, 0, MW-1), tgy = clamp((quarry.y/TILE)|0, 0, MH-1);
    const path = bfsPath(sx, sy, (x,y) => x === tgx && y === tgy);
    m.path = path ? path.map(([x,y]) => ({ x:(x+0.5)*TILE, y:(y+0.5)*TILE })) : null;
    m.pi = m.path ? Math.min(1, m.path.length-1) : 0;
  }
  let tx = quarry.x, ty = quarry.y;
  if (m.path){
    while (m.pi < m.path.length && Math.hypot(m.path[m.pi].x-m.x, m.path[m.pi].y-m.y) < 10) m.pi++;
    if (m.pi < m.path.length){ tx = m.path[m.pi].x; ty = m.path[m.pi].y; }
  }
  const ax = tx-m.x, ay = ty-m.y, am = Math.hypot(ax,ay) || 1;
  m.dir = Math.atan2(ay, ax);
  moveEnt(m, ax/am*spd*dt, ay/am*spd*dt, 9);

  if (Math.hypot(quarry.x-m.x, quarry.y-m.y) < MIRROR_GRAB_R) mirrorTake(mr, quarry);
}

// The panes in the world pass: a dark frame and a pale sheet. The BRIGHT half of them is drawn in
// the additive pass instead (drawMirrorGlow), which is what makes them "sáng hơn hẳn bóng tối của
// scene nhưng không phát lighting" — they read out of the dark without lighting the floor they
// stand on, because nothing in buildLight ever knows they exist.
function drawMirrors(c){
  const mr = S.mirror;
  if (!mr) return;
  for (const pane of [mr.a, mr.b]){
    const hurt = 1 - clamp(pane.hp/pane.hpMax, 0, 1);
    c.save(); c.translate(pane.x, pane.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0, 13, 13, 4.5, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#2b2f3a';
    c.fillRect(-12, -20, 24, 34);                    // the frame
    c.fillStyle = '#c9d7e6';
    c.fillRect(-9, -17, 18, 28);                     // the glass
    if (hurt > 0.02){
      c.strokeStyle = `rgba(40,46,58,${0.5 + hurt*0.5})`; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-9, -17 + 28*hurt); c.lineTo(2, -6); c.lineTo(-4, 4); c.lineTo(9, 11);
      c.stroke();
    }
    c.restore();
  }
  const m = mr.m;
  if (!m) return;
  c.save(); c.translate(m.x, m.y);
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.ellipse(0, 9, 10, 4.5, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = m.lit ? '#7d8ba0' : '#59617a';
  c.beginPath();
  c.moveTo(-8, 11); c.lineTo(-6, -12); c.lineTo(0, -17); c.lineTo(6, -12); c.lineTo(8, 11);
  c.closePath(); c.fill();
  c.strokeStyle = '#cfe0f0'; c.lineWidth = 1.5; c.globalAlpha = 0.8; c.stroke(); c.globalAlpha = 1;
  c.fillStyle = '#dff0ff';
  c.fillRect(-4.4, -11.4, 3.2, 3.2); c.fillRect(1.4, -11.4, 3.2, 3.2);
  c.restore();
}

// The additive half: the panes glow, the creature that came out of one is legible in the dark, and
// neither of them puts a single lumen on the floor.
function drawMirrorGlow(c){
  const mr = S.mirror;
  if (!mr) return;
  const p = S.player;
  const beat = 0.62 + 0.38*Math.sin(S.time*3.2);
  for (const pane of [mr.a, mr.b]){
    if (!losClear(p.x, p.y, pane.x, pane.y)) continue;
    const k = clamp(pane.hp/pane.hpMax, 0, 1);
    const g = c.createLinearGradient(0, pane.y-17, 0, pane.y+11);
    g.addColorStop(0, `rgba(150,190,235,${0.30*k})`);
    g.addColorStop(1, `rgba(110,150,200,${0.14*k})`);
    c.fillStyle = g; c.fillRect(pane.x-9, pane.y-17, 18, 28);
    glowRing(c, pane.x, pane.y, 17 + beat*2, [150,195,240], 0.42 + beat*0.2, 2.2);
  }
  const m = mr.m;
  if (m && m.reveal > 0.02){
    glowRing(c, m.x, m.y, 15 + beat*3, [190,215,255], (0.5 + beat*0.25)*m.reveal, 2.6);
  }
  const fx = S.mirrorFx;
  if (fx){
    const t = fx.t/0.9;
    c.strokeStyle = `rgba(200,225,255,${(1-t)*0.8})`; c.lineWidth = 2;
    c.beginPath(); c.arc(fx.x, fx.y, 8 + t*52, 0, Math.PI*2); c.stroke();
  }
}


// ============================================================ tổ ba người (the crew)
// Three co-workers who walk into the house with you. They are DELIBERATELY not very good — the
// owner asked for "3 con bot ngu ngu", and the reason that is the right ask rather than a
// concession is that a competent partner would play the level for you. What they are for is the
// feeling that the house is being worked by a crew: someone else's torch swinging in the next
// room, someone else screaming, someone else's head on the floor.
//
// The whole reason they exist mechanically is the rule underneath them: dying is no longer the end
// of the shift. It pops your head off, and somebody has to come and get it.
const MATE_COUNT     = 3;
const MATE_HP        = 80;
const MATE_SPEED     = 84;        // a shade under the player's run, so they never lead the way
const MATE_STR       = 34;
// These four numbers are the difference between "a crew" and "three players who finish the level
// for you". Measured with the player standing still and the house empty: at the first numbers
// (react 0.5-1.5, dither 0.18, no distance cap, no fumbling) the crew alone filled 47%, 109% and
// 0% of the quota across three seeds in 48 seconds — a level they can close out on their own is a
// level you watch. Retuned to leave roughly two thirds of the haul on the floor for the player.
const MATE_REACT     = [1.2, 3.0]; // how long before one of them notices anything has changed
const MATE_DITHER    = 0.42;      // odds that a decision comes out as "stand there for a moment"
const MATE_FLEE_R    = 4.2*TILE;  // they only look up when something is nearly on them
const MATE_REPATH    = 1.0;
const MATE_FOLLOW_R  = [2.5*TILE, 6*TILE];  // how close they hang around you with nothing to do
const MATE_GRAB_R    = 1.9*TILE;
const MATE_LOOT_R    = 6.5*TILE;  // they work the rooms they are in; the far half of the house is yours
const MATE_FUMBLE    = 0.09;      // per second, while carrying: they put it down and forget why
const MATE_BREATHER  = [1.6, 4.0]; // and they stand about after every delivery
const MATE_NAMES     = ['Tổ 2', 'Tổ 3', 'Tổ 4'];

// What they say, drawn as a speech bubble over their head rather than as a toast.
//
// WHY a bubble and not the message line: the message line is where the GAME talks to you — a pad
// opening, a quota met, an AEngel arriving — and burying that under three co-workers chattering
// would cost the player the one channel that carries rules. A bubble is attached to a body, fades
// on its own, and is ignorable, which is exactly what idle chatter should be.
//
// Half of these are pure noise on purpose. A crew that only ever announced useful facts would be a
// HUD in three hats; what makes them read as people is that most of what they say does not matter.
const MATE_CHAT_EVERY = [7, 18];    // seconds between one of them piping up
const MATE_BUBBLE_T   = 2.6;        // and how long it hangs over their head
const MATE_CHAT = {
  idle:   ['🙂', '🥱', '🎵', '🤔', 'ê', 'chán ghê', 'ở đây tối thật', '🚬', 'mai lãnh lương chưa ta',
           'hôm nay ca dài quá', '👀', 'nghe gì không', 'hình như có tiếng', '🫠'],
  loot:   ['💰', '🤑', 'cái này bán được', 'ngon', '👌', 'để tui', 'nặng vãi', '😤'],
  deliver:['📦', 'đem ra bệ đây', 'xong món này', '🏃', 'đi đây đi đây'],
  flee:   ['😱', 'chạy!', '💀', 'ối', 'nó tới kìa', '🏃‍♂️💨', 'không không không'],
  head:   ['🪦', 'còn cái đầu nè', 'chờ tí, tui tới', '😰', 'đừng chết nha'],
  drop:   ['😵', 'ơ, rơi mất', '🙃', 'tay tui sao vậy'],
  hurt:   ['🤕', 'đau!', '😖', 'ai đánh tui vậy']
};
const MATE_COLS      = [
  { body:'#5c6f8a', rim:'#b9cbe0', torch:'#ffe0a0' },
  { body:'#6b5c7d', rim:'#cdbdda', torch:'#ffd9c0' },
  { body:'#4f7060', rim:'#b4d6c3', torch:'#e6ffd8' }
];

// Doc B4 said a lost run costs everything. It still does — but only once EVERY head is on the
// floor. This is the R.E.P.O. rule: the body goes, the head stays, and an extraction that
// completes with a head standing in it puts that worker back on their feet with one point of
// health. See docs/proposals/repo-2d-topdown.md F12 and the wiki cited there.
const HEAD_MASS      = 9;
const HEAD_R         = 9;
const REVIVE_HP      = 1;         // exactly what the source game gives back
const TRUCK_PATCH_HP = 25;        // and what the truck tops you up to at the end of the shift

function makeMate(i, x, y){
  return {
    mate: true, id: i, name: MATE_NAMES[i] || ('Tổ ' + (i+2)), col: MATE_COLS[i % MATE_COLS.length],
    x, y, dir: Math.random()*Math.PI*2,
    hp: MATE_HP, hpMax: MATE_HP, str: MATE_STR, speed: MATE_SPEED,
    held: null, down: false, hurt: 0, hit: 0, kx: 0, ky: 0, wob: Math.random()*7,
    // "ngu ngu", in four numbers: a reaction delay, a chance of dithering, a plan that is only
    // re-checked once a second, and a target chosen from whatever is nearest rather than whatever
    // is worth the most.
    react: mix(MATE_REACT[0], MATE_REACT[1], Math.random()),
    job: 'idle', target: null, roamTo: null, path: null, pi: 0, pathT: 0, think: 0, idleT: 0,
    fleeA: 0, fleeT: 0, noise: 0, sayT: 0,
    bubble: '', bubbleT: 0,
    chatT: mix(MATE_CHAT_EVERY[0], MATE_CHAT_EVERY[1], Math.random())
  };
}

// Everyone in the house who is on your side, dead or alive. The player is always index 0, so a
// caller that only wants "somebody living" can take the first hit and get the human by preference.
function crew(){ return S.player ? [S.player].concat(S.mates || []) : (S.mates || []); }
function crewAlive(){ return crew().filter(a => a && !a.down); }
function isDown(a){ return !a || !!a.down; }

function spawnCrew(){
  S.mates = [];
  if (!S.crewOn) return;
  const p = S.player;
  for (let i = 0; i < MATE_COUNT; i++){
    let x = p.x, y = p.y;
    for (let k = 0; k < 60; k++){
      const a = Math.random()*Math.PI*2, r = mix(TILE*1.6, TILE*4, Math.random());
      const nx = p.x + Math.cos(a)*r, ny = p.y + Math.sin(a)*r;
      if (hitsSolid(nx, ny, 9)) continue;
      x = nx; y = ny; break;
    }
    S.mates.push(makeMate(i, x, y));
  }
}

// ---------------------------------------------------------------- damage, death, heads
// One damage path for everyone. hurtPlayer stays as the player's door into it because a dozen
// call sites and every test already know that name.
function hurtActor(a, n, src, fromX, fromY){
  if (!a || a.down) return;
  if (a === S.player){ hurtPlayer(n, src, fromX, fromY); return; }
  a.hp -= n; a.hurt = 0.45;
  if (fromX !== undefined){
    const away = Math.atan2(a.y-fromY, a.x-fromX);
    const k = Math.min(HIT_KNOCK_MAX, HIT_KNOCK_BASE + n*HIT_KNOCK_PER_DMG);
    a.kx = Math.cos(away)*k; a.ky = Math.sin(away)*k;
  }
  // You hear it happen somewhere in the house even when you cannot see it — that is most of what
  // makes three walking state machines feel like people.
  const far = Math.hypot(a.x-S.player.x, a.y-S.player.y);
  if (far < 16*TILE){ SFX.hit(Math.min(n, 20)); if (far < 8*TILE) fxShake(2); }
  mateChat(a, 'hurt');
  if (a.hp <= 0){ a.hp = 0; downActor(a); }
}

// The head. It is a loot item on purpose: carrying, dropping, loading onto the cart and standing
// on a pad are four systems that already work, and a head has to do all four. Its value is zero,
// so it moves through the quota arithmetic without ever changing it.
function makeHead(a){
  const h = makeLoot(a.x, a.y, SIZES[0], MATERIALS[2], 0);
  h.isHead = true;
  h.who = (a === S.player) ? -1 : a.id;
  h.whoName = (a === S.player) ? 'bạn' : a.name;
  h.mass = HEAD_MASS; h.r = HEAD_R;
  h.value = 0; h.value0 = 0;
  h.grace = S.time + 3;
  h.bob = Math.random()*6;
  return h;
}

function downActor(a){
  if (!a || a.down) return;
  if (a.held) dropHeld(a);
  if (a === S.player && a.pushing) releaseCart(a);
  a.down = true; a.hp = 0;
  a.sprint = false; a.sprinting = false;
  S.loot.push(makeHead(a));
  S.corpses.push({ x:a.x, y:a.y });
  fxShake(a === S.player ? 14 : 6);
  SFX.screech();
  if (a === S.player){
    fxFlash(0.5, '150,20,30');
    toast('Bạn gục rồi. Đầu bạn còn nằm đó — đồng đội phải vác nó tới bệ.');
  } else {
    toast(a.name + ' gục rồi. Đầu nằm lại đó.');
  }
  if (!crewAlive().length) crewWiped();
}

function crewWiped(){
  if (S.dead) return;
  S.dead = true; S.running = false;
  showVeil('Ca trực kết thúc',
    'Cả tổ gục ở màn ' + S.level + '. Còn một người đứng là còn cứu được — hết cả tổ thì mất cả ca.',
    'Làm lại từ màn 1', () => { resetRun(); startLevel(); });
}

// An extraction that completes with a head standing in it puts that worker back up. One point of
// health, which is the source game's number and is meant to feel like a reprieve rather than a
// reset — see the wiki link in the proposal.
function reviveFromPad(pad){
  let n = 0;
  for (const l of pad.placed.slice()){
    if (!l.isHead || l.gone) continue;
    const a = (l.who === -1) ? S.player : (S.mates || []).find(m => m.id === l.who);
    l.gone = true;
    const i = pad.placed.indexOf(l); if (i >= 0) pad.placed.splice(i, 1);
    if (!a || !a.down) continue;
    a.down = false; a.hp = REVIVE_HP; a.hurt = 0;
    if (a === S.player) S.spectate = -1;
    a.x = pad.x + (Math.random()-0.5)*TILE; a.y = pad.y + (Math.random()-0.5)*TILE;
    a.kx = a.ky = 0;
    if (a === S.player){ a.stam = a.stamMax; a.blindT = 0; a.slowT = 0; a.stunT = 0; }
    n++;
    toast((a === S.player ? 'Bạn' : a.name) + ' đứng dậy — còn ' + REVIVE_HP + ' máu.');
  }
  if (n) { fxFlash(0.4, '180,230,255'); SFX.chime(); }
  return n;
}

// The truck at the end of the shift patches everyone up to a number you can walk on. Anyone still
// on the floor when the doors close stays down until the next house.
function truckPatchUp(){
  for (const a of crew()){
    if (!a) continue;
    if (a.down){ a.down = false; a.hp = TRUCK_PATCH_HP; }
    else if (a.hp < TRUCK_PATCH_HP) a.hp = TRUCK_PATCH_HP;
  }
}

// ---------------------------------------------------------------- the crew's own heads
function looseHeads(){
  return S.loot.filter(l => l.isHead && !l.gone && !l.held && !l.inCart && !l.onPad);
}
function headBeingCarried(){
  return S.loot.filter(l => l.isHead && !l.gone && (l.held || l.inCart));
}

// ---------------------------------------------------------------- the AI
function mateThreat(a){
  let worst = null, wd = 1e9;
  for (const m of S.monsters){
    if (m.sleep > 0) continue;
    const d = Math.hypot(m.x-a.x, m.y-a.y);
    if (m.state !== 'chase' && d > 3*TILE) continue;
    if (d < wd){ wd = d; worst = m; }
  }
  const mr = S.mirror;
  if (mr && mr.m){
    const d = Math.hypot(mr.m.x-a.x, mr.m.y-a.y);
    if (d < wd && d < MATE_FLEE_R){ wd = d; worst = mr.m; }
  }
  return worst ? { m:worst, d:wd } : null;
}

function matePath(a, tx, ty){
  a.pathT = MATE_REPATH;
  const sx = clamp((a.x/TILE)|0, 0, MW-1), sy = clamp((a.y/TILE)|0, 0, MH-1);
  const gx = clamp((tx/TILE)|0, 0, MW-1), gy = clamp((ty/TILE)|0, 0, MH-1);
  const path = bfsPath(sx, sy, (x,y) => x === gx && y === gy);
  a.path = path ? path.map(([x,y]) => ({ x:(x+0.5)*TILE, y:(y+0.5)*TILE })) : null;
  a.pi = a.path ? Math.min(1, a.path.length-1) : 0;
  return !!a.path;
}

// Walk the current path. Returns true while there is still somewhere to go.
function mateWalk(a, dt, spd){
  if (!a.path) return false;
  while (a.pi < a.path.length && Math.hypot(a.path[a.pi].x-a.x, a.path[a.pi].y-a.y) < 12) a.pi++;
  if (a.pi >= a.path.length){ a.path = null; return false; }
  const wp = a.path[a.pi];
  const dx = wp.x-a.x, dy = wp.y-a.y, d = Math.hypot(dx,dy) || 1;
  a.dir = Math.atan2(dy, dx);
  const before = { x:a.x, y:a.y };
  moveEnt(a, dx/d*spd*dt, dy/d*spd*dt, 8);
  if (Math.hypot(a.x-before.x, a.y-before.y) < spd*dt*0.25){
    a.stuck = (a.stuck || 0) + dt;
    if (a.stuck > 0.8){ a.stuck = 0; a.path = null; a.pathT = 0; }   // wedged: think again
  } else a.stuck = 0;
  return true;
}

function mateSpeed(a){
  const w = a.held ? a.held.mass : 0;
  return Math.max(a.speed * 0.4, a.speed / (1 + w / Math.max(1, a.str)));
}

// One bubble at a time per worker. `force` is for the things that are actually happening to them
// (a scream, a dropped crate) — those jump the idle queue but still cannot stack.
function mateSay(a, msg, force){
  if (!force && a.sayT > 0) return;
  a.sayT = 3.5;
  a.bubble = msg;
  a.bubbleT = MATE_BUBBLE_T;
}
function mateChat(a, kind){
  const lines = MATE_CHAT[kind] || MATE_CHAT.idle;
  mateSay(a, lines[(Math.random()*lines.length)|0], kind !== 'idle');
}

function stepMates(dt){
  if (S.shopMode || !S.mates || !S.mates.length) return;
  for (const a of S.mates){
    a.wob += dt*4;
    a.hurt = Math.max(0, a.hurt - dt);
    a.hit = Math.max(0, a.hit - dt);
    a.sayT = Math.max(0, a.sayT - dt);
    a.bubbleT = Math.max(0, a.bubbleT - dt);
    if (a.bubbleT <= 0) a.bubble = '';
    if (a.kx || a.ky){
      moveEnt(a, a.kx*dt, a.ky*dt, 8);
      a.kx *= Math.pow(0.02, dt); a.ky *= Math.pow(0.02, dt);
      if (Math.abs(a.kx) < 2) a.kx = 0;
      if (Math.abs(a.ky) < 2) a.ky = 0;
    }
    if (a.down){ a.noise = 0; a.bubble = ''; continue; }
    // Idle chatter, on its own clock. It says nothing useful most of the time, which is the point.
    a.chatT -= dt;
    if (a.chatT <= 0){
      a.chatT = mix(MATE_CHAT_EVERY[0], MATE_CHAT_EVERY[1], Math.random());
      const kind = a.job === 'flee' ? 'flee'
                 : a.held && a.held.isHead ? 'head'
                 : a.held ? 'deliver'
                 : a.job === 'loot' ? 'loot' : 'idle';
      mateChat(a, kind);
    }
    if (S.levelDone || S.shiftLost){
      // Shift over: they head for the truck like everyone else.
      a.job = 'truck';
    }
    a.react = Math.max(0, a.react - dt);
    a.pathT -= dt;
    a.idleT = Math.max(0, a.idleT - dt);

    // ---- 1. something is on them. This is the only thing that outranks the job.
    const th = mateThreat(a);
    if (th && th.d < MATE_FLEE_R){
      a.job = 'flee'; a.path = null;
      a.noise = 2;
      // Drop anything heavy — except a head. They will not leave a colleague on the floor, which
      // is the one thing about them that is not dumb.
      if (a.held && !a.held.isHead && a.held.mass > 20) dropHeld(a);
      a.fleeT -= dt;
      if (a.fleeT <= 0){
        const base = Math.atan2(a.y-th.m.y, a.x-th.m.x);
        let best = base, bestScore = -1;
        for (let i = -3; i <= 3; i++){
          const ang = base + i*0.42;
          let clear = true;
          for (let t = 0.2; t <= 1.001; t += 0.2)
            if (hitsSolid(a.x + Math.cos(ang)*3.5*TILE*t, a.y + Math.sin(ang)*3.5*TILE*t, 9)){ clear = false; break; }
          const sc = (clear ? 10 : 0) - Math.abs(i)*0.5;
          if (sc > bestScore){ bestScore = sc; best = ang; }
        }
        a.fleeA = best; a.fleeT = 0.7;
        mateChat(a, 'flee');
      }
      a.dir = a.fleeA;
      const sp = mateSpeed(a) * 1.15;
      moveEnt(a, Math.cos(a.fleeA)*sp*dt, Math.sin(a.fleeA)*sp*dt, 8);
      continue;
    }

    // ---- 1b. butterfingers. Never a head — they will not put a colleague down to scratch.
    if (a.held && !a.held.isHead && Math.random() < MATE_FUMBLE*dt){
      dropHeld(a);
      a.job = 'idle'; a.target = null; a.path = null;
      a.idleT = 0.5 + Math.random();
      mateChat(a, 'drop');
    }

    // ---- 2. dithering. A third of their decisions come out as standing still looking at a wall.
    if (a.idleT > 0){ a.noise = 0; continue; }

    // ---- 3. pick a job, but only when they get round to it
    if (a.react <= 0 && (!a.path || a.pathT <= 0 || !a.target)){
      a.react = mix(MATE_REACT[0], MATE_REACT[1], Math.random());
      if (Math.random() < MATE_DITHER){ a.idleT = 0.6 + Math.random()*1.2; a.path = null; continue; }
      mateChooseJob(a);
    }

    // ---- 4. do it
    const pad = S.pads[S.padIndex];
    const spd = mateSpeed(a);
    a.noise = 1;
    if (a.job === 'head' && a.target){
      const h = a.target;
      if (h.gone || h.held || h.onPad){ a.target = null; a.path = null; a.job = 'idle'; continue; }
      if (Math.hypot(h.x-a.x, h.y-a.y) < MATE_GRAB_R){
        if (!a.held){ mateTake(a, h); mateChat(a, 'head'); }
        a.target = null; a.path = null; a.job = 'idle';
        continue;
      }
      if (!a.path && !matePath(a, h.x, h.y)){ a.target = null; a.job = 'idle'; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'deliver' && pad && !pad.done){
      if (Math.abs(a.x-pad.x) < TILE*1.5 && Math.abs(a.y-pad.y) < TILE*1.5){
        if (a.held) mateDrop(a, pad);
        a.job = 'idle'; a.path = null; a.target = null;
        a.idleT = mix(MATE_BREATHER[0], MATE_BREATHER[1], Math.random());   // a breather, every time
        continue;
      }
      if (!a.path && !matePath(a, pad.x, pad.y)){ a.job = 'idle'; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'loot' && a.target){
      const l = a.target;
      if (l.gone || l.held || l.inCart || l.onPad){ a.target = null; a.job = 'idle'; continue; }
      if (Math.hypot(l.x-a.x, l.y-a.y) < MATE_GRAB_R){
        if (!a.held) mateTake(a, l);
        a.target = null; a.path = null; a.job = 'idle';
        continue;
      }
      if (!a.path && !matePath(a, l.x, l.y)){ a.target = null; a.job = 'idle'; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'roam' && a.roamTo){
      if (Math.hypot(a.roamTo.x-a.x, a.roamTo.y-a.y) < TILE*1.2){
        a.job = 'idle'; a.roamTo = null; a.path = null; continue;
      }
      if (!a.path && !matePath(a, a.roamTo.x, a.roamTo.y)){ a.job = 'idle'; a.roamTo = null; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'truck'){
      if (Math.hypot(a.x-S.car.x, a.y-S.car.y) < TILE*2.2){ a.noise = 0; continue; }
      if (!a.path && !matePath(a, S.car.x, S.car.y)) { a.noise = 0; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    // ---- 5. nothing to do: hang around the player, badly
    const p = S.player;
    const d = Math.hypot(a.x-p.x, a.y-p.y);
    if (d > MATE_FOLLOW_R[1]){
      if (!a.path) matePath(a, p.x, p.y);
      mateWalk(a, dt, spd);
    } else if (d > MATE_FOLLOW_R[0]){
      const ang = Math.atan2(p.y-a.y, p.x-a.x);
      a.dir = ang;
      moveEnt(a, Math.cos(ang)*spd*0.6*dt, Math.sin(ang)*spd*0.6*dt, 8);
      a.noise = 0.6;
    } else {
      a.noise = 0.25;
      a.think -= dt;
      if (a.think <= 0){ a.think = 1.2 + Math.random()*2; a.dir = Math.random()*Math.PI*2; }
    }
  }
}

// What a mate decides to do next. The order is the whole personality: a colleague on the floor
// first, then whatever is in their hands, then the nearest shiny thing — never the most valuable
// one, because working that out is exactly the kind of thinking they do not do.
function mateChooseJob(a){
  const pad = S.pads[S.padIndex];
  if (S.levelDone || S.shiftLost){ a.job = 'truck'; a.path = null; return; }

  if (a.held){ a.job = 'deliver'; a.path = null; a.target = null; return; }

  const heads = looseHeads();
  if (heads.length){
    // whoever is closest to it claims it, so all three do not stampede the same head
    let best = null, bd = 1e9;
    for (const h of heads){
      const mine = Math.hypot(h.x-a.x, h.y-a.y);
      let closer = false;
      for (const o of S.mates){
        if (o === a || o.down) continue;
        if (o.target === h && Math.hypot(h.x-o.x, h.y-o.y) <= mine){ closer = true; break; }
      }
      if (closer) continue;
      if (mine < bd){ bd = mine; best = h; }
    }
    if (best){ a.job = 'head'; a.target = best; a.path = null; return; }
  }

  if (!pad || pad.done){ a.job = 'idle'; a.target = null; a.path = null; return; }
  let best = null, bd = MATE_LOOT_R;
  for (const l of S.loot){
    if (l.gone || l.held || l.inCart || l.onPad || l.isHead) continue;
    if (l.sizeIdx >= SIZES.length-1 && Math.random() < 0.5) continue;   // big ones look like work
    const d = Math.hypot(l.x-a.x, l.y-a.y);
    if (d < bd){ bd = d; best = l; }
  }
  if (best){ a.job = 'loot'; a.target = best; a.path = null; return; }

  // Nothing worth walking to from here. They do NOT stand in the start room waiting for loot to
  // come to them — capping how far they will fetch (MATE_LOOT_R) without this made them freeze
  // solid the moment the room they woke up in was empty, and a crew that delivers nothing is not
  // a crew. They pick a room and go and have a look, which is what puts loot back in range.
  a.job = 'roam'; a.target = null; a.path = null;
  for (let i = 0; i < 30; i++){
    const ri = (Math.random()*(GX*GY))|0;
    const r = S.rooms[ri];
    if (!r) continue;
    const gx = r.cx*RW + 1 + ((Math.random()*(RW-2))|0);
    const gy = r.cy*RH + 1 + ((Math.random()*(RH-2))|0);
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    const x = (gx+0.5)*TILE, y = (gy+0.5)*TILE;
    if (hitsSolid(x, y, 9)) continue;
    a.roamTo = { x, y };
    return;
  }
  a.job = 'idle';
}

function mateTake(a, l){
  l.held = true; l.holder = a;
  l.grace = S.time + GRACE_AFTER_PICKUP;
  l.vx = l.vy = 0;
  l.freeX = a.x + Math.cos(a.dir)*(l.r+12);
  l.freeY = a.y + Math.sin(a.dir)*(l.r+12);
  a.held = l;
}
function mateDrop(a, pad){
  const l = a.held;
  if (!l) return;
  l.held = false; l.holder = null; l.vx = l.vy = 0;
  l.grace = S.time + 0.35;
  a.held = null;
  if (pad && pad.active && !pad.done &&
      Math.abs(l.x-pad.x) < TILE*1.9 && Math.abs(l.y-pad.y) < TILE*1.9){
    l.onPad = pad; pad.placed.push(l); recomputePad(pad);
    if (l.isHead) toast(a.name + ' đặt đầu ' + (l.whoName||'') + ' lên bệ.');
    else if (l.value > 0) toast(a.name + ' đặt ' + money(l.value) + ' lên bệ.');
  }
}

// ---------------------------------------------------------------- drawing
function drawMates(c){
  if (S.shopMode || !S.mates) return;
  for (const a of S.mates){
    if (a.down) continue;
    if (a.bubble && a.bubbleT > 0){
      // Drawn in the WORLD pass, so a colleague chattering two rooms away in the dark is a sound
      // you do not get to read. You have to be near them, or have a light on them.
      const fade = Math.min(1, a.bubbleT/0.6);
      c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
      const w = c.measureText(a.bubble).width + 12;
      c.fillStyle = `rgba(18,20,24,${0.72*fade})`;
      c.fillRect(a.x - w/2, a.y - 30, w, 16);
      c.fillStyle = `rgba(226,232,236,${fade})`;
      c.fillText(a.bubble, a.x, a.y - 18);
      c.textAlign = 'left';
    }
    c.save(); c.translate(a.x, a.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0, 8, 9, 4, 0, 0, Math.PI*2); c.fill();
    c.rotate(a.dir);
    c.fillStyle = a.hurt > 0 ? '#c86a60' : a.col.body;
    c.beginPath(); c.arc(0, 0, 6.4, 0, Math.PI*2); c.fill();
    c.strokeStyle = a.col.rim; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = a.col.torch; c.fillRect(5.5, -1.4, 4.5, 2.8);
    c.restore();
  }
}

// Their torches. Small, warm and cheap: a mate is a light source you can see two rooms away, which
// is most of what makes the house feel occupied. Drawn INSIDE the player's own visibility clip in
// buildLight, so a wall still stops it.
function mateLights(c){
  if (S.shopMode || !S.mates) return;
  for (const a of S.mates){
    if (a.down) continue;
    if (Math.hypot(a.x-S.player.x, a.y-S.player.y) > LOS_R*1.1) continue;
    const r = 3.2*TILE;
    const g = c.createRadialGradient(a.x, a.y, 2, a.x, a.y, r);
    g.addColorStop(0, 'rgba(226,214,180,0.34)');
    g.addColorStop(1, 'rgba(226,214,180,0)');
    c.fillStyle = g; c.fillRect(a.x-r, a.y-r, r*2, r*2);
  }
}

// A head on the floor is the single most important thing on the screen when there is one, and it
// is by definition somewhere you are not. So: it glows through the dark like an aggro'd monster
// does, and it gets a dot on the minimap.
function drawHeadGlow(c){
  if (S.shopMode) return;
  const beat = 0.62 + 0.38*Math.sin(S.time*3.2);
  const eye = viewer() || S.player;
  for (const h of S.loot){
    if (!h.isHead || h.gone || h.inCart) continue;
    if (!losClear(eye.x, eye.y, h.x, h.y)) continue;
    glowRing(c, h.x, h.y, 12 + beat*3, [235,120,120], 0.5 + beat*0.28, 2.4);
  }
  for (const a of (S.mates || [])){
    if (a.down) continue;
    if (!inSight(a.x, a.y)) continue;
    glowRing(c, a.x, a.y, 13, [150,200,235], 0.28, 1.6);
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
    if (k === ' '){ toggleSprint(); return; }
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
    // Claimed unconditionally, and released in exactly one place. Claiming per-branch would be more
    // precise and is exactly the kind of thing the next branch forgets to do — which is how this bug
    // existed in the first place. A press on the play surface is a hand on the game, never a gaze.
    claimPointer(e.pointerId);
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
    if (S.player && !S.shopMode &&
        Math.hypot(p.x-hud.sprint.x, p.y-hud.sprint.y) < hud.sprint.r*1.25){
      toggleSprint(); return;
    }
    if (S.player && nearTruck(S.player) &&
        Math.hypot(p.x-hud.stash.x, p.y-hud.stash.y) < hud.stash.r*1.25){
      toggleStash(); return;
    }
    if (S.shopMode && S.player &&
        Math.hypot(p.x-hud.test.x, p.y-hud.test.y) < hud.test.r*1.25){
      if (!testHeld(S.player)) toast('Cầm một khẩu súng lên rồi bấm thử.');
      return;
    }
    // item slots first: a press that STARTS on a slot is aiming, not looking (doc C2-5)
    // WHY the guard: hudLayout returns NO slots in the station — they are a house control — and
    // this loop read hud.slots[i] anyway. The throw happened before the stick could be created, so
    // in the station every touch died on the way in and the player could not move at all. A
    // keyboard still worked, which is exactly why it survived: the desktop path never runs this.
    // ROOT-CAUSE: a control list that is legitimately empty in one mode was iterated by a fixed
    // count instead of by its own length.
    // SEE: docs/proposals/repo-2d-topdown.md F14-1.
    for (let i=0;i<hud.slots.length;i++){
      const s = hud.slots[i];
      if (!s) continue;
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
      // The MOVE stick does not move. Its origin is the middle of the ring that is painted in the
      // corner — the same one, every time — so what you push against is a thing you can see, and
      // the ring never wanders across the buttons above it.
      // WHY it is not the floating stick it briefly was: floating fixed the steering (an origin
      // frozen at the first touch ignores late corrections), but it fixed it by putting the ring
      // wherever the thumb happened to land, which covered the HUD. A ring that is FIXED and VISIBLE
      // has neither problem: corrections are measured from a point the player is looking at.
      if (p.x < hud.w*0.5){ stickL = { id:e.pointerId, ox:hud.left.x, oy:hud.left.y, x:p.x, y:p.y }; }
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
    releasePointer(e.pointerId);
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
        const it = pl.inv[pl.aimSlot];
        // Kéo đi đâu thì bắn đi đó. Chạm nhanh không kéo thì để máy ngắm hộ.
        useSlot(pl, pl.aimSlot,
          far ? Math.atan2(dy,dx) : autoAimAngle(pl, it && it.kind, pl.dir));
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
    if (heldPointers.has(e.pointerId)) return;   // this hand is on a control, not looking anywhere
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

// WHICH POINTERS ARE A HAND ON A CONTROL. A pointer in here is holding a stick or a button, and
// must never ALSO be read as a gaze.
//
// WHY this exists: this game has three input roles — move, look, act — and a desktop player has one
// mouse. A press assigned that mouse to a control (the code even calls setPointerCapture on it and
// stores its id on the stick), but the look reader went on reading every mouse move over the canvas
// regardless. So dragging the on-screen MOVE stick with the mouse also aimed the look at the cursor
// — which is sitting on the stick, in the bottom-left corner — and the character faced down-left
// the entire time it was being driven. Measured: pushed in eight directions around the ring, the
// facing stayed within 107-119 degrees the whole way round, and jittered as the cursor circled.
// Whatever was being carried hung down-left too, because a carried object is pinned to the facing.
// ROOT-CAUSE: a pointer had no OWNER. Ownership was an unwritten convention that each consumer of
// pointer input had to remember, and the look consumer never did.
// SEE: this is the bug behind BOTH "dragging loot gets pulled down" and "it keeps rotating with the
// move joystick"; present since the first playable build (verified against commit 21c0ad0).
const heldPointers = new Set();
function claimPointer(id){
  heldPointers.add(id);
  // The look device has just been taken away to do something else. Doc C2-2: the facing then
  // FREEZES where it is. Without this the last cursor position keeps aiming for another second,
  // which is the same bug with a shorter tail.
  mouseMovedAt = -1e9;
}
function releasePointer(id){ heldPointers.delete(id); }
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
// Khung dọc 9:16 khi chỗ trống cao hơn rộng, và 16:9 khi ngược lại — người chơi xoay
// máy ngang thì được chơi ngang thật, chứ không phải nhìn một dải dọc hẹp giữa màn hình.
const FRAME_W = 9, FRAME_H = 16;
function frameAspect(aw, ah){ return aw > ah ? [FRAME_H, FRAME_W] : [FRAME_W, FRAME_H]; }
function fitCanvas(){
  const cv = CV(), box = cv.parentElement;
  if (!box) return;
  // clientWidth/Height INCLUDE padding, and the surround holds back the notch insets as padding.
  const cs = getComputedStyle(box);
  const aw = box.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = box.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
  if (!(aw > 0) || !(ah > 0)) return;
  const land = aw > ah;
  let w, h;
  if (land) {
    // Tràn hết chỗ trống, không ép 16:9 — hai vệt đen hai bên là bề ngang bị vứt đi,
    // mà nằm ngang thì bề ngang là thứ duy nhất đang dư. Không chặn tỉ lệ: rộng bao
    // nhiêu ăn bấy nhiêu. Zoom neo theo cạnh ngắn nên màn càng rộng chỉ càng nhìn xa
    // sang hai bên, người vẫn giữ nguyên cỡ.
    w = aw; h = ah;
  } else {
    const k = Math.min(aw/FRAME_W, ah/FRAME_H);
    w = k*FRAME_W; h = k*FRAME_H;
  }
  cv.style.width  = Math.round(w) + 'px';
  cv.style.height = Math.round(h) + 'px';
  document.body.classList.toggle('landscape', land);
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
  if (w > h) return hudLayoutLandscape(w, h);
  const pad = Math.min(w,h) * 0.05;
  const R   = Math.min(w,h) * 0.115;      // stick radius — a thumb's comfortable throw
  const sr  = R * 0.44;                   // button radius
  const left  = { x: pad + R, y: h - pad - R, r: R };
  const right = { x: w - pad - R, y: h - pad - R, r: R };

  // Everything below this line belongs to the sticks. Buttons start above it.
  const thumbY = h - (pad + 2*R + 10);

  // ------------------------------------------------------------------ hand-placed controls
  // The block below was ARRANGED BY HAND in the Unity build's layout tool and copied here, so the
  // two builds put the same control in the same place. The numbers are measured against the 540-wide
  // frame the interface is designed for, and K scales them to whatever frame is actually on screen —
  // the same way pad and R already scale, so nothing here is pinned to one phone.
  // Where they came from: repo2d-unity/Assets/Resources/UI/Layout.asset.
  //
  // What the code used to decide, and no longer does: the slots ran up the right edge in a column
  // and the three buttons stacked above the left stick. Both are now wherever the owner put them.
  // The reasoning those positions were chosen FOR is kept below, because it is still the reason a
  // future change should be argued about rather than the reason these numbers are what they are.
  const K = Math.min(w,h) / 540;

  // The three hand slots are a HOUSE control: in the station you are shopping, not fighting, and
  // three dead buttons on the edge of the screen are three things in the way. They are replaced by
  // one button that fires whatever you have picked up off the shelf.
  // Hand-placed: an arc sweeping up and left out of the bottom-right corner, rather than a column.
  const SLOT_AT = [ {x:-55, y:196}, {x:-120, y:184}, {x:-173, y:144} ];   // x is inset from the RIGHT
  const slots = S.shopMode ? [] : [0,1,2].map(i => ({
    x: w + SLOT_AT[i].x*K,
    y: h - SLOT_AT[i].y*K,
    r: sr, i
  }));
  const test = { x: 299*K, y: h - 228*K, r: sr*1.3 };
  // Grab is on the thumb that grabs (doc C2-4 — grabbing needs no aim). It used to sit up and in
  // from the LEFT corner, so reaching for it was a deliberate move away from the move stick.
  const grab  = { x: 298*K, y: h - 152*K, r: sr*1.25 };
  // Chạy nước rút is a MOVEMENT control and a toggle, so the press is a tap a thumb can make on its
  // way back to the stick rather than something it has to hold.
  const sprint = { x: 295*K, y: h - 58*K, r: sr*1.25 };
  // The locker only appears when the truck is within reach — it is a start-room action, not a field one.
  const stash = { x: 300*K, y: h - 227*K, r: sr*1.25 };
  // Where a raised item goes to be put back down: the top-right corner, the way a mobile MOBA does
  // it. It is the furthest point from the thumb that raised it, and on the way to nowhere else.
  const cancel = { x: w - pad - sr*1.6, y: pad + sr*1.6, r: sr*1.6 };
  // The heart belongs WITH the controls, not tucked in a corner beside the health bar where nobody
  // found it. Centre-bottom, just above the thumb band: between the two sticks, clear of every
  // button, and squarely in the middle of where the eyes already are.
  const heart = { x: w/2, y: h - 319*K, r: Math.min(w,h)*0.075 };
  return { w, h, left, right, slots, grab, sprint, stash, cancel, heart, test, pad, thumbY, aimR: R,
           msgY: Math.min(stash.y - stash.r, heart.y - heart.r) - 14 };
}

// Bố cục riêng cho MÁY NẰM NGANG, dựng theo cách game di động màn ngang làm
// (Liên Quân, PUBG Mobile): cần gạt ở hai góc dưới, cụm nút vòng cung hất lên
// và vào trong quanh cần phải, mọi thứ khác dạt hết ra mép — và GIỮA MÀN HÌNH
// KHÔNG CÓ GÌ.
// ROOT-CAUSE của bản trước: nó dùng chung bố cục dọc, mà bố cục dọc lấy
//   K = min(w,h)/540 và neo mọi nút theo K. Nằm ngang thì min(w,h) là CHIỀU CAO
//   (~320px thay vì ~690px), nên K tụt gần một nửa: nút teo lại còn ~32px và cả
//   bốn nút dồn về cùng một cột x≈176 vì hoành độ của chúng cũng nhân K. Bề ngang
//   dư ra 500px thì không ai dùng. Trái tim thì đặt ở y = h - 319*K, dọc thì nằm
//   sát đáy, ngang thì rơi đúng giữa màn hình và che mặt người chơi.
function hudLayoutLandscape(w, h){
  const pad = h * 0.05;
  const R   = h * 0.17;                   // cần gạt to hơn hẳn: ngón cái cần chỗ để quăng
  const sr  = R * 0.44;
  const left  = { x: pad + R, y: h - pad - R, r: R };
  const right = { x: w - pad - R, y: h - pad - R, r: R };
  const thumbY = h - (pad + 2*R + 10);

  // MỌI NÚT BẤM TRONG LÚC CHẠY ĐỀU THUỘC TAY PHẢI. Tay trái ôm cần di chuyển và
  // không được rời ra: chạy nước rút, nhặt đồ và dùng đồ đều là thứ phải bấm TRONG
  // KHI đang chạy, nên chúng nằm quanh cần phải cho ngón cái phải với tới.
  // WHY: bản trước để chạy/nhặt bên trái. Muốn vừa chạy vừa nhặt thì ngón trái phải
  //   nhả cần ra bấm — nhả cần là đứng lại, mà đứng lại giữa lúc con quái đuổi là
  //   chết. Game bắn/MOBA di động không ai bày như thế.
  // Cả cụm nằm TRÊN vạch thumbY: dải dưới cùng là của hai cần gạt, không ai được
  // đặt nút vào đó.
  // Gom thành KHỐI HAI CỘT sát góc phải dưới, không toả hình quạt vào giữa màn.
  // WHY: quạt trải rộng tới 64% bề ngang, tức là nút nằm chình ình giữa chỗ đang
  //   chơi. PUBG/Liên Quân màn ngang gom hết vào một dải mép phải chừng một phần ba
  //   bề ngang — giữa màn tuyệt đối trống. Khối này chiếm 31%.
  // Nút cũng nhỏ lại một nấc (đường kính ~53px thay vì ~60px): khung ngang chỉ cao
  // ~320px nên nút 60px ăn gần một phần năm chiều cao, to hơn cả nút thật của PUBG
  // tính theo tỉ lệ. 53px vẫn thừa cho đầu ngón cái.
  const cx = w - pad - R, cy = h - pad - R;
  const colA = cx - R*1.75;               // cột trong, gần cần phải
  const colB = cx - R*3.10;               // cột ngoài
  const rowA = h - pad - sr*1.35;         // hàng dưới, sát đáy
  const rowB = rowA - sr*3.10;
  const rowC = rowA - sr*6.20;            // hàng trên, vẫn lọt dưới bản đồ nhỏ
  const slots = S.shopMode ? [] : [
    { x: colB, y: rowA, r: sr*1.10, i: 0 },
    { x: colB, y: rowB, r: sr*1.10, i: 1 },
    { x: colB, y: rowC, r: sr*1.10, i: 2 }
  ];
  // Gần cần phải nhất là nút bấm nhiều nhất.
  const grab   = { x: colA, y: rowA, r: sr*1.15 };
  const sprint = { x: colA, y: rowB, r: sr*1.15 };
  // Tủ đồ và Bắn thử loại trừ nhau nên dùng chung ô trên cùng của cột trong.
  const stash  = { x: colA, y: rowC, r: sr*1.15 };
  const test   = { x: colA, y: rowC, r: sr*1.20 };
  // Chỗ bỏ món đang giơ: mép TRÊN giữa màn — xa nhất khỏi ngón vừa giơ nó lên,
  // và không đụng thanh máu (trên trái) lẫn bản đồ nhỏ (trên phải).
  const cancel = { x: w * 0.5, y: pad + sr*1.7, r: sr*1.7 };
  // Trái tim xuống MÉP DƯỚI giữa hai cần gạt. Vẫn nằm trong tầm mắt như chủ ý cũ,
  // nhưng không còn đứng chắn giữa màn chơi.
  const heart = { x: w * 0.5, y: h - pad - h*0.075, r: h*0.062 };
  return { w, h, left, right, slots, grab, sprint, stash, cancel, heart, test, pad, thumbY, aimR: R,
           msgY: heart.y - heart.r - 12 };
}
// Scaled with the truck: the locker button appears when you are standing AT it, and "at it" got
// bigger when the thing itself did.
function nearTruck(p){ return Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*3.6; }

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
  p.blindT = Math.max(0, p.blindT - dt);
  p.slowT = Math.max(0, p.slowT - dt);

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
      // Measured from the middle of the painted ring, every frame. No trailing and no memory of
      // where the thumb first landed: the reference point is on screen, so a correction is exactly
      // as big as it looks.
      const maxD = hudLayout().left.r;
      const dx = stickL.x-stickL.ox, dy = stickL.y-stickL.oy;
      const d = Math.hypot(dx,dy);
      if (d > maxD*STICK_DEAD){ vx = dx/d; vy = dy/d; push = clamp(d/maxD, 0, 1); }
    }
  }

  // Rook's slam pins you where you landed. Nothing you press moves you while it lasts.
  p.stunT = Math.max(0, (p.stunT || 0) - dt);
  if (p.stunT > 0){ vx = 0; vy = 0; push = 0; p.sprint = false; }
  // And a head on the floor steers nothing at all. The run keeps going without you.
  if (p.down){ vx = 0; vy = 0; push = 0; p.sprint = false; p.held = null; }

  // Doc C2-3: stick deflection is the sneak/walk control. What it no longer decides is RUNNING —
  // that is the button's job now, and one decision belongs to one control.
  let tier = push > 0.35 ? 1 : 0;    // 0 sneak, 1 walk
  const moving = !!(vx || vy);

  // Chạy nước rút: the button. It only does anything while you are actually running, it eats
  // stamina the whole time it is on, and an empty bar drops you back to a plain run rather than
  // stopping you — "khi hết thể lực thì thành chạy bình thường".
  if (p.sprint && p.stam <= 0){ p.sprint = false; toast('Hết thể lực — chuyển sang đi bộ.'); }
  const sprinting = !!p.sprint && moving;
  p.sprinting = sprinting;

  // Nước rút (the upgrade) is now a second gear ON the sprint, not a thing that happens to you.
  p.runT = sprinting ? p.runT + dt : 0;
  p.rushing = sprinting && S.upg.rush > 0 && p.runT >= RUSH_DELAY;

  p.noise = !moving ? 0 : p.rushing ? RUSH_NOISE : sprinting ? RUN_NOISE
          : tier === 1 ? 1 : 0.25;
  if (S.noiseOverride != null) p.noise = S.noiseOverride;
  let tierMul = TIER_MUL[tier];
  if (sprinting){
    tierMul = TIER_MUL[1] * RUN_MUL * (1 + S.upg.sprint*0.20);
    if (p.rushing) tierMul *= 1 + RUSH_GAIN*S.upg.rush;
  }
  if (sprinting){ p.stam = Math.max(0, p.stam - STAM_DRAIN*dt*(p.rushing ? RUSH_STAM : 1)); }
  else {
    // Hồi thể lực nhanh: standing still is already the fastest recovery; the upgrade
    // widens that gap, so holding position near a blind hunter pays twice.
    const idle = !moving || tier === 0;
    p.stam = Math.min(p.stamMax, p.stam + STAM_REGEN*dt*(tier===0?1.4:1)*(idle ? 1 + S.upg.regen*0.5 : 1));
  }

  p.speedMul = tierMul;        // the tier multiplier, kept so a test can read what running is worth
  if (vx || vy){
    const sp = playerSpeed(p) * tierMul;
    const bx = p.x, by = p.y;
    const stopped = moveEnt(p, vx*sp*dt, vy*sp*dt, 7.5);
    // Footsteps, spaced by distance travelled rather than by a timer, so a slow walk gives slow
    // steps for free. The volume is p.noise - the SAME number the blind hunter listens to - so
    // what you hear is exactly what it hears. That is the stealth rule made audible; before this
    // the loudest thing you could do in the game had no sound of its own.
    p.stepD = (p.stepD || 0) + Math.hypot(p.x-bx, p.y-by);
    if (p.stepD > 30){ p.stepD = 0; if (!p.down) SFX.step(p.noise); }
    // Walking into a jammed door has to SAY it is jammed. Without this it reads as the wall being
    // in the wrong place, which is the bug report you get instead of the design landing.
    if (stopped){
      const d = nearestLockedDoor(p.x + vx*TILE, p.y + vy*TILE, 1.6*TILE);
      if (d && d.warned <= 0){ d.warned = 3; toast('Cửa bị kẹt — cần xà beng hoặc bom'); }
    }
  }

  // The shove from being hit, applied on top of whatever you were doing. Same decay curve the
  // monsters' own knockback uses, so the two read as one rule rather than two.
  if (p.kx || p.ky){
    moveEnt(p, p.kx*dt, p.ky*dt, 7.5);
    p.kx *= Math.pow(0.02, dt); p.ky *= Math.pow(0.02, dt);
    if (Math.abs(p.kx) < 2) p.kx = 0;
    if (Math.abs(p.ky) < 2) p.ky = 0;
  }

  // ---- look
  if (!window.__botActive){
    let want = null;
    // Aiming outranks looking: while an item is raised, the character turns to face where it is
    // about to be thrown, so the light cone shows you what you are shooting at.
    if (p.aimSlot >= 0){
      want = aimAngle(p, hudLayout());
    } else if (stickR){
      const maxD = hudLayout().right.r;
      let dx = stickR.x-stickR.ox, dy = stickR.y-stickR.oy;
      let d = Math.hypot(dx,dy);
      if (d > maxD){                       // the origin trails the thumb, same as the move stick
        stickR.ox += dx/d*(d-maxD); stickR.oy += dy/d*(d-maxD);
        dx = stickR.x-stickR.ox; dy = stickR.y-stickR.oy; d = maxD;
      }
      if (d > maxD*STICK_DEAD) want = Math.atan2(dy,dx);
    }
    // A mouse that has not moved is not looking anywhere — it is just lying there. Honouring a
    // parked cursor is what pinned the facing (and the load in your arms) below the character.
    // A cursor sitting ON the character points nowhere: the vector is a couple of pixels long and
    // its ANGLE is noise, so a hand resting on the mouse span the facing. The camera centres the
    // player now, which puts the middle of the screen exactly where that happens.
    const mw = mouseFresh() && mouseWorldNow();
    if (want === null && mw && Math.hypot(mw.x-p.x, mw.y-p.y) > MOUSE_LOOK_MIN){
      want = Math.atan2(mw.y-p.y, mw.x-p.x);
    }
    // Nothing else may turn you. Doc C2-2: the two sticks are INDEPENDENT — the left one moves you,
    // the right one aims you, and letting go of the right one FREEZES the facing where it was. It
    // never resets and never snaps to the direction you are walking.
    //
    // WHY this note is here: a version of this file did make walking turn you, added while chasing
    // the "the load I am carrying gets dragged downward" report. That was a real defect but this was
    // not its cause — the causes were a touchscreen's ghost mouse events and a cursor stored in world
    // space, both fixed above. Facing-follows-movement papered over them AND quietly replaced the
    // control scheme with a single-stick one. The owner caught it. If it ever looks tempting again,
    // it is the same mistake twice: measure what is moving `want`, do not add another writer.
    if (want !== null){
      const rate = 7.5 * turnRate(p);
      p.dir += clamp(angDiff(want, p.dir), -rate*dt, rate*dt);
    }
  }

  stepFx(dt);
  for (const l of S.loot) stepLoot(l, dt);
  stepCart(dt);
  if (S.shopMode){
    stepProjectiles(dt);                      // a test shot has to actually travel to be a test
    stepShop(dt);
    if (!S.shopMode) return;                  // the truck took us to the next level mid-step
  } else {
    stepDoors(dt);
    stepMates(dt);
    if (!S.noFoes){ stepMonsters(dt); separateFoes(); stepFoeSound(dt); stepRespawns(dt); }
    stepAngel(dt);
    stepMirror(dt);
    stepProjectiles(dt);
    stepExtraction(dt);

    // reaching the car after the last pad ends the level
    if (S.levelDone && !p.down && Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*2.4){ truckPatchUp(); finishLevel(); return; }
    // Down when the last pad closed out? A colleague standing at the truck drives it home for you.
    if (S.levelDone && p.down && (S.mates||[]).some(a => !a.down && Math.hypot(a.x-S.car.x, a.y-S.car.y) < TILE*2.4)){
      truckPatchUp(); finishLevel(); return;
    }
    // Same for a shift that can no longer be paid: a colleague at the truck calls it. Without
    // this, being down when the quota became unreachable was a run with NO exit at all — the
    // player cannot walk to the truck, and the crew's own arrival did nothing.
    if (S.shiftLost && !p.down && Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*2.4){ endLostShift(); return; }
    if (S.shiftLost && p.down && (S.mates||[]).some(a => !a.down && Math.hypot(a.x-S.car.x, a.y-S.car.y) < TILE*2.4)){
      endLostShift(); return;
    }
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
  // Down: the camera rides whoever is still working. A screen locked to your own head on the
  // floor tells you nothing about whether anybody is coming for it.
  const eye = viewer() || p;
  const tx = (S.shopMode ? SHOP_CX : eye.x) - vwW()/2;
  const ty = eye.y - vwH()/2;
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
  drawPads(c); drawButton(c); drawCart(c); drawLoot(c); drawCar(c); drawMirrors(c); drawMates(c); drawMonsters(c); drawAngel(c); drawDoors(c); drawProjectiles(c); drawPlayer(c);

  buildLight();
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'multiply';
  c.drawImage(lightCv, 0, 0);

  c.globalCompositeOperation = 'lighter';
  worldTransform(c);
  drawMemory(c);
  drawHighlights(c);

  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  drawVignette(c);
  drawHud(c);
}

function buildLight(){
  const c = lightCv.getContext('2d');
  // Same rule as the camera: while you are down, the room you can see is the room your colleague
  // is standing in. Their torch is small, which is most of the horror of being the head.
  const p = viewer();
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
  if (cr > 1){
    cone(c, p, cr*1.06, ch*1.32, 0.20, [232,214,170]);
    cone(c, p, cr,      ch*1.10, 0.34, [244,226,182]);
    cone(c, p, cr*0.94, ch,      0.66, [255,238,198]);
  }

  // The monsters carry lights too — the owner's words were "kiểu như đèn pin gắn vào mắt quái".
  // WHY it is a real light and not the faint overlay it shipped as: drawn additively on top of the
  // dark it was nearly invisible against an unlit floor and completely invisible against a lit one,
  // and the owner reported simply not seeing it. Painted HERE it lands on the floor the way a torch
  // does, and a beam sweeping a dark room is legible from across the house.
  //
  // It cannot give the house away, and that is not a judgement call: everything in this function is
  // already clipped to the polygon the PLAYER can see, so a monster's beam only ever shows where
  // the player could have seen that floor anyway. What it buys is what was missing — you can watch
  // a light sweep a room before you can see the thing carrying it.
  //
  // Amber while it is looking, RED the moment it has you. That is the same pair the ring over its
  // head uses, so the two never say different things about the same monster.
  for (const m of S.monsters){
    const md = MONSTERS[m.type];
    if (m.sleep > 0 || !md.sight) continue;
    const R = md.sight*TILE;
    if (Math.hypot(m.x-p.x, m.y-p.y) > LOS_R + R) continue;
    const half = foeConeHalf(m), mp = { x:m.x, y:m.y, dir:m.dir };
    c.save(); pathPoly(c, visPoly(m.x, m.y, R, 40)); c.clip();
    if (foeAlerted(m)){
      cone(c, mp, R*1.04, half*1.26, 0.20, [255,116,92]);
      cone(c, mp, R,      half,      0.44, [255, 74, 56]);
      cone(c, mp, R*0.58, half*0.86, 0.30, [255,156,128]);
    } else {
      // Deliberately ORANGE rather than the warm white the player's torch is. Both are torches, and
      // the one question the picture has to answer at a glance is WHOSE light that is — two beams
      // the same colour crossing a room is a puzzle, not information.
      cone(c, mp, R*1.04, half*1.26, 0.12, [255,150, 56]);
      cone(c, mp, R,      half,      0.28, [255,164, 66]);
      cone(c, mp, R*0.52, half*0.86, 0.20, [255,190,108]);
    }
    c.restore();
  }

  // What a filled AEngel left behind: a room that stays lit on its own for half a minute.
  for (const z of S.lightZones){
    const fade = Math.min(1, z.t/2.5);            // gutters out at the end rather than snapping off
    const poly = visPoly(z.x, z.y, z.r, 48);
    c.save(); pathPoly(c, poly); c.clip();
    const zg = c.createRadialGradient(z.x,z.y,4,z.x,z.y,z.r);
    zg.addColorStop(0, `rgba(255,248,220,${0.92*fade})`);
    zg.addColorStop(0.55, `rgba(250,240,205,${0.5*fade})`);
    zg.addColorStop(1, 'rgba(240,230,195,0)');
    c.fillStyle = zg; c.fillRect(z.x-z.r, z.y-z.r, z.r*2, z.r*2);
    c.restore();
  }

  // And the AEngel itself while it is filling: it is its own light source near the top.
  const an = S.angel;
  if (an && an.charge > 0.02){
    const r = mix(TILE*1.2, ANGEL_LIGHT_R, an.charge);
    const poly = visPoly(an.x, an.y, r, 40);
    c.save(); pathPoly(c, poly); c.clip();
    const ag = c.createRadialGradient(an.x,an.y,2,an.x,an.y,r);
    ag.addColorStop(0, `rgba(255,246,214,${0.9*an.charge})`);
    ag.addColorStop(1, 'rgba(255,246,214,0)');
    c.fillStyle = ag; c.fillRect(an.x-r, an.y-r, r*2, r*2);
    c.restore();
  }

  // Anything that has locked onto the player gets a small pool of its own, which is what lets the
  // silhouette read through the darkness multiply. It is deliberately colder and dimmer than the
  // torch: enough to see a shape coming, never enough to light the room it is coming through.
  for (const m of S.monsters){
    const k = m.reveal || 0;
    if (k <= 0.02) continue;
    const r = TILE*2.2;
    const mg = c.createRadialGradient(m.x,m.y,2,m.x,m.y,r);
    mg.addColorStop(0, `rgba(196,176,190,${0.62*k})`);
    mg.addColorStop(1, 'rgba(196,176,190,0)');
    c.fillStyle = mg; c.fillRect(m.x-r, m.y-r, r*2, r*2);
  }

  mateLights(c);

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


// ============================================================ AEngel
// A statue that teleports in front of you and stands there, and the only thing you can do about it
// is POINT YOUR TORCH AT IT. Light it for long enough and it fills up, flies off, and leaves the
// room lit for half a minute. Ignore it and it drains, waits six seconds, then closes the distance
// in one step and takes a swipe.
//
// It is not a monster in the S.monsters sense and that is deliberate — it has no health, takes no
// damage from any source, and is not something you can shoot your way out of. Keeping it out of
// that array is what makes "immune to everything" true by construction rather than by a flag every
// damage site has to remember to check.
const ANGEL_EVERY    = [30, 60];   // seconds between visits
const ANGEL_SETTLE   = 3;          // it just stands there first; nothing you do counts yet
const ANGEL_CHARGE   = 5;          // seconds of torch on it, to fill
const ANGEL_DRAIN    = 6;          // seconds for a full charge to bleed back out
const ANGEL_PATIENCE = 6;          // empty, and unlit for this long, and it comes for you
const ANGEL_LIGHT_T  = 30;         // how long the light it leaves behind burns
const ANGEL_LIGHT_R  = 7*TILE;
const ANGEL_DMG      = 30;         // out of 100
const ANGEL_PUNISH   = 6;          // seconds of no torch and heavy legs afterwards
const ANGEL_NEAR     = [3.5, 5.5]; // how far in front of you it lands, in tiles

function angelNextIn(){ return mix(ANGEL_EVERY[0], ANGEL_EVERY[1], Math.random()); }

// Is this point inside the beam specifically? Not the little pool of light at your feet — the beam.
// Shining a torch at something is an act; standing near it is not.
function litByTorch(x, y){
  const p = S.player;
  const cr = coneRadius(p);
  if (cr < 1) return false;                       // torch out — nothing is being shone anywhere
  const dx = x-p.x, dy = y-p.y, d = Math.hypot(dx,dy);
  if (d > cr) return false;
  if (Math.abs(angDiff(Math.atan2(dy,dx), p.dir)) > coneHalf(p)) return false;
  return losClear(p.x, p.y, x, y);
}

function spawnAngel(){
  const p = S.player;
  // In front of you, and IN VIEW: the whole effect is that it was not there a moment ago.
  for (let i = 0; i < 60; i++){
    const wide = i < 40 ? 0.9 : Math.PI;          // widen the arc if you are facing a wall
    const a = p.dir + (Math.random()-0.5)*wide;
    const d = mix(ANGEL_NEAR[0], ANGEL_NEAR[1], Math.random()) * TILE;
    const x = p.x + Math.cos(a)*d, y = p.y + Math.sin(a)*d;
    const gx = (x/TILE)|0, gy = (y/TILE)|0;
    if (gx < 1 || gy < 1 || gx >= MW-1 || gy >= MH-1) continue;
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    if (hitsSolid(x, y, 12)) continue;
    if (!losClear(p.x, p.y, x, y)) continue;
    S.angel = { x, y, t:0, charge:0, marked:false, armed:false, unlitT:0, phase:'stand', rise:0,
                spotT: SPOT_FX_T,                   // the same "there it is" ring a body gets
                face: Math.atan2(p.y-y, p.x-x) };   // it is looking at you
    S.angelFx = { x, y, t:0 };
    fxShake(5); FX.spotT = 1; SFX.warp();
    return true;
  }
  S.angelTimer = 3;                                // nowhere to stand; try again shortly
  return false;
}

function angelRise(a){
  a.phase = 'rise'; a.rise = 0;
  S.lightZones.push({ x:a.x, y:a.y, r:ANGEL_LIGHT_R, t:ANGEL_LIGHT_T });
  // The room it was standing in is now a room you have seen.
  const rt = Math.ceil(ANGEL_LIGHT_R/TILE);
  const gx0 = (a.x/TILE)|0, gy0 = (a.y/TILE)|0;
  for (let gy=gy0-rt; gy<=gy0+rt; gy++) for (let gx=gx0-rt; gx<=gx0+rt; gx++){
    if (gx<0||gy<0||gx>=MW||gy>=MH) continue;
    const px = (gx+0.5)*TILE, py = (gy+0.5)*TILE;
    if (Math.hypot(px-a.x, py-a.y) > ANGEL_LIGHT_R) continue;
    if (!losClear(a.x, a.y, px, py)) continue;
    S.explored[gy*MW+gx] = 1;
    const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
    if (S.rooms[ri]) S.rooms[ri].seen = true;
  }
  S.angelTimer = angelNextIn();
  S.angelGone = true;
  fxFlash(0.45, '255,246,216'); SFX.chime();
  toast('Nó no ánh sáng rồi — bay đi, để lại một vùng sáng.');
}

function angelClaw(a){
  const p = S.player;
  // One step, one swipe, gone. It does not chase and it does not linger.
  a.x = p.x + Math.cos(p.dir)*10; a.y = p.y + Math.sin(p.dir)*10;
  S.angelFx = { x:a.x, y:a.y, t:0 };
  hurtPlayer(ANGEL_DMG, 'angel', a.x, a.y);
  p.blindT = ANGEL_PUNISH;
  p.slowT  = ANGEL_PUNISH;
  fxShake(13); fxFlash(0.5, '180,40,60');
  SFX.screech();
  S.angel = null;
  S.angelTimer = angelNextIn();
  S.angelGone = true;
  toast('Nó cào một phát rồi biến mất. Đèn tắt ' + ANGEL_PUNISH + ' giây.');
}

function stepAngel(dt){
  // light left behind burns down wherever it was left
  for (let i = S.lightZones.length-1; i >= 0; i--){
    S.lightZones[i].t -= dt;
    if (S.lightZones[i].t <= 0) S.lightZones.splice(i, 1);
  }
  if (S.angelFx){ S.angelFx.t += dt; if (S.angelFx.t > 0.85) S.angelFx = null; }

  if (S.shopMode || S.noFoes || S.dead || S.levelDone){ S.angel = null; return; }

  if (!S.angel){
    // Not on this house's roster: nothing arrives. This gates the ARRIVAL, not the thing - one
    // forced in by hand (the debug hook, a test) still runs its whole lifecycle.
    if (!rosterHas(ANGEL_KIND)) return;
    S.angelTimer -= dt;
    if (S.angelTimer <= 0) spawnAngel();
    return;
  }
  const a = S.angel;
  a.t += dt;
  a.spotT = Math.max(0, (a.spotT || 0) - dt);
  if (a.phase === 'rise'){
    a.rise += dt;
    if (a.rise > 1.2) S.angel = null;
    return;
  }
  a.face = Math.atan2(S.player.y-a.y, S.player.x-a.x);   // always looking at you
  if (a.t < ANGEL_SETTLE) return;                        // the grace: it is only standing there

  const lit = litByTorch(a.x, a.y);

  // It stands there. Indefinitely. The clock that ends in a swipe does not start until the player
  // has PUT A TORCH ON IT once — after that, and only after that, darkness counts against them.
  // WHY: before this the timer started on its own three seconds after it appeared, so a thing that
  // teleported in behind you clawed you for a mistake you were never shown. Now the punishment is
  // only ever for looking away from something you had already looked at, which is a decision the
  // player made rather than one the spawn made for them.
  // ROOT-CAUSE: the patience clock was keyed to time-since-spawn instead of to the interaction
  // that gives the player the information the clock is about.
  // SEE: owner feedback 2026-08-22 — "cho nó xuất hiện xong rồi đứng luôn ở đó cho tới khi có
  // người rọi đèn vào thì nó mới đếm cái thời gian bị tối".
  if (!a.armed){
    if (!lit) return;
    a.armed = true;
    a.marked = true;
    toast('Nó vừa nhìn thấy bạn. Giờ nó nhớ mặt — đừng rời đèn khỏi nó.');
  }

  if (lit){
    a.unlitT = 0;
    a.charge = Math.min(1, a.charge + dt/ANGEL_CHARGE);
    if (a.charge >= 1) angelRise(a);
  } else {
    a.unlitT += dt;
    a.charge = Math.max(0, a.charge - dt/ANGEL_DRAIN);
    if (a.charge <= 0 && a.unlitT >= ANGEL_PATIENCE) angelClaw(a);
  }
}

// A statue, brightening as it fills. Drawn in the world pass so the room's own darkness applies to
// it, with an additive halo on top in drawHighlights so a full one is genuinely blinding.
function drawAngel(c){
  const a = S.angel;
  if (!a) return;
  const k = a.charge;
  const lift = a.phase === 'rise' ? ease(clamp(a.rise/1.2, 0, 1)) : 0;
  const alpha = 1 - lift;
  if (alpha <= 0.01) return;

  c.save();
  c.translate(a.x, a.y - lift*46);
  c.globalAlpha = alpha;

  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.ellipse(0, 13, 13, 5, 0, 0, Math.PI*2); c.fill();

  const stone = [142,139,132], lit = [255,248,214];
  const col = stone.map((v,i) => Math.round(mix(v, lit[i], k)));
  const fill = `rgb(${col[0]},${col[1]},${col[2]})`;

  c.save();
  c.rotate(a.face);
  // wings, swept back behind whichever way it is facing
  c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.75)`;
  for (const s of [-1, 1]){
    c.beginPath();
    c.moveTo(-2, s*3);
    c.quadraticCurveTo(-16, s*16, -20, s*4);
    c.quadraticCurveTo(-13, s*6, -2, s*1);
    c.closePath(); c.fill();
  }
  c.restore();

  // robe and head
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(-8, 12); c.lineTo(-4.5, -6); c.lineTo(4.5, -6); c.lineTo(8, 12);
  c.closePath(); c.fill();
  c.beginPath(); c.arc(0, -10, 5.4, 0, Math.PI*2); c.fill();
  c.strokeStyle = `rgba(30,28,26,${0.55*(1-k)})`; c.lineWidth = 1.2; c.stroke();

  // the charge arc above its head — the mechanic has to be legible or it is just a random mauling
  if (a.t >= ANGEL_SETTLE && k > 0.001){
    c.beginPath();
    c.strokeStyle = `rgba(255,240,190,0.95)`; c.lineWidth = 2.4; c.lineCap = 'round';
    c.arc(0, -10, 12, -Math.PI/2, -Math.PI/2 + Math.PI*2*k);
    c.stroke(); c.lineCap = 'butt';
  }
  c.restore();

  // the teleport burst — Enderman's trick: it was not there, and then it was
  if (S.angelFx){
    const t = S.angelFx.t / 0.85;
    c.save();
    c.globalAlpha = 1 - t;
    c.strokeStyle = 'rgba(186,140,240,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.arc(S.angelFx.x, S.angelFx.y, 8 + t*46, 0, Math.PI*2); c.stroke();
    c.beginPath(); c.arc(S.angelFx.x, S.angelFx.y, 4 + t*24, 0, Math.PI*2); c.stroke();
    for (let i = 0; i < 9; i++){
      const ang = i*0.698 + t*1.6, r0 = 6 + t*34;
      c.beginPath();
      c.moveTo(S.angelFx.x + Math.cos(ang)*r0, S.angelFx.y + Math.sin(ang)*r0);
      c.lineTo(S.angelFx.x + Math.cos(ang)*(r0+9), S.angelFx.y + Math.sin(ang)*(r0+9));
      c.stroke();
    }
    c.restore();
  }
}

// ============================================================ highlights
// What the torch has actually found. The sight cone lights a wedge of floor, but a small dark vase
// standing on a dark carpet inside that wedge is still something a player walks past — and the
// whole game is picking those up. Same for the two objects the loop is built around: the cart, and
// the truck you open the locker at.
//
// Drawn in the ADDITIVE pass, after the darkness has been multiplied over the world, so a highlight
// is never dimmed by the room it is standing in.
const HL_LOOT   = [232, 196, 120];   // warm gold — the colour of money in this game
// Danger has ONE colour. Owner's call, 2026-08-27: the highlight used to be each monster's own eye
// colour, which was a taxonomy — it said WHICH thing was in the room, a thing the silhouette
// already says — and it spent the one colour the eye reacts to without being asked. Everything
// that can hurt you is red now, and the only thing the shade varies with is whether it has you.
const HL_FOE    = [214, 62, 52];    // seen
const HL_HUNT   = [255, 66, 50];    // seen, and coming
const HL_ASLEEP = [130, 170, 200];  // tranquillised: not a danger, so not the danger colour
const HL_CART   = [224, 192, 122];
const HL_TRUCK  = [140, 190, 230];
const HL_TARGET = [150, 230, 170];   // green: the one thing the grab button would actually take

// Is this point inside the light the player is casting right now?
// Whose eyes the frame is drawn from. The player, unless the player is a head on the floor, in
// which case it is the colleague nearest to that head. Every sight test in the draw pass reads
// this rather than S.player, so "what is lit" and "what the camera shows" can never disagree.
function viewer(){
  const p = S.player;
  if (!p || !p.down) return p;
  const live = (S.mates || []).filter(a => !a.down);
  if (!live.length) return p;
  // Whoever the player has chosen to watch, if they are still up; otherwise the one nearest the
  // head, because that is the one whose progress the player actually cares about.
  const pick = live.find(a => a.id === S.spectate);
  if (pick) return pick;
  const head = S.loot.find(l => l.isHead && !l.gone && l.who === -1);
  const at = head || p;
  return live.reduce((b, a) =>
    Math.hypot(a.x-at.x, a.y-at.y) < Math.hypot(b.x-at.x, b.y-at.y) ? a : b);
}
// The one thing a head on the floor can still do: look somewhere else.
function cycleSpectate(){
  const live = (S.mates || []).filter(a => !a.down);
  if (!S.player || !S.player.down || !live.length) return false;
  // Start from whoever is ON SCREEN, not from -1. With nothing selected the viewer is already the
  // one nearest the head, and cycling from -1 lands on live[0] — which is that same colleague about
  // a third of the time, so the button did nothing.
  const shown = viewer();
  let cur = live.findIndex(a => a.id === S.spectate);
  if (cur < 0) cur = live.findIndex(a => a === shown);
  const next = live[(cur + 1 + live.length) % live.length];
  S.spectate = next.id;
  toast('Đang xem ' + next.name);
  return true;
}

// A monster that has locked onto you is DRAWN, beam or no beam. Doc B3's darkness rule was
// "outside the beam it stays invisible", and that is still true of everything that has not seen
// you — but a thing already running at you is information the player has earned by being caught,
// and hiding it turned every chase into damage arriving from an empty screen.
// Line of sight still applies: a wall hides it, exactly as a wall hides everything else.
// SEE: owner feedback 2026-08-22 — "cho quái hiện hình chuẩn luôn khi agro player".
const REVEAL_R    = 11 * TILE;   // as far as an aggro'd thing shows from
const REVEAL_FADE = 0.28;        // seconds to fade in, so it resolves out of the dark rather than popping
function foeRevealed(m){
  if (m.sleep > 0) return false;
  if (m.state !== 'chase' && !m.charging) return false;
  const p = S.player;
  if (Math.hypot(p.x-m.x, p.y-m.y) > REVEAL_R) return false;
  return losClear(p.x, p.y, m.x, m.y);
}
// What the draw passes actually read: the fade-in, stepped once per frame in stepMonsters.
function foeVisible(m){ return inSight(m.x, m.y) || (m.reveal || 0) > 0.02; }

function inSight(x, y){
  const p = viewer();
  const dx = x-p.x, dy = y-p.y;
  const d = Math.hypot(dx, dy);
  if (d > Math.max(coneRadius(p), PERIPH_R)) return false;
  if (d > PERIPH_R && Math.abs(angDiff(Math.atan2(dy,dx), p.dir)) > coneHalf(p)*1.05) return false;
  return losClear(p.x, p.y, x, y);
}

function glowRing(c, x, y, r, rgb, a, lw){
  const g = c.createRadialGradient(x, y, r*0.55, x, y, r*1.85);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a*0.30})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  c.fillStyle = g;
  c.fillRect(x-r*1.85, y-r*1.85, r*3.7, r*3.7);
  c.beginPath();
  c.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  c.lineWidth = lw || 2;
  c.arc(x, y, r, 0, Math.PI*2);
  c.stroke();
}

// ---- what THEY can see
// Owner's call, 2026-08-27. Every monster in this game is answered by geometry — a wall, a corner,
// one step sideways — and until now the geometry was invisible: the player was asked to guess at a
// cone they had never once been shown. It is drawn only for something they can already see, and
// clipped to the same walls the detection test uses, because a cone glowing through a wall would
// hand the house over for free.
//
// The colour carries the whole message: amber while it is looking, RED the moment it has you.
const FOE_CONE_HALF  = 1.1;      // the same number stepMonsters detects with
const ROOK_CONE_HALF = 1.2;      // and the rook's own, which is wider
const FOE_NEAR_R     = 3*TILE;   // inside this, which way it is facing stops mattering
function foeAlerted(m){
  if (!m || m.sleep > 0) return false;
  if (m.type === 'rook') return m.rook === 'wind' || m.rook === 'dash';
  return m.state === 'chase' && m.alert > 0;
}
function foeConeHalf(m){ return m.type === 'rook' ? ROOK_CONE_HALF : FOE_CONE_HALF; }
// A hearing radius is exactly as big as the noise being made and no bigger. Drawing it at its
// maximum would be a lie every time the player stood still, and the sneak tier's entire reason to
// exist is that this circle collapses when you slow down.
function foeHearR(m){
  const d = MONSTERS[m.type];
  if (!d || !d.hear) return 0;
  const p = viewer() || S.player;
  return d.hear*TILE*((p && p.noise) || 0)*0.6;
}
function drawFoeVision(c){
  for (const m of S.monsters){
    if (m.sleep > 0 || !foeVisible(m)) continue;
    const d = MONSTERS[m.type];
    const hot = foeAlerted(m);
    const rgb = hot ? '236,52,40' : '224,168,74';
    const a   = hot ? 0.16 : 0.075;
    // The CONE is not drawn here any more — it is a real light now (see buildLight), which is the
    // only version of it the owner could actually see. What is left in this pass is the two things
    // a beam cannot say: the circle it does not need to be facing you to use, and how far its
    // hearing currently reaches.
    if (d.sight > 0){
      c.save();
      pathPoly(c, visPoly(m.x, m.y, FOE_NEAR_R, 24)); c.clip();
      c.beginPath();
      c.strokeStyle = `rgba(${rgb},${a*2.4})`; c.lineWidth = 1.3;
      c.arc(m.x, m.y, FOE_NEAR_R, 0, Math.PI*2); c.stroke();
      c.restore();
    }
    const hr = foeHearR(m);
    if (hr > 8){
      c.save();
      pathPoly(c, visPoly(m.x, m.y, hr, 28)); c.clip();
      c.beginPath();
      c.setLineDash([7, 7]);
      c.strokeStyle = `rgba(${rgb},${a*4.0})`; c.lineWidth = 1.6;
      c.arc(m.x, m.y, hr, 0, Math.PI*2); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
  }
}
// The ring that fires once, on the frame a thing resolves out of the dark. Deliberately wider than
// the highlight and gone in half a second: the highlight says "it is there", this says "it just
// became there", and only one of those is worth flinching at.
function spotFx(c, x, y, t){
  if (t <= 0) return;
  const k = 1 - t/SPOT_FX_T;
  c.save();
  c.strokeStyle = `rgba(255,80,64,${(1-k)*0.85})`;
  c.lineWidth = 1.5 + (1-k)*3;
  c.beginPath(); c.arc(x, y, 14 + k*38, 0, Math.PI*2); c.stroke();
  c.restore();
}
// "!" over the head of anything that has decided about you. The cone going red says it CAN see
// you; this says it is already coming, which is a different sentence and the one you act on.
// Two passes rather than an outline: this whole layer is drawn additively, where a dark outline
// adds nothing at all, so the readability has to come from a halo under a hot core.
function alertMark(c, x, y){
  const bob = Math.sin(S.time*9);
  c.save();
  c.translate(x, y - 36 - bob*2);
  c.textAlign = 'center';
  // The halo is red and the core is nearly white. WHY not red on red: the mark sits INSIDE the
  // thing's own red highlight, and a red glyph on a red bloom is a smudge — the core has to be the
  // brightest and least saturated thing in that patch of screen or it does not read at all.
  c.font = '900 30px ui-sans-serif, system-ui';
  c.fillStyle = 'rgba(255,48,34,0.34)';
  c.fillText('!', 0, 2);
  c.font = '900 22px ui-sans-serif, system-ui';
  c.fillStyle = `rgba(255,228,220,${0.82 + 0.18*bob})`;
  c.fillText('!', 0, 0);
  c.textAlign = 'left';
  c.restore();
}
// Whether the statue is currently marked, and whether it is marked as COMING. One expression, read
// by the draw below and by the test hook, so a check can never pass against a rule the picture is
// not using.
function angelDanger(){
  const a = S.angel, p = S.player;
  if (!a || a.phase !== 'stand' || !p) return null;
  if (!losClear(p.x, p.y, a.x, a.y)) return null;
  return { marked: true,
           hot: a.t < ANGEL_SETTLE || (a.armed && !litByTorch(a.x, a.y)),
           spotT: a.spotT || 0, t: a.t };
}

// The two monsters that are not bodies. Both are on the roster now, so both answer to the same
// red as everything else — the colour means "this can hurt you", and both of these can.
function drawEventFoeGlow(c){
  const p = S.player;
  const beat = 0.62 + 0.38*Math.sin(S.time*3.2);
  const an = S.angel;
  if (an && an.phase === 'stand' && losClear(p.x, p.y, an.x, an.y)){
    // Marked on the frame it ARRIVES, not three seconds later. It used to wait out the settle
    // window first — but that window exists so the player is not punished for a spawn they were
    // never shown, and it says nothing about whether the thing is dangerous. A statue that
    // materialises a metre in front of you wearing no marking at all is exactly the moment the
    // marking is for.
    // SEE: owner feedback 2026-08-27 — "ngay khi vừa xuất hiện trước mắt là phải có vòng tròn đỏ
    // + cảnh báo nguy hiểm liền, chứ không phải delay".
    //
    // Two states get the hunting red and the mark: the arrival, and armed-and-in-the-dark, which is
    // the state that ends in a swipe. In between — lit and filling — it is being handled, and a
    // thing being handled does not need shouting about.
    const hot = angelDanger().hot;
    glowRing(c, an.x, an.y, 17 + (hot ? beat*3.5 : 0), hot ? HL_HUNT : HL_FOE,
             hot ? 0.70 + beat*0.3 : 0.40, hot ? 3.0 : 2.0);
    spotFx(c, an.x, an.y, an.spotT || 0);
    if (hot) alertMark(c, an.x, an.y - 6);
  }
  const mr = S.mirror, mm = mr && mr.m;
  if (mm && (inSight(mm.x, mm.y) || (mm.reveal || 0) > 0.02)){
    // It has no detection to draw and no state to be in: from the moment it is out of the glass it
    // is walking at somebody. So it is always the hunting red, and it always wears the mark.
    glowRing(c, mm.x, mm.y, 15 + beat*3.5, HL_HUNT, 0.70 + beat*0.3, 3.0);
    spotFx(c, mm.x, mm.y, mm.spotT || 0);
    alertMark(c, mm.x, mm.y);
  }
}

function drawHighlights(c){
  const p = S.player;
  if (!p || S.dead) return;
  const target = nearestLoot(p);
  const beat = 0.62 + 0.38*Math.sin(S.time*3.2);
  // First, so every ring below sits on top of it rather than inside it.
  drawFoeVision(c);

  for (const l of S.loot){
    if (l.gone || l.held || l.inCart || l.onPad) continue;
    if (!inSight(l.x, l.y)) continue;
    const isT = l === target;
    // The one the grab button would take is called out in a different colour and a wider ring, so
    // "there is loot over there" and "this is the one I am about to pick up" are not the same signal.
    glowRing(c, l.x, l.y, l.r + (isT ? 7 + beat*2.5 : 4.5),
             isT ? HL_TARGET : (l.isBag ? [235,205,110] : HL_LOOT),
             isT ? 0.55 + beat*0.35 : 0.30, isT ? 2.4 : 1.6);
  }

  // The cart: found from across the room, and unmistakable once you are in reach of the handle.
  if (S.cart && !p.pushing && inSight(S.cart.x, S.cart.y)){
    const near = nearCart(p);
    glowRing(c, S.cart.x, S.cart.y, S.cart.r*1.25 + (near ? beat*2.5 : 0),
             HL_CART, near ? 0.5 + beat*0.3 : 0.26, near ? 2.4 : 1.6);
  }
  // Anything alive that the beam is actually on. It gets the same treatment as the loot, because
  // "there is something in front of me" is the one piece of information this game must never make
  // you squint for. Outside the beam it stays invisible — that half is the point of the game.
  // The colour is red for all of them now — see HL_FOE.
  for (const m of S.monsters){
    if (!foeVisible(m)) continue;
    const hunting = foeAlerted(m);
    if (m.sleep > 0){
      glowRing(c, m.x, m.y, 15, HL_ASLEEP, 0.30, 1.6);
    } else {
      glowRing(c, m.x, m.y, 15 + (hunting ? beat*3.5 : 0), hunting ? HL_HUNT : HL_FOE,
               hunting ? 0.72 + beat*0.3 : 0.44, hunting ? 3.0 : 2.0);
      spotFx(c, m.x, m.y, m.spotT || 0);
      if (hunting) alertMark(c, m.x, m.y);
    }
  }

  // The rook's wind-up, drawn as the LANE it is about to occupy. Three seconds of warning are
  // worth nothing if the warning does not say where — the counter-play to this monster is one step
  // sideways, and a step sideways needs a line to step out of.
  for (const m of S.monsters){
    if (m.type !== 'rook' || !foeVisible(m)) continue;
    if (m.rook === 'wind'){
      const k = clamp(m.windT/ROOK_WIND, 0, 1);
      const len = Math.max(4*TILE, Math.hypot(p.x-m.x, p.y-m.y) * ROOK_OVERSHOOT[0]);
      c.save();
      c.strokeStyle = `rgba(255,201,78,${0.10 + k*0.34})`;
      c.lineWidth = 2 + k*10;
      c.beginPath();
      c.moveTo(m.x + Math.cos(m.dir)*16, m.y + Math.sin(m.dir)*16);
      c.lineTo(m.x + Math.cos(m.dir)*len, m.y + Math.sin(m.dir)*len);
      c.stroke();
      c.restore();
      glowRing(c, m.x, m.y, 16 + (1-k)*16, [255,201,78], 0.30 + k*0.5, 2.4);
    } else if (m.rook === 'stun'){
      glowRing(c, m.x, m.y, 15, [230,200,120], 0.24, 1.6);
    }
  }

  drawHeadGlow(c);
  drawMirrorGlow(c);
  drawEventFoeGlow(c);

  // The truck: the locker lives on it, and the locker button only appears when you are close, so
  // the truck has to say "come here" from further away than the button does.
  if (inSight(S.car.x, S.car.y)){
    const near = nearTruck(p);
    glowRing(c, S.car.x, S.car.y, TILE*2.7 + (near ? beat*3 : 0),
             HL_TRUCK, near ? 0.5 + beat*0.3 : 0.24, near ? 2.6 : 1.6);
  }
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
// The truck. It was drawn three tiles by two, which is a small van, and it is the thing the whole
// shift is built around — you start in it, you carry everything back to it, its locker is your
// inventory, and it is what drives off at the end. It is now nearly five tiles long, with a cargo
// box, a cab, wheels and rear doors that swing.
// WHY the numbers are constants: the generator carves a five-tile clearing for it and the station
// hall places it by tile, so the drawn size and the space reserved for it have to be read together.
const TRUCK_L = TILE*4.7, TRUCK_W = TILE*2.4;   // length (along x) and width
function drawCar(c){
  const off = carDrawOffset();
  if (off.alpha <= 0.001) return;
  const x = S.car.x + off.dx, y = S.car.y + off.dy;
  const a = c.globalAlpha;
  c.globalAlpha = a * off.alpha;

  const L = TRUCK_L, W = TRUCK_W;
  const x0 = x - L*0.5, y0 = y - W*0.5;
  const cabL = L*0.30;                       // the cab is at the FRONT, which is the right

  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.ellipse(x, y + W*0.52, L*0.47, W*0.16, 0, 0, Math.PI*2); c.fill();

  // wheels first, so the body sits over them
  c.fillStyle = '#15181c';
  for (const wx of [x0 + L*0.20, x0 + L*0.52, x0 + L*0.82]){
    c.fillRect(wx - L*0.05, y0 - W*0.10, L*0.10, W*1.20);
  }

  // cargo box
  c.fillStyle = '#2c3540'; c.fillRect(x0, y0, L - cabL, W);
  c.fillStyle = '#39434f'; c.fillRect(x0 + L*0.04, y0 + W*0.10, L - cabL - L*0.08, W*0.80);
  // corrugation, so it reads as a box rather than a slab
  c.strokeStyle = 'rgba(150,168,186,0.16)'; c.lineWidth = 1;
  for (let i = 1; i < 7; i++){
    const rx = x0 + L*0.06 + i*(L - cabL - L*0.12)/7;
    c.beginPath(); c.moveTo(rx, y0 + W*0.14); c.lineTo(rx, y0 + W*0.86); c.stroke();
  }

  // cab and windscreen
  c.fillStyle = '#33404e'; c.fillRect(x0 + L - cabL, y0 + W*0.04, cabL, W*0.92);
  c.fillStyle = '#89a6b8'; c.fillRect(x0 + L - cabL*0.55, y0 + W*0.20, cabL*0.42, W*0.60);
  c.fillStyle = '#d8c07a'; c.fillRect(x0 + L - L*0.02, y0 + W*0.12, L*0.02, W*0.16);
  c.fillStyle = '#d8c07a'; c.fillRect(x0 + L - L*0.02, y0 + W*0.72, L*0.02, W*0.16);

  // The back of the truck: a dark opening, and one door swinging off the near edge of it. `door` is
  // 0 shut, 1 wide open, and it is the same number the arrival and the departure read in opposite
  // directions — which is why leaving looks like arriving played backwards.
  const bw = L*0.13, bh = W;
  c.fillStyle = `rgba(6,8,10,${0.35 + off.door*0.6})`;
  c.fillRect(x0, y0, bw, bh);
  c.save();
  c.translate(x0, y0);
  c.rotate(-off.door*1.15);
  c.fillStyle = '#39434f'; c.fillRect(0, 0, bw*0.62, bh);
  c.strokeStyle = 'rgba(190,205,220,0.45)'; c.lineWidth = 1.2;
  c.strokeRect(0, 0, bw*0.62, bh);
  c.restore();

  c.strokeStyle = 'rgba(200,220,235,0.40)'; c.lineWidth = 1.6;
  c.strokeRect(x0, y0, L, W);
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
      // On a checkout the number is red once it is past what the wallet holds — otherwise the till
      // simply refuses and the player is left guessing which part it objected to.
      if (pad.shop && pad.value > S.wallet) c.fillStyle = '#e8776a';
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
    // A colleague's head. It goes through the loot pipeline because it has to be carried, dropped,
    // loaded and stood on a pad — but it must never LOOK like something you sell.
    if (l.isHead){
      c.beginPath(); c.fillStyle = 'rgba(0,0,0,0.45)';
      c.ellipse(l.x, y + l.r*0.7, l.r*0.9, l.r*0.42, 0, 0, Math.PI*2); c.fill();
      c.beginPath(); c.fillStyle = '#cfcbb9';
      c.arc(l.x, y, l.r, 0, Math.PI*2); c.fill();
      c.lineWidth = 1.6; c.strokeStyle = '#7d4a46'; c.stroke();
      c.fillStyle = '#3a2f2c';
      c.fillRect(l.x-4.2, y-2.4, 2.6, 2.6); c.fillRect(l.x+1.6, y-2.4, 2.6, 2.6);
      c.strokeStyle = 'rgba(58,47,44,0.9)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(l.x-3, y+4); c.lineTo(l.x+3, y+4); c.stroke();
      c.font = '600 10px ui-sans-serif, system-ui'; c.textAlign = 'center';
      c.fillStyle = '#e6b8b0';
      c.fillText('Đầu ' + (l.whoName || ''), l.x, y - l.r - 5);
      c.textAlign = 'left';
      continue;
    }
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
    if (m.type === 'rook'){
      // Bulk, and a nose. It is the only thing in the house whose FACING is a threat on its own,
      // so the silhouette has to say which way it is pointed from across a dark room.
      c.rotate(m.dir);
      const wind = m.rook === 'wind' ? clamp(m.windT/ROOK_WIND, 0, 1) : 0;
      c.translate(-wind*4, 0);                       // it rocks backwards as it loads
      c.beginPath();
      c.moveTo(14,0); c.lineTo(2,-11); c.lineTo(-11,-9); c.lineTo(-11,9); c.lineTo(2,11);
      c.closePath(); c.fill();
      c.strokeStyle = d.rim; c.lineWidth = 1.6; c.globalAlpha = 0.8; c.stroke(); c.globalAlpha = 1;
      if (m.rook === 'stun'){
        c.rotate(-m.dir);
        c.strokeStyle = 'rgba(230,200,120,0.9)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(0,-15,4.5, 0, Math.PI*2); c.stroke();
      } else {
        c.fillStyle = m.rook === 'wind' || m.rook === 'dash' ? d.eye : 'rgba(190,170,150,0.9)';
        c.fillRect(4,-4.6,3.4,3.2); c.fillRect(4,1.4,3.4,3.2);
      }
      c.restore();
      continue;
    }
    c.beginPath();
    c.moveTo(-9,10); c.lineTo(-7,-9+s); c.lineTo(0,-14); c.lineTo(7,-9-s); c.lineTo(9,10);
    c.closePath(); c.fill();
    // A rim on the silhouette. The body is dark on purpose; without an edge it dissolves into a
    // dark floor even while standing in the beam.
    c.strokeStyle = d.rim; c.lineWidth = 1.5; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1;
    if (m.sleep > 0){
      c.strokeStyle = 'rgba(150,190,220,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-4,-9); c.lineTo(-1.6,-9); c.moveTo(1.6,-9); c.lineTo(4,-9); c.stroke();
      c.font = '600 10px ui-monospace, monospace'; c.fillStyle = 'rgba(160,200,230,0.9)';
      c.fillText('z', 6, -14);
    } else {
      c.fillStyle = m.state === 'chase' ? d.eye : 'rgba(190,170,150,0.9)';
      c.fillRect(-4.4,-9.4,3.2,3.2); c.fillRect(1.4,-9.4,3.2,3.2);
    }
    c.restore();
  }
}
// The leaves. They swing on hinges at the two JAMBS and meet in the middle, and the ANGLE is the
// information: a pair standing across a doorway reads as shut from any distance, and two leaves
// flat against the wall read as open. A colour change would not - half the game is played in the
// dark, where colour is the first thing to go.
// A JAMMED pair never moves, and says so with boards nailed across it.
function drawDoors(c){
  if (!S.doors) return;
  for (const d of S.doors){
    if (d.broken){ drawDoorWreck(c, d); continue; }
    const jam = d.locked;
    for (const k of [-1, 1]){
      const hx = d.vertical ? d.x : d.x + k*DOOR_LEAF;
      const hy = d.vertical ? d.y + k*DOOR_LEAF : d.y;
      // shut = the leaf lies along the opening, reaching from its jamb to the middle
      const shut = d.vertical ? -k*(Math.PI/2) : (k > 0 ? Math.PI : 0);
      const a = shut + (jam ? 0 : -k*d.side*(Math.PI/2)*d.open);
      c.save();
      c.translate(hx, hy);
      c.rotate(a);
      const len = DOOR_LEAF, th = jam ? 6 : 5;
      c.fillStyle = jam ? '#3a2c22' : '#4a3a2a';
      c.fillRect(0, -th*0.5, len, th);
      c.fillStyle = 'rgba(226,200,150,0.16)';
      c.fillRect(0, -th*0.5, len, 1.4);
      // the handle at the free edge, so a leaf has a near end and a far end
      c.fillStyle = jam ? '#7a6a55' : '#c8a86a';
      c.fillRect(len - 3.4, -1.6, 2.6, 3.2);
      c.restore();
    }
    if (jam) drawDoorJam(c, d);
  }
}

// Boards across the pair, and a glow that builds while something on the other side leans on it.
function drawDoorJam(c, d){
  const half = DOOR_LEAF;
  c.save();
  c.translate(d.x, d.y);
  if (d.vertical) c.rotate(Math.PI/2);
  c.fillStyle = '#5a4632';
  for (const o of [-8, 8]){
    c.save(); c.translate(0, o); c.rotate(o > 0 ? 0.16 : -0.16);
    c.fillRect(-half*0.92, -3, half*1.84, 6);
    c.restore();
  }
  c.fillStyle = 'rgba(226,206,168,0.45)';
  for (const x of [-half*0.66, 0, half*0.66]){ c.fillRect(x-1, -11, 2, 2); c.fillRect(x-1, 9, 2, 2); }
  c.restore();
  if (d.bash > 0){
    const k = clamp(d.bash/DOOR_BASH_T, 0, 1);
    c.save();
    c.globalAlpha = 0.2 + k*0.55;
    c.strokeStyle = '#e0b070'; c.lineWidth = 1 + k*2.2;
    c.beginPath();
    if (d.vertical){ c.moveTo(d.x, d.y-half); c.lineTo(d.x, d.y+half); }
    else { c.moveTo(d.x-half, d.y); c.lineTo(d.x+half, d.y); }
    c.stroke();
    c.restore();
  }
}

// What is left once a pair comes off its hinges: planks on the floor and an empty doorway. It
// stays for the rest of the level, because a door you paid a charge for should still be open the
// next time you come through carrying something.
function drawDoorWreck(c, d){
  const half = DOOR_LEAF;
  c.save();
  c.translate(d.x, d.y);
  if (d.vertical) c.rotate(Math.PI/2);
  c.fillStyle = 'rgba(52,40,30,0.9)';
  const bits = [[-half*0.78, -4, 13, 3.4, 0.5], [-half*0.42, 5, 9, 3, -0.42],
                [half*0.5, -5, 11, 3.2, 0.34], [half*0.84, 4, 8, 3, -0.6]];
  for (const b of bits){
    c.save(); c.translate(b[0], b[1]); c.rotate(b[4]); c.fillRect(-b[2]/2, -b[3]/2, b[2], b[3]); c.restore();
  }
  if (d.splint > 0){
    c.globalAlpha = d.splint*0.5;
    c.fillStyle = '#d8c19a';
    for (const b of bits){ c.fillRect(b[0]-1, b[1]-1, 2, 2); }
  }
  c.restore();
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
  if (p.down) return;                    // your head is on the floor, drawn with the loot
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
  drawCrewStrip(c, hud);
  drawExtractBar(c, hud);
  drawReturnStrip(c, hud);

  drawPops(c);
  if (S.countdownActive) drawCountdown(c, hud);
  if (S.messageT > 0){
    // Above the thumb sticks, not under them: the sticks own the bottom band of a portrait frame.
    c.font = '600 14px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = `rgba(226,232,236,${Math.min(1,S.messageT)})`;
    c.fillText(S.message, hud.w/2, hud.msgY);
    c.textAlign = 'left';
  }

  // Both rings are painted where they LIVE and stay there. The left one is the move stick's actual
  // origin; the right one is a home marker for a stick that works on drag, and its knob shows which
  // way the character is currently facing while nobody is dragging it.
  ring(c, hud.left.x, hud.left.y, hud.left.r, stickL ? 'rgba(210,140,50,0.7)' : 'rgba(210,140,50,0.3)');
  const lk = stickL ? { x:clamp(stickL.x-stickL.ox,-hud.left.r,hud.left.r), y:clamp(stickL.y-stickL.oy,-hud.left.r,hud.left.r) } : {x:0,y:0};
  dot(c, hud.left.x+lk.x, hud.left.y+lk.y, hud.left.r*0.3, stickL ? 'rgba(230,160,60,0.9)' : 'rgba(210,140,50,0.45)');
  ring(c, hud.right.x, hud.right.y, hud.right.r, stickR ? 'rgba(210,140,50,0.7)' : 'rgba(210,140,50,0.3)');
  // The knob goes HOME when you let go, like every other joystick anybody has ever used.
  // WHY it did not, and why that was wrong: the facing FREEZES where you left it (doc C2-2), and
  // the idle knob used to lean that way so something on screen said where the frozen facing
  // pointed. It read as a stick that was stuck rather than as a needle - the owner asked why it
  // would not centre, which is the whole answer. The information was worth keeping; the disguise
  // was not. It is a TICK on the rim now: unmistakably a readout, unmistakably not the thumb.
  // SEE: docs/proposals/repo-2d-topdown.md F21-1.
  const rk = stickR ? { x:clamp(stickR.x-stickR.ox,-hud.right.r,hud.right.r), y:clamp(stickR.y-stickR.oy,-hud.right.r,hud.right.r) }
                    : { x:0, y:0 };
  const fa = Math.cos(p.dir), fb = Math.sin(p.dir);
  c.strokeStyle = stickR ? 'rgba(230,160,60,0.85)' : 'rgba(210,140,50,0.6)';
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(hud.right.x + fa*hud.right.r*0.80, hud.right.y + fb*hud.right.r*0.80);
  c.lineTo(hud.right.x + fa*hud.right.r*1.06, hud.right.y + fb*hud.right.r*1.06);
  c.stroke();
  dot(c, hud.right.x+rk.x, hud.right.y+rk.y, hud.right.r*0.3, stickR ? 'rgba(230,160,60,0.9)' : 'rgba(210,140,50,0.45)');

  if (S.shopMode){
    const def = testableInHand(p);
    const t = hud.test;
    c.beginPath();
    c.fillStyle = def ? 'rgba(38,16,15,0.72)' : 'rgba(16,18,20,0.55)';
    c.arc(t.x, t.y, t.r, 0, Math.PI*2); c.fill();
    ring(c, t.x, t.y, t.r, def ? 'rgba(200,70,60,0.9)' : 'rgba(90,70,68,0.45)');
    c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = def ? '#e6ebee' : '#6a6f74';
    c.fillText('Bắn thử', t.x, t.y - 1);
    c.font = '600 9.5px ui-monospace, monospace';
    c.fillText(def ? def.short : '—', t.x, t.y + t.r*0.62);
    c.textAlign = 'left';
  }
  // item slots
  for (let i=0;i<hud.slots.length;i++){
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
  const near = p.down ? null : nearestLoot(p);
  const grabLit = p.down ? (S.mates || []).some(a => !a.down)
                        : !!(near || p.held || p.pushing || nearCart(p));
  c.beginPath();
  c.fillStyle = grabLit ? 'rgba(14,34,24,0.72)' : 'rgba(16,18,20,0.55)';
  c.arc(hud.grab.x, hud.grab.y, hud.grab.r, 0, Math.PI*2); c.fill();
  ring(c, hud.grab.x, hud.grab.y, hud.grab.r, grabLit ? 'rgba(80,190,120,0.9)' : 'rgba(70,90,78,0.45)');
  c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
  c.fillStyle = grabLit ? '#e6ebee' : '#6a6f74';
  const grabLabel = p.down ? 'Xem' : p.pushing ? 'Buông' : p.held ? 'Thả'
                   : nearCart(p) && !near ? 'Đẩy xe' : 'Nhặt';
  c.fillText(grabLabel, hud.grab.x, hud.grab.y+4);

  // sprint button. Three states worth telling apart at a glance while something is chasing you:
  // off, on-and-burning, and empty (the bar ran out and you are back to a plain run).
  if (!S.shopMode){
    const sp = hud.sprint;
    const empty = p.stam < RUN_MIN_STAM;
    const live = p.sprinting;
    c.beginPath();
    c.fillStyle = live ? 'rgba(46,30,10,0.8)' : empty ? 'rgba(16,18,20,0.55)' : 'rgba(30,28,16,0.7)';
    c.arc(sp.x, sp.y, sp.r, 0, Math.PI*2); c.fill();
    // the stamina bar wrapped around the button itself — the number that decides whether pressing
    // it does anything, drawn on the thing you press
    c.beginPath(); c.strokeStyle = 'rgba(76,143,150,0.85)'; c.lineWidth = 3;
    c.arc(sp.x, sp.y, sp.r + 3, -Math.PI/2, -Math.PI/2 + Math.PI*2*clamp(p.stam/p.stamMax,0,1));
    c.stroke();
    ring(c, sp.x, sp.y, sp.r, live ? 'rgba(240,190,70,0.95)'
                             : empty ? 'rgba(90,84,66,0.45)' : 'rgba(190,160,70,0.7)');
    c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = live ? '#ffe6a8' : empty ? '#6a6f74' : '#d8cfa8';
    c.fillText(p.sprint ? 'Đang chạy' : 'Chạy', sp.x, sp.y+4);
  }

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
// Three small bars under your own, one per colleague. WHY it is worth the space: the whole point
// of the crew is that the level is being worked by four people, and a teammate you cannot check on
// is a teammate you will not notice dying. A downed one shows a head instead of a bar, and the
// banner underneath is the only place the game explains what being dead now means.
function drawCrewStrip(c, hud){
  if (S.shopMode || !S.mates || !S.mates.length) return;
  const x = 14, y0 = 40, w = Math.min(120, hud.w*0.30), h = 5;
  c.font = '600 9px ui-monospace, monospace';
  for (let i = 0; i < S.mates.length; i++){
    const a = S.mates[i], y = y0 + i*11;
    c.fillStyle = 'rgba(10,12,14,0.6)'; c.fillRect(x-3, y-3, w+34, h+5);
    c.fillStyle = a.down ? '#5a3030' : '#24303c';
    c.fillRect(x, y, w, h);
    if (!a.down){
      c.fillStyle = a.col.rim;
      c.fillRect(x, y, w*clamp(a.hp/a.hpMax, 0, 1), h);
    }
    c.fillStyle = a.down ? '#e08a8a' : '#9fb2c4';
    c.fillText(a.down ? a.name + ' ✝' : a.name, x + w + 5, y + h);
  }
  const p = S.player;
  if (p.down){
    const carried = S.loot.some(l => l.isHead && !l.gone && l.who === -1 && (l.held || l.inCart));
    const onPad   = S.loot.some(l => l.isHead && !l.gone && l.who === -1 && l.onPad);
    const msg = onPad   ? 'Đầu bạn đã ở trên bệ — bệ giao xong là bạn đứng dậy.'
              : carried ? 'Đồng đội đang vác đầu bạn tới bệ.'
                        : 'Bạn gục rồi. Chờ đồng đội tới nhặt đầu bạn mang ra bệ.';
    const watching = viewer();
    c.font = '600 13px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = 'rgba(8,10,13,0.72)';
    c.fillRect(0, hud.h*0.32, hud.w, 46);
    c.fillStyle = '#e6b8b0';
    c.fillText(msg, hud.w/2, hud.h*0.32 + 20);
    if (watching && watching !== p){
      c.font = '600 11px ui-monospace, monospace'; c.fillStyle = '#9fb2c4';
      c.fillText('đang xem ' + watching.name + ' — bấm Xem để đổi', hud.w/2, hud.h*0.32 + 38);
    }
    c.textAlign = 'left';
  }
}

// How far through the shift you are, as a bar. WHY the game needed one at all: the thing an entire
// shift is FOR had exactly two readouts — a number in the page header, which is outside the canvas
// and off the phone frame, and a countdown circle that only appears for the last five seconds.
// Between walking into a house and meeting the quota — which is nearly the whole shift — nothing on
// screen said how far along you were. Owner's call, 2026-08-27.
//
// It spans the WHOLE shift rather than the current pad: the notches are the pads, the fill runs
// through them, and the pair of numbers beside it is the pad being worked. A bar that showed only
// the current pad would read as "almost done" on the second of four.
function drawExtractBar(c, hud){
  if (S.shopMode || S.cut || !S.pads || !S.pads.length) return;
  const x = 14, y = 84, w = Math.min(200, hud.w*0.52), h = 9;
  const n = S.pads.length;
  const done = S.pads.filter(q => q.done).length;
  const pad = S.pads[S.padIndex];
  const frac = (pad && !pad.done) ? clamp(pad.value / Math.max(1, pad.quota), 0, 1) : 0;
  const k = clamp((done + frac) / n, 0, 1);
  const tick = FX.tickPulse > 0.5;

  c.fillStyle = 'rgba(10,12,14,0.72)';
  c.fillRect(x-3, y-14, w+6, h+20);

  c.font = '600 9px ui-monospace, monospace';
  let head, col;
  if (S.shiftLost)            { head = 'CA HỎNG — VỀ XE';  col = 'rgba(226,140,130,0.95)'; }
  else if (S.levelDone)       { head = 'XONG — VỀ XE';      col = 'rgba(150,225,190,0.95)'; }
  else if (S.countdownActive) { head = 'ĐANG GIAO ' + Math.ceil(S.countdown) + 's';
                                col = tick ? '#d6ffe8' : 'rgba(150,230,190,0.95)'; }
  else                        { head = 'BỆ ' + Math.min(done+1, n) + '/' + n;
                                col = 'rgba(150,190,170,0.95)'; }
  c.fillStyle = col;
  c.fillText(head, x, y - 5);

  // The two numbers are the PAD's, not the shift's: what you have put down against what this one
  // is asking for, which is the number you act on when deciding whether to go back out.
  if (pad && !pad.done && !S.shiftLost){
    c.textAlign = 'right';
    c.fillStyle = 'rgba(140,172,192,0.9)';
    c.fillText(money(pad.value) + ' / ' + money(pad.quota), x + w, y - 5);
    c.textAlign = 'left';
  }

  c.fillStyle = '#1b2a26'; c.fillRect(x, y, w, h);
  c.fillStyle = S.shiftLost ? '#7a4440'
              : S.countdownActive ? (tick ? '#d6ffe8' : '#8ef0b4')
              : frac >= 1 ? '#8ef0b4' : '#4c9a76';
  c.fillRect(x, y, w*k, h);
  // One notch per pad, so "two of four banked" is a shape rather than a number to read.
  c.fillStyle = 'rgba(10,12,14,0.9)';
  for (let i = 1; i < n; i++) c.fillRect(x + Math.round(w*i/n) - 1, y, 2, h);
  c.strokeStyle = 'rgba(120,160,140,0.32)'; c.lineWidth = 1;
  c.strokeRect(x+0.5, y+0.5, w-1, h-1);
}

// The countdown a dealt-with monster leaves behind. WHY it is on screen at all: a respawn the
// player cannot see is indistinguishable from a monster that happened to walk in, and the entire
// reason killing something is worth doing is that it buys a KNOWN window. The number IS the window.
// It reddens as the nearest one runs out, because this is a warning and not a scoreboard.
function drawReturnStrip(c, hud){
  if (S.shopMode || S.cut) return;
  const list = pendingReturns();
  if (!list.length) return;
  const y = 120;        // clear of the extraction bar above it and the minimap to its right
  c.font = '600 10px ui-monospace, monospace';
  c.textAlign = 'center';
  const line = '↻ ' + list.slice(0, 3).map(r => r.name + ' ' + Math.ceil(r.t) + 's').join('   ');
  const w = c.measureText(line).width + 18;
  c.fillStyle = 'rgba(10,12,14,0.62)';
  c.fillRect(hud.w/2 - w/2, y - 11, w, 16);
  const k = clamp(1 - list[0].t/FOE_RESPAWN, 0, 1);
  c.fillStyle = `rgb(${Math.round(mix(150,232,k))},${Math.round(mix(162,86,k))},${Math.round(mix(172,74,k))})`;
  c.fillText(line, hud.w/2, y);
  c.textAlign = 'left';
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
  let w = big ? Math.min(hud.w*0.6, 460) : Math.min(hud.w*0.34, 210);
  let h = w * (MH/MW);
  // Nằm ngang thì khung chỉ cao ~320px, mà bản đồ nhỏ vuông 210px ăn hai phần ba
  // chiều cao đó và đè lên cụm nút bên phải. Chặn theo CHIỀU CAO chứ không chỉ bề ngang.
  const capH = hud.h * (big ? 0.8 : (hud.w > hud.h ? 0.26 : 0.34));
  if (h > capH) { h = capH; w = h * (MW/MH); }
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

  // The crew. Heads are drawn ALWAYS, explored or not, and they pulse: this is the R.E.P.O. rule
  // that a dead colleague shows on the map as a red dot, and it is the only way a player who has
  // just watched a mate die two rooms away can find what is left of them.
  const pulse = 0.55 + 0.45*Math.sin(S.time*4);
  for (const a of (S.mates || [])){
    if (a.down) continue;
    c.fillStyle = a.col.rim;
    c.fillRect(x + a.x/TILE*sx - 2, y + a.y/TILE*sy - 2, 4, 4);
  }
  for (const l of S.loot){
    if (!l.isHead || l.gone) continue;
    c.fillStyle = `rgba(240,90,90,${0.55 + pulse*0.45})`;
    c.fillRect(x + l.x/TILE*sx - 3, y + l.y/TILE*sy - 3, 6, 6);
  }
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
  if (!S.player || S.dead || S.player.down || !S.running) return;   // never over the shop or the intro veil
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
function showStash(warn){
  const p = S.player;
  const full = p.inv.every(it => it);
  const slotRows = [0,1,2].map(i => {
    const it = p.inv[i];
    const def = it ? GEAR_BY_KEY[it.kind] : null;
    return `<button class="up" data-slot="${i}" ${it?'':'disabled'}>
      <span class="t">Ô ${i+1} — ${def ? def.name : 'trống'}</span>
      <span class="d">${def ? def.desc : 'Chọn một món bên dưới để đưa vào ô này.'}</span>
      <span class="p">${it ? 'x'+it.uses+' · bấm để TRẢ LẠI TỦ' : 'còn trống'}</span>
    </button>`;
  }).join('');
  const stashRows = S.stash.map((it,i) => {
    const def = GEAR_BY_KEY[it.kind];
    return `<button class="gear" data-stash="${i}">
      <span class="t">${def.name}</span>
      <span class="d">${def.desc}</span>
      <span class="p">x${it.uses} · ${full ? 'hết ô — trả một món ở trên xuống trước' : 'bấm để cầm lên'}</span>
    </button>`;
  }).join('') || `<div class="empty">Tủ trống. Đồ mua ở trạm dịch vụ sẽ nằm ở đây.</div>`;

  // Lời nhắc phải nằm TRONG bảng. toast() vẽ lên canvas, mà bảng này là một lớp phủ
  // đục 94% trùm kín canvas, nên mọi câu báo lỗi gửi qua toast đều rơi vào hư không.
  const warnRow = warn
    ? `<div class="empty" style="color:#e0a35a;border-color:#5a4320">⚠ ${warn}</div>` : '';

  showVeil('Tủ đồ trên xe',
    'Về tới trạm là ba ô trên tay tự trả hết về tủ. Lấy lại đồ trước khi vào nhà; thứ để lại vẫn còn nguyên cho ca sau.',
    'Đóng tủ', closeStash,
    `<div class="wallet">Ví: ${money(S.wallet)}</div>
     ${warnRow}
     <div class="seg">Ba ô trên tay${full ? ' — ĐÃ ĐẦY' : ''}</div><div class="shop">${slotRows}</div>
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
      const free = p.inv.findIndex(it => !it);
      if (free < 0){ showStash('Ba ô trên tay đã đầy — bấm một ô ở trên để trả món đó về tủ, rồi lấy món này.'); return; }
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
  // The label says what a press WILL DO, because the button is the only thing on screen that
  // tells you whether the house has anything in it - and it now starts with the house empty.
  const paintFoeBtn = () => {
    el('foeBtn').setAttribute('aria-pressed', S.noFoes ? 'true' : 'false');
    el('foeBtn').textContent = S.noFoes ? 'Bật quái' : 'Tắt quái';
  };
  el('foeBtn').onclick = () => {
    S.noFoes = !S.noFoes;
    paintFoeBtn();
    if (S.noFoes){ S.monsters.length = 0; toast('Nhà trống — không còn con nào'); }
    else {
      // An explicit press outranks the quiet-first-shift default: you asked for them.
      const n = populateFoes();
      toast(n ? 'Có ' + n + ' con vừa vào nhà' : 'Bật quái');
    }
  };
  paintFoeBtn();
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
  toggleStash, rollShop, startShop, leaveShop, togglePay, testHeld,
  testable(){ const d = testableInHand(S.player); return d ? d.key : null; },
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
  cartPassable, floodCart, routeToObjective, turnRate, coneRadius, carriedWeight,
  route(){ return routeToObjective(); },
  visibleRoute(){ return visibleRoute(); },
  checkShiftLost, endLostShift, recoverableValue, restockForQuota, restockSpots,
  restocked(){ return { times: S.restocks || 0,
                        pieces: S.loot.filter(l => l.restocked && !l.gone).length,
                        value: S.loot.filter(l => l.restocked && !l.gone)
                                     .reduce((a,l) => a + l.value, 0) }; },
  handWeight(){ return S.player ? handWeight(S.player) : 0; },
  pushWeight(){ return S.player ? pushWeight(S.player) : 0; },
  giveGear(key, n){
    const def = GEAR_BY_KEY[key];
    for (let i=0;i<(n||1);i++) S.stash.push({ kind:key, uses:def.uses });
    return S.stash.length;
  },
  equip(key){
    const i = S.stash.findIndex(it => it.kind === key);
    const free = S.player.inv.findIndex(it => !it);
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
  heldPointers(){ return heldPointers.size; },
  hud(){ return hudLayout(); },
  lastUse(){ return S.lastUse || null; },
  aiming(){ const p = S.player; return p && p.aimSlot >= 0
              ? { slot:p.aimSlot, x:p.aimX, y:p.aimY, angle:aimAngle(p, hudLayout()) } : null; },
  rushing(){ return !!(S.player && S.player.rushing); },
  fx(){ return { dread:FX.dread, shake:FX.shake, hitstop:FX.hitstop, flash:FX.flash,
                 hurtT:FX.hurtT, tickPulse:FX.tickPulse, spotT:FX.spotT,
                 pops:FX.pops.map(q=>q.text) }; },
  threat(){ return threatLevel(); },
  spawnAngel, litByTorch,
  // tổ ba người
  crew, crewAlive, downActor, reviveFromPad, truckPatchUp, spawnCrew, viewer, cycleSpectate,
  CREW: { COUNT:MATE_COUNT, HP:MATE_HP, SPEED:MATE_SPEED, FLEE_R:MATE_FLEE_R,
          REVIVE_HP:REVIVE_HP, TRUCK_HP:TRUCK_PATCH_HP, HEAD_MASS:HEAD_MASS },
  chatter(){ return (S.mates || []).filter(a => a.bubble)
                                   .map(a => ({ id:a.id, name:a.name, say:a.bubble })); },
  mates(){ return (S.mates || []).map(a => ({ id:a.id, name:a.name, x:a.x, y:a.y, hp:a.hp,
             hpMax:a.hpMax, down:a.down, job:a.job, held: a.held ? (a.held.isHead ? 'head' : 'loot') : null,
             target: a.target ? { x:a.target.x, y:a.target.y, isHead: !!a.target.isHead } : null })); },
  heads(){ return S.loot.filter(l => l.isHead && !l.gone).map(l => ({
             who:l.who, whoName:l.whoName, x:l.x, y:l.y, held:!!l.held,
             onPad:!!l.onPad, inCart:!!l.inCart, value:l.value })); },
  setCrew(on){ S.crewOn = !!on; if (!on) S.mates = []; else if (!S.mates.length) spawnCrew(); },
  killMate(i){ const a = (S.mates||[])[i]; if (a) downActor(a); return !!a; },
  killPlayer(){ downActor(S.player); return true; },
  toggleSprint,
  SPRINT: { MUL:RUN_MUL, NOISE:RUN_NOISE, MIN:RUN_MIN_STAM,
            BASE:PLAYER_BASE_SPEED, TIER:TIER_MUL, DRAIN:STAM_DRAIN, REGEN:STAM_REGEN,
            WALK: PLAYER_BASE_SPEED*TIER_MUL[1], RUN: PLAYER_BASE_SPEED*TIER_MUL[1]*RUN_MUL },
  // Kẻ soi gương
  spawnMirrors, damageMirror,
  MIRROR: { EVERY:MIRROR_EVERY, EMERGE:MIRROR_EMERGE, SPEED:MIRROR_SPEED, FAR:MIRROR_FAR,
            SLOW_FLOOR:MIRROR_SLOW_FLOOR, TORCH_MUL:MIRROR_TORCH_MUL, HP:MIRROR_HP,
            GRAB_R:MIRROR_GRAB_R, NEAR:MIRROR_NEAR, R:MIRROR_R },
  mirror(){
    const mr = S.mirror;
    if (!mr) return null;
    const pane = q => ({ x:q.x, y:q.y, hp:q.hp, hpMax:q.hpMax, ri:q.ri });
    return { phase:mr.phase, t:mr.t, a:pane(mr.a), b:pane(mr.b),
             master: mr.m ? { x:mr.m.x, y:mr.m.y, lit:mr.m.lit, reveal:mr.m.reveal,
                              away: Math.hypot(mr.m.x-mr.a.x, mr.m.y-mr.a.y) } : null };
  },
  mirrorTimer(){ return S.mirrorTimer; },
  // Kẻ húc
  ROOK: { WIND:ROOK_WIND, DASH_SPEED:ROOK_DASH_SPEED, OVERSHOOT:ROOK_OVERSHOOT,
          SELF_STUN:ROOK_SELF_STUN, LINGER:ROOK_LINGER, PLAYER_STUN:ROOK_PLAYER_STUN,
          WALL_DMG:ROOK_WALL_DMG, FOE_DMG:ROOK_FOE_DMG, HIT_R:ROOK_HIT_R, SIGHT:MONSTERS.rook.sight },
  rooks(){ return S.monsters.filter(m => m.type === 'rook').map(m => ({
             x:m.x, y:m.y, dir:m.dir, phase:m.rook, windT:m.windT, stun:m.stun,
             dashLeft:m.dashLeft, dashSpan:m.dashSpan || 0, dashAim:m.dashAim || 0,
             goal:m.goal ? { x:m.goal.x, y:m.goal.y, ri:m.goal.ri } : null,
             linger:m.linger, hp:m.hp })); },
  foeRevealed(i){ return foeRevealed(S.monsters[i||0]); },
  revealed(){ return S.monsters.map(m => m.reveal || 0); },
  MONSTERS, LEVEL_MONSTERS,
  // ---- the roster: three THINGS per house, and two of them are not bodies
  ROSTER: { SIZE:FOES_MAX, SCRIPTED:SCRIPTED_ROSTER, ANGEL:ANGEL_KIND, MIRROR:MIRROR_KIND,
            EVENTS:EVENT_KINDS, ALWAYS:STOCK_ALWAYS, NEVER:STOCK_NEVER },
  roster(){ return (S.roster || []).slice(); },
  rosterAt(lv){ return rosterForLevel(lv, Math.random); },
  rosterHas, bodyKinds, stockKinds, stockBodies,
  // ---- what a body leaves behind, and when it comes back
  FOE_LOOT: { PER_HP:FOE_LOOT_PER_HP, PER_DMG:FOE_LOOT_PER_DMG, SPREAD:FOE_LOOT_SPREAD,
              MAX:FOE_DROP_MAX, RESPAWN:FOE_RESPAWN },
  foeLootValue,
  drops(){ return { used: S.foeDrops || 0, left: foeDropsLeft(), max: FOE_DROP_MAX,
                    bags: S.loot.filter(l => l.fromFoe && !l.gone)
                                .map(l => ({ x:l.x, y:l.y, value:l.value, value0:l.value0,
                                             size:l.size, sizeIdx:l.sizeIdx, mat:l.mat.key,
                                             mass:l.mass, isBag: !!l.isBag })) }; },
  sizeForValue(v){ return sizeForValue(v); },
  SIZES, MATERIALS,
  extract(){
    const n = S.pads.length, done = S.pads.filter(q => q.done).length;
    const pad = S.pads[S.padIndex];
    const frac = (pad && !pad.done) ? clamp(pad.value / Math.max(1, pad.quota), 0, 1) : 0;
    return { pads:n, done, index:S.padIndex,
             value: pad ? pad.value : 0, quota: pad ? pad.quota : 0,
             padFrac: frac, shift: clamp((done + frac)/Math.max(1,n), 0, 1),
             counting: !!S.countdownActive, countdown: S.countdown,
             levelDone: !!S.levelDone, shiftLost: !!S.shiftLost };
  },
  killFoe(i){ const m = S.monsters[i|0]; if (!m) return null;
              const t = m.type; killMonster(m); return t; },
  respawns(){ return (S.respawns || []).map(r => ({ type:r.type, t:r.t })); },
  returns(){ return pendingReturns(); },
  // ---- what the player is shown about a monster
  foeAlerted(i){ return foeAlerted(S.monsters[i|0]); },
  foeVision(i){
    const m = S.monsters[i|0];
    if (!m) return null;
    const d = MONSTERS[m.type];
    return { type:m.type, dir:m.dir, alerted:foeAlerted(m), drawn:foeVisible(m),
             sightR: d.sight*TILE, coneHalf: foeConeHalf(m), nearR: FOE_NEAR_R,
             hearR: foeHearR(m), hearMax: d.hear*TILE };
  },
  spotted(){ return S.monsters.map(m => ({ seen:!!m.seen, spotT:m.spotT || 0 })); },
  angelDanger,
  // The average colour of the frame that is currently on screen. It exists so a check can ask
  // "is there more light on the floor now" without knowing where anything is in screen space —
  // reading a canvas back is slow, so this is a hook and nothing in the game ever calls it.
  frameAvg(){
    const cv = CV(), c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 16){ r += d[i]; g += d[i+1]; b += d[i+2]; }
    const n = d.length/16;
    return { r:r/n, g:g/n, b:b/n, lum:(r*0.299 + g*0.587 + b*0.114)/n };
  },
  HL: { FOE:HL_FOE, HUNT:HL_HUNT, ASLEEP:HL_ASLEEP },
  angel(){ const a = S.angel;
           return a ? { x:a.x, y:a.y, t:a.t, charge:a.charge, marked:a.marked, armed:!!a.armed,
                        unlitT:a.unlitT, phase:a.phase } : null; },
  lightZones(){ return S.lightZones.map(z => ({ x:z.x, y:z.y, r:z.r, t:z.t })); },
  angelTimer(){ return S.angelTimer; },
  ANGEL: { EVERY:ANGEL_EVERY, SETTLE:ANGEL_SETTLE, CHARGE:ANGEL_CHARGE, DRAIN:ANGEL_DRAIN,
           PATIENCE:ANGEL_PATIENCE, LIGHT_T:ANGEL_LIGHT_T, DMG:ANGEL_DMG, PUNISH:ANGEL_PUNISH },
  inSight, highlighted(){
    const p = S.player;
    return {
      loot: S.loot.filter(l => !l.gone && !l.held && !l.inCart && !l.onPad && inSight(l.x, l.y))
                  .map(l => ({ x:l.x, y:l.y, target: l === nearestLoot(p) })),
      cart: !!(S.cart && !p.pushing && inSight(S.cart.x, S.cart.y)),
      truck: inSight(S.car.x, S.car.y)
    };
  },
  heart(){ const hud = hudLayout();
           return { rate: FX.rate, bpm: Math.round(60/FX.rate), pulse: FX.beatPulse,
                    danger: Math.max(FX.dread, FX.hurtT*0.8),
                    x: hud.heart.x, y: hud.heart.y, r: hud.heart.r }; },
  mouseLook(){ return mouseFresh() ? mouseWorldNow() : null; },
  foesForLevel, makeNoise, lootCap, foeSeparation, separateFoes, populateFoes,
  FOES_FROM_LEVEL, FOES_MAX, PUSH_R,
  FOE: { STANDOFF:FOE_STANDOFF, SEP_R:FOE_SEP_R, SEP_PUSH:FOE_SEP_PUSH, BODY:FOE_BODY },
  doors(){ return (S.doors || []).map(d => ({ x:d.x, y:d.y, gx:d.gx, gy:d.gy, open:d.open,
                                              vertical:d.vertical, locked:!!d.locked,
                                              broken:!!d.broken, bash:d.bash })); },
  DOOR: { OPEN_R:DOOR_OPEN_R, OPEN_T:DOOR_OPEN_T, SHUT_T:DOOR_SHUT_T, SEE_AT:DOOR_SEE_AT,
          SPAN:DOOR_SPAN, LEAF:DOOR_LEAF, LOCK_FRAC:DOOR_LOCK_FRAC, LOCK_LEVEL:DOOR_LOCK_LEVEL,
          BASH_T:DOOR_BASH_T, PRY_REACH:PRY_REACH },
  doorHits, doorBlockedTile, doorBlocks, floodWalk, doorBlockMask,
  breakDoor(i){ return breakDoor(S.doors[i|0], 'test'); },
  walkBlocked(gx, gy){ return solidAt(gx, gy) || doorBlockedTile(gx, gy); },
  LOOT_CAP: { LEVEL:LOOT_CAP_LEVEL, VALUE:LOOT_CAP_VALUE, COUNT:LOOT_CAP_COUNT,
              BIG:LOOT_CAP_BIG, MED:LOOT_CAP_MED },
  relocateFoe(i){ return relocateFoe(S.monsters[i||0], Math.random); },
  soundOn(){ return SFX.on; },
  audio(){ return SFX.scoreState(); },
  audioLevel(){ return SFX.level(); },
  audioBand(lo, hi){ return SFX.band(lo, hi); },
  audioFired(){ return Object.assign({}, SFX.fired); },
  audioReset(){ for (const k in SFX.fired) delete SFX.fired[k]; },
  setHouseTimer(t){ FX.houseT = t; },
  AUDIO: { HOUSE_GAP, HUSH_FROM, HUSH_TO, HEARD_R:FOE_HEARD_R, BREATH_R:FOE_BREATH_R },
  mapFade(){ return S.mapFade || 0; },
  mapAlpha(){ return mix(MINIMAP_IDLE_ALPHA, MINIMAP_FADED_ALPHA, S.mapFade || 0); },
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
      sprint: !!(p && p.sprint), sprinting: !!(p && p.sprinting), stunT: p ? (p.stunT || 0) : 0,
      down: !!(p && p.down),
      crew: (S.mates || []).map(a => ({ name:a.name, hp:a.hp, down:a.down, job:a.job })),
      crewAlive: crewAlive().length,
      heads: S.loot.filter(l => l.isHead && !l.gone).length,
      blindT: p ? (p.blindT || 0) : 0, slowT: p ? (p.slowT || 0) : 0,
      knock: p ? Math.hypot(p.kx || 0, p.ky || 0) : 0,
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
      roster: (S.roster || []).slice(),
      foeDrops: S.foeDrops || 0,
      pendingReturns: pendingReturns().length,
      chasing: S.monsters.filter(m=>m.state==='chase').length,
      hunting: S.monsters.filter(m=>m.state==='hunt').length,
      foes: S.monsters.map(m=>({ type:m.type, x:m.x, y:m.y, state:m.state,
                                 alert:m.alert, lost:m.lost, tx:m.tx, ty:m.ty,
                                 reveal:m.reveal || 0, rook:m.rook || null })),
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
