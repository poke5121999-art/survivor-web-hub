// Which way to dodge a boss's skill: while a boss warning fills (sim `tele` event, team 1, from a boss), double chevrons
// burnt into the floor run out of the danger area along the way out, the way a player should run: outward from a circle,
// sideways off a line, sideways out of a cone. A hero standing inside gets its own chevron pointing at the nearest way out.
// The chevrons crawl outward and brighten as the hit nears, then go when it lands. One instanced mesh, one draw call.
const THREE = window.THREE;

const CAP = 64;

function chevronTex() {
  const W = 64; const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const c = cv.getContext('2d');
  // two chevrons pointing +x (canvas right), soft scorched edge, bright core
  const chev = (x0, a) => {
    c.beginPath(); c.moveTo(x0, 10); c.lineTo(x0 + 20, 32); c.lineTo(x0, 54); c.lineTo(x0 - 9, 54); c.lineTo(x0 + 11, 32); c.lineTo(x0 - 9, 10); c.closePath();
    c.globalAlpha = a; c.fill();
  };
  c.shadowColor = 'rgba(255,80,40,1)'; c.shadowBlur = 7; c.fillStyle = '#ffd0a0'; chev(14, 0.65); chev(36, 1);
  const img = c.getImageData(0, 0, W, W); let s = 7;
  for (let i = 3; i < img.data.length; i += 4) { s = (s * 16807) % 2147483647; img.data[i] = Math.round(img.data[i] * (0.75 + 0.25 * (s / 2147483647))); }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWarn(H) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: chevronTex(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, CAP); mesh.name = 'bossDodge'; mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 3;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  H.scene.add(mesh);
  const list = []; // { x, z, dx, dz, t, dur, size, hero }
  const M = new THREE.Matrix4(); const Qt = new THREE.Quaternion(); const S = new THREE.Vector3(); const P = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);

  function add(x, z, dx, dz, dur, size, hero = 0) { if (list.length < CAP) list.push({ x, z, dx, dz, t: 0, dur, size, hero }); }
  // the way out of the warning e for a point (px, pz) inside it, or null when the point is outside
  function wayOut(e, px, pz) {
    if (e.shape === 'circle') { const dx = px - e.x; const dz = pz - e.z; const d = Math.hypot(dx, dz); if (d > e.r) return null; return d < 0.05 ? [1, 0, e.r] : [dx / d, dz / d, e.r - d]; }
    if (e.shape === 'line') {
      const lx = e.x2 - e.x; const lz = e.z2 - e.z; const L = Math.hypot(lx, lz) || 1; const ux = lx / L; const uz = lz / L;
      const rx = px - e.x; const rz = pz - e.z; const along = rx * ux + rz * uz; const side = -rx * uz + rz * ux;
      if (along < 0 || along > L || Math.abs(side) > e.w / 2) return null; const sg = side >= 0 ? 1 : -1; return [-uz * sg, ux * sg, e.w / 2 - Math.abs(side)];
    }
    if (e.shape === 'cone') {
      const dx = px - e.x; const dz = pz - e.z; const d = Math.hypot(dx, dz); if (d > e.r) return null;
      const a = Math.atan2(dz, dx); let da = a - e.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const half = (e.deg * Math.PI) / 360; if (Math.abs(da) > half) return null; const sg = da >= 0 ? 1 : -1; const out = e.ang + sg * (half + 0.4);
      return [Math.cos(out), Math.sin(out), d * Math.sin(half - Math.abs(da))];
    }
    return null;
  }

  const api = {
    mesh,
    onEvent(e, B) {
      if (e.e !== 'tele' || e.team !== 1 || !B) return;
      const src = B.enemies.find((u) => u.boss && u.alive); if (!src) return;
      const dur = e.t || 1;
      if (e.shape === 'circle') {
        const n = Math.max(6, Math.min(10, Math.round(e.r * 1.6)));
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; add(e.x + Math.cos(a) * e.r * 0.72, e.z + Math.sin(a) * e.r * 0.72, Math.cos(a), Math.sin(a), dur, Math.min(1.6, 0.6 + e.r * 0.18)); }
      } else if (e.shape === 'line') {
        const lx = e.x2 - e.x; const lz = e.z2 - e.z; const L = Math.hypot(lx, lz) || 1; const ux = lx / L; const uz = lz / L; const n = Math.max(2, Math.min(6, Math.round(L / 3)));
        for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; const cx = e.x + lx * k; const cz = e.z + lz * k; for (const sg of [-1, 1]) add(cx - uz * sg * e.w * 0.25, cz + ux * sg * e.w * 0.25, -uz * sg, ux * sg, dur, Math.min(1.4, 0.5 + e.w * 0.3)); }
      } else if (e.shape === 'cone') {
        const half = (e.deg * Math.PI) / 360;
        for (const sg of [-1, 1]) for (const k of [0.45, 0.8]) { const a = e.ang + sg * half * 0.6; const out = e.ang + sg * (half + 0.5); add(e.x + Math.cos(a) * e.r * k, e.z + Math.sin(a) * e.r * k, Math.cos(out), Math.sin(out), dur, 0.9); }
      }
      // a hero inside: its own brighter chevron, pointing at its nearest way out
      for (const h of B.heroes) { if (!h.alive) continue; const w = wayOut(e, h.x, h.z); if (w) add(h.x + w[0] * 0.9, h.z + w[1] * 0.9, w[0], w[1], dur, 1.1, 1); }
    },
    update(dt) {
      let n = 0; const ic = mesh.instanceColor.array;
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i]; c.t += dt; if (c.t >= c.dur + 0.05) { list.splice(i, 1); continue; }
        const k = Math.min(1, c.t / c.dur); const crawl = ((c.t * 1.6) % 1) * 0.6;
        Qt.setFromAxisAngle(UP, Math.atan2(-c.dz, c.dx)); S.set(c.size, 1, c.size * 0.8); P.set(c.x + c.dx * crawl, 0.06, c.z + c.dz * crawl);
        M.compose(P, Qt, S); mesh.setMatrixAt(n, M);
        const a = Math.min(1, c.t / 0.15) * (0.45 + 0.55 * k) * (1 - Math.max(0, (c.t - c.dur) / 0.05)) * (0.75 + 0.25 * Math.sin(c.t * 18));
        if (c.hero) { ic[n * 3] = 1.0 * a; ic[n * 3 + 1] = 0.95 * a; ic[n * 3 + 2] = 0.55 * a; } else { ic[n * 3] = 1.0 * a; ic[n * 3 + 1] = 0.45 * a; ic[n * 3 + 2] = 0.3 * a; }
        n++;
      }
      mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    clear() { list.length = 0; mesh.count = 0; mesh.visible = false; },
  };
  return api;
}
