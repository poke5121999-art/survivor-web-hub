// Nói chuyện với NPC ở sảnh: danh sách mục gồm (1) hội thoại do Lua đăng ký cho NPC (LuaApi.AddDialog: Quest trước, rồi Priority),
// (2) chức năng NpcFunction.csv của NPC (bảng handler theo Type → mở bảng UI ở js/ui/*), (3) "Trò chuyện": các chủ đề NpcTalk.csv
// đủ AddConditions và chưa dính RemoveConditions → hàm TalkDialog_* trong NpcTalk/NpcTalk.lua.
// Bấm F cũng gửi ELuaEvent.NpcInteraction (giá trị NpcId) cho mọi script đang chạy (Campaign/None.lua nghe sự kiện này).
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const T = () => VD.T || {};
  const P = () => VD.profile;

  const N = { el: null, npcId: 0, handlers: Object.create(null) };

  // ---------------------------------------------------------------- bảng handler theo NpcFunction.Type
  // def: { open(npcId, fnRow) , label?(fnRow) , ready?: bool (false = chưa làm, hiện mờ) }
  N.register = function (type, def) { N.handlers[type] = def; };
  // Các Type không làm ở bản chơi đơn (ARCH.md: co-op không làm) và loại chỉ khách vãng lai dùng.
  const SKIP = /^Multiplay|^TycoonCustomer$|^Dialog$/;

  function fnLabel(f) {
    const h = N.handlers[f.Type];
    if (h && h.label) { const s = h.label(f); if (s) return s; }
    let s = TX('ENpcFunctionType_' + f.Type) || f.Type;
    if (s.indexOf('{0}') >= 0) s = s.replace('{0}', TX('EGoodsType_' + f.GoodsType) || f.GoodsType || '');
    return s;
  }

  N.functions = npcId => (T().NpcFunction || []).filter(f => f.NpcId === npcId && !SKIP.test(f.Type) && P().condsOk(f.UnlockConditions));
  N.talks = npcId => (T().NpcTalk || []).filter(t => t.NpcId === npcId && P().condsOk(t.AddConditions) && !((t.RemoveConditions || []).length && P().condsOk(t.RemoveConditions)));
  // Mục nhiệm vụ ("!"): Type "Quest", hoặc "Lounge" (AddLoungeDialog của Common.lua) có Purpose Start/Complete.
  N.isQuest = d => d.Type === 'Quest' || /^(Start|Complete)$/.test(d.Purpose || '');
  N.dialogs = npcId => (P().get().dialogs || []).filter(d => d.npc === npcId)
    .sort((a, b) => ((N.isQuest(a) ? 0 : 1) - (N.isQuest(b) ? 0 : 1)) || ((a.Priority || 1) - (b.Priority || 1)));

  function dialogLabel(d) {
    if (d.Title) { const s = VD.lua.text(d.Title).trim(); if (s && s !== 'Title') return s; }
    const m = /^LoungeQuest\/(\d+)/.exec(d.LuaKey || '');
    if (m) return TX('TLoungeQuest_Name_' + m[1]) || m[1];
    const c = /^Campaign\/(\d+)/.exec(d.LuaKey || '');
    if (c) return TX('TCampaign_Name_' + c[1]) || c[1];
    const ac = P().get().activeCampaign;
    if (/^Campaign\/None/.test(d.LuaKey || '') && ac) return TX('TCampaign_Name_' + ac.id) || '';
    return d.FunctionName;
  }

  // Tên quest nhỏ bên cạnh nhãn chung ("Bắt đầu", "Hoàn thành") của Title gốc.
  function questSub(d) {
    const m = /^LoungeQuest\/(\d+)/.exec(d.LuaKey || ''), c = /^Campaign\/(\d+)/.exec(d.LuaKey || '');
    const n = m ? TX('TLoungeQuest_Name_' + m[1]) : c ? TX('TCampaign_Name_' + c[1]) : '';
    return n && n !== dialogLabel(d) ? ' <small>' + esc(n) + '</small>' : '';
  }
  // ---------------------------------------------------------------- menu
  N.isOpen = () => !!N.el;
  N.close = function () {
    if (!N.el) return;
    N.el.remove(); N.el = null;
    removeEventListener('keydown', onKey, true);
    if (!(VD.ui && VD.ui.isOpen()) && !(VD.dialog && VD.dialog.open)) { VD.input.enabled = true; VD.input.clear(); }
  };
  function onKey(e) {
    if (!N.el) return;
    if (e.code === 'Escape' || e.code === 'KeyX') { e.preventDefault(); e.stopPropagation(); N.close(); }
    const k = /^Digit([1-9])$/.exec(e.code);
    if (k) { const b = N.el.querySelectorAll('.vd-npcmenu-choices button:not([disabled])')[+k[1] - 1]; if (b) { e.preventDefault(); b.click(); } }
  }

  N.open = function (npcId, sub) {
    N.close();
    N.npcId = npcId;
    if (!sub) VD.lounge.broadcast(VD.lua.EV.NpcInteraction, npcId);
    const npc = VD.lounge.npcs.get(npcId);
    const art = VD.NPCS && VD.NPCS[npcId];
    if (!sub && art && art.useSfx && VD.ASSETS.sfx[art.useSfx]) VD.audio.sfx(art.useSfx);
    VD.input.enabled = false; VD.input.clear();
    const el = N.el = $('div', 'vd-npcmenu', document.getElementById('ui'));
    const portrait = VD.ASSETS.portrait && (VD.ASSETS.portrait[npcId + '_Default'] || VD.ASSETS.portrait[npcId + '_' + ((npc && npc.row && npc.row.DefaultImageName) || 'Default')]);
    el.innerHTML = `
      ${portrait ? `<img class="por" src="${portrait.path || portrait}">` : ''}
      <div class="box">
        <div class="name"></div><div class="text"></div>
      </div>
      <div class="vd-npcmenu-choices"></div>
      <div class="hint"><b>Esc</b> ${TX('Close') || 'Đóng'} · <b>1–9</b> ${TX('Select') || 'Chọn'}</div>`;
    el.querySelector('.name').textContent = TX('TNpc_Name_' + npcId);
    el.querySelector('.text').innerHTML = VD.ui.rich(sub === 'talk' ? '' : TX('TNpc_DefaultDialog_' + npcId) || '');
    const box = el.querySelector('.vd-npcmenu-choices');
    const add = (label, cls, fn, disabled) => {
      const b = $('button', cls || '', box);
      b.innerHTML = label;
      if (disabled) b.disabled = true;
      b.onclick = ev => { ev.stopPropagation(); fn(); };
      return b;
    };
    if (sub === 'talk') {
      for (const t of N.talks(npcId)) add(TX(t.FunctionName + '_TITLE') || t.FunctionName, 'talk', () => { N.close(); VD.lounge.queueCall('NpcTalk/NpcTalk', t.FunctionName); });
      add('‹ ' + (TX('Close') || 'Đóng'), 'back', () => N.open(npcId, 'main'));
    } else {
      for (const d of N.dialogs(npcId)) {
        add((N.isQuest(d) ? '<i class="q">!</i>' : '') + esc(dialogLabel(d)) + questSub(d), N.isQuest(d) ? 'quest' : 'lounge', () => { N.close(); VD.lounge.queueCall(d.LuaKey, d.FunctionName); });
      }
      for (const f of N.functions(npcId)) {
        const h = N.handlers[f.Type];
        const ready = !!(h && h.open && h.ready !== false);
        add(esc(fnLabel(f)) + (ready ? '' : ' <small>(chưa có ở bản web)</small>'), 'fn', () => { N.close(); h.open(npcId, f); }, !ready);
      }
      if (N.talks(npcId).length) add(TX('ENpcFunctionType_Dialog') || 'Trò chuyện', 'talkmenu', () => N.open(npcId, 'talk'));
      add(TX('Close') || 'Đóng', 'back', () => N.close());
    }
    addEventListener('keydown', onKey, true);
    el.addEventListener('pointerdown', ev => { if (ev.target === el) N.close(); });
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  N.esc = esc;

  VD.npc = N;
})(window.VD = window.VD || {});
