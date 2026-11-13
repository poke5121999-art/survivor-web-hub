// Co-op over Unity Relay: up to 4 players in one fight.
// The host owns the world (zombies, waves, weather, soldiers) and streams a snapshot 15 times a
// second with the events of that interval. A guest walks and aims on its own machine, tests its own hits against the
// zombies it sees, and sends the hits, its pose and its actions; the host applies them and tells everyone the result.
// ?fakenet=1 swaps Relay for a BroadcastChannel so two tabs can play without network (tests).
import { hostRoom, joinRoom, listRooms } from './net/room.js';

const BZ = window.BZ;
const THREE = window.THREE;
const RATE = 15;
const FRAME = 1100;
const PEER_TIMEOUT = 8;
const enc = new TextEncoder(); const dec = new TextDecoder();

// JSON messages cut into frames of at most FRAME bytes: [index, count, id lo, id hi, ...]
class Framer {
  constructor() { this.id = 0; this.parts = new Map(); }
  pack(msg) {
    const body = enc.encode(JSON.stringify(msg)); const n = Math.max(1, Math.ceil(body.length / FRAME)); const id = (this.id = (this.id + 1) & 0xffff); const out = [];
    for (let i = 0; i < n; i++) { const c = body.subarray(i * FRAME, (i + 1) * FRAME); const f = new Uint8Array(4 + c.length); f[0] = i; f[1] = n; f[2] = id & 255; f[3] = id >> 8; f.set(c, 4); out.push(f); }
    return out;
  }
  unpack(from, f) {
    const i = f[0]; const n = f[1]; const body = f.subarray(4);
    if (n === 1) return JSON.parse(dec.decode(body));
    const key = from + ':' + (f[2] | (f[3] << 8)); const parts = this.parts.get(key) || []; parts[i] = body.slice(); this.parts.set(key, parts);
    if (parts.filter(Boolean).length < n) return null;
    this.parts.delete(key); const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; }
    return JSON.parse(dec.decode(all));
  }
}

// Same surface as RelayLink (send, broadcast, peers, hostId, onMessage, onPeer, onPeerLeft, onClose, drop, close).
function fakeLink(role, code) {
  const ch = new BroadcastChannel('bz-fakenet-' + code); const id = Math.random().toString(16).slice(2, 10);
  const L = { id, role, peers: new Set(), hostId: null, onMessage() {}, onPeer() {}, onPeerLeft() {}, onClose() {}, stats: { tx: 0 } };
  ch.onmessage = (e) => {
    const m = e.data; if (m.to && m.to !== id) return;
    if (m.k === 'hello' && role === 'host') { ch.postMessage({ k: 'ack', to: m.from, from: id }); return; }
    if (m.k === 'ack' && role === 'client' && !L.hostId) { L.hostId = m.from; L.peers.add(m.from); L.ready(); return; }
    if (m.k === 'bye') { if (L.peers.delete(m.from)) L.onPeerLeft(m.from); if (m.from === L.hostId) L.onClose('host left'); return; }
    if (m.k === 'msg') { if (!L.peers.has(m.from)) { L.peers.add(m.from); L.onPeer(m.from); } L.onMessage(m.from, new Uint8Array(m.data)); }
  };
  L.send = (to, payload) => { ch.postMessage({ k: 'msg', to, from: id, data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) }); L.stats.tx += payload.length; };
  L.broadcast = (payload) => { for (const p of L.peers) L.send(p, payload); };
  L.drop = (p) => L.peers.delete(p);
  L.close = () => { ch.postMessage({ k: 'bye', from: id }); ch.close(); };
  L.open = () => new Promise((resolve, reject) => {
    if (role === 'host') { resolve(L); return; }
    L.ready = () => resolve(L); ch.postMessage({ k: 'hello', from: id }); setTimeout(() => reject(new Error('no host on fakenet')), 4000);
  });
  return L;
}

BZ.makeCoop = (G) => {
  const fake = BZ.params.fakenet === '1';
  const C = { on: false, host: false, guest: false, me: 'h', code: '', framer: new Framer(), peers: new Map(), events: [], acts: [], hits: [], sendT: 0, room: null, link: null, status: '' };
  const v3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  C.v3 = v3;
  const nameOf = () => (G.settings.coopName || 'Người chơi').slice(0, 16);

  // ---------- other players: hero body, the gun they hold, a name tag ----------
  const avatars = new Map(); // pid -> avatar
  function tag(text, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const c = cv.getContext('2d');
    c.font = '900 26px ui-monospace, Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(128 - c.measureText(text).width / 2 - 10, 4, c.measureText(text).width + 20, 40);
    c.fillStyle = color; c.fillText(text, 128, 25);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6, 0.3, 1); s.renderOrder = 9; return s;
  }
  function avatar(pid, name, hero) {
    let a = avatars.get(pid);
    if (a && a.hero === hero && a.name === name) return a;
    if (a) G.scene.remove(a.root);
    const h = BZ.HEROES.find((x) => x.id === hero) || BZ.HEROES[3];
    const m = BZ.heroModel(h.id);
    const hand = m.handR;
    const label = tag(name, '#' + h.color.toString(16).padStart(6, '0')); label.position.y = 2.35; m.root.add(label);
    G.scene.add(m.root);
    a = { pid, name, hero, root: m.root, m, hand, weapon: null, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), yaw: 0, tyaw: 0, pitch: 0, shots: 0, phase: 0, swingT: 0, alive: true,
      target: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), shake: { v: 0 }, alive: true, remote: true, pid } };
    avatars.set(pid, a);
    return a;
  }
  function setWeapon(a, id) {
    if (a.weapon === id) return;
    a.weapon = id; a.eq = BZ.equipWeapon(a.m, id);
  }
  // pose row: [x, y, z, yaw, pitch, weapon index, shots, flags(1 alive, 2 sprint), hp]
  function applyPose(a, r) {
    a.tgt.set(r[0], r[1], r[2]); a.tyaw = r[3]; a.pitch = r[4]; setWeapon(a, G.weapons.ORDER[r[5]]);
    if (!a.init) { a.pos.copy(a.tgt); a.yaw = a.tyaw; a.init = true; }
    const shots = r[6]; const alive = !!(r[7] & 1);
    if (shots > a.shots && a.init) fireFx(a, Math.min(3, shots - a.shots));
    a.shots = shots; a.alive = alive; a.hp = r[8];
    a.target.alive = alive; a.target.pos.copy(a.tgt);
  }
  const muzzle = new THREE.Vector3(); const aimDir = new THREE.Vector3(); const rightV = new THREE.Vector3();
  function fireFx(a, n) {
    const W = BZ.WEAPONS[a.weapon]; if (!W) return;
    if (W.melee) {
      const t = performance.now() / 1000; if (t - (a.lastSwing || 0) > 0.7) a.combo = 0; a.lastSwing = t;
      for (let i = 0; i < n; i++) { a.pat = W.combo[(a.combo || 0) % W.combo.length]; a.combo = (a.combo || 0) + 1; }
      a.swingT = W.swing; G.audio.playAt(W.snd, a.pos, { gain: 0.6 }); return;
    }
    a.root.updateMatrixWorld(true);
    aimDir.set(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
    if (W.thrown) {
      // the real projectile, flying and sticking, hurting nobody: the thrower's own machine decides the hits
      const right = rightV.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
      a.swingT = W.throwT; a.hideT = W.hide; a.m.handR.getWorldPosition(muzzle); muzzle.addScaledVector(aimDir, 0.7);
      const lift = (0.5 * W.grav * (25 / W.speed) ** 2) / 25;
      for (let i = 0; i < n; i++) for (let j = 0; j < W.pellets; j++) {
        const dir = aimDir.clone().addScaledVector(right, W.pellets > 1 ? (j - (W.pellets - 1) / 2) * W.fan : 0); dir.y += lift; dir.normalize();
        G.weapons.cosmeticThrow(a.weapon, muzzle, dir);
      }
      G.audio.playAt(W.snd, a.pos, { gain: 0.5 }); return;
    }
    let side = 0;
    if (W.dual) { a.side = 1 - (a.side === undefined ? 1 : a.side); side = a.side; (side ? a.m.handL : a.m.handR).getWorldPosition(muzzle); muzzle.addScaledVector(aimDir, 0.55); if (side) a.kL = 6; else a.kR = 6; }
    else muzzle.set(a.pos.x, a.pos.y + 1.4, a.pos.z).addScaledVector(aimDir, 0.9);
    if (W.spinUp) a.spinT = 0.5;
    for (let i = 0; i < n; i++) {
      if (!W.rocket) { const end = muzzle.clone().addScaledVector(aimDir, 30).add(new THREE.Vector3(G.rng.range(-0.6, 0.6), G.rng.range(-0.4, 0.4), G.rng.range(-0.6, 0.6))); G.fx.tracer(muzzle.clone(), end); }
      G.fx.puff(muzzle, { glow: true, s0: 0.7, s1: 0.2, life: 0.06, c0: 0xfff0b0, c1: 0xffa040 });
    }
    G.fx.muzzle(muzzle); G.audio.playAt(W.snd, a.pos, { gain: 0.55 });
  }
  function animateAvatars(dt) {
    for (const a of avatars.values()) {
      const before = a.pos.clone();
      a.pos.lerp(a.tgt, Math.min(1, dt * 14)); if (a.pos.distanceTo(a.tgt) > 5) a.pos.copy(a.tgt);
      a.yaw += BZ.wrapAngle(a.tyaw - a.yaw) * Math.min(1, dt * 14);
      const sp = Math.hypot(a.pos.x - before.x, a.pos.z - before.z) / Math.max(dt, 1e-3);
      a.swingT = Math.max(0, a.swingT - dt); const vy = (a.pos.y - before.y) / Math.max(dt, 1e-3);
      const m = a.m;
      a.root.position.copy(a.pos); a.root.rotation.y = a.yaw + Math.PI;
      if (!a.alive) { a.root.rotation.x = BZ.damp(a.root.rotation.x, -Math.PI / 2, 8, dt); continue; }
      a.root.rotation.x = BZ.damp(a.root.rotation.x, 0, 8, dt);
      const W = BZ.WEAPONS[a.weapon] || {}; const st = a.st || (a.st = {});
      st.speed = sp; st.air = BZ.damp(st.air || 0, Math.abs(vy) > 1.2 ? 1 : 0, 8, dt); st.pitch = a.pitch; st.mode = a.weapon ? BZ.holdOf(W) : 'none'; st.pat = a.pat;
      const dur = W.throwT || W.swing; st.swing = a.swingT > 0 && dur ? 1 - a.swingT / dur : -1; st.sprint = sp > 5.5;
      a.kR = Math.max(0, (a.kR || 0) - dt * 30); a.kL = Math.max(0, (a.kL || 0) - dt * 30); st.kick = a.kR; st.kickL = a.kL;
      a.hideT = Math.max(0, (a.hideT || 0) - dt); a.spinT = Math.max(0, (a.spinT || 0) - dt);
      if (a.eq && a.eq.gun) { a.eq.gun.visible = !(W.thrown && a.hideT > 0); const bar = a.eq.gun.getObjectByName('barrels'); if (bar) { a.spinAng = ((a.spinAng || 0) + (a.spinT > 0 ? 40 * dt : 0)) % (Math.PI * 2); bar.rotation.z = a.spinAng; } }
      BZ.animHero(m, st, dt);
    }
  }
  // another player cast a skill: their body plays its cast animation here
  C.castAnim = (pid, key) => { const a = avatars.get(pid); if (a) (a.st || (a.st = {})).act = { key, t: 0 }; };
  function dropAvatar(pid) { const a = avatars.get(pid); if (a) { G.scene.remove(a.root); avatars.delete(pid); } }

  // ---------- sending ----------
  function send(to, msg) { for (const f of C.framer.pack(msg)) C.link.send(to, f); }
  function toAll(msg, except) { for (const [id, p] of C.peers) if (p.ready && id !== except) send(id, msg); }
  C.act = (a) => { if (C.guest) C.acts.push(a); };
  C.reportHit = (z, d, part, dir, imp, opt) => {
    C.hits.push([G.zombies.list.indexOf(z), Math.round(d), part === 'head' ? 2 : part === 'leg' ? 1 : 0, +dir.x.toFixed(2), +dir.z.toFixed(2), +imp.toFixed(2), opt.cut || (opt.blast ? 'blast' : 0), opt.status && opt.status.length ? opt.status : 0]);
  };
  C.remotes = () => [...avatars.values()].map((a) => a.target);
  C.hurtRemote = (t, dmg, from, fx) => { const p = [...C.peers.values()].find((q) => q.pid === t.pid); if (p) send(p.id, fx ? { t: 'hurt', d: dmg, f: v3(from), x: fx } : { t: 'hurt', d: dmg, f: v3(from) }); };
  function myPose() {
    const P = G.player; const W = G.weapons;
    return [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +P.yaw.toFixed(2), +P.pitch.toFixed(2), W.ORDER.indexOf(W.cur()), W.S.shots, (P.alive ? 1 : 0) | (P.sprinting ? 2 : 0), Math.round(P.hp)];
  }

  // ---------- host ----------
  function hostListen() {
    C.link.onMessage = (from, f) => { const m = C.framer.unpack(from, f); if (m) hostReceive(from, m); };
    C.link.onPeerLeft = (from) => leave(from, 'rời phòng');
  }
  {
    const E = G.events;
    E.on('boom', ({ pos, s }) => { if (C.guest && C.welcomed) C.act({ k: 'boom', p: v3(pos), s }); });
    E.on('zombie:killed', ({ z, part, gore, by, dir, opt }) => { if (C.host) C.events.push({ k: 'kill', i: G.zombies.list.indexOf(z), part, gore, by: by || 'h', d: [+(dir ? dir.x : 0).toFixed(2), +(dir ? dir.z : 0).toFixed(2)], cut: opt && opt.cut, limb: opt && opt.limb }); });
    E.on('zombie:sever', ({ z, part, cut, dir }) => { if (C.host && z.alive) C.events.push({ k: 'sev', i: G.zombies.list.indexOf(z), part, cut, d: [+(dir ? dir.x : 0).toFixed(2), +(dir ? dir.z : 0).toFixed(2)] }); });
    E.on('boom', ({ pos, s }) => { if (C.host) C.events.push({ k: 'boom', p: v3(pos), s }); });
    E.on('bolt', ({ p }) => { if (C.host) C.events.push({ k: 'bolt', p: v3(p) }); });
    E.on('ann', (a) => { if (C.host) C.events.push({ k: 'ann', ...a }); });
    E.on('react', ({ z, kind, combo }) => { if (C.host) C.events.push({ k: 'react', i: G.zombies.list.indexOf(z), kind, combo }); });
    E.on('zk', (z) => { if (C.host) C.events.push({ k: 'zk', z }); });
    E.on('tbrk', (e) => { if (C.host) C.events.push({ k: 'tb', e }); });
    E.on('hx', ({ s, a }) => { if (C.host) C.events.push({ k: 'hx', s, a }); });
  }
  let pidN = 0;
  function hostReceive(from, m) {
    let p = C.peers.get(from);
    if (m.t === 'hello') {
      if (!p) { p = { id: from, pid: 'p' + (++pidN), name: String(m.name || 'Khách').slice(0, 16), hero: m.hero, heard: 0, ready: false }; C.peers.set(from, p); }
      p.heard = performance.now() / 1000; p.ready = true; p.hero = m.hero || p.hero;
      avatar(p.pid, p.name, p.hero);
      send(from, { t: 'welcome', you: p.pid, wave: [G.wave.n, G.wave.phase], sky: [G.sky.S.t, G.sky.weather()] });
      G.ui.banner(p.name.toUpperCase() + ' VÀO PHÒNG', BZ.HEROES.find((x) => x.id === p.hero)?.name || '', 2);
      G.audio.play('wave_clear', { gain: 0.5 });
      return;
    }
    if (!p) return;
    p.heard = performance.now() / 1000;
    if (m.t === 'bye') { leave(from, 'rời phòng'); return; }
    if (m.t !== 'g') return;
    if (m.hero && m.hero !== p.hero) { p.hero = m.hero; avatar(p.pid, p.name, p.hero); }
    const a = avatar(p.pid, p.name, p.hero);
    if (m.pose) applyPose(a, m.pose);
    for (const h of m.hits || []) {
      const z = G.zombies.list[h[0]]; if (!z || !z.alive) continue;
      const part = h[2] === 2 ? 'head' : h[2] === 1 ? 'leg' : 'body'; const dir = new THREE.Vector3(h[3], 0, h[4]).normalize();
      const opt = { net: true, by: p.pid, credit: false }; if (h[6] === 'blast') opt.blast = true; else if (h[6]) opt.cut = h[6]; if (h[7]) opt.status = h[7];
      G.zombies.damage(z, h[1], part, dir, h[5], opt);
    }
    for (const x of m.acts || []) hostAct(p, x);
  }
  function hostAct(p, x) {
    if (x.k === 'boom') { G.fx.explosion(V(x.p), x.s); G.audio.playAt('boom', V(x.p), { gain: 1.2 }); C.events.push({ k: 'boom', p: x.p, s: x.s, skip: p.pid }); }
    else if (x.k === 'freeze') G.hero.freezeAt(V(x.p));
    else if (x.k === 'picked') { if (C.onPicked) C.onPicked(p.pid, x.n); }
    else if (x.k === 'hx') { G.hero.remote(x.s, x.a, p.pid); C.events.push({ k: 'hx', s: x.s, a: x.a }); }
    else if (x.k === 'strike') G.hero.strikeAt(V(x.at));
    else if (x.k === 'ally') G.allies.hire();
    else if (x.k === 'sup') { p.sup = x.s; if (C.onSupport) C.onSupport(); }
    else if (x.k === 'turret') { const t = avatars.get(p.pid); if (t) G.gear.placeTurret({ pos: t.pos.clone(), yaw: t.yaw }); }
  }
  function leave(from, why) {
    const p = C.peers.get(from); if (!p) return;
    C.peers.delete(from); dropAvatar(p.pid);
    if (C.link.drop) C.link.drop(from);
    if (C.room && C.room.free) C.room.free(p.uid);
    G.ui.banner(p.name.toUpperCase() + ' ' + why.toUpperCase(), '', 1.6);
  }
  function hostTick(dt) {
    const t = performance.now() / 1000;
    for (const [id, p] of C.peers) if (t - p.heard > PEER_TIMEOUT) leave(id, 'mất kết nối');
    C.sendT -= dt; if (C.sendT > 0) return; C.sendT = 1 / RATE;
    const pl = [['h', nameOf(), G.hero.id, ...myPose()]];
    for (const p of C.peers.values()) { const a = avatars.get(p.pid); if (a && a.init) pl.push([p.pid, p.name, p.hero, +a.tgt.x.toFixed(2), +a.tgt.y.toFixed(2), +a.tgt.z.toFixed(2), +a.tyaw.toFixed(2), +a.pitch.toFixed(2), G.weapons.ORDER.indexOf(a.weapon), a.shots, a.alive ? 1 : 0, a.hp]); }
    const al = G.allies.list.filter((q) => q.alive).map((q) => [+q.pos.x.toFixed(2), +q.pos.z.toFixed(2), +q.yaw.toFixed(2)]);
    const ev = C.events.splice(0);
    const msg = { t: 's', z: G.zombies.snapshot(), pl, al, wv: [G.wave.n, G.wave.phase, G.wave.remaining(), G.wave.waiting()], sky: [+G.sky.S.t.toFixed(4), G.sky.weather()], ev };
    for (const [id, p] of C.peers) { if (!p.ready) continue; const mine = { ...msg, ev: ev.filter((e) => e.skip !== p.pid) }; send(id, mine); }
    // everyone down: the fight is over for the whole room
    if (!G.player.alive && [...avatars.values()].every((a) => !a.alive) && G.state === 'playing') { toAll({ t: 'over' }); G.events.emit('coop:over'); }
  }

  // ---------- guest ----------
  function guestListen() {
    C.link.onMessage = (from, f) => { const m = C.framer.unpack(from, f); if (m) guestReceive(m); };
    C.link.onClose = (why) => { if (!C.on) return; G.ui.banner('MẤT PHÒNG', why === 'host left' ? 'chủ phòng đã rời' : 'mất kết nối', 3); stop(); G.events.emit('coop:lost'); };
  }
  function guestReceive(m) {
    if (m.t === 'welcome') {
      C.me = m.you; C.welcomed = true;
      G.sky.S.t = m.sky[0]; if (m.sky[1] !== G.sky.weather()) G.sky.setWeather(m.sky[1], false);
      if (C.onWelcome) C.onWelcome(m);
      return;
    }
    if (m.t === 'hurt') { G.events.emit('player:hurt', { dmg: m.d, from: V(m.f) }); if (m.x) G.zombies.kinds.playerFx(G.player, m.x); return; }
    if (m.t === 'over') { G.events.emit('coop:over'); return; }
    if (m.t !== 's') return;
    // deaths and lost limbs first: the snapshot no longer lists a zombie the host just killed
    for (const e of m.ev) if (e.k === 'kill' || e.k === 'sev') guestEvent(e);
    G.zombies.adopt(m.z);
    const seen = new Set();
    for (const r of m.pl) {
      const [pid, name, hero] = r; if (pid === C.me) continue; seen.add(pid);
      const a = avatar(pid, name, hero); applyPose(a, r.slice(3));
    }
    for (const pid of [...avatars.keys()]) if (!seen.has(pid)) dropAvatar(pid);
    G.allies.mirror && G.allies.mirror(m.al);
    const [n, phase, remaining, waitingN] = m.wv;
    if (n !== G.wave.n && n > 0) G.events.emit('coop:wave', n);
    G.wave.n = n; G.wave.phase = phase; G.wave.netRemaining = remaining; G.wave.netWaiting = waitingN;
    G.sky.S.t = m.sky[0]; if (m.sky[1] !== G.sky.weather()) G.sky.setWeather(m.sky[1], true);
    for (const e of m.ev) if (e.k !== 'kill' && e.k !== 'sev') guestEvent(e);
  }
  function guestEvent(e) {
    const Z = G.zombies; const z = e.i !== undefined ? Z.list[e.i] : null;
    if (e.k === 'kill' && z && z.alive) {
      Z.kill(z, e.part, new THREE.Vector3(e.d[0], 0, e.d[1]).normalize(), { gore: e.gore, credit: e.by === C.me, cut: e.cut, limb: e.limb, net: true });
    } else if (e.k === 'sev' && z && z.alive) Z.sever(z, e.part, new THREE.Vector3(e.d[0], 0, e.d[1]).normalize(), { cut: e.cut, net: true });
    else if (e.k === 'boom') { G.fx.explosion(V(e.p), e.s); G.audio.playAt('boom', V(e.p), { gain: 1.2 }); const pd = G.player.pos.distanceTo(V(e.p)); if (pd < 18) G.player.shake.v += (18 - pd) * 0.8; }
    else if (e.k === 'bolt') G.sky.strike(V(e.p), true);
    else if (e.k === 'react' && z) { const R = G.zombies.REACT[e.kind]; const at = new THREE.Vector3(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z); G.fx.burst(at, 26, R.col, { speed: 5, size: 0.12, life: 0.7 }); G.fx.puff(at, { glow: true, s0: 1.5, s1: 4, life: 0.35, c0: R.col[0], c1: R.col[1] }); G.ui.pop((e.combo ? 'PHỐI HỢP · ' : '') + R.name, e.combo ? 'critword' : 'dmg crit', at.setY(at.y + 1.5)); }
    else if (e.k === 'zk') G.zombies.kinds.remote(e.z);
    else if (e.k === 'tb') G.destruct.remote(e.e);
    else if (e.k === 'hx') G.hero.remote(e.s, e.a, e.a.by);
    else if (e.k === 'ann') { if (e.banner) G.ui.banner(e.title, e.sub, e.secs || 2.2); else G.ui.announce(e.title, e.sub, e.cls); if (e.snd) G.audio.play(e.snd, { gain: 0.8 }); }
  }
  function guestTick(dt) {
    C.sendT -= dt; if (C.sendT > 0) return; C.sendT = 1 / RATE;
    const msg = { t: 'g', pose: myPose(), hero: G.hero.id };
    if (C.hits.length) msg.hits = C.hits.splice(0);
    if (C.acts.length) msg.acts = C.acts.splice(0);
    send(C.link.hostId, msg);
  }

  // ---------- lifecycle ----------
  async function host() {
    C.status = 'Đang tạo phòng…';
    if (fake) { C.code = 'FAKE'; C.link = fakeLink('host', 'FAKE'); await C.link.open(); C.room = { code: 'FAKE', close: () => C.link.close() }; }
    else { C.room = await hostRoom({ name: nameOf() + ' · Blockade Z', isPrivate: false, playerName: nameOf() }); C.link = C.room.link; C.code = C.room.code; }
    C.on = true; C.host = true; C.guest = false; C.me = 'h';
    hostListen();
    C.status = 'Phòng ' + C.code;
    return C.code;
  }
  async function join({ code, lobbyId }) {
    C.status = 'Đang vào phòng…';
    if (fake) { C.link = fakeLink('client', 'FAKE'); await C.link.open(); C.room = { leave: () => C.link.close() }; C.code = 'FAKE'; }
    else { C.room = await joinRoom({ code, lobbyId, playerName: nameOf() }); C.link = C.room.link; C.code = C.room.lobby.lobbyCode || code; }
    C.on = true; C.guest = true; C.host = false;
    guestListen();
    const welcome = new Promise((resolve, reject) => { C.onWelcome = resolve; setTimeout(() => reject(new Error('chủ phòng không trả lời')), 10000); });
    send(C.link.hostId, { t: 'hello', name: nameOf(), hero: G.hero.id });
    await welcome; C.onWelcome = null;
    C.status = 'Phòng ' + C.code;
    return C.code;
  }
  function stop() {
    if (!C.on) return;
    try { if (C.guest) send(C.link.hostId, { t: 'bye' }); } catch (e) { /* link already down */ }
    try { if (C.host && C.room) C.room.close(true); else if (C.room && C.room.leave) C.room.leave(true); } catch (e) { /* closing anyway */ }
    try { C.link.close(); } catch (e) { /* closed */ }
    for (const pid of [...avatars.keys()]) dropAvatar(pid);
    C.peers.clear(); C.on = C.host = C.guest = false; C.code = ''; C.status = '';
  }
  addEventListener('pagehide', stop);
  function update(dt) {
    if (!C.on) return;
    animateAvatars(dt);
    if (C.host) hostTick(dt); else if (C.guest && C.welcomed) guestTick(dt);
  }
  const players = () => 1 + avatars.size;
  return Object.assign(C, { create: host, join, stop, update, listRooms: () => (fake ? Promise.resolve([{ id: 'FAKE', name: 'fakenet', host: 'fake', players: 1, max: 4, wave: 1 }]) : listRooms()), players, avatars });
};
