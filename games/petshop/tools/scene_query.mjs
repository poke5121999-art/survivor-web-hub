// node tools/scene_query.mjs <art id> <name regex|--k Component> : world positions of matching nodes
import fs from 'fs';
const [id, ...q] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(new URL(`../art/${id}/scene.json`, import.meta.url)));
const N = s.nodes;
function qmul(a, b) { return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]; }
function rot(q, v) { const [x,y,z,w]=q; const ix=w*v[0]+y*v[2]-z*v[1], iy=w*v[1]+z*v[0]-x*v[2], iz=w*v[2]+x*v[1]-y*v[0], iw=-x*v[0]-y*v[1]-z*v[2];
  return [ix*w+iw*-x+iy*-z-iz*-y, iy*w+iw*-y+iz*-x-ix*-z, iz*w+iw*-z+ix*-y-iy*-x]; }
const W = [];
function world(i) { if (W[i]) return W[i]; const n = N[i]; const t = n.t || [0,0,0], r = n.r || [0,0,0,1], sc = n.s || [1,1,1];
  if (n.p < 0) return W[i] = { t, r, s: sc };
  const P = world(n.p); const ts = [t[0]*P.s[0], t[1]*P.s[1], t[2]*P.s[2]]; const rt = rot(P.r, ts);
  return W[i] = { t: [P.t[0]+rt[0], P.t[1]+rt[1], P.t[2]+rt[2]], r: qmul(P.r, r), s: [P.s[0]*sc[0], P.s[1]*sc[1], P.s[2]*sc[2]] }; }
const path = i => { const p = []; while (i >= 0) { p.push(N[i].n); i = N[i].p; } return p.reverse().join('/'); };
const byK = q[0] === '--k';
const re = new RegExp(byK ? q[1] : q[0]);
N.forEach((n, i) => {
  const hit = byK ? n.k && Object.keys(n.k).some(k => re.test(k)) : re.test(n.n);
  if (!hit) return;
  const w = world(i);
  console.log(i, path(i), w.t.map(v => v.toFixed(2)).join(','), n.a === 0 ? 'OFF' : '', n.k ? Object.keys(n.k).join('|') : '');
});
