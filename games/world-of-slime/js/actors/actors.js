// Người chơi (ghép avatar theo player/index.json defaults) và slime đồng hành (slime/index.json variants).
// Ghép avatar theo SM.Common.Character.CharacterBuilder (EXPORT_PLAYER.md); mã ghép chép từ sheet.html playerCell.
import * as THREE from 'three';
import { loadGLB, loadJSON, clipOf } from '../assets.js?v=20261022e';
import { applyUnitMaterials, decalAt } from './toon.js?v=20261022e';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// loadGLB trả cùng một gltf (bộ đệm): vào lại bản đồ mà gắn lại g.scene + chạy lại applyUnitMaterials thì vật liệu toon bị
// bọc hai lần, NPC ra trắng bệch (bẫy 28 ARCH.md). Vật liệu chỉ dựng một lần trên cảnh gốc, mỗi lần tạo là một bản nhân.
const prepared = new Map();
async function instanceOf(g, key) {
  if (!prepared.has(key)) prepared.set(key, applyUnitMaterials(g, g.scene, {}));
  const decals = await prepared.get(key);
  return { scene: SkeletonUtils.clone(g.scene), decals };
}

// Enums.Wwise_Footstep_Event. [ĐỀ XUẤT] có None = 0 ở đầu: SL_Slime_* có wwiseFootstepEvent 7 = slime.
export const FOOTSTEP_EVENTS = ['', 'Footstep_quad', 'Footstep_default', 'Footstep_giant', 'Footstep_flutter', 'Footstep_hop',
  'Footstep_sticky', 'Footstep_slime', 'Footstep_biped', 'Footstep_flap', 'Footstep_hover', 'Footstep_slither', 'Footstep_sticky_L'];

class Animated {
  constructor() { this.mixer = null; this.actions = {}; this.cur = null; this.decals = []; this.events = {}; this.onEvent = null; this._lastT = 0; }
  addClip(key, ca) {
    if (!ca) return;
    const a = this.mixer.clipAction(ca.clip);
    a.setLoop(ca.ex.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    if (ca.ex.loop === false) a.clampWhenFinished = true;
    this.actions[key] = { action: a, ex: ca.ex };
  }
  play(key, fade = 0.15, timeScale = 1) {
    const n = this.actions[key]; if (!n) return;
    n.action.timeScale = timeScale;
    if (this.cur === key) return;
    const prev = this.cur && this.actions[this.cur];
    n.action.reset().play();
    if (prev) n.action.crossFadeFrom(prev.action, fade, false);
    this.cur = key; this._lastT = 0;
  }
  update(dt) {
    if (!this.mixer) return;
    this.mixer.update(dt);
    const n = this.actions[this.cur]; if (!n) return;
    const t = n.action.time, dur = n.action.getClip().duration;
    const w = decalAt(n.ex, t); for (const u of this.decals) u.value = w;
    // sự kiện clip (bước chân): bắn khi thời gian vượt qua mốc, kể cả khi vòng lại
    const ev = this.events[this.cur] || n.ex.events;
    if (ev && this.onEvent) {
      const prev = this._lastT;
      for (const e of ev) {
        const hit = t >= prev ? (e.time > prev && e.time <= t) : (e.time > prev || e.time <= t);
        if (hit) this.onEvent(e, this.cur);
      }
    }
    this._lastT = t;
    void dur;
  }
}

export class Player extends Animated {
  static async create(gender = 'man') {
    const p = new Player();
    const pidx = await loadJSON('player/index.json');
    const rigG = await loadGLB(pidx.rigs[gender].glb);
    const rig = rigG.scene;          // rig dùng một lần nên không clone
    const byName = {}; rig.traverse(o => { byName[o.name] = o; });
    const ATT = pidx.attach;
    for (const [slot, id] of Object.entries(pidx.defaults[gender])) {
      const part = pidx.parts.find(q => q.id === id);
      if (!part || !part.glb) continue;
      const g = await loadGLB(part.glb);
      p.decals.push(...await applyUnitMaterials(g, g.scene, { skinNum: 1, hairColor: pidx.customize.hairColors[0] }));
      const proot = g.scene.children[0];
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
    p.object = new THREE.Group(); p.object.name = 'Player_' + gender; p.object.add(rig);
    p.mixer = new THREE.AnimationMixer(rig);
    const ag = await loadGLB(pidx.anim[gender].glb);
    const state = n => (pidx.rigs[gender].states.find(s => s.name === n) || {}).clips;
    for (const k of ['Idle', 'Walk', 'Run', 'SlimeAttack', 'Hit']) {
      const c = state(k); if (c) p.addClip(k, clipOf(ag, c[0]));
    }
    // Run không có sự kiện bước chân trong clip: [ĐỀ XUẤT] dùng cùng pha với Walk (0.0667 / 0.3333 trên 0.5333 s)
    if (p.actions.Run && !p.actions.Run.ex.events) p.events.Run = [{ time: 0.0667, fn: 'PostWwiseFootstepEventCached' }, { time: 0.3333, fn: 'PostWwiseFootstepEventCached' }];
    p.footstepEvent = 'Footstep_default';   // [ĐỀ XUẤT] người chơi: PostWwiseFootstepEventCached, sự kiện chưa đọc từ prefab
    p.play('Idle', 0);
    return p;
  }
}

export class Slime extends Animated {
  static async create(id = 'SL_Slime_Water') {
    const s = new Slime();
    const si = await loadJSON('slime/index.json');
    const v = si.variants.find(x => x.id === id);
    if (!v) throw new Error('slime variant not found: ' + id);
    const g = await loadGLB(v.glb);
    const inst = await instanceOf(g, 'slime:' + id);
    s.decals = inst.decals;
    s.object = new THREE.Group(); s.object.name = 'Slime_' + id; s.object.add(inst.scene);
    s.mixer = new THREE.AnimationMixer(inst.scene);
    const ag = v.clips === 'embedded' ? g : await loadGLB(v.anim);
    for (const k of ['Idle', 'Walk', 'Attack', 'Hit']) if (v.actions[k]) s.addClip(k, clipOf(ag, v.actions[k]));
    if (v.actions.Skill_Range_Enter) s.addClip('Skill', clipOf(ag, v.actions.Skill_Range_Enter));   // js/combat: kỹ năng motionCategory 20002 (Skill_Range)
    s.footstepEvent = FOOTSTEP_EVENTS[(v.modelInfo || {}).wwiseFootstepEvent] || 'Footstep_slime';
    s.variant = v;
    s.play('Idle', 0);
    return s;
  }
}

// NPC đứng yên (npc/index.json): mô hình + clip IdleBase của Animator (trạng thái default). Chỗ đứng là dữ liệu server
// (ObjectController), ở bản web lấy từ data/portals.js [ĐO TRONG ẢNH].
export class Npc extends Animated {
  static async create(id) {
    const n = new Npc();
    const ni = await loadJSON('npc/index.json');
    const v = ni.npcs.find(x => x.id === id);
    if (!v) throw new Error('npc not found: ' + id);
    const g = await loadGLB(v.glb);
    const inst = await instanceOf(g, 'npc:' + id);
    n.decals = inst.decals;
    n.object = new THREE.Group(); n.object.name = 'Npc_' + id; n.object.add(inst.scene);
    n.mixer = new THREE.AnimationMixer(inst.scene);
    const idle = (v.states || []).find(s => s.default) || (v.states || [])[0];
    if (idle) n.addClip('Idle', clipOf(g, idle.clips[0]));
    n.play('Idle', 0);
    // lệch pha để các NPC không thở cùng nhịp [ĐỀ XUẤT]
    if (n.actions.Idle) n.actions.Idle.action.time = Math.random() * n.actions.Idle.action.getClip().duration;
    n.info = v;
    return n;
  }
}
