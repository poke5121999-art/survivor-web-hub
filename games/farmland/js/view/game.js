// Draws the Farm sim: parcels (open / on offer / hidden), field cells and plants, drops, avatar, HUD tags.
import * as THREE from 'three';
import { WorldView } from './world.js';
import { Rig, GenericRig, genericControllers } from './anim.js';
import { FieldBatch } from './fieldbatch.js';
import { RULES } from '../sim/farm.js';

const tmp = new THREE.Vector3();

export class GameView {
  constructor(stage, worldSD, propsSD, data, farm, hud) {
    this.stage = stage;
    this.props = propsSD;
    this.data = data;
    this.farm = farm;
    this.hud = hud;
    this.world = new WorldView(worldSD, data);
    stage.scene.add(this.world.root);
    this.wet = new THREE.Color().setRGB(...data.wetColor, THREE.SRGBColorSpace);
    this.dry = new THREE.Color().setRGB(...data.dryColor, THREE.SRGBColorSpace);
    this.protoCache = new Map();
    this.tags = document.createElement('div');
    this.tags.className = 'tags';
    hud.appendChild(this.tags);
    this.priceTags = new Map();
    this.cellObjs = new Map(); // field index -> FieldBatch
    this.dropObjs = new Map();
    this.flying = [];
    this.pops = [];   // scale-in tweens (OutBack-ish)
    this.buildAvatar();
    this.refreshParcels();
    this.merchantTags = farm.merchants.map(m => this.merchantTag(m));
    // MarchandAnimator: Idle (StandingArmSpace) and Happy while HappyDuration runs after a sale
    this.merchantRigs = farm.merchants.map(m => {
      const st = this.world.obj(m.d.node)?.getObjectByName('LolTapStickman');
      return st ? new Rig(st) : null;
    });
    // Workers live in the world prefab under their barn; detach them so the sim can move them anywhere.
    // Their SkinRoot is empty in the prefab: GameController.BaseWorkerSkin (Resources/skins/BaseWorker) is put in at runtime.
    const skin = this.props.find('BaseWorker');
    this.workerObjs = farm.workers.list.map(w => {
      const o = this.world.obj(w.node);
      if (!o) return null;
      this.world.root.attach(o);
      o.visible = false;
      if (skin >= 0) {
        const body = this.props.build(skin, { all: true });
        for (const n of ['Bike', 'FishingRod']) { const b = body.getObjectByName(n); if (b) b.visible = false; }
        const can = body.getObjectByName('WateringCan (1)');
        if (can) can.visible = true;
        o.userData.tools = { seed: body.getObjectByName('SeedCup (1)'), water: body.getObjectByName('NormalCan'),
          scythe: body.getObjectByName('Sythe (1)') };
        o.userData.bag = body.getObjectByName('WorkerGrainBag');
        o.add(body);
      }
      o.userData.rig = new Rig(o);
      return o;
    });
    this.barnPanel = null;
    // Animals: the skinned model's parent carried the Animator (AC_<Model>); tracks are paths below it
    const ctrls = new Set(genericControllers());
    this.animalRigs = [];
    const seen = new Set();
    this.world.root.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const model = o.parent, holder = model?.parent, ac = `AC_${model?.name}`;
      if (!holder || !ctrls.has(ac) || seen.has(holder)) return;
      seen.add(holder);
      const rig = new GenericRig(holder, ac);
      if (rig.ok) this.animalRigs.push({ rig, holder });
    });
    // animal i of the sim -> its rigs (the AnimalController node is an ancestor of the model)
    this.animalOf = farm.animals.map(a => {
      const root = this.world.obj(a.d.node);
      return root ? this.animalRigs.filter(r => { for (let p = r.holder; p; p = p.parent) if (p === root) return true; return false; }) : [];
    });
    // locked-sprite pops and tree shakes re-sync their frozen matrices through world.touch()
    const f = farm, dyn = [...this.workerObjs, ...this.animalRigs.map(r => r.holder)];
    for (const m of f.merchants) dyn.push(this.world.obj(m.d.node)?.getObjectByName('LolTapStickman'));
    this.frozen = this.world.freeze(dyn);
  }

  proto(name) {
    if (!this.protoCache.has(name)) {
      const i = this.props.find(name);
      this.protoCache.set(name, i >= 0 ? this.props.build(i) : null);
    }
    return this.protoCache.get(name);
  }

  instance(name) {
    const p = this.proto(name);
    if (!p) return null;
    const o = p.clone();
    o.position.set(0, 0, 0);
    return o;
  }

  buildAvatar() {
    this.avatar = new THREE.Object3D();
    this.setSkin('BasePlayer');
    this.stage.scene.add(this.avatar);
  }

  // HumanController.SetSkin: the player's body is a skin prefab (Resources/skins/<id>, art/skins); BasePlayer is the
  // Loltap_Player's own LolTapStickman (props). Skins carry their own tools and bike; returns false when unknown.
  setSkin(id, skinsSD = this.skinsSD) {
    const own = !id || id === 'BasePlayer' || !skinsSD;
    const sd = own ? this.props : skinsSD;
    const i = own ? this.props.find('LolTapStickman', this.props.find('Loltap_Player')) : skinsSD.find(id);
    if (i < 0) return false;
    if (this.avatarBody) this.avatar.remove(this.avatarBody);
    const body = this.avatarBody = sd.build(i, { all: true });
    body.position.set(0, 0, 0);   // some skin prefabs keep an authoring offset on their root (CharacterGreen 7.15, 0, 17.89)
    this.skinId = own ? 'BasePlayer' : id;
    const find = re => { let r = null; body.traverse(o => { if (!r && re.test(o.name)) r = o; }); return r; };
    // the bike, fishing rod and the worker's grain bag only show in their modes
    for (const re of [/^Bike$/, /^FishingRod$/, /^WorkerGrainBag$/]) { const o = find(re); if (o) o.visible = false; }
    // tools follow the field state (PlayerController.FieldTool: seed bag, watering can, scythe)
    this.tools = { seed: find(/^SeedCup/), water: find(/^NormalCan$/), scythe: find(/^Sythe/) };
    body.updateMatrixWorld(true);
    if (own) {
      // LolTapStickman nests them (SeedCup -> Sythe -> NormalCan): reparent each to the hand bone
      const hand = this.tools.seed?.parent;
      for (const t of Object.values(this.tools)) if (t && hand && t.parent !== hand) hand.attach(t);
    } else {
      // skins hang each tool under an inactive holder (WateringCan (1)): open the holders, the tool itself decides
      for (const t of Object.values(this.tools)) for (let a = t?.parent; a && a !== body; a = a.parent) if (!a.isBone && !/^(root|pelvis|spine|clavicle|upperarm|lowerarm|hand|index|thumb|neck|head|thigh|calf|foot)/.test(a.name)) a.visible = true;
      for (const t of Object.values(this.tools)) if (t) t.visible = false;
    }
    this.shownTool = undefined;
    // show every tool for the first 3 frames so their shaders (main + shadow depth) compile now, not on the first field
    // step; the very first frame renders before the sun's shadow map exists, so one frame alone compiles the wrong variant
    this.toolWarm = 4;
    this.rig = new Rig(body);
    // the bike hangs under the pelvis (pelvis/BikeModel); the riding clips raise and pitch the pelvis, so the remake keeps
    // the bike where the prefab's rest pose puts it (upright, wheels on the ground) relative to the character root
    this.bikeModel = find(/^BikeModel/);
    this.avatarBike = this.bikeModel?.getObjectByName('Bike') || null;
    this.bikeRel = null;
    if (this.bikeModel) this.bikeRel = body.matrixWorld.clone().invert().multiply(this.bikeModel.matrixWorld);
    body.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.avatar.add(body);
    return true;
  }

  // ---- parcels -------------------------------------------------------------------------------------------------
  refreshParcels() {
    const f = this.farm;
    for (const p of f.parcels) {
      const vis = this.world.obj(p.d.visual), assets = this.world.obj(p.d.assets);
      const offer = f.available(p);
      if (vis) vis.visible = p.open || offer;
      if (assets) assets.visible = p.open;
      // Locked parcel on offer: no land, only the LockedSprite frame (ParcelLocked sprite) with the price on it
      if (vis) vis.visible = p.open;
      const ls = this.world.obj(p.d.lockedSprite);
      if (ls) {
        // LockedSprite is authored at scale 0; the game pops it in when the parcel goes on offer
        if (offer && !ls.visible) { ls.visible = true; ls.scale.setScalar(0.01); this.pops.push({ o: ls, t: 0, to: 1.5 }); }
        else if (!offer) ls.visible = false;
      }
      if (offer) this.ensurePriceTag(p); else this.dropPriceTag(p);
      if (p.open) this.updateRoad(p);
      if (p.open) this.ensureFieldCells(p);
    }
  }

  // Parcel.Roads = [End, I, L, T, X]; Neighbors = [UP, RIGHT, DOWN, LEFT]. The road piece shows only on parcels that
  // carry one in the prefab (inactive children); we pick the piece from open neighbours that also have roads.
  updateRoad(p) {
    if (!p.d.roads.length || p.d.roads.every(r => r == null)) return;
    const hasRoad = q => q && q.open && q.d.roads.length && !q.d.field;
    const n = p.d.nb.map(i => (i >= 0 ? hasRoad(this.farm.parcels[i]) : false));
    const c = n.filter(Boolean).length;
    // Unity rotation of road pieces is unknown until RULES; keep the prefab's own state for now.
    void c;
  }

  ensurePriceTag(p) {
    if (this.priceTags.has(p.i)) return;
    const el = document.createElement('div');
    el.className = 'tag price';
    el.innerHTML = `<span></span><img src="${this.data.ui.coin}" alt="">`;
    this.tags.appendChild(el);
    this.priceTags.set(p.i, el);
  }

  dropPriceTag(p) {
    const el = this.priceTags.get(p.i);
    if (el) { el.remove(); this.priceTags.delete(p.i); }
  }

  merchantTag(m) {
    const el = document.createElement('div');
    el.className = 'tag sign';
    // MerchandBubble: "Sell me:" + each crop with its current price
    el.innerHTML = `<b>Sell me:</b><div class="row">${m.d.crops.map(c => `<div class="it"><img src="${this.data.crops[c]?.icon || ''}" alt="${c}">`
      + `<span><img src="${this.data.ui.coin}" alt="">x<i>0</i></span></div>`).join('')}</div>`;
    this.tags.appendChild(el);
    return el;
  }

  // ---- fields --------------------------------------------------------------------------------------------------
  ensureFieldCells(p) {
    for (const f of this.farm.fields) {
      if (f.parcel !== p || this.cellObjs.has(f.i)) continue;
      const batch = new FieldBatch(this, f, this.world.root);
      this.cellObjs.set(f.i, batch);
      f.cells.forEach((c, k) => this.setCell(f, k));
    }
  }

  setCell(f, k) {
    const c = f.cells[k];
    this.cellObjs.get(f.i)?.setCell(k, c.state, this.data.crops[f.crop]?.prefabs || [], c.state === 2 ? this.wet : this.dry);
  }

  // ---- events --------------------------------------------------------------------------------------------------
  handle(e) {
    const f = this.farm;
    this.onEvent?.(e);
    this.sound?.event(e, f);
    switch (e.type) {
      case 'cell': {
        this.setCell(f.fields[e.f], e.c);
        break;
      }
      case 'drop': {
        const name = this.data.crops[e.drop.crop]?.drop;
        const o = (name && this.instance(name)) || new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshLambertMaterial({ color: 0xffcc00 }));
        o.position.set(e.drop.x, 0, e.drop.z);
        Object.assign(o.userData, { t: 0, x: e.drop.x, z: e.drop.z, tx: e.drop.tx, tz: e.drop.tz });
        this.world.root.add(o);
        this.dropObjs.set(e.drop.id, o);
        break;
      }
      case 'pick': {
        const o = this.dropObjs.get(e.drop.id);
        if (o) { this.dropObjs.delete(e.drop.id); this.flying.push({ o, t: 0, from: o.position.clone() }); }
        break;
      }
      case 'unlock':
        this.refreshParcels();
        break;
      case 'animal':
        for (const r of this.animalOf[e.a] || []) r.rig.play('Bounce', true);
        break;
      case 'travel':
        this.onTravel?.();
        break;
      case 'sell':
        this.floatText(f.merchants[e.m].d.pos, `+${e.value}`);
        break;
      default: break;
    }
  }

  floatText(pos, text) {
    const el = document.createElement('div');
    el.className = 'tag float';
    el.textContent = text;
    this.tags.appendChild(el);
    this.place(el, tmp.set(pos[0], 2.2, pos[2]));
    setTimeout(() => el.remove(), 900);
  }

  // Screen-space tag; clamp keeps wide bubbles inside the portrait frame.
  place(el, v, clamp = el.classList.contains('sign')) {
    const r = this.stage.renderer.domElement;
    const p = v.clone().project(this.stage.camera);
    const w = r.clientWidth, h = r.clientHeight;
    if (p.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    let x = (p.x + 1) / 2 * w;
    if (clamp) { const half = el.offsetWidth / 2 + 6; x = Math.max(half, Math.min(w - half, x)); }
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${(1 - p.y) / 2 * h}px)`;
  }

  // ---- barn popup (PopupWorker): barn capacity upgrade + three workers ----------------------------------------------
  updateBarnPanel() {
    const f = this.farm, b = f.barns.find(x => x.parcel?.open && f.barnNear(x));
    if (!b) { if (this.barnPanel) { this.barnPanel.remove(); this.barnPanel = null; } return; }
    if (!this.barnPanel || this.barnPanel.barn !== b) {
      this.barnPanel?.remove();
      const el = document.createElement('div');
      el.className = 'panel ui';
      el.barn = b;
      el.innerHTML = `<h3><img src="art/ui/BarnIcon.png" alt="">Barns</h3>
        <div class="row cap"><span>Barn capacity <b></b></span><button data-a="barn"></button></div>
        ${[0, 1, 2].map(k => `<div class="row wk"><img alt=""><span>Worker ${k + 1} <i></i></span><button data-a="w${k}"></button></div>`).join('')}`;
      el.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (!a) return;
        if (a === 'barn') f.upgradeBarn(b); else f.hireWorker(b, +a.slice(1));
      });
      this.hud.appendChild(el);
      this.barnPanel = el;
    }
    const el = this.barnPanel, coin = `<img src="${this.data.ui.coin}" alt="">`;
    el.querySelector('.cap b').textContent = `${fmt(f.barnStock(b))}/${fmt(f.barnCapacity(b))}`;
    const bb = el.querySelector('[data-a=barn]'), bp = f.barnPrice(b);
    bb.innerHTML = bp === Infinity ? 'Maxed' : `Upgrade ${coin}${fmt(bp)}`;
    bb.disabled = !(bp <= f.coins);
    el.querySelectorAll('.wk').forEach((row, k) => {
      const lv = b.workers[k], price = f.workerPrice(b, k), locked = k > 0 && !b.workers[k - 1];
      row.querySelector('img').src = lv ? 'art/ui/WorkerIcon.png' : 'art/ui/WorkerIconLocked.png';
      row.querySelector('i').textContent = lv ? `Lvl ${lv}` : 'No Worker';
      const btn = row.querySelector('button');
      btn.innerHTML = price === Infinity ? 'Maxed' : `${lv ? 'Upgrade' : 'Hire'} ${coin}${fmt(price)}`;
      btn.disabled = locked || !(price <= f.coins);
    });
  }

  // ---- frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    const f = this.farm, pl = f.player;
    for (const e of f.events) this.handle(e);
    f.events.length = 0;
    // avatar
    this.avatar.position.set(pl.x, 0, pl.z);
    const want = Math.atan2(pl.dirX, pl.dirZ);
    let d = want - this.avatar.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.avatar.rotation.y += d * Math.min(1, dt * 12);
    // on the bike (BaseCharacter Bike-Idle / Driving) the bike clips replace the locomotion blend tree
    const bike = f.mods.speed > 1 ? (pl.moving ? 'LT_Bike_Driving' : 'LT_Bike_Idle') : null;
    if (this.rig.ok) this.rig.update(dt, (pl.speed || 0) / (f.mods.speed || 1), pl.tool, bike);
    if (bike && this.bikeRel) {
      this.avatar.updateMatrixWorld(true);
      const bm = this.bikeModel;
      bm.matrixAutoUpdate = false;
      bm.matrix.copy(bm.parent.matrixWorld).invert().multiply(this.avatarBody.matrixWorld).multiply(this.bikeRel);
    }
    else {
      this.walkT = (this.walkT || 0) + (pl.moving ? dt * 10 : 0);
      this.avatarBody.position.y = pl.moving ? Math.abs(Math.sin(this.walkT)) * 0.12 : 0;
    }
    if (this.toolWarm) {
      this.toolWarm--;
      for (const t of Object.values(this.tools)) if (t) { t.visible = this.toolWarm > 0; t.traverse(o => { o.frustumCulled = this.toolWarm === 0; }); }
      this.shownTool = undefined;
    } else if (this.shownTool !== pl.tool) {
      this.shownTool = pl.tool;
      for (const [k, o] of Object.entries(this.tools)) if (o) o.visible = k === pl.tool;
    }
    // growing plants pop in
    for (const batch of this.cellObjs.values()) batch.update(dt);
    // drops hop from the plant to their landing spot (FieldCell.SpawnDrops hop tween), then wait for Collect
    for (const o of this.dropObjs.values()) {
      const u = o.userData;
      u.t += dt;
      const k = Math.min(1, u.t / 0.25);
      o.position.x = u.x + (u.tx - u.x) * k;
      o.position.z = u.z + (u.tz - u.z) * k;
      o.position.y = Math.sin(k * Math.PI) * 0.8 + 0.05;
      o.rotation.y += dt * 4;
    }
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const pp = this.pops[k];
      pp.t = Math.min(1, pp.t + dt / 0.35);
      const t = pp.t - 1, back = 1 + 2.70158 * t * t * t + 1.70158 * t * t;   // easeOutBack
      pp.o.scale.setScalar(Math.max(0.01, back * pp.to));
      this.world.touch(pp.o);   // inside a frozen subtree: re-sync explicitly
      if (pp.t >= 1) this.pops.splice(k, 1);
    }
    // animals on open parcels within ~40 u of the player play their clips (off-screen ones keep their last pose)
    for (const r of this.animalRigs) {
      if (tmp.setFromMatrixPosition(r.holder.matrixWorld).distanceTo(this.avatar.position) < 40) r.rig.update(dt);
    }
    f.merchants.forEach((m, i) => {
      const rig = this.merchantRigs[i];
      if (rig?.ok && m.parcel?.open) rig.update(dt, 0, null, m.happy > 0 ? 'Happy' : 'StandingArmSpace');
    });
    // workers follow the sim; barn bags fill with stock (Barn.Bags shown in proportion to stock / capacity)
    f.workers.list.forEach((w, i) => {
      const o = this.workerObjs[i];
      if (!o) return;
      o.visible = w.state !== 'off';
      o.matrixWorldAutoUpdate = o.visible;   // 27 unhired workers x ~136 nodes otherwise update every frame
      if (!o.visible) return;
      o.position.set(w.x, 0, w.z);
      o.rotation.set(0, Math.atan2(w.dirX, w.dirZ), 0);
      const rig = o.userData.rig, tool = w.state === 'field' && !w.moving ? w.tool : null;
      if (o.userData.shownTool !== tool && o.userData.tools) {
        o.userData.shownTool = tool;
        for (const [k, t] of Object.entries(o.userData.tools)) if (t) t.visible = k === tool;
      }
      // WorkerController grain bag: scale 1 -> 3 with the purse (GRAINBAG_DEFAULT_SCALE / GRAINBAG_MAX_SCALE)
      if (o.userData.bag) o.userData.bag.scale.setScalar(1 + 2 * Math.min(1, w.purse / 50));
      if (rig?.ok) rig.update(dt, w.moving ? f.workers.speed(w) : 0, tool);
      else o.position.y = w.moving ? Math.abs(Math.sin(f.time * 10 + i)) * 0.1 : 0;
    });
    f.barns.forEach(b => {
      if (!b.parcel?.open) return;
      const n = Math.ceil(b.d.bags.length * Math.min(1, f.barnStock(b) / f.barnCapacity(b)));
      if (b.shownBags !== n) { b.shownBags = n; b.d.bags.forEach((bi, k) => { const o = this.world.obj(bi); if (o) o.visible = k < n; }); }
    });
    this.updateBarnPanel();
    // trees: visible fruit slots follow the sim's fruit count; the crown wobbles while being shaken
    f.trees.forEach(t => {
      if (!t.parcel?.open) return;
      const n = f.treeFruits(t);
      if (t.shownFruits !== n) {
        t.shownFruits = n;
        t.d.fruits.forEach((fi, k) => { const o = this.world.obj(fi); if (o) o.visible = k < n; });
      }
      const root = this.world.obj(t.d.treeRoot);
      const rz = t.shake > 0 ? Math.sin(t.shake * 30) * 0.06 : 0;
      if (root && root.rotation.z !== rz) { root.rotation.z = rz; this.world.touch(root); }
    });
    // picked drops fly to the avatar and vanish
    for (let k = this.flying.length - 1; k >= 0; k--) {
      const fl = this.flying[k];
      fl.t += dt / 0.25;
      const to = tmp.set(pl.x, 1.2, pl.z);
      fl.o.position.lerpVectors(fl.from, to, Math.min(1, fl.t));
      fl.o.position.y += Math.sin(Math.min(1, fl.t) * Math.PI) * 1.2;
      fl.o.scale.setScalar(Math.max(0.05, 1 - fl.t * 0.7));
      if (fl.t >= 1) { this.world.root.remove(fl.o); this.flying.splice(k, 1); }
    }
    // tags
    for (const [i, el] of this.priceTags) {
      const p = f.parcels[i];
      el.firstChild.textContent = fmt(f.price(p) - p.paid);
      const ls = this.world.obj(p.d.lockedSprite);
      if (ls) ls.getWorldPosition(tmp); else tmp.set(p.d.pos[0], 0, p.d.pos[2]);
      this.place(el, tmp);
    }
    f.merchants.forEach((m, i) => {
      const el = this.merchantTags[i];
      if (!m.parcel?.open || Math.hypot(pl.x - m.d.pos[0], pl.z - m.d.pos[2]) > 9) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.querySelectorAll('i').forEach((x, k) => { x.textContent = fmt(f.cropPrice(m.d.crops[k])); });
      this.place(el, tmp.set(m.d.pos[0], 3.4, m.d.pos[2]));
    });
  }
}

export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const u = ['K', 'M', 'B', 'T', 'aa', 'ab', 'ac'];
  let k = -1;
  while (n >= 1000 && k < u.length - 1) { n /= 1000; k++; }
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '') + u[k];
}
