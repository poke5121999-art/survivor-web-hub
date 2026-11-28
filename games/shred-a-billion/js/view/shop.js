// UPGRADES screen (Game.UI.Menus.UpgradesScreen): category tabs, 2-column card grid, info panel on the left,
// BUY (hold 0.5 s after 0.12 s = buy max), AUTO-BUY ALL (hold). Effect lines follow Game.Core.EffectText.
import { T, has } from '../sim/i18n.js';
import { Num } from '../sim/economy.js';

const UI = './art/ui/';
export const CATS = ['hands', 'bucket', 'shovel', 'vacuum', 'bag', 'shredder', 'mobility', 'automation', 'gold', 'economy', 'boosts'];
const CAT_ICON = { hands: 'hand', bucket: 'bucket', shovel: 'shovel', vacuum: 'vacuum', bag: 'bag', shredder: 'icon_shredder_standard', mobility: 'boot',
  automation: 'drone', gold: 'GOLD_BAR', economy: 'currency', boosts: 'boost_money' };
export const STAT_NAMES = ['MoveSpeed', 'SprintMultiplier', 'JumpHeight', 'ReachDistance', 'HandCarry', 'HandPickupRate', 'ThrowForce', 'BagCapacity', 'BucketPickupRate', 'ShovelRadius',
  'ShovelItems', 'ShovelCooldown', 'VacuumRate', 'VacuumRange', 'VacuumAngle', 'MagnetRadius', 'MagnetPullRate', 'MagnetPulseRadius', 'MagnetPulseCooldown', 'BillValue', 'MoneyMultiplier',
  'CritChance', 'CritMultiplier', 'LuckyChance', 'ShredderSpeed', 'ShredderMultiplier', 'AutoPumpInterval', '', 'DroneCount', 'DroneRate', 'DroneCapacity', 'XpMultiplier', 'BoostDuration',
  'BoostInterval', 'BoostPower', 'FlowMax', 'OfflineHours', 'OfflineEfficiency', 'JetpackFuel', 'JetpackThrust', 'JetpackRefuel', 'DroneDig', 'DroneBattery', 'HandGrab', 'DepositSpeed',
  'ArmfulSize', 'ArmfulCooldown', 'ArmfulRadius', 'HeaveRange', 'HeaveCooldown', 'HeaveBonus', 'PoundScoops', 'PoundCooldown', 'PoundCrater', 'TwisterRun', 'TwisterCooldown', 'TwisterTwin',
  'RallyTime', 'RallyCooldown', 'RallyDig', 'FlowBuild', 'HandBuffer', 'HandWhiff', 'HandCatch', 'FlowHold', 'PourSpeed', 'PourHold', 'DepositReach', 'LuckyPower', 'EventDuration', 'ChestCash',
  'MilestoneBonus', 'EventFrequency', 'BucketScoop', 'BucketCatch', 'ShovelWindup', 'ShovelReach', 'ShovelCatch', 'ShovelWhiff', 'VacuumSpinUp', 'VacuumIdle', 'VacuumCatch', 'VacuumCore',
  'BacklogBoost', 'AutoPumpFill', 'JetpackAgility', 'JetpackSpeed', 'AirControl', 'JumpForgiveness', 'RideSpeed', 'DroneRecharge', 'DroneTaxi', 'DroneTurnaround', 'PumpBonus', 'DroneBonus',
  'OrbLifetime', 'OrbReach', 'OrbEcho', 'OrbLuck', 'OrbHeadStart'];
const PERCENT = new Set([21, 23, 35, 37, 50, 53, 76, 79, 80, 97]);
const UNIT = { 3: ' m', 9: ' m', 13: ' m', 47: ' m', 48: ' m', 15: ' m', 17: ' m', 11: ' s', 18: ' s', 46: ' s', 49: ' s', 52: ' s', 55: ' s', 58: ' s', 26: ' s', 14: '°', 36: ' h' };

function fmtNum(v) { const a = Math.abs(v); if (a >= 1e6) return Num.short(v); if (a >= 100) return Math.round(v).toLocaleString('en-US'); return (+v.toFixed(a < 10 ? 2 : 1)).toString(); }
export function effect(m, levels, econ) {
  const L = Math.max(1, levels);
  if (m.op === 1) return sign(m.value * L * 100) + '%';
  if (m.op === 2) return sign((Math.pow(m.value, L) - 1) * 100) + '%';
  const v = m.value * L * econ.party.volume(m.stat);
  if (PERCENT.has(m.stat)) return sign(v * 100) + '%';
  return (v >= 0 ? '+' : '') + fmtNum(v) + (UNIT[m.stat] || '');
}
function sign(p) { const a = Math.abs(p); const s = a >= 100 ? Math.round(p).toLocaleString('en-US') : (+p.toFixed(a < 1 ? 2 : 1)).toString(); return (p >= 0 ? '+' : '') + s; }
function statName(id) { return T('stat.' + STAT_NAMES[id]); }

export class Shop {
  constructor(root, game, sfx) {
    this.root = root; this.g = game; this.sfx = sfx;
    this.cat = 'hands'; this.sel = null; this.hideMaxed = false; this.open = false;
    addEventListener('pointerup', () => { this.pointerDown = false; }, true);
    addEventListener('pointercancel', () => { this.pointerDown = false; }, true);
  }
  show() {
    this.open = true;
    this.root.innerHTML = `<div class="screen" id="shopScreen"><div class="panel">
      <div class="ptitle">${T('menu.tab.upgrades')}</div>
      <div class="pwallet"><img src="${UI}coin.webp" alt=""><span id="shopMoney"></span></div>
      <button class="pclose sbtn" id="shopClose">✕</button>
      <div class="shopBody">
        <div class="shopLeft" id="shopInfo"></div>
        <div class="shopRight"><div class="tabs" id="shopTabs"></div><div class="grid" id="shopGrid"></div></div>
      </div>
      <div class="foot"><span><b>Click</b>${T('menu.hint.buy_hold')}</span><span><b>F</b>${T('menu.hint.buy_max')}</span><span><b>ESC</b>${T('menu.hint.close')}</span></div>
    </div></div>`;
    this.root.querySelector('#shopClose').addEventListener('click', () => this.onClose && this.onClose());
    const scr = this.root.querySelector('#shopScreen');
    scr.addEventListener('pointerdown', () => { this.pointerDown = true; }, true);
    this.root.querySelector('#shopScreen').addEventListener('pointerdown', (e) => { if (e.target.id === 'shopScreen') this.onClose && this.onClose(); });
    this.render();
  }
  hide() { this.open = false; this.root.innerHTML = ''; }
  // periodic refresh: update the wallet text; rebuild cards only when what can be bought changed, and never
  // while a pointer is held (a rebuilt button would swallow the pointerup of a click or hold-to-buy)
  tick() {
    if (!this.open) return;
    const e = this.g.econ;
    const w = this.root.querySelector('#shopMoney'); if (w) w.textContent = Num.money(e.dollars);
    if (this.pointerDown) return;
    const sig = this.cat + '|' + this.g.data.content.upgrades.map(u => (e.isVisible(u.id) ? 1 : 0) + '' + (e.canBuy(u.id) ? 1 : 0) + e.lvl(u.id)).join('');
    if (sig !== this.sig) this.render();
  }
  // a tab is locked while none of its cards can be seen (UpgradesScreen.RefreshLocks shows the reveal hint)
  catLocked(c) { const e = this.g.econ; return !this.g.data.content.upgrades.some(u => u.category === c && e.isVisible(u.id)); }
  revealText(c) {
    const first = this.g.data.content.upgrades.filter(u => u.category === c).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!first) return '';
    if (first.requiresUnlock && !this.g.econ.hasKey(first.requiresUnlock)) {
      const k = first.requiresUnlock; return k.startsWith('tool.') ? T('shop.reveal.unlock', T(k + '.name')) : T('shop.reveal.key');
    }
    if (first.requiresUpgrade) return T('shop.reveal.buy', T('upg.' + first.requiresUpgrade + '.name'));
    return T('shop.reveal.later');
  }
  list(c) {
    const e = this.g.econ;
    return this.g.data.content.upgrades.filter(u => u.category === c).sort((a, b) => a.sortOrder - b.sortOrder)
      .filter(u => !(this.hideMaxed && e.isMaxed(u.id)));
  }
  render() {
    if (!this.open) return;
    const e = this.g.econ;
    this.sig = this.cat + '|' + this.g.data.content.upgrades.map(u => (e.isVisible(u.id) ? 1 : 0) + '' + (e.canBuy(u.id) ? 1 : 0) + e.lvl(u.id)).join('');
    this.root.querySelector('#shopMoney').textContent = Num.money(e.dollars);
    const tabs = this.root.querySelector('#shopTabs');
    tabs.innerHTML = '';
    for (const c of CATS) {
      const locked = this.catLocked(c);
      const n = this.list(c).filter(u => e.isVisible(u.id) && !e.isMaxed(u.id) && e.cost(u.id) <= e.dollars).length;
      const t = document.createElement('button'); t.className = 'tab sbtn' + (c === this.cat ? ' sel' : '') + (locked ? ' locked' : '');
      t.innerHTML = `<img src="${UI}${CAT_ICON[c]}.webp" alt="">${T('shop.cat.short.' + (c === 'economy' ? 'economy' : c))}${n && !locked ? `<span class="dot">${n}</span>` : ''}`;
      t.addEventListener('click', () => { this.cat = c; this.sel = null; this.sfx('sfx_tab_upgrades'); this.render(); });
      tabs.appendChild(t);
    }
    const grid = this.root.querySelector('#shopGrid');
    grid.innerHTML = '';
    if (this.catLocked(this.cat)) {
      grid.innerHTML = `<div class="small" style="grid-column:1/span 2;padding:20px;text-align:center">${this.revealText(this.cat)}</div>`;
    }
    const items = this.catLocked(this.cat) ? [] : this.list(this.cat);
    if (!this.sel || !items.find(u => u.id === this.sel)) this.sel = (items.find(u => e.isVisible(u.id)) || {}).id || null;
    for (const u of items) {
      const vis = e.isVisible(u.id);
      const L = e.lvl(u.id), max = u.maxLevel, maxed = e.isMaxed(u.id), cost = e.cost(u.id), can = e.canBuy(u.id);
      const card = document.createElement('div');
      card.className = 'ucard' + (u.id === this.sel ? ' sel' : '') + (vis ? '' : ' locked');
      const mod = (u.modifiers || [])[0];
      const eff = vis ? (mod ? `<span class="g">${effect(mod, Math.max(1, L + (maxed ? 0 : 1)), e)}</span> ${statName(mod.stat)}` : T('upg.' + u.id + '.desc', '')) : T('shop.reveal.buy', T('upg.' + (u.requiresUpgrade || '') + '.name'));
      card.innerHTML = `<img class="ic" src="${UI}${iconOf(u)}.webp" alt=""><div class="n">${vis ? T('upg.' + u.id + '.name') : '???'}</div><div class="l">${L}/${max}</div>
        <div class="e">${eff}</div><div class="pips">${max <= 12 ? Array.from({ length: max }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('') : ''}</div>
        ${vis && this.g.wishes && this.g.wishes.has(u.id) ? `<div class="wish">${T('net.team.wanted')}</div>` : ''}${vis && this.g.wantMode && !maxed ? `<div class="bb want"><span>${T('net.team.want')}</span></div>` : vis ? (maxed ? `<div class="bb max">${max === 1 ? T('shop.owned') + ' ✓' : T('shop.maxed')}</div>` : `<div class="bb${can ? '' : ' off'}"><span>${T('shop.buy')}</span><span class="price${can ? '' : ' no'}"><img src="${UI}coin.webp" alt="">${Num.short(cost)}</span></div>`) : ''}`;
      card.addEventListener('click', () => { this.sel = u.id; this.sfx('sfx_ui_click'); this.render(); });
      const bb = card.querySelector('.bb');
      if (bb && !maxed) this.holdBuy(bb, u.id);
      grid.appendChild(card);
    }
    this.renderInfo();
  }
  holdBuy(el, id) {
    let timer = null, held = false;
    const down = (ev) => {
      ev.stopPropagation(); ev.preventDefault(); held = false;
      timer = setTimeout(() => { held = true; const n = this.g.econ.buyMax(id); this.afterBuy(id, n); }, 500);
    };
    const up = (ev) => { ev.stopPropagation(); if (timer) clearTimeout(timer); timer = null; if (!held) this.afterBuy(id, this.g.econ.buy(id) ? 1 : 0); held = true; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', () => { if (timer) clearTimeout(timer); timer = null; });
  }
  afterBuy(id, n) {
    this.sel = id;
    if (n > 0) this.sfx('coin_drop_buy'); else this.sfx('sfx_ui_deny');
    if (this.onBought) this.onBought(id, n);
    this.render();
  }
  buySelected(max) { if (this.sel) this.afterBuy(this.sel, max ? this.g.econ.buyMax(this.sel) : (this.g.econ.buy(this.sel) ? 1 : 0)); }
  renderInfo() {
    const box = this.root.querySelector('#shopInfo'); const e = this.g.econ;
    const u = this.sel && e.upById.get(this.sel);
    if (!u) { box.innerHTML = `<div class="small">${T('shop.info.pick')}</div>`; return; }
    const L = e.lvl(u.id), maxed = e.isMaxed(u.id), cost = e.cost(u.id), can = e.canBuy(u.id);
    const mod = (u.modifiers || [])[0];
    const fx = mod ? (L > 0 && !maxed ? `${effect(mod, L, e)} → <span class="g">${effect(mod, L + 1, e)}</span>` : `<span class="g">${effect(mod, Math.max(1, L), e)}</span>`) + `<div class="small">${statName(mod.stat)}</div>` : '';
    box.innerHTML = `<div class="lv">${T('shop.level', L, u.maxLevel)}</div><div class="bigIcon"><img src="${UI}${iconOf(u)}.webp" alt=""></div>
      <div class="nm">${T('upg.' + u.id + '.name')}</div><div class="ds">${T('upg.' + u.id + '.desc', mod ? effect(mod, Math.max(1, L + (maxed ? 0 : 1)), e) : '')}</div>
      ${fx ? `<div class="fx">${fx}</div>` : ''}
      <div style="flex:1"></div>
      ${maxed ? `<button class="buyBig max sbtn">${u.maxLevel === 1 ? T('shop.owned') + ' ✓' : T('shop.maxed')}</button>` : `<button class="buyBig sbtn${can ? '' : ' off'}" id="bigBuy">${T('shop.buy')} <span class="price${can ? '' : ' no'}"><img src="${UI}coin.webp" alt="">${Num.short(cost)}</span></button>`}
      <button class="autoAll sbtn" id="autoAll">${T('shop.auto_buy_all')} <span class="small">${T('shop.hold')}</span></button>
      <label class="small"><input type="checkbox" id="hideMax" ${this.hideMaxed ? 'checked' : ''}> ${T('shop.hide_maxed')}</label>`;
    const bb = box.querySelector('#bigBuy'); if (bb) this.holdBuy(bb, u.id);
    let t = null;
    const aa = box.querySelector('#autoAll');
    aa.addEventListener('pointerdown', () => { t = setTimeout(() => { let n = 0; for (const x of this.list(this.cat)) n += e.buyMax(x.id); this.afterBuy(u.id, n); }, 500); });
    aa.addEventListener('pointerup', () => clearTimeout(t)); aa.addEventListener('pointerleave', () => clearTimeout(t));
    box.querySelector('#hideMax').addEventListener('change', (ev) => { this.hideMaxed = ev.target.checked; this.render(); });
  }
}
let ICONS = {};
export function setIcons(m) { ICONS = m || {}; }
function iconOf(u) { return ICONS[u.id] || u.id.replace('.', '_'); }
