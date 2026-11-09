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
