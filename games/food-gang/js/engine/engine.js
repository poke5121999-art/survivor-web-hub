// Engine: loads exported scenes/prefabs, runs Unity's frame order (FixedUpdate, Update, Animator, LateUpdate,
// camera, render) and draws the world (perspective camera, sorted sprites) plus uGUI canvases.
import { Assets, stats } from './assets.js';
import { buildNodes } from './scene.js';
import { Renderer, packColor } from './render.js';
import { AnimatorRuntime, LegacyAnimation } from './anim.js';
import { ParticleRuntime } from './particles.js';
import { UISystem, drawTextQuads } from './ui.js';
import { buildText } from './text.js';
import { CinemachineRuntime } from './camera.js';
import { AudioSystem } from './audio.js';
import { Input } from './input.js';
import { mat4, mul, invert, perspective, ortho, xform, eulerToQuat } from './math.js';

export { stats };

const FIXED_DT = 0.02;

export class Engine {
  constructor(canvas, base, rev = '') {
    this.canvas = canvas;
    this.assets = new Assets(base, rev);
    this.roots = [];
    this.instances = [];
    this.spriteRenderers = []; this.meshRenderers = []; this.particles = []; this.animators = []; this.animations = [];
    this.canvases = []; this.cameras = []; this.texts = []; this.audioSources = []; this.buttons = []; this.vcams = [];
    this.hooks = { fixed: [], update: [], late: [] };
    this.time = 0; this.dt = 0; this.timeScale = 1; this.frame = 0; this.realTime = 0; this.rawDt = 0;
    this.acc = 0;
    this.post = null;
    this.clearColor = [0, 0, 0, 1];
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.onAnimEvent = null;
    this.bloomScale = 0;
    window.fgEngineStats = stats;
  }

  async init() {
    await this.assets.init();
    this.R = new Renderer(this.canvas, this.assets);
    this.ui = new UISystem(this);
    this.audio = new AudioSystem(this.assets);
    this.input = new Input(this.canvas, this);
    return this;
  }

  // ------------------------------------------------------------------------------------------------ instantiate

  // layer: popup depth (PopupSceneManager stacks scenes; a higher layer draws and takes clicks above lower ones)
  async loadScene(name, layer = 0) {
    const data = await this.assets.scene(name);
    const inst = this.spawn(data, null, layer);
    this.setupCameraRig();
    return inst;
  }

  async instantiate(prefab, parent = null, pos = null) {
    const data = typeof prefab === 'string' ? await this.assets.prefab(prefab) : prefab;
    if (typeof prefab !== 'string') await this.assets.preloadFor(data);
    const inst = this.spawn(data, parent);
    if (pos) { const r = inst.roots[0]; r.lp[0] = pos[0]; r.lp[1] = pos[1]; r.lp[2] = pos[2] ?? r.lp[2]; }
    return inst;
  }

  spawn(data, parent, layer = 0) {
    const inst = buildNodes(data, this);
    inst.root = inst.roots[0];
    inst.layer = layer;
    data.nodes.forEach((nd, i) => {
      const n = inst.nodes[i];
      for (const cd of nd.comps) {
        n.comps.push(this.makeComp(cd, n, inst));
        if (cd.type === 'MonoBehaviour' && cd.script === 'Text' && cd.fields && cd.fields.m_FontData) n.comps.push(this.makeComp(legacyText(cd), n, inst));
      }
    });
    for (const r of inst.roots) { if (parent) r.setParent(parent); else this.roots.push(r); }
    // runtimes that bind to other components come after every component exists
    for (const n of inst.nodes) for (const c of n.comps) if (c.type === 'ParticleSystem') this.afterComp(c, n, inst);
    for (const n of inst.nodes) for (const c of n.comps) if (c.type !== 'ParticleSystem') this.afterComp(c, n, inst);
    for (const n of inst.nodes) n.updateWorld(null);
    this.updateWorld();
    for (const n of inst.nodes) if (n.activeInHierarchy) this.awakeNode(n);
    this.instances.push(inst);
    stats.nodes += inst.nodes.length;
    return inst;
  }

  makeComp(cd, n, inst) {
    const c = JSON.parse(JSON.stringify(cd));
    c.node = n;
    c.enabled = cd.enabled === undefined ? true : !!cd.enabled;
    const A = this.assets;
    switch (c.type) {
      case 'SpriteRenderer':
        c.spriteRef = c.sprite; c.spriteObj = A.sprite(c.sprite); c.matObj = A.material(c.mat);
        c.flashAmount = 0; c.flashColor = [1, 1, 1];
        c.setSprite = (ref) => { if (ref !== c.spriteRef) { c.spriteRef = ref; c.spriteObj = A.sprite(ref); } };
        this.spriteRenderers.push(c);
        break;
      case 'Image':
        c.spriteRef = c.sprite;
        c.setSprite = (ref) => { if (ref !== c.spriteRef) { c.spriteRef = ref; c.sprite = ref; c.spriteObj = A.sprite(ref); } };
        break;
      case 'Text':
        c.setText = (t) => { c.text = String(t); c.dirty = true; };
        if (!c.ui) this.texts.push(c);
        break;
      case 'MeshRenderer':
        c.matObjs = (c.mats || []).map((m) => A.material(m));
        this.meshRenderers.push(c);
        break;
      case 'Canvas': c.sceneLayer = inst.layer || 0; this.canvases.push(c); break;
      case 'Camera': this.cameras.push(c); break;
      case 'AudioSource': this.audioSources.push(c); break;
      case 'Button': this.buttons.push(c); c.curTint = c.colors ? c.colors.normal.slice() : [1, 1, 1, 1]; c.state = null; break;
      case 'CinemachineCamera': this.vcams.push(c); break;
      default: break;
    }
    return c;
  }

  afterComp(c, n, inst) {
    switch (c.type) {
      case 'Animator': c.runtime = new AnimatorRuntime(c, n, this.assets, this); this.animators.push(c); break;
      case 'Animation': c.runtime = new LegacyAnimation(c, n, this.assets, this); this.animations.push(c); break;
      case 'ParticleSystem': this.particles.push(c); new ParticleRuntime(c, n, this); if (!n.activeInHierarchy) c.runtime.playing = false; break;
      case 'Button': {
        const t = inst.ref(c.target);
        c.targetComp = t && t.type ? t : null;
        if (c.targetComp) c.target = true;
        c.onClickResolved = (c.onClick || []).map((o) => ({ ...o, targetObj: inst.ref(o.target) }));
        break;
      }
      case 'CinemachineCamera': c.followNode = inst.ref(c.follow); break;
      case 'CinemachineConfiner3D': c.boundsComp = inst.ref(c.bounds); break;
      case 'MonoBehaviour':
        c.ref = (r) => inst.ref(r);
        if (c.script === 'ScrollRect') this.ui.initScroll(c, n, inst);
        else if (c.script === 'TMP_InputField') this.ui.initInput(c, n, inst);
        break;
      default: break;
    }
  }

  awakeNode(n) {
    for (const c of n.comps) {
      if (!c.enabled) continue;
      if (c.type === 'AudioSource' && c.playOnAwake && c.clip) c.handle = this.audio.play(c.clip, { volume: c.volume, pitch: c.pitch, loop: c.loop });
    }
  }

  onActiveChanged(n, on) {
    if (!on) return;
    const walk = (x) => {
      if (!x.activeSelf) return;
      for (const c of x.comps) {
        if (c.type === 'ParticleSystem' && c.playOnAwake && c.runtime && !c.runtime.playing) c.runtime.play();
        if (c.type === 'Animation' && c.auto && c.runtime) { const k = this.assets.clip(c.clip); if (k) c.runtime.play(k.key); }
        if (c.type === 'Animator' && c.runtime && !c.keepState) for (const st of c.runtime.layers) { c.runtime.enter(st, st.def.sm.def, 0); st.next = null; }
      }
      this.awakeNode(x);
      for (const ch of x.children) walk(ch);
    };
    walk(n);
  }

  destroyNode(n) {
    const kill = (x) => { x.destroyed = true; for (const ch of x.children) kill(ch); };
    kill(n);
    if (n.parent) { const i = n.parent.children.indexOf(n); if (i >= 0) n.parent.children.splice(i, 1); n.parent = null; }
    else { const i = this.roots.indexOf(n); if (i >= 0) this.roots.splice(i, 1); }
    this.dirtyLists = true;
  }

  prune() {
    if (!this.dirtyLists) return;
    for (const k of ['spriteRenderers', 'meshRenderers', 'particles', 'animators', 'animations', 'canvases', 'cameras', 'texts', 'audioSources', 'buttons', 'vcams']) {
      this[k] = this[k].filter((c) => !c.node.destroyed);
    }
    this.dirtyLists = false;
  }

  // ------------------------------------------------------------------------------------------------ camera rig

  setupCameraRig() {
    const vc = this.vcams.find((v) => v.enabled && v.node.activeInHierarchy);
    const cam = this.mainCamera();
    if (!vc || !cam) return;
    const n = vc.node;
    const composer = n.get('CinemachinePositionComposer');
    const conf = n.get('CinemachineConfiner3D');
    let box = null;
    if (conf && conf.boundsComp && conf.boundsComp.type === 'BoxCollider') {
      const bn = conf.boundsComp.node, w = bn.world, s = conf.boundsComp.size, c = conf.boundsComp.center;
      const cx = w[12] + c[0], cy = w[13] + c[1], cz = w[14] + c[2];
      box = { min: [cx - s[0] / 2, cy - s[1] / 2, cz - s[2] / 2], max: [cx + s[0] / 2, cy + s[1] / 2, cz + s[2] / 2] };
    }
    this.cine = new CinemachineRuntime(this, cam.node, vc, composer, conf ? { box } : null);
    this.post = null;
    for (const n2 of this.allNodes()) {
      const v = n2.get('Volume');
      if (v && v.enabled && n2.activeInHierarchy && v.profile) {
        // URP renders this camera without HDR, so grading runs in LDR mode: no tonemapping. Clip frames match
        // exposure alone (texture * light * 2^0.5 in linear); the profile's +20 contrast does not show, so it is off.
        // Bloom (threshold 0.5, intensity 0.66) is in the profile, but walls and tablecloths measured on clip frames
        // match exposure-only within 2-8%, while the bloom pass adds 10-20% on them: the shipped quality tier must
        // run without it. Kept switchable through engine.bloomScale.
        this.post = { ...v.profile, tonemapOn: false, contrast: 0 };
        if (this.post.bloom) this.post.bloom = { ...this.post.bloom, intensity: this.post.bloom.intensity * this.bloomScale };
      }
    }
  }

  *allNodes() {
    const st = [...this.roots];
    while (st.length) { const n = st.pop(); yield n; for (const c of n.children) st.push(c); }
  }

  mainCamera() {
    let best = null;
    for (const c of this.cameras) if (c.enabled && c.node.activeInHierarchy && !c.node.destroyed && (!best || c.depth > best.depth)) best = c;
    return best;
  }

  // ------------------------------------------------------------------------------------------------ loop

  start() {
    let last = performance.now();
    const tick = (now) => {
      // FPSSettings: 60 caps the loop on high refresh screens, 0 = every animation frame
      if (this.maxFps && now - last < 1000 / this.maxFps - 2) { this.raf = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      try { this.step(dt); } catch (e) { stats.errors.push(String(e && e.stack || e)); console.error(e); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.raf); }

  step(rawDt) {
    this.prune();
    const dt = rawDt * this.timeScale;
    this.dt = dt; this.time += dt; this.frame++;
    this.rawDt = rawDt; this.realTime = (this.realTime || 0) + rawDt;
    this.resize();
    this.handlePointer();
    this.acc += dt;
    let n = 0;
    while (this.acc >= FIXED_DT && n++ < 8) { for (const f of this.hooks.fixed) f(FIXED_DT); this.acc -= FIXED_DT; }
    for (const f of this.hooks.update) f(dt);
    this.updateButtons(rawDt);
    for (const a of this.animators) if (a.node.activeInHierarchy && a.runtime) a.runtime.update(a.unscaled ? rawDt : dt);
    for (const a of this.animations) if (a.node.activeInHierarchy && a.runtime) a.runtime.update(dt);
    for (const f of this.hooks.late) f(dt);
    this.updateWorld();
    if (this.cine) { this.cine.update(dt, this.canvas.width / this.canvas.height); this.updateWorld(); }
    stats.particles = 0;
    stats.uiParticles = 0;
    for (const p of this.particles) if (p.node.activeInHierarchy && p.runtime) p.runtime.step(dt);
    this.render();
    this.input.endFrame();
    stats.frames++;
  }

  resize() {
    const c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth * this.pixelRatio)), h = Math.max(1, Math.round(c.clientHeight * this.pixelRatio));
    this.R.resize(w, h);
  }

  updateWorld() { for (const r of this.roots) r.updateWorld(null); }

  // ------------------------------------------------------------------------------------------------ render

  render() {
    const R = this.R, W = this.canvas.width, H = this.canvas.height;
    const cam = this.mainCamera();
    const usePost = !!this.post;
    R.beginWorld(W, H, cam ? cam.bg : this.clearColor, usePost);
    if (cam) this.renderWorld(cam, W, H);
    R.endWorld(W, H, usePost ? this.post : null);
    // screen-space UI over the post-processed image
    const gl = R.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    R.uiVP = ortho(mat4(), 0, W, 0, H, -10000, 10000);
    const cvs = this.canvases.filter((c) => c.enabled && c.mode !== 2 && c.node.activeInHierarchy && !this.nestedCanvas(c.node))
      .sort(canvasOrder);
    for (const cv of cvs) { this.ui.layoutCanvas(cv, W, H); this.ui.drawCanvas(cv, R); }
    R.flush();
    R.state = null;
  }

  nestedCanvas(n) { for (let p = n.parent; p; p = p.parent) if (p.get('Canvas')) return true; return false; }

  renderWorld(cam, W, H) {
    const R = this.R;
    const proj = mat4();
    const aspect = W / H;
    if (cam.ortho) ortho(proj, -cam.size * aspect, cam.size * aspect, -cam.size, cam.size, cam.near, cam.far);
    else perspective(proj, this.cine && this.cine.vcam ? this.cine.vcam.lens.fov : cam.fov, aspect, cam.near, cam.far);
    const view = invert(mat4(), cam.node.world);
    const vp = mul(mat4(), proj, view);
    R.vp = vp;
    this.vp = vp;
    const camPos = [cam.node.world[12], cam.node.world[13], cam.node.world[14]];
    const mask = cam.mask;
    const visible = (n) => n.activeInHierarchy && ((mask >>> n.layer) & 1);
    // opaque meshes (toon shaded map); light from the material's _LightDirection euler
    for (const mr of this.meshRenderers) {
      if (!mr.enabled || !visible(mr.node) || !mr.mesh || !mr.mesh.startsWith('mesh:')) continue;
      const key = mr.mesh.slice(5);
      const data = this.assets.meshes.get(key);
      if (!data || !data.done) { if (data && !data.pending) { data.pending = 1; data.then((d) => { data.done = d; }); } continue; }
      const m = R.meshGL(key, data.done);
      const model = mr.batch && mr.batch[1] > 0 ? mat4() : mr.node.world;
      mr.matObjs.forEach((mat, i) => {
        if (mat && mat.texFile && !mat.texImg) {
          const img = this.assets.texImage(mat.texFile);
          if (img) mat.texImg = R.imageTex('tex:' + mat.texFile, img, true, true);
        }
        const ld = (mat && mat.props && mat.props._LightDirection) || [45, 45, 0];
        const ll = Math.hypot(ld[0], ld[1], ld[2]) || 1;
        R.drawMesh(m, i, model, mat, { dir: [ld[0] / ll, ld[1] / ll, ld[2] / ll] });
      });
    }
    // transparent queue
    const items = [];
    let seq = 0;
    const L = (id) => this.assets.sortingIndex(id);
    const dist2 = (w) => { const dx = w[12] - camPos[0], dy = w[13] - camPos[1], dz = w[14] - camPos[2]; return dx * dx + dy * dy + dz * dz; };
    const groupOf = (n) => { for (let p = n; p; p = p.parent) { const g = p.get('SortingGroup'); if (g && g.enabled) return g; } return null; };
    const push = (n, layer, order, draw, fudge = 0) => {
      const g = groupOf(n);
      const d = dist2(n.world) - fudge;
      if (g) items.push({ a: L(g.layer), b: g.order, c: dist2(g.node.world), gid: g.node.uid, d: L(layer), e: order, f: d, s: seq++, draw });
      else items.push({ a: L(layer), b: order, c: d, gid: 0, d: 0, e: 0, f: 0, s: seq++, draw });
    };
    for (const sr of this.spriteRenderers) {
      if (!sr.enabled || !sr.spriteObj || !visible(sr.node)) continue;
      if (sr.alphaMul === 0 || (sr.color[3] <= 0 && !sr.flashAmount)) continue;
      // sprites inside a screen-space canvas (GameOver podium skins, halos) draw in that canvas's UI pass
      if (sr.inCanvas === undefined) sr.inCanvas = this.screenCanvasOf(sr.node);
      if (sr.inCanvas) continue;
      push(sr.node, sr.layer, sr.order, () => this.drawSprite(sr));
    }
    for (const ps of this.particles) {
      const rt = ps.runtime;
      if (!rt || !rt.p.length || !ps.r || !ps.r.enabled || !visible(ps.node) || this.underCanvas(ps.node)) continue;
      push(ps.node, ps.r.layer, ps.r.order, () => rt.draw(R, cam, packColor), ps.r.fudge || 0);
    }
    for (const t of this.texts) {
      if (!t.enabled || !visible(t.node)) continue;
      push(t.node, 0, 0, () => this.drawWorldText(t));
    }
    items.sort((x, y) => x.a - y.a || x.b - y.b || y.c - x.c || x.gid - y.gid || x.d - y.d || x.e - y.e || y.f - x.f || x.s - y.s);
    for (const it of items) it.draw();
    R.flush();
    R.state = null;
  }

  underCanvas(n) { for (let p = n; p; p = p.parent) if (p.get('Canvas')) return true; return false; }

  screenCanvasOf(n) { for (let p = n; p; p = p.parent) { const c = p.get('Canvas'); if (c) return c.mode !== 2; } return false; }

  drawSprite(sr, ui = false) {
    const R = this.R, s = sr.spriteObj;
    const tex = R.spriteTex(s);
    if (!tex) return;
    const mat = sr.matObj;
    R.setState(R.progSprite, tex, mat ? mat.src : 5, mat ? mat.dst : 10, !ui, null);
    const A = this.assets.spriteData.atlases[s.a];
    const ppu = s.ppu || 100;
    const fa = sr.flashAmount || (mat && mat.props && mat.props._FlashAmount) || 0;
    const fc = sr.flashAmount ? sr.flashColor : (mat && mat.props && mat.props._FlashColor) || [1, 1, 1];
    const flash = fa ? packColor(fc[0], fc[1], fc[2], fa) : 0;
    const mc = mat && mat.color ? mat.color : null;
    const col = sr.color;
    // tint/grey: kept outside the animated colour (locked fighters drawn greyed out)
    const tn = sr.tint || ONE3;
    const gr = sr.grey || 0;
    const pc = packColor(col[0] * (mc ? mc[0] : 1) * tn[0], col[1] * (mc ? mc[1] : 1) * tn[1], col[2] * (mc ? mc[2] : 1) * tn[2], col[3] * (mc ? mc[3] : 1) * (sr.alphaMul ?? 1));
    const m = sr.node.world;
    const fx = sr.flip[0] ? -1 : 1, fy = sr.flip[1] ? -1 : 1;
    const u0 = s.x / A.w, u1 = (s.x + s.w) / A.w, vt = s.y / A.h, vb = (s.y + s.h) / A.h;
    const p = [0, 0, 0];
    const quad = (x0, y0, x1, y1, a0, b0, a1, b1) => {
      R.reserve(4, 6);
      xform(m, x0 * fx, y0 * fy, 0, p); const i = R.vert(p[0], p[1], p[2], a0, b0, pc, flash, gr);
      xform(m, x0 * fx, y1 * fy, 0, p); R.vert(p[0], p[1], p[2], a0, b1, pc, flash, gr);
      xform(m, x1 * fx, y0 * fy, 0, p); R.vert(p[0], p[1], p[2], a1, b0, pc, flash, gr);
      xform(m, x1 * fx, y1 * fy, 0, p); R.vert(p[0], p[1], p[2], a1, b1, pc, flash, gr);
      R.quadIdx(i);
    };
    if (sr.drawMode && s.border) {
      // 9-slice in world units (SpriteDrawMode.Sliced / Tiled approximated as sliced)
      const w = sr.size[0], h = sr.size[1];
      const ox = -s.px / s.ow * w, oy = -s.py / s.oh * h;
      const [bl, bb, br, bt] = s.border.map((b) => b / ppu);
      const xs = [ox, ox + bl, ox + w - br, ox + w], ys = [oy, oy + bb, oy + h - bt, oy + h];
      const us = [s.x, s.x + s.border[0], s.x + s.w - s.border[2], s.x + s.w].map((v) => v / A.w);
      const vs = [s.y + s.h, s.y + s.h - s.border[1], s.y + s.border[3], s.y].map((v) => v / A.h);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) quad(xs[i], ys[j], xs[i + 1], ys[j + 1], us[i], vs[j], us[i + 1], vs[j + 1]);
      return;
    }
    let x0 = (s.ox - s.px) / ppu, x1 = (s.ox + s.w - s.px) / ppu, y0 = (s.oy - s.py) / ppu, y1 = (s.oy + s.h - s.py) / ppu;
    if (sr.drawMode) { const kx = sr.size[0] / (s.ow / ppu), ky = sr.size[1] / (s.oh / ppu); x0 *= kx; x1 *= kx; y0 *= ky; y1 *= ky; }
    quad(x0, y0, x1, y1, u0, vb, u1, vt);
  }

  drawWorldText(t) {
    const f = this.assets.fontSync(t.font);
    const n = t.node;
    if (!f || !n.rect) return;
    const w = n.rect.size[0], h = n.rect.size[1];
    if (!t._cache || t._cache.text !== t.text || t.dirty) { t._cache = { text: t.text, b: buildText(f, t, w, h) }; t.dirty = false; }
    drawTextQuads(this.R, f, t, t._cache.b, n.world, -n.rect.pivot[0] * w, -n.rect.pivot[1] * h, 1, null, true);
  }

  // world point -> canvas pixels (y up), for HUD elements that follow world objects (life bars)
  worldToScreen(x, y, z) {
    const o = [0, 0, 0, 0];
    const m = this.vp;
    if (!m) return null;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    o[0] = (cx / cw * 0.5 + 0.5) * this.canvas.width; o[1] = (cy / cw * 0.5 + 0.5) * this.canvas.height;
    return o;
  }

  // ------------------------------------------------------------------------------------------------ UI input

  handlePointer() {
    for (const ev of this.input.events) {
      const p = ev.p;
      if (ev.type === 'wheel') {
        const hit = this.ui.raycast(ev.x, ev.y);
        const sc = hit && this.ui.scrollOf(hit);
        if (sc) this.ui.scrollWheel(sc, ev.dx, ev.dy);
        for (const f of this.pointerHooks || []) f('wheel', ev, hit);
      } else if (ev.type === 'down') {
        const hit = this.ui.raycast(p.startX, p.startY);
        p.target = hit;
        const btn = hit && this.ui.handler(hit, 'Button');
        p.button = btn && btn.interactable ? btn : null;
        if (p.button) this.setButtonState(p.button, 'pressed');
        this.ui.pointerPress(p, hit);
        p.uiHandled = !!hit;
        for (const f of this.pointerHooks || []) f('down', p, hit);
      } else if (ev.type === 'up' || ev.type === 'cancel') {
        this.ui.pointerMove(p);   // the last move may still be unprocessed
        if (p.dragging && p.button) { this.setButtonState(p.button, 'normal'); p.button = null; }
        if (p.button) {
          this.setButtonState(p.button, 'normal');
          const hit = this.ui.raycast(p.x, p.y);
          if (ev.type === 'up' && hit && this.ui.handler(hit, 'Button') === p.button) this.click(p.button);
        }
        p.dragged = !!p.dragging;
        this.ui.pointerRelease(p);
        for (const f of this.pointerHooks || []) f(ev.type, p, p.target);
      } else {
        // a drag that crossed the threshold on a ScrollRect scrolls and drops the Button it started on (no click on release)
        if (this.ui.pointerMove(p) && p.button) { this.setButtonState(p.button, 'normal'); p.button = null; }
        for (const f of this.pointerHooks || []) f('move', p, p.target);
      }
    }
    this.input.events.length = 0;
  }

  onPointer(f) { (this.pointerHooks = this.pointerHooks || []).push(f); }

  setButtonState(b, state) {
    b.state = state === 'normal' ? null : state;
    const an = b.node.get('Animator');
    if (b.transition === 3 && an && an.runtime) an.runtime.setTrigger(b.animTriggers[state] || state);
    b.goalTint = (b.colors && b.colors[state]) || [1, 1, 1, 1];
  }

  updateButtons(dt) {
    for (const b of this.buttons) {
      if (b.transition !== 1 || !b.colors) continue;
      const goal = !b.interactable ? b.colors.disabled : (b.goalTint || b.colors.normal);
      const k = b.colors.fade > 0 ? Math.min(1, dt / b.colors.fade) : 1;
      for (let i = 0; i < 4; i++) b.curTint[i] += (goal[i] * (b.colors.mul || 1) - b.curTint[i]) * k;
    }
  }

  click(b) {
    for (const f of this.clickHooks || []) f(b);
    for (const o of b.onClickResolved || []) {
      const t = o.targetObj;
      if (t && typeof t[o.method] === 'function') t[o.method](o.arg);
    }
  }

  onClick(f) { (this.clickHooks = this.clickHooks || []).push(f); }
}

const ONE3 = [1, 1, 1];

// legacy UnityEngine.UI.Text (2 labels in the rip: trophy road bubble, a shop badge) drawn as a TMP text in the game font
const ANCHOR = [257, 258, 260, 513, 514, 516, 1025, 1026, 1028];
function legacyText(cd) {
  const f = cd.fields, fd = f.m_FontData;
  return { type: 'Text', ui: 1, enabled: cd.enabled, text: String(f.m_Text ?? ''), font: 'font:Tobi Greek Cyrillic Regular SDF',
    mat: 'mat:Tobi Greek Cyrillic Regular SDF Material', size: fd.m_FontSize || 14, autoSize: fd.m_BestFit ? 1 : 0, sizeMin: fd.m_MinSize || 4,
    sizeMax: fd.m_MaxSize || fd.m_FontSize || 14, color: f.m_Color || [1, 1, 1, 1], align: ANCHOR[fd.m_Alignment] || 514, wrap: fd.m_HorizontalOverflow ? 0 : 1,
    overflow: 0, style: 0, spacing: { char: 0, word: 0, line: 0, para: 0 }, margin: [0, 0, 0, 0], richText: fd.m_RichText ? 1 : 0, raycast: f.m_RaycastTarget ? 1 : 0 };
}

export const canvasOrder = (a, b) => (a.sceneLayer || 0) - (b.sceneLayer || 0) || a.order - b.order;

function rotMat(q) {
  const m = mat4();
  const x = q[0], y = q[1], z = q[2], w = q[3];
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + w * z); m[2] = 2 * (x * z - w * y);
  m[4] = 2 * (x * y - w * z); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + w * x);
  m[8] = 2 * (x * z + w * y); m[9] = 2 * (y * z - w * x); m[10] = 1 - 2 * (x * x + y * y);
  return m;
}
