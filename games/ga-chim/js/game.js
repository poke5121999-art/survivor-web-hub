// Game state and rules: title -> intro -> playing <-> paused -> dead | complete.
// Mission: restore power at three switch cabins (hold E under fire), then reach the lit locomotive.
// Holdout: endless waves around the depot, count = min(5 + 2n, 30), best score saved.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, rng } from './rng.js';
import { RIFLE } from './weapon.js';

export const DIFF = {
  standard: { dmg: 1.0, hp: 100, label: 'Thường' },
  hard: { dmg: 1.35, hp: 100, label: 'Khó' },
  brutal: { dmg: 1.8, hp: 80, label: 'Tàn khốc' },
};

export class Events {
  constructor() { this.h = new Map(); }
  on(t, f) { if (!this.h.has(t)) this.h.set(t, []); this.h.get(t).push(f); }
  emit(t, p) { for (const f of this.h.get(t) || []) { try { f(p); } catch (e) { console.error(`[events] handler for "${t}" threw`, e); } } }
}

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(G) {
    this.G = G; this.state = 'title'; this.mode = 'mission'; this.r = rng('director');
    this.objectives = G.level.objectives.map((o) => ({ ...o, pos: new THREE.Vector3().setFromMatrixPosition(o.m), done: false, progress: 0 }));
    this.loco = G.level.lamps.find((l) => l.id === 'loco');
    this.hold = 0; this.waveT = 0; this.wave = 0; this.score = 0; this.hurt = 0; this.combat = 0; this.msgT = 0;
    this.spawnPoints = [[-50, -60], [-50, -100], [26, -40], [26, -150], [-40, 50], [10, 55], [-20, -190], [20, -190], [-50, 0], [28, 0]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.bindUI();
    const E = G.events;
    E.on('player:hit', (h) => this.onHit(h));
    E.on('enemy:dead', ({ e }) => { this.score += e.type === 'crawler' ? 100 : 150; if (e.type !== 'raider') G.audio.play('boom', { pos: e.pos, vol: 0.6 }); else G.audio.play('hurt', { pos: e.pos, rate: 0.7 }); this.hitmark(true); });
    E.on('enemy:alert', (e) => G.audio.play(e.type === 'crawler' ? 'screech' : 'servo', { pos: e.pos }));
    E.on('crawler:tell', (e) => G.audio.play('screech', { pos: e.pos, rate: 1.2 }));
    E.on('crawler:step', (p) => G.audio.play('click', { pos: p, vol: 0.35, rate: 0.6 }));
    E.on('drone:tell', (e) => G.audio.play('servo', { pos: e.pos, rate: 1.6 }));
    E.on('drone:shot', (s) => { G.audio.play('rifle', { pos: s.from, rate: 1.35, vol: 0.45 }); G.weapon.tracer(s.from, s.to); if (!s.hit) { const d = s.to.clone().sub(s.from).normalize(); const hit = G.grid.ray(s.from, d, 80); if (hit) G.fx.impact(s.from.clone().addScaledVector(d, hit.t), hit.n, 'metal'); } });
    E.on('drone:crash', (e) => G.audio.play('boom', { pos: e.pos, vol: 0.5 }));
    E.on('raider:shot', (s) => { G.audio.play('rifle', { pos: s.from, vol: 0.55, rate: 1.1 }); G.weapon.tracer(s.from, s.to); G.fx.add(0, s.from, null, 0.18, new THREE.Color(6, 3, 1), 0.05); if (!s.hit) { const d = s.to.clone().sub(s.from).normalize(); const hit = G.grid.ray(s.from, d, 80); if (hit) G.fx.impact(s.from.clone().addScaledVector(d, hit.t), hit.n, 'metal'); } });
    E.on('raider:tell', (e) => G.audio.play('click', { pos: e.pos, rate: 0.8 }));
    E.on('raider:step', (p) => G.audio.play('step_gravel', { pos: p, vol: 0.4 }));
  }
  bindUI() {
    const G = this.G;
    this.diff = 'standard';
    try { const s = JSON.parse(localStorage.getItem('gachim.settings.v1') || '{}'); if (s.diff) this.diff = s.diff; if (s.sens) G.player.sens = s.sens; if (s.vol !== undefined) G.audio.setVolume(s.vol); } catch (e) {}
    G.diff = DIFF[this.diff];
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { this.mode = b.dataset.mode; this.syncSeg(); }));
    document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { this.diff = b.dataset.diff; G.diff = DIFF[this.diff]; this.save(); this.syncSeg(); }));
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { try { const s = JSON.parse(localStorage.getItem('gachim.settings.v1') || '{}'); s.q = b.dataset.q; localStorage.setItem('gachim.settings.v1', JSON.stringify(s)); } catch (e) {} location.reload(); }));
    $('btnStart').addEventListener('click', () => this.start());
    $('btnResume').addEventListener('click', () => this.lock());
    $('btnRetry').addEventListener('click', () => location.reload());
    $('btnTitle').addEventListener('click', () => location.reload());
    $('sens').addEventListener('input', (e) => { G.player.sens = +e.target.value / 10000; this.save(); });
    $('vol').addEventListener('input', (e) => { G.audio.setVolume(+e.target.value / 100); this.save(); });
    $('sens').value = Math.round(G.player.sens * 10000); $('vol').value = Math.round(G.audio.vol * 100);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === G.renderer.domElement;
      if (!locked && this.state === 'playing' && !G.params.nolock) this.pause();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.state === 'paused') this.lock(); });
    this.syncSeg();
    $('best').textContent = this.best() ? `Kỷ lục thủ thành: ${this.best()} điểm` : '';
    const qn = G.quality.name; document.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === qn));
  }
  syncSeg() {
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.mode));
    document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === this.diff));
    $('modeHint').textContent = this.mode === 'mission' ? 'Bật điện ba gác ghi rồi lên đầu máy thoát khỏi ga. Khoảng sáu phút.' : 'Giữ bãi ga trước từng đợt máy móc. Đợt sau đông hơn đợt trước.';
  }
  save() { try { const s = JSON.parse(localStorage.getItem('gachim.settings.v1') || '{}'); Object.assign(s, { diff: this.diff, sens: this.G.player.sens, vol: this.G.audio.vol }); localStorage.setItem('gachim.settings.v1', JSON.stringify(s)); } catch (e) {} }
  best() { try { return +(localStorage.getItem('gachim.best.v1') || 0); } catch (e) { return 0; } }
  lock() { const c = this.G.renderer.domElement; if (this.G.params.nolock) { this.resume(); return; } c.requestPointerLock && c.requestPointerLock(); setTimeout(() => { if (document.pointerLockElement === c) this.resume(); }, 80); }
  start() {
    const G = this.G;
    G.audio.start();
    G.player.hp = G.diff.hp; this.state = 'playing'; G.weapon.holder.visible = true;
    document.body.classList.remove('title'); document.body.classList.add('playing');
    this.lock(); this.resume();
    this.msg(this.mode === 'mission' ? 'GA CHÌM — 19:42. Mất điện toàn ga. Bật lại ba gác ghi.' : 'THỦ THÀNH. Đợt đầu đang tới.', 5);
    if (this.mode === 'mission') this.seedRoamers(); else this.waveT = 3;
    G.audio.play('sting', { vol: 0.6 });
  }
  seedRoamers() {
    const G = this.G; const pts = [[-10.4, -40, 'crawler'], [-13, -22, 'raider'], [-2, -70, 'crawler'], [-29, -60, 'drone'], [0.8, -58, 'raider'], [6, -100, 'crawler'], [-15.6, -110, 'raider'], [14, -140, 'drone'], [-30, -140, 'crawler'], [-2, -125, 'raider'], [-10.4, -95, 'raider']];
    for (const [x, z, t] of pts) G.enemies.spawn(t, new THREE.Vector3(x, 0, z));
  }
  resume() { if (this.state === 'paused') this.state = 'playing'; document.body.classList.remove('paused'); window.__paused = false; }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; document.body.classList.add('paused'); }
  msg(t, sec) { $('msg').textContent = t; $('msg').classList.add('on'); this.msgT = sec || 3; }
  hitmark(kill) { const h = $('hitmark'); h.classList.remove('on', 'kill'); void h.offsetWidth; h.classList.add('on'); if (kill) h.classList.add('kill'); }
  onHit(h) {
    const G = this.G; const P = G.player; if (P.dead || this.state !== 'playing') return;
    P.hp -= h.dmg; this.hurt = Math.min(1, this.hurt + h.dmg / 40); P.lastHit = G.t;
    G.audio.play('hurt');
    // damage direction arc
    const rel = h.from.clone().sub(P.pos); const a = Math.atan2(rel.x, -rel.z) + P.yaw;
    const arc = $('dmgdir'); arc.style.transform = `translate(-50%,-50%) rotate(${-a}rad)`; arc.classList.remove('on'); void arc.offsetWidth; arc.classList.add('on');
    if (P.hp <= 0) this.die();
  }
  die() {
    const G = this.G; G.player.dead = true; this.state = 'dead';
    document.body.classList.add('dead'); document.exitPointerLock && document.exitPointerLock();
    $('endTitle').textContent = 'BẠN ĐÃ NGÃ XUỐNG'; $('endSub').textContent = this.mode === 'mission' ? `Gác ghi đã bật: ${this.objectives.filter((o) => o.done).length}/3 · Hạ ${G.enemies.kills} máy` : `Đợt ${this.wave} · ${this.score} điểm`;
    if (this.mode === 'holdout' && this.score > this.best()) { try { localStorage.setItem('gachim.best.v1', String(this.score)); } catch (e) {} }
    G.audio.play('sting', { vol: 0.8, rate: 0.7 });
  }
  complete() {
    const G = this.G; this.state = 'complete'; document.body.classList.add('dead', 'won'); document.exitPointerLock && document.exitPointerLock();
    $('endTitle').textContent = 'ĐẦU MÁY ĐÃ RỜI GA'; $('endSub').textContent = `Hạ ${G.enemies.kills} máy · ${Math.round(G.t)} giây`;
    G.audio.play('sting', { vol: 0.9, rate: 1.25 });
  }
  restore(o) {
    const G = this.G; o.done = true;
    const lamp = G.level.lamps.find((l) => l.kind === 'cabin' && l.id === o.id); if (lamp) G.lights.setLampPower(lamp, 1);
    G.audio.play('sting', { vol: 0.7 }); this.score += 500;
    const left = this.objectives.filter((x) => !x.done).length;
    if (left) this.msg(`Gác ghi ${o.id} có điện. Còn ${left}.`, 4);
    else { this.msg('Cả ba gác ghi đã có điện. Đầu máy đang sáng đèn — lên buồng lái!', 6); if (this.loco) G.lights.setLampPower(this.loco, 1); G.level.locoLit && G.level.locoLit(); }
    // a counterattack answers every restored cabin
    this.spawnWave(3 + (3 - left) * 2, o.pos);
  }
  spawnWave(n, near) {
    const G = this.G;
    const pts = this.spawnPoints.slice().sort((a, b) => (near ? a.distanceTo(near) - b.distanceTo(near) : this.r() - 0.5)).filter((p) => p.distanceTo(G.player.pos) > 25).slice(0, 4);
    for (let i = 0; i < n; i++) {
      const p = pts[i % pts.length].clone().add(new THREE.Vector3(this.r.range(-4, 4), 0, this.r.range(-4, 4)));
      const rr = this.r(); const e = G.enemies.spawn(rr < 0.25 ? 'drone' : rr < 0.6 ? 'raider' : 'crawler', p); e.alert = 1; e.state = 'hunt';
    }
  }
  update(dt) {
    const G = this.G; const P = G.player;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('msg').classList.remove('on'); }
    this.hurt = damp(this.hurt, 0, 1.2, dt);
    G.postFx.hurt = Math.max(this.hurt, P.hp < 35 ? 0.35 + 0.15 * Math.sin(G.t * 4) : 0);
    if (this.state !== 'playing') return;
    // regen after 5 s without damage
    if (G.t - (P.lastHit || -9) > 5 && P.hp < G.diff.hp) P.hp = Math.min(G.diff.hp, P.hp + dt * 8);
    // interaction
    let prompt = '';
    const eKey = P.keys.has('KeyE');
    if (this.mode === 'mission') {
      for (const o of this.objectives) {
        if (o.done) continue;
        const d = o.pos.distanceTo(P.pos);
        if (d < 2.4) {
          prompt = `Giữ [E] để bật điện gác ghi ${o.id}`;
          if (eKey) { o.progress = Math.min(1, o.progress + dt / 4); if (Math.floor(o.progress * 8) !== Math.floor((o.progress - dt / 4) * 8)) G.audio.play('click', { vol: 0.6 }); if (o.progress >= 1) this.restore(o); }
          $('holdbar').style.setProperty('--p', o.progress);
        }
      }
      if (this.objectives.every((o) => o.done) && this.loco) {
        const cab = this.loco.pos.clone(); cab.y = 0;
        const d = Math.hypot(P.pos.x - (-2), P.pos.z - (-165 - 5)) ;
        if (d < 4.5) { prompt = 'Giữ [E] để lên buồng lái'; if (eKey) { this.hold += dt; if (this.hold > 1.5) this.complete(); } else this.hold = 0; $('holdbar').style.setProperty('--p', this.hold / 1.5); }
      }
    } else {
      this.waveT -= dt;
      if (this.waveT <= 0 && G.enemies.alive === 0) { this.wave++; const n = Math.min(5 + 2 * this.wave, 30); this.spawnWave(n); this.msg(`ĐỢT ${this.wave} — ${n} máy`, 3); this.waveT = 4; }
    }
    $('prompt').textContent = prompt; document.body.classList.toggle('prompting', !!prompt);
    document.body.classList.toggle('holding', !!prompt && eKey);
    // combat intensity for music
    const near = G.enemies.list.filter((e) => e.alive && e.state === 'hunt' && e.pos.distanceTo(P.pos) < 40).length;
    this.combat = damp(this.combat, Math.min(1, near / 3), 1.5, dt);
    this.hud();
  }
  hud() {
    const G = this.G; const P = G.player; const W = G.weapon;
    $('ammo').textContent = W.ammo; $('reserve').textContent = W.reserve; $('wname').textContent = W.busy ? 'NẠP ĐẠN…' : RIFLE.name;
    $('hpfill').style.width = clamp(P.hp / G.diff.hp, 0, 1) * 100 + '%';
    const obj = $('objlist');
    if (this.mode === 'mission') {
      const all = this.objectives.every((o) => o.done);
      obj.innerHTML = this.objectives.map((o) => `<div class="obj ${o.done ? 'done' : ''}"><i></i>Gác ghi ${o.id}</div>`).join('') + `<div class="obj ${all ? '' : 'dim'}"><i></i>Lên đầu máy</div>`;
    } else obj.innerHTML = `<div class="obj"><i></i>Đợt ${this.wave} · ${this.score} điểm</div><div class="obj dim"><i></i>Còn ${G.enemies.alive} máy</div>`;
    // objective markers projected on screen
    const marks = $('marks'); let html = '';
    const targets = this.mode === 'mission' ? (this.objectives.every((o) => o.done) ? [{ id: '⟶', pos: new THREE.Vector3(-2, 2.5, -170) }] : this.objectives.filter((o) => !o.done)) : [];
    for (const o of targets) {
      const p = o.pos.clone(); p.y += 2.6; const v = p.clone().project(G.camera);
      const behind = v.z > 1; let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - 40; }
      x = clamp(x, 30, innerWidth - 30); y = clamp(y, 60, innerHeight - 60);
      html += `<div class="mark" style="left:${x}px;top:${y}px"><b>${o.id}</b><span>${Math.round(o.pos.distanceTo(P.pos))} m</span></div>`;
    }
    marks.innerHTML = html;
    const sp = W.ads > 0.5 ? 0 : 10 + (W.bloom + (P.moving ? 0.6 : 0)) * 14;
    $('xhair').style.setProperty('--s', sp + 'px'); document.body.classList.toggle('ads', W.ads > 0.5);
  }
}
