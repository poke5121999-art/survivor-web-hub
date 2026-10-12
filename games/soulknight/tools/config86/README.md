# config86: số và luật thật của Soul Knight 8.6.0

Bộ công cụ này gỡ dữ liệu cấu hình của bản cài 8.6.0 (`D:\sk86-ref`, ngoài git) thành JSON đọc được, để pha sau
(vũ khí, anh hùng + kỹ năng, trùm, chế độ mùa) lấy số thật thay cho số ước từ wiki. Công cụ không động vào game.
Mọi đầu ra nằm ở `D:\sk86-ref\decoded\`, không đưa vào repo.

Nhãn: **[ĐO]** là điều đã kiểm trên dữ liệu thật (có chỉ ra đối tượng hoặc trường), **[SUY]** là suy luận chưa kiểm hết.

## Chạy lại từ đầu

```sh
cd games/soulknight/tools/config86
export PYTHONIOENCODING=utf-8                 # Python in tiếng Việt ra cp1252 là crash
pip install UnityPy==1.25 pycryptodome capstone pyelftools
python decode_config.py                       # config.ab       -> decoded/config/*.json|csv        (~5 s)
python dump_localization.py                   # localization.ab -> decoded/localization*.json      (~5 s)
python dump_mb.py escape_config.ab hero.ab weapon.ab bullet.ab --deps          # -> decoded/mb/  (~1 phút)
python dump_mb.py $(cd /d/sk86-ref/UnityDataAssetPack/assets/AssetBundles && ls boss/*.ab) --deps   # ~9 phút
python build_tables.py                        # -> weapons/heroes/bullets/bosses/wiki_check.json (~3 phút)
python decrypt_metadata.py                    # global-metadata.dat đã gỡ che -> decoded/il2cpp/
python meta_names.py                          # -> decoded/il2cpp/types.txt (kiểu, trường, method, hằng)
python decode_lua.py                          # runtime_lua.ab  -> decoded/lua/**.lua               (~5 s)
python luban_decode.py                        # luban_config.ab -> decoded/luban/*.json             (~12 s)
```

Trên máy này `python` là shim `.bat` của pyenv; tham số chứa `|` (regex) bị cmd cắt. Khi cần regex có `|`,
gọi thẳng `C:/Users/tamph/.pyenv/pyenv-win/versions/3.8.10/python.exe`.

## Nguồn và cách giải

### 1. `config.ab`: 17 TextAsset, XOR khoá "soulKnight"

- [ĐO] Mọi tệp mở đầu bằng `38 0a 0c 40`. Tìm chu kỳ bằng chỉ số trùng hợp trên `skills` (612 KB) thì ra 10.
  Chọn mỗi cột một byte cho nhiều chữ in được nhất, được khoá `soulKnight`. Về sau metadata xác nhận đúng khoá
  này: trường hằng `SecretKey = "soulKnight"` và `ConfigPath = "SoulKnight/Runtime/Config2Code/EncryptedCsv/*.csv"`.
- [ĐO] Cái bẫy đã gặp: XOR chạy **theo từng ký tự C#**, không theo byte. `map_levels` có ký tự Trung văn. Nếu XOR theo
  byte thì các ký tự UTF-8 nhiều byte hỏng hết. Cách đúng là giải UTF-8 trước rồi XOR từng code unit.
- [ĐO] Bản rõ là CSV: dòng 1 là tên cột, dòng 2 là kiểu (`int/float/bool/string/List<…>/Dictionary<…>`), từ dòng 3
  là dữ liệu. Ô phức tạp là JSON (dấu `"` được nhân đôi kiểu CSV).
- [ĐO] Cột `Level` của `map_levels` bị Excel biến "1-1" thành chuỗi `"1月1日"`. Đọc đúng là tầng-màn.

Đầu ra `decoded/config/<bảng>.json` có dạng `{Key: {cột: giá trị}}`. Ô kiểu `int/float/bool` được đổi sang số,
ô JSON được parse. Tệp `_index.json` ghi số hàng và kiểu từng cột.

| bảng | hàng | nội dung |
|---|---|---|
| `enemies` | 592 | Hp, Speed, Critical, IsBoss, BossWeapon, BossRoom, BossBgm, SubspeciesBoss, DoubleBosses, Drops (xác suất rơi), LevelKey (1A…4C) |
| `characters` | 24 | c00..c23: Hp, Speed 6.5, Critical, MaxEnergy, Atk (sát thương cận chiến), InSkillTime |
| `skills` | 145 | `cXX/common`, `cXX/skill 1..3`: cd, duration, range, skillType, maxCount, price, icon, âm, prefab hiệu ứng theo từng skin |
| `weapons` | 1045 | đường prefab, Price, vật liệu rèn, FusionList, TalentList (tên thiên phú + script WMod* + tham số) |
| `weapons_drop` | 324 | Group, Weight của từng vũ khí trong nhóm rơi |
| `map_levels` | 148 | map_A0.. theo tầng: Bgm, Walls, Obstacles, Enemies (enemy, weight, maxCountPerWave), phòng đầu/cuối/rương/đặc biệt |
| `level_generate_config` | 7 | kích thước phòng, hành lang, cửa, builder (AncientBattlefield, MachineryCity, Seabed, SeasonIrontide…) |
| `random_objects` | 98 | các bể ngẫu nhiên: chest, shop, statue, drink_seller, merchant buff, mount_seller… (prefab, weight, điều kiện) |
| `items` | 677 | Blueprint, Material, Seed, TokenTicket… (DataStr JSON) |
| `npc`, `pets`, `mounts`, `skins`, `achievements`, `decorate_skins`, `hall_object_skins`, `sprite_atlas` | | đường prefab và cấu hình phụ |

### 2. MonoBehaviour theo typetree (không mã hoá)

`dump_mb.py <bundle…> [--deps]` đổ mọi MonoBehaviour ra `decoded/mb/<bundle, '/'→'__'>.json`. Mỗi phần tử có dạng
`{cls, go, root, path, pid, data}`. Mọi PPtr được đổi thành chuỗi `"Type:tên"`. Nếu đối tượng nằm ở bundle phụ thuộc
thì chuỗi có thêm `@bundle`. Cờ `--deps` nạp các bundle trong `.manifest` để đặt tên được cho sprite, âm và prefab đạn.
Đã đổ các bundle `escape_config`, `hero`, `weapon`, `bullet` và 42 bundle `boss/*`.

`build_tables.py` gộp các dump đó thành bảng phẳng:

- **`weapons.json`** (1038 prefab, khoá theo tên prefab `weapon_002`…). Mỗi vũ khí có các trường sau.
  - Tên và phân loại: `name{en,vi}` (localization `weapon/<key>`), `cls` (Gun001, CGWeapon, GunThrow…), `weapon_type`, `tags`.
  - Chỉ số bắn: `grade` = item_level, `value`, `consume` (năng lượng), `deviation` (độ lệch °), `weapon_speed`,
    `atk_move_speed`, `dmgMultiFactor`, `is_melee`, `dual`.
  - Đạn: `bullets[{proto, damage, speed, size, crit, repel, through}]`.
  - `extra`: các trường số riêng của lớp, ví dụ `multiCount` (số viên của shotgun), `max_delay`, `angle`.
  - Hình và nhịp: `sprite` (khung trong sprite_atlas, ví dụ `weapons_21`), `animator`, `atkClip{clip, len, attackEvents}`, `rps_est`.
  - Cấu hình: `config{price, materials, talents, drop}`.
  - [ĐO] `rps_est = weapon_speed × số sự kiện Attack / độ dài clip tấn công` (AK-47: 1.0 × 1 / 0.1667 = 6).
    Công thức chỉ đúng cho súng thường. Súng bắn loạt, súng tụ lực và súng có logic riêng lệch nhiều, ví dụ Gatling ra 10 còn wiki ghi 40.
  - 93 khoá trong `config/weapons` không có prefab trong `weapon.ab`. Chúng nằm ở `skin/weapon/*` và `artifacts2/*`, chưa đổ.
- **`heroes.json`** (42 nhân vật, khoá `c00`…`c41`, lấy từ `RoleAttributePlayer` trong hero.ab).
  - Chỉ số: `name{en,vi}` (localization `Character<N>_name_skin0`), `hp`, `armor` (= `_max_armor`), `energy`, `crit`,
    `speed` 6.5, `speed_rate`, `default_buff`.
  - Mã: `controller` (lớp `CxxController`), `hand`.
  - `config_characters`: dòng tương ứng trong `config/characters`, thêm `Atk` (sát thương cận chiến) và `InSkillTime`.
  - `skills[{slot, name{en,vi}, cd, duration, range, skillType, maxCount, price, icon}]`, lấy từ `config/skills`.
  - [ĐO] Trường `armor` trong prefab có khi khác `_max_armor` (c28 có 5 so với 4). Wiki khớp với `_max_armor`.
- **`bullets.json`** (1858 prefab đạn, khoá theo tên). Mỗi prefab là `components[{cls, go, …trường số}]`, gồm Bullet01,
  RGBulletTrigger, ExplodeEffectTrigger, RGSword, BulletParabola…
- **`bosses.json`** (80 bản ghi, khoá `enemy_id`).
  - Trường: `bundle`, `prefab`, `ai` (BossAI01…), `name{en,vi}`, `hp_prefab`, `speed_prefab`, `hp_config`,
    `speed_config`, `boss_weapon`, `level`, `components`.
  - `ai_fields`: shoot_cd, ai_level, bullet01..04 (prefab đạn), reward_value, powerupProbability…
- `mb/escape_config.json` giữ luật chế độ mùa Thoát khỏi Monkia.
  - `EscapePlayerCombatConfig`: tốc chạy 6.8 trong căn cứ và 5.5 ngoài căn cứ, tải 40, 5 ngưỡng tải kèm hệ số tốc,
    lăn né (cd 5 s, bất tử 0.2 s, lực 50), bán kính tự ngắm 18, hệ số sửa chữa, thời gian lộ vật phẩm theo độ hiếm.
  - `EscapeModeConfig`: camera, `EscapeNpcConfig`, `EscapeBeaconConfig`, `EscapeHeroRescueConfig`,
    `EscapeAreaInvestigationConfig`, `EscapeDialogConfig`, `EscapeChestPrefabConfig`, `EscapeTreasureMapConfig`
    (toạ độ theo từng scene).

**Đối chiếu wiki** (`wiki_check.json`, ghép theo tên tiếng Anh, sai lệch ≤ 10 %):

| | khớp |
|---|---|
| vũ khí: sát thương | 443/464 |
| năng lượng | 444/466 |
| crit | 451/466 (trường đạn `critic` chính là tỉ lệ crit) |
| độ lệch | 454/468 (`deviation` = "accuracy" trên wiki) |
| tốc bắn | 237/392 (chỉ là ước lượng, xem trên) |
| anh hùng: hp, giáp, năng lượng, crit | 42/42 cả bốn |

Năm vũ khí đã soát tay đều khớp đủ 4 chỉ số: AK-47 (3/1/12/10), Shotgun (3/3/0/25 ×5 viên), UZI, P250, Staff of Thunder.
Ba anh hùng soát tay cũng khớp: Knight 6/5/180/5, Sword Master 5/4/160/10, Engineer 5/5/180/5. Các chỗ lệch nằm ở
vũ khí có cơ chế riêng: Desert Eagle crit 20 so với wiki 10, Hunter Bow sát thương 0 vì sát thương nằm ở đạn tụ lực,
Captain's Medal… Khi có lệch, lấy số [ĐO] làm chuẩn.

### 3. `localization.ab`: I2 Localization (không mã hoá)

`dump_localization.py` đọc MonoBehaviour `I2LanguagesFull` và ghi 17794 term, 15 ngôn ngữ, **có tiếng Việt (`vi`)**.
- `localization_en_vi.json`: `{term: [en, vi]}`, mỗi term một dòng.
  - Tên vũ khí: `weapon/weapon_002` → `["AK-47", "AK47"]`.
  - Anh hùng: `Character0_name_skin0`. Kỹ năng: `Character0_skill_0_name` / `_info`. Trùm: `boss01` → `Kỵ Sĩ Lớn`.
  - Chế độ mùa: các khoá `esc_*`.
- `localization.json`: đủ mọi ngôn ngữ.

### 4. `global-metadata.dat`: bị che, đã gỡ

- [ĐO] Header đổi `sanity/version` thành `94 43 72 12 | 18 4b 9e ec`. Các khối 4 KB có `(offset>>12) & 15 ∈ {1,2,3,4}`,
  cộng khối đầu tiên, bị XOR 0x66. Tìm ra bằng cách đếm byte 0x00 và 0x66 theo khối 4 KB: khối bị che có 0x66 ở chỗ
  0x00, lặp chu kỳ 64 KB. Các cặp offset/size trong header sau khi gỡ nối tiếp nhau khớp.
- [ĐO] Riêng 16 KB ở `0x1000..0x5000` (mục 480..2527 của bảng string literal, entropy 7.96) là mã hoá thật, **chưa gỡ**.
  Literal được xếp theo abc, nên vùng mất là các chuỗi bắt đầu bằng `" G"…"&d"`. `decrypt_metadata.py` ghi các mục
  đó thành độ dài 0 để trình đọc không vỡ.
- [ĐO] Unity 2022.3.57f1 dùng metadata v31: typeDef 88 B (46224 kiểu), method 36 B (374781), image 40 B (195).
- `meta_names.py` ghi ra `types.txt` gồm mọi kiểu, trường, method và hằng. Kiểu của hằng nằm trong `.so`, nên giá
  trị hằng chỉ được đoán là chuỗi. Có khi đoán lố sang hằng kế bên, ví dụ `'soulKnightnSoulKnigh'` thật ra là `'soulKnight'`.
  `string_literals.txt` là bảng string literal (chỉ số, chuỗi).

### 5. `libil2cpp.so` (ARMv7): có bảo vệ

- [ĐO] Il2CppDumper 6.7.46 chạy tự động báo "This file may be protected", không tìm thấy CodeRegistration.
- [ĐO] Tìm tay theo mẫu cấu trúc.
  - `MetadataRegistration` ở VA `0xdfe1b3c`: có fieldOffsetsCount = typeDefinitionsSizesCount = 46224, types = 151486.
  - `CodeRegistration` ở VA `0xdd47268`: codeGenModulesCount = 195.
- [ĐO] Tên module (`"mscorlib.dll"`…): 136 tên để nguyên, 51 tên bị XOR 0x34 (kể cả NUL), 8 tên nằm trong một bảng
  mã hoá khác ở `.rodata 0x17603d4..`. Đã có `patch_il2cpp_so.py`, nhưng Il2CppDumper chế độ tay vẫn chết ở `Il2Cpp.Init`
  ("Source array was not long enough"). Mảng `.data` đầu (fieldOffsets, entropy 7.16) có vẻ cũng bị che.
- Vì vậy mới viết **`arm_method.py`** để đọc từng method, khỏi cần Il2CppDumper.
  - Địa chỉ method = `module.methodPointers[(token & 0xFFFFFF) - 1]`, lấy từ module mang tên `<image>.dll`.
  - Dịch ngược bằng capstone ở chế độ ARM (không phải Thumb). PC = địa chỉ + 8.
  - Theo đảo nhánh (`movw/movt ip; add ip, pc; bx ip`) để ra tên hàm đích.
  - Chú thích ô metadata-usage: giá trị `(loại<<29)|(chỉ số<<1)|1`, loại 5 là string literal.
  - [ĐO] Hàm nhạy cảm (ví dụ `CryptHelper.*`) có **thân hàm bị XOR 0x34 trong tệp**. Công cụ tự nhận ra: từ đầu
    XOR 0x34343434 ra `push` `e92d….`, và gỡ luôn.
  - Cách dùng: `python arm_method.py 'ConfigData..cctor'` hoặc `python arm_method.py --find 'Crypt'`.

### 6. `luban_config.ab`: đã gỡ được, 334 bảng

- [ĐO] Chuỗi gọi: `LubanConfigPrepareTask.BuildTables` → `CryptHelper.DecryptBytesToBytes(bytes, password, salt)`.
  - Hàm tạo `Rfc2898DeriveBytes(password, salt)`, mặc định 1000 vòng HMAC-SHA1. Lấy `GetBytes(32)` làm khoá và
    `GetBytes(16)` làm IV. `Rijndael.Create()` ở chế độ CBC. Đi qua `CryptoStream`.
  - `password = ConfigData.Key = "AZhenSoulKnightd@orz"`, đọc từ `ConfigData..cctor`.
  - `salt = ConfigData.keySalt`: mảng 14 byte `49 76 76 61 6e 20 4d 65 64 76 65 21 65 76` ("Ivvan Medve!ev", biến thể
    của muối mẫu "Ivan Medvedev"). Lấy ra từ `Field#137` → fieldRef → Il2CppType → `<PrivateImplementationDetails>`,
    kích thước theo `__StaticArrayInitTypeSize=14`.
- [ĐO] Bản rõ là một ByteBuf của Luban: `compactUint` 334, rồi mỗi bảng là `(string "module_tbname", bytes)`.
- [ĐO] Lược đồ lấy từ metadata và `.so`. Lớp `cfg.<Module>.<TbName>` có `_dataList` (List<Bean>) hoặc `_data`.
  - Các trường của bean đọc theo thứ tự khai báo (`<X>k__BackingField`), bỏ static/const/`*_Ref`.
  - Kiểu trường lấy từ bảng Il2CppType trong `.so`: int/long compact, float LE, string, List/Dictionary/HashSet,
    Nullable (1 byte cờ), T[], enum là int, bean lồng nhau.
  - Bean trừu tượng đọc `int __ID__` trước, rồi tới trường của lớp con.
  - **Cả 334 bảng đọc vừa khít số byte, không lỗi.**
- Đầu ra: `decoded/luban/<module>_<tbname>.json` (danh sách hàng), `_index.json` (lớp, số hàng), `raw/*.bytes`.
- Các bảng pha sau cần đọc:
  - **Chế độ mùa (Thoát khỏi Monkia)**:
    - `escape_tbescapeitemdatabase` (1239 vật phẩm: Id, NameKey, Weight, Value, Rarity, Type, MaxStackCount,
      MaxDurability, ConsumableEffectType, IconName, WeaponId)
    - `escape_tbescapelootentryconfig` (59 bể: ItemId, Probability, CountMin/Max, Durability)
    - `escape_tbescapechestconfig` (51 rương → bể + số lần rút)
    - `escape_tbescapeenemyspawnconfig` (59: prefab, bể vũ khí, HpMultiplier)
    - `escape_tbescapeshopitemconfig`, `escape_tbescapecraft*/upgrade*/identify*/designtable*`, `escape_tbescapewarehousecapacityconfig`
    - `task_tbescapetaskconfig` (38 nhiệm vụ: Checkers, phần thưởng, NpcId)
  - **Chiến đấu chung**: `game_tbskill` (189 kỹ năng AI: cd, gcd, hệ số sát thương, prefab),
    `game_tbaiattribute` (117: Hp, Armor, công, tốc, WeightedSkills), `level_tblevelenemy` (254),
    `leveldifficulty_tbldenemies` (3532), `game_tbweaponaffix`, `weaponupgrade_*`, `weapon_tbweapons` (826: Name, Level).
- [SUY] Game có hotfix IFix (`WrappersManagerImpl.IsPatched/GetPatch` ở đầu mọi hàm) và tải bản vá
  `patch_luban_config` hay `hot_update/runtime_lua` từ máy chủ. Số trong bundle là bản đóng gói 8.6.0, có thể cũ hơn bản vá đang chạy.

### 7. `runtime_lua.ab`: đã gỡ được, 252 tệp Lua nguồn

- [ĐO] Chuỗi gọi: `RuntimeLuaSourceLoader.DecryptSource` → `DESCrypt.Decrypt(source, GameConfigManager.SecretKey, "")`.
  - `DESCrypt` lấy 8 ký tự đầu của khoá (thiếu thì đệm `\0`). IV là `""` đệm thành 8 byte 0. Chạy
    `Convert.FromBase64String` rồi DES-CBC, đệm PKCS7.
  - `GameConfigManager.get_SecretKey` = `XORCrypt.Decrypt('*1"8ku|', '-PS`2AWO&')` (literal #3282, #5076), với
    `b[i] ^= ((i%15)*(i%5) & 0xFF) % 92 ^ key[i % len]`. Kết quả là `\x07`uQI4-`, nên khoá DES là `07 60 75 51 49 34 2d 00`.
- [ĐO] Đặc điểm đã đo trước khi gỡ, khớp với kết quả: kích thước sau base64 là bội của 8 (khối DES), không có khối
  trùng trong tệp (CBC), 85 tệp chung 32 byte đầu (IV cố định và cùng dòng mở đầu `local … = {}`).
- Đầu ra: `decoded/lua/app/{talent (118), buff (117), common, localization}/*.lua`, `framework/`, `config.lua`,
  `game.lua`, cùng `_index.json`. Thư mục talent và buff là mã thiên phú và buff chạy bằng Lua (KineticStrike,
  HealingBeam, ArcaneAmmo…), đọc được thẳng.

## Thử mà không ra (để lần sau khỏi lặp lại)

- Dò khoá từ string literal: thử 66k literal dài 4..64 byte (bản thô, MD5, SHA-256, MD5 hex) với AES-ECB/CBC trên
  luban, DES/3DES/Blowfish trên Lua. Tiêu chí là khối CBC thứ 2..5 in được hoặc bằng 0. **Không trúng**, vì khoá luban
  sinh qua PBKDF2 có muối, còn khoá Lua là chuỗi đã XOR.
- Trượt cửa sổ 8/16/24/32 byte qua 2.8 MB dữ liệu mặc định trong metadata (bước 4) với AES/DES/3DES: không trúng.
- Giải nén thử luban (zlib/deflate/gzip/lzma/bz2): đều thất bại, vì dữ liệu là bản mã chứ không phải bản nén.
- Il2CppDumper chạy tự động và chạy tay đều thất bại (xem mục 5). Đừng tốn thời gian vào đó nữa, dùng `arm_method.py`.
- Vùng literal 480..2527 của metadata vẫn còn mã hoá (khoá nằm trong phần bảo vệ lúc chạy). Chưa cần tới nó.

## Tệp trong thư mục này

| tệp | việc |
|---|---|
| `decode_config.py` | config.ab → CSV/JSON |
| `dump_localization.py` | localization.ab → bảng chữ 15 ngôn ngữ |
| `dump_mb.py` | đổ MonoBehaviour typetree của bundle bất kỳ, có đặt tên PPtr |
| `build_tables.py` | weapons/heroes/bullets/bosses.json + đối chiếu wiki |
| `decrypt_metadata.py` | gỡ lớp che global-metadata.dat |
| `meta_names.py` | kiểu, trường, method, hằng từ metadata |
| `patch_il2cpp_so.py` | gỡ XOR tên module trong .so (chưa đủ để Il2CppDumper chạy, giữ làm ghi chép) |
| `arm_method.py` | dịch ngược một method ARM, có chú thích literal và tên hàm |
| `luban_decode.py` | luban_config.ab → 334 bảng JSON |
| `decode_lua.py` | runtime_lua.ab → 252 tệp .lua |

## 8. Dump IL2CPP đầy đủ từ bộ nhớ (2026-09-30)

- [ĐO] Chạy game trên BlueStacks 5 (`Pie64`, có ARM, bật root trong `D:\BlueStack\BlueStacks_nxt\bluestacks.conf`:
  `bst.feature.rooting` và `bst.instance.Pie64.enable_root_access` = `"1"`). Cài bằng
  `HD-Adb install-multiple` ba APK trong xapk (giải ở `D:\sk86-apk`).
- [ĐO] Lúc game chạy, `/proc/<pid>/maps` có `libil2cpp.so` ở ba vùng và metadata đã giải mã ở một vùng
  `rw-s /dev/zero (deleted)` cỡ 53.907.456 byte (= metadata làm tròn trang). Dump bằng
  `su -c dd if=/proc/<pid>/mem bs=4096 skip=<đầu/4096> count=<…>`. Tính số khối trên máy chủ, vì shell 32-bit
  của Android tràn số khi tính `0xa170a000/4096`.
- [ĐO] Metadata trên bộ nhớ đã gỡ luôn 16 KB literal mà bản trên đĩa còn khoá (mục 4). Chỉ cần đặt lại header
  thành `AF1BB1FA` + phiên bản 31.
- [ĐO] Ghép ba vùng `.so` theo địa chỉ ảo, chèn số 0 vào khe, rồi chạy Il2CppDumper 6.7.46 (`ForceDump: true`,
  nhập địa chỉ gốc `a170a000`). Nó tự tìm ra `CodeRegistration af451268` (= gốc + `0xdd47268`, khớp mục 5) và ghi
  `dump.cs` (46.224 kiểu, có offset trường và RVA hàm), `il2cpp.h`, `script.json`, `stringliteral.json`, 196 DummyDll.
- Đầu ra ở `D:\sk86-ref\runtime\` (ngoài git): `skdump/` là bản dump thô, `libil2cpp_mem.so`, `global-metadata.dat`,
  `dump/`. Il2CppDumper ở `D:\sk86-ref\tools\Il2CppDumper`.
- Bẫy đã gặp:
  - Game tự sập (SIGSEGV, không có tombstone) khoảng 5 giây sau khi đóng bảng NOTICE, khi đang bật root. Đã tắt root
    và khởi động lại sạch để thử, nhưng chưa kịp kiểm xem hết sập chưa.
  - `adb reboot` làm treo máy ảo BlueStacks. Muốn khởi động lại thì `taskkill /F /T /IM HD-Player.exe` và `BstkSVC.exe`
    từ PowerShell (taskkill trong Git Bash không giết được).
  - Máy ảo chiếm khoảng 4,5 GB RAM. Chỉ bật khi cần dump lại, ví dụ sau khi game có bản vá mới.
  - Git Bash đổi `/sdcard/...` thành đường Windows khi gọi `adb pull`. Phải đặt `MSYS_NO_PATHCONV=1`.
