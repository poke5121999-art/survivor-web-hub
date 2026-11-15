// Chibi roster (lib/roster, lib/chibi from D:\lf-humanoid) -> voxel characters.
// voxChibi(def, n) voxelizes the character's bind-pose mesh into n voxels of height, colouring each visible voxel with a
// CPU port of the chibi material (lib/chibi/mat.js FMAIN: cloth folds, check / camo / floral prints, grime, blood
// spatter, ground darkening, saturation and the soft cap on whites), evaluated once at the voxel centre.
// VoxActor plays the roster's own HumanAnim (idle / ready / walk / run / attack / hit / death, zombie shamble) on a
// mesh-less Figure and copies its bone matrices into the voxel material; a pet dog gets the same treatment with DogAnim.
import { THREE } from '../lib/lf-host.js';
import { Figure } from '../lib/lf/kit.js';
import { HumanAnim } from '../lib/lf/anim.js';
import { attachGrip } from '../lib/arm-ik.js';
import { buildDog, DogAnim } from '../lib/chibi/dog.js';
import { voxelize, meshModel, packFigureBones } from './voxelizer.js';
import { makeVoxMaterial, makeVoxDepth } from './material.js';

// ---------- CPU port of the chibi surface colour ----------
const fr = (x) => x - Math.floor(x);
function ch13(x, y, z) { x = fr(x * 0.1031); y = fr(y * 0.1031); z = fr(z * 0.1031); const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32); x += d; y += d; z += d; return fr((x + y) * z); }
function cn3(px, py, pz) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz); let fx = px - ix, fy = py - iy, fz = pz - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(ch13(ix, iy, iz), ch13(ix + 1, iy, iz), fx), L(ch13(ix, iy + 1, iz), ch13(ix + 1, iy + 1, iz), fx), fy),
    L(L(ch13(ix, iy, iz + 1), ch13(ix + 1, iy, iz + 1), fx), L(ch13(ix, iy + 1, iz + 1), ch13(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
const cfb = (x, y, z) => 0.5 * cn3(x, y, z) + 0.28 * cn3(x * 2.1 + 7.1, y * 2.1 + 7.1, z * 2.1 + 7.1) + 0.14 * cn3(x * 4.3 + 3.3, y * 4.3 + 3.3, z * 4.3 + 3.3);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// d = Figure data (P, C, M = [rough, metal, type, dirt]); returns shade(v, x, y, z) for voxelize()
export function chibiShade(d, o = {}) {
  const SAT = o.sat === undefined ? 0.86 : o.sat;
  return (v, x, y, z) => {
    let r = d.C[v * 3], g = d.C[v * 3 + 1], b = d.C[v * 3 + 2]; const ty = d.M[v * 4 + 2], w = d.M[v * 4 + 3];
    let emis = 0, dirtK = 1;
    const soft = cn3(x * 5, y * 5, z * 5);
    const mul = (k) => { r *= k; g *= k; b *= k; };
    const fold = cn3(x * 24, y * 6, z * 24) * 0.6 + cn3(x * 9 + 4, y * 3 + 4, z * 9 + 4) * 0.4;
    const clothy = (ty > 0.5 && ty < 3.5) || (ty > 8.5 && ty < 9.5) || (ty > 10.5 && ty < 11.5) || ty > 14.5;
    // folds read as noise at voxel scale: keep half of their swing
    if (clothy) mul((0.88 + 0.16 * fold) * 0.82);
    if (ty < 0.5) mul(0.96 + 0.08 * soft);
    else if (ty < 1.5) mul(0.95 + 0.08 * soft);
    else if (ty < 2.5) { // check: same bands as the shader, sampled once per voxel
      const u = (x * 0.8 + z * 0.6) * 13, vv = y * 13, A = ss(0.46, 0.54, fr(u)), B = ss(0.46, 0.54, fr(vv));
      const k = mix(1.08, 0.42, A * B) * mix(1, 0.74, A + B - 2 * A * B); mul(k);
    } else if (ty < 3.5) { // camo
      const n1 = cfb(x * 5.5, y * 4, z * 5.5), n2 = cfb(x * 7 + 9, y * 5 + 9, z * 7 + 9), n3 = cfb(x * 9 + 21, y * 9 + 21, z * 9 + 21);
      let t = ss(0.52, 0.56, n1); r = mix(r, r * 1.45, t); g = mix(g, g * 1.38, t); b = mix(b, b * 1.15, t);
      t = ss(0.55, 0.59, n2); r = mix(r, r * 0.45, t); g = mix(g, g * 0.5, t); b = mix(b, b * 0.38, t);
      t = ss(0.62, 0.66, n3); r = mix(r, r * 0.3, t); g = mix(g, g * 0.25, t); b = mix(b, b * 0.2, t);
    } else if (ty < 4.5) mul(0.9 + 0.15 * soft);
    else if (ty < 5.5) mul(0.97 + 0.05 * soft);
    else if (ty < 6.5) mul(0.92 + 0.1 * soft);
    else if (ty < 7.5) mul(0.86 + 0.2 * cn3(x * 30, y * 8, z * 30)); // hair: broad streaks only
    else if (ty < 8.5) dirtK = 0;
    else if (ty < 9.5) mul(0.92 + 0.12 * cn3(x * 40, y * 12, z * 40));
    else if (ty < 10.5) { emis = Math.max(0.6, w); dirtK = 0; }
    else if (ty < 11.5) { // floral
      const f1 = cn3(x * 34, y * 34, z * 34), f2 = cn3(x * 34 + 5.2, y * 34 + 1.3, z * 34 + 7.7);
      let t = ss(0.7, 0.74, f1); r = mix(r, 0.95, t); g = mix(g, 0.86, t); b = mix(b, 0.62, t);
      t = ss(0.72, 0.76, f2) * 0.8; r = mix(r, r * 1.9 + 0.05, t); g = mix(g, g * 1.9 + 0.05, t); b = mix(b, b * 1.9 + 0.05, t);
    } else if (ty < 12.5) mul(0.9 + 0.14 * soft);
    else if (ty < 13.5) mul(0.8 + 0.3 * cn3(x * 8, y * 40, z * 8));
    else if (ty < 14.5) dirtK = 0;
    if (dirtK > 0 && w > 0.001 && ty < 9.5 && ty > 0.5) { // dirt patches
      const bl = ss(0.58, 0.66, cfb(x * 4.5 + 11, y * 3.2 + 11, z * 4.5 + 11)) * Math.min(1, w * 2.4) * 0.8;
      r = mix(r, r * 0.46 + 0.025, bl); g = mix(g, g * 0.4 + 0.02, bl); b = mix(b, b * 0.34 + 0.015, bl);
    }
    if (dirtK > 0 && w > 0.001 && ty < 9.5) { // blood / dirt spatter, soaked stains, grime from the ground
      const s = cn3(x * 48, y * 48, z * 48) * 0.62 + cn3(x * 13 + 3, y * 13 + 3, z * 13 + 3) * 0.38, k = w * (1 + 0.6 * (1 - ss(0, 0.7, y)));
      const sp = ss(1 - 0.16 * k, 1 - 0.16 * k + 0.035, s) * 0.7; // fewer specks: one speck is a whole cube here r = mix(r, 0.16, sp); g = mix(g, 0.012, sp); b = mix(b, 0.01, sp);
      const sm = ss(0.6, 0.67, cfb(x * 5 + 31, y * 3.5 + 31, z * 5 + 31)) * ss(0.28, 0.6, w) * 0.78;
      r = mix(r, 0.2 + r * 0.08, sm); g = mix(g, 0.018 + g * 0.08, sm); b = mix(b, 0.012 + b * 0.08, sm);
      mul(1 - 0.3 * w * (1 - ss(0, 0.6, y)));
      mul(1 - 0.22 * ss(0.45, 0.75, cfb(x * 3 + 17, y * 7 + 17, z * 3 + 17)) * w);
    }
    if (!emis) {
      mul(mix(0.6, 1, ss(0, 1.45, y)));
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = Math.max(0, mix(l, r, SAT)); g = Math.max(0, mix(l, g, SAT)); b = Math.max(0, mix(l, b, SAT));
      if (l > 0.38) mul((0.38 + (l - 0.38) * 0.45) / l);
    }
    return [r, g, b, emis];
  };
}

// which samples should win a voxel they share: pupils / irises, then eye whites and lenses, glowing bits, mouths, brows
export function chibiPriority(d) {
  return (v) => {
    const ty = d.M[v * 4 + 2], l = 0.2126 * d.C[v * 3] + 0.7152 * d.C[v * 3 + 1] + 0.0722 * d.C[v * 3 + 2];
    if (ty === 14) return l < 0.12 ? 1 : 0.55;      // S_EYE
    if (ty === 10) return 0.9;                      // S_GLOW (zombie eyes, wounds, lamps)
    if (ty === 8) return 0.5;                       // S_GLASS (goggles, visors)
    if (ty === 0 && l < 0.07) return 0.45;          // dark skin-typed bits: mouth, lip shadow
    return 0;
  };
}

// ---------- faces: eyes, brows and mouth are smaller than a voxel, so they are painted as decals ----------
// The smooth face (lib/chibi/body.js head()) puts pupils at x = +-0.066, the brow 0.062 above the eye and the mouth
// ~0.105 below it, all scaled by the head factor. The pupils are found in the mesh (exact pupil colour on the head
// bone); the samples of the small face pieces are told not to colour voxels, and the decals paint one pupil per side
// (plus a white and a longer brow when the lattice is fine enough), the brows and the mouth, on skin voxels only.
const near3 = (C, v, c) => Math.abs(C[v * 3] - c[0]) < 0.004 && Math.abs(C[v * 3 + 1] - c[1]) < 0.004 && Math.abs(C[v * 3 + 2] - c[2]) < 0.004;
const PUPIL = [0.008, 0.006, 0.005], LASH = [0.04, 0.025, 0.02], NEUT = [0.04, 0.03, 0.025], MOUTH = [0.24, 0.07, 0.06];
export function chibiFace(def, d, rig, size) {
  const sp = def.spec || {}, f = sp.face || {}, hk = (sp.body && sp.body.head) || 1, head = rig.names.head;
  if (sp.zombie) return {}; // zombie faces: big bulging eyes and glowing irises survive on their own (priority)
  const onHead = (v) => d.BA[v] === head && (d.W[v] === 0 || d.BB[v] === head);
  const brow = f.brow || NEUT, mouth = f.mouth || MOUTH;
  // pupil centroids per side
  const acc = { 1: [0, 0, 0, 0], '-1': [0, 0, 0, 0] };
  for (let v = 0; v < d.BA.length; v++) if (d.M[v * 4 + 2] === 14 && onHead(v) && near3(d.C, v, PUPIL)) { const a = acc[d.P[v * 3] > 0 ? 1 : -1]; a[0] += d.P[v * 3]; a[1] += d.P[v * 3 + 1]; a[2] += d.P[v * 3 + 2]; a[3]++; }
  if (!acc[1][3] || !acc[-1][3]) return {};
  const eye = (s) => { const a = acc[s]; return [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; };
  const L = eye(1), Rr = eye(-1), ey = (L[1] + Rr[1]) / 2, ez = Math.max(L[2], Rr[2]);
  const isFeature = (v) => {
    if (!onHead(v)) return false; const ty = d.M[v * 4 + 2], x = d.P[v * 3], y = d.P[v * 3 + 1], z = d.P[v * 3 + 2];
    if (z < ez - 0.12 * hk || Math.abs(x) > 0.13 * hk) return false;
    if (ty === 14) return true;                                         // eye whites, irises, pupils
    if (ty === 10) return near3(d.C, v, [1, 1, 1]);                     // eye highlight
    if (ty === 7) return near3(d.C, v, LASH) || (near3(d.C, v, brow) && y > ey + 0.02 * hk && y < ey + 0.1 * hk);
    if (ty === 0) return near3(d.C, v, mouth) || (sp.face && sp.face.mouthShape === 'grin' && near3(d.C, v, [0.92, 0.9, 0.84]));
    return false;
  };
  const fine = size < 0.056 * hk, up = Math.max(1, Math.round(0.064 * hk / size)), down = Math.max(2, Math.round(0.106 * hk / size));
  const onSkin = (v) => v < 0 || d.M[v * 4 + 2] === 0 || isFeature(v);
  const dark = [0.022, 0.014, 0.01], white = [0.56, 0.54, 0.5], bc = brow.map((c) => c * 0.85), mc = mouth.map((c) => c * 0.7);
  const decals = [];
  for (const s of [1, -1]) {
    const e = s > 0 ? L : Rr;
    decals.push({ bone: head, p: e, col: dark, cells: [[0, 0]], onlyIf: onSkin });
    if (fine) decals.push({ bone: head, p: e, col: white, cells: [[s, 0]], onlyIf: onSkin });
    decals.push({ bone: head, p: e, col: bc, cells: fine ? [[0, up], [s, up]] : [[0, up]], onlyIf: onSkin });
  }
  const mw = size < 0.04 * hk ? [[-1, -down], [0, -down], [1, -down]] : [[0, -down]];
  decals.push({ bone: head, p: [0, ey, ez], col: mc, cells: mw, onlyIf: onSkin });
  return { ignore: isFeature, decals };
}

// ---------- one character -> voxel geometry (cached per def and density) ----------
const CACHE = new Map();
export const HEAD_K = 0.6; // the head part is voxelized 1.67x finer than the body: faces read at grid size
function figHeight(d) { let h = 0; for (let i = 1; i < d.P.length; i += 3) if (d.P[i] > h) h = d.P[i]; return h; }
export function voxFigureData(d, rig, n, o = {}) {
  const H = o.height || figHeight(d), size = H / n, face = o.def ? chibiFace(o.def, d, rig, size * (o.headK || 1)) : {};
  const model = voxelize({ P: d.P, N: d.N, I: d.I, BA: d.BA, BB: d.BB, W: d.W, nBones: rig.n },
    { size, phase: [0.5, 0, 0], boneScale: o.headK && rig.names.head !== undefined ? { [rig.names.head]: o.headK } : null, shade: chibiShade(d, o), priority: chibiPriority(d), ignore: face.ignore, decals: face.decals });
  const geo = meshModel(model);
  return { geo, size, height: H, vox: model.vox };
}
export function voxChibi(def, n) {
  const key = def.id + '@' + n; let v = CACHE.get(key); if (v) return v;
  const p = def.proto || (def.proto = def.build());
  v = voxFigureData(p.d, p.rig, n, { def, headK: HEAD_K });
  if (def.pet && def.pet.kind === 'dog') { // the dog at the same voxel size in world units (its mesh is scaled by size)
    const dog = def.dogProto || (def.dogProto = buildDog(def.pet));
    const ds = dog.mesh.scale.x, dh = figHeight(dog.d);
    v.dog = voxFigureData(dog.d, dog.rig, Math.max(6, Math.round(dh * ds / (v.size * def.scale))), { sat: 0.9 });
    v.dog.rig = dog.rig; v.dog.k = ds;
  }
  CACHE.set(key, v);
  return v;
}
export const clearVoxCache = () => CACHE.clear();

// a Figure with no vertices: HumanAnim / DogAnim drive its bones, skin() costs nothing
const EMPTY = { P: new Float32Array(0), N: new Float32Array(0), C: new Float32Array(0), UV: new Float32Array(0), M: new Float32Array(0), BA: new Uint8Array(0), BB: new Uint8Array(0), W: new Float32Array(0), I: new Uint16Array(0) };
function rigFigure(rig, u, height) {
  const f = new Figure({ d: EMPTY }, rig); f.mat.dispose(); f.u = u; f.height = height; u.uDisH.value = height; return f;
}

// ---------- the animated voxel actor (same modes and timing as lib/chibi/stage.js Actor) ----------
export class VoxActor {
  constructor(def, n, o = {}) {
    this.def = def; this.n = n; const v = this.v = voxChibi(def, n), p = def.proto;
    const mat = this.mat = makeVoxMaterial({ size: v.size, maxBones: 32 });
    const f = this.fig = rigFigure(p.rig, mat.userData.u, v.height); f.P = p.P;
    if (def.grip) attachGrip(f, Object.assign({ w: 1 }, def.grip));
    this.an = new HumanAnim(f, def.style); this.an.t = o.t0 || Math.random() * 10; this.an.ph = 0;
    this.sc = def.scale;
    this.mesh = new THREE.Mesh(v.geo, mat); this.mesh.scale.setScalar(this.sc);
    this.mesh.customDepthMaterial = makeVoxDepth(mat);
    this.root = new THREE.Group(); this.root.add(this.mesh);
    if (v.dog && o.pet !== false) {
      const dm = this.dogMat = makeVoxMaterial({ size: v.dog.size, maxBones: 32 });
      const df = rigFigure(v.dog.rig, dm.userData.u, v.dog.height);
      this.dogAn = new DogAnim(df); this.dogAn.sit = !!def.pet.sit; this.dogFig = df;
      const dmesh = this.dogMesh = new THREE.Mesh(v.dog.geo, dm); dmesh.scale.setScalar(v.dog.k); dmesh.customDepthMaterial = makeVoxDepth(dm);
      dmesh.position.set(def.pet.x || 0.55, 0, def.pet.z || 0.15); dmesh.rotation.y = def.pet.yaw || 0.3; this.root.add(dmesh);
    }
    this.mode = 'idle'; this.t = 0; this.shadows(o.shadows !== false);
  }
  shadows(on) { this.mesh.castShadow = on; if (this.dogMesh) this.dogMesh.castShadow = on; }
  tris() { return this.v.geo.userData.tris + (this.v.dog && this.dogMesh ? this.v.dog.geo.userData.tris : 0); }
  vox() { return this.v.vox + (this.v.dog && this.dogMesh ? this.v.dog.vox : 0); }
  draws() { return this.dogMesh ? 2 : 1; }
  setMode(m) {
    const an = this.an; this.mode = m; this.t = 0; an.act = null; an.stag = 0; an.down = false; this.fig.u.uDissolve.value = 0;
    if (this.fig.grip) this.fig.grip.off = false; this.hitT = 0; this.pause = 0;
    if (m !== 'walk' && m !== 'run') { an.pin = null; an.lgL = an.lgR = null; }
  }
  update(dt, speed = 0) {
    const an = this.an, m = this.mode, f = this.fig, w = new THREE.Vector3(); this.t += dt;
    this.root.getWorldPosition(w); const yaw = this.root.rotation.y + (this.root.parent && this.root.parent.rotation ? this.root.parent.rotation.y : 0);
    an.xf = { x: w.x, z: w.z, f: yaw, s: this.sc }; an.ikOn = (m === 'walk' || m === 'run') && !this.def.noWalk && !this.inPlace; // in the grid they walk on the spot
    if (m === 'walk' || m === 'run') an.update(dt, speed / this.sc, false);
    else if (m === 'attack') { if (!an.act && this.pause <= 0) { an.play('attack', 0.5, 0.7); this.pause = 0.6; } if (!an.act) this.pause -= dt; an.update(dt, 0, true); }
    else if (m === 'hit') { this.hitT -= dt; if (this.hitT <= 0) { an.stag = Math.min(1.15, (an.stag || 0) + 1); an.stagDir = an.stagDir > 0 ? -1 : 1; this.hitT = 1.25; f.u.uFlash.value.setRGB(0.35, 0.25, 0.2); } f.u.uFlash.value.multiplyScalar(Math.exp(-dt * 9)); an.update(dt, 0, true); }
    else if (m === 'death') {
      an.down = true; if (f.grip) f.grip.off = true; an.update(dt, 0, false);
      f.u.uDissolve.value = Math.min(1, Math.max(0, (this.t - 1.2) / 1.6));
      if (this.t > 3.6) this.setMode('death');
    } else an.update(dt, 0, m === 'ready');
    packFigureBones(f.R, f.O, f.nb, this.mat.userData.u.uB.value);
    if (this.dogAn) { this.dogAn.update(dt, m === 'walk' || m === 'run' ? speed : 0); packFigureBones(this.dogFig.R, this.dogFig.O, this.dogFig.nb, this.dogMat.userData.u.uB.value); }
  }
  dispose() { this.mat.dispose(); if (this.dogMat) this.dogMat.dispose(); }
}
