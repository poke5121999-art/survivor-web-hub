// The account layer on screen: diamond pill, piggy bank and bike buttons, the PetSpot / BikeSpot popups, pets that
// follow the player (PetController), the bike under the player (SetBikeState). Rules: js/sim/meta.js.
import * as THREE from 'three';
import { GenericRig } from './anim.js';
import { META, PETS } from '../sim/meta.js';
import { fmt } from './game.js';

const SPOT_R = 1.6;   // TrialSpot trigger around the DockingPoint (inferred)
// PetController per-prefab values (PetCat.prefab:328-341, PetDog.prefab:360-373)
const PET = {
  Cat: { speed: 6, move: 4, tp: 15, stand: 3, turn: 720, roam: [1, 2], icon: 'art/ui/Pet_Cat.png', bonus: `+${Math.round((META.catCoin - 1) * 100)}% coins` },
  Dog: { speed: 5, move: 3, tp: 15, stand: 2, turn: 500, roam: [0.5, 1], icon: 'art/ui/Pet_Dog.png', bonus: `+${Math.round((META.dogBarn - 1) * 100)}% barns` },
};
const hours = ms => (ms >= 3600e3 ? `${Math.floor(ms / 3600e3)}h ${Math.floor(ms / 60e3) % 60}m` : `${Math.ceil(ms / 60e3)}m`);
const tmp = new THREE.Vector3();

export class MetaView {
  constructor(view, meta, hud) {
    this.v = view; this.m = meta; this.hud = hud; this.f = view.farm;
    this.spots = view.data.spots || {};
    this.pets = {};
    this.panel = null;
    hud.insertAdjacentHTML('beforeend', `<div class="pill hc"><img src="art/ui/Diamond_Icon.png" alt=""><span>0</span></div>
<div class="piggy ui"><img src="art/ui/UI_PiggyBankSmall2.png" alt="piggy bank"><i></i></div>
<div class="bikebtn ui"><img alt="bike"></div>
<img class="skinsbtn ui" src="art/ui/Skins.png" alt="characters">`);
    hud.querySelector('.skinsbtn').addEventListener('click', () => (this.panel?.kind === 'skins' ? this.close() : this.open('skins')));
    this.browse = 0;
    this.hcEl = hud.querySelector('.hc span');
    this.piggyEl = hud.querySelector('.piggy');
    this.bikeEl = hud.querySelector('.bikebtn');
    this.piggyEl.addEventListener('click', () => this.open('piggy'));
    this.bikeEl.addEventListener('click', () => { if (!this.m.toggleBike()) this.open('bike'); });
    // spot previews (PetsSpot.Choices: cat idx 0, dog idx 1) hide while that pet is owned (RefreshPetVisibility)
    this.previews = (this.spots.pet?.choices || []).map(i => view.world.obj(i));
    this.bikePreview = view.world.obj(this.spots.bike?.root);
  }

  // ---- popups -----------------------------------------------------------------------------------------------
  open(kind) {
    if (this.panel?.kind === kind) return;
    this.close();
    const el = document.createElement('div');
    el.className = 'panel ui meta';
    el.kind = kind;
    el.addEventListener('click', e => this.click(e.target.closest('button')?.dataset.a));
    this.hud.appendChild(el);
    this.panel = el;
    this.render();
  }
  close() { this.panel?.remove(); this.panel = null; }

  price(o) { return o.hc ? `<img src="art/ui/Diamond_Icon.png" alt="">${o.hc} · ${o.hours}h` : `Try ${o.hours}h`; }

  render() {
    const el = this.panel, m = this.m;
    if (!el) return;
    if (el.kind === 'pet') {
      const o = m.petOffer();
      el.innerHTML = `<h3><img src="art/ui/Pet_Cat.png" alt="">${o.kind === 'trial' ? `Try a bonus pet for ${o.hours} hours.` : 'Adopt a bonus pet.'}</h3>
        ${PETS.map(id => `<div class="row"><img src="${PET[id].icon}" alt=""><span>${id} <i>${PET[id].bonus}${m.hasPet(id) ? ` · ${hours(m.petLeft(id))} left` : ''}</i></span>
        <button data-a="pet:${id}" ${o.hc > m.fs.hc ? 'disabled' : ''}>${this.price(o)}</button></div>`).join('')}`;
    } else if (el.kind === 'bike') {
      const o = m.bikeOffer();
      el.innerHTML = `<h3><img src="art/ui/Bike.png" alt="">${o.kind === 'trial' ? `Try it for ${o.hours} hour!` : 'Get your bike'}</h3>
        <div class="row"><img src="art/ui/BikeOn.png" alt=""><span>Go anywhere faster! <i>x${META.bikeSpeed} speed${m.hasBike() ? ` · ${hours(m.fs.bike - Date.now())} left` : ''}</i></span>
        <button data-a="bike" ${o.hc > m.fs.hc ? 'disabled' : ''}>${this.price(o)}</button></div>`;
    } else if (el.kind === 'skins') {
      // SkinSelector: owned characters to wear (BasePlayer + UnlockedSkins), random unlock among the locked ones
      const owned = ['BasePlayer', ...m.fs.skins], id = owned[(this.browse % owned.length + owned.length) % owned.length];
      const price = m.skinPrice(), left = m.lockedSkins().length;
      el.innerHTML = `<h3><img src="art/ui/Skins.png" alt="">Player Character <i>${m.fs.skins.length + 1}/${m.pool.length + 1}</i></h3>
        <div class="row"><button data-a="prev">‹</button><span class="skinname">${id}${id === m.fs.skin ? ' ✓' : ''}</span><button data-a="next">›</button></div>
        <div class="row"><button data-a="wear" ${id === m.fs.skin ? 'disabled' : ''}>Select</button>
        <button data-a="roll" ${left && price <= m.fs.hc ? '' : 'disabled'}>${left ? `<img src="art/ui/Lock_Icon.png" alt="">Unlock <img src="art/ui/Diamond_Icon.png" alt="">${price}` : 'All unlocked'}</button>
        <button data-a="close">Close</button></div>`;
      this.preview(id);
    } else if (el.kind === 'newskin') {
      el.innerHTML = `<h3><img src="art/ui/Skins.png" alt="">New Character Unlocked!</h3>
        <div class="row"><span class="skinname">${m.fs.skin}</span><button data-a="close">OK</button></div>`;
    } else if (el.kind === 'piggy') {
      el.innerHTML = `<h3><img src="art/ui/UI_PiggyBank.png" alt="">Piggy bank</h3>
        <div class="row"><span>Crack it to collect what's inside! At each crack it will level up! <i>${m.fs.piggy} / ${m.piggyCap()}</i></span>
        <button data-a="crack" ${m.piggyReady() ? '' : 'disabled'}>${m.piggyReady() ? `Collect <img src="art/ui/Diamond_Icon.png" alt="">${m.fs.piggy}` : 'Not ready'}</button></div>
        <div class="row"><button data-a="close">Close</button></div>`;
    }
  }

  // show a skin on the player (loads art/skins on first use)
  async preview(id) {
    if (this.v.skinId === id) return;
    if (id !== 'BasePlayer' && !this.v.skinsSD) this.v.skinsSD = await this.loadSkins();
    this.v.setSkin(id);
  }

  click(a) {
    if (!a) return;
    if (a === 'close') { this.close(); this.preview(this.m.fs.skin); return; }
    if (a === 'prev' || a === 'next') { this.browse += a === 'next' ? 1 : -1; this.render(); return; }
    if (a === 'wear') { const owned = ['BasePlayer', ...this.m.fs.skins]; this.m.selectSkin(owned[(this.browse % owned.length + owned.length) % owned.length]); this.render(); return; }
    if (a === 'roll') {
      const id = this.m.rollSkin();
      if (id) { this.browse = this.m.fs.skins.length; this.close(); this.open('newskin'); this.preview(id); }
      return;
    }
    if (a.startsWith('pet:')) this.m.getPet(a.slice(4));
    else if (a === 'bike') this.m.getBike();
    else if (a === 'crack') this.m.crackPiggy();
    this.render();
  }

  // ---- pets -------------------------------------------------------------------------------------------------
  spawnPet(id) {
    const i = this.v.props.find(`Pet${id}`);
    if (i < 0) return null;
    const o = this.v.props.build(i);
    const pl = this.f.player;
    o.position.set(pl.x + 1.5, 0, pl.z + 1.5);
    let rig = null;
    o.traverse(c => { if (!rig && c.isSkinnedMesh) rig = new GenericRig(c.parent.parent, `AC_${c.parent.name}`); });
    this.v.world.root.add(o);
    return { id, o, rig: rig?.ok ? rig : null, x: o.position.x, z: o.position.z, yaw: 0, tx: 0, tz: 0, roamT: 0, state: 'follow', moving: 0 };
  }

  // PetController: follow at BaseSpeed scaled 1 -> 0.1 between MoveDistThreshold and DistToPlayer, roam slowly when
  // close, teleport beside the player past TPDistThreshold.
  stepPet(p, dt) {
    const c = PET[p.id], pl = this.f.player;
    let d = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (d > c.tp) { p.x = pl.x + 1.2; p.z = pl.z + 1.2; d = Math.hypot(pl.x - p.x, pl.z - p.z); }
    let tx, tz, sp;
    if (d > c.stand) {
      p.state = 'follow';
      tx = pl.x; tz = pl.z;
      sp = c.speed * (1 - 0.9 * Math.max(0, Math.min(1, (d - c.move) / (c.stand - c.move))));
    } else {
      if (p.state !== 'roam' || (p.roamT -= dt) <= 0) {
        p.state = 'roam';
        p.roamT = c.roam[0] + Math.random() * (c.roam[1] - c.roam[0]);
        const a = Math.random() * Math.PI * 2;
        p.tx = pl.x + Math.cos(a) * c.stand; p.tz = pl.z + Math.sin(a) * c.stand;
      }
      tx = p.tx; tz = p.tz; sp = c.speed * 0.1;   // RoamSpeedMultiplier 0.1
    }
    const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz);
    const step = Math.min(l, sp * dt);
    p.moving = l > 0.05 ? sp : 0;
    if (l > 0.05) {
      p.x += dx / l * step; p.z += dz / l * step;
      const want = Math.atan2(dx, dz);
      let dy = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
      const turn = c.turn * Math.PI / 180 * dt;
      p.yaw += Math.max(-turn, Math.min(turn, dy));
    }
    p.o.position.set(p.x, 0, p.z);
    p.o.rotation.y = p.yaw;
    if (p.rig && !p.celebrate) {
      const want = p.moving > 3 ? 'Run' : p.moving > 0.3 ? 'Walk' : 'Idle A';
      if (p.rig.state !== want && !(want === 'Idle A' && p.rig.once)) p.rig.play(want);
    }
    p.rig?.update(dt);
    if (p.celebrate && (p.celebrate -= dt) <= 0) p.celebrate = 0;
  }

  celebrate(id) {
    const p = this.pets[id];
    if (p?.rig) { p.rig.play('Spin/Splash', true); p.celebrate = 0.834; }   // PetController celebrate 0.834 s
  }

  event(e) {
    if (e.type === 'unlock') this.m.addPiggy(META.piggyPerParcel);
    if (e.type === 'sell' && this.m.hasPet('Cat')) this.celebrate('Cat');
    if (e.type === 'barnOut' && this.m.hasPet('Dog')) this.celebrate('Dog');
  }

  // ---- frame --------------------------------------------------------------------------------------------------
  update(dt) {
    const m = this.m, f = this.f, pl = f.player, now = Date.now();
    f.mods = m.mods(now);
    this.hcEl.textContent = fmt(m.fs.hc);
    // piggy bank button: fill ratio, wiggles when Ready
    this.piggyEl.querySelector('i').style.width = `${Math.round(100 * m.fs.piggy / m.piggyCap())}%`;
    this.piggyEl.classList.toggle('ready', m.piggyReady());
    // bike button: shown once a bike is owned/rented; BikeOn = mount picto (red bg), BikeOff = dismount (green bg)
    const has = m.hasBike(now);
    if (!has && m.fs.onBike) m.fs.onBike = false;
    this.bikeEl.style.display = has ? '' : 'none';
    const img = this.bikeEl.firstChild, src = m.fs.onBike ? 'art/ui/BikeOff.png' : 'art/ui/BikeOn.png';
    if (!img.src.endsWith(src)) img.src = src;
    this.bikeEl.style.backgroundImage = `url(${m.fs.onBike ? 'art/ui/UI2_BikeButton.png' : 'art/ui/UI_BikeButton.png'})`;
    if (this.v.avatarBike) this.v.avatarBike.visible = m.fs.onBike;
    if (this.bikePreview) this.bikePreview.visible = !has;
    this.previews.forEach((o, k) => { if (o) o.visible = !m.hasPet(PETS[k], now); });
    // spots
    const near = s => s && Math.hypot(pl.x - s.dock[0], pl.z - s.dock[2]) < SPOT_R;
    const at = near(this.spots.pet) ? 'pet' : near(this.spots.bike) ? 'bike' : null;
    if (at && this.panel?.kind !== at) this.open(at);
    if (!at && (this.panel?.kind === 'pet' || this.panel?.kind === 'bike')) this.close();
    if (this.panel && Math.floor(now / 1000) !== this.lastSec) { this.lastSec = Math.floor(now / 1000); this.render(); }
    // pets
    for (const id of PETS) {
      const own = m.hasPet(id, now);
      if (own && !this.pets[id]) this.pets[id] = this.spawnPet(id);
      if (!own && this.pets[id]) { this.v.world.root.remove(this.pets[id].o); delete this.pets[id]; }
      if (this.pets[id]) this.stepPet(this.pets[id], dt);
    }
    for (const e of m.events) this.v.sound?.event(e, f);
    m.events.length = 0;
  }
}
