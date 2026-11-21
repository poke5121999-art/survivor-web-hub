// Boss skill animations and the boss miniature for the stage diorama.
// The five older bosses are plain pool bodies (the brood is the pool's spider rig) whose own poser knows no skills, so each of
// their skills names a pose here; the six kit bosses play their own moves and only get a body lean on top.
// Data shape: SKILL_POSE[enemy kind][i] is the pose of ENEMY[kind].skills[i]; POSES[name](b, k, w) edits the limbs the pool
// just posed, k the progress of the cast over its lock (0..1, past 1 while it eases out) and w the blend weight.
const THREE = window.THREE;
const BZ = window.BZ;

const SKILL_POSE = {
  giant: ['slam', 'roar', 'stomp'],                    // Nhảy Nện, Gầm, Địa Chấn
  thrower: ['throw', 'roar', 'bowl'],                  // Mưa Đá, Gọi Kẻ Phun, Tảng Lăn
  phantom: ['vanish', 'volley', 'conjure', 'screech'], // Dịch Chuyển, Mảnh Hồn, Phân Thân, Hú Hồn
  queen: ['call', 'lunge', 'sonic', 'siphon'],         // Gọi Bầy, Bổ Nhào, Sóng Âm, Hút Máu
  brood: ['lay', 'spit', 'pounce', 'acid'],            // Đẻ Trứng, Phun Tơ, Vồ Xa, Biển Độc
};
const KIT_LEAN = { plasma: 'brace', laser: 'brace', eyebeam: 'brace', breath: 'brace', tractor: 'brace', blooddash: 'surge', charge: 'surge', dive: 'surge', bomb: 'sway', invade: 'sway', emp: 'sway' };

const mix = (a, b, w) => a + (b - a) * w;
const seg = (k, a, b) => BZ.smooth(Math.min(1, Math.max(0, (k - a) / (b - a))));
const LEG_M = new THREE.Matrix4(); const LEG_FLIP = new THREE.Matrix4().makeRotationY(Math.PI);
// the spider's eight legs are two instanced meshes fed from the hip and knee groups (zkinds legMats): a pose that bends a leg
// after the pool posed it has to copy the groups into the instances again
function legMats(X) {
  X.legs.forEach((l, k) => { l.hip.updateMatrix(); l.knee.updateMatrix(); LEG_M.copy(l.hip.matrix); if (l.s < 0) LEG_M.multiply(LEG_FLIP); X.legU.setMatrixAt(k, LEG_M); X.legL.setMatrixAt(k, LEG_M.multiplyMatrices(l.hip.matrix, l.knee.matrix)); });
  X.legU.instanceMatrix.needsUpdate = true; X.legL.instanceMatrix.needsUpdate = true;
}
const arms = (b, x, z, w) => { b.armL.rotation.x = mix(b.armL.rotation.x, x, w); b.armR.rotation.x = mix(b.armR.rotation.x, x, w); if (z !== null) { b.armL.rotation.z = mix(b.armL.rotation.z, -z, w); b.armR.rotation.z = mix(b.armR.rotation.z, z, w); } };
const wings = (b, z, w) => { if (!b.wingL) return; b.wingL.rotation.z = mix(b.wingL.rotation.z, -z, w); b.wingR.rotation.z = mix(b.wingR.rotation.z, z, w); };

export const POSES = {
  slam(b, k, w) { // both arms overhead, then down onto the ground in front
    const up = seg(k, 0, 0.5), dn = seg(k, 0.5, 0.65); arms(b, mix(mix(-1.5, -2.9, up), -0.5, dn), null, w);
    b.torso.rotation.x = mix(b.torso.rotation.x, mix(-0.3 * up, 0.55, dn), w); b.hips.rotation.x += w * 0.2 * dn;
  },
  stomp(b, k, w) { // a knee up, the foot down hard, the arms thrown low
    const up = seg(k, 0, 0.45), dn = seg(k, 0.45, 0.6);
    b.legL.rotation.x = mix(b.legL.rotation.x, mix(-1.1 * up, 0.1, dn), w); arms(b, -1.6 * up + 0.4 * dn, null, w);
    b.torso.rotation.x = mix(b.torso.rotation.x, -0.2 * up + 0.35 * dn, w);
  },
  roar(b, k, w) { // head back, chest out, arms flung wide and shaking
    const s = Math.sin(k * 60) * 0.05;
    b.head.rotation.x = mix(b.head.rotation.x, -0.8, w); b.torso.rotation.x = mix(b.torso.rotation.x, -0.3, w);
    b.armL.rotation.x = mix(b.armL.rotation.x, -0.5 + s, w); b.armR.rotation.x = mix(b.armR.rotation.x, -0.5 - s, w);
    b.armL.rotation.z = mix(b.armL.rotation.z, -1.3, w); b.armR.rotation.z = mix(b.armR.rotation.z, 1.3, w);
  },
  throw(b, k, w) { // the right arm cocked far back over the head, whipped forward high, the body twisting through
    const back = seg(k, 0, 0.5), fwd = seg(k, 0.5, 0.65);
    b.armR.rotation.x = mix(b.armR.rotation.x, mix(mix(-1.5, -3.0, back), -1.2, fwd), w); b.armL.rotation.x = mix(b.armL.rotation.x, -1.5, w);
    b.torso.rotation.y = mix(b.torso.rotation.y, mix(0.6 * back, -0.5, fwd), w); b.torso.rotation.x = mix(b.torso.rotation.x, 0.4 * fwd - 0.2 * back, w);
  },
  bowl(b, k, w) { // a deep crouch, the right arm swung low behind, then along the ground forward: a boulder bowled, not thrown
    const back = seg(k, 0, 0.55), fwd = seg(k, 0.55, 0.75);
    b.hips.position.y -= w * 0.22 * back * (1 - 0.5 * fwd); b.torso.rotation.x = mix(b.torso.rotation.x, 0.75, w);
    b.armR.rotation.x = mix(b.armR.rotation.x, mix(1.3 * back, -1.0, fwd), w); b.armL.rotation.x = mix(b.armL.rotation.x, -0.3, w); b.armL.rotation.z = mix(b.armL.rotation.z, -0.9, w);
    b.legL.rotation.x = mix(b.legL.rotation.x, -0.7, w); b.legR.rotation.x = mix(b.legR.rotation.x, 0.5, w);
    b.torso.rotation.y = mix(b.torso.rotation.y, mix(-0.5 * back, 0.4, fwd), w);
  },
  conjure(b, k, w) { // both arms raised, hands shaking, the head tipped up
    const sh = Math.sin(k * 50) * 0.08;
    b.armL.rotation.x = mix(b.armL.rotation.x, -2.5 + sh, w); b.armR.rotation.x = mix(b.armR.rotation.x, -2.5 - sh, w);
    b.armL.rotation.z = mix(b.armL.rotation.z, -0.4, w); b.armR.rotation.z = mix(b.armR.rotation.z, 0.4, w);
    b.head.rotation.x = mix(b.head.rotation.x, -0.5, w); b.torso.rotation.x = mix(b.torso.rotation.x, -0.2, w);
  },
  vanish(b, k, w) { // the arms wrapped round the chest, curled over, the whole body spun away into the blink and back out of it
    const sp = seg(k, 0.05, 0.75);
    b.armL.rotation.x = mix(b.armL.rotation.x, -1.3, w); b.armR.rotation.x = mix(b.armR.rotation.x, -1.3, w);
    b.armL.rotation.z = mix(b.armL.rotation.z, 1.1, w); b.armR.rotation.z = mix(b.armR.rotation.z, -1.1, w);
    b.torso.rotation.x = mix(b.torso.rotation.x, 0.5, w); b.head.rotation.x = mix(b.head.rotation.x, 0.6, w);
    b.root.rotation.y += w * sp * Math.PI * 2;
  },
  volley(b, k, w) { // the shards thrown one hand after the other, straight at the target
    const p = Math.sin(k * Math.PI * 5);
    b.armL.rotation.x = mix(b.armL.rotation.x, -1.55 - 0.45 * p, w); b.armR.rotation.x = mix(b.armR.rotation.x, -1.55 + 0.45 * p, w);
    b.torso.rotation.y = mix(b.torso.rotation.y, 0.35 * p, w); b.torso.rotation.x = mix(b.torso.rotation.x, 0.25, w);
  },
  screech(b, k, w) { // the head thrown back, the arms spread, the whole body shuddering
    const sh = Math.sin(k * 70);
    b.head.rotation.x = mix(b.head.rotation.x, -0.9, w); b.torso.rotation.x = mix(b.torso.rotation.x, -0.45, w);
    b.armL.rotation.z = mix(b.armL.rotation.z, -1.5, w); b.armR.rotation.z = mix(b.armR.rotation.z, 1.5, w);
    b.armL.rotation.x = mix(b.armL.rotation.x, -0.4, w); b.armR.rotation.x = mix(b.armR.rotation.x, -0.4, w); b.torso.rotation.z = mix(b.torso.rotation.z, sh * 0.08, w);
  },
  call(b, k, w) { // the swarm called: the arms flung straight up and wide, the wings beating twice as fast, the head back
    const f = Math.sin(k * 40);
    arms(b, -2.6, 0.7, w); wings(b, 0.25 + f * 0.9, w);
    b.head.rotation.x = mix(b.head.rotation.x, -0.7, w); b.torso.rotation.x = mix(b.torso.rotation.x, -0.35, w);
  },
  sonic(b, k, w) { // the wave pushed out in front: the head and chest thrust forward in pulses, the arms and wings swept back
    const p = Math.max(0, Math.sin(k * Math.PI * 4)) * seg(k, 0.2, 0.4);
    b.torso.rotation.x = mix(b.torso.rotation.x, 0.45 + 0.2 * p, w); b.head.rotation.x = mix(b.head.rotation.x, -0.4 - 0.3 * p, w);
    arms(b, 0.9, 0.5, w); wings(b, -0.9, w);
  },
  siphon(b, k, w) { // blood drawn in: both arms reaching forward and pulled back to the chest, the body leaning away
    const p = 0.5 + 0.5 * Math.sin(k * Math.PI * 4);
    arms(b, mix(-1.7, -0.9, p), -0.25, w); b.elbowL.rotation.x = mix(b.elbowL.rotation.x, -1.2 * p, w); b.elbowR.rotation.x = mix(b.elbowR.rotation.x, -1.2 * p, w);
    b.torso.rotation.x = mix(b.torso.rotation.x, -0.35, w); wings(b, 0.9, w);
  },
  lunge(b, k, w) { // the body pitched down and forward, both arms reaching, the legs trailing
    const d = seg(k, 0, 0.4);
    b.root.rotation.x += w * 0.5 * d; arms(b, -2.0, null, w);
    b.legL.rotation.x = mix(b.legL.rotation.x, 0.6, w); b.legR.rotation.x = mix(b.legR.rotation.x, 0.6, w);
  },
  // ---- the brood: the pool's spider rig (b.x.spider, its abdomen, its head, eight two-bone legs) ----
  lay(b, k, w) { // the abdomen curled down and pumping out eggs, the front raised, the legs braced wide
    const X = b.x; if (!X || !X.spider) return; const pump = Math.max(0, Math.sin(k * Math.PI * 6));
    X.abd.rotation.x = mix(X.abd.rotation.x, 0.75 + 0.3 * pump, w); X.spider.rotation.x = mix(X.spider.rotation.x, -0.3, w);
    for (const l of X.legs) l.hip.rotation.z = mix(l.hip.rotation.z, l.s * 0.25, w);
    legMats(X);
  },
  spit(b, k, w) { // reared on the back legs, the front pair up, the head snapping forward when the web flies
    const X = b.x; if (!X || !X.spider) return; const up = seg(k, 0, 0.45), snap = seg(k, 0.45, 0.55) * (1 - seg(k, 0.7, 1));
    X.spider.rotation.x = mix(X.spider.rotation.x, -0.65 * up, w); X.spider.position.y += w * 0.25 * up;
    X.ceph.rotation.x = mix(X.ceph.rotation.x, -0.4 * up + 0.8 * snap, w);
    for (const l of X.legs) if (l.i === 0) { l.hip.rotation.z = mix(l.hip.rotation.z, -l.s * 0.6 * up, w); l.hip.rotation.y = mix(l.hip.rotation.y, l.spread - l.s * 0.5 * up, w); }
    legMats(X);
  },
  pounce(b, k, w) { // a low crouch on bent legs, then the spring: legs flung out straight, the body pitched nose down
    const X = b.x; if (!X || !X.spider) return; const dn = seg(k, 0, 0.3), go = seg(k, 0.3, 0.45);
    X.spider.position.y += w * (-0.22 * dn * (1 - go) + 0.3 * go * (1 - seg(k, 0.8, 1)));
    X.spider.rotation.x = mix(X.spider.rotation.x, 0.4 * go, w);
    for (const l of X.legs) { l.hip.rotation.z = mix(l.hip.rotation.z, l.s * mix(0.95 * dn, 0.05, go), w); l.knee.rotation.z = mix(l.knee.rotation.z, -l.s * mix(0.9 * dn, -0.2, go), w); }
    legMats(X);
  },
  acid(b, k, w) { // the abdomen lifted high over the back like a sting, the body shuddering, the legs stamping in turn
    const X = b.x; if (!X || !X.spider) return; const u = seg(k, 0, 0.35);
    X.abd.rotation.x = mix(X.abd.rotation.x, -1.0 * u, w); X.spider.rotation.z = mix(X.spider.rotation.z, Math.sin(k * 50) * 0.07 * u, w);
    for (const l of X.legs) l.hip.rotation.z = mix(l.hip.rotation.z, l.s * (0.6 + 0.35 * Math.max(0, Math.sin(k * 24 + l.i * 1.6 + (l.s > 0 ? 0 : Math.PI)))), w);
    legMats(X);
  },
  brace(b, k, w) { b.root.rotation.x += w * -0.3 * seg(k, 0, 0.5) * (1 - seg(k, 0.6, 1)); }, // a beam charging: the whole body leans back
  surge(b, k, w) { b.root.rotation.x += w * 0.42 * seg(k, 0, 0.5); }, // a dash: the body pitches into it
  sway(b, k, w) { const u = seg(k, 0, 0.5); b.root.rotation.z += w * 0.45 * u * Math.sin(k * 9 + 1); b.root.rotation.x += w * 0.3 * u; }, // a hovering craft tilts and rocks
};

// the act a boss starts when the sim says it casts skill `sk`; kit bosses (boss2) only lean, and only for some moves. An act
// cut short by the next one hands over its values from before the cast, so the new one does not take its pose as the rest.
export function actFor(u, sk, kit, prev) {
  const lock = sk.def.lock || 1;
  const pose = kit ? KIT_LEAN[sk.def.move] : (SKILL_POSE[u.kind] || [])[u.def.skills.indexOf(sk.def)] || 'conjure';
  if (!pose) return null;
  // a kit lean only marks the start of the kit's own move, on a fixed 0.7 s
  const a = { pose, t: 0, lock: kit ? 0.7 : lock, dur: lock + 0.3 };
  if (prev && prev.ch) { a.ch = prev.ch; a.rest = prev.rest; a.wrote = prev.wrote; }
  return a;
}
// Every channel a pose may write. The pool sets some of them again each frame and leaves others alone (the chest's pitch, the
// arms' spread): a pose blended onto one it leaves alone would stay there after the cast, so those go back to their value from
// before the cast each frame and when the act ends.
const AXES = ['x', 'y', 'z'];
function channels(b) {
  const out = []; const add = (o, v, ks) => { if (o) for (const k of ks) out.push([o[v], k]); };
  add(b.root, 'rotation', ['x', 'z']); add(b.hips, 'rotation', AXES); add(b.hips, 'position', ['y']);
  for (const n of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'elbowL', 'elbowR']) add(b[n], 'rotation', AXES);
  add(b.wingL, 'rotation', ['z']); add(b.wingR, 'rotation', ['z']);
  const X = b.x;
  if (X && X.spider) { add(X.spider, 'rotation', AXES); add(X.spider, 'position', ['y']); add(X.abd, 'rotation', AXES); add(X.ceph, 'rotation', AXES); for (const l of X.legs) { add(l.hip, 'rotation', AXES); add(l.knee, 'rotation', ['z']); } }
  return out;
}
// one frame of an act on body b; false once it is over
export function stepAct(a, b, dt) {
  if (!a.ch) { a.ch = channels(b); a.rest = a.ch.map(([o, k]) => o[k]); }
  if (a.wrote) a.ch.forEach(([o, k], i) => { if (o[k] === a.wrote[i]) o[k] = a.rest[i]; });
  a.t += dt;
  if (a.t > a.dur) { if (b.x && b.x.spider && b.x.spider.visible) legMats(b.x); return false; }
  POSES[a.pose](b, a.t / a.lock, Math.min(1, a.t / 0.12) * (1 - seg(a.t / a.dur, 0.85, 1)));
  a.wrote = a.ch.map(([o, k]) => o[k]);
  return true;
}
export const skillPoses = (kind) => SKILL_POSE[kind] || [];

// ---- the miniature: a pool body dressed as the boss by the pool's own spawn, copied, and the pool slot handed back ----
let pool = null;
export function usePool(zombies) { pool = zombies; }
const BONES = ['hips', 'legL', 'legR', 'armL', 'armR', 'torso', 'head', 'kneeL', 'kneeR', 'elbowL', 'elbowR', 'wingL', 'wingR'];
export function bossModel(kind) {
  if (!pool || !BZ.ZOMBIES[kind]) return null;
  const z = pool.spawn(kind, 1, { x: 0, z: 0, dir: [0, 1] }); if (!z) return null;
  const b = z.body; const root = b.root.clone(true);
  z.alive = false; z.dying = 0; b.root.visible = false; b.barBg.visible = false;
  const src = []; const dst = []; b.root.traverse((o) => src.push(o)); root.traverse((o) => dst.push(o));
  const at = new Map(src.map((o, i) => [o, dst[i]]));
  // the pool re-dresses its materials when the slot is reused, so the copy owns its own
  const mats = new Map(); const own = (m) => { let c = mats.get(m); if (!c) { c = m.clone(); mats.set(m, c); } return c; };
  for (const o of dst) { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); o.castShadow = false; }
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  const out = { root, T: z.T, kind };
  for (const k of BONES) out[k] = at.get(b[k]);
  const X = b.x;
  out.x = { spider: at.get(X.spider), abd: at.get(X.abd), ceph: at.get(X.ceph), legU: at.get(X.legU), legL: at.get(X.legL), legs: X.legs.map((l) => ({ ...l, hip: at.get(l.hip), knee: at.get(l.knee) })) };
  if (out.x.spider && out.x.spider.visible) { for (const l of out.x.legs) { l.hip.rotation.set(0, l.spread, l.s * 0.6); l.knee.rotation.z = -l.s * 0.3; } legMats(out.x); }
  return out;
}
// the miniature's idle: the pool's zombie reach and shuffle, the wings beating. It sets every channel a skill pose writes, so
// a pose played on top of it (stepAct) never stays behind
export function idlePose(m, t) {
  const p = t * 2.2; m.root.rotation.set(0, 0, 0);
  if (m.x.spider && m.x.spider.visible) {
    const X = m.x; X.abd.rotation.x = 0.15 + Math.sin(t * 2) * 0.05; X.ceph.rotation.x = 0; X.spider.rotation.set(0, 0, 0); X.spider.position.y = 0;
    for (const l of X.legs) { const ph = p + l.i * 1.6 + (l.s > 0 ? 0 : Math.PI); l.hip.rotation.set(0, l.spread + Math.cos(ph) * 0.06, l.s * (0.6 + Math.max(0, Math.sin(ph)) * 0.1)); l.knee.rotation.z = -l.s * 0.3; }
    legMats(X); return;
  }
  const T = m.T; m.hips.position.set(0, 0.75, 0); m.hips.rotation.set(T.hunch || 0, 0, 0); m.root.rotation.x = 0; m.root.rotation.z = 0;
  m.torso.rotation.set(0, 0, 0); m.head.rotation.set(-(T.droop || 0) * 0.5, Math.sin(t * 1.1) * 0.25, 0);
  m.legL.rotation.set(Math.sin(p) * 0.18, 0, 0); m.legR.rotation.set(-Math.sin(p) * 0.18, 0, 0);
  m.armL.rotation.set(-1.3 + Math.sin(p * 1.2) * 0.15, 0, 0); m.armR.rotation.set(-1.3 + Math.sin(p * 1.2 + 1.7) * 0.15, 0, 0);
  m.elbowL.rotation.set(-0.3, 0, 0); m.elbowR.rotation.set(-0.3, 0, 0); m.kneeL.rotation.set(0.1, 0, 0); m.kneeR.rotation.set(0.1, 0, 0);
  if (T.fly) { const f = Math.sin(t * 9); m.wingL.rotation.z = -0.25 + f * 0.7; m.wingR.rotation.z = 0.25 - f * 0.7; }
}
