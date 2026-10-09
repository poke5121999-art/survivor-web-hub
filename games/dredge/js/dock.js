/*
 * Màn hình bến, dựng theo DockUI.cs + BaseDestinationUI.cs + UIController.ShowDestination/HideCurrentDestination của bản gốc
 * và bố cục DockUI trong Game.unity (đơn vị canvas 1920×1080):
 *   - Cập bến → chạy node Yarn gốc của bến (DockData.yarnRootNode, vd GreaterMarrow_Root; DockUI.dialogueHijacks khi về cuối game).
 *     Hội thoại xong mới hiện giao diện bến.
 *   - Tên bến: DockNameContainer neo trên giữa, cách mép 150, 500×65, nền TitleBackground, chữ 45.
 *   - Nợ tàu: DockProgress giữa màn lệch lên 270, 580×110, nền DialogBox; chỉ hiện khi "gm-debt-introduced" và còn nợ (DockProgressUI.cs).
 *   - Điểm đến: DestinationButton (350×85, nút 300×50 + mũi DestinationPointer) bám vị trí 3D của điểm đến (WorldToScreenPoint mỗi khung);
 *     chỉ hiện khi alwaysShow hoặc id nằm trong DR.s.availableDestinations (DockUI.ShowUIWithDelay).
 *   - Nhân vật: SpeakerButton 350×100 xếp từ góc dưới trái (y = 100·i + 10·(i+1), cách đáy 25), trượt vào sau 0,7 + 0,2·i giây;
 *     bước nhiệm vụ showAtDock của bến này đứng trước, rồi DockData.speakers có alwaysAvailable hoặc trong availableSpeakers.
 *   - Hành động thuyền (BoatActionsDestinationUI): Rời bến luôn có; Nghỉ nếu "destination.rest" mở; Nghiên cứu nếu "destination.research" mở.
 *   - Vào điểm đến: ghi lượt ghé (RecordShopVisit), bật vCam của điểm đến, chạy node nhân vật (bước nhiệm vụ showAtSpeaker >
 *     speakerRootNodeOverride > SpeakerData.yarnRootNode) rồi mới mở giao diện điểm đến; RequestExitDestination thì quay ra luôn.
 *     Rời điểm đến → chạy lại node gốc của bến (HideCurrentDestination → dockUI.Show).
 * Giao diện từng điểm đến: MarketDestination / ShipyardDestination (js/shop.js: lưới hàng + khoang, mua bán sửa), StorageDestination (DRCargo), RestDestination
 * (ngủ tới 06:00 rồi tự ra); CharacterDestination chỉ có hội thoại. Upgrade/Research/OverflowStorage/Constructable chưa có hệ thống.
 *   DRDock.show(info)  DRDock.hide()  DRDock.isOpen()  DRDock.visit(destId)  DRDock.talk(speaker)  DRDock.leave()  DRDock._debug()
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  for (const f of ['ui.css', 'story.css']) {
    if (!document.querySelector('link[href*="' + f + '"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = new URL('../css/' + f + ver, (me && me.src) || location.href).href;
      document.head.appendChild(l);
    }
  }
  const Y = root.DR_YARN || {};
  // Tên điểm đến: chuỗi gốc DR_STR[id]; vài điểm đến quen dùng tên tiếng Việt cho người chơi
  const TITLE_VI = {
    'destination.gm-fishmonger': 'Người buôn cá', 'destination.gm-shipwright': 'Thợ đóng tàu', 'destination.storage': 'Kho của tôi',
    'destination.gm-shipwright-upgrades': 'Ụ tàu', 'destination.overflow-storage': 'Kho tràn', 'destination.rest': 'Nghỉ ngơi',
    'destination.research': 'Nghiên cứu', 'destination.undock': 'Rời bến', 'destination.lm-trader': 'Lái buôn'
  };
  // DockUI.dialogueHijacks (Game.unity: DockUI)
  const HIJACKS = [{ visited: ['Collector_PickupAccept'], node: 'Dock_BadEndingInProgress' }, { visited: ['LighthouseKeeper_FinaleAccepted'], node: 'Dock_GoodEndingInProgress' }];
  const SPEAKER_DELAY = 0.7, SPEAKER_STEP = 0.2;   // DockUI: baseSpeakerButtonAppearDelaySec, perSpeakerButtonAppearDelaySec
  const maskUrl = n => 'url(' + new URL('art/ui/sprites/' + n + '.webp', document.baseURI).href + ')';
  const money = v => '$' + Number(v).toFixed(2);
  const STR = k => (root.DR_STR && DR_STR[k]) || null;

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* audio optional */ } };
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const visited = n => root.DRYarn.visited(n);
  const avail = () => root.DRYarn.ensure();

  function dockName(dockId) {
    const d = DR_WORLD.DockData[dockId] || {};
    return STR(d.dockNameKey) || STR(dockId) || d.dockNameKey || dockId;
  }
  const destTitle = d => TITLE_VI[d.id] || STR(d.id) || d.id;

  // HighlightCondition.ShouldHighlight
  function highlight(list) {
    if (!list || !list.length) return false;
    return list.some(h => {
      if (h.alwaysHighlight || h.always) return true;
      const steps = h.ifTheseStepsActive || h.stepsActive || [];
      if (steps.length && steps.some(s => s && root.DRQuests.isStepActive(s))) return true;
      const unv = h.highlightIfNodesUnvisited || h.unvisited || [];
      const vis = h.andTheseNodesVisited || h.visited || [];
      const notDone = h.andTheseStepsNotCompleted || h.stepsNotDone || [];
      const f2 = unv.length > 0 && unv.some(n => !visited(n));
      const f3 = vis.every(n => visited(n));
      const f4 = notDone.every(s => !s || !root.DRQuests.isStepCompleted(s));
      return f2 && f3 && f4;
    });
  }

  // ---------------------------------------------------------------- DOM
  let ui = null, win = null, D = null;
  function ensureDom() {
    if (ui) return;
    ui = el('div', 'dr-ui', document.body); ui.id = 'dr-dockui';
    win = el('div', 'dr-screen dr-ui', document.body); win.id = 'dr-dock';
  }
  // canvas 1920×1080, CanvasScaler khớp chiều cao; màn thấp nới lên để nút còn bấm được [ĐỀ XUẤT]
  function scale() {
    const s = root.innerHeight / 1080;
    return s < 0.6 ? Math.min(0.6, root.innerWidth / 1400) : s;
  }

  function show(info) {
    ensureDom();
    D = { dockId: info.dockId, data: (Y.docks || {})[info.dockId] || { dests: [] }, phase: 'enter', dest: null, tab: null, raf: 0 };
    DR.save();
    if (root.DRIntro && DRIntro.playing) { D.phase = 'intro'; return; }   // màn mở đầu đang chạy: DRIntro gọi DRDock.resume()
    enterDock(0.2);
  }
  function resume() { if (D && D.phase === 'intro') enterDock(0); }

  // DockUI.Show: chạy node gốc của bến (hoặc node chiếm quyền cuối game) rồi mới dựng nút
  function enterDock(delay) {
    if (!D) return;
    hideUi(); closeWin();
    cam(D.data.vcam);
    musicFor(D.dockId);
    let node = (DR_WORLD.DockData[D.dockId] || {}).yarnRootNode;
    if (DR.s.vars['can-show-finale-hijack']) {
      const h = HIJACKS.find(x => x.visited.every(visited));
      if (h) node = h.node;
    }
    D.phase = 'dialogue';
    const go = () => {
      if (!D) return;
      if (node && root.DRDialogue && root.DRYarn.hasNode(node)) DRDialogue.start(node, { onEnd: () => showUi() });
      else showUi();
    };
    if (delay) setTimeout(go, delay * 1000); else go();
  }

  function hide() {
    if (!D) return;
    cancelAnimationFrame(D.raf);
    D = null;
    hideUi(); closeWin();
    if (root.DRCargo && DRCargo.isOpen()) DRCargo.close();
  }

  function musicFor(dockId) {
    const tail = String(dockId).replace(/^dock\./, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = Object.keys(root.DR_AUDIO || {}).find(k => k.startsWith('music.dock.') && k.slice(11).toLowerCase() === tail)
      || (root.DRDocks && DRDocks.byId[dockId] && DRDocks.byId[dockId].music);
    if (key && root.DRAudio) { try { DRAudio.music(key); } catch (e) { /* audio optional */ } }
  }

  // vCam gốc (Dock.dockVCam / BaseDestination.vCam): vị trí + điểm LookAt, đổi sang three.js trong tools/yarn.py.
  // CinemachineComposer đặt điểm LookAt ở (ScreenX, ScreenY) trên màn (Y tính từ trên): quay hướng nhìn lệch đi tương ứng.
  function aim(p, look, sx, sy, fov) {
    const T = root.THREE;
    const pos = new T.Vector3(p[0], p[1], p[2]), tgt = new T.Vector3(look[0], look[1], look[2]);
    const fwd = tgt.clone().sub(pos), dist = fwd.length() || 1;
    fwd.normalize();
    if (sx == null || sy == null) return { pos, look: tgt };
    const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize(), up = new T.Vector3().crossVectors(right, fwd);
    const tv = Math.tan((fov || 40) * Math.PI / 360), asp = (root.DRCamera && DRCamera.cam && DRCamera.cam.aspect) || 16 / 9;
    fwd.applyAxisAngle(right, Math.atan(tv * (sy - 0.5) * 2));
    fwd.applyAxisAngle(up, Math.atan(tv * asp * (sx - 0.5) * 2));
    return { pos, look: pos.clone().addScaledVector(fwd, dist) };
  }
  function cam(vc, t) {
    if (!vc || !root.DRCamera || !root.THREE) return;
    const look = vc.look ? (vc.lookOff ? vc.look.map((v, i) => v + vc.lookOff[i]) : vc.look) : [vc.p[0] + vc.f[0] * 10, vc.p[1] + vc.f[1] * 10, vc.p[2] + vc.f[2] * 10];
    const a = aim(vc.p, look, vc.look ? vc.sx : null, vc.look ? vc.sy : null, vc.fov);
    DRCamera.dockView = { pos: a.pos, look: a.look, t: t == null ? 0 : t };
  }

  // ---------------------------------------------------------------- giao diện bến
  function hideUi() { if (ui) { ui.classList.remove('on'); ui.innerHTML = ''; } if (D) cancelAnimationFrame(D.raf); }

  function visibleDests() {
    const L = avail().availableDestinations;
    return (D.data.dests || []).filter(d => d.always || L.includes(d.id));
  }

  function showUi() {
    if (!D) return;
    D.phase = 'ui';
    ui.innerHTML = '';
    ui.classList.add('on');
    ui.style.setProperty('--s', scale().toFixed(4));
    // tên bến
    const banner = el('div', 'dk-banner', ui); el('span', '', banner, dockName(D.dockId));
    // nợ tàu
    const dd = DR_WORLD.DockData[D.dockId] || {};
    if (dd.dockProgressType === 'GM_REPAYMENTS') {
      const debt = DR.s.vars['gm-debt'] != null ? DR.s.vars['gm-debt'] : DR_CONFIG.greaterMarrowDebt;
      const paid = DR.s.vars['gm-repayments'] || 0, left = Math.max(0, Math.min(debt, debt - paid));
      if (DR.s.vars['gm-debt-introduced'] && paid < debt) {
        const box = el('div', 'dk-progress', ui);
        box.dataset.debtLeft = left;
        el('div', 't', box, STR(dd.progressTitleLocalizationKey) || 'Ship Loan Repayments:');
        const bar = el('div', 'bar', box); el('i', '', bar).style.width = (paid / debt * 100).toFixed(1) + '%';
        el('div', 'v', box, (STR(dd.progressValueLocalizationKey) || '{0} remaining').replace('{0}', money(left)));
      }
    }
    el('div', 'dk-money', ui, money(DR.s.funds));
    // điểm đến bám 3D
    D.btns = [];
    for (const d of visibleDests()) {
      const b = el('button', 'dk-dest', ui);
      b.dataset.dest = d.id;
      const inner = el('span', 'btn', b);
      if (d.icon) { const ic = el('i', 'ic', inner); ic.style.setProperty('--m', maskUrl(d.icon)); }
      el('span', 'tx', inner, destTitle(d));
      el('i', 'ptr', b);
      if (highlight(d.hl)) el('i', 'alert', b);
      b.onclick = () => { play('ui.button.select'); visit(d.id); };
      D.btns.push({ b, p: d.p });
    }
    // hành động thuyền
    const boat = D.data.boat || (root.DRDocks && DRDocks.byId[D.dockId] ? { p: [DR.s.boat.x, 1.6, DR.s.boat.z] } : null);
    if (boat) {
      const g = el('div', 'dk-boat', ui);
      const head = el('div', 'head', g, 'Rời bến');
      g.onmouseleave = () => g.classList.remove('hover');
      g.onmouseenter = () => g.classList.add('hover');
      const row = el('div', 'row', g);
      const sub = (id, icon, label, fn) => {
        const b = el('button', 'sub', row); b.dataset.act = id; b.title = label;
        el('i', '', b).style.setProperty('--m', maskUrl(icon));
        b.onmouseenter = () => { head.textContent = label; }; b.onfocus = b.onmouseenter;
        b.onclick = fn;
        return b;
      };
      sub('undock', 'UndockIcon', 'Rời bến', () => { play('ui.button.back'); leave(); });
      const L = avail().availableDestinations;
      if (L.includes('destination.rest')) sub('rest', 'SleepIcon', 'Ngủ', () => { play('ui.button.select'); visitSpecial({ id: 'destination.rest', cls: 'RestDestination' }); });
      if (L.includes('destination.research')) sub('research', 'CogIcon2', 'Nghiên cứu', () => { play('ui.button.select'); visitSpecial({ id: 'destination.research', cls: 'ResearchDestination' }); });
      D.btns.push({ b: g, p: boat.p, boat: true });
    }
    // nhân vật
    const col = el('div', 'dk-speakers', ui);
    const shown = [];
    let i = 0;
    const mk = (name, node, hl) => {
      const sd = DR_WORLD.SpeakerData[name];
      if (!sd) return;
      const b = el('button', 'dk-speaker', col);
      b.dataset.speaker = name;
      b.style.bottom = 'calc((' + (100 * i + 10 * (i + 1)) + 'px) * var(--s))';
      b.style.animationDelay = (SPEAKER_DELAY + i * SPEAKER_STEP) + 's';
      let small = sd.smallPortraitSprite;
      for (const po of sd.portraitOverrideConditions || []) if ((po.nodesVisited || []).every(visited)) { if (po.smallPortraitSprite) small = po.smallPortraitSprite; break; }
      const face = el('i', 'face', b); if (small) face.style.backgroundImage = 'url(' + small + ')';
      el('span', 'nm', b, root.DRDialogue ? DRDialogue.speakerName(name) : name);
      if (hl) el('i', 'alert', b);
      b.onclick = () => { play('ui.button.select'); talk(name, node); };
      shown.push(name); i++;
    };
    const STEPS = (root.DR_QUESTS || {}).QuestStepData || {};
    for (const sid of root.DRQuests.activeSteps()) {
      const s = STEPS[sid];
      if (s && s.showAtDock && s.stepDock === D.dockId && s.stepSpeaker && root.DRQuests.canBeShown(sid)) mk(s.stepSpeaker, s.yarnRootNode, true);
    }
    for (const name of dd.speakers || []) {
      const sd = DR_WORLD.SpeakerData[name];
      if (!sd || shown.includes(name)) continue;
      if (sd.alwaysAvailable || avail().availableSpeakers.includes(name)) mk(name, sd.yarnRootNode, highlight(sd.highlightConditions));
    }
    track();
  }

  // DestinationButton.LateUpdate: transform.position = WorldToScreenPoint(destination.position)
  function track() {
    if (!D) return;
    cancelAnimationFrame(D.raf);
    const T = root.THREE, cam3 = root.DRCamera && DRCamera.cam;
    const v = T ? new T.Vector3() : null;
    const step = () => {
      if (!D || D.phase !== 'ui') return;
      if (cam3 && v) {
        const w = root.innerWidth, h = root.innerHeight;
        for (const it of D.btns) {
          v.set(it.p[0], it.p[1], it.p[2]).project(cam3);
          const off = v.z > 1 || v.z < -1;
          it.b.style.display = off ? 'none' : '';
          it.b.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
          it.b.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
        }
      }
      D.raf = requestAnimationFrame(step);
    };
    step();
  }

  // DockUI.OnSpeakerButtonSubmitted: nói xong thì dựng lại nút (không chạy lại node gốc của bến)
  function talk(name, node) {
    if (!D) return;
    const sd = DR_WORLD.SpeakerData[name];
    node = node || (sd && sd.yarnRootNode);
    if (!node) return;
    hideUi();
    D.phase = 'dialogue';
    if (sd && sd.visitSFX) { /* visitSFX là AssetReference; chưa có trong DR_AUDIO */ }
    DRDialogue.start(node, { onEnd: () => { cam(D && D.data.vcam); showUi(); } });
  }

  function leave() {
    if (!D) return;
    DR.s.vars['can-show-finale-hijack'] = true;   // DockUI.Leave: CanShowFinaleHijack = true
    DR.setMode('sail');
  }

  // ---------------------------------------------------------------- điểm đến (BaseDestinationUI.Show)
  function visit(id) {
    const d = (D.data.dests || []).find(x => x.id === id);
    if (!d) { console.warn('[dock] destination not found at this dock:', id); return false; }
    return visitSpecial(d);
  }
  function visitSpecial(d) {
    if (!D) return false;
    hideUi();
    D.phase = 'dest'; D.dest = d; D.tab = null;
    root.DRYarn.recordShopVisit(d.id);
    if (d.vcam) cam(d.vcam);
    DR.emit('destination', d.id, true);
    // nút ở bước nhiệm vụ showAtSpeaker > speakerRootNodeOverride > SpeakerData.yarnRootNode
    let node = '';
    const STEPS = (root.DR_QUESTS || {}).QuestStepData || {};
    if (d.speaker) {
      const sid = root.DRQuests.activeSteps().find(s => STEPS[s] && STEPS[s].showAtSpeaker && STEPS[s].stepSpeaker === d.speaker && root.DRQuests.canBeShown(s));
      if (sid) node = STEPS[sid].yarnRootNode || '';
    }
    if (!node && d.root) node = d.root;
    if (!node && d.speaker) node = (DR_WORLD.SpeakerData[d.speaker] || {}).yarnRootNode || '';
    if (node && root.DRYarn.hasNode(node)) {
      DRDialogue.start(node, {
        onEnd: r => {
          if (!D) return;
          if (r && r.flags.exitDestination) { leaveDest(); return; }
          openDest();
        }
      });
    } else openDest();
    return true;
  }

  function leaveDest() {
    if (!D) return;
    const d = D.dest;
    D.dest = null;              // trước khi đóng khoang: onClose của khoang thấy dest đã rời thì không gọi lại hàm này
    closeWin();
    if (root.DRCargo && DRCargo.isOpen()) DRCargo.close();
    DR.emit('destination', d && d.id, false);
    enterDock(0);
  }

  function closeWin() { if (win) { win.classList.remove('on'); win.innerHTML = ''; } }

  function openDest() {
    const d = D.dest;
    if (d.cls === 'CharacterDestination') { leaveDest(); return; }       // CharacterDestinationUI.ShowMainUI → rời ngay
    if (d.cls === 'RestDestination') { rest(); return; }
    if (d.cls === 'StorageDestination') { openStorage(); return; }
    // MarketDestinationUI: lưới hàng bên trái + khoang bên phải (js/shop.js); đóng khoang = rời điểm đến
    if ((d.cls === 'MarketDestination' || d.cls === 'ShipyardDestination') && root.DRShop &&
      DRShop.open(d, { onClose: () => { if (D && D.phase === 'dest' && D.dest === d) leaveDest(); } })) return;
    renderDest();
  }

  function renderDest() {
    if (!D || !D.dest) return;
    const d = D.dest;
    win.innerHTML = '';
    win.classList.add('on');
    const panel = el('div', 'dr-panel', win), wrap = el('div', 'dk-wrap', panel);
    const head = el('div', 'dk-head', wrap);
    el('h2', '', head, destTitle(d));
    el('div', 'sp', head);
    el('div', 'dr-money dk-funds', head, money(DR.s.funds)).style.fontSize = '24px';
    const back = el('button', 'dr-btn gold', head, 'Quay lại thị trấn'); back.dataset.act = 'leave-dest';
    back.onclick = () => { play('ui.button.back'); leaveDest(); };
    const m = el('div', 'dk-main', wrap);
    D.main = m;
    if (d.cls === 'UpgradeDestination' && root.DRUpgrade) {
      // UpgradeDestinationUI.ShowMainUI → UpgradeWindow.Show (js/upgrade.js); đóng cửa sổ = rời điểm đến (OnUpgradeWindowHideComplete)
      closeWin();
      DRUpgrade.open({ dest: d, onClose: () => { if (D && D.dest === d) leaveDest(); } });
    } else {
      console.info('[dock] destination has no system yet:', d.cls, d.id);
      el('div', 'dk-empty', m, '"' + destTitle(d) + '" chưa có trong bản này.');
    }
  }
  function refresh() {
    if (!D || D.phase !== 'dest' || !win.classList.contains('on')) {
      if (D && D.phase === 'ui') { const f = ui.querySelector('.dk-money'); if (f) f.textContent = money(DR.s.funds); }
      return;
    }
    const y = D.main && D.main.scrollTop;
    renderDest();
    if (D.main) D.main.scrollTop = y;
  }

  // ---------------------------------------------------------------- kho / nghỉ
  function openStorage() {
    if (root.DRCargo) DRCargo.open({ keys: ['INVENTORY', 'STORAGE'], title: 'Kho của tôi', onClose: () => { if (D && D.phase === 'dest' && D.dest) leaveDest(); } });
    else leaveDest();
  }
  // RestDestinationUI.ShowMainUI: ngủ tới 06:00 (0,25 ngày) rồi tự rời điểm đến
  function rest() {
    const t = DR.s.time % 1, k = 0.25;
    const hours = (t >= k ? k + (1 - t) : k - t) * 24;
    toast('Bạn chìm vào giấc ngủ…');
    let done = false;
    const fin = () => { if (done) return; done = true; if (D && D.phase === 'dest') leaveDest(); };
    DR.on('passTimeDone', fin);
    DR.emit('passTime', hours, 'SLEEP');
    setTimeout(fin, 9000);   // [ĐỀ XUẤT] sky.js không báo xong thì vẫn quay ra
  }

  // ---------------------------------------------------------------- phím
  root.addEventListener('keydown', e => {
    if (!D || D.phase !== 'ui' || (root.DRDialogue && DRDialogue.isOpen())) return;
    if (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) return;
    if (e.code === 'Space' && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); leave(); }
  }, true);
  root.addEventListener('keydown', e => {
    if (!D || D.phase !== 'dest' || !win.classList.contains('on')) return;
    if (e.code === 'Escape' || e.code === 'KeyX') { e.preventDefault(); e.stopImmediatePropagation(); leaveDest(); }
  }, true);
  root.addEventListener('resize', () => { if (ui && D) ui.style.setProperty('--s', scale().toFixed(4)); });

  // ---------------------------------------------------------------- wiring
  function wire() {
    if (!root.DR || !DR.on) return;
    DR.on('mode', (mode, info) => {
      if (mode === 'dock' && info && info.dockId) show(info);
      else if (mode === 'dock' && D) { if (D.phase === 'ui') showUi(); }
      else if (mode !== 'cargo') hide();
    });
    DR.on('funds', () => refresh());
    DR.on('refreshDockVCams', () => { if (D && D.phase === 'ui') cam(D.data.vcam); });
  }
  wire();

  root.DRDock = {
    show, hide, resume, visit, talk, leave, leaveDest, isOpen: () => !!D, aim, cam,
    _debug: () => D && {
      dockId: D.dockId, phase: D.phase, dest: D.dest && D.dest.id, tab: D.tab,
      dests: ui ? [...ui.querySelectorAll('.dk-dest')].map(b => b.dataset.dest) : [],
      speakers: ui ? [...ui.querySelectorAll('.dk-speaker')].map(b => b.dataset.speaker) : []
    }
  };
})(window);
