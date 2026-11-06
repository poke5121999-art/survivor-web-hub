// Chuỗi giao diện chép từ bảng localization của game (D:\wos-ref\data\loc\vi.json, en.json), khoá giữ nguyên tên gốc.
// Tên bản đồ, nhiệm vụ, slime do server gửi nên không có trong bảng: những chuỗi đó nằm ở js/state.js, ghi [ĐỀ XUẤT].
export const LOC = {
  vi: {
    'IAP.PriceLoading': 'Đang tải...',
    'Common.ChannelId': 'CH.{ChannelId}',
    'UI.QuestNotRegistered': 'Không có nhiệm vụ.',
    'Quest.QuestNone': 'Không có nhiệm vụ nào đang tiến hành.',
    'PlayScene.WarningStamina': 'Cảnh báo! Thể lực thấp!',
    'PlayScene.Slimeslotlimit': 'Không Thể Đồng Hành',
    'Slimeinventory.Faint': 'Bất Tỉnh',
    'Log.SlimeExp': 'EXP Slime {Name}',
    'Common.WorldMap': 'Bản Đồ Thế Giới',
    'Common.Inventory': 'Túi Đồ',
    'Common.SlimeIndex': 'Bách Khoa Slime',
    'Archive.SlimeStorageTitle': 'Kho Slime',
    'Common.Quest': 'Nhiệm Vụ',
    'Common.Party': 'Nhóm',
    'Common.Perk': 'Tiềm Năng',
    'Common.Settings': 'Cài Đặt',
    'Settings.Keymap.Switch': 'Đổi slime',
    'Settings.Keymap.Dash': 'Lướt',
    'Settings.Keymap.KeyboardInteractAttack': 'Tấn công / Tương tác',
    'Settings.Keymap.CombatMode': 'Chuyển chế độ chiến đấu tự động',
    'Settings.Keymap.Minimap': 'Bản đồ nhỏ',
    'Settings.Keymap.Community': 'Cộng đồng',
  },
  en: {
    'IAP.PriceLoading': 'Loading...',
    'Common.ChannelId': 'CH.{ChannelId}',
    'UI.QuestNotRegistered': 'No quest.',
    'Quest.QuestNone': 'There are no quests in progress.',
    'PlayScene.WarningStamina': 'Warning! Low stamina!',
    'PlayScene.Slimeslotlimit': 'Accompany Unavailable',
    'Slimeinventory.Faint': 'Fainted',
    'Log.SlimeExp': '{Name} Slime EXP',
    'Common.WorldMap': 'World Map',
    'Common.Inventory': 'Bag',
    'Common.SlimeIndex': 'Slimepedia',
    'Archive.SlimeStorageTitle': 'Slime Storage',
    'Common.Quest': 'Quest',
    'Common.Party': 'Party',
    'Common.Perk': 'Potential',
    'Common.Settings': 'Settings',
    'Settings.Keymap.Switch': 'Switch',
    'Settings.Keymap.Dash': 'Dash',
    'Settings.Keymap.KeyboardInteractAttack': 'Attack / Interact',
    'Settings.Keymap.CombatMode': 'Auto-Battle',
    'Settings.Keymap.Minimap': 'Minimap',
    'Settings.Keymap.Community': 'Community',
  },
};

const lang = /^vi/i.test(new URLSearchParams(location.search).get('lang') || 'vi') ? 'vi' : 'en';
export function t(key, args) {
  let s = LOC[lang][key] ?? LOC.en[key] ?? key;
  if (args) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in args ? args[k] : m));
  return s;
}
