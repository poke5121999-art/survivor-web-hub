// Rebuilds exported NGUI trees (art/ui/hud.json, tools/export_ui.py) as DOM. The UI root is the original 1080x1920
// virtual screen (UIRoot manualWidth/Height), origin at the centre, y up; the #ui layer is scaled to the stage so
// every position below is a raw NGUI number. Sprites are cut from the atlas once into blob URLs; sliced sprites use
// border-image with the atlas borders.
const PIVOT = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];

export class NGUI {
  constructor(base, atlases, lang) {
    this.base = base;
    this.atlases = atlases;
    this.lang = lang || {};
    this.images = new Map();
    this.urls = new Map();
  }

  static async load(base, lang) {
    const atlases = await fetch(`${base}/art/ui/atlases.json${globalThis.CS_V || ''}`).then(r => r.json());
    return new NGUI(base, atlases, lang);
  }

  atlasImage(name) {
    const a = this.atlases[name];
    if (!a) return Promise.resolve(null);
    if (!this.images.has(name)) {
      this.images.set(name, new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = `${this.base}/art/ui/${a.tex}.webp`;
      }));
    }
    return this.images.get(name);
  }

  // Blob URL of one sprite of an atlas (cut by its rect).
  sprite(atlas, name) {
    const key = `${atlas}/${name}`;
    if (!this.urls.has(key)) {
      this.urls.set(key, this.atlasImage(atlas).then(img => {
        const s = img && this.atlases[atlas].sprites[name];
        if (!s) return null;
        const c = document.createElement('canvas');
        c.width = s[2];
        c.height = s[3];
        c.getContext('2d').drawImage(img, s[0], s[1], s[2], s[3], 0, 0, s[2], s[3]);
        return new Promise(r => c.toBlob(b => r(URL.createObjectURL(b))));
      }));
    }
    return this.urls.get(key);
  }

  spriteInfo(atlas, name) {
    const a = this.atlases[atlas];
    return a && a.sprites[name];
  }

  // Applies a sprite to an element sized w x h: simple sprites stretch, sliced ones keep their borders.
  async paint(el, atlas, name, sliced) {
    const url = await this.sprite(atlas, name);
    if (!url) return;
    const s = this.spriteInfo(atlas, name);
    const [bl, br, bt, bb] = s.slice(4, 8);
    if (sliced && (bl || br || bt || bb)) {
      el.style.borderStyle = 'solid';
      el.style.borderWidth = `${bt}px ${br}px ${bb}px ${bl}px`;
      el.style.borderImage = `url(${url}) ${bt} ${br} ${bb} ${bl} fill stretch`;
      el.style.boxSizing = 'border-box';
    } else {
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = '100% 100%';
    }
  }

  text(w) {
    if (w.loc && this.lang[w.loc] != null) return this.lang[w.loc];
    return w.text ?? '';
  }

  // One node -> element. Children keep NGUI local coordinates: left = x, top = -y relative to the parent's origin.
  build(node) {
    const el = document.createElement('div');
    el.className = 'ng';
    el.dataset.n = node.n;
    const [x, y] = node.t || [0, 0];
    el.style.left = `${x}px`;
    el.style.top = `${-y}px`;
    const s = node.s;
    const rot = node.rot ? ` rotate(${-node.rot}deg)` : '';
    if (s || rot) el.style.transform = `scale(${s ? s[0] : 1}, ${s ? s[1] : 1})${rot}`;
    if (node.a === 0) el.style.display = 'none';
    if (node.btn) el.classList.add('btn');
    const w = node.w;
    if (w) {
      const box = document.createElement('div');
      box.className = `w ${w.k}`;
      const [px, py] = PIVOT[w.pivot ?? 4];
      box.style.width = `${w.width}px`;
      box.style.height = `${w.height}px`;
      box.style.left = `${-px * w.width}px`;
      box.style.top = `${-py * w.height}px`;
      box.style.zIndex = w.depth ?? 0;
      if (w.color && w.color !== '#ffffffff') {
        if (w.k === 'label') box.style.color = w.color.slice(0, 7);
        else box.style.opacity = parseInt(w.color.slice(7, 9), 16) / 255;
      }
      if (w.k === 'sprite' && w.atlas) this.paint(box, w.atlas, w.sprite, w.type === 1);
      if (w.k === 'label') {
        box.textContent = this.text(w);
        box.style.fontSize = `${w.fontSize || 30}px`;
        box.style.lineHeight = `${w.height}px`;
        box.style.textAlign = ['left', 'center', 'right'][px * 2] || 'center';
      }
      el.appendChild(box);
      el.box = box;
    }
    for (const c of node.c || []) el.appendChild(this.build(c));
    return el;
  }
}

// Child element by a slash path of node names ("set_top/topbar/gold").
export function find(el, path) {
  let cur = el;
  for (const seg of path.split('/')) {
    cur = [...cur.children].find(c => c.dataset && c.dataset.n === seg);
    if (!cur) return null;
  }
  return cur;
}
