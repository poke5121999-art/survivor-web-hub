// Prefabs loaded ahead of the match so views can spawn them inside a frame (Quantum views spawn synchronously),
// plus fire-and-forget FX that remove themselves once their particles are done (FG.View.FxSpawner).
export class PrefabPool {
  constructor(engine) {
    this.engine = engine;
    this.data = new Map();
    this.fx = [];
  }

  async preload(names) {
    const list = [...new Set(names.filter(Boolean).map((n) => n.replace(/^prefab:/, '')))];
    await Promise.all(list.map(async (n) => { if (!this.data.has(n)) this.data.set(n, await this.engine.assets.prefab(n)); }));
  }

  has(name) { return !!name && this.data.has(name.replace(/^prefab:/, '')); }

  spawn(name, parent = null, pos = null) {
    const d = name && this.data.get(name.replace(/^prefab:/, ''));
    if (!d) return null;
    const inst = this.engine.spawn(d, parent);
    if (pos) { const r = inst.root; r.lp[0] = pos[0]; r.lp[1] = pos[1]; r.lp[2] = pos[2] ?? r.lp[2]; r.updateWorld(parent ? parent.world : null); }
    return inst;
  }

  spawnFx(name, pos, scale = 1) {
    const inst = this.spawn(name, null, pos);
    if (!inst) return null;
    if (scale !== 1) for (let i = 0; i < 3; i++) inst.root.ls[i] *= scale;
    this.fx.push({ inst, die: this.engine.time + lifetime(inst) });
    return inst;
  }

  update() {
    const t = this.engine.time;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (t >= f.die) { f.inst.root.destroy(); this.fx.splice(i, 1); }
    }
  }

  // stop emitting now, remove once the last particles had time to fade (Destroy(go, 2f) after StopEmitting)
  // QuantumBulletView.SoftDestroySmoke: Stop(StopEmitting) then Destroy(go, duration + startLifetime)
  softDestroy(inst) {
    if (!inst) return;
    let delay = 0;
    for (const ps of inst.root.inChildren('ParticleSystem')) {
      if (ps.runtime) ps.runtime.stop(false);
      delay = Math.max(delay, (ps.dur || 0) + maxOf(ps.main && ps.main.life));
    }
    this.fx.push({ inst, die: this.engine.time + (delay || 2) });
  }

  clear() {
    for (const f of this.fx) f.inst.root.destroy();
    this.fx.length = 0;
  }
}

const maxOf = (c) => (c ? (c.m === 0 ? c.s : c.m === 3 ? Math.max(c.s, c.mn) : c.s) : 0);

function lifetime(inst) {
  // DestroyAfterDelay (every Fx_hit_* / Fx_death_* root) despawns the FX at m_delay, whatever its particles do
  const dad = inst.root.script && inst.root.script('DestroyAfterDelay');
  if (dad && dad.fields && dad.fields.m_delay > 0) return dad.fields.m_delay;
  let t = 0.5;
  for (const ps of inst.root.inChildren('ParticleSystem')) {
    if (ps.loop) continue;
    t = Math.max(t, (ps.dur || 0) + maxOf(ps.main && ps.main.life) + maxOf(ps.delay));
  }
  for (const an of inst.root.inChildren('Animator')) {
    const rt = an.runtime;
    if (!rt || !rt.ctrl) continue;
    for (const L of rt.ctrl.layers) for (const s of L.sm.states) for (const c of rt.stateClips(s)) t = Math.max(t, c.len || 0);
  }
  return Math.min(t + 0.2, 6);
}
