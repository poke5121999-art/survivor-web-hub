/*
 * Hub language: UI strings, tag translations and the viewer's chosen language (window.HubI18n).
 * Loaded in <head> so <html lang> is right before first paint. A game's own copy lives in
 * data/games.js: tagline/desc are Vietnamese, `en: { tagline, desc }` is English.
 * The choice is a per-viewer convenience in localStorage; Vietnamese is the default.
 */
(function () {
  "use strict";

  var KEY = "hub.lang";
  var LANGS = { vi: "Tiếng Việt", en: "English" };

  var STRINGS = {
    vi: {
      "subtitle": "{0} game chơi ngay trên trình duyệt. Không cài đặt, không quảng cáo.",
      "subtitle.idle": "Chơi ngay trên trình duyệt. Không cài đặt, không quảng cáo.",
      "filter.label": "Lọc theo thể loại",
      "filter.all": "Tất cả",
      "grid.label": "Danh sách game",
      "lang.label": "Ngôn ngữ",
      "genre.hanh-dong": "Hành động",
      "genre.kinh-di": "Kinh dị",
      "genre.nhap-vai": "Nhập vai",
      "genre.chien-thuat": "Chiến thuật",
      "genre.thu-gian": "Thư giãn",
      "genre.khac": "Công cụ & bản thử",
      "card.about": "Giới thiệu",
      "card.aboutAria": "Giới thiệu {0}",
      "card.new": "Mới cập nhật",
      "card.lastPlayed": "Chơi lần cuối {0}",
      "hero.updated": "✨ Vừa cập nhật",
      "play": "▶ Chơi ngay",
      "playAria": "Chơi {0}",
      "close": "Đóng",
      "empty.title": "Chưa có game nào",
      "empty.hint": "Thêm game bằng cách sửa data/games.js.",
      "ago.now": "vừa xong",
      "ago.min": "{0} phút trước",
      "ago.hour": "{0} giờ trước",
      "ago.day": "{0} ngày trước",
      "ago.month": "{0} tháng trước",
      "ago.year": "{0} năm trước",
      "account.guest": "Khách",
      "account.player": "Người chơi",
      "account.guestRole": "Khách — lưu cục bộ",
      "account.memberRole": "Đã đăng nhập",
      "account.signIn": "Đăng nhập",
      "account.signOut": "Đăng xuất",
      "account.rename": "Đổi tên hiển thị",
      "account.renamePrompt": "Tên hiển thị mới:",
      "account.unreachable": "Không kết nối được dịch vụ tài khoản. Thử lại sau.",
      "footer.text": "Mọi game chạy ngay trong trình duyệt của bạn. Tiến độ lưu trên máy, hoặc theo tài khoản nếu đã đăng nhập.",
      "refresh.button": "↻ Tải lại bản mới",
      "refresh.note": "Bản game trên máy chủ đổi rồi mà trong máy vẫn là bản cũ? Bấm nút này. Nó nạp lại toàn bộ file của hub và của từng game — <b>không đụng vào tiến độ chơi đã lưu</b>.",
      "refresh.file": "Đang mở bằng file:// — không có cache của máy chủ để dọn. Nạp lại trang…",
      "refresh.loading": "Đang nạp lại {0} file…",
      "refresh.games": "Đang nạp lại thêm {0} file của các game…",
      "refresh.done": "Xong — đã nạp lại {0} file. Đang khởi động lại…",
      "refresh.failed": "Không nạp lại được ({0}). Thử lại, hoặc tắt hẳn tab rồi mở lại. ",
      "refresh.network": "lỗi mạng",
      "feedback.link": "🐞 Báo lỗi / góp ý"
    },
    en: {
      "subtitle": "{0} games to play right in your browser. No installs, no ads.",
      "subtitle.idle": "Play right in your browser. No installs, no ads.",
      "filter.label": "Filter by genre",
      "filter.all": "All",
      "grid.label": "Games",
      "lang.label": "Language",
      "genre.hanh-dong": "Action",
      "genre.kinh-di": "Horror",
      "genre.nhap-vai": "RPG",
      "genre.chien-thuat": "Strategy",
      "genre.thu-gian": "Chill",
      "genre.khac": "Tools & prototypes",
      "card.about": "About",
      "card.aboutAria": "About {0}",
      "card.new": "Updated",
      "card.lastPlayed": "Last played {0}",
      "hero.updated": "✨ Just updated",
      "play": "▶ Play now",
      "playAria": "Play {0}",
      "close": "Close",
      "empty.title": "No games yet",
      "empty.hint": "Add one by editing data/games.js.",
      "ago.now": "just now",
      "ago.min": "{0} min ago",
      "ago.hour": "{0} h ago",
      "ago.day": "{0} days ago",
      "ago.month": "{0} months ago",
      "ago.year": "{0} years ago",
      "account.guest": "Guest",
      "account.player": "Player",
      "account.guestRole": "Guest — saved on this device",
      "account.memberRole": "Signed in",
      "account.signIn": "Sign in",
      "account.signOut": "Sign out",
      "account.rename": "Change display name",
      "account.renamePrompt": "New display name:",
      "account.unreachable": "Can't reach the account service. Try again later.",
      "footer.text": "Every game runs right in your browser. Progress is saved on this device, or to your account when signed in.",
      "refresh.button": "↻ Get the latest version",
      "refresh.note": "The server has a new build but your browser still runs the old one? Press this. It reloads every file of the hub and of each game — <b>your saved progress is untouched</b>.",
      "refresh.file": "Opened via file:// — there is no server cache to clear. Reloading the page…",
      "refresh.loading": "Reloading {0} files…",
      "refresh.games": "Reloading {0} more game files…",
      "refresh.done": "Done — reloaded {0} files. Restarting…",
      "refresh.failed": "Reload failed ({0}). Try again, or close the tab and reopen it. ",
      "refresh.network": "network error",
      "feedback.link": "🐞 Report a bug / feedback"
    }
  };

  // Tags not listed here are names (Pokémon, Unity, MMORPG…) and show as written.
  var TAGS_EN = {
    "Bắn súng": "Shooter", "Săn quái": "Monster hunting", "Một ngón": "One finger", "Tự bắn": "Auto-shooter",
    "Thủ thành": "Tower defense", "Đánh trùm": "Boss fights", "Cày quái": "Grinding", "Kinh dị": "Horror",
    "Sinh tồn": "Survival", "Nông trại": "Farming", "Bắt quái": "Monster catching", "Khám phá": "Exploration",
    "Mô phỏng": "Simulation", "Chiến thuật": "Strategy", "Hành động": "Action", "Dây chuyền": "Production line",
    "Dựng thử": "Prototype", "Màn dọc": "Portrait", "Một tay": "One-handed", "Ghép ô": "Merge", "Theo lượt": "Turn-based",
    "Nhìn từ trên xuống": "Top-down", "Màn ngang": "Landscape", "Viễn Tây": "Wild West", "Đào hầm": "Digging",
    "Triệu hồi": "Summoning", "Quản lý": "Management", "Nuôi quân": "Team building", "Bảng xếp hạng": "Leaderboard",
    "Thư giãn": "Chill", "Lái thuyền": "Boating", "Câu cá": "Fishing", "Ngày đêm": "Day & night", "Lặn biển": "Diving",
    "Bắt cá": "Fish catching", "Súng xiên": "Harpoon", "Lái cano": "Speedboat", "Quán sushi": "Sushi bar",
    "Nâng cấp": "Upgrades", "Kéo đồ": "Hauling", "Kiểu REPO": "REPO-like", "Nhập vai": "RPG", "Bắt Pokémon": "Catch Pokémon",
    "Đấu theo lượt": "Turn-based battles", "Đi theo ô": "Grid movement", "Đánh boss": "Boss raids", "Chợ trời": "Marketplace",
    "Hầm ngục": "Dungeon", "Tự ngắm": "Auto-aim", "Nhập vai hành động": "Action RPG", "Nhặt đồ": "Looting",
    "Công cụ": "Tool", "Gia phả": "Family tree", "Ghi chú": "Notes", "Tài liệu": "Documents", "Kéo thả": "Drag & drop",
    "Trốn tìm": "Hide & seek", "Bo co dần": "Shrinking zone", "Thế giới mở": "Open world", "Xếp khoang": "Cargo packing",
    "Đối kháng": "PvP", "Cá mập": "Sharks", "Đèn pin": "Flashlight"
  };

  function read() {
    try { var v = localStorage.getItem(KEY); return LANGS[v] ? v : "vi"; } catch (e) { return "vi"; }
  }

  var current = read();
  document.documentElement.lang = current;

  function t(key) {
    var s = STRINGS[current][key];
    if (s == null) s = STRINGS.vi[key];
    if (s == null) return key;
    var args = arguments;
    return s.replace(/\{(\d)\}/g, function (_, i) { return args[+i + 1]; });
  }

  window.HubI18n = {
    LANGS: LANGS,
    lang: function () { return current; },
    set: function (lang) {
      if (!LANGS[lang]) return;
      current = lang;
      document.documentElement.lang = lang;
      try { localStorage.setItem(KEY, lang); } catch (e) { /* storage blocked: choice lasts this page only */ }
    },
    t: t,
    tag: function (tag) { return current === "en" ? (TAGS_EN[tag] || tag) : tag; },
    hasTag: function (tag) { return Object.prototype.hasOwnProperty.call(TAGS_EN, tag); },
    // A game's own copy in the current language, falling back to Vietnamese.
    copy: function (game, field) { return (current !== "vi" && game[current] && game[current][field]) || game[field]; }
  };
})();
