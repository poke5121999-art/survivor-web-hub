# AI quái — luật rút từ Monster.csv và Const.csv (2026-09-25)

Mã: `js/ai.js`. Kiểm: `test/voiddiver-ai.js`. Lõi chiến đấu (skill, hitbox, buff) xem `SKILLVM.md`.
Nhãn: **[ĐO]** = dữ liệu chứng minh, **[SUY LUẬN]** = đoán từ tên cột hoặc Const, **[CHƯA RÕ]** = §10.

## 1. Gọi thế nào

Mỗi khung gọi theo thứ tự:
1. `VD.Skill.step(world, dt)`
2. `VD.AI.step(world, dt)`
3. `VD.AI.applyLight(world, dt)`

AI chạy **sau** Skill.step. Nhờ vậy skill do AI dùng không tiến thời gian ngay trong khung vừa gọi, giống skill bấm bằng phím, và nhịp khớp số.
- Bẫy đã sập: để AI chạy trước thì mọi khe GCD hụt 1 khung (1.033 thay vì 1.05).

Mỗi quái có:
- `u.ai`: trạng thái nội bộ.
- `u.aiState`: một trong `idle`, `wander`, `curious`, `combat`, `flee`, `pause`, `return`, `dead`.
- `u.aiSub`: `chase`, `kite`, `avoid` hoặc null.

Sự kiện phát cho HUD và trình bày:
- `aiState {state, prev}`
- `aiMark {mark:'?'|'!'}`
- `aggro {target}`
- `lostTarget {why}`
- `aiCast {skillId}`
- `anim {name, speed, loop, locomotion:true, fallback}`
- `lit {on}`
- `phaseUp`, `respawn`, `despawn`

Lưới đi lấy từ `world.navWorld` (test) hoặc `VD.world` (world.js): `nav`, `navW/navH`, `navCell`, `navCenter`, `NAV`, `raycastShot`. Di chuyển đi qua `world.moveUnit`, tức `moveCircle` của world.js, nên quái trượt theo tường.

## 2. Nhìn

- **Nón nhìn**: thấy nếu `d ≤ SightRange` và lệch khỏi hướng mặt ≤ `SightAngle/2`, hoặc `d ≤ SightBackRange` ở mọi hướng. Tường chắn (`raycastShot < 1`) thì không thấy, trừ khi `IgnoreObstaclesForDetection`. `SightAngle 360` = nhìn quanh. [ĐO về cột]
- **Tầm combat**: `SightRange × BattleSightRangePercent/100`.
  - Zombie 200011: 3 × 270% = **8.1 m**.
  - Kkamong 200001: 3.4 × 255% = 8.67 m.
  - Giá trị có trong bảng: 100 / 255 / 270 / 1050.
- **"?" hay "!" khi mới thấy** [SUY LUẬN từ tên `MonsterDirectAggroSightRangeMultiplier 0.5` và `…BackRangeMultiplier 0.9`]:
  - Trong nón và ≤ `SightRange × 0.5`, hoặc ≤ `SightBackRange × 0.9` → **"!"** vào combat ngay.
  - Thấy nhưng xa hơn → **"?"** (curious).
  - Zombie: "!" khi ≤ 1.5 m trước mặt hoặc ≤ 1.17 m sau lưng. "?" khi ≤ 3 m trước mặt hoặc ≤ 1.3 m sau lưng.
- **Curious**:
  - Thêm `OnCuriousBuffIds`. Ví dụ 60101: +1.0 tốc chạy trong 2 s.
  - Đứng nhìn `MonsterCuriousStateTime` 0.6 s, rồi đi tới chỗ thấy cuối.
  - Thấy liên tục đủ `MonsterAlertTrackTargetTime` **1.1 s** → "!".
  - Mất dấu `MonsterAlertLostTargetTime` 0.4 s → quay về.
- **Aggro "!"**:
  - Thêm `OnCombatBuffIds`. Ví dụ 60012: +0.9 tốc chạy cố định, nên zombie chạy 1.9 m/s. 60000: +50% trong 5 s.
  - Phát `AggroSfx` (hồi `MonsterAggroSfxCoolTime` 8 s).
  - Đứng `MonsterAggroStateTime` 0.4 s.
  - Đòn đầu chỉ ra sau `MonsterReactionDelay` **0.8 s**.
- **Lan aggro**: đồng minh trong `TargetSpreadRange` 4 m (trừ quái có `IgnoreReceiveAggroSpreadEvent`) vào combat sau `MonsterReceiveAggroSpreadStateTime` 0.75 s. Chỉ lan `MonsterAggroChainMax` = 1 bậc.
- **Mất mục tiêu** → trạng thái `return`, gỡ buff combat và curious, đứng `MonsterLostTargetStateTime` 0.45 s rồi về điểm sinh. Hai cách mất:
  - không thấy **`TargetLostInSightTime` 2 s**,
  - hoặc xa quá `TargetFollowRange` 9 m trong `TargetFollowRangeGiveUpTime` 3 s.
- **Chọn mục tiêu**:
  - Quái có `TargetHighStressPlayer` ưu tiên nhân vật có stress ≥ `TargetHighStressPlayerTriggerStress` 75. Còn lại chọn gần nhất.
  - Đang đánh quái phe khác mà người chơi hiện ra hoặc đánh vào: `MonsterRetargetToPlayerChance` 35% đổi sang người chơi.
- `Blind` → tầm nhìn còn `BlindSightRange` 1 m. `world.anomaly` → ngoài combat tầm × `AnomalyMonsterNoneCombatSightMultiplier` 0.5. `Invisible` → không thấy.

## 3. Chọn skill

Tầm và điều kiện dùng skill nằm ở `Skill.AiSkillCondition`, không ở `castRangeRadius`. [ĐO]
- Chỉ 18 root skill quái có `castRangeRadius > 0`, và đó là cho chỉ báo. Ví dụ 20001040 có castRange 6 nhưng điều kiện AI là < 2.
- `AiTargetDistanceCondition` có ở 406 skill.
- Tầm đánh khớp với tầm đuổi (§4):

  | Quái | Tầm đánh | Start / End đuổi |
  |---|---|---|
  | Kkamong 20000000 | < 2.3 | 2.2 / 1.8 |
  | Zombie 20000401 | < 1.3 | 0.9 / 0.6 |

Luật:
- Chỉ skill có **`Weight > 0`** được AI chọn. 236 skill có Weight 0: skill trigger, passive, bản không dùng.
- Skill phải: hết hồi chiêu riêng, `Skill.canUse` đúng, **mọi** `TargetConditions` và `CasterConditions` đúng.
- Trong các skill đạt, bốc ngẫu nhiên theo `Weight`.

| Điều kiện ($type) | Luật |
|---|---|
| AiTargetDistanceCondition | `dist(tâm, tâm) compareType compareValue` |
| AiNoHighObstacleToTarget | `raycastShot` thông |
| AiCasterDifficultyCondition | độ khó hiện tại ≥ `Difficulty` (thứ tự Easy < Normal < Hard < Insane; tên skill "하드 이상" = "Hard trở lên") [ĐO tên] |
| AiCasterHpPercentCondition | % máu so với `HpPercentValue` |
| AiCasterNearbyMonsterCountCondition / …AllMonsterCountCondition | đếm quái (theo `MonsterId` / mọi quái, trừ chính nó) trong `DistanceValue` |
| AiTargetHasCrowdControlCondition / AiTargetHasBuffIdCondition | mục tiêu đang bị CC loại đó / có buff |
| AiCasterNearbyTargetableHitBoxCountCondition | đếm hitbox `TargetableHitBoxId` còn sống trong tầm |

**GlobalSkillCoolTime**: khi skill kết thúc thì phải chờ `GlobalSkillCoolTime × Difficulty.GlobalSkillCoolTimePercent/100` mới dùng skill tiếp. [SUY LUẬN: tính từ lúc skill **kết thúc**]
- Ví dụ zombie ở độ khó Hard: 1 × 105% = **1.05 s**.
- Hồi chiêu riêng vẫn áp: khe dài hơn là do đang chờ CoolTime (20000407: 5.5 s).
- Hồi chiêu skill quái nhân `Difficulty.CooldownReductionPercent` (§2.8 SKILLVM).

Khi đang chạy skill, AI đứng yên. Di chuyển trong skill do bộ thông dịch lo (lao, lùi…).

## 4. Di chuyển trong combat

- **Đuổi (có trễ)**: `d > StartMoveToTargetRange` thì đuổi; `d ≤ EndMoveToTargetRange` thì dừng. [SUY LUẬN: tên cột]
  - Kkamong: đuổi tới 1.8 m. Mục tiêu lùi ra 2.1 m thì đứng yên. Ra 2.5 m thì đuổi lại. [kiểm]
- **Thả diều**: `KiteStartRange > 0` và `d < KiteStartRange` thì lùi tới khi `d ≥ KiteEndRange`. 44 quái có giá trị này.
- **Né**: mục tiêu vừa ra đòn trong `AvoidRange` → `AvoidStatePercent`% lùi ra trong `AvoidStateDuration` giây. [SUY LUẬN]
  - Kkamong: 3.5 m, 50%, 1.5 s.
- **Chạy trốn**: bị trúng đòn khi `%máu ≤ FleeHpPercent`, hết `FleeCooltime`, và `FleeDuration > 0` → `FleePercent`% bỏ chạy `FleeDuration` giây, rồi đếm lại hồi `FleeCooltime`.
  - Kkamong: 50%, 10%, 2 s, CD 2.
  - Zombie có `FleePercent 0` nên **không bao giờ chạy** dù `FleeHpPercent 50`. [ĐO]
- **Khựng**: bị trúng (không phải DoT) khi không đang ra đòn → `PauseStatePercent`% đứng `PauseStateDuration` giây. [SUY LUẬN: "phản ứng trúng đòn"]
  - 150/213 quái có 30%. Kkamong 1 s, zombie 1.5 s.
- **Bị đánh khi chưa combat**: kẻ đánh thành mục tiêu, vào combat ngay (không qua "?").
- **Lang thang**:
  - Đứng `WanderWaitTimeMin..Max` (3.5–6.5 s).
  - Rồi đi tới một điểm ngẫu nhiên trong `WanderRange` quanh điểm sinh (điểm phải đi được), đi tối đa `WanderMinTime..MaxTime` (1–5 s).
  - Tới nơi: cách ≤ `AgentStoppingDistance` 0.55 m.
- **Về nhà** (`return`): đi về điểm sinh (0.55 m) rồi `idle`. Đang về vẫn nhìn, nên có thể aggro lại.

## 5. Tìm đường

- **Thẳng** khi đoạn tới đích vừa không bị chắn đạn (`raycastShot = 1`) vừa không cắt ô nav chặn (lấy mẫu mỗi nửa ô).
  - Cần cả hai vì world.js có hai loại hộp: `navVolumes` chặn đi, `colliders high/other` chặn đạn và tầm nhìn. Tường thấp thì nhìn qua được nhưng không đi qua được.
- **Flow field** khi không thẳng được:
  - Dijkstra (Dial) trên lưới nav 0.5 m, 8 hướng, giá 2 (thẳng) / 3 (chéo), không cắt góc. Nguồn là ô của đích.
  - Mỗi quái đi về ô lân cận có giá nhỏ nhất.
  - Field được **dùng chung** theo đích (`u:<uid>` cho mục tiêu, `home:<uid>` cho điểm sinh, `p:<x,z>` cho điểm) và tính lại **tối đa mỗi 0.25 s**. Test: 2 zombie đuổi 1 người trong 6 s, dựng ≤ 25 lần.
  - Đo: lưới 240×240 (4×4 sector) mất ~5 ms mỗi lần dựng.
- **Tách đàn**: quái cách nhau < r1 + r2 + 0.15 m thì bị đẩy ra, trọng số tỉ lệ độ lún. Test: khoảng cách nhỏ nhất 0.60 m. (Khe 0.15 m không có trong bảng.)

## 6. Phe

`Faction.csv` [ĐO]:
- 1001 (máy móc) ⟷ 1002 (lính cứu hoả) ⟷ 1100 (Deep One) thù chéo nhau. 1101 thù cả ba.
- 2001 và 3001 không thù phe nào.
- 9999 nằm trong `AllyFactionIds` của mọi phe. Đó là 5 quái "Dark Young / Hatman / Formless Spawn" (300010/300011/300022/300027/301010). Chúng chỉ đánh người chơi, còn lại đi lang thang.
- FactionId −1 (113 quái) đứng ngoài ma trận phe: không đánh quái nào.
- Người chơi khác team, nên mọi quái thù người chơi.

Test: 200019 (1001) và 200023 (1002) tự nhắm nhau. Zombie (−1) và 300011 (9999) đứng cạnh nhưng không vào combat.

## 7. Đèn pin (`AI.applyLight`)

**Vùng sáng**: nhân vật còn `LightFuel > 0` chiếu nón `Character.SightAngle` 120° × `SightRange` 5 m theo hướng ngắm, cộng vòng `SightBackRange` 1 m quanh người. Tường chặn đạn thì chặn sáng.

**Quái trong vùng sáng**:
- `LightBuffId`: thêm, hoặc làm mới mỗi khung. Buff 3000003 sống 2 s: Atk −25%, Def −20%, **MoveSpeed −0.7**. [ĐO]
  - Bẫy đã sập: zombie đứng sát Gayoung bị làm chậm từ 1.9 xuống 1.2. Test AI tắt đèn trừ mục đèn.
- `LightStackBuffId`: thêm 1 stack khi vào sáng, rồi +1 stack mỗi giây còn trong sáng. [SUY LUẬN nhịp] Buff sống 1 s, nên ra khỏi sáng thì rớt.
  - 3000004/5/7 có trigger `Stack ≥ 2`. Vậy phải phơi sáng ≥ 1 s liên tục mới bị đốt. [ĐO trigger]
  - Quái bóng tối 900001: 3000005 = 3.5% HpMax mỗi stack mỗi giây. Test: 2 stack.
- Lõi đã sửa: `DotPercentHpDamage` đọc cột `Percent` (3000005: Percent 3.5, TickAmount 0).

## 8. Pha, hồi sinh, bóng tối, nhãn

- **Lên pha**: quái có `BasePhaseMonsterId > 0` về 0 máu mà còn dòng `Phase + 1` cùng base → không chết.
  - Đổi sang dòng đó: chỉ số, skill, passive, đầy máu.
  - Bắn `MonsterPhaseUpSkillTrigger`, phát `phaseUp`.
  - Ví dụ SoulCollector 300005 → 300009, Slender 300014 → 15 → 16. [SUY LUẬN: Spine boss có anim `revive` mỗi pha]
- **Hồi sinh**: `RespawnTime > 0` (43 quái) → đặt `u.ai.respawnAt`. Tới giờ thì hồi tại điểm sinh, trừ khi `world.respawnMonsters === false` (lớp dive tự lo).
- **Quái bóng tối** (MonsterType Shadow): AI giống quái thường. Tự biến mất sau `ShadowMonsterLifeTime` 90 s (`despawn`). Lớp dive lo việc sinh chúng.
- **Tạo quái**: `AI.init(world, u)` phát `SpawnVfx` / `SpawnSfx`, đứng yên `SpawnDelay + MonsterSpawnTime` (0.2 s).
- **`SightTag` / `SpeedTag` chỉ là nhãn cho sách quái** [ĐO]:
  - Có khoá dịch `ESightTag_Narrow = "Hẹp"`, `ESpeedTag_Slow = "Chậm"`…
  - Nhãn không suy ra được từ số: có quái `Slow` mà MoveSpeed 2.0, có quái `Wide` mà nón 150° / 3.4 m.
  - AI không đọc hai cột này.
- **Anim đi**:
  - Tốc độ clip = tốc độ chạy / `WalkAnimation1xSpeed`, kẹp `[MinWalkAnimationSpeed 0, MaxWalkAnimationSpeed 3.5]`.
  - Tốc độ ≥ `MoveSpeedThresholdForRun` 2.4 thì dùng `run` (kèm `fallback: 'walk'` cho bộ Spine không có `run`).
  - Đứng thì dùng `idle`.
  - Boss nhiều pha thêm tiền tố `"<Phase>/"` (Boss_SoulCollector có `0/…`, `1/…`).
  - Tên clip quái: `idle`, `walk`, `run` (vài con), `attack_1`, `skill_1`, `death` (ASSETS.md §1.2, `sample/spine/Monster_Zombie/meta.json`).
  - Ví dụ: Kkamong lang thang 1.8/1.4 = ×1.286. Zombie combat 1.9/0.4 = 4.75, kẹp ×3.5.

## 9. tables.js thiếu gì

`node test/voiddiver-ai.js` mục [10] in danh sách đầy đủ, tính lại mỗi lần chạy.
- Cách tính: lấy bao đóng id lõi cần, xuất phát từ Character, Monster, MonsterSpawn, Wave, Mimic, Trap trong tables.js, đi qua skill → hitbox/buff/quái gọi ra/pha, rồi so với JSON gốc.
- Cách thử tables.js với cả hai test: `VD_DATA=tables node test/voiddiver-combat.js` và `VD_DATA=tables node test/voiddiver-ai.js`.

Ảnh chụp 12:41 (tables.js đang được build lại liên tục):
- Thiếu 381/442 skill (gần hết skill quái, ví dụ 20000000, 20000401), 323/393 hitbox, 76/164 buff (2031–2091, 3106–3110, 3501, 3600–3602, 6201, 50000/50001, 60000–60016, 60100/60101, 70001, 3000002–3000007, 2002001, 8000000), 29 quái (200033, 210007, 210015–210017, 210030, 300006–300009, 300011, 300013, 300015–300021, 300024–300026, 300028, 301006, 301013, 301015, 301016, 710001, 710002).
- Đã có ExtraUnit và Shield.

Bản 12:37 đầy đủ hơn. Lúc đó hai test chỉ còn lỗi do thiếu dòng, không lỗi logic:
- 70 skill (phần lớn skill boss pha 2 và phân thân).
- 83 hitbox, ví dụ 100104002–4 (`destroyHitBoxId` của bùa Gayoung), 100112003 và 100130016 (`destroyHitBoxId`).
- 38 buff: `OnCombatBuffIds` / `OnCuriousBuffIds` 600xx, `LightBuffId` 3000002/3000003, 3000004/5/7.
- 19 quái pha sau.

Nguồn khả nghi: build_data.py chưa đi qua `destroyHitBoxId`, các cột buff của Monster, và các dòng pha cùng `BasePhaseMonsterId`.

**Bẫy khi rút gọn dữ liệu**: build_data.py bỏ mọi field bằng `0 / false / "" / [] / "None"`. Lõi đã sửa 3 chỗ vì chuyện này:
1. `SoulSkillTrigger.CompareValue` = 0 bị bỏ nên Mio không bao giờ về dạng thường. Nay đọc qua `num()`.
2. `DeactivateBuffCondition.StackCount`: tương tự.
3. `hitPointType "None"` bị bỏ nên hitbox phát nhầm hit VFX.

Test combat cũng thôi so cột `text` (ghi chú tiếng Hàn bị bỏ).

## 10. [CHƯA RÕ] — mặc định đang dùng

1. Thang "?" / "!" (§2): suy từ tên `MonsterDirectAggro*Multiplier`. `MonsterAlertTrackTargetTimeMultiplier 0.5` và `MonsterAlertLostTargetRecentTime 3` chưa dùng. Có thể là "lần sau thấy lại trong 3 s thì chỉ cần 0.55 s".
2. `MonsterCombatExitDelay` 10 s chưa dùng. Rời combat theo 2 s không thấy hoặc 3 s quá 9 m.
3. GCD tính từ lúc skill kết thúc, không phải lúc bắt đầu.
4. Lúc nào roll né (`Avoid*`): mặc định khi mục tiêu bắt đầu một skill trong tầm.
5. Roll khựng / chạy trốn khi nào: mặc định mỗi lần trúng đòn không phải DoT.
6. Nhịp stack đèn: 1 stack/giây. `LightFuelInterval 5` là nhịp tốn pin, việc của dive.js.
7. Lên pha khi máu về 0. Chưa rõ có mốc % máu, hay `DeadDuration` 2 s (7 boss) là thời gian anim chết trước khi lên pha.
8. `SummonMonsterLimit`, `BossDetectionRange`, `WaitTimeOnTargetAdded` (1.5 s), `PatrolWanderWaitTime`, `WanderSpecificMaxTime`: chưa dùng.
9. Kiểm "thấy qua tường" dùng tia từ tâm tới tâm, chưa trừ bán kính.
