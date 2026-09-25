// Chạy nguyên văn Lua gốc (Campaign/LoungeQuest/NpcTalk/Mission) bằng fengari.
// Mỗi script một _ENV riêng, Common.lua chạy vào chính _ENV đó (hàm chung thấy được biến của campaign).
// Hàm `await` gốc tự coroutine.yield() tới khi task.IsCompleted, nên host chỉ cần resume mọi coroutine mỗi khung.
(function (VD) {
  'use strict';

  // Enum gốc trong Common.lua (ELuaEvent).
  const EV = { NpcInteraction: 1, TriggerInteraction: 2, CollisionTriggerEnter: 101, MonsterKill: 201, WaveStarted: 202,
    WaveFailed: 203, WaveCleared: 204, ArtifactDeal: 205, QuestStateChanged: 221, QuestTaskAchieved: 222,
    MissionStateChanged: 231, MissionTaskAchieved: 232, LoungeQuestStateChanged: 241, Custom: 999 };

  const BOOT = `
local js = require "js"
__scripts = {}
__co = {}
local host = js.global.VD.lua
function __ensure(key)
  local env = __scripts[key]
  if env then return env end
  local src = host:source(key)
  if not src then return nil end
  env = setmetatable({}, { __index = _G })
  env._G = env
  local common = host:source("Common/Common")
  if common and key ~= "Common/Common" then
    local cf, cerr = load(common, "@Common/Common", "t", env)
    if not cf then error(cerr) end
    cf()
  end
  local f, err = load(src, "@" .. key, "t", env)
  if not f then error(err) end
  f()
  __scripts[key] = env
  return env
end
function __has(key, fname)
  local env = __ensure(key)
  return env ~= nil and type(rawget(env, fname)) == "function"
end
function __spawn(key, fname, a, b)
  local env = __ensure(key)
  if not env then return false end
  local fn = rawget(env, fname)
  if type(fn) ~= "function" then return false end
  local co = coroutine.create(function() fn(a, b) end)
  __co[#__co + 1] = { co = co, key = key, fn = fname }
  __resume(#__co)
  return true
end
function __resume(i)
  local c = __co[i]
  host:setContext(c.key)
  local ok, err = coroutine.resume(c.co)
  host:setContext(nil)
  if not ok then host:error(c.key .. "." .. c.fn .. ": " .. tostring(err)) end
  return ok
end
function __tick()
  local i = 1
  while i <= #__co do
    local c = __co[i]
    if coroutine.status(c.co) == "dead" then table.remove(__co, i)
    else
      if not __resume(i) then table.remove(__co, i) else i = i + 1 end
    end
  end
  return #__co
end
`;

  const L = {
    EV, state: null, ctx: null, api: Object.create(null), warned: new Set(), errors: [], trace: null,
    fengari: null,
  };

  // Vài script gốc có dấu cách không ngắt (U+00A0) ngoài chuỗi (LoungeQuest/80100 dòng 179, 810800): Lua 5.3 của fengari không đọc được.
  L.source = function (key) { const s = (VD.LUA && VD.LUA[key]) || null; return s && s.indexOf(' ') >= 0 ? s.replace(/ /g, ' ') : s; };
  L.setContext = function (key) { L.ctx = key || null; };
  L.error = function (msg) { L.errors.push(msg); console.error('[lua] ' + msg); };

  // Task trả cho hàm ...Async: Lua gốc poll IsCompleted.
  L.task = function (promiseOrValue) {
    const t = { IsCompleted: false, Result: null };
    Promise.resolve(promiseOrValue).then(r => { t.Result = r == null ? null : r; t.IsCompleted = true; },
      e => { L.error(String(e && e.message || e)); t.IsCompleted = true; });
    return t;
  };
  L.done = function (r) { return { IsCompleted: true, Result: r == null ? null : r }; };

  // Bảng Lua → giá trị JS. fengari-interop đưa bảng sang JS dưới dạng proxy có get/has.
  L.table = function (t) {
    if (t == null || typeof t !== 'object' && typeof t !== 'function') return t;
    if (typeof t.get !== 'function') return t;
    const out = {};
    for (let i = 1; ; i++) { if (!t.has(i)) break; out[i - 1] = L.table(t.get(i)); out.length = i; }
    return out;
  };
  L.field = (t, k) => (t && typeof t.get === 'function') ? t.get(k) : t && t[k];

  const apiProxy = new Proxy(Object.create(null), {
    get(_, name) {
      if (typeof name !== 'string') return undefined;
      const fn = L.api[name];
      return function () {
        // Gọi kiểu LuaApi:Foo(...) thì interop đưa bảng LuaApi làm `this`; LuaApi.Foo(...) thì không.
        const args = Array.prototype.slice.call(arguments);
        if (L.trace) L.trace.push(name);
        if (fn) return fn.apply(null, args);
        if (!L.warned.has(name)) { L.warned.add(name); console.warn('[lua] LuaApi.' + name + ' chưa làm'); }
        return /^(Get|Has|Is)/.test(name) ? null : L.done(null);
      };
    },
  });

  L.init = function () {
    const f = window.fengari;
    if (!f) throw new Error('fengari chưa nạp');
    L.fengari = f;
    const { lua, lauxlib, lualib, interop, to_luastring } = f;
    const st = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(st);
    lauxlib.luaL_requiref(st, to_luastring('js'), interop.luaopen_js, 1); lua.lua_pop(st, 1);
    L.state = st;
    window.__VD_LUAAPI = apiProxy;
    L.run(BOOT + '\nLuaApi = js.global.__VD_LUAAPI');
    // Hàm dựng phía C# mà Lua gọi như hàm toàn cục.
    L.run(`function DialogSpeakerEntry(t, id, portrait) return { SpeakerType = t, Id = id, Portrait = portrait } end`);
    L.run(`__TYPES = {}`);
  };

  L.run = function (src) {
    const { lua, lauxlib, to_luastring, to_jsstring } = L.fengari;
    if (lauxlib.luaL_dostring(L.state, to_luastring(src)) !== 0) {
      const msg = to_jsstring(lauxlib.luaL_tolstring(L.state, -1));
      lua.lua_settop(L.state, 0);
      throw new Error(msg);
    }
  };

  function callBool(fnName, argsLua) {
    const { lua, to_luastring } = L.fengari;
    L.run('__ret = ' + fnName + '(' + argsLua + ')');
    lua.lua_getglobal(L.state, to_luastring('__ret'));
    const v = lua.lua_toboolean(L.state, -1);
    lua.lua_pop(L.state, 1);
    return v;
  }
  const q = s => JSON.stringify(String(s));
  const lit = v => typeof v === 'string' ? q(v) : v == null ? 'nil' : String(Number(v));

  // Chạy fname trong script key như một coroutine. Trả false nếu script/hàm không có.
  L.call = function (key, fname, a, b) {
    return callBool('__spawn', q(key) + ',' + q(fname) + ',' + lit(a) + ',' + lit(b));
  };
  L.has = (key, fname) => callBool('__has', q(key) + ',' + q(fname));
  // Gửi sự kiện cho mọi script đang hoạt động (campaign hiện tại + lounge quest đang chạy).
  L.event = function (keys, type, value) {
    for (const k of keys) L.call(k, 'OnEvent', type, value);
  };
  L.tick = function () {
    if (!L.state) return 0;
    const { lua, to_luastring } = L.fengari;
    L.run('__n = __tick()');
    lua.lua_getglobal(L.state, to_luastring('__n'));
    const n = lua.lua_tointeger(L.state, -1);
    lua.lua_pop(L.state, 1);
    return n;
  };
  L.busy = () => L.tick.last > 0;

  // Chuỗi thoại gốc dạng "<Key:LQ_1100_101>câu tiếng Hàn". Lấy bản Vi theo khoá, không có thì bỏ tiền tố.
  L.text = function (s) {
    if (s == null) return '';
    s = String(s);
    // LocalizedText giữ xuống dòng dạng chữ "\n" (hai ký tự): đổi thành xuống dòng thật.
    return s.replace(/<Key:([^>]+)>([^<]*)/g, (m, key, ko) => (VD.TEXT && VD.TEXT[key]) || (VD.TEXT_EN && VD.TEXT_EN[key]) || ko).replace(/\\n/g, '\n');
  };

  VD.lua = L;
})(window.VD = window.VD || {});
