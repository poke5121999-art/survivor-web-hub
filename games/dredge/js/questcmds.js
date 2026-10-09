/*
 * Lệnh / hàm Yarn của chuỗi nhiệm vụ vùng (W5, WORLD-GAPS.md §6). Mọi mục đăng ký qua DRYarn.command / DRYarn.fn.
 *
 *   MakeBait                       DredgeDialogueRunner.cs:599-613: xoá lưới BAIT_INPUT, mỗi món trong đó thành 1 "bait" ở BAIT_OUTPUT
 *                                  (FindSpaceAndAddObjectToGridData: hết chỗ thì món đó mất, như gốc)
 *   GetDidAddEnoughFishToMakeBait  :855-862: tổng số ô của món trong BAIT_INPUT >= 1
 *   TryConvertDogTags              :865-895: quest-dog-tag trong SOLDIER_DOG_TAG_INPUT -> bỏ hết, vars['dog-tags-returned'] += n,
 *                                  n' = min(n, cỡ lưới ra) "research-item" vào SOLDIER_DOG_TAG_OUTPUT; trả false nếu không có thẻ nào
 *   GetNumDamagedDeployables       :845 -> ItemManager.cs:497: món EQUIPMENT damageMode DURABILITY trong khoang có durability < maxDurabilityDays
 *   ActivateBanishMachine          BanishMachine.cs:33-37: vars['banish-machine-expiry'] = time + banishMachineDurationDays (0,5, GameConfigData);
 *                                  bật máy (tiếng "Banish Machine" lặp, tắt dần 2 s) và DR.emit('banishMachine', true); khi time > expiry
 *                                  (BanishMachine.cs:61-66) tắt và DR.emit('banishMachine', false). Vào ván / tải sổ: time < expiry thì bật ngay (:25-28)
 *   ToggleDSAltarFlame <bool>      DSAltarFlame.cs:31-42: true bật BlueFlameWhite, false huỷ hạt. Gốc không lưu gì vào sổ; ở đây chỉ giữ cờ chạy
 *                                  DRQuestObj.altarFlame và DR.emit('altarFlame', bool). Hạt BlueFlameWhite chưa được bóc (data/particles.js
 *                                  không có), nên chưa có hình ngọn lửa.
 *
 * Móc: DRQuestObj { banishActive(), expiry(), altarFlame, data (DR_QUESTOBJ), makeBait(), convertDogTags() }
 * Dữ liệu vị trí / tiếng lấy từ data/questobj.js (tools/questobj.py). Tiếng máy: giảm tuyến tính theo khoảng cách từ thuyền
 * (AudioSource rolloffMode 1 = Linear, Min 50 / Max 300; Pan2D 0) — [ĐỀ XUẤT] bỏ định vị trái phải.
 */
(function (root) {
  'use strict';
  const D = root.DR, Y = root.DRYarn, G = root.DRGrid, QO = root.DR_QUESTOBJ || {};
  if (!D || !Y || !G) return;
  const S = () => D.s;
  const str = v => String(v == null ? '' : v).toLowerCase();

  function ensure(key, cfg) {
    const s = S();
    if (!s.grids[key]) s.grids[key] = { cfg, items: [], damage: [], extra: [] };
    return D.grid(key);
  }
  const cells = it => (it.dims ? it.dims.length : (it.w || 1) * (it.h || 1));

  // ---- bait ----
  function makeBait() {
    const s = S();
    if (!s.grids.BAIT_INPUT) return 0;                              // gridByKey == null: không làm gì
    const inp = D.grid('BAIT_INPUT'), out = ensure('BAIT_OUTPUT', 'BaitOutput');
    const n = inp.items.length;
    inp.items.length = 0; inp.seq = 1;                               // Clear(reInit: true)
    const bait = D.item('bait');
    let made = 0;
    for (let i = 0; i < n; i++) if (G.autoPlace(out, bait)) made++;
    D.emit('cargo', 'BAIT_OUTPUT', null);
    return made;
  }
  function enoughFish() {
    if (!S().grids.BAIT_INPUT) return false;
    let c = 0;
    for (const i of D.grid('BAIT_INPUT').items) c += cells(D.item(i.id));
    return c >= 1;
  }

  // ---- dog tags ----
  const TAG = 'quest-dog-tag', PART = 'research-item';
  function convertDogTags() {
    const inp = ensure('SOLDIER_DOG_TAG_INPUT', 'DogTagInput'), out = ensure('SOLDIER_DOG_TAG_OUTPUT', 'DogTagOutput');
    const tags = inp.items.filter(i => i.id === TAG);
    if (!tags.length) return false;
    for (const i of tags) G.remove(inp, i);
    const v = S().vars;
    v['dog-tags-returned'] = (parseInt(v['dog-tags-returned'], 10) || 0) + tags.length;   // AdjustIntVariable
    const size = out.cells.filter(c => !c.hidden && c.type !== 0).length;                  // GridConfiguration.GetSize
    const part = D.item(PART);
    for (let j = 0, n = Math.min(tags.length, size); j < n; j++) if (!G.autoPlace(out, part)) break;
    D.emit('cargo', 'SOLDIER_DOG_TAG_OUTPUT', null);
    return true;
  }

  // ---- hỏng hóc món triển khai (ItemManager.GetDamagedDeployables) ----
  function damagedDeployables() {
    const g = S() && S().grids.INVENTORY ? D.grid('INVENTORY') : null;
    if (!g) return 0;
    let n = 0;
    for (const i of g.items) {
      const it = D.item(i.id);
      if (!(G.typeOf(it) & G.TYPE.EQUIPMENT) || it.damageMode !== 'DURABILITY') continue;
      const max = +it.maxDurabilityDays, dur = i.dur == null ? max : i.dur;   // món mới tạo có độ bền đầy
      if (dur < max) n++;
    }
    return n;
  }

  // ---- máy Xua đuổi (Research Pontoon) ----
  const BM = QO.banishMachine || {}, AU = BM.audio || {};
  const KEY = 'banish-machine-expiry';
  let active = false, voice = null, raf = 0;
  if (root.DR_AUDIO && !root.DR_AUDIO['ambience.banishMachine']) {   // clip "Banish Machine" do tools/questobj.py đưa vào, không qua audio.py
    root.DR_AUDIO['ambience.banishMachine'] = { src: 'audio/ambience/Banish_Machine.mp3', loop: true, vol: 1, dur: 30,
      orig: 'Assets/Audio/Ambience/Misc/Banish Machine.ogg' };
  }
  const expiry = () => { const s = S(); return s && s.vars && s.vars[KEY] != null ? +s.vars[KEY] : 0; };
  function level() {                                                // âm lượng theo khoảng cách tới máy, tuyến tính Min..Max
    const b = S() && S().boat; if (!b || !BM.p) return 0;
    const d = Math.hypot(b.x - BM.p[0], b.z - BM.p[2]), mn = AU.min || 50, mx = AU.max || 300;
    return (AU.volumeMax == null ? 1 : AU.volumeMax) * Math.max(0, Math.min(1, 1 - (d - mn) / (mx - mn)));
  }
  function loop() {
    raf = 0;
    if (!active) return;
    if (S().time > expiry()) { toggle(false); return; }              // Update(): TimeAndDay > expiry
    if (voice && voice.gain) voice.gain(level(), 0.3);
    raf = root.requestAnimationFrame ? root.requestAnimationFrame(loop) : root.setTimeout(loop, 100);
  }
  function toggle(on) {
    on = !!on;
    if (on === active && on) { if (!raf) loop(); return; }
    active = on;
    if (on) {
      if (voice && voice.stop) voice.stop(0.05);
      try { voice = root.DRAudio && DRAudio.voice('ambience.banishMachine', { loop: AU.loop !== false, vol: level() }); } catch (e) { voice = null; }
      if (!raf) loop();
    } else {
      if (voice && voice.stop) voice.stop(AU.fadeTime == null ? 2 : AU.fadeTime);   // DOFade(0, volumeFadeTime)
      voice = null;
    }
    D.emit('banishMachine', on);                                     // GameEvents.TriggerBanishMachineToggled
  }
  function activateBanishMachine() {
    const days = BM.durationDays != null ? BM.durationDays : (root.DR_CONFIG || {}).banishMachineDurationDays;
    S().vars[KEY] = S().time + (days == null ? 0.5 : days);
    toggle(true);
  }
  function sync() {                                                 // BanishMachine.Start()
    if (active) { active = false; if (voice && voice.stop) voice.stop(0.05); voice = null; if (raf) { (root.cancelAnimationFrame || clearTimeout)(raf); raf = 0; } }
    const s = S();
    if (s && s.time < expiry()) toggle(true);
  }
  D.on('load', sync);
  D.on('newgame', sync);

  // ---- ngọn lửa bàn thờ Gai Quỷ ----
  const Q = { altarFlame: false };
  function altar(on) { Q.altarFlame = !!on; D.emit('altarFlame', Q.altarFlame); }

  // ---- lưới nhiệm vụ có khoá (ShowQuestGrid BaitInput / BaitOutput / DogTagInput / DogTagOutput) ----
  // dialogue.js chỉ dựng lưới nhận / giao đồ rút gọn; bốn lưới này là lưới kéo-thả lưu theo gridKey nên mở bằng DRCargo (kind 'quest', như poi.js
  // làm với rương xác tàu). allowStorageAccess của gốc quyết định có tab kho hay không. Đóng lưới = bấm "Convert" của gốc (exitPromptOverride).
  const VI = { 'Bait Ingredients': 'Nguyên liệu làm mồi', 'Dog Tags': 'Thẻ bài chó', 'Collect Item': 'Nhận đồ',
    'Fish placed here will be converted into bait.': 'Cá đặt vào đây sẽ được làm thành mồi.', 'Convert': 'Chuyển đổi' };
  const vi = t => VI[t] || t;
  const GRIDS = { BaitInput: 1, BaitOutput: 1, DogTagInput: 1, DogTagOutput: 1 };
  function wrapShow() {
    const SG = root.DRStoryGrid;
    if (!SG || !SG.show || SG.show._qc) return;
    const o = SG.show;
    SG.show = function (name, cb) {
      const q = GRIDS[name] && ((root.DR_QUESTS || {}).QuestGridConfig || {})[name];
      if (!q || !root.DRCargo || !S()) return o.call(this, name, cb);
      const h = DRCargo.open({
        right: { tabs: q.allowStorageAccess ? ['INVENTORY', 'STORAGE'] : ['INVENTORY'] },
        left: { kind: 'quest', title: vi(q.titleString),
          quest: Object.assign({}, q, { titleString: vi(q.titleString), helpStringOverride: vi(q.helpStringOverride), exitPromptOverride: vi(q.exitPromptOverride) }) },
        onClose: res => cb(res && res.complete ? 1 : 0)
      });
      if (!h) return o.call(this, name, cb);
    };
    SG.show._qc = true;
  }
  wrapShow();

  // ---- đăng ký ----
  Y.command('MakeBait', () => { makeBait(); });
  Y.fn('GetDidAddEnoughFishToMakeBait', () => enoughFish());
  Y.fn('TryConvertDogTags', () => convertDogTags());
  Y.fn('GetNumDamagedDeployables', () => damagedDeployables());
  Y.command('ActivateBanishMachine', () => { activateBanishMachine(); });
  Y.command('ToggleDSAltarFlame', a => { altar(str(a[0]) === 'true'); });

  root.DRQuestObj = Object.assign(Q, { banishActive: () => active, expiry, data: QO, makeBait, convertDogTags, damagedDeployables,
    activateBanishMachine, level });
})(window);
