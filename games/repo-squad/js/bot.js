/*
 * Ca Trực Đêm: Biệt Đội — bot chơi hộ, dùng cho kiểm thử và cho người xem thử.
 *
 * WHY: bot lái ĐÚNG cái `input` mà ngón tay lái — cần gạt và nút kỹ năng. Nếu cần gạt
 *      chết thì bot cũng đứng im, và bài test bắt được.
 * ROOT-CAUSE: memory pixel-tests-cannot-see-controls — một suite chỉ so ảnh vẫn xanh
 *      trên một cần gạt đã hỏng.
 */
(function (root) {
  'use strict';
  const B = root.SquadBot = {};
  let path = null, repath = 0, want = null, mode = 'loot';
  // Món đã đứng lên mà không nhặt được thì tạm bỏ qua.
  // WHY: nếu không, bot đứng trên một món của người khác đã nhận và không bao giờ đi tiếp.
  let skip = {}, stallOn = null, stallT = 0;
  // Mục tiêu phải BÁM, không đổi mỗi khung hình: hai món giá xấp xỉ nhau ở hai hướng
  // ngược nhau sẽ làm bot đi tới đi lui giữa chúng cho tới hết ca.
  let targetId = null, targetT = 0;

  B.reset = function () { path = null; repath = 0; want = null; skip = {}; stallOn = null; stallT = 0; targetId = null; targetT = 0; };

  B.drive = function (R, input, dt) {
    const SQ = root.SQ, TILE = SQ.TILE;
    const u = R.units[0];
    if (!u || u.down || u.out) {                    // đang gục thì thả cần gạt ra
      input.move.x = 0; input.move.y = 0;
      return;
    }
    const W = R.W;

    // --- đồng đội gục ở gần thì bỏ đồ đó, đi đỡ dậy trước ---
    const hurtMate = R.units.find(o => o.down && !o.out &&
        Math.hypot(o.x - u.x, o.y - u.y) < 11 * TILE && o.reviveT <= 0.15);

    // --- chọn mục tiêu: nhặt cho đầy túi rồi mới về bệ ---
    let goal = null;
    const mass = SQ.bagMass(u);
    const left = W.loot.filter(l => !l.done && l.held == null);
    const canTake = left.some(l => mass + l.mass <= u.stats.carry);
    const full = u.bag.length >= 6 || (u.bag.length > 0 && (!canTake || left.length === 0)) ||
                 mass >= u.stats.carry * 0.60;
    if (u.forcePad > 0 && u.bag.length) { goal = { x: W.pad.x, y: W.pad.y }; mode = 'deliver'; }
    else if (hurtMate) { goal = { x: hurtMate.x, y: hurtMate.y }; mode = 'rescue'; }
    else if (full) { goal = { x: W.pad.x, y: W.pad.y }; mode = 'deliver'; }
    else {
      let best = null, bs = -1;
      // đang bám một món và nó còn đó thì cứ đi tiếp, chỉ xét lại sau mỗi 6 giây
      const held = left.find(l => l.id === targetId);
      if (held && R.t - targetT < 6 && !(u.bag.length && mass + held.mass > u.stats.carry)) {
        best = held;
      } else {
        left.forEach(l => {
          if (u.bag.length && mass + l.mass > u.stats.carry) return;   // đầy tay thì bỏ qua món nặng
          if (skip[l.id] && skip[l.id] > R.t) return;
          const d = Math.hypot(l.x - u.x, l.y - u.y);
          const s = l.value / (d + 80);
          if (s > bs) { bs = s; best = l; }
        });
        if (best && best.id !== targetId) { targetId = best.id; targetT = R.t; }
      }
      if (best) {
        goal = { x: best.x, y: best.y }; mode = 'loot';
        // đứng ngay trên nó mà mãi không vào túi -> có người khác đã nhận, bỏ qua 15 giây
        if (Math.hypot(best.x - u.x, best.y - u.y) < 20) {
          if (stallOn === best.id) {
            stallT += dt;
            if (stallT > 1.5) { skip[best.id] = R.t + 15; stallOn = null; stallT = 0; }
          } else { stallOn = best.id; stallT = 0; }
        } else if (stallOn === best.id) { stallT = 0; }
      } else { goal = { x: W.pad.x, y: W.pad.y }; mode = 'idle'; }
    }

    // --- né: có quái sát bên và mình đang yếu thì lùi ---
    let flee = null;
    W.foes.forEach(f => {
      if (f.dead || f.stun > 0 || f.freeze > 0) return;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < 2.2 * TILE && u.hp < u.hpMax * 0.45) flee = f;
    });
    if (flee) {
      const dx = u.x - flee.x, dy = u.y - flee.y, m = Math.hypot(dx, dy) || 1;
      goal = { x: u.x + dx / m * 5 * TILE, y: u.y + dy / m * 5 * TILE };
      path = null;
    }

    // --- đi tới đó ---
    repath -= dt;
    const straight = Math.hypot(goal.x - u.x, goal.y - u.y) < 5 * TILE &&
                     SQ.losWide(W, u.x, u.y, goal.x, goal.y, 8);
    let dir;
    if (straight) {
      path = null;
      dir = { x: goal.x - u.x, y: goal.y - u.y };
    } else {
      if (!path || repath <= 0 || !want || Math.hypot(want.x - goal.x, want.y - goal.y) > 2 * TILE) {
        path = SQ.findPath(W, u.x, u.y, goal.x, goal.y);
        want = { x: goal.x, y: goal.y };
        repath = 0.5;
      }
      if (path && path.length) {
        while (path.length && Math.hypot(path[0].x - u.x, path[0].y - u.y) < TILE * 0.7) path.shift();
      }
      dir = (path && path.length) ? { x: path[0].x - u.x, y: path[0].y - u.y }
                                  : { x: goal.x - u.x, y: goal.y - u.y };
    }
    const d = Math.hypot(dir.x, dir.y) || 1;
    input.move.x = dir.x / d; input.move.y = dir.y / d;

    // --- bấm kỹ năng khi hợp cảnh ---
    if (u.skillT <= 0) {
      const id = u.def.skill.id;
      const near = W.foes.filter(f => !f.dead && Math.hypot(f.x - u.x, f.y - u.y) < 5 * TILE);
      const downed = R.units.filter(o => o.down && !o.out);
      let go = false;
      if (id === 'healring' || id === 'angel') go = u.hp < u.hpMax * 0.55 || downed.length > 0;
      else if (id === 'rescue') go = downed.length > 0;
      else if (id === 'gong') go = SQ.bagMass(u) > u.stats.carry * 0.5;
      else if (id === 'unlock') go = W.doors.some(dr => dr.jam && Math.hypot(dr.x - u.x, dr.y - u.y) < 7 * TILE);
      else if (id === 'pull') go = W.loot.filter(l => !l.done && !l.held && Math.hypot(l.x - u.x, l.y - u.y) < 10 * TILE).length >= 3;
      else if (id === 'reveal') go = R.t > 5;
      else if (id === 'blink') go = !straight && Math.hypot(goal.x - u.x, goal.y - u.y) > 9 * TILE;
      else go = near.length > 0;
      if (go) input.skill = true;
    }
  };

})(window);
