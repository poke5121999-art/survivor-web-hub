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
const P_BLOCK = 1, P_TABLE = 2, P_SHELF = 3, P_CRATE = 4, P_LOCKER = 5;
// Ba món của hầm mộ, 2026-09-03. Quan tài đứng dựa tường, đá vụn đổ trên sàn, vò gốm.
const P_TOMB = 6, P_RUBBLE = 7, P_URN = 8;
// Chữ 'P' trong các mẫu phòng vẫn là 'P' — nó từng là planter, nay là tủ sắt (xem paintProp).
// Đổi chữ thì phải sửa lại toàn bộ mẫu phòng đã vẽ tay, mà cái đổi ở đây là NƯỚC SƠN.
const PROP_CH = { x:P_BLOCK, T:P_TABLE, S:P_SHELF, C:P_CRATE, P:P_LOCKER,
                  K:P_TOMB, R:P_RUBBLE, U:P_URN };
const FLOOR_STYLE = { wood:0, tile:1, concrete:2, carpet:3,
                      stone:4, da_cat:5, da_sam:6, da_thau:7 };
const STONE_TU = 4;   // từ chỉ số này trở đi là đá

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
// GIAO HÀNG giờ là một cái NÚT, không phải một cái đồng hồ tự chạy.
//
// Cũ: đủ chỉ tiêu là bệ tự đếm 5 giây rồi bắn. Người chơi không có tiếng nói nào trong khoảnh
// khắc đó — mà đó là khoảnh khắc đắt nhất tầng, vì bắn bệ là hét toáng vị trí mình cho cả nhà
// (xem EXTRACT_NOISE_R). Đặt nốt món cuối lên bệ rồi bị đồng hồ lôi đi là mất quyền chọn LÚC NÀO.
// Nay phải đứng lên nút và ở lại: bước ra là đồng hồ về 0, y như luật lên xe tải.
// SEE: nút giao hàng, 2026-08-31
const EXTRACT_COUNTDOWN = 5;      // giữ làm mốc mặc định cho cái vòng đếm trên HUD
const EXTRACT_HOLD = 3;           // giây phải ĐỨNG TRÊN NÚT

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

// ============================================================ hiệu ứng lúc thi triển kỹ năng
//
// Mười bốn kỹ năng của Biệt Đội trước đây đổi TRẠNG THÁI mà không đổi gì trên màn hình: bấm nút,
// đọc dòng toast, và tin. Thứ duy nhất nhìn thấy được là hệ quả — con quái đứng hình, cánh cửa
// bung ra — nên người chơi không bao giờ biết kỹ năng đã ăn hay chưa ăn, chỉ biết chuyện gì xảy
// ra sau đó. Một nút bấm tốn 30 giây hồi mà không có phản hồi ngay tại khoảnh khắc bấm thì cảm
// giác như nó không hoạt động.
//
// Không vẽ mười bốn hiệu ứng riêng. Bốn HỌ hình, mỗi họ trả lời một câu khác nhau về không gian,
// và mỗi kỹ năng chọn họ cộng màu của nó:
//   burst   — nở ra từ tâm: "chuyện này vừa lan tới ĐÂU" (loá sáng, sốc điện, mở toang)
//   dome    — một vùng đứng yên và ở lại: "chỗ này đang được giữ" (vòng hồi, lồng sắt)
//   implode — co vào tâm: "thứ gì đó vừa bị hút về đây" (tàng hình, kéo đồ)
//   aura    — bó sát người thi triển: "hiệu ứng nằm trên NGƯỜI này" (gồng, đóng băng)
// Vẽ ở lớp cộng sáng nên nó tự phát sáng trong tối, chỗ mà phần lớn kỹ năng được bấm.
// SEE: fx lúc cast kỹ năng, 2026-08-31
const CAST_T = 0.5;
function castFx(kind, x, y, opt){
  const o = opt || {};
  S.casts.push({ kind: kind || 'burst', x, y, t: 0,
                 dur: o.dur || CAST_T, r: o.r || TILE*3,
                 col: o.col || '255,232,170', tia: o.tia == null ? 10 : o.tia });
}
function stepCasts(dt){
  for (let i=S.casts.length-1;i>=0;i--){
    S.casts[i].t += dt;
    if (S.casts[i].t >= S.casts[i].dur) S.casts.splice(i,1);
  }
}
function drawCasts(c){
  for (const f of S.casts){
    const k = clamp(f.t/f.dur, 0, 1), om = (1-k)*(1-k);
    c.save();
    if (f.kind === 'dome'){
      // Đứng yên tại chỗ, viền dày lên rồi mỏng đi: một cái vùng, không phải một cú nổ.
      const g = c.createRadialGradient(f.x,f.y,f.r*0.25,f.x,f.y,f.r);
      g.addColorStop(0, 'rgba('+f.col+',0)');
      g.addColorStop(0.82, 'rgba('+f.col+','+(0.16*om)+')');
      g.addColorStop(1, 'rgba('+f.col+',0)');
      c.fillStyle = g; c.fillRect(f.x-f.r, f.y-f.r, f.r*2, f.r*2);
      c.beginPath(); c.strokeStyle = 'rgba('+f.col+','+(0.8*om)+')';
      c.lineWidth = 1.5 + 4*Math.sin(k*Math.PI);
      c.arc(f.x, f.y, f.r, 0, Math.PI*2); c.stroke();
    } else if (f.kind === 'aura'){
      // Bó quanh người thi triển, phồng nhẹ rồi xẹp. Bán kính nhỏ, vì nó nói về MỘT NGƯỜI.
      const R = 15 + 9*Math.sin(k*Math.PI);
      c.beginPath(); c.strokeStyle = 'rgba('+f.col+','+(0.9*om)+')';
      c.lineWidth = 3.2*(1-k) + 0.8; c.arc(f.x, f.y-10, R, 0, Math.PI*2); c.stroke();
      c.beginPath(); c.fillStyle = 'rgba('+f.col+','+(0.22*om)+')';
      c.arc(f.x, f.y-10, R*0.8, 0, Math.PI*2); c.fill();
    } else {
      // burst nở ra, implode co vào — cùng một hình, chạy ngược chiều nhau.
      const vao = f.kind === 'implode';
      const q = vao ? 1-k : k;
      const R = f.r*(0.12 + q*0.95);
      c.beginPath(); c.strokeStyle = 'rgba('+f.col+','+(0.85*om)+')';
      c.lineWidth = Math.max(1, f.r*0.10*(1-k)); c.arc(f.x, f.y, R, 0, Math.PI*2); c.stroke();
      if (f.tia > 0){
        c.strokeStyle = 'rgba('+f.col+','+(0.7*om)+')'; c.lineWidth = 1.8;
        c.beginPath();
        for (let i=0;i<f.tia;i++){
          const a = (i/f.tia)*Math.PI*2 + (vao ? -k : k)*0.5;
          const r0 = R*0.55, r1 = R*(vao ? 1.35 : 1.15);
          c.moveTo(f.x+Math.cos(a)*r0, f.y+Math.sin(a)*r0);
          c.lineTo(f.x+Math.cos(a)*r1, f.y+Math.sin(a)*r1);
        }
        c.stroke();
      }
      const cg = c.createRadialGradient(f.x,f.y,0,f.x,f.y,Math.max(3,f.r*0.42*(1-k)));
      cg.addColorStop(0, 'rgba(255,255,255,'+(0.85*om)+')');
      cg.addColorStop(1, 'rgba('+f.col+',0)');
      c.fillStyle = cg; c.fillRect(f.x-f.r, f.y-f.r, f.r*2, f.r*2);
    }
    c.restore();
  }
}

function stepFx(dt){
  stepCasts(dt);
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
  { name:'Phòng khách', floor:'da_thau', rows:[
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
  { name:'Nhà kho', floor:'da_sam', rows:[
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
  { name:'Bếp', floor:'da_cat', rows:[
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
  { name:'Hành lang', floor:'stone', rows:[
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
  { name:'Thư phòng', floor:'da_sam', rows:[
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
  { name:'Sân trong', floor:'da_cat', rows:[
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
  { name:'Phòng ngủ', floor:'da_thau', rows:[
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
  { name:'Phòng ăn', floor:'stone', rows:[
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
  { name:'Phòng tắm', floor:'da_cat', rows:[
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
    '#####################' ]},
  // HẦM MỘ — dựng từ tranh ý tưởng của chủ dự án, 2026-09-03.
  //
  // Thứ lấy ra từ tranh là BỐ CỤC, không phải điểm ảnh: một hành lang dọc cắt một hành lang ngang
  // thành hình chữ thập, bốn gian mộ nằm ở bốn góc, quan tài đá dựng thành hàng dựa bức tường
  // ngoài cùng của mỗi gian, đá vụn và vò gốm đổ trên sàn trước mặt chúng.
  //
  // Hai ràng buộc của bộ dựng phòng quyết định vì sao chữ thập nằm đúng chỗ này, không phải chỗ
  // khác: cửa được khoét ở GIỮA mỗi cạnh chung, nên cột 9-11 phải thông từ trên xuống và hàng 6-8
  // phải thông từ trái sang. Chính hai cái lằn ấy LÀ chữ thập trong tranh — bố cục kia vừa khít
  // vào luật sẵn có chứ không phải bẻ luật cho vừa nó.
  //
  // Bốn gian đều mở toang về phía hành lang ngang, không có cửa hẹp: xe đẩy rộng 40 điểm ảnh, mà
  // một lối một ô chỉ có 24 — bịt lại thành ra bốn gian mà cả vòng khuân đồ không vào được.
  { name:'Hầm mộ', floor:'stone', rows:[
    '#####################',
    '#K.K.K.K#...#K.K.K.K#',
    '#.......#...#.......#',
    '#.U...R.#...#.R...U.#',
    '#...L...#...#...L...#',
    '#.......#...#.......#',
    '#...................#',
    '#.........M.........#',
    '#...................#',
    '#.......#...#.......#',
    '#...L...#...#...L...#',
    '#.R...U.#...#.U...R.#',
    '#.......#...#.......#',
    '#K.K.K.K#...#K.K.K.K#',
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
  // MAU GAP DOI so voi ban truoc. Chu du an: "may con quai giay qua".
  // Mot con chet vi mot cu cham nhe thi khong bao gio nang duoc, va ca can nha mat luon
  // cai cam giac "co thu gi do dang di lai trong nay". Sat thuong sung duoc keo len MANH
  // HON ti le nay (xem SUNG ben duoi), nen thoi gian ha mot con KHONG dai ra - chi la moi
  // phat ban gio dang mot phat ban.
  patrol:  { name:'Kẻ đi tuần', hp: 85,  dmg:10,  cd:0.9, speed: 58, wind:0.42, sight:7.5, hear:0,   col:'#6b4a45', eye:'#ff6a4e', rim:'#e8b9ad',
             wiki:'Nhìn bằng mắt, ĐIẾC ĐẶC. Chạy ầm ầm sau lưng nó cũng không sao — nhưng đi vào nón nhìn thì nó thấy ngay. Nấp sau tường là xong chuyện.' },
  listen:  { name:'Kẻ nghe',    hp:150,  dmg:32,  cd:1.6, speed: 74, wind:0.58, sight:0,   hear:9.0, col:'#4a5566', eye:'#8fd4f0', rim:'#bcd6e6',
             wiki:'MÙ hẳn, nhưng nghe rất xa. Vòng nghe vẽ đúng bằng tiếng bạn đang gây ra: đứng yên thì vòng co lại gần bằng không. Rón rén đi ngang mặt nó vẫn thoát.' },
  stalk:   { name:'Kẻ bám',     hp:130,  dmg:30,  cd:1.1, speed: 66, wind:0.52, sight:8.5, hear:0,   col:'#453a5c', eye:'#cf87f0', rim:'#d3c0e6',
             wiki:'Mắt xa nhất nhà và đi nhanh. Mất dấu thì nó không về chỗ cũ mà dời sang một phòng gần bạn — nên chỗ vừa cắt đuôi nó không còn an toàn nữa.' },
  bomber:  { name:'Kẻ nổ',      hp: 60,  dmg:14,  cd:0.9, speed: 62, wind:0.46, sight:6.5, hear:3.0, col:'#6d5a33', eye:'#ffc25a', rim:'#e8d4a8',
             wiki:'Ít máu nhất, nhưng CHẾT LÀ NỔ. Đừng hạ nó khi đang ôm đồ hoặc đứng cạnh xe đẩy — vụ nổ làm vỡ hàng, và tiền vỡ thì không lấy lại được.' },
  heavy:   { name:'Kẻ nặng',    hp:620,  dmg:100, cd:1.8, speed: 40, wind:0.90, sight:6.0, hear:6.0, col:'#3f4b4e', eye:'#ff5a45', rim:'#c8d6d8',
             wiki:'Sáu trăm máu và một đòn gần trăm sát thương. Bù lại nó CHẬM: chạy là thoát, đánh là thua. Không có món nào trong tủ đáng đổi lấy việc đứng lại với nó.' },
  // Kẻ húc. It does not chase and it does not touch you while walking: its whole threat is one
  // straight line, announced three seconds before it is fired. Everything about it is built so the
  // counter-play is a step sideways and a wall between you, never a health bar.
  rook:    { name:'Kẻ húc',     hp:160,  dmg:26,  cd:1.2, speed: 54, sight:9.0, hear:0,   col:'#5b4a30', eye:'#ffc94e', rim:'#e2cfa4',
             wiki:'Không đuổi và không đụng bạn lúc đi. Nó ngắm MỘT đường thẳng, gồng ba giây lộ liễu rồi lao — và không bẻ lái được. Bước sang ngang một bước là xong; đứng sau tường thì càng chắc.' },

  // ------------------------------------------------------------------ hai loài đi theo ĐÀN
  //
  // Mọi con trên đây đi một mình: bộ sinh màn lấy đúng một con cho mỗi loài (xem chỗ đặt quái
  // trong buildLevel). Hai loài dưới đây phá luật đó — chúng chỉ đáng sợ khi đông, và mỗi con
  // lẻ thì gần như vô hại. `pack` là số con đặt quanh một chỗ.
  //
  // Cả hai KHÔNG rơi đồ (`noLoot`). Bản gốc R.E.P.O. cũng vậy: đây là hai loài duy nhất không
  // để lại soul orb, vì chúng không phải mối đe doạ để đổi lấy phần thưởng, chúng là thời tiết
  // xấu. Cho chúng rơi đồ là biến một đàn bốn con thành một mỏ tiền và hỏng cả hai luật.
  //
  // `knockMul` nhân vào cú hất của đòn đánh thường: cả hai nhẹ bỗng, một cú vụt là bay đi.
  // `lootDmg` thay hệ số mặc định 4 khi con quái đập vào món đang ôm trên tay.
  // SEE: đàn bom + đàn gnome, 2026-08-31

  // BOM CON. Thấy người là châm ngòi, và ngòi đã cháy thì KHÔNG tắt được — nó lao theo bạn với
  // một cái đồng hồ trên đầu. Đánh chết trước khi ngòi cháy hết thì nổ nhỏ, nên vụt cho nó bay
  // ra xa rồi mới giết là nước đi đúng. Vụ nổ làm vỡ đồ và kích luôn con bom bên cạnh.
  banger:  { name:'Bom con',    hp: 26,  dmg: 0,  cd:0.9, speed: 54, sight:6.0, hear:4.5, col:'#6a4630', eye:'#ff9a3c', rim:'#f0c090',
             pack:4, noLoot:true, knockMul:3.4, noMelee:true, body:6, tire:false,
             wiki:'Đi bốn con một đàn và KHÔNG đánh ai bao giờ. Thấy người là châm ngòi, áp được vào người thì cắm chân xuống đếm nốt ba phần tư giây rồi tự nổ. Nó chậm hơn bạn nhiều — chạy là thoát. Một cú vụt hất nó bay rất xa; đẩy ra chỗ trống rồi hạ.' },
  // GNOME. Không giết được ai, nhưng chuyên đập vào món bạn đang ôm — mối đe doạ của nó là VÍ
  // TIỀN chứ không phải thanh máu. Chạy tới giẫm lên là chết, nên cái giá của chúng là bạn
  // phải liên tục di chuyển, đúng lúc bạn muốn đứng yên mà khiêng đồ.
  gnome:   { name:'Gnome',      hp: 18,  dmg: 5,  cd:0.7, speed: 76, sight:7.0, hear:5.0, col:'#5a4a6a', eye:'#8cf0a0', rim:'#cfe6d6',
             pack:3, noLoot:true, knockMul:3.4, lootDmg:9, stomp:true, wind:0.34, body:6,
             wiki:'Ba con một đàn, gần như không làm bạn đau — nhưng cái búa của nó nhắm vào MÓN BẠN ĐANG ÔM. Chạy tới giẫm lên là chết, nên cái giá của chúng là bạn phải liên tục di chuyển.' }
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

function foeBody(m){ const d = MONSTERS[m.type]; return (d && d.body) || FOE_BODY; }
function separateFoes(){
  const ms = S.monsters;
  for (let i=0; i<ms.length; i++) for (let j=i+1; j<ms.length; j++){
    const a = ms[i], b = ms[j];
    const want = foeBody(a) + foeBody(b);      // hai thân, mỗi thân bán kính của chính loài nó
    // A rook mid-dash cannot steer and does not stop for bodies - it rams them. Nudging it here
    // would bend the one straight line its whole design is built on.
    if (a.rook === 'dash' || b.rook === 'dash') continue;
    let dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy);
    if (d >= want) continue;
    if (d < 0.01){ dx = (i & 1) ? 1 : 0; dy = (i & 1) ? 0 : 1; d = 1; }
    const push = (want-d)*0.5, ux = dx/d*push, uy = dy/d*push;
    moveEnt(a, -ux, -uy, foeBody(a));
    moveEnt(b,  ux,  uy, foeBody(b));
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
// TẦM ĐÁNH và HAI THÌ CỦA MỘT CÚ ĐÁNH. Xem chú thích dài ở chỗ dùng, trong stepMonsters.
const FOE_REACH = 22;        // tầm khơi mào một cú vung
const FOE_WHIFF = 1.30;      // tầm kiểm lúc đòn giáng: rộng hơn, nên phải lùi hẳn một bước mới né
const FOE_WIND  = 0.45;      // thì vung mặc định, giây — bảng MONSTERS đè lên bằng `wind`

// ĐUỔI LÂU THÌ MỆT, VÀ NGU ĐI — chủ dự án, 2026-09-03: "quái sau 1 lúc dí chạy phải mệt, ngu đi
// để user còn chạy thoát".
//
// Trước bản này một cuộc đuổi không có hồi kết theo bất cứ nghĩa nào: chừng nào còn thấy hoặc còn
// nghe được bạn thì m.alert được nạp lại 2.6 giây MỖI KHUNG HÌNH, tốc độ giữ nguyên nhân 1.25, và
// m.tx/m.ty bám đúng chỗ bạn đứng. Cắt đuôi chỉ xảy ra khi bạn khuất hẳn tầm — mà trong một căn nhà
// mở thì điều đó hiếm. Kết quả là chạy không thoát, và người chơi không có lựa chọn nào ngoài đánh.
//
// Ba nấc, và cả ba đều nhìn thấy được chứ không phải một con số giấu trong máy:
//   1. Hai giây rưỡi đầu nó chạy hết sức, y như cũ — một cuộc rượt phải đáng sợ ở đoạn đầu.
//   2. Từ đó tới FOE_TIRE_FULL nó ĐUỐI DẦN: tốc độ tụt về FOE_TIRE_SPD, và nó NGU ĐI theo đúng
//      nghĩa cơ học — chỗ nó nhắm tới thôi cập nhật mỗi khung hình mà chỉ làm mới mỗi FOE_TIRE_LAG
//      giây, nên nó chạy về chỗ bạn VỪA Ở chứ không phải chỗ bạn đang ở, và cắt cua thì trượt ra
//      ngoài. Đây là chỗ 'ngu đi' rẻ nhất và đọc ra rõ nhất: nó vẫn lao, chỉ là lao trượt.
//   3. Quá FOE_GIVEUP giây liền thì nó BỎ CUỘC hẳn: alert về 0, quay lại đi tuần, và phải nghỉ
//      FOE_REST giây mới đuổi hết sức lại được. Không có nấc này thì nấc 2 chỉ là giảm tốc vĩnh
//      viễn, và con quái vẫn lẽo đẽo sau lưng bạn suốt cả ván.
//
// Kẻ húc có cái đầu riêng và Bom con thì cả đời chỉ sống được vài giây (`tire:false`), nên cả hai
// đứng ngoài luật này.
const FOE_TIRE_AFTER = 2.5;  // giây chạy hết sức trước khi bắt đầu đuối
const FOE_TIRE_FULL  = 8.0;  // tới đây là mệt hết cỡ
const FOE_TIRE_SPD   = 0.60; // hệ số tốc độ lúc mệt hết cỡ
const FOE_TIRE_LAG   = 0.85; // lúc mệt, bao lâu mới làm mới chỗ nhắm một lần
const FOE_GIVEUP     = 12.0; // đuổi liền chừng này giây là bỏ cuộc
const FOE_REST       = 6.0;  // và nghỉ chừng này giây mới lại sung
function foeTired(m){ return m.tired || 0; }
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
// Hai ải đầu trong bảng trên KHÔNG có một cái thân nào: tượng và gương đều là sự kiện của căn
// nhà chứ không phải quái đi lại, nên bodyKinds() trả về rỗng và hai ải đó là hai căn nhà trống.
// Chủ dự án, 2026-08-31: ải 1 và 2 bốc thêm một đàn. Bốc trong hai loài ĐI ĐÀN, vì đúng hai
// loài đó là thứ dạy được người mới mà không giết họ: Bom con không gây sát thương trực tiếp,
// Gnome gần như không đau và giẫm lên là chết. Chúng dạy "lùi về đâu" và "đừng đứng yên" —
// hai câu hỏi mà phần còn lại của game sẽ hỏi lại bằng những con đắt hơn nhiều.
const PACK_KINDS = ['banger', 'gnome'];
const SCRIPTED_PACK_LV = 2;        // ải 1..2 được thêm một đàn
function rosterForLevel(lv, rnd){
  if (lv >= 1 && lv <= SCRIPTED_ROSTER.length){
    const r = SCRIPTED_ROSTER[lv-1].slice();
    const bo = rnd || Math.random;
    if (lv <= SCRIPTED_PACK_LV) r.push(PACK_KINDS[(bo()*PACK_KINDS.length)|0]);
    return r;
  }
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
  { key:'pry',     name:'Xà beng',         short:'Phá',  desc:'Phá cánh cửa bị kẹt ngay trước mặt. Ồn.',              uses:3, price: 5000,  stock:4 },
  // Súng nòng ngắn của bản gốc: sát thương thô mạnh nhất trong nhà, một hai phát là xong hầu hết,
  // đắt, và giật kinh khủng. Ở đây cái giật được dịch thành hai thứ người chơi thấy ngay: thân bị
  // đẩy lùi, và chân chậm lại một nhịp. Nên nó là khẩu súng của một quyết định, không phải khẩu
  // súng để bấm liên tục — bắn hụt ở khoảng cách xa là mất một viên đắt tiền mà chẳng được gì.
  { key:'shotgun', name:'Súng nòng ngắn',  short:'Hoa cải', desc:'Bảy viên toé ra một nón ngắn. Sát mặt thì nát, xa thì phí đạn. Giật lùi và làm bạn chậm một nhịp.', uses:6, price: 26000, stock:2, aim:true, test:true },
  // Khẩu này KHÔNG có trong bản gốc — nó là của chủ dự án. Cơ chế sạc dựng thẳng lên cử chỉ ngắm
  // đã có sẵn: giữ ô đồ là đang sạc, buông tay là bắn. Không thêm một nút nào, không thêm một luật
  // nào phải dạy — cái người chơi vốn đã làm để ngắm giờ mang thêm ý nghĩa.
  { key:'laser',   name:'Súng laser sạc',  short:'Laser', desc:'Giữ để sạc, buông là bắn. Tia xuyên thẳng qua mọi thứ trên đường. Sạc đầy thì mạnh gấp bốn, nhưng vét sạch hơi.', uses:5, price: 22000, stock:2, aim:true, test:true, charge:true }
];
const GEAR_BY_KEY = {};
for (const g of GEAR) GEAR_BY_KEY[g.key] = g;

// ============================================================ xe máy
// HAI CHIẾC, đúng như bản gốc: bản cập nhật 07/05/2026 của R.E.P.O. thêm đúng hai xe, mỗi
// chiếc MỘT CHỖ NGỒI, và luật quan trọng nhất của chúng là "không dùng được đồ khi đang lái".
// Bản gốc chia đôi vai trò: một chiếc nhanh để do đường và cắt đuôi, một chiếc chở được đồ.
// Ở đây giữ nguyên cách chia đó, vì nó là thứ làm hai chiếc xe thành hai LỰA CHỌN chứ không
// phải hai bản sao.
//   Xe trinh sát — nhanh hơn mọi con quái trong nhà, không chở được gì.
//   Xe chở đồ    — chậm hơn một nhịp, có thùng sau.
// Cả hai đều húc được quái: bản gốc gọi đó là "boosted impacts", và đó là cách duy nhất một
// người đang ngồi trên xe có thể làm gì đó với con đang đuổi mình.
const BIKE_KINDS = {
  scout: { id:'scout', name:'Xe trinh sát', speed: 205, slots: 0, fuel: 26,
           col:'#4d6b78', rim:'#9fd0dc' },
  haul:  { id:'haul',  name:'Xe chở đồ',    speed: 168, slots: 4, fuel: 34,
           col:'#6d5c34', rim:'#e0c07a' }
};
const BIKE_R          = 15;
const BIKE_ACCEL      = 540;      // px/s² — xe phải có ĐÀ, không thì nó chỉ là đi bộ nhanh
const BIKE_TURN       = 4.4;      // rad/s: bẻ lái mất thời gian, nên không thể đi ngang như đi bộ
const BIKE_DRAG       = 2.1;      // buông ga thì trôi dần chứ không dừng khựng
const BIKE_RAM_MIN    = 95;       // dưới tốc này thì húc chỉ là chạm nhẹ
const BIKE_RAM_DMG    = 0.62;     // sát thương = tốc độ × hệ số: chạy chậm húc thì không ăn thua
const BIKE_RAM_KNOCK  = 430;
const BIKE_RAM_CD     = 0.45;     // một con chỉ ăn một cú húc trong ngần này giây
const BIKE_CRASH_SPD  = 150;      // đâm tường nhanh hơn thế là NGÃ
const BIKE_CRASH_DMG  = 12;
const BIKE_DOWN_T     = 2.4;      // xe nằm bao lâu trước khi dựng lên được
// XĂNG. Chủ dự án: "xe sẽ có xăng nên hết xăng thì qua map sau mới hồi".
// Đó là thứ giữ cho hai chiếc xe không xoá sổ cả phần đi bộ của trò chơi: chúng là một tài
// nguyên tiêu hao trong MỘT tầng, không phải một cách di chuyển mới. Không có bình xăng nào
// mua được, không có cách nào đổ thêm giữa tầng — hết là hết, và tầng sau xe mới lại đầy.
const BIKE_FUEL_RUN   = 1.0;      // xăng/giây khi kéo hết ga
const BIKE_FUEL_IDLE  = 0.22;     // nổ máy đứng yên vẫn tốn
// ...nhưng hết xăng thì LẾT được. Bản cũ khoá hẳn: mountBike từ chối xe cạn bình, mà đường duy
// nhất dỡ thùng hàng lại là dismountBike đúng trên bệ đang mở — nên cạn bình ở giữa nhà là cả
// thùng hàng nằm đó tới hết ván. Người chơi mất hàng vì một luật họ không thấy trước.
// Giờ máy chết thì dắt bộ: chậm hơn đi bộ, không húc nổi ai, không ngã, nhưng LUÔN về được tới xe
// tải. Cái giá của hết xăng là thời gian, không phải mất trắng chỗ hàng đã khiêng cả ván.
// SEE: xe hết xăng thì cho lết về, 2026-08-31
const BIKE_PUSH_SPEED = 52;       // px/s khi dắt bộ (đi bộ là 92)
const BIKE_PUSH_ACCEL = 150;

function makeBike(kind, x, y, dir){
  const d = BIKE_KINDS[kind];
  return { kind, x, y, dir: dir || 0, spd: 0, r: BIKE_R,
           fuel: d.fuel, fuelMax: d.fuel, items: [], rider: null, downed: 0, warned: false };
}
function bikeDef(b){ return BIKE_KINDS[b.kind]; }
function bikeValue(b){ return b.items.reduce((a,l)=> a + (l.gone?0:l.value), 0); }
function bikeFits(b, l){
  const d = bikeDef(b);
  return d.slots > 0 && b.items.length < d.slots && l.value < CART_MAX_VALUE;
}
// Tầm leo lên xe HẸP HƠN tầm nhặt đồ, và cố ý.
//
// Cũ nó mượn grabRange (1,9 ô, còn nới thêm theo nâng cấp Với Xa) cộng bán kính xe: 60px, hai
// ô rưỡi. Nút Nhặt đổi chữ thành "Lên xe" từ khoảng cách đó, tức là đi ngang qua chỗ đậu xe
// trên đường tới chỗ khác là nút đã đổi mặt — và bấm Nhặt lúc ấy thì leo lên xe thay vì nhặt
// cái mình đang tới lấy. Với Xa càng cao thì càng dễ dính.
// Nay phải đứng SÁT xe. Cùng một hàm cho cả nút lẫn hành động, nên chữ trên nút luôn đúng với
// việc bấm nó sẽ làm. SEE: siết tầm lên xe, 2026-08-31
const BIKE_MOUNT_R = TILE * 0.95;
function nearestBike(p, extra){
  let best = null, bd = 1e9;
  for (const b of (S.bikes || [])){
    if (b.rider && b.rider !== p) continue;
    const d = Math.hypot(b.x-p.x, b.y-p.y);
    if (d < bd && d < b.r + BIKE_MOUNT_R + (extra||0)){ bd = d; best = b; }
  }
  return best;
}

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
// Xe cho theo GIA TRI, khong theo kich co.
// WHY doi: luat cu la "mon co 'to' thi khong len xe duoc", va no chia the gioi sai
//   cho. Mot cai tu go re tien la thu dung phai chat len xe day; mot cai lo su nho
//   xiu 40.000 lai la thu phai OM TRONG TAY va di cham, vi do la lan mo cua ca ca.
//   Chia theo gia tri thi cai xe co dung mot cau chuyen: no cho HANG RE, con hang
//   dat thi ban tu chiu trach nhiem tung mon mot.
// Lay l.value chu khong phai l.value0: mon vua bi me mot goc gia con 18.000 thi cho
//   len xe duoc that - gia tri no dang co moi la thu quan trong.
const CART_MAX_VALUE  = 20000;

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
// Nobody presses anything: the source game's doors are pushed through, and a button to open a door
// is a fifth input on a screen that already has four too many.
//
// A door is PUSHED, and it opens exactly as far as you have pushed it.
//
// It used to swing itself: anything alive inside a 3.6-tile box opened it in 0.22s, and sight
// unblocked in one step the moment it passed 0.55 - so the next room appeared, whole, 0.12s after
// you wandered near the doorway, whether or not you were even walking at it. That is a supermarket
// door. Walking past a doorway two tiles off the centre line opened it. Standing still held it open.
// The one moment this game is built around - the black rectangle you have not looked into yet - was
// being handed away for free, before you had decided to look.
//
// The rule now: the leaf is shoved out of the space your body is taking. Cross the last tile toward
// the plane and the pair swings by exactly that fraction, so the reveal runs at the speed of your
// own feet and STOPS when you stop. You can hold at a third open and read the room through the slit
// (see doorSegs - the sight test is the real geometry now, not a threshold). Come at it running and
// the shove carries: the leaf keeps swinging after you have let go of it.
// SEE: wall + door pass, 2026-08-31, and Darkwood's "run into it and it slams open" doors.
const DOOR_REACH    = 1.0*TILE;   // how close to the leaf plane a body has to be to be touching it
const DOOR_SLAM     = 130;        // px/s across the plane that reads as a shove rather than a lean
const DOOR_SWING    = 190;        // a shove at this speed is worth one full swing per second
const DOOR_DRAG     = 2.2;        // 1/s, how fast a flung leaf loses the swing it was given
// It still falls shut eventually, but slowly and only after it has been left alone. Frictional's
// rule for Amnesia was that a door holds the state you left it in, and a 1.1s slam-shut broke that
// every time you stepped back to look. Nine seconds after a two-and-a-half second pause never
// fights you, and it keeps "that door is open, something came through it" worth reading.
// Bề ngang thân người trải trên TRỤC CỬA, dùng để biết nó chạm cánh nào. Rộng hơn bán kính va
// chạm thật (7,5) một chút: hai vai và cái đèn trong tay cũng đẩy được cửa, và một con số sát
// quá thì đi đúng giữa lại không chạm cánh nào.
const BODY_ON_DOOR  = 10;
const DOOR_HOLD     = 2.5;        // seconds a leaf keeps the angle you left it at
const DOOR_SAG_T    = 9;          // and how long the hinge then takes to sag it shut, wide to zero

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
// PHANG DEN PIN VAO CUA KET. Xa beng van la duong nhanh - mot nhat la xong - con
// day la duong AI CUNG CO, doi lai bang thoi gian va bang tieng dong.
// WHY no khong dung chung bo dem d.bash voi quai: bo dem do la mot dong ho chay lien
//   tuc (1,6 giay ap vai), con cai nay la tung nhat mot. Cong nhat vao dong ho chay
//   thi phan tut giua hai nhat (0,55 giay) an het phan vua cong, va cai cua khong
//   bao gio vo - mot nut bam khong bao gio ra ket qua la mot nut hong.
const DOOR_PRY_HITS   = 9;        // so nhat can de bung mot canh, neu phang lien tay
const DOOR_PRY_DECAY  = 0.35;     // nhat/giay khi ngung tay: khong go dan qua ca man duoc
const DOOR_PRY_R      = 34;       // tam voi cua cu phang vao cua
const DOOR_BREAK_NOISE = 11*TILE; // splintering wood is loud, and the house hears it

function makeDoor(gx, gy, vertical){
  return { gx, gy, x:(gx+0.5)*TILE, y:(gy+0.5)*TILE, vertical, side:1,
           // Hai cánh, hai đời riêng: [0] bản lề bên âm, [1] bên dương. `open` là góc của cánh
           // mở nhiều nhất, giữ lại cho mọi chỗ chỉ cần hỏi "cửa này có mở không".
           leaf:[0,0], lside:[1,1], lvel:[0,0], lidle:[0,0],
           open:0, pry:0,
           locked:false, broken:false, bash:0, splint:0, warned:0 };
}

// How far across the opening ONE leaf still stands, in px, measured from its own jamb inward.
//
// A leaf hinged at the jamb and swung by t*90 degrees lies across cos(t*90) of its own length - so
// a pair a third open leaves a slit down the middle and still hides everything either side of it.
// This replaces a threshold: sight used to be all-or-nothing at open >= 0.55, which meant a door
// nudged halfway hid exactly as much as a shut one and then the whole room arrived in one frame.
// The number here is the same one drawDoors rotates the art by, so what you can see through a door
// is now what the door LOOKS like - the crack you are peering through is the crack that is there.
function doorCover(d, i){
  if (d.broken) return 0;
  if (d.locked) return DOOR_LEAF;                 // boards nailed across it: no crack, ever
  return DOOR_LEAF * Math.cos(clamp(d.leaf[i],0,1) * Math.PI/2);
}

// The pair as up to two occluding segments, one hugging each jamb. Callers get [x0,y0,x1,y1].
function doorSegs(d, out){
  out.length = 0;
  // Từng cánh che phần của riêng nó. Mở một cánh thì khe hở lệch hẳn về một bên chứ không phải
  // một khe cân giữa — và đó đúng là thứ mắt thấy, nên đúng là thứ tia nhìn phải gặp.
  for (let i = 0; i < 2; i++){
    const cov = doorCover(d, i);
    if (cov < 0.5) continue;                      // cánh này mở đủ rộng, không còn chắn gì
    const k = i ? 1 : -1;
    const a = k*DOOR_LEAF, b = k*(DOOR_LEAF-cov);
    const lo = Math.min(a,b), hi = Math.max(a,b);
    out.push(d.vertical ? [d.x, d.y+lo, d.x, d.y+hi] : [d.x+lo, d.y, d.x+hi, d.y]);
  }
  return out;
}

// Every floor tile sitting on a room boundary is a doorway. Only the middle tile of each opening
// carries the pair - the openings are carved three wide, and the pair spans all three.
function buildDoors(rnd){
  S.doors = [];
  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
    const my = cy*RH + (RH>>1), mx = cx*RW + (RW>>1);
    // The pair hangs in the tile the wall used to occupy. With a two-tile partition the leaf sat
    // half a tile off the wall's centre and visibly favoured one room; on a one-tile seam it is
    // centred for free.
    if (cx < GX-1){
      const col = (cx+1)*RW-1;
      if (S.grid[my*MW+col] === FLOOR) S.doors.push(makeDoor(col, my, true));
    }
    if (cy < GY-1){
      const row = (cy+1)*RH-1;
      if (S.grid[row*MW+mx] === FLOOR) S.doors.push(makeDoor(mx, row, false));
    }
  }
  const r = rnd || Math.random;
  // Chiều mở KHÔNG còn tung đồng xu lúc dựng nhà. Từng cánh tự quyết lúc bị đẩy, theo hướng
  // người đẩy đang đi — xem stepDoors. Đồng xu là lý do trước đây một nửa số cửa trong nhà mở
  // thẳng vào mặt người mở nó.
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
  d.broken = true; d.locked = false; d.open = 1; d.bash = 0; d.pry = 0; d.splint = 1;
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
  // Where each body stood last frame, so a door can tell a shove from a lean. Kept on the body
  // rather than in a map because monsters come and go and a stale entry would push a door on its
  // own. A body seen for the first time has not moved yet.
  for (const b of bodies) if (b.doorPx === undefined){ b.doorPx = b.x; b.doorPy = b.y; }
  for (const d of S.doors){
    if (d.splint > 0) d.splint = Math.max(0, d.splint - dt*0.6);
    if (d.warned > 0) d.warned = Math.max(0, d.warned - dt);
    if (d.locked && !d.broken){
      d.open = 0; d.leaf[0] = d.leaf[1] = 0;
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
      // Phan nguoi choi phang vao, tut dan khi ngung tay.
      if (d.pry > 0){
        d.pry = Math.max(0, d.pry - DOOR_PRY_DECAY*dt);
        if (d.pry >= DOOR_PRY_HITS){ breakDoor(d, 'bash'); continue; }
      }
      const was = d.bash;
      d.bash = bashing ? d.bash + dt : Math.max(0, d.bash - dt*0.5);
      // wood under load, once a beat, so you can hear it coming through before it does
      if (bashing && Math.floor(was/0.45) !== Math.floor(d.bash/0.45) &&
          Math.hypot(d.x-S.player.x, d.y-S.player.y) < 14*TILE) SFX.strain();
      if (d.bash >= DOOR_BASH_T) breakDoor(d, 'bash');
      continue;
    }
    if (d.broken){ d.open = 1; d.leaf[0] = d.leaf[1] = 1; continue; }   // a hole, for good
    const was = d.open;
    // MỖI CÁNH MỘT ĐỜI RIÊNG. Trước đây cả cặp dùng chung một góc mở, nên chạm vào cánh trái là
    // cánh phải cũng bật ra — một cái cửa hai cánh cư xử như một tấm cửa lùa. Nay `leaf[0]` là
    // cánh bản lề bên âm, `leaf[1]` bên dương, và thân người chỉ đẩy được cánh nào nó THỰC SỰ
    // chạm vào: lấy bề ngang thân trải trên trục cửa rồi cắt với khoảng mà từng cánh phủ.
    // Đi lệch một bên thì chỉ một cánh mở; đi giữa thì cả hai, vì lúc đó bạn chạm cả hai thật.
    //
    // CHIỀU MỞ lấy từ HƯỚNG ĐANG ĐI, không phải từ chỗ đang đứng. Bản cũ đọc dấu của `across`
    // đúng lúc `touch` lớn nhất — mà lúc đó thân người nằm NGAY TRÊN mặt phẳng cửa, chỗ dấu ấy
    // lật qua lật lại: đi từ trái sang, vượt quá 2px là nó đọc thành "người đứng bên phải" và
    // đẩy cánh ngược vào mặt. Hướng đi thì không mơ hồ ở bất kỳ khung hình nào.
    // SEE: cửa mở đúng chiều, từng cánh một, 2026-08-31
    const cham = [0, 0], xo = [0, 0], huong = [0, 0];
    for (const b of bodies){
      const along  = d.vertical ? b.y-d.y : b.x-d.x;
      const across = d.vertical ? b.x-d.x : b.y-d.y;
      if (Math.abs(along) > DOOR_LEAF + 8) continue;        // beside the opening, not in it
      if (Math.abs(across) > DOOR_REACH) continue;          // not near enough to be leaning on it
      const t = 1 - Math.abs(across)/DOOR_REACH;
      // Only motion INTO the plane counts. Walking parallel past a doorway pushes nothing, which is
      // the single biggest difference from the old proximity rule, and walking AWAY after you are
      // through does not keep dragging the leaf round.
      const mv = d.vertical ? b.x - b.doorPx : b.y - b.doorPy;
      // Nothing walks a whole tile in one frame. A step that big is a TELEPORT - relocateFoe moving
      // a monster to the far side of the house, a respawn, REPO.warp - and reading it as a shove
      // would blow a door off its hinges from across the map.
      const that = Math.abs(mv) < TILE;
      const lo = along - BODY_ON_DOOR, hi = along + BODY_ON_DOOR;
      for (let i = 0; i < 2; i++){
        const k = i ? 1 : -1;
        const a0 = Math.min(0, k*DOOR_LEAF), a1 = Math.max(0, k*DOOR_LEAF);
        if (hi < a0 || lo > a1) continue;                   // thân không chạm tới cánh này
        if (t > cham[i]){
          cham[i] = t;
          if (that && mv) huong[i] = mv > 0 ? 1 : -1;
        }
        if (that && across*mv <= 0) xo[i] = Math.max(xo[i], Math.abs(mv)/Math.max(dt, 1e-4));
      }
    }
    for (let i = 0; i < 2; i++){
      // Cánh xoay THEO chiều người đẩy đang đi. Chỉ đổi chiều khi cánh gần như đã khép: một cánh
      // đang mở dở mà lật chiều là nó quét xuyên qua chính cái thân vừa đẩy nó.
      if (huong[i] && d.leaf[i] < 0.12) d.lside[i] = d.vertical ? -huong[i] : huong[i];
      if (xo[i] > DOOR_SLAM) d.lvel[i] = Math.max(d.lvel[i], xo[i]/DOOR_SWING);
      if (d.lvel[i] > 0){
        d.leaf[i] = clamp(d.leaf[i] + d.lvel[i]*dt, 0, 1);
        d.lvel[i] = Math.max(0, d.lvel[i] - DOOR_DRAG*d.lvel[i]*dt);
        if (d.lvel[i] < 0.02 || d.leaf[i] >= 1) d.lvel[i] = 0;
      }
      if (cham[i] > d.leaf[i]) d.leaf[i] = cham[i];   // bề ngang thân, không bao giờ kéo ngược lại
      if (cham[i] > 0 || d.lvel[i] > 0) d.lidle[i] = 0; else d.lidle[i] += dt;
      if (d.lidle[i] > DOOR_HOLD) d.leaf[i] = Math.max(0, d.leaf[i] - dt/DOOR_SAG_T);
    }
    // `open` là góc của cánh mở NHIỀU NHẤT. Giữ lại vì cả bộ kiểm, HUD lẫn lớp ngoài đều hỏi một
    // câu duy nhất: "cái cửa này có mở không". Phần hình học thì đọc thẳng từng cánh.
    d.open = Math.max(d.leaf[0], d.leaf[1]);
    const xoNhat = Math.max(xo[0], xo[1]);
    const heard = Math.hypot(d.x-S.player.x, d.y-S.player.y) < 10*TILE;
    // the hinge as it starts to move, either way, and the bang of a door that was shoved
    if (heard && was < 0.02 && d.open >= 0.02) SFX.hinge(true);
    if (heard && was > 0.02 && d.open <= 0.02) SFX.hinge(false);
    if (heard && xoNhat > DOOR_SLAM && was < 0.35 && d.open >= 0.35) SFX.thud();
  }
  for (const b of bodies){ b.doorPx = b.x; b.doorPy = b.y; }
}

// A closed door is a wall as far as any sightline is concerned - the player's torch, a monster's
// eyes, the AEngel's beam check, all of them, because they all come through losClear.
const doorSegScratch = [];
function doorBlocks(x0, y0, x1, y1){
  if (!S.doors) return false;
  for (const d of S.doors){
    // Two leaves, each covering only what it still covers at this swing angle - so a door eased a
    // crack open lets a sightline through the middle and nothing else.
    for (const s of doorSegs(d, doorSegScratch)){
      const ax = s[0], ay = s[1];
      const dx = x1-x0, dy = y1-y0, ex = s[2]-ax, ey = s[3]-ay;
      const den = dx*ey - dy*ex;
      if (Math.abs(den) < 1e-9) continue;
      const px = ax-x0, py = ay-y0;
      const t = (px*ey - py*ex) / den;
      const u = (px*dy - py*dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) return true;
    }
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
  // Một cái đồng hồ đếm ngược trên HUD, dùng chung cho ba việc: bệ rút hàng, trả tiền ở shop, và
  // đứng chờ xe tải lăn bánh. Chỉ một việc chạy tại một thời điểm, nên `max` và `label` đi kèm để
  // cái vòng tròn biết vẽ đúng phần trăm và gọi đúng tên việc.
  casts: [],                                 // hieu ung dang chay cua ky nang vua thi trien
  countdown: 0, countdownActive: false, countdownMax: EXTRACT_COUNTDOWN, countdownLabel: 'GIAO HÀNG',
  board: 0,                                  // giây đã đứng trong thùng xe tải
  player: null,
  upg: newUpgrades(),
  upgSpawned: {},                  // how many times each upgrade has been ROLLED into a shop
  gearBought: {},                  // how many times each gear has been bought this run
  stash: [],                       // the shared locker on the truck; bought gear lands here
  offer: null,                     // the stock this shop visit rolled, held so it cannot re-roll
  stashOpen: false,
  running: false, dead: false, levelDone: false, noFoes: false,
  esc: null,                                 // pha "nhà tiễn khách" sau bệ cuối — xem startEscape()
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
    recoilT: 0, chargeSlot: -1, chargeT: 0, riding: null,
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
  S.bullets = []; S.bombs = []; S.corpses = []; S.beams = []; S.bikes = []; S.casts = [];
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
  S.esc = null;           // căn nhà chưa trở mặt; startEscape() dựng cái này lúc chốt bệ cuối
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
      // A room owns its RIGHT and BOTTOM wall outright, its LEFT and TOP only where the map ends.
      // Two rooms side by side each used to close their own shell, so every partition in the house
      // was TWO tiles - 48px - standing against a 15px body: three times wider than the man walking
      // past it. Darkwood's walls are thinner than its character, and that is what makes a room read
      // as a room. The seam is one tile now, and the two rooms share it.
      // SEE: wall + door pass, 2026-08-31
      if (x===RW-1 || y===RH-1 || (x===0 && cx===0) || (y===0 && cy===0)) v = WALL;
      else if (x===0 || y===0) v = FLOOR;                  // the neighbour's wall already stands here
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
    // The seam is the LAST column a room owns, not the first column of the next one, and it is one
    // tile now - so the o range is symmetric: the wall itself plus one floor tile either side.
    // It used to run -2..1 because it had to pierce two stacked wall columns.
    if (cx < GX-1){ const col=(cx+1)*RW-1; for(let d=-1;d<=1;d++) for(let o=-1;o<=1;o++) carve(col+o, my+d); }
    if (cy < GY-1){ const row=(cy+1)*RH-1; for(let d=-1;d<=1;d++) for(let o=-1;o<=1;o++) carve(mx+d, row+o); }
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
  chosen.forEach((c,i) => {
    // Nút đặt CẠNH bệ chứ không phải trên bệ: mặt bệ là chỗ để thả đồ, và một cái nút nằm cùng chỗ
    // đó thì mọi lần đặt món cuối cùng đều vô tình khởi động luôn đồng hồ — đúng cái vừa bỏ đi.
    let bx = c.x + TILE*2.9, by = c.y;
    for (const [dx,dy] of [[2.9,0],[-2.9,0],[0,2.9],[0,-2.9],[2.4,2.4],[-2.4,2.4],[2.4,-2.4],[-2.4,-2.4]]){
      const nx = c.x + dx*TILE, ny = c.y + dy*TILE;
      if (!hitsSolid(nx, ny, 10)){ bx = nx; by = ny; break; }
    }
    S.pads.push({
      x:c.x, y:c.y, ri:c.ri, quota: 0, placed: [], value: 0,
      btn: { x:bx, y:by, r: TILE*0.95 }, 
      active: i===0, done:false, index:i
    });
  });

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
  // Chỉ tiêu co theo SỐ NGƯỜI thật sự đi ca, không phải một con số cứng.
  // WHY: QUOTA_FACTOR được cân cho tổ đủ bốn người. Đi một mình — bật/tắt tổ ở
  //   repo2d, hoặc tài khoản Biệt Đội mới chỉ có một xác — mà vẫn phải khuân đủ
  //   chỉ tiêu của bốn người thì không ai xong nổi.
  // Co DƯỚI mức tuyến tính (1 người = 55%, 4 người = 100%) nên đi đủ tổ vẫn lợi
  // hơn hẳn: ba người kia còn mang thêm tay khuân và chia lửa với quái.
  const crewN = clamp(1 + (S.crewOn ? hookMateCount() : 0), 1, 8);
  const crewMul = 0.4 + 0.15 * Math.min(crewN, 4);
  S.quotaTotal = Math.round(totalValue * QUOTA_FACTOR * difficultyCurve(S.level) * crewMul);
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
      const x0 = (sp.gx+0.5)*TILE, y0 = (sp.gy+0.5)*TILE;
      // Loài đi ĐÀN đặt cả cụm quanh MỘT chỗ. Chỗ đặt vốn chỉ có một con mỗi loài, và một con
      // Bom con đứng lẻ thì chỉ là một quả lựu đạn biết đi — cái đáng sợ là bốn quả cùng lúc,
      // vì lúc đó câu hỏi không còn là "giết con nào trước" mà là "lùi về đâu".
      // Rải quanh một vòng bán kính một ô rưỡi, bỏ qua con nào rơi vào tường.
      spawnPack(type, x0, y0, rnd);
    }
  }

  S.player = S.player ? Object.assign(S.player, { x:S.car.x, y:S.car.y+TILE*2, held:null, hurt:0 }) : newPlayer();
  S.player.x = S.car.x; S.player.y = S.car.y + TILE*2;
  applyPlayerStats();
  S.player.hp = S.player.hpMax; S.player.stam = S.player.stamMax;
  S.player.held = null; S.player.aimSlot = -1; S.player.aimId = -1;
  S.player.pushing = false; S.player.floatT = 0; S.player.shieldT = 0;
  S.player.runT = 0; S.player.rushing = false;
  S.player.blindT = 0; S.player.slowT = 0;
  S.player.recoilT = 0; S.player.chargeSlot = -1; S.player.chargeT = 0; S.player.chargeUsed = null;
  S.player.riding = null;
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
  // Hai chiếc dựng sẵn cạnh xe tải, y như cái xe đẩy: không mua, không mang về, và KHÔNG NẰM
  // TRONG TỦ — tủ là chỗ của đồ cầm tay. Mỗi tầng dựng lại một cặp mới, nên bình xăng cũng
  // đầy lại đúng lúc sang tầng mới.
  S.bikes = [
    makeBike('scout', S.car.x + TILE*2.0, S.car.y + TILE*3.1, 0),
    makeBike('haul',  S.car.x + TILE*4.4, S.car.y + TILE*3.1, 0)
  ];

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
  // Đủ chỉ tiêu rồi thì việc tiếp theo KHÔNG còn là cái bệ, mà là cái nút cạnh nó. Không có
  // dòng này thì mũi chỉ đường vẫn trỏ vào mặt bệ — chỗ chẳng còn gì để làm — và bot tự chơi
  // đứng đó chờ một cái đồng hồ không bao giờ chạy.
  const pad = S.pads[S.padIndex];
  const target = S.levelDone ? S.car
               : (pad && !pad.done && pad.btn && pad.value >= pad.quota) ? pad.btn
               : (pad || S.car);
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
// SAT THUONG CUA QUAI TANG THEO MAN.
// Chu du an: "de len map khac thi quai cung se tang st len".
// Truoc ban nay bang MONSTERS la mot bang PHANG: Ke nang danh 100 o man 1 va van danh 100 o
// man 20. Do kho cua nhung man sau nam het o SO LUONG quai va o chi tieu, con moi cu danh thi
// y het nhau - nen ca truc thu hai muoi khong dang so hon ca truc dau tien, no chi dong hon.
// Duong cong dat thoai: +5% moi man, man 20 la gap doi. Cong voi luat "khong chet tu mau day"
// o hurtPlayer(), ket qua la o man cuoi mot don van khong giet duoc ban tu day mau - nhung
// don thu hai thi co, va khoang cach giua hai don ay chinh la thu bi bop lai dan.
const FOE_DMG_PER_LEVEL = 0.05;
function foeDmgScale(){ return 1 + Math.max(0, (S.level || 1) - 1) * FOE_DMG_PER_LEVEL; }

function makeMonster(type,x,y){
  const d = MONSTERS[type];
  return { type, x, y, hp:d.hp, hpMax:d.hp,
           dmg: Math.round(d.dmg * foeDmgScale()), speed:d.speed, dir:0,
           state:'patrol', tx:x, ty:y, think:0, alert:0, hit:0, home:{x,y}, wob:Math.random()*7,
           sleep:0, kx:0, ky:0, vx:0, vy:0, flash:0,
           lost: 0,                              // seconds since it last had the player
           reveal: 0,                            // fade-in of "this thing has seen you", 0..1
           seen: false, spotT: 0, unseenT: 0,    // the player's side: have I laid eyes on this one
           fuse: null,                 // Bom con: giay con lai cua ngoi, null la chua cham
           rook: type === 'rook' ? 'walk' : null, // the rook's own state machine
           goal: null, path: null, pi: 0, pathT: 0, windT: 0, dashLeft: 0,
           stun: 0, charging: false, rammed: null, linger: 0,
           swing: 0, swingDir: 0,        // thì vung tay: giây còn lại, và hướng nó nhắm
           planted: false,               // Bom con: đã áp sát và cắm chân xuống đếm ngược
           chaseT: 0, tired: 0,          // đuổi bao lâu rồi, và mệt tới đâu (0..1)
           guardA: Math.random()*Math.PI*2 };    // its own place on the ring around the truck
}
function makeCart(x,y){
  return { x, y, r:CART_R, items:[], held:false, holder:null, mode:'strong',
           freeX:x, freeY:y, holdD:0, face:0 };
}
function cartLoad(cart){ return cart.items.reduce((a,l)=> a + (l.gone?0:l.mass), 0); }
function cartValue(cart){ return cart.items.reduce((a,l)=> a + (l.gone?0:l.value), 0); }
function cartFits(cart, l){
  return cart.items.length < CART_SLOTS && l.value < CART_MAX_VALUE;
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
  { base:[104,84,80],  alt:[112,92,86] },    // 3 carpet
  // 4 đá hầm mộ — xám ngả lục lạnh, lấy từ tranh ý tưởng. alt sáng hơn base một nấc rất nhỏ:
  // đây là hai loại đá lát xen nhau chứ không phải hai ô gạch, nên chênh nhau nhiều là ra bàn cờ.
  // CẢ CĂN NHÀ LÀ ĐÁ — chủ dự án, 2026-09-03: "sao không thay hết phòng, nền, wall thành style đó".
  //
  // Bốn nước đá chứ không phải một: chín phòng cùng một nước thì cả bản đồ đọc ra MỘT hành lang
  // dài, và cái mà bảng này tồn tại để giữ — nhìn nước sơn là biết đang ở phòng nào — mất sạch.
  // Bốn nước đều trong một họ xám ngả lục của tranh ý tưởng, lệch nhau 10-14 mức sáng và một chút
  // sắc: thấy được, mà không đọc ra bốn vật liệu khác nhau.
  //
  // Cờ `stone` để chỗ khác hỏi "đây có phải đá không" mà không phải so theo chỉ số. Bốn nước sơn
  // nhà (0..3) giữ nguyên chứ không xoá: trạm dịch vụ vẫn dùng FLOOR_STYLE.tile, và nó cố ý KHÔNG
  // phải hầm mộ — đó là nơi duy nhất trong game có đèn bật sẵn.
  { base:[118,132,126],alt:[124,138,131], stone:1 },  // 4 đá lục  — nước gốc, lấy thẳng từ tranh
  { base:[132,130,118],alt:[138,136,123], stone:1 },  // 5 đá cát  — ngả vàng, ấm hơn một nấc
  { base:[104,114,112],alt:[110,120,117], stone:1 },  // 6 đá sẫm  — tối nhất, cho phòng sâu
  { base:[124,120,128],alt:[130,126,134], stone:1 }   // 7 đá thau — ngả tím rất nhạt, lạnh nhất
];
// Chọn lại mặt tường, 2026-08-31. Bốn màu cũ nằm gọn trong khoảng sáng 74..84/255 — chênh nhau
// 10 mức trên 255, tức là mắt không phân biệt nổi, và sau khi lớp tối NHÂN lên thì cả bốn ra
// cùng một màu xám. Hai kiểu tệ nhất bị thay hẳn:
//   - bê tông [74,74,72]: xám trung tính tuyệt đối, không nghiêng màu nào. Đèn ấm soi vào ra
//     màu bùn, và vì không có vân gì nên nó là mảng phẳng lì rõ nhất trong game.
//   - gạch men [78,86,86]: lạnh ngả xanh, đúng hướng ngược với đèn ấm. Nó CHỐNG lại ánh sáng
//     thay vì nhận ánh sáng, nên soi vào bao nhiêu cũng vẫn xám xanh.
// Thay bằng vật liệu có VÂN, vì cái cứu một mặt phẳng khỏi trông phẳng là vân chứ không phải
// màu: một màu tô đặc nhân với ánh sáng thì vẫn là một màu tô đặc.
// NÂNG ĐỘ SÁNG VẬT LIỆU, 2026-09-01 — "soi đèn vào tường mà tường vẫn chưa tỏ", lần thứ hai.
//
// Lần trước đi tìm lỗi ở hình học ánh sáng, và hình học ĐÃ đúng: đo bằng cách đọc điểm ảnh
// ngay trên khung hình, đứng cách tường ba ô soi thẳng, ruột tường đọc 89/255 trong khi chính
// vật liệu đó tô đặc không đèn chỉ có 92 — tức là đèn đã trả về 97% những gì nó có thể trả.
// Chỗ hụt không nằm ở đèn.
//
// Nó nằm ở phép NHÂN. Lớp tối nhân lên ảnh nền, mà nhân thì không bao giờ cho ra sáng hơn
// chính nước sơn: trần của một mặt tường được soi hết cỡ ĐÚNG BẰNG màu tô của nó. Bốn màu cũ
// nằm ở 60..92 trên thang sáng, còn bốn màu SÀN của cùng những căn phòng đó nằm ở 88..127.
// Nên bức tường được soi thẳng mặt vẫn tối hơn cái sàn đang soi chéo cạnh nó chừng 30% —
// và mắt đọc chênh lệch đó ra "tường không nhận được đèn", đúng như báo cáo.
//
// Ngoài đời thì ngược hẳn: sàn nhận tia sượt, mặt tường đứng nhận tia gần vuông góc, nên mặt
// tường trước mũi đèn phải là thứ SÁNG NHẤT trong nón sáng. Bảng dưới đây đặt mỗi mặt tường
// nhỉnh hơn sàn cùng phòng chừng 8%: gỗ 98 -> tường 107, gạch men 127 -> 137, bê tông 108 ->
// 117, thảm 88 -> 95.
//
// Chỗ tối KHÔNG bị hỏng theo: ngoài nón sáng lớp tối là rgb(6,7,9), tức nhân 0.024 — tường
// 137 ra 3/255, vẫn là đen. Nước sơn sáng chỉ đổi được thứ ĐANG có đèn chiếu vào.
const WALLS = [
  [123,104,85],  // 0 giấy dán tường — nâu ấm, có mối nối dọc
  [143,137,125], // 1 gạch men       — men kem, mạch vữa tối (thay cho xanh lạnh)
  [122,117,109], // 2 blốc bê tông   — có hàng gạch và mạch so le (thay cho xám trơn)
  [120,89,86],   // 3 giấy hoa văn   — đỏ trầm, kẻ sọc dọc
  [128,142,135], // 4 đá lục   — nhỉnh hơn sàn cùng phòng chừng 8%, đúng luật ở trên
  [142,140,127], // 5 đá cát
  [113,124,121], // 6 đá sẫm
  [134,130,138]  // 7 đá thau
];
// LỚP THẾ GIỚI VẼ Ở ĐỘ PHÂN GIẢI GẤP ĐÔI, 2026-09-03 — "làm sao cho chi tiết + rõ nét nhất".
//
// Ảnh nền thế giới trước nay dựng đúng 1 điểm ảnh cho 1 điểm ảnh thế giới: 63x45 ô, ô 24px, ra
// 1512x1080. Nhưng khi vẽ lên màn hình nó bị nhân với dpr*zoom(): máy để bàn 900x640 ở dpr 2 ra
// hệ số 3.8, điện thoại dpr 3 ra chừng 3.5. Tức là mọi vân tường, mọi mạch đá đều được PHÓNG TO
// gần bốn lần rồi mới tới mắt — nét 1 điểm ảnh thành vệt mờ 4 điểm ảnh. Không có chi tiết nào
// vẽ thêm vào cứu được chuyện đó, vì trần chi tiết nằm ở độ phân giải của ảnh nền.
//
// SS=2 chia đôi hệ số phóng ấy và cho mỗi ô 48x48 điểm ảnh để vẽ thay vì 24x24. Không hàm vẽ nào
// phải sửa: transform nhân sẵn SS nên mọi hàm vẫn nói bằng đơn vị thế giới như cũ, chỉ là nét bút
// mảnh đi một nửa. Vẽ ra màn hình thì nói rõ khổ đích WPX x HPX.
//
// KHÔNG lên SS=3 hay 4: 4 sẽ là nét đúng từng điểm ảnh trên máy để bàn, nhưng ảnh nền khi đó là
// 6048x4320 = 26 triệu điểm ảnh, tức 104MB một tấm — quá trần diện tích canvas của Safari trên
// iOS (16.7 triệu) và quá sức bộ nhớ điện thoại. SS=2 là 3024x2160, 26MB, cấp một lần cho cả ván.
const SS = 2;
function prerenderWorld(rnd){
  if (!S.worldCv){ S.worldCv = document.createElement('canvas'); S.worldCv.width = WPX*SS; S.worldCv.height = HPX*SS; }
  const c = S.worldCv.getContext('2d');
  c.setTransform(SS,0,0,SS,0,0);
  c.fillStyle = '#0a0b0c'; c.fillRect(0,0,WPX,HPX);
  // Off the map is wall, so the outer shell does not get an edge drawn on its outside face.
  const isW = (ax,ay) => ax<0 || ay<0 || ax>=MW || ay>=MH || S.grid[ay*MW+ax] === WALL;
  for (let gy=0; gy<MH; gy++) for (let gx=0; gx<MW; gx++){
    const i = gy*MW+gx, v = S.grid[i], x = gx*TILE, y = gy*TILE, n = rnd();
    if (v === FLOOR){
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      const st = FLOORS[S.roomStyle ? S.roomStyle[ri] : 0] || FLOORS[0];
      paintFloor(c, x, y, st, gx, gy, n);
    } else if (v === WALL){
      // "wallpaper follows the room, so a wall tells you which room you are looking into" — câu này
      // là ý định gốc, và tới 2026-09-03 thì mã ở đây vẫn làm NGƯỢC lại nó.
      //
      // Nó lấy kiểu phòng theo ô tường, mà ô tường thuộc về phòng NẰM SAU nó: một phòng sở hữu
      // tường phải và tường dưới của mình, nên bức tường mà người đứng trong phòng B nhìn thẳng
      // vào — bức trên đầu — lại là tường dưới của phòng A ở trên. Đứng trong bếp nhìn lên thấy
      // giấy dán tường của phòng ngủ.
      //
      // Chuyện đó âm ỉ vì bốn kiểu cũ đều là tường nhà, đổi nhau chỉ vài chục mức sáng. Kiểu đá
      // hầm mộ làm nó lộ ra ngay: cả dải phù điêu Ai Cập vẽ trên nền giấy dán tường nâu.
      //
      // Và nó còn phá đúng cái luật mà bảng WALLS được dựng lên để giữ — 'mỗi mặt tường nhỉnh hơn
      // SÀN CÙNG PHÒNG chừng 8%'. Ghép sai phòng thì cặp số ấy so với cái sàn của phòng khác.
      // Nay hỏi ô ngay DƯỚI: mặt tường này đang quay xuống phòng nào thì mang nước sơn phòng đó.
      // Ô dưới cũng là tường (ruột một khối đặc) thì không ai nhìn thấy mặt nào, giữ phòng của nó.
      const duoi = gy+1 < MH && S.grid[(gy+1)*MW+gx] !== WALL ? gy+1 : gy;
      const ri = ((duoi/RH)|0)*GX + ((gx/RW)|0);
      const ki = S.roomStyle ? S.roomStyle[ri] : 0;
      const w = WALLS[ki] || WALLS[0];
      c.fillStyle = `rgb(${(w[0]+n*12)|0},${(w[1]+n*11)|0},${(w[2]+n*10)|0})`;
      c.fillRect(x,y,TILE,TILE);
      paintWallSkin(c, x, y, ki, gx, gy, n);
      // Shading follows the EXPOSED FACES of a wall run, not every tile in it. Painted per tile,
      // a run of wall came out a ladder of stripes and the eye counted tiles instead of reading one
      // wall - which is most of why a two-tile partition looked like a slab. A face is exposed when
      // the neighbour is not wall; a prop still stands in a room, so it counts as open.
      //
      // ĐẢO CHIỀU 2026-08-31. Trước đây mép giáp phòng bị tô đen 34% còn mép quay đi bị tô sáng
      // 10%, nghĩa là bức tường sáng dần về phía khuất — đo được 77 ở mặt, 95 ở mép xa. Mắt đọc
      // cái đó ra "nguồn sáng nằm sau tường", và cả dải trông như thanh gỗ đặt nằm.
      // Quy ước dùng ở đây là quy ước chung của game nhìn từ trên xuống (Hotline Miami, Zelda):
      // MÉP DƯỚI của ô tường là MẶT TRƯỚC — cái mặt đứng mà người chơi nhìn thấy — nên nó sáng;
      // mép trên là đỉnh tường nhìn từ phía khuất nên nó chìm. Bóng đổ xuống sàn không nằm ở đây:
      // paintWallContact vẽ nó lên chính ô sàn bên dưới, đúng chỗ của nó.
      if (!isW(gx,gy+1)){
        // mặt trước: sáng dần xuống mép, rồi một vạch chân tường tối để mặt không dính vào sàn
        const fg = c.createLinearGradient(0, y+TILE-9, 0, y+TILE-1);
        fg.addColorStop(0, 'rgba(255,244,224,0)');
        fg.addColorStop(1, 'rgba(255,244,224,0.20)');
        c.fillStyle = fg; c.fillRect(x, y+TILE-9, TILE, 8);
        c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(x, y+TILE-1, TILE, 1);
      }
      if (!isW(gx,gy-1)){
        // Mặt sau — đỉnh tường nhìn từ phía khuất. Nó tối hơn mặt trước, và ĐỔI HÌNH 2026-09-03
        // cùng lúc với việc đèn ăn hết bề dày tường.
        //
        // Dải cũ chỉ phủ nửa ô (LIP_MAX) và tối DẦN XUỐNG, vì hồi đó đèn cũng chỉ tới nửa ô —
        // qua khỏi dải là tối tuyệt đối nên không ai thấy chỗ nối. Nay cả ô đều có đèn, và cái
        // dải ấy để lại đúng thứ nó sinh ra để tránh: nửa trên tối dần tới 0.28, hết dải thì
        // độ sáng nảy ngược lên một bậc, rồi mép dưới lại được mặt trước tô sáng thêm — ba
        // vạch sáng-tối nằm trong 24 điểm ảnh, mắt đọc ra sọc chứ không đọc ra một mặt tường.
        //
        // Nay là MỘT dốc duy nhất phủ cả ô, tối ở mép trên và tan hết trước khi tới mặt trước.
        // Đúng quy ước nhìn từ trên xuống đã dùng ở mặt trước: càng lùi về phía khuất càng chìm,
        // không có chỗ nào sáng nảy lên giữa chừng. Và chỉ 0.18 chứ không 0.28 — bức tường phải
        // TỎ cả bức, cái dốc này chỉ để nó có bề dày chứ không phải để giấu nửa trên đi.
        const bg = c.createLinearGradient(0, y, 0, y+TILE);
        bg.addColorStop(0,    'rgba(0,0,0,0.18)');
        bg.addColorStop(0.62, 'rgba(0,0,0,0.02)');
        bg.addColorStop(1,    'rgba(0,0,0,0)');
        c.fillStyle = bg; c.fillRect(x, y, TILE, TILE);
      }
      // A one-tile partition seen from above is a LINE, and a line needs two edges or it vanishes
      // into the floor. The side faces are what give a vertical run its thickness now that it has
      // only one tile to spend. SEE: wall + door pass, 2026-08-31
      if (!isW(gx-1,gy)){ c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(x,y,2,TILE); }
      if (!isW(gx+1,gy)){ c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(x+TILE-2,y,2,TILE); }
    } else {
      const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
      const st = FLOORS[S.roomStyle ? S.roomStyle[ri] : 0] || FLOORS[0];
      paintFloor(c, x, y, st, gx, gy, n);                 // furniture stands ON the floor
      paintProp(c, x, y, S.deco ? S.deco[i] : P_BLOCK, n);
    }
  }
  paintStoneInlay(c);
  paintStoneFrieze(c);
  paintWallContact(c);
  paintDoorFrames(c);
}
// Vân mặt tường. Đây là nửa còn lại của việc "soi đèn vào tường cho ra hồn", và là nửa mà hình
// học ánh sáng không làm thay được: lớp tối NHÂN lên bức tường, mà một màu tô đặc nhân với bất
// cứ số nào cũng vẫn là một màu tô đặc. Muốn mặt tường có gì để nhìn thì bản thân nó phải có
// chênh lệch sáng tối bên trong.
//
// Vân cũ là một vạch 1 điểm ảnh, đậm 7%, cứ 4 ô mới có một ô — đo trên ảnh chụp thì không phân
// biệt được với nhiễu. Nay mỗi kiểu phòng có vân riêng, và vân lấy theo TOẠ ĐỘ Ô chứ không lấy
// theo dòng ngẫu nhiên: vân ngẫu nhiên từng ô biến bức tường thành vệt loang, mắt đọc ra vết bẩn
// chứ không đọc ra vật liệu — đúng cái bẫy sàn nhà đã dính một lần rồi.
// SEE: docs/patches/phase-5.4-patch-29-repo-wall-light.md
function paintWallSkin(c, x, y, style, gx, gy, n){
  if (style >= STONE_TU){
    // ĐÁ HẦM MỘ. Hàng đá cao 8 điểm ảnh, mạch dọc so le giữa hai hàng.
    //
    // Cả hai loại mạch đều tính từ TOẠ ĐỘ THẾ GIỚI, không tính từ góc ô: hàng đá nằm ở mọi y
    // chia hết cho 8, mà 24 chia hết cho 8, nên ô nào cũng kẻ đúng ba đường ấy và ba đường ấy
    // nối thẳng sang ô bên cạnh. Mạch dọc cách nhau 16, lệch 8 giữa hàng chẵn và hàng lẻ; ô nào
    // có mạch rơi vào trong mình thì ô đó kẻ, không có thì thôi. Không ô nào kẻ viền quanh mình.
    const H = 8, W = 16;
    for (let wy = y; wy < y + TILE; wy++){
      if (wy % H) continue;
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x, wy, TILE, 1);
      c.fillStyle = 'rgba(238,248,244,0.09)'; c.fillRect(x, wy+1, TILE, 1);   // gờ sáng: đá có bề dày
    }
    for (let wy = y; wy < y + TILE; wy += H){
      const hang = Math.floor(wy / H), off = (hang & 1) ? H : 0;
      for (let wx = x - W; wx < x + TILE + W; wx++){
        if (((wx - off) % W + W) % W) continue;
        if (wx < x || wx >= x + TILE) continue;
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(wx, wy, 1, H);
      }
    }
    // Rỗ mặt đá: chấm mờ lấy theo toạ độ ô, đủ để mặt không mịn như sơn.
    for (let k = 0; k < 4; k++){
      const u = bam(gx*5+k, gy*3), v = bam(gx, gy*7+k);
      c.fillStyle = `rgba(0,0,0,${0.05 + u*0.05})`;
      c.fillRect(x + u*(TILE-3), y + v*(TILE-2), 2, 1);
    }
    return;
  }
  if (style === 1){
    // gạch men: mạch vữa kẻ ô, cộng một chút bóng men ở nửa trên mỗi viên
    c.fillStyle = 'rgba(0,0,0,0.30)';
    for (let k = 0; k <= TILE; k += 8){ c.fillRect(x, y+k, TILE, 1); c.fillRect(x+k, y, 1, TILE); }
    c.fillStyle = 'rgba(255,252,244,0.07)';
    for (let k = 0; k < TILE; k += 8) c.fillRect(x+1, y+k+1, TILE-2, 2);
  } else if (style === 2){
    // blốc bê tông: hàng gạch nằm, mạch đứng so le hàng trên hàng dưới
    c.fillStyle = 'rgba(0,0,0,0.26)';
    for (let k = 0; k <= TILE; k += 6) c.fillRect(x, y+k, TILE, 1);
    for (let r = 0; r*6 < TILE; r++){
      const off = ((gy*4 + r) & 1) ? 12 : 0;
      c.fillRect(x + off, y + r*6, 1, 6);
    }
    // rỗ mặt: vài chấm tối, đủ để mặt không mịn như sơn
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 3; k++)
      c.fillRect(x + (((gx*7 + gy*13 + k*5) * 11) % (TILE-2)), y + (((gx*5 + gy*3 + k*9) * 7) % (TILE-2)), 2, 1);
  } else if (style === 3){
    // giấy hoa văn: kẻ sọc dọc mảnh, hai độ đậm xen kẽ
    for (let k = 0; k < TILE; k += 4){
      c.fillStyle = ((k >> 2) & 1) ? 'rgba(0,0,0,0.16)' : 'rgba(255,236,232,0.06)';
      c.fillRect(x+k, y, 1, TILE);
    }
  } else {
    // giấy dán tường trơn: mối nối dọc giữa hai khổ giấy, và một vệt ố nhạt
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + (((gx & 1) ? 4 : 16)), y, 1, TILE);
    c.fillStyle = 'rgba(255,240,220,0.05)'; c.fillRect(x + (((gx & 1) ? 5 : 17)), y, 1, TILE);
    if (n > 0.72){ c.fillStyle = 'rgba(0,0,0,0.09)'; c.fillRect(x+3, y + ((n*13)|0), TILE-6, 3); }
  }
}
// Một ô của mặt sàn đá. Mọi con số ở đây đọc từ TOẠ ĐỘ Ô trên bản đồ, không đọc từ dòng ngẫu
// nhiên, nên hai ô cạnh nhau luôn nối được vào nhau.
const SLAB_W = 3, SLAB_H = 2;                 // một tấm đá = 3x2 ô = 72x48 điểm ảnh thế giới
function bam(a, b){                            // băm hai số nguyên ra [0,1) — thay cho rnd() theo ô
  let h = (a*73856093) ^ (b*19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function paintStone(c, x, y, st, gx, gy){
  // Tấm đá 3x2 ô, hàng lẻ đẩy ngang một ô: mạch dọc không bao giờ xuyên suốt hai hàng, đúng kiểu
  // xây đá. Mạch dọc thẳng tuột từ trên xuống dưới là dấu hiệu số một của một mặt dán ảnh lặp.
  const hang = Math.floor(gy / SLAB_H);
  const lech = (hang & 1) ? 1 : 0;
  const cot  = Math.floor((gx + lech) / SLAB_W);
  const t    = bam(cot, hang);
  const col  = (t < 0.5) ? st.base : st.alt;
  const tx   = (cot*SLAB_W - lech) * TILE, ty = hang*SLAB_H * TILE;   // góc tấm, hệ toạ độ thế giới
  // Chênh màu giữa hai tấm phải RẤT nhỏ. Bản trước để +-3 trên 255 cộng với base/alt, và cả mặt
  // sàn ra một mảng vá: mắt đọc mỗi tấm thành một miếng dán riêng chứ không đọc ra một mặt đá.
  const j    = Math.round(t * 3) - 1;          // một TẤM một sắc, không phải một Ô một sắc
  c.fillStyle = `rgb(${col[0]+j},${col[1]+j},${col[2]+j})`;
  c.fillRect(x, y, TILE, TILE);
  // RỖ MẶT ĐÁ. Lấy theo toạ độ Ô chứ không theo tấm, và mỗi chấm chỉ 1-2 điểm ảnh: chấm nhỏ hơn
  // một ô thì không có gì để mà cắt cụt ở ranh giới ô. Bản trước vẽ vệt loang to bằng nửa tấm rồi
  // cắt theo ô — hai ô cạnh nhau thuộc hai tấm khác nhau thì vệt đứt phựt đúng giữa chừng, và đó
  // chính là 'nét đứt' phải bỏ.
  for (let k = 0; k < 7; k++){
    const u = bam(gx*7+k, gy*13), v = bam(gx*5, gy*11+k), d = bam(gx+k, gy-k);
    c.fillStyle = d < 0.55 ? `rgba(0,0,0,${0.05 + d*0.06})` : `rgba(240,250,246,${0.03 + d*0.04})`;
    c.fillRect(x + 2 + u*(TILE-5), y + 2 + v*(TILE-5), 1 + (d>0.8?1:0), 1);
  }
  // VẾT NỨT. Một tấm nhiều lắm một vết, và vết ấy vẽ trong hệ toạ độ của TẤM rồi cắt theo ô —
  // nên ô nào chứa một khúc của nó thì vẽ đúng khúc ấy, và các khúc nối liền nhau qua ranh giới ô.
  // Khác vệt loang ở chỗ: vết nứt nằm GỌN trong tấm, không bao giờ chạm mép tấm, nên không có
  // chỗ nào để đứt.
  if (t > 0.62){
    const sx = tx + (0.18 + bam(cot, hang*3)*0.24) * SLAB_W*TILE;
    const sy = ty + (0.16 + bam(cot*3, hang)*0.20) * SLAB_H*TILE;
    c.save(); c.beginPath(); c.rect(x, y, TILE, TILE); c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(sx, sy);
    let px = sx, py = sy;
    for (let k = 1; k <= 4; k++){
      px += (bam(cot*9+k, hang) - 0.30) * SLAB_W*TILE*0.20;
      py += (0.10 + bam(cot, hang*7+k)*0.10) * SLAB_H*TILE;
      c.lineTo(px, py);
    }
    c.stroke();
    c.restore();
  }
  // MẠCH ĐÁ — kẻ ở mép TRÊN và mép TRÁI của ô, và chỉ khi mép đó đúng là ranh giới tấm.
  //
  // Đây là chỗ khác hẳn bốn kiểu sàn cũ, và là câu trả lời cho "mặt đất đừng có nét đứt": bốn kiểu
  // kia kẻ một vạch ở đáy CHÍNH NÓ, nên cứ 24 điểm ảnh lại một đường và cả phòng ra một tấm lưới.
  // Ở đây mọi ô nằm trên cùng một ranh giới tấm đều kẻ đúng một đường thế giới, nên đường ấy liền
  // một mạch qua cả căn phòng; ô không nằm trên ranh giới thì không kẻ gì cả.
  const mach = 'rgba(0,0,0,0.40)', sang = 'rgba(240,250,246,0.16)';
  if ((gy % SLAB_H) === 0){
    c.fillStyle = mach; c.fillRect(x, y, TILE, 1.4);
    c.fillStyle = sang; c.fillRect(x, y+1.4, TILE, 1);       // gờ sáng dưới mạch: đá có bề dày
  }
  if (((gx + lech) % SLAB_W) === 0){
    c.fillStyle = mach; c.fillRect(x, y, 1.4, TILE);
    c.fillStyle = sang; c.fillRect(x+1.4, y, 1, TILE);
  }
}
// HOA VĂN SÀN — lượt vẽ THỨ HAI, chạy sau khi cả bản đồ đã lát xong.
//
// Phải tách ra một lượt riêng vì mấy hoạ tiết này TO HƠN MỘT Ô: viên kim cương lồng rộng hai ô,
// bọ hung rộng gần hai. Vẽ trong vòng lặp lát ô thì phần tràn sang ô bên cạnh bị chính ô bên cạnh
// tô đè lên ngay sau đó, ra một hoạ tiết cụt đúng ở ranh giới ô — tức là đúng cái 'nét đứt' phải bỏ.
//
// Chỗ đặt lấy theo TOẠ ĐỘ TRONG PHÒNG, không rải đều khắp sàn: trong tranh ý tưởng, hoa văn nằm
// dọc hành lang còn sàn hai gian bên để trơn. Mà hành lang thì nằm đúng chỗ biết trước — bộ dựng
// khoét cửa ở giữa mỗi cạnh chung, nên cột 9-11 và hàng 6-8 của phòng nào cũng là lối đi.
function paintStoneInlay(c){
  const laDa = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) return false;
    if (S.grid[gy*MW+gx] !== FLOOR) return false;
    const ri = ((gy/RH)|0)*GX + ((gx/RW)|0);
    return (S.roomStyle ? S.roomStyle[ri] : 0) >= STONE_TU;
  };
  const kimCuong = (mx, my, r) => {
    c.strokeStyle = 'rgba(0,0,0,0.26)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(mx, my-r); c.lineTo(mx+r, my); c.lineTo(mx, my+r); c.lineTo(mx-r, my); c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(236,246,242,0.14)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(mx, my-r*0.58); c.lineTo(mx+r*0.58, my); c.lineTo(mx, my+r*0.58); c.lineTo(mx-r*0.58, my); c.closePath(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.10)';
    c.beginPath(); c.moveTo(mx, my-r*0.22); c.lineTo(mx+r*0.22, my); c.lineTo(mx, my+r*0.22); c.lineTo(mx-r*0.22, my); c.closePath(); c.fill();
  };
  // Bọ hung: cùng quy ước hộp của cả bộ — thân tối, lưng hứng sáng, không phải một hình tô đặc.
  // Bọ hung. Bản trước vẽ sáu cái chân toè ra hai bên và nó đọc ra CON NHỆN. Cái làm nên bọ hung
  // không phải chân mà là hai cánh cứng khép lại thành một đường sống giữa lưng, cộng cái đầu
  // hình quạt. Chân rút lại thành sáu vấu ngắn nằm sát thân, đúng như trên bùa Ai Cập.
  const boHung = (mx, my, r) => {
    c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1.2;      // vành huy hiệu
    c.beginPath(); c.arc(mx, my, r*0.98, 0, Math.PI*2); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.26)';                            // thân: hai cánh cứng khép
    c.beginPath(); c.ellipse(mx, my + r*0.08, r*0.46, r*0.58, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(238,248,244,0.13)';
    c.beginPath(); c.ellipse(mx, my + r*0.02, r*0.38, r*0.48, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.30)';
    c.fillRect(mx - 0.7, my - r*0.34, 1.4, r*0.94);              // sống lưng giữa hai cánh
    c.beginPath();                                               // đầu hình quạt
    c.moveTo(mx - r*0.34, my - r*0.40);
    c.lineTo(mx + r*0.34, my - r*0.40);
    c.lineTo(mx + r*0.22, my - r*0.70);
    c.lineTo(mx - r*0.22, my - r*0.70);
    c.closePath(); c.fill();
    c.lineWidth = 1.4;                                           // sáu vấu chân, ngắn và sát thân
    c.strokeStyle = 'rgba(0,0,0,0.28)';
    for (const d of [-1, 1]) for (let k = 0; k < 3; k++){
      c.beginPath();
      c.moveTo(mx + d*r*0.44, my - r*0.26 + k*r*0.32);
      c.lineTo(mx + d*r*0.64, my - r*0.40 + k*r*0.34);
      c.stroke();
    }
  };
  for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++){
    if (!laDa(gx, gy)) continue;
    const lx = gx % RW, ly = gy % RH;
    const doc  = lx >= 9  && lx <= 11;         // hành lang dọc  (cột cửa)
    const ngang = ly >= 6 && ly <= 8;          // hành lang ngang (hàng cửa)
    if (!doc && !ngang) continue;
    const mx = gx*TILE + TILE/2, my = gy*TILE + TILE/2;
    if (doc && ngang) continue;                // giữa ngã tư để trơn, hoa văn chồng nhau thì rối
    if (doc && lx === 10){
      if (ly % 4 === 1) kimCuong(mx, my, TILE*0.82);
      if (ly % 4 === 3) boHung(mx, my, TILE*0.62);
    } else if (ngang && ly === 7){
      if (lx % 4 === 1) kimCuong(mx, my, TILE*0.82);
      if (lx % 4 === 3) boHung(mx, my, TILE*0.62);
    }
  }
}
// The shadow a wall casts onto the floor in front of it. A thin wall drawn flat from directly above
// has nothing to say how tall it is, and it floated - it read as paint on the floor rather than as
// something standing in the room. Darkwood leans its walls slightly toward the camera to say the
// same thing; a contact shadow is the cheap version, and it costs no tiles. Six pixels, fading out.
// SEE: wall + door pass, 2026-08-31
// PHÙ ĐIÊU MẶT TƯỜNG — chạy suốt một DÃY tường, không vẽ theo từng ô.
//
// Đây là câu trả lời thẳng cho "tường đừng có nét đứt, nối". Nếu vẽ trong vòng lặp lát ô thì mỗi
// ô tự vẽ một khúc phù điêu của riêng nó, và dù có căn pha theo toạ độ thế giới thì hai khúc vẫn
// hở nhau đúng ở ranh giới do bo tròn và do nét vẽ. Ở đây tìm ra DÃY tường liền nhau trước — một
// mạch ô tường cùng hàng, cùng kiểu phòng, cùng lộ mặt xuống phòng — rồi vẽ cả dải bằng MỘT lệnh
// từ đầu dãy tới cuối dãy. Không có mối nối nào để mà hở.
//
// Dải này nằm ở mép DƯỚI của ô tường, tức mặt đứng người chơi nhìn thấy, đúng quy ước nhìn từ
// trên xuống mà mặt trước/mặt sau của tường đang dùng.
function paintStoneFrieze(c){
  // Phù điêu thuộc về CĂN PHÒNG NHÌN THẤY NÓ, không thuộc về ô tường mang nó.
  //
  // Bản đầu hỏi sai câu: nó hỏi 'ô tường này có thuộc phòng kiểu đá không'. Nhưng luật sở hữu
  // tường ở đây là một phòng chỉ sở hữu tường PHẢI và tường DƯỚI của mình (xem chỗ dựng lưới),
  // nên bức tường mà người đứng trong hầm mộ nhìn thẳng vào — bức trên đầu — lại thuộc về phòng
  // PHÍA TRÊN, và phòng đó thường không phải hầm mộ. Kết quả: không một nét phù điêu nào vẽ ra.
  // Hỏi đúng là hỏi ô SÀN ngay dưới nó: mặt tường này đang quay xuống phòng nào.
  const daBenDuoi = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= MW || gy+1 >= MH) return false;
    if (S.grid[gy*MW+gx] !== WALL) return false;
    if (S.grid[(gy+1)*MW+gx] === WALL) return false;          // phải lộ mặt xuống một khoảng trống
    const ri = (((gy+1)/RH)|0)*GX + ((gx/RW)|0);
    return (S.roomStyle ? S.roomStyle[ri] : 0) >= STONE_TU;
  };
  for (let gy = 0; gy < MH; gy++){
    let gx = 0;
    while (gx < MW){
      if (!daBenDuoi(gx, gy)){ gx++; continue; }
      let g2 = gx;
      while (g2+1 < MW && daBenDuoi(g2+1, gy)) g2++;
      const x0 = gx*TILE, x1 = (g2+1)*TILE, y = gy*TILE, w = x1 - x0;
      if (w >= TILE*2) friezeRun(c, x0, x1, y, gy);
      gx = g2 + 1;
    }
  }
}
// Một DÃY phù điêu, vẽ một lần từ đầu dãy tới cuối dãy. Không có mối nối nào để mà hở.
function friezeRun(c, x0, x1, y, gy){
  const w = x1 - x0;
  // DẢI NÀY PHẢI TRUNG TÍNH VỀ ĐỘ SÁNG.
  //
  // Từ lúc cả nhà là đá, phù điêu phủ MỌI bức tường chứ không riêng hầm mộ — và bản đầu của nó tô
  // một dải tối 0.16 lên đúng chỗ mặt tường mà người chơi soi đèn vào. Bộ đo bắt được ngay: mặt
  // tường đọc 91 trong khi sàn ngay trước nó đọc 128, tức là tụt xuống 0.71 lần — dưới ngưỡng 0.75,
  // và đúng là cái lỗi 'soi đèn vào tường mà tường không tỏ' đã sửa hai lần trước đó. Một dải trang
  // trí không được phép lấy lại thứ mà cả hai bản vá kia vừa trả về.
  //
  // Nay mỗi nét tối đi kèm một nét sáng ngay cạnh: mắt vẫn đọc ra chữ khắc chìm, mà độ sáng trung
  // bình của cả dải gần như không đổi. Chạm khắc là CHÊNH LỆCH, không phải bóng tối.
  c.fillStyle = 'rgba(0,0,0,0.20)';        c.fillRect(x0, y+TILE-14, w, 1);
  c.fillStyle = 'rgba(244,252,248,0.22)';  c.fillRect(x0, y+TILE-13, w, 1);
  c.fillStyle = 'rgba(0,0,0,0.18)';        c.fillRect(x0, y+TILE-2.4, w, 1);
  c.fillStyle = 'rgba(244,252,248,0.18)';  c.fillRect(x0, y+TILE-3.4, w, 1);
  // Ô chữ tượng hình. Vạch ngăn và nét chữ đều lấy pha từ TOẠ ĐỘ THẾ GIỚI, nên nhịp của chúng
  // không đổi khi dãy dài ra hay ngắn lại, và hai dãy nối nhau qua một khung cửa vẫn cùng nhịp.
  const B = 11;
  for (let wx = Math.ceil(x0/B)*B; wx < x1; wx += B){
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(wx, y+TILE-11.6, 1, 8);
    c.fillStyle = 'rgba(244,252,248,0.14)'; c.fillRect(wx+1, y+TILE-11.6, 1, 8);
  }
  for (let wx = Math.ceil(x0/B)*B; wx < x1 - B*0.6; wx += B){
    const t = bam(wx, gy), u = bam(wx*3, gy*5);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    if (t < 0.25){                                   // chim ưng: thân ngang, đuôi xoè
      c.fillRect(wx+2.5, y+TILE-9.5, 6, 1.2);
      c.fillRect(wx+2.5, y+TILE-8.3, 1.2, 3);
      c.fillRect(wx+6.5, y+TILE-8.3, 2, 1.2);
    } else if (t < 0.5){                             // mắt Horus: vòng cung cộng một nét rủ
      c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(wx+5, y+TILE-7.5, 2.6, Math.PI, Math.PI*2); c.stroke();
      c.fillRect(wx+4.4, y+TILE-7.2, 1.2, 1.2);
      c.fillRect(wx+6.6, y+TILE-6.4, 1.6, 1.2);
    } else if (t < 0.75){                            // ankh
      c.fillRect(wx+4.4, y+TILE-8.4, 1.2, 5.4);
      c.fillRect(wx+2.6, y+TILE-6.6, 4.8, 1.2);
      c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(wx+5, y+TILE-9.4, 1.6, 0, Math.PI*2); c.stroke();
    } else {                                         // ba nét sóng nước, dài ngắn theo băm
      for (let k = 0; k < 3; k++)
        c.fillRect(wx+2.4, y+TILE-9.2+k*2.2, 3.4 + u*3, 1.2);
    }
  }
  // ĐĨA MẶT TRỜI CÓ CÁNH, đặt giữa dãy — chỉ khi dãy đủ dài để hai cánh không đè lên hai đầu.
  // Trong tranh ý tưởng đây là thứ nói cho mắt biết bức tường này là một MẶT, không phải một dải:
  // nó có tâm, và mọi thứ khác trên tường xếp quanh cái tâm ấy.
  if (w >= TILE*6){
    const mx = (x0 + x1) / 2, my = y + TILE - 7.6;
    c.fillStyle = 'rgba(244,252,248,0.07)'; c.fillRect(mx - TILE*1.9, y+TILE-12.6, TILE*3.8, 9.6);
    c.fillStyle = 'rgba(0,0,0,0.42)';
    c.beginPath(); c.arc(mx, my, 3.1, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(242,252,248,0.16)';
    c.beginPath(); c.arc(mx, my-0.7, 1.7, 0, Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.34)'; c.lineWidth = 1.1;
    for (const d of [-1, 1]){
      for (let k = 1; k <= 5; k++){                  // lông cánh, dài dần rồi cụp xuống
        c.beginPath();
        c.moveTo(mx + d*3.6, my - 1.2 + k*0.42);
        c.lineTo(mx + d*(3.6 + k*3.4), my - 2.4 + k*1.06);
        c.stroke();
      }
      c.beginPath();                                  // rắn thần cuộn hai bên đĩa
      c.moveTo(mx + d*3.0, my + 2.6);
      c.quadraticCurveTo(mx + d*6.2, my + 3.4, mx + d*5.0, my + 0.4);
      c.stroke();
    }
  }
}
function paintWallContact(c){
  for (let gy=1; gy<MH; gy++) for (let gx=0; gx<MW; gx++){
    if (S.grid[gy*MW+gx] === WALL) continue;
    if (S.grid[(gy-1)*MW+gx] !== WALL) continue;
    const x = gx*TILE, y = gy*TILE;
    const g = c.createLinearGradient(0, y, 0, y+6);
    g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x, y, TILE, 6);
  }
}
function paintFloor(c, x, y, st, gx, gy, n){
  // The pattern has to come from the GRID, not from the random stream. Tinting each tile at
  // random turned a floor into camouflage: the eye read the blotches as objects and the room
  // as clutter. Planks run in rows, tiles checker, and the randomness is demoted to a faint
  // wear jitter you only notice up close.
  // ĐÁ HẦM MỘ — mặt sàn phải LIỀN, không đứt theo ô. Chủ dự án, 2026-09-03: "phần tường, mặt
  // đất đừng có nét đứt, nối".
  //
  // Đây là cái bẫy mà bốn kiểu sàn cũ đều dính: mỗi ô tự kẻ một vạch tối ở đáy và ở mép phải
  // của CHÍNH NÓ, nên cứ 24 điểm ảnh lại một đường, và cả căn phòng đọc ra một tấm lưới chứ
  // không đọc ra một mặt sàn. Mắt đếm ô thay vì nhìn phòng.
  //
  // Sàn đá không kẻ mạch theo ô, nó kẻ theo TẤM: tấm 2x2 ô, mạch ngang chạy suốt (mọi ô cùng
  // hàng đều vẽ đúng một đường thế giới nên nó nối liền), mạch dọc so le giữa hai hàng tấm
  // đúng kiểu xây đá thật. Màu cũng bốc theo TẤM chứ không theo ô — bốc theo ô thì mỗi ô một
  // sắc, và một tấm đá bị cắt làm bốn mảnh khác màu là thứ trông giả nhất trong cả bộ.
  if (st.stone){ paintStone(c, x, y, st, gx, gy); return; }
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
  // BỐN MÓN ĐỒ NHÀ ĐỔI THÀNH ĐỒ HẦM MỘ, 2026-09-03.
  //
  // Đổi sàn và tường sang đá mà để nguyên bàn gỗ, tủ sách và tủ sắt thì ra một hầm mộ có tủ hồ sơ.
  // Nhưng KHÔNG đụng vào mười mẫu phòng, cũng không đụng vào chữ cái T/S/C/P: bố cục từng phòng,
  // chỗ rơi đồ, chỗ quái đứng, lối cho xe đẩy đều đã cân rồi — cái phải đổi là NƯỚC SƠN. Đây đúng
  // là quyết định đã ghi ở PROP_CH hồi thay chậu cây bằng tủ sắt, áp lại cho cả bốn món.
  //
  // Cả bốn vẫn theo quy ước hộp cũ: mặt trên sáng, chân tối, có cạnh — thứ khiến một đồ vật ăn
  // được ánh đèn thay vì chỉ đổi độ đậm của một mảng màu.
  const gxo = (x / TILE) | 0, gyo = (y / TILE) | 0;
  if (kind === P_TABLE){            // BỆ ĐÁ — bàn thờ thấp, mặt phẳng, có gờ chân
    box(1, 3, T-2, T-7, '#9aa9a1', '#71807a', 'rgba(0,0,0,0.42)');
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(x+1, y+3+(((T-7)*0.42)|0), T-2, 1.2);      // mạch giữa hai phiến mặt bệ
    c.fillStyle = 'rgba(238,248,244,0.16)'; c.fillRect(x+1, y+3, T-2, 1.2);
    c.fillStyle = '#5f6d67'; c.fillRect(x+3, y+T-5, T-6, 3);
    c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x+3, y+T-3, T-6, 2);
  } else if (kind === P_SHELF){     // HỐC XẾP BÌNH — ba hộc khoét vào tường, mỗi hộc một bình
    box(1, 0, T-2, T, '#6d7c75', '#4e5b56', 'rgba(0,0,0,0.48)');
    for (let k = 0; k < 3; k++){
      c.fillStyle = 'rgba(0,0,0,0.44)';
      c.fillRect(x+2.5, y+2 + k*7.2, T-5, 5.4);
      const t = bam(gxo+k, gyo);
      c.fillStyle = t < 0.5 ? '#a8927a' : '#93a29a';
      c.fillRect(x+4 + ((t*6)|0), y+3.4 + k*7.2, 3.4, 4);
      c.fillStyle = 'rgba(0,0,0,0.40)';
      c.fillRect(x+4 + ((t*6)|0), y+3.4 + k*7.2, 3.4, 1.2);
    }
    c.fillStyle = 'rgba(238,248,244,0.13)'; c.fillRect(x+1, y, T-2, 1.2);
  } else if (kind === P_CRATE){     // RƯƠNG KHAI QUẬT — món DUY NHẤT còn là gỗ, và đó là chủ ý:
    // trong một hầm mộ toàn đá, thứ duy nhất nói 'có người tới đây trước bạn' là đồ của họ.
    box(2, 2, T-4, T-4, '#a8834b', '#7a5c33', 'rgba(0,0,0,0.44)');
    c.fillStyle = 'rgba(0,0,0,0.30)';
    c.fillRect(x+2, y+6, T-4, 1.6); c.fillRect(x+2, y+T-8, T-4, 1.6);
    c.fillStyle = 'rgba(226,214,190,0.22)';
    c.fillRect(x+2, y+5, T-4, 1); c.fillRect(x+2, y+T-9, T-4, 1);
    c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x+((T/2)|0)-1, y+2, 2, T-4);
  } else if (kind === P_LOCKER){    // CỘT ĐÁ — trụ có rãnh dọc, đầu cột loe, chân có bệ
    // Món này hay nằm sát tường, nên bài học 2026-09-01 vẫn giữ: KHÔNG được là một hình tròn tô
    // đặc, nếu không nó lại đọc ra 'cái tường có hình tròn bên trong'. Cột có mặt trên sáng, thân
    // có rãnh, chân có bệ và bóng — bốn thứ mà một cái đĩa tròn không có.
    c.fillStyle = '#5f6d67'; c.fillRect(x+1, y+T-6, T-2, 5);
    c.fillStyle = 'rgba(0,0,0,0.36)'; c.fillRect(x+1, y+T-2.5, T-2, 2.5);
    box(3, 2, T-6, T-7, '#93a29a', '#6b7a74', 'rgba(0,0,0,0.44)');
    c.fillStyle = 'rgba(0,0,0,0.26)';
    for (let k = 1; k < 4; k++) c.fillRect(x+3 + k*((T-6)/4), y+3, 1, T-9);
    c.fillStyle = '#a8b7ae'; c.fillRect(x+2, y+1, T-4, 3.2);
    c.fillStyle = 'rgba(238,248,244,0.18)'; c.fillRect(x+2, y+1, T-4, 1.2);
  } else if (kind === P_TOMB){  } else if (kind === P_TOMB){      // quan tài đá — dựng đứng dựa tường, mặt nạ ở đầu
    // Ba món của hầm mộ vẫn theo ĐÚNG quy ước của bốn món cũ: mặt trên sáng, chân tối, có cạnh.
    // Quyết định 2026-09-01 đã ghi rõ vì sao — một hình tô đặc không có mặt nào để sáng khác nhau
    // thì soi đèn vào chỉ đổi được độ đậm của đúng một mảng màu, và giữa bốn cái hộp nó không đọc
    // ra đồ vật.
    //
    // Bản đầu vẽ nó thành một hộp chữ nhật có vạch ngang — giữa một gian toàn hộp thì nó đọc ra
    // cái tủ hồ sơ. Cái làm nên quan tài không phải nước sơn mà là HÌNH DÁNG: vai rộng, đầu tròn,
    // chân thuôn. Nên nó dựng bằng đường bao chứ không bằng fillRect.
    const cx = x + T/2;
    const vai = y + T*0.30, chan = y + T - 1.5, hong = T*0.34, mut = T*0.24;
    const than = (fill) => {
      c.beginPath();
      c.moveTo(cx - hong, vai);
      c.quadraticCurveTo(cx - hong, y + 1.5, cx, y + 1.5);      // vai trái lên đỉnh đầu
      c.quadraticCurveTo(cx + hong, y + 1.5, cx + hong, vai);   // xuống vai phải
      c.lineTo(cx + mut, chan);                                 // thuôn dần về chân
      c.lineTo(cx - mut, chan);
      c.closePath();
      c.fillStyle = fill; c.fill();
    };
    than('#6d7d76');                                            // thân, phần khuất
    c.save(); c.beginPath();                                     // nắp: nửa trên hứng sáng
    c.rect(x, y, T, T*0.62); c.clip();
    than('#9db0a7');
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.46)'; c.lineWidth = 1;
    than('rgba(0,0,0,0)'); c.stroke();                           // đường bao, để nó tách khỏi tường
    // Khăn trùm đầu: hai vạt xoè hai bên mặt, đây là nét đọc ra 'Ai Cập' nhanh nhất.
    c.fillStyle = 'rgba(228,240,234,0.40)';
    c.fillRect(cx - hong*0.92, y + T*0.16, hong*1.84, 2.2);
    c.fillStyle = 'rgba(0,0,0,0.30)';
    c.fillRect(cx - hong*0.92, y + T*0.16, 2.2, T*0.16);
    c.fillRect(cx + hong*0.92 - 2.2, y + T*0.16, 2.2, T*0.16);
    c.fillStyle = 'rgba(0,0,0,0.58)';                            // hai con mắt kẻ dài
    c.fillRect(cx - 3.4, y + T*0.235, 2.4, 1.2);
    c.fillRect(cx + 1.0, y + T*0.235, 2.4, 1.2);
    c.fillStyle = 'rgba(0,0,0,0.34)';                            // râu cằm
    c.fillRect(cx - 0.7, y + T*0.30, 1.4, 2.6);
    // Hai tay khoanh trước ngực, rồi cột chữ tượng hình chạy xuống chân.
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(cx - hong*0.62, y + T*0.40, hong*1.24, 1.4);
    c.fillRect(cx - hong*0.52, y + T*0.46, hong*1.04, 1.4);
    for (let k = 0; k < 4; k++) c.fillRect(cx - 2.4, y + T*0.58 + k*3.0, 4.8, 1.2);
    c.fillStyle = 'rgba(238,250,244,0.16)';                      // gờ sáng dọc mép trái nắp
    c.fillRect(cx - hong + 1.2, vai, 1.2, T*0.26);
    c.fillStyle = 'rgba(0,0,0,0.40)';                            // chân đổ bóng xuống sàn
    c.fillRect(cx - mut, chan - 1.6, mut*2, 2.2);
  } else if (kind === P_RUBBLE){    // đá vụn — mảng tường đổ, mảnh to mảnh nhỏ
    // Cùng quy ước: mỗi mảnh là một khối có mặt trên sáng và chân tối. Vị trí lấy từ n nên đống
    // nào cũng khác đống nào, mà vẫn đứng yên qua các khung hình.
    const manh = [[1.5,10,10,9],[10,5,9,11],[4,2,8,7],[14,12,7,8],[2,16,7,6],[11,17,8,5]];
    for (let k = 0; k < manh.length; k++){
      const m = manh[k], sh = ((n*7 + k*0.37) % 1);
      const w = Math.max(3.5, m[2] - sh*3), h = Math.max(3.5, m[3] - sh*2.4);
      const px = x + m[0] + sh*1.6, py = y + m[1] + sh*1.2;
      c.beginPath();                                             // mảnh vỡ có góc, không phải ô vuông
      c.moveTo(px, py + h*0.30);
      c.lineTo(px + w*0.34, py);
      c.lineTo(px + w, py + h*0.22);
      c.lineTo(px + w*0.82, py + h);
      c.lineTo(px + w*0.14, py + h*0.88);
      c.closePath();
      c.fillStyle = '#7b8a83'; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.38)'; c.lineWidth = 1; c.stroke();
      c.save(); c.clip();
      c.fillStyle = '#9aa9a1'; c.fillRect(px, py, w, h*0.52);    // mặt trên
      c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(px, py + h*0.78, w, h*0.30);
      c.restore();
    }
    c.fillStyle = 'rgba(0,0,0,0.16)';                            // bụi đá vương quanh đống
    for (let k = 0; k < 5; k++){
      const u = ((n*13 + k*0.29) % 1), v = ((n*29 + k*0.61) % 1);
      c.fillRect(x + 1 + u*(T-3), y + 1 + v*(T-3), 1.6, 1.2);
    }
  } else if (kind === P_URN){       // vò gốm — món DUY NHẤT ngả ấm trong cả gian đá lạnh
    // Cố ý không phải một hình tròn tô đặc: có miệng vò (mặt trên, tối), có vai hứng sáng, có
    // chân đổ bóng. Đó là ba thứ mà cái chậu cây bị bỏ hồi 2026-09-01 không có.
    const cx = x + T/2;
    c.fillStyle = 'rgba(0,0,0,0.34)';                            // bóng dưới chân, vẽ trước
    c.beginPath(); c.ellipse(cx, y+T-3.5, T*0.30, T*0.10, 0, 0, Math.PI*2); c.fill();
    c.beginPath();                                               // thân vò: phình giữa, thắt chân
    c.moveTo(cx - 2.6, y + 5.5);
    c.bezierCurveTo(cx - T*0.40, y + 9, cx - T*0.36, y + T - 8, cx - 3.4, y + T - 4);
    c.lineTo(cx + 3.4, y + T - 4);
    c.bezierCurveTo(cx + T*0.36, y + T - 8, cx + T*0.40, y + 9, cx + 2.6, y + 5.5);
    c.closePath();
    c.fillStyle = '#8a6438'; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.42)'; c.lineWidth = 1; c.stroke();
    c.save(); c.clip();
    c.fillStyle = '#a87b45'; c.fillRect(x, y, T, T*0.52);        // vai hứng sáng
    c.fillStyle = 'rgba(238,206,156,0.26)'; c.fillRect(cx - 6, y + 8, 2.2, 8);
    c.fillStyle = 'rgba(0,0,0,0.26)';                            // hai vòng khắc quanh bụng
    c.fillRect(x, y + T*0.56, T, 1.2); c.fillRect(x, y + T*0.66, T, 1.2);
    c.restore();
    c.fillStyle = '#4a3520';                                     // miệng vò
    c.beginPath(); c.ellipse(cx, y+5.5, T*0.15, T*0.075, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(230,200,158,0.30)';
    c.beginPath(); c.ellipse(cx, y+4.8, T*0.15, T*0.055, 0, 0, Math.PI*2); c.fill();
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
    // One jamb per opening, not two. A room's seam is its last column/row; the old predicate also
    // matched the next room's first column, which is floor now.
    const onCol = (gx % RW) === RW-1;
    const onRow = (gy % RH) === RH-1;
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
  const tmp = [];
  if (S.doors) for (const d of S.doors)
    for (const s of doorSegs(d, tmp)){
      const g = seg(s[0], s[1], s[2], s[3]);
      g.cua = 1;                                  // đánh dấu để lipInto biết đây là cánh cửa, không phải tường
      shut.push(g);
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
    let best = R, trung = null;
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
      best = t; trung = s;
    }
    pts[i*2] = ox+dx*best; pts[i*2+1] = oy+dy*best;
    if (trung) lipInto(pts, i, ox, oy, dx, dy, best, trung);
  }
  return pts;
}

// Soi đèn thẳng vào tường mà tường vẫn ĐEN — chủ dự án, 2026-08-31.
//
// Không phải lỗi của lớp tối hay của bộ vẽ tường: đa giác tầm nhìn dựng từ các GÓC của vật cản,
// nên biên của nó nằm đúng trên MẶT tường, và bản thân ô tường luôn nằm ngoài vùng được clip.
// Đo được: đứng cách một bức tường ba ô rồi soi đèn thẳng vào, sàn cách hai ô lên 105/255 (21 khi
// quay lưng) còn ô tường đứng nguyên 3/255 dù quay mặt hay quay lưng — chênh lệch đúng bằng
// không, tức là ánh sáng chưa từng chạm tới nó.
//
// Cách sửa: tia nào CHẠM vật cản thì đi tiếp vào bên trong ô nó vừa chạm, rồi dừng ngay khi ra
// khỏi đúng ô đó. Không nới một khoảng cố định, vì một khoảng cố định vừa đủ soi sáng bức tường
// dày một ô cũng vừa đủ rò sang phòng bên ở góc chéo. Đi tới mép ô là chặn đứng theo hình học:
// một tia vào một ô vuông thì ra khỏi ô đó trong vòng một đường chéo (≈34px), không hơn.
//
// Ô phía sau điểm chạm phải THỰC SỰ đặc thì mới đi tới mép ô. Chạm một cánh cửa đóng thì phía
// sau là sàn của phòng bên, và đi tới mép ô ở đó là rọi thẳng qua cánh cửa đang đóng — đúng thứ
// đa giác này sinh ra để chặn. Cánh cửa vẫn phải sáng (đứng soi đèn vào cửa mà cửa đen thì cũng
// là cái lỗi đang đi sửa), nên nó được nới đúng bằng bề dày của chính nó: DOOR_THICK, tức 6px,
// nằm gọn trong nửa ô cửa nên không con mắt nào thấy được sàn bên kia.
// SÁNG NGUYÊN BỨC TƯỜNG, không sáng một lớp mặt — chủ dự án, 2026-09-03:
// "chiếu vào cần sáng rõ nguyên bức tường luôn, đừng chỉ sáng 1 nữa, chỉ che sau bức tường thôi".
//
// Bản 2026-09-01 cắt đèn theo hai luật vật lý: chỉ liếm nửa ô (LIP_MAX) và nhân với góc tới
// (N·L). Đúng sách vở, sai cái mà mắt cần đọc được. Hậu quả đo trên khung hình:
//   - nửa xa của mỗi ô tường chìm hẳn vào tối, nên một bức tường dày 24 điểm ảnh chỉ hiện ra
//     một vạch sáng chừng 13 — mắt đọc ra một cái gờ, không đọc ra bức tường;
//   - dãy tường trước mặt thì đậm ở giữa và tắt dần ra hai đầu vì mũ 1.5 của N·L, nên chỉ ĐÚNG
//     MỘT khúc tường sáng còn phần còn lại của cùng bức tường ấy vẫn đen.
//
// Luật mới, đúng một câu: tia chạm vật đặc thì đi hết BỀ DÀY của khối đặc đó rồi dừng ngay tại
// mặt bên kia. Cả ô tường sáng đều từ mép này sang mép kia, không phụ thuộc góc tới.
//
// Cái CHẶN vẫn là chặn hình học, không phải một khoảng nới đoán chừng: điểm dừng luôn rơi trên
// một mép ô — mép nơi ô kế tiếp KHÔNG đặc, hoặc mép xa của chính hàng ô vừa chạm, tuỳ cái nào
// tới trước. Không tia nào bước được một điểm ảnh vào ô sàn phía sau, nên "chỉ che sau bức tường
// thôi" đúng theo nghĩa đen: đo 225-310 điểm sàn phía sau tường trên bốn hạt giống, sáng nhất
// vẫn 4/255, y hệt trước bản vá này.
//
// Đèn dừng ở BỨC TƯỜNG THỨ NHẤT, không đi tiếp vào thứ nằm sau nó — "chỉ che sau bức tường thôi".
// Đo được khi chưa có luật này: một bức tường có cụm tủ kê sát mặt sau, đèn đi hết 24 điểm ảnh bề
// dày tường rồi thừa 14 ăn sang cụm tủ, nên trên màn hình có hai mảng sáng hình thang lơ lửng phía
// sau bức tường đang soi. Không phải rò sang phòng bên (sàn sau tường vẫn đọc 3/255) nhưng mắt đọc
// ra "đèn xuyên qua tường", tức là vẫn sai.
//
// Luật: mặt tường nằm ngang thì đèn chỉ ăn trong HÀNG ô vừa chạm, mặt đứng thì chỉ trong CỘT ô đó.
// Chặn theo ĐÚNG MỘT trục — trục ăn sâu — chứ không lấy min với cả bốn mép ô như bản 2026-08-31:
// chính phép min hai trục ấy đẻ ra mấy vết khuyết hình chữ V, vì tia chạm sát ranh giữa hai ô tường
// CÙNG HÀNG thì mép bên chỉ cách nó một điểm ảnh. Đi ngang trong cùng một hàng là đi trong cùng một
// bức tường nên vẫn cho đi; bước sang hàng sau mới là sang một vật khác nên chặn.
//
// Trần độ sâu WALL_DEEP lo nốt trường hợp còn lại: tia quét SƯỢT dọc dãy tường thì không bao giờ
// rời khỏi hàng, nên nó đi được cả trăm điểm ảnh trong ruột tường, và hai đỉnh liền nhau của đa
// giác lệch nhau xa như thế thì cạnh nối chúng phình ra ngoài ở góc cửa. 1.6 ô = 38px, vừa hơn
// đường chéo một ô (34px) nên tường dày một ô luôn được soi hết bề dày.
//
// Cánh cửa đóng KHÔNG theo luật này: phía sau cánh cửa là sàn phòng bên chứ không phải khối
// đặc, đi hết "bề dày" ở đó là rọi thẳng qua cửa. Nó vẫn được nới đúng bằng bề dày của chính
// nó — DOOR_THICK, 6px, gọn trong nửa ô cửa.
// SEE: docs/patches/phase-5.4-patch-29-repo-wall-light.md
const MARCH_LUI = TILE * 0.55;   // giá trị lui khi hình học suy biến, không trả ra số nào dùng được
const WALL_DEEP = TILE * 1.6;    // trần độ sâu trong khối đặc: hơn đường chéo một ô, đủ cho tường dày một ô
// Đi trong KHỐI ĐẶC tới khi ra khỏi nó — và đây cũng là chỗ đã sinh ra mấy vết khuyết hình chữ V
// trên dải tường được soi sáng, 2026-09-01.
//
// Bản cũ hơn nữa lấy min với khoảng cách tới mép của ĐÚNG MỘT ô: tia nào chạm tường ngay sát
// đường ranh giữa hai ô tường thì "mép ô" cách nó chưa tới một điểm ảnh, nên đèn ăn vào tường
// đúng 0 — trong khi tia bên cạnh, chạm giữa ô, ăn vào đủ 13. Hai ô tường liền nhau là MỘT BỨC
// TƯỜNG chứ không phải hai vật, nên cái ranh giữa chúng không được để lại dấu vết gì: đi tiếp
// qua mép ô KHI VÀ CHỈ KHI ô bên kia mép cũng đặc. Gặp ô rỗng là dừng ngay tại mép.
function marchSolid(hx, hy, dx, dy, gx, gy){
  let t = 0;
  for (let k = 0; k < 5; k++){
    const bx = dx > 0 ? (gx+1)*TILE : gx*TILE;
    const by = dy > 0 ? (gy+1)*TILE : gy*TILE;
    const px = hx + dx*t, py = hy + dy*t;
    const tx = (dx > 1e-9 || dx < -1e-9) ? (bx - px)/dx : Infinity;
    const ty = (dy > 1e-9 || dy < -1e-9) ? (by - py)/dy : Infinity;
    const mep = Math.min(tx, ty);
    if (!(mep >= 0) || mep === Infinity) return MARCH_LUI;
    // Bước qua mép một chút để đọc ô KẾ TIẾP, không đọc lại ô vừa ra khỏi.
    const t2 = t + mep + 0.02;
    const ngx = ((hx + dx*t2)/TILE)|0, ngy = ((hy + dy*t2)/TILE)|0;
    if (!solidAt(ngx, ngy)) return t + mep;    // ô bên kia là phòng: dừng đúng ở mặt tường
    t = t2; gx = ngx; gy = ngy;
    if (t > WALL_DEEP) return WALL_DEEP;       // khối đặc dày quá: cắt, đừng tô sáng cả cụm
  }
  return Math.min(t, WALL_DEEP);
}
// Mép xa của HÀNG (hoặc CỘT) ô mà tia vừa chạm vào, đo dọc theo tia. Đây là "hết bức tường thứ
// nhất": qua khỏi mặt phẳng này là sang ô của một vật khác, dù ô đó cũng đặc.
function slabExit(hx, hy, dx, dy, gx, gy, s){
  const ngang = Math.abs(s.y2 - s.y1) < 1e-6;      // đoạn nằm ngang = mặt tường quay lên/xuống
  if (ngang){
    if (dy >  1e-9) return ((gy+1)*TILE - hy)/dy;
    if (dy < -1e-9) return (gy*TILE - hy)/dy;
    return Infinity;                                // quét sượt: WALL_DEEP cắt nốt
  }
  if (dx >  1e-9) return ((gx+1)*TILE - hx)/dx;
  if (dx < -1e-9) return (gx*TILE - hx)/dx;
  return Infinity;
}
function lipInto(pts, i, ox, oy, dx, dy, best, s){
  const hx = ox + dx*best, hy = oy + dy*best;
  // Nhích nửa pixel qua mặt vừa chạm để đọc ô ở PHÍA BÊN KIA, không phải ô mình đang đứng.
  const gx = ((hx + dx*0.5)/TILE)|0, gy = ((hy + dy*0.5)/TILE)|0;
  let them;
  if (solidAt(gx, gy)){
    them = Math.min(marchSolid(hx, hy, dx, dy, gx, gy), slabExit(hx, hy, dx, dy, gx, gy, s));
  } else if (s && s.cua){
    them = DOOR_THICK;
  } else return;
  if (!(them > 0) || them === Infinity) return;
  pts[i*2]   = hx + dx*them;
  pts[i*2+1] = hy + dy*them;
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
  const s3 = p.slowT > 0 ? s2 * 0.55 : s2;
  // Giật súng: chân chậm hẳn một nhịp sau mỗi phát. Đây là cái giá của sát thương thô, và là
  // lý do khẩu nòng ngắn không phải khẩu để bấm liên tục trong lúc có thứ đang đuổi.
  const s4 = (p.recoilT || 0) > 0 ? s3 * RECOIL_SLOW_MUL : s3;
  // speedScale: chi so spd cua xac + giay + ky nang tang toc. Truong nay da duoc khai
  // o makeActor tu dau nhung chua noi nao doc - day la noi no co tac dung.
  return s4 * (p.speedScale || 1) * ((p.hasteT || 0) > 0 ? HASTE_MUL : 1);
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
  // sightMul: he so tam nhin cua lop ky nang (Thau Thi cho ca to nhin xa gap ruoi).
  const base = CONE_R * (1 + S.upg.light*0.16) * (p.sightMul || 1);
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

// LÁI XE. Người chơi vẫn là cái thân được moveEnt() đẩy đi, nên va chạm, tường và cửa kẹt
// vẫn đúng một luật với lúc đi bộ; chiếc xe chỉ quyết định ĐI NHANH BAO NHIÊU và ĐI HƯỚNG NÀO.
// WHY nó có đà và có góc lái thay vì đi ngang như lúc đi bộ: nếu bẻ lái tức thì thì chiếc xe
// chỉ là "đi bộ nhanh gấp đôi", và không có gì để chơi. Có đà thì hành lang hẹp trở thành một
// bài toán, và cú húc trở thành một thứ phải NGẮM chứ không phải một nút bấm.
function rideBike(p, dt, vx, vy, push){
  const b = p.riding;
  const d = bikeDef(b);
  const hetXang = b.fuel <= 0;
  if (hetXang && !b.warned){
    b.warned = true;
    toast(d.name + ' hết xăng — dắt bộ về được, chậm thôi. Tầng sau mới có xe đầy bình.');
  }
  const ga = (vx || vy) ? clamp(push, 0, 1) : 0;
  if (ga > 0){
    const muon = Math.atan2(vy, vx);
    const lech = angDiff(muon, b.dir);
    const buoc = BIKE_TURN * dt;
    b.dir += clamp(lech, -buoc, buoc);
    // Máy chết thì trần tốc và đà đều tụt xuống mức dắt bộ. Không cần luật riêng cho húc hay ngã:
    // BIKE_PUSH_SPEED nằm dưới cả BIKE_RAM_MIN lẫn BIKE_CRASH_SPD, nên dắt bộ tự nó đã không húc
    // được ai và không ngã được.
    b.spd = Math.min(hetXang ? BIKE_PUSH_SPEED : d.speed,
                     b.spd + (hetXang ? BIKE_PUSH_ACCEL : BIKE_ACCEL) * ga * dt);
    if (!hetXang) b.fuel = Math.max(0, b.fuel - (BIKE_FUEL_RUN * ga + BIKE_FUEL_IDLE) * dt);
  } else {
    b.spd = Math.max(0, b.spd - d.speed * BIKE_DRAG * dt);
    if (!hetXang) b.fuel = Math.max(0, b.fuel - BIKE_FUEL_IDLE * dt);
  }
  p.dir = b.dir;
  if (b.spd > 0.5){
    const dx = Math.cos(b.dir) * b.spd * dt, dy = Math.sin(b.dir) * b.spd * dt;
    const truoc = { x: p.x, y: p.y };
    const dung = moveEnt(p, dx, dy, 7.5);
    b.x = p.x; b.y = p.y;
    // ĐÂM là ĐI KHÔNG ĐƯỢC, không phải "có chạm vào tường".
    // ROOT-CAUSE: moveEnt() báo `blocked` khi MỘT trong hai trục bị chặn — tức là suốt cả
    // quãng lướt dọc theo một bức tường, khung nào cũng báo chặn dù xe vẫn đi ngon lành. Đọc
    // thẳng cờ đó ra hai chuyện sai: tốc độ bị nhân 0,3 mỗi khung hình nên chạy sát tường là
    // xe bò được vài px/giây, và đang phóng mà quệt nhẹ vào góc tường là NGÃ. Đo bằng quãng
    // đường thật sự đi được thì lướt tường vẫn là lướt, còn dí thẳng mũi vào tường mới là đâm.
    p.noise = hetXang ? 0.9 : 2.2;   // một cái xe chết máy đang được dắt thì gần như im
    const diDuoc = Math.hypot(p.x - truoc.x, p.y - truoc.y);
    const dam = dung && diDuoc < Math.hypot(dx, dy) * 0.45;
    if (dam && b.spd > BIKE_CRASH_SPD){ bikeCrash(p, b); return; }
    if (dam) b.spd *= 0.3;
    bikeRam(p, b);
  } else {
    b.x = p.x; b.y = p.y;
    p.noise = hetXang ? 0 : 0.8;
  }
}

// HÚC. Bản gốc gọi là "boosted impacts", và với một người không cầm được gì thì đây là cách
// duy nhất họ còn có thể làm gì đó với con đang đuổi mình.
function bikeRam(p, b){
  if (b.spd < BIKE_RAM_MIN) return;
  for (const m of S.monsters){
    if (m.hp <= 0 || (m.ramT || 0) > 0) continue;
    if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + 11) continue;
    m.ramT = BIKE_RAM_CD;
    const dmg = b.spd * BIKE_RAM_DMG;
    if (foeHit(m, dmg, b.dir, BIKE_RAM_KNOCK)) killMonster(m);
    b.spd *= 0.5;                       // húc xong thì khựng lại — không cày được một hàng
    fxShake(p === S.player ? 10 : 4);   // đồng đội húc ở phòng bên thì máy không cần rung mạnh
    break;
  }
}

function stepBikes(dt){
  for (const b of (S.bikes || [])){
    b.downed = Math.max(0, b.downed - dt);
    if (!b.rider) b.spd = Math.max(0, b.spd - 400*dt);
    // đồ trên thùng đi theo xe, xếp thành hàng để nhìn một cái là biết chở được mấy món
    for (let i = 0; i < b.items.length; i++){
      const l = b.items[i];
      if (l.gone) continue;
      l.x = b.x - Math.cos(b.dir)*10 + ((i%2)-0.5)*10;
      l.y = b.y - Math.sin(b.dir)*10 + (((i/2)|0)-0.5)*10;
      l.vx = l.vy = 0;
    }
    b.items = b.items.filter(l => !l.gone);
  }
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
  // AI đang cầm càng. holdInFront() đã đọc `o.holder` từ trước và chỉ rơi về S.player khi không
  // có ai — gán thẳng vào đây là chiếc xe đẩy đi theo đúng người đang đẩy nó, và đó là toàn bộ
  // thứ còn thiếu để một con bot dùng được cái xe.
  cart.holder = p;
  cart.held = true; p.pushing = true;
  cart.freeX = cart.x; cart.freeY = cart.y;
  // Đồng đội cũng đẩy được xe, nên mấy dòng nhắn phải hỏi lại xem người đẩy có phải là tôi không.
  if (p === S.player)
    toast(cart.mode === 'strong' ? 'Đẩy xe — nắm đúng mặt trước' : 'Đẩy xe — nắm sai mặt, nặng hơn hẳn');
  return true;
}
function releaseCart(p){
  const cart = S.cart;
  if (!cart || !cart.held) return;
  if (cart.holder && cart.holder !== p) return;      // không buông hộ càng xe của người khác
  cart.held = false; cart.holder = null; p.pushing = false;
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

// Lên xe. KHÔNG cầm gì trên tay — bản gốc nói thẳng: "cannot carry items while riding".
// Đó không phải một hạn chế cho vui: cả trò chơi này là khuân đồ, nên một chiếc xe vừa nhanh
// vừa ôm được đồ là một chiếc xe xoá sổ phần còn lại của trò chơi. Muốn chở thì chất lên
// thùng sau của xe chở đồ — đó là việc khác, và chỉ một trong hai chiếc làm được.
function mountBike(p, b){
  if (!b || b.rider) return false;
  const minh = p === S.player;                      // đồng nghiệp leo lên xe thì đừng nhắn cho tôi
  if (b.downed > 0){ if (minh) toast('Xe đang nằm — đợi ' + b.downed.toFixed(1) + 's nữa dựng lên được'); return false; }
  if (p.down) return false;
  if (p.held){ if (minh) toast('Đang ôm đồ thì không leo lên xe được — thả xuống, hoặc chất lên thùng sau'); return false; }
  // Cạn bình KHÔNG khoá xe nữa — leo lên dắt bộ được, xem BIKE_PUSH_SPEED.
  if (b.fuel <= 0 && minh) toast(bikeDef(b).name + ' hết xăng — dắt bộ được, chậm thôi. Tầng sau mới đầy bình.');
  if (p.pushing) releaseCart(p);
  b.rider = p; p.riding = b;
  b.x = p.x; b.y = p.y; b.dir = p.dir; b.spd = 0;
  if (minh) toast(bikeDef(b).name + ' — xăng ' + Math.round(b.fuel/b.fuelMax*100) +
                  '%. Húc thẳng vào nó cũng là một cách.');
  return true;
}
function dismountBike(p){
  const b = p.riding;
  if (!b) return false;
  b.rider = null; p.riding = null; b.spd = 0;
  // Đỗ xe chở đồ lên bệ đang mở thì dỡ cả thùng — cùng một luật với xe đẩy, vì với người chơi
  // thì đó là cùng một việc.
  const pad = S.pads[S.padIndex];
  if (pad && pad.active && !pad.done && b.items.length &&
      Math.abs(b.x-pad.x) < TILE*2.4 && Math.abs(b.y-pad.y) < TILE*2.4){
    const n = b.items.length, v = bikeValue(b);
    for (const l of b.items){ l.inCart = false; l.inBike = null; l.onPad = pad; pad.placed.push(l); }
    b.items = [];
    recomputePad(pad);
    toast((p === S.player ? 'Dỡ ' : (p.name || 'Đồng đội') + ' dỡ ') + n + ' món lên bệ: ' + money(v));
  }
  return true;
}
// Ngã xe: đâm tường ở tốc độ cao. Người văng ra, xe nằm một lúc, và đồ trên thùng ăn đòn.
function bikeCrash(p, b){
  const minh = p === S.player;
  const v = b.spd;
  b.spd = 0; b.downed = BIKE_DOWN_T;
  // Cú va đập tính TRƯỚC khi xuống xe. dismountBike có thể dỡ cả thùng lên bệ nếu đâm ngay cạnh
  // bệ, và bản cũ vẫn chạy tiếp vòng lặp `b.items` đã cũ — nên món vừa đặt lên bệ an toàn vẫn ăn
  // trọn cú đập. Đâm cạnh bệ thành nước đi tệ nhất trong game một cách vô hình.
  const cho = b.items.slice();
  for (const l of cho) damageLoot(l, v * 0.9);
  dismountBike(p);
  // hurtActor: người chơi và đồng đội ngã xe đau như nhau, và mỗi bên đi đúng cửa của mình.
  hurtActor(p, BIKE_CRASH_DMG, 'bike', b.x + Math.cos(b.dir)*20, b.y + Math.sin(b.dir)*20);
  fxShake(minh ? 14 : 5); SFX.thud();
  toast(minh ? 'Đâm rồi — xe nằm ' + BIKE_DOWN_T + 's.'
             : (p.name || 'Đồng đội') + ' đâm xe rồi.');
}

function pickUp(p){
  if (p.down) return cycleSpectate();  // a head on the floor has nothing to grab with — it watches
  if (p.riding){ dismountBike(p); return true; }
  if (p.pushing){ releaseCart(p); return true; }
  if (p.held){ dropHeld(p); return true; }
  const best = nearestLoot(p);
  if (!best){
    // Không có gì để nhặt: xe máy trước, rồi mới tới càng xe đẩy. Xe máy đứng ngay cạnh xe tải
    // cùng chỗ với xe đẩy, và nó là thứ người chơi CHỦ ĐỘNG đi tới — cái càng xe đẩy vốn chỉ
    // là chỗ rơi cuối cùng của nút này.
    const b = nearestBike(p);
    if (b) return mountBike(p, b);
    return grabCart(p);
  }
  if (best.onPad){                            // off a shop checkout, or off a pad still counting
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
  // Thùng sau của xe chở đồ, trước cả xe đẩy: bản gốc cho "place small Valuables into the back
  // compartment", và người chơi đi tới tận nơi thì có nghĩa là họ đang định làm đúng việc đó.
  for (const b of (S.bikes || [])){
    if (bikeDef(b).slots <= 0) continue;
    if (Math.hypot(l.x-b.x, l.y-b.y) > b.r + TILE*1.4) continue;
    if (bikeFits(b, l)){
      // `inBike` là con trỏ ngược về chiếc xe đang giữ món này. Trước đây chỉ có cờ `inCart` dùng
      // chung với xe đẩy, nên không ai trả lời được câu "món này nằm trong xe NÀO" — xem clearHeadOf.
      l.inCart = true; l.inBike = b; b.items.push(l);
      toast('Chất lên thùng: ' + money(l.value) + ' (' + b.items.length + '/' + bikeDef(b).slots + ')');
      return;
    }
    toast(l.value >= CART_MAX_VALUE
      ? 'Món ' + money(l.value) + ' — đắt quá, phải ôm tay'
      : 'Thùng sau đầy rồi');
    break;
  }
  // onto the cart first — you walk up to the cart to load it, so it must win over the floor
  const cart = S.cart;
  if (cart && Math.hypot(l.x-cart.x, l.y-cart.y) < cart.r + TILE*1.4){
    if (cartFits(cart, l)){
      l.inCart = true; cart.items.push(l);
      toast('Chất lên xe: ' + money(l.value) + ' (' + cart.items.length + '/' + CART_SLOTS + ')');
      return;
    }
    toast(l.value >= CART_MAX_VALUE
      ? 'Món ' + money(l.value) + ' — đắt quá, phải ôm tay. Xe chỉ chở dưới ' + money(CART_MAX_VALUE)
      : 'Xe đầy rồi');
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
    if ((m.deafT || 0) > 0) continue;    // vua bi Choi Loa thi may giay sau con u tai
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
    if ((a.invisT || 0) > 0) continue;   // tang hinh: khong ai nhin thay, khong ai duoi
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
  // Loài đi theo đàn không rơi gì. Không có dòng này thì một đàn bốn con là bốn món đồ, tức là
  // phần thưởng lớn nhất trong nhà lại đến từ thứ rẻ nhất để giết.
  if (d.noLoot) return 0;
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
  // S.levelDone KHÔNG còn là cái chốt ở đây. Trước đây nó là, và đó chính là lý do "xong hết
  // extract chưa thấy quái ồ ạt": chốt bệ cuối xong thì mọi con bị hạ đều biến mất vĩnh viễn.
  // Giờ chỉ có ca hỏng / chết / cửa hàng mới dừng, còn pha chạy thì gọi lại NHANH HƠN 45 lần.
  if (S.shopMode || S.shiftLost || S.noFoes) return false;
  if (S.levelDone && !S.esc) return false;
  // Loai di dan KHONG quay lai. queueRespawn xep tung con mot, nen mot dan bon con bi don sach
  // se tro ve thanh bon con le te o bon goc nha vao bon thoi diem khac nhau - dung cai hinh dang
  // ma ca hai loai nay khong co. Don sach mot dan la mot viec DA XONG.
  if (MONSTERS[type] && MONSTERS[type].pack) return false;
  (S.respawns = S.respawns || []).push({ type, t: S.esc ? ESC_RESPAWN : FOE_RESPAWN });
  return true;
}
// Somewhere reachable, well away from the truck, never within nine tiles of anybody alive, and
// never anywhere the player is looking - the same rule the mid-shift restock follows, because a
// monster that blinks into view is a bug the player can see.
// Đặt một con, hoặc CẢ ĐÀN nếu loài đó đi đàn. Tách riêng vì có hai chỗ cần đúng cái hình
// dạng này: lúc dựng nhà, và lúc nhà gọi thêm người sau bệ cuối. Một con Bom con đứng lẻ chỉ
// là một quả lựu đạn biết đi — cái đáng sợ là bốn quả cùng lúc, vì lúc đó câu hỏi không còn
// là "giết con nào trước" mà là "lùi về đâu".
function spawnPack(type, x0, y0, rnd){
  rnd = rnd || Math.random;
  const bay = (MONSTERS[type] && MONSTERS[type].pack) || 1;
  S.monsters.push(makeMonster(type, x0, y0));
  for (let k = 1; k < bay; k++){
    // Thử tám hướng trước khi bỏ một con. Một lần thử duy nhất thì đàn bốn con đứng cạnh
    // tường thường chỉ ra ba: chỗ đặt quái nào cũng có ít nhất một phía là tường.
    for (let thu = 0; thu < 8; thu++){
      const a = (k/bay)*Math.PI*2 + thu*0.79 + rnd()*0.4, r = TILE*(1.1 + rnd()*0.9);
      const x = x0 + Math.cos(a)*r, y = y0 + Math.sin(a)*r;
      if (hitsSolid(x, y, 9)) continue;
      S.monsters.push(makeMonster(type, x, y));
      break;
    }
  }
  return bay;
}
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
    // Ca hỏng hoặc chết thì thôi. Nhưng XONG BỆ CUỐI thì không: đó là lúc căn nhà bận rộn
    // nhất, không phải lúc nó đóng cửa. Xem startEscape().
    if (S.shiftLost || S.dead || (S.levelDone && !S.esc)){ q.splice(i,1); continue; }
    // Con của đợt gọi thêm đứng quanh XE TẢI (escSpot); con quay lại sau khi bị hạ vẫn theo
    // luật cũ, tức là tránh xa xe tải ra.
    const at = e.wave ? escSpot() : respawnSpot();
    if (!at){ e.t = 3; continue; }       // nowhere out of sight right now - try again shortly
    // spawnPack ra CẢ ĐÀN nếu loài đó đi đàn. Con quay lại sau khi bị hạ vẫn ra một mình như
    // cũ, không phải vì có luật riêng ở đây mà vì queueRespawn không bao giờ xếp loài đi đàn —
    // dọn sạch một đàn là một việc ĐÃ XONG. Đàn chỉ tới từ đợt gọi thêm của pha chạy.
    const bay = spawnPack(e.type, at.x, at.y);
    q.splice(i, 1);
    SFX.thud();                          // something moved, somewhere behind you
    toast(MONSTERS[e.type].name + (bay > 1 ? ' ×' + bay : '') +
          (S.esc ? ' vào chặn đường' : ' vừa vào nhà'));
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
    m.slowT   = Math.max(0, (m.slowT || 0) - dt);
    m.flash   = Math.max(0, (m.flash || 0) - dt);
    m.ramT    = Math.max(0, (m.ramT  || 0) - dt);
    m.vulnT   = Math.max(0, (m.vulnT || 0) - dt);
    m.deafT   = Math.max(0, (m.deafT || 0) - dt);
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
      m.alert = 2.6;
      // MỆT THÌ NHẮM CHẬM. Lúc sung nó cập nhật chỗ bạn đứng mỗi khung hình; lúc mệt nó chỉ làm
      // mới mỗi FOE_TIRE_LAG giây, nên nó đuổi theo cái BÓNG của bạn — đó là 'ngu đi' của con này.
      m.aimT = (m.aimT || 0) - dt;
      if ((m.tired || 0) < 0.05 || m.aimT <= 0){
        m.tx = p.x; m.ty = p.y;                              // target updates ONLY on detection
        m.aimT = FOE_TIRE_LAG * (m.tired || 0);
      }
      m.lost = 0;
    }
    else { m.alert = Math.max(0, m.alert - dt); m.lost += dt; }

    // Given up on where it is standing: move to a room near the player, out of sight.
    if (m.lost >= RELOCATE_AFTER && dist > RELOCATE_MIN_D && !S.levelDone && !S.dead){
      if (relocateFoe(m, Math.random)) SFX.thud();          // something moved, somewhere behind you
      else m.lost = RELOCATE_AFTER * 0.5;                   // nowhere to go; try again shortly
    }

    // Đồng hồ đuổi. Chạy lên khi đang đuổi, chạy xuống khi không — nên cắt đuôi được vài giây là
    // nó lại sung, và một cuộc rượt thứ hai vẫn đáng sợ như cuộc thứ nhất.
    if (d.tire === false){ m.chaseT = 0; m.tired = 0; }
    else if (m.alert > 0 && m.state !== 'patrol'){
      m.chaseT = (m.chaseT || 0) + dt;
      if (m.chaseT >= FOE_GIVEUP){
        m.alert = 0; m.lost = RELOCATE_AFTER * 0.5;
        m.chaseT = -FOE_REST;                       // âm = đang nghỉ, chưa đuổi lại được
        m.tired = 1;
        if (Math.hypot(m.x-S.player.x, m.y-S.player.y) < 12*TILE) SFX.thud();
      }
    } else if ((m.chaseT || 0) < 0){
      m.chaseT = Math.min(0, m.chaseT + dt);        // đang nghỉ: đếm ngược về 0
    } else {
      m.chaseT = Math.max(0, (m.chaseT || 0) - dt*1.6);   // hồi sức nhanh gấp rưỡi lúc mệt đi
    }
    m.tired = clamp(((m.chaseT || 0) - FOE_TIRE_AFTER) / (FOE_TIRE_FULL - FOE_TIRE_AFTER), 0, 1);

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
    // slowT: Dong Bang lam quai le chan. Day la cho DUY NHAT toc do quai duoc quyet,
    // nen mot truong "slow" gan tu ngoai vao ma khong sua dong nay la truong chet.
    const slowMul = (m.slowT || 0) > 0 ? FREEZE_SLOW_MUL : 1;
    // Đang vung tay thì ĐỨNG YÊN. Đây là nửa quan trọng của cú telegraph: một con vừa vung vừa
    // bám theo bạn thì cái vung ấy chỉ là hiệu ứng, không phải một cửa sổ để né.
    const metMul = 1 - (1 - FOE_TIRE_SPD) * (m.tired || 0);
    const spd = (m.swing || 0) > 0 ? 0
              : m.speed * slowMul * metMul * (m.state === 'chase' ? 1.25 : m.state === 'hunt' ? 1.0 : 0.7);
    // Never step PAST the thing being walked to, and stop a body short of a live target.
    const standOff = m.state === 'chase' ? FOE_STANDOFF : 0;
    const step = Math.max(0, Math.min(spd*dt, am - standOff));
    let mx = ax/am*step, my = ay/am*step;
    const sep = foeSeparation(m);
    if (sep){ mx += sep.x*FOE_SEP_PUSH*dt; my += sep.y*FOE_SEP_PUSH*dt; }
    // Vận tốc THẬT của khung này, đo bằng chỗ nó đứng trước và sau khi đi — không phải bằng
    // hướng nó định đi. Đón đầu phải tính trên cái nó đang làm, không phải cái nó đang muốn:
    // một con bị tường chặn vẫn "muốn" lao thẳng, mà thật ra nó đứng yên.
    const ox = m.x, oy = m.y;
    if (mx || my) moveEnt(m, mx, my, d.body || FOE_BODY);
    if (dt > 0){ m.vx = (m.x - ox)/dt; m.vy = (m.y - oy)/dt; }

    // Tang hinh chan CA CU DANH, khong chi chan viec nhin thay. foeTarget() bo qua
    // nguoi dang tang hinh, nhung mot con dang o giua co CHASE thi van giu m.target
    // cu va van vung tay trong tam 22px - do thuc: 30 mau mot giay ruoi vao mot
    // nguoi dang "vo hinh". Cai minh khong thay thi khong danh trung duoc.
    // KHÔNG CON NÀO ĐƯỢC ĐÁNH TRÚNG Ở ĐÚNG KHUNG HÌNH NÓ CHẠM VÀO BẠN — chủ dự án, 2026-09-03:
    // "không có con quái nào khi chạm vào sẽ gây sát thương ngay lập tức mà chúng sẽ cần anim dùng
    // tay đánh hay cắn để user còn có đường né, chạy", vì "cảm giác cứ ủn vào là đau rất khó chịu".
    //
    // Luật cũ là một dòng: lọt vào 22px + hết nguội = trừ máu, ngay khung hình đó. Không có một
    // khoảnh khắc nào giữa 'nó tới gần' và 'bạn mất máu', nên không có gì để né — người chơi chỉ
    // biết mình bị đánh SAU KHI đã bị đánh. Đo bằng Kẻ nặng: đứng cạnh nó, 72 máu bay trong đúng
    // một khung hình, không có tín hiệu nào trước đó.
    //
    // Nay mỗi cú đánh có HAI THÌ. Thì một: nó đứng khựng lại và vung tay, kéo dài d.wind giây —
    // càng đau càng vung lâu, Kẻ nặng 0.90s còn Gnome 0.34s. Nó KHÔNG DI CHUYỂN trong thì này
    // (xem chỗ tính spd), và đó mới là thứ tạo ra đường thoát: bạn có đúng chừng ấy giây để lùi ra.
    // Thì hai: hết giờ mới kiểm lại — còn trong tầm thì ăn đòn, ra khỏi tầm thì HỤT.
    //
    // Tầm kiểm ở thì hai rộng hơn tầm khơi mào một chút (FOE_WHIFF), nếu không thì nhích nửa pixel
    // cũng thoát và cả bảng quái thành vô hại. Lùi được một bước mới thoát.
    const tam = d.reach || FOE_REACH;
    if ((m.swing || 0) > 0){
      m.swing -= dt;
      if (m.swing <= 0){
        m.swing = 0;
        m.hit = d.cd || 0.9;
        const conTrongTam = Math.hypot(p.x-m.x, p.y-m.y) < tam*FOE_WHIFF;
        if (conTrongTam && !S.dead && !p.down && !((p.invisT || 0) > 0)){
          hurtActor(p, m.dmg, m.type, m.x, m.y);
          // a monster hitting you also hits what you are carrying. Gnome đảo ngược tỉ lệ đó: đòn của
          // nó gần như không đau, nhưng cái búa chim của nó nhắm vào MÓN ĐỒ. Với một loài không giết
          // được ai, đó là cách duy nhất nó còn là một mối đe doạ.
          if (p.held) damageLoot(p.held, m.dmg * (d.lootDmg || 4));
        } else if (p === S.player){
          // Né được thì phải THẤY là mình vừa né được, nếu không thì cú né đọc ra 'nó đánh trượt
          // ngẫu nhiên' chứ không đọc ra 'mình vừa làm đúng'.
          fxPop(m.x, m.y - 16, 'HỤT', '#cfe6ff', 11);
        }
      }
    }
    // Khơi mào một cú vung. `noMelee` là loài không có đòn nào cả — Bom con: cái nó làm với bạn là
    // tự nổ, nên một cú vung tay 0 sát thương của nó vẫn hất bạn văng ra, rung màn, loè máu đỏ và
    // kêu tiếng ăn đòn. Đo được bốn cú như thế mỗi 0.9 giây trước bản này.
    else if (!d.noMelee && m.dmg > 0 && dist < tam && m.hit <= 0 && !S.dead && !p.down &&
             m.alert > 0 && !((p.invisT || 0) > 0)){
      m.swing = d.wind || FOE_WIND;
      m.swingDir = Math.atan2(p.y-m.y, p.x-m.x);
      if (p === S.player && Math.hypot(m.x-S.player.x, m.y-S.player.y) < 12*TILE) SFX.strain();
    }
  }
}

// ============================================================ Bom con và Gnome
//
// Hai loài này chạy ở PASS RIÊNG, sau stepMonsters, vì cả hai đều có thể giết một con quái giữa
// chừng — mà stepMonsters duyệt `for (const m of S.monsters)` và killMonster thì splice ngay
// trong mảng đó. Cắt phần tử trong lúc for-of đang chạy là bỏ sót đúng con đứng sau nó, một cách
// lặng lẽ. Chạy riêng trên một bản chụp thì không phải nghĩ về chuyện đó nữa.
// SEE: đàn bom + đàn gnome, 2026-08-31

const BANGER_FUSE   = 3.2;    // giây từ lúc thấy người tới lúc nổ
const BANGER_R      = TILE*3.0;
const BANGER_EARLY  = 0.45;   // hệ số nổ khi bị giết lúc ngòi còn cháy
const BANGER_CHAIN  = 0.22;   // ngòi của quả bị kích dây chuyền, để thấy được nó là DÂY CHUYỀN
const BANGER_NOISE  = 9*TILE; // tiếng nổ gọi cả nhà tới
const BANGER_TOUCH_R = 26;    // tới đây là coi như đã áp được vào người
const BANGER_TOUCH   = 0.75;  // và ngòi rút còn chừng này giây — vẫn đủ để lùi ra nếu nhanh tay

function blowBanger(m, pow, fuse){
  S.bombs.push({ x:m.x, y:m.y, t:0, fuse:fuse || 0, r:BANGER_R, pow:pow, done:false, owner:'foe' });
}

// Ngòi cháy rồi thì KHÔNG tắt được, và đó là toàn bộ luật chơi của con này: khoảnh khắc nó thấy
// bạn, câu hỏi đổi từ "làm sao giết nó" thành "giết nó Ở ĐÂU". Vụt cho bay ra xa rồi mới hạ thì
// vụ nổ rơi vào chỗ trống; hạ ngay dưới chân mình thì vỡ hết đồ đang ôm.
function stepBangers(dt){
  for (const m of S.monsters.slice()){
    if (m.type !== 'banger' || m.hp <= 0) continue;
    if (m.sleep > 0) continue;                    // thuốc mê giữ được cả cái ngòi
    if (m.fuse == null){
      if (m.alert <= 0) continue;
      m.fuse = BANGER_FUSE;
      if (Math.hypot(m.x-S.player.x, m.y-S.player.y) < 12*TILE) SFX.strain();
      continue;
    }
    // ÁP SÁT LÀ TỰ HUỶ. Chủ dự án, 2026-09-03: "đụng vào là gây sát thương cho player thay vì tự
    // hủy và phát nổ sau 1 khoảng thời gian".
    //
    // Con này chưa bao giờ được phép đánh ai (`dmg: 0`), nhưng nó vẫn chạy nhánh đánh cận chiến,
    // và hurtPlayer(0) vẫn làm đủ năm thứ: hất bạn văng ra, rung màn, khựng khung hình, loè vệt
    // máu đỏ và kêu tiếng ăn đòn. Đo được bốn cú như thế trong 2.8 giây, `n:0` cả bốn. Máu không
    // tụt một điểm nào, mà trên màn hình thì đó LÀ ăn đòn. Nay `noMelee` chặn nhánh ấy từ gốc.
    //
    // Thứ thay vào chỗ đó là cái đúng ra nó phải làm: tới sát người thì cắm chân xuống, ngòi rút
    // còn BANGER_TOUCH giây, rồi tự nổ tự chết. Ngòi rút ngắn CHỨ KHÔNG nổ ngay — nổ ngay lúc
    // chạm thì lại đúng cái 'ủn vào là đau' đang phải bỏ, chỉ đổi tên. Chừng ấy giây là đủ để lùi
    // ra khỏi bán kính nổ nếu bạn phản xạ kịp.
    const gan = Math.hypot(m.x-S.player.x, m.y-S.player.y);
    if (gan < BANGER_TOUCH_R && !S.dead && !S.player.down){
      if (!m.planted){
        m.planted = true;
        m.fuse = Math.min(m.fuse, BANGER_TOUCH);
        SFX.tick(6);
        fxPop(m.x, m.y - 16, 'XÌIII', '#ffc98a', 11);
      }
    }
    if (m.planted) m.speed = 0;                     // cắm chân: nó không đuổi nữa, nó chỉ đếm
    m.fuse -= dt;
    // một nhịp mỗi nửa giây, nhanh dần — nghe được cái ngòi là biết còn bao lâu mà không phải nhìn
    const nhip = m.fuse < 1.2 ? 0.18 : 0.42;
    if (Math.floor((m.fuse + dt)/nhip) !== Math.floor(m.fuse/nhip) &&
        Math.hypot(m.x-S.player.x, m.y-S.player.y) < 11*TILE) SFX.tick(m.fuse < 1.2 ? 4 : 1);
    if (m.fuse <= 0){
      blowBanger(m, 1, 0);
      makeNoise(m.x, m.y, BANGER_NOISE, 2);
      killMonster(m);
    }
  }
}

// GIẪM. Người chơi đi tới đè lên là con gnome chết.
//
// Phải có ĐI: đứng dí vào nó mà nó tự chết thì loài này thành vô hại, và bike-suite đã có sẵn một
// bài khẳng định đúng nguyên tắc đó cho cú húc xe ("bò chậm chạm vào thì KHÔNG ăn thua").
// Và bán kính phải NHỎ HƠN tầm đánh 22px của chính con quái, đúng bài học đã ghi ở nút Đẩy: một
// vùng giết rộng hơn tầm nó đánh là nó chết trước khi kịp vung tay, tức là miễn nhiễm trá hình,
// tức là loài này không tồn tại.
//
// "Đang đi" đọc từ p.noise chứ không phải từ quãng đường đi được giữa hai khung hình. Đo thử bằng
// quãng đường thì hỏng: người chơi đứng yên vẫn TRÔI ~55px/s khi có một cái thân khác đè vào, nên
// con gnome tự lao vào chân mình rồi tự chết, và loài này lại thành vô hại theo một đường khác.
// p.noise là câu trả lời sẵn có của bộ máy cho đúng câu hỏi đó, và nó có bốn bậc: đứng yên 0, rón
// rén 0,25, đi 1, chạy 2,6. Lấy mốc ở bậc ĐI, nên rón rén qua một con gnome thì nó sống.
// Bán kính giẫm. 15 là một con số KHÔNG VỚI TỚI: một con đang đuổi dừng lại ở FOE_STANDOFF = 18px
// tính từ bạn, nên khoảng cách gần nhất đo được suốt sáu giây đi thẳng vào nó là đúng 18.0 — cú
// giẫm chưa từng một lần nổ ra, và cả dòng "chạy tới giẫm lên là chết" trong sổ tay là một lời hứa
// suông. Nâng lên 20: vẫn NHỎ HƠN tầm đánh 22 (luật cũ ghi ở dưới vẫn còn nguyên giá trị), mà đã
// nằm ngoài cái chốt 18 kia nên với tới được. Cộng với thì vung tay 0.34s của gnome, nó vẫn kịp
// khơi mào một cú đánh trước khi bị giẫm — nên đây không phải là biến nó thành vô hại.
const STOMP_R     = 20;
const STOMP_NOISE = 1;        // phải đi hẳn, không phải rón rén, và không phải đứng yên
function stepStomp(dt){
  const p = S.player;
  if (!p || p.down || S.dead || S.shopMode) return;
  if ((p.noise || 0) < STOMP_NOISE) return;
  for (const m of S.monsters.slice()){
    const d = MONSTERS[m.type];
    if (!d || !d.stomp || m.hp <= 0) continue;
    if (Math.hypot(m.x-p.x, m.y-p.y) > STOMP_R) continue;
    fxPop(m.x, m.y, 'ĐỘP', '#b8f0c4', 12);
    fxShake(3); SFX.thud();
    m.hp = 0;
    killMonster(m);
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

// MOT CU DANH KHONG DUOC PHEP GIET BAN TU DAY MAU.
// Chu du an: "trung 1 phat la chet neu player chua tang mau goc".
// So do khong sai o dau ca: Ke nang danh 100, ma mau goc cung dung 100 - nen nguoi choi chua
// mua nang cap mau thi mot cu cham duy nhat la het van, khong kip lam gi, khong kip hieu vi
// sao. Do khong phai do kho, do la mot cai bay: cai duy nhat no day nguoi choi la "dung lai
// gan Ke nang", ma bai hoc do chi den SAU khi da mat ca ca truc.
// Cach chan: mot don le KHONG duoc lay qua ngan nay phan mau toi da. Chan theo TI LE chu
// khong theo con so cung, vi ban Biet Doi moi xac mot muc mau khac nhau (95..129), va mot
// con so cung se dung cho xac nay va sai cho xac kia.
// No KHONG lam ban bat tu: cu thu hai giet duoc ngay, va no chi chan khi ban dang DAY MAU -
// dung so mau ma nguoi choi tin la mot lan an don nua van con song.
const HIT_MAX_FRAC = 0.72;
function hurtPlayer(n, src, fromX, fromY){
  const p = S.player;
  if (!(n > 0)) return;                  // xem chú thích ở hurtActor
  // hurtActor da chan, nhung hurtPlayer con duoc goi THANG o nhieu cho (bom, nga,
  // Ke Huc), nen la chan phai dung o ca hai cua chu khong chi mot.
  if ((p.invulnT || 0) > 0) return;
  if (p.hp >= p.hpMax) n = Math.min(n, Math.floor(p.hpMax * HIT_MAX_FRAC));
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
// Cua DUY NHAT cho sat thuong len quai, de he so "dang bi dong bang thi an them 50%"
// chi phai viet mot lan thay vi rai o ba cho roi quen mat mot cho.
function foeDamage(m, n){
  if (!m) return false;
  // Con ma guong khong co mau va khong giet duoc - duong dut no la dap vo guong.
  // Khong chan o day thi m.hp -= n bien hp thanh NaN, va NaN <= 0 la false nen no
  // thanh bat tu THAT SU, khong con dap vo guong cung khong xong.
  if (typeof m.hp !== 'number') return false;
  if (m.hp <= 0) return false;
  m.hp -= n * ((m.vulnT || 0) > 0 ? FREEZE_VULN_MUL : 1);
  return m.hp <= 0;
}
// MOT PHAT BAN PHAI CO CAM GIAC LA MOT PHAT BAN.
// ROOT-CAUSE cua "ban yeu + giay qua": hurtActor() - luc NGUOI CHOI an don - lam du ca nam
//   thu: rung man, khung hinh khung lai, mau bat vao tu dung phia, tieng danh, va thanh mau
//   giat. Con foeDamage() - luc QUAI an dan - chi lam dung mot thu: tru mot con so ma khong
//   ai nhin thay. Nen viec ban vao mot con quai khong khac gi go phim vao khoang khong: khong
//   co gi tren man hinh noi rang cu bam vua roi da an. Do khong phai loi cua con so sat thuong,
//   va tang sat thuong khong thoi cung khong chua duoc no.
// foeHit() la cua duy nhat cho MOT CU DANH TRUNG - khac foeDamage(), la cua cho sat thuong noi
// chung (ke ca sat thuong ri ra tung khung hinh cua ky nang, thu khong duoc phep nhay so).
function foeHit(m, n, ang, knock){
  if (!m || typeof m.hp !== 'number' || m.hp <= 0) return false;
  const chet = foeDamage(m, n);
  m.alert = 3;
  m.flash = 0.14;                                  // nhap trang mot nhip
  if (ang != null && knock){                       // va bat lui - dan phai co suc day
    m.kx = (m.kx || 0) + Math.cos(ang)*knock;
    m.ky = (m.ky || 0) + Math.sin(ang)*knock;
  }
  fxPop(m.x, m.y - 16, '-' + Math.round(n), chet ? '#ffd08a' : '#ffb0a0', chet ? 15 : 12);
  // Khung hinh khung lai mot nhip - dung cai lam cu danh "cham" vao duoc. Do bang REAL time
  // trong frame(), nen no khong bao gio dung han dong ho.
  FX.hitstop = Math.max(FX.hitstop, chet ? 0.10 : Math.min(0.07, 0.02 + n*0.0006));
  fxShake(chet ? 7 : 2 + Math.min(4, n*0.03));
  SFX.hit(n);
  return chet;
}

function killMonster(m){
  S.kills = (S.kills || 0) + 1;
  const i = S.monsters.indexOf(m);
  if (i >= 0) S.monsters.splice(i,1);
  if (m.type === 'bomber'){
    S.bombs.push({ x:m.x, y:m.y, t:0, fuse:0, r:TILE*3.2, done:false, owner:'foe' });
  }
  // Bom con chết TRONG LÚC ngòi đang cháy vẫn nổ, chỉ yếu hơn — nên vụt nó ra xa rồi hạ là một
  // nước đi khác hẳn với hạ tại chỗ. Chết trước khi kịp châm ngòi thì không nổ gì cả.
  // Ngòi 0,22s cho quả bị kích dây chuyền: nổ ngay trong cùng khung hình thì cả đàn bốn con ra
  // một tiếng một quầng, mắt không đọc được đó là bốn quả.
  if (m.type === 'banger' && m.fuse != null && m.fuse > 0){
    blowBanger(m, BANGER_EARLY, BANGER_CHAIN);
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
// ====================== DAP DEN PIN ======================
// Don danh tay khong duy nhat trong tro nay, va no co chu y la YEU: nguoi choi la
// tho khuan do, khong phai linh. Gia tri that cua no khong nam o sat thuong ma o cu
// HAT LUI - mot con quai bi day ra nua o la mot giay de chay, va mot giay do dang
// gia hon vai chuc mau.
// Voi xa hon tam voi 22px cua quai mot chut: dam truoc thi khong an don, nhung phai
// dam truoc that, khong loi dung duoc.
// Sat thuong bom len quai. Sat thuong len NGUOI CHOI (55) va len DO (420) giu
// nguyen: bom manh hon thi phan thuong lon hon, con cai gia phai tra van the -
// khong thi no thanh nut bam khong phai nghi.
const BOMB_FOE_DMG = 340;     // keo theo mau quai: mot qua van la mot qua
const MELEE_R      = 40;      // tam voi cua cu vung
const MELEE_HALF   = 1.05;    // nua goc quet, ~60 do moi ben
const MELEE_CD     = 1.10;    // giay giua hai cu vung
const MELEE_T      = 0.22;    // cu vung ve trong bao lau
const MELEE_KNOCK  = 320;     // hat lui - phan quan trong nhat cua don nay
const MELEE_NOISE  = 1.5;     // vung den pin la co tieng: khong danh len duoc
// DEN PIN LA THU YEU NHAT TRONG TAY BAN, va no phai duoc CAM THAY nhu vay.
// Chu du an: "nerf sat thuong danh bang den pin xuong + cham lai".
// Hai con so cung di xuong mot luc, va chung nhan nhau: 0,47 suc moi nhat va 1,1 giay moi
// nhat nghia la ~13 sat thuong mot giay, so voi ~49 cua ban dau va so voi 62 cua MOT phat
// sung luc. Cong voi mau quai vua gap doi: phang den pin de HAT LUI mot con dang ap mat thi
// duoc - va do van la phan quan trong nhat cua don nay, MELEE_KNOCK khong bi dong toi - con
// phang de HA mot con thi khong con la mot lua chon nua.
// Do dung la vai tro no nen co: no la cai den pin, khong phai vu khi.
const MELEE_STR    = 0.47;    // sat thuong = suc * he so. Suc 30 -> 14 sat thuong.
// Cham nhe vao can gat phai ma co quai trong tam nay thi TU QUAY sang no roi vung.
// Rong hon tam voi that, vi luc bi duoi thi ngon tay khong con thi gio ngam.
const MELEE_SNAP_R = 78;
const MELEE_GHOST_BLIND = 1.2;   // dam den pin vao mat con ma guong: no dung mot nhip
// Vung den pin TON THE LUC. 12 the luc moi nhat, chia cho 0,55 giay hoi chieu la
// ~22/giay - dung bang muc tieu hao cua chay nuoc rut. Con so do la co y: phang lien
// tay met dung bang chay lien tay, nen "danh hay chay" thanh mot lua chon that su
// chu khong phai "danh VA chay".
const MELEE_STAM      = 12;
// Het the luc thi KHONG cam danh, ma danh yeu di va lau tay hon. Cung mot luat voi
// chay nuoc rut ("het the luc thi thanh chay binh thuong"): chan hang mot nut giua
// luc con quai dang ap mat la cach chac chan nhat de bien mot co che thanh mot cai bay.
const MELEE_TIRED_DMG = 0.5;
const MELEE_TIRED_CD  = 1.7;

// Con quai dang nen quay sang nhat khi nguoi choi cham nhe can gat phai.
// Gan nhat truoc, nhung con dang lao vao minh duoc cong diem - no moi la con giet
// minh. Cung mot luat voi autoAimAngle(), vi cung mot cau hoi.
// Moi thu dang san nguoi choi, KE CA con ma guong. Bat cu vong lap nao hoi "co con
// nao gan day khong" ma chi duyet S.monsters deu bo sot no - va do dung la vi sao
// choi loa, dong bang, long sat truoc gio khong dung toi no mot lan nao.
function foesAll(){
  const mm = S.mirror && S.mirror.m;
  return mm ? S.monsters.concat([mm]) : S.monsters;
}
function meleeTarget(p){
  if (!p) return null;
  let best = null, bestScore = Infinity;
  for (const m of foesAll()){
    if ((m.hp != null && m.hp <= 0) || m.sleep > 0) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > MELEE_SNAP_R) continue;
    if (!losClear(p.x, p.y, m.x, m.y)) continue;
    const score = d * (m.state === 'chase' && m.alert > 0 ? 0.6 : 1);
    if (score < bestScore){ bestScore = score; best = m; }
  }
  return best;
}

// ang = null thi vung theo huong dang nhin.
function meleeSwing(p, ang){
  if (!p || p.down || S.dead || !S.running || S.shopMode) return false;
  if (p.riding) return false;                 // hai tay đang giữ ghi đông — xem chú thích ở useSlot()
  if ((p.swingCd || 0) > 0) return false;
  if ((p.stunT || 0) > 0) return false;
  if (ang != null) p.dir = ang;
  const duoi = (p.stam || 0) < MELEE_STAM;          // duoi tay: van danh, nhung yeu va cham
  p.stam = Math.max(0, (p.stam || 0) - MELEE_STAM);
  p.swingCd = MELEE_CD * (duoi ? MELEE_TIRED_CD : 1);
  p.swingT  = MELEE_T;
  p.swingDir = p.dir;
  if (duoi && S.time - (p.tiredMsgT || -9) > 5){
    p.tiredMsgT = S.time;
    toast('Đuối tay — đánh nhẹ và chậm hẳn. Đứng thở một nhịp đã.');
  }
  // Vung den pin thi den quet theo, nen tieng dong va anh sang deu bao vi tri minh.
  makeNoise(p.x, p.y, TILE * 4.5, MELEE_NOISE);
  const dmg = Math.max(3, Math.round((p.str || 30) * MELEE_STR * (duoi ? MELEE_TIRED_DMG : 1)));
  let trung = 0;
  for (const m of foesAll()){
    if (m.hp <= 0) continue;
    const dx = m.x - p.x, dy = m.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > MELEE_R + 9) continue;                                  // +9 la ban kinh than quai
    if (Math.abs(angDiff(Math.atan2(dy, dx), p.dir)) > MELEE_HALF) continue;
    if (!losClear(p.x, p.y, m.x, m.y)) continue;                    // khong dam xuyen tuong
    const a = Math.atan2(dy, dx);
    if (m.ghost){
      // Khong dam chet no duoc, nhung dam ca cai den pin vao mat thi no lui lai.
      // Do la dung mot luat voi MIRROR_TORCH_MUL: anh sang lam no cham lai.
      m.sleep = Math.max(m.sleep || 0, MELEE_GHOST_BLIND);
      moveEnt(m, Math.cos(a) * 16, Math.sin(a) * 16, 9);
    } else {
      // Loai nhe thi mot cu vut la bay di. Day la ca cach choi voi Bom con: day no ra xa roi
      // moi ha, de vu no roi vao cho trong chu khong roi vao chan minh.
      const nhe = (MONSTERS[m.type] && MONSTERS[m.type].knockMul) || 1;
      m.kx = (m.kx || 0) + Math.cos(a) * MELEE_KNOCK * nhe;
      m.ky = (m.ky || 0) + Math.sin(a) * MELEE_KNOCK * nhe;
      m.alert = Math.max(m.alert, 3);
      if (foeHit(m, dmg, a, 0)) killMonster(m);      // den pin da tu hat lui o dong tren
    }
    trung++;
  }
  // GUONG. Bom pha duoc guong tu dau, con den pin thi khong - ma guong lai la thu
  // DUY NHAT dut duoc con ma di theo minh. Nghia la gap guong ma trong tay khong co
  // bom hay sung thi khong con duong nao, va do la mot the co khong loi thoat chu
  // khong phai mot the kho. MIRROR_HP = 84, mot nhat 14, tuc la sau nhat mot tam.
  if (S.mirror){
    for (const pane of [S.mirror.a, S.mirror.b]){
      if (!pane || pane.hp <= 0) continue;
      const dx = pane.x - p.x, dy = pane.y - p.y;
      if (Math.hypot(dx, dy) > MELEE_R + MIRROR_R) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), p.dir)) > MELEE_HALF) continue;
      if (!losClear(p.x, p.y, pane.x, pane.y)) continue;
      damageMirror(pane.x, pane.y, dmg);
      SFX.crack();
      trung++;
      break;                                    // mot nhat vao mot tam, khong an ca hai
    }
  }

  // Cua ket trong tam vung thi an mot nhat. Khong can nham chinh xac: dung truoc cua
  // ma vung la trung, vi cai nguoi choi dang lam la "pha cai cua nay", khong phai
  // "ngam vao mot diem tren canh cua".
  const dr = nearestLockedDoor(p.x + Math.cos(p.dir)*DOOR_PRY_R*0.6,
                               p.y + Math.sin(p.dir)*DOOR_PRY_R*0.6, DOOR_PRY_R);
  if (dr){
    dr.pry = (dr.pry || 0) + 1;
    dr.warned = 3;
    if (dr.pry >= DOOR_PRY_HITS){
      breakDoor(dr, 'bash');
      toast('Bung được rồi.');
    } else {
      SFX.strain();
      const con = DOOR_PRY_HITS - Math.floor(dr.pry);
      toast('Phang cửa — còn khoảng ' + con + ' nhát nữa');
    }
    trung++;
  }
  if (trung){ SFX.hit(dmg); fxShake(3.5); }
  else SFX.thud();
  return true;
}

const FREEZE_SLOW_MUL = 0.35;   // Dong Bang: quai le chan con hon mot phan ba
const FREEZE_VULN_MUL = 1.5;    // ...va an them 50% sat thuong khi dang dong cung
const HASTE_MUL       = 1.3;    // Gong: +30% toc do nhu mo ta ky nang hua
// ---------------------------------------------------------------------------- súng
// Nòng ngắn: tầm ngắn là do ĐẠN CHẾT SỚM chứ không phải một con số tầm bắn riêng — mỗi viên
// vẫn là một viên đạn thật bay trong nhà, nên nó vẫn bị tường chặn, vẫn vỡ gương, vẫn trúng
// con đứng sau con thứ nhất nếu nón toé tới đó.
const SHOTGUN_PELLETS = 7;
const SHOTGUN_SPREAD  = 0.30;      // rad, nửa góc nón
const SHOTGUN_DMG     = 36;        // mỗi viên; trúng cả bảy là 252 — sát mặt là hạ gọn hầu hết
const SHOTGUN_SPEED   = 760;
const SHOTGUN_LIFE    = 0.22;      // giây -> tầm với khoảng 5,5 ô
const SHOTGUN_KNOCK   = 210;       // đẩy CHÍNH NGƯỜI BẮN lùi lại
const SHOTGUN_RECOIL  = 0.85;      // giây chân chậm sau phát bắn
const SHOTGUN_CD      = 0.95;

// Laser: giữ càng lâu càng mạnh, và cái giá của một phát đầy là đứng chôn chân gần một giây.
const LASER_FULL      = 1.10;      // giây để sạc đầy
const LASER_DMG_MIN   = 48;
const LASER_DMG_MAX   = 215;      // sạc đầy: một tia hạ gọn Kẻ bám / Kẻ húc, và xuyên qua cả hàng
const LASER_RANGE     = TILE * 14;
const LASER_RECOIL_MIN= 0.25;
const LASER_RECOIL_MAX= 0.90;
const LASER_CD        = 0.70;
const LASER_HIT_R     = 15;        // bán kính tia tính trúng
const LASER_STEP      = 6;         // bước dò dọc tia

// Chân chậm sau khi bắn. Tách hẳn khỏi p.slowT (thứ do quái gây ra) để hai nguyên nhân khác
// nhau không phải chia nhau một con số — và để cái vòng đỏ trên HUD nói đúng một chuyện.
const RECOIL_SLOW_MUL = 0.45;

const AUTO_AIM_RANGE = TILE * 11;      // xa hơn thế thì đạn cũng chưa chắc tới
// Mỗi khẩu ngắm một kiểu, vì mỗi khẩu bay một kiểu.
//   speed  — để TÍNH ĐÓN ĐẦU. Bắn vào chỗ con quái ĐANG ĐỨNG là bắn vào chỗ nó vừa rời khỏi.
//   range  — quá tầm thì đừng nhận, thà để người chơi tự quyết.
//   pierce — tia xuyên thì mục tiêu tốt nhất là mục tiêu XẾP ĐƯỢC NHIỀU CON NHẤT thành một hàng.
const AIM_PROFILE = {
  gun:     { speed: 620, range: AUTO_AIM_RANGE,     pierce: false, needLos: true  },
  tranq:   { speed: 520, range: AUTO_AIM_RANGE,     pierce: false, needLos: true  },
  shotgun: { speed: SHOTGUN_SPEED, range: TILE*5.5, pierce: false, needLos: true  },
  laser:   { speed: 0,   range: LASER_RANGE,        pierce: true,  needLos: true  },
  bomb:    { speed: 300, range: AUTO_AIM_RANGE,     pierce: false, needLos: false }
};
// Cửa sổ HÚT của trợ ngắm khi người chơi ĐANG KÉO CẦN. Hẹp có chủ ý: rộng quá thì kéo đi đâu
// cũng bị bẻ về một chỗ, và mất hẳn cảm giác đang cầm súng. Đây đúng là cách các game bắn di
// động làm — một lực hút nhẹ quanh mục tiêu, không phải một cú bẻ thẳng vào giữa người nó.
const AIM_ASSIST_ARC = 0.24;      // rad, khoảng 14 độ

// ĐÓN ĐẦU: giải chỗ gặp nhau giữa viên đạn và con quái đang chạy.
// Phương trình bậc hai |P + V*t| = speed*t. Không có nghiệm dương thì bắn thẳng vào nó.
function leadPoint(p, m, speed){
  if (!speed) return { x: m.x, y: m.y };                 // tia laser tới nơi tức thì
  const px = m.x - p.x, py = m.y - p.y;
  const vx = m.vx || 0, vy = m.vy || 0;
  const a = vx*vx + vy*vy - speed*speed;
  const b = 2*(px*vx + py*vy);
  const c = px*px + py*py;
  let t;
  if (Math.abs(a) < 1e-4){ t = Math.abs(b) < 1e-6 ? 0 : -c/b; }
  else {
    const disc = b*b - 4*a*c;
    if (disc < 0) return { x: m.x, y: m.y };
    const r = Math.sqrt(disc);
    const t1 = (-b - r)/(2*a), t2 = (-b + r)/(2*a);
    t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
    if (!isFinite(t)) return { x: m.x, y: m.y };
  }
  t = clamp(t, 0, 1.2);
  return { x: m.x + vx*t, y: m.y + vy*t };
}

// Bao nhiêu con nằm trên đúng một đường thẳng theo hướng này. Chỉ tia xuyên mới cần hỏi.
function pierceCount(p, ang){
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let n = 0;
  for (const m of S.monsters){
    if (m.hp <= 0) continue;
    const rx = m.x - p.x, ry = m.y - p.y;
    const t = rx*dx + ry*dy;
    if (t < 0 || t > LASER_RANGE) continue;
    if (Math.hypot(rx - dx*t, ry - dy*t) < LASER_HIT_R) n++;
  }
  return n;
}

// Danh sách mục tiêu ĐÁNG BẮN, kèm góc đã đón đầu. Dùng chung cho cả ngắm tự động lẫn trợ ngắm,
// nên hai thứ đó không bao giờ bất đồng về việc con nào là mục tiêu.
function aimTargets(p, kind){
  const prof = AIM_PROFILE[kind];
  if (!prof || !p) return [];
  const out = [];
  for (const m of S.monsters){
    if (m.hp <= 0 || m.sleep > 0) continue;             // đang ngủ thì để dành đạn
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > prof.range) continue;
    const lp = leadPoint(p, m, prof.speed);
    // Hỏi tầm nhìn TỚI CHỖ SẼ GẶP, không phải tới chỗ nó đang đứng: đón đầu vào sau một bức
    // tường thì viên đạn cắm vào tường, và người chơi mất một viên vì được "trợ giúp".
    const blocked = !losClear(p.x, p.y, lp.x, lp.y);
    if (blocked && prof.needLos) continue;
    out.push({ m: m, d: d, ang: Math.atan2(lp.y - p.y, lp.x - p.x),
               chasing: m.state === 'chase' && m.alert > 0, blocked: blocked });
  }
  return out;
}

function autoAimAngle(p, kind, fallback){
  const list = aimTargets(p, kind);
  if (!list.length) return fallback;
  const prof = AIM_PROFILE[kind];
  let best = null, bestScore = Infinity;
  for (const t of list){
    // Ba thứ quyết định, theo đúng thứ tự quan trọng:
    //   1. LỆCH BAO NHIÊU SO VỚI HƯỚNG BẠN ĐANG NHÌN. Đây là phần mới, và là phần sửa đúng cái
    //      cảm giác "ngắm tự động bắn lung tung": bản cũ chỉ xét khoảng cách, nên một con đứng
    //      SAU LƯNG mà gần hơn thì cú bấm quay ngoắt người bạn lại và bắn ra sau.
    //   2. Gần hay xa.
    //   3. Nó có đang lao vào mình không — con đó mới là con giết mình.
    const lech = Math.abs(angDiff(t.ang, fallback));
    let score = t.d * (1 + lech * 0.55) * (t.chasing ? 0.62 : 1) * (t.blocked ? 1.7 : 1);
    // Tia xuyên: xếp được ba con thành một hàng là phát bắn đáng giá nhất trên màn hình.
    if (prof.pierce){ const n = pierceCount(p, t.ang); if (n > 1) score /= (1 + (n-1)*0.7); }
    if (score < bestScore){ bestScore = score; best = t; }
  }
  return best ? best.ang : fallback;
}

// TRỢ NGẮM khi người chơi TỰ KÉO. Không bẻ hướng của người chơi — chỉ hút nhẹ vào mục tiêu gần
// nhất trong một cửa sổ hẹp, và chỉ khi người chơi đã kéo về gần đúng phía nó.
// WHY nó tồn tại: trên điện thoại, một cần ngắm dài 60px phải phủ 360 độ, nên một pixel lệch ở
// ngón cái là vài độ lệch ở nòng súng — ở khoảng cách tám ô thì vài độ là trượt hẳn. Người chơi
// làm đúng mà vẫn trượt là lỗi của cái cần, không phải lỗi của họ.
// Góc mà một phát bắn NGAY BÂY GIỜ sẽ đi, và con nào sẽ ăn nó.
// Vẽ và bắn phải hỏi CÙNG MỘT hàm này — một cái vòng khoá mục tiêu chỉ vào con A trong khi
// viên đạn bay về con B thì tệ hơn hẳn là không có vòng nào.
function aimNow(p, kind, far, rawAng){
  const ang = far ? aimAssist(p, kind, rawAng) : autoAimAngle(p, kind, p.dir);
  let target = null, best = 0.28;
  for (const t of aimTargets(p, kind)){
    const lech = Math.abs(angDiff(t.ang, ang));
    if (lech < best){ best = lech; target = t.m; }
  }
  return { ang: ang, target: target };
}

function aimAssist(p, kind, raw){
  const list = aimTargets(p, kind);
  let best = null, bestLech = AIM_ASSIST_ARC;
  for (const t of list){
    if (t.blocked) continue;
    const lech = Math.abs(angDiff(t.ang, raw));
    if (lech < bestLech){ bestLech = lech; best = t; }
  }
  return best ? best.ang : raw;
}

// Giật: đẩy thân người bắn lùi lại và làm chân chậm một nhịp. Dùng CHUNG một hàm cho mọi
// khẩu, vì "bắn xong thì chậm" phải là một luật của cả nhà chứ không phải một mẹo của từng khẩu.
function applyRecoil(p, ang, knock, slowSec){
  if (knock){ p.kx = (p.kx || 0) - Math.cos(ang)*knock; p.ky = (p.ky || 0) - Math.sin(ang)*knock; }
  p.recoilT = Math.max(p.recoilT || 0, slowSec);
}

// Nòng ngắn: bảy viên thật, toé trong một nón, mỗi viên sống rất ngắn. Không có "tầm bắn" nào
// được viết ra cả — tầm là hệ quả của việc đạn chết sớm, nên nó vẫn bị tường chặn và vẫn vỡ gương.
function fireShotgun(p, ang){
  for (let k = 0; k < SHOTGUN_PELLETS; k++){
    // Toé đều quanh trục chứ không ngẫu nhiên hoàn toàn: một nón ngẫu nhiên hay để lọt lỗ thủng
    // ngay giữa, và một khẩu hoa cải bắn trượt con quái đứng SÁT MẶT là một khẩu súng dối trá.
    const t = SHOTGUN_PELLETS === 1 ? 0 : (k/(SHOTGUN_PELLETS-1))*2 - 1;
    const a = ang + t*SHOTGUN_SPREAD + (Math.random()-0.5)*SHOTGUN_SPREAD*0.35;
    const sp = SHOTGUN_SPEED * (0.88 + Math.random()*0.24);
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
                     life: SHOTGUN_LIFE * (0.85 + Math.random()*0.3), kind:'shot', dmg: SHOTGUN_DMG });
  }
  applyRecoil(p, ang, SHOTGUN_KNOCK, SHOTGUN_RECOIL);
  fxShake(9);
  SFX.crack();
}

// Laser: một tia tức thời, XUYÊN qua mọi con trên đường, dừng ở bức tường đầu tiên. Sạc quyết
// định sát thương và cũng quyết định luôn cái giá phải trả sau đó.
function fireLaser(p, ang, charge){
  const k = clamp((charge || 0) / LASER_FULL, 0, 1);
  const dmg = mix(LASER_DMG_MIN, LASER_DMG_MAX, k);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let ex = p.x, ey = p.y;
  const trung = [];
  for (let d = LASER_STEP; d <= LASER_RANGE; d += LASER_STEP){
    const x = p.x + dx*d, y = p.y + dy*d;
    if (solidAt((x/TILE)|0, (y/TILE)|0) || doorHits(x, y, 2)) break;
    ex = x; ey = y;
    damageMirror(x, y, 30);                       // kính trên đường đi thì vỡ, y như đạn
    for (const m of S.monsters){
      if (m.hp <= 0 || trung.indexOf(m) >= 0) continue;
      if (Math.hypot(m.x - x, m.y - y) < LASER_HIT_R) trung.push(m);
    }
  }
  for (const m of trung){
    foeHit(m, dmg, ang, 60);
    if (m.hp <= 0) killMonster(m);
  }
  S.beams.push({ x0:p.x, y0:p.y, x1:ex, y1:ey, t:0, life:0.20, k:k });
  // Sạc đầy thì đứng chôn chân gần một giây. Đây là toàn bộ cái giá của một phát 95 sát thương
  // xuyên hết cả hàng — không có nó thì giữ nút một giây là câu trả lời cho mọi tình huống.
  applyRecoil(p, ang, 40 + 90*k, mix(LASER_RECOIL_MIN, LASER_RECOIL_MAX, k));
  fxShake(4 + 8*k);
  SFX.crack();
  return { dmg: dmg, hit: trung.length, charge: k };
}

function useSlot(p, i, aimed){
  const it = p.inv[i];
  if (!it || it.uses <= 0 || p.cooldown > 0 || S.dead || p.down) return false;
  // "cannot wield items while driving" — luật của bản gốc, và là toàn bộ cái giá của việc đi xe.
  // Ngồi lên xe là đổi khả năng chống trả lấy tốc độ; không có dòng này thì chiếc xe chỉ toàn ưu điểm.
  if (p.riding){ toast('Đang lái thì không dùng đồ được — xuống xe đã, hoặc húc thẳng vào nó'); return false; }
  const def = GEAR_BY_KEY[it.kind];
  if (def && def.passive) return false;          // the tracker works by being equipped
  const ang = aimed !== undefined ? aimed : p.dir;
  if (it.kind === 'gun'){
    // 62 chu khong phai 25. Mot khau sung phai la mot CAU TRA LOI, khong phai mot thu de
    // banh nhe vao con quai roi van phai chay. Ke di tuan: hai phat. Ke bam: ba phat.
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*620, vy:Math.sin(ang)*620, life:0.9, kind:'gun', dmg:62 });
    applyRecoil(p, ang, 55, 0.22);
    it.uses--; p.cooldown = 0.45;
  } else if (it.kind === 'shotgun'){
    fireShotgun(p, ang);
    it.uses--; p.cooldown = SHOTGUN_CD;
  } else if (it.kind === 'laser'){
    // chargeUsed == null nghia la mot loi goi tu code (bot, bo test) chu khong phai mot ngon
    // tay dang giu — coi nhu sac day, vi khong co ai de ma hoi da giu bao lau.
    S.lastLaser = fireLaser(p, ang, p.chargeUsed != null ? p.chargeUsed : LASER_FULL);
    S.lastLaser.at = S.time;
    it.uses--; p.cooldown = LASER_CD;
  } else if (it.kind === 'tranq'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520, life:1.0, kind:'tranq' });
    applyRecoil(p, ang, 30, 0.18);
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
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*620, vy:Math.sin(ang)*620, life:0.9, kind:'gun', dmg:62 });
    p.cooldown = 0.45;
  } else if (def.key === 'tranq'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*520, vy:Math.sin(ang)*520, life:1.0, kind:'tranq' });
    p.cooldown = 0.6;
  } else if (def.key === 'shotgun'){
    // Bắn thử PHẢI giật thật. Cái giật mới là thứ quyết định có nên mua khẩu này hay không, và
    // một bản demo giấu đi phần khó chịu là một bản demo nói dối.
    fireShotgun(p, ang);
    p.cooldown = SHOTGUN_CD;
  } else if (def.key === 'laser'){
    fireLaser(p, ang, LASER_FULL);        // ở trạm thì cho bắn thử một phát đầy, để thấy tia dài tới đâu
    p.cooldown = LASER_CD;
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
  // Tia laser chỉ là một vệt sáng đang tàn — sát thương đã tính xong ngay lúc bắn.
  if (S.beams) for (let i=S.beams.length-1;i>=0;i--){
    const bm = S.beams[i];
    bm.t += dt;
    if (bm.t >= bm.life) S.beams.splice(i,1);
  }
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
          foeHit(m, b.dmg || 62, Math.atan2(b.vy, b.vx), b.kind === 'shot' ? 90 : 150);
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
      const pow = b.pow || 1;          // Bom con bị giết giữa chừng nổ yếu hơn ngòi cháy hết
      for (const m of S.monsters.slice()){
        const d = Math.hypot(m.x-b.x, m.y-b.y);
        // 90 -> 165: mot qua lu dan gia 7.000 ma khong giet duoc mot con Ke nghe
        // (75 mau) dung ngay tam bom thi khong ai mua lan thu hai. Gio no giet gon
        // moi thu dung gan tam, va tha dan o ria.
        if (d < b.r){
          const a = Math.atan2(m.y - b.y, m.x - b.x);
          if (foeHit(m, BOMB_FOE_DMG * pow * (1 - d/b.r), a, 260*pow)) killMonster(m);
        }
      }
      if (S.mirror){
        for (const pane of [S.mirror.a, S.mirror.b]){
          const dm = Math.hypot(pane.x-b.x, pane.y-b.y);
          if (dm < b.r){ damageMirror(pane.x, pane.y, BOMB_FOE_DMG * pow * (1 - dm/b.r)); break; }
        }
      }
      // A blast that can throw a monster across a room takes a jammed door off its hinges too.
      breakDoorsNear(b.x, b.y, b.r);
      // the funniest and most expensive source of damage in the source game: your own bomb
      for (const l of S.loot){
        if (l.gone) continue;
        const d = Math.hypot(l.x-b.x, l.y-b.y);
        if (d < b.r) damageLoot(l, 420 * pow * (1 - d/b.r));
      }
      const dp = Math.hypot(S.player.x-b.x, S.player.y-b.y);
      if (dp < b.r) hurtPlayer(Math.round(55 * pow * (1 - dp/b.r)), 'bomb', b.x, b.y);
      // Một vụ nổ phải NHÌN THẤY được là một vụ nổ. Trước đây nó là đúng một hình tròn phẳng nở
      // ra rồi mờ đi, không sáng lên căn phòng, không để lại gì. Nay thêm một quầng sáng thật vào
      // danh sách đèn — nổ trong phòng tối mà không thấy phòng thì mất luôn phần tin tức đắt nhất
      // của vụ nổ: bạn vừa được nhìn một lượt cái phòng đang ở.
      S.lightZones.push({ x:b.x, y:b.y, r:b.r*2.1, t:0.55 });
      fxShake(9*pow + 3); fxFlash(0.35*pow + 0.12, '255,190,120');
    }
    if (b.t > b.fuse + 0.6) S.bombs.splice(i,1);
  }
}

// ============================================================ extraction
function stepExtraction(dt){
  const pad = S.pads[S.padIndex];
  if (!pad || pad.done) return;
  recomputePad(pad);
  // Ai được đạp: người chơi. Người chơi đang nằm thì một đồng đội còn đứng làm thay — cùng luật
  // với việc ai được đứng chờ xe tải, và cùng lý do: gục đúng lúc chỉ tiêu vừa đủ không được là
  // một ván không có lối ra.
  const du = pad.value >= pad.quota;
  const p = S.player;
  const tren = (a) => a && !a.down && pad.btn &&
                      Math.hypot(a.x-pad.btn.x, a.y-pad.btn.y) < pad.btn.r + 9;
  const dap = du && (p && !p.down ? tren(p) : (S.mates||[]).some(tren));
  pad.dap = !!dap;
  if (dap){
    pad.countdown = (pad.countdown || 0) + dt;
    S.countdownActive = true;
    S.countdownMax = EXTRACT_HOLD; S.countdownLabel = 'GIAO HÀNG';
    S.countdown = Math.max(0, EXTRACT_HOLD - pad.countdown);
    // One beat per whole second, rising in pitch. A countdown you can hear is a countdown you can
    // stand away from and still trust, which is the point of standing away from it.
    const whole = Math.ceil(S.countdown);
    if (whole !== FX.lastTick){
      FX.lastTick = whole; FX.tickPulse = 1;
      if (whole > 0) SFX.tick(EXTRACT_HOLD - whole);
    }
    if (pad.countdown >= EXTRACT_HOLD) completePad(pad);
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
  if (HOOKS.onPayout) HOOKS.onPayout(taken, S.padIndex >= S.pads.length - 1);
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
    startEscape();                        // và từ đây căn nhà không còn để bạn đi bộ về
  } else {
    S.padIndex++;
    S.pads[S.padIndex].active = true;
    toast('Bệ tiếp theo đã mở');
  }
}

// ============================================================ nhà tiễn khách
// Bản gốc R.E.P.O. không để bạn đi bộ về sau lần rút hàng CUỐI. Đúng một giây sau khi bệ cuối
// chốt, đồng hồ hồi sinh của quái tụt xuống 1 giây; xe tải rú bốn lần trong mười giây đầu; sau
// đó cứ vài giây căn nhà lại chỉ điểm một chỗ ngẫu nhiên trong phòng người chơi, ban đầu 3 giây
// một lần rồi giãn dần +2 mỗi lần tới trần 30; và đèn trong nhà tắt hết. Quái KHÔNG được biết
// tuốt — chúng vẫn dò tìm như thường, chỉ là liên tục bị chỉ về phía bạn.
//
// Vì sao chép cái này chứ không chỉ tăng số quái: cả bốn thứ trên đều nói MỘT câu — "đường về
// mới là màn chơi". Bản này trước đó làm ngược hẳn: queueRespawn bỏ chạy khi S.levelDone và
// stepRespawns xoá sạch hàng đợi, nên chốt xong bệ cuối là căn nhà YÊN HƠN lúc đang làm. Cái
// khoảnh khắc đáng sợ nhất của ca trực đang là cái khoảnh khắc rảnh nhất.
//
// Chỗ duy nhất chệch khỏi bản gốc: bên đó nhà đã đầy quái sẵn nên chỉ cần hồi sinh nhanh là đủ
// đông; ở đây một căn nhà chỉ có ba con, nên phải GỌI THÊM một đợt, nếu không "ồ ạt" chỉ là
// ba con cũ đi nhanh hơn.
const ESC_DELAY    = 1.0;          // giây sau khi bệ cuối chốt thì nhà mới trở mặt
const ESC_RESPAWN  = 1.0;          // hồi sinh tụt từ 45s xuống 1s
const ESC_HORN_N   = 4;            // xe tải rú mấy lần
const ESC_HORN_T   = 10;           // trong bao nhiêu giây
const ESC_HORN_R   = 30 * TILE;    // tiếng rú nghe xa cỡ nào
const ESC_PING_0   = 3;            // lần chỉ điểm đầu, cách nhau mấy giây
const ESC_PING_UP  = 2;            // mỗi lần giãn thêm
const ESC_PING_MAX = 30;           // trần
const ESC_PING_R   = 15 * TILE;    // tiếng chỉ điểm lan xa cỡ nào
const ESC_PING_NEAR= 6 * TILE;     // chỉ điểm rơi trong bán kính này quanh người còn đứng
const ESC_HORN_ALERT = 3;          // to bằng một cú vụt trúng mặt
const ESC_PING_ALERT = 2.2;        // bằng tiếng bệ rút hàng: một tiếng động thật, không phải bị nhìn thấy
const ESC_DARK     = 0.16;         // trí nhớ căn nhà mờ còn bao nhiêu (đèn nhà tắt)
const ESC_DARK_T   = 2.2;          // tắt trong mấy giây
const ESC_WAVE_T   = 7;            // đợt gọi thêm rải ra trong mấy giây

// Đợt gọi thêm tính bằng THÂN, không bằng đàn. Đếm theo đàn thì ba đàn Bom con ra mười hai
// cái thân còn ba con Kẻ húc ra ba — cùng một con số, hai căn nhà khác hẳn nhau, và ở bản đông
// hơn thì cửa ra biến mất chứ không còn là cửa ra. Đường về phải khó, không phải phải kín.
const ESC_WAVE_MIN = 3, ESC_WAVE_MAX = 9;
const ESC_PACK_MIN = 5;     // đợt nhỏ hơn thế này thì không kèm đàn: mất cả đàn là mất cả chốt
function escWaveBodies(){ return clamp(2 + S.level, ESC_WAVE_MIN, ESC_WAVE_MAX); }

// Loài nào được gọi. Ưu tiên chính bộ quái của căn nhà này — nhà đang có gì thì gọi thêm cái đó,
// đường về không phải chỗ giới thiệu một con bạn chưa từng gặp. Nhà không có thân nào (ải 1–2
// vốn chỉ có tượng và gương) thì rơi về hai loài đi đàn.
function escKinds(){
  const co = bodyKinds(S.roster).slice();
  if (!co.length) co.push.apply(co, PACK_KINDS);
  // Nhà TOÀN loài đi đàn thì phải mượn thêm một con đi lẻ, và ải 1–2 đúng là như vậy: cả nhà
  // chỉ có một đàn Bom con hoặc Gnome. Đo được ở ải 1 seed 101: sau 11 giây còn 0 con — cả đợt
  // là một dây pháo, đồng đội đi tới châm nổ hết một lượt và đường về sạch trơn, tức là pha
  // chạy tự dọn chính nó. Một con đi lẻ sống sót qua dây chuyền là thứ giữ cho lối ra vẫn có
  // người canh sau khi khói tan.
  if (co.every(k => MONSTERS[k].pack)){
    const pool = LEVEL_MONSTERS[clamp(S.level-1, 0, LEVEL_MONSTERS.length-1)];
    co.push(pool[(Math.random()*pool.length)|0]);
  }
  return co;
}

// Chỗ đứng cho đợt gọi thêm. KHÔNG dùng respawnSpot() được: luật của nó là "cách xe tải ít
// nhất 12 ô", đúng cái luật cần thiết lúc giữa ca (quái không được đẻ ra ngay cạnh chỗ bạn
// đang chất hàng) và đúng cái luật phá hỏng pha này — cả đợt sinh ở rìa bản đồ rồi lững thững
// đi về, tới nơi thì bạn đã lên xe. Đo được: sinh bằng respawnSpot, sau 12 giây vẫn còn 33 ô
// cách xe. "Ồ ạt ra cản" thì phải ra ở CHỖ CẢN.
//
// Nên ở đây đảo ngược: đứng thành vành 6–15 ô quanh xe tải — giữa bạn và lối ra. Hai luật giữ
// nguyên vì chúng nói về sự công bằng chứ không về độ khó: không bao giờ trong tầm mắt, và
// không bao giờ sát người còn sống.
const ESC_SPOT_LO = 6 * TILE, ESC_SPOT_HI = 15 * TILE, ESC_SPOT_CLEAR = 7 * TILE;
function escSpot(){
  for (let thu = 0; thu < 400; thu++){
    const a = Math.random()*Math.PI*2, r = mix(ESC_SPOT_LO, ESC_SPOT_HI, Math.random());
    const x = S.car.x + Math.cos(a)*r, y = S.car.y + Math.sin(a)*r;
    const gx = (x/TILE)|0, gy = (y/TILE)|0;
    if (gx < 1 || gy < 1 || gx >= MW-1 || gy >= MH-1) continue;
    if (S.grid[gy*MW+gx] !== FLOOR) continue;
    if (hitsSolid(x, y, 11)) continue;
    if (crewAlive().some(c => Math.hypot(x-c.x, y-c.y) < ESC_SPOT_CLEAR)) continue;
    if (inSight(x, y)) continue;
    return { x, y };
  }
  return respawnSpot();          // vành quanh xe kín hết thì thà ở xa còn hơn không có ai
}

function startEscape(){
  if (S.esc || S.noFoes) return;
  S.esc = { t: 0, horns: 0, ping: ESC_PING_0, gap: ESC_PING_0, dark: 0 };
  // Đợt gọi thêm dựng từ loài ĐI LẺ trước, đàn chỉ được kèm MỘT và chỉ khi đợt đã đủ to.
  //
  // Lý do đo được, không phải lý do thẩm mỹ: một chốt chặn toàn Bom con tự xoá chính nó. Ải 1
  // seed 101, cả nhà chỉ có một đàn Bom con nên đợt gọi thêm cũng toàn Bom con — ai tới trước
  // cũng châm nổ hết một lượt, và sau 11 giây căn nhà còn 0 con, tức là chốt bệ cuối xong thì
  // đường về SẠCH HƠN lúc chưa có pha chạy. Ngân sách ải 1 chỉ có 3 thân mà một đàn đã 4, nên
  // hễ để đàn bốc trước là nó ăn hết ngân sách và con đi lẻ không bao giờ tới lượt.
  const ks  = escKinds();
  const xao = (a) => { for (let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const le  = xao(ks.filter(k => !MONSTERS[k].pack));
  const dan = xao(ks.filter(k =>  MONSTERS[k].pack));
  const ngan = escWaveBodies();
  const dat = [];
  let than = 0;
  for (let i = 0; than < ngan && le.length; i++){ dat.push(le[i % le.length]); than++; }
  // Một đàn là gia vị, không phải bữa chính — và chỉ khi mất cả đàn vẫn còn người canh cửa.
  if (dan.length && ngan >= ESC_PACK_MIN) dat.push(dan[0]);
  if (!dat.length) dat.push(ks[0]);

  // Rải ra trong ESC_WAVE_T giây chứ không ập vào cùng một khung: cả đợt hiện ra một lúc thì
  // hoặc bạn thấy đủ để vòng tránh hết, hoặc không thấy gì cả. Nhỏ giọt là thứ bắt phải quyết
  // định lại liên tục trên đường về.
  dat.forEach((k, i) => S.respawns.push({
    type: k, t: ESC_DELAY + (i + 0.4) * (ESC_WAVE_T / dat.length), wave: true }));
}

function stepEscape(dt){
  const e = S.esc;
  if (!e || S.dead || S.shopMode) return;
  e.t += dt;
  e.dark = Math.min(1, e.dark + dt / ESC_DARK_T);
  if (e.t < ESC_DELAY) return;

  // Bốn tiếng rú của xe tải. Nó gọi mọi thứ về phía LỐI RA chứ không về phía bạn — đó mới là
  // cái làm đường về thành đường về: chỗ duy nhất bạn phải tới cũng là chỗ đông nhất.
  if (e.horns < ESC_HORN_N){
    const moc = ESC_DELAY + e.horns * (ESC_HORN_T / ESC_HORN_N);
    // Chỉ hỏi "đã tới mốc chưa". KHÔNG hỏi thêm "và khung trước chưa tới" — mốc tự tiến lên
    // sau mỗi tiếng còi nên không thể rú hai lần cho cùng một mốc, còn cái điều kiện thứ hai
    // thì HỤT hẳn một tiếng khi máy khựng: nó tương đương `e.t < moc + 2dt`, và một khung dài
    // nhảy qua ngưỡng đó là mốc kẹt lại vĩnh viễn. Đo được: 2/3 lần chạy bộ kiểm ra 3/4 tiếng.
    if (e.t >= moc){
      e.horns++;
      // Sức 3 chứ không phải 1: m.alert tụt 1 mỗi giây, nên sức 1 là đúng MỘT giây đuổi
      // rồi con quái quay về vòng canh xe — tiếng còi to nhất game mà chỉ bằng một bước chân.
      // 3 là mức của cú vụt trúng mặt (dòng 'm.alert = Math.max(m.alert, 3)' lúc đánh thường).
      makeNoise(S.car.x, S.car.y, ESC_HORN_R, ESC_HORN_ALERT);
      SFX.thud(); fxShake(3.2);
      if (e.horns === 1) toast('Xe tải rú còi. Nhà biết bạn sắp đi.');
    }
    return;
  }

  // Rồi tới lượt căn nhà chỉ điểm. KHÔNG phải toạ độ chính xác của bạn: một chỗ ngẫu nhiên
  // trong tầm ESC_PING_NEAR quanh người còn đứng, nên quái vẫn phải tự dò nốt đoạn cuối.
  e.ping -= dt;
  if (e.ping > 0) return;
  e.gap  = Math.min(ESC_PING_MAX, e.gap + ESC_PING_UP);
  e.ping = e.gap;
  const song = crewAlive();
  if (!song.length) return;
  const a = song[(Math.random()*song.length)|0];
  const goc = Math.random()*Math.PI*2, r = Math.random()*ESC_PING_NEAR;
  makeNoise(a.x + Math.cos(goc)*r, a.y + Math.sin(goc)*r, ESC_PING_R, ESC_PING_ALERT);
  SFX.thud();
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
  // Bản Biệt Đội tự lo phần trượt chỉ tiêu — y như onCrewWiped. Không có móc này thì
  // nút "Làm lại từ màn 1" bên dưới gọi startLevel(), mà HOOKS.levelIndex() lại ép về
  // ĐÚNG TẦNG VỪA TRƯỢT: thua không mất gì, cày lại được vô hạn ngay tại chỗ.
  if (HOOKS.onShiftLost && HOOKS.onShiftLost() === true) return;
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
  // So cong CA CA VAN (khong phai tung tang): lop ngoai can no de tinh thuong va
  // dem nhiem vu. Dat o day chu khong o buildLevel vi buildLevel chay moi tang.
  S.kills = 0; S.revives = 0;
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
  // Bản Biệt Đội có map HỮU HẠN: hết tầng cuối là phá đảo chứ không đẻ tầng tiếp.
  // Móc này trả true thì nó tự lo phần sau, bộ máy không mở trạm dịch vụ nữa.
  if (HOOKS.onLevelClear && HOOKS.onLevelClear() === true) return;
  // Doors, then the van pulls out, then the station — the shift ends on screen rather than in a
  // scene change. startShop is what actually builds the next place; this only delays it.
  startCut('depart', '', '', () => startShop());
}
let buildFails = 0;
function startLevel(seed){
  S.shopMode = false;
  // Bản Biệt Đội có 9 map, mỗi map vài tầng — nó tự quy đổi (map, tầng) ra một con
  // số độ khó rồi ép vào đây, để đường cong khó/chỉ tiêu/quái vẫn là đường cong của
  // repo2d chứ không phải một đường cong thứ hai viết lại.
  if (HOOKS.levelIndex) S.level = HOOKS.levelIndex();
  // MỞ ĐƯỜNG RA TRƯỚC, DỰNG THẾ GIỚI SAU — cùng một luật với toggleStash().
  // ROOT-CAUSE: thứ tự cũ là buildLevel() rồi mới hideVeil(). buildLevel() ném lỗi thì
  //   tấm màn phủ ĐANG HIỆN không bao giờ được gỡ, mà nút trên nó vừa gọi đúng cái hàm
  //   vừa ném lỗi — nên mỗi lần bấm là một lần ném lại. Người chơi thấy: bảng hiện ra,
  //   nút có hiệu ứng bấm, và không có gì xảy ra. Đó là cái bẫy tự khoá kinh điển.
  hideVeil();
  cancelGestures();
  S.stashOpen = false;
  try {
    buildLevel(seed === undefined ? (Math.random()*999999)|0 : seed);
  } catch (e){
    console.error('Dựng màn không được:', e);
    S.running = false; S.dead = false;
    if (++buildFails <= 3){ toast('Màn này dựng lỗi — thử hạt giống khác.'); startLevel(); return; }
    buildFails = 0;
    if (HOOKS.onEngineError && HOOKS.onEngineError(e) === true) return;
    showVeil('Không dựng được màn',
      'Bộ máy vấp lỗi khi dựng màn này: ' + ((e && e.message) || 'không rõ') + '.',
      'Thử lại', () => { resetRun(); startLevel(); });
    return;
  }
  buildFails = 0;
  S.running = true; S.dead = false;
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
  S.loot = []; S.monsters = []; S.pads = []; S.bullets = []; S.bombs = []; S.corpses = []; S.beams = []; S.casts = [];
  S.bikes = [];
  S.padIndex = 0; S.countdown = 0; S.countdownActive = false;
  S.levelDone = false; S.dead = false; S.shiftLost = false; S.hurtLog = [];
  S.esc = null;      // trạm dịch vụ không phải chỗ bị đuổi; và nếu quên thì đèn vẫn tắt ở đây
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
  hideVeil();                     // mở đường ra trước, dựng sau — xem chú thích ở startLevel()
  cancelGestures();
  S.stashOpen = false;
  try { buildShop(); }
  catch (e){
    console.error('Dựng trạm dịch vụ không được:', e);
    toast('Trạm dịch vụ lỗi — đi thẳng sang màn sau.');
    S.shopMode = false; S.level++; startLevel();
  }
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
  } else if (S.countdownActive && !S.board){ S.countdownActive = false; S.countdown = 0; FX.lastTick = -1; }

  // The truck is the exit, but the player is standing next to it when the room opens, so it only
  // becomes an exit once they have walked away from it once — and then only if they stand in it.
  // Trạm là chỗ duy nhất trong game người chơi ĐI TỚI xe tải vì việc khác: cái tủ đồ nằm ở đó.
  // Cũ thì quay lại mở tủ là bị chở đi luôn, giữa lúc còn tiền chưa tiêu.
  const d = Math.hypot(p.x-S.car.x, p.y-S.car.y);
  if (!S.shopCanLeave && d > TILE*4.5) S.shopCanLeave = true;
  // Đang trả tiền thì lượt trả tiền giữ đồng hồ; một lúc chỉ một cái đếm ngược.
  if (!S.pay.active && holdAtTruck(dt, S.shopCanLeave && inTruck(p), 'RỜI TRẠM')) leaveShop();
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
// HUỶ một cảnh cắt mà KHÔNG chạy callback của nó. Khác hẳn skipCut(): skipCut nghĩa là
// "cho tôi xem nhanh phần sau", còn cái này nghĩa là "phần sau không còn ý nghĩa nữa".
// ROOT-CAUSE của bug "bỏ ca giữa cảnh xe chạy rồi mà bộ máy vẫn chạy sau lưng menu":
//   stepCut() chạy trên đồng hồ THẬT, ngoài cổng `S.running && !S.dead` của frame(). Ván
//   kết thúc mà cảnh cắt vẫn còn treo thì 2 giây sau cái `then` của nó gọi startShop()
//   hoặc startLevel(), và hai hàm đó bật lại S.running = true — một ca trực sống chạy sau
//   lưng màn chọn map, quái đi lại, đồng hồ chạy, ví và tủ đồ bị ghi đè.
//   Đo thật: về sảnh rồi mà running=true, shopMode=true, S.time 0 -> 1,55 và vẫn tăng.
function cancelCut(){ const had = !!S.cut; S.cut = null; return had; }
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
// Guong KHONG duoc keo theo mau quai. No la loi thoat duy nhat khoi con ma khi trong tay
// khong co gi, nen so nhat can de dap vo phai giu nguyen dung tam voi cai den pin vua bi nerf.
// 84 / 14 = 6 nhat den pin, hoac 2 vien sung luc. Den pin cang yeu thi con so nay cang phai
// di xuong theo, neu khong thi nguoi khong co sung se khong bao gio dut duoc con ma - ma dap
// vo guong la loi thoat DUY NHAT khoi no.
const MIRROR_HP         = 84;         // per mirror — hai vien sung luc, hoac sau nhat den pin
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

// Cái gì mọc ra thì mọc quanh MỘT NGƯỜI BẤT KỲ TRONG TỔ, không phải lúc nào cũng quanh
// người chơi. Ca trực này là của bốn người; để mọi thứ đáng sợ chỉ mọc quanh đúng một người
// là biến ba người kia thành đồ trang trí — và biến trò chơi thành một trò đoán được: người
// chơi biết chắc mọi thứ sẽ xuất hiện trong tầm mắt của chính mình.
// Chọn trong số những người CÒN ĐỨNG: một cái gương mọc cạnh cái xác nằm dưới đất thì không
// ai nhìn thấy nó cả.
function spawnAnchor(){
  const song = (typeof crewAlive === 'function' ? crewAlive() : []).filter(a => a && !a.down);
  if (!song.length) return S.player;
  return song[(Math.random()*song.length)|0];
}

function spawnMirrors(){
  const p = spawnAnchor();
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
  // RƠI NGAY CHỖ TẤM VỪA VỠ. Trước bản này nó rơi ở chỗ CON MA (mr.m) — mà con ma đang đi
  // lại trong nhà, nên người chơi đập vỡ tấm gương trước mặt rồi cúi xuống nhặt thì chẳng có
  // gì cả, còn món đồ thì nằm ở một phòng khác cạnh con ma. Phần thưởng phải rơi ở chỗ người
  // chơi vừa làm ra nó; không thì nó không đọc như một phần thưởng.
  const at = which || mr.m || mr.a;
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
  toast(bag ? 'Gương vỡ — nó tan theo, để lại một món ' + bag.size + ' ngay dưới chân bạn.'
            : 'Gương vỡ — nó tan theo, nhưng nhà này hết đồ rơi rồi.');
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
    // ghost:true - no KHONG co mau va khong giet duoc, do la ban chat cua no: muon
    // dut duoc thi phai dap VO CAI GUONG. Nhung no VAN LA MOT CON QUAI: choi loa,
    // dong bang, hay dam den pin vao mat deu phai an, va truoc day khong an cai nao
    // vi no khong nam trong S.monsters nen moi vong lap ky nang deu di qua no.
    // type de bang MIRROR_KIND cho cac cho hoi "con nay la con gi".
    mr.m = { x: mr.a.x, y: mr.a.y, dir: Math.atan2(p.y-mr.a.y, p.x-mr.a.x),
             reveal: 0, lit: false, path: null, pi: 0, pathT: 0, born: 0, spotT: SPOT_FX_T,
             ghost: true, type: MIRROR_KIND, sleep: 0, slowT: 0, deafT: 0, vulnT: 0,
             alert: 3, state: 'chase', kx: 0, ky: 0 };
    fxShake(4); FX.spotT = 1; SFX.sting();
    return;
  }

  const m = mr.m;
  m.born += dt;
  m.spotT = Math.max(0, (m.spotT || 0) - dt);
  m.slowT = Math.max(0, (m.slowT || 0) - dt);
  m.deafT = Math.max(0, (m.deafT || 0) - dt);
  m.vulnT = Math.max(0, (m.vulnT || 0) - dt);
  m.lit = litByTorch(m.x, m.y);
  // Bi choi mat: dung im, va KHONG tom duoc ai. Kiem tra truoc ca phan tinh duong di,
  // vi "dung im" ma van bam duoc vao nguoi dang chay ngang qua thi khong phai dung im.
  if (m.sleep > 0){
    m.sleep -= dt;
    m.reveal = clamp(m.reveal + (Math.hypot(p.x-m.x, p.y-m.y) < REVEAL_R &&
                                 losClear(p.x, p.y, m.x, m.y) ? dt/REVEAL_FADE : -dt/REVEAL_FADE), 0, 1);
    return;
  }
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
  const spd = MIRROR_SPEED * falloff * (m.lit ? MIRROR_TORCH_MUL : 1)
            * ((m.slowT || 0) > 0 ? FREEZE_SLOW_MUL : 1);

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
  if ((m.sleep || 0) > 0){
    // Bi choi mat: hai vet gach thay cho hai con mat, cung ky hieu quai thuong dung.
    c.strokeStyle = 'rgba(223,240,255,0.9)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-4.6,-9.8); c.lineTo(-1.2,-9.8);
                   c.moveTo(1.2,-9.8);  c.lineTo(4.6,-9.8); c.stroke();
  } else {
  c.fillStyle = '#dff0ff';
  c.fillRect(-4.4, -11.4, 3.2, 3.2); c.fillRect(1.4, -11.4, 3.2, 3.2);
  }
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
    riding: null, pushing: false,        // đồng đội cũng lái xe và đẩy xe được như người chơi

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
// ---------------------------------------------------------------------------
// ĐIỂM CẮM CHO LỚP META BÊN NGOÀI
// Bộ máy này chạy cho HAI game: "Ca Trực Đêm" (repo2d, tự nó) và "Ca Trực Đêm:
// Biệt Đội" (repo-squad, đắp thêm kỹ năng + tổ năm người + gacha lên trên).
// WHY một bộ máy chứ không phải hai: bản Biệt Đội trước đây có sim riêng viết lại
//   từ đầu, và nó thiếu đèn pin hình nón, xe đẩy, trạm dịch vụ, tủ đồ, đồ dùng,
//   bắn thử — mỗi luật sửa ở một bên là một luật không ai tin được nữa. Chú thích
//   trong data/games.js đã nói đúng điều đó về bản Unity; nó đúng cho cả bản này.
// Mọi móc để null thì repo2d chạy y như trước khi có khối này.
const HOOKS = {
  mateCount: null,      // số bot đi theo. null = MATE_COUNT mặc định
  mateInfo: null,       // (i) -> { name, col, hp, str, speed } cho từng bot
  playerInfo: null,     // ()  -> { hp, str, speed } cho xác người chơi cầm
  onLevelClear: null,   // ()  -> true nếu lớp ngoài tự lo phần sau (chặn vào trạm)
  onPayout: null,       // (soTien, laBeCuoi) -> void, mỗi lần giao xong một bệ
  levelIndex: null,     // ()  -> số, ép độ khó của tầng sắp dựng (map hữu hạn tự tính)
  onCrewWiped: null,    // ()  -> true nếu lớp ngoài tự lo phần thua (cả tổ gục)
  onShiftLost: null,    // ()  -> true nếu lớp ngoài tự lo phần trượt chỉ tiêu
  onEngineError: null,  // (e) -> true nếu lớp ngoài tự lo khi bộ máy vấp lỗi
  menuMode: null,       // ()  -> true khi đang ở menu ngoài ca: khoá bàn phím của bộ máy
  onTick: null,         // (dt) -> hiệu ứng kéo dài của lớp ngoài, chạy cuối mỗi bước
  skill: null           // { label(), ready(), cool(), use() } — nút kỹ năng trong HUD
};
// Nhận cả số lẫn HÀM: bản Biệt Đội có tổ đổi theo từng ván (quay được thêm xác thì
// tổ dài ra), nên một con số đặt cứng lúc nạp trang là sai ngay từ ván thứ hai.
function hookMateCount(){
  const v = typeof HOOKS.mateCount === 'function' ? HOOKS.mateCount() : HOOKS.mateCount;
  return v == null ? MATE_COUNT : Math.max(0, v | 0);
}

function crew(){ return S.player ? [S.player].concat(S.mates || []) : (S.mates || []); }
function crewAlive(){ return crew().filter(a => a && !a.down); }
function isDown(a){ return !a || !!a.down; }

function spawnCrew(){
  S.mates = [];
  if (!S.crewOn) return;
  const p = S.player;
  for (let i = 0; i < hookMateCount(); i++){
    let x = p.x, y = p.y;
    for (let k = 0; k < 60; k++){
      const a = Math.random()*Math.PI*2, r = mix(TILE*1.6, TILE*4, Math.random());
      const nx = p.x + Math.cos(a)*r, ny = p.y + Math.sin(a)*r;
      if (hitsSolid(nx, ny, 9)) continue;
      x = nx; y = ny; break;
    }
    // Lớp meta quyết định bot này là XÁC NÀO. Nó trả về rỗng nghĩa là ô đó TRỐNG —
    // không đẻ ra một cái bóng vô danh đứng thế chỗ.
    // ROOT-CAUSE: bản đầu vẫn push mate rồi mới hỏi info, nên một tài khoản mới chỉ
    //   có đúng một xác vẫn thấy bốn con "Tổ 2..5" đi theo trong ca.
    const info = HOOKS.mateInfo ? HOOKS.mateInfo(i) : null;
    if (HOOKS.mateInfo && !info) continue;
    const m = makeMate(i, x, y);
    if (info){
      if (info.name)  m.name = info.name;
      if (info.col)   m.col = info.col;
      if (info.charId) m.charId = info.charId;
      if (info.hp)    { m.hpMax = info.hp; m.hp = info.hp; }
      if (info.str)   m.str = info.str;
      if (info.speed) m.speed = info.speed;
    }
    S.mates.push(m);
  }
}

// ---------------------------------------------------------------- damage, death, heads
// One damage path for everyone. hurtPlayer stays as the player's door into it because a dozen
// call sites and every test already know that name.
// Một cú đánh KHÔNG LẤY GÌ thì không phải một cú đánh, và không được để lại dấu vết nào.
//
// Bom con khai `dmg: 0` nhưng vẫn chạy nhánh đánh, nên hurtPlayer(0) chạy đủ năm thứ: hất người
// chơi văng ra, rung màn, khựng khung hình, loè vệt máu đỏ và kêu tiếng ăn đòn. Máu không tụt một
// điểm nào mà trên màn hình thì đó LÀ ăn đòn — chính là "đụng vào là gây sát thương" trong báo cáo.
// `noMelee` đã chặn ở gốc rồi; dòng này là cái chốt thứ hai, cho mọi nguồn sát thương 0 về sau.
function hurtActor(a, n, src, fromX, fromY){
  if (!a || a.down) return;
  if (!(n > 0)) return;
  if ((a.invulnT || 0) > 0) return;      // "khong the chet" cua Thien Than / Buoc Hut
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

// Go cai dau cua mot nguoi ra khoi the gioi, du no dang nam dau: tren san, trong tay
// dong doi, tren xe day, hay dang dung tren be. reviveFromPad da lam viec nay cho
// duong ve chinh thuc; moi duong do day khac (Keo Ve, Thien Than) cung phai lam.
function clearHeadOf(a){
  const who = (a === S.player) ? -1 : a.id;
  for (const l of S.loot){
    if (!l.isHead || l.gone || l.who !== who) continue;
    l.gone = true;
    for (const b of crew()) if (b && b.held === l) b.held = null;
    if (l.inCart && S.cart){ const i = S.cart.items.indexOf(l); if (i >= 0) S.cart.items.splice(i,1); }
    // ...và cái thùng sau xe máy, thứ bản cũ bỏ sót: `inCart` dùng chung cho cả hai chỗ chứa nên
    // chỉ dòng trên là chỉ dọn được một nửa, cái đầu đứng dậy rồi vẫn nằm trong b.items cho tới khi
    // stepBikes tình cờ lọc nó ra ở khung sau.
    if (l.inBike){ const i = l.inBike.items.indexOf(l); if (i >= 0) l.inBike.items.splice(i,1); l.inBike = null; }
    if (l.onPad){ const P = l.onPad; const i = P.placed.indexOf(l); if (i >= 0) P.placed.splice(i,1);
                  l.onPad = null; recomputePad(P); }
    l.inCart = false;
  }
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
  // Ban Biet Doi tu lo phan thua: ra khoi ca, ve menu, tinh cong. Tra true thi bo may
  // khong dung bang "Lam lai tu man 1" nua.
  // ROOT-CAUSE: khong co moc nay thi nut do chay resetRun() roi startLevel(), ma
  //   startLevel() lai bi HOOKS.levelIndex() ep ve DUNG TANG VUA CHET - thua khong
  //   mat gi, cay lai duoc vo han ngay tai cho.
  if (HOOKS.onCrewWiped && HOOKS.onCrewWiped() === true){ S.dead = true; S.running = false; return; }
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
    S.revives = (S.revives || 0) + 1;
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
// Bao xa thì mới đáng leo lên xe. Dưới ngưỡng này, thời gian trèo lên trèo xuống ăn hết chỗ
// nhanh hơn — và một con bot cứ lên xuống xe liên tục thì nhìn còn ngu hơn là không biết lái.
const MATE_BIKE_FAR   = 7.5*TILE;   // đích xa hơn thế thì mới đi tìm xe
const MATE_BIKE_REACH = 3.5*TILE;   // và chỉ leo lên chiếc đang trong tầm này
const MATE_BIKE_OFF   = 2.4*TILE;   // tới gần đích thì xuống, vì lái thì không cầm được đồ
const MATE_BIKE_KEEP  = 0.45;       // dưới ngần này xăng thì đồng đội không đụng vào nữa
const MATE_LOOT_R_BIKE = 15*TILE;   // có xe thì bán kính làm việc rộng hẳn ra
const MATE_BIKE_SIT   = 3.0;        // ngồi không trên xe quá ngần này giây thì xuống

// Chiếc xe rảnh gần nhất mà đồng đội được phép đụng vào. Hai luật nhường đường, và cả hai đều
// đứng về phía người chơi: chừa lại đáy bình, và không cướp chiếc tôi đang đứng sát hơn nó.
function mateFreeBike(a){
  // Chiếc nó ĐANG NGỒI vẫn tính là chiếc dùng được. Thiếu dòng này thì ngay khi leo lên xe,
  // bán kính làm việc tụt về 6,5 ô, cái món ở xa mà nó vừa nổ máy để đi lấy rơi ra ngoài tầm
  // nhìn, và nó phóng xe đi lang thang — đúng cái việc mà chiếc xe đáng lẽ phải chấm dứt.
  if (a.riding && a.riding.fuel > 0) return a.riding;
  const toi = S.player;
  let best = null, bd = MATE_BIKE_REACH;
  for (const b of (S.bikes || [])){
    if (b.rider || b.downed > 0) continue;
    if (b.fuel < b.fuelMax*MATE_BIKE_KEEP) continue;
    const d = Math.hypot(b.x-a.x, b.y-a.y);
    // Bị đồng đội cướp xe ngay trước mũi là kiểu bực mình mà không có cách nào chữa trong lúc chơi.
    if (toi && !toi.down && Math.hypot(b.x-toi.x, b.y-toi.y) < d) continue;
    if (d < bd){ bd = d; best = b; }
  }
  return best;
}

// TAM KHOA (chu du an, 2026-08-29: "dang hoi roi"). Bot khong dung xe day va xe may nua —
// nguoi choi van dung binh thuong. Bat lai bang cach doi hai bien nay ve true.
const MATE_USE_CART = false;
const MATE_USE_BIKE = false;

// Đồng đội leo lên chiếc xe rảnh gần nhất, nếu quãng đường sắp đi đủ dài để bõ công.
function mateTryBike(a, tx, ty){
  if (!MATE_USE_BIKE) return false;
  if (a.riding || a.held || a.pushing || a.down) return false;
  if (Math.hypot(tx-a.x, ty-a.y) < MATE_BIKE_FAR) return false;
  const best = mateFreeBike(a);
  if (!best || !mountBike(a, best)) return false;
  a.path = null;                    // đường vừa tìm là đường đi bộ, đi xe thì tìm lại
  return true;
}

// Xuống xe khi đã tới nơi. Thiếu dòng này thì con bot tới đúng chỗ món đồ mà không nhặt được
// (đang lái thì hai tay bận), rồi đứng vòng quanh nó cho hết ca.
function mateOffBike(a, tx, ty){
  if (!a.riding) return;
  if (tx == null || Math.hypot(tx-a.x, ty-a.y) < MATE_BIKE_OFF){ dismountBike(a); a.path = null; }
}

function mateWalk(a, dt, spd){
  if (!a.path) return false;
  while (a.pi < a.path.length && Math.hypot(a.path[a.pi].x-a.x, a.path[a.pi].y-a.y) < 12) a.pi++;
  if (a.pi >= a.path.length){ a.path = null; return false; }
  const wp = a.path[a.pi];
  const dx = wp.x-a.x, dy = wp.y-a.y, d = Math.hypot(dx,dy) || 1;
  a.dir = Math.atan2(dy, dx);
  const before = { x:a.x, y:a.y };
  // Ngồi trên xe thì chiếc xe quyết định tốc độ, và nó ăn xăng y như của người chơi. Bot lái
  // ĐƠN GIẢN một cách có chủ ý: bám đúng đường vừa tìm, không đón đầu, không tự bẻ lái. Chúng
  // là ba con bot ngu ngu — một con bot lái giỏi hơn người chơi là một con bot cướp ván.
  if (a.riding){
    const bk = a.riding;
    if (bk.fuel <= 0){ dismountBike(a); }
    else {
      bk.dir = a.dir;
      bk.spd = Math.min(bikeDef(bk).speed, bk.spd + BIKE_ACCEL*0.7*dt);
      bk.fuel = Math.max(0, bk.fuel - (BIKE_FUEL_RUN*0.7 + BIKE_FUEL_IDLE)*dt);
      spd = bk.spd;
      a.bikeIdle = 0;                    // đang chạy thì không phải là ngồi không
    }
  }
  const muon = spd*dt;
  const chan = moveEnt(a, dx/d*muon, dy/d*muon, 8);
  if (a.riding){
    const bk = a.riding;
    bk.x = a.x; bk.y = a.y;
    a.noise = 2.2;                       // tiếng máy: cả nhà biết tổ này đang ở đâu
    // Cùng một luật với người chơi: lướt dọc tường không phải là đâm. Xem chú thích dài ở
    // rideBike(). Ở đây nó còn tệ hơn một bậc — đồng đội bám theo một con đường đã dò sẵn,
    // mà đường đó ôm sát mép tường ở mọi khúc cua, nên cứ đọc cờ `blocked` là con bot ngồi
    // trên xe bò 6 px/giây suốt ba mươi giây rồi mới bỏ cuộc.
    const dam = chan && Math.hypot(a.x-before.x, a.y-before.y) < muon*0.45;
    if (dam && bk.spd > BIKE_CRASH_SPD){ bikeCrash(a, bk); a.path = null; return true; }
    if (dam) bk.spd *= 0.3;
    bikeRam(a, bk);
  }
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
    if (a.down){
      // Gục thì buông hết. Không có hai dòng này thì cái xe đẩy khoá cứng vào một cái xác, và
      // chiếc xe máy thì biến mất cùng người ngồi trên nó.
      if (a.riding) dismountBike(a);
      if (a.pushing) releaseCart(a);
      a.noise = 0; a.bubble = ''; continue;
    }
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
      // Chạy trốn mà vẫn ngồi trên xe thì chiếc xe phải đi theo. Thiếu ba dòng này, người thì
      // chạy còn chiếc xe đứng lại giữa phòng — mà nó vẫn ghi là "có người ngồi", nên không ai
      // dùng được nó nữa cho tới hết tầng.
      const treXe = !!a.riding;
      const sp = (treXe ? Math.max(a.riding.spd, bikeDef(a.riding).speed*0.6) : mateSpeed(a)) * 1.15;
      moveEnt(a, Math.cos(a.fleeA)*sp*dt, Math.sin(a.fleeA)*sp*dt, 8);
      if (treXe){
        const bk = a.riding;
        bk.x = a.x; bk.y = a.y; bk.dir = a.dir;
        bk.spd = sp;
        bk.fuel = Math.max(0, bk.fuel - (BIKE_FUEL_RUN*0.7 + BIKE_FUEL_IDLE)*dt);
        if (bk.fuel <= 0) dismountBike(a);
        else a.bikeIdle = 0;
      }
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
    // Nhưng ngồi không trên xe thì có hạn. Xuống ngay sau mỗi nhịp ngẩn ra thì nó lên xuống xe
    // suốt ngày, nhìn còn ngu hơn là không biết lái; để nó ngồi mãi thì chiếc xe bị một con bot
    // giữ làm của riêng đến hết tầng. Ba giây là đủ dài để một nhịp ngẩn ra không tính, và đủ
    // ngắn để người chơi không phải đi tìm ai đang ngồi trên xe của mình.
    if (a.riding){
      a.bikeIdle = (a.bikeIdle || 0) + dt;
      if (a.bikeIdle > MATE_BIKE_SIT) dismountBike(a);
    }
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
      mateOffBike(a, h.x, h.y);
      if (!a.riding) mateTryBike(a, h.x, h.y);
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
      mateOffBike(a, pad.x, pad.y);
      if (!a.path && !matePath(a, pad.x, pad.y)){ a.job = 'idle'; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    // ---- CHẤT LÊN XE ĐẨY. Ôm một món đi bộ nửa căn nhà là đúng cái việc mà chiếc xe đẩy sinh
    // ra để khỏi phải làm — vậy mà trước bản này ba đồng đội đi ngang qua nó suốt cả ca.
    if (a.job === 'cart' && S.cart){
      const cart = S.cart;
      if (!a.held || !cartFits(cart, a.held)){ a.job = 'idle'; a.path = null; continue; }
      if (Math.hypot(cart.x-a.x, cart.y-a.y) < cart.r + MATE_GRAB_R){
        mateToCart(a, cart);
        a.job = 'idle'; a.path = null; a.target = null;
        continue;
      }
      // Không dò được đường tới xe thì mang thẳng ra bệ. Trả về 'idle' là để một đồng đội
      // đứng ôm món đồ giữa phòng cho hết ca — nó vẫn đang cầm, nên mọi nhịp nghĩ sau đó lại
      // chọn đúng cái việc vừa hỏng, và nó không bao giờ tự thoát ra.
      if (!a.path && !matePath(a, cart.x, cart.y)){ a.job = 'deliver'; a.path = null; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    // ---- ĐẨY XE LÊN BỆ. Chất đầy mà không ai đẩy thì chiếc xe chỉ là một cái hố chứa đồ.
    if (a.job === 'push' && S.cart && pad && !pad.done){
      const cart = S.cart;
      if (!a.pushing){
        if (cart.held || !cart.items.length){ a.job = 'idle'; a.path = null; continue; }
        if (Math.hypot(cart.x-a.x, cart.y-a.y) < cart.r + grabRange(a)){
          if (!grabCart(a)){ a.job = 'idle'; a.path = null; continue; }
          a.path = null;
        } else {
          if (!a.path && !matePath(a, cart.x, cart.y)){ a.job = 'idle'; continue; }
          mateWalk(a, dt, spd);
          continue;
        }
      }
      if (Math.hypot(pad.x-a.x, pad.y-a.y) < TILE*1.8){
        releaseCart(a);                     // releaseCart() tự dỡ cả xe lên bệ
        a.job = 'idle'; a.path = null;
        a.idleT = mix(MATE_BREATHER[0], MATE_BREATHER[1], Math.random());
        continue;
      }
      if (!a.path && !matePath(a, pad.x, pad.y)){ releaseCart(a); a.job = 'idle'; continue; }
      mateWalk(a, dt, spd*0.85);            // đẩy xe thì chậm hơn một nhịp
      continue;
    }
    if (a.job === 'loot' && a.target){
      const l = a.target;
      if (l.gone || l.held || l.inCart || l.onPad){ a.target = null; a.job = 'idle'; continue; }
      if (Math.hypot(l.x-a.x, l.y-a.y) < MATE_GRAB_R){
        if (!a.held) mateTake(a, l);
        a.target = null; a.path = null; a.job = 'idle';
        // Quyết định chỗ mang tới NGAY lúc cầm lên. Đợi tới nhịp nghĩ sau (1,2–3s, mà gần một
        // nửa số nhịp là đứng ngẩn ra) thì nó đã lững thững đi khỏi cái xe đẩy đứng cạnh, và
        // lúc đó bệ mới là chỗ gần hơn — nên nó không bao giờ dùng xe dù xe ngay bên cạnh.
        if (a.held) mateChooseJob(a);
        continue;
      }
      mateOffBike(a, l.x, l.y);
      if (!a.riding) mateTryBike(a, l.x, l.y);
      if (!a.path && !matePath(a, l.x, l.y)){ a.target = null; a.job = 'idle'; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'roam' && a.roamTo){
      if (Math.hypot(a.roamTo.x-a.x, a.roamTo.y-a.y) < TILE*1.2){
        mateOffBike(a, null);
        a.job = 'idle'; a.roamTo = null; a.path = null; continue;
      }
      mateOffBike(a, a.roamTo.x, a.roamTo.y);
      if (!a.riding) mateTryBike(a, a.roamTo.x, a.roamTo.y);
      if (!a.path && !matePath(a, a.roamTo.x, a.roamTo.y)){ a.job = 'idle'; a.roamTo = null; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    if (a.job === 'truck'){
      if (Math.hypot(a.x-S.car.x, a.y-S.car.y) < TILE*2.2){ mateOffBike(a, null); a.noise = 0; continue; }
      if (!a.riding) mateTryBike(a, S.car.x, S.car.y);
      if (!a.path && !matePath(a, S.car.x, S.car.y)) { a.noise = 0; continue; }
      mateWalk(a, dt, spd);
      continue;
    }
    // ---- 5. nothing to do: hang around the player, badly
    // Không có việc thì tắt máy xuống xe. Ngồi im trên xe vẫn đốt xăng, và cái bình xăng đó
    // đến tầng sau mới đầy lại — để một con bot nổ máy đứng chờ là ăn cắp của người chơi.
    if (a.riding){
      a.bikeIdle = (a.bikeIdle || 0) + dt;
      if (a.bikeIdle > MATE_BIKE_SIT) dismountBike(a);
    }
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

  // Đang cầm càng xe thì việc đã chọn xong rồi. Không có nhánh này thì cứ mỗi lần nghĩ lại nó
  // lại thấy "xe đang có người đẩy" (chính nó) và bỏ việc đẩy để đi làm việc khác — mà tay thì
  // vẫn còn cầm càng, nên cái xe bị lôi lang thang khắp nhà và không bao giờ tới bệ.
  if (a.pushing){
    if (!MATE_USE_CART || !pad || pad.done || !S.cart || !S.cart.items.length) releaseCart(a);
    else { a.job = 'push'; a.target = null; return; }
  }

  if (a.held){
    // Xe đẩy GẦN HƠN cái bệ thì chất lên xe — đó là toàn bộ lý do chiếc xe tồn tại. Không phải
    // lúc nào cũng đúng: món quá đắt phải ôm tay, xe đầy thì thôi, nên hỏi lại cartFits().
    const cart = S.cart;
    if (MATE_USE_CART && cart && !cart.held && !a.held.isHead && cartFits(cart, a.held) && pad && !pad.done &&
        Math.hypot(cart.x-a.x, cart.y-a.y) < Math.hypot(pad.x-a.x, pad.y-a.y)*0.8){
      if (a.job !== 'cart'){ a.job = 'cart'; a.path = null; }
      a.target = null; return;
    }
    a.job = 'deliver'; a.path = null; a.target = null; return;
  }

  // Tay không, xe đã chất kha khá, bệ đang mở: đẩy nó lên bệ. Một người thôi — ba đứa cùng
  // xúm vào một cái càng xe thì hai đứa chỉ đứng nhìn.
  if (MATE_USE_CART && S.cart && !S.cart.held && S.cart.items.length >= 3 && pad && !pad.done &&
      !S.mates.some(o => o !== a && !o.down && o.job === 'push')){
    // Đừng xoá đường đi khi việc vẫn là việc cũ: cứ mỗi lần nghĩ lại mà xoá đường thì nó dò
    // đường lại từ đầu, và với MATE_DITHER thì nửa số lần đó là đứng ngẩn ra một nhịp.
    if (a.job !== 'push'){ a.job = 'push'; a.path = null; }
    a.target = null; return;
  }

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
  // Có xe trong tầm với thì bán kính làm việc rộng hẳn ra — và đó là TOÀN BỘ điểm của việc cho
  // đồng đội biết lái xe. Thiếu dòng này thì MATE_LOOT_R (6,5 ô) luôn nhỏ hơn ngưỡng đáng leo
  // lên xe (7,5 ô), nên không có món nào đủ xa để chúng nghĩ tới chiếc xe, và cả ca làm việc
  // ba đứa sẽ đi ngang qua hai chiếc xe mà không đụng tới.
  let best = null, bd = mateFreeBike(a) ? MATE_LOOT_R_BIKE : MATE_LOOT_R;
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
// Chất món đang ôm lên xe đẩy. mateDrop() là bản của cái bệ; đây là bản của chiếc xe — cùng
// một động tác, khác chỗ đặt, và cũng lặng lẽ y như vậy (một dòng toast mỗi món thì ba đồng
// đội sẽ lấp kín màn hình trong nửa phút).
function mateToCart(a, cart){
  const l = a.held;
  if (!l || !cart || !cartFits(cart, l)) return false;
  l.held = false; l.holder = null; l.vx = l.vy = 0;
  l.grace = S.time + 0.35;
  a.held = null;
  l.inCart = true; cart.items.push(l);
  return true;
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
      // Luật cũ giữ nguyên: chỉ đọc được nếu THẤY họ. Nhưng thấy rồi thì phải đọc được hẳn,
      // chứ không phải mờ đi vì một bức tường tình cờ nằm sau chữ.
      if (inSight(a.x, a.y)){
        const fade = Math.min(1, a.bubbleT/0.6);
        wText(a.bubble, a.x, a.y - 18, `rgba(226,232,236,${fade})`, 11, `rgba(18,20,24,${0.72*fade})`);
      }
    }
    c.save(); c.translate(a.x, a.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0, 8, 9, 4, 0, 0, Math.PI*2); c.fill();
    const skin = window.REPO_SKIN && REPO_SKIN.crew(c, a, false);
    // Đèn của đồng đội, cùng luật với đèn người chơi: chạy quanh theo hướng, không xoay.
    const mLamp = window.REPO_SKIN && REPO_SKIN.lamp &&
      REPO_SKIN.lamp(c, Math.cos(a.dir) * 9, Math.sin(a.dir) * 9 - 2, 13, S.time + a.id);
    c.rotate(a.dir);
    if (!skin){
      c.fillStyle = a.hurt > 0 ? '#c86a60' : a.col.body;
      c.beginPath(); c.arc(0, 0, 6.4, 0, Math.PI*2); c.fill();
      c.strokeStyle = a.col.rim; c.lineWidth = 1.2; c.stroke();
    }
    if (!mLamp){ c.fillStyle = a.col.torch; c.fillRect(5.5, -1.4, 4.5, 2.8); }
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
    // Cùng luật với người chơi: viền bó sát, xanh lạnh để phân biệt với màu máu của mình.
    c.save(); c.translate(a.x, a.y);
    const veDuoc = window.REPO_SKIN && REPO_SKIN.halo &&
                   REPO_SKIN.halo(c, a, false, 'rgb(150,200,235)', 0.62);
    c.restore();
    if (!veDuoc) glowRing(c, a.x, a.y, 13, [150,200,235], 0.28, 1.6);
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
    // O MENU thi ban phim cua bo may phai cam. Ban Biet Doi dung ngoai ca voi menu
    // phu len tren; khong chan thi bam `r` o man chon map la dung luon mot can nha
    // roi cho no chay sau lung nguoi choi.
    if (HOOKS.menuMode && HOOKS.menuMode()) return;
    const k = e.key.toLowerCase();
    if (['w','a','s','d','e','f','q','r','1','2','3','shift','tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    // Escape là lối thoát mà mọi người chơi đều thử trước tiên. Nó phải luôn đóng được
    // bảng đang mở, kể cả khi bảng đó tự dựng lỗi.
    if (k === 'escape'){ if (S.stashOpen) closeStash(); return; }
    if (skipCut()) return;
    if (k === 'r'){ resetRun(); startLevel(); return; }
    if (k === 'tab'){ S.bigMap = !S.bigMap; return; }
    if (k === 'e'){ pickUp(S.player); return; }
    if (k === 'f'){ toggleStash(); return; }
    if (k === ' '){ toggleSprint(); return; }
    if (k === 'q'){ const t = meleeTarget(S.player);
                    meleeSwing(S.player, t ? Math.atan2(t.y - S.player.y, t.x - S.player.x) : null);
                    return; }
    if (k === '1' || k === '2' || k === '3'){
      const i = +k - 1, p = S.player;
      const it = p && p.inv[i], def = it && GEAR_BY_KEY[it.kind];
      // Khẩu sạc thì GIỮ phím là sạc, NHẢ phím là bắn — đối xứng với cách ngón tay làm trên
      // điện thoại. Phím giữ thì trình duyệt bắn keydown liên tục, nên phải chốt lần đầu.
      if (def && def.charge){
        if (p.chargeSlot !== i){ p.chargeSlot = i; p.chargeT = 0; }
        keys.add(k);
        return;
      }
      useSlot(p, i);
      return;
    }
    keys.add(k);
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    // Nhả phím số của một khẩu đang sạc = bắn. Máy ngắm hộ, vì bàn phím không có cần kéo.
    if (k === '1' || k === '2' || k === '3'){
      const i = +k - 1, p = S.player;
      if (p && p.chargeSlot === i){
        const it = p.inv[i];
        p.chargeUsed = p.chargeT;
        useSlot(p, i, autoAimAngle(p, it && it.kind, p.dir));
        p.chargeUsed = null;
        p.chargeSlot = -1; p.chargeT = 0;
      }
    }
  });

  cv.addEventListener('pointerdown', e => {
    // Chỉ nút TRÁI của chuột mới là một cú bấm vào trò chơi. Chuột phải mở context menu và
    // chuột giữa vào chế độ cuộn tự động — cả hai đều NUỐT MẤT pointerup, mà pointerup là
    // chỗ duy nhất trong tệp này trả lại con trỏ. Một cú chuột phải là hỏng cả phiên.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Màn cảm ứng còn phát ra một bộ sự kiện chuột "tương thích" ~25ms sau mỗi cú chạm.
    // Chúng là bóng ma của cú chạm vừa rồi, không phải một cú bấm thứ hai.
    if (e.pointerType === 'mouse' && performance.now() - lastTouchAt < 900) return;
    SFX.wake();                       // browsers refuse to start audio outside a user gesture
    // One finger is enough: this device is a touchscreen, and its mouse events are ghosts.
    if (e.pointerType === 'touch'){
      touchSeen = true; lastTouchAt = performance.now(); canvasTouchDown++;
      lastTouchX = e.clientX; lastTouchY = e.clientY;
      // Chặn luôn bộ sự kiện chuột tương thích ở gốc. Đây là nửa còn lại của bản vá cho bug
      // "chạm nút Tủ đồ thì tủ vừa mở đã đóng ngay trong cùng cú chạm": showVeil() làm tấm
      // màn phủ hiện lên NGAY TRONG pointerdown này, rồi cú click chuột tương thích ~25ms sau
      // được dò lại trên DOM MỚI và rơi trúng nút "Đóng tủ" mà thanh dính đáy vừa đặt xuống
      // ngay dưới ngón tay. Đo thật: mở ở t+5ms, đóng ở t+30ms, phụ thuộc số hàng trong tủ.
      if (e.cancelable) e.preventDefault();
    }
    if (skipCut()) return;
    cv.setPointerCapture(e.pointerId);
    // Claimed unconditionally, and released in exactly one place. Claiming per-branch would be more
    // precise and is exactly the kind of thing the next branch forgets to do — which is how this bug
    // existed in the first place. A press on the play surface is a hand on the game, never a gaze.
    claimPointer(e.pointerId);
    const p = canvasPoint(e);
    const hud = hudLayout();
    // ------------------------------------------------------------------ nút
    // NÚT GẦN NHẤT THẮNG, không phải nút đứng đầu danh sách.
    // ROOT-CAUSE của cách cũ: đây là một chuỗi `if ... return` nên khi hai vùng bắt
    //   chạm chồng nhau, cú chạm luôn rơi vào nút được HỎI TRƯỚC — bất kể ngón tay
    //   đặt gần nút nào hơn. Đo thật ở khung dọc bản Biệt Đội: nút kỹ năng cách nút
    //   Tủ đồ 9px trong khi tổng hai bán kính là 53px, và vì kỹ năng đứng trước nên
    //   NGƯỜI CHƠI KHÔNG MỞ ĐƯỢC TỦ ĐỒ. Đổi thứ tự chỉ đẩy lỗi sang nút khác; cái
    //   phải sửa là luật chọn.
    // Vùng bắt chạm là r*1,25 (ô đồ rộng hơn: 1,6 vì chúng còn là cần ngắm), và
    // khoảng cách được CHIA CHO bán kính trước khi so, nên "gần" nghĩa là gần theo
    // tỉ lệ của chính nút đó — nút to không hút mất cú chạm của nút nhỏ bên cạnh.
    const btns = [];
    const add = (o, mul, ok, run) => {
      if (!o || !ok) return;
      const d = Math.hypot(p.x-o.x, p.y-o.y) / (o.r*mul);
      if (d < 1) btns.push({ d: d, run: run });
    };
    add(hud.grab,   1.25, !!S.player,                       () => pickUp(S.player));
    add(hud.sprint, 1.25, S.player && !S.shopMode,          () => toggleSprint());
    // Đánh thường có NÚT RIÊNG. Chạm nhẹ lên cần xoay vẫn đánh — cùng hai dòng dưới đây, xem
    // nhánh nhả ngón ở pointerup — nhưng một hành động mà cách duy nhất để gọi nó là "chạm rồi
    // nhả trong 280ms mà đừng kéo quá xa" thì không ai đọc ra được từ màn hình. meleeSwing tự
    // canh hồi chiêu, choáng, đang lái xe và chế độ shop, nên cứ gọi thẳng.
    add(hud.melee,  1.25, S.player && !S.shopMode,          () => {
      const t = meleeTarget(S.player);
      meleeSwing(S.player, t ? Math.atan2(t.y - S.player.y, t.x - S.player.x) : null);
    });
    add(hud.stash,  1.25, S.player && nearTruck(S.player),  () => toggleStash());
    add(hud.test,   1.25, S.shopMode && !!S.player,         () => {
      if (!testHeld(S.player)) toast('Cầm một khẩu súng lên rồi bấm thử.');
    });
    add(hud.skill,  1.25, hud.skill && S.player && !S.shopMode, () => {
      if (HOOKS.skill.ready && !HOOKS.skill.ready()) { toast('Kỹ năng chưa hồi xong'); return; }
      // Tin hieu CHUNG cho moi ky nang, ban ngay tai cho bam. Tung ky nang ban them hinh rieng
      // qua REPO.castFx; day la cai luoi do, de khong ky nang nao im lang.
      castFx('aura', S.player.x, S.player.y, { col:'210,235,255', dur:0.42 });
      fxShake(2.5);
      HOOKS.skill.use();
    });
    // Ba ô đồ: một cú chạm BẮT ĐẦU trên ô đồ là đang ngắm, không phải đang nhìn
    // (doc C2-5). Danh sách này rỗng hẳn khi ở trạm dịch vụ — chúng là nút của
    // căn nhà — nên phải duyệt theo độ dài của nó chứ không theo một con số cứng.
    // SEE: docs/proposals/repo-2d-topdown.md F14-1.
    for (let i = 0; i < hud.slots.length; i++){
      const sl = hud.slots[i];
      add(sl, 1.6, !!S.player, () => {
        const it = S.player.inv[i];
        const def = it && GEAR_BY_KEY[it.kind];
        if (!it || it.uses <= 0) return;
        if (def && def.passive) return;                 // the tracker works by being carried
        // A thing that happens to you has nowhere to point: its slot is a plain button.
        if (!def || !def.aim){ useSlot(S.player, i); return; }
        S.player.aimSlot = i; S.player.aimId = e.pointerId;
        S.player.aimX = p.x; S.player.aimY = p.y;
        // Giữ ô đồ của một khẩu sạc LÀ đang sạc. Không thêm nút nào, không thêm luật nào phải
        // dạy: cái ngón cái vốn đã làm để ngắm bây giờ mang thêm một ý nghĩa thứ hai.
        if (def.charge){ S.player.chargeSlot = i; S.player.chargeT = 0; }
        // CHỈ huỷ cần nhìn nếu chính ngón tay này đang giữ nó. Trước đây dòng này xoá thẳng,
        // nên ngón cái thứ hai bấm một ô đồ là giết cần nhìn của ngón thứ nhất: ngón đó vẫn
        // đang đặt trên kính, mọi pointermove của nó không khớp với gì nữa, và cú nhả tay của
        // nó cũng không khớp — cần nhìn nằm chết cho tới khi nhấc tay lên đặt lại.
        if (stickR && stickR.id === e.pointerId) stickR = null;
      });
    }
    if (btns.length){
      btns.sort((x, y) => x.d - y.d);
      btns[0].run();
      return;
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
      // sx/sy la diem ngon tay ĐẶT XUỐNG, khong bao gio doi - ox/oy bi keo theo khi
      // ngon truot ra khoi vong nen khong dung de do "co keo di dau khong" duoc.
      // t0 lay theo dong ho THAT chu khong phai S.time: S.time dung lai khi game tam
      // dung, va mot cu cham keo dai qua mot lan tam dung se bao la 0 giay.
      else { stickR = { id:e.pointerId, ox:p.x, oy:p.y, x:p.x, y:p.y,
                        sx:p.x, sy:p.y, t0:performance.now() }; lookHeld = true; }
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
    if (e.pointerType === 'touch'){
      canvasTouchDown = Math.max(0, canvasTouchDown - 1);
      lastTouchAt = performance.now();
      lastTouchX = e.clientX; lastTouchY = e.clientY;   // bóng ma rơi ở chỗ NHẤC TAY, không phải chỗ đặt
    }
    releasePointer(e.pointerId);
    const p = canvasPoint(e);
    const pl = S.player;
    if (pl && pl.aimSlot >= 0 && pl.aimId === e.pointerId){
      const hud = hudLayout(), s = hud.slots[pl.aimSlot];
      // Danh sách ô đồ RỖNG khi đang ở trạm dịch vụ (hudLayout: `S.shopMode ? [] : [...]`),
      // nên `s` có thể là undefined. Đọc s.x lúc đó là ném lỗi — và cả ba chỗ đọc s đều nằm
      // trong đường chạy mỗi khung hình, nên một cú ném là vòng vẽ chết vĩnh viễn.
      if (!s){ pl.aimSlot = -1; pl.aimId = -1; return; }
      const dx = p.x - s.x, dy = p.y - s.y;
      // Letting go USES it — that is the whole point of holding it. The one way out is the X in the
      // top corner, which is what a mobile MOBA trains the thumb to look for. Releasing without
      // having dragged anywhere throws it along the way you are already facing rather than eating
      // the press, because a press that does nothing is indistinguishable from a broken button.
      if (!overCancel(hud, p)){
        const far = Math.hypot(dx,dy) > hud.aimR*STICK_DEAD;
        const it = pl.inv[pl.aimSlot];
        const kind = it && it.kind;
        // Kéo đi đâu thì bắn đi đó — nhưng có TRỢ NGẮM: nếu hướng vừa kéo đã gần đúng một con
        // trong khoảng 14 độ thì hút vào nó. Chạm nhanh không kéo thì để máy ngắm hộ hẳn.
        const ang = aimNow(pl, kind, far, Math.atan2(dy,dx)).ang;
        pl.chargeUsed = pl.chargeSlot === pl.aimSlot ? pl.chargeT : null;
        useSlot(pl, pl.aimSlot, ang);
        pl.chargeUsed = null;
      }
      pl.aimSlot = -1; pl.aimId = -1;
      pl.chargeSlot = -1; pl.chargeT = 0;
      return;
    }
    if (stickL && stickL.id === e.pointerId) stickL = null;
    if (stickR && stickR.id === e.pointerId){
      // CHAM NHE vao can gat phai = DAP DEN PIN, va tu quay sang con quai gan nhat.
      // WHY cho nay: can gat phai la "nhin", va nhin la thu ngon cai phai da dat len
      // do khi co gi dang duoi minh. Bat no lech tay sang mot nut khac dung luc con
      // quai cach hai o la bat no chon giua NHIN va DANH. Mot cu cham thi truoc gio
      // khong co nghia gi ca - keo moi la nhin - nen cho nay dang bo trong.
      const hud = hudLayout();
      const keo = Math.hypot(p.x - stickR.sx, p.y - stickR.sy);
      const lau = performance.now() - stickR.t0;
      if (keo < hud.right.r * 0.35 && lau < 280 && !S.shopMode){
        const t = meleeTarget(pl);
        meleeSwing(pl, t ? Math.atan2(t.y - pl.y, t.x - pl.x) : null);
      }
      stickR = null; lookHeld = false;
    }
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

  // ---- dọn dẹp: mọi lối mà một cú nhả tay hay một phím có thể lạc mất
  // Trình duyệt tước quyền bắt con trỏ (đổi tab, gọi điện đến, cuộn của hệ điều hành) thì
  // pointerup KHÔNG bao giờ tới. Đây là sự kiện duy nhất báo chuyện đó.
  cv.addEventListener('lostpointercapture', e => {
    releasePointer(e.pointerId);
    if (stickL && stickL.id === e.pointerId) stickL = null;
    if (stickR && stickR.id === e.pointerId){ stickR = null; lookHeld = false; }
    const p = S.player;
    if (p && p.aimId === e.pointerId){ p.aimSlot = -1; p.aimId = -1; }
  });
  // Chuột phải trên khung chơi là một cú bấm nhầm, không phải một yêu cầu mở menu hệ thống —
  // và cái menu đó chính là thứ nuốt mất pointerup.
  cv.addEventListener('contextmenu', e => e.preventDefault());
  // Rời cửa sổ khi đang giữ W thì cú nhả W rơi vào cửa sổ khác. Không dọn thì nhân vật tự đi mãi.
  addEventListener('blur', () => resetInput());
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
}
function overCancel(hud, p){
  return Math.hypot(p.x-hud.cancel.x, p.y-hud.cancel.y) < hud.cancel.r*1.25;
}
function aimAngle(p, hud){
  const s = hud.slots[p.aimSlot];
  if (!s) return p.dir;               // xem chú thích ở nhánh pointerup
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
let mouseScreen = null, mouseMovedAt = -1e9, touchSeen = false, lastTouchAt = -1e9;
let lastTouchX = -1e9, lastTouchY = -1e9;   // điểm ngón tay chạm gần nhất, theo toạ độ TRANG
// Bao nhiêu ngón tay đang đặt trên KHUNG CHƠI ngay lúc này. Chỉ dùng để biết một tấm màn phủ
// có ra đời ở giữa một cú chạm hay không — xem chú thích ở showVeil().
let canvasTouchDown = 0;

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

// ============================================================ dọn sạch trạng thái nhập liệu
// WHY hai hàm chứ không một: cần gạt và cú ngắm là những thứ một NGÓN TAY đang giữ, còn
// phím là thứ một BÀN TAY đang giữ. Đổi khung hình thì ngón tay vẫn đang đặt trên kính
// nhưng toạ độ dưới nó đã đổi hết — phải bỏ cử chỉ mà không được bỏ phím. Rời cửa sổ thì
// ngược lại: cả hai đều mất.
//
// ROOT-CAUSE của cả một họ lỗi "điều khiển chết mà game vẫn chạy": trước bản này KHÔNG CÓ
//   một chỗ nào trong cả tệp reset keys / stickL / stickR / heldPointers / aimSlot. Một cú
//   pointerup lạc mất là hỏng vĩnh viễn cho tới lúc tải lại trang:
//     · chuột phải trên canvas   -> context menu nuốt pointerup -> heldPointers giữ mãi id
//       của con chuột -> mọi pointermove sau đó bị chối ở dòng `heldPointers.has(...)` ->
//       hướng nhìn đứng hình cả phiên.
//     · chuột phải ở dải ngón cái -> stickL sinh ra và không ai xoá -> nhân vật tự đi mãi.
//     · chuột phải trên ô đồ      -> aimSlot >= 0 mãi mãi -> cả ba ô đồ và cần nhìn chết.
//     · giữ W rồi Alt-Tab, nhả W ở cửa sổ khác -> 'w' nằm lại trong Set -> tự đi mãi.
function cancelGestures(){
  stickL = null; stickR = null; lookHeld = false;
  canvasTouchDown = 0;
  // Bỏ cử chỉ giữa chừng thì mức sạc mất theo — không được phép bắn hộ người chơi một phát
  // mà họ không hề buông tay để bắn.
  const pl = S.player;
  if (pl){ pl.chargeSlot = -1; pl.chargeT = 0; pl.chargeUsed = null; }
  heldPointers.clear();
  const p = S.player;
  if (p){ p.aimSlot = -1; p.aimId = -1; }
}
function resetInput(){
  keys.clear();
  mouseScreen = null; mouseMovedAt = -1e9;
  cancelGestures();
}
// Real time, not simulation time: how long ago the player physically moved the mouse.
const mouseFresh = () => (performance.now() - mouseMovedAt) < LOOK_IDLE*1000;
const mouseWorldNow = () => mouseScreen &&
  { x: cam.x + mouseScreen.x/zoom(), y: cam.y + mouseScreen.y/zoom() };
function canvasPoint(e){
  const cv = CV(), r = cv.getBoundingClientRect();
  // Che do XOAY TAY: cả vỏ game bị CSS quay 90 độ theo chiều kim đồng hồ. clientX/Y
  // là toạ độ trên MÀN HÌNH, còn getBoundingClientRect() trả về hộp bao đã xoay —
  // nên phải quay ngược cú chạm lại, nếu không ngón tay bấm một nơi mà game hiểu
  // một nẻo (và nó lệch đúng 90 độ, tức là cần gạt trái thành cần gạt phải).
  // Sau khi quay 90 độ, góc trên-trái của khung nằm ở góc trên-PHẢI của hộp bao,
  // và bề rộng/bề cao của khung đổi chỗ cho nhau.
  if (document.body.classList.contains('force-land')){
    return { x: (e.clientY - r.top) / r.height * viewW,
             y: (r.width - (e.clientX - r.left)) / r.width * viewH };
  }
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
// Đổi khung hình là mọi toạ độ dưới ngón tay đổi hết: gốc cần gạt, tâm nút, tâm ô đồ.
// Giữ lại một cử chỉ đang dở qua ranh giới đó là để nó đo bằng cái thước của bố cục CŨ —
// nhân vật lao một hướng không ai bảo, cho tới khi nhấc tay lên.
function resize(){
  fitCanvas();
  const cv = CV();
  // offsetWidth/Height, KHONG phai getBoundingClientRect(): cai sau tra ve hop BAO
  // cua phan tu sau khi da bien hinh, nen o che do xoay tay no doi chieu rong voi
  // chieu cao. Doc nham cai do thi khung 844x347 bao lai la 347x844 va game van
  // dung bo cuc DOC trong khi hinh da nam ngang - hai can gat chong len nhau o mot
  // goc. offsetWidth la kich thuoc BO CUC, khong bi transform dung toi.
  const w0 = cv.offsetWidth || cv.getBoundingClientRect().width;
  const h0 = cv.offsetHeight || cv.getBoundingClientRect().height;
  if (!w0) return;
  dpr = Math.min(devicePixelRatio || 1, 2);
  const wMoi = Math.round(w0), hMoi = Math.round(h0);
  // Bỏ cử chỉ đang dở chỉ khi khung THẬT SỰ đổi kích thước. Trước đây dòng này nằm ngay đầu
  // hàm và chạy mọi lần resize() được gọi — mà trên Safari iOS thì thanh công cụ trượt lên
  // trượt xuống bắn ra `resize` liên tục ngay trong lúc ngón tay đang kéo cần gạt. Xoay màn
  // hình thì vẫn phải bỏ: hai cần gạt đổi chỗ, ngón tay đang giữ ở toạ độ cũ là vô nghĩa.
  if (wMoi !== viewW || hMoi !== viewH) cancelGestures();
  viewW = wMoi; viewH = hMoi;
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
  // Cần gạt XOAY nhỏ hơn cần gạt ĐI. Hai việc khác nhau: cần trái phải đọc được cả độ lớn (đi
  // nhanh hay rón rén) nên cần quãng đẩy dài, còn cần phải chỉ đọc GÓC — quãng đẩy dư ra không
  // mang thêm tin gì, nó chỉ ăn chỗ ở đúng góc màn hình ngón cái phải hay ở. Thu lại lấy chỗ cho
  // nút đánh thường. R vẫn giữ nguyên cho mọi thứ khác (nút, vòng cung ô đồ, thumbY, aimR).
  // SEE: nút đánh thường + thu nhỏ cần xoay, 2026-08-31
  const RR = R * 0.72;
  const left  = { x: pad + R,  y: h - pad - R,  r: R };
  const right = { x: w - pad - RR, y: h - pad - RR, r: RR };
  // Đánh thường: ở ngay cạnh cần xoay, trong dải ngón cái, vào chỗ cần xoay vừa nhả ra. Vẫn giữ
  // được lối chạm nhẹ lên cần xoay để đánh — hai đường vào cùng một hành động, và phép chọn nút
  // gần nhất lo phần tranh chấp.
  const melee = { x: w - pad - RR - R*1.5, y: h - pad - R*0.62, r: sr*1.02 };

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
  // Bắn thử ngồi vào ô của nút Chạy — xem chú thích dài ở bố cục ngang. Ở bố cục dọc hai nút
  // này trước đây cách nhau đúng 1,4px, tức là cũng chồng nhau, chỉ chưa lộ ra.
  const test = { x: 295*K, y: h - 58*K, r: sr*1.25 };
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
  // Nút kỹ năng chỉ có ở bản Biệt Đội: ngồi TRÊN vòng cung ba ô đồ, lệch sang phải
  // khỏi cột nhặt/tủ đồ và khỏi trái tim.
  // ROOT-CAUSE của chỗ cũ (grab.y - sr*3.2): nó rơi vào y = h - 173*K trong khi Tủ
  //   đồ và Bắn thử nằm ở h - 227*K — cách nhau 9px trong khi tổng hai bán kính là
  //   53px. Và vì vòng bắt chạm hỏi hud.skill TRƯỚC hud.stash, nút kỹ năng nuốt luôn
  //   cú chạm: ở màn dọc, bản Biệt Đội KHÔNG mở được tủ đồ. Thứ tự hỏi giờ cũng đã
  //   đổi cho tủ đồ đứng trước, nên kể cả có đè cũng không cướp được nữa.
  const skill = HOOKS.skill ? { x: w - 120*K, y: h - 265*K, r: sr*1.45 } : null;
  return { w, h, left, right, melee, slots, grab, sprint, stash, cancel, heart, test, skill, pad, thumbY, aimR: R,
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
  const R   = h * 0.145;                  // cần gạt: to đủ quăng, nhưng khung ngang thấp nên đừng quá
  const sr  = R * 0.46;
  // Cùng luật với bố cục dọc: cần xoay nhỏ hơn cần đi, và chỗ nó nhả ra thành nút đánh thường.
  const RR = R * 0.72;
  const left  = { x: pad + R,  y: h - pad - R,  r: R };
  const right = { x: w - pad - RR, y: h - pad - RR, r: RR };
  // Chéo lên trái so với cần xoay: hàng nút và vòng cung ô đồ vẫn dựng quanh R cũ nên chỗ này
  // trống thật, và nó nằm sâu bên phải nên không đụng luật "giữa màn hình để trống".
  const melee = { x: w - pad - R - R*0.58, y: h - pad - R - R*0.58, r: sr*0.88 };
  const thumbY = h - (pad + 2*R + 10);

  // MỌI NÚT BẤM TRONG LÚC CHẠY ĐỀU THUỘC TAY PHẢI. Tay trái ôm cần di chuyển và
  // không được rời ra: chạy nước rút, nhặt đồ và dùng đồ đều là thứ phải bấm TRONG
  // KHI đang chạy, nên chúng nằm quanh cần phải cho ngón cái phải với tới.
  // WHY: bản trước để chạy/nhặt bên trái. Muốn vừa chạy vừa nhặt thì ngón trái phải
  //   nhả cần ra bấm — nhả cần là đứng lại, mà đứng lại giữa lúc con quái đuổi là
  //   chết. Game bắn/MOBA di động không ai bày như thế.
  // Cả cụm nằm TRÊN vạch thumbY: dải dưới cùng là của hai cần gạt, không ai được
  // đặt nút vào đó.
  // Ba ô đồ BO THÀNH VÒNG CUNG ôm lấy cần phải, đúng hình vòng chiêu của game MOBA:
  // ngón cái phải quét một cung tròn quanh chỗ nó đang đặt, nên nút xếp theo đúng
  // cung đó là gần tay nhất mà không cần rời cần.
  // Ba nút còn lại thành MỘT HÀNG NGANG sát lề phải rồi đi dần ra trái, nhích lên
  // phía trên vòng cung — không lên tận góc, chỉ đủ để không đè lên nhau.
  // WHY cả cụm bám mép phải: khối hai cột trước đó ăn 31% bề ngang, vẫn thò vào chỗ
  //   đang chơi. Cách này gọn còn ~19%, giữa màn trống hẳn.
  const cx = w - pad - R, cy = h - pad - R;
  const ring = R * 1.80;                  // bán kính vòng cung, đủ hở khỏi mép cần gạt
  const at = (deg, r) => ({ x: cx + ring*Math.cos(deg*Math.PI/180),
                            y: cy - ring*Math.sin(deg*Math.PI/180), r: r });
  const slots = S.shopMode ? [] : [
    Object.assign(at(180, sr*1.10), { i: 0 }),
    Object.assign(at(140, sr*1.10), { i: 1 }),
    Object.assign(at(100, sr*1.10), { i: 2 })
  ];
  const rowY = h * 0.37;                  // trên vòng cung, dưới bản đồ nhỏ
  // Giãn từ 2,65 lên 3,0 lần bán kính nút: vùng BẮT CHẠM là r*1,25 chứ không phải r,
  // nên ở mức 2,65 hai nút cạnh nhau đã chồng vùng chạm 6px — nút bên phải luôn
  // thắng và nút bên trái thỉnh thoảng bấm không ăn.
  const rx   = n => w - pad - sr*1.15 - n * sr*3.0;
  // Nút kỹ năng (chỉ bản Biệt Đội) đứng ĐẦU HÀNG, sát lề phải nhất, vì sau nút nhặt
  // thì nó là nút bấm nhiều nhất; ba nút kia lùi sang trái một ô.
  // ROOT-CAUSE của chỗ cũ, at(60°) trên cùng vòng cung với ba ô đồ: tâm cần gạt phải
  //   chỉ cách lề phải 76px, nên bất cứ điểm nào của vòng cung có cos dương đều lòi
  //   ra ngoài khung — đo được 11px hình vẽ và 20px vùng chạm nằm ngoài màn hình.
  const n0 = HOOKS.skill ? 1 : 0;
  const skill  = HOOKS.skill ? { x: rx(0), y: rowY, r: sr*1.25 } : null;
  const grab   = { x: rx(n0),     y: rowY, r: sr*1.15 };
  const sprint = { x: rx(n0 + 1), y: rowY, r: sr*1.15 };
  const stash  = { x: rx(n0 + 2), y: rowY, r: sr*1.15 };
  // Bắn thử NGỒI VÀO Ô CỦA NÚT CHẠY, vì ở trạm dịch vụ nút Chạy không được vẽ và không bắt
  // chạm (`!S.shopMode` ở cả hai chỗ) — ô đó trống hẳn.
  // ROOT-CAUSE: chú thích cũ nói "Tủ đồ và Bắn thử loại trừ nhau" nên cho chúng dùng chung
  //   một ô. Chúng KHÔNG loại trừ nhau: ở trạm dịch vụ, đứng cạnh xe thì nearTruck() đúng và
  //   S.shopMode cũng đúng. Luật chọn nút là dist/(r*mul), nên ở khoảng cách 0 nút có BÁN
  //   KÍNH LỚN HƠN luôn thắng — Bắn thử (sr*1,20) nuốt sạch mọi cú chạm của Tủ đồ (sr*1,15).
  //   Đo thật ở khung ngang: nút Tủ đồ chết hẳn ở trạm, mọi độ dài tủ 0..10, cả hai bản game;
  //   chạm vào nó chỉ hiện "Cầm một khẩu súng lên rồi bấm thử." Mà trạm chính là chỗ mua đồ
  //   về tủ, nên đó là chỗ người chơi cần mở tủ nhất.
  const test   = { x: rx(n0 + 1), y: rowY, r: sr*1.15 };
  // Chỗ bỏ món đang giơ: mép TRÊN giữa màn — xa nhất khỏi ngón vừa giơ nó lên,
  // và không đụng thanh máu (trên trái) lẫn bản đồ nhỏ (trên phải).
  const cancel = { x: w * 0.5, y: pad + sr*1.7, r: sr*1.7 };
  // Trái tim xuống MÉP DƯỚI giữa hai cần gạt. Vẫn nằm trong tầm mắt như chủ ý cũ,
  // nhưng không còn đứng chắn giữa màn chơi.
  const heart = { x: w * 0.5, y: h - pad - h*0.075, r: h*0.062 };
  // Nút kỹ năng nối vào ĐẦU TRONG của vòng cung, sát cần phải nhất — nó là nút bấm
  // nhiều nhất của bản Biệt Đội nên phải nằm chỗ ngón cái với gần nhất.

  return { w, h, left, right, melee, slots, grab, sprint, stash, cancel, heart, test, skill, pad, thumbY, aimR: R,
           msgY: heart.y - heart.r - 12 };
}
// Scaled with the truck: the locker button appears when you are standing AT it, and "at it" got
// bigger when the thing itself did.
function nearTruck(p){ return Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*3.6; }

// ĐỨNG CHỜ XE LĂN BÁNH.
//
// Trước đây xe đi ngay khoảnh khắc có ai bước vào bán kính 2,4 ô — không hỏi, không đếm, không
// rút lại được. Ba lần kết ca khác nhau đều thế: xong bệ cuối, ca hỏng, và rời shop. Thành ra
// cái xe tải là một cái bẫy đặt giữa sàn: chạy ngang qua nó trên đường đi lấy nốt món cuối là
// mất luôn phần còn lại của tầng, và ở shop thì quay lại xe để mở tủ đồ là bị chở đi.
//
// Nay phải đứng trong thùng đủ TRUCK_BOARD_T giây. Bước ra là đồng hồ về 0 — về 0 chứ không tạm
// dừng, vì "tôi có còn được tính không" là câu hỏi mà một cái đồng hồ tạm dừng không trả lời
// được, còn cái vòng tròn tụt về đầy thì trả lời được từ xa. Cùng bộ đồng hồ với bệ rút hàng,
// nên nó cũng kêu từng nhịp một giây và cũng nhìn thấy được từ bên kia phòng.
// SEE: đứng trong xe đủ 5s xe mới chạy, 2026-08-31
const TRUCK_BOARD_T = 5;
const TRUCK_BOARD_R = TILE*2.4;      // đúng bán kính cũ, chỉ khác là giờ phải Ở LẠI trong đó
function inTruck(a){ return a && !a.down && Math.hypot(a.x-S.car.x, a.y-S.car.y) < TRUCK_BOARD_R; }
function clearBoard(){
  if (!S.board && !S.countdownActive) return;
  S.board = 0; S.countdownActive = false; S.countdown = 0; FX.lastTick = -1;
}
// Trả về true đúng một lần, ở khung hình mà đồng hồ chạy hết.
function holdAtTruck(dt, ai, nhan){
  if (!ai){ clearBoard(); return false; }
  S.board = (S.board || 0) + dt;
  S.countdownActive = true;
  S.countdownMax = TRUCK_BOARD_T; S.countdownLabel = nhan;
  S.countdown = Math.max(0, TRUCK_BOARD_T - S.board);
  const whole = Math.ceil(S.countdown);
  if (whole !== FX.lastTick){
    FX.lastTick = whole; FX.tickPulse = 1;
    if (whole > 0) SFX.tick(TRUCK_BOARD_T - whole);
  }
  if (S.board < TRUCK_BOARD_T) return false;
  clearBoard();
  return true;
}

// ============================================================ step
function step(dt){
  S.time += dt;
  S.ticks = (S.ticks || 0) + 1;
  // Bo dem cua ky nang, cho CA TO chu khong rieng nguoi choi: bot cung duoc Thien
  // Than che, cung duoc Tang Hinh giau.
  for (const a of crew()){
    if (!a) continue;
    a.invisT  = Math.max(0, (a.invisT  || 0) - dt);
    a.invulnT = Math.max(0, (a.invulnT || 0) - dt);
    a.hasteT  = Math.max(0, (a.hasteT  || 0) - dt);
  }   // the fixed-step counter; a render frame may run 0, 1 or 2
  S.messageT = Math.max(0, S.messageT - dt);
  const p = S.player;
  if (!p) return;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.swingCd = Math.max(0, (p.swingCd || 0) - dt);
  p.swingT  = Math.max(0, (p.swingT  || 0) - dt);
  p.hurt = Math.max(0, p.hurt - dt);

  p.floatT = Math.max(0, p.floatT - dt);
  p.shieldT = Math.max(0, p.shieldT - dt);
  p.blindT = Math.max(0, p.blindT - dt);
  p.slowT = Math.max(0, p.slowT - dt);
  p.recoilT = Math.max(0, (p.recoilT || 0) - dt);
  // Sạc laser chạy trên đồng hồ của THẾ GIỚI, không phải đồng hồ thật: tạm dừng game giữa lúc
  // đang giữ ô đồ thì không được sạc thêm miễn phí.
  if (p.chargeSlot >= 0) p.chargeT = Math.min(LASER_FULL * 1.35, (p.chargeT || 0) + dt);

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
  // Đang ngồi trên xe thì chiếc xe quyết định việc đi lại, không phải đôi chân.
  if (p.riding){ rideBike(p, dt, vx, vy, push); }
  else if (vx || vy){
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
      if (d && d.warned <= 0){ d.warned = 3;
        toast('Cửa bị kẹt — xà beng/bom cho nhanh, hoặc phang đèn pin nhiều nhát'); }
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
  stepBikes(dt);
  if (S.shopMode){
    stepProjectiles(dt);                      // a test shot has to actually travel to be a test
    stepShop(dt);
    if (!S.shopMode) return;                  // the truck took us to the next level mid-step
  } else {
    stepDoors(dt);
    stepMates(dt);
    // TRƯỚC stepMonsters: stepEscape chỉ đi gắn m.tx/m.alert bằng makeNoise, để sau thì cả
    // đàn ăn tin chậm đúng một khung — nghe thấy tiếng còi rồi mới quay đầu ở nhịp sau.
    stepEscape(dt);
    if (!S.noFoes){ stepMonsters(dt); stepBangers(dt); stepStomp(dt); separateFoes(); stepFoeSound(dt); stepRespawns(dt); }
    stepAngel(dt);
    stepMirror(dt);
    stepProjectiles(dt);
    stepExtraction(dt);

    // Về tới xe sau bệ cuối là kết ca — nhưng phải ĐỨNG TRONG THÙNG đủ TRUCK_BOARD_T giây, và
    // bước ra là đồng hồ về 0. Ai đứng chờ thì tuỳ: bình thường là chính người chơi, còn nếu
    // người chơi đang nằm thì một đồng đội còn đứng làm thay — không có luật đó thì gục lúc bệ
    // cuối vừa chốt là một ván KHÔNG CÓ lối ra.
    if (S.levelDone || S.shiftLost){
      const ai = p.down ? (S.mates||[]).some(inTruck) : inTruck(p);
      if (holdAtTruck(dt, ai, S.shiftLost ? 'BỎ CA' : 'LÊN XE')){
        if (S.shiftLost){ endLostShift(); return; }
        truckPatchUp(); finishLevel(); return;
      }
    } else if (S.board) clearBoard();
    if (lootJustDestroyed){ lootJustDestroyed = false; checkShiftLost(); }

    markExplored();
    // Hieu ung KEO DAI cua lop ky nang (vong hoi, long sat, moi nhu, thau thi) chay
    // SAU khi quai da di xong trong khung nay, de mot cai long chan duoc con quai
    // vua buoc vao chu khong cham mot nhip.
    if (HOOKS.onTick) HOOKS.onTick(dt);
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
  c.drawImage(S.worldCv, 0, 0, WPX, HPX);   // ảnh nền vẽ ở SS lần, thu về đúng khổ thế giới
  drawPads(c); drawButton(c); drawBikes(c); drawCart(c); drawLoot(c); drawCar(c); drawMirrors(c); drawMates(c); drawMonsters(c); drawAngel(c); drawDoors(c); drawProjectiles(c); drawPlayer(c);

  buildLight();
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'multiply';
  c.drawImage(lightCv, 0, 0);

  c.globalCompositeOperation = 'lighter';
  worldTransform(c);
  drawMemory(c);
  drawCasts(c);
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

  // Quầng sáng bám THÂN NGƯỜI, và nó cố ý nằm NGOÀI phần bị đa giác tầm nhìn cắt.
  //
  // WHY: thế giới vẽ từ trên xuống nhưng nhân vật vẽ đứng thẳng, nên cái đầu chiếm chỗ
  // của ô NGAY TRÊN bàn chân mình. Đứng sát tường thì ô đó là tường, đa giác tầm nhìn
  // dừng đúng ở mặt tường, và nửa trên của nhân vật rơi vào vùng tối — trên màn hình
  // trông y như bị bức tường cắt ngang người.
  // ROOT-CAUSE: ánh sáng tính theo toạ độ thế giới của BÀN CHÂN, còn hình thì cao 30
  // đơn vị dựng ngược lên trên; hai hệ đó không phải một.
  // SEE: chủ dự án 2026-08-29 — "đừng để cho tường cắt hình char".
  //
  // Bán kính vừa đủ trùm hết chiều cao hình rồi tắt hẳn, nên chỗ rò qua một bức tường
  // dày một ô chỉ là một vệt mờ sát chân tường, không đủ để thấy thứ gì ở phòng bên.
  c.globalCompositeOperation = 'lighter';
  // Tâm quầng nâng LÊN ngang giữa thân, không đặt ở bàn chân: hình cao 38 đơn vị và
  // dựng ngược lên trên, nên đặt ở chân thì tới cái đầu là quầng đã tắt gần hết — đo được
  // 10/255 ở tầm đầu, tức vẫn còn nguyên vệt cắt. Nâng tâm lên thì cùng một bán kính trùm
  // đủ từ chân tới đỉnh đầu, và rò qua tường ít hơn là nới rộng bán kính.
  const bodyHalo = 30, bodyMid = 13;
  const hy = p.y - bodyMid;
  const hg = c.createRadialGradient(p.x, hy, 2, p.x, hy, bodyHalo);
  hg.addColorStop(0, 'rgba(206,212,216,0.96)');
  hg.addColorStop(0.70, 'rgba(184,192,198,0.66)');
  hg.addColorStop(1, 'rgba(90,100,110,0)');
  c.fillStyle = hg;
  c.fillRect(p.x - bodyHalo, hy - bodyHalo, bodyHalo * 2, bodyHalo * 2);

  const master = visPoly(p.x, p.y, LOS_R, 80);
  c.save(); pathPoly(c, master); c.clip();

  // small pool at your feet
  // Sáng hẳn ngay dưới chân, rồi tụt về đúng mức cũ trong vòng nửa ô. Lý do: lớp tối
  // được NHÂN lên cả khung hình, kể cả lên chính nhân vật — đo được là màu sàn 106 rơi
  // xuống còn 2..41, tức là bộ hình vẽ tay bị nhân cho tối đi tới 20 lần và người chơi
  // chỉ thấy một cục đen. Chỗ sáng thêm gói trong bán kính người chơi, nên cả căn nhà
  // vẫn tối y như trước — thứ đổi là bạn nhìn rõ mình và người đứng cạnh mình.
  let g = c.createRadialGradient(p.x,p.y,2,p.x,p.y,PERIPH_R);
  g.addColorStop(0,'rgba(206,212,216,0.94)');
  g.addColorStop(0.30,'rgba(196,202,206,0.82)');
  g.addColorStop(0.55,'rgba(150,160,168,0.46)');
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
  const p = spawnAnchor();      // xem chú thích ở spawnAnchor()
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

  // Pho tuong co bo hinh rieng thi ve bang hinh; vong sac tren dau van giu nguyen
  // vi do moi la thu noi cho nguoi choi biet no sap lao toi.
  const skinned = window.REPO_SKIN &&
    REPO_SKIN.foe(c, { type:'angel', x:a.x, y:a.y, dir:a.face, sleep:0, state:'idle' }, null);
  if (!skinned){
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
  }

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

  // NGƯỜI CHƠI KHÔNG CÓ VIỀN, và đây từng là chỗ vẽ nó.
  //
  // Highlight trả lời đúng một câu: "cái kia là gì". Người chơi là thứ duy nhất trên màn hình
  // không bao giờ phải hỏi câu đó — nó nằm giữa khung hình, camera bám theo nó, quầng sáng quanh
  // thân đã tách nó khỏi sàn, và ngón cái đang điều khiển nó. Một cái viền ở đó chỉ tô đậm thêm
  // thứ mắt đang nhìn thẳng vào; tệ hơn, nó làm cả ba người trong tổ sáng viền như nhau đúng lúc
  // việc cần làm là phân biệt MÌNH với KHÔNG PHẢI MÌNH.
  //
  // Lý lẽ cũ để giữ nó — "giữa một đống đồ hoặc lúc màn hình rung thì mất dấu mình đang ở đâu" —
  // là lý lẽ của thời cả tổ còn là mấy hình tròn giống hệt nhau. Giờ mỗi người một bộ hình riêng,
  // và chỉ đồng đội mới có viền, nên người không viền chính là mình.
  // Còn máu thì đã có thanh máu trên HUD và trái tim đập theo nhịp; không cần nói lần thứ ba.
  // SEE: bỏ viền người chơi, 2026-08-31

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
  // KHÔNG còn vòng tròn quanh quái. Bộ hình đã tự mang viền đỏ bó sát người, nướng sẵn lúc nạp
  // (bakeRim trong sprites.js), nên cái vòng chỉ là một hình tròn to hơn nằm đè lên một cái viền
  // vốn đã nói đúng chuyện đó — và nó nói kém hơn, vì một hình tròn không có hình dáng của con
  // quái. Con đang ngủ đã có chữ z trên đầu, con đang săn vẫn có dấu ! và vệt spotFx: hai tín
  // hiệu ĐỘNG đó mới là thứ cái vòng thực sự mang, và chúng ở lại.
  // SEE: bỏ vòng tròn trên quái, 2026-08-31
  for (const m of S.monsters){
    if (!foeVisible(m) || m.sleep > 0) continue;
    spotFx(c, m.x, m.y, m.spotT || 0);
    if (foeAlerted(m)) alertMark(c, m.x, m.y);
    // NGÒI ĐANG CHÁY. Đây là cái đồng hồ duy nhất trong game chạy trên đầu một con quái, và nó
    // phải đọc được từ xa trong bóng tối — nên vẽ ở lớp cộng sáng này chứ không phải trong lớp
    // thế giới, chỗ mà lớp tối sẽ nhân nó xuống còn không thấy gì. Vòng cung vơi dần là hình
    // dáng, không phải con số: "sắp rồi" phải đọc được bằng đuôi mắt.
    if (m.fuse != null && m.fuse > 0){
      const k = clamp(m.fuse / BANGER_FUSE, 0, 1);
      const gap = m.fuse < 1.2 ? (Math.floor(S.time*11)%2 ? 1 : 0.35) : 1;
      c.save();
      c.strokeStyle = `rgba(255,${140+k*80|0},70,${(0.55 + (1-k)*0.4) * gap})`;
      c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.arc(m.x, m.y - 26, 7, -Math.PI/2, -Math.PI/2 + Math.PI*2*k); c.stroke();
      c.lineCap = 'butt';
      c.beginPath(); c.fillStyle = `rgba(255,235,190,${0.85*gap})`;
      c.arc(m.x, m.y - 26, 2.4, 0, Math.PI*2); c.fill();
      c.restore();
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
// Hệ số sáng của TRÍ NHỚ căn nhà. Trong pha chạy nó tụt gần về không: bản gốc tắt hết đèn
// nhà sau lần rút cuối, và ở bản này thứ tương đương chính là lớp này — cái sàn bạn ĐÃ đi qua
// vẫn còn mờ mờ trên màn hình. Tắt nó đi thì đường về phải đi bằng nón đèn, đúng như lúc mới
// vào nhà, chỉ khác là giờ nhà đông hơn nhiều.
function memGlow(){
  return S.esc ? mix(1, ESC_DARK, clamp(S.esc.dark, 0, 1)) : 1;
}
function drawMemory(c){
  const mo = memGlow();
  if (mo <= 0.02) return;
  const aCu = c.globalAlpha;
  c.globalAlpha = aCu * mo;
  const gx0 = Math.max(0,(cam.x/TILE)|0), gy0 = Math.max(0,(cam.y/TILE)|0);
  const gx1 = Math.min(MW-1,((cam.x+vwW())/TILE)|0), gy1 = Math.min(MH-1,((cam.y+vwH())/TILE)|0);
  for (let gy=gy0; gy<=gy1; gy++) for (let gx=gx0; gx<=gx1; gx++){
    const i = gy*MW+gx;
    if (!S.explored[i]) continue;
    const v = S.grid[i];
    c.fillStyle = v===FLOOR ? 'rgb(6,8,10)' : v===PROP ? 'rgb(12,12,14)' : 'rgb(12,15,19)';
    c.fillRect(gx*TILE, gy*TILE, TILE, TILE);
  }
  c.globalAlpha = aCu;
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
// Xe vẽ TRƯỚC người: người ngồi lên nó, nên nó phải nằm dưới. Hình dáng nói ra ba thứ mà
// người chơi cần biết từ xa: nó là chiếc nào, nó còn xăng không, và nó có đang nằm không.
function drawBikes(c){
  for (const b of (S.bikes || [])){
    const d = bikeDef(b);
    c.save(); c.translate(b.x, b.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0, b.r*0.6, b.r*0.95, b.r*0.4, 0, 0, Math.PI*2); c.fill();
    c.rotate(b.dir + (b.downed > 0 ? 1.15 : 0));      // nằm nghiêng khi vừa ngã
    // hai bánh
    c.fillStyle = '#1e2329';
    c.beginPath(); c.ellipse(b.r*0.72, 0, b.r*0.30, b.r*0.20, 0, 0, Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(-b.r*0.72, 0, b.r*0.30, b.r*0.20, 0, 0, Math.PI*2); c.fill();
    // thân
    c.fillStyle = b.fuel > 0 ? d.col : '#3a3f45';
    c.fillRect(-b.r*0.75, -b.r*0.34, b.r*1.5, b.r*0.68);
    c.strokeStyle = b.rider ? d.rim : (b.fuel > 0 ? '#78838f' : '#4d545c');
    c.lineWidth = 2; c.strokeRect(-b.r*0.75, -b.r*0.34, b.r*1.5, b.r*0.68);
    // ghi đông ở đầu xe, để biết nó đang quay hướng nào
    c.strokeStyle = d.rim; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(b.r*0.60, -b.r*0.52); c.lineTo(b.r*0.60, b.r*0.52); c.stroke();
    // thùng sau, chỉ chiếc chở đồ mới có
    if (d.slots > 0){
      c.fillStyle = b.items.length ? '#6a5a30' : '#3a3f45';
      c.fillRect(-b.r*1.15, -b.r*0.42, b.r*0.42, b.r*0.84);
      c.strokeStyle = '#8e7c46'; c.lineWidth = 1.4;
      c.strokeRect(-b.r*1.15, -b.r*0.42, b.r*0.42, b.r*0.84);
    }
    c.restore();
    // Nhãn: chỉ hiện khi ĐÁNG hiện — đang ngồi lên nó, hoặc đứng đủ gần để lên xe. Một cái nhãn
    // luôn hiện trên mọi vật trong nhà là một cách chắc chắn để không ai đọc cái nào.
    const p = S.player;
    const gan = p && Math.hypot(p.x-b.x, p.y-b.y) < TILE*3;
    if (!gan && b.rider !== p) continue;
    const pct = Math.round(b.fuel / b.fuelMax * 100);
    wText(d.name + ' · xăng ' + pct + '%' + (d.slots ? '  ' + b.items.length + '/' + d.slots : ''),
          b.x, b.y - b.r - 7,
          b.fuel <= 0 ? '#b8544a' : pct < 25 ? '#e0a35a' : '#9fb0c0', 10);
  }
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
  wText(money(cartValue(cart)) + '  ' + cart.items.length + '/' + CART_SLOTS,
        cart.x, cart.y - r - 6, cart.items.length ? '#e0c07a' : '#8b939d', 11);
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
      // On a checkout the number is red once it is past what the wallet holds — otherwise the till
      // simply refuses and the player is left guessing which part it objected to.
      wText(pad.shop ? money(pad.value) : money(pad.value) + ' / ' + money(pad.quota),
            pad.x, pad.y - TILE*2.1,
            (pad.shop && pad.value > S.wallet) ? '#e8776a' : '#dfe6ea', 13);
    }
    // NÚT GIAO HÀNG, vẽ trên sàn cạnh bệ. Xám khi chưa đủ chỉ tiêu — cái nút phải nói được rằng
    // đạp bây giờ cũng không ăn thua, chứ không phải để người chơi đứng lên rồi tự hỏi vì sao
    // không có gì xảy ra. Sáng xanh và có vòng cung vơi dần khi đang đếm.
    if (pad.btn && !pad.done && pad.active){
      const b = pad.btn;
      const du = pad.value >= pad.quota;
      const dang = !!pad.dap;
      c.beginPath();
      c.fillStyle = dang ? 'rgba(30,80,58,0.9)' : du ? 'rgba(24,58,44,0.8)' : 'rgba(30,34,38,0.7)';
      c.arc(b.x, b.y, b.r, 0, Math.PI*2); c.fill();
      c.beginPath();
      c.strokeStyle = dang ? 'rgba(150,240,190,0.95)' : du ? 'rgba(90,190,140,0.85)' : 'rgba(96,106,114,0.5)';
      c.lineWidth = dang ? 3 : 2;
      c.arc(b.x, b.y, b.r, 0, Math.PI*2); c.stroke();
      if (dang){
        const k = clamp((pad.countdown || 0) / EXTRACT_HOLD, 0, 1);
        c.beginPath(); c.strokeStyle = 'rgba(190,255,215,0.95)'; c.lineWidth = 3.4;
        c.arc(b.x, b.y, b.r + 4, -Math.PI/2, -Math.PI/2 + Math.PI*2*k); c.stroke();
      }
      wText(du ? 'ĐẠP ĐỂ GIAO' : 'CHƯA ĐỦ', b.x, b.y - b.r - 6,
            du ? '#a8f0c8' : '#7c858c', 10);
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
      wText('Đầu ' + (l.whoName || ''), l.x, y - l.r - 5, '#e6b8b0', 10);
      continue;
    }
    c.beginPath(); c.fillStyle = 'rgba(0,0,0,0.4)';
    c.ellipse(l.x, y + l.r*0.7, l.r*0.9, l.r*0.42, 0, 0, Math.PI*2); c.fill();
    // Co bo hinh do vat thi ve MON DO that; khong thi roi ve dang khoi tron cu.
    // Cai vong mau van ve trong ca hai truong hop, va no khong phai trang tri: mau noi
    // mon nay lam bang gi (gom vo de, kim loai khong vo) va ban kinh noi no to co nao —
    // hai thu quyet dinh vac gi va trach cai gi. Bo vong di la bo mat luat.
    const iconed = !l.good && !l.isBag && window.REPO_SKIN && REPO_SKIN.loot &&
                   REPO_SKIN.loot(c, { x:l.x, y:y, r:l.r, sizeIdx:l.sizeIdx, bob:l.bob });
    c.beginPath();
    if (!iconed){
      c.fillStyle = l.good ? (l.good.kind === 'up' ? '#d3a04a' : '#5aa3ab') : l.isBag ? '#c8a33c' : l.mat.col;
      c.arc(l.x, y, l.r, 0, Math.PI*2); c.fill();
    } else {
      c.arc(l.x, y, l.r, 0, Math.PI*2);
    }
    c.lineWidth = 2;
    c.strokeStyle = l.good ? (l.good.kind === 'up' ? '#8a6222' : '#2f6a71') : l.isBag ? '#8a6d1e' : l.mat.edge;
    c.stroke();
    if (l.good){
      // A price with no name on it is a number, not an offer.
      wText(l.good.name, l.x, y + l.r + 12, '#dfe6ea', 10);
    }
    for (let i=0;i<l.cracks;i++){
      c.beginPath(); c.strokeStyle = 'rgba(20,20,20,0.6)'; c.lineWidth = 1.2;
      const a = i*2.1 + l.bob;
      c.moveTo(l.x + Math.cos(a)*l.r*0.2, y + Math.sin(a)*l.r*0.2);
      c.lineTo(l.x + Math.cos(a+0.7)*l.r*0.9, y + Math.sin(a+0.7)*l.r*0.9);
      c.stroke();
    }
    // C3-8 step 2: the value must be visible or losing it reads as the game cheating
    wText(money(l.value), l.x, y - l.r - 5, l.value < l.value0 ? '#d98a7a' : '#e2e8ec', 11);
  }
}
// CÚ VUNG TAY, VẼ RA. Luật hai thì ở stepMonsters chỉ có nghĩa nếu người chơi NHÌN THẤY thì một —
// một cửa sổ né vô hình thì y hệt như không có cửa sổ nào.
//
// Vẽ trước thân, trong hệ toạ độ của con quái, và đọc theo tiến độ của chính cú vung: cánh tay
// ngoác ra sau rồi quật tới, cộng một vòng cung sáng dần ở đúng hướng nó nhắm. Vòng cung là thứ
// trả lời câu duy nhất người chơi cần trả lời trong 0.4 giây đó: nó đang nhắm về PHÍA NÀO.
// HAI CÁNH TAY, và chỉ con nào CHẠY LẠI ĐÁNH mới có. Chủ dự án, 2026-09-03: "quái nào chạy lại
// đánh vì vẽ thêm 2 cái tay ra, bức tượng thì không cần".
//
// Tay không phải đồ trang trí ở đây, nó là cái làm cho luật hai thì đọc được: một khối bóng phình
// ra rồi trừ máu thì vẫn là 'ủn vào là đau', chỉ chậm hơn. Có hai cánh tay đung đưa lúc đi, và một
// trong hai ngoác hẳn ra sau lúc vung, thì mắt đọc ra 'nó sắp đấm' trước khi cú đấm tới — mà đó
// đúng là toàn bộ mục đích của thì vung.
//
// Loài KHÔNG có tay: Bom con (`noMelee` — nó không đánh, nó tự nổ) và AEngel, tức bức tượng, vốn
// vẽ ở hàm riêng của nó chứ không đi qua đây.
function drawArms(c, m, d){
  const dai = (d.reach || FOE_REACH) * 0.50, day = 2.6;
  const tong = d.wind || FOE_WIND;
  const k = (m.swing || 0) > 0 ? clamp(1 - m.swing / tong, 0, 1) : -1;
  // đi thì hai tay đung đưa ngược pha nhau; đứng thì buông
  const du = Math.sin(m.wob * 2.2) * 0.42;
  c.save(); c.rotate((m.swing || 0) > 0 ? m.swingDir : m.dir);
  c.strokeStyle = (d && d.rim) || '#e8b9ad';
  c.lineCap = 'round'; c.lineWidth = day;
  for (const ben of [-1, 1]){
    let goc;
    if (k < 0) goc = ben*0.95 + du*ben;                 // đi bình thường
    else if (ben > 0) goc = k < 0.62 ? 0.95 + (k/0.62)*1.5      // tay thuận ngoác ra sau
                                     : 0.95 + 1.5 - ((k-0.62)/0.38)*2.9;   // rồi quật tới
    else goc = -0.95 - du*0.5;                          // tay kia giữ thăng bằng
    const vx = Math.cos(goc)*dai, vy = Math.sin(goc)*dai;
    c.beginPath();
    c.moveTo(1, ben*4.5 - 3);
    c.quadraticCurveTo(vx*0.55 + 1, ben*4.5 + vy*0.4 - 3, vx, vy*0.9 + ben*2.0 - 3);
    c.stroke();
    // bàn tay
    c.fillStyle = (d && d.rim) || '#e8b9ad';
    c.beginPath(); c.arc(vx, vy*0.9 + ben*2.0 - 3, day*0.78, 0, Math.PI*2); c.fill();
  }
  c.lineCap = 'butt';
  c.restore();
}
// Vòng cung báo hướng của cú vung. Nó trả lời câu duy nhất người chơi cần trả lời trong khoảnh
// khắc đó: nó đang nhắm về PHÍA NÀO — vì né là né sang bên, không phải né lùi.
function drawSwing(c, m, d){
  const tong = d.wind || FOE_WIND;
  const k = clamp(1 - m.swing / tong, 0, 1);         // 0 lúc mới ngoác, 1 lúc sắp giáng
  const tam = d.reach || FOE_REACH;
  c.save(); c.rotate(m.swingDir);
  c.strokeStyle = `rgba(255,${180 - k*90|0},${120 - k*80|0},${0.24 + k*0.52})`;
  c.lineWidth = 2 + k*2.6;
  c.beginPath(); c.arc(0, 0, tam*0.88, -0.8 + k*0.3, 0.8 + k*0.3); c.stroke();
  c.restore();
}
function drawMonsters(c){
  for (const m of S.monsters){
    const d = MONSTERS[m.type], s = Math.sin(m.wob)*1.5;
    const co = (d && d.body || FOE_BODY) / FOE_BODY;    // thân nhỏ thì vẽ nhỏ theo
    c.save(); c.translate(m.x, m.y);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0,9*co,10*co,4.5*co,0,0,Math.PI*2); c.fill();
    if ((m.swing || 0) > 0) drawSwing(c, m, d);
    // Tay chỉ mọc ra khi nó ĐANG LAO VÀO ĐÁNH, không mọc lúc đi tuần.
    //
    // Hai lý do, và lý do thứ hai mới là lý do thật. Một: mấy loài này đều có bộ hình pixel riêng
    // đã vẽ sẵn tay trong đó, nên gắn thêm một cặp tay vector suốt ngày là hai bộ tay chồng nhau.
    // Hai: cặp tay này là một TÍN HIỆU, không phải giải phẫu — nó có nghĩa 'con này đang tới lấy
    // mạng bạn'. Một tín hiệu bật suốt thì không còn là tín hiệu.
    const coTay = !d.noMelee && m.type !== 'rook' && (d.dmg || 0) > 0 &&
                  ((m.swing || 0) > 0 || m.state === 'chase');
    // MỆT thì thở dốc. Cùng lý do với cú vung: cửa sổ chạy thoát phải nhìn thấy được, nếu không
    // thì người chơi không bao giờ biết lúc nào nên bỏ chạy. Ba dấu chấm phập phồng trên đầu,
    // đậm dần theo m.tired, cộng cái thân chùng xuống một chút.
    if ((m.tired || 0) > 0.25){
      const t = (m.tired - 0.25) / 0.75;
      c.fillStyle = `rgba(210,225,235,${0.20 + t*0.42})`;
      for (let k = 0; k < 3; k++){
        const ph = Math.sin(S.time*5.5 + k*1.5) * 0.5 + 0.5;
        c.beginPath();
        c.arc(-6 + k*6, -20 - ph*3.5, 1.2 + ph*1.1, 0, Math.PI*2); c.fill();
      }
    }
    if (co !== 1) c.scale(co, co);
    if ((m.tired || 0) > 0.25) c.translate(0, (m.tired - 0.25) * 1.6);
    // Nhap trang mot nhip khi vua an don. Bot dong doi da co cai nay tu lau (a.hurt), con
    // quai thi khong - nen ban trung mot con quai la mot viec khong de lai dau vet gi tren
    // man hinh. Day la nua con lai cua bai "ban yeu + giay qua", nua kia la con so sat thuong.
    c.fillStyle = (m.flash || 0) > 0 ? '#ffe4d8' : d.col;
    // Co bo hinh pixel thi ve bang hinh (sprites.js), khong thi roi ve dang khoi cu.
    if (window.REPO_SKIN && REPO_SKIN.foe(c, m, d)){ if (coTay) drawArms(c, m, d); c.restore(); continue; }
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
    if (m.planted){
      // Đã áp sát và đang đếm ngược. Vòng nhấp nháy nhanh dần chính là cái đồng hồ, và nó vẽ đúng
      // bằng bán kính nổ chia bốn — đủ để nói 'đứng đây là dính' mà không che mất căn phòng.
      const ph = Math.sin(S.time * (m.fuse < 0.35 ? 34 : 18)) * 0.5 + 0.5;
      c.strokeStyle = `rgba(255,${120 + ph*90|0},60,${0.55 + ph*0.4})`;
      c.lineWidth = 1.6 + ph*1.4;
      c.beginPath(); c.arc(0, 0, 13 + ph*4, 0, Math.PI*2); c.stroke();
    }
    if (m.sleep > 0){
      c.strokeStyle = 'rgba(150,190,220,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-4,-9); c.lineTo(-1.6,-9); c.moveTo(1.6,-9); c.lineTo(4,-9); c.stroke();
      c.font = '600 10px ui-monospace, monospace'; c.fillStyle = 'rgba(160,200,230,0.9)';
      c.fillText('z', 6, -14);
    } else {
      c.fillStyle = m.state === 'chase' ? d.eye : 'rgba(190,170,150,0.9)';
      c.fillRect(-4.4,-9.4,3.2,3.2); c.fillRect(1.4,-9.4,3.2,3.2);
    }
    if (coTay) drawArms(c, m, d);
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
    for (let i = 0; i < 2; i++){
      const k = i ? 1 : -1;
      const hx = d.vertical ? d.x : d.x + k*DOOR_LEAF;
      const hy = d.vertical ? d.y + k*DOOR_LEAF : d.y;
      // shut = the leaf lies along the opening, reaching from its jamb to the middle
      const shut = d.vertical ? -k*(Math.PI/2) : (k > 0 ? Math.PI : 0);
      const a = shut + (jam ? 0 : -k*d.lside[i]*(Math.PI/2)*d.leaf[i]);
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
  const tien = Math.max((d.bash || 0)/DOOR_BASH_T, (d.pry || 0)/DOOR_PRY_HITS);
  if (tien > 0){
    const k = clamp(tien, 0, 1);
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
  // Tia laser: một vệt sáng đang tàn. Vẽ TRƯỚC đạn để mấy viên hoa cải nổi lên trên nó.
  if (S.beams) for (const bm of S.beams){
    const a = Math.max(0, 1 - bm.t/bm.life);
    const w = 2 + 7*bm.k;
    c.save();
    c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(120,220,255,${0.22*a})`; c.lineWidth = w*2.6;
    c.beginPath(); c.moveTo(bm.x0,bm.y0); c.lineTo(bm.x1,bm.y1); c.stroke();
    c.strokeStyle = `rgba(190,245,255,${0.75*a})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(bm.x0,bm.y0); c.lineTo(bm.x1,bm.y1); c.stroke();
    c.strokeStyle = `rgba(255,255,255,${0.9*a})`; c.lineWidth = Math.max(1, w*0.34);
    c.beginPath(); c.moveTo(bm.x0,bm.y0); c.lineTo(bm.x1,bm.y1); c.stroke();
    c.restore();
  }
  // Viên hoa cải nhỏ hơn và ngả đỏ: nhìn một cái là biết mình vừa bắn khẩu nào, và biết cái
  // nón đó với tới đâu — thứ duy nhất dạy được người chơi rằng khẩu này là khẩu SÁT MẶT.
  for (const b of S.bullets){
    c.fillStyle = b.kind === 'shot' ? '#ffb87a' : '#ffe9a8';
    c.beginPath(); c.arc(b.x, b.y, b.kind === 'shot' ? 1.8 : 2.6, 0, Math.PI*2); c.fill();
  }
  // VỤ NỔ. Trước đây là đúng một hình tròn phẳng nở ra rồi mờ đi — cùng một hình với vệt sáng,
  // với vòng highlight, với mọi thứ tròn khác trong game, nên nó không đọc ra là một vụ nổ. Bốn
  // lớp, mỗi lớp trả lời một câu: lõi trắng nói NÓ NỔ Ở ĐÂY, vòng xung kích nở nhanh hơn lõi nói
  // TỚI ĐÂU LÀ CÒN ĂN ĐÒN, mấy tia nói NÓ NỔ CHỨ KHÔNG PHẢI NỞ RA, và cái vệt khói ở lại sau khi
  // ba lớp kia tắt. Vẽ ở chế độ cộng sáng nên nó tự sáng, không bị lớp tối nhân xuống.
  // SEE: đàn bom + đàn gnome, 2026-08-31
  for (const b of S.bombs){
    if (b.done){
      const t = clamp((b.t-b.fuse)/0.6,0,1);
      const pow = b.pow || 1;
      const om = (1-t)*(1-t);
      c.save();
      c.globalCompositeOperation = 'lighter';
      // vòng xung kích: mỏng dần, chạy tới đúng bán kính sát thương rồi tắt
      const R = b.r*(0.25 + t*0.95);
      c.beginPath(); c.strokeStyle = `rgba(255,${210-t*130|0},${150-t*110|0},${0.75*om})`;
      c.lineWidth = Math.max(1, b.r*0.16*(1-t)); c.arc(b.x,b.y,R,0,Math.PI*2); c.stroke();
      // lõi: chậm hơn vòng, và trắng ở giữa
      const cg = c.createRadialGradient(b.x,b.y,0,b.x,b.y,Math.max(2,b.r*(0.16+t*0.5)));
      cg.addColorStop(0, `rgba(255,248,224,${0.9*om})`);
      cg.addColorStop(0.45, `rgba(255,186,88,${0.62*om})`);
      cg.addColorStop(1, 'rgba(210,90,40,0)');
      c.fillStyle = cg; c.fillRect(b.x-b.r, b.y-b.r, b.r*2, b.r*2);
      // tia: hạt bay ra, số tia theo sức nổ nên quả nhỏ trông ra quả nhỏ
      const tia = Math.round(7 + 6*pow);
      c.strokeStyle = `rgba(255,206,140,${0.8*om})`; c.lineWidth = 1.6;
      c.beginPath();
      for (let i=0;i<tia;i++){
        const a = (i/tia)*Math.PI*2 + (b.x+b.y)*0.017;   // lệch theo chỗ nổ, để hai quả không trùng
        const r0 = b.r*(0.30 + t*0.75), r1 = r0 + b.r*0.30*(1-t);
        c.moveTo(b.x+Math.cos(a)*r0, b.y+Math.sin(a)*r0);
        c.lineTo(b.x+Math.cos(a)*r1, b.y+Math.sin(a)*r1);
      }
      c.stroke();
      c.restore();
      // khói: lớp duy nhất KHÔNG cộng sáng, nên nó tối đi chứ không sáng lên
      c.beginPath(); c.fillStyle = `rgba(40,30,26,${0.30*t*(1-t)*4})`;
      c.arc(b.x,b.y,b.r*(0.5+t*0.7),0,Math.PI*2); c.fill();
    } else {
      // Ngòi đang cháy: chớp nhanh dần khi sắp hết, cùng nhịp với tiếng tick.
      const con = Math.max(0, b.fuse - b.t);
      const nhanh = con < 0.5 ? 16 : 8;
      c.beginPath(); c.fillStyle = (Math.floor(b.t*nhanh)%2) ? '#ffb45a' : '#3a2a26';
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
  // Hinh nguoi ve TRUOC khi xoay: no dung thang, huong nam o hang trong charset.
  // Den pin va cu vung thi van xoay theo dir - do la tin hieu choi, khong phai trang tri.
  const skin = window.REPO_SKIN && REPO_SKIN.crew(c, p, true);

  // Cái đèn: VỊ TRÍ chạy quanh người theo hướng nhìn, còn bản thân cái đèn thì luôn
  // DỰNG ĐỨNG. Vẽ nó sau `c.rotate` thì cả cái đèn bị quay theo, và nhìn xuống là cái
  // đèn nằm ngang dưới đất — nó là vật treo trong tay, không phải mũi tên chỉ hướng.
  // Cùng lý do hình người được vẽ trước khi xoay.
  const swp = (p.swingT || 0) / MELEE_T;
  const lampA = p.dir + (swp > 0 ? (-MELEE_HALF + (1 - swp) * MELEE_HALF * 2) * 0.85 : 0);
  const lampOk = window.REPO_SKIN && REPO_SKIN.lamp &&
    REPO_SKIN.lamp(c, Math.cos(lampA) * 10, Math.sin(lampA) * 10 - 3, 16, S.time);

  c.rotate(p.dir);
  if (!skin){
    c.fillStyle = '#cfcbb9'; c.beginPath(); c.arc(0,0,7,0,Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(18,20,18,0.85)'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#8d8873'; c.beginPath(); c.arc(3.6,0,3.3,0,Math.PI*2); c.fill();
  }
  // Cai den pin. Dang vung thi no van ra truoc mat theo cung cu danh.
  const sw = (p.swingT || 0) / MELEE_T;                     // 1 -> 0 trong suot cu vung
  if (sw > 0){
    const q = 1 - sw;                                       // 0 o dau cu vung
    const a = (-MELEE_HALF + q * MELEE_HALF * 2) * 0.85;
    if (!lampOk){
      c.save(); c.rotate(a);
      c.fillStyle = '#ffe6a8'; c.fillRect(6,-1.5,7,3);
      c.restore();
    }
    // Vet quet: mot cung sang mo dan, cho biet don vua di qua dau.
    c.globalAlpha = a0 * at.alpha * sw * 0.5;
    c.strokeStyle = 'rgba(255,232,180,0.9)'; c.lineWidth = 2.4;
    c.beginPath(); c.arc(0, 0, MELEE_R * 0.72, -MELEE_HALF, MELEE_HALF); c.stroke();
    c.globalAlpha = a0 * at.alpha;
  } else if (!lampOk){
    c.fillStyle = '#ffe6a8'; c.fillRect(6,-1.5,5,3);
  }
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

  drawPops(c); drawWorldText(c);
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
    // Vành sạc vẽ NGAY TRÊN CÁI NÚT ĐANG GIỮ, giống hệt cách vành thể lực bám nút Chạy và
    // vành hồi chiêu bám nút kỹ năng. Người chơi không phải nhìn đi đâu khác để biết đã đủ chưa.
    if (p.chargeSlot === i){
      const k = clamp((p.chargeT || 0) / LASER_FULL, 0, 1);
      c.beginPath();
      c.strokeStyle = k >= 1 ? 'rgba(190,245,255,0.95)' : 'rgba(120,200,235,0.8)';
      c.lineWidth = 3.5;
      c.arc(s.x, s.y, s.r + 5, -Math.PI/2, -Math.PI/2 + Math.PI*2*k);
      c.stroke();
      if (k >= 1){                                   // đầy rồi thì nói thành lời, đừng bắt đoán
        c.beginPath(); c.strokeStyle = 'rgba(190,245,255,0.35)'; c.lineWidth = 1.5;
        c.arc(s.x, s.y, s.r + 9 + Math.sin(S.time*9)*1.5, 0, Math.PI*2); c.stroke();
      }
    }
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
  const grabLabel = p.down ? 'Xem' : p.riding ? 'Xuống xe' : p.pushing ? 'Buông' : p.held ? 'Thả'
                   : (!near && nearestBike(p)) ? 'Lên xe'
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

  // Đánh thường. Vòng hồi chiêu vẽ ngay trên nút, cùng cách nút Chạy vẽ thanh thể lực và nút
  // Kỹ năng vẽ vòng hồi: con số quyết định bấm có ăn thua không thì vẽ lên chính cái được bấm.
  if (hud.melee && !S.shopMode && p){
    const mb = hud.melee;
    const cd = clamp(1 - (p.swingCd || 0) / MELEE_CD, 0, 1);
    const san = cd >= 1 && (p.stunT || 0) <= 0 && !p.riding;
    c.beginPath();
    c.fillStyle = san ? 'rgba(40,20,18,0.72)' : 'rgba(16,18,20,0.5)';
    c.arc(mb.x, mb.y, mb.r, 0, Math.PI*2); c.fill();
    if (cd < 1){
      c.beginPath(); c.strokeStyle = 'rgba(214,120,90,0.85)'; c.lineWidth = 3;
      c.arc(mb.x, mb.y, mb.r + 3, -Math.PI/2, -Math.PI/2 + Math.PI*2*cd); c.stroke();
    }
    ring(c, mb.x, mb.y, mb.r, san ? 'rgba(228,120,92,0.9)' : 'rgba(96,74,68,0.45)');
    c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = san ? '#ffd6c4' : '#6a6f74';
    c.fillText('Đánh', mb.x, mb.y+4);
  }

  // skill button — bản Biệt Đội mới có. Vành ngoài là đồng hồ hồi chiêu, vẽ ngay
  // trên chính cái nút phải bấm, giống hệt cách vành thể lực bám nút Chạy.
  if (hud.skill && !S.shopMode){
    const sk = hud.skill;
    const ready = !HOOKS.skill.ready || HOOKS.skill.ready();
    const cool = HOOKS.skill.cool ? clamp(HOOKS.skill.cool(), 0, 1) : 1;
    c.beginPath();
    c.fillStyle = ready ? 'rgba(46,32,58,0.82)' : 'rgba(16,18,20,0.55)';
    c.arc(sk.x, sk.y, sk.r, 0, Math.PI*2); c.fill();
    if (cool < 1){
      c.beginPath(); c.strokeStyle = 'rgba(166,120,216,0.85)'; c.lineWidth = 3;
      c.arc(sk.x, sk.y, sk.r + 3, -Math.PI/2, -Math.PI/2 + Math.PI*2*cool);
      c.stroke();
    }
    ring(c, sk.x, sk.y, sk.r, ready ? 'rgba(200,150,255,0.95)' : 'rgba(88,76,100,0.45)');
    c.textAlign = 'center';
    c.font = '600 ' + Math.round(sk.r*0.85) + 'px ui-sans-serif, system-ui';
    c.fillStyle = ready ? '#f0e2ff' : '#6a6f74';
    c.fillText(HOOKS.skill.icon || '✳', sk.x, sk.y + sk.r*0.18);
    c.font = '600 9px ui-sans-serif, system-ui';
    c.fillStyle = ready ? '#c9b3e0' : '#5a5f64';
    c.fillText(HOOKS.skill.label ? HOOKS.skill.label() : 'Kỹ năng', sk.x, sk.y + sk.r + 11);
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
  if ((p.recoilT || 0) > 0) badges.push('Giật ' + p.recoilT.toFixed(1) + 's');
  // Xăng là thứ quyết định còn đi được bao xa, nên nó phải nằm chỗ mắt đã nhìn sẵn.
  if (p.riding) badges.push(bikeDef(p.riding).name + ' ' +
    Math.round(p.riding.fuel / p.riding.fuelMax * 100) + '%');
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
  else if (S.levelDone && S.esc){ head = tick ? 'CHẠY ĐI' : 'CHẠY VỀ XE';
                                col = tick ? '#ffd2c4' : 'rgba(238,150,130,0.95)'; }
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

// VÒNG KHOÁ MỤC TIÊU — con nào sắp ăn viên đạn này.
// WHY nó đáng cả một hàm riêng: chủ dự án nói "cơ chế bắn hơi khó", và cái khó không nằm ở
// đường đạn — nó nằm ở chỗ người chơi KHÔNG BIẾT mình đang nhắm vào ai. Trên một màn hình
// điện thoại tối, giữa ba bốn cái bóng, một cú kéo cần 60px không nói được gì cả. Các game
// bắn di động giải đúng chuyện này bằng cách vẽ hẳn dấu lên con đang bị khoá, để người chơi
// đọc được mục tiêu TRƯỚC khi buông tay chứ không phải đoán sau khi đã mất một viên đạn.
// Nó vẽ trong toạ độ THẾ GIỚI, không phải toạ độ HUD — nên phải tự phục hồi phép biến đổi.
function drawLockOn(c, hud, p, slot, R){
  const it = p.inv[p.aimSlot];
  const kind = it && it.kind;
  if (!AIM_PROFILE[kind]) return;
  const dx = p.aimX - slot.x, dy = p.aimY - slot.y;
  const far = Math.hypot(dx, dy) > R*STICK_DEAD;
  const now = aimNow(p, kind, far, Math.atan2(dy, dx));
  const m = now.target;
  if (!m) return;
  // Vẽ trong KHÔNG GIAN HUD, không phải không gian thế giới: hàm này được gọi từ drawHud,
  // và scrX/scrY là đúng cặp đã có sẵn để đổi một điểm trong nhà sang chỗ nó nằm trên màn —
  // kèm cả rung màn hình, nên cái vòng không bị tách khỏi con quái mỗi lần bị đấm.
  const z = zoom();
  const mx = scrX(m.x), my = scrY(m.y);
  c.save();
  const r = (16 + Math.sin(S.time*7)*1.4) * z;
  c.strokeStyle = 'rgba(255,140,110,0.95)';
  c.lineWidth = 2.2;
  // bốn góc ngoặc, không phải một vòng tròn kín: vòng kín trùng với vòng sáng quanh quái
  for (let q = 0; q < 4; q++){
    const a0 = q*Math.PI/2 + 0.30, a1 = q*Math.PI/2 + Math.PI/2 - 0.30;
    c.beginPath(); c.arc(mx, my, r, a0, a1); c.stroke();
  }
  // vạch chỉ chỗ ĐÓN ĐẦU, để người chơi thấy vì sao nòng súng lại lệch khỏi thân con quái
  const prof = AIM_PROFILE[kind];
  const lp = leadPoint(p, m, prof.speed);
  if (Math.hypot(lp.x - m.x, lp.y - m.y) > 5){
    c.strokeStyle = 'rgba(255,180,120,0.55)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(mx, my); c.lineTo(scrX(lp.x), scrY(lp.y)); c.stroke();
    c.beginPath(); c.arc(scrX(lp.x), scrY(lp.y), 3.5*z, 0, Math.PI*2); c.stroke();
  }
  c.restore();
}

// A raised item, drawn the way a mobile MOBA draws a raised skill: a stick under the thumb that
// says which way, a line out of the CHARACTER that says where it lands, and one target in the far
// corner that says how to put it down again.
function drawAim(c, hud, p){
  const s = hud.slots[p.aimSlot];
  if (!s){ p.aimSlot = -1; p.aimId = -1; return; }   // xem chú thích ở nhánh pointerup
  const R = hud.aimR;
  drawLockOn(c, hud, p, s, R);
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

// ============================================================ chữ neo vào thế giới
//
// Chữ đi kèm một vật trong nhà — giá tiền món đồ, bình xăng chiếc xe, câu đồng đội vừa nói — luôn
// nằm PHÍA TRÊN cái vật đó, tức là trên đúng cái ô mà một căn nhà nhìn từ trên xuống thường có
// tường. Vẽ trong lớp thế giới thì nó đi qua phép nhân của lớp tối, mà đa giác tầm nhìn lại dừng
// ngay ở mặt tường — nên chữ bị nhân xuống gần đen dù cái vật mang nó thì đang sáng rõ.
// Cùng họ với lỗi "tường cắt ngang người" đã sửa hôm trước, và cùng nguyên nhân: thế giới vẽ từ
// trên xuống nhưng mọi thứ đều dựng LÊN từ chân.
//
// Nên gom lại rồi vẽ SAU, ở toạ độ màn hình, giống hệt cách các con số sát thương (drawPops) vẫn
// làm từ trước. Luật "phải thấy mới đọc được" không mất: từng chỗ gọi tự quyết định có nói hay
// không. Cái mất đi chỉ là việc một bức tường vô tình nằm sau chữ thì xoá mất chữ.
// SEE: chữ đừng để tường che, 2026-08-31
const worldText = [];
function wText(txt, x, y, col, size, box){
  worldText.push({ txt, x, y, col, size: size || 11, box: box || null });
}
function drawWorldText(c){
  for (const t of worldText){
    const x = scrX(t.x), y = scrY(t.y);
    c.font = '600 ' + t.size + 'px ui-monospace, monospace';
    c.textAlign = 'center';
    if (t.box){
      const w = c.measureText(t.txt).width + 12;
      c.fillStyle = t.box;
      c.fillRect(x - w/2, y - t.size, w, t.size + 5);
    } else {
      c.fillStyle = 'rgba(8,10,12,0.55)';
      c.fillText(t.txt, x + 1, y + 1);
    }
    c.fillStyle = t.col;
    c.fillText(t.txt, x, y);
    c.textAlign = 'left';
  }
  worldText.length = 0;
}
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
  const k = clamp(S.countdown / (S.countdownMax || EXTRACT_COUNTDOWN), 0, 1);
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
  c.fillText(S.countdownLabel || 'GIAO HÀNG', 0, -r*0.42);
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
    // Trên bệ rút hàng thì vẫn nhấc lại được CHỪNG NÀO bệ chưa chốt. Trước đây cấm hẳn ngoài shop,
    // nên đặt nhầm một món lên bệ là mất luôn phần chênh — mà cả ván chơi là bài toán xếp hàng cho
    // đủ chỉ tiêu với ít giá trị nhất. Bệ đã done thì thôi: tiền đã vào ví rồi.
    if (l.onPad && !S.shopMode && l.onPad.done) continue;
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
  const capH = hud.h * (big ? 0.8 : (hud.w > hud.h ? 0.22 : 0.34));
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
// DAU BUILD, nam TRONG chinh tep nay.
// WHY no ton tai: GitHub Pages tra Cache-Control: max-age=600 cho moi tep tinh. Nguoi choi mo
// game sau khi deploy van co the dang chay ban CU toi muoi phut, va khong co cach nao nhin ra
// dieu do tu trong tro choi - moi bao cao loi tu ho deu noi ve mot ban khac voi ban vua sua.
// Trang html khai `game.js?v=...`, nen neu HTML moi thi JS chac chan moi. Cai co the cu la
// chinh TRANG HTML. So DAU BUILD trong tep nay voi dau `?v=` tren the <script> la biet ngay:
// hai so khac nhau nghia la trinh duyet dang chay mot to HTML cu.
const BUILD = '20260903b';
function el(id){ return document.getElementById(id); }
let veilShownAt = -1e9, veilBornInTouch = false;
const VEIL_CLICK_GRACE = 900;      // ms: cửa sổ sự kiện chuột "tương thích" của một cú chạm
const GHOST_RADIUS = 28;           // px: bóng ma rơi đúng điểm ngón tay nhấc, không lệch đi đâu
// Một ngón tay MỚI đặt xuống ở bất kỳ đâu là người chơi đang bấm thật — bỏ chốt ngay lập tức.
// Bắt ở pha CAPTURE trên document để chắc chắn chạy trước cú click của chính ngón tay đó.
if (typeof document !== 'undefined'){
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') veilBornInTouch = false;
  }, true);
}
// Bấm vào KHOẢNG TRỐNG của một bảng thì đóng bảng — thói quen mà mọi app di động đều dạy.
// Chỉ những bảng KHÔNG mất mát gì mới được nhận nó: tủ đồ thì có, còn bảng kết ca thì không
// (bấm nhầm ra nền mà khởi động lại cả ván là một kiểu mất trắng khác).
// Gắn ĐÚNG MỘT lần, và chuyện đóng cái gì thì để một biến quyết định — gắn listener mới mỗi
// lần mở là cái lỗi cộng dồn vừa phải sửa ở lớp menu bản Biệt Đội.
let veilBackdrop = null;
function veilBackdropTarget(t){
  if (!t) return false;
  if (t.id === 'veil' || t.id === 'veilTitle' || t.id === 'veilBody' ||
      t.id === 'veilKeys' || t.id === 'veilExtra') return true;
  return !!(t.classList && t.classList.contains('veil-acts'));
}
if (typeof document !== 'undefined'){
  document.addEventListener('DOMContentLoaded', bindVeilBackdrop);
  if (document.readyState !== 'loading') bindVeilBackdrop();
}
let veilBackdropBound = false;
function bindVeilBackdrop(){
  if (veilBackdropBound) return;
  const v = el('veil');
  if (!v) return;
  veilBackdropBound = true;
  v.addEventListener('click', ev => {
    if (!veilBackdrop) return;
    if (!veilBackdropTarget(ev.target)) return;
    // Cùng một cái chốt bóng ma với nút bấm — xem chú thích ở showVeil().
    if (veilBornInTouch && performance.now() - veilShownAt < VEIL_CLICK_GRACE &&
        Math.hypot(ev.clientX - lastTouchX, ev.clientY - lastTouchY) < GHOST_RADIUS) return;
    veilBackdrop();
  });
}
function showVeil(title, body, btnText, onClick, extraHtml, onBackdrop){
  el('veilTitle').textContent = title;
  el('veilBody').textContent = body;
  el('veilExtra').innerHTML = extraHtml || '';
  el('veilKeys').style.display = extraHtml ? 'none' : '';
  // Bảng có danh sách thì bố cục đổi hẳn: hàng nút thành chân trang thật, danh sách là phần
  // duy nhất cuộn. Xem chú thích .veil.panel trong index.html.
  el('veil').classList.toggle('panel', !!extraHtml);
  // "Để bot chơi" CHỈ thuộc về màn tiêu đề, và màn tiêu đề không đi qua hàm này.
  // ROOT-CAUSE của bug "bấm nút thứ hai trên màn chết là đông cứng cả game": dòng cũ là
  //   `b2.hidden = !!extraHtml`, mà hai bảng kết ca (crewWiped / endLostShift) không truyền
  //   extraHtml — nên nút của MÀN TIÊU ĐỀ hiện lên trên MÀN CHẾT, vẫn mang nguyên cái đóng
  //   gói gán từ lúc khởi động: `S.running = true; hideVeil(); setBot(true)`. Nó không hề
  //   xoá S.dead, mà cổng của frame() là `S.running && !S.dead`. Đo thật: dead=true,
  //   running=true, tấm màn đã ẩn, S.time kẹt ở 0.35, giữ W 0,9 giây đi được 0px — thế giới
  //   đông cứng và trên màn hình không còn một cái nút nào để bấm.
  const b2 = el('veilBtn2');
  if (b2) b2.hidden = true;
  const b = el('veilBtn');
  b.textContent = btnText;
  // Một cú click là BÓNG MA của chính cú chạm vừa mở bảng này ra thì không phải là người chơi
  // bấm vào bảng. Nhưng phân biệt bằng THỜI GIAN là sai, và sai theo đúng cái kiểu đang đi sửa:
  // một khoảng ân hạn 900ms làm chính nút "Đóng tủ" chết trong 900ms đầu, nên ai chạm mở tủ rồi
  // chạm đóng ngay thì thấy "bảng hiện ra, bấm nút close có anim mà không tắt". Đo được: 202/552
  // ca của ma trận tủ hỏng đúng vì cái ân hạn đó.
  // Cái phân biệt đúng là CÚ CHẠM NÀO. Bóng ma là một bộ sự kiện CHUỘT tương thích: nó không
  // bao giờ có pointerdown kiểu 'touch' đi trước. Một cú chạm THẬT thì có. Nên hễ thấy một
  // pointerdown 'touch' mới ở bất kỳ đâu là bỏ chốt ngay — cú click theo sau nó là của người chơi.
  b.onclick = ev => {
    // Bóng ma rơi ĐÚNG chỗ ngón tay vừa nhấc lên. Một cú bấm thật ở chỗ khác thì cho qua —
    // kể cả khi nó tới ngay lập tức, và kể cả khi nó là chuột trên máy vừa dùng cảm ứng.
    // WHY thêm điều kiện toạ độ: bản đầu chỉ xét thời gian, và nó chặn luôn mọi cú bấm thật
    // trong 900ms — 202/552 ca của ma trận tủ hỏng vì đúng chuyện đó, với triệu chứng y hệt
    // cái đang đi sửa ("bấm Đóng tủ, có anim, mà không tắt").
    if (veilBornInTouch && ev && performance.now() - veilShownAt < VEIL_CLICK_GRACE &&
        Math.hypot(ev.clientX - lastTouchX, ev.clientY - lastTouchY) < GHOST_RADIUS) return;
    onClick();
  };
  veilShownAt = performance.now();
  veilBornInTouch = canvasTouchDown > 0;
  veilBackdrop = onBackdrop || null;
  bindVeilBackdrop();
  el('veil').hidden = false;
}
function hideVeil(){ veilBackdrop = null; const v = el('veil'); if (v) v.hidden = true; }

// ---------------------------------------------------------------------------
// BẢNG TRA — mặt con quái, và bên cạnh nó là cái luật của nó.
//
// Cả hai game dùng chung hàm này nhưng KHÔNG dùng chung bảng dữ liệu: Biệt Đội có
// SQ.FOES + SQ.CHARS (mỗi xác một chiêu), Ca Trực Đêm có MONSTERS + GEAR (không có
// chiêu, thứ tương đương là món đồ mua ở cửa hàng). Nên hàm này hỏi `window.SQ`
// trước rồi mới rơi về bảng của engine — cùng một nút, hai nội dung đúng.
//
// WHY dựng bằng HTML chứ không vẽ lên canvas: bảng này để ĐỌC, và chữ đọc được thì
// phải cuộn được, chọn được, tự xuống dòng theo bề ngang máy. Hạ tầng đó tấm màn
// #veilExtra đã có sẵn từ cái tủ đồ (showStash) — dựng lại nó trong canvas là tự
// viết lại bộ chữ của trình duyệt cho một màn hình không ai nhìn quá ba mươi giây.
const WIKI_SCALE = 0.5;                              // 96x144 -> 48x72
function wikiEsc(t){
  return String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Một ô hình: cắt ĐÚNG khung "đứng yên, quay mặt xuống" (cột giữa, hàng đầu) ra khỏi
// tấm charset 3x4 bằng background-position. Con nào chưa có hình thì không bỏ trống —
// vẽ tạm bằng chính hai màu con đó đang dùng trong game (thân + mắt), để hàng nào cũng
// có một cái mặt để nhắm vào, và để lúc art về thì chỗ cần thay là hiển nhiên.
function wikiFace(url, d){
  const K = (window.REPO_SKIN && REPO_SKIN.cell) || { w:96, h:144, cols:3, rows:4 };
  const w = Math.round(K.w * WIKI_SCALE), h = Math.round(K.h * WIKI_SCALE);
  if (url){
    return '<i class="wk-art" style="width:' + w + 'px;height:' + h + 'px;' +
           'background-image:url(' + wikiEsc(url) + ');' +
           'background-size:' + (w*K.cols) + 'px ' + (h*K.rows) + 'px;' +
           'background-position:-' + w + 'px 0"></i>';
  }
  const col = (d && d.col) || '#4a5566', eye = (d && d.eye) || '#ffd9a0',
        rim = (d && d.rim) || 'rgba(255,255,255,0.35)';
  return '<i class="wk-art wk-none" style="width:' + w + 'px;height:' + h + 'px;' +
         'background:' +
           'radial-gradient(circle at 37% 38%, ' + eye + ' 0 2.4px, transparent 2.6px),' +
           'radial-gradient(circle at 63% 38%, ' + eye + ' 0 2.4px, transparent 2.6px),' +
           col + ';border-color:' + rim + '"></i>';
}
// Đồ nghề KHÔNG có hình — trong game nó cũng chỉ là một ô chữ trên nút HUD (drawHud vẽ
// `def.short`). Nên bảng tra dùng đúng cái nhãn đó, không phải một cái icon bịa ra: thứ
// người chơi đọc ở đây phải là thứ họ sẽ thấy dưới ngón cái lúc cần dùng nó.
function wikiChip(txt){
  const K = (window.REPO_SKIN && REPO_SKIN.cell) || { w:96, h:144 };
  return '<i class="wk-art wk-chip" style="width:' + Math.round(K.w*WIKI_SCALE) + 'px;' +
         'height:' + Math.round(K.h*WIKI_SCALE) + 'px">' + wikiEsc(txt) + '</i>';
}
function wikiStat(k, v){
  return '<em>' + wikiEsc(k) + '</em>' + wikiEsc(v);
}
const wikiO = (n) => (n ? (Math.round(n*10)/10) + ' ô' : '—');
function wikiRow(face, ten, phu, stats, mo){
  return '<div class="wk-row">' + face + '<div class="wk-txt">' +
         '<b>' + wikiEsc(ten) + '</b>' + (phu ? '<span class="wk-sub">' + wikiEsc(phu) + '</span>' : '') +
         (stats ? '<div class="wk-st">' + stats + '</div>' : '') +
         '<p>' + wikiEsc(mo) + '</p></div></div>';
}
function wikiHtml(){
  const SK = window.REPO_SKIN, SQd = window.SQ;
  const url = (fn, id) => { try { return SK && SK[fn] ? SK[fn](id) : ''; } catch(e){ return ''; } };
  // Con nào THẬT SỰ có tấm hình trong kho. Hỏi thẳng thay vì đoán theo tên, vì hai game
  // có mã trùng tên mà khác con và sprites.js gắn lại một bảng riêng cho Biệt Đội.
  const CO_HINH = { patrol:1, listen:1, stalk:1, bomber:1, heavy:1, rook:1, angel:1,
                    crawler:1, quanca:1, bongden:1, hunter:1, nhen:1 };
  let h = '<div class="wk">';

  h += '<h3 class="wk-h">Trong nhà có gì</h3>';
  if (SQd && SQd.FOES){
    for (const k in SQd.FOES){
      const f = SQd.FOES[k];
      h += wikiRow(wikiFace(CO_HINH[k] ? url('foeUrl', k) : '', { col:f.color, eye:'#ffb46a' }),
        f.name, '',
        wikiStat('Máu', f.hp) + wikiStat('Đòn', f.dmg) + wikiStat('Chạy', f.spd) +
        wikiStat('Mắt', wikiO(f.sight)) + wikiStat('Tai', wikiO(f.hear)),
        f.desc || '');
    }
  } else {
    for (const k in MONSTERS){
      const d = MONSTERS[k];
      h += wikiRow(wikiFace(CO_HINH[k] ? url('foeUrl', k) : '', d),
        d.name, d.pack ? 'đi ' + d.pack + ' con một đàn' : '',
        wikiStat('Máu', d.hp) + wikiStat('Đòn', d.dmg) + wikiStat('Chạy', d.speed) +
        wikiStat('Mắt', wikiO(d.sight)) + wikiStat('Tai', wikiO(d.hear)) +
        (d.noLoot ? wikiStat('Rơi đồ', 'không') : ''),
        d.wiki || '');
    }
  }

  if (SQd && SQd.CHARS){
    h += '<h3 class="wk-h">Chiêu của từng xác</h3>';
    for (const ch of SQd.CHARS){
      h += wikiRow(wikiFace(url('crewUrl', ch.id), { col:'#3a4450' }),
        ch.skill.name, ch.name + ' — ' + ch.epithet,
        wikiStat('Hồi', ch.skill.cd + 's') +
        (ch.skill.dur ? wikiStat('Kéo dài', ch.skill.dur + 's') : '') +
        (ch.skill.radius ? wikiStat('Tầm', wikiO(ch.skill.radius)) : ''),
        ch.skill.desc + (ch.passive ? '  ⟡ ' + ch.passive.name + ': ' + ch.passive.desc : ''));
    }
  } else {
    // Ca Trực Đêm không có chiêu — thứ nằm đúng vị trí đó là món mua ở cửa hàng: cũng
    // một nút bấm, cũng có số lần dùng, cũng là quyết định "để dành hay xài bây giờ".
    h += '<h3 class="wk-h">Đồ nghề mua được</h3>';
    for (const g of GEAR){
      h += wikiRow(wikiChip(g.short),
        g.name, '',
        wikiStat('Giá', '$' + g.price.toLocaleString('vi-VN')) +
        wikiStat('Lần dùng', g.passive ? 'gắn luôn' : g.uses),
        g.desc);
    }
  }
  return h + '</div>';
}
let wikiWasRunning = false;
function showWiki(){
  // Đọc thì phải đọc yên. Bảng này bấm được GIỮA CA — khác cái tủ đồ vốn chỉ mở ở cửa
  // hàng — nên để thế giới chạy tiếp sau tấm màn là mời con quái tới ăn người đang đọc.
  wikiWasRunning = !!S.running;
  S.running = false;
  document.body.classList.add('wiki-open');   // xem chú thích body.wiki-open trong index.html
  showVeil('Sổ tay', 'Mặt của từng thứ trong nhà, và cái luật đi kèm nó.', 'Đóng sổ',
           closeWiki, wikiHtml(), closeWiki);
}
function closeWiki(){
  hideVeil();
  document.body.classList.remove('wiki-open');
  if (wikiWasRunning && !S.dead){ S.running = true; last = performance.now(); }
  wikiWasRunning = false;
}

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

// Chi so nguoi choi = NEN cua lop meta CONG phan nang cap mua trong ca.
// ROOT-CAUSE cua ban dau: hook chi duoc doc trong applyUpgrades(), ma ham do chi chay
//   dung MOT cho - quay thu ngan cua tram dich vu. buildLevel() thi moi tang dat lai
//   hpMax/str tu S.upg va khong hoi hook. Ket qua: xac nguoi choi luon la 100 mau /
//   30 suc bat ke cap, trang bi, tien hoa - yeu nhat trong chinh to cua minh, trong
//   khi bon con bot nhan du chi so meta.
// Va no GHI DE chu khong cong, nen nang cap mua trong ca bi xoa sach ngay sau do.
// Toc do di vao bang p.speedScale vi playerSpeed() tinh tu hang PLAYER_BASE_SPEED,
// khong bao gio doc p.speed - gan p.speed la gan vao hu khong.
function applyPlayerStats(){
  const p = S.player;
  if (!p) return;
  const info = (HOOKS.playerInfo && HOOKS.playerInfo()) || null;
  p.hpMax      = (info && info.hp  ? info.hp  : 100) + S.upg.hp*20;
  p.str        = (info && info.str ? info.str : 30)  + S.upg.str*10;
  p.stamMax    = STAM_MAX + S.upg.stam*10;
  p.speedScale = info && info.speed ? info.speed / PLAYER_BASE_SPEED : 1;
  if (info && info.charId) p.charId = info.charId;
  if (p.hp > p.hpMax) p.hp = p.hpMax;
}
function applyUpgrades(){
  const p = S.player;
  if (!p) return;
  applyPlayerStats();
  p.hp = p.hpMax; p.stam = p.stamMax;          // "+20 mau toi da, va hoi day ngay"
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
  // DUNG BANG TRUOC, DONG BANG THE GIOI SAU.
  // ROOT-CAUSE cua bug "toi man 4 map 2, tu do freeze lun, bam nut cung khong tat
  //   duoc": thu tu cu la stashOpen = true -> running = false -> showStash(). Neu
  //   showStash() nem loi thi HAI DONG DAU DA CHAY ROI ma tam man phu chua kip hien:
  //   the gioi dung hinh, khong co bang nao, va khong co cai nut nao de bam. Nguoi
  //   choi mat trang ca van, khong lam gi duoc ngoai tai lai trang.
  //   Do la mot loi TU KHOA: cai dong lam hong lai la cai dong ve ra loi thoat.
  // Dat theo thu tu nay thi mot cu ngoac o showStash() chi la mot dong bao loi, con
  //   ca truc van chay tiep.
  S.stashOpen = true;
  if (!renderStash()){ S.stashOpen = false; return; }
  S.running = false;
}

// Ve bang tu do, va KHONG BAO GIO nem loi ra ngoai. Tra false neu ve khong duoc.
function renderStash(warn){
  try { showStash(warn); return true; }
  catch (e) {
    console.error('Tủ đồ dựng không được:', e);
    // TRẢ LẠI ĐÚNG TRẠNG THÁI TRƯỚC KHI MỞ, không chỉ gỡ tấm màn. Bản cũ chỉ gọi hideVeil():
    // nếu cú ngoặc đến từ một lần VẼ LẠI (bấm một hàng trong tủ) thì lúc đó stashOpen đã true
    // và running đã false từ trước — gỡ màn xong là thế giới đứng hình mà không còn bảng nào.
    S.stashOpen = false;
    hideVeil();
    if (!S.dead) S.running = true;
    toast('Tủ đồ lỗi — ' + ((e && e.message) || 'không rõ') + '. Ca trực vẫn chạy tiếp.');
    return false;
  }
}
function closeStash(){
  S.stashOpen = false;
  hideVeil();
  if (!S.dead) S.running = true;
}
function showStash(warn){
  const p = S.player;
  // Moi lan lay mot mon la ca bang duoc dung lai tu dau, va cho cuon nhay ve dinh.
  // Voi mot tu 8 mon thi lay mon thu bay nghia la cuon xuong lai bay lan. Nho lay
  // cho cuon truoc khi ve, tra lai sau khi ve xong.
  // Phần CUỘN bây giờ là #veilExtra chứ không phải cả tấm màn — hàng nút đã thành chân trang
  // thật (xem .veil.panel trong index.html), nên chỗ hỏi chỗ cuộn cũng phải đổi theo.
  const box = el('veilExtra');
  const scr = (box && S.stashOpen) ? box.scrollTop : 0;
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
  // Mot mon ma bang do khong nhan ra thi VE NO RA, khong ngoac.
  // Truoc day dong nay la `GEAR_BY_KEY[it.kind].name` khong cho chan: mot mon la lam
  // ngoac ca ham, va vi toggleStash() da dong bang the gioi tu truoc nen ca van chet
  // theo. Mot mon hong khong duoc phep giet ca ca truc - no chi duoc phep la mot dong
  // xau trong danh sach, kem mot cai nut de vut no di.
  let laCount = 0;
  const stashRows = S.stash.map((it,i) => {
    const def = it && GEAR_BY_KEY[it.kind];
    if (!def){
      laCount++;
      return `<button class="gear" data-drop="${i}">
        <span class="t">Món hỏng${it && it.kind ? ' (' + String(it.kind).slice(0,24) + ')' : ''}</span>
        <span class="d">Bản game không nhận ra món này — dùng không được.</span>
        <span class="p">bấm để bỏ đi</span>
      </button>`;
    }
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
  const laRow = laCount
    ? `<div class="empty" style="color:#e0a35a;border-color:#5a4320">⚠ Có ${laCount} món trong tủ mà bản game này không nhận ra. Bấm vào để bỏ đi.</div>` : '';

  showVeil('Tủ đồ trên xe',
    'Về tới trạm là ba ô trên tay tự trả hết về tủ. Lấy lại đồ trước khi vào nhà; thứ để lại vẫn còn nguyên cho ca sau.',
    'Đóng tủ', closeStash,
    `<div class="wallet">Ví: ${money(S.wallet)}</div>
     ${warnRow}${laRow}
     <div class="seg">Ba ô trên tay${full ? ' — ĐÃ ĐẦY' : ''}</div><div class="shop">${slotRows}</div>
     <div class="seg">Trong tủ (${S.stash.length})</div><div class="shop">${stashRows}</div>`,
    closeStash);        // bấm ra khoảng trống cũng đóng — tủ đồ không mất gì khi đóng

  if (scr){ const b2 = el('veilExtra'); if (b2) b2.scrollTop = scr; }
  el('veilExtra').querySelectorAll('[data-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.slot;
      if (!p.inv[i]) return;
      S.stash.push(p.inv[i]); p.inv[i] = null;
      renderStash();
    });
  });
  el('veilExtra').querySelectorAll('[data-drop]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.drop;
      if (i >= 0 && i < S.stash.length) S.stash.splice(i, 1);
      renderStash();
    });
  });
  el('veilExtra').querySelectorAll('[data-stash]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.stash;
      const free = p.inv.findIndex(it => !it);
      if (free < 0){ renderStash('Ba ô trên tay đã đầy — bấm một ô ở trên để trả món đó về tủ, rồi lấy món này.'); return; }
      p.inv[free] = S.stash.splice(i,1)[0];
      renderStash();
    });
  });
}

// Sáu ô này nằm trong index.html, mà MỘT tệp game.js phục vụ HAI trang html được sửa độc lập.
// Xoá một cái span ở một trang là khung hình kế tiếp ném lỗi ngay trong vòng vẽ.
function setText(id, v){ const n = el(id); if (n) n.textContent = v; }
function updateBar(){
  setText('hLevel', S.shopMode ? 'Trạm' : S.level);
  const pad = S.pads[S.padIndex];
  const q = el('hQuota');
  if (!q){ setText('hWallet', money(S.wallet)); return; }
  if (S.shopMode){
    q.textContent = pad ? 'trên bệ ' + money(pad.value) : '—';
    q.classList.toggle('met', !!pad && pad.value > 0 && pad.value <= S.wallet);
  }
  else if (S.levelDone){ q.textContent = 'xong — về xe'; q.classList.add('met'); }
  else if (pad){ q.textContent = money(pad.value) + ' / ' + money(pad.quota); q.classList.toggle('met', pad.value >= pad.quota); }
  setText('hWallet', money(S.wallet));
  const p = S.player;
  setText('hCarry',
    p && p.pushing && S.cart ? ('xe đẩy · ' + S.cart.items.length + '/' + CART_SLOTS + ' · ' + money(cartValue(S.cart)))
    : p && p.held ? (p.held.size + ' · ' + money(p.held.value))
    : '—');
  setText('hPads', S.pads.filter(p=>p.done).length + '/' + S.pads.length);
  setText('hSeed', String(S.seed).padStart(6,'0'));
}

// ============================================================ chống đơ
// Một thế giới ĐANG DỪNG mà trên màn hình không có lấy một cái nút bấm được thì không còn là
// một màn hình chờ — nó là một cái bẫy. Chó canh chỉ hỏi đúng câu đó, mỗi nửa giây, và tự gỡ.
//
// Đây là tầng phòng thủ CUỐI CÙNG, không phải tầng đầu tiên: mọi lỗi cụ thể đều được vá ở
// đúng chỗ của nó. Cái này để bắt những lỗi chưa ai biết — vì một con bọ chưa biết mà làm
// người chơi mất trắng cả ca trực thì tệ hơn hẳn một con bọ chưa biết mà chỉ nhá lên một
// dòng chữ rồi chơi tiếp được.
const STUCK_SECONDS = 3;
let stuckT = 0, watchT = 0;
function veilUsable(){
  const v = el('veil');
  if (!v || v.hidden) return false;
  // Không chỉ hỏi thuộc tính `hidden`: bản Biệt Đội có luật CSS `body:not(.in-run) #veil
  // {display:none}`, nên tấm màn có thể "đang hiện" mà người chơi không nhìn thấy gì cả.
  if (getComputedStyle(v).display === 'none') return false;
  const b = el('veilBtn');
  return !!(b && !b.hidden && b.offsetParent !== null);
}
function pausedWithNoWayOut(){
  if (S.cut) return false;                                 // cảnh cắt tự nó sẽ kết thúc
  if (S.running && !S.dead) return false;                  // thế giới vẫn chạy
  if (HOOKS.menuMode && HOOKS.menuMode()) return false;    // đang ở menu: menu chính là lối ra
  return !veilUsable();
}
function unstick(why){
  console.warn('Gỡ kẹt:', why, { running:S.running, dead:S.dead, stashOpen:S.stashOpen });
  S.stashOpen = false;
  S.cut = null;
  resetInput();
  hideVeil();
  if (S.dead){
    if (HOOKS.onEngineError && HOOKS.onEngineError(new Error(why)) === true) return;
    showVeil('Ca trực đã kết thúc',
      'Ca này kết thúc mà màn hình không hiện lối ra nào. Bảng này chính là lối ra đó.',
      'Làm lại từ màn 1', () => { resetRun(); startLevel(); });
  } else {
    S.running = true;
    toast('Đã gỡ kẹt — ca trực chạy tiếp.');
  }
}
function watchdog(dt){
  watchT += dt;
  if (watchT < 0.5) return;                 // getComputedStyle mỗi khung hình thì quá đắt
  const step = watchT; watchT = 0;
  if (pausedWithNoWayOut()) stuckT += step; else stuckT = 0;
  if (stuckT >= STUCK_SECONDS){ stuckT = 0; unstick('thế giới dừng mà không có lối ra'); }
}

// ============================================================ loop
const FIXED = 1/60;
let acc = 0, last = 0, timeScale = 1;
let frameFail = 0;
// VÒNG VẼ KHÔNG BAO GIỜ ĐƯỢC PHÉP CHẾT.
// ROOT-CAUSE: bản cũ gọi requestAnimationFrame(frame) ở DÒNG CUỐI của frame() và không có
//   try/catch. Một lỗi ném ra ở bất kỳ đâu trong step()/draw()/updateBar() là vòng lặp không
//   bao giờ được lên lịch lại nữa: canvas đứng hình ở khung cuối, trong khi mọi nút DOM vẫn
//   còn hiệu ứng :active. Người chơi thấy đúng cái cảnh "bảng hiện ra, bấm nút close có
//   animation, mà không có gì xảy ra" — vì cái chạy được thì đã chết, còn cái chết rồi thì
//   vẫn nhúc nhích. Đặt lời gọi vào `finally` là biến một lỗi vĩnh viễn thành một khung hình
//   hỏng.
function frame(now){
  try { frameStep(now); frameFail = 0; }
  catch (e){
    frameFail++;
    if (frameFail === 1){
      console.error('Lỗi trong khung hình:', e);
      resetInput();                                  // nghi phạm số một: một cử chỉ nửa vời
    }
    if (frameFail >= 8){                             // vẫn hỏng liên tục -> dừng hẳn, bày lối ra
      frameFail = 0;
      S.running = false; S.stashOpen = false; S.cut = null;
      hideVeil();
      if (!(HOOKS.onEngineError && HOOKS.onEngineError(e) === true)){
        showVeil('Ca trực vấp phải lỗi',
          'Bộ máy vấp một lỗi và tự dừng lại để bạn không bị kẹt: ' + ((e && e.message) || 'không rõ') + '.',
          'Làm lại từ màn 1', () => { resetRun(); startLevel(); });
      }
    }
  }
  finally { requestAnimationFrame(frame); }
}
function frameStep(now){
  const dt = Math.min(0.25, (now-last)/1000); last = now;
  const cv = CV();
  // offsetWidth/Height, KHÔNG phải getBoundingClientRect().
  // ROOT-CAUSE của "iPhone nằm ngang thì không đi được": ở chế độ xoay tay (body.force-land)
  // cả vỏ game bị CSS quay 90°, nên hộp bao mà getBoundingClientRect() trả về có chiều rộng
  // và chiều cao ĐỔI CHỖ cho nhau. resize() thì đo bằng offsetWidth (kích thước bố cục, không
  // bị transform đụng tới) — nên hai bên không bao giờ khớp, dòng này thấy "kích thước vừa
  // đổi" ở MỌI khung hình, và resize() chạy 60 lần một giây. resize() mở đầu bằng
  // cancelGestures(), tức là cần gạt trái bị xoá đúng 60 lần một giây: ngón tay vẫn nằm trên
  // màn hình mà nhân vật không nhúc nhích một bước nào. Chỉ hỏng ở màn hình ngang, vì chỉ ở
  // đó mới có phép quay.
  const w0 = cv.offsetWidth, h0 = cv.offsetHeight;
  if (w0 && (cv.width !== Math.round(w0*dpr) || cv.height !== Math.round(h0*dpr))) resize();
  stepCut(dt);                     // real time: a cutscene is not part of the simulation
  watchdog(dt);
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
}

// ============================================================ boot
window.__boot = function(){
  setupInput();
  resize();
  addEventListener('resize', resize);
  // The frame's height changes when the page chrome wraps, and that fires no window resize event.
  if (window.ResizeObserver){
    const box = CV().parentElement;
    // Dồn vào khung hình kế tiếp thay vì đo lại ngay trong lượt gọi của observer.
    // resize() ghi lại kích thước canvas, mà ghi ngay bên trong lượt gọi là trình duyệt phải
    // bố cục lại lần nữa trong cùng một khung — nó nhả ra "ResizeObserver loop completed with
    // undelivered notifications". Đó chỉ là một lời cảnh báo, nhưng nó vào thẳng console.error
    // và trộn lẫn với những lỗi thật, nên mọi bộ dò lỗi đều phải học cách bỏ qua nó.
    let cho = 0;
    if (box) new ResizeObserver(() => {
      if (cho) return;
      cho = requestAnimationFrame(() => { cho = 0; resize(); });
    }).observe(box);
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
  // Nút sổ tay nằm trên THANH TRÊN chứ không trong HUD canvas: HUD đã chật, và mọi
  // toạ độ trong đó đang bị hudGeomSuite/rotateSuite đo từng pixel. Một nút để đọc
  // không đáng phải chen vào chỗ ngón cái đang bận.
  { const w = el('wikiBtn'); if (w) w.onclick = showWiki; }

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
  BUILD,
  S, TILE, MW, MH, RW, RH, GX, GY, WPX, HPX,
  solidAt, losClear, hitsSolid, money, clamp, angDiff,
  pickUp, dropHeld, useSlot, playerSpeed, grabRange, nearestLoot,
  startLevel, setBot, resetRun,
  damageLoot,
  UPGRADES, GEAR, GEAR_BY_KEY, UPGRADE_MAX_SPAWNS, CART_SLOTS, CART_MAX_VALUE,
  grabCart, releaseCart, cartValue, cartLoad, cartFits, nearTruck, hasGear,
  // xe máy
  BIKE_KINDS, makeBike, mountBike, dismountBike, nearestBike, bikeDef, bikeValue, bikeFits,
  BIKE_RAM_MIN, BIKE_CRASH_SPD, BIKE_PUSH_SPEED, GEAR, CART_MAX_VALUE,
  bikes(){ return (S.bikes || []).map(b => ({
    kind:b.kind, x:b.x, y:b.y, dir:b.dir, spd:b.spd, fuel:b.fuel, fuelMax:b.fuelMax,
    items:b.items.length, value:bikeValue(b), riding: !!b.rider, downed:b.downed })); },
  riding(){ const p = S.player; return p && p.riding ? p.riding.kind : null; },
  toggleStash, rollShop, startShop, leaveShop, togglePay, testHeld,
  TRUCK_BOARD_T, TRUCK_BOARD_R, inTruck,
  boarding(){ return { t: +(S.board || 0).toFixed(2), of: TRUCK_BOARD_T,
                       show: !!S.countdownActive, label: S.countdownLabel }; },
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
  // súng: bộ test phải đo được đón đầu, trợ ngắm và cái giật, chứ không chỉ nhìn máu tụt
  autoAimAngle, aimAssist, aimTargets, leadPoint, pierceCount, fireShotgun, fireLaser, aimNow,
  AIM_ASSIST_ARC, LASER_FULL, SHOTGUN_PELLETS, SHOTGUN_RECOIL,
  beams(){ return (S.beams || []).map(b => ({ x0:b.x0, y0:b.y0, x1:b.x1, y1:b.y1, k:b.k })); },
  // Vet sang cua tia chi song 0,2 giay, nen "dem tia dang bay" la mot cach do rat de truot.
  // Cai bo test can biet la PHAT BAN CO XAY RA KHONG va SAC DUOC BAO NHIEU — hoi thang.
  lastLaser(){ return S.lastLaser || null; },
  charge(){ const p = S.player; return p ? { slot: p.chargeSlot, t: p.chargeT } : null; },
  recoil(){ const p = S.player; return p ? (p.recoilT || 0) : 0; },
  cut(){ return S.cut ? { kind:S.cut.kind, t:S.cut.t, label:S.cut.label } : null; },
  skipCut, cancelCut, setCutscenes,
  // chống đơ — lớp ngoài và bộ test đều cần nhìn thấy chúng
  resetInput, cancelGestures, closeStash, unstick,
  stuck(){ return { paused: pausedWithNoWayOut(), veilUsable: veilUsable(), forSec: stuckT }; },
  carDrawOffset, playerDrawPos,
  // Một điểm trong nhà nằm ở đâu trên khung vẽ (tính bằng pixel THẬT của canvas, đã
  // nhân dpr). Bộ test cần nó để soi đúng ô người chơi đang đứng: camera bị chặn ở rìa
  // bản đồ nên "người chơi luôn ở giữa màn" là sai, và đo nhầm ô thì đo ra sàn tối.
  screenOf(x, y){ return { x: scrX(x)*dpr, y: scrY(y)*dpr }; },
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
  spawnAngel, litByTorch, spawnAnchor, breakMirror,
  // tổ ba người
  crew, crewAlive, downActor, reviveFromPad, truckPatchUp, spawnCrew, viewer, cycleSpectate,
  CREW: { COUNT:MATE_COUNT, HP:MATE_HP, SPEED:MATE_SPEED, FLEE_R:MATE_FLEE_R,
          REVIVE_HP:REVIVE_HP, TRUCK_HP:TRUCK_PATCH_HP, HEAD_MASS:HEAD_MASS },
  chatter(){ return (S.mates || []).filter(a => a.bubble)
                                   .map(a => ({ id:a.id, name:a.name, say:a.bubble })); },
  mates(){ return (S.mates || []).map(a => ({ id:a.id, name:a.name, x:a.x, y:a.y, hp:a.hp,
             hpMax:a.hpMax, down:a.down, job:a.job, held: a.held ? (a.held.isHead ? 'head' : 'loot') : null,
             riding: a.riding ? a.riding.kind : null, pushing: !!a.pushing,
             target: a.target ? { x:a.target.x, y:a.target.y, isHead: !!a.target.isHead } : null })); },
  heads(){ return S.loot.filter(l => l.isHead && !l.gone).map(l => ({
             who:l.who, whoName:l.whoName, x:l.x, y:l.y, held:!!l.held,
             onPad:!!l.onPad, inCart:!!l.inCart, value:l.value })); },
  setCrew(on){ S.crewOn = !!on; if (!on) S.mates = []; else if (!S.mates.length) spawnCrew(); },
  hooks: HOOKS,
  spawnCrew, crew, hudLayout, finishLevel, startShop, buildLevel, resetRun,
  toast, makeNoise, hitsSolid, killMonster,
  // Mấy hàm dưới đây là những nguyên thuỷ mà tầng kỹ năng của bản Biệt Đội cần.
  // Đặt tên theo đúng việc chúng làm, thay vì bắt lớp ngoài chọc vào ruột bộ máy.
  hurtFoe(m, n){ if (!m || m.hp <= 0) return false; foeHit(m, n, null, 0);
                 if (m.hp <= 0){ killMonster(m); return true; } return false; },
  reviveActor(a){
    if (!a || !a.down) return false;
    // Do day thi CAI DAU phai bien mat khoi san, y nhu reviveFromPad lam.
    // ROOT-CAUSE: ban dau chi go co `down`. Dau van nam trong S.loot, ma
    //   mateChooseJob() xep dau la uu tien so MOT - nen sau mot lan Keo Ve hoac
    //   Thien Than, ca to bot bo chi tieu di khuan dau cua nguoi dang dung canh minh.
    clearHeadOf(a);
    a.down = false; a.hp = REVIVE_HP; a.hurt = 0;
    S.revives = (S.revives || 0) + 1;
    if (a === S.player) S.spectate = -1;
    return true;
  },
  // Cac cong tac cua BO MAY cho lop ky nang dung. Truoc day squad.js tu gan m.stun /
  // m.slow / p.invisT - toan truong bia, khong ai doc. Hieu ung phai do chinh bo may
  // dinh nghia thi moi co that.
  foeSleep(m, t){ if (!m || m.hp <= 0) return false;
                  m.sleep = Math.max(m.sleep || 0, t); m.alert = 0; m.state = 'sleep';
                  m.tx = null; m.ty = null; return true; },
  foeSlow(m, t){ if (!m || m.hp <= 0) return false;
                 m.slowT = Math.max(m.slowT || 0, t); m.vulnT = Math.max(m.vulnT || 0, t);
                 return true; },
  foeDeafen(m, t){ if (!m || m.hp <= 0) return false;
                   m.deafT = Math.max(m.deafT || 0, t); return true; },
  foeKnock(m, ang, force){ if (!m || m.hp <= 0) return false;
                           m.kx = (m.kx || 0) + Math.cos(ang) * force;
                           m.ky = (m.ky || 0) + Math.sin(ang) * force; return true; },
  deliverLoot(l, pad){
    // Giao mot mon LEN BE that su: vao danh sach cua be va tinh lai gia tri.
    // Chi doi toa do mon do (nhu ban dau cua Keo Do lam) thi chi tieu khong nhuc nhich.
    if (!l || l.gone || l.onPad) return false;
    const P = pad || S.pads[S.padIndex];
    if (!P) return false;
    if (l.inCart){ const i = S.cart ? S.cart.items.indexOf(l) : -1; if (i >= 0) S.cart.items.splice(i,1); l.inCart = false; }
    for (const a of crew()) if (a && a.held === l) a.held = null;
    l.x = P.x + (Math.random()-0.5) * TILE * 0.8;
    l.y = P.y + (Math.random()-0.5) * TILE * 0.8;
    l.onPad = P; P.placed.push(l); recomputePad(P);
    return true;
  },
  breakDoorAt(d){ return d ? breakDoor(d, 'skill') : false; },
  revealAll(){ for (let i = 0; i < S.explored.length; i++) S.explored[i] = 1;
               prerenderMinimap(); },
  padOpen(){ return S.pads[S.padIndex] || null; },
  moveFoe(m, dx, dy){ if (m) moveEnt(m, dx, dy, 9); },
  killMate(i){ const a = (S.mates||[])[i]; if (a) downActor(a); return !!a; },
  killPlayer(){ downActor(S.player); return true; },
  toggleSprint,
  meleeSwing, meleeTarget,
  foesAll,
  mirrorFoe(){ return (S.mirror && S.mirror.m) || null; },
  HIT_MAX_FRAC, FOE_DMG_PER_LEVEL, foeDmgScale, hurtPlayer,
  MELEE: { R: MELEE_R, HALF: MELEE_HALF, CD: MELEE_CD, KNOCK: MELEE_KNOCK,
           STR: MELEE_STR, SNAP: MELEE_SNAP_R, STAM: MELEE_STAM,
           TIRED_DMG: MELEE_TIRED_DMG, TIRED_CD: MELEE_TIRED_CD },
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
  respawns(){ return (S.respawns || []).map(r => ({ type:r.type, t:r.t, wave:!!r.wave })); },
  PACK_KINDS, ESC_RESPAWN, ESC_DELAY, ESC_HORN_N, ESC_HORN_T, ESC_PING_0, ESC_PING_UP,
  ESC_PING_MAX, ESC_DARK, startEscape, escWaveBodies, escKinds, memGlow, escSpot, ESC_SPOT_LO, ESC_SPOT_HI, ESC_WAVE_MIN, ESC_WAVE_MAX,
  escape(){ const e = S.esc; return e ? { t:+e.t.toFixed(2), horns:e.horns,
    ping:+e.ping.toFixed(2), gap:e.gap, dark:+e.dark.toFixed(2) } : null; },
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
  // castFx cho hinh, fxShake/fxFlash cho cai rung va cai loe ca man. Ba thu nay truoc gio
  // nam trong engine ma khong mo ra, nen lop ky nang cua Biet Doi khong co cach nao noi
  // chuyen bang hinh anh - no chi doi duoc trang thai roi in mot dong chu.
  castFx, CAST_T, fxShake, fxFlash, fxPop,
  showWiki, closeWiki, wikiHtml,
  casts(){ return (S.casts || []).map(f => ({ kind:f.kind, x:f.x, y:f.y, r:f.r, t:+f.t.toFixed(2) })); },
  FOES_FROM_LEVEL, FOES_MAX, PUSH_R,
  FOE: { STANDOFF:FOE_STANDOFF, SEP_R:FOE_SEP_R, SEP_PUSH:FOE_SEP_PUSH, BODY:FOE_BODY },
  doors(){ return (S.doors || []).map(d => ({ x:d.x, y:d.y, gx:d.gx, gy:d.gy, open:d.open,
                                              vertical:d.vertical, locked:!!d.locked,
                                              broken:!!d.broken, bash:d.bash })); },
  DOOR: { REACH:DOOR_REACH, SLAM:DOOR_SLAM, SWING:DOOR_SWING, DRAG:DOOR_DRAG,
          HOLD:DOOR_HOLD, SAG_T:DOOR_SAG_T, THICK:DOOR_THICK,
          SPAN:DOOR_SPAN, LEAF:DOOR_LEAF, LOCK_FRAC:DOOR_LOCK_FRAC, LOCK_LEVEL:DOOR_LOCK_LEVEL,
          BASH_T:DOOR_BASH_T, PRY_REACH:PRY_REACH,
          PRY_HITS:DOOR_PRY_HITS, PRY_R:DOOR_PRY_R },
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
