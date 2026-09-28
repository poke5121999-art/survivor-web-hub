# VFX: bóc và phát lại hệ hạt gốc (2026-09-25)

Ba thứ trong repo:
- `tools/fx_export.py`: bóc prefab VFX (Unity Shuriken) ra `art/vfx/<tên>.json`, ảnh ra `art/vfx/tex/*.webp`, mesh ra `art/vfx/mesh/*.json`, cùng `art/vfx/index.json`.
- `js/vfx.js`: trình phát, gọi qua `VD.vfx.load/play/stop/update/setScene`. Cách dùng ghi ở đầu tệp.
- `tools/vfx_view.html?fx=<tên>`: trang xem. Test là `node test/voiddiver-vfx.js`.

Nhãn: **[ĐO]** là đọc thẳng từ bundle hoặc bytecode shader. **[SUY LUẬN]** là chọn theo ảnh và tham số, chưa so với game đang chạy.

## Chạy

```
set PYTHONIOENCODING=utf-8
python tools/fx_export.py --all-referenced       # gom tên từ vd-ref/json + khoá vfx của tools/manifest.json
python tools/fx_export.py 1001_01_SwordAttack_Cast_1st ...   # từng prefab, gộp vào index sẵn có
python tools/fx_export.py --bundle remote_prefab_assets_object SphereFieldExit   # hệ hạt trong prefab đồ vật
python tools/fx_code_names.py                     # tên VFX mà mã C# gọi thẳng (global-metadata.dat)
python tools/fx_object_scan.py PhoneBooth WaveExit ...   # prefab đồ vật có hệ hạt không
node test/voiddiver-vfx.js                        # 13 hiệu ứng, chụp ảnh ở 0.05/0.15/0.3/0.6 s, đo tải
node test/voiddiver-vfx.js <tên> --times=0.02,0.06 --zoom=3 --noperf=1   # soi một hiệu ứng
node test/voiddiver-vfx.js --gpu=1                # đo tải bằng GPU thật (ANGLE D3D11)
```

- Chạy hết mất khoảng 15 phút. Nếu cần, bước bóc tự nạp thêm bundle `dependencies_assets_fbx`, `_texture`, `_material`, `_sprite`.
- Ảnh chụp nằm ở `%TEMP%/voiddiver-vfx-shots/`.

## Đợt 2 (sau lượt quét skill trong game thật) [ĐO]
- Các tên báo thiếu đều CÓ prefab, chỉ là đợt 1 chưa gom tới:
  - `Purification`, `Damage_Tick_Bleeding`, `Slow` nằm ở **`StatusEffectTag.csv`** (cột `Vfx`/`DotVfx`), không nằm ở `BuffVfx`.
  - `1003_04_CasterSkill_ToyBomb_Projectile_State_Sitting_Ring` là skill bị động 10011330 của **đơn vị phụ `ExtraUnit` 10002** (bom đồ chơi của Mio). Nó được sinh qua `HitBox.ExtraUnitIdOnDestroy`.
- Nguồn tên nay gồm:
  - skill của 4 nhân vật và của quái trong phạm vi, cộng quái được triệu hồi (`SummonActionEvent.MonsterInfos`) và `ExtraUnit`;
  - toàn bộ `BuffVfx`, `Buff.Vfx`, `StatusEffectTag`, `Monster.SpawnVfx` (mọi quái);
  - HitBox của `Trap`, buff của `SpecialField`;
  - khoá vfx của `tools/manifest.json`;
  - **chuỗi literal trong mã C#** (`tools/fx_code_names.py` đọc `global-metadata.dat` v39: 22 tên, ví dụ `Common/Heal`, `Common/Npc_Spawn`, `Common/StressDamage`, `Status/Despair`, `Status/Frozen_end`, `WeaponBroken`, `Groggy_Start`, `Common/Elemental_*_Hit`);
  - danh sách `WORLD_FX` (`Trap_*` đặt sẵn trong sector, `DropItemFX_Quest`).
- Tên trong bảng/mã có tiền tố thư mục (`Common/`, `Status/`, `1001/`, `Monster/`). Prefab trong bundle chỉ mang tên lá. Trình phát khớp theo lá (`index.alias`), nên không cần biết thư mục.
- Đồ vật (`remote_prefab_assets_object`, đo bằng `fx_object_scan.py`):
  - Có hệ hạt, đã bóc (`src` trong index): `SphereFieldExit` (5), `SphereOilField` (9), `SphereBlockedField` (11), `TrainingField` (5), `WaveExit` (22), `SafeExit` (22), `DropGoods` (7).
  - Không có hệ hạt:
    - `BoxFogField`: chỉ collider và script, sương là việc khác.
    - `PhoneBooth`: 1 MeshRenderer.
    - `IntervalTrap`/`TriggerTrap`: không có hình. Hình bẫy nằm trong prefab sector, còn lửa/điện/khí là VFX của HitBox (`Trap_Fire_FireThrower`, `Trap_Electric`, `Trap_PoisionGas_Projectile`, ...).
  - `WaveExit`/`SafeExit`: bốt điện thoại là **Spine** (`World_PhoneBooth`, `NPC_Campaign_SW`) và UI, không phải hạt. Trình phát chỉ vẽ phần hạt.
  - Trạng thái chọn bằng `play(name, {only})`:
    - `phonebooth_begin`: gọi bốt tới;
    - `phonebooth_end`: thoát. Có `startDelay` gốc 0,55–1,1 s.
- Hiệu ứng trạng thái:
  - `StatusEffectTag.VfxDuration = −1` nghĩa là "còn buff là còn". Các prefab này (`Slow`, `Stun`, `Weakening`, `Blind`, `Frozen`, ...) tự lặp sẵn (`looping`). Gắn bằng `play(name, {follow, pos: offset})`, gỡ bằng `stop()`.
  - `VfxDuration > 0` (`Purification` 1 s) và `DotVfx` (`Damage_Tick_*`, phát mỗi tick) là một phát. Truyền `duration` nếu muốn xoá cứng như `Destroy`.
  - `play(name, {loop: true})` ép mọi hệ lặp tới `stop()`. Dùng cho `VfxEvent.IsLoop` / `HitBox.IsLoopVfx`.
  - `stop()` xoá luôn hạt có tuổi thọ "vĩnh viễn" (> 100 s, như `Frozen`).
- `index.json` và mỗi JSON ghi qua tệp tạm rồi `os.replace`, vì agent khác có thể commit cùng lúc.

## Kết quả đợt đầu [ĐO]
- Có 279 tên tham chiếu, khớp được 335 prefab: 260 khớp đúng tên, 19 là tên `…_Hit` có biến thể theo nguyên tố. Không còn tên nào lệch.
- Tổng cộng 2.580 hệ hạt, 14 TrailRenderer, 48 Light, 37 Animator (78 clip).
- Dung lượng:
  - JSON: 2,5 MB, gzip còn 0,28 MB.
  - Ảnh: 286 tệp WebP lossless, 3,3 MB.
  - Mesh: 48 tệp, 0,5 MB.

## Shader nhà: đọc bytecode, không đoán theo tên thuộc tính [ĐO]
Tên biến trong cbuffer bị strip, nên tên thuộc tính không đủ để biết shader làm gì.

Cách đọc:
1. `m_ParsedForm` → `m_SubShaders[0].m_Passes[0].progFragment.m_CommonParameters` cho offset các biến trong `UnityPerMaterial`.
2. Giải LZ4 `compressedBlob`, cắt từng khối bắt đầu bằng `DXBC` (độ dài ghi ở byte 24).
3. Chạy `fxc.exe /dumpbin` (Windows SDK 10.0.22621, `C:/Program Files (x86)/Windows Kits/10/bin/<ver>/x64/fxc.exe`).
4. Tra biến thể (variant) qua `m_KeywordIndices` → `m_KeywordNames`. Chỉ số blob của fragment trừ đi số blob vertex thì ra số tệp.

Kết quả, viết lại trong `vfx.js` (`FRAG_A`, `FRAG_B`, `FRAG_BX`):
- **typeA** (49% vật liệu):
  - Màu = `lerp(tex.rrr, tex.rgb, _isColor) × màu hạt × max(C2.z, 1) × _MainColor`.
  - UV:
    - `C1.xy` là offset. `C1.zw` là tiling nếu `_Use_Main_TilingOffset` = 0. Nếu = 1 thì cuộn theo thời gian.
    - `_Main_Radial` dùng toạ độ cực của Shader Graph (`atan2(x, y)/6.28`).
    - Deform lấy độ mạnh từ `C2.x`.
  - Dissolve:
    - Tiến trình = `C2.w`. Nhiễu dịch theo `C2.y`.
    - Alpha = `pow(smoothstep((n + p − s/2)/(1 − s)), _DissovePower)`.
    - Viền màu `_DissolveEdge_*`.
  - Mask = `mask.a × mask.r`.
  - Màu phụ (`_USE_SECONDARYCOLOR`):
    - Tô vào vùng kênh B của ảnh.
    - Màu lấy từ gradient `EffectShaderASecondColor.secondaryGradient`, tra theo **TEXCOORD3.x = AgePercent**.
  - Alpha cuối = `sat(alpha × _Main_Alpha)`.
- **typeB** (24%):
  - Ảnh xếp kênh: R là độ sáng, G là nhiễu dissolve, B là vùng màu phụ, A là alpha.
  - `C1` = (tiến trình dissolve, độ mềm, độ sáng nhân, cường độ fresnel).
  - `C2` = màu phụ RGBA.
  - Thiếu custom data thì `C1.z = 0`, hình đen. Đúng như bản gốc.
- **typeB_Xpan**: UV x cuộn theo `C1.z` và giãn theo `C1.w`. Độ sáng = `C1.y`. Luôn cắt alpha ở 0,5.
- Theo biến thể:
  - Không có `_SURFACE_TYPE_TRANSPARENT` thì alpha ra 1.
  - Có `_ALPHATEST_ON` thì discard. Ngưỡng là `_AlphaThreshold` (typeA) hoặc `_AlphaClipThreshold` (typeB).
- `$Globals` `cb0[4].z` = `_AlphaToMaskAvailable` (URP 14). Máy không bật MSAA thì bằng 0.
- Chưa làm:
  - fresnel mask trên mesh (có, nhưng pháp tuyến do `computeVertexNormals` dựng lại);
  - depth fade (`_Depth_Use`);
  - lọc theo "plane system" (`t1`/`t2`, cb0[131–139]) của game.

## Custom vertex stream → TEXCOORD [ĐO]
Unity nhồi stream liền nhau:
- Position, Normal, Tangent, Color có semantic riêng.
- UV nằm ở TEXCOORD0.xy.
- Các stream còn lại xếp nối tiếp, được phép vắt qua hai thanh ghi.

Mẫu thường gặp là `[0,1,3,4,5,34,38]`: UV2 vào TEXCOORD0.zw, Custom1 vào TEXCOORD1, Custom2 vào TEXCOORD2. `fx_export.stream_slots()` tính lại cách nhồi này, ghi `r.slots` (tên nguồn cho TEXCOORD1..3). `vfx.js` điền theo đó.

## Bẫy đã sập
- **`minMaxState` 2 và 3 bị ghi ngược trong `vd-ref/ASSETS.md` §5.3.**
  - 2 = hai đường cong, 3 = hai hằng (giống enum C#).
  - Đo: `startSize` state 3 có `m_Curve` rỗng, scalar/minScalar = 0,5/0,3.
- Góc (startRotation, rotationOverLifetime) lưu bằng radian.
  - `UVModule.frameOverTime/startFrame` lưu đã chuẩn hoá về [0,1).
  - Gradient: `ctime/atime` chia 65535.
- **Gốc prefab có vị trí lệch** (`1001_01_SwordAttack_Hit_Fire` lệch (0,13; 0; 1,31)).
  - `Instantiate(prefab, pos, rot)` thay vị trí và hướng của gốc, chỉ giữ scale.
  - Không bỏ thì hiệu ứng trúng đòn văng ra xa 1,3 m.
- **Billboard có `m_RenderAlignment` World/Local** (vũng độc `Zombie_ToxicPool_Pool`) phải nằm theo khung của node, không quay về camera.
  - Làm sai thì vũng đứng dựng như bức tường, nửa dưới chìm dưới đất.
- **`pivot.z` của billboard tính dọc hướng nhìn, +z là xa camera.**
  - Flash trúng đòn dùng −2 để kéo lên trước nhân vật.
  - Lật dấu thì flash chui xuống đất.
- **Flip chỉ lật hình, không lật pivot.**
  - `SwordAttack_Cast_1st` có flip z 0,5 và pivot z −0,3 trên mesh phẳng.
  - Lật cả pivot thì hai hạt cùng burst tách nhau 1,6 m, nhát chém thành hai vòng.
- Hiệu ứng trúng đòn đặt ở y = 0 thì nửa dưới bị mặt đất che.
  - Game gắn vào thân mục tiêu: VfxEvent `offset "0:0.5:0"`, HitBox `UseBoneAttachHitVfx`.
  - Trang xem mặc định đặt y = 0,5 (`&y=` để đổi).
- **Animator không điều khiển Light.** Đo mọi binding trong bundle:
  - `EmissionModule.enabled` (typeID 198): 515;
  - `m_IsActive`: 103;
  - Transform: 211;
  - `CustomDataModule.vectorK_Q.scalar`: khoảng 45;
  - `RotationModule.y.scalar`: 9, chưa làm.
  - Tên thuộc tính = crc32 của đường dẫn trường typetree.
  - Clip đã biên dịch (`m_MuscleClip`: streamed là đa thức bậc 3 từng đoạn, rồi dense, rồi constant). `fx_export.MuscleCurves` giải và lấy mẫu 30 Hz.
  - Controller thường có Start → Loop → End. `VD.vfx.stop()` chuyển sang End nếu có. Clip End tắt phát rồi hiệu ứng mới dừng hẳn.
- Module Emission bị tắt vẫn phải xuất (khoá `off`), vì Animator bật lại được.
- Nén WebP lossy (YUV 4:2:0) làm lem kênh G/B của ảnh typeB. Vì vậy ảnh đều nén lossless.
- `1001_02_SwordSkill_01_Chain` là MeshRenderer + script `ChainSkillVfx`, không có hạt. Đã vẽ từ 2026-09-25, xem mục "MeshRenderer và ChainSkillVfx".
- UnityPy 1.25: `PPtr` không có `assets_file`. Phải `ptr.deref()` rồi lấy `reader.assets_file.name` + `path_id` làm khoá.
- **`ParticleSetupTool` là script chạy lúc OnEnable, không phải dữ liệu hạt** (ApplyLogic 0x1805da000): nhân `localScale` của targetTransforms và `startSize*Multiplier` của hạt (không ignoreSize) với sizeMultiplier, cộng delayOffset + additionalDelay của tổ tiên vào `startDelay` và `SimpleAnimatorDelay.delayTime`. Không nướng thì HeadShot_Cast của Raven loé nòng sớm 0,6 s, BlindlyShot to hơn 1/0,75. `fx_export.apply_particle_setup` nướng lúc xuất; prefab có dấu `"setup": 1`.
- **`Mobile/Particles/Alpha Blended` không có thuộc tính màu** (ảnh × màu đỉnh). `_TintColor` (0,0,0,0) sót trong vật liệu làm điếu thuốc Raven vô hình → xuất U bỏ màu.
- **Chạy `fx_export.py` lẻ một prefab từng ghi đè mesh trùng tên của prefab khác** (`msh_SphereDome01_uvv_uvflip`). `mesh_out` nay so nội dung tệp đã có: khác thì thêm hậu tố md5.

## MeshRenderer và ChainSkillVfx (2026-09-25)
- **Xuất:** `fx_export.py` ghi MeshRenderer + MeshFilter (không phải Spine) vào `doc.meshes [{node, mesh, mat}]`, mesh ra `art/vfx/mesh/msh_*.json`. Script `ChainSkillVfx` ra `doc.script {type, len, off, chain, player}`. Chạy một phần (`fx_export.py <tên>`) phải giữ nguyên `stats`/`duplicateNames` của index — bẫy đã sập: bản đầu ghi đè mất.
- **[ĐO] Prefab xích:** hai node `ChainLine01_01` (xích từ người chơi, `_playerChainTransform`) và `ChainLine01_02` (xích bay theo hitbox, `_chainTransform`). Mesh dài 5,93 m theo trục z cục bộ (`_chainLength`), `_chainOffset` −0,42. Vật liệu `VFX_Master_typeB_forMesh`: `_TintColor` xám 0,1265, `_2ndColor` HDR (2,69; 4,26; 5,99).
- **[ĐO 2026-09-26] Mã C# đọc được** (metadata v39 + disassembly GameAssembly.dll; `ChainSkillVfx : SkillVfx`; offset trường `_chainLength` 0x50, `_chainTransform` 0x58, `_playerChainTransform` 0x60, `_chainOffset` 0x68, `_elapsedTime` 0x6c, `_isCollisionFinished` 0x70):
  - `SkillVfx.Init(owner, hitBox, posOffset)` (0x1805f07a0): `_isTracking = hitBox != null`; nghe `hb.RxDespawnReason` → `PlayEnd` (trigger Animator `TimeoutTrigger`/`DestroyTrigger`/`EndTrigger`, không có Animator thì Despawn). `LateUpdate` (0x1805f09d0): đang bám thì `pos = HitBox.TransformPoint(_positionOffset)`, `rot = HitBox.rotation`; hitbox mất thì kết thúc như trên.
  - `ChainSkillVfx.FixedUpdate` (0x1805dd8e0): `v = (chủ − vfx)` trên XZ; `L = |v| + _chainOffset`; `chain.rotation = LookRotation(−v̂)`; `chain.localScale = (1, 1, max(L / _chainLength, 0))` — **luôn là `_chainTransform` (01_02)**, cả khi vfx gắn mục tiêu (không HitBox).
  - Có HitBox: `_elapsedTime += fixedDeltaTime`; quá `HitBoxInfo.collisionEndTime` (> 0) thì **một lần**: tắt chain, bật player chain, tách khỏi cha, đặt ở `chủ + v̂·_chainOffset` (giữ y), cùng rotation/scale với chain, `DOScaleZ(0, duration − collisionEndTime)`.
  - Gayoung 1001: hitbox 100103001 `duration` 0,245 < `collisionEndTime` 0,280 → hitbox hết trước, vfx bị huỷ, nhánh thu xích không bao giờ chạy (thời gian tween âm). Trúng hay trượt trông như nhau: xích biến mất cùng hitbox; phần trói là vfx trúng `…_ChainBind`.
  - Web (`vfx.js runScript`): như trên; thu xích làm theo mã (ease OutQuad mặc định của DOTween [SUY LUẬN]), stage truyền `hbTime {col, dur}`. Bản 2026-09-25 đoán sai phần vfx gắn mục tiêu (dùng 01_01).
- **Bẫy đã sập (2026-09-28): xích vô hình dù `visible = true`.** `ChainLine01_02` có scale prefab (1, 1, 0). Bản phát có Animator/script lấy TRS cục bộ bằng `Matrix4.decompose` → chia cho scale 0 → quaternion NaN → ma trận mesh NaN mãi, script đặt lại scale z cũng không cứu. Nay đọc thẳng `pos/rot/scl` của node. Cùng bẫy: `Immobilized_small` (`ChainRing 1` scale 0, Animator phóng to). Test `voiddiver-fx-contract.js` giờ đòi ma trận hữu hạn, không chỉ `visible`.
- **[ĐO] Shader `typeB_forMesh`** (giải DXBC): t0 = `_MaskTex` (G tan biến, B vùng màu 2, A alpha), t1 = `_MainTex`. alpha = A − smoothstep(tan biến) nhân `_TintColor.a`, cắt ở 0,5 (hằng trong shader). Màu = mix(main × tint, `_2ndColor`, B × 2nd.a) + fresnel, nhân `_Emission`. `vfx.js` FRAG_BM.
- Hạt `VFX_Master_typeA` hai mặt lọc mặt theo `CULLSIGN` × dấu lật (`vMir` từ `iPos.w`): VFX lật theo chủ (scaleX −1) không bị cull mất.

## Nạp trước và "vẽ khống" (2026-09-25)
- `stage.spawn` gọi `VD.vfx.preload(fxNamesOf(u))`: mọi tên VFX trong skill → sự kiện → hitbox (vfx, FireVfx, hitVfx, CollisionFx, buff, destroyHitBoxId, ActionEventsOnDestroy, skill của ExtraUnitIdOnDestroy) → buff (BuffVfx, StatusEffectTag, BuffEffects) → SpawnVfx. Tên `…_Hit` nạp mọi biến thể nguyên tố. Không chặn lúc sinh.
- **Bẫy đã sập:** `renderer.compile()` không làm ấm được. Nó biên dịch với render target null (outputEncoding sRGB 3001), còn khung thật vẽ vào RT của hậu kỳ (3000) → khoá chương trình khác, lần phát đầu vẫn biên dịch lại. Đo: xích lần đầu 137–185 ms một khung.
- Cách đang dùng: mẫu vừa nạp được "vẽ khống" một khung trong đường vẽ thật — batch hạt hiện với 0 bản, MeshRenderer và vệt (ribbon/TrailRenderer, shader đỉnh riêng) hiện với drawRange 0. Sau: xích 9–10 ms. Bẫy thứ hai: quên vệt thì đạn Raven vẫn khựng 110–145 ms lúc trúng (chương trình đỉnh ribbon mới).
- ExtraUnit không có bộ Spine (bom đồ chơi Mio 10002) thì bỏ qua tìm Spine theo skin: đo 545 ms vì nạp hết mọi bộ Spine để dò.
- Khung chậm còn lại (30–77 ms) khi không có chương trình mới: [SUY LUẬN] rasterizer phần mềm của headless phải tô các hạt to phủ màn hình (flash trắng); chưa đo trên GPU thật.

## Phát theo thời gian và dừng
- `play` nhận `speeds` (VfxSpeeds: tốc độ theo từng đoạn thời gian của hiệu ứng), `loop` + `loopDuration` (ParticleLooper `_loopInterval`: khởi động lại mọi hệ sau mỗi khoảng), `duration` (tính theo giờ thật), `local` (độ lệch cục bộ quay theo khung), `owner` (Object3D của chủ, cho ChainSkillVfx), `tracking`.
- `stop(h, 'end')`: có trạng thái End của Animator thì chuyển sang, không thì xoá ngay — như `SkillVfx.PlayEnd`/Destroy khi hitbox mất.

## Orbital/Radial trong không gian thế giới và đĩa trắng (2026-09-25)
- **Bẫy đã sập:** Velocity over Lifetime (orbital, radial) của hệ `simulationSpace = World` từng tính quanh (0,0,0) của bản đồ. Ở trang xem VFX hiệu ứng phát tại gốc nên trông đúng; trong game (người chơi ở ~(22, −12)) FireSparks của `Purification` (orbital ±5 rad/s) bay xa 20–25 m, cao 13–24 m, thành đĩa trắng trôi khỏi trận. Nay tâm = vị trí node của hệ, trục theo khung node (`vfx.js` simSystem). 107 hệ trong 506 prefab dính (mọi `FireSparks` của Noah, `debris` của DarkHands…).
- Cách tìm lần sau: ẩn từng mesh con của nhóm `vfx` bằng `layers.set(31)` (đừng dùng `visible`: `VD.vfx.update` đặt lại mỗi khung), chụp, đếm điểm ảnh trắng; rồi đọc `iPos` của batch để xem hạt ở đâu.
- **Màu [HDR] không đổi sRGB (2026-09-25; kiểm lại 2026-09-26).** [ĐO] `PlayerSettings.m_ActiveColorSpace = 1` (Linear, globalgamemanagers, Unity 6000.3.5f2). [ĐO] Không mã VFX/skill nào đặt màu vật liệu lúc chạy (`Material.SetColor`/`MaterialPropertyBlock.SetColor` chỉ ở UI/TMP, DOTween, OutlineObject, UnitHighlightVisualEffect, UnitVisualEffectView.PlayHitEffect, cắt cảnh, dissolve đồ trang trí; không ai gọi `Color.linear/gamma`) → màu VFX đúng như vật liệu lưu. [SUY LUẬN ~75%] Unity tải màu [HDR] nguyên số: `ColorMutator.cs` coi màu HDR là tuyến tính; `_2ndColor` max của xích = 5,9922 = 191/255 × 2³ đúng kiểu tách "byte × 2^intensity" của bảng chọn HDR. Trang `Material.SetColor` hiện nay ghi ngược lại — coi là lỗi tài liệu. Giữ nguyên cách đang làm. [ĐO] cờ thuộc tính trong shader (`m_PropInfo.m_Props[].m_Flags` & 16): typeA `_DissolveEdge_Color`; typeB_forMesh `_TintColor`, `_2ndColor`, `_FresnelColor`. `_MainColor` của typeA không có cờ, vẫn đổi sRGB → linear. [ĐO] URP asset `UniveralRP_VD` bật HDR (`m_SupportsHDR` 1, bộ đệm 32 bit R11G11B10), Camera `m_HDR` true, bloom ngưỡng 1 cường độ 0,3. [SUY LUẬN] số lưu của màu HDR đã là tuyến tính: thanh Intensity 'mỗi nấc gấp đôi ánh sáng' chỉ đúng khi số lưu tỉ lệ thẳng với ánh sáng, và ảnh gốc `steamshots/ss03.jpg` (quái bị thanh tẩy) chỉ có đốm trắng nhỏ + khói tối. Bẫy đã sập: đổi sRGB thì viền 32 của `…_alphaClip_Edge_White` thành 3617, điểm ảnh ~570, bloom ra đĩa trắng 1 m. Đo lại sau khi sửa: đốm nhỏ như ss03; các sheet combo/xích/Noah E/Mio R không tối đi (xích vẫn thấy, nền xám hơn). Tài liệu Unity `Material.SetColor` ghi mập mờ về [HDR] — chưa có nguồn chắc.

## Chọn theo ảnh [SUY LUẬN]
- **Stretched billboard:**
  - U chạy theo hướng bay. Ảnh gốc có đầu vệt ở U=1: `Img_ToonSplash_02i_Tail`, `LightBeamMask08`.
  - Đầu vệt nằm ở vị trí hạt, thân kéo về sau.
  - `lengthScale` âm (muzzle `100003`: −2) lật quad ra trước.
- **Góc cuộn billboard dương thì quay theo chiều kim đồng hồ trên màn hình.** Mesh particle dùng thẳng `Quaternion.Euler` (thứ tự Z, X, Y).
- Chuyển toạ độ sang three (gương qua mặt z = 0), để mọi phép tính khớp ma trận Unity:
  - vị trí `(x, y, −z)`;
  - quaternion `(−x, −y, z, w)`;
  - góc Euler `(−x, −y, z)`;
  - mesh lật z và đảo chiều tam giác.
- Màu:
  - Màu hạt kẹp về [0,1] rồi đổi sRGB → linear (vertex color của Unity là Color32).
  - Custom data giữ nguyên số float.
  - Màu vật liệu đổi sang linear.
  - Kết quả ra qua `linearToOutputTexel`, nên theo `renderer.outputEncoding`.

## Sub emitter, vệt từng hạt, Noise, Inherit Velocity, Collision (2026-09-26)
Đếm trên 506 prefab đã bóc: sub emitter 22 hệ, Trail PerParticle 11, InheritVelocity 49, Noise 6, Collision 5 (`vfx_view.html` dòng "bỏ qua" giờ chỉ còn ExternalForces 2 hệ của `300022_Hatman_Shadow`).
- **Xuất** (`fx_export.py`): `sub [{s: chỉ số hệ con, t: 0 Birth | 1 Collision | 2 Death, p: bit kế thừa, pr: xác suất}]` (PPtr component ParticleSystem → chỉ số hệ qua bảng PathID), hệ con đánh `isSub`; `noise`, `inhVel {mode, c}`, `coll {type, planes: [node], dampen, bounce, loss, minKill, maxKill, radius}`; renderer `tslots` khi `m_UseCustomTrailVertexStreams`.
- **[ĐO] Hệ con không tự phát** — hệ cha điều khiển. Bản trước phát hệ con như hệ thường: gatling Raven (`Shots` bắn mỗi 0,1 s, 5 hệ con Birth) chỉ loé một lần lúc đầu; nay loé theo từng phát.
- Birth: mỗi hạt cha chạy một dòng thời gian riêng của hệ con (rate over time theo `dur` hệ con, burst có cycle/interval, rate over distance theo quãng hạt cha đi, lặp nếu hệ con `loop`), phát tại vị trí hạt cha, hình phát quay theo node của hệ con. Collision/Death: chỉ dùng burst của hệ con (tổng count) [SUY LUẬN: như tài liệu Unity "chỉ burst"]. Kế thừa: bit 1 màu, 2 size, 4 xoay, 8 tuổi thọ còn lại.
- Inherit Velocity chỉ có tác dụng khi mô phỏng World (như Unity). Vận tốc emitter = dời node / dt; hệ con lấy vận tốc hạt cha. Initial cộng một lần lúc sinh, Current cộng mỗi khung. Soi bằng `--move=vx,vz` (`vfx_view.html?move=`): vòng xoáy đạn phép Mio giờ bám đạn thay vì rớt lại sau.
- Collision: Planes = mặt phẳng qua node, pháp tuyến trục Y node. **World xấp xỉ bằng mặt đất y = 0** [SUY LUẬN: hạt trong phạm vi chỉ va sàn — laser DarkYoung, giọt Hatman]. Bounce = phần vận tốc pháp tuyến bật lại, Dampen = phần tốc độ mất, Lifetime Loss × tuổi thọ, Min/Max Kill Speed. Va chạm thì phát sub Collision tại điểm chạm.
- Noise: [SUY LUẬN] Perlin cải tiến 3D (hàm nhiễu của Unity là mã đóng), mỗi trục một trường lệch nhau, octave/octaveMultiplier/octaveScale, scrollSpeed cuộn theo thời gian hiệu ứng, remap, positionAmount như vận tốc động (không tích vào vận tốc gốc), rotationAmount. Damping: độ mạnh chia tần số [SUY LUẬN: để thu phóng trường mà quỹ đạo giữ dáng].
- Vệt từng hạt (Trail PerParticle): lịch sử vị trí mỗi hạt (tối đa 40 điểm, `minVertexDistance`), tuổi điểm = `lifetime × tuổi thọ hạt`, `ratio`, `dieWithParticles` tắt thì vệt mồ côi mờ dần, bề rộng `widthOverTrail × size`, màu `colorOverTrail × colorOverLifetime × màu hạt`. Điểm lưu trong thế giới nếu hệ World hoặc vệt `worldSpace`, không thì theo khung hệ.
- **Bẫy đã sập: luồng đỉnh tuỳ biến của vệt.** Vật liệu vệt typeA có dissolve đọc `C2.w`; vệt mặc định (Position/Color/UV) cho 0 → `pow(…, 12)` ≈ 0, vệt vô hình. Renderer có `m_UseCustomTrailVertexStreams` + `m_TrailVertexStreams` riêng (lướt Raven: `[0,1,3,4,8,9,34,38]` → Custom1/2 vào TEXCOORD1/2). Nay xuất `tslots`, vệt nhận custom data của hạt (cả vệt Ribbon: lấy của hạt mới nhất [SUY LUẬN]). 16 prefab có.
- Ảnh trước/sau: scratchpad `sheets2/ba_*.png` (gatling, SoulTrail, laser DarkYoung, Trap_Explosion, lướt Raven, Mio biến hình, WeaponBroken, đạn Raven, đạn phép Mio, EyeBallBomb, SoulStorm, Cigarette).

## Chưa làm (đếm đợt 2: 3.864 hệ / 506 prefab)
| Mục | Số hệ | Ghi chú |
|---|---|---|
| ExternalForces | 2 | `300022_Hatman_Shadow` |
| Sub emitter Trigger/Manual | 0 | không prefab nào dùng |
| Collision với tường | | chỉ sàn y = 0 và mặt phẳng |
| LightsModule | 48 | gần đúng: 1 đèn ở tâm hệ, cường độ × số hạt × ratio |
| Shader Grabpass_Distortion | 5 vật liệu | bỏ, không vẽ |
| typeC_3CD, BG_Particle, SurfaceCutter | 26 vật liệu | vẽ kiểu unlit ảnh × màu |
| MeshRenderer trong prefab VFX | 3 | đã vẽ (doc.meshes); SpriteRenderer chưa |
| Sắp theo khoảng cách giữa các hiệu ứng | | mỗi mẫu gộp mọi bản phát vào 1 draw call. Thứ tự giữa mẫu theo `sortingFudge` |

## Tải (test `--gpu=1`, RTX 3050 Laptop, 960×540)
- 30 hiệu ứng khác nhau cùng lúc: 590–670 hạt, 120–133 draw call.
- Mỗi khung (update + render + chờ GPU bằng `readPixels`) mất trung bình khoảng 10,6 ms, tối đa 27 ms. Khung tối đa là lúc biên dịch shader mới.
- Mô phỏng CPU trung bình khoảng 2 ms.
