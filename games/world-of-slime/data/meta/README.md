# data/meta: bảng meta thật của server

`[ĐO TRONG REPO]` Các tệp `<type>.json` là hàng thật do server World of Slime gửi xuống (`MetaSyncManager`), lấy từ đệm đĩa
của bản demo sau khi chủ dự án chơi thử (2026-10-21): `D:\wos-ref\server-cache\live\StandaloneWindows64\meta_<type>_en.json.gz`.
Đổi bằng `py -3.12 -I games/world-of-slime/tools/import_meta.py` (chép nguyên hàng, chỉ bỏ khoảng trắng). Chạy lại ra tệp giống hệt.

| Tệp | Hàng | Nội dung |
|---|---|---|
| `action_type.json` | 419 | hành động (subActions: Attack, delay, motionCategory) |
| `attack_type.json` | 610 | đòn đánh (rangeType, targetMask, sát thương) |
| `buff_type.json` | 49 | buff (stackType, passiveEffects) |
| `district_type.json` | 20 | vùng (bgmResource, weathers, parentDistrictId) |
| `item_type.json` | 660 | vật phẩm (itemCategory, rare, options Sellable/Ownable...) |
| `monster_market_type.json` | 4 | chợ slime |
| `perk_type.json` | 22 | perk |
| `quest_group_type.json` | 96 | nhóm nhiệm vụ (questTypeIds) |
| `skill_type.json` | 187 | kỹ năng (castType, coolTimeMillis, actionTypeIds) |
| `visual_effect_type.json` | 16 | hiệu ứng (effectResource, effectSoundResource) |

Chữ chỉ là **TextId** (`ItemType.1.name`, `SkillType.26.description`...): chuỗi hiển thị không có trong đệm, cũng không có
trong `D:\wos-ref\data\loc\` (bảng đó chỉ là chuỗi giao diện). Một vài trường `description` trong buff/perk là ghi chú
tiếng Hàn của nhà làm game, không phải chữ cho người chơi. Đệm chỉ có bảng của bản tiếng Anh (`_en`), phiên bản ghi trong
`meta_<type>_en_ver.txt`. Không có bảng monster/quest/npc trong đệm này.
