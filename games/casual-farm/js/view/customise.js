// Customise screen (CustomiseScreenController, CUSTOMIZE CANVAS prefab via tools/export_menus.py): four tabs of holders
// (Skin / Outfit / Hat / Pet buttons, 180-unit tiles tinted per tab), a cash and gold counter, and the "Not enough
// Goldbars" popup that points at the map (prestige pays gold). Rules in rules/census-cosmetics.md:
//   cash and gold items are bought outright; an Ads item needs n claims (each claim stands in for one video, the counter
//   shows "k/n"); IAP items are left out of this build; Special items are event rewards and show "?" until then.
// Equipping writes the slot and re-applies the look and the outfit abilities at once (PlayerHumanController.Update*).
const TABS = [
  { key: 'skins', slot: 'skin', label: 'Skins', tab: '#33b7e9', tile: '#7bdbff' },
  { key: 'outfits', slot: 'outfit', label: 'Outfits', tab: '#aee000', tile: '#edff85' },
  { key: 'hats', slot: 'hat', label: 'Hats', tab: '#f56c64', tile: '#ff9f9b' },
  { key: 'pets', slot: 'pet', label: 'Pets', tab: '#cf5fff', tile: '#e4a4ff' },
];
// OutfitHolderController texts: "{0}% Faster Machines" ... with {0} = round((m - 1) x 100); pets "+{0} Stack".
const SKILL = { machine: 'Faster Machines', animal: 'Faster Animals', worker: 'Faster Workers', player: 'Extra Speed', revenue: 'Revenue Boost' };
export const skillText = ([kind, m]) => `${Math.round((m - 1) * 100)}% ${SKILL[kind]}`;

// Default ownership: the "IsUnlocked" cost rows (Skin_Blue, Skin_empty, Hat_Empty, Hat_Clerk, pet Empty); hat 1 (Clerk) is
// the default HatPreference.
export function cosmeticsState(data, saved) {
  const s = saved || {};
  const eq = { skin: 0, outfit: 0, hat: 1, pet: 0, ...(s.eq || {}) };
  const own = {};
  for (const t of TABS) own[t.key] = new Set([...data[t.key].filter(r => r.cost.type === 'free' || r.unlocked).map(r => r.id), ...((s.own || {})[t.key] || [])]);
  return { eq, own, ads: { ...(s.ads || {}) } };
}
export const saveCosmetics = st => ({ eq: st.eq, own: Object.fromEntries(Object.entries(st.own).map(([k, v]) => [k, [...v]])), ads: st.ads });

// Gameplay part of the equipped set: the outfit's abilities and the pet's extra carry.
export function cosmeticEffects(data, eq) {
  const outfit = data.outfits.find(r => r.id === eq.outfit) || {};
  const pet = data.pets.find(r => r.id === eq.pet) || {};
  return { abilities: Object.fromEntries((outfit.abilities || []).map(([k, m]) => [k, m])), petCarry: pet.carry || 0 };
}

export class Customise {
  // wallet: { cash(), spendCash(n), gold(), spendGold(n) }; onChange(state): save + apply; onShortCash(); onMap()
  constructor({ root, art, ui, data, state, wallet, sound, onChange, onShortCash, onMap, onOpen }) {
    Object.assign(this, { data, state, wallet, sound, onChange, onShortCash, onMap, onOpen: onOpen || (() => {}) });
    this.icon = n => `${art}/cosmetics/icons/${n}.webp`;
    const m = n => `${art}/ui/menus/${n}.webp`;
    this.tab = 'skins';
    root.insertAdjacentHTML('beforeend', `
      <div class="mshade custom" id="custom"><div class="panel">
        <b class="title ol">Customize</b>
        <div class="tabs">${TABS.map(t => `<a class="tb ol" data-tab="${t.key}" style="--c:${t.tab}">${t.label}</a>`).join('')}</div>
        <div class="scroll"><div class="grid"></div></div>
        <a class="tb x" data-act="close" style="--c:#ff585d"><img src="${m('crossUI')}" alt=""></a>
      </div>
      <div class="nogold"><div class="box">
        <div class="head"><img src="${m('goldBarIcon')}" alt=""><b class="ol">Not enough Goldbars</b></div>
        <p class="ol">Visit the Map to prestige your Mart and earn more Goldbars.</p>
        <a class="tb map" data-act="map" style="--c:#ff995a"><img src="${m('MapCityUI')}" alt=""></a>
        <a class="tb x" data-act="nogold-close" style="--c:#ff585d"><img src="${m('crossUI')}" alt=""></a>
      </div></div></div>`);
    this.el = root.querySelector('#custom');
    this.grid = this.el.querySelector('.grid');
    this.m = m;
    this.el.addEventListener('click', e => this.click(e));
  }

  get isOpen() { return this.el.classList.contains('open'); }

  open() {
    this.onOpen();
    this.el.classList.add('open');
    this.render();
  }

  close() { this.el.classList.remove('open'); this.el.classList.remove('short'); }

  rows() {
    // IAP rows are not part of this build.
    return this.data[this.tab].filter(r => r.cost.type !== 'iap');
  }

  render() {
    const t = TABS.find(x => x.key === this.tab), st = this.state;
    this.el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.el.querySelector('.scroll').style.setProperty('--tile', t.tile);
    const cash = `<img src="${this.m('cashIcon')}" alt="">`, gold = `<img src="${this.m('goldBarIcon')}" alt="">`;
    this.grid.innerHTML = this.rows().map(r => {
      const owned = st.own[this.tab].has(r.id), on = st.eq[t.slot] === r.id;
      let foot = '';
      if (on) foot = `<i class="check"><img src="${this.m('checkmarkUI')}" alt=""></i>`;
      else if (owned) foot = '';
      else if (r.cost.type === 'cash') foot = `<i class="ol">${cash}${r.cost.price}</i>`;
      else if (r.cost.type === 'gold') foot = `<i class="ol">${gold}${r.cost.price}</i>`;
      else if (r.cost.type === 'ads') foot = `<i class="ol"><img src="${this.m('adIcon')}" alt="">${st.ads[`${this.tab}:${r.id}`] || 0}/${r.cost.ads}</i>`;
      else if (r.cost.type === 'special') foot = '<i class="ol q">?</i>';
      const skill = this.tab === 'outfits' && r.abilities.length ? `<s class="ol">${skillText(r.abilities[0])}</s>`
        : this.tab === 'pets' && r.carry ? `<s class="ol">+${r.carry} Stack</s>` : '';
      const img = r.icon ? `<img class="pic${!owned && r.cost.type === 'special' ? ' dark' : ''}" src="${this.icon(r.icon)}" alt="">` : '';
      return `<a class="tile${on ? ' on' : ''}" data-id="${r.id}">${img}${skill}<span class="foot">${foot}</span></a>`;
    }).join('');
  }

  click(e) {
    const b = e.target.closest('[data-tab], [data-act], [data-id]');
    if (!b) return;
    const tap = cancel => this.sound && this.sound.play(cancel ? 'cancel' : 'tap');
    if (b.dataset.tab) { tap(); this.tab = b.dataset.tab; this.render(); return; }
    if (b.dataset.act === 'close') { tap(true); this.close(); return; }
    if (b.dataset.act === 'nogold-close') { tap(true); this.el.classList.remove('short'); return; }
    if (b.dataset.act === 'map') { tap(); this.close(); this.onMap(); return; }
    const id = +b.dataset.id, t = TABS.find(x => x.key === this.tab), st = this.state;
    const r = this.data[this.tab].find(x => x.id === id);
    if (!r) return;
    if (!st.own[this.tab].has(id)) {
      const c = r.cost;
      if (c.type === 'cash') {
        if (this.wallet.cash() < c.price) { tap(true); this.onShortCash(); return; }
        this.wallet.spendCash(c.price);
      } else if (c.type === 'gold') {
        if (this.wallet.gold() < c.price) { tap(true); this.el.classList.add('short'); return; }
        this.wallet.spendGold(c.price);
      } else if (c.type === 'ads') {
        // IncreaseCurrentWatchAd: one claim per tap, unlocked once currentAdCost reaches adCost.
        const k = `${this.tab}:${id}`;
        st.ads[k] = (st.ads[k] || 0) + 1;
        if (st.ads[k] < c.ads) { tap(); this.onChange(st); this.render(); return; }
      } else return;
      st.own[this.tab].add(id);
    }
    tap();
    st.eq[t.slot] = id;
    // IsBlockingHat: a blocking outfit takes the hat off and a hat takes a blocking outfit off (dormant in the shop).
    if (t.slot === 'outfit' && r.blocksHat) st.eq.hat = 0;
    if (t.slot === 'hat' && id !== 0 && (this.data.outfits.find(o => o.id === st.eq.outfit) || {}).blocksHat) st.eq.outfit = 0;
    this.onChange(st);
    this.render();
  }
}
