// Máy trạng thái của cả trò chơi: title → (chơi mới: prologue) → lounge ⇄ dive → lounge …
//   Chơi mới  = xoá hồ sơ, nhận campaign 1100, vào sảnh; Campaign/1100 OnLounge() gốc chạy prologue rồi ForceStartStage().
//   Lặn       = VD.app.toDive({campaignId, characterId, loadout, difficulty}) → VD.dive.start → kết quả → VD.app.toLounge(result).
//   Sảnh      = VD.lounge.enter(): chạy OnLounge của campaign đang nhận + LoungeQuest đang chạy (js/lounge.js).
// LuaApi: mỗi cảnh cài bảng hàm của mình vào VD.lua.api lúc vào cảnh (dive.js ở VD.dive.start, lounge.js ở enter);
// hàm nào hai cảnh cùng cần thì lounge.js hỏi VD.app.scene. Tài liệu: docs/LOUNGE.md.
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const ui = () => document.getElementById('ui') || document.body;

  const A = { scene: 'boot', busy: false, lastResult: null, startDive: null };

  // dive.js ghi đè trường D.start bằng toạ độ điểm xuất phát sau lượt đầu (D.start = ps.pos): giữ tham chiếu hàm từ lúc nạp.
  function diveStartFn() {
    if (!A.startDive && VD.dive && typeof VD.dive.start === 'function') A.startDive = VD.dive.start;
    return A.startDive;
  }
  diveStartFn();

  function setScene(s) { A.scene = s; document.body.dataset.scene = s; }

  // ---------------------------------------------------------------- âm thanh
  A.applySound = function () {
    const on = VD.profile.get().sound !== false;
    if (VD.audio) { VD.audio.muted = !on; if (VD.audio.applyVolume) VD.audio.applyVolume(); }
  };
  A.toggleSound = function () { const d = VD.profile.get(); d.sound = d.sound === false; VD.profile.save(); A.applySound(); return d.sound; };
  const hasBgm = n => !!(n && VD.ASSETS && VD.ASSETS.bgm && VD.ASSETS.bgm[n]);
  A.bgm = function (name, fade) { if (!VD.audio) return; if (!name || name === 'NoBGM') VD.audio.stopBgm(fade); else if (hasBgm(name)) VD.audio.playBgm(name, fade); };

  // ---------------------------------------------------------------- màn tiêu đề
  // Bản gốc: scene vỏ có TitleObject (Cha_Sword anim title/idle, title/turn) + BGM "Title". Logo game không có trong bundle đã bóc;
  // chỉ có LogoNemo (icon_common). [ĐO: ASSETS.md §2.2, icon_common]
  A.title = function () {
    setScene('title');
    VD.profile.load();
    A.applySound();
    const has = !!(VD.save.load() || {}).profile;
    const el = $('div', 'vd-title', ui());
    el.innerHTML = `
      <div class="vd-title-bg"></div>
      <div class="vd-title-main">
        <div class="vd-title-name">VOID DIVER</div>
        <div class="vd-title-sub">Escape from the Abyss</div>
      </div>
      <div class="vd-title-menu">
        ${has ? `<button data-a="continue">${TX('Continue') || 'Tiếp tục'}</button>` : ''}
        <button data-a="new">${TX('NewGame') || 'Game mới'}</button>
        <button data-a="sound" class="snd"><img src="art/ui/icon_common/ImgSoundOn.webp"><span></span></button>
      </div>
      <img class="vd-title-logo" src="art/ui/icon_common/LogoNemo.webp" alt="Studio Nemo">
      <div class="vd-title-foot">Bản web dựng lại từ bản demo Steam — art, số, script gốc của Studio Nemo</div>`;
    const sndBtn = el.querySelector('[data-a=sound]');
    const paintSnd = () => {
      const on = VD.profile.get().sound !== false;
      sndBtn.querySelector('img').src = 'art/ui/icon_common/' + (on ? 'ImgSoundOn' : 'ImgSoundOff') + '.webp';
      sndBtn.querySelector('span').textContent = on ? 'Âm thanh: bật' : 'Âm thanh: tắt';
    };
    paintSnd();
    const startBgm = () => { VD.audio.unlock(); A.applySound(); A.bgm('Title', 0.8); };
    el.addEventListener('pointerdown', startBgm, { once: true });
    addEventListener('keydown', startBgm, { once: true });
    el.querySelectorAll('button').forEach(b => b.onclick = async ev => {
      ev.stopPropagation();
      startBgm();
      const a = b.dataset.a;
      if (a === 'sound') { A.toggleSound(); paintSnd(); return; }
      if (a === 'new' && has && !(await A.confirmBox(TX('NewGame') || 'Game mới', TX('ConfirmResetAndNewGame') || 'Xoá dữ liệu đã lưu?'))) return;
      el.remove();
      if (a === 'continue') A.continueGame(); else A.newGame();
    });
    document.body.dataset.ready = 'title';
  };

  A.confirmBox = function (title, body) {
    return new Promise(res => {
      const el = $('div', 'vd-confirm', ui());
      el.innerHTML = `<div class="box"><h3></h3><p></p><div class="btns"><button class="no">${TX('Cancel') || 'Huỷ'}</button><button class="yes">${TX('Confirm') || 'Xác nhận'}</button></div></div>`;
      el.querySelector('h3').textContent = title; el.querySelector('p').textContent = body;
      el.querySelector('.no').onclick = () => { el.remove(); res(false); };
      el.querySelector('.yes').onclick = () => { el.remove(); res(true); };
    });
  };

  // ---------------------------------------------------------------- chơi mới / tiếp tục
  A.newGame = async function () {
    VD.profile.reset();
    const p = VD.profile.get();
    // Campaign 1100 (Tutorial, UnlockConditions None) là nhiệm vụ đầu; OnLounge của nó là prologue gốc. [ĐO: Campaign.csv, Campaign/1100.lua]
    p.activeCampaign = { id: 1100, difficulty: 'Normal' };
    p.character = 100001;
    VD.profile.save();
    return A.enterLounge({ newGame: true });
  };
  A.continueGame = function () { return A.enterLounge({}); };

  A.enterLounge = async function (opts) {
    setScene('lounge');
    A.applySound();
    await VD.lounge.enter(opts || {});
  };

  // ---------------------------------------------------------------- lặn
  // opts: { campaignId, characterId, loadout, difficulty, seed }
  A.toDive = async function (opts) {
    if (A.busy) return null;
    A.busy = true;
    opts = opts || {};
    const P = VD.profile, p = P.get();
    const charId = +(opts.characterId || p.character || 100001);
    const diff = opts.difficulty || (p.activeCampaign && p.activeCampaign.difficulty) || p.difficulty || 'Normal';
    // Hộp thoại gốc có thể còn mở (prologue gọi ForceStartStage trước CloseDialogAsync).
    closeDialog();
    if (VD.lounge && VD.lounge.leave) VD.lounge.leave();
    setScene('dive');
    // Talent: AddSkill → passive của nhân vật; talents → TalentConditionList trong skill (stage.js đọc charExtras lúc spawn nhân vật).
    const tal = {}; for (const k of Object.keys(p.talents || {})) if (p.talents[k]) tal[k] = true;
    VD.stage.charExtras = { talents: tal, skills: P.talentSkills() };
    const eq = (p.equip && p.equip[charId]) || {};
    const loadout = Object.assign({ skills: opts.loadout && opts.loadout.skills ? opts.loadout.skills : A.skillLoadout(charId), weaponId: eq.weapon || undefined,
      equipmentIds: [].concat(eq.acc || [], eq.art || []).filter(Boolean) }, opts.loadout || {});
    // Túi: hàng trong "pack" rời sảnh cùng nhân vật (thoát: dive.js cất tất cả vào kho; chết: mất trừ khe an toàn).
    const goods = (p.pack || []).map(g => Object.assign({}, g));
    p.pack = [];
    P.save();
    const start = diveStartFn();
    let res = null;
    try {
      res = await start.call(VD.dive, { campaignId: +opts.campaignId, characterId: charId, difficulty: diff, seed: opts.seed, loadout,
        inventory: { goods, quick: p.quick, safe: p.safe } });
      if (res) res.fromDive = true;
    } catch (e) {
      console.error(e);
      res = { campaignId: +opts.campaignId, characterId: charId, difficulty: diff, escaped: false, error: String(e && e.message || e), fromDive: true };
    } finally {
      VD.stage.charExtras = null;
      A.busy = false;
    }
    if (A.scene === 'dive') await A.toLounge(res);
    return res;
  };

  // Ô skill theo loadout đã lưu, cắt theo số ô mở được: 2 ô gốc + Talent SkillSlotCount (tối đa 4: RMB/Q/E/R).
  // [SUY LUẬN: ảnh Steam ss05 (HUD Lv.7: RMB + Q có skill, E/R trống) và ss07 (3 ô "Kỹ năng đang được chọn"); bảng không có số ô gốc]
  A.skillSlotCount = () => Math.min(4, 2 + VD.profile.talentSum('SkillSlotCount'));
  A.SLOT_KEYS = ['SkillOne', 'SkillTwo', 'SkillThree', 'SkillFour'];
  A.skillLoadout = function (charId) {
    const lo = VD.profile.loadout(charId), n = A.skillSlotCount(), out = {};
    A.SLOT_KEYS.forEach((k, i) => { out[k] = i < n && lo[k] != null ? lo[k] : -1; });
    return out;
  };

  function closeDialog() {
    const D = VD.dialog;
    if (D && D.root) {
      D.root.classList.remove('on'); D.open = false;
      if (D.bg) { D.bg.classList.remove('on'); D.bg.style.backgroundImage = ''; }
      if (D.fade) D.fade.classList.remove('on');
    }
    if (VD.input) { VD.input.enabled = true; VD.input.clear(); }
  }
  A.closeDialog = closeDialog;

  // Kết quả không đến từ dive.js (giả lập trong kiểm thử, hoặc lỗi nạp): áp luật như buildResult của dive.js.
  function applyResult(r) {
    const P = VD.profile, p = P.get();
    if (r.exp && r.exp.total) P.addExp(r.exp.total);
    if (r.escaped) P.giveAll((r.loot || []).map(g => Object.assign({}, g)));
    if (r.campaignCleared && r.campaignId) { p.clears[r.campaignId] = (p.clears[r.campaignId] || 0) + 1; }
    if (r.campaignId) {
      const q = P.quest('c' + r.campaignId); q.tasks = q.tasks || {};
      for (const t of r.tasks || []) if (t.done) q.tasks[t.id] = true;
      if (r.step != null) q.step = r.step;
    }
    p.dives = (p.dives || 0) + 1;
    P.save();
  }

  A.toLounge = async function (result) {
    result = result || {};
    if (!result.fromDive) applyResult(result);
    A.lastResult = result;
    // Lượt lặn kết thúc: bỏ quái/unit của dive (nếu dive.js chưa dọn vì kết quả giả).
    if (VD.dive && VD.dive.state && VD.dive.state !== 'idle' && !result.fromDive) { try { if (VD.dive.debug && VD.dive.debug.dismissResult) VD.dive.debug.dismissResult(); } catch (e) { /* đã dọn */ } }
    setScene('lounge');
    await VD.lounge.enter({ fromDive: result });
    return result;
  };

  // ---------------------------------------------------------------- khởi động (main.js gọi)
  // ?lounge=1  vào thẳng sảnh với hồ sơ đã lưu (chưa có thì hồ sơ mới). ?lounge=new  xoá hồ sơ rồi vào sảnh.
  A.boot = function (q) {
    VD.profile.load();
    A.applySound();
    if (q.get('lounge') === 'new') VD.profile.reset();
    if (q.has('lounge')) return A.enterLounge({});
    return A.title();
  };

  VD.app = A;
})(window.VD = window.VD || {});
