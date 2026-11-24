// Round props into blocks (Addendum 11): `blockify(geometry)` returns the block counterpart of a three.js primitive,
// flat-shaded, at about the same size, so a prop written with spheres, cylinders and rings reads like the voxel world
// without being redrawn by hand. A sphere, icosahedron, dodecahedron or lathe becomes its bounding box (a little inset),
// a cylinder or cone a square prism or pyramid (turned 45 degrees so its faces line up with the world grid), a torus a
// square frame of four bars (or bars along its arc), a circle a square. Anything else keeps its shape with flat normals.
const THREE = window.THREE;

// a circle of radius r and the square of half side r * SQ cover about the same area
const SQ = 0.89;

function flat(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute('normal'); n.computeVertexNormals(); return n;
}
function merge(list) {
  const pos = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); if (n !== g) n.dispose(); g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
}
function boxOf(g, k = 0.9) {
  g.computeBoundingBox(); const b = g.boundingBox; const s = new THREE.Vector3(); const c = new THREE.Vector3(); b.getSize(s); b.getCenter(c);
  return new THREE.BoxGeometry(Math.max(1e-3, s.x * k), Math.max(1e-3, s.y * k), Math.max(1e-3, s.z * k)).translate(c.x, c.y, c.z);
}

export function blockify(g) {
  if (!g || g.userData.block) return g;
  const p = g.parameters || {}; let out;
  switch (g.type) {
    case 'SphereGeometry': case 'IcosahedronGeometry': case 'DodecahedronGeometry': case 'LatheGeometry': case 'CapsuleGeometry': case 'TetrahedronGeometry':
      out = boxOf(g, g.type === 'SphereGeometry' && (p.phiLength < Math.PI * 2 - 1e-3 || p.thetaLength < Math.PI - 1e-3) ? 1 : SQ); break;
    case 'CylinderGeometry': case 'ConeGeometry': {
      const rt = g.type === 'ConeGeometry' ? 0 : p.radiusTop; const rb = p.radiusBottom ?? p.radius;
      if (p.thetaLength < Math.PI * 2 - 1e-3) { out = boxOf(g, 1); break; }
      out = new THREE.CylinderGeometry(rt * SQ * Math.SQRT2, rb * SQ * Math.SQRT2, p.height, 4, 1, p.openEnded, Math.PI / 4); break;
    }
    case 'TorusGeometry': {
      const R = p.radius; const r = p.tube * 1.15; const arc = p.arc ?? Math.PI * 2; const bars = [];
      if (arc >= Math.PI * 2 - 1e-3) {
        for (let i = 0; i < 4; i++) { const b = new THREE.BoxGeometry(2 * (R + r), 2 * r, 2 * r); b.translate(0, 0, 0); b.translate(0, R, 0); b.rotateZ(i * Math.PI / 2); bars.push(b); }
      } else {
        const n = Math.max(2, Math.round(arc / (Math.PI / 4)));
        for (let i = 0; i < n; i++) { const a = (i + 0.5) * arc / n; const len = 2 * R * Math.sin(arc / n / 2) + r; const b = new THREE.BoxGeometry(len, 2 * r, 2 * r); b.rotateZ(a + Math.PI / 2); b.translate(Math.cos(a) * R, Math.sin(a) * R, 0); bars.push(b); }
      }
      out = merge(bars); break;
    }
    case 'CircleGeometry': case 'RingGeometry': {
      const r = p.radius ?? p.outerRadius; out = new THREE.PlaneGeometry(2 * r * SQ, 2 * r * SQ); break;
    }
    default: out = g.clone();
  }
  g.dispose();
  out = flat(out); out.userData.block = true; return out;
}
// the same, in place on a mesh (and its children)
export function blockifyMesh(o) { o.traverse((m) => { if (m.isMesh && m.geometry) m.geometry = blockify(m.geometry); }); return o; }
