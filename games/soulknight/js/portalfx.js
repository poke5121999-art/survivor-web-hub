// Xoáy của cổng: chạy lại hai shader gốc của transfer_gate ("Sprites/Soul Knight Portal" cho vòng ngoài, "Sprites/SoulKnightPortal"
// cho xoáy trong) bằng một lượt WebGL ra canvas phụ rồi dán vào canvas game. Mã fragment, số của vật liệu và texture
// (NoiseTexture, Gradient*, portal_*mask, portal_outlight) lấy từ bundle bởi tools/vfx/build_portal.py -> data/sk-portal.js;
// mã GLSL ES 1.0 là chính shader gốc, không viết lại.
// [ƯỚC LƯỢNG] Blend One OneMinusSrcAlpha (sprite có trước alpha: canvas dán kênh đã nhân alpha); _Time.y = giờ của hiệu ứng;
// UV 0..1 phủ trọn quad UISprite (texture chính trắng).
(function () {
  'use strict';
  const SK = window.SK = window.SK || {};
  const P = window.SK_PORTAL;
  if (!P) return;
  const VS = 'attribute vec2 p; uniform vec4 col; varying mediump vec4 vs_COLOR0; varying highp vec2 vs_TEXCOORD0;' +
    'void main(){ gl_Position = vec4(p, 0.0, 1.0); vs_COLOR0 = col; vs_TEXCOORD0 = p * 0.5 + 0.5; }';
  // [ƯỚC LƯỢNG] Cỡ quad UISprite thật không đọc được (khung trắng 3 px của vfx chỉ gần đúng): thu 0,55 để cổng cao ~2,3 lần
  // nhân vật như ảnh chụp bản gốc (bản vẽ đầy cỡ cao ~4 lần).
  const SWIRL_SCALE = 0.55;
  const SIZE = { outer: [192, 280], inner: [168, 228] };   // đúng tỉ lệ 30:44 và 14:19 của hai quad
  const imgs = {};
  let loaded = 0, total = Object.keys(P.textures).length;
  for (const n in P.textures) {
    const im = imgs[n] = new Image();
    im.onload = () => { loaded++; };
    im.src = 'art/vfx/portal/' + n + '.png';
  }
  const passes = {};

  function make(kind) {
    const cv = document.createElement('canvas');
    cv.width = SIZE[kind][0]; cv.height = SIZE[kind][1];
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return { fail: true };
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, P.passes[kind].frag));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const o = { cv, gl, pr, tex: {}, units: [] };
    const mk = (img, wrap) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // dòng trên của ảnh = v 1 như Unity
      if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      const w = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    o.units.push(['_MainTex', mk(null, 'clamp')]);
    for (const [prop, name] of Object.entries(P.passes[kind].tex)) o.units.push([prop, mk(imgs[name], P.textures[name].wrap)]);
    return o;
  }

  function render(kind, t, col) {
    const o = passes[kind] || (passes[kind] = make(kind));
    if (o.fail) return null;
    const gl = o.gl, def = P.passes[kind];
    gl.viewport(0, 0, o.cv.width, o.cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(o.pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    o.units.forEach(([prop, tx], i) => {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx);
      const u = gl.getUniformLocation(o.pr, prop); if (u) gl.uniform1i(u, i);
    });
    const set1 = (n, v) => { const u = gl.getUniformLocation(o.pr, n); if (u) gl.uniform1f(u, v); };
    const set4 = (n, v) => { const u = gl.getUniformLocation(o.pr, n); if (u) gl.uniform4f(u, v[0], v[1], v[2], v[3]); };
    for (const k in def.floats) set1(k, def.floats[k]);
    set4('_BGColor', def.colors._BGColor || [0, 0, 0, 0]);
    set4('_Time', [t / 20, t, t * 2, t * 3]);
    // vs_COLOR0 = màu đỉnh (SpriteRenderer.color) × _Color × _RendererColor
    const m = def.colors._Color || [1, 1, 1, 1];
    set4('col', [col[0] * m[0], col[1] * m[1], col[2] * m[2], col[3] * m[3]]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return o.cv;
  }

  // Móc cho SK.vfx: nd.custom(ctx, x, y, w, h, instance, node) vẽ trong toạ độ khung của quad UISprite.
  SK.portalFx = {
    ready: () => loaded >= total,
    quad: kind => (ctx, x, y, w, h, inst, nd) => {
      if (loaded < total) return;
      let cv;
      try { cv = render(kind, inst.t, nd.col); } catch (e) { if (SK.warnOnce) SK.warnOnce('portalfx', 'portal shader: ' + e.message); passes[kind] = { fail: true }; return; }
      if (!cv) return;
      ctx.imageSmoothingEnabled = true;
      const s = SWIRL_SCALE;
      ctx.drawImage(cv, x + w * (1 - s) / 2, y + h * (1 - s) / 2, w * s, h * s);
    }
  };
})();
