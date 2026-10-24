# Chuyến Buôn Xác Sống (The Walking Trade, lát cắt vòng quán)

Bản Unity WebGL chơi được của vòng quán lõi trong *The Walking Trade* v1.1.13 (Microwave Games, Unity 6000.0.58f2).
Một ngày gồm bốn bước. Sáng mua hàng của thương nhân và đặt giá. Mở quán thì khách vào xem kệ, mang món ưng ra quầy, người chơi bấm thu pin. Sau 19:00 đóng quán đi ngủ. Màn tổng kết hiện ra, rồi sang ngày mới với hàng mới.

## Nguồn và bản quyền

- Mã nguồn Unity nằm **ngoài git**, ở `D:\walking-trade-ref\twt-webgl`. Có ba tệp: `Assets/Scripts/TwtGame.cs` chứa luật, ngày và khách; `Assets/Scripts/Ui.cs` dựng uGUI bằng code; `Assets/Editor/BuildTWT.cs` tạo scene một GameObject rồi build WebGL.
- Bản decode của game gốc ở `D:\walking-trade-ref` (README ở đó). Luật đọc từ C# phục hồi trong `il2csharp-out-linux/Runtime/Runtime`.
- **Không ship một sprite, âm thanh hay mô hình nào của game gốc.** Hình là khối màu và chữ. Font Be Vietnam Pro (OFL) chép từ `games/soulknight/art/ui/fonts`.
- Tên món và giá gốc là dữ liệu, lấy từ `D:\walking-trade-ref\twt-goods.json`, tức `ItemData._value` của 193 món bán được. Bản này dùng 30 món, nhãn tiếng Việt do mình đặt.

## Luật lấy từ decode `[ĐO TRONG REPO]`

Đường dẫn tính từ `D:\walking-trade-ref\il2csharp-out-linux\Runtime\Runtime\`.

| Luật | Giá trị | Nguồn |
|---|---|---|
| Giờ bắt đầu ngày | 05:00 | `GameScene.unity` TimeManager `_startHour: 5` |
| Ngủ được từ | 19:00, và quán phải đóng | `Item/BedObject.cs` `EarliestSleepHour = 19` |
| Đồng hồ đứng khi quán đóng | có (tuỳ chọn lưu) | `Day/TimeManager.cs:407` |
| Nhịp khách | `(150 − repNorm·115) ± 10%` phút game, `repNorm = (uy tín+100)/200` | `Events/CustomerEventsManager.cs:500` |
| Điểm giá | `r = giá / giá gốc`. Dưới 1,15 là món hời, điểm `(1+2,5(1−t))²`. Từ 1,15 tới trần 2,25 điểm `(1−(r−1,15)/1,1)²`. Trên 2,25 khách không lấy | `Mob/Actions/PricingPurchaseConsideration.cs` |
| Đủ tiền | `giá ≤ 0,99 × ví`. Món muốn mua (desire ≥ 1,2) có thể nâng ví một lần, xác suất `repNorm` | `Mob/Actions/AffordabilityGatePurchaseConsideration.cs` |
| Có mua không | `w/(w+0,7)`, một lần gieo | `Mob/Actions/BrowseMobActionState.cs:2010` |
| Thời gian xem kệ | 2,5–4 s | `BrowseMobActionState.cs:41` |
| Chờ ở quầy | 30 s rồi bỏ về | `Mob/Actions/CheckoutMobActionState.cs:31` |
| Uy tín mỗi khách được phục vụ | +0,01 | `CheckoutMobActionState.cs:32` |
| Giá bán đặt theo loại món, mặc định bằng giá gốc | `_markedPrice` | `Item/ItemData.cs:43, 317` |
| Thương nhân mỗi ngày | mỗi món 1–5 cái, hệ số giá 1,0 | `Shop/ShopItemEntryData.cs`, `Shop/Shop.cs:126` |

## Số tự đặt `[ĐỀ XUẤT]`

Decode không có các số này, hoặc bản build gốc giấu đi. Cả năm số đánh dấu `INVENTED` trong `TwtGame.Rules`.

- **Tốc độ đồng hồ là 10 phút game mỗi giây.** Bản gốc chạy 800 s cho 24 giờ, tức 1,8 phút mỗi giây. Bản này nhanh hơn để một ngày mở quán chỉ mất khoảng 84 s.
- **Ví khách `6..44 + 4·ngày` pin.** Bản gốc đọc ví từ pin của mob, không thấy số khởi tạo.
- **Desire gốc mỗi món `0,6..1,6` ngẫu nhiên.** Bảng desire theo loại món bị mất trong decode. `t` trong công thức món hời lấy `r/1,15`, vì bản decompile giấu hàm làm mượt.
- **30 pin khởi đầu và vài món trong kho.** Asset ghi `_startValue: 0`, còn tutorial cho gì thì chưa tìm ra.
- **Mỗi buổi sáng thương nhân bày 6 món.** Bản gốc có nhiều landmark trên bản đồ thế giới, mỗi cái một danh sách hàng.

Bản này chưa có: khách bán đồ cho người chơi (mặc cả), khách bị thương, nhân viên, cây kỹ năng.

## Raid (thủ quán) `[ĐO TRONG REPO]`

Spec đọc từ decode: `RaidManager.cs`, `RaidWave.cs`, prefab zombie (`Damageable._maxHealth`, navigator `_defaultSpeed`), `*WeaponData.asset`, `*AuthoredRaidDefinition.asset`. Số đo đầy đủ ở phiếu spec (ngoài repo): `D:\walking-trade-ref` nhánh điều tra, file `RAID-SPEC.md`. Logic trong `TwtGame.cs` vùng `// ---------- raid`.

| Luật | Giá trị | Nguồn |
|---|---|---|
| Raid đầu | ngày 3 (ngày hiện tại + 2) | `RaidManager` GetDelayDaysForScheduling |
| Các raid sau | mỗi 4 ngày | `Random.Range(4/F, 5/F)`, F=1 |
| Giờ raid | 09:30 | `RaidManager.cs:1348` |
| 5 raid thiết kế sẵn | 48 / 46 / 58 / 61 / 243 xác, chia 5/5/5/3/3 đợt | `*AuthoredRaidDefinition.asset` |
| Máu người chơi | 100, hồi sinh 50% | `PlayerObject._maxHealth` |
| Xác thường/Tumour | 100 máu, 3,5 m/s, đòn 25, cd 2 s | prefab Damageable/navigator |
| Hulking | 750 máu, 3,0 m/s, đòn 150, cd 5 s | prefab |
| Boss Brute/Birther/Charger/Twins | 4000 / 2500 / 10000 / 4000 máu | prefab |
| Vũ khí (vài món) | Dao 70/0,5s · Cung 45/0,4s · Cờ lê lưỡi dao 50/0,4s · Búa 22/0,75s | `*WeaponData.asset` |
| Thắng | dọn hết đợt cuối → loot (item) | `Raid.OnAllMobsDespawned`, `RaidRewardGenerator` |
| Thua | người chơi chết → mất 10–20% pin, quán đóng, hồi sinh | `GameController.OnDeadPlayerStateEntered` |

Số tự đặt cho bản web `[ĐỀ XUẤT]` (đánh dấu trong `TwtGame.cs`): 8 hướng vào + 10 barrier gốc rút thành xác tràn từ bên phải; bảng loot gốc (Pills, Nail Bomb, Grenade…) rút thành +3 món sẵn trong kho; vũ khí "Tay không" mặc định khi kho không có vũ khí; nhịp spawn và tỉ lệ px/mét cho sân schematic; raid kết thúc là sang thẳng tổng kết (bản gốc cho mở lại quán sau raid). Boss hiện là khối máu cao, chưa có cơ chế riêng (đẻ con, lao, chia máu đôi).

Cách chơi: buổi sáng ngày raid có cảnh báo — mua vũ khí ở thương nhân. Vào raid, chạm vũ khí để cầm (ưu tiên DPS cao), chạm xác sống để đánh; vũ khí cận chiến chỉ với tới xác đã lại gần quầy, cung bắn được từ xa.

## Build và đẩy lên hub

```
"C:\Program Files\Unity\Hub\Editor\6000.0.77f1\Editor\Unity.exe" -batchmode -quit -nographics -projectPath D:\walking-trade-ref\twt-webgl -executeMethod BuildTWT.Build -logFile D:\walking-trade-ref\logs\build.log
node games/walking-trade/tools/import-build.js
```

- Một lần build mất khoảng 4 phút trên máy này, gần hết là bước emscripten. Đừng chạy hai build cùng lúc.
- `import-build.js` chép bốn tệp vào `Build/`, đặt tên theo hash nội dung, rồi sửa dòng `var BUILD` trong `index.html`. Đổi bản build thì tăng `rev` ở `data/games.js`.
- Nén Brotli kèm `decompressionFallback`, nên Pages phục vụ tệp `.unityweb` không có `Content-Encoding` vẫn chạy được.

## Kiểm

```
node test/walking-trade-play.js
TWT_URL=https://poke5121999-art.github.io/survivor-web-hub node test/walking-trade-play.js
TWT_LANDSCAPE=1 node test/walking-trade-play.js
```

Bài test bấm chuột thật lên canvas và chơi trọn một vòng: mua hàng, mở quán, thu pin ở quầy, chờ tới 19:00, đi ngủ, xem tổng kết, sang ngày 2. Nó biết bấm đâu là nhờ `window.__twt`. `TwtGame.Publish` ghi trạng thái và toạ độ mọi nút ra đó, 4 lần mỗi giây.

## Bẫy đã sập

- **Thiếu `com.unity.ugui`.** Project tạo bằng `-createProject` không kèm uGUI, nên build báo `UnityEngine.UI does not exist`. Phải thêm `"com.unity.ugui": "2.0.0"` vào `Packages/manifest.json`.
- **Test bấm trượt cú đầu.** Lần đăng `window.__twt` đầu tiên chạy trước khi `CanvasScaler` co canvas theo màn hình. Toạ độ nút khi ấy còn ở đơn vị gốc 720x1280: trên màn 390 px, nút rộng 103 px được báo thành 190. Test bấm trúng toạ độ ấy, tức trượt ra ngoài nút. Lúc đầu mình đổ cho splash "Made with Unity" và cho việc Unity mất input. Cả hai đều sai: chờ 3 giây thì bấm trúng, so toạ độ hai thời điểm mới ra lệch. Giờ `Publish` chạy trong `LateUpdate` và bỏ hai khung đầu. Splash vẫn tắt (`PlayerSettings.SplashScreen.show = false`), vì nó che game vài giây lúc mở.
- **License batchmode.** Log có dòng `Access token is unavailable`, nhưng ngay sau đó là `Successfully resolved entitlement details`, và build vẫn chạy khi Unity Hub tắt. Dòng ấy chỉ là cảnh báo.
