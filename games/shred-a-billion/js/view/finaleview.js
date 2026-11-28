// The golden key and the big door from the hall scene (VaultBig/GoldenReserve), driven by sim/finale.js poses,
// plus the white light behind the open door (BustedDirector.lightRoot) and the white screen overlay (TickLight).
import * as THREE from 'three';
import { KS, DS, KEYPT, inOutCubic } from '../sim/finale.js';

const KEY_RE = /^VaultBig\/GoldenReserve\/GoldenKey\//;
const DOOR_RE = /^VaultBig\/GoldenReserve\/ReserveDoor\/(Art\/Door|KeyholeHalo)/;
export const FINALE_DYNAMIC = (p) => KEY_RE.test(p) || DOOR_RE.test(p);
const HINGE = new THREE.Vector3(3.998, -32.331, -48.358);    // ReserveDoor/Art/Door (the hinge bracket)
const WHEEL = new THREE.Vector3(0, -32.331, -47.23);          // ReserveDoor/Art/Door/Leaf/Wheel
const SCALE = 2.05;                                           // the door prefab scale (local units -> metres)
const ROOM = { x0: -10, x1: 10, y0: -38.75, y1: -28.25, z0: -66, z1: -48.4 };   // GoldenReserve/Room/Shell bounds

// VaultShapeSwitch.atTheDoor: the white light (Finale/Busted/Light) is authored at the classic door (0,-32,40) and
// moved to the big door (0,-36,46) with the per-axis scale (1.2, 1.3, 2.05) (three space: z flipped)
const CLASSIC_DOOR = new THREE.Vector3(0, -32, -40), BIG_DOOR = new THREE.Vector3(0, -36, -46), AT_DOOR_SCALE = new THREE.Vector3(1.2, 1.3, 2.05);
const LEVER = { pivot: new THREE.Vector3(11.25, 3.52, 3.3), rest: -28, pulled: 42, pop: 0.45 };
// Game/PortalLight (the curtain of light in the doorway): the shader is not in the build; ported from its material
// values (_Core 1.9, _CoreSize 0.55, _Radius 0.42, _Rim 0.82, _Rays 13, _RaySpeed 0.5, _RayDepth 0.2, _Breath 0.07)
function portalMaterial(src) {
  const c = (k, d) => new THREE.Color(...((src.colors && src.colors[k]) || d).slice(0, 3));
  const f = (k, d) => (src.floats && src.floats[k] != null ? src.floats[k] : d);
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Color(...src.color.slice(0, 3)) }, uBack: { value: c('_BackColor', [0.93, 0.93, 0.9]) }, uRim: { value: c('_RimColor', [1, 0.93, 0.78]) },
      uCentre: { value: new THREE.Vector2(...((src.colors && src.colors._Centre) || [0, 0]).slice(0, 2)) }, uCore: { value: f('_Core', 1.9) }, uCoreSize: { value: f('_CoreSize', 0.55) }, uRadius: { value: f('_Radius', 0.42) },
      uRimK: { value: f('_Rim', 0.82) }, uRays: { value: f('_Rays', 13) }, uRaySpeed: { value: f('_RaySpeed', 0.5) }, uRayDepth: { value: f('_RayDepth', 0.2) }, uBreath: { value: f('_Breath', 0.07) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uA, uCore, uCoreSize, uRadius, uRimK, uRays, uRaySpeed, uRayDepth, uBreath; uniform vec3 uColor, uBack, uRim; uniform vec2 uCentre;
      void main(){ vec2 p = vUv - 0.5 - uCentre; float r = length(p) * (1.0 - uBreath * sin(uTime * 1.7));
        float ang = atan(p.y, p.x); float rays = 1.0 - uRayDepth * (0.5 + 0.5 * sin(ang * uRays + uTime * uRaySpeed * 6.2832));
        float core = smoothstep(uCoreSize, 0.0, r) * uCore; float rim = smoothstep(uRadius * 0.6, uRadius, r) * uRimK;
        vec3 col = mix(uBack, uRim, rim) * rays + uColor * core; gl_FragColor = vec4(col, uA); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

export class FinaleView {
  // one cube capture of the reserve passage from in front of the door (doors hidden), prefiltered for roughness
  bakeEnv(renderer, at = new THREE.Vector3(0, -32.3, -41.5)) {
    if (!this.metals.length) return;
    const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(0.1, 150, rt);
    cc.position.copy(at); this.scene.add(cc);
    const hidden = this.door.filter(r => r.visible); for (const r of hidden) r.visible = false;
    cc.update(renderer, this.scene);
    for (const r of hidden) r.visible = true;
    this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromCubemap(rt.texture).texture; pm.dispose(); rt.dispose();
    for (const m of this.metals) { m.envMap = env; m.envMapIntensity = 1; m.needsUpdate = true; }
  }
  constructor(scene, dynamic, bakeAt, fin) {
    this.scene = scene;
    const mk = (m) => { const r = bakeAt(m, m.matrix.clone()); r.material = r.material.clone(); return r; };
    this.key = dynamic.filter(m => KEY_RE.test(m.userData.path)).map(mk);
    // the door's metals (Reserve_DoorGold / GoldDeep / DoorChrome / DoorSteel*, URP Lit Metallic 0.75-1, Smoothness .55-.76)
    // get their look from reflections, not from diffuse light: a standard material with the source metalness/roughness and
    // an environment captured in front of the door (bakeEnv) instead of the baked diffuse (f22: glossy gold, dark reflections)
    this.metals = [];
    const mkDoor = (m) => {
      const r = mk(m), src = m.material.userData && m.material.userData.src;
      if (src && (src.Metallic || 0) >= 0.5 && !/Fx/.test(m.material.name)) {
        r.material = new THREE.MeshStandardMaterial({ color: m.material.color.clone(), metalness: src.Metallic, roughness: 1 - (src.Smoothness ?? 0.5), fog: true });
        r.material.name = m.material.name; this.metals.push(r.material);
      }
      return r;
    };
    this.door = dynamic.filter(m => DOOR_RE.test(m.userData.path)).map(mkDoor);
    for (const r of [...this.key, ...this.door]) {
      const p = r.userData.path;
      r.userData.kind = /GoldenKey\/Visual/.test(p) ? 'key' : /GoldenKey\/Beam/.test(p) ? 'beam' : /GoldenKey\/Halo/.test(p) ? 'khalo'
        : /KeyholeHalo/.test(p) ? 'halo' : /Leaf\/Wheel$/.test(p) ? 'wheel' : /Leaf\/Bolt(\d)$/.test(p) ? 'bolt' : /Leaf$/.test(p) ? 'leaf' : 'bracket';
      if (r.userData.kind === 'bolt') {
        r.userData.bolt = +/Bolt(\d)$/.exec(p)[1] - 1;
        const b = new THREE.Vector3().setFromMatrixPosition(r.userData.base); const dir = new THREE.Vector3(WHEEL.x - b.x, WHEEL.y - b.y, 0).normalize();
        r.userData.dir = dir;
      }
      // the unlit FX (glow_soft / beam_soft) are additive particles in Unity
      if (/Fx(Halo|Beam)/.test(r.material.name)) { r.material.blending = THREE.AdditiveBlending; r.material.depthWrite = false; r.material.transparent = true; r.material.vertexColors = false; r.material.fog = false; r.material.toneMapped = false; r.userData.fx = r.material.color.clone(); }
    }
    // white light behind the open door (BustedDirector.lightRoot = Finale/Busted/Light, moved by VaultShapeSwitch.atTheDoor)
    const atDoor = new THREE.Matrix4().makeTranslation(BIG_DOOR.x, BIG_DOOR.y, BIG_DOOR.z).multiply(new THREE.Matrix4().makeScale(AT_DOOR_SCALE.x, AT_DOOR_SCALE.y, AT_DOOR_SCALE.z)).multiply(new THREE.Matrix4().makeTranslation(-CLASSIC_DOOR.x, -CLASSIC_DOOR.y, -CLASSIC_DOOR.z));
    this.lightRoot = new THREE.Group(); this.lightRoot.visible = false; scene.add(this.lightRoot); this.portal = [];
    this.lever = []; this.leverA = LEVER.rest; this.leverPop = 1; this.leverShown = false;
    if (fin) for (const m of fin.group.children) {
      const p = m.userData.path, src = m.material.userData.src || {};
      if (/^Finale\/Busted\/Light\//.test(p)) {
        const mat = src.shader === 'Game/PortalLight' ? portalMaterial(src) : new THREE.MeshBasicMaterial({ color: new THREE.Color(...src.color.slice(0, 3)).multiplyScalar(1.25), fog: false, side: THREE.DoubleSide });
        const r = new THREE.Mesh(m.geometry, mat); r.matrixAutoUpdate = false; r.matrix.copy(atDoor).multiply(m.matrix); r.renderOrder = 3;
        if (mat.isShaderMaterial) this.portal.push(mat);
        this.lightRoot.add(r);
      } else if (/^Finale\/RefillLever\/Visual\/Model\//.test(p)) {
        const r = bakeAt(m, m.matrix.clone()); r.userData.handle = /handle$/.test(p); r.visible = false; this.lever.push(r);
      }
    }
    // the lever's sign (SignText, TextMeshPro "REFILL THE VAULT"): a canvas label on the body
    this.signCv = document.createElement('canvas'); this.signCv.width = 512; this.signCv.height = 128;
    this.signTex = new THREE.CanvasTexture(this.signCv); this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.22), new THREE.MeshBasicMaterial({ map: this.signTex, transparent: true }));
    // on the board atop the lever body (body bounds: 2.135 m tall, front face at local z -0.23)
    this.sign.position.set(11.005, 4.86, 3.3); this.sign.rotation.y = -Math.PI / 2; this.sign.visible = false; scene.add(this.sign);
    // spill glow out of the doorway (ReserveDoor/Spill: ShaftCore/Shaft/SpillGlow), additive
    this.spillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 8.6), this.spillMat); this.spill.position.set(0, -32, -46.6); scene.add(this.spill);
    this.white = document.getElementById('white');
    this.tmp = new THREE.Matrix4(); this.tmp2 = new THREE.Matrix4(); this.t = 0;
    this.flyFrom = null;
  }

  update(dt, game, handPoint) {
    const F = game.finale, k = F.key, t = (this.t += dt);
    // ---- key ----
    const shown = k.state === KS.Rising || k.state === KS.Idle || k.state === KS.Flying;
    const kp = F.keyPos();
    let pos = kp, sc = 1;
    if (k.state === KS.Rising) sc = Math.max(0.05, Math.min(1.2, outBack(Math.min(1, k.t / 1.1), 1.4)));
    if (k.state === KS.Flying) { if (!this.flyFrom) this.flyFrom = kp.slice(); const u = Math.min(1, k.t / 0.6), e = u * u * (3 - 2 * u); pos = this.flyFrom.map((v, i) => v + (handPoint[i] - v) * e); sc = 1 - 0.8 * e; }
    else this.flyFrom = null;
    const rest = [KEYPT[0], KEYPT[1] + 0.123, KEYPT[2]];
    for (const r of this.key) {
      const kind = r.userData.kind;
      r.visible = shown && (kind === 'key' || k.state !== KS.Flying);
      if (!r.visible) continue;
      const base = r.userData.base, bp = new THREE.Vector3().setFromMatrixPosition(base);
      const off = kind === 'beam' ? [0, 0, 0] : [pos[0] - rest[0], pos[1] - rest[1], pos[2] - rest[2]];
      const s = kind === 'key' ? sc : 1;
      this.tmp.makeTranslation(bp.x + off[0], bp.y + off[1], bp.z + off[2]).multiply(this.tmp2.makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-bp.x, -bp.y, -bp.z));
      r.matrix.copy(this.tmp).multiply(base);
      if (r.userData.fx) { const a = kind === 'khalo' ? 0.8 + 0.2 * Math.sin(t * 3) : 1; r.material.color.copy(r.userData.fx).multiplyScalar(a * (k.state === KS.Rising ? Math.min(1, k.t / 0.4) : 1)); }
    }
    // ---- door ----
    const P = F.doorPose(), D = F.door;
    const swing = new THREE.Matrix4().makeTranslation(HINGE.x, HINGE.y, HINGE.z).multiply(new THREE.Matrix4().makeRotationY(-P.swing * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-HINGE.x, -HINGE.y, -HINGE.z));
    const unseat = new THREE.Matrix4().makeTranslation(0, 0, -0.06 * SCALE * P.unseat);
    const leafM = swing.clone().multiply(unseat);
    for (const r of this.door) {
      const kind = r.userData.kind, base = r.userData.base;
      if (kind === 'bracket') { r.matrix.copy(swing).multiply(base); continue; }
      if (kind === 'halo') {
        r.visible = D.state === DS.Closed && !F.sealed;
        const s = (0.6 + 0.6 * P.halo) * (1 + 0.35 * P.halo * Math.sin(5 * t)), c = new THREE.Vector3().setFromMatrixPosition(base);
        r.matrix.makeTranslation(c.x, c.y, c.z).multiply(this.tmp2.makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)).multiply(base);
        continue;
      }
      let local = new THREE.Matrix4();
      if (kind === 'wheel') local.makeTranslation(WHEEL.x, WHEEL.y, WHEEL.z).multiply(new THREE.Matrix4().makeRotationZ(P.wheel * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-WHEEL.x, -WHEEL.y, -WHEEL.z));
      if (kind === 'bolt') { const d = r.userData.dir, a = 0.42 * SCALE * P.bolts[r.userData.bolt]; local.makeTranslation(d.x * a, d.y * a, 0); }
      r.matrix.copy(leafM).multiply(local).multiply(base);
    }
    // ---- light: lightRoot on while area.reserve and the run is not finished (and while the door swings open) ----
    const on = F.lightOn || (D.state !== DS.Closed && !F.sealed);
    this.lightRoot.visible = on && P.spill > 0.01;
    for (const m of this.portal) { m.uniforms.uTime.value = t; m.uniforms.uA.value = Math.min(1, P.spill / 0.35); }
    this.spill.visible = on; this.spillMat.opacity = 0.35 * P.spill;
    // ---- refill lever: shown after the finale, pops in, the handle leans from rest -28° to pulled 42° while held ----
    const lever = F.has('event.finale');
    if (lever !== this.leverShown) { this.leverShown = lever; this.leverPop = 0; for (const r of this.lever) r.visible = lever; this.sign.visible = lever; if (lever) this.drawSign(game); }
    if (lever) {
      this.leverPop = Math.min(1, this.leverPop + dt / LEVER.pop);
      const target = LEVER.rest + (LEVER.pulled - LEVER.rest) * Math.min(1, F.leverHold / 0.6);
      this.leverA += (target - this.leverA) * (1 - Math.exp(-14 * dt));
      const s = outBack(this.leverPop, 1.7), base = new THREE.Vector3(11.25, 3.0, 3.3);
      const pop = new THREE.Matrix4().makeTranslation(base.x, base.y, base.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z));
      for (const r of this.lever) {
        r.matrix.copy(pop);
        if (r.userData.handle) r.matrix.multiply(new THREE.Matrix4().makeTranslation(LEVER.pivot.x, LEVER.pivot.y, LEVER.pivot.z)).multiply(new THREE.Matrix4().makeRotationZ(-this.leverA * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-LEVER.pivot.x, -LEVER.pivot.y, -LEVER.pivot.z));
        r.matrix.multiply(r.userData.base);
      }
    }
    if (this.white) {
      const a = inOutCubic(Math.max(0, Math.min(1, F.whiteK)));
      const s = a.toFixed(3); if (this.white._a !== s) { this.white._a = s; this.white.style.opacity = s; this.white.style.display = a > 0.001 ? '' : 'none'; }
    }
  }
}
FinaleView.prototype.drawSign = function (game) {
  const c = this.signCv.getContext('2d'); c.clearRect(0, 0, 512, 128);
  c.fillStyle = '#f9c52f'; c.font = '600 58px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText((window.__T ? window.__T('encore.sign') : 'REFILL THE VAULT'), 256, 66); this.signTex.needsUpdate = true;
};
function outBack(k, s) { const t = k - 1; return t * t * ((s + 1) * t + s) + 1; }
