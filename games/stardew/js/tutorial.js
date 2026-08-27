/*
 * tutorial.js - the teaching engine.
 *
 * data/tutorial.js says WHAT is taught and when; this file is the machinery
 * that watches for the moment, shows the card, and never shows it twice.
 *
 * Three things it deliberately does NOT do:
 *
 *  1. It never stops the world for something the player did not just do. A
 *     card only ever appears on the back of an action - stepping onto an
 *     island, tilling the first tile, catching the first Pokemon. Nothing
 *     fires on a timer.
 *
 *  2. It never queues more than one card. If three triggers land on the same
 *     frame (buying an island fires `island:x`, `canBuy` and `rankUp` at
 *     once), the lowest `prio` wins the moment and the rest wait for the next
 *     natural pause. Two modals back to back is how a tutorial starts feeling
 *     like paperwork.
 *
 *  3. It never loses a page. Everything shown is archived to the handbook, so
 *     "what did that say about EVs again" is a menu away rather than gone.
 *
 * The overlay builds its own DOM and injects its own styles. That is on
 * purpose: the tutorial has to be able to run before, during and after any
 * other panel is open, including on the very first frame of a new save, and
 * owning its own layer is the only version of that with no ordering rules.
 */
(function (global) {
  'use strict';

  var A = global.ISL_ATLAS;
  var DATA = global.ISL_TUTORIAL_DATA;

  var game = null;
  var root = null, card = null, taskStrip = null;
  var current = null, pageIndex = 0;
  var pending = [];
  var activeTask = null;
  var suppress = false;

  var CSS = [
    '.isl-tut{position:absolute;inset:0;z-index:120;display:flex;align-items:center;',
    'justify-content:center;padding:16px;background:rgba(8,11,16,.72);',
    'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}',
    '.isl-tutcard{width:min(100%,360px);max-height:86%;overflow:hidden;display:flex;',
    'flex-direction:column;background:linear-gradient(180deg,#2c2218,#3b2d20);',
    'border:3px solid #c9924a;border-radius:16px;box-shadow:0 16px 44px rgba(0,0,0,.6)}',
    '.isl-tuthead{display:flex;align-items:center;gap:8px;padding:10px 12px;',
    'background:rgba(0,0,0,.28);border-bottom:2px solid #6b5a3c}',
    '.isl-tuthead h3{margin:0;font-size:15px;flex:1;color:#ffd870}',
    '.isl-tuthead .isl-tutstep{font-size:11px;opacity:.65}',
    '.isl-tutbody{padding:12px 14px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '.isl-tutart{display:block;margin:0 auto 10px;image-rendering:pixelated}',
    '.isl-tuttext{font-size:13px;line-height:1.6;white-space:pre-line}',
    '.isl-tuttip{margin-top:10px;padding:8px 10px;font-size:12px;line-height:1.5;',
    'background:rgba(232,161,60,.14);border-left:3px solid #e8a13c;border-radius:0 8px 8px 0}',
    '.isl-tutwho{display:flex;align-items:flex-end;gap:8px;margin-bottom:8px}',
    '.isl-tutwho canvas{image-rendering:pixelated;flex:0 0 auto}',
    '.isl-tutfoot{display:flex;align-items:center;gap:8px;padding:10px 12px;',
    'border-top:2px solid #6b5a3c;background:rgba(0,0,0,.2)}',
    '.isl-tutdots{display:flex;gap:5px;flex:1}',
    '.isl-tutdots i{width:7px;height:7px;border-radius:50%;background:#6b5a3c;display:block}',
    '.isl-tutdots i.on{background:#ffd870}',
    '.isl-tutbtn{border:none;border-radius:10px;background:#e8a13c;color:#2a1c0c;',
    'font-weight:700;font-size:13px;padding:9px 18px;cursor:pointer;box-shadow:0 3px 0 #8a5c1e}',
    '.isl-tutbtn:active{transform:translateY(2px);box-shadow:none}',
    '.isl-tutskip{border:none;background:none;color:#c9b48c;font-size:11px;',
    'text-decoration:underline;cursor:pointer;padding:6px}',
    '.isl-task{position:absolute;left:8px;right:8px;top:96px;z-index:40;display:flex;',
    'align-items:center;gap:8px;padding:7px 11px;font-size:12px;pointer-events:none;',
    'background:rgba(15,20,28,.86);border:1px solid #c9924a;border-radius:11px;',
    'box-shadow:0 4px 14px rgba(0,0,0,.4)}',
    '.isl-task b{color:#ffd870;font-size:10px;letter-spacing:.06em}',
    '.isl-task span{flex:1;line-height:1.35}',
    '.isl-task.done{border-color:#5fa855}',
    '.isl-task.done span{text-decoration:line-through;opacity:.7}'
  ].join('');

  function ensureDom() {
    if (root) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.className = 'isl-tut';
    root.style.display = 'none';
    (document.getElementById('stage') || document.body).appendChild(root);
    taskStrip = document.createElement('div');
    taskStrip.className = 'isl-task';
    taskStrip.style.display = 'none';
    (document.getElementById('stage') || document.body).appendChild(taskStrip);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ------------------------------------------------------------------ fire
  /* Called from all over the game. Cheap on purpose: most calls match nothing,
   * and it runs on the back of ordinary actions like tilling a tile. */
  function fire(name, payload) {
    if (!game || !DATA) return;
    var steps = DATA.STEPS;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.on !== name) continue;
      if (game.sim.taught[s.id]) continue;
      if (s.when && !s.when(game, payload)) continue;
      if (pending.indexOf(s) < 0) pending.push(s);
    }
    if (pending.length) pump();
  }

  /* Show the next card if nothing is in the way. `suppress` is raised while a
   * battle, a cutscene or the sleep summary is on screen - a tutorial card
   * over a Pokemon battle is unreadable and un-dismissable on a phone. */
  function pump() {
    if (current || suppress || !pending.length) return;
    if (game && game.busy && game.busy()) return;
    /* `a.prio || 5` was here, and it inverted the whole ordering: the most
     * important cards are the ones written with prio 0, and 0 is falsy, so
     * every one of them sorted to the BACK. The result was that the opening
     * "welcome" card lost its slot to the movement card and then sat in the
     * queue behind it - a new player's very first screen was the one that
     * explains the joystick, with no idea where they were or why. */
    pending.sort(function (a, b) {
      return (a.prio == null ? 5 : a.prio) - (b.prio == null ? 5 : b.prio);
    });
    show(pending.shift());
  }

  function setSuppressed(on) {
    suppress = !!on;
    if (!on) setTimeout(pump, 350);
  }

  // ------------------------------------------------------------------ show
  function show(step, replay) {
    ensureDom();
    current = step;
    pageIndex = 0;
    if (!replay) {
      game.sim.taught[step.id] = 1;
      if (game.sim.handbook.indexOf(step.id) < 0) game.sim.handbook.push(step.id);
    }
    root.innerHTML = '';
    card = el('div', 'isl-tutcard');
    root.appendChild(card);
    root.style.display = 'flex';
    if (game.pause) game.pause(true);
    render();
  }

  function render() {
    var step = current;
    var page = step.pages[pageIndex];
    card.innerHTML = '';

    var head = el('div', 'isl-tuthead');
    head.appendChild(el('h3', null, step.title));
    if (step.pages.length > 1) {
      head.appendChild(el('span', 'isl-tutstep', (pageIndex + 1) + '/' + step.pages.length));
    }
    card.appendChild(head);

    var body = el('div', 'isl-tutbody');
    if (page.art && A && A.has(page.art)) {
      var big = A.icon(page.art, artSize(page.art));
      big.className = 'isl-tutart';
      body.appendChild(big);
    }
    if (step.who && A && A.has(step.who)) {
      var row = el('div', 'isl-tutwho');
      row.appendChild(A.icon(step.who, 48));
      var t1 = el('div', 'isl-tuttext', page.text);
      row.appendChild(t1);
      body.appendChild(row);
    } else {
      body.appendChild(el('div', 'isl-tuttext', page.text));
    }
    if (page.tip) body.appendChild(el('div', 'isl-tuttip', '💡 ' + page.tip));
    card.appendChild(body);

    var foot = el('div', 'isl-tutfoot');
    var dots = el('div', 'isl-tutdots');
    for (var i = 0; i < step.pages.length; i++) {
      var d = el('i'); if (i === pageIndex) d.className = 'on';
      dots.appendChild(d);
    }
    foot.appendChild(dots);
    if (pageIndex > 0) {
      var back = el('button', 'isl-tutskip', 'Quay lại');
      back.onclick = function () { pageIndex--; render(); };
      foot.appendChild(back);
    }
    if (step.pages.length > 1 && pageIndex + 1 < step.pages.length) {
      var skip = el('button', 'isl-tutskip', 'Bỏ qua');
      skip.onclick = function () { close(); };
      foot.appendChild(skip);
    }
    var next = el('button', 'isl-tutbtn',
      pageIndex + 1 < step.pages.length ? 'Tiếp' : 'Hiểu rồi');
    next.onclick = function () {
      if (pageIndex + 1 < step.pages.length) { pageIndex++; render(); }
      else close();
    };
    foot.appendChild(next);
    card.appendChild(foot);
  }

  /* Story panels are 256x128 and want showing large; a 12px item icon wants
   * showing at 4x, not stretched to 200. Sizing off the frame rather than a
   * constant is what keeps both looking deliberate. */
  function artSize(name) {
    var w = A.width(name), h = A.height(name);
    var big = Math.max(w, h);
    if (big >= 96) return 240;
    if (big >= 40) return 128;
    return 96;
  }

  function close() {
    current = null;
    if (root) root.style.display = 'none';
    if (game.pause) game.pause(false);
    // pin the objective, if this card carried one
    if (activeTaskFor()) showTask();
    setTimeout(pump, 250);
  }

  // ------------------------------------------------------------------ task
  function activeTaskFor() {
    if (!game || !DATA) return null;
    if (activeTask && !activeTask.step.task.done(game)) return activeTask;
    var steps = DATA.STEPS;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (!s.task || !game.sim.taught[s.id]) continue;
      if (game.sim.flags['task:' + s.id]) continue;
      if (s.task.done(game)) { game.sim.flags['task:' + s.id] = 1; continue; }
      activeTask = { step: s };
      return activeTask;
    }
    activeTask = null;
    return null;
  }

  function showTask() {
    ensureDom();
    var t = activeTask;
    if (!t) { taskStrip.style.display = 'none'; return; }
    taskStrip.className = 'isl-task';
    taskStrip.innerHTML = '';
    taskStrip.appendChild(el('b', null, 'VIỆC CẦN LÀM'));
    taskStrip.appendChild(el('span', null, t.step.task.text));
    taskStrip.style.display = 'flex';
  }

  /* Polled once a second from the game loop, not per frame: a `done` predicate
   * may walk the world, and doing that sixty times a second to update a strip
   * of text is the kind of cost nobody ever goes looking for. */
  var lastPoll = 0;
  function tick(now) {
    if (now - lastPoll < 1000) return;
    lastPoll = now;
    if (!taskStrip) return;
    if (activeTask && activeTask.step.task.done(game)) {
      game.sim.flags['task:' + activeTask.step.id] = 1;
      taskStrip.className = 'isl-task done';
      var done = activeTask;
      activeTask = null;
      setTimeout(function () {
        if (activeTask !== done) { taskStrip.style.display = 'none'; showTask(); }
      }, 2200);
      if (game.toast) game.toast('✔ ' + done.step.task.text);
      return;
    }
    if (!activeTask) { activeTaskFor(); showTask(); }
  }

  // -------------------------------------------------------------- handbook
  /* Everything ever shown, re-openable from the menu. This is the half of the
   * design that lets the cards stay short: a card can say "type decides the
   * job" and leave the full table to a page the player can come back to. */
  function handbook() {
    if (!game || !DATA) return [];
    return game.sim.handbook.map(function (id) { return DATA.byId(id); })
                            .filter(Boolean);
  }
  function replay(id) {
    var s = DATA.byId(id);
    if (s) show(s, true);
  }

  function init(g) {
    game = g;
    ensureDom();
  }

  /* Drop everything queued as well as what is on screen. The settings toggle
   * uses this, and so does anything that needs the world unblocked NOW. */
  function skipAll() {
    pending.length = 0;
    if (current) close();
  }

  global.ISL_TUTORIAL = {
    init: init, fire: fire, tick: tick, replay: replay, handbook: handbook,
    setSuppressed: setSuppressed, isOpen: function () { return !!current; },
    dismiss: close, skipAll: skipAll,
    pending: function () { return pending.length; }
  };
})(window);
