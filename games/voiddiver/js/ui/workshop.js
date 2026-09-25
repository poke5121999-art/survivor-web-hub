// Máy Antikythera (700002) và các NPC phụ:
//  Crafting            — Crafting.csv GroupId = NpcFunction.Value1: nguyên liệu MaterialGoodsDatas → ResultGoodsData, khoá bởi UnlockConditions
//                        (thường ItemUsed:<bản thiết kế> đã đăng ký). UItemCraftingPopup_*, NotEnoughMaterialsForCraft, CraftLocked.
//  RegisterItemUsed    — đăng ký món thuộc NpcFunction.GoodsType (Blueprint / MusicDisc) từ kho: tiêu món, bật điều kiện ItemUsed:<Id>.
//  Scrap               — Scrap.csv: InsertGoodsData → ResultGoodsData[] (UScrapPanel_*, ScrapSuccess).
//  EquipmentRepair     — trang bị có độ bền (dur < maxDur): Gold = (maxDur − dur) × RepairCostPerDurability; mỗi lần sửa mất
//                        MaxDurability × RepairMaxDurabilityLoss độ bền tối đa. [SUY LUẬN: tên cột + URepairConfirmPopup_Center_DescDurabilityText]
//  Rest (Sofa)         — "Loại bỏ ngẫu nhiên một Nghịch lý" (RestToPurifyParadoxDesc); phí Const.RestCost × RestCostMultiplier^(lần nghỉ từ lượt lặn trước). [SUY LUẬN]
//  ParadoxPurify/Lock  — ParadoxLevel theo Paradox.Level: RemovalGoodsData / LockGoodsData.
//  LoungeBgm (Máy hát) — LoungeBgm.csv, chỉ những bài có tệp trong bản web (VD.ASSETS.bgm) và đủ UnlockConditions.
//  DangerLevel (Ouldry)— độ khó mặc định cho campaign kế tiếp (Difficulty.csv). [SUY LUẬN]
//  Interior (Elara)    — InteriorShop.csv: "NpcLevel:<npc>:<lv>" (mở máy hát, ATM, tủ trưng bày), "Area:<id>", "AreaDecoration:<id>"; phí ConsumeCoin/ConsumeGold.
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;
  const C = (n, d) => VD.combatDB().c(n, d);
  const reg = (type, id, title, build, extra) => {
    VD.ui.panels[id] = { id, title, build, cls: 'p-' + id };
    VD.npc.register(type, Object.assign({ open: (npcId, fn) => VD.ui.open(Object.assign({}, VD.ui.panels[id], { build: (b, a) => { a.fn = fn; a.npcId = npcId; build(b, a); } })) }, extra || {}));
  };

  // ---------------------------------------------------------------- Crafting
  function buildCraft(body, api) {
    const $ = U().$, group = (api.fn && api.fn.Value1) || 1;
    const st = api.st || (api.st = { sel: null, n: 1 });
    const rows = (T().Crafting || []).filter(r => r.GroupId === group);
    const ok = r => P().condsOk(r.UnlockConditions);
    const sorted = rows.slice().sort((a, b) => (ok(b) - ok(a)) || (P().has(b.MaterialGoodsDatas) - P().has(a.MaterialGoodsDatas)) || (a.Id - b.Id));
    const cols = $('div', 'vd-cols vd-craft', body);
    const left = $('div', 'vd-col grow list', cols);
    left.innerHTML = `<h4>${TX('UItemCraftingPopup_Title_Text') || 'Chế tạo'}</h4><div class="vd-seg f"><button data-f="all">Tất cả</button><button data-f="can">${TX('UItemCraftingPopup_Available_Text') || 'Có thể chế tạo'}</button></div><div class="vd-list rec"></div>`;
    left.querySelectorAll('.f button').forEach(b => { b.classList.toggle('on', (st.f || 'all') === b.dataset.f); b.onclick = () => { st.f = b.dataset.f; api.refresh(); }; });
    const L = left.querySelector('.rec');
    for (const r of sorted) {
      const can = ok(r) && P().has(r.MaterialGoodsDatas);
      if (st.f === 'can' && !can) continue;
      const g = P().parse(r.ResultGoodsData);
      const el = $('div', 'vd-row' + (st.sel === r.Id ? ' sel' : '') + (ok(r) ? '' : ' locked'), L);
      el.dataset.recipe = r.Id;
      el.appendChild(U().cell(g));
      $('div', 't', el).innerHTML = `<b>${U().esc(U().gname(g))}${g.count > 1 ? ' ×' + g.count : ''}</b><span>${ok(r) ? (can ? U().esc(TX('UCraftingPopup_Menufacturable') || '') : '') : '🔒 ' + U().esc(TX('CraftLocked'))}</span>`;
      el.onclick = () => { st.sel = r.Id; st.n = 1; api.refresh(); };
    }
    const r = rows.find(x => x.Id === st.sel) || sorted[0];
    if (!r) return;
    st.sel = r.Id;
    const g = P().parse(r.ResultGoodsData);
    const maxN = ok(r) ? Math.max(0, Math.min(99, ...r.MaterialGoodsDatas.map(x => { const m = P().parse(x); return Math.floor(P().count(m.type, m.id) / Math.max(1, m.count)); }))) : 0;
    const side = $('div', 'vd-col side', cols);
    side.innerHTML = `<div class="res"></div><h3>${U().esc(U().gname(g))}</h3><p class="vd-desc">${U().rich(VD.goods.desc(g))}</p>
      <h4>${TX('UMaterialPanel_Body_Caption') || 'Nguyên liệu'}</h4><div class="cost">${U().cost(r.MaterialGoodsDatas, st.n)}</div>
      ${(r.UnlockConditions || []).length && !ok(r) ? `<p class="bad small">🔒 ${r.UnlockConditions.map(c => c[0] === 'ItemUsed' ? (TX('TItem_Name_' + c[1]) || c[1]) : c.join(':')).map(U().esc).join(', ')}</p>` : ''}
      <p class="small">${U().esc((TX('CraftableItemCountFormat') || '{0}').replace('{0}', maxN))}</p>
      <div class="vd-seg qty"><button data-d="-1">−</button><button class="n" disabled>${st.n}</button><button data-d="1">+</button><button data-d="99">Max</button></div>
      <button class="vd-btn main go">${TX('Crafting') || 'Chế tạo'}</button>`;
    side.querySelector('.res').appendChild(U().cell(g));
    side.querySelectorAll('.qty button[data-d]').forEach(b => b.onclick = () => { const d = +b.dataset.d; st.n = d === 99 ? Math.max(1, maxN) : Math.max(1, Math.min(Math.max(1, maxN), st.n + d)); api.refresh(); });
    const go = side.querySelector('.go');
    go.disabled = !ok(r) || maxN < st.n;
    go.onclick = () => {
      const mats = U().mulList(r.MaterialGoodsDatas, st.n);
      if (!ok(r)) return U().toast(TX('CraftLocked'));
      if (!P().pay(mats)) return U().toast(TX('NotEnoughMaterialsForCraft'));
      P().give(Object.assign({}, g, { count: g.count * st.n }));
      U().toast(U().gname(g) + ' ×' + g.count * st.n);
      st.n = 1; api.refresh();
    };
  }
  reg('Crafting', 'craft', TX('UItemCraftingPopup_Title_Text') || 'Chế tạo', buildCraft);

  // ---------------------------------------------------------------- RegisterItemUsed
  function buildRegister(body, api) {
    const $ = U().$, type = (api.fn && api.fn.GoodsType) || 'Blueprint', p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${U().esc(TX('URegisterItemUsedPopup_Select_Text'))}</h4><p class="vd-desc dim">${U().esc(TX('URegisterItemUsedPanel_GuideText'))}</p><div class="vd-list ls"></div></div>`;
    const L = body.querySelector('.ls');
    const list = p.stash.filter(g => g.type === 'Item' && (VD.goods.row(g) || {}).GoodsType === type);
    if (!list.length) L.innerHTML = '<i class="dim">—</i>';
    for (const g of list) {
      const r = $('div', 'vd-row', L);
      r.appendChild(U().cell(g));
      const used = !!p.itemUsed[g.id];
      $('div', 't', r).innerHTML = `<b>${U().esc(U().gname(g))}</b><span>${used ? '✓' : ''}</span>`;
      const b = $('button', 'vd-btn', r); b.textContent = TX('URegisterItemUsedPanel_Normal_Text') || 'Đăng ký';
      b.disabled = used;
      b.onclick = ev => { ev.stopPropagation(); P().takeStash('Item', g.id, 1); p.itemUsed[g.id] = true; P().save(); U().toast(U().gname(g)); api.refresh(); };
    }
  }
  reg('RegisterItemUsed', 'register', TX('URegisterItemUsedPanel_Normal_Text') || 'Đăng ký', buildRegister, {
    label: f => (TX('ENpcFunctionType_RegisterItemUsed') || '{0}').replace('{0}', TX('EGoodsType_' + f.GoodsType) || f.GoodsType),
  });

  // ---------------------------------------------------------------- Scrap
  let SCRAP = null;
  const scrapOf = g => { if (!SCRAP) { SCRAP = new Map(); for (const r of T().Scrap || []) { const i = P().parse(r.InsertGoodsData); if (i) SCRAP.set(i.type + ':' + i.id, r); } } return SCRAP.get(g.type + ':' + g.id); };
  function buildScrap(body, api) {
    const $ = U().$, p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${U().esc(TX('UScrapPanel_Top_TargetCaption'))}</h4><p class="vd-desc dim">${U().esc(TX('UScrapPanel_GuideText'))}</p><div class="vd-list ls"></div></div>`;
    const L = body.querySelector('.ls');
    const list = p.stash.filter(g => scrapOf(g));
    if (!list.length) L.innerHTML = '<i class="dim">—</i>';
    for (const g of list) {
      const r = $('div', 'vd-row', L), s = scrapOf(g), ins = P().parse(s.InsertGoodsData);
      r.appendChild(U().cell(g));
      $('div', 't', r).innerHTML = `<b>${U().esc(U().gname(g))}</b><span>→ ${s.ResultGoodsData.map(x => { const q = P().parse(x); return U().esc(U().gname(q)) + ' ×' + q.count; }).join(', ')}</span>`;
      const b = $('button', 'vd-btn', r); b.textContent = TX('UScrapPopup_QuickSubmit_Text') || 'Tháo rời 1';
      b.onclick = ev => {
        ev.stopPropagation();
        if (P().count(g.type, g.id) < ins.count) return U().toast(TX('NotEnoughScrapGoods'));
        P().takeStash(g.type, g.id, ins.count);
        P().giveAll(s.ResultGoodsData);
        U().toast(TX('ScrapSuccess') || 'Tháo dỡ hoàn tất.');
        api.refresh();
      };
    }
  }
  reg('Scrap', 'scrap', TX('UScrapPopup_Title_Text') || 'Tháo gỡ', buildScrap);

  // ---------------------------------------------------------------- EquipmentRepair
  function durOf(g) { const r = VD.goods.row(g) || {}; const max = g.maxDur != null ? g.maxDur : r.MaxDurability || 0; return { max, dur: g.dur != null ? g.dur : max, full: r.MaxDurability || 0 }; }
  function buildRepair(body, api) {
    const $ = U().$, p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${U().esc(TX('UWeaponRepairPanel_Top_Caption'))}</h4><p class="vd-desc dim">${U().esc(TX('UWeaponRepairPopup_Right_Desc'))}</p><div class="vd-list ls"></div></div>`;
    const L = body.querySelector('.ls');
    const list = p.stash.filter(g => g.type === 'Equipment' && (() => { const d = durOf(g); return d.max > 0 && d.dur < d.max; })());
    if (!list.length) L.innerHTML = `<i class="dim">${U().esc(TX('UWeaponRepairPopup_Disabled_Text'))}</i>`;
    for (const g of list) {
      const r = $('div', 'vd-row', L), row = VD.goods.row(g) || {}, d = durOf(g);
      const cost = [{ type: 'Gold', id: 0, count: Math.ceil((d.max - d.dur) * (row.RepairCostPerDurability || 0)) }];
      const loss = Math.max(1, Math.round(d.full * (row.RepairMaxDurabilityLoss || C('RepairMaxDurabilityLossRate', 0.1))));
      r.appendChild(U().cell(g));
      $('div', 't', r).innerHTML = `<b>${U().esc(U().gname(g))}</b><span>${Math.round(d.dur)} / ${d.max} → ${d.max - loss} (${U().esc(TX('URepairConfirmPopup_Durability_Text'))})</span>`;
      $('div', 'c', r).innerHTML = U().cost(cost);
      const b = $('button', 'vd-btn', r); b.textContent = TX('UWeaponRepairPopup_Title_Text') || 'Sửa';
      b.disabled = !P().has(cost);
      b.onclick = ev => { ev.stopPropagation(); if (!P().pay(cost)) return U().toast(TX('NotEnoughGold')); g.maxDur = d.max - loss; g.dur = g.maxDur; P().save(); U().toast(TX('RepairResultText')); api.refresh(); };
    }
  }
  reg('EquipmentRepair', 'repair', TX('UWeaponRepairPopup_Title_Text') || 'Sửa chữa', buildRepair);

  // ---------------------------------------------------------------- Rest
  function restCost() { return Math.round(C('RestCost', 400) * Math.pow(C('RestCostMultiplier', 2.5), P().get().restCount || 0)); }
  function buildRest(body, api) {
    const p = P().get(), cost = [{ type: 'Gold', id: 0, count: restCost() }];
    const bad = p.paradox.filter(id => p.paradoxLocked.indexOf(id) < 0);
    body.innerHTML = `<div class="vd-col"><h4>${U().esc(TX('RestToPurifyParadox'))}</h4><p class="vd-desc">${U().esc(TX('URestVotePopup_Body_MainText'))}<br>${U().esc(TX('RestToPurifyParadoxDesc'))}</p>
      <p>${U().esc(TX('UParadoxPanel_Top_TitleText') || 'Nghịch lý')}: ${bad.length ? bad.map(id => U().esc(TX('TParadox_Name_' + id) || id)).join(', ') : U().esc(TX('UParadoxPanel_NoParadox_Text'))}</p>
      <div class="cost">${U().cost(cost)}</div><button class="vd-btn main go">${TX('ENpcFunctionType_Rest') || 'Nghỉ ngơi'}</button></div>`;
    const b = body.querySelector('.go');
    b.disabled = !P().has(cost);
    b.onclick = () => {
      if (!P().pay(cost)) return U().toast(TX('NotEnoughGold'));
      p.restCount = (p.restCount || 0) + 1;
      if (bad.length) { const id = bad[Math.floor(Math.random() * bad.length)]; p.paradox.splice(p.paradox.indexOf(id), 1); U().toast((TX('RestChatFormat') || '{0}').replace('{0}', TX('TParadox_Name_' + id) || id)); }
      else U().toast(TX('Rested') || 'Bạn đã nghỉ ngơi.');
      P().save(); api.refresh();
    };
  }
  reg('Rest', 'rest', TX('ENpcFunctionType_Rest') || 'Nghỉ ngơi', buildRest);

  // ---------------------------------------------------------------- Paradox (Evelyn)
  const pRow = id => (T().Paradox || []).find(r => r.Id === id) || {};
  const pLevel = r => (T().ParadoxLevel || []).find(l => l.Level === r.Level && l.IsPositive === r.IsPositive) || (T().ParadoxLevel || []).find(l => l.Level === r.Level) || {};
  function buildParadox(body, api, mode) {
    const $ = U().$, p = P().get();
    const want = mode === 'lock' ? true : false;
    body.innerHTML = `<div class="vd-col"><h4>${U().esc(TX(mode === 'lock' ? 'UParadoxLockPopup_Title_Text' : 'UParadoxPurifyPopup_Title_Text'))}</h4>
      <p class="vd-desc dim">${U().esc(TX(mode === 'lock' ? 'UParadoxLockPopup_Contents_Desc' : 'UParadoxPurifyPopup_Contents_Desc'))}</p><div class="vd-list ls"></div></div>`;
    const L = body.querySelector('.ls');
    const list = p.paradox.filter(id => !!pRow(id).IsPositive === want && (mode !== 'lock' || p.paradoxLocked.indexOf(id) < 0));
    if (!list.length) L.innerHTML = `<i class="dim">${U().esc(TX(mode === 'lock' ? 'UParadoxLockPopup_Contents_Empty' : 'UParadoxPurifyPopup_Contents_Empty'))}</i>`;
    for (const id of list) {
      const r = $('div', 'vd-row', L), lv = pLevel(pRow(id));
      const cost = [mode === 'lock' ? lv.LockGoodsData : lv.RemovalGoodsData].filter(Boolean);
      $('div', 't', r).innerHTML = `<b>${U().esc(TX('TParadox_Name_' + id) || id)}</b><span>${U().rich(TX('TParadox_Desc_' + id))}</span>`;
      $('div', 'c', r).innerHTML = U().cost(cost);
      const b = $('button', 'vd-btn', r); b.textContent = TX(mode === 'lock' ? 'ENpcFunctionType_ParadoxLock' : 'ENpcFunctionType_ParadoxPurify');
      b.disabled = !P().has(cost);
      b.onclick = ev => { ev.stopPropagation(); if (!P().pay(cost)) return; if (mode === 'lock') p.paradoxLocked.push(id); else p.paradox.splice(p.paradox.indexOf(id), 1); P().save(); api.refresh(); };
    }
  }
  reg('ParadoxPurify', 'paradoxPurify', TX('UParadoxPurifyPopup_Title_Text') || 'Thanh tẩy', (b, a) => buildParadox(b, a, 'purify'));
  reg('ParadoxLock', 'paradoxLock', TX('UParadoxLockPopup_Title_Text') || 'Cố định', (b, a) => buildParadox(b, a, 'lock'));

  // ---------------------------------------------------------------- LoungeBgm
  function buildBgm(body, api) {
    const $ = U().$, p = P().get();
    body.innerHTML = `<div class="vd-col"><div class="vd-list ls"></div><p class="vd-desc dim small">Chỉ những bài đã bóc trong bản web.</p></div>`;
    const L = body.querySelector('.ls');
    for (const r of T().LoungeBgm || []) {
      const have = !!VD.ASSETS.bgm[r.Bgm], open = P().condsOk(r.UnlockConditions);
      if (!have) continue;
      const el = $('div', 'vd-row' + (p.loungeBgm === r.Id ? ' sel' : '') + (open ? '' : ' locked'), L);
      el.innerHTML = `<div class="t"><b>♪ ${U().esc(TX('TLoungeBgm_Name_' + r.Id) || r.Bgm.replace(/_/g, ' '))}</b><span>${open ? '' : '🔒 ' + U().esc(TX('TItem_Name_' + (r.UnlockConditions[0] || [])[1]) || '')}</span></div>`;
      if (open) el.onclick = () => { p.loungeBgm = r.Id; P().save(); VD.lounge.playLoungeBgm(); api.refresh(); };
    }
  }
  reg('LoungeBgm', 'bgm', TX('ENpcFunctionType_LoungeBgm') || 'Đổi BGM', buildBgm);

  // ---------------------------------------------------------------- DangerLevel
  function buildDanger(body, api) {
    const p = P().get();
    body.innerHTML = `<div class="vd-col"><h4>${TX('Difficulty') || 'Độ khó'}</h4><div class="vd-seg d"></div><div class="vd-kv info"></div></div>`;
    const seg = body.querySelector('.d');
    for (const d of T().Difficulty || []) {
      const b = U().$('button', p.difficulty === d.Difficulty ? 'on' : '', seg);
      b.textContent = TX('EDifficulty_' + d.Difficulty) || d.Difficulty;
      b.onclick = () => { p.difficulty = d.Difficulty; if (p.activeCampaign) p.activeCampaign.difficulty = d.Difficulty; P().save(); api.refresh(); };
    }
    const d = (T().Difficulty || []).find(x => x.Difficulty === p.difficulty) || {};
    body.querySelector('.info').innerHTML = Object.keys(d).filter(k => /Percent$/.test(k)).map(k => `<dt>${k.replace(/Percent$/, '')}</dt><dd>${d[k]}%</dd>`).join('');
  }
  reg('DangerLevel', 'danger', TX('ENpcFunctionType_DangerLevel') || 'Mức độ rủi ro', buildDanger);

  // ---------------------------------------------------------------- Interior
  function interiorLabel(s) {
    const [k, a, b] = String(s).split(':');
    if (k === 'NpcLevel') return (TX('TNpc_Name_' + a) || a) + (b > 1 ? ' Lv.' + b : '');
    if (k === 'Area') return TX('TArea_Name_' + a) || a;
    if (k === 'AreaDecoration') return TX('TAreaDecoration_Name_' + a) || ('#' + a);
    return s;
  }
  function owned(s) {
    const p = P().get(), [k, a, b] = String(s).split(':');
    if (k === 'NpcLevel') return (p.npcLevel[a] | 0) >= (+b || 1);
    if (k === 'Area') return P().areaOpen(+a);
    if (k === 'AreaDecoration') return !!p.decoration[a];
    return false;
  }
  function buildInterior(body, api) {
    const $ = U().$, p = P().get();
    const st = api.st || (api.st = { area: 1 });
    body.innerHTML = `<div class="vd-cols"><div class="vd-col areas"><h4>${U().esc(TX('UInteriorPopup_Title_SectorText'))}</h4><div class="vd-list a"></div></div>
      <div class="vd-col grow"><h4>${U().esc(TX('UInteriorPopup_ListTitle_InteriorText'))}</h4><div class="vd-list i"></div>
      <p class="vd-desc dim small">Trang trí khu vực (AreaDecoration) mới lưu vào hồ sơ; chưa đổi hình trong sảnh.</p></div></div>`;
    const A = body.querySelector('.a');
    for (const a of T().Area || []) {
      const el = $('div', 'vd-row' + (st.area === a.Id ? ' sel' : ''), A);
      el.innerHTML = `<img class="ico" src="art/ui/icon_area/${a.Id}.webp" onerror="this.style.visibility='hidden'"><div class="t"><b>${U().esc(TX('TArea_Name_' + a.Id))}</b><span>${P().areaOpen(a.Id) ? '' : '🔒'}</span></div>`;
      el.onclick = () => { st.area = a.Id; api.refresh(); };
    }
    const I = body.querySelector('.i');
    for (const r of (T().InteriorShop || []).filter(x => x.AreaId === st.area)) {
      const el = $('div', 'vd-row' + (P().condsOk(r.UnlockConditions) ? '' : ' locked'), I);
      const cost = [{ type: 'Coin', id: 0, count: r.ConsumeCoin }, { type: 'Gold', id: 0, count: r.ConsumeGold }];
      const has = owned(r.Interior);
      el.innerHTML = `<div class="t"><b>${U().esc(interiorLabel(r.Interior))}</b><span>${has ? '✓' : ''}</span></div><div class="c">${has ? '' : U().cost(cost)}</div>`;
      if (!has) {
        const b = $('button', 'vd-btn', el); b.textContent = 'Mua';
        b.disabled = !P().condsOk(r.UnlockConditions) || !P().has(cost);
        b.onclick = ev => {
          ev.stopPropagation();
          if (!P().pay(cost)) return U().toast(TX('NotEnoughGoldOrCoin'));
          const [k, a, lv] = String(r.Interior).split(':');
          if (k === 'NpcLevel') p.npcLevel[a] = Math.max(p.npcLevel[a] | 0, +lv || 1);
          else if (k === 'Area') p.areaUnlocked[a] = true;
          else if (k === 'AreaDecoration') p.decoration[a] = true;
          P().save(); VD.lounge.refreshNpcs(); api.refresh();
        };
      }
    }
  }
  reg('Interior', 'interior', TX('UInteriorPopup_Title_Text') || 'Nội Thất', buildInterior);
})(window.VD = window.VD || {});
