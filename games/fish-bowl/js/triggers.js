// AS.TriggerEvents on BoxColliders: the player's body sphere entering / leaving a trigger box runs the component's
// OnTriggerEnterEvent / OnTriggerExitEvent (all of them are tagged "Player"). Gameplay code can listen too
// (ThrowSimulation waits for its target's trigger). Only active objects whose collider is a trigger fire.
import { BoxVolume, activeInHierarchy } from './unity.js';

export class Triggers {
  constructor(env, comps, events) {
    this.events = events;
    this.list = [];
    this.byPath = new Map();
    const pathOf = o => { const s = []; for (let a = o; a && a !== env.root; a = a.parent) s.unshift(a.name); return s.join('/'); };
    for (const obj of env.objects) {
      const k = obj.userData.node.k;
      if (!k || !k['AS.TriggerEvents'] || !k.BoxCollider) continue;
      const path = pathOf(obj);
      const t = { path, obj, vol: new BoxVolume(obj, k.BoxCollider), def: comps[path]?.['AS.TriggerEvents'] || {},
        isTrigger: !!k.BoxCollider.m_IsTrigger, enabled: k.BoxCollider.m_Enabled !== false, inside: false, listeners: [] };
      this.list.push(t);
      this.byPath.set(path, t);
    }
    this.initial = this.list.map(t => t.isTrigger);
  }

  reset() {
    this.list.forEach((t, i) => { t.isTrigger = this.initial[i]; t.inside = false; t.listeners = []; });
  }

  setIsTrigger(path, on) { const t = this.byPath.get(path); if (t) t.isTrigger = !!on; }

  // fn(entered: bool)
  listen(path, fn) {
    const t = this.byPath.get(path);
    if (!t) return () => {};
    t.listeners.push(fn);
    return () => { t.listeners = t.listeners.filter(f => f !== fn); };
  }

  // Is the player (centre p, radius r) inside this trigger right now (ignores enter/exit bookkeeping)?
  contains(path, p, r) {
    const t = this.byPath.get(path);
    return !!t && activeInHierarchy(t.obj) && t.vol.overlaps(p, r);
  }

  update(p, r) {
    for (const t of this.list) {
      const live = t.isTrigger && t.enabled && activeInHierarchy(t.obj);
      const now = live && t.vol.overlaps(p, r);
      if (now === t.inside) continue;
      t.inside = now;
      if (!live && !now) continue; // deactivated while inside: Unity sends no exit to a disabled object's events
      this.events.run(now ? t.def.OnTriggerEnterEvent : t.def.OnTriggerExitEvent);
      for (const fn of [...t.listeners]) fn(now);
    }
  }
}
