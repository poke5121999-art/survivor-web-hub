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
// '#' wall  '.' floor  'x' prop (blocks sight+movement)  'L' loot spot  'M' monster post
const ROOMS = [
  { name:'Phòng khách', rows:[
    '#####################',
    '#...................#',
    '#..xxxx.......xxxx..#',
    '#..x..L.......L..x..#',
    '#..x.............x..#',
    '#..xxx....M....xxx..#',
    '#...................#',
    '#...................#',
    '#..xxx.........xxx..#',
    '#..x.L.........L.x..#',
    '#..x.............x..#',
    '#..xxxx.......xxxx..#',
    '#...................#',
    '#...................#',
    '#####################' ]},
  { name:'Nhà kho', rows:[
    '#####################',
    '#...................#',
    '#.xxx.xxx...xxx.xxx.#',
    '#.xL....x...x....Lx.#',
    '#.x.....x...x.....x.#',
    '#.......................',
    '#.......M...........#',
    '#...................#',
    '#.x.....x...x.....x.#',
    '#.xL....x...x....Lx.#',
    '#.xxx.xxx...xxx.xxx.#',
    '#...................#',
    '#........L..........#',
    '#...................#',
    '#####################' ]},
  { name:'Bếp', rows:[
    '#####################',
    '#...................#',
    '#.xxxxxxx...xxxxxxx.#',
    '#.L.....x...x.....L.#',
    '#.......x...x.......#',
    '#.xxxx..x...x..xxxx.#',
    '#....x.........x....#',
    '#....x...M.....x....#',
    '#....x.........x....#',
    '#.xxxx..x...x..xxxx.#',
    '#.......x...x.......#',
    '#.L.....x...x.....L.#',
    '#.xxxxxxx...xxxxxxx.#',
    '#...................#',
    '#####################' ]},
  { name:'Hành lang', rows:[
    '#####################',
    '#...................#',
    '#...................#',
    '#.xxxxxxxxxxxxxxxxx.#',
    '#.x...............x.#',
    '#.x.L...........L.x.#',
    '#.x...............x.#',
    '#.........M.........#',
    '#.x...............x.#',
    '#.x.L...........L.x.#',
    '#.x...............x.#',
    '#.xxxxxxxxxxxxxxxxx.#',
    '#...................#',
    '#...................#',
    '#####################' ]},
  { name:'Thư phòng', rows:[
    '#####################',
    '#...................#',
    '#.x.x.x.x.x.x.x.x.x.#',
    '#...................#',
    '#.L...............L.#',
    '#.x.x.x.x.x.x.x.x.x.#',
    '#...................#',
    '#........M..........#',
    '#...................#',
    '#.x.x.x.x.x.x.x.x.x.#',
    '#.L...............L.#',
    '#...................#',
    '#.x.x.x.x.x.x.x.x.x.#',
    '#...................#',
    '#####################' ]},
  { name:'Sân trong', rows:[
    '#####################',
    '#...................#',
    '#....xxxxxxxxx......#',
    '#....x.......x......#',
    '#....x..L.L..x......#',
    '#....x.......x......#',
    '#....xxx...xxx......#',
    '#.........M.........#',
    '#....xxx...xxx......#',
    '#....x.......x......#',
    '#....x..L.L..x......#',
    '#....x.......x......#',
    '#....xxxxxxxxx......#',
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
const UPGRADES = [
  { key:'hp',     name:'Nâng máu',      desc:'+20 máu tối đa, và hồi đầy ngay.',                  base: 6000 },
  { key:'stam',   name:'Nâng thể lực',  desc:'+10 thể lực, chạy được lâu hơn.',                   base: 2000 },
  { key:'str',    name:'Nâng sức',      desc:'+10 sức. Cùng món đồ đó sẽ nhẹ đi tương đối.',       base: 6000 },
  { key:'range',  name:'Nâng tầm với',  desc:'Nhặt được đồ từ xa hơn.',                           base: 4500 },
  { key:'light',  name:'Nâng đèn',      desc:'Nón nhìn dài và rộng hơn.',                         base: 5000 },
  { key:'grip',   name:'Găng chống sốc',desc:'Đồ bạn đang vác chịu va đập tốt hơn 25%.',          base: 7000 }
];

// ============================================================ state
const S = {
  seed: 0, level: 1, wallet: 0,
  grid: null, rooms: [], segs: [], explored: null,
  worldCv: null,
  loot: [], monsters: [], pads: [], bullets: [], bombs: [], corpses: [],
  car: { x:0, y:0 },
  quotaTotal: 0, padIndex: 0,
  countdown: 0, countdownActive: false,
  player: null,
  upg: { hp:0, stam:0, str:0, range:0, light:0, grip:0 },
  running: false, dead: false, levelDone: false, noFoes: false,
  time: 0, message: '', messageT: 0,
  bigMap: false
};

function newPlayer(){
  return {
    x:0, y:0, dir:0, hp: 100 + S.upg.hp*20, hpMax: 100 + S.upg.hp*20,
    stam: STAM_MAX + S.upg.stam*10, stamMax: STAM_MAX + S.upg.stam*10,
    str: 30 + S.upg.str*10, held: null, hurt: 0, noise: 0, speedScale: 1,
    inv: [ {kind:'gun', uses:6}, {kind:'heal', uses:2}, {kind:'bomb', uses:2} ],
    aimSlot: -1, aimX: 0, aimY: 0, cooldown: 0
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

  for (let cy=0; cy<GY; cy++) for (let cx=0; cx<GX; cx++){
    const ri = cy*GX+cx;
    const t = ROOMS[order[ri % order.length]];
    const fx = rnd()<0.5, fy = rnd()<0.5;
    S.rooms.push({ name:t.name, cx, cy, seen:false });
    for (let y=0; y<RH; y++) for (let x=0; x<RW; x++){
      const sx = fx ? RW-1-x : x, sy = fy ? RH-1-y : y;
      const ch = (t.rows[sy] || '')[sx] || '.';
      const gx = cx*RW+x, gy = cy*RH+y;
      let v = ch === '#' ? WALL : ch === 'x' ? PROP : FLOOR;
      if (x===0||y===0||x===RW-1||y===RH-1) v = WALL;      // room shell is always closed
      S.grid[gy*MW+gx] = v;
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

  // --- loot. Doc B2 correction: scatter the loot FIRST, then derive the quota from what
  // was actually scattered. Fixing the quota first can produce a level you cannot clear.
  const spots = lootSpots.filter(s => reach[s.gy*MW+s.gx]);
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

  // --- extraction pads. Doc A2-2: pads are scattered, the car is NOT one of them.
  const padCount = padsForLevel(S.level);
  const cand = [];
  for (let ri=0; ri<S.rooms.length; ri++){
    if (ri === carRoom) continue;
    const r = S.rooms[ri];
    const gx = r.cx*RW + (RW>>1), gy = r.cy*RH + (RH>>1);
    if (!reach[gy*MW+gx]) continue;
    cand.push({ ri, x:(gx+0.5)*TILE, y:(gy+0.5)*TILE });
  }
  const chosen = pickSpread(cand, padCount, rnd);
  const per = Math.round(S.quotaTotal / Math.max(1, chosen.length));
  chosen.forEach((c,i) => S.pads.push({
    x:c.x, y:c.y, ri:c.ri, quota: per, placed: [], value: 0,
    active: i===0, done:false, index:i
  }));

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

  S.segs = buildSegments();
  prerenderWorld(mulberry32(seed ^ 0x9e3779b9));
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
function pickSpread(cand, n, rnd){
  // Doc A2-3: score every candidate and relax the threshold, never loop until it fits.
  const out = [];
  const pool = cand.slice();
  let minD = 22 * TILE;
  while (out.length < n && pool.length){
    let best = -1, bestScore = -1;
    for (let i=0;i<pool.length;i++){
      const c = pool[i];
      let d = Math.hypot(c.x-S.car.x, c.y-S.car.y);
      for (const o of out) d = Math.min(d, Math.hypot(c.x-o.x, c.y-o.y));
      const score = d + rnd()*TILE*3;
      if (d >= minD && score > bestScore){ bestScore = score; best = i; }
    }
    if (best < 0){ minD *= 0.8; if (minD < 3*TILE){ out.push(pool.shift()); } continue; }
    out.push(pool.splice(best,1)[0]);
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
  return { x, y, vx:0, vy:0, r:size.r, mass:size.mass, size:size.key,
           mat, value0:v0, value:v0, held:false, invuln:0, grace:0,
           onPad:null, cracks:0, gone:false, bob: Math.random()*6 };
}
function makeMonster(type,x,y){
  const d = MONSTERS[type];
  return { type, x, y, hp:d.hp, dmg:d.dmg, speed:d.speed, dir:0,
           state:'patrol', tx:x, ty:y, think:0, alert:0, hit:0, home:{x,y}, wob:Math.random()*7 };
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

function prerenderWorld(rnd){
  if (!S.worldCv){ S.worldCv = document.createElement('canvas'); S.worldCv.width = WPX; S.worldCv.height = HPX; }
  const c = S.worldCv.getContext('2d');
  c.setTransform(1,0,0,1,0,0);
  c.fillStyle = '#0a0b0c'; c.fillRect(0,0,WPX,HPX);
  for (let gy=0; gy<MH; gy++) for (let gx=0; gx<MW; gx++){
    const v = S.grid[gy*MW+gx], x = gx*TILE, y = gy*TILE, n = rnd();
    // The light pass only multiplies this down, so paint it bright or every lit surface is black.
    if (v === FLOOR){
      const b = 118 + n*14;
      c.fillStyle = `rgb(${(b*0.96)|0},${(b*0.94)|0},${(b*0.88)|0})`;
      c.fillRect(x,y,TILE,TILE);
      if (n > 0.8){ c.fillStyle = `rgba(${(b*1.2)|0},${(b*1.18)|0},${(b*1.1)|0},0.5)`; c.fillRect(x+(n*89%16), y+(n*53%16), 3, 2); }
    } else if (v === WALL){
      c.fillStyle = `rgb(${(74+n*12)|0},${(70+n*11)|0},${(66+n*10)|0})`;
      c.fillRect(x,y,TILE,TILE);
      c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x,y+TILE-4,TILE,4);
      c.fillStyle = 'rgba(255,246,226,0.10)'; c.fillRect(x,y,TILE,2);
    } else {
      c.fillStyle = `rgb(${(112+n*12)|0},${(104+n*10)|0},${(92+n*9)|0})`;
      c.fillRect(x+1,y+1,TILE-2,TILE-2);
      c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(x+1,y+TILE-5,TILE-2,4);
      c.fillStyle = 'rgba(255,240,210,0.09)'; c.fillRect(x+1,y+1,TILE-2,2);
    }
  }
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

function carriedWeight(p){ return p.held ? p.held.mass : 0; }
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

function stepLoot(l, dt){
  if (l.gone) return;
  if (l.held){
    // spring toward the hold point; the spring is what turns a wall into a sudden stop
    const p = S.player;
    const hx = p.x + Math.cos(p.dir) * (l.r + 12), hy = p.y + Math.sin(p.dir) * (l.r + 12);
    const k = 26, damp = 9;
    l.vx += ((hx - l.x) * k - l.vx * damp) * dt;
    l.vy += ((hy - l.y) * k - l.vy * damp) * dt;
  } else {
    l.vx *= Math.pow(0.02, dt); l.vy *= Math.pow(0.02, dt);
    if (Math.abs(l.vx) < 1) l.vx = 0;
    if (Math.abs(l.vy) < 1) l.vy = 0;
  }
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

function pickUp(p){
  if (p.held){ dropHeld(p); return true; }
  let best = null, bd = grabRange(p);
  for (const l of S.loot){
    if (l.gone || l.held || l.onPad) continue;
    const d = Math.hypot(l.x-p.x, l.y-p.y);
    if (d < bd){ bd = d; best = l; }          // doc: nearest within range wins
  }
  if (!best) return false;
  best.held = true;
  best.grace = S.time + GRACE_AFTER_PICKUP;   // C3-5: no damage in the first second after pickup
  best.vx = best.vy = 0;
  p.held = best;
  return true;
}
function dropHeld(p){
  if (!p.held) return;
  const l = p.held;
  l.held = false; l.vx *= 0.3; l.vy *= 0.3;
  l.grace = S.time + 0.35;
  p.held = null;
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
  const ang = aimed !== undefined ? aimed : p.dir;
  if (it.kind === 'gun'){
    S.bullets.push({ x:p.x, y:p.y, vx:Math.cos(ang)*620, vy:Math.sin(ang)*620, life:0.9 });
    it.uses--; p.cooldown = 0.45;
  } else if (it.kind === 'heal'){
    p.hp = Math.min(p.hpMax, p.hp + 45); it.uses--; p.cooldown = 0.4;
    toast('Hồi máu');
  } else if (it.kind === 'bomb'){
    S.bombs.push({ x:p.x + Math.cos(ang)*30, y:p.y + Math.sin(ang)*30,
                   vx:Math.cos(ang)*300, vy:Math.sin(ang)*300, t:0, fuse:1.4, r:TILE*3.4, done:false, owner:'player' });
    it.uses--; p.cooldown = 0.5;
  }
  return true;
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
        m.hp -= 25; m.alert = 3;
        S.bullets.splice(i,1);
        if (m.hp <= 0) killMonster(m);
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
    'Làm lại từ màn 1', () => { S.level = 1; S.wallet = 0; S.upg = {hp:0,stam:0,str:0,range:0,light:0,grip:0}; S.player = newPlayer(); startLevel(); });
}
function finishLevel(){
  S.running = false;
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
    if (['w','a','s','d','e','r','1','2','3','shift','tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    if (k === 'r'){ S.level = 1; S.wallet = 0; startLevel(); return; }
    if (k === 'tab'){ S.bigMap = !S.bigMap; return; }
    if (k === 'e'){ pickUp(S.player); return; }
    if (k === '1' || k === '2' || k === '3'){ useSlot(S.player, +k - 1); return; }
    keys.add(k);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    const hud = hudLayout();
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
  return { w, h, left, right, slots, grab, pad };
}

// ============================================================ step
function step(dt){
  S.time += dt;
  S.messageT = Math.max(0, S.messageT - dt);
  const p = S.player;
  if (!p) return;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hurt = Math.max(0, p.hurt - dt);

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
  p.noise = !moving ? 0 : tier === 2 ? 2 : tier === 1 ? 1 : 0.25;
  if (S.noiseOverride != null) p.noise = S.noiseOverride;
  const tierMul = tier === 2 ? 1.5 : tier === 1 ? 1.0 : 0.5;
  if (tier === 2){ p.stam = Math.max(0, p.stam - STAM_DRAIN*dt); }
  else { p.stam = Math.min(p.stamMax, p.stam + STAM_REGEN*dt*(tier===0?1.4:1)); }

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
  drawPads(c); drawLoot(c); drawCar(c); drawMonsters(c); drawProjectiles(c); drawPlayer(c);

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
    c.fillStyle = m.state === 'chase' ? d.eye : 'rgba(120,100,90,0.8)';
    c.fillRect(-4,-9,2.4,2.4); c.fillRect(1.6,-9,2.4,2.4);
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
    const label = it ? ({gun:'Súng', heal:'Máu', bomb:'Bom', sword:'Kiếm'})[it.kind] : '—';
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
  ring(c, hud.grab.x, hud.grab.y, hud.grab.r, near || p.held ? 'rgba(80,190,120,0.9)' : 'rgba(70,90,78,0.45)');
  c.font = '600 11px ui-sans-serif, system-ui'; c.textAlign = 'center';
  c.fillStyle = near || p.held ? '#e6ebee' : '#6a6f74';
  c.fillText(p.held ? 'Thả' : 'Nhặt', hud.grab.x, hud.grab.y+4);
  c.textAlign = 'left';

  c.restore();
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
  for (let ri=0; ri<S.rooms.length; ri++){
    const r = S.rooms[ri];
    if (!r.seen) continue;
    c.fillStyle = 'rgba(70,92,120,0.34)';
    c.fillRect(x + r.cx*RW*sx, y + r.cy*RH*sy, RW*sx, RH*sy);
    c.strokeStyle = 'rgba(120,150,190,0.45)'; c.lineWidth = 1;
    c.strokeRect(x + r.cx*RW*sx, y + r.cy*RH*sy, RW*sx, RH*sy);
  }
  // doc: minimap shows found loot, the active pad, and the way back to the car
  for (const l of S.loot){
    if (l.gone || l.onPad) continue;
    const gi = (((l.y/TILE)|0)*MW + ((l.x/TILE)|0));
    if (!S.explored[gi]) continue;
    c.fillStyle = l.isBag ? '#e0b64a' : '#cfd8dc';
    c.fillRect(x + l.x/TILE*sx - 1.2, y + l.y/TILE*sy - 1.2, 2.4, 2.4);
  }
  for (const pad of S.pads){
    c.fillStyle = pad.done ? '#3d5a4c' : pad.active ? '#5ecf95' : '#6a747f';
    c.fillRect(x + pad.x/TILE*sx - 3, y + pad.y/TILE*sy - 3, 6, 6);
  }
  c.fillStyle = '#7fb6e0';
  c.fillRect(x + S.car.x/TILE*sx - 3.5, y + S.car.y/TILE*sy - 3.5, 7, 7);
  const target = S.levelDone ? S.car : (S.pads[S.padIndex] || S.car);
  c.strokeStyle = 'rgba(120,220,170,0.5)'; c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x + S.player.x/TILE*sx, y + S.player.y/TILE*sy);
  c.lineTo(x + target.x/TILE*sx, y + target.y/TILE*sy);
  c.stroke();
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
  const b = el('veilBtn');
  b.textContent = btnText;
  b.onclick = onClick;
  el('veil').hidden = false;
}
function hideVeil(){ el('veil').hidden = true; }

function showShop(){
  const rows = UPGRADES.map(u => {
    const lv = S.upg[u.key];
    const price = Math.round(u.base * Math.pow(1.6, lv));
    const can = S.wallet >= price;
    return `<button class="up" data-key="${u.key}" data-price="${price}" ${can?'':'disabled'}>
      <span class="t">${u.name} <span style="opacity:.6;font-weight:400">Lv ${lv}</span></span>
      <span class="d">${u.desc}</span>
      <span class="p">${money(price)}</span></button>`;
  }).join('');
  showVeil('Trạm dịch vụ — hết màn ' + S.level,
    'Chỉ tiêu đã xong. Tiêu tiền trước khi vào ca sau; giá tăng mỗi lần mua cùng một thứ.',
    'Vào màn ' + (S.level+1),
    () => { S.level++; startLevel(); },
    `<div class="wallet">Ví: ${money(S.wallet)}</div><div class="shop">${rows}</div>`);
  el('veilExtra').querySelectorAll('.up').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key, price = +btn.dataset.price;
      if (S.wallet < price) return;
      S.wallet -= price; S.upg[key]++;
      if (key === 'hp'){ S.player.hpMax = 100 + S.upg.hp*20; S.player.hp = S.player.hpMax; }
      if (key === 'stam'){ S.player.stamMax = STAM_MAX + S.upg.stam*10; S.player.stam = S.player.stamMax; }
      if (key === 'str') S.player.str = 30 + S.upg.str*10;
      showShop();
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
  el('hCarry').textContent = S.player && S.player.held ? (S.player.held.size + ' · ' + money(S.player.held.value)) : '—';
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
  el('newBtn').onclick = () => { S.level = 1; S.wallet = 0; startLevel(); };
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
  startLevel, setBot,
  damageLoot,
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
      loot: S.loot.filter(l=>!l.gone).length,
      lootTotal: S.loot.length,
      lootValue: S.loot.reduce((a,l)=>a+(l.gone?0:l.value),0),
      lootValue0: S.loot.reduce((a,l)=>a+l.value0,0),
      monsters: S.monsters.length,
      chasing: S.monsters.filter(m=>m.state==='chase').length,
      pads: S.pads.map(q=>({ quota:q.quota, value:q.value, done:q.done, active:q.active })),
      padIndex: S.padIndex,
      quotaTotal: S.quotaTotal,
      countdown: S.countdown,
      upg: Object.assign({}, S.upg),
      bot: !!window.__botActive
    };
  }
};
})();
