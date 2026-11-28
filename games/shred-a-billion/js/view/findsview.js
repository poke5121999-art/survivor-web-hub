// World view of the finds and vault events: loose golden notes / relics / the Jackpot Crate (exported prefabs), the treasure
// chest with its beacon (TreasureChest: settle, lid 0.7 s to -108 deg, leave 0.8 s), the Golden Pallet (rise 1.2 s, sink 1.5 s),
// ceiling vents of the Money Delivery (flap -88 deg, hose slides 0.8 s), Gold Teller lamps (one per prize) and the FINDS board
// niches (silhouette until found). Numbers: rules/finds.md §A-E, rules/events.md §A.
import * as THREE from 'three';
import { loadSlice } from './scenegraph.js';
import { CHEST } from '../sim/finds.js';

const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
function group(slice, filter, relRe) {
  const g = new THREE.Group();
  for (const m of slice.group.children) {
    if (filter && !filter(m.userData.path)) continue;
    const c = m.clone(); c.material = m.material.clone(); c.matrixAutoUpdate = false; c.userData = { ...m.userData, base: m.matrix.clone() };
    if (relRe) c.userData.base = m.matrix.clone();
    g.add(c);
  }
  g.matrixAutoUpdate = true;
  for (const c of g.children) c.matrix.copy(c.userData.base);
  return g;
}

// Game/ChestGlow and Game/ChestBeam are custom shaders; their material floats drive these ports (the shader code is not in the
// build): glow = radial falloff^1.8 with 5 swirling hue spokes, shimmer 0.18; beam = camera-facing strip 0.95 wide x 3.6 tall,
// hue span 0.45, sat 0.55, soft 0.5 edges, pulse by beats (ChestBeacon: 4 beats every 0.32 s, rest 1.5 s)
function chestShaders(src) {
  const glow = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uHue: { value: 0 }, uA: { value: 1 }, uFall: { value: 1.8 }, uSpokes: { value: 5 }, uSwirl: { value: 0.3 }, uSat: { value: 0.8 }, uInt: { value: 0.5 }, uShim: { value: 0.18 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uT,uHue,uA,uFall,uSpokes,uSwirl,uSat,uInt,uShim;
      vec3 hsv(float h,float s,float v){ vec3 k=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return v*mix(vec3(1.0),k,s); }
      void main(){ float r = length(vP.xz)*2.0; float a = pow(clamp(1.0-r,0.0,1.0), uFall) * clamp(1.0-(vP.y+0.5),0.0,1.0);
        float ang = atan(vP.z, vP.x); float sp = 0.6 + 0.4*sin(ang*uSpokes + uT*uSwirl*6.2831 + r*3.0);
        float sh = 1.0 + uShim*sin(uT*9.0 + r*12.0);
        gl_FragColor = vec4(hsv(fract(uHue + ang/6.2831), uSat, 1.0) * a * sp * sh * uInt * uA, 1.0); }` });
  const beam = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uHue: { value: 0 }, uA: { value: 1 }, uPulse: { value: 0 }, uH: { value: 3.6 }, uW: { value: 0.95 }, uSpan: { value: 0.45 }, uSat: { value: 0.55 }, uInt: { value: 0.9 }, uSoft: { value: 0.5 }, uBase: { value: 0.3 } },
    vertexShader: `uniform float uH,uW; varying vec2 vUv; void main(){ vUv = vec2(position.x+0.5, position.y);
      vec4 c = modelViewMatrix * vec4(0.0, position.y*uH, 0.0, 1.0); c.x += position.x*uW; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `varying vec2 vUv; uniform float uT,uHue,uA,uPulse,uSpan,uSat,uInt,uSoft,uBase;
      vec3 hsv(float h,float s,float v){ vec3 k=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return v*mix(vec3(1.0),k,s); }
      void main(){ float e = 1.0 - abs(vUv.x*2.0-1.0); float edge = smoothstep(0.0, uSoft, e); float fade = pow(1.0-vUv.y, 1.4);
        float a = edge * fade * (uBase + (1.0-uBase)*(0.6+0.4*uPulse));
        gl_FragColor = vec4(hsv(fract(uHue + vUv.y*uSpan - uT*0.05), uSat, 1.0) * a * uInt * uA, 1.0); }` });
  return { glow, beam };
}

export class FindsView {
  constructor(scene) { this.scene = scene; this.t = 0; this.pool = new Map(); }
  // metals (chest gold coins / brass / iron, URP Lit Metallic .7-.9) reflect the hall (an env captured once in main)
  setEnv(env) {
    if (!env || !this.chest) return;
    this.chest.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial && m.metalness >= 0.5) { m.envMap = env; m.envMapIntensity = 1; m.needsUpdate = true; } });
  }
  async load() {
    const [gn, rel, ch, pal, cr, dl] = await Promise.all(['gnote', 'relics', 'chest', 'pallet', 'crate', 'delivery'].map(n => loadSlice('./art/' + n + '/')));
    this.src = { gn, rel, ch, pal, cr };
    // chest: body + inside fixed, lid hinged at its node origin
    this.chest = group(ch); this.chest.visible = false; this.scene.add(this.chest);
    // TreasureChest/Model/InnerLight (level0 Light, read with UnityPy: point, sRGB (1, .82, .46), range 4.5, y 0.54), driven
    // up to innerLightPeak 6 while open (x1 in three units, matched to f09). It lights the coins and the lid lining.
    this.innerLight = new THREE.PointLight(new THREE.Color().setRGB(1, 0.82, 0.46, THREE.SRGBColorSpace), 0, 4.5, 2);
    this.innerLight.position.set(0, 0.54, 0); this.chest.add(this.innerLight);
    this.lid = this.chest.children.find(c => /Lid\/Mesh$/.test(c.userData.path));
    this.inside = this.chest.children.find(c => /Inside\/Mesh$/.test(c.userData.path) && c.material.name === 'M_ChestGold');   // coins: inner light while open (PopFx peaks at 6)
    this.beacon = this.chest.children.filter(c => /Beacon\//.test(c.userData.path));
    this.cs = chestShaders();
    for (const b of this.beacon) b.material = /Glow$/.test(b.userData.path) ? this.cs.glow : this.cs.beam;
    const glowMat = (m) => new THREE.MeshBasicMaterial({ map: m.map || null, color: m.color.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    // pallet + beams
    this.pallet = group(pal); this.pallet.visible = false; this.scene.add(this.pallet);
    for (const b of this.pallet.children.filter(c => /Beam\//.test(c.userData.path))) b.material = glowMat(b.material);
    // delivery vents (16): frame + inner static, flap and hose move
    this.vents = new Map();
    for (const m of dl.group.children) {
      const k = /Vents\/(Vent_\d+_\d+)\//.exec(m.userData.path); if (!k) continue;
      const c = m.clone(); c.matrixAutoUpdate = false; c.userData = { ...m.userData, base: m.matrix.clone() }; c.matrix.copy(m.matrix); this.scene.add(c);
      if (!this.vents.has(k[1])) this.vents.set(k[1], { parts: [], pos: null });
      const v = this.vents.get(k[1]); v.parts.push(c);
      if (/\/Frame$/.test(m.userData.path)) v.pos = new THREE.Vector3().setFromMatrixPosition(m.matrix);
    }
    this.ventList = [...this.vents.values()].filter(v => v.pos);
    // relic board niches + teller lamps are passed in by main (dynamic meshes of the hall)
    return this;
  }
  // one Group per world item (loose note / relic / crate)
  itemGroup(it) {
    let g = this.pool.get(it.id);
    if (g) return g;
    if (it.kind === 'note') g = group(this.src.gn);
    else if (it.kind === 'relic') g = group(this.src.rel, p => new RegExp(`/${it.id}/Model`).test(p));
    else g = group(this.src.cr);
    g.userData.kind = it.kind; this.scene.add(g); this.pool.set(it.id, g);
    return g;
  }
  setBoard(niches) { this.niches = niches; }       // [{id, mesh, mat, base color}]
  setLamps(lamps) { this.lamps = lamps; }          // [{i, mesh}]
  update(dt, game, cam) {
    this.t += dt;
    const F = game.finds, live = new Set();
    for (const it of F.items) {
      if (it.state !== 'loose' && it.state !== 'held' && it.state !== 'flying') continue;
      const g = this.itemGroup(it); live.add(it.id); g.visible = true;
      const spin = it.state === 'held' ? 0 : this.t * 0.8 + (it.id.length * 1.7);
      const bob = it.state === 'held' ? 0 : 0.06 * Math.sin(this.t * 2 + it.id.length);
      g.position.set(it.pos[0], it.pos[1] + bob + (it.kind === 'note' ? 0.05 : 0), it.pos[2]);
      g.rotation.set(it.kind === 'note' ? (it.state === 'held' ? -1.1 : -0.25) : 0, it.state === 'held' ? Math.atan2(cam.position.x - it.pos[0], cam.position.z - it.pos[2]) + 0.5 : spin, 0);
      g.scale.setScalar(it.state === 'held' ? (it.kind === 'note' ? 0.55 : it.kind === 'crate' ? 0.6 : 0.7) : it.kind === 'note' ? 1.6 : 1);
    }
    for (const [id, g] of this.pool) if (!live.has(id)) g.visible = false;
    // chest
    const c = F.chest;
    this.chest.visible = !!c && c.state !== 'gone';
    if (this.chest.visible) {
      let s = 1, lidA = 0;
      if (c.state === 'opening') { const t = c.t; s = t < CHEST.squat ? 1 - 0.08 * Math.sin(t / CHEST.squat * Math.PI) : 1; lidA = sm((t - CHEST.squat) / CHEST.lid); }
      else if (c.state === 'open') lidA = 1;
      else if (c.state === 'leaving') { lidA = 1 - sm(c.t / 0.3); s = Math.max(0.001, 1 - sm(c.t / CHEST.leave)); }
      this.chest.position.set(c.x, c.curY, c.z); this.chest.rotation.set(0, -c.yaw * Math.PI / 180, 0); this.chest.scale.setScalar(s);
      if (this.inside && this.inside.material.emissive) { const k = c.state === 'opening' ? lidA : c.state === 'open' ? 1 : c.state === 'leaving' ? 1 - sm(c.t / 0.3) : 0; this.inside.material.emissive.setRGB(0.55 * k, 0.38 * k, 0.06 * k); }
      { const k = c.state === 'opening' ? lidA : c.state === 'open' ? 1 : c.state === 'leaving' ? 1 - sm(c.t / 0.3) : 0; this.innerLight.intensity = 6 * k; }   // x1: x2 blew out the lid lining against f09
      if (this.lid) { const r = new THREE.Matrix4().makeRotationX(108 * Math.PI / 180 * lidA)   /* Unity lidOpenEuler (-108,0,0); the z flip negates X rotations */; this.lid.matrix.copy(this.lid.userData.base).multiply(r); }
      const beam = c.state === 'buried' || c.state === 'ready', hue = (this.t * 0.06) % 1;
      // beacon anchor (TreasureChest.Beacon): (x, max(surfaceY, y + exposed*height) + 0.04, z), light 1 - 0.9*smoothstep(exposed)
      const surf = game.field.heightAt(c.x, c.z), anchor = Math.max(isFinite(surf) ? surf : c.curY, c.y + c.exposed * CHEST.h) + 0.04;
      const dy = (anchor - c.curY - 0.79) / Math.max(0.001, s);
      const ph = this.t % (4 * 0.32 + 1.5), beat = ph < 4 * 0.32 ? Math.max(0, 1 - (ph % 0.32) / 0.2) : 0, light = 1 - 0.9 * sm(c.exposed);
      for (const m of [this.cs.glow, this.cs.beam]) { m.uniforms.uT.value = this.t; m.uniforms.uHue.value = hue; m.uniforms.uA.value = light; }
      this.cs.beam.uniforms.uPulse.value = beat;
      for (const b of this.beacon) { b.visible = beam; b.matrix.makeTranslation(0, dy, 0).multiply(b.userData.base); }
    }
    // events: pallet
    const s = game.vaultEvents.s;
    const pal = s.kind === 2 && s.pos;
    this.pallet.visible = !!pal;
    if (pal) {
      const rise = sm(s.elapsed / 1.2), sink = s.claimedAt >= 0 ? sm((s.elapsed - s.claimedAt - 0.5) / 1.5) : sm((s.elapsed - s.duration) / 1.5);
      const y = s.pos[1] - 1.7 * (1 - rise) - 1.7 * sink;
      this.pallet.position.set(s.pos[0], y, s.pos[2]); this.pallet.rotation.y = this.t * 0.4;
      const warn = s.duration - s.elapsed < 6 && s.claimedAt < 0 ? 0.6 + 0.4 * Math.sin(this.t * 12) : 1;
      for (const b of this.pallet.children) if (/Beam\//.test(b.userData.path)) { b.material.opacity = 0.35 * (0.7 + 0.3 * Math.sin(this.t * 0.8 * Math.PI * 2)) * warn * (1 - sink); b.visible = s.claimedAt < 0; }
    }
    // delivery: flaps open and hoses slide down while it pumps
    const dlv = s.kind === 1, open = dlv ? sm((s.elapsed - 1.6) / 0.5) : 0, hose = dlv ? sm((s.elapsed - 2.1) / 0.8) * (s.elapsed > s.duration - 2 ? sm((s.duration - s.elapsed) / 0.8) : 1) : 0;
    for (const v of this.ventList) for (const p of v.parts) {
      if (/\/Flap\//.test(p.userData.path)) { const piv = new THREE.Vector3(v.pos.x - 0.65, v.pos.y, v.pos.z); const r = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z).multiply(new THREE.Matrix4().makeRotationZ(-88 * Math.PI / 180 * open)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z)); p.matrix.copy(r).multiply(p.userData.base); }
      else if (/\/Hose\//.test(p.userData.path)) p.matrix.copy(new THREE.Matrix4().makeTranslation(0, -1.6 * hose, 0)).multiply(p.userData.base);
    }
    // teller lamps: one lamp per prize paid
    if (this.lamps) for (const l of this.lamps) { const on = l.i < F.fed, blink = l.i === F.fed ? 0.5 + 0.5 * Math.sin(this.t * 4) : 0; l.mesh.material.color.setRGB(on ? 1.6 : 0.35 + 0.5 * blink, on ? 1.25 : 0.3 + 0.4 * blink, on ? 0.45 : 0.25); }
    if (this.niches) for (const n of this.niches) { const found = game.econ.relics.has(n.id); n.mesh.material.color.copy(found ? n.color : new THREE.Color(0.05, 0.05, 0.07)); }
  }
  ventPoints() { return this.ventList.map(v => [v.pos.x, v.pos.y - 1.6, v.pos.z]); }
}
