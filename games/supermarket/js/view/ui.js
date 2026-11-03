// DOM panels: HUD, computer (market), shelf, price, register, day report.
import { iconOf, money } from './icons.js';
import { DENOMS } from '../sim/sim.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const chip = p => { const ic = iconOf(p); return `<span class="ico" style="background:${ic.color}">${ic.emoji}</span>`; };

export class UI {
  constructor(sim, sfx) {
    this.sim = sim; this.sfx = sfx; this.panel = null; this.cart = {};
    this.hud = $('#hud'); this.prompt = $('#prompt'); this.toastBox = $('#toasts'); this.bubbles = $('#bubbles');
    this.layer = $('#panel');
    $('#openbtn').onclick = () => { const r = sim.openStore(); if (r.ok) { this.toast('Store is open! Customers are coming.'); sfx.play('open'); } };
    this.bubbleEls = new Map();
  }

  toast(text, kind = '') {
    while (this.toastBox.children.length >= 2) this.toastBox.firstChild.remove();
    const t = h('div', 'toast ' + kind, text); this.toastBox.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
  }

  updateHud() {
    const s = this.sim.s, t = s.time, hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60;
    const span = this.sim.levelSpan(), pct = span.hi > span.lo ? (s.exp - span.lo) / (span.hi - span.lo) * 100 : 100;
    const status = { prep: 'Closed', open: 'Open', closing: 'Closing', report: 'Closed' }[s.phase];
    $('#day').textContent = `Day ${s.day}`;
    $('#clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('#status').textContent = status; $('#status').className = 'status ' + s.phase;
    $('#money').textContent = money(s.money);
    $('#lvl').textContent = `Lv ${span.level}`;
    $('#expbar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('#explbl').textContent = `${s.exp} / ${span.hi} exp`;
    $('#openbtn').style.display = s.phase === 'prep' ? '' : 'none';
    const dl = s.deliveries.length ? `🚚 ${s.deliveries.length} order${s.deliveries.length > 1 ? 's' : ''} · ${Math.ceil(Math.min(...s.deliveries.map(d => d.remain)))}s` : '';
    $('#deliv').textContent = dl; $('#deliv').style.display = dl ? '' : 'none';
    $('#goal').innerHTML = this.goal();
    const q = this.sim.queueLen();
    $('#queue').textContent = q ? `🧍 ${q} waiting` : ''; $('#queue').style.display = q ? '' : 'none';
  }

  goal() { // first-day hints, derived from the state (no tutorial data in the APK configs is used here)
    const sim = this.sim, s = sim.s;
    if (s.phase === 'report') return '';
    const stocked = s.shelves.some(sh => sh.layers.some(L => L && L.count));
    if (!stocked && !s.carry && s.boxes.length) return '📦 Pick up the box in the yellow delivery zone';
    if (!stocked && s.carry) return '🗄️ Carry the box to a shelf and fill a layer';
    if (s.carry && sim.carried().count === 0) return '🗑️ Throw the empty box in the green bin';
    if (s.phase === 'prep' && s.day === 1) return '🔓 Press “Open store” at the top';
    if (sim.register && !this.isOpen('register')) return '🧾 A customer is waiting — go to the register';
    if (s.day === 1 && s.served >= 2 && !Object.keys(s.ordered).length && s.money >= 1000) return '🖥️ Use the computer to order more stock';
    if (s.phase === 'closing') return '🌙 Closing time — serve the last customers';
    if (s.toPlace.length) return '🗄️ Walk to a glowing spot and press E to place your furniture';
    const next = sim.data.licenses.find(L => L.kind === 'product' && !s.licenses.includes(L.id));
    if (next && sim.licenseState(next.id) === 'buy' && s.phase !== 'open') return `📜 ${next.name} is ready — buy it on the computer for new products`;
    return '';
  }

  setPrompt(text) { this.prompt.style.display = text ? '' : 'none'; if (text) this.prompt.innerHTML = text; }

  // ---- generic panel ---------------------------------------------------------------------------------------------
  open(kind, build) {
    this.close();
    this.panel = { kind };
    this.layer.innerHTML = ''; this.layer.className = 'panel ' + kind; this.layer.style.display = '';
    const card = h('div', 'card'); this.layer.appendChild(card);
    this.panel.card = card; this.panel.build = build;
    build(card);
  }
  refresh() { if (this.panel) { const sc = this.panel.card.querySelector('.scroll'); const top = sc ? sc.scrollTop : 0; this.panel.card.innerHTML = ''; this.panel.build(this.panel.card); const sc2 = this.panel.card.querySelector('.scroll'); if (sc2) sc2.scrollTop = top; } }
  close() { if (this.panel && this.panel.onClose) this.panel.onClose(); this.panel = null; this.layer.style.display = 'none'; this.layer.innerHTML = ''; }
  isOpen(kind) { return this.panel && (!kind || this.panel.kind === kind); }
  head(card, title, sub = '') {
    const hd = h('div', 'phead', `<div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`);
    const x = h('button', 'x', '✕'); x.onclick = () => this.close(); x.dataset.act = 'close'; hd.appendChild(x); card.appendChild(hd);
  }

  // ---- computer: market -------------------------------------------------------------------------------------------
  openComputer(tab = this.compTab || 'products') {
    const sim = this.sim; this.compTab = tab;
    this.open('computer', card => {
      this.head(card, '🖥️ Computer', `Balance ${money(sim.s.money)} · Store level ${sim.level}`);
      const tabs = h('div', 'tabs');
      for (const [k, label] of [['products', '🛒 Products'], ['licenses', '📜 Licenses'], ['furniture', '🗄️ Furniture'], ['sections', '🏗️ Sections']]) {
        const b = h('button', k === this.compTab ? 'on' : '', label); b.dataset.tab = k; b.onclick = () => { this.compTab = k; this.refresh(); }; tabs.appendChild(b);
      }
      card.appendChild(tabs);
      const list = h('div', 'scroll'); card.appendChild(list);
      const T = this.compTab;
      if (T === 'products') {
        for (const p of sim.catalogue()) {
          const un = sim.unlocked(p.id), lic = sim.lic(p.license);
          const row = h('div', 'row' + (un ? '' : ' locked'));
          const n = this.cart[p.id] || 0;
          const where = p.shelf === 303 ? ' · ❄️ fridge' : p.shelf === 305 ? ' · 🍎 yellow shelf' : '';
          row.innerHTML = `${chip(p)}<div class="grow"><b>${p.name}</b><small>${un ? `${p.load} per box · unit ${money(p.cost)} · stock ${sim.stockOf(p.id)}${where}` : `🔒 ${lic ? lic.name : 'License'}`}</small></div>` +
            (un ? `<div class="price">${money(sim.boxPrice(p.id))}</div>` : '');
          if (un) {
            const q = h('div', 'qty');
            const minus = h('button', '', '−'), plus = h('button', '', '+'), num = h('span', '', String(n));
            minus.onclick = () => { this.cart[p.id] = Math.max(0, n - 1); this.refresh(); };
            plus.onclick = () => { this.cart[p.id] = n + 1; this.refresh(); };
            plus.dataset.add = p.id;
            q.append(minus, num, plus); row.appendChild(q);
          }
          list.appendChild(row);
        }
      } else if (T === 'licenses' || T === 'sections') {
        const kind = T === 'licenses' ? 'product' : 'section';
        for (const L of sim.data.licenses.filter(l => l.kind === kind)) {
          const st = sim.licenseState(L.id), row = h('div', 'row' + (st === 'owned' ? ' owned' : ''));
          const what = kind === 'product' ? sim.catalogue().filter(p => p.license === L.id).map(p => iconOf(p).emoji).join(' ') : `+${2.4} m of floor, more shelf space`;
          row.innerHTML = `<span class="ico" style="background:${kind === 'product' ? '#ffe8a3' : '#c7ecee'}">${kind === 'product' ? '📜' : '🏗️'}</span><div class="grow"><b>${L.name}</b><small>${what}</small><small>Lv ${L.level}${L.requires ? ' · after ' + sim.lic(L.requires).name : ''}</small></div>`;
          if (st === 'owned') row.appendChild(h('span', 'tag good', '✓ Owned'));
          else {
            const b = h('button', st === 'buy' ? 'primary' : '', L.price ? money(L.price) : 'Free'); b.disabled = st !== 'buy'; b.title = st; b.dataset.buy = L.id;
            b.onclick = () => { const r = sim.buyLicense(L.id); if (r.ok) this.sfx.play('cash'); else this.toast(r.why, 'bad'); this.refresh(); };
            const w = h('div', 'buycol'); w.appendChild(b); if (st !== 'buy') w.appendChild(h('small', 'bad', st)); row.appendChild(w);
          }
          list.appendChild(row);
        }
      } else if (T === 'furniture') {
        const free = sim.freeSlots().length;
        list.appendChild(h('div', 'note', `${free} free spot${free === 1 ? '' : 's'} on the floor${sim.s.toPlace.length ? ` · ${sim.s.toPlace.length} waiting to be placed` : ''}`));
        for (const f of sim.furnitureShop()) {
          const row = h('div', 'row');
          const use = { 302: 'Shelf for most goods', 303: 'Cold goods: drinks, milk, meat, fish', 305: 'Fruit' }[f.sub];
          const mine = sim.s.shelves.filter(x => x.kind === f.sub).length;
          row.innerHTML = `<span class="ico" style="background:${f.sub === 303 ? '#dff3ff' : f.sub === 305 ? '#f2c14e' : '#dfe4ea'}">${f.sub === 303 ? '🧊' : f.sub === 305 ? '🍎' : '🗄️'}</span><div class="grow"><b>${f.name}</b><small>${use} · you have ${mine}</small></div>`;
          const b = h('button', 'primary', money(f.price)); b.dataset.furn = f.id;
          b.disabled = sim.s.money < f.price || !free;
          b.onclick = () => { const r = sim.buyFurniture(f.id); if (r.ok) { this.sfx.play('cash'); this.close(); } else { this.toast(r.why, 'bad'); this.refresh(); } };
          row.appendChild(b); list.appendChild(row);
        }
      }
      const total = Object.entries(this.cart).reduce((a, [pid, n]) => a + sim.boxPrice(Number(pid)) * n, 0);
      const foot = h('div', 'pfoot');
      const info = h('div', 'grow');
      if (sim.s.deliveries.length) {
        const sm = h('small', '');
        sim.s.deliveries.forEach((d, i) => {
          const it = h('span', 'deliv', `${chip(sim.P.get(d.pid))}×${d.boxes} ${Math.ceil(d.remain)}s`);
          const fast = h('button', 'mini', `⚡ ${money(sim.data.settings.deliverySpeedUpCash)}`); fast.dataset.fast = i;
          fast.onclick = () => { const r = sim.speedUp(i); if (!r.ok) this.toast(r.why, 'bad'); this.refresh(); };
          it.appendChild(fast); sm.appendChild(it);
        });
        info.appendChild(sm);
      }
      if (T === 'products') info.appendChild(h('b', '', `Cart ${money(total)}`));
      foot.appendChild(info);
      if (T === 'products') {
        const go = h('button', 'primary', 'Order'); go.dataset.act = 'order';
        go.disabled = !total || total > sim.s.money;
        go.onclick = () => {
          const r = sim.order(this.cart);
          if (r.ok) { this.cart = {}; this.toast(`Ordered for ${money(r.total)}. Delivery soon.`, 'good'); this.sfx.play('cash'); }
          else this.toast(r.why, 'bad');
          this.refresh();
        };
        foot.appendChild(go);
      }
      card.appendChild(foot);
    });
  }

  // ---- shelf ----------------------------------------------------------------------------------------------------
  openShelf(shelfId) {
    const sim = this.sim;
    this.open('shelf', card => {
      const sh = sim.s.shelves.find(s => s.id === shelfId), b = sim.carried();
      this.head(card, '🗄️ Shelf', b ? `Carrying ${sim.P.get(b.pid).name} — ${b.count} left in the box` : 'Pick up a box to stock this shelf.');
      const list = h('div', 'scroll');
      for (let li = 3; li >= 0; li--) {
        const L = sh.layers[li], p = L && L.count ? sim.P.get(L.pid) : null;
        const row = h('div', 'row');
        row.innerHTML = p ? `${chip(p)}<div class="grow"><b>${p.name}</b><small>${L.count} / ${p.cap} · price ${money(sim.price(p.id))}</small></div>` :
          `<span class="ico empty">·</span><div class="grow"><b>Empty layer ${li + 1}</b><small>${b ? `holds ${sim.P.get(b.pid).cap} ${sim.P.get(b.pid).name}` : ''}</small></div>`;
        if (b) {
          const why = sim.canStock(shelfId, li);
          const one = h('button', '', 'Put 1'), all = h('button', 'primary', 'Fill');
          one.disabled = all.disabled = !!why; one.title = all.title = why || '';
          one.dataset.stock = `${li}:1`; all.dataset.stock = `${li}:99`;
          one.onclick = () => { if (sim.stock(shelfId, li, 1).ok) this.sfx.play('put'); this.refresh(); };
          all.onclick = () => { const r = sim.stock(shelfId, li, 99); if (r.ok) this.sfx.play('put'); this.refresh(); };
          row.append(one, all);
        }
        if (p) { const pr = h('button', '', '🏷️'); pr.title = 'Set price'; pr.dataset.price = p.id; pr.onclick = () => this.openPrice(p.id, () => this.openShelf(shelfId)); row.appendChild(pr); }
        list.appendChild(row);
      }
      card.appendChild(list);
    });
  }

  // ---- price ----------------------------------------------------------------------------------------------------
  openPrice(pid, back) {
    const sim = this.sim, p = sim.P.get(pid);
    let v = sim.price(pid);
    this.open('price', card => {
      this.head(card, `🏷️ ${p.name}`, `Range ${money(p.min)} ~ ${money(p.max)}`);
      const prem = Math.floor((v - sim.market(pid)) * 100 / sim.market(pid));
      const body = h('div', 'pricebody');
      body.innerHTML = `<div class="kv"><span>Cost</span><b>${money(p.cost)}</b></div><div class="kv"><span>Market price</span><b>${money(sim.market(pid))}</b></div>
        <div class="kv"><span>Profit per item</span><b class="${v - p.cost >= 0 ? 'good' : 'bad'}">${money(v - p.cost)}</b></div>
        <div class="bigprice">${money(v)}</div><div class="hint ${prem >= 5 ? 'bad' : ''}">${prem > 0 ? `${prem}% above market — some customers will say it is too expensive` : prem < 0 ? `${-prem}% below market` : 'Same as market price'}</div>`;
      const sl = h('input'); sl.type = 'range'; sl.min = p.min; sl.max = p.max; sl.value = v; sl.className = 'slider';
      sl.oninput = () => { v = Number(sl.value); this.refresh(); };
      body.appendChild(sl);
      const steps = h('div', 'steps');
      for (const d of [-100, -10, -1, 1, 10, 100]) { const b = h('button', '', (d > 0 ? '+' : '−') + money(Math.abs(d)).slice(1)); b.onclick = () => { v = Math.max(p.min, Math.min(p.max, v + d)); this.refresh(); }; steps.appendChild(b); }
      const mk = h('button', '', 'Market'); mk.onclick = () => { v = sim.market(pid); this.refresh(); }; steps.appendChild(mk);
      body.appendChild(steps); card.appendChild(body);
      const foot = h('div', 'pfoot'); const ok = h('button', 'primary', 'Set price'); ok.dataset.act = 'setprice';
      ok.onclick = () => { sim.setPrice(pid, v); this.toast(`${p.name}: ${money(v)}`, 'good'); if (back) back(); else this.close(); };
      foot.appendChild(h('div', 'grow')); foot.appendChild(ok); card.appendChild(foot);
    });
    this.panel.priceValue = () => v;
  }

  // ---- register -----------------------------------------------------------------------------------------------
  openRegister(onLeave) {
    const sim = this.sim; let typed = '';
    this.open('register', card => {
      const R = sim.register;
      this.head(card, '🧾 Register', R ? '' : sim.queueLen() ? 'Next customer is coming…' : 'Waiting for customers');
      card.querySelector('.x').onclick = () => { this.close(); onLeave(); };
      if (!R) { card.appendChild(h('div', 'empty', sim.s.phase === 'prep' ? 'The store is closed. Open it to let customers in.' : '🕐')); return; }
      const top = h('div', 'reg');
      const belt = h('div', 'belt');
      belt.innerHTML = '<small>Belt — tap items to scan</small>';
      R.belt.forEach((pid, i) => { const b = h('button', 'item', `${iconOf(sim.P.get(pid)).emoji}`); b.style.background = iconOf(sim.P.get(pid)).color; b.title = sim.P.get(pid).name; b.dataset.scan = i;
        b.onclick = () => { sim.scan(i); this.sfx.play('beep'); typed = ''; this.refresh(); }; belt.appendChild(b); });
      if (!R.belt.length) belt.appendChild(h('div', 'done', '✓ All scanned'));
      const rec = h('div', 'receipt');
      rec.innerHTML = R.scanned.slice(-6).map(it => `<div><span>${sim.P.get(it.pid).name}</span><b>${money(it.price)}</b></div>`).join('') +
        `<div class="tot"><span>Total (${R.scanned.length})</span><b>${money(R.total)}</b></div>`;
      top.append(belt, rec); card.appendChild(top);
      if (R.phase !== 'pay') return;
      const pay = h('div', 'pay');
      if (R.method === 'card') {
        pay.innerHTML = `<div class="paymsg">💳 Card payment — type the total on the terminal</div><div class="screen">${typed ? money(Number(typed)) : '$0.00'}</div>`;
        const pad = h('div', 'pad');
        for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫']) {
          const b = h('button', '', k); b.dataset.key = k;
          b.onclick = () => { typed = k === '⌫' ? typed.slice(0, -1) : (typed + k).replace(/^0+/, '').slice(0, 7); this.sfx.play('tick'); this.refresh(); };
          pad.appendChild(b);
        }
        const ok = h('button', 'primary wide', 'Charge'); ok.dataset.act = 'charge';
        ok.onclick = () => { const r = sim.card(Number(typed || 0)); if (r.ok) { this.sfx.play('cash'); this.toast(`+${money(r.net)}`, 'good'); } else { this.sfx.play('err'); this.toast('Wrong amount', 'bad'); } typed = ''; this.refresh(); };
        pay.appendChild(pad); pay.appendChild(ok);
        this.panel.type = k => { if (/^[0-9]$/.test(k)) typed = (typed + k).replace(/^0+/, '').slice(0, 7); else if (k === 'Backspace') typed = typed.slice(0, -1); else if (k === 'Enter') ok.onclick(); this.refresh(); };
      } else {
        const given = R.given.reduce((a, b) => a + b, 0), due = sim.changeDue();
        pay.innerHTML = `<div class="paymsg">💵 Cash — customer gave <b>${money(R.paid)}</b></div>
          <div class="change"><div><small>Change due</small><b>${money(due)}</b></div><div><small>Giving</small><b class="${given === due ? 'good' : given > due ? 'warn' : ''}">${money(given)}</b></div></div>`;
        const drawer = h('div', 'drawer');
        for (const d of DENOMS) { const b = h('button', d >= 100 ? 'bill' : 'coin', d >= 100 ? '$' + d / 100 : d + '¢'); b.dataset.denom = d; b.onclick = () => { sim.giveChange(d); this.sfx.play('coin'); this.refresh(); }; drawer.appendChild(b); }
        const undo = h('button', '', '↶ Undo'); undo.onclick = () => { sim.giveChange(-1); this.refresh(); };
        const ok = h('button', 'primary', 'Give change'); ok.dataset.act = 'givechange';
        ok.onclick = () => { const r = sim.confirmChange(); if (r.ok) { this.sfx.play('cash'); this.toast(`+${money(r.net)}`, 'good'); } else { this.sfx.play('err'); this.toast('Change error: not enough change (−3 satisfaction)', 'bad'); } this.refresh(); };
        const row = h('div', 'payfoot'); row.append(undo, ok);
        pay.appendChild(drawer); pay.appendChild(row);
      }
      card.appendChild(pay);
    });
    this.panel.onClose = null;
  }

  // ---- day report ----------------------------------------------------------------------------------------------
  openReport() {
    const sim = this.sim, r = sim.s.lastReport;
    this.open('report', card => {
      this.head(card, `📊 Day ${r.day} report`);
      card.querySelector('.x').remove();
      const rows = [
        ['Customers', `${r.served} served / ${r.customers} came`], ['Satisfaction', `${r.satisfaction}`],
        ["Couldn't find", r.unableFind], ['Too expensive', r.tooExpensive], ['Short change', r.lessMoney],
        ['Income', money(r.income)], ['Stock cost', '−' + money(r.cost)], ['Upgrades', '−' + money(r.upgrade)],
        ['Rent', '−' + money(r.rent)], ['Salary', '−' + money(r.salary)],
        ['Profit', `<b class="${r.profit >= 0 ? 'good' : 'bad'}">${money(r.profit)}</b>`], ['Balance', money(r.balance)],
        ['Store level', `Lv ${r.level} · ${r.exp} exp (+${r.expGained})`],
      ];
      const t = h('div', 'scroll report'); t.innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
      card.appendChild(t);
      const foot = h('div', 'pfoot'); const go = h('button', 'primary', 'Start next day'); go.dataset.act = 'nextday';
      go.onclick = () => { sim.nextDay(); this.close(); this.toast(`Day ${sim.s.day}. Restock, then open the store.`); };
      foot.appendChild(h('div', 'grow')); foot.appendChild(go); card.appendChild(foot);
    });
  }

  // ---- speech bubbles ---------------------------------------------------------------------------------------
  updateBubbles(world) {
    const live = new Set();
    for (const c of this.sim.customers) {
      if (!c.bubble) continue;
      live.add(c.id);
      let el = this.bubbleEls.get(c.id);
      if (!el) { el = h('div', 'bubble'); this.bubbles.appendChild(el); this.bubbleEls.set(c.id, el); }
      el.textContent = c.bubble.text; el.className = 'bubble ' + c.bubble.kind;
      const p = world.screenOf(c.x, 1.75, c.z);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      el.style.display = p.vis ? '' : 'none';
    }
    for (const [id, el] of this.bubbleEls) if (!live.has(id)) { el.remove(); this.bubbleEls.delete(id); }
  }
}
