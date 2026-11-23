// The beast builder (SCOPE section 6): every beast form is made from code on one shared kit (kit.js), a body plan per
// family (families.js) and one file of form declarations per beast (forms/*.js).
//   buildBeast({ id, form, branch }, opts) -> Beast
//   Beast = { root: THREE.Group, height, key, update(state, dt), setPose(name), setTint(o), muzzle, drawCalls, dispose() }
//   state = { anim: 'idle'|'run'|'attack'|'cast'|'ult'|'hit'|'stun'|'die'|'evolve', animT, move, speed, air, face, turn }
//   opts = { lod: 'battle' (<= 4 draws, default) | 'portrait', color (for beasts without a drawn look), shadow }
// A beast faces +z and stands on y = 0; `height` is its standing height in metres.
import { Kit } from './kit.js?v=20261122a';
import { createRig } from './rig.js?v=20261122a';
import * as FAM from './families.js?v=20261122a';
import TEGIAP from './forms/tegiap.js?v=20261122a';
import NHIM from './forms/nhim.js?v=20261122a';
import LOC from './forms/loc.js?v=20261122a';
import CHON from './forms/chon.js?v=20261122a';

const THREE = window.THREE;

export const FORMS = { ...TEGIAP, ...NHIM, ...LOC, ...CHON };
// the human heroes the beasts replace (SCOPE section 3), for saves and sims that still carry the old ids
export const LEGACY = { thep: 'tegiap', mua: 'nhim', yta: 'loc', gio: 'chon', phao: 'ech', bong: 'cu', bang: 'duoi', hoa: 'kyda', doc: 'oc', ky: 'haily', sam: 'bosat', soi: 'bao', nhen: 'nhen' };
export const FAMILY = { tegiap: 'quad', nhim: 'quad', loc: 'quad', chon: 'quad', ech: 'amphib', cu: 'bird', duoi: 'fish', kyda: 'reptile', oc: 'mollusk', haily: 'quad', bosat: 'insect', bao: 'quad', nhen: 'insect', muc: 'mollusk' };
const GENERIC_MOVE = { quad: 'walk', bird: 'hop', reptile: 'slither', insect: 'walk', fish: 'swimAir', amphib: 'hop', mollusk: 'slither' };

export const formKey = (id, form = 1, branch = null) => `${id}.${form}${form === 3 && branch ? branch : ''}`;
export const beastId = (id) => LEGACY[id] || id;
export const hasLook = (key) => !!FORMS[key];

function genericForm(id, family, color) {
  return {
    height: family === 'fish' || family === 'bird' ? 0.9 : 0.95, move: GENERIC_MOVE[family] || 'walk', attack: 'bite', generic: true,
    build(K) {
      const P = FAM.palette(color);
      if (family === 'quad') { const g = FAM.quad(K, { pal: P, tail: { len: 0.4, r: 0.06 } }); return { legLen: g.leg }; }
      return (FAM[family] || FAM.quad)(K, P) || { legLen: 0.3 };
    },
  };
}

export function buildBeast(spec, opts = {}) {
  const id = beastId(spec.id); const form = spec.form || 1; const branch = form === 3 ? (spec.branch || null) : null;
  const key = formKey(id, form, branch);
  const family = FAMILY[id] || spec.family || 'quad';
  const F = FORMS[key] || (form === 3 && FORMS[formKey(id, 3, 'a')]) || genericForm(id, family, opts.color ?? spec.color ?? 0xc0a070);
  const lod = opts.lod || 'battle';
  const K = new Kit(lod);
  const meta = F.build(K) || {};
  const B = K.build({ ghostOpacity: F.ghostOpacity, self: F.self });
  // fit the rest pose to the form's standing height
  let top = 0; let bot = Infinity;
  for (const m of Object.values(B.meshes)) { const p = m.geometry.attributes.position; for (let i = 1; i < p.array.length; i += 3) { if (p.array[i] > top) top = p.array[i]; if (p.array[i] < bot) bot = p.array[i]; } }
  // opts.size: the battle draws beasts larger than their nominal height so a chibi reads next to a 1.8 m zombie
  const H = F.height * (opts.size || 1);
  const scale = H / Math.max(0.1, top);
  B.root.scale.setScalar(scale);
  B.U.uOutline.value = (lod === 'portrait' ? 0.014 : 0.026) / scale;
  if (opts.shadow && B.meshes.toon) B.meshes.toon.castShadow = true;
  // where shots and breath leave: in front of the mouth, on the head bone
  const muzzle = new THREE.Object3D(); muzzle.name = 'beast.muzzle';
  const hb = K.by.head || K.by.body; const mp = K.mouth ? new THREE.Vector3(...K.mouth) : hb.userData.w.clone().add(new THREE.Vector3(0, 0, 0.25));
  muzzle.position.copy(mp.sub(hb.userData.w)); hb.add(muzzle);
  const rig = createRig(K, { ...F, legLen: meta.legLen || 0.3, scale });
  let held = null; let heldT = 0;
  const st0 = { anim: 'idle', animT: 0, speed: 0, move: F.move };
  const beast = {
    root: B.root, height: H, key, id, family, move: F.move, lod, muzzle, generic: !!F.generic, scale,
    drawCalls: Object.keys(B.meshes).length, bones: K.by, lift: 0, speed: 0,
    update(state, dt) {
      heldT += dt || 0; const s = state || st0; beast.speed = s.speed || 0;
      beast.lift = rig(held && (!s.anim || s.anim === 'idle') ? { ...s, anim: held, animT: heldT } : s, dt) * scale;
    },
    // one number that changes whenever any bone moves (tests use it to see that a gait is playing)
    poseSig() { let v = 0; for (const b of K.bones) v += Math.abs(b.rotation.x) + Math.abs(b.rotation.y) + Math.abs(b.rotation.z) + Math.abs(b.position.y); return v; },
    setPose(name) { held = name && name !== 'idle' ? name : null; heldT = 0; },
    // stealth (opacity), frozen (blue self-light), hit flash (0..1 white)
    setTint({ opacity = 1, freeze = false, flash = 0 } = {}) {
      const f = B.U.uFlash.value; if (freeze) f.setRGB(0.05, 0.25, 0.45); else f.setRGB(flash * 0.8, flash * 0.75, flash * 0.7);
      for (const k of ['toon', 'glow', 'line']) { const m = B.mats[k]; const tr = opacity < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = opacity; m.depthWrite = !tr; }
    },
    dispose() { for (const m of Object.values(B.meshes)) m.geometry.dispose(); for (const m of Object.values(B.mats)) m.dispose(); B.skel.dispose(); },
  };
  return beast;
}
