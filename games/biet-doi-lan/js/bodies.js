// Xác người lặn: Dave hoặc đồng đội hết O₂ thì gục tại chỗ, thân chìm chậm rồi nằm đáy; KHÔNG tự nổi về thuyền.
// Chỉ khi người khác còn sống kéo về tới thuyền thì mới hồi (BDL.bodies.board). Mỗi xác là một vật móc dây được như Loot
// (isBody): tether.js (Dave) và mates.js (dây của bot) cùng kéo nó bằng chung cơ chế dây lò xo.
//   body = { isBody, who: Mate | 'dave', pos, vel (CHUNG với người gục nên hình tự theo), mass, r, tilt, tethered, state }
//   state: 'down' (nằm yên) → 'towed' (đang buộc dây) → 'aboard' (đã lên thuyền, bị gỡ khỏi danh sách).
// [ĐỀ XUẤT] REPO: đồng đội bị hạ mà đầu còn chạm được cổng thoát thì hồi; ở đây hồi 25% O₂ tối đa khi xác chạm thuyền.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  var MASS = 70;            // [ĐỀ XUẤT] kg: người lặn mặc đồ, nặng hơn đồ cổ thường
  var SINK = 0.3;           // [ĐỀ XUẤT] tốc độ chìm cuối (m/s), như xác cá to
  var REVIVE = 0.25;        // [ĐỀ XUẤT] O₂ lúc hồi trên boong, phần trăm tối đa
  var G = null, S = null, nid = 0;

  function Body(who, name, pos, vel) {
    this.isBody = true; this.who = who; this.name = name;
    this.id = -(++nid);   // âm: không đụng id của Loot (khoá blacklist / bản đồ chung id)
    this.pos = pos; this.vel = vel;
    this.mass = MASS; this.r = 0.3; this.hw = 0.55; this.hh = 0.4; this.tilt = 0;
    this.tethered = false; this.state = 'down'; this.grace = 0; this.__mate = null;
    this.value = 0;
    this.bdlBody = this;   // BDL.bodyVel(t) (loot.js) trả đúng vel của xác
  }
  Body.prototype.wake = function () {};
  Body.prototype.hit = function () { return 0; };   // xác không nhận sát thương
  Body.prototype.center = function () { return { x: this.pos.x, y: this.pos.y }; };
  Body.prototype.hitTest = function (x, y, pad) {
    var ex = (x - this.pos.x) / (this.hw + pad), ey = (y - this.pos.y) / (this.hh + pad);
    return ex * ex + ey * ey <= 1;
  };
  Body.prototype.deckItem = function () { return { kind: 'body', key: this.name, label: this.name, value: 0, icon: '' }; };

  function create(who, name, pos, vel) {
    var b = new Body(who, name, pos, vel);
    S.list.push(b);
    return b;
  }
  function of(who) {
    if (!S) return null;
    for (var i = 0; i < S.list.length; i++) if (S.list[i].who === who) return S.list[i];
    return null;
  }

  // Dave hết O₂ (engine/dave.js, trạng thái dead). true: còn đồng đội sống kéo về, lượt chưa hết; false: cả tổ gục, hết ca như cũ.
  function onDaveDown() {
    var d = G.diver;
    if (!S || !BDL.crew || BDL.crew.able() < 1) return false;
    if (!of('dave')) create('dave', 'Bạn', d.pos, d.vel);
    G.hud.toast('Hết O₂ · chờ đồng đội kéo về thuyền');
    return true;
  }

  // Xác chạm thuyền (bot kéo tới, hoặc Dave kéo rồi leo lên): người gục hồi với 25% O₂ trên boong.
  function board(b) {
    if (!b || b.state === 'aboard') return false;
    b.state = 'aboard'; b.tethered = false; b.__mate = null;
    var i = S.list.indexOf(b);
    if (i >= 0) S.list.splice(i, 1);
    if (b.who === 'dave') {
      var d = G.diver;
      d.o2 = Math.max(1, Math.round((G.loadout ? G.loadout.o2 : 100) * REVIVE));
      d.invuln = 1.5;
      if (!(BDL.shipBoard && BDL.shipBoard())) d.go('swim');
      G.hud.toast('Đồng đội kéo bạn lên thuyền · O₂ ' + Math.round(REVIVE * 100) + '%');
    } else {
      b.who.revive();
      G.hud.toast(b.who.name + ' hồi lại trên boong · O₂ ' + Math.round(REVIVE * 100) + '%');
    }
    return true;
  }

  // Người gục bị dỡ khỏi cảnh (đổi tổ giữa lượt, hết lượt lặn): bỏ xác khỏi danh sách
  function discard(b) {
    var i = S ? S.list.indexOf(b) : -1;
    if (i >= 0) S.list.splice(i, 1);
    if (b) { b.state = 'aboard'; b.tethered = false; }
  }

  BDL.bodies = {
    create: create, board: board, discard: discard, onDaveDown: onDaveDown, of: of, REVIVE: REVIVE,
    get list() { return S ? S.list : []; },
    // bot có đi kéo xác không (bộ kiểm tắt đi để xác đứng yên mà đo)
    get rescue() { return !S || !S.noRescue; },
  };

  BDL.systems = BDL.systems || [];
  BDL.systems.push({
    name: 'bodies',
    build: function (g) {
      G = g; S = { list: [], noRescue: false, endSent: false, ends: 0 };
      window.BDL_DEBUG.bodies = {
        list: function () {
          return S.list.map(function (b) {
            return { who: b.who === 'dave' ? 'dave' : b.who.tactic, name: b.name, state: b.state, x: b.pos.x, y: b.pos.y, tethered: b.tethered };
          });
        },
        // ép một đồng đội (theo chiến thuật) hoặc 'dave' về 0 O₂
        kill: function (who) {
          if (who === 'dave') { G.diver.hurt(9999, G.diver.pos.x, G.diver.pos.y, true); return true; }
          var m = window.BDL_DEBUG.mates.list().filter(function (x) { return x.tactic === who; })[0];
          return m ? window.BDL_DEBUG.mates.kill(m.i) : false;
        },
        rescue: function (on) { S.noRescue = !on; },
        ends: function () { return S.ends; },
      };
    },
    update: function (dt) {
      if (!S) return;
      for (var i = 0; i < S.list.length; i++) {
        var b = S.list[i];
        b.state = b.tethered ? 'towed' : 'down';
        BDL.bodyStep(G, b.pos, b.vel, b.r, dt, SINK);
      }
      // Dave nằm đáy mà đồng đội còn lại đều gục hết thì không còn ai kéo: hết ca như cũ
      var db = of('dave');
      if (db && !S.endSent && BDL.crew.able() < 1) {
        S.endSent = true; S.ends++;
        db.tethered = false; db.state = 'aboard';
        S.list.splice(S.list.indexOf(db), 1);
        if (G.diver.data) G.diver.data.sent = true;
        G.onDead();
      }
    },
    teardown: function () { S = null; },
  });
})(window.BDL);
