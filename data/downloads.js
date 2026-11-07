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
