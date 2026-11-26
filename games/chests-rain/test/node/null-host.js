"use strict";
// Null graphics and audio for node: counts work instead of drawing or playing.
class Gfx {
	static Init() { Gfx.mainRT = { width: 640, height: 360 }; }
	static Shutdown() { }
	static BeginFrame() { Gfx.quads = 0; }
	static EndFrame() { Gfx.quadsLastFrame = Gfx.quads; }
	static Quad() { Gfx.quads++; }
	static QuadYuv() { Gfx.quads++; }
	static BackdropQuad() { Gfx.quads++; }
	static GradientQuad() { Gfx.quads++; }
	static Clear() { }
	static CompositeShadow() { }
	static SnapshotWorld() { }
	static SnapshotBloomSource() { }
	static Ensure(img, a, b, c, d) { a.v = 0; b.v = 0; c.v = 1 / img.width; d.v = 1 / img.height; return Gfx.tex; }
	static EnsureSmooth(img, a, b, c, d) { return Gfx.Ensure(img, a, b, c, d); }
	static WhiteTex(u, v) { u.v = 0; v.v = 0; return Gfx.tex; }
	static Release() { }
	static MarkTransient() { }
	static ReleaseTransient() { }
}
Gfx.tex = { width: 1, height: 1 };
Gfx.quads = 0; Gfx.quadsLastFrame = 0; Gfx.drawsLastFrame = 0;
Gfx.MAIN = 0; Gfx.SHADOW = 1; Gfx.TW = 640; Gfx.TH = 360;
Gfx.bloomSrcValid = false; Gfx.worldValid = false; Gfx.hudValid = false;
class PostFx {
	static Init() { }
	static Shutdown() { }
	static Render() { return false; }
}
PostFx.Active = false; PostFx.ScreenMaterial = null;
class AudioOutput { static Attach() { } static Detach() { } static OutputSampleRate() { return 0; } }
