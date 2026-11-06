// Phone chat with the town's residents (D:\lumber-ref\rules\chat.md), map 1 only. A built house sends a friend
// request; accepting it queues story 1. A daily chat arrives 300 s of game time after the last chat was completed
// (only while nothing is waiting), picked at random among the friends' unsent dailies. Each chat offers 2 options:
// in a daily the second answer costs an ad; in a story option B (good ending) is locked behind an ad, pays a reward
// and a photo, and releases the next story (levels 2 and 3 also need the house upgraded). Three photos complete a
// resident's album: +0.02 income ratio each, added next to the resident buffs.
//
// State in the map save as `state.chat`; ads are instant, so "ad" arguments just grant.

const STAGE = { intro: 1, replied: 3, done: 9 };
const REWARD = { coin: 1, gem: 2, map: 3, buff: 4 };
const SPEED_BUFF_ITEM = 2; // GameDropAdConf id 2: move speed x1.5

export class Chat {
  constructor(sim) {
    this.sim = sim;
    const c = sim.config;
    this.on = sim.mapId === 0;
    this.interval = c.ChatGlobalConf[0].DailyIntervalSec;
    this.residents = new Map(c.ChatResidentConf.filter(r => r.EnableChat).map(r => [r.BookId, r]));
    this.convs = new Map(c.ChatConversationConf.filter(r => r.MapId === 0).map(r => [r.Id, r]));
    const results = new Map(c.ChatOptionResultConf.map(r => [r.OptionId, r]));
    this.options = new Map();
    for (const o of [...c.ChatOptionConf].sort((a, b) => a.SortIndex - b.SortIndex)) {
      if (!this.options.has(o.ConversationId)) this.options.set(o.ConversationId, []);
      this.options.get(o.ConversationId).push({ ...o, result: results.get(o.Id) });
    }
    this.intro = new Map();
    for (const l of [...c.ChatIntroLineConf].sort((a, b) => a.LineIndex - b.LineIndex)) {
      if (!this.intro.has(l.ConversationId)) this.intro.set(l.ConversationId, []);
      this.intro.get(l.ConversationId).push(l.TextKey);
    }
    this.rewards = new Map(c.ChatRewardConf.map(r => [r.Id, r]));
    this.photos = new Map(c.ChatPhotoConf.map(r => [r.Id, r]));
    this.albumConf = new Map(c.ChatAlbumBonusConf.map(r => [r.ResidentId, r]));
    this.info = new Map(c.ResidentInfoConf.map(r => [r.Id, r]));
    const S = sim.state;
    this.C = S.chat = S.chat || { v: 1, friends: {}, sent: {}, good: {}, pending: {}, queue: [], conv: {}, albums: {} };
    this.wait = this.interval; // the 300 s timer is not saved (rule 57)
    // Saves from before chat existed: every built house has a request waiting (MigrateAllMapChatData, rule 14).
    if (this.on) for (const book of sim.town.T.books) this.request(book);
  }

  // ---- residents and friends
  resident(book) { return this.residents.get(book); }
  name(book) { const r = this.resident(book); const i = r && this.info.get(r.ResidentId); return i ? i.Name : ''; }
  avatar(book) { const r = this.resident(book); const i = r && this.info.get(r.ResidentId); return i ? i.IconChat : ''; }
  friend(book) { return this.C.friends[book] === 'friend'; }
  request(book) {
    if (!this.on || !this.resident(book) || this.C.friends[book]) return;
    this.C.friends[book] = 'pending';
    this.sim.emit({ type: 'chatRequest', book });
  }
  requests() { return Object.keys(this.C.friends).filter(b => this.C.friends[b] === 'pending').map(Number); }
  accept(book) {
    if (this.C.friends[book] !== 'pending') return false;
    this.C.friends[book] = 'friend';
    this.story(book, 1);
    return true;
  }

  // ---- queue
  queued(id) { return this.C.queue.find(q => q.conv === id); }
  enqueue(conf) {
    if (this.queued(conf.Id)) return;
    this.C.queue.push({ conv: conf.Id, at: this.sim.state.clock || 0, read: false, done: false });
    this.sim.emit({ type: 'chatNew', conv: conf.Id });
  }
  pendingQueue() { return this.C.queue.some(q => !q.done); }
  storyConv(book, level) { return [...this.convs.values()].find(c => c.BookId === book && c.ConversationType === 1 && c.StoryLevel === level); }
  // TryTriggerStoryConversation: level 1 always, level n once story n-1 had its good ending; otherwise it waits.
  story(book, level) {
    if (!this.on || !this.friend(book)) return;
    const good = this.C.good[book] || [];
    if (level >= 2 && !good.includes(level - 1)) {
      const p = this.C.pending[book] || (this.C.pending[book] = []);
      if (!p.includes(level)) p.push(level);
      return;
    }
    const conf = this.storyConv(book, level);
    if (conf && !(this.C.conv[conf.Id] && this.C.conv[conf.Id].done)) this.enqueue(conf);
    if (this.C.pending[book]) this.C.pending[book] = this.C.pending[book].filter(l => l !== level);
  }
  checkPending() {
    for (const [book, levels] of Object.entries(this.C.pending)) for (const l of [...levels].sort()) this.story(+book, l);
  }
  // TryTriggerDailyConversation: one unsent daily of any friend, uniformly at random.
  daily(rand = Math.random) {
    const sent = this.C.sent;
    const pool = [...this.convs.values()].filter(c => c.ConversationType === 0 && this.friend(c.BookId)
      && !(sent[c.BookId] || []).includes(c.Id) && !this.queued(c.Id));
    if (!pool.length) return null;
    const conf = pool[Math.floor(rand() * pool.length)];
    this.enqueue(conf);
    (sent[conf.BookId] || (sent[conf.BookId] = [])).push(conf.Id);
    return conf;
  }

  // ---- one conversation
  conf(id) { return this.convs.get(id); }
  opts(id) { return this.options.get(id) || []; }
  conv(id) {
    if (!this.C.conv[id]) {
      const opts = {};
      for (const o of this.opts(id)) opts[o.Id] = { unlocked: !!o.DefaultUnlocked, played: false, claimed: false, doubled: false };
      this.C.conv[id] = { stage: 0, sel: 0, view: 0, done: false, opts };
    }
    return this.C.conv[id];
  }
  enter(id) {
    const q = this.queued(id), v = this.conv(id);
    if (q) q.read = true;
    if (!v.stage) v.stage = STAGE.intro;
    return v;
  }
  option(id, optId) { return this.opts(id).find(o => o.Id === optId); }
  play(id, optId) {
    const v = this.conv(id), o = v.opts[optId];
    o.played = true;
    v.view = optId;
    const res = this.option(id, optId).result;
    if (res && res.PhotoId) this.collectPhoto(res.PhotoId);
  }
  // SelectOption: the first pick, only an unlocked option.
  select(id, optId) {
    const v = this.enter(id);
    if (v.sel || !v.opts[optId] || !v.opts[optId].unlocked) return false;
    v.sel = optId;
    v.stage = STAGE.replied;
    this.play(id, optId);
    this.sim.emit({ type: 'chatPick', conv: id, opt: optId });
    return true;
  }
  // The other answer after the first pick: a daily's costs an ad (SwitchViewingOptionByAd); a story's locked good
  // ending is unlocked by an ad (UnlockOptionByAd) and then played.
  other(id) { const v = this.conv(id); return v.sel ? this.opts(id).find(o => o.Id !== v.sel && !v.opts[o.Id].played) || null : null; }
  playOther(id) {
    const v = this.conv(id), o = this.other(id);
    if (!o) return false;
    this.sim.emit({ type: 'ad' });
    v.opts[o.Id].unlocked = true;
    this.play(id, o.Id);
    this.sim.emit({ type: 'chatPick', conv: id, opt: o.Id });
    return true;
  }
  view(id, optId) { const v = this.conv(id); if (v.opts[optId] && v.opts[optId].played) v.view = optId; }
  // CompleteConversation: when the player leaves a chat they answered. A story records a good ending if B was played.
  complete(id) {
    const v = this.conv(id), conf = this.conf(id);
    if (!v.sel || v.done) return false;
    v.done = true;
    v.stage = STAGE.done;
    const q = this.queued(id);
    if (q) q.done = true;
    if (conf.ConversationType === 1 && this.opts(id).some(o => o.EndingType === 2 && v.opts[o.Id].played)) {
      const g = this.C.good[conf.BookId] || (this.C.good[conf.BookId] = []);
      if (!g.includes(conf.StoryLevel)) g.push(conf.StoryLevel);
      this.checkPending();
    }
    this.wait = this.interval;
    this.sim.emit({ type: 'chatDone', conv: id });
    return true;
  }

  // ---- rewards (rule 35-38)
  reward(id, optId) {
    const o = this.option(id, optId);
    return o && o.result && o.result.RewardId ? this.rewards.get(o.result.RewardId) : null;
  }
  amount(r, double) {
    const base = r.RewardType === REWARD.coin || r.RewardType === REWARD.map ? r.Amount * this.sim.extras.valuable() : r.Amount;
    return base * (double && r.CanDouble ? 2 : 1);
  }
  claimable(id, optId) { const v = this.conv(id).opts[optId]; return !!(v && v.played && !v.claimed && this.reward(id, optId)); }
  claim(id, optId, double) {
    const r = this.reward(id, optId);
    if (!r || !this.claimable(id, optId)) return false;
    if (double && r.CanDouble) this.sim.emit({ type: 'ad' });
    const n = this.amount(r, double);
    if (r.RewardType === REWARD.gem) this.sim.state.gems += n;
    else if (r.RewardType === REWARD.buff) {
      if (r.ItemId === SPEED_BUFF_ITEM) this.sim.meta.buffs.speed = (this.sim.meta.buffs.speed || 0) + r.DurationSeconds;
    } else this.sim.earn(n, 'chat');
    Object.assign(this.conv(id).opts[optId], { claimed: true, doubled: !!(double && r.CanDouble) });
    this.sim.emit({ type: 'chatClaim', conv: id, opt: optId, n });
    return true;
  }

  // ---- album (rule 41-45)
  album(residentId) { return this.C.albums[residentId] || (this.C.albums[residentId] = { photos: [], viewed: [], bonus: false, bonusViewed: false }); }
  photosOf(residentId) { return [...this.photos.values()].filter(p => p.ResidentId === residentId).sort((a, b) => a.SortIndex - b.SortIndex); }
  collectPhoto(photoId) {
    const p = this.photos.get(photoId);
    if (!p) return;
    const a = this.album(p.ResidentId);
    if (a.photos.includes(photoId)) return;
    a.photos.push(photoId);
    const need = this.albumConf.get(p.ResidentId);
    if (!a.bonus && need && a.photos.length >= need.NeedPhotoCount) {
      a.bonus = true;
      this.sim.town.recompute();
      this.sim.emit({ type: 'albumDone', resident: p.ResidentId });
    }
    this.sim.emit({ type: 'photo', id: photoId });
  }
  viewAlbum(residentId) {
    const a = this.album(residentId);
    a.viewed = [...a.photos];
    if (a.bonus) a.bonusViewed = true;
  }
  albumBonus() {
    let n = 0;
    for (const [res, a] of Object.entries(this.C.albums)) {
      const conf = this.albumConf.get(+res);
      if (a.bonus && conf && conf.BonusType === 1) n += conf.BonusValue;
    }
    return n;
  }

  // ---- lists and red dots (rule 46-51)
  // Chats tab order: unread queued, claimable reward, queued but read, open, completed.
  list() {
    const weight = id => {
      const q = this.queued(id), v = this.C.conv[id];
      if (q && !q.done && !q.read) return 400;
      if (v && Object.keys(v.opts).some(o => this.claimable(id, +o))) return 300;
      if (q && !q.done) return 200;
      return v && v.done ? 0 : 100;
    };
    return this.C.queue.filter(q => this.friend(this.conf(q.conv).BookId))
      .map(q => ({ id: q.conv, conf: this.conf(q.conv), w: weight(q.conv), at: q.at }))
      .sort((a, b) => b.w - a.w || b.at - a.at || a.id - b.id);
  }
  hasRequest() { return this.requests().length > 0; }
  hasUnread() { return this.C.queue.some(q => !q.done && !q.read); }
  hasClaimable() { return this.C.queue.some(q => this.opts(q.conv).some(o => this.claimable(q.conv, o.Id))); }
  topUnread() {
    const q = this.C.queue.filter(x => !x.done && !x.read)
      .sort((a, b) => this.conf(b.conv).Priority - this.conf(a.conv).Priority || a.at - b.at)[0];
    return q ? q.conv : 0;
  }

  // ---- hooks
  onEvent(e) {
    if (!this.on) return;
    if (e.type === 'houseDone') this.request(e.book);
    else if (e.type === 'houseUp') { const lv = this.sim.town.houseLv(e.book); if (lv === 2 || lv === 3) this.story(e.book, lv); }
  }
  tick(dt) {
    if (!this.on || this.pendingQueue()) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.interval;
    this.daily();
  }
}

export { REWARD };
