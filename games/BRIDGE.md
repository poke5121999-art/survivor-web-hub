# Game-side save bridge — contract

> Phase 5.3, units C3 + C5. How a hub game reaches the shared cloud save.
> The JS half (`web-hub/js/save-sync.js`, `window.HubSave`) is **implemented and shippable**.
> The Unity half is **built and shipped as of 2026-07-30** (phase-5.3-patch-5) in `client-survivor`.
> This document is no longer a reference spec: Layers 2 and 3 below point at the shipped code and
> record the three places the original spec was wrong.

## What changed when the spec met a real Unity 6 build

The Layer 2/3 code originally sketched here was written before any WebGL build existed. Finalizing it
against Unity 6000.0.59f2 corrected three things — each of which would have shipped as a silent
runtime failure:

1. **`.jslib` helpers need per-function dependency declarations.** `FnName__deps: ['$stringToUTF8',
   '$lengthBytesUTF8', '$UTF8ToString']`, with the `$` prefix. Without them Emscripten strips the
   helpers and the call fails at runtime with `lengthBytesUTF8 is undefined`. Unity's own library
   sources use exactly this form (`PlaybackEngines/WebGLSupport/BuildTools/lib/WebRequest.js`).
2. **`window.unityInstance` does not exist by default.** Unity's stock `Default` template keeps the
   instance as a closure-local inside its `.then()` callback, so `SendMessage` from a `.jslib` has
   nothing to reach. A **project template** must publish it — see Layer 0 below.
3. **The winner is decided by save version, not by timestamp.** The cloud row's `updated_at` is
   stamped by the database server while the local time comes from the player's device; comparing two
   unsynchronised clocks lets a device with a slow clock revert a newer save. The shipped rule is
   version-first, with the timestamp only as a tiebreak *within* one version.

## Layer 0 — the web template (required, not optional)

A Unity build **overwrites** `games/<id>/index.html` wholesale, so the four hub `<script>` tags below
cannot be hand-added to the generated page — the next build silently drops them and the game goes
local-only again with no error anywhere. They belong in a project template
(`Assets/WebGLTemplates/<name>/index.html`), which the build reproduces every time. Survivor ships
`Assets/WebGLTemplates/HubGame/`, a copy of Unity's `Default` template plus exactly two additions:
the four script tags, and `window.unityInstance = unityInstance;` inside the loader's `.then()`.

## The one invariant

**Cloud save is an optional layer *under* the local save, never a replacement.** If the bridge is
absent — game opened offline, hosted on a different origin, or the hub not yet provisioned with a
Supabase project — every call degrades to a clean "no account" result and the game keeps running on
its local save exactly as it does today. Nothing here may throw, block, or gate play.

Consequences:
- The local save stays the single owner during play ([local-save-single-owner](../../docs/memory/local-save-single-owner.md)).
- Cloud is pulled once at game start and pushed after every local save (debounced), plus immediately
  when the tab is hidden or the app quits. When local and cloud disagree, the **higher save version**
  wins; at equal versions the newer timestamp breaks the tie.
- **No conflict prompt ships yet.** `HubSave.reconcile(local, cloud, base)` can return `conflict` when
  given a base descriptor, but the shipped Unity side does not track a base and never asks — it
  decides. The mitigation is `LocalSaveStore.AdoptCloudSave`, which copies the save it is about to
  replace into a one-slot rollback key (`LocalDataPlayerPreAdopt`) so a wrong automatic verdict is
  recoverable. A visible "keep this device / keep cloud" prompt remains a Phase 5.3 open item.

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
- `payload` crosses as a JSON **object**, not a string: the shim parses the C# side's serialized save
  before handing it over, and re-serializes the whole result before sending it back.
- Payload ceiling is ~100 KB (the DB caps `pg_column_size(payload) <= 102400`; `storeSave` pre-checks the
  raw byte size and also maps the DB's 400 back to `reason:"too-large"`). Survivor's save measures
  ~1.5 KB at mid-progression, so the cap is not a practical constraint for this game.
- Reads/writes run as the signed-in player (JWT `Authorization: Bearer`), so Supabase Row Level Security
  restricts every row to its owner — the client cannot read or write another player's save even if it tries.

## Layer 2 — the Unity `.jslib` shim (shipped)

`client-survivor/survivor/Assets/Plugins/WebGL/HubSave.jslib` — the only place C# and the hub's JS
meet. Three entry points (`HubSave_WhoAmI`, `HubSave_LoadSave`, `HubSave_StoreSave`) plus one internal
`$hubSaveSend` helper that resolves `window.unityInstance` and retries briefly, because a result can
resolve before the page has finished publishing the instance and a dropped result leaves the C# side
waiting for its timeout.

Read the file for the current shape rather than copying from here — the shipped code is the contract.
The three rules it must keep:

- **Declare dependencies per function.** `HubSave_WhoAmI__deps: ['$stringToUTF8', '$lengthBytesUTF8']`,
  `HubSave_LoadSave__deps: ['$UTF8ToString', '$hubSaveSend']`, and likewise for the store call.
  `_malloc` needs no declaration (it is a C export that is always present).
- **Never throw across the boundary.** Every path — missing `window.HubSave`, a rejected promise, an
  unparseable payload — ends in a `{"ok":false,"reason":…}` result delivered through `SendMessage`.
- **Answer every call.** A call that neither resolves nor reports leaves C# to time out, which is a
  worse failure than a clean `no-bridge`.

## Layer 3 — the C# side (shipped)

Three pieces in `client-survivor`, deliberately split so the only part that can be wrong *quietly* is
the only part that is unit-tested:

| File | Role |
|---|---|
| `Assets/Scripts/Managers/Offline/HubSaveBridge.cs` | Dumb transport: the `[DllImport("__Internal")]` entry points, the `SendMessage` callbacks, and managed stubs for every non-WebGL target so the whole layer compiles and runs inert in the Editor. |
| `Assets/Scripts/Managers/Offline/CloudSaveSync.cs` | Policy: boot pull behind a hard timeout, debounced push, flush on focus-loss/quit, adopt path. |
| `Assets/Scripts/Offline.Core/CloudSyncDecision.cs` | The pure verdict (`UseLocal` / `UseCloud` / `Nothing`) — no Unity, no I/O, covered by `Assets/Tests/EditMode/CloudSyncDecisionTests.cs`. |

Wiring rules that hold the invariant up:

- **One push trigger, not a list.** `LocalSaveStore.Save` raises `OnSaved`; `CloudSaveSync` is the only
  subscriber. A new save site cannot forget to sync, because it cannot save without passing through
  the store. Do *not* re-introduce per-site push calls.
- **Pull before the boot's first local read.** Adopting a cloud save later would overwrite a save the
  running game already holds a reference to — two live owners of one blob, which is the dual-owner
  divergence that reverted live progress in phase-2.2-patch-1.
- **Re-point the game's reference when adopting.** `AdoptCloudSave` swaps the store's cached instance;
  the caller must set `GameManager.LocalData = LocalSaveStore.Instance.Load()` in the same step.
- **Never block play.** The boot pull is capped (8 s) and returns false on every failure; a push
  failure is logged once and dropped, with no retry loop.

## Absence / degrade matrix

| Situation | `whoAmI().signedIn` | `loadSave` / `storeSave` | Game behavior |
|---|---|---|---|
| Hub not provisioned (empty config) | `false` | `{ok:false, reason:"no-account"}` | local-only |
| Signed in as guest | `false` | `{ok:false, reason:"no-account"}` | local-only |
| Signed-in member, service down | `true` | `{ok:false, reason:"unreachable"}` | local-only this session, retry on next save |
| Signed-in member, service hangs | `true` | never resolves | boot continues after the 8 s cap, local-only this session |
| Not hosted on the hub (no `HubSave`) | n/a (`.jslib` sends `no-bridge`) | `{ok:false, reason:"no-bridge"}` | local-only |
| Editor / any non-WebGL build | n/a (managed stub) | `{ok:false, reason:"no-bridge"}` | local-only |
| Signed-in member, service up | `true` | real data | cloud sync active |
