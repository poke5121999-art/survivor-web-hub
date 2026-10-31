// In-game HUD: the original GamingPanel prefab (art/ui/panels/gamingpanel.json) laid out by ui.js, fed from the sim:
// coin and gem counters, player level and exp bar, MAX!! when the pack is full, the zoom button; plus world-anchored
// price tags over unlock pads.
import * as THREE from 'three';
import { setSlider } from './ui.js';

// Nodes the original switches on at runtime for features this build does not have yet (resident coin, town, events,
// phone, ad boxes, buffs...).
const HIDE = ['residentCoin', 'tickets', 'hometown', 'sponCoin', 'PackData', 'packItem', 'SpecialOrderRoot', 'BtnEaster', 'BtnCoin',
  'BtnPhone', 'buffRoot', 'guideTips', 'BtnBuildTips', 'MainTaskRoot', 'btnMoto', 'MapSelectBtn', 'Pre_UIRedpoint',
  'imgAdd'];

export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return `${n}`;
  const u = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0).replace(/\.0+$/, '')}${u[i]}`;
}

export class Hud {
  constructor(host, ui, panels, sim, world, camera) {
    Object.assign(this, { host, ui, panels, sim, world, camera });
    this.tags = document.createElement('div');
    this.tags.className = 'tags';
    host.appendChild(this.tags);
    this.build();
    this.padTags = new Map();
    addEventListener('resize', () => this.build());
  }

  build() {
    if (this.panel) this.panel.root.remove();
    this.panel = this.ui.panel(this.panels.gamingpanel, null, this.host, { hide: HIDE });
    const p = this.panel;
    const bar = name => p.get(name);
    this.coinText = bar('coin') && bar('coin').querySelector('[data-name="txtCoins"]');
    this.gemText = bar('gem') && bar('gem').querySelector('[data-name="txtCoins"]');
    this.spinText = bar('sponCoin') && bar('sponCoin').querySelector('[data-name="txtCoins"]');
    this.lv = p.get('TxtLv');
    this.exp = p.get('TxtExp');
    this.lvBar = p.get('Slider');
    this.max = p.get('txtMax');
    this.zoom = p.get('btnScaling');
    if (this.zoom) this.zoom.addEventListener('click', e => { e.stopPropagation(); this.onZoom && this.onZoom(); });
    this.last = {};
  }

  set(el, key, s) {
    if (!el || this.last[key] === s) return;
    this.last[key] = s;
    el.textContent = s;
  }

  update() {
    const S = this.sim.state;
    this.set(this.coinText, 'coin', fmt(S.coins));
    this.set(this.gemText, 'gem', fmt(S.gems));
    this.set(this.spinText, 'spin', fmt(S.spin || 0));
    this.set(this.lv, 'lv', `${S.level}`);
    const need = this.sim.needExp();
    this.set(this.exp, 'exp', need ? `${S.exp}/${need}` : 'MAX');
    if (this.lvBar && this.last.bar !== S.exp) { this.last.bar = S.exp; setSlider(this.lvBar, need ? S.exp / need : 1); }
    if (this.max) this.max.style.display = this.sim.pack.full ? 'flex' : 'none';
    this.updatePadTags();
  }

  // Price over each open pad: coin icon + coins still to pay.
  updatePadTags() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const b of this.world.buildings.values()) {
      if (!b.pad) continue;
      const open = this.sim.status(b) === 'locked';
      let el = this.padTags.get(b.id);
      if (!open) { if (el) el.style.display = 'none'; continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag price';
        el.innerHTML = `<img src="${this.ui.url('common_money_icon_01')}" alt=""><span></span>`;
        this.tags.appendChild(el);
        this.padTags.set(b.id, el);
      }
      v.set(b.pad.center.x, 0.2, b.pad.center.z).project(this.camera);
      const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
      el.style.display = off ? 'none' : 'flex';
      if (off) continue;
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      const left = b.cost - (this.sim.state.paid[b.id] || 0);
      const span = el.lastChild;
      const s = fmt(left);
      if (span.textContent !== s) span.textContent = s;
    }
  }
}
