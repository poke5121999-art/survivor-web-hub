// Màn tải + menu chính theo prefab `menu` của game gốc (Launcher2: title, charMenu, settingMenu, missonDaily, rankMenu, popupBuyEnergy, popupAlert).
// Nút chỉ có online (Tham gia, Tạo, Bạn, Cửa hàng, thêm vàng) hiện toast "Chế độ solo: chưa có" như popupAlert gốc.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, U = window.SK_UI, UI = TT.ui, S = TT.save;
  const P = 'MenuContainer/MainMenu/', CM = 'MenuContainer/CharMenu/', RK = 'MenuContainer/Lobby_Panel_Ranking/', MS = 'MenuContainer/Lobby_Panel_Missions/';
  const HEROES = { hide: ['assassin', 'priest', 'ranger', 'trapmaster'], seek: ['robot', 'viking', 'doctor', 'vampire'] };
  const HERO_NAME = {
    assassin: { vi: 'Sát Thủ', en: 'Assassin' }, priest: { vi: 'Linh Mục', en: 'Priest' }, ranger: { vi: 'Xạ Thủ', en: 'Ranger' }, trapmaster: { vi: 'Bậc Thầy Bẫy', en: 'Trapmaster' },
    robot: { vi: 'Người Máy', en: 'Robot' }, viking: { vi: 'Chiến Binh Viking', en: 'Viking' }, doctor: { vi: 'Bác Sĩ', en: 'Doctor' }, vampire: { vi: 'Ma Cà Rồng', en: 'Vampire' }
  };
  const M = TT.menu = { HEROES, HERO_NAME, t: 0 };
  let L = null, loadL = null, toast = null, cm = null, reward = null;

  const skillOf = hero => Object.values(TT.SKILLS || {}).find(s => s.hero === hero) || null;
  const heroName = h => (HERO_NAME[h] || {})[UI.lang] || h;
  M.heroName = heroName;

  // ---------------------------------------------------------------- màn tải ('loading')
  M.drawLoading = function (ctx, dt) {
    M.t += dt;
    if (!loadL) { loadL = new UI.Layer('loading'); for (const c of loadL.root.k) if (c.n === 'Home' || c.n === 'Ping' || (c.n === 'Image' && !(c.img && c.img.sp))) c.off = 1; }
    UI.drawArt(ctx, 'LOADING SCREEN 2', UI.w, UI.h);
    const spin = loadL.root.k.find(c => c.n === 'Image' && c.img && c.img.sp);
    if (spin) spin.rz = (M.t * 360) % 360;
    loadL.draw(ctx);
  };

  // ---------------------------------------------------------------- dựng menu
  function build() {
    L = new UI.Layer('menu');
    const root = L.root, mc = UI.child(root, 'MenuContainer');
    for (const c of root.k) if (c.n === 'Image' || c.n === 'Ping' || c.n === 'LoadingReconect' || c.n === 'LoadingToMap') c.off = 1;
    for (const c of mc.k) c.off = 1;
    UI.reveal(root, 'MenuContainer/MainMenu');
    // tên trùng làm rectOf bắt nhầm nút đầu tiên: đặt lại tên bản thứ hai
    const lst = UI.find(root, P + 'PopupSetting/Popup/Group_Right/List[1]'); if (lst) lst.n = 'List2';
    L.H.reindex();
    toast = UI.makeToast(L);

    // ---- nút chính
    const msg = () => toast.show(UI.str('solo'));
    for (const v of ['btnPlayReal/Button_Lobby_Join', 'btnPlayReal/Button_Lobby_Create', 'btnPlayBot/Button_Lobby_Join_Lock', 'btnPlayBot/Button_Lobby_Create_Lock']) L.bind(P + v, msg);
    L.bind(P + 'btnPlayReal/Button_Lobby_QuickPlay', quickPlay);
    L.bind(P + 'btnPlayBot/Button_Lobby_QuickPlay_Bot', quickPlay);
    L.bind(P + 'Button_Setting', () => openPanel('settings'));
    L.bind(P + 'Button_Char', () => openPanel('char'));
    L.bind(P + 'Button_Shop', msg);
    L.bind(P + 'ContainerButton/ButtonFriend', msg);
    L.bind(P + 'ContainerButton/ButtonRank', () => openPanel('rank'));
    L.bind(P + 'ContainerButton/ButtonQuest', () => openPanel('quest'));
    L.bind(P + 'Stats_Energy/Button_Add', () => openPanel('energy'));
    L.bind(P + 'Stats_Gold/Button_Add', msg);
    L.bind(P + 'Button_ChangeName', () => {
      if (S.d.level < S.ECON.ONLINE_LEVEL) { toast.show(UI.str('level5')); return; }
      let nm = null;
      try { nm = window.prompt(UI.term('CHANGE YOUR NAME'), S.d.name); } catch (e) { nm = null; }
      nm = nm && nm.trim().slice(0, 10);
      if (nm) { S.d.name = nm; S.persist(); M.refresh(); }
    });

    // ---- cài đặt
    const ST = P + 'PopupSetting/Popup/';
    L.bind(ST + 'Button_Close (2)', () => openPanel(null), 'settings');
    const tog = (path, key, fn) => L.bind(ST + path, () => { S.setSetting(key, S.d.settings[key] ? 0 : 1); if (fn) fn(); M.refresh(); }, 'settings');
    tog('Group_Left/SoundFX/Button', 'sfx', applyAudio);
    tog('Group_Left/MUSIC/Button (1)', 'music', applyAudio);
    tog('Group_Left/Vibration/Button (2)', 'vib', () => UI.vibrate(60));
    const qual = d => () => { S.setSetting('quality', (S.d.settings.quality + d + 3) % 3); TT.applyQuality(); M.refresh(); };
    L.bind(ST + 'Group_Right/List/ButtonNext', qual(1), 'settings');
    L.bind(ST + 'Group_Right/List/ButtonBack', qual(-1), 'settings');
    L.bind(ST + 'Group_Right/List2/btnVN', () => M.setLang('vi'), 'settings');
    L.bind(ST + 'Group_Right/List2/btnEnglish', () => M.setLang('en'), 'settings');
    L.bind(ST + 'rateBtn', msg, 'settings');

    // ---- mua năng lượng
    const EN = P + 'PopupEnergy/Popup/';
    L.bind(EN + 'Button_Close (1)', () => openPanel(null), 'energy');
    L.bind(EN + 'Button_AD', () => toast.show(UI.str('noAds')), 'energy');
    L.bind(EN + 'Button_Buy', () => {
      const r = S.buyEnergy();
      if (r === 'full') toast.show(UI.str('full')); else if (r === 'poor') toast.show(UI.str('poor'));
      M.refresh();
      if (r === 'ok' && S.energy() >= S.ECON.ENERGY_COST) openPanel(null);
    }, 'energy');

    // ---- thời trang (CharMenu)
    cm = { role: 'hide', idx: 0, t: 0 };
    const cur = () => HEROES[cm.role][cm.idx];
    L.bind(CM + 'PopUp/ButtonExit', () => openPanel(null), 'char');
    L.bind(CM + 'PopUp/ButtonBack', () => { cm.idx = (cm.idx + 3) % 4; M.refresh(); }, 'char');
    L.bind(CM + 'PopUp/ButtonNext', () => { cm.idx = (cm.idx + 1) % 4; M.refresh(); }, 'char');
    L.bind(CM + 'PopUp/ButtonSwitch', () => { cm.role = cm.role === 'hide' ? 'seek' : 'hide'; cm.idx = Math.max(0, HEROES[cm.role].indexOf(S.d.hero[cm.role])); M.refresh(); }, 'char');
    L.bind(CM + 'PopUp/ButtonUse', () => { S.setHero(cm.role, cur()); M.refresh(); }, 'char');
    const mdl = L.q(CM + 'PopUp/model');
    mdl.draw = (ctx, R) => UI.drawHero(ctx, cur(), R, M.t, 8.5);
    const ico = L.q(CM + 'PopUp/TapMenu_1/skill/skill1/bg_skill/skill1');
    ico.draw = (ctx, R) => {
      const s = skillOf(cur()), name = s && s.icon;
      if (!name) return;
      if (U.frames[name]) { SK.ugui.drawFrame(ctx, name, R); return; }
      const f = SK.frame(name); if (!f) return;
      const k = Math.min(R.w / f[3], R.h / f[4]);
      ctx.save(); UI.setSmooth(ctx, false); ctx.translate(R.x + R.w / 2, R.y + R.h / 2); ctx.scale(k, k);
      SK.draw(ctx, name, f[5] - f[3] / 2, f[6] - f[4] / 2); ctx.restore();
    };

    // ---- bảng xếp hạng
    L.bind(RK + 'Top_Menu/Button_Back', () => openPanel(null), 'rank');
    const prof = L.q(RK + 'PlayerRankItem/Character_Bg/Mask/Image_Character');
    prof.draw = (ctx, R) => UI.drawHero(ctx, S.d.hero.hide || HEROES.hide[0], { x: R.x, y: R.y + R.h * 0.3, w: R.w, h: R.h }, M.t, 3.4);

    // ---- nhiệm vụ ngày
    L.bind(MS + 'Top/Button_Back', () => openPanel(null), 'quest');
    for (let i = 0; i < 4; i++) {
      L.bind(MS + 'Group_Left/ScrollRect/Content/' + qItem(i) + '/ListQuestFinish/claimBtn/Button_Claim_Green', () => {
        if (S.claimQuest(i)) { UI.sfx('fx_buy'); M.refresh(); }
      }, 'quest');
    }
    L.bind(MS + 'Group_Right/Right/Button_Claim_Yellow', () => {
      const r = S.claimTotal();
      if (r) { reward = r; UI.setText(L.q(MS + 'PopupReward/Popup/coin'), UI.fmt(r.gold)); UI.setText(L.q(MS + 'PopupReward/Popup/cup'), String(r.cup)); L.scope = 'reward'; UI.sfx('fx_buy'); M.refresh(); }
    }, 'quest');
    L.bind(MS + 'PopupReward/Popup/Button_Claim', () => { reward = null; L.scope = 'quest'; M.refresh(); }, 'reward');
    // nút "mua" thừa trong popup phần thưởng
    L.q(MS + 'PopupReward/Popup/Button_Buy').off = 1;
    const dimBtn = L.q(CM + 'PopUp/ButtonBuy'); if (dimBtn) dimBtn.off = 1;
    const lock = L.q(CM + 'PopUp/bg/lock'); if (lock) lock.off = 1;
    // CharMenu: bật nút đổi vai + tab Kỹ năng
    const sw = UI.reveal(root, 'MenuContainer/CharMenu/PopUp/ButtonSwitch'); sw.p = [-560, 382];   // gốc tắt; đặt lại cho khỏi đè thanh tên
    UI.reveal(root, 'MenuContainer/CharMenu/PopUp/TapMenu_1');
    L.q(CM + 'PopUp/ButtonCantUse').off = 1;
  }
  const qItem = i => i ? 'ListQuestItem (' + i + ')' : 'ListQuestItem';

  function applyAudio() {
    try {
      if (!TT.audio || !TT.audio.setMuted) return;
      TT.audio.setMuted('sfx', !S.d.settings.sfx); TT.audio.setMuted('music', !S.d.settings.music);
    } catch (e) { /* tiếng không được làm hỏng UI */ }
  }
  M.applyAudio = applyAudio;

  // ---------------------------------------------------------------- cửa sổ
  const PANELS = {
    settings: [P + 'PopupSetting'], energy: [P + 'PopupEnergy'], char: ['MenuContainer/CharMenu'],
    rank: ['MenuContainer/Lobby_Panel_Ranking'], quest: ['MenuContainer/Lobby_Panel_Missions']
  };
  function openPanel(name) {
    for (const k in PANELS) for (const p of PANELS[k]) { const n = UI.find(L.root, p); if (n) n.off = 1; }
    L.scope = name || 'main';
    if (name) {
      for (const p of PANELS[name]) UI.reveal(L.root, p);
      if (name === 'char') { cm.role = cm.role || 'hide'; cm.idx = Math.max(0, HEROES[cm.role].indexOf(S.d.hero[cm.role])); }
      UI.sfx('dialog_click');
    }
    M.refresh();
  }

  function quickPlay() {
    if (!S.canPlay()) { openPanel('energy'); return; }
    S.spendEnergy();
    UI.sfx('fx_btn_start');
    TT.startMatch();
  }

  M.setLang = function (l) {
    UI.lang = l; S.setLang(l);
    UI.applyLang(L.root); if (loadL) UI.applyLang(loadL.root);
    if (TT.hud && TT.hud.setLang) TT.hud.setLang();
    M.refresh();
  };

  // ---------------------------------------------------------------- làm tươi chữ/số theo dữ liệu
  M.refresh = function () {
    if (!L) return;
    const d = S.d, q = path => L.q(path), set = (path, s) => UI.setText(q(path), s);
    S.regen();
    set(P + 'Profile/Name', d.name);
    set(P + 'Profile/Level/Text_Level', String(d.level));
    q(P + 'Profile/Slider_Character_Exp/fill').img.fa = S.expFrac();
    set(P + 'Cup/Text_Value', String(d.cup));
    set(P + 'Stats_Energy/Text_Value', S.energy() + '/' + S.ECON.ENERGY_MAX);
    set(P + 'Stats_Gold/Text_Value', UI.fmt(d.gold));
    UI.show(q(P + 'btnPlayReal'), true); UI.show(q(P + 'btnPlayBot'), false);   // solo: nút Tham gia/Tạo luôn ở dạng mở khoá, bấm ra toast

    // cài đặt
    const ST = P + 'PopupSetting/Popup/';
    UI.show(q(ST + 'Group_Left/SoundFX/Button/Image'), !!d.settings.sfx);
    UI.show(q(ST + 'Group_Left/MUSIC/Button (1)/Image'), !!d.settings.music);
    UI.show(q(ST + 'Group_Left/Vibration/Button (2)/Image'), !!d.settings.vib);
    set(ST + 'Group_Right/List/ImageQuality/QualityType', UI.str(['low', 'medium', 'high'][d.settings.quality]));
    q(ST + 'Group_Right/List2/btnVN').cg = UI.lang === 'vi' ? 1 : 0.45;
    q(ST + 'Group_Right/List2/btnEnglish').cg = UI.lang === 'en' ? 1 : 0.45;

    // năng lượng
    set(P + 'PopupEnergy/Popup/Button_Buy/Text_energyGift', String(S.ECON.ENERGY_GIFT));
    set(P + 'PopupEnergy/Popup/Button_Buy/Text_EnergyPrice', String(S.ECON.ENERGY_PRICE));
    set(P + 'PopupEnergy/Popup/Button_AD/Text_EnergyAd', '20');

    refreshChar();
    refreshRank();
    refreshQuests();
  };

  function refreshChar() {
    const hero = HEROES[cm.role][cm.idx], used = S.d.hero[cm.role] === hero || (!S.d.hero[cm.role] && cm.idx === 0);
    set(CM + 'PopUp/bg/Name', heroName(hero));
    UI.show(L.q(CM + 'PopUp/ButtonUse'), !used); UI.show(L.q(CM + 'PopUp/ButtonCantUse'), used);
    UI.show(L.q(CM + 'PopUp/ButtonSwitch/Hide'), cm.role === 'hide'); UI.show(L.q(CM + 'PopUp/ButtonSwitch/Seek'), cm.role === 'seek');
    const s = skillOf(hero), eff = CM + 'PopUp/TapMenu_1/skill/skill1/Image/effect1';
    UI.setText(L.q(eff), s ? '<color=#ffd84a>' + s.name[UI.lang] + '</color>\n' + s.desc[UI.lang] : UI.str('noSkill'));
  }
  function set(path, s) { UI.setText(L.q(path), s); }

  function refreshRank() {
    const d = S.d, it = RK + 'PlayerRankItem/';
    set(it + 'Text_rank', '1'); set(it + 'Text_NickName', d.name); set(it + 'Text_Score', UI.fmt(d.cup));
    UI.show(L.q(it + 'Icon_MedalGold'), true);
    UI.show(L.q(it + 'Text_rank'), false);
    const rows = [['stats', d.stats.match], ['wins', d.stats.win], ['hideWins', d.stats.hideWin], ['seekWins', d.stats.seekWin]];
    const panel = L.q(RK.slice(0, -1)), src = L.q(RK + 'PlayerRankItem');
    if (!panel.__rows) {
      panel.__rows = rows.map((r, i) => {
        const c = SK.ugui.clone(src);
        c.n = 'Row' + i; c.p = [src.p[0], src.p[1] - (i + 1) * 135];
        for (const nme of ['Icon_MedalGold', 'Icon_Trophy', 'Character_Bg', 'Text_rank']) UI.show(UI.child(c, nme), false);
        panel.k.push(c);
        return c;
      });
      UI.show(L.q(RK + 'ScrollRect'), false); UI.show(L.q(RK + 'border'), false);
    }
    panel.__rows.forEach((c, i) => {
      UI.setText(UI.child(c, 'Text_NickName'), UI.str(rows[i][0]));
      UI.setText(UI.child(c, 'Text_Score'), String(rows[i][1]));
    });
  }

  function refreshQuests() {
    const d = S.d;
    S.QUESTS.forEach((q, i) => {
      const item = MS + 'Group_Left/ScrollRect/Content/' + qItem(i) + '/', done = S.questDone(i), claimed = d.daily.claimed[i];
      const fin = L.q(item + 'ListQuestFinish'), nf = L.q(item + 'ListQuestNotFinish');
      UI.show(fin, done); UI.show(nf, !done);
      for (const base of [item + 'ListQuestFinish/', item + 'ListQuestNotFinish/']) {
        set(base + 'MissionName', q[UI.lang][0]); set(base + 'Describe', q[UI.lang][1]);
        set(base + 'GetCoin/Text_value', String(q.gold)); set(base + 'GetCup/Text_value', String(q.cup));
      }
      set(item + 'ListQuestNotFinish/Text_Process', String(S.questProgress(i))); set(item + 'ListQuestNotFinish/Text_Request', '/' + q.need);
      UI.show(L.q(item + 'ListQuestFinish/claimBtn'), !claimed);
      for (const c of fin.k) if (c.img && c.img.sp === 'check_green') UI.show(c, !!claimed);
    });
    const done = S.questsClaimed(), right = MS + 'Group_Right/Right/';
    ['star', 'star (1)', 'star (2)', 'star (3)'].forEach((s, i) => { L.q(right + s).img.sp = i < done ? 'character_grade_star' : 'character_grade_star_dim'; });
    UI.show(L.q(right + 'Button_Claim_Yellow'), done >= 4 && !d.daily.total);
    UI.show(L.q(right + 'check'), !!d.daily.total);
    UI.show(L.q(MS + 'PopupReward'), L.scope === 'reward');
  }

  // ---------------------------------------------------------------- vòng đời
  M.open = function () {
    if (!L) build();
    S.rollDay(); applyAudio();
    openPanel(null);
    if (TT.audio && TT.audio.music) { try { TT.audio.music('lobby'); } catch (e) { /* bỏ qua */ } }
  };
  M.ensure = function () { if (!L) build(); M.refresh(); };
  M.draw = function (ctx, dt) {
    M.t += dt; if (cm) cm.t += dt;
    UI.update(dt); toast.update(dt);
    if (((M.regenT = (M.regenT || 0) + dt)) > 1) { M.regenT = 0; S.regen(); UI.setText(L.q(P + 'Stats_Energy/Text_Value'), S.energy() + '/' + S.ECON.ENERGY_MAX); }
    UI.drawArt(ctx, 'LOADING SCREEN 2', UI.w, UI.h);
    L.draw(ctx);
  };
  M.down = (x, y) => L.down(x, y);
  M.up = (x, y) => L.up(x, y);
  M.cancel = () => L && L.cancel();
  M.layer = () => L;
})();
