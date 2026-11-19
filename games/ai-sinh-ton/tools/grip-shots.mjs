// Grip proof: builds each of the 13 heroes on a bare stage (same modules as the game: BZ.heroModel, BZ.equipWeapon,
// BZ.animHero, js/view/grip.js), renders them standing and at an attack frame plus a close-up of the hands, and asserts
// the measured grip: hands on the grip points, elbows bent the natural way, weapon above the floor, muzzle at the barrel
// end. Then plays each hero in the real page at s22 and measures the weapon's projected size.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/grip-shots.mjs [--only=id,id] [--no-game]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'grip');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGAME = process.argv.includes('--no-game');
const HEROES = ['gio', 'thep', 'yta', 'mua', 'bong', 'phao', 'bang', 'hoa', 'sam', 'doc', 'ky', 'soi', 'nhen'].filter((h) => !ONLY.length || ONLY.includes(h));
const { check, done } = checker();

// page side: the stage, the poses and the measurements
const STAGE = async () => {
  const THREE = window.THREE; const BZ = window.BZ;
  const suffix = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  const mod = await import(new URL('js/view/grip.js' + suffix, location.href).href);
  const { attachGrip, solveGrip, gripReport } = mod;
  const HERO_SCALE = 1.15; const HEAD_SCALE = 1.18; const W = 360; const H = 520;
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:360px;height:520px';
  document.body.appendChild(cv);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(W, H, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 5, 3); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x6f8a62 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  scene.add(new THREE.GridHelper(12, 24, 0x3a4a32, 0x58704c));
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
  const state = { cur: null };
  const swings = new Set(['melee', 'sword2', 'spear', 'glaive', 'fists', 'throw', 'claws']);

  function build(id) {
    if (state.cur) scene.remove(state.cur.node);
    const bz = BZ.HEROES.find((h) => h.id === id); const Wp = BZ.WEAPONS[bz.weapon] || {};
    const m = BZ.heroModel(id); const eq = BZ.equipWeapon(m, bz.weapon); const gr = attachGrip(m, eq, bz.weapon);
    const node = new THREE.Group(); node.scale.setScalar(HERO_SCALE); node.add(m.root); scene.add(node); m.head.scale.setScalar(HEAD_SCALE);
    const st = { speed: 0, mode: BZ.holdOf(Wp), swing: -1, kick: 0, kickL: 0, draw: 1, air: 0, vy: 0, pitch: 0, dead: 0, hurt: 0, hurtDir: 0, pat: 'r2l', cast: 0 };
    state.cur = { id, bz, Wp, m, eq, gr, node, st };
    return state.cur;
  }
  function step(h, pose, n) {
    const { m, st, gr, eq, Wp } = h; const dt = 1 / 60;
    for (let i = 0; i < n; i++) {
      st.speed = pose === 'walk' ? 3.2 : 0; st.swing = -1; st.kick = 0; st.kickL = 0; let aim = false;
      if (pose === 'attack') {
        aim = true;
        if (swings.has(st.mode)) { st.swing = st.mode === 'fists' ? 0.3 : 0.45; st.pat = Wp.combo ? Wp.combo[0] : 'r2l'; } else { st.kick = 1; st.kickL = 0; }
      }
      BZ.animHero(m, st, dt); BZ.heroGun(m, st, eq && eq.gun); solveGrip(gr, m, st, dt, { aim });
    }
    h.node.updateMatrixWorld(true);
  }
  const box = new THREE.Box3(); const corner = new THREE.Vector3();
  // every weapon vertex region: the corners of each mesh's geometry box, in world space
  function weaponCorners(h, fn) {
    for (const o of h.gr.objs) {
      o.g.updateWorldMatrix(true, true);
      o.g.traverse((q) => {
        if (!q.isMesh || q.userData.castProp) return; q.geometry.computeBoundingBox(); const b = q.geometry.boundingBox;
        for (let i = 0; i < 8; i++) { corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(q.matrixWorld); fn(corner); }
      });
    }
  }
  function metrics(h) {
    const r = gripReport(h.gr, h.m);
    let minY = 1e9; weaponCorners(h, (c) => { minY = Math.min(minY, c.y); });
    // muzzle: the tip object against the weapon's far end along its pointing axis (local units, then scaled)
    const o = h.gr.objs[0]; const fwd = new THREE.Vector3().fromArray(h.gr.row.fwd); let far = -1e9;
    box.makeEmpty();
    const inv = new THREE.Matrix4().copy(o.g.matrixWorld).invert();
    o.g.traverse((q) => { if (!q.isMesh || q.userData.castProp) return; q.geometry.computeBoundingBox(); const b = q.geometry.boundingBox; const m4 = new THREE.Matrix4().copy(inv).multiply(q.matrixWorld);
      for (let i = 0; i < 8; i++) { corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m4); far = Math.max(far, corner.dot(fwd)); } });
    const tip = o.g.userData.tipObj; const tipD = tip ? Math.abs(tip.position.dot(fwd) - far) * o.g.scale.x : 0;
    return { ...r, minY, tipD, hasTip: !!tip };
  }
  function shot(h, view) {
    const m = h.m; h.node.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); const hl = new THREE.Vector3();
    m.handR.getWorldPosition(hp); m.handL.getWorldPosition(hl);
    if (view === 'hands') {
      const two = h.gr.row.type === 'two' || h.gr.row.type === 'shoulder' || h.gr.row.type === 'wrist' || h.gr.row.type === 'pole' || h.gr.row.type === 'dual';
      const mid = two ? hp.clone().add(hl).multiplyScalar(0.5) : hp.clone(); cam.fov = 28; cam.updateProjectionMatrix();
      cam.position.copy(mid).add(new THREE.Vector3(1.1, 0.5, 1.7)); cam.lookAt(mid);
    } else if (view === 'side') { cam.fov = 32; cam.updateProjectionMatrix(); cam.fov = 36; cam.updateProjectionMatrix(); cam.position.set(5.6, 1.5, 0.5); cam.lookAt(0, 1.15, 0.3); } else { cam.fov = 32; cam.updateProjectionMatrix(); cam.fov = 36; cam.updateProjectionMatrix(); cam.position.set(2.8, 1.6, 5.2); cam.lookAt(0, 1.05, 0.2); }
    renderer.render(scene, cam); renderer.getContext().finish(); renderer.render(scene, cam); renderer.getContext().finish();
    return cv.toDataURL('image/png');
  }
  window.__gs = { build, step, metrics, shot, weaponCorners };
};

// page side, in the real game: paint the hero's weapon a flat test colour (the depth test of the real frame then hides whatever
// the hero's own body covers) and report the hero's frame position and whether it is attacking
const FLAT = (on) => {
  const G = window.__G; const THREE = G.host.THREE; const gi = G.actors.gripOf(G.B.heroes[0].uid); if (!gi) return false;
  const flat = window.__flatMat || (window.__flatMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false, fog: false }));
  for (const o of gi.grip.objs) o.g.traverse((q) => {
    if (!q.isMesh || q.userData.castProp) return;
    if (on) { if (!q.userData.keepMat) q.userData.keepMat = q.material; q.material = flat; } else if (q.userData.keepMat) { q.material = q.userData.keepMat; q.userData.keepMat = null; }
  });
  return true;
};
const HEROPOS = () => {
  const G = window.__G; const H = G.host; const u = G.B.heroes[0]; const n = G.actors.nodeOf(u.uid);
  const v = new H.THREE.Vector3(n.position.x, 1.2, n.position.z).project(H.camera); const w = H.size.w / H.size.u; const hh = H.size.h / H.size.u;
  return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * hh, attack: u.anim === 'attack' };
};
const SMALL = new Set(['dualpistol', 'shuriken', 'fists', 'hatchet', 'webbow']);

function sheetOf(files, labels, out, cols = 5, cellW = 360) {
  const py = `
import sys, json
from PIL import Image, ImageDraw
files = json.loads(sys.argv[3]); labels = json.loads(sys.argv[4]); cols = int(sys.argv[2]); W = ${cellW}
ims = [Image.open(f).convert('RGB') for f in files]
ims = [i.resize((W, int(i.height * W / i.width))) for i in ims]
H = max(i.height for i in ims); rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (cols * W + (cols + 1) * 8, rows * H + (rows + 1) * 8), (18, 18, 22)); d = ImageDraw.Draw(s)
for k, i in enumerate(ims):
    x = 8 + (k % cols) * (W + 8); y = 8 + (k // cols) * (H + 8); s.paste(i, (x, y)); d.rectangle([x, y, x + 150, y + 14], fill=(0, 0, 0)); d.text((x + 3, y + 2), labels[k], fill=(255, 255, 255))
s.save(sys.argv[1])`;
  execFileSync('python3', ['-c', py, out, String(cols), JSON.stringify(files), JSON.stringify(labels)]);
}

const srv = await serve(); const br = await launch();
const bad = (list) => list.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));
try {
  const { ctx, page, problems } = await openPage(br, srv.base, 's22', 'noaudio=1&seed=9');
  await page.evaluate(STAGE);
  const sheets = { stand: [], attack: [], hands: [], side: [], walk: [] }; const labels = { stand: [], attack: [], hands: [], side: [], walk: [] };
  const save = (kind, id, wid, url) => { const f = path.join(OUT, `${kind}-${id}.png`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); sheets[kind].push(f); labels[kind].push(`${id} / ${wid}`); };
  const lim = { two: 0.615, shoulder: 0.615, wrist: 0.615, dual: 0.615, pole: 0.615 };
  for (const id of HEROES) {
    const wid = await page.evaluate((i) => window.__gs.build(i).bz.weapon, id);
    // a cast that puts the weapon away, then the weapon comes back: the grip must be right again
    const rc = await page.evaluate((i) => { const h = window.__gs; const cur = h.build(i); const BZ = window.BZ; h.step(cur, 'attack', 30); cur.st.act = { key: 'cluster', t: 0 }; h.step(cur, 'stand', 12); const hid = cur.gr.objs.every((o) => !o.g.visible); cur.st.act = null; h.step(cur, 'stand', 90); const met = h.metrics(cur); return { hid, ok: cur.gr.objs.every((o) => o.g.visible), main: Math.max(...met.main), sup: met.support }; }, id);
    check(rc.hid && rc.ok && rc.main <= 0.04 && (rc.sup === undefined || rc.sup <= 0.05), `${id}/${wid}: after a cast the weapon is put away (${rc.hid}) and comes back on the grip (main ${rc.main.toFixed(3)}, off hand ${rc.sup === undefined ? 'n/a' : rc.sup.toFixed(3)})`);
    for (const pose of ['stand', 'attack', 'walk']) {
      const r = await page.evaluate(([p, i]) => { const h = window.__gs; const cur = h.build(i); h.step(cur, p, 90); const met = h.metrics(cur); const shots = {}; if (p === 'stand') { shots.stand = h.shot(cur, 'three'); shots.hands = h.shot(cur, 'hands'); } if (p === 'attack') { shots.attack = h.shot(cur, 'three'); shots.side = h.shot(cur, 'side'); } if (p === 'walk') shots.walk = h.shot(cur, 'three'); return { met, shots }; }, [pose, id]);
      for (const [k, v] of Object.entries(r.shots)) save(k, id, wid, v);
      const m = r.met; const tag = `${id}/${wid} ${pose}`;
      if (process['env'].GRIP_DBG && pose === 'stand') console.log(tag, JSON.stringify(m.dbg));
      const mainMax = Math.max(...m.main); check(mainMax <= 0.04, `${tag}: main hand ${mainMax.toFixed(3)} m from its grip point (<= 0.04)`);
      if (m.support !== undefined) check(m.support <= 0.05, `${tag}: off hand ${m.support.toFixed(3)} m from the support point (<= 0.05)`);
      for (const [n, e] of [['R', m.elbowR], ['L', m.elbowL]]) {
        check(e.angle >= 20 && e.angle <= 160, `${tag}: elbow ${n} angle ${e.angle.toFixed(0)} deg (20..160)`);
        check(e.below >= -0.005, `${tag}: elbow ${n} ${e.below.toFixed(3)} m below the shoulder-hand line (>= 0)`);
      }
      if (lim[m.type]) { for (const [n, rr] of [['R', m.reachR], ['L', m.reachL]]) if (rr !== undefined) check(rr <= lim[m.type], `${tag}: ${n} grip reach ${rr.toFixed(3)} m (<= ${lim[m.type]})`); }
      if (pose !== 'walk') check(m.minY >= -0.01, `${tag}: lowest weapon vertex ${m.minY.toFixed(3)} m (>= 0)`);
      if (pose === 'stand' && m.hasTip && ['two', 'shoulder', 'wrist', 'dual', 'one', 'pole'].includes(m.type)) check(m.tipD <= 0.05, `${tag}: muzzle ${m.tipD.toFixed(3)} m from the barrel end (<= 0.05)`);
    }
  }
  check(bad(problems).length === 0, `stage: no console problems ${problems.slice(0, 3).join(' | ')}`);
  for (const k of ['stand', 'attack', 'hands', 'side', 'walk']) if (sheets[k].length) sheetOf(sheets[k], labels[k], path.join(OUT, `sheet-${k}.png`), 5, 300);
  await ctx.close();

  if (!NOGAME) {
    const g = await openPage(br, srv.base, 's22', 'noaudio=1&seed=9');
    await g.page.evaluate(() => { const G = window.__G; const sc = G && G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide(); });
    const files = []; const lab = [];
    const spanPy = `
import sys, json
from PIL import Image
out = []
for f in json.load(open(sys.argv[1])):
    im = Image.open(f).convert('RGB'); px = im.load(); W, H = im.size
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if r > 200 and b > 200 and g < 90:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    out.append(0 if x1 < 0 else max(x1 - x0 + 1, y1 - y0 + 1) / 3.0)
print(json.dumps(out))`;
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
    const REPORT = {};
    for (const id of HEROES) {
      await g.page.evaluate((i) => { window.__G.start(2, { seed: 9, team: [i], auto: { ult: true, pick: 'best' } }); window.__sim(3); window.__step(4); }, id);
      const wid = await g.page.evaluate(() => window.BZ.HEROES.find((h) => h.id === window.__G.B.heroes[0].kind).weapon);
      const f = path.join(OUT, `ingame-${id}.png`); await g.page.locator('#frame').screenshot({ path: f });
      const bb = await g.page.locator('#frame').boundingBox();
      await g.page.evaluate(FLAT, true);
      const frames = []; const tmp = path.join(OUT, 'tmp-vis'); fs.mkdirSync(tmp, { recursive: true });
      let nA = 0; let nI = 0;
      for (let t = 0; t < 60 && (nA < 8 || nI < 8); t++) {
        await g.page.evaluate(() => { window.__sim(0.23); window.__step(2); });
        const at = await g.page.evaluate(HEROPOS);
        const cx = Math.max(0, Math.min(bb.width - 200, at.x - 100)); const cy = Math.max(0, Math.min(bb.height - 200, at.y - 100));
        const fn = path.join(tmp, `${id}-${t}.png`);
        await g.page.screenshot({ path: fn, clip: { x: bb.x + cx, y: bb.y + cy, width: 200, height: 200 } });
        if (at.attack) nA++; else nI++;
        frames.push({ fn, attack: at.attack });
      }
      await g.page.evaluate(FLAT, false);
      fs.writeFileSync(path.join(tmp, 'list.json'), JSON.stringify(frames.map((x) => x.fn)));
      const spans = JSON.parse(execFileSync('python3', ['-c', spanPy, path.join(tmp, 'list.json')]).toString());
      const sa = med(spans.filter((_, k) => frames[k].attack)); const si = med(spans.filter((_, k) => !frames[k].attack));
      REPORT[id] = { wid, idle: si, attack: sa, nA, nI };
      const need = SMALL.has(wid) ? 18 : 28;
      check(nI >= 3 && si >= need, `${id}/${wid}: idle weapon visible span ${si.toFixed(1)} CSS px over ${nI} frames (>= ${need})`);
      check(nA >= 3 && sa >= need, `${id}/${wid}: attack weapon visible span ${sa.toFixed(1)} CSS px over ${nA} frames (>= ${need})`);
      const at = await g.page.evaluate(HEROPOS);
      const cx = Math.max(0, Math.min(bb.width - 100, at.x - 50)); const cy = Math.max(0, Math.min(bb.height - 100, at.y - 50));
      const fc = path.join(OUT, `ingame-crop-${id}.png`); await g.page.screenshot({ path: fc, clip: { x: bb.x + cx, y: bb.y + cy, width: 100, height: 100 } }); files.push(fc); lab.push(`${id} / ${wid}`);
    }
    fs.writeFileSync(path.join(OUT, 'visible.json'), JSON.stringify(REPORT, null, 1));
    check(bad(g.problems).length === 0, `game: no console problems ${g.problems.slice(0, 3).join(' | ')}`);
    sheetOf(files, lab, path.join(OUT, 'sheet-ingame.png'), 5, 300);
    await g.ctx.close();
  }
} finally { await br.close(); srv.close(); }
done();
