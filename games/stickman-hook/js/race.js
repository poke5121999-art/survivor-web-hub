// Race (mode.tournament): the player against 4 recorded ghosts on one of the 21 Tournament maps, plus the daily
// leaderboard of trophies. Loaded when the mode opens; main.js runs the race itself (Normal physics) through the
// controller this module hands to app.startRace. Rules with their asm addresses: README "Đua (Tournament)".
// Data: data/mode-race.json (maps + `race` config, tools/build_data.py), data/race/<map>.json (ghosts) and
// art/race.webp + data/race/art.json (start markers, trophy; tools/build_race.py).
import { NetRandom } from './level.js';
import { PHYS } from './physics.js';
import { qty, addQty } from './meta.js';
import { dayKey, playState as dailyState, payPlay } from './daily.js';
import { artPage, spr, slice, glText, U } from './uikit.js';

const ID = 'mode.tournament';
const COINS = [10, 7, 5, 3, 1]; // TournamentService.SkinCoinsPerPosition (.cctor 0x11910c8, metadata 0x6cb420)
const TROPHIES = [10, 5, 3, 2, 1]; // TrophiesPerPosition (metadata 0x6d20b8)
const COUNT = ['3', '2', '1', 'GO']; // AnimateStartingUI: "3", then 2, 1, GO every 500 ms [asm 0x1220e98..0x122102c]
const STEP_S = 0.5;
const DAY = 86400000;
const R_TROPHIES = 'progression.race_trophies', R_WIN = 'leaderboard.tournament_win';
const R_PLAYED = 'leaderboard.tournament_played', R_BEST = 'leaderboard.tournament_best_score';
const R_LAST = 'leaderboard.tournament_last_score';
const FREE_PER_DAY = 2; // game_modes.modes[mode.tournament].maxFreeGamesPerDay
const ME = 'Bạn';
// Ghostable2D.alternativeMaterials = GhostMaterial (Sprites/Default, _Color alpha 0.396): replays are see-through, and
// a replay has only the body and rope tracks, so no shadow. Rope: AAL_square_mini at scale x 0.06 (records), 0.345 wide
// if square like its length unit.
const GHOST_ALPHA = 0.396, GHOST_ROPE = 0.06 * 0.345;

// day id: FormatDateId = "yyyy-MM-dd" [asm 0x2e7b9ec] (daily.js dayKey); [ĐỀ XUẤT] local clock, the original asks the server
const dayId = dayKey;
const midnight = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
// System.Random.Next(min, max): (int)(Sample() * (max - min)) + min
const range = (rng, a, b) => a + Math.floor(rng.sample() * (b - a));
const fmt = (s) => s.toFixed(2).replace('.', ',') + ' s';

// ---- daily leaderboard (LeaderboardsService / Leaderboard, competition "tournament") --------------------------------
// Easings.Interpolate, AHEasing [asm 0x2e8f710..0x2e8f7d4]; GenerateScore maps rng.Next(0, 7) through a table that
// lists SINE_OUT twice [asm 0x813404].
const EASE = [
  (p) => p, (p) => Math.sin((p - 1) * Math.PI / 2) + 1, (p) => Math.sin(p * Math.PI / 2), (p) => Math.sin(p * Math.PI / 2),
  (p) => 1 - Math.sqrt(1 - p * p), (p) => Math.sqrt((2 - p) * p),
  (p) => (p < 0.5 ? 0.5 * (1 - Math.sqrt(1 - 4 * p * p)) : 0.5 * (Math.sqrt(-(2 * p - 3) * (2 * p - 1)) + 1)),
];

export class Board {
  constructor(cfg, start) {
    this.cfg = cfg;
    this.start = start; // midnight of the board's day; DurationMs = 1 day
    // get_Seed: (int)(low 32 bits of StartTimestampMs) / 1000 [asm 0x115642c]
    this.seed = Math.trunc((start | 0) / 1000);
    // TryInitialize: 9 AI profiles from System.Random(seed) [asm 0x11568ec, 0x115692c]. Per profile:
    // Next(0, 100) <= 20 -> "Player" + Next(0, 999999):000000 cut to 10 chars, else playerNames[Next]; then a skin.
    const rng = new NetRandom(this.seed), n = cfg.board.participants - 1;
    this.ai = [];
    for (let i = 0; i < n; i++) {
      const name = cfg.nameChance >= range(rng, 0, 100)
        ? (cfg.namePrefix + String(range(rng, 0, 999999)).padStart(6, '0')).slice(0, cfg.nameMax)
        : cfg.names[range(rng, 0, cfg.names.length)];
      this.ai.push({ name, skin: cfg.skins[range(rng, 0, cfg.skins.length)] });
    }
  }

  // GetRankedProfiles: a fresh System.Random(seed) per call; difficulty = aiDifficulties[min(wins, n - 1)]; AI i gets
  // GenerateScore(i, p) with p = elapsed / duration [asm 0x12b94c8..0x12b96e4]; the player (score = best trophies of
  // the day) comes after the 9 AIs and the list sorts by score, descending and stable [asm 0x12b97f4, 0x1154ebc].
  ranking(now, wins, playerScore) {
    const p = Math.min(1, Math.max(0, (now - this.start) / DAY));
    const segs = this.cfg.board.ai[Math.min(wins, this.cfg.board.ai.length - 1)];
    const rng = new NetRandom(this.seed);
    const rows = this.ai.map((a, i) => {
      const ease = EASE[range(rng, 0, 7)];
      const s = segs.find(([hi, lo]) => hi <= i && i <= lo);
      // GenerateScore [asm 0x12b9ae4]: target = Next(min, max) (max exclusive), score = (int)(start + ease(p) * (target - start))
      const score = s ? Math.trunc(s[2] + ease(p) * (range(rng, s[3], s[4]) - s[2])) : range(rng, 10, 100);
      return { name: a.name, skin: a.skin, score };
    });
    rows.push({ name: ME, me: true, score: playerScore });
    return rows.map((r, i) => [r, i]).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).map((x) => x[0]);
  }
}

// GetPositionReward [asm 0x12ba320]: an exact entry, else every quantity interpolated between the entries around the
// position (rounded half to even), nothing past the last entry.
export function positionReward(cfg, pos) {
  const list = cfg.board.rewards;
  const lo = [...list].reverse().find(([p]) => p <= pos), hi = list.find(([p]) => p >= pos);
  if (!lo || !hi) return [];
  if (lo[0] === hi[0]) return lo[1];
  const k = (pos - lo[0]) / (hi[0] - lo[0]);
  return lo[1].map(([res, q]) => {
    const h = hi[1].find(([r]) => r === res);
    const v = q + ((h ? h[1] : 0) - q) * k, f = Math.floor(v);
    return [res, v - f === 0.5 ? (f % 2 ? f + 1 : f) : Math.round(v)];
  });
}

// ---- ghosts (GhostTool2D replays of the 505 TournamentGamePlaySettings._saves) ----------------------------------------
function unpack(g, hz) {
  const len = g.x.length, x = new Float32Array(len), y = new Float32Array(len), r = new Float32Array(len);
  let ax = 0, ay = 0, ar = 0;
  for (let i = 0; i < len; i++) { ax += g.x[i]; ay += g.y[i]; ar += g.r[i]; x[i] = ax / 100; y[i] = ay / 100; r[i] = ar; }
  const hid = new Uint8Array(len);
  for (const [a, b] of g.hid || []) hid.fill(1, a, b + 1);
  return { ...g, hz, len, x, y, r, hid, sec: g.ms / 1000 }; // n stays the save name
}

// Catmull-Rom through the 10 Hz samples (straight lines next to a hidden sample)
function cr(a, b, c, d, u) {
  return b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
}

// Pose of ghost `g` at record time t (t = 0 at the spawn, which the race start is), or null while hidden.
export function ghostPose(g, t) {
  const s = (t - g.t0) * g.hz;
  if (s < 0 || s > g.len - 1) return null;
  const i = Math.floor(s), j = Math.min(g.len - 1, i + 1), u = s - i;
  if (g.hid[i]) return null;
  const h = i > 0 && !g.hid[i - 1] ? i - 1 : i, k = j + 1 < g.len && !g.hid[j + 1] ? j + 1 : j;
  const lin = g.hid[j];
  const at = (v) => (lin ? v[i] : cr(v[h], v[i], v[j], v[k], u));
  // spawn growth restarts after each hidden run (a death and respawn in the record)
  let born = 0;
  for (let q = i; q > 0; q--) if (g.hid[q - 1]) { born = q; break; }
  const rope = g.h.find(([a, b]) => a <= i && i <= b);
  return { x: at(g.x), y: at(g.y), deg: lin ? g.r[i] : g.r[i] + (g.r[j] - g.r[i]) * u, frame: g.fr[g.f[i] >> 1],
    flip: !!(g.f[i] & 1), age: t - g.t0 - born / g.hz, rope };
}

// OutElastic growth of PlayerController.SpawnPlayer (physics.js Player.scale)
function grow(age) {
  const t = Math.min(1, age / PHYS.growth);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin(((t - 0.3 / 4) * (2 * Math.PI)) / 0.3) + 1;
}

// GetRandomSaveForRace(level, slot, ANY) [asm 0x12202d8]: difficulty drawn from _difficultyLevels[clamp(wins)] with
// WeightedRandom; a level, difficulty or slot with no save returns null and the slot stays empty [asm 0x12205a0]
// (difficulty 4 = ANY has no saves, so at 5+ wins a slot is empty 40% of the time).
export function pickGhosts(cfg, ghosts, wins, slot, rand = Math.random) {
  const weights = cfg.difficulty[Math.max(0, Math.min(wins, cfg.difficulty.length - 1))];
  const out = [];
  for (let s = 0; s <= cfg.opponents; s++) {
    if (s === slot) continue;
    const total = weights.reduce((a, [, w]) => a + w, 0);
    let r = rand() * total, diff = weights[weights.length - 1][0];
    for (const [d, w] of weights) { if (r < w) { diff = d; break; } r -= w; }
    const list = ghosts.filter((g) => g.d === diff && g.s === s);
    if (list.length) out.push(list[Math.floor(rand() * list.length)]);
  }
  // opponentsSaves.Sort by duration [asm 0x1220c0c]
  return out.sort((a, b) => a.ms - b.ms);
}

const CSS = `
#race, #raceEnd { position: fixed; inset: 0; z-index: 4; display: none; align-items: center; justify-content: center;
  background: rgba(0, 30, 55, .8); font: 700 15px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; }
#race.on, #raceEnd.on { display: flex; }
#raceEnd { background: rgba(0, 30, 55, .55); }
.rc { background: #12314d; border: 4px solid #0d1b2a; border-radius: 22px; width: min(94vw, 520px); max-height: 94vh;
  display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
.rc header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0d1b2a; }
.rc header h2 { flex: 1; margin: 0; font-size: 20px; }
.rc .x { width: 38px; height: 38px; border-radius: 12px; border: 3px solid #fff; background: none; color: #fff;
  font: 900 18px system-ui; cursor: pointer; }
.rc .body { overflow: auto; padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.rc .note { font-size: 13px; opacity: .85; }
.rc .msg { background: #ffd23f; color: #0d1b2a; border-radius: 12px; padding: 8px 10px; }
.rc ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rc li { display: flex; gap: 8px; align-items: center; background: #1d4467; border-radius: 10px; padding: 5px 10px; }
.rc li.me { background: #ffd23f; color: #0d1b2a; }
.rc li b { width: 26px; }
.rc li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc .tro { display: inline-block; width: 22px; height: 19px; background-repeat: no-repeat; vertical-align: -4px; }
.rc .go { border: 4px solid #0d1b2a; border-radius: 18px; font: 900 24px system-ui, sans-serif; color: #0d1b2a;
  background: #ffd23f; box-shadow: 0 5px 0 #0d1b2a; cursor: pointer; padding: 10px; }
.rc .go small { display: block; font-size: 14px; opacity: .75; }
.rc .go.alt { background: #fff; font-size: 18px; }
.rc .row2 { display: flex; gap: 10px; }
.rc .row2 > * { flex: 1; }
.rc .rbig { font: 900 34px system-ui, sans-serif; text-align: center; }
.rc .gain { display: flex; justify-content: center; gap: 18px; font-size: 22px; font-weight: 900; }
.rc .gain i { display: inline-block; vertical-align: -6px; margin-right: 4px; }
`;

let S = null; // module state: {app, cfg, maps, art, files}

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

function slot(save) { return (save.modes[ID] = save.modes[ID] || {}); }

// The current board, claiming a finished one first (LeaderboardsService.ClaimRewards [asm 0x12bae08]): the final rank
// at p = 1 pays its position reward, tournament_win +1 when rank <= maxRankToWin, tournament_played +1 [asm 0x12bb4cc,
// 0x12bb54c]; the new day's board wipes the race trophies (OnLeaderboardCreated [asm 0x11909bc]) and the best/last
// scores (SetLeaderboardAsActive [asm 0x12b880c]).
export function currentBoard(app, cfg, now = Date.now()) {
  const { save, meta } = app, st = slot(save);
  let claimed = null;
  if (st.board && st.board.start + DAY <= now) {
    const b = new Board(cfg, st.board.start);
    const wins = qty(save, R_WIN);
    const rank = b.ranking(b.start + DAY, wins, qty(save, R_BEST)).findIndex((r) => r.me);
    const got = [];
    for (const [res, q] of positionReward(cfg, rank)) {
      if (res === 'reward_pool.tournament_skin') {
        // ConvertReward [asm 0x1157358..0x1157374]: unowned pool skins [played % count]; dropped when all are owned
        const free = cfg.board.pools[res].filter((id) => !meta.ownsRes(save, id));
        if (free.length) meta.grantReward(save, [free[qty(save, R_PLAYED) % free.length], q], got);
      } else meta.grantReward(save, [res, q], got);
    }
    if (rank <= cfg.board.maxRankToWin) addQty(save, R_WIN, 1);
    addQty(save, R_PLAYED, 1);
    claimed = { day: dayId(st.board.start), rank, got };
    st.board = null;
  }
  if (!st.board) {
    st.board = { start: midnight(now) };
    for (const r of [R_TROPHIES, R_BEST, R_LAST]) delete save.inv[r];
  }
  app.writeSave();
  return { board: new Board(cfg, st.board.start), claimed };
}

// GameModesService daily play (js/daily.js) [asm 0x1296f40, 0x12972f0, 0x1297870]: 2 free races a day, counted when a
// race starts in flag daily_flag_mode.tournament_free_<yyyy-MM-dd>. After that each race needs a rewarded ad
// (maxRewardedGamesPerDay -1: no limit); here, like every rewarded ad of the web build, 1 skip ticket (rewarded.default skipPrice).
export function playState(save, now = Date.now()) {
  const st = dailyState(save, ID, now);
  return { free: st.free, tickets: st.tickets };
}
const pay = (save, now = Date.now()) => !!payPlay(save, ID, now);

async function load(app) {
  if (S) return S;
  const m = await app.loadMode(ID);
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  document.body.append(el('<div class="ui overlay" id="race"></div>'), el('<div class="ui overlay" id="raceEnd"></div>'));
  S = { app, cfg: m.file.race, maps: m.data.levels.length, patterns: m.data.patterns, files: {}, art: null };
  return S;
}

function art(app) {
  S.art ||= Promise.all([app.image('./art/race.webp'), fetch('./data/race/art.json' + app.V).then((r) => r.json())])
    .then(([img, rects]) => ({ img, rects }));
  return S.art;
}

function ghostFile(app, level) {
  S.files[level] ||= fetch('./data/race/' + level + '.json' + app.V).then((r) => {
    if (!r.ok) throw new Error('race/' + level + '.json ' + r.status);
    return r.json();
  }).then((d) => d.ghosts.map((g) => unpack(g, d.hz)));
  return S.files[level];
}

function trophyIcon(i, px, a) {
  const r = a.rects.Trophies, k = px / Math.max(r[2], r[3]);
  Object.assign(i.style, { width: r[2] * k + 'px', height: r[3] * k + 'px', backgroundImage: `url(${a.img.src})`,
    backgroundSize: `${a.img.width * k}px ${a.img.height * k}px`, backgroundPosition: `${-r[0] * k}px ${-r[1] * k}px` });
}

// ---- tournament page (TournamentPage): today's board, the play button --------------------------------------------
export async function open(app) {
  await load(app);
  for (const o of ['modes', 'start', 'levels', 'raceEnd']) if (document.getElementById(o)) app.overlay(o, false);
  const { board, claimed } = currentBoard(app, S.cfg);
  await page(app, board, claimed);
}

// TournamentPage (ui_pages_tournament): UIGradient #6521C5 (top) -> #A52FDB, Pattern_Trophy_Invers; TrophyTournament_01
// over the title and the time left in HolderTime_01; TOP PRIZES: three HolderReward cards (#2, #1 raised, #3); the
// COMPETITORS list: FramePlayer_01 rows (#rank, HolderPortrait, name, the coins of that rank, CounterPlayer_01 with
// CupIcon_01 and the trophies), the player's row in HolderYourPlayer / CounterYouPlayer_01; the play button at the bottom.
// Reward per rank: the board's thresholds (cfg.board.rewards: from rank p on).
const TOUR_CSS = `
#race .abody { overflow: auto; padding: 0 ${U(24)} ${U(200)}; align-items: center; }
#race .tt { position: relative; flex: none; width: ${U(220)}; height: ${U(160)}; margin-top: ${U(-10)}; }
#race .tname { font-size: ${U(52)}; margin-top: ${U(-8)}; }
#race .time { flex: none; min-width: ${U(170)}; height: ${U(46)}; display: flex; align-items: center; justify-content: center; font-size: ${U(28)};
  padding: 0 ${U(16)}; margin-top: ${U(4)}; }
#race .msg { margin: ${U(14)} 0 0; font: 800 ${U(22)}/1.25 system-ui, sans-serif; text-align: center; background: rgba(40, 10, 90, .45);
  border-radius: ${U(18)}; padding: ${U(10)} ${U(16)}; }
#race h3 { margin: ${U(20)} 0 ${U(8)}; font-size: ${U(40)}; }
#race .prizes { display: flex; align-items: flex-end; gap: ${U(14)}; }
#race .pz { position: relative; width: ${U(170)}; height: ${U(170)}; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${U(4)}; }
#race .pz.p1 { width: ${U(200)}; height: ${U(200)}; margin-bottom: ${U(16)}; }
#race .pz .n { position: absolute; left: ${U(-6)}; top: ${U(-10)}; font-size: ${U(40)}; }
#race .pz .q { font: 900 ${U(22)} system-ui, sans-serif; -webkit-text-stroke: ${U(4)} #1a1c4b; paint-order: stroke fill; text-align: center; }
#race .pz i.coin { width: ${U(70)}; height: ${U(70)}; }
#race ol { list-style: none; margin: 0; padding: 0 ${U(10)}; width: 100%; max-width: ${U(694)}; display: flex; flex-direction: column; gap: ${U(16)};
  box-sizing: border-box; }
#race li { position: relative; height: ${U(82)}; display: flex; align-items: center; gap: ${U(10)}; padding: 0 ${U(14)}; box-sizing: border-box; }
#race li > b { width: ${U(64)}; font-size: ${U(30)}; display: flex; justify-content: center; }
#race li .pt { width: ${U(60)}; height: ${U(60)}; flex: none; display: flex; align-items: center; justify-content: center; font-size: ${U(30)}; }
#race li > span { flex: 1; min-width: 0; font: 900 ${U(28)} system-ui, sans-serif; color: #5d2bb3; text-transform: uppercase; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
#race li.me > span { color: #fff; -webkit-text-stroke: ${U(4)} #1a1c4b; paint-order: stroke fill; }
#race li .rw { display: flex; align-items: center; gap: ${U(2)}; font: 900 ${U(18)} system-ui, sans-serif; color: #fff;
  -webkit-text-stroke: ${U(3)} #1a1c4b; paint-order: stroke fill; }
#race li .rw i { width: ${U(36)}; height: ${U(36)}; }
#race li .sc { min-width: ${U(110)}; height: ${U(46)}; display: flex; align-items: center; justify-content: flex-end; gap: ${U(6)}; padding: 0 ${U(12)};
  box-sizing: border-box; font-size: ${U(26)}; }
#race li .sc i { width: ${U(34)}; height: ${U(34)}; order: -1; }
#race li .sc em { font-style: normal; }
#race .bot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; padding: ${U(16)} 0 calc(env(safe-area-inset-bottom) + ${U(26)});
  background: linear-gradient(rgba(165, 47, 219, 0), rgba(165, 47, 219, .9) 40%); }
#race .go { width: ${U(380)}; height: ${U(126)}; border: 0; background-color: transparent; color: #fff; cursor: pointer; padding: 0 0 ${U(10)};
  font: 900 ${U(46)}/1 system-ui, sans-serif; -webkit-text-stroke: ${U(6)} #145c1c; paint-order: stroke fill; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${U(4)}; }
#race .go small { font: 800 ${U(19)} system-ui, sans-serif; text-transform: none; -webkit-text-stroke: ${U(3)} #145c1c; }
`;

async function page(app, board, claimed) {
  const { save, meta } = app, cfg = S.cfg, now = Date.now();
  if (!document.getElementById('tourCss')) document.head.insertAdjacentHTML('beforeend', `<style id="tourCss">${TOUR_CSS}</style>`);
  const rows = board.ranking(now, qty(save, R_WIN), qty(save, R_BEST));
  const left = Math.max(0, board.start + DAY - now);
  const hh = Math.floor(left / 3600000), mm = Math.floor(left / 60000) % 60;
  const ps = playState(save, now);
  const { el: box, body, sh } = await artPage(app, 'race', 'tour', { grad: 'linear-gradient(#6521c5, #a52fdb)', pattern: 'Pattern_Trophy_Invers',
    patSize: 256, patAlpha: 0.08, title: '', onClose: () => { app.overlay('race', false); app.overlay('start', true); app.hud(); } });
  const reward = (rank) => { let r = []; for (const [p, rw] of cfg.board.rewards) if (rank >= p) r = rw; return r; };
  const coinsOf = (rank) => reward(rank).find(([res]) => res === 'currency.skin_coins')?.[1] || 0;
  body.innerHTML = `<i class="tt"></i><b class="tname">Giải đua</b><b class="time">${hh}H ${mm}M</b>
    ${claimed ? `<div class="msg">Bảng ngày ${String(claimed.day).replace(/(\d{4})-(\d\d)-(\d\d)/, '$3/$2')} đã đóng: bạn hạng ${claimed.rank + 1}.
      ${claimed.got.map((g) => (g.coins ? `+${g.coins} xu` : g.item ? 'Mở khoá ' + g.item.title : '')).filter(Boolean).join(', ') || 'Không có thưởng.'}</div>` : ''}
    <h3>Giải thưởng</h3><div class="prizes">${[1, 0, 2].map((r) => `<div class="pz p${r + 1}"><b class="n">#${r + 1}</b><i class="coin"></i>
      <span class="q">${reward(r).map(([res, q]) => (res === 'currency.skin_coins' ? 'x' + q : 'Skin mới')).join(' + ')}</span></div>`).join('')}</div>
    <h3>Đối thủ</h3>
    <ol>${rows.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><i class="pt">${(r.name[0] || '?').toUpperCase()}</i><span>${r.name}</span>
      <i class="rw"><i></i>x${coinsOf(i)}</i><b class="sc"><i></i><em>${r.score}</em></b></li>`).join('')}</ol>
    <p class="note" hidden>Còn ${hh} giờ ${mm} phút · thắng ${qty(save, R_WIN)} ngày · cúp hôm nay: ${qty(save, R_TROPHIES)}</p>`;
  box.insertAdjacentHTML('beforeend', `<div class="bot"><button class="go">Đua<small>${ps.free ? `Miễn phí: còn ${ps.free}/${FREE_PER_DAY} lượt hôm nay`
    : `1 vé bỏ qua (còn ${ps.tickets})`}</small></button></div>`);
  spr(body.querySelector('.tt'), sh, 'TrophyTournament_01');
  spr(body.querySelector('.time'), sh, 'HolderTime_01');
  for (const z of body.querySelectorAll('.pz')) { spr(z, sh, 'HolderReward'); spr(z.querySelector('.coin'), sh, 'SkinCoins'); glText(app, z.querySelector('.n'), 40); }
  for (const li of body.querySelectorAll('li')) {
    const me = li.classList.contains('me');
    slice(li, sh, me ? 'HolderYourPlayer' : 'FramePlayer_01', 0.6);
    spr(li.querySelector('.pt'), sh, me ? 'HolderPortrait_02' : 'HolderPortrait_01');
    spr(li.querySelector('.rw i'), sh, 'SkinCoins');
    spr(li.querySelector('.sc'), sh, me ? 'CounterYouPlayer_01' : 'CounterPlayer_01');
    spr(li.querySelector('.sc i'), sh, 'CupIcon_01');
    // the rank keeps its plain number (read by the tests); the game font draws it with the "#"
    glText(app, li.querySelector('b'), 30);
    glText(app, li.querySelector('.pt'), 30);
    if (!me) glText(app, li.querySelector('span'), 28, '#7a3fd6');
    glText(app, li.querySelector('.sc em'), 26);
    glText(app, li.querySelector('.rw'), 18);
  }
  for (const h of body.querySelectorAll('h3, .tname, .time')) glText(app, h, parseFloat(getComputedStyle(h).fontSize) / (window.innerHeight / 1334));
  spr(box.querySelector('.go'), sh, 'OutlinedButtonGreen');
  box.querySelector('.go').onclick = () => go(app);
}

async function go(app) {
  const { save } = app;
  if (!pay(save)) { app.toast('Hết lượt miễn phí hôm nay: cần 1 vé bỏ qua (mua ở Chợ)'); return; }
  app.writeSave();
  app.play('button');
  const btn = document.querySelector('#race .go, #raceEnd .go');
  if (btn) btn.firstChild.textContent = 'Đang tải…';
  try {
    const rc = await newRace(app);
    app.overlay('race', false);
    app.overlay('raceEnd', false);
    await app.startRace(rc);
  } catch (e) {
    app.toast('Không tải được cuộc đua: ' + e.message);
  }
}

// One race: GamePlayService.StartLevel plays GetNextLevelToPlay = max(0, min(achieved, unlocked)) [asm 0x1296b50],
// TournamentGamePlayController.RefineLevel keeps it below the 21 maps, else Random.Range(0, 21) [asm 0x12aac08];
// LoadOpponentsAndGetSpawnPoint: player slot Random.Range(0, 5) [asm 0x121fea0], one ghost per other slot.
async function newRace(app) {
  const { save, meta, custom } = app, cfg = S.cfg;
  const achieved = slot(save).best || 0;
  const level = achieved < S.maps ? achieved : Math.floor(Math.random() * S.maps);
  const me = Math.floor(Math.random() * (cfg.opponents + 1));
  const [all, a] = await Promise.all([ghostFile(app, level), art(app)]);
  const ghosts = pickGhosts(cfg, all, qty(save, R_WIN), me);
  // ghost names: the board's profiles shuffled (Extensions.Shuffle [asm 0x1220160]); [ĐỀ XUẤT] without the player
  const { board } = currentBoard(app, cfg);
  const names = board.ai.map((p) => p.name);
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const sheets = await Promise.all(ghosts.map((g) => custom.skin(meta.byId.get(g.k) || meta.byId.get('skin.basic')).catch(() => null)));
  return new RaceRun(app, { level, me, ghosts: ghosts.map((g, i) => ({ g, name: names[i], sheet: sheets[i] })), art: a });
}

// ---- the race controller main.js drives ----------------------------------------------------------------------------
export class RaceRun {
  constructor(app, { level, me, ghosts, art: a }) {
    Object.assign(this, { app, id: ID, level, me, ghosts, art: a });
    this.clock = 0; // seconds since GO
    this.ranking = []; // finish order: {name, time, me?}
    this.done = null; // the player's result once finished
    this.ended = false;
  }

  // GetSpawnPointName: "Spawn" + (slot > 0 ? slot : "") of the map's first pattern [asm 0x12aad00]
  place(world) {
    this.world = world;
    this.spawns = S.patterns[world.names[0]].spawns || [[world.spawn.x, world.spawn.y]];
    const sp = this.spawns[this.me] || this.spawns[0];
    world.spawn = { x: sp[0], y: sp[1] };
  }

  begin(game) {
    game.phase = 'count';
    game.t = 0;
    this.clock = 0;
    this.ranking = [];
    this.done = null;
    this.ended = false;
    for (const o of this.ghosts) o.home = false;
    this.endShown = false;
  }

  counted(t) { return t >= COUNT.length * STEP_S; }

  // Ghost finishes: PlayGhostAndWaitForFinish waits Task.Delay(round(duration * 1000)) after GO [asm 0x1221438,
  // 0x1221528]; TriggerOnGhostFinished adds the ghost, and when that makes 4 finishers the player is force-finished
  // [asm 0x12ab824..0x12ab84c]. Returns true for that forced finish.
  tick(dt) {
    this.clock += dt;
    let force = false;
    for (const o of this.ghosts) {
      if (o.home || this.clock * 1000 < o.g.ms) continue;
      o.home = true;
      this.ranking.push({ name: o.name, time: o.g.sec });
      if (this.ranking.length === S.cfg.opponents && !this.done) force = true;
    }
    return force;
  }

  // CompleteLevel: the player joins the ranking; rank = its index; FinishRace pays coins and trophies by
  // clamp(rank, 0, 4) [asm 0x1190d24, 0x1190e44] and registers the day's trophies as the board score [asm 0x1191054];
  // the level counts as achieved (OnLevelAchieved: achieved = level + 1 [asm 0x2419580, 0x12968e4]).
  finish(forced) {
    const { save } = this.app;
    const time = this.clock;
    this.ranking.push({ name: ME, time, me: true });
    const rank = this.ranking.findIndex((r) => r.me);
    const k = Math.max(0, Math.min(rank, COINS.length - 1));
    let coins = COINS[k], trophies = TROPHIES[k];
    save.coins += coins;
    addQty(save, R_TROPHIES, trophies);
    // source finish_level_tournament [asm 0x1190f1c..0x1190ffc]: card.daily_coins_boost_tournament (first 100 coins of
    // the day) and card.daily_trophy_boost_tournament (cap 30 in the config; the "40" of its text is display only)
    const meta = this.app.meta;
    coins += meta.bonus(save, 'currency.skin_coins', 'finish_level_tournament', coins);
    trophies += meta.bonus(save, R_TROPHIES, 'finish_level_tournament', trophies);
    const total = qty(save, R_TROPHIES);
    save.inv[R_LAST] = total;
    save.inv[R_BEST] = Math.max(qty(save, R_BEST), total);
    const st = slot(save);
    if ((st.best || 0) <= this.level) st.best = this.level + 1;
    this.done = { rank, coins, trophies, time, forced: !!forced };
    this.app.writeSave();
    return { xp: 0, got: [], race: this.done };
  }

  // live place [ĐỀ XUẤT]: ghosts home + ghosts ahead on x
  livePlace(player) {
    if (this.done) return this.done.rank + 1;
    let n = 0;
    for (const o of this.ghosts) {
      if (o.home) { n++; continue; }
      const p = ghostPose(o.g, this.clock);
      if (p && p.x > player.x) n++;
    }
    return n + 1;
  }

  draw(R, game) {
    const a = this.art;
    if (game.phase === 'count') {
      // SetSpawnPointsVisibility: PlayerSpawn at the player's slot, GhostSpawn at the others [asm 0x12aae04];
      // BouncePlayerSpawn scales the player's marker by 1.2 for 0.2 s on each count [asm 0x1220acc, 0x1220b48]
      this.spawns.forEach(([x, y], i) => {
        const name = i === this.me ? 'SpawnPointPlayer' : 'SpawnPointGhost';
        const r = a.rects[name], k = (game.t % STEP_S) / 0.2;
        const b = i === this.me && game.t >= STEP_S && k < 1 ? 1 + 0.2 * Math.sin(Math.PI * k) : 1;
        const s = 0.3333 * b;
        R.spriteFrom(a.img, name, r, [s, 0, 0, s, x, y]);
      });
      return;
    }
    for (const o of this.ghosts) {
      const p = ghostPose(o.g, this.clock);
      if (!p || !o.sheet) continue;
      const ang = p.deg * Math.PI / 180, sc = 0.3 * grow(p.age), fx = p.flip ? -1 : 1;
      const c = Math.cos(ang), sn = Math.sin(ang);
      if (p.rope) {
        const [ax, ay] = PHYS.anchor;
        const hx = p.x + c * ax - sn * ay, hy = p.y + sn * ax + c * ay;
        const tg = p.rope[2] >= 0 ? this.world.targets[p.rope[2]] : { x: p.rope[3] / 100, y: p.rope[4] / 100 };
        if (tg) {
          // [ĐỀ XUẤT] rope colour: the default rope's (white `basic` texture)
          R.setWorld([1, 0, 0, 1, 0, 0]);
          Object.assign(R.ctx, { globalAlpha: GHOST_ALPHA, globalCompositeOperation: 'source-over', strokeStyle: '#fff',
            lineWidth: GHOST_ROPE, lineCap: 'butt' });
          R.ctx.beginPath(); R.ctx.moveTo(hx, hy); R.ctx.lineTo(tg.x, tg.y); R.ctx.stroke();
        }
      }
      const f = o.sheet.frames[p.frame] || o.sheet.frames[o.sheet.states[1][0]];
      if (!f) continue;
      const [img, r] = f;
      R.spriteFrom(img, p.frame, r, [c * sc * fx, sn * sc * fx, -sn * sc, c * sc, p.x, p.y], { alpha: GHOST_ALPHA });
    }
  }

  // TournamentInGameUI (u = one 750 x 1334 reference unit): the progress bar (main.js), RacePlayerFinishText (top right,
  // Junegull 40) listing "#n name" for everyone home, the player's line in #FFC64C (OnRankingsUpdated
  // [asm 0x1224cfc..0x1224ed0]), and at the finish FinishText = rank + 1 and "st" / "nd" / "rd" / "th"
  // (TournamentInGamePage.OnLevelComplete [asm 0x1224c1c..0x1224c90]).
  hud(R, w, h, game, player, u) {
    if (game.phase === 'count') {
      // SpawnCounter: CounterText (red #FF483E) on the player's own start ring (SpawnPoint prefab canvas; 2019 clip 0:26)
      const i = Math.min(COUNT.length - 1, Math.floor(game.t / STEP_S));
      const [sx, sy] = this.spawns[this.me] || this.spawns[0], k = R.k / R.dpr;
      R.text(COUNT[i], w / 2 + (sx - R.cam.x) * k, h / 2 - (sy - R.cam.y) * k, 0.5 * k, 0.5, 1, '#FF483E');
      return;
    }
    const px = 40 * u, lh = (R.font.lineHeight / R.font.size) * px, right = w * 0.98, top = h * (1 - 0.89);
    // the Junegull font has no Vietnamese letters: the player's line says ME, as the 2019 clip's "ME: 1"
    this.ranking.forEach((r, i) => R.text(`#${i + 1} ${r.me ? 'me' : r.name}`, right, top + lh * (i + 0.5), px, 1, 1, r.me ? '#FFC64C' : null));
    if (this.done) { // also a forced finish: Finish calls CompleteLevel either way [asm 0x12078f0]
      const n = this.done.rank + 1;
      this.app.finishText(w, h, u, [[n + (['st', 'nd', 'rd'][n - 1] || 'th'), null]]);
    }
    if (this.done && game.t > 0.9 && !this.endShown) { this.endShown = true; this.end(); }
  }

  // TournamentEndGamePage: "#rank", +coins, +trophies [asm 0x1223328..0x12233b8]
  end() {
    const { app } = this, d = this.done, a = this.art;
    const ps = playState(app.save);
    // the whole order: ghosts by duration around the player
    const order = this.ghosts.map((o) => ({ name: o.name, time: o.g.sec })).concat([{ name: ME, time: d.time, me: true }]);
    order.sort((x, y) => (x.me ? (y.time < x.time ? 1 : -1) : y.me ? (x.time < y.time ? -1 : 1) : x.time - y.time));
    const box = document.getElementById('raceEnd');
    box.innerHTML = `<div class="rc"><header><h2>Về đích</h2></header><div class="body">
      <div class="rbig">Hạng ${d.rank + 1}/${this.ghosts.length + 1}</div>
      <div class="note" style="text-align:center">${d.forced ? 'Cả 4 đối thủ đã về đích trước bạn' : 'Thời gian của bạn: ' + fmt(d.time)}</div>
      <div class="gain"><span><i class="coin"></i>+${d.coins} xu</span><span><i class="tro"></i>+${d.trophies} cúp</span></div>
      <ol>${order.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><span>${r.name}</span>${r.me && d.forced ? '—' : fmt(r.time)}</li>`).join('')}</ol>
      <div class="note">Cúp hôm nay: ${qty(app.save, R_TROPHIES)} · hạng ${currentBoardRank(app)} / ${S.cfg.board.participants} trên bảng</div>
      <div class="row2"><button class="go alt" data-act="board">Bảng xếp hạng</button>
        <button class="go" data-act="again">Đua tiếp<small>${ps.free ? `miễn phí ${ps.free}/${FREE_PER_DAY}` : `1 vé (còn ${ps.tickets})`}</small></button></div>
    </div></div>`;
    app.icon(box.querySelector('.coin'), 'coin', 26);
    trophyIcon(box.querySelector('.gain .tro'), 26, a);
    box.querySelector('[data-act="board"]').onclick = () => { app.play('button'); open(app); };
    box.querySelector('[data-act="again"]').onclick = () => go(app);
    app.play('popup_in');
    app.overlay('raceEnd', true);
  }
}

function currentBoardRank(app) {
  const { board } = currentBoard(app, S.cfg);
  return board.ranking(Date.now(), qty(app.save, R_WIN), qty(app.save, R_BEST)).findIndex((r) => r.me) + 1;
}
