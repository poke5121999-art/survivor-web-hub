// Bullet views (QuantumBulletView + FgViewSpawner): one bullet_* prefab per BulletSpawned, following the
// interpolated BulletState, turned along its velocity (or mirrored when m_lockRotation), ally/enemy sprite,
// loop / bounce sfx, a trailing smoke prefab and a camera impulse when it goes away.
import { SimEventType, SimConst } from '../../sim/index.js';

class BulletView {
  constructor(ctx, e, def, vb, ally) {
    this.ctx = ctx;
    this.id = e.bullet;
    this.def = def;
    this.vb = vb;
    this.inst = ctx.prefabs.spawn(vb.prefab, null, [e.pos.x, e.pos.y, 0]);
    this.root = this.inst.root;
    const mb = this.root.script('QuantumBulletView');
    const f = mb ? mb.fields : {};
    this.lockRotation = !!f.m_lockRotation;
    const ref = (r) => (r ? this.inst.ref(r) : null);
    this.smokeRoot = ref(f.m_smokeRoot);
    const allyN = ref(f.m_ally), enemyN = ref(f.m_enemy);
    if (allyN) allyN.setActive(ally || !enemyN);
    if (enemyN) enemyN.setActive(!ally);
    const imp = this.root.script('CinemachineImpulseSource');
    this.impulse = imp && imp.fields.ImpulseDefinition ? imp.fields.ImpulseDefinition : null;
    this.scale0 = this.root.ls.slice();
    const b = ctx.runner.findBullet(ctx.runner.state, this.id);
    this.bossScale = b && b.fromBoss ? SimConst.BossScale : 1;
    this.goingLeft = false;
    if (vb.loopSfx) this.loop = ctx.audio.loop(vb.loopSfx, 0.6);
    if (vb.smoke) this.smoke = ctx.prefabs.spawn(vb.smoke, null, this.smokePos());
    this.apply(b, b);
  }

  smokePos() { const w = (this.smokeRoot || this.root).world; return [w[12], w[13], w[14]]; }

  apply(prev, cur) {
    if (!cur) return;
    const a = this.ctx.runner.alpha;
    const r = this.root;
    r.lp[0] = prev.pos.x + (cur.pos.x - prev.pos.x) * a;
    r.lp[1] = prev.pos.y + (cur.pos.y - prev.pos.y) * a;
    const v = (cur.velocity.x * cur.velocity.x + cur.velocity.y * cur.velocity.y) > 1e-6 ? cur.velocity : cur.direction;
    const moving = (v.x * v.x + v.y * v.y) > 1e-6;
    if (moving) this.goingLeft = v.x < 0;
    let k = this.bossScale;
    const sod = cur.scaleOnDistance > 0 ? cur.scaleOnDistance : this.def.scaleOnDistance;
    if (sod > 0) k *= 1 + (sod - 1) * Math.max(0, Math.min(1, cur.distanceTraveled / 10));
    const s = [this.scale0[0] * k, this.scale0[1] * k, this.scale0[2] * k];
    if (this.lockRotation) {
      r.setEuler(0, 0, 0);
      s[0] = this.goingLeft ? -Math.abs(s[0]) : Math.abs(s[0]);
    } else if (moving) r.setEuler(0, 0, Math.atan2(v.y, v.x) * 180 / Math.PI);
    r.ls[0] = s[0]; r.ls[1] = s[1]; r.ls[2] = s[2];
  }

  update() {
    const run = this.ctx.runner;
    const cur = run.findBullet(run.state, this.id);
    if (!cur) return;
    this.apply(run.findBullet(run.prev, this.id) || cur, cur);
    if (this.smoke) { this.root.updateWorld(null); const p = this.smokePos(); this.smoke.root.lp[0] = p[0]; this.smoke.root.lp[1] = p[1]; }
  }

  release() {
    if (this.loop) this.loop.stop();
    if (this.impulse && this.vb.impulseType) {
      // CinemachineImpulseSource: amplitude fades with the distance to the listener (DissipationDistance)
      const d = Math.hypot(this.root.lp[0] - this.ctx.audio.listener[0], this.root.lp[1] - this.ctx.audio.listener[1]);
      const fall = Math.max(0, 1 - d / (this.impulse.DissipationDistance || 15));
      const amp = (this.impulse.AmplitudeGain || 1) * fall;
      const dur = (this.impulse.ImpulseDuration || 0.2) + ((this.impulse.TimeEnvelope && this.impulse.TimeEnvelope.DecayTime) || 0) * 0.5;
      if (amp > 0.05 && this.ctx.engine.cine) this.ctx.engine.cine.shake(0.12 * amp * this.vb.impulseType, dur);
    }
    if (this.smoke) this.ctx.prefabs.softDestroy(this.smoke, 2);
    this.smoke = null;
    this.root.destroy();
  }
}

export class BulletViews {
  constructor(ctx) {
    this.ctx = ctx;
    this.map = new Map();
    this.spawned = 0;
  }

  onEvent(e) {
    if (e.type === SimEventType.BulletSpawned) this.spawn(e);
    else if (e.type === SimEventType.BulletDestroyed) {
      const v = this.map.get(e.bullet);
      if (v) { this.map.delete(e.bullet); v.release(); }
    } else if (e.type === SimEventType.BulletRebounded) {
      const v = this.map.get(e.bullet);
      if (v && v.vb.bounceSfx) this.ctx.audio.sfxAt(v.vb.bounceSfx, e.pos.x, e.pos.y);
    }
  }

  spawn(e) {
    const { db, viewDb, runner } = this.ctx;
    const def = db.bullets[e.int];
    if (!def) return;
    const vb = viewDb.bullet(def.name);
    if (!vb || !vb.prefab || !this.ctx.prefabs.has(vb.prefab)) return;
    const src = runner.agent(e.agent);
    this.map.set(e.bullet, new BulletView(this.ctx, e, def, vb, !!(src && runner.isAlly(src))));
    this.spawned++;
  }

  update() {
    const run = this.ctx.runner;
    for (const [id, v] of this.map) {
      const b = run.findBullet(run.state, id);
      // a bullet created and destroyed between two frames never shows; drop views whose bullet is gone
      if (!b || !b.alive) { this.map.delete(id); v.release(); continue; }
      v.update();
    }
  }

  clear() { for (const v of this.map.values()) v.release(); this.map.clear(); }
}

// QuantumFXListener: the bullet's hit FX where it is destroyed, the melee hit FX on the target of a melee window
export class FxListener {
  constructor(ctx) { this.ctx = ctx; this.count = 0; }

  onEvent(e) {
    const { db, viewDb, runner, prefabs } = this.ctx;
    if (e.type === SimEventType.BulletDestroyed) {
      const def = db.bullets[e.int];
      const vb = def && viewDb.bullet(def.name);
      if (vb && vb.fx && prefabs.spawnFx(vb.fx, [e.pos.x, e.pos.y, 0], e.flag ? SimConst.BossScale : 1)) this.count++;
    } else if (e.type === SimEventType.AgentTookDamage && e.value > 0) {
      const src = runner.agent(e.other);
      if (!src || !src.meleeWindowOpen) return;
      const idx = src.currentIsSpecial ? src.specialRef : src.actionRef;
      const act = db.actions[idx];
      const va = act && viewDb.action(act.name);
      const prefab = va && va.fxMeleeHit ? va.fxMeleeHit : viewDb.hitMeleeFx;
      const t = runner.agent(e.agent);
      let x = e.pos.x, y = e.pos.y;
      if (t) {
        const sk = db.skins[t.skin];
        let off = sk.hitCenterOffsetY > 0 ? sk.hitCenterOffsetY : 1;
        if (t.isBoss) off *= SimConst.BossScale;
        x = t.pos.x; y = t.pos.y + off;
      }
      if (prefabs.spawnFx(prefab, [x, y, 0])) this.count++;
    }
  }
}
