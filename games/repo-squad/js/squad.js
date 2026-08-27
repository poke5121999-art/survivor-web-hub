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
  function statsOf(m) {
    if (!m || !m.stats) return null;
    const def = SQ.CHAR_BY_ID[m.id];
    const raw = def || { hp: 105, atk: 9, spd: 1 };
    return {
      charId: m.id,
      name: def ? def.name : 'Tổ',
      col: def ? 'hsl(' + def.hue + ' 55% 58%)' : null,
      hp: Math.round(BASE.hp * (m.stats.hp / raw.hp)),
      str: Math.round(BASE.str * (m.stats.atk / raw.atk)),
      speed: Math.round(BASE.speed * m.stats.spd)
    };
  }
  H.mateCount = 4;
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
  function levelIndex() {
    if (!run) return 1;
    const m = SQ.MAP_BY_ID[run.mapId];
    return (m.tier - 1) * 3 + run.floor;
  }
  H.levelIndex = levelIndex;

  H.onLevelClear = function () {
    if (!run) return false;
    const m = SQ.MAP_BY_ID[run.mapId];
    const st = SQ.M.maps[run.mapId];
    if (run.floor > st.floor) st.floor = run.floor;
    if (run.floor >= m.floors) { clearMap(m, st); return true; }
    run.floor++;
    return false;                       // chưa hết map -> bộ máy mở trạm như thường
  };

  function clearMap(m, st) {
    const first = !st.cleared;
    st.cleared = true;
    const r = Object.assign({}, m.clear || {});
    if (first && m.first) for (const k in m.first) r[k] = (r[k] || 0) + m.first[k];
    // Tiền nhặt trong ca đổi thành vàng của tài khoản.
    r.gold = (r.gold || 0) + Math.round(S.wallet * 0.001);
    SQ.grant(r);
    SQ.M.counters.wins++; SQ.M.counters.runs++;
    SQ.save(true);
    SD.endRun('win', m, r);
  };

  H.onPayout = function () { SQ.M.counters.loot++; };

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
  const foes = () => (S.monsters || []).filter(f => f.hp > 0);
  const near = (x, y, rTiles) => foes().filter(f => Math.hypot(f.x - x, f.y - y) < rTiles * TILE);

  const SKILLS = {
    // Chói Loà — loé đèn: quái quanh đó đứng hình và quên mục tiêu.
    flash: (p, d) => { near(p.x, p.y, d.radius).forEach(f => { f.stun = d.dur; f.alert = 0; f.target = null; f.state = 'idle'; }); return 'Loé đèn'; },
    // Vòng Hồi — hồi máu cả tổ đang đứng quanh.
    healring: (p, d) => { REPO.crew().forEach(a => { if (Math.hypot(a.x - p.x, a.y - p.y) < d.radius * TILE) a.hp = Math.min(a.hpMax, a.hp + d.heal * d.dur * 0.35); }); return 'Vòng hồi'; },
    // Gồng — bỏ phạt trọng lượng, chạy nhanh hơn.
    gong: (p, d) => { p.floatT = Math.max(p.floatT || 0, d.dur); p.stam = p.stamMax; return 'Gồng'; },
    // Mở Toang — bung mọi cửa kẹt quanh đó.
    unlock: (p, d) => {
      let n = 0;
      (S.doors || []).forEach(dr => { if (dr.jam && Math.hypot(dr.x - p.x, dr.y - p.y) < d.radius * TILE) { REPO.breakDoorAt(dr); n++; } });
      return n ? 'Bung ' + n + ' cửa' : 'Không có cửa kẹt gần đây';
    },
    // Tàng Hình — quái không thấy, không nghe.
    vanish: (p, d) => { foes().forEach(f => { if (f.target === p) { f.target = null; f.alert = 0; } }); p.invisT = d.dur; return 'Tàng hình'; },
    // Xung Chấn — nện sàn: choáng và ăn sát thương.
    shock: (p, d) => { near(p.x, p.y, d.radius).forEach(f => { f.stun = d.stun; REPO.hurtFoe(f, d.dmg); }); REPO.makeNoise(p.x, p.y, d.radius * TILE, 1.6); return 'Xung chấn'; },
    // Mồi Nhử — ném hộp kêu, kéo hết quái về chỗ đó.
    decoy: (p, d) => { REPO.makeNoise(p.x, p.y, d.radius * TILE, 3); return 'Ném mồi'; },
    // Kéo Về — giật đồng đội đang gục về cạnh mình và đỡ dậy một người.
    rescue: (p) => {
      let n = 0, first = null;
      (S.mates || []).forEach(a => { if (a.down) { a.x = p.x + (Math.random() - 0.5) * 30; a.y = p.y + (Math.random() - 0.5) * 30; n++; if (!first) first = a; } });
      if (first) REPO.reviveActor(first);
      return n ? 'Kéo về ' + n + ' người' : 'Không ai đang gục';
    },
    // Lồng Sắt — quái quanh đó đứng yên một lúc.
    cage: (p, d) => { near(p.x, p.y, 4).forEach(f => { f.stun = d.dur; }); return 'Dựng lồng'; },
    // Chớp — dịch chuyển theo hướng đang đi.
    blink: (p, d) => {
      const dist = d.dist * TILE;
      for (let k = 6; k >= 1; k--) {
        const nx = p.x + Math.cos(p.dir) * dist * (k / 6), ny = p.y + Math.sin(p.dir) * dist * (k / 6);
        if (!REPO.hitsSolid(nx, ny, 9)) { p.x = nx; p.y = ny; break; }
      }
      p.invuln = S.time + 2;
      return 'Chớp';
    },
    // Thấu Thị — lộ toàn bộ tầng.
    reveal: () => { REPO.revealAll(); return 'Thấu thị'; },
    // Đóng Băng — quái đứng im lâu hơn hẳn.
    freeze: (p, d) => { near(p.x, p.y, d.radius).forEach(f => { f.stun = d.dur; f.slow = d.dur; }); return 'Đóng băng'; },
    // Kéo Đồ — hút đồ rơi quanh đó về bệ gần nhất.
    pull: (p, d) => {
      const pad = S.pads && S.pads[S.padIndex];
      if (!pad) return 'Không có bệ nào đang mở';
      let n = 0;
      (S.loot || []).forEach(l => { if (!l.gone && !l.held && Math.hypot(l.x - p.x, l.y - p.y) < d.radius * TILE) { l.x = pad.x + (Math.random() - 0.5) * 26; l.y = pad.y + (Math.random() - 0.5) * 26; n++; } });
      return n ? 'Hút ' + n + ' món về bệ' : 'Không có đồ rơi gần đây';
    },
    // Thiên Thần — đỡ dậy tất cả và cho cả tổ mấy giây bất tử.
    angel: (p, d) => {
      REPO.crew().forEach(a => { if (a.down) REPO.reviveActor(a); a.invuln = S.time + d.dur; });
      return 'Thiên thần';
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
      SQ.M.counters.skills++;
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
    run = { mapId: mapId, floor: 1 };
    skillT = -999;
    SD.skillIcon();
    SQ.M.counters.runs++;
    REPO.resetRun();
    REPO.setCrew(true);
    document.body.classList.add('in-run');
    REPO.startLevel();
    return true;
  };

  SD.endRun = function (how, map, reward) {
    run = null;
    document.body.classList.remove('in-run');
    if (SQ.ui && SQ.ui.showRunEnd) SQ.ui.showRunEnd(how, map, reward);
    else if (SQ.ui) SQ.ui.go('home');
  };

  SD.quit = function () {
    if (!run) return;
    // Bỏ ca giữa chừng: giữ phần đã giao lên bệ, đúng luật của repo2d.
    const gold = Math.round(S.wallet * 0.001);
    if (gold > 0) SQ.grant({ gold: gold });
    SQ.save(true);
    SD.endRun('quit', SQ.MAP_BY_ID[run.mapId], { gold: gold });
  };

})(window);
