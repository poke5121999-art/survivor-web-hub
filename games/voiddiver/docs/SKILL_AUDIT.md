# SKILL_AUDIT — skill 4 nhân vật: bản gốc ↔ bản web

Sinh bởi `python tools/skill_audit.py` (đừng sửa tay; ghi chú lý do nằm trong `FIXED_NOTES`/`REMAIN_NOTES` của tool).

Phạm vi: 73 skill (đánh thường, lướt, ActiveSkillIds, bản polymorph, passive, skill thay thế, skill của ExtraUnit) của 100001 Gayoung, 100003 Noah, 100004 Mio, 100005 Raven. Quét component prefab: có.

Cột "skill" = số skill bị ảnh hưởng. Sắp theo cột này. Trạng thái: **còn** / **đã sửa** (phép kiểm trên mã web hoặc lỗ hổng biến mất khỏi dữ liệu). Nguồn luật ngữ nghĩa: mã C# gốc đọc bằng `tools/il2cpp_method.py`.

## Còn lệch (10)

| # | loại | lệch | skill | ví dụ skill | ghi chú |
|---|---|---|---|---|---|
| 1 | VFX | Light: vfx.js dùng 4 PointLight chung (gần đúng cường độ/tầm) | 23 | 10010002 [더미]검사 패시브 3타 2, 10010300 Xung Phong Liên Hoàn, 10010400 Bùa Trấn Áp, 10010500 Bật trả … | Light thật của URP (suy giảm, số đèn/vật) chưa dựng lại; vfx.js chọn 4 đèn mạnh nhất |
| 2 | Node | trường node `executeTime` có dữ liệu, web không đọc | 8 | 10010000 검사 평타, 10010100 Phi Yến, 10010700 [Tối thượng] Quỷ Diệt Liên Vũ, 10011100 Nhảy Bùm Bùm … | không tìm thấy nơi đọc SkillAction.ExecuteType/executeTime trong UnitSkillState.* (ExecuteSkillAction, ProceedNextSkillAction, TriggerActiveSkill, OnUpdate, InitSkillAction, OnSkillActionTimeEnded, IsNextNodeNeedInput); web bỏ qua như SKILLVM §2.2 |
| 3 | Node | trường node `ExecuteType` có dữ liệu, web không đọc | 6 | 10010000 검사 평타, 10010100 Phi Yến, 10011100 Nhảy Bùm Bùm, 10011101 Thức Tỉnh: Nhảy Bùm Bùm … | như executeTime |
| 4 | VFX | script `EffectRandomSeedController` trong prefab: web không chạy | 5 | 10010300 Xung Phong Liên Hoàn, 10012000 Đánh thường Dullahan, 10012500 Hơi Thở Rồng, 10012700 Bất Tử … | chọn một hạt giống trong allowedSeeds rồi Play: bộ sinh số ngẫu nhiên hạt của Unity là mã đóng, web không tái lập được chuỗi ngẫu nhiên |
| 5 | Node | trường node `IsGroundSfxOnMove` có dữ liệu, web không đọc | 4 | 10010100 Phi Yến, 10010300 Xung Phong Liên Hoàn, 10012100 Đột Kích, 10012500 Hơi Thở Rồng | UnitSkillState.UpdateGroundSfxOnMove cần BackgroundTileTypeCore.GetGroundType (loại nền theo ô) — web chưa có hệ loại nền; chỉ Grass/Water có tiếng (SkillGroundMoveSfx) |
| 6 | Node | trường node `groundSfxInterval` có dữ liệu, web không đọc | 4 | 10010100 Phi Yến, 10010300 Xung Phong Liên Hoàn, 10012100 Đột Kích, 10012500 Hơi Thở Rồng | như IsGroundSfxOnMove |
| 7 | VFX | shader `ArtTeam/VFX/VFX_Master_typeC_3CD` vẽ gần đúng (unlit ảnh × màu) | 3 | 10011310 자폭시 범위공격, 10011311 자폭시 범위공격 슈퍼, 10012400 Cú Đá Nổ | chưa giải DXBC shader typeC; vẽ gần đúng ảnh × màu |
| 8 | VFX | shader `LCArt/VFX/Shader_VFX_Grabpass_Distortion` bị bỏ (không vẽ) | 2 | 10010500 Bật trả, 10012300 Chặn bằng khiên | shader méo ảnh nền (grab pass) — web chưa có bước chụp màn hình để méo |
| 9 | VFX | Animator có đường cong thuộc tính `198/2440536842` (typeID/crc) web bỏ qua | 1 | 10012600 Bàn Tay Bóng Tối | prefab: Immobilized_small |
| 10 | VFX | script `FakeShadowPoint` trong prefab: web không chạy | 1 | 10010300 Xung Phong Liên Hoàn | hệ bóng giả FakeShadowManager (bóng đổ theo điểm sáng) web chưa có |

## Đã sửa (4)

| loại | lệch | skill | cách sửa |
|---|---|---|---|
| Ngữ nghĩa | VfxEvent bám theo, không khớp, offset có x/z: bản gốc quay offset theo Forward (hoặc MoveDir nếu InheritMoveDir) của unit MỖI KHUNG, hướng VFX giữ như lúc sinh; web quay offset theo hướng VFX — gốc: UnitFollower.Update 0x180716170 (boneType None: pos = view.pos + LookRotation(flat(Forward/MoveDir))·offset) | 9 | stage.js syncFollower (unitFollower) theo UnitFollower.Update: offset quay theo Forward/MoveDir mỗi khung, hướng VFX giữ lúc sinh; ảnh scratchpad skillfx2/mio_blade_ba.png |
| Ngữ nghĩa | VfxEvent IsIndependent có boneType: bản gốc KHÔNG cộng độ lệch khớp (chỉ nhánh bám theo mới gửi BoneType); vị trí = ITarget.Position + (phải, lên, tới)·offset theo hướng VFX — gốc: UnitController.OnVfxEvent 0x1806652b0 (BoneType/TargetPositionOffset chỉ ghi khi !IsIndependent; nhánh độc lập: Position = Position + r·x + u·y + d·z, r = cross(up, d)) | 5 | skill.js VfxEvent: IsIndependent thì không gửi boneType; ảnh g_chain_ba.png |
| Ngữ nghĩa | UseMultiTrackMoveAnimation: đi trong skill thì bản gốc phát moveAnimationName trên track riêng (chân) chồng lên clip skill; web thay hẳn clip bằng moveAnimationName — gốc: UnitSkillState.UpdateMoveByInputAnimation 0x1806ce970 → NtfPlayAnimation.MultiTrackAnimationName → UnitView.PlayAnimationAsync | 2 | unitvis.js poseTrack1/clearTrack1 + stage.js: đi trong skill → track 0 battle/walk/run, track 1 moveAnimationName; dừng → clip skill chạy lại từ 0. Đo xương IK_leg_F_2: trước đứng yên (0,045; 0,015), sau chạy theo battle/walk; ảnh r_gat_ba2.png |
| VFX | shader `Mobile/Particles/Alpha Blended` vẽ gần đúng (unlit ảnh × màu) | 1 | fx_export.py: shader dựng sẵn không có thuộc tính màu → bỏ _TintColor sót (0,0,0,0) làm điếu thuốc vô hình; xuất lại Cigarette_Projectile. Shader gốc = ảnh × màu đỉnh, Blend SrcAlpha/OneMinusSrcAlpha — cách vẽ U khớp đúng (r_cig_ba.png) |

### Đã sửa (lỗ hổng không còn trong lần quét này)

- `sem:vfx-follow-bone-offset`: stage.js syncFollower: GetBoneOffset tính lại mỗi khung + offset trục thế giới
- `anim:UseMultiTrackMoveAnimation`: xem sem:anim-multitrack
- `hb:UseAimCorrection`: hitbox.js correctAimDir theo HitBox.CorrectAimDir 0x1805dfc30 (≤ 10°, quái trong tầm nhìn gần nhất); đo: lệch 5°/9° → bắn thẳng vào quái, 11°/20° giữ nguyên
- `hb:IgnoreHitVfxWall`: hitbox.js wallHitFx: đạn vỡ ở tường phát hitVfx/hitSfx (TryCollision 0x1805eaf20 → IsHighObstacle), trừ IgnoreHitVfxWall; đo: đạn Raven vào tường 2 m → Raven_Shot_Hit + NormalAttack_Hit_None
- `hb:pierceSfx`: hitbox.js pierceStep theo HitBox.UpdateHitCollision 0x1805ebc70: xuyên tiếp thì phát pierceSfx
- `hb:pierceChances`: hitbox.js pierceStep: Random.Range(0,100) ≥ pierceChances[k] → hết xuyên
- `vfxscript:ParticleSetupTool`: fx_export.py apply_particle_setup (ApplyLogic 0x1805da000) nướng sizeMultiplier/delayOffset/additionalDelay; 26 prefab Raven xuất lại (dấu "setup"). HeadShot_Cast: 8 hệ trễ 0,6 s → loé nòng trùng lúc bắn (r_headshot_ba.png); BlindlyShot ×0,75 (r_ult_ba.png)
- `vfxscript:StatusVfx`: không cần thêm: OnDespawn → EndTrigger = VD.vfx.stop(h, "end") đã có
- `hitpoint-none`: hitbox.js: hitPointType None vẫn phát hitVfx tại tâm hitbox; NearByOwner lấy _executionPosition (chỗ chủ đứng lúc sinh hitbox) — TryCollision 0x1805eaf20
- `mesh-name-clobber`: fx_export.py mesh_out: chạy lẻ không ghi đè mesh trùng tên của prefab khác (msh_SphereDome01_uvv_uvflip)
- `passive-double`: stage.js S.spawn: makeUnit(S.A) đã push + initPassives, S.spawn lại initPassives lần nữa → mọi AddPassiveSkillTrigger chạy 2 lần (đo: bom 10002 của Mio 5 passive × 2, phát 2 vòng Sitting_Ring cùng lúc); nay makeUnit(add:false), S.spawn push + initPassives một lần → đo lại 5 × 1

## Skill trong phạm vi

- **100001 Cha_Sword**: 10010000 검사 평타, 10010100 Phi Yến, 10010300 Xung Phong Liên Hoàn, 10010400 Bùa Trấn Áp, 10010700 [Tối thượng] Quỷ Diệt Liên Vũ, 10010600 Trảm Hồn, 10010500 Bật trả, 10010001 [더미]검사 패시브 3타 1, 10010002 [더미]검사 패시브 3타 2, 10010401 [Hình nhân][Dummy]Swordsman Takedown 3-hit Stun, 10010801 [더미] 추가뎀 패시브, 10010802 [더미] HP 낮을 때 버프  (Copy), 71000001 죽음의 문턱 발동 시 발동, 10000000 광원 0 디버프 패시브
- **100003 Cha_Dullahan**: 10012000 Đánh thường Dullahan, 10012100 Đột Kích, 10012300 Chặn bằng khiên, 10012400 Cú Đá Nổ, 10012500 Hơi Thở Rồng, 10012600 Bàn Tay Bóng Tối, 10012700 Bất Tử, 10012801 [더미] 듀라한 실드&HP 낮을 때 버프, 71000001 죽음의 문턱 발동 시 발동, 10000000 광원 0 디버프 패시브
- **100004 Cha_Caster**: 10011000 캐스터 평타, 10011100 Nhảy Bùm Bùm, 10011200 Tia Sáng Boomerang, 10011400 Hơi thở của Shavvy, 10011300 Búp Bê Bánh Quy Mồi Nhử, 10011500 Tránh Ra!, 10011600 [Tối thượng] Mưa Sao Băng, 10011001 캐스터 평타 슈퍼, 10011101 Thức Tỉnh: Nhảy Bùm Bùm, 10011201 Chế Độ Thức Tỉnh: Tia Sáng Boomerang, 10011401 Chế độ Thức tỉnh: Hơi thở của Shavvy, 10011301 Thức Tỉnh: Búp Bê Bánh Quy Mồi Nhử, 10011501 Thức Tỉnh: Tránh Ra!, 10011601 [Tối thượng] Chế Độ Thức Tỉnh: Mưa Sao Băng, 10011700 [Hình nhân][Dummy]Soul Increase on Near Enemy Kill (Char), 10011701 [Hình nhân][Dummy]Grant Transform Buff at Max Soul, 10011702 [Hình nhân][Dummy]Change Skill/Look on Transform Buff, 10011703 [Hình nhân][Dummy]Remove Transform Buff at 0 Soul, 10011704 [Hình nhân][Dummy]Revert Skill/Look on Buff End, 10011706 Giảm sát thương nhận vào khi HP thấp, 71000001 죽음의 문턱 발동 시 발동, 10000000 광원 0 디버프 패시브, 10011310 자폭시 범위공격, 10011320 [더미]n초후 자폭, 10011330 [더미]폭발범위 표시 이펙트, 10011332 [더미]상태이상 이뮨, 10011333 [더미]어그로 끌기, 10011311 자폭시 범위공격 슈퍼, 10011321 [더미]n초후 자폭 슈퍼, 10011331 [더미]폭발범위 표시 이펙트 슈퍼, 10011334 [더미]어그로 끌기 슈퍼
- **100005 Cha_Raven**: 10013000 Đòn thường của Raven, 10013100 Lăn, 10013200 Mắt Tử Thần, 10013300 Đánh Nạp Đạn, 10013500 Thuốc Lá Hầm Ngục, 10013600 Giờ Không, 10013400 Gatling Tay Giả, 10013801 [더미] 패시브 및 HP 낮을 때 버프, 10013802 [더미] 장전 대기 종료 후 장전 시작, 10013803 [더미] 장전 대기 시작, 10013804 [더미] 행동 들어갈 때 장전 대기 취소, 10013805 [더미] 씬 입장 시 최초 전탄 장전, 10013806 [더미] 장전 정상 종료되었을 때 전탄 장전, 10013807 [더미] 탄 다 쓰면 즉시 장전 시작, 10013808 [더미] 사망 후 부활 시 즉시 장전, 71000001 죽음의 문턱 발동 시 발동, 10000000 광원 0 디버프 패시브, 10013501 Cai Thuốc Tạm Thời
