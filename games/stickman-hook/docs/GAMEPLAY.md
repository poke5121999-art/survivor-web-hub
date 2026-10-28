# Stickman Hook — gameplay rules recovered from ARMv7 IL2CPP

Spec for a JavaScript remake. Source: `dump/asm/*.s` plus `tools/arm_method.py` disassembly of
helpers, field offsets from `il2cpp/dump.cs`. Every rule carries `[asm 0x...]` = instruction it rests on.
Pseudocode is C#-like and literal (including odd-looking code). Anything not provable from the
binary is marked **UNKNOWN**.

Conventions
- Unity 2D physics units (m, s). `angularVelocity` is **degrees/second** (Unity convention).
- `ForceMode2D.Impulse` = `r3 = 1` on `Rigidbody2D.AddForce`; Δv = impulse / mass (mass = 2).
- Virtual slots (ARM32 vtable offset = 0xC0 + 8*slot):
  PlayerHookController: 4 Update(0xE0), 5 Grab(0xE8), 6 UnGrab(bool)(0xF0), 7 ShouldUpdate(0xF8).
  Target: 5 UnHook(0xE8), 6 MarkNormal(bool)(0xF0), 7 MarkAsClosest(0xF8), 8 MarkAsHooked(0x100).
  PlayerController: 4 Spawn(Vector2)(0xE0), 5 ShowSpawnFx(0xE8), 7 KillPlayer(0xF8), 8 Respawn(0x100).
- Unannotated helpers, identified by call shape: `0x10b9664` = `UnityEngine.Object.op_Inequality(a,b)`
  (`x != null` when b = 0), `0x10b9674` = `Component.get_gameObject`, `0x10b9684` = (one-arg, called on a
  GameObject right after use) most likely `Object.Destroy` — only used for FX/indicator cleanup.

Known serialized values (prefab, given by caller) are used where the asm reads the field; the
asm `.ctor` defaults are listed too, so you can tell them apart.

| Field | .ctor default | prefab value |
|---|---|---|
| PlayerHookController.ropeImpulseActive (0x20) | true `[asm 0x120bff8]` | 1 |
| PlayerHookController.ropeImpulseForce (0x24) | 0.05 `[asm 0x120bfe0, 0x120bfec]` | 0.3 |
| PlayerHookController.ropeImpulseCooldown (0x28) | 0.5 `[asm 0x120bff0]` | 0.5 |
| PlayerHookController.ropeLength (0x40, private, not serialized) | **-1.0** `[asm 0x120bfdc, 0x120bfe4]` | n/a |
| PlayerCollisionController.angularMultiplier (0x18) | 200 `[asm 0x12058b8]` | 200 |
| PlayerAnimationController.hookedStoppedSpeedThreshold (0x24) | 0.1 `[asm 0x120358c]` | 0.5 |
| PlayerAnimationController.hookAnimationDuration (0x28) | 0.5 `[asm 0x120359c]` | 0.15 |
| PlayerAnimationController.minCooldownBetweenAnimations (0x2C) | 0 (not written) | **UNKNOWN** |
| PlayerController.timeToSpawn (0x2C) | 0.75 `[asm 0x120764c]` | 0.75 |
| PlayerController.growthDuration (0x30) | 0.25 `[asm 0x1207650]` | 1.0 |
| BumperAnimationController.bounciness (0x14) | 1.3 `[asm 0x11ffe64]` | 1 |
| BumperAnimationController.forceImpulse (0x1C) | (1,1) `[asm 0x11ffe58]` | (0,30) |

Physics body (prefab): Rigidbody2D mass 2, gravityScale 1.1, angularDamping 0.05, CircleCollider2D r 0.375;
SpringJoint2D frequency 3, dampingRatio 0.5, anchor (-0.03, 0.58), autoConfigureDistance false.
Project `Physics2D.gravity`, player/bumper/wall `PhysicsMaterial2D` friction/bounciness: **UNKNOWN**
(asset data, not in code).

---

## 1. Target selection

### UpdateTargetList (Awake; also adventure pattern spawner)
```csharp
targets = GamePlayService.WorldContainer.GetComponentsInChildren<Target>(includeInactive: true);
```
- WorldContainer = GamePlayService field 0x64 `[asm 0x120a358]` (getter `0x129a24c` reads 0x64);
  `includeInactive = true` `[asm 0x120a36c]`; result stored in `targets` (0x48) `[asm 0x120a380]`.
- Called from `Awake` `[asm 0x120a1ec]` and only otherwise from AdventurePatternSpawner (binary BL scan).
  Normal levels: the list is built once.

### When it runs
```csharp
// PlayerHookController.Update (every frame)
if (!ShouldUpdate()) return;                                   // [asm 0x120ada0..0x120adb4]
if (isGrabbing && hookedTarget == null) {                      // [asm 0x120adb8, 0x120adf0]
    UnGrab(forced: true);                                      // [asm 0x120ae00..0x120ae10]
    animationController.SetState(HOOK /*2*/);                  // [asm 0x120ae28, 0x120ae30]
}
UpdateClosestTarget(0f);                                       // [asm 0x120ae38, 0x120ae3c]
SetupRope();                                                   // [asm 0x120ae44]
// ...then aim indicator (adventure only, see below)

bool ShouldUpdate() => canGrab && animationController.CurrentState != FINISHED /*6*/;
                                                               // [asm 0x120bfa0..0x120bfcc]
```
So the closest target is recomputed **every frame**, always with `preferForwardTargets = 0`
(the only other caller is Start/Grab, also with 0: `[asm 0x120a4d4, 0x120b7c0]`).

### UpdateClosestTarget(float preferForwardTargets = 0)
```csharp
float factor = Clamp(1f - preferForwardTargets, 0.01f, 1f);    // [asm 0x120a5cc..0x120a608]
// With the only argument ever passed (0): factor == 1 -> NO forward preference in practice.

// 1) drop current closest if it left range (only when ropeLength > 0)
if (closestTarget != null && ropeLength > 0) {                 // [asm 0x120a620, 0x120a638]
    float d = |player.pos.xy - closestTarget.pos.xy|;          // [asm 0x120a708..0x120a718]
    if (d > ropeLength) {                                      // [asm 0x120a71c..0x120a724]
        closestTarget.MarkNormal(false);                       // [asm 0x120a744..0x120a750]
        closestTarget = null; closestTargetRope = null;        // [asm 0x120a754, 0x120a758]
    }
}

// 2) scan
Target best = null; float bestScore = -1f; Target inRange = null;   // [asm 0x120a764, 0x120a768, 0x120a770]
for (int i = 0; i < targets.Length; i++) {
    Target t = targets[i];
    if (t == null) continue;                                   // [asm 0x120a7bc]
    if (t.IsDestroyed()) continue;                             // [asm 0x120a7d0]
    if (!t.isActiveTarget) continue;                           // [asm 0x120a7e8..0x120a7f0]  (Target+0x24)
    Vector2 tp = t.transform.position, pp = player.position;
    float weight = (tp.x < pp.x) ? factor : 1f;                // target BEHIND player gets factor  [asm 0x120a8b8..0x120a8cc]
    float score = sqrt((pp.y-tp.y)^2 + (pp.x-tp.x)^2) / weight;// [asm 0x120a8dc..0x120a8fc]
    if (best == null || score < bestScore) {                   // [asm 0x120a900..0x120a914]
        bestScore = score; best = t;                           // [asm 0x120a924, 0x120a92c]
        if (ropeLength <= 0 || score <= ropeLength) inRange = t;   // [asm 0x120a928..0x120a944]
    }
}
closestTargetRope = best;                                      // [asm 0x120a960]

// 3) nothing in range -> keep previous state
if (inRange == null && ropeLength > 0) return;                 // [asm 0x120a980..0x120a998]

// 4) visual marking + assignment
if (closestTarget != null && hookedTarget != null && closestTarget != inRange && closestTarget != hookedTarget)
    closestTarget.MarkNormal(false);                           // [asm 0x120a9c0..0x120aa84]
if (inRange == hookedTarget) { closestTarget = inRange; return; }   // [asm 0x120aaac..0x120aabc]
if (closestTarget != null && closestTarget != hookedTarget && closestTarget != inRange)
    closestTarget.MarkNormal(false);                           // [asm 0x120aae4..0x120ab78]
closestTarget = inRange;                                       // [asm 0x120ab84]
if (inRange != null) closestTarget.MarkAsClosest();            // [asm 0x120aba0..0x120abcc]
```
Rules that matter for the remake
- **Range: none in normal play.** `ropeLength` is private, defaults to **-1** `[asm 0x120bfe4]`, so every
  `ropeLength > 0` branch is skipped and every active target qualifies regardless of distance.
  `SetRopeLength(v)` just stores 0x40 `[asm 0x120b6dc]` and has no direct BL caller in the binary;
  adventure mode reads skill `'rope_length'` for a RangeIndicator in `Start` `[asm 0x120a494..0x120a560]`.
- **Selection = plain nearest active target (Euclidean, x/y only)**, ties keep the earlier array entry
  (strict `<`) `[asm 0x120a90c..0x120a914]`. Targets behind the player are not excluded.
- Hooked target stays highlighted; others revert to normal.

### Aim indicator (only if `indicator` (0x2C) is assigned — adventure range UI)
`indicator` shown at `p + dir*min(ropeLength, dist)` toward `closestTargetRope`, line from `p` to
`p + dir*(len - 0.2)`; hidden while grabbing or with no target `[asm 0x120ae74..0x120b290]`.
With ropeLength = -1 the length clamps to -1 (`ropeLength < dist` → use ropeLength) `[asm 0x120b088..0x120b094]`,
so it is not meaningful in normal mode. Low priority.

---

## 2. Input, Grab, UnGrab, rope impulse

### PlayerInputController
```csharp
void Update() => HandleInput();                                // vtable 0xE0 = HandleInput (slot 4) [asm 0x120c2c8]
bool HandleInput() {
    bool down = Input.GetMouseButtonDown(0);                   // [asm 0x120c30c]
    bool up   = Input.GetMouseButtonUp(0);                     // [asm 0x120c31c]
    bool overUI = EventSystem.current.IsTouchOverUIObject();   // [asm 0x120c344, 0x120c34c]
    if (overUI && (down || up)) hookController.SetupRope();    // [asm 0x120c350..0x120c35c, 0x120c3a4]
    else if (down) hookController.Grab();                      // vslot 5 [asm 0x120c360, 0x120c37c..0x120c388]
    else if (up)   hookController.UnGrab(false);               // vslot 6, r1=0 [asm 0x120c3ac, 0x120c3c8..0x120c3d8]
    return down || up;                                         // [asm 0x120c350, 0x120c3dc]
}
```
- **Hold-to-swing**: grab only on the press frame, release on the release frame. No buffering: a press
  with no target does nothing (just an animation). A press/release over UI does not grab or release
  (it calls `SetupRope`, which only redraws the rope).

### Grab (vslot 5)
```csharp
if (isGrabbing) return;                                        // [asm 0x120b728..0x120b730]
if (!canGrab) return;                                          // [asm 0x120b740..0x120b748]
if (animationController.CurrentState == FINISHED) return;      // [asm 0x120b75c..0x120b764]
if (closestTarget == null || !closestTarget.isActiveTarget) {  // [asm 0x120b794, 0x120b7b0..0x120b7b8]
    UpdateClosestTarget(0);                                    // [asm 0x120b7c4]
    if (closestTarget == null) { animationController.SetState(HOOK /*2*/); return; }  // [asm 0x120b7ec, 0x120b80c, 0x120b820]
}
joint.connectedBody = closestTarget.Rb;                        // [asm 0x120b83c, 0x120b85c]
joint.autoConfigureDistance = false;                           // [asm 0x120b87c]
joint.distance = |player.pos.xy - target.pos.xy| - |joint.anchor|;  // [asm 0x120b950..0x120b9f0]
//   |anchor| = sqrt(0.03^2 + 0.58^2) = 0.58078 with the prefab anchor
joint.enabled = true;                                          // [asm 0x120ba14]
isGrabbing = true;                                             // [asm 0x120ba24]
if (ri != null) Destroy(ri.gameObject);                        // range indicator, adventure only [asm 0x120ba40..0x120ba88]
ropeRenderer.gameObject.SetActive(true);                       // [asm 0x120bac4]
closestTarget.MarkAsHooked();                                  // vslot 8 [asm 0x120badc..0x120bae8]
hookedTarget = closestTarget;                                  // [asm 0x120baf0]
closestTarget.GetComponent<TargetMover>()?.OnHooked();         // [asm 0x120bb10, 0x120bb54]
SetupRope();                                                   // [asm 0x120bb5c]
animationController.SetState(HOOK /*2*/);                      // [asm 0x120bb7c]
OnGrab?.Invoke(hookedTarget);                                  // [asm 0x120bb9c]
```
- **No velocity change on grab.** The rope is a `SpringJoint2D` (freq 3 Hz, damping 0.5) whose rest length is
  the grab-time distance minus |anchor|; it is a spring, not a rigid rope.

### SetupRope (every frame from Update, and from Grab)
```csharp
if (!ropeRenderer.gameObject.activeSelf) return;               // [asm 0x120b370..0x120b378]
if (!hookedTarget) return;                                     // [asm 0x120b3a4..0x120b3ac]
Vector3 t = hookedTarget.position, p = transform.position;
transform.up = (t - p).normalized   (Vector3.zero if |t-p| <= 1e-5);   // [asm 0x120b494..0x120b55c]
Vector3 up = transform.up;
float a = joint.anchor.y * transform.localScale.y;             // [asm 0x120b5c8, 0x120b60c, 0x120b624]
ropeRenderer.SetPositions((p + up * a, t));                    // [asm 0x120b640..0x120b698]
```
- **While hooked, the stickman's rotation is forced every frame so its local up points at the target.**
  Physics angular velocity has no visible effect while hooked.

### UnGrab(bool forced = false) (vslot 6)
```csharp
if ((hookedTarget == null || !joint.enabled) && !forced) return;   // [asm 0x120bc34..0x120bc68]
joint.connectedBody = null;                                    // [asm 0x120bc88]
joint.enabled = false;                                         // [asm 0x120bca8]
ropeRenderer.gameObject.SetActive(false);                      // [asm 0x120bce4]
if (hookedTarget != null) {                                    // [asm 0x120bd0c]
    OnUngrab?.Invoke(hookedTarget);                            // [asm 0x120bd34]
    hookedTarget.UnHook();       // = MarkNormal(false)        // [asm 0x120bd58; Target.UnHook 0x1201370]
    hookedTarget = null;                                       // [asm 0x120bd60]
}
if (closestTarget) closestTarget.MarkAsClosest();              // [asm 0x120bd84, 0x120bdb0]

// rope impulse
if (ropeImpulseActive && Time.time - lastImpulse > ropeImpulseCooldown) {   // [asm 0x120bdb4, 0x120bdc4..0x120bde0]
    lastImpulse = Time.time;                                   // [asm 0x120bdec]
    rb.AddForce(Vector2.up * ropeImpulseForce, ForceMode2D.Impulse);   // Vector2 static +0x10 = up; r3=1
                                                               // [asm 0x120be3c..0x120be74]
}
// spin on release
Vector2 v = rb.linearVelocity;                                 // [asm 0x120be9c]
float spin = |v| * collisionController.AngularMultiplier;      // [asm 0x120bef8..0x120bf1c]
rb.angularVelocity = (v.x < 0) ? +spin : -spin;                // [asm 0x120bf28..0x120bf48]
isGrabbing = false;                                            // [asm 0x120bf50]
animationController.SetState(ROLL /*0*/);                      // [asm 0x120bf6c]
```
- Impulse with prefab values: (0, 0.3) N·s → **Δv = +0.15 m/s straight up (world)**, at most once per 0.5 s
  of game time; `lastImpulse` starts at 0, so no impulse in the first 0.5 s after scene load.
  It also fires on forced ungrabs (target vanished, finish), not only on finger release.
- Spin with prefab: `200 * |v|` deg/s, clockwise (negative) when moving right. Velocity itself is unchanged.

---

## 3. Collisions

### PlayerCollisionController.Awake (finish line lookup)
`finishLine = WorldContainer.GetComponentInChildren<FinishScript>(true).GetComponent<SpriteRenderer>()`
`[asm 0x1204d40, 0x1204d94]`; `finishSize = finishLine.size` `[asm 0x1204de8]`, or `Vector2.one` if missing
`[asm 0x1204e2c]`. (FinishScript itself is an empty MonoBehaviour marker `[FinishScript.s]`.)

### OnCollisionEnter2D(other)
```csharp
if (!controller.HasFinished) animationController.SetState(ROLL /*0*/);   // [asm 0x1205204..0x120522c]
if (other.gameObject.name == "Finish") {                       // [asm 0x1205244..0x120527c]
    if (rb.linearVelocity.y >= 0) CheckFinish(other);          // skipped when v.y < 0 [asm 0x12052a8..0x12052c0]
} else SetRotation(other);                                     // [asm 0x12052dc]
```
### OnCollisionStay2D(other)
```csharp
if (controller.HasFinished) return;                            // [asm 0x120582c..0x1205834]
if (other.gameObject.name == "Finish") CheckFinish(other);     // no velocity test here [asm 0x120587c, 0x1205894]
else SetRotation(other);                                       // [asm 0x12058a4]
```
### CheckFinish(other)
```csharp
if (controller.HasFinished) return;                            // [asm 0x1205310..0x1205318]
if (player.pos.y < other.transform.position.y) return;         // must be at/above the Finish object's pivot [asm 0x1205398..0x12053a0]
Vector3 s = finishLine.transform.localScale;                   // [asm 0x12053dc]
float w = s.x*finishSize.x + s.y*finishSize.y;                 // literal (dot product, no /2) [asm 0x1205464..0x1205474]
float fx = finishLine.transform.position.x;
if (player.x < fx - w) return;                                 // [asm 0x1205478..0x1205484]
if (player.x > fx + w) return;                                 // [asm 0x1205518..0x1205524]
controller.Finish(other, false);                               // [asm 0x1205544]
```
### SetRotation(other) — rolling spin on contact
```csharp
if (other.contacts == null || other.contacts.Length < 1) return;   // [asm 0x1205584..0x1205598]
Vector2 n = other.contacts[0].normal;                          // [asm 0x12055e0]
Vector2 v = rb.linearVelocity;
Vector2 tan = (v.x > 0) ? new Vector2(n.y, -n.x) : new Vector2(-n.y, n.x);   // [asm 0x1205618..0x1205630]
Vector3 proj = Vector3.Project(v, tan);   // zero if tan.sqrMagnitude < Mathf.Epsilon  [asm 0x1205688..0x120571c]
float spin = proj.magnitude * angularMultiplier;               // [asm 0x1205770..0x1205788]
rb.angularVelocity = (v.x <= 0) ? +spin : -spin;               // [asm 0x1205794..0x12057b0]
```
i.e. every contact frame sets spin = 200 × (tangential speed) deg/s, clockwise when moving right.

### Triggers
```csharp
OnTriggerEnter2D(c): if (c.gameObject.name == "ForceFinish") controller.Finish(null, false);  // [asm 0x1204edc, 0x1204f04]
OnTriggerStay2D(c):  if (c.gameObject.name.StartsWith("CameraLimits")) controller.TryKillPlayer(false); // [asm 0x1205098, 0x12050c0]
```
No other death source exists in normal mode (binary BL scan: TryKillPlayer is called only from these
and AdventurePlayerCollisionController).

### BumperAnimationController
```csharp
Awake():
  animator = GetComponent<Animator>();                         // [asm 0x11ff8dc]
  if (overrideBounciness) {                                    // [asm 0x11ff8e0..0x11ff8ec]
      var col = GetComponent<CapsuleCollider2D>();
      var m = col.sharedMaterial; if (m == null) return;       // [asm 0x11ff91c..0x11ff954]
      m = Instantiate(m); m.bounciness = bounciness;           // [asm 0x11ff984, 0x11ff9a8]
      col.sharedMaterial = m;                                  // [asm 0x11ff9cc]
  }
OnCollisionEnter2D(other):
  animator.SetTrigger("Bounce");                               // [asm 0x11ffd14]
  if (!forceBounce) return;                                    // [asm 0x11ffd18..0x11ffd20]
  var rb = other.gameObject.GetComponent<Rigidbody2D>(); if (rb == null) return;  // [asm 0x11ffd5c..0x11ffd94]
  rb.linearVelocity = Vector2.zero;                            // [asm 0x11ffdf8]
  rb.AddForce(forceImpulse, ForceMode2D.Impulse);              // world space, NOT rotated by bumper [asm 0x11ffdfc..0x11ffe24]
```
- With the given prefab defaults (overrideBounciness 0, forceBounce 0) **the bounce is pure physics**: the
  bumper collider's shared PhysicsMaterial2D (bounciness **UNKNOWN**, asset data). If a level instance sets
  forceBounce, the player gets v := forceImpulse/2 = (0, 15) m/s with the prefab vector.
- `Start` in adventure mode swaps in a BumperAdventure of random type 1..3 `[asm 0x11ffa7c, 0x11ffbf4..0x11ffc1c]`; ignore.

---

## 4. PlayerController: spawn, death, respawn, finish

### Fields / flags
`HasFinished` 0x98, `isDead` 0x80, `_isInitialized` 0x54, `_startingPosition` 0x5C, `NbAttempts` 0x9C.

### Initial spawn (level start)
```csharp
// caller AGamePlayController.SpawnPlayer passes initialVelocity = (0,0)  [asm 0x28d7d98, 0x28d7d9c, 0x28d7da4]
async InitialSpawn(Transform spawnPoint, Vector2 initialVelocity) {
    _startingTransform = spawnPoint;                           // [asm 0x12081cc]
    _startingPosition = spawnPoint.position;                   // [asm 0x12081f8, 0x12081fc]
    ResetPlayer();                                             // [asm 0x1208204]
    await Spawn(initialVelocity);                              // vslot 4 [asm 0x1208224]
    _isInitialized = true;                                     // [asm 0x12082e0]
}
async Spawn(Vector2 v) {
    ResetPlayer();                                             // [asm 0x1209d3c]
    await ShowSpawnFx();                                       // vslot 5 [asm 0x1209d5c]
    SpawnPlayer(Vector3.zero, v);  // zero pos -> _startingPosition  [asm 0x1209e10..0x1209e24]
    OnPlayerSpawn?.Invoke();                                   // [asm 0x1209e4c]
}
ResetPlayer() {
    DestroyTrailIfExists();                                    // [asm 0x12067d0]
    hookController.UnGrab(false);                              // [asm 0x12067fc]
    hookController.canGrab = false;                            // [asm 0x1206814]
    rb.bodyType = Static;                                      // 2 [asm 0x1206828, 0x1206834]
    transform.position = _startingPosition + (-1000, 0, 0);    // parked off-screen [asm 0x1206854..0x120687c]
}
Task ShowSpawnFx() {
    var fx = Instantiate(spawnFX, _startingPosition, Quaternion.identity);   // [asm 0x1206e60]
    var ps = fx.GetComponent<ParticleSystem>();
    return Task.Delay((int)(ps.<0x206c91c> * timeToSpawn * 1000));   // [asm 0x1206ea0, 0x1206ecc, 0x1206ed8, 0x1206f04]
}
SpawnPlayer(Vector3 pos, Vector2 vel) {
    rb.bodyType = Dynamic;                                     // 0 [asm 0x12069f4]
    if (pos.sqrMagnitude < 1e-10) pos = _startingPosition;     // [asm 0x1206a08..0x1206a28]
    transform.position = pos;                                  // [asm 0x1206a50]
    if (vel.sqrMagnitude < 1e-10) vel = Vector2.zero;          // [asm 0x1206a5c..0x1206aac]
    rb.linearVelocity = vel;                                   // [asm 0x1206ad0]
    transform.rotation = Quaternion.identity;                  // [asm 0x1206b38]
    rb.angularVelocity = 0;                                    // [asm 0x1206b5c]
    transform.SetScale(0);                                     // [asm 0x1206b6c]
    transform.DOScale(_initialScale, growthDuration).SetEase(Ease.OutElastic /*24*/);   // [asm 0x1206b80, 0x1206b90]
    isDead = false;                                            // [asm 0x1206bb0]
    hookController.canGrab = true;                             // [asm 0x1206bb8]
    animationController.SetState(FALL /*1*/, force: true);     // [asm 0x1206bc8..0x1206bd0]
    DisplayTrail();                                            // [asm 0x1206be8]
}
```
- Spawn = player appears at the level spawn point at rest, physics live immediately, grows 0→1 over
  growthDuration (1.0 s prefab) with OutElastic. Physics/grab are active during the growth.
- Spawn delay: `ParticleSystem` value read via `0x206c91c` (annotated `get_time`) × timeToSpawn × 1000 ms.
  **UNKNOWN** which ParticleSystem property this really is and its value (if it is `time` on a fresh
  instance it is ~0 → no delay; if it is duration, delay = duration × 0.75).

### Update
`if (_isInitialized) animationController.Tick();` `[asm 0x1207028..0x1207050]` — nothing else per frame.
**No speed clamp, drag change or gravity change anywhere in these classes**: the only velocity writes are
SpawnPlayer `[asm 0x1206ad0]`, bumper force `[asm 0x11ffdf8, 0x11ffe24]`, rope impulse `[asm 0x120be74]`
(grep of all `dump/asm/*.s`).

### Death
```csharp
TryKillPlayer(bool ignoreHooked = false) {
    if (HasFinished || isDead) return;                         // [asm 0x1205104..0x1205118]
    if (!ignoreHooked && hookController.hookedTarget != null) return;   // hooked = immune [asm 0x120511c..0x1205168]
    isDead = true;                                             // [asm 0x1205170]
    if (DeservesSecondChance()) Revive(); else KillPlayer();   // [asm 0x1205178..0x12051a0]
}
async KillPlayer() { OnPlayerDie?.Invoke(); await Respawn(); }   // [asm 0x120899c, 0x12089b0]
async Respawn() {
    await AdsService.ShowInterstitial("interstitial.on_death_" + mode.Replace(".", "_"));   // [asm 0x12093a4..0x1209440]
    NbAttempts++;                                              // [asm 0x1209538..0x1209544]
    Spawn(Vector2.zero);                                       // vslot 4, r1=r2=0 [asm 0x120954c..0x1209558]
}
```
- Death trigger = staying inside a trigger whose name starts with `"CameraLimits"` **while not hooked**.
  Respawn = full level restart from `_startingPosition` (spawn FX delay + grow), not a checkpoint.
- Second chance (card meta, can skip in a remake): card id by mode (`card.second_chance_normal` etc.),
  `IsUnlocked`, then `Random.Range(0,100) < GetCardEffectForCurrentLevel(card)` `[asm 0x12071b8..0x1207218]`
  → `Revive`: spawn point = `IGamePlayController.GetLastSpawnPointPassed(player.x, _startingTransform)`
  (interface slot 10) `[asm 0x12098c0, 0x1209904]`, ResetPlayer, SpawnCounter countdown `[asm 0x1209984]`,
  `SpawnPlayer(spawnPoint.position, Vector2.zero)` `[asm 0x1209a48..0x1209a64]`.

### Level complete
```csharp
async Finish(Collision2D other, bool isForced = false) {
    if (HasFinished || isDead) return;                         // [asm 0x120782c..0x120783c]
    HasFinished = true;                                        // [asm 0x12078cc]
    GamePlayService.CompleteLevel();                           // [asm 0x12078f0]
    if (!isForced) {                                           // [asm 0x12078f4, 0x1207904]
        var c = Instantiate(confettisPrefab);                  // [asm 0x1207938]
        Vector2 v = rb.linearVelocity;
        c.transform.position = player.pos + v * (Time.deltaTime * 2);   // [asm 0x12079bc..0x12079f8]
        c.transform.up = v.normalized;                         // [asm 0x1207a54..0x1207ae8]
    }
    rb.bodyType = Kinematic;                                   // 1 [asm 0x1207b00, 0x1207b08]  -> keeps current velocity, no gravity
    if (other != null) other.transform.Find("FX")?.gameObject.SetActive(true);   // [asm 0x1207b60, 0x1207bd0]
    hookController.UnGrab(false);                              // [asm 0x1207bfc]
    rb.angularVelocity = 0;                                    // [asm 0x1207c1c]
    transform.up = rb.linearVelocity.normalized;               // face travel direction [asm 0x1207c3c..0x1207d1c]
    if (!isForced) animationController.SetState(FINISHED /*6*/, force: true);   // [asm 0x1207d20..0x1207d48]
    await Task.WhenAll(
        TimeScale.AnimateTimescale(0.05f, 600 /*ms*/, Ease.OutCirc /*21*/, "TimeScale"),   // [asm 0x1207d70..0x1207d88]
        cameraController.ZoomOnPlayer());                      // [asm 0x1207df0, 0x1207e5c]
    await Task.Delay(400);                                     // [asm 0x1207778, 0x1207780]
    TimeScale.UnPause();                                       // [asm 0x12077c8]
    GamePlayService.FinishLevel(true, ..., "finished");        // [asm 0x12077fc..0x1207810]
}
ForceFinish() => Finish(null, isForced: true);                 // [asm 0x1207560]
```
- Body becomes kinematic: the stickman keeps gliding at its finish velocity in a straight line while
  time slows to 5% over 0.6 s and the camera zooms. UnGrab runs after the bodyType change, so its
  release impulse hits a kinematic body (Unity ignores AddForce on kinematic bodies) and its spin is
  overwritten with 0 two lines later.
- `TimeScale` uses DOTween (`DOGetter<float>` field in `TimeScale.<>c`), so ease 21 = DG `OutCirc`.
  Task.Delay(400) is real time (Task.Delay ignores timeScale).

---

## 5. PlayerCameraController

Camera follow is **ProCamera2D** (third-party) configured in the scene; this class only tweaks it.
```csharp
const float INITIAL_CAMERA_ZOOM = 5;          // declared const (dump.cs); its use site is UNKNOWN
static float cameraZoomOnEndGame = 2;         // [asm 0x1204630, 0x1204634]
static float _initialForwardFocus = 1;        // [asm 0x1204618, 0x1204628]  (overwritten in Awake)
static float _initialForwardFocusSmoothness = 0.5f;  // [asm 0x1204614, 0x120462c] (overwritten in Awake)

Awake() {
    if (targetCamera == null) {                                // [asm 0x12042fc]
        targetCamera = ProCamera2D.Instance.GetComponent<Camera>();       // [asm 0x1204328..0x1204370]
        _forwardFocus = targetCamera.GetComponent<ProCamera2DForwardFocus>();   // [asm 0x120439c, 0x12043b0]
        _initialForwardFocus = _forwardFocus.LeftFocus;        // FF+0x44 [asm 0x12043b8, 0x12043bc]
        _initialForwardFocusSmoothness = _forwardFocus.TransitionSmoothness;  // FF+0x34 [asm 0x12043e4, 0x12043e8]
    }
    if (GameModesService.mode != "mode.pachinko") {            // [asm 0x1204428..0x1204430]
        _forwardFocus.LeftFocus  = _initialForwardFocus;       // [asm 0x1204460]
        _forwardFocus.RightFocus = _initialForwardFocus;       // [asm 0x1204490]
        _forwardFocus.TransitionSmoothness = _initialForwardFocusSmoothness;  // [asm 0x1204494, 0x1204498]
    }
}
async ZoomOnPlayer() {   // called from Finish only
    _forwardFocus.LeftFocus = 0; _forwardFocus.RightFocus = 0;  // [asm 0x1204720, 0x120474c, 0x1204768]
    _forwardFocus.TransitionSmoothness = 0.25f;                 // [asm 0x1204770, 0x1204778]
    await Task.WhenAll(
        targetCamera.DOOrthoSize(cameraZoomOnEndGame /*2*/, 0.5f).SetEase(Ease.InOutSine /*4*/).SetUpdate(true).Play(),
                                                               // [asm 0x1204794..0x12047d8]
        CameraService.CenterBoundariesOnPlayer(transform, 0.5f));   // [asm 0x1204884]
}
```
- During play: ProCamera2D follow + ForwardFocus (camera leads in the direction of motion, Left = Right =
  the scene's original LeftFocus). Follow smoothness, offsets, ForwardFocus values, ortho size during play,
  camera bounds: **UNKNOWN** (scene-serialized ProCamera2D components; not in code). Ortho size during play
  is plausibly 5 (`INITIAL_CAMERA_ZOOM`) but its use is not proven here.
- On finish: ortho size → 2 over 0.5 s unscaled, InOutSine; forward focus off.

---

## 6. PlayerAnimationController

States (`enum PlayerState`, dump.cs): 0 ROLL, 1 FALL, 2 HOOK, 3 HOOK_FAST, 4 HOOK_SLOW, 5 HOOK_STOPPED, 6 FINISHED.
Written to Animator int `"State"` `[asm 0x12035e8, 0x12033f0]`.

Who sets what
- Spawn → FALL (forced) `[asm 0x1206bd0]`; any collision enter (not finished) → ROLL `[asm 0x120522c]`;
  release → ROLL `[asm 0x120bf6c]`; grab (also failed grab, target lost) → HOOK `[asm 0x120bb7c, 0x120b820, 0x120ae30]`;
  finish → FINISHED (forced) `[asm 0x1207d48]`; while hooked, Tick picks 3/4/5.

### Tick (every frame once initialized)
```csharp
Vector2 v = rb.linearVelocity;                                 // [asm 0x1203078]
if (hookController.hookedTarget == null) { renderer.flipX = v.x < 0; return; }   // [asm 0x12030c0, 0x12030dc..0x12030f4]
Vector2 t = hookedTarget.pos, p = transform.position;
bool below = p.y <= t.y;
renderer.flipX = below ^ (v.x >= 0);                           // [asm 0x12031a4..0x12031d0]
PlayerState s;
if (below && |v| <= hookedStoppedSpeedThreshold) s = HOOK_STOPPED;   // [asm 0x12031d4..0x1203240]
else s = ((p.x > t.x) == renderer.flipX) ? HOOK_FAST : HOOK_SLOW;   // [asm 0x1203254..0x1203278]
SetState(s);                                                   // [asm 0x1203284]
```
### SetState(PlayerState state, bool force = false)
```csharp
if (CurrentState == state) return;                             // [asm 0x12032fc..0x1203304]
if (!force && Time.time - switchTime < minCooldownBetweenAnimations) return;   // [asm 0x1203308..0x1203330]
if ((state == HOOK_FAST || state == HOOK_SLOW) && CurrentState == HOOK) {      // [asm 0x1203338..0x1203348]
    if (Time.time - hookTime < hookAnimationDuration) return;  // [asm 0x120334c..0x120336c]
    hookTime = Time.time;                                      // only write of hookTime [asm 0x1203378]
} else if (state == FALL && CurrentState == ROLL && !force) return;   // [asm 0x1203380..0x1203390]
switchTime = Time.time; CurrentState = state;                  // [asm 0x12033ac, 0x12033b4]
animator.SetInteger("State", (int)state);                      // [asm 0x12033f0]
if (state == FINISHED) after 1 frame: animator.SetInteger("State", 9999);   // [asm 0x12033f4..0x1203494, 0x12036d0]
```
Sprite orientation
- Rotation comes from the Rigidbody when free (spin set on release/contact, sections 2–3) and from
  `transform.up = toward target` while hooked (SetupRope). On finish, `up = velocity direction`.
- Only `flipX` mirrors the sprite; there is no velocity-based rotation code beyond the above.
- The actual pose sprites/clips per state are in the Animator asset: **UNKNOWN** here.

---

## 7. Visual-only (brief)

- Target `currentState` (0x30) NORMAL 0 / CLOSE 1 / HOOKED 2, Animator int "State" + `halo` object:
  MarkNormal(force): skip if !force && state==NORMAL; halo off; State=0 `[asm 0x12013c0..0x12013cc, 0x1201420, 0x1201478]`.
  MarkAsClosest: skip if state==CLOSE; halo on; if state != HOOKED → State=1 `[asm 0x12014d8, 0x1201530, 0x1201538, 0x1201594]`.
  MarkAsHooked: skip if state==HOOKED; halo off; State=2 `[asm 0x12015f4, 0x120164c, 0x12016a4]`.
  UnHook = MarkNormal(false) `[asm 0x1201360..0x120137c]`.
- TargetMover.OnHooked: if `waitForHook`, start moving (`canMove`) after `startDelay` s via a delayed action
  (immediately if startDelay <= 0) `[TargetMoverOnHooked 0x1201b80..0x1201b98, 0x1201bc4]`. Path/speed logic
  (TargetMover.Update) not decoded: **UNKNOWN**.
- RopeVisual.Update: one sprite stretched from `start` to `end`; angle = atan2(...)·57.2958 − 90°,
  material float set from length × pixelsPerUnit for tiling `[RopeVisual 0x12004ec, 0x12004f0, 0x1200420]`.
  Rope start point = player pos + up × (anchor.y × scale.y) (SetupRope above).
- Awake detaches `ropeRenderer` and `indicator` from the player (parent = null), indicator scale = 1
  `[asm 0x120a228, 0x120a280, 0x120a2ec]`.

---

## UNKNOWN list
1. Physics2D.gravity project setting; PhysicsMaterial2D values of player, walls, bumpers (bounce strength).
2. ProCamera2D follow settings (smoothing, offsets, ForwardFocus Left/Right values, bounds) and the
   in-play orthographic size (5 is only a declared const).
3. Spawn FX delay: which ParticleSystem property `0x206c91c` reads, and its value.
4. `minCooldownBetweenAnimations` prefab value.
5. Per-level serialized data: `Target.isActiveTarget` per instance, bumper `forceBounce`/`forceImpulse`
   overrides, TargetMover paths/speed, finish line size/scale, CameraLimits trigger placement.
6. TargetMover movement rules (Update not decoded).
7. Script execution order between PlayerInputController.Update and PlayerHookController.Update.
8. Animator clips per PlayerState / Target state.
