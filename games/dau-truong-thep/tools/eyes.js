// Eye comfort meter: luminance, clipping, saturation, flashes and HUD contrast of the 3D view at the owner's phone size (Xiaomi 17T: 1002x461 CSS px, DPR 2.75).
//   EYES_THEMES=jungle,city EYES_TIERS=medium node tools/eyes.js      measure (default: every theme, tiers low,medium,high) into .chk/eyes/rows/
//   node tools/eyes.js --ults [theme]                                 flash table per ultimate (quiet fights, medium) + tower shots in ?mode=nha
//   node tools/eyes.js --report                                       merge rows into .chk/eyes/<tag>.json, <tag>.md and <tag>-sheet.png (no game run except one page for the sheet)
//   node tools/eyes.js --compare                                     before and after rows (EYES_BEFORE, EYES_AFTER tags) into .chk/eyes/after.md and sheet.png
//   node tools/eyes.js --check [--no-run]                             measure (EYES_TIERS default medium) then exit 1 when a busy-fight frame clips more than EYES_MAXCLIP % to white (default 5),
//                                                                     a white frame occurs, flashes exceed EYES_MAXFLASH per second (default 3, worst 1 s window) or the busy view above 0.85 exceeds EYES_MAXBRIGHT % (default 25)
// EYES_TAG=before|after names the output set. DTT_BASE=<hub url> measures the deployed build. EYES_FORCE=1 re-measures rows that exist. DTT_GL=gl-egl for the GPU.
// How a frame is read: after __step(1, true) the drawing buffer is read with gl.readPixels in the same task (the HUD is DOM, so this is the scene alone), every 4th pixel per axis for the
// numbers (about 250x115 samples), every 2nd for the saved frames. One sim tick per drawn frame: 30 samples per game second, the sim's own rate. The sequence runs in one synchronous
// evaluate so no extra animation frame ages the effects between samples. Luminance below is the Rec.709 luma of the sRGB-encoded value (what the screen is fed, 0..1) unless it says "linear".
'use strict';
const { session, CHK, fs, path } = require('./lib.js');
const OUT = path.join(CHK, 'eyes'), ROWS = path.join(OUT, 'rows');
const TAG = process.env.EYES_TAG || (process.argv.includes('--check') ? 'check' : 'before');
// EYES_CALM=1 measures with "Giảm chớp sáng" on (?calm=1); EYES_BRIGHT=1.2 sets the brightness override. Such rows get their own files and are not merged into the report.
let EXTRA = '', VARIANT = '';
const setVariant = (calm) => { EXTRA = (calm ? '&calm=1' : '') + (process.env.EYES_BRIGHT ? '&bright=' + process.env.EYES_BRIGHT : ''); VARIANT = (calm ? '-calm' : '') + (process.env.EYES_BRIGHT ? '-b' + process.env.EYES_BRIGHT : ''); };
setVariant(!!process.env.EYES_CALM);
const heavyWanted = (theme, tier) => tier === 'medium' || (tier === 'low' && (theme === 'ice' || theme === 'desert'));
const UA = 'Mozilla/5.0 (Linux; Android 15; 2509FPN0BC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const VIEW = { width: 1002, height: 461 }, DPR = 2.75;
const argv = process.argv.slice(2), has = (f) => argv.includes(f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v, d) => (v ? v.split(',').filter(Boolean) : d);

// Layout per theme: its own arena where one exists, otherwise the Đền Rừng arena (the largest paved plaza). canyon uses its base-assault layout (towers in the busy fight).
const LAYOUT = { jungle: ['denrung'], desert: ['xuongcat'], ice: ['cangbang'], lava: ['mienglua'], city: ['denrung'], swamp: ['denrung'], autumn: ['denrung'], canyon: ['hemcheo', 'nha'] };
const FALLBACK_THEMES = ['jungle', 'desert', 'ice', 'lava', 'city', 'swamp', 'autumn', 'canyon'];
const ULT_MECHS = ['hoalong', 'ung', 'soi', 'thancong', 'loi'];

// Limits enforced by --check. They are tighter than the first proposal (calm mean 0.60, busy share above 0.85 25%, white clip 5%) because the owner found the
// first build uncomfortable although 7 of 8 themes passed those; the values below are what the tuned build reaches with margin, on every theme, in the gentle
// fight, the heavy 3v3, the forced-overlap ultimates and the tower fight. "calm" is the "Giảm chớp sáng" setting on: its own, lower caps.
const LIMITS = {
  calmMeanMin: 0.25, calmMeanMax: 0.54, calmWhiteMax: 0.005, calmBlackMax: 0.20,
  busyWhiteMax: Number(process.env.EYES_MAXCLIP || 1.5) / 100, busyBrightMax: Number(process.env.EYES_MAXBRIGHT || 8) / 100, whiteFrameShare: 0.6, jumpMax: 0.06,
  flashPerSecMax: Number(process.env.EYES_MAXFLASH || 3), hudContrastMin: 4.5,
  calmModeWhiteMax: 0.005, calmModeBrightMax: 0.04,
};
const SEQS = ['busy', 'heavy', 'overlap', 'nha'];

// ---------------------------------------------------------------------------------------------------- in the page
function inPage() {
  const G = window.__G, gl = G.renderer.getContext();
  let buf = null;
  const A = {};
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const read = () => { const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; if (!buf || buf.length !== W * H * 4) buf = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf); return { W, H }; };
  const E = (window.__eyes = {});

  function analyse(stride) {
    const { W, H } = read();
    const sw = Math.floor(W / stride), sh = Math.floor(H / stride), n = sw * sh;
    if (!A.bin || A.bin.length !== n) { A.bin = new Uint8Array(n); A.sat = new Float32Array(n); }
    const hist = new Uint32Array(256), sat10 = new Uint32Array(10), cell = new Float64Array(128), cellN = new Uint32Array(128);
    let sumL = 0, sumY = 0, white = 0, black = 0, a85 = 0, k = 0;
    for (let sy = 0; sy < sh; sy++) {
      const row = (H - 1 - sy * stride) * W, cy = Math.min(7, (sy * 8 / sh) | 0);
      for (let sx = 0; sx < sw; sx++, k++) {
        const o = (row + sx * stride) * 4, r = buf[o], g = buf[o + 1], b = buf[o + 2];
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sumL += l; sumY += 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
        const bin = Math.round(l * 255); hist[bin]++; A.bin[k] = bin;
        if (r > 239 && g > 239 && b > 239) white++; // all channels above 0.94
        if (l < 0.03) black++;
        if (l > 0.85) a85++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0; A.sat[k] = s; sat10[Math.min(9, (s * 10) | 0)]++;
        const ci = cy * 16 + Math.min(15, (sx * 16 / sw) | 0); cell[ci] += l; cellN[ci]++;
      }
    }
    const q = (p) => { let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= n * p) return i / 255; } return 1; };
    let c = 0, thr = 255; for (let i = 255; i >= 0; i--) { c += hist[i]; if (c >= n * 0.25) { thr = i; break; } }
    let sTop = 0, nTop = 0; for (let i = 0; i < n; i++) if (A.bin[i] >= thr) { sTop += A.sat[i]; nTop++; }
    return { W, H, n, meanL: sumL / n, meanY: sumY / n, medianL: q(0.5), p95L: q(0.95), p99L: q(0.99), white: white / n, black: black / n, a85: a85 / n,
      sat10: Array.from(sat10, (v) => v / n), satTop: nTop ? sTop / nTop : 0, cells: Array.from(cell, (v, i) => v / Math.max(1, cellN[i])),
      cellMed: Array.from(cell, (v, i) => v / Math.max(1, cellN[i])).sort((a, b) => a - b)[64] };
  }
  // The frame as RGB top-down at 1/stride, kept for the PNG and the HUD sampling.
  function store(stride) {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, sw = Math.floor(W / stride), sh = Math.floor(H / stride), d = new Uint8Array(sw * sh * 3);
    for (let sy = 0; sy < sh; sy++) { const row = (H - 1 - sy * stride) * W; for (let sx = 0; sx < sw; sx++) { const o = (row + sx * stride) * 4, p = (sy * sw + sx) * 3; d[p] = buf[o]; d[p + 1] = buf[o + 1]; d[p + 2] = buf[o + 2]; } }
    return { sw, sh, data: d };
  }
  // The 16x8 cells that are bright: where they are on screen, what is under them in the world.
  function brightCells(cells, minCells, limit = 0.8) {
    const m = G.match, map = m.map, T = G.THREE, rc = new T.Raycaster(), pl = new T.Plane(new T.Vector3(0, 1, 0), 0), p = new T.Vector3(), out = [];
    G.camera.updateMatrixWorld(true);
    for (let i = 0; i < 128; i++) {
      if (cells[i] <= limit) continue;
      const cx = i % 16, cy = (i / 16) | 0;
      rc.setFromCamera(new T.Vector2(((cx + 0.5) / 16) * 2 - 1, 1 - ((cy + 0.5) / 8) * 2), G.camera);
      const hit = rc.ray.intersectPlane(pl, p);
      let floor = 'sky';
      if (hit) {
        if (Math.abs(p.x) > map.hw + 1 || Math.abs(p.z) > map.hd + 1) floor = 'void';
        else if (Math.hypot(p.x - map.plaza[0], p.z - map.plaza[1]) < map.plaza[2] + 0.3) floor = 'plaza';
        else if (map.bases.some((b) => Math.hypot(p.x - b[0], p.z - b[1]) < 5)) floor = 'base';
        else if (map.yards.some((y) => p.x > y[0] && p.x < y[1] && p.z > y[2] && p.z < y[3])) floor = 'yard';
        else floor = 'ground';
      }
      const sk = (minCells ? minCells[i] : cells[i]) > 0.7;
      out.push({ cell: [cx, cy], px: [Math.round(cx * innerWidth / 16), Math.round(cy * innerHeight / 8), Math.round(innerWidth / 16), Math.round(innerHeight / 8)], mean: +cells[i].toFixed(3), baseline: minCells ? +minCells[i].toFixed(3) : null, world: hit ? [+p.x.toFixed(1), +p.z.toFixed(1)] : null, what: sk ? 'floor:' + floor : 'effect on ' + floor });
    }
    return out;
  }
  const units = () => G.match.units;
  const nearestFoe = (me) => { let b = null, bd = 1e9; for (const o of units()) if (o.alive && o.team !== me.team) { const d = Math.hypot(o.x - me.x, o.z - me.z); if (d < bd) { bd = d; b = o; } } return b; };
  const gather = (me, d = 5.5, n = 3) => { const a = me.team ? Math.PI : 0, cx = me.x + Math.cos(a) * d, cz = me.z + Math.sin(a) * d; let k = 0; for (const u of units()) if (u.team !== me.team && u.alive && k < n) { const b = k * 2.1 - 2.1; u.x = u.px = cx + Math.cos(a) * (k % 2) * 1.2; u.z = u.pz = cz + b; k++; } };
  const park = (me, keepAllies, keepFoes) => { let a = 0, f = 0; for (const o of units()) { if (o === me) continue; if (o.team === me.team) { if (a++ >= keepAllies) { o.alive = false; o.respawnT = 1e9; } } else if (f++ >= keepFoes) { o.alive = false; o.respawnT = 1e9; } else o.hp = o.maxHp = 1e6; } };
  const draw1 = () => window.__step(1, true);

  E.look = () => {
    const post = G.gfx.post, w = G.gfx.world, ser = (v) => (v && v.isColor ? '#' + v.getHexString() : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x !== 'function').map(([k2, x]) => [k2, ser(x)])) : v);
    const lights = []; G.scene.traverse((o) => { if (o.isLight && o.type !== 'PointLight') lights.push({ type: o.type, intensity: +o.intensity.toFixed(3), color: '#' + o.color.getHexString(), ground: o.groundColor ? '#' + o.groundColor.getHexString() : undefined }); });
    const u = post.uniforms;
    return { quality: G.quality, stats: window.__stats, theme: ser(w.theme), lights, toneMappingRenderer: G.renderer.toneMapping, exposureRenderer: G.renderer.toneMappingExposure,
      post: { exposure: u.uExposure.value, bloomGain: u.uBloom.value, sat: u.uSat.value, contrast: u.uContrast.value, vignette: u.uVig.value, shadowTint: u.uShadow.value.toArray(), highTint: u.uHigh.value.toArray(), ao: u.uAO.value, sharpen: u.uSharp.value, bloomState: { ...post.state } } };
  };

  // Calm: the player alone on the plaza, no effects.
  E.calm = (o) => {
    const m = G.match, me = m.units[G.me], map = m.map;
    window.__input(null); window.__setShot(null);
    me.x = me.px = map.plaza[0] - map.plaza[2] * 0.35; me.z = me.pz = map.plaza[1]; me.aim = 0;
    window.__step(5, false);
    let ms = 0; for (let i = 0; i < 26; i++) { const t = performance.now(); draw1(); ms += performance.now() - t; }
    const s = analyse(4); s.cellInfo = brightCells(s.cells, null); s.msPerFrame = ms / 26; s.tick = m.tick;
    window.__eyesCalm = store(2); window.__eyesFrame = window.__eyesCalm;
    return s;
  };

  // HUD state: skill numbers up, one kill by the player so the kill feed has a row. The frame is stored for the sampling after the CSS transitions have run.
  E.hudSetup = () => {
    const m = G.match, me = m.units[G.me]; me.cd.s1 = me.cd.s2 = me.cd.ult = 7; me.cd.heal = 9; gather(me);
    const f = nearestFoe(me); if (f) { f.hp = 1; const a = Math.atan2(f.z - me.z, f.x - me.x), dx = Math.cos(a), dz = Math.sin(a), sx = f.x - dx * 3, sz = f.z - dz * 3;
      m.shots.push({ id: m.nextId++, team: me.team, owner: me.id, color: me.color, x: sx, z: sz, px: sx, pz: sz, dx, dz, speed: 40, left: 6, dmg: 99999, splash: 0, knock: 0, slow: 0, slowDur: 0, r: 0.3, vis: 'shell', over: true }); }
    for (let i = 0; i < 4; i++) draw1();
    analyse(4); window.__eyesFrame = store(2);
  };
  E.hud = () => {
    const F = window.__eyesFrame, sx = F.sw / innerWidth, sy = F.sh / innerHeight, items = [];
    const sample = (r) => {
      const x0 = Math.max(0, Math.floor(r.left * sx)), x1 = Math.min(F.sw, Math.ceil(r.right * sx)), y0 = Math.max(0, Math.floor(r.top * sy)), y1 = Math.min(F.sh, Math.ceil(r.bottom * sy)), px = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * F.sw + x) * 3, r2 = F.data[p], g = F.data[p + 1], b = F.data[p + 2]; px.push([0.2126 * r2 + 0.7152 * g + 0.0722 * b, r2, g, b]); }
      if (!px.length) return null;
      px.sort((a, b) => a[0] - b[0]);
      const avg = (a) => [0, 1, 2].map((c) => a.reduce((s, v) => s + v[c + 1], 0) / a.length), k = Math.max(1, Math.round(px.length * 0.1));
      return { n: px.length, mean: avg(px), bright10: avg(px.slice(-k)), dark10: avg(px.slice(0, k)) };
    };
    const rgba = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const v = m[1].split(',').map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const add = (kind, el) => {
      const text = el.textContent.trim(); if (!text) return;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return;
      let op = 1, bg = []; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); op *= Number(c.opacity); const b = rgba(c.backgroundColor); if (b && b[3] > 0) bg.push(b); }
      if (op < 0.5) return;
      items.push({ kind, text: text.slice(0, 24), color: rgba(cs.color), opacity: op, bg, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], scene: sample(r), textShadow: cs.textShadow });
    };
    document.querySelectorAll('#ui .sc-n').forEach((e) => add('score', e));
    document.querySelectorAll('#ui .sc-clock').forEach((e) => add('timer', e));
    document.querySelectorAll('#ui span').forEach((e) => { if (/^\d+ \/ \d+$/.test(e.textContent.trim()) && e.getBoundingClientRect().top > innerHeight * 0.8) add('hp', e); });
    document.querySelectorAll('#touch .tc-t').forEach((e) => add('cooldown', e));
    document.querySelectorAll('#ui .kf b').forEach((e) => add('killfeed', e));
    document.querySelectorAll('#ui .np-n').forEach((e) => add('nametag', e));
    document.querySelectorAll('#ui .mission').forEach((e) => add('mission', e));
    return items;
  };

  // Busy: a real fight, the player ultimates every 2.5 s (and uses both skills in natural fights), bots with their ultimate recharged every 2.5 s, one tick per drawn frame.
  // o: { frames, quiet (only the player and three foes, the foes cannot die), tower (stand 9 m from the enemy sub tower, nothing else alive),
  //      mode: 'heavy' (3v3, every ultimate and skill recharged each second, everyone keeps fighting),
  //            'overlap' (3v3 on the plaza, every mech casts ult, s1 and s2 inside the same 0.1 s window every 2.5 s),
  //            'nha' (as overlap, in ?mode=nha beside the enemy sub tower so tower shots land with the ultimates) }
  E.busy = (o) => {
    const m = G.match, me = m.units[G.me], frames = o.frames || 180, map = m.map, mode = o.mode || '';
    window.__setShot(null);
    let target = () => nearestFoe(me);
    const near = mode === 'overlap' || mode === 'nha';
    const gatherAll = () => {
      let T = null;
      if (mode === 'nha') { T = m.map.towers.filter((t) => t.team !== me.team && t.kind === 'sub')[0]; const l = Math.hypot(T.x, T.z) || 1; me.x = me.px = T.x - T.x / l * 9; me.z = me.pz = T.z - T.z / l * 9; }
      else { me.x = me.px = map.plaza[0] - 2.2; me.z = me.pz = map.plaza[1]; }
      gather(me, 4.5); let k = 0;
      for (const u of units()) if (u !== me && u.team === me.team && u.alive) { u.x = u.px = me.x + (k % 2 ? -1.8 : 0.4); u.z = u.pz = me.z + (k - 0.5) * 2.2; k++; }
    };
    if (o.tower) {
      const T = m.map.towers.filter((t) => t.team !== me.team && t.kind === 'sub')[0], l = Math.hypot(T.x, T.z) || 1;
      me.x = me.px = T.x - T.x / l * 9; me.z = me.pz = T.z - T.z / l * 9; park(me, 0, 0); target = () => T;
    } else if (near) gatherAll();
    else { gather(me); if (o.quiet) park(me, 0, 3); }
    me.aim = 0; me.hp = me.maxHp;
    let fi = 0;
    const per = mode === 'heavy' ? 30 : 75;
    window.__input(() => { const f = target() || { x: me.x + 1, z: me.z }, ph = fi % per, p2 = mode === 'heavy' ? ph + 20 : ph; return { mx: 0, mz: 0, aim: Math.atan2(f.z - me.z, f.x - me.x), fire: fi > 3, s1: !o.quiet && p2 >= 30 && p2 < 33, s2: !o.quiet && p2 >= 50 && p2 < 53, ult: ph < 3, heal: false, tx: f.x, tz: f.z }; });
    if (near) window.__botHook = (mm, inputs) => { const ph = fi % 75; for (const u of mm.units) { const i = inputs[u.id]; if (!i || !u.alive || u === me) continue; if (ph < 3) i.ult = true; if (ph >= 30 && ph < 33) i.s1 = true; if (ph >= 50 && ph < 53) i.s2 = true; } };
    for (let i = 0; i < 26; i++) draw1(); // the camera settles on the new spot, no input effects yet are asked: the script starts at fi = 0 below
    const L = [], Y = [], W = [], B = [], A85 = [], S = [], SATTOP = [], minCells = new Float64Array(128).fill(1);
    let best = null, ults = 0, ms = 0;
    const count = (e) => { if (!count.dead && e && e.t === 'skill' && e.slot === 2) ults++; }; G.bus.on('sim', count);
    for (fi = 0; fi < frames; fi++) {
      if (fi % per === 0) { me.cd.ult = 0; if (!o.quiet) for (const u of units()) if (u.alive) { u.cd.ult = 0; if (mode) { u.cd.s1 = 0; u.cd.s2 = 0; } } }
      if (fi % 90 === 0 && fi) { if (near) gatherAll(); else if (!o.tower) gather(me); }
      me.hp = me.maxHp; if (o.quiet || near) for (const u of units()) if (u !== me && u.alive) u.hp = u.maxHp;
      const t0 = performance.now(); draw1(); ms += performance.now() - t0;
      const s = analyse(4);
      L.push(s.meanL); Y.push(s.meanY); W.push(s.white); B.push(s.black); A85.push(s.a85); SATTOP.push(s.satTop);
      for (let i = 0; i < 128; i++) if (s.cells[i] < minCells[i]) minCells[i] = s.cells[i];
      if (!best || s.a85 + s.white * 2 > best.score) { best = { score: s.a85 + s.white * 2, idx: fi, s }; window.__eyesBest = store(2); best.cellInfo = brightCells(s.cells, null); best.cams = null; }
    }
    window.__input(null); window.__botHook = null; count.dead = true;
    best.cellInfo = best.cellInfo.map((c) => ({ ...c, baseline: +minCells[c.cell[1] * 16 + c.cell[0]].toFixed(3), what: minCells[c.cell[1] * 16 + c.cell[0]] > 0.7 ? c.what.replace(/^effect on /, 'floor:') : 'effect on ' + c.what.replace(/^floor:|^effect on /, '') }));
    return { frames, L, Y, W, B, A85, SATTOP, best: { idx: best.idx, meanL: best.s.meanL, white: best.s.white, a85: best.s.a85, black: best.s.black, sat10: best.s.sat10, satTop: best.s.satTop, medianL: best.s.medianL, cellInfo: best.cellInfo }, ults, msPerFrame: ms / frames };
  };

  E.png = async (which) => {
    const F = window['__eyes' + which]; if (!F) return '';
    const c = new OffscreenCanvas(F.sw, F.sh), x = c.getContext('2d'), img = x.createImageData(F.sw, F.sh);
    for (let i = 0, j = 0; i < F.sw * F.sh; i++, j += 4) { img.data[j] = F.data[i * 3]; img.data[j + 1] = F.data[i * 3 + 1]; img.data[j + 2] = F.data[i * 3 + 2]; img.data[j + 3] = 255; }
    x.putImageData(img, 0, 0);
    const b = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  };
  return true;
}

// ---------------------------------------------------------------------------------------------------- numbers from a sequence
function flashMetrics(L, A85, W, fps = 30) {
  const flag = [], n = L.length; let maxJump = 0, run = 0, longest = 0, events = 0;
  const onsets = [];
  for (let i = 0; i < n; i++) {
    let isFlash = false;
    if (i >= 1) {
      const win = L.slice(Math.max(0, i - Math.round(fps * 0.5)), i).sort((a, b) => a - b), med = win[Math.floor(win.length / 2)];
      isFlash = L[i] - med > 0.10 || A85[i] > 0.25;
      maxJump = Math.max(maxJump, Math.abs(L[i] - L[i - 1]));
    }
    flag.push(isFlash);
    if (isFlash) { run++; longest = Math.max(longest, run); if (run === 1) { events++; onsets.push(i); } } else run = 0;
  }
  let worstSecond = 0; for (const o of onsets) worstSecond = Math.max(worstSecond, onsets.filter((p) => p >= o && p < o + fps).length);
  const sec = n / fps;
  return { flashFrames: flag.filter(Boolean).length, events, eventsPerSec: +(events / sec).toFixed(2), worstSecond, longestRun: longest, maxJump: +maxJump.toFixed(3), whiteFrames: W.filter((v) => v > LIMITS.whiteFrameShare).length,
    maxA85: +Math.max(...A85).toFixed(3), maxWhite: +Math.max(...W).toFixed(3), meanWhite: +(W.reduce((a, b) => a + b, 0) / n).toFixed(4), meanL: +(L.reduce((a, b) => a + b, 0) / n).toFixed(3), maxL: +Math.max(...L).toFixed(3), seconds: +sec.toFixed(2) };
}
const lumLin = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lumLin(a), y = lumLin(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function hudContrast(items) {
  const byKind = {};
  for (const it of items) {
    if (!it.scene || !it.color) continue;
    const res = {};
    for (const which of ['mean', 'bright10', 'dark10']) {
      let c = it.scene[which].slice();
      for (const b of it.bg.slice().reverse()) c = c.map((v, i) => v * (1 - b[3]) + b[i] * b[3]);
      const t = it.color.slice(0, 3).map((v, i) => v * it.opacity + c[i] * (1 - it.opacity));
      res[which] = +ratio(t, c).toFixed(2);
    }
    const r = { kind: it.kind, text: it.text, rect: it.rect, ratioMean: res.mean, ratioBright10: res.bright10, ratioDark10: res.dark10, ratioWorst: Math.min(res.mean, res.bright10, res.dark10), shadow: it.textShadow && it.textShadow !== 'none' };
    (byKind[it.kind] = byKind[it.kind] || []).push(r);
  }
  const worst = {};
  for (const [k, list] of Object.entries(byKind)) { const w = list.slice().sort((a, b) => a.ratioWorst - b.ratioWorst)[0], wm = list.slice().sort((a, b) => a.ratioMean - b.ratioMean)[0]; worst[k] = { worst: w.ratioWorst, worstMean: wm.ratioMean, text: w.text, n: list.length, hasShadow: w.shadow }; }
  return { worst, items: Object.values(byKind).flat() };
}

// ---------------------------------------------------------------------------------------------------- driving
async function openGame(br, base, query) {
  const ctx = await br.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, userAgent: UA });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  const page = await ctx.newPage(), problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(base + '/games/dau-truong-thep/index.html?' + query);
  await page.waitForFunction('window.__ready === true || (document.getElementById("fatal") && document.getElementById("fatal").style.display === "block")', null, { timeout: 180000 });
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.style.display = 'none'; });
  await page.evaluate(inPage);
  return { page, ctx, problems };
}
const savePng = async (page, which, file) => { const b64 = await page.evaluate((w) => window.__eyes.png(w), which); if (b64) fs.writeFileSync(file, Buffer.from(b64, 'base64')); return !!b64; };
const queryFor = (theme, tier, mech, extra = '') => { const [map, mode] = LAYOUT[theme] || ['denrung']; return `manual&noaudio&autostart&q=${tier}&seed=7&bots=normal&mech=${mech}&theme=${theme}&map=${map}${mode ? '&mode=' + mode : ''}${extra}`; };

async function measure(br, base, theme, tier) {
  const g = await openGame(br, base, queryFor(theme, tier, 'hoalong', EXTRA));
  const { page } = g;
  const row = { tag: TAG, variant: VARIANT || undefined, theme, tier, layout: LAYOUT[theme] || ['denrung'], when: new Date().toISOString(), base };
  row.look = await page.evaluate(() => window.__eyes.look());
  row.calm = await page.evaluate(() => window.__eyes.calm());
  await savePng(page, 'Calm', path.join(OUT, `${TAG}${VARIANT}-${theme}-${tier}-calm.png`));
  // HUD
  await page.evaluate(() => window.__eyes.hudSetup());
  await sleep(700);
  if (tier === 'medium' && !VARIANT) await page.screenshot({ path: path.join(OUT, `${TAG}-${theme}-${tier}-calm-hud.png`) });
  row.hud = hudContrast(await page.evaluate(() => window.__eyes.hud()));
  // busy: the gentle 6 s fight, then the heavy ones (medium, and low on the two brightest themes)
  const seq = async (name, mode) => {
    const raw = await page.evaluate((md) => window.__eyes.busy({ frames: 180, mode: md }), mode);
    const r = { ...flashMetrics(raw.L, raw.A85, raw.W), best: raw.best, ults: raw.ults, msPerFrame: +raw.msPerFrame.toFixed(1), meanSatTop: +(raw.SATTOP.reduce((x, y) => x + y, 0) / raw.SATTOP.length).toFixed(3), meanBlack: +(raw.B.reduce((x, y) => x + y, 0) / raw.B.length).toFixed(3),
      series: { L: raw.L.map((v) => +v.toFixed(3)), A85: raw.A85.map((v) => +v.toFixed(3)), W: raw.W.map((v) => +v.toFixed(3)) } };
    await savePng(page, 'Best', path.join(OUT, `${TAG}${VARIANT}-${theme}-${tier}-${name}.png`));
    return r;
  };
  const gentle = await seq('busy', '');
  row.busy = gentle; row.series = gentle.series; delete gentle.series;
  if (heavyWanted(theme, tier)) {
    row.heavy = await seq('heavy', 'heavy'); row.overlap = await seq('overlap', 'overlap');
  }
  row.problems = g.problems.slice(0, 5);
  await g.ctx.close();
  if (heavyWanted(theme, tier)) {
    const n = await openGame(br, base, `manual&noaudio&autostart&q=${tier}&seed=7&bots=normal&mech=hoalong&theme=${theme}&map=luythep&mode=nha${EXTRA}`);
    const raw = await n.page.evaluate(() => window.__eyes.busy({ frames: 180, mode: 'nha' }));
    row.nha = { ...flashMetrics(raw.L, raw.A85, raw.W), best: raw.best, ults: raw.ults, msPerFrame: +raw.msPerFrame.toFixed(1), meanSatTop: +(raw.SATTOP.reduce((x, y) => x + y, 0) / raw.SATTOP.length).toFixed(3), series: { L: raw.L.map((v) => +v.toFixed(3)), A85: raw.A85.map((v) => +v.toFixed(3)), W: raw.W.map((v) => +v.toFixed(3)) } };
    await savePng(n.page, 'Best', path.join(OUT, `${TAG}${VARIANT}-${theme}-${tier}-nha.png`));
    await n.ctx.close();
  }
  return row;
}

async function ultRow(br, base, theme, mech, tower) {
  const q = tower ? `manual&noaudio&autostart&q=medium&seed=7&bots=normal&mech=${mech}&theme=${theme}&map=luythep&mode=nha` : queryFor(theme, 'medium', mech);
  const g = await openGame(br, base, q);
  const raw = await g.page.evaluate((t) => window.__eyes.busy({ frames: 150, quiet: true, tower: t }), !!tower);
  const name = tower ? 'tower' : mech;
  const row = { tag: TAG, kind: 'ult', name, mech, theme, tower: !!tower, ...flashMetrics(raw.L, raw.A85, raw.W), best: raw.best, msPerFrame: +raw.msPerFrame.toFixed(1), series: { L: raw.L.map((v) => +v.toFixed(3)), A85: raw.A85.map((v) => +v.toFixed(3)), W: raw.W.map((v) => +v.toFixed(3)) } };
  await savePng(g.page, 'Best', path.join(OUT, `${TAG}-ult-${name}.png`));
  await g.ctx.close();
  return row;
}

const rowFile = (theme, tier) => path.join(ROWS, `${TAG}${VARIANT}-${theme}-${tier}.json`);
async function themeList() {
  try { const m = await import(require('url').pathToFileURL(path.join(process.env.EYES_GAME_DIR || path.join(__dirname, '..'), 'js', 'maps.js')).href); return m.THEME_ORDER || Object.keys(m.THEMES); } catch (e) { return FALLBACK_THEMES; }
}
const loadRows = (tiers) => { const out = []; for (const f of fs.existsSync(ROWS) ? fs.readdirSync(ROWS) : []) if (f.startsWith(TAG + VARIANT + '-') && f.endsWith('.json')) { const r = JSON.parse(fs.readFileSync(path.join(ROWS, f), 'utf8')); if ((r.kind === 'ult' || (r.variant || '') === VARIANT) && (!tiers || r.kind === 'ult' || tiers.includes(r.tier))) out.push(r); } return out; };

// ---------------------------------------------------------------------------------------------------- verdicts
function verdict(r) {
  const f = [];
  const c = r.calm, b = r.busy;
  if (c.meanL < LIMITS.calmMeanMin || c.meanL > LIMITS.calmMeanMax) f.push(['calm mean luma', c.meanL, `${LIMITS.calmMeanMin}-${LIMITS.calmMeanMax}`, c.meanL > LIMITS.calmMeanMax ? c.meanL / LIMITS.calmMeanMax : LIMITS.calmMeanMin / Math.max(c.meanL, 0.01)]);
  if (c.white > LIMITS.calmWhiteMax) f.push(['calm white clip', c.white, LIMITS.calmWhiteMax, c.white / LIMITS.calmWhiteMax]);
  if (c.black > LIMITS.calmBlackMax) f.push(['calm near-black share', c.black, LIMITS.calmBlackMax, c.black / LIMITS.calmBlackMax]);
  if (b.maxWhite > LIMITS.busyWhiteMax) f.push(['busy white clip (max frame)', b.maxWhite, LIMITS.busyWhiteMax, b.maxWhite / LIMITS.busyWhiteMax]);
  if (b.maxA85 > LIMITS.busyBrightMax) f.push(['busy share above 0.85 (max frame)', b.maxA85, LIMITS.busyBrightMax, b.maxA85 / LIMITS.busyBrightMax]);
  if (b.whiteFrames > 0) f.push(['white frames (>60% near white)', b.whiteFrames, 0, 99]);
  if (b.worstSecond > LIMITS.flashPerSecMax - 1) f.push(['large flashes in worst second', b.worstSecond, `<${LIMITS.flashPerSecMax}`, b.worstSecond / (LIMITS.flashPerSecMax - 0.5)]);
  for (const [k, w] of Object.entries(r.hud ? r.hud.worst : {})) if (w.worst < LIMITS.hudContrastMin) f.push([`HUD ${k} contrast`, w.worst, `>=${LIMITS.hudContrastMin}`, LIMITS.hudContrastMin / w.worst]);
  return f;
}

// ---------------------------------------------------------------------------------------------------- report
const pc = (v) => (v * 100).toFixed(1) + '%';
async function report(br, base) {
  const themes = await themeList(), tiers = ['low', 'medium', 'high'];
  const rows = loadRows().filter((r) => r.kind !== 'ult'), ults = loadRows().filter((r) => r.kind === 'ult');
  const get = (t, q) => rows.find((r) => r.theme === t && r.tier === q);
  const code = codeRefs();
  const lim = [
    ['calm mean luma', `${LIMITS.calmMeanMin} to ${LIMITS.calmMeanMax}`, 'floors in the mid-tones leave headroom for effects and keep a bright OLED comfortable; the reference image sits around 0.45'],
    ['calm white clip (all channels > 0.94)', `<= ${pc(LIMITS.calmWhiteMax)}`, 'a calm frame has no reason to hold pure white'],
    ['calm near-black (luma < 0.03)', `<= ${pc(LIMITS.calmBlackMax)}`, 'shadows stay readable, not crushed'],
    ['busy white clip, worst frame', `<= ${pc(LIMITS.busyWhiteMax)}`, 'ultimates may sparkle but not white out an area of the screen'],
    ['busy share above 0.85, worst frame', `<= ${pc(LIMITS.busyBrightMax)}`, 'the same number is the large-flash trigger: keep bloom and flash lights under it'],
    ['white frames (> 60% near white)', '0', 'a full white frame on a bright OLED is the harshest event'],
    ['large flashes', `< ${LIMITS.flashPerSecMax} in any 1 s window`, 'photosensitivity guidance (WCAG 2.3.1) allows at most 3 flashes per second'],
    ['HUD text contrast (worst of mean, brightest 10% and darkest 10% behind the text)', `>= ${LIMITS.hudContrastMin}:1`, 'WCAG AA for normal text'],
  ];
  const result = { tag: TAG, view: { css: VIEW, dpr: DPR }, limits: LIMITS, proposedLimits: lim, code, themes, rows: rows.map((r) => ({ ...r, verdict: verdict(r) })), ults };
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(result));

  const md = [];
  md.push(`# Eye comfort numbers (${TAG})`, '', `Phone profile 1002x461 CSS px at DPR ${DPR}, touch, Android Chrome UA, build ${rows[0] ? rows[0].base : ''}. Luma = Rec.709 weights on the sRGB-encoded value (0..1). White clip = all channels above 0.94. Near black = luma under 0.03. Busy = a 6 s real bot fight (180 frames, one sim tick per drawn frame = 30 samples per game second, read with gl.readPixels at stride 4, scene only), player ultimating every 2.5 s, bots recharged every 2.5 s. HUD contrast: WCAG ratio of the text colour against the HUD backgrounds composited over the scene pixels behind the text; text shadows and gradients are not modelled.`, '');
  md.push('## Calm frame (player on the plaza, nothing firing)', '', '| theme | tier | mean luma | median | p95 | white clip | near black | mean linear Y | sat of brightest 25% | sat histogram (10 bins) | bright cells (>0.8) |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of themes) for (const q of tiers) { const r = get(t, q); if (!r) continue; const c = r.calm; md.push(`| ${t} | ${q} | ${c.meanL.toFixed(3)} | ${c.medianL.toFixed(3)} | ${c.p95L.toFixed(3)} | ${pc(c.white)} | ${pc(c.black)} | ${c.meanY.toFixed(3)} | ${c.satTop.toFixed(2)} | ${c.sat10.map((v) => Math.round(v * 100)).join('/')} | ${c.cellInfo.length ? c.cellInfo.map((x) => `[${x.cell}] ${x.what} ${x.mean}`).slice(0, 4).join('; ') + (c.cellInfo.length > 4 ? ` (+${c.cellInfo.length - 4})` : '') : 'none'} |`); }
  md.push('', '## Busy fight (6 s)', '', '| theme | tier | mean luma | max mean | max white clip | max share >0.85 | white frames | flash frames | flash events/s | worst 1 s | longest run | max jump | ults cast | sat of brightest 25% | near black | ms/frame (this machine) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of themes) for (const q of tiers) { const r = get(t, q); if (!r) continue; const b = r.busy; md.push(`| ${t} | ${q} | ${b.meanL} | ${b.maxL} | ${pc(b.maxWhite)} | ${pc(b.maxA85)} | ${b.whiteFrames} | ${b.flashFrames} | ${b.eventsPerSec} | ${b.worstSecond} | ${b.longestRun} | ${b.maxJump} | ${b.ults} | ${b.meanSatTop} | ${pc(b.meanBlack)} | ${b.msPerFrame} |`); }
  md.push('', '## Brightest busy frame: bright 16x8 cells (mean luma > 0.8), medium', '');
  for (const t of themes) { const r = get(t, 'medium'); if (!r) continue; const ci = r.busy.best.cellInfo; md.push(`- ${t}: frame ${r.busy.best.idx}, ${ci.length} cells. ` + (ci.length ? ci.slice(0, 10).map((x) => `col ${x.cell[0]} row ${x.cell[1]} (px ${x.px[0]},${x.px[1]} ${x.px[2]}x${x.px[3]}) ${x.mean} ${x.what}`).join('; ') : 'none')); }
  md.push('', '## Flash table per ultimate (quiet fight: player and three foes only, 5 s, medium)', '');
  if (ults.length) {
    md.push('| effect | theme | max mean luma | max white clip | max share >0.85 | white frames | flash events/s | worst 1 s | longest run | max jump |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const u of ults) md.push(`| ${u.name} | ${u.theme} | ${u.maxL} | ${pc(u.maxWhite)} | ${pc(u.maxA85)} | ${u.whiteFrames} | ${u.eventsPerSec} | ${u.worstSecond} | ${u.longestRun} | ${u.maxJump} |`);
  } else md.push('Not measured yet (node tools/eyes.js --ults).');
  md.push('', '## HUD text contrast (medium; worst case per text, ratio against mean / worst of mean, brightest 10%, darkest 10%)', '', '| text | worst (extremes) | worst (mean bg) | theme of worst | sample | text shadow in CSS |', '|---|---|---|---|---|---|');
  const hudKinds = ['score', 'timer', 'hp', 'cooldown', 'killfeed', 'nametag', 'mission'];
  for (const k of hudKinds) { let w = null, wm = null; for (const t of themes) { const r = get(t, 'medium'); const e = r && r.hud.worst[k]; if (e && (!w || e.worst < w.v)) w = { v: e.worst, t, s: e.text, sh: e.hasShadow }; if (e && (!wm || e.worstMean < wm.v)) wm = { v: e.worstMean }; } md.push(w ? `| ${k} | ${w.v} | ${wm.v} | ${w.t} | ${w.s} | ${w.sh ? 'yes' : 'no'} |` : `| ${k} | not seen | | | | |`); }
  md.push('', '## Look parameters (read from the running page; medium)', '', '| theme | exposure | sat | contrast | vignette | bloom gain (total) | tone map | sun | hemi | shadow tint | high tint |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of themes) { const r = get(t, 'medium'); if (!r) continue; const p = r.look.post, th = r.look.theme, sun = r.look.lights.find((l) => l.type === 'DirectionalLight'), hemi = r.look.lights.find((l) => l.type === 'HemisphereLight'); md.push(`| ${t} | ${p.exposure} | ${p.sat} | ${p.contrast} | ${p.vignette} | ${p.bloomGain.toFixed(3)} | ACES filmic (composite shader) | ${sun ? sun.intensity + ' ' + sun.color : '-'} | ${hemi ? hemi.intensity + ' ' + hemi.color + '/' + hemi.ground : '-'} | ${p.shadowTint.join(',')} | ${p.highTint.join(',')} |`); }
  md.push('', 'Per tier (same for every theme): ' + ['low', 'medium', 'high'].map((q) => { const r = rows.find((x) => x.tier === q); return r ? `${q}: bloom gain ${r.look.quality.bloomGain}, levels ${r.look.quality.bloomLevels}, point lights ${r.look.quality.lights}, AO ${r.look.quality.ao}, FXAA ${r.look.quality.fxaa}, buffer ${r.look.stats.buffer.join('x')}` : ''; }).join('; '), '');
  md.push('## Where the numbers come from (code, read-only)', '', ...code.map((c) => `- ${c}`), '');

  // worst offenders and verdict table
  const off = []; for (const r of result.rows) for (const v of r.verdict) off.push({ where: `${r.theme}/${r.tier}`, what: v[0], value: v[1], limit: v[2], over: v[3] });
  for (const u of ults) { if (u.maxWhite > LIMITS.busyWhiteMax) off.push({ where: `ult ${u.name}`, what: 'white clip (max frame)', value: u.maxWhite, limit: LIMITS.busyWhiteMax, over: u.maxWhite / LIMITS.busyWhiteMax }); if (u.maxA85 > LIMITS.busyBrightMax) off.push({ where: `ult ${u.name}`, what: 'share above 0.85', value: u.maxA85, limit: LIMITS.busyBrightMax, over: u.maxA85 / LIMITS.busyBrightMax }); if (u.worstSecond > LIMITS.flashPerSecMax - 1) off.push({ where: `ult ${u.name}`, what: 'flashes in worst second', value: u.worstSecond, limit: LIMITS.flashPerSecMax, over: u.worstSecond / (LIMITS.flashPerSecMax - 0.5) }); }
  off.sort((a, b) => b.over - a.over);
  md.push('## Worst offenders (ranked by how far past the limit)', '', ...off.slice(0, 20).map((o, i) => `${i + 1}. ${o.where}: ${o.what} = ${typeof o.value === 'number' && o.value < 1 && !/contrast|luma/.test(o.what) ? pc(o.value) : o.value} against ${typeof o.limit === 'number' && o.limit < 1 ? pc(o.limit) : o.limit} (${o.over >= 99 ? 'any' : o.over.toFixed(1) + 'x'})`), '');
  md.push('## Proposed limits (starting point for tuning)', '', '| metric | limit | reason |', '|---|---|---|', ...lim.map((l) => `| ${l[0]} | ${l[1]} | ${l[2]} |`), '', 'Pass/fail per theme and tier (the same limits `node tools/eyes.js --check` enforces for the busy rows: white clip, white frames, flashes, share above 0.85):', '', '| theme | ' + tiers.join(' | ') + ' |', '|---|---|---|---|');
  for (const t of themes) md.push(`| ${t} | ` + tiers.map((q) => { const r = result.rows.find((x) => x.theme === t && x.tier === q); return r ? (r.verdict.length ? 'FAIL: ' + r.verdict.map((v) => v[0]).join(', ') : 'pass') : 'n/a'; }).join(' | ') + ' |');
  fs.writeFileSync(path.join(OUT, `${TAG}.md`), md.join('\n') + '\n');
  console.log(path.join(OUT, `${TAG}.md`), path.join(OUT, `${TAG}.json`));
  if (br) await sheet(br, base, themes, get);
}

async function sheet(br, base, themes, get) {
  const cells = [];
  for (const t of themes) {
    const r = get(t, 'medium'); if (!r) continue;
    const a = path.join(OUT, `${TAG}-${t}-medium-calm.png`), b = path.join(OUT, `${TAG}-${t}-medium-busy.png`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    cells.push({ t, a: fs.readFileSync(a).toString('base64'), b: fs.readFileSync(b).toString('base64'), la: `${t} calm  L ${r.calm.meanL.toFixed(2)}  white ${pc(r.calm.white)}`, lb: `${t} busiest  L ${r.busy.best.meanL.toFixed(2)}  white ${pc(r.busy.best.white)}  >0.85 ${pc(r.busy.best.a85)}` });
  }
  const refPath = path.join(process.env.HOME, 'handoff', 'dau-truong-thep-ref.webp'), ref = fs.existsSync(refPath) ? fs.readFileSync(refPath).toString('base64') : '';
  const ctx = await br.newContext({ viewport: { width: 1200, height: 800 } }), page = await ctx.newPage();
  const png = await page.evaluate(async ({ cells, ref }) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const CW = 501, CH = 231, GAP = 4, LAB = 20;
    const refImg = ref ? await load('data:image/webp;base64,' + ref) : null;
    const refH = refImg ? Math.round(refImg.height * (CW * 2 + GAP) / refImg.width) : 0;
    const c = document.createElement('canvas'); c.width = CW * 2 + GAP; c.height = (refImg ? refH + LAB + GAP : 0) + cells.length * (CH + LAB + GAP);
    const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height); x.font = 'bold 14px sans-serif'; x.textBaseline = 'middle';
    let y = 0;
    if (refImg) { x.fillStyle = '#fff'; x.fillText("reference (owner's): bright, saturated, soft", 6, LAB / 2); x.drawImage(refImg, 0, LAB, c.width, refH); y = refH + LAB + GAP; }
    for (const cell of cells) {
      x.fillStyle = '#ffd'; x.fillText(cell.la, 6, y + LAB / 2); x.fillText(cell.lb, CW + GAP + 6, y + LAB / 2);
      x.drawImage(await load('data:image/png;base64,' + cell.a), 0, y + LAB, CW, CH); x.drawImage(await load('data:image/png;base64,' + cell.b), CW + GAP, y + LAB, CW, CH);
      y += CH + LAB + GAP;
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { cells, ref });
  const file = path.join(OUT, `${TAG}-sheet.png`); fs.writeFileSync(file, Buffer.from(png, 'base64')); console.log(file);
  await ctx.close();
}

// --compare: before and after rows side by side (EYES_BEFORE and EYES_AFTER name the tags) into .chk/eyes/after.md and .chk/eyes/sheet.png.
async function compare(br) {
  const B = process['env'].EYES_BEFORE || 'before', A = process['env'].EYES_AFTER || 'after', themes = await themeList();
  const load = (tag, variant = '') => { const m = {}; for (const f of fs.existsSync(ROWS) ? fs.readdirSync(ROWS) : []) if (f.startsWith(tag + variant + '-') && f.endsWith('.json')) { const r = JSON.parse(fs.readFileSync(path.join(ROWS, f), 'utf8')); if (r.kind !== 'ult' && (r.variant || '') === variant) m[r.theme + '/' + r.tier] = r; } return m; };
  const rb = load(B), ra = load(A), rc = load(A, '-calm');
  const worst = (r) => { const ks = SEQS.filter((k) => r && r[k]); const w = (f) => Math.max(...ks.map((k) => r[k][f])); return { a85: w('maxA85'), clip: w('maxWhite'), fl: w('worstSecond'), jump: w('maxJump'), maxL: w('maxL'), sat: Math.max(...ks.map((k) => r[k].meanSatTop)), ms: Math.max(...ks.map((k) => r[k].msPerFrame)) }; };
  const pickScene = (r) => SEQS.filter((k) => k !== 'busy' && r[k]).sort((x, y) => r[y].best.a85 - r[x].best.a85)[0];
  const md = ['# Eye comfort, before and after', '', `Phone profile 1002x461 CSS px at DPR ${DPR}. Before = tag "${B}" (local build, nothing changed), after = tag "${A}". Worst case over four fights per row: gentle 6 s bot fight, heavy 3v3 (every ultimate and skill recharged each second), forced overlap (all six mechs cast ult, s1, s2 inside 0.1 s every 2.5 s) and the same in ?mode=nha beside the enemy sub tower. Heavy rows exist for medium on every theme and for low on ice and desert; other rows hold the gentle fight only.`, '',
    '| theme | tier | calm mean before / after | calm floor-cell median b / a | share above 0.85 b / a | white clip b / a | flashes per s (worst 1 s) b / a | max frame jump b / a | sat of brightest 25% b / a | after, Giảm chớp sáng on: share above 0.85 / clip / jump |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const t of themes) for (const q of ['low', 'medium', 'high']) {
    const b = rb[t + '/' + q], a = ra[t + '/' + q]; if (!b || !a) continue;
    const wb = worst(b), wa = worst(a), c = rc[t + '/' + q], wc = c ? worst(c) : null;
    md.push(`| ${t} | ${q} | ${b.calm.meanL.toFixed(2)} / ${a.calm.meanL.toFixed(2)} | ${(b.calm.cellMed || 0).toFixed(2)} / ${(a.calm.cellMed || 0).toFixed(2)} | ${pc(wb.a85)} / ${pc(wa.a85)} | ${pc(wb.clip)} / ${pc(wa.clip)} | ${wb.fl} / ${wa.fl} | ${wb.jump.toFixed(3)} / ${wa.jump.toFixed(3)} | ${wb.sat.toFixed(2)} / ${wa.sat.toFixed(2)} | ${wc ? `${pc(wc.a85)} / ${pc(wc.clip)} / ${wc.jump.toFixed(3)}` : '-'} |`);
  }
  md.push('', '## Frame time in the busy fight (ms/frame, this machine, gentle sequence)', '', '| theme | tier | before | after |', '|---|---|---|---|');
  for (const t of themes) for (const q of ['low', 'medium', 'high']) { const b = rb[t + '/' + q], a = ra[t + '/' + q]; if (b && a) md.push(`| ${t} | ${q} | ${b.busy.msPerFrame} | ${a.busy.msPerFrame} |`); }
  md.push('', `Limits enforced by --check: ${JSON.stringify(LIMITS)}`, '');
  fs.writeFileSync(path.join(OUT, 'after.md'), md.join('\n') + '\n'); console.log(path.join(OUT, 'after.md'));
  const cells = [];
  for (const t of themes) {
    const b = rb[t + '/medium'], a = ra[t + '/medium']; if (!b || !a) continue;
    const sc = pickScene(b) || 'busy', img = (tag, n) => { const f = path.join(OUT, `${tag}-${t}-medium-${n}.png`); return fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : ''; };
    cells.push({ imgs: [img(B, 'calm'), img(A, 'calm'), img(B, sc), img(A, sc)], labels: [`${t} calm BEFORE  L ${b.calm.meanL.toFixed(2)}`, `AFTER  L ${a.calm.meanL.toFixed(2)}`, `BEFORE ${sc}  >0.85 ${pc(b[sc].best.a85)}  white ${pc(b[sc].best.white)}`, `AFTER ${sc}  >0.85 ${pc(a[sc].best.a85)}  white ${pc(a[sc].best.white)}`] });
  }
  const refPath = path.join(process['env'].HOME, 'handoff', 'dau-truong-thep-ref.webp'), ref = fs.existsSync(refPath) ? fs.readFileSync(refPath).toString('base64') : '';
  const ctx = await br.newContext({ viewport: { width: 1200, height: 800 } }), page = await ctx.newPage();
  const png = await page.evaluate(async ({ cells, ref }) => {
    const ld = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const CW = 501, CH = 231, GAP = 4, LAB = 20, W = CW * 4 + GAP * 3;
    const refImg = ref ? await ld('data:image/webp;base64,' + ref) : null, refH = refImg ? Math.round(refImg.height * (CW * 2 + GAP) / refImg.width) : 0;
    const c = document.createElement('canvas'); c.width = W; c.height = (refImg ? refH + LAB + GAP : 0) + cells.length * (CH + LAB + GAP);
    const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height); x.font = 'bold 14px sans-serif'; x.textBaseline = 'middle';
    let y = 0;
    if (refImg) { x.fillStyle = '#fff'; x.fillText("reference (owner's): bright, saturated, soft", 6, LAB / 2); x.drawImage(refImg, 0, LAB, CW * 2 + GAP, refH); y = refH + LAB + GAP; }
    for (const cell of cells) {
      for (let i = 0; i < 4; i++) { const ox = i * (CW + GAP); x.fillStyle = '#ffd'; x.fillText(cell.labels[i], ox + 6, y + LAB / 2); if (cell.imgs[i]) x.drawImage(await ld('data:image/png;base64,' + cell.imgs[i]), ox, y + LAB, CW, CH); }
      y += CH + LAB + GAP;
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { cells, ref });
  const file = path.join(OUT, 'sheet.png'); fs.writeFileSync(file, Buffer.from(png, 'base64')); console.log(file);
  await ctx.close();
}

function codeRefs() {
  const G = path.join(__dirname, '..', 'js'), out = [];
  const find = (file, re, label, max = 12) => { try { const lines = fs.readFileSync(path.join(G, file), 'utf8').split('\n'); let n = 0; lines.forEach((l, i) => { if (n < max && re.test(l)) { out.push(`${label}: js/${file}:${i + 1} ${l.trim().slice(0, 150)}`); n++; } }); } catch (e) {} };
  find('gfx/post.js', /uThreshold: \{ value|aces\(c \* uExposure|uBloom, uExposure|gl_FragColor = vec4\(min\(c \* max/, 'post (bloom threshold 1.15 and a 12.0 clamp in BRIGHT, ACES curve, exposure, grade, vignette in COMPOSITE)');
  find('gfx/post.js', /Q.bloomGain \/ chain.length/, 'bloom total gain = tier gain / levels');
  find('main.js', /^  (low|medium|high): \{ name/, 'tier table (bloom gain, levels, lights)');
  find('gfx/world.js', /^  (jungle|desert|ice|lava|city|swamp|autumn|canyon): \{ growth|sun: \[0x|exposure: /, 'theme look (sun, hemi, exposure, grade per theme)', 40);
  find('gfx/fx.js', /new THREE\.PointLight/, 'flash light pool (PointLight distance 18, tier decides how many)');
  find('gfx/fx.js', /flash\([^)]*(200|90|70|60|50),/, 'strongest flash lights (power 50 to 200 on a floor 18 m around)', 14);
  find('gfx/fx.js', /AdditiveBlending/, 'additive meshes (beams, columns, screens, glows)', 8);
  return out;
}

// ---------------------------------------------------------------------------------------------------- main
(async () => {
  fs.mkdirSync(ROWS, { recursive: true });
  const themes = csv(process.env.EYES_THEMES, await themeList()), tiers = csv(process.env.EYES_TIERS, has('--check') ? ['medium'] : ['low', 'medium', 'high']);
  if (has('--compare')) { await session(async (br) => compare(br)); return; }
  if (has('--report')) { await session(async (br, base) => report(br, base)); return; }
  if (has('--ults')) {
    const theme = argv[argv.indexOf('--ults') + 1] && !argv[argv.indexOf('--ults') + 1].startsWith('--') ? argv[argv.indexOf('--ults') + 1] : 'jungle';
    await session(async (br, base) => {
      for (const mech of ULT_MECHS.concat(['trau:tower'])) {
        const [m, tw] = mech.split(':'); const f = path.join(ROWS, `${TAG}-ult-${tw || m}.json`);
        if (fs.existsSync(f) && !process.env.EYES_FORCE) { console.log('have', f); continue; }
        const r = await ultRow(br, base, theme, m, !!tw); fs.writeFileSync(f, JSON.stringify(r)); console.log(`ult ${r.name}: max white ${pc(r.maxWhite)} >0.85 ${pc(r.maxA85)} worst1s ${r.worstSecond} whiteFrames ${r.whiteFrames}`);
      }
    });
    return;
  }
  const done = [];
  const variants = has('--check') ? [false, true] : [!!process.env.EYES_CALM];
  for (const calm of variants) {
    setVariant(calm);
    if (!has('--no-run')) await session(async (br, base) => {
      for (const t of themes) for (const q of tiers) {
        if (fs.existsSync(rowFile(t, q)) && !process.env.EYES_FORCE && !has('--check')) { console.log('have', t, q); done.push([t, q]); continue; }
        const r = await measure(br, base, t, q); fs.writeFileSync(rowFile(t, q), JSON.stringify(r));
        console.log(`${t}/${q}${calm ? ' (calm on)' : ''}: calm L ${r.calm.meanL.toFixed(2)} white ${pc(r.calm.white)} | busy maxWhite ${pc(r.busy.maxWhite)} max>0.85 ${pc(r.busy.maxA85)} worst1s ${r.busy.worstSecond} whiteFrames ${r.busy.whiteFrames} | ${r.busy.msPerFrame} ms/frame`);
      }
    });
  }
  if (has('--check')) {
    let bad = 0;
    for (const calm of variants) {
      setVariant(calm);
      for (const t of themes) for (const q of tiers) {
        if (!fs.existsSync(rowFile(t, q))) continue;
        const r = JSON.parse(fs.readFileSync(rowFile(t, q), 'utf8')), f = [];
        const wMax = calm ? LIMITS.calmModeWhiteMax : LIMITS.busyWhiteMax, bMax = calm ? LIMITS.calmModeBrightMax : LIMITS.busyBrightMax;
        if (r.calm.meanL > LIMITS.calmMeanMax) f.push(`calm frame mean ${r.calm.meanL.toFixed(2)} > ${LIMITS.calmMeanMax}`);
        if (r.calm.meanL < LIMITS.calmMeanMin) f.push(`calm frame mean ${r.calm.meanL.toFixed(2)} < ${LIMITS.calmMeanMin}`);
        for (const k of SEQS) {
          const b = r[k]; if (!b) continue;
          if (b.maxWhite > wMax) f.push(`${k}: white clip ${pc(b.maxWhite)} > ${pc(wMax)}`);
          if (b.whiteFrames > 0) f.push(`${k}: ${b.whiteFrames} white frame(s)`);
          if (b.worstSecond >= LIMITS.flashPerSecMax) f.push(`${k}: ${b.worstSecond} large flashes in one second (limit < ${LIMITS.flashPerSecMax})`);
          if (b.maxA85 > bMax) f.push(`${k}: ${pc(b.maxA85)} of the view above 0.85 > ${pc(bMax)}`);
          if (b.maxJump > LIMITS.jumpMax) f.push(`${k}: frame-to-frame jump ${b.maxJump} > ${LIMITS.jumpMax}`);
        }
        console.log((f.length ? 'FAIL ' : 'PASS ') + `${t}/${q}${calm ? ' calm-on' : ''} ` + f.join('; ')); if (f.length) bad++;
      }
    }
    console.log(bad ? `\n${bad} row(s) FAILED` : '\nALL PASS'); process.exit(bad ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
