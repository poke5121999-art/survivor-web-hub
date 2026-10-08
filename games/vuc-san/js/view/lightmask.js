// Lớp vẽ: mặt nạ ánh sáng kiểu R.E.P.O. Mỗi khung vẽ vùng thấy được của đội người xem (VS.sim.visionPolys) lên một
// canvas 1/4 độ phân giải màn hình, mép mềm, nón đèn mờ dần theo khoảng cách; pass chỉnh màu cuối (gfx.js) nhân màu
// cảnh với mix(dark, 1, R) và ám ấm theo G.
// Kênh R = sáng (vùng thấy được), kênh G = phần thuộc nón đèn pin. Các vùng cộng dồn (globalCompositeOperation 'lighter').
(function (VS) {
  'use strict';
  var DIV = 4;           // canvas = màn hình / 4
  var BLUR = 1.6;        // px của canvas mặt nạ (≈ 6 px màn hình)

  function isBeam(p) { return p.kind === 'beam' || p.kind === 'cone' || p.kind === 'lamp' || p.kind === 'flashlight'; }

  function LightMask(gfx) {
    this.gfx = gfx;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.blur = 'filter' in this.ctx;
    this.count = 0;
    this.resize();
  }
  LightMask.prototype.resize = function () {
    var w = Math.max(8, Math.ceil(window.innerWidth / DIV)), h = Math.max(8, Math.ceil(window.innerHeight / DIV));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      // đổi cỡ canvas thì ảnh GPU cũ sai cỡ: tạo lại
      this.tex.dispose();
    }
    this.w = w; this.h = h;
  };

  // Ma trận thế giới (mặt z = 0) → điểm ảnh canvas mặt nạ, theo camera phối cảnh nhìn thẳng −z của gfx.
  LightMask.prototype.transform = function () {
    var cam = this.gfx.camera, D = cam.position.z, hh = Math.tan(cam.fov * Math.PI / 360) * D, hw = hh * cam.aspect;
    var kx = this.w / (2 * hw), ky = this.h / (2 * hh);
    return [kx, 0, 0, -ky, this.w / 2 - cam.position.x * kx, this.h / 2 + cam.position.y * ky];
  };

  // polys: [{ kind, x, y, r, pts: [x0, y0, x1, y1, ...] }]; halos: [{ x, y, r, k }] (quầng nhỏ quanh đối thủ đang thấy).
  LightMask.prototype.draw = function (polys, halos) {
    var cx = this.ctx, w = this.w, h = this.h;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalCompositeOperation = 'source-over';
    if (this.blur) cx.filter = 'none';
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, w, h);
    var m = this.transform();
    cx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    cx.globalCompositeOperation = 'lighter';
    if (this.blur) cx.filter = 'blur(' + BLUR + 'px)';
    var n = 0;
    for (var i = 0; i < (polys || []).length; i++) {
      var p = polys[i], pts = p.pts;
      if (!pts || pts.length < 6 || !(p.r > 0)) continue;
      var beam = isBeam(p), g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r), col = beam ? '255,255,0' : '255,0,0';
      if (beam) {
        // nón đèn: sáng gần như đều tới ba phần năm tầm rồi nhạt dần, tắt ở cuối tầm
        g.addColorStop(0, 'rgba(' + col + ',1)'); g.addColorStop(0.55, 'rgba(' + col + ',0.95)');
        g.addColorStop(0.82, 'rgba(' + col + ',0.6)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      } else {
        g.addColorStop(0, 'rgba(' + col + ',1)'); g.addColorStop(0.6, 'rgba(' + col + ',0.88)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      }
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(pts[0], pts[1]);
      for (var k = 2; k + 1 < pts.length; k += 2) cx.lineTo(pts[k], pts[k + 1]);
      cx.closePath();
      cx.fill();
      n++;
    }
    for (var j = 0; j < (halos || []).length; j++) {
      var q = halos[j], gh = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
      gh.addColorStop(0, 'rgba(255,0,0,' + q.k + ')'); gh.addColorStop(1, 'rgba(255,0,0,0)');
      cx.fillStyle = gh;
      cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, Math.PI * 2); cx.fill();
    }
    this.count = n;
    this.tex.needsUpdate = true;
  };

  // Độ sáng mặt nạ (0..1, kênh R) tại điểm màn hình (px CSS), cho kiểm và gỡ lỗi.
  LightMask.prototype.at = function (sx, sy) {
    var x = Math.max(0, Math.min(this.w - 1, Math.floor(sx / DIV))), y = Math.max(0, Math.min(this.h - 1, Math.floor(sy / DIV)));
    var d = this.ctx.getImageData(x, y, 1, 1).data;
    return { lit: d[0] / 255, beam: d[1] / 255 };
  };

  LightMask.prototype.dispose = function () { this.tex.dispose(); this.canvas.width = this.canvas.height = 0; };

  VS.LightMask = LightMask;
  VS.LightMask.isBeam = isBeam;
})(window.VS = window.VS || {});
