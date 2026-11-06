/*
 * Âm thanh của Biển Mù đặt theo cách bản gốc đặt tiếng: nhóm mixer (bus), nguồn tiếng cố định trong thế giới, thời tiết + sét,
 * nhạc chớp, lớp tiếng hoảng loạn, tiền, nút bấm, tiếng vào điểm đến, nhạc và tiếng nền của bến.
 * Số liệu: data/sfx.js (tools/sfx_scene.py: bóc từ Game.unity, MainAudioMixer, StingerAudio...) và data/audio.js (tools/audio.py).
 * js/audio.js là động cơ WebAudio; file này chỉ quyết định PHÁT GÌ, LÚC NÀO, TO BAO NHIÊU.
 *
 *   DRSfx.update(x, z, zone)    mỗi 0,5 s từ js/main.js (khối "âm thanh nền"): đặt lại toàn bộ trạng thái mong muốn
 *   DRSfx.dockEnter(dock)  DRSfx.dockLeave()   js/docks.js gọi khi cập/rời bến (nhạc có ghi đè theo cốt truyện + tiếng nền ngày/đêm)
 *   DRSfx.debug()               ảnh chụp trạng thái cho test/dredge-sfx.js
 * Sự kiện nghe (DR.on): 'funds' (tiền đổi), 'destination' (vào/ra điểm đến), 'lightning' ({x, z, dist} do chủ môi trường phát),
 *   'mode' (đổi chế độ). Đọc: DRSky.weather = { cur, prev, k } (k = chuyển cảnh 0..1; chưa có thì dùng DR.s.weather), DR.s.sanity.
 * Mọi lệnh phát được gọi lại mỗi nhịp (idempotent) vì WebAudio chỉ mở sau cú chạm đầu tiên.
 */
(function (root) {
  'use strict';
  const D = root.DR, DRAudio = root.DRAudio, S = root.DR_SFX || {};
  if (!D || !DRAudio) return;
  const W = root.DR_WEATHER || {};
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => a === b ? 0 : clamp01((v - a) / (b - a));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const safe = fn => { try { return fn(); } catch (e) { console.warn('[sfx]', e && e.message); return null; } };
  const has = n => !!(n && DRAudio.resolve(n));
  // khoá chưa có trong DR_AUDIO (clip chưa được đưa vào bản web) thì bỏ qua, không cảnh báo
  const play = (n, v, r, o) => { try { return has(n) ? DRAudio.play(n, v, r, o) : null; } catch (e) { return null; } };

  // AnimationCurve của Unity: Hermite khối giữa hai khoá [thời gian, giá trị, tiếp tuyến vào, tiếp tuyến ra], kẹp ngoài đoạn.
  function evalCurve(k, t) {
    if (!k || !k.length) return 1;
    const n = k.length;
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > k[i + 1][0]) i++;
    const a = k[i], b = k[i + 1], dt = b[0] - a[0], u = (t - a[0]) / dt, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * dt + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * dt;
  }

  const Sfx = root.DRSfx = {
    // nhạc chớp: công khai để bộ kiểm thử đặt lại đồng hồ (StingerAudio.timeUntilNextCheck...)
    stinger: { canUpdate: false, timeUntilNextCheck: rnd(60, 80), queued: false, lastZone: null, lastIndex: -1, played: 0, last: null },
    snap: 'MENU'
  };

  // ======================================================================= nhóm mixer (bus)
  // Cây nhóm + dB từng snapshot lấy từ MainAudioMixer (DR_SFX.mixer). Bỏ Master (-9 dB): các khoá trong DR_AUDIO đã mang hệ số vol.
  // Day/Night không đọc từ snapshot mà theo TimeOfDayAudioBlender: max(0,001, đường cong(giờ)) × cơ số.
  const MIX = (S.mixer && S.mixer.groups) || {};
  const lin = db => db <= -79.9 ? 0 : Math.pow(10, db / 20);
  function groupGain(name, snap, blend) {
    let g = 1, n = name, guard = 0;
    while (n && n !== 'Master' && guard++ < 12) {
      g *= n === 'Day' ? blend.day : n === 'Night' ? blend.night : lin((MIX[n] && MIX[n].db[snap]) || 0);
      n = MIX[n] && MIX[n].parent;
    }
    return g;
  }
  const BUSES = ['Day', 'Night', 'General', 'Weather', 'WorldSFX', 'DayDockAmbience', 'NightDockAmbience', 'InsanitySFX',
    'Music_Dock', 'Music_Menu', 'Music_Stinger', 'IndoorDestination', 'OutdoorDestination'];
  let blend = { day: 1, night: 0 }, indoors = false, curDock = null, snapFade = 0.5;

  function timeOfDay() { return D.s ? D.s.time - Math.floor(D.s.time) : 0.3; }
  function wantSnap() {
    if (D.mode === 'title' || !D.s) return 'MENU';
    if (D.s.dock) return indoors ? 'DOCKED_INDOORS' : 'DOCKED_OUTDOORS';
    return 'UNDOCKED';
  }
  function updateBuses() {
    const B = S.blend, t = timeOfDay();
    if (B) blend = { day: Math.max(0.001, evalCurve(B.day, t)) * B.dayBase, night: Math.max(0.001, evalCurve(B.night, t)) * B.nightBase };
    const snap = wantSnap();
    if (snap !== Sfx.snap) {
      const dk = S.dock || {};
      snapFade = snap === 'UNDOCKED' ? dk.fadeOut : snap === 'DOCKED_OUTDOORS' && Sfx.snap === 'UNDOCKED' ? dk.fadeIn : snap === 'MENU' ? 0.5 : dk.destination;
      snapFade = snapFade == null ? 0.5 : snapFade;
      Sfx.snap = snap;
    }
    const tc = Math.max(0.15, snapFade / 3);
    for (const b of BUSES) DRAudio.bus(b, groupGain(b, Sfx.snap, blend), tc);
    // một clip dùng cho cả ngày lẫn đêm (DockData ngày = đêm): gốc phát hai nguồn Day + Night, tổng hệ số ngày/đêm = 1
    DRAudio.bus('DockAmbience', groupGain('DayDockAmbience', Sfx.snap, { day: 1, night: 1 }), tc);
  }

  // ======================================================================= nút bấm (SFX-04)
  // BasicButtonWrapper: rê chuột vào -> `select`, bấm -> `submit` (nút "quay lại" dùng `click-back`); chỉ khi nút còn bấm được.
  // TabbedPanelContainer.panelSwapSFX = click-back cho đổi tab.
  const BTN = 'button, [role="button"], a.eng-btn, .dr-btn, .eng-btn';
  const BACK_ACT = new Set(['leave', 'leave-dest', 'close', 'back', 'undock', 'cancel']);
  const BACK_ID = new Set(['btn-resume', 'btn-undock']);
  const UI = ['ui.button.select', 'ui.button.submit', 'ui.button.back'];
  let lastSelect = 0;
  const btnOf = el => {
    const b = el && el.closest ? el.closest(BTN) : null;
    return b && !b.closest('#dr-touch') ? b : null;   // nút cảm ứng là phím ảo (Space, L, Tab, Esc), không phải nút menu
  };
  const disabled = b => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('disabled');
  function uiKind(b) {
    const o = b.dataset && b.dataset.sfx;
    if (o) return o;
    if ((b.dataset && b.dataset.tab != null) || b.getAttribute('role') === 'tab') return 'back';
    if (BACK_ACT.has(b.dataset && b.dataset.act) || BACK_ID.has(b.id)) return 'back';
    return 'submit';
  }
  function hookButtons() {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerenter', e => {
      const b = btnOf(e.target);
      if (!b || e.target !== b || disabled(b)) return;
      const t = now();
      if (t - lastSelect < 60) return;   // dựng lại nút dưới con trỏ làm trình duyệt bắn lại pointerenter
      lastSelect = t;
      play('ui.button.select');
    }, true);
    document.addEventListener('focusin', e => {   // bàn phím: OnSelect cũng phát `select`; bấm chuột thì :focus-visible sai nên không phát đôi
      const b = btnOf(e.target);
      if (b && e.target === b && !disabled(b) && b.matches && b.matches(':focus-visible')) play('ui.button.select');
    }, true);
    document.addEventListener('click', e => {
      const b = btnOf(e.target);
      if (!b || disabled(b)) return;
      const k = uiKind(b);
      if (k === 'none') return;
      play(k === 'back' ? 'ui.button.back' : k === 'select' ? 'ui.button.select' : k === 'submit' ? 'ui.button.submit' : k);
      // js/dock.js (chủ khác) còn tự gọi ui.button.select/back trong onclick: một cú bấm chỉ nghe một tiếng
      DRAudio.gate(UI, 80);
    }, true);
  }

  // ======================================================================= tiền (SFX-09): FundsChangeAudio
  function hookFunds() {
    D.on('funds', (total, change) => {
      if (!(change > 0 || change < 0)) return;
      const F = S.funds || {};
      play(change > 0 ? pick(F.up || ['item-sold-1', 'item-sold-2', 'item-sold-3']) : (F.down || ['Item-bought-1'])[0]);
      DRAudio.gate(['ui.sell', 'ui.sell.1', 'ui.sell.2', 'ui.sell.3', 'ui.buy'], 250);   // js/dock.js còn gọi ui.sell / ui.buy sau addFunds
    });
  }

  // ======================================================================= cửa sổ (SFX-11): khoá cũ của mã khác -> clip đúng của bản gốc
  // hud.js phát ui.journal.* cho Sổ nhiệm vụ: ở bản gốc đó là JournalWindow (Pursuits - Open/Close) và QuestDetailWindow (… Individual),
  // còn Encyclopedia - Open/Close là cửa sổ Bách khoa chưa có ở bản web.
  function hookAliases() {
    DRAudio.alias('ui.journal.open', 'ui.pursuits.open');
    DRAudio.alias('ui.journal.close', 'ui.pursuits.close');
    DRAudio.alias('ui.journal.page.1', 'ui.pursuits.open.one');
  }

  // ======================================================================= nguồn tiếng cố định (SFX-08)
  // AudioSource vùng (Day/Night/General) có SpatialBlend 0: chỉ Volume2D chỉnh âm lượng theo khoảng cách tới thuyền (usePlayerDistance)
  // hoặc camera. Nguồn 3D (lỗ hơi, thác) thêm panner tuyến tính min..max. smartToggle: ngoài tầm thì dừng hẳn.
  const act = new Map();   // chỉ số nguồn -> { h, quiet }
  const EM = S.emitters || [];
  function vol2D(d, dist) {
    const far = d[0] + d[1];
    return dist < d[0] ? d[2] : dist > far ? 0 : lerp(d[2], d[3], invLerp(d[0], far, dist));
  }
  function stopEmitters(fade) { for (const [, r] of act) r.h.stop(fade == null ? 1 : fade); act.clear(); }
  function updateEmitters(bx, bz, cam, gains) {
    for (let i = 0; i < EM.length; i++) {
      const e = EM[i];
      if (e._k === undefined) e._k = has(e.c) ? DRAudio.resolve(e.c) : false;   // clip chưa đưa vào bản web thì bỏ qua
      if (!e._k) continue;
      const bus = gains[e.g] || 0;
      const p = e.d && e.d[4] === 0 ? cam : { x: bx, y: 0, z: bz };
      const dx = p.x - e.x, dy = (p.y || 0) - e.y, dz = p.z - e.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let v = e.d ? vol2D(e.d, dist) : (e.v == null ? 1 : e.v);
      if (e.b && dist >= e.mx) v = 0;                    // ngoài maxDistance của rolloff tuyến tính
      const r = act.get(i);
      if (v > 0.002 && bus > 0.002) {
        if (!r) {
          const h = DRAudio.voice(e.c, { loop: true, vol: v, bus: e.g, offset: 'random', fade: 1,
            pos: e.b ? { x: e.x, y: e.y, z: e.z } : null, min: e.mn, max: e.mx });
          if (h.alive) act.set(i, { h, quiet: 0 });
        } else { r.h.gain(v, 0.5); r.quiet = 0; }
      } else if (r) {
        r.quiet += 0.5;
        r.h.gain(0, 0.5);
        if (r.quiet > 6) { r.h.stop(1); act.delete(i); }   // im lặng đủ lâu thì giải phóng nguồn (và bộ nhớ clip)
      }
    }
  }

  // ======================================================================= thời tiết (SFX-05)
  // WeatherController: mỗi thời tiết có vòng lặp sfx; trong lúc chuyển cảnh (k 0..1) vòng mới lên theo sfxEnterCurve, vòng cũ xuống
  // theo sfxExitCurve: vol = sfxVolume × enter(k), cũ = sfxVolume × (1 − exit(k)). Hai thời tiết chung clip (MediumRain/MediumStorm) cộng lại.
  function weatherOf(x) {
    if (!x) return null;
    if (typeof x === 'string') {
      const k = Object.keys(W).find(n => n.toLowerCase() === x.toLowerCase());
      return k ? { name: k, p: W[k].parameters } : null;
    }
    if (x.parameters) return { name: x.asset || x.name || Object.keys(W).find(n => W[n] === x) || null, p: x.parameters };
    if (typeof x.sfxVolume === 'number') return { name: Object.keys(W).find(n => W[n].parameters === x) || null, p: x };
    return null;
  }
  const weatherClip = w => (w.p && w.p.sfx) || (S.weather && w.name && S.weather[w.name]) || null;
  function weatherState() {
    const sky = root.DRSky && root.DRSky.weather;
    if (sky && sky.cur) return { cur: weatherOf(sky.cur), prev: weatherOf(sky.prev), k: sky.k == null ? 1 : sky.k };
    return { cur: weatherOf(D.s && D.s.weather), prev: null, k: 1 };
  }
  const wLoops = new Set();
  function updateWeather() {
    const st = weatherState(), want = {};
    const add = (w, v) => {
      const c = w && weatherClip(w), k = c && DRAudio.resolve(c);
      if (k && v > 0.0005) want[k] = (want[k] || 0) + v;
    };
    if (st.cur) add(st.cur, st.cur.p.sfxVolume * (st.k >= 1 ? 1 : evalCurve(st.cur.p.sfxEnterCurve, st.k)));
    if (st.prev && st.k < 1) add(st.prev, st.prev.p.sfxVolume * (1 - evalCurve(st.prev.p.sfxExitCurve, st.k)));
    for (const [k, v] of Object.entries(want)) { DRAudio.loop(k, v, 1, 'Weather'); wLoops.add(k); }
    for (const k of Array.from(wLoops)) if (!(k in want)) { DRAudio.loop(k, 0); wLoops.delete(k); setTimeout(() => { if (!wLoops.has(k)) DRAudio.stopLoop(k); }, 3000); }
    Sfx.weatherWant = want;
    return st;
  }
  // Lightning.Emit: sét ở 50-250 m (tiếng tuyến tính 50..250), sấm đến sau khoảng cách × thunderDelay giây (thời gian thực).
  function hookLightning() {
    D.on('lightning', e => {
      const L = S.lightning;
      if (!L || !e) return;
      const pos = { x: e.x, y: 0, z: e.z };
      play(pick(L.strike), 1, 1, { bus: 'Weather', pos, min: L.mn, max: L.mx });
      const dist = e.dist != null ? e.dist : Math.hypot((lx || 0) - e.x, (lz || 0) - e.z);
      setTimeout(() => play(pick(L.thunder), 1, 1, { bus: 'Weather', pos, min: L.mn, max: L.mx }), dist * L.thunderDelay * 1000);
    });
  }

  // ======================================================================= nhạc chớp (SFX-06): StingerAudio.Update
  function forbidStingers(st) { return !!(st.cur && st.cur.p && st.cur.p.forbidStingers); }
  function updateStinger(dt, zone, st) {
    const T = Sfx.stinger, P = (S.stingers && S.stingers.params) || null;
    if (!P || !T.canUpdate || paused() || D.mode === 'title') return;
    if (T.queued) {
      const names = ((S.stingers.zones || {})[zone] || []).filter(has);
      if (!names.length) return;   // StingerAudio: vùng không có danh sách thì giữ hàng đợi tới khi vào vùng có
      if (zone !== T.lastZone) T.lastIndex = -1;
      // [ĐỀ XUẤT] bỏ nhánh TIR (35%): nhạc Iron Rig là DLC2, bản web chỉ có game gốc
      let n = Math.floor(Math.random() * names.length);
      if (n === T.lastIndex && names.length > 1) { const t = n + 1, len = names.length - 1; n = Math.floor(t - Math.floor(t / len) * len); }   // Mathf.Repeat(++num, Count - 1)
      T.lastIndex = n; T.lastZone = zone; T.queued = false;
      T.timeUntilNextCheck = P.duration + rnd(P.delayMin, P.delayMax);
      const h = DRAudio.stinger(names[n], P.max == null ? 1 : P.max);
      T.played++; T.last = { name: names[n], zone, t: now() };
      return h;
    }
    T.timeUntilNextCheck -= dt;
    if (T.timeUntilNextCheck > 0) return;
    const t = timeOfDay();
    if (!DRAudio.stingerPlaying() && t >= P.timeMin && t <= P.timeMax && !forbidStingers(st)) T.queued = true;
    else T.timeUntilNextCheck = P.check;
  }

  // ======================================================================= hoảng loạn (SFX-12): InsanityAmbience
  const iLoops = new Set();
  let insProp = 0, sanPrev = null, sanRate = 0;
  function updateInsanity(dt) {
    const I = S.insanity, s = D.s;
    if (!I || !s || D.mode === 'title') return;
    // PlayerSanity.RateOfChange không lộ ra ngoài js/sky.js: suy ra từ độ đổi của sanity (Δ / (dt · hệ số thời gian)).
    const tmod = root.DRSky && DRSky.env ? DRSky.env.timeMod : 0;
    if (sanPrev != null && tmod > 1e-4 && dt > 0.05 && (s.sanity !== sanPrev || (s.sanity > 0 && s.sanity < 1))) sanRate = (s.sanity - sanPrev) / (dt * tmod);
    sanPrev = s.sanity;
    // volume nhóm InsanitySFX: prop = 1 − InverseLerp(maxDrain, 0, min(−0,0001, rate)); dB = log10(prop) × hệ số 20 => gain tuyến tính = prop
    const target = 1 - invLerp(I.maxDrain, 0, Math.min(-0.0001, sanRate));
    insProp = lerp(insProp, target, Math.min(1, dt * I.speed));
    DRAudio.bus('InsanitySFX', groupGain('InsanitySFX', Sfx.snap, blend) * insProp, 0.3);
    const v = 1 - s.sanity;
    I.layers.forEach((c, i) => {
      const k = DRAudio.resolve(c), vol = k ? clamp01(invLerp(I.ranges[i][0], I.ranges[i][1], v)) : 0;
      if (!k) return;
      if (vol > 0) { DRAudio.loop(k, vol, 1, 'InsanitySFX'); iLoops.add(k); }
      else if (iLoops.has(k)) { DRAudio.loop(k, 0); iLoops.delete(k); setTimeout(() => { if (!iLoops.has(k)) DRAudio.stopLoop(k); }, 3000); }
    });
    Sfx.insanityWant = { value: v, prop: insProp, rate: sanRate };
  }

  // ======================================================================= điểm đến (DestinationAudio)
  let destLoop = null, destTimer = 0;
  function hookDestinations() {
    D.on('destination', (id, visited) => {
      const T = (S.destinations || {})[id];
      clearTimeout(destTimer);
      if (visited) {
        if (!T) return;
        if (T[0]) play(T[0], 1, 1, { bus: 'WorldSFX' });
        indoors = !!T[2];
        if (T[1] && has(T[1])) {
          const bus = indoors ? 'IndoorDestination' : 'OutdoorDestination';   // AudioSource indoor/outdoor của DestinationAudio
          if (destLoop) DRAudio.loop(destLoop, 0);
          destLoop = DRAudio.resolve(T[1]);
          DRAudio.loop(destLoop, 1, 1, bus);
        }
      } else {
        indoors = false;   // DOCKED_OUTDOORS lại
        const k = destLoop; destLoop = null;
        if (k) { DRAudio.loop(k, 0); destTimer = setTimeout(() => DRAudio.stopLoop(k), ((S.dock || {}).destination || 1) * 1000); }
      }
    });
  }

  // ======================================================================= bến (DockAudio)
  let dockAmb = null;
  function dockEnter(dock) {
    curDock = dock || null;
    DRAudio.stopStinger((S.music || {}).fadeDown);   // DockAudio.OnPlayerDockedToggled: RequestStingerStop
    if (!dock) return;
    const mk = dock.music;                    // getter của js/docks.js: đã xét MusicAssetOverrides
    if (mk) DRAudio.music(mk, (S.music || {}).max == null ? 1 : S.music.max, 'Music_Dock', 0.5);
    const am = root.DRDocks && DRDocks.ambience ? DRDocks.ambience(dock) : null;
    dockAmb = am ? { day: am.day && DRAudio.resolve(am.day), night: am.night && DRAudio.resolve(am.night) } : null;
    updateBuses();
  }
  // Phần mở đầu của ván mới (js/intro.js) gọi DRAudio.music(null) để nhường chỗ cho tiếng mở đầu; xong thì nhạc bến vào lại,
  // như DockAudio khi Game nạp xong sau IntroCutscene.
  function hookIntro() {
    D.on('intro', phase => {
      if (phase !== 'begin' && phase !== 'done') return;
      const dk = D.s && D.s.dock && root.DRDocks && DRDocks.byId[D.s.dock];
      if (dk && D.mode === 'dock') dockEnter(dk);
    });
  }
  function dockLeave() {
    curDock = null; indoors = false;
    const old = dockAmb; dockAmb = null;
    DRAudio.music(null, 1, null, (S.music || {}).fadeDown);   // RequestMusicStop
    if (old) setTimeout(() => { for (const k of [old.day, old.night]) if (k && !(dockAmb && (dockAmb.day === k || dockAmb.night === k))) DRAudio.stopLoop(k); }, 2500);
    for (const k of old ? [old.day, old.night] : []) if (k) DRAudio.loop(k, 0);
    if (destLoop) { DRAudio.loop(destLoop, 0); destLoop = null; }
  }
  function updateDockAmbience() {
    if (!dockAmb || !D.s || !D.s.dock) return;
    const { day, night } = dockAmb;
    if (day && day === night) DRAudio.loop(day, 1, 1, 'DockAmbience');
    else { if (day) DRAudio.loop(day, 1, 1, 'DayDockAmbience'); if (night) DRAudio.loop(night, 1, 1, 'NightDockAmbience'); }
  }

  // ======================================================================= nạp trước (SFX-13)
  const PRE_UI = ['ui.button.', 'ui.chime.', 'ui.notify.', 'ui.sell', 'ui.buy', 'ui.error', 'ui.pursuit', 'ui.pursuits.', 'ui.journal.', 'ui.messages.', 'ui.map.', 'ui.grid.open', 'boat.dock.'];
  const PRE_SAIL = ['fish.minigame.', 'fish.dredge.', 'fish.new', 'fish.end', 'fish.loop', 'fish.spot.', 'ui.grid.', 'ui.hold.', 'boat.impact.', 'boat.light.', 'ui.radial.'];
  const pre = {};
  function preload(tag, prefixes) {
    if (pre[tag] || DRAudio.state().ctx === 'none') return;
    pre[tag] = true;
    const A_ = root.DR_AUDIO || {};
    const keys = Object.keys(A_).filter(k => prefixes.some(p => k.startsWith(p)) && !(A_[k].dur > 8));   // clip dài (vòng lặp) nạp theo nhu cầu
    safe(() => DRAudio.preload(keys));
    Sfx.preloaded = (Sfx.preloaded || 0) + keys.length;
  }

  // ======================================================================= nhịp 0,5 s
  let last = 0, lx = 0, lz = 0, titleOn = false;
  const paused = () => { const e = typeof document !== 'undefined' && document.getElementById('dr-pause'); return !!(e && !e.hidden); };
  const V3 = root.THREE ? new root.THREE.Vector3() : null;
  function update(x, z, zone) {
    const t = now(), dt = last ? Math.min(2, (t - last) / 1000) : 0.5;
    last = t; lx = x; lz = z;
    const title = D.mode === 'title';
    const camObj = root.DRCamera && DRCamera.cam;
    const cam = camObj ? camObj.position : { x, y: 10, z };
    if (camObj && V3) { camObj.getWorldDirection(V3); DRAudio.listener(cam.x, cam.y, cam.z, V3.x, V3.y, V3.z); } else DRAudio.listener(cam.x, cam.y, cam.z);
    updateBuses();
    if (title) {
      // Title.unity: nhạc Dredge Theme 1 + Ambience Large Waves (FadeAudio upVolume 0,5). Không có nguồn vùng, thời tiết, hoảng loạn.
      DRAudio.music('music.title', 1, 'Music_Menu');
      DRAudio.loop('ambience.title', 0.5);
      titleOn = true;
      if (act.size) stopEmitters(0.5);
      for (const k of Array.from(wLoops)) { DRAudio.loop(k, 0); wLoops.delete(k); }
      for (const k of Array.from(iLoops)) { DRAudio.loop(k, 0); iLoops.delete(k); }
      return;
    }
    if (titleOn) { titleOn = false; DRAudio.loop('ambience.title', 0); setTimeout(() => DRAudio.stopLoop('ambience.title'), 3000); }
    const gains = {};
    for (const b of ['Day', 'Night', 'General', 'WorldSFX']) gains[b] = groupGain(b, Sfx.snap, blend);
    updateEmitters(x, z, cam, gains);
    const st = updateWeather();
    updateInsanity(dt);
    updateDockAmbience();
    if (!paused()) updateStinger(dt, zone, st);
  }

  // chế độ: nhạc chớp chạy khi ra khơi, dừng khi cập bến; nạp trước theo màn
  function hookMode() {
    D.on('mode', (m, info) => {
      const T = Sfx.stinger, P = (S.stingers && S.stingers.params) || { afterUndock: 5, delayMin: 60, delayMax: 80 };
      if (m === 'sail' && info && info.prev === 'dock') { T.canUpdate = true; T.queued = false; T.timeUntilNextCheck = P.afterUndock; }
      else if (m === 'sail' && info && info.prev === 'title') { T.canUpdate = true; T.queued = false; T.timeUntilNextCheck = rnd(P.delayMin, P.delayMax); }
      else if (m === 'dock') { T.canUpdate = false; T.queued = false; DRAudio.stopStinger((S.music || {}).fadeDown); }
      else if (m === 'over' || m === 'title') { T.canUpdate = false; T.queued = false; DRAudio.stopStinger(0.5); }
      if (m === 'title') { dockAmb = null; indoors = false; }
      if (m === 'dock' || m === 'sail') preload('ui', PRE_UI);
      if (m === 'sail') preload('sail', PRE_SAIL);
    });
  }

  safe(hookButtons); safe(hookFunds); safe(hookAliases); safe(hookLightning); safe(hookDestinations); safe(hookMode); safe(hookIntro);

  Object.assign(Sfx, {
    update, dockEnter, dockLeave, evalCurve, groupGain,
    debug() {
      return {
        snap: Sfx.snap, emitters: act.size, weather: Sfx.weatherWant || {}, insanity: Sfx.insanityWant || null, indoors,
        stinger: Object.assign({}, Sfx.stinger), dockAmb, blend, audio: DRAudio.state()
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
