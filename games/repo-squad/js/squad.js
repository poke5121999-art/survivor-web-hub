/*
 * Ca Trực Đêm: Biệt Đội — TẦNG NỐI giữa lớp meta (gacha, trang bị, tiến hoá, tổ
 * năm người) và BỘ MÁY của repo2d.
 *
 * WHY file này tồn tại, và vì sao bản Biệt Đội không còn sim riêng:
 *   Bản cũ viết một sim riêng từ đầu. Đếm ra thì nó thiếu gần hết những gì làm nên
 *   trò này — xe đẩy (repo2d 127 chỗ nhắc tới, bản cũ 0), trạm dịch vụ trong ca
 *   (42 / 0), đèn pin hình nón (repo2d có CONE_HALF + CONE_R + canvas ánh sáng;
 *   bản cũ chỉ là một vòng tròn bán kính), thể lực, tủ đồ, ba ô trên tay, đồ dùng,
 *   bắn thử. Bảng quái cũng khác: id `rook` có ở cả hai nhưng NGƯỢC nhau — repo2d
 *   là Kẻ húc (mắt 9 ô, không nghe), bản cũ là Con Ngồi (mù, nghe 9 ô).
 *   Mà repo2d VỐN ĐÃ có tổ đội: MATE_COUNT, makeMate(), crew(), crewAlive().
 *   Nên Biệt Đội = repo2d + kỹ năng + chọn tổ + gacha, chứ không phải một trò khác.
 * SEE: chú thích trong data/games.js về bản Unity — "một luật sửa ở một bên và
 *   không sửa ở bên kia là một luật không ai tin được nữa". Đúng cho cả bản này.
 */
(function (root) {
  'use strict';

  const SQ = root.SQ, REPO = root.REPO;
  if (!SQ || !REPO) return;
  const H = REPO.hooks, S = REPO.S, TILE = REPO.TILE;
  const SD = SQ.squad = {};

  // Ván đang chạy: map nào, tầng mấy. null = đang ở menu.
  let run = null;
  SD.run = () => run;

  // ---------------------------------------------------------------------------
  // CHỈ SỐ: lớp meta quyết định mỗi người trong tổ khoẻ tới đâu
  // ---------------------------------------------------------------------------
  // Chỉ số của bản Biệt Đội (hp/atk/spd) không cùng thang với repo2d (hp 100,
  // str 30, speed ~92). Quy đổi theo TỈ LỆ so với xác gốc cấp 1 chứ không nhét
  // thẳng con số, để trang bị và tiến hoá vẫn có tác dụng mà cân bằng của repo2d
  // không bị một cú nhảy thang đo làm hỏng.
  const BASE = { hp: 100, str: 30, speed: 92 };
  // MOC QUY DOI CHUNG cho ca 14 xac: dung dung bang chi so cua xac 3 sao co ban.
  // ROOT-CAUSE cua ban dau: no chia cho chi so goc cua CHINH XAC DO
  //   (m.stats.hp / def.hp). O cap 1, chua trang bi, m.stats.hp == def.hp nen
  //   moi ti so deu bang 1 -> ca 14 xac vao tran GIONG HET NHAU: 100 mau, 30 suc.
  //   Con Seraph 5 sao thi con te hon: nen cua no cao (125 mau) nen cung mot cong
  //   trang bi +20 mau chi thanh ti so 1,16, trong khi Pick 3 sao (100 mau) thanh
  //   1,20 - do hiem BI LAT NGUOC, xac cang xin cang thiet.
  const REF = { hp: 105, atk: 9, spd: 1.0 };
  function statsOf(m) {
    if (!m || !m.stats) return null;
    const def = SQ.CHAR_BY_ID[m.id];
    return {
      charId: m.id,
      name: def ? def.name : 'Tổ',
      col: def ? 'hsl(' + def.hue + ' 55% 58%)' : null,
      hp: Math.round(BASE.hp * (m.stats.hp / REF.hp)),
      str: Math.round(BASE.str * (m.stats.atk / REF.atk)),
      speed: Math.round(BASE.speed * (m.stats.spd / REF.spd))
    };
  }
  // Số bot = số người ĐANG THẬT SỰ trong tổ, trừ xác bạn cầm. Không đặt cứng 4:
  // tài khoản mới chỉ có một xác, và tổ dài ra dần theo số xác quay được.
  H.mateCount = () => Math.max(0, SQ.squadList().length - 1);
  H.mateInfo = i => statsOf(SQ.squadList()[i + 1]);
  H.playerInfo = () => statsOf(SQ.squadList()[0]);

  // ---------------------------------------------------------------------------
  // MAP HỮU HẠN — điểm khác duy nhất về LUẬT so với repo2d
  // ---------------------------------------------------------------------------
  // repo2d chạy vô tận: hết nhà là sang trạm rồi sang nhà tiếp, mãi mãi. Biệt Đội
  // có 9 map, mỗi map 3-5 tầng, hết tầng cuối là phá đảo. Giữa các tầng VẪN vào
  // trạm dịch vụ như repo2d — đó là chỗ mua đồ, cất tủ, bắn thử.
  //
  // Độ khó không tự viết lại: quy (map, tầng) về một con số rồi ép vào S.level,
  // để đường cong chỉ tiêu/quái/số bệ vẫn đúng là đường cong của repo2d.
  // Dem DON tang tu tang 1 cua map dau tien den tang cuoi cua map cuoi.
  // ROOT-CAUSE cua ban dau, (tier-1)*3 + floor: cac map dai 3/4/5 tang xen ke nhau
  //   nen buoc nhay 3 khong khop. Bang thuc te: map tier 2 ket thuc o 7, map tier 3
  //   BAT DAU cung o 7 (trung), roi tier 3 ket thuc o 11 con tier 4 bat dau o 10 -
  //   TUT LUI hai bac. Sang map moi ma quai it di la mot loi nguoi choi thay ngay.
  //   Va so lon nhat la 29 trong khi repo2d bao hoa o 20, nen 12 tang cuoi cua ca
  //   game giong het nhau.
  const FLOOR0 = (function () {
    const o = {}; let n = 0;
    SQ.MAPS.forEach(m => { o[m.id] = n; n += m.floors; });
    o.__total = n;                        // 36 tang cho ca chin map
    return o;
  })();
  const DIFF_CAP = 20;                    // repo2d bao hoa o day: difficultyCurve() = 1.0 tu 20
  function levelIndex() {
    if (!run) return 1;
    const idx = FLOOR0[run.mapId] + run.floor;                    // 1..36
    const t = (idx - 1) / Math.max(1, FLOOR0.__total - 1);        // 0..1
    return Math.max(1, Math.min(DIFF_CAP, Math.round(1 + t * (DIFF_CAP - 1))));
  }
  H.levelIndex = levelIndex;

  H.onLevelClear = function () {
    if (!run) return false;
    const m = SQ.MAP_BY_ID[run.mapId];
    const st = SQ.M.maps[run.mapId];
    run.floorsDone = run.floor;
    if (run.floor > st.floor) st.floor = run.floor;
    if (run.floor >= m.floors) { finish(true); return true; }
    run.floor++;
    // S.time bat dau lai tu 0 o moi tang, nen mot ky nang vua dung o cuoi tang truoc
    // se co skillT nam TRONG TUONG LAI so voi dong ho cua tang moi -> nut chieu khoa
    // cung them dung bang thoi gian da choi o tang truoc. Xoa moc di la xong.
    skillT = -999;
    return false;                       // chưa hết map -> bộ máy mở trạm như thường
  };

  // Ca to guc. Bo may hoi truoc khi no dung bang "Lam lai tu man 1" - bang do o day
  // la sai: nut do goi startLevel() ma levelIndex() lai ep ve dung tang vua chet,
  // tuc la thua khong mat gi va cay lai vo han ngay tai cho.
  H.onCrewWiped = function () {
    if (!run) return false;
    run.floorsDone = Math.max(0, run.floor - 1);
    finish(false);
    return true;
  };

  // Trượt chỉ tiêu là cách thứ BA để một ca kết thúc, và trước bản này nó là cách duy nhất
  // không được hook. Bộ máy tự dựng bảng "Làm lại từ màn 1", mà nút đó gọi startLevel() —
  // và H.levelIndex() bên dưới ép nó về ĐÚNG TẦNG VỪA TRƯỢT. Thua không mất gì, cày lại vô
  // hạn ngay tại chỗ: đúng cái bẫy mà H.onCrewWiped đã được viết ra để chặn.
  H.onShiftLost = function () {
    if (!run) return false;
    run.floorsDone = Math.max(0, run.floor - 1);
    finish(false);
    return true;
  };

  // Bộ máy vấp lỗi mà không tự gỡ được thì đường ra là VỀ MENU, không phải một tấm màn phủ
  // nằm dưới luật CSS `body:not(.in-run) #veil{display:none}` — tấm màn đó ở đây là vô hình.
  H.onEngineError = function () {
    if (!run) { document.body.classList.remove('in-run'); try { SQ.ui.render(); } catch (e) {} return true; }
    run.floorsDone = Math.max(0, run.floor - 1);
    finish(false);
    return true;
  };

  // Ban phim cua bo may phai cam khi dang o menu ngoai ca.
  H.menuMode = () => !run;

  // Gia tri THAT SU giao duoc len be, khong phai so lan giao. Mot lan giao 4.000 va
  // mot lan giao 40 la hai chuyen khac han nhau; dem "+1" thi khong phan biet noi.
  H.onPayout = function (taken) { if (run) run.loot += taken || 0; };

  // MOT duong ra duy nhat cho moi ket cuc. Truoc day clearMap() tu tinh thuong,
  // tu cong counters roi grant() thang - trong khi SQ.finishRun() da lam dung viec
  // do, con cong them M.day / M.week ma ca chuc nhiem vu hang ngay/hang tuan doc.
  // Hai so ke toan song song thi mot cai luon sai; day giu lai cai day du hon.
  function finish(won) {
    if (!run) return;
    const map = SQ.MAP_BY_ID[run.mapId];
    let reward = null;
    // Sổ sách hỏng thì vẫn phải RA KHỎI CA. Trước bản này SQ.finishRun() ném lỗi là cú ngoặc
    // bay ngược lên tận vòng vẽ của bộ máy — mà vòng đó gọi lại rAF ở dòng cuối, nên nó chết
    // hẳn: `in-run` còn bật (menu bị ẩn), tấm màn phủ chưa kịp hiện, canvas đứng hình. Và nút
    // "Bỏ ca" trên thanh trên lại gọi đúng finish() này, nên bấm bao nhiêu lần cũng vậy.
    try { reward = calcReward(won); }
    catch (e) { console.error('Tính thưởng không được:', e); }
    SD.endRun(won ? 'win' : 'lose', map, reward);
  }
  function calcReward(won) {
    return SQ.finishRun({
      mapId: run.mapId,
      floorsDone: run.floorsDone || 0,
      won: won,
      lootValue: run.loot,
      kills: S.kills || 0,
      skills: run.skills,
      revives: S.revives || 0
    });
  }

  // ---------------------------------------------------------------------------
  // KỸ NĂNG — mười bốn cái, dựng trên nguyên thuỷ có sẵn của bộ máy
  // ---------------------------------------------------------------------------
  let skillT = 0;                       // thời điểm dùng gần nhất
  function leadDef() {
    const l = SQ.squadList()[0];
    return l ? SQ.CHAR_BY_ID[l.id] : null;
  }
  function skillCd() {
    const l = SQ.squadList()[0];
    const d = leadDef();
    if (!d) return 99;
    return d.skill.cd * (1 - (l.stats ? l.stats.cd : 0));
  }
  // REPO.foesAll() chu khong phai S.monsters: con ma guong khong nam trong danh sach
  // quai, nen moi ky nang truoc day deu di qua no - choi loa khong choang no, dong
  // bang khong lam no cham, long sat khong chan no. Nguoi choi bao dung mot cai:
  // "con ma guong dung choi loa khong choang duoc".
  // f.hp == null la con ma guong: no khong co mau va khong giet duoc, nhung van dinh
  // moi hieu ung khac.
  const foes = () => (REPO.foesAll ? REPO.foesAll() : (S.monsters || []))
    .filter(f => f.hp == null || f.hp > 0);
  const near = (x, y, rTiles) => foes().filter(f => Math.hypot(f.x - x, f.y - y) < rTiles * TILE);

  // ---------------------------------------------------------------------------
  // HIỆU ỨNG KÉO DÀI
  // Nhiều kỹ năng hứa một khoảng thời gian ("6 giây", "9 giây") chứ không phải một
  // cú đánh. Bản đầu chỉ chạy đúng một khung hình rồi thôi, nên "hồi 9 máu mỗi giây
  // trong 6 giây" thành một cục 18,9 máu, còn "kéo hết về trong 9 giây" thành 3 giây.
  // FX là danh sách những thứ đang chạy; H.onTick nhả chúng ra từng khung một.
  let FX = [];
  H.onTick = function (dt) {
    if (!FX.length) return;
    for (const f of FX) { f.t -= dt; if (f.tick) f.tick(dt); }
    const xong = FX.filter(f => f.t <= 0);
    for (const f of xong) if (f.end) f.end();
    FX = FX.filter(f => f.t > 0);
  };
  function addFx(f) { FX.push(f); return f; }

  const SKILLS = {

    // Chói Loà — loé đèn vào mặt: quái đứng hình VÀ ù tai, nên trong lúc đó tiếng
    // chân của bạn cũng không kéo được chúng về.
    // m.sleep là cách DUY NHẤT bộ máy hiểu "đứng hình" (stepMonsters bỏ qua hẳn con
    // đang sleep). Trường m.stun mà bản đầu gán chỉ có nghĩa với Kẻ Húc, và còn RÚT
    // NGẮN cú tự choáng 6 giây của nó xuống — tức là bấm kỹ năng để giúp quái.
    flash: (p, d) => {
      const bi = near(p.x, p.y, d.radius).filter(f => REPO.losClear(p.x, p.y, f.x, f.y));
      bi.forEach(f => { REPO.foeSleep(f, d.dur); REPO.foeDeafen(f, d.dur); });
      return bi.length ? 'Loé vào mặt ' + bi.length + ' con' : 'Không con nào nhìn thấy';
    },

    // Vòng Hồi — vòng sáng ĐẶT TẠI CHỖ, không đi theo người: ai bước vào thì hồi,
    // ai bước ra thì thôi. Đúng như mô tả, và đúng cái làm nó thành một quyết định
    // vị trí chứ không phải một nút bấm.
    healring: (p, d) => {
      const cx = p.x, cy = p.y, R = d.radius * TILE;
      addFx({
        t: d.dur, kind: 'heal', x: cx, y: cy, r: R,
        tick: dt => {
          REPO.crew().forEach(a => {
            if (!a || a.down) return;                       // người đang gục phải được ĐỠ DẬY, không phải bơm máu
            if (Math.hypot(a.x - cx, a.y - cy) > R) return;
            a.hp = Math.min(a.hpMax, a.hp + d.heal * dt);
          });
        }
      });
      return 'Vòng hồi ' + d.dur + 's';
    },

    // Gồng — bỏ phạt trọng lượng VÀ nhanh hơn 30%. hasteT là trường của bộ máy;
    // p.stam = stamMax chỉ nạp lại thể lực, tự nó không làm ai nhanh hơn một chút nào.
    gong: (p, d) => {
      p.floatT = Math.max(p.floatT || 0, d.dur);
      p.hasteT = Math.max(p.hasteT || 0, d.dur);
      p.stam = p.stamMax;
      return 'Gồng ' + d.dur + 's';
    },

    // Mở Toang — cửa KHOÁ là `locked`, không phải `jam`. Trường `jam` không tồn tại
    // trong bộ máy, nên bộ lọc cũ không bao giờ khớp: kỹ năng chưa từng mở một cánh nào.
    unlock: (p, d) => {
      let n = 0;
      (S.doors || []).forEach(dr => {
        if (dr.broken || !dr.locked) return;
        if (Math.hypot(dr.x - p.x, dr.y - p.y) > d.radius * TILE) return;
        if (REPO.breakDoorAt(dr)) n++;
      });
      return n ? 'Bung ' + n + ' cửa' : 'Không có cửa khoá gần đây';
    },

    // Tàng Hình — invisT giờ được foeTarget đọc thật: quái bỏ qua bạn hoàn toàn.
    vanish: (p, d) => {
      p.invisT = Math.max(p.invisT || 0, d.dur);
      foes().forEach(f => { if (f.target === p) { f.target = null; f.alert = 0; } });
      return 'Biến mất ' + d.dur + 's';
    },

    // Xung Chấn — sát thương + VĂNG RA + choáng. Bản đầu gọi makeNoise ngay chỗ mình
    // đứng, tức là vừa đẩy quái ra vừa hét gọi chúng quay lại — hai việc ngược nhau
    // trong cùng một nút.
    shock: (p, d) => {
      const bi = near(p.x, p.y, d.radius);
      bi.forEach(f => {
        REPO.hurtFoe(f, d.dmg);
        REPO.foeSleep(f, d.stun);
        REPO.foeKnock(f, Math.atan2(f.y - p.y, f.x - p.x), 240);
      });
      return bi.length ? 'Nện ' + bi.length + ' con' : 'Nện hụt';
    },

    // Mồi Nhử — hộp kêu NÉM RA XA theo hướng đang nhìn, và kêu suốt 9 giây.
    // makeNoise chỉ đặt alert = 3 rồi tụt 1 mỗi giây, nên một lần gọi giữ quái đúng
    // 3 giây; muốn 9 giây thì phải kêu lại đều đặn — đó là việc của FX.
    decoy: (p, d) => {
      const far = 4.5 * TILE;
      let x = p.x, y = p.y;
      for (let k = 6; k >= 1; k--) {
        const nx = p.x + Math.cos(p.dir) * far * (k / 6), ny = p.y + Math.sin(p.dir) * far * (k / 6);
        if (!REPO.hitsSolid(nx, ny, 8)) { x = nx; y = ny; break; }
      }
      let beat = 0;
      addFx({
        t: d.dur, kind: 'decoy', x: x, y: y, r: 14,
        tick: dt => { beat -= dt; if (beat <= 0) { REPO.makeNoise(x, y, d.radius * TILE, 3); beat = 0.8; } }
      });
      return 'Ném hộp ra xa';
    },

    // Kéo Về — giật mọi người đang gục về cạnh mình, đỡ dậy một người.
    rescue: (p) => {
      let n = 0, first = null;
      (S.mates || []).forEach(a => {
        if (!a.down) return;
        a.x = p.x + (Math.random() - 0.5) * 30; a.y = p.y + (Math.random() - 0.5) * 30;
        n++; if (!first) first = a;
      });
      if (first) REPO.reviveActor(first);
      return n ? 'Kéo về ' + n + ' người' : 'Không ai đang gục';
    },

    // Lồng Sắt — bộ máy không có tường dựng được lúc chạy, nên cái lồng là một VÒNG
    // ĐẨY: con nào chạm vành thì bị hất ngược ra ngoài, suốt 9 giây. Kết quả người
    // chơi thấy đúng bằng mô tả — quái không đi qua được — mà không phải đẻ ra một
    // hệ tường động chỉ để phục vụ một kỹ năng.
    // Bản đầu gán f.stun rồi thôi: không có lồng, không có gì, quái đi thẳng qua.
    cage: (p, d) => {
      const cx = p.x, cy = p.y, R = 4 * TILE;
      addFx({
        t: d.dur, kind: 'cage', x: cx, y: cy, r: R,
        tick: () => {
          foes().forEach(f => {
            const dx = f.x - cx, dy = f.y - cy, dist = Math.hypot(dx, dy) || 1;
            if (dist > R) return;                             // ngoài lồng thì kệ nó
            const k = (R - dist) + 2;                         // càng lấn sâu càng bị hất mạnh
            REPO.moveFoe(f, dx / dist * k, dy / dist * k);
          });
        }
      });
      return 'Dựng lồng ' + d.dur + 's';
    },

    // Chớp — dịch chuyển xuyên tường, để lại TIẾNG ĐỘNG ở chỗ cũ làm "bóng giả", và
    // 2 giây không ăn sát thương của bị động Bước Hụt (invulnT giờ có thật).
    blink: (p, d) => {
      const ox = p.x, oy = p.y, dist = d.dist * TILE;
      for (let k = 6; k >= 1; k--) {
        const nx = p.x + Math.cos(p.dir) * dist * (k / 6), ny = p.y + Math.sin(p.dir) * dist * (k / 6);
        if (!REPO.hitsSolid(nx, ny, 9)) { p.x = nx; p.y = ny; break; }
      }
      REPO.makeNoise(ox, oy, 9 * TILE, 3);                    // bóng giả: quái đổ về chỗ bạn VỪA RỜI
      p.invulnT = Math.max(p.invulnT || 0, 2);
      return 'Chớp';
    },

    // Thấu Thị — lộ tầng và cho cả tổ nhìn xa gấp rưỡi, ĐÚNG 12 GIÂY rồi trả lại.
    // revealAll() một mình thì lộ vĩnh viễn, mạnh hơn mô tả và làm hỏng nhịp mò mẫm
    // của cả tầng còn lại.
    reveal: (p, d) => {
      REPO.revealAll();
      REPO.crew().forEach(a => { if (a) a.sightMul = 1.5; });
      addFx({ t: d.dur, kind: 'reveal', end: () => { REPO.crew().forEach(a => { if (a) a.sightMul = 1; }); } });
      return 'Thấu thị ' + d.dur + 's';
    },

    // Đóng Băng — đứng hình (sleep) CỘNG dấu "dễ thương tổn" (slowT/vulnT) để đòn
    // đánh vào chúng ăn thêm 50% như mô tả. Cả f.stun lẫn f.slow của bản đầu đều là
    // trường bộ máy không đọc: quái chạy y như thường.
    freeze: (p, d) => {
      const bi = near(p.x, p.y, d.radius);
      bi.forEach(f => { REPO.foeSleep(f, d.dur); REPO.foeSlow(f, d.dur); });
      return bi.length ? 'Đông cứng ' + bi.length + ' con' : 'Không có quái gần đây';
    },

    // Kéo Đồ — GIAO đồ lên bệ chứ không chỉ dời toạ độ. Dời toạ độ thì chỉ tiêu không
    // nhúc nhích một đồng, người chơi vẫn phải chạy tới nhặt lại từng món rồi thả.
    pull: (p, d) => {
      const pad = REPO.padOpen();
      if (!pad) return 'Không có bệ nào đang mở';
      let n = 0;
      (S.loot || []).slice().forEach(l => {
        if (l.gone || l.onPad || l.isHead) return;
        if (Math.hypot(l.x - p.x, l.y - p.y) > d.radius * TILE) return;
        if (REPO.deliverLoot(l, pad)) n++;
      });
      return n ? 'Giao thẳng ' + n + ' món lên bệ' : 'Không có đồ rơi gần đây';
    },

    // Thiên Thần — đỡ dậy tất cả và cho cả tổ mấy giây thật sự không chết được.
    angel: (p, d) => {
      let n = 0;
      REPO.crew().forEach(a => {
        if (!a) return;
        if (a.down && REPO.reviveActor(a)) n++;
        a.invulnT = Math.max(a.invulnT || 0, d.dur);
      });
      return n ? 'Đỡ dậy ' + n + ' người, cả tổ bất tử ' + d.dur + 's' : 'Cả tổ bất tử ' + d.dur + 's';
    }
  };

  H.skill = {
    icon: '✳',
    label: () => { const d = leadDef(); return d ? d.skill.name : 'Kỹ năng'; },
    ready: () => S.time - skillT >= skillCd(),
    cool: () => Math.min(1, (S.time - skillT) / skillCd()),
    use: () => {
      const d = leadDef(), p = S.player;
      if (!d || !p || p.down) return;
      const fn = SKILLS[d.skill.id];
      if (!fn) return;
      skillT = S.time;
      if (run) run.skills++;              // cong mot lan o cuoi van, qua SQ.finishRun
      const msg = fn(p, d.skill);
      REPO.toast(d.skill.name + (msg ? ' — ' + msg : ''));
    }
  };
  SD.skillIcon = () => { const d = leadDef(); H.skill.icon = d ? (SQ.ui.faceOf ? SQ.ui.faceOf(d) : '✳') : '✳'; };

  // ---------------------------------------------------------------------------
  // VÀO / RA VÁN
  // ---------------------------------------------------------------------------
  SD.enter = function (mapId) {
    if (!SQ.mapUnlocked(mapId)) return false;
    // So cua van: SQ.finishRun() doc het cai nay o cuoi. counters.runs KHONG cong o
    // day - finishRun() da cong roi, cong ca hai cho la dem doi moi van.
    run = { mapId: mapId, floor: 1, floorsDone: 0, loot: 0, skills: 0 };
    skillT = -999;
    FX = [];
    // Bật `in-run` SAU khi bộ máy đã dựng xong, và trả lại tất cả nếu dựng hỏng.
    // ROOT-CAUSE: thứ tự cũ bật lớp `in-run` trước REPO.startLevel(). Lớp đó ẩn cả menu
    //   (`body.in-run #menu{display:none}`), nên startLevel() ném lỗi là màn hình chỉ còn
    //   thanh trên với một khung canvas đứng hình — menu đã bị giấu, ca thì chưa từng bắt đầu.
    try {
      SD.skillIcon();
      REPO.resetRun();
      REPO.setCrew(true);
      REPO.startLevel();
    } catch (e) {
      console.error('Vào ca không được:', e);
      run = null;
      document.body.classList.remove('in-run');
      if (SQ.ui && SQ.ui.toast) SQ.ui.toast('Vào ca lỗi: ' + ((e && e.message) || 'không rõ'));
      try { SQ.ui.render(); } catch (_) {}
      return false;
    }
    document.body.classList.add('in-run');
    return true;
  };

  SD.endRun = function (how, map, reward) {
    run = null;
    FX = [];                              // hieu ung dang chay khong duoc song sang van sau
    // Bo may phai DUNG HAN. Khong tat thi vong lap van chay sau lung menu: quai van
    // di, bot van khuan, dong ho van chay, va cai xac nam do van an sat thuong -
    // nguoi choi dang o man chon map ma trong bo nho thi ca truc van dien ra.
    S.running = false; S.dead = true;
    // HUỶ cảnh cắt đang treo. stepCut() chạy trên đồng hồ THẬT, ngoài cổng
    // `S.running && !S.dead` của frame(), nên hai dòng trên KHÔNG dừng được nó. Cái `then`
    // của nó gọi startShop() hoặc startLevel(), và cả hai đều bật lại S.running = true.
    // Đo thật: bỏ ca giữa cảnh xe chạy rồi về sảnh — squadRun=false, in-run=false, mà
    // running=true, shopMode=true, S.time 0 -> 1,55 và vẫn tăng. Một ca trực sống đang chạy
    // sau lưng màn chọn map: quái đi lại, đồng hồ chạy, ví và tủ đồ của bộ máy bị ghi đè.
    // cancelCut() chứ không phải skipCut(): skipCut CHẠY cái callback, đúng thứ phải chặn.
    if (REPO.cancelCut) REPO.cancelCut();
    if (REPO.closeStash && S.stashOpen) REPO.closeStash();
    if (REPO.resetInput) REPO.resetInput();
    S.running = false; S.dead = true;     // closeStash() có thể vừa bật lại running
    document.body.classList.remove('in-run');
    // Bảng kết ca là LỐI RA DUY NHẤT khỏi màn hình này. Nó phải hiện ra kể cả khi việc tính
    // thưởng phía trên vừa ném lỗi — nếu không thì người chơi ở lại một màn không có gì cả.
    try {
      if (SQ.ui && SQ.ui.showRunEnd) SQ.ui.showRunEnd(how, map, reward);
      else if (SQ.ui) SQ.ui.go('home');
    } catch (e) {
      console.error('Bảng kết ca dựng không được:', e);
      if (SQ.ui) SQ.ui.go('home');
    }
  };

  // Bo ca giua chung: giu phan da giao len be, dung luat cua repo2d. Di qua cung
  // mot cua ke toan nhu thang va thua.
  SD.quit = function () {
    if (!run) return;
    run.floorsDone = Math.max(0, run.floor - 1);
    finish(false);
  };

})(window);
