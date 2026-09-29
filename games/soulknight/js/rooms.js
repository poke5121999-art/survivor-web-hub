// Phòng đặc biệt, lái buôn, tượng, buff ải: SK.ROOM_FILL, G.props, G.interactables.
// Nguồn: soul-knight.fandom.com trang Coins (bảng giá), Trader, Statues, Wishing Well, Buffs, Levels.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, T = SK.TILE, W = SK.world, G = SK.G, R = DS.rules;

  // ---------------------------------------------------------------- giá theo màn
  // [WIKI Coins "Gold Price"] cột: 1-1..1-3 | 1-4 | 1-5 | 2-1 ... 3-5.
  const PRICE = {
    hp_pot: [25, 31, 34, 37, 39, 43, 46, 49, 51, 54, 58, 61, 64],
    en_pot: [20, 24, 27, 29, 31, 34, 36, 39, 41, 43, 46, 48, 51],
    restore: [22, 27, 29, 32, 35, 37, 40, 43, 45, 48, 51, 53, 56],
    statue: [15, 18, 19, 21, 22, 24, 25, 27, 28, 30, 30, 30, 30],
    well: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
  };
  // [ĐO] item_value của GunThrow trong prefab theo item_level (trung vị); đơn giá gốc ở 1-1.
  const WEAPON_BASE = { 1: 20, 2: 20, 3: 36, 4: 40, 5: 50, 6: 50 };
  const col = () => SK.clamp((G.stageIdx || 0) - 2, 0, 12);
  const has = (p, id) => !!(p && p.buffs && p.buffs.indexOf(id) >= 0);
  const sale = n => has(G.player, 'sale') ? Math.max(1, Math.floor(n / 2)) : n;
  function weaponPrice(id) {
    const d = DS.weapons[id] || {};
    const wk = window.SK_WIKI && SK_WIKI.weapons[id];
    const grade = d.grade || (wk && wk.grade) || 1;
    // [ƯỚC LƯỢNG] vũ khí tăng giá theo màn cùng tỉ lệ với bình máu ("prices scale according to Floor and Level").
    return Math.round((WEAPON_BASE[grade] || 20) * PRICE.hp_pot[col()] / PRICE.hp_pot[0]);
  }

  // ---------------------------------------------------------------- tiện ích
  const ROOMS = SK.ROOMS = { force: { chest: null, special: null } };
  window.SK_ROOMS = ROOMS;
  const targetable = e => e.st !== 'spawn' && e.st !== 'dead';
  const DEFAULT_HB = { size: [12, 16], off: [0, 8] };
  function hitsEnemy(e, x, y, r) {
    const hb = e.hb || DEFAULT_HB, s = e.scale || 1;
    const cx = e.x + hb.off[0] * (e.face || 1) * s, cy = e.y - hb.off[1] * s;
    return Math.abs(x - cx) < hb.size[0] * s / 2 + r && Math.abs(y - cy) < hb.size[1] * s / 2 + r;
  }
  const enemyMid = e => [e.x, e.y - ((e.hb || DEFAULT_HB).off[1]) * (e.scale || 1)];
  function nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD || 1e9;
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const [ex, ey] = enemyMid(e), d = Math.hypot(ex - x, ey - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // Ô có tâm nằm trong hình chữ nhật thành vật cản (sàn vẫn vẽ; chỉ chặn đi lại và đạn).
  function blockRect(map, x0, y0, x1, y1) {
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) {
      const cx = tx * T + 8, cy = ty * T + 8;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      const i = W.idx(map, tx, ty);
      if (map.tiles[i] === W.FLOOR) map.tiles[i] = W.OBST;
    }
  }
  function prefabPart(pf, name) { return pf && pf.find(q => q.n === name); }
  function mbs(name, cls) { return SK.prefabMbs(SK.prefab(name), cls) || {}; }
  function explode(x, y, radius, dmg) {
    SK.fx(G, 'prefab', x, y - 8, { parts: SK.art.vfx('explode'), state: 'explode_small', dur: 0.66 });
    G.shake = Math.max(G.shake, 3);
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const [ex, ey] = enemyMid(e);
      if (Math.hypot(ex - x, ey - y) < radius) SK.hurtEnemy(G, e, dmg, false, Math.atan2(ey - y, ex - x), 3);
    }
  }
  function pay(n) {
    const p = G.player;
    if (p.gold < n) { G.toast('Không đủ vàng!'); return false; }
    p.gold -= n;
    return true;
  }

  // ---------------------------------------------------------------- vật bay tự viết (đạn tượng, cầu máu)
  // Đạn lõi không xuyên và không đuổi mục tiêu; tượng Pháp Sư/Sát Thủ cần cả hai nên tự quản lý ở đây.
  function shot(o) {
    const s = Object.assign({ r: 3, life: 3, hit: new Set(), t: 0 }, o);
    s.update = (G2, pr, dt) => {
      pr.t += dt; pr.life -= dt;
      if (pr.life <= 0) { pr.gone = true; return; }
      if (pr.homing) {
        const e = nearestEnemy(pr.x, pr.y, 160);
        if (e) {
          const [ex, ey] = enemyMid(e), want = Math.atan2(ey - pr.y, ex - pr.x), cur = Math.atan2(pr.vy, pr.vx);
          const da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), turn = SK.clamp(da, -pr.homing * dt, pr.homing * dt);
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(cur + turn) * sp; pr.vy = Math.sin(cur + turn) * sp;
        }
      }
      const n = Math.max(1, Math.ceil(Math.hypot(pr.vx, pr.vy) * dt / 4));
      for (let k = 0; k < n && !pr.gone; k++) {
        pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
        if (W.solidAt(G.map, pr.x, pr.y + (pr.h || 6))) { pr.gone = true; break; }
        for (const e of G.enemies) {
          if (!targetable(e) || pr.hit.has(e) || !hitsEnemy(e, pr.x, pr.y, pr.r)) continue;
          SK.hurtEnemy(G, e, pr.dmg, false, Math.atan2(pr.vy, pr.vx), 1);
          pr.hit.add(e);
          if (!pr.pierce) { pr.gone = true; break; }
        }
      }
    };
    s.draw = (ctx, G2, pr) => {
      const a = Math.atan2(pr.vy, pr.vx);
      if (pr.style === 'needle') {
        ctx.save(); ctx.translate(Math.round(pr.x), Math.round(pr.y)); ctx.rotate(a);
        ctx.fillStyle = '#5b1515'; ctx.fillRect(-6, -1, 9, 2);
        ctx.fillStyle = '#ff6a6a'; ctx.fillRect(-5, -0.5, 9, 1);
        ctx.restore();
        return;
      }
      ctx.fillStyle = pr.glow; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r + 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pr.color; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 1, 1);
    };
    G.props.push(s);
  }
  // Cầu máu / năng lượng bay thẳng về người chơi dù ở xa ([WIKI] Life Harvest, Mana Harvest).
  function orb(kind, x, y) {
    G.props.push({
      x, y, t: 0, kind,
      update(G2, pr, dt) {
        pr.t += dt;
        const p = G.player;
        if (pr.t < 0.35) { pr.y -= 20 * dt; return; }
        const dx = p.x - pr.x, dy = p.y - 8 - pr.y, d = Math.hypot(dx, dy), s = 90 + pr.t * 160;
        if (d < 6) {
          pr.gone = true;
          if (kind === 'hp') { p.hp = Math.min(p.hpMax, p.hp + 1); SK.num(G, p.x, p.y - 26, '+1', '#ff6a6a'); }
          else { p.energy = Math.min(p.energyMax, p.energy + 8); SK.num(G, p.x, p.y - 26, '+8', '#6ac8ff'); }
          return;
        }
        pr.x += dx / d * s * dt; pr.y += dy / d * s * dt;
      },
      draw(ctx, G2, pr) {
        const c = kind === 'hp' ? ['rgba(255,70,70,0.35)', '#ff5050'] : ['rgba(80,190,255,0.35)', '#5ad0ff'];
        ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(pr.x, pr.y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  // Vòng tròn trên nền: lan ra (Tiên Tộc) hoặc co lại (Đạo Tặc).
  function groundRing(x, y, r0, r1, dur, color) {
    G.props.push({
      x, y: -1e9, t: 0,
      update(G2, pr, dt) { pr.t += dt; if (pr.t >= dur) pr.gone = true; },
      draw(ctx, G2, pr) {
        const k = pr.t / dur, r = r0 + (r1 - r0) * k;
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- CỬA HÀNG (phòng rương vàng)
  // Bố cục thật của prefab sell2-1 (bình máu, bình năng lượng, 1 vũ khí) và sell1-2 (bình hồi phục, 2 vũ khí)
  // khớp bảng "3 items" trang Trader. Lái buôn không có ở 1-1, 1-2 [WIKI Trader].
  function shopWeapons(level, n) {
    let pool = null;
    if (typeof SK.weaponPool === 'function') {
      try { pool = SK.weaponPool(level, 'shop'); } catch (e) { SK.warnOnce('wpool', 'weaponPool failed: ' + e.message); }
    }
    pool = (pool || []).map(x => typeof x === 'string' ? x : x && x.id).filter(id => DS.weapons[id]);
    if (!pool.length) {
      pool = Object.keys(DS.weapons).filter(id => {
        const w = DS.weapons[id];
        return id !== 'bad_pistol' && (w.grade || 1) <= level + 1 && SK.WEAPON_KINDS[w.kind] && SK.frame(w.sprite);
      });
    }
    const own = G.player ? G.player.weapons.filter(Boolean).map(w => w.id) : [];
    const fresh = pool.filter(id => own.indexOf(id) < 0);
    return SK.shuffle((fresh.length >= n ? fresh : pool).slice()).slice(0, n);
  }

  const POTION = {
    hp_pot: { name: 'Bình Máu', prefab: 'health_pot', price: () => PRICE.hp_pot[col()] },
    en_pot: { name: 'Bình Năng Lượng', prefab: 'energy_pot', price: () => PRICE.en_pot[col()] },
    restore: { name: 'Bình Hồi Phục', prefab: 'restore_pot', price: () => PRICE.restore[col()] }
  };
  // Bình mua ở tiệm uống ngay; số hồi đọc từ prefab [ĐO] (health_pot 2 máu, energy_pot 80, restore_pot 1 máu + 40).
  function drinkPotion(kind) {
    const p = G.player, boost = has(p, 'recovery') ? 2 : 1;
    const hp = kind === 'hp_pot' ? mbs('health_pot', 'RGHealthPot').health || 2 : kind === 'restore' ? mbs('restore_pot', 'RGBothPot').health || 1 : 0;
    const en = kind === 'en_pot' ? mbs('energy_pot', 'RGEnergyPot').energy || 80 : kind === 'restore' ? mbs('restore_pot', 'RGBothPot').energy || 40 : 0;
    if (hp) { p.hp = Math.min(p.hpMax, p.hp + hp * boost); SK.num(G, p.x - 4, p.y - 26, '+' + hp * boost, '#ff6a6a'); }
    if (en) { p.energy = Math.min(p.energyMax, p.energy + en * boost); SK.num(G, p.x + 4, p.y - 20, '+' + en * boost, '#6ac8ff'); }
  }
  function giveWeapon(id) {
    const p = G.player;
    if (!p.weapons[1]) { p.weapons[1] = SK.makeWeapon(id); p.cur = 1; }
    else {
      const old = p.weapons[p.cur];
      p.weapons[p.cur] = SK.makeWeapon(id);
      G.items.push({ id: old.id, x: p.x, y: p.y + 4, t: 0 });
    }
    if (p.skillT > 0 && p.dual) SK.endSkill(G, p);
  }

  function fillShop(G2, r, c) {
    const name = SK.chance(0.5) ? 'sell2-1' : 'sell1-2';
    const pf = SK.prefab(name);
    if (!pf) return false;
    const [cx, cy] = c;
    const npcAnim = (prefabPart(pf, '/npc01') || {}).a;
    const animKey = npcAnim && npcAnim[Object.keys(npcAnim)[0]];
    const merchant = { x: cx, y: cy + 2, t: SK.rand() * 2, shop: true,
      draw(ctx, G3, pr) {
        const sh = prefabPart(pf, '/npc01/shadow');
        if (sh) SK.drawTinted(ctx, sh.f, cx + sh.at[0], cy - sh.at[1], sh.c, { alpha: 0.6 });
        // /npc01 mang Animator (npc01_ide 16 khung/giây, SpriteAnimation của lái buôn khác 12 khung/giây);
        // khung tĩnh /npc01/img/body trùng chỗ nên bỏ.
        const fr = SK.animFrame(animKey, G.t + pr.t) || 'npc00_0_0';
        SK.draw(ctx, fr, cx, cy - 32);
        for (const n of ['/table/c3', '/table/c3/c']) { const q = prefabPart(pf, n); if (q) SK.draw(ctx, q.f, cx + q.at[0], cy - q.at[1]); }
      }
    };
    G.props.push(merchant);
    // Bàn + chân lái buôn: collider prefab box 72×24 lệch -3,2 quanh /table/c3/c; chặn tới đáy mặt bàn.
    blockRect(G.map, cx - 36, cy - 40, cx + 36, cy + 2);

    const slots = pf.filter(q => /^\/container\d$/.test(q.n));
    const weapons = shopWeapons(G.stage.level, slots.length);
    let wi = 0;
    for (const q of slots) {
      const m = q.mbs && q.mbs.RGContainer || {};
      const cfg = m.randomObjectMaker && m.randomObjectMaker.configName;
      const kind = cfg === 'health_pot' ? 'hp_pot' : cfg === 'energy_pot' ? 'en_pot' : cfg === 'restore_pot' ? 'restore' : 'weapon';
      const id = kind === 'weapon' ? weapons[wi++] : null;
      if (kind === 'weapon' && !id) continue;
      const px = cx + q.at[0], py = cy - q.at[1];
      const item = {
        kind, id, x: px, y: py + 8, t: SK.rand() * 3, sold: false, shopItem: true,
        price() { return sale(kind === 'weapon' ? weaponPrice(id) : POTION[kind].price()); },
        name() { return kind === 'weapon' ? DS.weapons[id].name : POTION[kind].name; },
        update(G3, pr, dt) { pr.t += dt; },
        draw(ctx, G3, pr) {
          const ped = prefabPart(pf, q.n + '/c1');
          if (ped) SK.draw(ctx, ped.f, cx + ped.at[0], cy - ped.at[1]);
          if (pr.sold) return;
          const bob = Math.round(Math.sin(pr.t * 3) * 1.5), top = py - 9 + bob;
          if (kind === 'weapon') SK.drawGun(ctx, DS.weapons[id].sprite, px - 6, top, 0, null, {});
          else SK.drawPrefab(ctx, SK.prefab(POTION[kind].prefab), px, top, {});
        }
      };
      G.props.push(item);
      blockRect(G.map, px - 14, py - 8, px + 14, py + 8);
      G.interactables.push({
        x: px, y: py + 14, r: 22, labelY: 44, get label() { return 'Mua ' + item.name() + ' (' + item.price() + ' vàng)'; },
        get gone() { return item.sold; },
        use(G3, o) {
          const n = item.price();
          if (!pay(n)) return;
          item.sold = true;
          if (kind === 'weapon') giveWeapon(id); else drinkPotion(kind);
          G.toast('Đã mua ' + item.name());
          SK.emit('shopBuy', G, { kind, id, price: n });
        }
      });
    }
    r.fill = 'shop';
    return true;
  }

  const baseChest = SK.ROOM_FILL.chest;
  SK.ROOM_FILL.chest = function (G2, r, c) {
    const f = ROOMS.force.chest;
    const shopOk = G.stageIdx >= 2;
    // [ƯỚC LƯỢNG] nửa số phòng rương vàng từ 1-3 trở đi là cửa hàng; wiki không ghi tỉ lệ.
    const want = f ? f === 'shop' : shopOk && SK.chance(0.5);
    if (want && fillShop(G2, r, c)) return;
    r.fill = 'chest';
    baseChest(G2, r, c);
  };

  // ---------------------------------------------------------------- TƯỢNG (phòng dấu chấm than)
  // [WIKI Statues] dâng vàng → hiệu ứng tượng, kích hoạt khi dùng kỹ năng; chỉ giữ một tượng; qua cổng hồi ngay.
  // cd/atk/count đọc từ prefab buff_statue_N [ĐO]. Bỏ tượng Hiệp Sĩ (cần hệ thống lính đi theo).
  const STATUES = {
    1: { name: 'Tượng Pháp Sư', desc: 'Kỹ năng bắn 8 viên phép đuổi mục tiêu.' },
    3: { name: 'Tượng Mục Sư', desc: 'Kỹ năng tạo trận pháp 3 giây: mỗi giây hồi 10 năng lượng + 1 giáp.' },
    4: { name: 'Tượng Sát Thủ', desc: 'Kỹ năng phóng 5 kim xuyên thấu.' },
    5: { name: 'Tượng Tiên Tộc', desc: 'Kỹ năng tạo sóng xung kích 6 sát thương, xoá đạn địch.' },
    6: { name: 'Tượng Đạo Tặc', desc: 'Kỹ năng tăng 50% tốc chạy 5 giây, hút quái lại gần + 6 sát thương.' },
    7: { name: 'Tượng Hiệp Sĩ Thánh', desc: 'Kỹ năng tạo khiên chặn đòn kế tiếp trong 6 giây.' },
    8: { name: 'Tượng Kỹ Sư', desc: 'Kỹ năng đặt 4 gói thuốc nổ, 20 sát thương.' }
  };
  const statueCfg = id => {
    const pf = SK.prefab('buff_statue_' + id);
    const part = pf && pf[0], m = part && part.mbs ? Object.values(part.mbs)[0] : {};
    return { cd: m.cd || 8, m, color: (part && part.c) || [1, 1, 1, 1] };
  };

  function fillStatue(G2, r, c) {
    const ids = Object.keys(STATUES).map(Number).filter(i => SK.prefab('statue_0' + i));
    if (!ids.length) return false;
    const id = SK.pick(ids), pf = SK.prefab('statue_0' + id);
    const talk = SK.prefabMbs(pf, 'TalkStatue') || {};
    const [x, y] = [c[0], c[1] + 8];
    G.props.push({ x, y, t: 0, statue: id, draw(ctx, G3, pr) {
      SK.drawPrefab(ctx, pf, x, y, {});
      // Ánh đèn dưới chân tượng nhấp nháy như Animator gốc.
      const l = prefabPart(pf, '/light');
      if (l) SK.drawTinted(ctx, l.f, x + l.at[0], y - l.at[1], l.c, { alpha: 0.5 + 0.5 * Math.sin(G.t * 3) });
    } });
    blockRect(G.map, x - 16, y - 30, x + 16, y);
    G.interactables.push({
      x, y: y + 6, r: 30, labelY: 58,
      get label() {
        const p = G.player;
        return p.statue === id ? STATUES[id].name + ' (đang có)' : STATUES[id].name + ' — dâng ' + PRICE.statue[col()] + ' vàng';
      },
      use() {
        const p = G.player;
        if (p.statue === id) { G.toast(STATUES[id].desc, 2.5); return; }
        // talk.item_value 15 [ĐO] = cột đầu của bảng giá wiki; bảng lo phần tăng giá theo màn.
        const n = col() ? PRICE.statue[col()] : talk.item_value || PRICE.statue[0];
        if (!pay(n)) return;
        p.statue = id; p.statueCd = 0;
        SK.fx(G, 'ring', p.x, p.y, { dur: 0.5, color: '#ffe06a' });
        G.toast(STATUES[id].name + ': ' + STATUES[id].desc, 3);
        SK.emit('statueBuy', G, id);
      }
    });
    r.fill = 'statue_' + id;
    return true;
  }

  function triggerStatue(p) {
    const id = p.statue, cfg = statueCfg(id), m = cfg.m;
    p.statueCd = cfg.cd * (has(p, 'cooldown') ? 0.8 : 1);
    const x = p.x, y = p.y - 8;
    if (id === 1 || id === 4) {
      const n = m.count || (id === 1 ? 8 : 5), sp = (m.speed || 12) * SK.PPU;
      const base = id === 1 ? 0 : p.aim, step = id === 1 ? Math.PI * 2 / n : SK.deg(m.angle || 12);
      for (let i = 0; i < n; i++) {
        const a = id === 1 ? base + i * step : base + (i - (n - 1) / 2) * step;
        shot(id === 1
          ? { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.atk || 4, homing: 5, r: 3, life: 2.5, color: '#e070ff', glow: 'rgba(220,60,255,0.35)' }
          : { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.atk || 4, pierce: true, r: 2, life: 1.2, style: 'needle' });
      }
    } else if (id === 3) {
      // [WIKI] bán kính 4 ô, 3 giây, ngay lập tức rồi mỗi giây: +10 năng lượng, +1 giáp.
      const cx = p.x, cy = p.y;
      G.props.push({ x: cx, y: -1e9, t: 0, tick: 0,
        update(G3, pr, dt) {
          pr.t += dt; pr.tick -= dt;
          if (pr.t > 3) { pr.gone = true; return; }
          if (pr.tick <= 0) {
            pr.tick += 1;
            const q = G.player, k = has(q, 'recovery') ? 2 : 1;
            if (Math.hypot(q.x - cx, q.y - cy) < 4 * T && q.st !== 'dead') {
              q.energy = Math.min(q.energyMax, q.energy + 10 * k); q.armor = Math.min(q.armorMax, q.armor + k);
            }
          }
        },
        draw(ctx, G3, pr) {
          ctx.save(); ctx.globalAlpha = Math.min(1, (3 - pr.t) * 2) * (0.55 + 0.15 * Math.sin(pr.t * 8));
          ctx.fillStyle = 'rgba(255,250,200,0.18)'; ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(cx, cy, 4 * T, 4 * T * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(cx, cy, 4 * T * 0.6, 4 * T * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        } });
    } else if (id === 5) {
      const dmg = (m.info && m.info.damage) || 6;
      groundRing(p.x, p.y, 8, 12 * T, 0.4, '#8fe8ff');
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const [ex, ey] = enemyMid(e);
        if (Math.hypot(ex - x, ey - y) < 12 * T) SK.hurtEnemy(G, e, dmg, false, Math.atan2(ey - y, ex - x), 6);
      }
      for (const b of G.bullets) if (b.side === 'e' && Math.hypot(b.x - x, b.y - y) < 12 * T) b.dead = true;
    } else if (id === 6) {
      p.thiefT = 5;
      groundRing(p.x, p.y, 12 * T, 6, 0.5, '#ffe44a');
      G.props.push({ x: 0, y: -1e9, t: 0, update(G3, pr, dt) {
        pr.t += dt;
        if (pr.t < 0.5) return;
        pr.gone = true;
        const q = G.player;
        for (const e of G.enemies) {
          if (!targetable(e)) continue;
          const [ex, ey] = enemyMid(e);
          if (Math.hypot(ex - q.x, ey - q.y) < 12 * T) SK.hurtEnemy(G, e, 6, false, Math.atan2(q.y - ey, q.x - ex), 8);
        }
      }, draw() {} });
    } else if (id === 7) {
      p.paladinShield = 1; p.paladinT = 6;
    } else if (id === 8) {
      const n = m.count || 4, off = (m.offset || 2.5) * T;
      for (let i = 0; i < n; i++) {
        const a = SK.deg(45 + i * (m.angle || 90)), tx = p.x + Math.cos(a) * off, ty = p.y + Math.sin(a) * off * 0.8;
        G.props.push({ x: tx, y: ty, t: 0,
          update(G3, pr, dt) { pr.t += dt; if (pr.t >= 0.5) { pr.gone = true; explode(tx, ty - 4, 4 * T, m.atk || 20); } },
          draw(ctx, G3, pr) {
            if (!SK.draw(ctx, 'bullet_tnt_immediately', tx, ty - 6, { alpha: Math.floor(pr.t * 16) % 2 ? 0.7 : 1 })) {
              ctx.fillStyle = '#b8261c'; ctx.fillRect(tx - 5, ty - 8, 10, 7); ctx.fillStyle = '#f2d24a'; ctx.fillRect(tx - 5, ty - 6, 10, 1);
            }
          } });
      }
    }
    SK.emit('statueFire', G, id);
  }
  SK.on('skill', (G2, p) => { if (p.statue && !(p.statueCd > 0)) triggerStatue(p); });

  // ---------------------------------------------------------------- GIẾNG ƯỚC (phòng dấu chấm than)
  // [WIKI Wishing Well] 1 xu/lần (2 xu từ 3-1), tối đa 50 lần; có đồ thì phải nhặt rồi mới ném tiếp.
  function fillWell(G2, r, c) {
    const pf = SK.prefab('wishing_well');
    if (!pf) return false;
    // Thân giếng /img/body neo đỉnh ở +24 px, cao 50 px: gốc đặt lệch lên để giếng nằm giữa phòng.
    const x = c[0], y = c[1] - 6;
    const part = n => prefabPart(pf, n);
    const well = { x, y: y + 26, t: 0, uses: 0, reward: null, draw(ctx, G3, pr) {
      for (const n of ['/img/top', '/img/body']) { const q = part(n); if (q) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]); }
      if (pr.uses >= 50) return;
      // Hai lớp sáng là sprite cộng màu trong Unity.
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(G.t * 2.5);
      for (const n of ['/img/light/light_1', '/img/light/light_2']) { const q = part(n); if (q) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]); }
      ctx.restore();
    } };
    G.props.push(well);
    blockRect(G.map, x - 30, y - 24, x + 30, y + 24);
    const waiting = () => well.reward && (G.items.indexOf(well.reward) >= 0 || G.pickups.indexOf(well.reward) >= 0);
    G.interactables.push({
      x, y: y + 30, r: 38, labelY: 74,
      get label() { return 'Giếng Ước — ném ' + sale(PRICE.well[col()]) + ' xu'; },
      use() {
        if (well.uses >= 50) { G.toast('Nước đã đục.'); return; }
        if (waiting()) { G.toast('Nhặt món đồ trong giếng trước đã.'); return; }
        const n = sale(PRICE.well[col()]);
        if (G.player.gold < n) { G.toast('Hết xu rồi.'); return; }
        G.player.gold -= n; well.uses++;
        SK.fx(G, 'ring', x, y - 10, { dur: 0.35, color: '#9fe6ff' });
        // [ƯỚC LƯỢNG] 1/8 lần ném ra đồ; wiki chỉ nói "có khả năng", dồn về cuối 50 lần.
        const luck = well.uses > 40 ? 0.35 : 0.12;
        if (!SK.chance(luck)) { G.toast('Chẳng có gì xảy ra. Ném thêm xu?'); return; }
        if (SK.chance(0.5)) {
          const id = shopWeapons(G.stage.level + 1, 1)[0];
          if (id) { well.reward = { id, x, y: y + 40, t: 0 }; G.items.push(well.reward); G.toast('Giếng trả lại ' + DS.weapons[id].name + '!'); return; }
        }
        const kind = SK.chance(0.5) ? 'hp_pot' : 'en_pot';
        SK.dropPickup(G, kind, x, y + 36);
        well.reward = G.pickups[G.pickups.length - 1];
        G.toast('Giếng trả lại một bình thuốc!');
      }
    });
    r.fill = 'well';
    return true;
  }

  const baseSpecial = SK.ROOM_FILL.special;
  SK.ROOM_FILL.special = function (G2, r, c) {
    const f = ROOMS.force.special;
    // [ƯỚC LƯỢNG] tượng 2/3, giếng ước 1/3 (wiki liệt kê cả chục loại, không ghi tỉ lệ).
    const kind = f || (SK.chance(0.66) ? 'statue' : 'well');
    if (kind === 'well' && fillWell(G2, r, c)) return;
    if (fillStatue(G2, r, c)) return;
    baseSpecial(G2, r, c);
  };

  // ---------------------------------------------------------------- BUFF
  // [WIKI Buffs] 7 ô buff; chọn 1 trong 3 sau màn 1-1, 1-3, 1-5, 2-3, 2-5, 3-5 (tools/wiki/levels.json buff_at_end).
  // Icon: ui_buff_<id wiki> trong bundle ui.
  const BUFF_AFTER = ['1-1', '1-3', '1-5', '2-3', '2-5', '3-5'];
  const BUFF_SLOTS = 7;
  const BUFFS = ROOMS.BUFFS = [
    { id: 'health', icon: 'ui_buff_16', name: 'Tim Dũng Cảm', desc: 'Máu tối đa +4, hồi 4 máu.',
      apply(p) { p.hpMax += 4; p.hp += 4; } },                                               // [WIKI] Brave Heart
    { id: 'armor', icon: 'ui_buff_26', name: 'Giáp Sắt', desc: 'Giáp tối đa +1.',
      apply(p) { p.armorMax += 1; p.armor += 1; } },                                          // [WIKI] Ironclad
    { id: 'energy', icon: 'ui_buff_30', name: 'Pháp Lực Dồi Dào', desc: 'Năng lượng tối đa +100, hồi 100.',
      apply(p) { p.energyMax += 100; p.energy += 100; } },                                    // [WIKI] Mana Might
    { id: 'cooldown', icon: 'ui_buff_21', name: 'Hồi Chiêu Nhanh', desc: 'Kỹ năng và tượng hồi nhanh hơn 20%.',
      apply(p) { p.h = Object.assign({}, p.h, { skill: Object.assign({}, p.h.skill, { cd: p.h.skill.cd * 0.8 }) }); } }, // [WIKI] 25 CDR = 20%
    { id: 'accuracy', icon: 'ui_buff_20', name: 'Đòn Chính Xác', desc: 'Giảm độ lệch đạn tới 10, phần dư cộng vào chí mạng.' }, // [WIKI] Precise Strike
    { id: 'shotgun', icon: 'ui_buff_03', name: 'Mưa Đạn Hoa Cải', desc: 'Súng bắn chùm thêm 2 viên.' }, // [WIKI] Shotgun Barrage
    { id: 'rapid', icon: 'ui_buff_32', name: 'Bắn Liên Thanh', desc: 'Mỗi phát bắn +2% tốc bắn (tối đa 5 tầng, đủ tầng +10% nữa).' }, // [WIKI] Rapid Fire
    { id: 'sale', icon: 'ui_buff_10', name: 'Giảm Giá!', desc: 'Mua ở cửa hàng rẻ một nửa.' },       // [WIKI] On Sale!
    { id: 'life_orb', icon: 'ui_buff_11', name: 'Gặt Sinh Lực', desc: 'Quái chết có thể rơi cầu máu hồi 1 máu.' }, // [WIKI] Life Harvest
    { id: 'mana_orb', icon: 'ui_buff_13', name: 'Gặt Năng Lượng', desc: 'Quái chết có 17% rơi cầu 8 năng lượng.' }, // [WIKI] Mana Harvest
    { id: 'slow_bullet', icon: 'ui_buff_14', name: 'Chạm Bẻ Cong', desc: 'Đạn quái bay chậm hơn 10%.' },  // [WIKI] Warping Touch
    { id: 'strong_shield', icon: 'ui_buff_06', name: 'Khiên Vững', desc: 'Còn giáp thì đòn vỡ giáp không trừ lan sang máu.' }, // [WIKI] Sturdy Shield
    { id: 'instant_armor', icon: 'ui_buff_38', name: 'Giáp Bền Bỉ', desc: 'Giáp cạn thì hồi ngay 50% (60 giây một lần).' }, // [WIKI] Armor Resilience
    { id: 'gold_armor', icon: 'ui_buff_34', name: 'Giáp Vàng', desc: 'Giữ đủ 100/200/300 vàng: giáp tối đa +1/+2/+3.' }, // [WIKI] Golden Armor
    { id: 'melee_range', icon: 'ui_buff_29', name: 'Tầm Với Xa', desc: 'Vũ khí cận chiến chém xa hơn 20%.' }, // [WIKI] Long Reach
    { id: 'monster_explode', icon: 'ui_buff_33', name: 'Nổ Khi Chết', desc: 'Quái chết có 50% phát nổ, 10 sát thương quanh đó.' }, // [WIKI] Blast on Death
    { id: 'crate', icon: 'ui_buff_19', name: 'Vận May Thùng Gỗ', desc: 'Phá thùng có 3% rơi bình máu, dễ rơi năng lượng hơn.' }, // [WIKI] Looting Luck
    { id: 'focus', icon: 'ui_buff_1020', name: 'Tập Trung', desc: 'Mỗi quái hạ: +5% tốc bắn, +5% chí mạng trong 10 giây (tối đa 4 tầng).' }, // [WIKI] Stay Focused
    { id: 'recovery', icon: 'ui_buff_12', name: 'Hồi Phục Gấp Đôi', desc: 'Hồi giáp, bình thuốc và cầu hồi gấp đôi.' } // [WIKI] Recovery Boost
  ];
  const BUFF = {};
  for (const b of BUFFS) BUFF[b.id] = b;

  // Buff chỉnh vũ khí: bọc SK.makeWeapon để def của người chơi là bản sao đã cộng buff.
  function buffedDef(def, p) {
    const d = Object.assign({}, def);
    if (has(p, 'shotgun') && (d.pellets || 1) > 1) d.pellets += 2;
    if (has(p, 'accuracy') && d.kind !== 'melee') {
      const cut = Math.min(10, d.spread || 0);
      d.spread = (d.spread || 0) - cut; d.crit = (d.crit || 0) + (10 - cut);
    }
    if (has(p, 'melee_range') && d.kind === 'melee') d.range = (d.range || 24) * 1.2;
    return d;
  }
  const baseMake = SK.makeWeapon;
  SK.makeWeapon = function (id) {
    const w = baseMake(id), p = G.player;
    if (p && p.buffs && p.buffs.length && w.def) w.def = buffedDef(w.def, p);
    return w;
  };
  function refreshWeapons(p) {
    for (const w of p.weapons.concat([p.dual])) if (w && DS.weapons[w.id]) w.def = buffedDef(DS.weapons[w.id], p);
  }

  // Nhân tố tốc bắn / chí mạng của từng buff tính riêng để không giẫm lên kỹ năng đang sửa cùng biến.
  function setMul(p, key, val) {
    const k = '_bm_' + key, old = p[k] || 1;
    if (old === val) return;
    p.rateMul = (p.rateMul || 1) / old * val; p[k] = val;
  }
  function setCrit(p, key, val) {
    const k = '_bc_' + key, old = p[k] || 0;
    if (old === val) return;
    p.crit += val - old; p[k] = val;
  }

  function takeBuff(p, id) {
    const b = BUFF[id]; if (!b || has(p, id)) return;
    p.buffs.push(id);
    if (b.apply) b.apply(p);
    refreshWeapons(p);
    SK.emit('buffTake', G, id);
  }
  ROOMS.takeBuff = id => G.player && (G.player.buffs = G.player.buffs || [], takeBuff(G.player, id));

  // Bọc SK.hurtPlayer: khiên tượng Hiệp Sĩ Thánh, Khiên Vững, Giáp Bền Bỉ.
  const baseHurt = SK.hurtPlayer;
  SK.hurtPlayer = function (G2, dmg, ...rest) {
    const p = G2.player;
    if (!p || p.st === 'dead' || p.invulT > 0 || !(dmg > 0)) return baseHurt(G2, dmg, ...rest);
    if (p.paladinShield > 0) {
      p.paladinShield--; p.invulT = R.hurtInvuln;
      SK.fx(G, 'ring', p.x, p.y - 8, { dur: 0.3, color: '#6ab8ff' });
      return false;
    }
    if (has(p, 'strong_shield') && p.armor > 0 && dmg > p.armor) dmg = p.armor;
    const before = p.armor;
    const hit = baseHurt(G2, dmg, ...rest);
    if (hit && has(p, 'instant_armor') && before > 0 && p.armor === 0 && p.st !== 'dead' && !(p.resilCd > 0)) {
      p.armor = Math.floor(p.armorMax * (has(p, 'recovery') ? 1 : 0.5)); p.resilCd = 60;
      SK.num(G, p.x, p.y - 34, '+' + p.armor, '#c9d2df');
    }
    return hit;
  };

  SK.on('fire', (G2, p) => {
    if (!has(p, 'rapid')) return;
    p.rapidN = Math.min(5, (p.rapidN || 0) + 1); p.rapidT = 3;
  });
  SK.on('enemyKill', (G2, e) => {
    const p = G2.player; if (!p || !p.buffs) return;
    const [x, y] = enemyMid(e);
    // [ƯỚC LƯỢNG] 15%: wiki chỉ ghi "có khả năng" rơi cầu máu.
    if (has(p, 'life_orb') && SK.chance(0.15)) orb('hp', x, y);
    if (has(p, 'mana_orb') && SK.chance(0.17)) orb('en', x, y);
    // [ƯỚC LƯỢNG] bán kính nổ 2,5 ô (wiki chỉ ghi 10 sát thương).
    if (has(p, 'monster_explode') && SK.chance(0.5)) explode(e.x, e.y - 6, 40, 10);
    if (has(p, 'focus')) { p.focusN = Math.min(4, (p.focusN || 0) + 1); p.focusT = 10; }
  });
  SK.on('obstacleBreak', (G2, o) => {
    const p = G2.player;
    if (!has(p, 'crate') || !/box|cask/.test(o.kind || o.name || '')) return;
    if (SK.chance(0.03)) SK.dropPickup(G, 'hp_pot', o.x, o.y - 4);
    else if (SK.chance(0.02)) SK.dropPickup(G, 'energy', o.x, o.y - 4);
  });
  SK.on('pickup', (G2, kind) => {
    const p = G2.player;
    if (!has(p, 'recovery')) return;
    if (kind === 'hp_pot') p.hp = Math.min(p.hpMax, p.hp + (mbs('health_pot', 'RGHealthPot').health || 2));
    if (kind === 'en_pot') p.energy = Math.min(p.energyMax, p.energy + (mbs('energy_pot', 'RGEnergyPot').energy || 80));
    if (kind === 'energy') p.energy = Math.min(p.energyMax, p.energy + R.energyOrb);
  });

  // Mọi thứ chạy theo khung: đặt ở một prop vô hình dưới chân người chơi (vẽ vòng tượng luôn).
  function controller() {
    return {
      x: 0, y: 0, ctl: true,
      update(G2, pr, dt) {
        const p = G.player; if (!p) return;
        pr.x = p.x; pr.y = p.y - 0.5;
        if (p.statueCd > 0) p.statueCd -= dt;
        if (p.resilCd > 0) p.resilCd -= dt;
        if (p.paladinT > 0 && (p.paladinT -= dt) <= 0) p.paladinShield = 0;
        const thief = p.thiefT > 0 ? ((p.thiefT -= dt), 1.5) : 1;
        if (p._bmThief !== thief) { p.moveMul = (p.moveMul || 1) / (p._bmThief || 1) * thief; p._bmThief = thief; }
        if (!p.buffs || !p.buffs.length) return;
        if (p.rapidT > 0) p.rapidT -= dt;
        else if (p.rapidN > 0) { p.rapidDecay = (p.rapidDecay || 0) + dt; if (p.rapidDecay > 0.3) { p.rapidN--; p.rapidDecay = 0; } }
        const rn = p.rapidN || 0;
        if (p.focusT > 0 && (p.focusT -= dt) <= 0) p.focusN = 0;
        const fn = p.focusN || 0;
        setMul(p, 'rapid', 1 + rn * 0.02 + (rn >= 5 ? 0.1 : 0));
        setMul(p, 'focus', 1 + fn * 0.05);
        setCrit(p, 'focus', fn * 5);
        if (has(p, 'gold_armor')) {
          const bonus = Math.min(3, Math.floor(p.gold / 100)), old = p._goldArmor || 0;
          if (bonus !== old) { p.armorMax += bonus - old; p.armor = Math.min(p.armorMax, p.armor + Math.max(0, bonus - old)); p._goldArmor = bonus; }
        }
        // Hồi giáp gấp đôi: trừ thêm một lần dt vào nhịp hồi của lõi.
        if (has(p, 'recovery') && p.armorT <= 0 && p.armor < p.armorMax) p.armorTick -= dt;
        if (has(p, 'slow_bullet')) for (const b of G.bullets) if (b.side === 'e' && !b._slow) { b._slow = 1; b.vx *= 0.9; b.vy *= 0.9; }
      },
      draw(ctx) {
        const p = G.player;
        if (!p || p.st === 'dead' || !p.statue || p.statueCd > 0) return;
        // [WIKI] vòng màu dưới chân = hiệu ứng tượng sẵn sàng; khung + màu từ prefab buff_statue_N [ĐO].
        const c = statueCfg(p.statue).color;
        SK.drawTinted(ctx, 'effect_08_30', p.x, p.y + 1, [c[0], c[1], c[2], 0.85]);
      }
    };
  }
  function overPlayer() {
    return { x: 0, y: 0, update(G2, pr) { const p = G.player; pr.x = p.x; pr.y = p.y + 0.5; },
      draw(ctx) {
        const p = G.player;
        if (!(p.paladinShield > 0) || p.st === 'dead') return;
        ctx.save(); ctx.globalAlpha = 0.45 + 0.15 * Math.sin(G.t * 6);
        ctx.strokeStyle = '#8fd0ff'; ctx.fillStyle = 'rgba(80,160,255,0.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y - 9, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      } };
  }

  // ---------------------------------------------------------------- màn chọn buff
  // Như game gốc: bước vào cổng sau màn có buff thì dừng ở cổng (G.hold) tới khi chọn một trong 3 thẻ.
  const choice = ROOMS.choice = { open: false, cards: [], el: null };
  function buildOverlay() {
    if (choice.el) return choice.el;
    const st = document.createElement('style');
    st.textContent = `
#sk-buffs{background:rgba(4,12,18,.72);z-index:5}
#sk-buffs .skb-row{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;max-width:760px}
#sk-buffs .skb-card{font:inherit;color:var(--ink);cursor:pointer;width:clamp(150px,26vw,220px);padding:12px 10px 14px;
  display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--wood);border:3px solid #2a1b10;
  box-shadow:inset 0 -4px 0 var(--wood2),inset 0 2px 0 #9a7048,0 4px 0 #000;touch-action:manipulation;text-align:center}
#sk-buffs .skb-card:hover,#sk-buffs .skb-card:focus-visible{filter:brightness(1.15);outline:2px solid var(--gold);outline-offset:2px}
#sk-buffs .skb-card:active{transform:translateY(2px)}
#sk-buffs canvas{width:64px;height:64px;image-rendering:pixelated;background:#130c07;border:2px solid #2a1b10}
#sk-buffs .skb-name{font-size:24px;color:var(--gold);line-height:1;text-shadow:0 2px 0 #000}
#sk-buffs .skb-desc{font-size:20px;line-height:1.05;text-shadow:0 1px 0 #000}
#sk-buffs .skb-key{font-size:16px;opacity:.75}
@media (max-width:560px){#sk-buffs .skb-card{width:min(92vw,360px);flex-direction:row;text-align:left;padding:8px}
  #sk-buffs canvas{width:48px;height:48px;flex:none}#sk-buffs .skb-key{display:none}}`;
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'sk-buffs'; el.className = 'sk-ov'; el.hidden = true;
    el.innerHTML = '<h2>Chọn một buff</h2><div class="skb-row"></div><p class="keys"></p>';
    document.body.appendChild(el);
    choice.el = el;
    return el;
  }
  function iconCanvas(name, px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    SK.draw(x, name, px / 2, px / 2);
    return cv;
  }
  // ids: bộ thẻ định sẵn (kiểm thử); không có thì bốc 3 buff chưa có.
  function openChoice(ids) {
    const p = G.player;
    const pool = ids ? ids.map(id => BUFF[id]).filter(Boolean) : BUFFS.filter(b => !has(p, b.id));
    if (!pool.length) return false;
    choice.cards = ids ? pool.slice(0, 3) : SK.shuffle(pool.slice()).slice(0, 3);
    const el = buildOverlay(), row = el.querySelector('.skb-row');
    row.innerHTML = '';
    choice.cards.forEach((b, i) => {
      const bt = document.createElement('button');
      bt.className = 'skb-card'; bt.dataset.buff = b.id;
      const t = document.createElement('div'); t.style.display = 'flex'; t.style.flexDirection = 'column'; t.style.gap = '4px';
      t.innerHTML = '<span class="skb-name"></span><span class="skb-desc"></span><span class="skb-key"></span>';
      t.children[0].textContent = b.name; t.children[1].textContent = b.desc; t.children[2].textContent = '[' + (i + 1) + ']';
      bt.appendChild(iconCanvas(b.icon, 32)); bt.appendChild(t);
      bt.addEventListener('click', () => pickChoice(i));
      row.appendChild(bt);
    });
    el.querySelector('.keys').textContent = 'Bấm 1 · 2 · 3 hoặc chạm vào thẻ';
    el.hidden = false; choice.open = true;
    SK.emit('buffChoice', G, choice.cards.map(b => b.id));
    return true;
  }
  function closeChoice() { choice.open = false; G.hold = false; if (choice.el) choice.el.hidden = true; }
  function pickChoice(i) {
    if (!choice.open || !choice.cards[i]) return;
    const b = choice.cards[i];
    closeChoice();
    takeBuff(G.player, b.id);
    G.toast('Buff: ' + b.name, 2);
  }
  ROOMS.pick = pickChoice;
  ROOMS.openChoice = openChoice;
  addEventListener('keydown', e => {
    if (!choice.open) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
    if (m) { pickChoice(+m[1] - 1); e.preventDefault(); }
  });

  SK.on('runStart', G2 => { closeChoice(); G2.player.buffs = []; });
  SK.on('runEnd', () => closeChoice());
  SK.on('stageEnter', (G2, stage) => {
    const p = G2.player;
    p.buffs = p.buffs || [];
    p.statueCd = 0; // [WIKI] qua cổng thì tượng hồi chiêu xong ngay
    G.props.push(controller(), overPlayer());
  });
  SK.on('portalEnter', (G2, stage) => {
    const p = G2.player;
    if (BUFF_AFTER.indexOf(stage.label) < 0 || !p.buffs || p.buffs.length >= BUFF_SLOTS) return;
    if (openChoice()) G2.hold = true;
  });

  // ---------------------------------------------------------------- HUD: buff đang có + bảng giá
  SK.on('hud', (ctx, G2) => {
    const p = G2.player; if (!p) return;
    const list = (p.buffs || []).map(id => BUFF[id]).filter(Boolean);
    let x = 98;
    for (const b of list) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 0.5, 3.5, 15, 15);
      SK.draw(ctx, b.icon, x + 7, 11, { sx: 14 / 32, sy: 14 / 32 });
      x += 16;
    }
    const cam = G2.view || G2.cam;
    for (const pr of G2.props) {
      if (!pr.shopItem || pr.sold) continue;
      // Món đang đứng trước đã có nhãn "[E] Mua ... (N vàng)" ngay chỗ này.
      const it = G2.interactTarget;
      if (it && Math.abs(it.x - pr.x) < 1 && /^Mua/.test(it.label)) continue;
      const sx = pr.x - cam.x, sy = pr.y - 26 - cam.y;
      if (sx < -20 || sx > SK.view.w + 20 || sy < -20 || sy > SK.view.h + 20) continue;
      const s = String(pr.price());
      ctx.font = '9px ' + SK.FONT;
      const w = ctx.measureText(s).width + 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(sx - w / 2) - 1, sy - 5, w + 2, 10);
      if (!SK.drawPrefab(ctx, SK.art.object('coin'), sx - w / 2 + 3, sy + 3, { t: G2.t, state: 'coin_gold', scale: 0.8 })) {
        ctx.fillStyle = '#f5c542'; ctx.fillRect(sx - w / 2 + 1, sy - 2, 4, 5);
      }
      SK.text(ctx, s, sx - w / 2 + 7, sy + 0.5, 9, G2.player.gold >= pr.price() ? '#ffffff' : '#ff7a6a', 'left', null);
    }
  });
})();
