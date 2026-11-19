// Loot scan (R.E.P.O. style): the first time a loot item enters the player's sight it is scanned once.
//   seen   = within SCAN.range (8 m) of the camera, on screen, lit (inside the torch cone or within reach of a house lamp)
//            and not hidden (a ray from the camera hits the item first: walls, doors, furniture, other loot all block)
//   scan   = a light band sweeps up the item in SCAN.sweep s over a fresnel rim in the value tier colour, a synthesized
//            ping (pitch by value) and the value as money digits floating over the item, fading after SCAN.label s
//   after  = a seen item keeps a very faint rim while it sits in the torch cone (to find it again); unseen items have none
//   hit    = a seen item that loses value flashes its new value in red
// Only the player's camera scans: bots looking at loot do nothing on screen. At most SCAN.max sweeps run at once (the rest
// wait their turn), and at most SCAN.rims faint rims are drawn. Detection runs on sim time (stepSim), drawing per frame.
import * as THREE from '../vendor/three.module.min.js';

export const SCAN = {
  range: 8, every: 0.1, sweep: 0.6, label: 1.5, fade: 0.5, max: 3, rims: 6, rimRange: 10,
  tiers: [1400, 4200],                          // value0 below 1400 common, below 4200 good, else rare (CFG.loot.sizes)
  colors: [0x8fd3ff, 0x6dffa0, 0xffc040],
};
export const tierOf = (v) => (v < SCAN.tiers[0] ? 0 : v < SCAN.tiers[1] ? 1 : 2);
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

const VERT = `uniform float uY0, uY1; varying vec3 vN; varying vec3 vV; varying float vY;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  vY = (wp.y - uY0) / max(1e-3, uY1 - uY0); gl_Position = projectionMatrix * viewMatrix * wp; }`;
// uHull 1: the back faces of a slightly larger copy, an outline that shows on any item colour (white vases, glowing orbs)
const FRAG = `uniform vec3 uCol; uniform float uT, uAmp, uRim, uHull; varying vec3 vN; varying vec3 vV; varying float vY;
void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float band = uT < 0.0 ? 0.0 : exp(-pow((vY - uT) * 8.0, 2.0));
  float wake = uT < 0.0 ? 0.0 : step(vY, uT) * 0.3 * (1.0 - uT);
  float a = uHull > 0.5 ? (0.7 + band * 1.6) * uAmp : (f * uRim + band * 1.6 + wake) * uAmp; gl_FragColor = vec4(uCol * a, a); }`;

function overlayMat(hull, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...(uniforms || { uCol: { value: new THREE.Color() }, uT: { value: -1 }, uAmp: { value: 0 }, uRim: { value: 1 }, uY0: { value: 0 }, uY1: { value: 1 } }), uHull: { value: hull ? 1 : 0 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    side: hull ? THREE.BackSide : THREE.FrontSide,
  });
}

export class Scan {
  constructor(G) {
    this.G = G; this.t = 0; this.acc = 0;
    this.active = []; this.queue = []; this.labels = [];
    this.fired = new Map();          // item -> times scanned (tests: exactly once)
    this.log = [];
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._p = new THREE.Vector3();
    const mk = () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), overlayMat(false)); m.frustumCulled = false; m.renderOrder = 6; m.scale.setScalar(1.04);
      const { uHull, ...shared } = m.material.uniforms;   // the hull shares every uniform but uHull
      const h = new THREE.Mesh(m.geometry, overlayMat(true, shared)); h.frustumCulled = false; h.renderOrder = 6; h.scale.setScalar(1.07); m.add(h); m.userData.hull = h; return m; };
    this.sweepPool = Array.from({ length: SCAN.max }, mk);
    this.rimPool = Array.from({ length: SCAN.rims }, mk);
    this.layer = null;
    if (typeof document !== 'undefined') {
      const st = document.createElement('style');
      st.textContent = '.scanx{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:hidden}'
        + '.scanx b{position:absolute;transform:translate(-50%,-100%);font:800 18px/1 system-ui,sans-serif;letter-spacing:.5px;white-space:nowrap;'
        + 'text-shadow:0 0 6px currentColor,0 1px 2px #000,0 0 2px #000}'
        + '.scanx b.hit{color:#ff3b30!important;animation:scanhit .16s steps(2) 4}@keyframes scanhit{50%{opacity:.15}}';
      document.head.appendChild(st);
      this.layer = document.createElement('div'); this.layer.className = 'scanx'; document.body.appendChild(this.layer);
    }
    G.events.on('loot:hit', (e) => { const it = e.item; if (it.seen && !it.dead) this.showLabel(it, true); });
    G.events.on('loot:break', (e) => { const it = e.item; if (it.seen) this.showLabel(it, true, e.point); });
  }

  /** Is this item seen by the player right now (range, screen, light, line of sight)? */
  sees(it) {
    const G = this.G, P = G.player, cam = G.camera; if (!P || P.down || it.dead) return false;
    const t = it.body.translation(), c = P.camPos;
    const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d > SCAN.range || d < 0.05) return false;
    const v = this._v.set(t.x, t.y, t.z).project(cam);
    if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) return false;
    const f = cam.getWorldDirection(this._f), cosA = (dx * f.x + dy * f.y + dz * f.z) / d;
    const torch = G.torch && G.torch.visible !== false && G.torch.intensity > 0.5;
    let lit = torch && cosA > Math.cos(G.torch.angle);
    if (!lit) for (const l of G.house?.lamps || []) { if (Math.hypot(l.x - t.x, l.y - t.y, l.z - t.z) < l.d * 0.45) { lit = true; break; } }
    if (!lit) return false;
    const R = G.phys.R, ray = new R.Ray(c, { x: dx / d, y: dy / d, z: dz / d });
    const hit = G.phys.world.castRay(ray, d + 0.5, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col);
    return !!hit && hit.collider.handle === it.col.handle;
  }

  /** Sim step: look for newly seen loot every SCAN.every s. */
  step(dt) {
    this.t += dt; this.acc += dt;
    for (const s of this.active) s.t += dt;
    for (const l of this.labels) l.t += dt;
    this.active = this.active.filter((s) => s.t < SCAN.sweep && !s.it.dead);
    while (this.active.length < SCAN.max && this.queue.length) { const it = this.queue.shift(); if (!it.dead) this.active.push({ it, t: 0 }); }
    this.labels = this.labels.filter((l) => l.t < l.life + SCAN.fade);
    if (this.acc < SCAN.every) return;
    this.acc = 0;
    for (const it of this.G.loot?.items || []) {
      if (it.seen || it.dead || !it.col) continue;
      if (!this.sees(it)) continue;
      this.fire(it);
    }
  }

  fire(it) {
    it.seen = true; it.seenAt = this.t;
    this.fired.set(it, (this.fired.get(it) || 0) + 1);
    if (this.active.length < SCAN.max) this.active.push({ it, t: 0 }); else this.queue.push(it);
    this.showLabel(it, false);
    const k = Math.max(0, Math.min(1, Math.log(Math.max(1, it.value) / 400) / Math.log(9000 / 400)));
    this.G.audio?.play('ping', null, 0.55, 0.8 + 0.55 * k);
    this.log.push(['scan', it.material, it.value, tierOf(it.value0)]);
    this.G.events.emit('loot:scan', { item: it, tier: tierOf(it.value0) });
  }

  showLabel(it, hit, at) {
    let l = this.labels.find((x) => x.it === it);
    if (!l) { if (this.labels.length >= 8) this.labels.shift(); l = { it, el: null }; this.labels.push(l); }
    l.t = 0; l.life = hit ? 1.2 : SCAN.label; l.hit = hit; l.at = at || null; l.value = it.value;
  }

  /** Per render frame: overlays and labels. */
  render() {
    const G = this.G, cam = G.camera;
    // sweeps
    this.sweepPool.forEach((m, i) => {
      const s = this.active[i];
      if (!s || s.it.dead) { if (m.parent) m.parent.remove(m); return; }
      this.dress(m, s.it); const k = s.t / SCAN.sweep, u = m.material.uniforms;
      u.uT.value = Math.min(1.05, k * 1.1); u.uRim.value = 1.2; u.uAmp.value = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    });
    // faint rims on seen items in the torch cone (nearest first), not on the ones sweeping now
    const P = G.player, c = P?.camPos, f = cam.getWorldDirection(this._f), cosT = Math.cos((G.torch?.angle || 0.6) * 1.05);
    const rims = [];
    if (c && G.torch && G.torch.visible !== false && G.torch.intensity > 0.5) for (const it of G.loot?.items || []) {
      if (!it.seen || it.dead || this.active.some((s) => s.it === it)) continue;
      const p = it.mesh.position, dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > SCAN.rimRange || d < 0.05 || (dx * f.x + dy * f.y + dz * f.z) / d < cosT) continue;
      rims.push([d, it]);
    }
    rims.sort((a, b) => a[0] - b[0]);
    this.rimPool.forEach((m, i) => {
      const r = rims[i]; if (!r) { if (m.parent) m.parent.remove(m); return; }
      this.dress(m, r[1]); const u = m.material.uniforms; u.uT.value = -1; u.uRim.value = 1; u.uAmp.value = 0.32;
    });
    // labels
    if (!this.layer) return;
    const W = innerWidth, H = innerHeight;
    for (const l of this.labels) {
      if (!l.el) { l.el = document.createElement('b'); this.layer.appendChild(l.el); }
      const it = l.it, el = l.el;
      const p = l.at ? this._p.set(l.at.x, l.at.y, l.at.z) : this._p.copy(it.mesh.position);
      const r = it.mesh.geometry.boundingSphere?.radius || 0.3; p.y += r + 0.12;
      const v = p.project(cam);
      const show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = show ? '' : 'none';
      if (!show) continue;
      el.style.left = ((v.x + 1) / 2 * W).toFixed(1) + 'px'; el.style.top = ((1 - v.y) / 2 * H).toFixed(1) + 'px';
      const txt = money(l.value); if (el.textContent !== txt) el.textContent = txt;
      el.style.color = '#' + SCAN.colors[tierOf(it.value0)].toString(16).padStart(6, '0');
      el.classList.toggle('hit', !!l.hit);
      el.style.opacity = String(l.t < l.life ? 1 : Math.max(0, 1 - (l.t - l.life) / SCAN.fade));
    }
    for (const el of [...this.layer.children]) if (!this.labels.some((l) => l.el === el)) el.remove();
  }

  dress(m, it) {
    if (m.parent !== it.mesh) { it.mesh.add(m); m.geometry = m.userData.hull.geometry = it.mesh.geometry; }
    const g = it.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const r = g.boundingSphere.radius, y = it.mesh.position.y, u = m.material.uniforms;
    u.uY0.value = y - r; u.uY1.value = y + r; u.uCol.value.setHex(SCAN.colors[tierOf(it.value0)]);
  }

  hidden(on) { if (this.layer) this.layer.style.display = on ? 'none' : ''; }
  reset() { this.active = []; this.queue = []; this.labels = []; this.fired.clear(); if (this.layer) this.layer.innerHTML = ''; }
  dispose() { this.reset(); for (const m of [...this.sweepPool, ...this.rimPool]) { if (m.parent) m.parent.remove(m); m.material.dispose(); m.userData.hull.material.dispose(); } this.layer?.remove(); }
}
