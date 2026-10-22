// Một kho trạng thái cho HUD. Game gốc nhận các số này từ server (SMLoginData, RPGUserData, MetaSync); bản web chơi
// một mình nên dữ liệu là giữ chỗ [ĐỀ XUẤT] cho tới khi có đệm meta. HUD chỉ đọc kho này và nghe `on('change')`.
const listeners = new Set();
const P = new URLSearchParams(location.search);

export const state = {
  player: { name: P.get('name') || 'Bạn', level: 1, exp: 0.0 },          // exp 0..1 (vòng LevelGaugeRadial); name [ĐỀ XUẤT] (chưa có màn đặt tên)
  channel: 1,
  map: { name: 'Larus', detail: 'Bản đồ thử', icon: 'img/mapicon/Icon_Larus.webp' },   // [ĐỀ XUẤT] tên bản đồ do server gửi
  // SlimeQuickSlotLayout có 6 ô (EquipMonster1..6). Một slime ở ô 1, đang đồng hành.
  party: [
    { id: 'SL_Slime_Water', name: 'Slime Nước', level: 1, hp: 1, mp: 1, st: 1, exp: 0.0 },   // [ĐỀ XUẤT] tên, chỉ số
    null, null, null, null, null,
  ],
  equipped: 0,              // ô đang đồng hành (Selected_MaskSlot), null = không ai
  items: [null, null, null],  // ItemQuickSlotPod Q/E/R (Slot2..4)
  quest: null,              // { title, objectives: [{ text, done }] } ; null = EmptyLayout "Không có nhiệm vụ." (như inn1)
  warnStamina: false,       // BaseWarningLayout StaminaLayout
  autoBattle: false,        // CombatMode (H): AutoAttackButtonRoot Enabled/Disabled; ảnh chụp demo thật (inn1) mở đầu là Disabled
  battle: false,            // slime đang đánh: nút lớn đổi thành Return (huýt sáo)
  control: 'user',          // Switch (C): SwitchToUser / SwitchToSlime
  minimapOpen: false,       // Tab: MiniMapUI lớn
  modal: null,              // bảng/hội thoại đang mở ('dialogue', 'questlog', 'perk', 'shop', 'notice'): HUD ẩn, phím đi tắt
};

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function set(patch) {
  Object.assign(state, patch);
  for (const f of listeners) f(state, patch);
}
export function touch(what) { for (const f of listeners) f(state, { [what]: state[what] }); }

// ===== Bản lưu tiến trình nhiệm vụ (máy trạng thái của js/quest/engine.js) ========================================
// localStorage['wos.save'] = JSON { v: SAVE_VERSION, quests: { [id]: { s: 'active'|'done', c: { [objId]: n } } },
//   gold, exp, level, sp, perks: { [perkId]: bậc }, items: { [itemId]: n }, boxes: [id hộp đã mở],
//   slime: { hp, mp, st } (0..1), seen: { [tutorialId]: true } }
// Đổi khuôn thì tăng SAVE_VERSION: bản lưu khác phiên bản bị bỏ (bắt đầu lại từ nhiệm vụ 1). `?fresh` = xoá bản lưu.
export const SAVE_KEY = 'wos.save';
export const SAVE_VERSION = 1;
export function freshSave(startGold) {
  return { v: SAVE_VERSION, quests: {}, gold: startGold, exp: 0, level: 1, sp: 0, perks: {}, items: {}, boxes: [],
    slime: { hp: 0.62, mp: 0.8, st: 0.12 }, seen: {} };   // [ĐỀ XUẤT] slime mở đầu kiệt sức: "Warning! Low stamina!" (1:12)
}
export function loadSave(startGold) {
  try {
    if (P.has('fresh')) localStorage.removeItem(SAVE_KEY);
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.v === SAVE_VERSION) return Object.assign(freshSave(startGold), s);
  } catch (e) { /* trình duyệt chặn bộ nhớ: chơi không lưu */ }
  return freshSave(startGold);
}
export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
