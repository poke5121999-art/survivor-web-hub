// The town on screen (rules/hometown.md): each built lot shows its HouseInfoConf house (art/houses1, loaded after the
// game starts) scaled by the lot's m_Scale and the house's Scale, turned by its Rotation; unbuilt lots keep their fence.
// The house being built stands on the construction site and fills in piece by piece with the squares delivered
// (ConstructionBuilding.CheckBuildingFragment: shown pieces = floor(cur / need x pieces)). World buttons: the build tip
// over the next lot (HomeTownWarning) and the claim tip over the site once it is full.
import * as THREE from 'three';

export class TownView {
  constructor({ scene3, view, world, sim, hud, ui, houses }) {
    Object.assign(this, { scene3, view, world, sim, hud, ui });
    this.tpl = new Map();
    this.built = new Map(); // lot id -> { o, house }
    this.site = null; // { o, house, pieces }
    houses.then(h => {
      h.root.children.forEach(o => { o.position.set(0, 0, 0); this.tpl.set(o.name.toLowerCase(), o); });
      this.sync();
    });
  }

  make(houseId) {
    const h = this.sim.town.houses.get(houseId);
    const t = h && this.tpl.get(h.Prefab.toLowerCase());
    if (!t) return null;
    const o = t.clone(true);
    o.visible = true;
    o.userData.house = h;
    return o;
  }

  // HomeTownBuilding+DisplayClass25_0: the house goes under the lot's activeRoot at local 0, Euler y = Rotation + 180,
  // local scale = the lot's m_Scale (HouseInfoConf.Scale is not applied there).
  place(o, lot, at) {
    const h = o.userData.house;
    const root = this.view.objects[lot.activeRoot != null ? lot.activeRoot : lot.node];
    const q = root.getWorldQuaternion(new THREE.Quaternion());
    o.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((h.Rotation || 0) + 180) * Math.PI / 180));
    o.scale.setScalar(lot.scale || 1);
    const w = at || root.getWorldPosition(new THREE.Vector3());
    o.position.set(w.x, 0, w.z);
    this.scene3.add(o);
  }

  // Fences and houses follow the saved town; called on status changes and when the house models arrive.
  sync() {
    const T = this.sim.town;
    for (const b of T.lots) {
      const done = T.unlocked(b.book);
      if (b.fenceNode != null) this.view.objects[b.fenceNode].visible = !done;
      const want = done && this.tpl.size ? T.houseId(b) : 0;
      const cur = this.built.get(b.id);
      if (cur && cur.house === want) continue;
      if (cur) this.scene3.remove(cur.o);
      this.built.delete(b.id);
      const o = want && this.make(want);
      if (o) { this.place(o, b, null); this.built.set(b.id, { o, house: want }); }
    }
    const lot = T.current(), site = T.site;
    const want = lot && this.tpl.size ? T.houseId(lot) : 0;
    if (!this.site || this.site.house !== want || this.site.lot !== (lot && lot.id)) {
      if (this.site) this.scene3.remove(this.site.o);
      this.site = null;
      const o = want && this.make(want);
      if (o && site && site.housePos != null) {
        this.place(o, lot, this.world.pos(site.housePos));
        const pieces = [];
        o.traverse(m => { if (m.isMesh) pieces.push(m); });
        this.site = { o, house: want, lot: lot.id, pieces, shown: -1 };
      }
    }
    if (site && site.objBuild != null) this.view.objects[site.objBuild].visible = !lot;
  }

  update() {
    const T = this.sim.town;
    if (this.site) {
      const b = T.current();
      const k = b ? Math.min(1, T.lot(b.id).cur / T.need(b)) : 0;
      const n = Math.floor(k * this.site.pieces.length);
      if (n !== this.site.shown) {
        this.site.shown = n;
        this.site.pieces.forEach((m, i) => { m.visible = i < n; });
      }
    }
    const next = T.next(), cur = T.current(), site = T.site;
    this.hud.worldButton('townBuild', next && next.pos, 'mainpanel_btn_build', () => this.onBuild && this.onBuild(next.id));
    this.hud.worldButton('townClaim', cur && T.ready() && site ? site.buildBox.middle : null, 'mainpanel_btn_build', () => this.onClaim && this.onClaim(cur.id));
    this.hud.worldTag('townSite', cur && !T.ready() && site ? site.buildBox.middle : null, 'PropIcon_Squaretimber', `${T.lot(cur ? cur.id : 0).cur}/${cur ? T.need(cur) : 0}`, 4);
    // ResidentEntry over each built house in the town view: the house's next level (an ad, granted here) and the
    // tenant for the slot it opens (HomeTownBookUpPanel -> ResidentAdvPanel, H E9).
    for (const lot of T.lots) {
      const up = this.townMode && T.unlocked(lot.book) && T.houseLv(lot.book) < 3;
      this.hud.worldButton(`houseUp${lot.id}`, up ? lot.pos : null, 'mainpanel_icon_upgrade', () => {
        if (T.upgradeHouse(lot.book) && this.onTenant) this.onTenant(lot.book, T.houseLv(lot.book));
      }, 6);
    }
    const st = T.store;
    this.hud.worldTag('townStore', st && this.sim.active(st.id) ? st.pos : null, 'PropIcon_Squaretimber', `${this.sim.stock(`${st ? st.id : 0}:in`)}`, 3);
  }
}
