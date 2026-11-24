// The effects' block language (Addendum 11.3): what the effects draw with is square. A glow is a stepped square block,
// a smoke dot a ragged square of pixels, a thrown thing a box, and a shader effect on the floor snaps its coordinates to
// a grid of effect pixels so its outline steps and its fill reads as pixels, like the voxel world around it.
const THREE = window.THREE;

// metres per effect pixel on the floor: about two texels of a world block, a few screen pixels at the battle overview;
// a wide mark takes cells of a fourteenth of its radius, so its steps still read at the size it is seen
export const FX_PX = 0.2;
// snap a coordinate to the centre of its cell of size s
export const PXQ = 'vec2 pxq(vec2 m, float s) { return (floor(m / s) + 0.5) * s; }';

const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

function repaint(tex, n, draw) {
  const cv = tex.image; const cell = cv.width / n; const c = cv.getContext('2d'); const img = c.createImageData(cv.width, cv.height);
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    const [r, g, b, a] = draw(cx - (n - 1) / 2, cy - (n - 1) / 2, cx, cy);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { const o = ((cy * cell + y) * cv.width + cx * cell + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a; }
  }
  c.putImageData(img, 0, 0); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true; tex.userData.pixel = true;
}

// Blockade Z's two dot textures, shared by every billboard, halo and flash sprite, repainted in place (same texture
// objects, so every material that holds them follows): 'glow' 8 x 8 cells, a bright 2 x 2 core in square rings that
// step down, the outer ring broken; 'puff' 8 x 8 cells, a square whose edge is torn cell by cell, alpha in three steps.
// The additive glow board shares 'puff' with the smoke board; a full square adds up to about twice the light of the old
// soft dot, so the glow board gets its own dimmer pixel dot (mean alpha ~0.3, as the soft dot had), found in the scene by
// its material: additive, drawing 'puff'.
export function pixelTextures(scene) {
  const BZ = window.BZ;
  const glow = BZ.tex('glow');
  if (!glow.userData.pixel) {
    repaint(glow, 8, (dx, dy, cx, cy) => {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const a = d < 1 ? 200 : d < 2 ? 115 : d < 3 ? 50 : hash(cx, cy, 1) < 0.45 ? 20 : 0;
      return [255, 200, 120, a];
    });
  }
  const puff = BZ.tex('puff');
  if (!puff.userData.pixel) {
    repaint(puff, 8, (dx, dy, cx, cy) => {
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + (hash(cx, cy, 2) - 0.5) * 1.4;
      const a = d < 1.6 ? 215 : d < 2.7 ? 135 : d < 3.6 ? 60 : 0;
      return [255, 255, 255, a];
    });
  }
  let gp = null; const boards = [];
  scene.traverse((o) => {
    const m = o.material; if (!m || !m.uniforms || !m.uniforms.map || m.uniforms.map.value !== puff || m.blending !== THREE.AdditiveBlending) return;
    if (!gp) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; gp = new THREE.CanvasTexture(cv); gp.name = 'fx_glowpuff'; gp.colorSpace = THREE.SRGBColorSpace;
      repaint(gp, 8, (dx, dy, cx, cy) => { const d = Math.max(Math.abs(dx), Math.abs(dy)) + (hash(cx, cy, 3) - 0.5) * 0.9; const a = d < 1.6 ? 170 : d < 2.7 ? 85 : d < 3.6 && hash(cx, cy, 4) < 0.5 ? 34 : 0; return [255, 255, 255, a]; });
    }
    m.uniforms.map.value = gp;
    // a brightness knob: in the ultimate's close-up the glow dots stand several times bigger and stack to white
    m.uniforms.uK = { value: 1 }; m.fragmentShader = m.fragmentShader.replace('uniform sampler2D map;', 'uniform sampler2D map; uniform float uK;').replace('vC * t.a * vA', 'vC * t.a * vA * uK'); m.needsUpdate = true;
    boards.push(m);
  });
  return { glowK(k) { for (const m of boards) m.uniforms.uK.value = k; } };
}

// boxes [cx, cy, cz, sx, sy, sz, yaw = 0, pitch = 0] merged into one flat-shaded geometry (one draw call)
export function boxGeo(list) {
  const pos = []; const nor = []; const uv = []; const M = new THREE.Matrix4(); const E = new THREE.Euler(); const Q = new THREE.Quaternion();
  for (const [x, y, z, sx, sy, sz, yaw = 0, pitch = 0] of list) {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    M.compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(pitch, yaw, 0)), new THREE.Vector3(1, 1, 1)); g.applyMatrix4(M);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// a canvas drawn smooth, shrunk to w x h effect pixels with its alpha in four steps, shown with hard pixel edges
export function pixTex(cv, w, h, wrap = false) {
  const s = document.createElement('canvas'); s.width = w; s.height = h; const c = s.getContext('2d'); c.drawImage(cv, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h); for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] / 255 * 4) / 4 * 255;
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(s); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (wrap) t.wrapS = THREE.RepeatWrapping; return t;
}
