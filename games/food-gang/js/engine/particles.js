// Shuriken ParticleSystem subset matching the exported modules (see tools/README.md).
import { evalCurve } from './anim.js';
import { xform, invert, DEG } from './math.js';
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

// smooth value noise in [-1, 1] sampled in space (Noise module: particles move through a field, not along time)
function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// non-trigger BoxCollider2D of the loaded scenes as world AABBs (the map's Floor/Walls/shelves). The map is static:
// rescan every 5 s (every 0.5 s while none were found), not per spawn, since each bullet/FX spawn adds an instance
function colliders2D(engine) {
  let C = engine._col2d;
  if (C && engine.frame >= C.frame && engine.frame - C.frame < (C.boxes.length ? 300 : 30) && !(C.boxes.length && C.boxes[0].node.destroyed)) return C.boxes;
  const boxes = [];
  for (const node of engine.allNodes()) {
    if (!node.activeInHierarchy) continue;
    for (const c of node.comps) {
      if (c.type !== 'BoxCollider2D' || !c.enabled || c.trigger) continue;
      const w = node.world;
      const sx = Math.hypot(w[0], w[1]), sy = Math.hypot(w[4], w[5]);
      const ox = c.offset ? c.offset[0] : 0, oy = c.offset ? c.offset[1] : 0;
      const cx = w[12] + w[0] * ox + w[4] * oy, cy = w[13] + w[1] * ox + w[5] * oy;
      const hx = sx * (c.size ? c.size[0] : 1) / 2, hy = sy * (c.size ? c.size[1] : 1) / 2;
      boxes.push({ node, layer: node.layer, x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy });
    }
  }
  engine._col2d = C = { frame: engine.frame, boxes };
  return boxes;
}

function rotXYZ(v, e) {
  // Unity euler order Z, X, Y
  let [x, y, z] = v;
  if (e[2]) { const c = Math.cos(e[2] * DEG), s = Math.sin(e[2] * DEG); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (e[0]) { const c = Math.cos(e[0] * DEG), s = Math.sin(e[0] * DEG); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (e[1]) { const c = Math.cos(e[1] * DEG), s = Math.sin(e[1] * DEG); [x, z] = [x * c + z * s, -x * s + z * c]; }
  v[0] = x; v[1] = y; v[2] = z;
}

// cycleCount 0 is "infinite" in Unity: the burst repeats every interval for the rest of the cycle
const burstCycles = (b) => (b.cycles === 0 ? Infinity : b.cycles || 1);

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
    // a disabled module is still exported: clips turn it on (skin_run sets EmissionModule.enabled for the run dust)
    this.emissionOn = !!comp.emission && comp.emission.on !== 0;
    this.mat = comp.r ? engine.assets.material(comp.r.mat) : null;
    this.sprite = this.mat && this.mat.tex ? engine.assets.sprite(this.mat.tex) : null;
    // UIParticleSystem (fridge smoke, reward stars, sleep Zs): a uGUI Graphic draws the particles with its own
    // material + particleSprite/particleTexture and m_Color, in the RectTransform's space (the renderer is unused)
    const ui = node.comps && node.comps.find((x) => x.type === 'MonoBehaviour' && x.script === 'UIParticleSystem');
    if (ui && ui.fields) {
      const f = ui.fields;
      this.uiGraphic = { color: f.m_Color || [1, 1, 1, 1] };
      this.mat = engine.assets.material(f.m_Material) || this.mat;
      const sp = (f.particleSprite && engine.assets.sprite(f.particleSprite)) || (f.particleTexture && engine.assets.sprite(f.particleTexture));
      this.sprite = sp || (this.mat && this.mat.tex ? engine.assets.sprite(this.mat.tex) : null);
    }
    comp.runtime = this;
    if (comp.playOnAwake) this.play();
  }

  play() {
    this.playing = true; this.emitting = true; this.time = -evalMMC(this.c.delay, 0, Math.random()); this.emitAcc = 0;
    this.bursts = (this.c.emission ? this.c.emission.bursts : []).map((b) => ({ b, next: b.t, left: burstCycles(b) }));
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
        // world simulation: the transform scale still scales the shape, the start speed and the size (scaling
        // Hierarchy = lossy scale, Local = the emitter's own scale, Shape = positions only)
        const sc = Math.hypot(wm[0], wm[1], wm[2]) || 1;
        const ws = c.scaling === 0 ? sc : c.scaling === 1 ? Math.abs(this.node.ls[0]) || 1 : 1;
        const ps = (c.scaling === 2 ? sc : ws) / sc, k = ws / sc;
        P.pos = [wm[12] + (wm[0] * pos[0] + wm[4] * pos[1] + wm[8] * pos[2]) * ps, wm[13] + (wm[1] * pos[0] + wm[5] * pos[1] + wm[9] * pos[2]) * ps,
          wm[14] + (wm[2] * pos[0] + wm[6] * pos[1] + wm[10] * pos[2]) * ps];
        P.vel = [(wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2]) * k, (wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2]) * k, (wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2]) * k];
        P.wscale = ws;
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
    if (c.sub && !this.subs) this.linkSubs();
    dt *= c.speedMul ?? 1;
    this.time += dt;
    const tAbs = this.time;
    if (this.emitting && tAbs >= 0 && !this.isSub) {
      if (!c.loop && tAbs > c.dur) this.emitting = false;
      if (this.emitting && c.emission) {
        const tn = c.dur > 0 ? (tAbs % c.dur) / c.dur : 0;
        const on = this.emissionOn;
        if (!on) this.emitAcc = 0;
        else this.emitAcc += evalMMC(c.emission.rate, tn, Math.random()) * dt;
        if (on && c.emission.dist && c.emission.dist.s && c.space === 1) {
          const wp = [this.node.world[12], this.node.world[13], this.node.world[14]];
          if (this.lastPos) this.emitAcc += Math.hypot(wp[0] - this.lastPos[0], wp[1] - this.lastPos[1], wp[2] - this.lastPos[2]) * evalMMC(c.emission.dist, tn, Math.random());
          this.lastPos = wp;
        }
        const n = Math.floor(this.emitAcc);
        if (n > 0) { this.emitAcc -= n; this.emit(n); }
        // the burst schedule runs on system time while the module is off too: turning it on fires no missed bursts
        const cycT = c.loop && c.dur > 0 ? tAbs % c.dur : tAbs;
        for (const B of this.bursts) {
          if (c.loop && c.dur > 0 && cycT < B.lastCyc) { B.next = B.b.t; B.left = burstCycles(B.b); }
          B.lastCyc = cycT;
          while (B.left > 0 && cycT >= B.next) {
            if (on && Math.random() <= (B.b.p ?? 1)) this.emit(Math.round(evalMMC(B.b.n, tn, Math.random())));
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
      if (P.life >= P.max) { if (this.subDeath) this.fireSubs(this.subDeath, P); continue; }
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
        // drag equation: a deceleration of drag x speed^2 (multiplyDragByParticleVelocity, on for every spark here)
        // x the particle's cross-section (multiplyDragByParticleSize); a few frames bring a 20 u/s spark to a crawl
        let drag = evalMMC(c.limit.drag, t, P.rnd[7]);
        if (drag) {
          const sp = Math.hypot(P.vel[0], P.vel[1], P.vel[2]);
          if (sp > 0) {
            if (c.limit.dragVel !== 0) drag *= sp * sp;
            if (c.limit.dragSize === 1) { const r = P.size * (c.sizeL ? evalMMC(c.sizeL, t, P.rnd[2]) : 1) * 0.5; drag *= Math.PI * r * r; }
            const k = Math.max(0, sp - drag * dt) / sp;
            P.vel[0] *= k; P.vel[1] *= k; P.vel[2] *= k;
          }
        }
      }
      let vx = P.vel[0], vy = P.vel[1], vz = P.vel[2];
      if (c.vel) {
        let ax = evalMMC(c.vel.x, t, P.rnd[5]), ay = evalMMC(c.vel.y, t, P.rnd[5]), az = evalMMC(c.vel.z, t, P.rnd[5]);
        if (c.space === 1 && !c.vel.world) { const X = wm[0] * ax + wm[4] * ay + wm[8] * az, Y = wm[1] * ax + wm[5] * ay + wm[9] * az, Z = wm[2] * ax + wm[6] * ay + wm[10] * az; ax = X; ay = Y; az = Z; }
        vx += ax; vy += ay; vz += az;
        const sm = c.vel.speedMul ? evalMMC(c.vel.speedMul, t, P.rnd[5]) : 1;
        vx *= sm; vy *= sm; vz *= sm;
      }
      const ox = P.pos[0], oy = P.pos[1], oz = P.pos[2];
      P.pos[0] += vx * dt; P.pos[1] += vy * dt; P.pos[2] += vz * dt;
      if (c.noise) {
        // a velocity sampled from a field at the particle position; damping divides the strength by the frequency
        const nz = c.noise, f = nz.freq || 0.5;
        const s = evalMMC(nz.strength, t, P.rnd[6]) * (nz.damping ? 1 / f : 1) * (nz.posAmt ? evalMMC(nz.posAmt, t, 0.5) : 1) * dt;
        if (s) {
          const sc = evalMMC(nz.scroll, t, 0.5) * this.time;
          const x = P.pos[0] * f + sc, y = P.pos[1] * f, z = P.pos[2] * f;
          P.pos[0] += vnoise(x, y, z, 1) * s; P.pos[1] += vnoise(x, y, z, 2) * s; P.pos[2] += vnoise(x, y, z, 3) * s;
        }
      }
      if (c.coll && c.coll.type === 1 && this.collide(P, ox, oy, oz, t)) {
        if (this.subColl) this.fireSubs(this.subColl, P);
        if (P.life >= P.max) { if (this.subDeath) this.fireSubs(this.subDeath, P); continue; }
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
    if (!this.emitting && !live.length && !c.loop && !this.isSub) this.playing = false;
  }

  // Sub-emitters (only Fx_area_pizza_special: a splat where each droplet dies). The child system stops emitting
  // on its own and emits its bursts at the parent particle on the event (type 0 birth, 1 collision, 2 death).
  linkSubs() {
    this.subs = [];
    for (const s of this.c.sub) {
      const comp = this.node.scene ? this.node.scene.ref(s.ps) : null;
      if (!comp || comp.type !== 'ParticleSystem' || !comp.runtime) continue;
      const rt = comp.runtime;
      rt.isSub = true; rt.p.length = 0; rt.playing = true;
      this.subs.push({ rt, type: s.type, color: (s.props & 1) !== 0, p: s.p ?? 1 });
    }
    const of = (t) => { const l = this.subs.filter((x) => x.type === t); return l.length ? l : null; };
    this.subColl = of(1); this.subDeath = of(2);
  }

  fireSubs(list, P) {
    const c = this.c, wm = this.node.world;
    let x = P.pos[0], y = P.pos[1], z = P.pos[2];
    if (c.space !== 1) { const o = xform(wm, x, y, z, [0, 0, 0]); x = o[0]; y = o[1]; z = o[2]; }
    const col = [1, 1, 1, 1];
    evalMMG(c.col, Math.min(1, P.life / P.max), P.rnd[4], col);
    for (let i = 0; i < 4; i++) col[i] = P.col[i] * (c.col ? col[i] : 1);
    for (const s of list) if (Math.random() <= s.p) s.rt.emitAt([x, y, z], s.color ? col : null);
  }

  // sub-emitter event: the burst counts of the child system at a world position
  emitAt(wp, colorMul) {
    const c = this.c;
    let n = 0;
    for (const b of (c.emission ? c.emission.bursts : [])) n += Math.round(evalMMC(b.n, 0, Math.random()));
    if (!n) return;
    const i0 = this.p.length;
    this.emit(n);
    let lp = wp;
    if (c.space !== 1) { const inv = invert(new Float32Array(16), this.node.world); lp = xform(inv, wp[0], wp[1], wp[2], [0, 0, 0]); }
    for (let i = i0; i < this.p.length; i++) {
      const P = this.p[i];
      P.pos[0] += lp[0]; P.pos[1] += lp[1]; P.pos[2] += lp[2];
      if (c.space === 1) { P.pos[0] -= this.node.world[12]; P.pos[1] -= this.node.world[13]; P.pos[2] -= this.node.world[14]; }
      if (colorMul) for (let k = 0; k < 4; k++) P.col[k] *= colorMul[k];
    }
  }

  // Collision module, type World, 2D mode: the particle is a circle (size / 2 x radiusScale) against the scene's
  // BoxCollider2D on the collidesWith layers; bounce scales the normal speed, dampen the whole speed
  collide(P, ox, oy, oz, t) {
    const c = this.c, cl = c.coll, wm = this.node.world;
    const boxes = colliders2D(this.engine);
    if (!boxes.length) return false;
    const local = c.space !== 1;
    const sc = local ? Math.hypot(wm[0], wm[1], wm[2]) || 1 : 1;
    let px = P.pos[0], py = P.pos[1], qx = ox, qy = oy;
    if (local) {
      px = wm[12] + wm[0] * P.pos[0] + wm[4] * P.pos[1] + wm[8] * P.pos[2]; py = wm[13] + wm[1] * P.pos[0] + wm[5] * P.pos[1] + wm[9] * P.pos[2];
      qx = wm[12] + wm[0] * ox + wm[4] * oy + wm[8] * oz; qy = wm[13] + wm[1] * ox + wm[5] * oy + wm[9] * oz;
    }
    const size = P.size * (c.sizeL ? evalMMC(c.sizeL, t, P.rnd[2]) : 1) * (local ? sc : P.wscale || 1);
    const r = size * 0.5 * (cl.radius ?? 1);
    const mask = cl.mask ?? -1;
    for (const b of boxes) {
      if (!((mask >>> b.layer) & 1)) continue;
      const x0 = b.x0 - r, x1 = b.x1 + r, y0 = b.y0 - r, y1 = b.y1 + r;
      if (px <= x0 || px >= x1 || py <= y0 || py >= y1) continue;
      let nx = 0, ny = 0, fx = px, fy = py;
      if (qy >= y1) { ny = 1; fy = y1; } else if (qy <= y0) { ny = -1; fy = y0; } else if (qx <= x0) { nx = -1; fx = x0; } else if (qx >= x1) { nx = 1; fx = x1; } else continue;
      // world normal -> simulation space (the emitter rotation; uniform scale cancels after normalising)
      let lx = nx, ly = ny, lz = 0;
      if (local) { lx = (wm[0] * nx + wm[1] * ny) / sc; ly = (wm[4] * nx + wm[5] * ny) / sc; lz = (wm[8] * nx + wm[9] * ny) / sc; }
      const dx = fx - px, dy = fy - py;
      if (local) { P.pos[0] += (wm[0] * dx + wm[1] * dy) / (sc * sc); P.pos[1] += (wm[4] * dx + wm[5] * dy) / (sc * sc); P.pos[2] += (wm[8] * dx + wm[9] * dy) / (sc * sc); }
      else { P.pos[0] = fx; P.pos[1] = fy; }
      const v = P.vel, vn = v[0] * lx + v[1] * ly + v[2] * lz;
      if (vn < 0) {
        const k = 1 + evalMMC(cl.bounce, t, P.rnd[7]);
        v[0] -= k * vn * lx; v[1] -= k * vn * ly; v[2] -= k * vn * lz;
      }
      const damp = 1 - evalMMC(cl.dampen, t, P.rnd[7]);
      if (damp !== 1) { v[0] *= damp; v[1] *= damp; v[2] *= damp; }
      const loss = evalMMC(cl.lifetimeLoss, t, P.rnd[7]);
      if (loss) P.life += loss * P.max;
      const sp = Math.hypot(v[0], v[1], v[2]);
      if (sp < (cl.minKill || 0) || sp > (cl.maxKill ?? Infinity)) P.life = P.max;
      stats.particleHits = (stats.particleHits || 0) + 1;
      return true;
    }
    return false;
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
    const wm = (opts && opts.wm && !this.uiGraphic) ? opts.wm : this.node.world;
    const am = opts && opts.alpha !== undefined ? opts.alpha : 1;
    let tint = (mat && ((mat.props && mat.props._TintColor) || mat.color)) || [1, 1, 1, 1];
    if (this.uiGraphic) { const g = this.uiGraphic.color; tint = [tint[0] * g[0], tint[1] * g[1], tint[2] * g[2], tint[3] * g[3]]; }
    const tintMul = mat && mat.props && mat.props._TintColor ? 2 : 1;
    const out = [0, 0, 0], col = [0, 0, 0, 0];
    // The exporter trims transparent borders off the texture (sprite x,y,w,h inside the original ow x oh, offset
    // ox,oy from bottom-left). Unity maps the WHOLE texture on the quad: a spark band 32 px tall in a 128 px texture
    // is a quarter of the quad, and texture-sheet tiles split the original width. So each quad is the tile in
    // original texture space, clipped to the trimmed rect: corners and UVs shrink together.
    let A = null, ow = 1, oh = 1, tox = 0, toy = 0, tw = 1, th = 1;
    if (s) { A = R.assets.spriteData.atlases[s.a]; ow = s.ow || s.w; oh = s.oh || s.h; tw = s.w; th = s.h; tox = s.ox || 0; toy = oh - (s.oy || 0) - s.h; }
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
      if (c.space === 1) { px = P.pos[0]; py = P.pos[1]; pz = P.pos[2]; const k = P.wscale || 1; sx *= k; sy *= k; }
      else { xform(wm, P.pos[0], P.pos[1], P.pos[2], out); px = out[0]; py = out[1]; pz = out[2]; sx *= wsc; sy *= wsc; }
      // tile of the original texture (pixels, top-left origin)
      let fx = 0, fy = 0, tx = 1, ty = 1;
      if (tiles && nf > 1) {
        let fr = c.uv.frame ? evalMMC(c.uv.frame, (t * (c.uv.cycles || 1)) % 1, P.rnd[5]) : 0;
        if (c.uv.frame && c.uv.frame.s <= 1.0001) fr *= nf;
        let f = Math.floor(fr + (P.frame0 <= 1 ? P.frame0 * nf : P.frame0)) % nf;
        if (c.uv.rowMode === 0 && c.uv.anim === 1) f = c.uv.row * tiles[0] + (f % tiles[0]);
        tx = tiles[0]; ty = tiles[1]; fx = f % tx; fy = Math.floor(f / tx);
      }
      let a0 = 0, a1 = 1, b0 = 0, b1 = 1, fu0 = 0, fu1 = 1, fv0 = 0, fv1 = 1;
      if (s) {
        const cw = ow / tx, chh = oh / ty, X0 = fx * cw, Y0 = fy * chh;
        const ix0 = Math.max(X0, tox), ix1 = Math.min(X0 + cw, tox + tw), iy0 = Math.max(Y0, toy), iy1 = Math.min(Y0 + chh, toy + th);
        if (ix1 <= ix0 || iy1 <= iy0) continue;
        a0 = (ix0 - X0) / cw; a1 = (ix1 - X0) / cw; b0 = (iy0 - Y0) / chh; b1 = (iy1 - Y0) / chh;   // b: from the top
        fu0 = (s.x + ix0 - tox) / A.w; fu1 = (s.x + ix1 - tox) / A.w; fv0 = (s.y + iy0 - toy) / A.h; fv1 = (s.y + iy1 - toy) / A.h;
      }
      const hx = sx / 2, hy = sy / 2;
      R.reserve(4, 6);
      if (r.mode === 1 && P.cur) {
        // stretched billboard: the long axis is the 3D velocity, the short axis faces the camera, so a particle
        // flying toward the camera foreshortens (death blood sprays at -z: round blobs, not 4:1 streaks).
        // u runs head -> tail, v across.
        let vx = P.cur.vx, vy = P.cur.vy, vz = P.cur.vz;
        if (c.space !== 1) { const X = wm[0] * vx + wm[4] * vy + wm[8] * vz, Y = wm[1] * vx + wm[5] * vy + wm[9] * vz, Z = wm[2] * vx + wm[6] * vy + wm[10] * vz; vx = X; vy = Y; vz = Z; }
        const sp = Math.hypot(vx, vy, vz) || 1e-6;
        const dx = vx / sp, dy = vy / sp, dz = vz / sp;
        const len = sx * (r.lenScale || 2) + sp * (r.velScale || 0);
        let ex = 0, ey = 0, ez = -1;
        if (cam && cam.node) { const w = cam.node.world; ex = w[12] - px; ey = w[13] - py; ez = w[14] - pz; }
        let nx = dy * ez - dz * ey, ny = dz * ex - dx * ez, nz = dx * ey - dy * ex;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-6) { nx = -dy; ny = dx; nz = 0; } else { nx /= nl; ny /= nl; nz /= nl; }
        if (nx * -dy + ny * dx < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const wt = hy * (1 - 2 * b0), wb = hy * (1 - 2 * b1), h0 = len * a0, h1 = len * a1;
        const a = R.vert(px + nx * wb - dx * h0, py + ny * wb - dy * h0, pz + nz * wb - dz * h0, fu0, fv1, pc, 0);
        R.vert(px + nx * wt - dx * h0, py + ny * wt - dy * h0, pz + nz * wt - dz * h0, fu0, fv0, pc, 0);
        R.vert(px + nx * wb - dx * h1, py + ny * wb - dy * h1, pz + nz * wb - dz * h1, fu1, fv1, pc, 0);
        R.vert(px + nx * wt - dx * h1, py + ny * wt - dy * h1, pz + nz * wt - dz * h1, fu1, fv0, pc, 0);
        R.quadIdx(a);
      } else {
        const rot = -P.rot;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const ox = r.pivot ? r.pivot[0] * sx : 0, oy = r.pivot ? r.pivot[1] * sy : 0;
        const corner = (lx, ly, u, v) => R.vert(px + (lx + ox) * cs - (ly + oy) * sn, py + (lx + ox) * sn + (ly + oy) * cs, pz, u, v, pc, 0);
        const x0 = -hx + 2 * hx * a0, x1 = -hx + 2 * hx * a1, yt = hy - 2 * hy * b0, yb = hy - 2 * hy * b1;
        const a = corner(x0, yb, fu0, fv1);
        corner(x0, yt, fu0, fv0);
        corner(x1, yb, fu1, fv1);
        corner(x1, yt, fu1, fv0);
        R.quadIdx(a);
      }
      stats.particles++;
    }
  }
}
