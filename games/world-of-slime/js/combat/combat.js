// Chiến đấu thời gian thực trên bản đồ (CODE.md §2): người chơi ra lệnh (Space / chuột trái / nút đánh = TargetAttackRequest),
// slime đồng hành tự chạy tới và đánh (đòn thường + kỹ năng theo META), slime hoang đi lang thang, gây hấn, đánh lại, chết thì
// rơi đồ và sinh lại; huýt sáo (Return) gọi đồng hành về. Đấu tay đôi với Rudga (QUESTLINE bước 7) dùng cùng bộ máy, đội B.
// Server gốc tính sát thương; ở đây mọi số đến từ js/combat/rules.js (META = đệm server thật, RULES = [ĐỀ XUẤT]).
// Toạ độ logic Unity (x phải, z lên màn hình) như js/game.js; Object3D đặt ở (-x, y, z).
//
// game.js chỉ gọi: setMap(map, info), command(aim) -> bool, recall(), startDuel(), update(dt, cam) -> bool (true = đang lái
// slime đồng hành S), và đọc `events` (test).
import * as THREE from 'three';
import { Slime } from '../actors/actors.js?v=20261022f';
import { RULES, META, ELEMENT, elementOf, makeRng, rollDamage } from './rules.js?v=20261022f';
import { CombatUI } from './ui.js?v=20261022f';
import { state, set } from '../state.js?v=20261022f';
import { L } from '../../data/quest_text.js?v=20261022f';
import { assetUrl } from '../assets.js?v=20261022f';
import { displayName } from '../party/roster.js?v=20261022f';
import { loadFx, makeBall, makeHit, fadeTrail } from './fx.js?v=20261022f';

// F5a: quả cầu + hiệu ứng trúng dựng từ prefab gốc FX_EN0_RangeAtk_<Hệ>_EnergyBall / FX_EN0_Hit_<Hệ> (js/combat/fx.js,
// texture gốc fx/tex). ELEM_COL chỉ còn cho hệ chưa có prefab đã xuất (khối cầu cũ) và tia lệnh. [ĐỀ XUẤT] màu
const ELEM_COL = { 20001: 0xff7a4c, 20002: 0x63c9ff, 20005: 0x8ee65a, 20007: 0xffe066, 20012: 0xb07cff };
const BEAM_COL = 0x8fd8ff, BEAM_SKILL = 0xff5fae;   // [THẤY 9:00 xanh nhạt, 9:30 hồng]
// attack_type 7..19 rangedResource = FX_EN0_RangeAtk_<Hệ>_EnergyBall (data/meta/attack_type.json) cho hệ rules.js chưa ghi fx
const elemFx = e => { const n = Object.keys(ELEMENT).find(k => ELEMENT[k] === e); return n ? 'FX_EN0_RangeAtk_' + n + '_EnergyBall' : null; };
const yawOf = (dx, dz) => Math.atan2(-dx, dz);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

export class Combat {
  constructor(ctx) {
    loadFx();
    this.c = ctx;   // { scene, hud, story, engine, audio, P, S, player, slime, getMap(), getNpc(name), onDuelEnd(win), seed }
    this.ui = new CombatUI(ctx.hud);
    this.rng = makeRng(ctx.seed || (Date.now() & 0xffff));
    this.mons = [];
    this.fx = [];
    this.events = [];
    this.pt = { target: null, actT: 0, phase: null, skillCd: 0, pending: null, linger: 0, syncT: 0 };
    this.duel = null;
    this.loadPartner();
    const g = new THREE.CylinderGeometry(0.045, 0.045, 1, 6, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: BEAM_COL, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 5; this.beamT = 0;
    ctx.scene.add(this.beam);
  }
  // t = giờ thật (ms), gt = giờ trong game (s, cộng dt mỗi khung). game.js kẹp dt <= 0.05 nên khi fps < 20 game chạy chậm hơn
  // giờ thật: đo thời lượng trận phải dùng gt (F5b, test combat từng đỏ trên Pages vì đo bằng đồng hồ thật).
  ev(kind, d = {}) { this.events.push({ t: Math.round(performance.now()), gt: +(this.clock || 0).toFixed(3), kind, ...d }); if (this.events.length > 400) this.events.shift(); }

  // ---- chỉ số đồng hành = bản ghi slime đang đồng hành (F3: engine.roster.active(), khuôn ở js/state.js): cấp, EXP,
  // máu/MP/thể lực là phần 0..1 của mức tối đa theo cấp. Đổi slime (phím 1-6) thì game.js gọi lại loadPartner().
  loadPartner() {
    const r = this.rec = this.c.engine.roster.active();
    if (!r) return;
    this.elem = elementOf(r.typeId);
    this.lv = r.level || 1; this.exp = r.exp || 0;
    const P = RULES.partner;
    this.maxHp = P.hp(this.lv); this.maxMp = P.mp(this.lv);
    this.fainted = !!r.fainted || r.hp <= 0;
    this.hp = this.fainted ? Math.max(0, r.hp * this.maxHp) : Math.max(1, (r.hp ?? 1) * this.maxHp); this.mp = (r.mp ?? 1) * this.maxMp; this.st = r.stamina ?? 1;
    this.pushParty();
  }
  pushParty(persist) {
    const r = this.rec; if (!r) return;
    r.hp = this.hp / this.maxHp; r.mp = this.mp / this.maxMp; r.stamina = this.st; r.level = this.lv; r.exp = this.exp;
    if (this.fainted) r.fainted = true; else delete r.fainted;
    this._w = { hp: r.hp, mp: r.mp, st: r.stamina, uid: r.uid };   // để nhận ra khi engine đổi bản ghi (chữa ở Allen, thuốc, đổi slime)
    if (persist) this.c.engine.persist(); else this.c.engine.sync();
  }
  // tên hiện của slime đồng hành (biệt danh, F3)
  get partnerName() { return displayName(this.rec) || 'Slime'; }

  // ---- bản đồ: slime hoang theo map.data.web.spawns (bản đồ dựng theo clip)
  async setMap(map, info) {
    this.map = map; this.info = info || {};
    for (const m of this.mons) this.c.scene.remove(m.object);
    this.mons = []; this.ui.clearTags(); this.ui.showTarget(null); this.ui.closeTopBar();
    this.pt.target = null; this.duel = null; this.martinT = 4;
    if (state.battle) set({ battle: false });
    const spawns = (map.data.web && map.data.web.spawns) || [];
    const forMap = map;
    const made = await Promise.all(spawns.map(sp => this.makeMon(sp, 'wild').catch(e => { this.c.engine.ev('error', { e: e.message }); return null; })));
    if (forMap !== this.map) return;
    this.mons = made.filter(Boolean);
    this.ev('spawned', { n: this.mons.length, map: map.data.id });
  }
  async makeMon(sp, team) {
    const R0 = RULES.monsters[sp.model];
    if (!R0) throw new Error('monster rules not found: ' + sp.model);
    const a = await Slime.create(sp.model);
    a.object.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(a.object);
    const m = { def: { id: sp.id, model: sp.model, name: R0.name, level: R0.level }, rules: R0, actor: a, object: a.object, height: bb.max.y - bb.min.y,
      team, home: { x: sp.x, z: sp.z }, x: sp.x, z: sp.z, y: this.map.getHeight(sp.x, sp.z), yaw: Math.PI, hp: R0.hp, maxHp: R0.hp,
      aggro: false, dead: false, respawnT: 0, wanderT: 1 + this.rng() * 3, wt: null, actT: 0, phase: null, hitT: 0, dieT: 0 };
    this.place(m);
    this.c.scene.add(m.object);
    return m;
  }
  place(m) { m.object.position.set(-m.x, m.y, m.z); m.object.rotation.set(0, m.yaw, 0); }
  move(o, dx, dz) {
    const map = this.map; let moved = false;
    if (dx && map.canStand(o.x + dx, o.z, o.y)) { o.x += dx; moved = true; }
    if (dz && map.canStand(o.x, o.z + dz, o.y)) { o.z += dz; moved = true; }
    return moved;
  }
  alive(team) { return this.mons.filter(m => !m.dead && !m.trapped && (!team || m.team === team)); }
  replay(actor, key) { actor.cur = null; actor.play(key, 0.06); }

  // ---- lệnh của người chơi (Space / chuột trái / nút đánh): chọn mục tiêu, đồng hành lao vào. Không có gì thì trả false.
  command(aim) {
    if (this.duel && this.duel.phase !== 'fight') return false;
    if (this.fainted) return false;   // slime ngất không đánh (EquipMonsterFailCode.MONSTER_HP_ZERO)
    const P = this.c.P, list = this.alive(this.duel ? 'B' : 'wild');
    let best = null, bd = Infinity;
    if (aim) for (const m of list) { const d = Math.hypot(m.x - aim.x, m.z - aim.z); if (d < 3 && d < bd) { bd = d; best = m; } }
    if (!best) for (const m of list) { const d = Math.hypot(m.x - P.x, m.z - P.z); if (d < RULES.engageRange && d < bd) { bd = d; best = m; } }
    if (!best) return false;
    this.engage(best, true);
    return true;
  }
  engage(m, byPlayer) {
    const pt = this.pt;
    if (pt.target !== m) { pt.target = m; pt.phase = null; pt.actT = 0; }
    m.aggro = true;
    if (m.team === 'wild' && this.c.engine.roster.discover(m.def.model)) this.ev('discover', { model: m.def.model });   // MonsterDexDegree Discover
    if (!state.battle) set({ battle: true });
    if (byPlayer) this.flashBeam(BEAM_COL);
    this.ev('engage', { id: m.def.id, by: byPlayer ? 'player' : 'auto' });
  }
  flashBeam(col) { this.beam.material.color.setHex(col); this.beamT = RULES.beam; }
  // Return (huýt sáo): dừng trận, đồng hành về cạnh người chơi, slime hoang bỏ đuổi
  recall() {
    const pt = this.pt;
    pt.target = null; pt.phase = null; pt.pending = null; pt.recallT = 1.2;
    for (const m of this.mons) if (m.team === 'wild' && m.aggro) { m.aggro = false; m.phase = null; m.wt = { x: m.home.x, z: m.home.z }; }
    if (state.battle) set({ battle: false });
    this.ev('recall');
    this.pushParty(true);
  }

  // ---- đấu tay đôi với Rudga (5:09-5:36): gọi sau khi game.js đã chuyển sang bản đồ rudga_arena
  async startDuel() {
    const web = this.map.data.web || {}, b = web.teamB || { x: 36.5, z: 15.5 };
    const m = await this.makeMon({ id: 'rudga_slime', model: 'SL_Slime_Water', x: b.x - 1.2, z: b.z + 0.8 }, 'B');
    m.yaw = yawOf(-1, 1);
    this.mons.push(m);
    const S = this.c.S, P = this.c.P;
    S.x = P.x + 1.0; S.z = P.z - 0.8; S.y = this.map.getHeight(S.x, S.z);
    this.duel = { t: 0, phase: 'vs', time: RULES.duel.time, said: 0, ended: false };
    const thumbP = this.c.hud.el.playerThumb;
    this.ui.topBar(
      { level: this.c.engine.save.level, name: state.player.name, player: thumbP, slime: this.slimeIcon(this.rec.typeId) },
      { name: 'Rudga', player: this.npcIcon('NPC_Larus_Bigman_3'), slime: this.slimeIcon('SL_Slime_Water') });
    this.ui.versus(state.player.name, 'Rudga', RULES.duel.splash);   // sau thanh trên: nền mờ phủ cả thanh (5:18)
    this.ev('duel', { phase: 'vs' });
  }
  slimeIcon(id) { return assetUrl('img/sl/' + id + '.webp'); }
  npcIcon(id) { return assetUrl('img/npc/' + id + '.webp'); }
  duelTick(dt) {
    const D = this.duel; if (!D || D.ended) return;
    D.t += dt;
    const R0 = RULES.duel, tCount = R0.splash, tFight = R0.splash + R0.count;
    if (D.phase === 'vs' && D.t >= tCount) { D.phase = 'count'; D.shown = 0; }
    if (D.phase === 'count') {
      const k = Math.floor(D.t - tCount);
      if (k >= D.shown && k < R0.count) { this.ui.countdown(String(R0.count - k)); D.shown = k + 1; this.c.audio.play('ui_common_dropdown_open'); this.ev('duel', { phase: 'count', n: R0.count - k }); }
      if (D.t >= tFight) {
        D.phase = 'fight'; this.ui.countdown('Start'); this.ev('duel', { phase: 'fight' });
        const e = this.alive('B')[0]; if (e) { e.aggro = true; this.engage(e, false); }
      }
    }
    if (D.phase === 'fight') {
      D.time -= dt; this.ui.setTimer(D.time);
      // bóng thoại Rudga (5:33, 5:36) [THẤY], cách nhau RULES.duel.bubble
      const rud = this.c.getNpc('Rudga');
      const lines = ['ru.duel1', 'ru.duel2'];
      if (rud && D.said < lines.length && D.t >= tFight + 1.5 + D.said * (R0.bubble + 1)) { this.ui.bubble(rud.object, rud.height, L(lines[D.said]), R0.bubble); D.said++; }
      const e = this.alive('B')[0];
      // đồng hành bị huýt về giữa trận: trận vẫn chạy, slime đối thủ vẫn đuổi
      if (!this.pt.target && e && !(this.pt.recallT > 0)) this.engage(e, false);
      this.ui.setAlive(this.hp > this.maxHp * RULES.partner.faintHp + 0.01 || !D.lost, !!e);
      if (!e) this.endDuel(true);
      else if (D.time <= 0) this.endDuel(false);
    }
    if (D.phase === 'vs' || D.phase === 'count') this.ui.setTimer(0);   // [THẤY 5:18, 5:21] "00:00" trước khi vào trận, 04:59 ở 5:24
  }
  endDuel(win) {
    const D = this.duel; if (!D || D.ended) return;
    D.ended = true; D.win = win;
    this.ui.setAlive(win, !win);
    this.ui.result(win);
    this.pt.target = null; if (state.battle) set({ battle: false });
    this.ev('duel', { phase: 'end', win });
    this.pushParty(true);
    setTimeout(() => { this.ui.closeTopBar(); const r = this.ui.top.querySelector('[data-hud="pvpResult"]'); if (r) r.remove(); this.c.onDuelEnd(win); }, RULES.duel.endDelay * 1000);
  }

  // ---- sát thương (khuôn DamageData{gameIndex, damage, damageType})
  hitMon(m, dmg) {
    if (m.dead) return;
    if (m.t0 == null) m.t0 = this.clock || 0;   // F5b: giờ game của đòn đầu tiên trúng con này (thời lượng trận trong sự kiện kill)
    m.hp = Math.max(0, m.hp - dmg.damage);
    m.hitT = 0.25; m.aggro = true;
    if (!m.phase) this.replay(m.actor, 'Hit');
    this.c.audio.play('sfx_hit_NONE_S', { gain: 0.8 });
    this.ev('damage', { id: m.def.id, ...dmg, hp: m.hp });
    if (m.hp <= 0) this.kill(m);
  }
  hitPartner(dmg) {
    this.hp = Math.max(0, this.hp - dmg.damage);
    this.c.slime.cur === 'Walk' || this.replay(this.c.slime, 'Hit');
    this.c.audio.play('sfx_hit_NONE_S', { gain: 0.6 });
    this.ev('partnerHit', { ...dmg, hp: this.hp });
    if (this.hp <= 0) {
      // F3: ngất (Icon_Faint, "Fainted"): ô slime xám, không đánh tới khi hồi (thuốc / Allen / nghỉ tới faintHp x6 máu [ĐỀ XUẤT])
      this.hp = 0; this.fainted = true;
      this.ev('faint');
      if (this.duel && !this.duel.ended) { this.duel.lost = true; this.endDuel(false); }
      else this.recall();
    }
  }
  kill(m) {
    m.dead = true; m.dieT = 0.45; m.phase = null; m.respawnT = RULES.respawn;
    this.c.audio.play('sfx_die_default');
    this.ev('kill', { id: m.def.id, model: m.def.model, team: m.team, fight: +((this.clock || 0) - (m.t0 ?? this.clock ?? 0)).toFixed(2) });
    if (this.pt.target === m) { this.pt.target = null; this.pt.phase = null; this.pt.linger = 1.0; }
    this.reward(m);
  }
  reward(m) {
    const E = this.c.engine, st = this.c.story, R0 = m.rules, name = this.partnerName;
    // EXP slime (6:06 "Roasted Slime EXP + 2"), lên cấp slime (6:27 "Roasted Lv2")
    if (R0.exp > 0) {
      this.exp += R0.exp;
      st.log(name + ' ' + L('ui.slimeExp'), '+ ' + R0.exp, 'img/sl/' + this.rec.typeId + '.webp');
      this.ev('slimeExp', { n: R0.exp });
    }
    while (this.exp >= RULES.partner.expToNext(this.lv)) {
      this.exp -= RULES.partner.expToNext(this.lv); this.lv++;
      const f = this.hp / this.maxHp, fm = this.mp / this.maxMp;
      this.maxHp = RULES.partner.hp(this.lv); this.maxMp = RULES.partner.mp(this.lv); this.hp = f * this.maxHp; this.mp = fm * this.maxMp;
      this.ui.logTitle(st, name + '\nLv' + this.lv);
      this.c.audio.play('ui_levelUp');
      this.ev('slimeLevel', { lv: this.lv });
    }
    if (m.team === 'wild') {
      // nhiệm vụ 7 "Defeat Junior Floralime 0/2" + rơi "Small Slime Fragment" (item_type 215, dropRate 0.7)
      E.onKill(m.def.model);   // F4: mọi nhiệm vụ có mục tiêu kill khớp loài (q7, Martin q8, Patrol q11)
      if (E.roster.discover(m.def.model)) this.ev('discover', { model: m.def.model });
      const F0 = META.fragment;
      if (this.rng() < F0.rate) {
        E.give(F0.item, F0.min);
        E.obj('q7', 'frag');
        this.ev('drop', { item: F0.item });
      }
    }
    this.pushParty(true);
  }

  // ---- quả cầu năng lượng (attack_type Ranged Single, Linear, moveSpeed)
  shoot(from, m, speed, dmg, col, size, fx) {
    const p0 = { x: from.x, z: from.z, y: from.y + 0.45 };
    const ball = fx && makeBall(fx, size);
    if (ball) {
      ball.obj.position.set(-p0.x, p0.y, p0.z); this.c.scene.add(ball.obj);
      this.fx.push({ kind: 'ball', obj: ball.obj, ball, p: p0, m, speed, dmg, col, hit: fx.replace(/RangeAtk_(\w+)_EnergyBall/, 'Hit_$1') });
      return;
    }
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16 * size, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32 * size, 12, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core, glow); g.renderOrder = 4;
    const p = { x: from.x, z: from.z, y: from.y + 0.45 };
    g.position.set(-p.x, p.y, p.z); this.c.scene.add(g);
    this.fx.push({ kind: 'ball', obj: g, p, m, speed, dmg, col });
  }
  hitFx(x, y, z, col, prefab) {
    const h = prefab && makeHit(prefab, new THREE.Vector3(-x, y + 0.5, z));
    if (h) { this.c.scene.add(h.obj); this.fx.push({ kind: 'hit', obj: h.obj, h }); return; }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.32, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(-x, y + 0.5, z); ring.lookAt(this.c.camera ? this.c.camera().position : new THREE.Vector3(0, 100, -100));
    this.c.scene.add(ring); this.fx.push({ kind: 'ring', obj: ring, t: 0 });
  }

  // ---- mỗi khung. Trả true khi đang lái slime đồng hành (game.js bỏ qua đi theo).
  update(dt, cam) {
    this.clock = (this.clock || 0) + dt;
    if (!this.map) return false;
    const S = this.c.S, P = this.c.P, slime = this.c.slime, pt = this.pt, PR = RULES.partner;
    this.duelTick(dt);
    // hồi MP; hồi máu khi không đánh
    this.mp = Math.min(this.maxMp, this.mp + PR.mpRegen * dt);
    if (!pt.target) this.hp = Math.min(this.maxHp, this.hp + PR.hpRegenIdle * this.maxHp * dt);
    if (this.fainted && this.hp >= this.maxHp * PR.faintHp * 6) { this.fainted = false; this.ev('revive'); this.pushParty(true); }
    pt.skillCd = Math.max(0, pt.skillCd - dt * 1000);
    pt.recallT = Math.max(0, (pt.recallT || 0) - dt);
    const sv = this.c.engine.roster.active();
    if (sv && this._w && (sv.uid !== this._w.uid || sv.hp !== this._w.hp || sv.mp !== this._w.mp || sv.stamina !== this._w.st)) this.loadPartner();   // chữa / thuốc / đổi slime vừa ghi
    if ((pt.syncT -= dt) <= 0) { pt.syncT = 0.3; this.pushParty(false); }

    // slime hoang
    for (const m of this.mons) this.monTick(m, dt);

    // tự nhận mục tiêu: CombatMode bật, hoặc có slime hoang đang gây hấn gần người chơi
    if (!pt.target && !(pt.recallT > 0) && !this.duel) {
      let best = null, bd = Infinity;
      for (const m of this.alive('wild')) {
        const d = Math.hypot(m.x - P.x, m.z - P.z);
        if ((m.aggro || state.autoBattle) && d < RULES.autoRange && d < bd) { bd = d; best = m; }
      }
      if (best) this.engage(best, false);
    }
    if (!pt.target && pt.linger > 0 && (pt.linger -= dt) <= 0 && state.battle && !this.duel) set({ battle: false });

    let driving = false;
    const m = pt.target;
    if (m && !m.dead) {
      driving = true;
      const dx = m.x - S.x, dz = m.z - S.z, d = Math.hypot(dx, dz);
      if (pt.phase) {
        S.yaw = lerpAngle(S.yaw, yawOf(dx, dz), Math.min(1, dt * 12));
        pt.actT -= dt * 1000;
        if (pt.phase === 'pre' && pt.actT <= 0) {
          const k = pt.pending;
          this.shoot(S, m, k.speed, k.dmg, k.col, k.skill ? 1.5 : 1, k.fx);
          if (k.skill) this.c.audio.play(k.sound, { gain: 0.7 }); else this.c.audio.play('sfx_defaultattack_MAGICBALL', { gain: 0.5 });
          pt.phase = 'post'; pt.actT = k.post;
        } else if (pt.phase === 'post' && pt.actT <= 0) { pt.phase = null; pt.pending = null; }
        slime.cur === (pt.anim || 'Attack') || slime.cur === 'Hit' || this.replay(slime, pt.anim || 'Attack');
      } else if (d > PR.range) {
        const v = PR.chaseSpeed, k = Math.min(1, v * dt / d);
        if (!this.move(S, dx * k, dz * k)) { S.x += dx * k; S.z += dz * k; }
        S.yaw = lerpAngle(S.yaw, yawOf(dx, dz), Math.min(1, dt * 10));
        slime.play('Walk', 0.12);
      } else {
        // trong tầm: kỹ năng khi hết hồi chiêu và đủ MP (META.skill), không thì đòn thường (META.defaultAttack)
        const sk = META.skill[this.elem], da = META.defaultAttack[this.elem] || META.defaultAttack[20002];
        const col = ELEM_COL[this.elem] || 0xffffff;
        const atk = PR.atk(this.lv);
        if (sk && pt.skillCd <= 0 && this.mp >= sk.mp) {
          this.mp -= sk.mp; pt.skillCd = sk.cd;
          pt.pending = { skill: true, speed: sk.speed, dmg: rollDamage(atk, PR.skillMult, this.rng), col, post: sk.post, sound: sk.sound, fx: da.fx || elemFx(this.elem) };
          pt.phase = 'pre'; pt.actT = sk.pre; pt.anim = slime.actions.Skill ? 'Skill' : 'Attack';
          this.flashBeam(BEAM_SKILL);
          this.ev('cast', { skill: sk.id, id: m.def.id });
        } else {
          pt.pending = { skill: false, speed: da.speed, dmg: rollDamage(atk, 1, this.rng), col, post: da.post, fx: da.fx || elemFx(this.elem) };
          pt.phase = 'pre'; pt.actT = da.pre; pt.anim = 'Attack';
          this.ev('attack', { action: da.action, id: m.def.id });
        }
        this.st = Math.max(0, this.st - PR.staminaPerAttack);
        this.replay(slime, pt.anim);
      }
    } else if (m && m.dead) { pt.target = null; }
    if (driving) {
      const sy = this.map.getHeight(S.x, S.z); if (sy > -100) S.y += (sy - S.y) * Math.min(1, dt * 12);
      S.moving = slime.cur === 'Walk';
    }

    // đạn, vòng trúng
    for (const f of this.fx) {
      if (f.kind === 'ball') {
        const t = f.m, tx = t.x, tz = t.z, ty = t.y + 0.45, dx = tx - f.p.x, dz = tz - f.p.z, dy = ty - f.p.y, d = Math.hypot(dx, dz, dy), step = f.speed * dt;
        if (d <= step || t.dead) {
          f.done = true; this.c.scene.remove(f.obj);
          if (f.ball) { const tr = f.ball.dispose(this.c.scene); if (tr) this.fx.push({ kind: 'trail', list: tr }); }
          if (!t.dead) { this.hitMon(t, f.dmg); this.hitFx(tx, t.y, tz, f.col, f.ball && f.hit); }
        } else {
          f.p.x += dx / d * step; f.p.z += dz / d * step; f.p.y += dy / d * step; f.obj.position.set(-f.p.x, f.p.y, f.p.z);
          if (f.ball && cam) { const gy = this.map.getHeight(f.p.x, f.p.z); f.ball.update(dt, cam, this.c.scene, gy > -100 ? gy : undefined); }
        }
      } else if (f.kind === 'hit') {
        if (!cam || f.h.update(dt, cam)) { f.done = true; this.c.scene.remove(f.obj); }
      } else if (f.kind === 'trail') {
        if (!cam || fadeTrail(f.list, dt, cam, this.c.scene)) { f.done = true; f.list.forEach(q => this.c.scene.remove(q)); }
      } else if (f.kind === 'ring') {
        f.t += dt; const s = 1 + f.t * 6; f.obj.scale.set(s, s, s); f.obj.material.opacity = Math.max(0, 0.9 - f.t * 3);
        if (f.t > 0.3) { f.done = true; this.c.scene.remove(f.obj); f.obj.geometry.dispose(); }
      }
    }
    this.fx = this.fx.filter(f => !f.done);

    // tia lệnh người chơi -> đồng hành (9:00, 9:30)
    if (this.beamT > 0) {
      this.beamT -= dt;
      const a = new THREE.Vector3(-P.x, P.y + 0.7, P.z), b = new THREE.Vector3(-S.x, S.y + 0.45, S.z);
      this.beam.position.copy(a); this.beam.lookAt(b); this.beam.scale.set(1, 1, a.distanceTo(b));
      this.beam.material.opacity = Math.min(0.9, this.beamT / RULES.beam * 1.6);
      this.beam.visible = true;
    } else this.beam.visible = false;

    // Martin say rượu: bóng thoại khi người chơi lại gần (6:36)
    const mt = this.c.getNpc('Martin');
    if (mt && (this.martinT -= dt) <= 0) {
      this.martinT = 9;
      if (Math.hypot(mt.def.x - P.x, mt.def.z - P.z) < 9) this.ui.bubble(mt.object, mt.height, L('mt.b1'), 3);
    }

    this.ui.frame(cam, this.mons);
    this.ui.showTarget(pt.target && !pt.target.dead && !this.duel ? pt.target : null, m0 => this.c.engine.roster.degree(m0.def.model));   // trận đấu tay đôi không có ô mục tiêu (5:24-5:36)
    return driving;
  }

  monTick(m, dt) {
    const S = this.c.S, P = this.c.P, R0 = m.rules, W0 = META.wildAttack, a = m.actor;
    if (m.dead) {
      if (m.dieT > 0) { m.dieT -= dt; const s = Math.max(0.01, m.dieT / 0.45); m.object.scale.setScalar(s); if (m.dieT <= 0) m.object.visible = false; }
      if (m.team === 'wild' && (m.respawnT -= dt) <= 0) {
        m.dead = false; m.hp = m.maxHp; m.t0 = null; m.x = m.home.x; m.z = m.home.z; m.y = this.map.getHeight(m.x, m.z); m.aggro = false; m.phase = null;
        m.object.visible = true; m.object.scale.setScalar(0.01); m.spawnT = 0.4; a.play('Idle', 0);
        this.ev('respawn', { id: m.def.id });
      }
      a.update(dt); this.place(m);
      return;
    }
    if (m.trapped) { a.update(dt); return; }   // F3: đang trong Cube (js/combat/tame.js)
    if (m.spawnT > 0) { m.spawnT -= dt; m.object.scale.setScalar(Math.min(1, 1 - m.spawnT / 0.4 + 0.01)); }
    m.hitT = Math.max(0, m.hitT - dt);
    const dS = Math.hypot(S.x - m.x, S.z - m.z), dP = Math.hypot(P.x - m.x, P.z - m.z);
    if (!m.aggro && (dS < RULES.aggroRange || dP < RULES.aggroRange) && m.team === 'wild' && !(this.pt.recallT > 0)) { m.aggro = true; this.ev('aggro', { id: m.def.id }); }
    let moving = false;
    if (m.aggro) {
      // bỏ đuổi khi rời chỗ sinh quá xa (chỉ slime hoang)
      if (m.team === 'wild' && Math.hypot(m.x - m.home.x, m.z - m.home.z) > RULES.leash) {
        m.aggro = false; m.phase = null; m.hp = m.maxHp; m.t0 = null; m.wt = { x: m.home.x, z: m.home.z };
        if (this.pt.target === m) this.recall();
      } else if (m.phase) {
        m.actT -= dt * 1000;
        m.yaw = lerpAngle(m.yaw, yawOf(S.x - m.x, S.z - m.z), Math.min(1, dt * 10));
        if (m.phase === 'pre' && m.actT <= 0) {
          // attack_type 1: Sector bán kính 3 ô, 90 độ trước mặt
          const fx = -Math.sin(m.yaw), fz = Math.cos(m.yaw), dx = S.x - m.x, dz = S.z - m.z, d = Math.hypot(dx, dz) || 1;
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) * 180 / Math.PI;
          if (d <= W0.radius && ang <= W0.angle / 2 + 20) this.hitPartner(rollDamage(R0.atk, 1, this.rng));
          m.phase = 'post'; m.actT = W0.post;
        } else if (m.phase === 'post' && m.actT <= 0) m.phase = null;
      } else if (dS > 1.6) {
        const v = R0.chase, k = Math.min(1, v * dt / dS);
        this.move(m, (S.x - m.x) * k, (S.z - m.z) * k);
        m.yaw = lerpAngle(m.yaw, yawOf(S.x - m.x, S.z - m.z), Math.min(1, dt * 8)); moving = true;
      } else {
        m.phase = 'pre'; m.actT = W0.pre; this.replay(a, 'Attack');
        this.ev('monAttack', { id: m.def.id });
      }
    } else {
      // đi lang thang quanh chỗ sinh
      if (m.wt) {
        const dx = m.wt.x - m.x, dz = m.wt.z - m.z, d = Math.hypot(dx, dz);
        if (d < 0.2) m.wt = null;
        else {
          const k = Math.min(1, R0.speed * dt / d);
          if (!this.move(m, dx * k, dz * k)) m.wt = null;
          m.yaw = lerpAngle(m.yaw, yawOf(dx, dz), Math.min(1, dt * 6)); moving = true;
        }
      } else if ((m.wanderT -= dt) <= 0) {
        m.wanderT = 2 + this.rng() * 3;
        const an = this.rng() * Math.PI * 2, r = this.rng() * RULES.wander;
        const tx = m.home.x + Math.cos(an) * r, tz = m.home.z + Math.sin(an) * r;
        if (this.map.canStand(tx, tz)) m.wt = { x: tx, z: tz };
      }
      if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.05 * dt);
    }
    if (!m.phase && !(a.cur === 'Hit' && m.hitT > 0)) a.play(moving ? 'Walk' : 'Idle', 0.15);
    const gy = this.map.getHeight(m.x, m.z); if (gy > -100) m.y += (gy - m.y) * Math.min(1, dt * 12);
    a.update(dt); this.place(m);
  }
}
