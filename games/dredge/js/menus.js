/*
 * W7 menus (WORLD-GAPS.md §6): ô lưu, cài đặt, credits cuộn chữ.
 *
 * Nguồn: SaveManager.cs / SaveSlotWindow.cs / SaveSlotUI.cs (3 ô; ô có sổ = "Tải" + "Xoá" có hỏi lại, ô trống = "Mới"),
 *        SettingsSaveData.cs (+ SettingsSaveDataTemplate.asset: mặc định trong data/credits.js, sinh bởi tools/credits.py),
 *        CreditsController.cs + PlayCredits.anim + prefab Credits (cùng nguồn).
 *
 * Cài đặt lưu ở khoá riêng 'dredge.settings.v1' (SettingsSaveData tách khỏi sổ chơi ở bản gốc, nên đổi ô lưu không đổi cài đặt).
 * Trường nào có nơi dùng thật trên web mới hiện ra: âm lượng (5), tốc độ chữ, chế độ chơi, camera (độ nhạy + đảo trục), đơn vị, kiểu đồng hồ.
 *
 *   DRMenus.settings / get(k) / set(k, v) / reset()       trường theo tên SettingsSaveData (cameraSensitivityX, textSpeed, gameMode...)
 *   DRMenus.gameMode()          'NORMAL' | 'PASSIVE' | 'NIGHTMARE' (SettingsSaveData.CurrentGameMode); quái / sự kiện đọc ở đây
 *   DRMenus.typewriterSpeed()   typewriterSpeeds[textSpeed] = 0,5 / 1 / 2 (DredgeDialogueView.cs:142)
 *   DRMenus.fmtClock(hh, mm)    TimeController.GetTimeFormatted: clockStyle 0 = 12 giờ AM/PM, 1 = 24 giờ
 *   DRMenus.sizeImperial(cm), depthFt(m, sep)   null khi units = 0 (mét); ItemManager.GetFormattedFishSize/DepthString
 *   DRMenus.openSettings() / closeSettings()
 *   DRMenus.slots.open(kind) / info(n) / pick(n) / remove(n)   kind 'continue' | 'new'
 *   DRMenus.credits.play({ mode: 'menu' | 'game', onEnd }) / stop() / playing / timeScale (kiểm thử)
 *
 * Móc vào chỗ khác (không sửa index.html / main.js): bắt click ở pha capture của #dr-title để thay Tiếp tục / Ván mới / Cài đặt / Giới thiệu,
 * thêm nút "Cài đặt" vào #dr-pause; bọc DRCamera.look / stick (độ nhạy, đảo trục); DREvents.setGameMode; DRAudio.setVolume.
 */
(function (root) {
  'use strict';
  const D = root.DR, doc = document, $ = id => doc.getElementById(id);
  const DATA = root.DR_CREDITS || {};
  const SET = DATA.settings || { defaults: {}, typewriterSpeeds: [0.5, 1, 2], gameModes: ['NORMAL', 'PASSIVE', 'NIGHTMARE'] };
  const CR = DATA.credits || { short: [], long: [], speedPxPerSecond: 100, ref: [1920, 1080], timeline: {}, scrimAlpha: { menu: 0.8, game: 0.5 } };
  const KEY = 'dredge.settings.v1', SLOTS = 3;
  const MODES = SET.gameModes || ['NORMAL', 'PASSIVE', 'NIGHTMARE'];

  const el = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ cài đặt
  const settings = Object.assign({}, SET.defaults, { lastSaveSlot: 0, gameMode: 0 });
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') for (const k of Object.keys(settings)) if (typeof raw[k] === typeof settings[k]) settings[k] = raw[k];
  } catch (e) { /* riêng tư / hỏng: dùng mặc định */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* riêng tư */ } };

  function apply(k) {
    const all = k == null, A = root.DRAudio;
    if (A && A.setVolume) {
      if (all || k === 'masterVolume') A.setVolume('master', settings.masterVolume);
      if (all || k === 'musicVolume') A.setVolume('music', settings.musicVolume);
      if (all || k === 'sfxVolume') A.setVolume('sfx', settings.sfxVolume);
      if (all || k === 'uiVolume') A.setVolume('ui', settings.uiVolume);
      if (all || k === 'voiceVolume') A.setVolume('voice', settings.voiceVolume);
    }
    if ((all || k === 'gameMode') && root.DREvents && DREvents.setGameMode) DREvents.setGameMode(gameMode());
    if (D && D.emit) D.emit('settings', k);
  }
  const gameMode = () => MODES[clamp(settings.gameMode | 0, 0, MODES.length - 1)];
  function set(k, v) {
    if (!(k in settings)) return false;
    settings[k] = typeof settings[k] === 'number' ? +v : v;
    persist(); apply(k);
    return true;
  }
  function reset() {
    const slot = settings.lastSaveSlot;
    Object.assign(settings, SET.defaults, { gameMode: 0, lastSaveSlot: slot });
    persist(); apply();
  }
  const typewriterSpeed = () => (SET.typewriterSpeeds || [0.5, 1, 2])[clamp(settings.textSpeed | 0, 0, 2)] || 1;

  // TimeController.GetTimeFormatted (:259-292): clockStyle 0 = "h:mm AM/PM", 1 = "HH:mm"
  function fmtClock(hh, mm) {
    const p2 = n => (n < 10 ? '0' : '') + n;
    if (settings.clockStyle === 0) { const ap = hh < 12 ? ' AM' : ' PM'; let h = hh % 12; if (h === 0) h = 12; return h + ':' + p2(mm) + ap; }
    return p2(hh) + ':' + p2(mm);
  }
  // ItemManager.GetFormattedFishSizeString (:485-494) và GetFormattedDepthString: units 0 = mét, 1 = feet / inch
  const imperial = () => settings.units === 1;
  function sizeImperial(cm) {
    if (!imperial()) return null;
    const inch = cm / 2.54, whole = Math.floor(inch), ft = (whole - whole % 12) / 12, rest = whole % 12;
    return ft > 0 ? ft + "' " + rest + '"' : (Math.round(inch * 10) / 10) + '"';
  }
  const depthFt = (m, sep) => (imperial() ? Math.floor(m * 3.281) + (sep == null ? '' : sep) + 'ft' : null);

  // ------------------------------------------------------------------ camera (độ nhạy + đảo trục)
  // Mặc định bản gốc cameraSensitivity 0,5 và cameraInvertY 1 = hướng đang chơi trên web: hệ số 1 và không đảo.
  function wrapCamera() {
    const C = root.DRCamera;
    if (!C || C._w7) return;
    C._w7 = true;
    const look = C.look, stick = C.stick, def = SET.defaults || {};
    const fx = () => (settings.cameraSensitivityX / 0.5) * ((settings.cameraInvertX | 0) !== (def.cameraInvertX | 0) ? -1 : 1);
    const fy = () => (settings.cameraSensitivityY / 0.5) * ((settings.cameraInvertY | 0) !== (def.cameraInvertY | 0) ? -1 : 1);
    C.look = (px, py) => look(px * fx(), py * fy());
    C.stick = (x, y) => stick(x * fx(), y * fy());
    C.sensFactors = () => ({ x: fx(), y: fy() });
  }

  // ------------------------------------------------------------------ cửa sổ dùng chung
  function modal(cls, title, onClose) {
    const scrim = el('div', 'dm-scrim', doc.body); scrim.hidden = true;
    const win = el('div', 'dm-win dr-ui ' + (cls || ''), scrim);
    win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', title);
    const head = el('div', 'dm-head', win);
    el('h2', '', head, title);
    const x = el('button', 'dm-x', head, '×'); x.title = 'Đóng (Esc)'; x.setAttribute('aria-label', 'Đóng');
    x.onclick = () => onClose();
    scrim.addEventListener('mousedown', e => { if (e.target === scrim) onClose(); });
    return { scrim, win, head };
  }
  let openCount = 0;
  const showModal = (m, on) => { if (m.scrim.hidden === !on) return; m.scrim.hidden = !on; openCount += on ? 1 : -1; };

  // ------------------------------------------------------------------ cửa sổ Cài đặt
  const GAME_MODE_NOTE = [
    'Như bản gốc: sự kiện thế giới bốc thăm mỗi 0,1 ngày.',
    'Không có mối đe doạ chủ động: sự kiện không được phép ở chế độ thụ động bị bỏ qua và bị xua đi.',
    'Sự kiện bốc thăm dày gấp đôi (mỗi 0,05 ngày), thời gian chờ lặp ngắn hơn, quái gây thêm sát thương.'
  ];
  const TABS = [
    { id: 'audio', name: 'Âm thanh', rows: [
      { k: 'masterVolume', t: 'Âm lượng chung', type: 'slider' }, { k: 'musicVolume', t: 'Nhạc', type: 'slider' },
      { k: 'sfxVolume', t: 'Hiệu ứng', type: 'slider' }, { k: 'uiVolume', t: 'Giao diện', type: 'slider' },
      { k: 'voiceVolume', t: 'Tiếng nhân vật', type: 'slider' }, { k: '_mute', t: 'Tắt toàn bộ tiếng', type: 'mute' }] },
    { id: 'game', name: 'Trò chơi', rows: [
      { k: 'gameMode', t: 'Chế độ chơi', type: 'seg', opts: ['Bình thường', 'Thụ động', 'Ác mộng'], note: () => GAME_MODE_NOTE[settings.gameMode | 0] },
      { k: 'textSpeed', t: 'Tốc độ hiện chữ', type: 'seg', opts: ['Chậm', 'Vừa', 'Nhanh'] }] },
    { id: 'camera', name: 'Camera', rows: [
      { k: 'cameraSensitivityX', t: 'Độ nhạy ngang', type: 'slider', min: 0.05 }, { k: 'cameraSensitivityY', t: 'Độ nhạy dọc', type: 'slider', min: 0.05 },
      { k: 'cameraInvertX', t: 'Đảo trục ngang', type: 'seg', opts: ['Tắt', 'Bật'] }, { k: 'cameraInvertY', t: 'Đảo trục dọc', type: 'seg', opts: ['Tắt', 'Bật'] }] },
    { id: 'display', name: 'Hiển thị', rows: [
      { k: 'units', t: 'Đơn vị đo', type: 'seg', opts: ['Mét', 'Feet'] }, { k: 'clockStyle', t: 'Kiểu đồng hồ', type: 'seg', opts: ['12 giờ', '24 giờ'] }] }
  ];
  let SM = null, smTab = 'audio', smBody = null, smReturn = null;

  function buildSettings() {
    if (SM) return;
    SM = modal('settings', 'Cài đặt', closeSettings);
    const tabs = el('div', 'dm-tabs', SM.win); tabs.setAttribute('role', 'tablist');
    for (const t of TABS) {
      const b = el('button', 'dm-tab', tabs, t.name); b.dataset.tab = t.id; b.setAttribute('role', 'tab');
      b.onclick = () => { smTab = t.id; renderSettings(); };
    }
    smBody = el('div', 'dm-body', SM.win);
    const foot = el('div', 'dm-foot', SM.win);
    const rs = el('button', 'dm-btn', foot, 'Khôi phục mặc định'); rs.dataset.act = 'reset'; rs.onclick = () => { reset(); renderSettings(); };
    const back = el('button', 'dm-btn', foot, 'Quay lại'); back.dataset.act = 'back'; back.onclick = closeSettings;
  }
  function renderSettings() {
    for (const b of SM.win.querySelectorAll('.dm-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === smTab));
    smBody.textContent = '';
    for (const r of TABS.find(t => t.id === smTab).rows) {
      const row = el('div', 'dm-row', smBody); row.dataset.key = r.k;
      const lb = el('label', '', row, r.t);
      const ctl = el('div', 'ctl', row);
      if (r.type === 'slider') {
        const inp = el('input', '', ctl); inp.type = 'range'; inp.min = r.min || 0; inp.max = 1; inp.step = 0.01; inp.value = settings[r.k]; inp.id = 'dm-' + r.k; lb.htmlFor = inp.id;
        const val = el('span', 'val', ctl, Math.round(settings[r.k] * 100) + '%');
        inp.oninput = () => { set(r.k, +inp.value); val.textContent = Math.round(settings[r.k] * 100) + '%'; };
      } else if (r.type === 'seg') {
        const seg = el('div', 'dm-seg', ctl);
        let note = null;
        if (r.note) { row.classList.add('has-note'); note = el('div', 'note', row, r.note()); }
        r.opts.forEach((name, i) => {
          const b = el('button', '', seg, name); b.dataset.v = i; b.setAttribute('aria-pressed', String((settings[r.k] | 0) === i));
          b.onclick = () => {
            set(r.k, i);
            for (const o of seg.children) o.setAttribute('aria-pressed', String(+o.dataset.v === i));
            if (note) note.textContent = r.note();
          };
        });
      } else if (r.type === 'mute') {
        const seg = el('div', 'dm-seg', ctl), A = root.DRAudio;
        const mk = (name, v) => {
          const b = el('button', '', seg, name); b.dataset.v = v ? 1 : 0;
          b.onclick = () => { if (A && A.isMuted() !== v && $('btn-mute')) $('btn-mute').click(); sync(); };
          return b;
        };
        const bs = [mk('Bật tiếng', false), mk('Tắt tiếng', true)];
        const sync = () => { const m = !!(A && A.isMuted()); bs.forEach((b, i) => b.setAttribute('aria-pressed', String(m === (i === 1)))); };
        sync();
      }
    }
  }
  function openSettings() {
    buildSettings();
    smReturn = doc.activeElement;
    renderSettings(); showModal(SM, true);
    const f = SM.win.querySelector('.dm-tab[aria-selected="true"]'); if (f) f.focus();
  }
  function closeSettings() {
    if (!SM || SM.scrim.hidden) return;
    showModal(SM, false);
    if (smReturn && smReturn.focus && smReturn.isConnected) smReturn.focus();
  }

  // ------------------------------------------------------------------ ô lưu
  function readSlot(n) {
    let raw = null;
    try { raw = localStorage.getItem(D.saveKey(n)); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return { corrupt: true }; }
  }
  function slotInfo(n) {
    const s = readSlot(n);
    if (!s) return { n, has: false, text: 'Ô lưu trống' };
    if (s.corrupt) return { n, has: true, corrupt: true, text: 'Tệp lưu hỏng' };
    const dk = root.DRDocks && s.dock && DRDocks.byId[s.dock];
    const name = dk ? dk.name : (s.dock || 'Ngoài khơi');
    const day = Math.ceil(s.time || 0), relics = (s.vars && s.vars['relics-handed-in']) | 0;   // SaveSlotUI.SetupUI: Ceiling(time), relics-handed-in
    return { n, has: true, dock: s.dock || null, day, funds: s.funds || 0, relics, text: name + '\nNgày ' + day + ' - Di vật: ' + relics };   // save-slot.info
  }
  const anySave = () => { for (let i = 0; i < SLOTS; i++) if (D.hasSave(i)) return true; return false; };
  const savedSlots = () => { const a = []; for (let i = 0; i < SLOTS; i++) if (D.hasSave(i)) a.push(i); return a; };

  let SL = null, slKind = 'continue', slConfirm = null;
  function buildSlots() {
    if (SL) return;
    SL = modal('slots', 'Chọn ô lưu', closeSlots);
    SL.row = el('div', 'dm-slots', SL.win);
    SL.confirm = el('div', 'dm-confirm', SL.win); SL.confirm.hidden = true;
    const foot = el('div', 'dm-foot', SL.win);
    const back = el('button', 'dm-btn', foot, 'Quay lại'); back.dataset.act = 'back'; back.onclick = closeSlots;
  }
  function renderSlots() {
    SL.row.textContent = '';
    for (let n = 0; n < SLOTS; n++) {
      const inf = slotInfo(n);
      const card = el('div', 'dm-slot' + (inf.has ? '' : ' empty') + (n === D.slot || n === settings.lastSaveSlot ? ' on' : ''), SL.row); card.dataset.slot = n;
      el('h3', '', card, 'Ô lưu ' + (n + 1));
      el('div', 'info', card, inf.text);
      const acts = el('div', 'acts', card);
      const go = el('button', 'dm-btn', acts, inf.has ? 'Tải' : 'Mới'); go.dataset.act = inf.has ? 'load' : 'new';
      go.onclick = () => pickSlot(n);
      if (inf.has) { const del = el('button', 'dm-btn danger', acts, 'Xoá'); del.dataset.act = 'delete'; del.onclick = () => askDelete(n); }
    }
  }
  function askDelete(n) {
    slConfirm = n;
    SL.confirm.textContent = '';
    el('div', '', SL.confirm, 'Bạn chắc chứ?\n\nTệp lưu ở ô ' + (n + 1) + ' sẽ bị xoá. Không thể hoàn tác.');   // popup.confirm-delete-save
    const acts = el('div', 'acts', SL.confirm);
    const yes = el('button', 'dm-btn danger', acts, 'Xoá'); yes.dataset.act = 'confirm-delete'; yes.onclick = () => { removeSlot(n); };
    const no = el('button', 'dm-btn', acts, 'Giữ lại'); no.dataset.act = 'cancel-delete'; no.onclick = () => { slConfirm = null; SL.confirm.hidden = true; };
    SL.confirm.hidden = false; yes.focus();
  }
  function removeSlot(n) {
    D.wipe(n);
    if (settings.lastSaveSlot === n) { settings.lastSaveSlot = Math.max(0, savedSlots()[0] | 0); persist(); }
    slConfirm = null; SL.confirm.hidden = true;
    if (SL && !SL.scrim.hidden) renderSlots();
    refreshTitle();
  }
  function openSlots(kind) {
    buildSlots();
    slKind = kind || 'continue'; slConfirm = null; SL.confirm.hidden = true;
    renderSlots(); showModal(SL, true);
    const f = SL.row.querySelector('.dm-btn'); if (f) f.focus();
  }
  function closeSlots() { if (SL && !SL.scrim.hidden) showModal(SL, false); }
  // Gọi đúng hàm Tiếp tục / Ván mới của main.js sau khi đặt ô: start(true) đọc DR.slot, start(false) xoá ô rồi dựng ván mới.
  function pickSlot(n) {
    const has = D.hasSave(n);
    D.slot = n; settings.lastSaveSlot = n; persist();
    closeSlots();
    const btn = $(has ? 'btn-continue' : 'btn-new');
    if (btn && btn.onclick) btn.onclick.call(btn);
  }
  function refreshTitle() {
    const c = $('btn-continue'), t = $('dr-title');
    if (c && t && !t.hidden) c.hidden = !anySave();
  }

  // Tiếp tục: một ô có sổ thì vào thẳng (như trước); nhiều ô thì hỏi. Ván mới: chưa có sổ nào thì vào thẳng ô 1, có rồi thì hỏi ô nào.
  function onContinue() {
    const s = savedSlots();
    if (!s.length) return false;
    if (s.length === 1) { D.slot = s[0]; settings.lastSaveSlot = s[0]; persist(); return false; }
    D.slot = D.hasSave(settings.lastSaveSlot) ? settings.lastSaveSlot : s[0];
    openSlots('continue'); return true;
  }
  function onNew() {
    if (!anySave()) { D.slot = 0; settings.lastSaveSlot = 0; persist(); return false; }
    openSlots('new'); return true;
  }

  // ------------------------------------------------------------------ Credits
  let CRD = null, cr = null;
  function el2(parent, cls, text) { return el('div', cls, parent, text); }
  function buildCredits() {
    if (CRD) return CRD;
    const r = el('div', '', doc.body); r.id = 'dr-credits'; r.hidden = true; r.className = 'dr-ui';
    const scrim = el2(r, 'scrim');
    const pages = CR.short.map(p => {
      const pg = el2(r, 'pg'); pg.dataset.page = p.id;
      el2(pg, 'logo', p.title);
      const names = el2(pg, 'names');
      for (const row of p.rows) { const w = el2(names, 'who'); el('b', '', w, row.name); el('i', '', w, row.role); }
      return pg;
    });
    const roll = el2(r, 'roll'), wrap = el2(roll, 'wrap');
    el2(wrap, 'gap');
    for (const b of CR.long) {
      if (b.gap) el2(wrap, 'gap');
      if (b.k === 'grid') {
        el2(wrap, 'dept', b.t);
        const g = el2(wrap, 'grid'); g.style.gridTemplateColumns = 'repeat(' + b.cols + ', 1fr)';
        g.style.setProperty('--rh', b.h + 'px');
        for (const n of b.names) el('span', '', g, n).style.height = 'calc(' + (b.h * 0.7) + 'px * var(--s))';
      } else el2(wrap, { dept: 'dept', team: 'team', role: 'rl', name: 'nm' }[b.k] || 'nm', b.t);
    }
    el2(wrap, 'end', 'DREDGE · Biển Mù');
    const skip = el2(r, 'skip'); el('span', '', skip, 'Giữ Esc để bỏ qua');
    const sb = el('button', '', skip, 'Bỏ qua'); el('i', '', sb);
    CRD = { r, scrim, pages, roll, wrap, skip, sb, bar: sb.querySelector('i') };
    // giữ nút "Bỏ qua" (hoặc Esc) 1 s = CreditsController.returnAction (DredgePlayerActionHold prompt.skip, 1 s)
    const down = () => { if (cr) cr.hold = 0.0001; }, up = () => { if (cr) cr.hold = 0; };
    sb.addEventListener('pointerdown', down); sb.addEventListener('pointerup', up); sb.addEventListener('pointerleave', up); sb.addEventListener('pointercancel', up);
    return CRD;
  }
  // đường cong alpha của PlayCredits.anim (khoá tuyến tính giữa các mốc [giây, giá trị])
  function curve(keys, t) {
    if (!keys || !keys.length) return 1;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    return keys[keys.length - 1][1];
  }
  function playCredits(opts) {
    opts = opts || {};
    if (cr) return false;
    const C = buildCredits(), mode = opts.mode === 'game' ? 'game' : 'menu';
    C.r.hidden = false;
    const H = root.innerHeight, s = H / CR.ref[1];
    C.r.style.setProperty('--s', s.toFixed(4));
    C.scrim.style.opacity = '0';
    for (const p of C.pages) p.style.opacity = '0';
    C.roll.style.opacity = '0'; C.skip.classList.remove('on'); C.bar.style.width = '0';
    const pageH = C.wrap.getBoundingClientRect().height;                     // px thật của trang dài
    const total = pageH + H;                                                  // longCreditsPage.rect.height + Screen.height
    const sec = (total / s) / CR.speedPxPerSecond;                            // tốc độ tính theo đơn vị canvas: speedPxPerSecond = 100
    const evs = CR.events || [], tEnd = (evs.find(e => e[1] === 'OnMainCreditsComplete') || [11.5])[0];
    const tSkip = mode === 'menu' ? 0 : (evs.find(e => e[1] === 'CanShowSkipAction') || [7])[0];   // menu: hiện nút ngay từ Start (:42-48)
    cr = { t: 0, mode, tEnd, scroll: 0, sec, total, tSkip, hold: 0, onEnd: opts.onEnd || null, last: 0, raf: 0, ended: false, H, s };
    api.credits.state = cr;
    const tick = now => {
      if (!cr) return;
      const dt = Math.min(0.25, (now - (cr.last || now)) / 1000) * (api.credits.timeScale || 1); cr.last = now;
      cr.t += dt;
      const sc = (mode === 'game' ? CR.scrimAlpha.game : CR.scrimAlpha.menu) * curve(CR.timeline.Scrim, cr.t);    // CreditsController.SetCreditsMode: 0,8 / 0,5
      C.scrim.style.opacity = sc.toFixed(3);
      C.pages[0].style.opacity = curve(CR.timeline['TextContainer/Page_BSG'], cr.t).toFixed(3);
      if (C.pages[1]) C.pages[1].style.opacity = curve(CR.timeline['TextContainer/Page_Music'], cr.t).toFixed(3);
      const nm = C.pages[0].querySelector('.names'); if (nm) nm.style.opacity = curve(CR.timeline['TextContainer/Page_BSG/Names'], cr.t).toFixed(3);
      if (cr.t >= cr.tSkip) C.skip.classList.add('on');
      if (cr.t >= cr.tEnd) {
        const f = clamp((cr.t - cr.tEnd) / (CR.longFadeSec || 0.35), 0, 1);       // OnMainCreditsComplete: DOFade 0,35 s rồi cuộn tuyến tính
        C.roll.style.opacity = f.toFixed(3);
        if (f >= 1) cr.scroll += dt;
        const y = H - Math.min(1, cr.scroll / cr.sec) * cr.total;
        C.roll.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
        if (cr.scroll >= cr.sec) return endCredits();
      } else C.roll.style.transform = 'translate3d(0,' + H + 'px,0)';
      if (cr.hold > 0 && cr.t >= cr.tSkip) {
        cr.hold += dt / (api.credits.timeScale || 1);
        C.bar.style.width = clamp(cr.hold / (CR.skipHoldSec || 1), 0, 1) * 100 + '%';
        if (cr.hold >= (CR.skipHoldSec || 1)) return endCredits();
      } else C.bar.style.width = '0';
      cr.raf = root.requestAnimationFrame(tick);
    };
    cr.raf = root.requestAnimationFrame(tick);
    return true;
  }
  function endCredits() {
    if (!cr) return;
    const c = cr; cr = null; api.credits.state = null;
    root.cancelAnimationFrame(c.raf);
    CRD.r.hidden = true;
    // CreditsController.OnReturnPressComplete: menu = chỉ huỷ cảnh credits; trong ván = LoadTitleFromGame
    if (c.mode === 'game' && D.mode !== 'title') D.setMode('title');
    if (c.onEnd) c.onEnd(c.mode);
    if (D.emit) D.emit('creditsEnded', c.mode);
  }
  const creditsPlaying = () => !!cr;

  // ------------------------------------------------------------------ móc vào giao diện sẵn có
  function bindUi() {
    const title = $('dr-title');
    if (title) title.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      let eat = false;
      if (b.id === 'btn-continue') eat = onContinue();
      else if (b.id === 'btn-new') eat = onNew();
      else if (b.id === 'btn-settings') { openSettings(); eat = true; }
      else if (b.id === 'btn-credits') { playCredits({ mode: 'menu' }); eat = true; }
      if (eat) e.stopImmediatePropagation();
    }, true);
    const pause = $('dr-pause');
    if (pause && !$('btn-pause-settings')) {
      const b = el('button', 'eng-btn', null, 'Cài đặt'); b.id = 'btn-pause-settings';
      b.onclick = openSettings;
      const q = $('btn-quit'); if (q) pause.insertBefore(b, q); else pause.appendChild(b);
    }
    // sổ tiêu đề: nút Tiếp tục hiện khi có sổ ở BẤT KỲ ô nào (main.js chỉ hỏi ô hiện tại)
    if (title) new MutationObserver(refreshTitle).observe(title, { attributes: true, attributeFilter: ['hidden'] });
    const c = $('btn-continue');
    if (c) new MutationObserver(() => { if (c.hidden && !title.hidden && anySave()) c.hidden = false; }).observe(c, { attributes: true, attributeFilter: ['hidden'] });
    // Esc: đóng cửa sổ trên cùng, không cho input.js coi là "tạm dừng"; credits: giữ Esc 1 s để bỏ qua
    root.addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (SM && !SM.scrim.hidden) { closeSettings(); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (SL && !SL.scrim.hidden) { if (slConfirm != null) { slConfirm = null; SL.confirm.hidden = true; } else closeSlots(); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (cr) { if (!e.repeat && cr.hold === 0) cr.hold = 0.0001; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    root.addEventListener('keyup', e => { if (e.code === 'Escape' && cr) cr.hold = 0; }, true);
  }

  const api = root.DRMenus = {
    settings, get: k => settings[k], set, reset, apply, gameMode, typewriterSpeed, fmtClock, sizeImperial, depthFt,
    openSettings, closeSettings, get settingsOpen() { return !!(SM && !SM.scrim.hidden); },
    slots: { open: openSlots, close: closeSlots, info: slotInfo, pick: pickSlot, remove: removeSlot, savedSlots, get isOpen() { return !!(SL && !SL.scrim.hidden); } },
    credits: { play: playCredits, stop: endCredits, get playing() { return creditsPlaying(); }, timeScale: 1, state: null }
  };

  if (D) {
    D.slot = D.hasSave(settings.lastSaveSlot) ? settings.lastSaveSlot : 0;   // ?fresh=1 của main.js xoá đúng ô đang dùng
    D.on('mode', m => { if (m === 'title') { endCredits(); refreshTitle(); } });
  }
  wrapCamera();
  bindUi();
  apply();
})(window);
