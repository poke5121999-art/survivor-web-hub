// Spring chains for the bones the clips do not animate (hair locks, skirt / coat / cape panels): verlet particles that
// follow the animated rest pose, fall with gravity, keep their bone lengths and are pushed out of body capsules
// (thighs, shins, torso, upper arms, head). The bones are then rotated to point at the particles, so the GPU skinning
// of the strips follows.
import * as THREE from '../vendor/three.module.min.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
function closestOnSeg(p, a, b, out) { const ab = _s1.subVectors(b, a); const t = Math.max(0, Math.min(1, _s2.subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-12))); return out.copy(a).addScaledVector(ab, t); }

export class Springs {
  // bones: name -> THREE.Bone; table: character table; opts: { stiffCloth, stiffHair, damping }
  constructor(root, bones, table, opts = {}) {
    this.root = root; this.bones = bones; this.opts = Object.assign({ stiffCloth: 0.10, stiffHair: 0.16, damping: 0.86, gravity: 2.5, margin: 0.022, hairMargin: 0.024, stiffSkirt: 0.2, skirtMargin: 0.03 }, opts);
    this.chains = [];
    for (const s of table.springs) {
      const bs = s.joints.map((n) => bones[n]).filter(Boolean); if (!bs.length) continue;
      // tip offset in the last bone's local frame: a virtual tip, or the bone direction extended by the strip's end
      root.updateMatrixWorld(true);
      const last = bs[bs.length - 1];
      let tipLocal;
      if (s.tip && table.virt[s.tip]) { _a.fromArray(table.virt[s.tip]); tipLocal = last.worldToLocal(_a.clone()); }
      else { const prev = bs.length > 1 ? bs[bs.length - 2] : last.parent; const pw = prev.getWorldPosition(new THREE.Vector3()), lw = last.getWorldPosition(new THREE.Vector3());
        const dir = lw.clone().sub(pw).normalize(); tipLocal = last.worldToLocal(lw.clone().addScaledVector(dir, Math.max(0.03, s.ext || 0.05))); }
      // extend a short virtual tip so long strips bend too
      if (s.tip && s.ext) { const lw = last.getWorldPosition(new THREE.Vector3()), tw = last.localToWorld(tipLocal.clone()); const dir = tw.clone().sub(lw); const L = dir.length(); if (L > 1e-5) tipLocal = last.worldToLocal(lw.clone().addScaledVector(dir.normalize(), L + s.ext)); }
      const rest = bs.map((b) => b.quaternion.clone());
      this.chains.push({ kind: s.kind, bones: bs, rest, tipLocal, p: [], prev: [], len: [] });
    }
    this.caps = (table.capsules || []).map((c) => ({ a: bones[c.a], b: bones[c.b], r: c.r * 1.1 }));
    this.head = bones.Head_M; this.headR = (table.headSize || 0.3) * 0.5; this.headLocal = null;
    if (this.head) { root.updateMatrixWorld(true); this.headLocal = this.head.worldToLocal(new THREE.Vector3().fromArray(table.head.center)); }
    this.reset();
  }
  targets(ch) { // animated pose of the chain with rest locals
    ch.bones.forEach((b, i) => b.quaternion.copy(ch.rest[i])); ch.bones[0].updateMatrixWorld(true);
    const T = ch.bones.map((b) => b.getWorldPosition(new THREE.Vector3())); T.push(ch.bones[ch.bones.length - 1].localToWorld(ch.tipLocal.clone())); return T;
  }
  reset() { this.root.updateMatrixWorld(true); for (const ch of this.chains) { const T = this.targets(ch); ch.p = T.map((v) => v.clone()); ch.prev = T.map((v) => v.clone()); ch.len = T.slice(1).map((v, i) => v.distanceTo(T[i])); } }
  colliders() {
    const out = []; for (const c of this.caps) { if (!c.a || !c.b) continue; out.push({ a: c.a.getWorldPosition(new THREE.Vector3()), b: c.b.getWorldPosition(new THREE.Vector3()), r: c.r }); }
    if (this.head && this.headLocal) { const hc = this.head.localToWorld(this.headLocal.clone()); out.push({ a: hc, b: hc, r: this.headR * 0.92 }); }
    return out;
  }
  push(p, cols, extra) { for (const c of cols) { const q = closestOnSeg(p, c.a, c.b, _b); const d = p.distanceTo(q), R = c.r + extra; if (d < R) { if (d < 1e-6) p.y += R; else p.sub(q).multiplyScalar(R / d).add(q); } } }
  step(dt) {
    const o = this.opts; this.root.updateMatrixWorld(true);
    const cols = o.noCollide ? [] : this.colliders();
    const sub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / sub;
    for (const ch of this.chains) {
      const T = this.targets(ch), k = ch.kind === 'hair' ? o.stiffHair : ch.kind === 'skirt' ? o.stiffSkirt : o.stiffCloth, extra = ch.kind === 'hair' ? o.hairMargin : ch.kind === 'skirt' ? o.skirtMargin : o.margin;
      for (let s = 0; s < sub; s++) {
        ch.p[0].copy(T[0]); ch.prev[0].copy(T[0]);
        for (let i = 1; i < ch.p.length; i++) {
          const p = ch.p[i], v = _a.subVectors(p, ch.prev[i]).multiplyScalar(o.damping); ch.prev[i].copy(p);
          p.add(v); p.y -= o.gravity * h * h; p.lerp(T[i], k);
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < ch.p.length; i++) { const a = ch.p[i - 1], b = ch.p[i]; const d = b.distanceTo(a) || 1e-6; b.sub(a).multiplyScalar(ch.len[i - 1] / d).add(a); }
          for (let i = 1; i < ch.p.length; i++) {
            this.push(ch.p[i], cols, extra);
            const m = new THREE.Vector3().addVectors(ch.p[i - 1], ch.p[i]).multiplyScalar(0.5), m0 = m.clone(); this.push(m, cols, extra); const dm = m.sub(m0); if (i > 1) ch.p[i - 1].add(dm); ch.p[i].add(dm);
          }
        }
      }
      // aim the bones at the particles
      for (let i = 0; i < ch.bones.length; i++) {
        const b = ch.bones[i]; b.updateMatrixWorld(true);
        const bw = b.getWorldPosition(new THREE.Vector3());
        const cur = (i + 1 < ch.bones.length ? ch.bones[i + 1].getWorldPosition(new THREE.Vector3()) : b.localToWorld(ch.tipLocal.clone())).sub(bw);
        const want = ch.p[i + 1].clone().sub(bw); if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) continue;
        _q.setFromUnitVectors(cur.normalize(), want.normalize());
        b.getWorldQuaternion(_q2); _q2.premultiply(_q);
        const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); b.quaternion.copy(pq.multiply(_q2));
        b.updateMatrixWorld(true);
      }
    }
  }
}
void _m;
