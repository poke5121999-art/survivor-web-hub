/*
 * Bản PC tải về (trang downloads.html). Mỗi dòng là một file zip trên GitHub Releases của repo
 * công khai poke5121999-art/hub-downloads, một tag cho mỗi bản build.
 *
 *   game:     id trong data/games.js (lấy tên, ảnh, màu)
 *   platform: "windows-x64"
 *   version:  commit / build id của bản đó
 *   url:      link tải thẳng file zip (releases/download/<tag>/<file>)
 *   bytes:    kích thước file zip
 *   sha256:   để người tải tự kiểm file
 *   date:     ngày phát hành (YYYY-MM-DD)
 *   note:     { vi, en } một câu: bản này là gì, chạy thế nào
 *
 * Bản mới của cùng game: thêm dòng lên trên, giữ dòng cũ (trang hiện bản mới nhất trước).
 */
window.HUB_DOWNLOADS = [
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.535",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.535/BooHaul-Android-0.2.535-ecf45464.apk",
    bytes: 150180688,
    sha256: "eba5101174bcce38bd127ad8e093824015463f0d69eee95deb710d9dd26aa1dc",
    date: "2026-11-13",
    note: {
      vi: "Boo Haul 0.2.535 cho Android (commit ecf45464), chơi trên server LIVE. Sửa vọng tiếng mình khi tạo/vào phòng mà mic đã bật sẵn. Cài đè lên bản cũ.",
      en: "Boo Haul 0.2.535 for Android (commit ecf45464), plays on the LIVE server. Fixes hearing your own voice echo when you create or join a room with the mic already on. Installs over the old version."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.532",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.532/BooHaul-Android-0.2.532-a0da3a64.apk",
    bytes: 150176592,
    sha256: "a77b7aa0215a5d413fab341bdaf4fe25097d063439d15f61dbae985c70e2f21f",
    date: "2026-11-13",
    note: {
      vi: "Boo Haul 0.2.532 cho Android (commit a0da3a64), chơi trên server LIVE. Voice hết tự nghe tiếng mình khi bật/tắt, co-op vào trận hết văng (sửa gốc), Vô Tận chơi tiếp giữ hành trang, bot né làn đạn/cú húc/tự gỡ kẹt/cứu đồng đội, chữ dễ đọc hơn + Giảm chớp sáng/Độ sáng, mượt hơn (ít khựng). Cài đè lên bản cũ.",
      en: "Boo Haul 0.2.532 for Android (commit a0da3a64), plays on the LIVE server. Voice no longer echoes after toggling, co-op match start crash fixed at the root, Endless continue keeps your kit, bots dodge firing lanes and charges, unstick themselves and rescue teammates, easier-to-read text + Reduce flashes/Brightness, smoother play (fewer hitches). Installs over the old version."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.430",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.430/BooHaul-Android-0.2.430-f9ef8aa6.apk",
    bytes: 150070096,
    sha256: "f6b16b9e94601cf94f999b875064dee967d3c5eeb710e1062860bb02da339241",
    date: "2026-11-12",
    note: {
      vi: "Boo Haul 0.2.430 cho Android (commit f9ef8aa6), chơi trên server LIVE. LIVE 0.2.430: co-op vào trận hết văng, voice không thu tiếng game, giọng bot Alba (EN) + bong bóng đúng ngôn ngữ, hết thân đỏ, vampire giằng thoát + hết giật, Joker dịch chuyển, quái tự thoát kẹt, bot tự chia vai. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.430 for Android (commit f9ef8aa6), on the LIVE server. LIVE 0.2.430: co-op no longer kicks you out when entering a match, voice no longer picks up game sound, bot voice Alba (EN) plus speech bubbles in the right language, red-body bug gone, vampire grab can be broken free of and no longer jitters, Joker teleports, foes get themselves unstuck, bots split roles on their own. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.333",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.333/BooHaul-Android-0.2.333-92fac172.apk",
    bytes: 147998519,
    sha256: "5849962a85f07bf41ceae9b3428f61e574e3cb2b599f54c83f14a0142c970e9b",
    date: "2026-11-12",
    note: {
      vi: "Boo Haul 0.2.333 cho Android (commit 92fac172), chơi trên server LIVE. LIVE 0.2.333: voice EOS hết rè + khử vọng, TTS to hơn, iPhone không còn bị rút app khi vuốt cạnh dưới, giá loot trên bệ ẩn, màn hình không tự tắt. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.333 for Android (commit 92fac172), on the LIVE server. LIVE 0.2.333: EOS voice no longer crackles plus echo cancellation, louder TTS, iPhone no longer pulls the app away when swiping the bottom edge, loot prices on pads hidden, screen no longer turns off on its own. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.298",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.298/BooHaul-Android-0.2.298-a35c1124.apk",
    bytes: 147401779,
    sha256: "f2d2b0a76f284776acfbd95d4622de4602140486fdfa2bffc777c4a4be5bec19",
    date: "2026-11-12",
    note: {
      vi: "Boo Haul 0.2.298 cho Android, cùng bản gửi lên store (commit a35c1124), chơi trên server LIVE. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.298 for Android, the same build sent to the stores (commit a35c1124), on the LIVE server. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.336 DEV",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.336/BooHaul-Android-0.2.336-adb2de14.apk",
    bytes: 147142008,
    sha256: "6500f5ce080d502c0e9fbc65d064e9403e669604f5485dfdc86bc3ef9be90f65",
    date: "2026-11-12",
    note: {
      vi: "Boo Haul DEV 0.2.336 cho Android (commit adb2de14 = dev c487b269), chơi trên server DEV, cài song song với bản LIVE (tên Boo Haul DEV). Có bot chia vai, cửa mới + kết giới khoá, két, minimap mới, xà beng phá khoá, bom x2.",
      en: "Boo Haul DEV 0.2.336 for Android (commit adb2de14 = dev c487b269), on the DEV server, installs next to the LIVE app (named Boo Haul DEV). Bot roles, new doors with lock barrier, safe, new minimap, crowbar pries locks, bombs x2."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.145",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.145/BooHaul-Android-0.2.145-6a19e2d7.apk",
    bytes: 145694501,
    sha256: "fd015c17cceb014f1c49a65698b82b29e1a0c77f519891a1abbaa405799e6e1b",
    date: "2026-11-11",
    note: {
      vi: "Boo Haul 0.2.145 cho Android, cùng bản gửi lên store (commit 6a19e2d7), chơi trên server LIVE. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.145 for Android, the same build sent to the stores (commit 6a19e2d7), on the LIVE server. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.105",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.105/BooHaul-Android-0.2.105-8c7a290a.apk",
    bytes: 144588222,
    sha256: "216ba8ab00c478fd28ca123884f81e6ad21d19e46565c431ff55fb9502086c70",
    date: "2026-11-10",
    note: {
      vi: "Boo Haul 0.2.105 cho Android, cùng bản gửi lên store (commit 8c7a290a), chơi trên server LIVE. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.105 for Android, the same build sent to the stores (commit 8c7a290a), on the LIVE server. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "repo2d-unity",
    platform: "android",
    version: "0.2.3",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/boohaul-android-0.2.3/BooHaul-Android-0.2.3-15bf71ff.apk",
    bytes: 144457056,
    sha256: "61dfb35322d55252042d54c1731dad91d869498e020106c77404fd39f5e502c6",
    date: "2026-11-09",
    note: {
      vi: "Boo Haul 0.2.3 cho Android, cùng bản đã gửi lên store (commit 15bf71ff), chơi trên server LIVE. Tải file .apk về điện thoại, mở ra rồi cho phép cài từ nguồn ngoài.",
      en: "Boo Haul 0.2.3 for Android, the same build sent to the stores (commit 15bf71ff), on the LIVE server. Download the .apk on your phone, open it and allow installing from unknown sources."
    }
  },
  {
    game: "walking-trade-bevy",
    platform: "windows-x64",
    version: "af4d473",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/walkingtrade-bevy-af4d473/TheWalkingTrade-Bevy-Windows-x64-af4d473.zip",
    bytes: 640276522,
    sha256: "cc5415fdc284a91a57d2b62970cc9258ea107f515e72ff7af8bbaf7576f46361",
    date: "2026-11-07",
    note: {
      vi: "Bản Bevy cho Windows 64-bit (master f7661f3). Giải nén cả thư mục, chạy TheWalkingTrade.exe. Cần card đồ hoạ hỗ trợ Vulkan hoặc DirectX 12.",
      en: "The Bevy port for Windows 64-bit (master f7661f3). Unzip the whole folder and run TheWalkingTrade.exe. Needs a graphics card with Vulkan or DirectX 12."
    }
  },
  {
    game: "voiddiver",
    platform: "windows-x64",
    version: "0.0.0.135-win1",
    url: "https://github.com/poke5121999-art/hub-downloads/releases/download/voiddiver-0.0.0.135-win1/VoidDiver-Windows-x64-0.0.0.135-win1.zip",
    bytes: 574275022,
    sha256: "9e3ec9e6cda6af458169b816393d1d77a444aaba5582aebff1c4fc89d13d67fb",
    date: "2026-11-05",
    note: {
      vi: "Bản chơi offline, không cần Steam (Unity 6000.3.18f1, Mono). Giải nén, chạy VoidDiver\\VoidDiver.exe. Save nằm trong VoidDiver\\SavesDir cạnh exe.",
      en: "Offline build, no Steam needed (Unity 6000.3.18f1, Mono). Unzip and run VoidDiver\\VoidDiver.exe. Saves go to VoidDiver\\SavesDir next to the exe."
    }
  }
];
