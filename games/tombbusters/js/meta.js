// Out-of-run meta: save (localStorage), shop (buy / sell / repair at the wiki's real prices) and the bestiary.
// No three.js here on purpose: it is plain data + DOM, so the headless test can drive it directly.
import { SAVE_KEY, TOOLS, BESTIARY, SAVE_VERSION } from './data.js';

const blankDex = () => Object.fromEntries(Object.keys(BESTIARY).map((k) => [k, { seen: 0, killed: 0, captured: 0 }]));
const blank = () => ({ v: SAVE_VERSION, bank: 0, runs: 0, out: 0, dead: 0, best: 0, inv: { flash: { dur: TOOLS.flash.dur }, gourd: null, stun: null, charm: 0 }, dex: blankDex() });

// Drop 1-2 saves (v undefined, only bank/runs/out/dead/best) keep their numbers and get the new fields filled in.
function merge(raw) {
  const s = blank(), r = raw && typeof raw === 'object' ? raw : {};
  for (const k of ['bank', 'runs', 'out', 'dead', 'best']) if (Number.isFinite(r[k])) s[k] = r[k];
  const i = r.inv || {};
  if (i.flash && Number.isFinite(i.flash.dur)) s.inv.flash.dur = Math.max(0, Math.min(TOOLS.flash.dur, i.flash.dur));
  for (const k of ['gourd', 'stun']) if (i[k] && Number.isFinite(i[k].dur)) s.inv[k] = { dur: Math.max(0, Math.min(TOOLS[k].dur, i[k].dur)) };
  if (Number.isFinite(i.charm)) s.inv.charm = Math.max(0, Math.min(9, Math.floor(i.charm)));
  for (const k in s.dex) if (r.dex && r.dex[k]) for (const f of ['seen', 'killed', 'captured']) if (Number.isFinite(r.dex[k][f])) s.dex[k][f] = r.dex[k][f];
  return s;
}
function read() { try { return merge(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { return blank(); } }

export const save = read();                  // one shared object, mutated in place
export function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
export function resetSave() { const b = blank(); for (const k of Object.keys(save)) delete save[k]; Object.assign(save, b); writeSave(); renderMeta(); }

export const owned = (id) => id === 'shovel' || id === 'flash' || (id === 'charm' ? save.inv.charm > 0 : !!save.inv[id]);
export function buy(id) {
  const t = TOOLS[id]; if (!t || id === 'shovel' || id === 'flash') return { ok: false, msg: 'Đã có sẵn trong bộ đồ nghề.' };
  if ((id === 'gourd' || id === 'stun') && save.inv[id]) return { ok: false, msg: 'Đã có.' };
  if (id === 'charm' && save.inv.charm >= 3) return { ok: false, msg: 'Chỉ mang tối đa 3 摸金符.' };
  if (save.bank < t.buy) return { ok: false, msg: `Thiếu ${(t.buy - save.bank).toLocaleString()} 铲铲币.` };
  save.bank -= t.buy; if (id === 'charm') save.inv.charm++; else save.inv[id] = { dur: t.dur };
  writeSave(); renderMeta(); return { ok: true, msg: `Đã mua ${t.name}.` };
}
export function sell(id) {
  const t = TOOLS[id]; if (!t || id === 'shovel' || id === 'flash' || !owned(id)) return { ok: false, msg: 'Không có gì để bán.' };
  save.bank += t.sell; if (id === 'charm') save.inv.charm--; else save.inv[id] = null;
  writeSave(); renderMeta(); return { ok: true, msg: `Đã bán ${t.name} (+${t.sell.toLocaleString()}).` };
}
export function repair(id) {
  const t = TOOLS[id], it = id === 'flash' ? save.inv.flash : save.inv[id];
  if (!t || !it || !t.dur) return { ok: false, msg: 'Không sửa được.' };
  if (it.dur >= t.dur) return { ok: false, msg: 'Còn nguyên.' };
  if (save.bank < t.repair) return { ok: false, msg: `Thiếu ${(t.repair - save.bank).toLocaleString()} 铲铲币.` };
  save.bank -= t.repair; it.dur = t.dur; writeSave(); renderMeta(); return { ok: true, msg: `Đã sửa ${t.name} (-${t.repair}).` };
}
export function dexMark(id, field) { if (save.dex[id]) { save.dex[id][field]++; } }

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const stars = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
function shopHtml() {
  const rows = Object.entries(TOOLS).map(([id, t]) => {
    const it = id === 'flash' ? save.inv.flash : save.inv[id];
    const has = owned(id), starter = id === 'shovel' || id === 'flash';
    const dur = t.dur && it ? ` · độ bền ${Math.ceil(it.dur)}/${t.dur}` : '';
    const state = starter ? `Có sẵn${dur}` : id === 'charm' ? `Đang mang ${save.inv.charm}/3` : has ? `Đang có${dur}` : `${t.buy.toLocaleString()}`;
    const btns = [];
    if (!starter && !(has && id !== 'charm')) btns.push(`<button data-act="buy" data-id="${id}">Mua ${t.buy.toLocaleString()}</button>`);
    if (id === 'charm' && has) btns.push(`<button data-act="buy" data-id="${id}">Mua thêm</button>`);
    if (!starter && has) btns.push(`<button class="alt" data-act="sell" data-id="${id}">Bán +${t.sell.toLocaleString()}</button>`);
    if (t.dur && it && it.dur < t.dur) btns.push(`<button class="alt" data-act="repair" data-id="${id}">Sửa ${t.repair}</button>`);
    return `<div class="shoprow"><div><b>${t.name}</b><small>${state}</small><small class="dim">${t.note}</small></div><div>${btns.join('')}</div></div>`;
  }).join('');
  return `<h2>Cửa hàng</h2><p class="dim">Kho: <b class="gold" id="shopBank">${save.bank.toLocaleString()}</b> 铲铲币. Giá mua, bán, sửa lấy từ wiki. Đồ nghề không mất khi chết, chỉ mòn độ bền; loot trong túi mới mất.</p>${rows}<p id="shopMsg" class="dim"></p><button class="alt" data-act="back">Quay lại</button>`;
}
function dexHtml() {
  const cards = Object.entries(BESTIARY).map(([id, b]) => {
    const d = save.dex[id], seen = d.seen > 0;
    if (!seen) return `<div class="dexcard locked"><b>???</b><small class="dim">Chưa gặp. Gặp một lần trong hầm mộ để mở khoá.</small></div>`;
    return `<div class="dexcard"><b>${b.name}</b><small class="dim">${b.desc}</small><small>Máu ${stars(b.blood)} · Tốc ${stars(b.spd)} · Công ${stars(b.atk)}</small><small class="dim">${b.wiki}</small><small>Gặp ${d.seen} · Hạ ${d.killed} · Bắt ${d.captured}</small></div>`;
  }).join('');
  return `<h2>Sổ quái</h2><p class="dim">Chỉ số 1–5 và mô tả là của chính game.</p><div class="dexgrid">${cards}</div><button class="alt" data-act="back">Quay lại</button>`;
}
export function renderMeta() {
  if ($('sBank')) { $('sBank').textContent = save.bank.toLocaleString(); $('sRuns').textContent = save.runs; $('sOut').textContent = save.out; }
  if ($('shopPanel') && !$('shopPanel').classList.contains('hide')) $('shopPanel').innerHTML = shopHtml();
  if ($('dexPanel') && !$('dexPanel').classList.contains('hide')) $('dexPanel').innerHTML = dexHtml();
}
export function showPanel(which) {
  for (const [id, p] of [['main', 'mainPanel'], ['shop', 'shopPanel'], ['dex', 'dexPanel']]) $(p).classList.toggle('hide', id !== which);
  renderMeta();
}
export function initMetaUI() {
  $('menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'back') return showPanel('main');
    const r = ({ buy, sell, repair })[act](id); showPanel('shop'); if ($('shopMsg')) $('shopMsg').textContent = r.msg;
  });
  $('openShop').onclick = () => showPanel('shop'); $('openDex').onclick = () => showPanel('dex');
  renderMeta();
}
