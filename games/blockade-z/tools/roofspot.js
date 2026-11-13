// A page expression that finds open ground facing a wall with a flat roof 2.6-8 m up, and the hook point just below
// the roof edge on that wall. kits.js uses it to test Nhện Đồng's swing onto a roof, heroshots.js to film it.
'use strict';
exports.FIND_ROOF = `(() => { const G = __G; const T = G.THREE; const V = (x, y, z) => new T.Vector3(x, y, z);
  for (const [x, z] of [[0, 9], [0, 0], [6, 6], [-6, 6], [6, -6], [-6, -6], [0, -10], [10, 0], [-10, 0], [12, 12], [-12, 12], [12, -12], [-12, -12]]) {
    if (G.world.overlaps([x - 0.4, 0.05, z - 0.4], [x + 0.4, 1.8, z + 0.4])) continue;
    for (let k = 0; k < 24; k++) { const yaw = (k / 24) * Math.PI * 2; const d = V(-Math.sin(yaw), 0, -Math.cos(yaw)); const wh = G.world.raycast(V(x, 1.1, z), d, 16);
      if (!wh || wh.t < 6 || Math.abs(wh.normal[1]) > 0.3) continue;
      const n = V(...wh.normal); const face = V(x, 1.1, z).addScaledVector(d, wh.t);
      const probe = V(face.x - n.x * 1.2, 14, face.z - n.z * 1.2); const dn = G.world.raycast(probe, V(0, -1, 0), 14); if (!dn) continue; const top = 14 - dn.t;
      if (top < 2.6 || top > 8) continue;
      const hook = V(face.x, top - 0.45, face.z); const up = G.world.raycast(V(face.x + n.x * 0.3, top - 0.45, face.z + n.z * 0.3), V(-n.x, 0, -n.z), 1); if (!up) continue;
      return { x, z, yaw, top: +top.toFixed(2), hook: [hook.x + n.x * 0.05, hook.y, hook.z + n.z * 0.05], dist: +wh.t.toFixed(2) }; } }
  return null; })()`;
