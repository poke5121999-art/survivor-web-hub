# Blockade Z: bản voxel (mặc định từ rev 20261114zb; hiện 20261114zc)

Trạng thái ngày 2026-11-15. Chưa commit, chưa push. Mọi thứ nằm trong worktree `D:\hub-bzvox` (tách khỏi `origin/main` 79786fb2, đã gồm bản sửa relink co-op 4a90e73f và nerf quái e381cc6c).

Voxel thay hẳn bản hộp: mở game là vào bản voxel, không còn nút bật tắt cho người chơi. `?vox=0` là lối lùi ẩn về bản hộp cũ (để gỡ lỗi và so ảnh); `destruct.js` chỉ còn phá nhà ở chế độ đó. Bậc voxel đi theo Cài đặt > Đồ hoạ > Chất lượng (low = 0,2 m; medium và high = 0,1 m); `?voxq=` ép bậc khi thử.

## Bàn giao 2026-11-15 (đọc trước)

- **Đã push:** a3f9a202 (bản voxel thay hẳn, rev 20261114zb, đang chạy trên Pages) và bản sửa test rev 20261114zc: `tools/smoke.js` kiểm "walker chồng lên mái" ở một mái thật của thị trấn mới (tìm bằng `roofspot.js`; bản hộp `vox=0` vẫn dùng mái trạm gác cũ). Nguyên nhân trượt 3/3: test đứng ở toạ độ trạm gác cũ (21, 4.5, -27), nay nằm trong trụ sở phường. Không phải lỗi gameplay: zombie vẫn chồng tháp lên tới mái cà phê 7,3 m (đỉnh 8,7 đến 11,25 m). smoke voxel 50/50 ba lần liền, smoke `vox=0` 50/50.
- **Quan sát chưa truy:** trong ba lần đó, ở bản voxel cuối bài chồng tháp chỉ còn 0 đến 1 walker sống và 0 đến 1 con đứng trên mái (bản hộp: 10 sống, 8 trên mái). Có thể zombie rơi chết hoặc bị mái hiên/dù hất khỏi mép; cần xem lại.
- **Chưa làm sau khi push zc:** chạy `BZ_BASE=https://poke5121999-art.github.io/survivor-web-hub node games/blockade-z/tools/smoke.js` khi Pages dựng xong (khoảng 70 giây sau push).
- **Việc tiếp:** các mục trong "Điểm yếu đã biết" bên dưới; ưu tiên zombie đứng lại ở thềm chung cư, vỏ mỏng (mái ngói, bồn nước) rơi nguyên mảng, chọn lại điểm đứng cho `stuck.js`, xếp lại 10 lô nhỏ bị bỏ, coop-test "boss chết bên khách" ở `vox=0`.

## Thị trấn: kiến trúc riêng, dựng bằng voxel

Không còn chuyển 1:1 sáu toà nhà hộp cũ. `js/vox/buildings.js` sinh cả quảng trường bằng code từ một seed bản đồ cố định (`MAP_SEED = 20261115`, mọi máy trong phòng ra cùng một thị trấn). Bộ sinh của Lab voxel (`games/voxel-lab/lib/build/`) là bộ đồ nghề gốc; phần thêm là của game này.

| Lô | Bộ sinh | Số lượng, biến thể | Chi tiết |
|---|---|---|---|
| Dãy nhà ống phía tây (TẠP HOÁ, CÀ PHÊ, PHỞ) | lab `tube-house` + `dressTube` | 4 căn, 4 biến thể (3 đến 5 tầng, 4 màu) | ban công lan can sắt, cửa cuốn hoặc mặt kính, mái hiên sọc, biển treo vuông góc, cục nóng điều hoà, dây phơi đồ, bồn nước inox và ăng-ten trên mái; trong nhà có sàn, cột, dầm, cầu thang |
| Dãy nhà ống phía đông | như trên | 3 căn | biển sơn của game treo ở mép ban công tầng một |
| Chung cư cũ | lab `apartment` | 1 (6 tầng, ban công xếp chồng) | hành lang, vách phòng, lõi thang |
| Chùa nhỏ | `pagoda` (mới) | 3 biến thể | nền đá có bậc, cột đỏ, hai tầng mái ngói góc cong, bàn thờ, lư hương, đèn đá, cổng tam quan |
| Trạm xăng | lab `gas-station` | 3 biến thể | mái che, trụ bơm, bồn và phuy xăng nổ dây chuyền |
| Trụ sở phường (hoặc trường) | `office` (mới) | 3 biến thể | tường vàng, cửa chớp xanh, hiên cột, mái ngói bốn mái, cột cờ đỏ sao vàng, hàng rào sắt, bảng tin; trong có hành lang, bàn ghế, cầu thang |
| Chợ | `market` (mới) | 3 biến thể (mái bốn mái, mái hai tầng có lá sách, mái tôn có trán tường) | nhà lồng trống bốn phía, cột, dầm, sạp hàng, thúng, bạt sọc, đèn treo |
| Cà phê góc phố | `cafe` (mới) | 3 biến thể | sân hiên lát gạch có bàn, ghế nhựa, dù, bồn cây; mặt kính, quầy, cầu thang, ban công tầng trên |
| Nhà gạch mái ngói | lab `brick-house` | 3 căn | |
| Kho | lab `warehouse` | 1 | khung thép, cửa lớn |
| Tháp nước | lab `water-tower` | 1 | |
| Đồ phố | `poles`, `motorbike`, `kiosk`, `stools` (mới) + lab `lamp-post`, `tree`, `car`, `barrels` | 2 cụm cột điện dây chằng chịt, 8 xe máy, 4 quầy/xe đẩy, 3 bộ bàn ghế nhựa, 4 cột đèn, 4 cây, 3 ô tô, 2 cụm phuy | vật nhỏ nào chồng lên nhà hay lên vật nhỏ đặt trước nó thì tự bỏ (hiện 10 trên 58 lô bị bỏ: 5 cây, 2 cột điện, 3 ô tô; cần xếp lại chỗ) |
| Giữ từ bản hộp, chuyển sang voxel | `world.js` giao hộp | tường bao 20 vùng, 4 cổng, tượng đài, bao cát, 2 xe tăng, trực thăng rơi, gạch vụn quảng trường | màu lấy từ texture của game |

Luật chơi giữ nguyên: cùng diện tích, bốn cổng và bốn đường vào, quảng trường trống ở giữa, lưới đường đi dựng lại từ voxel, co-op bằng lệnh khoét.

Số liệu (medium, 0,1 m): 81 vùng, 5,53 triệu voxel (nhà và đồ phố 3,92 triệu; tường và xác xe 1,62 triệu), khoảng 125 nghìn mặt chữ nhật, 34 nghìn hộp va chạm, dựng xong trong 3,5 đến 6,7 giây lúc tải (lâu nhất khi máy đang chạy test khác). Bậc low (0,2 m): nhà và đồ phố còn 672 nghìn voxel.

## Cách chạy (js/vox/town.js)

- Mỗi vùng (một toà nhà, một đoạn tường, một cái xe...) là một thế giới voxel-lab riêng, lưới vừa đủ. Vùng chưa bị đụng là **một mesh gộp tĩnh** và không mô phỏng. Bị bắn hay nổ thì chỉ những chunk đổi mới tách khỏi mesh gộp thành mesh sống, và vùng đó tick cho tới khi yên rồi ngủ lại.
- Mảnh rơi chạm đất mạnh thì bị cắt theo các mặt phẳng lởm chởm thành cục (shatter); mặt cắt không bao giờ xẻ dọc bề dày tường. Cục dưới 12 voxel và chính vết cắt thành gạch vụn. Bụi sập giảm khoảng 60 % (một lần mỗi 0,22 giây, alpha 0,5), khói nổ giảm 30 %.
- Va chạm: cột 0,2 m thành hộp cho `world.js` (đổi cả vùng một lần bằng `swapSolids`), lưới đường đi dựng lại. Đống gạch vụn dưới 1,3 m không chặn lưới; zombie kẹt 1,5 giây quanh chỗ đổ nát thì được nhấc lên đống gạch (`climbAssist`).
- Co-op: lệnh `[loại, x, y, z, r, lực, bước, vùng, fx]`; khách chạy lại theo bước của từng vùng; mỗi giây chủ phòng gửi digest một vùng đã yên để đối chiếu. **Bậc voxel của chủ phòng là bậc của cả phòng**: khách khác bậc thì dựng lại thị trấn theo bậc chủ phòng ngay khi nhận gói đầu.
- Phuy và bồn xăng (vật liệu `fuel` của lab) nổ dây chuyền trong sim; trên máy chủ phòng mỗi vụ gọi thêm vụ nổ của game để gây sát thương.

## Nhân vật, quái, boss, vũ khí (voxel hết)

13/13 nhân vật (cả dạng Sói), 14/14 loại zombie và quái (walker, runner, flyer, brute, spitter, bloater, hound, shielder, armored, shrieker, burner, frost, spider, egg), 11/11 boss, tay và vũ khí ở cả góc nhìn thứ nhất lẫn thứ ba. Zombie và boss bị khoét đúng chỗ trúng, chết thì rã thành khối. Ảnh: `.vox-shots/all/chars/sheet-heroes.png`, `sheet-zombies.png`, `sheet-bosses.png`, `sheet-weapons.png` (mỗi ô: hộp cũ | voxel).

## Kết quả đo (máy HOB-THOR, Chrome headless, GPU d3d11)

Khung hình với 32 walker (ms quanh tick + draw + `gl.finish`), thị trấn mới:

| Màn | Bậc | Hộp (`vox=0`) | Voxel |
|---|---|---|---|
| 1280x720 | low | 3,3 đến 3,7 ms | 6,4 ms |
| 1280x720 | medium | 4,1 đến 4,5 ms | 6,1 đến 6,9 ms |
| 390x844 | low | 3,0 đến 4,4 ms | 4,8 đến 6,2 ms |
| 390x844 | medium | 4,4 đến 4,9 ms | 7,8 đến 8,5 ms |

Số voxel lấy từ lần chạy một mình và lần chạy chung máy với một trình duyệt test khác (lần chạy chung có một mẫu low 1280x720 lên 8,3 ms). Tam giác medium khoảng 510 nghìn (nội thất nhà), low khoảng 110 nghìn. Chưa đo trên điện thoại thật, chưa đo SwiftShader với thị trấn mới.

Bộ test, đếm dòng PASS/FAIL thật của lần chạy cuối trên code cuối (không test nào tự bỏ qua; `stuck` không in PASS mà in số con kẹt):

| Test | Voxel (mặc định) | Hộp (`vox=0`) |
|---|---|---|
| smoke | 50/50 | 50/50 |
| zoo | 22/22 | 22/22 |
| kits | 53/53 | 53/53 |
| tps | 18/18 | chưa chạy lại |
| stuck | 0 con kẹt ở 5 điểm đứng (xem điểm yếu) | chưa chạy lại |
| bosses | 80/80 | chưa chạy lại |
| castanim | 40/40 | chưa chạy lại |
| weapons | 56/56 | chưa chạy lại |
| destruct (hộp) | không áp dụng | 27/27 |
| voxdestruct (mới, thay destruct ở bản voxel) | 21/22 ở lần chạy cuối (1 trên 1024 mẫu có zombie chờm vào hộp voxel trong nửa giây, 0 con kẹt); 22/22 ở lần ngay trước đó, cùng `town.js`, trước khi dời xe máy và cột điện | không áp dụng |
| voxcoop | 8/8 ở cả ba cặp bậc: medium/medium, chủ medium + khách low, chủ low + khách medium (cặp medium/low chạy lại sau lần dời đồ phố: 8/8) | không áp dụng |
| coop-test (BroadcastChannel) | 17/17 (hai lần cuối; lần đầu trượt "boss chết bên khách") | 16/17 hai lần liền, cùng trượt "boss chết bên khách" |
| coop-relink (Unity Relay thật) | 3/3 | chưa chạy |

Lần sửa code cuối cùng là dời chỗ xe máy, cột điện, bàn ghế trong `buildings.js`; sau đó chỉ chạy lại smoke (50/50), zoo (22/22), voxdestruct, voxcoop medium/low. kits, tps, stuck, bosses, castanim, weapons, coop-test, coop-relink và mọi test `vox=0` chạy trước lần dời đó (bosses, castanim, weapons còn trước cả hai lần thêm rồi gỡ một nhánh `climbAssist` trong `town.js`). Không có lỗi console trong các lần chạy trên.

Test đã sửa cho đúng với bản voxel, không nới điều kiện:
- `destruct.js` chạy cố định `vox=0`; `voxdestruct.js` kiểm phần tương đương ở bản voxel (khoét tường, đạn xuyên lỗ, kính vỡ, nhà sập thành cục, gạch vụn thành va chạm, zombie vượt đống đổ, phá tường bao, xe không bị xoá sạch, phuy nổ, biển rơi theo tường, ván mới dựng lại).
- `smoke.js`: chỗ chạy tường của Bóng dời sang tường bao phía tây (toà nhà cũ không còn). `tps.js`: vòng 40 điểm kiểm camera bỏ những điểm rơi vào trong nhà, đòi ít nhất 12 điểm trống. `roofspot.js` (kits): mái phải phẳng hơn một mét sau mép. `bosses.js`: mảnh voxel của xác boss kiểm lúc 4 giây như mảnh hộp. `coop-test.js`: bật GPU, "mảng tường vỡ giống nhau" đổi thành "cùng digest voxel", "xác đang ngã" đổi thành "xác rã thành mảnh voxel".

Đường đi: sau khi phá sập một căn nhà ống, 16 walker tới được người đứng trên đống đổ, 0 con kẹt 3 giây quanh đó, 0 đến 1 trên 1024 mẫu chờm vào hộp voxel. Sau khi phá gần hết thị trấn (502 lệnh, `voxtown.js`, trước lần dời đồ phố): 36 con ở bốn cổng, 0 con kẹt 3 giây ở cuối, đứng yên lâu nhất 2 giây, 0/2592 mẫu trong tường; nhưng ở điểm đứng cuối (giữa đống đổ dày) trường đường đi chỉ tới được 3 ô, zombie tới gần bằng đường thẳng và leo đống gạch, chỉ 26 mẫu chạm tới người chơi.

## Ảnh

- Thị trấn mới, mỗi hàng hộp cũ | voxel cùng máy quay: `.vox-shots/all/town/sheet-town-1.png`, `sheet-town-2.png`, `sheet-town-3.png` (ảnh lẻ `<tên>-box.png`, `<tên>-vox.png`).
- Phá huỷ từng lô (hộp cũ cùng góc | nguyên | sau lựu đạn | đang sập | sau khi sập): `.vox-shots/all/sheet-<tên>.png` và tổng hợp `.vox-shots/all/overview-A.png` tới `overview-D.png`.
- Nhân vật: `.vox-shots/all/chars/`.

## Điểm yếu đã biết

- Zombie đi vào được trong nhà qua cửa thật (cà phê, trụ sở, chung cư) và đôi khi đứng lại ở bậc thềm hay góc hẹp xa chỗ đánh nhau: trong `voxdestruct` có 1 trên 16 con đứng yên hơn 3 giây ở trước chung cư; luật đưa về cổng của game sẽ nhặt con đó, nhưng chưa có sửa gốc. Lưới đường đi 1 m không biết độ cao.
- `stuck.js` đứng ở toạ độ của bản đồ cũ: ở bản voxel bốn trên năm điểm cho 0 mạng hạ (điểm rơi vào nhà hoặc mái), nên con số "0 kẹt" ở đó ít ý nghĩa. Cần chọn lại điểm đứng.
- Cửa bản lề của bản hộp không còn; nhà mới có ô cửa trống, cửa cuốn và kính (phải bắn vỡ).
- Phuy xăng nổ: sát thương chỉ tính trên máy chủ phòng; khách thấy hiệu ứng.
- Bậc low: dây điện và vài chi tiết 1 voxel bị đứt đoạn sau khi gộp 2x2x2 (mảnh lơ lửng tới khi có gì chạm vào).
- Sau khi phá gần hết thị trấn: 86 nghìn hộp va chạm, 3,46 triệu tam giác, 2174 lệnh vẽ (gạch vụn không gộp mặt được, chunk đã vỡ không gộp lại vào mesh tĩnh); chưa đo khung hình ở trạng thái đó.
- Chung cư, mái che trạm xăng và mái chợ không sập khi nổ một vòng quanh chân (khung bê tông và hàng cột giữa còn đỡ); nhà ống, chùa, trụ sở, cà phê, kho thì sập thành cục và gạch vụn.
- Vỏ mỏng vẫn có lúc rơi xuống còn gần nguyên mảng: mái ngói bốn mái của nhà gạch (nằm nghiêng nguyên tấm) và bồn tháp nước (lăn ra nguyên bồn). Luật cắt của `shatter` chỉ cắt nơi vật liệu chạy dài quá 5 voxel qua mặt cắt nên bỏ qua vỏ dày 2 voxel; chưa sửa. Khung "đang sập" trong ảnh còn mù khói vì 20 đến 30 quả rocket nổ liền nhau.
- Sổ cái voxel lệch vài voxel sau một trận sập lớn (lần đo: -4 trên khoảng 200 nghìn voxel dịch chuyển); không ảnh hưởng digest co-op.
- DDA của lab lệch một voxel khi tia có thành phần đúng bằng 0; `town.js` đã né bằng 1e-12, lab chưa sửa.
- coop-test "boss chết bên khách" chập chờn theo thời gian chờ 1,2 giây (trượt 1/3 lần ở voxel, 2/2 lần ở hộp); chưa truy gốc, chưa so với `origin/main` sạch.
- Vũ khí góc nhìn thứ nhất khác bản hộp rất ít (thân súng vốn đã là khối); bàn tay là voxel.
- Chưa chạy: `balance`, `meta`, `ui`, `phone`, `dirs`, `strings`, điện thoại thật, Pages.

## Lệnh

```sh
export PLAYWRIGHT_PATH="C:/Users/tamph/.cache/pw-node/node_modules/playwright-core"
cd /d/hub-bzvox
node games/blockade-z/tools/voxviews.js            # ảnh thị trấn hộp | voxel -> .vox-shots/all/town
node games/blockade-z/tools/voxtown.js             # ảnh phá huỷ từng lô + kiểm đường đi -> .vox-shots/all
node games/blockade-z/tools/voxchars.js            # ảnh nhân vật, quái, boss, vũ khí -> .vox-shots/all/chars
node games/blockade-z/tools/voxdestruct.js         # phá huỷ ở bản voxel
HOSTQ=medium GUESTQ=low node games/blockade-z/tools/voxcoop.js   # co-op, khác bậc
node games/blockade-z/tools/voxperf.js             # ms/khung, hộp và voxel
for t in smoke zoo kits tps stuck bosses castanim weapons coop-test coop-relink; do node games/blockade-z/tools/$t.js games/blockade-z/.vox-shots/chk/$t; done
BZ_QUERY="autostart=1&nolock=1&seed=7&vox=0" node games/blockade-z/tools/smoke.js   # bản hộp; zoo/kits/bosses/coop-test dùng BZ_EXTRA="&vox=0"
node .vox-shots/tmp/plan.mjs                       # (trong games/blockade-z) liệt kê lô, đếm voxel, kiểm chồng lấn và phần lơ lửng
```

File chính: `js/vox/boot.js` (công tắc), `js/vox/buildings.js` (kiến trúc và sơ đồ lô), `js/vox/town.js` (vùng, mesh gộp, sim, va chạm, co-op), `js/vox/voxelize.js` + `js/vox/zombie.js` (nhân vật, quái, boss), `js/world.js` (bỏ sáu nhà hộp khi voxel bật, giao tường bao và xác xe).
