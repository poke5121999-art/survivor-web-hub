"use strict";
// WebGL2 port of Arrowstorm.PostFx. Shader math is translated from the shipped D3D11 bytecode of
// Hidden/Arrowstorm/Post (screen pass) and Hidden/Arrowstorm/PostFx passes 2-4 (bloom chain).

const PFX_VS_POST = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec4 uFlags;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.5, 1.0);
  vUv = uFlags.z > 0.5 ? aPos : vec2(aPos.x, 1.0 - aPos.y);
}`;

const PFX_FS_PREFILTER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uWorld;
uniform vec4 uThresh;
uniform vec4 uOutSize;
in vec2 vUv;
out vec4 o;
vec3 dec(vec3 c) {
  return mix(pow(abs((c + 0.055) * 0.947867334), vec3(2.4)), c * 0.077399381, vec3(lessThanEqual(c, vec3(0.04045))));
}
vec3 tap(ivec2 p) {
  vec3 c = dec(texelFetch(uWorld, p, 0).rgb);
  float m = max(c.r, max(c.g, c.b));
  float x = m - uThresh.x;
  float s = min(max(x + uThresh.y, 0.0), uThresh.y + uThresh.y);
  s = s * s * uThresh.z;
  return c * (max(x, s) / max(m, 0.0001));
}
void main() {
  ivec2 p = ivec2(floor(vUv * uOutSize.xy)) * 2;
  vec3 c = tap(p + ivec2(1, 0)) + tap(p) + tap(p + ivec2(0, 1)) + tap(p + ivec2(1, 1));
  o = vec4(min(c * 0.25, vec3(uThresh.w)), 1.0);
}`;

const PFX_FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec4 uSrcTexel;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 t = uSrcTexel.xy;
  vec3 c = texture(uSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb
         + texture(uSrc, vUv + vec2(-t.x, t.y)).rgb + texture(uSrc, vUv + vec2(t.x, t.y)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;

const PFX_FS_UP = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec4 uSrcTexel;
uniform float uUpScale;
in vec2 vUv;
out vec4 o;
vec3 s(float x, float y) { return texture(uSrc, vUv + vec2(x, y) * uSrcTexel.xy * uUpScale).rgb; }
void main() {
  vec3 c = s(-1.0, -1.0) + 2.0 * s(0.0, -1.0) + s(1.0, -1.0)
         + 2.0 * s(-1.0, 0.0) + 4.0 * s(0.0, 0.0) + 2.0 * s(1.0, 0.0)
         + s(-1.0, 1.0) + 2.0 * s(0.0, 1.0) + s(1.0, 1.0);
  o = vec4(c * 0.0625, 0.0);
}`;

const PFX_FS_POST = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uBloom;
uniform sampler2D uMainTex;
uniform sampler2D uWorld;
uniform sampler2D uHud;
uniform vec4 uFrame;
uniform vec4 uFlags;
uniform vec4 uXform;
uniform vec4 uZoom;
uniform vec4 uChroma;
uniform vec4 uBloomP;
uniform vec4 uGrade;
uniform vec4 uSat;
uniform vec4 uTint;
uniform vec4 uFlashC;
uniform vec4 uVig;
uniform vec4 uMisc;
uniform float uWaveN;
uniform vec4 uWaves[8];
uniform float uWaveAmp[8];
uniform float uFragFlipH;
in vec2 vUv;
out vec4 o;

vec3 dec(vec3 c) {
  return mix(pow(abs((c + 0.055) * 0.947867334), vec3(2.4)), c * 0.077399381, vec3(lessThanEqual(c, vec3(0.04045))));
}
vec3 enc(vec3 c) {
  return mix(pow(c, vec3(0.416666657)) * 1.054999948 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
float smooth01(float t) { return t * t * (3.0 - 2.0 * t); }
vec3 contrast(vec3 x, float k) {
  vec3 g = pow(x, vec3(0.454545468));
  g += k * (g * g * (3.0 - 2.0 * g) - g);
  return pow(g, vec3(2.2));
}
float hash(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  return float(v.x & 0xffffffu) * 5.9604645e-08 - 0.5;
}
vec3 uiGrade(vec3 c, float rad) {
  vec3 lin = dec(clamp(c, 0.0, 1.0));
  float e = exp2(uGrade.y);
  vec3 over = max(lin * e - 1.0, 0.0);
  vec3 x = contrast(min(lin * e, vec3(1.0)), uGrade.w) + over;
  float lum = dot(x, vec3(0.2126, 0.7152, 0.0722));
  x = max(lum + (uSat.y + 1.0) * (x - lum), 0.0);
  float t = smooth01(clamp((rad - uVig.z) / (uVig.w - uVig.z), 0.0, 1.0));
  x = clamp(x * (1.0 - t * uVig.y), 0.0, 1.0);
  x = enc(x);
  return x + (1.0 - x) * clamp(uFlashC.w * uFlashC.rgb, 0.0, 1.0);
}
ivec2 mirrorTexel(vec2 p, ivec2 maxI) {
  p = uFrame.xy - abs(uFrame.xy - abs(p));
  return clamp(ivec2(floor(p)), ivec2(0), maxI);
}
void main() {
  ivec2 maxI = ivec2(uFrame.xy) - 1;
  ivec2 ip = clamp(ivec2(floor(vUv * uFrame.xy)), ivec2(0), maxI);
  vec3 mainC = texelFetch(uMainTex, ip, 0).rgb;
  vec2 cc = (vUv * uFrame.xy - uFrame.xy * 0.5) / (uFrame.x * 0.5);
  float rad = length(cc);
  uint frame = uint(uMisc.x);
  vec3 r3;
  if (uFlags.x > 0.5) {
    vec3 world = texelFetch(uWorld, ip, 0).rgb;
    float hudA;
    vec3 W;
    if (uFlags.y > 0.5) {
      vec4 h = clamp(texelFetch(uHud, ip, 0), 0.0, 1.0);
      hudA = h.a;
      W = h.rgb * (1.0 - h.a);
    } else {
      bool same = all(equal(mainC, world));
      hudA = same ? 0.0 : 1.0;
      W = same ? vec3(1.0) : vec3(0.0);
    }
    r3 = mainC - world * W;
    if (max(W.z, max(W.y, W.x)) > 0.002) {
      vec2 q = (vUv * uFrame.xy - uZoom.yz) / uZoom.x + uZoom.yz;
      q = (q - uFrame.xy * 0.5) / uXform.z + uFrame.xy * 0.5 - uXform.xy;
      float shock = 0.0;
      int n = int(uWaveN);
      for (int i = 0; i < 8; i++) {
        if (i < n) {
          vec2 d = q - uWaves[i].xy;
          float dist = length(d);
          float e = (dist - uWaves[i].z) / max(uWaves[i].w, 0.001);
          float f = 1.0 - e * e;
          f *= f;
          if (abs(e) < 1.0) {
            q -= d / max(dist, 0.001) * (f * uWaveAmp[i]);
            shock += f * clamp(uXform.w * uWaveAmp[i], 0.0, 1.0);
          }
        }
      }
      float ch = clamp(rad * uChroma.y * 0.4 + uChroma.x, 0.0, 1.0) * uChroma.z;
      vec3 lin = dec(vec3(
        texelFetch(uWorld, mirrorTexel(q + cc * ch, maxI), 0).r,
        texelFetch(uWorld, mirrorTexel(q, maxI), 0).g,
        texelFetch(uWorld, mirrorTexel(q - cc * ch, maxI), 0).b));
      float m = max(lin.r, max(lin.g, lin.b));
      vec2 bu = q * uFrame.zw;
      vec2 hb = uBloomP.yz * 0.5;
      vec3 bl = (textureLod(uBloom, bu - hb, 0.0).rgb + textureLod(uBloom, vec2(bu.x + hb.x, bu.y - hb.y), 0.0).rgb
               + textureLod(uBloom, vec2(bu.x - hb.x, bu.y + hb.y), 0.0).rgb + textureLod(uBloom, bu + hb, 0.0).rgb) * 0.25;
      float k = (1.0 - uBloomP.w * smooth01(clamp((m - 0.3) * 1.428571463, 0.0, 1.0))) * uBloomP.x;
      vec3 col = bl * k + shock * uMisc.z * 0.05 + lin;
      col *= exp2(uGrade.x);
      col += uTint.w * (col * uTint.rgb - col);
      vec3 over = max(col - 1.0, 0.0);
      col = contrast(clamp(col, 0.0, 1.0), uGrade.z) + over;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(lum + (uSat.x + 1.0) * (col - lum), 0.0);
      float t = smooth01(clamp((rad - uVig.z) / (uVig.w - uVig.z), 0.0, 1.0));
      col = clamp(col * (1.0 - t * uVig.x), 0.0, 1.0);
      col = enc(col);
      col += (1.0 - col) * clamp(uFlashC.rgb, 0.0, 1.0);
      if (uSat.z > 0.0) {
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        col += hash(uvec3(uvec2(ip), frame)) * uSat.z * (1.0 - abs(luma * 2.0 - 1.0) * 0.7);
      }
      r3 += col * W;
    }
    if (hudA > 0.002) r3 += hudA * (uiGrade(r3, rad) - r3);
  } else {
    r3 = uiGrade(mainC, rad);
  }
  vec3 outC = r3;
  if (uSat.w > 0.0) {
    vec2 fc = vec2(gl_FragCoord.x, uFragFlipH > 0.0 ? uFragFlipH - gl_FragCoord.y : gl_FragCoord.y);
    outC += hash(uvec3(uvec2(fc), frame * 7u + 3u)) * 0.003921569;
  }
  outC = clamp(outC, 0.0, 1.0);
  if (uMisc.y > 0.5) outC = dec(outC);
  o = vec4(outC, 1.0);
}`;

class PostFx {
  static get ScreenMaterial() { return PostFx._screenMat; }
  static get Active() { return PostFx._active; }

  static Init() {
    if (PostFx._inited) return;
    PostFx._inited = true;
    try {
      PostFx._post = Gfx._program(PFX_VS_POST, PFX_FS_POST);
      PostFx._pre = Gfx._program(PFX_VS_POST, PFX_FS_PREFILTER);
      PostFx._down = Gfx._program(PFX_VS_POST, PFX_FS_DOWN);
      PostFx._up = Gfx._program(PFX_VS_POST, PFX_FS_UP);
      PostFx._ok = true;
    } catch (e) {
      PostFx._ok = false;
      console.warn("Arrowstorm: post-processing shaders unavailable; presenting without post-processing.", e);
      return;
    }
    const gl = Gfx._gl;
    const p = PostFx._post;
    gl.useProgram(p.p);
    gl.uniform1i(p.u("uBloom"), 0);
    gl.uniform1i(p.u("uMainTex"), 1);
    gl.uniform1i(p.u("uWorld"), 2);
    gl.uniform1i(p.u("uHud"), 3);
    for (const q of [PostFx._pre, PostFx._down, PostFx._up]) {
      gl.useProgram(q.p);
      gl.uniform4f(q.u("uFlags"), 0, 0, 1, 0);
    }
    PostFx._screenMat = { name: "Arrowstorm Post" };
    let w = 320, h = 180;
    PostFx._bloom = [];
    for (let i = 0; i < 4; i++) {
      PostFx._bloom.push(Gfx._makeRT(w, h, true, true, "Arrowstorm Bloom " + i));
      w = Math.max(1, (w + 1) >> 1);
      h = Math.max(1, (h + 1) >> 1);
    }
    G$JUICE.worldSnapshot = PostFx._Snapshot;
    G$JUICE.bloomSnapshot = PostFx._BloomSnapshot;
    if (typeof CaptureHarness !== "undefined") CaptureHarness.composite = PostFx._Capture;
  }

  static Shutdown() {
    if (!PostFx._inited) return;
    PostFx._inited = false;
    if (G$JUICE.worldSnapshot === PostFx._Snapshot) G$JUICE.worldSnapshot = null;
    if (G$JUICE.bloomSnapshot === PostFx._BloomSnapshot) G$JUICE.bloomSnapshot = null;
    if (typeof CaptureHarness !== "undefined" && CaptureHarness.composite === PostFx._Capture) CaptureHarness.composite = null;
    if (PostFx._bloom) for (const rt of PostFx._bloom) Gfx._killRT(rt);
    PostFx._bloom = null;
    Gfx._killRT(PostFx._capRT);
    PostFx._capRT = null;
    const gl = Gfx._gl;
    for (const q of [PostFx._post, PostFx._pre, PostFx._down, PostFx._up]) if (q && gl) gl.deleteProgram(q.p);
    PostFx._post = PostFx._pre = PostFx._down = PostFx._up = null;
    PostFx._screenMat = null;
    PostFx._ok = PostFx._active = PostFx._bloomValid = false;
  }

  static _Snapshot() {
    if (PostFx._inited && PostFx._ok && PostFx._cur != null && PostFx._cur.enabled) Gfx.SnapshotWorld();
  }

  static _BloomSnapshot() {
    if (PostFx._inited && PostFx._ok && PostFx._cur != null && PostFx._cur.enabled) Gfx.SnapshotBloomSource();
  }

  static _SoftCap(x, m) {
    const ax = Math.abs(x);
    const h = m * 0.5;
    if (ax <= h || m <= 0) return m <= 0 ? 0 : x;
    return Math.sign(x) * (h + (m - h) * Math.tanh((ax - h) / (m - h)));
  }

  static Render(s) {
    PostFx._cur = s;
    PostFx._active = PostFx._ok && s != null && s.enabled && G$JUICE.on && G$JUICE.postOn;
    if (!PostFx._active) {
      PostFx._envX = PostFx._envY = 0;
      return false;
    }
    const P = G$JUICE$Post;
    PostFx._offX = P.offX;
    PostFx._offY = P.offY;
    const len = Math.sqrt(PostFx._offX * PostFx._offX + PostFx._offY * PostFx._offY);
    if (len > 1e-6) {
      const k = PostFx._SoftCap(len, s.maxShakePx) / len;
      PostFx._offX *= k;
      PostFx._offY *= k;
    }
    PostFx._zoom = 1 + PostFx._SoftCap(Math.max(0, P.zoom - 1), s.maxPunch);
    const decay = Math.exp(-5 * Math.max(0, G$E.rdt));
    PostFx._envX = Math.max(Math.abs(PostFx._offX), PostFx._envX * decay);
    PostFx._envY = Math.max(Math.abs(PostFx._offY), PostFx._envY * decay);
    PostFx._bloomValid = Gfx.worldValid;
    if (PostFx._bloomValid) PostFx._RecordBloom(s);
    Gfx._bind(null);
    PostFx._Draw(s, false, Gfx.canvas.height);
    return true;
  }

  static _Night() {
    return Math.max(0, Math.min(1, G$WORLD.GetNight()));
  }

  static _BloomThreshold(s) { return !G$FULL.On ? s.bloomThreshold : Math.max(s.bloomThreshold, 0.92); }
  static _BloomKnee(s) { return !G$FULL.On ? s.bloomKnee : Math.min(s.bloomKnee, 0.25); }
  static _BloomThresholdNight(s) { return !G$FULL.On ? s.bloomThresholdNight : Math.max(s.bloomThresholdNight, 0.75); }
  static _BloomNight(s) { return !G$FULL.On ? s.bloomNight : 0; }
  static _Grain(s) { return !G$FULL.On ? s.grain : 0; }
  static _EdgeChroma(s) { return !G$FULL.On ? s.edgeChroma : 0; }

  static _RecordBloom(s) {
    const gl = Gfx._gl;
    const night = PostFx._Night();
    const t = Math.max(0, Math.min(1, night));
    const a = PostFx._BloomThreshold(s), b = PostFx._BloomThresholdNight(s);
    const thr = Math.fround(a + (b - a) * t);
    const knee = Math.max(0.0001, Math.fround(thr * PostFx._BloomKnee(s)));
    gl.disable(gl.BLEND);
    const B = PostFx._bloom;
    let p = PostFx._pre;
    Gfx._bind(B[0]);
    gl.useProgram(p.p);
    Gfx._tex(0, Gfx.bloomSrcValid && Gfx.bloomSrcRT != null ? Gfx.bloomSrcRT : Gfx.worldRT);
    gl.uniform4f(p.u("uThresh"), thr, knee, 0.25 / knee, 4);
    gl.uniform4f(p.u("uOutSize"), B[0].width, B[0].height, 0, 0);
    Gfx._drawUnit();
    p = PostFx._down;
    gl.useProgram(p.p);
    for (let i = 1; i < 4; i++) {
      const src = B[i - 1];
      Gfx._bind(B[i]);
      Gfx._tex(0, src);
      gl.uniform4f(p.u("uSrcTexel"), 1 / src.width, 1 / src.height, src.width, src.height);
      Gfx._drawUnit();
    }
    p = PostFx._up;
    gl.useProgram(p.p);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = 2; i >= 0; i--) {
      const src = B[i + 1];
      Gfx._bind(B[i]);
      Gfx._tex(0, src);
      gl.uniform4f(p.u("uSrcTexel"), 1 / src.width, 1 / src.height, src.width, src.height);
      gl.uniform1f(p.u("uUpScale"), s.bloomRadius);
      Gfx._drawUnit();
    }
    gl.disable(gl.BLEND);
  }

  static _Dec(c) {
    c = c < 0 ? 0 : c > 1 ? 1 : c;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // SetParams + SetMisc, applied straight to the post program; then draws into the bound target.
  static _Draw(s, offscreen, fragFlipH) {
    const gl = Gfx._gl;
    const p = PostFx._post;
    const P = G$JUICE$Post;
    const u = (n) => p.u(n);
    gl.useProgram(p.p);
    gl.disable(gl.BLEND);
    const flag = PostFx._bloomValid && Gfx.worldRT != null;
    const flag2 = flag && Gfx.hudValid && Gfx.hudRT != null;
    Gfx._tex(0, PostFx._bloom[0]);
    Gfx._tex(1, Gfx.mainRT);
    Gfx._tex(2, flag ? Gfx.worldRT : null);
    Gfx._tex(3, flag2 ? Gfx.hudRT : null);
    gl.uniform4f(u("uFrame"), 640, 360, 0.0015625, 0.0027777778);
    gl.uniform4f(u("uFlags"), flag ? 1 : 0, flag2 ? 1 : 0, offscreen ? 1 : 0, 0);
    const ex = PostFx._envX, ey = PostFx._envY;
    const over = 1 + Math.min(s.maxOverscan, Math.max(ex / (320 - ex + 0.001), ey / (180 - ey + 0.001)) * 1.02);
    gl.uniform4f(u("uXform"), PostFx._offX, PostFx._offY, over, 1 / 3);
    const zx = Math.max(0, Math.min(640, P.zoomX));
    const zy = Math.max(0, Math.min(360, P.zoomY));
    gl.uniform4f(u("uZoom"), Math.max(0.001, PostFx._zoom), zx, zy, 0);
    gl.uniform4f(u("uChroma"), P.chroma, PostFx._EdgeChroma(s), s.maxChromaPx, 0);
    const night = PostFx._Night();
    const bi = (s.bloomIntensity * (1 + PostFx._BloomNight(s) * night) * (G$BUILD.heavyFlashes ? 0.6 : 1) + P.bloom * s.bloomPulse) / 4;
    const b0 = PostFx._bloom[0];
    gl.uniform4f(u("uBloomP"), bi, 1 / b0.width, 1 / b0.height, s.bloomProtect);
    let ui = s.uiGrade;
    const tree = G$GAME.state === "tree";
    if (tree) ui = 0;
    const exposure = s.exposure + s.nightExposure * night + P.exposure;
    const contrast = s.contrast * (1 - s.nightContrastFade * night);
    gl.uniform4f(u("uGrade"), exposure, s.exposure * ui, contrast, s.contrast * ui);
    gl.uniform4f(u("uSat"), s.saturation + P.saturation, s.saturation * ui, PostFx._Grain(s), s.dither ? 1 : 0);
    gl.uniform4f(u("uTint"), PostFx._Dec(P.tintR), PostFx._Dec(P.tintG), PostFx._Dec(P.tintB), Math.max(0, Math.min(1, P.tintA)));
    const fa = Math.fround(Math.max(0, Math.min(1, P.flashA)) * s.flash);
    gl.uniform4f(u("uFlashC"), Math.fround(P.flashR) * fa, Math.fround(P.flashG) * fa, Math.fround(P.flashB) * fa, s.uiFlash);
    const vig = Math.min(1, s.vignette + P.vignette * 0.8);
    gl.uniform4f(u("uVig"), vig, tree ? 0 : vig * s.uiVignette, 0.5, 1.35);
    const nw = Math.min(P.waves, 8);
    const waves = new Float32Array(32), amp = new Float32Array(8);
    for (let i = 0; i < nw; i++) {
      waves[i * 4] = P.waveX[i];
      waves[i * 4 + 1] = P.waveY[i];
      waves[i * 4 + 2] = P.waveR[i];
      waves[i * 4 + 3] = Math.max(0.5, P.waveW[i]);
      amp[i] = P.waveA[i];
    }
    gl.uniform1f(u("uWaveN"), nw);
    gl.uniform4fv(u("uWaves"), waves);
    gl.uniform1fv(u("uWaveAmp"), amp);
    // Misc.y (output linear) stays 0: a linear-space Unity build re-encodes on its sRGB backbuffer, the canvas does not.
    gl.uniform4f(u("uMisc"), G$E.frame & 0xFFFFF, 0, s.shockLight, night);
    gl.uniform1f(u("uFragFlipH"), fragFlipH);
    Gfx._drawUnit();
  }

  // CaptureHarness.composite: the post-processed frame at w x h. Returns { width, height, pixels } with
  // pixels as RGBA bytes, row 0 = top.
  static _Capture(w, h) {
    if (!PostFx._active || !PostFx._ok || PostFx._cur == null || w <= 0 || h <= 0) return null;
    if (PostFx._capRT == null || PostFx._capRT.width !== w || PostFx._capRT.height !== h) {
      Gfx._killRT(PostFx._capRT);
      PostFx._capRT = Gfx._makeRT(w, h, false, false, "Arrowstorm Post Capture");
    }
    const gl = Gfx._gl;
    Gfx._bind(PostFx._capRT);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    PostFx._Draw(PostFx._cur, true, 0);
    return { width: w, height: h, pixels: Gfx.ReadPixels(PostFx._capRT) };
  }
}

PostFx._inited = false;
PostFx._ok = false;
PostFx._active = false;
PostFx._bloomValid = false;
PostFx._cur = null;
PostFx._screenMat = null;
PostFx._bloom = null;
PostFx._capRT = null;
PostFx._envX = 0;
PostFx._envY = 0;
PostFx._offX = 0;
PostFx._offY = 0;
PostFx._zoom = 1;
