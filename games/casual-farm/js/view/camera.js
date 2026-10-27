// Camera highlight after a mat completes (progression.md, Camera): 1.0 s later the camera blends (EaseIn, 1.0 s) to
// each highlight target and stays 2.0 s on it, then returns to the player; control is locked for the shot + 0.5 s.
// Targets are the mat's objectToHighlight / secondObjectToHighlight; when both are empty the first two activated
// workers or mats at least 12 m away are used. Store tiles skip the targets and zoom out for 1.5 s instead.
const DELAY = 1.0, BLEND = 1.0, HOLD = 2.0, LOCK_EXTRA = 0.5, AUTO_MIN = 12, TILE_ZOOM = 1.5, TILE_OUT = 1.35, UPGRADE_HOLD = 1.5;

const easeIn = t => t * t;
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });

export class CameraDirector {
  constructor(sim, store) {
    this.sim = sim;
    this.store = store;
    this.shots = [];
    this.focus = { x: sim.state.player.x, z: sim.state.player.z };
    sim.listeners.push(e => {
      if (e.type === 'matDone') this.onMatDone(e.name);
      if (e.type === 'levelUp' || (e.type === 'upgraded' && !e.pad)) this.onUpgrade(e);
    });
  }

  where(name) {
    const m = this.store.mats.find(x => x.name === name);
    if (m) return m.zone ? m.zone.middle : m.pos;
    const i = this.store.node(name);
    return i != null ? this.store.pos(i) : null;
  }

  onMatDone(name) {
    const mat = this.store.mats.find(m => m.name === name);
    if (!mat) return;
    const t0 = this.sim.state.t + DELAY;
    if (/Tile/i.test(name)) {
      this.shots.push({ start: t0, end: t0 + TILE_ZOOM, zoomOut: true });
      return;
    }
    let names = mat.highlight || [];
    if (!names.length) {
      const here = mat.pos;
      names = mat.activate.map(a => a.name)
        .filter(n => /Worker/.test(n) || this.store.mats.some(m => m.name === n))
        .filter(n => { const p = this.where(n); return p && Math.hypot(p.x - here.x, p.z - here.z) >= AUTO_MIN; })
        .slice(0, 2);
    }
    const points = names.map(n => this.where(n)).filter(Boolean);
    if (!points.length) return;
    const start = Math.max(t0, ...this.shots.map(s => s.end));
    const end = start + points.length * HOLD;
    this.shots.push({ start, end, points });
    const pl = this.sim.state.player;
    pl.frozen = Math.max(pl.frozen, end + LOCK_EXTRA - this.sim.state.t);
    pl.moving = false;
  }

  // CameraController.ImmediateHighlightAfterUpgradeFor: the upgrade cam follows what was upgraded for 1.5 s and
  // control is taken away for 2.0 s (rules/upgrade-menu.md section 7).
  onUpgrade(e) {
    const st = this.sim.state;
    let follow;
    if (e.type === 'upgraded') follow = () => st.player;
    else if (e.slot.kind === 'producer') { const p = this.store.producers[e.slot.i].spawn; follow = () => p; } else {
      const w = (st.workers || []).find(x => x.name === e.slot.name);
      if (!w) return;
      follow = () => w;
    }
    const t = st.t;
    this.shots = this.shots.filter(s => !s.follow);
    this.shots.push({ start: t, end: t + UPGRADE_HOLD, follow });
    st.player.frozen = Math.max(st.player.frozen, UPGRADE_HOLD + LOCK_EXTRA);
    st.player.moving = false;
  }

  // World point the camera follows this frame and the zoom factor (1 = normal ortho size).
  update() {
    const t = this.sim.state.t, pl = this.sim.state.player;
    this.shots = this.shots.filter(s => t < s.end + BLEND);
    const shot = this.shots.find(s => t >= s.start);
    let focus = { x: pl.x, z: pl.z }, zoom = 1;
    if (shot && shot.follow) {
      if (!shot.from) shot.from = { ...this.focus };
      const p = shot.follow();
      focus = t < shot.end ? lerp(shot.from, p, easeIn(Math.min((t - shot.start) / 0.5, 1))) : lerp(p, focus, easeIn(Math.min((t - shot.end) / BLEND, 1)));
    } else if (shot && shot.zoomOut) {
      if (t < shot.end) zoom = 1 + (TILE_OUT - 1) * Math.sin(Math.PI * (t - shot.start) / TILE_ZOOM);
    } else if (shot) {
      if (!shot.from) shot.from = { ...this.focus };
      if (t < shot.end) {
        const i = Math.min(Math.floor((t - shot.start) / HOLD), shot.points.length - 1);
        focus = lerp(i ? shot.points[i - 1] : shot.from, shot.points[i], easeIn(Math.min((t - shot.start - i * HOLD) / BLEND, 1)));
      } else {
        focus = lerp(shot.points[shot.points.length - 1], focus, easeIn(Math.min((t - shot.end) / BLEND, 1)));
      }
    }
    this.focus = focus;
    return { ...focus, zoom };
  }
}
