// Result-screen statistics through real taps: tabs, the team overview, sorting, the hero detail, a forced loss and the
// tutorial's two-hero report. What the screen says is read from __G.statsUi (every drawn string is registered there) and
// compared with __G.lastReward.report under the formatting rules, so a wrong figure or a wrong rounding fails here.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/stats-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { HERO } from '../js/data/heroes.js';
import { CARD } from '../js/data/cards.js';

const OUT = path.join(ROOT, '.chk', 'stats'); fs.mkdirSync(OUT, { recursive: true });
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const shots = [];
const BASE = 'noaudio=1&q=low&seed=7&autostart=1';

// the rules, written once more here on purpose: a mistake in the screen's formatter must not be copied into its check
const nf = (n, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d });
const num = (n) => { n = Math.round(n); return Math.abs(n) <= 999999 ? nf(n) : nf(n / 1e6, 1) + ' Tr'; };
const tm = (s) => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const foreign = (s) => /status of 404/.test(s);

const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
async function tap(page, id) {
  const t = (await targets(page)).find((q) => q.id === id); if (!t) return false;
  await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2); await step(page, 10); return true;
}
async function shot(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.locator('#frame').screenshot({ path: f }); shots.push(f); }
async function audit(page, label) {
  const bad = await page.evaluate(() => {
    const out = [], k = document.getElementById('frame').getBoundingClientRect().width / 360;
    for (const t of __ui.targets()) {
      if (t.w / k < 47.5 || t.h / k < 47.5) out.push(`${t.id} is ${(t.w / k).toFixed(1)}x${(t.h / k).toFixed(1)}`);
      const hit = __ui.hitAt(t.x + t.w / 2, t.y + t.h / 2); if (hit !== t.id) out.push(`${t.id} centre hits ${hit}`);
    }
    return out;
  });
  const n = (await targets(page)).length;
  check(n > 0 && bad.length === 0, `${label}: ${n} targets are at least 48x48 CSS px and own their centre (${bad.slice(0, 4).join('; ') || 'none out'})`);
}
async function overflow(page, label) {
  const bad = await page.evaluate(() => __G.statsUi.audit());
  const n = await page.evaluate(() => __G.statsUi.texts.length);
  check(n > 10 && bad.length === 0, `${label}: ${n} texts stay inside their panels (${bad.slice(0, 3).join(' | ') || 'none out'})`);
}
const read = (page) => page.evaluate(() => ({ won: __G.lastReward.won, report: __G.lastReward.report, seconds: __G.lastReward.seconds, kills: __G.lastReward.kills, tab: __G.screens.result.dbg().tab, mode: __G.screens.result.dbg().mode, ui: JSON.parse(JSON.stringify({ rows: __G.statsUi.rows.map((r) => ({ i: r.i, id: r.id, mvp: r.mvp, t: r.t, y: r.y, rank: r.rank })), header: __G.statsUi.header, sortId: __G.statsUi.sortId, order: __G.statsUi.order })) }));
const toEnd = (page) => page.evaluate(() => { const B = __G.B; let g = 0; while ((B.phase === 'fight' || B.phase === 'pick') && g++ < 500) { __G.frozen = false; __sim(5); } __sim(0); for (let i = 0; i < 300 && !__G.lastReward; i++) __step(1); __step(60); });
const lose = (page, secs) => page.evaluate((s) => { __sim(s); for (const u of __G.B.heroes) { u.alive = false; u.hp = 0; } __sim(1); for (let i = 0; i < 300 && !__G.lastReward; i++) __step(1); __step(60); }, secs);

// the figures one overview row must show, from the report alone
function wantRow(h) {
  const w = { dmg: num(h.dealt), dps: num(h.dps) + '/s', taken: num(h.taken), kills: num(h.kills), ults: num(h.ults), alive: tm(h.aliveT) };
  if (h.healed > 0) w.heal = num(h.healed); if (h.shieldGiven > 0) w.shield = num(h.shieldGiven);
  if (Math.floor(h.downT) >= 1) w.down = tm(h.downT);
  return w;
}
function checkOverview(phone, label, s) {
  const { report, ui: u } = s;
  check(u.rows.length === report.length && report.length > 0, `${phone} ${label}: ${u.rows.length} rows for ${report.length} heroes in the report`);
  const wrong = [];
  for (const row of u.rows) {
    const h = report[row.i], want = wantRow(h);
    for (const [k, v] of Object.entries(want)) if (row.t[k] !== v) wrong.push(`${h.id}.${k} shows "${row.t[k]}" want "${v}"`);
    for (const k of ['heal', 'shield', 'down']) if (!(k in want) && row.t[k]) wrong.push(`${h.id}.${k} shows "${row.t[k]}" but should be absent`);
    if (row.hero !== undefined && row.hero !== h.id) wrong.push(`row ${row.i} hero ${row.hero}`);
  }
  check(wrong.length === 0, `${phone} ${label}: every row's damage, DPS, taken, healing, shield, kills, ultimates, time alive and time down equal the report (${wrong.slice(0, 3).join('; ') || 'all equal'})`);
  const total = report.reduce((a, h) => a + h.dealt, 0);
  check(u.header.dmg === num(total) && u.header.time === tm(s.seconds) && u.header.kills === num(s.kills), `${phone} ${label}: header shows time ${u.header.time}, damage ${u.header.dmg}, kills ${u.header.kills} (want ${tm(s.seconds)}, ${num(total)}, ${num(s.kills)})`);
  const shown = u.rows.map((r) => r.t.pct), sum = shown.reduce((a, p) => a + (p === '<1%' ? 0 : parseInt(p, 10)), 0);
  const off = u.rows.filter((r) => { const p = report[r.i].share * 100, t = r.t.pct; return t === '<1%' ? !(p > 0 && p < 1) : Math.abs(parseInt(t, 10) - p) > 1.01; });
  check(sum >= 99 && sum <= 101 && off.length === 0, `${phone} ${label}: shares ${shown.join(' ')} add up to ${sum} and each is within 1 point of its true share (${off.length} off)`);
  const mvps = u.rows.filter((r) => r.mvp), top = report.reduce((a, h, i) => (h.dealt > report[a].dealt ? i : a), 0);
  check(mvps.length === 1 && mvps[0].i === top && report[top].mvp && mvps[0].t.mvp === 'GÁNH ĐỘI', `${phone} ${label}: exactly one GÁNH ĐỘI mark, on hero ${mvps.map((r) => report[r.i].id)} who dealt the most (${report[top].id} ${num(report[top].dealt)})`);
  const rank = [...u.rows].sort((a, b) => a.y - b.y).map((r) => r.i);
  const exp = report.map((h, i) => i).sort((a, b) => report[b].dealt - report[a].dealt || a - b);
  check(rank.join() === exp.join(), `${phone} ${label}: rows run top to bottom in damage order (${rank.map((i) => report[i].id)})`);
}

async function sortCheck(page, phone, report) {
  const keys = { taken: (h) => h.taken, heal: (h) => h.healed + h.shieldGiven, dealt: (h) => h.dealt };
  for (const id of ['taken', 'heal', 'dealt']) {
    check(await tap(page, 'stats-sort'), `${phone}: stats-sort is tappable`);
    const s = await read(page);
    const rank = [...s.ui.rows].sort((a, b) => a.y - b.y).map((r) => r.i), exp = report.map((h, i) => i).sort((a, b) => keys[id](report[b]) - keys[id](report[a]) || a - b);
    check(s.ui.sortId === id && rank.join() === exp.join(), `${phone}: sort "${s.ui.sortId}" orders rows ${rank.map((i) => report[i].id)} (want ${exp.map((i) => report[i].id)})`);
  }
}

async function detailCheck(page, phone, tag, report, snapAll) {
  for (let i = 0; i < report.length; i++) {
    const h = report[i], def = HERO[h.id];
    check(await tap(page, 'stat-hero' + i), `${phone} ${tag}: row stat-hero${i} is tappable`);
    const d = await page.evaluate(() => JSON.parse(JSON.stringify({ view: __G.screens.result.dbg().view ?? null, d: __G.statsUi.detail })));
    const dd = d.d; if (!check(!!dd && dd.hero === h.id, `${phone} ${tag}: tapping row ${i} opens the detail of ${h.id}`)) continue;
    const src = ['atk', 's1', 's2', 'ult', 'fx'], sum = dd.src.reduce((a, s) => a + s.val, 0);
    check(src.every((k, j) => dd.src[j].id === k && Math.abs(dd.src[j].val - h.bySrc[k]) < 1e-6 && dd.src[j].num === num(h.bySrc[k])) && Math.abs(sum - h.dealt) < 1, `${phone} ${tag} ${h.id}: five source numbers ${dd.src.map((s) => s.num).join(' / ')} equal bySrc and add to damage ${num(h.dealt)}`);
    const names = ['Đòn thường', def.s1.name, def.s2.name, def.ult.name, 'Hiệu ứng (cháy, độc...)'];
    check(dd.src.every((s, j) => s.name === names[j]), `${phone} ${tag} ${h.id}: legend reads ${dd.src.map((s) => s.name).join(' | ')}`);
    const dim = dd.src.every((s) => s.dim === (s.val <= 0)); check(dim, `${phone} ${tag} ${h.id}: zero-damage legend lines are the dimmed ones`);
    check(dd.cards.length === h.cards.length && dd.cards.every((c, j) => c.id === h.cards[j] && c.name === CARD[h.cards[j]].name), `${phone} ${tag} ${h.id}: ${dd.cards.length} cards shown ${dd.cards.map((c) => c.name).join(', ') || '(none)'} equal report.cards`);
    const fm = { atk: (v) => num(v), hp: (v) => num(v), aspd: (v) => nf(v, 2), crit: (v) => Math.round(v * 100) + '%' };
    check(dd.stats.length === 4 && dd.stats.every((s) => s.then === fm[s.key](h.start[s.key]) && s.now === fm[s.key](h.end[s.key])), `${phone} ${tag} ${h.id}: stat lines ${dd.stats.map((s) => s.line + (s.gain ? ' ' + s.gain : '')).join(' ; ')}`);
    const sup = dd.support;
    check(sup.taken === num(h.taken) && sup.selfHeal === num(h.selfHeal) && sup.healed === num(h.healed) && sup.shieldGiven === num(h.shieldGiven) && sup.casts === num(h.casts) && sup.downs === num(h.downs), `${phone} ${tag} ${h.id}: support numbers equal the report`);
    if (snapAll || i === 0) await shot(page, phone, `${tag}-detail${i}`);
    if (i === 0) { await audit(page, `${phone} ${tag} detail`); await overflow(page, `${phone} ${tag} detail`); }
    if (h.cards.length > 1) {
      check(await tap(page, 'stat-card1'), `${phone} ${tag}: card tile stat-card1 is tappable`);
      const desc = await page.evaluate(() => __G.statsUi.detail.desc), c = CARD[h.cards[1]];
      check(desc === `${c.name}: ${c.desc}`, `${phone} ${tag} ${h.id}: tapping card 2 shows "${desc}"`);
    }
    check(await tap(page, 'stats-back'), `${phone} ${tag}: stats-back is tappable`);
    const back = await page.evaluate(() => ({ det: !!__G.statsUi.detail, rows: __ui.targets().filter((t) => /^stat-hero/.test(t.id)).length }));
    check(!back.det && back.rows === report.length, `${phone} ${tag}: stats-back returns to the overview (${back.rows} rows, detail ${back.det})`);
  }
}

try {
  for (const phone of ['s22', 'xiaomi']) {
    // formatting rules against literal cases, using the screen's own functions
    if (phone === 's22') {
      const g0 = await open(br, srv.base, phone, BASE + '&stage=1'); const p0 = g0.page;
      const f = await p0.evaluate(async () => { const m = await import('./js/ui/stats.js?v=20261119c'); return { a: m.fmtNum(12345), b: m.fmtNum(1234567), c: m.fmtNum(999999), d: m.fmtNum(0), e: m.fmtTime(112), f: m.fmtTime(7), g: m.sharePcts([{ share: 0.004 }, { share: 0.5 }, { share: 0.496 }]), h: m.sharePcts([{ share: 1 }]), i: m.fmtDec(1.116), j: m.fmtNum(2500000000) }; });
      check(f.a === '12.345' && f.b === '1,2 Tr' && f.c === '999.999' && f.d === '0' && f.e === '1:52' && f.f === '0:07' && f.g.join() === '<1%,50%,50%' && f.h.join() === '100%' && f.i === '1,12' && f.j === '2,5 Tỷ', `formatting: ${JSON.stringify(f)}`);
      await g0.ctx.close();
    }

    // 1. stage 8, win or loss: the overview
    const g = await open(br, srv.base, phone, BASE + '&stage=8&autoult=1&autopick=1'); const page = g.page;
    await toEnd(page);
    let s = await read(page);
    check(s.mode === 'result' && s.report.length === 4, `${phone}: stage 8 ended ${s.won ? 'won' : 'lost'} with the result screen up and ${s.report.length} heroes in the report`);
    check(s.tab === (s.won ? 'reward' : 'stats'), `${phone}: the first tab is "${s.tab}" after a ${s.won ? 'win' : 'loss'}`);
    check(await tap(page, 'tab-reward'), `${phone}: tab-reward is tappable`);
    s = await read(page); check(s.tab === 'reward', `${phone}: tapping tab-reward shows "${s.tab}"`);
    let ids = (await targets(page)).map((t) => t.id);
    check(['retry', 'home'].every((i) => ids.includes(i)) && (!s.won || ids.includes('next')), `${phone} reward tab: next steps stay visible (${ids.join(',')})`);
    await audit(page, `${phone} reward tab`); await shot(page, phone, 'reward');
    check(await tap(page, 'tab-stats'), `${phone}: tab-stats is tappable`);
    s = await read(page); check(s.tab === 'stats', `${phone}: a real tap on tab-stats opens "${s.tab}"`);
    ids = (await targets(page)).map((t) => t.id);
    check(['retry', 'home'].every((i) => ids.includes(i)) && (!s.won || ids.includes('next')) && ids.includes('stats-sort'), `${phone} stats tab: next steps and the sort switch are live (${ids.join(',')})`);
    checkOverview(phone, 'stage 8', s);
    await audit(page, `${phone} stats tab`); await overflow(page, `${phone} stats tab`); await shot(page, phone, 'stats');
    // 2. sorting
    await sortCheck(page, phone, s.report);
    await shot(page, phone, 'stats-sorted');
    // 3. detail of every hero
    await detailCheck(page, phone, 'stage8', s.report, true);
    const errs = await page.evaluate(() => (window.__errors || []).slice(0, 3));
    check(errs.length === 0 && g.problems.filter((x) => !foreign(x)).length === 0, `${phone}: stage 8 run has no errors (${[...errs, ...g.problems].slice(0, 2).join(' | ') || 'none'})`);
    await g.ctx.close();

    // 4. a forced loss on stage 30 after 10 seconds
    const l = await open(br, srv.base, phone, BASE + '&stage=30'); const lp = l.page;
    await lose(lp, 10);
    s = await read(lp);
    check(s.mode === 'result' && !s.won && s.tab === 'stats', `${phone}: a loss on stage 30 shows the stats tab first (mode ${s.mode}, won ${s.won}, tab ${s.tab})`);
    const idsL = (await targets(lp)).map((t) => t.id);
    check(!idsL.includes('next') && ['retry', 'home', 'tab-reward', 'tab-stats'].every((i) => idsL.includes(i)), `${phone}: loss shows ${idsL.join(',')}`);
    checkOverview(phone, 'loss at 10 s', s);
    await audit(lp, `${phone} loss`); await overflow(lp, `${phone} loss`); await shot(lp, phone, 'loss');
    await detailCheck(lp, phone, 'loss', s.report, false);
    check(await tap(lp, 'tab-reward'), `${phone}: loss reward tab opens`); await shot(lp, phone, 'loss-reward');
    const lerr = await lp.evaluate(() => (window.__errors || []).slice(0, 3));
    check(lerr.length === 0 && l.problems.filter((x) => !foreign(x)).length === 0, `${phone}: loss run has no errors (${[...lerr, ...l.problems].slice(0, 2).join(' | ') || 'none'})`);
    await l.ctx.close();

    // 5. a zero-damage hero: nobody has hit anything yet
    const z = await open(br, srv.base, phone, BASE + '&stage=30'); const zp = z.page;
    await lose(zp, 0.2);
    s = await read(zp);
    const zero = s.report.filter((h) => h.dealt === 0).length;
    check(s.mode === 'result' && zero >= 1 && s.ui.rows.filter((r) => s.report[r.i].dealt === 0).every((r) => r.t.dmg === '0' && r.t.pct === '0%'), `${phone}: a loss after 0.2 s has ${zero} hero(es) with zero damage, shown as 0 and 0%`);
    check(s.ui.rows.every((r) => !r.mvp) || s.report.some((h) => h.mvp), `${phone}: no GÁNH ĐỘI mark without damage dealt (${s.ui.rows.filter((r) => r.mvp).length} marks)`);
    await overflow(zp, `${phone} zero damage`); await shot(zp, phone, 'zero');
    await detailCheck(zp, phone, 'zero', s.report, false);
    await z.ctx.close();

    // 6. the tutorial: one hero, the second joins in wave 2
    const t = await open(br, srv.base, phone, 'noaudio=1&q=low&seed=7&preset=fresh'); const tp = t.page;
    await tp.evaluate(() => { __G.startBattle(1, { seed: 7, auto: { ult: true, pick: 'best' } }); __step(30); });
    const tut = await tp.evaluate(() => ({ on: __G.tutorial, n: __G.B.heroes.length }));
    await toEnd(tp);
    s = await read(tp);
    check(tut.on && tut.n === 1 && s.report.length === 2 && s.ui.rows.length === 2, `${phone}: the tutorial started with ${tut.n} hero and ends with ${s.ui.rows.length} rows (report ${s.report.map((h) => h.id)})`);
    // the first-session guide queues unlock reveals and hints over the result screen: tap them away
    for (let k = 0; k < 30; k++) {
      let ids = (await targets(tp)).map((x) => x.id); if (ids.includes('tab-stats') && !ids.includes('guide-block')) break;
      if (ids.includes('guide-block') && !ids.includes('guide-skip') && !ids.includes('reveal-tap')) { await tp.evaluate(() => { __G.meta.acc.ftue.session = true; }); await step(tp, 20); ids = (await targets(tp)).map((x) => x.id); }
      const pick = ['reveal-tap', 'guide-skip'].find((i) => ids.includes(i)); if (!pick) { await step(tp, 30); continue; }
      await tap(tp, pick); await step(tp, 40);
    }
    check(await tap(tp, 'tab-stats'), `${phone}: tutorial stats tab opens`);
    s = await read(tp); checkOverview(phone, 'tutorial', s);
    const joined = s.report[1]; check(joined.aliveT < s.seconds - 1, `${phone}: the hero who joined mid-stage was alive ${tm(joined.aliveT)} of ${tm(s.seconds)}`);
    await audit(tp, `${phone} tutorial`); await overflow(tp, `${phone} tutorial`); await shot(tp, phone, 'tutorial');
    await detailCheck(tp, phone, 'tutorial', s.report, false);
    const terr = await tp.evaluate(() => (window.__errors || []).slice(0, 3));
    check(terr.length === 0 && t.problems.filter((x) => !foreign(x)).length === 0, `${phone}: tutorial run has no errors (${[...terr, ...t.problems].slice(0, 2).join(' | ') || 'none'})`);
    await t.ctx.close();
  }
  for (const phone of ['s22', 'xiaomi']) {
    const keep = shots.filter((f) => f.includes(phone + '-') && /(reward|stats|stats-sorted|stage8-detail0|stage8-detail1|stage8-detail2|stage8-detail3|loss|loss-detail0|zero|tutorial)\.png$/.test(f));
    if (keep.length) sheet(keep, path.join(OUT, `review-${phone}.png`), 4, 330);
  }
} finally { await br.close(); srv.close(); }
done();
