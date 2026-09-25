# SKILLVM — bộ thông dịch skill gốc của Void Diver (2026-09-25)

Tài liệu này ghi lại ngữ nghĩa của dữ liệu skill gốc (`Skill.csv`, `HitBox.csv`, `Buff.csv`, `Const.csv`…) do đọc bảng mà suy ra.
Bộ thông dịch là `js/skill.js`, `js/hitbox.js`, `js/buff.js`, `js/stats.js`. Bài kiểm là `test/voiddiver-combat.js`.

Nhãn:
- **[ĐO]**: dữ liệu chứng minh. Có kèm bằng chứng (id, số).
- **[SUY LUẬN]**: đoán từ tên cột, từ cách dữ liệu được dùng, hoặc từ cảm giác chơi. Có ghi lý do.
- **[CHƯA RÕ]**: không đủ dữ liệu. Mục §8 ghi giá trị mặc định đang dùng.

Nguồn: `~/Downloads/vd-ref/json/*.json` (bảng đã giải mã). Công cụ đọc nhanh: `vd-ref/tools/skill_summarize.py`, `hitbox_dump.py`, `buff_dump.py`, `event_types.py`.
Trong phiên này còn có một bản in cây gọn hơn (in mọi node, điều kiện, cửa sổ huỷ, hitbox con). Cách in: xem §9.

---

## 1. Tổng quan

Mỗi dòng `Skill` có `RootActionNode = { skillAction, childNodes[] }`. `skillAction` là một **node hành động**:

| Nhóm cột | Ý nghĩa |
|---|---|
| `SkillTrigger` | node này chạy khi có sự kiện gì (phím, gây sát thương, đỡ đòn…). Không có thì node chạy theo thứ tự. |
| `BuffConditionList`, `TalentConditionList` | điều kiện để node được chọn |
| `actionDuration` | node kéo dài bao lâu (giây) |
| `SkillAnimationDatas[]` | clip Spine, clip khi đi, offset, `animationSpeeds` |
| `moveType`, `moveStartTime/EndTime`, `moveSpeed`, `moveSpeedType`, `MoveSpeedCurveData` | lướt/đi trong skill |
| `cancelableTimes[]` | cửa sổ huỷ sang skill khác, đệm phím |
| `actionEvents[]` | sự kiện theo mốc `startTime` (hitbox, vfx, buff…) |
| `IsGivingCoolDown`, `IsUsingCost`, `IsUsingStack` | node nào tính hồi chiêu / trừ tài nguyên / trừ stack |
| `UpdateAimOnStart/OnFrame`, `AutoAimToTarget`, `maxAimAnglePerSecond` | ngắm |

Quy mô: 640 skill, 483 hitbox, 685 buff. Phạm vi bản web (4 nhân vật + mọi quái) chạm 454 skill, 310 hitbox, 131 buff.

---

## 2. Cây skill

### 2.1 Chọn node con — ba luật

**Luật A. Con không có trigger thì chạy nối tiếp, sau khi node cha hết `actionDuration`.** Lấy **con đầu tiên** qua được điều kiện, theo thứ tự trong mảng. Không con nào qua thì skill kết thúc. [ĐO]
- Noah 10012300 "방패 막기": root `방패 시전` dài 0.185 s có 3 con. `r/0 방패 루프` không trigger, `r/1` có `ParrySkillTrigger`, `r/2` có `CurrentInputUp`. Node lặp `r/0` dài 5 s lại có 2 con: `r/0/0` (`CurrentInputUp`) và `r/0/1` (không trigger). Hai con cùng tên "막기 종료" và y hệt nhau. Chỉ đọc được một cách: nhả phím thì dừng ngay, giữ đủ 5 s thì dừng theo thứ tự.
- Clip nối nhau khớp từng khung. Gayoung 10010600: node `r/0` chạy clip `skill_ult_1_end` từ 0 trong 0.32 s. Node con `r/0/0` chạy cùng clip từ `animStartOffsetTime = 0.652`. Theo §2.5, clip của node cha sau 0.32 s ở đúng 0.652. Gayoung 10010700: `힘 모으기` (0.5 s, tốc độ 1) nối sang `궁극기 막타` với offset 0.5. Parry 10010500: `패링 성공 시` (parrying, offset 0.15) nối sang `추가타` (attack_3 offset 0.5).

**Luật B. Root dài 0 là bộ chọn nhánh.** Root chỉ giữ trigger phím. Nó hết ngay rồi luật A chọn một nhánh theo buff hoặc talent. [ĐO]
- **Gayoung 10010000, combo 3 đòn.** Root `검사 평타 베이스` có `AttackHold`, dài 0. Ba con:
  - `r/0 검사 평타`: `1012 < 1 && 1013 < 1`. Thêm 1012.
  - `r/1 2타`: `1012 == 1 && 1013 < 1`. Gỡ 1012, thêm 1013.
  - `r/2 3타`: `1013 == 1`. Gỡ 1013.

  Buff 1012/1013 (`검사1타/2타Start`) sống **0.85 s**. Vậy combo **không** nối bằng cây cha-con. Mỗi lần bấm là một lần chạy lại skill. Đòn nào ra là do buff đánh dấu. Buff hết hạn thì combo về đòn 1.
- **Noah 10012000.** Root `듀라한 평타 포장` dài 0. `r/0` cần `1200 == 1`: có buff Bất tử thì bắn không tốn stack, chỉ `IsGivingCoolDown`. `r/1` cần `1200 < 1`: bắn thường, `IsUsingStack`.
- Gayoung 10010100 và Mio 10011100 (lướt) chọn nhánh theo talent: `NotOwned:1031` hoặc `Owned:1031` (bản tăng quãng lướt).

**Luật C. Con có trigger là "tai nghe", chỉ bật khi node cha đang chạy.** Trigger bắn và điều kiện đúng thì node cha dừng ngay, chuyển sang con. [ĐO]
- Gayoung 10010300 "사슬 돌진":
  1. Root chỉ báo `LineTrajectory` dài 5 s. Con `CurrentInputUp`: nhả phím thì ném xích.
  2. Node `사슬` dài 0.45 s. Con `DamageProvideSkillTrigger{ConditionSkillIds:[10010300]}`: xích trúng thì lao tới.
  3. Node `돌진` dài 5 s. Con `MoveFinishSkillTrigger`: tới nơi thì kết thúc.
  4. Trượt thì `사슬` hết 0.45 s. Không có con nối tiếp nên skill kết thúc.
- Gayoung 10010500: root dài 0.5 s, thêm buff 3000009 (`ParryEffect`, 0.23 s). Con `ParrySkillTrigger` có điều kiện `3000009 >= 1`.
- Kkamong 20000000: root 1.21 s. Con `공격 시 돌진 중지` ("trúng thì ngừng lao") có `DamageProvideSkillTrigger{ConditionSkillIds:[]}`, dài 0, không sự kiện. Nó chỉ để cắt ngang cú lao khi đã trúng.
- Lướt + chém (Gayoung, Noah, Raven, Mio): node lướt có con `AttackDown` / `AttackHold`.

Chỉ con của **node đang chạy** mới nghe. Con của node tổ tiên thì không. [SUY LUẬN, khớp mọi cây đã đọc] Ví dụ: tai nghe `r/1` (Parry) của khiên Noah chỉ sống trong 0.185 s lúc giơ khiên. Nó khớp với buff 3000015 (0.15 s).

**Đổi skill theo trạng thái** thì không dùng cây. Có hai đường:
- **Raven 10013500 → 10013501**: buff 1306 có `ChangeSkillEffect{OriginalSkillId:10013500, ReplacementSkillId:10013501}`. Còn 1306 thì ô phím đó ra 10013501, bấm vào gỡ 1306. [ĐO]
- **Mio thức tỉnh** là chuỗi passive có trigger. [ĐO]
  1. 10011700 `NoticeDieSkillTrigger` (quái chết trong 9.5 m) và hitbox `CollisionSoulRecoveryOnHitMonsterEvent` cộng hồn.
  2. 10011701 `SoulSkillTrigger ≥ 1000` (Const `SoulMax` 1000) thêm buff 1106.
  3. 10011702 `AddBuffSkillTrigger{1106,1}` chạy `ApplyPolymorphSkillsActionEvent` và `ChangeSkin(IsSuper)`. Bộ skill đổi sang `Polymorph*SkillId`.
  4. 1106 có `DotSoulDamage` 40/giây, nên sau 25 s hồn về 0.
  5. 10011703 `SoulSkillTrigger ≤ 0` gỡ 1106. 10011704 `BuffRemovedSkillTrigger{1106}` chạy Revert.

### 2.2 ExecuteType / executeTime của node

Ở node chỉ gặp `Immediate` (848) và `None` (14). `checkTime` luôn false (0/862 node).
- `None@0.4` / `None@0.35` gặp ở combo 2/3 của Gayoung, nhưng hai node này là nhánh của bộ chọn dài 0. `Immediate@0.4` gặp ở `궁극기 막타` 10010700, là node nối tiếp. Cả hai chỗ, `executeTime` đều không thể có nghĩa (nếu có thì đòn 2 trễ 0.4 s).
- **Luật dùng:** `executeTime` của node bị bỏ qua. [SUY LUẬN] Riêng các node "lướt + chém" có `None@0.18` thì xem [CHƯA RÕ] #1.

### 2.3 Cửa sổ huỷ và đệm phím (`cancelableTimes`)

Mỗi cửa sổ có dạng `{startTime, endTime, ExecuteType, ExecuteTime, IsCancelableByAnySkill, IsCancelableByMove, cancelSkillIds[]}`, tính theo giờ của node. [ĐO về cấu trúc; SUY LUẬN về cách xử lý, khớp số]
- Có phím cho skill S lúc node ở giờ t. Cửa sổ khớp khi `startTime ≤ t ≤ endTime` và S nằm trong `cancelSkillIds` (hoặc `IsCancelableByAnySkill`).
- `Immediate`: huỷ node, chạy S ngay.
- `SpecifiedTime`: **đệm**. S chạy lúc `max(t, ExecuteTime)`.
- Nhiều cửa sổ cùng khớp thì lấy thời điểm sớm nhất. Gayoung đòn 1 có `10010000@0.35` và `ANY@0.38` cùng phủ 0.25–0.5, nên đòn 2 ra lúc **0.35**.
- `IsCancelableByMove`: có phím di chuyển trong cửa sổ thì huỷ skill, về đi bộ.
- Bằng chứng số: đòn 1 Gayoung có `animationSpeeds` 0.13:2.6, 0.2:0.8, 0.35:0.705. Clip tới mốc 0.35 lúc **0.3503 s** thật (§2.5), trùng `ExecuteTime` 0.35 của cửa sổ combo.
- Không cửa sổ nào khớp thì phím bị bỏ. Phím nhấn (không phải giữ) được nhớ `ComboThresholdTime` = **0.15 s** (Const) rồi thử lại mỗi khung. [SUY LUẬN, dựa tên hằng]
- `30010030` nằm trong mọi danh sách huỷ "khẩn" (cùng lướt, đỡ đòn). Đó là skill ngoài phạm vi (không nhân vật hay quái nào dùng), có lẽ là dùng đồ.

Nhịp combo Gayoung khi giữ chuột:
- 0: đòn 1.
- +0.35: đòn 2 (cửa sổ `10010000@0.35` của đòn 1).
- +0.75: đòn 3 (`10010000@0.40` của đòn 2).
- +1.45: đòn 1 lại (`10010000@0.70` của đòn 3). Lúc này 1013 đã bị đòn 3 gỡ, 1012 đã bị đòn 2 gỡ.

### 2.4 Trigger (`SkillTrigger.$type`)

| $type | Tham số | Bắn khi |
|---|---|---|
| SkillInputTrigger | `SkillInputType` | `AttackHold` = đang giữ chuột trái. `AttackDown` = vừa nhấn. `CurrentInputDown` = vừa nhấn phím của skill. `CurrentInputUp` = phím của skill không còn giữ. [SUY LUẬN: dùng mức, không dùng cạnh, để nhấn-nhả nhanh vẫn ăn] |
| AddPassiveSkillTrigger | `SkillId` | passive được gắn (vào trận). `SkillId` = chính nó [ĐO] |
| DamageProvideSkillTrigger | `ConditionSkillIds`, `ConditionIsOnlyCritical`, `ConditionIsOnlyFirstHit`, `ConditionReasonTypes` | chủ gây sát thương. `OnlyFirstHit` = chỉ mục tiêu đầu của mỗi hitbox. [ĐO về cột; SUY LUẬN: "first hit" tính theo hitbox] |
| DamageSkillTrigger | `ConditionIsOnlyCritical/Parryable/IgnoreBackAttack` | chủ bị trúng |
| BuffRemovedSkillTrigger | `BuffId`, `OnlyExpired` | buff mất stack hoặc bị gỡ. Bắn cả khi chỉ mất **một** stack. [ĐO: Raven 10013807 có `BuffRemoved{1303}` và điều kiện `1303 == 0`. Nếu chỉ bắn khi gỡ hẳn thì điều kiện đó thừa] |
| AddBuffSkillTrigger | `BuffId`, `BuffStack` | buff được thêm, stack sau khi thêm = `BuffStack` |
| StateChangeSkillTrigger | `States[]`, `Exclude` | chủ **đi vào** một trạng thái trong danh sách từ trạng thái ngoài danh sách. Trạng thái: Idle, Move, Skill, CrowdControlled, Interact, Cutscene. [SUY LUẬN] |
| SoulSkillTrigger | `CompareValue`, `CompareType` | hồn đổi và phép so đúng |
| NoticeDieSkillTrigger | Source/TargetUnitType, …, `TriggerRange` | đơn vị khác chết trong tầm |
| ParrySkillTrigger, MoveFinishSkillTrigger (`TriggerOnlyWhenBlocked`), DieSkillTrigger, ReviveSkillTrigger (`OnlySelfRevive`), ForceSkillTargetUpdateSkillTrigger, MonsterPhaseUpSkillTrigger, CrowdControl(Provide)SkillTrigger (`ConditionCcTypes`), UseSkillByTagSkillTrigger, ConsumeItemSkillTrigger | | theo tên |

**Passive** (`SkillType Passive`) và skill Active có trigger root không phải phím được đăng ký làm skill trigger của đơn vị. Chúng chạy thành **run nền**, không cắt skill đang chạy. Thứ tự xử lý theo `PassiveSkillIds`.
- Gayoung 10010001 thêm 1011, rồi 10010002 kiểm `1011 ≥ 4` và đánh thêm 200% Atk. Hai passive nghe cùng một trigger, nên thứ tự này quyết định nhát thứ 4 có ăn hay không. [ĐO: nhát trúng đầu tiên thứ 4 gây thêm 200%]
- Trigger được **xếp hàng** và xử lý ở điểm an toàn (sau input, sau cập nhật run, sau hitbox), để không đổi node giữa vòng sự kiện. Trễ tối đa 1 khung.

### 2.5 Hoạt ảnh

- `animationSpeeds[{endTime, speed}]`: **`endTime` là thời gian trong clip, không phải thời gian node.** [ĐO]
  - Gayoung đòn 1: clip tới mốc 0.13 sau 0.13/2.6 = **0.05 s**. `HitBoxEvent` của đòn 1 đặt đúng ở 0.05.
  - Gayoung 10010600 (§2.1): hai node nối nhau khớp tới 3 chữ số.
  - Sau `endTime` cuối, tốc độ là 1. (Dữ liệu hay đặt 99 làm mốc cuối.)
- Nhiều mục trong `SkillAnimationDatas`: mục sau bắt đầu khi mục trước hết `duration` (−1 = tới hết node). Ví dụ Noah khiên: clip `skill_1_loop` 0.3 s ở tốc độ 15, rồi bản lặp.
- `moveAnimationName`: clip dùng khi đang đi trong skill, ví dụ `attack_1_walk`. Trình bày tự đổi clip theo sự kiện `animMove`.
- Clip đặt bằng `trackTime` do lõi skill tính, `timeScale` của track = 0 (UnitVisual.pose). Bẫy đã sập: đặt `clipTime − dt` rồi để Spine cộng dt thì khung đầu bị kẹp 0 → clip đứng một khung ở đầu mỗi đòn.
- Trộn giữa clip: `mixes` + `defaultMix` của SkeletonDataAsset gốc (`tools/rip.py spine-meta` ghi vào `art/spine/*/meta.json`). [ĐO] Sword/Raven 12 cặp idle/walk/run 0,2 s; không đặt thì đổi clip giật.
- Người chơi đang giữ phím di chuyển coi như đang đi ngay cả khung skill vừa hết (stage.render), tránh chớp một khung idle giữa lướt → đi.
- Hướng nhìn 8 ô màn hình (CharacterView._animationMode = 2, `LookAtDirectionAsEightWay`): ô chéo quyết cả bộ xương NW/SW lẫn lật; ô lên/xuống chỉ quyết bộ xương, ô trái/phải chỉ quyết lật; còn lại giữ nguyên. [SUY LUẬN từ tên hàm] Đo: quét ngắm 80–100° trong 60 khung, cách cũ (theo dấu x) lật 7 lần, cách mới 0.
- **Không có hitstop.** [ĐO âm] metadata IL2CPP không có tên nào chứa HitStop/HitPause; stage bỏ qua sự kiện `hitstop` của lõi (lõi vẫn phát để tương thích).
- `AtkSpeed` nhân tốc độ thời gian của skill có tag `BasicAttack`. [SUY LUẬN] Số gốc AtkSpeed = 1 nên không ảnh hưởng số kiểm.

### 2.6 Di chuyển trong skill

`moveType`:
- **MoveByInputNoAim**: đi bộ tự do theo phím ở `MoveSpeed` hiện tại (buff chậm như 1024 −15% vẫn áp), hướng ngắm bị khoá. Trong cửa sổ `[moveStartTime, moveEndTime]`, nếu `moveSpeed > 0` thì thay đi bộ bằng một cú lướt theo phím, tốc độ `moveSpeed × curve`. Không bấm hướng thì không lướt. [SUY LUẬN]
- **MoveByInput**: như trên, nhưng hướng ngắm vẫn theo chuột mỗi khung. Dùng ở các node chỉ báo và node "이동 가능 구간" (đoạn được đi) của Raven. [SUY LUẬN: tên cột và nơi dùng]
  - Bẫy đã sập: ban đầu đã cho MoveByInput xoay hướng theo phím di chuyển. Kết quả đòn "텔포 공격" của Mio bắn theo hướng chạy thay vì hướng chuột.
- **MoveToMoveDir**: lướt theo phím di chuyển lúc vào node. Không bấm hướng thì theo hướng ngắm. [SUY LUẬN]
- **MoveToAimDir** / **MoveToOppositeAimDir**: lướt theo hướng ngắm / ngược hướng ngắm.
- **MoveToTarget**: lướt về mục tiêu trigger (hoặc `u.target`). Tới nơi hoặc hết cửa sổ thì bắn `MoveFinishSkillTrigger`.
  - `moveOffset = −1` ở cả 4 node MoveToTarget có trong dữ liệu. Xem là giá trị trống: dừng khi chạm (tổng bán kính). [SUY LUẬN] Nếu hiểu là "dừng cách 1 m" thì thân lao Gayoung (Sphere 1.2) chạm không tới.
- **MoveIfAligned** / **MoveIfOpposite**: chỉ lướt khi phím hướng cùng chiều / ngược chiều ngắm.

`moveSpeedType`:
- `None`: tốc độ = `moveSpeed × curve(τ)`, với τ = vị trí chuẩn hoá 0..1 trong cửa sổ.
- `Fixed`: tốc độ không đổi.
- `Distance`: giữ tổng quãng `moveSpeed × (end − start)`, đường cong chỉ phân bổ tốc độ. Với quái lao theo hướng ngắm thì không vượt quá mép mục tiêu. [SUY LUẬN] Chỉ quái dùng kiểu này.

`MoveSpeedCurveData.Keys` là AnimationCurve của Unity, nội suy hermite bằng `inTangent`/`outTangent`. `weightedMode` luôn None. [ĐO] Tích phân bằng Simpson 16 đoạn. Quãng lướt không phụ thuộc tốc độ khung.

`ignoreMoveCollision`: bỏ va chạm với đơn vị (truyền `{ignoreUnits:true}` cho `world.moveUnit`). Chỉ số `DashDistancePercent` nhân tốc độ của skill tag `Dash`.

### 2.7 Ngắm

- `UpdateAimOnStart`: vào node thì lấy hướng chuột (nhân vật) hoặc hướng tới `target` (quái).
- `UpdateAimOnFrame`: xoay theo mỗi khung, tối đa `maxAimAnglePerSecond` độ/giây (0 = tức thì). Ví dụ gatling Raven 40°/s.
- `AutoAimToTarget`: quay về `u.target`.

### 2.8 Hồi chiêu, tài nguyên, stack, năng lượng

- `IsGivingCoolDown` / `IsUsingCost` / `IsUsingStack` đặt ở **node**, không ở skill. Chúng có hiệu lực khi vào node đó. [ĐO]
  - Gayoung 10010600 chỉ trừ StressCost và tính CD ở node cuối `귀신베기 공격`, nên huỷ lúc đang vung thì không mất gì.
  - Lướt Gayoung trừ 25 stamina và đặt CD 0.35 ở `r/0`.
- Trước khi chạy, skill được kiểm: đủ Stamina / Hp / Charge (nếu cây có node `IsUsingCost`), hết hồi chiêu, không bị CC, không Silence (trừ khi `IgnoreSilence`), `DeactivateBuffCondition` (Raven: `1303 < 1` thì khoá đòn thường) và điều kiện của root.
- Hồi chiêu = `CoolTime × (1 − min(CooldownReductionPercent, MaxCooldownReductionPercent 40)/100)`, sàn `MinCoolTime 0.2` (chỉ khi CoolTime > 0). Quái cộng thêm `Difficulty.CooldownReductionPercent`. [SUY LUẬN cho phần quái]
- Stack: `StackCount > 1` thì có stack. Hồi 1 stack mỗi `StackChargeInterval` giây khi chưa đầy. Noah bắn thường: 2 stack, 1.25 s.
- Tối thượng: `charge += ChargePerSec × dt`, dừng ở `ChargeCost`. `BlockSkillChargeEffect` chặn việc này (Noah 1200 chặn 10012700). [ĐO về cột; SUY LUẬN về nguồn nạp duy nhất]
- `StressCost` **cộng** stress (xấu), `HpCost` trừ máu (Mio 10011400 trừ 25), `StaminaCost` trừ stamina. Stamina hồi `StaminaRegen`/giây sau `StaminaRegenDelay` 0.5 s.

### 2.9 Bảng sự kiện `actionEvents[].$type`

Mỗi sự kiện chạy khi giờ node ≥ `startTime`. Cùng mốc thì theo thứ tự trong mảng: Raven bắn ở 0.25 xong mới gỡ 1303 ở 0.25. Điều kiện `BuffConditionList`/`TalentConditionList` được kiểm lúc chạy. `ActionTarget`: `Self`, `TriggerTarget` (đơn vị gây ra trigger, ví dụ mục tiêu bị xích).

| $type (số node) | Xử lý |
|---|---|
| HitBoxEvent (736) | sinh hitbox `Id` tại `SpawnPositionType`: Owner/None = chân chủ, Aim = điểm ngắm, SkillTriggerTarget, AllPlayers (mỗi người chơi trong `TargetPlayerMaxDistance`) |
| HitBoxIteratorEvent (141) | chuỗi hitbox theo thời gian (§3.4) |
| VfxEvent (891), SfxEvent (558), IndicatorVfxEvent (87) | phát sự kiện trình bày. `DestroyOnActionEnd` / `OnSkillEnd` → `vfxEnd`. Indicator có `HitBoxId` thì sinh hitbox đó sau `HitBoxSpawnDelay` |
| BuffActionEvent (480) | thêm / gỡ (`IsRemove`) `stackAmount` stack. `RemoveOnActionEnd` = gỡ khi node kết thúc |
| MonologueActionEvent (128) | `ActivationPercent`% chọn câu theo `Weight` |
| DamageActionEvent (18), CrowdControlActionEvent (15) | sát thương / CC thẳng lên `ActionTarget`, không qua hitbox |
| TeleportActionEvent (12) | dịch chuyển tức thì `MinDistance..MaxDistance` theo phím di chuyển (hoặc hướng ngắm) |
| CameraShakeActionEvent, SummonActionEvent, ShieldActionEvent, RecoveryActionEvent, SoulRecoveryActionEvent, KillActionEvent, SpreadAggroActionEvent, HitBoxCollectActionEvent, ForceUpdateTargetActionEvent, ChangeSkinActionEvent, Apply/RevertPolymorphSkillsActionEvent, StressRecovery/StressDamage/BrightnessRecovery/RemoveStatusEffectActionEvent | có xử lý, xem `EVENTS` trong skill.js |
| ConsumeItemActionEvent, ShowConsumeGaugeActionEvent, AcquireParadoxActionEvent, SpecialFieldActionEvent | **chỉ phát sự kiện**. Thuộc hệ đồ dùng, nghịch lý, vùng đặc biệt (dive.js) |

`RemoveOnActionEnd` gỡ theo **node**, không theo skill. [SUY LUẬN, ĐO một phần] Khiên Noah thêm lại 1202 ở cả node giơ khiên lẫn node lặp. Nếu gỡ theo skill thì việc thêm lại là thừa.

---

## 3. HitBox (`HitBox.csv → HitBoxInfo`)

### 3.1 Hình va chạm (mặt XZ, bỏ chiều cao)

`collisionScale "x:y:z"`, đơn vị mét. Trục cục bộ: z = hướng hitbox, x = sang phải.
- **CylinderN** (N = 30, 60, 90, 120, 150, 180, 210, 240): hình quạt N° của một elip bán trục (x, z), tâm ở gốc hitbox.
- **Sphere**: elip (x, z).
- **Box**: hình chữ nhật **kích thước đầy đủ** x × z, tâm ở gốc.

Bằng chứng [ĐO]:
- Chỉ báo `Circle` luôn lớn hơn Sphere cùng skill khoảng 0.1–0.15. Ví dụ 2.35 và 2.2 (20060002), 1.6 và 1.4 (21000054), 4.15 và 4 (21002011). Vậy bán kính = scale, không phải 0.5 × scale.
- Chỉ báo `Square 2×3.5` ứng với Box `2:1:2.5` lệch z 1.5 (21000580). Box phủ z từ 0.25 tới 2.75.
- Xích Gayoung: Box `1:1:0.1` bay 15.5 m/s trong 0.245 s = 3.8 m, trùng `LineLength 3.8` của chỉ báo.

Bán kính mục tiêu được cộng vào hai trục, xấp xỉ va chạm capsule. [SUY LUẬN] Bán kính đơn vị không có trong bảng. ASSETS.md §1.3 đo được capsule nhân vật 0.18, zombie 0.2, boss 0.95. Test dùng 0.3.

Quạt bị scale không đều (Noah: 60° với x ≠ z) thì góc được đo trong không gian đã chuẩn hoá, tức góc của lưới mesh. [SUY LUẬN]

Noah 10012000 bắn 3 nón Cylinder60 cùng lúc: (0.9, 0.6) 60% + đẩy lùi 0.5 m, (1.2, 1.35) 35%, (1.8, 2.4) 135%. Ba nón chồng nhau, nên sát thương giảm theo cự ly:
- ≤ 0.6 m: 230% (và bị đẩy lùi).
- ≤ 1.35 m: 170%.
- ≤ 2.4 m: 135%.

### 3.2 Sinh và sống

- Vị trí = gốc (theo `SpawnPositionType`) + `startOffset` (x phải, y cao, z trước) xoay theo hướng ngắm + `angleOffset`.
- `SpawnDelayAfterFireVfx`: phát `FireVfx` trước, sau đó mới sinh.
- `ClampSpawnPositionToWall`: kẹp ở tường nếu có `world.raycastWall`.
- Sống `duration` giây. Chỉ va chạm trong `[collisionDelay, collisionEndTime]`. `collisionEndTime = 0` nghĩa là tới hết đời. [SUY LUẬN, khớp số]
  - Đòn 1 Gayoung: sống 1.0 s nhưng chỉ chém trong 0.19 s đầu. Phần còn lại là để VFX sống.
  - Đòn 2: sống 0.22 s, `collisionEndTime` 0.
- Mỗi mục tiêu chỉ bị trúng **một lần** mỗi hitbox. `multiHitInterval > 0` thì cứ ngần ấy giây trúng lại.
- `IsCancleOnSkillChange`: huỷ hitbox khi chủ đổi skill hoặc bị CC. `IsCancelOnOwnerDie`: huỷ khi chủ chết.

### 3.3 Chuyển động (`MoveType`)

| MoveType (số dòng) | Luật |
|---|---|
| FollowSelf (190) | dính theo chân chủ, giữ độ lệch. Hướng giữ nguyên như lúc sinh [SUY LUẬN] |
| TraceOwner (2) | có `moveSpeed`: bay về chủ ở `moveSpeed × curve(t/duration)`, hướng quay về chủ, tới nơi thì huỷ (sinh `destroyHitBoxId`). Không có `moveSpeed`: như FollowSelf. [SUY LUẬN] Chỉ 2 dòng, đều là lượt về của bumerang Mio (100112003/…13, curve 0→1). Bẫy đã sập: coi như FollowSelf thì bumerang bay mãi không về |
| Linear (240) | bay thẳng, tốc độ `moveSpeed × curve(t/duration)`, kẹp `MaxMoveDistance`. **Đường cong tính theo phần đời đã qua (0..1)** [SUY LUẬN, khớp số §6.6] |
| LinearToAimBySpeed (1) | bay tới điểm ngắm (kẹp Min/MaxMoveDistance) bằng `moveSpeed`, tới nơi thì huỷ. Bùa Gayoung 10010400 |
| LinearToAim (1), ParabolaToAim (45), Parabola (1) | tới điểm ngắm trong đúng `duration`. Parabola có cao `4h·s(1−s)` |
| Tracing (3) | như Linear, quay dần về kẻ địch gần nhất trong `tracingDetectingRange`. `tracingAngle` = độ mỗi khung ở 60 Hz [CHƯA RÕ #9] |

- Tường: bay xuyên tường thì hitbox `WallOnly`/`Once`/`Pierce` bị huỷ ở tường. `Never` bay tiếp.
- `ignoreObstaclesForCollision = false`: không trúng mục tiêu sau tường (tia từ tâm hitbox).

### 3.4 Chuỗi hitbox (HitBoxIteratorEvent)

`HitBoxIterator{IteratorType, TotalCount, HitBoxDelay, TotalAngle, StartAngleOffsetMin/Max, StartPositionOffsetMin/Max, UpdateBasePositionEveryFrame, UpdateAimEveryFrame, CustomData[], IndicatorInfo, MonsterInfos, HitBoxId}`
- Sinh `TotalCount` hitbox, cái thứ i ở `i × HitBoxDelay`.
  - Gatling Raven: 35 × 0.1 = 3.5 s trong node lặp 4 s. [ĐO khớp]
- `Arc`:
  - `TotalAngle = 0`: cùng hướng, cộng lệch ngẫu nhiên `StartAngleOffsetMin..Max` (gatling ±10°).
  - `TotalAngle ≥ 360`: chia đều.
  - Còn lại: trải đều từ −A/2 tới A/2.
- `Custom`: vị trí lệch `CustomPositionOffset`, góc `CustomAngle`, trễ thêm `CustomAdditionalDelay` (mưa sao băng Mio 10011600: 24 điểm).
- `StartPositionOffsetMin..Max`: đẩy ngẫu nhiên dọc hướng.
- `IndicatorInfo`: hiện chỉ báo tại điểm, hitbox sinh sau `HitBoxSpawnDelay`.
- `MonsterInfos` khác rỗng: gọi quái thay vì sinh hitbox.
- `CancelOnActionEnd`: dừng khi node kết thúc. `CancelOnOwnerDying`: dừng khi chủ chết.

### 3.5 Sự kiện va chạm (`collisionEvents[].$type`)

Mỗi sự kiện có `targetType` riêng. Một hitbox có thể vừa đánh địch vừa hồi đồng minh.
- `targetType`: Enemy, Ally (gồm chủ), AllyExceptOwner, Owner, All, AllExceptOwner, None.
- `IsOnce`: sự kiện đó chỉ áp cho mục tiêu đầu tiên của hitbox.
- `BuffConditionList`: `ConditionOwnerType` = SkillOwner / CollisionTarget / TriggerTarget. `BuffConditionCasterType SkillOwner` = chỉ đếm buff do chính mình gắn. `CheckNotContainsCasterType` = "không mang buff của mình".
  - Ví dụ xích Gayoung: mục tiêu mang 3000013 do mình gắn thì vfx lớn, không thì vfx nhỏ. [ĐO]
- `HitableConditions`: MonsterTypeCondition, HpPercentCondition.

| $type (số dòng / trong phạm vi) | Luật |
|---|---|
| CollisionDamageEvent (308/221) | `DamageInfo{ElementalType, Power, CoefficientStat, StatFactor, ConditionalStats[], IgnoreShield}`, `CanBackAttack` → §5 |
| CollisionBuffEvent (172/119) | `Probability`% gắn `buffId` × `BuffStack`. Lọc `FactionCondition` (so với **MonsterCategories**, ví dụ Eldritch), `MonsterCondition` (MonsterType), `CcCondition`, `EffectTag` |
| CollisionCrowdControlEvent (102/80) | `CcInfo` → §3.6 |
| CollisionStressDamageEvent, CollisionStressRecoveryEvent | stress ± ngẫu nhiên trong Min..Max (chỉ nhân vật) |
| CollisionSoulRecoveryOnHitMonsterEvent | chủ +hồn nếu mục tiêu có MonsterType trong danh sách (Mio: Normal +5, Boss/MiniBoss +15) |
| CollisionHealEvent, CollisionShieldEvent, CollisionBrightnessDamageEvent, CollisionForceMonsterSetTargetEvent (khiêu khích), CollisionFxEvent | theo tên |
| CollisionTryMonsterCuriousStateEvent, CollisionCaptureEvent | chỉ phát sự kiện cho ai.js / dive.js |

**Đỡ đòn** [ĐO về dữ liệu, SUY LUẬN về thứ tự]:
- Điều kiện: hitbox có `CanParry = true`, mục tiêu có `ParryEffect` (buff 3000009 của Gayoung 0.23 s, 3000015 của Noah 0.15 s), hai bên là địch.
- Kết quả: không sát thương, không CC, không buff. Phát `parry` và hitstop. Bắn `ParrySkillTrigger` cho mục tiêu. Đạn (hitbox có `collisionDestroy ≠ Never`) bị huỷ.
- Người đánh không bị phạt gì. [CHƯA RÕ #4]

`InvincibilityEffect.BlockEnemyHit`: đòn đi xuyên như không có mục tiêu. `BlockDamage` mà không có `BlockEnemyHit` (Noah 1206): trúng nhưng 0 sát thương, CC và buff vẫn qua bộ lọc miễn nhiễm.

`collisionDestroy`: `Once` = huỷ khi trúng mục tiêu đầu. `Pierce` = huỷ sau `pierceCount` mục tiêu (Raven: 3). `WallOnly` = chỉ huỷ ở tường. `Never` = không huỷ. Khi huỷ:
- sinh `destroyHitBoxId[]` tại chỗ (bùa Gayoung nổ thành 3 hitbox),
- phát `ExtraUnitIdOnDestroy` (búp bê Cookie của Mio là ExtraUnit 10002/10003),
- chạy `ActionEventsOnDestroy` (SpecialFieldActionEvent).

Phản hồi trúng đòn (phát cho trình bày):
- `hitVfx` tại điểm theo `hitPointType`: NearByOwner = mép mục tiêu phía chủ, NearByCollision = mép phía hitbox, None = không có.
- `hitSfx`, hoặc `criticalHitSfx` khi chí mạng. `Monster.HitSfx` theo `HitSfxPercent`.
- `hitstop`, `flash`.
- `OwnerHitShake*`: rung cho người đánh. Const `HitShake*` (0.25 / 0.1 / 0.15 s): rung khi nhân vật bị trúng.
- Hitstop **không có trong bảng**. Số trình bày ở `VD.Combat.HITSTOP`: thường 0.045, chí mạng 0.075, hạ gục 0.09, đỡ đòn 0.12 s.

### 3.6 Khống chế (CC) và thanh áp chế

`CcInfo{ccType, ccDuration, ccMoveDistance, ccMoveDuration, UseForcedMoveDirection, ForcedMoveDirectionType, SuppressionValue, MonsterCondition, FactionCondition}`
- **Stun / Freeze**: khoá hành động trong `ccDuration`, cắt skill đang chạy.
- **Knockback**: đẩy `ccMoveDistance` trong `ccMoveDuration` (tuyến tính), bị khoá suốt `ccDuration`.
  - Hướng mặc định: từ tâm hitbox ra mục tiêu. `ForcedMoveDirectionType`: OwnerAim, HitBoxMove (gatling), MoveToHItBox, OwnerMove.
- **Pull**: kéo về phía nguồn tới khi chạm. [SUY LUẬN]
- Miễn nhiễm (`ImmunityEffect`) theo tên nhãn CC. Bù nhìn 820001–820007 miễn Knockback và Pull (buff 3600). [ĐO]
- **Thanh áp chế** [SUY LUẬN, tên cột + Const]:
  - Quái có `SuppressionGauge > 0` (boss) không nhận CC thẳng. `SuppressionValue` đổ vào thanh.
  - Sức chứa = `SuppressionGauge × SuppressionGaugeFactor<Độ khó>` (0.7 / 1 / 1.7 / 2.3).
  - Đầy thì **Groggy**: choáng `GroggyDuration` 6 s, nhận ×`GroggyDamageMultiplier` 1.5. Sau đó miễn `SuppressionImmunityDuration` 10 s, và thanh lớn thêm `SuppressionResistanceGrowthFactor` 0.35 mỗi lần.
  - Quái thường có gauge 0 và nhận CC bình thường.
- `StatusEffectSuppression.csv` (kháng Root/Silence/Confuse/Slow/Blind tăng dần): chưa làm. [CHƯA RÕ #7]

---

## 4. Buff (`Buff.csv`)

Cột: `MaxStackCount`, `Duration` (−1 = vô hạn), `EffectTag`, `BuffEffects[]`, `Triggers[]`, `ExpirePerStack`, `DurationOverride{MinDuration, MaxDuration, Stats[]}`, `ShowBuffIcon`.
- **Thêm**: cộng stack, kẹp `MaxStackCount`, đặt lại thời lượng. `ExpirePerStack`: mỗi stack có đồng hồ riêng. [SUY LUẬN]
- **Gỡ**: `IsRemove` với `stackAmount` N bớt N stack. Hết stack thì buff mất. Mỗi lần bớt đều bắn BuffRemoved (§2.4).
- **Miễn nhiễm**: buff có `EffectTag` (Bleed, Slow…) không vào được đơn vị đang miễn nhãn đó.
- **Triggers** = điều kiện hiệu lực. Buff vẫn nằm đó, nhưng chỉ có tác dụng khi **mọi** trigger đúng. [SUY LUẬN, khớp tên]
  - 102 "hp 40% 이하 버프": `HpPercent ≤ 40`.
  - 6101: `LightFuel ≤ 0` và không có đồng minh nào có đèn trong 2.5 m.
  - Loại trigger: `FloatValueCompareBuffTrigger` (HpPercent, LightFuel, Stress, Stack, CorruptionPercent), `NearbyUnitCountBuffTrigger` (có điều kiện con), `ActiveSkillTagBuffTrigger`.
- **Tick**: hiệu ứng Dot* chạy mỗi 1 s, tick đầu sau 1 s. [SUY LUẬN] Bleed 1017 8 s ra 8 tick.
  - Lượng mỗi tick = `TickAmount × (UseStatValue ? StatPercent% × chỉ số lúc gắn : 1) × stack`. Dùng chỉ số lúc gắn vì `RealtimeStatValue = false` ở mọi dòng.
- **DurationOverride.Stats** (buff nạp đạn 1302 của Raven: 1.5 s, kẹp 0.7–2.5, theo `AtkSpeedPercent`, BasePercent 120): `dur = Duration × 100 / (100 + Σ stat × BasePercent/100)`, rồi kẹp. [SUY LUẬN]
- **ImmunityEffectTags** có 3 dạng: `"All"`, chuỗi tên (`"Bleed, Burn, Silence, Poison, Stun, Knockback, Pull"`), hoặc **số cờ bit** (−100353, −98305). Số âm nghĩa là "tất cả trừ vài bit". Bit i ứng với dòng thứ i của StatusEffectTag.csv (None = bit 0). [CHƯA RÕ #6]
  - Theo cách này, −100353 = miễn tất cả trừ Poison, Madness, Freeze. Buff 1014 là "trạng thái bất lợi miễn nhiễm khi dùng tối thượng" của Gayoung.

### 4.1 Loại hiệu ứng có trong phạm vi (131 buff) và tham số

| EffectType | Tham số | Xử lý |
|---|---|---|
| Stat (62) | `statType`, `statValue` hoặc `UseStatValue` + `StatType` + `StatPercent` | cộng vào chỉ số × stack (§5.1) |
| Slow (9) | `SlowType MoveSlow`, `value` (âm) | cộng `MoveSpeedPercent` |
| DotHpDamage (17) | `TickAmount`, `StatType Atk`, `StatPercent` | sát thương mỗi tick (§5.3) |
| DotRangeHpDamage (8) | `TargetType`, `Range`, `TickAmount`, … | sát thương mỗi tick cho các đơn vị quanh chủ |
| DotShield (1) | `ShieldId`, `StatType HpMax`, `StatPercent 7.5` | thêm khiên mỗi tick (Noah 1200) |
| DotSoulDamage (1) | `TickAmount 40` | −hồn mỗi tick (Mio 1106) |
| DotStressDamage / DotStressRecovery | `TickAmount` | ±stress |
| Invincibility (9) | `BlockDamage`, `IgnoreBackAttack`, `IgnoreCriticalHit`, `BlockStressDamage`, `BlockEnemyHit` | §3.5 |
| Parry (2) | `IgnoreBackAttack`, `IgnoreCriticalHit` | §3.5 |
| Immunity (13) | `ImmunityEffectTags`, `IsFullImmunity`, `DispelOnApply` | chặn buff/CC theo nhãn. `DispelOnApply`: gỡ luôn cái đang có |
| FrontGuard (2) | `DamageReductionPercent`, `AngleDeg`, `Vfx`, `Sfx`, `VfxForwardPos` | nguồn nằm trong nón trước thì giảm sát thương (Noah 1202: 77.5%, 120°) |
| HpDamageTakenAmplifier (3) | `Percent` | × (1 + Σ/100) sát thương nhận (104 Gayoung −5, 102 −15, 103 −30) |
| StressDamageTakenAmplifier (4) | `Percent` | × stress nhận |
| ShieldOnDamageProvide (2) | `ShieldId`, `Percent` | khiên = % sát thương gây ra (Noah 1201 9%, 1207 5%) |
| ChangeSkill (1) | `OriginalSkillId`, `ReplacementSkillId` | đổi skill trong ô |
| BlockSkillCharge (1) | `SkillIds` | chặn nạp năng lượng tối thượng |
| Root / Silence / Blind / Confusion / Madness | — | Root: không đi, node `isDisabledWhenSnared` bị chặn. Silence: không dùng skill (trừ `IgnoreSilence`). Còn lại: cờ cho ai.js và trình bày |
| HpThreshold (1) | `ThresholdPercent` | máu không xuống dưới % này (bù nhìn 1%) |
| SpawnHitBoxOnEnd (1) | `HitBoxId`, `SpawnOnExpire`, `SpawnOnDie` | bom Noah 1203 |
| DamageConversion (1) | `ElementalType`, `Percent` | % sát thương nguyên tố đó thành hồi máu [SUY LUẬN] |
| AttackConditionalStats (1) | `ConditionalStats[]` | cộng chỉ số tạm khi đánh, nếu điều kiện nguồn/đích đúng (Gayoung 1020: +5% sát thương lên Eldritch/Phantasm) |
| AggroRangeAmplifier (1) | `Percent` | cờ cho ai.js |
| HighLight / Trail / MultiSkeleton | màu, số bóng, chu kỳ | chỉ trình bày (sự kiện `buffFx`) |

Ngoài phạm vi (buff của talent, đồ dùng, hồi sinh): ItemEffectAmplifier, ApplyBuffOnAttack, EquipmentRevive, ItemUseSpeedAmplifier, LootingSpeedAmplifier, SelfReviveChanceAmplifier, WeakPointStackAmplifier, BindingField, EscapeOnActive, TrainingRoom, ForcedSelfRevive, ExpGainAmplifier. Bộ thông dịch nhận diện các loại này là `stub` và không mô phỏng.

Một số loại được hitbox.js hoặc skill.js đọc khi tính: AttackedConditionalStats, BackAttackCriticalChanceAdd, BackAttackDamageAdd, DotDamageAmplifier, HpRecoveryAmplifier, SkillChargeAmplifier, SkillStaminaCostAmplifier, SkillStressCostAmplifier, StressRecoveryAmplifier, BlockStressRecovery, Invisible, MonsterSightAmplifier, StatusEffectDurationAmplifier (hai loại cuối chỉ nhận diện).

### 4.2 Khiên (`Shield.csv`)
- `MaxValueType PercentOfMaxHp`: trần = `MaxValue`% HpMax. Khiên 100001 của Noah: trần 20%, sống 5 s.
- `IsStackable`: cộng vào khiên cùng id.
- `IsDecrease`: giảm tuyến tính về 0 trong `Duration`. [SUY LUẬN]
- Khiên hút sát thương trước máu, trừ khi `DamageInfo.IgnoreShield`.
- `ShieldActionEvent{Value, CoefficientStat, StatFactor, TriggerValueFactor}` = Value × chỉ số × StatFactor% (+ TriggerValueFactor × lượng của trigger). Noah đỡ đúng lúc: 1 × 530 × 15% = **79.5**.

---

## 5. Sát thương

### 5.1 Chỉ số

- **Nhân vật**: `Character.Atk` luôn là 0. Atk thật = `Equipment[DefaultWeaponId].Stats["Atk"] × WeaponAtkMultiplier`. [ĐO] Vũ khí mặc định 1001/1101/1201/1301 đều Atk 100, hệ số 1, nên Atk = **100** cho cả 4 nhân vật.
  - Vũ khí hỏng thì dùng `BrokenStats` (Atk 30).
  - Các dòng khác trong `Stats` là cộng phẳng.
- **Quái**: `Monster.Atk/Def/Hp` × `Difficulty.MonsterAtkPercent/DefPercent/HpPercent`. Ví dụ Normal: 85%.
  - Test chạy với độ khó rỗng, tức ×1. Ví dụ Kkamong: Atk 185, Def 78.
- **Giá trị cuối** = `(gốc + cộng phẳng) × (1 + %/100)` cho các cặp: Atk, Def, MoveSpeed, HpMax, AtkSpeed, RunIncreaseSpeed, RunStaminaCost, StaminaMax, StaminaRegen, HpRegen. Các chỉ số % khác (CriticalChancePercent, PenetrationPercent…) chỉ cộng.
- **Mặc định** (Const): `DefaultCriticalChancePercent` 7, `DefaultCriticalDamagePercent` 35, `DefaultWeaknessDamagePercent` 10.

### 5.2 Công thức (theo thứ tự trong `VD.Combat.computeDamage`)

Tên cột lấy từ bảng. Cách kết hợp là [SUY LUẬN], trừ chỗ có ghi.
```
base   = Power + Stat[CoefficientStat] × StatFactor/100                 [ĐO: 100/105/115% ↔ đòn 1/2/3]
bonus  = ConditionalStats của DamageInfo + AttackConditionalStats (nguồn) + AttackedConditionalStats (đích)
x      = base × (1 + (AdditionalAttackDamagePercent + bonus)/100)
đánh sau lưng (CanBackAttack, không bị IgnoreBackAttack, nguồn trong nón sau lưng BackAttackAngle, cách ≤ BackAttackMaxRange 2 m):
         x × (1 + Default{Character 15 | Monster 25 | ExtraUnit 15} + BackAttackDamagePercent)/100
         tỉ lệ chí mạng + {Character 25 | Monster 0}
         (nón sau lưng: nhân vật = CharacterBackAttackAngle 150°, quái = Monster.BackAttackAngle)
chí mạng: roll < CriticalChancePercent (+bonus, +sau lưng). IgnoreCriticalHit → 0.
         x × (1 + CriticalDamagePercent/100)                            [ĐO: phản đòn Gayoung ép chí mạng bằng CriticalChancePercent +100]
nguyên tố: × (1 + <Elem>DamagePercent/100) × (1 − <Elem>ResistancePercent/100)
                                        (Kkamong: Water −25 = nhận thêm 25%, Wind +25)
—— preDef ——
phòng thủ: DefEff = max(0, Def × (1 − PenetrationPercent/100) − Penetration)
         x × DefenseFactor / (DefenseFactor + DefEff)                   (Const DefenseFactor = 100)
nhận:    × (1 + Σ HpDamageTakenAmplifier/100) × (1 − ReductionDamagePercent/100) × (Groggy ? 1.5 : 1)
FrontGuard: nguồn trong nón AngleDeg trước mặt → × (1 − DamageReductionPercent/100)
làm tròn: max(1, round(x))
khiên hút trước (trừ IgnoreShield) → máu. HpThreshold kẹp đáy.
```
- Sau đó bắn `DamageProvideSkillTrigger` (nguồn) và `DamageSkillTrigger` (đích). Nguồn nạp `ShieldOnDamageProvide`.
- Theo Const: nhân vật bị đánh sau lưng +`StressDamageOnBackAttack` 5 stress. Nhân vật chí mạng hồi `StressRecoveryOnCritical` 1 stress (50%, CD 2 s).
- Hệ điểm yếu (`WeakpointGauge*`, `WeakPoint*FullStackDamagePercent`) chưa làm. [CHƯA RÕ #8]

### 5.3 Sát thương theo thời gian (DoT)

Không chí mạng, không đánh sau lưng, **bỏ qua Def**. [SUY LUẬN, CHƯA RÕ #5]
- Có áp `HpDamageTakenAmplifier` và `DotDamageAmplifier` của nguồn.
- Bleed 1017: 8% Atk = **8** mỗi giây mỗi stack.

---

## 6. Timeline mẫu

Tất cả do test in ra và kiểm. t tính từ khung bấm phím. Mô phỏng 60 Hz, sai số ≤ 1 khung.

### 6.1 Gayoung đánh thường ×3 (giữ chuột), 3 bù nhìn 820001 (Def 62) trước mặt

| t (s) | Việc |
|---|---|
| 0 | chạy 10010000. Root dài 0 chọn `r/0` (1012 = 0, 1013 = 0). Thêm 1012 (0.85 s) và 1024 (−15% tốc chạy, gỡ khi hết node). Clip `battle/attack_1`, tốc 2.6/0.8/0.705/1 theo mốc clip 0.13/0.2/0.35/0.53 |
| 0.05 | HitBox 100100001: Cylinder180 r 1.31, chém trong 0–0.19 s. **100% Atk = 100** trước Def, **62** sau Def (100 × 100/162). 12% gắn Bleed 1017. Passive 10010001 +1 stack 1011 (chỉ mục tiêu đầu) |
| 0.145–0.24 | có phím hướng thì lướt 15 m/s × đường cong 1→0 = 0.71 m |
| 0.25 | cửa `10010000@0.35` mở, phím giữ được đệm |
| 0.35 | chạy lại 10010000. 1012 = 1 nên chọn `r/1 2타`: gỡ 1012, thêm 1013 |
| 0.45 | HitBox 100100002, **105** → 65 |
| 0.75 | đòn 2 tới cửa `10010000@0.40`. Chọn `r/2 3타`: gỡ 1013, 10% nói câu thoại. SFX thoại lúc 0.95 |
| 1.00 | HitBox 100100003: Cylinder240 r 1.41, **115** → 71 |
| 1.45 | đòn 3 tới cửa `@0.70`. 1012 = 1013 = 0 nên về đòn 1 |
| 1.50 | đòn 1 trúng. 1011 đủ 4 nên passive 10010002 đánh thêm **200%** (123 sau Def) lên mục tiêu đầu, gỡ 4 stack |

Buông chuột thì combo reset theo thời hạn buff. Bấm lại sau 0.6 s: 1012 còn, ra đòn 2. Bấm lại sau hơn 0.85 s kể từ đòn cuối: ra đòn 1.

### 6.2 Gayoung lướt 10010100

| t | Việc |
|---|---|
| 0 | root dài 0 chọn `r/0` (không có talent 1031). −25 stamina, CD 0.35 s. Thêm 1015 (vô địch 0.35 s, gỡ khi hết node). VFX lướt, hitbox âm thanh 100101001 (SFX `Skill_100001_Dash`) |
| 0–0.2 | MoveToMoveDir 9.5 m/s, đường cong phẳng → **1.9 m**. Không bấm hướng thì đi theo hướng ngắm |
| 0.01–0.5 | cửa `ANY@0.4`: skill khác bấm trong lướt ra lúc 0.4 |
| 0.25–0.5 | có phím di chuyển thì huỷ lướt |
| bất kỳ lúc nào trong node | bấm tấn công (`AttackDown`) → `대시 공격`: lướt 8 m/s × 0.09 s, HitBox 100101002 Sphere 1.31 lúc +0.135, **130%**, không tính sau lưng. Thêm 1023 (bóng mờ) |

Mio lướt (10011100) có cùng 1.9 m, nhưng là dịch chuyển tức thì (TeleportActionEvent). Đây là quãng lướt thiết kế chung.

### 6.3 Gayoung đỡ đòn 10010500 (thành công)

Bố trí: Kkamong đứng cách 2.2 m, dùng 20000000 lúc K. Gayoung bấm đỡ lúc K + 0.75.

| t (từ K) | Việc |
|---|---|
| 0.75 | 10010500: CD 5 s. `StaminaCost` 15 nhưng cây không có node `IsUsingCost`, nên không trừ ([CHƯA RÕ] #20). 3000009 (ParryEffect, **0.23 s**), 1025 (+25% Def, −50% stress nhận, miễn nhiều CC). Clip `parrying` |
| 0.80 | hitbox Kkamong sinh, Kkamong lao (Distance, dừng ở mép) |
| ≈0.917 | hitbox chạm, `CanParry` + 3000009 → **đỡ**: 0 sát thương. `ParrySkillTrigger` → `패링 성공 시` (0.25 s): 3000010 vô địch 1.5 s, VFX, rung 1/1/0.3 |
| +0.25 | `추가타` (0.81 s): 3000012 vô địch 2 s. Có phím cùng hướng ngắm thì lướt 15 m/s (MoveIfAligned) |
| +0.47 | HitBox 100105003: Sphere 1.8, **325% Atk**, ConditionalStats `CriticalChancePercent +100` nên luôn chí mạng → 325 × 1.35 = **438.75** trước Def → **246** lên Kkamong (Def 78). Đẩy lùi 0.8 m trong 0.1 s, khoá 0.6 s. 30% Bleed |

Bấm đỡ quá sớm (K + 0.3) thì 3000009 hết trước lúc trúng. Gayoung ăn **123** (185 × 100/143 × 0.95, có buff 104 −5% nhận).

### 6.4 Noah bắn thường 10012000 và khiên 10012300

Bắn thường (giữ chuột):

| t | Việc |
|---|---|
| 0 | `r/1` (không có 1200): tốn 1 stack (2 → 1), CD 0.6 |
| 0.24 | 3 nón Cylinder60 (§3.1). Mục tiêu ở 0.5 / 1.2 / 2.3 m nhận 60+35+135 / 35+135 / 135% |
| 0.4 | node `장전 모션` 0.49 s. Cửa `ANY@0.25` |
| 0.65 | phát 2 (CD đã hết lúc 0.6). Stack 1 → 0 |
| 1.25 | hồi 1 stack (đồng hồ chạy từ lần dùng đầu) |
| 1.30 | phát 3. Stack về 0, lần hồi kế lúc 2.50 |
| 2.50 | phát 4 |

Khiên (bấm và giữ):

| t | Việc |
|---|---|
| 0 | `방패 시전` 0.185 s. CD 2.75 s. Thêm 3000015 (Parry 0.15 s + miễn), 3000014 (miễn tất cả 1 s), 1202 (FrontGuard 77.5% trong 120°, −55% tốc chạy, miễn Bleed/Burn/Silence/Poison/Stun/Knockback/Pull, −65% stress nhận) |
| 0.185 | `방패 루프` tối đa 5 s. Đi bộ được, hướng khoá |
| nhả phím | `막기 종료` 0.333 s (từ 0.15 s thì cửa `ANY` + `MOVE` mở) |

- Bị đánh trong 0.15 s đầu → `패링 성공 시`: khiên **79.5** (15% HpMax 530, trần 20% = 106), vào vòng lặp 5 s.
- Bị Kkamong đánh chính diện sau 0.15 s: 185 × 100/139 × 0.225 = **30**.

### 6.5 Raven bắn thường 10013000 và nạp đạn

| t | Việc |
|---|---|
| vào trận | passive 10013805: 1303 = 6 viên |
| 0 | root (cần 1303 ≥ 1) 0.37 s |
| 0.25 | 1303 ≥ 2 thì HitBox 100130001: Box 0.55 × 1.2 lệch z 0.6, bay 18 m/s, 0.222 s ≈ 4 m, xuyên 3 mục tiêu, **110%**. 1303 = 1 (viên cuối) thì 100130002: 25 m/s, **175%**. Cả hai gỡ 1 viên |
| 0.37 | node `이동 가능 구간` 0.23 s: đi bộ + ngắm, 1313 (−35% chạy) |
| 0.55 | cửa `ANY/10013000` Immediate ở 0.18 → phát kế |

- Nhịp bắn: 0, 0.55, 1.10, 1.65, 2.20, 2.75.
- Viên 6 (lúc 3.00) làm 1303 về 0. Passive 10013807 (BuffRemoved 1303, điều kiện 1303 == 0) thêm 1302 (nạp 1.5 s). Hết hạn lúc 4.50 → 10013806 nạp 6.
- Đứng không bắn: vào Idle/Move → 10013803 thêm 1301 (chờ 3.8 s) → hết hạn → 1302. Dùng skill hoặc bị CC → 10013804 gỡ 1301.

Reload bash 10013300:

| t | Việc |
|---|---|
| 0 | `준비` 0.2 s |
| 0.2 | `시전` 0.5 s: CD 6.5 s. HitBox 100130031 Cylinder180 (1.6, 1.65), **280%**, đẩy lùi 1.8 m |
| khi trúng | `DamageProvide{10013300}` → `대미지 주면 장전`: 1303 = 6, gỡ 1301/1302 |

Điếu thuốc 10013500: sau 0.4 s thêm 1306 (18 s: +30% chí mạng, +15% AtkSpeed, +9 StaminaRegen, +1 stress/giây, đòn trúng 12% gắn độc 1312). Ô phím đổi sang 10013501 (dập thuốc).

### 6.6 Mio phép thường 10011000 và dịch chuyển 10011100

| t | Việc |
|---|---|
| 0 | node 0.67 s. 1102 (−30% chạy). Đi bộ được, hướng khoá |
| 0.24 | HitBox 100110002: Box 0.2 × 0.2 (cao 3), lệch z 0.57. Linear 3.3 m/s trong 1.27 s. `MoveSpeedCurve` bằng 0 tới τ = 0.09 (tức **0.114 s** đứng yên) rồi lên 1 ở τ = 0.10. Huỷ khi trúng, **80%**. Hồn +5 (Normal) / +15 (Boss, MiniBoss) |
| ≈0.976 | trúng mục tiêu cách 3 m: 0.24 + 0.114 + 0.013 (đoạn tăng tốc) + 2.01 m / 3.3 m/s |

- Bẫy đã sập: tính theo "bay 3.3 m/s từ đầu" thì ra 0.855 s. Mô phỏng ra 0.983 s. Chênh đúng bằng đoạn đứng yên của đường cong. Đường cong hitbox tính theo phần đời đã qua.

Dịch chuyển 10011100:

| t | Việc |
|---|---|
| 0 | −35 stamina, CD 0.6. Dịch **1.9 m** tức thì theo phím di chuyển (không bấm hướng thì theo hướng ngắm). 1015 vô địch |
| 0.4 | hết node. Cửa `10011500@0.2`, huỷ bằng di chuyển từ 0.25 |
| trong node, giữ chuột | `텔포 공격` (AttackHold) 0.4 s: MoveByInput 12 m/s trong 0.05–0.25 (theo phím), HitBox 100111003 lúc +0.175, **135%**, đẩy lùi 1.5 m. Hồn +10 / +30 |

### 6.7 Quái cận chiến: Kkamong 200001, skill 20000000

| t | Việc |
|---|---|
| 0 | CD 4 s (× độ khó). VFX `Common/SkillReady_Enemy01`, SFX `Attack_Warning` (báo trước để né hoặc đỡ). Hitbox âm thanh 200000002 (`Yamainu_Attack_Ready`). Clip `attack_1`, tốc 0.25 tới mốc clip 0.2 (gồng lâu) |
| 0.8 | HitBox 200000001: Cylinder120 (0.35, 0.5), dính theo thân, chém trong 0–0.2 s, **100% Atk = 185**, `CanParry`, 10% Bleed 2001 (6% Atk/giây). Lao MoveToAimDir 15 m/s (Distance) trong 0.8–0.98 = tối đa 2.7 m, dừng ở mép mục tiêu |
| trúng | `DamageProvide` → `공격 시 돌진 중지`: node dài 0, không con → hết skill. Gayoung (Def 43, buff 104) mất **123** |
| 1.21 | hết skill nếu trượt |

Bản Hard (20000001) giống thế nhưng SFX là `Attack_Warning_CantParry`, và có thêm đòn thứ 2 (node nối tiếp 0.81 s, `AutoAimToTarget`).
- Bẫy dữ liệu: hitbox của bản Hard vẫn `CanParry = true`. Hiện làm theo bảng, tức vẫn đỡ được.

---

## 7. Giao diện với phần còn lại

- `world` (xem đầu `js/skill.js`): `units`, `time`, `emit(evt)`, tuỳ chọn `rng`, `moveUnit`, `raycastWall`, `teleportUnit`, `summon`, `spawnExtraUnit`, `spreadAggro`, `difficulty`.
- Hợp đồng sự kiện `vfx` (stage.playFx nhận nguyên): `name, unit|pos, hitbox, owner, bone, offset, zOffset, duration, loop, loopDuration, speeds, follow, dir, element, tracking, rotate`.
  - `hitbox` có mặt → VFX bám một Object3D neo theo `hb.pos` (cả `pos.y` của parabola) và `hb.dir` mỗi khung; `tracking` = đạn bay. Hitbox hết thì VFX dừng kiểu 'end' (như SkillVfx gốc bị Destroy cùng hitbox). Vì vậy dữ liệu gốc kéo `duration` hitbox dài hơn cửa sổ va chạm (đòn 1 Gayoung: dur 1.0, va chạm tới 0.19).
  - `SpawnWithIdentityRotation` → không quay theo hitbox; `InheritOwnerScaleX` → lật theo hình chủ.
  - `unit` + `follow` → bám gốc hình; `UpdateByAimDir` → bám neo quay theo ngắm mỗi khung; `bone` → độ lệch xương `bone_<tên>` (UnitVisual.boneOffset).
  - `offset` + `VfxZOffset` là độ lệch cục bộ, quay theo hướng VFX. [SUY LUẬN] ZOffset dọc trục trước: thiên thạch Mio `startOffset z −1.1` + `VfxZOffset 1.1` về đúng tâm.
  - `VfxSpeeds[{endTime, speed}]`: `endTime` là thời gian của hiệu ứng (như animationSpeeds), sau mốc cuối tốc độ 1. [SUY LUẬN] `{1.0: 30}` theo giờ thật sẽ vô lý.
  - `vfxEnd` → `VD.vfx.stop(h, 'end')`.
- Sự kiện trình bày: anim, animMove, vfx, vfxEnd, sfx, indicator, hitbox, hitboxEnd, damage, hitstop, shake, flash, cc, ccEnd, parry, buff, buffRemoved, buffFx, shield, heal, stress, soul, death, teleport, summon, monologue, skin, polymorph, skill, node, skillEnd, immune, groggy, suppression, aggro…
- Nhân vật: `u.input = {move, aim, aimPoint, buttons:{attack, dash, skill0..skill4}}`. Ô `skillN` = `ActiveSkillIds[N]` sau polymorph / ChangeSkill (`Skill.slotSkill`).
- Quái: `Skill.cast(world, u, skillId)`. ai.js lo `AiSkillCondition`, `GlobalSkillCoolTime`, `OnCombatBuffIds`. Luật AI ở `docs/AI.md`. Mỗi khung gọi `Skill.step` rồi mới `AI.step`.
- Mỗi khung: `VD.Skill.step(world, dt)`. Thứ tự:
  1. tick đơn vị (CD, stack, hồi, buff, CC, khiên),
  2. input,
  3. cập nhật run (di chuyển → sự kiện → anim → đệm → hết node),
  4. input lượt 2 (để cửa sổ Immediate mở đúng khung),
  5. hitbox (di chuyển → va chạm),
  6. trigger được xử lý giữa các bước.
- Run bắt đầu trong khung nào thì không tiến thời gian ở khung đó. Bẫy đã sập: nếu run bắt đầu từ đệm phím mà vẫn bỏ khung kế, mọi đòn nối trễ 1 khung (đòn 2 ra 0.467 thay vì 0.45).

---

## 8. [CHƯA RÕ] — mặc định đang dùng

1. **`executeTime` với `ExecuteType None` ở node "lướt + chém" (0.18).** Mặc định: bỏ qua, con chạy ngay khi có phím. Cách khác: chỉ nhận phím từ 0.18 s. Nếu cảm giác lướt bị cắt quá sớm thì đổi sang cách này.
2. **`moveOffset`.** −1 ở MoveToTarget xem là giá trị trống (dừng khi chạm). 0.25 ở đòn 1 Gayoung (MoveByInputNoAim) đang bị bỏ qua. Có thể là "dừng trước địch 0.25 m".
3. **Công thức phòng thủ.** Mặc định `DefenseFactor / (DefenseFactor + DefEff)`, xuyên giáp % trước rồi xuyên giáp phẳng. Const chỉ có `DefenseFactor = 100`.
4. **Người đánh bị đỡ đòn có bị phạt không** (choáng, mất thăng bằng). Mặc định: không. Đạn bị đỡ thì huỷ.
5. **DoT có tính Def không.** Mặc định: không. Tick đầu sau 1 s, 1 tick/giây.
6. **Thứ tự bit của `ImmunityEffectTags` dạng số.** Mặc định: bit i = dòng thứ i của StatusEffectTag.csv (None = 0). Nếu Bleed là bit 0 thì −100353 thành "trừ Stun, Freeze và một bit lạ", kém hợp lý hơn.
7. **StatusEffectSuppression.csv** (kháng Root/Silence/Confuse/Slow/Blind tăng dần). Chưa làm, thời lượng không bị giảm.
8. **Điểm yếu và nguyên tố đầy stack** (`WeakpointGaugeHpPercent`, `WeakPoint*`). Chưa làm. `DefaultWeaknessDamagePercent` có trong chỉ số nhưng chưa dùng.
9. **`tracingAngle`** (hitbox Tracing). Mặc định: độ mỗi khung ở 60 Hz.
10. **Nạp năng lượng tối thượng.** Mặc định chỉ có `ChargePerSec`. Chưa rõ sát thương gây ra có nạp thêm không.
11. **`AtkSpeed`.** Mặc định: nhân tốc độ thời gian của skill `BasicAttack`.
12. **Làm tròn sát thương.** Mặc định: `round`, tối thiểu 1.
13. **Stress khi bị trúng** (`StressDamageTriggerHpPercent 30`, `StressDamageOnHpDamaged 3`). Để dive.js, lõi không cộng.
14. **`SpawnPositionType None` của HitBoxEvent** xem như Owner (sinh ở chân chủ, dính theo nếu FollowSelf).
15. **Chọn quái để gọi ra** (`SummonActionEvent.MonsterInfos[].Probability`). Mặc định: bốc một theo trọng số.
16. **Hướng hitbox FollowSelf khi chủ xoay giữa chừng.** Mặc định: giữ hướng lúc sinh.
17. **Thanh áp chế** (§3.6). Mặc định: quái có gauge > 0 không nhận CC thẳng.
18. **Phím `CurrentInputUp`.** Mặc định: đọc theo mức "không còn giữ", không theo cạnh nhả.
19. **Pull.** Mặc định: kéo tới chạm nguồn trong `ccMoveDuration` (hoặc nửa `ccDuration`).
20. **Skill có `StaminaCost` mà cây không có node `IsUsingCost`** (đỡ đòn Gayoung 10010500: 15, khiên Noah 10012300: 5). Mặc định: không trừ, không kiểm đủ stamina. Cách khác: trừ ở root.

---

## 9. Kiểm chứng và công cụ

- Dữ liệu rút gọn (`data/tables.js`) bỏ mọi field bằng 0 / false / "" / [] / "None". Code phải đọc số qua `VD.num()` và coi field thiếu là giá trị mặc định. Ba chỗ đã sập vì chuyện này: xem `docs/AI.md` §9.

- Chạy: `node test/voiddiver-combat.js`.
  - Mặc định đọc `~/Downloads/vd-ref/json`. Đổi thư mục bằng `VD_REF_JSON=<thư mục>`.
  - `VD_DATA=tables` thì nạp `games/voiddiver/data/tables.js` khi file đó có.
- Test kiểm các số ở §6. Sau đó chạy mỗi skill của 4 nhân vật (35 skill, kể cả polymorph) và mọi skill Active của mọi quái (688 lần) mỗi thứ một lần, rồi kiểm:
  - không có exception,
  - không có HP hay vị trí NaN,
  - không có `$type` sự kiện, trigger, hiệu ứng buff, sự kiện va chạm hay kiểu di chuyển hitbox nào chưa có handler.

  Cuối cùng in bảng phủ theo từng `$type`.
- In cây gọn của một skill (dùng trong phiên viết tài liệu này): viết một script Node nhỏ đọc `Skill.json` và `HitBox.json`, đệ quy `childNodes`, rồi in mỗi node thành một dòng: `text`, `ExecuteType@executeTime`, `actionDuration`, trigger, điều kiện dạng `S.1012<1`, `cancelableTimes` dạng `0.25-0.5 SpecifiedTime@0.35 10010000`, sự kiện theo mốc và hitbox con (hình, scale, cửa sổ va chạm, sự kiện va chạm). `vd-ref/tools/skill_summarize.py` làm gần giống, nhưng không in cửa sổ huỷ và điều kiện.
