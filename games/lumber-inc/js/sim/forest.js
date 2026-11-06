// Trees and chopping, as TreeCtrller and RoleChopTriggerComponent do it (D:\lumber-ref\rules\chop-carry.md A, B):
// a choppable tree within 1.2 m of a chopper takes every swing's damage; at 0 hp it falls (1 s), turns into a stump
// and drops 2 logs straight into the chopper's pack, or onto the ground when the pack is full. A stump regrows after
// 60 s, but only once its ground logs are gone.
export const TREE = { STAND: 0, STUMP: 2, FALLING: 3 };
export const CHOP_RADIUS = 1.2;
const FALL_SEC = 1.0;
const REGROW_SEC = 60;
const GROW_SEC = 0.5;
export const LOGS_PER_TREE = 2;
export const WOOD = 10;

export class Forest {
  // trees: describeWorld().trees; hp: TreeCtrller.stateHp of the prefab (100 on every tree of map 1).
  constructor(trees, hp = 100) {
    this.trees = trees.map((t, i) => ({ ...t, i, hp, maxHp: hp, state: TREE.STAND, timer: 0, ground: 0 }));
    // 6 m buckets for neighbour queries.
    this.grid = new Map();
    this.trees.forEach(t => {
      const k = key(t.pos.x, t.pos.z);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(t);
    });
  }

  near(p, r) {
    const out = [];
    const cx = Math.floor(p.x / 6), cz = Math.floor(p.z / 6);
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        for (const t of this.grid.get(`${x},${z}`) || []) {
          if ((t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2 <= r * r) out.push(t);
        }
      }
    }
    return out;
  }

  choppable(p, forestOpen) {
    return this.near(p, CHOP_RADIUS).filter(t => t.state === TREE.STAND && forestOpen(t.forest));
  }

  // One swing (the chop clip's EvtGetWood event): damage every choppable tree in reach.
  swing(p, dmg, forestOpen, events, chopper) {
    for (const t of this.choppable(p, forestOpen)) this.hit(t, dmg, chopper, events);
  }

  hit(t, dmg, chopper, events) {
    if (t.state !== TREE.STAND) return;
    t.hp -= dmg;
    events.push({ type: 'treeHit', tree: t.i });
    if (t.hp <= 0) {
      t.state = TREE.FALLING;
      t.timer = FALL_SEC;
      t.chopper = chopper;
      events.push({ type: 'treeFall', tree: t.i });
    }
  }

  // FarmMgr.GetNearestAvailableTree + ShowChopDesire: a worker books the nearest standing tree nobody else booked.
  reserve(w, forestId) {
    let best = null, bd = Infinity;
    for (const t of this.trees) {
      if (t.state !== TREE.STAND || t.forest !== forestId || (t.res && t.res !== w)) continue;
      const d = (t.pos.x - w.x) ** 2 + (t.pos.z - w.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    this.release(w);
    if (best) best.res = w;
    return best;
  }

  release(w) {
    for (const t of this.trees) if (t.res === w) t.res = null;
  }

  pickupTree(t, room) {
    const n = Math.min(room, t.ground);
    t.ground -= n;
    return n;
  }

  // Advances falls and regrowth. give(tree, n) hands logs to the tree's chopper and returns how many it took.
  tick(dt, give, events) {
    for (const t of this.trees) {
      if (t.state === TREE.FALLING) {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = TREE.STUMP;
          t.timer = REGROW_SEC;
          const took = give(t, LOGS_PER_TREE);
          t.ground += LOGS_PER_TREE - took;
          t.chopper = null;
          events.push({ type: 'treeDown', tree: t.i, took, ground: t.ground });
        }
      } else if (t.state === TREE.STUMP) {
        t.timer -= dt;
        if (t.timer <= 0) {
          if (t.ground > 0) { t.timer = REGROW_SEC; continue; }
          t.state = TREE.STAND;
          t.hp = t.maxHp;
          t.grow = GROW_SEC;
          events.push({ type: 'treeGrow', tree: t.i });
        }
      }
    }
  }

  // Ground logs of trees whose 1.2 m trigger the role is in go into its pack as far as it has room.
  pickup(p, room, events) {
    let got = 0;
    for (const t of this.near(p, CHOP_RADIUS)) {
      while (t.ground > 0 && got < room) {
        t.ground--;
        got++;
        events.push({ type: 'logPickup', tree: t.i });
      }
    }
    return got;
  }
}

const key = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
