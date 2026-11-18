// Skill looks, side by side and against each other. For every chosen mech and skill (s1, s2, ult, and the second stage of a
// row with `next`) it casts once at three gathered foes that stand still, at the match camera's pitch and distance, and draws
// frames at fixed moments after the press; the same scene without the cast is the baseline. The pixels the cast changed give
// a signature: their mean colour and a 16x9 shape hash of where they are. Each skill is caught at one fixed moment after the
// press that follows from its row (`momentFor`: a shot just out, a blow as it lands, a field once it stands).
//   node tools/looks-check.js [mech,...|all] [--gate] [--tag name]
// Writes .chk/looks/<tag>.png (contact sheet: one row per tank, one tile per skill, labelled), .chk/looks/tiles/<mech>-<slot>.jpg
// and .chk/looks/sig.json (signatures, merged by mech across runs).
// --gate re-renders every mech with a look and fails a pair of skills of two different tanks that both carry a look when
// their shapes are close, colour counting little (see `dist` and `similar`), and a look under the visual weight FLOOR (changed area and contrast). Without --gate it prints the closest pairs among the mechs it rendered, looked or not.
'use strict';
const { session, open, CHK, fs, path, checker } = require('./lib.js');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const GATE = args.includes('--gate');
const tagAt = args.indexOf('--tag'), TAG = tagAt >= 0 ? args[tagAt + 1] : '';
const pick = args.filter((a, i) => !a.startsWith('--') && (tagAt < 0 || i !== tagAt + 1))[0] || '';
const OUT = path.join(CHK, 'looks'), TILES = path.join(OUT, 'tiles'), SIG = path.join(OUT, 'sig.json');
// s after the press (after the release for a charged skill, after the second press of a second stage)
function momentFor(r) {
  if (!r) return 0.4;
  switch (r.do) {
    case 'volley': return 0.15 + (r.burst ? r.burst.gap : 0);
    case 'dash': case 'blink': case 'hook': case 'swap': case 'warp': case 'flurry': return 0.25;
    case 'leap': return 0.3;
    case 'stance': case 'form': return (r.setup || 0.3) + 0.25;
    case 'nova': return (r.windup || 0) + 0.08;
    case 'beam': return r.charge ? 0.1 : (r.windup || 0) + 0.1;
    case 'sweep': return (r.windup || 0) + 0.6;
    case 'barrage': return (r.delay ?? 0.6) + 0.25;
    case 'zone': case 'dome': case 'mine': case 'minefield': case 'turret': case 'drone': case 'orbit': case 'wall': case 'portal': case 'decoy': case 'wire': return 0.8;
    default: return 0.5;
  }
}
const startOf = (r, slot) => (r && r.charge ? 47 : slot.endsWith('b') ? 18 : 1);
// calibrated on 3c4cbf8c: Lữ Bố s2 ~ Tào Tháo s1 scores 0.43 and Athena s1 ~ Hades s1 0.52, both too similar
const COLW = 0.1, SIM = Number(process.env.LOOKS_SIM || 0.525);
// visual weight floor: share of the frame a look changes and the mean contrast of those pixels (0-255 per channel), ults
// need more (calibrated so the thin first cut of Athena s1, Lữ Bố s2 and Tào Tháo s1 fail and Hades ult passes)
const FLOOR = { area: 0.025, ultArea: 0.06, contrast: 40 };
const W = 160, H = 90, GX = 16, GY = 9, LX = Number(process.env.LOOKS_LX || 16), LY = Number(process.env.LOOKS_LY || 9), OB = 8;

// Shape first: `lum` is a histogram of the cast's grayscale edge orientations (8 bins) in 16x9 cells, taken where the cast
// changed the frame (colour ignored), each
// normalised to sum 1; shape distance = 1 - histogram intersection (0 same mass in the same cells, 1 nothing shared).
// Colour (mean RGB of the changed pixels over the cube diagonal) is a minor term, so a new hue cannot rescue two looks of the
// same shape: a pair is too similar when ds + COLW * dc < SIM.
function dist(a, b) {
  const dc = Math.hypot(a.mean[0] - b.mean[0], a.mean[1] - b.mean[1], a.mean[2] - b.mean[2]) / 441.7;
  let sa = 0, sb = 0, both = 0;
  for (let i = 0; i < a.lum.length; i++) { sa += a.lum[i]; sb += b.lum[i]; }
  for (let i = 0; i < a.lum.length; i++) both += Math.min(a.lum[i] / (sa || 1), b.lum[i] / (sb || 1));
  return { dc, ds: 1 - both };
}
const similar = (d) => d.ds + COLW * d.dc < SIM;

// The canvas as the player sees it: a JPEG screenshot (kept for the sheet) and its pixels at W x H (decoded by ffmpeg).
async function frame(page) {
  const jpg = await page.locator('#view').screenshot({ type: 'jpeg', quality: 85, timeout: 120000 });
  const px = execFileSync('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { input: jpg, maxBuffer: 1 << 24 });
  return { jpg, px };
}

session(async (br, base) => {
  const D = await import(path.join(__dirname, '..', 'js', 'data.js'));
  const looked = (k) => { const r = D.MECHS[k]; return r.skills.some((s) => s.look || (s.next && s.next.row.look)) || (r.passive && r.passive.look); };
  let mechs = pick === 'all' || !pick ? D.MECH_ORDER.slice() : pick.split(',');
  if (GATE && !pick) mechs = D.MECH_ORDER.filter(looked);
  for (const k of mechs) if (!D.MECHS[k]) { console.log('FAIL unknown mech ' + k); process.exit(1); }
  fs.mkdirSync(TILES, { recursive: true });
  const g = await open(br, base, 'manual&noaudio&autostart&seed=3&bots=normal&q=high&mech=' + mechs[0]);
  await g.page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });
  await g.page.evaluate(() => {
    const G = window.__G;

    // A fresh match with mech k, three foes gathered 6 m ahead (standing, unkillable), one hurt ally beside, everyone else parked.
    window.__scene = (k, slotKey, cast, ticks) => {
      // the renderer's own randomness (particles, sparks) restarts from one seed each scene, so a signature is the same run to run
      let seed = 0x9e3779b9; Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      // camera shake outlives a match (an ult's kick in the scene before would move this scene's camera off its baseline)
      try { G.meta.get().settings.shake = 'off'; } catch (e) { /* no settings: shake stays as the game has it */ }
      window.__start({ mech: k, map: 'denrung', mode: 'tdm', size: 3, diff: 'normal', theme: null });
      window.__botHook = null;
      window.__step(100, false);
      const m = G.match, u = m.units[G.me], a = u.team ? Math.PI : 0, d = 6.5, cx0 = u.x + Math.cos(a) * d, cz0 = u.z + Math.sin(a) * d;
      u.hp = u.maxHp = 1e6; u.aim = Math.atan2(cz0 - u.z, cx0 - u.x); let f = 0, al = 0, ally = null; const foes = [];
      for (const o of m.units) {
        if (o === u) continue;
        if (o.team === u.team) { if (al++ >= 1) { o.alive = false; o.respawnT = 1e9; } else { o.x = o.px = u.x - Math.cos(a) * 1.5; o.z = o.pz = u.z + 3; o.hp = o.maxHp * 0.4; o.bot = false; ally = o; } }
        else if (f >= 3) { o.alive = false; o.respawnT = 1e9; }
        else { const b = f * 2.1 - 2.1; o.x = o.px = cx0 + Math.cos(a) * (f % 2) * 1.2; o.z = o.pz = cz0 + b; o.hp = o.maxHp = 1e6; o.bot = false; foes.push(o); f++; }
      }
      for (const key of ['s1', 's2', 'ult']) u.cd[key] = 0;
      const row = u.def.skills[{ s1: 0, s2: 1, ult: 2 }[slotKey.replace('b', '')]];
      const charge = row && row.charge, counter = row && row.do === 'counter', next = slotKey.endsWith('b');
      // skills aimed at an ally (a blessing, a leap to an ally) are cast at the hurt ally
      const atAlly = ally && row && (row.do === 'bless' || row.to === 'ally');
      const tx = atAlly ? ally.x : cx0, tz = atAlly ? ally.z : cz0;
      let t = 0;
      // the press: two ticks; a charged skill is let go at 1.5 s and pressed again; a second stage is pressed again at 0.55 s
      window.__input(() => { t++; const k2 = slotKey.replace('b', ''); let on = cast && t < 3;
        if (cast && charge && t > 45 && t < 48) on = true;
        if (cast && next && t > 16 && t < 19) on = true;
        return { mx: 0, mz: 0, aim: Math.atan2(cz0 - u.z, cx0 - u.x), fire: false, s1: k2 === 's1' && on, s2: k2 === 's2' && on, ult: k2 === 'ult' && on, heal: false, tx, tz }; });
      // a counter needs a blow to turn: the foes shoot at the caster
      if (cast && counter) window.__botHook = (mm, inputs) => { for (const o of foes) inputs[o.id] = { mx: 0, mz: 0, aim: Math.atan2(u.z - o.z, u.x - o.x), fire: true, s1: false, s2: false, ult: false, heal: false, tx: u.x, tz: u.z }; };
      window.__setShot({ x: (u.x + cx0) / 2, z: (u.z + cz0) / 2 + 1.2, pitch: 57 });
      window.__sceneAt = 0;
      window.__sceneTicks = ticks;
      return { name: u.def.name, skill: row ? row.name : '', look: row ? (next ? row.next.row.look : row.look) || '' : '' };
    };
    // where every living mech is on screen (W x H pixels) and how big a 1.3 m radius is there: the bodies of mechs that a cast
    // shoves, pulls or carries (they stand somewhere else than in the baseline) are not part of the look, and the foes' own
    // spots carry every damaging skill's hit flash: the shape signature leaves both out
    window.__bodies = () => { const V = new G.THREE.Vector3(), out = [];
      for (const o of G.match.units) { if (!o.alive) continue; V.set(o.x, 0.8, o.z).project(G.camera); const x = (V.x + 1) / 2 * 160, y = (1 - V.y) / 2 * 90;
        V.set(o.x + 1.3, 0.8, o.z).project(G.camera); out.push([x, y, Math.abs((V.x + 1) / 2 * 160 - x), o.id, o.team !== G.match.units[G.me].team]); } return out; };
    // step to the i-th moment and draw it
    window.__sceneStep = (i) => { const tick = window.__sceneTicks[i], at = window.__sceneAt; if (tick - at > 1) window.__step(tick - at - 1, false); window.__step(1, true); window.__sceneAt = tick; if (i === window.__sceneTicks.length - 1) window.__botHook = null; };
  });

  const sigs = fs.existsSync(SIG) ? JSON.parse(fs.readFileSync(SIG, 'utf8')) : {};
  const sheetRows = [];
  for (const k of mechs) {
    const r = D.MECHS[k], slots = ['s1', 's2', 'ult'];
    r.skills.forEach((s, i) => { if (s.next) slots.splice(slots.indexOf(['s1', 's2', 'ult'][i]) + 1, 0, ['s1', 's2', 'ult'][i] + 'b'); });
    const rowOf = (slot) => { const s = r.skills[{ s1: 0, s2: 1, ult: 2 }[slot.replace('b', '')]]; return slot.endsWith('b') ? s.next.row : s; };
    const tickOf = {};
    for (const slot of slots) { const s0 = r.skills[{ s1: 0, s2: 1, ult: 2 }[slot.replace('b', '')]]; tickOf[slot] = startOf(s0, slot) + Math.round(momentFor(rowOf(slot)) * 30); }
    const ticks = [...new Set(Object.values(tickOf))].sort((x, y) => x - y);
    await g.page.evaluate(({ k, T }) => window.__scene(k, 's1', false, T), { k, T: ticks });
    const baseAt = {}, bodyAt = {};
    for (let i = 0; i < ticks.length; i++) { await g.page.evaluate((i) => window.__sceneStep(i), i); baseAt[ticks[i]] = (await frame(g.page)).px; bodyAt[ticks[i]] = await g.page.evaluate(() => window.__bodies()); }
    sigs[k] = {};
    const row = { k, name: r.name, tiles: [] };
    for (const slot of slots) {
      const T = tickOf[slot], res = await g.page.evaluate(({ k, slot, T }) => window.__scene(k, slot, true, [T]), { k, slot, T });
      await g.page.evaluate(() => window.__sceneStep(0));
      const f = await frame(g.page), base = baseAt[T], bestMask = new Uint8Array(W * H); let best = 0;
      const now = await g.page.evaluate(() => window.__bodies()), was = bodyAt[T], off = new Uint8Array(W * H), bodies = [];
      for (const b of now) { const a0 = was.find((w) => w[3] === b[3]); if (b[4] || !a0 || Math.hypot(a0[0] - b[0], a0[1] - b[1]) > 0.6) { bodies.push(b); if (a0) bodies.push(a0); } }
      for (const [bx, by, br] of bodies) for (let y = Math.max(0, Math.floor(by - br)); y <= Math.min(H - 1, by + br); y++) for (let x = Math.max(0, Math.floor(bx - br)); x <= Math.min(W - 1, bx + br); x++) if ((x - bx) ** 2 + (y - by) ** 2 <= br * br) off[y * W + x] = 1;
      let con = 0; const lum = new Array(LX * LY * OB).fill(0);
      // weight (area, contrast) counts every changed pixel; the shape signature leaves mech bodies out
      for (let p = 0; p < W * H; p++) { const q = p * 4, dd = Math.abs(f.px[q] - base[q]) + Math.abs(f.px[q + 1] - base[q + 1]) + Math.abs(f.px[q + 2] - base[q + 2]); if (dd > 90) { bestMask[p] = 1; best++; con += dd / 3; }
        const dl = Math.abs(0.3 * (f.px[q] - base[q]) + 0.59 * (f.px[q + 1] - base[q + 1]) + 0.11 * (f.px[q + 2] - base[q + 2]));
        // edges of the cast's own picture: grayscale gradient of the frame where the cast changed it (outlines, lines, rims),
        // so two filled shapes of the same size read alike and a ring reads unlike a disc
        const px0 = p % W, py0 = p / W | 0;
        if (!off[p] && dl > 12 && px0 > 0 && px0 < W - 1 && py0 > 0 && py0 < H - 1) {
          const L = (i) => 0.3 * f.px[i] + 0.59 * f.px[i + 1] + 0.11 * f.px[i + 2];
          const gx = L(q + 4) - L(q - 4), gy = L(q + W * 4) - L(q - W * 4);
          // orientation of the edge (0..pi, 8 bins) in a 16x9 cell: what kind of lines the shape is made of and roughly where
          const mag = Math.hypot(gx, gy), ob = Math.min(OB - 1, Math.floor(((Math.atan2(gy, gx) + Math.PI) % Math.PI) / Math.PI * OB));
          lum[(Math.floor(py0 * LY / H) * LX + Math.floor(px0 * LX / W)) * OB + ob] += mag;
        } }
      for (let i = 0; i < lum.length; i++) lum[i] = Math.round(lum[i] / 10);
      con = Math.round(con / Math.max(1, best));
      const at = +((T - startOf(r.skills[{ s1: 0, s2: 1, ult: 2 }[slot.replace('b', '')]], slot)) / 30).toFixed(2), mean = [0, 0, 0];
      for (let p = 0; p < W * H; p++) if (bestMask[p]) { mean[0] += f.px[p * 4]; mean[1] += f.px[p * 4 + 1]; mean[2] += f.px[p * 4 + 2]; }
      for (let c = 0; c < 3; c++) mean[c] = Math.round(mean[c] / Math.max(1, best));
      let hash = '';
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
        let n = 0; const cw = W / GX, ch = H / GY;
        for (let y = gy * ch; y < (gy + 1) * ch; y++) for (let x = gx * cw; x < (gx + 1) * cw; x++) n += bestMask[y * W + x];
        hash += n / (cw * ch) > 0.08 ? '1' : '0';
      }
      const file = path.join(TILES, `${k}-${slot}.jpg`);
      fs.writeFileSync(file, f.jpg);
      sigs[k][slot] = { skill: res.skill, look: res.look, area: +(best / (W * H)).toFixed(4), contrast: con, moment: at, mean, hash, lum };
      row.tiles.push({ slot, label: `${slot} ${res.skill}${res.look ? ' [' + res.look + ']' : ''} @${at}s`, jpg: 'data:image/jpeg;base64,' + f.jpg.toString('base64') });
      console.log(`${k} ${slot} ${res.skill} look=${res.look || '-'} area=${(best / (W * H) * 100).toFixed(1)}% con=${con} t=${at} rgb=${mean.join(',')}`);
    }
    sheetRows.push(row);
  }
  fs.writeFileSync(SIG, JSON.stringify(sigs, null, 1));

  // the contact sheet, composed in the page
  const sheet = await g.page.evaluate((rows) => new Promise(async (done) => {
    const tw = 480, th = 270, lab = 22, head = 26, cols = Math.max(...rows.map((r) => r.tiles.length));
    const cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = rows.length * (th + lab + head); const c = cv.getContext('2d');
    c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < rows.length; i++) {
      const y0 = i * (th + lab + head);
      c.fillStyle = '#fff'; c.font = 'bold 20px sans-serif'; c.fillText(rows[i].name + ' (' + rows[i].k + ')', 8, y0 + 20);
      for (let j = 0; j < rows[i].tiles.length; j++) {
        const t = rows[i].tiles[j], img = new Image(); img.src = t.jpg; await img.decode();
        c.drawImage(img, j * tw, y0 + head, tw, th);
        c.fillStyle = '#ffd34a'; c.font = '15px sans-serif'; c.fillText(t.label, j * tw + 6, y0 + head + th + 16);
      }
    }
    done(cv.toDataURL('image/png'));
  }), sheetRows);
  const sheetFile = path.join(OUT, (TAG || (GATE ? 'gate' : mechs.join('-').slice(0, 60))) + '.png');
  fs.writeFileSync(sheetFile, Buffer.from(sheet.split(',')[1], 'base64'));
  const errs = await g.page.evaluate(() => window.__errors.slice(0, 5));
  await g.close();
  console.log(sheetFile);

  // pairs of skills of different tanks
  const all = [];
  for (const k in sigs) for (const s in sigs[k]) all.push({ k, s, ...sigs[k][s] });
  const pool = GATE ? all.filter((a) => a.look && mechs.includes(a.k)) : all.filter((a) => mechs.includes(a.k));
  const pairs = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const a = pool[i], b = pool[j];
    if (a.k === b.k) continue;
    pairs.push({ a, b, ...dist(a, b) });
  }
  pairs.sort((x, y) => (x.ds + COLW * x.dc) - (y.ds + COLW * y.dc));
  const check = checker();
  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  if (GATE) {
    for (const a of pool) { const fa = a.s === 'ult' ? FLOOR.ultArea : FLOOR.area; check(a.area >= fa && a.contrast >= FLOOR.contrast, `${a.k} ${a.s} ${a.skill} [${a.look}] has weight: ${(a.area * 100).toFixed(1)}% of the frame (floor ${fa * 100}%), contrast ${a.contrast} (floor ${FLOOR.contrast})`); }
    const bad = pairs.filter(similar);
    check(!bad.length, `${pool.length} looks, ${pairs.length} pairs of two tanks: none too similar (shape + ${COLW} x colour < ${SIM})` + (bad.length ? ': ' + bad.slice(0, 12).map((p) => `${p.a.k}.${p.a.s}~${p.b.k}.${p.b.s} (s ${p.ds.toFixed(2)} c ${p.dc.toFixed(3)})`).join(', ') : ''));
    for (const p of pairs.slice(0, 5)) console.log(`  closest: ${p.a.k}.${p.a.s} [${p.a.look}] ~ ${p.b.k}.${p.b.s} [${p.b.look}]  shape ${p.ds.toFixed(2)} colour ${p.dc.toFixed(3)}`);
    check.done();
  } else {
    const bad = pairs.filter(similar);
    for (const a of pool) if (a.look) { const fa = a.s === 'ult' ? FLOOR.ultArea : FLOOR.area; if (a.area < fa || a.contrast < FLOOR.contrast) console.log(`  LIGHT ${a.k}.${a.s} [${a.look}] ${(a.area * 100).toFixed(1)}% con ${a.contrast}`); }
    console.log(`${bad.length} of ${pairs.length} pairs too similar`);
    // per tank: how many of its skills look like another tank's (the most generic first)
    const per = {};
    for (const p of bad) for (const x of [p.a, p.b]) { (per[x.k] = per[x.k] || new Set()).add(x.s); }
    console.log('generic: ' + Object.entries(per).sort((x, y) => y[1].size - x[1].size).map(([k, v]) => k + ':' + v.size).join(' '));
    for (const p of pairs.slice(0, 15)) console.log(`  ${similar(p) ? 'SIMILAR' : 'ok     '} ${p.a.k}.${p.a.s} ${p.a.skill} [${p.a.look || '-'}] ~ ${p.b.k}.${p.b.s} ${p.b.skill} [${p.b.look || '-'}]  shape ${p.ds.toFixed(2)} colour ${p.dc.toFixed(3)}`);
  }
});
