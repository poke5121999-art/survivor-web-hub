# Blockade Z: bản thử voxel (`?vox=1`)

Trạng thái ngày 2026-11-14. Chưa commit, chưa push. Mọi thứ nằm trong worktree `D:\hub-bzvox` (tách khỏi `origin/main`).
Không có cờ thì game chỉ tải thêm một file nhỏ `js/vox/boot.js` và chạy y như cũ.

## Đã làm

| Phần | File | Ghi chú |
|---|---|---|
| Công tắc, nạp module | `js/vox/boot.js` | `?vox=1`, `?voxq=low\|medium\|high`, `?voxhero=<id>` (mặc định `mua`), `?voxz=<loại>` (mặc định `walker`); tắt từng phần: `voxpost`, `voxaudio`, `voxanim`, `voxfx`, `voxui`, `voxstreet` `=0` |
| Voxelizer, material, bể mảnh vụn | `js/vox/voxelize.js` | hộp + texture pixel thành lưới voxel (mặt nào lấy texel mặt đó, ruột là thịt/xương với zombie, màu hộp với nhân vật), greedy mesh có AO theo đỉnh, shader thêm vát cạnh từng voxel + lệch màu từng voxel + voxel phát sáng |
| Nhân vật | hook trong `js/heroes.js` | Mưa Đạn, 1/32 m (1 texel = 1 voxel), gắn trên khung xương cũ; đuôi khăn tách ra gắn lò xo |
| Zombie | `js/vox/zombie.js` | walker; cùng loại dùng chung geometry từng bộ phận, trúng đạn mới có bản riêng; khoét voxel đúng chỗ trúng, mất voxel khớp thì rụng chi, chết thì rã thành khối rơi, nằm, mờ dần |
| Dãy phố | `js/vox/street.js` | dãy 3 nhà phố (shophouse) dựng lại trong engine voxel-lab: 0,1 m/voxel (235 491 voxel), bậc low 0,2 m (32 498 voxel). Đạn khoét, nổ khoét, mất chân đỡ thì sập, gạch vụn chất đống. Màu lấy từ chính texture của game |
| Va chạm, đường đi | `js/vox/street.js` + hook `js/world.js` | cột 0,2 m thành hộp va chạm (làm lại tối đa 0,35 giây một lần), `rebuildGrids`, tia đạn dò đúng voxel |
| Co-op | `js/vox/street.js` + 2 dòng `js/coop.js` | chủ phòng gửi lệnh `[loại, x, y, z, r, lực, bước]`; khách chạy lại đúng bước; vào muộn thì xin lại nhật ký lệnh |
| Post, bóng mềm | `js/vox/post.js` | skill fps-high-quality (Saltline, Felix Rieseberg): PCSS, AO nửa độ phân giải, bloom, thích nghi sáng, grade, grain; mỗi pass một công tắc `voxao/voxbloom/voxexp/voxgrade/voxgrain/voxpcss=0` |
| Hiệu ứng | `js/vox/fx.js` | số liệu Saltline áp tay (tool port không chạy được trên three r160): mảnh voxel, bụi, tia lửa, decal, chớp nổ, rung máy quay, tracer, lửa nòng |
| Âm thanh | `js/vox/audio.js` | audio của voxel-lab: tiếng va theo vật liệu, tiếng gạch vụn, lớp nổ; đi qua âm lượng trong Cài đặt |
| Chuyển động | `js/vox/anim.js` | kỹ thuật Lanternfall (loktar00): chân trụ ghim đất + IK 2 khúc, nhún hông theo bước, đòn vồ có lấy đà, lò xo cho phần lỏng |
| UI | `js/vox/ui.js` | nút góc ở màn tiêu đề/tạm dừng (bật/tắt voxel, chọn bậc), dấu trúng đích/đầu/hạ gục |
| Tool | `tools/voxshots.js`, `tools/voxcoop.js`, `tools/voxperf.js` | ảnh trước/sau, kiểm co-op, đo khung hình + kiểm đường đi |

File cũ bị sửa (chỉ thêm hook, đều chặn bằng cờ): `index.html` (+1 thẻ script), `js/main.js` (4 chỗ), `js/heroes.js` (3), `js/zombies.js` (2), `js/world.js` (9), `js/coop.js` (2).

## Kết quả đo (máy HOB-THOR, Chrome headless)

Ảnh ghép trước | sau: `.vox-shots/sheet-hero.png`, `sheet-zombie.png`, `sheet-street.png` (ảnh lẻ ở `.vox-shots/before`, `.vox-shots/after`).

Khung hình với 32 walker (ms mỗi khung quanh tick + draw + `gl.finish`, GPU d3d11; fps headless bị khoá ~68 nên không phân biệt được):

| Màn | Bậc | Không vox | Có vox |
|---|---|---|---|
| 1280x720 | low | 2,8 ms | 4,4 ms |
| 1280x720 | medium | 4,1 ms | 5,1 ms |
| 390x844 | low | 2,5 ms | 4,2 ms |
| 390x844 | medium | 3,3 ms | 5,4 ms |

Tam giác: medium 66 nghìn thành 259 nghìn; low 31 nghìn thành 61 nghìn. SwiftShader 390x844 low (cận dưới, ba lần đo, nhiễu): không vox 3,0 đến 3,9 fps, có vox 0,6 đến 3,6 fps.

Đường đi sau khi bắn sập mặt tiền (24 walker, 8 giây): 0 con kẹt 3 giây, 0/384 mẫu nằm trong tường voxel.

Co-op (`tools/voxcoop.js`, 2 trang, BroadcastChannel): 7/7 PASS; 17 lệnh, cùng bước 562, cùng digest, cùng số voxel; cả lịch sử 552 byte.

Bộ test cũ, không cờ (đếm dòng PASS/FAIL thật, không có test nào tự bỏ qua): smoke 50/50, zoo 22/22, kits 53/53, destruct 27/27, tps 18/18, stuck 5 điểm đứng, 0 con kẹt. Smoke chạy thêm với `vox=1`: 50/50. Không có lỗi console ở cả hai chế độ.
Chưa chạy: `bosses`, `castanim`, `weapons`, `coop-test` (bản gốc), `balance`, và mọi thứ trên điện thoại thật / trên Pages.

## Điểm yếu đã biết

- Tầng trên sập xuống thành nguyên khối còn khá lành (engine voxel-lab chỉ có stress cấp 1); chưa vỡ vụn như mong muốn.
- Host và khách khác bậc voxel (0,1 m và 0,2 m) thì lưới khác nhau, digest sẽ lệch. Cần ép cả phòng theo bậc của chủ phòng.
- Lửa lan của voxel-lab đang tắt; biển hiệu vẫn là hộp thường (rơi khi tường sau nó mất); cửa kính sáng thành voxel phát sáng, vỡ dở trông lốm đốm.
- Tay cầm súng, ngón tay, súng, gốc chi cụt của zombie vẫn là hộp cũ. Mảnh chi văng ra (`G.fx.gib`) mất vát cạnh vì material bị clone.
- Phần mềm (SwiftShader) chậm hơn bản gốc tới 4 lần; chưa đo trên điện thoại thật.
- Hộp va chạm theo cột 0,2 m: đống gạch thấp hơn 0,2 m đi xuyên qua; sau một trận phá lớn có ~2500 hộp.
- Nút vox không bấm được khi điện thoại cầm dọc (lớp `#rotate` của game che).
- Tắt "bloom" trong Cài đặt là tắt cả chuỗi post của vox.

## Làm tiếp

1. Chủ dự án xem ba ảnh ghép rồi quyết có chuyển cả game hay không.
2. Nếu chuyển: 12 nhân vật còn lại chỉ cần bỏ điều kiện `BZ.vox.hero === id` (đã chạy chung một đường), riêng Sói (dạng thú) và Nhện Đồng (chân máy) phải xem lại; 7 loại zombie + quái đặc biệt + 6 boss có thân riêng phải thêm đường voxel cho `zExtras`/rig; 5 toà nhà còn lại + tường bao + xe, tăng đưa vào lưới (cỡ 2 đến 3 triệu voxel, cần chia vùng và ngủ vùng xa); súng góc nhìn thứ nhất; thay hẳn `destruct.js` cho vùng voxel; cửa; đồng bộ bậc voxel trong phòng co-op; đo trên điện thoại thật.

## Lệnh

```sh
export PLAYWRIGHT_PATH="C:/Users/tamph/.cache/pw-node/node_modules/playwright-core"
cd /d/hub-bzvox
node games/blockade-z/tools/voxshots.js            # ảnh trước/sau + 3 ảnh ghép vào games/blockade-z/.vox-shots
node games/blockade-z/tools/voxcoop.js             # co-op: cùng lệnh, cùng digest
node games/blockade-z/tools/voxperf.js             # ms/khung + đường đi;  SWIFT=1 để đo SwiftShader
for t in smoke zoo kits stuck destruct tps; do node games/blockade-z/tools/$t.js games/blockade-z/.vox-shots/chk/$t; done
BZ_QUERY="autostart=1&nolock=1&seed=7&vox=1" node games/blockade-z/tools/smoke.js   # smoke với cờ bật
```

Chơi thử: mở `games/blockade-z/index.html?vox=1` qua một static server ở gốc repo (`tp=1` để thấy thân nhân vật). Dãy phố voxel ở góc tây bắc quảng trường (`__setShot('shops')`).

Sparse checkout của worktree này đã thêm `tools/` và `assets/favicon.svg` (cần cho các tool test).
