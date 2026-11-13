// Geometry helpers: a builder that merges primitives per material into few meshes, rounded boxes,
// and noise displacement. Models are code, so every part is a call here.
(function () {
  'use strict';
  const PM = globalThis.PM;

  PM.Geo = {
    rbox(w, h, d, r, seg) {
      const THREE = globalThis.THREE, s = seg || 3;
      r = Math.min(r, w / 2, h / 2, d / 2);
      const g = new THREE.BoxGeometry(w, h, d, s, s, s).toNonIndexed();
      const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
      const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        c.set(PM.clamp(v.x, -hx, hx), PM.clamp(v.y, -hy, hy), PM.clamp(v.z, -hz, hz));
        v.sub(c);
        if (v.lengthSq() < 1e-10) v.fromBufferAttribute(n, i); else v.normalize();
        n.setXYZ(i, v.x, v.y, v.z);
        p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
      }
      return g;
    },
    displace(geo, amp, freq, seed, keepNormals) {
      const THREE = globalThis.THREE, p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3(), m = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); m.fromBufferAttribute(n, i);
        const k = (PM.fbm(v.x * freq + 11.3, v.y * freq + v.z * freq * 0.71 + 5.1, seed, 3) + PM.fbm(v.z * freq + 3.7, v.x * freq * 0.63 - v.y * freq, seed + 9, 3) - 1) * amp;
        p.setXYZ(i, v.x + m.x * k, v.y + m.y * k, v.z + m.z * k);
      }
      if (!keepNormals) geo.computeVertexNormals();
      return geo;
    },
    // Smooth normals for a non-indexed geometry by welding positions.
    smooth(geo) {
      const p = geo.attributes.position, n = geo.attributes.normal, acc = new Map();
      const key = (i) => Math.round(p.getX(i) * 500) + ',' + Math.round(p.getY(i) * 500) + ',' + Math.round(p.getZ(i) * 500);
      for (let i = 0; i < p.count; i++) { const k = key(i); let a = acc.get(k); if (!a) acc.set(k, (a = [0, 0, 0])); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
      for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
      return geo;
    },
    merge(list) {
      const THREE = globalThis.THREE;
      let count = 0;
      const parts = list.map((g) => { const ng = g.index ? g.toNonIndexed() : g; count += ng.attributes.position.count; return ng; });
      const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
      let hasCol = parts.some((g) => g.attributes.color), col = hasCol ? new Float32Array(count * 3).fill(1) : null, o = 0;
      for (const g of parts) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        if (hasCol && g.attributes.color) col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (hasCol) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return out;
    }
  };

  // b.part(name, parentName?) opens an animated sub-group; b.add(geometry, material, {p, r, s}) puts a primitive in the current part.
  PM.Build = function () {
    const THREE = globalThis.THREE;
    const root = new THREE.Group(), parts = { root: { group: root, batches: new Map() } };
    let cur = parts.root;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
    const b = { root, parts: {} };
    b.part = function (name, parent, pos) {
      const g = new THREE.Group(); g.name = name;
      (parent ? parts[parent].group : root).add(g);
      if (pos) g.position.fromArray(pos);
      parts[name] = cur = { group: g, batches: new Map() };
      b.parts[name] = g;
      return g;
    };
    b.use = function (name) { cur = parts[name]; };
    b.add = function (geo, mat, t) {
      t = t || {};
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      e.set(...(t.r || [0, 0, 0])); q.setFromEuler(e); vp.set(...(t.p || [0, 0, 0]));
      const s = t.s === undefined ? [1, 1, 1] : typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s; vs.set(...s);
      g.applyMatrix4(t.m || m4.compose(vp, q, vs));
      if (!cur.batches.has(mat)) cur.batches.set(mat, []);
      cur.batches.get(mat).push(g);
      return b;
    };
    // A capsule between two points.
    b.limb = function (mat, from, to, r, r2) {
      const a = new THREE.Vector3(...from), c = new THREE.Vector3(...to), len = a.distanceTo(c);
      const geo = r2 === undefined ? new THREE.CapsuleGeometry(r, len, 4, 10) : new THREE.CylinderGeometry(r2, r, len, 12);
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
      return b.add(geo, mat, { m: new THREE.Matrix4().compose(a.add(c).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1)) });
    };
    b.build = function (opts) {
      for (const k in parts) {
        for (const [mat, list] of parts[k].batches) {
          const mesh = new THREE.Mesh(PM.Geo.merge(list), mat);
          mesh.castShadow = !(opts && opts.noShadow); mesh.receiveShadow = true;
          if (mat.userData && mat.userData.layer === 1) { mesh.layers.set(1); mesh.castShadow = false; }
          parts[k].group.add(mesh);
          for (const g of list) g.dispose();
        }
        parts[k].batches.clear();
      }
      return root;
    };
    return b;
  };
})();
