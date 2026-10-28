// Adventure (mode.adventure): the endless run against the firewall, its page (skills, best-score road, weekly board)
// and its end screen. Loaded when the mode opens (modes.js `launch`). The run itself is js/advrun.js.
// Rules and addresses: README "Phiêu lưu (Adventure)". Data: data/mode-adventure.json + art/adventure.webp
// (tools/build_adventure.py).
import { AdvRun, SKILL_IDS, skillDefs, skillValue, TARGET, BUMPER, ZONE } from './advrun.js';
import { Renderer } from './render.js';
import { PHYS, ST } from './physics.js';
import { Board, positionReward } from './race.js';
import { qty, addQty } from './meta.js';

const ID = 'mode.adventure';
const TOKENS = 'currency.adventure_tokens';
const ROAD = 'progression.adventure_best_score';
const R_WIN = 'leaderboard.adventure_win', R_PLAYED = 'leaderboard.adventure_played';
const R_BEST = 'leaderboard.adventure_best_score', R_LAST = 'leaderboard.adventure_last_score';
const LEVEL = 'progression_adventure_skill_level.'; // AdventureSkillsController.GetSkillLevel [asm 0x1269a84]
const DAY = 86400000, WEEK = 7 * DAY;
const STEP = PHYS.fixedDt;
// Vietnamese labels of the six skills (the original's displayName / description are English)
const SKILL_VI = {
  bounce_difficulty: ['Độ nảy', 'Thêm bumper xanh (giúp), bớt bumper đỏ / cam (khó)'],
  wind_difficulty: ['Gió', 'Thêm gió đẩy lên, bớt gió kéo xuống'],
  hook_difficulty: ['Điểm móc', 'Thêm điểm móc xanh (giúp), bớt điểm móc đỏ / cam / tím (khó)'],
  rope_length: ['Độ dài dây', 'Dây bị giới hạn trong Phiêu lưu: lên cấp để dây dài hơn'],
  teleporter_spawn_chance: ['Cổng dịch chuyển', 'Thêm cổng dịch chuyển, nhảy qua một đoạn đường'],
  firewall_difficulty: ['Tường lửa', 'Tường lửa chậm hơn, tăng tốc chậm hơn'],
};

// [ĐỀ XUẤT] the week (competition "adventure", duration 1 week) starts Monday 00:00 local time; the original takes its
// window from the server (OnlineDateService). Leaderboard.Seed = (int)(low 32 bits of the start ms) / 1000 [asm 0x115642c].
export function weekStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

const CSS = `
#adv, #advEnd { position: fixed; inset: 0; z-index: 4; display: none; align-items: center; justify-content: center;
  background: rgba(0, 30, 55, .8); font: 700 15px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; }
#adv.on, #advEnd.on { display: flex; }
#advEnd { background: rgba(0, 30, 55, .55); }
#advPlay { inset: 0; display: none; z-index: 3; }
#advPlay.on { display: block; }
#advPlay canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#advPlay .btn { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 12px; }
.ac { background: #12314d; border: 4px solid #0d1b2a; border-radius: 22px; width: min(94vw, 540px); max-height: 94vh;
  display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
.ac header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0d1b2a; }
.ac header h2 { flex: 1; margin: 0; font-size: 20px; }
.ac .x { width: 38px; height: 38px; border-radius: 12px; border: 3px solid #fff; background: none; color: #fff;
  font: 900 18px system-ui; cursor: pointer; }
.ac .body { overflow: auto; padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ac .note { font-size: 13px; opacity: .85; }
.ac .msg { background: #ffd23f; color: #0d1b2a; border-radius: 12px; padding: 8px 10px; }
.ac .tok { display: inline-flex; align-items: center; gap: 4px; background: #0d1b2a; border-radius: 99px; padding: 3px 10px; }
.ac h3 { margin: 6px 0 0; font-size: 16px; }
.ac .sk { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; background: #1d4467;
  border-radius: 12px; padding: 7px 10px; }
.ac .sk small { grid-column: 1; opacity: .8; font-weight: 600; font-size: 12px; }
.ac .sk .bar { grid-column: 1; height: 7px; border-radius: 7px; background: #0d1b2a; overflow: hidden; }
.ac .sk .bar i { display: block; height: 100%; background: #7cff8a; }
.ac .sk button { grid-row: 1 / span 3; grid-column: 2; border: 3px solid #0d1b2a; border-radius: 12px; background: #ffd23f;
  color: #0d1b2a; font: 900 14px system-ui; padding: 6px 10px; cursor: pointer; min-width: 84px; }
.ac .sk button:disabled { background: #6b7d90; color: #dfe6ee; cursor: default; }
.ac ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ac li { display: flex; gap: 8px; align-items: center; background: #1d4467; border-radius: 10px; padding: 5px 10px; }
.ac li.me { background: #ffd23f; color: #0d1b2a; }
.ac li b { min-width: 34px; }
.ac li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac .road { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.ac .road div { flex: none; width: 74px; border-radius: 10px; background: #1d4467; padding: 4px; text-align: center; font-size: 12px; }
.ac .road div.got { background: #20c060; }
.ac .road div b { display: block; font-size: 14px; }
.ac .go { border: 4px solid #0d1b2a; border-radius: 18px; font: 900 24px system-ui, sans-serif; color: #0d1b2a;
  background: #ffd23f; box-shadow: 0 5px 0 #0d1b2a; cursor: pointer; padding: 10px; }
.ac .go small { display: block; font-size: 14px; opacity: .75; }
.ac .go.alt { background: #fff; font-size: 18px; }
.ac .row2 { display: flex; gap: 10px; }
.ac .row2 > * { flex: 1; }
.ac .dist { font: 900 40px system-ui, sans-serif; text-align: center; }
`;

let S = null; // {app, data, cfg (board config for race.js Board), img, rects, skills}

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function slot(save) { return (save.modes[ID] = save.modes[ID] || {}); }
export const skillLevel = (save, id) => qty(save, LEVEL + id);

async function load(app) {
  if (S) return S;
  const [data, img] = await Promise.all([
    fetch('./data/mode-adventure.json' + app.V).then((r) => { if (!r.ok) throw new Error('mode-adventure.json ' + r.status); return r.json(); }),
    app.image('./art/adventure.webp'),
  ]);
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  document.body.append(el('<div class="ui overlay" id="adv"></div>'), el('<div class="ui overlay" id="advEnd"></div>'),
    el('<div class="ui overlay" id="advPlay"><canvas></canvas><button class="btn" title="Thoát">✕</button></div>'));
  S = { app, data, img, rects: data.atlas.rects, cfg: data.board, skills: skillDefs(data) };
  return S;
}

// ---- meta: skills, tokens, the weekly board and the best-score road -------------------------------------------------
// GetSkillUpgradeCost [asm 0x126a184]: start + increment * floor(total levels of all skills / 10) [floorf 0x10b9638]
export function upgradeCost(data, save) {
  let total = 0;
  for (const id of SKILL_IDS) total += skillLevel(save, id);
  return data.cost[0] + data.cost[1] * Math.floor(total / 10);
}

// GetSkillUpgradeStatus [asm 0x126a390]: MAXED at GetSkillLevelMax (20 + 80), LOCKED at GetSkillLevelCap = maxLevel +
// the limit-boost card's effect at the owned card level. No card system here: card level 0 -> effect 0 -> cap 20.
export function skillStatus(data, save, id) {
  const s = skillDefs(data)[id], lv = skillLevel(save, id);
  if (lv >= s.top) return 'max';
  return lv >= s.maxLevel ? 'locked' : 'up';
}

export function buySkill(data, save, id) {
  if (skillStatus(data, save, id) !== 'up') return { refused: 'cap' };
  const cost = upgradeCost(data, save);
  if (qty(save, TOKENS) < cost) return { refused: 'tokens', cost };
  addQty(save, TOKENS, -cost);
  addQty(save, LEVEL + id, 1);
  return { cost, level: skillLevel(save, id) };
}

// The week's board, claiming a finished one first (LeaderboardsService.ClaimRewards, as js/race.js): position reward,
// adventure_win +1 when rank <= maxRankToWin, adventure_played +1. A new board resets the best-score road
// (AdventureService.OnLeaderboardCreated -> ResetProgressionRoad [asm 0x1267e24]) and the week's scores.
export function currentBoard(app, now = Date.now()) {
  const { save, meta } = app, st = slot(save), cfg = S.cfg;
  let claimed = null;
  if (st.board && st.board.start + WEEK <= now) {
    const b = new Board(cfg, st.board.start);
    const rank = ranking(b, b.start + WEEK, save).findIndex((r) => r.me);
    const got = [];
    for (const [res, q] of positionReward(cfg, rank)) {
      if (res === 'reward_pool.adventure_skin') {
        // [ĐỀ XUẤT] q unowned pool skins from (played % count), like the tournament's ConvertReward
        const free = cfg.board.pools[res].filter((id) => !meta.ownsRes(save, id));
        for (let i = 0; i < q && free.length; i++) meta.grantReward(save, [free.splice(qty(save, R_PLAYED) % free.length, 1)[0], 1], got);
      } else meta.grantReward(save, [res, q], got);
    }
    if (rank <= cfg.board.maxRankToWin) addQty(save, R_WIN, 1);
    addQty(save, R_PLAYED, 1);
    claimed = { start: st.board.start, rank, got };
    st.board = null;
  }
  if (!st.board) {
    st.board = { start: weekStart(now) };
    for (const r of [R_BEST, R_LAST, ROAD]) delete save.inv[r];
    delete save.claimed[ROAD];
  }
  app.writeSave();
  return { board: new Board(cfg, st.board.start), claimed };
}

// race.js Board scores its AI over one day; this board lasts a week, so time runs 7 times slower
export function ranking(board, now, save) {
  return board.ranking(board.start + (now - board.start) / 7, qty(save, R_WIN), qty(save, R_BEST));
}

// GiveEndGameRewards -> RegisterPendingScore(GetDistance) [asm 0x129f900..0x129f920]: board score (best and last of the
// week), progression.adventure_best_score = the week's best [asm 0x1268124..0x1268174]; ClaimPendingScore: the run's
// metres as adventure tokens [asm 0x12681e8..0x126826c]. [ĐỀ XUẤT] the road's reached steps are claimed right after.
export function endRun(app, distance) {
  const { save, meta } = app, data = S.data;
  save.inv[R_LAST] = distance;
  save.inv[R_BEST] = Math.max(qty(save, R_BEST), distance);
  save.inv[ROAD] = qty(save, R_BEST);
  const got = [];
  if (distance >= 1) addQty(save, TOKENS, distance);
  const done = save.claimed[ROAD] ?? -1;
  for (const [v, rewards] of data.road) {
    if (v <= done || v > save.inv[ROAD]) continue;
    for (const r of rewards) meta.grantReward(save, r, got);
    save.claimed[ROAD] = v;
  }
  slot(save).runs = (slot(save).runs || 0) + 1;
  app.writeSave();
  return { distance, tokens: distance >= 1 ? distance : 0, best: qty(save, R_BEST), got };
}

const fmtTok = (n) => n.toLocaleString('vi-VN');
// several road steps at once: tokens and coins summed, the rest listed once with a count
function groupLabels(got) {
  let tokens = 0, coins = 0;
  const other = new Map();
  for (const g of got) {
    if (g.tokens) tokens += g.tokens;
    else if (g.coins) coins += g.coins;
    else { const l = tokenLabel(g); if (l) other.set(l, (other.get(l) || 0) + 1); }
  }
  const out = [];
  if (tokens) out.push(`+${tokens} xu phiêu lưu`);
  if (coins) out.push(`+${coins} xu`);
  for (const [l, n] of other) out.push(n > 1 ? `${l} ×${n}` : l);
  return out.join(', ');
}
function tokenLabel(g) {
  if (g.tokens) return `+${g.tokens} xu phiêu lưu`;
  if (g.coins) return `+${g.coins} xu`;
  if (g.item) return 'Mở khoá ' + g.item.title;
  if (g.later) return S.app.meta.resTitle(g.later) + ' (sắp có)';
  return '';
}

// ---- the Adventure page (AdventurePage): skills, the road, the week's board, play ------------------------------------
export async function open(app) {
  await load(app);
  for (const o of ['modes', 'start', 'levels', 'advEnd']) if (document.getElementById(o)) app.overlay(o, false);
  stopRun();
  page(app, currentBoard(app));
}

function page(app, { board, claimed }) {
  const { save, meta } = app, data = S.data, now = Date.now();
  const rows = ranking(board, now, save);
  const me = rows.findIndex((r) => r.me);
  const top = rows.slice(0, 10);
  const left = Math.max(0, board.start + WEEK - now);
  const dd = Math.floor(left / DAY), hh = Math.floor(left / 3600000) % 24;
  const cost = upgradeCost(data, save), tokens = qty(save, TOKENS), best = qty(save, R_BEST);
  const next = data.road.find(([v]) => v > (save.claimed[ROAD] ?? -1));
  const box = document.getElementById('adv');
  const skills = SKILL_IDS.map((id) => {
    const s = S.skills[id], lv = skillLevel(save, id), st = skillStatus(data, save, id);
    const v = skillValue(data, s, lv, 0);
    const shown = id === 'rope_length' ? v.toFixed(1) + ' m' : id === 'firewall_difficulty' ? '×' + v.toFixed(2) : Math.round(v * 100) + '%';
    return `<div class="sk" data-id="${id}"><b>${SKILL_VI[id][0]} · cấp ${lv}/${s.maxLevel}</b>
      <small>${SKILL_VI[id][1]} · hiện tại ${shown}</small><div class="bar"><i style="width:${(100 * lv) / s.maxLevel}%"></i></div>
      <button ${st !== 'up' || tokens < cost ? 'disabled' : ''}>${st === 'up' ? `${cost} xu PL` : 'Tối đa'}</button></div>`;
  }).join('');
  const roadCells = data.road.filter(([v]) => v >= (next ? next[0] : 0) - 100).slice(0, 12).map(([v, r]) =>
    `<div class="${v <= (save.claimed[ROAD] ?? -1) ? 'got' : ''}"><b>${v} m</b>${r.map(([res, q]) => res === TOKENS ? q + ' xu PL'
      : res === 'currency.skin_coins' ? q + ' xu' : meta.resTitle(res)).join(', ')}</div>`).join('');
  box.innerHTML = `<div class="ac"><header><h2>Phiêu lưu</h2><span class="tok" title="Xu phiêu lưu">◆ <b>${fmtTok(tokens)}</b></span>
      <button class="x">✕</button></header>
    <div class="body">
      ${claimed ? `<div class="msg">Tuần trước đã đóng: bạn hạng ${claimed.rank + 1}.
        ${groupLabels(claimed.got) || 'Không có thưởng.'}</div>` : ''}
      <button class="go">Chơi<small>Kỷ lục tuần ${best} m · tường lửa đuổi sau lưng</small></button>
      <div class="note">Tuần này còn ${dd} ngày ${hh} giờ · mỗi mét = 1 xu phiêu lưu</div>
      <h3>Kỹ năng</h3>${skills}
      <h3>Đường kỷ lục</h3><div class="road">${roadCells}</div>
      <h3>Bảng tuần · hạng ${me + 1} / ${rows.length}</h3>
      <ol>${top.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><span>${r.name}</span>${r.score} m</li>`).join('')}
        ${me >= 10 ? `<li class="me"><b>${me + 1}</b><span>${rows[me].name}</span>${rows[me].score} m</li>` : ''}</ol>
    </div></div>`;
  box.querySelector('.x').onclick = () => { app.play('popup_out'); app.overlay('adv', false); app.overlay('start', true); app.hud(); };
  box.querySelector('.go').onclick = () => { app.play('button'); startRun(app); };
  for (const b of box.querySelectorAll('.sk button')) {
    b.onclick = () => {
      const id = b.closest('.sk').dataset.id, r = buySkill(data, save, id);
      if (r.refused) { app.toast(r.refused === 'tokens' ? `Cần ${r.cost} xu phiêu lưu` : 'Kỹ năng đã tối đa'); return; }
      app.play('button');
      app.writeSave();
      page(app, currentBoard(app));
    };
  }
  app.overlay('adv', true);
}

// ---- the run: loop, input, drawing --------------------------------------------------------------------------------
let RUN = null; // {app, run, R, cv, hold, raf, last, phase, t, fx}

function stopRun() {
  if (!RUN) return;
  cancelAnimationFrame(RUN.raf);
  RUN.off();
  RUN = null;
}

// opts.seed overrides the week's seed (tests); app may be null once the page has loaded (tests call it directly)
export async function startRun(app, opts = {}) {
  app = app && app.writeSave ? app : S.app;
  await load(app);
  stopRun();
  const { save } = app;
  const { board } = currentBoard(app);
  const levels = {};
  for (const id of SKILL_IDS) levels[id] = skillLevel(save, id);
  const root = document.getElementById('advPlay'), cv = root.querySelector('canvas');
  for (const o of ['adv', 'advEnd', 'start', 'modes', 'levels']) if (document.getElementById(o)) app.overlay(o, false);
  app.overlay('advPlay', true);
  const R = new Renderer(cv, app.atlas.img, app.atlas.rects, app.atlas.fontImg, app.atlas.font);
  R.theme = app.meta.themeFor(ID, 0);
  R.resize();
  const run = new AdvRun(S.data, { seed: opts.seed ?? board.seed, levels, aspect: cv.width / cv.height,
    last: qty(save, R_LAST), best: qty(save, R_BEST) });
  const st = { app, run, R, cv, hold: false, raf: 0, last: 0, phase: 'spawn', t: 0, acc: 0, fx: makeFx(), ended: false };
  const down = (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); st.hold = true; };
  const up = () => { st.hold = false; };
  const kd = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) st.hold = true; } };
  const ku = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') st.hold = false; };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', up);
  root.querySelector('.btn').onclick = () => { app.play('popup_out'); finish(st, true); };
  st.off = () => {
    cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', up);
  };
  RUN = st;
  window.__sh && (window.__sh.adv = st);
  st.raf = requestAnimationFrame((t) => frame(st, t));
  return st;
}

function frame(st, now) {
  st.raf = requestAnimationFrame((t) => frame(st, t));
  const { run, R, cv } = st;
  R.resize();
  run.aspect = cv.width / cv.height;
  let dt = Math.min(0.1, (now - (st.last || now)) / 1000);
  st.last = now;
  if (st.paused) dt = 0;
  st.t += dt;
  if (st.phase === 'spawn' && st.t >= PHYS.timeToSpawn) { st.phase = 'play'; st.t = 0; }
  if (st.phase === 'play') {
    st.acc += dt;
    while (st.acc >= STEP) {
      st.acc -= STEP;
      run.fixed(STEP, st.hold);
      if (run.dead) break;
    }
    run.update(dt);
    if (run.dead && !st.ended) finish(st);
  } else if (st.phase === 'dead') {
    run.update(0);
  }
  if (run.events.length > 20) run.events.splice(0, run.events.length - 20);
  stepFx(st, dt);
  draw(st, now / 1000);
}

// KillPlayer -> CompleteLevel / FinishLevel [asm 0x12a0f94, 0x12a0fd8]: one life, the run ends and pays out
function finish(st, quit = false) {
  if (st.ended) return;
  st.ended = true;
  st.phase = 'dead';
  const { app, run } = st;
  const res = endRun(app, run.distance);
  st.result = res;
  app.play('popup_in');
  setTimeout(() => endScreen(st, quit), quit ? 0 : 700);
}

function endScreen(st, quit) {
  const { app } = st, r = st.result;
  const why = st.run.dead?.why === 'fire' ? 'Tường lửa bắt kịp bạn' : st.run.dead ? 'Bạn rơi khỏi màn hình' : 'Bạn đã dừng chuyến đi';
  const box = document.getElementById('advEnd');
  box.innerHTML = `<div class="ac"><header><h2>Kết thúc chuyến phiêu lưu</h2></header><div class="body">
    <div class="dist">${r.distance} m</div>
    <div class="note" style="text-align:center">${why} · kỷ lục tuần ${r.best} m</div>
    <div class="msg">+${r.tokens} xu phiêu lưu${r.got.length ? ' · Đường kỷ lục: ' + groupLabels(r.got) : ''}</div>
    <div class="row2"><button class="go alt" data-act="page">Kỹ năng</button><button class="go" data-act="again">Chơi lại</button></div>
  </div></div>`;
  box.querySelector('[data-act="page"]').onclick = () => { app.play('button'); stopRun(); app.overlay('advPlay', false); open(app); };
  box.querySelector('[data-act="again"]').onclick = () => { app.play('button'); startRun(app); };
  app.overlay('advEnd', true);
  if (quit) { /* the quit button leaves to the end screen at once */ }
}

// ---- drawing ------------------------------------------------------------------------------------------------------
const BUMP = {
  [BUMPER.NORMAL]: 'AN_Grap1_BumperLarge000', [BUMPER.SAME]: 'AN_Grap1_BumperLarge000', [BUMPER.ONE_TIME]: 'AN_Grap1_RedBumperLarge000',
  [BUMPER.LOW]: 'AN_Grap1_RedBumperLarge000', [BUMPER.HIGH]: 'AN_Grap1_GoldenBumperLarge000',
};
const THEMED = { 1: 'targets', 2: 'walls' };

function advSprite(R, name, m, opts) {
  const r = S.rects[name];
  if (r) R.spriteFrom(S.img, name, r, m, opts);
}
function anySprite(R, name, m, opts) {
  if (S.rects[name]) advSprite(R, name, m, opts); else R.sprite(name, m, opts);
}

// pattern draw items in sorting order, shadows first on ties (main.js layers)
function layers(p) {
  if (p.layers) return p.layers;
  const out = [];
  p.draw.forEach((d, i) => {
    if (d.sh) out.push({ d, shadow: true, o: d.o + (d.sh[2] || 0), i });
    out.push({ d, shadow: false, o: d.o, i });
  });
  return (p.layers = out.sort((a, b) => a.o - b.o || b.shadow - a.shadow || a.i - b.i));
}

function draw(st, t) {
  const { run, R } = st, cam = run.cam, p = run.player;
  R.begin(cam);
  const halfW = (st.cv.width / st.cv.height) * cam.zoom + 3;
  const vis = (x) => Math.abs(x - cam.x) < halfW + 14;
  // gravity zones: CircleGlow 10 x 30, UP white additive alpha .09, DOWN purple alpha .235 (prefab render groups)
  for (const s of run.spawned) {
    const z = s.zone;
    if (!z || !z.shown || !vis(z.x)) continue;
    const g = run.cfg.gz.size;
    const up = z.type === ZONE.UP;
    glow(R, 'CircleGlow', z.x, z.y, g[0], g[1], up ? [1, 1, 1] : [0.348, 0.205, 0.594], up ? 0.09 : 0.235, up);
  }
  // zone particles: UP 'glow' additive (0.854, 1, 0.855, 0.404); DOWN 'glow 1' alpha blended, colour (0.144, 0.034, 0.217,
  // 0.404) x 2 x tint (1, 0.854, 0.854, 0.5); alpha over lifetime 0 -> 1 (0.197) -> 1 (0.768) -> 0
  for (const q of st.fx.zone) {
    if (!vis(q.x)) continue;
    const a = 0.404 * lerpKeys([[0, 0], [0.197, 1], [0.768, 1], [1, 0]], q.life / q.max);
    if (q.up) glow(R, 'tex:glow', q.x, q.y, q.s, q.s, [0.854, 1, 0.855], a, true);
    else glow(R, 'tex:glow_1', q.x, q.y, q.s, q.s, [0.288, 0.058, 0.371], a, false);
  }
  drawFireBack(st);
  // pattern sprites (walls)
  for (const s of run.spawned) {
    if (s.endX < cam.x - halfW - 2 || s.ox > cam.x + halfW + 2) continue;
    for (const { d, shadow } of layers(S.data.patterns[s.name])) {
      const m = [d.m[0], d.m[1], d.m[2], d.m[3], d.m[4] + s.ox, d.m[5] + s.oy];
      if (shadow) {
        const sm = [m[0], m[1], m[2], m[3], m[4] + d.sh[0], m[5] + d.sh[1]];
        if (d.size) R.tiled(d.s, sm, d.size, true); else R.sprite(d.s, sm, { shadow: true });
        continue;
      }
      if (d.size) R.tiled(d.s, m, d.size, d.shadow);
      else R.sprite(d.s, m, { tint: d.th ? R.theme[THEMED[d.th]] : d.tint, shadow: d.shadow });
    }
  }
  drawScoreLines(st);
  // bumpers: SpriteShadow (0, -0.1), order 0 / shadow -10
  for (const pass of [true, false]) {
    for (const s of run.spawned) for (const b of s.bumpers) {
      if (b.gone || !vis(b.m[4])) continue;
      const k = b.shrink >= 0 ? Math.max(0, 1 - b.shrink / 0.1) : 1;
      let m = [b.m[0] * k, b.m[1] * k, b.m[2] * k, b.m[3] * k, b.m[4], b.m[5]];
      const frame = b.anim >= 0 ? 1 + Math.min(4, Math.floor(b.anim * 30)) : 5;
      let name = BUMP[b.type] + frame + (b.type === BUMPER.LOW ? '_Low' : '');
      if (b.type === BUMPER.ONE_TIME) m = [m[0], m[1], m[2], m[3], m[4] + glitch(t, b.m[4]) * 0.03, m[5]]; // [ĐỀ XUẤT] MAT_BrokenBump glitch / shake
      if (pass) anySprite(R, name, [m[0], m[1], m[2], m[3], m[4], m[5] - 0.1], { shadow: true });
      else anySprite(R, name, m);
    }
  }
  drawTargets(st, t);
  drawPortals(st, t);
  drawPlayer(st);
  drawFireFront(st);
  // HUD: AdventureInGamePage distanceText "{0}m"
  const w = st.cv.width / R.dpr;
  R.text(run.distance + 'm', w / 2, 40, 38);
  if (run.lines.best) R.text('best ' + run.lines.best + 'm', w / 2, 76, 20, 0.5, 0.85);
}

function glitch(t, seed) { const k = Math.floor(t * 12 + seed * 7); return ((k * 2654435761) % 1000) / 1000 > 0.85 ? Math.sin(k) : 0; }

// a sprite of the Adventure atlas stretched to w x h world units, tinted, additive or alpha
function glow(R, name, x, y, w, h, col, alpha, add, rot = 0) {
  const r = S.rects[name];
  if (!r) return;
  const c = tinted(name, col);
  const sx = w / (r[2] / r[6]), sy = h / (r[3] / r[6]), cs = Math.cos(rot), sn = Math.sin(rot);
  R.setWorld([cs * sx, sn * sx, -sn * sy, cs * sy, x, y]);
  R.ctx.globalAlpha = alpha;
  R.ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  R.ctx.transform(1 / r[6], 0, 0, -1 / r[6], 0, 0);
  R.ctx.drawImage(c, -r[2] / 2, -r[3] / 2);
  R.ctx.globalCompositeOperation = 'source-over';
  R.ctx.globalAlpha = 1;
}

const TINTS = new Map();
function tinted(name, col) {
  const key = name + col.join(',');
  let c = TINTS.get(key);
  if (c) return c;
  const r = S.rects[name];
  c = document.createElement('canvas');
  c.width = r[2]; c.height = r[3];
  const g = c.getContext('2d');
  g.drawImage(S.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
  g.fillRect(0, 0, r[2], r[3]);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(S.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
  TINTS.set(key, c);
  return c;
}

// TargetAdventure render groups: Default / Close / Hooked per type; root scale 0.5, SpriteShadow (0, -0.1)
function targetSprites(t, hooked) {
  switch (t.type) {
    case TARGET.ONE_TIME: return [hooked ? 'Target_OneTime_Hooked' : 'Target_OneTime'];
    case TARGET.TIMED: return ['Chrono_Base', 'Chrono_Spire', 'Chrono_Top'];
    case TARGET.MOVING: return [(t.dir >= 2 ? 'Target_MoovingUp_' : 'Target_Mooving_') + (hooked ? 'Hooked' : 'Hook')];
    case TARGET.SPINNING: return [hooked ? 'HookedRotate' : 'HookRotate'];
    default: return [hooked ? 'Target_Default_Hooked' : 'Target_Default'];
  }
}

function drawTargets(st, t) {
  const { run, R } = st, p = run.player, w = run.world;
  const hookedT = p.hooked >= 0 ? w.targets[p.hooked] : null, closeT = p.closest >= 0 && p.hooked < 0 ? w.targets[p.closest] : null;
  const half = (st.cv.width / st.cv.height) * run.cam.zoom + 4;
  for (const pass of [true, false]) {
    for (const s of run.spawned) for (const tg of s.targets) {
      if (tg.gone || Math.abs(tg.x - run.cam.x) > half) continue;
      const k = 0.5 * (tg.shrink >= 0 ? Math.max(0, 1 - tg.shrink / 0.1) : 1);
      const names = targetSprites(tg, tg === hookedT);
      const rot = tg.type === TARGET.SPINNING ? (tg.rot * Math.PI) / 180 : 0;
      const jit = tg.type === TARGET.ONE_TIME ? glitch(t, tg.x0) * 0.04 : 0;
      names.forEach((n, i) => {
        let a = rot;
        // [ĐỀ XUẤT] ANIM_Chrono: the spire turns once over the timer (animator speed 3 / timerDuration over a 3 s clip)
        if (n === 'Chrono_Spire') a = tg.once ? -2 * Math.PI * Math.min(1, 1 - tg.timer / run.cfg.target.timer) : 0;
        const c = Math.cos(a) * k, sn = Math.sin(a) * k;
        let x = tg.x + jit, y = tg.y;
        if (n === 'Chrono_Top') y += 0.58 * k;
        const m = [c, sn, -sn, c, x, y];
        if (pass) { if (i === 0) advSprite(R, n, [m[0], m[1], m[2], m[3], x, y - 0.1], { shadow: true }); }
        else advSprite(R, n, m);
      });
      if (!pass && tg.type === TARGET.SPINNING) {
        // PowerupGlow1 (glow2, green) [ĐỀ XUẤT] as a steady glow
        glow(R, 'tex:glow2', tg.x, tg.y, 1.6, 1.6, [0.27, 1, 0], 0.55, true);
      }
      if (!pass && tg === closeT) {
        const sc = 0.6 * (1 + 0.05 * Math.sin(t * 12));
        R.sprite('A_PlotNearestFeedback', [sc, 0, 0, sc, tg.x, tg.y]);
      }
    }
  }
}

function drawScoreLines(st) {
  const { run, R } = st;
  // ScoreLine at x = score (Instantiate at (score, 0)) [asm 0x129f0c8, 0x129f1ac]: Square 0.14 x 45 lines above and below
  // a gap for the "Last Score : " / "Best Score : " labels
  const lines = [];
  if (run.lines.last >= 1 && run.lines.last !== run.lines.best) lines.push([run.lines.last, 'last score']);
  if (run.lines.best >= 1) lines.push([run.lines.best, 'best score']);
  for (const [x, label] of lines) {
    if (Math.abs(x - run.cam.x) > 12) continue;
    R.setWorld([1, 0, 0, 1, 0, 0]);
    R.ctx.globalAlpha = 0.353;
    R.ctx.fillStyle = '#fff';
    R.ctx.fillRect(x - 0.07, 1.7, 0.14, 45);
    R.ctx.fillRect(x - 0.07, -45.3, 0.14, 45);
    R.ctx.globalAlpha = 1;
    const v = R.viewMatrix();
    const sx = (v[0] * x + v[4]) / R.dpr, sy = (v[3] * 0.7 + v[5]) / R.dpr;
    R.text(label + ' : ' + x + 'm', sx, sy, 15, 0.5, 0.9);
  }
}

function drawPlayer(st) {
  const { run, R, app } = st, p = run.player, look = app.look;
  // RangeIndicator: Circle radius = ropeLength, (0.25, 1, 0.31) alpha .118, follows the player [asm 0x11ffef0]
  if (run.rope > 0 && st.phase !== 'spawn') {
    R.setWorld([1, 0, 0, 1, 0, 0]);
    R.ctx.globalAlpha = 0.118;
    R.ctx.fillStyle = 'rgb(64,255,80)';
    R.ctx.beginPath(); R.ctx.arc(p.x, p.y, run.rope, 0, 2 * Math.PI); R.ctx.fill();
    R.ctx.globalAlpha = 1;
  }
  if (st.phase === 'spawn') {
    const k = st.t / PHYS.timeToSpawn, s = 0.15 + k * 0.5;
    R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, run.spawn.x, run.spawn.y], { alpha: 1 - k });
    return;
  }
  if (run.dead && st.phase === 'dead' && run.dead.why === 'fire') return;
  if (p.hooked >= 0) {
    const tg = run.world.targets[p.hooked], a = p.anchor();
    if (look.rope) R.rope(look.rope.img, look.rope.rect, tg.x, tg.y, a.x, a.y, look.rope.width, look.rope.period);
    else R.line(a.x, a.y, tg.x, tg.y, 0.045, '#0d1b2a');
  }
  const sk = look.skin;
  let sheet = null, name;
  if (sk) { const f = sk.states[p.state] || sk.states[ST.FALL]; name = f.length > 1 ? f[Math.floor((p.time - p.stateTime) * 15) % f.length] : f[0]; sheet = sk; }
  else name = p.frame();
  const s = 0.3 * p.scale(), fx = p.flipX ? -1 : 1, c = Math.cos(p.angle) * s, sn = Math.sin(p.angle) * s;
  const m = [c * fx, sn * fx, -sn, c, p.x, p.y], sm = [m[0], m[1], m[2], m[3], p.x, p.y - 0.1];
  const alpha = p.alpha;
  if (!sheet) { R.sprite(name, sm, { shadow: true, alpha }); R.sprite(name, m, { alpha }); return; }
  const [img, r] = sheet.frames[name];
  if (!app.meta.byId.get(sheet.id).noShadow) R.spriteFrom(img, name, r, sm, { shadow: true, alpha });
  R.spriteFrom(img, name, r, m, { alpha });
}

// ---- particles (simplified [ĐỀ XUẤT]: emission rates, lifetimes, sizes and colours from the prefabs' ParticleSystems;
// spawn shapes flattened to 2D, no Light) -----------------------------------------------------------------------------
function makeFx() { return { fire: [], sparks: [], field: [], zone: [], portal: new Map(), rnd: mulberry(7), acc: { fire: 0, sparks: 0, field: 0 }, zacc: new WeakMap() }; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIRE_COL = [[0.282, [1, 0.931, 0]], [0.538, [1, 0.761, 0]], [0.788, [1, 0.491, 0]]];
const FIRE_A = [[0, 0], [0.268, 1], [0.756, 0.69], [1, 0]];
function lerpKeys(keys, k) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) {
    const [a, va] = keys[i - 1], [b, vb] = keys[i], u = (k - a) / (b - a || 1);
    return Array.isArray(va) ? va.map((v, j) => v + (vb[j] - v) * u) : va + (vb - va) * u;
  }
  return keys[keys.length - 1][1];
}

function stepFx(st, dt) {
  const fx = st.fx, f = st.run.fire, rnd = fx.rnd;
  const emit = (list, key, rate, make) => {
    fx.acc[key] += dt * rate;
    while (fx.acc[key] >= 1) { fx.acc[key] -= 1; list.push(make()); }
  };
  // Firewall/Particles: box 0.5 x 12 at local x -1, 500/s, life 0.5, size 4 -> 0, 2x2 sheet, local simulation
  emit(fx.fire, 'fire', 500, () => ({ x: -1 + (rnd() - 0.5) * 0.5, y: (rnd() - 0.5) * 12, a: 0.5236 + rnd() * 0.5236, life: 0, max: 0.5, q: Math.floor(rnd() * 4) }));
  // Sparks: child of Particles at (1.3, -0.36) -> firewall x + 0.3; box height 7.89, 50/s, life 0.5..1, size 0.1, rising
  // (gravity -0.2), world simulation. The box shape shoots along +Z (speed 0.5..2), invisible from the 2D camera; the
  // drift to the right is [ĐỀ XUẤT].
  emit(fx.sparks, 'sparks', 50, () => ({ x: f.x + 0.3, y: -0.36 + (rnd() - 0.5) * 7.89, vx: 0.5 + rnd() * 1.5, vy: 0, life: 0, max: 0.5 + rnd() * 0.5 }));
  // FireFieldRed: child of Particles at (-0.44, -0.36) -> firewall x - 1.44; height 16.46 x 1.6, 12/s, life 0.35, size
  // 2.5..3 x scale, rising (gravity -1)
  emit(fx.field, 'field', 12, () => ({ x: f.x - 1.44, y: -0.36 + (rnd() - 0.5) * 26.3, vy: 0, life: 0, max: 0.35, s: (2.5 + rnd() * 0.5) * 2.7 }));
  // GravityZone ParticleSystem: Circle shape r 1.39 scaled (5, 15), 47.12/s, life 0.5, size 0.1..0.4, velocity over
  // lifetime x 3..6; UP: gravity -0.44 (rises), DOWN: gravity +0.44 and the system turned -160 degrees (left and down)
  const halfW = (st.cv.width / st.cv.height) * st.run.cam.zoom + 8;
  for (const s of st.run.spawned) {
    const z = s.zone;
    if (!z || !z.shown || Math.abs(z.x - st.run.cam.x) > halfW) continue;
    let a = (fx.zacc.get(z) || 0) + dt * 47.1239;
    const up = z.type === ZONE.UP, rot = up ? 0 : (-160 * Math.PI) / 180;
    while (a >= 1) {
      a -= 1;
      const ang = rnd() * 2 * Math.PI, r = Math.sqrt(rnd()) * 1.39, sp = 3 + rnd() * 3;
      const lx = Math.cos(ang) * r * 5, ly = Math.sin(ang) * r * 15;
      fx.zone.push({ z, up, x: z.x + lx * Math.cos(rot) - ly * Math.sin(rot), y: z.y + lx * Math.sin(rot) + ly * Math.cos(rot),
        vx: Math.cos(rot) * sp, vy0: Math.sin(rot) * sp, g: 0, life: 0, max: 0.5, s: 0.1 + rnd() * 0.3 });
    }
    fx.zacc.set(z, a);
  }
  for (const q of fx.zone) {
    q.life += dt;
    q.g += (q.up ? 0.44 : -0.44) * 9.81 * dt;
    q.x += q.vx * dt; q.y += (q.vy0 + q.g) * dt;
  }
  for (const list of [fx.fire, fx.sparks, fx.field, fx.zone]) {
    for (const q of list) {
      if (list === fx.zone) continue;
      q.life += dt;
      if (q.vx) q.x += q.vx * dt;
      if (list === fx.sparks) { q.vy += 0.2 * 9.81 * dt; q.y += q.vy * dt; }
      if (list === fx.field) { q.vy += 9.81 * dt; q.y += q.vy * dt; }
    }
    let n = 0;
    for (const q of list) if (q.life < q.max) list[n++] = q;
    list.length = n;
  }
}

function fireSheet(q, col) {
  // 'Texture' is a 2x2 sheet; one tinted copy of each quarter per colour key
  const key = 'fire' + q + col.join(',');
  let c = TINTS.get(key);
  if (c) return c;
  const r = S.rects['tex:Texture'], h = r[2] / 2;
  c = document.createElement('canvas'); c.width = h; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(S.img, r[0] + (q % 2) * h, r[1] + (q >> 1) * h, h, h, 0, 0, h, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
  g.fillRect(0, 0, h, h);
  TINTS.set(key, c);
  return c;
}

function drawFireBack(st) {
  const { run, R } = st, f = run.fire;
  if (Math.abs(f.x - run.cam.x) > 25) return;
  // FireFieldRed (fx_glow, additive, alpha .098, yellow -> red)
  for (const q of st.fx.field) {
    const k = q.life / q.max, a = 0.098 * lerpKeys([[0, 0], [0.248, 1], [1, 0]], k) * 2;
    glow(R, 'tex:fx_glow', q.x, q.y, q.s, q.s, lerpKeys([[0.255, [1, 0.919, 0]], [1, [1, 0, 0]]], k), a, true);
  }
  // Fire: A_FinishLight, (0.981, 0.325, 0) alpha .569, additive, rotated -90, (6.78, 3.77) at (1.086, -0.36)
  R.setWorld([0, -6.784, 3.77, 0, f.x + 1.086, -0.36]);
  const r = R.rects.A_FinishLight;
  if (r) {
    const c = R.variant('A_FinishLight', [0.981, 0.325, 0], false);
    R.ctx.globalAlpha = 0.569;
    R.ctx.globalCompositeOperation = 'lighter';
    R.ctx.transform(1 / r[6], 0, 0, -1 / r[6], 0, 0);
    R.ctx.drawImage(c, -r[4], -r[5]);
    R.ctx.globalCompositeOperation = 'source-over';
    R.ctx.globalAlpha = 1;
  }
}

function drawFireFront(st) {
  const { run, R } = st, f = run.fire;
  if (Math.abs(f.x - run.cam.x) > 25) return;
  // the fire column: alpha blended 'Texture' quarters, size 4 -> 0, colour and alpha over lifetime
  for (const q of st.fx.fire) {
    const k = q.life / q.max, size = 4 * (1 - k), a = lerpKeys(FIRE_A, k);
    if (size <= 0 || a <= 0) continue;
    const col = lerpKeys(FIRE_COL, Math.round(k * 16) / 16).map((v) => Math.round(v * 32) / 32); // blended gradient, quantised for the tint cache
    const c = fireSheet(q.q, col), cs = Math.cos(q.a) * size, sn = Math.sin(q.a) * size;
    R.setWorld([cs, sn, -sn, cs, f.x + q.x, q.y]);
    R.ctx.globalAlpha = a;
    R.ctx.drawImage(c, -0.5, -0.5, 1, 1);
  }
  R.ctx.globalAlpha = 1;
  // Sparks: glow, additive, (1, .733, 0)
  for (const q of st.fx.sparks) {
    const k = q.life / q.max, s = 0.1 * 2.5 * (k < 0.476 ? 1 : 1 - (k - 0.476) / 0.524);
    glow(R, 'tex:glow', q.x, q.y, s, s, [1, 0.733, 0], lerpKeys([[0, 0], [0.224, 1], [0.835, 1], [1, 0]], k), true);
  }
}

// Portal: FX_SimplePortalBlue (ring, additive cyan), CenterDark (glow 1, dark blue), EdgeGlow and Particles (cyan dots on
// the rim) [ĐỀ XUẤT] drawn as a few steady layers; the exit is the same picture. Closing (Portal_Close, 0.25 s) shrinks it.
function drawPortals(st, t) {
  const { run, R } = st;
  const draw1 = (x, y, k) => {
    if (k <= 0) return;
    glow(R, 'tex:glow_1', x, y, 2.2 * k, 3 * k, [0.144, 0.144, 0.396], 0.85, false);
    glow(R, 'tex:ring', x, y, 1.5 * k, 2.1 * k, [0, 1, 1], 0.9, true);
    glow(R, 'tex:glow', x, y, 1.4 * k, 2 * k, [0, 0.871, 1], 0.45, true);
    for (let i = 0; i < 10; i++) {
      const a = t * 1.7 + (i * Math.PI * 2) / 10;
      glow(R, 'tex:glow', x + Math.cos(a) * 0.45 * k, y + Math.sin(a) * 0.95 * k, 0.25, 0.25, [0, 1, 1], 0.8, true);
    }
  };
  for (const s of run.spawned) {
    const o = s.portal;
    if (!o || Math.abs(o.x - run.cam.x) > 14) continue;
    draw1(o.x, o.y, o.killed < 0 ? 1 : 1 - o.killed / 0.25);
  }
  const p = run.player;
  for (const e of run.events) {
    if (e.type !== 'tele') continue;
    const age = run.time - e.t + (p.tele ? 0 : 0);
    const k = p.tele && p.tele.end.t === e.t ? 1 : Math.max(0, 1 - Math.max(0, age - 0.5) / 0.25);
    draw1(e.x, e.y, k);
  }
}
