// Một chuyến lặn: chọn chủ đề, ghép các tầng A → B → C khớp miệng nối, xếp chồng thành một trục dọc,
// và tính ánh sáng/sương theo độ sâu từ số liệu gốc của từng tầng.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, ZONES = window.HX_ZONES;

  // Chủ đề = các tầng sẽ ghép + biến thể ánh sáng gốc (GlobalAmbientController _Evening/_Rain…) + đèn đội đầu.
  // glow: độ sáng tấm nền phía mặt nước; dim: nhân ánh sáng môi trường (cảnh đêm gốc mượn bộ màu Evening).
  // Mỗi lượt lặn đổi sang chủ đề khác lượt trước.
  var THEMES = {
    day: { name: 'Hố Xanh', sub: 'Ban ngày', layers: [{ area: 'A', skip: ['A06'] }, { area: 'B' }, { area: 'C' }] },
    kelp: { name: 'Rừng tảo', sub: 'Ban ngày', layers: [{ ids: ['A06'] }, { area: 'B' }, { area: 'C' }] },
    evening: { name: 'Hố Xanh', sub: 'Chiều tà', variant: 'Evening', glow: 0.7, layers: [{ area: 'A' }, { area: 'B' }, { area: 'C' }] },
    rain: { name: 'Hố Xanh', sub: 'Trời mưa', variant: 'Rain', glow: 0.5, layers: [{ area: 'A' }, { area: 'B' }, { area: 'C' }] },
    night: { name: 'Lặn đêm', sub: 'Đèn đội đầu', night: true, glow: 0.08, dim: 0.55, layers: [{ area: 'A', night: true }, { area: 'B', night: true }] },
  };

  var AREA_NAME = { A: 'Vùng nông', B: 'Tầng giữa', C: 'Vực sâu' };

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  function candidates(spec, prev) {
    return Object.keys(ZONES).map(function (id) { return ZONES[id]; }).filter(function (z) {
      if (spec.ids) return spec.ids.indexOf(z.id) >= 0;
      if (z.area !== spec.area || !!z.night !== !!spec.night) return false;
      if (spec.skip && spec.skip.indexOf(z.id) >= 0) return false;
      return !prev || z.top === prev.bottom;
    });
  }

  // Danh sách mã tầng cho một chủ đề. force: mã tầng trên cùng (?map=A01) hoặc cả lộ trình (?route=A03,B04,C04).
  // avoid: lộ trình lượt trước; tầng nào còn lựa chọn khác thì không lặp lại bản đồ cũ.
  function plan(themeId, rnd, force, avoid) {
    var th = THEMES[themeId], out = [], prev = null;
    if (force && force.length > 1) return force.filter(function (id) { return ZONES[id]; });
    for (var i = 0; i < th.layers.length; i++) {
      var c = i === 0 && force && ZONES[force[0]] ? [ZONES[force[0]]] : candidates(th.layers[i], prev);
      if (!c.length) break;
      var fresh = avoid ? c.filter(function (z) { return avoid.indexOf(z.id) < 0; }) : c;
      prev = pick(fresh.length ? fresh : c, rnd);
      out.push(prev.id);
    }
    return out;
  }

  function nextTheme(last, rnd) {
    var ids = Object.keys(THEMES).filter(function (k) { return k !== last && plan(k, rnd).length; });
    return pick(ids, rnd);
  }

  // ---------- xếp chồng ----------
  // Tầng dưới đặt sao cho mép vào (y = entryY trong toạ độ riêng) chạm đáy tầng trên. Độ sâu hiển thị nội suy
  // theo dải mét của wiki cho từng vùng (nông 0–50, giữa 50–130, sâu 130–250).
  function Stack(ids, theme) {
    var layers = [], yTop = T.water.surfaceY;
    ids.forEach(function (id, i) {
      var z = ZONES[id], yOff = i === 0 ? 0 : yTop - T.dive.entryY;
      var yBot = z.bounds.minY + yOff, band = T.dive.bands[z.area];
      layers.push({
        i: i, id: id, zone: z, area: z.area, yOff: yOff, yTop: yTop, yBot: yBot, d0: band[0], d1: band[1],
        light: variantLight(z, theme.variant),
      });
      yTop = yBot;
    });
    this.layers = layers;
    this.theme = theme;
    this.minY = layers[layers.length - 1].yBot;
    this.walls = [];
    var self = this;
    layers.forEach(function (L) {
      L.zone.walls.forEach(function (p) { self.walls.push(p.map(function (q) { return [q[0], q[1] + L.yOff]; })); });
    });
  }

  function variantLight(z, v) {
    var lv = v && z.lightVariants && z.lightVariants[v];
    if (!lv) return z.light;
    return { fog: z.light.fog, ambient: lv.ambient || z.light.ambient, volume: lv.volume || z.light.volume, surfaceVolume: z.light.surfaceVolume };
  }

  Stack.prototype.layerAt = function (y) {
    for (var i = 0; i < this.layers.length; i++) if (y >= this.layers[i].yBot) return this.layers[i];
    return this.layers[this.layers.length - 1];
  };

  Stack.prototype.depth = function (y) {
    var L = this.layerAt(y);
    var k = Math.max(0, (L.yTop - y) / (L.yTop - L.yBot));
    return L.d0 + (L.d1 - L.d0) * k;
  };

  // ---------- ánh sáng ----------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(o, a, b, t) { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; }
  function curveAt(c, t) {
    if (!c || !c.length) return t;
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) {
      if (t <= c[i][0]) { var a = c[i - 1], b = c[i]; return lerp(a[1], b[1], (t - a[0]) / Math.max(1e-6, b[0] - a[0])); }
    }
    return c[c.length - 1][1];
  }

  function Env() {
    this.near = [0, 0, 0]; this.mid = [0, 0, 0]; this.far = [0, 0, 0];
    this.ambient = [0, 0, 0]; this.sun = [0, 0, 0];
    this.fogStart = 12; this.fogEnd = 56;
    this.exposure = 0; this.contrast = 0; this.saturation = 0; this.filter = [1, 1, 1];
    this.vigColor = [0, 0, 0]; this.vig = 0; this.vigCx = 0.5; this.vigCy = 0.5; this.chroma = 0;
    this.bloomThr = 1; this.bloom = 0; this.bloomTint = [1, 1, 1];
  }

  // Môi trường của một tầng tại độ cao y (toạ độ thế giới).
  Env.prototype.fromLayer = function (L, y) {
    var A = L.light.ambient, F = L.light.fog, yz = y - L.yOff;
    var t = curveAt(A.curve, Math.min(1, Math.max(0, (A.y0 - yz) / (A.y0 - A.y1))));
    lerp3(this.near, A.fog0, A.fog1, t);
    // multiFog tắt (mọi cảnh gốc) thì sương một màu; mid/far khi đó chỉ là giá trị mặc định
    if (A.multiFog) { lerp3(this.mid, A.mid0, A.mid1, t); lerp3(this.far, A.far0, A.far1, t); }
    else { lerp3(this.mid, this.near, this.near, 0); lerp3(this.far, this.near, this.near, 0); }
    this.fogStart = F.start; this.fogEnd = F.end;
    this.ambient = A.ambient.slice();
    this.sun = A.dir.slice();
    var k = A.dirIntensity == null ? 1 : A.dirIntensity;
    this.sun[0] *= k; this.sun[1] *= k; this.sun[2] *= k;
    this.volume(L.light.volume);
    return this;
  };

  Env.prototype.volume = function (V) {
    if (!V) return;
    var C = V.color || {}, G = V.vignette || {};
    this.exposure = C.exposure || 0; this.contrast = C.contrast || 0; this.saturation = C.saturation || 0;
    this.filter = (C.filter || [1, 1, 1]).slice();
    this.vigColor = (G.color || [0, 0, 0]).slice(); this.vig = G.intensity || 0;
    this.vigCx = G.center ? G.center[0] : 0.5; this.vigCy = G.center ? G.center[1] : 0.5;
    this.chroma = V.chroma || 0;
    var B = V.bloom || {};
    this.bloomThr = B.threshold == null ? 0.9 : B.threshold; this.bloom = (B.intensity || 0) * T.dive.bloomScale; this.bloomTint = (B.tint || [1, 1, 1]).slice();
  };

  var FIELDS3 = ['near', 'mid', 'far', 'ambient', 'sun', 'filter', 'vigColor', 'bloomTint'];
  var FIELDS1 = ['fogStart', 'fogEnd', 'exposure', 'contrast', 'saturation', 'vig', 'vigCx', 'vigCy', 'chroma', 'bloomThr', 'bloom'];
  Env.prototype.mix = function (o, t) {
    var self = this;
    FIELDS3.forEach(function (f) { lerp3(self[f], self[f], o[f], t); });
    FIELDS1.forEach(function (f) { self[f] = lerp(self[f], o[f], t); });
    return this;
  };

  var envA = new Env(), envB = new Env();
  // Gần ranh giới hai tầng thì trộn dần môi trường tầng dưới vào để khỏi đổi màu cái rụp.
  Stack.prototype.envAt = function (y, out) {
    var L = this.layerAt(y), next = this.layers[L.i + 1];
    out.fromLayer(L, y);
    if (next && y - L.yBot < T.dive.blend) out.mix(envB.fromLayer(next, L.yBot), 1 - (y - L.yBot) / T.dive.blend);
    var prev = this.layers[L.i - 1];
    if (prev && L.yTop - y < T.dive.blend) out.mix(envB.fromLayer(prev, L.yTop), 0.5 * (1 - (L.yTop - y) / T.dive.blend));
    // gần mặt nước (tầng trên cùng) dùng hồ sơ Surface: sáng và rực hơn
    var sv = this.layers[0].light.surfaceVolume;
    if (L.i === 0 && sv) {
      var k = 1 - Math.min(1, Math.max(0, (T.water.surfaceY - y) / T.dive.surfaceBlend));
      if (k > 0) { envA.fromLayer(L, y); envA.volume(sv); out.mix(envA, k); }
    }
    return out;
  };

  HX.dive = { THEMES: THEMES, AREA_NAME: AREA_NAME, plan: plan, nextTheme: nextTheme, Stack: Stack, Env: Env };
})(window.HX = window.HX || {});
