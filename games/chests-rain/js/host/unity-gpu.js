"use strict";
// Unity GPU, Font and UGUI members used by G.CARDSPANEL (and the CARDPAINT plane textures), over WebGL2.
//
// The cards panel draws at screen resolution over the whole window (page background, the game frame,
// the DOM emulation), while Gfx.canvas is a 640x360 backbuffer sized to the display rect. So the panel
// renders in its own WebGL2 context on a full-window overlay canvas (the Unity screen-space overlay
// Canvas, sortingOrder 32001). The one Gfx texture it samples, Gfx.mainRT, is taken from Gfx.canvas
// after Gfx and PostFx have drawn the frame. Gfx state is never touched.
//
// Shaders are translated from the shipped D3D11 bytecode of Hidden/Arrowstorm/CardsPanel (passes 0/1)
// and Hidden/Arrowstorm/CardsPanelPresent (tools/shaders_out/CardsPanel*.asm).
//
// Texture2D objects keep their CPU pixels in the shape Gfx accepts for foreign textures
// ({width, height, data, format, filterMode, wrapMode, version}); this context caches its copy as $cp.

const CP_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec4 aT0;
layout(location=3) in vec4 aT1;
layout(location=4) in vec4 aT2;
layout(location=5) in vec4 aT3;
uniform vec4 _CPTarget;
uniform vec4 _CPOffset;
out vec4 vCol;
out vec4 vT0;
out vec4 vT1;
out vec4 vT2;
out vec4 vT3;
void main() {
  vec2 p = (aPos.xy - _CPOffset.xy * aPos.z) / _CPTarget.xy;
  float y = _CPTarget.z > 0.5 ? aPos.z - 2.0 * p.y : 2.0 * p.y - aPos.z;
  gl_Position = vec4(2.0 * p.x - aPos.z, y, 0.0, aPos.z);
  vCol = aCol; vT0 = aT0; vT1 = aT1; vT2 = aT2; vT3 = aT3;
}`;

const CP_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D _MainTex;
uniform sampler2D _UTex;
uniform sampler2D _VTex;
uniform vec4 _MainTex_TexelSize;
uniform vec4 _CPTarget;
uniform vec4 _CPOffset;
in vec4 vCol;
in vec4 vT0;
in vec4 vT1;
in vec4 vT2;
in vec4 vT3;
out vec4 o;
float erfA(float x) {
  float ax = abs(x);
  float t = 1.0 / (1.0 + 0.327591091 * ax);
  float p = ((((1.06140542 * t - 1.453152061) * t + 1.421413779) * t - 0.284496725) * t + 0.254829586) * t;
  return sign(x) * (1.0 - p * exp(-ax * ax));
}
vec2 snapUv(vec2 uv, float on) {
  if (on < 0.5) return uv;
  return (ceil(uv * _MainTex_TexelSize.zw - 0.001) - 0.5) / _MainTex_TexelSize.zw;
}
void main() {
  vec2 sp = vec2(gl_FragCoord.x, _CPTarget.z > 0.5 ? _CPTarget.y - gl_FragCoord.y : gl_FragCoord.y) + _CPOffset.xy;
  if (sp.x < vT3.x || sp.y < vT3.y || sp.x >= vT3.z || sp.y >= vT3.w) discard;
  int mode = int(vT2.x + 0.5);
  vec2 uv = vT0.xy;
  vec2 l = vT0.zw;
  vec4 P = vT1;
  if (mode == 0) { o = texture(_MainTex, snapUv(uv, vT2.w)) * vCol; return; }
  if (mode == 8 || mode == 9) { o = texture(_MainTex, uv) * vCol; return; }
  if (mode == 10) { o = texture(_MainTex, uv).aaaa * vCol; return; }
  if (mode == 11) {
    float Y = texture(_MainTex, uv).x * 255.0 - 16.0;
    float U = texture(_UTex, uv).x * 255.0 - 128.0;
    float V = texture(_VTex, uv).x * 255.0 - 128.0;
    vec3 c = clamp(vec3(Y * 0.00456621 + V * 0.006258929,
                        Y * 0.00456621 - U * 0.001536321 - V * 0.003188107,
                        Y * 0.00456621 + U * 0.007910714), 0.0, 1.0);
    o = vec4(c, 1.0) * vCol;
    return;
  }
  if (mode == 1) {
    vec2 hi = min(l + 0.5, P.zw);
    vec2 lo = max(l - 0.5, P.xy);
    vec2 c = clamp(hi - lo, 0.0, 1.0);
    o = c.x * c.y * vCol;
    return;
  }
  if (mode == 2) {
    if (l.x >= uv.x && l.y >= uv.y && l.x < vT2.z && l.y < vT2.w) discard;
    float s = max(vT2.y, 0.0001) / 0.707106769;
    float cx = 0.5 * (erfA((P.z - l.x) / s) - erfA((P.x - l.x) / s));
    float cy = 0.5 * (erfA((P.w - l.y) / s) - erfA((P.y - l.y) / s));
    o = clamp(cx * cy, 0.0, 1.0) * vCol;
    return;
  }
  if (mode == 3) {
    vec4 t = texture(_MainTex, snapUv(uv, vT2.w)) * vCol;
    float s = 1.0 - vT2.y;
    float g = 1.0 - s;
    vec3 c = vec3(
      (0.2126 + 0.7874 * s) * t.r + 0.7152 * g * t.g + 0.0722 * g * t.b,
      0.2126 * g * t.r + (0.7152 + 0.2848 * s) * t.g + 0.0722 * g * t.b,
      0.2126 * g * t.r + 0.7152 * g * t.g + (0.0722 + 0.9278 * s) * t.b);
    o = vec4(min(vec3(t.a), c * vT2.z), t.a);
    return;
  }
  if (mode == 4) {
    vec2 d = l - P.xy;
    if (d.x < 0.0 || d.y < 0.0 || d.x >= P.z || d.y >= P.w) { o = vec4(0.0); return; }
    float t = dot(d - 0.5 * P.zw, vec2(0.965925813, 0.258819044)) / dot(P.zw, vec2(0.965925813, 0.258819044));
    float x = t + 0.5;
    float k;
    if (x > 0.38 && x < 0.47) k = (t + 0.12) * 3.703703642;
    else if (x >= 0.47 && x < 0.53) k = (t + 0.03) * -4.509804726 + 0.333333343;
    else if (x >= 0.53 && x < 0.62) k = (1.0 - (t - 0.03) * 11.11111069) * 0.062745102;
    else k = 0.0;
    o = k * vCol;
    return;
  }
  vec2 d = l - P.xy;
  if (mode == 5) {
    float r = length(d / max(P.zw, vec2(0.0001)));
    vec4 c = vec4(vT2.yzw, 1.0);
    vec4 k;
    if (r < 0.55) k = mix(vec4(1.0), c, r * 1.818181753);
    else if (r < 1.0) k = c * (1.0 - (r - 0.55) * 2.222222328);
    else k = vec4(0.0);
    o = k * vCol;
    return;
  }
  if (mode == 6) {
    float len = length(d);
    if (len >= P.w) { o = vec4(0.0); return; }
    float a = atan(d.x, -d.y) * 57.29578018;
    if (a < 0.0) a += 360.0;
    float stripe = fract(a * 0.06666667) < 0.333333343 ? 1.0 : 0.0;
    float fade;
    if (P.z * 0.22 >= len) fade = 1.0;
    else if (len >= P.z * 0.7) fade = 0.0;
    else fade = 1.0 - (len - P.z * 0.22) / (P.z * 0.48);
    o = stripe * fade * vec4(vT2.yzw, 1.0) * vCol;
    return;
  }
  if (mode == 7) {
    vec2 q = abs(l - 0.5 * (P.xy + P.zw)) - (0.5 * (P.zw - P.xy) - vT2.y);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vT2.y;
    o = clamp(0.5 - dist, 0.0, 1.0) * vCol;
    return;
  }
  o = vCol;
}`;

const CP_VS_PRESENT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() { gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); vUv = aPos; }`;

const CP_FS_PRESENT = `#version 300 es
precision highp float;
uniform sampler2D _MainTex;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(_MainTex, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }`;

const PV_FIELDS = ["x", "y", "w", "r", "g", "b", "a", "u", "v", "lx", "ly", "p0", "p1", "p2", "p3", "mode", "q1", "q2", "q3", "c0", "c1", "c2", "c3"];

const UnityGpu = {
	gl: null,
	canvas: null,
	progPanel: null,
	progPresent: null,
	unitVao: null,
	grayTex: null,
	frameTex: null,
	frameCopied: -1,
	propIds: new Map(),
	propNames: [],
	globals: new Map(),
	behaviours: [],
	activeRT: null,
	presentedFrame: -1,

	// ---- context ----
	ctx() {
		if (UnityGpu.gl) return UnityGpu.gl;
		const c = document.createElement("canvas");
		c.id = "cards-overlay";
		c.width = 1; c.height = 1;
		c.style.cssText = "position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:4;";
		(document.getElementById("stage") || document.body).appendChild(c);
		const gl = c.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
		if (!gl) throw new Error("cards panel: WebGL2 context unavailable");
		UnityGpu.canvas = c;
		UnityGpu.gl = gl;
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		UnityGpu.progPanel = UnityGpu.program(CP_VS, CP_FS);
		UnityGpu.progPresent = UnityGpu.program(CP_VS_PRESENT, CP_FS_PRESENT);
		const p = UnityGpu.progPanel;
		gl.useProgram(p.p);
		gl.uniform1i(p.u("_MainTex"), 0);
		gl.uniform1i(p.u("_UTex"), 1);
		gl.uniform1i(p.u("_VTex"), 2);
		gl.useProgram(UnityGpu.progPresent.p);
		gl.uniform1i(UnityGpu.progPresent.u("_MainTex"), 0);
		UnityGpu.unitVao = gl.createVertexArray();
		gl.bindVertexArray(UnityGpu.unitVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
		gl.bindVertexArray(null);
		UnityGpu.grayTex = UnityGpu.newGlTex(1, 1, gl.RGBA8, false, false);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 128]));
		UnityGpu.frameTex = gl.createTexture();
		return gl;
	},

	program(vsSrc, fsSrc) {
		const gl = UnityGpu.gl;
		const sh = (type, src) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("cards panel: shader compile failed: " + gl.getShaderInfoLog(s));
			return s;
		};
		const p = gl.createProgram();
		gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
		gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("cards panel: shader link failed: " + gl.getProgramInfoLog(p));
		const cache = new Map();
		return { p, u(name) { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name); } };
	},

	newGlTex(w, h, fmt, smooth, repeat) {
		const gl = UnityGpu.gl;
		const t = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
		UnityGpu.sampler(smooth, repeat);
		return t;
	},

	sampler(smooth, repeat) {
		const gl = UnityGpu.gl;
		const f = smooth ? gl.LINEAR : gl.NEAREST;
		const wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
	},

	// GL texture for a Unity texture object in this context.
	glTex(t) {
		const gl = UnityGpu.gl;
		if (t == null) return UnityGpu.grayTex;
		if (typeof Gfx !== "undefined" && t === Gfx.mainRT) return UnityGpu.frameTexture();
		if (t instanceof URenderTexture) {
			if (!t.$cp) t.Create();
			if (t.$cpFilter !== t.filterMode) {
				gl.bindTexture(gl.TEXTURE_2D, t.$cp);
				UnityGpu.sampler(t.filterMode !== 0, false);
				t.$cpFilter = t.filterMode;
			}
			return t.$cp;
		}
		if (t instanceof UFontTexture) {
			if (!t.$cp) t.$cp = gl.createTexture();
			if (t.$cpVersion !== t.version) {
				gl.bindTexture(gl.TEXTURE_2D, t.$cp);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.canvas);
				UnityGpu.sampler(true, false);
				t.$cpVersion = t.version;
			}
			return t.$cp;
		}
		if (t.data && t.width && t.height) {
			const r8 = t.format === 63;
			if (!t.$cp || t.$cpW !== t.width || t.$cpH !== t.height) {
				if (t.$cp) gl.deleteTexture(t.$cp);
				t.$cp = UnityGpu.newGlTex(t.width, t.height, r8 ? gl.R8 : gl.RGBA8, t.filterMode !== 0, t.wrapMode === 0);
				t.$cpW = t.width; t.$cpH = t.height;
				t.$cpVersion = undefined;
			}
			if (t.$cpVersion !== t.version) {
				gl.bindTexture(gl.TEXTURE_2D, t.$cp);
				UnityGpu.sampler(t.filterMode !== 0, t.wrapMode === 0);
				const d = t.data;
				const bytes = new Uint8Array(d.buffer, d.byteOffset, t.width * t.height * (r8 ? 1 : 4));
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.width, t.height, r8 ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, bytes);
				t.$cpVersion = t.version;
			}
			return t.$cp;
		}
		return UnityGpu.grayTex;
	},

	// Gfx.mainRT as seen on screen this frame (Gfx and PostFx have presented it to Gfx.canvas).
	frameTexture() {
		const gl = UnityGpu.gl;
		gl.bindTexture(gl.TEXTURE_2D, UnityGpu.frameTex);
		if (UnityGpu.frameCopied !== Unity.frame && Gfx.canvas) {
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, Gfx.canvas);
			UnityGpu.sampler(false, false);
			UnityGpu.frameCopied = Unity.frame;
		}
		return UnityGpu.frameTex;
	},

	texSize(t) {
		return t ? [t.width | 0, t.height | 0] : [1, 1];
	},

	propId(name) {
		let id = UnityGpu.propIds.get(name);
		if (id === undefined) {
			id = UnityGpu.propNames.length + 1000;
			UnityGpu.propIds.set(name, id);
			UnityGpu.propNames.push(name);
		}
		return id;
	},
	propName(id) { return UnityGpu.propNames[id - 1000]; },

	// ---- command buffer execution ----
	execute(cb) {
		const gl = UnityGpu.ctx();
		const prog = UnityGpu.progPanel;
		let target = null;
		for (const c of cb.cmds) {
			switch (c.op) {
				case "global":
					UnityGpu.globals.set(c.name, c.v);
					break;
				case "target":
					target = c.rt;
					UnityGpu.bindTarget(target);
					break;
				case "clear":
					if (c.color) {
						gl.clearColor(c.col.r, c.col.g, c.col.b, c.col.a);
						gl.clear(gl.COLOR_BUFFER_BIT);
					}
					break;
				case "draw": {
					const sub = c.mesh.subs[c.sub];
					if (!sub || sub.indexCount <= 0 || !c.mesh.vao) break;
					gl.useProgram(prog.p);
					const g = (n) => UnityGpu.globals.get(n) || c.props.vecs.get(n) || { x: 0, y: 0, z: 0, w: 0 };
					const T = g("_CPTarget"), O = g("_CPOffset");
					gl.uniform4f(prog.u("_CPTarget"), T.x, T.y, T.z, T.w);
					gl.uniform4f(prog.u("_CPOffset"), O.x, O.y, O.z, O.w);
					const main = c.props.texs.has("_MainTex") ? c.props.texs.get("_MainTex") : c.mat.texs.get("_MainTex");
					const ts = c.props.vecs.get("_MainTex_TexelSize");
					const [mw, mh] = UnityGpu.texSize(main);
					if (ts) gl.uniform4f(prog.u("_MainTex_TexelSize"), ts.x, ts.y, ts.z, ts.w);
					else gl.uniform4f(prog.u("_MainTex_TexelSize"), 1 / Math.max(1, mw), 1 / Math.max(1, mh), mw, mh);
					const units = [["_MainTex", main], ["_UTex", c.props.texs.get("_UTex")], ["_VTex", c.props.texs.get("_VTex")]];
					for (let i = 0; i < 3; i++) {
						gl.activeTexture(gl.TEXTURE0 + i);
						const t = units[i][1];
						if (t != null && t === target) throw new Error("cards panel: render target sampled while bound");
						gl.bindTexture(gl.TEXTURE_2D, UnityGpu.glTex(t));
					}
					gl.activeTexture(gl.TEXTURE0);
					gl.enable(gl.BLEND);
					gl.blendEquation(gl.FUNC_ADD);
					if (c.pass === 1) gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
					else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
					gl.bindVertexArray(c.mesh.vao);
					gl.drawElements(gl.TRIANGLES, sub.indexCount, gl.UNSIGNED_INT, sub.indexStart * 4);
					gl.bindVertexArray(null);
					break;
				}
			}
		}
		gl.disable(gl.BLEND);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	},

	bindTarget(rt) {
		const gl = UnityGpu.gl;
		if (rt instanceof URenderTexture) {
			if (!rt.$cp) rt.Create();
			gl.bindFramebuffer(gl.FRAMEBUFFER, rt.$fbo);
			gl.viewport(0, 0, rt.width, rt.height);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, UnityGpu.canvas.width, UnityGpu.canvas.height);
		}
	},

	// ---- frame hook: MonoBehaviour.LateUpdate, then the overlay canvases ----
	lateUpdate() {
		const list = UnityGpu.behaviours.slice();
		for (const b of list) {
			if (b.$dead || b.enabled === false || !b.gameObject || b.gameObject.$dead) continue;
			try { b.LateUpdate(); } catch (e) { if (typeof Host !== "undefined") Host.fail("LateUpdate", e); }
		}
		UnityGpu.present();
	},

	present() {
		let img = null;
		for (const go of UGameObject.all) {
			if (go.$dead) continue;
			for (const c of go.components) if (c instanceof URawImage && c.enabled !== false && c.texture) img = c;
		}
		const cv = UnityGpu.canvas;
		if (!img) {
			if (cv && cv.style.display !== "none") cv.style.display = "none";
			return;
		}
		const gl = UnityGpu.ctx();
		const t = img.texture;
		if (cv.width !== t.width || cv.height !== t.height) { cv.width = t.width; cv.height = t.height; }
		const sw = Unity.screen.width, sh = Unity.screen.height;
		const css = sw + "px";
		if (cv.style.width !== css || cv.style.height !== sh + "px") { cv.style.width = css; cv.style.height = sh + "px"; }
		if (cv.style.display !== "block") cv.style.display = "block";
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, cv.width, cv.height);
		gl.disable(gl.BLEND);
		gl.useProgram(UnityGpu.progPresent.p);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, UnityGpu.glTex(t));
		gl.bindVertexArray(UnityGpu.unitVao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
		UnityGpu.presentedFrame = Unity.frame;
	},

	// Readback of a texture rendered in this context, rows top first (tests).
	ReadRT(rt) {
		const gl = UnityGpu.ctx();
		UnityGpu.bindTarget(rt);
		const w = rt.width, h = rt.height;
		const raw = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return raw;
	},
};

// ---- objects ----

class UTexture {
	constructor(w, h) {
		this.width = w | 0;
		this.height = h | 0;
		this.filterMode = 1;
		this.wrapMode = 0;
		this.name = "";
	}
	$destroy() {
		if (this.$cp && UnityGpu.gl) UnityGpu.gl.deleteTexture(this.$cp);
		this.$cp = null;
		if (this.$gl && typeof Gfx !== "undefined" && Gfx._gl) Gfx._gl.deleteTexture(this.$gl);
		this.$gl = null;
	}
}

class UTexture2D extends UTexture {
	constructor(w, h, format) {
		super(w, h);
		this.format = format;
		this.data = format === 63 ? new Uint8Array(this.width * this.height) : new Uint32Array(this.width * this.height);
		this.version = 0;
	}
}

class UFontTexture extends UTexture {
	constructor(canvas) {
		super(canvas.width, canvas.height);
		this.canvas = canvas;
		this.version = 0;
		this.filterMode = 1;
		this.wrapMode = 1;
	}
}

class URenderTexture extends UTexture {
	constructor(desc) {
		super(desc.width, desc.height);
		this.wrapMode = 1;
		this.$fbo = null;
	}
	Create() {
		const gl = UnityGpu.ctx();
		if (this.$cp) return true;
		this.$cp = UnityGpu.newGlTex(this.width, this.height, gl.RGBA8, this.filterMode !== 0, false);
		this.$cpFilter = this.filterMode;
		this.$fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.$fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.$cp, 0);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return true;
	}
	$destroy() {
		if (this.$fbo && UnityGpu.gl) UnityGpu.gl.deleteFramebuffer(this.$fbo);
		this.$fbo = null;
		super.$destroy();
	}
}

class UMesh {
	constructor() {
		this.name = "";
		this.vao = null;
		this.vbo = null;
		this.ibo = null;
		this.vcount = 0;
		this.stride = 0;
		this.cpu = null;
		this.subs = [];
	}
	SetVertexBufferParams(count, layout) {
		const gl = UnityGpu.ctx();
		let floats = 0;
		const attrs = [];
		for (const a of layout) { attrs.push({ attr: a.attribute, off: floats, dim: a.dimension }); floats += a.dimension; }
		this.stride = floats;
		this.vcount = count;
		this.cpu = new Float32Array(count * floats);
		if (!this.vao) { this.vao = gl.createVertexArray(); this.vbo = gl.createBuffer(); this.ibo = gl.createBuffer(); }
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, this.cpu.byteLength, gl.DYNAMIC_DRAW);
		for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
		const LOC = { 0: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
		for (const a of attrs) {
			const loc = LOC[a.attr];
			if (loc === undefined) continue;
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, a.dim, gl.FLOAT, false, floats * 4, a.off * 4);
		}
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		gl.bindVertexArray(null);
	}
	SetVertexBufferData(list, dataStart, meshStart, count) {
		const gl = UnityGpu.ctx();
		const f = this.cpu, n = this.stride;
		if (n !== PV_FIELDS.length) throw new Error("cards panel: vertex layout has " + n + " floats, PV has " + PV_FIELDS.length);
		let o = meshStart * n;
		for (let i = 0; i < count; i++) {
			const v = list[dataStart + i];
			f[o] = v.x; f[o + 1] = v.y; f[o + 2] = v.w; f[o + 3] = v.r; f[o + 4] = v.g; f[o + 5] = v.b; f[o + 6] = v.a;
			f[o + 7] = v.u; f[o + 8] = v.v; f[o + 9] = v.lx; f[o + 10] = v.ly; f[o + 11] = v.p0; f[o + 12] = v.p1;
			f[o + 13] = v.p2; f[o + 14] = v.p3; f[o + 15] = v.mode; f[o + 16] = v.q1; f[o + 17] = v.q2; f[o + 18] = v.q3;
			f[o + 19] = v.c0; f[o + 20] = v.c1; f[o + 21] = v.c2; f[o + 22] = v.c3;
			o += n;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferSubData(gl.ARRAY_BUFFER, meshStart * n * 4, f, meshStart * n, count * n);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}
	SetIndexBufferData(arr, dataStart, meshStart, count) {
		const gl = UnityGpu.ctx();
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		const src = arr instanceof Uint32Array ? arr : Uint32Array.from(arr);
		if (meshStart === 0 && dataStart === 0) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, src.subarray(0, count), gl.STATIC_DRAW);
		else gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, meshStart * 4, src, dataStart, count);
		gl.bindVertexArray(null);
	}
	$destroy() {
		const gl = UnityGpu.gl;
		if (gl && this.vao) { gl.deleteVertexArray(this.vao); gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); }
		this.vao = this.vbo = this.ibo = null;
	}
}

class UPropertyBlock {
	constructor() { this.texs = new Map(); this.vecs = new Map(); }
	clone() { const p = new UPropertyBlock(); p.texs = new Map(this.texs); p.vecs = new Map(this.vecs); return p; }
}

class UMaterial {
	constructor(shader) { this.shader = shader; this.floats = new Map(); this.texs = new Map(); this.name = ""; }
	$destroy() { }
}

class UCommandBuffer {
	constructor() { this.cmds = []; this.name = ""; }
}

class UGameObject {
	constructor(name) {
		this.name = name;
		this.components = [];
		this.transform = { gameObject: this, parent: null };
		UGameObject.all.push(this);
	}
	$destroy() {
		if (this.$dead) return;
		this.$dead = true;
		for (const c of this.components) {
			c.$dead = true;
			if (typeof c.OnDestroy === "function") { try { c.OnDestroy(); } catch (e) { if (typeof Host !== "undefined") Host.fail("OnDestroy", e); } }
		}
		UnityGpu.behaviours = UnityGpu.behaviours.filter((b) => !b.$dead);
		UGameObject.all = UGameObject.all.filter((g) => g !== this);
	}
}
UGameObject.all = [];

class UComponent { constructor() { this.enabled = true; this.gameObject = null; } }
class UCanvas extends UComponent { constructor() { super(); this.renderMode = 0; this.sortingOrder = 0; } }
class UCanvasScaler extends UComponent { constructor() { super(); this.uiScaleMode = 0; this.scaleFactor = 1; } }
class URawImage extends UComponent {
	constructor() { super(); this.texture = null; this.material = null; this.raycastTarget = true; this.rectTransform = { anchorMin: null, anchorMax: null, offsetMin: null, offsetMax: null }; }
}

// AddComponent<T>() reaches JS with T erased; the component types per GameObject come from G.cs EnsureHost.
const UNITY_COMPONENT_PLAN = {
	"Arrowstorm Cards Panel": [() => new G$CARDSPANEL$Host(), () => new UCanvas(), () => new UCanvasScaler()],
	"Panel": [() => new URawImage()],
};

// ---- dynamic OS fonts (Font.CreateDynamicFontFromOSFont) rasterized with a 2D canvas ----

class UFont {
	constructor(names, size) {
		const q = (n) => /^[A-Za-z][A-Za-z0-9-]*$/.test(n) ? n : "\"" + String(n).replace(/"/g, "") + "\"";
		this.family = names.map(q).concat(["Arial", "sans-serif"]).join(", ");
		this.size = size;
		this.glyphs = new Map();
		this.canvas = document.createElement("canvas");
		this.canvas.width = 512;
		this.canvas.height = 256;
		this.g = this.canvas.getContext("2d", { willReadFrequently: false });
		this.tex = new UFontTexture(this.canvas);
		this.material = { mainTexture: this.tex };
		this.penX = 1; this.penY = 1; this.rowH = 0;
	}
	request(text, size) {
		for (let i = 0; i < text.length; i++) {
			const ch = text.charCodeAt(i);
			if (!this.glyphs.has(ch + "|" + size)) this.raster(ch, size);
		}
	}
	raster(ch, size) {
		const g = this.g;
		const s = String.fromCharCode(ch);
		g.font = size + "px " + this.family;
		g.textBaseline = "alphabetic";
		g.textAlign = "left";
		const m = g.measureText(s);
		let minX = Math.floor(-m.actualBoundingBoxLeft), maxX = Math.ceil(m.actualBoundingBoxRight);
		let maxY = Math.ceil(m.actualBoundingBoxAscent), minY = -Math.ceil(m.actualBoundingBoxDescent);
		if (!(maxX > minX) || !(maxY > minY) || /\s/.test(s)) { minX = maxX = 0; minY = maxY = 0; }
		const w = maxX - minX, h = maxY - minY;
		if (this.penX + w + 1 > this.canvas.width) { this.penX = 1; this.penY += this.rowH + 1; this.rowH = 0; }
		if (this.penY + h + 1 > this.canvas.height) {
			if (!this.grow()) return;
			return this.raster(ch, size);
		}
		const x = this.penX, y = this.penY;
		if (w > 0) {
			g.save();
			g.beginPath();
			g.rect(x, y, w, h);
			g.clip();
			g.fillStyle = "#fff";
			g.fillText(s, x - minX, y + maxY);
			g.restore();
			this.tex.version++;
		}
		this.penX += w + 1;
		this.rowH = Math.max(this.rowH, h);
		const W = this.canvas.width, H = this.canvas.height;
		this.glyphs.set(ch + "|" + size, {
			advance: Math.round(m.width), minX, maxX, minY, maxY,
			x, y, w, h,
			uvTopLeft: $uV2(x / W, y / H), uvTopRight: $uV2((x + w) / W, y / H),
			uvBottomRight: $uV2((x + w) / W, (y + h) / H), uvBottomLeft: $uV2(x / W, (y + h) / H),
		});
	}
	// Unity rebuilds the font texture when it fills; here it doubles (to 2048) and re-rasterizes.
	grow() {
		if (this.canvas.height >= 2048 && this.canvas.width >= 2048) return false;
		const keys = [...this.glyphs.keys()];
		if (this.canvas.width < 2048 && this.canvas.width <= this.canvas.height) this.canvas.width *= 2;
		else this.canvas.height *= 2;
		this.tex.width = this.canvas.width;
		this.tex.height = this.canvas.height;
		this.tex.version++;
		this.glyphs.clear();
		this.penX = 1; this.penY = 1; this.rowH = 0;
		for (const k of keys) { const [c, s] = k.split("|"); this.raster(+c, +s); }
		return true;
	}
}

// ---- PNG encode (ImageConversion.EncodeToPNG): stored deflate, rows written top first ----
const UnityPng = {
	crcTable: null,
	crc(buf) {
		if (!UnityPng.crcTable) {
			UnityPng.crcTable = new Uint32Array(256);
			for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; UnityPng.crcTable[n] = c >>> 0; }
		}
		let c = 0xffffffff;
		for (let i = 0; i < buf.length; i++) c = UnityPng.crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	},
	encode(w, h, rgba) {
		const raw = new Uint8Array((w * 4 + 1) * h);
		for (let y = 0; y < h; y++) raw.set(rgba.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * (w * 4 + 1) + 1);
		const blocks = [];
		for (let i = 0; i < raw.length || i === 0; i += 65535) {
			const part = raw.subarray(i, Math.min(raw.length, i + 65535));
			const last = i + 65535 >= raw.length;
			const b = new Uint8Array(5 + part.length);
			b[0] = last ? 1 : 0; b[1] = part.length & 255; b[2] = part.length >>> 8; b[3] = ~part.length & 255; b[4] = (~part.length >>> 8) & 255;
			b.set(part, 5);
			blocks.push(b);
			if (last) break;
		}
		let a = 1, bsum = 0;
		for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; bsum = (bsum + a) % 65521; }
		const zlen = 2 + blocks.reduce((s, b) => s + b.length, 0) + 4;
		const z = new Uint8Array(zlen);
		z[0] = 0x78; z[1] = 0x01;
		let o = 2;
		for (const b of blocks) { z.set(b, o); o += b.length; }
		const ad = ((bsum << 16) | a) >>> 0;
		z[o] = ad >>> 24; z[o + 1] = (ad >>> 16) & 255; z[o + 2] = (ad >>> 8) & 255; z[o + 3] = ad & 255;
		const chunk = (type, data) => {
			const c = new Uint8Array(12 + data.length);
			const dv = new DataView(c.buffer);
			dv.setUint32(0, data.length);
			for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
			c.set(data, 8);
			dv.setUint32(8 + data.length, UnityPng.crc(c.subarray(4, 8 + data.length)));
			return c;
		};
		const ihdr = new Uint8Array(13);
		const dv = new DataView(ihdr.buffer);
		dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
		const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array(0))];
		const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
		let k = 0;
		for (const p of parts) { out.set(p, k); k += p.length; }
		return out;
	},
};

const UNITY_SHADERS = new Map([
	["shaders/cardspanel", "Hidden/Arrowstorm/CardsPanel"],
	["shaders/cardspanelpresent", "Hidden/Arrowstorm/CardsPanelPresent"],
]);

{
	const resourcesLoad = $x.Resources_Load_1;
	const frameEnd = Unity.frameEnd;
	Unity.frameEnd = function () { UnityGpu.lateUpdate(); return frameEnd.apply(this, arguments); };


	Object.assign($x, {
		Resources_Load_1: (name) => {
			const shader = UNITY_SHADERS.get(String(name).toLowerCase());
			return shader ? { $shader: true, name: shader } : resourcesLoad(name);
		},
		Shader_Find_1: (name) => [...UNITY_SHADERS.values()].includes(name) ? { $shader: true, name } : null,
		Shader_PropertyToID_1: (name) => UnityGpu.propId(name),

		// GameObject / components / UGUI
		new_GameObject: (name) => new UGameObject(name),
		GameObject_get_transform_0: (go) => go.transform,
		Component_get_transform_0: (c) => c && c.gameObject ? c.gameObject.transform : null,
		Transform_SetParent_2: (t, p) => { if (t) t.parent = p; },
		GameObject_AddComponent_0: (go) => {
			const plan = UNITY_COMPONENT_PLAN[go.name];
			const make = plan && plan[go.components.length];
			const c = make ? make() : new UComponent();
			if (c.enabled === undefined) c.enabled = true;
			c.gameObject = go;
			go.components.push(c);
			if (typeof c.LateUpdate === "function") UnityGpu.behaviours.push(c);
			return c;
		},
		Canvas_set_renderMode_1: (c, v) => { c.renderMode = v; },
		Canvas_set_sortingOrder_1: (c, v) => { c.sortingOrder = v; },
		CanvasScaler_set_uiScaleMode_1: (c, v) => { c.uiScaleMode = v; },
		CanvasScaler_set_scaleFactor_1: (c, v) => { c.scaleFactor = v; },
		Graphic_set_raycastTarget_1: (g, v) => { g.raycastTarget = v; },
		Graphic_set_material_1: (g, m) => { g.material = m; },
		Graphic_get_rectTransform_0: (g) => g.rectTransform || (g.rectTransform = {}),
		RectTransform_set_anchorMin_1: (r, v) => { r.anchorMin = v; },
		RectTransform_set_anchorMax_1: (r, v) => { r.anchorMax = v; },
		RectTransform_set_offsetMin_1: (r, v) => { r.offsetMin = v; },
		RectTransform_set_offsetMax_1: (r, v) => { r.offsetMax = v; },
		RawImage_get_texture_0: (r) => r.texture,
		RawImage_set_texture_1: (r, t) => { r.texture = t; },

		// Materials, property blocks
		new_Material: (shader) => new UMaterial(shader),
		Material_SetFloat_2: (m, name, v) => { m.floats.set(name, v); },
		Material_get_mainTexture_0: (m) => m.mainTexture !== undefined ? m.mainTexture : (m.texs ? m.texs.get("_MainTex") || null : null),
		new_MaterialPropertyBlock: () => new UPropertyBlock(),
		MaterialPropertyBlock_Clear_0: (p) => { p.texs.clear(); p.vecs.clear(); },
		MaterialPropertyBlock_SetTexture_2: (p, id, t) => { p.texs.set(typeof id === "number" ? UnityGpu.propName(id) : id, t); },
		MaterialPropertyBlock_SetVector_2: (p, id, v) => { p.vecs.set(typeof id === "number" ? UnityGpu.propName(id) : id, { x: v.x, y: v.y, z: v.z, w: v.w }); },

		// Textures
		new_Texture2D: (w, h, format) => new UTexture2D(w, h, format === undefined ? 4 : format),
		Texture_get_width_0: (t) => t.width,
		Texture_get_height_0: (t) => t.height,
		Texture_set_filterMode_1: (t, v) => { t.filterMode = v; },
		Texture_set_wrapMode_1: (t, v) => { t.wrapMode = v; },
		Texture_set_anisoLevel_1: () => { },
		Texture2D_SetPixelData_3: (t, data, mip, offset) => {
			if (!offset && data.length === t.data.length && data.BYTES_PER_ELEMENT === t.data.BYTES_PER_ELEMENT) { t.data = data; return; }
			const dst = new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength);
			const src = new Uint8Array(data.buffer, data.byteOffset + (offset | 0) * data.BYTES_PER_ELEMENT, Math.min(dst.length, data.byteLength - (offset | 0) * data.BYTES_PER_ELEMENT));
			dst.set(src);
		},
		Texture2D_SetPixels32_1: (t, cols) => {
			const d = new Uint32Array(t.width * t.height);
			for (let i = 0; i < d.length && i < cols.length; i++) {
				const c = cols[i];
				if (c) d[i] = ((c.r & 255) | ((c.g & 255) << 8) | ((c.b & 255) << 16) | ((c.a & 255) << 24)) >>> 0;
			}
			t.data = d;
		},
		Texture2D_GetPixels32_0: (t) => {
			const d = t.data, out = new Array(t.width * t.height);
			for (let i = 0; i < out.length; i++) {
				const v = t.format === 63 ? (d[i] << 24) >>> 0 : d[i];
				out[i] = { r: v & 255, g: (v >>> 8) & 255, b: (v >>> 16) & 255, a: v >>> 24 };
			}
			return out;
		},
		Texture2D_Apply_1: (t) => { t.version++; },
		Texture2D_Apply_2: (t) => { t.version++; },
		Texture2D_ReadPixels_4: (t, rect, dx, dy) => {
			const rt = UnityGpu.activeRT;
			if (!rt) return;
			const px = (typeof Gfx !== "undefined" && rt === Gfx.mainRT) || (rt.fbo && !(rt instanceof URenderTexture)) ? Gfx.ReadPixels(rt) : UnityGpu.ReadRT(rt);
			const src = new Uint32Array(px.buffer, px.byteOffset, rt.width * rt.height);
			const w = Math.min(rect.width | 0, t.width - dx), h = Math.min(rect.height | 0, t.height - dy);
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.data[(dy + y) * t.width + dx + x] = src[(rect.y + y) * rt.width + rect.x + x];
		},
		ImageConversion_EncodeToPNG_1: (t) => {
			const d = t.data;
			const rgba = new Uint8Array(t.width * t.height * 4);
			if (t.format === 63) for (let i = 0; i < d.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = d[i]; rgba[i * 4 + 3] = 255; }
			else rgba.set(new Uint8Array(d.buffer, d.byteOffset, rgba.length));
			return UnityPng.encode(t.width, t.height, rgba);
		},
		new_RenderTextureDescriptor: (w, h, format, depth) => ({ width: w, height: h, format, depth, sRGB: false, useMipMap: false, autoGenerateMips: false, msaaSamples: 1 }),
		RenderTextureDescriptor_set_sRGB_1: (d, v) => { d.sRGB = v; },
		RenderTextureDescriptor_set_useMipMap_1: (d, v) => { d.useMipMap = v; },
		RenderTextureDescriptor_set_autoGenerateMips_1: (d, v) => { d.autoGenerateMips = v; },
		RenderTextureDescriptor_set_msaaSamples_1: (d, v) => { d.msaaSamples = v; },
		new_RenderTexture: (desc) => new URenderTexture(desc),
		RenderTexture_Create_0: (rt) => rt.Create(),
		RenderTexture_get_width_0: (rt) => rt.width,
		RenderTexture_get_height_0: (rt) => rt.height,
		RenderTexture_get_active_0: () => UnityGpu.activeRT,
		RenderTexture_set_active_1: (rt) => { UnityGpu.activeRT = rt; },
		RenderTargetIdentifier_op_Implicit_1: (rt) => rt,

		// Meshes
		new_Mesh: () => new UMesh(),
		Mesh_MarkDynamic_0: () => { },
		Mesh_set_bounds_1: (m, b) => { m.bounds = b; },
		new_Bounds: (center, size) => ({ center, size }),
		new_VertexAttributeDescriptor: (attribute, format, dimension, stream) => ({ attribute, format, dimension, stream }),
		new_SubMeshDescriptor: (indexStart, indexCount, topology) => ({ indexStart, indexCount, topology: topology | 0, firstVertex: 0, vertexCount: 0 }),
		SubMeshDescriptor_set_firstVertex_1: (s, v) => { s.firstVertex = v; },
		SubMeshDescriptor_set_vertexCount_1: (s, v) => { s.vertexCount = v; },
		Mesh_SetVertexBufferParams_2: (m, count, layout) => m.SetVertexBufferParams(count, layout),
		Mesh_SetIndexBufferParams_2: (m, count, fmt) => { if (fmt !== 1) throw new Error("cards panel: 16-bit index buffer not handled"); m.icount = count; },
		Mesh_SetVertexBufferData_6: (m, list, dataStart, meshStart, count) => m.SetVertexBufferData(list, dataStart, meshStart, count),
		Mesh_SetIndexBufferData_5: (m, arr, dataStart, meshStart, count) => m.SetIndexBufferData(arr, dataStart, meshStart, count),
		Mesh_SetSubMeshes_2: (m, subs) => { m.subs = subs.map((s) => ({ indexStart: s.indexStart, indexCount: s.indexCount, firstVertex: s.firstVertex, vertexCount: s.vertexCount })); },

		// Command buffers
		new_CommandBuffer: () => new UCommandBuffer(),
		CommandBuffer_set_name_1: (cb, n) => { cb.name = n; },
		CommandBuffer_Clear_0: (cb) => { cb.cmds.length = 0; },
		CommandBuffer_Release_0: (cb) => { cb.cmds.length = 0; },
		CommandBuffer_SetGlobalVector_2: (cb, id, v) => { cb.cmds.push({ op: "global", name: UnityGpu.propName(id), v: { x: v.x, y: v.y, z: v.z, w: v.w } }); },
		CommandBuffer_SetRenderTarget_1: (cb, rt) => { cb.cmds.push({ op: "target", rt }); },
		CommandBuffer_ClearRenderTarget_3: (cb, depth, color, col) => { cb.cmds.push({ op: "clear", color, col: { r: col.r, g: col.g, b: col.b, a: col.a } }); },
		CommandBuffer_DrawMesh_6: (cb, mesh, matrix, mat, sub, pass, props) => {
			if (sub < 0) return;
			cb.cmds.push({ op: "draw", mesh, mat, sub, pass, props: props ? props.clone() : new UPropertyBlock() });
		},
		Graphics_ExecuteCommandBuffer_1: (cb) => UnityGpu.execute(cb),

		// Fonts
		Font_CreateDynamicFontFromOSFont_2: (names, size) => new UFont(Array.isArray(names) ? names : [names], size),
		Font_RequestCharactersInTexture_3: (f, text, size) => f.request(text || "", size > 0 ? size : f.size),
		Font_GetCharacterInfo_4: (f, ch, info, size) => {
			const c = typeof ch === "number" ? ch : String(ch).charCodeAt(0);
			const g = f.glyphs.get(c + "|" + (size > 0 ? size : f.size));
			info.v = g || null;
			return !!g;
		},
		Font_get_material_0: (f) => f.material,
		CharacterInfo_get_advance_0: (i) => i.advance,
		CharacterInfo_get_minX_0: (i) => i.minX,
		CharacterInfo_get_maxX_0: (i) => i.maxX,
		CharacterInfo_get_minY_0: (i) => i.minY,
		CharacterInfo_get_maxY_0: (i) => i.maxY,
		CharacterInfo_get_uvTopLeft_0: (i) => i.uvTopLeft,
		CharacterInfo_get_uvTopRight_0: (i) => i.uvTopRight,
		CharacterInfo_get_uvBottomRight_0: (i) => i.uvBottomRight,
		CharacterInfo_get_uvBottomLeft_0: (i) => i.uvBottomLeft,
	});
}
