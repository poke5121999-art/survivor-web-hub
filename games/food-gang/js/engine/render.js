// WebGL2 renderer: opaque toon meshes (depth write), sorted transparent sprite/particle/text batches (depth test),
// URP-like post (bloom + exposure/contrast, gamma colour space), then screen-space UI.
import { stats } from './assets.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aFlash; layout(location=4) in vec2 aExtra;
uniform mat4 uVP;
out vec2 vUV; out vec4 vCol; out vec4 vFlash; out vec2 vExtra;
void main(){ gl_Position = uVP * vec4(aPos, 1.0); vUV = aUV; vCol = aCol; vFlash = aFlash; vExtra = aExtra; }`;

const FS_SPRITE = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; in vec4 vFlash; in vec2 vExtra;
uniform sampler2D uTex;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV) * vCol;
  c.rgb = mix(c.rgb, vFlash.rgb, vFlash.a);
  if (vExtra.y > 0.5) c.rgb *= c.a;
  o = c;
}`;

// TextMeshPro Distance Field: face + outline + underlay, premultiplied output (TMP blends One/OneMinusSrcAlpha).
const FS_SDF = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol; in vec4 vFlash; in vec2 vExtra;
uniform sampler2D uTex; uniform vec2 uTexSize; uniform float uGrad;
uniform vec4 uFace; uniform vec4 uOutCol; uniform float uOutW; uniform float uSoft; uniform float uDilate;
uniform vec4 uUlCol; uniform vec2 uUlOff; uniform float uUlDilate; uniform float uUlSoft; uniform float uUlOn;
out vec4 o;
void main(){
  float texPerPx = max(length(fwidth(vUV * uTexSize)) * 0.70710678, 1e-4);
  float scale = 2.0 * uGrad / texPerPx;               // screen pixels per SDF unit
  float weight = vExtra.x * 0.25 + uDilate;
  float d = texture(uTex, vUV).r;
  float D = (0.5 - weight - d) * scale - 0.5;          // TMP's d: >0 outside
  float ow = uOutW * scale, sf = uSoft * scale;
  float faceA = 1.0 - clamp((D - ow * 0.5 + sf * 0.5) / (1.0 + sf), 0.0, 1.0);
  float outA = clamp(D + ow * 0.5, 0.0, 1.0) * sqrt(min(1.0, ow));
  vec4 face = uFace * vCol; face.rgb *= face.a;
  vec4 oc = uOutCol; oc.a *= vCol.a; oc.rgb *= oc.a;
  vec4 c = mix(face, oc, outA) * faceA;
  if (uUlOn > 0.5) {
    float du = texture(uTex, vUV + uUlOff).r;
    float uls = scale / (1.0 + uUlSoft * scale);
    float ul = clamp((du - 0.5 + weight + uUlDilate) * uls + 0.5, 0.0, 1.0);
    vec4 uc = uUlCol; uc.a *= vCol.a;
    c += vec4(uc.rgb * uc.a, uc.a) * ul * (1.0 - c.a);
  }
  o = c;
}`;

const VS_MESH = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aCol;
uniform mat4 uVP; uniform mat4 uM;
out vec2 vUV; out vec3 vN; out vec4 vCol;
void main(){ gl_Position = uVP * uM * vec4(aPos, 1.0); vUV = aUV; vN = mat3(uM) * aN; vCol = aCol; }`;

// Shader Graphs/ToonRampUnlit has no source in the rip; this is fitted to clip frames (Kitchen 45,-135 / DiningRoom
// 70,-80 / Pantry 45,-60 light eulers). Lit faces are texture * _LightColor; faces whose baked vertex colour is black
// (the diagonal shadow wedges) or that face away from the light are ~0.5 of that, slightly blue. The light vector that
// separates the observed lit/dark faces is Unity's -forward with x mirrored; dark below N.L = -0.56 (lit: walls -0.5,
// tablecloth -0.32, shelf ends 0.31; dark: shelf fronts -0.70, pantry side wall -0.61, plate undersides -0.82).
// _RampValue 0 (the roof quad) is flat _Color * _LightColor.
const FS_MESH = `#version 300 es
precision mediump float;
in vec2 vUV; in vec3 vN; in vec4 vCol;
uniform sampler2D uTex; uniform float uHasTex; uniform vec4 uColor; uniform vec3 uL; uniform vec3 uLightCol;
uniform float uRamp; uniform float uShadow; uniform float uIntensity; uniform vec3 uShadowTint;
out vec4 o;
void main(){
  vec4 a = (uHasTex > 0.5 ? texture(uTex, vUV) : vec4(1.0)) * uColor;
  vec3 lit = uLightCol * uIntensity;
  float ramp = smoothstep(-0.58, -0.54, dot(normalize(vN), uL));
  vec3 shade = mix(lit * mix(vec3(1.0), uShadowTint, uShadow), lit, vCol.r * ramp);
  o = vec4(a.rgb * mix(lit, shade, uRamp), 1.0);
}`;

const VS_POST = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_PREFILTER = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; out vec4 o;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  vec3 c = 0.25 * (lin(texture(uTex, vUV + uTexel * vec2(-0.5,-0.5)).rgb) + lin(texture(uTex, vUV + uTexel * vec2(0.5,-0.5)).rgb)
                 + lin(texture(uTex, vUV + uTexel * vec2(-0.5,0.5)).rgb) + lin(texture(uTex, vUV + uTexel * vec2(0.5,0.5)).rgb));
  float knee = uThreshold * 0.5;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float m = max(br - uThreshold, soft) / max(br, 1e-4);
  o = vec4(c * m, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.227027;
  c += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162;
  c += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162;
  c += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702703;
  c += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702703;
  o = vec4(c, 1.0);
}`;

const FS_UPSAMPLE = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uHi; uniform sampler2D uLo; uniform float uScatter; out vec4 o;
void main(){ o = vec4(mix(texture(uHi, vUV).rgb, texture(uLo, vUV).rgb, uScatter), 1.0); }`;

const FS_COMPOSITE = `#version 300 es
precision mediump float; in vec2 vUV;
uniform sampler2D uTex; uniform sampler2D uBloom; uniform float uBloomI; uniform float uExposure; uniform float uContrast;
uniform float uSat; uniform float uTonemap; out vec4 o;
vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float logc(float x){ return 0.244161 * log2(5.555556 * x + 0.047996) / 3.321928 + 0.386036; }
float unlogc(float x){ return (pow(10.0, (x - 0.386036) / 0.244161) - 0.047996) / 5.555556; }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = lin(texture(uTex, vUV).rgb);
  c += texture(uBloom, vUV).rgb * uBloomI;
  c *= uExposure;
  if (uContrast != 1.0) {
    const float mid = 0.4135884;
    vec3 l = vec3(logc(c.r), logc(c.g), logc(c.b));
    l = (l - mid) * uContrast + mid;
    c = vec3(unlogc(l.r), unlogc(l.g), unlogc(l.b));
  }
  float luma = dot(c, vec3(0.2126729, 0.7151522, 0.0721750));
  c = luma + (c - luma) * uSat;
  if (uTonemap > 0.5) c = aces(c);
  o = vec4(srgb(clamp(c, 0.0, 1.0)), 1.0);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader compile failed: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('shader link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

// Unity BlendMode enum -> GL factor
const BLEND = (gl) => [gl.ZERO, gl.ONE, gl.DST_COLOR, gl.SRC_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA,
  gl.ONE_MINUS_SRC_COLOR, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA];

const MAXV = 65536, STRIDE = 36;

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.assets = assets;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.blendTab = BLEND(gl);
    this.progSprite = compile(gl, VS, FS_SPRITE);
    this.progSdf = compile(gl, VS, FS_SDF);
    this.progMesh = compile(gl, VS_MESH, FS_MESH);
    this.post = {
      prefilter: compile(gl, VS_POST, FS_PREFILTER), blur: compile(gl, VS_POST, FS_BLUR),
      up: compile(gl, VS_POST, FS_UPSAMPLE), comp: compile(gl, VS_POST, FS_COMPOSITE),
    };
    this.buf = new ArrayBuffer(MAXV * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u32 = new Uint32Array(this.buf);
    this.idx = new Uint16Array(MAXV * 3);
    this.nv = 0; this.ni = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idx.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 24);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, STRIDE, 28);
    gl.bindVertexArray(null);
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.textures = new Map();
    this.white = this.makeTex(1, 1, new Uint8Array([255, 255, 255, 255]));
    this.state = null;
    this.vp = null;
    this.meshCache = new Map();
    this.targets = null;
  }

  makeTex(w, h, data, filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  imageTex(key, img, mips = true, repeat = false) {
    let t = this.textures.get(key);
    if (t) return t;
    const gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    this.textures.set(key, t);
    return t;
  }

  // atlas texture for a sprite record, or null while its image is still loading
  spriteTex(s) {
    const t = this.textures.get('atlas:' + s.a);
    if (t) return t;
    const p = this.assets.images.get(s.a);
    if (!p) { this.assets.atlasImage(s.a).catch((e) => stats.errors.push(e.message)); return null; }
    if (!p.done) return null;
    return this.imageTex('atlas:' + s.a, p.done);
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.targets = null; }
  }

  // ------------------------------------------------------------------------------------------------ batching

  setState(prog, tex, src, dst, depth, extra) {
    const s = this.state;
    if (s && s.prog === prog && s.tex === tex && s.src === src && s.dst === dst && s.depth === depth && s.extra === extra) return;
    this.flush();
    this.state = { prog, tex, src, dst, depth, extra };
  }

  flush() {
    if (!this.ni || !this.state) { this.nv = 0; this.ni = 0; return; }
    const gl = this.gl, s = this.state;
    const P = s.prog;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.tex || this.white);
    gl.uniform1i(P.u.uTex, 0);
    if (s.extra && s.extra.uniforms) s.extra.uniforms(gl, P.u);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(this.blendTab[s.src], this.blendTab[s.dst], gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (s.depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    if (s.extra && s.extra.scissor) { gl.enable(gl.SCISSOR_TEST); const r = s.extra.scissor; gl.scissor(r[0], r[1], Math.max(0, r[2]), Math.max(0, r[3])); }
    else gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.nv * STRIDE / 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.idx, 0, this.ni);
    gl.drawElements(gl.TRIANGLES, this.ni, gl.UNSIGNED_SHORT, 0);
    stats.drawCalls++;
    this.nv = 0; this.ni = 0;
  }

  // one vertex; col/flash packed RGBA8 (little-endian ABGR)
  vert(x, y, z, u, v, col, flash, e0 = 0, e1 = 0) {
    if (this.nv >= MAXV) this.flush();
    const o = this.nv * 9;
    const f = this.f32, w = this.u32;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v; w[o + 5] = col; w[o + 6] = flash; f[o + 7] = e0; f[o + 8] = e1;
    return this.nv++;
  }

  reserve(nv, ni) { if (this.nv + nv > MAXV || this.ni + ni > this.idx.length) this.flush(); }

  quadIdx(a) { const I = this.idx; let i = this.ni; I[i] = a; I[i + 1] = a + 1; I[i + 2] = a + 2; I[i + 3] = a + 2; I[i + 4] = a + 1; I[i + 5] = a + 3; this.ni += 6; }

  tri(a, b, c) { const I = this.idx; I[this.ni++] = a; I[this.ni++] = b; I[this.ni++] = c; }

  // ------------------------------------------------------------------------------------------------ meshes

  meshGL(key, data) {
    let m = this.meshCache.get(key);
    if (m) return m;
    const gl = this.gl;
    const n = data.n;
    const v = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      v.set([data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]], i * 12);
      v.set(data.nrm.length ? [data.nrm[i * 3], data.nrm[i * 3 + 1], data.nrm[i * 3 + 2]] : [0, 0, -1], i * 12 + 3);
      v.set(data.uv.length ? [data.uv[i * 2], 1 - data.uv[i * 2 + 1]] : [0, 0], i * 12 + 6);
      v.set(data.col ? data.col.slice(i * 4, i * 4 + 4) : [1, 1, 1, 1], i * 12 + 8);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = n > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(data.idx) : new Uint16Array(data.idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
    gl.bindVertexArray(null);
    m = { vao, big, sub: data.sub };
    this.meshCache.set(key, m);
    return m;
  }

  drawMesh(m, sub, model, mat, light) {
    const gl = this.gl, P = this.progMesh;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(P.u.uM, false, model);
    const tex = mat && mat.texImg;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex || this.white);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform1f(P.u.uHasTex, tex ? 1 : 0);
    const pr = (mat && mat.props) || {};
    gl.uniform4fv(P.u.uColor, (mat && mat.color) || [1, 1, 1, 1]);
    gl.uniform3fv(P.u.uL, light.dir);
    gl.uniform3fv(P.u.uLightCol, (pr._LightColor || [1, 1, 1, 1]).slice(0, 3));
    gl.uniform1f(P.u.uRamp, pr._RampValue ?? 1);
    gl.uniform1f(P.u.uShadow, pr._ShadowIntensity ?? 1);
    gl.uniform1f(P.u.uIntensity, pr._LightIntensity ?? 1);
    gl.uniform3fv(P.u.uShadowTint, light.shadowTint);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.SCISSOR_TEST);
    // drawn two-sided: culled and unculled renders look the same against the clips, and two-sided cannot drop faces
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(m.vao);
    const s = m.sub[sub];
    if (s) gl.drawElements(gl.TRIANGLES, s.count, m.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, s.start * (m.big ? 4 : 2));
    gl.bindVertexArray(null);
    stats.drawCalls++;
  }

  // ------------------------------------------------------------------------------------------------ frame

  ensureTargets(w, h) {
    if (this.targets && this.targets.w === w && this.targets.h === h) return this.targets;
    const gl = this.gl;
    const rt = (tw, th, depth) => {
      const tex = this.makeTex(tw, th, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depth) {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorageMultisample ? gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, tw, th) : 0;
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w: tw, h: th };
    };
    // MSAA scene buffer resolved into a texture (URP camera has MSAA on)
    const msFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFb);
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const crb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, crb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, crb);
    const drb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, drb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, drb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const scene = rt(w, h, false);
    const mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 3 && mw > 8 && mh > 8; i++) { mips.push({ a: rt(mw, mh), b: rt(mw, mh) }); mw >>= 1; mh >>= 1; }
    this.targets = { w, h, ms: msFb, scene, mips };
    return this.targets;
  }

  beginWorld(w, h, clear, post) {
    const gl = this.gl;
    stats.drawCalls = 0;
    if (post) {
      const T = this.ensureTargets(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms);
    } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.depthMask(true);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  endWorld(w, h, post) {
    this.flush();
    this.state = null;
    if (!post) return;
    const gl = this.gl, T = this.targets;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.scene.fb);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.quadVao);
    const draw = (prog, target, setup) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
      setup(prog.u);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    const B = post.bloom || { threshold: 1, intensity: 0, scatter: 0.7 };
    const mips = T.mips;
    if (B.intensity > 0 && mips.length) {
      draw(this.post.prefilter, mips[0].a, (u) => {
        bind(0, T.scene.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uTexel, 1 / w, 1 / h);
        gl.uniform1f(u.uThreshold, Math.pow(B.threshold, 2.2));
      });
      for (let i = 0; i < mips.length; i++) {
        const m = mips[i];
        if (i > 0) draw(this.post.blur, m.a, (u) => { bind(0, mips[i - 1].a.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 0); });
        draw(this.post.blur, m.b, (u) => { bind(0, m.a.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1 / m.a.w, 0); });
        draw(this.post.blur, m.a, (u) => { bind(0, m.b.tex); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1 / m.a.h); });
      }
      for (let i = mips.length - 2; i >= 0; i--) {
        draw(this.post.up, mips[i].b, (u) => {
          bind(0, mips[i].a.tex); bind(1, mips[i + 1].a.tex); gl.uniform1i(u.uHi, 0); gl.uniform1i(u.uLo, 1); gl.uniform1f(u.uScatter, B.scatter ?? 0.7);
        });
        // result lives in .b; swap so the next level reads it from .a
        const t = mips[i].a; mips[i].a = mips[i].b; mips[i].b = t;
      }
    }
    draw(this.post.comp, null, (u) => {
      bind(0, T.scene.tex); bind(1, B.intensity > 0 && mips.length ? mips[0].a.tex : this.white);
      gl.uniform1i(u.uTex, 0); gl.uniform1i(u.uBloom, 1);
      gl.uniform1f(u.uBloomI, B.intensity > 0 && mips.length ? B.intensity : 0);
      gl.uniform1f(u.uExposure, Math.pow(2, post.postExposure || 0));
      gl.uniform1f(u.uContrast, 1 + (post.contrast || 0) / 100);
      gl.uniform1f(u.uSat, 1 + (post.saturation || 0) / 100);
      gl.uniform1f(u.uTonemap, post.tonemapOn ? 1 : 0);
    });
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

export function packColor(r, g, b, a) {
  return ((Math.max(0, Math.min(255, a * 255 + 0.5)) & 255) << 24 | (Math.max(0, Math.min(255, b * 255 + 0.5)) & 255) << 16
    | (Math.max(0, Math.min(255, g * 255 + 0.5)) & 255) << 8 | (Math.max(0, Math.min(255, r * 255 + 0.5)) & 255)) >>> 0;
}
