// Một kho trạng thái cho HUD. Game gốc nhận các số này từ server (SMLoginData, RPGUserData, MetaSync); bản web chơi
// một mình nên dữ liệu là giữ chỗ [ĐỀ XUẤT] cho tới khi có đệm meta. HUD chỉ đọc kho này và nghe `on('change')`.
const listeners = new Set();

export const state = {
  player: { name: 'Bạn', level: 1, exp: 0.0 },          // exp 0..1 (vòng LevelGaugeRadial)
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
};

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function set(patch) {
  Object.assign(state, patch);
  for (const f of listeners) f(state, patch);
}
export function touch(what) { for (const f of listeners) f(state, { [what]: state[what] }); }
