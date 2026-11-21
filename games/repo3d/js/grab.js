import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { BeamFx } from './beam.js';
import { CREW } from './skills.js';
const C = CFG.grab;
const _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
// Physics beam: the held point chases a spot in front of the camera with a force budget, so a heavy item lags, swings on
// its anchor and drags on the floor when it outweighs the beam. The beam grips the exact point aimed at (not the centre).
//   look (js/beam.js): a curved glowing tube from the hand's emitter, pulses run along it, colour by strain (blue-green,
//   orange, red over strength), a hum whose pitch follows the strain, a click on grip and release
//   R held + mouse: turn the item (the view stays put); a wall between the eye and the grip for 0.2 s, or the item
//   stretched past breakDist, snaps the beam (sparks at both ends, a crack); an item dragged on the floor throws sparks
//   charged throw: right mouse held while carrying charges up to x1.6 speed in 0.8 s with a faint arc of the flight; Q throws at once
//   help: a bot (any role, not carrying, not down) within 2.5 m of the held item adds its strength (crew carry) to the beam
//   no riding: the carrier never collides with the item it holds (player.ignore), so standing on it to lift oneself fails
export const BEAM = { blockGrace: 0.2, cartStretchGrace: 0.35, helpR: 2.5, maxHelpers: 2, chargeT: 0.8, chargeMax: 1.6, throwStam: 6, dragSpark: 0.6,
  // feel (batch 6f, owner: "cầm đồ rất khó thao tác"): the beam catches anything within 0.15 m of the aim line (sphere cast);
  // the held spot leads the item by the spot's own velocity (no lag when the view turns), light items are stiffer and faster
  // (lightness = the beam's spare acceleration / 150 m/s2: small 1, medium 0.33, big 0.14), the pull goes through the centre
  // of mass (no spin from the grip offset) and the item's own spin dies in about 0.1 s; the spot stays out of the carrier
  catchR: 0.15, lightAcc: 150, springLight: 10, speedLight: 7, spinDamp: 18 };

export class Grab {
  constructor(phys, player, scene) {
    this.phys = phys;
    this.player = player;
    this.held = null;
    this.local = new THREE.Vector3();
    this.dist = 2;
    this.time = 0;
    this.fx = new BeamFx(scene);
    this.helpFx = [new BeamFx(scene), new BeamFx(scene)];
    this.blockT = 0; this.chargeT = -1; this.strain = 0; this.helpers = []; this.log = []; this.sparkT = 0;
    this.xhair = null;
    if (typeof document !== 'undefined') {
      const st = document.createElement('style');
      st.textContent = '.xhair{position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;z-index:9}'
        + '.xhair i{position:absolute;left:9px;top:9px;width:4px;height:4px;border-radius:50%;background:rgba(230,250,255,.85);box-shadow:0 0 3px #000}'
        + '.xhair b{position:absolute;inset:2px;border:2px solid rgba(120,240,255,.9);border-radius:50%;opacity:0;transform:scale(.6);transition:all .12s;box-shadow:0 0 6px rgba(80,220,255,.6)}'
        + '.xhair.can b{opacity:1;transform:scale(1)}.xhair.hold b{opacity:.55;transform:scale(.75);border-style:dashed}.xhair.hold i{background:#7ff0ff}';
      document.head.appendChild(st);
      this.xhair = document.createElement('div'); this.xhair.className = 'xhair'; this.xhair.innerHTML = '<b></b><i></i>'; document.body.appendChild(this.xhair);
    }
  }
  /** The grabbable thing on the aim line within reach, or null (crosshair, tests). */
  aimed() { return this.pick(); }
  /** What the beam would catch: the exact aim line first, else a 0.15 m sphere along it (the first thing it touches). */
  pick() {
    const p = this.player, dir = p.forward(_f), hit = this.phys.castRay(p.camPos, dir, C.range, p.col);
    if (hit && hit.rec && hit.rec.grabbable) return hit;
    const R = this.phys.R, world = this.phys.world;
    // the sphere looks for movable things only (the floor under a low aim or a wall beside it does not stop it) ...
    const sc = world.castShape(p.camPos, { x: 0, y: 0, z: 0, w: 1 }, dir, new R.Ball(BEAM.catchR), 0, C.range, true, R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_FIXED, undefined, p.col);
    if (!sc) return null;
    const col = sc.collider;
    const rec = this.phys.props.find((q) => q.col === col || (q.cols && q.cols.some((c) => c.handle === col.handle)));
    if (!rec || !rec.grabbable) return null;
    // ... and the eye must see the item: a line from the eye to its centre meets it first (that point is the grip)
    const c = rec.body.translation(), to = _u.set(c.x - p.camPos.x, c.y - p.camPos.y, c.z - p.camPos.z), dl = to.length();
    const ray = new R.Ray(p.camPos, to.normalize()), h2 = world.castRay(ray, dl + 0.5, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, p.col);
    if (!h2 || h2.collider.parent().handle !== rec.body.handle) return null;
    const pt = ray.pointAt(h2.timeOfImpact);
    return { rec, point: pt, toi: Math.hypot(pt.x - p.camPos.x, pt.y - p.camPos.y, pt.z - p.camPos.z), collider: col };
  }
  tryGrab() {
    const p = this.player;
    const dir = p.forward(_f);
    const hit = this.pick();
    if (!hit || !hit.rec || !hit.rec.grabbable) {   // Magnet's light pull: the nearest small item within 2 m
      const it = this.pullHook?.(); if (!it) return false;
      const to = p.camPos.clone().addScaledVector(dir, 1.2);   // it flies into the hand
      it.body.setTranslation({ x: to.x, y: to.y, z: to.z }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.attach(it, to, 1.2); return true;
    }
    this.attach(hit.rec, hit.point, hit.toi);
    return true;
  }
  attach(rec, point, dist) {
    const t = rec.body.translation(), r = rec.body.rotation();
    _q.set(r.x, r.y, r.z, r.w).invert();
    this.local.set(point.x - t.x, point.y - t.y, point.z - t.z).applyQuaternion(_q);
    this.held = rec;
    this.dist = THREE.MathUtils.clamp(dist, C.minDist, C.maxDist);
    this.player.ignore = rec.col; this.player.ignoreSet = rec.cols ? new Set(rec.cols.map((c) => c.handle)) : null;
    rec.held = true;
    rec.grabbedAt = this.time;
    this.blockT = 0; this.chargeT = -1; this.lastTarget = null;
    this.sound('beam_on', point, 0.7, 1);
    this.log.push(['grip', rec.material || rec.tag, +this.time.toFixed(2)]);
  }
  release(throwIt, k = 0) {
    const rec = this.held;
    if (!rec) return;
    if (throwIt) {
      const str = this.player.str;
      const speed = Math.max(C.throwBase, C.throwMax * str / (str + 2.2 * rec.mass)) * (1 + (BEAM.chargeMax - 1) * k);
      const d = this.player.forward(_f).multiplyScalar(speed);
      const v = rec.body.linvel();
      rec.body.setLinvel({ x: v.x * 0.3 + d.x, y: v.y * 0.3 + d.y, z: v.z * 0.3 + d.z }, true);
      this.player.stamina = Math.max(0, this.player.stamina - CFG.player.throwStamina * (1 + k));
      this.log.push(['throw', +speed.toFixed(2), +k.toFixed(2), rec.mass]);
    }
    const at = this.anchorWorld(_a).clone();
    rec.held = false; rec.pushErr = null;
    this.held = null;
    this.player.ignore = null; this.player.ignoreSet = null;
    this.chargeT = -1; this.helpers = []; this.strain = 0;
    this.sound('beam_off', at, 0.55, throwIt ? 1.3 : 1);
    this.audio?.loopSet?.('hum', 0);
  }
  /** Break the beam with a snap: sparks at the hand and the grip, a crack, a small kick. */
  snap(why) {
    const at = this.anchorWorld(_a).clone(), p = this.player;
    this.lastBreak = { t: +this.time.toFixed(2), why };
    this.log.push(['snap', why, +this.time.toFixed(2)]);
    this.events?.emit('beam:snap', { why });
    this.sound('beam_snap', at, 0.9, 1);
    if (this.melee) { this.melee.fx.burst(at, new THREE.Vector3(0, 0.6, 0), 16, 0); this.melee.fx.burst(p.camPos.clone().add(p.forward(_f).multiplyScalar(0.5)), new THREE.Vector3(0, 0.3, 0), 8, 0); this.melee.feel(0, 0.5, 0); }
    this.release(false);
  }
  sound(name, at, vol, rate) { this.audio?.play(name, at ? { x: at.x, y: at.y, z: at.z } : null, vol, rate); }
  anchorWorld(out) {
    const rec = this.held;
    const t = rec.body.translation(), r = rec.body.rotation();
    return out.copy(this.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_b.set(t.x, t.y, t.z));
  }
  /** Strength on the beam: the carrier plus helping bots (crew carry as their strength). */
  strength() { return this.player.str + this.helpers.reduce((s, b) => s + (CREW[b.crew]?.carry ?? 30), 0); }

  step(dt, cmd) {
    this.time += dt;
    if (cmd.grabPressed && !this.held) this.tryGrab();
    if (this.held && (!cmd.grab || this.held.dead)) this.release(false);
    if (this.held && cmd.throwIt) this.release(true, 0);
    // charged throw on the right mouse
    if (this.held) {
      if (cmd.melee) this.chargeT = this.chargeT < 0 ? 0 : this.chargeT + dt;
      else if (this.chargeT >= 0) { const k = Math.min(1, this.chargeT / BEAM.chargeT); this.chargeT = -1; this.release(true, k); }
    }
    if (!this.held) { this.player.speedMul = 1; return; }

    this.dist = THREE.MathUtils.clamp(this.dist - cmd.wheel * C.scrollStep, C.minDist, C.maxDist);
    const rec = this.held, b = rec.body, m = rec.kg;
    const p = this.player;
    // helpers: bots close to the item lend their strength
    const it = b.translation();
    this.helpers = (this.bots?.list || []).filter((bt) => !bt.down && !bt.carry && Math.hypot(bt.x - it.x, bt.z - it.z) < BEAM.helpR).slice(0, BEAM.maxHelpers);
    const str = this.strength();
    const target = _t.copy(p.camPos).addScaledVector(p.forward(_f), this.dist);
    // floors: the held point never aims into the floor under it (a ramp rising ahead), so items ride up a stair
    if (this.floorAt) { const half = CFG.loot.sizes[rec.size]?.half || 0.2, fy = this.floorAt(target.x, target.z) + half + 0.12; if (target.y < fy) target.y = fy; }
    // the spot never sits inside the carrier: pushed out along the view to clear the capsule
    { const pp = p.position, half = CFG.loot.sizes[rec.size]?.half || 0.2, need = CFG.player.radius + half + 0.08, hx = target.x - pp.x, hz = target.z - pp.z, hd = Math.hypot(hx, hz);
      if (!rec.isCart && hd < need && target.y < pp.y + CFG.player.halfHeight + CFG.player.radius + half) { const f = p.forward(_r); const fl = Math.hypot(f.x, f.z) || 1; target.x = pp.x + f.x / fl * need; target.z = pp.z + f.z / fl * need; } }
    const tv = this.lastTarget && dt > 0 ? _r.copy(target).sub(this.lastTarget).divideScalar(dt) : _r.set(0, 0, 0);   // the spot's own velocity (view turning, walking)
    this.lastTarget = (this.lastTarget || new THREE.Vector3()).copy(target);
    const anchor = this.anchorWorld(_a);
    if (rec.isCart) target.y = anchor.y;   // a cart is pushed along the floor only: its wheels and weight decide its height (and its tilt on a ramp)
    const err = target.clone().sub(anchor);
    if (rec.isCart) rec.pushErr = { x: err.x, z: err.z };   // cart.js: slides off a corner it is pushed into
    // a cart swung round a hairpin trails its spot for a moment (it rolls, it does not fly): it snaps only when stretched for
    // cartStretchGrace s or far past breakDist (spacestation h5: a 180-degree turn snapped it with nothing in the way)
    { const el = err.length(); if (rec.isCart) { this.stretchT = el > C.breakDist ? (this.stretchT || 0) + dt : 0; if (this.stretchT > BEAM.cartStretchGrace || el > C.breakDist * 1.6) { this.stretchT = 0; this.snap('stretch'); return; } }
      else if (el > C.breakDist) { this.snap('stretch'); return; } }
    // a wall between the eye and the grip
    const R = this.phys.R, dl = p.camPos.distanceTo(anchor);
    if (dl > 0.3) {
      const ray = new R.Ray(p.camPos, _u.copy(anchor).sub(p.camPos).normalize());
      const hit = this.phys.world.castRay(ray, dl - 0.12, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, p.col);
      this.blockT = hit ? this.blockT + dt : 0;
      if (this.blockT > BEAM.blockGrace) { this.snap('wall'); return; }
    }

    const errLen = err.length();   // before err is scaled into the wanted velocity below (it is the same vector)
    const light = THREE.MathUtils.clamp((C.newtonsPerStr * str / m) / BEAM.lightAcc, 0, 1);
    const want = err.multiplyScalar(C.spring + BEAM.springLight * light), maxV = C.maxSpeed + BEAM.speedLight * light;
    if (want.length() > maxV) want.setLength(maxV);
    if (!rec.isCart) want.addScaledVector(tv, Math.min(1, 0.35 + light));   // lead by the spot's velocity (heavy items still lag)
    const v = b.linvel();
    const dv = new THREE.Vector3(want.x - v.x, rec.isCart ? 0 : want.y - v.y + CFG.gravity * dt, want.z - v.z);
    const budget = (C.newtonsPerStr * str / m) * dt;
    this.strain = dv.length() / Math.max(1e-6, budget);
    if (dv.length() > budget) dv.setLength(budget);
    b.applyImpulse({ x: dv.x * m, y: dv.y * m, z: dv.z * m }, true);   // through the centre: the grip offset does not spin the item, and a cart pulled by its high bar does not tip (cart.js steers it)
    const w = b.angvel();
    if (cmd.rotate) {   // R + mouse: turn about the view's up and right axes
      const right = _r.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), k = 0.9 / dt;
      b.setAngvel({ x: -cmd.ry * k * right.x, y: -cmd.rx * k, z: -cmd.ry * k * right.z }, true);
    } else if (!rec.isCart) { const k = Math.exp(-dt * BEAM.spinDamp); b.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true); }

    const sm = Math.max(CFG.player.speedFloor, 1 / (1 + rec.mass / str));
    // the beam tugs back: an item lagging behind its spot (heavy, dragged up a ramp) slows the carrier instead of
    // snapping the beam; only a blocked item (a wall, a door) still breaks it at breakDist
    const lag = errLen, tug = THREE.MathUtils.clamp(1 - (lag - 0.6) / 0.8, 0.15, 1);
    p.speedMul = (p.weightHook ? p.weightHook(sm) : sm) * tug;   // Atlas's shoulders
    rec.beamDv = dv.length();
    // dragged on the floor: sparks and a scrape
    const hs = Math.hypot(v.x, v.z), half = CFG.loot.sizes[rec.size]?.half || 0.2, fy = this.floorAt ? this.floorAt(it.x, it.z) : 0;
    this.dragging = hs > BEAM.dragSpark && it.y - half < fy + 0.1 && !rec.isCart;
    if (this.dragging && (this.sparkT -= dt) <= 0) {
      this.sparkT = 0.07;
      const at = new THREE.Vector3(it.x, fy + 0.02, it.z);
      this.melee?.fx.burst(at, new THREE.Vector3(-v.x / hs, 0.5, -v.z / hs), 5, 0);
      if (Math.random() < 0.35) this.sound('scrape', at, 0.35, 0.9 + Math.random() * 0.3);
      this.log.push(['drag', +this.time.toFixed(2)]);
    }
  }

  updateBeam(dt = 1 / 60) {
    const p = this.player;
    if (this.xhair) {
      const can = !this.held && !p.down && !!this.aimed();
      this.xhair.className = 'xhair' + (this.held ? ' hold' : can ? ' can' : '');
      this.xhair.style.display = p.down || this.hidden ? 'none' : '';
    }
    if (!this.held) { this.fx.hide(); for (const h of this.helpFx) h.hide(); this.fx.hideArc(); return; }
    // the emitter: on the right hand when the arms are drawn, else under the eye
    const from = new THREE.Vector3();
    if (this.melee?.arms) this.melee.arms[1].fist.getWorldPosition(from); else from.copy(p.camPos).add(new THREE.Vector3(0.18, -0.22, 0).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ')));
    const to = this.anchorWorld(_a).clone(), dir = p.forward(new THREE.Vector3());
    const s = this.strain;
    this.fx.show(from, dir, to, s, 0.04 + 0.1 * Math.min(1, s) + 0.02 * (this.held.mass || 0) / 20, dt);
    this.helpers.forEach((bt, i) => { const h = this.helpFx[i]; if (!h) return; const bf = new THREE.Vector3(bt.x, (bt.gy || 0) + bt.h * 0.7, bt.z); h.show(bf, to.clone().sub(bf).normalize(), to, s * 0.7, 0.05, dt); });
    for (let i = this.helpers.length; i < this.helpFx.length; i++) this.helpFx[i].hide();
    this.audio?.loopSet?.('hum', 0.12 + 0.18 * Math.min(1.5, s), 0.8 + 0.6 * Math.min(1.5, s), { x: to.x, y: to.y, z: to.z });
    if (this.chargeT >= 0) {   // the throw's arc
      const k = Math.min(1, this.chargeT / BEAM.chargeT), str = p.str, rec = this.held;
      const speed = Math.max(C.throwBase, C.throwMax * str / (str + 2.2 * rec.mass)) * (1 + (BEAM.chargeMax - 1) * k);
      const t0 = rec.body.translation(), v = rec.body.linvel();
      this.fx.showArc(new THREE.Vector3(t0.x, t0.y, t0.z), new THREE.Vector3(v.x * 0.3 + dir.x * speed, v.y * 0.3 + dir.y * speed, v.z * 0.3 + dir.z * speed), CFG.gravity, this.floorAt);
    } else this.fx.hideArc();
  }
}
