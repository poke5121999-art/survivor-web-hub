# Food Gang: hiệu ứng (VFX) so với bản gốc (vòng 2026-10-31, sau rev 20261031c)

Chủ dự án chơi bản Pages rev 20261031c trên máy tính, chê "vfx, effect không tự nhiên". Vòng này kê mọi hiệu ứng bản gốc
bắn ra, chụp từng cái trên bản web, so với clip, tìm gốc rễ ở runtime hạt (`js/engine/particles.js`), bộ xuất
(`tools/export_unity.py`) và phần view (`js/game/match/`), sửa rồi chụp lại.

Nguồn đối chiếu `[ĐO TRONG REPO]`:
- Dữ liệu từng ParticleSystem/material: YAML của `D:\foodgang-ref\fg-unity` (AssetRipper) qua bộ xuất.
- Shader thật: APK `D:\foodgang-ref\apk\assets\bin\Data\data.unity3d` đọc bằng UnityPy (tên shader của từng material,
  `rtBlend0`, mã GLES3 của fragment). Rip chỉ có shader giả và trỏ mọi material hạt về `Sprites/Default`.
- Logic view: decompile `QuantumAgentView.LateUpdate / OnTookDamage / SoftDestroyPoisonFX`, `QuantumBulletView.SoftDestroySmoke`,
  `QuantumFXListener.OnBulletDestroyed`, `DestroyAfterDelay.OnEnable`, `ParticleSoftDestroy.Trigger`
  (`sh /d/foodgang-ref/udk/udk.sh method ...`).
- Clip: `D:\foodgang-ref\clips\U3UMg6kwT3I` (30 fps, 1280x720), khung cắt ở `D:\foodgang-ref\parity-vfx\ref\`,
  dải khung ở `D:\foodgang-ref\clips\vfx\`.

Cách chụp web: `node test/food-gang-vfx.js` phần B mở `dev.html` (Kitchen, BRO đứng yên), dừng vòng lặp engine rồi bước
tay 1/60 s, sinh từng FX ở (2.5, 1, 0) (đạn bay sang trái 12 u/s kèm prefab khói đuôi như `QuantumBulletView`), chụp các
khung 1, 3, 6, 10, 15, 20, 30, 45, 60, 90 ở 3 cỡ: 1280x720 DPR 1, 1920x1080 DPR 1, 1280x720 DPR 2
(`shots/food-gang/vfx/<cỡ>/<fx>/fNN.png`, số hạt từng khung ở `shots/food-gang/vfx/report.json`).

## 1. Danh mục hiệu ứng `[ĐO TRONG REPO]`

Kích hoạt theo view gốc. "Trước" = bản Pages rev 20261031c, "sau" = bản trong cây sau vòng này.

| Hiệu ứng | Kích hoạt (nguồn) | Prefab / hệ hạt | Trước | Sau |
|---|---|---|---|---|
| Trúng đạn thường | BulletDestroyed → `FgViewDb.fx` (QuantumFXListener) | `Fx_hit_bullet`, `Fx_hit_bullet_melon(_special)`: spark (stretch), impact | sao trắng đúng nhưng tia lửa cộng sáng, dày gấp 4, bay xa 1,4 u | tia lửa trộn alpha, mảnh 1/4 quad, dừng trong ~0,4 u |
| Trúng cận chiến | AgentTookDamage khi `meleeWindowOpen` → `fxMeleeHit` / `Fx_hit_melee` | Circle, spark, impact | như trên | như trên |
| Nổ (tên lửa, dynamite, chiêu bông cải/khoai/donut) | BulletDestroyed | `Fx_hit_missile`, `Fx_hit_pepper(_special)`, `Fx_hit_broccoli/potato/donut_special`: Circle, spark, smoke, impact, spark (1) có collision | tia lửa (1) rơi xuyên sàn, không dừng | tia lửa nảy trên sàn/kệ rồi nằm trên mặt bàn như clip |
| Chiêu táo, pizza | BulletDestroyed | `Fx_hit_apple_special` (skull), `Fx_hit_pizza_special` (pieces + collision) | đầu lâu là ô vuông trắng | texture đầu lâu, cộng sáng |
| Vùng chiêu pizza | đạn vùng | `Fx_area_pizza_special`: blood (collision, sub-emitter Death) + Particle System (vết loang) | vết loang tự phát ở tâm mỗi giây, blood ô trắng | vết loang ra đúng chỗ giọt rơi xuống sàn, blood có texture |
| Vùng khói khoai tây | đạn vùng | `Fx_area_potato_special`: smoke + spark, burst vô hạn mỗi 0,01 s | 1 hạt + 1/s, gần như không có khói | màn khói dày 5,5 s ("tự phả khói" trong CLIPS.md) |
| Khói đuôi đạn | BulletSpawned → `FgViewDb.smoke`, theo `m_smokeRoot`, Stop + Destroy(duration + lifetime) khi đạn mất | `smoke_bazooka/missile/dynamite/bubble` (burst 5 hạt mỗi 0,01 s), `smoke_poison` (rate theo quãng) | chỉ 5 hạt lúc bắn: đuôi gần như trống | đuôi khói đặc vàng → cam như clip 515 s; khói tắt dần sau khi đạn nổ |
| Tia lửa đuôi đạn | trong prefab `bullet_tomato/potato/pepper` | spark burst 1 mỗi 0,05 s vô hạn, collision | 1 tia mỗi 2 s | 20 tia/s, rơi xuống sàn |
| Chết | AgentDied → `deathFx` của skin (`OnDied`, không phóng cho boss) | `Fx_death_<quả>`: blood (stretch, phun về camera) + pieces (texture sheet 3x1) | mảnh bị xén lệch (texture cắt viền), blood ô trắng dài 4:1; boss ×1,5 tự chế | 3 mảnh nguyên, blood giọt tròn co theo phối cảnh, cỡ như gốc |
| Hồi máu | AgentTookDamage < 0 → `Fx_heal` + blinkHeal | Fx_heal: 5 burst mỗi 0,1 s, noise | ô vuông trắng/xanh nhạt | dấu cộng xanh cộng sáng bay lên |
| Trúng độc | cờ Poison → `Fx_poison` gắn vào agent; hết độc: SoftDestroyPoisonFX | Fx_poison (skull, rate 4/s) | ô vuông trắng; hết độc là mất ngay | đầu lâu xanh; hết độc thì tách khỏi agent, ngừng phát, đầu lâu bay nốt |
| Bụi chạy | clip `skin_run` bật `EmissionModule.enabled` của `skin_smoke` | burst 3 mỗi 0,5 s vô hạn | không bao giờ phát (module tắt bị bỏ khi xuất) | 3 cụm khói mỗi 0,5 s khi chạy |
| Chớp khi trúng / hồi / độc / BlinkRed / bất tử / tàng hình | QuantumAgentView.LateUpdate | `_FlashAmount` + `_FlashColor` của material skin | màu chớp tự chế (xanh nhạt, đỏ nhạt, xanh độc), hồi máu tắt 2/s; bất tử nhấp nháy trong suốt; tàng hình đồng đội mờ 35 % màu thật | màu theo decompile: hồi (0,1,0), đỏ (1,0,0), độc (1,0,0.6), còn lại trắng; lượng chớp = max các blink; hồi tắt 0,75/s; bất tử = chớp trắng sóng tam giác 0..1 tốc 5; đồng đội tàng hình = bóng đen 50 % (`_Color` (0,0,0,0.5) của Invisibility) + chớp trắng khi bắt đầu |
| Rung máy | đạn mất có `CinemachineImpulseSource` | `cine.shake` theo `ImpulseType` | giữ | giữ (không đổi vòng này) |
| Khói tủ lạnh (thưởng) | Box1/2/3 mở | `UIParticleSystem` + `UIParticleSmoke` | renderer không có material: ô trắng/không thấy | texture `particle_UI_smoke`, cộng sáng, đúng không gian RectTransform |
| Sao thưởng, chữ Z ngủ, sao bục VICTORY | SceneReward/SceneGameOver | `UIParticleSystem` + `UIParticleReward/Sleep`; hạt dưới canvas camera | Z ngủ và sao thưởng không có texture | texture + material của Graphic; `UIParticleSleep`/`UIFlash` cộng sáng như shader thật |

## 2. Gốc rễ đã sửa

Nhóm theo chỗ sai, mỗi dòng có kiểm trong `test/food-gang-vfx.js`.

1. **Material (bộ xuất)**: blend lấy từ shader thật trong APK thay vì `Sprites/Default` của rip; texture `_Texture2D`
   (Shader Graph) và `_BaseMap` (URP) không còn bị bỏ; material URP có MonoBehaviour đứng trước nay đọc đúng tài liệu.
   Spark/missile spark thôi cộng sáng, bubble/heal/skull/UIFlash/UIParticleSleep chuyển cộng sáng như APK.
2. **Texture cắt viền (runtime)**: quad hạt trải cả texture gốc, cắt theo phần ảnh còn giữ (spark mảnh lại 4–8 lần, mảnh
   chết nguyên miếng).
3. **Emission (bộ xuất + runtime)**: module tắt vẫn xuất (`on: 0`) để clip bật được; `cycleCount 0` = vô hạn; lịch burst
   chạy cả khi module tắt.
4. **Vật lý hạt (runtime)**: drag × v² (`multiplyDragByParticleVelocity`), scale transform cho mô phỏng World, collision
   World 2D với BoxCollider2D của map theo `collidesWith`, sub-emitter Death, noise lấy mẫu theo vị trí với damping.
   Stretched billboard dựng theo vận tốc 3D (trục ngắn quay về camera) thay vì chỉ trên mặt phẳng màn: máu chết phun về
   phía camera (cone `rot -15,180`) nên co lại thành giọt tròn ~2:1 như clip, trước đây là vệt dài 4:1.
5. **UIParticleSystem (runtime)**: material + sprite + màu của Graphic.
6. **View**: thời gian sống FX theo `DestroyAfterDelay.m_delay`; khói đuôi Stop rồi huỷ sau duration + lifetime; FX độc tách
   khỏi agent rồi tắt dần; chớp/bất tử/tàng hình theo `QuantumAgentView.LateUpdate` đã decompile. Cỡ ×1,5 của boss: gốc
   chỉ phóng FX trúng đạn (`QuantumFXListener`, `FromBoss`) và FX trúng cận chiến khi mục tiêu là boss
   (`QuantumAgentView.OnTookDamage`); `OnDied` sinh FX chết không phóng. Web từng phóng FX chết của boss và quên FX cận chiến.

## 3. So với clip (skill parity-compare)

`D:\foodgang-ref\parity-vfx` (ref = khung cắt 520x360 từ clip U3UMg6kwT3I, web = khung chụp bản trong cây vì bản này chưa
lên Pages). Kết quả cổng `check` ở mục 5.

## 4. Chạy nhiều lần

## 5. Bộ kiểm

## 6. Còn khác bản gốc `[ĐỀ XUẤT]`
