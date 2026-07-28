# Game-side save bridge — contract

> Phase 5.3, unit C3. How a hub game reaches the shared cloud save.
> The JS half (`web-hub/js/save-sync.js`, `window.HubSave`) is **implemented and shippable now**.
> The Unity half (`.jslib` + C# `SaveBridge`) below is a **reference spec** to finalize when the
> Survivor WebGL build actually lands in `web-hub/games/survivor/` (Phase 5.4) — there is no build
> to compile it against yet, so treat the C#/`.jslib` code as a template, not a tested artifact.

## The one invariant

**Cloud save is an optional layer *under* the local save, never a replacement.** If the bridge is
absent — game opened offline, hosted on a different origin, or the hub not yet provisioned with a
Supabase project — every call degrades to a clean "no account" result and the game keeps running on
its local save exactly as it does today. Nothing here may throw, block, or gate play.

Consequences:
- The local save stays the single owner during play ([local-save-single-owner](../../docs/memory/local-save-single-owner.md)).
- Cloud is pulled at sign-in / game start, and pushed at run end, on leaving the game, and when the
  tab is hidden. When local and cloud disagree, the newer one wins; the ambiguous both-sides-changed
  case is a visible "keep this device / keep cloud" prompt — decided by `HubSave.reconcile(...)`.

## Why the game can see the hub's session at all

The bridge only works because **the hub and every game are served from one origin** (the hard hosting
constraint in Phase 5.3). That is what lets the game page read the same `localStorage` session the hub
wrote and reach `window.HubSession` / `window.SUPABASE_CONFIG` / `window.HubSave`. Split origins would
break both the shared session and this bridge.

## Layer 1 — the JS contract (`window.HubSave`, implemented)

Load order on the game page (all from the hub root, one origin):

```html
<script src="../../js/session.js"></script>
<script src="../../js/supabase-config.js"></script>
<script src="../../js/supabase-auth.js"></script>
<script src="../../js/save-sync.js"></script>
```

> A Unity WebGL build **overwrites** `games/survivor/index.html` with its own generated page, so these
> four tags belong in the **WebGL template** (`Assets/WebGLTemplates/<name>/index.html` in the Unity
> project) so the build reproduces them — not hand-added to the generated file each build.

API (every async method resolves a plain object, never rejects):

| Call | Resolves |
|---|---|
| `HubSave.isAvailable()` | `true` only when configured **and** a member is signed in |
| `HubSave.whoAmI()` | `{ signedIn, userId, name, email }` — sync; `signedIn:false` for guest / unconfigured |
| `HubSave.loadSave(gameId)` | `{ ok:true, found:true, payload, version, updatedAt }` · `{ ok:true, found:false }` · `{ ok:false, reason:"no-account"\|"unreachable"\|"error", status? }` |
| `HubSave.storeSave(gameId, payload, {version})` | `{ ok:true, version, updatedAt }` · `{ ok:false, reason:"no-account"\|"unreachable"\|"too-large"\|"error", ... }` |
| `HubSave.reconcile(local, cloud, base?)` | `{ winner:"local"\|"cloud"\|"none"\|"conflict", reason }` — pure, no I/O |

Notes:
- `gameId` is the same string used as the registry key and the `game_saves.game_id` column (e.g. `"survivor"`).
- `version` is a **caller-owned monotonic counter** — the game increments its own local save version and
  passes it; the contract does not invent one (default `1`).
- Payload ceiling is ~100 KB (the DB caps `pg_column_size(payload) <= 102400`; `storeSave` pre-checks the
  raw byte size and also maps the DB's 400 back to `reason:"too-large"`).
- Reads/writes run as the signed-in player (JWT `Authorization: Bearer`), so Supabase Row Level Security
  restricts every row to its owner — the client cannot read or write another player's save even if it tries.

## Layer 2 — the Unity `.jslib` shim (reference, finalize at wiring time)

Goes in the Unity project at `Assets/Plugins/WebGL/HubSave.jslib`. It is the only place C# and the hub's
JS meet. Async results come back through `SendMessage(gameObject, method, jsonString)`, so the WebGL
template must expose the loaded instance as `window.unityInstance`.

```javascript
mergeInto(LibraryManager.library, {
  // Synchronous identity — returns a malloc'd UTF8 JSON string Unity marshals to `string`.
  HubSave_WhoAmI: function () {
    var who = (typeof window !== "undefined" && window.HubSave)
      ? window.HubSave.whoAmI() : { signedIn: false };
    var json = JSON.stringify(who);
    var size = lengthBytesUTF8(json) + 1;
    var buf = _malloc(size);
    stringToUTF8(json, buf, size);
    return buf;
  },

  // Async load — result delivered via SendMessage(go, cb, json).
  HubSave_LoadSave: function (gameIdPtr, goPtr, cbPtr) {
    var gameId = UTF8ToString(gameIdPtr), go = UTF8ToString(goPtr), cb = UTF8ToString(cbPtr);
    var send = function (json) { try { window.unityInstance.SendMessage(go, cb, json); } catch (e) {} };
    if (typeof window === "undefined" || !window.HubSave) { send(JSON.stringify({ ok: false, reason: "no-bridge" })); return; }
    window.HubSave.loadSave(gameId).then(function (r) { send(JSON.stringify(r)); });
  },

  // Async store — payloadJson is the save blob already serialized on the C# side.
  HubSave_StoreSave: function (gameIdPtr, payloadPtr, version, goPtr, cbPtr) {
    var gameId = UTF8ToString(gameIdPtr), go = UTF8ToString(goPtr), cb = UTF8ToString(cbPtr);
    var payload; try { payload = JSON.parse(UTF8ToString(payloadPtr)); } catch (e) { payload = {}; }
    var send = function (json) { try { window.unityInstance.SendMessage(go, cb, json); } catch (e) {} };
    if (typeof window === "undefined" || !window.HubSave) { send(JSON.stringify({ ok: false, reason: "no-bridge" })); return; }
    window.HubSave.storeSave(gameId, payload, { version: version }).then(function (r) { send(JSON.stringify(r)); });
  }
});
```

## Layer 3 — the C# side (reference, finalize at wiring time)

A single `MonoBehaviour` under the existing local save owner. `#if UNITY_WEBGL && !UNITY_EDITOR` guards
the `__Internal` imports so the Editor and every non-WebGL target compile with a no-op that reports
"no bridge" — i.e. the game stays local-only everywhere except an actual hub-hosted WebGL build.

```csharp
using System;
using System.Runtime.InteropServices;
using UnityEngine;

public class SaveBridge : MonoBehaviour
{
    const string GameId = "survivor";

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern string HubSave_WhoAmI();
    [DllImport("__Internal")] static extern void HubSave_LoadSave(string gameId, string go, string cb);
    [DllImport("__Internal")] static extern void HubSave_StoreSave(string gameId, string payloadJson, int version, string go, string cb);
#else
    static string HubSave_WhoAmI() => "{\"signedIn\":false}";
    static void HubSave_LoadSave(string g, string go, string cb) => GameObject.Find(go)?.SendMessage(cb, "{\"ok\":false,\"reason\":\"no-bridge\"}");
    static void HubSave_StoreSave(string g, string p, int v, string go, string cb) => GameObject.Find(go)?.SendMessage(cb, "{\"ok\":false,\"reason\":\"no-bridge\"}");
#endif

    Action<string> _onLoaded, _onStored;

    public bool IsSignedIn() => HubSave_WhoAmI().Contains("\"signedIn\":true");

    public void LoadCloud(Action<string> onResultJson)
    {
        _onLoaded = onResultJson;
        HubSave_LoadSave(GameId, gameObject.name, nameof(OnLoadResult));
    }
    void OnLoadResult(string json) => _onLoaded?.Invoke(json);

    public void StoreCloud(string payloadJson, int version, Action<string> onResultJson)
    {
        _onStored = onResultJson;
        HubSave_StoreSave(GameId, payloadJson, version, gameObject.name, nameof(OnStoreResult));
    }
    void OnStoreResult(string json) => _onStored?.Invoke(json);
}
```

Wiring rule: the cloud layer sits **under** the local save owner. Pull on start and reconcile with the
local save (newer wins; conflict → prompt); push on run end / leaving / tab hidden. If any call returns
`ok:false` for any reason, do nothing extra — the local save already holds the truth.

## Absence / degrade matrix

| Situation | `whoAmI().signedIn` | `loadSave` / `storeSave` | Game behavior |
|---|---|---|---|
| Hub not provisioned (empty config) | `false` | `{ok:false, reason:"no-account"}` | local-only |
| Signed in as guest | `false` | `{ok:false, reason:"no-account"}` | local-only |
| Signed-in member, service down | `true` | `{ok:false, reason:"unreachable"}` | local-only this session, retry later |
| Not hosted on the hub (no `HubSave`) | n/a (`.jslib` sends `no-bridge`) | `{ok:false, reason:"no-bridge"}` | local-only |
| Signed-in member, service up | `true` | real data | cloud sync active |
