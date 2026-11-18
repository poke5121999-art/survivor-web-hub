import * as THREE from '../vendor/three.module.min.js';

// In-run HUD extras, graphics instead of text (owner rule): house pips, pad icons, truck + arrow for the escape, detection eye,
// carry-weight gauge, carried value tag with the lost part in red, head icon when down, floating +$ / -$ pops.
// Money amounts stay numbers. The UI's own text pieces (noise label, hint, carry strike text) are hidden by the CSS below.
// Also: Ring, a flat 3D ring on the floor that fills (pad quota, 3 s holds, truck button).

const CSS = `
.hx{position:fixed;left:0;top:0;transform-origin:0 0;z-index:11;pointer-events:none;font-family:system-ui,sans-serif}
.hx.hidden{display:none}
.hx>*{position:absolute}
.ui-root .hud .noise u,.ui-root .hud .hint,.ui-root .hud .carry{display:none!important}
.hx .pips{left:50%;top:5px;transform:translateX(-50%);display:flex;gap:4px}
.hx .pips i{width:7px;height:7px;border-radius:50%;border:1px solid #6df0a8;background:rgba(6,30,18,.7)}
.hx .pips i.d{background:#3be68a}
.hx .pips i.c{background:#fff;box-shadow:0 0 5px #fff;transform:scale(1.35)}
.hx .pads{left:50%;top:17px;transform:translateX(-50%);display:flex;gap:4px}
.hx .pads b{width:8px;height:8px;border-radius:2px;border:1px solid #6df0a8;display:block}
.hx .pads b.d{background:#3be68a}
.hx .pads b.a{background:#ffe45e;border-color:#ffe45e;animation:hxp .8s infinite alternate}
.hx .pads b.l{opacity:.45;border-style:dashed}
.hx .esc{left:50%;top:30px;transform:translateX(-50%);display:flex;align-items:center;gap:6px}
.hx .esc svg.tr{width:26px;height:16px;animation:hxp .45s infinite alternate}
.hx .esc svg.ar{width:18px;height:18px}
.hx .eye{left:12px;top:72px;width:22px;height:22px}
.hx .wt{left:40px;top:76px;width:34px;height:12px;border:1px solid #6df0a8;background:rgba(6,30,18,.7)}
.hx .wt i{display:block;height:100%;background:#6df0a8}
.hx .wt svg{position:absolute;left:2px;top:-1px;width:10px;height:12px}
.hx .tag{left:50%;bottom:30px;transform:translateX(-50%);min-width:54px;padding:2px 6px 4px;background:rgba(8,12,16,.8);border:1px solid #3be68a;border-radius:4px;text-align:center}
.hx .tag b{font:800 11px ui-monospace,monospace;color:#fff;display:block}
.hx .tag .bar{height:3px;margin-top:2px;background:#d83a2e;display:flex}
.hx .tag .bar i{display:block;background:#4be68a}
.hx .head{left:50%;top:42%;width:34px;height:34px;transform:translate(-50%,-50%);animation:hxp .6s infinite alternate}
.hx .pop{left:140px;top:14px;font:800 11px ui-monospace,monospace;color:#7dffb0;text-shadow:0 1px 2px #000;animation:hxu 1.4s ease-out forwards;white-space:nowrap}
.hx .pop.neg{color:#ff8a7a}
@keyframes hxp{from{opacity:.55}to{opacity:1}}
@keyframes hxu{from{transform:translateY(0);opacity:1}to{transform:translateY(-26px);opacity:0}}
`;

const EYE = (fill, hot) => {
  const c = 2 * Math.PI * 9, col = hot ? '#ff4a3a' : '#ffe45e';
  return `<svg viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="9" fill="rgba(6,30,18,.7)" stroke="#17402a" stroke-width="2"/>` +
    `<circle cx="11" cy="11" r="9" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="${(c * fill).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 11 11)"/>` +
    `<path d="M3 11 Q11 4 19 11 Q11 18 3 11Z" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="11" cy="11" r="2.4" fill="${hot ? '#ff4a3a' : '#fff'}"/></svg>`;
};
const TRUCK = '<svg class="tr" viewBox="0 0 26 16"><rect x="1" y="2" width="14" height="9" rx="1" fill="#6dffb0"/><path d="M15 5h5l4 3v3H15z" fill="#43b8e8"/><circle cx="6" cy="12.5" r="2.3" fill="#111" stroke="#fff" stroke-width="1"/><circle cx="19" cy="12.5" r="2.3" fill="#111" stroke="#fff" stroke-width="1"/></svg>';
const ARROW = '<svg class="ar" viewBox="0 0 18 18"><path d="M9 1 L16 15 L9 11.5 L2 15Z" fill="#ffe45e" stroke="#000" stroke-width="1"/></svg>';
const FOOT = '<svg viewBox="0 0 10 12"><path d="M2 1h4l1 6-1 4H3L2 7Z" fill="#cfe"/></svg>';
const HEAD = '<svg class="head" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="#9aa4ae" stroke="#fff" stroke-width="2"/><rect x="9" y="15" width="16" height="5" rx="2" fill="#9fe8ff"/></svg>';

export class HudX {
  constructor(UI) {
    this.UI = UI;
    if (!document.getElementById('hx-css')) { const s = document.createElement('style'); s.id = 'hx-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = this.el = document.createElement('div'); el.className = 'hx hidden';
    el.innerHTML = '<div class="pips"></div><div class="pads"></div><div class="esc" hidden></div><div class="eye"></div>' +
      '<div class="wt"><i></i></div><div class="tag" hidden></div>';
    document.body.appendChild(el);
    this.q = (s) => el.querySelector(s);
    this.q('.wt').insertAdjacentHTML('afterbegin', FOOT);
    this.last = {};
    this.fit();
    addEventListener('resize', () => this.fit());
  }
  fit() {
    const k = this.UI.scale || 1;
    Object.assign(this.el.style, { width: innerWidth / k + 'px', height: innerHeight / k + 'px', transform: `scale(${k})` });
  }
  show() { this.el.classList.remove('hidden'); this.fit(); }
  hide() { this.el.classList.add('hidden'); }
  set(key, html, node) { if (this.last[key] !== html) { this.last[key] = html; node.innerHTML = html; } }

  /** s: { pips:{n, cur}, pads:['done'|'active'|'locked'], escape:null|{angle}, aware, chase, weight (0..1)|null, carry:{value,value0}|null, down } */
  update(s) {
    this.show();
    this.set('pips', Array.from({ length: s.pips.n }, (_, i) => `<i class="${i + 1 < s.pips.cur ? 'd' : i + 1 === s.pips.cur ? 'c' : ''}"></i>`).join(''), this.q('.pips'));
    this.set('pads', s.pads.map((p) => `<b class="${p[0]}"></b>`).join(''), this.q('.pads'));
    const esc = this.q('.esc');
    if (s.escape) {
      esc.hidden = false;
      if (!esc.firstChild) esc.innerHTML = TRUCK + ARROW;
      esc.querySelector('.ar').style.transform = `rotate(${s.escape.angle}rad)`;
    } else esc.hidden = true;
    const fill = Math.max(0, Math.min(1, s.aware || 0));
    this.set('eye', EYE(Math.round(fill * 24) / 24, !!s.chase), this.q('.eye'));
    const wt = this.q('.wt'); wt.style.display = s.weight == null ? 'none' : 'block';
    if (s.weight != null) { const i = wt.querySelector('i'); i.style.width = Math.round(s.weight * 100) + '%'; i.style.background = s.weight < 0.6 ? '#ffb04a' : '#6df0a8'; }
    const tag = this.q('.tag');
    if (s.carry) {
      tag.hidden = false;
      const k = Math.max(0, Math.min(1, s.carry.value / (s.carry.value0 || 1)));
      this.set('tag', `<b>$${Math.round(s.carry.value).toLocaleString('en-US')}</b><div class="bar"><i style="width:${(k * 100).toFixed(0)}%"></i></div>`, tag);
    } else tag.hidden = true;
    const hd = this.el.querySelector('svg.head');
    if (s.down && !hd) this.el.insertAdjacentHTML('beforeend', HEAD); else if (!s.down && hd) hd.remove();
  }

  /** Floating money change near the wallet widget. */
  pop(amount) {
    const d = document.createElement('div');
    d.className = 'pop' + (amount < 0 ? ' neg' : '');
    d.textContent = (amount < 0 ? '-$' : '+$') + Math.abs(Math.round(amount)).toLocaleString('en-US');
    this.el.appendChild(d); setTimeout(() => d.remove(), 1500);
  }
}

/** Flat ring on the floor that fills clockwise from the top: set(p) with p in 0..1. */
export class Ring {
  constructor(scene, x, z, r0, r1, color, y = 0.05) {
    this.scene = scene; this.r0 = r0; this.r1 = r1; this.p = -1;
    this.mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    const bgGeo = new THREE.RingGeometry(r0, r1, 40);
    this.bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x0a1410, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }));
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    for (const m of [this.bg, this.mesh]) { m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); }
    this.mesh.position.y = y + 0.002;
    this.set(0);
  }
  set(p) {
    p = Math.max(0, Math.min(1, p));
    const q = Math.round(p * 60);
    if (q === this.p) return;
    this.p = q;
    this.mesh.visible = q > 0;
    if (q <= 0) return;
    this.mesh.geometry.dispose();
    // start at 12 o'clock and go clockwise seen from above: the mesh is rotated -90deg about x, so +theta in ring space is CCW from above
    const g = new THREE.RingGeometry(this.r0, this.r1, Math.max(3, q), 1, Math.PI / 2, -2 * Math.PI * q / 60);
    this.mesh.geometry = g;
  }
  setColor(c) { this.mat.color.setHex(c); }
  dispose() { this.scene.remove(this.bg, this.mesh); this.bg.geometry.dispose(); this.bg.material.dispose(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
