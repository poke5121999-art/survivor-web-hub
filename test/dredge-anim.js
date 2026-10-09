/*
 * DREDGE — Biển Mù: kiểm hoạt hình clip/animator (R2, U2 + thư viện DRAnim cho U3/D1/D2).
 *
 * Phần A (node thuần, không trình duyệt):
 *   - Mọi curve trong data/animlib.js khớp TỪNG SỐ (thời gian, giá trị, tiếp tuyến vào/ra, kể cả Infinity) với YAML AssetRipper,
 *     đọc bằng bộ đọc YAML riêng của bài kiểm này (không dùng mã của tools/anim.py); số curve bị bỏ = 27 vật lý + 2 trỏ vào nút không còn.
 *   - Mẫu Hermite: giá trị tại chính thời gian khoá = giá trị YAML; điểm giữa so với đa thức a,b,c,d dựng lại từ tiếp tuyến YAML (khác công thức của js/anim.js)
 *     và với số tính sẵn bằng Python (số ghi cứng).
 *   - Máy trạng thái: TrawlNet/Bait/Banner/LoadingScreen chuyển theo tham số, trigger bị tiêu thụ, sự kiện clip, any-state không chuyển vào chính nó,
 *     chéo mờ có thời lượng (controller tổng hợp), exitTime có phần dư, WriteDefaults, lặp.
 *   - Đích three.js (node giả có tên như GLB): vị trí (x,y,-z), quaternion từ euler ZXY đổi (-x,-y,z,w), m_IsActive → visible.
 *   - Rig chân dung: bố cục nghỉ của cả 55 prefab = lớp trong data/yarn.js (do UnityPy đọc từ bundle) sai < 0,001.
 *   - tools/anim.py chạy hai lần ra đúng từng byte và đúng tệp đang nằm trong repo; dung lượng data/animlib.js.
 * Phần B (Playwright, trang thật): bấm/phím thật mở hội thoại Mayor, chân dung chơi MayorAppear; ảnh ở 0, 0,25, 0,5 s và khi đã đứng yên;
 *   ghép cạnh ảnh gốc gog_02/gog_24 bằng D:/dredge-ref/notes/sbs.py; 844×390; nút/boat.glb thật chạy TrawlNet_Animator.
 *
 * Chạy:  node test/dredge-anim.js                  (tự dựng máy chủ tĩnh ở gốc repo; ảnh ở %TEMP%/dredge-anim)
 *        ANIM_NODE_ONLY=1 node test/dredge-anim.js (chỉ phần A)
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-anim.js
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'dredge');
const RIP = process.env.DREDGE_RIP || 'D:/dredge-ref/ripped/ExportedProject/Assets';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-anim');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

let pass = 0, fail = 0, skipped = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
function skip(name, why) { skipped++; out.push('  ○ BỎ QUA ' + name + '  — ' + why); }
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───────────────────────────────────────────────────────────────── bộ đọc YAML riêng cho AnimationClip
const nm = s => { s = s.trim(); return s === 'Infinity' ? Infinity : s === '-Infinity' ? -Infinity : Number(s); };
function vec(s) {
  const m = /\{x: (\S+), y: (\S+), z: (\S+)(?:, w: (\S+))?\}/.exec(s);
  return { x: nm(m[1]), y: nm(m[2]), z: nm(m[3]), w: m[4] === undefined ? undefined : nm(m[4]) };
}
const VEC_PROPS = { m_PositionCurves: 'm_LocalPosition', m_EulerCurves: 'localEulerAnglesRaw', m_ScaleCurves: 'm_LocalScale', m_RotationCurves: 'm_LocalRotation' };
function readYamlClip(name) {
  const L = fs.readFileSync(path.join(RIP, 'AnimationClip', name + '.anim'), 'utf8').split(/\r?\n/);
  const out_ = { curves: [], stop: null, loop: null, events: [] };
  let sec = null, cur = null, key = null, ev = null, m;
  for (const l of L) {
    if ((m = /^  (m_\w+):/.exec(l))) { sec = m[1]; cur = null; key = null; ev = null; continue; }
    if (sec === 'm_FloatCurves' || VEC_PROPS[sec]) {
      if (/^  - curve:/.test(l)) { cur = { sec, keys: [], attr: null, path: '' }; out_.curves.push(cur); key = null; continue; }
      if (!cur) continue;
      if ((m = /^        time: (\S+)$/.exec(l))) { key = { t: nm(m[1]) }; cur.keys.push(key); continue; }
      if (key && (m = /^        (value|inSlope|outSlope): (.+)$/.exec(l))) { key[m[1]] = m[2].charAt(0) === '{' ? vec(m[2]) : nm(m[2]); continue; }
      if ((m = /^    attribute: (.*)$/.exec(l))) { cur.attr = m[1]; continue; }
      if ((m = /^    path:\s?(.*)$/.exec(l))) { cur.path = m[1]; continue; }
    } else if (sec === 'm_Events') {
      if ((m = /^  - time: (\S+)$/.exec(l))) { ev = { t: nm(m[1]) }; out_.events.push(ev); continue; }
      if (ev && (m = /^    functionName: (.*)$/.exec(l))) { ev.fn = m[1]; continue; }
      if (ev && (m = /^    data: (.*)$/.exec(l))) { ev.data = m[1]; continue; }
    }
    if ((m = /^    m_StopTime: (\S+)$/.exec(l))) out_.stop = nm(m[1]);
    if ((m = /^    m_LoopTime: (\S+)$/.exec(l))) out_.loop = nm(m[1]);
  }
  // → phẳng theo (path, prop)
  const flat = [];
  for (const c of out_.curves) {
    if (c.sec === 'm_FloatCurves') flat.push({ path: c.path, prop: c.attr, keys: c.keys.map(k => [k.t, k.value, k.inSlope, k.outSlope]) });
    else for (const ax of (c.sec === 'm_RotationCurves' ? 'xyzw' : 'xyz')) {
      flat.push({ path: c.path, prop: VEC_PROPS[c.sec] + '.' + ax, keys: c.keys.map(k => [k.t, k.value[ax], k.inSlope[ax], k.outSlope[ax]]) });
    }
  }
  return { flat, stop: out_.stop, loop: out_.loop, events: out_.events };
}

// ───────────────────────────────────────────────────────────────── nạp thư viện vào vm
function loadLib(withYarn) {
  const ctx = {};
  ctx.window = ctx; ctx.console = console;
  vm.createContext(ctx);
  const run = f => vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), ctx, { filename: f });
  run('data/animlib.js'); run('js/anim.js');
  if (withYarn) run('data/yarn.js');
  return ctx;
}

// node giả của three.js: đủ cho ThreeTarget (name, children, userData, visible, position/quaternion/scale.set)
function mk(name, children) {
  const o = { isObject3D: true, name, children: children || [], userData: {}, visible: true,
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
  return o;
}

function partA() {
  const Z = loadLib(true);
  const A = Z.DRAnim, LIB = Z.DR_ANIM, YARN = Z.DR_YARN;
  const clips = LIB.clips, ctrls = LIB.controllers;

  // ---- số lượng (đo khi chạy tools/anim.py)
  check('animlib: 98 clip, 51 controller, 55 rig chân dung', Object.keys(clips).length === 98 && Object.keys(ctrls).length === 51 && Object.keys(LIB.rigs).length === 55,
    Object.keys(clips).length + ' / ' + Object.keys(ctrls).length + ' / ' + Object.keys(LIB.rigs).length);
  const sz = fs.statSync(path.join(GAME, 'data', 'animlib.js')).size;
  check('data/animlib.js dưới 1,5 MB (ngân sách thêm)', sz < 1.5 * 1024 * 1024, (sz / 1024).toFixed(0) + ' KB');

  // ---- đối chiếu TOÀN BỘ curve với YAML
  let yamlTotal = 0, matched = 0, wrong = [], libTotal = 0, evBad = [], lenBad = [];
  for (const name of Object.keys(clips).sort()) {
    const y = readYamlClip(name), c = clips[name];
    yamlTotal += y.flat.length; libTotal += c.curves.length;
    const idx = new Map(y.flat.map(f => [f.path + '#' + f.prop, f]));
    for (const cv of c.curves) {
      const f = idx.get(cv.path + '#' + cv.prop);
      let ok = !!f && f.keys.length === cv.keys.length;
      if (ok) for (let i = 0; i < f.keys.length && ok; i++) for (let j = 0; j < 4; j++) if (!(f.keys[i][j] === cv.keys[i][j])) { ok = false; break; }
      if (ok) matched++; else wrong.push(name + ' ' + cv.path + '|' + cv.prop);
    }
    if (!(y.stop === c.len) || y.loop !== c.loop) lenBad.push(name + ' ' + y.stop + '/' + c.len + ' loop ' + y.loop + '/' + c.loop);
    const ce = c.events || [];
    if (ce.length !== y.events.length || ce.some((e, i) => e.t !== y.events[i].t || e.fn !== y.events[i].fn)) evBad.push(name);
  }
  check('mọi curve của animlib khớp YAML từng số (t, giá trị, tiếp tuyến vào/ra)', wrong.length === 0 && matched === libTotal,
    matched + '/' + libTotal + ' curve khớp' + (wrong.length ? '; lệch: ' + wrong.slice(0, 3).join(', ') : ''));
  check('curve không vào animlib = 29 (27 khớp vật lý/Rigidbody + 2 trỏ vào Shipwright_Foreground đã bị xoá khỏi prefab)', yamlTotal - libTotal === 29, 'YAML ' + yamlTotal + ' − animlib ' + libTotal);
  check('độ dài clip (m_StopTime) và cờ lặp (m_LoopTime) khớp YAML cả 98 clip', lenBad.length === 0, lenBad.slice(0, 3).join(' | '));
  check('sự kiện clip (thời gian, tên hàm) khớp YAML cả 98 clip', evBad.length === 0, evBad.join(','));
  const infCount = (JSON.stringify(Object.values(clips)).match(/null/g) || []).length;   // Infinity → null trong JSON: số khoá bậc thang
  check('tiếp tuyến Infinity (bậc thang) được giữ nguyên: 15 chỗ', infCount === 15, 'JSON null = ' + infCount);
  check('giá trị lớp sprite: SpeakerButtonAttentionCalloutLoop m_Sprite = AlertIcon_0 (guid aa5f6678… trong Sprite/AlertIcon_0.asset.meta)',
    clips.SpeakerButtonAttentionCalloutLoop.sprites[0].keys[0][1] === 'AlertIcon_0' &&
    /guid: aa5f6678c05419b4791ffca74d22082c/.test(fs.readFileSync(path.join(RIP, 'Sprite', 'AlertIcon_0.asset.meta'), 'utf8')));

  // ---- Hermite
  const E = A.evalCurve;
  check('khoá tại đúng thời gian của nó: Mayor m_AnchoredPosition.x (0,16666667 → −46,35086; 0,5 → 8,00107; 0,9166667 → 18,796753)',
    A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', 0.16666667) === -46.35086 && A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', 0.5) === 8.00107 &&
    A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', 0.9166667) === 18.796753);
  // a,b,c,d dựng lại từ tiếp tuyến YAML: v0=8,00107 out 56,99511 · v1=18,796753 in −4,123097E−06 · dt=0,9166667−0,5
  const hs = (t0, v0, m0, t1, v1, m1, t) => { const dt = t1 - t0, s = (t - t0) / dt;
    const a = 2 * (v0 - v1) + (m0 + m1) * dt, b = -3 * (v0 - v1) - (2 * m0 + m1) * dt, c = m0 * dt; return ((a * s + b) * s + c) * s + v0; };
  const tm = 0.5 + (0.9166667 - 0.5) / 2;
  const got = A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', tm);
  check('Hermite điểm giữa đoạn 2 của Mayor.x = đa thức dựng từ YAML = 16,367407264724278 (số Python)',
    near(got, hs(0.5, 8.00107, 56.99511, 0.9166667, 18.796753, -4.123097E-06, tm), 1e-9) && near(got, 16.367407264724278, 1e-9), String(got));
  const tq = 0.16666667 + (0.5 - 0.16666667) / 4;
  check('Hermite 1/4 đoạn 1 của Mayor.x (tiếp tuyến ra 357,59573) = −21,986620439967503',
    near(A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', tq), -21.986620439967503, 1e-9), String(A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', tq)));
  check('Mayor_Background m_Color.a: 0,125 → 0,5 và 0,0625 → 0,15625 (smoothstep của hai khoá phẳng)',
    near(A.value('MayorAppear', 'Mayor_Background', 'm_Color.a', 0.125), 0.5) && near(A.value('MayorAppear', 'Mayor_Background', 'm_Color.a', 0.0625), 0.15625));
  check('ngoài khoảng khoá thì giữ giá trị đầu/cuối (m_PreInfinity = m_PostInfinity = 2)',
    A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', -3) === -46.35086 && A.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', 50) === 18.796753);
  check('clip TrawlDeploy dài 2,0 s, không lặp', clips.TrawlDeploy.len === 2 && clips.TrawlDeploy.loop === 0, String(clips.TrawlDeploy.len));
  check('TrawlDeploy: TrawlArm euler x tại 0 = 20 (độ), tại 0,3333333 = −32,49999053443329 (Hermite), tại 0,6666667 = −85',
    A.value('TrawlDeploy', 'TrawlArmature/TrawlArm', 'localEulerAnglesRaw.x', 0) === 20 &&
    near(A.value('TrawlDeploy', 'TrawlArmature/TrawlArm', 'localEulerAnglesRaw.x', 0.3333333), -32.49999053443329, 1e-9) &&
    A.value('TrawlDeploy', 'TrawlArmature/TrawlArm', 'localEulerAnglesRaw.x', 0.6666667) === -85);
  check('CrabPotBuoy_Place dài 2,5166667 s; BuoyMesh euler z tại 0,9333333 = 6,166433674999997',
    clips.CrabPotBuoy_Place.len === 2.5166667 && near(A.value('CrabPotBuoy_Place', 'BuoyMesh', 'localEulerAnglesRaw.z', 0.9333333), 6.166433674999997, 1e-9));
  const stepKeys = clips.Exit.curves.find(c => c.prop === 'm_IsActive').keys;
  check('m_IsActive của Exit là bậc thang: khoá 0 có tiếp tuyến ra Infinity; giá trị 1 tới 0,2499 rồi 0 tại 0,25',
    stepKeys[0][3] === Infinity && A.value('Exit', 'BannerUI', 'm_IsActive', 0.2499) === 1 && A.value('Exit', 'BannerUI', 'm_IsActive', 0.25) === 0);
  const loopV = A.value('SpeakerButtonAttentionCalloutLoop', '', 'm_SizeDelta.x', 1.0833334 + 0.0333333);
  check('clip lặp (SpeakerButtonAttentionCalloutLoop 1,0833334 s): t + một vòng cho cùng giá trị; không lặp (MayorAppear) thì kẹp ở cuối',
    near(loopV, A.value('SpeakerButtonAttentionCalloutLoop', '', 'm_SizeDelta.x', 0.0333333), 1e-6) && clips.SpeakerButtonAttentionCalloutLoop.loop === 1 &&
    A.sample('MayorAppear', 99).Mayor['m_AnchoredPosition.x'] === 18.796753);
  const smp = A.sample('TrawlDeploy', 1.25);
  check('DRAnim.sample trả {path:{prop:giá trị}}: NetMesh m_LocalPosition.y tại 1,25 = −1 (khoá có tiếp tuyến −0,26666656)',
    smp['TrawlArmature/TrawlArm/Net/NetMesh']['m_LocalPosition.y'] === -1 && smp['TrawlArmature/TrawlArm/Net/NetMesh']['m_LocalPosition.z'] === 0.3);

  // ---- máy trạng thái
  const st = p => p.state().name;
  let p = A.bind(null, 'TrawlNet_Animator', { auto: false });
  check('TrawlNet: bắt đầu ở Idle (layer 0), NetFixed (BrokenNet), Empty (NetFillAmount)', st(p) === 'Idle' && p.state(1).name === 'NetFixed' && p.state(2).name === 'Empty');
  p.update(0.016);
  check('chưa đặt isDeployed thì vẫn Idle', st(p) === 'Idle');
  p.set('isDeployed', true); p.update(0.016);
  check('isDeployed = true → Deploy', st(p) === 'Deploy', JSON.stringify(p.state()));
  p.update(1.9);
  check('đang Deploy ở 1,916 s (khung chuyển chạy trọn 0,016 s ở trạng thái mới, cộng 1,9): chưa hết 2,0 s', st(p) === 'Deploy' && near(p.state().t, 1.916, 1e-9), JSON.stringify(p.state()));
  p.update(0.2);
  check('qua 2,0 s (exitTime 1) → Deployed_Idle', st(p) === 'Deployed_Idle', JSON.stringify(p.state()));
  p.set('isDeployed', false); p.update(0.016);
  check('isDeployed = false → Retract (0,9166667 s) rồi về Idle', st(p) === 'Retract' && (p.update(1.0), st(p) === 'Idle'));
  p.set('isBroken', true); p.update(0.016);
  check('isBroken = true → layer BrokenNet sang NetBroken; false → NetFixed', p.state(1).name === 'NetBroken' && (p.set('isBroken', false), p.update(0.016), p.state(1).name === 'NetFixed'));
  const seq = [];
  p.set('fullness', 0.55);
  for (let i = 0; i < 12; i++) { p.update(1 / 60); seq.push(p.state(2).name); }
  check('fullness 0,55: layer NetFillAmount đi Empty→Trawl10→Trawl_20→…→Trawl_60 mỗi khung một bậc rồi dừng (Trawl_50→Trawl_60 khi > 0,5; Trawl_60→Trawl_70 cần > 0,6)',
    seq[0] === 'Trawl10' && seq[3] === 'Trawl_40' && seq[4] === 'Trawl_50' && seq[5] === 'Trawl_60' && seq[11] === 'Trawl_60', seq.join(' '));
  p.set('fullness', 0.95);
  for (let i = 0; i < 14; i++) p.update(1 / 60);
  check('fullness 0,95 → Full (> 0,9); hạ xuống 0,05 → từng bậc về Empty (< 0,01 chỉ ở Trawl10)', p.state(2).name === 'Full' &&
    (p.set('fullness', 0.0), (() => { for (let i = 0; i < 20; i++) p.update(1 / 60); return p.state(2).name === 'Empty'; })()));
  let cnt = 0;
  for (const ly of [{ states: ctrls.TrawlNet_Animator.states, transitions: ctrls.TrawlNet_Animator.transitions }].concat(ctrls.TrawlNet_Animator.layers)) for (const t of ly.transitions) cnt += t.cond.length;
  check('TrawlNet_Animator: 24 điều kiện (m_ConditionMode) như trong YAML; 3 layer; SalvageNet_Animator cũng 3 layer', cnt === 24 && ctrls.TrawlNet_Animator.layers.length === 2 && ctrls.SalvageNet_Animator.layers.length === 2,
    String(cnt));
  check('trawl: 17 clip khác nhau mỗi lưới (TrawlNet 17, SalvageNet 17), Net_xx = 11 tư thế', (() => {
    const names = c => { const s = new Set(); for (const ly of [c].concat(c.layers || [])) for (const v of Object.values(ly.states)) if (v.clip) s.add(v.clip); return s; };
    return names(ctrls.TrawlNet_Animator).size === 17 && names(ctrls.SalvageNet_Animator).size === 17;
  })());

  p = A.bind(null, 'Bait_Animator', { auto: false });
  p.trigger('deploy');
  check('Bait: trigger deploy → CrabPotBuoy_Place, trigger bị tiêu thụ', (p.update(0), st(p) === 'CrabPotBuoy_Place' && p.get('deploy') === false), JSON.stringify(p.state()));
  p.update(2.49);
  check('Bait_Place dài 2,5 s: ở 2,49 s vẫn Place; qua 2,5 → Idle', st(p) === 'CrabPotBuoy_Place' && (p.update(0.05), st(p) === 'Idle'));
  p = A.bind(null, 'FlotsamPotBuoy_Animator', { auto: false });
  check('FlotsamPotBuoy_Animator (override) dùng clip thay: Idle=FlotsamPotBuoy_Idle, Place=FlotsamPotBuoy_Place', p.state().clip === 'FlotsamPotBuoy_Idle' && (p.trigger('deploy'), p.update(0), p.state().clip === 'FlotsamPotBuoy_Place'));

  let evs = [];
  p = A.bind(null, 'BannerAnimator', { auto: false, onEvent: e => evs.push(e.fn + '@' + e.t + ':' + e.clip) });
  check('Banner: Idle; showing = true → Enter (0,33 s); false → Exit', st(p) === 'Idle' && (p.set('showing', true), p.update(0), st(p) === 'Enter') && (p.update(0.5), p.set('showing', false), p.update(0), st(p) === 'Exit'));
  p.update(0.3);
  check('Exit phát sự kiện OnHideCompleteEventFired tại 0,25 s đúng một lần', evs.filter(x => /OnHideCompleteEventFired@0.25:Exit/.test(x)).length === 1, evs.join(' '));
  evs = [];
  p = A.bind(null, 'LoadingScreenAnimator', { auto: false, onEvent: e => evs.push(e.fn + '@' + e.t) });
  p.trigger('show'); p.update(0.1);
  const t1 = p.state().t;
  p.trigger('show'); p.update(0.1);
  check('LoadingScreen: show từ any-state → LoadingScreenShow; show lần nữa không khởi động lại (CanTransitionToSelf = 0)', st(p) === 'LoadingScreenShow' && p.state().t > t1 + 0.09, JSON.stringify(p.state()));
  p.update(0.4);
  check('sự kiện OnLoadingScreenAnimationComplete tại 0,5 s', evs.length === 1 && evs[0] === 'OnLoadingScreenAnimationComplete@0.5', evs.join(','));
  p.trigger('hide'); p.update(0.1);
  check('hide → LoadingScreenHide', st(p) === 'LoadingScreenHide');
  p = A.bind(null, 'ResearchNotchAnimator', { auto: false });
  check('ResearchNotch: IdleEmpty; fill → Fill (0,5 s) rồi IdleFull (exitTime 1)', st(p) === 'IdleEmpty' && (p.trigger('fill'), p.update(0.01), st(p) === 'Fill') && (p.update(0.6), st(p) === 'IdleFull'));
  p = A.bind(null, 'HasteBarAnimator', { auto: false });
  check('HasteBar: explode → Explode (0,46667 s) rồi Idle', (p.trigger('explode'), p.update(0.01), st(p) === 'Explode') && (p.update(0.5), st(p) === 'Idle'));
  p = A.bind(null, 'SpyglassUIAnimator', { auto: false });
  check('SpyglassUI: mở đầu SpyglassUIShow → SpyglassUIIdle sau 0,1167 s; showing=false → Hide', st(p) === 'SpyglassUIShow' && (p.update(0.2), st(p) === 'SpyglassUIIdle') && (p.set('showing', true), p.set('showing', false), p.update(0), st(p) === 'SpyglassUIHide'));
  check('UnseenCabinItem: NewUnseenCabinItem → Loop (vòng lặp, exitTime 1)', (p = A.bind(null, 'UnseenCabinItemAnimator', { auto: false }), st(p) === 'NewUnseenCabinItem') && (p.update(2), st(p) === 'Loop'));

  // ---- đứng yên: clip không lặp chạy hết thì người chạy dừng (không tốn gì mỗi khung) cho tới khi có tham số mới
  p = A.bind(null, 'MayorAnimator', { auto: false });
  p.update(0.5);
  const midIdle = p.idle;
  p.update(1.0);
  const tEnd = p.state().t;
  p.update(5.0);
  check('MayorAppear (0,9167 s, không chuyển trạng thái): đang chạy thì chưa idle; hết clip thì idle và update tiếp không đổi gì (t giữ nguyên)',
    midIdle === false && p.idle === true && p.state().t === tEnd && near(tEnd, 1.5, 1e-9), 'idle ' + p.idle + ' t ' + tEnd);
  p = A.bind(null, 'Bait_Animator', { auto: false });
  p.update(0.1);
  const bi = p.idle;
  p.trigger('deploy');
  const wakes = p.idle === false;
  p.update(0);
  p.update(2.6);
  check('Bait: Idle (clip dài 0 s, không exitTime) là idle; trigger đánh thức; Place chạy hết rồi về Idle và idle lại', bi === true && wakes && st(p) === 'Idle' && p.idle === true, JSON.stringify(p.state()));
  p = A.bind(null, 'UnseenCabinItemAnimator', { auto: false });
  p.update(5);
  check('clip lặp (UnseenCabinItem, 2 s) không bao giờ idle', p.idle === false && st(p) === 'Loop');
  p = A.bind(null, 'SpyglassUIAnimator', { auto: false });
  p.update(0.5);
  check('SpyglassUIIdle là clip "lặp" dài 0 s (tư thế tĩnh): hết SpyglassUIShow rồi idle', clips.SpyglassUIIdle.loop === 1 && clips.SpyglassUIIdle.len === 0 && st(p) === 'SpyglassUIIdle' && p.idle === true);
  check('mọi clip đều có mảng events (theo lược đồ của brief), kể cả rỗng', Object.values(clips).every(c => Array.isArray(c.events)));

  // ---- clip/controller tổng hợp: chéo mờ, exitTime có dư, WriteDefaults, lặp, sự kiện
  const rec = {}; const sink = (extra) => Object.assign({ set(path, prop, v) { rec[prop] = v; }, rest(path, prop) { return prop === 'y' ? 7 : undefined; } }, extra);
  A.addClip('T_A', { len: 1, loop: 0, curves: [{ path: 'n', prop: 'x', keys: [[0, 0, 0, 0]] }, { path: 'n', prop: 'y', keys: [[0, 1, 0, 0]] }] });
  A.addClip('T_B', { len: 1, loop: 1, curves: [{ path: 'n', prop: 'x', keys: [[0, 10, 0, 0]] }], events: [{ t: 0.5, fn: 'Half' }, { t: 1, fn: 'End' }] });
  A.addController('T_X', { params: [['go', 'trigger', 0], ['f', 'float', 0]], default: 'A', states: { A: { clip: 'T_A', speed: 1 }, B: { clip: 'T_B', speed: 1 } },
    transitions: [{ from: 'A', to: 'B', cond: [['go', 'if']], dur: 0.5, exitTime: null }] });
  for (const k in rec) delete rec[k];
  let ev2 = [];
  p = A.bind(sink(), 'T_X', { auto: false, onEvent: e => ev2.push(e.fn) });
  p.update(0.1);
  check('chéo mờ: trước khi chuyển x = 0', rec.x === 0 && rec.y === 1);
  p.trigger('go'); p.update(0.25);
  check('chéo mờ 0,5 s: sau 0,25 s x = 5 (tuyến tính 0 → 10), cả hai trạng thái cùng chạy', p.state().next === 'B' && near(rec.x, 5, 1e-9), JSON.stringify(rec));
  p.update(0.25);
  check('hết 0,5 s: sang B, x = 10; y (clip B không đụng, wd mặc định) về giá trị nghỉ 7 của đích', st(p) === 'B' && rec.x === 10 && rec.y === 7, JSON.stringify(rec) + ' ' + st(p));
  p.update(2.0);
  check('B lặp, sự kiện Half (0,5) và End (1) phát mỗi vòng (3 vòng tính từ khi vào B)', ev2.filter(x => x === 'Half').length >= 2 && ev2.filter(x => x === 'End').length >= 2, ev2.join(','));
  A.addController('T_Y', { params: [['go', 'trigger', 0]], default: 'A', states: { A: { clip: 'T_A', speed: 1, wd: 0 }, B: { clip: 'T_B', speed: 1, wd: 0 } },
    transitions: [{ from: 'A', to: 'B', cond: [], dur: 0, exitTime: 1 }] });
  for (const k in rec) delete rec[k];
  p = A.bind(sink(), 'T_Y', { auto: false, onEvent: e => ev2.push('Y' + e.fn) });
  p.update(1.2);
  check('exitTime = 1 không điều kiện: sang B lúc hết 1 s, phần dư 0,2 s chạy ở B (t = 0,2); wd = 0 thì y không bị ghi đè', st(p) === 'B' && near(p.state().t, 0.2, 1e-9) && rec.x === 10, JSON.stringify(p.state()));
  A.addController('T_Z', { params: [], default: 'A', states: { A: { clip: 'T_A', speed: 1 }, B: { clip: 'T_B', speed: 1 } },
    transitions: [{ from: 'A', to: 'B', cond: [], dur: 0.5, exitTime: 1, fixed: 0 }] });
  p = A.bind(sink(), 'T_Z', { auto: false });
  p.update(1.0);
  check('thời lượng chuẩn hoá (fixed = 0): 0,5 × độ dài clip nguồn (1 s) = 0,5 s; chéo xong sau 0,5 s', p.state().next === 'B' && (p.update(0.49), p.state().next === 'B') && (p.update(0.02), st(p) === 'B' && p.state().next === null));
  let thrown = '';
  try { A.bind(null, 'T_X', { auto: false }).set('nope', 1); } catch (e) { thrown = e.message; }
  check('tham số lạ báo lỗi mô tả trạng thái hỏng', /animator parameter not found: nope/.test(thrown), thrown);
  thrown = '';
  try { A.bind(null, 'KhongCo'); } catch (e) { thrown = e.message; }
  check('controller không có báo lỗi', /animator controller not found: KhongCo/.test(thrown), thrown);

  // ---- đích three.js (node giả, tên như GLB)
  const NetMesh = mk('NetMesh', [mk('NetL'), mk('NetR'), mk('Mesh', [mk('Fish'), mk('NetTrailParticles')])]);
  const arm = mk('TrawlArm', [mk('Net', [NetMesh])]);
  const trawl = mk('TrawlNet', [mk('TrawlArmature', [arm])]);
  const floats = [];
  p = A.bind(trawl, 'TrawlNet_Animator', { auto: false, onFloat: (pa, pr, v) => floats.push(pr) });
  p.set('isDeployed', true); p.update(0.016); p.seek(1.25);
  check('three: NetMesh tại 1,25 s của Deploy = (0, −1, −0,3) (YAML y = −1, z = 0,3; z đổi dấu sang hệ phải)', near(NetMesh.position.x, 0) && near(NetMesh.position.y, -1) && near(NetMesh.position.z, -0.3), JSON.stringify(NetMesh.position));
  p.seek(0.6666667);
  const q = arm.quaternion, ha = -85 * Math.PI / 180 / 2;   // xoay quanh x một góc −85°: (sin(a/2), 0, 0, cos(a/2)) rồi (−x,−y,z,w)
  check('three: TrawlArm euler (−85°, 0, 0) → quaternion (−sin(−42,5°), 0, 0, cos(42,5°))', near(q.x, -Math.sin(ha), 1e-6) && near(q.y, 0, 1e-9) && near(q.z, 0, 1e-9) && near(q.w, Math.cos(ha), 1e-6), JSON.stringify(q));
  check('three: path thiếu node (DestroyedParticles không có trong cây giả) được ghi nhận, không ném lỗi', p.missing.indexOf('TrawlArmature/TrawlArm/Net/NetMesh/DestroyedParticles') >= 0, p.missing.join(','));
  p.set('isBroken', true); p.update(0.016);
  check('three: NetBroken tắt Mesh (m_IsActive 0 → visible = false) và chạy rung TrawlArmature', NetMesh.children[2].visible === false && (p.update(0.06), NetMesh.children[2].visible === false));
  p.set('isBroken', false); p.update(0.016);
  check('three: NetFixed bật lại Mesh (m_IsActive 1)', NetMesh.children[2].visible === true);
  p = A.bind(trawl, 'TrawlNet_Animator', { auto: false, unity: false, onFloat: () => {} });
  p.set('isDeployed', true); p.update(0.016); p.seek(1.25);
  check('three: unity = false giữ nguyên dấu z (0, −1, +0,3)', near(NetMesh.position.z, 0.3));
  const e1 = A.eulerToQuat(30, 40, 50), e2 = A.quatToEuler(e1);
  check('euler ZXY ↔ quaternion hai chiều (30, 40, 50)', near(e2[0], 30, 1e-9) && near(e2[1], 40, 1e-9) && near(e2[2], 50, 1e-9), e2.join(','));

  // ---- rig chân dung
  let maxd = 0, nlayers = 0, miss = [];
  for (const pf of Object.keys(YARN.portraits)) {
    const boxes = A.restBoxes(LIB.rigs[pf].nodes), free = boxes.slice();
    for (const L of YARN.portraits[pf]) {
      const cand = free.filter(b => b.img === L.src);
      if (!cand.length) { miss.push(pf + ' ' + L.src); continue; }
      cand.sort((a, b) => (Math.abs(a.x - L.x) + Math.abs(a.y - L.y)) - (Math.abs(b.x - L.x) + Math.abs(b.y - L.y)));
      const b = cand[0]; free.splice(free.indexOf(b), 1); nlayers++;
      maxd = Math.max(maxd, Math.abs(b.x - L.x), Math.abs(b.y - L.y), Math.abs(b.w - L.w), Math.abs(b.h - L.h));
    }
  }
  check('rig: bố cục nghỉ của 55 prefab khớp 131 lớp của data/yarn.js (UnityPy từ bundle) sai < 0,001 canvas px', miss.length === 0 && nlayers === 131 && maxd < 0.001, nlayers + ' lớp, lệch lớn nhất ' + maxd.toFixed(5) + (miss.length ? '; thiếu ' + miss.slice(0, 2).join(',') : ''));
  const every = Object.keys(LIB.rigs).every(pf => { const c = ctrls[LIB.rigs[pf].ctrl]; return !!c; });
  check('mỗi rig trỏ tới controller có trong animlib', every);
  // Image.preserveAspect: đếm bằng cách quét YAML prefab (không dùng tools/anim.py): 161 Image bật, 6 tắt; rig có đúng 161 nút pa = 1
  let yPa1 = 0, yPa0 = 0;
  for (const pf of Object.keys(LIB.rigs)) {
    const txt = fs.readFileSync(path.join(RIP, 'GameObject', pf + '.prefab'), 'utf8');
    for (const blk of txt.split(/^--- !u!/m).slice(1)) {
      if (blk.startsWith('114 ') && blk.includes('m_Script: {fileID: -765806418, guid: d3e719b59ab71ba3f6b398058c866280')) {
        if (/m_PreserveAspect: 1/.test(blk)) yPa1++; else yPa0++;
      }
    }
  }
  const rigPa = Object.values(LIB.rigs).reduce((s, r) => s + r.nodes.filter(n => n.pa === 1).length, 0);
  const artPa = Object.values(LIB.rigs).reduce((s, r) => s + r.nodes.filter(n => n.img && n.pa === 1).length, 0);
  const artNo = Object.values(LIB.rigs).reduce((s, r) => s + r.nodes.filter(n => n.img && !n.pa).length, 0);
  check('preserveAspect: rig có 161 nút pa = 1 đúng bằng 161 Image bật cờ trong YAML (6 Image tắt cờ); lớp có ảnh: 125 giữ tỉ lệ, 6 kéo giãn (Book, CollectorReveal)',
    yPa1 === 161 && yPa0 === 6 && rigPa === 161 && artPa === 125 && artNo === 6, 'YAML ' + yPa1 + '/' + yPa0 + ', rig ' + rigPa + ', lớp ảnh ' + artPa + '/' + artNo);
  const rect = A.restBoxes(LIB.rigs.Scientist_2.nodes).find(b => b.path === 'Scientist');
  check('Scientist_2: hộp RectTransform 663,9 × 745,9 nhưng sprite webp 388 × 746 → vẽ vừa khít ra 388 px rộng (không kéo giãn 1,71 lần như bản phẳng cũ)',
    near(rect.w, 663.9, 0.1) && near(rect.h, 745.9, 0.1) && LIB.rigs.Scientist_2.nodes.find(n => n.n === 'Scientist').pa === 1);

  // ---- rig + animator không cần DOM: MayorAppear
  const h = A.rig('Mayor', null);
  p = A.bind(h, 'MayorAnimator', { auto: false });
  const byP = n => h.byPath.get(n);
  check('Mayor: lúc t = 0 cả hai lớp trong suốt (m_Color 0,0,0,0 từ khoá đầu) và Mayor nằm ở x = −46,35086', byP('Mayor_Background').cur.col.join() === '0,0,0,0' && byP('Mayor').cur.col[3] === 0 && byP('Mayor').cur.ap[0] === -46.35086);
  p.seek(0.5);
  check('Mayor ở 0,5 s: ap.x = 8,00107; trục pivot trong thế giới x = 8,00107 (cha scale 1); nền đã hiện hết alpha 1', byP('Mayor').cur.ap[0] === 8.00107 && near(byP('Mayor').m[4], 8.00107) && byP('Mayor_Background').cur.col[3] === 1);
  p.seek(0.125);
  check('Mayor_Background ở 0,125 s: màu (0,5, 0,5, 0,5, 0,5)', byP('Mayor_Background').cur.col.every(v => near(v, 0.5)));
  p.seek(99);
  check('hết clip: ap.x = 18,796753 (= vị trí prefab 18,79675), alpha 1', near(byP('Mayor').cur.ap[0], 18.796753) && byP('Mayor').cur.col.join() === '1,1,1,1');
  const hb = A.rig('Shipwright', null), ps = A.bind(hb, 'ShipwrightAnimator', { auto: false });
  ps.seek(0.1);
  check('Shipwright: curve của nút đã xoá Shipwright_Foreground không còn; các nút thật vẫn chạy', !hb.byPath.has('Shipwright_Foreground') && clips.ShipwrightAppear.curves.every(c => c.path !== 'Shipwright_Foreground' && !/^path_0x/.test(c.path)));
  const hs7 = A.rig('Scientist_7', null), p7 = A.bind(hs7, 'Scientist7Animator', { auto: false });
  p7.seek(0.5);
  check('Scientist_7 (euler + scale + m_IsActive): Scientist_Kneeling bật, Scientist tắt lúc 0,5 s; sau 0,95 s đảo lại',
    hs7.byPath.get('Scientist_Kneeling').cur.on === 1 && hs7.byPath.get('Scientist').cur.on === 0 && (p7.seek(0.95), hs7.byPath.get('Scientist').cur.on === 1 && hs7.byPath.get('Scientist_Kneeling').cur.on === 0));

  // ---- tools/anim.py chạy lại: đúng từng byte
  const tool = path.join(GAME, 'tools', 'anim.py');
  const tmp1 = path.join(SHOTS, 'animlib-run1.js'), tmp2 = path.join(SHOTS, 'animlib-run2.js');
  const py = cmd => cp.spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 120000 });
  const r1 = py('python -I "' + tool + '" --out "' + tmp1 + '"');
  if (r1.status !== 0 || !fs.existsSync(tmp1)) skip('tools/anim.py chạy lại ra đúng từng byte', 'không chạy được python/tool: ' + String(r1.stderr || r1.error || '').slice(0, 200));
  else {
    const r2 = py('python -I "' + tool + '" --out "' + tmp2 + '"');
    const a = fs.readFileSync(tmp1), b = fs.readFileSync(tmp2), c0 = fs.readFileSync(path.join(GAME, 'data', 'animlib.js'));
    check('tools/anim.py chạy hai lần ra đúng từng byte, và trùng data/animlib.js trong repo', r2.status === 0 && a.equals(b) && a.equals(c0), a.length + ' B / ' + b.length + ' B / ' + c0.length + ' B');
  }
}

// ───────────────────────────────────────────────────────────────── phần B: trình duyệt
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function partB() {
  const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
  const { chromium } = require(PW);
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try { await browserRun(browser, base); } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ ở phần B: ' + (e && e.stack || e)); }
  await browser.close();
  if (srv) srv.close();
}

async function browserRun(browser, base) {
  const W = 1920, H = 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const ev = (f, a) => page.evaluate(f, a);
  const shot = name => page.screenshot({ path: path.join(SHOTS, name + '.png') });

  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  check('trang nạp data/animlib.js và js/anim.js: DRAnim + DR_ANIM có mặt', await ev(() => !!window.DRAnim && !!window.DR_ANIM && Object.keys(DR_ANIM.rigs).length === 55));

  // ---- boat.glb thật: TrawlNet_Animator chạy trên cây node thật của thuyền (đích three.js, tên node như animlib)
  const tn = await ev(() => {
    let node = null;
    DRBoat.root.traverse(o => { if (!node && o.name === 'TrawlNet') node = o; });
    if (!node) return null;
    const p = DRAnim.bind(node, 'TrawlNet_Animator', { auto: false, onFloat: () => {} });
    p.set('isDeployed', true); p.update(0.016); p.seek(1.25);
    const nm = (function f(o, parts) { let c = o; for (const s of parts) { c = c.children.find(x => x.name === s); if (!c) return null; } return c; })(node, ['TrawlArmature', 'TrawlArm', 'Net', 'NetMesh']);
    return { missing: p.missing, pos: nm && [nm.position.x, nm.position.y, nm.position.z] };
  });
  check('boat.glb: bind TrawlNet_Animator vào node TrawlNet thật; NetMesh ở 1,25 s của Deploy = (0, −1, −0,3); các path khác đều tìm thấy trừ hạt/mảnh vỡ chưa có trong GLB',
    !!tn && tn.pos && Math.abs(tn.pos[1] + 1) < 1e-6 && Math.abs(tn.pos[2] + 0.3) < 1e-6, JSON.stringify(tn));
  out.push('  · path của clip Trawl không có trong boat.glb (chủ lượt sau cần biết): ' + (tn && tn.missing && tn.missing.length ? tn.missing.join(' | ') : 'không có'));

  // ---- ván mới → màn mở đầu → hội thoại Mayor (phím thật)
  await page.click('#btn-new');
  await page.waitForFunction(() => window.DRIntro && DRIntro.stage === 'illustrated', null, { timeout: 5000 }).catch(() => {});
  await sleep(3000);
  await page.keyboard.down('Space'); await sleep(2400); await page.keyboard.up('Space');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 15000 }).catch(() => {});
  check('hội thoại mở sau khi bỏ qua màn mở đầu bằng phím Space thật', await ev(() => DRDialogue.isOpen()));
  // ghi mỗi khung: thời gian đồng hồ, opacity và transform của hai lớp Mayor, thời gian trong clip của người chạy
  await ev(() => {
    window.__rec = [];
    const f = () => {
      const q = window.DRDialogue && DRDialogue.portrait && DRDialogue.portrait();
      const wrap = document.querySelector('#dr-dlg .dlg-pf.rig');
      if (q && wrap) {
        const im = wrap.querySelector('img[data-an="Mayor"]'), bg = wrap.querySelector('img[data-an="Mayor_Background"]');
        if (im && bg) __rec.push({ w: performance.now(), t: q.player.state().t, op: +getComputedStyle(im).opacity, bgop: +getComputedStyle(bg).opacity, tf: getComputedStyle(im).transform });
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  // Space đẩy từng dòng cho tới khi Mayor nói (portrait prefab Mayor)
  let tries = 0;
  while (tries++ < 40) {
    const s = await ev(() => DRDialogue.state());
    if (s && s.prefab === 'Mayor') break;
    await page.keyboard.press('Space');
    await sleep(700);
  }
  const first = await ev(() => DRDialogue.state());
  check('Mayor hiện: chân dung prefab Mayor (lần đầu hiện cùng dòng dẫn truyện nên chưa có bảng tên)', !!first && first.prefab === 'Mayor', JSON.stringify(first && { prefab: first.prefab, name: first.name }));
  await sleep(1400);
  const rec = await ev(() => window.__rec.filter(r => r.t < 5));
  // t dừng lại khi clip hết (người chạy idle); chỉ so đồng hồ với t trên đoạn t còn đổi, tới khung đầu tiên đạt t cuối
  const tFin = rec.length ? rec[rec.length - 1].t : -1;
  const iFin = rec.findIndex(r => r.t === tFin);
  const run = rec.slice(0, iFin + 1);
  const dClip = run.length ? run[run.length - 1].t - run[0].t : -1, dWall = run.length ? (run[run.length - 1].w - run[0].w) / 1000 : -1;
  check('chân dung chơi MayorAppear bằng đồng hồ thật: t tăng đơn điệu từ ~0 tới t cuối ∈ [0,9166 ; 0,95] rồi đứng yên; trên đoạn còn chạy lệch đồng hồ < 0,25 s',
    run.length > 20 && run[0].t < 0.12 && tFin >= 0.9166 && tFin <= 0.95 && Math.abs(dClip - dWall) < 0.25 && rec.every((r, i) => i === 0 || r.t >= rec[i - 1].t) && rec.slice(iFin).every(r => r.t === tFin),
    run.length + ' khung chạy / ' + rec.length + ', t ' + (rec[0] && rec[0].t.toFixed(3)) + ' → ' + tFin.toFixed(3) + ', dClip ' + dClip.toFixed(3) + ' dWall ' + dWall.toFixed(3));
  check('chân dung đã hiện xong thì bộ chạy tự động dừng hẳn: DRAnim.live() rỗng, player.idle = true', await ev(() => DRAnim.live().length === 0 && DRDialogue.portrait().player.idle === true));
  // opacity theo từng khung phải khớp đường cong tại thời gian clip của chính khung đó (khung ghi sau khi người chạy cập nhật hay trước đều lệch ≤ 1 khung)
  const lib = await ev(() => ({ a: DR_ANIM.clips.MayorAppear.curves.filter(c => c.path === 'Mayor' && c.prop === 'm_Color.a')[0].keys, bg: DR_ANIM.clips.MayorAppear.curves.filter(c => c.path === 'Mayor_Background' && c.prop === 'm_Color.a')[0].keys }));
  const Alib = loadLib(false).DRAnim;
  let worst = 0;
  for (const r of rec) { const e = Alib.evalCurve(lib.a, r.t), eb = Alib.evalCurve(lib.bg, r.t); worst = Math.max(worst, Math.abs(r.op - e), Math.abs(r.bgop - eb)); }
  check('opacity thực của hai lớp ≈ đường cong YAML tại thời gian clip của khung đó (sai ≤ 0,12: lệch một khung giữa hai bộ chạy)', worst <= 0.12, 'lệch lớn nhất ' + worst.toFixed(4));
  check('lớp Mayor trượt từ trái sang: transform đổi theo thời gian (khung đầu ≠ khung cuối)', rec.length > 2 && rec[0].tf !== rec[rec.length - 1].tf, (rec[0] || {}).tf + ' → ' + (rec[rec.length - 1] || {}).tf);

  // ---- ảnh ở 0, 0,25, 0,5 s và khi đứng yên (đóng băng bộ chạy tự động, tua bằng seek: cùng một ảnh mỗi lần chạy)
  await ev(() => { DRAnim.paused = true; });
  const stills = {};
  for (const t of [0, 0.25, 0.5, 5]) {
    const r = await ev(tt => {
      const q = DRDialogue.portrait();
      q.player.seek(tt);
      const wrap = document.querySelector('#dr-dlg .dlg-pf.rig');
      const bg = wrap.querySelector('img[data-an="Mayor_Background"]'), im = wrap.querySelector('img[data-an="Mayor"]');
      const mm = new DOMMatrixReadOnly(getComputedStyle(im).transform);
      return { bg: +getComputedStyle(bg).opacity, bgf: getComputedStyle(bg).filter, op: +getComputedStyle(im).opacity, f: getComputedStyle(im).filter, e: mm.e, f_: mm.f, a: mm.a };
    }, t);
    stills[t] = r;
    await shot('mayor-appear-' + String(t).replace('.', '_'));
  }
  const Ae = Alib.value('MayorAppear', 'Mayor', 'm_AnchoredPosition.x', 0.5);
  check('t = 0: cả hai lớp trong suốt (opacity 0) — đúng khoá đầu m_Color 0,0,0,0', stills[0].bg === 0 && stills[0].op === 0, JSON.stringify(stills[0]));
  check('t = 0,25: nền hiện hết (opacity 1, màu 1,1,1); lớp Mayor đang hiện dở (0 < opacity < 1, sáng chưa hết)', stills[0.25].bg === 1 && stills[0.25].op > 0 && stills[0.25].op < 1, JSON.stringify(stills[0.25]));
  check('t = 0,5: Mayor ap.x = 8,00107 → tịnh tiến ngang tăng dần theo thời gian; opacity > ở 0,25',
    stills[0.5].e > stills[0.25].e && stills[0.25].e > stills[0].e && stills[0.5].op > stills[0.25].op, [stills[0].e, stills[0.25].e, stills[0.5].e, stills[5].e].map(v => v.toFixed(2)).join(' → ') + ' (ap.x = ' + Ae + ')');
  check('khi đứng yên (t ≥ 0,9167): opacity 1, không còn bộ lọc sáng/tối (brightness) nào, ma trận về vị trí prefab', stills[5].op === 1 && stills[5].bg === 1 && !/brightness/.test(stills[5].f), JSON.stringify(stills[5]));
  await ev(() => { DRDialogue.portrait().player.seek(5); });
  await sleep(200);
  await page.screenshot({ path: path.join(SHOTS, 'mayor-settled-1920.png') });

  // ---- 844×390 (điện thoại ngang): chân dung đứng yên, hộp trong màn
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  const box = await ev(() => { const r = document.querySelector('#dr-dlg .dlg-pf.rig img[data-an="Mayor"]').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
  check('844×390: lớp Mayor có kích thước dương và nằm trong màn theo chiều ngang', box.w > 50 && box.h > 50 && box.l >= -box.w * 0.3 && box.l + box.w <= box.vw + box.w * 0.3, JSON.stringify(box));
  await shot('mayor-settled-844x390');
  await page.setViewportSize({ width: W, height: H });
  await sleep(400);

  // ---- ghép với ảnh gốc: người của gog_24 là Scientist, gog_02 là Collector
  const fit = await ev(() => Array.from(document.querySelectorAll('#dr-dlg .dlg-pf.rig img.an-i')).map(i => getComputedStyle(i).objectFit + ' ' + getComputedStyle(i).objectPosition));
  check('lớp Mayor giữ tỉ lệ sprite: object-fit contain, object-position 50% 50% theo pivot (0,5; 0,5)', fit.length === 2 && fit.every(f => f === 'contain 50% 50%'), fit.join(' | '));
  // rig dùng phần tử có sẵn (opts.adopt) cho giao diện của chủ khác: nút Box ở (10, 20), cỡ 100×50, pivot giữa; clip tự đăng ký: m_AnchoredPosition.x chạy 0 → 100 tuyến tính, m_Alpha 1 → 0
  const ad = await ev(() => {
    const c = document.createElement('div'); document.body.appendChild(c);
    const el = document.createElement('div'); el.id = 'adopt-box';
    DRAnim.addClip('T_Adopt', { len: 1, loop: 0, curves: [
      { path: 'Box', prop: 'm_AnchoredPosition.x', cls: 224, keys: [[0, 0, 0, 100], [1, 100, 100, 0]] },
      { path: 'Box', prop: 'm_Alpha', cls: 225, keys: [[0, 1, 0, -1], [1, 0, -1, 0]] }] });
    DRAnim.addController('T_Adopt', { params: [], default: 'S', states: { S: { clip: 'T_Adopt', speed: 1 } }, transitions: [] });
    const nodes = [{ n: 'Root', p: -1, ap: [0, 0], sd: [0, 0], an: [0, 0, 0, 0], pv: [0, 0], sc: [1, 1], rz: 0 },
      { n: 'Box', p: 0, ap: [10, 20], sd: [100, 50], an: [0.5, 0.5, 0.5, 0.5], pv: [0.5, 0.5], sc: [1, 1], rz: 0, cg: 1 }];
    const h = DRAnim.rig(nodes, c, { adopt: n => (n.path === 'Box' ? el : null) });
    const p = DRAnim.bind(h, 'T_Adopt', { auto: false });
    p.seek(0.5);
    const cs = getComputedStyle(el);
    const r = { tf: cs.transform, op: cs.opacity, w: cs.width, h: cs.height, pos: cs.position, an: el.dataset.an, parent: el.parentNode === c };
    h.destroy(); c.remove();
    return r;
  });
  check('rig + opts.adopt: phần tử có sẵn nhận hộp 100×50, ma trận tịnh tiến (0, −45) [pivot x = 50, y = 20 → mép trái 0, mép trên −(20+25)] và opacity 0,5 ở t = 0,5',
    ad.w === '100px' && ad.h === '50px' && ad.op === '0.5' && ad.tf === 'matrix(1, 0, 0, 1, 0, -45)' && ad.pos === 'absolute' && ad.an === 'Box' && ad.parent, JSON.stringify(ad));
  // ghép với ảnh gốc: gog_24 = Scientist đứng cạnh bảng (prefab Scientist_2: Board + Crack1 + Scientist), gog_02 = người trong khung cửa (CollectorUnknown)
  await ev(() => { DRAnim.paused = false; });
  const pairs = [['Scientist_2', 'gog_24'], ['CollectorUnknown', 'gog_02']];
  const py = (a) => cp.spawnSync('python', ['-I'].concat(a), { shell: true, encoding: 'utf8' });
  for (const [pf, real] of pairs) {
    const sp = await ev(name => DRDialogue.debugPortrait(name), pf);
    await ev(() => { DRAnim.paused = true; DRDialogue.portrait().player.seek(5); });
    await sleep(500);
    const f = path.join(SHOTS, 'portrait-' + pf + '-settled.png');
    await page.screenshot({ path: f });
    const sbsPy = 'D:/dredge-ref/notes/sbs.py', realJpg = 'D:/dredge-ref/shots-real/' + real + '.jpg', o = path.join(SHOTS, 'sbs-' + pf + '-' + real + '.png');
    if (!fs.existsSync(sbsPy) || !fs.existsSync(realJpg)) { skip('sbs ' + pf + ' / ' + real, 'thiếu sbs.py hoặc ảnh gốc'); continue; }
    const r = py(['"' + sbsPy + '"', '"' + f + '"', '"' + realJpg + '"', '"' + o + '"']);
    check('sbs.py ghép ' + pf + ' (web 1920×1080) với ' + real + '.jpg', r.status === 0 && fs.existsSync(o) && sp.rig, (r.stdout || '').trim() + (r.stderr ? ' ' + r.stderr.slice(0, 120) : ''));
  }

  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  console.log('DREDGE anim — phần A (node)');
  try { partA(); } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ ở phần A: ' + (e && e.stack || e)); }
  if (!process.env.ANIM_NODE_ONLY) await partB();
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt, ' + skipped + ' bỏ qua');
  process.exit(fail ? 1 : 0);
})();
