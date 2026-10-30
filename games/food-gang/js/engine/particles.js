// Shuriken ParticleSystem subset matching the exported modules (see tools/README.md).
import { evalCurve } from './anim.js';
import { xform, DEG } from './math.js';
import { stats } from './assets.js';

const GRAVITY = -9.81;

function prep(c) {
  if (!c || c._p) return c;
  for (const k of ['c', 'c2']) if (c[k]) for (const key of c[k]) { if (typeof key[2] === 'string') key[2] = Infinity; if (typeof key[3] === 'string') key[3] = Infinity; }
  c._p = true;
  return c;
}

export function evalMMC(c, t, r) {
  if (!c) return 0;
  prep(c);
  switch (c.m) {
    case 0: return c.s;
    case 1: return evalCurve(c.c, t) * c.s;
    case 2: { const a = evalCurve(c.c2, t), b = evalCurve(c.c, t); return (a + (b - a) * r) * c.s; }
    case 3: return c.mn + (c.s - c.mn) * r;
    default: return c.s || 0;
  }
}

function evalGrad(g, t, out) {
  if (!g) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  const cs = g.c, as = g.a, fixed = g.mode === 1;
  const seg = (keys, t, n, off) => {
    if (t <= keys[0][0]) { for (let i = 0; i < n; i++) out[off + i] = keys[0][1 + i]; return; }
    for (let k = 1; k < keys.length; k++) {
      if (t <= keys[k][0]) {
        const a = keys[k - 1], b = keys[k];
        const f = fixed ? 1 : (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
        for (let i = 0; i < n; i++) out[off + i] = a[1 + i] + (b[1 + i] - a[1 + i]) * f;
        return;
      }
    }
    const l = keys[keys.length - 1];
    for (let i = 0; i < n; i++) out[off + i] = l[1 + i];
  };
  seg(cs, t, 3, 0);
  seg(as, t, 1, 3);
  return out;
}

const tmpA = [0, 0, 0, 0], tmpB = [0, 0, 0, 0];
export function evalMMG(g, t, r, out) {
  if (!g) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  switch (g.m) {
    case 0: out[0] = g.a[0]; out[1] = g.a[1]; out[2] = g.a[2]; out[3] = g.a[3]; return out;
    case 1: return evalGrad(g.g, t, out);
    case 2: for (let i = 0; i < 4; i++) out[i] = g.b[i] + (g.a[i] - g.b[i]) * r; return out;
    case 3: evalGrad(g.g2, t, tmpA); evalGrad(g.g, t, tmpB); for (let i = 0; i < 4; i++) out[i] = tmpA[i] + (tmpB[i] - tmpA[i]) * r; return out;
    case 4: return evalGrad(g.g, r, out);
    default: out[0] = out[1] = out[2] = out[3] = 1; return out;
  }
}

// Shape module -> local position + direction (emitter space, before shape transform)
function shapeSample(sh, R, pos, dir) {
  const rad = sh.radius ?? 1, thick = sh.thick ?? 1;
  const rr = () => rad * (1 - thick * (1 - Math.sqrt(R())));
  switch (sh.kind) {
    case 0: case 1: case 2: case 3: { // sphere / hemisphere
      let x, y, z, l;
      do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
      l = Math.sqrt(l); x /= l; y /= l; z /= l;
      if (sh.kind >= 2 && z < 0) z = -z;
      const r = sh.kind === 1 || sh.kind === 3 ? rad : rad * (1 - thick * (1 - Math.cbrt(R())));
      pos[0] = x * r; pos[1] = y * r; pos[2] = z * r; dir[0] = x; dir[1] = y; dir[2] = z;
      return;
    }
    case 4: case 7: case 8: case 9: { // cone along +z
      const a = (sh.arc ?? 360) * DEG * R();
      const r = rr();
      const ca = Math.cos(a), sa = Math.sin(a);
      pos[0] = ca * r; pos[1] = sa * r; pos[2] = 0;
      const ang = (sh.angle ?? 25) * DEG * (rad > 0 ? r / rad : 0);
      dir[0] = ca * Math.sin(ang); dir[1] = sa * Math.sin(ang); dir[2] = Math.cos(ang);
      return;
    }
    case 5: case 15: case 16: { // box
      const s = sh.scale || [1, 1, 1];
      pos[0] = (R() - 0.5) * s[0]; pos[1] = (R() - 0.5) * s[1]; pos[2] = (R() - 0.5) * s[2];
      dir[0] = 0; dir[1] = 0; dir[2] = 1;
      return;
    }
    case 10: case 11: { // circle in XY
      const a = (sh.arc ?? 360) * DEG * R();
      const r = sh.kind === 11 ? rad : rr();
      pos[0] = Math.cos(a) * r; pos[1] = Math.sin(a) * r; pos[2] = 0;
      dir[0] = Math.cos(a); dir[1] = Math.sin(a); dir[2] = 0;
      return;
    }
    case 12: { // single sided edge along x
      pos[0] = (R() * 2 - 1) * rad; pos[1] = 0; pos[2] = 0;
      dir[0] = 0; dir[1] = 1; dir[2] = 0;
      return;
    }
    case 18: { // rectangle in XY, emits +z
      const s = sh.scale || [1, 1, 1];
      pos[0] = (R() - 0.5) * s[0]; pos[1] = (R() - 0.5) * s[1]; pos[2] = 0;
      dir[0] = 0; dir[1] = 0; dir[2] = 1;
      return;
    }
    default:
      pos[0] = pos[1] = pos[2] = 0; dir[0] = 0; dir[1] = 0; dir[2] = 1;
  }
}

function rotXYZ(v, e) {
  // Unity euler order Z, X, Y
  let [x, y, z] = v;
  if (e[2]) { const c = Math.cos(e[2] * DEG), s = Math.sin(e[2] * DEG); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (e[0]) { const c = Math.cos(e[0] * DEG), s = Math.sin(e[0] * DEG); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (e[1]) { const c = Math.cos(e[1] * DEG), s = Math.sin(e[1] * DEG); [x, z] = [x * c + z * s, -x * s + z * c]; }
  v[0] = x; v[1] = y; v[2] = z;
}

export class ParticleRuntime {
  constructor(comp, node, engine) {
    this.c = comp; this.node = node; this.engine = engine;
    this.p = [];
    this.time = 0;
    this.emitAcc = 0;
    this.playing = false;
    this.emitting = false;
    this.bursts = [];
    this.R = Math.random;
    this.lastPos = null;
    this.emissionOn = !!comp.emission;
    this.mat = comp.r ? engine.assets.material(comp.r.mat) : null;
    this.sprite = this.mat && this.mat.tex ? engine.assets.sprite(this.mat.tex) : null;
    comp.runtime = this;
    if (comp.playOnAwake) this.play();
  }

  play() {
    this.playing = true; this.emitting = true; this.time = -evalMMC(this.c.delay, 0, Math.random()); this.emitAcc = 0;
    this.bursts = (this.c.emission ? this.c.emission.bursts : []).map((b) => ({ b, next: b.t, left: b.cycles || 1 }));
    this.lastPos = null;
    if (this.c.prewarm && this.c.loop) for (let t = 0; t < this.c.dur; t += 1 / 30) this.step(1 / 30);
  }

  stop(clear = false) { this.emitting = false; if (clear) this.p.length = 0; }
  clear() { this.p.length = 0; }
  get alive() { return this.emitting || this.p.length > 0; }

  emit(n) {
    const c = this.c, m = c.main, R = this.R;
    const wm = this.node.world;
    const tn = c.dur > 0 ? (Math.max(0, this.time) % c.dur) / c.dur : 0;
    const pos = [0, 0, 0], dir = [0, 0, 1];
    for (let i = 0; i < n && this.p.length < (c.maxP || 1000); i++) {
      if (c.shape) {
        shapeSample(c.shape, R, pos, dir);
        const sh = c.shape;
        if (sh.scale && sh.kind !== 5 && sh.kind !== 18) { pos[0] *= sh.scale[0]; pos[1] *= sh.scale[1]; pos[2] *= sh.scale[2]; }
        if (sh.rot && (sh.rot[0] || sh.rot[1] || sh.rot[2])) { rotXYZ(pos, sh.rot); rotXYZ(dir, sh.rot); }
        if (sh.pos) { pos[0] += sh.pos[0]; pos[1] += sh.pos[1]; pos[2] += sh.pos[2]; }
        if (sh.randDir) {
          let x, y, z, l; do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
          l = Math.sqrt(l);
          dir[0] += (x / l - dir[0]) * sh.randDir; dir[1] += (y / l - dir[1]) * sh.randDir; dir[2] += (z / l - dir[2]) * sh.randDir;
        }
        if (sh.sphereDir) {
          const l = Math.hypot(pos[0], pos[1], pos[2]) || 1;
          dir[0] += (pos[0] / l - dir[0]) * sh.sphereDir; dir[1] += (pos[1] / l - dir[1]) * sh.sphereDir; dir[2] += (pos[2] / l - dir[2]) * sh.sphereDir;
        }
        const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1; dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
      } else { pos[0] = pos[1] = pos[2] = 0; dir[0] = 0; dir[1] = 0; dir[2] = 1; }
      const rnd = [R(), R(), R(), R(), R(), R(), R(), R()];
      const speed = evalMMC(m.speed, tn, rnd[0]);
      const v = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
      const P = { pos: pos.slice(), vel: v, life: 0, max: Math.max(0.01, evalMMC(m.life, tn, rnd[1])), rnd };
      if (c.space === 1) {
        const w = xform(wm, P.pos[0], P.pos[1], P.pos[2], [0, 0, 0]);
        const vx = wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2], vy = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2], vz = wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2];
        const sc = Math.hypot(wm[0], wm[1], wm[2]) || 1;
        P.pos = w; P.vel = [vx / sc, vy / sc, vz / sc];
        P.wscale = sc;
      }
      P.size = evalMMC(m.size, tn, rnd[2]);
      if (m.size3d) P.size3 = [evalMMC(m.size3d[0], tn, rnd[2]), evalMMC(m.size3d[1], tn, rnd[2]), 1];
      P.rot = evalMMC(m.rot, tn, rnd[3]);
      if (m.flipRot && R() < m.flipRot) P.rot = -P.rot, P.flip = -1; else P.flip = 1;
      P.col = evalMMG(m.color, tn, rnd[4], [1, 1, 1, 1]);
      P.frame0 = c.uv ? evalMMC(c.uv.startFrame, 0, rnd[5]) : 0;
      this.p.push(P);
    }
  }

  step(dt) {
    const c = this.c;
    if (!this.playing) return;
    dt *= c.speedMul ?? 1;
    this.time += dt;
    const tAbs = this.time;
    if (this.emitting && tAbs >= 0) {
      if (!c.loop && tAbs > c.dur) this.emitting = false;
      if (this.emitting && this.emissionOn && c.emission) {
        const tn = c.dur > 0 ? (tAbs % c.dur) / c.dur : 0;
        this.emitAcc += evalMMC(c.emission.rate, tn, Math.random()) * dt;
        if (c.emission.dist && c.emission.dist.s && c.space === 1) {
          const wp = [this.node.world[12], this.node.world[13], this.node.world[14]];
          if (this.lastPos) this.emitAcc += Math.hypot(wp[0] - this.lastPos[0], wp[1] - this.lastPos[1], wp[2] - this.lastPos[2]) * evalMMC(c.emission.dist, tn, Math.random());
          this.lastPos = wp;
        }
        const n = Math.floor(this.emitAcc);
        if (n > 0) { this.emitAcc -= n; this.emit(n); }
        const cycT = c.loop && c.dur > 0 ? tAbs % c.dur : tAbs;
        for (const B of this.bursts) {
          if (c.loop && c.dur > 0 && cycT < B.lastCyc) { B.next = B.b.t; B.left = B.b.cycles || 1; }
          B.lastCyc = cycT;
          while (B.left > 0 && cycT >= B.next) {
            if (Math.random() <= (B.b.p ?? 1)) this.emit(Math.round(evalMMC(B.b.n, tn, Math.random())));
            B.left--; B.next += Math.max(0.0001, B.b.interval || 0.01);
          }
        }
      }
    }
    const grav = evalMMC(c.main.gravity, 0, 0.5) * GRAVITY;
    const live = [];
    const wm = this.node.world;
    for (const P of this.p) {
      P.life += dt;
      if (P.life >= P.max) continue;
      const t = P.life / P.max;
      // gravity is world-down; in local space convert through the emitter rotation
      if (grav) {
        if (c.space === 1) P.vel[1] += grav * dt;
        else { const sc = Math.hypot(wm[1], wm[5], wm[9]) || 1; P.vel[0] += wm[1] / sc * grav * dt / sc; P.vel[1] += wm[5] / sc * grav * dt / sc; P.vel[2] += wm[9] / sc * grav * dt / sc; }
      }
      if (c.force) { P.vel[0] += evalMMC(c.force.x, t, P.rnd[6]) * dt; P.vel[1] += evalMMC(c.force.y, t, P.rnd[6]) * dt; P.vel[2] += evalMMC(c.force.z, t, P.rnd[6]) * dt; }
      if (c.limit) {
        const lim = evalMMC(c.limit.v, t, P.rnd[7]);
        const sp = Math.hypot(P.vel[0], P.vel[1], P.vel[2]);
        if (sp > lim && sp > 0) {
          const k = 1 - (1 - lim / sp) * Math.min(1, (c.limit.damp || 0) * dt * 30);
          P.vel[0] *= k; P.vel[1] *= k; P.vel[2] *= k;
        }
        const drag = evalMMC(c.limit.drag, t, P.rnd[7]);
        if (drag) { const k = Math.max(0, 1 - drag * dt); P.vel[0] *= k; P.vel[1] *= k; P.vel[2] *= k; }
      }
      let vx = P.vel[0], vy = P.vel[1], vz = P.vel[2];
      if (c.vel) {
        let ax = evalMMC(c.vel.x, t, P.rnd[5]), ay = evalMMC(c.vel.y, t, P.rnd[5]), az = evalMMC(c.vel.z, t, P.rnd[5]);
        if (c.space === 1 && !c.vel.world) { const X = wm[0] * ax + wm[4] * ay + wm[8] * az, Y = wm[1] * ax + wm[5] * ay + wm[9] * az, Z = wm[2] * ax + wm[6] * ay + wm[10] * az; ax = X; ay = Y; az = Z; }
        vx += ax; vy += ay; vz += az;
        const sm = c.vel.speedMul ? evalMMC(c.vel.speedMul, t, P.rnd[5]) : 1;
        vx *= sm; vy *= sm; vz *= sm;
      }
      P.pos[0] += vx * dt; P.pos[1] += vy * dt; P.pos[2] += vz * dt;
      if (c.noise) {
        const s = evalMMC(c.noise.strength, t, P.rnd[6]) * dt * 2;
        const f = (c.noise.freq || 0.5) * 6.283;
        P.pos[0] += Math.sin(P.life * f + P.rnd[6] * 50) * s;
        P.pos[1] += Math.cos(P.life * f * 1.3 + P.rnd[7] * 50) * s;
      }
      P.cur = { vx, vy, vz };
      if (c.rotL) P.rot += evalMMC(c.rotL, t, P.rnd[3]) * dt * P.flip;
      if (c.rotSpeed) {
        const sp = Math.hypot(vx, vy, vz), r = c.rotSpeed.range || [0, 1];
        P.rot += evalMMC(c.rotSpeed.c, Math.min(1, Math.max(0, (sp - r[0]) / Math.max(1e-4, r[1] - r[0]))), P.rnd[3]) * dt * P.flip;
      }
      live.push(P);
    }
    this.p = live;
    if (!this.emitting && !live.length && !c.loop) this.playing = false;
  }

  getAnimProp(p) {
    if (p === 'EmissionModule.enabled') return this.emissionOn ? 1 : 0;
    const m = /^InitialModule\.(\w+)\.(scalar|minScalar)$/.exec(p);
    if (m) { const k = { startSpeed: 'speed', startSize: 'size', startLifetime: 'life' }[m[1]]; const c = k && this.c.main[k]; return c ? (m[2] === 'scalar' ? c.s : c.mn || 0) : 0; }
    return 0;
  }

  setAnimProp(p, v) {
    if (p === 'EmissionModule.enabled') { this.emissionOn = v > 0.5; return; }
    const m = /^InitialModule\.(\w+)\.(scalar|minScalar)$/.exec(p);
    if (m) { const k = { startSpeed: 'speed', startSize: 'size', startLifetime: 'life' }[m[1]]; const c = k && this.c.main[k]; if (c) { if (m[2] === 'scalar') c.s = v; else c.mn = v; } }
  }

  // push quads to the renderer; called from the sorted transparent pass
  // opts (UI pass): { wm: matrix to use instead of node.world, ui: no depth test, alpha: CanvasGroup alpha }
  draw(R, cam, pack, opts) {
    const c = this.c, r = c.r;
    if (!r || !this.p.length) return;
    const s = this.sprite;
    const tex = s ? R.spriteTex(s) : R.white;
    if (s && !tex) return;
    const mat = this.mat;
    R.setState(R.progSprite, tex, mat ? mat.src : 5, mat ? mat.dst : 10, !(opts && opts.ui), null);
    const wm = (opts && opts.wm) || this.node.world;
    const am = opts && opts.alpha !== undefined ? opts.alpha : 1;
    const tint = (mat && (mat.props._TintColor || mat.color)) || [1, 1, 1, 1];
    const tintMul = mat && mat.props._TintColor ? 2 : 1;
    const out = [0, 0, 0], col = [0, 0, 0, 0];
    let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
    if (s) { const A = R.assets.spriteData.atlases[s.a]; u0 = s.x / A.w; v0 = s.y / A.h; u1 = (s.x + s.w) / A.w; v1 = (s.y + s.h) / A.h; }
    const tiles = c.uv ? c.uv.tiles : null;
    const nf = tiles ? tiles[0] * tiles[1] : 1;
    const wsc = c.space === 1 ? 1 : Math.hypot(wm[0], wm[1], wm[2]);
    const order = r.sortMode === 2 ? this.p.slice().reverse() : this.p;
    for (const P of order) {
      const t = P.life / P.max;
      let size = P.size * (c.sizeL ? evalMMC(c.sizeL, t, P.rnd[2]) : 1);
      let sx = size, sy = size;
      if (P.size3) { sx = P.size3[0] * (c.sizeL ? evalMMC(c.sizeL, t, P.rnd[2]) : 1); sy = P.size3[1] * (c.sizeL3 ? evalMMC(c.sizeL3[1], t, P.rnd[2]) : (c.sizeL ? evalMMC(c.sizeL, t, P.rnd[2]) : 1)); }
      evalMMG(c.col, t, P.rnd[4], col);
      const cr = P.col[0] * (c.col ? col[0] : 1) * tint[0] * tintMul, cg = P.col[1] * (c.col ? col[1] : 1) * tint[1] * tintMul;
      const cb = P.col[2] * (c.col ? col[2] : 1) * tint[2] * tintMul, ca = P.col[3] * (c.col ? col[3] : 1) * tint[3] * am;
      const pc = pack(cr, cg, cb, ca);
      let px, py, pz;
      if (c.space === 1) { px = P.pos[0]; py = P.pos[1]; pz = P.pos[2]; sx *= (c.scaling === 0 ? 1 : 1); }
      else { xform(wm, P.pos[0], P.pos[1], P.pos[2], out); px = out[0]; py = out[1]; pz = out[2]; sx *= wsc; sy *= wsc; }
      let fu0 = u0, fv0 = v0, fu1 = u1, fv1 = v1;
      if (tiles && nf > 1) {
        let fr = c.uv.frame ? evalMMC(c.uv.frame, (t * (c.uv.cycles || 1)) % 1, P.rnd[5]) : 0;
        if (c.uv.frame && c.uv.frame.s <= 1.0001) fr *= nf;
        let f = Math.floor(fr + (P.frame0 <= 1 ? P.frame0 * nf : P.frame0)) % nf;
        if (c.uv.rowMode === 0 && c.uv.anim === 1) f = c.uv.row * tiles[0] + (f % tiles[0]);
        const fx = f % tiles[0], fy = Math.floor(f / tiles[0]);
        const du = (u1 - u0) / tiles[0], dv = (v1 - v0) / tiles[1];
        fu0 = u0 + fx * du; fu1 = fu0 + du; fv0 = v0 + fy * dv; fv1 = fv0 + dv;
      }
      const hx = sx / 2, hy = sy / 2;
      R.reserve(4, 6);
      if (r.mode === 1 && P.cur) {
        // stretched billboard along velocity (screen plane)
        let vx = P.cur.vx, vy = P.cur.vy;
        if (c.space !== 1) { const X = wm[0] * vx + wm[4] * vy, Y = wm[1] * vx + wm[5] * vy; vx = X; vy = Y; }
        const sp = Math.hypot(vx, vy) || 1e-6;
        const dx = vx / sp, dy = vy / sp;
        const len = sx * (r.lenScale || 2) + sp * (r.velScale || 0);
        const nx = -dy * hy, ny = dx * hy;
        const a = R.vert(px - nx, py - ny, pz, fu0, fv1, pc, 0);
        R.vert(px + nx, py + ny, pz, fu0, fv0, pc, 0);
        R.vert(px - nx - dx * len, py - ny - dy * len, pz, fu1, fv1, pc, 0);
        R.vert(px + nx - dx * len, py + ny - dy * len, pz, fu1, fv0, pc, 0);
        R.quadIdx(a);
      } else {
        const rot = -P.rot;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const ox = r.pivot ? r.pivot[0] * sx : 0, oy = r.pivot ? r.pivot[1] * sy : 0;
        const corner = (lx, ly, u, v) => R.vert(px + (lx + ox) * cs - (ly + oy) * sn, py + (lx + ox) * sn + (ly + oy) * cs, pz, u, v, pc, 0);
        const a = corner(-hx, -hy, fu0, fv1);
        corner(-hx, hy, fu0, fv0);
        corner(hx, -hy, fu1, fv1);
        corner(hx, hy, fu1, fv0);
        R.quadIdx(a);
      }
      stats.particles++;
    }
  }
}
