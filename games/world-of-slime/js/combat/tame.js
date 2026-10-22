// Bắt slime bằng Cube (F3). Game gốc (CODE.md §4): người chơi dùng item có ItemOptionCube -> CastTargetMonstersRequest{itemId},
// server trả CatchResultData{monsterGameIndexList, cubeGameIndex, result (CubeWobbleResult FAIL -1 / CAUGHT 0 / 1-3 lần lắc)}.
// Bản web tự quyết kết quả bằng rules.js tameChance/rollTame [ĐỀ XUẤT], mọi số khác là meta thật (META.cube: item_type 4,
// action 32, attack_type 5). Mô hình + clip: prop/cube001.glb (Cube001_Item bay, Cube001_Catch: Cube_net_open, Cube_net_close,
// Cube_catch_1..3, Cube_success, Cube_catch_failed, Cube_net_failed), tiếng Wwise cube_throw / cube_net_* / cube_catch_* / cube_success / cube_fail.
// Toạ độ logic Unity (x, z), Object3D ở (-x, y, z) như combat.js.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, loadTex } from '../assets.js?v=20261022e';
import { envMaterial } from '../world/envmat.js?v=20261022e';
import { META, RULES, tameChance, rollTame } from './rules.js?v=20261022e';

const C = META.cube;
const SOUND = { Cube_net_open: 'cube_net_open', Cube_net_close: 'cube_net_close', Cube_catch_1: 'cube_catch_1', Cube_catch_2: 'cube_catch_2',
  Cube_catch_3: 'cube_catch_3', Cube_success: 'cube_success', Cube_catch_failed: 'cube_fail', Cube_net_failed: 'cube_fail' };
const GUIDE_COL = 0x7fd8ff;   // [THẤY gmwall_tame_floralime_cube] đường ngắm xanh nhạt người chơi -> con trỏ

let prepared = null;
async function prepare() {
  if (prepared) return prepared;
  prepared = (async () => {
    const g = await loadGLB('prop/cube001.glb');
    // vật liệu prop: extras.tex là uri tương đối với GLB (bẫy 2 ARCH.md) -> envMaterial như hộp trôi dạt (game.js loadProps)
    const net = [];
    const path = 'prop/cube001.glb', texFor = (uri, ramp) => loadTex(/^(map|prop|slime|npc|player)/.test(uri) ? uri : path.replace(/[^/]+$/, '') + uri, { nearest: !!ramp });
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      if (/Cube Net/.test((o.material.userData || {}).shader || '')) net.push(o);
      else o.material = envMaterial(o.material, { hasVColor: !!o.geometry.attributes._color, skinned: !!o.isSkinnedMesh, texFor });
    });
    // vật liệu MixMaster/Unit/Cube Net (Multi-Circle) chưa dịch: lưới + giọt nước trong suốt xanh [ĐỀ XUẤT]
    const netMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
    for (const o of net) o.material = netMat;
    const find = n => { let r = null; g.scene.traverse(o => { if (o.name === n) r = o; }); return r; };
    return { g, item: find('Cube001_Item'), catch: find('Cube001_Catch'), clips: Object.fromEntries(g.animations.map(a => [a.name, a])) };
  })();
  return prepared;
}

export class Tame {
  constructor(ctx) {
    this.c = ctx;   // { scene, audio, combat, roster, P, rng(), perkLevels(), onResult(res), ev(kind, d) }
    this.cd = 0;    // ms hồi Cube (coolTimeMillis 5000)
    this.busy = null;
    this.flights = [];
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: GUIDE_COL, transparent: true, opacity: 0.85, depthTest: false }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(C.guide / 2 - 0.08, C.guide / 2, 40), new THREE.MeshBasicMaterial({ color: GUIDE_COL, transparent: true, opacity: 0.75, depthTest: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    for (const o of [this.line, this.ring]) { o.visible = false; o.renderOrder = 6; o.frustumCulled = false; ctx.scene.add(o); }
    prepare().catch(e => ctx.ev('error', { e: 'cube glb: ' + e.message }));
  }
  // slime hoang bắt được (MonsterNormal, Enemy, Catchable): chưa chết, chưa bị nhốt
  catchable() { return this.c.combat.mons.filter(m => m.team === 'wild' && !m.dead && !m.trapped); }
  nearest(x, z, r) {
    let best = null, bd = r;
    for (const m of this.catchable()) { const d = Math.hypot(m.x - x, m.z - z); if (d <= bd) { bd = d; best = m; } }
    return best;
  }
  // điểm rơi: kẹp trong maxRange 6 quanh người chơi
  clampAim(aim) {
    const P = this.c.P; if (!aim) return null;
    const dx = aim.x - P.x, dz = aim.z - P.z, d = Math.hypot(dx, dz);
    return d <= C.maxRange ? { x: aim.x, z: aim.z } : { x: P.x + dx / d * C.maxRange, z: P.z + dz / d * C.maxRange };
  }
  // cubeGuide: đường + vòng guideSize 3 ở điểm rơi (PC: giữ phím; mobile: kéo nút)
  guide(aim) {
    const a = this.clampAim(aim), P = this.c.P, map = this.c.combat.map;
    if (!a || !map) { this.line.visible = this.ring.visible = false; return; }
    const y = map.getHeight(a.x, a.z), gy = (y > -100 ? y : P.y) + 0.06;
    this.ring.position.set(-a.x, gy, a.z);
    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, -P.x, P.y + 0.08, P.z); pos.setXYZ(1, -a.x, gy, a.z); pos.needsUpdate = true;
    this.line.visible = this.ring.visible = true;
  }
  hideGuide() { this.line.visible = this.ring.visible = false; }

  // ném: trả 'ok' hoặc mã lỗi ('cooldown' | 'noNearby' | 'full' | 'busy')
  throw(aim) {
    const P = this.c.P, R0 = this.c.roster;
    if (this.cd > 0) return 'cooldown';
    if (this.busy) return 'busy';
    if (!this.nearest(P.x, P.z, C.nearRadius)) return 'noNearby';   // useCondition: NearPlayerCount(Catchable, 5.5 ô) > 0
    if (!R0.canAdd()) return 'full';                                   // UI.CubeNoEmptyInven
    const a = this.clampAim(aim);
    // castType Position + chase: có điểm ngắm thì nhắm con gần điểm đó (trong vòng guide), không thì con gần người chơi nhất
    const target = a ? this.nearest(a.x, a.z, C.guide / 2 + C.hitRadius) : this.nearest(P.x, P.z, C.nearRadius);
    const to = target ? { x: target.x, z: target.z } : a || { x: P.x - Math.sin(P.yaw), z: P.z + Math.cos(P.yaw) };
    this.cd = C.cooldown;
    this.c.audio.play('cube_throw');
    this.c.ev('cubeThrow', { target: target ? target.def.id : null, x: +to.x.toFixed(2), z: +to.z.toFixed(2) });
    this.busy = { phase: 'pre', t: C.pre / 1000, target, to };
    return 'ok';
  }

  async spawnFlight(b) {
    const pr = await prepare();
    const o = pr.item.clone(true); o.position.set(0, 0, 0);
    const grp = new THREE.Group(); grp.add(o); grp.scale.setScalar(1.0);
    const P = this.c.P;
    b.from = { x: P.x - Math.sin(P.yaw) * 0.3, z: P.z + Math.cos(P.yaw) * 0.3, y: P.y + 1.0 };
    b.obj = grp; this.c.scene.add(grp);
  }
  async spawnCatch(x, y, z) {
    const pr = await prepare();
    const o = SkeletonUtils.clone(pr.catch); o.position.set(0, 0, 0);
    const grp = new THREE.Group(); grp.add(o); grp.position.set(-x, y, z); grp.rotation.y = Math.PI;
    this.c.scene.add(grp);
    const mixer = new THREE.AnimationMixer(o);
    return { grp, mixer, clips: pr.clips, cur: null, t: 0, dur: 0 };
  }
  playClip(k, name) {
    const clip = k.clips[name]; if (!clip) return 0.6;
    k.mixer.stopAllAction();
    const a = k.mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play();
    k.cur = name; k.t = 0; k.dur = clip.duration;
    if (SOUND[name]) this.c.audio.play(SOUND[name]);
    return clip.duration;
  }

  update(dt) {
    this.cd = Math.max(0, this.cd - dt * 1000);
    const b = this.busy; if (!b) return;
    const map = this.c.combat.map;
    if (b.phase === 'pre') {
      b.t -= dt;
      if (b.t <= 0 && !b.spawning) { b.spawning = true; this.spawnFlight(b).then(() => { b.phase = 'fly'; b.ft = 0; }).catch(e => { this.c.ev('error', { e: e.message }); this.busy = null; }); }
      return;
    }
    if (b.phase === 'fly') {
      // attack_type 5: Linear moveSpeed 10, Parabola maxCurveHeight 3 (độ cao theo quãng / maxRange [ĐỀ XUẤT]); chase = bám theo mục tiêu
      const to = b.target && !b.target.dead && !b.target.trapped ? { x: b.target.x, z: b.target.z } : b.to;
      const d = Math.hypot(to.x - b.from.x, to.z - b.from.z), T = Math.max(0.25, d / C.speed);
      b.ft += dt; const u = Math.min(1, b.ft / T);
      const gy = map.getHeight(to.x, to.z), ty = gy > -100 ? gy : this.c.P.y;
      const h = C.curve * Math.min(1, d / C.maxRange);
      const x = b.from.x + (to.x - b.from.x) * u, z = b.from.z + (to.z - b.from.z) * u, y = b.from.y + (ty + 0.3 - b.from.y) * u + 4 * h * u * (1 - u);
      b.obj.position.set(-x, y, z); b.obj.rotation.set(u * 6, u * 9, 0);
      if (u >= 1) {
        this.c.scene.remove(b.obj);
        const hit = b.target && !b.target.dead && !b.target.trapped && Math.hypot(b.target.x - to.x, b.target.z - to.z) <= C.hitRadius + 0.5 ? b.target : this.nearest(to.x, to.z, C.hitRadius);
        b.phase = 'wait';
        this.spawnCatch(to.x, ty, to.z).then(k => this.landed(b, k, hit, to, ty)).catch(e => { this.c.ev('error', { e: e.message }); this.busy = null; });
      }
      return;
    }
    if (b.k) {
      b.k.mixer.update(dt); b.k.t += dt;
      if (b.m && b.m.shrink > 0) { b.m.shrink = Math.max(0, b.m.shrink - dt); b.m.object.scale.setScalar(Math.max(0.01, b.m.shrink / 0.3)); if (!b.m.shrink) b.m.object.visible = false; }
      if (b.k.t >= b.k.dur) this.next(b);
    }
  }
  landed(b, k, m, to) {
    b.k = k;
    if (!m) { b.steps = ['Cube_net_open', 'Cube_net_failed']; b.result = { result: null, miss: true }; this.c.ev('cubeMiss', {}); }
    else {
      m.trapped = true; m.phase = null; m.aggro = false; m.shrink = 0.3; b.m = m;
      if (this.c.combat.pt.target === m) { this.c.combat.pt.target = null; this.c.combat.pt.phase = null; }
      const ratio = m.hp / m.maxHp, chance = tameChance(ratio, this.c.perkLevels());
      b.result = { ...rollTame(chance, this.c.rng), chance: +chance.toFixed(3), hp: m.hp, maxHp: m.maxHp };
      b.steps = ['Cube_net_open', 'Cube_net_close'];
      for (let i = 1; i <= b.result.shakes; i++) b.steps.push('Cube_catch_' + i);
      b.steps.push(b.result.result === 0 ? 'Cube_success' : 'Cube_catch_failed');
      this.c.ev('cubeHit', { id: m.def.id, ...b.result });
    }
    this.next(b);
  }
  next(b) {
    const name = b.steps.shift();
    if (name) { this.playClip(b.k, name); if (/^Cube_catch_\d/.test(name)) this.c.ev('cubeShake', { n: +name.slice(-1) }); return; }
    // xong chuỗi
    const m = b.m, res = b.result;
    setTimeout(() => { this.c.scene.remove(b.k.grp); }, res.result === 0 ? 900 : 0);
    if (m && res.result === 0) {
      m.trapped = false; m.dead = true; m.dieT = 0; m.respawnT = RULES.respawn; m.object.visible = false;
      this.c.combat.ui.dropTag(m);
      this.c.ev('caught', { id: m.def.id, model: m.def.model });
    } else if (m) {
      m.trapped = false; m.object.visible = true; m.object.scale.setScalar(1); m.aggro = true;   // thoát ra, nổi giận
      this.c.ev('brokeFree', { id: m.def.id, shakes: res.shakes });
    }
    this.busy = null;
    this.c.onResult({ ...res, monster: m });
  }
}
