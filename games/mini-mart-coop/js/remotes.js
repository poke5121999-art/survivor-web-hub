// The other players on this screen: a clone of the player rig each, their carried stack, a name tag, and the flights
// their pickups, drops and payments start. Poses arrive 10-15 times a second, so the avatar eases toward them.
import * as THREE from 'three';
import { ITEM_HEIGHT } from '../../casual-farm/js/sim/sim.js';

const COLORS = ['#ff5a5a', '#4fb3ff', '#ffd23f', '#7ee06b', '#c77dff'];
const tmp = new THREE.Vector3();

export class RemotePlayers {
  constructor({ view, store, camera, canvas, hudRoot }) {
    Object.assign(this, { view, store, camera, canvas, hudRoot });
    this.avatars = new Map();
    this.slotName = view.playerSlot && view.playerSlot.name;
    this.tags = document.createElement('div');
    this.tags.className = 'mmc-tags';
    hudRoot.appendChild(this.tags);
  }

  colorOf(pid) {
    const n = pid === 'host' ? 0 : (parseInt(String(pid).replace(/\D/g, ''), 10) || 0);
    return COLORS[n % COLORS.length];
  }

  avatar(pid, r) {
    let a = this.avatars.get(pid);
    if (a) return a;
    const v = this.view, obj = v.cloneObject(v.player);
    v.player.parent.add(obj);
    let slot = null;
    if (this.slotName) obj.traverse(c => { if (!slot && c.name === this.slotName) slot = c; });
    const tag = document.createElement('div');
    tag.className = 'mmc-tag';
    tag.style.setProperty('--c', this.colorOf(pid));
    this.tags.appendChild(tag);
    a = { obj, slot: slot || obj, rig: v.rigOf(obj), tag, pose: { x: r.player.x, y: 0, z: r.player.z, dirX: 0, dirZ: 1 } };
    this.avatars.set(pid, a);
    if (v.fx) v.fx.puff('small', { x: r.player.x, y: 1, z: r.player.z });
    return a;
  }

  remove(pid) {
    const a = this.avatars.get(pid);
    if (!a) return;
    this.view.syncStack(`r${pid}`, [], () => {});
    a.obj.removeFromParent();
    a.tag.remove();
    this.avatars.delete(pid);
  }

  update(dt, remotes) {
    for (const pid of [...this.avatars.keys()]) if (!remotes[pid]) this.remove(pid);
    const k = 1 - Math.exp(-dt * 14), w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    for (const [pid, r] of Object.entries(remotes)) {
      const a = this.avatar(pid, r), p = a.pose, q = r.player;
      if (Math.hypot(q.x - p.x, q.z - p.z) > 10) { p.x = q.x; p.z = q.z; } else { p.x += (q.x - p.x) * k; p.z += (q.z - p.z) * k; }
      p.y = q.y || 0;
      if (q.dirX || q.dirZ) { p.dirX = q.dirX; p.dirZ = q.dirZ; }
      this.view.placeAgent(a.obj, p);
      const carrying = r.carry.length > 0;
      if (a.rig) {
        a.rig.play(q.moving ? (carrying ? 'WalkingCarry' : 'Walking') : (carrying ? 'Idle_Carry' : 'Idle'));
        a.rig.update(dt);
      }
      this.view.syncStack(`r${pid}`, r.carry, (g, j) => { g.position.set(0, ITEM_HEIGHT * j, 0); g.rotation.set(0, 0, 0); }, a.slot);
      tmp.set(p.x, 13, p.z).project(this.camera);
      a.tag.textContent = r.name || 'Player';
      a.tag.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  // Same animations as GameView.onEvent for the screen's own player, started from this player's avatar.
  onEvent(e) {
    const v = this.view, s = this.store, key = `r${e.pid}`, a = this.avatars.get(e.pid);
    const at = a ? a.pose : null;
    switch (e.type) {
      case 'pickup':
        v.fly(key, e.index, s.producers[e.producer].outSlots[e.slot], 0.15, e.item, 0);
        break;
      case 'drop': {
        const from = v.worldOfStack(key, e.from) || (at && { x: at.x, y: 3, z: at.z });
        if (!from) break;
        if (e.to.kind === 'shelf') v.fly(`shelf${e.to.i}`, e.slot, from, 0.35, e.item, 3);
        else if (e.to.kind === 'producer') v.fly(`in${e.to.i}.${e.to.k}`, null, from, 0.35, e.item, 3);
        else v.fly(null, null, from, 0.35, e.item, 3, e.to.kind === 'car' ? v.sim.cars.point : s.trash[e.to.i].pos);
        break;
      }
      case 'payMat': {
        const m = s.mats.find(x => x.name === e.name);
        if (m && at) v.fly(null, null, { x: at.x, y: 4, z: at.z }, 0.45, 11, 8, { x: m.zone.middle.x, y: (m.zone.middle.y || 0) + 0.5, z: m.zone.middle.z }, { ease: 'linear', spin: true });
        break;
      }
      case 'collect': {
        const pile = v.stacks.get(`cash${e.cashier}`);
        const from = pile && pile.length ? v.worldOfStack(`cash${e.cashier}`, Math.min(e.index, pile.length - 1)) : null;
        if (from && at) v.fly(null, null, from, 0.5, 11, 8, { x: at.x, y: 4, z: at.z }, { ease: 'linear', spin: true });
        break;
      }
      default:
        break;
    }
  }

  dispose() {
    for (const pid of [...this.avatars.keys()]) this.remove(pid);
    this.tags.remove();
  }
}
