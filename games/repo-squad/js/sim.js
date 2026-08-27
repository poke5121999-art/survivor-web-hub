/*
 * Ca Trực Đêm: Biệt Đội — mô phỏng một ca trực: 1 người chơi + 4 bot, quái, đồ, kỹ năng.
 *
 * WHY: file này KHÔNG vẽ gì và KHÔNG đọc DOM. Nó chỉ nhận `dt` + input và đẩy trạng thái
 *      đi tiếp, nên bot kiểm thử có thể chạy nó ở tốc độ 8x mà không cần màn hình.
 * ROOT-CAUSE: một suite chỉ chụp ảnh màn hình sẽ xanh trên cả cần điều khiển đã chết
 *      (memory: pixel-tests-cannot-see-controls). Muốn kiểm được LUẬT thì luật phải
 *      sống tách khỏi phần vẽ.
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;
  const TILE = SQ.TILE;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const REVIVE_T = 3.0;          // giây đứng cạnh để đỡ một người dậy
  const BLEED_T = 100;           // gục quá lâu thì hết ca này không dậy nữa
  const PAD_HOLD = 0.35;         // đứng trên bệ bao lâu thì đồ được tính
  const FOE_ATK_CD = 1.35;
  const FOE_REACH = 1.0 * TILE;
  const UNIT_R = 8;
  const FOE_R = 9;
  const NOISE_WALK = 3.2 * TILE;
  const NOISE_RUN = 6.5 * TILE;

  // ---------------------------------------------------------------------------
  function startRun(mapId, seed) {
    const map = SQ.MAP_BY_ID[mapId];
    const list = SQ.squadList();
    const R = {
      mapId: mapId, map: map, floor: 1, seed: (seed || (Math.random() * 1e9)) | 0,
      state: 'play',              // play | floorclear | win | lose
      t: 0, units: [], claims: {}, zones: [], shots: [], fx: [], msgs: [],
      stats: { loot: 0, kills: 0, skills: 0, revives: 0, floorsDone: 0, broken: 0 },
      floorLoot: 0, revealT: 0, iq: SQ.botIQ(), paused: false
    };
    list.forEach((m, i) => {
      const s = m.stats;
      R.units.push({
        idx: i, charId: m.id, def: SQ.CHAR_BY_ID[m.id], stats: s,
        player: m.player, tactic: m.tactic,
        x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0,
        hp: s.hp, hpMax: s.hp, down: false, downT: 0, out: false,
        bag: [], padT: 0, atkT: 0, skillT: 0, skillDur: 0,
        gong: 0, invis: 0, invul: 0, haste: 0, reviveT: 0,
        noise: 0, path: null, pathT: 0, want: null, pryT: 0, pryDoor: null,
        hitFx: 0, useFx: 0
      });
    });
    buildFloor(R);
    return R;
  }

  function buildFloor(R) {
    const W = SQ.genLevel(R.mapId, R.floor, (R.seed + R.floor * 7919) | 0);
    W.cages = [];
    R.W = W;
    R.claims = {}; R.zones = []; R.fx = [];
    R.floorLoot = 0; R.revealT = 0;
    R.units.forEach((u, i) => {
      const ang = -Math.PI / 2 + (i - 2) * 0.5;
      u.x = W.spawn.x + Math.cos(ang) * 26;
      u.y = W.spawn.y + Math.sin(ang) * 26 + 16;
      u.bag = []; u.path = null; u.want = null; u.padT = 0;
      if (u.out) { u.out = false; u.down = false; u.hp = u.hpMax * 0.35; }   // tầng mới: ai cũng đứng dậy
      if (u.down) { u.down = false; u.hp = Math.max(u.hp, u.hpMax * 0.35); }
      u.hp = Math.min(u.hpMax, u.hp + u.hpMax * 0.30);                       // và được băng bó một ít
    });
    say(R, 'Tầng ' + R.floor + '/' + R.map.floors + ' — chỉ tiêu ' + SQ.money(W.quota));
  }

  // "Nhận" một món đồ để hai bot không cùng lao vào một cái tủ.
  // WHY: nhận mà không có HẠN thì một người gục giữa đường là món đó bị khoá vĩnh viễn,
  //      và cả tổ đứng nhìn nó tới hết ca — đo được ở map k3 seed 777, tầng 2 treo ở
  //      5.658/5.670 vì bốn món cuối mang tên một người đã nằm xuống.
  // ROOT-CAUSE: quyền sở hữu không có ai thu hồi khi chủ của nó biến mất.
  const CLAIM_TTL = 6;
  function claimOk(R, u, l) {
    const c = R.claims[l.id];
    if (c == null || c.i === u.idx) return true;
    return (R.t - c.t) > CLAIM_TTL;
  }
  function claimIt(R, u, l) { R.claims[l.id] = { i: u.idx, t: R.t }; }
  function unclaimAll(R, u) {
    for (const k in R.claims) if (R.claims[k].i === u.idx) delete R.claims[k];
  }

  function say(R, text) {
    R.msgs.push({ text: text, t: 0 });
    if (R.msgs.length > 4) R.msgs.shift();
  }
  SQ.say = say;

  // ---------------------------------------------------------------------------
  // tìm đường: BFS trên lưới ô. Cửa kẹt coi như đi qua được — tới nơi thì cạy.
  // ---------------------------------------------------------------------------
  const PATH_BUF = { came: new Int32Array(SQ.MW * SQ.MH), stamp: new Int32Array(SQ.MW * SQ.MH), n: 0, q: new Int32Array(SQ.MW * SQ.MH) };
  function findPath(W, sx, sy, tx, ty) {
    const MW = SQ.MW, MH = SQ.MH;
    const s = (Math.floor(sy / TILE) * MW + Math.floor(sx / TILE));
    let goal = (Math.floor(ty / TILE) * MW + Math.floor(tx / TILE));
    if (W.grid[goal] !== SQ.FLOOR) {                 // đích nằm trong tường: lấy ô trống gần nhất
      let best = -1, bd = 1e9;
      const gx = goal % MW, gy = (goal / MW) | 0;
      for (let y = Math.max(0, gy - 3); y < Math.min(MH, gy + 4); y++)
        for (let x = Math.max(0, gx - 3); x < Math.min(MW, gx + 4); x++) {
          if (W.grid[y * MW + x] !== SQ.FLOOR) continue;
          const d = (x - gx) * (x - gx) + (y - gy) * (y - gy);
          if (d < bd) { bd = d; best = y * MW + x; }
        }
      if (best < 0) return null;
      goal = best;
    }
    if (W.grid[s] !== SQ.FLOOR) return null;
    const stamp = PATH_BUF.stamp, came = PATH_BUF.came, q = PATH_BUF.q;
    const mark = ++PATH_BUF.n;
    let head = 0, tail = 0;
    q[tail++] = s; stamp[s] = mark; came[s] = -1;
    let found = false;
    while (head < tail) {
      const cur = q[head++];
      if (cur === goal) { found = true; break; }
      const cx = cur % MW, cy = (cur / MW) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ni = ny * MW + nx;
        if (stamp[ni] === mark) continue;
        if (W.grid[ni] !== SQ.FLOOR) continue;
        stamp[ni] = mark; came[ni] = cur; q[tail++] = ni;
      }
    }
    if (!found) return null;
    const out = [];
    let cur = goal;
    while (cur !== -1 && out.length < 4000) {
      out.push({ x: ((cur % MW) + 0.5) * TILE, y: (((cur / MW) | 0) + 0.5) * TILE });
      cur = came[cur];
    }
    out.reverse();
    return simplify(W, out);
  }
  function simplify(W, pts) {                    // bỏ bớt điểm giữa khi nhìn thẳng được
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) if (SQ.losWide(W, pts[i].x, pts[i].y, pts[j].x, pts[j].y, UNIT_R)) break;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  SQ.findPath = findPath;

  // Đi theo đường đã tìm; trả về vector hướng đơn vị.
  function steer(R, u, tx, ty, dt) {
    const W = R.W;
    u.pathT -= dt;
    const dist = Math.hypot(tx - u.x, ty - u.y);
    const straight = dist < 5 * TILE && SQ.losWide(W, u.x, u.y, tx, ty, UNIT_R);
    if (straight) { u.path = null; return norm(tx - u.x, ty - u.y); }
    if (!u.path || u.pathT <= 0 || !u.want ||
        Math.hypot(u.want.x - tx, u.want.y - ty) > 2 * TILE) {
      u.path = findPath(W, u.x, u.y, tx, ty);
      u.want = { x: tx, y: ty };
      u.pathT = 0.55 / R.iq;
    }
    if (!u.path || !u.path.length) return norm(tx - u.x, ty - u.y);
    while (u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < TILE * 0.7) u.path.shift();
    if (!u.path.length) return norm(tx - u.x, ty - u.y);
    return norm(u.path[0].x - u.x, u.path[0].y - u.y);
  }
  function norm(dx, dy) {
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d, d: d };
  }

  // Gỡ kẹt. WHY: một thân người bán kính 8 px có thể mắc ở góc tường trong khi tia ngắm
  // (một điểm) vẫn thấy đường thông, và bot sẽ đứng đó tới hết ca.
  // ROOT-CAUSE: va chạm là hình tròn, còn kiểm tra đường đi là một điểm — hai hình khác nhau.
  // SEE: docs/proposals/repo-squad.md; đo được lần đầu ở ca k3 seed 12345.
  function unstick(R, u, dt, tryingToMove) {
    if (!tryingToMove) { u.stuckT = 0; u.lx = u.x; u.ly = u.y; return; }
    const moved = Math.hypot(u.x - (u.lx || 0), u.y - (u.ly || 0));
    u.lx = u.x; u.ly = u.y;
    if (moved > 0.35) { u.stuckT = 0; u.stuckN = 0; return; }
    u.stuckT = (u.stuckT || 0) + dt;
    if (u.stuckT < 0.4) return;
    u.stuckT = 0;
    u.path = null; u.want = null; u.pathT = 0;
    u.stuckN = (u.stuckN || 0) + 1;
    // lùi về tâm ô đang đứng — gần như lúc nào cũng gỡ được cái kẹt ở góc
    const cx = (Math.floor(u.x / TILE) + 0.5) * TILE, cy = (Math.floor(u.y / TILE) + 0.5) * TILE;
    const n = norm(cx - u.x, cy - u.y);
    SQ.moveBody(R.W, u, n.x * 10, n.y * 10, UNIT_R);
    // vẫn ở nguyên chỗ cũ thì lách ngang một nhịp
    const a = Math.random() * Math.PI * 2;
    SQ.moveBody(R.W, u, Math.cos(a) * 8, Math.sin(a) * 8, UNIT_R);
    // đẩy ba lần vẫn không nhúc nhích: nhấc hẳn về tâm ô trống gần nhất.
    // WHY: cái kẹt tệ nhất là kẹt trong một góc mà mọi hướng đẩy đều đâm vào tường.
    if (u.stuckN >= 3) {
      u.stuckN = 0;
      snapToFreeTile(R, u);
    }
  }

  // ---------------------------------------------------------------------------
  // bước mô phỏng
  // ---------------------------------------------------------------------------
  function stepRun(R, dt, input) {
    if (R.state !== 'play' || R.paused) return R;
    R.t += dt;
    if (R.revealT > 0) R.revealT -= dt;
    const W = R.W;

    R.msgs.forEach(m => m.t += dt);
    R.fx = R.fx.filter(f => (f.t -= dt) > 0);
    R.zones = R.zones.filter(z => (z.t -= dt) > 0);
    W.cages = W.cages.filter(c => (c.t -= dt) > 0);
    W.doors.forEach(d => {
      if (d.jam && d.pry >= 1) { d.jam = 0; d.pry = 0; }
      const wantOpen = !d.jam;
      d.open += ((wantOpen ? 1 : 0) - d.open) * Math.min(1, dt * 6);
    });

    // --- người / bot ---
    R.units.forEach(u => {
      u.skillT = Math.max(0, u.skillT - dt);
      u.atkT = Math.max(0, u.atkT - dt);
      u.gong = Math.max(0, u.gong - dt);
      u.invis = Math.max(0, u.invis - dt);
      u.invul = Math.max(0, u.invul - dt);
      u.haste = Math.max(0, u.haste - dt);
      u.hitFx = Math.max(0, u.hitFx - dt);
      u.useFx = Math.max(0, u.useFx - dt);
      u.forcePad = Math.max(0, (u.forcePad || 0) - dt);
      if (u.out) return;

      if (u.down) {
        u.downT += dt;
        if (u.downT > BLEED_T) { u.out = true; dropHeld(R, u); unclaimAll(R, u); say(R, u.def.name + ' không dậy nổi nữa.'); }
        return;
      }
      if (u.player) stepPlayer(R, u, dt, input);
      else stepBot(R, u, dt);

      // hồi máu bị động của An: ai đứng cạnh cũng được băng
      if (u.def.id === 'hue') {
        R.units.forEach(o => {
          if (o === u || o.down || o.out) return;
          if (Math.hypot(o.x - u.x, o.y - u.y) < 2.6 * TILE) o.hp = Math.min(o.hpMax, o.hp + dt);
        });
      }
      // vòng hồi máu
      R.zones.forEach(z => {
        if (z.kind !== 'heal') return;
        if (Math.hypot(u.x - z.x, u.y - z.y) < z.r) u.hp = Math.min(u.hpMax, u.hp + z.heal * dt);
      });
      autoAttack(R, u, dt);
      pickAndDeliver(R, u, dt);
    });

    // --- đỡ dậy ---
    R.units.forEach(u => {
      if (!u.down || u.out) return;
      let helper = null;
      R.units.forEach(o => {
        if (o === u || o.down || o.out) return;
        if (Math.hypot(o.x - u.x, o.y - u.y) < 1.6 * TILE) helper = o;
      });
      if (helper) {
        const rate = helper.def.id === 'phuc' ? 2 : 1;
        u.reviveT += dt * rate;
        if (u.reviveT >= REVIVE_T) revive(R, u, 0.45);
      } else u.reviveT = Math.max(0, u.reviveT - dt * 0.7);
    });

    // --- quái ---
    W.foes.forEach(f => stepFoe(R, f, dt));

    // --- sương mù / ánh sáng ---
    updateVision(R, dt);

    // --- chốt chặn: ván chơi không được phép đứng im ---
    watchdog(R, dt);

    // --- điều kiện kết thúc tầng ---
    if (W.pad.delivered >= W.quota && R.state === 'play') {
      R.state = 'floorclear';
      R.stats.floorsDone++;
      say(R, 'Đủ chỉ tiêu. Lên xe đi tầng sau.');
    }
    const alive = R.units.filter(u => !u.down && !u.out).length;
    if (alive === 0 && R.state === 'play') {
      R.state = 'lose';
      say(R, 'Cả tổ nằm lại. Ca này coi như hỏng.');
    }
    return R;
  }

  // WHY: bộ đếm này CHỈ nhìn số tiền đã giao. Bản đầu tiên có cộng cả số món đang cầm,
  // và thế là hai bot cứ nhặt lên đặt xuống là chốt chặn không bao giờ nổ — trong khi
  // chỉ tiêu đứng im suốt ba phút.
  const JAM_AFTER = 40;          // giây không giao được gì thì coi là kẹt
  function progressSig(R) { return R.W.pad.delivered; }
  function snapToFreeTile(R, u) {
    const gx = Math.floor(u.x / TILE), gy = Math.floor(u.y / TILE);
    for (let r = 0; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (SQ.solidAt(R.W, gx + dx, gy + dy)) continue;
        if (SQ.doorBlocks(R.W, (gx + dx + 0.5) * TILE, (gy + dy + 0.5) * TILE, UNIT_R)) continue;
        u.x = (gx + dx + 0.5) * TILE; u.y = (gy + dy + 0.5) * TILE;
        u.path = null; u.want = null; u.pathT = 0;
        return true;
      }
    }
    return false;
  }

  function watchdog(R, dt) {
    const sig = progressSig(R);
    if (sig !== R.jamSig) { R.jamSig = sig; R.jamT = 0; R.jamN = 0; return; }
    R.jamT = (R.jamT || 0) + dt;
    if (R.jamT < JAM_AFTER) return;
    R.jamT = 0;
    R.jamN = (R.jamN || 0) + 1;
    // Ván chơi PHẢI kết thúc. Người chơi đã nằm hẳn, hoặc đang để bot chơi hộ, mà mấy phút
    // liền không giao được đồng nào thì đó là ca hỏng — kết nó lại thay vì treo mãi.
    // WHY: một mình một bot còn sống thì không bao giờ đủ chỉ tiêu; và một nguyên nhân kẹt
    // chưa biết cũng không được phép giết ván chơi bằng cách để nó chạy vô tận.
    // Khi người thật đang cầm máy (bot tắt, người chơi còn sống) thì KHÔNG áp luật này —
    // họ có quyền đi lang thang, và có sẵn nút ✕ để bỏ ca.
    const playerGone = R.units[0].out;
    if (playerGone && R.jamN >= 3) {
      R.state = 'lose';
      say(R, 'Không còn ai kéo nổi ca này.');
      return;
    }
    if (R.autoplay && R.jamN >= 7) {         // ~280 giây bot chơi mà không giao được gì
      R.state = 'lose';
      say(R, 'Bot không kéo nổi ca này.');
      return;
    }
    // 1. trả lại mọi món đã "nhận" cho cả nhà
    R.claims = {};
    // 2. quên hết đường đi cũ
    R.units.forEach(u => { u.path = null; u.want = null; u.pathT = 0; });
    // 3. ai đang ôm đồ thì về bệ ngay, ai tay không thì đi tìm món khác
    R.units.forEach(u => { if (u.bag.length) u.forcePad = 8; });
    // 4. ai đang mắc kẹt trong một góc thì đẩy về tâm ô gần nhất còn trống
    R.units.forEach(u => { if (!u.down && !u.out) snapToFreeTile(R, u); });
    say(R, 'Cả tổ khựng lại — chỉnh lại đội hình.');
  }

  function revive(R, u, frac) {
    u.down = false; u.downT = 0; u.reviveT = 0;
    u.hp = Math.max(1, u.hpMax * frac);
    u.invul = Math.max(u.invul, 2);        // hai giây để chạy khỏi chỗ vừa gục
    R.stats.revives++;
    R.fx.push({ kind: 'ring', x: u.x, y: u.y, r: 26, t: 0.5, max: 0.5, color: '#7fdc8a' });
  }

  // ---------------------------------------------------------------------------
  // Tổng khối lượng đang vác. Sức mang quyết định vác được bao nhiêu MỘT CHUYẾN,
  // nên "Sức mang" đổi thẳng ra thời gian chứ không phải con số trang trí.
  function bagMass(u) {
    let m = 0;
    for (let i = 0; i < u.bag.length; i++) m += u.bag[i].mass;
    return m;
  }
  function bagValue(u) {
    let v = 0;
    for (let i = 0; i < u.bag.length; i++) v += u.bag[i].value;
    return v;
  }
  SQ.bagMass = bagMass; SQ.bagValue = bagValue;
  const BAG_SLOTS = 6;

  function speedOf(R, u) {
    const s = u.stats;
    let base = 108 * s.spd;
    if (u.bag.length) {
      const load = bagMass(u) / Math.max(1, s.carry);
      const soft = u.def.id === 'tam' ? 0.7 : 1;      // "Vai U"
      base *= u.gong > 0 ? 1 : clamp(1 - load * 0.5 * soft, 0.5, 1);
    }
    if (u.gong > 0) base *= 1.3;
    if (u.haste > 0) base *= 1.25;
    return base;
  }

  function stepPlayer(R, u, dt, input) {
    const mv = input && input.move ? input.move : { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const sp = speedOf(R, u) * mag;
    if (mag > 0.02) {
      const d = norm(mv.x, mv.y);
      SQ.moveBody(R.W, u, d.x * sp * dt, d.y * sp * dt, UNIT_R);
      u.a = Math.atan2(d.y, d.x);
      u.noise = mag > 0.75 ? NOISE_RUN : NOISE_WALK;
    } else u.noise = 0;
    if (u.def.id === 'linh') u.noise *= 0.5;
    if (u.invis > 0) u.noise = 0;
    tryPry(R, u, dt);
    if (input && input.skill) { useSkill(R, u); input.skill = false; }
  }

  // Cạy cửa kẹt khi đứng sát nó.
  function tryPry(R, u, dt) {
    const d = SQ.doorBlocks(R.W, u.x + Math.cos(u.a) * TILE, u.y + Math.sin(u.a) * TILE, UNIT_R + 6);
    if (!d) {
      const near = SQ.doorBlocks(R.W, u.x, u.y, UNIT_R + TILE * 0.9);
      if (!near) { u.pryDoor = null; return; }
      pry(near);
      return;
    }
    pry(d);
    function pry(door) {
      u.pryDoor = door;
      door.pry += dt * (u.def.id === 'ky' ? 2 : 1) * 0.62;
      if (door.pry >= 1) {
        door.jam = 0;
        R.fx.push({ kind: 'ring', x: door.x, y: door.y, r: 20, t: 0.4, max: 0.4, color: '#d0a24a' });
        noiseAt(R, door.x, door.y, 9 * TILE);
      }
    }
  }

  function autoAttack(R, u, dt) {
    if (u.atkT > 0) return;
    const range = u.stats.atkR * TILE;
    let best = null, bd = 1e9;
    R.W.foes.forEach(f => {
      if (f.dead) return;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < range && d < bd && SQ.lineOfSight(R.W, u.x, u.y, f.x, f.y)) { bd = d; best = f; }
    });
    if (!best) return;
    u.atkT = u.stats.atkCd;
    let dmg = u.stats.atk;
    if (best.freeze > 0) dmg *= 1.5;                          // "Băng": đánh vào con đang đóng băng đau hơn
    hurtFoe(R, best, dmg, u);
    if (u.def.id === 'van') best.slow = Math.max(best.slow, 2);
    R.shots.push({ x0: u.x, y0: u.y, x1: best.x, y1: best.y, t: 0.12 });
    if (R.shots.length > 40) R.shots.shift();
  }

  function hurtFoe(R, f, dmg, by) {
    f.hp -= dmg;
    R.fx.push({ kind: 'num', x: f.x, y: f.y - 10, t: 0.6, max: 0.6, text: Math.round(dmg), color: '#ffd9a0' });
    if (f.hp <= 0 && !f.dead) {
      f.dead = true;
      R.stats.kills++;
      // Quái chết rơi một món nhỏ — đó là lý do chiến thuật "Săn quái" có nghĩa.
      const val = Math.round((f.hpMax * 1.6 + f.dmg * 9) * (by ? by.stats.luck : 1));
      R.W.loot.push({
        id: 'D' + R.W.loot.length, x: f.x, y: f.y, size: 'nho', r: 7, mass: 5,
        value: val, mat: 'dong', color: '#b07a3c', fragile: 1,
        name: 'chiến lợi phẩm', held: null, done: false, broken: 0, drop: true
      });
      R.fx.push({ kind: 'ring', x: f.x, y: f.y, r: 24, t: 0.45, max: 0.45, color: '#c9584f' });
    }
  }

  function hurtUnit(R, u, dmg, src) {
    if (u.down || u.out || u.invul > 0) return;
    let d = dmg * (1 - u.stats.grit);
    // "Chắn" của Sơn: cả tổ đứng cạnh anh ta ăn nhẹ hơn
    R.units.forEach(o => {
      if (o !== u && o.def.id === 'son' && !o.down && !o.out &&
          Math.hypot(o.x - u.x, o.y - u.y) < 3 * TILE) d *= 0.92;
    });
    u.hp -= d;
    u.hitFx = 0.3;
    R.fx.push({ kind: 'num', x: u.x, y: u.y - 12, t: 0.7, max: 0.7, text: '-' + Math.round(d), color: '#ff8a7a' });
    if (u.def.id !== 'dung' && u.bag.length && Math.random() < 0.6) dropHeld(R, u, 1);   // "Lì Đòn"
    if (u.hp <= 0) {
      u.hp = 0; u.down = true; u.downT = 0; u.reviveT = 0;
      dropHeld(R, u);
      unclaimAll(R, u);                 // ai nằm xuống thì nhả đồ đã nhận cho người khác lấy
      // "Rọi Sáng" của Thiên: gục cạnh người này thì không mất máu tối đa
      say(R, u.def.name + ' gục rồi!');
    }
  }

  // Rơi đồ: `n` mon (mac dinh ca tui). Moi mon roi la me mot it gia.
  function dropHeld(R, u, n) {
    if (!u.bag.length) return;
    const many = n == null ? u.bag.length : Math.min(n, u.bag.length);
    for (let k = 0; k < many; k++) {
      const l = u.bag.pop();
      l.held = null;
      l.x = u.x + (Math.random() - 0.5) * 14;
      l.y = u.y + (Math.random() - 0.5) * 14;
      const loss = 0.06 * l.fragile;
      l.value = Math.round(l.value * (1 - loss));
      l.broken = Math.min(1, (l.broken || 0) + loss);
      R.stats.broken += 1;
      delete R.claims[l.id];
    }
  }

  function pickAndDeliver(R, u, dt) {
    const W = R.W;
    // đồ trong túi đi theo người
    for (let i = 0; i < u.bag.length; i++) { u.bag[i].x = u.x; u.bag[i].y = u.y - 6 - i * 2; }

    if (u.bag.length && Math.hypot(u.x - W.pad.x, u.y - W.pad.y) < W.pad.r) {
      u.padT += dt;
      if (u.padT >= PAD_HOLD) {
        let val = 0;
        const dropped = u.bag.slice();
        dropped.forEach(l => {
          val += Math.round(l.value * u.stats.luck);
          l.done = true; l.held = null;
          delete R.claims[l.id];
        });
        W.loot = W.loot.filter(l => dropped.indexOf(l) < 0);
        W.pad.delivered += val; R.floorLoot += val; R.stats.loot += val;
        R.fx.push({ kind: 'num', x: W.pad.x, y: W.pad.y - 14, t: 1, max: 1,
                    text: '+' + SQ.money(val), color: '#e0c46a' });
        u.bag = []; u.padT = 0;
      }
      return;
    }
    u.padT = 0;

    // còn chỗ trong túi thì nhặt món chạm phải (Hải hút xa hơn)
    if (u.bag.length >= BAG_SLOTS) return;
    const mass = bagMass(u);
    const reach = u.def.id === 'hai' ? 2 * TILE : UNIT_R + 10;
    for (let i = 0; i < W.loot.length; i++) {
      const l = W.loot[i];
      if (l.held != null || l.done) continue;
      // quá sức thì chỉ vác được khi tay không — một mình một món, và đi chậm
      if (u.bag.length && mass + l.mass > u.stats.carry) continue;
      if (Math.hypot(l.x - u.x, l.y - u.y) < reach) {
        if (!claimOk(R, u, l)) continue;
        u.bag.push(l); l.held = u.idx; claimIt(R, u, l);
        break;
      }
    }
  }

  function noiseAt(R, x, y, radius) {
    R.W.foes.forEach(f => {
      if (f.dead || f.freeze > 0) return;
      if (Math.hypot(f.x - x, f.y - y) < Math.min(radius, f.hear * TILE + radius * 0.5)) {
        f.lastSeen = { x: x, y: y };
      }
    });
  }
  SQ.noiseAt = noiseAt;

  // ---------------------------------------------------------------------------
  // quái
  // ---------------------------------------------------------------------------
  function stepFoe(R, f, dt) {
    if (f.dead) return;
    const W = R.W;
    f.stun = Math.max(0, f.stun - dt);
    f.freeze = Math.max(0, f.freeze - dt);
    f.slow = Math.max(0, f.slow - dt);
    f.atkCd = Math.max(0, f.atkCd - dt);
    f.spotFx = Math.max(0, f.spotFx - dt);
    if (f.stun > 0 || f.freeze > 0) return;

    // "Tượng": đứng im khi có người còn tỉnh nhìn thấy nó.
    if (f.kind === 'angel') {
      const watched = R.units.some(u => !u.down && !u.out && u.invis <= 0 &&
        Math.hypot(u.x - f.x, u.y - f.y) < 13 * TILE && SQ.lineOfSight(W, u.x, u.y, f.x, f.y));
      if (watched) { f.watched = true; return; }
      f.watched = false;
    }

    // nghe / nhìn
    let target = null, bd = 1e9;
    R.units.forEach(u => {
      if (u.down || u.out) return;
      const d = Math.hypot(u.x - f.x, u.y - f.y);
      if (u.invis > 0) return;
      const canSee = f.sight > 0 && d < f.sight * TILE && SQ.lineOfSight(W, f.x, f.y, u.x, u.y);
      const canHear = u.noise > 0 && d < Math.min(f.hear * TILE, u.noise + f.hear * TILE * 0.35);
      if ((canSee || canHear) && d < bd) { bd = d; target = u; }
    });
    if (target) {
      if (!f.target) {
        f.spotFx = 0.6;
        // "Quản Ca": nó thấy bạn một cái là cả nhà biết bạn đứng đâu.
        if (f.alert) {
          W.foes.forEach(o => {
            if (o === f || o.dead) return;
            o.lastSeen = { x: target.x, y: target.y };
          });
          say(R, f.name + ' hô lên — cả nhà biết bạn ở đâu rồi.');
        }
      }
      f.target = target; f.lastSeen = { x: target.x, y: target.y };
      f.forget = 4.5;
    } else if (f.target) {
      f.forget -= dt;
      if (f.forget <= 0) f.target = null;
    }

    // mồi nhử kéo mạnh hơn mọi thứ khác
    const lure = R.zones.find(z => z.kind === 'decoy');
    let gx, gy, chasing = false;
    if (lure && Math.hypot(f.x - lure.x, f.y - lure.y) < lure.r) {
      gx = lure.x; gy = lure.y;
    } else if (f.target) {
      gx = f.target.x; gy = f.target.y; chasing = true;
    } else if (f.lastSeen) {
      gx = f.lastSeen.x; gy = f.lastSeen.y;
      if (Math.hypot(f.x - gx, f.y - gy) < TILE) f.lastSeen = null;
    } else {
      if (!f.wander || Math.hypot(f.x - f.wander.x, f.y - f.wander.y) < TILE * 1.2 || (f.wanderT -= dt) <= 0) {
        const rm = W.rooms[(Math.random() * W.rooms.length) | 0];
        f.wander = { x: rm.cxp + (Math.random() - 0.5) * 6 * TILE, y: rm.cyp + (Math.random() - 0.5) * 4 * TILE };
        f.wanderT = 12;
      }
      gx = f.wander.x; gy = f.wander.y;
    }

    const dir = steerFoe(R, f, gx, gy, dt);
    let sp = f.spd * (f.slow > 0 ? 0.75 : 1) * (chasing ? 1 : 0.6);
    if (f.kind === 'angel' && !f.watched) sp = f.spd;             // tượng chỉ có một tốc độ: nhanh
    const before = { x: f.x, y: f.y };
    SQ.moveBody(W, f, dir.x * sp * dt, dir.y * sp * dt, FOE_R);
    f.a = Math.atan2(dir.y, dir.x);
    if (Math.hypot(f.x - before.x, f.y - before.y) < 0.3) {
      f.stuckT = (f.stuckT || 0) + dt;
      if (f.stuckT > 0.5) {
        f.stuckT = 0; f.path = null; f.pathT = 0; f.wander = null;
        const cx = (Math.floor(f.x / TILE) + 0.5) * TILE, cy = (Math.floor(f.y / TILE) + 0.5) * TILE;
        const n = norm(cx - f.x, cy - f.y);
        SQ.moveBody(W, f, n.x * 10, n.y * 10, FOE_R);
      }
    } else f.stuckT = 0;

    // đánh
    if (f.atkCd <= 0) {
      R.units.forEach(u => {
        if (u.down || u.out) return;
        if (Math.hypot(u.x - f.x, u.y - f.y) < FOE_REACH + UNIT_R) {
          f.atkCd = FOE_ATK_CD;
          hurtUnit(R, u, f.dmg, f);
          R.fx.push({ kind: 'ring', x: u.x, y: u.y, r: 18, t: 0.3, max: 0.3, color: '#c9584f' });
        }
      });
    }
  }
  function steerFoe(R, f, tx, ty, dt) {
    f.pathT = (f.pathT || 0) - dt;
    if (Math.hypot(tx - f.x, ty - f.y) < 5 * TILE && SQ.losWide(R.W, f.x, f.y, tx, ty, FOE_R)) {
      f.path = null; return norm(tx - f.x, ty - f.y);
    }
    if (!f.path || f.pathT <= 0) {
      f.path = findPath(R.W, f.x, f.y, tx, ty);
      f.pathT = 0.8;
    }
    if (!f.path || !f.path.length) return norm(tx - f.x, ty - f.y);
    while (f.path.length && Math.hypot(f.path[0].x - f.x, f.path[0].y - f.y) < TILE * 0.7) f.path.shift();
    if (!f.path.length) return norm(tx - f.x, ty - f.y);
    return norm(f.path[0].x - f.x, f.path[0].y - f.y);
  }

  // ---------------------------------------------------------------------------
  // KỸ NĂNG — mỗi xác đúng một cái, một nút, có hồi chiêu.
  // ---------------------------------------------------------------------------
  function skillCd(u) { return u.def.skill.cd * (1 - u.stats.cd); }
  SQ.skillCd = skillCd;

  function useSkill(R, u) {
    if (u.down || u.out || u.skillT > 0) return false;
    const s = u.def.skill, W = R.W;
    u.skillT = skillCd(u);
    u.useFx = 0.45;
    R.stats.skills++;
    switch (s.id) {
      case 'flash': {
        W.foes.forEach(f => {
          if (f.dead || f.stunProof) return;          // Bóng Đen không ăn choáng
          if (Math.hypot(f.x - u.x, f.y - u.y) < s.radius * TILE) {
            f.stun = Math.max(f.stun, s.dur); f.target = null; f.lastSeen = null;
          }
        });
        R.fx.push({ kind: 'flash', x: u.x, y: u.y, r: s.radius * TILE, t: 0.5, max: 0.5, color: '#fff2c0' });
        break;
      }
      case 'healring':
        R.zones.push({ kind: 'heal', x: u.x, y: u.y, r: s.radius * TILE, t: s.dur, max: s.dur, heal: s.heal, color: '#67d18a' });
        break;
      case 'gong': u.gong = s.dur; break;
      case 'unlock': {
        let n = 0;
        W.doors.forEach(d => {
          if (d.jam && Math.hypot(d.x - u.x, d.y - u.y) < s.radius * TILE) { d.jam = 0; d.pry = 0; n++; }
        });
        R.fx.push({ kind: 'ring', x: u.x, y: u.y, r: s.radius * TILE, t: 0.6, max: 0.6, color: '#7fc8d8' });
        if (!n) say(R, 'Không có cửa nào kẹt quanh đây.');
        break;
      }
      case 'vanish': u.invis = s.dur; W.foes.forEach(f => { if (f.target === u) { f.target = null; f.lastSeen = null; } }); break;
      case 'shock': {
        W.foes.forEach(f => {
          if (f.dead) return;
          const d = Math.hypot(f.x - u.x, f.y - u.y);
          if (d < s.radius * TILE) {
            hurtFoe(R, f, s.dmg + u.stats.atk, u);
            if (!f.stunProof) f.stun = Math.max(f.stun, s.stun);
            const n = norm(f.x - u.x, f.y - u.y);
            SQ.moveBody(W, f, n.x * 46, n.y * 46, FOE_R);
          }
        });
        R.fx.push({ kind: 'shock', x: u.x, y: u.y, r: s.radius * TILE, t: 0.45, max: 0.45, color: '#ffb36b' });
        break;
      }
      case 'decoy': {
        const dx = u.x + Math.cos(u.a) * 4 * TILE, dy = u.y + Math.sin(u.a) * 4 * TILE;
        R.zones.push({ kind: 'decoy', x: dx, y: dy, r: s.radius * TILE, t: s.dur, max: s.dur, color: '#e79ad0' });
        W.foes.forEach(f => { if (Math.hypot(f.x - dx, f.y - dy) < s.radius * TILE) { f.target = null; f.lastSeen = { x: dx, y: dy }; } });
        break;
      }
      case 'rescue': {
        let first = true;
        R.units.forEach(o => {
          if (!o.down || o.out) return;
          o.x = u.x + (Math.random() - 0.5) * 30; o.y = u.y + (Math.random() - 0.5) * 30;
          if (first) { revive(R, o, 0.5); first = false; }
        });
        if (first) say(R, 'Không có ai đang gục.');
        break;
      }
      case 'cage': {
        const d = 1.9 * TILE, th = 10, len = 3.4 * TILE;
        W.cages.push({ x: u.x, y: u.y - d, w: len, h: th, t: s.dur, max: s.dur });
        W.cages.push({ x: u.x, y: u.y + d, w: len, h: th, t: s.dur, max: s.dur });
        W.cages.push({ x: u.x - d, y: u.y, w: th, h: len, t: s.dur, max: s.dur });
        W.cages.push({ x: u.x + d, y: u.y, w: th, h: len, t: s.dur, max: s.dur });
        break;
      }
      case 'blink': {
        const nx = u.x + Math.cos(u.a) * s.dist * TILE;
        const ny = u.y + Math.sin(u.a) * s.dist * TILE;
        const ox = u.x, oy = u.y;
        if (!SQ.solidPx(W, nx, ny)) { u.x = clamp(nx, 10, SQ.WPX - 10); u.y = clamp(ny, 10, SQ.HPX - 10); }
        else {                                   // xuyên tường nhưng không chui vào tường: lùi dần
          for (let k = s.dist; k > 0; k -= 0.5) {
            const tx = u.x + Math.cos(u.a) * k * TILE, ty = u.y + Math.sin(u.a) * k * TILE;
            if (!SQ.solidPx(W, tx, ty)) { u.x = tx; u.y = ty; break; }
          }
        }
        u.invul = 2; u.path = null;
        R.zones.push({ kind: 'ghost', x: ox, y: oy, r: 3.5 * TILE, t: 3, max: 3, color: '#7fd8e8' });
        W.foes.forEach(f => { if (f.target === u) { f.target = null; f.lastSeen = { x: ox, y: oy }; } });
        R.fx.push({ kind: 'ring', x: ox, y: oy, r: 20, t: 0.4, max: 0.4, color: '#7fd8e8' });
        break;
      }
      case 'reveal':
        R.revealT = s.dur;
        R.W.seen.fill(1);
        break;
      case 'freeze':
        W.foes.forEach(f => {
          if (!f.dead && Math.hypot(f.x - u.x, f.y - u.y) < s.radius * TILE) f.freeze = Math.max(f.freeze, s.dur);
        });
        R.fx.push({ kind: 'ring', x: u.x, y: u.y, r: s.radius * TILE, t: 0.6, max: 0.6, color: '#9fd8ff' });
        break;
      case 'pull': {
        let n = 0;
        W.loot.forEach(l => {
          if (l.done || l.held) return;
          if (Math.hypot(l.x - u.x, l.y - u.y) < s.radius * TILE) {
            const val = Math.round(l.value * u.stats.luck);
            W.pad.delivered += val; R.floorLoot += val; R.stats.loot += val;
            l.done = true; n++;
            R.fx.push({ kind: 'line', x0: l.x, y0: l.y, x1: W.pad.x, y1: W.pad.y, t: 0.5, max: 0.5, color: '#c9a3e8' });
          }
        });
        W.loot = W.loot.filter(l => !l.done);
        if (n) R.fx.push({ kind: 'num', x: W.pad.x, y: W.pad.y - 16, t: 1, max: 1, text: n + ' món', color: '#c9a3e8' });
        else say(R, 'Quanh đây không còn đồ rơi.');
        break;
      }
      case 'angel': {
        R.units.forEach(o => {
          if (o.out) return;
          if (o.down) revive(R, o, 0.5);
          o.invul = Math.max(o.invul, s.dur);
        });
        R.fx.push({ kind: 'flash', x: u.x, y: u.y, r: 10 * TILE, t: 0.8, max: 0.8, color: '#ffd7e4' });
        break;
      }
    }
    return true;
  }
  SQ.useSkill = useSkill;

  // ---------------------------------------------------------------------------
  // BOT: chiến thuật người chơi gán quyết định nó đi đâu, làm gì.
  // ---------------------------------------------------------------------------
  function stepBot(R, u, dt) {
    const W = R.W, p = R.units[0];
    const tac = u.tactic || 'loot';
    let goal = null, wantRun = true;

    const downed = R.units.filter(o => o.down && !o.out);
    const foesNear = W.foes.filter(f => !f.dead && Math.hypot(f.x - u.x, f.y - u.y) < 7 * TILE);
    const loose = W.loot.filter(l => !l.done && l.held == null);
    const lootLeft = loose.length;
    const mine = bagMass(u);
    const canTake = loose.some(l => mine + l.mass <= u.stats.carry);
    // "đầy" = hết chỗ, hết sức mang, hoặc không còn món nào nhấc thêm được nữa
    const full = u.bag.length >= BAG_SLOTS ||
                 mine >= u.stats.carry * 0.72 ||
                 (u.bag.length > 0 && (!canTake || lootLeft === 0));

    // Ai gần người gục nhất thì người đó bỏ việc mà đi đỡ — kể cả không phải vai Giải cứu.
    // WHY: để một mình vai "Giải cứu" lo việc này thì tổ không có vai đó sẽ mất người vĩnh viễn
    //      sau 50 giây, và ca chơi tự chết dần.
    const rescue = pickRescue(R, u);
    if (rescue) {
      const dir0 = steer(R, u, rescue.x, rescue.y, dt);
      const d0 = Math.hypot(rescue.x - u.x, rescue.y - u.y);
      if (d0 > 1.2 * TILE) {
        const sp0 = speedOf(R, u);
        SQ.moveBody(W, u, dir0.x * sp0 * dt, dir0.y * sp0 * dt, UNIT_R);
        u.a = Math.atan2(dir0.y, dir0.x);
        u.noise = NOISE_WALK;
      }
      unstick(R, u, dt, d0 > 1.2 * TILE);
      botSkill(R, u, downed, foesNear);
      return;
    }

    if (u.forcePad > 0 && u.bag.length) {          // chốt chặn vừa gỡ kẹt: về bệ đã
      const dirP = steer(R, u, W.pad.x, W.pad.y, dt);
      const dP = Math.hypot(W.pad.x - u.x, W.pad.y - u.y);
      if (dP > TILE * 0.7) {
        const spP = speedOf(R, u);
        SQ.moveBody(W, u, dirP.x * spP * dt, dirP.y * spP * dt, UNIT_R);
        u.a = Math.atan2(dirP.y, dirP.x);
      }
      unstick(R, u, dt, dP > TILE * 0.7);
      return;
    }

    // Máu thấp mà quái ngay bên cạnh thì lùi ra đã — vai gì cũng vậy.
    if (u.hp < u.hpMax * 0.38 && foesNear.length) {
      const f0 = foesNear[0];
      if (Math.hypot(f0.x - u.x, f0.y - u.y) < 5 * TILE) {
        const g = away(u, f0, 7 * TILE);
        const dirF = steer(R, u, g.x, g.y, dt);
        const spF = speedOf(R, u);
        SQ.moveBody(W, u, dirF.x * spF * dt, dirF.y * spF * dt, UNIT_R);
        u.a = Math.atan2(dirF.y, dirF.x);
        u.noise = NOISE_WALK;
        unstick(R, u, dt, true);
        botSkill(R, u, downed, foesNear);
        return;
      }
    }

    switch (tac) {
      case 'loot':
        goal = full ? padPoint(W) : (bestLoot(R, u, 999) || padPoint(W));
        break;
      case 'thu': {
        if (full) goal = padPoint(W);
        else {
          const l = bestLoot(R, u, 14 * TILE);
          const f = nearestFoe(W, W.pad.x, W.pad.y, 9 * TILE);
          goal = f ? { x: f.x, y: f.y } : (l || { x: W.pad.x + 1.6 * TILE, y: W.pad.y });
        }
        break;
      }
      case 'soi': {
        goal = full ? padPoint(W) : (unseenRoom(R, u) || padPoint(W));
        if (foesNear.length) { const f = foesNear[0]; goal = away(u, f, 6 * TILE); }
        break;
      }
      case 'baoke': {
        const chaser = W.foes.find(f => !f.dead && f.target === p);
        if (chaser) goal = { x: chaser.x, y: chaser.y };
        else if (full) goal = padPoint(W);
        else goal = { x: p.x + Math.cos(u.idx * 1.7) * 2.2 * TILE, y: p.y + Math.sin(u.idx * 1.7) * 2.2 * TILE };
        break;
      }
      case 'cuuho':
        if (downed.length) goal = { x: downed[0].x, y: downed[0].y };
        else goal = full ? padPoint(W) : (bestLoot(R, u, 999, true) || bestLoot(R, u, 999) || padPoint(W));
        break;
      case 'nhu': {
        u.noise = NOISE_RUN * 1.6;                       // cố tình ồn
        const far = farRoomFrom(R, p);
        goal = { x: far.cxp, y: far.cyp };
        if (foesNear.length) goal = away(u, foesNear[0], 8 * TILE);
        break;
      }
      case 'san': {
        const f = nearestFoe(W, u.x, u.y, 26 * TILE);
        goal = f ? { x: f.x, y: f.y } : (full ? padPoint(W) : (bestLoot(R, u, 999) || padPoint(W)));
        break;
      }
      case 'tiepte': {
        if (full) goal = padPoint(W);
        else {
          const c = centroid(R);
          goal = { x: c.x, y: c.y };
          if (foesNear.length) goal = away(u, foesNear[0], 5 * TILE);
        }
        break;
      }
    }
    if (!goal) goal = u.bag.length ? padPoint(W) : { x: p.x, y: p.y };

    // Hết việc của vai mình mà nhà còn đồ thì đi khuân — không ai được đứng không.
    if (!full && u.bag.length === 0 && lootLeft > 0 &&
        Math.hypot(goal.x - u.x, goal.y - u.y) < 2.5 * TILE) {
      const alt = bestLoot(R, u, 999);
      if (alt) goal = alt;
    }

    const dir = steer(R, u, goal.x, goal.y, dt);
    const dist = Math.hypot(goal.x - u.x, goal.y - u.y);
    const stopAt = tac === 'baoke' ? 1.2 * TILE : TILE * 0.7;
    const walking = dist > stopAt;
    if (walking) {
      const sp = speedOf(R, u) * (wantRun ? 1 : 0.6);
      SQ.moveBody(W, u, dir.x * sp * dt, dir.y * sp * dt, UNIT_R);
      u.a = Math.atan2(dir.y, dir.x);
      if (tac !== 'nhu') u.noise = NOISE_WALK * (u.def.id === 'linh' ? 0.5 : 1);
    } else if (tac !== 'nhu') u.noise = 0;
    unstick(R, u, dt, walking);
    if (u.invis > 0) u.noise = 0;
    tryPry(R, u, dt);
    botSkill(R, u, downed, foesNear);
  }

  // Người gục mà mình là người đứng gần nhất — nếu không thì để người kia lo.
  function pickRescue(R, u) {
    const far = u.tactic === 'cuuho' ? 1e9 : 13 * TILE;
    let best = null, bd = far;
    R.units.forEach(o => {
      if (!o.down || o.out) return;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d > far) return;
      // ai đó đã đứng đỡ rồi thì thôi
      if (o.reviveT > 0.15) return;
      let closer = false;
      R.units.forEach(k => {
        if (k === u || k === o || k.down || k.out) return;
        if (k.tactic === 'cuuho' && u.tactic !== 'cuuho') closer = true;
        else if (Math.hypot(o.x - k.x, o.y - k.y) < d - 8) closer = true;
      });
      if (closer) return;
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  function padPoint(W) { return { x: W.pad.x, y: W.pad.y }; }
  function centroid(R) {
    let x = 0, y = 0, n = 0;
    R.units.forEach(u => { if (!u.out) { x += u.x; y += u.y; n++; } });
    return { x: x / (n || 1), y: y / (n || 1) };
  }
  function away(u, f, d) {
    const n = norm(u.x - f.x, u.y - f.y);
    return { x: clamp(u.x + n.x * d, TILE, SQ.WPX - TILE), y: clamp(u.y + n.y * d, TILE, SQ.HPX - TILE) };
  }
  function nearestFoe(W, x, y, maxD) {
    let best = null, bd = maxD;
    W.foes.forEach(f => {
      if (f.dead) return;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bd) { bd = d; best = f; }
    });
    return best;
  }
  // Món "đáng đi nhất": giá trị chia cho quãng đường, chưa ai nhận.
  function bestLoot(R, u, maxD, lightOnly) {
    let best = null, bs = -1;
    const mass = bagMass(u);
    R.W.loot.forEach(l => {
      if (l.done || l.held != null) return;
      if (!claimOk(R, u, l)) return;
      if (lightOnly && l.mass > 20) return;
      // đừng đi tới thứ mình không nhấc nổi — đó là cách một bot đứng im tới hết ca
      if (u.bag.length && mass + l.mass > u.stats.carry) return;
      if (SQ.solidPx(R.W, l.x, l.y)) return;      // món rơi lọt vào tường: bỏ qua
      const d = Math.hypot(l.x - u.x, l.y - u.y);
      if (d > maxD) return;
      let score = l.value / (d + 60);
      const c = R.claims[l.id];
      if (c && c.i === u.idx) score *= 1.8;         // món mình đã nhắm thì cứ thế mà đi
      if (score > bs) { bs = score; best = l; }
    });
    if (best) claimIt(R, u, best);
    return best ? { x: best.x, y: best.y } : null;
  }
  function unseenRoom(R, u) {
    let best = null, bs = -1;
    R.W.rooms.forEach(rm => {
      let seen = 0, n = 0;
      for (let y = rm.y0; y <= rm.y1; y += 2) for (let x = rm.x0; x <= rm.x1; x += 2) {
        n++; if (R.W.seen[y * SQ.MW + x]) seen++;
      }
      const unknown = 1 - seen / (n || 1);
      const d = Math.hypot(rm.cxp - u.x, rm.cyp - u.y);
      const score = unknown * 1000 - d * 0.4;
      if (score > bs) { bs = score; best = rm; }
    });
    return best ? { x: best.cxp, y: best.cyp } : null;
  }
  function farRoomFrom(R, p) {
    let best = R.W.rooms[0], bd = -1;
    R.W.rooms.forEach(rm => {
      const d = Math.hypot(rm.cxp - p.x, rm.cyp - p.y);
      if (d > bd) { bd = d; best = rm; }
    });
    return best;
  }

  // Bot bấm kỹ năng khi tình huống hợp — chứ không bấm ngay khi hết hồi chiêu.
  function botSkill(R, u, downed, foesNear) {
    if (u.skillT > 0 || u.down || u.out) return;
    const s = u.def.skill, W = R.W;
    const hurt = R.units.filter(o => !o.down && !o.out && o.hp < o.hpMax * 0.62);
    const chased = W.foes.some(f => !f.dead && f.target === u);
    let go = false;
    switch (s.id) {
      case 'flash': go = foesNear.length >= 1 && Math.hypot(foesNear[0].x - u.x, foesNear[0].y - u.y) < 4.5 * TILE; break;
      case 'healring': go = hurt.length >= 2 || (hurt.length === 1 && hurt[0].hp < hurt[0].hpMax * 0.4); break;
      case 'gong': go = bagMass(u) > u.stats.carry * 0.5; break;
      case 'unlock': go = W.doors.some(d => d.jam && Math.hypot(d.x - u.x, d.y - u.y) < 7 * TILE); break;
      case 'vanish': go = chased && u.hp < u.hpMax * 0.7; break;
      case 'shock': go = foesNear.filter(f => Math.hypot(f.x - u.x, f.y - u.y) < 4.5 * TILE).length >= 1; break;
      case 'decoy': go = W.foes.some(f => !f.dead && f.target && f.target.player); break;
      case 'rescue': go = downed.length >= 1; break;
      case 'cage': go = chased && foesNear.length >= 2; break;
      case 'blink': go = !!u.want && Math.hypot((u.want.x - u.x), (u.want.y - u.y)) > 9 * TILE; break;
      case 'reveal': go = R.t > 6 && seenFrac(R) < 0.5; break;
      case 'freeze': go = foesNear.length >= 2 || (foesNear.length === 1 && foesNear[0].hp > foesNear[0].hpMax * 0.7); break;
      case 'pull': go = looseCount(R, u, s.radius * TILE) >= 3; break;
      case 'angel': go = downed.length >= 2 || R.units.some(o => !o.down && !o.out && o.hp < o.hpMax * 0.25); break;
    }
    if (go) useSkill(R, u);
  }
  function looseCount(R, u, rad) {
    let n = 0;
    R.W.loot.forEach(l => { if (!l.done && !l.held && Math.hypot(l.x - u.x, l.y - u.y) < rad) n++; });
    return n;
  }
  function seenFrac(R) {
    let n = 0;
    for (let i = 0; i < R.W.seen.length; i += 7) if (R.W.seen[i]) n++;
    return n / (R.W.seen.length / 7);
  }

  // ---------------------------------------------------------------------------
  // sương mù: mỗi người soi ra một vùng, vùng đã soi thì mờ đi chứ không đen lại.
  // ---------------------------------------------------------------------------
  let visAcc = 0;
  function updateVision(R, dt) {
    visAcc += dt;
    if (visAcc < 0.08) return;
    visAcc = 0;
    const W = R.W, MW = SQ.MW, MH = SQ.MH;
    for (let i = 0; i < W.lit.length; i++) W.lit[i] *= 0.55;
    R.units.forEach(u => {
      if (u.out) return;
      let rad = (u.down ? 4 : 8.5) * u.stats.eye;
      if (R.revealT > 0) rad *= 1.5;
      const rays = 84;
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let step = 0; step <= rad; step += 0.6) {
          const x = u.x + dx * step * TILE, y = u.y + dy * step * TILE;
          const gx = Math.floor(x / TILE), gy = Math.floor(y / TILE);
          if (gx < 0 || gy < 0 || gx >= MW || gy >= MH) break;
          const i = gy * MW + gx;
          W.seen[i] = 1;
          W.lit[i] = Math.max(W.lit[i], 1 - step / rad * 0.55);
          if (W.grid[i] === SQ.WALL) break;
        }
      }
    });
    if (R.revealT > 0) W.seen.fill(1);
  }

  // ---------------------------------------------------------------------------
  function nextFloor(R) {
    if (R.state !== 'floorclear') return R;
    if (R.floor >= R.map.floors) {
      R.state = 'win';
      return R;
    }
    R.floor++;
    R.state = 'play';
    buildFloor(R);
    return R;
  }
  function abandonRun(R) {
    if (R.state === 'play' || R.state === 'floorclear') R.state = 'lose';
    return R;
  }
  // Ai còn đứng, ai đang nhìn thấy gì — dùng cho HUD và cho bài kiểm thử.
  function runState(R) {
    return {
      floor: R.floor, floors: R.map.floors, state: R.state,
      quota: R.W.quota, delivered: R.W.pad.delivered,
      loot: R.stats.loot, kills: R.stats.kills, skills: R.stats.skills,
      revives: R.stats.revives, floorsDone: R.stats.floorsDone,
      alive: R.units.filter(u => !u.down && !u.out).length,
      down: R.units.filter(u => u.down).length,
      lootLeft: R.W.loot.filter(l => !l.done).length,
      foesAlive: R.W.foes.filter(f => !f.dead).length,
      t: R.t
    };
  }

  SQ.startRun = startRun;
  SQ.stepRun = stepRun;
  SQ.nextFloor = nextFloor;
  SQ.abandonRun = abandonRun;
  SQ.runState = runState;
  SQ.hurtUnit = hurtUnit;

})(window);
