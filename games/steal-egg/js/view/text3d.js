// World-space TextMeshPro stand-ins: text drawn into a canvas and shown on a camera-facing sprite (faceCamera /
// BillboardObject in the original) or on a plane fixed to its node (gate timers, the upgrade pad texts).
// Lines: [{ text, color: [r,g,b], size }] with size relative to the first line. Height is in metres for one line of
// size 1; the canvas is redrawn only when the text changes.
import * as THREE from 'three';

const PX = 64;                        // canvas pixels per line of size 1

export class Text3D {
  // rect: [w, h] = a TextMeshPro 3D text box in its node's units (default box 20 x 5): the text is auto-sized into it
  // (enableAutoSizing) and drawn on a plane child of the node instead of a sprite. maxSize: m_fontSizeMax of the TMP text;
  // a 3D TextMeshPro em is fontSize * 0.1 node units (TMP_Text scale for non-orthographic text).
  constructor({ font = '"Insanibu", "Baloo 2", "Arial Black", sans-serif', height = 0.3, billboard = true, outline = 0.14,
    outlineColor = '#000', depthTest = true, rect = null, maxSize = Infinity } = {}) {
    this.rect = rect;
    this.maxSize = maxSize;
    if (rect) billboard = false;
    this.font = font;
    this.height = height;
    this.outline = outline;
    this.outlineColor = outlineColor;
    this.canvas = document.createElement('canvas');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    const mat = billboard
      ? new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest, depthWrite: false })
      : new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest, depthWrite: false, side: THREE.DoubleSide });
    this.object = billboard ? new THREE.Sprite(mat) : new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.object.renderOrder = 10;
    this.object.name = 'Text3D';
    this.key = null;
  }

  set(lines) {
    if (typeof lines === 'string') lines = [{ text: lines }];
    // Insaniburger has capitals only: upper-case so fallback glyphs (Vietnamese marks) match
    if (/Insanib/.test(this.font)) lines = lines.map(l => ({ ...l, text: String(l.text).toUpperCase() }));
    const key = JSON.stringify(lines);
    if (key === this.key) return;
    this.key = key;
    const cv = this.canvas, x = cv.getContext('2d');
    const rows = lines.map(l => ({ ...l, px: Math.round(PX * (l.size || 1)) }));
    const measure = r => { x.font = `900 ${r.px}px ${this.font}`; return x.measureText(r.text).width + r.px * this.outline * 2; };
    const w = Math.max(8, Math.ceil(Math.max(...rows.map(measure)))) + 8;
    const h = rows.reduce((s, r) => s + Math.round(r.px * 1.15), 0) + 8;
    cv.width = w; cv.height = h;
    let y = 4;
    for (const r of rows) {
      x.font = `900 ${r.px}px ${this.font}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const cy = y + r.px * 0.6;
      if (this.outline > 0) {
        x.lineJoin = 'round';
        x.lineWidth = r.px * this.outline * 2;
        x.strokeStyle = this.outlineColor;
        x.strokeText(r.text, w / 2, cy);
      }
      const c = r.color || [1, 1, 1];
      x.fillStyle = `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
      x.fillText(r.text, w / 2, cy);
      y += Math.round(r.px * 1.15);
    }
    this.tex.dispose();
    this.tex.needsUpdate = true;
    this.aspect = w / h;
    if (this.rect) {
      // fit inside the box keeping the text's aspect
      const [bw, bh] = this.rect, sc = Math.min(bw / w, bh / h, this.maxSize * 0.1 / PX);
      this.object.scale.set(w * sc, h * sc, 1);
      return;
    }
    const k = this.height / PX;
    this.object.scale.set(w * k, h * k, 1);
  }

  dispose() {
    this.tex.dispose();
    this.object.material.dispose();
    if (this.object.geometry) this.object.geometry.dispose();
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}
