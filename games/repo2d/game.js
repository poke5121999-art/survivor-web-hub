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
const ZOOM = 1.55;

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
    '#..T.L.........L.T..#',
    '#..TT...........TT..#',
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
    '#...................#',
    '#....CCC.M.CCC......#',
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
    '#...P...........P...#',
    '#...P...........P...#',
    '#.........M.........#',
    '#...P...........P...#',
    '#...P...........P...#',
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
// input defaults to no". Dash is the one exception and it costs no button — it fires on
// a double-tap of the run input, which already exists.
const UPGRADE_MAX_SPAWNS = 3;      // an upgrade may be ROLLED into the shop at most 3 times
const SHOP_UPGRADE_SLOTS = 3;
const SHOP_GEAR_SLOTS    = 3;

const UPGRADES = [
  { key:'hp',     name:'Nâng máu',        desc:'+20 máu tối đa, và hồi đầy ngay.',                     base: 6000 },
  { key:'stam',   name:'Nâng thể lực',    desc:'+10 thể lực, chạy được lâu hơn.',                      base: 2000 },
  { key:'str',    name:'Nâng sức',        desc:'+10 sức. Cùng món đồ đó sẽ nhẹ đi tương đối.',          base: 6000 },
  { key:'range',  name:'Nâng tầm với',    desc:'Nhặt được đồ từ xa hơn.',                              base: 6000 },
  { key:'sprint', name:'Nâng tốc độ chạy',desc:'Chạy nhanh hơn 20%. Chỉ có tác dụng khi đang chạy.',    base: 6000 },
  { key:'dash',   name:'Lướt né',         desc:'Nhấn đúp hướng chạy để lướt một đoạn. Tốn thể lực.',    base: 12000 },
  { key:'push',   name:'Đẩy',             desc:'Va vào quái thì hất nó ra thay vì đứng chịu trận.',     base: 4500 },
  { key:'regen',  name:'Hồi thể lực nhanh',desc:'Đứng im hồi thể lực nhanh hơn hẳn.',                   base: 3000 },
  { key:'light',  name:'Nâng đèn',        desc:'Nón nhìn dài và rộng hơn.',                            base: 5000 },
  { key:'grip',   name:'Găng chống sốc',  desc:'Đồ bạn đang vác chịu va đập tốt hơn 25%.',             base: 7000 }
];

// Gear = the source game's "Items". Bought gear goes into the TRUCK STASH, not straight
// into your hands, and survives every later level until it is used up. `stock` is how many
// times it may be bought in one run; at that point it stops being offered at all.
const GEAR = [
  { key:'gun',     name:'Súng lục',        short:'Súng', desc:'Bắn thẳng theo hướng kéo. 6 viên.',                    uses:6, price: 9000,  stock:4 },
  { key:'tranq',   name:'Súng gây mê',     short:'Mê',   desc:'Không giết, nhưng ru con quái trúng đạn ngủ 12 giây.', uses:3, price: 12000, stock:3 },
  { key:'bomb',    name:'Lựu đạn',         short:'Bom',  desc:'Ném ra, nổ sau 1,4 giây. Nổ gần đồ là mất tiền.',      uses:2, price: 7000,  stock:5 },
  { key:'heal',    name:'Băng cứu thương', short:'Máu',  desc:'Hồi 45 máu ngay lập tức.',                             uses:2, price: 4500,  stock:6 },
  { key:'tracker', name:'Máy dò bệ',       short:'Dò',   desc:'Vẽ đường tới bệ đang mở, và hiện cả những bệ chưa mở.',uses:1, price: 6000,  stock:2, passive:true },
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
const CART_IMPACT_ABSORB = 0.45;   // a slam into a wall reaches the contents this much reduced
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
    aimSlot: -1, aimX: 0, aimY: 0, cooldown: 0,
    pushing: false, dashT: 0, dashCd: 0, runTapT: 0, wasRun: false,
    floatT: 0, shieldT: 0
  };
}

const solidAt = (gx,gy) => (gx<0||gy<0||gx>=MW||gy>=MH) ? true : S.grid[gy*MW+gx] !== FLOOR;

// ============================================================ world generation
function buildLevel(seed){
  S.seed = seed;
  const rnd = mulberry32(seed);
  S.grid = new Uint8Array(MW*MH);
  S.explored = new Uint8Array(MW*MH);
  S.rooms = []; S.loot = []; S.monsters = []; S.pads = [];
  S.bullets = []; S.bombs = []; S.corpses = [];
  S.padIndex = 0; S.countdown = 0; S.countdownActive = false;
  S.levelDone = false; S.dead = false; S.hurtLog = [];

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
  const carve = (gx,gy) => { if (gx>0&&gy>0&&gx<MW-1&&gy<MH-1) S.grid[gy*MW+gx] = FLOOR; };
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

  let reach = flood(cgx, cgy);
  for (let pass=0; pass<2; pass++){
    let repaired = false;
    for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
      let n = 0;
      for (let y=cy*RH; y<(cy+1)*RH; y++) for (let x=cx*RW; x<(cx+1)*RW; x++) if (reach[y*MW+x]) n++;
      if (n < 14){
        repaired = true;
        const my = cy*RH+(RH>>1), mx = cx*RW+(RW>>1);
        for (let x=cx*RW+1; x<(cx+1)*RW-1; x++) carve(x,my);
        for (let y=cy*RH+1; y<(cy+1)*RH-1; y++) carve(mx,y);
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
    const ms = monSpots.filter(s => reach[s.gy*MW+s.gx] && Math.hypot((s.gx+0.5)*TILE-S.car.x,(s.gy+0.5)*TILE-S.car.y) > 12*TILE);
    for (let i=ms.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [ms[i],ms[j]]=[ms[j],ms[i]]; }
    const n = Math.min(ms.length, 1 + Math.ceil(S.level/2));
    for (let i=0;i<n;i++){
      const type = pool[(rnd()*pool.length)|0];
      S.monsters.push(makeMonster(type, (ms[i].gx+0.5)*TILE, (ms[i].gy+0.5)*TILE));
    }
  }

  S.player = S.player ? Object.assign(S.player, { x:S.car.x, y:S.car.y+TILE*2, held:null, hurt:0 }) : newPlayer();
  S.player.x = S.car.x; S.player.y = S.car.y + TILE*2;
  S.player.hpMax = 100 + S.upg.hp*20;
  S.player.stamMax = STAM_MAX + S.upg.stam*10;
  S.player.str = 30 + S.upg.str*10;
  S.player.hp = S.player.hpMax; S.player.stam = S.player.stamMax;
  S.player.held = null; S.player.aimSlot = -1;
  S.player.pushing = false; S.player.floatT = 0; S.player.shieldT = 0;
  S.player.dashT = 0; S.player.dashCd = 0; S.player.runTapT = 0; S.player.wasRun = false;
  S.stashOpen = false;

  // The cart is not something you buy and not something you bring home: the source game
  // respawns one at the truck at the start of every level, and it never has to come back.
  S.cart = makeCart(S.car.x + TILE*2.6, S.car.y + TILE*0.4);

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
           sleep:0, kx:0, ky:0 };
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

function carriedWeight(p){
  if (p.floatT > 0) return 0;                       // anti-gravity flask: weightless, briefly
  if (p.pushing && S.cart){
    // Wheels are the whole point of a cart: the same mass costs a fraction of what it costs
    // in your arms, which is what makes a full cart better than four trips.
    const w = (CART_MASS + cartLoad(S.cart)) / CART_EFFICIENCY;
    return S.cart.mode === 'weak' ? w / CART_WEAK_MUL : w;
  }
  return p.held ? p.held.mass : 0;
}
function playerSpeed(p){
  // Doc A2-1: weight belongs in the DENOMINATOR. The original formula multiplied by it,
  // which made an empty-handed player stand still and a loaded one sprint.
  const s = PLAYER_BASE_SPEED / (1 + carriedWeight(p) / p.str);
  return Math.max(s, PLAYER_BASE_SPEED * SPEED_FLOOR);
}
function turnRate(p){
  const t = 1 / (1 + carriedWeight(p) / (p.str*1.1));
  return Math.max(t, TURN_FLOOR);
}
function coneRadius(p){
  const base = CONE_R * (1 + S.upg.light*0.16);
  return base * Math.max(0.42, 1 - carriedWeight(p) / (p.str*1.6));
}
function coneHalf(p){ return CONE_HALF * (1 + S.upg.light*0.08); }
function grabRange(p){ return (1.9 + S.upg.range*0.55) * TILE; }

// ============================================================ loot damage
// Doc C3-2, the rule no guide states: damage comes from STOPPING SUDDENLY, not from touching.
// The input is the change in velocity, so dragging along a wall is free and slamming into one is not.
function damageLoot(l, impulse){
  if (l.gone) return 0;
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
  if (l.value <= 0){ l.gone = true; l.held = false; if (S.player.held === l) S.player.held = null; toast('Vỡ mất ' + money(before)); }
  return before - l.value;
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
    // A cart absorbs part of a crash, but it does not make the load safe — running a full
    // cart into a doorframe still costs money, which is what keeps it a trade-off.
    if (impulse > 0){
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
  let best = null, bd = grabRange(p);
  for (const l of S.loot){
    if (l.gone || l.held || l.onPad || l.inCart) continue;
    const d = Math.hypot(l.x-p.x, l.y-p.y);
    if (d < bd){ bd = d; best = l; }          // doc: nearest within range wins
  }
  if (!best) return grabCart(p);              // nothing to pick up: take the cart handle
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

    if (detects){ m.alert = 2.6; m.tx = p.x; m.ty = p.y; }   // target updates ONLY on detection
    else m.alert = Math.max(0, m.alert - dt);

    if (m.alert > 0){ m.state = 'chase'; }
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
    const spd = m.speed * (m.state === 'chase' ? 1.25 : 0.7);
    moveEnt(m, ax/am*spd*dt, ay/am*spd*dt, 9);

    if (dist < 22 && m.hit <= 0 && !S.dead && m.alert > 0){
      m.hit = d.cd || 0.9;
      hurtPlayer(m.dmg, m.type);
      // a monster hitting you also hits what you are carrying
      if (p.held) damageLoot(p.held, m.dmg * 4);
    }
  }
}
function hurtPlayer(n, src){
  const p = S.player;
  (S.hurtLog = S.hurtLog || []).push({ t:+S.time.toFixed(1), n, src: src || '?', hp: Math.round(p.hp - n) });
  p.hp -= n; p.hurt = 0.45;
  if (p.hp <= 0){ p.hp = 0; die(); }
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
      if (dp < b.r) hurtPlayer(Math.round(55 * (1 - dp/b.r)), 'bomb');
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
    if (pad.countdown >= EXTRACT_COUNTDOWN) completePad(pad);
  } else {
    pad.countdown = 0; S.countdownActive = false; S.countdown = 0;
  }
}
function completePad(pad){
  pad.done = true; pad.active = false;
  S.countdownActive = false; S.countdown = 0;
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
  S.running = false;
  S.offer = null;              // a fresh visit rolls fresh stock
  showShop();
}
function startLevel(seed){
  buildLevel(seed === undefined ? (Math.random()*999999)|0 : seed);
  S.running = true; S.dead = false;
  hideVeil();
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
    if (k === 'r'){ resetRun(); startLevel(); return; }
    if (k === 'tab'){ S.bigMap = !S.bigMap; return; }
    if (k === 'e'){ pickUp(S.player); return; }
    if (k === 'f'){ toggleStash(); return; }
    if (k === '1' || k === '2' || k === '3'){ useSlot(S.player, +k - 1); return; }
    keys.add(k);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  cv.addEventListener('pointerdown', e => {
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
    // item slots first: a drag that STARTS on a slot is aiming, not looking (doc C2-5)
    for (let i=0;i<3;i++){
      const s = hud.slots[i];
      if (Math.hypot(p.x-s.x, p.y-s.y) < s.r*1.15){
        S.player.aimSlot = i; S.player.aimX = p.x; S.player.aimY = p.y;
        stickR = null;
        return;
      }
    }
    if (p.x < hud.w*0.5){ stickL = { id:e.pointerId, ox:p.x, oy:p.y, x:p.x, y:p.y }; }
    else { stickR = { id:e.pointerId, ox:hud.right.x, oy:hud.right.y, x:p.x, y:p.y }; lookHeld = true; }
  });
  cv.addEventListener('pointermove', e => {
    const p = canvasPoint(e);
    if (S.player && S.player.aimSlot >= 0){ S.player.aimX = p.x; S.player.aimY = p.y; return; }
    if (stickL && stickL.id === e.pointerId){ stickL.x = p.x; stickL.y = p.y; }
    if (stickR && stickR.id === e.pointerId){ stickR.x = p.x; stickR.y = p.y; }
  });
  const up = e => {
    const p = canvasPoint(e);
    const pl = S.player;
    if (pl && pl.aimSlot >= 0){
      const hud = hudLayout(), s = hud.slots[pl.aimSlot];
      const dx = p.x - s.x, dy = p.y - s.y;
      // doc C2-5: releasing back over the slot is the cancel gesture
      if (Math.hypot(dx,dy) > s.r*1.3) useSlot(pl, pl.aimSlot, Math.atan2(dy,dx));
      pl.aimSlot = -1;
      return;
    }
    if (stickL && stickL.id === e.pointerId) stickL = null;
    if (stickR && stickR.id === e.pointerId){ stickR = null; lookHeld = false; }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('mousemove', e => {
    if (e.pointerType === 'touch') return;
    const p = canvasPoint(e);
    mouseWorld = { x: cam.x + p.x/ZOOM, y: cam.y + p.y/ZOOM };
  });
}
let mouseWorld = null;
function canvasPoint(e){
  const cv = CV(), r = cv.getBoundingClientRect();
  return { x:(e.clientX-r.left)/r.width*viewW, y:(e.clientY-r.top)/r.height*viewH };
}

// ============================================================ camera / sizing
const cam = { x:0, y:0 };
let viewW = 1280, viewH = 720, dpr = 1, lightCv = null;
function resize(){
  const cv = CV(), r = cv.getBoundingClientRect();
  if (!r.width) return;
  dpr = Math.min(devicePixelRatio || 1, 2);
  viewW = Math.round(r.width); viewH = Math.round(r.height);
  cv.width = Math.round(viewW*dpr); cv.height = Math.round(viewH*dpr);
  if (!lightCv) lightCv = document.createElement('canvas');
  lightCv.width = cv.width; lightCv.height = cv.height;
}
function worldTransform(c){
  const k = dpr*ZOOM;
  c.setTransform(k,0,0,k, -cam.x*k, -cam.y*k);
}
const vwW = () => viewW/ZOOM, vwH = () => viewH/ZOOM;

// ============================================================ HUD layout
function hudLayout(){
  const w = viewW, h = viewH;
  const pad = Math.min(w,h) * 0.055;
  const stickR_ = Math.min(w,h) * 0.105;
  const left  = { x: pad + stickR_, y: h - pad - stickR_, r: stickR_ };
  const right = { x: w - pad - stickR_, y: h - pad - stickR_, r: stickR_ };
  const sr = stickR_ * 0.42;
  // three slots arc around the right stick, matching the doc's own mockup
  const slots = [0,1,2].map(i => {
    const a = -Math.PI*0.86 + i*(Math.PI*0.30);
    return { x: right.x + Math.cos(a)*(stickR_+sr*1.45), y: right.y + Math.sin(a)*(stickR_+sr*1.45), r: sr, i };
  });
  // pickup moves to the LEFT of the screen (doc C2-4) — grabbing needs no aim
  const grab = { x: left.x + stickR_*0.15, y: left.y - stickR_*1.75, r: sr*1.06 };
  // the locker button sits above the grab button, on the same thumb, and only appears
  // when the truck is within reach — it is a start-room action, not a field one
  const stash = { x: grab.x + sr*1.9, y: grab.y - sr*1.5, r: sr*1.06 };
  return { w, h, left, right, slots, grab, stash, pad };
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
  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.runTapT = Math.max(0, p.runTapT - dt);
  p.floatT = Math.max(0, p.floatT - dt);
  p.shieldT = Math.max(0, p.shieldT - dt);

  // ---- movement intent
  let vx = 0, vy = 0, push = 0;
  if (window.__botActive && window.BOT) { const b = window.BOT.think(dt); vx = b.vx; vy = b.vy; push = b.push; if (b.look !== undefined) p.dir = b.look; }
  else {
    if (keys.has('w')||keys.has('arrowup')) vy -= 1;
    if (keys.has('s')||keys.has('arrowdown')) vy += 1;
    if (keys.has('a')||keys.has('arrowleft')) vx -= 1;
    if (keys.has('d')||keys.has('arrowright')) vx += 1;
    const m = Math.hypot(vx,vy);
    if (m > 0){ vx/=m; vy/=m; push = keys.has('shift') ? 1 : 0.6; }
    if (stickL){
      const dx = stickL.x-stickL.ox, dy = stickL.y-stickL.oy;
      const d = Math.hypot(dx,dy), maxD = hudLayout().left.r;
      if (d > 4){ vx = dx/d; vy = dy/d; push = clamp(d/maxD, 0, 1); }
    }
  }

  // Doc C2-3: stick deflection IS the run/walk/sneak control. No extra button, and it gives
  // the sound-hunting monster something real to hunt.
  let tier = 0;               // 0 sneak, 1 walk, 2 run
  if (push > 0.85) tier = 2; else if (push > 0.35) tier = 1;
  if (tier === 2 && p.stam <= 0) tier = 1;
  const moving = !!(vx || vy);

  // Lướt né: no new button, because C2 fixed the control scheme. A double-tap of the
  // input that already means "run" — the stick hitting its rim, or Shift — is the gesture.
  const runNow = tier === 2 && moving;
  if (runNow && !p.wasRun){
    if (p.runTapT > 0 && S.upg.dash > 0 && p.dashCd <= 0 && p.stam > 18){
      p.dashT = 0.18; p.dashCd = 2.4 - Math.min(1.2, S.upg.dash*0.4);
      p.stam = Math.max(0, p.stam - 18);
      p.runTapT = 0;
    } else p.runTapT = 0.35;
  }
  p.wasRun = runNow;

  p.noise = !moving ? 0 : p.dashT > 0 ? 2.4 : tier === 2 ? 2 : tier === 1 ? 1 : 0.25;
  if (S.noiseOverride != null) p.noise = S.noiseOverride;
  let tierMul = tier === 2 ? 1.5 * (1 + S.upg.sprint*0.20) : tier === 1 ? 1.0 : 0.5;
  if (p.dashT > 0) tierMul *= 3.2;
  if (tier === 2){ p.stam = Math.max(0, p.stam - STAM_DRAIN*dt); }
  else {
    // Hồi thể lực nhanh: standing still is already the fastest recovery; the upgrade
    // widens that gap, so holding position near a blind hunter pays twice.
    const idle = !moving || tier === 0;
    p.stam = Math.min(p.stamMax, p.stam + STAM_REGEN*dt*(tier===0?1.4:1)*(idle ? 1 + S.upg.regen*0.5 : 1));
  }

  if (vx || vy){
    const sp = playerSpeed(p) * tierMul;
    moveEnt(p, vx*sp*dt, vy*sp*dt, 7.5);
  }

  // ---- look
  if (!window.__botActive){
    let want = null;
    if (stickR){
      const dx = stickR.x-stickR.ox, dy = stickR.y-stickR.oy;
      if (Math.hypot(dx,dy) > 8) want = Math.atan2(dy,dx);
    } else if (mouseWorld){
      want = Math.atan2(mouseWorld.y-p.y, mouseWorld.x-p.x);
    }
    // Doc C2-2: releasing the look stick FREEZES the facing. It never resets and never
    // snaps to the movement direction — that is what lets a thumb leave to tap an item.
    if (want !== null){
      const rate = 7.5 * turnRate(p);
      p.dir += clamp(angDiff(want, p.dir), -rate*dt, rate*dt);
    }
  }

  for (const l of S.loot) stepLoot(l, dt);
  stepCart(dt);
  if (!S.noFoes) stepMonsters(dt);
  stepProjectiles(dt);
  stepExtraction(dt);

  // reaching the car after the last pad ends the level
  if (S.levelDone && Math.hypot(p.x-S.car.x, p.y-S.car.y) < TILE*2.4){ finishLevel(); return; }

  markExplored();

  const tx = clamp(p.x - vwW()/2, 0, Math.max(0, WPX - vwW()));
  const ty = clamp(p.y - vwH()/2, 0, Math.max(0, HPX - vwH()));
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
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.fillRect(0,0,cv.width,cv.height);
  if (!S.grid) return;

  worldTransform(c);
  c.drawImage(S.worldCv, 0, 0);
  drawPads(c); drawCart(c); drawLoot(c); drawCar(c); drawMonsters(c); drawProjectiles(c); drawPlayer(c);

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
  const x = S.car.x, y = S.car.y;
  c.fillStyle = '#2c3540'; c.fillRect(x-TILE*1.5, y-TILE, TILE*3, TILE*2);
  c.fillStyle = '#3f4c5a'; c.fillRect(x-TILE*1.2, y-TILE*0.7, TILE*2.4, TILE*1.4);
  c.fillStyle = '#89a6b8'; c.fillRect(x-TILE*0.5, y-TILE*0.35, TILE, TILE*0.7);
  c.strokeStyle = 'rgba(200,220,235,0.35)'; c.lineWidth = 1.5;
  c.strokeRect(x-TILE*1.5, y-TILE, TILE*3, TILE*2);
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
function drawPads(c){
  for (const pad of S.pads){
    const col = pad.done ? '#3a4a42' : pad.active ? '#4fa87a' : '#5a6570';
    c.strokeStyle = col; c.lineWidth = 2.5;
    c.strokeRect(pad.x-TILE*1.8, pad.y-TILE*1.8, TILE*3.6, TILE*3.6);
    c.fillStyle = pad.done ? 'rgba(40,60,50,0.35)' : pad.active ? 'rgba(50,120,90,0.22)' : 'rgba(60,70,80,0.15)';
    c.fillRect(pad.x-TILE*1.8, pad.y-TILE*1.8, TILE*3.6, TILE*3.6);
    if (!pad.done){
      c.fillStyle = '#dfe6ea'; c.font = '600 13px ui-monospace, monospace'; c.textAlign = 'center';
      c.fillText(money(pad.value) + ' / ' + money(pad.quota), pad.x, pad.y - TILE*2.1);
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
    c.beginPath(); c.fillStyle = l.isBag ? '#c8a33c' : l.mat.col;
    c.arc(l.x, y, l.r, 0, Math.PI*2); c.fill();
    c.lineWidth = 2; c.strokeStyle = l.isBag ? '#8a6d1e' : l.mat.edge; c.stroke();
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
  c.save(); c.translate(p.x,p.y);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.ellipse(0,8,10,4.5,0,0,Math.PI*2); c.fill();
  c.rotate(p.dir);
  c.fillStyle = '#cfcbb9'; c.beginPath(); c.arc(0,0,7,0,Math.PI*2); c.fill();
  c.strokeStyle = 'rgba(18,20,18,0.85)'; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#8d8873'; c.beginPath(); c.arc(3.6,0,3.3,0,Math.PI*2); c.fill();
  c.fillStyle = '#ffe6a8'; c.fillRect(6,-1.5,5,3);
  c.restore();
}
function drawVignette(c){
  const w = c.canvas.width, h = c.canvas.height;
  const g = c.createRadialGradient(w/2,h/2,Math.min(w,h)*0.22,w/2,h/2,Math.max(w,h)*0.86);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(0.6,'rgba(0,0,0,0.13)');
  g.addColorStop(1,'rgba(0,0,0,0.5)');
  c.fillStyle = g; c.fillRect(0,0,w,h);
  if (S.player && S.player.hurt > 0){
    const hg = c.createRadialGradient(w/2,h/2,Math.max(w,h)*0.2,w/2,h/2,Math.max(w,h)*0.72);
    hg.addColorStop(0,'rgba(150,26,20,0)');
    hg.addColorStop(1,`rgba(160,28,20,${S.player.hurt*0.7})`);
    c.fillStyle = hg; c.fillRect(0,0,w,h);
  }
}

// ---------- HUD (canvas, so the layout is exact on every device)
function drawHud(c){
  const p = S.player, hud = hudLayout(), k = dpr;
  c.save(); c.scale(k,k);

  // health + stamina, top-left (matches the doc's mockup)
  const bx = 14, by = 14, bw = 168, bh = 9;
  c.fillStyle = 'rgba(10,12,14,0.72)'; c.fillRect(bx-3,by-3,bw+6,bh*2+9);
  c.fillStyle = '#3a1f1c'; c.fillRect(bx,by,bw,bh);
  c.fillStyle = '#b8433a'; c.fillRect(bx,by,bw*clamp(p.hp/p.hpMax,0,1),bh);
  c.fillStyle = '#1c2a2c'; c.fillRect(bx,by+bh+4,bw,bh-3);
  c.fillStyle = '#4c8f96'; c.fillRect(bx,by+bh+4,bw*clamp(p.stam/p.stamMax,0,1),bh-3);

  drawMinimap(c, hud);

  if (S.countdownActive){
    c.font = '700 30px ui-monospace, monospace'; c.textAlign = 'center';
    c.fillStyle = '#7fd6a0';
    c.fillText('GIAO HÀNG ' + S.countdown.toFixed(1) + 's', hud.w/2, 52);
    c.textAlign = 'left';
  }
  if (S.messageT > 0){
    c.font = '600 14px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = `rgba(226,232,236,${Math.min(1,S.messageT)})`;
    c.fillText(S.message, hud.w/2, hud.h - hud.pad*0.55);
    c.textAlign = 'left';
  }

  // sticks
  ring(c, hud.left.x, hud.left.y, hud.left.r, 'rgba(210,140,50,0.55)');
  const lk = stickL ? { x:clamp(stickL.x-stickL.ox,-hud.left.r,hud.left.r), y:clamp(stickL.y-stickL.oy,-hud.left.r,hud.left.r) } : {x:0,y:0};
  dot(c, hud.left.x+lk.x, hud.left.y+lk.y, hud.left.r*0.3, 'rgba(210,140,50,0.8)');
  ring(c, hud.right.x, hud.right.y, hud.right.r, 'rgba(210,140,50,0.55)');
  const rk = stickR ? { x:clamp(stickR.x-stickR.ox,-hud.right.r,hud.right.r), y:clamp(stickR.y-stickR.oy,-hud.right.r,hud.right.r) }
                    : { x:Math.cos(p.dir)*hud.right.r*0.55, y:Math.sin(p.dir)*hud.right.r*0.55 };
  dot(c, hud.right.x+rk.x, hud.right.y+rk.y, hud.right.r*0.3, 'rgba(210,140,50,0.8)');

  // item slots
  for (let i=0;i<3;i++){
    const s = hud.slots[i], it = p.inv[i];
    const usable = it && it.uses > 0;
    ring(c, s.x, s.y, s.r, usable ? 'rgba(200,70,60,0.85)' : 'rgba(90,70,68,0.5)');
    c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
    c.fillStyle = usable ? '#e6ebee' : '#6a6f74';
    const label = it ? (GEAR_BY_KEY[it.kind] ? GEAR_BY_KEY[it.kind].short : it.kind) : '—';
    c.fillText(label, s.x, s.y+3);
    if (it) c.fillText('x'+it.uses, s.x, s.y+s.r*0.78);
    c.textAlign = 'left';
    if (p.aimSlot === i){
      c.strokeStyle = 'rgba(255,220,150,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(s.x,s.y); c.lineTo(p.aimX,p.aimY); c.stroke();
    }
  }

  // grab button, left side
  const near = nearestLoot(p);
  const grabLit = near || p.held || p.pushing || nearCart(p);
  ring(c, hud.grab.x, hud.grab.y, hud.grab.r, grabLit ? 'rgba(80,190,120,0.9)' : 'rgba(70,90,78,0.45)');
  c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
  c.fillStyle = grabLit ? '#e6ebee' : '#6a6f74';
  const grabLabel = p.pushing ? 'Buông' : p.held ? 'Thả' : nearCart(p) && !near ? 'Đẩy xe' : 'Nhặt';
  c.fillText(grabLabel, hud.grab.x, hud.grab.y+4);

  // locker button — only while you are standing at the truck
  if (nearTruck(p)){
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
  if (S.upg.dash > 0 && p.dashCd > 0) badges.push('Lướt ' + p.dashCd.toFixed(1) + 's');
  if (badges.length){
    c.font = '600 11px ui-monospace, monospace';
    c.fillStyle = '#8fd0b4';
    c.fillText(badges.join('   '), 14, 52);
  }

  c.restore();
}
function nearCart(p){
  return S.cart && Math.hypot(S.cart.x-p.x, S.cart.y-p.y) < S.cart.r + grabRange(p);
}
function ring(c,x,y,r,col){ c.beginPath(); c.strokeStyle = col; c.lineWidth = 2.5; c.arc(x,y,r,0,Math.PI*2); c.stroke(); }
function dot(c,x,y,r,col){ c.beginPath(); c.fillStyle = col; c.arc(x,y,r,0,Math.PI*2); c.fill(); }
function nearestLoot(p){
  let best = null, bd = grabRange(p);
  for (const l of S.loot){ if (l.gone||l.held||l.onPad) continue;
    const d = Math.hypot(l.x-p.x,l.y-p.y); if (d<bd){ bd=d; best=l; } }
  return best;
}
function drawMinimap(c, hud){
  const big = S.bigMap;
  const w = big ? Math.min(hud.w*0.6, 460) : Math.min(hud.w*0.26, 210);
  const h = w * (MH/MW);
  const x = big ? (hud.w-w)/2 : hud.w - w - 14, y = big ? (hud.h-h)/2 : 14;
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
  // The Extraction Tracker is a bought tool in the source game ("tells you where to escape"),
  // so route-finding is what you pay for — not the objective itself. The pad you are working
  // on is always marked; the ones you have not opened yet, and the line that walks you there,
  // are the tracker's job.
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
  const target = S.levelDone ? S.car : (S.pads[S.padIndex] || S.car);
  if (S.levelDone || tracked){
    c.strokeStyle = 'rgba(120,220,170,0.5)'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x + S.player.x/TILE*sx, y + S.player.y/TILE*sy);
    c.lineTo(x + target.x/TILE*sx, y + target.y/TILE*sy);
    c.stroke();
  }
  c.fillStyle = '#ffd98a';
  c.fillRect(x + S.player.x/TILE*sx - 2, y + S.player.y/TILE*sy - 2, 4, 4);
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

// The station rolls fresh stock every visit, in two separate sets.
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

function showShop(){
  if (!S.offer) S.offer = rollShop();
  const o = S.offer;

  const upRows = o.upgrades.map(u => {
    const lv = S.upg[u.key], price = upgradePrice(u);
    const left = UPGRADE_MAX_SPAWNS - (S.upgSpawned[u.key]||0);
    return `<button class="up" data-key="${u.key}" data-price="${price}" ${S.wallet>=price?'':'disabled'}>
      <span class="t">${u.name} <span style="opacity:.6;font-weight:400">Lv ${lv}</span></span>
      <span class="d">${u.desc}</span>
      <span class="p">${money(price)} <span style="opacity:.55">· còn ${left} lần xuất hiện</span></span>
    </button>`;
  }).join('') || `<div class="empty">Hết nâng cấp để bán — mỗi loại chỉ xuất hiện ${UPGRADE_MAX_SPAWNS} lần trong một ca.</div>`;

  const geRows = o.gear.map(g => {
    const left = g.stock - (S.gearBought[g.key]||0);
    return `<button class="gear" data-key="${g.key}" data-price="${g.price}" ${S.wallet>=g.price?'':'disabled'}>
      <span class="t">${g.name}</span>
      <span class="d">${g.desc}</span>
      <span class="p">${money(g.price)} <span style="opacity:.55">· ${g.passive?'trang bị là chạy':'x'+g.uses+' lượt'} · còn ${left}</span></span>
    </button>`;
  }).join('') || `<div class="empty">Hết đồ để bán trong ca này.</div>`;

  showVeil('Trạm dịch vụ — hết màn ' + S.level,
    'Chỉ tiêu đã xong. Nâng cấp ăn thẳng vào chỉ số của bạn; đồ mua về nằm trong tủ trên xe, ra ca sau tự lấy ở đó.',
    'Vào màn ' + (S.level+1),
    () => { S.level++; S.offer = null; startLevel(); },
    `<div class="wallet">Ví: ${money(S.wallet)} &nbsp;·&nbsp; Tủ đồ: ${S.stash.length} món</div>
     <div class="seg">Nâng cấp — vĩnh viễn, chỉ cho bạn</div><div class="shop">${upRows}</div>
     <div class="seg">Đồ — cất vào tủ trên xe</div><div class="shop">${geRows}</div>`);

  el('veilExtra').querySelectorAll('.up').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key, price = +btn.dataset.price;
      if (S.wallet < price) return;
      S.wallet -= price; S.upg[key]++;
      applyUpgrades();
      showShop();
    });
  });
  el('veilExtra').querySelectorAll('.gear').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key, price = +btn.dataset.price;
      if (S.wallet < price) return;
      const def = GEAR_BY_KEY[key];
      if ((S.gearBought[key]||0) >= def.stock) return;
      S.wallet -= price;
      S.gearBought[key] = (S.gearBought[key]||0) + 1;
      S.stash.push({ kind:key, uses:def.uses });
      // sold out now? drop it from this visit's stock so the row cannot be clicked again
      if ((S.gearBought[key]||0) >= def.stock) S.offer.gear = S.offer.gear.filter(g => g.key !== key);
      showShop();
    });
  });
}
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
  el('hLevel').textContent = S.level;
  const pad = S.pads[S.padIndex];
  const q = el('hQuota');
  if (S.levelDone){ q.textContent = 'xong — về xe'; q.classList.add('met'); }
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
  if (cv.width !== Math.round(cv.getBoundingClientRect().width * dpr)) resize();
  if (S.running && !S.dead){
    acc += dt * timeScale;
    let steps = 0;
    while (acc >= FIXED && steps < 240){ step(FIXED); acc -= FIXED; steps++; if (!S.running) break; }
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
  buildLevel((Math.random()*999999)|0);
  S.running = false;

  el('veilBtn').onclick = () => { S.running = true; hideVeil(); };
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
  toggleStash, rollShop,
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
  get timeScale(){ return timeScale; },
  set timeScale(v){ timeScale = clamp(v, 0.1, 12); },
  get dmgMult(){ return DMG_MULT; },
  set dmgMult(v){ DMG_MULT = v; },
  setNoise(v){ S.noiseOverride = v; },
  warp(x,y){ S.player.x = x; S.player.y = y; cam.x = clamp(x-vwW()/2,0,Math.max(0,WPX-vwW())); cam.y = clamp(y-vwH()/2,0,Math.max(0,HPX-vwH())); },
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
      levelDone:S.levelDone, noFoes:S.noFoes,
      hp:p?p.hp:0, hpMax:p?p.hpMax:0, stam:p?p.stam:0, str:p?p.str:0,
      x:p?p.x:0, y:p?p.y:0, dir:p?p.dir:0, noise:p?p.noise:0,
      held: p&&p.held ? { size:p.held.size, value:p.held.value, value0:p.held.value0, mat:p.held.mat.key } : null,
      inv: p ? p.inv.map(it => it ? { kind:it.kind, uses:it.uses } : null) : [],
      stash: S.stash.map(it => ({ kind:it.kind, uses:it.uses })),
      pushing: !!(p && p.pushing),
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
