// Rebuilds exported NGUI trees (art/ui/hud.json, tools/export_ui.py) as DOM. The UI root is the original 1080x1920
// virtual screen (UIRoot manualWidth/Height), origin at the centre, y up; the #ui layer is scaled to the stage so
// every position below is a raw NGUI number. Sprites are cut from the atlas once into blob URLs; sliced sprites use
// border-image with the atlas borders.
const PIVOT = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
// UIAnchor.side 0 BL 1 L 2 TL 3 T 4 TR 5 R 6 BR 7 B 8 C, as a point of the 1080x1920 screen around its centre. A prefab
// saves its anchored groups wherever the editor left them, so their position comes from the anchor instead (for the
// level2 HUD both agree on every node).
const SIDE = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [0, 0]];

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

  // Blob URL of one sprite of an atlas (cut by its rect), multiplied by an NGUI widget colour (#rrggbb) like the
  // original's vertex colour; the sprite's own alpha is kept.
  sprite(atlas, name, tint = '#ffffff') {
    tint = tint.slice(0, 7).toLowerCase();
    const key = `${atlas}/${name}/${tint}`;
    if (!this.urls.has(key)) {
      this.urls.set(key, this.atlasImage(atlas).then(img => {
        const s = img && this.atlases[atlas].sprites[name];
        if (!s) return null;
        const c = document.createElement('canvas');
        c.width = s[2];
        c.height = s[3];
        const x = c.getContext('2d');
        x.drawImage(img, s[0], s[1], s[2], s[3], 0, 0, s[2], s[3]);
        if (tint !== '#ffffff') {
          x.globalCompositeOperation = 'multiply';
          x.fillStyle = tint;
          x.fillRect(0, 0, s[2], s[3]);
          x.globalCompositeOperation = 'destination-in';
          x.drawImage(img, s[0], s[1], s[2], s[3], 0, 0, s[2], s[3]);
        }
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
  async paint(el, atlas, name, sliced, tint) {
    const url = await this.sprite(atlas, name, tint);
    if (!url) return;
    const s = this.spriteInfo(atlas, name);
    const [bl, br, bt, bb] = s.slice(4, 8);
    if (sliced && (bl || br || bt || bb)) {
      // NGUI stretches a zero-width centre from the edge pixels; a CSS slice needs at least one centre pixel.
      const cut = (a, b, n) => (a + b >= n ? [Math.min(a, Math.floor((n - 1) / 2)), Math.min(b, n - 1 - Math.min(a, Math.floor((n - 1) / 2)))] : [a, b]);
      const [sl, sr] = cut(bl, br, s[2]);
      const [st, sb] = cut(bt, bb, s[3]);
      el.style.borderStyle = 'solid';
      el.style.borderWidth = `${bt}px ${br}px ${bb}px ${bl}px`;
      el.style.borderImage = `url(${url}) ${st} ${sr} ${sb} ${sl} fill stretch`;
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
    let [x, y] = node.t || [0, 0];
    if (node.anchor) {
      const [sx, sy] = SIDE[node.anchor.side];
      x = sx * 540 + node.anchor.rel[0] * 1080 + node.anchor.px[0];
      y = sy * 960 + node.anchor.rel[1] * 1920 + node.anchor.px[1];
    }
    el.style.left = `${x}px`;
    el.style.top = `${-y}px`;
    const s = node.s;
    const rot = node.rot ? ` rotate(${-node.rot}deg)` : '';
    if (s || rot) {
      el.style.transform = `scale(${s ? s[0] : 1}, ${s ? s[1] : 1})${rot}`;
      // A transform makes the node its own stacking context; lift it to its deepest widget so NGUI depth order holds.
      el.style.zIndex = maxDepth(node);
    }
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
        else if (w.color.length > 7) box.style.opacity = parseInt(w.color.slice(7, 9), 16) / 255;
      }
      if (w.k === 'sprite' && w.atlas) this.paint(box, w.atlas, w.sprite, (w.ty ?? w.type) === 1, w.color || '#ffffff');
      if (w.k === 'label') {
        box.textContent = this.text(w);
        box.style.fontSize = `${w.fs || w.fontSize || 30}px`;
        if (w.fstyle === 1 || w.fstyle === 3) box.style.fontWeight = 'bold';
        // UILabel.Effect 1 shadow, 2 outline, 3 outline8.
        if (w.fx && w.fxc) {
          const c = w.fxc.slice(0, 7), d = Math.max(1, Math.round((w.fxd ? w.fxd[0] : 1) * 1.2));
          if (w.fx === 1) box.style.textShadow = `${d}px ${d}px 0 ${c}`;
          else { box.style.webkitTextStroke = `${d * 2}px ${c}`; box.style.paintOrder = 'stroke fill'; }
        }
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

function maxDepth(n) {
  let d = n.w ? n.w.depth || 0 : 0;
  for (const c of n.c || []) d = Math.max(d, maxDepth(c));
  return d;
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
