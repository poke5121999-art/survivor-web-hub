/*
 * Quỹ Đạo — Mốc 1. Hai bản dựng thử trong một tệp.
 *
 * Đây KHÔNG phải một game. Nó là dụng cụ đo, dựng để trả lời đúng một câu hỏi
 * của RESEARCH.md mục 9, và nó chỉ trả lời được bằng ngón cái chứ không bằng
 * lý lẽ:
 *
 *   A — "NỐI"    giữ đồ thị, bỏ băng chuyền. Máy nối máy bằng HAI CÚ CHẠM.
 *                Băng thông tụt theo khoảng cách; mỗi máy có số cổng hữu hạn;
 *                hết cổng thì phải dựng nhà trung chuyển.
 *   B — "KHO"    mô hình Deep Town. Máy độc lập, rút từ kho chung, trả về kho
 *                chung. Không có gì để nối.
 *
 * Hai bản dùng CHUNG mọi thứ — cùng bản đồ (cùng seed), cùng ba máy, cùng công
 * thức, cùng thời gian chế biến, cùng joystick, cùng 3 phút. Khác biệt duy nhất
 * là tầng vận chuyển. Đó là toàn bộ điểm của thí nghiệm: nếu để lệch thêm bất
 * cứ thứ gì thì kết quả so sánh không đọc được nữa.
 *
 * Cuối phiên hiện ba con số cho mỗi bản: điểm, số cú chạm, quãng đường đi. Điểm
 * một mình không kết luận được gì — "điểm trên mỗi cú chạm" mới là thứ phân biệt
 * một trò chơi bố cục với một cái nút.
 *
 * Luật ngón cái (RESEARCH.md 5.3), áp lên từng dòng dưới đây:
 *   việc LIÊN TỤC nằm trên stick — đi.
 *   việc RỜI RẠC là một cú chạm khi đứng yên — đặt máy, nối, nhặt.
 * Không thao tác nào bắt vừa giữ stick vừa chạm chính xác.
 */
(function () {
'use strict';

// ---------------------------------------------------------------- hằng số

var GRID_W = 12;              // rộng bằng đúng khung dọc, nên chỉ cuộn DỌC
var GRID_H = 40;
var SESSION = 180;            // giây — bằng phiên chơi 3 phút ở RESEARCH.md mục 6
var PLAYER_SPD = 5.6;         // ô/giây
var REACH = 4.2;              // ô — tầm với khi đặt máy. Buộc phải ĐI tới chỗ đặt,
                              // nên stick vẫn là thứ dẫn nhịp chứ không phải trang trí.
var HOLD_CAP = 12;            // sức chứa trong một máy
var BAG_CAP = 12;
var STICK_DEAD = 0.14;        // lấy nguyên từ games/repo2d/game.js — đã chỉnh trên tay thật

// Băng thông của một liên kết, món/giây, theo khoảng cách d (ô).
// 2/(1+d/4): 2 ô = 1,33/s · 4 ô = 1,00/s · 8 ô = 0,67/s · 16 ô = 0,40/s.
//
// WHY không tuyến tính về 0: một liên kết xa phải TỆ, không được CHẾT — chết thì
// người chơi học "đừng nối xa", tệ thì người chơi học "dời máy lại gần", và cái
// thứ hai mới là trò chơi bố cục mà mục 5.1 muốn giữ.
//
// WHY con số này chứ không phải con số đầu tiên: bản đầu dùng 5/(1+d/5) và
// tools/smoke.js đo ra hai bản CÙNG 33 điểm — vì mọi liên kết, kể cả dài 16 ô,
// vẫn chở nhanh hơn thứ dây chuyền sinh ra (một Khoan cho 0,77 quặng/giây). Ràng
// buộc có mặt trên màn hình nhưng không cắn vào đâu, nên bản A tụt xuống thành
// bản B có thêm thao tác. Thang mới đặt ngưỡng ngay giữa nhu cầu thật: nối gọn
// (≤4 ô) thì thoải mái, nối ẩu (≥8 ô) thì nghẽn thấy được.
function linkRate(d) { return 2 / (1 + d / 4); }

var KINDS = {
  drill: { nm:'Khoan',       ch:'K', cost:2, out:'ore',   time:1.3, mi:0, mo:1, col:'#8ea3bd', onOre:true },
  smelt: { nm:'Lò nung',     ch:'L', cost:3, out:'plate', time:2.0, mi:2, mo:1, col:'#c9743a', rec:{ore:2} },
  asm:   { nm:'Máy chế',     ch:'C', cost:4, out:'gear',  time:2.6, mi:2, mo:1, col:'#4f8fc0', rec:{plate:2} },
  relay: { nm:'Trung chuyển',ch:'T', cost:2, out:null,    time:0,   mi:1, mo:3, col:'#7a6ba0', pass:true },
  hub:   { nm:'Bến phóng',   ch:'B', cost:0, out:null,    time:0.6, mi:3, mo:0, col:'#e0b04a', rec:{gear:1}, sink:true }
};
var BUILDABLE = ['drill', 'smelt', 'asm', 'relay'];   // relay bị ẩn ở bản B
var ITEM_COL = { ore:'#b98a4e', plate:'#d9dee6', gear:'#7fd4a8' };

// ---------------------------------------------------------------- trạng thái

var cv, ctx, W = 0, H = 0, DPR = 1;
var TILE = 32, topH = 58, botH = 168;
var S = null;                 // ván đang chơi
var results = { A:null, B:null };
var toasts = [];

function mulberry32(a) {      // PRNG có seed — hai bản PHẢI nhận cùng bản đồ
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function newGame(mode) {
  var rnd = mulberry32(20260831);
  var ore = [];
  for (var y = 5; y < GRID_H; y++) {
    // Càng xuống sâu càng nhiều mỏ — lý do để ĐI xuống, và lý do khiến khoảng
    // cách từ mỏ về Bến phóng lớn dần. Ở bản A đó là sức ép; ở bản B nó không
    // có nghĩa gì cả, và chính sự khác nhau đó là thứ cần nhìn thấy.
    var n = y < 14 ? 1 : (y < 26 ? 2 : 3);
    for (var i = 0; i < n; i++) {
      var x = Math.floor(rnd() * GRID_W);
      if (!ore.some(function (o) { return o.x === x && o.y === y; })) ore.push({ x:x, y:y });
    }
  }
  var s = {
    mode: mode, t: 0, over: false,
    ore: ore, mach: [], links: [],
    store: { ore:0, plate:0, gear:0 },   // chỉ bản B dùng
    bag: { it:null, n:0 },
    scrap: 10, score: 0, gearAcc: 0,
    px: GRID_W / 2, py: 3.6, pdir: 1,
    build: null, sel: null,
    taps: 0, dist: 0
  };
  place(s, 'hub', Math.floor(GRID_W / 2), 2, true);
  return s;
}

function place(s, k, x, y, free) {
  var K = KINDS[k];
  if (!free && s.scrap < K.cost) { toast('Thiếu mảnh: cần ' + K.cost); return false; }
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  if (machAt(s, x, y)) { toast('Ô đã có máy'); return false; }
  if (K.onOre && !oreAt(s, x, y)) { toast('Máy khoan phải đặt trên mỏ'); return false; }
  if (!free && Math.hypot(x + .5 - s.px, y + .5 - s.py) > REACH) { toast('Xa quá — đi tới gần hơn'); return false; }
  if (!free) s.scrap -= K.cost;
  s.mach.push({ k:k, x:x, y:y, hold:{}, prog:0, busy:false, nOut:0, nIn:0, rr:0 });
  return true;
}

function machAt(s, x, y) {
  for (var i = 0; i < s.mach.length; i++) if (s.mach[i].x === x && s.mach[i].y === y) return s.mach[i];
  return null;
}
function oreAt(s, x, y) {
  for (var i = 0; i < s.ore.length; i++) if (s.ore[i].x === x && s.ore[i].y === y) return true;
  return false;
}
function held(m) { var n = 0; for (var k in m.hold) n += m.hold[k]; return n; }
function give(m, it) { m.hold[it] = (m.hold[it] || 0) + 1; }
function take(m, it) { if (!m.hold[it]) return false; m.hold[it]--; if (!m.hold[it]) delete m.hold[it]; return true; }

// Máy này CHO ra thứ gì qua một liên kết, và NHẬN vào thứ gì.
// Nhà trung chuyển nhận và cho mọi thứ — nó là splitter, chỉ khác là một toà nhà
// đặt một lần thay vì một hình vẽ phải kéo (RESEARCH.md 5.1).
function gives(m, it) { var K = KINDS[m.k]; return K.pass ? true : K.out === it; }
function wants(m, it) {
  var K = KINDS[m.k];
  if (K.pass) return true;
  return !!(K.rec && K.rec[it]);
}

// ---------------------------------------------------------------- mô phỏng

function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (s.t >= SESSION) { s.t = SESSION; s.over = true; finish(s); return; }

  var i, m, K;

  // --- máy chạy. Phần này KHÔNG biết bản A hay B: cùng công thức, cùng thời gian.
  for (i = 0; i < s.mach.length; i++) {
    m = s.mach[i]; K = KINDS[m.k];
    if (K.pass) continue;

    if (!m.busy) {
      var ok = true;
      if (K.rec) {
        for (var it in K.rec) {
          var have = s.mode === 'B' && !K.sink ? s.store[it] : (m.hold[it] || 0);
          if (s.mode === 'B' && K.sink) have = s.store[it];      // Bến phóng ở bản B cũng rút kho
          if (have < K.rec[it]) { ok = false; break; }
        }
      }
      if (ok && K.out && s.mode === 'A' && held(m) >= HOLD_CAP) ok = false;
      if (ok) {
        if (K.rec) for (var it2 in K.rec) {
          for (var c = 0; c < K.rec[it2]; c++) {
            if (s.mode === 'B') s.store[it2]--; else take(m, it2);
          }
        }
        m.busy = true; m.prog = 0;
      }
    }
    if (m.busy) {
      m.prog += dt;
      if (m.prog >= K.time) {
        m.busy = false; m.prog = 0;
        if (K.sink) {
          s.score++; s.gearAcc++;
          if (s.gearAcc >= 2) { s.gearAcc = 0; s.scrap++; }
        } else if (K.out) {
          if (s.mode === 'B') s.store[K.out]++; else give(m, K.out);
        }
      }
    }
  }

  // --- tầng vận chuyển: đây, và CHỈ đây, là chỗ hai bản khác nhau.
  if (s.mode === 'A') {
    for (i = 0; i < s.links.length; i++) {
      var L = s.links[i], a = L.a, b = L.b;
      L.acc += linkRate(L.d) * dt;
      while (L.acc >= 1) {
        L.acc -= 1;
        var moved = null;
        for (var it3 in a.hold) {
          if (a.hold[it3] > 0 && gives(a, it3) && wants(b, it3) && held(b) < HOLD_CAP) { moved = it3; break; }
        }
        if (!moved) { L.acc = Math.min(L.acc, 1); break; }
        take(a, moved); give(b, moved);
        L.flash = 0.25;
      }
      if (L.flash > 0) L.flash -= dt;
    }
  }
  // Bản B không có vòng lặp nào ở đây. Đó chính là cái nó mua, và cái nó bán.

  for (i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= dt; if (toasts[i].t <= 0) toasts.splice(i, 1); }
}

function finish(s) {
  results[s.mode] = { score:s.score, taps:s.taps, dist:Math.round(s.dist), mach:s.mach.length, links:s.links.length };
}

// ---------------------------------------------------------------- hành động rời rạc

function tapWorld(s, wx, wy) {
  var x = Math.floor(wx), y = Math.floor(wy);
  s.taps++;

  if (s.build) {                       // đang chọn máy để đặt → chạm là ĐẶT
    if (place(s, s.build, x, y)) s.build = null;
    return;
  }
  var m = machAt(s, x, y);
  if (s.mode !== 'A') { s.sel = m; return; }

  // Bản A — hai cú chạm là một liên kết.
  if (!m) { s.sel = null; return; }
  if (!s.sel) { s.sel = m; return; }
  if (s.sel === m) { s.sel = null; return; }
  link(s, s.sel, m);
  s.sel = null;
}

function link(s, a, b) {
  var Ka = KINDS[a.k], Kb = KINDS[b.k];
  if (a.nOut >= Ka.mo) { toast(Ka.nm + ' hết cổng ra — cần nhà trung chuyển'); return; }
  if (b.nIn >= Kb.mi)  { toast(Kb.nm + ' hết cổng vào'); return; }
  for (var i = 0; i < s.links.length; i++) if (s.links[i].a === a && s.links[i].b === b) { toast('Đã nối rồi'); return; }
  var ok = false;
  for (var it in ITEM_COL) if (gives(a, it) && wants(b, it)) ok = true;
  if (!ok) { toast(Kb.nm + ' không nhận thứ ' + Ka.nm + ' làm ra'); return; }
  var d = Math.hypot(a.x - b.x, a.y - b.y);
  a.nOut++; b.nIn++;
  s.links.push({ a:a, b:b, d:d, acc:0, flash:0 });
  toast('Nối · ' + linkRate(d).toFixed(1) + ' món/giây');
}

// Nút LÀM: đổi đồ với máy gần nhất. Một nút, nghĩa lấy từ chỗ đang đứng — đúng
// luật "đến gần rồi nó tự làm" học từ Pickaxe King Island (RESEARCH.md mục 3).
function doAct(s) {
  s.taps++;
  var best = null, bd = 1.9;
  for (var i = 0; i < s.mach.length; i++) {
    var m = s.mach[i], d = Math.hypot(m.x + .5 - s.px, m.y + .5 - s.py);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) { toast('Đứng cạnh một cái máy đã'); return; }
  if (s.mode === 'B') { toast('Bản B không cần cầm tay — kho là chung'); return; }

  if (s.bag.n > 0) {
    if (!wants(best, s.bag.it)) { toast(KINDS[best.k].nm + ' không nhận ' + s.bag.it); return; }
    var moved = 0;
    while (s.bag.n > 0 && held(best) < HOLD_CAP) { give(best, s.bag.it); s.bag.n--; moved++; }
    if (!s.bag.n) s.bag.it = null;
    toast('Bỏ vào ' + moved);
    return;
  }
  for (var it in best.hold) {
    if (best.hold[it] > 0 && gives(best, it)) {
      var n = 0;
      while (best.hold[it] > 0 && n < BAG_CAP) { take(best, it); n++; }
      s.bag.it = it; s.bag.n = n; toast('Cầm ' + n + ' ' + it);
      return;
    }
  }
  toast('Máy chưa có gì để lấy');
}

function toast(msg) { toasts.push({ m:msg, t:2.2 }); if (toasts.length > 3) toasts.shift(); }

// ---------------------------------------------------------------- bố cục

// Dải ngón cái dưới cùng THUỘC VỀ stick. Quy tắc chép nguyên từ
// games/repo2d/game.js:6340 — ở đó nó ra đời sau khi nút cạnh stick liên tục
// cướp mất cú chạm đang định lái. Ở đây stick nằm GIỮA (đề bài), nên luật thành:
// một phần ba giữa của dải là stick, hai bên là nút, không có vùng tranh chấp.
function layout() {
  var L = {};
  L.top = topH;
  L.bot = H - botH;
  L.stickR = Math.min(W * 0.19, 62);
  L.stickX = W / 2;
  L.stickY = H - botH / 2 + 6;
  L.btnR = Math.min(W * 0.115, 40);
  L.buildX = L.btnR + 16; L.buildY = L.stickY;
  L.actX = W - L.btnR - 16; L.actY = L.stickY;
  L.midL = W * 0.5 - W * 0.18;   // biên vùng stick
  L.midR = W * 0.5 + W * 0.18;
  return L;
}
function inBand(L, y) { return y > L.bot; }

// ---------------------------------------------------------------- nhập liệu

var stick = null, camY = 0;

function toStage(e) {
  var r = cv.getBoundingClientRect();
  return { x:(e.clientX - r.left) * (W / r.width), y:(e.clientY - r.top) * (H / r.height) };
}

function onDown(e) {
  var p = toStage(e), L = layout();
  if (S.over) { hitResult(p); return; }

  if (inBand(L, p.y)) {
    if (p.x > L.midL && p.x < L.midR) {
      // Stick CỐ ĐỊNH ở giữa. WHY không nổi: repo2d đã thử stick nổi cho trục di
      // chuyển rồi bỏ — origin nhảy theo ngón làm hướng lái mất mốc. Ở đây còn
      // một lý do nữa: chỉ có MỘT stick, nên nó có quyền chiếm một chỗ cố định.
      stick = { id:e.pointerId, x:p.x, y:p.y };
    } else if (Math.hypot(p.x - L.buildX, p.y - L.buildY) < L.btnR * 1.35) {
      S.taps++;
      S.build = S.build ? null : (BUILDABLE[0]);
      S.sel = null;
    } else if (Math.hypot(p.x - L.actX, p.y - L.actY) < L.btnR * 1.35) {
      doAct(S);
    }
    return;
  }
  // hàng chọn máy, khi bảng xây đang mở
  if (S.build && p.y > L.bot - 54 && p.y < L.bot - 4) {
    var list = pickList();
    var bw = W / list.length;
    var idx = Math.floor(p.x / bw);
    if (idx >= 0 && idx < list.length) { S.taps++; S.build = list[idx]; }
    return;
  }
  if (p.y > L.top && p.y < L.bot) {
    tapWorld(S, p.x / TILE, (p.y - L.top + camY) / TILE);
  }
}
function onMove(e) { if (stick && stick.id === e.pointerId) { var p = toStage(e); stick.x = p.x; stick.y = p.y; } }
function onUp(e)   { if (stick && stick.id === e.pointerId) stick = null; }

function pickList() { return S.mode === 'A' ? BUILDABLE : BUILDABLE.filter(function (k) { return k !== 'relay'; }); }

// Mất tiêu điểm là mất pointerup. repo2d ghi lại đúng con bọ này: alt-tab giữa
// lúc đang lái để lại một stick không ai xoá, và nhân vật tự đi mãi.
window.addEventListener('blur', function () { stick = null; });
document.addEventListener('visibilitychange', function () { if (document.hidden) stick = null; });

function hitResult(p) {
  var by = H * 0.62;
  if (p.y > by && p.y < by + 52) { S = newGame(S.mode); return; }
  if (p.y > by + 60 && p.y < by + 112) { S = newGame(S.mode === 'A' ? 'B' : 'A'); return; }
}

// ---------------------------------------------------------------- vẽ

function draw() {
  var L = layout();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#070b11'; ctx.fillRect(0, 0, W, H);

  // camera dọc bám người chơi, chặn hai đầu
  var viewH = L.bot - L.top;
  var want = S.py * TILE - viewH * 0.45;
  camY += (want - camY) * 0.16;
  camY = Math.max(0, Math.min(GRID_H * TILE - viewH, camY));

  ctx.save();
  ctx.beginPath(); ctx.rect(0, L.top, W, viewH); ctx.clip();
  ctx.translate(0, L.top - camY);

  drawWorld(L);

  ctx.restore();
  drawHud(L);
  if (S.over) drawResult(L);
}

function drawWorld(L) {
  var y0 = Math.floor(camY / TILE) - 1, y1 = y0 + Math.ceil((L.bot - L.top) / TILE) + 2;
  var x, y, i;

  for (y = Math.max(0, y0); y < Math.min(GRID_H, y1); y++) {
    for (x = 0; x < GRID_W; x++) {
      var deep = y / GRID_H;
      ctx.fillStyle = ((x + y) & 1) ? shade(14 + deep * 10) : shade(11 + deep * 10);
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  // mỏ
  for (i = 0; i < S.ore.length; i++) {
    var o = S.ore[i];
    if (o.y < y0 || o.y > y1) continue;
    ctx.fillStyle = '#6b5230';
    ctx.beginPath(); ctx.arc(o.x * TILE + TILE / 2, o.y * TILE + TILE / 2, TILE * 0.33, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#b98a4e';
    ctx.beginPath(); ctx.arc(o.x * TILE + TILE / 2 - 2, o.y * TILE + TILE / 2 - 2, TILE * 0.17, 0, 6.2832); ctx.fill();
  }

  // liên kết — chỉ bản A. Liên kết của máy đang chọn vẽ đậm, còn lại mờ hẳn:
  // đây là phòng trước cho 7.2 (lưới nối rối mắt trên màn nhỏ).
  if (S.mode === 'A') {
    for (i = 0; i < S.links.length; i++) {
      var Lk = S.links[i];
      var hot = S.sel && (Lk.a === S.sel || Lk.b === S.sel);
      var ax = Lk.a.x * TILE + TILE / 2, ay = Lk.a.y * TILE + TILE / 2;
      var bx = Lk.b.x * TILE + TILE / 2, by = Lk.b.y * TILE + TILE / 2;
      ctx.strokeStyle = hot ? 'rgba(140,220,255,.95)' : 'rgba(120,150,180,.22)';
      ctx.lineWidth = hot ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (Lk.flash > 0) {
        var t = 1 - Lk.flash / 0.25;
        ctx.fillStyle = '#bfe9ff';
        ctx.beginPath(); ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 3.5, 0, 6.2832); ctx.fill();
      }
      if (hot) {
        ctx.fillStyle = '#bfe9ff'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(linkRate(Lk.d).toFixed(1) + '/s', (ax + bx) / 2, (ay + by) / 2 - 5);
      }
    }
  }

  // máy
  for (i = 0; i < S.mach.length; i++) drawMach(S.mach[i]);

  // bóng đặt máy
  if (S.build) {
    ctx.strokeStyle = 'rgba(180,230,255,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(S.px * TILE, S.py * TILE, REACH * TILE, 0, 6.2832); ctx.stroke();
  }

  // người chơi
  var pxp = S.px * TILE, pyp = S.py * TILE;
  ctx.fillStyle = '#2ad19a';
  ctx.beginPath(); ctx.arc(pxp, pyp, TILE * 0.28, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#0b1a14';
  ctx.beginPath(); ctx.arc(pxp + S.pdir * TILE * 0.13, pyp, TILE * 0.09, 0, 6.2832); ctx.fill();
  if (S.bag.n > 0) {
    ctx.fillStyle = ITEM_COL[S.bag.it] || '#fff';
    ctx.fillRect(pxp - 9, pyp - TILE * 0.55, 18, 7);
    ctx.fillStyle = '#0b1016'; ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(S.bag.n, pxp, pyp - TILE * 0.55 + 6);
  }
}

function drawMach(m) {
  var K = KINDS[m.k], x = m.x * TILE, y = m.y * TILE;
  var sel = S.sel === m;
  ctx.fillStyle = K.col;
  roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 5); ctx.fill();
  ctx.strokeStyle = sel ? '#bfe9ff' : 'rgba(0,0,0,.5)'; ctx.lineWidth = sel ? 2.5 : 1.5;
  roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 5); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(K.ch, x + TILE / 2, y + TILE / 2 - 1);
  ctx.textBaseline = 'alphabetic';

  if (m.busy && K.time > 0) {                       // tiến trình
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 4, y + TILE - 8, TILE - 8, 4);
    ctx.fillStyle = '#ffe07a'; ctx.fillRect(x + 4, y + TILE - 8, (TILE - 8) * (m.prog / K.time), 4);
  }
  if (S.mode === 'A') {                             // kho trong máy
    var n = 0;
    for (var it in m.hold) {
      if (!m.hold[it]) continue;
      ctx.fillStyle = ITEM_COL[it] || '#fff';
      ctx.fillRect(x + 3 + n * 6, y + 3, 5, 5);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '7px system-ui'; ctx.textAlign = 'left';
      ctx.fillText(m.hold[it], x + 3 + n * 6, y + 15);
      n++;
    }
    // cổng còn trống — thứ khiến người chơi phải nghĩ tới nhà trung chuyển
    if (sel) {
      ctx.fillStyle = '#bfe9ff'; ctx.font = '8px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('vào ' + m.nIn + '/' + K.mi + ' · ra ' + m.nOut + '/' + K.mo, x + TILE / 2, y - 3);
    }
  }
}

function drawHud(L) {
  // ------- thanh trên
  ctx.fillStyle = 'rgba(10,15,22,.92)'; ctx.fillRect(0, 0, W, L.top);
  ctx.fillStyle = '#1b2430'; ctx.fillRect(0, L.top - 1, W, 1);
  ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#dfe7f2';
  ctx.fillText('Bản ' + S.mode + ' — ' + (S.mode === 'A' ? 'NỐI' : 'KHO'), 10, 20);
  ctx.font = '11px system-ui'; ctx.fillStyle = '#8fa2b8';
  ctx.fillText(S.mode === 'A' ? 'chạm máy A rồi máy B để nối' : 'máy độc lập, không nối gì', 10, 35);

  ctx.textAlign = 'right'; ctx.font = 'bold 15px system-ui'; ctx.fillStyle = '#ffd870';
  ctx.fillText('⚙ ' + S.score, W - 10, 20);
  ctx.font = '11px system-ui'; ctx.fillStyle = '#8fa2b8';
  ctx.fillText('mảnh ' + S.scrap + ' · còn ' + Math.ceil(SESSION - S.t) + 's', W - 10, 35);

  if (S.mode === 'B') {
    ctx.textAlign = 'center'; ctx.font = '11px system-ui'; ctx.fillStyle = '#cfd8e4';
    ctx.fillText('kho: ' + S.store.ore + ' quặng · ' + S.store.plate + ' tấm · ' + S.store.gear + ' bánh', W / 2, 50);
  }
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, L.top - 3, W * (S.t / SESSION), 3);

  // ------- thông báo
  ctx.textAlign = 'center'; ctx.font = '12px system-ui';
  for (var i = 0; i < toasts.length; i++) {
    var ty = L.bot - 78 - i * 22;
    var tw = ctx.measureText(toasts[i].m).width + 20;
    ctx.fillStyle = 'rgba(12,18,26,.9)'; roundRect(W / 2 - tw / 2, ty - 14, tw, 20, 10); ctx.fill();
    ctx.fillStyle = '#dfe7f2'; ctx.fillText(toasts[i].m, W / 2, ty);
  }

  // ------- hàng chọn máy
  if (S.build) {
    var list = pickList(), bw = W / list.length;
    ctx.fillStyle = 'rgba(12,18,26,.94)'; ctx.fillRect(0, L.bot - 54, W, 50);
    for (var j = 0; j < list.length; j++) {
      var K = KINDS[list[j]], on = list[j] === S.build;
      ctx.fillStyle = on ? K.col : 'rgba(255,255,255,.07)';
      roundRect(j * bw + 5, L.bot - 50, bw - 10, 42, 7); ctx.fill();
      ctx.fillStyle = on ? '#0b1016' : '#cfd8e4'; ctx.textAlign = 'center';
      ctx.font = 'bold 11px system-ui'; ctx.fillText(K.nm, j * bw + bw / 2, L.bot - 31);
      ctx.font = '10px system-ui'; ctx.fillText(K.cost + ' mảnh', j * bw + bw / 2, L.bot - 17);
    }
  }

  // ------- dải ngón cái
  ctx.fillStyle = 'rgba(10,15,22,.92)'; ctx.fillRect(0, L.bot, W, botH);
  ctx.fillStyle = '#1b2430'; ctx.fillRect(0, L.bot, W, 1);

  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(L.stickX, L.stickY, L.stickR, 0, 6.2832); ctx.stroke();
  var kx = L.stickX, ky = L.stickY;
  if (stick) {
    var dx = stick.x - L.stickX, dy = stick.y - L.stickY, d = Math.hypot(dx, dy) || 1;
    var cl = Math.min(d, L.stickR);
    kx = L.stickX + dx / d * cl; ky = L.stickY + dy / d * cl;
  }
  ctx.fillStyle = 'rgba(220,235,255,.30)';
  ctx.beginPath(); ctx.arc(kx, ky, L.stickR * 0.45, 0, 6.2832); ctx.fill();

  button(L.buildX, L.buildY, L.btnR, S.build ? '#4f8fc0' : 'rgba(255,255,255,.10)', 'XÂY');
  button(L.actX, L.actY, L.btnR, 'rgba(255,255,255,.10)', 'LÀM');
}

function button(x, y, r, col, label) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
  ctx.fillStyle = '#eaf1fa'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 4);
}

function drawResult(L) {
  ctx.fillStyle = 'rgba(6,10,16,.88)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe7f2'; ctx.font = 'bold 20px system-ui';
  ctx.fillText('Hết 3 phút — bản ' + S.mode, W / 2, H * 0.16);

  var rows = [['Bản A — NỐI', results.A], ['Bản B — KHO', results.B]];
  var y = H * 0.24;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i][1];
    ctx.font = 'bold 14px system-ui'; ctx.fillStyle = r ? '#ffd870' : '#4a5666';
    ctx.fillText(rows[i][0], W / 2, y);
    ctx.font = '13px system-ui'; ctx.fillStyle = r ? '#cfd8e4' : '#4a5666';
    if (r) {
      ctx.fillStyle = '#cfd8e4';
      ctx.fillText(r.score + ' bánh · ' + r.taps + ' cú chạm · ' + r.dist + ' ô đi bộ', W / 2, y + 20);
      ctx.fillStyle = '#8fa2b8';
      ctx.fillText((r.score / Math.max(1, r.taps)).toFixed(2) + ' bánh / cú chạm · '
        + r.mach + ' máy' + (r.links ? ' · ' + r.links + ' liên kết' : ''), W / 2, y + 38);
    } else {
      ctx.fillStyle = '#4a5666'; ctx.fillText('chưa chơi', W / 2, y + 20);
    }
    y += H * 0.13;
  }

  var by = H * 0.62;
  ctx.fillStyle = 'rgba(255,255,255,.10)'; roundRect(W * 0.15, by, W * 0.7, 46, 10); ctx.fill();
  ctx.fillStyle = '#eaf1fa'; ctx.font = 'bold 14px system-ui';
  ctx.fillText('Chơi lại bản ' + S.mode, W / 2, by + 29);

  ctx.fillStyle = '#4f8fc0'; roundRect(W * 0.15, by + 60, W * 0.7, 46, 10); ctx.fill();
  ctx.fillStyle = '#08131c'; ctx.font = 'bold 14px system-ui';
  ctx.fillText('Sang bản ' + (S.mode === 'A' ? 'B — KHO' : 'A — NỐI'), W / 2, by + 89);

  ctx.fillStyle = '#7d8da0'; ctx.font = '11px system-ui';
  ctx.fillText('Chơi cả hai rồi so — bằng ngón cái, không bằng bảng.', W / 2, by + 132);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(v) { var n = Math.round(v); return 'rgb(' + n + ',' + (n + 4) + ',' + (n + 9) + ')'; }

// ---------------------------------------------------------------- vòng lặp

function resize() {
  var stage = document.getElementById('stage');
  var aw = window.innerWidth, ah = window.innerHeight;
  var w = aw, h = ah;
  if (aw / ah > 0.62) { h = ah; w = Math.round(h * 0.5); }   // khung điện thoại trên desktop
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = w; H = h;
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  TILE = Math.floor(W / GRID_W);
  botH = Math.min(180, Math.round(H * 0.22));
  topH = 58;
}

var last = 0;
function frame(ts) {
  var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  var L = layout();

  if (!S.over && stick) {
    var dx = stick.x - L.stickX, dy = stick.y - L.stickY, d = Math.hypot(dx, dy);
    if (d > L.stickR * STICK_DEAD) {
      var push = Math.min(1, d / L.stickR);
      var vx = dx / d * push * PLAYER_SPD * dt, vy = dy / d * push * PLAYER_SPD * dt;
      var nx = S.px + vx, ny = S.py + vy;
      S.px = Math.max(0.3, Math.min(GRID_W - 0.3, nx));
      S.py = Math.max(0.3, Math.min(GRID_H - 0.3, ny));
      S.dist += Math.hypot(vx, vy);
      if (Math.abs(vx) > 0.001) S.pdir = vx > 0 ? 1 : -1;
    }
  }
  step(S, dt);
  draw();
  requestAnimationFrame(frame);
}

function boot() {
  cv = document.getElementById('view');
  ctx = cv.getContext('2d');
  window.addEventListener('resize', resize);
  resize();
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  S = newGame('A');
  toast('Bản A: đặt Khoan lên mỏ, rồi chạm máy A → máy B để nối');
  requestAnimationFrame(frame);
  // Cửa sau cho tools/smoke.js. Không có nó thì bộ kiểm phải giả lập cú chạm để
  // đặt được một cái máy, và lúc đó nó đang kiểm hệ toạ độ chứ không kiểm mô phỏng.
  window.__orbit = {
    get S() { return S; }, results: results,
    newGame: function (m) { S = newGame(m); return S; },
    place: place, link: link, step: step, act: doAct, tapWorld: tapWorld,
    draw: draw, linkRate: linkRate, KINDS: KINDS
  };
}
boot();

})();
