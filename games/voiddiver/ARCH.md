# Void Diver — kiến trúc bản dựng lại (2026-09-25)

Bản web dựng lại VOID DIVER: Escape from the Abyss (Studio Nemo) từ chính bản demo Steam cài ở
`D:\Steam\steamapps\common\VOID DIVER Escape from the Abyss Demo`. Art, anim, map, tiếng, VFX, bảng số,
script Lua đều lấy từ bản gốc. Không tự vẽ, không tự chế số. Thiếu thì ghi ra là thiếu.

Tài liệu tham chiếu ngoài git (đọc trước khi làm): `~/Downloads/vd-ref/`
- `SYSTEMS.md` — đặc tả hệ thống từ bảng (nhân vật, skill, quái, map, kinh tế, tutorial).
- `ASSETS.md` — cách game gốc đóng gói asset, camera, ánh sáng, VFX, tiếng, các bẫy UnityPy.
- `WEB.md` — cảm giác chơi, điều khiển, đón nhận (nguồn trên mạng).
- `json/*.json` — mọi bảng đã giải mã và có kiểu. `lua/**` — script gốc.
- Giải mã: bảng `TableEncrypted/*.bytes` là CSV XOR `0xCC`; Lua `LuaEncrypted/**.bytes` XOR `0xF4`.

## Phạm vi bản này
- Nhân vật: 100001 Gayoung (Sword), 100003 Noah (Shotgun), 100004 Mio (Phone), 100005 Raven (Revolver).
- Campaign: 1100 (tutorial, City), 1101 + 1102 (Story, Country, boss Slender), 101–108 (Normal, Country, map ngẫu nhiên).
- Sảnh Balusha: sector 9001–9003 với NPC chức năng (chọn campaign, chọn nhân vật, bán, chế, talent, lên cấp, sửa đồ, kho).
- Chỉ chơi đơn. Co-op, PvP, Steam không làm.

## Ngăn xếp
- three.js r140 + GLTFLoader + meshopt decoder (chép từ `games/ho-xanh/vendor`).
- spine-threejs **4.2.43** (Spine gốc là 4.2; bản 4.0 của ho-xanh không đọc được physics constraint).
- fengari 0.1.4 + fengari-interop: chạy nguyên văn Lua gốc (`Common.lua`, `Campaign/*.lua`, `LoungeQuest/*.lua`, `NpcTalk.lua`).
- Không bước build. Mở bằng `index.html`, script thường (không module), mỗi tệp bọc `(function (VD) { ... })(window.VD = window.VD || {})`.

## Thư mục
```
games/voiddiver/
  index.html
  ARCH.md                 tệp này
  README.md               ghi chép đo được, bẫy (tiếng Việt)
  vendor/                 three, GLTFLoader, meshopt, spine-threejs 4.2.43, fengari (+ license)
  data/                   SINH RA bởi tools/build_data.py — không sửa tay
    tables.js             VD.T = { Character, Skill, HitBox, Buff, Monster, Sector, Campaign, ... } (chỉ dòng trong phạm vi)
    text.js               VD.TEXT = { key: "chuỗi Vi" }
    lua.js                VD.LUA = { "Common/Common": "...", "Campaign/1100": "...", ... }
    assets.js             VD.ASSETS = manifest: spine, sector, vfx, sfx, bgm, icon, portrait → đường dẫn
  art/spine/<Tên>/        <Tên>_NW.skel, <Tên>_SW.skel, <Tên>.atlas, <Tên>.png (+ meta.json)
  art/sector/<id>.glb     hình học, texture tách ra art/sector/tex/*.webp; <id>.json = collider/đèn/spawn/decal
  art/vfx/<tên>.json      tham số hệ hạt đã chuẩn hoá; art/vfx/tex/*.webp
  art/ui/                 icon atlas đã cắt, chân dung, ảnh hội thoại, HUD
  audio/sfx/*.mp3, audio/bgm/*.mp3
  js/                     mã chạy (xem dưới)
  tools/                  công cụ bóc + build_data (Python), README trong tools
```

## Quy ước toạ độ
- Unity tay trái (x phải, y lên, z vào trong). glTF/three tay phải: **z_three = −z_unity**. Mọi JSON sinh ra đã đổi sẵn.
- Mặt đất là mặt XZ, y lên. Một sector 30×30 m, gốc ở góc. Ô (cx, cy) của lưới `MapSize` đặt ở `x = 30·cx`, `z_unity = 30·cy`.
  Xoay sector `r` (0–3) quanh tâm ô, mỗi bước 90°.
- Thời gian tính bằng giây, khoảng cách bằng mét, góc trong bảng là độ.

## Camera (số gốc, ASSETS.md §3)
- `PerspectiveCamera(10°, w/h, 0.1, 500)`. Vị trí = mục tiêu + (25, 21, +25) trong toạ độ three (Unity (25,21,−25)).
- Bám theo kiểu Cinemachine Transposer, damping 1 s mỗi trục. Không zoom. Rung khi trúng đòn = Perlin, freq 5.
- Sảnh: FOV 15°, đặt theo `Area.CameraPos`.

## Mô hình miền (dữ liệu chạy)
- `Unit` — mọi thứ có máu: nhân vật, quái, bù nhìn.
  `{ uid, kind: 'char'|'mon', row (dòng bảng), pos {x,z}, face (rad), aim {x,z}, team, stats (gốc + mod), hp, stamina,
     stress, light, charge, buffs: BuffSet, run: SkillRun|null, cd: {skillId: giây}, ai, vis: UnitVisual }`
- `SkillRun` — một lần thi triển, do **bộ thông dịch cây `RootActionNode` gốc** chạy (js/skill.js).
  Mỗi node có `actionDuration`, `SkillAnimationDatas` (tên anim + `animationSpeeds`), `moveType` + `MoveSpeedCurve`,
  `cancelableTimes`, `actionEvents` (HitBoxEvent, VfxEvent, SfxEvent, BuffActionEvent, TeleportActionEvent, …).
  Không code tay skill nào. Skill thiếu event nào thì thêm handler vào bảng `EVENTS`, không rẽ nhánh theo id skill.
- `HitBox` — sinh bởi HitBoxEvent, hình theo `collisionType` (Cylinder180/240/…, Sphere, Box), sát thương `StatFactor` × Atk.
- `Buff` — theo `Buff.csv`: thời lượng, stack, hiệu ứng (bảng handler theo loại hiệu ứng).
- `Dive` — máy trạng thái: `loading → intro → play → (extracting | dead) → result`.
- `Lounge` — máy trạng thái sảnh; mỗi NPC mang `NpcFunction.Type`, bảng handler theo Type mở đúng bảng UI.
- `LuaHost` — fengari; `LuaApi` là bảng hàm JS, mỗi hàm `...Async` (và vài hàm khác) trả `{IsCompleted, Result}`;
  `await` gốc trong `Common.lua` tự `coroutine.yield()` mỗi khung.

## Mã chạy (js/)
| tệp | chủ sở hữu tri thức |
|---|---|
| `core.js` | vòng lặp khung, đồng hồ, RNG có hạt giống, input (bàn phím, chuột, tay cầm), lưu `localStorage` |
| `assets.js` | tải glb/spine/ảnh/tiếng theo `VD.ASSETS`, đệm |
| `render.js` | scene three, camera gốc, đèn, sương độ cao, hậu kỳ (bloom, vignette, stress) |
| `world.js` | ghép lưới sector, collider tĩnh (hộp xoay trên mặt XZ), lưới đi (nav) cho quái, truy vấn va chạm |
| `unitvis.js` | Spine billboard NW/SW + lật, bóng blob, chớp trúng đòn |
| `stats.js`, `buff.js` | chỉ số và buff |
| `skill.js`, `hitbox.js` | bộ thông dịch skill, hitbox, đạn |
| `ai.js` | quái: chọn skill, đuổi, tuần tra, aggro theo Faction |
| `vfx.js` | trình phát hệ hạt Shuriken từ `art/vfx/*.json` |
| `audio.js` | SFX/BGM WebAudio |
| `dive.js` | luật lặn: đèn, stress, corruption, loot, rương, bẫy, cửa, lối thoát, chết |
| `lounge.js` | sảnh và NPC |
| `lua.js` | LuaHost + LuaApi |
| `ui.js`, `hud.js`, `dialog.js` | giao diện DOM |
| `main.js` | khởi động, chuyển cảnh |

## Luật cho mọi agent làm việc trên game này
- Chỉ đụng `games/voiddiver/**` và khúc `voiddiver` trong `data/games.js`. Nhiều agent khác đang sửa game khác cùng cây.
- Git: liệt kê tệp trong mọi lệnh (`git add <tệp…>`). Không `git add -A`, `git stash` trơn, `git checkout .`.
- Không sửa tay `data/*`, `art/*`, `audio/*`: sửa công cụ trong `tools/` rồi chạy lại.
- Số liệu gameplay lấy từ `VD.T`. Không hằng số ma thuật trong `js/` trừ khi bảng không có; khi đó ghi `// không có trong bảng: <lý do>`.
- Kiểm chứng: `node test/voiddiver-*.js` (Playwright, bắt `pageerror`, console error, response ≥ 400, chụp ảnh và mở ra xem bằng mắt).

## API giữa các module (đã có, 2026-09-25)
- `VD.world` (js/world.js): `load(layout[{cx,cy,id,rot}], size[cols,rows], scene)` → Promise; `sectors[]` mỗi phần tử `{cell, json, group, xf, cutBoxes}`;
  `sectorPoint(sec, ux, uz)` đổi toạ độ Unity trong ô (như `SpawnPosition` của Sector.csv) sang `[x, z]` thế giới three;
  `moveCircle(pos, r, dx, dz, ghost)`, `overlapsMove(x, z, r)`, `raycastShot(ax, az, bx, bz)` → t (1 = thông);
  lưới đi `nav/navW/navH/navCell/navCenter/NAV`; `lights`; `updateCutoff(camPos, x, z)`; `minX/maxX/minZ/maxZ`.
- `VD.render` (js/render.js): `scene`, `camera`, `snap(pos)`, `follow(pos, dt)`, `shake(amp, dur)`, `setSight(x, z, face, angleDeg, range, back)`,
  `sight.uSightOn`, `screenToGround(mx, my, h)`, `screenAxes()`, `setView({fov, offset})`, `draw(dt, time)`.
- `VD.stage` (js/stage.js): `begin({mode:'dive'|'lounge', difficulty, seed})`, `spawn({kind:'char'|'mon'|'extra', id, pos, aim, team})` → Unit,
  `remove(u)`, `setPlayer(u, loadout)`, `player`, `units`, `vis` (uid → UnitVisual), `A` (world của lõi combat: `A.time`, `A.emit`),
  `onUnitEvent(e)` (móc nghe mọi sự kiện combat: 'damage', 'death', 'skill', …), `update(dt)`, `render(dt)`, `pending` (số Spine đang tải).
- Lõi combat: `VD.Skill` (makeUnit/cast/start/interrupt/slotSkill/step), `VD.Stats.get(u, k)`, `u.buffs` (BuffSet: add/has/remove/stunned),
  `VD.HitBox`, `VD.Combat` (applyDamage/heal/stressDamage/stressRecover/kill). Tài liệu: docs/SKILLVM.md.
- `VD.hud`: `show(on)`, `setQuest(title, [{text, done}])`, `setBoss(u)`, `centerText(s, ms)`, `bubbleAt(u, text)`, `damage(e)`, `statusText(u, text)` (chữ trạng thái nổi kiểu StatusEffectText gốc), `update(dt)`.
- `VD.lua`: `init()`, `call(key, fname, a, b)`, `has(key, fname)`, `event(keys, type, value)`, `tick()`, `text(s)`, `task(promise)`, `done(v)`,
  `api` (bảng LuaApi: gán `VD.lua.api.TênHàm = function (...) {}`), `EV` (ELuaEvent). Hàm chưa làm tự trả task xong ngay và cảnh báo một lần.
- `VD.dialog`: đã làm các hàm LuaApi về thoại (Open/Append/Close/Delay/Fade/CustomImage/Note/Radio/Bubble/Toast), `toast(s)`.
- `VD.audio`: `unlock()`, `sfx(name, {pos, vol, loop, key})`, `stop(h)`, `playBgm(name)`, `stopBgm()`, `setListener(pos)`.
- `VD.vfx`: `load(name)`, `preload(names)` → Promise (nạp + vẽ khống một khung), `isLoaded(name, element)`,
  `play(name, {pos, dir, aim, follow, followRot, local, scale, scaleX, speeds, element, loop, loopDuration, duration, owner, tracking})`,
  `stop(h, mode)` (true = xoá ngay, 'end' = trạng thái End của Animator), `update(dt, camera)`, `setScene(scene)`, `clear()`. Luật: tools/fx_README.md.
- `VD.stage.playFx(e)` nhận nguyên sự kiện `vfx` của lõi (hợp đồng ở docs/SKILLVM.md §7); `VD.stage.fxNamesOf(u)` = mọi VFX unit có thể phát.
- `VD.input`: `held/pressed/released[hành động]`, `mouse`, `move`, `enabled`, `clear()`; tên hành động theo InputActionAsset gốc (core.js KEYMAP).
- `VD.loop`: `update(dt)`, `render(dt)`, `hitstop`, `time`. `VD.rng(seed)`, `VD.save.load/write`.
