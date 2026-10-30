// View-only data per sim name (FgViewDb, data/assets/FgViewDb.json): skin prefab + death FX + icon, action icon +
// melee hit FX + sfx keys, bullet prefab + hit FX + smoke + sfx + impulse type.
export class ViewDb {
  constructor(json) {
    const f = json.fields;
    this.skins = f.skins;
    this.healFx = f.healFx; this.poisonFx = f.poisonFx; this.hitMeleeFx = f.hitMeleeFx; this.lifeBarPrefab = f.lifeBarPrefab;
    this._skins = new Map();
    for (const s of f.skins) { this._skins.set(s.name.toUpperCase(), s); if (s.fruit) this._skins.set(s.fruit.toUpperCase(), s); }
    this._actions = new Map(f.actions.map((a) => [a.name, a]));
    this._bullets = new Map(f.bullets.map((b) => [b.name, b]));
  }

  skin(name) { return name ? this._skins.get(String(name).toUpperCase()) || null : null; }
  skinById(id) { return this.skins.find((s) => s.skinId === id) || null; }
  action(name) { return this._actions.get(name) || null; }
  bullet(name) { return this._bullets.get(name) || null; }

  // every prefab a match with these skins can spawn (preloaded before the start sequence)
  prefabsFor(db, skinIndexes) {
    const out = new Set([this.healFx, this.poisonFx, this.hitMeleeFx, this.lifeBarPrefab]);
    const addBullet = (bi, seen = new Set()) => {
      if (bi < 0 || seen.has(bi)) return;
      seen.add(bi);
      const b = db.bullets[bi];
      const vb = b && this.bullet(b.name);
      if (vb) { out.add(vb.prefab); out.add(vb.fx); out.add(vb.smoke); }
      if (b && b.zone >= 0) addBullet(b.zone, seen);
    };
    for (const si of skinIndexes) {
      const s = db.skins[si];
      const vs = this.skin(s.name);
      if (vs) { out.add(vs.prefab); out.add(vs.deathFx); }
      for (const ai of [s.action, s.special]) {
        const a = db.actions[ai];
        if (!a) continue;
        const va = this.action(a.name);
        if (va) out.add(va.fxMeleeHit);
        addBullet(a.bullet);
      }
    }
    // the sim also spawns bullets that are not an action's own (DropOnDeath, zones): every bullet prefab is cheap JSON
    for (let i = 0; i < db.bullets.length; i++) addBullet(i);
    out.delete(null); out.delete(undefined);
    return [...out];
  }

  sfxKeysFor(db, skinIndexes) {
    const out = new Set(['Jump', 'Hit', 'Death', 'Walk', 'Heal', 'Time', 'Smash', 'Play', 'Music']);
    for (const si of skinIndexes) {
      const s = db.skins[si];
      for (const ai of [s.action, s.special]) {
        const a = db.actions[ai];
        const va = a && this.action(a.name);
        if (va) for (const k of [...va.shootSfx, ...va.meleeSfx, ...va.buffSfx]) if (k) out.add(k);
      }
    }
    for (const b of this._bullets.values()) { if (b.bounceSfx) out.add(b.bounceSfx); if (b.loopSfx) out.add(b.loopSfx); }
    return [...out];
  }
}
