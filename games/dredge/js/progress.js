/*
 * Tiến trình cốt truyện chạy theo ngày (W0, WORLD-GAPS.md §0).
 *
 * AberrationEnabler.cs:17-24: nghe GameEvents.OnDayChanged(newDay); khi newDay >= GameConfigData.AberrationStartDay - 1
 * (GameConfigDataProd.asset: aberrationStartDay 5 → ngày 4) thì SaveData.CanCatchAberrations = true ("can-catch-aberrations")
 * rồi thôi nghe.
 * Đánh số ngày: TimeController.cs:209-219, Day = floor(timeAndDay); ván mới bắt đầu ở time 0,25001 (SaveDataTemplate) = Day 0,
 * HUD hiện "Ngày 1" (DayLabel.cs:18: Day + 1). Cờ bật lúc time chạm 4,0 (nửa đêm vào "Ngày 5"); cả Day 3 (Ngày 4) vẫn chưa.
 * TimeController._lastDay về 0 mỗi lần vào cảnh, nên tải sổ đã qua Day 4 thì khung đầu báo DayChanged(Day) và cờ bật ngay.
 * Sự kiện ngày lấy từ js/sky.js: DR.emit('dayChanged', day).
 *
 *   DRProgress.aberrationDay   ngày (Day, đếm từ 0) bật cờ = aberrationStartDay - 1
 */
(function (root) {
  'use strict';
  const D = root.DR;
  const CFG = root.DR_CONFIG || {};
  const START = (CFG.aberrationStartDay == null ? 5 : CFG.aberrationStartDay) - 1;   // GameConfigDataProd.asset: aberrationStartDay 5

  function onDayChanged(newDay) {
    const s = D.s;
    if (!s || !s.vars || s.vars['can-catch-aberrations']) return;
    if (newDay >= START) {
      s.vars['can-catch-aberrations'] = true;   // SaveData.CanCatchAberrations
      D.emit('canCatchAberrations', newDay);    // cho ai cần biết (không có ở bản gốc; chỉ báo)
    }
  }
  if (D && D.on) D.on('dayChanged', onDayChanged);

  root.DRProgress = { aberrationDay: START };
})(window);
