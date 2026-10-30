// Loads exported data (tools/export_unity.py) and tracks what resolved for fgEngineStats.

export const stats = {
  spritesRef: 0, spritesMissing: [], clipsRef: 0, clipsMissing: [], ctrlMissing: [], matsMissing: [], fontsMissing: [],
  audioMissing: [], prefabsMissing: [], atlasesLoaded: [], drawCalls: 0, batches: 0, particles: 0, nodes: 0, frames: 0,
  animators: 0, errors: [],
};

const miss = (list, k) => { if (k && !list.includes(k)) list.push(k); };

export class Assets {
  constructor(base, rev = '') {
    this.base = base.endsWith('/') ? base : base + '/';
    this.rev = rev ? '?v=' + rev : '';   // cache-busting query on every data / art / audio file (hub rule)
    this.json = new Map();
    this.images = new Map();
    this.fonts = new Map();
    this.fontsReady = new Map();
    this.meshes = new Map();
    this.prefabs = new Map();
    this.scenes = new Map();
  }

  async getJSON(rel) {
    if (!this.json.has(rel)) {
      this.json.set(rel, fetch(this.base + rel + this.rev).then((r) => {
        if (!r.ok) throw new Error(`asset not found: ${rel} (${r.status})`);
        return r.json();
      }));
    }
    return this.json.get(rel);
  }

  async init() {
    const [project, sprites, materials, clips, controllers, audio, index] = await Promise.all([
      this.getJSON('data/project.json'), this.getJSON('data/sprites.json'), this.getJSON('data/materials.json'),
      this.getJSON('data/anim/clips.json'), this.getJSON('data/anim/controllers.json'), this.getJSON('data/audio.json'),
      this.getJSON('data/index.json')]);
    Object.assign(this, { project, spriteData: sprites, materials, clips, controllers, audio, index });
    this.layerOrder = new Map(project.sortingLayers.map((l, i) => [l.id, i]));
    this.layerByName = new Map(project.sortingLayers.map((l) => [l.name, l.id]));
    return this;
  }

  sortingIndex(id) { return this.layerOrder.get(id) ?? 0; }

  sprite(ref) {
    if (!ref) return null;
    const key = ref.startsWith('sprite:') ? ref.slice(7) : ref;
    const s = this.spriteData.sprites[key];
    stats.spritesRef++;
    if (!s) { miss(stats.spritesMissing, key); return null; }
    if (!s.key) s.key = key;
    return s;
  }

  material(ref) {
    if (!ref) return null;
    const key = ref.startsWith('mat:') ? ref.slice(4) : ref;
    const m = this.materials[key];
    if (!m) { miss(stats.matsMissing, key); return null; }
    if (!m.key) m.key = key;
    return m;
  }

  clip(ref) {
    if (!ref) return null;
    const key = ref.startsWith('clip:') ? ref.slice(5) : ref;
    const c = this.clips[key];
    stats.clipsRef++;
    if (!c) { miss(stats.clipsMissing, key); return null; }
    if (!c.key) c.key = key;
    return c;
  }

  controller(ref) {
    if (!ref) return null;
    const key = ref.startsWith('ctrl:') ? ref.slice(5) : ref;
    const c = this.controllers[key];
    if (!c) { miss(stats.ctrlMissing, key); return null; }
    if (!c.key) c.key = key;
    return c;
  }

  atlasImage(name) {
    if (!this.images.has(name)) {
      const a = this.spriteData.atlases[name];
      if (!a) return Promise.reject(new Error(`atlas not found: ${name}`));
      const p = loadImage(this.base + a.file + this.rev).then((img) => { p.done = img; stats.atlasesLoaded.push(name); return img; });
      this.images.set(name, p);
    }
    return this.images.get(name);
  }

  // Collect every "sprite:" / "mat:" / "font:" reference in a JSON tree and load the atlases + fonts it needs.
  async preloadFor(...datas) {
    const atlases = new Set(), fonts = new Set(), meshes = new Set(), files = new Set();
    const visit = (v) => {
      if (typeof v === 'string') {
        if (v.startsWith('sprite:')) { const s = this.spriteData.sprites[v.slice(7)]; if (s) atlases.add(s.a); }
        else if (v.startsWith('mat:')) { const m = this.materials[v.slice(4)]; if (m && m.tex) visit(m.tex); if (m && m.texFile) files.add(m.texFile); }
        else if (v.startsWith('font:')) fonts.add(v.slice(5));
        else if (v.startsWith('mesh:')) meshes.add(v.slice(5));
        else if (v.startsWith('clip:')) { const c = this.clips[v.slice(5)]; if (c && c.pptr) visit(c.pptr); }
        else if (v.startsWith('ctrl:')) this.controllerClips(v.slice(5)).forEach((c) => visit('clip:' + c));
      } else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') for (const k in v) visit(v[k]);
    };
    datas.forEach(visit);
    await Promise.all([...[...atlases].map((a) => this.atlasImage(a)), ...[...fonts].map((f) => this.font(f)),
      ...[...meshes].map((m) => this.mesh(m)), ...[...files].map((f) => { this.texImage(f); return this.images.get('file:' + f); })]);
  }

  controllerClips(key, out = new Set()) {
    const c = this.controllers[key];
    if (!c) return out;
    if (c.base) { this.controllerClips(c.base, out); for (const k in c.over) out.add(c.over[k]); return out; }
    const motion = (m) => { if (!m) return; if (typeof m === 'string') out.add(m); else m.children.forEach((ch) => motion(ch.motion)); };
    for (const L of c.layers) for (const s of L.sm.states) motion(s.motion);
    return out;
  }

  async font(name) {
    if (!this.fonts.has(name)) {
      const file = this.index.fonts[name]?.file;
      if (!file) { miss(stats.fontsMissing, name); this.fonts.set(name, Promise.resolve(null)); }
      else {
        this.fonts.set(name, this.getJSON(file).then(async (f) => {
          f.images = await Promise.all(f.atlas.map((a) => loadImage(this.base + a + this.rev)));
          f.material = this.materials[f.mat] || null;
          f.glyphs = new Map(Object.entries(f.chars).map(([k, v]) => [+k, v]));
          this.fontsReady.set(name, f);
          return f;
        }));
      }
    }
    return this.fonts.get(name);
  }

  fontSync(ref) {
    const name = ref && ref.startsWith('font:') ? ref.slice(5) : ref;
    return this.fontsReady.get(name) || null;
  }

  // standalone textures (3D mesh materials); returns the image once loaded, null before
  texImage(file) {
    let e = this.images.get('file:' + file);
    if (!e) {
      e = loadImage(this.base + file + this.rev).then((img) => { e.done = img; return img; }).catch((err) => { stats.errors.push(err.message); });
      this.images.set('file:' + file, e);
    }
    return e.done || null;
  }

  async mesh(name) {
    if (!this.meshes.has(name)) {
      const p = this.getJSON(`data/meshes/${name}.json`).then((d) => { p.done = d; return d; });
      this.meshes.set(name, p);
    }
    return this.meshes.get(name);
  }

  async prefab(name) {
    if (!this.index.prefabs.includes(name)) { miss(stats.prefabsMissing, name); throw new Error(`prefab not found: ${name}`); }
    const d = await this.getJSON(`data/prefabs/${name}.json`);
    await this.preloadFor(d);
    return d;
  }

  async scene(name) {
    if (!this.index.scenes.includes(name)) throw new Error(`scene not found: ${name}`);
    const d = await this.getJSON(`data/scenes/${name}.json`);
    await this.preloadFor(d);
    return d;
  }
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`image failed: ${url}`));
    img.src = url;
  });
}
