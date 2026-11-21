// Z-fighting finder (map-test uses it; run alone for a survey). By draw order: Every opaque triangle is drawn in a flat colour of its own; the frame is drawn twice,
// once in order and once with meshes and triangles reversed. Where two surfaces lie at the same depth (to the depth
// buffer's precision) the winner is whoever came first, so the two frames differ: those pixels z-fight.
// Decals (transparent, no depth write) are drawn white over the opaque frame pulled 2 depth units nearer and pushed 2
// further: where that changes whether they show, they sit on the floor's depth and flicker.
// Pixels whose colour changes between two identical forward draws are left out (unstable, not z-fighting).
// Usage: PLAYWRIGHT_PATH=... node games/ai-sinh-ton/tools/zfight.mjs <q> <stage>:<wave>[:<team>][:<run share>] ...   (ZOUT=.chk subdir, BLAME=1 names the meshes)
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, ROOT } from './pw.mjs';
export const ZFIGHT = (opt = {}) => {
    const G = window.__G; const H = G.host; const T = H.THREE; const R = H.renderer; const gl = R.getContext(); const cam = H.camera; const scene = H.scene;
    H.render(null);
    const w = gl.drawingBufferWidth; const h = gl.drawingBufferHeight;
    const base = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, base);
    scene.updateMatrixWorld(true);
    const opaque = []; const decals = []; const hidden = [];
    scene.traverseVisible((o) => {
      if (!o.material) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const ok = (o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && !m.isShaderMaterial && !m.isRawShaderMaterial && m.depthTest !== false && m.visible !== false;
      if (!ok) { hidden.push(o); return; }
      if (m.depthWrite === false) decals.push(o); else opaque.push(o);
    });
    const hash = (n) => { let x = Math.imul(n | 0, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; return x >>> 0; };
    const rec = [];
    let triBase = 1;
    const prep = (o) => {
      const g0 = o.geometry; const g = g0.index ? g0.toNonIndexed() : g0.clone(); const n = g.attributes.position.count; const nt = n / 3;
      const col = new Float32Array(n * 3);
      for (let t = 0; t < nt; t++) { const hh = hash(triBase + t); for (let k = 0; k < 3; k++) { col[(t * 3 + k) * 3] = ((hh & 255) + 0.5) / 256; col[(t * 3 + k) * 3 + 1] = (((hh >> 8) & 255) + 0.5) / 256; col[(t * 3 + k) * 3 + 2] = (((hh >> 16) & 255) + 0.5) / 256; } }
      triBase += nt;
      g.setAttribute('color', new T.BufferAttribute(col, 3)); g.clearGroups();
      // reversed triangle order
      const gr = g.clone(); for (const key of Object.keys(gr.attributes)) { const a = gr.attributes[key]; const s = a.itemSize; const src = a.array; const dst = new src.constructor(src.length); for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) for (let c = 0; c < s; c++) dst[((nt - 1 - t) * 3 + k) * s + c] = src[(t * 3 + k) * s + c]; gr.setAttribute(key, new T.BufferAttribute(dst, s)); }
      const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
      const mat = new T.MeshBasicMaterial({ vertexColors: true, side: m0.side, polygonOffset: !!m0.polygonOffset, polygonOffsetFactor: m0.polygonOffsetFactor || 0, polygonOffsetUnits: m0.polygonOffsetUnits || 0, fog: false, toneMapped: false, alphaTest: m0.alphaTest || 0, map: m0.alphaTest ? m0.map : null });
      let ic = null; if (o.isInstancedMesh) { ic = o.instanceColor; const a = new Float32Array(o.count * 3 || 3); for (let i = 0; i < o.count; i++) { const hh = hash(900001 + triBase + i * 7); a[i * 3] = 0.5 + (hh & 127) / 256; a[i * 3 + 1] = 0.5 + ((hh >> 8) & 127) / 256; a[i * 3 + 2] = 0.5 + ((hh >> 16) & 127) / 256; } o.instanceColor = new T.InstancedBufferAttribute(a, 3); }
      rec.push({ o, g0, mat0: o.material, ro: o.renderOrder, g, gr, mat, ic, icId: o.instanceColor, vis: o.visible });
    };
    for (const o of opaque) prep(o);
    const sh = R.shadowMap.enabled; R.shadowMap.enabled = false; const ac = R.autoClear; const bg = scene.background; const fogS = scene.fog; scene.background = null; scene.fog = null;
    for (const o of hidden) { o.userData.__v = o.visible; o.visible = false; }
    for (const o of decals) { o.userData.__v = o.visible; o.visible = false; }
    R.setRenderTarget(null); R.setClearColor(0x000000, 1);
    const draw = (rev) => {
      rec.forEach((x, i) => { x.o.geometry = rev ? x.gr : x.g; x.o.material = x.mat; x.o.renderOrder = rev ? rec.length - i : i; if (x.o.isInstancedMesh) x.o.instanceColor = x.icId; });
      R.autoClear = true; R.render(scene, cam); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px;
    };
    const A = draw(false); const Bx = draw(true);
    const blame = [];
    if (opt.blame) {
      const cnt = () => { const a = draw(false); const b = draw(true); let n = 0; for (let i = 0; i < w * h; i++) { const j = i * 4; if (a[j] !== b[j] || a[j + 1] !== b[j + 1] || a[j + 2] !== b[j + 2]) n++; } return n; };
      const all = cnt();
      for (const x of rec) { x.o.visible = false; const n = cnt(); x.o.visible = true; if (all - n > (opt.blameMin || 200)) { let nm = x.o.name; let p = x.o.parent; while (!nm && p) { nm = p.name; p = p.parent; } blame.push([nm + '/' + (x.mat0.name || x.mat0.type) + '/' + x.o.type + ' cnt' + (x.o.count || '') + ' y' + x.o.getWorldPosition(new T.Vector3()).y.toFixed(3), all - n]); } }
    }
    const flag = new Uint8Array(w * h); let nz = 0;
    const A2 = draw(false); let noise = 0;
    for (let i = 0; i < w * h; i++) { const j = i * 4; if (A[j] !== A2[j] || A[j + 1] !== A2[j + 1] || A[j + 2] !== A2[j + 2]) { noise++; continue; } if (A[j] !== Bx[j] || A[j + 1] !== Bx[j + 1] || A[j + 2] !== Bx[j + 2]) { flag[i] = 1; nz++; } }
    // decals: opaque depth first (forward order), then each decal white with offset -2 / +2 units extra
    let nd = 0;
    const dmat = []; for (const o of decals) { const m0 = Array.isArray(o.material) ? o.material[0] : o.material; o.userData.__m = o.material; o.userData.__ro = o.renderOrder; }
    const decalPass = (extra) => {
      rec.forEach((x, i) => { x.o.geometry = x.g; x.o.material = x.mat; x.o.renderOrder = i; });
      for (const o of decals) { const m0 = Array.isArray(o.userData.__m) ? o.userData.__m[0] : o.userData.__m; o.material = new T.MeshBasicMaterial({ color: 0xffffff, transparent: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: m0.polygonOffset ? m0.polygonOffsetFactor : 0, polygonOffsetUnits: (m0.polygonOffset ? m0.polygonOffsetUnits : 0) + extra, side: m0.side, fog: false, toneMapped: false, map: m0.map || null, alphaTest: m0.map ? 0.3 : 0 }); o.renderOrder = 100000; o.visible = o.userData.__v; }
      R.render(scene, cam); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px;
    };
    const DN = decalPass(-2); const DF = decalPass(2);
    for (let i = 0; i < w * h; i++) { const j = i * 4; if (DN[j] !== DF[j] || DN[j + 1] !== DF[j + 1] || DN[j + 2] !== DF[j + 2]) { if (!flag[i]) nd++; flag[i] = flag[i] | 2; } }
    // restore
    for (const x of rec) { x.o.geometry = x.g0; x.o.material = x.mat0; x.o.renderOrder = x.ro; if (x.o.isInstancedMesh) x.o.instanceColor = x.ic; x.g.dispose(); x.gr.dispose(); x.mat.dispose(); }
    for (const o of decals) { o.material = o.userData.__m; o.renderOrder = o.userData.__ro; o.visible = o.userData.__v; }
    for (const o of hidden) o.visible = o.userData.__v;
    R.shadowMap.enabled = sh; R.autoClear = ac; scene.background = bg; scene.fog = fogS;
    // name the meshes at flagged pixels
    const ray = new T.Raycaster(); const ndc = new T.Vector2(); const groups = {};
    const nameOf = (o) => { let n = o.name || ''; let p = o.parent; while (!n && p) { n = p.name; p = p.parent; } const m = Array.isArray(o.material) ? o.material[0] : o.material; return (n || o.type) + (o.isInstancedMesh ? '[inst]' : '') + (m.depthWrite === false ? '(decal)' : ''); };
    const hot = []; for (let i = 0; i < w * h; i++) if (flag[i]) hot.push(i);
    const S = Math.min(hot.length, 600); const vis = [...opaque, ...decals];
    for (let s = 0; s < S; s++) {
      const i = hot[Math.floor(s * hot.length / S)]; const x = i % w; const y = Math.floor(i / w);
      ndc.set((x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1); ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(vis, false); if (!hits.length) { (groups['(no hit)'] = groups['(no hit)'] || { n: 0, y: [] }).n++; continue; }
      const near = hits.filter((hh) => hh.distance - hits[0].distance < 0.03);
      const key = (flag[i] & 1 ? 'Z ' : 'D ') + [...new Set(near.map((hh) => nameOf(hh.object)))].sort().join(' + ');
      const g = groups[key] || (groups[key] = { n: 0, y: [], at: [] }); g.n++; if (g.y.length < 3) { g.y.push(+hits[0].point.y.toFixed(3)); g.at.push([x, h - 1 - y, +hits[0].point.x.toFixed(2), +hits[0].point.z.toFixed(2)]); }
    }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (h - 1 - y) * w + x; const o = (y * w + x) * 4; const f = flag[i]; if (f) { img.data[o] = 255; img.data[o + 1] = f & 1 ? 0 : 230; img.data[o + 2] = f & 1 ? 255 : 0; } else { img.data[o] = base[i * 4] * 0.55; img.data[o + 1] = base[i * 4 + 1] * 0.55; img.data[o + 2] = base[i * 4 + 2] * 0.55; } img.data[o + 3] = 255; }
    c.putImageData(img, 0, 0);
    return { noise, blame, w, h, nz, nd, groups, img: cv.toDataURL('image/png'), theme: H.world.theme.name, nOpaque: opaque.length, nDecal: decals.length };
};

if (process.argv[1] && process.argv[1].endsWith('zfight.mjs')) {
  const OUT = path.join(ROOT, '.chk', process.env.ZOUT || 'zprobe'); fs.mkdirSync(OUT, { recursive: true });
  const q = process.argv[2] || 'low'; const list = process.argv.slice(3); // stage:wave[:team][:run]
  const srv = await serve(); const br = await launch();
  try {
    for (const spec of list) {
      const [st, wv, team, run] = spec.split(':');
      const r = await openPage(br, srv.base, 's22', `autostart=1&stage=${st}&wave=${wv}&noaudio=1&seed=${st}&q=${q}&autopick=1` + (team ? '&team=' + team : ''), { freeze: true });
      await r.page.evaluate(([run]) => { const G = window.__G; window.__sim(2.5); G.paused = true; window.__step(3);
        if (run) { const W = G.host.world; G.host.sectionLock = true; W.travelTo(W.sec + 1); let n = 0; while (W.busy && n < 600 && Math.hypot(W.shift.x, W.shift.z) < W.walkBridge().midAt * (+run)) { window.__step(1); n++; } } }, [run]);
      const res = await r.page.evaluate(ZFIGHT, { blame: !!process.env.BLAME, blameMin: +(process.env.BLAME || 0) });
      if (res.blame.length) console.log('BLAME', JSON.stringify(res.blame));
      const tag = spec.replace(/[:,]/g, '_');
      fs.writeFileSync(path.join(OUT, `zid-${tag}-${q}.png`), Buffer.from(res.img.split(',')[1], 'base64'));
      console.log(`${spec} q=${q} theme ${res.theme}: opaque z-fight px ${res.nz}, decal px ${res.nd}, unstable px ${res.noise}`);
      for (const [k, v] of Object.entries(res.groups).sort((a, b) => b[1].n - a[1].n).slice(0, 6)) console.log('  ', v.n, k, JSON.stringify(v.y), JSON.stringify(v.at));
      if (r.problems.length) console.log('problems', r.problems.slice(0, 3));
      await r.ctx.close();
    }
  } finally { await br.close(); srv.close(); }
}
