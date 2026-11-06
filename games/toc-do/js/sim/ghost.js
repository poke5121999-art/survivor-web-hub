// Bóng kỷ lục: ghi đường chạy của người chơi 10 lần/giây rồi phát lại (Thách Đấu Ảo Ảnh). Thuần JS.
//   rec = { v:1, track, car, drv, hz, time (giây về đích, null khi chưa xong), n (số mẫu), d: [x,y,z,yaw,tiến độ] × n phẳng, đã lượng tử }
//   var rec = TD.Ghost.create(trackId, carId, driverId);  TD.Ghost.push(rec, t, kart);  TD.Ghost.finish(rec, time);
//   TD.Ghost.sample(rec, t) → { x, y, z, yaw }   nội suy giữa hai mẫu, quá cuối thì giữ mẫu cuối
//   TD.Ghost.timeAt(rec, progress) → giây mà bóng đạt tiến độ (m) đó; so với giờ của mình ra khoảng cách +/- giây
//   TD.Ghost.encode(rec) / decode(text) → chuỗi JSON gọn (lưu localStorage) / rec hợp lệ hoặc null
(function (G) {
  var TD = G.TD = G.TD || {};
  var HZ = 10;
  // chọn: vị trí 5 cm, góc 0,01 rad, tiến độ 0,1 m. Đủ khít để nội suy 10 Hz không giật, 3 vòng ≈ 40 KB.
  var QP = 20, QY = 100, QS = 10;

  function create(trackId, carId, driverId) {
    return { v: 1, track: trackId, car: carId || null, drv: driverId || null, hz: HZ, time: null, n: 0, d: [] };
  }

  // Điền các mẫu còn thiếu tới thời điểm t (giây kể từ GO); khung trễ thì lặp mẫu cuối để mốc thời gian luôn đều 1/hz.
  function push(rec, t, k) {
    var want = Math.floor(t * rec.hz) + 1;
    while (rec.n < want) {
      rec.d.push(Math.round(k.x * QP), Math.round(k.y * QP), Math.round(k.z * QP), Math.round(k.yaw * QY), Math.round((k.progress || 0) * QS));
      rec.n++;
    }
  }

  function finish(rec, time) { rec.time = time; return rec; }

  function wrap(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function sample(rec, t, out) {
    out = out || {};
    if (!rec.n) { out.x = out.y = out.z = out.yaw = 0; return out; }
    var f = Math.max(0, t * rec.hz), i = Math.min(rec.n - 1, Math.floor(f)), j = Math.min(rec.n - 1, i + 1), u = Math.min(1, f - i), d = rec.d;
    var a = i * 5, b = j * 5;
    out.x = (d[a] + (d[b] - d[a]) * u) / QP;
    out.y = (d[a + 1] + (d[b + 1] - d[a + 1]) * u) / QP;
    out.z = (d[a + 2] + (d[b + 2] - d[a + 2]) * u) / QP;
    out.yaw = d[a + 3] / QY + wrap((d[b + 3] - d[a + 3]) / QY) * u;
    return out;
  }

  // Tiến độ của bóng tăng đơn điệu (hồi sinh làm tụt tiến độ: lấy cummax) để tìm nhị phân.
  function timeAt(rec, progress) {
    if (!rec.n) return 0;
    if (!rec._pm) {
      rec._pm = new Array(rec.n);
      var m = -1e9;
      for (var q = 0; q < rec.n; q++) { m = Math.max(m, rec.d[q * 5 + 4] / QS); rec._pm[q] = m; }
    }
    var pm = rec._pm;
    if (progress <= pm[0]) return 0;
    if (progress >= pm[rec.n - 1]) return (rec.n - 1) / rec.hz;
    var lo = 0, hi = rec.n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pm[mid] <= progress) lo = mid; else hi = mid; }
    var span = pm[hi] - pm[lo];
    return (lo + (span > 0 ? (progress - pm[lo]) / span : 0)) / rec.hz;
  }

  function encode(rec) {
    return JSON.stringify({ v: rec.v, track: rec.track, car: rec.car, drv: rec.drv, hz: rec.hz, time: rec.time, n: rec.n, d: rec.d });
  }

  function decode(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || o.v !== 1 || !(o.hz > 0) || !Array.isArray(o.d) || o.d.length !== o.n * 5 || !(o.n > 1) || typeof o.time !== 'number') return null;
    return o;
  }

  TD.Ghost = { HZ: HZ, create: create, push: push, finish: finish, sample: sample, timeAt: timeAt, encode: encode, decode: decode };
})(typeof window !== 'undefined' ? window : globalThis);
