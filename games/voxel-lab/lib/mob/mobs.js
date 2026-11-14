// Voxel Lab - voxel mobs: blocky characters built from per-part voxel volumes on a simple skeleton.
// Damage carves a part's voxels with the same p0/toughness rule as the world; a limb comes off as a rigid body
// when the voxels of its joint are destroyed; death drops every part as a body that ends as rubble.
// Techniques studied from Voxel Engine by mattshumer (spawn.co) (voxel carve / body / rubble pipeline); code is our own.
import { THREE } from '../render/renderer.js';
import { VoxelGrid } from '../grid.js';
import { M, F, flags, p0 } from '../materials.js';
import { hash3, rng } from '../hash.js';
import { rayGrid } from '../sim/bodies.js';
import { GY, WX, WZ } from '../sim/world.js';

const fill = (g, x0, y0, z0, x1, y1, z1, m) => { for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) g.set(x, y, z, m, 1); };

// part: [name, parent, size, pivot (in part voxels), attach (in parent voxels; for the root: offset from the feet), paint(g, r, c)]
function humanoid(o) {
  const { legH, legW, torso: [tw, th, td], head: [hw, hh, hd], armW, armH } = o;
  const parts = [
    ['torso', null, [tw, th, td], [tw / 2, 0, td / 2], [0, legH, 0], o.paintTorso],
    ['head', 'torso', [hw, hh, hd], [hw / 2, 0, hd / 2], [tw / 2, th, td / 2], o.paintHead],
    ['armL', 'torso', [armW, armH, armW], [armW, armH - 1, armW / 2], [0, th - 1, td / 2], o.paintArm],
    ['armR', 'torso', [armW, armH, armW], [0, armH - 1, armW / 2], [tw, th - 1, td / 2], o.paintArm],
    ['legL', 'torso', [legW, legH, legW], [legW / 2, legH, legW / 2], [tw / 2 - legW / 2 - (o.legGap || 0), 0, td / 2], o.paintLeg],
    ['legR', 'torso', [legW, legH, legW], [legW / 2, legH, legW / 2], [tw / 2 + legW / 2 + (o.legGap || 0), 0, td / 2], o.paintLeg],
  ];
  for (const e of o.extra || []) parts.push(e);
  return parts;
}
const eyes = (g, w, h, d, m, y = 2) => { g.set(Math.floor(w / 2) - 2 + (w & 1 ? 1 : 0), y, d - 1, m, 1); g.set(Math.floor(w / 2) + 1, y, d - 1, m, 1); };

export const MOB_DEFS = [
  {
    id: 'soldier', name: 'Lính', speed: 1.3, hpK: 0.3, anim: 'human', pose: { armR: -1.25 },
    parts: (r) => {
      const cloth = r.pick([M.cloth_green, M.cloth_brown, M.cloth_green]);
      return humanoid({
        legH: 7, legW: 3, torso: [6, 7, 4], head: [5, 5, 5], armW: 2, armH: 7,
        paintTorso: g => { fill(g, 0, 0, 0, 6, 7, 4, cloth); fill(g, 0, 2, 0, 6, 6, 4, M.armour); fill(g, 1, 2, 1, 5, 6, 3, M.flesh); fill(g, 0, 0, 0, 6, 1, 4, M.cloth_brown); fill(g, 1, 0, 1, 5, 2, 3, M.flesh); },
        paintHead: g => { fill(g, 0, 0, 0, 5, 5, 5, M.skin); fill(g, 1, 1, 1, 4, 4, 4, M.flesh); fill(g, 2, 0, 2, 3, 4, 3, M.bone); fill(g, 0, 3, 0, 5, 5, 5, M.armour); fill(g, 1, 3, 1, 4, 4, 4, M.bone); eyes(g, 5, 5, 5, M.hair); },
        paintArm: g => { fill(g, 0, 0, 0, 2, 7, 2, cloth); fill(g, 0, 0, 0, 2, 1, 2, M.skin); },
        paintLeg: g => { fill(g, 0, 0, 0, 3, 7, 3, cloth); fill(g, 1, 1, 1, 2, 7, 2, M.bone); fill(g, 0, 0, 0, 3, 2, 3, M.hair); },
        extra: [['gun', 'armR', [1, 9, 2], [0.5, 8, 1], [1, 1, 1.5], g => { fill(g, 0, 0, 0, 1, 9, 1, M.iron); fill(g, 0, 6, 1, 1, 9, 2, M.wood_dark); }]],
      });
    },
  },
  {
    id: 'villager', name: 'Dân làng (nón lá)', speed: 1.0, hpK: 0.25, anim: 'human',
    parts: (r) => {
      const shirt = r.pick([M.cloth_brown, M.cloth_blue, M.cloth_white, M.cloth_red]), trousers = r.pick([M.hair, M.cloth_brown, M.cloth_blue]);
      return humanoid({
        legH: 7, legW: 3, torso: [6, 6, 3], head: [5, 5, 5], armW: 2, armH: 6,
        paintTorso: g => { fill(g, 0, 0, 0, 6, 6, 3, shirt); fill(g, 1, 0, 1, 5, 5, 2, M.flesh); },
        paintHead: g => { fill(g, 0, 0, 0, 5, 5, 5, M.skin); fill(g, 1, 1, 1, 4, 4, 4, M.flesh); fill(g, 2, 0, 2, 3, 4, 3, M.bone); fill(g, 0, 3, 0, 5, 5, 1, M.hair); fill(g, 0, 4, 0, 5, 5, 5, M.hair); eyes(g, 5, 5, 5, M.hair); },
        paintArm: g => { fill(g, 0, 0, 0, 2, 6, 2, M.skin); fill(g, 0, 3, 0, 2, 6, 2, shirt); },
        paintLeg: g => { fill(g, 0, 0, 0, 3, 7, 3, trousers); fill(g, 1, 1, 1, 2, 7, 2, M.bone); fill(g, 0, 0, 0, 3, 1, 3, M.skin); },
        // nón lá: a stepped straw cone
        extra: [['hat', 'head', [11, 4, 11], [5.5, 0, 5.5], [2.5, 4.4, 2.5], g => { for (let y = 0; y < 4; y++) { const k = y * 1.5; for (let z = 0; z < 11; z++) for (let x = 0; x < 11; x++) if (Math.hypot(x - 5, z - 5) <= 5.4 - k) g.set(x, y, z, M.straw, 1); } }]],
      });
    },
  },
  {
    id: 'zombie', name: 'Thây ma', speed: 0.7, hpK: 0.45, anim: 'human', pose: { armL: -1.35, armR: -1.2 }, lurch: 1, claw: 1,
    parts: (r) => {
      const rag = r.pick([M.cloth_brown, M.cloth_blue, M.cloth_green]);
      const rot = (g, sx, sy, sz, s) => { for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) if (g.get(x, y, z) && (hash3(x, y, z, s) & 7) === 0) g.set(x, y, z, (hash3(x, y, z, s + 1) & 1) ? M.flesh : M.bone, 1); };
      return humanoid({
        legH: 7, legW: 3, torso: [6, 7, 4], head: [5, 5, 5], armW: 2, armH: 7,
        paintTorso: g => { fill(g, 0, 0, 0, 6, 7, 4, rag); fill(g, 1, 0, 1, 5, 7, 3, M.flesh); fill(g, 2, 1, 2, 4, 6, 3, M.bone); fill(g, 0, 4, 0, 3, 7, 4, M.flesh_zombie); rot(g, 6, 7, 4, 3); },
        paintHead: g => { fill(g, 0, 0, 0, 5, 5, 5, M.flesh_zombie); fill(g, 1, 1, 1, 4, 4, 4, M.flesh); fill(g, 2, 0, 2, 3, 4, 3, M.bone); g.set(1, 2, 4, M.eye_glow, 1); g.set(3, 2, 4, M.hair, 1); fill(g, 1, 0, 4, 4, 1, 5, M.bone); rot(g, 5, 5, 5, 5); },
        paintArm: g => { fill(g, 0, 0, 0, 2, 7, 2, M.flesh_zombie); fill(g, 0, 5, 0, 2, 7, 2, rag); rot(g, 2, 7, 2, 7); },
        paintLeg: g => { fill(g, 0, 0, 0, 3, 7, 3, rag); fill(g, 1, 1, 1, 2, 7, 2, M.bone); fill(g, 0, 0, 0, 3, 2, 3, M.flesh_zombie); rot(g, 3, 7, 3, 9); },
      });
    },
  },
  {
    id: 'golem', name: 'Người đá', speed: 0.6, hpK: 0.5, anim: 'human', heavy: 1, smash: 0.7, radius: 2.2,
    parts: () => {
      const stone = (g, sx, sy, sz, s) => { for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) g.set(x, y, z, (hash3(x >> 1, y >> 1, z >> 1, s) & 7) === 0 ? M.moss : M.golem_stone, 1); };
      return humanoid({
        legH: 9, legW: 5, legGap: 1, torso: [14, 11, 8], head: [6, 5, 6], armW: 5, armH: 14,
        paintTorso: g => { stone(g, 14, 11, 8, 1); fill(g, 5, 4, 7, 9, 8, 8, M.eye_glow); },
        paintHead: g => { stone(g, 6, 5, 6, 2); g.set(1, 2, 5, M.eye_glow, 1); g.set(4, 2, 5, M.eye_glow, 1); },
        paintArm: g => { stone(g, 5, 14, 5, 3); fill(g, 0, 0, 0, 5, 4, 5, M.golem_stone); },
        paintLeg: g => { stone(g, 5, 9, 5, 4); },
      });
    },
  },
  {
    id: 'spider', name: 'Nhện khổng lồ', speed: 1.6, hpK: 0.4, anim: 'spider', radius: 1.8, claw: 1,
    parts: () => {
      const P = [
        ['thorax', null, [8, 5, 8], [4, 0, 4], [0, 5, 0], g => { fill(g, 0, 0, 0, 8, 5, 8, M.chitin); fill(g, 1, 1, 1, 7, 4, 7, M.flesh_zombie); for (const x of [1, 3, 4, 6]) g.set(x, 3, 7, M.eye_glow, 1); fill(g, 2, 0, 7, 3, 2, 8, M.bone); fill(g, 5, 0, 7, 6, 2, 8, M.bone); }],
        ['abdomen', 'thorax', [12, 9, 14], [6, 3, 14], [4, 2, 0.5], g => { for (let y = 0; y < 9; y++) for (let z = 0; z < 14; z++) for (let x = 0; x < 12; x++) { const d = ((x - 5.5) / 6) ** 2 + ((y - 4) / 4.5) ** 2 + ((z - 6.5) / 7) ** 2; if (d <= 1) g.set(x, y, z, d > 0.55 ? ((hash3(x >> 1, y, z >> 1, 3) & 7) === 0 ? M.cloth_red : M.chitin) : M.flesh_zombie, 1); } }],
      ];
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const n = (s < 0 ? 'L' : 'R') + i, z = 1 + i * 2;
        P.push(['leg' + n, 'thorax', [9, 2, 2], [s < 0 ? 9 : 0, 1, 1], [s < 0 ? 0 : 8, 3, z], g => fill(g, 0, 0, 0, 9, 2, 2, M.chitin)]);
        P.push(['shin' + n, 'leg' + n, [2, 10, 2], [1, 10, 1], [s < 0 ? 1 : 8, 1, 1], g => { fill(g, 0, 0, 0, 2, 10, 2, M.chitin); fill(g, 0, 0, 0, 2, 1, 2, M.bone); }]);
      }
      return P;
    },
  },
  {
    id: 'robot', name: 'Người máy', speed: 0.9, hpK: 0.45, anim: 'human', stiff: 1, smash: 0.45, radius: 1.6,
    parts: (r) => {
      const paint = r.pick([M.paint_yellow, M.paint_red, M.cloth_blue]);
      return humanoid({
        legH: 8, legW: 3, legGap: 1, torso: [9, 8, 5], head: [5, 4, 5], armW: 3, armH: 9,
        paintTorso: g => { fill(g, 0, 0, 0, 9, 8, 5, M.robot_metal); fill(g, 1, 1, 1, 8, 7, 4, M.iron); fill(g, 2, 3, 4, 7, 6, 5, paint); g.set(4, 4, 4, M.eye_glow, 1); fill(g, 0, 7, 0, 9, 8, 5, M.armour); },
        paintHead: g => { fill(g, 0, 0, 0, 5, 4, 5, M.robot_metal); fill(g, 1, 1, 1, 4, 3, 4, M.iron); fill(g, 0, 2, 4, 5, 3, 5, M.eye_glow); g.set(2, 3, 2, M.iron, 1); },
        paintArm: g => { fill(g, 0, 0, 0, 3, 9, 3, M.robot_metal); fill(g, 0, 4, 0, 3, 5, 3, M.iron); fill(g, 0, 0, 0, 3, 2, 3, paint); fill(g, 1, 1, 1, 2, 8, 2, M.iron); },
        paintLeg: g => { fill(g, 0, 0, 0, 3, 8, 3, M.robot_metal); fill(g, 0, 4, 0, 3, 5, 3, M.iron); fill(g, 0, 0, 0, 3, 1, 3, M.armour); fill(g, 1, 1, 1, 2, 7, 2, M.iron); },
        extra: [['antenna', 'head', [1, 4, 1], [0.5, 0, 0.5], [3.5, 4, 1.5], g => { fill(g, 0, 0, 0, 1, 4, 1, M.iron); g.set(0, 3, 0, M.eye_glow, 1); }]],
      });
    },
  },
];

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Mobs {
  constructor(world, R) { this.world = world; this.R = R; this.list = []; this.group = new THREE.Group(); R.scene.add(this.group); this.killed = 0; world.hooks.blast = (x, y, z, r, p) => this.blast(x, y, z, r, p); }
  clear() { for (const m of this.list.slice()) this.removeMob(m); this.list = []; }
  removeMob(m) { for (const p of m.parts) if (p.attached) { this.R.removeView(p.view); } m.root.removeFromParent(); const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1); }

  spawn(id, x, z, seed = 1, yaw = 0) {
    const def = MOB_DEFS.find(d => d.id === id); if (!def) return null;
    const r = rng(seed * 7919 + 13), pd = def.parts(r);
    const root = new THREE.Group(); this.group.add(root);
    const mob = { def, root, parts: [], x, z, y: this.world.groundY(Math.floor(x * 10), Math.floor(z * 10), 60) * 0.1, yaw, state: 'idle', t: r() * 3, phase: r() * 6, atk: 0, hitT: 0, wait: 1 + r() * 2, tx: x, tz: z, r, vox: 0, hp: 1, kx: 0, kz: 0, seed, alive: true, vy: 0 };
    const byName = {};
    for (const [name, parent, size, pivot, attach, paint] of pd) {
      const grid = new VoxelGrid(size[0], size[1], size[2]); paint(grid, r);
      const view = this.R.addView(grid);
      const node = new THREE.Group(); const par = parent ? byName[parent] : null;
      view.group.removeFromParent(); node.add(view.group); view.group.position.set(-pivot[0] * 0.1, -pivot[1] * 0.1, -pivot[2] * 0.1);
      if (par) { par.node.add(node); node.position.set((attach[0] - par.pivot[0]) * 0.1, (attach[1] - par.pivot[1]) * 0.1, (attach[2] - par.pivot[2]) * 0.1); }
      else { root.add(node); node.position.set(attach[0] * 0.1, attach[1] * 0.1, attach[2] * 0.1); }
      // joint = the voxels within 2 of the pivot
      let joint = 0; const jb = [pivot[0] - 2.5, pivot[1] - 2.5, pivot[2] - 2.5, pivot[0] + 2.5, pivot[1] + 2.5, pivot[2] + 2.5];
      grid.forEach((vx, vy, vz) => { if (vx + 0.5 > jb[0] && vx + 0.5 < jb[3] && vy + 0.5 > jb[1] && vy + 0.5 < jb[4] && vz + 0.5 > jb[2] && vz + 0.5 < jb[5]) joint++; });
      const part = { name, grid, view, node, parent: par, pivot, size, base: node.position.clone(), attached: true, vox0: grid.solid, joint0: joint, jb, inv: new THREE.Matrix4(), children: [] };
      if (par) par.children.push(part);
      byName[name] = part; mob.parts.push(part); mob.vox += grid.solid;
    }
    mob.byName = byName; mob.hp = mob.hpMax = Math.max(20, mob.vox * def.hpK);
    mob.radius = def.radius || 1.3;
    root.position.set(mob.x, mob.y, mob.z); root.rotation.y = yaw;
    this.list.push(mob);
    return mob;
  }

  // ------------------------------------------------------------ damage
  /** carve a sphere out of every part it touches; returns voxels removed */
  damageSphere(mob, wx, wy, wz, r, power, dx = 0, dy = 0, dz = 0) {
    const W = this.world, R = r * 10; let total = 0;
    for (const p of mob.parts) {
      if (!p.attached) continue;
      _v.set(wx, wy, wz).applyMatrix4(p.inv);
      const g = p.grid, lx = _v.x, ly = _v.y, lz = _v.z;
      if (lx < -R || ly < -R || lz < -R || lx > p.size[0] + R || ly > p.size[1] + R || lz > p.size[2] + R) continue;
      let n = 0;
      for (let y = Math.max(0, Math.floor(ly - R)); y <= Math.min(p.size[1] - 1, ly + R); y++) for (let z = Math.max(0, Math.floor(lz - R)); z <= Math.min(p.size[2] - 1, lz + R); z++) for (let x = Math.max(0, Math.floor(lx - R)); x <= Math.min(p.size[0] - 1, lx + R); x++) {
        const m = g.get(x, y, z); if (!m) continue;
        const fac = Math.min(Math.max((power - p0[m]) / 0.12, 0), 1); if (fac <= 0) continue;
        const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly, z + 0.5 - lz);
        if (d > R * fac * (0.8 + 0.4 * (hash3(x, y, z, 3) & 255) / 255)) continue;
        g.set(x, y, z, 0); n++;
        if ((hash3(x, y, z, W.step) & 3) < 2) {
          _p.set(x + 0.5, y + 0.5, z + 0.5).applyMatrix4(p.view.inner.matrixWorld);
          const h = hash3(x, y, z, W.step + 9);
          W.spawnDebris(_p.x, _p.y, _p.z, dx * 3 + ((h & 255) - 128) * 0.02, dy * 3 + 1.5 + ((h >> 8) & 255) * 0.008, dz * 3 + (((h >> 16) & 255) - 128) * 0.02, m, 1); W.led.built++;
        }
      }
      if (n) {
        total += n;
        const metal = flags[mob.def.id === 'robot' ? M.robot_metal : M.flesh] & F.METAL, stone = mob.def.id === 'golem';
        if (metal) for (let i = 0; i < 5; i++) { const h = hash3(i, W.step, n, 4); W.sprite(wx, wy, wz, 0.04, 1, 0.8, 0.4, 1, 3, ((h & 255) - 128) * 0.04, ((h >> 8) & 255) * 0.02, (((h >> 16) & 255) - 128) * 0.04, 0.3, 0, 6); }
        else W.dust(wx, wy, wz, Math.min(6, 1 + n / 6), r * 0.6, 0.25 + r, 0.7, 0.7, stone ? 0.5 : 0.5, stone ? 0.5 : 0.08, stone ? 0.48 : 0.08);
        this.checkJoint(mob, p);
      }
    }
    if (total) { mob.hp -= total; mob.hitT = 0.3; W.ev('mobhit', wx, wy, wz, total, mob.def.id === 'robot' ? M.robot_metal : mob.def.id === 'golem' ? M.golem_stone : M.flesh); if (mob.hp <= 0 && mob.alive) this.die(mob, dx * 2, 1.5, dz * 2); }
    return total;
  }
  checkJoint(mob, p) {
    if (!mob.alive || !p.attached) return;
    const jb = p.jb; let j = 0;
    p.grid.forEach((x, y, z) => { if (x + 0.5 > jb[0] && x + 0.5 < jb[3] && y + 0.5 > jb[1] && y + 0.5 < jb[4] && z + 0.5 > jb[2] && z + 0.5 < jb[5]) j++; });
    const gone = p.grid.solid < p.vox0 * 0.3;
    if (!p.parent) { if (gone || j < p.joint0 * 0.2) this.die(mob, 0, 1, 0); return; }
    if (j < p.joint0 * 0.4 || gone) {
      this.detach(mob, p, 0, 1, 0);
      if (p.name === 'head') this.die(mob, 0, 1, 0);
      else if (p.name.startsWith('leg') && mob.def.anim === 'human') { mob.hp -= mob.hpMax * 0.35; mob.legsLost = (mob.legsLost || 0) + 1; if (mob.hp <= 0 || mob.legsLost >= 2) this.die(mob, 0, 0.5, 0); }
    }
  }
  /** a part (and what hangs from it) leaves the skeleton as rigid bodies */
  detach(mob, p, vx, vy, vz) {
    if (!p.attached) return;
    for (const c of p.children) this.detach(mob, c, vx, vy, vz);
    p.attached = false;
    p.view.inner.updateWorldMatrix(true, false);
    p.view.inner.matrixWorld.decompose(_v, _q, _s);
    const g = p.grid, W = this.world;
    this.R.removeView(p.view); p.node.removeFromParent();
    if (g.solid < 4) { W.led.built += g.solid; W.led.destroyed += g.solid; return; }
    for (let id = 0; id < g.nChunks; id++) if (g.count[id]) g.markDirty(id);
    const h = hash3(mob.seed, mob.parts.indexOf(p), W.step, 2);
    W.led.built += g.solid;
    W.bodies.add(g, [0, 0, 0], _v.x, _v.y, _v.z, [_q.x, _q.y, _q.z, _q.w], 1, { toRubble: true, v: [vx + ((h & 255) - 128) * 0.01, vy + ((h >> 8) & 255) * 0.006, vz + (((h >> 16) & 255) - 128) * 0.01], w: [((h >> 4) & 255) * 0.02 - 2.5, ((h >> 12) & 255) * 0.02 - 2.5, ((h >> 20) & 255) * 0.02 - 2.5] });
  }
  die(mob, vx, vy, vz) {
    if (!mob.alive) return; mob.alive = false; this.killed++;
    this.world.ev('mobdie', mob.x, mob.y + 1, mob.z, mob.vox, mob.def.id === 'robot' ? M.robot_metal : mob.def.id === 'golem' ? M.golem_stone : M.flesh);
    for (const p of mob.parts) if (!p.parent) this.detach(mob, p, vx, vy, vz);
    mob.root.removeFromParent(); const i = this.list.indexOf(mob); if (i >= 0) this.list.splice(i, 1);
  }
  hit(h, dx, dy, dz, r, power, knock) {
    const mob = h.mob; mob.kx += dx * knock; mob.kz += dz * knock;
    return this.damageSphere(mob, h.px + dx * 0.06, h.py + dy * 0.06, h.pz + dz * 0.06, r, power, dx, dy, dz);
  }
  blast(cx, cy, cz, r, power) {
    for (const mob of this.list.slice()) {
      const dx = mob.x - cx, dy = mob.y + mob.radius * 0.6 - cy, dz = mob.z - cz, d = Math.hypot(dx, dy, dz), reach = r * 2;
      if (d > reach + mob.radius) continue;
      const k = 1 / Math.max(d, 0.3), f = Math.max(0, 1 - d / (reach + mob.radius));
      this.damageSphere(mob, cx, cy, cz, r * 0.75, 0.6 * power, dx * k, dy * k, dz * k);
      if (!mob.alive) continue;
      mob.hp -= mob.hpMax * f * 1.6 * power; mob.kx += dx * k * 6 * f; mob.kz += dz * k * 6 * f; mob.hitT = 0.4;
      if (mob.hp <= 0) this.die(mob, dx * k * (3 + 7 * f), 3 + 4 * f, dz * k * (3 + 7 * f));
    }
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    for (const mob of this.list) {
      // sphere reject
      const mx = mob.x - ox, my = mob.y + mob.radius * 0.7 - oy, mz = mob.z - oz, tc = mx * dx + my * dy + mz * dz;
      if (tc < -mob.radius || mx * mx + my * my + mz * mz - tc * tc > mob.radius * mob.radius * 1.3) continue;
      for (const p of mob.parts) {
        if (!p.attached) continue;
        _v.set(ox, oy, oz).applyMatrix4(p.inv); _p.set(dx, dy, dz).transformDirection(p.inv).multiplyScalar(10);
        const h = rayGrid(p.grid, _v.x, _v.y, _v.z, _p.x, _p.y, _p.z, best ? best.t : maxT);
        if (h && (!best || h.t < best.t)) { h.mob = mob; h.part = p; h.px = ox + dx * h.t; h.py = oy + dy * h.t; h.pz = oz + dz * h.t; best = h; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------ behaviour and animation
  update(dt, wander = true) {
    const W = this.world, g = W.grid;
    for (const mob of this.list.slice()) {
      const d = mob.def; mob.t += dt;
      if (mob.hitT > 0) mob.hitT -= dt;
      let moving = false;
      if (wander && mob.atk <= 0) {
        if (mob.state === 'idle') { mob.wait -= dt; if (mob.wait <= 0) { const a = mob.r() * 6.283, dd = 2 + mob.r() * 5; mob.tx = Math.min(WX * 0.1 - 4, Math.max(4, mob.x + Math.cos(a) * dd)); mob.tz = Math.min(WZ * 0.1 - 4, Math.max(4, mob.z + Math.sin(a) * dd)); mob.state = 'walk'; } }
        else {
          const ddx = mob.tx - mob.x, ddz = mob.tz - mob.z, dist = Math.hypot(ddx, ddz);
          if (dist < 0.3) { mob.state = 'idle'; mob.wait = 1 + mob.r() * 3; }
          else {
            const want = Math.atan2(ddx, ddz); let da = want - mob.yaw; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
            mob.yaw += Math.sign(da) * Math.min(Math.abs(da), dt * 3);
            const fx = Math.sin(mob.yaw), fz = Math.cos(mob.yaw), nx = mob.x + fx * d.speed * dt, nz = mob.z + fz * d.speed * dt;
            // blocked by something taller than a step?
            const px = Math.floor((nx + fx * 0.4) * 10), pz = Math.floor((nz + fz * 0.4) * 10), fy = Math.floor(mob.y * 10);
            let blocked = false; for (let y = fy + 4; y < fy + 14; y += 3) if (g.get(px, y, pz)) blocked = true;
            if (blocked) {
              if ((d.smash || d.claw) && mob.atk <= 0) { mob.atk = 1; mob.atkDone = false; mob.ax = (px + 0.5) * 0.1; mob.ay = mob.y + (d.heavy ? 1.4 : 1.0); mob.az = (pz + 0.5) * 0.1; }
              else { mob.state = 'idle'; mob.wait = 0.3; }
            } else if (Math.abs(da) < 0.6) { mob.x = nx; mob.z = nz; moving = true; mob.phase += dt * d.speed * (d.anim === 'spider' ? 9 : 5.5); }
          }
        }
      }
      // knockback and gravity
      if (mob.kx || mob.kz) { mob.x += mob.kx * dt; mob.z += mob.kz * dt; mob.kx *= 0.86; mob.kz *= 0.86; if (Math.abs(mob.kx) + Math.abs(mob.kz) < 0.05) mob.kx = mob.kz = 0; }
      const gy = W.groundY(Math.floor(mob.x * 10), Math.floor(mob.z * 10), Math.floor(mob.y * 10) + 5) * 0.1;
      if (gy < mob.y - 0.02) { mob.vy -= 9.81 * dt; mob.y = Math.max(gy, mob.y + mob.vy * dt); } else { mob.y += (gy - mob.y) * Math.min(1, dt * 12); mob.vy = 0; }
      if (mob.atk > 0) {
        mob.atk -= dt * (d.heavy ? 1.1 : 1.8);
        if (!mob.atkDone && mob.atk < 0.45) { mob.atkDone = true; if (d.smash) { W.carve(mob.ax, mob.ay, mob.az, d.smash, 0.34, { debris: 0.6 }); W.ev('hammer', mob.ax, mob.ay, mob.az, 1, M.stone); } else W.carve(mob.ax, mob.ay, mob.az, 0.22, 0.12, { debris: 0.5 }); }
        if (mob.atk <= 0) { mob.state = 'idle'; mob.wait = 0.4; }
      }
      // crushed by a falling piece
      if ((W.step + mob.seed) % 4 === 0) for (const b of W.bodies.list) { if (b.toRubble || b.mass < 150) continue; const sp = Math.hypot(b.v[0], b.v[1], b.v[2]); if (sp < 2) continue; if (Math.hypot(b.x - mob.x, b.y - mob.y - 1, b.z - mob.z) < b.radius * 0.7 + 0.4) { this.die(mob, b.v[0] * 0.3, 1, b.v[2] * 0.3); break; } }
      if (!mob.alive) continue;
      mob.root.position.set(mob.x, mob.y, mob.z); mob.root.rotation.y = mob.yaw;
      this.animate(mob, moving, dt);
      mob.root.updateMatrixWorld(true);
      for (const p of mob.parts) if (p.attached) p.inv.copy(p.view.inner.matrixWorld).invert();
    }
  }
  animate(mob, moving, dt) {
    const d = mob.def, P = mob.byName, t = mob.t, amp = moving ? (d.stiff ? 0.45 : d.heavy ? 0.5 : 0.75) : 0;
    const sw = Math.sin(mob.phase) * amp, hit = Math.max(0, mob.hitT) / 0.3, atk = mob.atk > 0 ? Math.sin(Math.PI * (1 - mob.atk)) : 0;
    const set = (n, x, y = 0, z = 0) => { const p = P[n]; if (p && p.attached) p.node.rotation.set(x, y, z); };
    if (d.anim === 'spider') {
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const n = (s < 0 ? 'L' : 'R') + i, ph = mob.phase + i * 1.57 + (s < 0 ? 0 : 3.14), lift = Math.max(0, Math.sin(ph)) * (moving ? 0.35 : 0);
        set('leg' + n, 0, Math.cos(ph) * (moving ? 0.3 : 0) * s + (i - 1.5) * 0.28 * -s, s * (0.45 + lift) * -1 * -1);
        set('shin' + n, 0, 0, s * (-0.5 - lift * 0.5));
      }
      set('abdomen', Math.sin(t * 2) * 0.05 - hit * 0.3);
      const th = P.thorax; th.node.position.y = th.base.y + Math.sin(t * 3) * 0.01 - atk * 0.1; th.node.rotation.x = atk * 0.35;
      return;
    }
    const pose = d.pose || {};
    set('legL', sw); set('legR', -sw);
    set('armL', -sw * 0.8 + (pose.armL || 0) + (d.lurch ? Math.sin(t * 1.3) * 0.1 : 0), 0, -0.05);
    set('armR', sw * 0.8 * (pose.armR ? 0.2 : 1) + (pose.armR || 0) - atk * (d.heavy ? 2.6 : 1.6) + (d.lurch ? Math.sin(t * 1.7) * 0.1 : 0), 0, 0.05);
    if (d.heavy && mob.atk > 0) set('armL', -atk * 2.6, 0, -0.05);
    set('head', d.lurch ? Math.sin(t * 0.9) * 0.15 : 0, d.stiff ? Math.round(Math.sin(t * 0.6) * 2) * 0.35 : Math.sin(t * 0.7) * 0.35, d.lurch ? 0.2 : 0);
    const tor = P.torso;
    tor.node.rotation.set(-hit * 0.35 + (d.lurch ? 0.18 : 0) + atk * 0.25, 0, d.lurch ? Math.sin(mob.phase) * 0.08 : 0);
    tor.node.position.y = tor.base.y + (moving ? Math.abs(Math.sin(mob.phase)) * 0.03 : Math.sin(t * 1.6) * 0.008);
  }
}
