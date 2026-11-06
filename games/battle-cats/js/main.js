// Battle Cats web — full game shell: menu, chapters, equip, battle, upgrade, gacha.
(function () {
  'use strict';

  var cats, enemies, stagesDoc, rosterDoc;
  var save = BCSave.load();
  var assets = { models: {} };
  var sim, renderer, running = false, paused = false, speed = 2;
  var cur = { stage: null, flat: [] };   // current battle stage + flat stage list

  var cv = document.getElementById('cv');
  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(3, '0'); }

  // ---------- asset loading ----------
  function loadJSON(src) { return fetch(src).then(function (r) { return r.json(); }); }
  function loadImg(src) {
    return new Promise(function (res) {
      var i = new Image(); i.onload = function () { res(i); };
      i.onerror = function () { res(null); }; i.src = src;
    });
  }
  function loadModel(key) {
    if (assets.models[key]) return Promise.resolve(assets.models[key]);
    return loadJSON('assets/units/' + key + '.json').then(function (m) {
      return loadImg('assets/units/' + m.png).then(function (img) {
        return (assets.models[key] = { model: m, sheet: img });
      });
    }).catch(function () { return (assets.models[key] = { model: null }); });
  }
  function loadModels(keys) { return Promise.all(keys.map(loadModel)); }

  // ---------- progression helpers ----------
  function catLevelMult(lvl) { return 1 + 0.15 * (Math.max(1, lvl) - 1); }
  function catUpgradeCost(lvl) { return 400 * lvl; }
  function baseUpgradeCost(lvl) { return 1000 * lvl; }
  function baseStartMoney() { return 500 + (save.baseLvl - 1) * 150; }
  function baseWorkerLvl() { return Math.floor((save.baseLvl - 1) / 4); }
  function baseCatHp() { return 15000 + (save.baseLvl - 1) * 3000; }

  function scaledCatStat(uid) {
    var f = cats[uid].forms[0];
    var m = catLevelMult(save.levels[uid] || 1);
    var s = {};
    for (var k in f) s[k] = f[k];
    s.hp = Math.round(f.hp * m);
    s.atk = Math.round(f.atk * m);
    return s;
  }

  function flatStages() {
    var out = [];
    stagesDoc.chapters.forEach(function (ch, ci) {
      ch.stages.forEach(function (st) { out.push({ st: st, ci: ci }); });
    });
    return out;
  }
  function stageUnlocked(i) {
    if (i <= 0) return true;
    return !!save.cleared[cur.flat[i - 1].st.id];
  }

  // ---------- screen manager ----------
  var SCREENS = ['menu', 'map', 'equip', 'battle', 'upgrade', 'gacha'];
  function show(name) {
    SCREENS.forEach(function (s) {
      var el = $('scr-' + s); if (el) el.style.display = s === name ? 'flex' : 'none';
    });
    running = (name === 'battle');
    if (name === 'menu') renderMenu();
    if (name === 'map') renderMap();
    if (name === 'equip') renderEquip();
    if (name === 'upgrade') renderUpgrade();
    if (name === 'gacha') renderGacha();
  }

  // ---------- cat icon (auto-fit to the sprite's real bounding box) ----------
  function drawIcon(canvas, key) {
    var md = assets.models[key], ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!md || !md.model) { ctx.fillStyle = '#39405a'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    var st = BCSprite.animState(md.model, md.model.anims['00'] || null, 0);
    var b = md.model._bIcon || (md.model._bIcon = BCSprite.bounds(md.model, st));
    if (!b || b.w <= 0 || b.h <= 0) return;
    var pad = 0.86;
    var sc = Math.min(canvas.width * pad / b.w, canvas.height * pad / b.h);
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    BCSprite.draw(ctx, md.model, md.sheet, st, { scale: 1, flip: true });
    ctx.restore();
  }

  // ---------- MENU ----------
  function renderMenu() {
    $('m-food').textContent = save.catFood;
    $('m-xp').textContent = save.xp;
    $('m-owned').textContent = save.owned.length;
    var done = Object.keys(save.cleared).length, total = cur.flat.length;
    $('m-prog').textContent = done + '/' + total;
  }

  // ---------- MAP (world map: themed strips with a winding node path) ----------
  var MAP_THEMES = [
    { sky: ['#8fd0ff', '#d4efff'], ground: '#8ec36a', band: '#6aa847', banner: '#2f6d2a' },
    { sky: ['#ffc98f', '#ffe6c2'], ground: '#c79a5c', band: '#a87c42', banner: '#8a4a1e' },
    { sky: ['#3a3e6e', '#6b6fa8'], ground: '#4a4668', band: '#36324f', banner: '#241f3e' },
  ];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function globalNextIndex() {
    for (var i = 0; i < cur.flat.length; i++) {
      if (stageUnlocked(i) && !save.cleared[cur.flat[i].st.id]) return i;
    }
    return -1;
  }

  function renderMap() {
    var wrap = $('map-list'); wrap.innerHTML = '';
    var nextIdx = globalNextIndex();
    var idx = 0;
    stagesDoc.chapters.forEach(function (ch, ci) {
      var th = MAP_THEMES[ci % MAP_THEMES.length];
      var sec = document.createElement('section'); sec.className = 'chapter';

      var stars = 0; ch.stages.forEach(function (s) { if (save.cleared[s.id]) stars++; });
      var banner = document.createElement('div'); banner.className = 'ch-banner';
      banner.style.background = 'linear-gradient(' + th.banner + 'e6, ' + th.banner + '88)';
      banner.innerHTML = '<span>' + ch.name + '</span><span class="stars">★ ' + stars + '/' + ch.stages.length + '</span>';
      sec.appendChild(banner);

      var track = document.createElement('div'); track.className = 'ch-track';
      track.style.background = 'linear-gradient(' + th.sky[0] + ',' + th.sky[1] + ')';
      var inner = document.createElement('div'); inner.className = 'ch-inner';
      var spacing = 132, x0 = 72, n = ch.stages.length;
      inner.style.width = (x0 + n * spacing + 20) + 'px';

      // ground strip
      var ground = document.createElement('div');
      ground.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:46%;background:' +
        th.ground + ';border-top:4px solid ' + th.band + ';';
      inner.appendChild(ground);

      // path connecting the node centers
      var pts = [];
      for (var k = 0; k < n; k++) pts.push([x0 + k * spacing, k % 2 ? 128 : 74]);
      var svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'path');
      var pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('points', pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
      pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', 'rgba(255,255,255,.75)');
      pl.setAttribute('stroke-width', '4'); pl.setAttribute('stroke-dasharray', '2 9');
      pl.setAttribute('stroke-linecap', 'round');
      svg.appendChild(pl); inner.appendChild(svg);

      ch.stages.forEach(function (st, si) {
        var i = idx++;
        var unlocked = stageUnlocked(i), cleared = !!save.cleared[st.id];
        var b = document.createElement('button'); b.className = 'node';
        if (st.boss) b.classList.add('boss');
        if (cleared) b.classList.add('cleared');
        if (!unlocked) b.classList.add('locked');
        if (i === nextIdx) b.classList.add('next');
        b.style.left = pts[si][0] + 'px'; b.style.top = pts[si][1] + 'px';
        var label = st.boss ? '☠' : (si + 1);
        b.innerHTML = (cleared ? '<span class="n-star">★</span>' : '') +
          '<span class="n-no">' + (unlocked ? label : '🔒') + '</span>' +
          '<span class="n-nm">' + st.name.replace(ch.name + ' ', '') + '</span>';
        if (!unlocked) b.disabled = true;
        b.onclick = function () { cur.stage = st; show('equip'); };
        inner.appendChild(b);
      });

      track.appendChild(inner); sec.appendChild(track); wrap.appendChild(sec);
      // auto-scroll a chapter that holds the next stage so the pin is visible
      if (nextIdx >= 0 && cur.flat[nextIdx] && cur.flat[nextIdx].ci === ci) {
        var localNext = nextIdx; for (var q = 0; q < ci; q++) localNext -= stagesDoc.chapters[q].stages.length;
        track.scrollLeft = Math.max(0, pts[localNext][0] - 160);
      }
    });
  }

  // ---------- EQUIP ----------
  var selLineup = [];
  function renderEquip() {
    selLineup = save.lineup.filter(function (u) { return save.owned.indexOf(u) >= 0; }).slice(0, 10);
    $('eq-stage').textContent = cur.stage ? cur.stage.name : '';
    loadModels(save.owned.map(function (u) { return pad(u) + '_f'; })).then(function () {
      var wrap = $('eq-cats'); wrap.innerHTML = '';
      save.owned.slice().sort(function (a, b) { return cats[a].forms[0].cost - cats[b].forms[0].cost; })
        .forEach(function (uid) {
          var c = cats[uid], key = pad(uid) + '_f';
          var card = document.createElement('button'); card.className = 'eqcard';
          var ic = document.createElement('canvas'); ic.width = 78; ic.height = 66; drawIcon(ic, key);
          var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.name;
          var meta = document.createElement('div'); meta.className = 'meta';
          meta.textContent = 'Lv' + (save.levels[uid] || 1) + ' · ' + c.forms[0].cost + '¢';
          var slot = document.createElement('div'); slot.className = 'slotno';
          card.appendChild(ic); card.appendChild(nm); card.appendChild(meta); card.appendChild(slot);
          card.onclick = function () { toggleLineup(uid); };
          card.dataset.uid = uid;
          wrap.appendChild(card);
        });
      refreshEquipState();
    });
  }
  function toggleLineup(uid) {
    var i = selLineup.indexOf(uid);
    if (i >= 0) selLineup.splice(i, 1);
    else if (selLineup.length < 10) selLineup.push(uid);
    refreshEquipState();
  }
  function refreshEquipState() {
    var wrap = $('eq-cats');
    [].forEach.call(wrap.children, function (card) {
      var uid = +card.dataset.uid, pos = selLineup.indexOf(uid);
      card.classList.toggle('on', pos >= 0);
      card.querySelector('.slotno').textContent = pos >= 0 ? (pos + 1) : '';
    });
    $('eq-count').textContent = selLineup.length + '/10';
    $('eq-start').disabled = selLineup.length === 0;
  }

  // ---------- BATTLE ----------
  function fit() {
    var dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  window.addEventListener('resize', function () { if (running) fit(); });

  function startBattle() {
    save.lineup = selLineup.slice(); BCSave.save(save);
    var st = cur.stage;
    var catKeys = selLineup.map(function (u) { return pad(u) + '_f'; });
    var enKeys = st.spawns.map(function (s) { return pad(s.id) + '_e'; });
    $('bt-load').style.display = 'flex';
    show('battle');
    loadModels(catKeys.concat(enKeys)).then(function () {
      var catIndex = {};
      selLineup.forEach(function (uid, slot) {
        catIndex[slot] = { uid: uid, form: 'f', name: cats[uid].name, stat: scaledCatStat(uid) };
      });
      var enemyIndex = {};
      st.spawns.forEach(function (s) { enemyIndex[s.id] = enemies[s.id].stats; });
      var stageCfg = { length: st.length, baseHp: st.baseHp, maxOnScreen: st.maxOnScreen, spawns: st.spawns };
      sim = new BCSim.Sim(stageCfg, catIndex, enemyIndex, {
        startMoney: baseStartMoney(), startWorkerLvl: baseWorkerLvl(), catBaseHp: baseCatHp(),
      });
      renderer = new BCRender.Renderer(cv, assets);
      window.__sim = sim;   // debug/test hook
      fit(); buildHud();
      $('stage-name').textContent = st.name;
      $('pause').textContent = '⏸'; paused = false;
      $('bt-load').style.display = 'none';
      $('bt-overlay').style.display = 'none'; running = true;
      if (!save.tutDone) showBattleHint();
    });
  }

  var catBtns = [];
  var CANNON_CD = BCSim.FPS * 8;
  function buildHud() {
    var wrap = $('cats'); wrap.innerHTML = ''; catBtns = [];
    for (var slot = 0; slot < 10; slot++) {
      var b = document.createElement('button'); b.className = 'catbtn';
      if (slot >= selLineup.length) { b.classList.add('empty'); b.disabled = true; wrap.appendChild(b); continue; }
      var uid = selLineup[slot], c = cats[uid], key = pad(uid) + '_f';
      var icon = document.createElement('canvas'); icon.width = 80; icon.height = 60; drawIcon(icon, key);
      var cost = document.createElement('div'); cost.className = 'cost'; cost.textContent = c.forms[0].cost + '¢';
      var cd = document.createElement('div'); cd.className = 'cd';
      b.appendChild(icon); b.appendChild(cost); b.appendChild(cd);
      (function (s) { b.onclick = function () { sim && sim.deploy(s); }; })(slot);
      wrap.appendChild(b);
      catBtns.push({ el: b, cd: cd, slot: slot, cost: c.forms[0].cost, maxcd: Math.max(1, c.forms[0].recharge * 2) });
    }
  }
  function updateHud() {
    $('money').textContent = Math.floor(sim.money) + '/' + BCSim.walletCap(sim.workerLvl) + '¢';
    var w = $('worker'), atMax = sim.workerLvl >= 8;
    w.disabled = atMax || sim.money < BCSim.regenCost(sim.workerLvl);
    w.innerHTML = '<b>Lv ' + (sim.workerLvl + 1) + '</b><span>' + (atMax ? 'MAX' : BCSim.regenCost(sim.workerLvl) + '¢') + '</span>';
    var cn = $('cannon'), ccd = sim.cannonCd || 0;
    cn.disabled = ccd > 0;
    cn.innerHTML = '<b>⚡</b><span>' + (ccd > 0 ? Math.ceil(ccd / BCSim.FPS) + 's' : 'Cannon') + '</span>';
    catBtns.forEach(function (cb) {
      var cool = sim.cooldowns[cb.slot] || 0;
      cb.el.disabled = cool > 0 || sim.money < cb.cost;
      cb.cd.style.height = cool > 0 ? (100 * Math.min(1, cool / cb.maxcd)) + '%' : '0';
    });
  }

  function finishBattle(win) {
    running = false;
    var st = cur.stage, ov = $('bt-overlay');
    var lines = [];
    if (win) {
      var first = !save.cleared[st.id];
      if (first) {
        save.cleared[st.id] = true;
        save.catFood += st.reward; save.xp += st.xp;
        lines.push('Lần đầu phá đảo!');
        lines.push('+' + st.reward + ' Cat Food · +' + st.xp + ' XP');
      } else {
        save.catFood += 5; save.xp += Math.round(st.xp / 4);
        lines.push('+5 Cat Food · +' + Math.round(st.xp / 4) + ' XP');
      }
      BCSave.save(save);
    } else {
      lines.push('Thử lại nhé!');
    }
    $('bt-result').textContent = win ? 'THẮNG!' : 'THUA';
    $('bt-reward').innerHTML = lines.join('<br>');
    $('bt-next').style.display = win ? 'inline-block' : 'none';
    ov.style.display = 'flex';
  }

  // ---------- loop ----------
  var acc = 0, last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!running || !sim) { last = t; return; }
    if (paused) { last = t; return; }
    if (!last) last = t;
    var dt = Math.min(100, t - last); last = t; acc += dt;
    var stepMs = 1000 / BCSim.FPS, steps = 0;
    while (acc >= stepMs && steps < speed * 3) { for (var k = 0; k < speed; k++) sim.tick(); acc -= stepMs; steps++; }
    renderer.draw(sim); updateHud();
    if (sim.over) finishBattle(sim.over === 1);
  }
  requestAnimationFrame(frame);

  // ---------- UPGRADE ----------
  function renderUpgrade() {
    $('up-xp').textContent = save.xp;
    $('up-base').textContent = 'Cat Base Lv' + save.baseLvl;
    var bcost = baseUpgradeCost(save.baseLvl);
    var bb = $('up-base-btn');
    bb.textContent = 'Nâng · ' + bcost + ' XP';
    bb.disabled = save.xp < bcost || save.baseLvl >= 20;
    if (save.baseLvl >= 20) bb.textContent = 'MAX';
    bb.onclick = function () {
      var c = baseUpgradeCost(save.baseLvl);
      if (save.xp >= c && save.baseLvl < 20) { save.xp -= c; save.baseLvl++; BCSave.save(save); renderUpgrade(); }
    };
    loadModels(save.owned.map(function (u) { return pad(u) + '_f'; })).then(function () {
      var wrap = $('up-cats'); wrap.innerHTML = '';
      save.owned.slice().sort(function (a, b) { return a - b; }).forEach(function (uid) {
        var c = cats[uid], lvl = save.levels[uid] || 1, cost = catUpgradeCost(lvl);
        var row = document.createElement('div'); row.className = 'uprow';
        var ic = document.createElement('canvas'); ic.width = 62; ic.height = 54; drawIcon(ic, pad(uid) + '_f', 0.09);
        var info = document.createElement('div'); info.className = 'info';
        info.innerHTML = '<div class="nm">' + c.name + '</div><div class="lv">Lv ' + lvl +
          ' · HP ' + Math.round(c.forms[0].hp * catLevelMult(lvl)) +
          ' · ATK ' + Math.round(c.forms[0].atk * catLevelMult(lvl)) + '</div>';
        var btn = document.createElement('button'); btn.className = 'upbtn';
        if (lvl >= 30) { btn.textContent = 'MAX'; btn.disabled = true; }
        else { btn.textContent = '+Lv · ' + cost + ' XP'; btn.disabled = save.xp < cost; }
        btn.onclick = function () {
          var cc = catUpgradeCost(save.levels[uid] || 1);
          if ((save.levels[uid] || 1) < 30 && save.xp >= cc) {
            save.xp -= cc; save.levels[uid] = (save.levels[uid] || 1) + 1; BCSave.save(save); renderUpgrade();
          }
        };
        row.appendChild(ic); row.appendChild(info); row.appendChild(btn);
        wrap.appendChild(row);
      });
    });
  }

  // ---------- GACHA ----------
  var GACHA_COST = 150;
  function renderGacha() {
    $('g-food').textContent = save.catFood;
    var btn = $('g-roll'); btn.disabled = save.catFood < GACHA_COST;
    btn.textContent = 'Quay 1 lần (' + GACHA_COST + ' Cat Food)';
    $('g-result').innerHTML = '';
  }
  function rollGacha() {
    if (save.catFood < GACHA_COST) return;
    save.catFood -= GACHA_COST;
    var pool = rosterDoc.roster;
    var uid = pool[Math.floor(Math.random() * pool.length)];
    var isNew = save.owned.indexOf(uid) < 0;
    if (isNew) { save.owned.push(uid); save.levels[uid] = 1; }
    else { save.xp += 1000; }
    BCSave.save(save);
    loadModel(pad(uid) + '_f').then(function () {
      var box = $('g-result');
      box.innerHTML = '';
      var ic = document.createElement('canvas'); ic.width = 150; ic.height = 130; ic.className = 'g-cap';
      drawIcon(ic, pad(uid) + '_f', 0.21);
      var nm = document.createElement('div'); nm.className = 'g-nm'; nm.textContent = cats[uid].name;
      var tag = document.createElement('div'); tag.className = 'g-tag';
      tag.textContent = isNew ? '✦ MÈO MỚI!' : 'Trùng → +1000 XP';
      box.appendChild(ic); box.appendChild(nm); box.appendChild(tag);
      renderGacha();
    });
  }

  // ---------- FTUE (first-time user experience) ----------
  function showFtue() {
    $('ftue-text').innerHTML = 'Chào mừng tới <b>The Battle Cats</b>!<br><br>' +
      'Thả <b>mèo</b> từ hàng nút phía dưới để tiến ra trận. Diệt quái để nhặt <b>tiền ¢</b>, ' +
      'nâng <b>Worker</b> cho tiền về nhanh hơn, và bắn <b>Cat Cannon</b> khi bị dồn.<br><br>' +
      'Phá <b>Căn cứ địch</b> ở cuối màn là THẮNG!';
    $('ftue').style.display = 'flex';
  }
  function showBattleHint() {
    save.tutDone = true; BCSave.save(save);
    var tips = ['👇 Chạm một nút mèo để thả quân ra trận',
                '💰 Nâng Worker (vòng trái) để kiếm tiền nhanh hơn',
                '⚡ Bị dồn thì bắn Cat Cannon (vòng phải)'];
    var el = document.createElement('div'); el.id = 'bt-hint';
    el.style.cssText = 'position:absolute;left:50%;top:13%;transform:translateX(-50%);z-index:7;max-width:82%;' +
      'background:rgba(255,244,218,.96);border:3px solid #3a2a12;border-radius:14px;padding:10px 16px;' +
      'font-weight:800;color:#3a2a12;text-align:center;box-shadow:0 4px 0 rgba(58,42,18,.4);';
    el.textContent = tips[0]; $('field').appendChild(el);
    var i = 0, iv = setInterval(function () {
      i++;
      if (i >= tips.length) { clearInterval(iv); el.style.transition = 'opacity .5s'; el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 600); return; }
      el.textContent = tips[i];
    }, 2600);
  }

  // ---------- wiring ----------
  function wire() {
    $('go-play').onclick = function () { show('map'); };
    $('go-upgrade').onclick = function () { show('upgrade'); };
    $('go-gacha').onclick = function () { show('gacha'); };
    $('map-back').onclick = function () { show('menu'); };
    $('eq-back').onclick = function () { show('map'); };
    $('eq-start').onclick = startBattle;
    $('up-back').onclick = function () { show('menu'); };
    $('g-back').onclick = function () { show('menu'); };
    $('g-roll').onclick = rollGacha;
    $('bt-quit').onclick = function () { running = false; paused = false; show('map'); };
    $('pause').onclick = function () { if (!running) return; paused = !paused; $('pause').textContent = paused ? '▶' : '⏸'; };
    $('bt-retry').onclick = function () { startBattle(); };
    $('bt-next').onclick = function () { show('map'); };
    $('worker').onclick = function () { sim && sim.upgradeWorker(); };
    $('cannon').onclick = function () { sim && sim.fireCannon(); };
    var sp = $('speed');
    sp.onclick = function () { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; sp.textContent = speed + '×'; };
    $('ftue-ok').onclick = function () {
      $('ftue').style.display = 'none';
      if (!save.seenIntro) { save.seenIntro = true; BCSave.save(save); }
    };
  }

  // ---------- boot ----------
  Promise.all([loadJSON('data/cats.json'), loadJSON('data/enemies.json'),
    loadJSON('data/stages.json'), loadJSON('data/roster.json'),
    loadImg('assets/bg/catbase.png')])
    .then(function (r) {
      cats = r[0]; enemies = r[1]; stagesDoc = r[2]; rosterDoc = r[3];
      assets.catbase = r[4];
      cur.flat = flatStages();
      if (!save.owned.length) {
        save.owned = rosterDoc.startOwned.slice();
        save.owned.forEach(function (u) { save.levels[u] = 1; });
        save.lineup = rosterDoc.startOwned.slice();
        BCSave.save(save);
      }
      wire();
      $('loading').style.display = 'none';
      show('menu');
      if (!save.seenIntro) showFtue();
    });
})();
