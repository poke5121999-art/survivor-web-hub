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
// v2 (F3): slime sở hữu, đội, kho, bách khoa, ô nhanh vật phẩm (khuôn dưới). Bản lưu v1 được đổi lên (migrateV1), không bỏ.
export const SAVE_KEY = 'wos.save';
export const SAVE_VERSION = 2;
// ===== KHUÔN SLIME SỞ HỮU (F3) =====================================================================================
// Game gốc: SMLoginData.holdingMonsters (túi slime, 6 ô = EquipMonster1..6), equippedMonsterId, kho Archive (Slime Storage),
// MonsterDexDegree None/Discover/Catch/Master (CODE.md §4). Bản web:
//   save.slimes[uid] = { uid, typeId (id biến thể, vd SL_Slime_Grass), nickname, level, exp, hp, mp, stamina (0..1 phần của
//                        mức tối đa theo cấp), tamedAt (ISO), acquisition ('STARTER'|'FIELD'), friendly?, fainted? }
//   save.party   = [uid...] tối đa PARTY_MAX theo thứ tự ô (phím 1-6), save.storage = [uid...] (kho Allen), save.active = uid đồng hành
//   save.dex[typeId] = 1 Discover | 2 Catch (Tame)   save.quick = [itemId|null, x3] ô nhanh Q/E/R   save.items = { itemId: số }
export const PARTY_MAX = 6;          // SlimeArchiveUI.SlimeInventoryPods có 6 ô (EquipMonster1..6) [ĐO TRONG REPO]
export const STORAGE_MAX = 16;       // [THẤY v4van_sheet_slime_storage] "Bag 10/16"
let uidSeq = 0;
export function newSlime(typeId, o = {}) {
  return { uid: 's' + Date.now().toString(36) + (uidSeq++).toString(36), typeId, nickname: o.nickname || null, level: o.level || 1, exp: o.exp || 0,
    hp: o.hp ?? 1, mp: o.mp ?? 1, stamina: o.stamina ?? 1, tamedAt: o.tamedAt || new Date().toISOString(), acquisition: o.acquisition || 'FIELD',
    ...(o.friendly ? { friendly: true } : {}) };
}
export function freshSave(startGold) {
  return { v: SAVE_VERSION, quests: {}, gold: startGold, exp: 0, level: 1, sp: 0, perks: {}, items: {}, boxes: [], seen: {},
    slimes: {}, party: [], storage: [], active: null, dex: {}, quick: [null, null, null] };
}
// slime khởi đầu: lần đầu vào game (hoặc bản lưu v1) tạo bản ghi STARTER; thể lực thấp như 1:12 [ĐỀ XUẤT]
export const STARTER_STATS = { hp: 0.62, mp: 0.8, stamina: 0.12 };
function migrateV1(s) {
  const o = s.slime || {}, out = { ...s, v: SAVE_VERSION, slimes: {}, party: [], storage: [], active: null, dex: {}, quick: [null, null, null] };
  delete out.slime;
  out._v1slime = { hp: o.hp ?? 1, mp: o.mp ?? 1, stamina: o.st ?? 1, level: o.lv || 1, exp: o.exp || 0 };   // game.js ensureStarter dùng
  return out;
}
export function loadSave(startGold) {
  try {
    if (P.has('fresh') && !loadSave.freshDone) { loadSave.freshDone = true; localStorage.removeItem(SAVE_KEY); }   // một lần mỗi trang: js/intro ghi profile rồi engine mới đọc
    let s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && s.v === 1) s = migrateV1(s);
    if (s && s.v === SAVE_VERSION) return Object.assign(freshSave(startGold), s);
  } catch (e) { /* trình duyệt chặn bộ nhớ: chơi không lưu */ }
  return freshSave(startGold);
}
export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
