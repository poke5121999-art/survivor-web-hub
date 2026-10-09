/* Chợ Phiên — BZReplay: phát lại kết quả BZSim.run (không bao giờ gọi sim trong lúc phát).
   Con trỏ thời gian chạy theo requestAnimationFrame × tốc độ; mỗi khung: áp ảnh chụp (frames[i], 50 ms/khung) lên thẻ/hero,
   rồi phát sự kiện của các khung vừa đi qua qua sổ FX[type] (một mục mỗi loại sự kiện sim; loại lạ chỉ ghi log một lần).
   Đạn bay mất thời gian nên phần hero (máu, khiên, bỏng, độc) hiển thị trễ LAG_HERO = 350 ms (= đạn sát thương gốc, VISUAL.md §7):
   đạn rời thẻ đúng lúc sim trừ máu, chạm chân dung đúng lúc thanh máu tụt và số bay ra. Trạng thái thẻ (Haste/Slow/Freeze) trễ LAG_CARD.
   Tua (seek): xoá hiệu ứng đang bay, dựng lại trạng thái bền (gem đổi số, nâng bậc, enchantment) bằng APPLY[type] tới mốc mới. */
(function (root) {
  'use strict';
  var RP = root.BZReplay = {};
  var V = function () { return root.BZView; }, FXc = function () { return root.BZFX; }, AU = function () { return root.BZAudio; };
  RP.LAG_HERO = 350; RP.LAG_CARD = 250; RP.END_HOLD = 3200;
  RP.BANNER_HOLD = 2000; RP.BANNER_HOLD_LOSE = 1700; // cuộn vào 700 ms + giữ 1,3 s (thua: 500 + 1,2 s ≈ 2,0 s), rồi 300 ms bay đi (REF death-victory) // băng-rôn Chiến thắng giữ ~1,2-1,5 s (clip heZSYG0dD_c ?t=1828; wUzq6Q4u9Jc ?t=212), trước đây giữ tới hết trận
  RP.FX = {}; RP.APPLY = {};
  var S = null, warned = {};
  RP.state = function () { return S; };

  // load(res, info) — info: {sides:[{name}], cards:{uid:{el, inst, attrs0, side, section}}, sandstorm}
  RP.load = function (res, info) {
    var evs = [];
    res.frames.forEach(function (f) { f.ev.forEach(function (e) { evs.push(e); }); });
    var cidx = {};
    res.cards.forEach(function (c, k) { cidx[c.uid] = k; });
    S = {
      res: res, info: info, frames: res.frames, evs: evs, ei: 0, t: 0, speed: S ? S.speed : 1, paused: false,
      endMs: res.endMs, duration: res.endMs + RP.LAG_HERO + RP.END_HOLD, cidx: cidx, done: false, phase: {}, hitStop: 0,
      perf: { n: 0, sum: 0, max: 0, iv: 0, ivN: 0, last: 0 }
    };
    FXc().clear(); FXc().resetStats();
    RP.stats = { dispatched: 0, byType: {} };
    resetPersistent();
    V().hideBanner(true);
    [0, 1].forEach(function (s) { V().setDead(s, false); V().crown(s, false); });
    V().sand(false);
    RP.apply(0, true);
    return S;
  };
  RP.loaded = function () { return !!S; };

  function frameAt(t) {
    var F = S.frames, i = Math.floor(t / 50);
    if (i < 0) i = 0; if (i >= F.length) i = F.length - 1;
    return F[i];
  }
  RP.frameAt = function (t) { return frameAt(t); };
  function sideOf(target) { return target === 'p1' ? 1 : 0; }
  RP.sideOf = sideOf;
  function cardSide(uid) { var k = S.cidx[uid]; return k == null ? null : S.res.cards[k].owner; }
  function cardInfo(uid) { return S.info.cards[uid] || null; }

  // ---------- điểm neo cho đạn ----------
  function pointOf(uid, fallbackSide) {
    var r = uid != null ? V().cardRect(uid) : null;
    if (r) return { x: r.cx, y: r.cy };
    var side = uid != null ? cardSide(uid) : null;
    if (uid != null && side != null) {
      var se = V().skillEl(side, uid);
      if (se) { var b = se.getBoundingClientRect(); var p = V().toStage(b.left + b.width / 2, b.top + b.height / 2); return p; }
    }
    var h = V().heroRect(fallbackSide == null ? 0 : fallbackSide);
    return { x: h.cx, y: h.cy };
  }
  function heroPt(side) { var h = V().heroRect(side); return { x: h.cx, y: h.cy }; }
  RP.pointOf = pointOf;

  // ---------- âm thanh theo thẻ (BZ_AUDIO_CARDS → BZ_AUDIO_FX), không có thì theo loại hành động (BZ_AUDIO_ACTION) ----------
  // ---------- VFX/âm thanh theo thẻ từ BZ_VFXMAP (data/vfxmap.js): cards[cardId] (ghi đè theo prefab) → defaults[ActionType] ----------
  var ACTION = { damage: 'PlayerDamage', burn: 'PlayerBurnApply', poison: 'PlayerPoisonApply', heal: 'PlayerHeal', regen: 'PlayerRegenApply', shield: 'PlayerShieldApply',
    freeze: 'CardFreeze', slow: 'CardSlow', haste: 'CardHaste', charge: 'CardCharge', reload: 'CardReload', destroy: 'CardDestroy' };
  var SZ = { 1: 'S', 2: 'M', 3: 'L' };
  function mapEntry(uid, kind) {
    var M = root.BZ_VFXMAP; if (!M || uid == null) return null;
    var ci = cardInfo(uid), act = ACTION[kind || 'damage'], E = null;
    var c = ci && ci.inst && M.cards && M.cards[ci.inst.id];
    if (c && !c.default && c.prefab && (!c.action || !act || c.action === act)) E = c;
    if (!E) {
      var d = M.defaults && M.defaults[act];
      if (d) { var sz = ci && ci.inst && SZ[ci.inst.size || (root.BZSim && root.BZSim.tpl && 0)]; E = (d.sizes && sz && d.sizes[sz]) || d; }
    }
    return E;
  }
  RP.mapEntry = mapEntry;
  // đạn rời thẻ sao cho CHẠM đúng lúc sim trừ máu (LAG_HERO): bay đúng travelMs của prefab, xuất phát trễ phần còn lại
  function flight(E, lag) {
    var tm = E ? (E.visualTravelMs > 0 ? E.visualTravelMs : E.travelMs) : lag;
    tm = Math.max(60, Math.min(lag, tm || lag));
    return { travel: tm, delay: lag - tm };
  }
  function cardSound(uid, phase, kind) {
    var ci = cardInfo(uid), A = AU();
    if (!A) return;
    var E0 = mapEntry(uid, kind || 'damage'), key = E0 && E0.sounds && E0.sounds[phase === 'shot' ? 'fire' : phase];
    if (key && A.has && A.has(key)) { A.play(key); return; }
    var CA = root.BZ_AUDIO_CARDS || {}, FXA = root.BZ_AUDIO_FX || {}, ACT = root.BZ_AUDIO_ACTION || {};
    if (ci) {
      var c = CA[ci.inst.id];
      if (c && c.fx) for (var i = 0; i < c.fx.length; i++) { var f = FXA[c.fx[i]]; if (f && f[phase] && A.play(f[phase])) return; }
    }
    var a = ACT['combat.' + (kind || 'damage')];
    if (a && a[phase]) A.play(a[phase]);
  }
  RP.cardSound = cardSound;
  function snd(key, o) { var A = AU(); if (A) A.play(key, o); }

  // ---------- trạng thái bền (tua lại được) ----------
  function resetPersistent() {
    var C = S.info.cards;
    Object.keys(C).forEach(function (uid) {
      var c = C[uid];
      c.attrs = Object.assign({}, c.attrs0); c.tier = c.tier0; c.ench = c.ench0;
      if (c.el) {
        var changed = c.el._bz.inst.tier !== c.tier0 || c.el._bz.inst.ench !== c.ench0;
        c.el._bz.inst.tier = c.tier0; c.el._bz.inst.ench = c.ench0;
        if (changed) { c.el.className = 'bz-card t-' + c.tier0; root.BZCard.layout(c.el); }
        root.BZCard.setAttrs(c.el, c.attrs, true);
      }
    });
  }
  var GEM_ATTRS = { DamageAmount: 1, BurnApplyAmount: 1, PoisonApplyAmount: 1, ShieldApplyAmount: 1, HealAmount: 1, RegenApplyAmount: 1, Multicast: 1, AmmoMax: 1,
    CooldownMax: 1, Lifesteal: 1, CritChance: 1 };
  RP.APPLY.attr = function (e) {
    var c = cardInfo(e.target);
    if (!c || !GEM_ATTRS[e.attr]) return false;
    c.attrs[e.attr] = e.cur != null ? e.cur : (c.attrs[e.attr] || 0) + e.amt;
    if (e.attr === 'CooldownMax') c.attrs.CooldownEffective = Math.max(1000, c.attrs.CooldownMax);
    if (c.el) root.BZCard.setGem(c.el, e.attr, c.attrs[e.attr]);
    return true;
  };
  RP.APPLY.upgrade = function (e) {
    var c = cardInfo(e.target); if (!c || !e.to) return false;
    c.tier = e.to;
    if (c.el) { c.el._bz.inst.tier = e.to; c.el.className = 'bz-card t-' + e.to; root.BZCard.layout(c.el); }
    return true;
  };
  RP.APPLY.enchant = function (e) {
    var c = cardInfo(e.target); if (!c) return false;
    c.ench = e.to || null;
    if (c.el) {
      var B = c.el._bz; B.inst.ench = c.ench;
      if (c.ench) {
        if (!B.ench) { B.ench = document.createElement('div'); B.ench.className = 'ench'; B.win.appendChild(B.ench); }
        B.ench.style.setProperty('--ec', root.BZCard.ENCH_COL[c.ench] || '#be47ff'); B.ench.style.display = '';
      } else if (B.ench) B.ench.style.display = 'none';
    }
    return true;
  };

  // ---------- FX theo loại sự kiện ----------
  var X = RP.FX;
  function hpBefore(side, t) { var f = frameAt(t - 50); return f.p[side][0]; }
  function hpMax(side, t) { return frameAt(t).p[side][7] || 1; }
  function impactHero(t) { return t + RP.LAG_HERO; }

  X.fire = function (e, c) {
    var el = V().cardEl(e.src), ci = cardInfo(e.src);
    if (el) {
      root.BZCard.kick(el, c.t);
      root.BZCard.flash(el, c.t, e.crit ? '#ff5a3c' : '#00ffa8');
      if ((ci && (ci.attrs.Multicast || 1) > 1)) root.BZCard.multicastFlash(el);
      var r = V().cardRect(e.src);
      if (r) FXc().burst('fire', r.cx, r.cy, { w: r.w, h: r.h });
    } else {
      var s = cardSide(e.src); if (s != null) V().skillPulse(s, e.src);
    }
    cardSound(e.src, 'shot', ci && ci.kind);
  };
  X.crit = function (e) { snd('board.crit'); var el = V().cardEl(e.src); if (el) root.BZCard.flash(el, V().now, '#ff3b2a'); };

  // sát thương: thẻ → chân dung (đạn) hoặc nổ tại chỗ (bỏng, độc, bão cát)
  X.damage = function (e, c) {
    var ts = sideOf(e.target), at = impactHero(e.t), kind = e.kind || 'Damage';
    var mx = hpMax(ts, e.t), before = hpBefore(ts, e.t);
    var hp = e.hp || 0, sh = e.shield || 0;
    var pct = before > 0 ? hp / before : 0;
    if (e.src != null && kind === 'Damage') {
      var from = pointOf(e.src, 1 - ts), to = heroPt(ts), E = mapEntry(e.src, 'damage'), fl = flight(E, RP.LAG_HERO);
      FXc().projectile({ from: from, to: to, kind: 'damage', t0: e.t + fl.delay, travel: fl.travel, crit: e.crit, entry: E });
      if (e.crit) snd('combat.critgain_shot');
    }
    FXc().at(at, function (tt) {
      var p = heroPt(ts);
      var nk = kind === 'Burn' ? 'burn' : kind === 'Poison' ? 'poison' : kind === 'Sandstorm' ? 'sand' : 'damage';
      if (e.amt > 0) {
        if (hp > 0 || sh === 0) FXc().number({ x: p.x, y: p.y, kind: nk, value: hp > 0 ? hp : e.amt, crit: e.crit, frac: (hp || e.amt) / mx, t0: tt, side: ts });
        else FXc().number({ x: p.x, y: p.y, kind: 'shieldLoss', value: sh, crit: e.crit, frac: sh / mx, t0: tt, side: ts });
        if (hp > 0 && sh > 0) FXc().number({ x: p.x, y: p.y - 30, kind: 'shieldLoss', value: sh, frac: sh / mx, t0: tt, side: ts, aux: true });
      }
      if (kind === 'Burn') { FXc().burst('burn', p.x, p.y, { t0: tt, big: 0.8 }); snd('board.tickBurn'); }
      else if (kind === 'Poison') { FXc().burst('poison', p.x, p.y, { t0: tt, big: 0.8 }); snd('board.tickPoison'); }
      else {
        FXc().burst(kind === 'Sandstorm' ? 'sandstorm' : 'damage', p.x, p.y, { t0: tt, crit: e.crit, entry: kind === 'Damage' ? mapEntry(e.src, 'damage') : null });
        if (e.src != null) cardSound(e.src, 'impact', 'damage');
        V().heroFlash(ts, tt, sh > 0 && hp === 0 ? '#ffe36d' : '#ffffff');
      }
      // HitStunAVFXMod: ≥ 20 % máu → giật chân dung + rung camera + khựng hình pct·0,25 s
      if (pct >= 0.2) { V().heroPunch(ts, tt, pct); V().shake(pct, tt); snd('combat.hitStun'); RP.hitStop(pct * 250); }
      else if (hp > 0 && kind !== 'Poison' && kind !== 'Burn') V().heroPunch(ts, tt, Math.max(0.08, pct * 2));
    });
  };
  X.heal = function (e, c) {
    var ts = sideOf(e.target), at = impactHero(e.t), mx = hpMax(ts, e.t);
    var kind = e.kind === 'Regen' ? 'regen' : e.kind === 'Lifesteal' ? 'lifesteal' : 'heal';
    if (e.src != null && kind !== 'regen') {
      var Eh = mapEntry(e.src, 'heal'), fh = flight(Eh, RP.LAG_HERO);
      FXc().projectile({ from: pointOf(e.src, ts), to: heroPt(ts), kind: kind === 'lifesteal' ? 'lifesteal' : 'heal', t0: e.t + fh.delay, travel: fh.travel, entry: Eh });
      cardSound(e.src, 'shot', 'heal');
    }
    FXc().at(at, function (tt) {
      var p = heroPt(ts);
      if (e.amt > 0) FXc().number({ x: p.x, y: p.y, kind: kind === 'regen' ? 'regen' : 'heal', value: e.amt, crit: e.crit, frac: e.amt / mx, t0: tt, side: ts });
      FXc().burst(kind, p.x, p.y, { t0: tt, big: kind === 'regen' ? 0.6 : 1, entry: kind === 'heal' ? mapEntry(e.src, 'heal') : null });
      if (kind === 'regen') snd('board.tickRegen'); else { var hs = mapEntry(e.src, 'heal'); snd(hs && hs.sounds && hs.sounds.impact && AU() && AU().has && AU().has(hs.sounds.impact) ? hs.sounds.impact : 'combat.heal_impact'); }
      V().heroFlash(ts, tt, '#fcfc2c');
    });
  };
  X.shield = function (e) {
    var ts = sideOf(e.target), at = impactHero(e.t), mx = hpMax(ts, e.t);
    var Es = mapEntry(e.src, 'shield'), fs_ = flight(Es, RP.LAG_HERO);
    FXc().projectile({ from: pointOf(e.src, ts), to: heroPt(ts), kind: 'shield', t0: e.t + fs_.delay, travel: fs_.travel, entry: Es });
    cardSound(e.src, 'shot', 'shield');
    FXc().at(at, function (tt) {
      var p = heroPt(ts);
      FXc().number({ x: p.x, y: p.y, kind: 'shield', value: e.amt, crit: e.crit, frac: e.amt / mx, t0: tt, side: ts });
      FXc().burst('shield', p.x, p.y, { t0: tt, entry: Es });
      cardSound(e.src, 'impact', 'shield');
      if (V().rowGlow) V().rowGlow(ts, '#fcdc2c', 1200);
      V().heroFlash(ts, tt, '#fcfc2c');
    });
  };
  function statusApply(kind, numKind) {
    return function (e) {
      var ts = sideOf(e.target), at = impactHero(e.t), mx = hpMax(ts, e.t);
      var Ea = mapEntry(e.src, kind), fa = flight(Ea, RP.LAG_HERO);
      FXc().projectile({ from: pointOf(e.src, 1 - ts), to: heroPt(ts), kind: kind, t0: e.t + fa.delay, travel: fa.travel, count: false, entry: Ea });
      cardSound(e.src, 'shot', kind);
      FXc().at(at, function (tt) {
        var p = heroPt(ts);
        FXc().number({ x: p.x, y: p.y, kind: numKind, value: e.amt, frac: e.amt / mx, t0: tt, side: ts, aux: true });
        FXc().burst(kind, p.x, p.y, { t0: tt, big: 0.7, entry: Ea });
        cardSound(e.src, 'impact', kind);
      });
    };
  }
  X.burn = statusApply('burn', 'burnGain');
  X.poison = statusApply('poison', 'poisonGain');
  X.regen = statusApply('regen', 'regenGain');
  function cardStatus(kind) {
    return function (e) {
      var to = V().cardRect(e.target);
      if (!to) return;
      var ts = cardSide(e.target);
      var Ec = mapEntry(e.src, kind), fc = flight(Ec, RP.LAG_CARD);
      FXc().projectile({ from: pointOf(e.src, ts), to: { x: to.cx, y: to.cy }, kind: kind, t0: e.t + fc.delay, travel: fc.travel, count: false, arc: 1.6, entry: Ec });
      cardSound(e.src, 'shot', kind);
      FXc().at(e.t + RP.LAG_CARD, function (tt) {
        var r = V().cardRect(e.target); if (!r) return;
        FXc().burst(kind, r.cx, r.cy, { t0: tt, entry: Ec });
        var el = V().cardEl(e.target);
        if (el) { root.BZCard.hitFlash(el, tt); if (kind === 'reload') root.BZCard.reloadFlash(el); if (kind === 'charge') root.BZCard.flash(el, tt, '#00ffce'); }
        if (kind === 'freeze') snd('combat.freeze_start'); else cardSound(e.src, 'impact', kind);
      });
    };
  }
  X.freeze = cardStatus('freeze'); X.slow = cardStatus('slow'); X.haste = cardStatus('haste');
  X.charge = cardStatus('charge'); X.reload = cardStatus('reload');
  X.destroy = function (e) {
    var to = V().cardRect(e.target); if (!to) return;
    FXc().projectile({ from: pointOf(e.src, cardSide(e.target)), to: { x: to.cx, y: to.cy }, kind: 'destroy', t0: e.t, travel: RP.LAG_CARD, count: false });
    FXc().at(e.t + RP.LAG_CARD, function (tt) { var r = V().cardRect(e.target); if (r) FXc().burst('destroy', r.cx, r.cy, { t0: tt }); snd('card.destroy'); });
  };
  X.attr = function (e, c) {
    if (/^p[01]$/.test(e.target)) { // thuộc tính người chơi (vd Max Health)
      var ts = sideOf(e.target), p = heroPt(ts);
      if (e.attr === 'HealthMax' && e.amt > 0) FXc().at(impactHero(e.t), function (tt) { FXc().number({ x: p.x, y: p.y - 40, kind: 'heal', value: e.amt, t0: tt, side: ts, aux: true }); snd('board.attrMaxHp'); });
      return;
    }
    var el = V().cardEl(e.target);
    if (!el) return;
    var applied = RP.APPLY.attr(e);
    if (!applied && !/Cooldown/.test(e.attr)) return;
    if (e.src != null && e.src !== e.target) {
      var r = V().cardRect(e.target);
      if (r) FXc().projectile({ from: pointOf(e.src, cardSide(e.target)), to: { x: r.cx, y: r.cy }, kind: 'buff', t0: e.t, travel: 220, count: false, arc: 1.5 });
    }
    var up = /Cooldown/.test(e.attr) ? e.amt < 0 : e.amt > 0;
    var label = /Cooldown/.test(e.attr) ? ((e.amt > 0 ? '+' : '') + (Math.round(e.amt / 100) / 10) + 's') : ((e.amt > 0 ? '+' : '') + Math.round(e.amt));
    root.BZCard.buffText(el, label, up ? '#b6ff7a' : '#ff8a7a');
    var rr = V().cardRect(e.target); if (rr) FXc().burst('buff', rr.cx, rr.cy);
    if (up) snd('card.statBuff');
  };
  X.flying = function (e) { if (e.on) snd('combat.fly_start'); };
  X.upgrade = function (e) {
    RP.APPLY.upgrade(e);
    var r = V().cardRect(e.target); if (r) FXc().burst('buff', r.cx, r.cy);
    snd('card.upgrade.' + String(e.to || 'silver').toLowerCase());
  };
  X.enchant = function (e) {
    RP.APPLY.enchant(e);
    var r = V().cardRect(e.target); if (r) FXc().burst('buff', r.cx, r.cy);
    if (e.to) snd('card.enchantCombat.' + String(e.to).toLowerCase());
  };
  X.transform = function (e) { var r = V().cardRect(e.target); if (r) FXc().burst('buff', r.cx, r.cy); snd('combat.transform_impact'); };
  X.repair = function (e) { var r = V().cardRect(e.target); if (r) FXc().burst('buff', r.cx, r.cy); };
  X.immune = function (e) { var r = V().cardRect(e.target); if (r) FXc().burst('shield', r.cx, r.cy); };
  X.cleanse = function (e) { var ts = sideOf(e.target); FXc().at(impactHero(e.t), function (tt) { var p = heroPt(ts); FXc().burst('regen', p.x, p.y, { t0: tt, big: 0.5 }); }); };
  X.rage = function (e) { var ts = sideOf(e.target); FXc().at(impactHero(e.t), function (tt) { var p = heroPt(ts); FXc().burst('burn', p.x, p.y - 20, { t0: tt, big: 0.5 }); }); };
  X.enrage = function (e) {
    if (!e.on) return;
    var ts = sideOf(e.target);
    FXc().at(impactHero(e.t), function (tt) { V().heroFlash(ts, tt, '#ff2a4a'); V().shake(0.25, tt); snd('combat.rage_portraitchange'); });
  };
  X.sandstorm = function (e) {
    if (e.phase === 'countdown') { V().banner('Bão cát sắp nổi', 'Còn ' + Math.round((e.ms || 5000) / 1000) + ' giây', 'storm', 1700 / Math.max(1, S.speed)); }
    else if (e.phase === 'start') { V().banner('BÃO CÁT!', 'Mỗi bên mất máu liên tục, càng lúc càng mạnh', 'storm', 1900 / Math.max(1, S.speed)); snd('combat.bottledtornado_shot'); V().shake(0.3, e.t); }
  };
  X.death = function (e) {
    var ts = sideOf(e.target);
    FXc().at(impactHero(e.t) + 60, function (tt) {
      var p = heroPt(ts);
      FXc().burst('death', p.x, p.y, { t0: tt }); V().setDead(ts, true); V().shake(0.9, tt); snd('combat.hitStun'); snd('trans.defeatIn');
    });
  };
  X.revive = function (e) { var ts = sideOf(e.target); FXc().at(impactHero(e.t), function (tt) { var p = heroPt(ts); FXc().burst('heal', p.x, p.y, { t0: tt, big: 1.5 }); V().setDead(ts, false); }); };

  // ---------- kết trận (theo thời gian, tua được) ----------
  function endPhases(t, live) {
    var res = S.res, base = S.endMs + RP.LAG_HERO;
    var w = res.winner, ph = S.phase;
    var deadOn = t >= base + 60, crownOn = t >= base + 650, hold = w === 1 ? RP.BANNER_HOLD_LOSE : RP.BANNER_HOLD, bannerOn = t >= base + 750 && t < base + 750 + hold, bannerPast = t >= base + 750 + hold;
    if (ph.dead !== deadOn) {
      ph.dead = deadOn;
      if (!live || !deadOn) { [0, 1].forEach(function (s) { V().setDead(s, deadOn && (w === 'draw' ? false : s !== w) && res.players[s].health <= 0); }); }
    }
    if (ph.crown !== crownOn) {
      ph.crown = crownOn;
      [0, 1].forEach(function (s) { V().crown(s, crownOn && w === s); });
      if (crownOn && live && w !== 'draw') { var p = heroPt(w); FXc().burst('victory', p.x, p.y - 40); }
    }
    if (ph.banner !== bannerOn) {
      ph.banner = bannerOn;
      if (bannerOn) {
        var sec = (S.endMs / 1000).toFixed(1);
        if (w === 'draw') V().banner('HOÀ', 'Hết giờ sau ' + sec + ' giây', 'draw');
        else V().banner(w === 0 ? 'CHIẾN THẮNG' : 'THẤT BẠI', (res.players[w].name || '') + ' hạ gục ' + (res.players[1 - w].name || '') + ' sau ' + sec + ' giây', w === 0 ? '' : 'lose');
        if (live) { var A = AU(); if (A) { A.stopMusic(1.2); A.play(w === 1 ? 'trans.defeatIn' : 'trans.victoryIn'); } }
      } else V().hideBanner(!bannerPast); // qua hạn giữ: mờ dần; tua về trước băng-rôn: gỡ ngay
    }
    S.done = t >= S.duration - 1;
  }

  // ---------- áp trạng thái ở thời điểm t lên thẻ + hero ----------
  RP.apply = function (t, force) {
    var f = frameAt(t), F = S.frames, i = Math.floor(t / 50), f1 = F[Math.min(F.length - 1, i + 1)], u = Math.max(0, Math.min(1, (t - i * 50) / 50));
    var fc = frameAt(t - RP.LAG_CARD), fh = frameAt(t - RP.LAG_HERO), cards = S.res.cards;
    for (var k = 0; k < cards.length; k++) {
      var ci = S.info.cards[cards[k].uid]; if (!ci || !ci.el) continue;
      var a = f.c[k], b = f1.c[k], cs = fc.c[k];
      var p0 = a[0], p1 = b[0], p = p1 >= p0 ? p0 + (p1 - p0) * u : p0 + (1 - p0) * u; // lần bắn: chạy nốt tới 1 rồi về 0
      if (i >= F.length - 1) p = p0;
      root.BZCard.update(ci.el, { progress: p, ammo: a[1], haste: cs[2], slow: cs[3], freeze: cs[4], destroyed: a[5], flying: cs[6] }, force);
      // băng tan: Remove (nứt + mảnh) đúng lúc Freeze về 0
      var prevF = ci._fz || 0;
      if (prevF > 0 && !(cs[4] > 0) && !force && S.live) { var r = V().cardRect(cards[k].uid); if (r) FXc().burst('unfreeze', r.cx, r.cy); snd('combat.freeze_end'); }
      ci._fz = cs[4];
    }
    for (var s = 0; s < 2; s++) {
      var q = fh.p[s];
      V().updateHero(s, { health: q[0], shield: q[1], burn: q[2], poison: q[3], regen: q[4], rage: q[5], enragedMs: q[6], healthMax: q[7] }, t);
      var h = V().hero(s), hr = V().heroRect(s), I = h && h.intens || {};
      var box = { x: hr.x + 20, y: hr.y + 10, w: hr.w - 40, h: hr.h - 20 };
      FXc().ambient('h' + s + 'b', 'burn', box, I.burn || 0);
      FXc().ambient('h' + s + 'p', 'poison', box, I.poison || 0);
      FXc().ambient('h' + s + 'r', 'regen', box, I.regen || 0);
      FXc().ambient('h' + s + 'g', 'rage', box, I.rage || 0);
    }
    var cfg = (root.BZSim && root.BZSim.SANDSTORM) || { countdownStart: 25000, countdown: 5000 };
    var storm = t >= cfg.countdownStart + cfg.countdown && S.info.sandstorm !== false && t <= S.endMs + RP.LAG_HERO;
    if (S.phase.storm !== storm) { S.phase.storm = storm; V().sand(storm); }
    V().sandLevel(storm ? Math.min(1, 0.5 + (t - cfg.countdownStart - cfg.countdown) / 40000) : 0); // viền cồn cát dày dần (~40 s)
    FXc().ambient('sand', 'sand', { x: 0, y: 60, w: 1920, h: 960 }, storm ? Math.min(1, 0.3 + (t - cfg.countdownStart - cfg.countdown) / 30000) : 0);
    V().dial(Math.min(t, S.endMs), cfg);
  };

  // ---------- điều khiển ----------
  RP.hitStop = function (ms) { if (S) S.hitStop = Math.max(S.hitStop, ms); };
  RP.setSpeed = function (x) { if (S) S.speed = x; RP.onChange && RP.onChange(); };
  RP.pause = function (on) { if (S) S.paused = on == null ? !S.paused : !!on; RP.onChange && RP.onChange(); };
  RP.seek = function (ms) {
    if (!S) return;
    ms = Math.max(0, Math.min(S.duration, ms));
    FXc().clear();
    resetPersistent();
    S.ei = 0;
    while (S.ei < S.evs.length && S.evs[S.ei].t <= ms) {
      var e = S.evs[S.ei++], ap = RP.APPLY[e.type];
      if (ap) ap(e);
    }
    S.t = ms; S.phase = { storm: S.phase.storm };
    V().resetBars();
    V().hideBanner(true);
    [0, 1].forEach(function (s) { var h = V().hero(s); if (h) h.v = { shield: -1 }; V().setDead(s, false); V().crown(s, false); });
    RP.apply(ms, true);
    endPhases(ms, false);
    V().tick(ms, 0);
    FXc().frame(ms, 0);
    RP.onChange && RP.onChange();
  };
  RP.restart = function () { RP.seek(0); if (S) S.paused = false; RP.onChange && RP.onChange(); };
  RP.skip = function () { if (S) RP.seek(S.duration); };

  // một bước: dt = ms đồng hồ thật
  RP.step = function (dtWall, now) {
    if (!S) return;
    var t0 = performance.now();
    var prev = S.t, dt = 0;
    if (!S.paused && S.t < S.duration) {
      var d = Math.min(100, dtWall);
      if (S.hitStop > 0) { var used = Math.min(S.hitStop, d * S.speed); S.hitStop -= used; d -= used / S.speed; }
      dt = d * S.speed;
      S.t = Math.min(S.duration, S.t + dt);
    }
    S.live = true;
    // phát sự kiện đã tới hạn
    while (S.ei < S.evs.length && S.evs[S.ei].t <= S.t) {
      var e = S.evs[S.ei++];
      RP.stats.dispatched++; RP.stats.byType[e.type] = (RP.stats.byType[e.type] || 0) + 1;
      var ctx = { t: e.t };
      var fx = X[e.type];
      if (fx) { try { fx(e, ctx); } catch (err) { if (!warned['err:' + e.type]) { warned['err:' + e.type] = 1; console.warn('FX ' + e.type + ' failed', err); } } }
      else if (!warned[e.type]) { warned[e.type] = 1; console.info('BZReplay: no FX for event type "' + e.type + '"'); }
    }
    RP.apply(S.t, false);
    endPhases(S.t, true);
    V().tick(S.t, dt);
    var cardsAll = V().cards();
    for (var uid in cardsAll) { var el = cardsAll[uid].el, B = el._bz; if (B.dirty || B.hoverTo || B.hover > 0.001) root.BZCard.tick(el, now, S.t, dtWall); }
    FXc().frame(S.t, dt);
    var spent = performance.now() - t0, P = S.perf;
    P.n++; P.sum += spent; if (spent > P.max) P.max = spent;
    if (P.last) { P.iv += now - P.last; P.ivN++; }
    P.last = now;
    if (prev !== S.t && RP.onTick) RP.onTick(S.t);
  };
  RP.perf = function () {
    if (!S) return null;
    var P = S.perf;
    return { frames: P.n, avgWorkMs: P.n ? P.sum / P.n : 0, maxWorkMs: P.max, avgFrameMs: P.ivN ? P.iv / P.ivN : 0 };
  };
  RP.resetPerf = function () { if (S) S.perf = { n: 0, sum: 0, max: 0, iv: 0, ivN: 0, last: 0 }; };
})(window);
