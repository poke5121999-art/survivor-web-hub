// The game camera: orthographic, yaw 135 deg and pitch 30 deg (level2 "cam" + "Main Camera" transforms), looking at a
// point on the ground. Drag pans along the ground, wheel or pinch zooms the orthographic half-height.
// onGrab(x, y) -> true takes a one-finger drag for itself (move mode): onDrag(x, y) while it moves, onDrop(x, y) at the
// end, and no pan. onLongPress(x, y) fires after a still 0.5 s press.
import * as THREE from 'three';

const FWD = new THREE.Vector3(0.6124, -0.5, 0.6124);

export class GameCamera {
  constructor(canvas, { size = 1.7, min = 1.0, max = 4.0 } = {}) {
    this.canvas = canvas;
    this.size = size;
    this.min = min;
    this.max = max;
    this.target = new THREE.Vector3();
    this.bounds = null;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 100);
    this.pointers = new Map();
    this.moved = 0;
    this.onTap = null;
    this.onGrab = this.onDrag = this.onDrop = this.onLongPress = null;
    this.grabbed = false;
    this.bind();
    this.update();
  }

  aspect() {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  update() {
    const a = this.aspect();
    const c = this.cam;
    c.left = -this.size * a;
    c.right = this.size * a;
    c.top = this.size;
    c.bottom = -this.size;
    c.updateProjectionMatrix();
    if (this.bounds) this.target.clamp(this.bounds.min, this.bounds.max);
    c.position.copy(this.target).addScaledVector(FWD, -20);
    c.lookAt(this.target);
    c.updateMatrixWorld();
  }

  // World units per CSS pixel on the ground plane along screen x.
  unitsPerPixel() {
    return (2 * this.size) / Math.max(1, this.canvas.clientHeight);
  }

  pan(dx, dy) {
    const k = this.unitsPerPixel();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion).setY(0).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cam.quaternion).setY(0).normalize();
    // Screen y on the tilted ground stretches by 1 / sin(pitch) = 2.
    this.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k * 2);
    this.update();
  }

  zoom(f) {
    this.size = THREE.MathUtils.clamp(this.size * f, this.min, this.max);
    this.update();
  }

  // Ground point (y = 0) under a CSS pixel of the canvas.
  ground(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  }

  bind() {
    const el = this.canvas;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.moved = 0;
        this.grabbed = !!(this.onGrab && this.onGrab(e.clientX, e.clientY));
        clearTimeout(this.longTimer);
        const x = e.clientX, y = e.clientY;
        if (this.onLongPress && !this.grabbed) this.longTimer = setTimeout(() => { if (this.moved < 8 && this.pointers.size === 1) { this.moved = 1e9; this.onLongPress(x, y); } }, 500);
      } else this.grabbed = false;
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1 && this.grabbed) {
        this.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
        if (this.onDrag) this.onDrag(e.clientX, e.clientY);
      } else if (this.pointers.size === 1) {
        this.pan(e.clientX - p.x, e.clientY - p.y);
        this.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const [c, d] = [...this.pointers.values()];
        const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0 > 0 && d1 > 0) this.zoom(d0 / d1);
        this.moved += 100;
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      clearTimeout(this.longTimer);
      if (this.grabbed) { this.grabbed = false; if (this.onDrop) this.onDrop(e.clientX, e.clientY, this.moved); return; }
      if (this.pointers.size === 0 && this.moved < 8 && this.onTap) this.onTap(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  }
}
