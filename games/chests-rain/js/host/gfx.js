"use strict";
// WebGL2 port of Arrowstorm.Gfx + Arrowstorm.Atlas (Unity batch renderer).
// Shader math is translated from the shipped D3D11 bytecode of Hidden/Arrowstorm/{Canvas,Blur,PostFx}.
// Render targets keep row 0 = canvas y 0 (top), matching how the Unity shaders address them.
//
// Texture objects handled here: { $gl: WebGLTexture, width, height } (atlas pages, standalone images, RTs).
// Foreign textures (e.g. a $x.Texture2D shim) are accepted when they carry CPU data:
//   { width, height, data: Uint8Array|Uint32Array, format (Unity TextureFormat: 63 = R8, else RGBA32),
//     filterMode (0 point, else bilinear), wrapMode (0 repeat, else clamp), version? }
// The GL copy is cached on the object as $gl / $glVersion.

const GFX_VS_CANVAS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec2 aUv;
uniform vec2 uTarget;
out vec2 vUv;
out vec2 vPos;
out vec4 vCol;
void main() {
  gl_Position = vec4(aPos / uTarget * 2.0 - 1.0, 0.5, 1.0);
  vUv = aUv;
  vPos = aPos;
  vCol = aCol;
}`;

const GFX_GRAD_GLSL = `
uniform int uGradMode;
uniform vec4 uGradA;
uniform vec4 uGradB;
uniform float uStopT[8];
uniform vec4 uStopC[8];
uniform float uStopN;
float gradT(vec2 pos) {
  vec2 p = pos * uGradB.xy + uGradB.zw;
  if (uGradMode < 2) {
    vec2 d = uGradA.zw - uGradA.xy;
    float l2 = dot(d, d);
    return l2 > 0.0 ? dot(p - uGradA.xy, d) / l2 : 0.0;
  }
  return uGradA.z != uGradA.w ? (length(p - uGradA.xy) - uGradA.z) / (uGradA.w - uGradA.z) : 0.0;
}
vec4 gradStop(float t) {
  if (t <= uStopT[0]) return uStopC[0];
  int n = int(uStopN);
  vec4 c = uStopC[max(n - 1, 0)];
  for (int i = 0; i < 7; i++) {
    if (i + 1 < n) {
      float a = uStopT[i], b = uStopT[i + 1];
      if (t == b) c = uStopC[i + 1];
      if (t < b && t > a) c = mix(uStopC[i], uStopC[i + 1], (t - a) / (b - a));
    }
  }
  return c;
}`;

const GFX_FS_CANVAS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform int uMul;
in vec2 vUv;
in vec2 vPos;
in vec4 vCol;
out vec4 o;
${GFX_GRAD_GLSL}
float dither(vec2 pos) {
  ivec2 q = ivec2(floor(pos));
  int x = q.x, y = q.y;
  int n = ((y & 1) << 5) | ((x & 1) << 4) | ((y & 2) << 2) | ((x & 2) << 1) | ((y & 4) >> 1) | ((x & 4) >> 2);
  float v = float(n < 32 ? 4 * n + 2 : 4 * n + 1);
  return (v * 0.003921569 - 0.5) * 0.003921569;
}
void main() {
  vec4 c;
  if (uGradMode > 0) {
    c = gradStop(gradT(vPos));
    c.rgb *= c.a;
    c *= vCol.a;
    c.rgb = min(vec3(c.a), max(c.rgb + dither(vPos), 0.0));
    c *= vCol.r;
  } else {
    c = texture(uTex, vUv) * vCol;
  }
  o = uMul == 1 ? vec4(c.rgb + (1.0 - c.a), 1.0) : c;
}`;

const GFX_FS_BACKDROP = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uDst;
uniform int uMode;
in vec2 vUv;
in vec2 vPos;
in vec4 vCol;
out vec4 o;
float softC(float s, float sa, float d, float da) {
  if (2.0 * s <= sa) return d * d * (sa - 2.0 * s) / da + (1.0 - da) * s + d * (-sa + 2.0 * s + 1.0);
  if (4.0 * d <= da) {
    float d2 = d * d, d3 = d2 * d, a2 = da * da, a3 = a2 * da;
    return (a2 * (s - d * (3.0 * sa - 6.0 * s - 1.0)) + 12.0 * da * d2 * (sa - 2.0 * s) - 16.0 * d3 * (sa - 2.0 * s) - a3 * s) / a2;
  }
  return d * (sa - 2.0 * s + 1.0) + s - sqrt(da * d) * (sa - 2.0 * s) - da * s;
}
vec3 setLum(vec3 c, float alpha, vec3 l) {
  float lum = dot(vec3(0.3, 0.59, 0.11), l);
  c += lum - dot(vec3(0.3, 0.59, 0.11), c);
  float mn = min(c.r, min(c.g, c.b));
  float mx = max(c.r, max(c.g, c.b));
  if (mn < 0.0 && lum != mn) c = lum + (c - lum) * (lum / (lum - mn + 6.1035e-05));
  if (mx > alpha && mx != lum) c = lum + (c - lum) * (alpha - lum) / (mx - lum + 6.1035e-05);
  return c;
}
void main() {
  vec4 d = texelFetch(uDst, ivec2(floor(vPos)), 0);
  vec4 s = vCol;
  vec4 r;
  if (uMode == 3) {
    if (d.a == 0.0) r = s;
    else r = vec4(softC(s.r, s.a, d.r, d.a), softC(s.g, s.a, d.g, d.a), softC(s.b, s.a, d.b, d.a), s.a + (1.0 - s.a) * d.a);
  } else if (uMode == 4) {
    vec3 c = setLum(s.rgb * d.a, d.a * s.a, d.rgb * s.a);
    r = vec4(c + d.rgb - d.rgb * s.a + s.rgb - s.rgb * d.a, s.a + d.a - d.a * s.a);
  } else {
    r = vec4(s.rgb * (1.0 - d.a) + d.rgb * (1.0 - s.a) + s.rgb * d.rgb, s.a + (1.0 - s.a) * d.a);
  }
  o = vUv.x * r + (1.0 - vUv.x) * d;
}`;

const GFX_FS_YUV = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uUTex;
uniform sampler2D uVTex;
in vec2 vUv;
in vec4 vCol;
out vec4 o;
void main() {
  float y = (texture(uTex, vUv).r * 255.0 - 16.0) * 0.00456621;
  float u = texture(uUTex, vUv).r * 255.0 - 128.0;
  float v = texture(uVTex, vUv).r * 255.0 - 128.0;
  vec3 c = clamp(vec3(y + v * 0.006258929, y - u * 0.001536321 - v * 0.003188107, y + u * 0.007910714), 0.0, 1.0);
  o = vec4(c, 1.0) * vCol;
}`;

const GFX_FS_BLUR = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform vec4 uBlurDir;
uniform float uBlurW[9];
uniform vec2 uTarget;
in vec2 vPos;
out vec4 o;
vec4 tap(ivec2 p, ivec2 size) {
  return (p.x < 0 || p.y < 0 || p.x >= size.x || p.y >= size.y) ? vec4(0.0) : texelFetch(uTex, p, 0);
}
void main() {
  ivec2 p = ivec2(floor(vPos));
  ivec2 d = ivec2(uBlurDir.xy);
  ivec2 size = ivec2(uTarget);
  vec4 acc = tap(p, size) * uBlurW[0];
  for (int i = 1; i <= 8; i++) acc += (tap(p + d * i, size) + tap(p - d * i, size)) * uBlurW[i];
  o = acc;
}`;

// HUD coverage passes of Hidden/Arrowstorm/PostFx (0,1,5,6,7,8,9).
const GFX_FS_HUD = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform int uHudPass;
in vec2 vUv;
in vec2 vPos;
in vec4 vCol;
out vec4 o;
${GFX_GRAD_GLSL}
void main() {
  if (uHudPass == 0) { o = vec4(texture(uTex, vUv).a * vCol.a); return; }
  if (uHudPass == 1) { o = vec4(vCol.a); return; }
  if (uHudPass == 5) {
    vec4 t = texture(uTex, vUv);
    o = vec4(t.rgb * vCol.rgb + (1.0 - t.a * vCol.a), 1.0);
    return;
  }
  if (uHudPass == 6) { o = vec4(vCol.r * vCol.a * gradStop(gradT(vPos)).a); return; }
  if (uHudPass == 7) {
    vec4 c = gradStop(gradT(vPos));
    float k = vCol.r * vCol.a;
    o = vec4(c.rgb * c.a * k + (1.0 - c.a * k), 1.0);
    return;
  }
  if (uHudPass == 8) { o = vec4(vUv.x * (vCol.rgb + (1.0 - vCol.a) - 1.0) + 1.0, 1.0); return; }
  o = vec4(vUv.x * vCol.a);
}`;

const GFX_VS_UNIT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() { gl_Position = vec4(aPos * 2.0 - 1.0, 0.5, 1.0); vUv = aPos; }`;

const GFX_FS_PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 o;
void main() {
  ivec2 s = textureSize(uTex, 0);
  ivec2 p = clamp(ivec2(floor(vec2(vUv.x, 1.0 - vUv.y) * vec2(s))), ivec2(0), s - 1);
  o = vec4(texelFetch(uTex, p, 0).rgb, 1.0);
}`;

class Atlas$Page {
  constructor() {
    this.tex = null;
    this.x = 1;
    this.y = 1;
    this.rowH = 0;
    this.dirty = false;
    this.applied = false;
  }
}

class Atlas$Entry {
  constructor() {
    this.page = null;
    this.tex = null;
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.version = 0;
    this.transient = false;
    this.epoch = -1;
  }
}

class Atlas {
  static Init() {
    Atlas.pages = [];
    Atlas.sharedPages = [];
    Atlas.transientPages = [];
    Atlas.transientCur = 0;
    Atlas.transientEpoch = 0;
    Atlas.standalone = [];
    Atlas.transientStandalone = [];
    Atlas.released = [];
    const page = Atlas.NewPage(false);
    const white = new Uint8Array(4 * 4 * 4).fill(255);
    const gl = Gfx._gl;
    gl.bindTexture(gl.TEXTURE_2D, page.tex.$gl);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 1, 1, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, white);
    page.x = 6;
    page.rowH = 4;
    page.applied = true;
  }

  static Shutdown() {
    if (!Atlas.pages) return;
    for (const p of Atlas.pages) Gfx._deleteTex(p.tex);
    for (const t of Atlas.standalone) Gfx._deleteTex(t);
    for (const t of Atlas.transientStandalone) Gfx._deleteTex(t);
    for (const t of Atlas.released) Gfx._deleteTex(t);
    Atlas.pages = Atlas.sharedPages = Atlas.transientPages = null;
    Atlas.standalone = Atlas.transientStandalone = Atlas.released = null;
    Atlas.transientCur = 0;
  }

  static NewPage(transient) {
    const page = new Atlas$Page();
    page.tex = Gfx._newTex(2048, 2048, false, false, "Arrowstorm Atlas " + Atlas.pages.length + (transient ? " (per map)" : ""));
    Atlas.pages.push(page);
    if (transient) {
      Atlas.transientPages.push(page);
      Atlas.transientCur = Atlas.transientPages.length - 1;
    } else {
      Atlas.sharedPages.push(page);
    }
    return page;
  }

  static White(u, v) {
    u.v = 0.0014648438;
    v.v = 0.0014648438;
    return Atlas.pages[0].tex;
  }

  static BeginFrame() {
    for (const t of Atlas.released) Gfx._deleteTex(t);
    Atlas.released.length = 0;
  }

  static Release(img) {
    if (img == null) return;
    const e = img.gpu;
    if (e instanceof Atlas$Entry) {
      if (e.tex != null) {
        if (!Atlas._remove(Atlas.standalone, e.tex)) Atlas._remove(Atlas.transientStandalone, e.tex);
        Atlas.released.push(e.tex);
        e.tex = null;
      }
      img.gpu = null;
    }
    const e2 = img.gpuSmooth;
    if (e2 instanceof Atlas$Entry) {
      if (e2.tex != null) {
        Atlas._remove(Atlas.standalone, e2.tex);
        Atlas.released.push(e2.tex);
        e2.tex = null;
      }
      img.gpuSmooth = null;
    }
  }

  static _remove(list, item) {
    const i = list.indexOf(item);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  static MarkTransient(img) {
    if (img != null && img.gpu == null) {
      const e = new Atlas$Entry();
      e.w = img.width;
      e.h = img.height;
      e.version = -1;
      e.transient = true;
      e.epoch = -1;
      img.gpu = e;
    }
  }

  static ReleaseTransient() {
    Atlas.transientEpoch++;
    for (const page of Atlas.transientPages) {
      page.x = 1;
      page.y = 1;
      page.rowH = 0;
    }
    Atlas.transientCur = 0;
    for (const t of Atlas.transientStandalone) Atlas.released.push(t);
    Atlas.transientStandalone.length = 0;
  }

  static _atlasable(img, w, h) {
    return !img.smooth && !img.dynamic && !img.repeat && !img.releaseCpuAfterUpload && w <= 512 && h <= 512;
  }

  static PlaceTransient(img, e) {
    e.epoch = Atlas.transientEpoch;
    e.version = -1;
    e.page = null;
    e.tex = null;
    if (Atlas._atlasable(img, e.w, e.h)) {
      let page = Atlas.transientCur < Atlas.transientPages.length ? Atlas.transientPages[Atlas.transientCur] : Atlas.NewPage(true);
      if (page.x + e.w + 1 > 2048) {
        page.x = 1;
        page.y += page.rowH + 1;
        page.rowH = 0;
      }
      if (page.y + e.h + 1 > 2048) {
        Atlas.transientCur++;
        page = Atlas.transientCur < Atlas.transientPages.length ? Atlas.transientPages[Atlas.transientCur] : Atlas.NewPage(true);
      }
      e.page = page;
      e.x = page.x;
      e.y = page.y;
      page.x += e.w + 1;
      if (e.h > page.rowH) page.rowH = e.h;
    } else {
      e.tex = Gfx._newTex(e.w, e.h, img.smooth, img.repeat, "Arrowstorm Img (per map)");
      Atlas.transientStandalone.push(e.tex);
    }
  }

  static Flush() {}

  static Ensure(img, uOff, vOff, uScale, vScale) {
    let e = img.gpu;
    if (!(e instanceof Atlas$Entry)) {
      e = new Atlas$Entry();
      e.w = img.width;
      e.h = img.height;
      e.version = -1;
      img.gpu = e;
      if (Atlas._atlasable(img, img.width, img.height)) {
        Atlas.Place(e);
      } else {
        e.tex = Gfx._newTex(img.width, img.height, img.smooth, img.repeat, "Arrowstorm Img");
        Atlas.standalone.push(e.tex);
      }
    } else if (e.transient && e.epoch !== Atlas.transientEpoch) {
      Atlas.PlaceTransient(img, e);
    }
    if (e.version !== img.version && img.px != null) Atlas.Upload(img, e);
    if (e.page != null) {
      uOff.v = e.x / 2048;
      vOff.v = e.y / 2048;
      uScale.v = 0.00048828125;
      vScale.v = 0.00048828125;
      return e.page.tex;
    }
    uOff.v = 0;
    vOff.v = 0;
    uScale.v = Math.fround(1 / e.w);
    vScale.v = Math.fround(1 / e.h);
    return e.tex;
  }

  static EnsureSmooth(img, uOff, vOff, uScale, vScale) {
    if (img.smooth && !img.repeat) return Atlas.Ensure(img, uOff, vOff, uScale, vScale);
    let e = img.gpuSmooth;
    if (!(e instanceof Atlas$Entry)) {
      e = new Atlas$Entry();
      e.w = img.width;
      e.h = img.height;
      e.version = -1;
      img.gpuSmooth = e;
      e.tex = Gfx._newTex(img.width, img.height, true, false, "Arrowstorm Img (smooth)");
      Atlas.standalone.push(e.tex);
    }
    if (e.version !== img.version && img.px != null) {
      e.version = img.version;
      Gfx._upload(e.tex, 0, 0, e.w, e.h, img.px);
    }
    uOff.v = 0;
    vOff.v = 0;
    uScale.v = Math.fround(1 / e.w);
    vScale.v = Math.fround(1 / e.h);
    return e.tex;
  }

  static Place(e) {
    let page = Atlas.sharedPages[Atlas.sharedPages.length - 1];
    if (page.x + e.w + 1 > 2048) {
      page.x = 1;
      page.y += page.rowH + 1;
      page.rowH = 0;
    }
    if (page.y + e.h + 1 > 2048) page = Atlas.NewPage(false);
    e.page = page;
    e.x = page.x;
    e.y = page.y;
    page.x += e.w + 1;
    if (e.h > page.rowH) page.rowH = e.h;
  }

  static Upload(img, e) {
    e.version = img.version;
    if (e.page == null) {
      Gfx._upload(e.tex, 0, 0, e.w, e.h, img.px);
      if (img.releaseCpuAfterUpload) img.px = null;
      return;
    }
    Gfx._upload(e.page.tex, e.x, e.y, e.w, e.h, img.px);
  }
}

class Gfx {
  static Init() {
    if (Gfx._inited) return;
    Gfx._inited = true;
    if (!Gfx.canvas) {
      Gfx.canvas = document.createElement("canvas");
      Gfx.canvas.width = Gfx.TW;
      Gfx.canvas.height = Gfx.TH;
    }
    const gl = Gfx.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("Arrowstorm: WebGL2 context unavailable");
    Gfx._gl = gl;
    Gfx._halfRT = !!gl.getExtension("EXT_color_buffer_float");
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    Gfx._progCanvas = Gfx._program(GFX_VS_CANVAS, GFX_FS_CANVAS);
    Gfx._progBackdrop = Gfx._program(GFX_VS_CANVAS, GFX_FS_BACKDROP);
    Gfx._progYuv = Gfx._program(GFX_VS_CANVAS, GFX_FS_YUV);
    Gfx._progBlur = Gfx._program(GFX_VS_CANVAS, GFX_FS_BLUR);
    Gfx._progHud = Gfx._program(GFX_VS_CANVAS, GFX_FS_HUD);
    Gfx._progPresent = Gfx._program(GFX_VS_UNIT, GFX_FS_PRESENT);
    for (const p of [Gfx._progCanvas, Gfx._progBackdrop, Gfx._progYuv, Gfx._progBlur, Gfx._progHud]) {
      gl.useProgram(p.p);
      gl.uniform2f(p.u("uTarget"), Gfx.TW, Gfx.TH);
    }
    gl.useProgram(Gfx._progYuv.p);
    gl.uniform1i(Gfx._progYuv.u("uTex"), 0);
    gl.uniform1i(Gfx._progYuv.u("uUTex"), 1);
    gl.uniform1i(Gfx._progYuv.u("uVTex"), 2);

    Gfx.mainRT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm Main");
    Gfx.shadowRT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm Shadow");
    Gfx.tmpRT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm Tmp");
    Gfx.tmp2RT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm Tmp2");

    Gfx._vao = gl.createVertexArray();
    gl.bindVertexArray(Gfx._vao);
    Gfx._vbo = gl.createBuffer();
    Gfx._ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, Gfx._vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, Gfx._ibo);
    Gfx._attribs(32);
    Gfx._capQuads = 0;
    Gfx._vb = new Float32Array(0);
    Gfx._EnsureCapacity(8192);

    Gfx._fsVao = gl.createVertexArray();
    gl.bindVertexArray(Gfx._fsVao);
    const fsb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 1, 1, 1, 1, 0, 0,
      640, 0, 1, 1, 1, 1, 1, 0,
      640, 360, 1, 1, 1, 1, 1, 1,
      0, 0, 1, 1, 1, 1, 0, 0,
      640, 360, 1, 1, 1, 1, 1, 1,
      0, 360, 1, 1, 1, 1, 0, 1,
    ]), gl.STATIC_DRAW);
    Gfx._attribs(32);
    Gfx._fsBuf = fsb;

    Gfx._unitVao = gl.createVertexArray();
    gl.bindVertexArray(Gfx._unitVao);
    Gfx._unitBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, Gfx._unitBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    Gfx._blackTex = Gfx._newTex(1, 1, false, false, "black");
    Gfx._upload(Gfx._blackTex, 0, 0, 1, 1, new Uint32Array([0]));

    Gfx._ops = [];
    Gfx._nop = 0;
    Gfx._nq = 0;
    Gfx._snapOp = -1;
    Gfx._bloomSnapOp = -1;
    Gfx._hudOps = [];
    Gfx._lastSigma = -1;
    Gfx._blurW = new Float32Array(9);
    Gfx._stopT = new Float32Array(8);
    Gfx._stopC = new Float32Array(32);
    Atlas.Init();
  }

  static _attribs(stride) {
    const gl = Gfx._gl;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
  }

  static _program(vsSrc, fsSrc) {
    const gl = Gfx._gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Arrowstorm: shader compile failed: " + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Arrowstorm: shader link failed: " + gl.getProgramInfoLog(p));
    const cache = new Map();
    return {
      p,
      u(name) {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
        return cache.get(name);
      },
    };
  }

  static _newTex(w, h, smooth, repeat, name) {
    const gl = Gfx._gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const f = smooth ? gl.LINEAR : gl.NEAREST;
    const wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    return { $gl: t, width: w, height: h, name };
  }

  static _deleteTex(t) {
    if (t && t.$gl && Gfx._gl) Gfx._gl.deleteTexture(t.$gl);
    if (t) t.$gl = null;
  }

  static _upload(tex, x, y, w, h, px) {
    const gl = Gfx._gl;
    gl.bindTexture(gl.TEXTURE_2D, tex.$gl);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer, px.byteOffset, w * h * 4));
  }

  static _makeRT(w, h, half, linear, name) {
    const gl = Gfx._gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const useHalf = half && Gfx._halfRT;
    gl.texStorage2D(gl.TEXTURE_2D, 1, useHalf ? gl.RGBA16F : gl.RGBA8, w, h);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { $gl: t, fbo, width: w, height: h, half: useHalf, name };
  }

  static _killRT(rt) {
    if (!rt || !Gfx._gl) return;
    Gfx._gl.deleteFramebuffer(rt.fbo);
    Gfx._deleteTex(rt);
  }

  // Returns the GL texture behind a texture object (see header comment for foreign textures).
  static _resolve(t) {
    if (t == null) return Gfx._blackTex.$gl;
    if (t.$gl && t.$glVersion === undefined) return t.$gl;
    if (t.data && t.width && t.height) {
      const ver = t.version === undefined ? 0 : t.version;
      if (t.$gl && t.$glVersion === ver) return t.$gl;
      const gl = Gfx._gl;
      const r8 = t.format === 63;
      if (!t.$gl) {
        t.$gl = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t.$gl);
        gl.texStorage2D(gl.TEXTURE_2D, 1, r8 ? gl.R8 : gl.RGBA8, t.width, t.height);
        const f = t.filterMode ? gl.LINEAR : gl.NEAREST;
        const wr = t.wrapMode === 0 ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
      }
      gl.bindTexture(gl.TEXTURE_2D, t.$gl);
      const d = t.data;
      const bytes = new Uint8Array(d.buffer, d.byteOffset, t.width * t.height * (r8 ? 1 : 4));
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.width, t.height, r8 ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      t.$glVersion = ver;
      return t.$gl;
    }
    return t.$gl || Gfx._blackTex.$gl;
  }

  static Shutdown() {
    if (!Gfx._inited) return;
    Gfx._inited = false;
    const gl = Gfx._gl;
    for (const rt of [Gfx.mainRT, Gfx.shadowRT, Gfx.tmpRT, Gfx.tmp2RT, Gfx.worldRT, Gfx.hudRT, Gfx.bloomSrcRT]) Gfx._killRT(rt);
    Gfx.mainRT = Gfx.shadowRT = Gfx.tmpRT = Gfx.tmp2RT = null;
    Gfx.worldRT = Gfx.hudRT = Gfx.bloomSrcRT = null;
    for (const p of [Gfx._progCanvas, Gfx._progBackdrop, Gfx._progYuv, Gfx._progBlur, Gfx._progHud, Gfx._progPresent]) gl.deleteProgram(p.p);
    gl.deleteBuffer(Gfx._vbo);
    gl.deleteBuffer(Gfx._ibo);
    gl.deleteBuffer(Gfx._fsBuf);
    gl.deleteBuffer(Gfx._unitBuf);
    gl.deleteVertexArray(Gfx._vao);
    gl.deleteVertexArray(Gfx._fsVao);
    gl.deleteVertexArray(Gfx._unitVao);
    Gfx._deleteTex(Gfx._blackTex);
    Gfx._hudMatTried = false;
    Gfx._hasHud = false;
    Gfx.bloomSrcValid = Gfx.hudValid = Gfx.worldValid = false;
    Atlas.Shutdown();
  }

  static _EnsureCapacity(quads) {
    if (quads <= Gfx._capQuads) return;
    const n = Math.max(Gfx._capQuads * 2, quads);
    Gfx._capQuads = n;
    const vb = new Float32Array(n * 32);
    vb.set(Gfx._vb);
    Gfx._vb = vb;
    const gl = Gfx._gl;
    gl.bindVertexArray(Gfx._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, Gfx._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vb.byteLength, gl.DYNAMIC_DRAW);
    const idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2;
      idx[k + 3] = v + 2; idx[k + 4] = v + 3; idx[k + 5] = v;
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  static BeginFrame() {
    Gfx._nq = 0;
    Gfx._nop = 0;
    Gfx._snapOp = -1;
    Gfx._bloomSnapOp = -1;
    Gfx.bloomSrcValid = Gfx.hudValid = Gfx.worldValid = false;
    Atlas.BeginFrame();
  }

  static _NewOp(kind) {
    if (Gfx._nop === Gfx._ops.length) Gfx._ops.push({});
    const op = Gfx._ops[Gfx._nop++];
    op.kind = kind;
    op.target = 0; op.pass = 0; op.q0 = 0; op.qn = 0; op.sub = 0;
    op.tex = op.tex2 = op.tex3 = null;
    op.color = null; op.src = op.dst = null;
    op.dir = null; op.grad = null; op.gradA = null; op.gradB = null;
    return op;
  }

  static _vtx(q, x0, y0, x1, y1, u0, v0, u1, v1, r, g, b, a) {
    const vb = Gfx._vb;
    let k = q * 32;
    vb[k++] = x0; vb[k++] = y0; vb[k++] = r; vb[k++] = g; vb[k++] = b; vb[k++] = a; vb[k++] = u0; vb[k++] = v0;
    vb[k++] = x1; vb[k++] = y0; vb[k++] = r; vb[k++] = g; vb[k++] = b; vb[k++] = a; vb[k++] = u1; vb[k++] = v0;
    vb[k++] = x1; vb[k++] = y1; vb[k++] = r; vb[k++] = g; vb[k++] = b; vb[k++] = a; vb[k++] = u1; vb[k++] = v1;
    vb[k++] = x0; vb[k++] = y1; vb[k++] = r; vb[k++] = g; vb[k++] = b; vb[k++] = a; vb[k++] = u0; vb[k++] = v1;
  }

  static Quad(target, tex, pass, x0, y0, x1, y1, u0, v0, u1, v1, r, g, b, a) {
    if (Gfx._nq >= Gfx._capQuads) Gfx._EnsureCapacity(Gfx._nq + 1);
    const last = Gfx._nop > 0 ? Gfx._ops[Gfx._nop - 1] : null;
    if (last && last.kind === Gfx$OpKind.Batch && last.target === target && last.tex === tex && last.pass === pass) {
      last.qn++;
    } else {
      const op = Gfx._NewOp(Gfx$OpKind.Batch);
      op.target = target; op.tex = tex; op.pass = pass; op.q0 = Gfx._nq; op.qn = 1;
    }
    Gfx._vtx(Gfx._nq, x0, y0, x1, y1, u0, v0, u1, v1, r, g, b, a);
    Gfx._nq++;
  }

  static QuadYuv(target, ty, tu, tv, x0, y0, x1, y1, u0, v0, u1, v1, a) {
    if (Gfx._nq >= Gfx._capQuads) Gfx._EnsureCapacity(Gfx._nq + 1);
    const last = Gfx._nop > 0 ? Gfx._ops[Gfx._nop - 1] : null;
    if (last && last.kind === Gfx$OpKind.Batch && last.target === target && last.pass === 6 && last.tex === ty && last.tex2 === tu && last.tex3 === tv) {
      last.qn++;
    } else {
      const op = Gfx._NewOp(Gfx$OpKind.Batch);
      op.target = target; op.tex = ty; op.tex2 = tu; op.tex3 = tv; op.pass = 6; op.q0 = Gfx._nq; op.qn = 1;
    }
    Gfx._vtx(Gfx._nq, x0, y0, x1, y1, u0, v0, u1, v1, a, a, a, a);
    Gfx._nq++;
  }

  static BackdropQuad(pass, x0, y0, x1, y1, r, g, b, a, cov) {
    if (Gfx._nq >= Gfx._capQuads) Gfx._EnsureCapacity(Gfx._nq + 1);
    const op = Gfx._NewOp(Gfx$OpKind.Backdrop);
    op.target = 0; op.q0 = Gfx._nq; op.qn = 1; op.pass = pass;
    Gfx._vtx(Gfx._nq, x0, y0, x1, y1, cov, 0, cov, 0, r, g, b, a);
    Gfx._nq++;
  }

  static _v4Eq(a, b) {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2], dw = a[3] - b[3];
    return dx * dx + dy * dy + dz * dz + dw * dw < 9.999999e-11;
  }

  static GradientQuad(target, pass, x0, y0, x1, y1, pa, cov, g, ta, td, te, tf) {
    if (Gfx._nq >= Gfx._capQuads) Gfx._EnsureCapacity(Gfx._nq + 1);
    const f = Math.fround;
    const A = g.radial ? [f(g.x0), f(g.y0), f(g.r0), f(g.r1)] : [f(g.x0), f(g.y0), f(g.x1), f(g.y1)];
    const B = [f(1 / ta), f(1 / td), f(-te / ta), f(-tf / td)];
    const last = Gfx._nop > 0 ? Gfx._ops[Gfx._nop - 1] : null;
    if (last && last.kind === Gfx$OpKind.Gradient && last.target === target && last.pass === pass && last.grad === g && Gfx._v4Eq(last.gradA, A) && Gfx._v4Eq(last.gradB, B)) {
      last.qn++;
    } else {
      const op = Gfx._NewOp(Gfx$OpKind.Gradient);
      op.target = target; op.pass = pass; op.q0 = Gfx._nq; op.qn = 1; op.grad = g; op.gradA = A; op.gradB = B;
    }
    Gfx._vtx(Gfx._nq, x0, y0, x1, y1, 0, 0, 0, 0, cov, cov, cov, pa);
    Gfx._nq++;
  }

  static Clear(target, c) {
    const op = Gfx._NewOp(Gfx$OpKind.Clear);
    op.target = target;
    op.color = c;
  }

  static CompositeShadow(alpha, blurSigma) {
    const a = Math.fround(alpha);
    let tex = Gfx.shadowRT;
    if (blurSigma > 0) {
      const s = Math.fround(blurSigma);
      const b1 = Gfx._NewOp(Gfx$OpKind.Blur);
      b1.src = Gfx.shadowRT; b1.dst = Gfx.tmpRT; b1.dir = [1, 0, s, 0];
      const b2 = Gfx._NewOp(Gfx$OpKind.Blur);
      b2.src = Gfx.tmpRT; b2.dst = Gfx.tmp2RT; b2.dir = [0, 1, s, 0];
      tex = Gfx.tmp2RT;
    }
    Gfx.Quad(0, tex, 0, 0, 0, 640, 360, 0, 0, 1, 1, a, a, a, a);
  }

  static SnapshotWorld() {
    if (!Gfx._inited) return;
    if (Gfx.worldRT == null) Gfx.worldRT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm World");
    if (!Gfx._hudMatTried) {
      Gfx._hudMatTried = true;
      Gfx._hasHud = !!Gfx._progHud;
    }
    if (Gfx._hasHud && Gfx.hudRT == null) Gfx.hudRT = Gfx._makeRT(Gfx.TW, Gfx.TH, true, false, "Arrowstorm HUD Coverage");
    if (Gfx._snapOp >= 0 && Gfx._snapOp < Gfx._nop && Gfx._ops[Gfx._snapOp].kind === Gfx$OpKind.Snapshot) Gfx._ops[Gfx._snapOp].kind = Gfx$OpKind.Nop;
    Gfx._snapOp = Gfx._nop;
    Gfx._NewOp(Gfx$OpKind.Snapshot);
    Gfx.worldValid = true;
    Gfx.hudValid = Gfx._hasHud;
  }

  static SnapshotBloomSource() {
    if (!Gfx._inited) return;
    if (Gfx.bloomSrcRT == null) Gfx.bloomSrcRT = Gfx._makeRT(Gfx.TW, Gfx.TH, false, false, "Arrowstorm Bloom Source");
    if (Gfx._bloomSnapOp >= 0 && Gfx._bloomSnapOp < Gfx._nop && Gfx._ops[Gfx._bloomSnapOp].kind === Gfx$OpKind.BloomSnap) Gfx._ops[Gfx._bloomSnapOp].kind = Gfx$OpKind.Nop;
    Gfx._bloomSnapOp = Gfx._nop;
    Gfx._NewOp(Gfx$OpKind.BloomSnap);
    Gfx.bloomSrcValid = true;
  }

  static _RT(target) {
    return target !== 1 ? Gfx.mainRT : Gfx.shadowRT;
  }

  static _bind(rt) {
    const gl = Gfx._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null);
    if (rt) gl.viewport(0, 0, rt.width, rt.height);
    else gl.viewport(0, 0, Gfx.canvas.width, Gfx.canvas.height);
  }

  static _copy(src, dst) {
    const gl = Gfx._gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fbo);
    gl.blitFramebuffer(0, 0, src.width, src.height, 0, 0, dst.width, dst.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Unity blend modes per pass, as serialized in the shader assets.
  static _blendCanvas(pass) {
    const gl = Gfx._gl;
    if (pass >= 3 && pass <= 5) { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (pass === 1) gl.blendFunc(gl.ONE, gl.ONE);
    else if (pass === 2) gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  static _blendHud(pass) {
    const gl = Gfx._gl;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (pass === 5 || pass === 7 || pass === 8) gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
    else gl.blendFuncSeparate(gl.ZERO, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  static _tex(unit, t) {
    const gl = Gfx._gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, Gfx._resolve(t));
  }

  static _setGradient(prog, g, ga, gb) {
    const gl = Gfx._gl;
    const num = Math.min(8, g.StopCount);
    const T = Gfx._stopT, C = Gfx._stopC;
    for (let i = 0; i < 8; i++) {
      const i2 = Math.min(i, num - 1);
      let value = num > 0 ? g.StopOffset(i2) : 0;
      const c = num > 0 ? g.StopColor(i2) : null;
      if (i >= num) value = 2 + i;
      T[i] = value;
      C[i * 4] = c ? c.r / 255 : 0;
      C[i * 4 + 1] = c ? c.g / 255 : 0;
      C[i * 4 + 2] = c ? c.b / 255 : 0;
      C[i * 4 + 3] = c ? Gradient.StopAlpha(c) : 0;
    }
    gl.uniform1i(prog.u("uGradMode"), g.radial ? 2 : 1);
    gl.uniform4f(prog.u("uGradA"), ga[0], ga[1], ga[2], ga[3]);
    gl.uniform4f(prog.u("uGradB"), gb[0], gb[1], gb[2], gb[3]);
    gl.uniform1fv(prog.u("uStopT"), T);
    gl.uniform4fv(prog.u("uStopC"), C);
    gl.uniform1f(prog.u("uStopN"), num);
  }

  static _BlurWeights(sigma) {
    if (sigma === Gfx._lastSigma) return Gfx._blurW;
    Gfx._lastSigma = sigma;
    const n = Math.min(8, Math.ceil(Math.fround(sigma * 3)));
    let sum = 0;
    const w = new Array(9);
    for (let i = 0; i <= 8; i++) {
      w[i] = i <= n ? Math.exp(-(i * i) / (2 * sigma * sigma)) : 0;
      sum += i === 0 ? w[i] : 2 * w[i];
    }
    for (let j = 0; j <= 8; j++) Gfx._blurW[j] = w[j] / sum;
    return Gfx._blurW;
  }

  static _draw(op) {
    const gl = Gfx._gl;
    gl.drawElements(gl.TRIANGLES, op.qn * 6, gl.UNSIGNED_INT, op.q0 * 24);
  }

  static EndFrame() {
    Atlas.Flush();
    const gl = Gfx._gl;
    const nq = Gfx._nq, nop = Gfx._nop, ops = Gfx._ops;
    Gfx.quadsLastFrame = nq;
    gl.bindVertexArray(Gfx._vao);
    if (nq > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, Gfx._vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, Gfx._vb, 0, nq * 32);
    }
    const pc = Gfx._progCanvas, pb = Gfx._progBackdrop, py = Gfx._progYuv;
    let cur = -1, draws = 0, snapped = false, hudFull = false;
    Gfx._nHud = 0;
    for (let j = 0; j < nop; j++) {
      const op = ops[j];
      switch (op.kind) {
        case Gfx$OpKind.Clear: {
          Gfx._bind(Gfx._RT(op.target));
          cur = op.target;
          gl.clearColor(op.color.r, op.color.g, op.color.b, op.color.a);
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (snapped && op.target === 0) hudFull = true;
          break;
        }
        case Gfx$OpKind.Batch: {
          if (cur !== op.target) { Gfx._bind(Gfx._RT(op.target)); cur = op.target; }
          Gfx._blendCanvas(op.pass);
          if (op.pass === 6) {
            gl.useProgram(py.p);
            Gfx._tex(0, op.tex); Gfx._tex(1, op.tex2); Gfx._tex(2, op.tex3);
          } else {
            gl.useProgram(pc.p);
            gl.uniform1i(pc.u("uGradMode"), 0);
            gl.uniform1i(pc.u("uMul"), op.pass === 2 ? 1 : 0);
            Gfx._tex(0, op.tex);
          }
          Gfx._draw(op);
          draws++;
          if (snapped && op.target === 0 && op.pass !== 1) Gfx._hudOps[Gfx._nHud++] = j;
          break;
        }
        case Gfx$OpKind.Gradient: {
          if (cur !== op.target) { Gfx._bind(Gfx._RT(op.target)); cur = op.target; }
          Gfx._blendCanvas(op.pass);
          gl.useProgram(pc.p);
          gl.uniform1i(pc.u("uMul"), op.pass === 2 ? 1 : 0);
          Gfx._setGradient(pc, op.grad, op.gradA, op.gradB);
          Gfx._tex(0, Atlas.pages[0].tex);
          Gfx._draw(op);
          draws++;
          if (snapped && op.target === 0 && op.pass !== 1) Gfx._hudOps[Gfx._nHud++] = j;
          break;
        }
        case Gfx$OpKind.Backdrop: {
          Gfx._copy(Gfx.mainRT, Gfx.tmpRT);
          Gfx._bind(Gfx.mainRT);
          cur = 0;
          Gfx._blendCanvas(op.pass);
          gl.useProgram(pb.p);
          gl.uniform1i(pb.u("uMode"), op.pass);
          Gfx._tex(0, Gfx.tmpRT);
          Gfx._draw(op);
          draws++;
          if (snapped) Gfx._hudOps[Gfx._nHud++] = j;
          break;
        }
        case Gfx$OpKind.Snapshot:
          Gfx._copy(Gfx.mainRT, Gfx.worldRT);
          cur = -1;
          snapped = Gfx._hasHud;
          hudFull = false;
          Gfx._nHud = 0;
          break;
        case Gfx$OpKind.BloomSnap:
          Gfx._copy(Gfx.mainRT, Gfx.bloomSrcRT);
          cur = -1;
          break;
        case Gfx$OpKind.Blur: {
          Gfx._bind(op.dst);
          cur = -1;
          gl.disable(gl.BLEND);
          const p = Gfx._progBlur;
          gl.useProgram(p.p);
          Gfx._tex(0, op.src);
          gl.uniform4f(p.u("uBlurDir"), op.dir[0], op.dir[1], op.dir[2], op.dir[3]);
          gl.uniform1fv(p.u("uBlurW"), Gfx._BlurWeights(op.dir[2]));
          gl.bindVertexArray(Gfx._fsVao);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.bindVertexArray(Gfx._vao);
          draws++;
          break;
        }
      }
    }
    if (snapped) {
      Gfx._bind(Gfx.hudRT);
      if (hudFull) gl.clearColor(1, 1, 1, 1);
      else gl.clearColor(1, 1, 1, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!hudFull) {
        const ph = Gfx._progHud;
        gl.useProgram(ph.p);
        for (let k = 0; k < Gfx._nHud; k++) {
          const op = ops[Gfx._hudOps[k]];
          let sp;
          if (op.kind === Gfx$OpKind.Batch) {
            Gfx._tex(0, op.tex);
            sp = op.pass === 6 ? 1 : op.pass === 2 ? 5 : 0;
          } else if (op.kind === Gfx$OpKind.Gradient) {
            Gfx._setGradient(ph, op.grad, op.gradA, op.gradB);
            sp = op.pass === 2 ? 7 : 6;
          } else {
            sp = op.pass === 5 ? 8 : 9;
          }
          gl.uniform1i(ph.u("uHudPass"), sp);
          Gfx._blendHud(sp);
          Gfx._draw(op);
          draws++;
        }
      }
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    Gfx.drawsLastFrame = draws;
    Gfx._present();
  }

  // ArrowstormPresent: mainRT to the screen, alpha forced to 1. Its _Linearize branch only undoes the
  // sRGB backbuffer encode of a linear-space Unity build, so the browser path skips it.
  static _present() {
    const gl = Gfx._gl;
    Gfx._bind(null);
    gl.disable(gl.BLEND);
    gl.useProgram(Gfx._progPresent.p);
    Gfx._tex(0, Gfx.mainRT);
    Gfx._drawUnit();
  }

  static _drawUnit() {
    const gl = Gfx._gl;
    gl.bindVertexArray(Gfx._unitVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // Readback helper (tests, capture). Rows are returned with row 0 = top of the image.
  static ReadPixels(rt) {
    const gl = Gfx._gl;
    if (rt == null) {
      const w = Gfx.canvas.width, h = Gfx.canvas.height;
      const raw = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const out = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      return out;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    let out;
    if (rt.half) {
      out = new Float32Array(rt.width * rt.height * 4);
      gl.readPixels(0, 0, rt.width, rt.height, gl.RGBA, gl.FLOAT, out);
    } else {
      out = new Uint8Array(rt.width * rt.height * 4);
      gl.readPixels(0, 0, rt.width, rt.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  static Ensure(img, uOff, vOff, uScale, vScale) { return Atlas.Ensure(img, uOff, vOff, uScale, vScale); }
  static EnsureSmooth(img, uOff, vOff, uScale, vScale) { return Atlas.EnsureSmooth(img, uOff, vOff, uScale, vScale); }
  static WhiteTex(u, v) { return Atlas.White(u, v); }
  static Release(img) { Atlas.Release(img); }
  static MarkTransient(img) { Atlas.MarkTransient(img); }
  static ReleaseTransient() { Atlas.ReleaseTransient(); }
}

class Gfx$OpKind {}
Gfx$OpKind.Batch = 0;
Gfx$OpKind.Clear = 1;
Gfx$OpKind.Blur = 2;
Gfx$OpKind.Backdrop = 3;
Gfx$OpKind.Gradient = 4;
Gfx$OpKind.Snapshot = 5;
Gfx$OpKind.Nop = 6;
Gfx$OpKind.BloomSnap = 7;

Gfx.TW = 640;
Gfx.TH = 360;
Gfx.MAIN = 0;
Gfx.SHADOW = 1;
Gfx.canvas = null;
Gfx.mainRT = null;
Gfx.shadowRT = null;
Gfx.tmpRT = null;
Gfx.tmp2RT = null;
Gfx.worldRT = null;
Gfx.hudRT = null;
Gfx.bloomSrcRT = null;
Gfx.quadsLastFrame = 0;
Gfx.drawsLastFrame = 0;
Gfx.bloomSrcValid = false;
Gfx.worldValid = false;
Gfx.hudValid = false;
Gfx._inited = false;
Gfx._hudMatTried = false;
Gfx._hasHud = false;
