// Renderer, lights and the follow camera (Unity CameraRig: Offset -> YRotation -> XRotation -> Camera at local z -20, fov 60).
import * as THREE from 'three';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2fb4ff);
    // FarmScene RenderSettings: trilight ambient (sky 0.698 grey, equator 0.448/0.544/1, ground 0/0.745/0.087)
    const hemi = new THREE.HemisphereLight(new THREE.Color().setRGB(0.698, 0.698, 0.698, THREE.SRGBColorSpace),
      new THREE.Color().setRGB(0.3, 0.6, 0.35, THREE.SRGBColorSpace), 1.6);
    this.scene.add(hemi);
    // Directional Light colour (1, 0.957, 0.839), shadows on
    this.sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.957, 0.839, THREE.SRGBColorSpace), 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.sunOffset = new THREE.Vector3(-18, 40, 22);
    this.scene.add(this.sun, this.sun.target);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1000);
    this.rig = { yaw: 0, pitch: 50, dist: 20, height: 0, offset: new THREE.Vector3() };
    this.focus = new THREE.Vector3();
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  follow(target, dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.focus.lerp(target, k);
    const { yaw, pitch, dist, height, offset } = this.rig;
    const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180;
    const f = this.focus.clone().add(offset);
    f.y += height;
    this.camera.position.set(f.x + dist * Math.cos(p) * Math.sin(y), f.y + dist * Math.sin(p), f.z + dist * Math.cos(p) * Math.cos(y));
    this.camera.lookAt(f);
    this.sun.position.copy(this.focus).add(this.sunOffset);
    this.sun.target.position.copy(this.focus);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
