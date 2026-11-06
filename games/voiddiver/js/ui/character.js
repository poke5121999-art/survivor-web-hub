// NpcFunction "CharacterSelect" (Narcis) → CharacterSettingPopup gốc; "CharacterSkill" (Felix) và nút "Chọn kỹ năng" của
// CharacterSettingPopup → SkillSelectPopup gốc. Cây prefab đo bằng tools/ui_inventory_dump.py (CharacterSettingPopup,
// SkillSelectPopup, SkillSelectInfoSlot, SkillInfoDisplaySlot); luật đọc từ GameAssembly (tools/il2cpp_method.py). docs/LOUNGE.md §6.2.
// Loadout: ô 0..3 = RMB/Q/E/R (Character.SelectedActiveSkillIds) ↔ chỉ số trong TCharacter.ActiveSkillIds;
// số ô mở = GamePlayer.ActiveSlotCount = 2 + Talent SkillSlotCount (VD.app.skillSlotCount); ô 4 = C, skill của trang bị.
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;
  const KEYS = ['RMB', 'Q', 'E', 'R'];
  // SkillSelectPopup/Body/Skill/SkillGroup[]: KeyGuide của 5 ô (II_ImagePrompt).
  const SLOT_KB = ['Mouse_Right_Key', 'Q_Key', 'E_Key', 'R_Key', 'C_Key'];
  // Ảnh phím (bộ sprite gốc đã bóc ở art/ui/inventory, như menu.js).
  const keyImg = n => `<img class="vd-key" src="art/ui/inventory/${n}.webp" alt="">`;
  const EQUIP_SLOT = 4;
  const skillIcon = id => { const a = VD.ASSETS.icon && VD.ASSETS.icon.skill; return (a && a.dir ? a.dir : 'art/ui/icon_skill/') + id + '.webp'; };
  const portrait = (id, emo) => {
    const m = VD.ASSETS.portrait || {};
    const k = [id + '_' + (emo || 'Default'), id + '_Default', String(id)].find(x => m[x]);
    return k ? (m[k].path || m[k]) : null;
  };
  const faceIcon = id => { const a = VD.ASSETS.icon && VD.ASSETS.icon.unit_character; return (a && a.dir ? a.dir : 'art/ui/icon_unit_character/') + id + '_Default.webp'; };
  const fmt = (s, ...a) => String(s || '').replace(/\{(\d+)(?::[^}]*)?\}/g, (m, i) => a[+i] != null ? a[+i] : '');

  // Nhân vật chọn được: Character.IsUsable. Bảng không có điều kiện mở riêng (SYSTEMS.md: [CHƯA RÕ]); bản web mở cả 4 sau khi
  // qua tutorial 1100 (trước đó chỉ Gayoung, người được cứu trong 1100). [SUY LUẬN]
  function usable() { return (T().Character || []).filter(c => c.IsUsable !== false); }
  function unlocked(id) { return id === 100001 || P().cleared(1100) || P().get().unlockedChars.indexOf(id) >= 0; }
  const charRow = id => (T().Character || []).find(c => c.Id === id);

  function skillName(id) { return TX('TSkill_Name_' + id) || String(id); }
  function slotsOf(charId) {
    const row = charRow(charId);
    const lo = VD.app.skillLoadout(charId);
    return VD.app.SLOT_KEYS.map((k, i) => ({ key: k, label: KEYS[i], idx: lo[k], id: lo[k] >= 0 && row ? row.ActiveSkillIds[lo[k]] : 0, open: i < VD.app.skillSlotCount() }));
  }
  // GamePlayer.GetSelectableActiveSkillIds = TCharacter.ActiveSkillIds + Talent AddSkill (skill Active) / UnlockSkillMode / ChangeSkill;
  // bảng demo không có talent nào thêm skill Active nên chỉ còn ActiveSkillIds. SkillSelectScrollerPresenter.BuildSlotModels xếp theo
  // GetBaseSkillId → skill chế độ sau skill gốc → Id: ở đây là theo Id tăng dần.
  function selectable(charId) { const row = charRow(charId); return ((row && row.ActiveSkillIds) || []).slice().sort((a, b) => a - b); }

  // Ô tóm tắt (dùng trong bảng Campaign): chân dung nhỏ + tên + icon skill đang chọn + nút đổi.
  function summary(el, onChange) {
    const p = P().get(), id = p.character;
    el.innerHTML = `<div class="vd-who"><img class="face" src="${faceIcon(id)}"><div><b>${U().esc(TX('TCharacter_Name_' + id))}</b><span>${U().esc(TX('TCharacter_Title_' + id))}</span></div></div>
      <div class="vd-skslots"></div><div class="btns"><button class="vd-btn ch">${TX('ENpcFunctionType_CharacterSelect') || 'Đổi nhân vật'}</button><button class="vd-btn sk">${TX('SkillSetting') || 'Chọn kỹ năng'}</button></div>`;
    paintSlots(el.querySelector('.vd-skslots'), id, true);
    el.querySelector('.ch').onclick = () => openSelect(onChange);
    el.querySelector('.sk').onclick = () => openSkill(onChange);
  }
  // CharacterSettingPopup/Skill_/Group[] (UpdateSkillInfo): chỉ hiện ActiveSlotCount ô, icon theo SelectedActiveSkillIds, không nhãn phím.
  function paintSlots(box, charId, labels) {
    box.innerHTML = '';
    for (const s of slotsOf(charId)) {
      if (!s.open) continue;
      const d = U().$('div', 'vd-skslot' + (s.id ? '' : ' empty'), box);
      d.innerHTML = (s.id ? `<img src="${skillIcon(s.id)}" onerror="this.style.visibility='hidden'">` : '') + (labels ? `<b>${s.label}</b>` : '');
      d.title = s.id ? skillName(s.id) : (TX('USkillSelectPopup_SlotEmpty_EmptySelectSkillText') || '');
      d.dataset.slot = s.key;
    }
  }

  // ---------------------------------------------------------------- CharacterSettingPopup (Narcis)
  function buildSelect(body, api) {
    const $ = U().$, p = P().get();
    const st = api.st || (api.st = { sel: p.character });
    const top = $('div', 'vd-chartop', body);
    for (const c of usable()) {
      const ok = unlocked(c.Id);
      const f = $('div', 'vd-charface' + (c.Id === st.sel ? ' sel' : '') + (ok ? '' : ' locked') + (c.Id === p.character ? ' cur' : ''), top);
      f.innerHTML = `<img src="${faceIcon(c.Id)}"><span>${c.Id === p.character ? (TX('Seleted') || 'Đã chọn') : ''}</span>`;
      f.dataset.id = c.Id;
      // CharacterSettingPopupPresenter.OnCharacterSlotClick → SetCharacter: gửi ReqChangeCharacter ngay, không có nút xác nhận.
      f.onclick = () => { st.sel = c.Id; if (ok) selectChar(c.Id); api.refresh(); };
    }
    const row = charRow(st.sel);
    const wrap = $('div', 'vd-charbody', body);
    const por = portrait(st.sel);
    const ok = unlocked(st.sel);
    wrap.innerHTML = `<div class="art">${por ? `<img src="${por}">` : ''}</div>
      <div class="info"><h2>${U().esc(TX('TCharacter_Name_' + st.sel))}</h2><div class="ttl">${U().esc(TX('TCharacter_Title_' + st.sel))}</div>
        <div class="tags">${(row['Tags:Localized'] || []).map(t => `<span class="vd-tag">${U().esc(TX(t) || t)}</span>`).join('')}</div>
        <p class="vd-desc">${U().rich(TX('TCharacter_Desc_' + st.sel))}</p></div>
      <div class="side vd-cskill"><h4>${TX('SelectedSkill') || 'Kỹ năng đang được chọn'}</h4><div class="vd-skslots"></div>
        <button class="vd-btn sk">${TX('SkillSetting') || 'Chọn kỹ năng'}</button></div>`;
    paintSlots(wrap.querySelector('.vd-skslots'), st.sel);
    const sk = wrap.querySelector('.sk');
    sk.disabled = !ok || st.sel !== p.character;
    sk.onclick = () => openSkill(() => api.refresh());
    if (!ok) VD.ui.$('p', 'vd-desc dim', wrap.querySelector('.side')).textContent = '🔒 ' + (TX('TCampaign_Name_1100') || '1100');
  }
  // Đổi nhân vật: hồ sơ trước, rồi VD.app.refreshLoungePlayer sinh lại người chơi tại chỗ với đồ + skill của nhân vật đó.
  function selectChar(id) {
    const p = P().get();
    if (p.character === id) return;
    p.character = id;
    if (p.unlockedChars.indexOf(id) < 0) p.unlockedChars.push(id);
    P().save();
    VD.app.refreshLoungePlayer();
  }
  function openSelect(onClose) { const api = VD.ui.open(Object.assign({}, VD.ui.panels.charSelect, { onClose })); return api; }

  // ---------------------------------------------------------------- SkillSelectPopup (Felix)
  // Luật (SkillSelectPopupPresenter):
  //  - OnOpenAsync: 4 ô Active (SlotType 0, SkillId = SelectedActiveSkillIds[i] hoặc −1, khoá khi i ≥ ActiveSlotCount) + ô Equipment
  //    (SlotType 1) chỉ khi Character.EquipmentActiveSkillId > 0; _targetIndex = 0 (ô RMB chọn sẵn).
  //  - RefreshPanel: ô Equipment → ShowReadOnlySkillInfo (thông tin + EquipmentSkillGuide, ẩn danh sách); ô khoá → ShowLocked
  //    (chữ SlotLocked, ẩn danh sách); còn lại → ShowSelectableSlot (thông tin skill của ô, hoặc chữ SlotEmpty; danh sách hiện).
  //  - OnSkillSelectInfoSlotClick: ô khác đang giữ skill cùng gốc thì bị tháo (−1, toast SkillUnequippedFormat), rồi đặt skill vào ô
  //    đang chọn. Không đổi chỗ hai ô.
  //  - CloseWithSave (Esc/X/nền): gửi ReqChangeCharacterSkills → GamePlayer.set_Character ngay (nhân vật ở sảnh đổi skill liền).
  function equipSkill(charId) { return VD.app.equipSkillId ? VD.app.equipSkillId(charId) : 0; }
  function skillCond(sk) {
    const b = [];
    if (sk.StressCost > 0) b.push(`<span class="bd st"><img src="art/ui/icon_common/SkillInfoStress.webp" alt="">${fmt(TX('SkillStressCostFormat') || '{0}', sk.StressCost)}</span>`);
    if (sk.HpCost > 0) b.push(`<span class="bd hp"><img src="art/ui/icon_common/SkillInfoHp.webp" alt="">${fmt(TX('SkillHpCostFormat') || '{0}', sk.HpCost)}</span>`);
    if (sk.CoolTime > 0) b.push(`<span class="bd cd"><img src="art/ui/icon_common/SkillInfoCooltime.webp" alt="">${(+sk.CoolTime).toFixed(1)}</span>`);
    return b.length ? `<div class="cond">${b.join('')}</div>` : '';
  }
  // SkillSelectInfoSlot / SkillInfoDisplaySlot: icon 90, tên 22, ô điều kiện (căng thẳng / máu / hồi chiêu) dưới icon, mô tả 16.
  function infoSlot(sid, cls, tag) {
    const sk = VD.combatDB().skill(sid) || {};
    return `<div class="sk-info ${cls || ''}" data-id="${sid}"><div class="l"><img class="ic" src="${skillIcon(sid)}" onerror="this.style.visibility='hidden'" alt="">${skillCond(sk)}</div>
      <div class="r"><div class="tt">${U().esc(skillName(sid))}</div><div class="ds">${U().rich(TX('TSkill_Desc_' + sid))}</div></div>${tag || ''}</div>`;
  }
  function buildSkill(body, api) {
    const $ = U().$, p = P().get(), id = p.character, row = charRow(id);
    const n = VD.app.skillSlotCount(), eqSk = equipSkill(id);
    if (!api.st) {
      const lo = P().loadout(id);
      // Ô khoá không tính là "đã áp dụng" (IsSlotLocked): giữ riêng giá trị đang lưu, hiện như ô trống.
      const all = VD.app.SLOT_KEYS.map(k => (lo[k] != null && lo[k] >= 0 && row.ActiveSkillIds[lo[k]]) || -1);
      api.st = { target: 0, ids: all.map((x, i) => i < n ? x : -1), hidden: all.map((x, i) => i < n ? -1 : x) };
    }
    const st = api.st;
    const slotIds = st.ids.concat(eqSk > 0 ? [eqSk] : []);
    const tgt = st.target, tgtLocked = tgt < 4 && tgt >= n, tgtEquip = tgt === EQUIP_SLOT, tgtId = slotIds[tgt] > 0 ? slotIds[tgt] : 0;
    const root = $('div', 'vd-sks', body);
    // ---- Skill*: tiêu đề + 5 ô + mặt nhân vật
    const box = $('div', 'sk-box', root);
    box.innerHTML = `<div class="hd"><b>${U().esc(fmt(TX('SkillOwnerFormat') || '{0}', TX('TCharacter_Name_' + id)))}</b><span>${U().esc(TX('USkillSelectPopup_SkillTitle_SelectSlotGuide'))}</span></div>
      <div class="face"><img src="${faceIcon(id)}" alt=""></div><div class="slots"></div>`;
    const sl = box.querySelector('.slots');
    slotIds.forEach((sid, i) => {
      const lock = i < 4 && i >= n;
      const d = $('div', 'sl' + (i === tgt ? ' sel' : '') + (lock ? ' lock' : '') + (sid > 0 ? '' : ' empty') + (i === EQUIP_SLOT ? ' eq' : ''), sl);
      d.innerHTML = `<i class="kp">${keyImg(SLOT_KB[i])}</i>` + (sid > 0 && !lock ? `<img class="ic" src="${skillIcon(sid)}" onerror="this.style.visibility='hidden'" alt="">` : '') +
        (lock ? '<i class="lk"></i>' : '') + '<i class="ar"><b></b><b></b><b></b><b></b></i>';
      d.dataset.slot = i;
      d.title = lock ? TX('USkillSelectPopup_SlotLocked_LockedSelectSkillText') : sid > 0 ? skillName(sid) : TX('USkillSelectPopup_SlotEmpty_EmptySelectSkillText');
      d.onclick = () => { st.target = i; api.refresh(); };
    });
    // ---- Display*: thông tin skill của ô đang chọn / chữ ô trống / ô khoá
    const disp = $('div', 'sk-disp', root);
    if (tgtLocked) disp.innerHTML = `<div class="msg">${U().esc(TX('USkillSelectPopup_SlotLocked_LockedSelectSkillText'))}</div>`;
    else if (tgtId) disp.innerHTML = infoSlot(tgtId, 'disp') + '<i class="arrow"></i>';
    else disp.innerHTML = `<div class="msg">${U().esc(TX(tgtEquip ? 'USkillSelectPopup_SlotEmptyEquipment_LockedSelectSkillText' : 'USkillSelectPopup_SlotEmpty_EmptySelectSkillText'))}</div>`;
    // ---- SkillSelect*: danh sách skill chọn được (ẩn khi ô khoá), hoặc EquipmentSkillGuide
    const sel = $('div', 'sk-sel', root);
    if (tgtEquip) { sel.innerHTML = `<div class="eqguide">${U().esc(TX('EquipmentSkillCannotBeReplaced'))}</div>`; return; }
    if (tgtLocked) return;
    sel.innerHTML = `<div class="hd"><b>${U().esc(TX('USkillSelectPopup_SlotTitle_ScrollerGuideText'))}</b></div><div class="list"></div>`;
    const L = sel.querySelector('.list');
    for (const sid of selectable(id)) {
      const eqIdx = st.ids.indexOf(sid);
      const tag = eqIdx < 0 ? '' : eqIdx === tgt ? `<span class="tag cur">${U().esc(TX('USkillSelectInfoSlot_ActiveSlot_Text'))}</span>` : `<span class="tag oth">${U().esc(TX('USkillSelectInfoSlot_ActiveOtherSlot_Text'))}</span>`;
      L.insertAdjacentHTML('beforeend', infoSlot(sid, eqIdx === tgt ? 'cur' : '', tag));
      L.lastElementChild.onclick = () => pickSkill(api, sid);
    }
    L.scrollTop = st.scroll || 0;
    L.addEventListener('scroll', () => { st.scroll = L.scrollTop; });
  }
  function pickSkill(api, sid) {
    const st = api.st;
    if (st.target < 0 || st.target >= 4) return;
    st.ids.forEach((x, k) => {
      if (k === st.target || x !== sid) return;
      st.ids[k] = -1;
      U().toast(fmt(TX('SkillUnequippedFormat') || '{0}', skillName(sid)));
    });
    st.ids[st.target] = sid;
    api.refresh();
  }
  function saveSkills(api) {
    const st = api && api.st;
    if (!st) return;
    const id = P().get().character, row = charRow(id), lo = P().loadout(id);
    VD.app.SLOT_KEYS.forEach((k, i) => {
      let sid = st.ids[i];
      if (!(sid > 0) && st.hidden[i] > 0 && st.ids.indexOf(st.hidden[i]) < 0) sid = st.hidden[i];
      lo[k] = sid > 0 ? row.ActiveSkillIds.indexOf(sid) : -1;
    });
    P().save();
    VD.app.refreshLoungePlayer();
  }
  function openSkill(onClose) {
    let api = null;
    api = VD.ui.open(Object.assign({}, VD.ui.panels.charSkill, { onClose: () => { saveSkills(api); if (onClose) onClose(); } }));
    api.foot(`<span class="kg">${keyImg('Escape_Key')}${keyImg('X_Key')}${U().esc(TX('Close') || 'Đóng')}</span>` +
      `<span class="kg">${keyImg('Mouse_Left_Key')}${U().esc(TX('USkillSelectPopup_LMB_Text'))}</span>`);
    if (VD.audio && VD.audio.sfx && VD.ASSETS.sfx && VD.ASSETS.sfx.TalentOpen) VD.audio.sfx('TalentOpen');
    return api;
  }

  VD.ui.panels.charSelect = { id: 'charSelect', title: TX('ENpcFunctionType_CharacterSelect') || 'Đổi Nhân Vật', cls: 'p-char', build: buildSelect };
  VD.ui.panels.charSkill = { id: 'charSkill', title: TX('USkillSelectPopup_Title_Text') || 'Chọn Kỹ Năng', cls: 'p-skill', build: buildSkill };
  VD.npc.register('CharacterSelect', { open: () => openSelect() });
  VD.npc.register('CharacterSkill', { open: () => openSkill() });
  VD.uiChar = { summary, openSelect, openSkill, selectChar, unlocked, slotsOf, selectable };
})(window.VD = window.VD || {});
