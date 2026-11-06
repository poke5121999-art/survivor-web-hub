// Khởi động.
//   Lượt lặn:  index.html                       → màn chọn campaign/nhân vật/độ khó → VD.dive.start
//              index.html?campaign=1100&char=100001&diff=Normal&seed=7 → vào thẳng
//   Sân thử combat: index.html?sandbox=1&sectors=1001&char=100001&mons=200011x3,200001x2 (hoặc chỉ ?sectors=…)
(function (VD) {
  'use strict';
  const q = new URLSearchParams(location.search);

  function parseMons(s) {
    const out = [];
    for (const part of (s || '').split(',').filter(Boolean)) {
      const [id, n] = part.split('x');
      for (let i = 0; i < (+n || 1); i++) out.push(+id);
    }
    return out;
  }

  function findFree(x, z, r) {
    for (let rad = 0; rad < 14; rad += 0.5)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a / 16 * 6.283) * rad, pz = z + Math.sin(a / 16 * 6.283) * rad;
        if (!VD.world.overlapsMove(px, pz, r)) return { x: px, z: pz };
      }
    return { x, z };
  }

  let inited = false;
  function initOnce() {
    if (inited) return;
    inited = true;
    const canvas = document.getElementById('view');
    VD.render.init(canvas);
    VD.bindInput(canvas);
    addEventListener('pointerdown', () => VD.audio.unlock());
    addEventListener('keydown', () => VD.audio.unlock());
  }

  async function boot() {
    initOnce();
    if (q.has('sandbox') || q.has('sectors')) return bootSandbox();
    // Luồng game (js/app.js): tiêu đề → prologue → sảnh ⇄ lặn. ?lounge=1 vào thẳng sảnh. ?campaign= / ?menu giữ lối vào lặn trực tiếp.
    if (VD.app && !q.has('campaign') && !q.has('menu')) return VD.app.boot(q);
    return bootDive();
  }

  // ---------------------------------------------------------------- lượt lặn
  // Campaign trong phạm vi bản web (ARCH.md): 1100 tutorial, 1101/1102 cốt truyện, 101–108 thường (Country).
  const CAMPAIGNS = [1100, 1101, 1102, 101, 102, 103, 104, 105, 106, 107, 108];
  const CHARS = [100001, 100003, 100004, 100005];
  const DIFFS = ['Easy', 'Normal', 'Hard', 'Insane'];
  async function bootDive() {
    if (q.has('campaign')) return runDive(+q.get('campaign'), +(q.get('char') || 100001), q.get('diff') || 'Normal', +q.get('seed') || 0);
    showMenu();
  }
  async function runDive(campaignId, characterId, difficulty, seed) {
    // Đồ mang vào mặc định: Item.DefaultCount của đồ tiêu hao (bảng Item) — sảnh sẽ thay bằng túi thật.
    const goods = (VD.T.Item || []).filter(i => i.DefaultCount > 0 && i.GoodsType === 'Consumable').map(i => 'Item:' + i.Id + ':' + i.DefaultCount);
    const res = await VD.dive.start({ campaignId, characterId, difficulty, seed: seed || undefined, inventory: { goods } });
    if (q.has('campaign') && !q.has('menu')) { document.body.dataset.diveDone = '1'; }
    showMenu(res);
    return res;
  }
  function showMenu(last) {
    const T = k => (VD.TEXT && VD.TEXT[k]) || '';
    VD.profile.load();
    let camp = last ? last.campaignId : (VD.profile.cleared(1100) ? 101 : 1100), ch = last ? last.characterId : 100001, diff = last ? last.difficulty : 'Normal';
    const el = document.createElement('div');
    el.className = 'vd-menu';
    const render = () => {
      const p = VD.profile.get();
      el.innerHTML = `<div class="win"><h1>VOID DIVER</h1>
        <label>Campaign</label><div class="row camps">${CAMPAIGNS.map(id => `<button data-c="${id}" class="${id === camp ? 'on' : ''}">${T('TCampaign_Name_' + id) || id}</button>`).join('')}</div>
        <label>${T('UInGameWatchingPanel_KeyGuideText_Desc') || 'Nhân vật'}</label><div class="row chars">${CHARS.map(id => `<button data-h="${id}" class="${id === ch ? 'on' : ''}">${T('TCharacter_Name_' + id) || id}</button>`).join('')}</div>
        <label>${T('EDifficulty_Normal') ? 'Độ khó' : 'Difficulty'}</label><div class="row diffs">${DIFFS.map(d => `<button data-d="${d}" class="${d === diff ? 'on' : ''}">${T('EDifficulty_' + d) || d}</button>`).join('')}</div>
        <button class="go">Lặn</button>
        <div class="meta">Gold ${p.wallet.gold} · Coin ${p.wallet.coin} · EXP ${p.userExp} · kho ${p.stash.length} món${last ? ' · lần trước: ' + (last.escaped ? 'thoát' : 'thất bại') : ''}</div></div>`;
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { camp = +b.dataset.c; render(); });
      el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { ch = +b.dataset.h; render(); });
      el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { diff = b.dataset.d; render(); });
      el.querySelector('.go').onclick = () => { VD.audio.unlock(); el.remove(); runDive(camp, ch, diff, 0); };
    };
    render();
    (document.getElementById('ui') || document.body).appendChild(el);
    document.body.dataset.ready = 'menu';
  }

  // ---------------------------------------------------------------- sân thử combat
  async function bootSandbox() {

    const ids = (q.get('sectors') || '1001').split(',');
    const cols = Math.ceil(Math.sqrt(ids.length));
    const layout = ids.map((id, i) => ({ cx: i % cols, cy: Math.floor(i / cols), id, rot: 0 }));
    await VD.world.load(layout, [cols, Math.ceil(ids.length / cols)], VD.render.scene);

    const S = VD.stage;
    S.begin({ mode: 'dive', difficulty: q.get('diff') || 'Normal', seed: +q.get('seed') || 1 });
    const start = findFree(20, -14, 0.3);
    const pl = S.spawn({ kind: 'char', id: +(q.get('char') || 100001), pos: start, aim: { x: -1, z: -1 } });
    S.setPlayer(pl);
    parseMons(q.has('mons') ? q.get('mons') : '200011x3').forEach((id, i) => {
      const p = findFree(start.x - 3 - (i % 3) * 1.2, start.z - 3 - Math.floor(i / 3) * 1.2, 0.3);
      S.spawn({ kind: 'mon', id, pos: p, aim: { x: 1, z: 1 } });
    });
    VD.render.snap(pl.pos);
    VD.player = pl;
    VD.hud.show(true);

    VD.loop.update = dt => { S.update(dt); if (VD.lua && VD.lua.state) VD.lua.tick(); };
    VD.loop.render = dt => {
      VD.render.follow(pl.pos, dt);
      const face = pl.aim ? Math.atan2(pl.aim.z, pl.aim.x) : 0;
      VD.render.setSight(pl.pos.x, pl.pos.z, face, pl.row.SightAngle || 120, pl.row.SightRange || 5, pl.row.SightBackRange || 1);
      VD.world.updateCutoff(VD.render.camera.position, pl.pos.x, pl.pos.z);
      VD.audio.setListener(pl.pos);
      S.render(dt);
      if (VD.hud && VD.hud.update) VD.hud.update(dt);
      if (VD.postfx) { VD.postfx.update(dt); VD.postfx.params.lowHp = pl.hp < pl.stats.HpMax * 0.3 ? 1 : 0; }
      VD.render.draw(dt, VD.loop.time);
    };
    VD.loop.start();
    const waitVis = () => S.pending > 0 ? new Promise(r => setTimeout(r, 50)).then(waitVis) : null;
    await waitVis();
    document.body.dataset.ready = '1';
  }

  boot().catch(e => {
    console.error(e);
    const el = document.getElementById('fatal');
    if (el) { el.textContent = 'Lỗi khởi động: ' + e.message; el.hidden = false; }
  });
})(window.VD = window.VD || {});
