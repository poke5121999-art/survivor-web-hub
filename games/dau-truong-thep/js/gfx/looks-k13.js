// Looks, kit lane K13: Đom Đóm, Dương Tiễn and Kaneki, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   绮翠之心 p91 (Đom Đóm): jade-green wind. Translucent jade bubbles swirl round her and her allies whenever she casts (the
//     bullet-eating Phong Vãn Chi Ca); a jade wind eye opens on the ground with a pale blue rim and keeps a small swirl over
//     the foes it caught; a thin jade spear on a pale wind ribbon; the temple is a jade dome round her that beats three times,
//     wind streaks pouring inward with each beat.
//   二郎神 p68 (Dương Tiễn): ice blue and white. A blue crescent sweeps round him and a violet-blue diamond eye hangs over each
//     foe he marked; the hound is a blue comet dropping rings behind it, his blink a blue streak ending in a ring; the two halberd
//     sweeps are wide blue crescents (the second white-edged, the other way); the heavenly eyes are violet diamonds.
//   金木 p62 (Kaneki, skin 末日使者): cyan kagune. Jagged cyan tendrils lash out in a fan; the hunt is a cyan comet streak; the
//     Kagune Evolution grows four cyan tendrils swaying behind him for its 5 s.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst, slash, cut } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Đom Đóm: jade wind, pale-cyan accent --------------------------------------------------------------------------------
const DD_JADE = C(0.3, 2.1, 1.05), DD_WIND = C(1.2, 2.5, 2.3), DD_DEEP = C(0.04, 0.55, 0.32), DD_RIM = C(0.45, 1.3, 2.4);
// Phong Vãn Chi Ca: every press wraps her and the allies within the song's reach in a swirling jade bubble for its block time
function song(kit, u) {
  const P = u.def.passive, S = P && P.song;
  if (!S || !kit.match) return;
  for (const o of kit.match.units) {
    if (!o.alive || o.team !== u.team || Math.hypot(o.x - u.x, o.z - u.z) > S.r) continue;
    shell(kit, o.x, 1.1, o.z, 1.9, DD_JADE, { c2: DD_WIND, p: 1.5, core: 0.08, bands: 1.6, follow: o, life: S.block + 0.25, grow: 0.08, fade: 0.2 });
    swirl(kit, o, S.block + 0.2, 1.7, 3);
  }
}
// wind streaks circling a unit (or a fixed point) at radius r
function swirl(kit, o, life, r, n) {
  for (let j = 0; j < n; j++) {
    const ph = j * 6.283 / n, h = 0.6 + j * 0.35;
    trail(kit, (t) => (t > life || (o.alive === false) ? null : [o.x + Math.cos(ph + t * 7) * r, h + 0.25 * Math.sin(t * 5 + j), o.z + Math.sin(ph + t * 7) * r]), 0.32, DD_WIND, life, { c2: DD_JADE, len: 10, add: true, up: true });
  }
}
const domdom = {
  // Phong Tiễn (weapon): a jade dart on a short pale ribbon
  ddDart: {
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 0.42, DD_WIND, 1e9, { c2: DD_JADE, len: 7, add: true });
      return v;
    },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; kit.glow(x, 1.25, z, DD_JADE, 0.05, 0.55, 0.9, kit.K.STAR, 1); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; kit.glow(x, 1.1, z, DD_WIND, 0.12, 1.1, 0.8, kit.K.GLOW, 1.2); },
  },
  // Ai Nga La Tư Chi Nhãn: a jade eye opens on the ground (pale blue rim, wind ticks turning), wind gathers into it and it
  // bursts; each foe caught keeps a small jade swirl over it that beats with the eye's three ticks
  ddEye: {
    zones: ['strike'], ownDisc: true, pal: [DD_JADE, DD_WIND], hitR: 2,
    skill(kit, e, u) { song(kit, u); kit.glow(u.x + Math.cos(e.a) * 1.2, 1.4, u.z + Math.sin(e.a) * 1.2, DD_JADE, 0.15, 1.3, 0.8, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      const ring = sigil(kit, z.x, z.z, z.r, DD_RIM, { c2: DD_JADE, n: 0, ticks: 18, inner: 0.35, fill: 0.18, w: 0.07, life: 1e9, rev: 0.12, spin: 2.6 });
      return { ring, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      if (Math.random() < dt * 40) { const a = Math.random() * 6.283, r = z.r * R(0.9, 1.2); kit.str.emit(z.x + Math.cos(a) * r, 0.5, z.z + Math.sin(a) * r, -Math.cos(a) * 7 - Math.sin(a) * 5, 0.8, -Math.sin(a) * 7 + Math.cos(a) * 5, Math.random() < 0.5 ? DD_JADE : DD_WIND, 0.3, 0.12, 0.08, 0, 0, 1); }
    },
    zoneDrop(kit, v) { stop(v.ring); },
    land(kit, e) {
      const r = 3;
      shell(kit, e.x, 0.9, e.z, r, DD_JADE, { c2: DD_WIND, p: 1.3, core: 0.12, bands: 1.4, squash: 0.45, life: 0.55, grow: 0.08, fade: 0.3 });
      sigil(kit, e.x, e.z, r, DD_JADE, { c2: DD_WIND, n: 6, m: 1, ticks: 0, inner: 0.5, fill: 0.3, life: 0.6, rev: 0.06, spin: 4 });
      kit.flash(e.x, 1.4, e.z, DD_JADE, 30, 0.2); kit.kick(e.x, e.z, 0.2);
      if (kit.match) for (const o of kit.match.units) {
        if (!o.alive || Math.hypot(o.x - e.x, o.z - e.z) > r + o.radius) continue;
        const own = kit.match.units.find((q) => q.def.passive && q.def.passive.do === 'ddWind' && q.team !== o.team);
        if (!own) continue;
        kit.follow(o, 4.6, (t) => {
          const k = (t % 1.5) / 1.5, beat = t > 1.4 && k < 0.15;
          for (let i = 0; i < 6; i++) { const a = i * 1.047 + t * 5; kit.glow(o.x + Math.cos(a) * 0.9, 2.3, o.z + Math.sin(a) * 0.9, i % 2 ? DD_JADE : DD_WIND, 0.05, beat ? 0.55 : 0.32, 0.9, kit.K.STAR, 1); }
          if (beat && Math.random() < 0.5) kit.ring(o.x, o.z, 1.6, DD_JADE, 0.3);
        });
      }
      return true;
    },
  },
  // Phong Chi Đầu Thương: a thin jade spear on a pale wind ribbon; where it strikes, a jade bubble pops and wind fans out
  ddSpear: {
    pal: [DD_JADE, DD_WIND], hitR: 2.2,
    skill(kit, e, u) { song(kit, u); return true; },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, a: Math.atan2(s.dz || 0, s.dx || 1), live: true };
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 0.9, DD_WIND, 1e9, { c2: DD_JADE, len: 16, add: true });
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 0.5, DD_JADE, 1e9, { c2: DD_DEEP, len: 10, up: true });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z;
      kit.glow(x, 1.3, z, DD_WIND, 0.05, 0.9, 1, kit.K.STAR, 1.1);
      if (Math.random() < 0.6) kit.str.emit(x, 1.3, z, R(-2, 2), R(-0.5, 0.8), R(-2, 2), DD_JADE, 0.25, 0.08, 0.06, 0, 0, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false;
      burst(kit, x, z, 2.4, DD_JADE, DD_WIND, { life: 0.35 });
      shell(kit, x, 1.1, z, 2.2, DD_JADE, { c2: DD_WIND, p: 1.5, core: 0.1, bands: 1.5, life: 0.4, grow: 0.06, fade: 0.25 });
      for (let i = 0, n = kit.N(14); i < n; i++) { const a = R(0, 6.283), sp = R(7, 13); kit.str.emit(x, 1.1, z, Math.cos(a) * sp, R(0, 1), Math.sin(a) * sp, i % 2 ? DD_JADE : DD_WIND, 0.3, 0.14, 0.08, 0, 0, 1); }
    },
  },
  // Phong Nha Thần Điện: a jade dome rises round her with a turning wind sigil under it; it beats three times (1, 2.5 and 4 s
  // after the press): a ring runs out to the edge, wind streaks pour inward to her, the dome flares
  ddTemple: {
    pal: [DD_JADE, DD_WIND], hitR: 2,
    skill(kit, e, u) { song(kit, u); return true; },
    nova(kit, e, u, s) {
      const T = s.ddTemple, r = T.r, end = T.delay + T.every * (T.n - 1) + 0.6;
      kit.ring(e.x, e.z, s.radius, DD_RIM, 0.35);
      sigil(kit, e.x, e.z, r, DD_JADE, { c2: DD_WIND, n: 8, m: 3, ticks: 24, inner: 0.62, fill: 0.12, life: end, rev: 0.4, spin: 0.8, w: 0.08, follow: u, fade: 0.4 });
      const dome = shell(kit, u.x, 0, u.z, r, DD_JADE, { c2: DD_WIND, p: 2.2, core: 0.03, bands: 0.9, dome: true, follow: u, life: end, grow: T.delay, fade: 0.5, alpha: 0.55 });
      let beat = 0;
      kit.follow(u, end, (t) => {
        const at = T.delay + beat * T.every;
        if (beat < T.n && t >= at) {
          beat++;
          kit.ring(u.x, u.z, r, DD_WIND, 0.45); kit.ring(u.x, u.z, r * 0.6, DD_JADE, 0.35);
          kit.flash(u.x, 1.6, u.z, DD_JADE, beat === 1 ? 45 : 30, 0.25);
          for (let i = 0, n = kit.N(beat === 1 ? 30 : 20); i < n; i++) { const a = R(0, 6.283), d = r * R(0.85, 1.05), sp = R(10, 16); kit.str.emit(u.x + Math.cos(a) * d, R(0.4, 1.6), u.z + Math.sin(a) * d, -Math.cos(a) * sp, 0, -Math.sin(a) * sp, i % 3 ? DD_JADE : DD_WIND, 0.35, 0.25, 0.1, 0, 0, 1); }
          if (dome) dome.scale && dome.scale.setScalar(r * 1.04);
        }
        if (Math.random() < 0.5) { const a = R(0, 6.283), d = r * R(0.3, 0.95); kit.glow(u.x + Math.cos(a) * d, R(0.5, 2.5), u.z + Math.sin(a) * d, DD_WIND, 0.6, 0.25, 0.9, kit.K.STAR, 0.4, -Math.sin(a) * 2, 0.3, Math.cos(a) * 2); }
      });
      return true;
    },
  },
};


// ---- Dương Tiễn: ice blue, white edge, violet-blue diamond eyes -------------------------------------------------------------
const DT_ICE = C(0.35, 1.15, 2.6), DT_WHITE = C(2.3, 2.45, 2.7), DT_VIO = C(1.0, 0.5, 2.5), DT_DEEP = C(0.05, 0.2, 0.7);
const diaGeo = new THREE.OctahedronGeometry(1, 0); diaGeo.userData.keep = true;
const glowMat = (c, op) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
// a flat diamond eye (long axis toward the top of the screen): a violet body round a white core
function diamond(s) {
  const g = new THREE.Group(), body = new THREE.Mesh(diaGeo, glowMat(DT_VIO, 0.85)), core = new THREE.Mesh(diaGeo, glowMat(DT_WHITE, 0.95));
  body.scale.set(0.5 * s, 0.12 * s, 0.85 * s); core.scale.set(0.2 * s, 0.14 * s, 0.34 * s);
  g.add(body, core); g.traverse((m) => { m.renderOrder = 9; });
  return g;
}
// the mark of Trảm Tiên Thần Quyết: a diamond eye over a foe for dur s, bobbing
function eyeMark(kit, o, dur) {
  const d = diamond(0.7);
  own(kit, [d], dur, (t) => { if (!o.alive) return false; const k = Math.min(1, t / 0.12) * Math.min(1, (dur - t) / 0.3); d.position.set(o.x, 3.1 + 0.15 * Math.sin(t * 4), o.z); d.scale.setScalar(k); return true; });
}
const duongtien = {
  // Trảm Tiên Thần Quyết: a blue crescent sweeps the full circle round him (two strokes), the struck foes carry the diamond eye
  dtSlash: {
    pal: [DT_ICE, DT_WHITE], hitR: 2,
    hit(kit, e, by) { const o = kit.match && kit.match.units[e.id]; if (o && o.team !== by.team) eyeMark(kit, o, 3); kit.glow(e.x, 1.2, e.z, DT_ICE, 0.2, 1.5, 0.8, kit.K.GLOW, 1.3); },
    skill() { return true; },
    nova(kit, e, u, s) {
      const a = e.a ?? u.aim, r = s.radius;
      slash(kit, e.x, e.z, a, r, DT_ICE, { c2: DT_DEEP, edge: DT_WHITE, span: 1.6, life: 0.5, w: r * 0.24, sweep: 0.09, arcs: 2 });
      slash(kit, e.x, e.z, a + Math.PI, r, DT_ICE, { c2: DT_DEEP, edge: DT_WHITE, span: 1.6, life: 0.5, w: r * 0.24, sweep: 0.12, arcs: 2 });
      kit.ring(e.x, e.z, r, DT_ICE, 0.35);
      kit.flash(e.x, 1.5, e.z, DT_ICE, 35, 0.2); kit.kick(e.x, e.z, 0.25);
      return true;
    },
  },
  // Hao Thiên Xuất Kích: the hound runs as a blue comet, dropping thin rings behind it
  dtHound: {
    pal: [DT_ICE, DT_WHITE], hitR: 1.8,
    skill() { return true; },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true, drop: 0 };
      v.ball = shell(kit, s.x, 1.2, s.z, 0.9, DT_ICE, { c2: DT_WHITE, p: 1.2, core: 0.35, life: 1e9 });
      trail(kit, () => (v.live ? [v.x, 1.2, v.z] : null), 1.2, DT_ICE, 1e9, { c2: DT_DEEP, len: 14, add: true });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.ball.position.set(x, 1.2, z);
      if ((v.drop -= 1 / 60) <= 0) { v.drop = 0.07; kit.ring(x, z, 1.1, DT_ICE, 0.3); }
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.ball); kit.glow(x, 1.2, z, DT_WHITE, 0.15, 1.6, 0.8, kit.K.GLOW, 1.2); },
  },
  // the recast: a blue streak from where he stood to the hound, a ring and a white X where he lands
  dtBlink: {
    pal: [DT_ICE, DT_WHITE], hitR: 2,
    skill() { return true; },
    warp(kit, e) {
      const b = kit.beam(e.x0, e.z0, e.x, e.z, 1.1, DT_ICE, 0.35, 0, 1.2); b.fade = true;
      burst(kit, e.x, e.z, 3, DT_ICE, DT_WHITE, { life: 0.35 });
      sigil(kit, e.x, e.z, 3, DT_ICE, { c2: DT_WHITE, n: 4, m: 1, ticks: 12, inner: 0.6, fill: 0.2, life: 0.5, rev: 0.06, spin: 3 });
      cut(kit, e.x, e.z, Math.atan2(e.z - e.z0, e.x - e.x0), 3.2, DT_ICE, { edge: DT_WHITE });
      return true;
    },
  },
  // Phá Diệt Hoành Tảo / Tuyệt Sát Chi Kích: wide blue halberd crescents, the second white-edged and the other way round
  dtSweep: {
    pal: [DT_ICE, DT_WHITE], hitR: 2.2,
    skill() { return true; },
    nova(kit, e, u, s) { sweep(kit, e, u, s, 1); return true; },
  },
  dtSwing: {
    pal: [DT_WHITE, DT_ICE], hitR: 2.4,
    skill() { return true; },
    nova(kit, e, u, s) { sweep(kit, e, u, s, -1); return true; },
  },
  // Thông Thiên Pháp Nhãn: three violet diamond eyes fly out in a fan (drawn from the press: the stage-three volley is not a
  // top-level row, so the shot looks do not reach it), each leaving a violet ribbon
  dtEye: {
    pal: [DT_VIO, DT_WHITE], hitR: 2,
    skill(kit, e, u, s) {
      const n = s.n || 3, life = s.range / s.speed, x0 = u.x, z0 = u.z;
      kit.flash(u.x, 2.2, u.z, DT_VIO, 35, 0.25);
      for (let i = 0; i < n; i++) {
        const a = e.a + (i - (n - 1) / 2) * (s.fan || 0), d = diamond(1), at = (t) => [x0 + Math.cos(a) * s.speed * t, 1.5, z0 + Math.sin(a) * s.speed * t];
        own(kit, [d], life, (t) => { const p = at(t); d.position.set(p[0], p[1], p[2]); d.rotation.y = -a + Math.PI / 2; return true; });
        trail(kit, (t) => (t < life ? at(t) : null), 0.7, DT_VIO, life + 0.2, { c2: DT_DEEP, len: 12, add: true });
      }
      return true;
    },
  },
};
function sweep(kit, e, u, s, dir) {
  const a = e.a ?? u.aim, r = s.radius, span = s.arc || 1.2, c = dir > 0 ? DT_ICE : DT_WHITE, c2 = dir > 0 ? DT_DEEP : DT_ICE;
  slash(kit, e.x, e.z, a, r, c, { c2, edge: DT_WHITE, span, dir, life: 0.55, w: r * 0.3, sweep: 0.1, arcs: 3 });
  slash(kit, e.x, e.z, a, r * 0.62, DT_ICE, { c2: DT_DEEP, span: span * 0.9, dir, life: 0.45, w: r * 0.2, sweep: 0.08, arcs: 0, sparks: false });
  for (let i = 0, n = kit.N(18); i < n; i++) { const b = a + R(-span, span), sp = R(9, 16); kit.str.emit(e.x + Math.cos(b) * r * 0.6, R(0.6, 1.5), e.z + Math.sin(b) * r * 0.6, Math.cos(b) * sp, 0, Math.sin(b) * sp, i % 3 ? DT_ICE : DT_WHITE, 0.3, 0.2, 0.12, 0, 0, 1); }
  kit.flash(e.x + Math.cos(a) * 2, 1.4, e.z + Math.sin(a) * 2, DT_ICE, 35, 0.2); kit.kick(e.x, e.z, 0.3);
}

// ---- Kaneki: cyan kagune, white edge -----------------------------------------------------------------------------------
const KN_CYAN = C(0.3, 1.9, 2.6), KN_WHITE = C(2.2, 2.6, 2.7), KN_DEEP = C(0.02, 0.35, 0.6), KN_BLOOD = C(1.6, 0.1, 0.18);
// one kagune tendril lashing out from (x, z) along a to length L over `out` s, jagged, then pulling back
function tendril(kit, x, z, a, L, out, life, w) {
  const ph = R(0, 6.283);
  trail(kit, (t) => {
    if (t > life) return null;
    const f = Math.min(1, t / out) * (1 - 0.6 * Math.max(0, (t - out) / (life - out))), d = L * f, wig = Math.sin(t * 30 + ph) * 0.35 * f;
    return [x + Math.cos(a) * d - Math.sin(a) * wig, 1.0 + 0.4 * f, z + Math.sin(a) * d + Math.cos(a) * wig];
  }, w, KN_CYAN, life, { c2: KN_DEEP, len: 14, add: true });
}
// the hp a press costs: a small dark-red puff at the caster
function cost(kit, u) { kit.puffs(u.x, 1.0, u.z, kit.N(5), KN_BLOOD, 0.8, 1.2, 0.5, 0.8, 1.6, 0.3, 0.6, kit.K.SMOKE, 2); }
const mucma = {
  // Sát Lục Thịnh Yến: seven jagged cyan tendrils lash out across the fan, a white-edged stroke over them
  knFeast: {
    pal: [KN_CYAN, KN_WHITE], hitR: 2.2,
    skill(kit, e, u) { cost(kit, u); return true; },
    nova(kit, e, u, s) {
      const a = e.a ?? u.aim, r = s.radius, span = s.arc || 0.7;
      for (let i = 0; i < 7; i++) tendril(kit, e.x, e.z, a + (i / 6 - 0.5) * 2 * span, r * R(0.85, 1.05), 0.1, 0.45, 0.5);
      slash(kit, e.x, e.z, a, r * 0.9, KN_CYAN, { c2: KN_DEEP, edge: KN_WHITE, span, life: 0.4, w: r * 0.18, sweep: 0.06, arcs: 2 });
      kit.flash(e.x + Math.cos(a) * 2, 1.4, e.z + Math.sin(a) * 2, KN_CYAN, 35, 0.2); kit.kick(e.x, e.z, 0.25);
      return true;
    },
  },
  // Cơ Ngạ Bộ Liệp: a cyan comet streak behind him while he hunts
  knHunt: {
    pal: [KN_CYAN, KN_WHITE], hitR: 2,
    skill(kit, e, u, s) {
      cost(kit, u);
      const life = s.dist / s.speed + 0.15;
      trail(kit, (t) => (t < life && u.alive ? [u.x, 1.1, u.z] : null), 1.6, KN_CYAN, life + 0.3, { c2: KN_DEEP, len: 16, add: true });
      kit.follow(u, life, () => { kit.glow(u.x, 1.2, u.z, KN_WHITE, 0.05, 1.3, 0.9, kit.K.STAR, 1); });
      return true;
    },
  },
  // Hách Tử Tiến Hóa: four cyan tendrils grow from his back and sway for the whole form; a pale shimmer on him
  knKagune: {
    pal: [KN_CYAN, KN_WHITE], hitR: 1.6,
    skill(kit, e, u, s) {
      const dur = s.dur || 5;
      for (let j = 0; j < 4; j++) {
        const side = j < 2 ? -1 : 1, up = j % 2;
        trail(kit, (t) => {
          if (t > dur || !u.alive) return null;
          const back = u.aim + Math.PI + side * (0.5 + 0.25 * up), sw = Math.sin(t * 3 + j) * 0.5, L = 2.2 + 0.4 * up;
          return [u.x + Math.cos(back + sw * 0.3) * L, 1.6 + up * 0.7 + 0.3 * Math.sin(t * 4 + j), u.z + Math.sin(back + sw * 0.3) * L];
        }, 0.55, KN_CYAN, dur, { c2: KN_DEEP, len: 18, add: true, up: true });
      }
      shell(kit, u.x, 1.1, u.z, 1.9, KN_CYAN, { c2: KN_WHITE, p: 2.2, core: 0.04, follow: u, life: dur, grow: 0.15, fade: 0.4, alpha: 0.5 });
      kit.flash(u.x, 1.6, u.z, KN_CYAN, 40, 0.3);
      return true;
    },
  },
};

export const K13 = { ...domdom, ...duongtien, ...mucma };

