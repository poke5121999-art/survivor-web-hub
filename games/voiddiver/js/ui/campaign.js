// NpcFunction "Campaign" (Elara): danh sách campaign theo Campaign.csv + UnlockConditions, chi tiết theo khoá UCampaignDetailPanel_*
// (khu vực, cấp khuyến nghị, độ khó Difficulty.csv, nhiệm vụ CampaignTask, điều kiện thất bại, thưởng Repeat/First, EXP), nhân vật + skill.
// "Bắt Đầu Chiến Dịch" = nhận campaign (VD.lounge.acceptCampaign → OnLounge của script gốc); lặn bằng bốt điện thoại (VD.app.toDive).
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;

  // Campaign chơi được ở bản web: mọi FixedSectors có art, và nếu còn ô trống thì có sector cùng ThemeType để lấp (luật ghép của dive.js).
  function playable(c) {
    const A = (VD.ASSETS && VD.ASSETS.sector) || {};
    const fx = (c.FixedSectors || []).map(f => f[2]).filter(x => x > 0);
    if (fx.some(id => !A[id])) return false;
    const need = c.MapSize[0] * c.MapSize[1] > fx.length;
    return !need || (T().Sector || []).some(s => s.AreaType === 'Playable' && s.ThemeType === c.ThemeType && A[s.Id]);
  }
  const CAT_ORDER = { Tutorial: 0, Story: 1, Normal: 2 };
  // LocalizedText không có ECampaignCategory_*: nhãn nhóm tự đặt.
  const CAT_LABEL = { Tutorial: 'Hướng dẫn', Story: 'Cốt truyện', Normal: 'Thường' };
  // Nhiệm vụ campaign: EEventConditionType_<Loại> ("Nhận {0}" → tên món) + mục tiêu Goal.
  function taskText(t) {
    const [k, a] = String(t.EventCondition || '').split(':');
    let s = TX('TCampaignTask_Desc_' + t.Id) || TX('EEventConditionType_' + k) || k;
    if (s.indexOf('{0}') >= 0) s = s.replace('{0}', a ? (TX('TItem_Name_' + a) || TX('TEquipment_Name_' + a) || TX('TMonster_Name_' + a) || a) : '');
    return s + (t.Goal > 1 ? ' ' + U().fmt(t.Goal) : '');
  }
  function list() {
    return (T().Campaign || []).filter(c => !(c.Category === 'Tutorial' && P().cleared(c.Id)))
      .sort((a, b) => (CAT_ORDER[a.Category] - CAT_ORDER[b.Category]) || (a.RecommendedLevel - b.RecommendedLevel) || (a.Id - b.Id));
  }
  function condText(c) {
    const [k, v] = c;
    if (k === 'UserLevel') return (TX('UUnlockMaterialPanel_Level_Caption') || 'Cấp') + ' ' + v;
    if (k === 'CampaignCleared') return (TX('TCampaign_Name_' + v) || v) + ' — ' + (TX('CampaignCompletedText') || 'hoàn thành');
    if (k === 'LoungeQuestCleared') return (TX('TLoungeQuest_Name_' + v) || v);
    return k + ' ' + v;
  }

  function build(body, api) {
    const $ = U().$, p = P().get();
    const st = api.st || (api.st = { sel: (p.activeCampaign && p.activeCampaign.id) || null, diff: (p.activeCampaign && p.activeCampaign.difficulty) || p.difficulty || 'Normal' });
    const all = list();
    if (!st.sel) { const first = all.find(c => P().condsOk(c.UnlockConditions) && playable(c)); st.sel = first ? first.Id : all[0].Id; }
    const cols = $('div', 'vd-cols vd-camp', body);
    // ---- danh sách
    const left = $('div', 'vd-col list', cols);
    let lastCat = null;
    const L = $('div', 'vd-list', left);
    for (const c of all) {
      if (c.Category !== lastCat) { lastCat = c.Category; $('h4', null, L).textContent = CAT_LABEL[c.Category] || c.Category; }
      const open = P().condsOk(c.UnlockConditions), ok = open && playable(c);
      const r = $('div', 'vd-row' + (c.Id === st.sel ? ' sel' : '') + (ok ? '' : ' locked'), L);
      r.dataset.id = c.Id;
      const cleared = P().cleared(c.Id);
      r.innerHTML = `<img class="ico" src="art/ui/icon_common/${!open ? 'LockCampaign' : c.Category === 'Story' || c.Category === 'Tutorial' ? 'Story' : 'Quest'}.webp">
        <div class="t"><b>${U().esc(TX('TCampaign_Name_' + c.Id) || c.Id)}</b><span>${TX('EThemeType_' + c.ThemeType) || ''} · Lv.${c.RecommendedLevel}${cleared ? ' · ✓' : ''}</span></div>`;
      r.onclick = () => { st.sel = c.Id; api.refresh(); };
    }
    // ---- chi tiết
    const c = (T().Campaign || []).find(x => x.Id === st.sel);
    const open = P().condsOk(c.UnlockConditions), ok = open && playable(c);
    const mid = $('div', 'vd-col detail', cols);
    const tasks = (T().CampaignTask || []).filter(t => t.CampaignId === c.Id);
    const cell = g => U().cell(P().parse(g));
    mid.innerHTML = `
      <div class="hd"><span class="vd-tag gold">${CAT_LABEL[c.Category] || c.Category}</span>${c.IsBossCampaign ? '<img class="boss" src="art/ui/icon_common/Boss.webp">' : ''}
        <h2>${U().esc(TX('TCampaign_Name_' + c.Id))}</h2></div>
      <dl class="vd-kv">
        <dt>${TX('UCampaignDetailPanel_Region_Caption') || 'Khu vực'}</dt><dd>${U().esc(TX('TCampaign_SectorName_' + c.Id))} · ${TX('EThemeType_' + c.ThemeType) || ''}</dd>
        <dt>${TX('UCampaignDetailPanel_Level_Caption') || 'Cấp độ'}</dt><dd>Lv. ${c.RecommendedLevel}${p.userLevel < c.RecommendedLevel ? ' <span class="warn">▲</span>' : ''}</dd>
        <dt>${TX('UCampaignDetailPanel_FailCondition_Caption') || ''}</dt><dd>${U().esc(TX('TCampaign_FailConditionDesc_' + c.Id) || '—')}</dd>
        ${c.IsFixedAnomaly && c.AnomalyType !== 'None' ? `<dt>${TX('UCampaignDetailPanel_Anomaly_Caption')}</dt><dd>${TX('EAnomalyType_' + c.AnomalyType) || c.AnomalyType}</dd>` : ''}
      </dl>
      <p class="vd-desc">${U().rich(TX('TCampaign_Desc_' + c.Id))}</p>
      ${tasks.length ? `<h4>${TX('UCampaignDetailPanel_Quest_Caption') || 'Nhiệm vụ'} (${tasks.length})</h4><ul class="tasks">${tasks.map(t => `<li>◇ ${U().esc(taskText(t))}</li>`).join('')}</ul>` : ''}
      <h4>${TX('UCampaignDetailPanel_Reward_Caption') || 'Thưởng'}</h4><div class="vd-grid rw"></div>
      <h4>${TX('UCampaignDetailPanel_FirstReward_Caption') || 'Thưởng lần đầu'}</h4><div class="vd-grid fr"></div>
      <div class="exp">${TX('EGoodsType_Exp') || 'EXP'} +${U().fmt(c.GainedExp || 0)}</div>
      ${!open ? `<div class="lock">🔒 ${c.UnlockConditions.filter(x => !P().condOk(x)).map(condText).map(U().esc).join(' · ')}</div>` : !ok ? '<div class="lock">Chưa có bản đồ ở bản web.</div>' : ''}`;
    const rw = mid.querySelector('.rw'), fr = mid.querySelector('.fr');
    for (const g of c.RepeatRewards || []) rw.appendChild(cell(g));
    if (!(c.RepeatRewards || []).length) rw.innerHTML = '<i>—</i>';
    if ((c.FirstRewards || []).length && !P().quest('c' + c.Id).firstRewarded) for (const g of c.FirstRewards) fr.appendChild(cell(g));
    else fr.innerHTML = `<i class="dim">${U().esc(TX('UCampaignDetailPanel_FirstReward_Desc') || '—')}</i>`;
    // ---- độ khó + nhân vật + bắt đầu
    const right = VD.ui.$('div', 'vd-col side', cols);
    right.innerHTML = `<h4>${TX('UCampaignDetailPanel_Difficulty_Caption') || 'Độ khó'}</h4><div class="vd-seg diff"></div><p class="dtag vd-desc"></p>
      <p class="vd-desc dim small">${U().esc(TX('UCampaignDetailPanel_Layout_TextDesc'))}</p>
      <h4>${TX('SelectedSkill') || 'Nhân vật'}</h4><div class="who"></div>
      <div class="go"></div>`;
    const seg = right.querySelector('.diff');
    for (const d of T().Difficulty || []) {
      const b = VD.ui.$('button', d.Difficulty === st.diff ? 'on' : '', seg);
      b.textContent = TX('EDifficulty_' + d.Difficulty) || d.Difficulty;
      b.onclick = () => { st.diff = d.Difficulty; api.refresh(); };
    }
    const dRow = (T().Difficulty || []).find(d => d.Difficulty === st.diff) || {};
    right.querySelector('.dtag').innerHTML = (st.diff === 'Hard' ? TX('UCampaignDetailPanel_HardTag_Text') : st.diff === 'Insane' ? TX('UCampaignDetailPanel_ExpertTag_Text') : '') +
      `<br><span class="dim small">${TX('EGoodsType_Exp') || 'EXP'} ×${dRow.UserExpPercent || 100}% · HP quái ×${dRow.MonsterHpPercent || 100}% · ATK quái ×${dRow.MonsterAtkPercent || 100}%</span>`;
    VD.uiChar.summary(right.querySelector('.who'), () => api.refresh());
    const go = right.querySelector('.go');
    const active = p.activeCampaign && p.activeCampaign.id === c.Id;
    const btn = VD.ui.$('button', 'vd-btn main', go);
    btn.textContent = active ? (TX('CampaignSelected') || 'Đang nhận · đổi độ khó') : (TX('UCampaignDetailPanel_Normal_TextTitle') || 'Bắt Đầu Chiến Dịch');
    btn.disabled = !ok;
    btn.dataset.act = 'accept';
    btn.onclick = () => {
      if (active) { p.activeCampaign.difficulty = st.diff; P().save(); api.close(); return; }
      VD.lounge.acceptCampaign(c.Id, st.diff);
      p.difficulty = st.diff; P().save();
      api.close();
    };
    const hint = VD.ui.$('p', 'vd-desc small', go);
    hint.textContent = TX('LCommon_1001') || '';
  }

  VD.ui.panels.campaign = { id: 'campaign', title: TX('ENpcFunctionType_Campaign') || 'Chiến dịch', cls: 'p-campaign', build };
  VD.npc.register('Campaign', { open: () => VD.ui.open(VD.ui.panels.campaign) });
  VD.uiCampaign = { playable, list };
})(window.VD = window.VD || {});
