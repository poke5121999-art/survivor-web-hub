// Bảng hàng hoá của sảnh:
//  Stash (Edman "Kho chứa")          — chuyển hàng giữa kho (Const.StashSlotCount + Talent StashSlotCount) và túi mang vào lượt lặn
//                                      (Const.CharacterInventorySlotCount + Talent InventorySlotCount). UItemStashPopup_*.
//  Storage (Duster "Nhận thưởng")    — hộp quà của LuaApi GiveItemToStorage: "Chuyển vào Kho" (UStoragePopup_*).
//  LostGoodsStorage (Duster)         — chuộc đồ thất lạc (dive.js ghi profile.lostGoods: giá, số lần thoát còn lại). ULostShop_*.
//  Shop (Lucas GroupId 1, Ryujin 2)  — ShopProduct: Gain/Consume, UnlockConditions, IsEnabled, AppearProbability (/10000), StockCount;
//                                      bán: Item/Equipment.SellPrice (Lucas không mua cổ vật: "유물 외 물건은 매입" — LoungeQuest/80200.lua).
//  ArtifactShop (Pim)                — mua mọi cổ vật bằng tiền mặt: Worth × Const.ArtifactShopCostMultiplier (0,7). UArtifactShop_PimDesc.
//  CoinExchange (ATM Vực Thẳm)       — Đăng ký: Item 10001 (xu vật lý) → Coin; Cấp phát: Coin → Item 10001, tỉ lệ 1:1. [SUY LUẬN]
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;
  const C = (n, d) => VD.combatDB().c(n, d);
  const packSlots = () => C('CharacterInventorySlotCount', 23) + P().talentSum('InventorySlotCount');
  const row = g => VD.goods.row(g) || {};

  // Gộp Item cùng id trong mảng hàng (theo InventoryCountMax).
  function pushStack(arr, g) {
    if (g.type === 'Item') {
      const max = VD.goods.stackMax(g);
      let left = g.count || 1;
      for (const s of arr) if (left > 0 && s.type === 'Item' && +s.id === +g.id && s.count < max) { const k = Math.min(left, max - s.count); s.count += k; left -= k; }
      while (left > 0) { const k = Math.min(left, max); arr.push({ type: 'Item', id: g.id, count: k }); left -= k; }
    } else arr.push(Object.assign({}, g));
  }

  // ---------------------------------------------------------------- Stash
  function buildStash(body, api) {
    const $ = U().$, p = P().get();
    body.innerHTML = `<div class="vd-cols vd-stash">
      <div class="vd-col grow"><h4>${TX('Stash') || 'Kho chứa'} <span class="n st"></span></h4><div class="vd-grid stash"></div></div>
      <div class="vd-col grow"><h4>${TX('UItemStashPopup_TitleGroup_Caption') || 'Túi đồ'} <span class="n pk"></span></h4><div class="vd-grid pack"></div>
        <p class="vd-desc dim small">Bấm một ô để chuyển qua bên kia. Túi đồ theo nhân vật vào lượt lặn: thoát thì mang về kho, chết thì mất (trừ khe an toàn).</p>
        <div class="btns"><button class="vd-btn all">Cất hết vào kho</button></div></div></div>`;
    const sg = body.querySelector('.stash'), pg = body.querySelector('.pack');
    body.querySelector('.st').textContent = p.stash.length + ' / ' + P().stashSlots();
    body.querySelector('.pk').textContent = p.pack.length + ' / ' + packSlots();
    p.stash.forEach((g, i) => sg.appendChild(U().cell(g, { onclick: () => {
      if (p.pack.length >= packSlots() && !(g.type === 'Item' && p.pack.some(x => x.type === 'Item' && +x.id === +g.id && x.count < VD.goods.stackMax(x)))) return U().toast(TX('NotEnoughInventorySlots') || 'Túi đầy');
      p.stash.splice(i, 1); pushStack(p.pack, g); P().save(); api.refresh();
    } })));
    for (let i = p.stash.length; i < P().stashSlots(); i++) $('div', 'vd-gcell empty', sg);
    p.pack.forEach((g, i) => pg.appendChild(U().cell(g, { onclick: () => {
      if (P().stashFree() <= 0) return U().toast(TX('NotEnoughStashSlots') || 'Kho đầy');
      p.pack.splice(i, 1); P().give(g); api.refresh();
    } })));
    for (let i = p.pack.length; i < packSlots(); i++) $('div', 'vd-gcell empty', pg);
    body.querySelector('.all').onclick = () => { const all = p.pack.splice(0); P().giveAll(all); api.refresh(); };
  }

  // ---------------------------------------------------------------- Storage (hộp nhận thưởng)
  function buildStorage(body, api) {
    const p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${TX('UStoragePopup_Title_Text') || 'Nhận thưởng'}</h4><div class="vd-grid rw"></div>
      <p class="vd-desc">${U().esc(TX('UStoragePopup_Desc_DescText'))}</p><button class="vd-btn main take">${TX('UStoragePopup_Desc_DescText') || 'Chuyển vào kho'}</button></div>`;
    const g = body.querySelector('.rw');
    for (const x of p.storage) g.appendChild(U().cell(x));
    if (!p.storage.length) g.innerHTML = '<i class="dim">—</i>';
    const b = body.querySelector('.take');
    b.disabled = !p.storage.length;
    b.onclick = () => { if (P().stashFree() < p.storage.length) return U().toast(TX('NotEnoughStashSpace') || 'Kho đầy'); P().giveAll(p.storage.splice(0)); api.refresh(); };
  }

  // ---------------------------------------------------------------- Đồ thất lạc
  function buildLost(body, api) {
    const p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${TX('ULostShop_Title_Text') || 'Cửa hàng Đồ thất lạc'}</h4><p class="vd-desc dim">${U().rich(TX('ULostItemListPopup_Contents_TextDesc'))}</p><div class="vd-list lost"></div></div>`;
    const L = body.querySelector('.lost');
    if (!(p.lostGoods || []).length) { L.innerHTML = `<i class="dim">${U().esc(TX('ULostShop_NoItem') || '—')}</i>`; return; }
    p.lostGoods.forEach((l, i) => {
      const r = U().$('div', 'vd-row', L);
      r.appendChild(U().cell(l.goods));
      const t = U().$('div', 't', r);
      t.innerHTML = `<b>${U().esc(U().gname(l.goods))}</b><span>${U().esc((TX('LostGoodsActionPointLeft') || '{0}').replace('{0}', l.exitsLeft))}</span>`;
      const cost = [{ type: 'Gold', id: 0, count: l.price }];
      U().$('div', 'c', r).innerHTML = U().cost(cost);
      const b = U().$('button', 'vd-btn', r);
      b.textContent = TX('LostBuy') || 'Mua lại';
      b.disabled = !P().has(cost);
      b.onclick = ev => { ev.stopPropagation(); if (!P().pay(cost)) return U().toast(TX('NotEnoughGold')); p.lostGoods.splice(i, 1); P().give(l.goods); api.refresh(); };
    });
  }

  // ---------------------------------------------------------------- Shop
  // AppearProbability < 10000: lăn một lần mỗi khi về sảnh sau lượt lặn (profile.lootRolls theo số lượt lặn). [SUY LUẬN]
  function appears(pr) {
    if ((pr.AppearProbability || 10000) >= 10000) return true;
    const p = P().get(), key = pr.Id + '@' + (p.dives || 0);
    if (p.lootRolls[key] == null) {
      for (const k of Object.keys(p.lootRolls)) if (+k.split('@')[1] !== (p.dives || 0)) delete p.lootRolls[k];
      p.lootRolls[key] = Math.random() * 10000 < pr.AppearProbability;
      P().save();
    }
    return p.lootRolls[key];
  }
  function products(group) {
    const p = P().get();
    return (T().ShopProduct || []).filter(x => x.GroupId === group && x.IsEnabled !== false && P().condsOk(x.UnlockConditions) && appears(x))
      .map(x => ({ row: x, gain: P().parse(x.GainGoodsData), cost: [P().parse(x.ConsumeGoodsData)], left: x.StockCount < 0 ? Infinity : x.StockCount - (p.shopBought[x.Id] || 0) }));
  }
  function sellPrice(g) { const r = row(g); return (r.SellPrice || 0) * (g.count || 1); }
  function buildShop(body, api) {
    const $ = U().$, p = P().get(), fn = api.fn || {};
    const st = api.st || (api.st = { tab: 'buy', n: 1 });
    const group = fn.Value1 || 1;
    body.innerHTML = `<div class="vd-seg tabs"><button data-t="buy">${TX('ShopSelectBuyOrSell') ? 'Mua' : 'Mua'}</button><button data-t="sell">Bán</button></div>
      <div class="vd-cols vd-shop"><div class="vd-col grow"><h4 class="h"></h4><div class="vd-list items"></div></div></div>`;
    body.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.t === st.tab); b.onclick = () => { st.tab = b.dataset.t; api.refresh(); }; });
    const L = body.querySelector('.items');
    if (st.tab === 'buy') {
      body.querySelector('.h').textContent = TX('Shop_Group_' + group) || TX('UItemShopPopup_Title_Caption');
      const list = products(group);
      if (!list.length) L.innerHTML = '<i class="dim">—</i>';
      for (const it of list) {
        const r = $('div', 'vd-row', L);
        r.dataset.product = it.row.Id;
        r.appendChild(U().cell(it.gain));
        const t = $('div', 't', r);
        t.innerHTML = `<b>${U().esc(U().gname(it.gain))}${it.gain.count > 1 ? ' ×' + it.gain.count : ''}</b><span>${it.left === Infinity ? '' : (it.left > 0 ? 'Còn ' + it.left : U().esc(TX('NotEnoughStockCount')))}</span>`;
        $('div', 'c', r).innerHTML = U().cost(it.cost);
        const b = $('button', 'vd-btn buy', r);
        b.textContent = 'Mua';
        b.disabled = !(it.left > 0) || !P().has(it.cost);
        b.onclick = ev => {
          ev.stopPropagation();
          if (!(it.left > 0)) return U().toast(TX('NotEnoughStockCount'));
          if (P().stashFree() <= 0 && it.gain.type !== 'Gold' && it.gain.type !== 'Coin') return U().toast(TX('NotEnoughStashSlots'));
          if (!P().pay(it.cost)) return U().toast(TX('NotEnoughCurrency') || 'Không đủ tiền.');
          P().give(it.gain);
          p.shopBought[it.row.Id] = (p.shopBought[it.row.Id] || 0) + 1;
          P().save();
          api.refresh();
        };
      }
    } else {
      body.querySelector('.h').textContent = 'Bán (kho)';
      const list = p.stash.map((g, i) => ({ g, i })).filter(x => sellPrice(x.g) > 0 && row(x.g).GoodsType !== 'Artifact');
      if (!list.length) L.innerHTML = '<i class="dim">—</i>';
      for (const x of list) {
        const r = $('div', 'vd-row', L);
        r.appendChild(U().cell(x.g));
        $('div', 't', r).innerHTML = `<b>${U().esc(U().gname(x.g))}</b><span>${x.g.count > 1 ? '×' + x.g.count : ''}</span>`;
        $('div', 'c', r).innerHTML = `<span class="vd-cost ok"><img src="art/ui/icon_common/Gold.webp">${U().fmt(sellPrice(Object.assign({}, x.g, { count: 1 })))}</span>`;
        const b1 = $('button', 'vd-btn sell1', r); b1.textContent = 'Bán 1';
        const bA = $('button', 'vd-btn', r); bA.textContent = 'Bán hết';
        const sell = n => { const g = x.g; n = Math.min(n, g.count || 1); P().takeStash(g.type, g.id, n); P().giveGold(sellPrice(Object.assign({}, g, { count: n }))); api.refresh(); };
        b1.onclick = ev => { ev.stopPropagation(); sell(1); };
        bA.onclick = ev => { ev.stopPropagation(); sell(x.g.count || 1); };
      }
    }
  }

  // ---------------------------------------------------------------- Pim: mua cổ vật
  function buildArtifactShop(body, api) {
    const $ = U().$, p = P().get(), k = C('ArtifactShopCostMultiplier', 0.7);
    body.innerHTML = `<div class="vd-col"><p class="vd-desc">${U().rich(TX('UArtifactShop_PimDesc'))}</p><div class="vd-list arts"></div></div>`;
    const L = body.querySelector('.arts');
    const list = p.stash.filter(g => row(g).GoodsType === 'Artifact');
    if (!list.length) L.innerHTML = `<i class="dim">${U().esc(TX('UInventoryPanel_ArtifactFilterEmpty_Text') || '—')}</i>`;
    for (const g of list) {
      const r = $('div', 'vd-row', L);
      r.appendChild(U().cell(g));
      const price = Math.round(VD.goods.worth(g) * k);
      $('div', 't', r).innerHTML = `<b>${U().esc(U().gname(g))}</b><span>${TX('EGoodsGradeType_' + VD.goods.grade(g)) || ''}</span>`;
      $('div', 'c', r).innerHTML = `<span class="vd-cost ok"><img src="art/ui/icon_common/Gold.webp">${U().fmt(price)}</span>`;
      const b = $('button', 'vd-btn', r); b.textContent = 'Bán';
      b.onclick = ev => { ev.stopPropagation(); const i = p.stash.indexOf(g); if (i >= 0) p.stash.splice(i, 1); P().giveGold(price); api.refresh(); };
    }
  }

  // ---------------------------------------------------------------- ATM: đổi xu
  function buildCoin(body, api) {
    const p = P().get(), phys = P().count('Item', 10001);
    body.innerHTML = `<div class="vd-cols"><div class="vd-col grow"><h4>${TX('UCoinExchangePopup_Registration_Btn') || 'Đăng ký'}</h4>
        <p class="vd-desc">${U().rich(TX('UCoinExchangePopup_Registration_Text'))}</p><p>${U().esc(TX('TItem_Name_10001'))}: <b class="ph">${U().fmt(phys)}</b></p>
        <button class="vd-btn main reg">${TX('UCoinExchangePopup_Registration_Btn') || 'Đăng ký'}</button></div>
      <div class="vd-col grow"><h4>${TX('UCoinExchangePopup_Issuance_Btn') || 'Cấp phát'}</h4>
        <p class="vd-desc">${U().rich(TX('UCoinExchangePopup_Issuance_Text'))}</p><p>${U().esc(TX('OwnedCoin'))}: <b>${U().fmt(p.wallet.coin)}</b></p>
        <div class="vd-seg amt"><button data-n="1">1</button><button data-n="10">10</button><button data-n="100">100</button></div></div></div>`;
    body.querySelector('.reg').disabled = phys <= 0;
    body.querySelector('.reg').onclick = () => { const n = P().count('Item', 10001); P().takeStash('Item', 10001, n); P().giveCoin(n); U().toast((TX('CoinExchangeOnline') || '{0}').replace('{0}', n)); api.refresh(); };
    body.querySelectorAll('.amt button').forEach(b => { const n = +b.dataset.n; b.disabled = p.wallet.coin < n; b.onclick = () => { if (!P().removeCoin(n)) return; P().give({ type: 'Item', id: 10001, count: n }); U().toast((TX('CoinExchangeReal') || '{0}').replace('{0}', n)); api.refresh(); }; });
  }

  const reg = (type, id, title, build, cls) => {
    VD.ui.panels[id] = { id, title, build, cls: cls || 'p-' + id };
    VD.npc.register(type, { open: (npcId, fn) => { const api = VD.ui.open(Object.assign({}, VD.ui.panels[id], { build: (b, a) => { a.fn = fn; a.npcId = npcId; build(b, a); } })); return api; } });
  };
  reg('Stash', 'stash', TX('UEquipmentStashPanel_TItle_Caption') || 'Kho chứa', buildStash);
  reg('Storage', 'storage', TX('UStoragePopup_Title_Text') || 'Nhận thưởng', buildStorage);
  reg('LostGoodsStorage', 'lost', TX('ULostShop_Title_Text') || 'Đồ thất lạc', buildLost);
  reg('Shop', 'shop', TX('UItemShopPopup_Title_Caption') || 'Cửa Hàng', buildShop);
  reg('ArtifactShop', 'artifactShop', TX('ENpcFunctionType_ArtifactShop') || 'Buôn lậu Cổ vật', buildArtifactShop);
  reg('CoinExchange', 'coin', TX('UCoinExchangePopup_Title_Text') || 'Đổi xu', buildCoin);
  VD.uiGoods = { pushStack, packSlots, products };
})(window.VD = window.VD || {});
