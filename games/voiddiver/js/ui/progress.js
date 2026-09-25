// Tiến triển ở sảnh:
//  LevelUp (Chủ nhân 700005 "Cấp Độ Danh Tiếng") — Level.csv: EXP cộng dồn NeedExp + phí ConsumeGoodsData (Coin), tối đa Const.LevelMax;
//    thoại gốc Dialog_LevelUp_Enough_All_Conditon / _Exp_Not_Enough / _Coin_Not_Enough / _Gold_Not_Enough / _Max_Level / _Accept / _Deny.
//  Talent (Felix 1, Sofa 2, Edman 3, Lucas 4 = NpcFunction.Value1 = Talent.GroupId) — cây theo ảnh ss09: DisplayPoint [cột, hàng],
//    nối RootTalentIds, phí MaterialGoodsDatas, điều kiện UnlockConditions. Hiệu ứng: AddSkill (passive vào lõi combat khi lặn, qua
//    stage.charExtras), SkillSlotCount (ô skill), StashSlotCount, InventorySlotCount (profile.js / goods.js).
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;

  // ---------------------------------------------------------------- LevelUp: hội thoại với Chủ nhân
  function ownerSay(npcId, text, choices) {
    return new Promise(res => {
      const $ = U().$;
      const el = $('div', 'vd-npcmenu vd-lvup', document.getElementById('ui'));
      const m = VD.ASSETS.portrait || {}, pk = [npcId + '_Default'].find(k => m[k]);
      el.innerHTML = `${pk ? `<img class="por" src="${m[pk].path || m[pk]}">` : ''}<div class="box"><div class="name"></div><div class="text"></div></div><div class="vd-npcmenu-choices"></div>`;
      el.querySelector('.name').textContent = TX('TNpc_Name_' + npcId);
      el.querySelector('.text').innerHTML = U().rich(text);
      const box = el.querySelector('.vd-npcmenu-choices');
      const done = v => { el.remove(); removeEventListener('keydown', key, true); res(v); };
      const key = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); done(-1); } };
      addEventListener('keydown', key, true);
      (choices || [TX('Close') || 'Đóng']).forEach((c, i) => { const b = $('button', i === 0 && choices && choices.length > 1 ? 'quest' : '', box); b.textContent = c; b.dataset.i = i; b.onclick = () => done(i); });
      VD.input.enabled = false;
    });
  }
  async function levelUp(npcId) {
    const p = P().get(), nx = P().nextLevel();
    const fin = () => { if (!(VD.ui.isOpen() || (VD.npc && VD.npc.isOpen()))) { VD.input.enabled = true; VD.input.clear(); } VD.lounge.markDirty(); };
    if (!nx) { await ownerSay(npcId, TX('Dialog_LevelUp_Max_Level')); return fin(); }
    if (p.userExp < nx.NeedExp) { await ownerSay(npcId, TX('Dialog_LevelUp_Exp_Not_Enough') + `<br><span class="dim small">${TX('Exp')} ${U().fmt(p.userExp)} / ${U().fmt(nx.NeedExp)}</span>`); return fin(); }
    const cost = (nx.ConsumeGoodsData || []).map(x => P().parse(x)).filter(g => g && g.count > 0 && g.type !== 'None');
    const coin = cost.find(g => g.type === 'Coin'), gold = cost.find(g => g.type === 'Gold');
    if (!P().has(cost)) {
      const t = coin && P().coin() < coin.count ? 'Dialog_LevelUp_Coin_Not_Enough' : 'Dialog_LevelUp_Gold_Not_Enough';
      await ownerSay(npcId, (TX(t) || '').replace('{0}', U().fmt((coin || gold || { count: 0 }).count)));
      return fin();
    }
    const i = await ownerSay(npcId, (TX('Dialog_LevelUp_Enough_All_Conditon') || '').replace('{0}', U().fmt(coin ? coin.count : gold ? gold.count : 0)) +
      `<div class="cost">${U().cost(cost)}</div>`, [TX('Confirm') || 'Xác nhận', TX('Cancel') || 'Hủy']);
    if (i !== 0) { await ownerSay(npcId, TX('Dialog_LevelUp_Deny')); return fin(); }
    if (!P().pay(cost)) return fin();
    p.userLevel = nx.Level;
    P().save();
    U().toast((TX('ULevelUpPopup_Root_Desc') || 'Uy Tín Đã Tăng.') + ' Lv.' + p.userLevel);
    VD.lounge.questTick();
    await ownerSay(npcId, TX('Dialog_LevelUp_Accept'));
    fin();
  }
  VD.npc.register('LevelUp', { open: npcId => levelUp(npcId) });

  // ---------------------------------------------------------------- Talent
  const talentIcon = id => { const a = VD.ASSETS.icon && VD.ASSETS.icon.talent; return (a && a.dir ? a.dir : 'art/ui/icon_talent/') + id + '.webp'; };
  function tState(t) {
    const own = P().get().talents;
    if (own[t.Id]) return 'on';
    const roots = (t.RootTalentIds || []).every(r => own[r]);
    if (!roots) return 'lock';
    if (!P().condsOk(t.UnlockConditions)) return 'cond';
    return 'can';
  }
  function condText(c) {
    if (c[0] === 'UserLevel') return (TX('UUnlockMaterialPanel_Level_Caption') || 'Cấp') + ' ' + c[1];
    return c.join(':');
  }
  function buildTalent(body, api) {
    const $ = U().$, group = (api.fn && api.fn.Value1) || 1;
    const rows = (T().Talent || []).filter(t => t.GroupId === group);
    const st = api.st || (api.st = { sel: null });
    api.setTitle(TX('Talent_Group_' + group) || TX('ENpcFunctionType_Talent'));
    const maxC = Math.max(...rows.map(t => t.DisplayPoint[0])), maxR = Math.max(...rows.map(t => t.DisplayPoint[1]));
    const cols = $('div', 'vd-cols vd-talent', body);
    const tree = $('div', 'vd-col tree', cols);
    const W = 88, H = 96, PAD = 40;
    const cv = $('div', 'canvas', tree);
    cv.style.width = (maxC * W + PAD * 2 + 56) + 'px'; cv.style.height = (maxR * H + PAD * 2 + 56) + 'px';
    const pos = t => ({ x: PAD + t.DisplayPoint[0] * W + 28, y: PAD + t.DisplayPoint[1] * H + 28 });
    let svg = `<svg width="${maxC * W + PAD * 2 + 56}" height="${maxR * H + PAD * 2 + 56}">`;
    const byId = new Map(rows.map(t => [t.Id, t]));
    for (const t of rows) for (const r of t.RootTalentIds || []) {
      const a = byId.get(r); if (!a) continue;
      const p0 = pos(a), p1 = pos(t), on = P().get().talents[r] && P().get().talents[t.Id], half = P().get().talents[r];
      const my = (p0.y + p1.y) / 2;
      svg += `<path d="M${p0.x},${p0.y + 26} L${p0.x},${my} L${p1.x},${my} L${p1.x},${p1.y - 26}" class="${on ? 'on' : half ? 'half' : ''}"/>`;
    }
    svg += '</svg>';
    cv.innerHTML = svg;
    for (const t of rows) {
      const s = tState(t), p = pos(t);
      const n = $('div', 'tnode ' + s + (st.sel === t.Id ? ' sel' : ''), cv);
      n.style.left = (p.x - 28) + 'px'; n.style.top = (p.y - 28) + 'px';
      n.dataset.id = t.Id;
      n.innerHTML = `<img src="${talentIcon(t.Id)}" onerror="this.style.visibility='hidden'">${s === 'lock' || s === 'cond' ? '<i class="lk"></i>' : ''}${s === 'can' ? `<span>${U().esc(TX('UTalentTooltip_Unlockable_Text') || '')}</span>` : ''}`;
      n.title = TX('TTalent_Name_' + t.Id);
      n.onclick = () => { st.sel = t.Id; api.refresh(); };
    }
    // ---- chi tiết
    const side = $('div', 'vd-col side', cols);
    const t = byId.get(st.sel) || rows.find(x => tState(x) === 'can') || rows[0];
    if (!st.sel) st.sel = t.Id;
    const s = tState(t);
    const eff = (t.Effects || []).map(e => e[0] === 'AddSkill' ? '' : (TX('ETalentEffectType_' + e[0]) || e[0]) + ' +' + e[1]).filter(Boolean).join(' · ');
    side.innerHTML = `<div class="ic"><img src="${talentIcon(t.Id)}" onerror="this.style.visibility='hidden'"></div><h3>${U().esc(TX('TTalent_Name_' + t.Id))}</h3>
      <p class="vd-desc">${U().rich(TX('TTalent_Desc_' + t.Id))}${eff ? '<br>' + U().esc(eff) : ''}</p>
      <div class="state ${s}">${s === 'on' ? TX('UTalentTooltip_Unlocked_Text') : s === 'can' ? TX('UTalentTooltip_Unlockable_Text') : TX('UTalentTooltip_Locked_Text')}</div>
      ${(t.UnlockConditions || []).length ? `<p class="vd-desc small">${t.UnlockConditions.map(c => `<span class="${P().condOk(c) ? '' : 'bad'}">${U().esc(condText(c))}</span>`).join(' · ')}</p>` : ''}
      <h4>${TX('UCharacterTalentTooltip_Caption_Text') || 'Chi phí'}</h4><div class="cost">${U().cost(t.MaterialGoodsDatas)}</div>
      <button class="vd-btn main act">${TX('UTalentInfoPanel_Normal_Text') || 'Kích hoạt'}</button>`;
    const b = side.querySelector('.act');
    b.disabled = s !== 'can' || !P().has(t.MaterialGoodsDatas);
    b.onclick = () => {
      if (tState(t) !== 'can') return;
      if (!P().pay(t.MaterialGoodsDatas)) return U().toast(TX('NotEnoughMaterials') || 'Không đủ nguyên liệu.');
      P().get().talents[t.Id] = true; P().save();
      U().toast((TX('TalentUnlocked') || 'Đã kích hoạt') + ': ' + TX('TTalent_Name_' + t.Id));
      api.refresh();
    };
  }
  VD.ui.panels.talent = { id: 'talent', title: TX('ENpcFunctionType_Talent'), cls: 'p-talent', build: buildTalent };
  VD.npc.register('Talent', {
    label: f => TX('Talent_Group_' + f.Value1) || '',
    open: (npcId, fn) => VD.ui.open(Object.assign({}, VD.ui.panels.talent, { build: (b, a) => { a.fn = fn; buildTalent(b, a); } })),
  });
  VD.uiProgress = { levelUp, tState };
})(window.VD = window.VD || {});
