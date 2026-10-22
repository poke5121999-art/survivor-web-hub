// Chữ của phần mở đầu (Touch To Start, đặt tên, tạo nhân vật, truyện tranh, chọn ba lô, Setting).
// - `en` là NGUYÊN VĂN game gốc: bảng localization của client (D:\wos-ref\data\loc\en.json, khoá ghi bên phải) hoặc chữ
//   thấy trong ảnh chụp demo thật D:\wos-ref\pilot (g1..g8, cust1..6) và clip DcGavHFwqtk (sheet00, sheet01, sheet14).
// - `vi` lấy từ D:\wos-ref\data\loc\vi.json của game khi có khoá [LOC]; dòng không có khoá là bản dịch của bản web.
// Mặc định tiếng Việt; `?lang=en` hiện nguyên văn.
const P = new URLSearchParams(location.search);
export const LANG = /^en/i.test(P.get('lang') || '') ? 'en' : 'vi';

export const TEXT = {
  en: {
    touch: 'Touch To Start',                                   // g1.png
    loadingRes: 'Loading resources',                           // g2.png
    version: 'version : 1.1.0(5)',                             // g1.png
    nickTitle: 'Nickname Setting',                             // LoginScene.NickName.Title
    nickContent: 'Please enter the nickname.',                 // LoginScene.Nickname.Content
    nickHolder: 'Maximum of {Length} alphabets',               // LoginScene.Nickname.PlaceHolder
    nickFixed: 'Cannot be changed.',                           // Intro.Non-changeable
    nickConfirm: 'Start with this name?',                      // LoginScene.Nickname.Confirm (g5.png)
    nickEmpty: 'This nickname cannot be used.',                // Login.ChangeNickname
    registered: 'Registration succeeded!',                     // Login.RegisterSuccess (0:09)
    done: 'Done', notice: 'Notice', cancel: 'Cancel', confirm: 'Confirm', random: 'Random', skip: 'Skip', yes: 'Yes',
    gender: 'Gender', skin: 'Skin', hair: 'Hair', hairColor: 'Hair Color', face: 'Face', lens: 'Lens', acc: 'Acc',   // Customize.*
    lookConfirm: 'Save this look? After confirmation, you cannot change the look.',   // Customize.Confirm (g7.png)
    pickSelect: 'Should I choose this?',                       // SelectInitialSlime.Select
    pickChange: "Let's take a look at the other pockets too.", // SelectInitialSlime.Change
    // Setting (QualitySettingUI, clip 11:12 / 11:15)
    settings: 'Settings', catGraphic: 'Graphic', catVolume: 'Volume', catAccount: 'Account',
    secSettings: 'Settings', secResolution: 'Resolution', secGame: 'Game',
    gq: 'Graphic Quality', gqD: 'Automatically applies pre-configured settings.',
    fps: 'Max FPS', fpsD: 'Some options may not be available on your device.',
    screen: 'Screen Mode', screenD: 'Changes the display mode.',
    res: 'Set Resoultion', resD: 'Change game resolution.',
    shadow: 'Shadow Quality', shadowD: 'Adjusts shadow quality. Turning it off significantly improves performance.',
    cam: 'Camera Scale', camD: 'Adjusts the rendering scale of the game camera.',
    master: 'Master Volume', masterD: 'Adjusts the master sound volume of the game.',
    bgm: 'BGM Volume', bgmD: 'Adjusts the volume of background music that sets the tone of the game.',
    sfx: 'FX Volume', sfxD: 'Adjusts the volume of sound effects.',
    veryLow: 'Very Low', low: 'Low', medium: 'Medium', high: 'High', veryHigh: 'Very High', unlimited: 'Unlimited', off: 'Off',
    full: 'Full Screen', windowed: 'Windowed', borderless: 'Borderless', fitWindow: 'Window size',
    logout: 'Logout', logoutD: 'Log out and return to the title.',
    toTitle: 'Go to Title Menu', toTitleD: 'Exiting game and returning to the title menu.', titleBtn: 'Title Menu',
    exit: 'Exit', exitD: 'Exiting game.',
    reset: 'Delete play data', resetD: 'Deletes the nickname, look, partner slime and quest progress on this browser.',   // web only
    resetBtn: 'Delete', resetAsk: 'Delete all play data on this browser and start over?',
    toTitleAsk: 'Returning to the title screen.',              // Common.GoToTitle
    exitNote: 'The web version cannot close the browser tab.',  // web only
  },
  vi: {
    touch: 'Chạm Để Bắt Đầu',
    loadingRes: 'Đang tải tài nguyên',
    version: 'version : 1.1.0(5)',
    nickTitle: 'Cài Đặt Biệt Danh',                            // [LOC]
    nickContent: 'Vui lòng nhập biệt danh.',                   // [LOC]
    nickHolder: 'Tối đa {Length} ký tự',                       // [LOC]
    nickFixed: 'Bạn sẽ không thể thay đổi sau này.',           // [LOC]
    nickConfirm: 'Bắt đầu với tên này?',                       // [LOC]
    nickEmpty: 'Không thể sử dụng biệt danh này.',             // [LOC]
    registered: 'Đăng ký thành công!',                         // [LOC]
    done: 'Xong', notice: 'Thông Báo', cancel: 'Hủy', confirm: 'Xác Nhận', random: 'Ngẫu Nhiên', skip: 'Bỏ Qua', yes: 'Có',   // [LOC] trừ "Xong", "Thông Báo"
    gender: 'Giới Tính', skin: 'Da', hair: 'Tóc', hairColor: 'Màu Tóc', face: 'Khuôn Mặt', lens: 'Mắt', acc: 'Phụ Kiện',   // [LOC]
    lookConfirm: 'Lưu diện mạo này? Sau khi xác nhận, bạn sẽ không thể thay đổi diện mạo.',   // [LOC]
    pickSelect: 'Chọn cái này nhé?',                           // [LOC]
    pickChange: 'Cùng xem những túi khác nữa nào.',            // [LOC]
    settings: 'Cài Đặt', catGraphic: 'Đồ Họa', catVolume: 'Âm Lượng', catAccount: 'Tài Khoản',   // [LOC]
    secSettings: 'Cài Đặt', secResolution: 'Độ Phân Giải', secGame: 'Trò Chơi',
    gq: 'Chất Lượng Đồ Họa', gqD: 'Tự động áp dụng thiết lập cấu hình sẵn.',                     // [LOC]
    fps: 'FPS Tối Đa', fpsD: 'Một số tùy chọn có thể không khả dụng trên thiết bị của bạn.',      // [LOC]
    screen: 'Chế Độ Màn Hình', screenD: 'Thay đổi chế độ hiển thị.',                              // [LOC]
    res: 'Đặt Độ Phân Giải', resD: 'Thay đổi độ phân giải trò chơi.',                             // [LOC]
    shadow: 'Chất Lượng Đổ Bóng', shadowD: 'Điều chỉnh độ sắc của bóng. Tắt đi giúp tăng hiệu năng đáng kể.',   // [LOC]
    cam: 'Tỷ Lệ Camera', camD: 'Điều chỉnh tỉ lệ kết xuất của camera game.',                     // [LOC]
    master: 'Âm Lượng Chính', masterD: 'Điều chỉnh âm lượng tổng của trò chơi.',                 // [LOC]
    bgm: 'Âm Lượng Nhạc Nền', bgmD: 'Điều chỉnh âm lượng nhạc nền tạo không khí cho trò chơi.',  // [LOC]
    sfx: 'Âm Lượng Hiệu Ứng', sfxD: 'Điều chỉnh âm lượng hiệu ứng âm thanh.',                    // [LOC]
    veryLow: 'Rất Thấp', low: 'Thấp', medium: 'Trung Bình', high: 'Cao', veryHigh: 'Rất Cao', unlimited: 'Không Giới Hạn', off: 'Tắt',   // [LOC]
    full: 'Toàn Màn Hình', windowed: 'Cửa Sổ', borderless: 'Không Viền', fitWindow: 'Theo cửa sổ',   // [LOC] trừ "Theo cửa sổ"
    logout: 'Đăng Xuất', logoutD: 'Đăng xuất và về màn hình chính.',                              // [LOC]
    toTitle: 'Về Màn Hình Chính', toTitleD: 'Thoát trò chơi và về menu chính.', titleBtn: 'Màn Hình Chính',   // [LOC]
    exit: 'Thoát', exitD: 'Thoát trò chơi.',                                                     // [LOC]
    reset: 'Xoá dữ liệu chơi', resetD: 'Xoá biệt danh, diện mạo, slime đồng hành và tiến trình nhiệm vụ lưu trên trình duyệt này.',
    resetBtn: 'Xoá', resetAsk: 'Xoá toàn bộ dữ liệu chơi trên trình duyệt này và chơi lại từ đầu?',
    toTitleAsk: 'Quay lại màn hình tiêu đề.',                  // [LOC]
    exitNote: 'Bản web không tự đóng được thẻ trình duyệt.',
  },
};

export function L(key, args) {
  let s = (TEXT[LANG] && TEXT[LANG][key]) ?? TEXT.en[key] ?? key;
  if (args) for (const [k, v] of Object.entries(args)) s = s.split('{' + k + '}').join(String(v));
  return s;
}
