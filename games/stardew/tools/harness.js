/*
 * A DOM-shaped stub just big enough to boot the game in Node.
 *
 * It is NOT a browser. Canvas calls are counted, not rasterised, and layout is
 * meaningless. What it does prove is the part that actually breaks: that every
 * file parses, that every global one file expects another to have published is
 * really there, that a fresh save boots, that a frame renders without throwing,
 * and that every panel opens.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';

// ------------------------------------------------------------------ canvas
const CTX_METHODS = [
  'clearRect', 'fillRect', 'strokeRect', 'drawImage', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke', 'save', 'restore',
  'translate', 'scale', 'rotate', 'setTransform', 'resetTransform', 'fillText',
  'strokeText', 'measureText', 'createLinearGradient', 'createRadialGradient',
  'putImageData', 'getImageData', 'createImageData', 'rect', 'clip', 'quadraticCurveTo',
  'bezierCurveTo', 'arcTo', 'setLineDash'
];
function makeCtx() {
  const ctx = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans',
    textAlign: 'left', imageSmoothingEnabled: true, filter: 'none'
  };
  for (const m of CTX_METHODS) {
    ctx[m] = function () {
      if (m === 'measureText') return { width: 10 };
      if (m === 'createLinearGradient' || m === 'createRadialGradient') {
        return { addColorStop() {} };
      }
      if (m === 'getImageData' || m === 'createImageData') {
        return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
      }
      return undefined;
    };
  }
  return ctx;
}

let nodeId = 0;
function makeNode(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), _tag: tag, _id: ++nodeId,
    children: [], childNodes: [], parentNode: null,
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: {}, className: '', id: '', textContent: '', innerHTML: '',
    value: '', width: 0, height: 0, complete: true, src: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
    },
    appendChild(c) { c.parentNode = n; n.children.push(c); n.childNodes.push(c); return c; },
    removeChild(c) {
      const i = n.children.indexOf(c);
      if (i >= 0) { n.children.splice(i, 1); n.childNodes.splice(i, 1); }
      return c;
    },
    remove() { if (n.parentNode) n.parentNode.removeChild(n); },
    insertBefore(c) { return n.appendChild(c); },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    focus() {}, blur() {}, click() { if (n.onclick) n.onclick({ stopPropagation() {} }); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    cloneNode() { return makeNode(tag); },
    toDataURL() { return 'data:image/png;base64,'; }
  };
  Object.defineProperty(n, 'firstChild', { get: () => n.children[0] || null });
  if (tag === 'canvas') {
    n._ctx = makeCtx(); n._ctx.canvas = n;
    n.getContext = () => n._ctx;
  }
  return n;
}

const byId = {};
const ID_TAGS = (() => {
  const out = {};
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<(\w+)[^>]*id="([^"]+)"/g)) out[m[2]] = m[1];
  } catch (e) {}
  return out;
})();
const document = {
  head: makeNode('head'),
  body: makeNode('body'),
  visibilityState: 'visible',
  createElement: makeNode,
  createTextNode: (t) => { const n = makeNode('#text'); n.textContent = t; return n; },
  /* Tag matters: ui.js calls getContext on #hud-mini, and a stub that hands
   * back a div for every id turns a real canvas into a crash that only exists
   * in the harness. Tags are read out of index.html so the stub cannot drift
   * from the page. */
  getElementById: (id) => {
    if (byId[id]) return byId[id];
    const tag = (ID_TAGS[id] || 'div');
    byId[id] = Object.assign(makeNode(tag), { id });
    return byId[id];
  },
  addEventListener() {}, removeEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; }
};

// -------------------------------------------------------------- window shim
const store = {};
const window = {
  document,
  innerWidth: 430, innerHeight: 860, devicePixelRatio: 2,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  Image: function () {
    const n = makeNode('img');
    let _src = '';
    Object.defineProperty(n, 'src', {
      get: () => _src,
      set: (v) => {
        _src = v;
        const file = path.join(ROOT, v.split('?')[0]);
        setTimeout(() => {
          if (fs.existsSync(file)) { n.width = 2048; n.height = 2048; if (n.onload) n.onload(); }
          else if (n.onerror) n.onerror();
        }, 0);
      }
    });
    return n;
  },
  XMLHttpRequest: function () {
    const self = this;
    this.open = (m, url) => { self._url = url; };
    this.send = () => {
      const file = path.join(ROOT, self._url.split('?')[0]);
      setTimeout(() => {
        if (fs.existsSync(file)) {
          self.responseText = fs.readFileSync(file, 'utf8');
          self.status = 200;
          if (self.onload) self.onload();
        } else if (self.onerror) self.onerror();
      }, 0);
    };
  },
  alert() {}, confirm: () => true, prompt: () => null,
  console, performance: { now: () => Date.now() },
  navigator: { userAgent: 'node' },
  location: { reload() {} },
  AudioContext: undefined
};
window.window = window;
window.self = window;
window.globalThis = window;

// Files run with `window` as `global`, and a handful reach for bare globals.
global.window = window;
global.document = document;
global.localStorage = window.localStorage;
global.requestAnimationFrame = window.requestAnimationFrame;
global.Image = window.Image;
global.XMLHttpRequest = window.XMLHttpRequest;
try { global.navigator = window.navigator; } catch (e) { /* node 22 defines it read-only */ }
global.confirm = window.confirm;
global.prompt = window.prompt;
global.alert = window.alert;
global.performance = window.performance;

module.exports = { window, document, byId, ROOT, makeNode, ID_TAGS };
