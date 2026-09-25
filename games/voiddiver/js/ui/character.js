// NpcFunction "CharacterSelect" (Narcis, gương) và "CharacterSkill" (Felix): theo ảnh Steam ss07 — hàng chân dung trên cùng,
// tranh lớn bên trái, tên/danh hiệu/thẻ/mô tả ở giữa, "Kỹ năng đang được chọn" + "Chọn kỹ năng" bên phải.
// Loadout = ô RMB/Q/E/R ↔ chỉ số trong Character.ActiveSkillIds; số ô mở = VD.app.skillSlotCount() (2 + Talent SkillSlotCount).
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;
  const KEYS = ['RMB', 'Q', 'E', 'R'];
  const skillIcon = id => { const a = VD.ASSETS.icon && VD.ASSETS.icon.skill; return (a && a.dir ? a.dir : 'art/ui/icon_skill/') + id + '.webp'; };
  const portrait = (id, emo) => {
    const m = VD.ASSETS.portrait || {};
    const k = [id + '_' + (emo || 'Default'), id + '_Default', String(id)].find(x => m[x]);
    return k ? (m[k].path || m[k]) : null;
  };
  const faceIcon = id => { const a = VD.ASSETS.icon && VD.ASSETS.icon.unit_character; return (a && a.dir ? a.dir : 'art/ui/icon_unit_character/') + id + '_Default.webp'; };

  // Nhân vật chọn được: Character.IsUsable. Bảng không có điều kiện mở riêng (SYSTEMS.md: [CHƯA RÕ]); bản web mở cả 4 sau khi
  // qua tutorial 1100 (trước đó chỉ Gayoung, người được cứu trong 1100). [SUY LUẬN]
  function usable() { return (T().Character || []).filter(c => c.IsUsable !== false); }
  function unlocked(id) { return id === 100001 || P().cleared(1100) || P().get().unlockedChars.indexOf(id) >= 0; }

  function skillName(id) { return TX('TSkill_Name_' + id) || String(id); }
  function slotsOf(charId) {
    const row = (T().Character || []).find(c => c.Id === charId);
    const lo = VD.app.skillLoadout(charId);
    return VD.app.SLOT_KEYS.map((k, i) => ({ key: k, label: KEYS[i], idx: lo[k], id: lo[k] >= 0 && row ? row.ActiveSkillIds[lo[k]] : 0, open: i < VD.app.skillSlotCount() }));
  }

  // Ô tóm tắt (dùng trong bảng Campaign): chân dung nhỏ + tên + icon skill đang chọn + nút đổi.
  function summary(el, onChange) {
    const p = P().get(), id = p.character;
    el.innerHTML = `<div class="vd-who"><img class="face" src="${faceIcon(id)}"><div><b>${U().esc(TX('TCharacter_Name_' + id))}</b><span>${U().esc(TX('TCharacter_Title_' + id))}</span></div></div>
      <div class="vd-skslots"></div><div class="btns"><button class="vd-btn ch">${TX('ENpcFunctionType_CharacterSelect') || 'Đổi nhân vật'}</button><button class="vd-btn sk">${TX('SkillSelect') || 'Chọn kỹ năng'}</button></div>`;
    paintSlots(el.querySelector('.vd-skslots'), id);
    el.querySelector('.ch').onclick = () => openSelect(onChange);
    el.querySelector('.sk').onclick = () => openSkill(onChange);
  }
  function paintSlots(box, charId, onPick, selKey) {
    box.innerHTML = '';
    for (const s of slotsOf(charId)) {
      const d = U().$('div', 'vd-skslot' + (s.open ? '' : ' locked') + (selKey === s.key ? ' sel' : ''), box);
      d.innerHTML = (s.id ? `<img src="${skillIcon(s.id)}" onerror="this.style.visibility='hidden'">` : s.open ? '' : '<img class="lk" src="art/ui/icon_common/Lock.webp">') + `<b>${s.label}</b>`;
      d.title = s.id ? skillName(s.id) : s.open ? (TX('USkillSelectPopup_SlotEmpty_EmptySelectSkillText') || '') : (TX('USkillSelectPopup_SlotLocked_LockedSelectSkillText') || '');
      d.dataset.slot = s.key;
      if (onPick && s.open) d.onclick = () => onPick(s);
    }
  }

  // ---------------------------------------------------------------- CharacterSelect
  function buildSelect(body, api) {
    const $ = U().$, p = P().get();
    const st = api.st || (api.st = { sel: p.character });
    const top = $('div', 'vd-chartop', body);
    for (const c of usable()) {
      const ok = unlocked(c.Id);
      const f = $('div', 'vd-charface' + (c.Id === st.sel ? ' sel' : '') + (ok ? '' : ' locked') + (c.Id === p.character ? ' cur' : ''), top);
      f.innerHTML = `<img src="${faceIcon(c.Id)}"><span>${c.Id === p.character ? (TX('Selected') || 'Đang chọn') : ''}</span>`;
      f.dataset.id = c.Id;
      f.onclick = () => { st.sel = c.Id; api.refresh(); };
    }
    const row = (T().Character || []).find(c => c.Id === st.sel);
    const wrap = $('div', 'vd-charbody', body);
    const por = portrait(st.sel);
    wrap.innerHTML = `<div class="art">${por ? `<img src="${por}">` : ''}</div>
      <div class="info"><h2>${U().esc(TX('TCharacter_Name_' + st.sel))}</h2><div class="ttl">${U().esc(TX('TCharacter_Title_' + st.sel))}</div>
        <div class="tags">${(row['Tags:Localized'] || []).map(t => `<span class="vd-tag">${U().esc(TX(t) || t)}</span>`).join('')}</div>
        <p class="vd-desc">${U().rich(TX('TCharacter_Desc_' + st.sel))}</p>
        <dl class="vd-kv stats">
          <dt>${TX('UCharacterInfoPanel_Hp_Caption')}</dt><dd>${row.Hp}</dd>
          <dt>${TX('UCharacterInfoPanel_Atk_Caption')}</dt><dd>${row.Atk}</dd>
          <dt>${TX('UCharacterInfoPanel_Def_Caption')}</dt><dd>${row.Def}</dd>
          <dt>${TX('UCharacterInfoPanel_MoveSpeed_Caption')}</dt><dd>${row.MoveSpeed}</dd>
          <dt>${TX('UCharacterInfoPanel_Stamina_Caption')}</dt><dd>${row.Stamina}</dd>
        </dl></div>
      <div class="side"><h4>${TX('SelectedSkill') || 'Kỹ năng đang được chọn'}</h4><div class="vd-skslots"></div>
        <button class="vd-btn sk">${TX('SkillSelect') || 'Chọn kỹ năng'}</button>
        <button class="vd-btn main pick"></button></div>`;
    paintSlots(wrap.querySelector('.vd-skslots'), st.sel);
    const pick = wrap.querySelector('.pick');
    const ok = unlocked(st.sel);
    pick.textContent = st.sel === p.character ? (TX('Selected') || 'Đang chọn') : (TX('Select') || 'Chọn');
    pick.disabled = !ok || st.sel === p.character;
    pick.onclick = () => { selectChar(st.sel); api.refresh(); };
    wrap.querySelector('.sk').onclick = () => { if (ok) selectChar(st.sel); openSkill(() => api.refresh()); };
    if (!ok) VD.ui.$('p', 'vd-desc dim', wrap.querySelector('.side')).textContent = '🔒 ' + (TX('TCampaign_Name_1100') || '1100');
  }
  // Đổi nhân vật: thay hình người chơi trong sảnh ngay.
  function selectChar(id) {
    const p = P().get();
    if (p.character === id) return;
    p.character = id;
    if (p.unlockedChars.indexOf(id) < 0) p.unlockedChars.push(id);
    P().save();
    const S = VD.stage, old = S.player;
    if (old && VD.app.scene === 'lounge') {
      const u = S.spawn({ kind: 'char', id, pos: { x: old.pos.x, z: old.pos.z }, aim: old.aim });
      S.remove(old);
      S.setPlayer(u, { SkillOne: -1, SkillTwo: -1, SkillThree: -1, SkillFour: -1 });
      VD.player = u;
    }
  }
  function openSelect(onClose) { const api = VD.ui.open(Object.assign({}, VD.ui.panels.charSelect, { onClose })); return api; }

  // ---------------------------------------------------------------- CharacterSkill (USkillSelectPopup)
  function buildSkill(body, api) {
    const $ = U().$, p = P().get(), id = p.character;
    const row = (T().Character || []).find(c => c.Id === id);
    const st = api.st || (api.st = { slot: 'SkillOne' });
    const lo = P().loadout(id);
    body.innerHTML = `<div class="vd-cols vd-skill">
      <div class="vd-col"><h4>${U().esc(TX('TCharacter_Name_' + id))} — ${TX('SelectedSkill') || ''}</h4><div class="vd-skslots big"></div>
        <p class="vd-desc dim small">${U().esc(TX('USkillSelectPopup_LMB_Text'))}</p></div>
      <div class="vd-col grow"><h4>${U().esc(TX('USkillSelectPopup_SlotTitle_ScrollerGuideText'))}</h4><div class="vd-list sklist"></div></div></div>`;
    paintSlots(body.querySelector('.vd-skslots'), id, s => { st.slot = s.key; api.refresh(); }, st.slot);
    const L = body.querySelector('.sklist');
    (row.ActiveSkillIds || []).forEach((sid, i) => {
      const r = $('div', 'vd-row skillrow', L);
      const inSlot = VD.app.SLOT_KEYS.find(k => lo[k] === i);
      const sk = VD.combatDB().skill(sid) || {};
      const cost = [sk.CoolTime ? `<img src="art/ui/icon_common/SkillInfoCooltime.webp">${sk.CoolTime}s` : '', sk.StressCost ? `<img src="art/ui/icon_common/SkillInfoStress.webp">${sk.StressCost}` : '', sk.ChargeCost ? '⚡' + sk.ChargeCost : ''].filter(Boolean).join(' ');
      r.innerHTML = `<img class="sk" src="${skillIcon(sid)}" onerror="this.style.visibility='hidden'"><div class="t"><b>${U().esc(skillName(sid))}${(sk.SkillTags || []).indexOf('Ultimate') >= 0 ? ' <span class="vd-tag gold">Ultimate</span>' : ''}${inSlot ? ` <span class="vd-tag">${KEYS[VD.app.SLOT_KEYS.indexOf(inSlot)]}</span>` : ''}</b>
        <span class="c">${cost}</span><span class="d">${U().rich(TX('TSkill_Desc_' + sid))}</span></div>`;
      r.dataset.idx = i;
      r.onclick = () => {
        // Đặt skill i vào ô đang chọn; skill đã ở ô khác thì đổi chỗ.
        const cur = lo[st.slot];
        const other = VD.app.SLOT_KEYS.find(k => lo[k] === i);
        if (other) lo[other] = cur != null ? cur : -1;
        lo[st.slot] = i;
        P().save();
        api.refresh();
      };
    });
  }
  function openSkill(onClose) { return VD.ui.open(Object.assign({}, VD.ui.panels.charSkill, { onClose })); }

  VD.ui.panels.charSelect = { id: 'charSelect', title: TX('ENpcFunctionType_CharacterSelect') || 'Đổi Nhân Vật', cls: 'p-char', build: buildSelect };
  VD.ui.panels.charSkill = { id: 'charSkill', title: TX('USkillSelectPopup_Title_Text') || 'Chọn Kỹ Năng', cls: 'p-skill', build: buildSkill };
  VD.npc.register('CharacterSelect', { open: () => openSelect() });
  VD.npc.register('CharacterSkill', { open: () => openSkill() });
  VD.uiChar = { summary, openSelect, openSkill, selectChar, unlocked, slotsOf };
})(window.VD = window.VD || {});
