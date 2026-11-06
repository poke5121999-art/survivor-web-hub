// Phone chat panels (rules/chat.md rules 51-53), built from art/ui/panels/chatpaneluipanel.json:
//   ChatPanelRootUIPanel  three tabs: Chats (conversations), Notice (friend requests), Album (3 photos per resident).
//   ChatPanelUIPanel      one conversation, rebuilt from the sim state every time (rule 57); only the fade-in of
//                         newly added lines is timed, nothing in the state depends on it.
//   ChatDoubleRewardPanel the plain / ad-doubled claim for a coin or gem gift.
// open() = Chats tab, open('notice') = Notice tab, open('chats', convId) = straight into that conversation.

import { Modal, fmt, COIN, GEM } from './panels.js';
import { REWARD } from '../sim/chat.js';

const ROW_W = 656.68, ROW_H = 124.1, STAGGER = 0.4;
const KINDS = ['ChatMsgNode', 'ChatMsgNodePlayer', 'RewardMsgNode', 'PhotoNode', 'OptionGroupNode', 'addunlock'];
const TABS = ['chats', 'notice', 'album'];
const TOG = { chats: 'togFrientd', notice: 'togNotice', album: 'togPhoto' };
const ROOT = 'ChatPanelRootUIPanel', CONV = 'ChatPanelUIPanel';
const LOCK = 'telephone_icon_photo_lock';
const SHADOW = '1.2px 1.8px 0 rgba(0,0,0,0.455)';

export class ChatPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, ROOT, []);
    this.screen = 'root';
    this.tab = 'chats';
    this.conv = 0;
    this.seen = new Set();
    ui.prefetch(pj, CONV, [COIN, GEM, LOCK]);
  }

  // ---- open / close
  begin(mode, convId) {
    this.dropDouble();
    this.tab = mode === 'notice' ? 'notice' : mode === 'album' ? 'album' : 'chats';
    if (convId && this.sim.chat.conf(convId)) this.enterConv(convId);
    else this.toRoot();
  }

  toRoot() {
    this.screen = 'root';
    this.prefab = ROOT;
  }

  enterConv(id) {
    const ch = this.sim.chat, q = ch.queued(id);
    const fresh = !q || !q.read; // a chat seen before shows at once instead of replaying its fade-in
    this.screen = 'conv';
    this.prefab = CONV;
    this.conv = id;
    this.seen = new Set();
    ch.enter(id);
    this.preseed = !fresh;
  }

  leave() {
    if (this.screen === 'conv') this.sim.chat.complete(this.conv);
  }

  close() {
    this.dropDouble();
    this.leave();
    this.screen = 'root';
    this.prefab = ROOT;
    this.viewer = null;
    super.close();
  }

  dropDouble() {
    if (this.dbl) { this.dbl.remove(); this.dbl = null; }
  }

  // ---- shared helpers
  btn(el, fn) {
    el.classList.add('btn');
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  }

  setText(el, s) {
    if (el) this.ui.text(el, el._node, s);
  }

  // Sets a text node's string but keeps its child nodes (icons placed inside a text node by the prefab).
  keepText(el, s) {
    const kids = [...el.children];
    el.textContent = s;
    kids.forEach(k => el.appendChild(k));
  }

  // A node with a prefab sprite swaps it; one without (ImgPhoto) gets a background image.
  pic(el, name) {
    if (!el) return;
    if (el._node && el._node.image) { this.ui.setSprite(el, name); return; }
    el.style.backgroundImage = name && this.ui.SPR[name] ? `url("${this.ui.url(name)}")` : '';
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
  }

  setup() {
    this.sig = '';
    if (this.screen === 'conv') this.setupConv();
    else this.setupRoot();
  }

  update(force) {
    if (!this.p) return;
    if (this.screen === 'root') {
      const sig = this.rootSig();
      if (force || sig !== this.sig) { this.sig = sig; this.fillRoot(); }
    }
  }

  // =============================================================== root screen
  setupRoot() {
    const { p } = this;
    this.bar();
    this.hidden = false;
    // The bar is a HorizontalLayoutGroup that stretches three zero-width toggles into thirds; ui.js lays out neither the
    // toggles nor what they hold, so spread them here.
    const third = parseFloat(p.get('toggle').style.width) / 3;
    const shift = el => { el.style.left = `${parseFloat(el.style.left) + third / 2}px`; };
    TABS.forEach((t, i) => {
      const tog = p.get(TOG[t]);
      Object.assign(tog.style, { left: `${i * third}px`, width: `${third}px`, top: '0', height: '100%' });
      for (const k of tog.children) {
        const nm = k.dataset.name;
        if (nm === 'Pre_UIRedpoint') shift(k);
        else if (nm === 'clode' || nm === 'open') {
          k.style.width = `${third}px`;
          for (const g of k.children) if (g.dataset.name) shift(g);
        }
      }
      this.btn(tog, () => this.setTab(t));
    });
    this.sc = this.scroller(p.get('ViewFriend'));
    this.sc.style.display = 'block';
    this.sc.style.position = 'absolute';
    // the Notice prefab view sits 1.5 px left of the other two; the Chats box is used for all three
    if (this.viewer) { this.viewer = null; }
  }

  setTab(t) {
    if (this.tab === t) return;
    this.tab = t;
    this.sig = '';
    this.fillRoot();
  }

  rootSig() {
    const ch = this.sim.chat;
    return [this.tab, ch.requests().join(), ch.list().map(l => `${l.id}${this.state(l.id)}`).join(), this.albumSig()].join('|');
  }

  albumSig() {
    const ch = this.sim.chat;
    return this.albumList().map(r => ch.album(r.ResidentId).photos.length + (ch.album(r.ResidentId).bonus ? 'b' : '')).join();
  }

  // 'new' unread, 'reply' not answered yet, 'open' something to claim, 'done'.
  state(id) {
    const ch = this.sim.chat, q = ch.queued(id), v = ch.conv(id);
    if (q && !q.done && !q.read) return 'new';
    if (!v.sel) return 'reply';
    if (ch.opts(id).some(o => ch.claimable(id, o.Id))) return 'open';
    return 'done';
  }

  albumList() {
    const ch = this.sim.chat;
    return [...ch.residents.values()].filter(r => ch.friend(r.BookId) || ch.album(r.ResidentId).photos.length)
      .sort((a, b) => a.BookId - b.BookId);
  }

  fillRoot() {
    const { p, ui, sim } = this, ch = sim.chat;
    const t = this.tab;
    for (const k of TABS) {
      const tog = p.get(TOG[k]);
      const on = k === t;
      tog.querySelector('[data-name="open"]').style.display = on ? '' : 'none';
      tog.querySelector('[data-name="clode"]').style.display = on ? 'none' : '';
    }
    this.show(p.get(TOG.chats).querySelector('[data-name="Pre_UIRedpoint"]'), ch.hasUnread() || ch.hasClaimable());
    this.show(p.get(TOG.notice).querySelector('[data-name="Pre_UIRedpoint"]'), ch.hasRequest());
    const title = p.get('top').querySelector('[data-name="Text (Legacy)"]');
    this.setText(title, p.get(TOG[t]).querySelector('[data-name="clode"] [data-name="Text (Legacy)"]').textContent);
    const sc = this.sc;
    const keep = sc.scrollTop;
    sc.textContent = '';
    let n = 0;
    if (t === 'chats') n = this.fillChats(sc);
    else if (t === 'notice') n = this.fillNotice(sc);
    else n = this.fillAlbum(sc);
    this.show(p.get('empty'), n === 0);
    sc.scrollTop = keep;
    if (t === 'album') this.albumList().forEach(r => ch.viewAlbum(r.ResidentId));
  }

  cell(sc, name, h) {
    const box = document.createElement('div');
    box.style.cssText = `position:relative;width:653px;height:${h}px;flex:none`;
    sc.appendChild(box);
    return this.ui.instance(this.pj, ROOT, name, box);
  }

  fillChats(sc) {
    const { ui, sim } = this, ch = sim.chat;
    const list = ch.list();
    for (const it of list) {
      const o = this.cell(sc, 'ViewFriend/Viewport/ChatListItemPrefab', 139.66);
      const book = it.conf.BookId;
      ui.setSprite(o.get('Image_Avatar bg'), ch.avatar(book));
      this.setText(o.get('name'), ui.t(ch.name(book)));
      this.setText(o.get('des'), ui.t(it.conf.TitleKey));
      const st = this.state(it.id);
      this.show(o.get('Pre_UIRedpoint'), st === 'new' || st === 'open');
      const lab = document.createElement('div');
      lab.textContent = ui.t({ new: 'ChatNew', reply: 'ChatReply', open: 'ChatOpen', done: 'ChatDone' }[st]);
      lab.className = 'n t';
      lab.style.cssText = `right:34px;top:20px;width:150px;height:44px;font-size:26px;justify-content:flex-end;align-items:center;color:${st === 'done' ? '#9a9a9a' : '#e4572e'}`;
      o.root.appendChild(lab);
      this.btn(o.root, () => { this.leave(); this.enterConv(it.id); this.rebuild(); });
    }
    return list.length;
  }

  fillNotice(sc) {
    const { ui, sim } = this, ch = sim.chat;
    const reqs = ch.requests();
    for (const book of reqs) {
      const o = this.cell(sc, 'ViewNotice/Viewport/ChatListItemPrefab', 126.64);
      ui.setSprite(o.get('Image_Avatar bg'), ch.avatar(book));
      this.setText(o.get('name'), ui.t(ch.name(book)));
      this.show(o.get('Pre_UIRedpoint'), false);
      const agree = o.get('Pre_BtnAdTicket');
      this.btn(agree, () => { if (ch.accept(book)) { this.tab = 'chats'; this.sig = ''; this.fillRoot(); } });
    }
    return reqs.length;
  }

  fillAlbum(sc) {
    const { ui, sim } = this, ch = sim.chat;
    const list = this.albumList();
    for (const r of list) {
      const o = this.cell(sc, 'ViewPhoto/Viewport/ChatListItemPrefab', 609.43);
      const a = ch.album(r.ResidentId), photos = ch.photosOf(r.ResidentId);
      ui.setSprite(o.get('Image_Avatar bg'), ch.avatar(r.BookId));
      this.setText(o.get('name'), ui.t(ch.name(r.BookId)));
      this.setText(o.get('collect'), ui.t('Collected'));
      const cn = o.get('collectnum');
      cn.innerHTML = `<span style="color:#0DBC43">${a.photos.length}</span>/${photos.length}`;
      this.setText(o.get('des'), a.bonus ? `${ui.t('HomeTownBuffIncome')} +${Math.round((ch.albumConf.get(r.ResidentId) || {}).BonusValue * 100)}%` : ui.t('collectall'));
      ['item1', 'item1 (1)', 'item1 (2)', 'item1 (3)'].forEach((nm, i) => {
        const el = o.root.querySelector(`[data-name="${nm}"]`);
        if (i >= photos.length) { el.style.display = 'none'; return; }
        const got = a.photos.includes(photos[i].Id);
        ui.setSprite(el, got ? photos[i].AssetKey : LOCK);
        if (got) this.btn(el, () => this.viewPhoto(photos[i].AssetKey));
      });
    }
    return list.length;
  }

  viewPhoto(sprite) {
    const v = document.createElement('div');
    v.style.cssText = 'position:absolute;inset:0;z-index:30;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;pointer-events:auto';
    const img = document.createElement('img');
    img.src = this.ui.url(sprite);
    img.style.cssText = 'max-width:86%;max-height:70%;border:8px solid #fff;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,0.6)';
    v.appendChild(img);
    v.addEventListener('click', e => { e.stopPropagation(); v.remove(); this.viewer = null; });
    this.wrap.appendChild(v);
    this.viewer = v;
  }

  // =============================================================== conversation screen
  setupConv() {
    const { p, ui, sim } = this, ch = sim.chat, id = this.conv, conf = ch.conf(id);
    const x = p.get('BtnClose');
    this.btn(x, () => this.close());
    this.btn(p.get('BtnClose (1)'), () => { this.leave(); this.toRoot(); this.rebuild(); });
    ui.setSprite(p.get('Image_Avatar bg (1)'), ch.avatar(conf.BookId));
    this.setText(p.get('name (1)'), ui.t(ch.name(conf.BookId)));
    this.setText(p.get('des (1)'), ui.t('Online'));
    this.sc = this.scroller(p.get('Scroll View'));
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;padding:14px 0 26px';
    this.sc.appendChild(col);
    this.col = col;
    this.fillConv();
  }

  // The ordered line list, from the sim state only (rule 27 / 57).
  lines() {
    const { ui, sim } = this, ch = sim.chat, id = this.conv, v = ch.conv(id);
    const L = [];
    (ch.intro.get(id) || []).slice(0, 2).forEach((k, i) => L.push({ key: `n${i}`, kind: 'ChatMsgNode', text: ui.t(k) }));
    if (!v.sel) {
      L.push({ key: 'opt', kind: 'OptionGroupNode', opts: ch.opts(id).filter(o => v.opts[o.Id].unlocked) });
      return L;
    }
    for (const o of ch.opts(id)) {
      if (!v.opts[o.Id].played) continue;
      const r = o.result;
      if (r) {
        L.push({ key: `pl${o.Id}`, kind: 'ChatMsgNodePlayer', text: ui.t(r.PlayerReplyTextKey) });
        String(r.NpcReplyTextKeys || '').split('|').filter(Boolean).forEach((k, i) =>
          L.push({ key: `rp${o.Id}.${i}`, kind: 'ChatMsgNode', text: ui.t(k) }));
        if (r.PhotoId && ch.photos.get(r.PhotoId)) L.push({ key: `ph${o.Id}`, kind: 'PhotoNode', sprite: ch.photos.get(r.PhotoId).AssetKey });
      }
      const rw = ch.reward(id, o.Id);
      if (rw) L.push({ key: `rw${o.Id}.${v.opts[o.Id].claimed ? 1 : 0}`, kind: 'RewardMsgNode', opt: o.Id, rw, claimed: v.opts[o.Id].claimed });
    }
    if (ch.other(id)) L.push({ key: 'ad', kind: 'addunlock' });
    return L;
  }

  fillConv() {
    const keep = this.sc.scrollTop, atEnd = this.sc.scrollTop + this.sc.clientHeight >= this.sc.scrollHeight - 4;
    const col = this.col;
    col.textContent = '';
    const L = this.lines();
    if (this.preseed) { L.forEach(l => this.seen.add(l.key)); this.preseed = false; }
    let fresh = 0;
    for (const l of L) {
      const row = this.row(l);
      if (!this.seen.has(l.key)) {
        this.seen.add(l.key);
        row.style.opacity = '0';
        row.style.transition = 'opacity 0.25s ease-out';
        const d = fresh++ * STAGGER;
        setTimeout(() => { row.style.opacity = '1'; this.scrollEnd(); }, d * 1000 + 20);
      }
    }
    this.sc.scrollTop = atEnd || fresh ? 1e6 : keep;
    if (fresh) this.scrollEnd();
  }

  scrollEnd() {
    if (this.sc) this.sc.scrollTo({ top: this.sc.scrollHeight, behavior: 'smooth' });
  }

  row(l) {
    const { ui, sim } = this, ch = sim.chat;
    const host = document.createElement('div');
    host.style.cssText = `position:relative;width:${ROW_W}px;flex:none`;
    this.col.appendChild(host);
    const o = ui.instance(this.pj, CONV, 'ChatListItemPrefab', host, { show: [l.kind], hide: KINDS.filter(k => k !== l.kind) });
    let h = ROW_H;
    const node = o.get(l.kind);
    if (l.kind === 'ChatMsgNode' || l.kind === 'ChatMsgNodePlayer') {
      const bg = node.querySelector('[data-name="Image_Bg"]'), tx = node.querySelector('[data-name="Text_Chat"]');
      tx.textContent = l.text;
      tx.style.height = 'auto';
      tx.style.alignItems = 'flex-start';
      const th = tx.offsetHeight;
      const bh = Math.max(104.19, th + 44);
      const mid = ROW_H / 2;
      bg.style.top = `${mid - bh / 2}px`;
      bg.style.height = `${bh}px`;
      tx.style.top = `${mid - th / 2 + (l.kind === 'ChatMsgNode' ? 0 : -5.67)}px`;
      h = bh + 22;
    } else if (l.kind === 'PhotoNode') {
      this.pic(node.querySelector('[data-name="ImgPhoto"]'), l.sprite);
      h = 240;
      const im = node.querySelector('[data-name="ImgPhoto"]');
      this.btn(im, () => this.viewPhoto(l.sprite));
    } else if (l.kind === 'OptionGroupNode') {
      const btns = [1, 2].map(i => node.querySelector(`[data-name="BtnOption${i}"]`));
      btns.forEach((b, i) => {
        const opt = l.opts[i];
        if (!opt) { b.style.display = 'none'; return; }
        if (l.opts.length === 1) b.style.left = `${(ROW_W - 296.74) / 2}px`;
        const tx = b.querySelector('[data-name="Text"]');
        this.setText(tx, ui.t(opt.OptionTextKey));
        tx.style.alignItems = 'center';
        this.btn(b, () => { if (ch.select(this.conv, opt.Id)) this.fillConv(); });
      });
      h = 142;
    } else if (l.kind === 'RewardMsgNode') {
      this.fillReward(node, l);
      h = 162;
    } else if (l.kind === 'addunlock') {
      this.setText(node.querySelector('[data-name="des"]'), ui.t('UnlockNewChatOp'));
      const claim = node.querySelector('[data-name="claim"]');
      this.setText(claim, 'FREE');
      this.btn(claim, () => { if (ch.playOther(this.conv)) this.fillConv(); });
      h = 162;
    }
    host.style.height = `${h}px`;
    o.root.style.top = `${(h - ROW_H) / 2}px`;
    return host;
  }

  rewardText(rw) {
    const ch = this.sim.chat;
    if (rw.RewardType === REWARD.buff) return `Speed x1.5 ${rw.DurationSeconds}s`;
    return `x${fmt(ch.amount(rw, false))}`;
  }

  rewardIcon(rw) {
    return rw.RewardType === REWARD.gem ? GEM : rw.RewardType === REWARD.buff ? '' : COIN;
  }

  fillReward(node, l) {
    const { ui } = this, rw = l.rw;
    const un = node.querySelector('[data-name="Node_Unclaim"]'), cl = node.querySelector('[data-name="Node_Claimed"]');
    this.show(un, !l.claimed);
    this.show(cl, !!l.claimed);
    this.pic(node.querySelector('[data-name="icon"]'), this.rewardIcon(rw));
    const num = node.querySelector('[data-name="Num"]');
    num.textContent = this.rewardText(rw);
    if (rw.RewardType === REWARD.buff) num.style.fontSize = '36px';
    const claim = un.querySelector('[data-name="claim"]');
    this.setText(claim, 'Claim');
    if (l.claimed) {
      const c = document.createElement('div');
      c.className = 'n t';
      c.textContent = ui.t('ChatDone');
      c.style.cssText = 'left:0;right:0;bottom:12px;height:40px;font-size:28px;justify-content:center;align-items:center;color:#fff;text-shadow:' + SHADOW;
      cl.appendChild(c);
    } else {
      this.btn(claim, () => this.claim(l));
    }
  }

  claim(l) {
    const ch = this.sim.chat, rw = l.rw;
    if (rw.RewardType !== REWARD.buff && rw.CanDouble) { this.openDouble(l); return; }
    if (ch.claim(this.conv, l.opt, false)) this.fillConv();
  }

  // =============================================================== double reward panel
  openDouble(l) {
    const { ui, sim } = this, ch = sim.chat, rw = l.rw;
    this.dropDouble();
    const ov = document.createElement('div');
    ov.style.cssText = 'position:absolute;inset:0;z-index:40;background:rgba(0,0,0,0.6);pointer-events:auto';
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) ov.addEventListener(ev, e => e.stopPropagation());
    ov.addEventListener('click', e => { if (e.target === ov) this.dropDouble(); });
    this.wrap.appendChild(ov);
    this.dbl = ov;
    const d = ui.panel(this.pj, 'ChatDoubleRewardPanel', ov, {});
    const icon = this.rewardIcon(rw);
    const title = d.get('title').querySelector('[data-name="Text (Legacy)"]');
    this.setText(title, 'Double Chance');
    this.setText(d.get('txtDesc'), rw.RewardType === REWARD.gem ? 'Watch an ad to double your gems!' : 'Watch an ad to double your coins!');
    const cur = d.get('TxtCur'), curIcon = cur.querySelector('[data-name="Image"]');
    this.keepText(cur, fmt(ch.amount(rw, false)));
    // TxtCur is zero-wide and centred, so its number would sit under its own icon: end the number at the box edge
    // (just before the arrow) and slide the icon left by the number's width.
    cur.style.fontSize = '40px';
    const probe = document.createElement('span');
    probe.textContent = cur.firstChild.textContent;
    cur.appendChild(probe);
    const tw = probe.offsetWidth;
    probe.remove();
    cur.style.justifyContent = 'flex-end';
    cur.style.fontSize = '40px';
    cur.style.left = `${parseFloat(cur.style.left) - 14}px`;
    curIcon.style.left = `${-tw - 66 - 8}px`;
    this.keepText(d.get('TxtNext'), fmt(ch.amount(rw, true)));
    for (const el of [d.get('Image (1)'), d.get('TxtCur').querySelector('[data-name="Image"]'), d.get('TxtNext').querySelector('[data-name="Image"]')]) this.pic(el, icon);
    const gem = d.get('Pre_BtnGem'), ad = d.get('Pre_BtnAd');
    this.setText(gem.querySelector('[data-name="Text (Legacy)"]'), 'Claim');
    const done = double => { this.dropDouble(); if (ch.claim(this.conv, l.opt, double)) this.fillConv(); };
    this.btn(gem, () => done(false));
    this.btn(ad, () => done(true));
  }
}
