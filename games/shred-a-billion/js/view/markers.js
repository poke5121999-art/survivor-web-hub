// World markers drawn from the original prefabs: the white tutorial arrow (Intro/Arrow, TutorialArrow material),
// golden boost orbs (Live/BoostOrbs/BoostOrb: ring, ring wall, pulse, beam planes, gold core) and the last-notes
// arrows (MoneyPile/LastNotesArrows/Mark: glow, arrow, column, ring). Motion numbers: rules/intro.md §4, drop2.md §A4/§E2.
import * as THREE from 'three';
import { loadSlice } from './scenegraph.js';
import { ORB, ORB_STATE } from '../sim/boosts.js';
import { NX, CELL, OX, OZ } from '../sim/pile.js';

const ARW = { fade: 0.3, hover: 0.55, bob: 0.16, bobSpeed: 2.6, nearScale: 1, farScale: 3.4, near: 5, far: 45 };
const outBack = (t, s = 2.2) => { t = Math.min(1, Math.max(0, t)) - 1; return 1 + t * t * ((s + 1) * t + s); };
const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

function cloneGroup(slice, filter) {
  const g = new THREE.Group();
  for (const m of slice.group.children) if (!filter || filter(m.userData.path)) { const c = m.clone(); c.material = m.material.clone(); c.material.transparent = true; c.material.depthWrite = false; c.userData = { ...m.userData, base: m.matrix.clone(), op: m.material.opacity ?? 1 }; c.matrixAutoUpdate = false; g.add(c); }
  return g;
}
const setOpacity = (g, a) => g.traverse(o => { if (o.isMesh) o.material.opacity = (o.userData.op ?? 1) * a; });

export class Markers {
  constructor(scene) { this.scene = scene; this.t = 0; }
  async load() {
    const [intro, orb, lna] = await Promise.all([loadSlice('./art/intro/'), loadSlice('./art/orb/'), loadSlice('./art/lna/')]);
    // tutorial arrow: the slice keeps world matrices; use the mesh at the origin and drive the transform
    const arrowMesh = intro.group.children.find(m => m.userData.path === 'Intro/Arrow/Visual');
    const am = arrowMesh.clone(); am.matrixAutoUpdate = true; am.matrix.identity(); am.position.set(0, 0, 0);
    am.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    am.geometry.computeBoundingBox(); const bb = am.geometry.boundingBox; am.geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    this.arrow = new THREE.Group(); this.arrow.add(am); this.arrow.visible = false; this.arrowMat = am.material; this.arrowA = 0; this.arrowPos = null;
    this.scene.add(this.arrow);
    this.orbs = Array.from({ length: ORB.count }, () => { const g = cloneGroup(orb); g.visible = false; this.scene.add(g); return g; });
    this.lna = Array.from({ length: 8 }, () => { const g = cloneGroup(lna); g.visible = false; this.scene.add(g); return g; });
    this.lnaT = 0; this.heaps = [];
    // gilt glints (mb:GiltGlints, simplified): twinkling gold stars over each live patch
    const star = await new THREE.TextureLoader().loadAsync('./art/ui/star.webp');
    this.glintMat = new THREE.PointsMaterial({ map: star, color: 0xffd24a, size: 0.18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.glints = Array.from({ length: 6 }, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3)); const pts = new THREE.Points(g, this.glintMat); pts.visible = false; pts.frustumCulled = false; this.scene.add(pts); return { pts, seeds: Array.from({ length: 24 }, () => [Math.random(), Math.random(), Math.random() * 6]) }; });
    return this;
  }
  placeGroup(g, pos, scale = 1, spin = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin), new THREE.Vector3(scale, scale, scale));
    for (const c of g.children) c.matrix.multiplyMatrices(m, c.userData.base);
  }
  // pile target for the "grab" step: keep the last point while it is on money 1.2-9 m away, else walk out along
  // the flat camera forward (ArrowReach values are UNKNOWN; 3, 5, 7, 9 m used)
  pilePoint(game, player) {
    const p = player.pos, f = game.field;
    const ok = (q) => q && f.hasMoney(q[0], q[2]) && Math.hypot(q[0] - p[0], q[2] - p[2]) >= 1.2 && Math.hypot(q[0] - p[0], q[2] - p[2]) <= 9;
    if (ok(this.pileTarget)) { this.pileTarget[1] = f.heightAt(this.pileTarget[0], this.pileTarget[2]); return this.pileTarget; }
    const fw = [-Math.sin(player.yaw), -Math.cos(player.yaw)];
    for (const d of [3, 5, 7, 9]) { const q = [p[0] + fw[0] * d, 0, p[2] + fw[1] * d]; if (f.hasMoney(q[0], q[2])) { q[1] = f.heightAt(q[0], q[2]); return (this.pileTarget = q); } }
    for (let dz = 2; dz <= 14; dz += 2) { const q = [Math.max(-8, Math.min(8, p[0])), 0, -(OZ + dz)]; if (f.hasMoney(q[0], q[2])) { q[1] = f.heightAt(q[0], q[2]); return (this.pileTarget = q); } }
    return null;
  }
  update(dt, game, player, cam, arrowKind) {
    this.t += dt;
    // ---- tutorial arrow ----
    let target = null;
    if (Array.isArray(arrowKind)) target = arrowKind;
    else if (arrowKind === 'pile') target = this.pilePoint(game, player);
    else if (arrowKind === 'shredder') { const s = game.markers.shredderIntake; target = [s[0], s[1] + 0.4, s[2]]; }
    else if (arrowKind === 'boost') { const o = game.boosts.orbs.find(o => o.state === ORB_STATE.Live); if (o) target = [o.pos[0], o.pos[1] + 0.2, o.pos[2]]; }
    else if (arrowKind === 'prof') target = game.markers.profBoard || null;
    else if (arrowKind === 'chest') { const c = game.finds.chest; if (c && (c.state === 'buried' || c.state === 'ready')) target = [c.x, Math.max(c.curY + 0.74, game.field.heightAt(c.x, c.z) || c.curY) + 0.15, c.z]; }
    const want = target ? 1 : 0;
    this.arrowA += Math.sign(want - this.arrowA) * Math.min(Math.abs(want - this.arrowA), dt / ARW.fade);
    if (target) { if (!this.arrowPos) this.arrowPos = target.slice(); const k = 1 - Math.exp(-6 * dt); for (let i = 0; i < 3; i++) this.arrowPos[i] += (target[i] - this.arrowPos[i]) * k; }
    this.arrow.visible = this.arrowA > 0.01 && !!this.arrowPos;
    if (this.arrow.visible) {
      const d = cam.position.distanceTo(new THREE.Vector3(...this.arrowPos));
      const sc = (ARW.nearScale + (ARW.farScale - ARW.nearScale) * Math.min(1, Math.max(0, (d - ARW.near) / (ARW.far - ARW.near)))) * (0.82 + 0.18 * sm(this.arrowA));
      const h = sc * (ARW.hover + ARW.bob * (0.5 + 0.5 * Math.sin(this.t * 2.4)));
      this.arrow.position.set(this.arrowPos[0], this.arrowPos[1] + h, this.arrowPos[2]);
      this.arrow.scale.setScalar(sc);
      this.arrow.rotation.y = Math.atan2(cam.position.x - this.arrowPos[0], cam.position.z - this.arrowPos[2]);
      this.arrowMat.opacity = this.arrowA;
    }
    // ---- boost orbs ----
    game.boosts.orbs.forEach((o, i) => {
      const g = this.orbs[i];
      if (o.state === ORB_STATE.Hidden) { g.visible = false; return; }
      g.visible = true;
      let sc = 1, a = 1;
      if (o.state === ORB_STATE.Live) {
        sc = outBack(o.age / 0.5); const rem = o.life - o.age;
        if (rem < ORB.warn) { const w = 1 - Math.min(1, rem / ORB.warn), p = Math.sin((w * 14 + 8) * o.age); a *= 0.75 + 0.25 * p; sc *= 1 + 0.1 * p; }
      } else if (o.state === ORB_STATE.Collecting) { const t = o.t / ORB.collect; sc = (1 - t * t * t) * (1 + 0.7 * (1 - (1 - t) ** 3)); a = 1 - t; }
      else { const t = o.t / ORB.fade; sc = 1 - t * t * t; a = 1 - t; }
      this.placeGroup(g, [o.pos[0], o.pos[1] - ORB.hover, o.pos[2]], Math.max(0.001, sc), this.t * 0.8 + o.phase);
      // the gold core bobs above the ring
      for (const c of g.children) if (/Core$/.test(c.userData.path)) c.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, 0.08 * Math.sin(this.t * 2 + o.phase), 0));
      setOpacity(g, a);
    });
    // ---- gilt glints ----
    const F = game.field;
    this.glints.forEach((gl, i) => {
      const p = F.giltPatches[i], on = !!p && F.giltLeft[i] > 0; gl.pts.visible = on; if (!on) return;
      const a = gl.pts.geometry.attributes.position, rr = p.r * CELL;
      const cx = OX + (p.cx + 0.5) * CELL, cz = -(OZ + (p.cz + 0.5) * CELL);
      gl.seeds.forEach((sd, k) => {
        const life = (this.t * 0.6 + sd[2]) % 1, ang = sd[0] * Math.PI * 2 + Math.floor(this.t * 0.6 + sd[2]) * 2.3, rad = Math.sqrt((sd[1] + Math.floor(this.t * 0.6 + sd[2]) * 0.37) % 1) * rr;
        const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad, h = F.heightAt(x, z);
        a.setXYZ(k, x, (isFinite(h) ? h : 0) + 0.05 + life * 0.25, z);
      });
      a.needsUpdate = true;
    });
    this.glintMat.opacity = 0.75 + 0.25 * Math.sin(this.t * 7);
    // ---- last-notes arrows: when <= 2000 visible notes remain in the level, point at up to 8 heaps (0.2 s refresh) ----
    this.lnaT -= dt;
    if (this.lnaT <= 0) {
      this.lnaT = 0.2; const f = game.field; this.heaps = [];
      if (f.visible > 0 && f.visible <= 2000) {
        const cells = []; for (let c = 0; c < f.n; c++) if (f.count[c] > 0) cells.push(c);
        cells.sort((a, b) => f.count[b] - f.count[a]);
        for (const c of cells) {
          const x = OX + ((c % NX) + 0.5) * CELL, z = -(OZ + (((c / NX) | 0) + 0.5) * CELL);
          if (this.heaps.every(h => Math.hypot(h[0] - x, h[2] - z) > 3)) this.heaps.push([x, f.topY(c), z]);
          if (this.heaps.length >= 8) break;
        }
      }
    }
    this.lna.forEach((g, i) => {
      const h = this.heaps[i]; g.visible = !!h; if (!h) return;
      const sc = Math.min(4, Math.max(1, cam.position.distanceTo(new THREE.Vector3(...h)) / 12));
      this.placeGroup(g, [h[0], h[1] + 0.15 * sc * Math.sin(1.7 * i + 2.2 * this.t), h[2]], sc, this.t);
    });
  }
}
