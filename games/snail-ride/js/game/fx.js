// Bridges scenes to the particle simulator (engine/particles.js).
import { attachParticles, updateParticles } from '../engine/particles.js?v=20261102a';
export function makeParticleHost() {
  const byScene = new WeakMap();
  const lists = s => { if (!byScene.has(s)) byScene.set(s, new Map()); return byScene.get(s); };
  return {
    attach(scene) { for (const g of scene.rootGOs || []) this.attachTo(scene, g); },
    attachTo(scene, g) {
      const list = attachParticles(g, { worldRoot: scene.scene });
      if (list && list.length) lists(scene).set(g, list);
    },
    detach(g) { /* sims are children of g.obj (or world root); dispose them */
      for (const s of [this._last].filter(Boolean)) { const m = lists(s); const l = m.get(g); if (l) { for (const p of l) p.dispose && p.dispose(); m.delete(g); } }
    },
    update(scene, dt) {
      this._last = scene;
      for (const [g, l] of lists(scene)) { if (g.destroyed) { for (const p of l) p.dispose && p.dispose(); lists(scene).delete(g); continue; } updateParticles(l, dt); }
    },
  };
}
