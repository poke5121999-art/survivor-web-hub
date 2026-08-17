/*
 * VOID DIVER (web) — an extraction dive built from the systems of
 * "VOID DIVER: Escape from the Abyss" (Steam demo, appid 4347080).
 *
 * WHY this file exists as one module: the three meters (light fuel, corruption,
 * depth) are mutually dependent — light spends fuel and suppresses corruption,
 * corruption rewrites what the renderer is allowed to tell the truth about, and
 * depth scales both. Splitting them across files would mean three modules
 * reaching into each other's state every frame.
 * ROOT-CAUSE: the original game models the same coupling (CurrentLightFuel,
 * CorruptionState and CurrentDepth are all fields of one unit-stat block).
 * SEE: docs/patches/phase-5.4-patch-24-voiddiver-web-game.md
 *
 * NOTHING here is taken from the demo's assets. Every number below is either
 * read out of the demo's own ScriptableObject data / IL2CPP metadata (marked
 * `src:`) or derived to fit a five-minute browser run. All art is drawn in code.
 */
(function (global) {
  'use strict';

  // ==================================================================== tuning
  // One object, so retuning the whole game is one edit. `src:` marks a value
  // read out of the shipped demo rather than invented here.
  const TUNE = {
    tile: 32,
    mapW: 46, mapH: 46,

    // --- player stat block. Field names mirror the demo's own stat schema
    // src: global-metadata.dat — BaseHpMax / BaseHpRegen / BaseAtk / BaseAtkSpeed
    //      / BaseDef / DefReduction / BaseStaminaMax / BaseStaminaRegen
    //      / CriticalChance / AttackRange / BaseCorruptionMax
    BaseHpMax: 100,
    BaseHpRegen: 0,          // src: demo regens only out of the dive
    BaseAtk: 12,
    BaseAtkSpeed: 1.0,       // multiplier on the swing cooldown
    BaseDef: 0,
    CriticalChance: 0.05,
    CriticalMult: 2.0,
    WeakPointMult: 2.5,      // src: WeakPoint exists per-monster in the demo
    AttackRange: 52,
    AttackArc: Math.PI * 0.55,
    SwingCooldown: 0.46,     // seconds at BaseAtkSpeed 1.0
    ComboWindow: 0.9,        // src: anim vocabulary is attack_1 / _2 / _3
    Combo3Mult: 1.65,

    BaseStaminaMax: 100,
    BaseStaminaRegen: 22,
    DodgeCost: 34,
    DodgeSpeed: 560,
    DodgeTime: 0.20,
    DodgeIFrames: 0.18,

    moveSpeed: 168,

    // --- light. Three lantern modes: off / dim / bright.
    // The trade is the whole game: sight vs fuel vs how far you can be noticed.
    LightFuelMax: 100,        // src: CurrentLightFuel
    lantern: [
      { name: 'TẮT',   sight: 92,  burn: 0.00, notice: 0.55, warm: 0.10 },
      { name: 'MỜ',    sight: 205, burn: 0.55, notice: 1.00, warm: 0.55 },
      { name: 'SÁNG',  sight: 340, burn: 1.60, notice: 1.70, warm: 1.00 },
    ],

    // --- corruption. FOUR states, straight out of the demo.
    // src: CharacterBodyGlitchSanityEffectSettings._sequences — State 0..3 with
    //      ActiveRatio 0.0 / 0.4 / 0.5 / 0.6 and IntensityMax 0 / 0 / 0.5 / 1.0,
    //      bursts every 3-5s at states 0-2 and every 0-3s at state 3.
    BaseCorruptionMax: 100,
    corruptionStates: [
      { at: 0,  activeRatio: 0.0, intensityMax: 0.0, delay: [3, 5], dur: [3, 5] },
      { at: 25, activeRatio: 0.4, intensityMax: 0.0, delay: [3, 5], dur: [3, 5] },
      { at: 50, activeRatio: 0.5, intensityMax: 0.5, delay: [3, 5], dur: [3, 5] },
      { at: 75, activeRatio: 0.6, intensityMax: 1.0, delay: [0, 3], dur: [3, 5] },
    ],
    corrDarkRate: 1.05,      // per second while unlit
    corrLitRate: 0.16,       // per second while your own light covers you
    corrPerHit: 5,
    corrPerDescend: 12,

    // --- the stress screen effect. Factors are the demo's own.
    // src: StressPostProcessingScriptableData._stressPostProcessingProperties
    fx: {
      RGBSplitDegree: 0.025,
      MotionSickRotationAngle: 1.0,
      MotionSickRotationDuration: 8.0,
      MotionSickPulseDegree: 0.01,
      MotionSickPulseDuration: 5.0,
      MotionSickShakeDegree: 0.0005,
      GlitchPulseDegree: 0.005,
      GlitchPulseScale: 50.0,
      GlitchPulseStepCutoff: 0.5,
      GlitchPulseFlickerStepCutoff: 0.02,
      PsycheDiveOffset: 0.04,
    },
    // src: UnitStatusVisualData — the demo's "Madness" status colour
    madnessColor: '#c600ff',

    // --- depth scaling
    monsterBase: 3, monsterPerDepth: 1.35, monsterCap: 22,
    mobHp: 26, mobHpPerDepth: 0.34,
    mobDmg: 7, mobDmgPerDepth: 0.26,
    mobSpeed: 74, mobSpeedPerDepth: 0.03,
    lootBase: 5, lootPerDepth: 0.7,
    lootValue: 18, lootValuePerDepth: 0.55,

    // src: ExitCostTable — leaving costs, and leaving from deep costs more
    exitCostBase: 22, exitCostPerDepth: 16,

    noticeRadius: 210,
    loseInterest: 8.0,
    stalkerSpeed: 96,
  };

  // Monster names are identifiers from the demo's Spine skeleton list; the
  // creatures themselves are drawn here from scratch.
  // src: dependencies_assets_spine bundle — 26 Monster_* / 11 Boss_* skeletons
  const MOBS = [
    { id: 'Zombie',       hp: 1.0, dmg: 1.0, spd: 0.85, r: 13, col: '#6f7f63' },
    { id: 'Acolyte',      hp: 0.9, dmg: 1.1, spd: 1.00, r: 12, col: '#8a6b9c' },
    { id: 'AxeMan',       hp: 1.3, dmg: 1.3, spd: 0.90, r: 14, col: '#9c6b5a' },
    { id: 'Spider',       hp: 0.7, dmg: 0.8, spd: 1.45, r: 11, col: '#5a5f7a' },
    { id: 'DeepOne',      hp: 1.5, dmg: 1.2, spd: 0.95, r: 15, col: '#3f7f78' },
    { id: 'Mannequin',    hp: 1.1, dmg: 1.4, spd: 1.10, r: 13, col: '#b9ac96' },
    { id: 'Bigeye',       hp: 1.2, dmg: 1.0, spd: 0.80, r: 16, col: '#a04f5f' },
    { id: 'Phage',        hp: 0.8, dmg: 1.5, spd: 1.25, r: 12, col: '#7a4f8f' },
    { id: 'MonitorMan',   hp: 1.6, dmg: 1.1, spd: 0.85, r: 15, col: '#5f7f9c' },
    { id: 'Zealot',       hp: 1.4, dmg: 1.3, spd: 1.05, r: 14, col: '#96594f' },
  ];
  const BOSSES = [
    { id: 'Hatman',       hp: 6.0, dmg: 1.7, spd: 1.00, r: 22, col: '#4a4458' },
    { id: 'Slender',      hp: 5.0, dmg: 2.0, spd: 1.15, r: 21, col: '#d8d4cc' },
    { id: 'DarkYoung',    hp: 8.0, dmg: 1.6, spd: 0.80, r: 26, col: '#4f5f3f' },
    { id: 'Formless',     hp: 6.5, dmg: 1.8, spd: 0.95, r: 24, col: '#6a3f7a' },
    { id: 'SoulCollector',hp: 7.0, dmg: 1.9, spd: 0.90, r: 23, col: '#7f6a3f' },
  ];

  // src: ArtifactPrefixTable — artifacts roll a prefix that scales their worth
  const PREFIX = [
    { n: 'Nứt',      m: 0.62 }, { n: 'Mờ',      m: 0.78 },
    { n: 'Nguyên',   m: 1.00 }, { n: 'Sâu',     m: 1.28 },
    { n: 'Vọng',     m: 1.60 }, { n: 'Tuyệt',   m: 2.10 },
  ];
  const RELIC = ['Mặt nạ', 'Lăng kính', 'Chuông', 'Ngón tay', 'Hộp', 'Đĩa hát',
                 'Răng', 'Bản khắc', 'Mắt kính', 'Khóa'];

  // src: the demo's Paradox curses persist past the run that caused them
  const PARADOX = [
    { id: 'hollow-lung', name: 'Phổi Rỗng',  desc: 'Thể lực tối đa -25',        apply: s => s.staminaMax -= 25 },
    { id: 'cold-filament', name: 'Tim Đèn Lạnh', desc: 'Đèn hao thêm 35%',      apply: s => s.burnMult *= 1.35 },
    { id: 'whisper-debt', name: 'Nợ Thì Thầm', desc: 'Vào hang đã nhiễm sẵn 20', apply: s => s.corrStart += 20 },
    { id: 'thin-skin',   name: 'Da Mỏng',     desc: 'Giáp -30%',                apply: s => s.defMult *= 0.70 },
    { id: 'greedy-hands',name: 'Tay Tham',    desc: 'Phí rút lên +50%',         apply: s => s.exitMult *= 1.50 },
  ];

  const UPGRADES = [
    { id: 'hp',    name: 'Máu tối đa',      step: '+15',  cost: 60,  grow: 1.45 },
    { id: 'atk',   name: 'Sát thương',      step: '+3',   cost: 70,  grow: 1.50 },
    { id: 'def',   name: 'Giáp',            step: '+6',   cost: 65,  grow: 1.45 },
    { id: 'fuel',  name: 'Nhiên liệu đèn',  step: '+20',  cost: 55,  grow: 1.40 },
    { id: 'corr',  name: 'Chịu nhiễm',      step: '+15',  cost: 75,  grow: 1.50 },
    { id: 'stam',  name: 'Thể lực',         step: '+15',  cost: 50,  grow: 1.38 },
    { id: 'crit',  name: 'Chí mạng',        step: '+3%',  cost: 90,  grow: 1.60 },
  ];

  // ================================================================= utilities
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  // ===================================================================== state
  const S = {
    phase: 'menu',       // menu | dive | exit | shop | dead
    depth: 1,
    seed: 1,
    rng: mulberry32(1),
    t: 0,
    speed: 1,

    // persistent across runs (the meta layer)
    meta: {
      gold: 0,
      runs: 0,
      best: 0,
      paradoxes: [],
      up: { hp: 0, atk: 0, def: 0, fuel: 0, corr: 0, stam: 0, crit: 0 },
    },

    // per-run
    carried: 0,
    bag: [],
    player: null,
    grid: null, segs: null, explored: null,
    mobs: [], loot: [], exit: null, stalker: null,
    fx: { burst: 0, next: 2, intensity: 0, active: false },
    cam: { x: 0, y: 0 },
    log: [],
  };

  function derived() {
    const u = S.meta.up;
    const d = {
      hpMax: TUNE.BaseHpMax + u.hp * 15,
      atk: TUNE.BaseAtk + u.atk * 3,
      def: TUNE.BaseDef + u.def * 6,
      fuelMax: TUNE.LightFuelMax + u.fuel * 20,
      corrMax: TUNE.BaseCorruptionMax + u.corr * 15,
      staminaMax: TUNE.BaseStaminaMax + u.stam * 15,
      crit: TUNE.CriticalChance + u.crit * 0.03,
      burnMult: 1, defMult: 1, exitMult: 1, corrStart: 0,
    };
    for (const pid of S.meta.paradoxes) {
      const p = PARADOX.find(x => x.id === pid);
      if (p) p.apply(d);
    }
    d.def *= d.defMult;
    return d;
  }

  // ============================================================ sector builder
  // Rooms carved into a tile grid, joined by L corridors. Grid is the truth for
  // both collision and the occlusion segments the light is clipped against.
  function buildSector(depth) {
    const rng = S.rng;
    const W = TUNE.mapW, H = TUNE.mapH;
    const g = new Uint8Array(W * H).fill(1); // 1 = wall, 0 = floor
    const at = (x, y) => g[y * W + x];
    const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y * W + x] = v; };

    const rooms = [];
    const want = 8 + Math.min(6, Math.floor(depth * 0.6));
    let guard = 0;
    while (rooms.length < want && guard++ < 400) {
      const rw = 5 + Math.floor(rng() * 7), rh = 5 + Math.floor(rng() * 7);
      const rx = 2 + Math.floor(rng() * (W - rw - 4));
      const ry = 2 + Math.floor(rng() * (H - rh - 4));
      let clash = false;
      for (const r of rooms) {
        if (rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y) { clash = true; break; }
      }
      if (clash) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, 0);
    }
    // corridors: chain the rooms, then a couple of loops so it is not a tree
    for (let i = 1; i < rooms.length; i++) carve(rooms[i - 1], rooms[i]);
    for (let i = 0; i < 2 && rooms.length > 3; i++) {
      carve(rooms[Math.floor(rng() * rooms.length)], rooms[Math.floor(rng() * rooms.length)]);
    }
    function carve(a, b) {
      let x = a.cx, y = a.cy;
      while (x !== b.cx) { set(x, y, 0); set(x, y + 1, 0); x += x < b.cx ? 1 : -1; }
      while (y !== b.cy) { set(x, y, 0); set(x + 1, y, 0); y += y < b.cy ? 1 : -1; }
      set(b.cx, b.cy, 0);
    }

    // pillars — they matter because they break line of sight
    // WHY: a pillar must never land on a room's centre tile. The player and every
    // spawn are placed at room centres, and an entity that starts inside a wall can
    // never leave one: moveEntity probes its own tile on both axes, so all four
    // directions read as blocked and it is frozen for the rest of the run.
    // ROOT-CAUSE: the pillar's random range (r.x+2 .. r.x+w-3) contains r.cx for any
    // room 7 tiles or wider, so this fired on roughly one sector in eight.
    // SEE: docs/patches/phase-5.4-patch-24-voiddiver-web-game.md — found by the bot
    //      freezing at a fixed position on seed 44 with the exit still reachable.
    for (const r of rooms) {
      if (r.w >= 7 && r.h >= 7 && rng() < 0.6) {
        const px = r.x + 2 + Math.floor(rng() * (r.w - 4));
        const py = r.y + 2 + Math.floor(rng() * (r.h - 4));
        if (py === r.cy && (px === r.cx || px + 1 === r.cx)) continue;
        set(px, py, 1); if (rng() < 0.5) set(px + 1, py, 1);
      }
    }

    S.grid = { g, W, H, at, solid: (x, y) => x < 0 || y < 0 || x >= W || y >= H || g[y * W + x] === 1 };
    S.explored = new Uint8Array(W * H);
    S.segs = buildSegments(g, W, H);
    return rooms;
  }

  // A wall tile contributes an edge only where it faces open floor — that keeps
  // the segment count (and so the cost of the visibility polygon) proportional
  // to the visible surface rather than to the map area.
  function buildSegments(g, W, H) {
    const T = TUNE.tile, out = [];
    const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || g[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      const X = x * T, Y = y * T;
      if (!solid(x, y - 1)) out.push([X, Y, X + T, Y]);
      if (!solid(x, y + 1)) out.push([X, Y + T, X + T, Y + T]);
      if (!solid(x - 1, y)) out.push([X, Y, X, Y + T]);
      if (!solid(x + 1, y)) out.push([X + T, Y, X + T, Y + T]);
    }
    return out;
  }

  // ======================================================== visibility polygon
  // Cast to every segment endpoint (plus a hair either side so rays slip past
  // corners), sort by angle, and the resulting fan is exactly what is lit.
  function visPoly(ox, oy, radius) {
    const segs = [];
    const r2 = (radius + TUNE.tile * 2) * (radius + TUNE.tile * 2);
    for (const s of S.segs) {
      const mx = (s[0] + s[2]) * 0.5, my = (s[1] + s[3]) * 0.5;
      if (dist2(ox, oy, mx, my) < r2) segs.push(s);
    }
    const angles = [];
    for (const s of segs) {
      const a1 = Math.atan2(s[1] - oy, s[0] - ox);
      const a2 = Math.atan2(s[3] - oy, s[2] - ox);
      angles.push(a1 - 0.00012, a1, a1 + 0.00012, a2 - 0.00012, a2, a2 + 0.00012);
    }
    // guarantee a closed fan even in a room with no nearby geometry
    for (let i = 0; i < 24; i++) angles.push(-Math.PI + (i / 24) * Math.PI * 2);
    angles.sort((a, b) => a - b);

    const pts = [];
    for (const a of angles) {
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = radius;
      for (const s of segs) {
        const t = raySeg(ox, oy, dx, dy, s[0], s[1], s[2], s[3]);
        if (t !== null && t < best) best = t;
      }
      pts.push([ox + dx * best, oy + dy * best]);
    }
    return pts;
  }
  function raySeg(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1, sy = y2 - y1;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den;
    const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
    if (t >= 0 && u >= 0 && u <= 1) return t;
    return null;
  }

  function losClear(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const steps = Math.ceil(len / (TUNE.tile * 0.4));
    for (let i = 1; i < steps; i++) {
      const x = ax + dx * (i / steps), y = ay + dy * (i / steps);
      if (S.grid.solid(Math.floor(x / TUNE.tile), Math.floor(y / TUNE.tile))) return false;
    }
    return true;
  }

  // ==================================================================== spawns
  function freeSpotFar(fromX, fromY, minDist, rooms) {
    const rng = S.rng, T = TUNE.tile;
    for (let i = 0; i < 500; i++) {
      const r = rooms[Math.floor(rng() * rooms.length)];
      const x = (r.x + 1 + rng() * (r.w - 2)) * T;
      const y = (r.y + 1 + rng() * (r.h - 2)) * T;
      if (S.grid.solid(Math.floor(x / T), Math.floor(y / T))) continue;
      if (dist2(x, y, fromX, fromY) < minDist * minDist) continue;
      return { x, y };
    }
    return { x: fromX + 200, y: fromY };
  }

  // Snap a point to the centre of the nearest open tile. Anything that places an
  // entity goes through this, so "spawned inside geometry" cannot be expressed —
  // the generator is free to change without re-opening the freeze bug above.
  function freeTileNear(x, y) {
    const T = TUNE.tile, G = S.grid;
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    if (!G.solid(cx, cy)) return { x, y };
    for (let ring = 1; ring < 24; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        if (!G.solid(cx + dx, cy + dy)) {
          return { x: (cx + dx + 0.5) * T, y: (cy + dy + 0.5) * T };
        }
      }
    }
    return { x, y };
  }

  function newSector(depth) {
    const rng = S.rng;
    const rooms = buildSector(depth);
    const start = rooms[0];
    const T = TUNE.tile;
    const spawn = freeTileNear((start.cx + 0.5) * T, (start.cy + 0.5) * T);
    const px = spawn.x, py = spawn.y;
    const d = derived();

    if (!S.player) {
      S.player = {
        x: px, y: py, vx: 0, vy: 0, r: 11, face: 0,
        hp: d.hpMax, stamina: d.staminaMax, fuel: d.fuelMax,
        corruption: d.corrStart, lamp: 2,
        swing: 0, combo: 0, comboT: 0, dodge: 0, iframe: 0, hurt: 0,
      };
    } else { S.player.x = px; S.player.y = py; }

    // monsters
    S.mobs = [];
    const n = Math.min(TUNE.monsterCap, Math.round(TUNE.monsterBase + depth * TUNE.monsterPerDepth));
    for (let i = 0; i < n; i++) {
      const kind = MOBS[Math.floor(rng() * MOBS.length)];
      const p = freeSpotFar(px, py, 260, rooms);
      S.mobs.push(makeMob(kind, p.x, p.y, depth, false));
    }
    // a boss every third sector
    if (depth % 3 === 0) {
      const b = BOSSES[Math.floor(rng() * BOSSES.length)];
      const p = freeSpotFar(px, py, 380, rooms);
      S.mobs.push(makeMob(b, p.x, p.y, depth, true));
    }

    // loot
    S.loot = [];
    const ln = Math.round(TUNE.lootBase + depth * TUNE.lootPerDepth);
    for (let i = 0; i < ln; i++) {
      const p = freeSpotFar(px, py, 120, rooms);
      const pf = PREFIX[Math.min(PREFIX.length - 1,
        Math.floor(Math.pow(rng(), 1.8 - Math.min(0.9, depth * 0.06)) * PREFIX.length))];
      const base = TUNE.lootValue * (1 + (depth - 1) * TUNE.lootValuePerDepth);
      S.loot.push({
        x: p.x, y: p.y, r: 9, gone: false,
        name: pf.n + ' ' + RELIC[Math.floor(rng() * RELIC.length)],
        value: Math.round(base * pf.m * (0.85 + rng() * 0.3)),
        tier: PREFIX.indexOf(pf),
      });
    }

    // exit, always far from where you came in
    const e = freeSpotFar(px, py, 520, rooms);
    S.exit = { x: e.x, y: e.y, r: 22 };
    S.stalker = null;
    S.cam.x = px; S.cam.y = py;
  }

  function makeMob(kind, x, y, depth, boss) {
    const hp = TUNE.mobHp * kind.hp * (1 + (depth - 1) * TUNE.mobHpPerDepth);
    return {
      kind: kind.id, boss, x, y, hx: x, hy: y, r: kind.r, col: kind.col,
      hp, hpMax: hp,
      dmg: TUNE.mobDmg * kind.dmg * (1 + (depth - 1) * TUNE.mobDmgPerDepth),
      spd: TUNE.mobSpeed * kind.spd * (1 + (depth - 1) * TUNE.mobSpeedPerDepth),
      state: 'patrol', face: S.rng() * Math.PI * 2, alert: 0, cd: 0, hurt: 0,
      wander: 0, wx: x, wy: y,
    };
  }

  // ==================================================================== combat
  function corruptionState() {
    const d = derived();
    const pct = (S.player.corruption / d.corrMax) * 100;
    let st = 0;
    for (let i = 0; i < TUNE.corruptionStates.length; i++) {
      if (pct >= TUNE.corruptionStates[i].at) st = i;
    }
    return st;
  }

  function hurtPlayer(amount) {
    const p = S.player;
    if (p.iframe > 0 || S.phase !== 'dive') return;
    const d = derived();
    const reduced = amount * (100 / (100 + d.def));
    p.hp -= reduced;
    p.hurt = 0.25;
    p.corruption = Math.min(d.corrMax, p.corruption + TUNE.corrPerHit);
    S.player.iframe = 0.35;
    if (p.hp <= 0) { p.hp = 0; die(); }
  }

  function swing() {
    const p = S.player;
    if (p.swing > 0 || S.phase !== 'dive') return false;
    const d = derived();
    p.swing = TUNE.SwingCooldown / TUNE.BaseAtkSpeed;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1;
    p.comboT = TUNE.ComboWindow;
    let hitAny = false;
    for (const m of S.mobs) {
      if (m.hp <= 0) continue;
      const dd = Math.hypot(m.x - p.x, m.y - p.y);
      if (dd > TUNE.AttackRange + m.r) continue;
      const a = Math.atan2(m.y - p.y, m.x - p.x);
      if (Math.abs(angDiff(a, p.face)) > TUNE.AttackArc * 0.5) continue;

      let dmg = d.atk;
      if (p.combo === 3) dmg *= TUNE.Combo3Mult;
      // weak point: struck from behind. src: WeakPoint is per-monster in the demo
      const fromBehind = Math.abs(angDiff(a, m.face)) < Math.PI * 0.45;
      if (fromBehind) dmg *= TUNE.WeakPointMult;
      else if (S.rng() < d.crit) dmg *= TUNE.CriticalMult;

      m.hp -= dmg; m.hurt = 0.18; hitAny = true;
      m.state = 'chase'; m.alert = TUNE.loseInterest;
      if (m.hp <= 0) onKill(m);
    }
    return hitAny;
  }

  function onKill(m) {
    // src: DropRewardTable + DropRewardProbabilityTable — kills can drop
    if (S.rng() < (m.boss ? 1 : 0.4)) {
      const pf = PREFIX[Math.min(PREFIX.length - 1, Math.floor(S.rng() * PREFIX.length))];
      const base = TUNE.lootValue * (1 + (S.depth - 1) * TUNE.lootValuePerDepth) * (m.boss ? 3 : 1);
      S.loot.push({
        x: m.x, y: m.y, r: 9, gone: false,
        name: pf.n + ' ' + RELIC[Math.floor(S.rng() * RELIC.length)],
        value: Math.round(base * pf.m), tier: PREFIX.indexOf(pf),
      });
    }
  }

  function dodge() {
    const p = S.player; const d = derived();
    if (p.dodge > 0 || p.stamina < TUNE.DodgeCost) return false;
    p.stamina -= TUNE.DodgeCost;
    p.dodge = TUNE.DodgeTime; p.iframe = TUNE.DodgeIFrames;
    return true;
  }

  // ================================================================ run phases
  function exitCost() {
    const d = derived();
    return Math.round((TUNE.exitCostBase + (S.depth - 1) * TUNE.exitCostPerDepth) * d.exitMult);
  }
  function canExtract() { return S.carried >= exitCost(); }

  function extract() {
    if (S.phase !== 'exit' || !canExtract()) return false;
    S.meta.gold += S.carried - exitCost();
    S.meta.best = Math.max(S.meta.best, S.depth);
    S.meta.runs++;
    S.log.push('Rút lên từ tầng ' + S.depth + ', mang về ' + (S.carried - exitCost()) + ' vàng.');
    endRun();
    S.phase = 'shop';
    return true;
  }

  function descend() {
    if (S.phase !== 'exit') return false;
    const d = derived();
    S.depth++;
    S.player.corruption = Math.min(d.corrMax, S.player.corruption + TUNE.corrPerDescend);
    newSector(S.depth);
    S.phase = 'dive';
    return true;
  }

  function die() {
    const d = derived();
    S.meta.best = Math.max(S.meta.best, S.depth);
    S.meta.runs++;
    // src: Paradoxes are curses that linger past the expedition
    const avail = PARADOX.filter(p => !S.meta.paradoxes.includes(p.id));
    let got = null;
    if (avail.length) {
      got = avail[Math.floor(S.rng() * avail.length)];
      S.meta.paradoxes.push(got.id);
    }
    S.log.push('Chết ở tầng ' + S.depth + '. Mất ' + S.carried + ' vàng đồ mang theo.' +
      (got ? ' Dính nghịch lý: ' + got.name + '.' : ''));
    endRun();
    S.phase = 'dead';
    save();
  }

  function endRun() {
    S.carried = 0; S.bag = []; S.player = null; S.depth = 1;
    save();
  }

  function newRun(seed) {
    S.seed = seed === undefined ? (Date.now() % 100000) : seed;
    S.rng = mulberry32(S.seed);
    S.depth = 1; S.carried = 0; S.bag = []; S.player = null;
    newSector(1);
    S.phase = 'dive';
  }

  // ============================================================== persistence
  const KEY = 'voiddiver.meta.v1';
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S.meta)); } catch (e) { /* file:// */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(S.meta, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  // ==================================================================== update
  const input = { up: 0, down: 0, left: 0, right: 0, mx: 0, my: 0, attack: false, dodge: false };

  function step(dt) {
    S.t += dt;
    if (S.phase !== 'dive') return;
    const p = S.player, d = derived();

    // ---- timers
    p.swing = Math.max(0, p.swing - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    if (p.comboT === 0) p.combo = 0;
    p.dodge = Math.max(0, p.dodge - dt);
    p.iframe = Math.max(0, p.iframe - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.stamina = Math.min(d.staminaMax, p.stamina + TUNE.BaseStaminaRegen * dt);

    // ---- movement
    let ax = (input.right - input.left), ay = (input.down - input.up);
    const mag = Math.hypot(ax, ay);
    if (mag > 0) { ax /= mag; ay /= mag; }
    const spd = p.dodge > 0 ? TUNE.DodgeSpeed : TUNE.moveSpeed;
    if (p.dodge > 0 && mag === 0) { ax = Math.cos(p.face); ay = Math.sin(p.face); }
    moveEntity(p, ax * spd * dt, ay * spd * dt);
    if (mag > 0 && p.dodge === 0) p.face = Math.atan2(ay, ax);

    // aim overrides facing when the pointer has moved
    if (input.aimed) p.face = Math.atan2(input.my - p.y, input.mx - p.x);

    if (input.attack) { swing(); input.attack = false; }
    if (input.dodge) { dodge(); input.dodge = false; }

    // ---- light
    const lamp = TUNE.lantern[p.lamp];
    if (lamp.burn > 0) {
      p.fuel = Math.max(0, p.fuel - lamp.burn * d.burnMult * dt);
      if (p.fuel === 0) p.lamp = 0;
    }
    const lit = p.lamp > 0 && p.fuel > 0;

    // ---- corruption. Dark is what drives it; your own light holds it back.
    const rate = lit ? TUNE.corrLitRate : TUNE.corrDarkRate;
    p.corruption = clamp(p.corruption + rate * dt, 0, d.corrMax);

    // the screen effect fires in bursts whose frequency/strength come from the
    // demo's own per-state sequence table
    const st = corruptionState();
    const cs = TUNE.corruptionStates[st];
    S.fx.burst -= dt;
    if (S.fx.burst <= 0) {
      S.fx.active = S.rng() < cs.activeRatio;
      const span = S.fx.active ? cs.dur : cs.delay;
      S.fx.burst = span[0] + S.rng() * (span[1] - span[0]);
    }
    const target = S.fx.active ? cs.intensityMax : 0;
    S.fx.intensity += (target - S.fx.intensity) * Math.min(1, dt / 0.5);

    // at the top state the abyss sends something after you
    if (st >= 3 && !S.stalker) {
      const far = freeSpotFar(p.x, p.y, 460, [{ x: 1, y: 1, w: TUNE.mapW - 2, h: TUNE.mapH - 2 }]);
      S.stalker = { x: far.x, y: far.y, r: 16 };
      S.log.push('Có thứ gì đó bắt đầu đi theo bạn.');
    }
    if (st < 3 && S.stalker) S.stalker = null;
    if (S.stalker) {
      const a = Math.atan2(p.y - S.stalker.y, p.x - S.stalker.x);
      moveEntity(S.stalker, Math.cos(a) * TUNE.stalkerSpeed * dt, Math.sin(a) * TUNE.stalkerSpeed * dt);
      if (dist2(S.stalker.x, S.stalker.y, p.x, p.y) < 26 * 26) hurtPlayer(14 * dt * 60 / 60 + 8 * dt);
    }

    // ---- monsters
    const noticeR = TUNE.noticeRadius * lamp.notice;
    for (const m of S.mobs) {
      if (m.hp <= 0) continue;
      m.hurt = Math.max(0, m.hurt - dt);
      m.cd = Math.max(0, m.cd - dt);
      const dd = Math.hypot(p.x - m.x, p.y - m.y);

      if (dd < noticeR && losClear(m.x, m.y, p.x, p.y)) {
        m.state = 'chase'; m.alert = TUNE.loseInterest;
      } else if (m.alert > 0) {
        m.alert -= dt;
        if (m.alert <= 0) m.state = 'return';
      }

      if (m.state === 'chase') {
        const a = Math.atan2(p.y - m.y, p.x - m.x);
        m.face = a;
        if (dd > m.r + p.r + 4) moveEntity(m, Math.cos(a) * m.spd * dt, Math.sin(a) * m.spd * dt);
        else if (m.cd === 0) {
          hurtPlayer(m.dmg); m.cd = 1.15;
          // the hit may have ended the run; nothing below this point is valid then
          if (S.phase !== 'dive') return;
        }
      } else if (m.state === 'return') {
        const a = Math.atan2(m.hy - m.y, m.hx - m.x);
        if (Math.hypot(m.hx - m.x, m.hy - m.y) > 12) {
          m.face = a; moveEntity(m, Math.cos(a) * m.spd * 0.6 * dt, Math.sin(a) * m.spd * 0.6 * dt);
        } else m.state = 'patrol';
      } else {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 1.4 + S.rng() * 2.2; m.face = S.rng() * Math.PI * 2; }
        moveEntity(m, Math.cos(m.face) * m.spd * 0.32 * dt, Math.sin(m.face) * m.spd * 0.32 * dt);
      }
    }

    // ---- loot pickup
    for (const l of S.loot) {
      if (l.gone) continue;
      if (dist2(l.x, l.y, p.x, p.y) < (l.r + p.r + 6) * (l.r + p.r + 6)) {
        l.gone = true; S.carried += l.value; S.bag.push({ name: l.name, value: l.value });
      }
    }

    // ---- exit reached
    if (S.exit && dist2(S.exit.x, S.exit.y, p.x, p.y) < (S.exit.r + p.r) * (S.exit.r + p.r)) {
      S.phase = 'exit';
    }

    // ---- explored memory
    markExplored(p.x, p.y, TUNE.lantern[p.lamp].sight);
    S.cam.x = lerp(S.cam.x, p.x, Math.min(1, dt * 6));
    S.cam.y = lerp(S.cam.y, p.y, Math.min(1, dt * 6));
  }

  function moveEntity(e, dx, dy) {
    const T = TUNE.tile;
    const solidAt = (x, y) => S.grid.solid(Math.floor(x / T), Math.floor(y / T));
    const r = e.r * 0.7;
    // WHY: an entity whose own tile is solid must be allowed to walk out. Every
    // probe below includes its current column or row, so from inside a wall all
    // four directions read as blocked and the entity is frozen permanently.
    // ROOT-CAUSE: collision is sampled at offsets from the entity, which is only
    // sound while the entity itself stands on open floor.
    // SEE: the pillar-on-spawn freeze in buildSector above.
    if (solidAt(e.x, e.y)) { e.x += dx; e.y += dy; return; }
    if (!solidAt(e.x + dx + Math.sign(dx) * r, e.y) &&
        !solidAt(e.x + dx + Math.sign(dx) * r, e.y - r) &&
        !solidAt(e.x + dx + Math.sign(dx) * r, e.y + r)) e.x += dx;
    if (!solidAt(e.x, e.y + dy + Math.sign(dy) * r) &&
        !solidAt(e.x - r, e.y + dy + Math.sign(dy) * r) &&
        !solidAt(e.x + r, e.y + dy + Math.sign(dy) * r)) e.y += dy;
  }

  function markExplored(x, y, radius) {
    const T = TUNE.tile, G = S.grid;
    const r = Math.ceil(radius / T);
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (tx < 0 || ty < 0 || tx >= G.W || ty >= G.H) continue;
        const wx = (tx + 0.5) * T, wy = (ty + 0.5) * T;
        if (dist2(wx, wy, x, y) > radius * radius) continue;
        if (losClear(x, y, wx, wy)) S.explored[ty * G.W + tx] = 1;
      }
    }
  }

  // ==================================================================== public
  function state() {
    const d = derived();
    const p = S.player;
    return {
      phase: S.phase, depth: S.depth, seed: S.seed,
      gold: S.meta.gold, carried: S.carried, bagCount: S.bag.length,
      exitCost: exitCost(), canExtract: canExtract(),
      paradoxes: S.meta.paradoxes.slice(),
      runs: S.meta.runs, best: S.meta.best,
      upgrades: Object.assign({}, S.meta.up),
      hp: p ? p.hp : 0, hpMax: d.hpMax,
      fuel: p ? p.fuel : 0, fuelMax: d.fuelMax,
      corruption: p ? p.corruption : 0, corrMax: d.corrMax,
      corruptionState: p ? corruptionState() : 0,
      stamina: p ? p.stamina : 0, staminaMax: d.staminaMax,
      lamp: p ? p.lamp : 0, lampName: p ? TUNE.lantern[p.lamp].name : '-',
      atk: d.atk, def: d.def, crit: d.crit,
      mobs: S.mobs.filter(m => m.hp > 0).length,
      mobsTotal: S.mobs.length,
      loot: S.loot.filter(l => !l.gone).length,
      lootTotal: S.loot.length,
      stalker: !!S.stalker,
      fxIntensity: S.fx.intensity,
      px: p ? p.x : 0, py: p ? p.y : 0,
      exitX: S.exit ? S.exit.x : 0, exitY: S.exit ? S.exit.y : 0,
      log: S.log.slice(-6),
    };
  }

  function buy(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u || S.phase !== 'shop' && S.phase !== 'dead' && S.phase !== 'menu') return false;
    const lvl = S.meta.up[id] || 0;
    const cost = Math.round(u.cost * Math.pow(u.grow, lvl));
    if (S.meta.gold < cost) return false;
    S.meta.gold -= cost; S.meta.up[id] = lvl + 1; save();
    return true;
  }
  function upgradeCost(id) {
    const u = UPGRADES.find(x => x.id === id);
    return Math.round(u.cost * Math.pow(u.grow, S.meta.up[id] || 0));
  }
  function cureCost() { return 120 + S.meta.paradoxes.length * 80; }
  function cure() {
    if (!S.meta.paradoxes.length || S.meta.gold < cureCost()) return false;
    S.meta.gold -= cureCost(); S.meta.paradoxes.shift(); save();
    return true;
  }

  load();

  global.VD = {
    TUNE, S, MOBS, BOSSES, PARADOX, UPGRADES, PREFIX,
    state, step, newRun, descend, extract, die, hurtPlayer, swing, dodge,
    buy, upgradeCost, cure, cureCost, exitCost, canExtract, corruptionState,
    visPoly, losClear, derived, input, save, load,
    setPhase: v => { S.phase = v; },
    reset: () => { S.meta = { gold: 0, runs: 0, best: 0, paradoxes: [], up: { hp: 0, atk: 0, def: 0, fuel: 0, corr: 0, stam: 0, crit: 0 } }; save(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
