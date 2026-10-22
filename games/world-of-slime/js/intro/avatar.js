// Avatar theo diện mạo đã chọn (CustomizeUI): ghép bộ phận player/ như SM.Common.Character.CharacterBuilder
// (EXPORT_PLAYER.md, cùng cách ghép với js/actors/actors.js Player.create) nhưng chọn được Hair / Face / Eyebrow, màu da,
// màu tóc, màu mắt (lens) và phụ kiện mặt (AccDecal). Dữ liệu màu là CustomizeDataSet gốc (player/index.json customize).
//
// Khác Player.create: mọi GLB bộ phận được SkeletonUtils.clone trước khi ghép, nên dựng lại bao nhiêu lần cũng được
// (gương xem trước dựng lại mỗi lần đổi tóc / mặt / giới tính) mà không làm rỗng gltf trong bộ đệm của assets.js.
//
// look = { gender: 'man'|'woman', skin: 1..4, hair: 0..9, hairColor: 0..9, face: 0..9, lens: 0..9, acc: 0..5 }
//   skin  -> _SkinNum (ô 4x4 của PC_Face_Skin_Albedo; 4 ô hàng đầu = 4 thumb Customize_Thumb_Skin_01..04)
//   hair  -> <G>_Hair00{hair+1} (Hair000 rỗng; 10 thumb Customize_Thumb_Hair_<M|F>_01..10)
//   face  -> decal + mask player/face/<G>_Face00{face}_Decal|Mask + lông mày <G>_Eyebrow00{face}_L/R  [ĐỀ XUẤT] ghép mặt i với lông mày i
//   lens  -> customize.lensColors[lens], nhân vào vùng tròng mắt của decal mask (cyan/magenta)  [ĐỀ XUẤT] cách nhân
//   acc   -> customize.faceOffsetVector4s[acc] (ST trên atlas 4x4 PC_Face_Decal = AccDecalTex), accDecalMultiplyFlags[acc]
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, loadJSON, clipOf, assetUrl } from '../assets.js?v=20261022e';
import { applyUnitMaterials } from '../actors/toon.js?v=20261022e';
import { Player } from '../actors/actors.js?v=20261022e';

// Mặc định của màn tạo nhân vật [ĐO TRONG ẢNH] g6/cust1..6.png: ô đầu mỗi tab được chọn, riêng Hair Color là ô 10 (trắng tím)
export const DEFAULT_LOOK = { gender: 'man', skin: 1, hair: 0, hairColor: 9, face: 0, lens: 0, acc: 0 };
export const COUNTS = { skin: 4, hair: 10, hairColor: 10, face: 10, lens: 10, acc: 6 };

export function normLook(l) {
  const o = { ...DEFAULT_LOOK, ...(l || {}) };
  o.gender = o.gender === 'woman' ? 'woman' : 'man';
  for (const k of ['hair', 'hairColor', 'face', 'lens', 'acc']) o[k] = Math.max(0, Math.min(COUNTS[k] - 1, o[k] | 0));
  o.skin = Math.max(1, Math.min(4, o.skin | 0));
  return o;
}
export function randomLook() {
  const r = n => Math.floor(Math.random() * n);
  return normLook({ gender: Math.random() < 0.5 ? 'man' : 'woman', skin: 1 + r(4), hair: r(10), hairColor: r(10), face: r(10), lens: r(10), acc: r(6) });
}

const texLoader = new THREE.TextureLoader(); texLoader.setCrossOrigin('anonymous');
const texCache = new Map();
// cùng quy ước với texture trong glTF: flipY false, không tự giải sRGB (shader tự pow 2.2)
function rawTex(path) {
  if (texCache.has(path)) return texCache.get(path);
  const t = texLoader.load(assetUrl(path), undefined, undefined, () => (window.__wosErrors = window.__wosErrors || []).push('texture load failed: ' + path));
  t.flipY = false; t.colorSpace = THREE.NoColorSpace;
  texCache.set(path, t); return t;
}

// Thêm lens + AccDecal vào shader toon (toon.js). Vá chuỗi trước lần biên dịch đầu.
function patchFace(mat) {
  const u = mat.uniforms;
  Object.assign(u, {
    tLensMask: { value: null }, hasLens: { value: 0 }, lensCol: { value: new THREE.Vector4(1, 1, 1, 1) },
    tAcc: { value: null }, hasAcc: { value: 0 }, accMul: { value: 0 }, accST: { value: new THREE.Vector4(0.25, 0.25, 0, 0.75) },
  });
  let fs = mat.fragmentShader;
  fs = fs.replace('uniform vec3 lightDir;', 'uniform vec3 lightDir;\nuniform sampler2D tLensMask, tAcc; uniform float hasLens, hasAcc, accMul; uniform vec4 lensCol, accST;');
  fs = fs.replace('base *= tint.rgb;', `base *= tint.rgb;
  if (hasAcc > 0.5) {
    vec2 au = vec2(fract(vUv.x) * accST.x + accST.z, 1.0 - ((1.0 - fract(vUv.y)) * accST.y + accST.w));
    vec4 ac = texture2D(tAcc, au);
    base = accMul > 0.5 ? mix(base, base * toLinear(ac.rgb), ac.a) : mix(base, toLinear(ac.rgb), ac.a);
  }`);
  fs = fs.replace('base = mix(base, toLinear(d.rgb), d.a);', `vec3 dcol = d.rgb;
    if (hasLens > 0.5) { vec4 mk = texture2D(tLensMask, decalOnUv1 > 0.5 ? cell(decalView) : vUv1); float iris = mk.b * (1.0 - min(mk.r, mk.g));
      dcol = mix(dcol, clamp(dcol * lensCol.rgb * 1.9, 0.0, 1.0), iris); }
    base = mix(base, toLinear(dcol), d.a);`);
  mat.fragmentShader = fs; mat.needsUpdate = true;
  if (!/hasLens/.test(fs) || !/dcol/.test(fs)) (window.__wosErrors = window.__wosErrors || []).push('avatar: face shader patch missed');
}

const lin = c => new THREE.Vector4(...new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear().toArray(), 1);

// Dựng avatar. Trả về Player (play/update/mixer/decals như Player.create) kèm `look` và `setLook()` đổi màu không dựng lại.
export async function buildAvatar(lookIn) {
  const look = normLook(lookIn), G = look.gender, pre = G === 'man' ? 'PC_Man_' : 'PC_Woman_';
  const pidx = await loadJSON('player/index.json');
  const cz = pidx.customize;
  const parts = { ...pidx.defaults[G] };
  parts.Hair = pre + 'Hair' + String(look.hair + 1).padStart(3, '0');
  parts.Eyebrow_L = pre + 'Eyebrow' + String(look.face).padStart(3, '0') + '_L';
  parts.Eyebrow_R = pre + 'Eyebrow' + String(look.face).padStart(3, '0') + '_R';
  const p = new Player();
  const rigG = await loadGLB(pidx.rigs[G].glb);
  const rig = SkeletonUtils.clone(rigG.scene);
  const byName = {}; rig.traverse(o => { byName[o.name] = o; });
  const ATT = pidx.attach;
  const R = { hair: [], skin: [], face: [] };      // uniform để đổi màu tại chỗ
  const loaded = await Promise.all(Object.entries(parts).map(async ([slot, id]) => {
    const part = pidx.parts.find(q => q.id === id);
    if (!part || !part.glb) return null;
    return [slot, part, await loadGLB(part.glb)];
  }));
  for (const it of loaded) {
    if (!it) continue;
    const [slot, , g] = it;
    const sc = SkeletonUtils.clone(g.scene);
    const srcName = new Map(); sc.traverse(o => { if (o.isMesh) srcName.set(o, o.material.name || ''); });
    p.decals.push(...await applyUnitMaterials(g, sc, { skinNum: look.skin, hairColor: cz.hairColors[look.hairColor] }));
    sc.traverse(o => {
      if (!o.isMesh || !o.material.uniforms) return;
      const n = srcName.get(o) || '', u = o.material.uniforms;
      if (/Hair/.test(n)) R.hair.push(u);
      if (u.hasSkin.value) R.skin.push(u);
      if (slot === 'Face' && !u.isOutline.value) { patchFace(o.material); R.face.push(u); }
    });
    const proot = sc.children[0];
    const all = []; proot.traverse(o => all.push(o));
    const map = new Map();
    for (const o of all) if (o !== proot && !o.isMesh && byName[o.name]) map.set(o, byName[o.name]);
    const att = ATT[slot] ? byName[THREE.PropertyBinding.sanitizeNodeName(ATT[slot])] : null;
    for (const o of all) {
      if (o === proot || map.has(o) || o.isMesh) continue;
      const par = o.parent;
      if (map.has(par)) map.get(par).add(o);
      else if (par === proot) (att || rig).add(o);
    }
    for (const o of all) {
      if (!o.isMesh) continue;
      if (o.isSkinnedMesh) {
        const bones = o.skeleton.bones.map(b => map.get(b) || b);
        const sk = new THREE.Skeleton(bones, o.skeleton.boneInverses);
        rig.add(o); o.bind(sk, o.bindMatrix);
        o.children.forEach(h => { if (h.isSkinnedMesh) h.bind(sk, h.bindMatrix); });
      } else {
        const par = o.parent; const tgt = par === proot ? (att || rig) : (map.get(par) || par);
        if (tgt !== par) tgt.add(o);
      }
    }
    [...proot.children].forEach(h => { if (h.isSkinnedMesh) rig.add(h); });
  }
  p.object = new THREE.Group(); p.object.name = 'Player_' + G; p.object.add(rig);
  p.mixer = new THREE.AnimationMixer(rig);
  const ag = await loadGLB(pidx.anim[G].glb);
  const stateClips = n => (pidx.rigs[G].states.find(s => s.name === n) || {}).clips;
  for (const k of ['Idle', 'Walk', 'Run', 'SlimeAttack', 'Hit']) { const c = stateClips(k); if (c) p.addClip(k, clipOf(ag, c[0])); }
  if (p.actions.Run && !p.actions.Run.ex.events) p.events.Run = [{ time: 0.0667, fn: 'PostWwiseFootstepEventCached' }, { time: 0.3333, fn: 'PostWwiseFootstepEventCached' }];
  p.footstepEvent = 'Footstep_default';
  p.look = look;
  // đổi skin / màu tóc / mắt / phụ kiện không cần dựng lại
  p.setLook = l => {
    Object.assign(p.look, normLook({ ...p.look, ...l }));
    const L = p.look;
    for (const u of R.skin) u.skinCell.value.set((L.skin - 1) % 4, Math.floor((L.skin - 1) / 4));
    for (const u of R.hair) u.tint.value.copy(lin(cz.hairColors[L.hairColor]));
    const faces = cz[G === 'man' ? 'manFaceDecalTextures' : 'womanFaceDecalTextures'], masks = cz[G === 'man' ? 'manFaceDecalMaskTextures' : 'womanFaceDecalMaskTextures'];
    for (const u of R.face) {
      if (faces[L.face]) { u.tDecal.value = rawTex(faces[L.face].file); u.hasDecal.value = 1; }
      if (masks[L.face]) { u.tLensMask.value = rawTex(masks[L.face].file); u.hasLens.value = 1; }
      u.lensCol.value.set(...cz.lensColors[L.lens].slice(0, 3), 1);
      const st = cz.faceOffsetVector4s[L.acc];
      if (st && u.tAcc.value) { u.accST.value.set(...st); u.hasAcc.value = 1; u.accMul.value = cz.accDecalMultiplyFlags[L.acc] ? 1 : 0; }
    }
  };
  // AccDecalTex nằm trong GLB mặt (vai trò AccDecalTex, ảnh PC_Face_Decal)
  for (const it of loaded) {
    if (!it || it[0] !== 'Face') continue;
    const g = it[2], m = g.parser.json.materials.find(x => x.extras && x.extras.tex && x.extras.tex.AccDecalTex != null);
    if (m) {
      const t = await g.parser.getDependency('texture', m.extras.tex.AccDecalTex); t.colorSpace = THREE.NoColorSpace;
      for (const u of R.face) u.tAcc.value = t;
    }
  }
  p.setLook({});
  p.play('Idle', 0);
  return p;
}
