// Mô phỏng: kỹ năng. Khung phân phát và hai ví dụ mẫu ('lao-vut' cá mập, 'binh-o2' thợ lặn); nhánh W5 thêm 20 kỹ năng còn lại.
/*
 * NGUYÊN LIỆU (đều trên VS.sim; m = trận, a = actor dùng kỹ năng). Số đọc từ VS.SKILL_DATA[id], không ghi cứng.
 *   emit(m, type, data)                  đẩy sự kiện {t, type, ...data}
 *   addEffect(a, kind, dur, mag, src)    gắn hiệu ứng (kind và ý nghĩa mag: bảng hiệu ứng trong README), cùng kind+src thì gia hạn.
 *                                        Trả null nếu mục tiêu đang miễn (stun/sleep gặp ccImmune, slow trong lúc miễn chậm).
 *   effect(a, kind) → hiệu ứng mạnh nhất còn hạn hoặc null;  removeEffects(a, kind)
 *   addZone(m, z)    z = {kind, x, y, r, until | dur, team, onTick?(m,z,dt), onExpire?(m,z)}. 'ink' và 'bait' chặn tia sáng, 'flare' phát sáng,
 *                    'cage' cá mập không vào được và không cắn được người bên trong, z.reviveMul > 1 làm cứu người nhanh hơn trong vùng
 *   addProj(m, p)    p = {owner, team, kind, x, y, vx, vy, life, dmg?, r?, pierce?, onHit?(m,p,target), onEnd?(m,p,'life'|'wall'|'hit')}
 *                    đạn tự trừ dmg rồi gọi onHit; đạn 'harpoon' còn làm chậm mục tiêu
 *   damageShark(m, s, dmg, by) và hurtDiver(m, d, o2, by, kind) trả lượng thật sự mất; kind 'hit' | 'bite' | 'dot' (xem actors.js);
 *                    cả hai bị spawnImmune chặn, đòn trúng làm cá mập hết ngủ
 *   actorsNear(m, x, y, r, team?) actor còn trên bản đồ, gần trước;  raycast(m, x0, y0, x1, y1) → {x, y, t} | null chỉ xét vách đá
 *   dropCarry(m, d), releaseHold(m, s, why), outDiver(m, d, why, by), setState(m, a, st, why) (bảng chuyển trong sim.FSM)
 *   canSee(m, team, a), sharkSees(m, s, d), visibleTo(m, team, x, y), known(m, team): luật tầm nhìn dùng chung với bot
 * MÓC: VS.SKILLS[id].onBite(m, shark, diver, o2) sau khi cú cắn trúng; a.shotMod = {rangeMul, dmg, pierce, until} đổi phát xiên kế tiếp;
 *      a.beamMul (mặc định 1) nhân tầm đèn pin của thợ lặn; a.skill.charges khởi tạo từ SKILL_DATA[id].charges, khung không đụng tới;
 *      m.reveal = {shark: untilT} cho cả đội thấy hết (hoặc gắn hiệu ứng reveal từng actor); zone.onTick chạy mỗi bước.
 * VÒNG ĐỜI: nhấn kỹ năng (intent.skill) → hết hồi, đang không choáng/ngủ/bị ngậm, canStart? → đặt cd và t → emit 'skill' → start
 *      (start được sửa cd/t/charges); mỗi bước khi t > 0: update(m,a,dt); t về 0 hoặc actor bị loại: end(m,a).
 *      Bot: bot(m,a) trả null (không dùng) | true (bấm ngay) | {x,y} (ngắm tới đó rồi bấm); chỉ được hỏi khi đã hết hồi.
 */
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var EPS = 1e-6;
  var SK = VS.SKILLS = VS.SKILLS || {};

  // Bấm kỹ năng. Trả true nếu đã kích hoạt. cd và t đặt trước start để start tự chỉnh được (vd kỹ năng có nhiều lần dùng).
  sim.skillPress = function (m, a) {
    var sk = a.skill, S = SK[sk.id], D = VS.SKILL_DATA[sk.id];
    if (!S || !D || sk.cd > 0 || a.st === 'out') return false;
    if (a.team === 'diver' ? a.st !== 'swim' : a.st === 'stun') return false;
    if (sim.effect(a, 'stun') || sim.effect(a, 'sleep')) return false;
    if (S.canStart && !S.canStart(m, a)) return false;
    sk.cd = D.cd; sk.t = D.dur || 0;
    sim.emit(m, 'skill', { id: a.id, skill: sk.id });
    S.start(m, a);
    return true;
  };

  sim.skillTick = function (m, a, dt) {
    var sk = a.skill;
    if (sk.cd > 0) { sk.cd -= dt; if (sk.cd < 0) sk.cd = 0; }
    if (sk.t <= 0) return;
    var S = SK[sk.id];
    if (S && S.update) S.update(m, a, dt);
    if (sk.t <= 0) return;
    sk.t -= dt;
    if (sk.t <= EPS) { sk.t = 0; if (S && S.end) S.end(m, a); }
  };

  sim.skillCancel = function (m, a) {
    var sk = a.skill;
    if (sk.t <= 0) return;
    sk.t = 0;
    var S = SK[sk.id];
    if (S && S.end) S.end(m, a);
  };

  // Bot có nên dùng kỹ năng lúc này không: null | true | {x,y}. Chỉ hỏi khi đã hết hồi và kỹ năng có hàm bot.
  sim.skillBot = function (m, a) {
    var S = SK[a.skill.id];
    if (!S || !S.bot || a.skill.cd > 0) return null;
    return S.bot(m, a) || null;
  };

  // ---- Ví dụ mẫu ----
  SK['lao-vut'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['lao-vut'];
      sim.addEffect(a, 'speed', D.dur, D.speedMul, a.id);
      if (D.refillStamina) { a.stamina = VS.TUNING.shark.staminaMax; a.dashLock = false; }
      if (D.resetBite) a.biteCd = 0;
    },
    // Lao khi đang đuổi một thợ lặn thấy được cách 4-14 m và mũi đã gần hướng về nó
    bot: function (m, a) {
      for (var i = 0; i < m.actors.length; i++) {
        var d = m.actors[i];
        if (d.team !== 'diver' || d.st === 'out' || !sim.sharkSees(m, a, d)) continue;
        var dx = d.x - a.x, dy = d.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 4 && dist <= 14 && Math.abs(VS.geom.angDiff(Math.atan2(dy, dx), a.ang)) < 0.5) return true;
      }
      return null;
    }
  };

  SK['binh-o2'] = {
    start: function (m, a) {
      a.o2 = Math.min(a.o2Max, a.o2 + VS.SKILL_DATA['binh-o2'].o2);
    },
    // Chỉ dùng khi O2 xuống thấp, để bot không phí bình
    bot: function (m, a) { return a.o2 <= a.o2Max * 0.55 ? true : null; }
  };
})(window.VS = window.VS || {});
