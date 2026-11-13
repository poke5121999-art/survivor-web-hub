// Home meta layer: wish banner (gacha), hero levels and stars, a pretend cash shop and VIP.
// Everything lives in localStorage; no real payment exists anywhere, the shop only adds numbers.
// Power from it is real in a fight: level, stars and VIP multiply the damage the local player deals and the hero's health.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const KEY = 'blockadez.meta.v1';
  const STARTERS = ['gio', 'thep', 'mua'];
  const PULL = 150; const PULL10 = 1350; const PITY = 60; const UNLOCK = 40; const BUY_HERO = 1980;
  const STAR_COST = [10, 20, 35, 60, 100];
  const MAX_LV = 30; const lvCap = (star) => Math.min(MAX_LV, 10 + star * 4);
  const lvCost = (l) => Math.round(120 * Math.pow(l, 1.5) / 10) * 10;
  const VIP = [0, 100000, 500000, 1500000, 4000000, 10000000];
  const RATES = [['ssr', 0.025], ['sr', 0.12], ['r', 0.355], ['n', 0.5]];
  const RNAME = { ssr: 'SSR', sr: 'SR', r: 'R', n: 'N' };
  const PACKS = [
    { id: 'g60', kind: 'gems', gems: 60, vnd: 22000 },
    { id: 'g330', kind: 'gems', gems: 300, bonus: 30, vnd: 109000 },
    { id: 'g1090', kind: 'gems', gems: 980, bonus: 110, vnd: 299000 },
    { id: 'g2240', kind: 'gems', gems: 1980, bonus: 260, vnd: 599000 },
    { id: 'g8080', kind: 'gems', gems: 6480, bonus: 1600, vnd: 1990000, tag: 'HỜI NHẤT' },
    { id: 'starter', kind: 'starter', name: 'Gói khởi đầu', once: true, vnd: 49000, tag: 'MỘT LẦN', desc: '680 💎 · 20.000 vàng · 1 vé SSR chắc chắn' },
    { id: 'month', kind: 'month', name: 'Thẻ tháng', vnd: 109000, desc: 'Nhận ngay 300 💎, sau đó 90 💎 mỗi ngày trong 30 ngày' },
    { id: 'whale', kind: 'whale', name: 'Gói Bá Chủ', vnd: 2490000, tag: 'PAY TO WIN', desc: 'Nhân vật đang chọn lên ngay cấp 30 ★5, kèm 10.000 💎' },
  ];
  const GOLD_PACKS = [{ id: 'au1', gems: 100, gold: 5000 }, { id: 'au2', gems: 500, gold: 30000 }, { id: 'au3', gems: 1500, gold: 100000 }];
  const vnd = (n) => n.toLocaleString('vi-VN') + 'đ';
  const num = (n) => Math.round(n).toLocaleString('vi-VN');
  const css = (c) => '#' + c.toString(16).padStart(6, '0');
  const day = () => Math.floor((Date.now() + 7 * 3600e3) / 86400e3);

  BZ.makeMeta = (G) => {
    // under a test driver the meta layer stays neutral (every hero open, no multipliers) unless ?meta=1 asks for it
    const live = BZ.params.meta === '1' || (BZ.params.meta !== '0' && !navigator.webdriver);
    const fresh = () => ({ v: 1, gold: 3000, gems: 1600, tickets: 0, pity: 0, pulls: 0, spent: 0, bought: {}, month: 0, monthDay: 0, daily: 0, freePull: 0,
      heroes: Object.fromEntries(BZ.HEROES.map((h) => [h.id, { own: STARTERS.includes(h.id), lv: 1, star: 0, shard: 0 }])) });
    let S = load();
    function load() {
      let s; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      if (!s || s.v !== 1) s = fresh();
      for (const h of BZ.HEROES) if (!s.heroes[h.id]) s.heroes[h.id] = { own: STARTERS.includes(h.id), lv: 1, star: 0, shard: 0 };
      return s;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} paintCur(); }
    const hs = (id) => S.heroes[id];
    const vip = () => { let v = 0; for (let i = 0; i < VIP.length; i++) if (S.spent >= VIP[i]) v = i; return v; };
    const owns = (id) => !live || !hs(id) || hs(id).own;
    function dmgMul(id = G.hero && G.hero.id) { if (!live || !hs(id)) return 1; const h = hs(id); return 1 + 0.035 * (h.lv - 1) + 0.12 * h.star + 0.03 * vip(); }
    function hpMul(id = G.hero && G.hero.id) { if (!live || !hs(id)) return 1; const h = hs(id); return 1 + 0.025 * (h.lv - 1) + 0.08 * h.star + 0.02 * vip(); }
    const power = (id) => Math.round((BZ.HEROES.find((h) => h.id === id).hp * hpMul(id)) * 4 + dmgMul(id) * 600);
    // the banner's featured hero rotates every day among the ones a new account does not start with
    const featured = () => { const pool = BZ.HEROES.filter((h) => !STARTERS.includes(h.id)); return pool[day() % pool.length].id; };

    // ---------- daily: login gems, the month card's share, one free wish ----------
    function dailyTick() {
      const d = day(); const got = [];
      if (S.daily !== d) { S.daily = d; S.gems += 100; got.push('+100 💎 đăng nhập'); }
      if (S.month > d - 1 && S.monthDay !== d) { S.monthDay = d; S.gems += 90; got.push('+90 💎 thẻ tháng'); }
      if (got.length) { save(); toast(got.join(' · ')); }
    }

    // ---------- wishes ----------
    const rng = () => Math.random();
    function roll(guarantee) {
      S.pity++; S.pulls++;
      let r = rng(); let tier = 'n';
      for (const [t, p] of RATES) { if (r < p) { tier = t; break; } r -= p; }
      if (S.pity >= PITY || guarantee === 'ssr') tier = 'ssr';
      else if (guarantee === 'sr' && (tier === 'r' || tier === 'n')) tier = 'sr';
      if (tier === 'ssr') S.pity = 0;
      const all = BZ.HEROES.map((h) => h.id); const f = featured();
      const pickHero = (bias) => (rng() < bias ? f : all[Math.floor(rng() * all.length)]);
      if (tier === 'ssr') {
        const id = pickHero(0.5); const h = hs(id);
        if (!h.own) { h.own = true; return { tier, id, kind: 'hero', isNew: true }; }
        h.shard += 25; return { tier, id, kind: 'shard', n: 25 };
      }
      if (tier === 'sr') { const id = pickHero(0.3); hs(id).shard += 8; return { tier, id, kind: 'shard', n: 8 }; }
      if (tier === 'r') { const id = pickHero(0.2); hs(id).shard += 3; return { tier, id, kind: 'shard', n: 3 }; }
      const g = 300 + Math.floor(rng() * 4) * 100; S.gold += g; return { tier, kind: 'gold', n: g };
    }
    function wish(n, how) {
      if (how === 'free') { if (S.freePull === day()) return toast('Hôm nay đã dùng lượt miễn phí'); S.freePull = day(); }
      else if (how === 'ticket') { if (S.tickets < 1) return toast('Không còn vé SSR'); S.tickets--; }
      else { const cost = n === 10 ? PULL10 : PULL * n; if (S.gems < cost) { toast('Thiếu kim cương, ghé cửa hàng nạp thêm'); return tab('shop'); } S.gems -= cost; }
      const out = [];
      for (let i = 0; i < n; i++) out.push(roll(how === 'ticket' ? 'ssr' : n === 10 && i === n - 1 && !out.some((o) => o.tier !== 'n' && o.tier !== 'r') ? 'sr' : null));
      save(); reveal(out); render();
    }

    // ---------- hero growth ----------
    function levelUp(id, times = 1) {
      const h = hs(id); let done = 0;
      while (done < times && h.lv < lvCap(h.star) && S.gold >= lvCost(h.lv)) { S.gold -= lvCost(h.lv); h.lv++; done++; }
      if (!done) toast(h.lv >= lvCap(h.star) ? (h.lv >= MAX_LV ? 'Đã cấp tối đa' : 'Lên sao để mở thêm cấp') : 'Thiếu vàng');
      else { G.audio && G.audio.play('buy'); flashCard(id); }
      save(); render();
    }
    function starUp(id) {
      const h = hs(id); const c = STAR_COST[h.star];
      if (h.star >= 5) return toast('Đã đủ 5 sao');
      if (h.shard < c) return toast(`Cần ${c} mảnh, đang có ${h.shard}`);
      h.shard -= c; h.star++; G.audio && G.audio.play('buy'); save(); render(); flashCard(id, true);
    }
    function unlock(id, gems) {
      const h = hs(id); if (h.own) return;
      if (gems) { if (S.gems < BUY_HERO) { toast('Thiếu kim cương'); return tab('shop'); } S.gems -= BUY_HERO; }
      else { if (h.shard < UNLOCK) return toast(`Cần ${UNLOCK} mảnh`); h.shard -= UNLOCK; }
      h.own = true; save(); reveal([{ tier: 'ssr', id, kind: 'hero', isNew: true }]); render();
    }

    // ---------- pretend shop ----------
    function grant(p) {
      const first = !S.bought[p.id]; S.bought[p.id] = (S.bought[p.id] || 0) + 1; S.spent += p.vnd; const lines = [];
      if (p.kind === 'gems') { const g = p.gems * (first ? 2 : 1) + (p.bonus || 0); S.gems += g; lines.push(`+${num(g)} 💎` + (first ? ' (x2 lần đầu)' : '')); }
      if (p.kind === 'starter') { S.gems += 680; S.gold += 20000; S.tickets += 1; lines.push('+680 💎', '+20.000 vàng', '+1 vé SSR'); }
      if (p.kind === 'month') { S.gems += 300; S.month = Math.max(S.month, day()) + 30; S.monthDay = day(); lines.push('+300 💎', 'Thẻ tháng tới hết ngày thứ 30'); }
      if (p.kind === 'whale') { const id = sel; const h = hs(id); h.own = true; h.star = 5; h.lv = MAX_LV; S.gems += 10000; lines.push(BZ.HEROES.find((x) => x.id === id).name + ' lên cấp 30 ★5', '+10.000 💎'); }
      save(); return lines;
    }
    function buy(p) {
      if (p.once && S.bought[p.id]) return toast('Gói này chỉ mua được một lần');
      const name = p.name || `${num(p.gems)} kim cương`;
      modal(`<h3>Thanh toán giả lập</h3><div class="mm-pay"><b>${name}</b><em>${vnd(p.vnd)}</em></div>
        <p class="mm-warn">Đây là cửa hàng giả lập để thử cảm giác nạp tiền trong game. Không có thanh toán thật, không nhập thẻ, không trừ đồng nào.</p>
        <div class="row"><button class="btn" data-mm="pay">Xác nhận (giả lập)</button><button class="btn ghost" data-mm="close">Huỷ</button></div>`, (act) => {
        if (act !== 'pay') return true;
        document.querySelector('#mm-modal .mm-modal').innerHTML = '<div class="mm-spin"></div><p>Đang xử lý…</p>';
        setTimeout(() => {
          const lines = grant(p); G.audio && G.audio.play('buy');
          document.querySelector('#mm-modal .mm-modal').innerHTML = `<h3>Nạp thành công</h3><div class="mm-got">${lines.map((l) => `<span>${l}</span>`).join('')}</div><p class="muted">VIP ${vip()} · đã nạp giả lập ${vnd(S.spent)}</p><div class="row"><button class="btn" data-mm="close">OK</button></div>`;
          render();
        }, 700);
        return false;
      });
    }
    function buyGold(p) {
      if (S.gems < p.gems) { toast('Thiếu kim cương'); return; }
      S.gems -= p.gems; S.gold += p.gold; G.audio && G.audio.play('buy'); save(); render(); toast(`+${num(p.gold)} vàng`);
    }

    // ---------- earnings after a run ----------
    let lastLoot = null;
    function payout(wave, kills) {
      const m = 1 + 0.2 * vip();
      const gold = Math.round((kills * 4 + wave * wave * 12) * m); const gems = wave >= 5 ? wave * 6 : 0;
      S.gold += gold; S.gems += gems; save(); lastLoot = { gold, gems }; return lastLoot;
    }

    // ---------- portraits: each hero model rendered once into a picture ----------
    const portraits = {};
    function makePortraits() {
      if (Object.keys(portraits).length) return;
      try {
        const W = 150; const Hh = 190;
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.setSize(W, Hh); r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff0d8, 0x40302a, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 3, 4); sc.add(key);
        const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6); rim.position.set(-3, 2, -3); sc.add(rim);
        const cam = new THREE.PerspectiveCamera(26, W / Hh, 0.1, 50); cam.position.set(0.9, 1.35, 4.4); cam.lookAt(0, 0.98, 0);
        for (const h of BZ.HEROES) {
          const m = BZ.heroModel(h.id); m.root.rotation.y = 0.35; m.armR.rotation.x = -0.5; m.armL.rotation.x = -0.15; m.head.rotation.y = 0.15;
          sc.add(m.root); r.render(sc, cam); portraits[h.id] = r.domElement.toDataURL('image/png'); sc.remove(m.root);
        }
        r.dispose(); r.forceContextLoss && r.forceContextLoss();
      } catch (e) { console.warn('[meta] portraits', e); }
    }
    const face = (id) => (portraits[id] ? `<img src="${portraits[id]}" alt="">` : '');

    // ---------- DOM ----------
    const style = document.createElement('style');
    style.textContent = `
#meta { position: fixed; inset: 0; z-index: 25; display: none; flex-direction: column; background: radial-gradient(120% 90% at 50% 0%, rgba(60,40,20,.86), rgba(14,10,6,.95)); color: var(--bone); font-family: var(--f); }
#meta.on { display: flex; }
.mm-top { display: flex; align-items: center; gap: 10px; padding: 10px 16px 10px max(84px, calc(env(safe-area-inset-left) + 76px)); border-bottom: 3px solid #000; background: rgba(0,0,0,.35); flex-wrap: wrap; }
.mm-top .grow { flex: 1; }
.mm-cur { display: inline-flex; align-items: center; gap: 6px; font: 900 15px var(--mono); padding: 5px 10px; background: #2a2016; border: 2px solid #000; box-shadow: 2px 2px 0 #000; }
.mm-cur i { font-style: normal; } .mm-cur.vip { color: #ffd76a; background: linear-gradient(90deg,#5a3a08,#2a1a04); }
.mm-tabs { display: flex; gap: 6px; padding: 10px max(16px, env(safe-area-inset-left)) 0; }
.mm-tabs button { font: 900 15px var(--f); text-transform: uppercase; letter-spacing: .05em; padding: 9px 16px; border: 3px solid #000; border-bottom: 0; background: #3a2c1c; color: #cdb892; cursor: pointer; }
.mm-tabs button.on { background: var(--gold); color: var(--ink); }
.mm-body { flex: 1; overflow: auto; padding: 14px max(16px, env(safe-area-inset-left)) 24px; border-top: 3px solid #000; }
.mm-banner { position: relative; display: grid; grid-template-columns: 190px 1fr; gap: 16px; padding: 16px; border: 3px solid #000; box-shadow: 4px 4px 0 #000; background: linear-gradient(120deg, var(--hc) -40%, #2a1e12 55%); overflow: hidden; max-width: 860px; }
.mm-banner::before { content: ''; position: absolute; inset: -50%; background: conic-gradient(from 0deg, transparent 0 20deg, rgba(255,230,160,.12) 20deg 30deg, transparent 30deg 60deg); animation: mmspin 18s linear infinite; pointer-events: none; }
.mm-banner .pic { position: relative; height: 230px; display: flex; align-items: flex-end; justify-content: center; filter: drop-shadow(0 0 18px var(--hc)); }
.mm-banner .pic img { height: 100%; image-rendering: auto; }
.mm-banner h3 { margin: 0 0 4px; font-size: 26px; text-shadow: var(--px); } .mm-banner small { color: #ffd76a; letter-spacing: .1em; font-weight: 900; }
.mm-banner p { margin: 6px 0; color: #e8d8b8; font-size: 14px; position: relative; }
.mm-btns { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; position: relative; }
.mm-btns .btn em { font-style: normal; font-size: 13px; opacity: .85; margin-left: 6px; }
.mm-pity { position: relative; height: 10px; border: 2px solid #000; background: #2a2016; margin-top: 10px; max-width: 420px; } .mm-pity i { display: block; height: 100%; background: linear-gradient(90deg,#ffd76a,#ff8a3a); }
.mm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.mm-hero { position: relative; border: 3px solid #000; background: linear-gradient(180deg, color-mix(in srgb, var(--hc) 45%, #2a1e12), #22180f 70%); box-shadow: 3px 3px 0 #000; cursor: pointer; padding: 6px 6px 8px; text-align: center; color: var(--bone); font-family: var(--f); }
.mm-hero.on { outline: 3px solid var(--gold); } .mm-hero.lock img { filter: grayscale(1) brightness(.45); }
.mm-hero img { height: 120px; display: block; margin: 0 auto; }
.mm-hero b { display: block; font-size: 15px; } .mm-hero .st { color: #ffd76a; font-size: 13px; letter-spacing: 1px; min-height: 16px; }
.mm-hero .lv { position: absolute; left: 6px; top: 6px; font: 900 12px var(--mono); background: #000; padding: 2px 5px; }
.mm-hero .sh { height: 6px; border: 1px solid #000; background: #1a130b; margin-top: 4px; } .mm-hero .sh i { display: block; height: 100%; background: #b070ff; }
.mm-hero .lk { position: absolute; right: 6px; top: 6px; font-size: 14px; }
.mm-hero.flash { animation: mmflash .6s; }
.mm-detail { margin-top: 14px; display: grid; grid-template-columns: 200px 1fr; gap: 16px; padding: 14px; border: 3px solid #000; background: #2a1e12; box-shadow: 4px 4px 0 #000; max-width: 860px; }
.mm-detail .pic img { width: 100%; filter: drop-shadow(0 0 14px var(--hc)); }
.mm-detail h3 { margin: 0; font-size: 24px; } .mm-detail .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin: 10px 0; }
.mm-detail .stats span { background: #1a130b; border: 2px solid #000; padding: 6px 8px; font-size: 13px; } .mm-detail .stats b { display: block; font: 900 17px var(--mono); color: #ffd76a; }
.mm-shop h4 { margin: 18px 0 8px; font-size: 16px; text-transform: uppercase; letter-spacing: .08em; color: #ffd76a; }
.mm-packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; max-width: 900px; }
.mm-pack { position: relative; border: 3px solid #000; box-shadow: 3px 3px 0 #000; background: linear-gradient(180deg,#3d2d6a,#1e1636); padding: 14px 10px 10px; text-align: center; cursor: pointer; color: var(--bone); font-family: var(--f); }
.mm-pack.special { background: linear-gradient(180deg,#7a4a10,#2a1a06); } .mm-pack.whale { background: linear-gradient(180deg,#8a1030,#2a0612); }
.mm-pack .gem { font-size: 34px; line-height: 1; filter: drop-shadow(0 0 8px #8ad8ff); } .mm-pack b { display: block; font-size: 17px; margin: 6px 0 2px; }
.mm-pack small { display: block; font-size: 12px; color: #d8c8f0; min-height: 30px; } .mm-pack em { display: block; margin-top: 8px; font: 900 15px var(--mono); font-style: normal; background: var(--gold); color: var(--ink); border: 2px solid #000; padding: 5px; }
.mm-pack .tag { position: absolute; top: -9px; right: -6px; font: 900 11px var(--f); background: var(--red); color: #fff; border: 2px solid #000; padding: 2px 6px; transform: rotate(4deg); }
.mm-pack .x2 { position: absolute; top: -9px; left: -6px; font: 900 11px var(--f); background: #3ac060; color: #fff; border: 2px solid #000; padding: 2px 6px; transform: rotate(-4deg); }
.mm-pack.done { opacity: .45; cursor: default; }
.mm-vip { max-width: 900px; padding: 12px; border: 3px solid #000; background: linear-gradient(90deg,#5a3a08,#2a1a04); box-shadow: 3px 3px 0 #000; }
.mm-vip .mm-pity { max-width: none; }
#mm-reveal { position: fixed; inset: 0; z-index: 35; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 22px; background: radial-gradient(circle at 50% 45%, rgba(40,26,60,.9), rgba(4,3,8,.97)); }
#mm-reveal.on { display: flex; }
#mm-reveal .rays { position: absolute; inset: -40%; background: conic-gradient(from 0deg, transparent 0 8deg, var(--rc) 8deg 12deg, transparent 12deg 30deg); opacity: .25; animation: mmspin 10s linear infinite; pointer-events: none; }
#mm-reveal .cards { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 900px; padding: 0 16px; }
.mm-card { width: 120px; height: 168px; perspective: 600px; animation: mmpop .3s cubic-bezier(.2,.9,.3,1.4) both; animation-delay: var(--d); }
.mm-card .in { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; animation: mmflip .5s cubic-bezier(.3,.8,.3,1.15) both; animation-delay: calc(var(--d) + .35s); }
.mm-card .f, .mm-card .b { position: absolute; inset: 0; backface-visibility: hidden; border: 3px solid #000; box-shadow: 3px 3px 0 #000; }
.mm-card .b { background: repeating-linear-gradient(45deg,#2a1e40 0 8px,#22183a 8px 16px); display: flex; align-items: center; justify-content: center; font-size: 40px; color: #6a5a90; }
.mm-card .f { transform: rotateY(180deg); background: linear-gradient(180deg, var(--cc), #1a1208 80%); display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 8px; overflow: hidden; }
.mm-card .f img { position: absolute; top: 4px; height: 112px; }
.mm-card .f .t { position: absolute; left: 4px; top: 4px; font: 900 13px var(--mono); padding: 1px 5px; background: #000; color: var(--tc); }
.mm-card .f b { position: relative; font-size: 13px; text-shadow: 2px 2px 0 #000; } .mm-card .f small { position: relative; font-size: 11px; color: #ffe8a8; }
.mm-card .f .big { font-size: 46px; position: absolute; top: 30px; }
.mm-card.ssr .f { box-shadow: 0 0 22px 4px #ffcc40, 3px 3px 0 #000; } .mm-card.ssr .f::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 45%, transparent 60%); animation: mmshine 1.6s ease-in-out infinite; animation-delay: calc(var(--d) + .5s); }
.mm-card.sr .f { box-shadow: 0 0 14px 2px #c080ff, 3px 3px 0 #000; }
.mm-card .new { position: absolute; top: 4px; right: 4px; font: 900 10px var(--f); background: var(--red); color: #fff; padding: 1px 4px; border: 2px solid #000; }
#mm-reveal h2 { position: relative; margin: 0; font-size: 30px; text-shadow: var(--px); letter-spacing: .08em; }
#mm-modal { position: fixed; inset: 0; z-index: 36; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.6); }
#mm-modal.on { display: flex; }
.mm-modal { width: min(420px, calc(100vw - 32px)); background: #2a1e12; border: 3px solid #000; box-shadow: 6px 6px 0 #000; padding: 18px; text-align: center; }
.mm-modal h3 { margin: 0 0 10px; } .mm-pay { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1a130b; border: 2px solid #000; }
.mm-pay em { font: 900 18px var(--mono); font-style: normal; color: #ffd76a; }
.mm-warn { font-size: 13px; color: #ffcfa0; background: rgba(224,64,44,.15); border: 2px dashed #e0402c; padding: 8px; }
.mm-got { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; } .mm-got span { font: 900 17px var(--mono); color: #9fe8ff; }
.mm-spin { width: 40px; height: 40px; margin: 10px auto; border: 5px solid #4a3a26; border-top-color: var(--gold); border-radius: 50%; animation: mmspin .8s linear infinite; }
.mm-lkpic { height: 150px; } .mm-lkpic img { height: 150px; }
#mm-toast { position: fixed; left: 50%; top: 70px; transform: translateX(-50%); z-index: 37; font: 900 14px var(--f); background: #000; color: #ffd76a; border: 2px solid #ffd76a; padding: 8px 14px; opacity: 0; transition: opacity .25s; pointer-events: none; }
#mm-toast.on { opacity: 1; }
.meta-bar { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 4px 0 10px; }
.meta-row .btn { font-size: 15px; padding: 10px 16px; }
#dead-loot { font: 900 16px var(--mono); color: #ffd76a; margin: 6px 0; min-height: 20px; }
#sel-row button.lock { opacity: .55; } #sel-row button.lock::after { content: ' 🔒'; }
#sel-meta { display: block; font: 900 13px var(--mono); color: #ffd76a; margin-top: 2px; }
@keyframes mmspin { to { transform: rotate(360deg); } }
@keyframes mmpop { from { transform: translateY(30px) scale(.5); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes mmflip { from { transform: rotateY(0); } to { transform: rotateY(180deg); } }
@keyframes mmshine { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(120%); } }
@keyframes mmflash { 0% { transform: scale(1); filter: brightness(1); } 30% { transform: scale(1.06); filter: brightness(1.8); } 100% { transform: scale(1); filter: brightness(1); } }
@media (max-width: 640px) { .mm-banner, .mm-detail { grid-template-columns: 1fr; } .mm-banner .pic { height: 170px; } .mm-card { width: 92px; height: 130px; } .mm-card .f img { height: 84px; } }
`;
    document.head.appendChild(style);
    const box = document.createElement('div');
    box.innerHTML = `<section id="meta"><div class="mm-top"><button class="btn ghost small" data-mm="back">◀ Về</button><span class="grow"></span><span class="mm-cur vip" id="mm-vip"></span><span class="mm-cur"><i>🪙</i><b id="mm-gold"></b></span><span class="mm-cur"><i>💎</i><b id="mm-gems"></b></span><button class="btn small" data-mm="tab:shop">+ Nạp</button></div>
      <div class="mm-tabs"><button data-mm="tab:gacha">Triệu hồi</button><button data-mm="tab:heroes">Nhân vật</button><button data-mm="tab:shop">Cửa hàng</button></div><div class="mm-body" id="mm-body"></div></section>
      <div id="mm-reveal"><div class="rays"></div><h2 id="mm-rtitle"></h2><div class="cards" id="mm-cards"></div><div class="row" style="position:relative"><button class="btn" data-mm="rclose">Nhận</button><button class="btn ghost" data-mm="ragain">Triệu hồi tiếp</button></div></div>
      <div id="mm-modal"><div class="mm-modal"></div></div><div id="mm-toast"></div>`;
    while (box.firstChild) document.body.appendChild(box.firstChild);
    const $ = (s) => document.querySelector(s);
    const root = $('#meta'); const body = $('#mm-body');

    // title screen: currencies and the three doors
    const title = $('#title .in');
    if (title) {
      const row = title.querySelector('.row');
      const bar = document.createElement('div'); bar.className = 'meta-bar'; bar.id = 'meta-bar';
      const doors = document.createElement('div'); doors.className = 'row meta-row';
      doors.innerHTML = '<button class="btn ghost" data-mm="open:gacha">✦ Triệu hồi</button><button class="btn ghost" data-mm="open:heroes">⬆ Nhân vật</button><button class="btn ghost" data-mm="open:shop">💎 Cửa hàng</button>';
      if (row) { row.after(doors); row.before(bar); }
    }
    const dead = $('#dead dl'); if (dead) { const p = document.createElement('div'); p.id = 'dead-loot'; dead.after(p); }

    function paintCur() {
      const set = (s, v) => { const e = $(s); if (e) e.textContent = v; };
      set('#mm-gold', num(S.gold)); set('#mm-gems', num(S.gems)); set('#mm-vip', 'VIP ' + vip());
      const bar = $('#meta-bar'); if (bar) bar.innerHTML = live ? `<span class="mm-cur vip">VIP ${vip()}</span><span class="mm-cur"><i>🪙</i>${num(S.gold)}</span><span class="mm-cur"><i>💎</i>${num(S.gems)}</span>` : '';
    }
    let toastT = 0;
    function toast(msg) { const t = $('#mm-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }
    let modalCb = null;
    function modal(html, cb) { const m = $('#mm-modal'); m.querySelector('.mm-modal').innerHTML = html; m.classList.add('on'); modalCb = cb; }
    function closeModal() { $('#mm-modal').classList.remove('on'); modalCb = null; }

    let cur = 'gacha'; let sel = (G.settings && G.settings.hero) || 'mua';
    function open(which) {
      if (!live) return;
      makePortraits(); dailyTick();
      root.classList.add('on'); document.querySelectorAll('.screen.on').forEach((e) => e.classList.remove('on')); tab(which || cur);
      G.audio && G.audio.unlock();
    }
    function close() { root.classList.remove('on'); G.ui.show('title'); paintCur(); }
    function tab(which) { cur = which; root.querySelectorAll('.mm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mm === 'tab:' + which)); render(); }
    function render() {
      paintCur();
      if (!root.classList.contains('on')) return;
      if (cur === 'gacha') renderGacha(); else if (cur === 'heroes') renderHeroes(); else renderShop();
    }
    const HB = (id) => BZ.HEROES.find((h) => h.id === id);
    function renderGacha() {
      const f = HB(featured()); const free = S.freePull !== day();
      body.innerHTML = `<div class="mm-banner" style="--hc:${css(f.color)}"><div class="pic">${face(f.id)}</div><div>
        <small>BANNER HÔM NAY · TỈ LỆ CAO</small><h3>${f.name} · ${f.role}</h3>
        <p>SSR ${(RATES[0][1] * 100).toFixed(1)}% (một nửa ra ${f.name}) · SR ${RATES[1][1] * 100}% (8 mảnh) · R ${(RATES[2][1] * 100).toFixed(1)}% (3 mảnh) · N ${RATES[3][1] * 100}% (vàng)</p>
        <p>SSR ra nhân vật mới, trùng thì đổi 25 mảnh. ${UNLOCK} mảnh ghép được một nhân vật chưa có. Mười lượt chắc chắn có SR trở lên.</p>
        <div class="mm-pity"><i style="width:${(S.pity / PITY) * 100}%"></i></div><p>Bảo hiểm: chắc chắn ra SSR sau <b>${PITY - S.pity}</b> lượt nữa · đã triệu hồi ${S.pulls} lượt</p>
        <div class="mm-btns">${free ? '<button class="btn" data-mm="wish:free">Miễn phí hôm nay</button>' : ''}<button class="btn" data-mm="wish:1">×1 <em>${PULL} 💎</em></button><button class="btn" data-mm="wish:10">×10 <em>${num(PULL10)} 💎</em></button>${S.tickets ? `<button class="btn" data-mm="wish:ticket">Vé SSR ×${S.tickets}</button>` : ''}</div>
      </div></div>`;
    }
    function heroCard(h) {
      const s = hs(h.id); const nextShard = s.own ? STAR_COST[s.star] || 0 : UNLOCK;
      return `<button class="mm-hero ${s.own ? '' : 'lock'} ${h.id === sel ? 'on' : ''}" data-mm="hero:${h.id}" data-hid="${h.id}" style="--hc:${css(h.color)}">
        ${s.own ? `<span class="lv">Lv ${s.lv}</span>` : '<span class="lk">🔒</span>'}${face(h.id)}<b>${h.name}</b><div class="st">${'★'.repeat(s.star)}${'☆'.repeat(5 - s.star)}</div>
        <div class="sh"><i style="width:${nextShard ? Math.min(100, (s.shard / nextShard) * 100) : 100}%"></i></div><small>${s.shard}${nextShard ? '/' + nextShard : ''} mảnh</small></button>`;
    }
    function renderHeroes() {
      const h = HB(sel) || BZ.HEROES[0]; const s = hs(h.id); const cap = lvCap(s.star);
      const pct = (x) => '+' + Math.round((x - 1) * 100) + '%';
      const lvBtn = s.lv < cap ? `<button class="btn" data-mm="lv:${h.id}:1">Lên cấp <em>${num(lvCost(s.lv))} 🪙</em></button><button class="btn ghost" data-mm="lv:${h.id}:10">Lên tối đa</button>` : '';
      const stBtn = s.star < 5 ? `<button class="btn" data-mm="star:${h.id}">Lên ★${s.star + 1} <em>${STAR_COST[s.star]} mảnh</em></button>` : '';
      const acts = s.own ? lvBtn + stBtn : `<button class="btn" data-mm="unlock:${h.id}">Ghép <em>${UNLOCK} mảnh</em></button><button class="btn" data-mm="unlockg:${h.id}">Mở ngay <em>${num(BUY_HERO)} 💎</em></button>`;
      body.innerHTML = `<div class="mm-grid">${BZ.HEROES.map(heroCard).join('')}</div>
        <div class="mm-detail" style="--hc:${css(h.color)}"><div class="pic">${face(h.id)}</div><div>
          <h3>${h.name} <small style="color:#ffd76a">${'★'.repeat(s.star)}</small></h3><p class="muted">${h.role} · ${s.own ? `cấp ${s.lv}/${cap} (lên sao để mở tới ${MAX_LV})` : 'chưa có'}</p>
          <div class="stats"><span>Lực chiến<b>${num(power(h.id))}</b></span><span>Sát thương<b>${pct(live ? 1 + 0.035 * (s.lv - 1) + 0.12 * s.star + 0.03 * vip() : 1)}</b></span><span>Máu<b>${Math.round(h.hp * (1 + 0.025 * (s.lv - 1) + 0.08 * s.star + 0.02 * vip()))}</b></span><span>Mảnh<b>${s.shard}</b></span></div>
          <p class="muted">Mỗi cấp +3,5% sát thương, +2,5% máu. Mỗi sao +12% sát thương, +8% máu, mở thêm 4 cấp. VIP ${vip()} cộng thêm ${vip() * 3}% sát thương.</p>
          <div class="mm-btns">${acts}</div></div></div>`;
    }
    function renderShop() {
      const v = vip(); const next = VIP[v + 1];
      const pack = (p) => {
        const done = p.once && S.bought[p.id]; const first = p.kind === 'gems' && !S.bought[p.id];
        const cls = p.kind === 'whale' ? 'whale' : p.kind === 'gems' ? '' : 'special';
        const title = p.kind === 'gems' ? `${num(p.gems)}${p.bonus ? ` +${num(p.bonus)}` : ''} 💎` : p.name;
        const icon = p.kind === 'gems' ? (p.gems >= 6000 ? '💎💎💎' : p.gems >= 1000 ? '💎💎' : '💎') : p.kind === 'month' ? '📅' : p.kind === 'whale' ? '👑' : '🎁';
        return `<button class="mm-pack ${cls} ${done ? 'done' : ''}" data-mm="buy:${p.id}">${p.tag ? `<span class="tag">${p.tag}</span>` : ''}${first ? '<span class="x2">x2 LẦN ĐẦU</span>' : ''}<div class="gem">${icon}</div><b>${title}</b><small>${p.desc || ''}${p.kind === 'whale' ? ` (đang chọn: ${HB(sel).name})` : ''}</small><em>${done ? 'Đã mua' : vnd(p.vnd)}</em></button>`;
      };
      body.innerHTML = `<div class="mm-shop"><div class="mm-vip"><b>VIP ${v}</b> · đã nạp giả lập ${vnd(S.spent)}${next ? ` · nạp thêm ${vnd(next - S.spent)} để lên VIP ${v + 1}` : ' · VIP tối đa'}
        <div class="mm-pity"><i style="width:${next ? ((S.spent - VIP[v]) / (next - VIP[v])) * 100 : 100}%"></i></div><small>Mỗi bậc VIP: +3% sát thương, +2% máu cho mọi nhân vật, +20% vàng sau mỗi trận${S.month > day() - 1 ? ` · Thẻ tháng còn ${S.month - day() + 1} ngày` : ''}</small></div>
        <h4>Kim cương</h4><div class="mm-packs">${PACKS.filter((p) => p.kind === 'gems').map(pack).join('')}</div>
        <h4>Gói đặc biệt</h4><div class="mm-packs">${PACKS.filter((p) => p.kind !== 'gems').map(pack).join('')}</div>
        <h4>Đổi vàng</h4><div class="mm-packs">${GOLD_PACKS.map((p) => `<button class="mm-pack special" data-mm="gold:${p.id}"><div class="gem">🪙</div><b>${num(p.gold)} vàng</b><small>dùng để lên cấp nhân vật</small><em>${num(p.gems)} 💎</em></button>`).join('')}</div>
        <p class="muted">Cửa hàng giả lập: bấm mua chỉ cộng số vào tài khoản trong máy này. Không có thanh toán thật.</p></div>`;
    }
    function flashCard(id) { const c = body.querySelector(`[data-hid="${id}"]`); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } }

    let lastWish = 1;
    function reveal(out) {
      const best = out.some((o) => o.tier === 'ssr') ? 'ssr' : out.some((o) => o.tier === 'sr') ? 'sr' : 'r';
      const R = $('#mm-reveal'); R.style.setProperty('--rc', best === 'ssr' ? '#ffcc40' : best === 'sr' ? '#c080ff' : '#6ab0ff');
      $('#mm-rtitle').textContent = best === 'ssr' ? (out.some((o) => o.isNew) ? 'NHÂN VẬT MỚI!' : 'SSR!') : best === 'sr' ? 'Hiếm!' : 'Kết quả triệu hồi';
      const TC = { ssr: '#ffcc40', sr: '#d8a0ff', r: '#8ac8ff', n: '#c8b890' };
      $('#mm-cards').innerHTML = out.map((o, i) => {
        const h = o.id && HB(o.id); const cc = h ? css(h.color) : '#7a6030';
        const inner = o.kind === 'gold' ? `<div class="big">🪙</div><b>${o.n} vàng</b>` : o.kind === 'hero' ? `${face(o.id)}<b>${h.name}</b><small>${h.role}</small>` : `${face(o.id)}<b>${h.name}</b><small>+${o.n} mảnh</small>`;
        return `<div class="mm-card ${o.tier}" style="--d:${0.12 + i * 0.12}s;--cc:${cc};--tc:${TC[o.tier]}"><div class="in"><div class="b">✦</div><div class="f"><span class="t">${RNAME[o.tier]}</span>${o.isNew ? '<span class="new">MỚI</span>' : ''}${inner}</div></div></div>`;
      }).join('');
      R.classList.add('on'); lastWish = out.length;
      if (G.audio) { G.audio.play('switch', { gain: 0.7 }); setTimeout(() => G.audio.play(best === 'ssr' ? 'buy' : 'switch', { gain: 0.8 }), 300 + out.length * 120); }
    }

    // test hooks
    window.__meta = { get S() { return S; }, set S(v) { S = v; save(); }, wish, levelUp, starUp, unlock, grant: (id) => grant(PACKS.find((p) => p.id === id)), dmgMul, hpMul, owns, open, close, tab, live, reset: () => { S = fresh(); save(); } };

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mm]'); if (!b) return;
      const [a, x, y] = b.dataset.mm.split(':');
      G.audio && G.audio.unlock();
      if (a === 'open') return open(x);
      if (a === 'back') return close();
      if (a === 'tab') return tab(x);
      if (a === 'wish') { lastWish = x === '10' ? 10 : 1; return wish(x === '10' ? 10 : 1, x === 'free' ? 'free' : x === 'ticket' ? 'ticket' : 'gems'); }
      if (a === 'hero') { sel = x; G.audio && G.audio.play('switch', { gain: 0.5 }); return render(); }
      if (a === 'lv') return levelUp(x, +y || 1);
      if (a === 'star') return starUp(x);
      if (a === 'unlock') return unlock(x, false);
      if (a === 'unlockg') return unlock(x, true);
      if (a === 'buy') return buy(PACKS.find((p) => p.id === x));
      if (a === 'gold') return buyGold(GOLD_PACKS.find((p) => p.id === x));
      if (a === 'rclose') { $('#mm-reveal').classList.remove('on'); return render(); }
      if (a === 'ragain') { $('#mm-reveal').classList.remove('on'); return wish(lastWish, 'gems'); }
      if (a === 'close') return closeModal();
      if (a === 'lk') return lockedAct(x);
      if (a === 'pay' && modalCb && modalCb('pay')) closeModal();
    });

    G.events.on('player:dead', (e) => {
      if (!live || (G.coop.on && !(e && e.final))) return;
      const l = payout(G.wave ? G.wave.n : 1, G.kills || 0); const el = $('#dead-loot');
      if (el) el.textContent = `+${num(l.gold)} vàng${l.gems ? ` · +${l.gems} 💎` : ''}${vip() ? ` (VIP ${vip()} +${vip() * 20}%)` : ''}`;
    });

    // the pick screen marks heroes not owned yet and says how to get them
    function decorateSelect(i) {
      if (!live) return;
      document.querySelectorAll('#sel-row button').forEach((b, k) => b.classList.toggle('lock', !owns(BZ.HEROES[k].id)));
      const h = BZ.HEROES[i]; const s = hs(h.id);
      let tag = $('#sel-meta'); if (!tag) { tag = document.createElement('span'); tag.id = 'sel-meta'; const n = $('#sel-name'); n && n.parentNode.appendChild(tag); }
      tag.textContent = s.own ? `Lv ${s.lv} ${'★'.repeat(s.star)} · lực chiến ${num(power(h.id))}` : `🔒 chưa có · ${s.shard}/${UNLOCK} mảnh, mở ở Triệu hồi`;
      const go = document.querySelector('[data-act="selgo"]'); if (go) go.textContent = s.own ? 'Vào trận' : 'Mở khoá';
    }
    function lockedPick(id) {
      const h = HB(id); const s = hs(id); sel = id; makePortraits();
      modal(`<h3>${h.name} chưa có</h3><div class="mm-lkpic">${face(id)}</div><p>${s.shard}/${UNLOCK} mảnh · đang có ${num(S.gems)} 💎</p>
        <div class="row" style="flex-wrap:wrap;justify-content:center">${s.shard >= UNLOCK ? '<button class="btn" data-mm="lk:shard">Ghép mảnh</button>' : ''}<button class="btn" data-mm="lk:gems">Mở ${num(BUY_HERO)} 💎</button><button class="btn ghost" data-mm="lk:gacha">Đi triệu hồi</button><button class="btn ghost" data-mm="close">Thôi</button></div>`);
    }
    function lockedAct(x) {
      closeModal();
      if (x === 'gacha') { G.events.emit('meta:leaveSelect'); return open('gacha'); }
      const id = sel; unlock(id, x === 'gems'); $('#mm-reveal').classList.remove('on');
      if (hs(id).own) { const i = BZ.HEROES.findIndex((h) => h.id === id); G.ui.selectRender(i); decorateSelect(i); toast(HB(id).name + ' đã mở khoá'); }
    }

    paintCur();
    return { live, owns, dmgMul, hpMul, decorateSelect, lockedPick, open, payout, get state() { return S; } };
  };
})();
