// HUD Navigation System markers: every active "HUD Element Pivot" (HUDNavigationElement) gets an on-screen marker,
// pinned to the screen edge with an arrow when the spot is off-screen or behind the camera. Gameplay can add
// temporary targets (dispensed food). The markers are drawn as DOM over the canvas (css in index.html).
import * as THREE from 'three';
import { activeInHierarchy } from './unity.js';

const TYPE = 'SickscoreGames.HUDNavigationSystem.HUDNavigationElement';
const v = new THREE.Vector3();

export class NavMarkers {
  constructor(objects, layer) {
    this.elements = objects.filter(o => o.userData.node?.k?.[TYPE]);
    this.layer = layer;
    this.pool = [];
    this.extra = new Set();
    this.opacity = 1;
    this.enabled = true;
    this.shown = [];
  }

  marker(i) {
    while (this.pool.length <= i) {
      const el = document.createElement('div');
      el.className = 'nav-marker';
      el.innerHTML = '<i></i>';
      this.layer.appendChild(el);
      this.pool.push(el);
    }
    return this.pool[i];
  }

  // Positions of the visible markers' targets (tests steer by them).
  targets() { return this.shown.map(p => p.toArray()); }

  update(camera, width, height) {
    const pts = [];
    if (this.enabled) {
      for (const o of this.elements) if (activeInHierarchy(o)) pts.push(o.getWorldPosition(new THREE.Vector3()));
      for (const o of this.extra) if (o.parent && o.visible) pts.push(o.getWorldPosition(new THREE.Vector3()));
    }
    this.shown = pts;
    camera.updateMatrixWorld();
    const m = 36;
    pts.forEach((p, i) => {
      const el = this.marker(i);
      v.copy(p).project(camera);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
      if (behind) { x = width - x; y = height - m; }
      const off = behind || x < m || x > width - m || y < m || y > height - m;
      let ang = 0;
      if (off) {
        const cx = width / 2, cy = height / 2;
        ang = Math.atan2(y - cy, x - cx);
        const k = Math.min((cx - m) / Math.abs(Math.cos(ang) || 1e-6), (cy - m) / Math.abs(Math.sin(ang) || 1e-6));
        x = cx + Math.cos(ang) * k;
        y = cy + Math.sin(ang) * k;
      }
      el.style.display = 'block';
      el.style.opacity = this.opacity;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.classList.toggle('off', off);
      el.firstChild.style.transform = off ? `rotate(${(ang * 180 / Math.PI - 90).toFixed(1)}deg)` : '';
    });
    for (let i = pts.length; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }
}
