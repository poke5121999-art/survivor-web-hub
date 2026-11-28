// Self-play bot. Plays the sim through the same inputs a player gives (aim ray, primary/interact, tool keys,
// shop buys). In node it "walks" by moving the feet at the player's move speed; in the browser the view
// drives the real controller toward bot.goal instead.
import { TOOL } from './game.js';
import { NX, CELL, OX, OZ } from './pile.js';

export class Bot {
  constructor(game, opts = {}) {
    this.g = game; this.state = 'dig'; this.goal = null; this.t = 0; this.log = [];
    this.lastProgress = 0; this.lastMoney = 0; this.stalls = 0; this.speed = opts.speed || 5.5;
    this.target = null; this.pressed = false;
  }
  // choose a dig spot: money cell reachable from the lobby edge first, then deeper cells
  pickDig() {
    const f = this.g.field; let best = null, bestS = -Infinity;
    const p = this.g.player.pos;
    for (let k = 0; k < 200; k++) {
      const cx = Math.floor(Math.random() * NX), cz = Math.floor(Math.random() * NX), c = cz * NX + cx;
      if (f.count[c] <= 0) continue;
      const x = OX + (cx + 0.5) * CELL, z = -(OZ + (cz + 0.5) * CELL);
      const s = f.topY(c) * 2 - Math.hypot(x - p[0], z - p[2]) * 0.15;
      if (s > bestS) { bestS = s; best = { x, z, c }; }
    }
    if (best) return best;
    // thin leftovers: scan every cell, nearest first
    let bd = Infinity;
    for (let c = 0; c < NX * NX; c++) {
      if (f.count[c] <= 0) continue;
      const x = OX + ((c % NX) + 0.5) * CELL, z = -(OZ + (((c / NX) | 0) + 0.5) * CELL), d = Math.hypot(x - p[0], z - p[2]);
      if (d < bd) { bd = d; best = { x, z, c }; }
    }
    return best;
  }
  shop() {
    const e = this.g.econ; let bought = 0;
    // goal chain: every upgrade on the requiresUpgrade path to the next tool unlock / drone bay
    const goal = new Set();
    const next = ['bucket.unlock', 'shovel.unlock', 'automation.drone_bay', 'vacuum.unlock'].find(id => !e.isMaxed(id));
    for (let x = next && e.upById.get(next), k = 0; x && k < 20; x = e.upById.get(x.requiresUpgrade), k++) if (e.lvl(x.id) < 1) goal.add(x.id);
    for (let guard = 0; guard < 50; guard++) {
      let best = null, bc = Infinity;
      for (const u of this.g.data.content.upgrades) {
        if (!e.isVisible(u.id) || e.isMaxed(u.id)) continue;
        const c = e.cost(u.id);
        // income first: tool unlocks, drones, grab/carry/rate/value/shredder; movement last
        const income = (u.modifiers || []).some(m => [4, 5, 7, 8, 10, 12, 19, 20, 24, 25, 28, 29, 30, 41, 43, 44].includes(m.stat));
        const pri = goal.has(u.id) ? c * 0.5 : income ? c : c * 20;
        if (pri < bc) { bc = pri; best = u.id; }
      }
      if (!best || e.cost(best) > e.dollars) break;
      if (e.buy(best)) { bought++; this.log.push(`${this.g.played.toFixed(0)}s buy ${best}`); }
      else break;
    }
    // learn every affordable proficiency node
    for (let guard = 0; guard < 50; guard++) {
      const n = this.g.data.content.nodes.find(n => e.canLearn(n.id) === true);
      if (!n) break; e.learn(n.id);
    }
    return bought;
  }
  bestTool() { for (const t of [3, 2, 1]) if (this.g.unlocked(t)) return t; return 0; }

  // returns the input for this frame; moves feet itself when walk=true (node)
  step(dt, walk = true) {
    const g = this.g; this.t += dt;
    const inp = { primaryHeld: false, primaryPressed: false, interactPressed: false };
    const feet = g.player.pos.slice();
    const tool = this.bestTool();
    if (g.tool !== tool) g.selectTool(tool);
    const full = g.tool === TOOL.Hand ? g.handHeld() >= g.handCap(1) : g.bagFree() < Math.max(1, g.bagCapacity() * 0.03);
    if (this.state === 'dig') {
      // re-pick when the cell is empty or nothing was taken for 4 s (aim blocked, out of reach)
      const took = g.econ.stats.tracked.ItemsCollected || 0;
      if (took !== this.lastTook) { this.lastTook = took; this.idleT = 0; } else if (this.atSpot) this.idleT = (this.idleT || 0) + dt;
      if (!this.target || g.field.count[this.target.c] <= 0 || this.idleT > 4) { if (this.idleT > 4) this.repicks = (this.repicks || 0) + 1; this.target = this.pickDig(); this.idleT = 0; }
      if (!this.target) return inp;     // nothing found this frame; try again next frame
      const tgt = this.target;
      const stand = [tgt.x, g.field.topY(tgt.c), tgt.z + 1.6];
      this.goal = stand;
      const d = Math.hypot(stand[0] - feet[0], stand[2] - feet[2]);
      this.atSpot = !(walk && d > 0.3);
      if (!this.atSpot) this.walk(feet, stand, dt);
      else {
        inp.eye = [feet[0], g.field.topY(tgt.c) + 1.64, tgt.z + 1.6];
        const v = [tgt.x - inp.eye[0], g.field.topY(tgt.c) - inp.eye[1], tgt.z - inp.eye[2]]; const l = Math.hypot(...v);
        inp.dir = v.map(a => a / l);
        inp.primaryHeld = true; inp.primaryPressed = !this.pressed; this.pressed = true;
        if (walk) feet[1] = Math.max(feet[1], g.field.topY(tgt.c));
      }
      if (full || (g.tool === TOOL.Hand && g.handHeld() > 0 && this.t > 25) || (g.tool !== TOOL.Hand && g.bagUnits() > 0 && this.t > 60)) { this.state = 'haul'; this.pressed = false; this.t = 0; }
    } else if (this.state === 'haul') {
      const p = g.markers.shredderInteract; const stand = [p[0] - 1.5, 3.0, p[2]];
      this.goal = stand;
      const d = Math.hypot(stand[0] - feet[0], stand[2] - feet[2]);
      if (walk && d > 0.5) this.walk(feet, stand, dt);
      else if (!g.stream) {
        inp.interactPressed = true;
        if ((g.tool === TOOL.Hand ? g.handHeld() : g.bag.reduce((a, b) => a + b, 0)) <= 0) { this.shop(); this.state = 'dig'; this.target = null; this.t = 0; }
      } else inp.interactHeld = true;
    }
    if (walk) g.player.pos = feet;
    inp.feet = feet;
    return inp;
  }
  walk(feet, to, dt) {
    const dx = to[0] - feet[0], dz = to[2] - feet[2], d = Math.hypot(dx, dz);
    const s = Math.min(d, this.speed * 1.6 * dt);
    feet[0] += dx / d * s; feet[2] += dz / d * s;
    const h = this.g.field.heightAt(feet[0], feet[2]);
    feet[1] = isFinite(h) ? Math.max(h, -36) : (feet[2] > 0 ? 3 : feet[1]);
  }
}
